import test from 'node:test';
import assert from 'node:assert/strict';
import { fmpCompany, mapSegments } from '../server/providers/fmp.mjs';
import { parseCompanyFacts, parseSegments, parseLabels, secSegments } from '../server/providers/sec.mjs';
import { parseChart, parseTimeseries, parseSearch, parseQuoteSummary, parseRecommendations } from '../server/providers/yahoo.mjs';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { handleApi } from '../server/core.mjs';

// Responses shaped like Financial Modeling Prep's documented "stable" API.
function fakeFmp(url) {
  const u = new URL(url);
  const path = u.pathname.replace('/stable/', '');
  const years = [2020, 2021, 2022];
  const body = {
    profile: [{ symbol: 'TEST', companyName: 'Test Corp', price: 50, marketCap: 5e9, currency: 'USD', exchange: 'NASDAQ', exchangeFullName: 'NASDAQ Global Select',
      sector: 'Technology', industry: 'Software', description: 'Makes tests.', ipoDate: '2001-05-01', image: 'https://x/logo.png', beta: 1.2, fullTimeEmployees: '1200', change: 1, changePercentage: 2 }],
    'income-statement': years.map((y, i) => ({ date: `${y}-12-31`, fiscalYear: String(y), revenue: 1000 + i * 100, costOfRevenue: 400, grossProfit: 600 + i * 100, operatingIncome: 200 + i * 10,
      researchAndDevelopmentExpenses: 50, sellingGeneralAndAdministrativeExpenses: 100, incomeBeforeTax: 190, incomeTaxExpense: 40, netIncome: 150, interestExpense: 10,
      depreciationAndAmortization: 30, ebitda: 230, eps: 1.5, epsDiluted: 1.45, weightedAverageShsOutDil: 103 })).reverse(),
    'balance-sheet-statement': years.map((y) => ({ date: `${y}-12-31`, fiscalYear: String(y), cashAndCashEquivalents: 100, totalAssets: 2000, totalStockholdersEquity: 1200,
      totalLiabilities: 800, totalDebt: 300, totalCurrentAssets: 500, totalCurrentLiabilities: 250, accountPayables: 60, netReceivables: 90 })),
    'cash-flow-statement': years.map((y) => ({ date: `${y}-12-31`, fiscalYear: String(y), netCashProvidedByOperatingActivities: 220, capitalExpenditure: -60, freeCashFlow: 160,
      commonDividendsPaid: -40, commonStockRepurchased: -20 })),
    'revenue-product-segmentation': [{ fiscalYear: 2022, date: '2022-12-31', data: { Cloud: 700, Licenses: 500 } }, { fiscalYear: 2021, date: '2021-12-31', data: { Cloud: 1 } }],
    'revenue-geographic-segmentation': [],
  }[path];
  if (!body && path !== 'revenue-geographic-segmentation') return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  return Promise.resolve({ ok: true, status: 200, json: async () => body });
}

test('FMP data is normalized, sorted oldest-first and completed', async () => {
  const c = await fmpCompany('TEST', 'key', fakeFmp);
  assert.equal(c.profile.name, 'Test Corp');
  assert.equal(c.profile.employees, 1200);
  assert.equal(c.profile.sharesOutstanding, 1e8);
  assert.deepEqual(c.income.map((r) => r.fiscalYear), [2020, 2021, 2022]);
  assert.equal(c.income[0].revenue, 1000); // FMP lists newest first; we sort oldest first
  assert.equal(c.income[2].revenue, 1200);
  assert.equal(c.income[0].epsDiluted, 1.45);
  assert.equal(c.balance[0].totalEquity, 1200);
  assert.equal(c.cashflow[0].dividendsPaid, -40);
  assert.equal(c.cashflow[0].shareBuybacks, -20);
  assert.equal(c.cashflow[0].netIncome, 150, 'filled from the income statement');
  assert.deepEqual(c.segments.product.items.map((i) => i.name), ['Cloud', 'Licenses']);
  assert.equal(c.segments.geographic, null);
});

