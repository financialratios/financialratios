// All calculators are defined in CALCS below. Each page in /calculators just says which one to show
// (<body data-calc="mortgage">); this file builds the form, the answer, the chart and the table.
import {
  compoundGrowth, amortization, loanPayment, savingsNeeded, investmentReturn, doublingTime,
  recoveryGain, dividendIncome, epsValue, isNum,
} from './lib/finance.js';
import { barChart, lineChart, palette } from './charts.js';
import { escapeHtml } from './lib/format.js';

// ---------- currency preference (remembered per visitor) ----------
const CURRENCIES = { USD: '$', EUR: '€', GBP: '£', RON: 'lei ', CHF: 'CHF ', CAD: 'C$', AUD: 'A$', INR: '₹', JPY: '¥' };
let cur = 'USD';
try { cur = localStorage.getItem('fr-currency') || 'USD'; } catch { /* storage blocked: default */ }
const sym = () => CURRENCIES[cur] || '$';
const m = (v, d = 0) => (isNum(v) ? `${v < 0 ? '−' : ''}${sym()}${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })}` : '—');
const p = (v, d = 1) => (isNum(v) ? `${(v * 100).toFixed(d)}%` : '—');
const yrs = (v) => (isNum(v) ? `${v.toFixed(1)} years` : '—');
const short = (v) => {
  const a = Math.abs(v);
  return `${sym()}${a >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : a >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : v.toFixed(0)}`;
};

const REF = {
  investorGov: ['Investor.gov (U.S. SEC) — Compound Interest Calculator', 'https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator'],
  compound: ['Wikipedia — Compound interest', 'https://en.wikipedia.org/wiki/Compound_interest'],
  annuity: ['Wikipedia — Annuity (future value of regular payments)', 'https://en.wikipedia.org/wiki/Annuity'],
  mortgage: ['Wikipedia — Mortgage calculator (monthly payment formula)', 'https://en.wikipedia.org/wiki/Mortgage_calculator'],
  amort: ['Wikipedia — Amortization calculator', 'https://en.wikipedia.org/wiki/Amortization_calculator'],
  cfpb: ['Consumer Financial Protection Bureau — Buying a house', 'https://www.consumerfinance.gov/owning-a-home/'],
  cagr: ['Wikipedia — Compound annual growth rate', 'https://en.wikipedia.org/wiki/Compound_annual_growth_rate'],
  bls: ['U.S. Bureau of Labor Statistics — CPI Inflation Calculator', 'https://www.bls.gov/data/inflation_calculator.htm'],
  ecbInflation: ['European Central Bank — What is inflation?', 'https://www.ecb.europa.eu/ecb-and-you/explainers/tell-me-more/html/what_is_inflation.en.html'],
  r72: ['Wikipedia — Rule of 72', 'https://en.wikipedia.org/wiki/Rule_of_72'],
  divYield: ['Wikipedia — Dividend yield', 'https://en.wikipedia.org/wiki/Dividend_yield'],
  pv: ['Wikipedia — Present value', 'https://en.wikipedia.org/wiki/Present_value'],
  pe: ['Wikipedia — Price–earnings ratio', 'https://en.wikipedia.org/wiki/Price%E2%80%93earnings_ratio'],
  lesson: ['Financial Rat — Lesson 5: valuation step by step', '/learn/valuation.html'],
};

