// ============================================================
// LITPAX IMS — app.js v4.9
// API URL: change here if redeployed
// ============================================================

const API = 'https://script.google.com/macros/s/AKfycbxZINt8m6S0QR7fk_W69b9hzSSrPkOP8II4anw_dT_ch0QRLGnroLQT5mkSK4npmngT/exec';

function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function showEl(id, show) { const el = document.getElementById(id); if (el) el.style.display = show ? 'inline' : 'none'; }

const DEPTS = ['Volt Wing','Ampere Wing','Volt x Ampere Wing','Mega Grid','Cathodic Wing','Future Cell','Phoenix Wing','Other'];

// ── ROLES & PINS ──
const ROLES = {
  admin:   { pin: '1234', name: 'Admin',   homePage: 'dashboard',    pages: ['dashboard','inward','outward','dispatch','wip','requests','items','opening','bom','indent','stock','reorder','closing'] },
  ajay:    { pin: '0001', name: 'Ajay',    homePage: 'ajay-dash',    pages: ['ajay-dash','inward','outward','requests','items','opening','bom','indent','stock','reorder'] },
  sandeep: { pin: '0002', name: 'Sandeep', homePage: 'sandeep-dash', pages: ['sandeep-dash','dispatch','wip','stock','items','bom'] },
};

let _currentRole = null;
let _selectedRole = null;

function selectRole(role) {
  _selectedRole = role;
  document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('role-' + role).classList.add('active');
  document.getElementById('login-pin').focus();
  document.getElementById('login-err').style.display = 'none';
}

function doLogin() {
  const pin = document.getElementById('login-pin').value;
  const err = document.getElementById('login-err');
  if (!_selectedRole) { err.textContent = '❌ Pehle role select karo'; err.style.display = 'block'; return; }
  if (pin !== ROLES[_selectedRole].pin) { err.style.display = 'block'; err.textContent = '❌ Galat PIN — dobara try karo'; document.getElementById('login-pin').value = ''; return; }
  _currentRole = _selectedRole;
  localStorage.setItem('lpx_role', _currentRole);
  localStorage.setItem('lpx_name', ROLES[_currentRole].name);
  showApp();
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'flex';
  applyRoleUI();
  const role = ROLES[_currentRole];
  showPage(role ? role.homePage : 'dashboard');
}

function applyRoleUI() {
  const role = ROLES[_currentRole];
  if (!role) return;
  document.querySelectorAll('.ni[data-page]').forEach(ni => {
    const page = ni.getAttribute('data-page');
    ni.style.display = role.pages.includes(page) ? 'flex' : 'none';
  });
  document.querySelectorAll('.ng').forEach(ng => {
    const items = ng.querySelectorAll('.ni[data-page]');
    const hasVisible = Array.from(items).some(i => i.style.display !== 'none');
    const label = ng.querySelector('.ng-label');
    if (label) label.style.display = hasVisible ? '' : 'none';
  });
  const greetEl = document.getElementById('dash-greeting');
  if (greetEl) {
    const now = new Date();
    const hr = now.getHours();
    const g = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    greetEl.textContent = `${g}, ${role.name} 👋`;
  }
  const lb = document.getElementById('logout-btn');
  if (lb) lb.style.display = 'block';
  const rl = document.getElementById('logout-role-label');
  if (rl) rl.textContent = role.name;
  // Sidebar today activity — admin only
  const sbTxnNg = document.getElementById('sb-txn-ng');
  if (sbTxnNg) sbTxnNg.style.display = _currentRole === 'admin' ? 'block' : 'none';
}

function logout() {
  localStorage.removeItem('lpx_role');
  localStorage.removeItem('lpx_name');
  _currentRole = null; _selectedRole = null;
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-shell').style.display = 'none';
  const lb2 = document.getElementById('logout-btn');
  if (lb2) lb2.style.display = 'none';
  document.getElementById('login-pin').value = '';
  document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
}

// ── STATE ──
let _items   = [];
let _stocks  = [];
let _boms    = [];
let _bomRows = [];
let _editItemName = null;
let _editBomName  = null;
let _clRows  = [];
let _clDate  = '';

// ── UTILS ──
function today() { return new Date().toISOString().slice(0, 10); }
function fmtD(d) {
  if (!d) return '—';
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch(e) { return d; }
}
function fmtDT(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch(e) { return ts; }
}

// ── API ──
async function api(action, body) {
  try {
    let r;
    if (body) {
      r = await fetch(API, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action, ...body }),
      });
    } else {
      r = await fetch(`${API}?action=${action}`, { redirect: 'follow' });
    }
    const text = await r.text();
    const d = JSON.parse(text);
    if (d.error) throw new Error(d.error);
    return d;
  } catch(e) {
    throw new Error(e.message || 'Network error');
  }
}

// ── INIT ──
window.onload = async function() {
  const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; };
  setVal('cl-date', today());
  setVal('in-date', today());
  setVal('out-date', today());
  setVal('dis-date', today());
  setVal('in-date-f', today());
  setVal('out-date-f', today());
  setDot('loading', 'Connecting...');
  const savedRole = localStorage.getItem('lpx_role');
  if (savedRole && ROLES[savedRole]) {
    _currentRole = savedRole;
    showApp();
  } else {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-shell').style.display = 'none';
  }
};

// ── CONNECTION ──
function setDot(state, label) {
  const d = document.getElementById('api-dot');
  const l = document.getElementById('api-lbl');
  if (d) d.className = 'dot ' + state;
  if (l) l.textContent = label;
}

// ── NAV ──
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('active'));
  const pg = document.getElementById('page-' + id);
  if (pg) pg.classList.add('active');
  document.querySelectorAll('.ni').forEach(n => {
    if (n.getAttribute('onclick') === `showPage('${id}')`) n.classList.add('active');
  });
  if (id === 'dashboard')    loadDash();
  if (id === 'ajay-dash')    loadAjayDash();
  if (id === 'sandeep-dash') loadSandeepDash();
  if (id === 'inward')       loadInward();
  if (id === 'outward')      loadOutward();
  if (id === 'dispatch')     loadDispatch();
  if (id === 'items')        loadItems();
  if (id === 'bom')          loadBom();
  if (id === 'stock')        loadStock();
  if (id === 'reorder')      loadReorder();
  if (id === 'closing')      { document.getElementById('cl-date').value = today(); genClosing(); }
  if (id === 'opening')      loadOpeningStock();
  if (id === 'indent')       loadIndents();
  if (id === 'requests')     loadRequests();
  if (id === 'wip')          loadWip();
  if (id === 'ajay-dash')    loadAjayDash();
  if (id === 'sandeep-dash') loadSandeepDash();
}

// ── BADGES ──
function catBadge(c) {
  const m = { 'Raw Material': 'b-rm', 'Consumable': 'b-con', 'Packaging': 'b-pkg' };
  return `<span class="badge ${m[c] || 'b-rm'}">${c || '—'}</span>`;
}
function stBadge(s) {
  if (s === 'Critical') return `<span class="badge b-cr">● Critical</span>`;
  if (s === 'Reorder')  return `<span class="badge b-ro">▲ Reorder</span>`;
  return `<span class="badge b-ok">✓ OK</span>`;
}
function depBadge(d) {
  return d ? `<span class="badge b-dep">${d}</span>` : '—';
}

