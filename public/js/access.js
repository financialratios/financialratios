// Paid plans: 3 free downloads per browser, then a 3-download pack or Premium.
// Pack (one-time) = 3 more downloads + the portfolio tracker. Premium (monthly or yearly) = unlimited downloads + the portfolio tracker.
// Purchases happen on Gumroad; the Gumroad license key is the buyer's access code, checked by the server.
// While no Gumroad product is set up in config.js, downloads and the portfolio tracker are free and unlimited.
import { escapeHtml } from './lib/format.js';
import { SITE } from './config.js';

const shop = SITE.gumroad || {};
export const paymentsOn = Object.values(shop).some((p) => p && p.url);

export const FREE_LIMIT = 3;
const K_USED = 'fr-free-downloads-used', K_CODE = 'fr-access-code';
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage blocked */ } };

export const PRICES = { pack: 1, packDownloads: 3, monthly: 4.99, yearly: 50 };
export const yearlyFull = PRICES.monthly * 12; // 59.88
export const yearlySaving = yearlyFull - PRICES.yearly; // 9.88
export const yearlySavingPct = Math.round((yearlySaving / yearlyFull) * 100); // 16%
const eur = (v) => `€${Number.isInteger(v) ? v : v.toFixed(2)}`;

let license = null; // { plan, credits, unlimited, ... } from the server
export const freeLeft = () => Math.max(0, FREE_LIMIT - Number(get(K_USED) || 0));
export const savedCode = () => get(K_CODE);
export const isPremium = () => !!license?.unlimited;
const hasPortfolio = () => !!license?.portfolio;

export async function refreshLicense() {
  const code = savedCode();
  if (!code) { license = null; return null; }
  try {
    const res = await fetch(`/api/license?code=${encodeURIComponent(code)}`);
    license = res.ok ? await res.json() : null;
    if (res.status === 404) set(K_CODE, null);
  } catch { /* offline: keep the last known state */ }
  return license;
}

