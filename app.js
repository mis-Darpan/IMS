// ============================================================
// LITPAX IMS — app.js v3.1
// API URL: change here if redeployed
// ============================================================

const API = 'https://script.google.com/macros/s/AKfycbwgE4ZMYVa0ceNk2PJMJrSC0askLM06-qaOuEIZZgjhXYGW2z6lqqOJtNI1H3QrunMR/exec';

const DEPTS = ['Volt Wing','Ampere Wing','Volt x Ampere Wing','Mega Grid','Cathodic Wing','Future Cell','Phoenix Wing','Other'];

// ── ROLES & PINS ──
const ROLES = {
  admin:   { pin: '1234', name: 'Admin',   pages: ['dashboard','inward','outward','dispatch','requests','items','opening','bom','indent','stock','reorder','closing'] },
  ajay:    { pin: '0001', name: 'Ajay',    pages: ['dashboard','inward','outward','requests','stock','reorder'] },
  sandeep: { pin: '0002', name: 'Sandeep', pages: ['dashboard','dispatch','stock'] },
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
  loadDash();
}

function applyRoleUI() {
  const role = ROLES[_currentRole];
  if (!role) return;

  // Show/hide nav items
  document.querySelectorAll('.ni[data-page]').forEach(ni => {
    const page = ni.getAttribute('data-page');
    ni.style.display = role.pages.includes(page) ? 'flex' : 'none';
  });

  // Show/hide nav groups if all items hidden
  document.querySelectorAll('.ng').forEach(ng => {
    const items = ng.querySelectorAll('.ni[data-page]');
    const hasVisible = Array.from(items).some(i => i.style.display !== 'none');
    const label = ng.querySelector('.ng-label');
    if (label) label.style.display = hasVisible ? '' : 'none';
  });

  // Update greeting with role name
  const greetEl = document.getElementById('dash-greeting');
  if (greetEl) {
    const now = new Date();
    const hr = now.getHours();
    const g = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    greetEl.textContent = `${g}, ${role.name} 👋`;
  }

  // Show logout btn
  const lb = document.getElementById('logout-btn');
  if (lb) lb.style.display = 'flex';
}

function logout() {
  localStorage.removeItem('lpx_role');
  localStorage.removeItem('lpx_name');
  _currentRole = null; _selectedRole = null;
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('login-pin').value = '';
  document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
}

// ── STATE ──
let _items   = [];
let _stocks  = [];
let _boms    = [];
let _bomRows = []; // current bom being edited
let _editItemName = null;
let _editBomName  = null;
let _clRows  = [];
let _clDate  = '';

// ── UTILS ──
function today() {
  return new Date().toISOString().slice(0, 10);
}
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
  document.getElementById('cl-date').value = today();
  document.getElementById('in-date').value = today();
  document.getElementById('out-date').value = today();
  document.getElementById('dis-date').value = today();
  document.getElementById('in-date-f').value = today();
  document.getElementById('out-date-f').value = today();
  setDot('loading', 'Connecting...');

  // Check saved role
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
  d.className = 'dot ' + state;
  if (l) l.textContent = label;
}

// ── NAV ──
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.querySelectorAll('.ni').forEach(n => {
    if (n.getAttribute('onclick') === `showPage('${id}')`) n.classList.add('active');
  });
  if (id === 'dashboard') loadDash();
  if (id === 'inward')    loadInward();
  if (id === 'outward')   loadOutward();
  if (id === 'dispatch')  loadDispatch();
  if (id === 'items')     loadItems();
  if (id === 'bom')       loadBom();
  if (id === 'stock')     loadStock();
  if (id === 'reorder')   loadReorder();
  if (id === 'closing')   { document.getElementById('cl-date').value = today(); genClosing(); }
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

