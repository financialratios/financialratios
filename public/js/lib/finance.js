// Every formula on the site lives here, so the calculators, the lessons and the company
// analysis all use exactly the same maths (and the tests check it once).

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const safeDiv = (a, b) => (isNum(a) && isNum(b) && b !== 0 ? a / b : null);
export const average = (xs) => {
  const v = xs.filter(isNum);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};
export const stdev = (xs) => {
  const v = xs.filter(isNum);
  if (v.length < 2) return null;
  const m = average(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
};

/** Compound annual growth rate: the steady yearly rate that turns `start` into `end` over `years`. */
export function cagr(start, end, years) {
  if (!isNum(start) || !isNum(end) || start <= 0 || end <= 0 || years <= 0) return null;
  return (end / start) ** (1 / years) - 1;
}

/** Year-over-year growth for a list of values (first entry is null). */
export function growthSeries(values) {
  return values.map((v, i) => (i === 0 ? null : isNum(values[i - 1]) && values[i - 1] > 0 && isNum(v) ? v / values[i - 1] - 1 : null));
}

// ---------- Personal-finance calculators ----------

/**
 * Savings with regular monthly deposits.
 * Interest compounds `perYear` times a year; deposits are made at the end of each month.
 * Returns the balance at the end of each year plus totals.
 */
export function compoundGrowth({ initial = 0, monthly = 0, rate = 0, years = 10, perYear = 12 }) {
  const rows = [];
  let balance = initial, deposits = initial;
  // Effective rate per month that matches the chosen compounding frequency.
  const monthlyRate = (1 + rate / perYear) ** (perYear / 12) - 1;
  for (let y = 1; y <= years; y++) {
    for (let m = 0; m < 12; m++) {
      balance = balance * (1 + monthlyRate) + monthly;
      deposits += monthly;
    }
    rows.push({ year: y, balance, deposits, interest: balance - deposits });
  }
  const last = rows[rows.length - 1] || { balance: initial, deposits: initial, interest: 0 };
  return { rows, finalBalance: last.balance, totalDeposits: last.deposits, totalInterest: last.interest };
}

/** Fixed-rate loan payment (the standard annuity formula used by banks). */
export function loanPayment(principal, annualRate, years, perYear = 12) {
  const n = Math.round(years * perYear);
  const r = annualRate / perYear;
  if (n <= 0) return 0;
  if (r === 0) return principal / n;
  return (principal * r * (1 + r) ** n) / ((1 + r) ** n - 1);
}

/** Full repayment schedule summarised per year. */
export function amortization({ principal, rate, years, extraMonthly = 0 }) {
  const payment = loanPayment(principal, rate, years);
  const r = rate / 12;
  let balance = principal, totalInterest = 0, month = 0;
  const rows = [];
  let yInterest = 0, yPrincipal = 0;
  while (balance > 0.005 && month < years * 12 + 1) {
    month++;
    const interest = balance * r;
    const pay = Math.min(payment + extraMonthly, balance + interest);
    const princ = pay - interest;
    balance -= princ;
    totalInterest += interest;
    yInterest += interest;
    yPrincipal += princ;
    if (month % 12 === 0 || balance <= 0.005) {
      rows.push({ year: Math.ceil(month / 12), interest: yInterest, principal: yPrincipal, balance: Math.max(0, balance) });
      yInterest = 0;
      yPrincipal = 0;
    }
  }
  return { payment, months: month, totalInterest, totalPaid: principal + totalInterest, rows };
}

/** Monthly deposit needed to reach `target` in `years`, starting from `current`. */
export function savingsNeeded({ target, current = 0, rate = 0, years }) {
  const n = years * 12;
  const r = rate / 12;
  const fvCurrent = current * (1 + r) ** n;
  const gap = target - fvCurrent;
  if (gap <= 0) return 0;
  return r === 0 ? gap / n : (gap * r) / ((1 + r) ** n - 1);
}

/** Investment return: total return, yearly (CAGR) return. */
export function investmentReturn({ buy, sell, income = 0, years }) {
  const total = safeDiv(sell + income - buy, buy);
  return { profit: sell + income - buy, totalReturn: total, annualReturn: cagr(buy, sell + income, years) };
}

/** Rule of 72 approximation and the exact doubling time. */
export function doublingTime(rate) {
  if (!(rate > 0)) return { rule72: null, exact: null };
  return { rule72: 72 / (rate * 100), exact: Math.log(2) / Math.log(1 + rate) };
}

/** Gain needed to get back to where you started after a loss. */
export const recoveryGain = (loss) => (loss >= 1 ? null : 1 / (1 - loss) - 1);

/** Dividend income over time, optionally reinvesting dividends. */
export function dividendIncome({ invested, yieldRate, dividendGrowth = 0, priceGrowth = 0, years, reinvest = true }) {
  let value = invested, totalDividends = 0, divPerValue = yieldRate;
  const rows = [];
  for (let y = 1; y <= years; y++) {
    const dividend = value * divPerValue;
    totalDividends += dividend;
    value = value * (1 + priceGrowth) + (reinvest ? dividend : 0);
    // Dividend per share grows by dividendGrowth while the price grows by priceGrowth.
    divPerValue = divPerValue * (1 + dividendGrowth) / (1 + priceGrowth);
    rows.push({ year: y, dividend, value, totalDividends });
  }
  return { rows, finalValue: value, totalDividends, lastYearIncome: rows.length ? rows[rows.length - 1].dividend : 0 };
}

// ---------- Company valuation ----------

/**
 * Discounted cash flow (two-stage):
 *  - years 1..highYears: revenue grows at `growth`
 *  - remaining years to `years`: growth fades in a straight line to `terminalGrowth`
 *  - free cash flow = revenue x fcfMargin
 *  - after the last year: Gordon growth terminal value
 */
export function dcf({ revenue, growth, fcfMargin, discount, terminalGrowth, years = 10, highYears = 5, netDebt = 0, shares }) {
  if (!isNum(revenue) || !isNum(growth) || !isNum(fcfMargin) || !isNum(discount) || !isNum(terminalGrowth)) return null;
  if (discount <= terminalGrowth) return { error: 'The discount rate must be higher than the long-term growth rate.' };
  const rows = [];
  let rev = revenue, pvSum = 0;
  for (let y = 1; y <= years; y++) {
    const g = y <= highYears ? growth : growth + ((terminalGrowth - growth) * (y - highYears)) / (years - highYears);
    rev *= 1 + g;
    const fcf = rev * fcfMargin;
    const factor = (1 + discount) ** y;
    const pv = fcf / factor;
    pvSum += pv;
    rows.push({ year: y, growth: g, revenue: rev, fcf, pv });
  }
  const lastFcf = rows[rows.length - 1].fcf;
  const terminalValue = (lastFcf * (1 + terminalGrowth)) / (discount - terminalGrowth);
  const pvTerminal = terminalValue / (1 + discount) ** years;
  const enterpriseValue = pvSum + pvTerminal;
  const equityValue = enterpriseValue - (netDebt || 0);
  return {
    rows, pvSum, terminalValue, pvTerminal, enterpriseValue, equityValue,
    perShare: shares ? equityValue / shares : null,
    terminalShare: safeDiv(pvTerminal, enterpriseValue),
  };
}

/** Simple earnings-based value: grow EPS, apply an exit P/E, discount back. */
export function epsValue({ eps, growth, years, exitPE, discount }) {
  const futureEps = eps * (1 + growth) ** years;
  const futurePrice = futureEps * exitPE;
  return { futureEps, futurePrice, presentValue: futurePrice / (1 + discount) ** years };
}

// ---------- Ratios from financial statements ----------

/** Ratios for every year in the company data. Missing inputs give null, never a made-up number. */
export function yearlyRatios(company) {
  const byYear = (rows) => new Map(rows.map((r) => [r.fiscalYear, r]));
  const bal = byYear(company.balance), cf = byYear(company.cashflow);
  let prevBal = null;
  return company.income.map((inc) => {
    const b = bal.get(inc.fiscalYear) || {};
    const c = cf.get(inc.fiscalYear) || {};
    const avg = (k) => (prevBal && isNum(prevBal[k]) && isNum(b[k]) ? (prevBal[k] + b[k]) / 2 : b[k]);
    const taxRate = safeDiv(inc.incomeTax, inc.pretaxIncome);
    const t = isNum(taxRate) ? Math.min(Math.max(taxRate, 0), 0.5) : 0.21;
    const cashLike = (b.cash || 0) + (b.shortTermInvestments || 0);
    // A balance sheet with no borrowings reported means the company has no debt (not "unknown").
    const hasBalance = isNum(b.totalAssets) || isNum(b.totalLiabilities);
    const debt = isNum(b.totalDebt) ? b.totalDebt : hasBalance ? 0 : null;
    const investedCapital = isNum(b.totalEquity) ? b.totalEquity + (debt || 0) - cashLike : null;
    const divs = isNum(c.dividendsPaid) ? Math.abs(c.dividendsPaid) : isNum(c.operatingCashFlow) ? 0 : null;
    const r = {
      fiscalYear: inc.fiscalYear,
      // Profitability
      grossMargin: safeDiv(inc.grossProfit, inc.revenue),
      operatingMargin: safeDiv(inc.operatingIncome, inc.revenue),
      ebitdaMargin: safeDiv(inc.ebitda, inc.revenue),
      netMargin: safeDiv(inc.netIncome, inc.revenue),
      roe: isNum(avg('totalEquity')) && avg('totalEquity') > 0 ? safeDiv(inc.netIncome, avg('totalEquity')) : null,
      roa: safeDiv(inc.netIncome, avg('totalAssets')),
      roic: isNum(investedCapital) && investedCapital > 0 && isNum(inc.operatingIncome) ? (inc.operatingIncome * (1 - t)) / investedCapital : null,
      // Liquidity
      currentRatio: safeDiv(b.totalCurrentAssets, b.totalCurrentLiabilities),
      quickRatio: isNum(b.totalCurrentAssets) ? safeDiv(b.totalCurrentAssets - (b.inventory || 0), b.totalCurrentLiabilities) : null,
      cashRatio: safeDiv(cashLike, b.totalCurrentLiabilities),
      // Indebtedness & solvency
      debtToEquity: isNum(b.totalEquity) && b.totalEquity > 0 ? safeDiv(debt, b.totalEquity) : null,
      debtToAssets: safeDiv(debt, b.totalAssets),
      liabilitiesToAssets: safeDiv(b.totalLiabilities, b.totalAssets),
      netDebtToEbitda: isNum(debt) && isNum(inc.ebitda) && inc.ebitda > 0 ? (debt - cashLike) / inc.ebitda : null,
      interestCoverage: isNum(inc.interestExpense) && inc.interestExpense > 0 ? safeDiv(inc.operatingIncome, Math.abs(inc.interestExpense)) : null,
      equityRatio: safeDiv(b.totalEquity, b.totalAssets),
      // Efficiency & cash
      assetTurnover: safeDiv(inc.revenue, avg('totalAssets')),
      fcfMargin: safeDiv(c.freeCashFlow, inc.revenue),
      cashConversion: isNum(inc.netIncome) && inc.netIncome > 0 ? safeDiv(c.freeCashFlow, inc.netIncome) : null,
      capexToRevenue: isNum(c.capitalExpenditure) ? safeDiv(Math.abs(c.capitalExpenditure), inc.revenue) : null,
      payoutRatio: isNum(divs) && isNum(inc.netIncome) && inc.netIncome > 0 ? divs / inc.netIncome : null,
    };
    prevBal = b;
    return r;
  });
}

/** Growth and stability facts over the whole history. */
export function historySummary(company) {
  const rev = company.income.map((r) => r.revenue);
  const ni = company.income.map((r) => r.netIncome);
  const eps = company.income.map((r) => r.epsDiluted ?? r.eps);
  const fcf = company.cashflow.map((r) => r.freeCashFlow);
  const years = company.income.map((r) => r.fiscalYear);
  // Only years where revenue was actually reported count: a missing year must not break the averages.
  const valid = rev.map((v, i) => (isNum(v) && v > 0 ? i : -1)).filter((i) => i >= 0);
  const firstIdx = valid.length ? valid[0] : -1;
  const lastIdx = valid.length ? valid[valid.length - 1] : -1;
  const span = firstIdx >= 0 ? years[lastIdx] - years[firstIdx] : 0;
  // Last 5 years: from the latest reported year back to the reported year closest to 5 years earlier.
  const start5 = valid.find((i) => years[lastIdx] - years[i] <= 5) ?? firstIdx;
  const span5 = start5 >= 0 ? years[lastIdx] - years[start5] : 0;
  const g = growthSeries(rev);
  const validGrowth = g.filter(isNum);
  const between = (arr) => (span > 0 ? cagr(arr[firstIdx], arr[lastIdx], span) : null);
  return {
    years,
    span,
    revenueCagr: span > 0 ? cagr(rev[firstIdx], rev[lastIdx], span) : null,
    revenueCagr5: span5 > 0 ? cagr(rev[start5], rev[lastIdx], span5) : null,
    cagr5From: start5 >= 0 ? { year: years[start5], value: rev[start5] } : null,
    cagr5To: lastIdx >= 0 ? { year: years[lastIdx], value: rev[lastIdx] } : null,
    span5,
    revenueAvgGrowth: average(validGrowth),
    revenueGrowthStdev: stdev(validGrowth),
    revenueDownYears: validGrowth.filter((x) => x < 0).length,
    revenueGrowth: g,
    bestYear: validGrowth.length ? Math.max(...validGrowth) : null,
    worstYear: validGrowth.length ? Math.min(...validGrowth) : null,
    netIncomeCagr: between(ni),
    lossYears: ni.filter((x) => isNum(x) && x < 0).length,
    epsCagr: between(eps),
    fcfCagr: between(fcf),
    avgFcfMargin: average(company.income.map((inc, i) => safeDiv(fcf[i], inc.revenue))),
    avgFcfMargin5: average(company.income.map((inc, i) => (years[lastIdx] - years[i] < 5 ? safeDiv(fcf[i], inc.revenue) : null))),
  };
}

/** Valuation multiples at today's price, using the latest annual report. */
export function currentValuation(company) {
  const inc = company.income[company.income.length - 1] || {};
  const b = company.balance[company.balance.length - 1] || {};
  const c = company.cashflow[company.cashflow.length - 1] || {};
  const price = company.quote?.price;
  const shares = company.profile?.sharesOutstanding || inc.sharesDiluted;
  // fx = units of the trading currency per 1 unit of the reporting currency (1 when they match).
  const mismatch = company.reportingCurrency && company.profile?.currency && company.reportingCurrency !== company.profile.currency;
  const fx = isNum(company.fx) && company.fx > 0 ? company.fx : mismatch ? null : 1;
  const quoteCap = company.quote?.marketCap || (isNum(price) && isNum(shares) ? price * shares : null);
  // Every multiple below compares numbers in the currency of the financial statements.
  const marketCap = isNum(quoteCap) && fx ? quoteCap / fx : null;
  const cashLike = (b.cash || 0) + (b.shortTermInvestments || 0);
  const netDebt = isNum(b.totalDebt) ? b.totalDebt - cashLike : -cashLike;
  const ev = isNum(marketCap) ? marketCap + netDebt : null;
  const pos = (x) => (isNum(x) && x > 0 ? x : null);
  return {
    price, shares, marketCap, netDebt, enterpriseValue: ev, fx,
    // Shares measured in the units the price is quoted in (handles ADRs and share classes).
    priceShares: isNum(quoteCap) && isNum(price) && price > 0 ? quoteCap / price : shares,
    pe: pos(inc.netIncome) ? safeDiv(marketCap, inc.netIncome) : null,
    ps: safeDiv(marketCap, pos(inc.revenue)),
    pb: safeDiv(marketCap, pos(b.totalEquity)),
    evEbitda: safeDiv(ev, pos(inc.ebitda)),
    evSales: safeDiv(ev, pos(inc.revenue)),
    fcfYield: safeDiv(c.freeCashFlow, marketCap),
    earningsYield: safeDiv(inc.netIncome, marketCap),
    dividendYield: isNum(c.dividendsPaid) ? safeDiv(Math.abs(c.dividendsPaid), marketCap) : null,
  };
}

/** Price on (or just before) a date, from sorted daily prices. */
export function priceOn(prices, date) {
  const { dates, close } = prices;
  let lo = 0, hi = dates.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] <= date) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 ? close[ans] : null;
}

