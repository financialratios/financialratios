// Paid downloads and Premium, sold through Gumroad (Gumroad takes the payment, handles VAT
// and emails the buyer a license key). The license key is the buyer's access code: this
// server asks Gumroad's license API what a key allows, so no secret keys are needed.
//
// Setup: create 3 products on Gumroad with "Generate a unique license key per sale" switched on,
// then paste each product's link and product ID into `gumroad` in public/js/config.js.
//
//   pack5    one-time  €0.99         → 5 downloads (counted with Gumroad's license "uses")
//   monthly  membership €4.99 / month → unlimited while the membership is active
//   yearly   membership €49.99 / year → unlimited while the membership is active
//
// Optional thank-you email (personal, starts with the buyer's name): set RESEND_API_KEY and
// EMAIL_FROM on Netlify and add https://YOUR-DOMAIN/api/gumroad-ping as the Ping URL in
// Gumroad → Settings → Advanced.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { SITE } from '../public/js/config.js';

export const PLANS = {
  pack5: { label: '5 extra downloads', price: '€0.99', credits: 5 },
  monthly: { label: 'Premium — monthly', price: '€4.99 / month' },
  yearly: { label: 'Premium — yearly', price: '€49.99 / year' },
};

const products = (cfg = SITE.gumroad || {}) => Object.fromEntries(Object.keys(PLANS)
  .map((plan) => [plan, String(cfg[plan]?.productId || '').trim()]).filter(([, id]) => id));

// ---------- storage (same approach as reviews): remembers which product a key belongs to ----------
let storePromise = null;
export function setLicenseStoreForTests(store) { storePromise = Promise.resolve(store); }
function fileStore(path = '.data/licenses.json') {
  let cache = null;
  const load = async () => (cache ??= JSON.parse(await readFile(path, 'utf8').catch(() => '{}')));
  const save = async () => { await mkdir('.data', { recursive: true }); await writeFile(path, JSON.stringify(cache, null, 1)); };
  return { get: async (k) => (await load())[k] ?? null, set: async (k, v) => { (await load())[k] = v; await save(); } };
}
async function getStore(env) {
  storePromise ??= (async () => {
    if (env.FR_ON_NETLIFY || env.NETLIFY_BLOBS_CONTEXT || env.NETLIFY) {
      try {
        const { getStore: gs } = await import('@netlify/blobs');
        const s = gs({ name: 'licenses', consistency: 'strong' });
        return { get: (k) => s.get(k, { type: 'json' }), set: (k, v) => s.setJSON(k, v) };
      } catch { /* fall back */ }
    }
    return fileStore();
  })();
  return storePromise;
}

