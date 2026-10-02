// Section 3: type a ticker, get an objective analysis.
// Everything shown is calculated from the company's own reported history. No ratings, no verdicts.
import {
  yearlyRatios, historySummary, currentValuation, historicalMultiples, dcf, average, isNum, growthSeries,
} from './lib/finance.js';
import { compact, money, pct, signedPct, times, plain, millions, words, escapeHtml, DASH } from './lib/format.js';
import { barChart, lineChart, donutChart, palette } from './charts.js';
import { INCOME_ROWS, BALANCE_ROWS, CASHFLOW_ROWS, RATIO_ROWS } from './rows.js';
import { downloadExcel, downloadPdf } from './export.js';
import { profileFor, SUGGESTIONS } from './profiles.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const result = $('#result');
const state = {};

async function api(path) {
  const res = await fetch(path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status}).`);
  return body;
}

// ===================== Search with suggestions =====================
function setupSearch() {
  const input = $('#q'), list = $('#suggest'), form = $('#search-form');
  let timer, items = [], active = -1, lastQ = '';
  const close = () => { list.classList.add('hidden'); input.setAttribute('aria-expanded', 'false'); active = -1; };
  const paint = () => {
    list.innerHTML = items.map((it, i) => `<li role="option" id="opt-${i}" aria-selected="${i === active}" data-sym="${escapeHtml(it.symbol)}">
      <span class="sym">${escapeHtml(it.symbol)}</span><span>${escapeHtml(it.name)}</span><span class="ex">${escapeHtml(it.exchange || '')}</span></li>`).join('');
    list.classList.toggle('hidden', !items.length);
    input.setAttribute('aria-expanded', String(!!items.length));
    if (active >= 0) input.setAttribute('aria-activedescendant', `opt-${active}`); else input.removeAttribute('aria-activedescendant');
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 1) { items = []; return close(); }
    timer = setTimeout(async () => {
      lastQ = q;
      try {
        const { results } = await api(`/api/search?q=${encodeURIComponent(q)}`);
        if (lastQ !== q) return;
        items = results || [];
        active = -1;
        paint();
      } catch { items = []; close(); }
    }, 250);
  });
  input.addEventListener('keydown', (e) => {
    if (list.classList.contains('hidden')) return;
    if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); paint(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(-1, active - 1); paint(); e.preventDefault(); }
    else if (e.key === 'Escape') close();
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); go(items[active].symbol); }
  });
  list.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li');
    if (li) { e.preventDefault(); go(li.dataset.sym); }
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q) go(q.includes(' ') && items[0] ? items[0].symbol : q);
  });
  $('#quick-picks').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-t]');
    if (b) go(b.dataset.t);
  });
  function go(sym) {
    close();
    input.value = sym.toUpperCase();
    history.pushState({ t: sym.toUpperCase() }, '', `?t=${encodeURIComponent(sym.toUpperCase())}`);
    load(sym);
  }
}

function compactHero(on) {
  $('#search-hero').style.padding = on ? '20px 0 0' : '';
  ['#search-title', '#search-sub', '.search-hero .eyebrow'].forEach((s) => $(s)?.classList.toggle('hidden', on));
  const d = $('#sugg');
  if (d) d.open = !on;
}

// ===================== Loading =====================
async function load(raw) {
  const symbol = raw.trim().toUpperCase();
  compactHero(true);
  $('#q').value = symbol;
  document.title = `${symbol} — company analysis — Financial Rat`;
  result.innerHTML = `<div class="spinner" role="status" aria-label="Loading"></div><p class="center muted">Collecting 10 years of data for <b>${escapeHtml(symbol)}</b>…</p>`;
  const pricesPromise = api(`/api/prices?symbol=${encodeURIComponent(symbol)}`).catch((e) => ({ error: e.message }));
  let company;
  try {
    company = await api(`/api/company?symbol=${encodeURIComponent(symbol)}`);
  } catch (e) {
    result.innerHTML = `<div class="notice error"><b>We couldn't load ${escapeHtml(symbol)}.</b><br>${escapeHtml(e.message)}
      <br><br>Tips: use the ticker symbol (e.g. <b>AAPL</b> rather than "Apple"), pick a name from the suggestions, or try <a href="?t=DEMO">DEMO</a> to see a sample analysis.</div>`;
    return;
  }
  if (!company.income?.length) {
    result.innerHTML = `<div class="notice error">We found ${escapeHtml(company.profile?.name || symbol)} but no annual financial statements. Funds, ETFs and very new listings usually don't have them.</div>`;
    return;
  }
  Object.assign(state, { company, prices: null });
  render(company);
  const prices = await pricesPromise;
  if (state.company !== company) return; // user searched something else meanwhile
  state.prices = prices.error ? null : prices;
  renderPrices(prices);
  renderMultiplesHistory();
}

