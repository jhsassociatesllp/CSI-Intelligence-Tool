"""
CSI Intelligence — Compliance Signals Intelligence Backend
JHS & Associates LLP — Agentic Pipeline v2.0
8 Specialist Agents + Real-Time SSE Streaming
"""
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from openai import AsyncOpenAI
from bson import ObjectId
from bson.errors import InvalidId
import os, json, shutil, asyncio
from dotenv import load_dotenv
from datetime import datetime
from typing import Optional, List, AsyncGenerator
import logging

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── App & DB ──────────────────────────────────────────────
app = FastAPI(title="CSI Intelligence API", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

MONGODB_URL    = os.getenv("MONGODB_URL",   "mongodb://localhost:27017")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
mongo_client   = AsyncIOMotorClient(MONGODB_URL)
db             = mongo_client.csi_intelligence
openai_client  = AsyncOpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
UPLOAD_DIR     = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ── Utilities ─────────────────────────────────────────────
def serialize(doc):
    if doc is None: return None
    doc = dict(doc)
    if "_id" in doc: doc["_id"] = str(doc["_id"])
    return doc

def to_object_id(id_str):
    try: return ObjectId(id_str)
    except: raise HTTPException(status_code=400, detail=f"Invalid ID: {id_str}")

# ── GPT helpers ───────────────────────────────────────────
async def call_gpt(system_prompt, user_prompt, max_tokens=2000):
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")
    r = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role":"system","content":system_prompt},
                  {"role":"user","content":user_prompt}],
        temperature=0.3, max_tokens=max_tokens,
        response_format={"type":"json_object"})
    return json.loads(r.choices[0].message.content)

async def web_search(query, context_size="high"):
    if not OPENAI_API_KEY: return "[No API key]"
    try:
        r = await openai_client.chat.completions.create(
            model="gpt-4o-search-preview",
            web_search_options={"search_context_size": context_size},
            messages=[{"role":"user","content":query}],
            max_tokens=3000)
        return r.choices[0].message.content or ""
    except Exception as e:
        logger.warning(f"Web search unavailable: {e}")
        return f"[Web search unavailable — {str(e)[:120]}]"

# ── SSE emitters ──────────────────────────────────────────
async def emit(q, agent_id, status, message, detail="", findings=None):
    ev = {"type":"agent_update","agent_id":agent_id,"status":status,
          "message":message,"detail":detail,
          "timestamp":datetime.utcnow().strftime("%H:%M:%S")}
    if findings is not None: ev["findings"] = findings
    await q.put(ev); await asyncio.sleep(0.06)

async def log(q, text):
    await q.put({"type":"log","text":text,
                 "timestamp":datetime.utcnow().strftime("%H:%M:%S")})
    await asyncio.sleep(0.04)

# ════════════════════════════════════════════════════════
# AGENT 1 — ORCHESTRATOR
# ════════════════════════════════════════════════════════
async def agent_orchestrator(company, items, q):
    await emit(q,"orchestrator","running","Reading company profile & compliance records",
               f"{company['name']} · {company.get('industry','N/A')}")
    await log(q, f"Orchestrator: Profiling {company['name']} — {len(items)} internal items found")

    sys_ = "You are the orchestrator agent of a compliance AI pipeline. Create a focused research plan. JSON only."
    usr  = f"""Company: {company['name']}
Industry: {company.get('industry','N/A')} | CIN: {company.get('cin','N/A')}
Listing: {company.get('listing_status','Unknown')} | Competitors: {', '.join(company.get('competitors',[]))}
Internal items count: {len(items)}
Sample: {json.dumps([{{'title':i.get('title'),'status':i.get('status'),'framework':i.get('framework','')}} for i in items[:8]],default=str)}

Return JSON:
{{
  "primary_regulators": ["most relevant e.g. RBI, SEBI, MCA, IRDAI, IT Dept, GST"],
  "risk_areas": ["specific risk areas based on industry"],
  "rbi_mca_focus": "2-sentence search focus for RBI/MCA researcher",
  "sebi_exchange_focus": "2-sentence search focus for SEBI/Exchange researcher",
  "tax_media_focus": "2-sentence search focus for Tax & News researcher",
  "key_themes": ["compliance themes to watch"]
}}"""
    try:
        plan = await call_gpt(sys_, usr, max_tokens=800)
        regs = ", ".join(plan.get("primary_regulators",[])[:4])
        await emit(q,"orchestrator","done",
                   f"Research plan ready · {len(plan.get('risk_areas',[]))} risk areas",
                   f"Regulators in scope: {regs}")
        await log(q, f"Orchestrator: Plan complete — regulators: {regs}")
        return plan
    except Exception as e:
        await emit(q,"orchestrator","error",f"Planning failed: {str(e)[:80]}")
        return {"rbi_mca_focus":f"regulatory penalties against {company['name']}",
                "sebi_exchange_focus":f"SEBI orders for {company['name']}",
                "tax_media_focus":f"tax and news coverage of {company['name']}",
                "primary_regulators":["RBI","SEBI","MCA"]}

