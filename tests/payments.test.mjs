import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePayments, setLicenseStoreForTests, thankYouEmail, licenseStatus } from '../server/payments.mjs';

const gumroad = { pack5: { url: 'https://x.gumroad.com/l/pack', productId: 'P_PACK' }, monthly: { url: 'https://x.gumroad.com/l/m', productId: 'P_MONTH' }, yearly: { url: 'https://x.gumroad.com/l/y', productId: 'P_YEAR' } };
const env = { RESEND_API_KEY: 're_x', EMAIL_FROM: 'Financial Rat <hi@example.com>', SITE_URL: 'https://example.com' };
const PACK_KEY = 'AAAA1111-BBBB2222-CCCC3333-DDDD4444';
const SUB_KEY = 'EEEE5555-FFFF6666-0000AAAA-1111BBBB';

function memStore() { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, set: async (k, v) => { m.set(k, v); } }; }

/** A fake Gumroad license API (+ Resend). `licenses` maps "product:key" to { uses, purchase }. */
function fakeGumroad(licenses, sent = [], calls = []) {
  return async (url, opts = {}) => {
    if (url.startsWith('https://api.resend.com')) { sent.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => ({}) }; }
    const p = new URLSearchParams(opts.body);
    calls.push(`${p.get('product_id')}:${p.get('increment_uses_count')}`);
    const lic = licenses[`${p.get('product_id')}:${p.get('license_key')}`];
    if (!lic) return { ok: false, status: 404, json: async () => ({ success: false, message: 'That license does not exist for the provided product.' }) };
    if (p.get('increment_uses_count') === 'true') lic.uses += 1;
    return { ok: true, status: 200, json: async () => ({ success: true, uses: lic.uses, purchase: { ...lic.purchase } }) };
  };
}
const call = (route, { method = 'GET', query = '', body, fetchImpl, cfg = gumroad, e = env } = {}) =>
  handlePayments(route, { method, url: new URL(`https://example.com/api/${route}${query}`), body, env: e, fetchImpl, gumroad: cfg });

test('without Gumroad products, payments are off', async () => {
  setLicenseStoreForTests(memStore());
  const [s] = await call('license', { query: `?code=${PACK_KEY}`, cfg: { pack5: { url: '', productId: '' } }, fetchImpl: fakeGumroad({}) });
  assert.equal(s, 503);
});

test('a 5-download pack: key found, 5 downloads then refused', async () => {
  setLicenseStoreForTests(memStore());
  const calls = [];
  const fetchImpl = fakeGumroad({ [`P_PACK:${PACK_KEY}`]: { uses: 0, purchase: { email: 'ana@example.com', quantity: 1 } } }, [], calls);
  const [s, b] = await call('license', { query: `?code=${PACK_KEY.toLowerCase()}`, fetchImpl });
  assert.equal(s, 200);
  assert.deepEqual([b.plan, b.credits, b.unlimited], ['pack', 5, false]);
  for (let i = 0; i < 5; i++) {
    const [ds, db] = await call('download', { method: 'POST', body: JSON.stringify({ code: PACK_KEY }), fetchImpl });
    assert.equal(ds, 200, `download ${i + 1}`);
    assert.equal(db.credits, 4 - i);
  }
  const [last, lb] = await call('download', { method: 'POST', body: JSON.stringify({ code: PACK_KEY }), fetchImpl });
  assert.equal(last, 402);
  assert.equal(lb.credits, 0);
  // Remembered which product the key belongs to: no extra lookups on other products later.
  calls.length = 0;
  await call('license', { query: `?code=${PACK_KEY}`, fetchImpl });
  assert.deepEqual(calls, ['P_PACK:false']);
});

test('a membership is unlimited while active, never uses up the key, and stops when it ends', async () => {
  setLicenseStoreForTests(memStore());
  const lic = { uses: 0, purchase: { email: 'ana@example.com', recurrence: 'yearly', subscription_ended_at: null, subscription_cancelled_at: null, subscription_failed_at: null } };
  const fetchImpl = fakeGumroad({ [`P_YEAR:${SUB_KEY}`]: lic });
  const [s, b] = await call('license', { query: `?code=${SUB_KEY}`, fetchImpl });
  assert.equal(s, 200);
  assert.equal(b.plan, 'yearly');
  assert.equal(b.unlimited, true);
  const [ds] = await call('download', { method: 'POST', body: JSON.stringify({ code: SUB_KEY }), fetchImpl });
  assert.equal(ds, 200);
  assert.equal(lic.uses, 0, 'memberships are not counted');
  lic.purchase.subscription_cancelled_at = '2026-10-01'; // cancelled, but the paid year is not over
  assert.equal((await call('license', { query: `?code=${SUB_KEY}`, fetchImpl }))[1].unlimited, true);
  lic.purchase.subscription_ended_at = '2027-10-01';
  const [es, eb] = await call('download', { method: 'POST', body: JSON.stringify({ code: SUB_KEY }), fetchImpl });
  assert.equal(es, 402);
  assert.equal(eb.unlimited, false);
});

test('unknown or malformed keys are rejected', async () => {
  setLicenseStoreForTests(memStore());
  const fetchImpl = fakeGumroad({});
  assert.equal((await call('license', { query: '?code=NOPE0000-NOPE0000-NOPE0000-NOPE0000', fetchImpl }))[0], 404);
  assert.equal((await call('license', { query: '?code=<script>', fetchImpl }))[0], 404);
});

test('refunded packs give no downloads', () => {
  assert.equal(licenseStatus('pack5', { uses: 0, purchase: { refunded: true } }).credits, 0);
});

test('Gumroad ping: verified with Gumroad, personal email sent once, renewals skipped', async () => {
  setLicenseStoreForTests(memStore());
  const sent = [];
  const fetchImpl = fakeGumroad({ [`P_MONTH:${SUB_KEY}`]: { uses: 0, purchase: { email: 'ana@example.com' } } }, sent);
  const ping = (extra = {}) => new URLSearchParams({ product_id: 'P_MONTH', license_key: SUB_KEY, email: 'attacker@example.com', full_name: 'Ana Popescu', ...extra }).toString();
  const [s, b] = await call('gumroad-ping', { method: 'POST', body: ping(), fetchImpl });
  assert.equal(s, 200);
  assert.equal(b.emailed, true);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ['ana@example.com'], 'the address comes from Gumroad, not from the ping');
  assert.match(sent[0].html, /^<div[^>]*>\s*<p>Dear Ana,<\/p>/);
  assert.match(sent[0].html, /review/);
  assert.match(sent[0].html, new RegExp(SUB_KEY));
  await call('gumroad-ping', { method: 'POST', body: ping(), fetchImpl });
  await call('gumroad-ping', { method: 'POST', body: ping({ is_recurring_charge: 'true' }), fetchImpl });
  assert.equal(sent.length, 1, 'no duplicates, no email on renewals');
  // A fake ping for a key Gumroad does not know sends nothing.
  await call('gumroad-ping', { method: 'POST', body: ping({ license_key: 'FAKE0000-FAKE0000-FAKE0000-FAKE0000' }), fetchImpl });
  assert.equal(sent.length, 1);
});

test('thank-you email subject is personal', () => {
  assert.equal(thankYouEmail({ name: 'Ion', plan: 'yearly', code: 'X', siteUrl: '' }).subject, 'Thank you, Ion! Your Premium is ready');
});
