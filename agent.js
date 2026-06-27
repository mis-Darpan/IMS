// ============================================================
// Litpax IMS Agent — agent.js
// GAS-powered, no external API needed
// ============================================================

const IMS_API = 'https://script.google.com/macros/s/AKfycbzyfxO3CqB2ot24-iohidaP_FjInFfx9Qup8MUqY14cNu7IyAqbqsh-emXi865_bQjT/exec';

let _imsOpen    = false;
let _imsLoading = false;

function imsToggle() {
  _imsOpen = !_imsOpen;
  document.getElementById('ims-fab').classList.toggle('open', _imsOpen);
  document.getElementById('ims-popup').classList.toggle('open', _imsOpen);
  if (_imsOpen) {
    // fresh open — reset chat
    imsResetChat();
    document.getElementById('ims-inp').focus();
  }
}

function imsResetChat() {
  const wrap = document.getElementById('ims-msgs');
  wrap.innerHTML = `
    <div class="ims-msg b">
      <div class="ims-bubble">Namaste! 👋 Stock, reorder, dispatch, WIP — kuch bhi poochho.</div>
      <div class="ims-ts">Abhi</div>
    </div>`;
}

function imsTs() {
  return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function imsAddMsg(text, role, loading) {
  const wrap = document.getElementById('ims-msgs');
  const d = document.createElement('div');
  d.className = 'ims-msg ' + (role === 'user' ? 'u' : 'b');
  d.innerHTML = `<div class="ims-bubble${loading ? ' loading' : ''}">${text}</div><div class="ims-ts">${imsTs()}</div>`;
  wrap.appendChild(d);
  wrap.scrollTop = wrap.scrollHeight;
  return d;
}

function imsAsk(q) {
  document.getElementById('ims-inp').value = q;
  imsSend();
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
    const res = await fetch(IMS_API, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'askAgent', question: q })
    });

    const data = JSON.parse(await res.text());
    const reply = data.reply || data.error || 'Kuch gadbad hui.';

    loadEl.querySelector('.ims-bubble').textContent = reply;
    loadEl.querySelector('.ims-bubble').classList.remove('loading');

  } catch(e) {
    loadEl.querySelector('.ims-bubble').textContent = 'Network error — dobara try karo.';
    loadEl.querySelector('.ims-bubble').classList.remove('loading');
    loadEl.querySelector('.ims-bubble').style.color = '#dc2626';
  }

  _imsLoading = false;
  document.getElementById('ims-send').disabled = false;
  document.getElementById('ims-msgs').scrollTop = 9999;
}
