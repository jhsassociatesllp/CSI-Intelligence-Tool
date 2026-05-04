"""
CSI Intelligence - Compliance Signals Intelligence Backend
JHS & Associates LLP
"""

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from openai import AsyncOpenAI
from bson import ObjectId
from bson.errors import InvalidId
import os
import json
import shutil
from dotenv import load_dotenv
from datetime import datetime
from typing import Optional, List
import logging

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────
# App Setup
# ─────────────────────────────────────────────────────────
app = FastAPI(title="CSI Intelligence API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────
# Database
# ─────────────────────────────────────────────────────────
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
mongo_client = AsyncIOMotorClient(MONGODB_URL)
db = mongo_client.csi_intelligence

# ─────────────────────────────────────────────────────────
# OpenAI
# ─────────────────────────────────────────────────────────
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ─────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────
def serialize(doc: dict) -> dict:
    """Convert MongoDB _id to string."""
    if doc is None:
        return None
    doc = dict(doc)
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


def to_object_id(id_str: str) -> ObjectId:
    try:
        return ObjectId(id_str)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail=f"Invalid ID: {id_str}")


async def call_gpt(system_prompt: str, user_prompt: str, max_tokens: int = 2000) -> dict:
    """Central OpenAI call — returns parsed JSON dict."""
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured. Add OPENAI_API_KEY to .env file.")
    
    response = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
        max_tokens=max_tokens,
        response_format={"type": "json_object"},
    )
    
    content = response.choices[0].message.content
    return json.loads(content)


# ─────────────────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────────────────
class CompanyCreate(BaseModel):
    name: str
    industry: str
    cin: Optional[str] = ""
    pan: Optional[str] = ""
    competitors: List[str] = []
    description: Optional[str] = ""
    listing_status: Optional[str] = "Listed"  # Listed / Unlisted


class ComplianceItemCreate(BaseModel):
    company_id: str
    category: str  # Companies Act 2013 | SEBI LODR | SEBI ICDR | FEMA/RBI | Income Tax/GST
    sub_category: Optional[str] = ""
    title: str
    description: Optional[str] = ""
    due_date: str  # ISO date string
    status: str = "pending"  # compliant | pending | non-compliant
    priority: str = "medium"  # high | medium | low
    responsible_person: Optional[str] = ""
    section_reference: Optional[str] = ""  # e.g. "Section 137 of Companies Act"
    notes: Optional[str] = ""


# ─────────────────────────────────────────────────────────
# DASHBOARD
# ─────────────────────────────────────────────────────────
@app.get("/api/dashboard")
async def get_dashboard(company_id: Optional[str] = Query(None)):
    query = {}
    if company_id:
        query["company_id"] = company_id

    total_companies = await db.companies.count_documents({})
    total_items = await db.compliance.count_documents(query)
    compliant = await db.compliance.count_documents({**query, "status": "compliant"})
    pending = await db.compliance.count_documents({**query, "status": "pending"})
    non_compliant = await db.compliance.count_documents({**query, "status": "non-compliant"})
    total_docs = await db.documents.count_documents(query)

    # Category breakdown for chart
    categories: dict = {}
    async for item in db.compliance.find(query):
        cat = item.get("category", "Other")
        status = item.get("status", "pending")
        if cat not in categories:
            categories[cat] = {"compliant": 0, "pending": 0, "non-compliant": 0, "total": 0}
        categories[cat][status] = categories[cat].get(status, 0) + 1
        categories[cat]["total"] += 1

    # Upcoming deadlines (next 30 days)
    from datetime import timedelta
    now = datetime.utcnow()
    upcoming = []
    async for item in db.compliance.find({**query, "status": {"$ne": "compliant"}}):
        due = item.get("due_date", "")
        if due:
            try:
                due_dt = datetime.fromisoformat(due)
                days_left = (due_dt - now).days
                if 0 <= days_left <= 30:
                    item_data = serialize(item)
                    item_data["days_left"] = days_left
                    upcoming.append(item_data)
            except Exception:
                pass
    upcoming.sort(key=lambda x: x.get("days_left", 999))

    return {
        "total_companies": total_companies,
        "total_items": total_items,
        "compliant": compliant,
        "pending": pending,
        "non_compliant": non_compliant,
        "total_documents": total_docs,
        "categories": categories,
        "upcoming_deadlines": upcoming[:5],
    }