test('mapSegments picks the latest year and drops non-positive values', () => {
  const s = mapSegments([{ date: '2020-01-01', fiscalYear: 2020, data: { A: 1 } }, { date: '2023-01-01', fiscalYear: 2023, data: { B: 5, C: 0, D: 7 } }]);
  assert.equal(s.year, 2023);
  assert.deepEqual(s.items.map((i) => i.name), ['D', 'B']);
});

// A tiny SEC "companyfacts" document in the documented shape.
const fact = (start, end, val, filed, form = '10-K') => ({ start, end, val, filed, form, fy: Number(end.slice(0, 4)), fp: 'FY' });
const inst = (end, val, filed) => ({ end, val, filed, form: '10-K' });
const secJson = {
  entityName: 'Example Inc',
  facts: {
    dei: { EntityCommonStockSharesOutstanding: { units: { shares: [{ end: '2023-10-20', val: 1000, filed: '2023-11-01', form: '10-K' }] } } },
    'us-gaap': {
      Revenues: { units: { USD: [
        fact('2020-10-01', '2021-09-30', 900, '2021-11-01'),
        fact('2021-10-01', '2022-09-30', 1000, '2022-11-01'),
        fact('2022-07-01', '2022-09-30', 260, '2022-11-01'), // a quarter: must be ignored
      ] } },
      RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [
        fact('2022-10-01', '2023-09-30', 1200, '2023-11-01'),
        fact('2021-10-01', '2022-09-30', 1010, '2023-11-01'), // restated later: newest filing wins
      ] } },
      NetIncomeLoss: { units: { USD: [fact('2020-10-01', '2021-09-30', 90, '2021-11-01'), fact('2021-10-01', '2022-09-30', 100, '2022-11-01'), fact('2022-10-01', '2023-09-30', 130, '2023-11-01')] } },
      OperatingIncomeLoss: { units: { USD: [fact('2022-10-01', '2023-09-30', 200, '2023-11-01')] } },
      Assets: { units: { USD: [inst('2023-09-30', 5000, '2023-11-01'), inst('2022-09-30', 4500, '2022-11-01')] } },
      StockholdersEquity: { units: { USD: [inst('2023-09-30', 2000, '2023-11-01')] } },
      LongTermDebtNoncurrent: { units: { USD: [inst('2023-09-30', 800, '2023-11-01')] } },
      NetCashProvidedByUsedInOperatingActivities: { units: { USD: [fact('2022-10-01', '2023-09-30', 250, '2023-11-01')] } },
      PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [fact('2022-10-01', '2023-09-30', 70, '2023-11-01')] } },
      EarningsPerShareDiluted: { units: { 'USD/shares': [fact('2022-10-01', '2023-09-30', 0.13, '2023-11-01')] } },
    },
  },
};

test('SEC company facts become annual rows; quarters ignored; restatements win', () => {
  const r = parseCompanyFacts(secJson);
  assert.deepEqual(r.income.map((x) => x.fiscalYear), [2021, 2022, 2023]);
  assert.equal(r.income[0].revenue, 900, 'falls back to the older Revenues tag');
  assert.equal(r.income[1].revenue, 1010, 'preferred tag, latest filing');
  assert.equal(r.income[2].revenue, 1200);
  assert.equal(r.income[2].epsDiluted, 0.13);
  assert.equal(r.balance[2].totalAssets, 5000);
  assert.equal(r.balance[2].longTermDebt, 800);
  assert.equal(r.cashflow[2].capitalExpenditure, -70, 'payments are shown as negative');
  assert.equal(r.sharesOutstanding, 1000);
});

test('Yahoo chart response is parsed into dates and closes', () => {
  const p = parseChart({ chart: { result: [{ meta: { regularMarketPrice: 12, chartPreviousClose: 10, currency: 'USD', firstTradeDate: 345479400 },
    timestamp: [345479400, 345565800, 345652200], indicators: { quote: [{ close: [0.1, null, 0.12] }] } }] } });
  assert.deepEqual(p.dates, ['1980-12-12', '1980-12-14']);
  assert.deepEqual(p.close, [0.1, 0.12]);
  assert.deepEqual(p.open, [0.1, 0.12], 'missing open falls back to close');
  assert.equal(p.meta.change, 2);
  assert.equal(p.meta.firstTradeDate, '1980-12-12');
});

