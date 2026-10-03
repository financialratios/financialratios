// Download allowance: 3 free downloads per browser, then a 5-download pack or Premium (unlimited).
// Paid access is tied to an access code (RAT-XXXX-XXXX-XXXX) checked by the server.
import { escapeHtml } from './lib/format.js';

export const FREE_LIMIT = 3;
const K_USED = 'fr-free-downloads-used', K_CODE = 'fr-access-code';
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage blocked */ } };

export const PRICES = { pack: 0.99, monthly: 4.99, yearly: 49.99 };
const yearlySaving = PRICES.monthly * 12 - PRICES.yearly; // 9.89
const yearlySavingPct = Math.round((yearlySaving / (PRICES.monthly * 12)) * 100); // 17%

let license = null; // { plan, credits, unlimited, ... } from the server
export const freeLeft = () => Math.max(0, FREE_LIMIT - Number(get(K_USED) || 0));
export const savedCode = () => get(K_CODE);

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

export function saveCode(code) { set(K_CODE, code); }

/** Text for the small counter under the download button. */
export function quotaText() {
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

export async function startCheckout(plan, btn) {
  const label = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Opening secure payment…'; }
  try {
    const res = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error);
    location.href = body.url;
  } catch (e) {
    alert(e.message || 'Payment could not be started. Please try again.');
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

/** The three offers, shared by the paywall and the Premium page. */
export function offersHtml() {
  return `<div class="offers">
    <div class="offer">
      <div class="offer-name">Download pack</div>
      <div class="offer-price">€${PRICES.pack.toFixed(2)}</div>
      <div class="offer-sub">one-time payment</div>
      <ul><li>✅ <b>5 more downloads</b> (Excel or PDF)</li><li>✅ Any company, worldwide</li><li>✅ No subscription</li></ul>
      <button class="btn btn-ghost" data-plan="pack5" type="button">Buy 5 downloads</button>
    </div>
    <div class="offer">
      <div class="offer-name">Premium monthly</div>
      <div class="offer-price">€${PRICES.monthly.toFixed(2)}<span>/month</span></div>
      <div class="offer-sub">cancel anytime</div>
      <ul><li>⭐ <b>Unlimited downloads</b>: download as much as you want</li><li>✅ All 3 statements + ratios, 10 years</li><li>✅ Works on all your devices</li></ul>
      <button class="btn btn-primary" data-plan="monthly" type="button">Go Premium monthly</button>
    </div>
    <div class="offer best">
      <div class="ribbon">Best value · save ${yearlySavingPct}%</div>
      <div class="offer-name">Premium yearly</div>
      <div class="offer-price">€${PRICES.yearly.toFixed(2)}<span>/year</span></div>
      <div class="offer-sub">only €${(PRICES.yearly / 12).toFixed(2)} a month · <s>€${(PRICES.monthly * 12).toFixed(2)}</s></div>
      <ul><li>⭐ <b>Unlimited downloads</b>: download as much as you want</li><li>💰 <b>You save €${yearlySaving.toFixed(2)}</b>: almost 2 months free compared with monthly</li><li>✅ Works on all your devices</li></ul>
      <button class="btn btn-accent" data-plan="yearly" type="button">Go Premium yearly</button>
    </div>
  </div>
  <p class="small muted center" style="margin:10px 0 0">Secure payment by Stripe (cards, Apple Pay, Google Pay). Prices include VAT where applicable.
    After paying you get an access code by email to use on any device.</p>`;
}

export function wireOffers(root) {
  root.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', () => startCheckout(b.dataset.plan, b)));
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
    <form class="pw-code" id="pw-code"><label for="pw-code-in">Already paid? Enter your access code</label>
      <div style="display:flex;gap:8px"><input type="text" id="pw-code-in" placeholder="RAT-XXXX-XXXX-XXXX" autocomplete="off"><button class="btn btn-ghost btn-sm" type="submit">Activate</button></div>
      <div id="pw-code-msg" class="small"></div></form>`;
  wireOffers(dlg);
  dlg.querySelector('.pw-close').addEventListener('click', () => dlg.close());
  dlg.querySelector('#pw-code').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const st = await activateCode(dlg.querySelector('#pw-code-in').value);
      dlg.querySelector('#pw-code-msg').innerHTML = `<span class="up">✅ Activated: ${st.unlimited ? 'Premium, unlimited downloads' : `${st.credits} downloads available`}. You can download now.</span>`;
      document.dispatchEvent(new CustomEvent('fr-access-changed'));
    } catch (err) { dlg.querySelector('#pw-code-msg').innerHTML = `<span class="down">${escapeHtml(err.message)}</span>`; }
  });
  dlg.showModal();
}