// ── DASHBOARD (ADMIN) ──
async function loadDash() {
  const now = new Date();
  const hr = now.getHours();
  const greeting = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  const greetEl = document.getElementById('dash-greeting');
  if (greetEl) {
    const rname = _currentRole ? ROLES[_currentRole].name : 'Admin';
    greetEl.textContent = `${greeting}, ${rname} 👋`;
  }
  setEl('dash-date', now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  if (_currentRole === 'ajay') { await loadAjayDash(); return; }
  if (_currentRole === 'sandeep') { await loadSandeepDash(); return; }
  try {
    const d = await api('getDashboard');
    _stocks = d.stocks || [];
    setEl('s-total', d.totalItems || 0);
    setEl('s-ro',    d.reorderCount || 0);
    setEl('s-wip',   (d.wipItems||[]).length || 0);

    const nb = document.getElementById('nb');
    if (nb) { nb.style.display = d.reorderCount > 0 ? 'inline' : 'none'; nb.textContent = d.reorderCount; }
    const nbi = document.getElementById('nb-indent');
    if (nbi) { nbi.style.display = d.pendingIndents > 0 ? 'inline' : 'none'; nbi.textContent = d.pendingIndents; }
    const nbr = document.getElementById('nb-req');
    if (nbr) { nbr.style.display = d.pendingRequests > 0 ? 'inline' : 'none'; nbr.textContent = d.pendingRequests; }

    // Sidebar inward/outward (admin)
    loadSbActivity();

    // ── 3 CHARTS ──
    renderReorderChart(d.stocks || []);
    renderWipChart(d.wipItems || []);
    renderCategoryChart(d.stocks || []);

    setDot('ok', 'Connected');
  } catch(e) {
    toast(e.message, 'err');
    setDot('err', 'Error');
  }
}

// ── INWARD ──
async function loadInward() {
  const dateF = document.getElementById('in-date-f').value;
  document.getElementById('in-tb').innerHTML = `<tr class="lrow"><td colspan="8"><span class="loader"></span></td></tr>`;
  try {
    const rows = await api('getInward', dateF ? { date: dateF } : {});
    renderInward(rows);
  } catch(e) { toast(e.message, 'err'); }
}
function renderInward(rows) {
  const tb = document.getElementById('in-tb');
  const em = document.getElementById('in-empty');
  if (!rows.length) { tb.innerHTML = ''; em.style.display = 'block'; return; }
  em.style.display = 'none';
  tb.innerHTML = rows.map(r => `<tr>
    <td style="color:var(--muted);font-size:12px;">${fmtD(r.date)}</td>
    <td style="font-weight:500;">${r.itemName}</td>
    <td style="font-family:var(--mono);font-weight:700;color:var(--green);">+${r.qty}</td>
    <td style="color:var(--muted);font-size:12px;">${r.unit || '—'}</td>
    <td>${r.supplier || '—'}</td>
    <td style="font-family:var(--mono);font-size:11px;color:var(--muted);">${r.invoice || '—'}</td>
    <td style="font-size:12px;color:var(--muted);">${r.by || '—'}</td>
    <td style="font-size:12px;color:var(--muted);">${r.remarks || '—'}</td>
  </tr>`).join('');
}

function openInwardModal() {
  // Ensure stocks loaded for category filter
  if (!_stocks.length && !_items.length) {
    api('getStockSummary').then(d => { _stocks = d; _items = d; }).catch(() => {});
  }
  document.getElementById('in-cat').value = '';
  document.getElementById('in-item').innerHTML = '<option value="">-- Select Category first --</option>';
  document.getElementById('in-qty').value = '';
  document.getElementById('in-date').value = today();
  document.getElementById('in-supplier').value = '';
  document.getElementById('in-invoice').value = '';
  document.getElementById('in-by').value = 'Ajay';
  document.getElementById('in-remarks').value = '';
  document.getElementById('in-stock-info').style.display = 'none';
  document.getElementById('inward-modal').classList.add('open');
}

function filterInwardItems() {
  const cat = document.getElementById('in-cat').value;
  const sel = document.getElementById('in-item');
  sel.innerHTML = '<option value="">-- Select Item --</option>';
  document.getElementById('in-stock-info').style.display = 'none';
  if (!cat) return;
  const filtered = _items.filter(i => i.cat === cat);
  if (!filtered.length && _stocks.length) {
    _stocks.filter(s => s.cat === cat).forEach(s => {
      sel.innerHTML += `<option value="${s.name}">${s.name}</option>`;
    });
  } else {
    filtered.forEach(i => {
      sel.innerHTML += `<option value="${i.name}">${i.name}</option>`;
    });
  }
}

async function updInwardInfo() {
  const name = document.getElementById('in-item').value;
  const inf  = document.getElementById('in-stock-info');
  if (!name) { inf.style.display = 'none'; return; }
  const s = _stocks.find(x => x.name === name);
  if (s) {
    document.getElementById('in-cs').textContent  = `${s.currentStock} ${s.unit || ''}`;
    document.getElementById('in-rp').textContent  = `${s.reorderPoint} ${s.unit || ''}`;
    document.getElementById('in-mit').textContent = `${s.mit || 0} ${s.unit || ''}`;
    inf.style.display = 'block';
  }
}

async function saveInward() {
  const itemName = document.getElementById('in-item').value;
  const qty      = Number(document.getElementById('in-qty').value);
  const date     = document.getElementById('in-date').value;
  if (!itemName) { toast('Please select an item', 'err'); return; }
  if (!qty || qty <= 0) { toast('Enter a valid quantity', 'err'); return; }
  const btn = document.getElementById('in-btn');
  btn.disabled = true; btn.textContent = 'Saving...';
  try {
    await api('addInward', {
      itemName, qty, date,
      supplier: document.getElementById('in-supplier').value,
      invoice:  document.getElementById('in-invoice').value,
      by:       document.getElementById('in-by').value || 'Ajay',
      remarks:  document.getElementById('in-remarks').value,
    });
    toast('Inward saved ✓', 'ok');
    closeM('inward-modal');
    _stocks = [];
    loadInward();
    loadDash();
  } catch(e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = 'Save Inward'; }
}

// ── OUTWARD ──
async function loadOutward() {
  const dateF = document.getElementById('out-date-f').value;
  const deptF = document.getElementById('out-dept-f').value;
  document.getElementById('out-tb').innerHTML = `<tr class="lrow"><td colspan="8"><span class="loader"></span></td></tr>`;
  try {
    const body = {};
    if (dateF) body.date = dateF;
    if (deptF) body.department = deptF;
    const rows = await api('getOutward', body);
    renderOutward(rows);
  } catch(e) { toast(e.message, 'err'); }
}
function renderOutward(rows) {
  const tb = document.getElementById('out-tb');
  const em = document.getElementById('out-empty');
  if (!rows.length) { tb.innerHTML = ''; em.style.display = 'block'; return; }
  em.style.display = 'none';
  tb.innerHTML = rows.map(r => `<tr>
    <td style="color:var(--muted);font-size:12px;">${fmtD(r.date)}</td>
    <td style="font-weight:500;">${r.itemName}</td>
    <td style="font-family:var(--mono);font-weight:700;color:var(--red);">-${r.qty}</td>
    <td style="color:var(--muted);font-size:12px;">${r.unit || '—'}</td>
    <td>${depBadge(r.department)}</td>
    <td style="font-size:12px;">${r.issuedTo || '—'}</td>
    <td style="font-size:12px;color:var(--muted);">${r.by || '—'}</td>
    <td style="font-size:12px;color:var(--muted);">${r.remarks || '—'}</td>
  </tr>`).join('');
}
function clearOutFilters() {
  document.getElementById('out-date-f').value = '';
  document.getElementById('out-dept-f').value = '';
  loadOutward();
}

function openOutwardModal() {
  if (!_stocks.length && !_items.length) {
    api('getStockSummary').then(d => { _stocks = d; _items = d; }).catch(() => {});
  }
  document.getElementById('out-cat').value = '';
  document.getElementById('out-item').innerHTML = '<option value="">-- Select Category first --</option>';
  document.getElementById('out-qty').value = '';
  document.getElementById('out-date').value = today();
  document.getElementById('out-dept').value = '';
  document.getElementById('out-issuedto').value = '';
  document.getElementById('out-by').value = 'Ajay';
  document.getElementById('out-remarks').value = '';
  document.getElementById('out-stock-info').style.display = 'none';
  document.getElementById('outward-modal').classList.add('open');
}

function filterOutwardItems() {
  const cat = document.getElementById('out-cat').value;
  const sel = document.getElementById('out-item');
  sel.innerHTML = '<option value="">-- Select Item --</option>';
  document.getElementById('out-stock-info').style.display = 'none';
  if (!cat) return;
  const src = _stocks.length ? _stocks : _items;
  src.filter(s => s.cat === cat).forEach(s => {
    sel.innerHTML += `<option value="${s.name}">${s.name}</option>`;
  });
}

async function updOutwardInfo() {
  const name = document.getElementById('out-item').value;
  const inf  = document.getElementById('out-stock-info');
  if (!name) { inf.style.display = 'none'; return; }
  let s = _stocks.find(x => x.name === name);
  if (!s) {
    try {
      const d = await api('getDashboard');
      _stocks = d.stocks || [];
      s = _stocks.find(x => x.name === name);
    } catch(e) {}
  }
  if (s) {
    document.getElementById('out-cs').textContent = `${s.currentStock} ${s.unit || ''}`;
    document.getElementById('out-rp').textContent = `${s.reorderPoint} ${s.unit || ''}`;
    inf.style.display = 'block';
  }
}

async function saveOutward() {
  const itemName   = document.getElementById('out-item').value;
  const qty        = Number(document.getElementById('out-qty').value);
  const date       = document.getElementById('out-date').value;
  const department = document.getElementById('out-dept').value;
  if (!itemName)   { toast('Please select an item', 'err'); return; }
  if (!qty || qty <= 0) { toast('Enter a valid quantity', 'err'); return; }
  if (!department) { toast('Please select a department', 'err'); return; }
  const btn = document.getElementById('out-btn');
  btn.disabled = true; btn.textContent = 'Saving...';
  try {
    await api('addOutward', {
      itemName, qty, date, department,
      issuedTo: document.getElementById('out-issuedto').value,
      by:       document.getElementById('out-by').value || 'Ajay',
      remarks:  document.getElementById('out-remarks').value,
    });
    toast('Outward saved ✓', 'ok');
    closeM('outward-modal');
    _stocks = [];
    if (window._pendingReqId) {
      api('closeRequest', { id: window._pendingReqId, closedBy: document.getElementById('out-by').value || 'Ajay' })
        .then(() => { window._pendingReqId = null; loadRequests(); })
        .catch(() => {});
    }
    loadOutward();
    loadDash();
  } catch(e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = 'Save Outward'; }
}

// ── DISPATCH ──
async function loadDispatch() {
  document.getElementById('dis-tb').innerHTML = `<tr class="lrow"><td colspan="8"><span class="loader"></span></td></tr>`;
  try {
    const rows = await api('getDispatch', {});
    renderDispatch(rows);
  } catch(e) { toast(e.message, 'err'); }
}
function renderDispatch(rows) {
  const tb = document.getElementById('dis-tb');
  const em = document.getElementById('dis-empty');
  if (!rows.length) { tb.innerHTML = ''; em.style.display = 'block'; return; }
  em.style.display = 'none';
  tb.innerHTML = rows.map(r => `<tr>
    <td style="color:var(--muted);font-size:12px;">${fmtD(r.date)}</td>
    <td style="font-weight:600;">${r.bomModel}</td>
    <td style="font-family:var(--mono);font-weight:700;color:var(--accent);">${r.qtyProduced}</td>
    <td>${r.dispatchTo || '—'}</td>
    <td style="font-family:var(--mono);font-size:11px;">${r.orderRef || '—'}</td>
    <td style="font-size:12px;color:var(--muted);">${r.by || '—'}</td>
    <td>${r.bomVerified === 'YES' ? '<span class="badge b-ok">✓ Yes</span>' : '<span class="badge b-ro">Pending</span>'}</td>
    <td style="font-size:12px;color:var(--muted);">${r.remarks || '—'}</td>
  </tr>`).join('');
}

async function openDispatchModal() {
  document.getElementById('dis-qty').value = '1';
  document.getElementById('dis-date').value = today();
  document.getElementById('dis-to').value = '';
  document.getElementById('dis-ref').value = '';
  document.getElementById('dis-by').value = 'Sandeep';
  document.getElementById('dis-remarks').value = '';
  document.getElementById('dis-preview').innerHTML = '';
  try {
    const d = await api('getDashboard');
    _stocks = d.stocks || [];
    _items  = _stocks;
  } catch(e) {}
  await populateBomSelect('dis-bom');
  document.getElementById('dispatch-modal').classList.add('open');
}

async function updDispatchPreview() {
  const bomName = document.getElementById('dis-bom').value;
  const qty     = Number(document.getElementById('dis-qty').value) || 1;
  const preview = document.getElementById('dis-preview');
  const btn     = document.getElementById('dis-btn');
  if (!bomName) { preview.innerHTML = ''; return; }
  try {
    const items = await api('getBomItems', { bomName });
    if (!items.length) { preview.innerHTML = '<div style="color:var(--muted);font-size:12px;margin-top:10px;">No components found for this BOM</div>'; return; }
    const stockMap = {};
    _stocks.forEach(s => { stockMap[s.name] = s; });

    let hasShortage = false;
    const rows = items.map(bi => {
      const needed = bi.qty * qty;
      const s = stockMap[bi.component];
      // Store stock + WIP dono milake available hai
      const storeQty = s ? s.currentStock : 0;
      const wipQty   = s ? (s.wip || 0) : 0;
      const avail    = storeQty + wipQty;
      const ok = avail >= needed;
      if (!ok) hasShortage = true;
      return `<div class="bom-preview-row">
        <span class="comp">${bi.component}</span>
        <span class="qty" style="color:${ok ? 'var(--green)' : 'var(--red)'}">
          ${needed} ${bi.unit} ${ok ? '✓' : `⚠ (avail: ${avail})`}
        </span>
      </div>`;
    });

    preview.innerHTML = `<div class="bom-preview">
      <div class="bp-title">Components required (×${qty})</div>
      ${rows.join('')}
      ${hasShortage ? `<div style="margin-top:10px;padding:8px 10px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;font-size:12px;color:var(--red);font-weight:600;">⛔ Insufficient stock — dispatch nahi ho sakta</div>` : ''}
    </div>`;

    // Block/unblock confirm button
    if (btn) {
      btn.disabled = hasShortage;
      btn.style.opacity = hasShortage ? '0.4' : '1';
      btn.style.cursor  = hasShortage ? 'not-allowed' : 'pointer';
    }
  } catch(e) { preview.innerHTML = ''; }
}

async function saveDispatch() {
  const bomModel    = document.getElementById('dis-bom').value;
  const qtyProduced = Number(document.getElementById('dis-qty').value);
  const date        = document.getElementById('dis-date').value;
  if (!bomModel) { toast('Select a BOM model', 'err'); return; }
  if (!qtyProduced || qtyProduced <= 0) { toast('Enter a valid quantity', 'err'); return; }
  const btn = document.getElementById('dis-btn');
  if (btn.disabled) { toast('Stock insufficient — dispatch nahi ho sakta', 'err'); return; }
  btn.disabled = true; btn.textContent = 'Processing...';
  try {
    const r = await api('addDispatch', {
      bomModel, qtyProduced, date,
      dispatchTo: document.getElementById('dis-to').value,
      orderRef:   document.getElementById('dis-ref').value,
      by:         document.getElementById('dis-by').value || 'Sandeep',
      remarks:    document.getElementById('dis-remarks').value,
    });
    toast(`Dispatch saved ✓ — ${r.componentsConsumed} components deducted`, 'ok');
    closeM('dispatch-modal');
    _stocks = [];
    loadDispatch();
    loadDash();
  } catch(e) { toast('⛔ ' + e.message, 'err'); }
  finally { btn.disabled = false; btn.style.opacity = '1'; btn.textContent = 'Confirm Dispatch'; }
}

// ── ITEMS ──
async function loadItems() {
  document.getElementById('items-tb').innerHTML = `<tr class="lrow"><td colspan="13"><span class="loader"></span></td></tr>`;
  try {
    const d = await api('getDashboard');
    _stocks = d.stocks || [];
    _items  = _stocks.map(s => s);
    filterItems();
  } catch(e) { toast(e.message, 'err'); }
}

function filterItems() {
  const s  = document.getElementById('item-search').value.toLowerCase();
  const cf = document.getElementById('item-cat-f').value;
  const fl = _items.filter(i =>
    (!s  || i.name.toLowerCase().includes(s)) &&
    (!cf || i.cat === cf)
  );
  const tb = document.getElementById('items-tb');
  const em = document.getElementById('items-empty');
  if (!fl.length) { tb.innerHTML = ''; em.style.display = 'block'; return; }
  em.style.display = 'none';
  tb.innerHTML = fl.map(item => {
    const pct = item.maxL > 0 ? Math.min(100, Math.round(item.currentStock / item.maxL * 100)) : 0;
    const bc  = item.status === 'OK' ? 'var(--green)' : item.status === 'Reorder' ? 'var(--orange)' : 'var(--red)';
    return `<tr>
      <td><div style="font-weight:600;color:var(--navy);">${item.name}</div></td>
      <td>${catBadge(item.cat)}</td>
      <td style="color:var(--muted);font-size:12px;">${item.unit || '—'}</td>
      <td style="font-family:var(--mono);">${item.adc || 0}</td>
      <td style="font-family:var(--mono);">${item.lt || 0}d</td>
      <td style="font-family:var(--mono);">${item.sf || 1}</td>
      <td style="font-family:var(--mono);">${item.moq || 0}</td>
      <td style="font-family:var(--mono);">${item.maxL || 0}</td>
      <td style="font-family:var(--mono);color:var(--orange);font-weight:600;">${item.reorderPoint}</td>
      <td>${(item.mit || 0) > 0 ? `<span style="font-family:var(--mono);color:var(--purple);">🚚${item.mit}</span>` : '—'}</td>
      <td>
        <span style="font-family:var(--mono);font-weight:700;font-size:15px;">${item.currentStock}</span>
        <div class="sbw"><div class="sbf" style="width:${pct}%;background:${bc};"></div></div>
      </td>
      <td>${stBadge(item.status)}</td>
      <td style="white-space:nowrap;">
        <button class="btn bg bsm" onclick="editItem('${item.name.replace(/'/g,"\\'")}')">Edit</button>
        <button class="btn brd bsm" onclick="delItem('${item.name.replace(/'/g,"\\'")}')">Del</button>
      </td>
    </tr>`;
  }).join('');
}

// ── CATEGORY / BRAND CONFIG ──
const CAT_BRANDS = {
  'BMS':        ['JK', 'JBD', 'Daly', 'Solar', 'Other'],
  'Cells':      ['DMEGC', 'EVE', 'BAK', 'LG', 'HLY', 'CATL', 'Other'],
  'Charger':    ['Charge Q', 'Litpax', 'AXIOM', 'SHAKTI', 'XSTRONG POWER', 'Other'],
  'Wire':       ['Copper', 'Silicon', 'Other'],
  'Nickel':     ['Pure', 'Coated', 'Other'],
  'Consumable': ['—'],
  'Packaging':  ['—'],
  'Box':        ['Prismatic', 'Cylindrical', 'Other'],
  'Other':      ['—'],
};
const CAT_UNITS = {
  'BMS': 'Pcs', 'Cells': 'Pcs', 'Charger': 'Pcs',
  'Wire': 'Metres', 'Nickel': 'Kg',
  'Box': 'Pcs', 'Consumable': 'Pcs', 'Packaging': 'Pcs', 'Other': 'Pcs',
};

let _selCat = '', _selBrand = '';

function selectCat(cat) {
  _selCat = cat; _selBrand = '';
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  const brands = CAT_BRANDS[cat] || ['Other'];
  const brandGrid = document.getElementById('brand-grid');
  const brandCustom = document.getElementById('f-brand-custom');
  if (brands.length === 1 && brands[0] === '—') {
    document.getElementById('brand-section').style.display = 'none';
    document.getElementById('model-section').style.display = 'block';
    document.getElementById('item-details').style.display = 'block';
    const unitSel = document.getElementById('f-unit');
    if (unitSel) unitSel.value = CAT_UNITS[cat] || 'Pcs';
    _selBrand = cat;
    updItemName();
  } else {
    brandGrid.innerHTML = brands.map(b =>
      `<button type="button" class="brand-btn" onclick="selectBrand('${b}')">${b}</button>`
    ).join('');
    brandCustom.style.display = 'none';
    document.getElementById('brand-section').style.display = 'block';
    document.getElementById('model-section').style.display = 'none';
    document.getElementById('item-details').style.display = 'none';
    document.getElementById('name-preview').style.display = 'none';
  }
}

function selectBrand(brand) {
  _selBrand = brand;
  document.querySelectorAll('.brand-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  const brandCustom = document.getElementById('f-brand-custom');
  if (brand === 'Other') { brandCustom.style.display = 'block'; brandCustom.focus(); }
  else brandCustom.style.display = 'none';
  document.getElementById('model-section').style.display = 'block';
  document.getElementById('item-details').style.display = 'block';
  const unitSel = document.getElementById('f-unit');
  if (unitSel) unitSel.value = CAT_UNITS[_selCat] || 'Pcs';
  updROP();
  updItemName();
}

function updItemName() {
  const brand = _selBrand === 'Other'
    ? (document.getElementById('f-brand-custom').value.trim() || 'Other')
    : _selBrand;
  const model = (document.getElementById('f-model').value || '').trim();
  let name = '';
  if (['Consumable','Packaging','Other'].includes(_selCat)) {
    name = model || _selCat;
  } else {
    name = [_selCat, brand, model].filter(Boolean).join(' ');
  }
  const preview = document.getElementById('f-name-preview');
  const nameInput = document.getElementById('f-name');
  const namePreviewDiv = document.getElementById('name-preview');
  if (name && model) {
    preview.textContent = name;
    if (nameInput) nameInput.value = name;
    namePreviewDiv.style.display = 'block';
  } else {
    namePreviewDiv.style.display = 'none';
  }
}

function openItemModal(name) {
  _editItemName = name || null;
  _selCat = ''; _selBrand = '';
  if (name) {
    const item = _items.find(i => i.name === name);
    if (!item) return;
    document.getElementById('im-title').textContent = 'Edit Item';
    document.getElementById('cat-grid').style.display = 'none';
    document.getElementById('brand-section').style.display = 'none';
    document.getElementById('model-section').style.display = 'none';
    document.getElementById('name-preview').style.display = 'block';
    document.getElementById('item-details').style.display = 'block';
    document.getElementById('f-name-preview').textContent = item.name;
    document.getElementById('f-name').value = item.name;
    document.getElementById('f-unit').value  = item.unit || 'Pcs';
    document.getElementById('f-adc').value   = item.adc || 0;
    document.getElementById('f-lt').value    = item.lt || 0;
    document.getElementById('f-sf').value    = item.sf || 1.2;
    document.getElementById('f-mit').value   = item.mit || 0;
    document.getElementById('f-remarks').value = item.remarks || '';
  } else {
    document.getElementById('im-title').textContent = 'Add Item';
    document.getElementById('cat-grid').style.display = 'grid';
    document.getElementById('brand-section').style.display = 'none';
    document.getElementById('model-section').style.display = 'none';
    document.getElementById('name-preview').style.display = 'none';
    document.getElementById('item-details').style.display = 'none';
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('f-model').value   = '';
    document.getElementById('f-adc').value     = '0';
    document.getElementById('f-lt').value      = '0';
    document.getElementById('f-sf').value      = '1.2';
    document.getElementById('f-mit').value     = '0';
    document.getElementById('f-remarks').value = '';
  }
  updROP();
  document.getElementById('item-modal').classList.add('open');
}
function editItem(name) { openItemModal(name); }

function updROP() {
  const a   = Number(document.getElementById('f-adc').value) || 0;
  const l   = Number(document.getElementById('f-lt').value)  || 0;
  const s   = Number(document.getElementById('f-sf').value)  || 1;
  const u   = document.getElementById('f-unit').value || 'units';
  const max = Math.ceil(a * l * s);
  const rop = Math.ceil(max / 2);
  document.getElementById('f-max-val').value = max;
  document.getElementById('f-rop-val').value = rop;
  document.getElementById('rop-prev').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:4px;">
      <div>
        <div style="font-size:10px;color:var(--muted);margin-bottom:2px;">MAX LEVEL</div>
        <div style="font-family:var(--mono);font-size:18px;font-weight:700;color:var(--green);">${max} <span style="font-size:11px;">${u}</span></div>
        <div style="font-size:10px;color:var(--muted);">${a} × ${l} × ${s}</div>
      </div>
      <div>
        <div style="font-size:10px;color:var(--muted);margin-bottom:2px;">REORDER POINT (AUTO)</div>
        <div style="font-family:var(--mono);font-size:18px;font-weight:700;color:var(--accent);">${rop} <span style="font-size:11px;">${u}</span></div>
        <div style="font-size:10px;color:var(--muted);">= Max ÷ 2</div>
      </div>
      <div>
        <div style="font-size:10px;color:var(--muted);margin-bottom:2px;">MOQ</div>
        <input class="inp" id="f-moq" type="number" min="0" placeholder="Enter MOQ" style="font-family:var(--mono);font-size:14px;font-weight:700;margin-top:2px;">
      </div>
    </div>`;
}

async function saveItem() {
  const name = (document.getElementById('f-name').value || '').trim();
  if (!name) { toast('Please select Category → Brand → Model first', 'err'); return; }
  const btn = document.getElementById('im-btn');
  btn.disabled = true; btn.textContent = 'Saving...';
  const adc  = Number(document.getElementById('f-adc').value) || 0;
  const lt   = Number(document.getElementById('f-lt').value)  || 0;
  const sf   = Number(document.getElementById('f-sf').value)  || 1.2;
  const maxL = Number(document.getElementById('f-max-val').value) || Math.ceil(adc * lt * sf);
  const rop  = Number(document.getElementById('f-rop-val').value) || Math.ceil(maxL / 2);
  const moqEl = document.getElementById('f-moq');
  const moq  = moqEl && moqEl.value ? Number(moqEl.value) : rop;
  const payload = {
    name, cat: _selCat || (_editItemName && (_items.find(i=>i.name===_editItemName)||{}).cat) || 'Other',
    unit: document.getElementById('f-unit').value,
    adc, lt, sf, moq, maxL,
    mit:  Number(document.getElementById('f-mit').value) || 0,
    remarks: document.getElementById('f-remarks').value,
  };
  if (_editItemName) payload.originalName = _editItemName;
  try {
    await api(_editItemName ? 'updateItem' : 'addItem', payload);
    toast(_editItemName ? 'Item updated ✓' : 'Item added ✓', 'ok');
    closeM('item-modal');
    _items = []; _stocks = [];
    loadItems();
    loadDash();
  } catch(e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = 'Save Item'; }
}

async function delItem(name) {
  if (!confirm(`Delete "${name}"?`)) return;
  try {
    await api('deleteItem', { name });
    toast('Deleted', 'err');
    _items = []; _stocks = [];
    loadItems();
  } catch(e) { toast(e.message, 'err'); }
}

// ── BOM MANAGER ──
async function loadBom() {
  document.getElementById('bom-tb').innerHTML = `<tr class="lrow"><td colspan="6"><span class="loader"></span></td></tr>`;
  try {
    _boms = await api('getBomModels');
    filterBom();
  } catch(e) { toast(e.message, 'err'); }
}

function filterBom() {
  const s  = document.getElementById('bom-search').value.toLowerCase();
  const fl = _boms.filter(b => !s || b.bomName.toLowerCase().includes(s) || (b.alias || '').toLowerCase().includes(s));
  const tb = document.getElementById('bom-tb');
  const em = document.getElementById('bom-empty');
  if (!fl.length) { tb.innerHTML = ''; em.style.display = 'block'; return; }
  em.style.display = 'none';
  tb.innerHTML = fl.map(b => `<tr>
    <td style="font-weight:600;color:var(--navy);">${b.bomName}</td>
    <td><span style="font-family:var(--mono);font-size:11px;color:var(--muted);">${b.alias || '—'}</span></td>
    <td style="font-size:12px;">${b.produces || '—'}</td>
    <td><span style="font-family:var(--mono);font-size:12px;color:var(--accent);">—</span></td>
    <td><span class="badge ${b.active === 'YES' ? 'b-ok' : 'b-ro'}">${b.active === 'YES' ? 'Active' : 'Inactive'}</span></td>
    <td style="white-space:nowrap;">
      <button class="btn bg bsm" onclick="openBomEdit('${b.bomName.replace(/'/g,"\\'")}')">Edit BOM</button>
      <button class="btn brd bsm" onclick="delBom('${b.bomName.replace(/'/g,"\\'")}')">Del</button>
    </td>
  </tr>`).join('');
}

function openBomAddModal() {
  ['bm-name','bm-alias','bm-produces','bm-remarks'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('bom-add-modal').classList.add('open');
}

async function saveBomModel() {
  const bomName = document.getElementById('bm-name').value.trim();
  if (!bomName) { toast('BOM name is required', 'err'); return; }
  const btn = document.getElementById('bm-btn');
  btn.disabled = true; btn.textContent = 'Saving...';
  try {
    await api('addBomModel', {
      bomName,
      alias:    document.getElementById('bm-alias').value,
      produces: document.getElementById('bm-produces').value || bomName,
      remarks:  document.getElementById('bm-remarks').value,
    });
    toast('BOM added ✓', 'ok');
    closeM('bom-add-modal');
    loadBom();
  } catch(e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = 'Save'; }
}

async function openBomEdit(bomName) {
  _editBomName = bomName;
  document.getElementById('bom-edit-title').textContent = `Edit BOM: ${bomName}`;
  document.getElementById('bom-edit-modal').classList.add('open');
  if (!_items.length) {
    try {
      const d = await api('getDashboard');
      _stocks = d.stocks || [];
      _items  = _stocks;
    } catch(e) {}
  }
  try {
    const items = await api('getBomItems', { bomName });
    _bomRows = items.map(i => ({ component: i.component, qty: i.qty, unit: i.unit }));
    if (!_bomRows.length) _bomRows = [{ component: '', qty: '', unit: 'Pcs' }];
    renderBomRows();
  } catch(e) {
    _bomRows = [{ component: '', qty: '', unit: 'Pcs' }];
    renderBomRows();
  }
}

function renderBomRows() {
  const wrap = document.getElementById('bom-rows-wrap');
  const itemOpts = _items.map(i => `<option value="${i.name}">${i.name}</option>`).join('');
  wrap.innerHTML = _bomRows.map((row, i) => `
    <div class="bom-row" id="brow-${i}">
      <select class="inp" onchange="_bomRows[${i}].component=this.value">
        <option value="">Select Component</option>
        ${itemOpts}
        ${row.component && !_items.find(x => x.name === row.component) ? `<option value="${row.component}" selected>${row.component}</option>` : ''}
      </select>
      <input class="inp" type="number" min="0" step="0.01" value="${row.qty}" placeholder="Qty" onchange="_bomRows[${i}].qty=Number(this.value)">
      <select class="inp" onchange="_bomRows[${i}].unit=this.value">
        <option ${row.unit==='Pcs'?'selected':''}>Pcs</option>
        <option ${row.unit==='Kg'?'selected':''}>Kg</option>
        <option ${row.unit==='Metres'?'selected':''}>Metres</option>
        <option ${row.unit==='Roll'?'selected':''}>Roll</option>
      </select>
      <button class="btn brd bsm" onclick="removeBomRow(${i})">✕</button>
    </div>
  `).join('');
  _bomRows.forEach((row, i) => {
    const sel = wrap.querySelector(`#brow-${i} select`);
    if (sel && row.component) sel.value = row.component;
  });
}