// ---------- Gumroad license API ----------
async function verifyKey(productId, key, { increment = false, fetchImpl = fetch } = {}) {
  const res = await fetchImpl('https://api.gumroad.com/v2/licenses/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ product_id: productId, license_key: key, increment_uses_count: String(increment) }).toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 404 || json.success === false) return null; // not a key of this product
  if (!res.ok) throw Object.assign(new Error('Gumroad could not be reached. Please try again in a minute.'), { status: 502 });
  return json;
}

/** What a verified Gumroad license allows. */
export function licenseStatus(plan, data) {
  const p = data?.purchase || {};
  const revoked = !!(p.refunded || p.chargebacked || (p.disputed && !p.dispute_won));
  if (plan === 'pack5') {
    const credits = revoked ? 0 : Math.max(0, PLANS.pack5.credits * (p.quantity || 1) - (data?.uses || 0));
    return { valid: true, plan: 'pack', credits, unlimited: false };
  }
  // A cancelled membership keeps working until the paid period ends (Gumroad then sets ended_at).
  const active = !revoked && !p.subscription_ended_at && !p.subscription_failed_at;
  return { valid: true, plan, unlimited: active, active };
}

const cleanKey = (k) => String(k || '').trim().toUpperCase();
const keyShape = (k) => /^[A-Z0-9][A-Z0-9-]{7,63}$/.test(k);

/** Find which of our products a key belongs to (remembered after the first time). */
async function findLicense(env, ids, key, { increment = false, fetchImpl } = {}) {
  const store = await getStore(env);
  const known = await store.get(`key:${key}`);
  const order = known && ids[known.plan] ? [known.plan, ...Object.keys(ids).filter((p) => p !== known.plan)] : Object.keys(ids);
  for (const plan of order) {
    // Only pack downloads use up the key; checking a membership never does.
    const data = await verifyKey(ids[plan], key, { increment: increment && plan === 'pack5', fetchImpl });
    if (data) {
      if (!known || known.plan !== plan) await store.set(`key:${key}`, { plan });
      return { plan, data };
    }
  }
  return null;
}

// ---------- email ----------
export function thankYouEmail({ name, plan, code, siteUrl }) {
  const first = (name || '').trim().split(/\s+/)[0] || 'there';
  const what = plan === 'pack5' ? '5 extra downloads' : plan === 'yearly' ? 'Financial Rat Premium (yearly)' : 'Financial Rat Premium (monthly)';
  const subject = `Thank you, ${first}! Your ${plan === 'pack5' ? 'downloads are' : 'Premium is'} ready`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#0f1b2d;max-width:560px">
  <p>Dear ${first},</p>
  <p>Thank you for your trust in <b>Financial Rat</b>. Your purchase of <b>${what}</b> is active.</p>
  <p>Your personal license key (access code) is:<br><span style="font-size:18px;font-weight:bold;letter-spacing:1px;color:#0e9f6e">${code}</span><br>
  Keep it safe: enter it on <a href="${siteUrl}/premium.html">${siteUrl}/premium.html</a> to unlock your downloads on any device.</p>
  <p>Financial Rat is built together with its users, so your opinion matters a lot to us:</p>
  <ul><li><b>How are you finding the website?</b> We would be grateful for a short review: <a href="${siteUrl}/reviews.html">${siteUrl}/reviews.html</a></li>
  <li><b>What should we change or add?</b> Simply reply to this email. We read every message.</li></ul>
  <p>Thank you again, and happy investing!<br>The Financial Rat team<br><i style="color:#0e9f6e">Finance For All, All For Finance</i></p></div>`;
  return { subject, html };
}

async function sendEmail(env, { to, subject, html }, fetchImpl = fetch) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !to) return false;
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html, reply_to: env.EMAIL_REPLY_TO || undefined }),
  });
  return res.ok;
}

/** The buyer's name from a Gumroad ping: the full name, or a checkout field called "Name"/"First name". */
function nameFromPing(p) {
  for (const k of ['full_name', 'First name', 'first_name', 'Name', 'name', 'Your name', 'custom_fields[Name]', 'custom_fields[First name]']) {
    if (p.get(k)) return p.get(k);
  }
  return '';
}

// ---------- API ----------
export async function handlePayments(route, { method, url, body, env, fetchImpl = fetch, gumroad = SITE.gumroad }) {
  const ids = products(gumroad);
  const configured = Object.keys(ids).length > 0;

  if (route === 'license') { // GET ?code=  → what this license key allows
    const key = cleanKey(url.searchParams.get('code'));
    if (!configured) return [503, { error: 'Payments are not switched on yet.' }];
    const found = keyShape(key) ? await findLicense(env, ids, key, { fetchImpl }) : null;
    if (!found) return [404, { error: 'This license key was not found. Copy it exactly as shown in your Gumroad receipt.' }];
    return [200, { code: key, ...licenseStatus(found.plan, found.data) }];
  }

  if (route === 'download' && method === 'POST') { // use one download from a paid key
    let input = {};
    try { input = JSON.parse(body || '{}'); } catch { /* empty */ }
    const key = cleanKey(input.code);
    const found = keyShape(key) ? await findLicense(env, ids, key, { increment: true, fetchImpl }) : null;
    if (!found) return [404, { error: 'License key not found.' }];
    const st = licenseStatus(found.plan, found.data);
    if (st.unlimited) return [200, { ok: true, ...st }];
    if (found.plan === 'pack5') {
      // The use was just counted; it is allowed if it was within the 5 bought.
      const allowed = PLANS.pack5.credits * (found.data.purchase?.quantity || 1);
      if ((found.data.uses || 0) <= allowed && !found.data.purchase?.refunded) return [200, { ok: true, ...st }];
      return [402, { ok: false, ...st, credits: 0, error: 'No downloads left on this license key.' }];
    }
    return [402, { ok: false, ...st, error: 'Your Premium membership is not active.' }];
  }

  if (route === 'gumroad-ping' && method === 'POST') { // Gumroad tells us about a sale → personal thank-you email
    const p = new URLSearchParams(body || '');
    const key = cleanKey(p.get('license_key'));
    const plan = Object.entries(ids).find(([, id]) => id && id === p.get('product_id'))?.[0];
    if (!plan || !keyShape(key) || p.get('is_recurring_charge') === 'true') return [200, { ok: true, skipped: true }];
    // Never trust the ping alone: ask Gumroad whether this sale is real and use the email it reports.
    const data = await verifyKey(p.get('product_id'), key, { fetchImpl });
    if (!data) return [200, { ok: true, skipped: true }];
    const store = await getStore(env);
    if (await store.get(`mailed:${key}`)) return [200, { ok: true, duplicate: true }];
    await store.set(`key:${key}`, { plan });
    const mail = thankYouEmail({ name: nameFromPing(p), plan, code: key, siteUrl: env.SITE_URL || SITE.url });
    const sent = await sendEmail(env, { to: data.purchase?.email, ...mail }, fetchImpl).catch(() => false);
    if (sent) await store.set(`mailed:${key}`, { at: new Date().toISOString() });
    return [200, { ok: true, emailed: sent }];
  }

  if (route === 'plans') return [200, { configured, plans: PLANS }];
  return [404, { error: 'Unknown route.' }];
}