# ─────────────────────────────────────────────────────────
# COMPANIES
# ─────────────────────────────────────────────────────────
@app.get("/api/companies")
async def list_companies():
    companies = []
    async for c in db.companies.find().sort("name", 1):
        companies.append(serialize(c))
    return companies


@app.post("/api/companies", status_code=201)
async def create_company(company: CompanyCreate):
    doc = {**company.model_dump(), "created_at": datetime.utcnow().isoformat()}
    result = await db.companies.insert_one(doc)
    created = await db.companies.find_one({"_id": result.inserted_id})
    return serialize(created)


@app.get("/api/companies/{company_id}")
async def get_company(company_id: str):
    company = await db.companies.find_one({"_id": to_object_id(company_id)})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return serialize(company)


@app.put("/api/companies/{company_id}")
async def update_company(company_id: str, company: CompanyCreate):
    await db.companies.update_one(
        {"_id": to_object_id(company_id)},
        {"$set": {**company.model_dump(), "updated_at": datetime.utcnow().isoformat()}},
    )
    updated = await db.companies.find_one({"_id": to_object_id(company_id)})
    return serialize(updated)


@app.delete("/api/companies/{company_id}")
async def delete_company(company_id: str):
    await db.companies.delete_one({"_id": to_object_id(company_id)})
    return {"message": "Company deleted successfully"}


# ─────────────────────────────────────────────────────────
# COMPLIANCE MAPPING
# ─────────────────────────────────────────────────────────
@app.get("/api/compliance")
async def list_compliance(company_id: Optional[str] = Query(None)):
    query = {}
    if company_id:
        query["company_id"] = company_id
    items = []
    async for item in db.compliance.find(query).sort("due_date", 1):
        items.append(serialize(item))
    return items


@app.post("/api/compliance", status_code=201)
async def create_compliance(item: ComplianceItemCreate):
    doc = {**item.model_dump(), "created_at": datetime.utcnow().isoformat()}
    result = await db.compliance.insert_one(doc)
    created = await db.compliance.find_one({"_id": result.inserted_id})
    return serialize(created)


@app.put("/api/compliance/{item_id}")
async def update_compliance(item_id: str, item: ComplianceItemCreate):
    await db.compliance.update_one(
        {"_id": to_object_id(item_id)},
        {"$set": {**item.model_dump(), "updated_at": datetime.utcnow().isoformat()}},
    )
    updated = await db.compliance.find_one({"_id": to_object_id(item_id)})
    return serialize(updated)


@app.delete("/api/compliance/{item_id}")
async def delete_compliance(item_id: str):
    await db.compliance.delete_one({"_id": to_object_id(item_id)})
    return {"message": "Item deleted"}


