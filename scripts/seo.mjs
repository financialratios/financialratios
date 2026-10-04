// Search-engine and social-sharing tags for every page, plus the sitemap. Run after adding or editing pages:
//   npm run seo
// For each page it writes, between <!-- seo --> markers in the <head>: the canonical address, Open Graph and
// Twitter tags (the preview shown when a link is shared) and structured data for Google. Titles and
// descriptions come from the page's own <title> and meta description. Safe to run again.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE } from '../public/js/config.js';

const PUB = resolve(fileURLToPath(new URL('../public', import.meta.url)));
const IMAGE = `${SITE.url}/img/og.png`;
const START = '<!-- seo -->', END = '<!-- /seo -->';

async function htmlFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'vendor') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await htmlFiles(p)));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out.sort();
}

const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const attr = (s) => s.replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, '&amp;').replace(/"/g, '&quot;');
const pick = (html, re) => (html.match(re)?.[1] || '').trim();
const lastChanged = (file) => {
  try { return execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { encoding: 'utf8' }).trim() || null; } catch { return null; }
};

const org = { '@type': 'Organization', name: SITE.name, url: SITE.url, logo: `${SITE.url}/img/logo.png` };

function structuredData(path, title, description, h1, modified) {
  if (path === '/') {
    return [{ '@context': 'https://schema.org', '@type': 'WebSite', name: SITE.name, url: `${SITE.url}/`, description, publisher: org }];
  }
  if (path.startsWith('/learn/') && path !== '/learn/') {
    return [{ '@context': 'https://schema.org', '@type': 'Article', headline: h1 || title, description, url: SITE.url + path,
      image: IMAGE, author: org, publisher: org, ...(modified ? { dateModified: modified } : {}) }];
  }
  if (path.startsWith('/calculators/') && path !== '/calculators/') {
    return [{ '@context': 'https://schema.org', '@type': 'WebApplication', name: h1 || title, description, url: SITE.url + path,
      applicationCategory: 'FinanceApplication', operatingSystem: 'Any', offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' } }];
  }
  return [];
}

const urls = [];
for (const file of await htmlFiles(PUB)) {
  const rel = relative(PUB, file).split(sep).join('/');
  const path = `/${rel}`.replace(/(^|\/)index\.html$/, '$1');
  let html = await readFile(file, 'utf8');
  html = html.replace(new RegExp(`\\s*${START}[\\s\\S]*?${END}`), '');
  // Older hand-written sharing tags are replaced by the generated ones.
  html = html.replace(/\n\s*<meta property="og:[^>]*>/g, '');

  const title = unescape(pick(html, /<title>([^<]*)<\/title>/));
  const description = unescape(pick(html, /<meta name="description" content="([^"]*)"/));
  const h1 = unescape(pick(html, /<h1[^>]*>([\s\S]*?)<\/h1>/).replace(/<[^>]+>/g, '').replace(/\s+/g, ' '));
  const modified = lastChanged(file);
  const is404 = rel === '404.html';

  const tags = is404 ? ['<meta name="robots" content="noindex">'] : [
    `<link rel="canonical" href="${SITE.url}${path}">`,
    `<meta property="og:type" content="${path.startsWith('/learn/') && path !== '/learn/' ? 'article' : 'website'}">`,
    `<meta property="og:site_name" content="${SITE.name}">`,
    `<meta property="og:title" content="${attr(title)}">`,
    `<meta property="og:description" content="${attr(description)}">`,
    `<meta property="og:url" content="${SITE.url}${path}">`,
    `<meta property="og:image" content="${IMAGE}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta name="twitter:card" content="summary_large_image">',
    ...structuredData(path, title, description, h1, modified)
      .map((d) => `<script type="application/ld+json">${JSON.stringify(d).replace(/</g, '\\u003c')}</script>`),
  ];
  const block = `${START}\n  ${tags.join('\n  ')}\n  ${END}`;
  html = html.replace(/(\s*)(<link rel="stylesheet")/, `$1${block}$1$2`);
  await writeFile(file, html);
  if (!is404) urls.push([path, modified]);
}

// Most important pages first: home, then lessons, calculators and the analyzer.
const rank = (p) => (p === '/' ? 0 : p.startsWith('/learn/') ? 1 : p.startsWith('/calculators/') ? 2 : p.startsWith('/analyze/') ? 3 : 4);
urls.sort((a, b) => rank(a[0]) - rank(b[0]) || (a[0].endsWith('/') ? -1 : 0) - (b[0].endsWith('/') ? -1 : 0) || a[0].localeCompare(b[0]));
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([p, d]) => `  <url><loc>${SITE.url}${p}</loc>${d ? `<lastmod>${d}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
await writeFile(join(PUB, 'sitemap.xml'), sitemap);
console.log(`Done: SEO tags on ${urls.length + 1} pages, sitemap with ${urls.length} addresses.`);