test('API: DEMO works offline, bad input is rejected', async () => {
  const ok = await handleApi(new URL('http://x/api/company?symbol=demo'), {});
  assert.equal(ok.status, 200);
  const body = JSON.parse(ok.body);
  assert.equal(body.isDemo, true);
  assert.equal(body.income.length, 10);
  const prices = JSON.parse((await handleApi(new URL('http://x/api/prices?symbol=DEMO'), {})).body);
  assert.ok(prices.dates.length > 4000);
  assert.equal((await handleApi(new URL('http://x/api/company?symbol=%3Cscript%3E'), {})).status, 400);
  assert.equal((await handleApi(new URL('http://x/api/nope'), {})).status, 404);
});

test('SEC: international filers (IFRS tags, EUR) and derived lines', async () => {
  const { completeRows } = await import('../server/normalize.mjs');
  const f = (val) => ({ start: '2022-01-01', end: '2022-12-31', val, filed: '2023-03-01', form: '20-F' });
  const i = (val) => ({ end: '2022-12-31', val, filed: '2023-03-01', form: '20-F' });
  const r = parseCompanyFacts({ facts: { 'ifrs-full': {
    Revenue: { units: { EUR: [f(1000)] } }, CostOfSales: { units: { EUR: [f(600)] } },
    ProfitLossFromOperatingActivities: { units: { EUR: [f(150)] } }, ProfitLossBeforeTax: { units: { EUR: [f(140)] } },
    ProfitLossAttributableToOwnersOfParent: { units: { EUR: [f(100)] } }, Assets: { units: { EUR: [i(2000)] } },
    Liabilities: { units: { EUR: [i(1200)] } }, CashFlowsFromUsedInOperatingActivities: { units: { EUR: [f(180)] } },
    CashFlowsFromUsedInInvestingActivities: { units: { EUR: [f(-80)] } }, CashFlowsFromUsedInFinancingActivities: { units: { EUR: [f(-50)] } },
  } } });
  assert.equal(r.currency, 'EUR');
  const c = completeRows({ income: r.income, balance: r.balance, cashflow: r.cashflow });
  assert.equal(c.income[0].grossProfit, 400);
  assert.equal(c.income[0].operatingExpenses, 250);
  assert.equal(c.income[0].incomeTax, 40);
  assert.equal(c.balance[0].totalEquity, 800);
  assert.equal(c.cashflow[0].netChangeInCash, 50);
});

test('real SEC file (Snowflake, public domain) is parsed into complete statements', async () => {
  const { completeRows } = await import('../server/normalize.mjs');
  const json = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/snow_facts.json.gz', import.meta.url))).toString());
  const r = parseCompanyFacts(json);
  const c = completeRows({ income: r.income, balance: r.balance, cashflow: r.cashflow });
  const fy25 = c.income.find((x) => x.fiscalYear === 2025);
  assert.ok(Math.abs(fy25.revenue / 1e6 - 3626) < 1, 'FY2025 revenue ~ $3,626M');
  assert.ok(fy25.netIncome < 0);
  const b25 = c.balance.find((x) => x.fiscalYear === 2025);
  assert.ok(b25.longTermDebt > 2e9, 'convertible notes are counted as debt');
  for (const k of ['cash', 'totalAssets', 'totalCurrentLiabilities', 'totalEquity']) assert.ok(b25[k] != null, k);
  const cf25 = c.cashflow.find((x) => x.fiscalYear === 2025);
  for (const k of ['operatingCashFlow', 'capitalExpenditure', 'freeCashFlow', 'shareBuybacks', 'stockBasedCompensation']) assert.ok(cf25[k] != null, k);
});

