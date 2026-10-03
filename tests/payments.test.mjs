import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { handlePayments, setLicenseStoreForTests, verifyStripeSignature, thankYouEmail, licenseStatus } from '../server/payments.mjs';

const env = { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PRICE_PACK5: 'price_p', STRIPE_PRICE_MONTHLY: 'price_m', STRIPE_PRICE_YEARLY: 'price_y',
  STRIPE_WEBHOOK_SECRET: 'whsec_test', RESEND_API_KEY: 're_x', EMAIL_FROM: 'Financial Rat <hi@example.com>', SITE_URL: 'https://example.com' };

function memStore() { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, set: async (k, v) => { m.set(k, v); } }; }

function fakeStripe(sessions, sent) {
  return async (url, opts = {}) => {
    if (url.startsWith('https://api.resend.com')) { sent.push(JSON.parse(opts.body)); return { ok: true, json: async () => ({}) }; }
    const path = url.replace('https://api.stripe.com/v1/', '');
    if (path === 'checkout/sessions' && opts.method === 'POST') {
      const p = new URLSearchParams(opts.body);
      return { ok: true, json: async () => ({ id: 'cs_test_new', url: `https://checkout.stripe.com/pay/${p.get('mode')}/${p.get('line_items[0][price]')}` }) };
    }
    const id = path.split('/')[2].split('?')[0];
    return { ok: true, json: async () => sessions[id] };
  };
}

test('checkout creates the right Stripe page for each plan', async () => {
  setLicenseStoreForTests(memStore());
  const [s, b] = await handlePayments('checkout', { method: 'POST', url: new URL('https://example.com/api/checkout'), body: JSON.stringify({ plan: 'yearly' }), env, fetchImpl: fakeStripe({}, []) });
  assert.equal(s, 200);
  assert.match(b.url, /subscription\/price_y/);
  const [s2] = await handlePayments('checkout', { method: 'POST', url: new URL('https://example.com/api/checkout'), body: '{"plan":"x"}', env, fetchImpl: fakeStripe({}, []) });
  assert.equal(s2, 400);
  const [s3] = await handlePayments('checkout', { method: 'POST', url: new URL('https://example.com/api/checkout'), body: '{"plan":"pack5"}', env: {}, fetchImpl: fakeStripe({}, []) });
  assert.equal(s3, 503, 'not configured yet');
});

test('paying for 5 downloads: code issued once, personal email sent, credits count down', async () => {
  const store = memStore(); setLicenseStoreForTests(store);
  const sent = [];
  const sessions = { cs_test_1: { id: 'cs_test_1', status: 'complete', payment_status: 'paid', metadata: { plan: 'pack5' }, customer_details: { email: 'ana@example.com', name: 'Ana Popescu' } } };
  const fetchImpl = fakeStripe(sessions, sent);
  const url = new URL('https://example.com/api/claim?session_id=cs_test_1');
  const [s, b] = await handlePayments('claim', { method: 'GET', url, env, fetchImpl });
  assert.equal(s, 200);
  assert.match(b.code, /^RAT-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(b.credits, 5);
  const [, again] = await handlePayments('claim', { method: 'GET', url, env, fetchImpl });
  assert.equal(again.code, b.code, 'refreshing the success page does not create a second code');
  assert.equal(sent.length, 1);
  assert.match(sent[0].html, /^<div[^>]*>\s*<p>Dear Ana,<\/p>/, 'email starts with the first name');
  assert.match(sent[0].html, /reviews\.html/);
  assert.match(sent[0].html, new RegExp(b.code));
  for (let i = 4; i >= 0; i--) {
    const [ds, db] = await handlePayments('download', { method: 'POST', url, body: JSON.stringify({ code: b.code }), env });
    assert.equal(ds, 200); assert.equal(db.credits, i);
  }
  const [none] = await handlePayments('download', { method: 'POST', url, body: JSON.stringify({ code: b.code }), env });
  assert.equal(none, 402);
});

test('subscription: unlimited while active, webhook cancellation stops it, signatures checked', async () => {
  const store = memStore(); setLicenseStoreForTests(store);
  const future = Math.floor(Date.now() / 1000) + 30 * 86400;
  const sub = { id: 'sub_1', status: 'active', items: { data: [{ current_period_end: future }] } };
  const session = { id: 'cs_test_2', status: 'complete', payment_status: 'paid', metadata: { plan: 'monthly' }, customer_details: { email: 'ion@example.com', name: 'Ion' }, subscription: sub };
  const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: session } });
  const t = Math.floor(Date.now() / 1000);
  const sig = `t=${t},v1=${createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(`${t}.${payload}`).digest('hex')}`;
  assert.ok(verifyStripeSignature(payload, sig, env.STRIPE_WEBHOOK_SECRET));
  assert.ok(!verifyStripeSignature(payload + 'x', sig, env.STRIPE_WEBHOOK_SECRET));
  const [bad] = await handlePayments('stripe-webhook', { method: 'POST', url: new URL('https://e/api/stripe-webhook'), body: payload, headers: { 'stripe-signature': 't=1,v1=00' }, env, fetchImpl: fakeStripe({}, []) });
  assert.equal(bad, 400);
  const [ok] = await handlePayments('stripe-webhook', { method: 'POST', url: new URL('https://e/api/stripe-webhook'), body: payload, headers: { 'stripe-signature': sig }, env, fetchImpl: fakeStripe({}, []) });
  assert.equal(ok, 200);
  const code = (await store.get('session:cs_test_2')).code;
  const [, dl] = await handlePayments('download', { method: 'POST', url: new URL('https://e'), body: JSON.stringify({ code }), env });
  assert.equal(dl.unlimited, true);
  const cancel = JSON.stringify({ type: 'customer.subscription.deleted', data: { object: { ...sub, status: 'canceled' } } });
  const sig2 = `t=${t},v1=${createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(`${t}.${cancel}`).digest('hex')}`;
  await handlePayments('stripe-webhook', { method: 'POST', url: new URL('https://e'), body: cancel, headers: { 'stripe-signature': sig2 }, env });
  const [s402] = await handlePayments('download', { method: 'POST', url: new URL('https://e'), body: JSON.stringify({ code }), env });
  assert.equal(s402, 402);
});

test('thank-you email is personal and plan-specific', () => {
  const m = thankYouEmail({ name: 'Maria Ionescu', plan: 'yearly', code: 'RAT-AAAA-BBBB-CCCC', siteUrl: 'https://x' });
  assert.match(m.subject, /Thank you, Maria!/);
  assert.match(m.html, /Premium \(yearly\)/);
  assert.equal(licenseStatus(null).valid, false);
});