function addBomRow() { _bomRows.push({ component: '', qty: '', unit: 'Pcs' }); renderBomRows(); }
function removeBomRow(i) { _bomRows.splice(i, 1); renderBomRows(); }

async function saveBomItems() {
  const valid = _bomRows.filter(r => r.component && r.qty > 0);
  if (!valid.length) { toast('Add at least one component', 'err'); return; }
  const btn = document.getElementById('bom-edit-btn');
  btn.disabled = true; btn.textContent = 'Saving...';
  try {
    await api('saveBomItems', { bomName: _editBomName, items: valid });
    toast('BOM saved ✓', 'ok');
    closeM('bom-edit-modal');
    loadBom();
  } catch(e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = 'Save BOM'; }
}

async function delBom(bomName) {
  if (!confirm(`Delete BOM "${bomName}"? Components bhi delete ho jaayenge.`)) return;
  try {
    await api('deleteBomModel', { bomName });
    toast('BOM deleted', 'err');
    loadBom();
  } catch(e) { toast(e.message, 'err'); }
}

// ── STOCK TREE VIEW ──
let _stockViewMode = 'table';

function toggleStockView() {
  _stockViewMode = _stockViewMode === 'table' ? 'tree' : 'table';
  const btn = document.getElementById('stock-view-btn');
  if (_stockViewMode === 'tree') {
    btn.textContent = '📋 Table View';
    document.getElementById('stock-table-wrap').style.display = 'none';
    document.getElementById('stock-tree').style.display = 'block';
    renderStockTree(_stocks);
  } else {
    btn.textContent = '🌳 Tree View';
    document.getElementById('stock-table-wrap').style.display = 'block';
    document.getElementById('stock-tree').style.display = 'none';
    filterStock();
  }
}

