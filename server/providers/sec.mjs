// Free fallback: US SEC EDGAR "company facts" API (https://www.sec.gov/search-filings/edgar-application-programming-interfaces).
// No key needed, but the SEC asks every caller to send a User-Agent with a contact email
// (set SEC_USER_AGENT) and to stay under 10 requests per second. US-listed filers only.
// It has no revenue-segment breakdown and no business description; the site says so when that happens.
import { completeRows } from '../normalize.mjs';

// Annual reports; IPO prospectuses (S-1/F-1) only fill years before the first annual report,
// because the most recently filed value always wins.
const ANNUAL_FORMS = new Set(['10-K', '10-K/A', '20-F', '20-F/A', '40-F', '40-F/A', '10-KT', 'S-1', 'S-1/A', 'F-1', 'F-1/A']);

// For each normalized field: the XBRL tags to try, in order of preference.
const DURATION_TAGS = {
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueGoodsNet', 'RevenuesNetOfInterestExpense', 'Revenue'],
  costOfRevenue: ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold', 'CostOfGoodsAndServiceExcludingDepreciationDepletionAndAmortization', 'CostOfSales', 'CostOfGoodsAndServicesSoldExcludingDepreciationDepletionAndAmortization'],
  grossProfit: ['GrossProfit'],
  researchAndDevelopment: ['ResearchAndDevelopmentExpense', 'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost'],
  sellingGeneralAdmin: ['SellingGeneralAndAdministrativeExpense'],
  sellingMarketing: ['SellingAndMarketingExpense', 'SellingExpense', 'MarketingExpense'],
  generalAdmin: ['GeneralAndAdministrativeExpense', 'AdministrativeExpense'],
  operatingExpenses: ['OperatingExpenses', 'CostsAndExpenses', 'OperatingExpense'],
  operatingIncome: ['OperatingIncomeLoss', 'ProfitLossFromOperatingActivities'],
  interestExpense: ['InterestExpense', 'InterestExpenseNonoperating', 'InterestExpenseDebt', 'InterestPaidNet', 'InterestAndDebtExpense', 'FinanceCosts'],
  pretaxIncome: ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic', 'ProfitLossBeforeTax'],
  incomeTax: ['IncomeTaxExpenseBenefit', 'IncomeTaxExpenseContinuingOperations'],
  netIncome: ['NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'ProfitLossAttributableToOwnersOfParent'],
  depreciationAmortization: ['DepreciationDepletionAndAmortization', 'DepreciationAmortizationAndAccretionNet', 'DepreciationAndAmortization', 'Depreciation', 'DepreciationAndAmortisationExpense', 'AdjustmentsForDepreciationAndAmortisationExpense', 'DepreciationExpense', 'DepreciationAmortisationAndImpairmentLossReversalOfImpairmentLossRecognisedInProfitOrLoss'],
  eps: ['EarningsPerShareBasic', 'BasicEarningsLossPerShare'],
  epsDiluted: ['EarningsPerShareDiluted', 'DilutedEarningsLossPerShare'],
  sharesDiluted: ['WeightedAverageNumberOfDilutedSharesOutstanding', 'AdjustedWeightedAverageShares', 'WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageShares'],
  operatingCashFlow: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations', 'CashFlowsFromUsedInOperatingActivities', 'CashFlowsFromUsedInOperations'],
  capitalExpenditure: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets', 'PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities', 'PaymentsToAcquireOtherPropertyPlantAndEquipment'],
  investingCashFlow: ['NetCashProvidedByUsedInInvestingActivities', 'NetCashProvidedByUsedInInvestingActivitiesContinuingOperations', 'CashFlowsFromUsedInInvestingActivities'],
  financingCashFlow: ['NetCashProvidedByUsedInFinancingActivities', 'NetCashProvidedByUsedInFinancingActivitiesContinuingOperations', 'CashFlowsFromUsedInFinancingActivities'],
  dividendsPaid: ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends', 'DividendsPaidClassifiedAsFinancingActivities', 'PaymentsOfOrdinaryDividends'],
  shareBuybacks: ['PaymentsForRepurchaseOfCommonStock', 'PaymentsForRepurchaseOfEquity', 'PaymentsToAcquireOrRedeemEntitysShares', 'PurchaseOfTreasuryShares'],
  stockBasedCompensation: ['ShareBasedCompensation', 'AllocatedShareBasedCompensationExpense'],
  netChangeInCash: ['CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect', 'CashAndCashEquivalentsPeriodIncreaseDecrease', 'IncreaseDecreaseInCashAndCashEquivalents'],
};

const INSTANT_TAGS = {
  cash: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'Cash', 'CashAndCashEquivalents'],
  shortTermInvestments: ['MarketableSecuritiesCurrent', 'ShortTermInvestments', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent', 'AvailableForSaleSecuritiesCurrent', 'CurrentFinancialAssetsAtFairValueThroughProfitOrLoss'],
  receivables: ['AccountsReceivableNetCurrent', 'ReceivablesNetCurrent', 'AccountsNotesAndLoansReceivableNetCurrent', 'TradeAndOtherCurrentReceivables'],
  inventory: ['InventoryNet', 'Inventories', 'InventoryGross'],
  totalCurrentAssets: ['AssetsCurrent', 'CurrentAssets'],
  propertyPlantEquipment: ['PropertyPlantAndEquipmentNet', 'PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAfterAccumulatedDepreciationAndAmortization', 'PropertyPlantAndEquipment'],
  goodwill: ['Goodwill'],
  intangibles: ['IntangibleAssetsNetExcludingGoodwill', 'FiniteLivedIntangibleAssetsNet', 'IntangibleAssetsOtherThanGoodwill', 'IndefiniteLivedIntangibleAssetsExcludingGoodwill'],
  longTermInvestments: ['MarketableSecuritiesNoncurrent', 'LongTermInvestments', 'AvailableForSaleSecuritiesDebtSecuritiesNoncurrent', 'HeldToMaturitySecuritiesNoncurrent'],
  totalAssets: ['Assets'],
  accountsPayable: ['AccountsPayableCurrent', 'AccountsPayableAndAccruedLiabilitiesCurrent', 'TradeAndOtherCurrentPayables'],
  shortTermDebt: ['LongTermDebtCurrent', 'DebtCurrent', 'LongTermDebtAndCapitalLeaseObligationsCurrent'],
  commercialPaper: ['CommercialPaper', 'ShortTermBorrowings', 'CurrentPortionOfLongtermBorrowings', 'ShorttermBorrowings'],
  totalCurrentLiabilities: ['LiabilitiesCurrent', 'CurrentLiabilities'],
  longTermDebt: ['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations', 'LongTermDebt', 'LongTermNotesPayable', 'NoncurrentPortionOfNoncurrentBorrowings', 'LongtermBorrowings', 'ConvertibleDebtNoncurrent', 'ConvertibleNotesPayable', 'SeniorNotes', 'LongTermDebtAndFinanceLeasesNoncurrent'],
  totalLiabilities: ['Liabilities'],
  totalEquity: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'EquityAttributableToOwnersOfParent', 'Equity'],
};