# ════════════════════════════════════════════════════════
# AGENT 2a — RBI & MCA RESEARCHER
# ════════════════════════════════════════════════════════
async def agent_researcher_rbi(company, plan, q):
    name  = company["name"]
    focus = plan.get("rbi_mca_focus", f"regulatory penalties against {name}")
    await emit(q,"researcher_rbi","running","Searching RBI press releases & MCA orders",
               "Querying rbi.org.in · mca.gov.in · Parliamentary disclosures")
    await log(q, f"RBI/MCA Researcher: Searching — {focus[:80]}...")

    query = f"""Find ALL regulatory enforcement actions by RBI and MCA against {name} (India).
Search: rbi.org.in penalty orders, Section 47A/35A directions, Banking Regulation Act violations;
mca.gov.in compounding orders, director disqualifications, NCLT orders;
Parliamentary Lok Sabha/Rajya Sabha replies mentioning {name} and penalties; FEMA/Enforcement Directorate orders.
Focus: {focus} | Time: January 2019 to present.
For each: exact date · regulation violated · penalty amount/action · direct source URL · business impact. Be exhaustive."""

    result = await web_search(query)
    lines  = len([l for l in result.split("\n") if l.strip()])
    await emit(q,"researcher_rbi","done",f"RBI & MCA research complete · {lines} data points",
               "Covered penalty orders, compounding, NCLT, parliamentary disclosures", findings=lines)
    await log(q, f"RBI/MCA Researcher: Done — {lines} data points collected")
    return result

# ════════════════════════════════════════════════════════
# AGENT 2b — SEBI & EXCHANGE RESEARCHER
# ════════════════════════════════════════════════════════
async def agent_researcher_sebi(company, plan, q):
    name  = company["name"]
    focus = plan.get("sebi_exchange_focus", f"SEBI enforcement for {name}")
    await emit(q,"researcher_sebi","running","Searching SEBI orders & exchange filings",
               "Querying sebi.gov.in · bseindia.com · nseindia.com")
    await log(q, f"SEBI Researcher: Scanning enforcement orders & LODR filings for {name}...")

    query = f"""Find ALL SEBI and stock exchange regulatory actions against {name} (India).
Search: sebi.gov.in adjudication orders, settlement orders, enforcement actions, show-cause notices;
bseindia.com disclosure violations, listing compliance notices; nseindia.com trading notices;
SEBI LODR violations (Reg 33 results, Reg 23 RPT, Reg 9 insider trading);
SEBI ICDR violations — IPO/rights issue compliance.
Focus: {focus} | Time: January 2019 to present.
For each: date · SEBI Regulation number · penalty/action · direct URL · case/order number."""

    result = await web_search(query)
    lines  = len([l for l in result.split("\n") if l.strip()])
    await emit(q,"researcher_sebi","done",f"SEBI & Exchange research complete · {lines} data points",
               "Covered adjudication orders, LODR filings, exchange notices", findings=lines)
    await log(q, f"SEBI Researcher: Done — {lines} data points collected")
    return result

# ════════════════════════════════════════════════════════
# AGENT 2c — TAX & MEDIA RESEARCHER
# ════════════════════════════════════════════════════════
async def agent_researcher_tax(company, plan, q):
    name     = company["name"]
    industry = company.get("industry","")
    focus    = plan.get("tax_media_focus", f"tax and news coverage of {name}")
    await emit(q,"researcher_tax","running","Searching tax authorities & financial media",
               "Querying IT Dept · GST · FEMA · Business Standard · Economic Times")
    await log(q, f"Tax/Media Researcher: Scanning IT, GST, FEMA, and press archives for {name}...")

    query = f"""Find compliance violations and news for {name} ({industry}, India).
Search: Income Tax demand orders, TDS defaults Section 200/271, ITAT orders;
GST/CGST penalty orders, ITC disputes, AAR rulings;
Enforcement Directorate FEMA violation orders, forex penalties;
Financial media (Business Standard, Economic Times, Mint, Moneycontrol, LiveMint) — search "{name} penalty" "{name} violation" "{name} regulatory action" "{name} notice".
Focus: {focus} | Time: January 2019 to present.
For each: date · authority · violation · penalty amount · direct article/order URL."""

    result = await web_search(query)
    lines  = len([l for l in result.split("\n") if l.strip()])
    await emit(q,"researcher_tax","done",f"Tax & Media research complete · {lines} data points",
               "Covered Income Tax, GST, FEMA, financial press archives", findings=lines)
    await log(q, f"Tax/Media Researcher: Done — {lines} data points collected")
    return result

# ════════════════════════════════════════════════════════
# AGENT 3 — DATA EXTRACTOR
# ════════════════════════════════════════════════════════
async def agent_extractor(company, rbi, sebi, tax, q):
    await emit(q,"extractor","running","Structuring raw research into 9-field incident data",
               "Applying 11-Step Compliance Planning Framework extraction template")
    await log(q,"Extractor: Processing raw research from all 3 researchers...")

    combined = f"=== RBI & MCA ===\n{rbi}\n\n=== SEBI & EXCHANGE ===\n{sebi}\n\n=== TAX & MEDIA ===\n{tax}"
    sys_ = ("You are a data extractor following the 11-Step Compliance Planning Framework. "
            "Extract each non-compliance incident into the mandatory 9-field format. "
            "Use REAL URLs from the research — never fabricate. Mark inferred root causes. Deduplicate. JSON only.")
    usr  = f"""Extract all compliance incidents for {company['name']} from this research:
{combined}

Return JSON:
{{
  "total_found": <number>,
  "incidents": [
    {{
      "id": 1,
      "date": "<date>",
      "nature": "<specific non-compliance>",
      "regulator": "<RBI|SEBI|MCA|IT Dept|GST|FEMA|IRDAI|Exchange>",
      "penalty_action": "<exact penalty/action>",
      "business_implication": "<financial, operational, reputational impact>",
      "root_cause": "<explicit or inferred reason>",
      "root_cause_inferred": <true|false>,
      "classification": "<Regulatory|Governance|Financial|ESG>",
      "severity": "<High|Medium|Low>",
      "severity_rationale": "<rationale>",
      "legal_section": "<primary section e.g. Section 47A(1)(c) Banking Regulation Act 1949>",
      "sources": [
        {{
          "title": "<source title e.g. RBI Press Release Oct 2023>",
          "url": "<real URL from research>",
          "type": "<Official|Filing|Media>",
          "url_approximate": <false if exact, true if base URL only>
        }}
      ]
    }}
  ]
}}"""

    await log(q,"Extractor: Running 9-field extraction on combined research data...")
    try:
        result = await call_gpt(sys_, usr, max_tokens=5000)
        n = result.get("total_found", len(result.get("incidents",[])))
        await emit(q,"extractor","done",f"Extracted {n} incidents with sources",
                   "9-field structure complete · sources mapped", findings=n)
        await log(q, f"Extractor: {n} unique incidents extracted and structured")
        return result
    except Exception as e:
        await emit(q,"extractor","error",f"Extraction failed: {str(e)[:80]}")
        await log(q, f"Extractor ERROR: {str(e)[:120]}")
        return {"total_found":0,"incidents":[]}