function parseBrand(item) {
  const parts = item.name.split(' ');
  if (parts.length >= 2) return parts[1];
  return item.cat || 'Other';
}

function renderStockTree(stocks) {
  const wrap = document.getElementById('stock-tree');
  if (!stocks || !stocks.length) {
    wrap.innerHTML = `<div class="empty"><div class="ei">📈</div><div class="et">No data</div></div>`;
    return;
  }
  const tree = {};
  stocks.forEach(s => {
    const cat   = s.cat || 'Other';
    const brand = parseBrand(s);
    if (!tree[cat]) tree[cat] = {};
    if (!tree[cat][brand]) tree[cat][brand] = [];
    tree[cat][brand].push(s);
  });
  let html = '';
  Object.keys(tree).sort().forEach(cat => {
    const brands = tree[cat];
    const catTotal  = Object.values(brands).flat().reduce((s,i) => s + i.currentStock, 0);
    const catAlerts = Object.values(brands).flat().filter(i => i.status !== 'OK').length;
    const catItems  = Object.values(brands).flat().length;
    html += `<div class="tree-cat">
      <div class="tree-cat-header" onclick="toggleTree('cat-${cat}')">
        <div class="tree-cat-title">
          <span style="font-size:16px;">${getCatIcon(cat)}</span>
          <h3>${cat}</h3>
          <span class="tree-cat-count">${catItems} models</span>
          ${catAlerts > 0 ? `<span class="badge b-ro">⚠ ${catAlerts}</span>` : '<span class="badge b-ok">✓ OK</span>'}
        </div>
        <div class="tree-cat-meta">
          <span class="tree-cat-stock">${catTotal} total</span>
          <span class="tree-arrow" id="arr-cat-${cat}">▼</span>
        </div>
      </div>
      <div id="cat-${cat}" style="display:none;">`;
    Object.keys(brands).sort().forEach(brand => {
      const models = brands[brand];
      const brandTotal  = models.reduce((s,i) => s + i.currentStock, 0);
      const brandAlerts = models.filter(i => i.status !== 'OK').length;
      html += `<div class="tree-brand">
        <div class="tree-brand-header" onclick="toggleTree('brand-${cat}-${brand}')">
          <div class="tree-brand-title">
            <span style="font-size:13px;">🏷</span>
            <h4>${brand}</h4>
            <span style="font-size:11px;color:var(--muted);">${models.length} models</span>
            ${brandAlerts > 0 ? `<span class="badge b-ro" style="font-size:9px;">⚠ ${brandAlerts}</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="tree-brand-stock">${brandTotal}</span>
            <span class="tree-arrow" id="arr-brand-${cat}-${brand}">▼</span>
          </div>
        </div>
        <div id="brand-${cat}-${brand}" style="display:none;">
          <div class="tree-model-headers">
            <span>Model</span><span>Unit</span><span>ROP</span><span>Max</span><span>MIT</span><span>Store Stock</span><span>WIP</span><span>Status</span>
          </div>
          <div class="tree-models">
            ${models.map(m => {
              const pct = m.maxL > 0 ? Math.min(100, Math.round(m.currentStock/m.maxL*100)) : 0;
              const bc = m.status==='OK' ? 'var(--green)' : m.status==='Reorder' ? 'var(--orange)' : 'var(--red)';
              return `<div class="tree-model-row">
                <span class="tree-model-name">${m.name}</span>
                <span style="color:var(--muted);">${m.unit||'—'}</span>
                <span style="font-family:var(--mono);color:var(--orange);">${m.reorderPoint}</span>
                <span style="font-family:var(--mono);color:var(--navy);">${m.maxL||0}</span>
                <span style="font-family:var(--mono);color:var(--purple);">${m.mit||0}</span>
                <span>
                  <span style="font-family:var(--mono);font-weight:700;font-size:14px;">${m.currentStock}</span>
                  <div style="height:3px;background:var(--border);border-radius:2px;margin-top:3px;width:60px;">
                    <div style="height:100%;width:${pct}%;background:${bc};border-radius:2px;"></div>
                  </div>
                </span>
                <span style="font-family:var(--mono);font-weight:700;font-size:14px;color:${m.wip>0?'var(--purple)':'var(--light)'};">
                  ${m.wip > 0 ? m.wip : '—'}
                </span>
                <span>${stBadge(m.status)}</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>`;
    });
    html += `</div></div>`;
  });
  wrap.innerHTML = html;
}

function toggleTree(id) {
  const el = document.getElementById(id);
  const arr = document.getElementById('arr-' + id);
  if (!el) return;
  if (el.style.display === 'none') { el.style.display = 'block'; if (arr) arr.classList.add('open'); }
  else { el.style.display = 'none'; if (arr) arr.classList.remove('open'); }
}

function getCatIcon(cat) {
  const icons = { 'BMS':'⚡', 'Cells':'🔋', 'Charger':'🔌', 'Wire':'🔩', 'Nickel':'🪙', 'Consumable':'🧰', 'Box':'📦', 'Packaging':'📦', 'Other':'➕' };
  return icons[cat] || '📦';
}

// ── STOCK SUMMARY ──
async function loadStock() {
  document.getElementById('stock-tb').innerHTML = `<tr class="lrow"><td colspan="9"><span class="loader"></span></td></tr>`;
  try {
    _stocks = await api('getStockSummary');
    filterStock();
  } catch(e) { toast(e.message, 'err'); }
}
function filterStock() {
  const s   = document.getElementById('stock-search').value.toLowerCase();
  const sf  = document.getElementById('stock-status-f').value;
  const scf = document.getElementById('stock-cat-f').value;
  const fl  = _stocks.filter(i =>
    (!s   || i.name.toLowerCase().includes(s)) &&
    (!sf  || i.status === sf) &&
    (!scf || i.cat === scf)
  );
  const tb = document.getElementById('stock-tb');
  const em = document.getElementById('stock-empty');
  if (!fl.length) { tb.innerHTML = ''; em.style.display = 'block'; return; }
  em.style.display = 'none';
  if (_stockViewMode === 'tree') { renderStockTree(fl); return; }
  tb.innerHTML = fl.map(item => {
    const brand = parseBrand(item);
    const pct = item.maxL > 0 ? Math.min(100, Math.round(item.currentStock / item.maxL * 100)) : 0;
    const bc  = item.status === 'OK' ? 'var(--green)' : item.status === 'Reorder' ? 'var(--orange)' : 'var(--red)';
    return `<tr>
      <td style="font-weight:600;color:var(--navy);">${item.name}</td>
      <td>${catBadge(item.cat)}</td>
      <td><span style="font-size:11px;font-weight:600;color:var(--teal);">${brand}</span></td>
      <td style="color:var(--muted);font-size:12px;">${item.unit || '—'}</td>
      <td style="font-family:var(--mono);color:var(--orange);font-weight:600;">${item.reorderPoint}</td>
      <td>${(item.mit||0) > 0 ? `<span style="font-family:var(--mono);color:var(--purple);">🚚${item.mit}</span>` : '—'}</td>
      <td>
        <span style="font-family:var(--mono);font-weight:700;font-size:16px;">${item.currentStock}</span>
        <div class="sbw"><div class="sbf" style="width:${pct}%;background:${bc};"></div></div>
      </td>
      <td style="font-family:var(--mono);color:${item.stockToOrder > 0 ? 'var(--red)' : 'var(--green)'};font-weight:600;">
        ${item.stockToOrder > 0 ? item.stockToOrder : '—'}
      </td>
      <td>${stBadge(item.status)}</td>
    </tr>`;
  }).join('');
}

// ── REORDER ──
async function loadReorder() {
  document.getElementById('ro-content').innerHTML = `<div class="empty"><div class="ei">⏳</div><div class="et">Loading...</div></div>`;
  try {
    if (!_stocks.length) _stocks = await api('getStockSummary');
    const cr  = _stocks.filter(s => s.status === 'Critical');
    const ro  = _stocks.filter(s => s.status === 'Reorder');
    const ok  = _stocks.filter(s => s.status === 'OK');
    let html  = '';
    if (!cr.length && !ro.length) {
      html = `<div class="empty"><div class="ei">✅</div><div class="et">All stocks healthy!</div><div class="es">${ok.length} items — koi reorder nahi chahiye</div></div>`;
    } else {
      if (cr.length) html += `<div class="sdiv" style="color:var(--red);">🔴 Critical — Out of Stock (${cr.length})</div><div class="ro-grid">${cr.map(roCard).join('')}</div>`;
      if (ro.length) html += `<div class="sdiv" style="color:var(--orange);margin-top:18px;">🟠 Reorder Required (${ro.length})</div><div class="ro-grid">${ro.map(roCard).join('')}</div>`;
      if (ok.length) html += `<div class="sdiv" style="color:var(--green);margin-top:18px;">✅ Healthy (${ok.length} items)</div>`;
    }
    document.getElementById('ro-content').innerHTML = html;
  } catch(e) { toast(e.message, 'err'); }
}
function roCard(s) {
  const isCr = s.status === 'Critical';
  const pct  = s.maxL > 0 ? Math.min(100, Math.round(s.currentStock / s.maxL * 100)) : 0;
  const bc   = isCr ? 'var(--red)' : 'var(--orange)';
  return `<div class="ro-card ${isCr ? 'cr' : 'ro'}">
    <div class="ro-left">
      <div class="iname">${s.name} ${catBadge(s.cat)}</div>
      <div class="imeta">
        <span>ADC: <b>${s.adc || 0}/day</b></span>
        <span>Lead: <b>${s.lt || 0}d</b></span>
        <span>ROP: <b>${s.reorderPoint}</b></span>
        <span>MOQ: <b>${s.moq || 0}</b></span>
        <span>MIT: <b>${s.mit || 0}</b></span>
      </div>
      <div class="sbw" style="width:180px;margin-top:7px;"><div class="sbf" style="width:${pct}%;background:${bc};"></div></div>
    </div>
    <div class="ro-right">
      <div class="snum ${isCr ? 'cr' : 'ro'}">${s.currentStock} <span style="font-size:12px;color:var(--muted);">${s.unit || ''}</span></div>
      <div class="sug">Order: <b style="color:var(--navy);">${s.stockToOrder > 0 ? s.stockToOrder : s.moq || '—'}</b></div>
      ${stBadge(s.status)}
    </div>
  </div>`;
}

// ── DAILY CLOSING ──
async function genClosing() {
  const date = document.getElementById('cl-date').value || today();
  document.getElementById('cl-content').innerHTML = `<div class="empty"><div class="ei">⏳</div><div class="et">Generating...</div></div>`;
  try {
    const rows = await api('getClosing', { date });
    _clRows = rows; _clDate = date;
    const tIn  = rows.reduce((s,r) => s + r.todayIn,  0);
    const tOut = rows.reduce((s,r) => s + r.todayOut, 0);
    const al   = rows.filter(r => r.status !== 'OK').length;
    let html = `<div style="font-family:var(--mono);font-size:12px;color:var(--accent);font-weight:600;margin-bottom:14px;">📅 Daily Closing — ${fmtD(date)}</div>`;
    html += `<div class="cl-sum">
      <div class="sc gn"><div class="sc-bar"></div><div class="sc-icon">📥</div><div class="sc-label">Total Inward</div><div class="sc-val">${tIn}</div></div>
      <div class="sc rd"><div class="sc-bar"></div><div class="sc-icon">📤</div><div class="sc-label">Total Outward</div><div class="sc-val">${tOut}</div></div>
      <div class="sc or"><div class="sc-bar"></div><div class="sc-icon">⚠️</div><div class="sc-label">Below ROP</div><div class="sc-val">${al}</div></div>
    </div>`;
    html += `<div class="card"><div class="tw"><table>
      <thead><tr><th>Item Name</th><th>Category</th><th>Opening</th><th>Today IN</th><th>Today OUT</th><th>Closing Stock</th><th>MIT</th><th>ROP</th><th>Status</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td style="font-weight:600;">${r.name}</td>
        <td>${catBadge(r.cat)}</td>
        <td style="font-family:var(--mono);">${r.opening}</td>
        <td style="font-family:var(--mono);color:var(--green);font-weight:600;">${r.todayIn > 0 ? '+' + r.todayIn : '—'}</td>
        <td style="font-family:var(--mono);color:var(--red);font-weight:600;">${r.todayOut > 0 ? '-' + r.todayOut : '—'}</td>
        <td style="font-family:var(--mono);font-weight:700;font-size:15px;">${r.closing} <span style="font-size:10px;color:var(--muted);">${r.unit||''}</span></td>
        <td>${(r.mit||0) > 0 ? `<span style="font-family:var(--mono);color:var(--purple);">🚚${r.mit}</span>` : '—'}</td>
        <td style="font-family:var(--mono);color:var(--orange);">${r.reorderPoint}</td>
        <td>${stBadge(r.status)}</td>
      </tr>`).join('')}</tbody>
    </table></div></div>`;
    document.getElementById('cl-content').innerHTML = html;
  } catch(e) { toast(e.message, 'err'); }
}

function switchClTab(tab) {
  const single  = document.getElementById('cl-single-wrap');
  const range   = document.getElementById('cl-range-wrap');
  const heatmap = document.getElementById('cl-heatmap-wrap');
  const btnS    = document.getElementById('cl-tab-single');
  const btnR    = document.getElementById('cl-tab-range');
  const btnH    = document.getElementById('cl-tab-heatmap');

  // Hide all
  single.style.display  = 'none';
  range.style.display   = 'none';
  heatmap.style.display = 'none';
  [btnS, btnR, btnH].forEach(b => { if(b){ b.style.borderColor=''; b.style.color=''; } });

  if (tab === 'single') {
    single.style.display = 'block';
    if (btnS) { btnS.style.borderColor='var(--accent)'; btnS.style.color='var(--accent)'; }
  } else if (tab === 'range') {
    range.style.display = 'block';
    if (btnR) { btnR.style.borderColor='var(--accent)'; btnR.style.color='var(--accent)'; }
    const t = new Date(); const f = new Date(t); f.setDate(f.getDate()-6);
    document.getElementById('cl-to').value   = t.toISOString().slice(0,10);
    document.getElementById('cl-from').value = f.toISOString().slice(0,10);
  } else if (tab === 'heatmap') {
    heatmap.style.display = 'block';
    if (btnH) { btnH.style.borderColor='var(--accent)'; btnH.style.color='var(--accent)'; }
    // Set default month to current
    const now = new Date();
    const hmMonth = document.getElementById('hm-month');
    if (hmMonth && !hmMonth.value) {
      hmMonth.value = now.toISOString().slice(0,7);
    }
    // Populate item dropdown
    loadHeatmapItems();
  }
}

let _historyData = [];

async function genHistory() {
  const from = document.getElementById('cl-from').value;
  const to   = document.getElementById('cl-to').value;
  if (!from || !to) { toast('Please select a date range', 'err'); return; }
  if (from > to)    { toast('From date must be before To date', 'err'); return; }
  const wrap = document.getElementById('cl-history-content');
  wrap.innerHTML = `<div class="empty"><div class="ei">⏳</div><div class="et">Loading history...</div></div>`;
  try {
    const data = await api('getClosingHistory', { from, to });
    _historyData = data;
    if (!data.length) {
      wrap.innerHTML = `<div class="empty"><div class="ei">📭</div><div class="et">No snapshots found</div><div class="es">Pehle Daily Closing save karo</div></div>`;
      return;
    }
    const totalDays = data.length;
    const totalIn   = data.reduce((s,d) => s + d.totalIn,  0);
    const totalOut  = data.reduce((s,d) => s + d.totalOut, 0);
    let html = `<div class="cl-sum" style="margin-bottom:16px;">
        <div class="sc bl"><div class="sc-bar"></div><div class="sc-icon">📅</div><div class="sc-label">Days</div><div class="sc-val">${totalDays}</div></div>
        <div class="sc gn"><div class="sc-bar"></div><div class="sc-icon">📥</div><div class="sc-label">Total Inward</div><div class="sc-val">${totalIn}</div></div>
        <div class="sc rd"><div class="sc-bar"></div><div class="sc-icon">📤</div><div class="sc-label">Total Outward</div><div class="sc-val">${totalOut}</div></div>
      </div>`;
    data.forEach(day => {
      html += `<div class="card" style="margin-bottom:10px;">
          <div class="ch" style="cursor:pointer;" onclick="toggleDay('day-${day.date}')">
            <div style="display:flex;align-items:center;gap:12px;">
              <h2>📅 ${fmtD(day.date)}</h2>
              <span style="font-size:11px;color:var(--muted);">IN: <b style="color:var(--green);">+${day.totalIn}</b> &nbsp; OUT: <b style="color:var(--red);">-${day.totalOut}</b></span>
              ${day.alerts > 0 ? `<span class="badge b-ro">⚠ ${day.alerts} alerts</span>` : '<span class="badge b-ok">✓ All OK</span>'}
            </div>
            <span style="color:var(--muted);font-size:13px;" id="arrow-${day.date}">▼</span>
          </div>
          <div id="day-${day.date}" style="display:none;">
            <div class="tw"><table>
                <thead><tr><th>Item</th><th>Unit</th><th>Opening</th><th>IN</th><th>OUT</th><th>Closing</th><th>ROP</th><th>Status</th></tr></thead>
                <tbody>${day.rows.map(r => `<tr>
                    <td style="font-weight:600;">${r.name}</td>
                    <td style="color:var(--muted);font-size:12px;">${r.unit||'—'}</td>
                    <td style="font-family:var(--mono);">${r.opening}</td>
                    <td style="font-family:var(--mono);color:var(--green);font-weight:600;">${r.todayIn > 0 ? '+'+r.todayIn : '—'}</td>
                    <td style="font-family:var(--mono);color:var(--red);font-weight:600;">${r.todayOut > 0 ? '-'+r.todayOut : '—'}</td>
                    <td style="font-family:var(--mono);font-weight:700;font-size:15px;">${r.closing}</td>
                    <td style="font-family:var(--mono);color:var(--orange);">${r.reorderPoint}</td>
                    <td>${stBadge(r.status)}</td>
                  </tr>`).join('')}
                </tbody>
              </table></div>
          </div>
        </div>`;
    });
    wrap.innerHTML = html;
  } catch(e) { toast(e.message, 'err'); }
}

function toggleDay(id) {
  const el  = document.getElementById(id);
  const date = id.replace('day-', '');
  const arr = document.getElementById('arrow-' + date);
  if (el.style.display === 'none') { el.style.display = 'block'; if (arr) arr.textContent = '▲'; }
  else { el.style.display = 'none'; if (arr) arr.textContent = '▼'; }
}

function exportHistoryCSV() {
  if (!_historyData.length) { toast('Please load history first', 'warn'); return; }
  let csv = 'Date,Item Name,Category,Unit,Opening,Today IN,Today OUT,Closing,ROP,Status\n';
  _historyData.forEach(day => {
    day.rows.forEach(r => {
      csv += `${r.date},"${r.name}",${r.cat},${r.unit},${r.opening},${r.todayIn},${r.todayOut},${r.closing},${r.reorderPoint},${r.status}\n`;
    });
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `Litpax_History_${document.getElementById('cl-from').value}_to_${document.getElementById('cl-to').value}.csv`;
  a.click();
  toast('CSV downloaded ✓', 'ok');
}

async function saveSnapshot() {
  try {
    const r = await api('saveSnapshot', { date: _clDate || today() });
    toast(`Snapshot saved ✓ — ${r.rows} rows`, 'ok');
  } catch(e) { toast(e.message, 'err'); }
}

// ── MONTHLY STOCK HEATMAP ──
async function loadHeatmapItems() { /* not needed anymore */ }

async function genHeatmap() {
  const month = document.getElementById('hm-month').value;
  const wrap  = document.getElementById('hm-content');

  if (!month) { toast('Month select karo', 'err'); return; }

  wrap.innerHTML = `<div class="empty"><div class="ei">⏳</div><div class="et">Calculating all items...</div></div>`;

  try {
    // Get all items
    if (!_stocks.length) _stocks = await api('getStockSummary');

    // Get monthly data for all items in one call
    const data = await api('getMonthlyStockAll', { month });
    // data = { days: ['2026-06-01',...], items: [{name, unit, maxL, closings: [n,n,...]}] }

    const days   = data.days;   // array of date strings
    const items  = data.items;  // array of items with closings array

    if (!days.length || !items.length) {
      wrap.innerHTML = `<div class="empty"><div class="ei">📭</div><div class="et">No data</div></div>`;
      return;
    }

    const monthName = new Date(month + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    // Color function
    function getColor(stock, maxL) {
      if (stock === null || stock === undefined) return { bg: '#f3f4f6', text: '#d1d5db' };
      if (stock === 0) return { bg: '#f3f4f6', text: '#9ca3af' };
      if (maxL <= 0) return { bg: '#e5e7eb', text: '#6b7280' };
      const pct = stock / maxL * 100;
      if (stock > maxL) return { bg: '#7c3aed', text: '#fff' };
      if (pct >= 66)    return { bg: '#f97316', text: '#fff' };
      if (pct >= 33)    return { bg: '#eab308', text: '#1a1a1a' };
      return              { bg: '#ef4444', text: '#fff' };
    }

    // Date labels — show day number only
    const dateLabels = days.map(d => {
      const dt = new Date(d + 'T00:00:00');
      return { date: d, day: dt.getDate(), dow: dt.toLocaleDateString('en-IN', { weekday: 'short' }) };
    });

    let html = `
      <div class="card">
        <div class="ch" style="background:linear-gradient(90deg,#f8faff,#f0f4ff);">
          <h2>📅 ${monthName} — All Items Stock Heatmap</h2>
          <span style="font-size:11px;color:var(--muted);">${items.length} items · ${days.length} days</span>
        </div>
        <div style="padding:16px 18px;overflow-x:auto;">
          <table style="border-collapse:collapse;font-size:11px;width:100%;">
            <thead>
              <tr>
                <th style="text-align:left;padding:6px 10px;background:var(--s2);border:1px solid var(--border);min-width:160px;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;position:sticky;left:0;z-index:2;">Item</th>
                <th style="padding:6px 8px;background:var(--s2);border:1px solid var(--border);min-width:60px;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;text-align:center;">Max</th>
                ${dateLabels.map(dl => `
                  <th style="padding:4px 2px;background:var(--s2);border:1px solid var(--border);min-width:38px;text-align:center;">
                    <div style="font-size:9px;color:var(--muted);">${dl.dow}</div>
                    <div style="font-size:11px;font-weight:700;color:var(--navy);">${dl.day}</div>
                  </th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td style="padding:5px 10px;border:1px solid var(--border);font-weight:600;color:var(--navy);font-size:12px;white-space:nowrap;background:#fff;position:sticky;left:0;z-index:1;">${item.name}</td>
                  <td style="padding:5px 8px;border:1px solid var(--border);text-align:center;font-family:var(--mono);font-size:11px;font-weight:700;color:var(--orange);background:#fffbf5;">${item.maxL || '—'}</td>
                  ${item.closings.map(stock => {
                    const c = getColor(stock, item.maxL);
                    const label = stock === null || stock === undefined ? '—' : stock;
                    return `<td style="padding:0;border:1px solid rgba(0,0,0,.06);">
                      <div style="background:${c.bg};color:${c.text};font-family:var(--mono);font-size:11px;font-weight:700;text-align:center;padding:6px 2px;min-height:32px;display:flex;align-items:center;justify-content:center;" title="${item.name}: ${label} ${item.unit}">
                        ${label}
                      </div>
                    </td>`;
                  }).join('')}
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    wrap.innerHTML = html;
  } catch(e) {
    toast(e.message, 'err');
    wrap.innerHTML = `<div class="empty"><div class="ei">❌</div><div class="et">${e.message}</div></div>`;
  }
}


function populateItemSelect(id) {
  const sel = document.getElementById(id);
  if (_items.length) {
    sel.innerHTML = _items.map(i => `<option value="${i.name}">${i.name}</option>`).join('');
  } else {
    api('getStockSummary').then(d => {
      _stocks = d; _items = d;
      sel.innerHTML = d.map(i => `<option value="${i.name}">${i.name}</option>`).join('');
    }).catch(() => {});
  }
}

async function populateBomSelect(id) {
  const sel = document.getElementById(id);
  try {
    if (!_boms.length) _boms = await api('getBomModels');
    sel.innerHTML = _boms.map(b => `<option value="${b.bomName}">${b.bomName}</option>`).join('');
    if (_boms.length) updDispatchPreview();
  } catch(e) {
    sel.innerHTML = '<option>No BOM models found</option>';
  }
}

function closeM(id) { document.getElementById(id).classList.remove('open'); }

let _tt;
function toast(msg, type) {
  const t = document.getElementById('toast');
  t.innerHTML = `<span>${type === 'ok' ? '✓' : type === 'err' ? '✕' : '!'}</span> ${msg}`;
  t.className = `show ${type || 'ok'}`;
  clearTimeout(_tt);
  _tt = setTimeout(() => t.className = '', 3500);
}

// ============================================================
// OPENING STOCK
// ============================================================
let _openingData = [];

async function loadOpeningStock() {
  document.getElementById('opening-tb').innerHTML = `<tr class="lrow"><td colspan="5"><span class="loader"></span></td></tr>`;
  try {
    if (!_items.length) {
      const d = await api('getDashboard');
      _stocks = d.stocks || []; _items = _stocks;
    }
    _openingData = await api('getOpeningStock');
    const openMap = {};
    _openingData.forEach(o => { openMap[o.name] = o; });
    const tb = document.getElementById('opening-tb');
    if (!_items.length) { tb.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--muted);">Add items first</td></tr>'; return; }
    tb.innerHTML = _items.map(item => {
      const existing = openMap[item.name] || {};
      return `<tr>
        <td style="font-weight:600;color:var(--navy);">${item.name} <span style="font-size:10px;color:var(--muted);">${item.unit||''}</span></td>
        <td><input class="inp" id="sku-${item.name.replace(/\s/g,'_')}" value="${existing.sku||''}" placeholder="SKU001" style="width:100px;"></td>
        <td style="color:var(--muted);font-size:12px;">${item.unit||'—'}</td>
        <td><input class="inp" id="op-${item.name.replace(/\s/g,'_')}" type="number" min="0" value="${existing.qty||0}" style="width:110px;font-family:var(--mono);font-weight:600;"></td>
        <td><input class="inp" id="rem-${item.name.replace(/\s/g,'_')}" value="${existing.remarks||''}" placeholder="Optional" style="width:150px;"></td>
      </tr>`;
    }).join('');
  } catch(e) { toast(e.message, 'err'); }
}

async function saveOpeningStock() {
  if (!_items.length) { toast('Items not loaded', 'err'); return; }
  const items = _items.map(item => {
    const key = item.name.replace(/\s/g,'_');
    return {
      name: item.name,
      sku:  (document.getElementById('sku-'+key)||{}).value || '',
      qty:  Number((document.getElementById('op-'+key)||{}).value) || 0,
      unit: item.unit || '',
      remarks: (document.getElementById('rem-'+key)||{}).value || '',
    };
  }).filter(i => i.qty > 0 || i.sku);
  if (!items.length) { toast('No data entered', 'warn'); return; }
  try {
    await api('setOpeningStock', { items });
    toast(`Opening stock saved ✓ — ${items.length} items`, 'ok');
    _stocks = []; _items = [];
    loadDash();
  } catch(e) { toast(e.message, 'err'); }
}

// ============================================================
// INDENT / PO
// ============================================================
let _indents = [];
let _currentIndent = null;

async function loadIndents() {
  document.getElementById('indent-tb').innerHTML = `<tr class="lrow"><td colspan="10"><span class="loader"></span></td></tr>`;
  const statusF = document.getElementById('indent-status-f').value;
  try {
    const body = statusF ? { status: statusF } : {};
    _indents = await api('getIndents', body);
    renderIndents();
  } catch(e) { toast(e.message, 'err'); }
}

function renderIndents() {
  const tb = document.getElementById('indent-tb');
  const em = document.getElementById('indent-empty');
  if (!_indents.length) { tb.innerHTML = ''; em.style.display = 'block'; return; }
  em.style.display = 'none';
  tb.innerHTML = _indents.map(ind => {
    const stColor = ind.status === 'Received' ? 'b-ok' : ind.status === 'Cancelled' ? 'b-ro' : 'b-dep';
    const isOverdue = ind.status === 'Pending' && ind.expectedDate && ind.expectedDate < today();
    return `<tr ${isOverdue ? 'style="background:#fff8f0;"' : ''}>
      <td style="font-family:var(--mono);font-size:11px;color:var(--muted);">${ind.id}</td>
      <td style="font-size:12px;color:var(--muted);">${fmtD(ind.date)}</td>
      <td style="font-weight:600;">${ind.itemName} ${isOverdue ? '<span style="color:var(--red);font-size:10px;">⚠ Overdue</span>' : ''}</td>
      <td style="font-family:var(--mono);font-size:11px;color:var(--accent);">${ind.sku||'—'}</td>
      <td style="font-family:var(--mono);font-weight:700;">${ind.qty}</td>
      <td>${ind.supplier||'—'}</td>
      <td style="font-size:12px;color:${isOverdue?'var(--red)':'var(--muted)'};">${fmtD(ind.expectedDate)||'—'}</td>
      <td><span class="badge ${stColor}">${ind.status}</span></td>
      <td style="font-size:12px;color:var(--muted);">${ind.remarks||'—'}</td>
      <td style="white-space:nowrap;">
        ${ind.status === 'Pending' ? `
          <button class="btn bgn bsm" onclick="openReceiveModal('${ind.id}','${ind.itemName.replace(/'/g,"\\'")}',${ind.qty},'${ind.supplier||''}')">✓ Receive</button>
          <button class="btn brd bsm" onclick="cancelIndent('${ind.id}')">✕</button>
        ` : '—'}
      </td>
    </tr>`;
  }).join('');
}

function openIndentModal() {
  populateItemSelect('ind-item');
  document.getElementById('ind-qty').value = '';
  document.getElementById('ind-date').value = today();
  document.getElementById('ind-supplier').value = '';
  document.getElementById('ind-exp').value = '';
  document.getElementById('ind-remarks').value = '';
  document.getElementById('indent-modal').classList.add('open');
}

async function saveIndent() {
  const itemName = document.getElementById('ind-item').value;
  const qty      = Number(document.getElementById('ind-qty').value);
  const date     = document.getElementById('ind-date').value;
  if (!itemName) { toast('Please select an item', 'err'); return; }
  if (!qty || qty <= 0) { toast('Enter a valid quantity', 'err'); return; }
  const btn = document.getElementById('ind-btn');
  btn.disabled = true; btn.textContent = 'Saving...';
  try {
    const r = await api('addIndent', {
      itemName, qty, date,
      supplier:     document.getElementById('ind-supplier').value,
      expectedDate: document.getElementById('ind-exp').value,
      remarks:      document.getElementById('ind-remarks').value,
    });
    toast('Indent saved ✓ — ' + r.id, 'ok');
    closeM('indent-modal');
    _stocks = [];
    loadIndents();
    loadDash();
  } catch(e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = 'Save Indent'; }
}

function openReceiveModal(id, itemName, qty, supplier) {
  _currentIndent = { id, itemName, qty };
  document.getElementById('recv-info').innerHTML = `
    <div style="font-weight:600;font-size:14px;margin-bottom:6px;">${itemName}</div>
    <div style="color:var(--muted);font-size:12px;">Ordered Qty: <b style="font-family:var(--mono);color:var(--navy);">${qty}</b></div>`;
  document.getElementById('recv-qty').value = qty;
  document.getElementById('recv-date').value = today();
  document.getElementById('recv-invoice').value = '';
  document.getElementById('recv-supplier').value = supplier || '';
  document.getElementById('recv-by').value = 'Ajay';
  document.getElementById('receive-modal').classList.add('open');
}

async function confirmReceive() {
  if (!_currentIndent) return;
  const qty     = Number(document.getElementById('recv-qty').value);
  const date    = document.getElementById('recv-date').value;
  const invoice = document.getElementById('recv-invoice').value;
  const supplier= document.getElementById('recv-supplier').value;
  const by      = document.getElementById('recv-by').value || 'Ajay';
  if (!qty || qty <= 0) { toast('Enter a valid quantity', 'err'); return; }
  const btn = document.getElementById('recv-btn');
  btn.disabled = true; btn.textContent = 'Processing...';
  try {
    await api('addInward', {
      itemName:  _currentIndent.itemName,
      qty, date, supplier, invoice, by,
      indentId:  _currentIndent.id,
      remarks:   'Indent: ' + _currentIndent.id,
    });
    toast('Material received & stock updated ✓', 'ok');
    closeM('receive-modal');
    _stocks = [];
    loadIndents();
    loadInward();
    loadDash();
  } catch(e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = 'Receive & Add to Stock'; }
}

async function cancelIndent(id) {
  if (!confirm('Cancel this indent?')) return;
  try {
    await api('cancelIndent', { id });
    toast('Indent cancelled', 'warn');
    _stocks = [];
    loadIndents();
    loadDash();
  } catch(e) { toast(e.message, 'err'); }
}

// ============================================================
// MATERIAL REQUESTS
// ============================================================
let _requests = [];

async function loadRequests() {
  document.getElementById('req-tb').innerHTML = `<tr class="lrow"><td colspan="10"><span class="loader"></span></td></tr>`;
  const statusF = document.getElementById('req-status-f').value;
  try {
    const body = statusF ? { status: statusF } : {};
    _requests = await api('getRequests', body);
    renderRequests();
  } catch(e) { toast(e.message, 'err'); }
}

function renderRequests() {
  const tb = document.getElementById('req-tb');
  const em = document.getElementById('req-empty');
  if (!_requests.length) { tb.innerHTML = ''; em.style.display = 'block'; return; }
  em.style.display = 'none';
  tb.innerHTML = _requests.map(r => {
    const stColor = r.status === 'Closed' ? 'b-ok' : r.status === 'Cancelled' ? 'b-ro' : 'b-dep';
    const isPending = r.status === 'Pending';
    return `<tr ${isPending ? 'style="background:#f0f7ff;"' : ''}>
      <td style="font-size:12px;color:var(--muted);">${fmtD(r.date)}</td>
      <td style="font-family:var(--mono);font-size:12px;color:var(--muted);">${r.time}</td>
      <td style="font-weight:600;color:var(--navy);">${r.itemName}</td>
      <td style="font-family:var(--mono);font-weight:700;font-size:16px;color:var(--accent);">${r.qty}</td>
      <td style="color:var(--muted);font-size:12px;">${r.unit||'—'}</td>
      <td>${depBadge(r.department)}</td>
      <td style="font-size:12px;">${r.requestedBy||'—'}</td>
      <td style="font-size:12px;color:var(--muted);">${r.remarks||'—'}</td>
      <td><span class="badge ${stColor}">${r.status}</span></td>
      <td style="white-space:nowrap;">
        ${isPending ? `
          <button class="btn bgn bsm" onclick="fulfillRequest('${r.id}','${r.itemName.replace(/'/g,"\\'")}',${r.qty},'${r.department||''}')">✓ Issue</button>
          <button class="btn brd bsm" onclick="cancelRequest('${r.id}')">✕</button>
        ` : `<span style="font-size:11px;color:var(--muted);">${r.closedBy||'—'}</span>`}
      </td>
    </tr>`;
  }).join('');
}

function fulfillRequest(reqId, itemName, qty, department) {
  populateItemSelect('out-item');
  setTimeout(() => {
    // Find item category
    const item = _stocks.find(s => s.name === itemName) || _items.find(i => i.name === itemName);
    const cat = item ? item.cat : '';
    const catSel = document.getElementById('out-cat');
    if (catSel && cat) {
      catSel.value = cat;
      filterOutwardItems();
    }
    document.getElementById('out-item').value = itemName;
    document.getElementById('out-qty').value = qty;
    document.getElementById('out-date').value = today();
    document.getElementById('out-dept').value = department || '';
    document.getElementById('out-by').value = 'Ajay';
    document.getElementById('out-remarks').value = 'Req: ' + reqId;
    updOutwardInfo();
    window._pendingReqId = reqId;
    document.getElementById('outward-modal').classList.add('open');
    showPage('outward');
  }, 100);
}

async function cancelRequest(id) {
  if (!confirm('Cancel this request?')) return;
  try {
    await api('cancelRequest', { id });
    toast('Request cancelled', 'warn');
    loadRequests();
    loadDash();
  } catch(e) { toast(e.message, 'err'); }
}

// ── AJAY DASHBOARD ──
function toggleAjayOK() {
  const list = document.getElementById('aj-ok-list');
  const arrow = document.getElementById('aj-ok-arrow');
  if (!list) return;
  if (list.style.display === 'none') { list.style.display = 'block'; if (arrow) arrow.textContent = '▲ Hide'; }
  else { list.style.display = 'none'; if (arrow) arrow.textContent = '▼ Show'; }
}

async function loadAjayDash() {
  const now = new Date();
  const hr = now.getHours();
  const g = hr<12?'Good morning':hr<17?'Good afternoon':'Good evening';
  const grEl = document.getElementById('ajay-greeting');
  if (grEl) grEl.textContent = `${g}, Ajay 👋`;
  const dtEl = document.getElementById('ajay-date');
  if (dtEl) dtEl.textContent = now.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  try {
    const d = await api('getDashboard');
    _stocks = d.stocks || [];
    const crit  = (d.stocks||[]).filter(s => s.status === 'Critical');
    const reord = (d.stocks||[]).filter(s => s.status === 'Reorder');
    setEl('aj-total',     d.totalItems || 0);
    setEl('aj-critical',  crit.length);
    setEl('aj-reorder',   reord.length);
    setEl('aj-req-count', d.pendingRequests || 0);

    const nb = document.getElementById('nb');
    if (nb) { nb.style.display = d.reorderCount>0?'inline':'none'; nb.textContent = d.reorderCount; }
    const nbr = document.getElementById('nb-req');
    if (nbr) { nbr.style.display = d.pendingRequests>0?'inline':'none'; nbr.textContent = d.pendingRequests; }
    const ajrb = document.getElementById('aj-req-badge');
    if (ajrb) { ajrb.style.display = d.pendingRequests>0?'inline':'none'; ajrb.textContent = d.pendingRequests; }

    // Today Inward
    const inL = document.getElementById('aj-inward-list');
    const inC = document.getElementById('aj-in-count');
    try {
      const inRows = await api('getInward', { date: today() });
      const inMap = {};
      inRows.forEach(r => {
        if (!inMap[r.itemName]) inMap[r.itemName] = { qty: 0, unit: r.unit };
        inMap[r.itemName].qty += r.qty;
      });
      const inItems = Object.entries(inMap).sort((a,b) => a[0].localeCompare(b[0]));
      if (inC) inC.textContent = inItems.length ? inItems.length + ' items' : '';
      if (inL) inL.innerHTML = inItems.length
        ? inItems.map(([name, v]) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 16px;border-bottom:1px solid var(--border);">
            <div style="font-weight:600;font-size:13px;color:var(--navy);">${name}</div>
            <span style="font-family:var(--mono);font-weight:700;color:var(--green);">+${v.qty} <span style="font-size:11px;font-weight:400;color:var(--muted);">${v.unit||''}</span></span>
          </div>`).join('')
        : `<div class="empty" style="padding:20px;"><div class="ei">📥</div><div class="et">No inward today</div></div>`;
    } catch(e) {}

    // Today Outward
    const outL = document.getElementById('aj-outward-list');
    const outC = document.getElementById('aj-out-count');
    try {
      const outRows = await api('getOutward', { date: today() });
      const manual = outRows.filter(r => !(r.remarks||'').startsWith('Dispatch:'));
      const outMap = {};
      manual.forEach(r => {
        if (!outMap[r.itemName]) outMap[r.itemName] = { qty: 0, unit: r.unit };
        outMap[r.itemName].qty += r.qty;
      });
      const outItems = Object.entries(outMap).sort((a,b) => a[0].localeCompare(b[0]));
      if (outC) outC.textContent = outItems.length ? outItems.length + ' items' : '';
      if (outL) outL.innerHTML = outItems.length
        ? outItems.map(([name, v]) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 16px;border-bottom:1px solid var(--border);">
            <div style="font-weight:600;font-size:13px;color:var(--navy);">${name}</div>
            <span style="font-family:var(--mono);font-weight:700;color:var(--orange);">-${v.qty} <span style="font-size:11px;font-weight:400;color:var(--muted);">${v.unit||''}</span></span>
          </div>`).join('')
        : `<div class="empty" style="padding:20px;"><div class="ei">📤</div><div class="et">No outward today</div></div>`;
    } catch(e) {}

    // Pending requests
    const reqW = document.getElementById('aj-requests');
    if (reqW) {
      try {
        const reqs = await api('getRequests', { status: 'Pending' });
        if (ajrb) { ajrb.style.display = reqs.length>0?'inline':'none'; ajrb.textContent = reqs.length; }
        setEl('aj-req-count', reqs.length || d.pendingRequests || 0);
        reqW.innerHTML = reqs.length
          ? reqs.map(r => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border);background:#f8faff;">
              <div>
                <div style="font-weight:600;font-size:13px;">${r.itemName}</div>
                <div style="font-size:11px;color:var(--muted);">${r.department||'—'} · ${r.requestedBy||'—'}</div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-family:var(--mono);font-weight:700;color:var(--accent);">${r.qty}</span>
                <button class="btn bgn bsm" onclick="fulfillRequest('${r.id}','${r.itemName.replace(/'/g,"\\'")}',${r.qty},'${r.department||''}')">Issue</button>
              </div>
            </div>`).join('')
          : `<div class="empty" style="padding:20px;"><div class="ei">✅</div><div class="et">No pending requests</div></div>`;
      } catch(e) {}
    }

    setDot('ok', 'Connected');
  } catch(e) { toast(e.message, 'err'); setDot('err', 'Error'); }
}

