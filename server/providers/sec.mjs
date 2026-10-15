// Free fallback: US SEC EDGAR "company facts" API (https://www.sec.gov/search-filings/edgar-application-programming-interfaces).
// No key needed, but the SEC asks every caller to send a User-Agent with a contact email
// (set SEC_USER_AGENT) and to stay under 10 requests per second. US-listed filers only.
// It has no business description; the revenue breakdown comes from the latest annual report's XBRL file.
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

// ---------- Revenue breakdown from the latest annual report's XBRL ----------
// The company-facts API has no segment data, so the breakdown comes from the filing itself: revenue facts
// tagged with a product/segment or geographic dimension, for the latest fiscal year. Labels come from the
// filing's label file ("iPhone"), else from the member name ("IPhoneMember" -> "I Phone").
const SEGMENT_FORMS = new Set(['10-K', '20-F', '40-F', '10-KT']);
const PRODUCT_AXES = ['srt:ProductOrServiceAxis', 'us-gaap:StatementBusinessSegmentsAxis', 'ifrs-full:ProductsAndServicesAxis', 'ifrs-full:SegmentsAxis'];
const GEO_AXES = ['srt:StatementGeographicalAxis', 'ifrs-full:GeographicalAreasAxis'];
// Reconciling lines, not sources of revenue.
const NOT_A_SOURCE = /Elimination|Intersegment|Intercompany|ReconcilingItem|Consolidat|CorporateNonSegment|CorporateAndOther|AllOtherSegments|OperatingSegmentsMember$|SegmentReconcilingItems/i;

const attrs = (s) => Object.fromEntries([...s.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)].map((m) => [m[1], m[2]]));
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
const humanize = (qname) => qname.split(':').pop().replace(/Member$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').trim();

/** Concept labels from a label linkbase: Map('aapl:IPhoneMember' -> 'iPhone'). Terse labels win over standard ones. */
export function parseLabels(xml) {
  const locs = new Map(), labels = new Map(), arcs = [];
  for (const m of xml.matchAll(/<(?:[\w-]+:)?loc\b([^>]*)\/?>/g)) {
    const a = attrs(m[1]);
    const id = (a['xlink:href'] || '').split('#')[1];
    if (id) locs.set(a['xlink:label'], id.replace('_', ':'));
  }
  for (const m of xml.matchAll(/<(?:[\w-]+:)?label\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?label>/g)) {
    const a = attrs(m[1]);
    const role = (a['xlink:role'] || '').split('/').pop();
    if (!labels.has(a['xlink:label'])) labels.set(a['xlink:label'], {});
    labels.get(a['xlink:label'])[role] = decode(m[2].replace(/<[^>]+>/g, ''));
  }
  for (const m of xml.matchAll(/<(?:[\w-]+:)?labelArc\b([^>]*)\/?>/g)) arcs.push(attrs(m[1]));
  const out = new Map();
  for (const a of arcs) {
    const concept = locs.get(a['xlink:from']);
    const l = labels.get(a['xlink:to']);
    if (!concept || !l) continue;
    const text = (l.terseLabel || l.label || '').replace(/\s*\[(Member|Domain|Axis)\]\s*$/i, '');
    if (text && (l.terseLabel || !out.has(concept))) out.set(concept, text);
  }
  return out;
}

/** Drop members that are totals of other members (e.g. "Products" = iPhone + Mac + iPad + ...). */
function dropTotals(items) {
  if (items.length > 16) return items;
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const keep = [];
  for (let i = 0; i < sorted.length; i++) {
    const smaller = sorted.slice(i + 1).map((x) => x.value);
    const target = sorted[i].value;
    let sums = new Set([0]), isTotal = false;
    for (const v of smaller) {
      const next = new Set(sums);
      for (const s of sums) {
        const t = s + v;
        if (Math.abs(t - target) <= target * 0.002 && t !== v) { isTotal = true; break; }
        if (t < target * 1.002) next.add(t);
      }
      if (isTotal) break;
      sums = next;
    }
    if (!isTotal) keep.push(sorted[i]);
  }
  return keep;
}

/**
 * Revenue by product/segment and by region from an XBRL instance document (the `_htm.xml` of a 10-K/20-F).
 * Returns { product, geographic }, each { year, items: [{ name, value }] } or null.
 */
export function parseSegments(xml, labels = new Map()) {
  const contexts = new Map();
  for (const m of xml.matchAll(/<(?:[\w-]+:)?context\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?context>/g)) {
    const body = m[2];
    if (/typedMember/.test(body)) continue;
    const start = body.match(/<(?:[\w-]+:)?startDate>\s*([\d-]+)/)?.[1];
    const end = body.match(/<(?:[\w-]+:)?endDate>\s*([\d-]+)/)?.[1];
    if (!start || !end) continue;
    const len = days(start, end);
    if (len < 340 || len > 390) continue;
    const dims = [...body.matchAll(/<(?:[\w-]+:)?explicitMember\b([^>]*)>\s*([^<\s]+)\s*</g)].map((d) => [attrs(d[1]).dimension, d[2]])
      // "Operating segments" (as opposed to eliminations) adds nothing when a segment is named too.
      .filter(([dim, member]) => !(dim === 'srt:ConsolidationItemsAxis' && member === 'us-gaap:OperatingSegmentsMember'));
    contexts.set(attrs(m[1]).id, { end, dims });
  }
  // Revenue facts, by tag preference: Map(tag -> [{ ctx, value }]).
  const tags = DURATION_TAGS.revenue;
  const facts = [];
  for (const m of xml.matchAll(/<(us-gaap|ifrs-full):([A-Za-z]+)\b([^>]*?)>([^<]*)<\/\1:\2>/g)) {
    const rank = tags.indexOf(m[2]);
    if (rank < 0) continue;
    const a = attrs(m[3]);
    const ctx = contexts.get(a.contextRef);
    const value = Number(m[4].trim());
    if (!ctx || !Number.isFinite(value) || a['xsi:nil'] === 'true') continue;
    facts.push({ rank, ctx, value });
  }
  if (!facts.length) return { product: null, geographic: null };
  const end = facts.reduce((e, f) => (f.ctx.end > e ? f.ctx.end : e), '');
  const fiscalYear = Number(end.slice(0, 4)) - (end.slice(5, 7) === '01' && Number(end.slice(8, 10)) <= 7 ? 1 : 0);

  const byAxis = (axis) => {
    const best = new Map(); // member -> fact with the preferred tag
    for (const f of facts) {
      if (f.ctx.end !== end || f.ctx.dims.length !== 1 || f.ctx.dims[0][0] !== axis) continue;
      const member = f.ctx.dims[0][1];
      const prev = best.get(member);
      if (!prev || f.rank < prev.rank) best.set(member, f);
    }
    const items = [...best.entries()]
      .filter(([member, f]) => f.value > 0 && !NOT_A_SOURCE.test(member))
      .map(([member, f]) => ({ name: labels.get(member) || humanize(member), value: f.value }));
    const clean = dropTotals(items).sort((a, b) => b.value - a.value);
    return clean.length >= 2 ? { year: fiscalYear, items: clean, source: 'SEC' } : null;
  };
  const first = (axes) => axes.map(byAxis).find(Boolean) || null;
  return { product: first(PRODUCT_AXES), geographic: first(GEO_AXES) };
}

async function secText(url, ua, fetchImpl) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': ua } });
  if (!res.ok) throw new Error(`SEC answered ${res.status} for ${url}`);
  return res.text();
}

