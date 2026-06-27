// ============================================================
// LITPAX IMS — app.js v4.9
// API URL: change here if redeployed
// ============================================================

const API = 'https://script.google.com/macros/s/AKfycbzyfxO3CqB2ot24-iohidaP_FjInFfx9Qup8MUqY14cNu7IyAqbqsh-emXi865_bQjT/exec';

function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function showEl(id, show) { const el = document.getElementById(id); if (el) el.style.display = show ? 'inline' : 'none'; }

const DEPTS = ['Volt Wing','Ampere Wing','Volt x Ampere Wing','Mega Grid','Cathodic Wing','Future Cell','Phoenix Wing','Other'];

// ── ROLES & PINS ──
const ROLES = {
  admin:   { pin: 'IMS@Litpax', name: 'Admin',   homePage: 'dashboard',    pages: ['dashboard','inward','outward','dispatch','wip','requests','items','opening','bom','indent','stock','reorder','closing','adc'] },
  ajay:    { pin: '0001', name: 'Ajay',    homePage: 'ajay-dash',    pages: ['ajay-dash','inward','outward','requests','items','opening','bom','indent','stock','reorder'] },
  sandeep: { pin: '0002', name: 'Sandeep', homePage: 'sandeep-dash', pages: ['sandeep-dash','dispatch','received','wip','stock','items','bom'] },
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

// ── PIN SECURITY ──
let _pinAttempts = 0;
let _pinLocked   = false;
let _lockTimer   = null;

function doLogin() {
  const pin = document.getElementById('login-pin').value;
  const err = document.getElementById('login-err');

  if (!_selectedRole) {
    err.textContent = '❌ Pehle role select karo';
    err.style.display = 'block';
    return;
  }

  if (_pinLocked) {
    err.style.display = 'block';
    err.textContent = '🔒 Account locked — wait karo';
    return;
  }

  if (pin !== ROLES[_selectedRole].pin) {
    _pinAttempts++;
    document.getElementById('login-pin').value = '';

    if (_pinAttempts >= 3) {
      _pinLocked = true;
      let secs = 30;
      err.style.display = 'block';
      const tick = () => {
        err.textContent = `🔒 3 galat attempts — ${secs}s baad try karo`;
        if (secs <= 0) {
          _pinLocked   = false;
          _pinAttempts = 0;
          err.textContent = '❌ Galat PIN — dobara try karo';
          clearInterval(_lockTimer);
        }
        secs--;
      };
      tick();
      _lockTimer = setInterval(tick, 1000);
    } else {
      err.style.display = 'block';
      err.textContent = `❌ Galat PIN — ${3 - _pinAttempts} attempts bache`;
    }
    return;
  }

  // Correct PIN
  _pinAttempts = 0;
  _pinLocked   = false;
  clearInterval(_lockTimer);
  _currentRole = _selectedRole;
  sessionStorage.setItem('lpx_role', _currentRole);
  sessionStorage.setItem('lpx_name', ROLES[_currentRole].name);
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
  sessionStorage.removeItem('lpx_role');
  sessionStorage.removeItem('lpx_name');
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
function htmlEnc(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

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
  await loadConfig();
  const savedRole = sessionStorage.getItem('lpx_role');
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
  if (id === 'dispatch')     { const d = document.getElementById('dis-filter-date'); if(d && !d.value) d.value = today(); loadDispatch(); }
  if (id === 'items')        loadItems();
  if (id === 'bom')          loadBom();
  if (id === 'stock')        loadStock();
  if (id === 'reorder')      loadReorder();
  if (id === 'closing')      { document.getElementById('cl-date').value = today(); genClosing(); }
  if (id === 'opening')      loadOpeningStock();
  if (id === 'indent')       loadIndents();
  if (id === 'requests')     loadRequests();
  if (id === 'wip')          loadWip();
  if (id === 'adc')          initADC();
  if (id === 'received')     { const d = document.getElementById('recv-date'); if(d) d.value = today(); loadReceived(); }
}

// ── BADGES ──
function catBadge(c) {
  const m = {
    'Cells':'b-cells','BMS':'b-bms','Charger':'b-charger',
    'Nickel/Busbar':'b-nickel','Box':'b-box','Wire':'b-wire',
    'Consumables':'b-con','Tools':'b-tools','Packaging':'b-pkg',
    'Raw Material':'b-rm'
  };
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
async function migrateCategories() {
  try {
    const r = await api('migrateCategories');
    toast(`✓ ${r.message} — page reload ho raha hai`, 'ok');
    setTimeout(() => location.reload(), 1500);
  } catch(e) { toast(e.message, 'err'); }
}

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

    loadSbActivity();
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
  const addOpt = (name) => { const o = document.createElement('option'); o.value = name; o.textContent = name; sel.appendChild(o); };
  if (!filtered.length && _stocks.length) {
    _stocks.filter(s => s.cat === cat).forEach(s => addOpt(s.name));
  } else {
    filtered.forEach(i => addOpt(i.name));
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
    const inPurpose = document.querySelector('input[name="in-purpose"]:checked')?.value || 'Raw Material';
    await api('addInward', {
      itemName, qty, date,
      purpose:  inPurpose,
      supplier: inPurpose === 'Raw Material' ? document.getElementById('in-supplier').value : '',
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

function updInwardPurpose() {
  const purpose = document.querySelector('input[name="in-purpose"]:checked')?.value;
  const supWrap = document.getElementById('in-supplier-wrap');
  if (supWrap) supWrap.style.display = purpose === 'From Production' ? 'none' : '';
}

// ── OUTWARD ──
async function loadOutward() {
  const dateF    = document.getElementById('out-date-f').value;
  const deptF    = document.getElementById('out-dept-f').value;
  const itemF    = document.getElementById('out-item-f')?.value || '';
  const purposeF = document.getElementById('out-purpose-f')?.value || '';
  document.getElementById('out-tb').innerHTML = `<tr class="lrow"><td colspan="9"><span class="loader"></span></td></tr>`;
  try {
    const body = {};
    if (dateF) body.date = dateF;
    if (deptF) body.department = deptF;
    let rows = await api('getOutward', body);
    const itemF_el = document.getElementById('out-item-f');
    if (itemF_el && itemF_el.options.length <= 1) {
      const allItems = [...new Set(rows.map(r => r.itemName).filter(Boolean))].sort();
      allItems.forEach(i => { const o = document.createElement('option'); o.value = i; o.textContent = i; itemF_el.appendChild(o); });
      if (itemF) itemF_el.value = itemF;
    }
    if (itemF) rows = rows.filter(r => r.itemName === itemF);
    if (purposeF) rows = rows.filter(r => (r.purpose||'Production') === purposeF);
    renderOutward(rows);
  } catch(e) { toast(e.message, 'err'); }
}
function renderOutward(rows) {
  const tb = document.getElementById('out-tb');
  const em = document.getElementById('out-empty');
  if (!rows.length) { tb.innerHTML = ''; em.style.display = 'block'; return; }
  em.style.display = 'none';
  tb.innerHTML = rows.map(r => {
    const purpose = r.purpose || 'Production';
    const purBadge = purpose === 'Production'
      ? `<span class="badge b-in">🏭 Production</span>`
      : `<span class="badge b-con">🔧 Repair</span>`;
    return `<tr>
    <td style="color:var(--muted);font-size:12px;">${fmtD(r.date)}</td>
    <td style="font-weight:500;">${r.itemName}</td>
    <td style="font-family:var(--mono);font-weight:700;color:var(--red);">-${r.qty}</td>
    <td style="color:var(--muted);font-size:12px;">${r.unit || '—'}</td>
    <td>${purBadge}</td>
    <td>${depBadge(r.department)}</td>
    <td style="font-size:12px;">${r.issuedTo || '—'}</td>
    <td style="font-size:12px;color:var(--muted);">${r.by || '—'}</td>
    <td style="font-size:12px;color:var(--muted);">${r.remarks || '—'}</td>
  </tr>`;}).join('');
}
function clearOutFilters() {
  document.getElementById('out-date-f').value = '';
  document.getElementById('out-dept-f').value = '';
  const itemF = document.getElementById('out-item-f');
  if (itemF) { itemF.innerHTML = '<option value="">All Items</option>'; }
  const purF = document.getElementById('out-purpose-f');
  if (purF) purF.value = '';
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
    const opt = document.createElement('option');
    opt.value = s.name;
    opt.textContent = s.name;
    sel.appendChild(opt);
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
    const outPurpose = document.querySelector('input[name="out-purpose"]:checked')?.value || 'Production';
    await api('addOutward', {
      itemName, qty, date, department,
      purpose:  outPurpose,
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
  document.getElementById('dis-tb').innerHTML = `<tr class="lrow"><td colspan="9"><span class="loader"></span></td></tr>`;
  try {
    const dateEl = document.getElementById('dis-filter-date');
    const date = dateEl ? dateEl.value : '';
    const params = date ? { date } : {};
    const rows = await api('getDispatch', params);
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
    <td>${r.bomVerified === 'YES' || r.bomVerified === 'Direct' ? '<span class="badge b-ok">✓ Yes</span>' : '<span class="badge b-ro">Pending</span>'}</td>
    <td style="font-size:12px;color:var(--muted);">${r.remarks || '—'}</td>
    <td style="white-space:nowrap;">
      <button class="btn bg bsm" style="font-size:11px;padding:4px 8px;" onclick="openEditDispatch(${JSON.stringify(r).replace(/"/g,'&quot;')})">✏️</button>
      <button class="btn brd bsm" style="font-size:11px;padding:4px 8px;margin-left:4px;" onclick="deleteDispatch('${r.id}','${r.bomModel}')">🗑</button>
    </td>
  </tr>`).join('');
}

function openEditDispatch(r) {
  document.getElementById('edit-dis-id').value      = r.id;
  document.getElementById('edit-dis-model').value   = r.bomModel;
  document.getElementById('edit-dis-qty').value     = r.qtyProduced;
  document.getElementById('edit-dis-date').value    = r.date;
  document.getElementById('edit-dis-to').value      = r.dispatchTo || '';
  document.getElementById('edit-dis-ref').value     = r.orderRef || '';
  document.getElementById('edit-dis-remarks').value = r.remarks || '';
  document.getElementById('edit-dispatch-modal').classList.add('open');
}

async function saveEditDispatch() {
  const id = document.getElementById('edit-dis-id').value;
  const body = {
    id,
    qtyProduced: Number(document.getElementById('edit-dis-qty').value),
    date:        document.getElementById('edit-dis-date').value,
    dispatchTo:  document.getElementById('edit-dis-to').value,
    orderRef:    document.getElementById('edit-dis-ref').value,
    remarks:     document.getElementById('edit-dis-remarks').value,
  };
  try {
    await api('updateDispatch', body);
    toast('Dispatch updated ✓', 'ok');
    closeM('edit-dispatch-modal');
    loadDispatch();
  } catch(e) { toast(e.message, 'err'); }
}

async function deleteDispatch(id, model) {
  if (!confirm(`"${model}" dispatch delete karna chahte ho?`)) return;
  try {
    await api('deleteDispatch', { id });
    toast('Dispatch deleted ✓', 'ok');
    loadDispatch();
  } catch(e) { toast(e.message, 'err'); }
}

async function openDispatchModal() {
  resetDispatchType();
  if (!_stocks.length) {
    try { const d = await api('getDashboard'); _stocks = d.stocks || []; _items = _stocks; } catch(e) {}
  }
  document.getElementById('dispatch-modal').classList.add('open');
}

function resetDispatchType() {
  document.getElementById('dis-type-step').style.display    = 'block';
  document.getElementById('dis-battery-step').style.display = 'none';
  document.getElementById('dis-charger-step').style.display = 'none';
  document.getElementById('dis-btn').style.display = 'none';
  document.getElementById('dd-btn').style.display  = 'none';
}

async function selectDispatchType(type) {
  document.getElementById('dis-type-step').style.display = 'none';

  if (type === 'battery') {
    document.getElementById('dis-battery-step').style.display = 'block';
    document.getElementById('dis-btn').style.display = 'block';
    document.getElementById('dd-btn').style.display  = 'none';
    await populateBomSelect('dis-bom');
    document.getElementById('dis-qty').value  = 1;
    document.getElementById('dis-date').value = today();
    document.getElementById('dis-by').value   = 'Sandeep';
    document.getElementById('dis-to').value   = '';
    document.getElementById('dis-ref').value  = '';
    document.getElementById('dis-remarks').value = '';
    document.getElementById('dis-preview').innerHTML = '';

  } else {
    document.getElementById('dis-charger-step').style.display = 'block';
    document.getElementById('dd-btn').style.display  = 'block';
    document.getElementById('dis-btn').style.display = 'none';
    document.getElementById('dd-date').value = today();
    document.getElementById('dd-by').value   = 'Sandeep';
    document.getElementById('dd-qty').value  = '';
    document.getElementById('dd-to').value   = '';
    document.getElementById('dd-invoice').value = '';
    document.getElementById('dd-ref').value  = '';
    document.getElementById('dd-remarks').value = '';
    document.getElementById('dd-wip-info').style.display = 'none';
    document.getElementById('dd-summary').style.display  = 'none';
    document.getElementById('dd-error').style.display    = 'none';
    document.getElementById('dd-btn').disabled = true;

    const chargerWip = _stocks.filter(s => s.cat === 'Charger' && (s.wip || 0) > 0);
    const sel = document.getElementById('dd-item');
    if (chargerWip.length) {
      sel.innerHTML = '<option value="">-- Select Charger --</option>' +
        chargerWip.map(s => `<option value="${s.name}">${s.name} (WIP: ${s.wip} ${s.unit})</option>`).join('');
    } else {
      sel.innerHTML = '<option value="">-- No chargers in WIP --</option>';
      const errEl = document.getElementById('dd-error');
      errEl.style.display = 'block';
      errEl.textContent = '⚠ Koi charger WIP mein nahi hai — pehle Ajay se outward karwao';
    }
  }
}

function updDirectDispatchInfo() {
  const itemName = document.getElementById('dd-item').value;
  const wip = document.getElementById('dd-wip-info');
  const btn = document.getElementById('dd-btn');
  const err = document.getElementById('dd-error');
  const sum = document.getElementById('dd-summary');
  err.style.display = 'none'; sum.style.display = 'none';
  if (!itemName) { wip.style.display = 'none'; btn.disabled = true; return; }
  const stock = _stocks.find(s => s.name === itemName);
  if (stock) {
    document.getElementById('dd-wip-qty').textContent  = stock.wip || 0;
    document.getElementById('dd-wip-unit').textContent = stock.unit || 'Pcs';
    wip.style.display = 'block';
    btn.disabled = false;
  }
  updDirectDispatchQty();
}

function updDirectDispatchQty() {
  const itemName = document.getElementById('dd-item').value;
  const qty      = Number(document.getElementById('dd-qty').value) || 0;
  const btn      = document.getElementById('dd-btn');
  const sum      = document.getElementById('dd-summary');
  const err      = document.getElementById('dd-error');
  if (!itemName || !qty) { sum.style.display = 'none'; return; }
  const stock = _stocks.find(s => s.name === itemName);
  if (!stock) return;
  const wipQty = stock.wip || 0;
  if (qty > wipQty) {
    err.style.display = 'block';
    err.textContent = `⛔ WIP mein sirf ${wipQty} ${stock.unit} hai — ${qty} dispatch nahi ho sakta`;
    sum.style.display = 'none';
    btn.disabled = true;
  } else {
    err.style.display = 'none';
    sum.style.display = 'block';
    sum.innerHTML = `✓ <b>${qty} ${stock.unit}</b> dispatch hogi &nbsp;|&nbsp; WIP mein bachega: <b>${wipQty - qty} ${stock.unit}</b>`;
    btn.disabled = false;
  }
}

async function saveDirectDispatch() {
  const itemName   = document.getElementById('dd-item').value;
  const qty        = Number(document.getElementById('dd-qty').value);
  const dispatchTo = document.getElementById('dd-to').value.trim();
  const date       = document.getElementById('dd-date').value;
  if (!itemName)       { toast('Item select karo', 'err'); return; }
  if (!qty || qty <= 0){ toast('Qty daalo', 'err'); return; }
  if (!dispatchTo)     { toast('Dispatch To mandatory hai', 'err'); return; }
  if (!date)           { toast('Date daalo', 'err'); return; }
  const btn = document.getElementById('dd-btn');
  btn.disabled = true; btn.textContent = 'Processing...';
  try {
    const r = await api('addDirectDispatch', {
      itemName, qty, date, dispatchTo,
      invoiceNo: document.getElementById('dd-invoice').value,
      orderRef:  document.getElementById('dd-ref').value,
      by:        document.getElementById('dd-by').value || 'Sandeep',
      remarks:   document.getElementById('dd-remarks').value,
    });
    toast(`✓ ${r.itemName} — ${r.qty} dispatched | WIP remaining: ${r.remaining}`, 'ok');
    closeM('dispatch-modal');
    _stocks = [];
    loadDispatch();
    loadDash();
  } catch(e) {
    toast('⛔ ' + e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirm Charger Dispatch';
  }
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
let _config = {
  categories:  ['Cells','BMS','Charger','Nickel/Busbar','Box','Wire','Consumables','Tools','Packaging'],
  brands:      { 'Cells':['DMEGC','EVE','CATL','Other'], 'BMS':['JK','JBD','Daly','Solar','Other'], 'Charger':['Charge Q','Litpax','Indian','AXIOM','SHAKTI','XSTRONG POWER','Other'], 'Nickel/Busbar':['Nickel','Busbar'], 'Box':['Prismatic','Cylindrical','Other'], 'Wire':['—'], 'Consumables':['—'], 'Tools':['—'], 'Packaging':['—'] },
  units:       ['Pcs','Kg','g','L','ml','Roll','Set','m','Bucket','Meter'],
  departments: ['Volt Wing','Ampere Wing','Volt x Ampere Wing','Mega Grid','Cathodic Wing','Future Cell','Phoenix Wing','Other'],
  catUnits:    { 'Cells':'Pcs','BMS':'Pcs','Charger':'Pcs','Nickel/Busbar':'Kg','Box':'Pcs','Wire':'m','Consumables':'Pcs','Tools':'Pcs','Packaging':'Pcs' },
  catOrder:    ['Cells','BMS','Charger','Nickel/Busbar','Box','Wire','Consumables','Tools','Packaging'],
  noBrandCats: ['Wire','Consumables','Tools','Packaging'],
};

const CAT_BRANDS = new Proxy({}, { get: (_, k) => _config.brands[k] });
const CAT_UNITS  = new Proxy({}, { get: (_, k) => _config.catUnits[k] });

async function loadConfig() {
  try {
    const cfg = await api('getConfig');
    if (cfg && cfg.categories && cfg.categories.length) {
      _config = cfg;
    }
    if (cfg && cfg.roles) {
      Object.keys(cfg.roles).forEach(role => {
        if (ROLES[role]) ROLES[role].pin = cfg.roles[role];
      });
    }
    applyConfigToUI();
  } catch(e) {
    applyConfigToUI();
  }
}

function applyConfigToUI() {
  const catGrid = document.getElementById('cat-grid');
  if (catGrid) {
    const icons = { 'BMS':'⚡','Cells':'🔋','Charger':'🔌','Wire':'🔩','Nickel/Busbar':'🪙','Box':'📦','Consumables':'🧰','Tools':'🔧','Packaging':'📦' };
    catGrid.innerHTML = _config.catOrder.map(cat =>
      `<button type="button" class="cat-btn" onclick="selectCat('${cat}')">${icons[cat]||'📦'} ${cat}</button>`
    ).join('');
  }

  document.querySelectorAll('.unit-select').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = _config.units.map(u => `<option value="${u}">${u}</option>`).join('');
    if (cur) sel.value = cur;
  });

  const catOpts = `<option value="">All Categories</option>` +
    _config.catOrder.map(c => `<option>${c}</option>`).join('');
  document.querySelectorAll('.cat-filter-select').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = catOpts;
    if (cur) sel.value = cur;
  });

  const catOptsNoAll = _config.catOrder.map(c => `<option>${c}</option>`).join('');
  document.querySelectorAll('.cat-select').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = `<option value="">-- Select Category --</option>` + catOptsNoAll;
    if (cur) sel.value = cur;
  });

  const deptOpts = `<option value="">-- Select --</option>` +
    _config.departments.map(d => `<option>${d}</option>`).join('');
  document.querySelectorAll('.dept-select').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = deptOpts;
    if (cur) sel.value = cur;
  });
}

let _selCat = '', _selBrand = '';

function selectCat(cat) {
  _selCat = cat; _selBrand = '';
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  const brands = (_config.brands[cat] || ['Other']);
  const brandGrid = document.getElementById('brand-grid');
  const brandCustom = document.getElementById('f-brand-custom');
  const noBrandCats = _config.noBrandCats || ['Wire','Consumables','Tools','Packaging'];

  if (brands.length === 1 && brands[0] === '—' || noBrandCats.includes(cat)) {
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
  if ((_config.noBrandCats || ['Wire','Consumables','Tools','Packaging']).includes(_selCat)) {
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
  const noBrandCats = _config.noBrandCats || ['Wire','Consumables','Tools','Packaging'];
  if (noBrandCats.includes(item.cat)) return item.name;
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
    const noBrandCats = ['Wire','Consumables','Tools','Packaging'];
    const brand = noBrandCats.includes(cat) ? '__direct__' : parseBrand(s);
    if (!tree[cat]) tree[cat] = {};
    if (!tree[cat][brand]) tree[cat][brand] = [];
    tree[cat][brand].push(s);
  });
  let html = '';
  const CAT_ORDER = _config.catOrder || ['Cells','BMS','Charger','Nickel/Busbar','Box','Wire','Consumables','Tools','Packaging'];
  const sortedCats = [...Object.keys(tree)].sort((a,b) => {
    const ai = CAT_ORDER.indexOf(a); const bi = CAT_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1; if (bi === -1) return -1;
    return ai - bi;
  });
  sortedCats.forEach(cat => {
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

      if (brand === '__direct__') {
        html += `<div class="tree-brand">
          <div class="tree-model-headers">
            <span>Item</span><span>Unit</span><span>ROP</span><span>Max</span><span>MIT</span><span>Store Stock</span><span>WIP</span><span>Status</span>
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
        </div>`;
        return;
      }
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
  const icons = {'Cells':'🔋','BMS':'⚡','Charger':'🔌','Nickel/Busbar':'🪙','Box':'📦','Wire':'🔩','Consumables':'🧰','Tools':'🔧','Packaging':'📦'};
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
    const now = new Date();
    const hmMonth = document.getElementById('hm-month');
    if (hmMonth && !hmMonth.value) {
      hmMonth.value = now.toISOString().slice(0,7);
    }
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
async function loadHeatmapItems() { /* not needed */ }

async function genHeatmap() {
  const month = document.getElementById('hm-month').value;
  const cat   = (document.getElementById('hm-cat') || {}).value || '';
  const wrap  = document.getElementById('hm-content');

  if (!month) { toast('Month select karo', 'err'); return; }

  wrap.innerHTML = `<div class="empty"><div class="ei">⏳</div><div class="et">Calculating${cat ? ' — '+cat : ' all items'}...</div></div>`;

  try {
    if (!_stocks.length) _stocks = await api('getStockSummary');

    const data = await api('getMonthlyStockAll', { month });

    const days  = data.days;
    const items = cat
      ? data.items.filter(i => { const s = _stocks.find(x => x.name === i.name); return s ? s.cat === cat : false; })
      : data.items;

    if (!days.length || !items.length) {
      wrap.innerHTML = `<div class="empty"><div class="ei">📭</div><div class="et">No data</div></div>`;
      return;
    }

    const monthName = new Date(month + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

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
    filterOpeningStock();
  } catch(e) { toast(e.message, 'err'); }
}

function filterOpeningStock() {
  const cat = (document.getElementById('opening-cat-f') || {}).value || '';
  const openMap = {};
  _openingData.forEach(o => { openMap[o.name] = o; });

  const filtered = cat ? _items.filter(i => i.cat === cat) : _items;
  const countEl = document.getElementById('opening-count');
  if (countEl) countEl.textContent = filtered.length ? `${filtered.length} items` : '';

  const safeId = (name) => name.replace(/[^a-zA-Z0-9]/g, '_');
  const tb = document.getElementById('opening-tb');

  if (!filtered.length) {
    tb.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--muted);">No items in this category</td></tr>';
    return;
  }

  tb.innerHTML = filtered.map(item => {
    const existing = openMap[item.name] || {};
    const sid = safeId(item.name);
    return `<tr>
      <td style="font-weight:600;color:var(--navy);">${item.name} <span style="font-size:10px;color:var(--muted);">${item.unit||''}</span></td>
      <td><input class="inp" id="sku-${sid}" value="${existing.sku||''}" placeholder="SKU001" style="width:100px;"></td>
      <td style="color:var(--muted);font-size:12px;">${item.unit||'—'}</td>
      <td><input class="inp" id="op-${sid}" type="number" min="0" value="${existing.qty||0}" style="width:110px;font-family:var(--mono);font-weight:600;"></td>
      <td><input class="inp" id="rem-${sid}" value="${existing.remarks||''}" placeholder="Optional" style="width:150px;"></td>
    </tr>`;
  }).join('');
}

async function saveOpeningStock() {
  if (!_items.length) { toast('Items not loaded', 'err'); return; }
  const safeId = (name) => name.replace(/[^a-zA-Z0-9]/g, '_');
  const items = _items.map(item => {
    const key = safeId(item.name);
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
// PO SYSTEM
// ============================================================

// ── PO STATE ──
let _pos = [];
let _expandedPO = null;

// ── LOAD POs ──
async function loadIndents() {
  document.getElementById('indent-tb').innerHTML = `<tr class="lrow"><td colspan="7"><span class="loader"></span></td></tr>`;
  const statusF = document.getElementById('indent-status-f').value;
  try {
    const body = statusF ? { status: statusF } : {};
    _pos = await api('getPOs', body);
    renderPOs();
  } catch(e) { toast(e.message, 'err'); }
}

// ── RENDER PO LIST ──
function renderPOs() {
  const tb = document.getElementById('indent-tb');
  const em = document.getElementById('indent-empty');
  if (!_pos.length) { tb.innerHTML = ''; em.style.display = 'block'; return; }
  em.style.display = 'none';

  tb.innerHTML = _pos.map(po => {
    const stColor = po.status === 'Completed' ? 'b-ok'
                  : po.status === 'Cancelled'  ? 'b-ro'
                  : po.status === 'Partial'     ? 'b-dep'
                  : 'b-in';
    const isExpanded = _expandedPO === po.poId;
    return `
      <tr style="cursor:pointer;" onclick="togglePOExpand('${po.poId}')">
        <td style="font-family:var(--mono);font-size:11px;color:var(--accent);font-weight:700;">${po.poId}</td>
        <td style="font-size:12px;color:var(--muted);">${fmtD(po.date)}</td>
        <td style="font-weight:600;">${po.supplier || '—'}</td>
        <td style="font-size:12px;color:${po.expectedDate && po.expectedDate < today() && po.status==='Pending' ? 'var(--red)' : 'var(--muted)'};">${fmtD(po.expectedDate) || '—'}</td>
        <td><span class="badge ${stColor}">${po.status}</span></td>
        <td style="font-family:var(--mono);font-size:12px;">${po.totalItems} items</td>
        <td style="white-space:nowrap;">
          <button class="btn bg bsm" style="font-size:11px;padding:4px 8px;" title="Print PO" onclick="event.stopPropagation();printPOById('${po.poId}','${po.supplier||''}','${po.expectedDate||''}')">🖨</button>
          ${po.status !== 'Completed' && po.status !== 'Cancelled' ? `
            <button class="btn brd bsm" style="font-size:11px;padding:4px 8px;margin-left:4px;" onclick="event.stopPropagation();cancelPOConfirm('${po.poId}')">✕</button>
          ` : ''}
          <span style="font-size:11px;color:var(--muted);margin-left:6px;">${isExpanded ? '▲' : '▼'}</span>
        </td>
      </tr>
      ${isExpanded ? `
      <tr id="po-expand-${po.poId}">
        <td colspan="7" style="padding:0;background:#f8faff;border-bottom:2px solid var(--accent);">
          <div id="po-items-wrap-${po.poId}" style="padding:12px 20px;">
            <div style="color:var(--muted);font-size:12px;padding:8px 0;"><span class="loader"></span> Loading items...</div>
          </div>
        </td>
      </tr>` : ''}
    `;
  }).join('');

  if (_expandedPO) loadPOItems(_expandedPO);
}

async function togglePOExpand(poId) {
  _expandedPO = (_expandedPO === poId) ? null : poId;
  renderPOs();
}

async function loadPOItems(poId) {
  const wrap = document.getElementById('po-items-wrap-' + poId);
  if (!wrap) return;
  try {
    const po = _pos.find(p => p.poId === poId);
    const items = await api('getPOItems', { poId });
    if (!items.length) {
      wrap.innerHTML = `
        <div style="color:var(--muted);font-size:12px;padding:8px 0;">No items found</div>
        ${po && po.status !== 'Completed' && po.status !== 'Cancelled' ? `
          <div style="margin-top:12px;">
            <button class="btn bg bsm" onclick="openAddPOItemModal('${poId}')">+ Add Item</button>
          </div>
        ` : ''}
      `;
      return;
    }

    const pendingCount   = items.filter(i => i.status === 'Pending').length;
    const receivedCount  = items.filter(i => i.status === 'Received').length;
    const cancelledCount = items.filter(i => i.status === 'Cancelled').length;

    wrap.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="display:flex;gap:12px;font-size:12px;">
          <span style="color:var(--orange);">⏳ Pending: <b>${pendingCount}</b></span>
          <span style="color:var(--green);">✓ Received: <b>${receivedCount}</b></span>
          ${cancelledCount > 0 ? `<span style="color:var(--muted);">✕ Cancelled: <b>${cancelledCount}</b></span>` : ''}
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:var(--s2);">
            <th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;border-bottom:1px solid var(--border);">Item</th>
            <th style="padding:8px 12px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;border-bottom:1px solid var(--border);text-align:center;">Ordered</th>
            <th style="padding:8px 12px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;border-bottom:1px solid var(--border);text-align:center;">Received</th>
            <th style="padding:8px 12px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;border-bottom:1px solid var(--border);text-align:center;">Status</th>
            <th style="padding:8px 12px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;border-bottom:1px solid var(--border);">Invoice / Date</th>
            <th style="padding:8px 12px;border-bottom:1px solid var(--border);"></th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => {
            const stBadgeStr = item.status === 'Received'  ? '<span class="badge b-ok">✓ Received</span>'
                          : item.status === 'Cancelled' ? '<span class="badge b-ro">✕ Cancelled</span>'
                          : '<span class="badge b-dep">⏳ Pending</span>';
            return `<tr style="border-bottom:1px solid var(--border);">
              <td style="padding:10px 12px;font-weight:600;color:var(--navy);">${item.itemName}
                <div style="font-size:11px;font-weight:400;color:var(--muted);">${item.unit}</div>
              </td>
              <td style="padding:10px 12px;text-align:center;font-family:var(--mono);font-weight:700;">${item.orderedQty}</td>
              <td style="padding:10px 12px;text-align:center;font-family:var(--mono);font-weight:700;color:var(--green);">${item.receivedQty > 0 ? item.receivedQty : '—'}</td>
              <td style="padding:10px 12px;text-align:center;">${stBadgeStr}</td>
              <td style="padding:10px 12px;font-size:11px;color:var(--muted);">
                ${item.invoice ? `<div>${item.invoice}</div>` : ''}
                ${item.receivedDate ? `<div>${fmtD(item.receivedDate)}</div>` : '—'}
              </td>
              <td style="padding:10px 12px;white-space:nowrap;">
                ${item.status === 'Pending' ? `
                  <button class="btn bgn bsm" style="font-size:11px;padding:4px 10px;" onclick="openReceivePOItemModal('${poId}','${item.itemName.replace(/'/g,"\\'")}',${item.orderedQty},'${po ? po.supplier||'' : ''}')">✓ Receive</button>
                  <button class="btn brd bsm" style="font-size:11px;padding:4px 8px;margin-left:4px;" onclick="cancelPOItemConfirm('${poId}','${item.itemName.replace(/'/g,"\\'")}')">✕</button>
                ` : '—'}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      ${po && po.status !== 'Completed' && po.status !== 'Cancelled' ? `
        <div style="margin-top:12px;padding-bottom:4px;">
          <button class="btn bg bsm" onclick="openAddPOItemModal('${poId}')">+ Add Item</button>
        </div>
      ` : ''}
    `;
  } catch(e) {
    if (wrap) wrap.innerHTML = `<div style="color:var(--red);font-size:12px;padding:8px 0;">Error: ${e.message}</div>`;
  }
}

// ── RECEIVE PO ITEM MODAL ──
let _currentPOReceive = null;

function openReceivePOItemModal(poId, itemName, orderedQty, supplier) {
  _currentPOReceive = { poId, itemName, orderedQty, supplier };
  document.getElementById('recv-info').innerHTML = `
    <div style="font-weight:600;font-size:14px;margin-bottom:4px;">${itemName}</div>
    <div style="color:var(--muted);font-size:12px;">PO: <b style="color:var(--accent);">${poId}</b> &nbsp;|&nbsp; Ordered: <b style="font-family:var(--mono);color:var(--navy);">${orderedQty}</b></div>`;
  document.getElementById('recv-qty').value      = orderedQty;
  document.getElementById('recv-date').value     = today();
  document.getElementById('recv-invoice').value  = '';
  document.getElementById('recv-supplier').value = supplier || '';
  document.getElementById('recv-by').value       = 'Ajay';
  document.getElementById('receive-modal').classList.add('open');
}

async function confirmReceive() {
  if (!_currentPOReceive) return;
  const qty      = Number(document.getElementById('recv-qty').value);
  const date     = document.getElementById('recv-date').value;
  const invoice  = document.getElementById('recv-invoice').value;
  const supplier = document.getElementById('recv-supplier').value;
  const by       = document.getElementById('recv-by').value || 'Ajay';
  if (!qty || qty <= 0) { toast('Valid qty daalo', 'err'); return; }
  const btn = document.getElementById('recv-btn');
  btn.disabled = true; btn.textContent = 'Processing...';
  try {
    await api('receivePOItem', {
      poId:     _currentPOReceive.poId,
      itemName: _currentPOReceive.itemName,
      qty, date, invoice, supplier, by,
    });
    toast(`✓ ${_currentPOReceive.itemName} received — stock updated`, 'ok');
    closeM('receive-modal');
    _currentPOReceive = null;
    _stocks = [];
    loadIndents();
    loadDash();
  } catch(e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = 'Receive & Add to Stock'; }
}

async function cancelPOConfirm(poId) {
  if (!confirm(`PO "${poId}" cancel karna chahte ho? Saari pending items cancel ho jaayengi.`)) return;
  try {
    await api('cancelPO', { poId });
    toast('PO cancelled ✓', 'warn');
    _stocks = [];
    loadIndents();
    loadDash();
  } catch(e) { toast(e.message, 'err'); }
}

async function cancelPOItemConfirm(poId, itemName) {
  if (!confirm(`"${itemName}" is PO se cancel karna chahte ho?`)) return;
  try {
    await api('cancelPOItem', { poId, itemName });
    toast(`${itemName} cancelled ✓`, 'warn');
    _stocks = [];
    loadPOItems(poId);
    loadIndents();
  } catch(e) { toast(e.message, 'err'); }
}

async function printPOById(poId, supplier, expDate) {
  try {
    const items = await api('getPOItems', { poId });
    const poItems = items.map(i => ({ itemName: i.itemName, qty: i.orderedQty, unit: i.unit }));
    printPO(poItems, supplier, expDate, poId);
  } catch(e) { toast(e.message, 'err'); }
}

// ── CREATE PO FROM REORDER ──
async function saveCreatePO() {
  if (!_stocks.length) return;
  const reorderItems = _stocks.filter(s => s.status === 'Critical' || s.status === 'Reorder');
  const supplier = document.getElementById('po-supplier').value;
  const expDate  = document.getElementById('po-exp-date').value;

  const toCreate = [];
  reorderItems.forEach(s => {
    const key = s.name.replace(/\s/g,'_');
    const chk = document.getElementById('po-chk-'+key);
    const qty = Number((document.getElementById('po-qty-'+key)||{}).value) || 0;
    if (chk && chk.checked && qty > 0) {
      toCreate.push({ itemName: s.name, qty });
    }
  });

  const manualRows = document.getElementById('po-manual-rows');
  if (manualRows) {
    const n = manualRows.children.length;
    for (let i = 0; i < n; i++) {
      const itemEl = document.getElementById('po-manual-item-'+i);
      const qtyEl  = document.getElementById('po-manual-qty-'+i);
      if (!itemEl || !qtyEl) continue;
      const itemName = itemEl.value;
      const qty = Number(qtyEl.value) || 0;
      if (itemName && qty > 0) toCreate.push({ itemName, qty });
    }
  }

  if (!toCreate.length) { toast('Koi item select nahi hai', 'err'); return; }

  // Save nahi — pehle preview dikhao
  _pendingPOData = { supplier, expDate, items: toCreate };
  previewPOBeforeSave(toCreate, supplier, expDate);
}

function openIndentModal() {
  toast('Ab seedha Reorder page se PO create karo', 'warn');
}

// ── CREATE PO MODAL — openCreatePO (SELECT ALL TOGGLE ADDED) ──
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
            <th style="padding:8px 12px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;border-bottom:1.5px solid var(--border);background:var(--s2);text-align:center;">
              <div style="display:flex;flex-direction:column;align-items:center;gap:5px;">
                <span>Include</span>
                <button onclick="toggleAllPOCheckboxes()" id="po-toggle-all-btn"
                  style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:12px;border:1.5px solid var(--accent);color:var(--accent);background:transparent;cursor:pointer;white-space:nowrap;line-height:1.5;transition:all .15s;">
                  ☐ Uncheck All
                </button>
              </div>
            </th>
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

// ── SELECT ALL / UNCHECK ALL TOGGLE ──
function toggleAllPOCheckboxes() {
  const checkboxes = [...document.querySelectorAll('[id^="po-chk-"]')];
  if (!checkboxes.length) return;
  const allChecked = checkboxes.every(cb => cb.checked);
  checkboxes.forEach(cb => { cb.checked = !allChecked; });
  const btn = document.getElementById('po-toggle-all-btn');
  if (btn) btn.textContent = allChecked ? '☑ Select All' : '☐ Uncheck All';
}

// ── MANUAL PO ITEM ──
let _sbInOpen  = false;
let _sbOutOpen = false;
let _sbInData  = [];
let _manualPOItems = [];

function addManualPOItem() {
  const list = document.getElementById('po-items-list');
  const manualDiv = document.getElementById('po-manual-section');
  
  if (!manualDiv) {
    const div = document.createElement('div');
    div.id = 'po-manual-section';
    div.style.cssText = 'margin-top:14px;border-top:1px solid var(--border);padding-top:12px;';
    div.innerHTML = `
      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;margin-bottom:10px;">Manual Items</div>
      <div id="po-manual-rows"></div>
      <button class="btn bg bsm" style="margin-top:8px;" onclick="addManualPORow()">+ Add Another</button>
    `;
    list.appendChild(div);
    addManualPORow();
  } else {
    addManualPORow();
  }
}

function addManualPORow() {
  const container = document.getElementById('po-manual-rows');
  if (!container) return;
  const idx = container.children.length;
  const catOpts = _config.catOrder.map(c => `<option value="${c}">${c}</option>`).join('');
  const row = document.createElement('div');
  row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 80px 36px;gap:8px;margin-bottom:8px;align-items:center;';
  row.innerHTML = `
    <select class="inp" id="po-manual-cat-${idx}" style="font-size:12px;" onchange="filterManualPOItems(${idx})">
      <option value="">-- Category --</option>
      ${catOpts}
    </select>
    <select class="inp" id="po-manual-item-${idx}" style="font-size:12px;">
      <option value="">-- Select Category first --</option>
    </select>
    <input type="number" class="inp" id="po-manual-qty-${idx}" placeholder="Qty" min="1" style="font-size:12px;text-align:center;">
    <button class="btn brd bsm" onclick="this.parentElement.remove()" style="padding:5px 8px;">✕</button>
  `;
  container.appendChild(row);
}

function filterManualPOItems(idx) {
  const cat = document.getElementById('po-manual-cat-'+idx).value;
  const sel = document.getElementById('po-manual-item-'+idx);
  sel.innerHTML = '<option value="">-- Select Item --</option>';
  if (!cat) return;
  const src = _stocks.length ? _stocks : _items;
  src.filter(s => s.cat === cat).forEach(s => {
    const o = document.createElement('option');
    o.value = s.name; o.textContent = s.name;
    sel.appendChild(o);
  });
}

// ── ADC CALCULATE ──
function initADC() {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 6);
  const fmt = d => d.toISOString().split('T')[0];
  const fromEl = document.getElementById('adc-from');
  const toEl   = document.getElementById('adc-to');
  if (fromEl && !fromEl.value) fromEl.value = fmt(weekAgo);
  if (toEl   && !toEl.value)   toEl.value   = fmt(today);

  const catEl = document.getElementById('adc-cat');
  if (catEl && catEl.options.length <= 1 && _config.categories) {
    _config.categories.forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c;
      catEl.appendChild(o);
    });
  }
}

function downloadADCPdf() {
  const from = document.getElementById('adc-from').value;
  const to   = document.getElementById('adc-to').value;
  const cat  = document.getElementById('adc-cat').value;
  const rows = document.getElementById('adc-tb').innerHTML;

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head>
    <title>ADC Report — ${from} to ${to}</title>
    <style>
      body { font-family: 'Segoe UI', sans-serif; padding: 24px; color: #1a1a2e; }
      h2 { font-size: 18px; margin-bottom: 4px; }
      p  { font-size: 12px; color: #666; margin-bottom: 16px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      thead th { background: #0d1f3c; color: #fff; padding: 8px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
      thead th:last-child { background: #b45309; }
      tbody td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; }
      tbody tr:nth-child(even) { background: #f9fafb; }
      .footer { margin-top: 20px; font-size: 10px; color: #999; text-align: right; }
    </style>
  </head><body>
    <h2>ADC Report — Average Daily Consumption</h2>
    <p>Period: <b>${from}</b> to <b>${to}</b>${cat ? ' &nbsp;|&nbsp; Category: <b>'+cat+'</b>' : ''} &nbsp;|&nbsp; Generated: <b>${new Date().toLocaleDateString('en-IN')}</b></p>
    <table>
      <thead><tr>
        <th>Item</th><th>Category</th><th>Unit</th>
        <th>Total Inward</th><th>Total Outward</th><th>Days</th><th>ADC (/day)</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="footer">Litpax Technology Pvt. Ltd. — IMS Report</div>
  </body></html>`);
  win.document.close();
  setTimeout(() => { win.print(); }, 400);
}

async function loadADC() {
  const fromVal = document.getElementById('adc-from').value;
  const toVal   = document.getElementById('adc-to').value;
  const catVal  = document.getElementById('adc-cat').value;
  if (!fromVal || !toVal) { toast('Date range select karo', 'err'); return; }

  const tb = document.getElementById('adc-tb');
  const em = document.getElementById('adc-empty');
  tb.innerHTML = `<tr class="lrow"><td colspan="7"><span class="loader"></span></td></tr>`;
  em.style.display = 'none';

  try {
    const [inRows, outRows] = await Promise.all([
      api('getInward', {}),
      api('getOutward', {}),
    ]);

    const from = new Date(fromVal); from.setHours(0,0,0,0);
    const to   = new Date(toVal);   to.setHours(23,59,59,999);
    const days = Math.max(1, Math.round((to - from) / (1000*60*60*24)) + 1);

    const inFiltered  = inRows.filter(r => { const d = new Date(r.date); return d >= from && d <= to; });
    const outFiltered = outRows.filter(r => { const d = new Date(r.date); return d >= from && d <= to; });

    const map = {};
    const addItem = (name, unit, cat) => {
      if (!map[name]) map[name] = { name, unit, cat: cat||'', inQty: 0, outQty: 0 };
    };
    inFiltered.forEach(r => { addItem(r.itemName, r.unit, r.cat); map[r.itemName].inQty += r.qty||0; });
    outFiltered.forEach(r => { addItem(r.itemName, r.unit, r.cat); map[r.itemName].outQty += r.qty||0; });

    if (_stocks.length) {
      _stocks.forEach(s => { if (map[s.name]) map[s.name].cat = s.cat||map[s.name].cat; });
    } else {
      const st = await api('getStockSummary');
      st.forEach(s => { if (map[s.name]) map[s.name].cat = s.cat||map[s.name].cat; });
    }

    let rows = Object.values(map).sort((a,b) => b.outQty - a.outQty);
    if (catVal) rows = rows.filter(r => r.cat === catVal);

    if (!rows.length) { tb.innerHTML = ''; em.style.display = 'block'; return; }

    const pdfBtn = document.getElementById('adc-pdf-btn');
    if (pdfBtn) pdfBtn.style.display = '';

    tb.innerHTML = rows.map(r => {
      const adc = r.outQty > 0 ? (r.outQty / days).toFixed(2) : '0.00';
      const adcColor = Number(adc) > 0 ? 'var(--orange)' : 'var(--muted)';
      return `<tr>
        <td style="font-weight:600;color:var(--navy);">${r.name}</td>
        <td>${catBadge(r.cat)}</td>
        <td style="color:var(--muted);font-size:12px;">${r.unit||'—'}</td>
        <td style="font-family:var(--mono);color:var(--green);font-weight:600;">${r.inQty}</td>
        <td style="font-family:var(--mono);color:var(--red);font-weight:600;">${r.outQty}</td>
        <td style="font-family:var(--mono);color:var(--muted);">${days}</td>
        <td style="background:#fffbeb;">
          <span style="font-family:var(--mono);font-weight:800;font-size:15px;color:${adcColor};">${adc}</span>
          <span style="font-size:10px;color:var(--muted);margin-left:3px;">/day</span>
        </td>
      </tr>`;
    }).join('');
  } catch(e) { toast(e.message, 'err'); }
}

let _sbOutData = [];

async function loadSbActivity() {
  if (_currentRole !== 'admin') return;
  try {
    const [inRows, outRows] = await Promise.all([
      api('getInward', { date: today() }),
      api('getOutward', { date: today() }),
    ]);
    const inMap = {};
    inRows.forEach(r => {
      if (!inMap[r.itemName]) inMap[r.itemName] = { qty: 0, unit: r.unit };
      inMap[r.itemName].qty += r.qty;
    });
    _sbInData = Object.entries(inMap).sort((a,b) => a[0].localeCompare(b[0]));

    const outMap = {};
    outRows.filter(r => !(r.remarks||'').startsWith('Dispatch:')).forEach(r => {
      if (!outMap[r.itemName]) outMap[r.itemName] = { qty: 0, unit: r.unit };
      outMap[r.itemName].qty += r.qty;
    });
    _sbOutData = Object.entries(outMap).sort((a,b) => a[0].localeCompare(b[0]));

    const inC = document.getElementById('sb-in-count');
    if (inC) inC.textContent = _sbInData.length ? _sbInData.length + ' items' : '';
    const outC = document.getElementById('sb-out-count');
    if (outC) outC.textContent = _sbOutData.length ? _sbOutData.length + ' items' : '';

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

let _pendingPOData = null;

function previewPOBeforeSave(items, supplier, expDate) {
  const catOrder = _config.catOrder || [];
  const sorted = [...items].sort((a, b) => {
    const sa = _stocks.find(s => s.name === a.itemName);
    const sb = _stocks.find(s => s.name === b.itemName);
    const ca = sa ? sa.cat : 'Other';
    const cb = sb ? sb.cat : 'Other';
    const ia = catOrder.indexOf(ca);
    const ib = catOrder.indexOf(cb);
    if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.itemName.localeCompare(b.itemName);
  });

  const grouped = {};
  sorted.forEach(item => {
    const s = _stocks.find(x => x.name === item.itemName);
    const cat = s ? s.cat : 'Other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({ ...item, unit: s ? s.unit : 'Pcs' });
  });

  const catIcons = {
    'Cells':'🔋','BMS':'⚡','Charger':'🔌','Nickel/Busbar':'🪙',
    'Box':'📦','Wire':'🔩','Consumables':'🧰','Tools':'🔧','Packaging':'📦'
  };

  const dateStr = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });

  let itemsHTML = '';
  catOrder.forEach(cat => {
    if (!grouped[cat]) return;
    itemsHTML += `
      <tr class="cat-row"><td colspan="4">${catIcons[cat]||'📦'} ${cat}</td></tr>
      ${grouped[cat].map((item, i) => `
        <tr>
          <td class="sl">${i+1}</td>
          <td class="iname">${item.itemName}</td>
          <td class="center">${item.unit}</td>
          <td class="center qty">${item.qty}</td>
        </tr>
      `).join('')}
    `;
  });

  const apiUrl  = API;
  const itemsJson    = JSON.stringify(items);
  const supplierJson = JSON.stringify(supplier);
  const expDateJson  = JSON.stringify(expDate);

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>PO Preview — Approval Pending</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; padding: 32px; font-size: 13px; }
    .topbar { background: #0d1f3c; color: #fff; padding: 12px 24px; margin: -32px -32px 24px; display: flex; justify-content: space-between; align-items: center; }
    .topbar-title { font-weight: 700; font-size: 14px; }
    .topbar-note  { font-size: 11px; opacity: .7; }
    .btn-row { display: flex; gap: 10px; }
    .btn-confirm { background: #1D9E75; color: #fff; border: none; padding: 10px 24px; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 13px; }
    .btn-cancel  { background: #dc2626; color: #fff; border: none; padding: 10px 24px; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 13px; }
    .btn-print   { background: transparent; color: #fff; border: 1.5px solid rgba(255,255,255,.4); padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 12px; }
    .warning-banner { background: #fff7ed; border: 1.5px solid #fed7aa; border-radius: 8px; padding: 12px 18px; margin-bottom: 20px; font-size: 13px; color: #92400e; font-weight: 600; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #0d1f3c; }
    .company-name { font-size: 22px; font-weight: 800; color: #0d1f3c; }
    .company-sub  { font-size: 11px; color: #6b7280; margin-top: 3px; }
    .po-title h2  { font-size: 20px; font-weight: 800; color: #0d1f3c; text-align: right; }
    .draft-badge  { font-size: 12px; color: #dc2626; font-weight: 700; text-align: right; margin-top: 4px; border: 1.5px solid #dc2626; padding: 2px 10px; border-radius: 20px; display: inline-block; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; margin-bottom: 22px; }
    .meta-box { background: #f8faff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; }
    .meta-label { font-size: 9px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: .7px; margin-bottom: 4px; }
    .meta-value { font-size: 13px; font-weight: 600; color: #0d1f3c; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead th { background: #0d1f3c; color: #fff; padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; }
    thead th.center { text-align: center; }
    .cat-row td { background: #f0f4ff; color: #2558e8; font-weight: 700; font-size: 12px; padding: 8px 14px; border-bottom: 1px solid #e5e7eb; }
    tbody tr td { padding: 9px 14px; border-bottom: 1px solid #f0f2f5; }
    .sl { color: #9ca3af; font-size: 11px; width: 36px; }
    .iname { font-weight: 500; }
    .center { text-align: center; }
    .qty { font-weight: 700; color: #0d1f3c; font-size: 14px; }
    .total-row { font-size: 13px; color: #6b7280; text-align: right; margin-top: -16px; margin-bottom: 20px; }
    @media print { .topbar { display: none; } .warning-banner { display: none; } body { padding: 16px; } }
  </style>
</head>
<body>
  <div class="topbar">
    <div>
      <div class="topbar-title">⚠ DRAFT — Owner Approval Pending</div>
      <div class="topbar-note">Approve karo tab PO save hoga</div>
    </div>
    <div class="btn-row">
      <button class="btn-print" onclick="window.print()">🖨 Print Draft</button>
      <button class="btn-cancel" onclick="window.close()">✕ Cancel</button>
      <button class="btn-confirm" onclick="confirmAndSavePO()">✓ Approve & Save PO</button>
    </div>
  </div>

  <div class="warning-banner">
    ⚠ Yeh sirf PREVIEW hai — PO abhi save nahi hua. "Approve & Save PO" click karne par PO confirm hoga.
  </div>

  <div class="header">
    <div>
      <div class="company-name">Litpax Technology Pvt. Ltd.</div>
      <div class="company-sub">Lithium Battery Manufacturer</div>
    </div>
    <div class="po-title">
      <h2>PURCHASE ORDER</h2>
      <div class="draft-badge">🕐 DRAFT — Approval Pending</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-box"><div class="meta-label">PO Date</div><div class="meta-value">${dateStr}</div></div>
    <div class="meta-box"><div class="meta-label">Supplier</div><div class="meta-value">${supplier || '—'}</div></div>
    <div class="meta-box"><div class="meta-label">Expected Delivery</div><div class="meta-value">${expDate ? new Date(expDate+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—'}</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:36px;">#</th>
        <th>Item Name</th>
        <th class="center" style="width:80px;">Unit</th>
        <th class="center" style="width:80px;">Qty</th>
      </tr>
    </thead>
    <tbody>${itemsHTML}</tbody>
  </table>
  <div class="total-row">Total Items: <b style="color:#0d1f3c;">${items.length}</b></div>

  <script>
    async function confirmAndSavePO() {
      const btn = document.querySelector('.btn-confirm');
      btn.disabled = true;
      btn.textContent = '⏳ Saving...';
      try {
        const resp = await fetch('${apiUrl}', {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            action: 'createPO',
            supplier: ${supplierJson},
            expectedDate: ${expDateJson},
            items: ${itemsJson},
            remarks: 'Auto PO from Reorder',
          }),
        });
        const text = await resp.text();
        const data = JSON.parse(text);
        if (data.error) throw new Error(data.error);
        document.querySelector('.warning-banner').style.background = '#f0fdf4';
        document.querySelector('.warning-banner').style.borderColor = '#86efac';
        document.querySelector('.warning-banner').style.color = '#166534';
        document.querySelector('.warning-banner').innerHTML = '✅ PO Saved! PO ID: <b>' + data.poId + '</b> (' + data.itemCount + ' items)';
        document.querySelector('.draft-badge').textContent = '✓ CONFIRMED — ' + data.poId;
        document.querySelector('.draft-badge').style.color = '#166534';
        document.querySelector('.draft-badge').style.borderColor = '#166534';
        btn.textContent = '✓ Saved!';
        setTimeout(() => window.print(), 600);
      } catch(e) {
        btn.disabled = false;
        btn.textContent = '✓ Approve & Save PO';
        alert('Error: ' + e.message);
      }
    }
  <\/script>
</body>
</html>`);
  win.document.close();
}

// ── PO PRINT ──
function printPO(items, supplier, expDate, poId) {
  const catOrder = _config.catOrder || [];
  const sorted = [...items].sort((a, b) => {
    const sa = _stocks.find(s => s.name === a.itemName);
    const sb = _stocks.find(s => s.name === b.itemName);
    const ca = sa ? sa.cat : 'Other';
    const cb = sb ? sb.cat : 'Other';
    const ia = catOrder.indexOf(ca);
    const ib = catOrder.indexOf(cb);
    if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.itemName.localeCompare(b.itemName);
  });

  const grouped = {};
  sorted.forEach(item => {
    const s = _stocks.find(x => x.name === item.itemName);
    const cat = s ? s.cat : 'Other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({ ...item, unit: s ? s.unit : 'Pcs' });
  });

  const catIcons = {
    'Cells':'🔋','BMS':'⚡','Charger':'🔌','Nickel/Busbar':'🪙',
    'Box':'📦','Wire':'🔩','Consumables':'🧰','Tools':'🔧','Packaging':'📦'
  };

  const poNumber = poId || ('PO-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + Math.floor(Math.random()*900+100));
  const dateStr  = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });

  let itemsHTML = '';
  catOrder.forEach(cat => {
    if (!grouped[cat]) return;
    const rows = grouped[cat];
    itemsHTML += `
      <tr class="cat-row">
        <td colspan="4">${catIcons[cat]||'📦'} ${cat}</td>
      </tr>
      ${rows.map((item, i) => `
        <tr>
          <td class="sl">${i+1}</td>
          <td class="iname">${item.itemName}</td>
          <td class="center">${item.unit}</td>
          <td class="center qty">${item.qty}</td>
        </tr>
      `).join('')}
    `;
  });

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Purchase Order — ${poNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; padding: 32px; font-size: 13px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #0d1f3c; }
    .company-name { font-size: 22px; font-weight: 800; color: #0d1f3c; }
    .company-sub { font-size: 11px; color: #6b7280; margin-top: 3px; }
    .po-title { text-align: right; }
    .po-title h2 { font-size: 20px; font-weight: 800; color: #0d1f3c; }
    .po-number { font-size: 13px; color: #2558e8; font-weight: 600; margin-top: 4px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; margin-bottom: 22px; }
    .meta-box { background: #f8faff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; }
    .meta-label { font-size: 9px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: .7px; margin-bottom: 4px; }
    .meta-value { font-size: 13px; font-weight: 600; color: #0d1f3c; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead th { background: #0d1f3c; color: #fff; padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; }
    thead th.center { text-align: center; }
    .cat-row td { background: #f0f4ff; color: #2558e8; font-weight: 700; font-size: 12px; padding: 8px 14px; border-bottom: 1px solid #e5e7eb; }
    tbody tr td { padding: 9px 14px; border-bottom: 1px solid #f0f2f5; }
    tbody tr:hover td { background: #fafbff; }
    .sl { color: #9ca3af; font-size: 11px; width: 36px; }
    .iname { font-weight: 500; }
    .center { text-align: center; }
    .qty { font-weight: 700; color: #0d1f3c; font-size: 14px; }
    .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; }
    .sign-box { text-align: center; }
    .sign-line { width: 160px; border-top: 1.5px solid #374151; margin: 40px auto 6px; }
    .sign-label { font-size: 11px; color: #6b7280; font-weight: 600; }
    .footer-note { font-size: 10px; color: #9ca3af; text-align: center; margin-top: 8px; }
    @media print { body { padding: 16px; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="no-print" style="background:#0d1f3c;color:#fff;padding:10px 20px;margin:-32px -32px 24px;display:flex;justify-content:space-between;align-items:center;">
    <span style="font-weight:700;">Purchase Order Preview</span>
    <button onclick="window.print()" style="background:#1D9E75;color:#fff;border:none;padding:8px 20px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px;">🖨 Print / Save PDF</button>
  </div>
  <div class="header">
    <div>
      <div class="company-name">Litpax Technology Pvt. Ltd.</div>
      <div class="company-sub">Lithium Battery Manufacturer</div>
    </div>
    <div class="po-title">
      <h2>PURCHASE ORDER</h2>
      <div class="po-number">${poNumber}</div>
    </div>
  </div>
  <div class="meta-grid">
    <div class="meta-box"><div class="meta-label">PO Date</div><div class="meta-value">${dateStr}</div></div>
    <div class="meta-box"><div class="meta-label">Supplier</div><div class="meta-value">${supplier || '—'}</div></div>
    <div class="meta-box"><div class="meta-label">Expected Delivery</div><div class="meta-value">${expDate ? new Date(expDate+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—'}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:36px;">#</th>
        <th>Item Name</th>
        <th class="center" style="width:80px;">Unit</th>
        <th class="center" style="width:80px;">Qty</th>
      </tr>
    </thead>
    <tbody>${itemsHTML}</tbody>
  </table>
  <div class="footer">
    <div class="sign-box"><div class="sign-line"></div><div class="sign-label">Prepared By</div></div>
    <div class="sign-box"><div class="sign-line"></div><div class="sign-label">Authorized By</div></div>
    <div class="sign-box"><div class="sign-line"></div><div class="sign-label">Supplier Acknowledgement</div></div>
  </div>
  <div class="footer-note">This is a computer generated Purchase Order — Litpax Technology Pvt. Ltd.</div>
</body>
</html>`);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

function openAddPOItemModal(poId) {
  document.getElementById('add-poi-id').value = poId;
  document.getElementById('add-poi-cat').value = '';
  document.getElementById('add-poi-item').innerHTML = '<option value="">-- Select Category first --</option>';
  document.getElementById('add-poi-qty').value = '';
  document.getElementById('add-po-item-modal').classList.add('open');
}

function filterAddPOItems() {
  const cat = document.getElementById('add-poi-cat').value;
  const sel = document.getElementById('add-poi-item');
  sel.innerHTML = '<option value="">-- Select Item --</option>';
  if (!cat) return;
  const src = _stocks.length ? _stocks : _items;
  src.filter(s => s.cat === cat).forEach(s => {
    const o = document.createElement('option');
    o.value = s.name; o.textContent = s.name;
    sel.appendChild(o);
  });
}

async function saveAddPOItem() {
  const poId     = document.getElementById('add-poi-id').value;
  const itemName = document.getElementById('add-poi-item').value;
  const qty      = Number(document.getElementById('add-poi-qty').value);
  if (!itemName) { toast('Item select karo', 'err'); return; }
  if (!qty || qty <= 0) { toast('Valid qty daalo', 'err'); return; }
  const btn = document.getElementById('add-poi-btn');
  btn.disabled = true; btn.textContent = 'Adding...';
  try {
    await api('addPOItem', { poId, itemName, qty });
    toast('Item added ✓', 'ok');
    closeM('add-po-item-modal');
    loadPOItems(poId);
    loadIndents();
  } catch(e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = 'Add Item'; }
}

function printSinglePO(id, itemName, qty, supplier, expDate) {
  const s = _stocks.find(x => x.name === itemName);
  const items = [{ itemName, qty, unit: s ? s.unit : 'Pcs' }];
  printPO(items, supplier, expDate);
}

// ── MATERIAL REQUESTS ──
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
          <button class="btn bgn bsm" onclick="fulfillRequest('${r.id}','${r.itemName.replace(/'/g,"\\'")}',${r.qty},'${r.department||''}','${(r.requestedBy||'').replace(/'/g,"\\'")}')">✓ Issue</button>
          <button class="btn brd bsm" onclick="cancelRequest('${r.id}')">✕</button>
        ` : `<span style="font-size:11px;color:var(--muted);">${r.closedBy||'—'}</span>`}
      </td>
    </tr>`;
  }).join('');
}

function fulfillRequest(reqId, itemName, qty, department, requestedBy) {
  window._pendingReqId = reqId;
  document.getElementById('outward-modal').classList.add('open');
  showPage('outward');

  const item = (_stocks && _stocks.find(s => s.name === itemName))
             || (_items  && _items.find(i => i.name === itemName));
  const cat = item ? item.cat : '';

  const catSel  = document.getElementById('out-cat');
  const itemSel = document.getElementById('out-item');

  if (catSel && cat) catSel.value = cat;

  filterOutwardItems();
  setTimeout(() => {
    populateItemSelect('out-item');
    setTimeout(() => {
      if (itemSel) itemSel.value = itemName;
      document.getElementById('out-qty').value   = qty;
      document.getElementById('out-date').value  = today();
      document.getElementById('out-dept').value  = department || '';
      document.getElementById('out-by').value       = 'Ajay';
      document.getElementById('out-issuedto').value  = requestedBy || '';
      document.getElementById('out-remarks').value   = 'Req: ' + reqId;
      updOutwardInfo();
    }, 150);
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
                <button class="btn bgn bsm" onclick="fulfillRequest('${r.id}','${r.itemName.replace(/'/g,"\\'")}',${r.qty},'${r.department||''}','${(r.requestedBy||'').replace(/'/g,"\\'")}')">✓ Issue</button>
              </div>
            </div>`).join('')
          : `<div class="empty" style="padding:20px;"><div class="ei">✅</div><div class="et">No pending requests</div></div>`;
      } catch(e) {}
    }

    setDot('ok', 'Connected');
  } catch(e) { toast(e.message, 'err'); setDot('err', 'Error'); }
}

// ── RECEIVED FROM STORE (Sandeep) ──
async function loadReceived() {
  const dateEl = document.getElementById('recv-date');
  const catEl  = document.getElementById('recv-cat');
  if (!dateEl.value) dateEl.value = today();
  const date    = dateEl.value;
  const catFilter = catEl ? catEl.value : '';
  const wrap = document.getElementById('recv-content');
  wrap.innerHTML = `<div class="empty"><div class="ei">⏳</div><div class="et">Loading...</div></div>`;

  try {
    if (!_stocks.length) _stocks = await api('getStockSummary');
    const rows = await api('getOutward', { date });
    let received = rows.filter(r => !String(r.remarks||'').startsWith('Dispatch:') && !String(r.remarks||'').startsWith('Direct Dispatch:'));

    if (catFilter) {
      received = received.filter(r => {
        const stock = _stocks.find(s => s.name === r.itemName);
        return stock ? stock.cat === catFilter : false;
      });
    }

    if (!received.length) {
      wrap.innerHTML = `<div class="empty"><div class="ei">📭</div><div class="et">Is date koi material nahi aaya</div></div>`;
      return;
    }

    const catMap = {};
    received.forEach(r => {
      const stock = _stocks.find(s => s.name === r.itemName);
      const cat = stock ? stock.cat : 'Other';
      if (!catMap[cat]) catMap[cat] = [];
      catMap[cat].push(r);
    });

    const cats = Object.keys(catMap).sort();

    let html = `
      <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
        <div class="card" style="flex:1;min-width:140px;padding:14px 18px;">
          <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;">Total Items</div>
          <div style="font-size:28px;font-weight:700;color:var(--navy);font-family:var(--mono);margin-top:4px;">${received.length}</div>
        </div>
        <div class="card" style="flex:1;min-width:140px;padding:14px 18px;">
          <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;">Categories</div>
          <div style="font-size:28px;font-weight:700;color:var(--accent);font-family:var(--mono);margin-top:4px;">${cats.length}</div>
        </div>
      </div>`;

    cats.forEach(cat => {
      const items = catMap[cat];
      const catTotal = items.reduce((s, r) => s + r.qty, 0);
      const icon = getCatIcon(cat);

      html += `<div class="card" style="margin-bottom:12px;">
        <div style="padding:12px 16px;background:#f8faff;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:16px;">${icon}</span>
            <span style="font-weight:700;color:var(--navy);font-size:14px;">${cat}</span>
            <span style="font-size:11px;color:var(--muted);">${items.length} items</span>
          </div>
          <span style="font-family:var(--mono);font-weight:700;color:var(--accent);">${catTotal} total</span>
        </div>
        <div class="tw"><table>
          <thead><tr>
            <th>Item</th><th>Qty</th><th>Unit</th><th>Issued By</th><th>Time</th><th>Remarks</th>
          </tr></thead>
          <tbody>
            ${items.map(r => `<tr>
              <td style="font-weight:600;color:var(--navy);">${r.itemName}</td>
              <td style="font-family:var(--mono);font-weight:700;color:var(--orange);">${r.qty}</td>
              <td style="color:var(--muted);">${r.unit||'—'}</td>
              <td>${r.by||'—'}</td>
              <td style="color:var(--muted);font-size:11px;">${r.ts ? new Date(r.ts).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '—'}</td>
              <td style="font-size:11px;color:var(--muted);">${r.remarks||'—'}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>
      </div>`;
    });

    wrap.innerHTML = html;
  } catch(e) {
    toast(e.message, 'err');
    wrap.innerHTML = `<div class="empty"><div class="ei">❌</div><div class="et">${e.message}</div></div>`;
  }
}

let _wipData = [];

async function loadWip() {
  const tb = document.getElementById('wip-tb');
  const em = document.getElementById('wip-empty');
  if (tb) tb.innerHTML = `<tr class="lrow"><td colspan="6"><span class="loader"></span></td></tr>`;
  try {
    const d = await api('getDashboard');
    const stocks = d.stocks || [];
    _wipData = stocks
      .filter(s => (s.totalOut || 0) > 0)
      .map(s => ({
        name: s.name, cat: s.cat, unit: s.unit,
        totalOut: s.totalOut || 0,
        dispUsed: s.dispUsed || 0,
        wip: s.wip || 0,
      }))
      .sort((a,b) => b.wip - a.wip);

    const catF = document.getElementById('wip-cat-f');
    if (catF) {
      const cats = [...new Set(_wipData.map(s => s.cat).filter(Boolean))].sort();
      const curVal = catF.value;
      catF.innerHTML = '<option value="">All Categories</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
      if (curVal) catF.value = curVal;
    }

    filterWip();
  } catch(e) { toast(e.message, 'err'); }
}

function filterWip() {
  const tb = document.getElementById('wip-tb');
  const em = document.getElementById('wip-empty');
  const catF = document.getElementById('wip-cat-f');
  const cf = catF ? catF.value : '';
  const fl = _wipData.filter(s => !cf || s.cat === cf);
  if (!fl.length) { if (tb) tb.innerHTML = ''; if (em) em.style.display = 'block'; return; }
  if (em) em.style.display = 'none';
  if (tb) tb.innerHTML = fl.map(s => `<tr>
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

    const wipEl  = document.getElementById('sd-wip-section');
    const wipSummEl = document.getElementById('sd-wip-summary');

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

// ── ADMIN DASHBOARD CHARTS ──
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
        { label: 'Current Stock', data: current, backgroundColor: items.map(s => s.status === 'Critical' ? 'rgba(220,38,38,.85)' : 'rgba(234,88,12,.85)'), borderRadius: 5, borderSkipped: false },
        { label: 'Reorder Point', data: rop, backgroundColor: 'rgba(37,88,232,.18)', borderColor: 'rgba(37,88,232,.6)', borderWidth: 1.5, borderRadius: 5, borderSkipped: false },
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
    data: { labels, datasets: [{ label: 'WIP Qty', data, backgroundColor: 'rgba(124,58,237,.8)', borderRadius: 5, borderSkipped: false }] },
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
  const colors = ['rgba(37,88,232,.85)','rgba(16,163,74,.85)','rgba(234,88,12,.85)','rgba(124,58,237,.85)','rgba(220,38,38,.85)','rgba(8,145,178,.85)','rgba(217,119,6,.85)','rgba(107,114,128,.85)'];
  if (_categoryChartInst) _categoryChartInst.destroy();
  _categoryChartInst = new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors.slice(0, labels.length), borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11, family: 'DM Sans' }, boxWidth: 12, padding: 10 } },
        tooltip: { callbacks: { label: (i) => ` ${i.label}: ${i.raw} items` } }
      }
    }
  });
}