// ── WIP TRACKER ──
async function loadWip() {
  const tb = document.getElementById('wip-tb');
  const em = document.getElementById('wip-empty');
  if (tb) tb.innerHTML = `<tr class="lrow"><td colspan="6"><span class="loader"></span></td></tr>`;
  try {
    const d = await api('getDashboard');
    const stocks = d.stocks || [];
    const outRows = await api('getOutward', {});
    const disRows = await api('getDispatch', {});
    const manualOut = {}, dispUsed = {};
    outRows.forEach(r => {
      if (!(r.remarks||'').startsWith('Dispatch:')) {
        manualOut[r.itemName] = (manualOut[r.itemName]||0) + (r.qty||0);
      }
    });
    for (const dis of disRows) {
      try {
        const bItems = await api('getBomItems', { bomName: dis.bomModel });
        bItems.forEach(bi => {
          dispUsed[bi.component] = (dispUsed[bi.component]||0) + (bi.qty * dis.qtyProduced);
        });
      } catch(e) {}
    }
    const wipData = stocks.map(s => ({
      name: s.name, cat: s.cat, unit: s.unit,
      totalOut: manualOut[s.name] || 0,
      dispUsed: dispUsed[s.name] || 0,
      wip: Math.max(0, (manualOut[s.name]||0) - (dispUsed[s.name]||0))
    })).filter(s => s.totalOut > 0).sort((a,b) => b.wip - a.wip);

    if (!wipData.length) { if (tb) tb.innerHTML = ''; if (em) em.style.display = 'block'; return; }
    if (em) em.style.display = 'none';
    if (tb) tb.innerHTML = wipData.map(s => `<tr>
      <td style="font-weight:600;color:var(--navy);">${s.name}</td>
      <td>${catBadge(s.cat)}</td>
      <td style="color:var(--muted);font-size:12px;">${s.unit||'—'}</td>
      <td style="font-family:var(--mono);color:var(--orange);font-weight:600;">${s.totalOut}</td>
      <td style="font-family:var(--mono);color:var(--green);font-weight:600;">${s.dispUsed}</td>
      <td>
        <span style="font-family:var(--mono);font-weight:800;font-size:16px;color:${s.wip>0?'var(--purple)':'var(--muted)'};">${s.wip}</span>
        ${s.wip > 0 ? `<span style="font-size:10px;color:var(--purple);margin-left:4px;">In Production</span>` : ''}
      </td>
    </tr>`).join('');
  } catch(e) { toast(e.message, 'err'); }
}