/** P/E and EV/EBITDA at each fiscal year end, using that day's share price. */
export function historicalMultiples(company, prices) {
  const bal = new Map(company.balance.map((r) => [r.fiscalYear, r]));
  return splitAdjustedIncome(company.income).map((inc) => {
    const price = inc.date ? priceOn(prices, inc.date) : null;
    const b = bal.get(inc.fiscalYear) || {};
    const shares = inc.sharesDiluted;
    const mcap = isNum(price) && isNum(shares) ? price * shares : null;
    const cashLike = (b.cash || 0) + (b.shortTermInvestments || 0);
    const ev = isNum(mcap) ? mcap + (b.totalDebt || 0) - cashLike : null;
    const eps = inc.epsDiluted ?? inc.eps;
    return {
      fiscalYear: inc.fiscalYear,
      price,
      pe: isNum(eps) && eps > 0 ? safeDiv(price, eps) : null,
      evEbitda: isNum(inc.ebitda) && inc.ebitda > 0 ? safeDiv(ev, inc.ebitda) : null,
      ps: isNum(inc.revenue) && inc.revenue > 0 ? safeDiv(mcap, inc.revenue) : null,
    };
  });
}

/**
 * Old annual reports show EPS and share counts from before later stock splits, while price
 * histories are split-adjusted. Detect splits from jumps in the share count (e.g. ×4) and
 * restate earlier years, so historical P/E uses consistent numbers. Returns a new income list.
 */