test('Yahoo annual statements (non-US companies)', () => {
  const pt = (date, raw) => ({ asOfDate: date, periodType: '12M', currencyCode: 'JPY', reportedValue: { raw } });
  const r = parseTimeseries({ timeseries: { result: [
    { meta: { type: ['annualTotalRevenue'] }, annualTotalRevenue: [pt('2023-03-31', 1000), pt('2024-03-31', 1200)] },
    { meta: { type: ['annualNetIncomeCommonStockholders'] }, annualNetIncomeCommonStockholders: [pt('2024-03-31', 90)] },
    { meta: { type: ['annualTotalAssets'] }, annualTotalAssets: [null, pt('2024-03-31', 5000)] },
    { meta: { type: ['annualFreeCashFlow'] } },
  ] } });
  assert.equal(r.currency, 'JPY');
  assert.deepEqual(r.income.map((x) => [x.fiscalYear, x.revenue, x.netIncome]), [[2023, 1000, null], [2024, 1200, 90]]);
  assert.equal(r.balance.length, 1);
  assert.equal(r.balance[0].totalAssets, 5000);
  assert.equal(r.cashflow.length, 0);
});

test('Yahoo search and profile parsing', () => {
  const s = parseSearch({ quotes: [{ symbol: '7203.T', longname: 'Toyota Motor Corporation', exchDisp: 'Tokyo', quoteType: 'EQUITY' }, { symbol: 'X', quoteType: 'OPTION' }] });
  assert.deepEqual(s, [{ symbol: '7203.T', name: 'Toyota Motor Corporation', exchange: 'Tokyo' }]);
  const p = parseQuoteSummary({ quoteSummary: { result: [{ assetProfile: { longBusinessSummary: 'Cars.', sector: 'Consumer Cyclical', fullTimeEmployees: 380000 },
    price: { longName: 'Toyota', currency: 'JPY', regularMarketPrice: { raw: 3000 }, marketCap: { raw: 4e13 }, regularMarketChangePercent: { raw: 0.012 } },
    financialData: { financialCurrency: 'JPY' } }] } });
  assert.equal(p.description, 'Cars.');
  assert.equal(p.marketCap, 4e13);
  assert.ok(Math.abs(p.changePercent - 1.2) < 1e-9);
});

test('reviews: validation, spam protection, listing and owner-only delete', async () => {
  const { handleReviews, validateReview, setStoreForTests } = await import('../server/reviews.mjs');
  const m = new Map();
  setStoreForTests({ list: async () => [...m.keys()], get: async (k) => m.get(k) ?? null, set: async (k, v) => { m.set(k, v); }, del: async (k) => { m.delete(k); } });
  assert.ok(validateReview({ name: 'A', text: 'Great website!', rating: 5 }).error, 'name too short');
  assert.ok(validateReview({ name: 'Ana', text: 'see http://spam.example', rating: 5 }).error, 'links blocked');
  assert.ok(validateReview({ name: 'Ana', text: 'Great website!', rating: 7 }).error, 'rating 1-5');
  assert.ok(validateReview({ name: 'Ana', text: 'Great website!', rating: 5, website: 'x' }).error, 'honeypot');
  const env = { REVIEWS_ADMIN_TOKEN: 'secret' };
  const url = new URL('http://x/api/reviews');
  const [s1, b1] = await handleReviews({ method: 'POST', url, body: JSON.stringify({ name: 'Ana', text: 'Very clear lessons, thank you!', rating: 5, topic: 'Learn' }), ip: '1.1.1.1', env });
  assert.equal(s1, 201);
  assert.equal(b1.review.topic, 'Learn');
  const [, list] = await handleReviews({ method: 'GET', url, env });
  assert.equal(list.count, 1);
  assert.equal(list.average, 5);
  for (let i = 0; i < 3; i++) await handleReviews({ method: 'POST', url, body: JSON.stringify({ name: 'Bob', text: 'Another useful review', rating: 4 }), ip: '2.2.2.2', env });
  const [s4] = await handleReviews({ method: 'POST', url, body: JSON.stringify({ name: 'Bob', text: 'Another useful review', rating: 4 }), ip: '2.2.2.2', env });
  assert.equal(s4, 429, 'rate limited after 3 in 10 minutes');
  const [sBad] = await handleReviews({ method: 'GET', url: new URL(`http://x/api/reviews?delete=${b1.review.id}&token=wrong`), env });
  assert.equal(sBad, 403);
  const [sOk] = await handleReviews({ method: 'GET', url: new URL(`http://x/api/reviews?delete=${b1.review.id}&token=secret`), env });
  assert.equal(sOk, 200);
  assert.equal(m.has(b1.review.id), false);
});

