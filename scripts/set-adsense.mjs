// Connect the site to your Google AdSense account in one step:
//   npm run set-adsense -- ca-pub-1234567890123456
// It writes your publisher ID into js/config.js, adds Google's verification tag + ad script to the
// <head> of every page, and fills in ads.txt. Safe to run again with a different ID.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const id = (process.argv[2] || '').trim();
if (!/^ca-pub-\d{10,20}$/.test(id)) {
  console.error('Please give your AdSense publisher ID, for example:\n  npm run set-adsense -- ca-pub-1234567890123456');
  process.exit(1);
}
const PUB = resolve(fileURLToPath(new URL('../public', import.meta.url)));

async function htmlFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'vendor') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await htmlFiles(p)));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const TAG_START = '<!-- adsense -->', TAG_END = '<!-- /adsense -->';
const tags = `${TAG_START}
  <meta name="google-adsense-account" content="${id}">
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${id}" crossorigin="anonymous"></script>
  ${TAG_END}`;

let count = 0;
for (const file of await htmlFiles(PUB)) {
  let html = await readFile(file, 'utf8');
  const re = new RegExp(`${TAG_START}[\\s\\S]*?${TAG_END}`);
  html = re.test(html) ? html.replace(re, tags) : html.replace('</head>', `  ${tags}\n</head>`);
  await writeFile(file, html);
  count++;
}

const cfgPath = join(PUB, 'js', 'config.js');
const cfg = await readFile(cfgPath, 'utf8');
await writeFile(cfgPath, cfg.replace(/adsenseClient: '[^']*'/, `adsenseClient: '${id}'`));
await writeFile(join(PUB, 'ads.txt'), `google.com, ${id.replace('ca-', '')}, DIRECT, f08c47fec0942fa0\n`);

console.log(`Done: AdSense ${id} added to ${count} pages, js/config.js and ads.txt.`);
console.log('Next: commit and push, wait for the site to redeploy, then click "Verify" in AdSense.');
