// Vercel adapter: /api/search, /api/company, /api/prices, /api/reviews, /api/status.
// (Reviews are only stored permanently on Netlify; on Vercel they would need a database.)
import { handleApi } from '../server/core.mjs';

async function handle(request) {
  const method = request.method;
  const body = method === 'POST' ? await request.text() : undefined;
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const out = await handleApi(new URL(request.url), process.env, { method, body, ip });
  return new Response(out.body, { status: out.status, headers: out.headers });
}

export const GET = handle;
export const POST = handle;
