// Lesson menu (left) and previous/next buttons, shared by every page in /learn.
const LESSONS = [
  { group: 'Start here' },
  { id: 'start', href: '/learn/', title: 'How to use this course' },
  { group: 'Money & markets' },
  { id: 'branches', href: '/learn/branches-of-finance.html', title: 'The branches of finance' },
  { id: 'markets', href: '/learn/financial-markets.html', title: 'Primary & secondary markets' },
  { id: 'stocks', href: '/learn/stocks.html', title: 'What is a stock?' },
  { id: 'bonds', href: '/learn/bonds.html', title: 'What is a bond?' },
  { id: 'gold', href: '/learn/gold-and-silver.html', title: 'Gold & silver: 2,600 years' },
  { id: 'funds', href: '/learn/funds-and-risk.html', title: 'Funds, risk & interest rates' },
  { group: 'The 3 financial statements' },
  { id: 'income', href: '/learn/income-statement.html', title: 'Income statement' },
  { id: 'balance', href: '/learn/balance-sheet.html', title: 'Balance sheet' },
  { id: 'cash', href: '/learn/cash-flow.html', title: 'Cash flow statement' },
  { group: 'Ratios' },
  { id: 'ratios', href: '/learn/ratios.html', title: 'Profitability, debt & solvency' },
  { group: 'Valuation' },
  { id: 'valuation', href: '/learn/valuation.html', title: 'Multiples: P/E, EV/EBITDA' },
  { id: 'dcf', href: '/learn/dcf.html', title: 'DCF step by step (WACC)' },
  { group: 'Real companies' },
  { id: 'industries', href: '/learn/industries.html', title: 'Every industry is different' },
  { id: 'cases', href: '/learn/case-studies.html', title: 'The economic cycle' },
];

const current = document.body.dataset.lesson;
const steps = LESSONS.filter((l) => l.id);
const idx = steps.findIndex((l) => l.id === current);

const nav = document.getElementById('lesson-nav');
if (nav) {
  nav.innerHTML = `<ol>${LESSONS.map((l) => (l.group
    ? `<li class="group" aria-hidden="true" style="counter-increment:none">${l.group}</li>`
    : `<li><a href="${l.href}"${l.id === current ? ' aria-current="page"' : ''}>${l.title}</a></li>`)).join('')}</ol>`;
}

const pager = document.getElementById('lesson-pager');
if (pager && idx >= 0) {
  const prev = steps[idx - 1], next = steps[idx + 1];
  pager.innerHTML = `${prev ? `<a class="btn btn-ghost" href="${prev.href}">← ${prev.title}</a>` : '<span></span>'}
    ${next ? `<a class="btn btn-primary" href="${next.href}">Next: ${next.title} →</a>` : '<a class="btn btn-primary" href="/analyze/">Now analyze a real company →</a>'}`;
}
