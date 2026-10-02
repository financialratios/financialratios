// The whole data API in one place. Netlify, Vercel and the local dev server all call handleApi().
//
//   GET /api/search?q=apple      -> { results: [{ symbol, name, exchange }] }
//   GET /api/company?symbol=AAPL -> normalized company (see normalize.mjs)
//   GET /api/prices?symbol=AAPL  -> { dates: [...], close: [...] } daily since listing
//
// Data source: Financial Modeling Prep when FMP_API_KEY is set; otherwise free mode:
// SEC EDGAR statements for US filers, Yahoo Finance for prices, profiles and non-US companies. The symbol DEMO always returns a fictional sample company.
import { fmpCompany, fmpPrices, fmpSearch } from './providers/fmp.mjs';
import { secCompany, secSearch } from './providers/sec.mjs';
import { yahooChart, yahooCompany, yahooFx, yahooProfile, yahooSearch } from './providers/yahoo.mjs';
import { demoCompany, demoPrices } from './demo.mjs';

const SYMBOL_RE = /^[A-Za-z0-9.\-^=]{1,20}$/;
const cache = new Map();
const CACHE_MS = 30 * 60 * 1000;

async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return value;
}

function config(env) {
  return {
    fmpKey: env.FMP_API_KEY || '',
    secUA: env.SEC_USER_AGENT || 'FinancialRat (set SEC_USER_AGENT to "Your Name your@email.com")',
  };
}

const isUsTicker = (s) => /^[A-Z][A-Z0-9-]{0,6}$/.test(s) && !s.includes('.');

async function getCompany(symbol, cfg) {
  if (symbol === 'DEMO') return demoCompany();
  let company;
  if (cfg.fmpKey) {
    company = await fmpCompany(symbol, cfg.fmpKey).catch((e) => (isUsTicker(symbol) ? Promise.reject(e) : null));
  }
  if (!company) company = await freeCompany(symbol, cfg);
  return addFx(company);
}

/** Free mode: US companies from the SEC (10 years), others from Yahoo (usually 4 years). */
async function freeCompany(symbol, cfg) {
  if (isUsTicker(symbol)) {
    try {
      const [company, prof, chart] = await Promise.all([
        secCompany(symbol, cfg.secUA),
        yahooProfile(symbol).catch(() => null),
        yahooChart(symbol, { range: '5d' }).catch(() => null),
      ]);
      const p = company.profile;
      company.reportingCurrency = p.currency;
      if (prof) {
        Object.assign(p, {
          description: prof.description || p.description, sector: prof.sector || p.sector, industry: prof.industry || p.industry,
          country: prof.country || p.country, website: prof.website || p.website, employees: prof.employees || p.employees,
          exchange: prof.exchange || p.exchange,
        });
      }
      p.currency = prof?.currency || chart?.meta.currency || 'USD';
      p.ipoDate = p.ipoDate || chart?.meta.firstTradeDate || null;
      const price = prof?.price ?? chart?.meta.price ?? null;
      // Yahoo's market value is preferred: it handles share classes and ADRs correctly.
      const marketCap = prof?.marketCap ?? (p.sharesOutstanding && price ? p.sharesOutstanding * price : null);
      if (prof?.marketCap && price) p.sharesOutstanding = prof.marketCap / price;
      company.quote = {
        price, change: prof?.change ?? chart?.meta.change ?? null, changePercent: prof?.changePercent ?? chart?.meta.changePercent ?? null,
        marketCap, asOf: new Date().toISOString(),
      };
      company.segments = company.segments || { product: null, geographic: null };
      return company;
    } catch (err) {
      if (err.status !== 404) throw err; // not an SEC filer: try Yahoo below
    }
  }
  return yahooCompany(symbol);
}

/** When statements and share price use different currencies, record the exchange rate. */
async function addFx(company) {
  const rep = company.reportingCurrency || company.profile.currency;
  company.reportingCurrency = rep;
  company.fx = 1;
  if (rep && company.profile.currency && rep !== company.profile.currency) {
    company.fx = await yahooFx(rep, company.profile.currency).catch(() => null);
  }
  return company;
}

async function getPrices(symbol, cfg) {
  if (symbol === 'DEMO') return demoPrices();
  if (cfg.fmpKey) {
    const p = await fmpPrices(symbol, cfg.fmpKey).catch(() => null);
    if (p?.dates.length) return p;
  }
  const c = await yahooChart(symbol, { range: 'max' });
  return { source: 'Yahoo Finance', dates: c.dates, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
}

async function search(q, cfg) {
  const [primary, world] = await Promise.all([
    (cfg.fmpKey ? fmpSearch(q, cfg.fmpKey) : secSearch(q, cfg.secUA)).catch(() => []),
    yahooSearch(q).catch(() => []),
  ]);
  const seen = new Set();
  const results = [...primary.slice(0, 5), ...world, ...primary.slice(5)]
    .filter((r) => r.symbol && !seen.has(r.symbol) && seen.add(r.symbol))
    .slice(0, 10);
  if ('DEMO'.startsWith(q.toUpperCase())) results.unshift({ symbol: 'DEMO', name: 'Rat Industries (sample company)', exchange: 'Demo' });
  return { results };
}

function json(status, body, maxAge = 0) {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge ? `public, max-age=300, s-maxage=${maxAge}` : 'no-store',
    },
    body: JSON.stringify(body),
  };
}

/** @param {URL} url  @param {Record<string,string|undefined>} env */
export async function handleApi(url, env = process.env) {
  const cfg = config(env);
  const route = url.pathname.replace(/\/+$/, '').split('/').pop();
  try {
    if (route === 'search') {
      const q = (url.searchParams.get('q') || '').trim();
      if (!q || q.length > 40) return json(400, { error: 'Type a ticker or company name.' });
      return json(200, await cached(`s:${q.toLowerCase()}`, () => search(q, cfg)), 86400);
    }
    if (route === 'company' || route === 'prices') {
      const symbol = (url.searchParams.get('symbol') || '').trim().toUpperCase();
      if (!SYMBOL_RE.test(symbol)) return json(400, { error: 'That does not look like a ticker symbol (for example AAPL or MSFT).' });
      const fn = route === 'company' ? getCompany : getPrices;
      return json(200, await cached(`${route}:${symbol}`, () => fn(symbol, cfg)), 3600);
    }
    if (route === 'status') {
      return json(200, { provider: cfg.fmpKey ? 'Financial Modeling Prep' : 'Free mode: SEC EDGAR + Yahoo Finance' });
    }
    return json(404, { error: 'Unknown API route.' });
  } catch (err) {
    const status = err.status || 502;
    return json(status, {
      error: status === 404
        ? `We could not find that company. ${err.message}`
        : `The data provider did not answer (${err.message}). Please try again in a minute.`,
    });
  }
}