const DAY = 86400000;
const sumOrNull = (...xs) => (xs.every((x) => x == null) ? null : xs.reduce((a, x) => a + (x || 0), 0));

/** Currency of the reported numbers (USD for US filers; EUR, JPY... for some foreign filers). */
function reportingCurrency(facts) {
  for (const tag of DURATION_TAGS.revenue.concat(DURATION_TAGS.netIncome)) {
    const node = facts['us-gaap']?.[tag] || facts['ifrs-full']?.[tag];
    const unit = node && Object.keys(node.units || {})[0];
    if (unit && /^[A-Z]{3}$/.test(unit)) return unit;
  }
  return 'USD';
}
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / DAY;

/** All annual facts for one tag, as Map(endDate -> value), latest filing wins (restatements). */
function annualSeries(facts, tag, { instant }) {
  const node = facts['us-gaap']?.[tag] || facts['ifrs-full']?.[tag];
  if (!node) return null;
  const unitKey = Object.keys(node.units || {}).find((u) => /^[A-Z]{3}(\/shares)?$/.test(u) || u === 'shares')
    || Object.keys(node.units || {})[0];
  if (!unitKey) return null;
  const out = new Map();
  const filedAt = new Map();
  for (const f of node.units[unitKey]) {
    if (!ANNUAL_FORMS.has(f.form)) continue;
    if (!instant) {
      if (!f.start) continue;
      const len = days(f.start, f.end);
      if (len < 340 || len > 390) continue;
    } else if (f.start) continue;
    const prev = filedAt.get(f.end);
    if (!prev || f.filed > prev) {
      out.set(f.end, f.val);
      filedAt.set(f.end, f.filed);
    }
  }
  return out.size ? out : null;
}

