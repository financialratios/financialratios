// Paid downloads and Premium, with Stripe Checkout (cards never touch this server) and a
// thank-you email through Resend. Everything is configured with environment variables:
//
//   STRIPE_SECRET_KEY        sk_live_... (or sk_test_... while testing)
//   STRIPE_WEBHOOK_SECRET    whsec_...   (from the webhook you create in Stripe)
//   STRIPE_PRICE_PACK5       price_...   one-time  €0.99  → 5 extra downloads
//   STRIPE_PRICE_MONTHLY     price_...   recurring €4.99 / month → unlimited
//   STRIPE_PRICE_YEARLY      price_...   recurring €49.99 / year → unlimited
//   RESEND_API_KEY           re_...      (optional: thank-you emails)
//   EMAIL_FROM               "Financial Rat <hello@yourdomain.com>"
//   SITE_URL                 https://www.yourdomain.com
//
// A buyer receives an access code (shown after paying and in the email). The code is what unlocks
// downloads on any device. Codes are stored in Netlify Blobs (store "licenses").
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

export const PLANS = {
  pack5: { label: '5 extra downloads', price: '€0.99', mode: 'payment', env: 'STRIPE_PRICE_PACK5', credits: 5 },
  monthly: { label: 'Premium — monthly', price: '€4.99 / month', mode: 'subscription', env: 'STRIPE_PRICE_MONTHLY' },
  yearly: { label: 'Premium — yearly', price: '€49.99 / year', mode: 'subscription', env: 'STRIPE_PRICE_YEARLY' },
};

// ---------- storage (same approach as reviews) ----------
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

// ---------- Stripe REST helpers (no SDK needed) ----------
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v && typeof v === 'object') form(v, key, out);
    else if (v !== undefined && v !== null) out.append(key, String(v));
  }
  return out;
}
async function stripe(env, path, { method = 'GET', body, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: body ? form(body).toString() : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json.error?.message || `Stripe error ${res.status}`), { status: 502 });
  return json;
}

/** Verify Stripe's webhook signature (header "Stripe-Signature: t=...,v1=..."). */
export function verifyStripeSignature(rawBody, header, secret, toleranceSec = 300, now = Date.now()) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')).map(([k, ...v]) => [k, v.join('=')]));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const given = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  return given.some((g) => g.length === expected.length && timingSafeEqual(Buffer.from(g), Buffer.from(expected)));
}

const newCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  const b = randomBytes(12);
  const raw = [...b].map((x) => alphabet[x % alphabet.length]).join('');
  return `RAT-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
};

function periodEnd(sub) {
  return sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end ?? null;
}

export function licenseStatus(lic, now = Date.now()) {
  if (!lic) return { valid: false };
  if (lic.plan === 'monthly' || lic.plan === 'yearly') {
    const active = ['active', 'trialing', 'past_due'].includes(lic.status) && (!lic.periodEnd || lic.periodEnd * 1000 > now - 3 * 864e5);
    return { valid: true, plan: lic.plan, unlimited: active, active, renews: lic.periodEnd ? new Date(lic.periodEnd * 1000).toISOString().slice(0, 10) : null, name: lic.name };
  }
  return { valid: true, plan: 'pack', credits: lic.credits || 0, unlimited: false, name: lic.name };
}

// ---------- email ----------
export function thankYouEmail({ name, plan, code, siteUrl }) {
  const first = (name || '').trim().split(/\s+/)[0] || 'there';
  const what = plan === 'pack5' ? '5 extra downloads' : plan === 'yearly' ? 'Financial Rat Premium (yearly)' : 'Financial Rat Premium (monthly)';
  const subject = `Thank you, ${first}! Your ${plan === 'pack5' ? 'downloads are' : 'Premium is'} ready`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#0f1b2d;max-width:560px">
  <p>Dear ${first},</p>
  <p>Thank you for your trust in <b>Financial Rat</b>. Your purchase of <b>${what}</b> is active.</p>
  <p>Your personal access code is:<br><span style="font-size:22px;font-weight:bold;letter-spacing:2px;color:#0e9f6e">${code}</span><br>
  Keep it safe: enter it on <a href="${siteUrl}/premium.html">${siteUrl}/premium.html</a> to unlock your downloads on any other device.</p>
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

// ---------- fulfilment (shared by the success page and the webhook; safe to run twice) ----------
async function fulfil(env, session, fetchImpl) {
  const store = await getStore(env);
  const existing = await store.get(`session:${session.id}`);
  if (existing) return existing.code;
  if (session.payment_status !== 'paid' && session.status !== 'complete') throw Object.assign(new Error('This payment is not completed yet.'), { status: 402 });
  const plan = session.metadata?.plan;
  if (!PLANS[plan]) throw Object.assign(new Error('Unknown plan.'), { status: 400 });
  const code = newCode();
  const email = session.customer_details?.email || session.customer_email || '';
  const name = session.customer_details?.name || '';
  let sub = null;
  if (PLANS[plan].mode === 'subscription' && session.subscription) {
    sub = typeof session.subscription === 'object' ? session.subscription : await stripe(env, `subscriptions/${session.subscription}`, { fetchImpl });
  }
  const lic = {
    code, plan: plan === 'pack5' ? 'pack' : plan, credits: plan === 'pack5' ? PLANS.pack5.credits : 0, email, name,
    customer: session.customer || null, subscription: sub?.id || null, status: sub?.status || 'paid', periodEnd: periodEnd(sub),
    created: new Date().toISOString(),
  };
  await store.set(`lic:${code}`, lic);
  await store.set(`session:${session.id}`, { code });
  if (sub?.id) await store.set(`sub:${sub.id}`, { code });
  const mail = thankYouEmail({ name, plan, code, siteUrl: env.SITE_URL || '' });
  await sendEmail(env, { to: email, ...mail }, fetchImpl).catch(() => false);
  return code;
}

// ---------- API ----------
export async function handlePayments(route, { method, url, body, headers = {}, env, fetchImpl = fetch }) {
  const configured = !!(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_PACK5 && env.STRIPE_PRICE_MONTHLY && env.STRIPE_PRICE_YEARLY);
  const store = await getStore(env);

  if (route === 'license') { // GET ?code=  → what this code allows
    const code = (url.searchParams.get('code') || '').trim().toUpperCase();
    const lic = /^RAT-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code) ? await store.get(`lic:${code}`) : null;
    if (!lic) return [404, { error: 'This access code was not found. Check it for typos.' }];
    return [200, { code, ...licenseStatus(lic) }];
  }

  if (route === 'download' && method === 'POST') { // use one download from a paid code
    let input = {};
    try { input = JSON.parse(body || '{}'); } catch { /* empty */ }
    const code = String(input.code || '').trim().toUpperCase();
    const lic = code ? await store.get(`lic:${code}`) : null;
    if (!lic) return [404, { error: 'Access code not found.' }];
    const st = licenseStatus(lic);
    if (st.unlimited) return [200, { ok: true, ...st }];
    if (st.plan === 'pack' && lic.credits > 0) {
      lic.credits -= 1;
      await store.set(`lic:${code}`, lic);
      return [200, { ok: true, ...licenseStatus(lic) }];
    }
    return [402, { ok: false, ...st, error: st.plan === 'pack' ? 'No downloads left on this code.' : 'Your Premium subscription is not active.' }];
  }

  if (route === 'checkout' && method === 'POST') { // create a Stripe Checkout page
    if (!configured) return [503, { error: 'Payments are not switched on yet. Please try again soon.' }];
    let input = {};
    try { input = JSON.parse(body || '{}'); } catch { /* empty */ }
    const plan = PLANS[input.plan] ? input.plan : null;
    if (!plan) return [400, { error: 'Unknown plan.' }];
    const site = env.SITE_URL || `${url.protocol}//${url.host}`;
    const session = await stripe(env, 'checkout/sessions', {
      method: 'POST', fetchImpl,
      body: {
        mode: PLANS[plan].mode,
        line_items: { 0: { price: env[PLANS[plan].env], quantity: 1 } },
        success_url: `${site}/premium.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${site}/premium.html?cancelled=1`,
        allow_promotion_codes: 'true',
        billing_address_collection: 'auto',
        metadata: { plan },
        custom_text: { submit: { message: 'Digital content: your downloads are available immediately after payment, so you agree that the 14-day right of withdrawal ends once access starts. Subscriptions can be cancelled anytime.' } },
        ...(PLANS[plan].mode === 'payment' ? { customer_creation: 'always' } : { subscription_data: { metadata: { plan } } }),
      },
    });
    return [200, { url: session.url }];
  }

  if (route === 'claim') { // GET ?session_id=  → after paying, get the access code
    if (!configured) return [503, { error: 'Payments are not switched on.' }];
    const id = url.searchParams.get('session_id') || '';
    if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return [400, { error: 'Invalid payment reference.' }];
    const session = await stripe(env, `checkout/sessions/${id}?expand[]=subscription`, { fetchImpl });
    const code = await fulfil(env, session, fetchImpl);
    return [200, { code, ...licenseStatus(await store.get(`lic:${code}`)) }];
  }

  if (route === 'stripe-webhook' && method === 'POST') { // Stripe tells us about payments and renewals
    if (!verifyStripeSignature(body, headers['stripe-signature'], env.STRIPE_WEBHOOK_SECRET)) return [400, { error: 'Bad signature.' }];
    const event = JSON.parse(body);
    const obj = event.data?.object || {};
    if (event.type === 'checkout.session.completed') await fulfil(env, obj, fetchImpl);
    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const link = await store.get(`sub:${obj.id}`);
      const lic = link && (await store.get(`lic:${link.code}`));
      if (lic) {
        lic.status = event.type === 'customer.subscription.deleted' ? 'canceled' : obj.status;
        lic.periodEnd = periodEnd(obj) ?? lic.periodEnd;
        await store.set(`lic:${link.code}`, lic);
      }
    }
    return [200, { received: true }];
  }

  if (route === 'plans') return [200, { configured, plans: PLANS }];
  return [404, { error: 'Unknown route.' }];
}