// ===================== Rendering =====================
function render(c) {
  // Statements are in the reporting currency; the share price may trade in another one (e.g. ADRs).
  const cur = c.reportingCurrency || c.profile.currency || 'USD';
  const pcur = c.profile.currency || cur;
  const ratios = yearlyRatios(c);
  const hist = historySummary(c);
  const val = currentValuation(c);
  Object.assign(state, { ratios, hist, val, cur, pcur });
  const last = c.income[c.income.length - 1];
  const lastCf = c.cashflow[c.cashflow.length - 1] || {};
  const q = c.quote || {};
  const up = (q.change ?? 0) >= 0;
  const p = c.profile;
  document.title = `${p.name} (${p.symbol}) — analysis — Financial Rat`;

  result.innerHTML = `
  ${pcur !== cur ? `<div class="notice">💱 ${escapeHtml(p.name)} reports its results in <b>${escapeHtml(cur)}</b>, while the shares shown here trade in <b>${escapeHtml(pcur)}</b>.
    ${isNum(val.fx) ? `Valuation numbers convert the market value at today's rate (1 ${escapeHtml(cur)} = ${plain(val.fx, 4)} ${escapeHtml(pcur)}).` : 'The exchange rate could not be loaded, so valuation multiples are not shown.'}</div>` : ''}
  ${c.source === 'Yahoo Finance' ? '<div class="notice">🌍 Non-US company: our free data source provides about the <b>last 4 years</b> of annual statements (US companies get 10 years from the SEC).</div>' : ''}
  ${c.isDemo ? '<div class="notice">🧪 <b>Sample company.</b> Rat Industries and all its numbers are made up, to show how the analysis works. Search a real ticker to analyze a real company.</div>' : ''}
  <div class="card company-head" style="margin-top:16px">
    <div class="name">
      ${p.logo ? `<img src="${escapeHtml(p.logo)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
      <div>
        <h1>${escapeHtml(p.name)}</h1>
        <div class="muted"><b>${escapeHtml(p.symbol)}</b>${p.exchange ? ` · ${escapeHtml(p.exchange)}` : ''} · statements in ${escapeHtml(cur)}${pcur !== cur ? ` · shares trade in ${escapeHtml(pcur)}` : ''}</div>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
          ${p.sector ? `<span class="pill">${escapeHtml(p.sector)}</span>` : ''}${p.industry ? `<span class="pill">${escapeHtml(p.industry)}</span>` : ''}
        </div>
      </div>
    </div>
    <div class="price-box">
      <div>
        <div class="price">${isNum(q.price) ? money(q.price, pcur) : '<span class="muted" style="font-size:1rem">Price unavailable</span>'}</div>
        ${isNum(q.change) ? `<div class="chg ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${money(Math.abs(q.change), pcur)} (${signedPct((q.changePercent || 0) / 100, 2)}) <span class="muted small">last session</span></div>` : ''}
      </div>
      <div class="dl">
        <button class="btn btn-accent" id="dl-btn" aria-haspopup="true" aria-expanded="false">⬇ Download statements</button>
        <div class="dl-menu hidden" id="dl-menu">
          <button data-dl="xlsx">📗 Excel file (.xlsx)<small>Income, balance sheet, cash flow + ratios · ${c.income.length} years</small></button>
          <button data-dl="pdf">📕 PDF file<small>Printable: the 3 statements · ${c.income.length} years</small></button>
        </div>
      </div>
    </div>
  </div>

  <nav class="tabs" aria-label="Analysis sections">
    <a href="#overview" class="active">Overview</a><a href="#price">Price history</a><a href="#business">Business</a>
    <a href="#statements">Statements</a><a href="#ratios">Ratios</a><a href="#valuation">Valuation</a><a href="#dcf">DCF model</a>
  </nav>

  <section class="az-section" id="overview">
    <h2>Overview</h2>
    <div id="story"></div>
    <div class="kpis">
      ${kpi('Market value', compact(val.marketCap, cur), 'price × shares')}
      ${kpi(`Revenue FY${last.fiscalYear}`, compact(last.revenue, cur), `${signedPct(hist.revenueGrowth[hist.revenueGrowth.length - 1])} vs year before`)}
      ${kpi(`Net income FY${last.fiscalYear}`, compact(last.netIncome, cur), `net margin ${pct(ratios[ratios.length - 1].netMargin)}`)}
      ${kpi(`Free cash flow FY${last.fiscalYear}`, compact(lastCf.freeCashFlow, cur), 'cash from operations − capex')}
      ${kpi('P/E (price ÷ earnings)', times(val.pe), 'at today\'s price')}
      ${kpi('EV / EBITDA', times(val.evEbitda), 'whole-business price ÷ EBITDA')}
      ${kpi('Dividend yield', pct(val.dividendYield, 2), 'last year\'s dividends ÷ price')}
      ${kpi(`Revenue growth, ${c.income.length}-yr history`, pct(hist.revenueCagr), `avg per year, FY${c.income[0].fiscalYear}–FY${last.fiscalYear}`)}
    </div>
    <h3>The facts at a glance</h3>
    <div id="glance">${glance(c, hist, ratios, val, cur)}</div>
  </section>

  <section class="az-section" id="price">
    <div class="toolbar"><h2 style="margin:0">Price history</h2>
      <div class="seg-btns" id="chart-type"><button data-type="candle" class="active">🕯️ Candles</button><button data-type="line">Line</button></div></div>
    <div class="range-btns" id="range-btns" style="margin-top:12px">${['1M', '6M', '1Y', '5Y', '10Y', 'MAX'].map((r) => `<button data-r="${r}">${r === 'MAX' ? 'Since IPO' : r}</button>`).join('')}
      <label class="check small" style="margin-left:8px"><input type="checkbox" id="log-scale"> Log scale</label></div>
    <div class="card" style="margin-top:12px"><div class="chart-box tall" id="c-price" aria-label="Daily share price candles"><div class="spinner" id="price-spin" style="position:absolute;inset:0;margin:auto"></div></div>
      <div class="stats" id="price-stats"></div>
      <details class="small muted"><summary style="cursor:pointer;font-weight:700">How to read a candle 🕯️</summary>
        <p style="margin:8px 0 0">Each candle is one trading day. The thick body runs from the <b>opening</b> price to the <b>closing</b> price:
        <span class="up"><b>green</b></span> if the price closed higher than it opened, <span class="down"><b>red</b></span> if lower.
        The thin lines (wicks) show the day's <b>highest</b> and <b>lowest</b> prices. The bars at the bottom show how many shares changed hands (volume).
        Drag to move through time, scroll or pinch to zoom. Prices are adjusted for stock splits; dividends are not included.</p></details></div>
  </section>

  <section class="az-section" id="business">
    <h2>The business</h2>
    <div class="grid grid-2">
      <div class="card">
        <h3 style="margin-top:0">What does ${escapeHtml(p.name)} do?</h3>
        ${p.description ? `<p>${escapeHtml(p.description)}</p>` : `<p class="muted">Our current data source does not provide a business description for this company. Its official industry classification is <b>${escapeHtml(p.industry || 'not available')}</b>. The company's annual report (Form 10-K, "Item 1. Business") describes its business model in detail.</p>`}
        <div class="stats">
          ${p.sector ? stat('Sector', escapeHtml(p.sector)) : ''}${p.industry ? stat('Industry', escapeHtml(p.industry)) : ''}
          ${p.country ? stat('Country', escapeHtml(p.country)) : ''}${p.employees ? stat('Employees', p.employees.toLocaleString('en-US')) : ''}
          ${p.ipoDate ? stat('Listed since', escapeHtml(p.ipoDate)) : ''}
          ${p.website ? stat('Website', `<a href="${escapeHtml(p.website.startsWith('http') ? p.website : 'https://' + p.website)}" target="_blank" rel="noopener nofollow">visit ↗</a>`) : ''}
        </div>
      </div>
      <div class="card" id="segments"></div>
    </div>
  </section>

  <section class="az-section" id="statements">
    <div class="toolbar"><h2 style="margin:0">Financial statements</h2>
      <div class="seg-btns" id="st-btns"><button data-st="income" class="active">Income statement</button><button data-st="balance">Balance sheet</button><button data-st="cashflow">Cash flow</button></div></div>
    <p class="muted small">In ${escapeHtml(cur)} millions, except per-share figures. Negative numbers in (brackets). New to this? <a href="/learn/income-statement.html">Learn to read statements →</a></p>
    <div class="card"><div class="chart-box"><canvas id="c-statement"></canvas></div></div>
    <div id="st-explain" style="margin-top:12px"></div>
    <div class="table-wrap" id="st-table" style="margin-top:12px"></div>
  </section>

  <section class="az-section" id="ratios">
    <h2>Ratios over ${c.income.length} years</h2>
    <p class="muted small">What each ratio means is explained in the last column and in <a href="/learn/ratios.html">lesson 4</a>.</p>
    <div class="grid grid-2">
      <div class="card"><h3 style="margin-top:0">Profit margins</h3><div class="chart-box short"><canvas id="c-margins"></canvas></div></div>
      <div class="card"><h3 style="margin-top:0">Returns on capital</h3><div class="chart-box short"><canvas id="c-returns"></canvas></div></div>
      <div class="card"><h3 style="margin-top:0">Debt / equity</h3><div class="chart-box short"><canvas id="c-debt"></canvas></div></div>
      <div class="card"><h3 style="margin-top:0">Liquidity (current ratio)</h3><div class="chart-box short"><canvas id="c-liquidity"></canvas></div></div>
    </div>
    <div id="ratio-explain" style="margin-top:16px">${ratioFacts(ratios)}</div>
    <div class="table-wrap ratio-table" style="margin-top:16px">${ratioTable(ratios)}</div>
  </section>

  <section class="az-section" id="valuation">
    <h2>Valuation</h2>
    <p class="muted small">Today's price compared with the latest annual results (FY${last.fiscalYear}). Learn what each multiple means in <a href="/learn/valuation.html">lesson 5</a>.</p>
    <div class="kpis">
      ${kpi('P/E', times(val.pe), 'price per $1 of profit')}${kpi('Earnings yield', pct(val.earningsYield), 'profit ÷ market value')}
      ${kpi('P/S', times(val.ps), 'market value ÷ revenue')}${kpi('P/B', times(val.pb), 'market value ÷ equity')}
      ${kpi('EV / EBITDA', times(val.evEbitda), 'enterprise value ÷ EBITDA')}${kpi('EV / Sales', times(val.evSales), 'enterprise value ÷ revenue')}
      ${kpi('FCF yield', pct(val.fcfYield), 'free cash flow ÷ market value')}${kpi('Enterprise value', compact(val.enterpriseValue, cur), `market value ${val.netDebt >= 0 ? '+' : '−'} net debt ${compact(Math.abs(val.netDebt), cur)}`)}
    </div>
    <div class="card" style="margin-top:16px"><h3 style="margin-top:0">Multiples at each past fiscal year-end</h3>
      <div class="chart-box"><canvas id="c-multiples"></canvas></div><div id="multiples-text"></div></div>
  </section>

  <section class="az-section" id="dcf">
    <h2>Discounted cash flow (DCF) model</h2>
    <p class="muted">A DCF estimates what the business could be worth from the cash it may produce. The starting assumptions come from the company's <b>own history</b>;
      move the sliders to test your own. Built exactly like <a href="/learn/valuation.html">lesson 5</a>, with one refinement: growth fades in a straight line from year 6 to year 10 towards the long-term rate.</p>
    <div class="dcf-grid">
      <form class="card calc-form" id="dcf-form" onsubmit="return false"></form>
      <div id="dcf-out"></div>
    </div>
  </section>

  <p class="small muted" style="margin-top:32px">Data: ${escapeHtml(c.source)}. Fiscal years as reported by the company. Ratios and models calculated by Financial Rat.
    Figures can contain errors or omissions from the data provider; check the company's official filings before relying on them. Nothing here is a recommendation to buy or sell.</p>`;

  wireDownload(c);
  wireTabs();
  renderSegments(c);
  renderStory(c);
  renderStatement('income');
  $$('#st-btns button').forEach((b) => b.addEventListener('click', () => {
    $$('#st-btns button').forEach((x) => x.classList.toggle('active', x === b));
    renderStatement(b.dataset.st);
  }));
  renderRatioCharts(c, ratios);
  renderDcf(c, hist, val);
}