/** First tag (in preference order) that has a value for that period end; tags may change over the years. */
function valueAt(seriesList, end) {
  for (const s of seriesList) {
    if (s && s.has(end)) return s.get(end);
  }
  return null;
}

export function parseCompanyFacts(json) {
  const facts = json.facts || {};
  const dur = Object.fromEntries(Object.entries(DURATION_TAGS).map(([k, tags]) => [k, tags.map((t) => annualSeries(facts, t, { instant: false }))]));
  const inst = Object.fromEntries(Object.entries(INSTANT_TAGS).map(([k, tags]) => [k, tags.map((t) => annualSeries(facts, t, { instant: true }))]));

  // Fiscal year ends = the period ends where revenue or net income was reported annually.
  const ends = new Set();
  for (const s of [...dur.revenue, ...dur.netIncome]) if (s) for (const e of s.keys()) ends.add(e);
  // Drop period ends that are too close to a later one (comparative periods for odd fiscal calendars).
  const sorted = [...ends].sort();
  const periodEnds = sorted.filter((e, i) => i === sorted.length - 1 || days(e, sorted[i + 1]) > 300).slice(-10);

  const income = [], balance = [], cashflow = [];
  for (const end of periodEnds) {
    // Label by the calendar year the fiscal year ends in (as companies do), except 52/53-week
    // years that spill a few days into January, which belong to the previous year.
    const fiscalYear = Number(end.slice(0, 4)) - (end.slice(5, 7) === '01' && Number(end.slice(8, 10)) <= 7 ? 1 : 0);
    const d = (k) => valueAt(dur[k], end);
    const i = (k) => valueAt(inst[k], end);
    const capex = d('capitalExpenditure');
    income.push({
      fiscalYear, date: end,
      revenue: d('revenue'), costOfRevenue: d('costOfRevenue'), grossProfit: d('grossProfit'),
      researchAndDevelopment: d('researchAndDevelopment'), sellingGeneralAdmin: d('sellingGeneralAdmin') ?? sumOrNull(d('sellingMarketing'), d('generalAdmin')),
      operatingExpenses: d('operatingExpenses'), operatingIncome: d('operatingIncome'),
      interestExpense: d('interestExpense'), pretaxIncome: d('pretaxIncome'), incomeTax: d('incomeTax'),
      netIncome: d('netIncome'), depreciationAmortization: d('depreciationAmortization'), ebitda: null,
      eps: d('eps'), epsDiluted: d('epsDiluted'), sharesDiluted: d('sharesDiluted'),
    });
    const goodwill = i('goodwill'), intangibles = i('intangibles');
    const std = i('shortTermDebt'), cp = i('commercialPaper');
    balance.push({
      fiscalYear, date: end,
      cash: i('cash'), shortTermInvestments: i('shortTermInvestments'), receivables: i('receivables'),
      inventory: i('inventory'), totalCurrentAssets: i('totalCurrentAssets'), propertyPlantEquipment: i('propertyPlantEquipment'),
      goodwillIntangibles: goodwill == null && intangibles == null ? null : (goodwill || 0) + (intangibles || 0),
      longTermInvestments: i('longTermInvestments'), totalAssets: i('totalAssets'), accountsPayable: i('accountsPayable'),
      shortTermDebt: std == null && cp == null ? null : (std || 0) + (cp || 0),
      totalCurrentLiabilities: i('totalCurrentLiabilities'), longTermDebt: i('longTermDebt'),
      totalLiabilities: i('totalLiabilities'), totalEquity: i('totalEquity'), totalDebt: null,
    });
    cashflow.push({
      fiscalYear, date: end,
      netIncome: d('netIncome'), depreciationAmortization: d('depreciationAmortization'),
      stockBasedCompensation: d('stockBasedCompensation'), operatingCashFlow: d('operatingCashFlow'),
      // Statements show money spent as negative numbers; the SEC tags store payments as positive.
      capitalExpenditure: capex == null ? null : -Math.abs(capex),
      investingCashFlow: d('investingCashFlow'),
      dividendsPaid: d('dividendsPaid') == null ? null : -Math.abs(d('dividendsPaid')),
      shareBuybacks: d('shareBuybacks') == null ? null : -Math.abs(d('shareBuybacks')),
      financingCashFlow: d('financingCashFlow'), netChangeInCash: d('netChangeInCash'), freeCashFlow: null,
    });
  }

  // Latest reported shares outstanding (cover page).
  const sharesFacts = facts.dei?.EntityCommonStockSharesOutstanding?.units?.shares || [];
  const latestShares = [...sharesFacts].sort((a, b) => String(b.end).localeCompare(String(a.end)))[0];

  return { name: json.entityName, currency: reportingCurrency(facts), income, balance, cashflow, sharesOutstanding: latestShares?.val ?? null };
}