export const CALCS = {
  'compound-interest': {
    title: 'Compound interest calculator', icon: '🌱',
    blurb: 'See how your savings grow when interest earns interest.',
    inputs: [
      { id: 'initial', label: 'Money you start with', type: 'money', value: 10000 },
      { id: 'monthly', label: 'Money you add every month', type: 'money', value: 200 },
      { id: 'rate', label: 'Yearly interest or return', type: 'pct', value: 7, hint: 'Savings accounts: often 2–4%. Long-run stock market averages have been higher, but are never guaranteed.' },
      { id: 'years', label: 'For how many years', type: 'years', value: 20 },
      { id: 'perYear', label: 'Interest is added', type: 'select', value: 12, options: [[12, 'Every month'], [4, 'Every quarter'], [1, 'Once a year'], [365, 'Every day']] },
    ],
    compute: (v) => {
      const r = compoundGrowth({ initial: v.initial, monthly: v.monthly, rate: v.rate / 100, years: v.years, perYear: v.perYear });
      return {
        answer: { label: `After ${v.years} years you would have`, value: m(r.finalBalance),
          say: `You put in ${m(r.totalDeposits)} yourself. The other ${m(r.totalInterest)} is interest — money earned by your money.` },
        stats: [['You paid in', m(r.totalDeposits)], ['Interest earned', m(r.totalInterest)], ['Interest share of total', p(r.totalInterest / r.finalBalance, 0)]],
        chart: { type: 'bar', stacked: true, labels: r.rows.map((x) => `Year ${x.year}`), datasets: [
          { label: 'Your deposits', data: r.rows.map((x) => x.deposits), color: 'blue' },
          { label: 'Interest earned', data: r.rows.map((x) => x.interest), color: 'brand' }] },
        table: { head: ['Year', 'Paid in so far', 'Interest so far', 'Balance'], rows: r.rows.map((x) => [x.year, m(x.deposits), m(x.interest), m(x.balance)]) },
      };
    },
    explain: `<p><b>Compound interest</b> means you earn interest not only on the money you put in, but also on the interest you already earned.
      At first growth looks slow; after many years the interest becomes bigger than your own deposits. Time is the most powerful ingredient — starting 10 years earlier often matters more than saving a bit more each month.</p>`,
    formula: `Balance after each month = previous balance × (1 + monthly rate) + monthly deposit<br>
      Without deposits: <span class="eq">A = P × (1 + r/n)<sup>n×t</sup></span> — P: starting money, r: yearly rate, n: times interest is added per year, t: years.`,
    refs: ['investorGov', 'compound', 'annuity'],
  },

  mortgage: {
    title: 'Mortgage calculator', icon: '🏠',
    blurb: 'Your monthly home loan payment, total interest and payoff schedule.',
    inputs: [
      { id: 'price', label: 'Home price', type: 'money', value: 300000 },
      { id: 'down', label: 'Down payment', type: 'pct', value: 20, hint: 'The part you pay yourself, as a % of the price.' },
      { id: 'rate', label: 'Interest rate (yearly)', type: 'pct', value: 6.5, step: 0.05 },
      { id: 'years', label: 'Loan length', type: 'select', value: 30, options: [[10, '10 years'], [15, '15 years'], [20, '20 years'], [25, '25 years'], [30, '30 years'], [35, '35 years']] },
      { id: 'tax', label: 'Property tax per year (optional)', type: 'money', value: 0 },
      { id: 'insurance', label: 'Home insurance per year (optional)', type: 'money', value: 0 },
      { id: 'extra', label: 'Extra payment every month (optional)', type: 'money', value: 0, hint: 'Paying a little extra shortens the loan and saves interest.' },
    ],
    compute: (v) => {
      const loan = v.price * (1 - v.down / 100);
      const a = amortization({ principal: loan, rate: v.rate / 100, years: v.years, extraMonthly: v.extra });
      const base = v.extra ? amortization({ principal: loan, rate: v.rate / 100, years: v.years }) : a;
      const monthlyTotal = a.payment + v.extra + v.tax / 12 + v.insurance / 12;
      return {
        answer: { label: 'Your monthly payment', value: m(monthlyTotal),
          say: `You borrow ${m(loan)}. Over ${yrs(a.months / 12)} you repay it plus ${m(a.totalInterest)} of interest to the bank.` },
        stats: [['Loan amount', m(loan)], ['Loan payment (principal + interest)', m(a.payment)], ['Total interest', m(a.totalInterest)], ['Paid off in', yrs(a.months / 12)],
          ...(v.extra ? [['Interest saved by extra payments', m(base.totalInterest - a.totalInterest)]] : [])],
        chart: { type: 'bar', stacked: true, labels: a.rows.map((x) => `Year ${x.year}`), datasets: [
          { label: 'Paid to reduce the loan', data: a.rows.map((x) => x.principal), color: 'brand' },
          { label: 'Paid as interest', data: a.rows.map((x) => x.interest), color: 'accent' }] },
        table: { head: ['Year', 'Interest paid', 'Loan repaid', 'Still owed'], rows: a.rows.map((x) => [x.year, m(x.interest), m(x.principal), m(x.balance)]) },
      };
    },
    explain: `<p>Each monthly payment has two parts: <b>interest</b> (the bank's fee) and <b>principal</b> (repaying the loan itself).
      In the early years most of the payment is interest; by the end, almost all of it repays the loan. This is called <b>amortization</b> — the chart shows it clearly.</p>
      <p>Banks may add fees, insurance or variable rates. Use this as a guide and always ask the lender for the official cost (APR in the US, DAE in Romania, APRC in the EU).</p>`,
    formula: `<span class="eq">M = L × r × (1 + r)<sup>n</sup> ÷ ((1 + r)<sup>n</sup> − 1)</span><br>M: monthly payment, L: loan amount, r: yearly rate ÷ 12, n: number of months.`,
    refs: ['mortgage', 'amort', 'cfpb'],
  },

  loan: {
    title: 'Loan payment calculator', icon: '💳',
    blurb: 'Car loans, personal loans: what you pay each month and in total.',
    inputs: [
      { id: 'amount', label: 'Amount you borrow', type: 'money', value: 15000 },
      { id: 'rate', label: 'Interest rate (yearly)', type: 'pct', value: 9, step: 0.1 },
      { id: 'years', label: 'Years to repay', type: 'years', value: 5 },
    ],
    compute: (v) => {
      const a = amortization({ principal: v.amount, rate: v.rate / 100, years: v.years });
      return {
        answer: { label: 'Monthly payment', value: m(a.payment, 2), say: `In total you pay back ${m(a.totalPaid)}: the ${m(v.amount)} you borrowed plus ${m(a.totalInterest)} of interest.` },
        stats: [['Total interest', m(a.totalInterest)], ['Total paid', m(a.totalPaid)], ['Interest as % of loan', p(a.totalInterest / v.amount)]],
        chart: { type: 'line', labels: ['Start', ...a.rows.map((x) => `Year ${x.year}`)], datasets: [{ label: 'Still owed', data: [v.amount, ...a.rows.map((x) => x.balance)], color: 'accent' }] },
        table: { head: ['Year', 'Interest paid', 'Loan repaid', 'Still owed'], rows: a.rows.map((x) => [x.year, m(x.interest), m(x.principal), m(x.balance)]) },
      };
    },
    explain: `<p>The same formula banks use for fixed-rate loans. A longer loan means a smaller monthly payment but <b>more interest in total</b>. Try changing the years to see the trade-off.</p>`,
    formula: `<span class="eq">M = L × r × (1 + r)<sup>n</sup> ÷ ((1 + r)<sup>n</sup> − 1)</span> — L: amount, r: yearly rate ÷ 12, n: months.`,
    refs: ['amort', 'mortgage'],
  },

  'investment-return': {
    title: 'Investment return calculator', icon: '📈',
    blurb: 'How much did an investment really earn — in total and per year?',
    inputs: [
      { id: 'buy', label: 'What you paid', type: 'money', value: 10000 },
      { id: 'sell', label: 'What it is worth now (or what you sold it for)', type: 'money', value: 16000 },
      { id: 'income', label: 'Dividends or interest received along the way', type: 'money', value: 800 },
      { id: 'years', label: 'Years you held it', type: 'years', value: 6, step: 0.5 },
    ],
    compute: (v) => {
      const r = investmentReturn({ buy: v.buy, sell: v.sell, income: v.income, years: v.years });
      return {
        answer: { label: 'Average yearly return', value: p(r.annualReturn, 2),
          say: `Your money grew by ${p(r.totalReturn)} in total. That is the same as earning ${p(r.annualReturn, 2)} every year for ${v.years} years.` },
        stats: [['Profit', m(r.profit)], ['Total return', p(r.totalReturn)], ['Yearly return (CAGR)', p(r.annualReturn, 2)]],
        chart: { type: 'line', labels: Array.from({ length: Math.ceil(v.years) + 1 }, (_, i) => `Year ${i}`),
          datasets: [{ label: 'Value growing at the yearly return', data: Array.from({ length: Math.ceil(v.years) + 1 }, (_, i) => v.buy * (1 + (r.annualReturn || 0)) ** Math.min(i, v.years)), color: 'brand' }] },
      };
    },
    explain: `<p>"My investment grew 60%!" sounds great — but over 6 years or over 30 years? The <b>yearly return (CAGR)</b> puts every investment on the same scale,
      so you can compare a stock, a flat, and a savings account fairly. Remember to subtract fees and taxes, and compare with inflation.</p>`,
    formula: `Total return = (value now + income − price paid) ÷ price paid<br><span class="eq">CAGR = (ending value ÷ starting value)<sup>1 ÷ years</sup> − 1</span>`,
    refs: ['cagr'],
  },

  'savings-goal': {
    title: 'Savings goal calculator', icon: '🎯',
    blurb: 'How much to save each month to reach a goal: a house, studies, retirement.',
    inputs: [
      { id: 'target', label: 'Your goal', type: 'money', value: 100000 },
      { id: 'current', label: 'Already saved', type: 'money', value: 5000 },
      { id: 'rate', label: 'Expected yearly return', type: 'pct', value: 5 },
      { id: 'years', label: 'Years until you need the money', type: 'years', value: 15 },
    ],
    compute: (v) => {
      const need = savingsNeeded({ target: v.target, current: v.current, rate: v.rate / 100, years: v.years });
      const g = compoundGrowth({ initial: v.current, monthly: need, rate: v.rate / 100, years: v.years, perYear: 12 });
      return {
        answer: { label: 'Save every month', value: m(need),
          say: need === 0 ? 'Good news: what you already saved should reach the goal on its own at this return.' :
            `Saving ${m(need)} a month for ${v.years} years, you pay in ${m(g.totalDeposits)} and the returns add ${m(g.totalInterest)}.` },
        stats: [['Total you pay in', m(g.totalDeposits)], ['Earned from returns', m(g.totalInterest)], ['Per year', m(need * 12)]],
        chart: { type: 'line', labels: ['Now', ...g.rows.map((x) => `Year ${x.year}`)], datasets: [
          { label: 'Savings balance', data: [v.current, ...g.rows.map((x) => x.balance)], color: 'brand', fill: true },
          { label: 'Goal', data: Array(g.rows.length + 1).fill(v.target), color: 'accent', borderDash: [6, 6], pointRadius: 0 }] },
      };
    },
    explain: `<p>Works backwards from your goal. The earlier you start, the more of the goal is paid by returns rather than by you.
      Returns are never guaranteed: try a lower rate too, to see a cautious scenario.</p>`,
    formula: `<span class="eq">Monthly saving = (Goal − Savings × (1 + r)<sup>n</sup>) × r ÷ ((1 + r)<sup>n</sup> − 1)</span> — r: yearly return ÷ 12, n: months.`,
    refs: ['annuity', 'investorGov'],
  },

  inflation: {
    title: 'Inflation calculator', icon: '🛒',
    blurb: 'What will things cost in the future, and what is your money really worth?',
    inputs: [
      { id: 'amount', label: 'Amount of money', type: 'money', value: 1000 },
      { id: 'rate', label: 'Yearly inflation', type: 'pct', value: 3, hint: 'Central banks in the US and the eurozone aim for about 2% a year; actual inflation varies.' },
      { id: 'years', label: 'Years', type: 'years', value: 10 },
    ],
    compute: (v) => {
      const f = (1 + v.rate / 100) ** v.years;
      const rows = Array.from({ length: v.years + 1 }, (_, i) => ({ year: i, cost: v.amount * (1 + v.rate / 100) ** i, power: v.amount / (1 + v.rate / 100) ** i }));
      return {
        answer: { label: `What costs ${m(v.amount)} today will cost`, value: m(v.amount * f),
          say: `And ${m(v.amount)} kept under the mattress will only buy what ${m(v.amount / f)} buys today — a loss of ${p(1 - 1 / f, 0)} of its purchasing power.` },
        stats: [['Future cost', m(v.amount * f)], ['Today\'s value of your money then', m(v.amount / f)], ['Prices double in', yrs(doublingTime(v.rate / 100).exact)]],
        chart: { type: 'line', labels: rows.map((r) => `Year ${r.year}`), datasets: [
          { label: 'Price of the same basket', data: rows.map((r) => r.cost), color: 'red' },
          { label: 'What your money can buy', data: rows.map((r) => r.power), color: 'blue' }] },
        table: { head: ['Year', 'Future cost', 'Purchasing power'], rows: rows.map((r) => [r.year, m(r.cost), m(r.power)]) },
      };
    },
    explain: `<p><b>Inflation</b> is the general rise in prices. It means money that just sits still slowly loses value. This is why investors compare every return
      with inflation: a 4% return with 3% inflation is really only about 1% more buying power.</p>`,
    formula: `<span class="eq">Future cost = Today's cost × (1 + inflation)<sup>years</sup></span><br>Purchasing power = Amount ÷ (1 + inflation)<sup>years</sup>`,
    refs: ['bls', 'ecbInflation'],
  },

  dividend: {
    title: 'Dividend income calculator', icon: '💰',
    blurb: 'How much yearly income a dividend investment could pay over time.',
    inputs: [
      { id: 'invested', label: 'Amount invested', type: 'money', value: 20000 },
      { id: 'yield', label: 'Dividend yield today', type: 'pct', value: 3.5, hint: 'Yearly dividends ÷ share price.' },
      { id: 'divGrowth', label: 'Yearly dividend growth', type: 'pct', value: 5 },
      { id: 'priceGrowth', label: 'Yearly share price growth', type: 'pct', value: 4 },
      { id: 'years', label: 'Years', type: 'years', value: 20 },
      { id: 'reinvest', label: 'Reinvest the dividends', type: 'check', value: true },
    ],
    compute: (v) => {
      const r = dividendIncome({ invested: v.invested, yieldRate: v.yield / 100, dividendGrowth: v.divGrowth / 100, priceGrowth: v.priceGrowth / 100, years: v.years, reinvest: v.reinvest });
      return {
        answer: { label: `Dividend income in year ${v.years}`, value: m(r.lastYearIncome),
          say: `In the first year you would receive about ${m(r.rows[0]?.dividend)}. Over ${v.years} years: ${m(r.totalDividends)} of dividends in total.` },
        stats: [['First-year income', m(r.rows[0]?.dividend)], ['Total dividends', m(r.totalDividends)], ['Investment value at the end', m(r.finalValue)],
          ['Yield on what you paid', p(r.lastYearIncome / v.invested)]],
        chart: { type: 'bar', labels: r.rows.map((x) => `Year ${x.year}`), datasets: [{ label: 'Dividends received', data: r.rows.map((x) => x.dividend), color: 'accent' }] },
        table: { head: ['Year', 'Dividends that year', 'Total dividends', 'Investment value'], rows: r.rows.map((x) => [x.year, m(x.dividend), m(x.totalDividends), m(x.value)]) },
      };
    },
    explain: `<p>A <b>dividend</b> is the part of profit a company pays to its shareholders in cash. If the company raises its dividend each year and you reinvest what you receive,
      your income can grow much faster than the dividend itself. Dividends are not guaranteed: companies can cut them in hard times. Taxes are not included here.</p>`,
    formula: `Dividend each year = Investment value × current yield<br>Next year's yield = yield × (1 + dividend growth) ÷ (1 + price growth)`,
    refs: ['divYield'],
  },

  'rule-of-72': {
    title: 'Rule of 72: doubling time', icon: '⏱️',
    blurb: 'How long does it take to double your money (or for prices to double)?',
    inputs: [{ id: 'rate', label: 'Yearly return or growth rate', type: 'pct', value: 8 }],
    compute: (v) => {
      const d = doublingTime(v.rate / 100);
      const rates = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15];
      return {
        answer: { label: 'Your money doubles in about', value: yrs(d.exact), say: `Quick mental maths: 72 ÷ ${v.rate} = ${d.rule72?.toFixed(1)} years. Exact answer: ${d.exact?.toFixed(2)} years.` },
        stats: [['Rule of 72 estimate', yrs(d.rule72)], ['Exact', yrs(d.exact)], ['×4 in', yrs(d.exact * 2)], ['×8 in', yrs(d.exact * 3)]],
        chart: { type: 'bar', labels: rates.map((r) => `${r}%`), datasets: [{ label: 'Years to double', data: rates.map((r) => Math.round(doublingTime(r / 100).exact * 10) / 10), color: 'brand' }] },
        table: { head: ['Rate', 'Rule of 72', 'Exact'], rows: rates.map((r) => [`${r}%`, (72 / r).toFixed(1), doublingTime(r / 100).exact.toFixed(2)]) },
      };
    },
    explain: `<p>A shortcut anyone can do in their head: <b>divide 72 by the yearly rate</b>. At 6%, money doubles in about 12 years. It works for prices too:
      with 3% inflation, prices double in about 24 years. The shortcut is most accurate for rates between about 6% and 10%.</p>`,
    formula: `<span class="eq">Years ≈ 72 ÷ rate (in %)</span><br>Exact: years = ln(2) ÷ ln(1 + rate)`,
    refs: ['r72'],
  },

  'stock-value': {
    title: 'Stock value calculator (earnings model)', icon: '💎',
    blurb: 'A simple, transparent estimate of a share\'s value from its earnings.',
    inputs: [
      { id: 'eps', label: 'Earnings per share (EPS) today', type: 'money', value: 5, step: 0.01, hint: 'Find it on any company page in "Analyze".' },
      { id: 'growth', label: 'Yearly EPS growth you expect', type: 'pct', value: 8 },
      { id: 'years', label: 'Years to look ahead', type: 'years', value: 10 },
      { id: 'pe', label: 'P/E ratio at the end', type: 'number', value: 18, step: 0.5, hint: 'What investors might pay per $1 of earnings then.' },
      { id: 'discount', label: 'Return you want each year (discount rate)', type: 'pct', value: 9 },
      { id: 'price', label: 'Current share price (optional)', type: 'money', value: 0, step: 0.01 },
    ],
    compute: (v) => {
      const r = epsValue({ eps: v.eps, growth: v.growth / 100, years: v.years, exitPE: v.pe, discount: v.discount / 100 });
      const implied = v.price > 0 ? (r.futurePrice / v.price) ** (1 / v.years) - 1 : null;
      return {
        answer: { label: `Value today if you want ${v.discount}% a year`, value: m(r.presentValue, 2),
          say: `If EPS grows ${v.growth}% a year it reaches ${m(r.futureEps, 2)} in ${v.years} years; at a P/E of ${v.pe} a share would then be priced at ${m(r.futurePrice, 2)}.` +
            (implied != null ? ` Bought at ${m(v.price, 2)}, that path would mean about ${p(implied)} a year (before dividends).` : '') },
        stats: [['EPS in the future', m(r.futureEps, 2)], ['Future share price', m(r.futurePrice, 2)], ['Value today', m(r.presentValue, 2)],
          ...(implied != null ? [['Yearly return at current price', p(implied)]] : [])],
        chart: { type: 'line', labels: Array.from({ length: v.years + 1 }, (_, i) => `Year ${i}`),
          datasets: [{ label: 'EPS path', data: Array.from({ length: v.years + 1 }, (_, i) => v.eps * (1 + v.growth / 100) ** i), color: 'brand' }] },
      };
    },
    explain: `<p>This is a simplified valuation: it assumes earnings grow steadily and investors pay a certain P/E at the end. It shows how the result depends on <b>your</b> assumptions — it is not a prediction.
      Dividends are ignored, so for dividend payers the value is understated. For the full method see <a href="/learn/valuation.html">lesson 5</a>.</p>`,
    formula: `Future EPS = EPS × (1 + g)<sup>years</sup><br>Future price = Future EPS × P/E<br><span class="eq">Value today = Future price ÷ (1 + discount rate)<sup>years</sup></span>`,
    refs: ['pv', 'pe', 'lesson'],
  },

  'loss-recovery': {
    title: 'Loss recovery calculator', icon: '🩹',
    blurb: 'Why a 50% loss needs a 100% gain to get back to where you started.',
    inputs: [{ id: 'loss', label: 'How much the investment fell', type: 'pct', value: 30, max: 99 }],
    compute: (v) => {
      const g = recoveryGain(v.loss / 100);
      const losses = [5, 10, 20, 30, 40, 50, 60, 75, 90];
      return {
        answer: { label: 'Gain needed to get back to even', value: p(g), say: `${m(100)} that falls ${v.loss}% becomes ${m(100 - v.loss)}. To grow back to ${m(100)}, it must rise ${p(g)}.` },
        stats: [['Years to recover at 7%/yr', yrs(Math.log(1 + g) / Math.log(1.07))], ['Years to recover at 10%/yr', yrs(Math.log(1 + g) / Math.log(1.1))]],
        chart: { type: 'bar', labels: losses.map((l) => `−${l}%`), datasets: [{ label: 'Gain needed', data: losses.map((l) => Math.round(recoveryGain(l / 100) * 1000) / 10), color: 'red' }], yPct: true },
        table: { head: ['Loss', 'Gain needed'], rows: losses.map((l) => [`−${l}%`, p(recoveryGain(l / 100))]) },
      };
    },
    explain: `<p>Losses and gains are not symmetrical, because the gain is calculated on a smaller amount. This simple fact is why investors pay so much attention to avoiding large losses — and why debt-heavy companies, which can lose a lot in a downturn, carry more risk.</p>`,
    formula: `<span class="eq">Gain needed = 1 ÷ (1 − loss) − 1</span>`,
    refs: ['cagr'],
  },
};

