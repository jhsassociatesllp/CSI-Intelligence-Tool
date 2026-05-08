/* ═══════════════════════════════════════════════════════════
   CSI Intelligence — Frontend App Logic
   JHS & Associates LLP
═══════════════════════════════════════════════════════════ */

const API = '';  // Same origin — FastAPI serves both

// ─────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────
let state = {
  companies: [],
  currentPage: 'dashboard',
  globalCompany: '',
  complianceTab: 'checklist',
  qRole: 'director',
  chartInstance: null,
};

// ─────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadCompanies();
  await loadDashboard();
});

// ─────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────
const PAGE_META = {
  dashboard:    { title: 'Compliance Intelligence',  sub: 'Board-centric compliance monitoring & early warning system' },
  companies:    { title: 'Company Profiles',         sub: 'Manage companies under compliance monitoring' },
  compliance:   { title: 'Compliance Mapping',       sub: 'Track statutory compliance, deadlines, and checklists' },
  analysis:     { title: 'AI-Driven Analysis',       sub: 'GPT-4o powered compliance risk detection & early warning signals' },
  summary:      { title: 'Executive Summaries',      sub: 'AI-generated board-ready compliance reports (5–7 pages)' },
  benchmarking: { title: 'Competitor Benchmarking',  sub: 'AI-powered governance comparison with top 2 competitors' },
  questions:    { title: 'Question Bank',            sub: 'Curated questions for Independent Directors & Internal Auditors' },
  documents:    { title: 'Documents',                sub: 'Upload and manage compliance documents (PDF, Excel, Word, CSV)' },
};

function navigate(page) {
  // Update active state
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');

  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');

  const meta = PAGE_META[page] || {};
  document.getElementById('page-title').textContent = meta.title || page;
  document.getElementById('page-subtitle').textContent = meta.sub || '';

  state.currentPage = page;

  // Load page data
  const loaders = {
    dashboard:    loadDashboard,
    companies:    renderCompanies,
    compliance:   loadCompliance,
    analysis:     loadAnalysisHistory,
    summary:      loadSummaryHistory,
    benchmarking: loadBenchmarkHistory,
    questions:    loadQuestionsHistory,
    documents:    loadDocuments,
  };
  if (loaders[page]) loaders[page]();
}

// ─────────────────────────────────────────────────────────
// API Helpers
// ─────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Request failed');
  return data;
}

async function apiPost(path, body) {
  return apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const icons = {
    success: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
    error:   `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>`,
    info:    `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
  };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icons[type] || ''} ${msg}`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ─────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

// Close on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('show');
  }
});

// ─────────────────────────────────────────────────────────
// COMPANIES
// ─────────────────────────────────────────────────────────
async function loadCompanies() {
  try {
    state.companies = await apiFetch('/api/companies');
    renderCompanies();
    populateCompanySelects();
  } catch (e) {
    toast('Failed to load companies: ' + e.message, 'error');
  }
}