# Seed common Indian compliance deadlines
@app.post("/api/compliance/seed/{company_id}")
async def seed_compliance(company_id: str):
    """Seed common Indian statutory compliance items for a company."""
    company = await db.companies.find_one({"_id": to_object_id(company_id)})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    from datetime import date
    today = date.today()
    year = today.year

    items = [
        # Companies Act 2013
        {"category": "Companies Act 2013", "sub_category": "Annual Filing", "title": "Filing of Annual Return (MGT-7A)", "section_reference": "Section 92", "due_date": f"{year}-11-29", "priority": "high"},
        {"category": "Companies Act 2013", "sub_category": "Annual Filing", "title": "Filing of Financial Statements (AOC-4)", "section_reference": "Section 137", "due_date": f"{year}-10-29", "priority": "high"},
        {"category": "Companies Act 2013", "sub_category": "Board Meeting", "title": "Q1 Board Meeting (Apr-Jun)", "section_reference": "Section 173", "due_date": f"{year}-08-14", "priority": "medium"},
        {"category": "Companies Act 2013", "sub_category": "Board Meeting", "title": "Q2 Board Meeting (Jul-Sep)", "section_reference": "Section 173", "due_date": f"{year}-11-14", "priority": "medium"},
        {"category": "Companies Act 2013", "sub_category": "AGM", "title": "Annual General Meeting", "section_reference": "Section 96", "due_date": f"{year}-09-30", "priority": "high"},
        {"category": "Companies Act 2013", "sub_category": "Audit", "title": "Statutory Audit Completion", "section_reference": "Section 143", "due_date": f"{year}-09-30", "priority": "high"},
        {"category": "Companies Act 2013", "sub_category": "Secretarial Audit", "title": "Secretarial Audit Report (MR-3)", "section_reference": "Section 204", "due_date": f"{year}-09-30", "priority": "medium"},

        # SEBI LODR
        {"category": "SEBI LODR", "sub_category": "Quarterly Results", "title": "Q1 Financial Results Disclosure", "section_reference": "Reg 33", "due_date": f"{year}-07-31", "priority": "high"},
        {"category": "SEBI LODR", "sub_category": "Quarterly Results", "title": "Q2 Financial Results Disclosure", "section_reference": "Reg 33", "due_date": f"{year}-10-31", "priority": "high"},
        {"category": "SEBI LODR", "sub_category": "Quarterly Results", "title": "Q3 Financial Results Disclosure", "section_reference": "Reg 33", "due_date": f"{year+1}-01-31", "priority": "high"},
        {"category": "SEBI LODR", "sub_category": "Annual", "title": "Annual Report Filing with Stock Exchange", "section_reference": "Reg 34", "due_date": f"{year}-09-30", "priority": "high"},
        {"category": "SEBI LODR", "sub_category": "Corporate Governance", "title": "Q1 Corporate Governance Report", "section_reference": "Reg 27", "due_date": f"{year}-07-21", "priority": "medium"},
        {"category": "SEBI LODR", "sub_category": "Related Party", "title": "Half-Yearly RPT Disclosure", "section_reference": "Reg 23", "due_date": f"{year}-10-31", "priority": "high"},
        {"category": "SEBI LODR", "sub_category": "Shareholding", "title": "Q1 Shareholding Pattern", "section_reference": "Reg 31", "due_date": f"{year}-07-21", "priority": "medium"},

        # Income Tax / GST
        {"category": "Income Tax/GST", "sub_category": "GST", "title": "GSTR-1 Monthly Filing (Apr)", "section_reference": "Section 37 CGST", "due_date": f"{year}-05-11", "priority": "high"},
        {"category": "Income Tax/GST", "sub_category": "GST", "title": "GSTR-3B Monthly Filing (Apr)", "section_reference": "Section 39 CGST", "due_date": f"{year}-05-20", "priority": "high"},
        {"category": "Income Tax/GST", "sub_category": "Income Tax", "title": "Advance Tax Q1 (15%)", "section_reference": "Section 208", "due_date": f"{year}-06-15", "priority": "high"},
        {"category": "Income Tax/GST", "sub_category": "Income Tax", "title": "Advance Tax Q2 (45%)", "section_reference": "Section 208", "due_date": f"{year}-09-15", "priority": "high"},
        {"category": "Income Tax/GST", "sub_category": "Income Tax", "title": "Advance Tax Q3 (75%)", "section_reference": "Section 208", "due_date": f"{year}-12-15", "priority": "high"},
        {"category": "Income Tax/GST", "sub_category": "Income Tax", "title": "Corporate Tax Return Filing", "section_reference": "Section 139", "due_date": f"{year}-10-31", "priority": "high"},
        {"category": "Income Tax/GST", "sub_category": "TDS", "title": "TDS Q1 Return (Form 24Q/26Q)", "section_reference": "Section 200", "due_date": f"{year}-07-31", "priority": "medium"},

        # FEMA/RBI
        {"category": "FEMA/RBI", "sub_category": "FDI", "title": "Annual Return on Foreign Liabilities & Assets (FLA)", "section_reference": "FEMA 20R", "due_date": f"{year}-07-15", "priority": "high"},
        {"category": "FEMA/RBI", "sub_category": "ECB", "title": "ECB Monthly Return (ECB-2)", "section_reference": "FEMA 3R", "due_date": f"{year}-07-07", "priority": "medium"},
    ]

    inserted = 0
    for item in items:
        doc = {
            "company_id": company_id,
            "status": "pending",
            "description": f"Statutory obligation under {item.get('section_reference', '')}",
            "responsible_person": "",
            "notes": "",
            "created_at": datetime.utcnow().isoformat(),
            **item,
        }
        await db.compliance.insert_one(doc)
        inserted += 1

    return {"message": f"Seeded {inserted} compliance items", "count": inserted}


