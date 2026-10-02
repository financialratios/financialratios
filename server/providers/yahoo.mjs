// Free data from Yahoo Finance's public endpoints (no key). Used for:
//  - search across world exchanges (AAPL, 7203.T, SAP.DE, H2O.RO...)
//  - daily candles (open/high/low/close/volume) since listing
//  - company profile (description, sector, employees) and market value
//  - annual statements for companies outside the US SEC system (usually the last 4 years)
//  - exchange rates when a company reports in one currency but trades in another
// These endpoints are unofficial: Yahoo can change or rate-limit them, so every caller
// treats a failure as "not available" instead of breaking the page.
import { completeRows } from '../normalize.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const Q1 = 'https://query1.finance.yahoo.com';
const Q2 = 'https://query2.finance.yahoo.com';

function fail(message, status = 502) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function getJson(url, fetchImpl, headers = {}) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers } });
  if (!res.ok) throw fail(`Yahoo answered ${res.status}`, res.status === 404 ? 404 : 502);
  return res.json();
}

// ---------- session "crumb" needed by some endpoints ----------
let session = null;
async function getSession(fetchImpl) {
  if (session && Date.now() - session.at < 3600e3) return session;
  const r1 = await fetchImpl('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual' }).catch(() => null);
  const raw = r1?.headers?.getSetCookie?.() || [r1?.headers?.get?.('set-cookie') || ''];
  const cookie = raw.filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  const r2 = await fetchImpl(`${Q2}/v1/test/getcrumb`, { headers: { 'User-Agent': UA, Cookie: cookie } });
  const crumb = r2.ok ? (await r2.text()).trim() : '';
  if (!crumb || crumb.includes('<')) throw fail('Yahoo session not available');
  session = { at: Date.now(), cookie, crumb };
  return session;
}

async function withCrumb(url, fetchImpl) {
  try {
    const s = await getSession(fetchImpl);
    return await getJson(`${url}${url.includes('?') ? '&' : '?'}crumb=${encodeURIComponent(s.crumb)}`, fetchImpl, { Cookie: s.cookie });
  } catch {
    session = null;
    return getJson(url, fetchImpl); // some endpoints also answer without a crumb
  }
}

// ---------- prices ----------
export function parseChart(json) {
  const result = json?.chart?.result?.[0];
  if (!result) return null;
  const ts = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const r4 = (v) => Math.round(v * 10000) / 10000;
  const dates = [], open = [], high = [], low = [], close = [], volume = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close?.[i];
    if (typeof c !== 'number') continue;
    const o = typeof q.open?.[i] === 'number' ? q.open[i] : c;
    dates.push(new Date(ts[i] * 1000).toISOString().slice(0, 10));
    close.push(r4(c));
    open.push(r4(o));
    high.push(r4(typeof q.high?.[i] === 'number' ? q.high[i] : Math.max(o, c)));
    low.push(r4(typeof q.low?.[i] === 'number' ? q.low[i] : Math.min(o, c)));
    volume.push(typeof q.volume?.[i] === 'number' ? q.volume[i] : 0);
  }
  const m = result.meta || {};
  const price = m.regularMarketPrice ?? close[close.length - 1] ?? null;
  const prev = m.chartPreviousClose ?? m.previousClose ?? (close.length > 1 ? close[close.length - 2] : null);
  return {
    dates, open, high, low, close, volume,
    meta: {
      price,
      currency: m.currency || null,
      exchange: m.fullExchangeName || m.exchangeName || '',
      name: m.longName || m.shortName || '',
      firstTradeDate: m.firstTradeDate ? new Date(m.firstTradeDate * 1000).toISOString().slice(0, 10) : dates[0] || null,
      change: price != null && prev != null ? price - prev : null,
      changePercent: price != null && prev ? ((price - prev) / prev) * 100 : null,
    },
  };
}