function renderCompanies() {
  const grid = document.getElementById('companies-grid');
  if (!grid) return;

  if (!state.companies.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:60px">
      <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M3 21h18M3 7h18M5 21V7M19 21V7"/></svg>
      <h3>No companies yet</h3>
      <p>Add your first company to start tracking compliance</p>
      <button class="btn btn-primary" onclick="openCompanyModal()">Add Company</button>
    </div>`;
    return;
  }

  grid.innerHTML = state.companies.map(c => `
    <div class="company-card">
      <div class="company-card-top">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="company-icon">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 21h18M3 7h18M5 21V7M19 21V7"/></svg>
          </div>
          <div>
            <div class="company-name">${esc(c.name)}</div>
            <div class="company-meta">${esc(c.industry || '')}</div>
          </div>
        </div>
        <div class="company-card-actions">
          <button class="btn-icon" onclick="editCompany('${c._id}')" title="Edit">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          </button>
          <button class="btn-icon danger" onclick="deleteCompany('${c._id}','${esc(c.name)}')" title="Delete">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
        </div>
      </div>
      ${c.cin ? `<div class="company-cin">${esc(c.cin)}</div>` : ''}
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span class="badge badge-navy">${esc(c.listing_status || 'Listed')}</span>
        ${c.competitors?.length ? `<span class="badge badge-gray">${c.competitors.length} competitor${c.competitors.length > 1 ? 's' : ''}</span>` : ''}
      </div>
      ${c.competitors?.length ? `<div style="font-size:11.5px;color:#64748b">vs ${c.competitors.slice(0,2).map(x=>esc(x)).join(', ')}</div>` : ''}
    </div>
  `).join('');
}

function populateCompanySelects() {
  const options = `<option value="">All Companies</option>` +
    state.companies.map(c => `<option value="${c._id}">${esc(c.name)}</option>`).join('');
  const singleOptions = `<option value="">Select Company</option>` +
    state.companies.map(c => `<option value="${c._id}">${esc(c.name)}</option>`).join('');

  const multi = ['global-company-filter','docs-company-filter'];
  const single = ['analysis-company-sel','summary-company-sel','bench-company-sel','q-company-sel','ci-company','seed-company-sel'];

  multi.forEach(id => { const el = document.getElementById(id); if(el) el.innerHTML = options; });
  single.forEach(id => { const el = document.getElementById(id); if(el) el.innerHTML = singleOptions; });
}

function openCompanyModal(prefill = null) {
  document.getElementById('company-modal-title').textContent = prefill ? 'Edit Company' : 'Add Company';
  document.getElementById('company-edit-id').value = prefill?._id || '';
  document.getElementById('comp-name').value = prefill?.name || '';
  document.getElementById('comp-industry').value = prefill?.industry || '';
  document.getElementById('comp-cin').value = prefill?.cin || '';
  document.getElementById('comp-pan').value = prefill?.pan || '';
  document.getElementById('comp-listing').value = prefill?.listing_status || 'Listed';
  document.getElementById('comp-competitor1').value = prefill?.competitors?.[0] || '';
  document.getElementById('comp-competitor2').value = prefill?.competitors?.[1] || '';
  document.getElementById('comp-desc').value = prefill?.description || '';
  openModal('modal-company');
}

function editCompany(id) {
  const c = state.companies.find(x => x._id === id);
  if (c) openCompanyModal(c);
}

async function saveCompany() {
  const name = document.getElementById('comp-name').value.trim();
  const industry = document.getElementById('comp-industry').value;
  if (!name) { toast('Company name is required', 'error'); return; }
  if (!industry) { toast('Please select an industry', 'error'); return; }

  const payload = {
    name,
    industry,
    cin: document.getElementById('comp-cin').value.trim(),
    pan: document.getElementById('comp-pan').value.trim(),
    listing_status: document.getElementById('comp-listing').value,
    competitors: [
      document.getElementById('comp-competitor1').value.trim(),
      document.getElementById('comp-competitor2').value.trim(),
    ].filter(Boolean),
    description: document.getElementById('comp-desc').value.trim(),
  };

  const editId = document.getElementById('company-edit-id').value;
  try {
    if (editId) {
      await apiFetch(`/api/companies/${editId}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      toast('Company updated', 'success');
    } else {
      await apiPost('/api/companies', payload);
      toast('Company added', 'success');
    }
    closeModal('modal-company');
    await loadCompanies();
    if (state.currentPage === 'dashboard') loadDashboard();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function deleteCompany(id, name) {
  if (!confirm(`Delete "${name}"? This will not delete associated compliance data.`)) return;
  try {
    await apiFetch(`/api/companies/${id}`, { method: 'DELETE' });
    toast('Company deleted', 'success');
    await loadCompanies();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

// ─────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const cid = state.globalCompany;
    const url = cid ? `/api/dashboard?company_id=${cid}` : '/api/dashboard';
    const d = await apiFetch(url);

    document.getElementById('dash-companies').textContent = d.total_companies;
    document.getElementById('dash-items').textContent = d.total_items;
    document.getElementById('dash-compliant').textContent = d.compliant;
    document.getElementById('dash-pending').textContent = d.pending;
    document.getElementById('dash-noncompliant').textContent = d.non_compliant;
    document.getElementById('dash-docs').textContent = d.total_documents;

    renderStatusChart(d);
    renderUpcomingDeadlines(d.upcoming_deadlines || []);
    renderBreakdown(d.categories || {});
  } catch (e) {
    toast('Dashboard error: ' + e.message, 'error');
  }
}

function renderStatusChart(d) {
  const empty = document.getElementById('dash-chart-empty');
  const canvas = document.getElementById('statusChart');

  if (!d.total_items) {
    canvas.style.display = 'none';
    empty.style.display = 'block';
    return;
  }
  canvas.style.display = 'block';
  empty.style.display = 'none';

  if (state.chartInstance) state.chartInstance.destroy();

  const ctx = canvas.getContext('2d');
  state.chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Compliant', 'Pending', 'Non-Compliant'],
      datasets: [{
        data: [d.compliant, d.pending, d.non_compliant],
        backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
        borderWidth: 0,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { padding: 16, font: { family: 'DM Sans', size: 12 }, usePointStyle: true }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${ctx.parsed} (${Math.round(ctx.parsed / d.total_items * 100)}%)`
          }
        }
      }
    }
  });
}

function renderUpcomingDeadlines(items) {
  const el = document.getElementById('dash-upcoming');
  if (!items.length) {
    el.innerHTML = '<div class="empty-state" style="padding:30px 0"><p>No upcoming deadlines in next 30 days</p></div>';
    return;
  }
  el.innerHTML = items.map(item => {
    const date = new Date(item.due_date);
    return `<div class="calendar-item">
      <div class="calendar-date">
        <div class="day">${date.getDate()}</div>
        <div class="mon">${date.toLocaleString('en', {month:'short'})}</div>
      </div>
      <div class="calendar-info">
        <div class="calendar-title">${esc(item.title)}</div>
        <div class="calendar-meta">${esc(item.category)} · ${item.days_left === 0 ? '<b style="color:#ef4444">Due today</b>' : `<b style="color:${item.days_left <= 7 ? '#ef4444' : '#f59e0b'}">${item.days_left}d left</b>`}</div>
      </div>
      <span class="badge ${getPriorityClass(item.priority)}">${item.priority}</span>
    </div>`;
  }).join('');
}

function renderBreakdown(categories) {
  const el = document.getElementById('dash-breakdown');
  if (!Object.keys(categories).length) {
    el.innerHTML = '<div class="empty-state" style="padding:30px 0"><p>No compliance data yet</p></div>';
    return;
  }
  el.innerHTML = Object.entries(categories).map(([cat, counts]) => {
    const total = counts.total;
    const pct = total ? Math.round(counts.compliant / total * 100) : 0;
    const barColor = pct >= 70 ? 'success' : pct >= 40 ? 'warning' : 'danger';
    return `<div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
        <span style="font-size:13px;font-weight:600;color:#1a2540">${esc(cat)}</span>
        <div style="display:flex;gap:6px;align-items:center">
          <span class="badge badge-success">${counts.compliant} ✓</span>
          <span class="badge badge-warning">${counts.pending} ⏳</span>
          <span class="badge badge-danger">${counts['non-compliant'] || 0} ✗</span>
          <span style="font-size:12px;font-weight:700;color:#1a2540;margin-left:4px">${pct}%</span>
        </div>
      </div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill ${barColor}" style="width:${pct}%"></div>
      </div>
    </div>`;
  }).join('');
}

function onGlobalCompanyChange() {
  state.globalCompany = document.getElementById('global-company-filter').value;
  if (state.currentPage === 'dashboard') loadDashboard();
  if (state.currentPage === 'compliance') loadCompliance();
  if (state.currentPage === 'documents') loadDocuments();
}

// ─────────────────────────────────────────────────────────
// COMPLIANCE MAPPING
// ─────────────────────────────────────────────────────────
function switchTab(tab) {
  state.complianceTab = tab;
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === (tab === 'checklist' ? 0 : 1)));
  document.getElementById('compliance-checklist').style.display = tab === 'checklist' ? 'block' : 'none';
  document.getElementById('compliance-calendar').style.display  = tab === 'calendar'  ? 'block' : 'none';
  if (tab === 'calendar') renderCalendar();
}

async function loadCompliance() {
  const cid = state.globalCompany;
  const status = document.getElementById('comp-filter-status')?.value || '';
  const cat = document.getElementById('comp-filter-cat')?.value || '';
  const priority = document.getElementById('comp-filter-priority')?.value || '';

  let url = '/api/compliance';
  if (cid) url += `?company_id=${cid}`;

  try {
    let items = await apiFetch(url);
    if (status)   items = items.filter(i => i.status === status);
    if (cat)      items = items.filter(i => i.category === cat);
    if (priority) items = items.filter(i => i.priority === priority);

    const countEl = document.getElementById('comp-count');
    if (countEl) countEl.textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;

    renderComplianceTable(items);
    if (state.complianceTab === 'calendar') renderCalendar(items);
  } catch (e) {
    toast('Failed to load compliance: ' + e.message, 'error');
  }
}

function renderComplianceTable(items) {
  const tbody = document.getElementById('compliance-tbody');
  const empty = document.getElementById('compliance-empty');
  if (!tbody) return;

  if (!items.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = items.map(item => {
    const due = item.due_date ? new Date(item.due_date) : null;
    const today = new Date();
    const isOverdue = due && due < today && item.status !== 'compliant';
    const company = state.companies.find(c => c._id === item.company_id);

    return `<tr>
      <td>
        <span class="status-dot ${item.status}"></span>
        <span class="badge ${getStatusClass(item.status)}">${item.status}</span>
      </td>
      <td>
        <div style="font-weight:600;color:#1a2540;font-size:13px">${esc(item.title)}</div>
        ${company ? `<div style="font-size:11.5px;color:#64748b">${esc(company.name)}</div>` : ''}
      </td>
      <td>
        <span class="badge badge-navy" style="font-size:11px">${esc(item.category)}</span>
        ${item.sub_category ? `<div style="font-size:11px;color:#64748b;margin-top:2px">${esc(item.sub_category)}</div>` : ''}
      </td>
      <td><span class="badge ${getPriorityClass(item.priority)}">${item.priority}</span></td>
      <td>
        <span style="font-size:12.5px;${isOverdue ? 'color:#ef4444;font-weight:600' : ''}">
          ${due ? due.toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'}) : '—'}
        </span>
        ${isOverdue ? '<div style="font-size:11px;color:#ef4444">Overdue</div>' : ''}
      </td>
      <td style="font-size:11.5px;color:#475569;font-family:monospace">${esc(item.section_reference || '—')}</td>
      <td style="font-size:12.5px;color:#475569">${esc(item.responsible_person || '—')}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn-icon" onclick="editComplianceItem('${item._id}')" title="Edit">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          </button>
          <button class="btn-icon" onclick="quickStatus('${item._id}','compliant')" title="Mark Compliant" style="color:#10b981">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>
          </button>
          <button class="btn-icon danger" onclick="deleteComplianceItem('${item._id}')" title="Delete">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function renderCalendar(items) {
  if (!items) {
    const cid = state.globalCompany;
    const url = cid ? `/api/compliance?company_id=${cid}` : '/api/compliance';
    items = await apiFetch(url).catch(() => []);
  }
  const body = document.getElementById('calendar-body');
  if (!items.length) {
    body.innerHTML = '<div class="empty-state" style="padding:40px"><p>No compliance items to show on calendar</p></div>';
    return;
  }

  // Group by month
  const byMonth = {};
  items.forEach(item => {
    if (!item.due_date) return;
    const d = new Date(item.due_date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!byMonth[key]) byMonth[key] = { label: d.toLocaleString('en', {month:'long', year:'numeric'}), items: [] };
    byMonth[key].items.push(item);
  });

  body.innerHTML = Object.values(byMonth).map(group => `
    <div style="margin-bottom:24px">
      <div style="font-family:'Outfit',sans-serif;font-size:13px;font-weight:700;color:#0f2d5a;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #0f2d5a">${group.label}</div>
      ${group.items.map(item => {
        const d = new Date(item.due_date);
        return `<div class="calendar-item">
          <div class="calendar-date">
            <div class="day">${d.getDate()}</div>
            <div class="mon">${d.toLocaleString('en',{month:'short'})}</div>
          </div>
          <div class="calendar-info">
            <div class="calendar-title">${esc(item.title)}</div>
            <div class="calendar-meta">${esc(item.category)} ${item.section_reference ? '· ' + esc(item.section_reference) : ''}</div>
          </div>
          <span class="badge ${getStatusClass(item.status)}">${item.status}</span>
          <span class="badge ${getPriorityClass(item.priority)}" style="margin-left:4px">${item.priority}</span>
        </div>`;
      }).join('')}
    </div>
  `).join('');
}

function openComplianceModal(prefill = null) {
  document.getElementById('comp-modal-title').textContent = prefill ? 'Edit Compliance Item' : 'Add Compliance Item';
  document.getElementById('ci-edit-id').value = prefill?._id || '';
  document.getElementById('ci-company').value = prefill?.company_id || state.globalCompany || '';
  document.getElementById('ci-category').value = prefill?.category || '';
  document.getElementById('ci-subcategory').value = prefill?.sub_category || '';
  document.getElementById('ci-section').value = prefill?.section_reference || '';
  document.getElementById('ci-title').value = prefill?.title || '';
  document.getElementById('ci-description').value = prefill?.description || '';
  document.getElementById('ci-due-date').value = prefill?.due_date?.split('T')[0] || '';
  document.getElementById('ci-status').value = prefill?.status || 'pending';
  document.getElementById('ci-priority').value = prefill?.priority || 'medium';
  document.getElementById('ci-responsible').value = prefill?.responsible_person || '';
  document.getElementById('ci-notes').value = prefill?.notes || '';
  openModal('modal-compliance');
}

let _complianceCache = [];

async function editComplianceItem(id) {
  const url = state.globalCompany ? `/api/compliance?company_id=${state.globalCompany}` : '/api/compliance';
  if (!_complianceCache.length) _complianceCache = await apiFetch(url).catch(() => []);
  const item = _complianceCache.find(i => i._id === id);
  if (item) openComplianceModal(item);
}

async function saveComplianceItem() {
  const company_id = document.getElementById('ci-company').value;
  const category = document.getElementById('ci-category').value;
  const title = document.getElementById('ci-title').value.trim();
  const due_date = document.getElementById('ci-due-date').value;

  if (!company_id) { toast('Please select a company', 'error'); return; }
  if (!category) { toast('Please select a category', 'error'); return; }
  if (!title) { toast('Title is required', 'error'); return; }
  if (!due_date) { toast('Due date is required', 'error'); return; }

  const payload = {
    company_id, category, title, due_date,
    sub_category: document.getElementById('ci-subcategory').value.trim(),
    section_reference: document.getElementById('ci-section').value.trim(),
    description: document.getElementById('ci-description').value.trim(),
    status: document.getElementById('ci-status').value,
    priority: document.getElementById('ci-priority').value,
    responsible_person: document.getElementById('ci-responsible').value.trim(),
    notes: document.getElementById('ci-notes').value.trim(),
  };

  const editId = document.getElementById('ci-edit-id').value;
  try {
    if (editId) {
      await apiFetch(`/api/compliance/${editId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      toast('Item updated', 'success');
    } else {
      await apiPost('/api/compliance', payload);
      toast('Item added', 'success');
    }
    _complianceCache = [];
    closeModal('modal-compliance');
    loadCompliance();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function quickStatus(id, status) {
  const url = state.globalCompany ? `/api/compliance?company_id=${state.globalCompany}` : '/api/compliance';
  if (!_complianceCache.length) _complianceCache = await apiFetch(url).catch(() => []);
  const item = _complianceCache.find(i => i._id === id);
  if (!item) return;
  const payload = { ...item, status };
  await apiFetch(`/api/compliance/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
  _complianceCache = [];
  toast(`Marked as ${status}`, 'success');
  loadCompliance();
}

async function deleteComplianceItem(id) {
  if (!confirm('Delete this compliance item?')) return;
  await apiFetch(`/api/compliance/${id}`, { method:'DELETE' });
  _complianceCache = [];
  toast('Item deleted', 'success');
  loadCompliance();
}

function openSeedModal() {
  document.getElementById('seed-company-sel').value = state.globalCompany || '';
  openModal('modal-seed');
}

async function seedComplianceItems() {
  const cid = document.getElementById('seed-company-sel').value;
  if (!cid) { toast('Please select a company', 'error'); return; }
  try {
    const result = await apiPost(`/api/compliance/seed/${cid}`, {});
    toast(`${result.count} compliance items seeded successfully`, 'success');
    closeModal('modal-seed');
    _complianceCache = [];
    loadCompliance();
  } catch (e) {
    toast('Seed failed: ' + e.message, 'error');
  }
}

// ─────────────────────────────────────────────────────────
// AI ANALYSIS
// ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────
// AGENT PIPELINE CONFIG — 8 Agents, all gpt-4o
// ─────────────────────────────────────────────────────────
const AGENTS = [
  { id:'orchestrator',    name:'Orchestrator',               icon:'🎯', desc:'Plans research strategy & risk areas',          color:'#0f2d5a' },
  { id:'researcher_rbi',  name:'RBI & MCA Researcher',       icon:'🏛', desc:'RBI penalties · MCA orders · Parliamentary',    color:'#1d4ed8' },
  { id:'researcher_sebi', name:'SEBI & Exchange Researcher', icon:'📈', desc:'SEBI orders · BSE/NSE filings · LODR',          color:'#7c3aed' },
  { id:'researcher_tax',  name:'Tax & Media Researcher',     icon:'📰', desc:'IT Dept · GST · FEMA · Financial media',        color:'#0891b2' },
  { id:'extractor',       name:'Data Extractor',             icon:'⚙',  desc:'Structures 9-field incident data',              color:'#d97706' },
  { id:'verifier',        name:'Verifier & Fact-Checker',    icon:'✅', desc:'Cross-checks citations & source URLs',          color:'#059669' },
  { id:'analyst',         name:'Pattern Analyst',            icon:'🔍', desc:'Repeat violations · Systemic weaknesses',       color:'#dc2626' },
  { id:'reporter',        name:'Report Writer',              icon:'📝', desc:'Compiles board-ready final report',             color:'#c8a846' },
];

let pipelineSSE = null;

// ─────────────────────────────────────────────────────────
// AGENT PIPELINE UI
// ─────────────────────────────────────────────────────────
function buildAgentPipelineUI() {
  const agentCards = AGENTS.map(a => `
    <div id="agent-card-${a.id}" style="
      border:1.5px solid #e4e8f0;border-radius:12px;padding:14px 16px;
      background:#fff;transition:all .3s;position:relative;overflow:hidden">
      <div style="display:flex;align-items:flex-start;gap:12px">
        <div id="agent-icon-${a.id}" style="
          width:40px;height:40px;border-radius:10px;background:${a.color}18;
          display:flex;align-items:center;justify-content:center;font-size:18px;
          flex-shrink:0;transition:all .3s">${a.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;flex-wrap:wrap">
            <span style="font-weight:700;font-size:13px;color:#0f172a">${a.name}</span>
            <span id="agent-badge-${a.id}" style="
              font-size:10px;padding:2px 8px;border-radius:20px;font-weight:600;
              background:#f1f5f9;color:#94a3b8">Waiting</span>
            <span style="font-size:9.5px;padding:1px 7px;border-radius:20px;
              background:#7c3aed15;color:#7c3aed;font-weight:600;border:1px solid #7c3aed30">GPT-4o</span>
          </div>
          <div style="font-size:11.5px;color:#64748b;margin-bottom:5px">${a.desc}</div>
          <div id="agent-msg-${a.id}" style="font-size:11.5px;color:#475569;min-height:14px;line-height:1.4"></div>
          <div id="agent-detail-${a.id}" style="font-size:11px;color:#94a3b8;margin-top:2px;min-height:12px"></div>
        </div>
        <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <div id="agent-spinner-${a.id}" style="display:none">
            <span class="spinner" style="width:18px;height:18px;border-width:2px;border-color:${a.color}40;border-top-color:${a.color}"></span>
          </div>
          <div id="agent-check-${a.id}" style="display:none;color:#10b981">
            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
          <div id="agent-error-${a.id}" style="display:none;color:#ef4444">
            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
          </div>
        </div>
      </div>
      <div id="agent-progress-${a.id}" style="
        position:absolute;bottom:0;left:0;height:2px;width:0%;
        background:linear-gradient(90deg,${a.color},${a.color}88);
        transition:width 2s ease;border-radius:0 0 0 12px"></div>
    </div>`).join('');

  return `
    <!-- Pipeline Header -->
    <div class="card" style="margin-bottom:16px;background:linear-gradient(135deg,#0f2d5a 0%,#1e3a7a 100%);border:none">
      <div class="card-body" style="padding:20px 24px">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">
          <div style="width:44px;height:44px;background:rgba(255,255,255,.12);border-radius:12px;
            display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🤖</div>
          <div style="flex:1">
            <div style="font-family:Outfit;font-weight:800;font-size:17px;color:white;margin-bottom:3px">
              Agentic AI Pipeline Running
            </div>
            <div style="font-size:12.5px;color:rgba(255,255,255,.65)" id="pipeline-headline">
              Initialising 8 specialist agents...
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-family:Outfit;font-size:28px;font-weight:800;color:white" id="pipeline-pct">0%</div>
            <div style="font-size:11px;color:rgba(255,255,255,.5)">complete</div>
          </div>
        </div>
        <div style="background:rgba(255,255,255,.15);border-radius:8px;height:6px;overflow:hidden">
          <div id="pipeline-bar" style="height:100%;background:linear-gradient(90deg,#c8a846,#f0d060);
            border-radius:8px;width:0%;transition:width .6s ease"></div>
        </div>
        <!-- Model & source strip -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;flex-wrap:wrap;gap:6px">
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <span style="font-size:10px;background:rgba(124,58,237,.35);color:#c4b5fd;padding:2px 8px;border-radius:10px;font-weight:600">GPT-4o · All Agents</span>
            <span style="font-size:10px;background:rgba(29,78,216,.35);color:#93c5fd;padding:2px 8px;border-radius:10px;font-weight:600">3 Parallel Web Searches</span>
            <span style="font-size:10px;background:rgba(8,145,178,.35);color:#67e8f9;padding:2px 8px;border-radius:10px;font-weight:600">RBI · SEBI · MCA · Tax · Media</span>
          </div>
          <span style="font-size:10.5px;color:rgba(255,255,255,.5)">Always fresh · No cache</span>
        </div>
      </div>
    </div>


    <!-- Agent Cards Grid -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px" id="agent-cards-grid">
      ${agentCards}
    </div>

    <!-- Live Feed -->
    <div class="card">
      <div class="card-header" style="border-bottom:1px solid #e4e8f0">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="width:8px;height:8px;background:#10b981;border-radius:50%;display:inline-block;animation:pulse 1.5s infinite"></span>
          <h3 style="margin:0">Live Agent Feed</h3>
        </div>
        <span id="live-feed-count" style="font-size:11.5px;color:#94a3b8">0 events</span>
      </div>
      <div id="live-feed" style="
        max-height:200px;overflow-y:auto;padding:12px 16px;
        font-family:monospace;font-size:11.5px;color:#334155;
        background:#f8fafc;border-radius:0 0 12px 12px"></div>
    </div>`;
}

function updateAgentCard(agentId, status, message, detail) {
  const card  = document.getElementById(`agent-card-${agentId}`);
  const badge = document.getElementById(`agent-badge-${agentId}`);
  const msg   = document.getElementById(`agent-msg-${agentId}`);
  const det   = document.getElementById(`agent-detail-${agentId}`);
  const spin  = document.getElementById(`agent-spinner-${agentId}`);
  const check = document.getElementById(`agent-check-${agentId}`);
  const err   = document.getElementById(`agent-error-${agentId}`);
  const prog  = document.getElementById(`agent-progress-${agentId}`);
  const icon  = document.getElementById(`agent-icon-${agentId}`);
  const agent = AGENTS.find(a => a.id === agentId);
  if (!card || !agent) {
    console.warn(`[CSI] updateAgentCard: card not found for agent "${agentId}" — DOM may not be ready`);
    return;
  }

  spin.style.display = 'none';
  check.style.display = 'none';
  err.style.display = 'none';

  if (status === 'running') {
    card.style.borderColor = agent.color + '60';
    card.style.background  = agent.color + '05';
    icon.style.background  = agent.color + '25';
    badge.style.background = agent.color + '18';
    badge.style.color      = agent.color;
    badge.textContent      = 'Running';
    spin.style.display     = 'block';
    prog.style.width       = '60%';
  } else if (status === 'done') {
    card.style.borderColor = '#10b981' + '60';
    card.style.background  = '#10b98108';
    badge.style.background = '#dcfce7';
    badge.style.color      = '#059669';
    badge.textContent      = '✓ Done';
    check.style.display    = 'block';
    prog.style.width       = '100%';
    prog.style.background  = 'linear-gradient(90deg,#10b981,#34d399)';
  } else if (status === 'error') {
    card.style.borderColor = '#ef444460';
    badge.style.background = '#fee2e2';
    badge.style.color      = '#dc2626';
    badge.textContent      = '✗ Error';
    err.style.display      = 'block';
    prog.style.width       = '100%';
    prog.style.background  = '#ef4444';
  }
  if (message) msg.textContent = message;
  if (detail)  det.textContent = detail;
}

function addLiveFeedEntry(timestamp, text, type='info') {
  const feed  = document.getElementById('live-feed');
  const count = document.getElementById('live-feed-count');
  if (!feed) return;
  const colors = { info:'#475569', success:'#059669', error:'#dc2626', agent:'#0f2d5a' };
  const line   = document.createElement('div');
  line.style.cssText = `padding:2px 0;border-bottom:1px solid #e4e8f0;color:${colors[type]||colors.info}`;
  line.innerHTML = `<span style="color:#94a3b8;margin-right:8px">[${timestamp}]</span>${esc(text)}`;
  feed.appendChild(line);
  feed.scrollTop = feed.scrollHeight;
  const n = feed.querySelectorAll('div').length;
  if (count) count.textContent = `${n} event${n!==1?'s':''}`;
}

function updatePipelineProgress() {
  const doneCount = AGENTS.filter(a => {
    const b = document.getElementById(`agent-badge-${a.id}`);
    return b && b.textContent.includes('Done');
  }).length;
  const pct = Math.round((doneCount / AGENTS.length) * 100);
  const bar = document.getElementById('pipeline-bar');
  const pctEl = document.getElementById('pipeline-pct');
  const headline = document.getElementById('pipeline-headline');
  if (bar) bar.style.width = pct + '%';
  if (pctEl) pctEl.textContent = pct + '%';
  if (headline && doneCount > 0) {
    const phase = doneCount <= 1 ? 'Scoping & planning...'
                : doneCount <= 4 ? 'Researching regulatory sources...'
                : doneCount <= 5 ? 'Extracting & structuring data...'
                : doneCount <= 6 ? 'Verifying facts & citations...'
                : doneCount <= 7 ? 'Analysing patterns & themes...'
                : 'Compiling final report...';
    headline.textContent = phase;
  }
}

// ─────────────────────────────────────────────────────────
// RUN ANALYSIS (SSE Agent Pipeline)
// ─────────────────────────────────────────────────────────
async function runAnalysis() {
  const cid = document.getElementById('analysis-company-sel').value;
  if (!cid) { toast('Please select a company', 'error'); return; }

  const btn = document.getElementById('btn-run-analysis');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Agents Running...`;

  // Close any existing SSE connection
  if (pipelineSSE) { pipelineSSE.close(); pipelineSSE = null; }

  // Render the agent pipeline UI
  document.getElementById('analysis-content').innerHTML = buildAgentPipelineUI();

  // ── CRITICAL: wait for the DOM to fully render before opening SSE ──────
  // Without this, early agent events (orchestrator, researchers) arrive
  // before getElementById can find the cards, so they silently fail and
  // cards stay "Waiting" forever even though the agents completed.
  await new Promise(resolve => {
    requestAnimationFrame(() => setTimeout(resolve, 250));
  });

  // Now the DOM is ready — open SSE connection
  pipelineSSE = new EventSource(`/api/analysis/stream?company_id=${encodeURIComponent(cid)}`);

  pipelineSSE.onmessage = (event) => {
    try {
      const ev = JSON.parse(event.data);

      if (ev.type === 'agent_update') {
        updateAgentCard(ev.agent_id, ev.status, ev.message, ev.detail);
        updatePipelineProgress();
        if (ev.status === 'running') {
          addLiveFeedEntry(ev.timestamp, `[${ev.agent_id}] ${ev.message}`, 'agent');
        } else if (ev.status === 'done') {
          addLiveFeedEntry(ev.timestamp, `✓ ${ev.agent_id}: ${ev.message}`, 'success');
        } else if (ev.status === 'error') {
          addLiveFeedEntry(ev.timestamp, `✗ ${ev.agent_id}: ${ev.message}`, 'error');
        }

      } else if (ev.type === 'log') {
        addLiveFeedEntry(ev.timestamp, ev.text, 'info');

      } else if (ev.type === 'complete') {
        pipelineSSE.close(); pipelineSSE = null;
        updatePipelineProgress();
        const cached = ev.cached;
        const cacheMsg = cached ? `⚡ Cache hit — served ${ev.cache_age_minutes}-min-old result ($0 cost)` : '🎉 Pipeline complete — all agents done!';
        addLiveFeedEntry(ev.timestamp, cacheMsg, 'success');
        toast(cached ? `Loaded from cache (${ev.cache_age_minutes} min old) — $0 cost` : 'Analysis complete!', 'success');
        setTimeout(() => {
          document.getElementById('analysis-content').innerHTML = '';
          renderAnalysis(ev.data);
          // Show cache banner if applicable
          if (cached) {
            const content = document.getElementById('analysis-content');
            const banner  = document.createElement('div');
            banner.style.cssText = 'background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:10px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px;font-size:13px;color:#15803d';
            banner.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              <span><strong>Served from cache</strong> — ${ev.cache_age_minutes} min old · <strong>$0 API cost</strong> · Fresh analysis available after 6 hours</span>`;
            content.insertBefore(banner, content.firstChild);
          }
        }, cached ? 200 : 1200);

      } else if (ev.type === 'error') {
        pipelineSSE.close(); pipelineSSE = null;
        addLiveFeedEntry(ev.timestamp || '??:??:??', `Pipeline error: ${ev.message}`, 'error');
        toast('Analysis failed: ' + ev.message, 'error');
        document.getElementById('analysis-content').innerHTML = `
          <div class="empty-state">
            <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
            <h3>Pipeline Error</h3><p>${esc(ev.message)}</p>
          </div>`;
      }
    } catch(e) {
      console.error('SSE parse error:', e);
    }
  };

  pipelineSSE.onerror = (e) => {
    console.error('SSE connection error:', e);
    addLiveFeedEntry(new Date().toTimeString().slice(0,8), 'Connection interrupted — check server', 'error');
  };

  // Reset button once SSE closes
  const resetBtn = () => {
    btn.disabled = false;
    btn.innerHTML = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run Analysis`;
  };
  pipelineSSE.addEventListener('error', resetBtn);
  // Also reset if SSE ends cleanly
  const checkDone = setInterval(() => {
    if (!pipelineSSE || pipelineSSE.readyState === EventSource.CLOSED) {
      resetBtn(); clearInterval(checkDone);
    }
  }, 2000);
}

async function loadAnalysisHistory() {
  const cid = document.getElementById('analysis-company-sel').value;
  const effectiveCid = cid || state.globalCompany;

  // Always show a fresh-start prompt — never silently render stale data.
  // User must explicitly click "Run Analysis" or "View Last Analysis".
  let lastAnalysis = null;
  if (effectiveCid) {
    const items = await apiFetch(`/api/analysis?company_id=${effectiveCid}`).catch(() => []);
    if (items.length) lastAnalysis = items[0];
  }

  const el = document.getElementById('analysis-content');
  if (!el) return;

  if (lastAnalysis) {
    const lastDate  = new Date(lastAnalysis.created_at);
    const minsAgo   = Math.round((Date.now() - lastDate) / 60000);
    const timeLabel = minsAgo < 60
      ? `${minsAgo} minute${minsAgo !== 1 ? 's' : ''} ago`
      : minsAgo < 1440
        ? `${Math.round(minsAgo/60)} hour${Math.round(minsAgo/60) !== 1 ? 's' : ''} ago`
        : lastDate.toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'});

    // Stale if older than 2 hours
    const isStale = minsAgo > 120;

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
        padding:60px 24px;text-align:center;max-width:560px;margin:0 auto">
        <div style="width:64px;height:64px;background:#f0f4ff;border-radius:16px;
          display:flex;align-items:center;justify-content:center;margin-bottom:20px">
          <svg width="30" height="30" fill="none" stroke="#0f2d5a" stroke-width="1.8" viewBox="0 0 24 24">
            <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
        </div>
        <h2 style="font-family:Outfit;font-size:20px;font-weight:800;color:#0f2d5a;margin-bottom:8px">
          Run Fresh Analysis
        </h2>
        <p style="font-size:13.5px;color:#64748b;line-height:1.6;margin-bottom:20px">
          Click <strong>Run Analysis</strong> above to launch the 8-agent AI pipeline and fetch the
          latest compliance data from RBI, SEBI, MCA, and financial media.
        </p>

        <!-- Last analysis notice -->
        <div style="width:100%;background:${isStale ? '#fef3c7' : '#f0fdf4'};
          border:1px solid ${isStale ? '#fde68a' : '#bbf7d0'};
          border-radius:10px;padding:14px 18px;margin-bottom:20px;text-align:left">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="font-size:13px;font-weight:700;color:${isStale ? '#92400e' : '#15803d'}">
              ${isStale ? '⚠ Previous Analysis (Outdated)' : '✓ Recent Analysis Available'}
            </span>
            <span style="font-size:11px;color:${isStale ? '#b45309' : '#16a34a'};
              background:${isStale ? '#fde68a' : '#dcfce7'};
              padding:1px 8px;border-radius:10px">${timeLabel}</span>
          </div>
          <div style="font-size:12.5px;color:#475569;line-height:1.5">
            ${lastAnalysis.company_name} ·
            ${lastAnalysis.analysis?.risk_level || '?'} Risk ·
            ${lastAnalysis.analysis?.total_incidents || (lastAnalysis.analysis?.incident_log||[]).length} incidents ·
            ${lastAnalysis.items_analyzed || 0} internal items
          </div>
          <button onclick="viewLastAnalysis()"
            style="margin-top:10px;background:none;border:1px solid ${isStale ? '#f59e0b' : '#10b981'};
            color:${isStale ? '#92400e' : '#059669'};font-size:12px;padding:4px 14px;
            border-radius:20px;cursor:pointer;font-family:DM Sans">
            View Last Analysis →
          </button>
        </div>

        <p style="font-size:12px;color:#94a3b8">
          Each run performs live web searches across 8+ regulatory sources.
          Results are always fresh — never cached.
        </p>
      </div>`;

    // Store for "View Last Analysis" button
    state._lastAnalysisData = lastAnalysis;

  } else {
    // No previous analysis at all
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
        padding:80px 24px;text-align:center">
        <div style="width:64px;height:64px;background:#f0f4ff;border-radius:16px;
          display:flex;align-items:center;justify-content:center;margin-bottom:20px">
          <svg width="30" height="30" fill="none" stroke="#0f2d5a" stroke-width="1.8" viewBox="0 0 24 24">
            <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
        </div>
        <h2 style="font-family:Outfit;font-size:20px;font-weight:800;color:#0f2d5a;margin-bottom:8px">
          No Analysis Yet
        </h2>
        <p style="font-size:13.5px;color:#64748b;line-height:1.6">
          Select a company and click <strong>Run Analysis</strong> to start the agentic AI pipeline.
        </p>
      </div>`;
  }
}

function viewLastAnalysis() {
  if (state._lastAnalysisData) {
    renderAnalysis(state._lastAnalysisData);
  }
}



function renderAnalysis(data) {
  // Store a deep copy in state so chat bot can read + mutate it live
  state.currentAnalysis = JSON.parse(JSON.stringify(data));
  state.chatHistory     = [];   // reset chat for new analysis

  const a = data.analysis || {};
  const riskColor = { High: '#ef4444', Medium: '#f59e0b', Low: '#10b981' };
  const rc = riskColor[a.risk_level] || '#64748b';

  // ── Helper: render source chips with links ──────────────────────────────
  function renderSources(sources, containerId) {
    if (!sources || !sources.length) return '';
    const typeColor = { Official: '#0f2d5a', Filing: '#1d4ed8', Media: '#475569' };
    const chips = sources.map(s => {
      const col = typeColor[s.type] || '#475569';
      const approx = s.url_approximate ? ' ≈' : '';
      if (s.url && s.url.startsWith('http')) {
        return `<a href="${esc(s.url)}" target="_blank" rel="noopener"
          style="display:inline-flex;align-items:center;gap:4px;background:${col};color:white;
          font-size:10.5px;padding:3px 9px;border-radius:20px;text-decoration:none;margin:2px;font-family:DM Sans">
          <svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
          ${esc(s.title || s.type)}${approx}
        </a>`;
      }
      return `<span style="display:inline-flex;align-items:center;gap:4px;background:${col}22;color:${col};
        border:1px solid ${col}44;font-size:10.5px;padding:3px 9px;border-radius:20px;margin:2px;font-family:DM Sans">
        ${esc(s.title || s.type)}${approx}
      </span>`;
    }).join('');
    return `<div style="margin-top:7px;display:flex;flex-wrap:wrap;gap:2px">${chips}</div>`;
  }

  // ── Incident Log ────────────────────────────────────────────────────────
  const incidents = a.incident_log || a.non_compliance_findings || [];
  const incidentRows = incidents.map((inc, idx) => {
    const detailId = `inc-detail-${idx}`;
    const sevColor = { High: '#ef4444', Medium: '#f59e0b', Low: '#10b981', Critical: '#7c3aed' };
    const classColor = { Regulatory: '#0f2d5a', Governance: '#1d4ed8', Financial: '#dc2626', ESG: '#059669' };
    const sev = inc.severity || 'Medium';
    const cls = inc.classification || 'Regulatory';
    const sources = inc.sources || inc.legal_references || [];
    return `
    <div style="border:1px solid #e4e8f0;border-radius:10px;margin-bottom:10px;overflow:hidden">
      <!-- Row header — always visible -->
      <div onclick="toggleRefs('${detailId}')" style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;cursor:pointer;background:#fafbfc;transition:background .15s"
        onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#fafbfc'">
        <div style="width:26px;height:26px;border-radius:50%;background:${sevColor[sev]||'#475569'};color:white;
          display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0;font-family:Outfit">
          ${idx + 1}
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:4px">
            <span style="font-weight:700;font-size:13px;color:#0f172a">${esc(inc.nature || inc.finding || 'Incident')}</span>
            <span style="font-size:10px;padding:2px 8px;border-radius:20px;background:${sevColor[sev]||'#475569'}20;color:${sevColor[sev]||'#475569'};font-weight:700">${sev}</span>
            <span style="font-size:10px;padding:2px 8px;border-radius:20px;background:${classColor[cls]||'#47556920'};color:${classColor[cls]||'#475569'};font-weight:600">${cls}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:11.5px;color:#64748b">
            ${inc.date ? `<span>📅 ${esc(inc.date)}</span>` : ''}
            ${inc.regulator ? `<span>🏛 ${esc(inc.regulator)}</span>` : ''}
            ${inc.penalty_action ? `<span style="color:#dc2626;font-weight:600">⚖ ${esc(inc.penalty_action)}</span>` : ''}
          </div>
        </div>
        <svg id="${detailId}-chevron" width="16" height="16" fill="none" stroke="#94a3b8" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;transition:transform .2s"><path d="M9 18l6-6-6-6"/></svg>
      </div>
      <!-- Expandable detail panel -->
      <div id="${detailId}" style="display:none;padding:14px;border-top:1px solid #e4e8f0;background:white">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          ${inc.business_implication ? `<div>
            <div style="font-size:10.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Business Implication</div>
            <div style="font-size:12.5px;color:#334155;line-height:1.5">${esc(inc.business_implication)}</div>
          </div>` : ''}
          ${inc.root_cause ? `<div>
            <div style="font-size:10.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">
              Root Cause ${inc.root_cause_inferred ? '<span style="color:#f59e0b;font-size:9.5px">[INFERRED]</span>' : ''}
            </div>
            <div style="font-size:12.5px;color:#334155;line-height:1.5">${esc(inc.root_cause)}</div>
          </div>` : ''}
        </div>
        ${inc.severity_rationale ? `<div style="margin-bottom:10px;padding:8px 12px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:0 6px 6px 0">
          <div style="font-size:10.5px;font-weight:700;color:#92400e;margin-bottom:2px">Severity Rationale</div>
          <div style="font-size:12px;color:#78350f">${esc(inc.severity_rationale)}</div>
        </div>` : ''}
        ${inc.legal_section ? `<div style="margin-bottom:10px;padding:7px 12px;background:#f0f4ff;border-left:3px solid #0f2d5a;border-radius:0 6px 6px 0">
          <div style="font-size:10.5px;font-weight:700;color:#0f2d5a;margin-bottom:2px">Primary Legal Provision</div>
          <div style="font-size:11.5px;color:#1e3a5f;font-family:monospace">${esc(inc.legal_section)}</div>
        </div>` : ''}
        ${inc.remediation ? `<div style="font-size:12.5px;color:#475569;margin-bottom:10px">
          <span style="font-weight:700;color:#0f172a">→ Action: </span>${esc(inc.remediation)}
        </div>` : ''}
        <!-- Sources -->
        <div>
          <div style="font-size:10.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">
            📚 Sources & References
          </div>
          ${sources.length ? renderSources(sources, detailId) :
            '<span style="font-size:11.5px;color:#94a3b8;font-style:italic">No sources available — rerun analysis for updated references</span>'}
        </div>
      </div>
    </div>`;
  }).join('') || '<p style="color:#64748b;font-size:13px">No incidents found. Run analysis to detect compliance issues.</p>';

  // ── Repeat Violations ───────────────────────────────────────────────────
  const repeats = a.repeat_violations || [];
  const repeatHtml = repeats.length ? repeats.map(r => `
    <div style="border-left:4px solid #dc2626;padding:10px 14px;background:#fef2f2;border-radius:0 8px 8px 0;margin-bottom:8px">
      <div style="font-weight:700;font-size:13px;color:#991b1b;margin-bottom:4px">
        🔁 ${esc(r.violation)}
      </div>
      <div style="display:flex;gap:16px;font-size:11.5px;margin-bottom:6px;flex-wrap:wrap">
        <span style="color:#64748b"><b>First:</b> ${esc(r.first_occurrence)}</span>
        <span style="color:#dc2626"><b>Recurred:</b> ${esc(r.recurrence)}</span>
      </div>
      ${r.pattern_analysis ? `<div style="font-size:12px;color:#7f1d1d;line-height:1.5">${esc(r.pattern_analysis)}</div>` : ''}
    </div>
  `).join('') : '<p style="color:#64748b;font-size:13px">No repeat violations identified.</p>';

  // ── Systemic Weaknesses ─────────────────────────────────────────────────
  const weaknesses = a.systemic_weaknesses || [];
  const weaknessHtml = weaknesses.length ? weaknesses.map(w => `
    <div style="border:1px solid #fbbf24;border-radius:8px;padding:12px 14px;margin-bottom:8px;background:#fffbeb">
      <div style="font-weight:700;font-size:13px;color:#92400e;margin-bottom:5px">⚠ ${esc(w.area)}</div>
      <div style="font-size:12.5px;color:#78350f;line-height:1.5">${esc(w.weakness)}</div>
      ${w.related_incident_ids?.length ? `<div style="margin-top:6px;font-size:11px;color:#b45309">
        Related incidents: ${w.related_incident_ids.map(id => `<span style="background:#fde68a;padding:1px 7px;border-radius:10px;margin-right:4px">#${id}</span>`).join('')}
      </div>` : ''}
    </div>
  `).join('') : '<p style="color:#64748b;font-size:13px">No systemic weaknesses identified.</p>';

  // ── Key Risk Themes ─────────────────────────────────────────────────────
  const themes = a.key_risk_themes || [];
  const themeColors = ['#ef4444','#f59e0b','#3b82f6','#8b5cf6','#10b981'];
  const themeHtml = themes.length ? themes.map((t, i) => `
    <div style="border-left:4px solid ${themeColors[i%5]};padding:10px 14px;margin-bottom:8px;background:#f8fafc;border-radius:0 8px 8px 0">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
        <span style="width:22px;height:22px;border-radius:50%;background:${themeColors[i%5]};color:white;
          font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;font-family:Outfit;flex-shrink:0">${t.rank||i+1}</span>
        <span style="font-weight:700;font-size:13px;color:#0f172a">${esc(t.theme)}</span>
      </div>
      <div style="font-size:12.5px;color:#475569;line-height:1.6;padding-left:30px">${esc(t.description)}</div>
      ${t.related_incident_ids?.length ? `<div style="margin-top:5px;padding-left:30px;font-size:11px;color:#94a3b8">
        Cases: ${t.related_incident_ids.map(id => `<span style="background:#e2e8f0;padding:1px 7px;border-radius:10px;margin-right:4px">#${id}</span>`).join('')}
      </div>` : ''}
    </div>
  `).join('') : '';

  // ── Early Warnings ──────────────────────────────────────────────────────
  const warnings = (a.early_warning_signals || []).map((w, wi) => {
    const wRefs = w.legal_references || [];
    const wRefId = `refs-w-${wi}`;
    return `
    <div class="warning-box" style="margin-bottom:8px;margin-top:0;flex-direction:column;gap:6px">
      <div style="display:flex;align-items:flex-start;gap:8px">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:16px;height:16px;flex-shrink:0;margin-top:2px"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
        <div style="flex:1">
          <div style="font-weight:600;font-size:13px">${esc(w.signal || w)}</div>
          ${w.recommended_action ? `<div style="font-size:12px;margin-top:3px;opacity:.85">Action: ${esc(w.recommended_action)}</div>` : ''}
          ${w.timeline ? `<div style="font-size:11px;margin-top:2px;opacity:.7">Timeline: ${esc(w.timeline)}</div>` : ''}
        </div>
      </div>
      ${wRefs.length ? `
      <div style="padding-left:24px">
        <button onclick="toggleRefs('${wRefId}')" style="background:none;border:1px solid rgba(180,130,0,.5);color:rgba(100,70,0,.9);font-size:11px;padding:2px 9px;border-radius:20px;cursor:pointer;font-family:DM Sans;display:inline-flex;align-items:center;gap:4px">
          📚 ${wRefs.length} Reference${wRefs.length > 1 ? 's' : ''}
        </button>
        <div id="${wRefId}" style="display:none;margin-top:6px;background:rgba(255,255,255,.4);border:1px solid rgba(180,130,0,.3);border-radius:6px;padding:8px">
          ${wRefs.map((r, i) => `
            <div style="${i > 0 ? 'border-top:1px solid rgba(180,130,0,.2);margin-top:6px;padding-top:6px' : ''}">
              <div style="font-size:11px;font-weight:700;font-family:monospace">${esc(r.citation)}</div>
              ${r.description ? `<div style="font-size:11px;margin-top:2px;opacity:.8">${esc(r.description)}</div>` : ''}
              ${r.url ? `<a href="${esc(r.url)}" target="_blank" style="font-size:10.5px;color:#1d4ed8;margin-top:3px;display:inline-block">↗ Open source</a>` : ''}
            </div>
          `).join('')}
        </div>
      </div>` : ''}
    </div>`;
  }).join('') || '<p style="color:#64748b;font-size:13px">No early warning signals identified.</p>';

  // ── Priorities ──────────────────────────────────────────────────────────
  const priorities = (a.regulatory_priorities || []).map((p, i) => `
    <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid #e4e8f0">
      <div style="width:28px;height:28px;background:${i<2?'#ef4444':i<4?'#f59e0b':'#10b981'};color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:Outfit;font-weight:800;font-size:13px;flex-shrink:0">${i+1}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600">${esc(p.action||p)}</div>
        <div style="font-size:11.5px;color:#64748b;margin-top:2px;display:flex;flex-wrap:wrap;gap:8px">
          ${p.framework ? `<span class="badge badge-navy" style="font-size:10px">${esc(p.framework)}</span>` : ''}
          ${p.deadline ? `<span>📅 ${esc(p.deadline)}</span>` : ''}
          ${p.owner ? `<span>👤 ${esc(p.owner)}</span>` : ''}
        </div>
        ${p.legal_reference ? `<div style="margin-top:5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-size:10.5px;color:#0f2d5a;font-family:monospace;background:#f0f4ff;padding:2px 8px;border-radius:4px">§ ${esc(p.legal_reference)}</span>
          ${p.reference_url ? `<a href="${esc(p.reference_url)}" target="_blank" rel="noopener" style="font-size:10.5px;color:#1d4ed8">↗ View regulation</a>` : ''}
        </div>` : ''}
      </div>
    </div>
  `).join('');

  // ── Recommendations ─────────────────────────────────────────────────────
  const recsHtml = (a.recommendations||[]).map((r, ri) => `
    <div class="finding-card ${r.priority==='Immediate'?'':r.priority==='Short-term'?'medium':'low'}" style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;gap:8px">
        <span style="font-weight:600;font-size:13px">${esc(r.category||'')}</span>
        <span class="badge ${r.priority==='Immediate'?'badge-danger':r.priority==='Short-term'?'badge-warning':'badge-success'}">${esc(r.priority||'')}</span>
      </div>
      <div style="font-size:12.5px;color:#475569;margin-top:5px;line-height:1.5">${esc(r.recommendation||r)}</div>
      ${r.legal_basis ? `<div style="margin-top:7px;padding:6px 10px;background:#f0f4ff;border-left:3px solid #0f2d5a;border-radius:0 6px 6px 0">
        <div style="font-size:10.5px;font-weight:700;color:#0f2d5a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Legal Basis</div>
        <div style="font-size:11px;color:#1e3a5f;font-family:monospace;line-height:1.5">${esc(r.legal_basis)}</div>
      </div>` : ''}
      ${r.reference_url ? `<a href="${esc(r.reference_url)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;margin-top:7px;font-size:11.5px;color:#1d4ed8;text-decoration:none">
        <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
        View regulatory guidance
      </a>` : ''}
    </div>
  `).join('') || '<p style="color:#64748b;font-size:13px">No specific recommendations.</p>';

  // ── Assemble the full output ────────────────────────────────────────────
  document.getElementById('analysis-content').innerHTML = `
    <!-- Header bar -->
    <div style="margin-bottom:16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span class="ai-badge">
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
        GPT-4o Analysis
      </span>
      ${data.web_research_used ? `<span style="font-size:11.5px;background:#dcfce7;color:#15803d;padding:2px 10px;border-radius:20px;font-weight:600">🌐 Web-researched</span>` : ''}
      <span style="font-size:12.5px;color:#64748b">${data.company_name} · ${new Date(data.created_at).toLocaleString('en-IN')}</span>
      <span style="font-size:12.5px;color:#64748b">· ${data.items_analyzed||0} internal items</span>
    </div>

    <!-- Risk Score Header -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-body" style="padding:24px">
        <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap">
          <div class="score-ring">
            <div class="score-circle">
              <svg width="100" height="100" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#e4e8f0" stroke-width="8"/>
                <circle cx="50" cy="50" r="40" fill="none" stroke="${rc}" stroke-width="8"
                  stroke-dasharray="${2*Math.PI*40}"
                  stroke-dashoffset="${2*Math.PI*40*(1-(a.overall_score||0)/100)}"
                  stroke-linecap="round"/>
              </svg>
              <div class="score-num">${a.overall_score||0}</div>
            </div>
            <div class="score-label">Health Score</div>
          </div>
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap">
              <span style="font-family:Outfit;font-size:22px;font-weight:800;color:${rc}">${a.risk_level||'N/A'} Risk</span>
              <span class="badge risk-${(a.risk_level||'').toLowerCase()}">${a.risk_level}</span>
              ${a.total_incidents ? `<span class="badge badge-danger">${a.total_incidents} incidents identified</span>` : ''}
            </div>
            <p style="font-size:13.5px;color:#475569;line-height:1.6">${esc(a.risk_summary||'Analysis complete.')}</p>
            ${(a.data_sources_searched||[]).length ? `<div style="margin-top:8px">
              <span style="font-size:11px;color:#94a3b8;font-weight:600">Sources searched: </span>
              ${a.data_sources_searched.map(s => `<span style="font-size:11px;background:#f1f5f9;color:#475569;padding:2px 8px;border-radius:10px;margin:2px;display:inline-block">${esc(s)}</span>`).join('')}
            </div>` : ''}
            ${(a.strengths||[]).length ? `<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
              ${a.strengths.map(s => `<span class="badge badge-success">✓ ${esc(s)}</span>`).join('')}
            </div>` : ''}
          </div>
        </div>
      </div>
    </div>

    <!-- Incident Log (9-field framework table) -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <h3>Compliance Incident Log</h3>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-size:11px;color:#94a3b8">Click any row to expand details & sources</span>
          <span class="badge badge-danger">${incidents.length} incident${incidents.length!==1?'s':''}</span>
        </div>
      </div>
      <div class="card-body">${incidentRows}</div>
    </div>

    <!-- Repeat Violations + Systemic Weaknesses -->
    ${(repeats.length || weaknesses.length) ? `<div class="grid-2" style="margin-bottom:20px">
      ${repeats.length ? `<div class="card">
        <div class="card-header">
          <h3>Repeat Violations</h3>
          <span class="badge badge-danger">${repeats.length} pattern${repeats.length!==1?'s':''}</span>
        </div>
        <div class="card-body">${repeatHtml}</div>
      </div>` : ''}
      ${weaknesses.length ? `<div class="card">
        <div class="card-header">
          <h3>Systemic Weaknesses</h3>
          <span class="badge badge-warning">${weaknesses.length} area${weaknesses.length!==1?'s':''}</span>
        </div>
        <div class="card-body">${weaknessHtml}</div>
      </div>` : ''}
    </div>` : ''}

    <!-- Key Risk Themes -->
    ${themes.length ? `<div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <h3>Key Risk Themes</h3>
        <span class="badge badge-info">${themes.length} theme${themes.length!==1?'s':''}</span>
      </div>
      <div class="card-body">${themeHtml}</div>
    </div>` : ''}

    <!-- Priorities + Warnings -->
    <div class="grid-2" style="margin-bottom:20px">
      <div class="card">
        <div class="card-header">
          <h3>Regulatory Priorities</h3>
          <span class="badge badge-info">Top ${(a.regulatory_priorities||[]).length}</span>
        </div>
        <div class="card-body" style="max-height:360px;overflow-y:auto">
          ${priorities || '<p style="color:#64748b;font-size:13px">No specific priorities identified.</p>'}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Early Warning Signals</h3></div>
        <div class="card-body" style="max-height:360px;overflow-y:auto">${warnings}</div>
      </div>
    </div>

    <!-- Recommendations -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header"><h3>JHS Recommendations</h3></div>
      <div class="card-body">${recsHtml}</div>
    </div>
  `;

  // Wire up chevron rotation for incident rows
  document.querySelectorAll('[id^="inc-detail-"]').forEach(panel => {
    const chevron = document.getElementById(panel.id + '-chevron');
    if (chevron) {
      const observer = new MutationObserver(() => {
        chevron.style.transform = panel.style.display === 'none' ? '' : 'rotate(90deg)';
      });
      observer.observe(panel, { attributes: true, attributeFilter: ['style'] });
    }
  });

  // Show floating AI chat assistant
  showChatBubble();
}

// ─────────────────────────────────────────────────────────
// AI CHAT ASSISTANT
// ─────────────────────────────────────────────────────────
function showChatBubble() {
  document.getElementById('csi-chat-bubble')?.remove();
  document.getElementById('csi-chat-panel')?.remove();

  const analysisCtx = state.currentAnalysis;
  const bubble = document.createElement('div');
  bubble.id = 'csi-chat-bubble';
  bubble.innerHTML = `<div onclick="toggleChatPanel()" style="
    position:fixed;bottom:28px;right:28px;z-index:9999;
    width:56px;height:56px;border-radius:50%;
    background:linear-gradient(135deg,#0f2d5a,#1e4a8a);
    box-shadow:0 4px 20px rgba(15,45,90,.4);
    display:flex;align-items:center;justify-content:center;
    cursor:pointer;transition:transform .2s,box-shadow .2s;
    animation:chatBubblePop .4s cubic-bezier(.34,1.56,.64,1)"
    onmouseover="this.style.transform='scale(1.1)'"
    onmouseout="this.style.transform=''">
    <svg width="24" height="24" fill="none" stroke="white" stroke-width="2" viewBox="0 0 24 24">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
    <span style="position:absolute;top:-3px;right:-3px;width:18px;height:18px;
      background:#c8a846;border-radius:50%;border:2px solid white;
      display:flex;align-items:center;justify-content:center;
      font-size:9px;font-weight:800;color:#0f2d5a;font-family:Outfit">AI</span>
  </div>`;
  document.body.appendChild(bubble);

  const panel = document.createElement('div');
  panel.id = 'csi-chat-panel';
  panel.style.cssText = `
    position:fixed;bottom:96px;right:28px;z-index:9998;width:380px;
    background:white;border-radius:16px;display:none;flex-direction:column;
    box-shadow:0 8px 40px rgba(15,45,90,.2);border:1px solid #e4e8f0;overflow:hidden`;
  panel.innerHTML = `
    <div style="background:linear-gradient(135deg,#0f2d5a,#1e4a8a);padding:14px 18px;flex-shrink:0">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:36px;height:36px;background:rgba(255,255,255,.15);border-radius:10px;
          display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg width="18" height="18" fill="none" stroke="white" stroke-width="2" viewBox="0 0 24 24">
            <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
        </div>
        <div style="flex:1">
          <div style="font-family:Outfit;font-weight:700;font-size:14px;color:white">CSI Analyst AI</div>
          <div style="font-size:11px;color:rgba(255,255,255,.65)">
            ${analysisCtx?.company_name || 'Analysis'} · ${analysisCtx?.analysis?.risk_level || '?'} Risk ·
            ${(analysisCtx?.analysis?.incident_log || []).length} incidents
          </div>
        </div>
        <button onclick="toggleChatPanel()" style="background:rgba(255,255,255,.15);border:none;
          color:white;width:28px;height:28px;border-radius:8px;cursor:pointer;
          display:flex;align-items:center;justify-content:center">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>

    <div id="chat-suggestions" style="padding:10px 14px;border-bottom:1px solid #f1f5f9;flex-shrink:0;background:#fafbfc">
      <div style="font-size:10px;color:#94a3b8;margin-bottom:6px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Quick questions</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px">
        ${['Explain incident #1', 'Why High risk?', 'What to fix first?',
           'Remove incident #2 — incorrect', 'What are the penalties?'].map(s => `
          <button onclick="useChatSuggestion('${s}')" style="background:#f0f4ff;border:1px solid #e4e8f0;
            color:#0f2d5a;font-size:11px;padding:3px 10px;border-radius:20px;cursor:pointer;font-family:DM Sans"
            onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#f0f4ff'">${s}</button>`
        ).join('')}
      </div>
    </div>

    <div id="chat-messages" style="flex:1;overflow-y:auto;padding:14px;
      display:flex;flex-direction:column;gap:10px;min-height:160px;max-height:240px">
      <div style="background:#f8fafc;border-radius:10px;padding:12px 14px;
        font-size:12.5px;color:#475569;line-height:1.5">
        👋 I have full context of this analysis. Ask me to <strong>explain</strong> any incident,
        <strong>verify</strong> a finding, or <strong>correct</strong> anything that looks wrong —
        changes apply live to the analysis above.
      </div>
    </div>

    <div style="padding:12px 14px;border-top:1px solid #e4e8f0;flex-shrink:0;background:#fafbfc">
      <div style="display:flex;gap:8px;align-items:flex-end">
        <textarea id="chat-input" placeholder="Ask about any incident, or say 'remove incident #2'..."
          onkeydown="chatKeyDown(event)"
          style="flex:1;border:1.5px solid #e4e8f0;border-radius:10px;padding:8px 12px;
            font-family:DM Sans;font-size:12.5px;resize:none;min-height:38px;max-height:90px;
            outline:none;color:#1a2540;line-height:1.4"
          onfocus="this.style.borderColor='#0f2d5a'" onblur="this.style.borderColor='#e4e8f0'"></textarea>
        <button id="chat-send-btn" onclick="sendChatMessage()" style="width:38px;height:38px;
          background:#0f2d5a;border:none;border-radius:10px;cursor:pointer;flex-shrink:0;
          display:flex;align-items:center;justify-content:center"
          onmouseover="this.style.background='#1e4a8a'" onmouseout="this.style.background='#0f2d5a'">
          <svg width="16" height="16" fill="none" stroke="white" stroke-width="2" viewBox="0 0 24 24">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
          </svg>
        </button>
      </div>
      <div style="font-size:10px;color:#94a3b8;margin-top:5px;text-align:center">
        Changes apply live to the analysis • Shift+Enter for new line
      </div>
    </div>`;
  document.body.appendChild(panel);
}

function toggleChatPanel() {
  const panel = document.getElementById('csi-chat-panel');
  if (!panel) return;
  const isOpen = panel.style.display === 'flex';
  panel.style.display = isOpen ? 'none' : 'flex';
  panel.style.flexDirection = 'column';
  if (!isOpen) setTimeout(() => document.getElementById('chat-input')?.focus(), 100);
}

function useChatSuggestion(text) {
  const input = document.getElementById('chat-input');
  if (input) { input.value = text; input.focus(); }
  document.getElementById('chat-suggestions').style.display = 'none';
}

function chatKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
}

async function sendChatMessage() {
  const input  = document.getElementById('chat-input');
  const msgBox = document.getElementById('chat-messages');
  const btn    = document.getElementById('chat-send-btn');
  if (!input || !msgBox) return;
  const message = input.value.trim();
  if (!message) return;
  if (!state.currentAnalysis) { toast('No analysis loaded — run an analysis first', 'error'); return; }

  input.value = '';
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner" style="width:14px;height:14px;border-width:2px;border-color:rgba(255,255,255,.3);border-top-color:white"></span>`;

  appendChatMsg('user', message, msgBox);
  state.chatHistory.push({ role:'user', content:message });
  const typingEl = appendChatMsg('typing', '', msgBox);

  try {
    const res = await apiPost('/api/chat', {
      message,
      analysis:     state.currentAnalysis.analysis || {},
      history:      state.chatHistory.slice(-8),
      company_name: state.currentAnalysis.company_name || '',
    });
    typingEl.remove();
    const botText = res.response || 'I could not generate a response.';
    appendChatMsg('bot', botText, msgBox, res.action);
    state.chatHistory.push({ role:'assistant', content:botText });
    if (res.action) applyAnalysisAction(res.action);
  } catch (e) {
    typingEl.remove();
    appendChatMsg('bot', 'Sorry, error: ' + e.message, msgBox);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="16" height="16" fill="none" stroke="white" stroke-width="2" viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>`;
  }
}

function appendChatMsg(role, text, container, action) {
  const el = document.createElement('div');
  if (role === 'typing') {
    el.innerHTML = `<div style="background:#f1f5f9;border-radius:10px;padding:10px 14px;
      font-size:12px;color:#94a3b8;display:flex;gap:4px;align-items:center">
      <span style="animation:typingDot 1s .0s infinite both">●</span>
      <span style="animation:typingDot 1s .2s infinite both">●</span>
      <span style="animation:typingDot 1s .4s infinite both">●</span></div>`;
  } else if (role === 'user') {
    el.innerHTML = `<div style="background:#0f2d5a;color:white;border-radius:10px 10px 2px 10px;
      padding:10px 14px;font-size:12.5px;line-height:1.5;
      max-width:88%;margin-left:auto">${esc(text)}</div>`;
  } else {
    const formatted = esc(text).replace(/\n•/g,'<br>•').replace(/\n/g,'<br>');
    let actionBadge = '';
    if (action) {
      const labels = {remove_incident:'🗑 Incident removed',update_incident:'✏ Incident updated',
                      update_risk:'🔄 Risk updated',add_recommendation:'➕ Recommendation added'};
      actionBadge = `<div style="margin-top:8px;padding:6px 10px;background:#dcfce7;border-radius:6px;
        font-size:11px;color:#15803d;font-weight:600">${labels[action.type]||'✓ Applied'}
        ${action.reason?`<div style="font-weight:400;color:#166534;margin-top:2px">${esc(action.reason)}</div>`:''}</div>`;
    }
    el.innerHTML = `<div style="background:#f8fafc;border:1px solid #e4e8f0;border-radius:10px 10px 10px 2px;
      padding:10px 14px;font-size:12.5px;line-height:1.6;color:#334155;max-width:92%">
      <div style="font-size:10px;color:#94a3b8;font-weight:700;margin-bottom:4px;
        text-transform:uppercase;letter-spacing:.5px">CSI Analyst AI</div>
      <div>${formatted}</div>${actionBadge}</div>`;
  }
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

function applyAnalysisAction(action) {
  if (!state.currentAnalysis || !action) return;
  const a   = state.currentAnalysis.analysis;
  const log = a.incident_log || a.non_compliance_findings || [];

  if (action.type === 'remove_incident') {
    const idx = (action.incident_id || 1) - 1;
    if (log[idx]) { log.splice(idx, 1); a.total_incidents = log.length; }
    toast(`Incident #${action.incident_id} removed`, 'success');
  } else if (action.type === 'update_incident') {
    const idx = (action.incident_id || 1) - 1;
    if (log[idx] && action.changes) Object.assign(log[idx], action.changes);
    toast(`Incident #${action.incident_id} updated`, 'success');
  } else if (action.type === 'update_risk') {
    if (action.changes?.risk_level)     a.risk_level    = action.changes.risk_level;
    if (action.changes?.overall_score !== undefined) a.overall_score = action.changes.overall_score;
    if (action.changes?.risk_summary)   a.risk_summary  = action.changes.risk_summary;
    toast('Risk assessment updated', 'success');
  } else if (action.type === 'add_recommendation') {
    if (!a.recommendations) a.recommendations = [];
    a.recommendations.unshift(action.changes);
    toast('Recommendation added', 'success');
  }

  // Re-render keeping chat panel state
  const chatOpen = document.getElementById('csi-chat-panel')?.style.display === 'flex';
  const chatHistory = [...(state.chatHistory || [])];
  renderAnalysis(state.currentAnalysis);
  state.chatHistory = chatHistory;
  if (chatOpen) setTimeout(() => {
    const p = document.getElementById('csi-chat-panel');
    if (p) { p.style.display = 'flex'; p.style.flexDirection = 'column'; }
  }, 80);
}

// ─────────────────────────────────────────────────────────
// EXECUTIVE SUMMARY
// ─────────────────────────────────────────────────────────
async function generateSummary() {
  const cid = document.getElementById('summary-company-sel').value;
  if (!cid) { toast('Please select a company', 'error'); return; }

  const btn = document.getElementById('btn-gen-summary');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Generating...`;

  document.getElementById('summary-content').innerHTML = `
    <div class="loading-overlay">
      <div class="spinner spinner-navy" style="width:36px;height:36px;border-width:3px"></div>
      <p>Generating board-ready executive summary...</p>
      <p style="font-size:12px;margin-top:-8px">This may take 30–60 seconds</p>
    </div>`;

  try {
    const data = await apiPost('/api/summary', { company_id: cid });
    renderSummary(data);
    toast('Executive summary generated', 'success');
  } catch (e) {
    document.getElementById('summary-content').innerHTML = `<div class="empty-state"><h3>Failed</h3><p>${esc(e.message)}</p></div>`;
    toast('Summary failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg> Generate Summary`;
  }
}

async function loadSummaryHistory() {}

function renderSummary(data) {
  const s = data.summary || {};
  const score = s.health_score || 0;
  const statusColor = s.overall_status === 'Satisfactory' ? '#10b981' : s.overall_status === 'Needs Attention' ? '#f59e0b' : '#ef4444';

  document.getElementById('summary-content').innerHTML = `
    <div style="margin-bottom:16px;display:flex;align-items:center;gap:10px">
      <span class="ai-badge"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> AI Generated</span>
      <span style="font-size:12.5px;color:#64748b">${data.company_name} · ${new Date(data.created_at).toLocaleString('en-IN')}</span>
      <button class="btn btn-ghost btn-sm" onclick="printSummary()" style="margin-left:auto">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z"/></svg>
        Print / Export
      </button>
    </div>

    <!-- Header Banner -->
    <div class="card" style="margin-bottom:20px;border-left:4px solid ${statusColor}">
      <div class="card-body" style="padding:24px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px">
          <div>
            <div style="font-family:Outfit;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#64748b;margin-bottom:4px">Executive Compliance Summary</div>
            <div style="font-family:Outfit;font-size:22px;font-weight:800;color:#0f2d5a">${data.company_name}</div>
            <div style="font-size:12.5px;color:#64748b;margin-top:4px">Report Date: ${s.report_date || new Date().toLocaleDateString('en-IN', {day:'2-digit',month:'long',year:'numeric'})}</div>
            <div style="margin-top:12px">
              <span style="display:inline-flex;align-items:center;gap:6px;background:${statusColor}20;color:${statusColor};padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600">
                <span style="width:8px;height:8px;background:${statusColor};border-radius:50%;display:inline-block"></span>
                ${s.overall_status || 'N/A'}
              </span>
            </div>
          </div>
          <div style="text-align:center">
            <div class="score-circle" style="width:90px;height:90px">
              <svg width="90" height="90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#e4e8f0" stroke-width="8"/>
                <circle cx="50" cy="50" r="40" fill="none" stroke="${statusColor}" stroke-width="8"
                  stroke-dasharray="${2*Math.PI*40}" stroke-dashoffset="${2*Math.PI*40*(1-score/100)}" stroke-linecap="round" transform="rotate(-90 50 50)"/>
              </svg>
              <div class="score-num" style="font-size:20px">${score}</div>
            </div>
            <div style="font-size:11px;color:#64748b;margin-top:4px">Compliance Score</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Metrics Row -->
    ${s.key_metrics ? `
    <div class="stats-grid" style="margin-bottom:20px">
      ${[
        ['Total Items', s.key_metrics.total_items, 'navy'],
        ['Compliant', s.key_metrics.compliant, 'success'],
        ['Pending', s.key_metrics.pending, 'warning'],
        ['Non-Compliant', s.key_metrics.non_compliant, 'danger'],
        ['Compliance Rate', s.key_metrics.compliance_rate, 'info'],
        ['Critical (30d)', s.key_metrics.critical_deadlines_30days, 'warning'],
      ].map(([label, val, cls]) => `
        <div class="stat-card">
          <div class="stat-label">${label}</div>
          <div class="stat-value" style="font-size:22px">${val ?? '—'}</div>
        </div>
      `).join('')}
    </div>` : ''}

    <!-- Executive Overview -->
    ${s.executive_overview ? `
    <div class="card" style="margin-bottom:20px">
      <div class="card-header"><h3>Executive Overview</h3></div>
      <div class="card-body">
        <div style="font-size:13.5px;color:#475569;line-height:1.75;white-space:pre-line">${esc(s.executive_overview)}</div>
      </div>
    </div>` : ''}

    <!-- Framework Status + Critical Areas -->
    <div class="grid-2" style="margin-bottom:20px">
      ${s.framework_status?.length ? `
      <div class="card">
        <div class="card-header"><h3>Framework Status</h3></div>
        <div class="card-body">
          ${s.framework_status.map(f => {
            const c = f.status === 'Green' ? '#10b981' : f.status === 'Amber' ? '#f59e0b' : '#ef4444';
            return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #e4e8f0">
              <span style="width:10px;height:10px;background:${c};border-radius:50%;flex-shrink:0"></span>
              <span style="font-weight:600;font-size:13px;flex:1">${esc(f.framework)}</span>
              <span class="badge" style="background:${c}20;color:${c}">${f.status}</span>
              <span style="font-size:12px;color:#64748b">${f.items} items</span>
            </div>`;
          }).join('')}
        </div>
      </div>` : '<div></div>'}

      ${s.immediate_actions?.length ? `
      <div class="card">
        <div class="card-header"><h3>Immediate Actions Required</h3></div>
        <div class="card-body">
          ${s.immediate_actions.map((a,i) => `
            <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #e4e8f0">
              <div style="width:24px;height:24px;background:${i===0?'#ef4444':i===1?'#f59e0b':'#10b981'};color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0">${i+1}</div>
              <div>
                <div style="font-size:13px;font-weight:600">${esc(a.action)}</div>
                <div style="font-size:11.5px;color:#64748b;margin-top:2px">
                  ${a.deadline ? `📅 ${esc(a.deadline)}` : ''} ${a.responsible ? `· 👤 ${esc(a.responsible)}` : ''}
                </div>
                ${a.consequence_if_delayed ? `<div style="font-size:11.5px;color:#ef4444;margin-top:2px">⚠ ${esc(a.consequence_if_delayed)}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>` : '<div></div>'}
    </div>

    <!-- Governance Gaps + Calendar -->
    <div class="grid-2" style="margin-bottom:20px">
      ${s.governance_gaps?.length ? `
      <div class="card">
        <div class="card-header"><h3>Governance Gaps</h3></div>
        <div class="card-body">
          ${s.governance_gaps.map(g => `
            <div class="finding-card medium" style="margin-bottom:8px">
              <div style="font-weight:600;font-size:13px">${esc(g.gap)}</div>
              ${g.impact ? `<div style="font-size:12px;color:#92400e;margin-top:4px">Impact: ${esc(g.impact)}</div>` : ''}
              ${g.recommendation ? `<div style="font-size:12px;color:#475569;margin-top:4px">→ ${esc(g.recommendation)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>` : '<div></div>'}

      ${s.compliance_calendar_90days?.length ? `
      <div class="card">
        <div class="card-header"><h3>90-Day Compliance Calendar</h3></div>
        <div class="card-body" style="max-height:300px;overflow-y:auto">
          ${s.compliance_calendar_90days.map(c => `
            <div class="calendar-item">
              <div class="calendar-info">
                <div class="calendar-title">${esc(c.obligation)}</div>
                <div class="calendar-meta">${esc(c.framework)} · ${esc(c.date)}</div>
              </div>
              <span class="badge ${getPriorityClass(c.priority)}">${c.priority}</span>
            </div>
          `).join('')}
        </div>
      </div>` : '<div></div>'}
    </div>

    <!-- JHS Recommendations -->
    ${s.jhs_recommendations?.length ? `
    <div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <h3>JHS &amp; Associates LLP Recommendations</h3>
        <span class="ai-badge"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> Expert Insights</span>
      </div>
      <div class="card-body">
        <div class="grid-2">
          ${s.jhs_recommendations.map(r => `
            <div style="background:#f8faff;border-radius:8px;padding:14px;border:1px solid #e4e8f0">
              <div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:#0f2d5a;margin-bottom:6px">${esc(r.category)}</div>
              <div style="font-size:13px;color:#475569;line-height:1.5">${esc(r.recommendation)}</div>
              ${r.timeline ? `<div style="font-size:11.5px;color:#64748b;margin-top:6px">⏱ ${esc(r.timeline)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    </div>` : ''}

    <!-- Disclaimer -->
    <div style="background:#f8faff;border-radius:8px;padding:14px 16px;font-size:11.5px;color:#64748b;border:1px solid #e4e8f0">
      <strong>Disclaimer:</strong> ${esc(s.disclaimer || 'This report has been prepared by JHS & Associates LLP based on information provided and is subject to the limitations of an outside-in review.')}
    </div>
  `;
}

function printSummary() {
  window.print();
}

// ─────────────────────────────────────────────────────────
// BENCHMARKING
// ─────────────────────────────────────────────────────────
async function runBenchmarking() {
  const cid = document.getElementById('bench-company-sel').value;
  if (!cid) { toast('Please select a company', 'error'); return; }

  const btn = document.getElementById('btn-run-bench');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Benchmarking...`;

  document.getElementById('bench-content').innerHTML = `
    <div class="loading-overlay">
      <div class="spinner spinner-navy" style="width:36px;height:36px;border-width:3px"></div>
      <p>Benchmarking against top 2 competitors...</p>
    </div>`;

  try {
    const data = await apiPost('/api/benchmarking', { company_id: cid });
    renderBenchmark(data);
    toast('Benchmarking complete', 'success');
  } catch (e) {
    document.getElementById('bench-content').innerHTML = `<div class="empty-state"><h3>Failed</h3><p>${esc(e.message)}</p></div>`;
    toast('Benchmark failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run Benchmark`;
  }
}

async function loadBenchmarkHistory() {}

function renderBenchmark(data) {
  const b = data.benchmark || {};
  const company = state.companies.find(c => c._id === data.company_id);
  const compName = data.company_name || company?.name || 'Company';
  const competitors = data.competitors || [];
  const c1 = competitors[0] || 'Competitor 1';
  const c2 = competitors[1] || 'Competitor 2';

  const scores = [
    { name: compName, score: b.company_score || 0, isMain: true },
    ...(b.competitor_scores || []).map(c => ({ name: c.name, score: c.score, rationale: c.rationale })),
  ];
  const maxScore = Math.max(...scores.map(s => s.score), 1);

  document.getElementById('bench-content').innerHTML = `
    <div style="margin-bottom:16px;display:flex;align-items:center;gap:10px">
      <span class="ai-badge"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> GPT-4o Benchmarking</span>
      <span style="font-size:12.5px;color:#64748b">${compName} · ${new Date(data.created_at).toLocaleString('en-IN')}</span>
    </div>

    <!-- Score Bars -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header">
        <h3>Governance Score Comparison</h3>
        <span class="badge badge-navy">Out of 100</span>
      </div>
      <div class="card-body">
        <div style="display:flex;flex-direction:column;gap:16px">
          ${scores.map(s => `
            <div>
              <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                <span style="font-weight:${s.isMain ? '700' : '500'};font-size:13px;color:${s.isMain ? '#0f2d5a' : '#475569'}">${esc(s.name)}${s.isMain ? ' ← Your Company' : ''}</span>
                <span style="font-family:Outfit;font-size:16px;font-weight:800;color:${s.isMain ? '#0f2d5a' : '#64748b'}">${s.score}</span>
              </div>
              <div class="progress-bar-wrap" style="height:10px">
                <div class="progress-bar-fill ${s.score >= 70 ? 'success' : s.score >= 50 ? 'warning' : 'danger'}" style="width:${s.score}%"></div>
              </div>
              ${s.rationale ? `<div style="font-size:11.5px;color:#64748b;margin-top:4px">${esc(s.rationale)}</div>` : ''}
            </div>
          `).join('')}
          ${b.industry_average_score ? `
          <div style="padding-top:8px;border-top:1px dashed #e4e8f0;display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:12px;color:#64748b;font-style:italic">Industry Average</span>
            <span style="font-family:Outfit;font-size:14px;font-weight:700;color:#64748b">${b.industry_average_score}</span>
          </div>` : ''}
        </div>
      </div>
    </div>

    <!-- Comparison Table -->
    ${b.comparison_table?.length ? `
    <div class="card" style="margin-bottom:20px">
      <div class="card-header"><h3>Parameter-wise Comparison</h3></div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Parameter</th>
              <th>${esc(compName)}</th>
              <th>${esc(c1)}</th>
              <th>${esc(c2)}</th>
              <th>Industry Benchmark</th>
            </tr>
          </thead>
          <tbody>
            ${b.comparison_table.map(row => `
              <tr>
                <td style="font-weight:600;font-size:12.5px">${esc(row.parameter)}</td>
                ${['company', c1, c2].map(key => {
                  const cell = key === 'company' ? row.company : row[c1] || row[key];
                  const statusColors = { Strong: '#10b981', Average: '#f59e0b', Weak: '#ef4444' };
                  const color = statusColors[cell?.status] || '#64748b';
                  return `<td>
                    <div style="font-size:12.5px">${esc(cell?.value || '—')}</div>
                    ${cell?.status ? `<span style="font-size:10px;color:${color};font-weight:600">${cell.status}</span>` : ''}
                  </td>`;
                }).join('')}
                <td style="font-size:12px;color:#64748b;font-style:italic">${esc(row.industry_benchmark || '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    <!-- Strengths & Gaps -->
    <div class="grid-2" style="margin-bottom:20px">
      ${b.competitive_strengths?.length ? `
      <div class="card">
        <div class="card-header"><h3>Competitive Strengths</h3></div>
        <div class="card-body">
          ${b.competitive_strengths.map(s => `
            <div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid #e4e8f0">
              <span style="color:#10b981;flex-shrink:0">✓</span>
              <span style="font-size:13px">${esc(s)}</span>
            </div>
          `).join('')}
        </div>
      </div>` : '<div></div>'}

      ${b.competitive_gaps?.length ? `
      <div class="card">
        <div class="card-header"><h3>Areas for Improvement</h3></div>
        <div class="card-body">
          ${b.competitive_gaps.map(g => `
            <div class="finding-card medium" style="margin-bottom:8px">
              <div style="font-weight:600;font-size:13px">${esc(g.gap)}</div>
              ${g.competitor_best ? `<div style="font-size:12px;color:#92400e;margin-top:3px">Best practice: ${esc(g.competitor_best)}</div>` : ''}
              ${g.improvement_action ? `<div style="font-size:12px;color:#475569;margin-top:3px">→ ${esc(g.improvement_action)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>` : '<div></div>'}
    </div>

    <!-- Overall Assessment -->
    ${b.overall_assessment ? `
    <div class="card">
      <div class="card-header"><h3>Overall Assessment</h3></div>
      <div class="card-body">
        <p style="font-size:13.5px;color:#475569;line-height:1.7">${esc(b.overall_assessment)}</p>
      </div>
    </div>` : ''}
  `;
}

// ─────────────────────────────────────────────────────────
// QUESTION BANK
// ─────────────────────────────────────────────────────────
let _qRole = 'director';
function setQRole(role) {
  _qRole = role;
  document.getElementById('btn-directors').style.background = role === 'director' ? '#0f2d5a' : '';
  document.getElementById('btn-directors').style.color = role === 'director' ? 'white' : '';
  document.getElementById('btn-auditors').style.background = role === 'auditor' ? '#0f2d5a' : '';
  document.getElementById('btn-auditors').style.color = role === 'auditor' ? 'white' : '';
}

async function generateQuestions() {
  const cid = document.getElementById('q-company-sel').value;
  if (!cid) { toast('Please select a company', 'error'); return; }

  const btn = document.getElementById('btn-gen-q');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Generating...`;

  document.getElementById('questions-content').innerHTML = `
    <div class="loading-overlay">
      <div class="spinner spinner-navy" style="width:36px;height:36px;border-width:3px"></div>
      <p>Generating curated question bank...</p>
    </div>`;

  try {
    const data = await apiPost('/api/questions', { company_id: cid, role: _qRole });
    renderQuestions(data);
    toast('Question bank generated', 'success');
  } catch (e) {
    document.getElementById('questions-content').innerHTML = `<div class="empty-state"><h3>Failed</h3><p>${esc(e.message)}</p></div>`;
    toast('Failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> Generate`;
  }
}

async function loadQuestionsHistory() {}

function renderQuestions(data) {
  const qd = data.questions_data || {};
  const questions = qd.questions || [];

  // Group by category
  const grouped = {};
  questions.forEach(q => {
    const cat = q.category || 'General';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(q);
  });

  document.getElementById('questions-content').innerHTML = `
    <div style="margin-bottom:16px;display:flex;align-items:center;gap:10px">
      <span class="ai-badge"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> GPT-4o Generated</span>
      <span style="font-size:12.5px;color:#64748b">${data.company_name} · ${data.role_title} · ${new Date(data.created_at).toLocaleString('en-IN')}</span>
      <span class="badge badge-navy" style="margin-left:auto">${questions.length} questions</span>
    </div>

    <div class="info-box" style="margin-bottom:20px">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      These questions are specifically curated for the <strong>${data.role_title}</strong> of <strong>${data.company_name}</strong> based on their current compliance status and risk findings.
    </div>

    ${Object.entries(grouped).map(([cat, qs]) => `
      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <h3>${esc(cat)}</h3>
          <span class="badge badge-navy">${qs.length} questions</span>
        </div>
        <div class="card-body">
          ${qs.map((q, i) => `
            <div class="question-card">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
                <div class="question-num">Q${q.id || i+1} · ${q.priority || 'Medium'} Priority</div>
                <div style="display:flex;gap:5px;flex-shrink:0">
                  <span class="badge ${getPriorityClass(q.priority)}">${q.priority}</span>
                  ${q.applicable_regulation ? `<span class="badge badge-navy" style="font-size:10px">${esc(q.applicable_regulation)}</span>` : ''}
                </div>
              </div>
              <div class="question-text">${esc(q.question)}</div>
              <div class="question-rationale">💡 ${esc(q.rationale || '')}</div>
              ${q.follow_up ? `<div class="question-followup">→ Follow-up: ${esc(q.follow_up)}</div>` : ''}
              ${q.expected_answer_elements?.length ? `
                <div style="margin-top:8px">
                  <div style="font-size:11px;font-weight:700;color:#0f2d5a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Expected answer elements:</div>
                  <div style="display:flex;gap:5px;flex-wrap:wrap">
                    ${q.expected_answer_elements.map(e => `<span class="chip">${esc(e)}</span>`).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  `;
}

// ─────────────────────────────────────────────────────────
// DOCUMENTS
// ─────────────────────────────────────────────────────────
async function loadDocuments() {
  const cid = document.getElementById('docs-company-filter')?.value || state.globalCompany || '';
  const url = cid ? `/api/documents?company_id=${cid}` : '/api/documents';
  try {
    const docs = await apiFetch(url);
    renderDocuments(docs);
  } catch (e) {
    toast('Failed to load documents: ' + e.message, 'error');
  }
}

function renderDocuments(docs) {
  const tbody = document.getElementById('docs-tbody');
  const empty = document.getElementById('docs-empty');
  if (!tbody) return;

  if (!docs.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = docs.map(doc => {
    const company = state.companies.find(c => c._id === doc.company_id);
    const typeColors = { PDF: '#ef4444', XLSX: '#10b981', XLS: '#10b981', CSV: '#06b6d4', DOC: '#2563eb', DOCX: '#2563eb' };
    const tc = typeColors[doc.file_type] || '#64748b';
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;background:${tc}20;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:${tc}">${esc(doc.file_type)}</div>
          <div>
            <div style="font-weight:600;font-size:13px">${esc(doc.original_filename)}</div>
            <div style="font-size:11px;color:#64748b">${esc(doc.stored_filename)}</div>
          </div>
        </div>
      </td>
      <td><span class="badge" style="background:${tc}20;color:${tc}">${esc(doc.file_type)}</span></td>
      <td style="font-size:12.5px;color:#64748b">${esc(doc.file_size_readable || '—')}</td>
      <td style="font-size:12.5px">${company ? esc(company.name) : '<span style="color:#64748b">—</span>'}</td>
      <td style="font-size:12.5px;color:#64748b">${new Date(doc.uploaded_at).toLocaleString('en-IN')}</td>
      <td>
        <button class="btn-icon danger" onclick="deleteDocument('${doc._id}')">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        </button>
      </td>
    </tr>`;
  }).join('');
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('upload-area').classList.remove('drag-over');
  const files = e.dataTransfer.files;
  if (files.length) uploadFiles(files);
}

async function uploadFiles(files) {
  const cid = document.getElementById('docs-company-filter')?.value || state.globalCompany || '';
  let uploaded = 0;
  for (const file of Array.from(files)) {
    const fd = new FormData();
    fd.append('file', file);
    if (cid) fd.append('company_id', cid);
    try {
      await fetch('/api/documents', { method: 'POST', body: fd });
      uploaded++;
    } catch (e) {
      toast(`Failed to upload ${file.name}`, 'error');
    }
  }
  if (uploaded) {
    toast(`${uploaded} file${uploaded > 1 ? 's' : ''} uploaded`, 'success');
    loadDocuments();
  }
}

async function deleteDocument(id) {
  if (!confirm('Delete this document?')) return;
  await apiFetch(`/api/documents/${id}`, { method: 'DELETE' });
  toast('Document deleted', 'success');
  loadDocuments();
}

// ─────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────
function toggleRefs(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getStatusClass(status) {
  const m = { compliant: 'badge-success', pending: 'badge-warning', 'non-compliant': 'badge-danger' };
  return m[status] || 'badge-gray';
}

function getPriorityClass(priority) {
  const m = { high: 'priority-high', medium: 'priority-medium', low: 'priority-low', High: 'priority-high', Medium: 'priority-medium', Low: 'priority-low' };
  return m[priority] || 'badge-gray';
}

function getSeverityClass(sev) {
  const m = { Critical: 'badge-danger', High: 'badge-danger', Medium: 'badge-warning', Low: 'badge-success' };
  return m[sev] || 'badge-gray';
}

// ─────────────────────────────────────────────────────────
// Load Chart.js dynamically
// ─────────────────────────────────────────────────────────
(function() {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
  s.onload = () => { if (state.currentPage === 'dashboard') loadDashboard(); };
  document.head.appendChild(s);
})();