// ---------- rendering ----------

function inputHtml(def) {
  const id = `in-${def.id}`;
  const hint = def.hint ? `<span class="hint">${def.hint}</span>` : '';
  if (def.type === 'select') {
    return `<div><label for="${id}">${def.label}</label><select id="${id}" data-id="${def.id}">${def.options.map(([val, text]) => `<option value="${val}"${val === def.value ? ' selected' : ''}>${text}</option>`).join('')}</select>${hint}</div>`;
  }
  if (def.type === 'check') {
    return `<div><label class="check"><input type="checkbox" id="${id}" data-id="${def.id}"${def.value ? ' checked' : ''}> ${def.label}</label>${hint}</div>`;
  }
  const unit = def.type === 'money' ? sym().trim() : def.type === 'pct' ? '%' : def.type === 'years' ? 'yrs' : '';
  const step = def.step ?? (def.type === 'pct' ? 0.1 : def.type === 'years' ? 1 : def.type === 'money' ? 100 : 1);
  const max = def.max ?? (def.type === 'years' ? 60 : def.type === 'pct' ? 100 : '');
  return `<div><label for="${id}">${def.label}</label>
    <div class="input-unit${def.type === 'money' ? ' prefix' : ''}"><input type="number" inputmode="decimal" id="${id}" data-id="${def.id}" value="${def.value}" min="${def.min ?? 0}" ${max !== '' ? `max="${max}"` : ''} step="${step}">
    ${unit ? `<span class="unit">${unit}</span>` : ''}</div>${hint}</div>`;
}