export function splitAdjustedIncome(income) {
  const RATIOS = [1.5, 2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 25, 30, 40, 50];
  const out = income.map((r) => ({ ...r }));
  let factor = 1;
  for (let i = out.length - 1; i > 0; i--) {
    const a = income[i - 1].sharesDiluted, b = income[i].sharesDiluted;
    if (isNum(a) && isNum(b) && a > 0) {
      const jump = b / a;
      const k = RATIOS.find((x) => Math.abs(jump / x - 1) < 0.04);
      if (k) factor *= k;
    }
    if (factor !== 1) {
      const r = out[i - 1];
      if (isNum(r.sharesDiluted)) r.sharesDiluted *= factor;
      if (isNum(r.eps)) r.eps /= factor;
      if (isNum(r.epsDiluted)) r.epsDiluted /= factor;
    }
  }
  return out;
}

/**
 * Dividends per share added up by calendar year, from a list of [date, amount] payments.
 * Also: first year paid, consecutive years of increases (ignoring the unfinished current year)
 * and the yearly growth over the last 10 complete years.
 */
export function dividendHistory(payments, today = new Date()) {
  const byYear = new Map();
  for (const [date, amount] of payments || []) {
    const y = Number(String(date).slice(0, 4));
    if (Number.isFinite(y) && isNum(amount)) byYear.set(y, (byYear.get(y) || 0) + amount);
  }
  const thisYear = today.getFullYear();
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const rows = years.map((y) => ({ year: y, amount: byYear.get(y), partial: y === thisYear }));
  const full = rows.filter((r) => !r.partial);
  let streak = 0;
  for (let i = full.length - 1; i > 0; i--) {
    if (full[i].year - full[i - 1].year === 1 && full[i].amount > full[i - 1].amount * 1.0001) streak++;
    else break;
  }
  const last = full[full.length - 1];
  const tenAgo = last ? full.find((r) => r.year === last.year - 10) : null;
  return {
    rows,
    firstYear: years[0] ?? null,
    lastFullYear: last?.year ?? null,
    lastFullAmount: last?.amount ?? null,
    increaseStreak: streak,
    cagr10: last && tenAgo ? cagr(tenAgo.amount, last.amount, 10) : null,
  };
}