const kpi = (k, v, s) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
const stat = (k, v) => `<div class="stat"><div class="k">${k}</div><div class="v" style="font-size:1rem">${v}</div></div>`;
const arrow = (html) => `<div class="explain"><span class="ar">→</span><p style="margin:0">${html}</p></div>`;

// ---------- Written summary: only facts and calculations ----------
function glance(c, h, ratios, val, cur) {
  const inc = c.income, first = inc.find((r) => isNum(r.revenue) && r.revenue > 0) || inc[0], last = inc[inc.length - 1];
  const lastR = ratios[ratios.length - 1];
  const bal = c.balance[c.balance.length - 1] || {};
  const cf = c.cashflow[c.cashflow.length - 1] || {};
  const avgNetMargin = average(ratios.map((r) => r.netMargin));
  const out = [];
  out.push(arrow(`<b>Size &amp; growth.</b> Revenue went from ${words(first.revenue, cur)} in FY${first.fiscalYear} to ${words(last.revenue, cur)} in FY${last.fiscalYear}:
    an average of <b>${pct(h.revenueCagr)}</b> a year.
    ${isNum(h.worstYear) ? `It fell in <b>${h.revenueDownYears}</b> of ${h.revenueGrowth.filter(isNum).length} years; the strongest year was ${signedPct(h.bestYear)} and the weakest ${signedPct(h.worstYear)}.` : ''}
    ${isNum(h.revenueGrowthStdev) ? `Year-to-year growth varied with a standard deviation of ${(h.revenueGrowthStdev * 100).toFixed(1)} percentage points (the lower this is, the steadier the sales).` : ''}`));
  out.push(arrow(`<b>Profitability.</b> In FY${last.fiscalYear} the company kept <b>${pct(lastR.netMargin)}</b> of revenue as net profit
    (${inc.length}-year average: ${pct(avgNetMargin)}). Operating margin was ${pct(lastR.operatingMargin)} and return on equity ${pct(lastR.roe)}.
    ${h.lossYears ? `It reported a net loss in ${h.lossYears} of the last ${inc.length} years.` : `It was profitable in each of the last ${inc.length} years.`}`));
  out.push(arrow(`<b>Debt.</b> Total debt was ${words(bal.totalDebt, cur)} against ${words((bal.cash || 0) + (bal.shortTermInvestments || 0), cur)} of cash and short-term investments
    ${isNum(lastR.netDebtToEbitda) ? `— net debt equal to <b>${times(lastR.netDebtToEbitda)}</b> EBITDA` : ''}.
    ${isNum(lastR.interestCoverage) ? `Operating profit covered the interest bill <b>${times(lastR.interestCoverage)}</b>.` : ''}
    ${isNum(lastR.debtToEquity) ? `Debt was ${times(lastR.debtToEquity, 2)} shareholders' equity.` : isNum(bal.totalEquity) && bal.totalEquity <= 0 ? 'Shareholders\' equity was negative (often the result of large share buybacks or accumulated losses — check the balance sheet).' : ''}`));
  out.push(arrow(`<b>Cash.</b> Free cash flow was ${words(cf.freeCashFlow, cur)} in FY${last.fiscalYear}${isNum(lastR.cashConversion) ? `, ${pct(lastR.cashConversion, 0)} of net income` : ''}.
    ${isNum(cf.dividendsPaid) && cf.dividendsPaid !== 0 ? `It paid ${words(Math.abs(cf.dividendsPaid), cur)} in dividends` : 'It paid no dividends'}${isNum(cf.shareBuybacks) && cf.shareBuybacks !== 0 ? ` and spent ${words(Math.abs(cf.shareBuybacks), cur)} buying back its own shares` : ''}.`));
  if (isNum(val.pe) || isNum(val.evEbitda)) {
    out.push(arrow(`<b>Price.</b> At today's price the market values the company at ${words(val.marketCap, cur)}${isNum(val.pe) ? ` — <b>${times(val.pe)}</b> last year's earnings` : ''}${isNum(val.evEbitda) ? ` and ${times(val.evEbitda)} EBITDA (including debt)` : ''}. See how this compares with its own history in the Valuation section.`));
  }
  return out.join('');
}

