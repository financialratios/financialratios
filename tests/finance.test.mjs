import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cagr, compoundGrowth, loanPayment, amortization, savingsNeeded, investmentReturn, doublingTime,
  recoveryGain, dcf, epsValue, yearlyRatios, historySummary, currentValuation, splitAdjustedIncome, priceOn,
} from '../public/js/lib/finance.js';
import { demoCompany } from '../server/demo.mjs';

const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

test('CAGR matches the case-study figures', () => {
  near(cagr(53.8, 64.8, 5), 0.038, 0.001);
  near(cagr(125.8, 245.1, 5), 0.143, 0.001);
  assert.equal(cagr(-1, 5, 3), null);
});

test('compound growth without deposits equals the textbook formula', () => {
  const r = compoundGrowth({ initial: 1000, monthly: 0, rate: 0.05, years: 10, perYear: 1 });
  near(r.finalBalance, 1000 * 1.05 ** 10, 0.001);
  const m = compoundGrowth({ initial: 1000, monthly: 0, rate: 0.12, years: 1, perYear: 12 });
  near(m.finalBalance, 1000 * 1.01 ** 12, 0.001);
});

test('compound growth with deposits equals the annuity formula', () => {
  const r = compoundGrowth({ initial: 0, monthly: 100, rate: 0.06, years: 10, perYear: 12 });
  const i = 0.005, n = 120;
  near(r.finalBalance, 100 * ((1 + i) ** n - 1) / i, 0.01);
  near(r.totalDeposits, 12000, 0.001);
});

test('loan payment: 200k at 6% for 30 years is 1199.10 per month', () => {
  near(loanPayment(200000, 0.06, 30), 1199.10, 0.01);
  near(loanPayment(1200, 0, 1), 100, 1e-9);
  const a = amortization({ principal: 200000, rate: 0.06, years: 30 });
  assert.equal(a.months, 360);
  near(a.rows[a.rows.length - 1].balance, 0, 0.01);
  near(a.totalInterest, 1199.10 * 360 - 200000, 5);
});

test('extra payments shorten the mortgage', () => {
  const a = amortization({ principal: 200000, rate: 0.06, years: 30, extraMonthly: 200 });
  assert.ok(a.months < 300);
});

test('savings needed reaches the target', () => {
  const pmt = savingsNeeded({ target: 100000, current: 5000, rate: 0.05, years: 15 });
  const g = compoundGrowth({ initial: 5000, monthly: pmt, rate: 0.05, years: 15, perYear: 12 });
  near(g.finalBalance, 100000, 1);
  assert.equal(savingsNeeded({ target: 100, current: 1000, rate: 0.05, years: 1 }), 0);
});

test('investment return, doubling time and loss recovery', () => {
  const r = investmentReturn({ buy: 100, sell: 200, income: 0, years: 10 });
  near(r.totalReturn, 1);
  near(r.annualReturn, 2 ** 0.1 - 1, 1e-9);
  near(doublingTime(0.08).rule72, 9);
  near(doublingTime(0.08).exact, 9.006, 0.001);
  near(recoveryGain(0.5), 1);
});

test('DCF reproduces the Rat Bakery lesson (5 years, constant growth)', () => {
  // Lesson 5 grows FCF directly; with fcfMargin = 1 and revenue = FCF the model is identical.
  const r = dcf({ revenue: 58000, growth: 0.05, fcfMargin: 1, discount: 0.1, terminalGrowth: 0.02, years: 5, highYears: 5, netDebt: 40000, shares: 10000 });
  near(r.pvSum, 252771, 1);
  near(r.pvTerminal, 586032, 1);
  near(r.perShare, 79.88, 0.01);
});

test('DCF fades growth to the terminal rate and rejects impossible inputs', () => {
  const r = dcf({ revenue: 100, growth: 0.2, fcfMargin: 0.1, discount: 0.09, terminalGrowth: 0.025, netDebt: 0, shares: 1 });
  near(r.rows[4].growth, 0.2, 1e-9);
  near(r.rows[9].growth, 0.025, 1e-9);
  assert.ok(r.rows[7].growth < r.rows[5].growth);
  assert.ok(dcf({ revenue: 1, growth: 0, fcfMargin: 0.1, discount: 0.02, terminalGrowth: 0.03 }).error);
});

test('EPS model', () => {
  const r = epsValue({ eps: 5, growth: 0, years: 10, exitPE: 20, discount: 0 });
  near(r.presentValue, 100);
});

test('ratios on the demo company are internally consistent', () => {
  const c = demoCompany();
  assert.equal(c.income.length, 10);
  const ratios = yearlyRatios(c);
  const last = ratios[9], inc = c.income[9], bal = c.balance[9];
  near(last.netMargin, inc.netIncome / inc.revenue, 1e-12);
  near(last.currentRatio, bal.totalCurrentAssets / bal.totalCurrentLiabilities, 1e-12);
  near(last.debtToEquity, bal.totalDebt / bal.totalEquity, 1e-12);
  const h = historySummary(c);
  near(h.revenueCagr, (1490 / 820) ** (1 / 9) - 1, 1e-9);
  assert.equal(h.revenueDownYears, 1);
  const v = currentValuation(c);
  assert.ok(v.pe > 0 && v.evEbitda > 0);
});

test('stock splits are detected from share counts', () => {
  const rows = [
    { fiscalYear: 2019, sharesDiluted: 100, epsDiluted: 4 },
    { fiscalYear: 2020, sharesDiluted: 98, epsDiluted: 4.4 },
    { fiscalYear: 2021, sharesDiluted: 392, epsDiluted: 1.2 }, // 4-for-1 split
    { fiscalYear: 2022, sharesDiluted: 385, epsDiluted: 1.3 },
  ];
  const adj = splitAdjustedIncome(rows);
  near(adj[0].epsDiluted, 1, 1e-9);
  near(adj[1].sharesDiluted, 392, 1e-9);
  near(adj[3].epsDiluted, 1.3, 1e-9);
  assert.equal(rows[0].epsDiluted, 4, 'input is not modified');
});

test('priceOn finds the last close on or before a date', () => {
  const p = { dates: ['2024-01-02', '2024-01-03', '2024-01-05'], close: [1, 2, 3] };
  assert.equal(priceOn(p, '2024-01-04'), 2);
  assert.equal(priceOn(p, '2024-01-01'), null);
  assert.equal(priceOn(p, '2030-01-01'), 3);
});