export async function yahooChart(symbol, { range = 'max', fetchImpl = fetch } = {}) {
  const json = await getJson(`${Q1}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false&events=split`, fetchImpl);
  const parsed = parseChart(json);
  if (!parsed || !parsed.dates.length) throw fail(`No price history for "${symbol}"`, 404);
  return parsed;
}

/** How many units of `to` one unit of `from` buys (e.g. JPY -> USD = 0.0067). */
export async function yahooFx(from, to, fetchImpl = fetch) {
  if (!from || !to || from === to) return 1;
  const chart = await yahooChart(`${from}${to}=X`, { range: '5d', fetchImpl });
  return chart.meta.price;
}

// ---------- search ----------
export function parseSearch(json) {
  return (json?.quotes || [])
    .filter((q) => q.symbol && ['EQUITY', 'ETF'].includes(q.quoteType))
    .map((q) => ({ symbol: q.symbol, name: q.longname || q.shortname || q.symbol, exchange: q.exchDisp || q.exchange || '' }));
}

export async function yahooSearch(query, fetchImpl = fetch) {
  const json = await getJson(`${Q2}/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&listsCount=0&enableFuzzyQuery=true`, fetchImpl);
  return parseSearch(json);
}

// ---------- profile ----------
export function parseQuoteSummary(json) {
  const r = json?.quoteSummary?.result?.[0];
  if (!r) return null;
  const ap = r.assetProfile || r.summaryProfile || {};
  const pr = r.price || {};
  const raw = (v) => (v && typeof v === 'object' ? v.raw : v);
  return {
    name: pr.longName || pr.shortName || '',
    exchange: pr.exchangeName || '',
    currency: pr.currency || null,
    price: raw(pr.regularMarketPrice) ?? null,
    change: raw(pr.regularMarketChange) ?? null,
    changePercent: raw(pr.regularMarketChangePercent) != null ? raw(pr.regularMarketChangePercent) * 100 : null,
    marketCap: raw(pr.marketCap) ?? null,
    description: ap.longBusinessSummary || '',
    sector: ap.sector || '',
    industry: ap.industry || '',
    country: ap.country || '',
    website: ap.website || '',
    employees: ap.fullTimeEmployees || null,
    financialCurrency: r.financialData?.financialCurrency || null,
  };
}

export async function yahooProfile(symbol, fetchImpl = fetch) {
  const json = await withCrumb(`${Q2}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile,price,financialData`, fetchImpl);
  return parseQuoteSummary(json);
}

// ---------- annual statements (companies outside the SEC) ----------
const TS = {
  income: {
    revenue: 'TotalRevenue', costOfRevenue: 'CostOfRevenue', grossProfit: 'GrossProfit', researchAndDevelopment: 'ResearchAndDevelopment',
    sellingGeneralAdmin: 'SellingGeneralAndAdministration', operatingExpenses: 'OperatingExpense', operatingIncome: 'OperatingIncome',
    interestExpense: 'InterestExpense', pretaxIncome: 'PretaxIncome', incomeTax: 'TaxProvision', netIncome: 'NetIncomeCommonStockholders',
    depreciationAmortization: 'ReconciledDepreciation', ebitda: 'EBITDA', eps: 'BasicEPS', epsDiluted: 'DilutedEPS', sharesDiluted: 'DilutedAverageShares',
  },
  balance: {
    cash: 'CashAndCashEquivalents', shortTermInvestments: 'OtherShortTermInvestments', receivables: 'AccountsReceivable', inventory: 'Inventory',
    totalCurrentAssets: 'CurrentAssets', propertyPlantEquipment: 'NetPPE', goodwillIntangibles: 'GoodwillAndOtherIntangibleAssets', totalAssets: 'TotalAssets',
    accountsPayable: 'AccountsPayable', shortTermDebt: 'CurrentDebt', totalCurrentLiabilities: 'CurrentLiabilities', longTermDebt: 'LongTermDebt',
    totalLiabilities: 'TotalLiabilitiesNetMinorityInterest', totalEquity: 'StockholdersEquity', totalDebt: 'TotalDebt',
  },
  cashflow: {
    depreciationAmortization: 'DepreciationAndAmortization', stockBasedCompensation: 'StockBasedCompensation', operatingCashFlow: 'OperatingCashFlow',
    capitalExpenditure: 'CapitalExpenditure', investingCashFlow: 'InvestingCashFlow', dividendsPaid: 'CashDividendsPaid', shareBuybacks: 'RepurchaseOfCapitalStock',
    financingCashFlow: 'FinancingCashFlow', netChangeInCash: 'ChangesInCash', freeCashFlow: 'FreeCashFlow', netIncome: 'NetIncomeFromContinuingOperations',
  },
};