// ---------- Download ----------
function wireDownload(c) {
  const btn = $('#dl-btn'), menu = $('#dl-menu');
  const toggle = (open) => { menu.classList.toggle('hidden', !open); btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(menu.classList.contains('hidden')); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.dl')) toggle(false); });
  $$('#dl-menu button').forEach((b) => b.addEventListener('click', async () => {
    const label = btn.textContent;
    btn.textContent = '⏳ Preparing file…';
    toggle(false);
    try { await (b.dataset.dl === 'xlsx' ? downloadExcel(c) : downloadPdf(c)); }
    catch (err) { alert(`Sorry, the download failed: ${err.message}`); }
    btn.textContent = label;
  }));
}

function wireTabs() {
  const links = $$('.tabs a');
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${en.target.id}`));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('.az-section').forEach((s) => obs.observe(s));
}

// ---------- Revenue sources donut ----------
function renderSegments(c) {
  const box = $('#segments');
  const cur = state.cur;
  const seg = { ...(c.segments || {}) };
  const prof = profileFor(c.profile.symbol);
  let curatedNote = '';
  if (!seg.product?.items?.length && !seg.geographic?.items?.length && prof?.mix) {
    // No live segment data: use the figures from the company's latest annual report (hand-collected).
    seg.product = { year: prof.mix.year, items: prof.mix.items.map(([name, value]) => ({ name, value: prof.mix.unit === '%' ? value : value * 1e9 })) };
    curatedNote = `<p class="small muted">Source: ${escapeHtml(c.profile.name)} annual report, ${escapeHtml(prof.mix.year)}; rounded${prof.mix.cur && prof.mix.cur !== cur ? `, in ${prof.mix.cur}` : ''}.${prof.mix.note ? ' ' + escapeHtml(prof.mix.note) : ''}</p>`;
  }
  const isPct = prof?.mix?.unit === '%' && curatedNote;
  const mixCur = curatedNote && prof.mix.cur ? prof.mix.cur : cur;
  const kinds = [['product', 'By product / segment'], ['geographic', 'By region']].filter(([k]) => seg[k]?.items?.length);
  if (!kinds.length) {
    box.innerHTML = `<h3 style="margin-top:0">Where the revenue comes from</h3>
      <p class="muted">A breakdown of revenue by product or region isn't available from our current data source for this company.
      You can find it in the "Segment information" note of the company's annual report.</p>`;
    return;
  }
  box.innerHTML = `<div class="toolbar"><h3 style="margin:0">Where the revenue comes from</h3>
    ${kinds.length > 1 ? `<div class="seg-btns" id="seg-btns">${kinds.map(([k, l], i) => `<button data-k="${k}"${i === 0 ? ' class="active"' : ''}>${l.replace('By ', '')}</button>`).join('')}</div>` : ''}</div>
    <div class="donut-wrap" style="margin-top:12px"><div class="chart-box short"><canvas id="c-donut" aria-label="Revenue sources"></canvas></div><ul class="legend-list" id="seg-legend"></ul></div>
    <div id="seg-explain"></div>${curatedNote}
    <div id="seg-compare"></div>`;
  const money2 = (v) => (isPct ? `${v}%` : compact(v, mixCur));
  if (curatedNote && prof.mix.items.some((x) => x[2]) && new Set(prof.mix.items.map((x) => x[2])).size > 1) {
    // Compare the kinds of revenue, e.g. advertising vs subscriptions vs cloud.
    const groups = {};
    prof.mix.items.forEach(([, v, g]) => { groups[g] = (groups[g] || 0) + v; });
    const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]);
    $('#seg-compare').innerHTML = `<h4 style="margin:20px 0 6px">${escapeHtml(prof.mix.groupsTitle || 'Kinds of revenue compared')}</h4><div class="chart-box short"><canvas id="c-compare"></canvas></div>`;
    barChart($('#c-compare'), entries.map((e) => e[0]), [{ label: prof.mix.unit === '%' ? '% of sales' : `Revenue (${prof.mix.cur || cur} bn)`, data: entries.map((e) => Math.round(e[1] * 10) / 10) }],
      { yFormat: (v) => (prof.mix.unit === '%' ? `${v}%` : `${v}bn`), legend: false, horizontal: true });
  }
  const draw = (kind) => {
    const s = seg[kind];
    const total = s.items.reduce((a, b) => a + b.value, 0);
    let items = s.items;
    if (items.length > 7) {
      const rest = items.slice(6).reduce((a, b) => a + b.value, 0);
      items = [...items.slice(0, 6), { name: 'Other', value: rest }];
    }
    const colors = donutChart($('#c-donut'), items.map((i) => i.name), items.map((i) => i.value), { format: (v) => `${money2(v)} (${pct(v / total)})` });
    $('#seg-legend').innerHTML = items.map((it, i) => `<li><span class="sw" style="background:${colors[i]}"></span><span>${escapeHtml(it.name)}</span><b>${pct(it.value / total)}</b><span class="muted">${isPct ? '' : money2(it.value)}</span></li>`).join('');
    const top = items[0];
    $('#seg-explain').innerHTML = arrow(`In FY${s.year}, the largest source was <b>${escapeHtml(top.name)}</b> with ${pct(top.value / total)} of the revenue reported in this breakdown.
      ${items.length > 1 ? `The top two sources together made up ${pct((items[0].value + items[1].value) / total)}.` : ''} The more concentrated the revenue, the more the company depends on that one source.`);
  };
  draw(kinds[0][0]);
  $$('#seg-btns button').forEach((b) => b.addEventListener('click', () => {
    $$('#seg-btns button').forEach((x) => x.classList.toggle('active', x === b));
    draw(b.dataset.k);
  }));
}

