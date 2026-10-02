import test from 'node:test';
import assert from 'node:assert/strict';
import { fmpCompany, mapSegments } from '../server/providers/fmp.mjs';
import { parseCompanyFacts } from '../server/providers/sec.mjs';
import { parseChart } from '../server/providers/yahoo.mjs';
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
