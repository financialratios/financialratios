// Local preview: `npm start`, then open http://localhost:3000
// Serves the files in /public and the /api routes, with no dependencies to install.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './core.mjs';

const ROOT = resolve(fileURLToPath(new URL('../public', import.meta.url)));
const PORT = Number(process.env.PORT) || 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json',
};

async function serveFile(path, res, status = 200) {
  const body = await readFile(path);
  res.writeHead(status, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' });
  res.end(body);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    let body = '';
    if (req.method === 'POST') for await (const chunk of req) { body += chunk; if (body.length > 20000) break; }
    const out = await handleApi(url, process.env, { method: req.method, body, ip: req.socket.remoteAddress });
    res.writeHead(out.status, out.headers);
    return res.end(out.body);
  }
  let path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
  if (!path.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try {
    const s = await stat(path).catch(() => null);
    if (s?.isDirectory()) path = join(path, 'index.html');
    else if (!s && !extname(path)) path += '.html';
    await serveFile(path, res);
  } catch {
    await serveFile(join(ROOT, '404.html'), res, 404).catch(() => { res.writeHead(404); res.end('Not found'); });
  }
}).listen(PORT, () => {
  console.log(`Financial Rat is running at http://localhost:${PORT}`);
  console.log(process.env.FMP_API_KEY ? 'Data: Financial Modeling Prep' : 'Data: free mode (SEC EDGAR + Yahoo). Try the ticker DEMO for sample data.');
});