# ════════════════════════════════════════════════════════
# AGENT 4 — VERIFIER & FACT-CHECKER
# ════════════════════════════════════════════════════════
async def agent_verifier(company, extracted, q):
    incidents = extracted.get("incidents",[])
    await emit(q,"verifier","running",f"Fact-checking {len(incidents)} incidents",
               "Verifying section numbers · penalty amounts · URL validity")
    await log(q, f"Verifier: Cross-checking {len(incidents)} incidents for accuracy...")
    if not incidents:
        await emit(q,"verifier","done","No incidents to verify","")
        return extracted

    sys_ = ("You are the verifier agent — a senior compliance reviewer at JHS & Associates LLP. "
            "Quality-check: verify section numbers, flag logical errors, assign confidence scores, expand citations. JSON only.")
    usr  = f"""Verify compliance incidents for {company['name']}:
{json.dumps(incidents, indent=2, default=str)}

Check: Is legal_section specific enough? Is penalty consistent with violation? Is severity defensible?
Return JSON:
{{
  "verified_incidents": [
    {{
      ...all original fields...,
      "confidence_score": <0-100>,
      "verification_notes": "<corrections or concerns>",
      "legal_section_full": "<fully expanded citation: Act + Section + Sub-section + Rule>"
    }}
  ],
  "verification_summary": {{
    "total_verified": <n>, "high_confidence": <n score>=80>,
    "flagged": <n score<60>, "corrections_made": <n>
  }}
}}"""

    await log(q,"Verifier: Validating legal citations and cross-checking penalty provisions...")
    try:
        result = await call_gpt(sys_, usr, max_tokens=4000)
        s      = result.get("verification_summary",{})
        v      = s.get("total_verified", len(result.get("verified_incidents",[])))
        hc     = s.get("high_confidence",0)
        fl     = s.get("flagged",0)
        cr     = s.get("corrections_made",0)
        await emit(q,"verifier","done",f"{v} verified · {hc} high-confidence",
                   f"{fl} flagged · {cr} corrections applied")
        await log(q, f"Verifier: {v} incidents verified, {hc} high-confidence, {cr} corrections")
        return result
    except Exception as e:
        await emit(q,"verifier","error",f"Verification failed: {str(e)[:80]}")
        await log(q, f"Verifier ERROR: {str(e)[:120]}")
        return extracted

# ════════════════════════════════════════════════════════
# AGENT 5 — PATTERN ANALYST
# ════════════════════════════════════════════════════════
async def agent_analyst(company, verified, items, q):
    incidents = verified.get("verified_incidents", verified.get("incidents",[]))
    await emit(q,"analyst","running",f"Detecting patterns across {len(incidents)} incidents",
               "Identifying repeat violations · systemic weaknesses · risk themes")
    await log(q, f"Analyst: Running pattern detection on {len(incidents)} verified incidents...")

    sys_ = ("You are the pattern analysis agent — specialist in systemic compliance risk at JHS & Associates LLP. "
            "Identify patterns that individual incident review misses. JSON only.")
    usr  = f"""Analyze verified compliance incidents for {company['name']}:
INCIDENTS: {json.dumps(incidents[:20], indent=2, default=str)}
INTERNAL COMPLIANCE: {json.dumps([{{'title':i.get('title'),'status':i.get('status'),'framework':i.get('framework','')}} for i in items[:15]], default=str)}

Return JSON:
{{
  "risk_level": "High|Medium|Low",
  "overall_score": <0-100 higher=healthier>,
  "risk_summary": "<3-4 sentence executive summary of compliance posture>",
  "repeat_violations": [
    {{"violation":"<type>","first_occurrence":"<date/ref>","recurrence":"<date/ref>","frequency":"<how many times>","pattern_analysis":"<root cause of recurrence>"}}
  ],
  "systemic_weaknesses": [
    {{"area":"<e.g. IT Risk, Vendor Oversight, Loan Ops>","weakness":"<specific control gap>","evidence":"<which incidents>","related_incident_ids":[1,2]}}
  ],
  "key_risk_themes": [
    {{"rank":1,"theme":"<title>","description":"<2-3 sentences on significance>","related_incident_ids":[1,3],"trend":"Improving|Stable|Worsening"}}
  ],
  "early_warning_signals": [
    {{"signal":"<forward-looking warning>","area":"<area>","recommended_action":"<specific action>","timeline":"<urgency>",
      "legal_references":[{{"citation":"<exact section/rule>","description":"<what it requires>","url":"<regulatory URL>"}}]}}
  ],
  "strengths": ["<genuine compliance strength 1>","<strength 2>"]
}}"""

    await log(q,"Analyst: Mapping repeat violations and systemic control weaknesses...")
    try:
        result = await call_gpt(sys_, usr, max_tokens=3000)
        t = len(result.get("key_risk_themes",[]))
        r = len(result.get("repeat_violations",[]))
        w = len(result.get("systemic_weaknesses",[]))
        await emit(q,"analyst","done",f"{t} risk themes · {r} repeat patterns · {w} systemic weaknesses",
                   f"Overall risk: {result.get('risk_level','?')} · Score: {result.get('overall_score','?')}/100")
        await log(q, f"Analyst: {t} themes, {r} repeat patterns, {w} systemic weaknesses identified")
        return result
    except Exception as e:
        await emit(q,"analyst","error",f"Analysis failed: {str(e)[:80]}")
        await log(q, f"Analyst ERROR: {str(e)[:120]}")
        return {"risk_level":"Unknown","overall_score":0,"risk_summary":"Analysis incomplete",
                "repeat_violations":[],"systemic_weaknesses":[],"key_risk_themes":[],
                "early_warning_signals":[],"strengths":[]}