# ─────────────────────────────────────────────────────────
# AI ANALYSIS
# ─────────────────────────────────────────────────────────
@app.post("/api/analysis")
async def run_analysis(data: dict):
    company_id = data.get("company_id")
    if not company_id:
        raise HTTPException(status_code=400, detail="company_id is required")

    company = await db.companies.find_one({"_id": to_object_id(company_id)})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Gather compliance data
    items = []
    async for item in db.compliance.find({"company_id": company_id}):
        items.append(serialize(item))

    compliance_json = json.dumps(items, indent=2, default=str) if items else "No compliance items added yet."

    system_prompt = """You are a senior Indian corporate compliance analyst at JHS & Associates LLP with 20+ years of experience. 
You specialize in Companies Act 2013, SEBI LODR/ICDR, FEMA/RBI regulations, and Income Tax/GST compliance.
Always respond with valid JSON only — no markdown, no preamble."""

    user_prompt = f"""Perform a comprehensive compliance risk analysis for {company["name"]} 
({company.get("industry", "N/A")} | CIN: {company.get("cin", "N/A")} | {company.get("listing_status", "Listed")}).

COMPLIANCE DATA:
{compliance_json}

Analyze under these Indian regulatory frameworks:
1. Companies Act, 2013
2. SEBI LODR / ICDR Regulations  
3. FEMA / RBI Regulations
4. Income Tax Act / GST

Return a JSON object with EXACTLY these keys:
{{
  "risk_level": "High" | "Medium" | "Low",
  "overall_score": <number 0-100, compliance health>,
  "risk_summary": "<2-3 sentence executive summary>",
  "non_compliance_findings": [
    {{"id": 1, "framework": "<framework>", "finding": "<specific violation>", "section": "<section ref>", "severity": "Critical|High|Medium|Low", "consequence": "<legal consequence>", "remediation": "<specific action>"}}
  ],
  "pending_critical": [
    {{"title": "<item>", "due_date": "<date>", "days_remaining": <n>, "framework": "<framework>", "consequence": "<if missed>"}}
  ],
  "early_warning_signals": [
    {{"signal": "<warning>", "area": "<area>", "recommended_action": "<action>", "timeline": "<when to act>"}}
  ],
  "regulatory_priorities": [
    {{"rank": 1, "action": "<action>", "framework": "<framework>", "deadline": "<date>", "owner": "<suggested owner>"}}
  ],
  "strengths": ["<strength 1>", "<strength 2>"],
  "recommendations": [
    {{"category": "<category>", "recommendation": "<detailed recommendation>", "priority": "Immediate|Short-term|Long-term"}}
  ]
}}"""

    try:
        result_data = await call_gpt(system_prompt, user_prompt, max_tokens=3000)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")

    doc = {
        "company_id": company_id,
        "company_name": company["name"],
        "analysis": result_data,
        "items_analyzed": len(items),
        "created_at": datetime.utcnow().isoformat(),
    }
    await db.analyses.insert_one(doc)
    doc_copy = dict(doc)
    if "_id" in doc_copy:
        doc_copy["_id"] = str(doc_copy["_id"])
    return doc_copy


@app.get("/api/analysis")
async def list_analyses(company_id: Optional[str] = Query(None)):
    query = {}
    if company_id:
        query["company_id"] = company_id
    results = []
    async for item in db.analyses.find(query).sort("created_at", -1).limit(10):
        results.append(serialize(item))
    return results