test('dividend history: yearly totals, increase streak, partial current year', async () => {
  const { dividendHistory } = await import('../public/js/lib/finance.js');
  const pay = [];
  for (let y = 2014; y <= 2026; y++) for (const q of ['03', '06', '09', '12']) if (y < 2026 || q === '03') pay.push([`${y}-${q}-10`, 0.1 * 1.1 ** (y - 2014)]);
  const h = dividendHistory(pay, new Date('2026-05-01'));
  assert.equal(h.firstYear, 2014);
  assert.equal(h.lastFullYear, 2025);
  assert.equal(h.increaseStreak, 11);
  assert.ok(h.rows[h.rows.length - 1].partial);
  assert.ok(Math.abs(h.cagr10 - 0.1) < 1e-9);
});

test('Yahoo key statistics for the competitor table', () => {
  const p = parseQuoteSummary({ quoteSummary: { result: [{
    price: { longName: 'Test', currency: 'USD', quoteType: 'EQUITY' },
    summaryDetail: { trailingPE: { raw: 25.5 }, forwardPE: { raw: -3 }, priceToSalesTrailing12Months: { raw: 4 }, dividendYield: {}, trailingAnnualDividendYield: { raw: 0 } },
    defaultKeyStatistics: { enterpriseToEbitda: { raw: 18 }, enterpriseToRevenue: { raw: 4.2 }, priceToBook: { raw: -2 } },
    financialData: { profitMargins: { raw: 0.21 }, operatingMargins: { raw: 0.3 }, returnOnEquity: { raw: 1.5 }, debtToEquity: { raw: 151.9 } },
  }] } });
  assert.equal(p.quoteType, 'EQUITY');
  assert.equal(p.stats.pe, 25.5);
  assert.equal(p.stats.forwardPe, null); // negative expected earnings: not meaningful
  assert.equal(p.stats.pb, null); // negative equity
  assert.equal(p.stats.evEbitda, 18);
  assert.equal(p.stats.netMargin, 0.21);
  assert.ok(Math.abs(p.stats.debtToEquity - 1.519) < 1e-9); // Yahoo gives percent
  assert.equal(p.stats.dividendYield, 0); // pays no dividend
  assert.deepEqual(parseRecommendations({ finance: { result: [{ symbol: 'AAPL', recommendedSymbols: [{ symbol: 'MSFT', score: 0.3 }, { symbol: 'GOOG' }] }] } }), ['MSFT', 'GOOG']);
});