// ── DASHBOARD ──
async function loadDash() {
  const now = new Date();
  const hr = now.getHours();
  const greeting = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  const greetEl = document.getElementById('dash-greeting');
  if (greetEl) {
    const rname = _currentRole ? ROLES[_currentRole].name : 'Sahil / Sneha';
    greetEl.textContent = `${greeting}, ${rname} 👋`;
  }
  document.getElementById('dash-date').textContent = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  // Role based dashboard
  if (_currentRole === 'ajay') { await loadAjayDash(); return; }
  if (_currentRole === 'sandeep') { await loadSandeepDash(); return; }
  try {
    const d = await api('getDashboard');
    _stocks = d.stocks || [];
    document.getElementById('s-total').textContent = d.totalItems || 0;
    document.getElementById('s-ro').textContent    = d.reorderCount || 0;
    document.getElementById('s-in').textContent    = d.todayIn || 0;
    document.getElementById('s-out').textContent   = d.todayOut || 0;
    document.getElementById('s-wip').textContent   = (d.wipItems||[]).length || 0;

    // Alert badge on dashboard
    const dab = document.getElementById('d-alert-badge');
    if (dab) {
      if (d.reorderCount > 0) { dab.style.display='inline'; dab.textContent=d.reorderCount; }
      else dab.style.display='none';
    }

    const nb = document.getElementById('nb');
    if (d.reorderCount > 0) { nb.style.display = 'inline'; nb.textContent = d.reorderCount; }
    else nb.style.display = 'none';

    // Pending indents badge
    const nbi = document.getElementById('nb-indent');
    if (nbi) {
      if (d.pendingIndents > 0) { nbi.style.display = 'inline'; nbi.textContent = d.pendingIndents; }
      else nbi.style.display = 'none';
    }
    // Pending requests badge
    const nbr = document.getElementById('nb-req');
    if (nbr) {
      if (d.pendingRequests > 0) { nbr.style.display = 'inline'; nbr.textContent = d.pendingRequests; }
      else nbr.style.display = 'none';
    }

    // Alerts
    const al = document.getElementById('d-alerts');
    if (!d.alerts || !d.alerts.length) {
      al.innerHTML = `<div class="empty"><div class="ei">✅</div><div class="et">All stocks healthy!</div></div>`;
    } else {
      al.innerHTML = d.alerts.map(s => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border);">
          <div>
            <div style="font-weight:600;font-size:13px;">${s.name}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px;">ROP: <b>${s.reorderPoint}</b> | Stock: <b>${s.currentStock}</b> | MIT: <b>${s.mit || 0}</b></div>
          </div>
          ${stBadge(s.status)}
        </div>`).join('');
    }

    // Recent txns
    const rt = document.getElementById('d-recent');
    if (!d.recentTxns || !d.recentTxns.length) {
      rt.innerHTML = `<div class="empty"><div class="ei">📭</div><div class="et">No transactions today</div></div>`;
    } else {
      rt.innerHTML = d.recentTxns.map(t => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 16px;border-bottom:1px solid var(--border);">
          <div>
            <div style="font-weight:500;font-size:13px;">${t.itemName || t.bomModel || '—'}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:1px;">${fmtDT(t.ts)}</div>
          </div>
          <span class="badge ${t.txnType === 'IN' ? 'b-in' : 'b-out'}">${t.txnType === 'IN' ? '↑ IN' : '↓ OUT'} ${t.qty || t.qtyProduced || ''}</span>
        </div>`).join('');
    }

    // Store Live Stock
    const storeWrap = document.getElementById('d-store');
    if (storeWrap) {
      if (!d.stocks || !d.stocks.length) {
        storeWrap.innerHTML = `<div class="empty"><div class="ei">📦</div><div class="et">No items</div></div>`;
      } else {
        storeWrap.innerHTML = `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="text-align:left;padding:8px 14px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;border-bottom:1.5px solid var(--border);background:var(--s2);">Item</th>
            <th style="text-align:left;padding:8px 14px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;border-bottom:1.5px solid var(--border);background:var(--s2);">Unit</th>
            <th style="text-align:left;padding:8px 14px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;border-bottom:1.5px solid var(--border);background:var(--s2);">Store Stock</th>
            <th style="text-align:left;padding:8px 14px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;border-bottom:1.5px solid var(--border);background:var(--s2);">WIP</th>
            <th style="text-align:left;padding:8px 14px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;border-bottom:1.5px solid var(--border);background:var(--s2);">ROP</th>
            <th style="text-align:left;padding:8px 14px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;border-bottom:1.5px solid var(--border);background:var(--s2);">Status</th>
          </tr></thead>
          <tbody>
            ${d.stocks.map(s => {
              const pct = s.maxL > 0 ? Math.min(100, Math.round(s.currentStock / s.maxL * 100)) : 0;
              const bc  = s.status === 'OK' ? 'var(--green)' : s.status === 'Reorder' ? 'var(--orange)' : 'var(--red)';
              return `<tr>
                <td style="padding:10px 14px;border-bottom:1px solid var(--border);font-weight:600;color:var(--navy);font-size:13px;">${s.name}</td>
                <td style="padding:10px 14px;border-bottom:1px solid var(--border);color:var(--muted);font-size:12px;">${s.unit||'—'}</td>
                <td style="padding:10px 14px;border-bottom:1px solid var(--border);">
                  <span style="font-family:var(--mono);font-weight:700;font-size:15px;color:var(--navy);">${s.currentStock}</span>
                  <div style="height:4px;background:var(--border);border-radius:2px;margin-top:4px;width:80px;">
                    <div style="height:100%;width:${pct}%;background:${bc};border-radius:2px;"></div>
                  </div>
                </td>
                <td style="padding:10px 14px;border-bottom:1px solid var(--border);">
                  ${s.wip > 0 ? `<span style="font-family:var(--mono);font-weight:700;font-size:15px;color:var(--purple);">${s.wip}</span>` : '<span style="color:var(--light);">—</span>'}
                </td>
                <td style="padding:10px 14px;border-bottom:1px solid var(--border);font-family:var(--mono);color:var(--orange);font-weight:600;">${s.reorderPoint}</td>
                <td style="padding:10px 14px;border-bottom:1px solid var(--border);">${stBadge(s.status)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>`;
      }
    }

    // WIP Section
    const wipWrap = document.getElementById('d-wip');
    if (wipWrap) {
      if (!d.wipItems || !d.wipItems.length) {
        wipWrap.innerHTML = `<div class="empty"><div class="ei">🏭</div><div class="et">No WIP — Production mein kuch nahi</div></div>`;
      } else {
        wipWrap.innerHTML = d.wipItems.map(s => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border);">
            <div>
              <div style="font-weight:600;font-size:13px;">${s.name}</div>
              <div style="font-size:11px;color:var(--muted);margin-top:2px;">Store: <b style="color:var(--navy)">${s.currentStock} ${s.unit||''}</b></div>
            </div>
            <div style="text-align:right;">
              <div style="font-family:var(--mono);font-size:18px;font-weight:700;color:var(--purple);">${s.wip}</div>
              <div style="font-size:10px;color:var(--muted);">In Production</div>
            </div>
          </div>`).join('');
      }
    }

    // FG Section
    const fgWrap = document.getElementById('d-fg');
    if (fgWrap) {
      if (!d.fg || !d.fg.length) {
        fgWrap.innerHTML = `<div class="empty"><div class="ei">📦</div><div class="et">No FG dispatched yet</div></div>`;
      } else {
        fgWrap.innerHTML = d.fg.map(f => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border);">
            <div>
              <div style="font-weight:600;font-size:13px;">${f.model}</div>
              <div style="font-size:11px;color:var(--muted);margin-top:2px;">Last: ${fmtD(f.lastDate)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-family:var(--mono);font-size:18px;font-weight:700;color:var(--green);">${f.totalProduced}</div>
              <div style="font-size:10px;color:var(--muted);">Units Produced</div>
            </div>
          </div>`).join('');
      }
    }

    // Render stock chart
    renderStockChart(d.stocks || []);

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
  populateItemSelect('in-item');
  document.getElementById('in-qty').value = '';
  document.getElementById('in-date').value = today();
  document.getElementById('in-supplier').value = '';
  document.getElementById('in-invoice').value = '';
  document.getElementById('in-by').value = 'Ajay';
  document.getElementById('in-remarks').value = '';
  document.getElementById('in-stock-info').style.display = 'none';
  document.getElementById('inward-modal').classList.add('open');
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
  if (!itemName) { toast('Item select karo', 'err'); return; }
  if (!qty || qty <= 0) { toast('Valid quantity daalo', 'err'); return; }
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
  populateItemSelect('out-item');
  document.getElementById('out-qty').value = '';
  document.getElementById('out-date').value = today();
  document.getElementById('out-dept').value = '';
  document.getElementById('out-issuedto').value = '';
  document.getElementById('out-by').value = 'Ajay';
  document.getElementById('out-remarks').value = '';
  document.getElementById('out-stock-info').style.display = 'none';
  document.getElementById('outward-modal').classList.add('open');
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
  if (!itemName)   { toast('Item select karo', 'err'); return; }
  if (!qty || qty <= 0) { toast('Valid quantity daalo', 'err'); return; }
  if (!department) { toast('Department select karo', 'err'); return; }
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
    // Auto close pending request if came from fulfillRequest
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
  await populateBomSelect('dis-bom');
  document.getElementById('dispatch-modal').classList.add('open');
}

async function updDispatchPreview() {
  const bomName = document.getElementById('dis-bom').value;
  const qty     = Number(document.getElementById('dis-qty').value) || 1;
  const preview = document.getElementById('dis-preview');
  if (!bomName) { preview.innerHTML = ''; return; }
  try {
    const items = await api('getBomItems', { bomName });
    if (!items.length) { preview.innerHTML = '<div style="color:var(--muted);font-size:12px;margin-top:10px;">No components found for this BOM</div>'; return; }
    const stockMap = {};
    _stocks.forEach(s => { stockMap[s.name] = s; });

    preview.innerHTML = `<div class="bom-preview">
      <div class="bp-title">Components required (×${qty})</div>
      ${items.map(bi => {
        const needed = bi.qty * qty;
        const s = stockMap[bi.component];
        const avail = s ? s.currentStock : 0;
        const ok = avail >= needed;
        return `<div class="bom-preview-row">
          <span class="comp">${bi.component}</span>
          <span class="qty" style="color:${ok ? 'var(--green)' : 'var(--red)'}">
            ${needed} ${bi.unit} ${ok ? '✓' : `⚠ (avail: ${avail})`}
          </span>
        </div>`;
      }).join('')}
    </div>`;
  } catch(e) { preview.innerHTML = ''; }
}

async function saveDispatch() {
  const bomModel    = document.getElementById('dis-bom').value;
  const qtyProduced = Number(document.getElementById('dis-qty').value);
  const date        = document.getElementById('dis-date').value;
  if (!bomModel) { toast('BOM Model select karo', 'err'); return; }
  if (!qtyProduced || qtyProduced <= 0) { toast('Valid quantity daalo', 'err'); return; }
  const btn = document.getElementById('dis-btn');
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
  } catch(e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = 'Confirm Dispatch'; }
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
  'BMS':        ['JK', 'JBD', 'Daly', 'AIS', 'Pace', 'Other'],
  'Cells':      ['DMEGC', 'EVE', 'BAK', 'LG', 'HLY', 'CATL', 'Other'],
  'Charger':    ['Generic', 'Litpax', 'Other'],
  'Wire':       ['Copper', 'Silicon', 'Other'],
  'Nickel':     ['Pure', 'Coated', 'Other'],
  'Consumable': ['—'],
  'Packaging':  ['—'],
  'Other':      ['—'],
};
const CAT_UNITS = {
  'BMS': 'Pcs', 'Cells': 'Pcs', 'Charger': 'Pcs',
  'Wire': 'Metres', 'Nickel': 'Kg',
  'Consumable': 'Pcs', 'Packaging': 'Pcs', 'Other': 'Pcs',
};

let _selCat = '', _selBrand = '';

function selectCat(cat) {
  _selCat = cat; _selBrand = '';
  // Update cat buttons
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');

  const brands = CAT_BRANDS[cat] || ['Other'];
  const brandGrid = document.getElementById('brand-grid');
  const brandCustom = document.getElementById('f-brand-custom');

  if (brands.length === 1 && brands[0] === '—') {
    // No brand needed - skip to model
    document.getElementById('brand-section').style.display = 'none';
    document.getElementById('model-section').style.display = 'block';
    document.getElementById('item-details').style.display = 'block';
    // Set default unit
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
  if (brand === 'Other') {
    brandCustom.style.display = 'block';
    brandCustom.focus();
  } else {
    brandCustom.style.display = 'none';
  }

  document.getElementById('model-section').style.display = 'block';
  document.getElementById('item-details').style.display = 'block';
  // Set default unit
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
    // Edit mode — show simple form
    const item = _items.find(i => i.name === name);
    if (!item) return;
    document.getElementById('im-title').textContent = 'Edit Item';

    // Hide step UI, show edit UI
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
    // Reset all
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
  const max = Math.ceil(a * l * s);  // Max = ADC × LT × SF
  const rop = Math.ceil(max / 2);    // ROP = Max / 2
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
  if (!name) { toast('Pehle Category → Brand → Model select karo', 'err'); return; }
  const btn = document.getElementById('im-btn');
  btn.disabled = true; btn.textContent = 'Saving...';
  const adc = Number(document.getElementById('f-adc').value) || 0;
  const lt  = Number(document.getElementById('f-lt').value)  || 0;
  const sf  = Number(document.getElementById('f-sf').value)  || 1.2;
  const maxL = Math.ceil(adc * lt * sf);
  const rop  = Math.ceil(maxL / 2);
  const moq  = Number((document.getElementById('f-moq')||{}).value) || rop;
  const payload = {
    name, cat: _selCat || _editItemName && (_items.find(i=>i.name===_editItemName)||{}).cat || 'Other',
    unit: document.getElementById('f-unit').value,
    adc, lt, sf,
    moq,
    maxL,
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
  if (!bomName) { toast('BOM Name required', 'err'); return; }
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

  // Ensure items are loaded first
  if (!_items.length) {
    try {
      const d = await api('getDashboard');
      _stocks = d.stocks || [];
      _items  = _stocks;
    } catch(e) {}
  }

  // Load existing BOM items
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

  // Set selected values
  _bomRows.forEach((row, i) => {
    const sel = wrap.querySelector(`#brow-${i} select`);
    if (sel && row.component) sel.value = row.component;
  });
}

function addBomRow() {
  _bomRows.push({ component: '', qty: '', unit: 'Pcs' });
  renderBomRows();
}
function removeBomRow(i) {
  _bomRows.splice(i, 1);
  renderBomRows();
}

async function saveBomItems() {
  const valid = _bomRows.filter(r => r.component && r.qty > 0);
  if (!valid.length) { toast('Kam se kam ek component daalo', 'err'); return; }
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
let _stockViewMode = 'table'; // 'table' or 'tree'

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
  // Extract brand from item name — second word is brand
  // e.g. "BMS JK 24S 40Amp" → brand = "JK"
  // e.g. "Cells DMEGC 18650" → brand = "DMEGC"
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

  // Group by Category → Brand → Models
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
    const catTotal = Object.values(brands).flat().reduce((s,i) => s + i.currentStock, 0);
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
      const brandTotal = models.reduce((s,i) => s + i.currentStock, 0);
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
  if (el.style.display === 'none') {
    el.style.display = 'block';
    if (arr) arr.classList.add('open');
  } else {
    el.style.display = 'none';
    if (arr) arr.classList.remove('open');
  }
}

function getCatIcon(cat) {
  const icons = { 'BMS':'⚡', 'Cells':'🔋', 'Charger':'🔌', 'Wire':'🔩', 'Nickel':'🪙', 'Consumable':'🧰', 'Packaging':'📦', 'Other':'➕' };
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

  // Update tree if visible
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

// ── CLOSING TAB SWITCH ──
function switchClTab(tab) {
  const single = document.getElementById('cl-single-wrap');
  const range  = document.getElementById('cl-range-wrap');
  const btnS   = document.getElementById('cl-tab-single');
  const btnR   = document.getElementById('cl-tab-range');

  if (tab === 'single') {
    single.style.display = 'block';
    range.style.display  = 'none';
    btnS.style.borderColor = 'var(--accent)'; btnS.style.color = 'var(--accent)';
    btnR.style.borderColor = ''; btnR.style.color = '';
  } else {
    single.style.display = 'none';
    range.style.display  = 'block';
    btnR.style.borderColor = 'var(--accent)'; btnR.style.color = 'var(--accent)';
    btnS.style.borderColor = ''; btnS.style.color = '';
    // Default last 7 days
    const t = new Date();
    const f = new Date(t); f.setDate(f.getDate() - 6);
    document.getElementById('cl-to').value   = t.toISOString().slice(0,10);
    document.getElementById('cl-from').value = f.toISOString().slice(0,10);
  }
}

// ── CLOSING HISTORY ──
let _historyData = [];

async function genHistory() {
  const from = document.getElementById('cl-from').value;
  const to   = document.getElementById('cl-to').value;
  if (!from || !to) { toast('Date range select karo', 'err'); return; }
  if (from > to)    { toast('From date To se pehle honi chahiye', 'err'); return; }

  const wrap = document.getElementById('cl-history-content');
  wrap.innerHTML = `<div class="empty"><div class="ei">⏳</div><div class="et">Loading history...</div></div>`;

  try {
    const data = await api('getClosingHistory', { from, to });
    _historyData = data;

    if (!data.length) {
      wrap.innerHTML = `<div class="empty"><div class="ei">📭</div><div class="et">No snapshots found</div><div class="es">Pehle Daily Closing save karo</div></div>`;
      return;
    }

    // Summary bar
    const totalDays = data.length;
    const totalIn   = data.reduce((s,d) => s + d.totalIn,  0);
    const totalOut  = data.reduce((s,d) => s + d.totalOut, 0);

    let html = `
      <div class="cl-sum" style="margin-bottom:16px;">
        <div class="sc bl"><div class="sc-bar"></div><div class="sc-icon">📅</div><div class="sc-label">Days</div><div class="sc-val">${totalDays}</div></div>
        <div class="sc gn"><div class="sc-bar"></div><div class="sc-icon">📥</div><div class="sc-label">Total Inward</div><div class="sc-val">${totalIn}</div></div>
        <div class="sc rd"><div class="sc-bar"></div><div class="sc-icon">📤</div><div class="sc-label">Total Outward</div><div class="sc-val">${totalOut}</div></div>
      </div>`;

    // Day-wise accordion
    data.forEach(day => {
      html += `
        <div class="card" style="margin-bottom:10px;">
          <div class="ch" style="cursor:pointer;" onclick="toggleDay('day-${day.date}')">
            <div style="display:flex;align-items:center;gap:12px;">
              <h2>📅 ${fmtD(day.date)}</h2>
              <span style="font-size:11px;color:var(--muted);">IN: <b style="color:var(--green);">+${day.totalIn}</b> &nbsp; OUT: <b style="color:var(--red);">-${day.totalOut}</b></span>
              ${day.alerts > 0 ? `<span class="badge b-ro">⚠ ${day.alerts} alerts</span>` : '<span class="badge b-ok">✓ All OK</span>'}
            </div>
            <span style="color:var(--muted);font-size:13px;" id="arrow-${day.date}">▼</span>
          </div>
          <div id="day-${day.date}" style="display:none;">
            <div class="tw">
              <table>
                <thead><tr>
                  <th>Item</th><th>Unit</th><th>Opening</th>
                  <th>IN</th><th>OUT</th><th>Closing</th>
                  <th>ROP</th><th>Status</th>
                </tr></thead>
                <tbody>
                  ${day.rows.map(r => `<tr>
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
              </table>
            </div>
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
  if (el.style.display === 'none') {
    el.style.display = 'block';
    if (arr) arr.textContent = '▲';
  } else {
    el.style.display = 'none';
    if (arr) arr.textContent = '▼';
  }
}

function exportHistoryCSV() {
  if (!_historyData.length) { toast('Pehle history load karo', 'warn'); return; }
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

// ── HELPERS ──
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

function closeM(id) {
  document.getElementById(id).classList.remove('open');
}

let _tt;
function toast(msg, type) {
  const t = document.getElementById('toast');
  t.innerHTML = `<span>${type === 'ok' ? '✓' : type === 'err' ? '✕' : '!'}</span> ${msg}`;
  t.className = `show ${type || 'ok'}`;
  clearTimeout(_tt);
  _tt = setTimeout(() => t.className = '', 3500);
}

// Close modal on backdrop click
document.querySelectorAll('.ov').forEach(el => {
  el.addEventListener('click', e => {
    if (e.target === el) el.classList.remove('open');
  });
});

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
    if (!_items.length) { tb.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--muted);">Pehle Items add karo</td></tr>'; return; }

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
  if (!_items.length) { toast('Items load nahi hue', 'err'); return; }
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

  if (!items.length) { toast('Kuch bhi enter nahi kiya', 'warn'); return; }
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
  if (!itemName) { toast('Item select karo', 'err'); return; }
  if (!qty || qty <= 0) { toast('Valid quantity daalo', 'err'); return; }
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
  if (!qty || qty <= 0) { toast('Valid quantity daalo', 'err'); return; }
  const btn = document.getElementById('recv-btn');
  btn.disabled = true; btn.textContent = 'Processing...';
  try {
    // Add inward entry
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
  if (!confirm('Ye indent cancel karna chahte ho?')) return;
  try {
    await api('cancelIndent', { id });
    toast('Indent cancelled', 'warn');
    _stocks = [];
    loadIndents();
    loadDash();
  } catch(e) { toast(e.message, 'err'); }
}

// ── UPDATE showPage for new pages ──
const _origShowPage = showPage;
// Override showPage to handle new pages
const showPageOrig = showPage;
window._showPageExtended = true;

// Patch nav handler
document.querySelectorAll('.ni').forEach(n => {
  const oc = n.getAttribute('onclick');
  if (oc && oc.includes("'opening'")) n.addEventListener('click', () => { loadOpeningStock(); });
  if (oc && oc.includes("'indent'"))  n.addEventListener('click', () => { loadIndents(); });
});

// Also patch showPage to load these
const _sp = showPage;
showPage = function(id) {
  _sp(id);
  if (id === 'opening')    loadOpeningStock();
  if (id === 'indent')     loadIndents();
  if (id === 'requests')   loadRequests();
  if (id === 'newrequest') loadNewRequestPage();
};


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

// Ajay fulfills request — opens outward modal prefilled
function fulfillRequest(reqId, itemName, qty, department) {
  // Pre-fill outward modal
  populateItemSelect('out-item');
  setTimeout(() => {
    document.getElementById('out-item').value = itemName;
    document.getElementById('out-qty').value = qty;
    document.getElementById('out-date').value = today();
    document.getElementById('out-dept').value = department || '';
    document.getElementById('out-by').value = 'Ajay';
    document.getElementById('out-remarks').value = 'Req: ' + reqId;
    updOutwardInfo();
    // Store reqId to close after outward saved
    window._pendingReqId = reqId;
    document.getElementById('outward-modal').classList.add('open');
    showPage('outward');
  }, 100);
}

async function cancelRequest(id) {
  if (!confirm('Request cancel karna chahte ho?')) return;
  try {
    await api('cancelRequest', { id });
    toast('Request cancelled', 'warn');
    loadRequests();
    loadDash();
  } catch(e) { toast(e.message, 'err'); }
}

// ── REQUEST MATERIAL (Production Worker) ──
async function loadNewRequestPage() {
  if (!_items.length) {
    try {
      const d = await api('getDashboard');
      _stocks = d.stocks || []; _items = _stocks;
    } catch(e) {}
  }
  const sel = document.getElementById('nr-item');
  if (sel) {
    sel.innerHTML = '<option value="">Select Item</option>' + _items.map(i => `<option value="${i.name}">${i.name}</option>`).join('');
    sel.onchange = function() {
      const name = this.value;
      const inf  = document.getElementById('nr-stock-info');
      const av   = document.getElementById('nr-avail');
      if (!name) { inf.style.display = 'none'; return; }
      const s = _stocks.find(x => x.name === name);
      if (s) {
        av.textContent = s.currentStock + ' ' + (s.unit||'');
        inf.style.display = 'block';
      }
    };
  }
}

async function submitRequest() {
  const itemName = document.getElementById('nr-item').value;
  const qty      = Number(document.getElementById('nr-qty').value);
  const dept     = document.getElementById('nr-dept').value;
  const by       = document.getElementById('nr-by').value.trim();

  if (!itemName)       { toast('Item select karo', 'err'); return; }
  if (!qty || qty <= 0){ toast('Quantity daalo', 'err'); return; }
  if (!dept)           { toast('Department select karo', 'err'); return; }
  if (!by)             { toast('Apna naam daalo', 'err'); return; }

  const btn = document.querySelector('#page-newrequest .btn.bp');
  if (btn) { btn.disabled = true; btn.textContent = 'Bhej raha hai...'; }

  try {
    const r = await api('addRequest', {
      itemName, qty,
      department:  dept,
      requestedBy: by,
      remarks:     document.getElementById('nr-remarks').value,
    });
    toast('Request bheji ✓ — Ajay ko pata chal jaayega', 'ok');
    // Reset form
    document.getElementById('nr-item').value = '';
    document.getElementById('nr-qty').value = '';
    document.getElementById('nr-dept').value = '';
    document.getElementById('nr-by').value = '';
    document.getElementById('nr-remarks').value = '';
    document.getElementById('nr-stock-info').style.display = 'none';
    loadDash();
  } catch(e) { toast(e.message, 'err'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = '📤 Request Bhejo'; } }
}

// ── AJAY DASHBOARD ──
async function loadAjayDash() {
  try {
    const d = await api('getDashboard');
    _stocks = d.stocks || [];

    // KPI
    document.getElementById('s-total').textContent = d.totalItems || 0;
    document.getElementById('s-ro').textContent    = d.reorderCount || 0;
    document.getElementById('s-in').textContent    = d.todayIn || 0;
    document.getElementById('s-out').textContent   = d.todayOut || 0;
    document.getElementById('s-wip').textContent   = (d.wipItems||[]).length || 0;

    // Badges
    const nb = document.getElementById('nb');
    if (nb) { nb.style.display = d.reorderCount>0?'inline':'none'; nb.textContent = d.reorderCount; }
    const nbr = document.getElementById('nb-req');
    if (nbr) { nbr.style.display = d.pendingRequests>0?'inline':'none'; nbr.textContent = d.pendingRequests; }
    const dab = document.getElementById('d-alert-badge');
    if (dab) { dab.style.display = d.reorderCount>0?'inline':'none'; dab.textContent = d.reorderCount; }

    // Ajay sees: Store stock, Reorder alerts, Recent txns, Pending requests
    const storeWrap = document.getElementById('d-store');
    if (storeWrap) {
      storeWrap.innerHTML = `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">
        <thead><tr>
          <th style="text-align:left;padding:8px 14px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;border-bottom:1.5px solid var(--border);background:var(--s2);">Item</th>
          <th style="text-align:left;padding:8px 14px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;border-bottom:1.5px solid var(--border);background:var(--s2);">Unit</th>
          <th style="text-align:left;padding:8px 14px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;border-bottom:1.5px solid var(--border);background:var(--s2);">Store Stock</th>
          <th style="text-align:left;padding:8px 14px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;border-bottom:1.5px solid var(--border);background:var(--s2);">ROP</th>
          <th style="text-align:left;padding:8px 14px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;border-bottom:1.5px solid var(--border);background:var(--s2);">MIT</th>
          <th style="text-align:left;padding:8px 14px;font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;border-bottom:1.5px solid var(--border);background:var(--s2);">Status</th>
        </tr></thead>
        <tbody>
          ${d.stocks.map(s => {
            const pct = s.maxL > 0 ? Math.min(100, Math.round(s.currentStock/s.maxL*100)) : 0;
            const bc = s.status==='OK'?'var(--green)':s.status==='Reorder'?'var(--orange)':'var(--red)';
            return `<tr>
              <td style="padding:10px 14px;border-bottom:1px solid var(--border);font-weight:600;color:var(--navy);">${s.name}</td>
              <td style="padding:10px 14px;border-bottom:1px solid var(--border);color:var(--muted);font-size:12px;">${s.unit||'—'}</td>
              <td style="padding:10px 14px;border-bottom:1px solid var(--border);">
                <span style="font-family:var(--mono);font-weight:700;font-size:15px;">${s.currentStock}</span>
                <div style="height:4px;background:var(--border);border-radius:2px;margin-top:4px;width:80px;"><div style="height:100%;width:${pct}%;background:${bc};border-radius:2px;"></div></div>
              </td>
              <td style="padding:10px 14px;border-bottom:1px solid var(--border);font-family:var(--mono);color:var(--orange);font-weight:600;">${s.reorderPoint}</td>
              <td style="padding:10px 14px;border-bottom:1px solid var(--border);">${(s.mit||0)>0?`<span style="font-family:var(--mono);color:var(--purple);">🚚${s.mit}</span>`:'—'}</td>
              <td style="padding:10px 14px;border-bottom:1px solid var(--border);">${stBadge(s.status)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>`;
    }

    // Alerts
    const al = document.getElementById('d-alerts');
    if (al) {
      if (!d.alerts || !d.alerts.length) {
        al.innerHTML = `<div class="empty" style="padding:28px 20px;"><div class="ei">✅</div><div class="et">Sab OK hai!</div></div>`;
      } else {
        al.innerHTML = d.alerts.map(s => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border);">
            <div><div style="font-weight:600;font-size:13px;">${s.name}</div>
            <div style="font-size:11px;color:var(--muted);">ROP: <b>${s.reorderPoint}</b> | Stock: <b>${s.currentStock}</b></div></div>
            ${stBadge(s.status)}
          </div>`).join('');
      }
    }

    // Recent txns
    const rt = document.getElementById('d-recent');
    if (rt) {
      if (!d.recentTxns || !d.recentTxns.length) {
        rt.innerHTML = `<div class="empty" style="padding:28px 20px;"><div class="ei">📭</div><div class="et">Koi transaction nahi</div></div>`;
      } else {
        rt.innerHTML = d.recentTxns.map(t => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 16px;border-bottom:1px solid var(--border);">
            <div><div style="font-weight:500;font-size:13px;">${t.itemName||'—'}</div>
            <div style="font-size:11px;color:var(--muted);">${fmtDT(t.ts)}</div></div>
            <span class="badge ${t.txnType==='IN'?'b-in':'b-out'}">${t.txnType==='IN'?'↑ IN':'↓ OUT'} ${t.qty||''}</span>
          </div>`).join('');
      }
    }

    // Hide WIP/FG for Ajay
    const wipW = document.getElementById('d-wip');
    const fgW  = document.getElementById('d-fg');
    if (wipW) wipW.innerHTML = `<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px;">Production data — Sandeep ke paas hai</div>`;
    if (fgW)  fgW.innerHTML  = `<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px;">Finished Goods — Sandeep ke paas hai</div>`;

    renderStockChart(d.stocks || []);
    setDot('ok', 'Connected');
  } catch(e) { toast(e.message, 'err'); setDot('err', 'Error'); }
}

// ── SANDEEP DASHBOARD ──
async function loadSandeepDash() {
  try {
    const d = await api('getDashboard');
    _stocks = d.stocks || [];

    // KPI — Sandeep relevant
    document.getElementById('s-total').textContent = (d.wipItems||[]).length || 0;
    document.getElementById('s-ro').textContent    = (d.fg||[]).length || 0;
    document.getElementById('s-in').textContent    = d.todayOut || 0;  // outward = production mein aaya
    document.getElementById('s-out').textContent   = '—';
    document.getElementById('s-wip').textContent   = (d.wipItems||[]).length || 0;

    // Update KPI labels for Sandeep
    const labels = document.querySelectorAll('.kpi-label');
    if (labels[0]) labels[0].textContent = 'Items in WIP';
    if (labels[1]) labels[1].textContent = 'FG Models';
    if (labels[2]) labels[2].textContent = 'Today Production In';
    if (labels[3]) labels[3].textContent = '—';

    // Store section — show outward (what came to production)
    const storeWrap = document.getElementById('d-store');
    if (storeWrap) {
      storeWrap.innerHTML = d.recentTxns && d.recentTxns.filter(t=>t.txnType==='OUT').length ?
        `<div>
          <div style="padding:10px 16px;background:var(--s2);font-size:11px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:.7px;">
            📤 Aaj Store Se Production Mein Aaya
          </div>
          ${d.recentTxns.filter(t=>t.txnType==='OUT').map(t=>`
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border);">
              <div><div style="font-weight:600;font-size:13px;">${t.itemName||'—'}</div>
              <div style="font-size:11px;color:var(--muted);">${fmtDT(t.ts)} · ${t.department||'—'}</div></div>
              <span style="font-family:var(--mono);font-weight:700;color:var(--orange);">-${t.qty}</span>
            </div>`).join('')}
        </div>` :
        `<div class="empty" style="padding:28px;"><div class="ei">📤</div><div class="et">Aaj koi material nahi aaya</div></div>`;
    }

    // WIP
    const wipW = document.getElementById('d-wip');
    if (wipW) {
      if (!d.wipItems || !d.wipItems.length) {
        wipW.innerHTML = `<div class="empty" style="padding:28px 20px;"><div class="ei">🏭</div><div class="et">WIP mein kuch nahi</div></div>`;
      } else {
        wipW.innerHTML = d.wipItems.map(s=>`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border);">
            <div><div style="font-weight:600;font-size:13px;">${s.name}</div>
            <div style="font-size:11px;color:var(--muted);">Store: ${s.currentStock} ${s.unit||''}</div></div>
            <div style="text-align:right;">
              <div style="font-family:var(--mono);font-size:18px;font-weight:700;color:var(--purple);">${s.wip}</div>
              <div style="font-size:10px;color:var(--muted);">Production mein</div>
            </div>
          </div>`).join('');
      }
    }

    // FG
    const fgW = document.getElementById('d-fg');
    if (fgW) {
      if (!d.fg || !d.fg.length) {
        fgW.innerHTML = `<div class="empty" style="padding:28px 20px;"><div class="ei">📦</div><div class="et">Koi FG nahi</div></div>`;
      } else {
        fgW.innerHTML = d.fg.map(f=>`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border);">
            <div><div style="font-weight:600;font-size:13px;">${f.model}</div>
            <div style="font-size:11px;color:var(--muted);">Last: ${fmtD(f.lastDate)}</div></div>
            <div style="text-align:right;">
              <div style="font-family:var(--mono);font-size:18px;font-weight:700;color:var(--green);">${f.totalProduced}</div>
              <div style="font-size:10px;color:var(--muted);">Units</div>
            </div>
          </div>`).join('');
      }
    }

    // Hide reorder alerts for Sandeep
    const al = document.getElementById('d-alerts');
    if (al) al.innerHTML = `<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px;">Reorder — Ajay ke paas hai</div>`;
    const rt = document.getElementById('d-recent');
    if (rt) rt.innerHTML = `<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px;">Store transactions — Ajay ke paas hain</div>`;

    setDot('ok', 'Connected');
  } catch(e) { toast(e.message, 'err'); setDot('err', 'Error'); }
}

// ── STOCK LEVEL CHART ──
let _stockChartInst = null;
function renderStockChart(stocks) {
  const canvas = document.getElementById('stockChart');
  if (!canvas || !stocks.length) return;

  // Top 8 items by current stock
  const items = stocks.slice(0, 8);
  const labels = items.map(s => s.name.length > 15 ? s.name.slice(0,15)+'…' : s.name);
  const current = items.map(s => s.currentStock);
  const rop     = items.map(s => s.reorderPoint);
  const max     = items.map(s => s.maxL || s.reorderPoint * 2);

  if (_stockChartInst) _stockChartInst.destroy();

  _stockChartInst = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Current Stock',
          data: current,
          backgroundColor: items.map(s =>
            s.status === 'Critical' ? 'rgba(220,38,38,.8)' :
            s.status === 'Reorder'  ? 'rgba(234,88,12,.8)' :
            'rgba(37,88,232,.75)'
          ),
          borderRadius: 6,
          borderSkipped: false,
        },
        {
          label: 'Reorder Point',
          data: rop,
          backgroundColor: 'rgba(217,119,6,.25)',
          borderColor: 'rgba(217,119,6,.8)',
          borderWidth: 1.5,
          borderRadius: 4,
          borderSkipped: false,
          type: 'bar',
        },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'top',
          labels: { font: { size: 11, family: 'DM Sans' }, boxWidth: 12, padding: 14 }
        },
        tooltip: {
          callbacks: {
            afterBody: (items) => {
              const s = stocks[items[0].dataIndex];
              return s ? [`Max Level: ${s.maxL||0}`, `Status: ${s.status}`] : [];
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 10, family: 'DM Sans' }, maxRotation: 30 }
        },
        y: {
          grid: { color: 'rgba(0,0,0,.05)' },
          ticks: { font: { size: 10, family: 'DM Sans' } },
          beginAtZero: true,
        }
      }
    }
  });
}