export function parseTimeseries(json) {
  const byType = {};
  let currency = null;
  for (const r of json?.timeseries?.result || []) {
    const type = r.meta?.type?.[0];
    if (!type) continue;
    for (const pt of r[type] || []) {
      if (!pt?.asOfDate || pt.reportedValue?.raw == null) continue;
      (byType[type.replace(/^annual/, '')] ||= {})[pt.asOfDate] = pt.reportedValue.raw;
      currency ||= pt.currencyCode || null;
    }
  }
  const dates = [...new Set(Object.values(byType).flatMap((m) => Object.keys(m)))].sort();
  const build = (map) => dates.map((date) => {
    const row = { fiscalYear: Number(date.slice(0, 4)) - (date.slice(5, 7) === '01' && Number(date.slice(8, 10)) <= 7 ? 1 : 0), date };
    for (const [field, t] of Object.entries(map)) row[field] = byType[t]?.[date] ?? null;
    return row;
  }).filter((row) => Object.keys(map).some((f) => row[f] != null));
  return { currency, income: build(TS.income), balance: build(TS.balance), cashflow: build(TS.cashflow) };
}

export async function yahooFundamentals(symbol, fetchImpl = fetch) {
  const types = Object.values(TS).flatMap((m) => Object.values(m)).map((t) => `annual${t}`).join(',');
  const now = Math.floor(Date.now() / 1000);
  const url = `${Q1}/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?symbol=${encodeURIComponent(symbol)}&type=${types}&period1=493590046&period2=${now}`;
  return parseTimeseries(await withCrumb(url, fetchImpl));
}

/** A full company from Yahoo only (used for non-US listings). */
export async function yahooCompany(symbol, fetchImpl = fetch) {
  const [fund, prof, chart] = await Promise.all([
    yahooFundamentals(symbol, fetchImpl),
    yahooProfile(symbol, fetchImpl).catch(() => null),
    yahooChart(symbol, { range: '5d', fetchImpl }).catch(() => null),
  ]);
  if (!fund.income.length) throw fail(`No annual financial statements found for "${symbol}".`, 404);
  const price = prof?.price ?? chart?.meta.price ?? null;
  return completeRows({
    source: 'Yahoo Finance',
    isDemo: false,
    reportingCurrency: fund.currency || prof?.financialCurrency || prof?.currency || chart?.meta.currency || 'USD',
    profile: {
      symbol, name: prof?.name || chart?.meta.name || symbol, exchange: prof?.exchange || chart?.meta.exchange || '',
      currency: prof?.currency || chart?.meta.currency || fund.currency || 'USD',
      sector: prof?.sector || '', industry: prof?.industry || '', description: prof?.description || '', website: prof?.website || '',
      country: prof?.country || '', employees: prof?.employees || null, ipoDate: chart?.meta.firstTradeDate || null, logo: '', beta: null,
      sharesOutstanding: prof?.marketCap && price ? prof.marketCap / price : null,
    },
    quote: {
      price, change: prof?.change ?? chart?.meta.change ?? null, changePercent: prof?.changePercent ?? chart?.meta.changePercent ?? null,
      marketCap: prof?.marketCap ?? null, asOf: new Date().toISOString(),
    },
    income: fund.income, balance: fund.balance, cashflow: fund.cashflow,
    segments: { product: null, geographic: null },
  });
}