/** The revenue breakdown from the latest annual report listed in a "submissions" document. */
async function segmentsFromFilings(cik, subs, ua, fetchImpl) {
  const r = subs.filings?.recent;
  if (!r?.form) return null;
  const i = r.form.findIndex((f, k) => SEGMENT_FORMS.has(f) && (r.isXBRL?.[k] ?? 1));
  if (i < 0) return null;
  const dir = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${r.accessionNumber[i].replace(/-/g, '')}`;
  const index = await secFetch(`${dir}/index.json`, ua, fetchImpl);
  const names = (index.directory?.item || []).map((x) => x.name);
  const instance = names.find((n) => n.endsWith('_htm.xml'))
    || names.find((n) => n.endsWith('.xml') && !/_(cal|def|lab|pre)\.xml$|FilingSummary|MetaLinks/i.test(n));
  if (!instance) return null;
  const labFile = names.find((n) => n.endsWith('_lab.xml'));
  const [xml, lab] = await Promise.all([
    secText(`${dir}/${instance}`, ua, fetchImpl),
    labFile ? secText(`${dir}/${labFile}`, ua, fetchImpl).catch(() => '') : '',
  ]);
  const seg = parseSegments(xml, parseLabels(lab));
  return seg.product || seg.geographic ? seg : null;
}

/** Revenue breakdown for a US-listed SEC filer, or null (never throws). */
export async function secSegments(symbol, ua, fetchImpl = fetch) {
  try {
    const list = await secTickers(ua, fetchImpl);
    const hit = list.find((x) => x.symbol === symbol.toUpperCase());
    if (!hit) return null;
    const cik = String(hit.cik).padStart(10, '0');
    const subs = await secFetch(`https://data.sec.gov/submissions/CIK${cik}.json`, ua, fetchImpl);
    return await segmentsFromFilings(cik, subs, ua, fetchImpl);
  } catch { return null; }
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
  const segments = await segmentsFromFilings(cik, subs, ua, fetchImpl).catch(() => null);
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
    segments: segments || { product: null, geographic: null },
  };
  return completeRows(company);
}