# ─────────────────────────────────────────────────────────
# EXECUTIVE SUMMARY
# ─────────────────────────────────────────────────────────
@app.post("/api/summary")
async def generate_summary(data: dict):
    company_id = data.get("company_id")
    if not company_id:
        raise HTTPException(status_code=400, detail="company_id is required")

    company = await db.companies.find_one({"_id": to_object_id(company_id)})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    items = []
    async for item in db.compliance.find({"company_id": company_id}):
        items.append(serialize(item))

    # Get latest analysis
    latest_analysis = await db.analyses.find_one(
        {"company_id": company_id}, sort=[("created_at", -1)]
    )
    analysis_data = latest_analysis.get("analysis", {}) if latest_analysis else {}

    compliant_count = sum(1 for i in items if i.get("status") == "compliant")
    pending_count = sum(1 for i in items if i.get("status") == "pending")
    nc_count = sum(1 for i in items if i.get("status") == "non-compliant")
    health_pct = round((compliant_count / len(items) * 100)) if items else 0

    system_prompt = """You are a senior Partner at JHS & Associates LLP preparing board-level executive summaries.
Your summaries are used by Independent Directors and Audit Committees.
Write in professional, precise language. JSON only — no markdown."""

    user_prompt = f"""Generate a comprehensive Executive Compliance Summary for the Board/Audit Committee of {company["name"]}.

COMPANY: {company["name"]} | {company.get("industry")} | {company.get("listing_status", "Listed")}
CIN: {company.get("cin", "N/A")} | PAN: {company.get("pan", "N/A")}
REPORT DATE: {datetime.utcnow().strftime("%d %B %Y")}

COMPLIANCE METRICS:
- Total Items: {len(items)}
- Compliant: {compliant_count} ({health_pct}%)
- Pending: {pending_count}
- Non-Compliant: {nc_count}

DETAILED COMPLIANCE DATA:
{json.dumps(items[:20], indent=2, default=str)}

PRIOR AI ANALYSIS:
{json.dumps(analysis_data, indent=2, default=str)}

Return JSON with EXACTLY these keys:
{{
  "report_date": "{datetime.utcnow().strftime("%d %B %Y")}",
  "health_score": {health_pct},
  "overall_status": "Satisfactory|Needs Attention|Critical",
  "executive_overview": "<3-4 paragraph board-ready narrative summary>",
  "key_metrics": {{
    "total_items": {len(items)},
    "compliant": {compliant_count},
    "pending": {pending_count},
    "non_compliant": {nc_count},
    "compliance_rate": "{health_pct}%",
    "critical_deadlines_30days": <count>
  }},
  "framework_status": [
    {{"framework": "<name>", "status": "Green|Amber|Red", "items": <n>, "issues": "<summary>"}}
  ],
  "critical_areas": [
    {{"area": "<area>", "risk": "High|Medium|Low", "finding": "<finding>", "action_required": "<action>", "deadline": "<date>"}}
  ],
  "governance_gaps": [
    {{"gap": "<gap identified>", "impact": "<business/legal impact>", "recommendation": "<what to do>"}}
  ],
  "immediate_actions": [
    {{"priority": 1, "action": "<specific action>", "responsible": "<who>", "deadline": "<date>", "consequence_if_delayed": "<consequence>"}}
  ],
  "compliance_calendar_90days": [
    {{"date": "<date>", "obligation": "<obligation>", "framework": "<framework>", "priority": "High|Medium|Low"}}
  ],
  "jhs_recommendations": [
    {{"category": "<category>", "recommendation": "<detailed JHS recommendation>", "timeline": "<timeline>"}}
  ],
  "disclaimer": "This report has been prepared by JHS & Associates LLP based on information provided and is subject to the limitations of an outside-in review."
}}"""

    try:
        summary_data = await call_gpt(system_prompt, user_prompt, max_tokens=4000)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summary generation failed: {str(e)}")

    doc = {
        "company_id": company_id,
        "company_name": company["name"],
        "summary": summary_data,
        "created_at": datetime.utcnow().isoformat(),
    }
    await db.summaries.insert_one(doc)
    return serialize(doc)


@app.get("/api/summary")
async def list_summaries(company_id: Optional[str] = Query(None)):
    query = {}
    if company_id:
        query["company_id"] = company_id
    results = []
    async for item in db.summaries.find(query).sort("created_at", -1).limit(10):
        results.append(serialize(item))
    return results