// ── SANDEEP DASHBOARD ──
async function loadSandeepDash() {
  const now = new Date();
  const hr = now.getHours();
  const g = hr<12?'Good morning':hr<17?'Good afternoon':'Good evening';
  const grEl = document.getElementById('sandeep-greeting');
  if (grEl) grEl.textContent = `${g}, Sandeep 👋`;
  const dtEl = document.getElementById('sandeep-date');
  if (dtEl) dtEl.textContent = now.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  function catSection(id, cat, icon, items, renderDetail) {
    const total = items.reduce((s,i) => s + (i.qty||i.wip||0), 0);
    const unit  = items[0] ? (items[0].unit||'') : '';
    return `<div style="border-bottom:1px solid var(--border);">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;cursor:pointer;background:var(--s2);"
        onclick="const d=document.getElementById('${id}');const a=document.getElementById('arr-${id}');if(d.style.display==='none'){d.style.display='block';a.textContent='▲';}else{d.style.display='none';a.textContent='▼';}">
        <div style="display:flex;align-items:center;gap:8px;">
          <span>${icon}</span>
          <span style="font-weight:700;font-size:13px;color:var(--navy);">${cat}</span>
          <span style="font-size:11px;color:var(--muted);">${items.length} items</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-family:var(--mono);font-weight:700;font-size:15px;color:var(--navy);">${total} <span style="font-size:11px;font-weight:400;color:var(--muted);">${unit}</span></span>
          <span id="arr-${id}" style="font-size:11px;color:var(--muted);">▼</span>
        </div>
      </div>
      <div id="${id}" style="display:none;">${renderDetail(items)}</div>
    </div>`;
  }

  try {
    const d = await api('getDashboard');
    _stocks = d.stocks || [];

    // Section 1: Today Received
    const issueEl = document.getElementById('sd-issue-section');
    const issueSummEl = document.getElementById('sd-issue-summary');
    try {
      const outRows = await api('getOutward', { date: today() });
      const issued = outRows.filter(r => !(r.remarks||'').startsWith('Dispatch:'));
      const catMap = {};
      issued.forEach(r => {
        const s = _stocks.find(x => x.name === r.itemName);
        const cat = s ? s.cat : 'Other';
        if (!catMap[cat]) catMap[cat] = {};
        if (!catMap[cat][r.itemName]) catMap[cat][r.itemName] = { qty: 0, unit: r.unit };
        catMap[cat][r.itemName].qty += r.qty;
      });
      const cats = Object.keys(catMap).sort();
      if (issueSummEl) issueSummEl.textContent = issued.length ? `${cats.length} categories, ${issued.length} entries` : '';
      if (!cats.length) {
        if (issueEl) issueEl.innerHTML = `<div class="empty" style="padding:24px;"><div class="ei">📤</div><div class="et">Nothing received today</div></div>`;
      } else {
        const html = cats.map(cat => {
          const items = Object.entries(catMap[cat]).sort((a,b)=>a[0].localeCompare(b[0])).map(([name,v])=>({name,qty:v.qty,unit:v.unit}));
          return catSection(`sd-iss-${cat}`, cat, getCatIcon(cat), items, (items) =>
            items.map(i => `<div style="display:flex;justify-content:space-between;padding:8px 16px 8px 32px;border-bottom:1px solid var(--border);font-size:13px;">
              <span style="color:var(--t2);">${i.name}</span>
              <span style="font-family:var(--mono);font-weight:700;color:var(--orange);">${i.qty} <span style="font-size:11px;font-weight:400;color:var(--muted);">${i.unit||''}</span></span>
            </div>`).join('')
          );
        }).join('');
        if (issueEl) issueEl.innerHTML = html;
      }
    } catch(e) {}

    // Section 2: WIP
    const wipEl  = document.getElementById('sd-wip-section');
    const wipSummEl = document.getElementById('sd-wip-summary');

    // Fresh stock data se WIP calculate karo — dashboard wipItems pe depend mat karo
    const freshStocks = await api('getStockSummary');
    const wipItems = freshStocks.filter(s => (s.wip || 0) > 0);
    const wipCatMap = {};
    wipItems.forEach(s => {
      const cat = s.cat || 'Other';
      if (!wipCatMap[cat]) wipCatMap[cat] = [];
      wipCatMap[cat].push({ name: s.name, qty: s.wip, unit: s.unit });
    });
    const wipCats = Object.keys(wipCatMap).sort();
    if (wipSummEl) wipSummEl.textContent = wipItems.length ? `${wipItems.length} items in production` : 'Nothing in WIP';
    if (!wipCats.length) {
      if (wipEl) wipEl.innerHTML = `<div class="empty" style="padding:24px;"><div class="ei">🏭</div><div class="et">Nothing in WIP</div></div>`;
    } else {
      const html = wipCats.map(cat => {
        const items = wipCatMap[cat];
        return catSection(`sd-wip-${cat}`, cat, getCatIcon(cat), items, (items) =>
          items.map(i => `<div style="display:flex;justify-content:space-between;padding:8px 16px 8px 32px;border-bottom:1px solid var(--border);font-size:13px;">
            <span style="color:var(--t2);">${i.name}</span>
            <span style="font-family:var(--mono);font-weight:700;color:var(--purple);">${i.qty} <span style="font-size:11px;font-weight:400;color:var(--muted);">${i.unit||''}</span></span>
          </div>`).join('')
        );
      }).join('');
      if (wipEl) wipEl.innerHTML = html;
    }

    // Section 3: Today Dispatch
    const disEl  = document.getElementById('sd-dispatch-section');
    const disSummEl = document.getElementById('sd-dispatch-summary');
    try {
      const disRows = await api('getDispatch', {});
      const todayDis = disRows.filter(r => r.date === today());
      if (disSummEl) disSummEl.textContent = todayDis.length ? `${todayDis.length} dispatched today` : 'No dispatch today';
      if (!todayDis.length) {
        if (disEl) disEl.innerHTML = `<div class="empty" style="padding:24px;"><div class="ei">🚚</div><div class="et">No dispatch today</div></div>`;
      } else {
        const bomMap = {};
        todayDis.forEach(r => {
          if (!bomMap[r.bomModel]) bomMap[r.bomModel] = { qty: 0, entries: [] };
          bomMap[r.bomModel].qty += r.qtyProduced;
          bomMap[r.bomModel].entries.push(r);
        });
        const html = Object.entries(bomMap).map(([model, v]) => {
          const items = [{name: model, qty: v.qty, unit: 'units'}];
          return catSection(`sd-dis-${model.replace(/\s/g,'_')}`, model, '🔋', items, () =>
            v.entries.map(r => `<div style="display:flex;justify-content:space-between;padding:8px 16px 8px 32px;border-bottom:1px solid var(--border);font-size:13px;">
              <div>
                <div style="font-weight:600;color:var(--navy);">${r.bomModel}</div>
                <div style="font-size:11px;color:var(--muted);">${r.dispatchTo||'—'} · ${r.by||'—'}</div>
              </div>
              <span style="font-family:var(--mono);font-weight:700;color:var(--green);">×${r.qtyProduced}</span>
            </div>`).join('')
          );
        }).join('');
        if (disEl) disEl.innerHTML = html;
      }
    } catch(e) {}

    setDot('ok', 'Connected');
  } catch(e) { toast(e.message, 'err'); setDot('err', 'Error'); }
}

