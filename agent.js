// ============================================================
// Litpax IMS Agent — agent.js v3
// ============================================================

const IMS_API = 'https://script.google.com/macros/s/AKfycbwZIb1KolVqxlqO8NsTsqx3j6wJ4juHows43Kb1vGxGkX45eyxNTMEriw4tgZN_RNGP/exec';

let _imsOpen    = false;
let _imsLoading = false;

function imsToggle() {
  _imsOpen = !_imsOpen;
  document.getElementById('ims-fab').classList.toggle('open', _imsOpen);
  document.getElementById('ims-popup').classList.toggle('open', _imsOpen);
  if (_imsOpen) {
    imsResetChat();
    document.getElementById('ims-inp').focus();
  }
}

function imsResetChat() {
  document.getElementById('ims-msgs').innerHTML = `
    <div class="ims-msg b">
      <div class="ims-bubble">Namaste! 👋 Kuch bhi poochho — stock, reorder, inward, dispatch, WIP...</div>
      <div class="ims-ts">Abhi</div>
    </div>`;
}

function imsTs() {
  return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function imsAddMsg(html, role, loading) {
  const wrap = document.getElementById('ims-msgs');
  const d = document.createElement('div');
  d.className = 'ims-msg ' + (role === 'user' ? 'u' : 'b');
  d.innerHTML = `<div class="ims-bubble${loading ? ' loading' : ''}">${html}</div><div class="ims-ts">${imsTs()}</div>`;
  wrap.appendChild(d);
  wrap.scrollTop = wrap.scrollHeight;
  return d;
}

function imsGetIcon(cat) {
  const icons = {
    'Cells':'🔋','BMS':'⚡','Charger':'🔌','Nickel/Busbar':'🪙',
    'Box':'📦','Wire':'🔩','Consumables':'🧰','Tools':'🔧','Packaging':'📦'
  };
  return icons[cat] || '📦';
}

function imsRender(data) {
  const wrap = document.getElementById('ims-msgs');
  const d = document.createElement('div');
  d.className = 'ims-msg b';

  // ── agar sirf plain reply hai (purana GAS format) ──
  if (!data.type && data.reply) {
    d.innerHTML = `<div class="ims-bubble">${data.reply}</div><div class="ims-ts">${imsTs()}</div>`;
    wrap.appendChild(d);
    wrap.scrollTop = wrap.scrollHeight;
    return;
  }

  // ── agar error aaya ──
  if (data.error) {
    d.innerHTML = `<div class="ims-bubble" style="color:#dc2626;">⚠️ ${data.error}</div><div class="ims-ts">${imsTs()}</div>`;
    wrap.appendChild(d);
    wrap.scrollTop = wrap.scrollHeight;
    return;
  }

  let html = `<div class="ims-bubble ims-card">`;
  html += `<div class="ims-card-title">${data.reply || ''}</div>`;

  // CATEGORIES
  if (data.type === 'categories') {
    html += `<div class="ims-btn-grid">`;
    (data.categories || []).forEach(c => {
      const alertBadge = c.alerts > 0 ? `<span class="ims-alert-dot">${c.alerts}</span>` : '';
      html += `<button class="ims-cat-btn" onclick="imsAsk('${c.name} stock dikhao')">
        ${imsGetIcon(c.name)} ${c.name} ${alertBadge}
        <span class="ims-cat-sub">${c.total} items</span>
      </button>`;
    });
    html += `</div>`;
  }

  // MODELS
  else if (data.type === 'models') {
    html += `<div class="ims-model-list">`;
    (data.models || []).forEach(m => {
      const stIcon = m.status === 'Critical' ? '🔴' : m.status === 'Reorder' ? '⚠️' : '✅';
      html += `<button class="ims-model-row" onclick="imsAskParam('${m.name.replace(/'/g,"\\'").replace(/"/g,'\\"')}')">
        <span class="ims-model-name">${m.name}</span>
        <span class="ims-model-stock">${stIcon} ${m.stock}</span>
      </button>`;
    });
    html += `</div>`;
  }

  // DETAIL
  else if (data.type === 'detail') {
    const det = data.detail || {};
    const stColor = det.status === 'Critical' ? '#dc2626' : det.status === 'Reorder' ? '#f59e0b' : '#1D9E75';
    html += `<div class="ims-detail-grid">
      <div class="ims-detail-row"><span>Stock</span><b>${det.stock}</b></div>
      <div class="ims-detail-row"><span>WIP</span><b>${det.wip}</b></div>
      <div class="ims-detail-row"><span>ROP</span><b>${det.rop}</b></div>
      <div class="ims-detail-row"><span>Max Level</span><b>${det.max}</b></div>
      <div class="ims-detail-row"><span>In Transit</span><b>${det.mit}</b></div>
      <div class="ims-detail-row"><span>Status</span><b style="color:${stColor}">${det.status}</b></div>
      <div class="ims-detail-row full"><span>Action</span><b>${det.order}</b></div>
    </div>`;
  }

  // REORDER
  else if (data.type === 'reorder') {
    if ((data.critical||[]).length) {
      html += `<div class="ims-section-label">🔴 Critical</div>`;
      (data.critical||[]).forEach(s => {
        html += `<button class="ims-model-row" onclick="imsAskParam('${s.name.replace(/'/g,"\\'")}')">
          <span class="ims-model-name">${s.name}</span>
          <span class="ims-model-stock" style="color:#dc2626">${s.stock} → ${s.order}</span>
        </button>`;
      });
    }
    if ((data.reorder||[]).length) {
      html += `<div class="ims-section-label" style="margin-top:8px;">⚠️ Reorder</div>`;
      (data.reorder||[]).forEach(s => {
        html += `<button class="ims-model-row" onclick="imsAskParam('${s.name.replace(/'/g,"\\'")}')">
          <span class="ims-model-name">${s.name}</span>
          <span class="ims-model-stock" style="color:#f59e0b">${s.stock} → ${s.order}</span>
        </button>`;
      });
    }
  }

  // LIST
  else if (data.type === 'list') {
    html += `<div class="ims-simple-list">`;
    (data.items||[]).forEach(i => {
      html += `<div class="ims-list-row">
        <div class="ims-list-name">${i.name}</div>
        <div class="ims-list-meta"><b>${i.qty}</b><span>${i.note}</span></div>
      </div>`;
    });
    html += `</div>`;
  }

  // SUMMARY
  else if (data.type === 'summary') {
    const d2 = data.data || {};
    html += `<div class="ims-detail-grid">
      <div class="ims-detail-row"><span>Total Items</span><b>${d2.total}</b></div>
      <div class="ims-detail-row"><span>🔴 Critical</span><b style="color:#dc2626">${d2.critical}</b></div>
      <div class="ims-detail-row"><span>⚠️ Reorder</span><b style="color:#f59e0b">${d2.reorder}</b></div>
      <div class="ims-detail-row"><span>✅ OK</span><b style="color:#1D9E75">${d2.ok}</b></div>
      <div class="ims-detail-row"><span>🏭 WIP</span><b>${d2.wip}</b></div>
      <div class="ims-detail-row"><span>🔔 Requests</span><b>${d2.pendingRequests}</b></div>
      <div class="ims-detail-row"><span>📋 Open POs</span><b>${d2.openPOs}</b></div>
      <div class="ims-detail-row"><span>📥 Aaj Inward</span><b>${d2.todayInward}</b></div>
      <div class="ims-detail-row"><span>📤 Aaj Outward</span><b>${d2.todayOutward}</b></div>
      <div class="ims-detail-row"><span>🚚 Aaj Dispatch</span><b>${d2.todayDispatch}</b></div>
    </div>`;
  }

  // HELP
  else if (data.type === 'help') {
    html += `<div class="ims-btn-grid">`;
    (data.suggestions||[]).forEach(s => {
      html += `<button class="ims-sugg-btn" onclick="imsAsk('${s}')">${s}</button>`;
    });
    html += `</div>`;
  }

  // fallback
  else {
    html += `<div style="font-size:12.5px;margin-top:4px;">${data.reply || JSON.stringify(data)}</div>`;
  }

  html += `</div><div class="ims-ts">${imsTs()}</div>`;
  d.innerHTML = html;
  wrap.appendChild(d);
  wrap.scrollTop = wrap.scrollHeight;
}

function imsAsk(q) {
  document.getElementById('ims-inp').value = q;
  imsSend();
}

function imsAskParam(itemName) {
  imsAddMsg(itemName, 'user');
  const loadEl = imsAddMsg('Dekh raha hoon...', 'bot', true);
  _imsLoading = true;
  fetch(IMS_API, {
    method: 'POST', redirect: 'follow',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'askAgent', question: itemName, param: itemName })
  })
  .then(r => r.text())
  .then(t => {
    loadEl.remove();
    imsRender(JSON.parse(t));
  })
  .catch(e => {
    loadEl.querySelector('.ims-bubble').textContent = 'Error: ' + e.message;
    loadEl.querySelector('.ims-bubble').classList.remove('loading');
  })
  .finally(() => { _imsLoading = false; });
}

async function imsSend() {
  const q = document.getElementById('ims-inp').value.trim();
  if (!q || _imsLoading) return;

  document.getElementById('ims-inp').value = '';
  _imsLoading = true;
  document.getElementById('ims-send').disabled = true;

  imsAddMsg(q, 'user');
  const loadEl = imsAddMsg('Dekh raha hoon...', 'bot', true);

  try {
    const res  = await fetch(IMS_API, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'askAgent', question: q })
    });
    const text = await res.text();
    const data = JSON.parse(text);
    loadEl.remove();
    imsRender(data);
  } catch(e) {
    loadEl.querySelector('.ims-bubble').textContent = 'Error: ' + e.message;
    loadEl.querySelector('.ims-bubble').classList.remove('loading');
  }

  _imsLoading = false;
  document.getElementById('ims-send').disabled = false;
}
