// Netlify adapter: every request to /api/* runs the shared data API.
import { handleApi } from '../../server/core.mjs';

export default async (request) => {
  const out = await handleApi(new URL(request.url), process.env);
  return new Response(out.body, { status: out.status, headers: out.headers });
};

export const config = { path: '/api/*' };