# ─────────────────────────────────────────────────────────
# COMPETITOR BENCHMARKING
# ─────────────────────────────────────────────────────────
@app.post("/api/benchmarking")
async def run_benchmarking(data: dict):
    company_id = data.get("company_id")
    if not company_id:
        raise HTTPException(status_code=400, detail="company_id is required")

    company = await db.companies.find_one({"_id": to_object_id(company_id)})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    competitors = company.get("competitors", [])
    if not competitors:
        raise HTTPException(
            status_code=400,
            detail="No competitors configured. Edit the company and add competitors first.",
        )

    items = []
    async for item in db.compliance.find({"company_id": company_id}):
        items.append(serialize(item))

    comp1 = competitors[0] if len(competitors) > 0 else "Competitor 1"
    comp2 = competitors[1] if len(competitors) > 1 else "Competitor 2"

    system_prompt = """You are an Indian corporate governance benchmarking specialist at JHS & Associates LLP.
You have deep knowledge of BSE/NSE-listed company governance, SEBI compliance, and industry best practices.
JSON only — no markdown."""

    user_prompt = f"""Conduct a governance & compliance benchmarking analysis for {company["name"]} 
vs its top 2 competitors: {comp1} and {comp2}.

SUBJECT COMPANY: {company["name"]} | {company.get("industry")} | {company.get("listing_status", "Listed")}

COMPLIANCE DATA FOR {company["name"]}:
{json.dumps(items[:15], indent=2, default=str)}

Based on publicly available information, regulatory filings (BSE/NSE), annual reports, 
and industry standards, provide a comprehensive benchmarking analysis.

Return JSON with EXACTLY these keys:
{{
  "company_score": <0-100>,
  "competitor_scores": [
    {{"name": "{comp1}", "score": <0-100>, "rationale": "<why>"}},
    {{"name": "{comp2}", "score": <0-100>, "rationale": "<why>"}}
  ],
  "industry_average_score": <0-100>,
  "comparison_table": [
    {{
      "parameter": "<governance parameter>",
      "company": {{"value": "<value>", "score": <0-10>, "status": "Strong|Average|Weak"}},
      "{comp1}": {{"value": "<value>", "score": <0-10>, "status": "Strong|Average|Weak"}},
      "{comp2}": {{"value": "<value>", "score": <0-10>, "status": "Strong|Average|Weak"}},
      "industry_benchmark": "<benchmark standard>"
    }}
  ],
  "competitive_strengths": ["<area where company leads>"],
  "competitive_gaps": [
    {{"gap": "<area>", "company_position": "<current>", "competitor_best": "<competitor name + their approach>", "improvement_action": "<what to do>"}}
  ],
  "peer_insights": [
    {{"insight": "<interesting finding from peer comparison>", "implication": "<what it means>"}}
  ],
  "ranking": {{
    "overall": <1|2|3>,
    "by_framework": {{
      "Companies Act": <1|2|3>,
      "SEBI LODR": <1|2|3>,
      "Risk Management": <1|2|3>,
      "Disclosures": <1|2|3>
    }}
  }},
  "overall_assessment": "<3-4 sentence executive assessment>"
}}"""

    try:
        benchmark_data = await call_gpt(system_prompt, user_prompt, max_tokens=3000)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Benchmarking failed: {str(e)}")

    doc = {
        "company_id": company_id,
        "company_name": company["name"],
        "competitors": competitors[:2],
        "benchmark": benchmark_data,
        "created_at": datetime.utcnow().isoformat(),
    }
    await db.benchmarks.insert_one(doc)
    return serialize(doc)


@app.get("/api/benchmarking")
async def list_benchmarks(company_id: Optional[str] = Query(None)):
    query = {}
    if company_id:
        query["company_id"] = company_id
    results = []
    async for item in db.benchmarks.find(query).sort("created_at", -1).limit(5):
        results.append(serialize(item))
    return results