function readValues(form, calc) {
  const v = {};
  for (const def of calc.inputs) {
    const el = form.querySelector(`[data-id="${def.id}"]`);
    if (def.type === 'check') v[def.id] = el.checked;
    else {
      let n = Number(el.value);
      if (!Number.isFinite(n)) n = 0;
      if (def.max != null) n = Math.min(n, def.max);
      if (def.type === 'years') n = Math.max(def.step ? 0.5 : 1, Math.min(60, def.step ? n : Math.round(n)));
      v[def.id] = Math.max(def.min ?? 0, n);
    }
  }
  return v;
}

function renderCalculator(root, key) {
  const calc = CALCS[key];
  const currencyPicker = `<div><label for="in-currency">Currency</label><select id="in-currency">${Object.keys(CURRENCIES).map((c) => `<option${c === cur ? ' selected' : ''}>${c}</option>`).join('')}</select></div>`;
  root.innerHTML = `
    <div class="calc-layout">
      <form class="card calc-form" onsubmit="return false" aria-label="${escapeHtml(calc.title)} inputs">
        ${calc.inputs.map(inputHtml).join('')}
        ${calc.inputs.some((d) => d.type === 'money') ? currencyPicker : ''}
        <p class="hint" style="margin:0">✨ Results update as you type.</p>
      </form>
      <div>
        <div class="answer" aria-live="polite"><div class="label"></div><div class="value"></div><p class="say"></p></div>
        <div class="stats"></div>
        <div class="card"><div class="chart-box"><canvas aria-label="Chart of the result"></canvas></div></div>
        <details class="card" style="margin-top:16px" id="calc-table"><summary style="cursor:pointer;font-weight:800">See the year-by-year table</summary><div class="table-wrap" style="margin-top:12px"></div></details>
      </div>
    </div>
    <div class="narrow" style="margin-top:32px">
      <h2>In plain words</h2>${calc.explain}
      <h2>The formula</h2><div class="formula">${calc.formula}</div>
      <h2>Sources &amp; references</h2>
      <ul class="refs">${calc.refs.map((r) => `<li><a href="${REF[r][1]}" ${REF[r][1].startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>${REF[r][0]}</a></li>`).join('')}</ul>
      <p class="small muted">This calculator is for education. Results are estimates that depend on the numbers you enter; they ignore taxes and fees unless stated.</p>
    </div>`;

  const form = root.querySelector('form');
  const canvas = root.querySelector('canvas');
  const update = () => {
    const out = calc.compute(readValues(form, calc));
    root.querySelector('.answer .label').textContent = out.answer.label;
    root.querySelector('.answer .value').textContent = out.answer.value;
    root.querySelector('.answer .say').textContent = out.answer.say;
    root.querySelector('.stats').innerHTML = out.stats.map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
    const pal = palette();
    const datasets = out.chart.datasets.map((d) => ({ ...d, color: pal[d.color] || d.color, ...(d.fill ? { fill: true } : {}) }));
    const yFormat = out.chart.yPct ? (x) => `${x}%` : key === 'rule-of-72' ? (x) => `${x} yrs` : key === 'stock-value' ? (x) => `${sym()}${Number(x).toFixed(2)}` : short;
    const fn = out.chart.type === 'bar' ? barChart : lineChart;
    fn(canvas, out.chart.labels, datasets, { yFormat, stacked: !!out.chart.stacked });
    const tableBox = root.querySelector('#calc-table');
    if (out.table) {
      tableBox.classList.remove('hidden');
      tableBox.querySelector('.table-wrap').innerHTML = `<table><thead><tr>${out.table.head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${out.table.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    } else tableBox.classList.add('hidden');
  };
  form.addEventListener('input', (e) => {
    if (e.target.id === 'in-currency') {
      cur = e.target.value;
      try { localStorage.setItem('fr-currency', cur); } catch { /* ignore */ }
      root.querySelectorAll('.input-unit.prefix .unit').forEach((u) => { u.textContent = sym().trim(); });
    }
    update();
  });
  update();
}

function renderIndex(root) {
  root.innerHTML = Object.entries(CALCS).map(([key, c]) => `
    <a class="card calc-card" href="/calculators/${key}.html"><div class="icon">${c.icon}</div><div><h3>${c.title}</h3><p>${c.blurb}</p></div></a>`).join('');
}

const root = document.getElementById('calc');
const key = document.body.dataset.calc;
if (root && key && CALCS[key]) renderCalculator(root, key);
const list = document.getElementById('calc-list');
if (list) renderIndex(list);