# ════════════════════════════════════════════════════════
# AGENT 6 — REPORT WRITER
# ════════════════════════════════════════════════════════
async def agent_reporter(company, verified, analysis, q):
    incidents = verified.get("verified_incidents", verified.get("incidents",[]))
    await emit(q,"reporter","running","Compiling final board-ready compliance report",
               "Writing regulatory priorities · recommendations · action plan")
    await log(q,"Reporter: Writing regulatory priorities and JHS recommendations...")

    sys_ = "You are the report writing agent at JHS & Associates LLP. Compile all agent findings into the final structured report. JSON only."
    usr  = f"""Compile final compliance report for {company['name']}.
VERIFIED INCIDENTS ({len(incidents)}): {json.dumps(incidents[:15], indent=2, default=str)}
PATTERN ANALYSIS: {json.dumps(analysis, indent=2, default=str)}

Return complete JSON:
{{
  "risk_level": "{analysis.get('risk_level','Medium')}",
  "overall_score": {analysis.get('overall_score',50)},
  "risk_summary": <from analysis — 3-4 sentences>,
  "total_incidents": {len(incidents)},
  "data_sources_searched": ["RBI Press Releases","SEBI Orders","BSE/NSE Filings","MCA Portal","Income Tax Records","GST Authority","FEMA/ED Orders","Financial Media"],
  "incident_log": <verified incidents array — all fields intact>,
  "repeat_violations": <from analysis>,
  "systemic_weaknesses": <from analysis>,
  "key_risk_themes": <from analysis>,
  "early_warning_signals": <from analysis>,
  "strengths": <from analysis>,
  "regulatory_priorities": [
    {{"rank":1,"action":"<specific urgent action>","framework":"<framework>","deadline":"<date or timeframe>",
      "owner":"<Board|MD|CFO|Company Secretary|Legal Team>","legal_reference":"<exact section/regulation>","reference_url":"<URL>"}}
  ],
  "recommendations": [
    {{"category":"<e.g. IT Governance, Vendor Management>","recommendation":"<detailed specific recommendation>",
      "priority":"Immediate|Short-term|Long-term","legal_basis":"<exact sections>","reference_url":"<URL>"}}
  ]
}}"""

    await log(q,"Reporter: Finalising report structure and cross-linking all findings...")
    try:
        result = await call_gpt(sys_, usr, max_tokens=5000)
        if not result.get("incident_log") and incidents:
            result["incident_log"] = incidents
        for k in ["repeat_violations","systemic_weaknesses","key_risk_themes","early_warning_signals","strengths"]:
            if not result.get(k) and analysis.get(k):
                result[k] = analysis[k]
        recs = len(result.get("recommendations",[]))
        pris = len(result.get("regulatory_priorities",[]))
        await emit(q,"reporter","done",f"Report complete · {recs} recommendations · {pris} priorities",
                   "Board-ready compliance report compiled")
        await log(q, f"Reporter: Done — {len(incidents)} incidents, {recs} recs, {pris} priorities")
        return result
    except Exception as e:
        await emit(q,"reporter","error",f"Report generation failed: {str(e)[:80]}")
        await log(q, f"Reporter ERROR: {str(e)[:120]}")
        return {**analysis,"incident_log":incidents,"total_incidents":len(incidents),
                "data_sources_searched":["RBI","SEBI","MCA","Media"],
                "regulatory_priorities":[],"recommendations":[]}

# ════════════════════════════════════════════════════════
# MASTER PIPELINE
# ════════════════════════════════════════════════════════
async def run_agent_pipeline(company, items, q):
    try:
        company_id    = str(company["_id"])
        company["_id"] = company_id
        await log(q, f"Pipeline started for {company['name']} at {datetime.utcnow().strftime('%H:%M:%S')} UTC")

        plan = await agent_orchestrator(company, items, q)

        await log(q,"Launching 3 research agents in parallel...")
        results   = await asyncio.gather(
            agent_researcher_rbi(company, plan, q),
            agent_researcher_sebi(company, plan, q),
            agent_researcher_tax(company, plan, q),
            return_exceptions=True)
        rbi_data  = results[0] if not isinstance(results[0],  Exception) else ""
        sebi_data = results[1] if not isinstance(results[1], Exception) else ""
        tax_data  = results[2] if not isinstance(results[2],  Exception) else ""
        await log(q,"All 3 researchers done — consolidating findings...")

        extracted = await agent_extractor(company, rbi_data, sebi_data, tax_data, q)
        verified  = await agent_verifier(company, extracted, q)
        analysis  = await agent_analyst(company, verified, items, q)
        final     = await agent_reporter(company, verified, analysis, q)

        doc = {"company_id":company_id,"company_name":company["name"],
               "analysis":final,"items_analyzed":len(items),"web_research_used":True,
               "framework_version":"11-Step CPF v2.0 — Agentic Pipeline",
               "pipeline_agents":["orchestrator","researcher_rbi","researcher_sebi",
                                   "researcher_tax","extractor","verifier","analyst","reporter"],
               "created_at":datetime.utcnow().isoformat()}
        res       = await db.analyses.insert_one(doc)
        doc["_id"] = str(res.inserted_id)
        await log(q, f"Analysis saved — DB ID: {doc['_id']}")
        await q.put({"type":"complete","data":doc,"timestamp":datetime.utcnow().strftime("%H:%M:%S")})

    except Exception as e:
        logger.error(f"Pipeline error: {e}", exc_info=True)
        await log(q, f"PIPELINE ERROR: {str(e)}")
        await q.put({"type":"error","message":str(e),"timestamp":datetime.utcnow().strftime("%H:%M:%S")})

