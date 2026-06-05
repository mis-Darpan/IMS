// ============================================================
// LITPAX IMS — app.js
// API URL: change here if redeployed
// ============================================================

const API = 'https://script.google.com/macros/s/AKfycbwQd40WksTsQttiQqY1fQP8eYlG1pMeBjtzGVPxW7F_tbmeI0V043wi7s98X7gJTqjM/exec';

const DEPTS = ['Volt Wing','Ampere Wing','Volt x Ampere Wing','Mega Grid','Cathodic Wing','Future Cell','Phoenix Wing','Other'];

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
  await loadDash();
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
  document.getElementById('dash-date').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  try {
    const d = await api('getDashboard');
    _stocks = d.stocks || [];
    document.getElementById('s-total').textContent = d.totalItems || 0;
    document.getElementById('s-ro').textContent    = d.reorderCount || 0;
    document.getElementById('s-in').textContent    = d.todayIn || 0;
    document.getElementById('s-out').textContent   = d.todayOut || 0;

    const nb = document.getElementById('nb');
    if (d.reorderCount > 0) { nb.style.display = 'inline'; nb.textContent = d.reorderCount; }
    else nb.style.display = 'none';

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

function openItemModal(name) {
  _editItemName = name || null;
  if (name) {
    const item = _items.find(i => i.name === name);
    if (!item) return;
    document.getElementById('im-title').textContent = 'Edit Item';
    document.getElementById('f-name').value    = item.name;
    document.getElementById('f-cat').value     = item.cat;
    document.getElementById('f-unit').value    = item.unit || '';
    document.getElementById('f-adc').value     = item.adc || 0;
    document.getElementById('f-lt').value      = item.lt || 0;
    document.getElementById('f-sf').value      = item.sf || 1.2;
    document.getElementById('f-moq').value     = item.moq || 0;
    document.getElementById('f-max').value     = item.maxL || 0;
    document.getElementById('f-mit').value     = item.mit || 0;
    document.getElementById('f-remarks').value = item.remarks || '';
  } else {
    document.getElementById('im-title').textContent = 'Add Item';
    ['f-name','f-unit','f-adc','f-lt','f-mit','f-remarks'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('f-sf').value  = '1.2';
    document.getElementById('f-cat').value = 'Raw Material';
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
  const rop = Math.ceil(a * l * s);
  const moq = rop;
  const max = rop * 2;
  document.getElementById('rop-prev').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:4px;">
      <div>
        <div style="font-size:10px;color:var(--muted);margin-bottom:2px;">REORDER POINT</div>
        <div style="font-family:var(--mono);font-size:18px;font-weight:700;color:var(--accent);">${rop} <span style="font-size:11px;">${u}</span></div>
        <div style="font-size:10px;color:var(--muted);">${a} × ${l} × ${s}</div>
      </div>
      <div>
        <div style="font-size:10px;color:var(--muted);margin-bottom:2px;">MOQ (AUTO)</div>
        <div style="font-family:var(--mono);font-size:18px;font-weight:700;color:var(--orange);">${moq} <span style="font-size:11px;">${u}</span></div>
        <div style="font-size:10px;color:var(--muted);">= ROP</div>
      </div>
      <div>
        <div style="font-size:10px;color:var(--muted);margin-bottom:2px;">MAX LEVEL (AUTO)</div>
        <div style="font-family:var(--mono);font-size:18px;font-weight:700;color:var(--green);">${max} <span style="font-size:11px;">${u}</span></div>
        <div style="font-size:10px;color:var(--muted);">= ROP × 2</div>
      </div>
    </div>`;
}

async function saveItem() {
  const name = document.getElementById('f-name').value.trim();
  if (!name) { toast('Item Name required', 'err'); return; }
  const btn = document.getElementById('im-btn');
  btn.disabled = true; btn.textContent = 'Saving...';
  const adc = Number(document.getElementById('f-adc').value) || 0;
  const lt  = Number(document.getElementById('f-lt').value)  || 0;
  const sf  = Number(document.getElementById('f-sf').value)  || 1.2;
  const rop = Math.ceil(adc * lt * sf);
  const payload = {
    name, cat: document.getElementById('f-cat').value,
    unit: document.getElementById('f-unit').value,
    adc, lt, sf,
    moq:  rop,
    maxL: rop * 2,
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

  // Load existing items
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

// ── STOCK SUMMARY ──
async function loadStock() {
  document.getElementById('stock-tb').innerHTML = `<tr class="lrow"><td colspan="9"><span class="loader"></span></td></tr>`;
  try {
    _stocks = await api('getStockSummary');
    filterStock();
  } catch(e) { toast(e.message, 'err'); }
}
function filterStock() {
  const s  = document.getElementById('stock-search').value.toLowerCase();
  const sf = document.getElementById('stock-status-f').value;
  const fl = _stocks.filter(i =>
    (!s  || i.name.toLowerCase().includes(s)) &&
    (!sf || i.status === sf)
  );
  const tb = document.getElementById('stock-tb');
  const em = document.getElementById('stock-empty');
  if (!fl.length) { tb.innerHTML = ''; em.style.display = 'block'; return; }
  em.style.display = 'none';
  tb.innerHTML = fl.map(item => {
    const pct = item.maxL > 0 ? Math.min(100, Math.round(item.currentStock / item.maxL * 100)) : 0;
    const bc  = item.status === 'OK' ? 'var(--green)' : item.status === 'Reorder' ? 'var(--orange)' : 'var(--red)';
    return `<tr>
      <td style="font-weight:600;">${item.name}</td>
      <td>${catBadge(item.cat)}</td>
      <td style="color:var(--muted);font-size:12px;">${item.unit || '—'}</td>
      <td style="font-family:var(--mono);color:var(--orange);font-weight:600;">${item.reorderPoint}</td>
      <td style="font-family:var(--mono);">${item.maxL || 0}</td>
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
  let csv = 'Date,Item Name,Category,Unit,Opening,Today IN,Today OUT,Closing,ROP,Status
';
  _historyData.forEach(day => {
    day.rows.forEach(r => {
      csv += `${r.date},"${r.name}",${r.cat},${r.unit},${r.opening},${r.todayIn},${r.todayOut},${r.closing},${r.reorderPoint},${r.status}
`;
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
