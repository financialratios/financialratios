// Premium page: offers, access-code activation, and the return from Stripe Checkout.
import { offersHtml, wireOffers, quotaText, refreshLicense, activateCode, saveCode, savedCode } from './access.js';
import { escapeHtml } from './lib/format.js';

const $ = (s) => document.querySelector(s);
const statusEl = $('#pm-status');

function showStatus() {
  const code = savedCode();
  statusEl.innerHTML = `<b>Your downloads:</b> ${quotaText()}${code ? ` <span class="muted small">· access code <code>${escapeHtml(code)}</code></span>` : ''}`;
}

$('#pm-offers').innerHTML = offersHtml();
wireOffers($('#pm-offers'));

$('#pm-code').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#pm-code-msg');
  try {
    const st = await activateCode($('#pm-code-in').value);
    msg.innerHTML = `<span class="up">✅ Activated: ${st.unlimited ? 'Premium, unlimited downloads' : `${st.credits} downloads available`}.</span>`;
  } catch (err) { msg.innerHTML = `<span class="down">${escapeHtml(err.message)}</span>`; }
  showStatus();
});

async function init() {
  const params = new URLSearchParams(location.search);
  const notice = $('#pm-notice');
  if (params.get('session_id')) {
    notice.innerHTML = '<div class="card pm-notice"><div class="spinner"></div> Confirming your payment…</div>';
    try {
      const res = await fetch(`/api/claim?session_id=${encodeURIComponent(params.get('session_id'))}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'We could not confirm the payment yet.');
      saveCode(body.code);
      notice.innerHTML = `<div class="card pm-notice ok">
        <h2 style="margin-top:0">🎉 Thank you${body.name ? `, ${escapeHtml(body.name.split(' ')[0])}` : ''}!</h2>
        <p>${body.unlimited ? 'Premium is active: you can download as much as you want.' : `You now have <b>${body.credits}</b> extra downloads.`}
          It is already switched on in this browser.</p>
        <p>Your access code (also sent to you by email): <code class="pm-code">${escapeHtml(body.code)}</code><br>
          <span class="small muted">Keep it: enter it on any other device to use your downloads there.</span></p>
        <a class="btn btn-accent" href="/analyze/">Analyze a company →</a></div>`;
      history.replaceState(null, '', location.pathname);
    } catch (err) {
      notice.innerHTML = `<div class="card pm-notice"><b>Your payment is being processed.</b> ${escapeHtml(err.message)}
        Please refresh this page in a minute. Your access code will also arrive by email.</div>`;
    }
  } else if (params.get('cancelled')) {
    notice.innerHTML = '<div class="card pm-notice">The payment was cancelled and nothing was charged. You can choose again whenever you like.</div>';
  }
  showStatus();
  await refreshLicense();
  showStatus();
}
init();