# ── SSE Endpoint ──────────────────────────────────────────
@app.get("/api/analysis/stream")
async def stream_analysis(company_id: str):
    company = await db.companies.find_one({"_id": to_object_id(company_id)})
    if not company: raise HTTPException(status_code=404, detail="Company not found")
    items = []
    async for item in db.compliance.find({"company_id": company_id}):
        items.append(serialize(item))
    q: asyncio.Queue = asyncio.Queue()

    async def event_stream() -> AsyncGenerator[str, None]:
        task = asyncio.create_task(run_agent_pipeline(company, items, q))
        try:
            while True:
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=240.0)
                    yield f"data: {json.dumps(ev, default=str)}\n\n"
                    if ev.get("type") in ("complete","error"): break
                except asyncio.TimeoutError:
                    yield f"data: {json.dumps({'type':'error','message':'Pipeline timed out after 4 minutes'})}\n\n"
                    break
        finally:
            if not task.done(): task.cancel()

    return StreamingResponse(event_stream(), media_type="text/event-stream",
        headers={"Cache-Control":"no-cache","Connection":"keep-alive","X-Accel-Buffering":"no"})

@app.get("/api/analysis")
async def list_analyses(company_id: Optional[str] = Query(None)):
    query = {}
    if company_id: query["company_id"] = company_id
    results = []
    async for item in db.analyses.find(query).sort("created_at",-1).limit(10):
        results.append(serialize(item))
    return results

# ── Pydantic Models ───────────────────────────────────────
class CompanyCreate(BaseModel):
    name: str; industry: str
    cin: Optional[str] = ""; pan: Optional[str] = ""
    competitors: List[str] = []; description: Optional[str] = ""
    listing_status: Optional[str] = "Listed"

class ComplianceItemCreate(BaseModel):
    company_id: str; category: str; sub_category: Optional[str] = ""
    title: str; description: Optional[str] = ""; due_date: str
    status: str = "pending"; priority: str = "medium"
    responsible_person: Optional[str] = ""; section_reference: Optional[str] = ""
    notes: Optional[str] = ""

# ── Dashboard ─────────────────────────────────────────────
@app.get("/api/dashboard")
async def get_dashboard(company_id: Optional[str] = Query(None)):
    query = {}
    if company_id: query["company_id"] = company_id
    total_companies = await db.companies.count_documents({})
    total_items     = await db.compliance.count_documents(query)
    compliant       = await db.compliance.count_documents({**query,"status":"compliant"})
    pending         = await db.compliance.count_documents({**query,"status":"pending"})
    non_compliant   = await db.compliance.count_documents({**query,"status":"non-compliant"})
    total_docs      = await db.documents.count_documents(query)
    categories = {}
    async for item in db.compliance.find(query):
        cat = item.get("category","Other"); status = item.get("status","pending")
        if cat not in categories: categories[cat] = {"compliant":0,"pending":0,"non-compliant":0,"total":0}
        categories[cat][status] = categories[cat].get(status,0)+1; categories[cat]["total"]+=1
    now = datetime.utcnow(); upcoming = []
    async for item in db.compliance.find({**query,"status":{"$ne":"compliant"}}):
        due = item.get("due_date","")
        if due:
            try:
                due_dt = datetime.fromisoformat(due); days_left = (due_dt-now).days
                if 0 <= days_left <= 30:
                    d = serialize(item); d["days_left"]=days_left; upcoming.append(d)
            except: pass
    upcoming.sort(key=lambda x:x.get("days_left",999))
    return {"total_companies":total_companies,"total_items":total_items,"compliant":compliant,
            "pending":pending,"non_compliant":non_compliant,"total_documents":total_docs,
            "categories":categories,"upcoming_deadlines":upcoming[:5]}

# ── Companies ─────────────────────────────────────────────
@app.get("/api/companies")
async def list_companies():
    companies=[]
    async for c in db.companies.find().sort("name",1): companies.append(serialize(c))
    return companies

@app.post("/api/companies",status_code=201)
async def create_company(company: CompanyCreate):
    doc={**company.model_dump(),"created_at":datetime.utcnow().isoformat()}
    result=await db.companies.insert_one(doc)
    return serialize(await db.companies.find_one({"_id":result.inserted_id}))

@app.get("/api/companies/{company_id}")
async def get_company(company_id:str):
    c=await db.companies.find_one({"_id":to_object_id(company_id)})
    if not c: raise HTTPException(status_code=404,detail="Company not found")
    return serialize(c)

@app.put("/api/companies/{company_id}")
async def update_company(company_id:str,company:CompanyCreate):
    await db.companies.update_one({"_id":to_object_id(company_id)},
        {"$set":{**company.model_dump(),"updated_at":datetime.utcnow().isoformat()}})
    return serialize(await db.companies.find_one({"_id":to_object_id(company_id)}))

@app.delete("/api/companies/{company_id}")
async def delete_company(company_id:str):
    await db.companies.delete_one({"_id":to_object_id(company_id)})
    return {"message":"Company deleted"}