# ─────────────────────────────────────────────────────────
# QUESTION BANK
# ─────────────────────────────────────────────────────────
@app.post("/api/questions")
async def generate_questions(data: dict):
    company_id = data.get("company_id")
    role = data.get("role", "director")
    if not company_id:
        raise HTTPException(status_code=400, detail="company_id is required")

    company = await db.companies.find_one({"_id": to_object_id(company_id)})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    items = []
    async for item in db.compliance.find({"company_id": company_id}):
        items.append(serialize(item))

    latest_analysis = await db.analyses.find_one(
        {"company_id": company_id}, sort=[("created_at", -1)]
    )
    findings = latest_analysis.get("analysis", {}) if latest_analysis else {}

    role_title = "Independent Director" if role == "director" else "Internal Auditor"
    focus = (
        "board oversight, governance, strategic risk, management accountability, and fiduciary duties"
        if role == "director"
        else "internal controls, process effectiveness, audit findings, operational risk, and control environment"
    )

    system_prompt = f"""You are a senior advisor who prepares curated question banks for {role_title}s 
at Indian listed companies. You help {role_title}s ask management the right, incisive questions 
to discharge their duties effectively under Companies Act 2013, SEBI LODR, and RBI/FEMA.
JSON only."""

    user_prompt = f"""Generate a comprehensive question bank for the {role_title} of {company["name"]} 
({company.get("industry")}).

Focus areas: {focus}

COMPLIANCE CONTEXT:
{json.dumps(items[:15], indent=2, default=str)}

RISK FINDINGS:
{json.dumps(findings, indent=2, default=str)}

Generate 25 high-quality, probing questions. Make them specific, actionable, and contextual 
to this company's compliance status.

Return JSON with key "questions" containing array of objects:
{{
  "questions": [
    {{
      "id": 1,
      "category": "Statutory Compliance|Financial Controls|Governance & Risk|Management Accountability|Forward-Looking|Related Party Transactions|Audit & Assurance",
      "question": "<specific, probing question>",
      "rationale": "<why this question matters>",
      "expected_answer_elements": ["<element 1>", "<element 2>"],
      "follow_up": "<suggested follow-up question>",
      "priority": "High|Medium|Low",
      "applicable_regulation": "<regulation reference>"
    }}
  ]
}}"""

    try:
        questions_data = await call_gpt(system_prompt, user_prompt, max_tokens=3000)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Question generation failed: {str(e)}")

    doc = {
        "company_id": company_id,
        "company_name": company["name"],
        "role": role,
        "role_title": role_title,
        "questions_data": questions_data,
        "created_at": datetime.utcnow().isoformat(),
    }
    await db.questions.insert_one(doc)
    return serialize(doc)


@app.get("/api/questions")
async def list_questions(company_id: Optional[str] = Query(None), role: Optional[str] = Query(None)):
    query = {}
    if company_id:
        query["company_id"] = company_id
    if role:
        query["role"] = role
    results = []
    async for item in db.questions.find(query).sort("created_at", -1).limit(10):
        results.append(serialize(item))
    return results


# ─────────────────────────────────────────────────────────
# DOCUMENTS
# ─────────────────────────────────────────────────────────
@app.post("/api/documents")
async def upload_document(
    file: UploadFile = File(...),
    company_id: Optional[str] = Form(None),
):
    # Validate file type
    allowed = {".pdf", ".xlsx", ".xls", ".csv", ".doc", ".docx"}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"File type {ext} not allowed")

    safe_name = f"{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, safe_name)

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    size = os.path.getsize(file_path)
    doc = {
        "company_id": company_id,
        "original_filename": file.filename,
        "stored_filename": safe_name,
        "file_path": file_path,
        "file_size": size,
        "file_size_readable": f"{size / 1024:.1f} KB" if size < 1024 * 1024 else f"{size / 1024 / 1024:.1f} MB",
        "file_type": ext.lstrip(".").upper(),
        "uploaded_at": datetime.utcnow().isoformat(),
    }
    result = await db.documents.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


@app.get("/api/documents")
async def list_documents(company_id: Optional[str] = Query(None)):
    query = {}
    if company_id:
        query["company_id"] = company_id
    docs = []
    async for doc in db.documents.find(query).sort("uploaded_at", -1):
        docs.append(serialize(doc))
    return docs


@app.delete("/api/documents/{doc_id}")
async def delete_document(doc_id: str):
    doc = await db.documents.find_one({"_id": to_object_id(doc_id)})
    if doc:
        path = doc.get("file_path", "")
        if path and os.path.exists(path):
            os.remove(path)
        await db.documents.delete_one({"_id": to_object_id(doc_id)})
    return {"message": "Document deleted"}


# ─────────────────────────────────────────────────────────
# Serve Static Frontend
# ─────────────────────────────────────────────────────────
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/", response_class=HTMLResponse)
async def root():
    return FileResponse("static/index.html")


@app.get("/{full_path:path}", response_class=HTMLResponse)
async def catch_all(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse("static/index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
