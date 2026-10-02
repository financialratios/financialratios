// Financial Modeling Prep (https://site.financialmodelingprep.com/developer/docs/stable)
// Used when the FMP_API_KEY environment variable is set. One key covers profiles, 10 years of
// statements, revenue segments and full daily price history (depending on your FMP plan).
import { INCOME_FIELDS, BALANCE_FIELDS, CASHFLOW_FIELDS, pick, completeRows } from '../normalize.mjs';

const BASE = 'https://financialmodelingprep.com/stable';

async function get(path, params, key, fetchImpl) {
  const qs = new URLSearchParams({ ...params, apikey: key });
  const res = await fetchImpl(`${BASE}/${path}?${qs}`);
  if (!res.ok) {
    const err = new Error(`FMP ${path} answered ${res.status}`);
    err.status = res.status === 404 ? 404 : 502;
    throw err;
  }
  const body = await res.json();
  if (body && !Array.isArray(body) && body['Error Message']) {
    const err = new Error(`FMP: ${body['Error Message']}`);
    err.status = 502;
    throw err;
  }
  return body;
}

// Optional endpoints (segments need a paid plan): never let them break the whole page.
const optional = (p) => p.catch(() => null);

function fiscalYearOf(row) {
  const fy = Number(row.fiscalYear ?? row.calendarYear);
  return Number.isFinite(fy) ? fy : Number(String(row.date).slice(0, 4));
}

export function mapIncome(r) {
  return pick(INCOME_FIELDS, {
    ...r,
    researchAndDevelopment: r.researchAndDevelopmentExpenses,
    sellingGeneralAdmin: r.sellingGeneralAndAdministrativeExpenses,
    pretaxIncome: r.incomeBeforeTax,
    incomeTax: r.incomeTaxExpense,
    depreciationAmortization: r.depreciationAndAmortization,
    sharesDiluted: r.weightedAverageShsOutDil,
    epsDiluted: r.epsDiluted ?? r.epsdiluted,
  }, { fiscalYear: fiscalYearOf(r), date: r.date });
}

export function mapBalance(r) {
  return pick(BALANCE_FIELDS, {
    ...r,
    cash: r.cashAndCashEquivalents,
    receivables: r.netReceivables,
    propertyPlantEquipment: r.propertyPlantEquipmentNet,
    goodwillIntangibles: r.goodwillAndIntangibleAssets,
    accountsPayable: r.accountPayables,
    totalEquity: r.totalStockholdersEquity,
  }, { fiscalYear: fiscalYearOf(r), date: r.date });
}

export function mapCashflow(r) {
  return pick(CASHFLOW_FIELDS, {
    ...r,
    depreciationAmortization: r.depreciationAndAmortization,
    operatingCashFlow: r.netCashProvidedByOperatingActivities ?? r.operatingCashFlow,
    investingCashFlow: r.netCashProvidedByInvestingActivities ?? r.netCashUsedForInvestingActivites,
    financingCashFlow: r.netCashProvidedByFinancingActivities ?? r.netCashUsedProvidedByFinancingActivities,
    dividendsPaid: r.commonDividendsPaid ?? r.netDividendsPaid ?? r.dividendsPaid,
    shareBuybacks: r.commonStockRepurchased,
  }, { fiscalYear: fiscalYearOf(r), date: r.date });
}

export function mapSegments(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const latest = [...rows].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  const items = Object.entries(latest.data || {})
    .filter(([, v]) => typeof v === 'number' && v > 0)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  return items.length ? { year: fiscalYearOf(latest), items } : null;
}

export async function fmpCompany(symbol, key, fetchImpl = fetch) {
  const p = { symbol, limit: '10', period: 'annual' };
  const [profiles, income, balance, cashflow, product, geo] = await Promise.all([
    get('profile', { symbol }, key, fetchImpl),
    get('income-statement', p, key, fetchImpl),
    get('balance-sheet-statement', p, key, fetchImpl),
    get('cash-flow-statement', p, key, fetchImpl),
    optional(get('revenue-product-segmentation', { symbol, period: 'annual' }, key, fetchImpl)),
    optional(get('revenue-geographic-segmentation', { symbol, period: 'annual' }, key, fetchImpl)),
  ]);
  const pr = Array.isArray(profiles) ? profiles[0] : null;
  if (!pr) {
    const err = new Error(`No company found for "${symbol}"`);
    err.status = 404;
    throw err;
  }
  const price = pr.price ?? null;
  const company = {
    source: 'Financial Modeling Prep',
    isDemo: false,
    reportingCurrency: (income || [])[0]?.reportedCurrency || pr.currency || 'USD',
    profile: {
      symbol: pr.symbol,
      name: pr.companyName,
      exchange: pr.exchangeFullName || pr.exchange || pr.exchangeShortName || '',
      currency: pr.currency || 'USD',
      sector: pr.sector || '',
      industry: pr.industry || '',
      description: pr.description || '',
      website: pr.website || '',
      country: pr.country || '',
      employees: Number(pr.fullTimeEmployees) || null,
      ipoDate: pr.ipoDate || null,
      logo: pr.image || '',
      beta: typeof pr.beta === 'number' ? pr.beta : null,
      sharesOutstanding: price && pr.marketCap ? pr.marketCap / price : null,
    },
    quote: {
      price,
      change: pr.change ?? null,
      changePercent: pr.changePercentage ?? pr.changesPercentage ?? null,
      marketCap: pr.marketCap ?? pr.mktCap ?? null,
      asOf: new Date().toISOString(),
    },
    income: (income || []).map(mapIncome),
    balance: (balance || []).map(mapBalance),
    cashflow: (cashflow || []).map(mapCashflow),
    segments: { product: mapSegments(product), geographic: mapSegments(geo) },
  };
  return completeRows(company);
}

export async function fmpPrices(symbol, key, fetchImpl = fetch) {
  const [rows, divs] = await Promise.all([
    get('historical-price-eod/full', { symbol, from: '1960-01-01', to: new Date().toISOString().slice(0, 10) }, key, fetchImpl),
    optional(get('dividends', { symbol }, key, fetchImpl)),
  ]);
  const list = (Array.isArray(rows) ? rows : rows?.historical || [])
    .filter((r) => r.date && typeof (r.close ?? r.price) === 'number')
    .sort((a, b) => a.date.localeCompare(b.date));
  const c = (r) => r.close ?? r.price;
  return {
    source: 'Financial Modeling Prep',
    dates: list.map((r) => r.date),
    open: list.map((r) => r.open ?? c(r)),
    high: list.map((r) => r.high ?? c(r)),
    low: list.map((r) => r.low ?? c(r)),
    close: list.map(c),
    volume: list.map((r) => r.volume ?? 0),
    dividends: (Array.isArray(divs) ? divs : [])
      .map((d) => [d.date, d.adjDividend ?? d.dividend])
      .filter(([d, v]) => d && typeof v === 'number' && v > 0)
      .sort((x, y) => x[0].localeCompare(y[0])),
  };
}

export async function fmpSearch(query, key, fetchImpl = fetch) {
  const [bySymbol, byName] = await Promise.all([
    optional(get('search-symbol', { query, limit: '8' }, key, fetchImpl)),
    optional(get('search-name', { query, limit: '8' }, key, fetchImpl)),
  ]);
  const seen = new Set();
  return [...(bySymbol || []), ...(byName || [])]
    .filter((r) => r.symbol && !seen.has(r.symbol) && seen.add(r.symbol))
    .slice(0, 10)
    .map((r) => ({ symbol: r.symbol, name: r.name, exchange: r.exchange || r.exchangeShortName || '' }));
}