// ---------- Statements ----------
function renderStatement(kind) {
  const c = state.company, cur = state.cur, pal = palette();
  const rows = { income: INCOME_ROWS, balance: BALANCE_ROWS, cashflow: CASHFLOW_ROWS }[kind];
  const data = c[kind];
  const years = data.map((r) => `FY${r.fiscalYear}`);
  const perShare = new Set(['eps', 'epsDiluted']);
  const totals = new Set(['grossProfit', 'operatingIncome', 'netIncome', 'totalAssets', 'totalLiabilities', 'totalEquity', 'operatingCashFlow', 'freeCashFlow']);
  const cell = (field, v) => (perShare.has(field) ? (isNum(v) ? plain(v) : DASH) : millions(v));
  $('#st-table').innerHTML = `<table><thead><tr><th>${kind === 'income' ? 'Income statement' : kind === 'balance' ? 'Balance sheet' : 'Cash flow statement'}</th>${years.map((y) => `<th>${y}</th>`).join('')}<th style="text-align:left">→ What it is</th></tr></thead>
    <tbody>${rows.filter(([f]) => data.some((r) => isNum(r[f]))).map(([f, label, ex]) => `<tr class="${totals.has(f) ? 'total' : ''}"><td>${label}</td>${data.map((r) => `<td class="${isNum(r[f]) && r[f] < 0 ? 'neg' : ''}">${cell(f, r[f])}</td>`).join('')}<td style="text-align:left;white-space:normal;min-width:240px;color:var(--ink-2);font-size:.85rem">${ex}</td></tr>`).join('')}</tbody></table>`;

  const m = (k) => data.map((r) => (isNum(r[k]) ? r[k] : null));
  const fmt = (v) => compact(v, cur);
  const canvas = $('#c-statement');
  const exp = $('#st-explain');
  const firstLast = (k) => {
    const pts = data.filter((r) => isNum(r[k]));
    return pts.length > 1 ? [pts[0], pts[pts.length - 1]] : null;
  };
  if (kind === 'income') {
    barChart(canvas, years, [{ label: 'Revenue', data: m('revenue'), color: pal.series[1] }, { label: 'Operating income', data: m('operatingIncome'), color: pal.series[2] }, { label: 'Net income', data: m('netIncome'), color: pal.series[0] }], { yFormat: fmt });
    const g = growthSeries(m('netIncome'));
    const fl = firstLast('netIncome');
    exp.innerHTML = arrow(`Net income went from ${words(fl?.[0].netIncome, cur)} (FY${fl?.[0].fiscalYear}) to ${words(fl?.[1].netIncome, cur)} (FY${fl?.[1].fiscalYear}).
      ${isNum(state.hist.netIncomeCagr) ? `That is ${pct(state.hist.netIncomeCagr)} a year on average, compared with ${pct(state.hist.revenueCagr)} for revenue.` : ''}
      ${g.filter(isNum).length ? `Profit changed by ${signedPct(g[g.length - 1])} in the latest year.` : ''}`);
  } else if (kind === 'balance') {
    barChart(canvas, years, [{ label: 'Total assets', data: m('totalAssets'), color: pal.series[1] }, { label: 'Total liabilities', data: m('totalLiabilities'), color: pal.series[4] }, { label: "Shareholders' equity", data: m('totalEquity'), color: pal.series[0] }], { yFormat: fmt });
    const b = data[data.length - 1];
    exp.innerHTML = arrow(`At the end of FY${b.fiscalYear} the company owned ${words(b.totalAssets, cur)} of assets and owed ${words(b.totalLiabilities, cur)},
      leaving ${words(b.totalEquity, cur)} for shareholders. ${isNum(b.totalDebt) ? `Of what it owed, ${words(b.totalDebt, cur)} was borrowed money (debt).` : ''}`);
  } else {
    barChart(canvas, years, [{ label: 'Cash from operations', data: m('operatingCashFlow'), color: pal.series[1] }, { label: 'Capital expenditure', data: m('capitalExpenditure'), color: pal.series[2] }, { label: 'Free cash flow', data: m('freeCashFlow'), color: pal.series[0] }], { yFormat: fmt });
    const total = (k) => data.reduce((s, r) => s + (isNum(r[k]) ? r[k] : 0), 0);
    exp.innerHTML = arrow(`Over these ${data.length} years the company generated ${words(total('freeCashFlow'), cur)} of free cash flow in total.
      It used ${words(Math.abs(total('dividendsPaid')), cur)} for dividends and ${words(Math.abs(total('shareBuybacks')), cur)} for share buybacks.`);
  }
}

// ---------- Ratios ----------
function fmtRatio(v, f) { return f === 'pct' ? pct(v) : f === 'x1' ? times(v) : times(v, 2); }
function ratioTable(ratios) {
  const years = ratios.map((r) => `FY${r.fiscalYear}`);
  const cols = years.length + 3;
  return `<table><thead><tr><th>Ratio</th>${years.map((y) => `<th>${y}</th>`).join('')}<th>Average</th><th style="text-align:left">→ What it means</th></tr></thead><tbody>
    ${RATIO_ROWS.map((r) => (r.group ? `<tr class="grp"><td colspan="${cols}">${r.group}</td></tr>`
    : `<tr><td>${r.label}</td>${ratios.map((y) => `<td class="${isNum(y[r.key]) && y[r.key] < 0 ? 'neg' : ''}">${fmtRatio(y[r.key], r.fmt)}</td>`).join('')}<td><b>${fmtRatio(average(ratios.map((y) => y[r.key])), r.fmt)}</b></td><td>${r.explain}</td></tr>`)).join('')}
  </tbody></table>`;
}

function ratioFacts(ratios) {
  const last = ratios[ratios.length - 1], firstR = ratios[0];
  const facts = [];
  const cmp = (k, label) => {
    if (!isNum(last[k]) || !isNum(firstR[k])) return;
    const avg = average(ratios.map((r) => r[k]));
    facts.push(arrow(`<b>${label}</b> was ${pct(last[k])} in FY${last.fiscalYear}, compared with ${pct(firstR[k])} in FY${firstR.fiscalYear} and a ${ratios.length}-year average of ${pct(avg)}.`));
  };
  cmp('operatingMargin', 'Operating margin');
  cmp('roic', 'Return on invested capital');
  if (isNum(last.currentRatio)) facts.push(arrow(`<b>Current ratio</b> of ${times(last.currentRatio, 2)}: ${times(last.currentRatio, 2).replace('x', '')} of short-term assets for each 1 of bills due within a year.`));
  return facts.join('');
}

function renderRatioCharts(c, ratios) {
  const pal = palette();
  const years = ratios.map((r) => `FY${r.fiscalYear}`);
  const s = (k) => ratios.map((r) => (isNum(r[k]) ? Math.round(r[k] * 1000) / 10 : null));
  const pctFmt = (v) => `${Number(v).toFixed(0)}%`;
  lineChart($('#c-margins'), years, [{ label: 'Gross', data: s('grossMargin'), color: pal.series[1] }, { label: 'Operating', data: s('operatingMargin'), color: pal.series[2] }, { label: 'Net', data: s('netMargin'), color: pal.series[0] }], { yFormat: pctFmt });
  lineChart($('#c-returns'), years, [{ label: 'ROE', data: s('roe'), color: pal.series[3] }, { label: 'ROIC', data: s('roic'), color: pal.series[0] }, { label: 'ROA', data: s('roa'), color: pal.series[1] }], { yFormat: pctFmt });
  barChart($('#c-debt'), years, [{ label: 'Debt / equity', data: ratios.map((r) => (isNum(r.debtToEquity) ? Math.round(r.debtToEquity * 100) / 100 : null)), color: pal.series[4] }], { yFormat: (v) => `${Number(v).toFixed(1)}x`, legend: false });
  barChart($('#c-liquidity'), years, [{ label: 'Current ratio', data: ratios.map((r) => (isNum(r.currentRatio) ? Math.round(r.currentRatio * 100) / 100 : null)), color: pal.series[5] }], { yFormat: (v) => `${Number(v).toFixed(1)}x`, legend: false });
}