// ============================================================
// ADMIN DASHBOARD CHARTS
// ============================================================
let _reorderChartInst  = null;
let _wipChartInst      = null;
let _categoryChartInst = null;

function renderReorderChart(stocks) {
  const canvas = document.getElementById('reorderChart');
  if (!canvas) return;
  const items = stocks.filter(s => s.status !== 'OK').slice(0, 12);
  if (!items.length) {
    canvas.parentElement.innerHTML = `<div class="empty" style="padding:40px;"><div class="ei">✅</div><div class="et">All stocks healthy!</div><div class="es">Koi reorder required nahi</div></div>`;
    return;
  }
  const labels  = items.map(s => s.name.length > 14 ? s.name.slice(0,14)+'…' : s.name);
  const current = items.map(s => s.currentStock);
  const rop     = items.map(s => s.reorderPoint);
  if (_reorderChartInst) _reorderChartInst.destroy();
  _reorderChartInst = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Current Stock',
          data: current,
          backgroundColor: items.map(s => s.status === 'Critical' ? 'rgba(220,38,38,.85)' : 'rgba(234,88,12,.85)'),
          borderRadius: 5, borderSkipped: false,
        },
        {
          label: 'Reorder Point',
          data: rop,
          backgroundColor: 'rgba(37,88,232,.18)',
          borderColor: 'rgba(37,88,232,.6)',
          borderWidth: 1.5,
          borderRadius: 5, borderSkipped: false,
        },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: { position: 'top', labels: { font: { size: 11, family: 'DM Sans' }, boxWidth: 12, padding: 12 } },
        tooltip: { callbacks: { afterBody: (i) => { const s = items[i[0].dataIndex]; return s ? [`Status: ${s.status}`, `Max: ${s.maxL||0}`] : []; } } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10, family: 'DM Sans' }, maxRotation: 35 } },
        y: { beginAtZero: true, ticks: { font: { size: 10, family: 'DM Sans' } }, grid: { color: 'rgba(0,0,0,.04)' } }
      }
    }
  });
}

