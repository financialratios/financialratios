// Netlify adapter: every request to /api/* runs the shared data API.
import { handleApi } from '../../server/core.mjs';

export default async (request, context) => {
  const method = request.method;
  const body = method === 'POST' ? await request.text() : undefined;
  const out = await handleApi(new URL(request.url), { ...process.env, FR_ON_NETLIFY: '1' }, { method, body, ip: context?.ip, headers: { 'stripe-signature': request.headers.get('stripe-signature') } });
  return new Response(out.body, { status: out.status, headers: out.headers });
};

export const config = { path: '/api/*' };