// ---------- Price history: daily candles (TradingView Lightweight Charts) ----------
let priceChartApi = null;
function renderPrices(prices) {
  $('#price-spin')?.remove();
  const box = $('#c-price');
  if (!prices || prices.error || !prices.dates?.length) {
    box.innerHTML = `<p class="muted center" style="padding-top:120px">Price history isn't available right now${prices?.error ? ` (${escapeHtml(prices.error)})` : ''}.</p>`;
    return;
  }
  const LWC = window.LightweightCharts;
  const pcur = state.pcur;
  const css = getComputedStyle(document.documentElement);
  const v = (n) => css.getPropertyValue(n).trim();
  const hasOhlc = Array.isArray(prices.open) && prices.open.length === prices.dates.length;
  const candles = prices.dates.map((d, i) => ({
    time: d, open: hasOhlc ? prices.open[i] : prices.close[i], high: hasOhlc ? prices.high[i] : prices.close[i],
    low: hasOhlc ? prices.low[i] : prices.close[i], close: prices.close[i],
  }));
  const line = candles.map((c) => ({ time: c.time, value: c.close }));
  const vols = Array.isArray(prices.volume) ? prices.dates.map((d, i) => ({
    time: d, value: prices.volume[i] || 0, color: candles[i].close >= candles[i].open ? `${v('--brand')}55` : `${v('--red')}55`,
  })) : [];

  priceChartApi?.remove();
  box.innerHTML = '';
  const chart = LWC.createChart(box, {
    autoSize: true,
    layout: { background: { color: 'transparent' }, textColor: v('--muted'), fontFamily: v('--font') },
    grid: { vertLines: { visible: false }, horzLines: { color: v('--line') } },
    rightPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false, timeVisible: false },
    crosshair: { mode: 0 },
    localization: { priceFormatter: (x) => money(x, pcur) },
  });
  priceChartApi = chart;
  const candleSeries = chart.addSeries(LWC.CandlestickSeries, {
    upColor: v('--brand'), downColor: v('--red'), borderVisible: false, wickUpColor: v('--brand'), wickDownColor: v('--red'),
  });
  const lineSeries = chart.addSeries(LWC.LineSeries, { color: v('--brand'), lineWidth: 2, visible: false });
  candleSeries.setData(candles);
  lineSeries.setData(line);
  if (vols.length) {
    const volSeries = chart.addSeries(LWC.HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volSeries.setData(vols);
  }
  chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.08, bottom: vols.length ? 0.22 : 0.05 } });

  const lastDate = candles[candles.length - 1].time;
  const setRange = (r) => {
    const back = { '1M': 31, '6M': 183, '1Y': 366, '5Y': 1827, '10Y': 3653 }[r];
    if (!back) chart.timeScale().fitContent();
    else {
      const from = new Date(Date.parse(lastDate) - back * 864e5).toISOString().slice(0, 10);
      chart.timeScale().setVisibleRange({ from: from < candles[0].time ? candles[0].time : from, to: lastDate });
    }
    const fromIdx = back ? candles.findIndex((c) => Date.parse(c.time) >= Date.parse(lastDate) - back * 864e5) : 0;
    priceStats(candles.slice(Math.max(0, fromIdx)), r);
  };
  $$('#range-btns button').forEach((b) => b.addEventListener('click', () => {
    $$('#range-btns button').forEach((x) => x.classList.toggle('active', x === b));
    setRange(b.dataset.r);
  }));
  $$('#chart-type button').forEach((b) => b.addEventListener('click', () => {
    $$('#chart-type button').forEach((x) => x.classList.toggle('active', x === b));
    const candle = b.dataset.type === 'candle';
    candleSeries.applyOptions({ visible: candle });
    lineSeries.applyOptions({ visible: !candle });
  }));
  $('#log-scale').addEventListener('change', (e) => chart.priceScale('right').applyOptions({ mode: e.target.checked ? 1 : 0 }));
  // Candles are easiest to read over a year; "Since IPO" shows the whole history.
  const yearBtn = $('#range-btns button[data-r="1Y"]');
  yearBtn.click();
}

function priceStats(rows, range) {
  const pcur = state.pcur;
  const first = rows[0], last = rows[rows.length - 1];
  const years = (Date.parse(last.time) - Date.parse(first.time)) / 3.156e10;
  let peak = -Infinity, maxDd = 0;
  for (const r of rows) { peak = Math.max(peak, r.close); maxDd = Math.min(maxDd, r.close / peak - 1); }
  const yearAgo = Date.parse(last.time) - 365 * 864e5;
  const lastYear = rows.filter((r) => Date.parse(r.time) >= yearAgo);
  const hi = Math.max(...lastYear.map((r) => r.high)), lo = Math.min(...lastYear.map((r) => r.low));
  const total = last.close / first.close - 1;
  $('#price-stats').innerHTML = [
    stat(range === 'MAX' ? 'First price in our data' : 'Start of period', `${money(first.close, pcur)} <span class="muted small">${first.time}</span>`),
    stat('Price change', `<span class="${total >= 0 ? 'up' : 'down'}">${signedPct(total)}</span>`),
    years >= 1 ? stat('Per year (compounded)', pct((last.close / first.close) ** (1 / years) - 1)) : '',
    stat('Largest fall from a peak', `<span class="down">${pct(maxDd)}</span>`),
    stat('52-week range', `${money(lo, pcur)} – ${money(hi, pcur)}`),
  ].join('');
}

// ---------- Historical multiples ----------
function renderMultiplesHistory() {
  const c = state.company, val = state.val, pal = palette();
  const box = $('#multiples-text');
  if (!state.prices) {
    box.innerHTML = '<p class="muted">Needs the price history, which is not available right now.</p>';
    return;
  }
  if (state.pcur !== state.cur) {
    $('#c-multiples').closest('.chart-box').remove();
    box.innerHTML = '<p class="muted">Past multiples are not shown for companies whose shares trade in a different currency from their reports, because past exchange rates would distort them.</p>';
    return;
  }
  const hm = historicalMultiples(c, state.prices);
  const years = hm.map((r) => `FY${r.fiscalYear}`);
  const r1 = (v) => (isNum(v) ? Math.round(v * 10) / 10 : null);
  lineChart($('#c-multiples'), years, [
    { label: 'P/E', data: hm.map((r) => r1(r.pe)), color: pal.series[0] },
    { label: 'EV / EBITDA', data: hm.map((r) => r1(r.evEbitda)), color: pal.series[1] },
  ], { yFormat: (v) => `${Number(v).toFixed(0)}x` });
  const describe = (key, label, today) => {
    const vals = hm.map((r) => r[key]).filter(isNum).sort((a, b) => a - b);
    if (vals.length < 3 || !isNum(today)) return '';
    const median = vals[Math.floor(vals.length / 2)];
    const below = vals.filter((v) => v < today).length;
    return arrow(`<b>${label}</b> today: ${times(today)}. At the last ${vals.length} fiscal year-ends it ranged from ${times(vals[0])} to ${times(vals[vals.length - 1])} (median ${times(median)}).
      Today's level is higher than ${below} of those ${vals.length} year-end values.`);
  };
  box.innerHTML = describe('pe', 'P/E', val.pe) + describe('evEbitda', 'EV/EBITDA', val.evEbitda) +
    '<p class="small muted">Year-end values use the share price on each fiscal year-end date and that year\'s reported results. Years with losses have no P/E.</p>';
}

