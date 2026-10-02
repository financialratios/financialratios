// A made-up company used when you type DEMO, so the analysis page can be tried
// (and tested) without any data provider. Every number here is fictional.
import { completeRows } from './normalize.mjs';

const M = 1e6;
const START_YEAR = new Date().getFullYear() - 10;
// Revenue in millions: a mildly cyclical manufacturer with one bad year.
const REVENUE = [820, 905, 990, 1060, 930, 1010, 1180, 1320, 1405, 1490];
const GROSS_MARGIN = [0.38, 0.39, 0.4, 0.4, 0.36, 0.38, 0.41, 0.42, 0.42, 0.43];

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function demoCompany() {
  const income = [], balance = [], cashflow = [];
  let equity = 610 * M, cash = 120 * M, debt = 420 * M;
  const shares = 100 * M;
  REVENUE.forEach((revM, i) => {
    const fiscalYear = START_YEAR + i;
    const date = `${fiscalYear}-12-31`;
    const revenue = revM * M;
    const grossProfit = revenue * GROSS_MARGIN[i];
    const rnd = revenue * 0.05, sga = revenue * 0.16;
    const da = revenue * 0.045;
    const operatingIncome = grossProfit - rnd - sga - da;
    const interestExpense = debt * 0.045;
    const pretaxIncome = operatingIncome - interestExpense;
    const incomeTax = Math.max(0, pretaxIncome * 0.22);
    const netIncome = pretaxIncome - incomeTax;
    income.push({
      fiscalYear, date, revenue, costOfRevenue: revenue - grossProfit, grossProfit,
      researchAndDevelopment: rnd, sellingGeneralAdmin: sga, operatingExpenses: rnd + sga + da,
      operatingIncome, interestExpense, pretaxIncome, incomeTax, netIncome,
      depreciationAmortization: da, ebitda: operatingIncome + da,
      eps: netIncome / shares, epsDiluted: netIncome / (shares * 1.01), sharesDiluted: shares * 1.01,
    });
    const operatingCashFlow = netIncome + da + revenue * 0.01;
    const capex = -revenue * 0.055;
    const dividends = -Math.max(0, netIncome * 0.35);
    const debtChange = i === 4 ? 60 * M : -25 * M;
    debt += debtChange;
    const netChange = operatingCashFlow + capex + dividends + debtChange;
    cash += netChange;
    equity += netIncome + dividends;
    const totalAssets = equity + debt + revenue * 0.18;
    balance.push({
      fiscalYear, date, cash, shortTermInvestments: 0, receivables: revenue * 0.14, inventory: revenue * 0.12,
      totalCurrentAssets: cash + revenue * 0.27, propertyPlantEquipment: totalAssets * 0.42,
      goodwillIntangibles: 150 * M, totalAssets, accountsPayable: revenue * 0.09,
      shortTermDebt: debt * 0.1, totalCurrentLiabilities: revenue * 0.16 + debt * 0.1,
      longTermDebt: debt * 0.9, totalLiabilities: totalAssets - equity, totalEquity: equity, totalDebt: debt,
    });
    cashflow.push({
      fiscalYear, date, netIncome, depreciationAmortization: da, stockBasedCompensation: revenue * 0.005,
      operatingCashFlow, capitalExpenditure: capex, investingCashFlow: capex - 5 * M,
      dividendsPaid: dividends, shareBuybacks: 0, financingCashFlow: dividends + debtChange,
      netChangeInCash: netChange, freeCashFlow: operatingCashFlow + capex,
    });
  });
  const prices = demoPrices();
  const price = prices.close[prices.close.length - 1];
  const prev = prices.close[prices.close.length - 2];
  return completeRows({
    source: 'Sample data (fictional company)',
    isDemo: true,
    profile: {
      symbol: 'DEMO', name: 'Rat Industries (sample company)', exchange: 'Demo Exchange', currency: 'USD',
      sector: 'Industrials', industry: 'Farm & Construction Machinery',
      description: 'Rat Industries is a fictional company that exists only to show how the analysis page works. ' +
        'It builds small tractors and garden machinery, sells spare parts, and earns service fees from maintenance contracts. ' +
        'None of these numbers are real.',
      website: '', country: 'Nowhere', employees: 4200, ipoDate: prices.dates[0], logo: '', beta: 1.1,
      sharesOutstanding: shares,
    },
    quote: { price, change: price - prev, changePercent: ((price - prev) / prev) * 100, marketCap: price * shares, asOf: new Date().toISOString() },
    income, balance, cashflow,
    segments: {
      product: { year: START_YEAR + 9, items: [
        { name: 'Tractors', value: 760 * M }, { name: 'Garden machinery', value: 380 * M },
        { name: 'Spare parts', value: 230 * M }, { name: 'Service contracts', value: 120 * M },
      ] },
      geographic: { year: START_YEAR + 9, items: [
        { name: 'North America', value: 690 * M }, { name: 'Europe', value: 470 * M },
        { name: 'Asia Pacific', value: 240 * M }, { name: 'Rest of world', value: 90 * M },
      ] },
    },
  });
}

export function demoPrices() {
  const rand = seeded(42);
  const dates = [], close = [];
  let p = 8;
  const d = new Date(Date.UTC(2005, 2, 15));
  const end = Date.now();
  while (d.getTime() < end) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) {
      p *= 1 + (rand() - 0.4985) * 0.035;
      dates.push(d.toISOString().slice(0, 10));
      close.push(Math.round(p * 100) / 100);
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return { source: 'Sample data (fictional company)', dates, close };
}