# ── Compliance ────────────────────────────────────────────
@app.get("/api/compliance")
async def list_compliance(company_id: Optional[str]=Query(None)):
    query={}
    if company_id: query["company_id"]=company_id
    items=[]
    async for item in db.compliance.find(query).sort("due_date",1): items.append(serialize(item))
    return items

@app.post("/api/compliance",status_code=201)
async def create_compliance(item:ComplianceItemCreate):
    doc={**item.model_dump(),"created_at":datetime.utcnow().isoformat()}
    result=await db.compliance.insert_one(doc)
    return serialize(await db.compliance.find_one({"_id":result.inserted_id}))

@app.put("/api/compliance/{item_id}")
async def update_compliance(item_id:str,item:ComplianceItemCreate):
    await db.compliance.update_one({"_id":to_object_id(item_id)},
        {"$set":{**item.model_dump(),"updated_at":datetime.utcnow().isoformat()}})
    return serialize(await db.compliance.find_one({"_id":to_object_id(item_id)}))

@app.delete("/api/compliance/{item_id}")
async def delete_compliance(item_id:str):
    await db.compliance.delete_one({"_id":to_object_id(item_id)}); return {"message":"Item deleted"}

@app.post("/api/compliance/seed/{company_id}")
async def seed_compliance(company_id:str):
    company=await db.companies.find_one({"_id":to_object_id(company_id)})
    if not company: raise HTTPException(status_code=404,detail="Company not found")
    today=datetime.utcnow()
    def d(months=0,day=None):
        import calendar
        m=today.month+months; y=today.year+(m-1)//12; m=((m-1)%12)+1
        if day is None: day=min(today.day,calendar.monthrange(y,m)[1])
        return datetime(y,m,day).isoformat()
    templates=[
        {"category":"Companies Act 2013","title":"Annual General Meeting (AGM)","due_date":d(6),"priority":"high","section_reference":"Section 96"},
        {"category":"Companies Act 2013","title":"Board Meeting (Quarterly)","due_date":d(1),"priority":"high","section_reference":"Section 173"},
        {"category":"Companies Act 2013","title":"Annual Return (MGT-7)","due_date":d(6),"priority":"high","section_reference":"Section 92"},
        {"category":"Companies Act 2013","title":"Financial Statements Filing (AOC-4)","due_date":d(6),"priority":"high","section_reference":"Section 137"},
        {"category":"Companies Act 2013","title":"CSR Report (if applicable)","due_date":d(3),"priority":"medium","section_reference":"Section 135"},
        {"category":"Companies Act 2013","title":"Director KYC (DIR-3 KYC)","due_date":d(3),"priority":"medium","section_reference":"Rule 12A"},
        {"category":"SEBI LODR","title":"Quarterly Financial Results","due_date":d(1),"priority":"high","section_reference":"Regulation 33"},
        {"category":"SEBI LODR","title":"Corporate Governance Report (Q)","due_date":d(1),"priority":"high","section_reference":"Regulation 27"},
        {"category":"SEBI LODR","title":"Related Party Transaction Disclosure","due_date":d(2),"priority":"high","section_reference":"Regulation 23"},
        {"category":"SEBI LODR","title":"Insider Trading Policy Update","due_date":d(3),"priority":"medium","section_reference":"Regulation 9"},
        {"category":"SEBI LODR","title":"Annual Report Submission","due_date":d(5),"priority":"high","section_reference":"Regulation 34"},
        {"category":"Income Tax/GST","title":"TDS Return (Form 24Q/26Q)","due_date":d(1,31),"priority":"high","section_reference":"Section 200"},
        {"category":"Income Tax/GST","title":"Advance Tax Payment (Q)","due_date":d(1,15),"priority":"high","section_reference":"Section 208"},
        {"category":"Income Tax/GST","title":"GST Monthly Return (GSTR-1)","due_date":d(1,11),"priority":"high","section_reference":"Section 37 CGST"},
        {"category":"Income Tax/GST","title":"GST Monthly Payment (GSTR-3B)","due_date":d(1,20),"priority":"high","section_reference":"Section 39 CGST"},
        {"category":"Income Tax/GST","title":"Income Tax Return Filing","due_date":d(4,31),"priority":"high","section_reference":"Section 139"},
        {"category":"Income Tax/GST","title":"GST Annual Return (GSTR-9)","due_date":d(8,31),"priority":"medium","section_reference":"Section 44 CGST"},
        {"category":"FEMA/RBI","title":"FEMA Annual Return (FLA)","due_date":d(0,15),"priority":"high","section_reference":"FEMA 20R"},
        {"category":"FEMA/RBI","title":"ECB Reporting (Form ECB-2)","due_date":d(1,7),"priority":"medium","section_reference":"FEMA 3R"},
        {"category":"FEMA/RBI","title":"RBI Monthly Return (if applicable)","due_date":d(1,15),"priority":"medium","section_reference":"RBI Master Direction"},
        {"category":"Companies Act 2013","title":"Statutory Audit Completion","due_date":d(4),"priority":"high","section_reference":"Section 143"},
        {"category":"SEBI ICDR","title":"Post-Issue Compliance Report","due_date":d(2),"priority":"medium","section_reference":"Regulation 76 ICDR"},
        {"category":"Companies Act 2013","title":"Secretarial Audit (MR-3)","due_date":d(5),"priority":"medium","section_reference":"Section 204"},
    ]
    docs=[{**t,"company_id":company_id,"status":"pending","responsible_person":"","notes":"",
           "description":f"Mandatory {t['category']} compliance obligation","sub_category":"",
           "created_at":datetime.utcnow().isoformat()} for t in templates]
    await db.compliance.insert_many(docs)
    return {"message":f"Seeded {len(docs)} compliance items","count":len(docs)}

