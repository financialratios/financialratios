// Lesson menu (left) and previous/next buttons, shared by every page in /learn.
const LESSONS = [
  { group: 'Start here' },
  { id: 'start', href: '/learn/', title: 'How to use this course' },
  { group: 'The 3 financial statements' },
  { id: 'income', href: '/learn/income-statement.html', title: 'Income statement' },
  { id: 'balance', href: '/learn/balance-sheet.html', title: 'Balance sheet' },
  { id: 'cash', href: '/learn/cash-flow.html', title: 'Cash flow statement' },
  { group: 'Ratios' },
  { id: 'ratios', href: '/learn/ratios.html', title: 'Profitability, debt & solvency' },
  { group: 'Valuation' },
  { id: 'valuation', href: '/learn/valuation.html', title: 'P/E, EV/EBITDA & DCF' },
  { group: 'Real companies' },
  { id: 'cases', href: '/learn/case-studies.html', title: 'Cyclical vs defensive vs growth' },
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