/**
 * "What if I had invested?": buy at the first close on/after `startDate`, hold until the last price.
 * Dividends paid after the purchase are either kept as cash or reinvested in more shares
 * at that day's price. Prices and dividends are split-adjusted, so splits need no special handling.
 */
export function investmentSince({ prices, dividends = [], startDate, amount, reinvest = true }) {
  const { dates, close } = prices;
  const i0 = dates.findIndex((d) => d >= startDate);
  if (i0 < 0 || !(amount > 0)) return null;
  const buyPrice = close[i0];
  let shares = amount / buyPrice, cash = 0, received = 0, di = 0;
  const divs = dividends.filter(([d]) => d > dates[i0]);
  const series = [];
  const step = Math.max(1, Math.floor((dates.length - i0) / 400));
  for (let i = i0; i < dates.length; i++) {
    while (di < divs.length && divs[di][0] <= dates[i]) {
      const pay = shares * divs[di][1];
      received += pay;
      if (reinvest) shares += pay / close[i];
      else cash += pay;
      di++;
    }
    if ((i - i0) % step === 0 || i === dates.length - 1) series.push([dates[i], shares * close[i] + cash]);
  }
  const last = dates.length - 1;
  const value = shares * close[last] + cash;
  const years = (Date.parse(dates[last]) - Date.parse(dates[i0])) / 3.15576e10;
  return {
    buyDate: dates[i0], buyPrice, endDate: dates[last], endPrice: close[last],
    sharesBought: amount / buyPrice, sharesNow: shares, dividendsReceived: received, cash,
    value, profit: value - amount, totalReturn: value / amount - 1,
    annualReturn: years >= 1 ? (value / amount) ** (1 / years) - 1 : null, years,
    priceOnlyReturn: close[last] / buyPrice - 1, series,
  };
}