# ── Executive Summary ─────────────────────────────────────
@app.post("/api/summary")
async def generate_summary(data:dict):
    company_id=data.get("company_id")
    if not company_id: raise HTTPException(status_code=400,detail="company_id required")
    company=await db.companies.find_one({"_id":to_object_id(company_id)})
    if not company: raise HTTPException(status_code=404,detail="Company not found")
    items=[]
    async for item in db.compliance.find({"company_id":company_id}): items.append(serialize(item))
    latest=await db.analyses.find_one({"company_id":company_id},sort=[("created_at",-1)])
    analysis_data=latest.get("analysis",{}) if latest else {}
    compliant_count=sum(1 for i in items if i.get("status")=="compliant")
    pending_count=sum(1 for i in items if i.get("status")=="pending")
    nc_count=sum(1 for i in items if i.get("status")=="non-compliant")
    health_pct=round(compliant_count/len(items)*100) if items else 0
    sys_="You are a senior Partner at JHS & Associates LLP preparing board-level executive summaries. JSON only."
    usr=f"""Generate Executive Compliance Summary for {company['name']}.
COMPANY: {company['name']} | {company.get('industry')} | {company.get('listing_status','Listed')}
CIN: {company.get('cin','N/A')} | DATE: {datetime.utcnow().strftime('%d %B %Y')}
METRICS: Total {len(items)} | Compliant {compliant_count} ({health_pct}%) | Pending {pending_count} | Non-Compliant {nc_count}
DATA: {json.dumps(items[:20],indent=2,default=str)}
ANALYSIS: {json.dumps(analysis_data,indent=2,default=str)}
Return JSON: {{"report_date":"{datetime.utcnow().strftime('%d %B %Y')}","health_score":{health_pct},"overall_status":"Satisfactory|Needs Attention|Critical","executive_overview":"<3-4 para board narrative>","key_metrics":{{"total_items":{len(items)},"compliant":{compliant_count},"pending":{pending_count},"non_compliant":{nc_count},"compliance_rate":"{health_pct}%","critical_deadlines_30days":"<n>"}},"framework_status":[{{"framework":"<name>","status":"Green|Amber|Red","items":"<n>","issues":"<summary>"}}],"critical_areas":[{{"area":"<area>","risk":"High|Medium|Low","finding":"<finding>","action_required":"<action>","deadline":"<date>"}}],"governance_gaps":[{{"gap":"<gap>","impact":"<impact>","recommendation":"<action>"}}],"immediate_actions":[{{"priority":1,"action":"<action>","responsible":"<who>","deadline":"<date>","consequence_if_delayed":"<consequence>"}}],"compliance_calendar_90days":[{{"date":"<date>","obligation":"<obligation>","framework":"<framework>","priority":"High|Medium|Low"}}],"jhs_recommendations":[{{"category":"<cat>","recommendation":"<rec>","timeline":"<timeline>"}}],"disclaimer":"Prepared by JHS & Associates LLP."}}"""
    try:
        summary_data=await call_gpt(sys_,usr,max_tokens=4000)
    except Exception as e:
        raise HTTPException(status_code=500,detail=f"Summary failed: {str(e)}")
    doc={"company_id":company_id,"company_name":company["name"],"summary":summary_data,"created_at":datetime.utcnow().isoformat()}
    await db.summaries.insert_one(doc); return serialize(doc)

@app.get("/api/summary")
async def list_summaries(company_id:Optional[str]=Query(None)):
    query={}
    if company_id: query["company_id"]=company_id
    results=[]
    async for item in db.summaries.find(query).sort("created_at",-1).limit(10): results.append(serialize(item))
    return results

# ── Benchmarking ──────────────────────────────────────────
@app.post("/api/benchmarking")
async def run_benchmarking(data:dict):
    company_id=data.get("company_id")
    if not company_id: raise HTTPException(status_code=400,detail="company_id required")
    company=await db.companies.find_one({"_id":to_object_id(company_id)})
    if not company: raise HTTPException(status_code=404,detail="Company not found")
    competitors=company.get("competitors",[])
    if not competitors: raise HTTPException(status_code=400,detail="No competitors configured")
    items=[]
    async for item in db.compliance.find({"company_id":company_id}): items.append(serialize(item))
    comp1=competitors[0] if competitors else "Competitor 1"
    comp2=competitors[1] if len(competitors)>1 else "Competitor 2"
    sys_="You are an Indian corporate governance benchmarking specialist at JHS & Associates LLP. JSON only."
    usr=f"""Benchmark {company['name']} vs {comp1} and {comp2}.
Subject: {company['name']} | {company.get('industry')} | {company.get('listing_status','Listed')}
Data: {json.dumps(items[:15],indent=2,default=str)}
Return JSON: {{"company_score":<0-100>,"competitor_scores":[{{"name":"{comp1}","score":<0-100>,"rationale":"<why>"}},{{"name":"{comp2}","score":<0-100>,"rationale":"<why>"}}],"industry_average_score":<0-100>,"comparison_table":[{{"parameter":"<param>","company":{{"value":"<v>","score":<0-10>,"status":"Strong|Average|Weak"}},"{comp1}":{{"value":"<v>","score":<0-10>,"status":"Strong|Average|Weak"}},"{comp2}":{{"value":"<v>","score":<0-10>,"status":"Strong|Average|Weak"}},"industry_benchmark":"<std>"}}],"competitive_strengths":["<s>"],"competitive_gaps":[{{"gap":"<area>","company_position":"<current>","competitor_best":"<name+approach>","improvement_action":"<action>"}}],"peer_insights":[{{"insight":"<finding>","implication":"<meaning>"}}],"ranking":{{"overall":<1|2|3>,"by_framework":{{"Companies Act":<1|2|3>,"SEBI LODR":<1|2|3>,"Risk Management":<1|2|3>,"Disclosures":<1|2|3>}}}},"overall_assessment":"<3-4 sentence assessment>"}}"""
    try: benchmark_data=await call_gpt(sys_,usr,max_tokens=3000)
    except Exception as e: raise HTTPException(status_code=500,detail=f"Benchmarking failed: {str(e)}")
    doc={"company_id":company_id,"company_name":company["name"],"competitors":competitors[:2],"benchmark":benchmark_data,"created_at":datetime.utcnow().isoformat()}
    await db.benchmarks.insert_one(doc); return serialize(doc)