function renderWipChart(wipItems) {
  const canvas = document.getElementById('wipChart');
  if (!canvas) return;
  if (!wipItems || !wipItems.length) {
    canvas.parentElement.innerHTML = `<div class="empty" style="padding:40px;"><div class="ei">🏭</div><div class="et">No WIP items</div><div class="es">Production mein kuch nahi</div></div>`;
    return;
  }
  const labels = wipItems.map(s => s.name.length > 14 ? s.name.slice(0,14)+'…' : s.name);
  const data   = wipItems.map(s => s.wip);
  if (_wipChartInst) _wipChartInst.destroy();
  _wipChartInst = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'WIP Qty',
        data,
        backgroundColor: 'rgba(124,58,237,.8)',
        borderRadius: 5, borderSkipped: false,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { afterBody: (i) => { const s = wipItems[i[0].dataIndex]; return s ? [`Store Stock: ${s.currentStock} ${s.unit||''}`] : []; } } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10, family: 'DM Sans' }, maxRotation: 35 } },
        y: { beginAtZero: true, ticks: { font: { size: 10, family: 'DM Sans' } }, grid: { color: 'rgba(0,0,0,.04)' } }
      }
    }
  });
}

function renderCategoryChart(stocks) {
  const canvas = document.getElementById('categoryChart');
  if (!canvas || !stocks.length) return;
  const catMap = {};
  stocks.forEach(s => { catMap[s.cat||'Other'] = (catMap[s.cat||'Other']||0) + 1; });
  const labels = Object.keys(catMap);
  const data   = Object.values(catMap);
  const colors = [
    'rgba(37,88,232,.85)', 'rgba(16,163,74,.85)', 'rgba(234,88,12,.85)',
    'rgba(124,58,237,.85)', 'rgba(220,38,38,.85)', 'rgba(8,145,178,.85)',
    'rgba(217,119,6,.85)', 'rgba(107,114,128,.85)'
  ];
  if (_categoryChartInst) _categoryChartInst.destroy();
  _categoryChartInst = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.slice(0, labels.length),
        borderWidth: 2, borderColor: '#fff',
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11, family: 'DM Sans' }, boxWidth: 12, padding: 10 } },
        tooltip: { callbacks: { label: (i) => ` ${i.label}: ${i.raw} items` } }
      }
    }
  });
}

// ── CREATE PO FROM REORDER ──
async function openCreatePO() {
  const btn = document.getElementById('po-btn');
  const list = document.getElementById('po-items-list');
  list.innerHTML = `<div class="empty" style="padding:20px;"><div class="ei">⏳</div><div class="et">Loading reorder items...</div></div>`;
  document.getElementById('po-supplier').value = '';
  document.getElementById('po-exp-date').value = '';
  document.getElementById('create-po-modal').classList.add('open');

  try {
    if (!_stocks.length) _stocks = await api('getStockSummary');
    const reorderItems = _stocks.filter(s => s.status === 'Critical' || s.status === 'Reorder');

    if (!reorderItems.length) {
      list.innerHTML = `<div class="empty" style="padding:20px;"><div class="ei">✅</div><div class="et">Koi reorder item nahi hai!</div></div>`;
      if (btn) btn.disabled = true;
      return;
    }
    if (btn) btn.disabled = false;

    list.innerHTML = `
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;border-bottom:1.5px solid var(--border);background:var(--s2);">Item</th>
            <th style="padding:8px 12px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;border-bottom:1.5px solid var(--border);background:var(--s2);text-align:center;">Status</th>
            <th style="padding:8px 12px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;border-bottom:1.5px solid var(--border);background:var(--s2);text-align:center;">Current</th>
            <th style="padding:8px 12px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;border-bottom:1.5px solid var(--border);background:var(--s2);text-align:center;">MOQ</th>
            <th style="padding:8px 12px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;border-bottom:1.5px solid var(--border);background:var(--s2);text-align:center;">Order Qty</th>
            <th style="padding:8px 12px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;border-bottom:1.5px solid var(--border);background:var(--s2);text-align:center;">Include</th>
          </tr></thead>
          <tbody>
            ${reorderItems.map(s => {
              const suggestedQty = s.stockToOrder > 0 ? s.stockToOrder : (s.moq || 0);
              const isCr = s.status === 'Critical';
              return `<tr>
                <td style="padding:10px 12px;border-bottom:1px solid var(--border);">
                  <div style="font-weight:600;color:var(--navy);font-size:13px;">${s.name}</div>
                  <div style="font-size:11px;color:var(--muted);margin-top:2px;">ROP: ${s.reorderPoint} | Max: ${s.maxL || 0} ${s.unit}</div>
                </td>
                <td style="padding:10px 12px;border-bottom:1px solid var(--border);text-align:center;">${stBadge(s.status)}</td>
                <td style="padding:10px 12px;border-bottom:1px solid var(--border);text-align:center;font-family:var(--mono);font-weight:700;color:${isCr?'var(--red)':'var(--orange)'};">${s.currentStock} ${s.unit}</td>
                <td style="padding:10px 12px;border-bottom:1px solid var(--border);text-align:center;font-family:var(--mono);color:var(--muted);">${s.moq || '—'}</td>
                <td style="padding:10px 12px;border-bottom:1px solid var(--border);text-align:center;">
                  <input type="number" min="1" value="${suggestedQty}" id="po-qty-${s.name.replace(/\s/g,'_')}"
                    style="width:80px;text-align:center;font-family:var(--mono);font-weight:600;font-size:13px;background:var(--s2);border:1.5px solid var(--border);border-radius:6px;padding:5px 8px;outline:none;">
                </td>
                <td style="padding:10px 12px;border-bottom:1px solid var(--border);text-align:center;">
                  <input type="checkbox" id="po-chk-${s.name.replace(/\s/g,'_')}" checked
                    style="width:16px;height:16px;cursor:pointer;accent-color:var(--accent);">
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  } catch(e) { toast(e.message, 'err'); closeM('create-po-modal'); }
}

async function saveCreatePO() {
  if (!_stocks.length) return;
  const reorderItems = _stocks.filter(s => s.status === 'Critical' || s.status === 'Reorder');
  const supplier  = document.getElementById('po-supplier').value;
  const expDate   = document.getElementById('po-exp-date').value;

  // Collect checked items
  const toCreate = [];
  reorderItems.forEach(s => {
    const key = s.name.replace(/\s/g,'_');
    const chk = document.getElementById('po-chk-'+key);
    const qty = Number((document.getElementById('po-qty-'+key)||{}).value) || 0;
    if (chk && chk.checked && qty > 0) {
      toCreate.push({ itemName: s.name, qty, supplier, expectedDate: expDate });
    }
  });

  if (!toCreate.length) { toast('Koi item select nahi hai', 'err'); return; }

  const btn = document.getElementById('po-btn');
  btn.disabled = true; btn.textContent = 'Creating...';

  try {
    let created = 0;
    for (const item of toCreate) {
      await api('addIndent', {
        itemName: item.itemName,
        qty: item.qty,
        date: today(),
        supplier: item.supplier,
        expectedDate: item.expectedDate,
        remarks: 'Auto PO from Reorder',
      });
      created++;
    }
    toast(`✓ ${created} PO entries created — Indent/PO mein dekho`, 'ok');
    closeM('create-po-modal');
    _stocks = [];
    loadReorder();
    // Navigate to indent page
    setTimeout(() => showPage('indent'), 1000);
  } catch(e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = '✓ Create PO'; }
}
let _sbInOpen  = false;
let _sbOutOpen = false;
let _sbInData  = [];
let _sbOutData = [];

async function loadSbActivity() {
  // Only for admin
  if (_currentRole !== 'admin') return;
  try {
    const [inRows, outRows] = await Promise.all([
      api('getInward', { date: today() }),
      api('getOutward', { date: today() }),
    ]);
    // Group inward by item
    const inMap = {};
    inRows.forEach(r => {
      if (!inMap[r.itemName]) inMap[r.itemName] = { qty: 0, unit: r.unit };
      inMap[r.itemName].qty += r.qty;
    });
    _sbInData = Object.entries(inMap).sort((a,b) => a[0].localeCompare(b[0]));

    // Group outward by item (exclude dispatch)
    const outMap = {};
    outRows.filter(r => !(r.remarks||'').startsWith('Dispatch:')).forEach(r => {
      if (!outMap[r.itemName]) outMap[r.itemName] = { qty: 0, unit: r.unit };
      outMap[r.itemName].qty += r.qty;
    });
    _sbOutData = Object.entries(outMap).sort((a,b) => a[0].localeCompare(b[0]));

    // Update counts
    const inC = document.getElementById('sb-in-count');
    if (inC) inC.textContent = _sbInData.length ? _sbInData.length + ' items' : '';
    const outC = document.getElementById('sb-out-count');
    if (outC) outC.textContent = _sbOutData.length ? _sbOutData.length + ' items' : '';

    // Re-render if open
    if (_sbInOpen)  renderSbIn();
    if (_sbOutOpen) renderSbOut();
  } catch(e) {}
}

function toggleSbPanel(listId, arrowId) {
  const list  = document.getElementById(listId);
  const arrow = document.getElementById(arrowId);
  if (!list) return;
  const isOpen = list.style.display !== 'none';
  list.style.display  = isOpen ? 'none' : 'block';
  if (arrow) arrow.textContent = isOpen ? '▼' : '▲';
  if (listId === 'sb-in-list')  { _sbInOpen  = !isOpen; if (!isOpen) renderSbIn(); }
  if (listId === 'sb-out-list') { _sbOutOpen = !isOpen; if (!isOpen) renderSbOut(); }
}

function renderSbIn() {
  const list = document.getElementById('sb-in-list');
  if (!list) return;
  if (!_sbInData.length) {
    list.innerHTML = `<div style="padding:8px 4px;text-align:center;font-size:11px;color:rgba(255,255,255,.3);">No inward today</div>`;
    return;
  }
  list.innerHTML = _sbInData.map(([name, v]) => `
    <div style="padding:6px 4px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;align-items:center;gap:4px;">
      <div style="font-size:11px;color:rgba(255,255,255,.7);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
      <span style="font-size:10px;font-weight:700;color:rgba(34,197,94,.9);flex-shrink:0;">+${v.qty} <span style="font-weight:400;opacity:.6;">${v.unit||''}</span></span>
    </div>`).join('');
}

function renderSbOut() {
  const list = document.getElementById('sb-out-list');
  if (!list) return;
  if (!_sbOutData.length) {
    list.innerHTML = `<div style="padding:8px 4px;text-align:center;font-size:11px;color:rgba(255,255,255,.3);">No outward today</div>`;
    return;
  }
  list.innerHTML = _sbOutData.map(([name, v]) => `
    <div style="padding:6px 4px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;align-items:center;gap:4px;">
      <div style="font-size:11px;color:rgba(255,255,255,.7);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
      <span style="font-size:10px;font-weight:700;color:rgba(234,88,12,.9);flex-shrink:0;">-${v.qty} <span style="font-weight:400;opacity:.6;">${v.unit||''}</span></span>
    </div>`).join('');
}