export async function activateCode(code) {
  const c = String(code || '').trim().toUpperCase();
  const res = await fetch(`/api/license?code=${encodeURIComponent(c)}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Code not found.');
  set(K_CODE, c);
  license = body;
  return body;
}

/** What an activated license unlocks, in words. */
export const activatedText = (st) => (st.unlimited
  ? 'Premium: unlimited downloads and the portfolio tracker'
  : `${st.credits} downloads available${st.portfolio ? ' and the portfolio tracker' : ''}`);

/** Text for the small counter under the download button. */
export function quotaText() {
  if (!paymentsOn) return '';
  if (license?.unlimited) return '⭐ Premium: unlimited downloads';
  const free = freeLeft();
  const paid = license?.plan === 'pack' ? license.credits || 0 : 0;
  if (free > 0) return `🎁 ${free} of ${FREE_LIMIT} free downloads left${paid ? ` · +${paid} paid` : ''}`;
  if (paid > 0) return `🎟️ ${paid} paid download${paid === 1 ? '' : 's'} left`;
  return '🔒 No free downloads left · <a href="/premium.html">see options</a>';
}

export function renderQuota(el) { if (el) el.innerHTML = quotaText(); }

/** Ask permission for one download. Resolves true when allowed (and counts it), false otherwise (paywall shown). */
export async function requestDownload() {
  if (!paymentsOn) return true;
  if (savedCode() && !license) await refreshLicense();
  if (license?.unlimited) return true;
  if (freeLeft() > 0) {
    set(K_USED, String(Number(get(K_USED) || 0) + 1));
    return true;
  }
  if (savedCode() && license?.plan === 'pack' && license.credits > 0) {
    const res = await fetch('/api/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: savedCode() }) });
    const body = await res.json().catch(() => ({}));
    if (res.ok) { license = body; return true; }
  }
  showPaywall();
  return false;
}

/** True when this visitor may use the portfolio tracker (any paid plan, or payments not switched on yet). */
export async function canUsePortfolio() {
  if (!paymentsOn) return true;
  if (savedCode()) await refreshLicense();
  return hasPortfolio();
}

/** Open the Gumroad checkout for a plan in a new tab; the buyer comes back with a license key. */
export function startCheckout(plan) {
  const url = shop[plan]?.url;
  if (!url) { alert('Payments are not switched on yet. Please try again soon.'); return; }
  window.open(`${url}${url.includes('?') ? '&' : '?'}wanted=true`, '_blank', 'noopener');
  document.querySelectorAll('.after-pay').forEach((el) => { el.hidden = false; });
}

const PREMIUM_PERKS = `<li>⭐ <b>Unlimited downloads</b> of financial statements (Excel and PDF)</li>
  <li>💼 <b>Portfolio tracker</b>: your holdings, gains and losses, allocation and history</li>`;

/** The offers, shared by the paywall, the portfolio lock and the Premium page. */
export function offersHtml() {
  const pack = `<div class="offer">
      <div class="offer-name">Download pack</div>
      <div class="offer-price">${eur(PRICES.pack)}</div>
      <div class="offer-sub">one-time payment</div>
      <ul><li>✅ <b>${PRICES.packDownloads} more downloads</b> (Excel or PDF)</li><li>💼 <b>Portfolio tracker</b> included</li><li>✅ No subscription</li></ul>
      <button class="btn btn-ghost" data-plan="pack3" type="button">Buy for ${eur(PRICES.pack)}</button>
    </div>`;
  return `<div class="offers">
    ${pack}
    <div class="offer">
      <div class="offer-name">Premium monthly</div>
      <div class="offer-price">${eur(PRICES.monthly)}<span>/month</span></div>
      <div class="offer-sub">cancel anytime</div>
      <ul>${PREMIUM_PERKS}<li>✅ Works on all your devices</li></ul>
      <button class="btn btn-primary" data-plan="monthly" type="button">Go Premium monthly</button>
    </div>
    <div class="offer best">
      <div class="ribbon">Best value · save ${yearlySavingPct}%</div>
      <div class="offer-name">Premium yearly</div>
      <div class="offer-price">${eur(PRICES.yearly)}<span>/year</span></div>
      <div class="offer-sub">only ${eur(PRICES.yearly / 12)} a month · <s>${eur(yearlyFull)}</s></div>
      <ul>${PREMIUM_PERKS}<li>💰 <b>You save ${eur(yearlySaving)}</b> (${yearlySavingPct}% off): about 2 months free compared with monthly</li></ul>
      <button class="btn btn-accent" data-plan="yearly" type="button">Go Premium yearly</button>
    </div>
  </div>
  <p class="small muted center" style="margin:10px 0 0">Secure payment through Gumroad (cards, PayPal, Apple Pay, Google Pay), in a new tab. Prices include VAT where applicable.
    After paying, Gumroad shows and emails you a <b>license key</b>: paste it below to unlock your plan on any device.</p>
  <div class="notice after-pay" hidden>✅ Finished paying? Copy the <b>license key</b> from the Gumroad page or receipt email and paste it in the box below.</div>`;
}

export function wireOffers(root) {
  root.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', () => startCheckout(b.dataset.plan)));
}

/** The "Already paid? Paste your license key" form; wireCodeForm calls onDone(status) after a successful activation. */
export function codeFormHtml(id) {
  return `<form class="pw-code" id="${id}"><label for="${id}-in">Already paid? Paste your license key</label>
      <div style="display:flex;gap:8px"><input type="text" id="${id}-in" placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX" autocomplete="off"><button class="btn btn-ghost btn-sm" type="submit">Activate</button></div>
      <div id="${id}-msg" class="small"></div></form>`;
}

export function wireCodeForm(root, id, onDone) {
  root.querySelector(`#${id}`).addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = root.querySelector(`#${id}-msg`);
    try {
      const st = await activateCode(root.querySelector(`#${id}-in`).value);
      msg.innerHTML = `<span class="up">✅ Activated: ${activatedText(st)}.</span>`;
      document.dispatchEvent(new CustomEvent('fr-access-changed'));
      onDone?.(st);
    } catch (err) { msg.innerHTML = `<span class="down">${escapeHtml(err.message)}</span>`; }
  });
}

export function showPaywall() {
  let dlg = document.getElementById('paywall');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'paywall';
    dlg.className = 'paywall';
    document.body.appendChild(dlg);
  }
  dlg.innerHTML = `<button class="pw-close" type="button" aria-label="Close">✕</button>
    <h2 style="margin-top:0">You've used your ${FREE_LIMIT} free downloads 🎁</h2>
    <p class="muted" style="margin-top:0">To keep downloading financial statements, choose one of these options:</p>
    ${offersHtml()}
    ${codeFormHtml('pw-code')}`;
  wireOffers(dlg);
  dlg.querySelector('.pw-close').addEventListener('click', () => dlg.close());
  wireCodeForm(dlg, 'pw-code');
  dlg.showModal();
}