@app.get("/api/benchmarking")
async def list_benchmarks(company_id:Optional[str]=Query(None)):
    query={}
    if company_id: query["company_id"]=company_id
    results=[]
    async for item in db.benchmarks.find(query).sort("created_at",-1).limit(5): results.append(serialize(item))
    return results

# ── Question Bank ─────────────────────────────────────────
@app.post("/api/questions")
async def generate_questions(data:dict):
    company_id=data.get("company_id"); role=data.get("role","director")
    if not company_id: raise HTTPException(status_code=400,detail="company_id required")
    company=await db.companies.find_one({"_id":to_object_id(company_id)})
    if not company: raise HTTPException(status_code=404,detail="Company not found")
    items=[]; 
    async for item in db.compliance.find({"company_id":company_id}): items.append(serialize(item))
    latest=await db.analyses.find_one({"company_id":company_id},sort=[("created_at",-1)])
    findings=latest.get("analysis",{}) if latest else {}
    role_title="Independent Director" if role=="director" else "Internal Auditor"
    focus=("board oversight, governance, strategic risk, management accountability, fiduciary duties" if role=="director"
           else "internal controls, process effectiveness, audit findings, operational risk, control environment")
    sys_=f"You are a senior advisor preparing question banks for {role_title}s at Indian listed companies. JSON only."
    usr=f"""Generate 25 probing questions for the {role_title} of {company['name']} ({company.get('industry')}).
Focus: {focus}
Compliance: {json.dumps(items[:15],indent=2,default=str)}
Findings: {json.dumps(findings,indent=2,default=str)}
Return JSON with "questions" array: [{{"id":1,"category":"Statutory Compliance|Financial Controls|Governance & Risk|Management Accountability|Forward-Looking|Related Party Transactions|Audit & Assurance","question":"<specific probing question>","rationale":"<why it matters>","expected_answer_elements":["<el1>","<el2>"],"follow_up":"<follow-up question>","priority":"High|Medium|Low","applicable_regulation":"<regulation ref>"}}]"""
    try: questions_data=await call_gpt(sys_,usr,max_tokens=3000)
    except Exception as e: raise HTTPException(status_code=500,detail=f"Questions failed: {str(e)}")
    doc={"company_id":company_id,"company_name":company["name"],"role":role,"role_title":role_title,"questions_data":questions_data,"created_at":datetime.utcnow().isoformat()}
    await db.questions.insert_one(doc); return serialize(doc)

@app.get("/api/questions")
async def list_questions(company_id:Optional[str]=Query(None),role:Optional[str]=Query(None)):
    query={}
    if company_id: query["company_id"]=company_id
    if role: query["role"]=role
    results=[]
    async for item in db.questions.find(query).sort("created_at",-1).limit(10): results.append(serialize(item))
    return results

# ── Documents ─────────────────────────────────────────────
@app.post("/api/documents")
async def upload_document(file:UploadFile=File(...),company_id:Optional[str]=Form(None)):
    allowed={".pdf",".xlsx",".xls",".csv",".doc",".docx"}
    ext=os.path.splitext(file.filename)[1].lower()
    if ext not in allowed: raise HTTPException(status_code=400,detail=f"File type {ext} not allowed")
    safe_name=f"{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{file.filename}"
    file_path=os.path.join(UPLOAD_DIR,safe_name)
    with open(file_path,"wb") as f: shutil.copyfileobj(file.file,f)
    size=os.path.getsize(file_path)
    doc={"company_id":company_id,"original_filename":file.filename,"stored_filename":safe_name,
         "file_path":file_path,"file_size":size,
         "file_size_readable":f"{size/1024:.1f} KB" if size<1048576 else f"{size/1048576:.1f} MB",
         "file_type":ext.lstrip(".").upper(),"uploaded_at":datetime.utcnow().isoformat()}
    result=await db.documents.insert_one(doc); doc["_id"]=str(result.inserted_id); return doc

@app.get("/api/documents")
async def list_documents(company_id:Optional[str]=Query(None)):
    query={}
    if company_id: query["company_id"]=company_id
    docs=[]
    async for doc in db.documents.find(query).sort("uploaded_at",-1): docs.append(serialize(doc))
    return docs

@app.delete("/api/documents/{doc_id}")
async def delete_document(doc_id:str):
    doc=await db.documents.find_one({"_id":to_object_id(doc_id)})
    if doc:
        p=doc.get("file_path","")
        if p and os.path.exists(p): os.remove(p)
        await db.documents.delete_one({"_id":to_object_id(doc_id)})
    return {"message":"Document deleted"}

# ── Static & SPA ──────────────────────────────────────────
app.mount("/static",StaticFiles(directory="static"),name="static")

@app.get("/",response_class=HTMLResponse)
async def root(): return FileResponse("static/index.html")

@app.get("/{full_path:path}",response_class=HTMLResponse)
async def catch_all(full_path:str):
    if full_path.startswith("api/"): raise HTTPException(status_code=404)
    return FileResponse("static/index.html")

if __name__=="__main__":
    import uvicorn
    uvicorn.run("main:app",host="0.0.0.0",port=8000,reload=True)