// ---------- DCF ----------
function renderDcf(c, hist, val) {
  const cur = state.cur, pcur = state.pcur;
  const lastInc = c.income[c.income.length - 1];
  const defaults = {
    growth: isNum(hist.revenueCagr) ? hist.revenueCagr * 100 : 3,
    margin: isNum(hist.avgFcfMargin) ? hist.avgFcfMargin * 100 : 5,
    discount: 9,
    terminal: 2.5,
  };
  const round1 = (v) => Math.round(v * 10) / 10;
  const sliders = [
    { id: 'growth', label: 'Revenue growth, years 1–5', min: -20, max: 50, step: 0.5, why: `Default: the company's own <b>${c.income.length}-year historical average</b> (${pct(hist.revenueCagr)} a year, FY${c.income[0].fiscalYear}–FY${lastInc.fiscalYear}).` },
    { id: 'margin', label: 'Free cash flow margin', min: -20, max: 60, step: 0.5, why: `Default: its ${c.income.length}-year average FCF ÷ revenue (${pct(hist.avgFcfMargin)}).` },
    { id: 'discount', label: 'Discount rate (return you require)', min: 4, max: 20, step: 0.25, why: 'Default 9%: close to the long-run historical return of broad stock markets. Riskier company → higher rate.' },
    { id: 'terminal', label: 'Long-term growth after year 10', min: 0, max: 5, step: 0.25, why: 'Default 2.5%: roughly long-run economic growth. Must stay below the discount rate.' },
  ];
  const form = $('#dcf-form');
  form.innerHTML = sliders.map((s) => `<div class="slider-row"><div class="top"><label for="d-${s.id}" style="margin:0">${s.label}</label><output id="o-${s.id}"></output></div>
    <input type="range" id="d-${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${Math.min(s.max, Math.max(s.min, round1(defaults[s.id])))}">
    <span class="hint">${s.why}</span></div>`).join('') +
    `${Math.abs(defaults.growth) > 25 ? '<div class="notice small" style="margin:0">The historical growth rate is unusually high. Very few companies sustain growth above 20–25% a year for long periods; try lower values to see how sensitive the result is.</div>' : ''}
    <button type="button" class="btn btn-ghost btn-sm" id="dcf-reset">↺ Back to historical defaults</button>`;
  const read = () => Object.fromEntries(sliders.map((s) => [s.id, Number($(`#d-${s.id}`).value)]));
  const shares = val.shares;
  const update = () => {
    const v = read();
    sliders.forEach((s) => { $(`#o-${s.id}`).textContent = `${v[s.id].toFixed(s.step < 0.5 ? 2 : 1)}%`; });
    const run = (g, d) => {
      const r = dcf({ revenue: lastInc.revenue, growth: g / 100, fcfMargin: v.margin / 100, discount: d / 100, terminalGrowth: v.terminal / 100, netDebt: val.netDebt, shares });
      // Per-share value in the currency (and share units) the price is quoted in.
      if (r && !r.error) r.perShare = isNum(val.fx) && isNum(val.priceShares) && val.priceShares > 0 ? (r.equityValue * val.fx) / val.priceShares : pcur === cur ? r.perShare : null;
      return r;
    };
    const r = run(v.growth, v.discount);
    const out = $('#dcf-out');
    if (!r || r.error) {
      out.innerHTML = `<div class="notice error">${r?.error || 'Not enough data (revenue is missing) to build a DCF for this company.'}</div>`;
      return;
    }
    const price = val.price;
    const diff = isNum(r.perShare) && isNum(price) && r.perShare > 0 ? price / r.perShare - 1 : null;
    out.innerHTML = `
      <div class="answer"><div class="label">Model value per share under these assumptions</div>
        <div class="value">${isNum(r.perShare) ? (r.perShare > 0 ? money(r.perShare, pcur) : 'Below zero') : DASH}</div>
        <p class="say">${isNum(diff) ? `The current price of ${money(price, pcur)} is <b>${pct(Math.abs(diff))} ${diff >= 0 ? 'above' : 'below'}</b> this model value. Change the assumptions to see what the price implies.` :
    r.perShare <= 0 ? 'With these assumptions the projected cash flows do not cover the company\'s net debt.' : ''}</p></div>
      <div class="stats">
        ${stat('Enterprise value', compact(r.enterpriseValue, cur))}${stat(val.netDebt >= 0 ? '− Net debt' : '+ Net cash', compact(Math.abs(val.netDebt), cur))}
        ${stat('Equity value', compact(r.equityValue, cur))}${stat('Shares', isNum(shares) ? `${(shares / 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 })}M` : DASH)}
        ${stat('Share of value after year 10', pct(r.terminalShare, 0))}
      </div>
      <div class="card"><h3 style="margin-top:0">Revenue and free cash flow: history and projection</h3><div class="chart-box"><canvas id="c-dcf"></canvas></div></div>
      <h3>Sensitivity: value per share</h3>
      <div class="table-wrap"><table class="sens"><thead><tr><th>Discount ↓ / growth →</th>${[-4, -2, 0, 2, 4].map((dg) => `<th>${(v.growth + dg).toFixed(1)}%</th>`).join('')}</tr></thead><tbody>
        ${[-2, -1, 0, 1, 2].map((dd) => `<tr><td>${(v.discount + dd).toFixed(2)}%</td>${[-4, -2, 0, 2, 4].map((dg) => {
    const x = run(v.growth + dg, v.discount + dd);
    return `<td class="${dd === 0 && dg === 0 ? 'mid' : ''}">${x && !x.error && isNum(x.perShare) ? money(x.perShare, pcur) : DASH}</td>`;
  }).join('')}</tr>`).join('')}
      </tbody></table></div>
      <details class="card" style="margin-top:16px"><summary style="cursor:pointer;font-weight:800">See the year-by-year projection</summary>
        <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Year</th><th>Growth</th><th>Revenue</th><th>Free cash flow</th><th>Value today</th></tr></thead><tbody>
        ${r.rows.map((x) => `<tr><td>${lastInc.fiscalYear + x.year}</td><td>${pct(x.growth)}</td><td>${compact(x.revenue, cur)}</td><td>${compact(x.fcf, cur)}</td><td>${compact(x.pv, cur)}</td></tr>`).join('')}
        <tr class="total"><td>After ${lastInc.fiscalYear + 10}</td><td>${pct(v.terminal / 100)}</td><td></td><td>Terminal value ${compact(r.terminalValue, cur)}</td><td>${compact(r.pvTerminal, cur)}</td></tr>
        </tbody></table></div></details>
      ${arrow('The model is only as good as its assumptions. Using the company\'s history as the starting point is a neutral choice, not a forecast: the past does not guarantee the future.')}`;
    const pal = palette();
    const histYears = c.income.map((x) => `FY${x.fiscalYear}`);
    const projYears = r.rows.map((x) => `FY${lastInc.fiscalYear + x.year}`);
    const fcfHist = c.income.map((inc) => c.cashflow.find((cf) => cf.fiscalYear === inc.fiscalYear)?.freeCashFlow ?? null);
    barChart($('#c-dcf'), [...histYears, ...projYears], [
      { label: 'Revenue (reported)', data: [...c.income.map((x) => x.revenue), ...r.rows.map(() => null)], color: pal.series[1] },
      { label: 'Revenue (projected)', data: [...c.income.map(() => null), ...r.rows.map((x) => x.revenue)], color: pal.series[1] + '66' },
      { label: 'Free cash flow (reported)', data: [...fcfHist, ...r.rows.map(() => null)], color: pal.series[0] },
      { label: 'Free cash flow (projected)', data: [...c.income.map(() => null), ...r.rows.map((x) => x.fcf)], color: pal.series[0] + '66' },
    ], { yFormat: (x) => compact(x, cur), stacked: false });
  };
  form.addEventListener('input', update);
  $('#dcf-reset').addEventListener('click', () => {
    sliders.forEach((s) => { $(`#d-${s.id}`).value = Math.min(s.max, Math.max(s.min, round1(defaults[s.id]))); });
    update();
  });
  update();
}