test('API peers: hand-picked list or similar companies in the same sector', async () => {
  const summary = (name, sector, pe, quoteType = 'EQUITY') => ({ quoteSummary: { result: [{
    price: { longName: name, currency: 'USD', quoteType, marketCap: { raw: 1e9 } }, assetProfile: { sector },
    summaryDetail: { trailingPE: { raw: pe } }, defaultKeyStatistics: {}, financialData: {} }] } });
  const companies = {
    ZZQA: summary('Zed A', 'Energy', 10), ZZQB: summary('Zed B', 'Energy', 12), ZZQC: summary('Zed C', 'Energy', 14),
    ZZQT: summary('Tech Co', 'Technology', 40), ZZQE: summary('An ETF', 'Energy', 9, 'ETF'),
    KO: summary('Coca-Cola', 'Consumer Defensive', 24), PEP: summary('PepsiCo', 'Consumer Defensive', 20), KDP: summary('Keurig Dr Pepper', 'Consumer Defensive', 22),
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => '', headers: { get: () => '' } });
    if (u.includes('recommendationsbysymbol/ZZQA')) return ok({ finance: { result: [{ recommendedSymbols: ['ZZQT', 'ZZQB', 'ZZQE', 'ZZQC', 'NOPE'].map((symbol) => ({ symbol })) }] } });
    const m = u.match(/quoteSummary\/([^?]+)/);
    if (m && companies[decodeURIComponent(m[1])]) return ok(companies[decodeURIComponent(m[1])]);
    return { ok: false, status: 404, json: async () => ({}), text: async () => '', headers: { get: () => '' } };
  };
  try {
    const similar = JSON.parse((await handleApi(new URL('http://x/api/peers?symbol=zzqa'), {})).body);
    assert.equal(similar.how, 'yahoo');
    assert.equal(similar.self.name, 'Zed A');
    assert.deepEqual(similar.peers.map((p) => p.symbol), ['ZZQB', 'ZZQC']); // other sector, ETF and unknown symbol left out
    assert.equal(similar.peers[0].pe, 12);
    const curated = JSON.parse((await handleApi(new URL('http://x/api/peers?symbol=KO'), {})).body);
    assert.equal(curated.how, 'curated');
    assert.deepEqual(curated.peers.map((p) => p.symbol), ['PEP', 'KDP']); // the rest failed to load and are skipped
    const demo = JSON.parse((await handleApi(new URL('http://x/api/peers?symbol=DEMO'), {})).body);
    assert.deepEqual(demo.peers, []);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// A tiny XBRL instance (the `_htm.xml` of a 10-K) with revenue by product and by region.
const ctx = (id, start, end, dims = []) => `<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000000001</xbrli:identifier>${dims.length
  ? `<xbrli:segment>${dims.map(([d, m]) => `<xbrldi:explicitMember dimension="${d}">${m}</xbrldi:explicitMember>`).join('')}</xbrli:segment>` : ''}</xbrli:entity>
  <xbrli:period><xbrli:startDate>${start}</xbrli:startDate><xbrli:endDate>${end}</xbrli:endDate></xbrli:period></xbrli:context>`;
const rev = (id, v, tag = 'RevenueFromContractWithCustomerExcludingAssessedTax') => `<us-gaap:${tag} contextRef="${id}" decimals="-6" unitRef="usd">${v}</us-gaap:${tag}>`;
const P = 'srt:ProductOrServiceAxis', G = 'srt:StatementGeographicalAxis';
const xbrl = `<?xml version="1.0"?><xbrli:xbrl>
  ${ctx('c1', '2023-10-01', '2024-09-28')}${ctx('c0', '2022-09-25', '2023-09-30', [[P, 'ex:PhoneMember']])}
  ${ctx('p1', '2023-10-01', '2024-09-28', [[P, 'ex:PhoneMember']])}${ctx('p2', '2023-10-01', '2024-09-28', [[P, 'ex:LaptopMember']])}
  ${ctx('p3', '2023-10-01', '2024-09-28', [[P, 'us-gaap:ProductMember']])}${ctx('p4', '2023-10-01', '2024-09-28', [[P, 'us-gaap:ServiceMember']])}
  ${ctx('q1', '2024-07-01', '2024-09-28', [[P, 'ex:PhoneMember']])}
  ${ctx('g1', '2023-10-01', '2024-09-28', [[G, 'country:US']])}${ctx('g2', '2023-10-01', '2024-09-28', [[G, 'ex:RestOfWorldMember']])}
  ${ctx('e1', '2023-10-01', '2024-09-28', [['us-gaap:StatementBusinessSegmentsAxis', 'ex:EliminationsMember']])}
  ${ctx('s1', '2023-10-01', '2024-09-28', [['us-gaap:StatementBusinessSegmentsAxis', 'ex:HardwareMember'], ['srt:ConsolidationItemsAxis', 'us-gaap:OperatingSegmentsMember']])}
  ${ctx('s2', '2023-10-01', '2024-09-28', [['us-gaap:StatementBusinessSegmentsAxis', 'ex:CloudMember'], ['srt:ConsolidationItemsAxis', 'us-gaap:OperatingSegmentsMember']])}
  ${rev('c1', 1000)}${rev('c0', 500)}${rev('p1', 600)}${rev('p2', 150)}${rev('p3', 750)}${rev('p4', 250)}${rev('q1', 200)}
  ${rev('g1', 400)}${rev('g2', 600)}${rev('e1', -30, 'Revenues')}${rev('s1', 700, 'Revenues')}${rev('s2', 330, 'Revenues')}
</xbrli:xbrl>`;
const labXml = `<link:linkbase><link:labelLink>
  <link:loc xlink:type="locator" xlink:href="ex-20240928.xsd#ex_PhoneMember" xlink:label="loc_phone"/>
  <link:label xlink:type="resource" xlink:label="lab_phone" xlink:role="http://www.xbrl.org/2003/role/label" xml:lang="en-US">exPhone [Member]</link:label>
  <link:label xlink:type="resource" xlink:label="lab_phone" xlink:role="http://www.xbrl.org/2003/role/terseLabel" xml:lang="en-US">exPhone</link:label>
  <link:labelArc xlink:type="arc" xlink:from="loc_phone" xlink:to="lab_phone" xlink:arcrole="http://www.xbrl.org/2003/arcrole/concept-label"/>
  <link:loc xlink:type="locator" xlink:href="https://xbrl.fasb.org/us-gaap-2024.xsd#us-gaap_ServiceMember" xlink:label="loc_svc"/>
  <link:label xlink:type="resource" xlink:label="lab_svc" xlink:role="http://www.xbrl.org/2003/role/label" xml:lang="en-US">Services &amp; Support [Member]</link:label>
  <link:labelArc xlink:type="arc" xlink:from="loc_svc" xlink:to="lab_svc"/>
</link:labelLink></link:linkbase>`;

test('SEC XBRL filing: revenue by product and region for the latest year; totals, eliminations and quarters left out', () => {
  const labels = parseLabels(labXml);
  assert.equal(labels.get('ex:PhoneMember'), 'exPhone', 'terse label wins');
  assert.equal(labels.get('us-gaap:ServiceMember'), 'Services & Support');
  const s = parseSegments(xbrl, labels);
  assert.equal(s.product.year, 2024);
  // "Products" (= phone + laptop) is a total and is dropped; unknown labels come from the member name.
  assert.deepEqual(s.product.items, [{ name: 'exPhone', value: 600 }, { name: 'Services & Support', value: 250 }, { name: 'Laptop', value: 150 }]);
  assert.deepEqual(s.geographic.items.map((i) => [i.name, i.value]), [['Rest Of World', 600], ['US', 400]]);
  // Without a product axis, operating segments are used (eliminations left out).
  const noProduct = parseSegments(xbrl.replace(/srt:ProductOrServiceAxis/g, 'ex:OtherAxis'));
  assert.deepEqual(noProduct.product.items.map((i) => i.name), ['Hardware', 'Cloud']);
  assert.deepEqual(parseSegments('<xbrl/>'), { product: null, geographic: null });
});

test('SEC segments: finds the latest 10-K and its files; never throws', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => body });
    if (url.endsWith('company_tickers.json')) return ok({ 0: { cik_str: 42, ticker: 'ZZSG', title: 'Seg Inc' } });
    if (url.includes('/submissions/')) return ok({ filings: { recent: { form: ['8-K', '10-Q', '10-K', '10-K'], accessionNumber: ['a', 'b', '0000000042-24-000123', 'old'], isXBRL: [0, 1, 1, 1] } } });
    if (url.endsWith('/index.json')) return ok({ directory: { item: [{ name: 'ex-20240928.htm' }, { name: 'ex-20240928_htm.xml' }, { name: 'ex-20240928_lab.xml' }, { name: 'ex-20240928_pre.xml' }] } });
    if (url.endsWith('_htm.xml')) return ok(xbrl);
    if (url.endsWith('_lab.xml')) return ok(labXml);
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };
  const s = await secSegments('ZZSG', 'test test@example.com', fetchImpl);
  assert.equal(s.product.items[0].name, 'exPhone');
  assert.ok(urls.includes('https://www.sec.gov/Archives/edgar/data/42/000000004224000123/index.json'));
  assert.equal(await secSegments('ZZSG', 'ua', async () => { throw new Error('offline'); }), null);
});
