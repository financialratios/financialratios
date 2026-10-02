// The whole data API in one place. Netlify, Vercel and the local dev server all call handleApi().
//
//   GET /api/search?q=apple      -> { results: [{ symbol, name, exchange }] }
//   GET /api/company?symbol=AAPL -> normalized company (see normalize.mjs)
//   GET /api/prices?symbol=AAPL  -> { dates: [...], close: [...] } daily since listing
//
// Data source: Financial Modeling Prep when FMP_API_KEY is set, otherwise SEC EDGAR (statements)
// + Yahoo Finance (prices). The symbol DEMO always returns a fictional sample company.
import { fmpCompany, fmpPrices, fmpSearch } from './providers/fmp.mjs';
import { secCompany, secSearch } from './providers/sec.mjs';
import { yahooChart } from './providers/yahoo.mjs';
import { demoCompany, demoPrices } from './demo.mjs';

const SYMBOL_RE = /^[A-Za-z0-9.\-^=]{1,15}$/;
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

async function getCompany(symbol, cfg) {
  if (symbol === 'DEMO') return demoCompany();
  if (cfg.fmpKey) return fmpCompany(symbol, cfg.fmpKey);
  // Free mode: statements from the SEC, price from Yahoo.
  const [company, chart] = await Promise.all([
    secCompany(symbol, cfg.secUA),
    yahooChart(symbol, { range: '5d' }).catch(() => null),
  ]);
  if (chart) {
    const shares = company.profile.sharesOutstanding;
    company.quote = {
      price: chart.meta.price,
      change: chart.meta.change,
      changePercent: chart.meta.changePercent,
      marketCap: shares && chart.meta.price ? shares * chart.meta.price : null,
      asOf: new Date().toISOString(),
    };
    company.profile.exchange = company.profile.exchange || chart.meta.exchange;
  }
  return company;
}

async function getPrices(symbol, cfg) {
  if (symbol === 'DEMO') return demoPrices();
  if (cfg.fmpKey) return fmpPrices(symbol, cfg.fmpKey);
  const chart = await yahooChart(symbol, { range: 'max' });
  return { source: 'Yahoo Finance', dates: chart.dates, close: chart.close };
}

async function search(q, cfg) {
  const results = cfg.fmpKey ? await fmpSearch(q, cfg.fmpKey) : await secSearch(q, cfg.secUA);
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
      return json(200, { provider: cfg.fmpKey ? 'Financial Modeling Prep' : 'SEC EDGAR + Yahoo Finance (free mode)' });
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
