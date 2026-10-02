// Visitor reviews: GET lists them, POST adds one, DELETE removes one (owner only).
//
// Storage: Netlify Blobs (free, built into Netlify) when the site runs on Netlify.
// Anywhere else (your computer) reviews are kept in .data/reviews.json, or in memory if
// the disk is read-only. To delete a review, set the REVIEWS_ADMIN_TOKEN environment
// variable on Netlify to a secret word, then open:
//   https://your-site/api/reviews?delete=<review id>&token=<your secret word>
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const TOPICS = ['Whole website', 'Learn', 'Calculators', 'Company analysis', 'Idea or request'];
const MAX_LIST = 200;

// ---------- storage ----------
let storePromise = null;
export function setStoreForTests(store) { storePromise = Promise.resolve(store); }

function memoryStore() {
  const m = new Map();
  return {
    async list() { return [...m.keys()]; },
    async get(k) { return m.get(k) ?? null; },
    async set(k, v) { m.set(k, v); },
    async del(k) { m.delete(k); },
  };
}

function fileStore(path = '.data/reviews.json') {
  let cache = null;
  const load = async () => (cache ??= JSON.parse(await readFile(path, 'utf8').catch(() => '{}')));
  const save = async () => { await mkdir('.data', { recursive: true }); await writeFile(path, JSON.stringify(cache, null, 1)); };
  return {
    async list() { return Object.keys(await load()); },
    async get(k) { return (await load())[k] ?? null; },
    async set(k, v) { (await load())[k] = v; await save(); },
    async del(k) { delete (await load())[k]; await save(); },
  };
}

async function netlifyStore() {
  const { getStore } = await import('@netlify/blobs');
  const s = getStore({ name: 'reviews', consistency: 'strong' });
  return {
    async list() { return (await s.list()).blobs.map((b) => b.key); },
    async get(k) { return s.get(k, { type: 'json' }); },
    async set(k, v) { await s.setJSON(k, v); },
    async del(k) { await s.delete(k); },
  };
}

function getStore(env) {
  storePromise ??= (async () => {
    if (env.FR_ON_NETLIFY || env.NETLIFY_BLOBS_CONTEXT || env.NETLIFY) {
      try { return await netlifyStore(); } catch { /* fall through */ }
    }
    try {
      await mkdir('.data', { recursive: true });
      return fileStore();
    } catch {
      return memoryStore();
    }
  })();
  return storePromise;
}

// ---------- validation & spam protection ----------
const recent = new Map(); // ip -> timestamps (per server instance)
function rateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const list = (recent.get(ip) || []).filter((t) => now - t < 10 * 60e3);
  list.push(now);
  recent.set(ip, list);
  if (recent.size > 5000) recent.clear();
  return list.length > 3;
}

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').replace(/\s+\n/g, '\n').trim().slice(0, max);

export function validateReview(input) {
  if (input.website) return { error: 'Spam check failed.' }; // hidden "honeypot" field: only robots fill it in
  const name = clean(input.name, 40);
  const text = clean(input.text, 1200);
  const rating = Number(input.rating);
  const topic = TOPICS.includes(input.topic) ? input.topic : TOPICS[0];
  if (name.length < 2) return { error: 'Please write your name or a nickname (at least 2 letters).' };
  if (text.length < 10) return { error: 'Please write at least a short sentence (10 characters or more).' };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: 'Please choose from 1 to 5 stars.' };
  if (/https?:\/\/|www\.|<a\s/i.test(text + name)) return { error: 'Links are not allowed in reviews.' };
  return { review: { name, text, rating, topic } };
}

// ---------- API ----------
export async function handleReviews({ method, url, body, ip, env }) {
  const store = await getStore(env);
  if (method === 'GET' && url.searchParams.has('delete')) {
    const token = env.REVIEWS_ADMIN_TOKEN;
    if (!token || url.searchParams.get('token') !== token) return [403, { error: 'Not allowed.' }];
    await store.del(url.searchParams.get('delete'));
    return [200, { deleted: url.searchParams.get('delete') }];
  }
  if (method === 'GET') {
    const keys = (await store.list()).sort().reverse().slice(0, MAX_LIST);
    const reviews = (await Promise.all(keys.map((k) => store.get(k)))).filter(Boolean);
    const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;
    return [200, { reviews, count: reviews.length, average: avg, topics: TOPICS }];
  }
  if (method === 'POST') {
    let input;
    try { input = typeof body === 'string' ? JSON.parse(body || '{}') : body || {}; } catch { return [400, { error: 'Invalid request.' }]; }
    const { review, error } = validateReview(input);
    if (error) return [400, { error }];
    if (rateLimited(ip)) return [429, { error: 'Thank you! You have posted several reviews already; please try again later.' }];
    const at = new Date().toISOString();
    const id = `${at.replace(/[-:.TZ]/g, '')}-${Math.random().toString(36).slice(2, 8)}`;
    const saved = { id, ...review, date: at.slice(0, 10) };
    await store.set(id, saved);
    return [201, { review: saved }];
  }
  return [405, { error: 'Method not allowed.' }];
}
