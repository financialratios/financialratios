// Premium page: offers (bought on Gumroad) and license-key activation.
import { offersHtml, wireOffers, quotaText, refreshLicense, activateCode, savedCode, paymentsOn } from './access.js';
import { escapeHtml } from './lib/format.js';

const $ = (s) => document.querySelector(s);
const statusEl = $('#pm-status');

function showStatus() {
  const code = savedCode();
  statusEl.hidden = !paymentsOn;
  statusEl.innerHTML = `<b>Your downloads:</b> ${quotaText()}${code ? ` <span class="muted small">· license key <code>${escapeHtml(code)}</code></span>` : ''}`;
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
  if (!paymentsOn) {
    $('#pm-notice').innerHTML = '<div class="card pm-notice ok"><b>🎁 Good news: downloads are free and unlimited for now.</b> Paid plans will start later; until then, enjoy!</div>';
  }
  showStatus();
  await refreshLicense();
  showStatus();
}
init();
