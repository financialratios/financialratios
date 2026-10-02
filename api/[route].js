// Vercel adapter: /api/search, /api/company, /api/prices, /api/status.
import { handleApi } from '../server/core.mjs';

export async function GET(request) {
  const out = await handleApi(new URL(request.url), process.env);
  return new Response(out.body, { status: out.status, headers: out.headers });
}
