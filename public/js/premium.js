// Premium page: offers (bought on Gumroad) and license-key activation.
import { offersHtml, wireOffers, quotaText, activatedText, activateCode, savedCode, paymentsOn, isPremium, canUsePortfolio } from './access.js';
import { escapeHtml } from './lib/format.js';

const $ = (s) => document.querySelector(s);
const statusEl = $('#pm-status');

let tracker = false;
function showStatus() {
  const code = savedCode();
  statusEl.hidden = !paymentsOn;
  statusEl.innerHTML = `<b>Your plan:</b> ${isPremium() ? '⭐ Premium: unlimited downloads and the portfolio tracker' : `${quotaText()}${tracker ? ' · 💼 portfolio tracker unlocked' : ''}`}${code ? ` <span class="muted small">· license key <code>${escapeHtml(code)}</code></span>` : ''}`;
}

$('#pm-offers').innerHTML = offersHtml();
wireOffers($('#pm-offers'));

$('#pm-code').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#pm-code-msg');
  try {
    const st = await activateCode($('#pm-code-in').value);
    msg.innerHTML = `<span class="up">✅ Activated: ${activatedText(st)}.</span>`;
    tracker = !!st.portfolio;
  } catch (err) { msg.innerHTML = `<span class="down">${escapeHtml(err.message)}</span>`; }
  showStatus();
});

async function init() {
  if (!paymentsOn) {
    $('#pm-notice').innerHTML = '<div class="card pm-notice ok"><b>🎁 Good news: downloads and the portfolio tracker are free and unlimited for now.</b> Paid plans will start later; until then, enjoy!</div>';
  }
  showStatus();
  tracker = await canUsePortfolio();
  showStatus();
}
init();