// ---------- Business model story (overview) ----------
// Pictures and short descriptions come from Wikipedia's public API (free, works from the browser).
const wikiCache = new Map();
async function wikiSummary(title) {
  if (!wikiCache.has(title)) {
    wikiCache.set(title, fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(decodeURIComponent(title))}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j && j.type !== 'disambiguation' ? { title: j.title, extract: j.extract || '', thumb: j.thumbnail?.source || '', url: j.content_urls?.desktop?.page || '' } : null))
      .catch(() => null));
  }
  return wikiCache.get(title);
}

async function wikiFindCompany(name) {
  const clean = name.replace(/\(.*?\)|\/[A-Z]+\/|,?\s+(inc|corp|corporation|co|company|plc|ltd|limited|holdings?|group|n\.?v|s\.?a|s\.?e|ag|a\/s|se)\.?\b/gi, ' ').replace(/\s+/g, ' ').trim();
  try {
    const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(clean + ' company')}&srlimit=1&format=json&origin=*`);
    const title = (await r.json())?.query?.search?.[0]?.title;
    return title ? wikiSummary(title.replace(/ /g, '_')) : null;
  } catch { return null; }
}

const firstSentences = (text, n = 3) => (text.match(/[^.!?]+[.!?]+(\s|$)/g) || [text]).slice(0, n).join('').trim();

function numberFacts(c) {
  // When we have no hand-written profile: what stands out in the company's own numbers.
  const r = state.ratios[state.ratios.length - 1] || {};
  const inc = c.income[c.income.length - 1] || {};
  const h = state.hist, out = [];
  if (isNum(r.grossMargin)) out.push(`Keeps <b>${pct(r.grossMargin, 0)}</b> of each sale after direct costs (gross margin)${r.grossMargin > 0.6 ? ' — typical of software, brands or patented products' : r.grossMargin < 0.25 ? ' — typical of retail, distribution or commodity businesses' : ''}.`);
  if (isNum(inc.researchAndDevelopment) && isNum(inc.revenue) && inc.revenue > 0) out.push(`Spends <b>${pct(inc.researchAndDevelopment / inc.revenue, 0)}</b> of revenue on research &amp; development.`);
  if (isNum(r.capexToRevenue)) out.push(`Invests <b>${pct(r.capexToRevenue, 0)}</b> of revenue in buildings, machines and equipment each year${r.capexToRevenue > 0.15 ? ' (a capital-heavy business)' : r.capexToRevenue < 0.04 ? ' (a capital-light business)' : ''}.`);
  if (isNum(h.revenueCagr)) out.push(`Revenue grew <b>${pct(h.revenueCagr)}</b> a year on average over ${c.income.length} years.`);
  return out;
}

async function renderStory(c) {
  const box = $('#story');
  if (!box) return;
  const p = c.profile, prof = profileFor(p.symbol);
  const seg = c.segments?.product?.items?.length ? c.segments.product : prof?.mix ? { year: prof.mix.year, items: prof.mix.items.map(([name, value]) => ({ name, value })) } : null;
  let topLine = '';
  if (seg) {
    const total = seg.items.reduce((a, b) => a + b.value, 0);
    const top = [...seg.items].sort((a, b) => b.value - a.value)[0];
    topLine = `<p style="margin:8px 0 0">💰 <b>Most sales come from:</b> ${escapeHtml(top.name)} — ${pct(top.value / total, 0)} of revenue (${escapeHtml(String(seg.year))}). <a href="#business">See the full breakdown →</a></p>`;
  }
  const model = prof?.model || (p.description ? firstSentences(p.description) : '');
  const edge = prof?.edge?.length ? prof.edge : null;
  box.innerHTML = `<div class="card story">
    <div class="story-grid">
      <div>
        <h3 style="margin-top:0">🧭 Business model</h3>
        <p id="story-model">${model ? escapeHtml(model) : '<span class="muted">Looking up a short description…</span>'}</p>
        ${topLine}
      </div>
      <div>
        <h3 style="margin-top:0">⭐ ${edge ? 'What sets it apart' : 'What stands out in the numbers'}</h3>
        <ul class="edge">${(edge || numberFacts(c)).map((e) => `<li>${edge ? escapeHtml(e) : e}</li>`).join('')}</ul>
      </div>
    </div>
    ${prof?.famous?.length ? `<h3>🏆 What made it famous</h3><div class="products" id="products">${prof.famous.map(([name]) => `<figure class="product"><div class="ph">⏳</div><figcaption>${escapeHtml(name)}</figcaption></figure>`).join('')}</div>
      <p class="small muted" style="margin:6px 0 0">Pictures: Wikipedia / Wikimedia Commons (click a picture for its source and licence).</p>` : ''}
  </div>`;
  if (c.isDemo) return;
  if (prof?.famous?.length) {
    const figs = $$('#products .product');
    prof.famous.forEach(async ([name, wiki], i) => {
      const w = await wikiSummary(wiki);
      const ph = figs[i]?.querySelector('.ph');
      if (!ph) return;
      if (w?.thumb) ph.outerHTML = `<a href="${escapeHtml(w.url)}" target="_blank" rel="noopener" title="${escapeHtml(w.title)} on Wikipedia"><img src="${escapeHtml(w.thumb)}" alt="${escapeHtml(name)}" loading="lazy"></a>`;
      else ph.textContent = '📦';
    });
  }
  if (!model) {
    const w = await wikiFindCompany(p.name);
    const el = $('#story-model');
    if (!el) return;
    el.innerHTML = w?.extract ? `${escapeHtml(firstSentences(w.extract))} <a class="small" href="${escapeHtml(w.url)}" target="_blank" rel="noopener">(Wikipedia)</a>`
      : `<span class="muted">No description available. The company's annual report (section "Business") explains its business model.</span>`;
  }
}

// ---------- Suggestions under the search box ----------
function renderSuggestions() {
  const box = $('#quick-picks');
  box.innerHTML = `<details id="sugg" open><summary>⭐ Popular companies to explore</summary><div class="sugg-groups">${SUGGESTIONS.map(([title, list]) => `
    <div class="sugg-group"><div class="sugg-title">${title}</div><div class="sugg-chips">${list.map(([t, n]) => `<button type="button" data-t="${t}"><b>${t}</b> <span>${escapeHtml(n)}</span></button>`).join('')}</div></div>`).join('')}
    <div class="sugg-group"><div class="sugg-title">🧪 Practice</div><div class="sugg-chips"><button type="button" data-t="DEMO"><b>DEMO</b> <span>Sample company</span></button></div></div></div></details>`;
}

// ===================== Start =====================
renderSuggestions();
setupSearch();
const initial = new URLSearchParams(location.search).get('t');
if (initial) load(initial);
window.addEventListener('popstate', () => {
  const t = new URLSearchParams(location.search).get('t');
  if (t) load(t);
  else { result.innerHTML = ''; compactHero(false); }
});