let tickerCache = null;

async function secFetch(url, ua, fetchImpl) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': ua, Accept: 'application/json' } });
  if (!res.ok) {
    const err = new Error(`SEC answered ${res.status} for ${url}`);
    err.status = res.status === 404 ? 404 : 502;
    throw err;
  }
  return res.json();
}

export async function secTickers(ua, fetchImpl = fetch) {
  if (tickerCache && Date.now() - tickerCache.at < 24 * 3600 * 1000) return tickerCache.list;
  const json = await secFetch('https://www.sec.gov/files/company_tickers.json', ua, fetchImpl);
  const list = Object.values(json).map((r) => ({ symbol: String(r.ticker).toUpperCase(), name: r.title, cik: r.cik_str }));
  tickerCache = { at: Date.now(), list };
  return list;
}

export async function secSearch(query, ua, fetchImpl = fetch) {
  const q = query.trim().toUpperCase();
  const list = await secTickers(ua, fetchImpl);
  const exact = list.filter((r) => r.symbol === q);
  const starts = list.filter((r) => r.symbol !== q && r.symbol.startsWith(q));
  const byName = list.filter((r) => r.name.toUpperCase().includes(q) && !r.symbol.startsWith(q));
  return [...exact, ...starts, ...byName].slice(0, 10).map(({ symbol, name }) => ({ symbol, name, exchange: 'US' }));
}

export async function secCompany(symbol, ua, fetchImpl = fetch) {
  const list = await secTickers(ua, fetchImpl);
  const hit = list.find((r) => r.symbol === symbol.toUpperCase());
  if (!hit) {
    const err = new Error(`"${symbol}" was not found among US SEC filers.`);
    err.status = 404;
    throw err;
  }
  const cik = String(hit.cik).padStart(10, '0');
  const [factsJson, subs] = await Promise.all([
    secFetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, ua, fetchImpl),
    secFetch(`https://data.sec.gov/submissions/CIK${cik}.json`, ua, fetchImpl).catch(() => ({})),
  ]);
  const parsed = parseCompanyFacts(factsJson);
  const company = {
    source: 'SEC EDGAR',
    isDemo: false,
    profile: {
      symbol: hit.symbol,
      name: subs.name || parsed.name || hit.name,
      exchange: (subs.exchanges || [])[0] || '',
      currency: parsed.currency,
      sector: '',
      industry: subs.sicDescription || '',
      description: '',
      website: subs.website || '',
      country: subs.addresses?.business?.stateOrCountryDescription || '',
      employees: null,
      ipoDate: null,
      logo: '',
      beta: null,
      sharesOutstanding: parsed.sharesOutstanding,
    },
    quote: { price: null, change: null, changePercent: null, marketCap: null, asOf: null },
    income: parsed.income,
    balance: parsed.balance,
    cashflow: parsed.cashflow,
    segments: { product: null, geographic: null },
  };
  return completeRows(company);
}
