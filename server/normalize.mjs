// The one data shape every provider returns, so the website never cares where data came from.
//
// company = {
//   source, isDemo,
//   profile: { symbol, name, exchange, currency, sector, industry, description, website,
//              country, employees, ipoDate, logo, sharesOutstanding, beta },
//   quote:   { price, change, changePercent, marketCap, asOf },
//   income:   [ { fiscalYear, date, ...INCOME_FIELDS } ]   oldest -> newest
//   balance:  [ { fiscalYear, date, ...BALANCE_FIELDS } ]
//   cashflow: [ { fiscalYear, date, ...CASHFLOW_FIELDS } ]
//   segments: { product: { year, items: [{name, value}] } | null,
//               geographic: { year, items: [{name, value}] } | null }
// }

// Field names come from the website's row definitions, so server and pages never disagree.
import { INCOME_ROWS, BALANCE_ROWS, CASHFLOW_ROWS } from '../public/js/rows.js';

export const INCOME_FIELDS = INCOME_ROWS;
export const BALANCE_FIELDS = BALANCE_ROWS;
export const CASHFLOW_FIELDS = CASHFLOW_ROWS;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Fill fields that can be derived from others, so every provider is equally complete. */
export function completeRows(company) {
  for (const r of company.income) {
    if (r.grossProfit == null && r.revenue != null && r.costOfRevenue != null) r.grossProfit = r.revenue - r.costOfRevenue;
    if (r.costOfRevenue == null && r.revenue != null && r.grossProfit != null) r.costOfRevenue = r.revenue - r.grossProfit;
    if (r.ebitda == null && r.operatingIncome != null && r.depreciationAmortization != null) r.ebitda = r.operatingIncome + r.depreciationAmortization;
  }
  for (const r of company.balance) {
    if (r.totalDebt == null && (r.shortTermDebt != null || r.longTermDebt != null)) r.totalDebt = (r.shortTermDebt || 0) + (r.longTermDebt || 0);
    if (r.totalLiabilities == null && r.totalAssets != null && r.totalEquity != null) r.totalLiabilities = r.totalAssets - r.totalEquity;
  }
  const incomeByYear = new Map(company.income.map((r) => [r.fiscalYear, r]));
  for (const r of company.cashflow) {
    const inc = incomeByYear.get(r.fiscalYear);
    if (inc) {
      if (r.netIncome == null) r.netIncome = inc.netIncome;
      if (r.depreciationAmortization == null) r.depreciationAmortization = inc.depreciationAmortization;
      if (inc.depreciationAmortization == null && r.depreciationAmortization != null) {
        inc.depreciationAmortization = r.depreciationAmortization;
        if (inc.ebitda == null && inc.operatingIncome != null) inc.ebitda = inc.operatingIncome + r.depreciationAmortization;
      }
    }
    if (r.freeCashFlow == null && r.operatingCashFlow != null && r.capitalExpenditure != null) {
      r.freeCashFlow = r.operatingCashFlow - Math.abs(r.capitalExpenditure);
    }
  }
  for (const key of ['income', 'balance', 'cashflow']) {
    company[key] = company[key]
      .filter((r) => r.fiscalYear != null)
      .sort((a, b) => a.fiscalYear - b.fiscalYear)
      .slice(-10);
  }
  return company;
}

/** Copy only known fields, coercing anything that is not a finite number to null. */
export function pick(fields, src, extra = {}) {
  const out = { ...extra };
  for (const [key] of fields) out[key] = num(src[key]);
  return out;
}
