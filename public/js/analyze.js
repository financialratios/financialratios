// Section 3: type a ticker, get an objective analysis.
// Everything shown is calculated from the company's own reported history. No ratings, no verdicts.
import {
  yearlyRatios, historySummary, currentValuation, historicalMultiples, dcf, average, isNum, growthSeries, splitAdjustedIncome, dividendHistory, cagr, investmentSince,
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
  renderDividends(state.prices);
  renderWhatIf(state.prices);
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
    <a href="#price" class="active">Price chart</a><a href="#overview">Overview</a><a href="#business">Business</a><a href="#pershare">EPS &amp; dividends</a>
    <a href="#statements">Statements</a><a href="#ratios">Ratios</a><a href="#valuation">Valuation</a><a href="#dcf">DCF model</a><a href="#whatif">What if?</a>
  </nav>

  <section class="az-section" id="price">
    <div class="toolbar"><h2 style="margin:0">Price history</h2>
      <div class="seg-btns" id="chart-type"><button data-type="candle" class="active">🕯️ Candles</button><button data-type="line">Line</button></div></div>
    <div class="range-btns" id="range-btns" style="margin-top:12px">${['1M', '6M', '1Y', '5Y', '10Y', 'MAX'].map((r) => `<button data-r="${r}">${r === 'MAX' ? 'Since IPO' : r}</button>`).join('')}
      <label class="check small" style="margin-left:8px"><input type="checkbox" id="log-scale"> Log scale</label></div>
    <div class="card" style="margin-top:12px"><div class="split price-split">
      <div class="chart-box tall" id="c-price" aria-label="Daily share price candles"><div class="spinner" id="price-spin" style="position:absolute;inset:0;margin:auto"></div></div>
      <div class="stats stack" id="price-stats"></div></div>
      <details class="small muted" style="margin-top:10px"><summary style="cursor:pointer;font-weight:700">How to read a candle 🕯️</summary>
        <p style="margin:8px 0 0">Each candle is one trading day. The thick body runs from the <b>opening</b> price to the <b>closing</b> price:
        <span class="up"><b>green</b></span> if the price closed higher than it opened, <span class="down"><b>red</b></span> if lower.
        The thin lines (wicks) show the day's <b>highest</b> and <b>lowest</b> prices. The bars at the bottom show how many shares changed hands (volume).
        Drag to move through time, scroll or pinch to zoom. Prices are adjusted for stock splits; dividends are not included.</p></details></div>
  </section>

  <section class="az-section" id="overview">
    <h2>Overview</h2>
    <div id="story"></div>
    <div class="split ov-split"><div class="kpis">
      ${kpi('Market value', compact(val.marketCap, cur), 'price × shares')}
      ${kpi(`Revenue FY${last.fiscalYear}`, compact(last.revenue, cur), `${signedPct(hist.revenueGrowth[hist.revenueGrowth.length - 1])} vs year before`)}
      ${kpi(`Net income FY${last.fiscalYear}`, compact(last.netIncome, cur), `net margin ${pct(ratios[ratios.length - 1].netMargin)}`)}
      ${kpi(`Free cash flow FY${last.fiscalYear}`, compact(lastCf.freeCashFlow, cur), 'cash from operations − capex')}
      ${kpi('P/E (price ÷ earnings)', times(val.pe), 'at today\'s price')}
      ${kpi('EV / EBITDA', times(val.evEbitda), 'whole-business price ÷ EBITDA')}
      ${kpi('Dividend yield', pct(val.dividendYield, 2), 'last year\'s dividends ÷ price')}
      ${kpi(`Revenue growth, ${c.income.length}-yr history`, pct(hist.revenueCagr), `avg per year, FY${c.income[0].fiscalYear}–FY${last.fiscalYear}`)}
    </div>
    <div class="card glance-card"><h3 style="margin-top:0">📌 The facts at a glance</h3>
    <div id="glance">${glance(c, hist, ratios, val, cur)}</div></div></div>
  </section>

  <section class="az-section" id="business">
    <h2>The business</h2>
    <div class="facts" id="facts"></div>
    <div class="biz-grid">
      <div class="col-stack">
        <div class="card biz-about">
          <h3 style="margin-top:0">🏢 What does ${escapeHtml(p.name)} do?</h3>
          <div id="about-text"></div>
        </div>
        <div class="card">
          <h3 style="margin-top:0">🧾 Where every ${escapeHtml(cur === 'USD' ? '$' : '')}100 of sales goes <span class="muted small" style="font-weight:600">(FY${last.fiscalYear})</span></h3>
          <div id="money-flow"></div>
        </div>
      </div>
      <div class="card" id="segments"></div>
    </div>
  </section>

  <section class="az-section" id="pershare">
    <h2>Earnings &amp; dividends per share</h2>
    <p class="muted small">What one share earned each year, and every dividend one share has received. Adjusted for stock splits so years can be compared.</p>
    <div class="grid grid-2">
      <div class="card"><h3 style="margin-top:0">📈 Earnings per share (EPS)</h3><div class="chart-box"><canvas id="c-eps"></canvas></div><div id="eps-text"></div></div>
      <div class="card"><h3 style="margin-top:0">💵 Dividends per share — full history</h3><div class="chart-box" id="div-box"><canvas id="c-div"></canvas></div><div id="div-text"><p class="muted small">Loading the dividend history…</p></div></div>
    </div>
  </section>

  <section class="az-section" id="statements">
    <div class="toolbar"><h2 style="margin:0">Financial statements</h2>
      <div class="seg-btns" id="st-btns"><button data-st="income" class="active">Income statement</button><button data-st="balance">Balance sheet</button><button data-st="cashflow">Cash flow</button></div></div>
    <p class="muted small">In ${escapeHtml(cur)} millions, except per-share figures. Negative numbers in (brackets). New to this? <a href="/learn/income-statement.html">Learn to read statements →</a></p>
    <div class="split st-split"><div class="card"><div class="chart-box"><canvas id="c-statement"></canvas></div></div>
    <div class="card"><h3 style="margin-top:0">📌 What the numbers say</h3><div id="st-explain"></div></div></div>
    <div class="table-wrap" id="st-table" style="margin-top:12px"></div>
  </section>

  <section class="az-section" id="ratios">
    <h2>Ratios over ${c.income.length} years</h2>
    <p class="muted small">Point at (or tap) ⓘ next to a ratio to see what it means; more in the <a href="/learn/ratios.html">ratios lesson</a>.</p>
    <div class="grid grid-2 four-up">
      <div class="card"><h3 style="margin-top:0">Profit margins</h3><div class="chart-box short"><canvas id="c-margins"></canvas></div></div>
      <div class="card"><h3 style="margin-top:0">Returns on capital</h3><div class="chart-box short"><canvas id="c-returns"></canvas></div></div>
      <div class="card"><h3 style="margin-top:0">Debt / equity</h3><div class="chart-box short"><canvas id="c-debt"></canvas></div></div>
      <div class="card"><h3 style="margin-top:0">Liquidity (current ratio)</h3><div class="chart-box short"><canvas id="c-liquidity"></canvas></div></div>
    </div>
    <div id="ratio-explain" style="margin-top:16px">${ratioFacts(ratios)}</div>
    <div class="table-wrap ratio-table" style="margin-top:16px">${ratioTable(ratios)}</div>
    <p class="small muted">— means the company did not report the numbers needed, or the ratio is not meaningful that year (for example a P/E or return when profit or equity is negative). A company with no borrowings shows debt ratios of 0.</p>
  </section>

  <section class="az-section" id="valuation">
    <h2>Valuation</h2>
    <p class="muted small">Today's price compared with the latest annual results (FY${last.fiscalYear}). Learn what each multiple means in the <a href="/learn/valuation.html">multiples lesson</a>.</p>
    <div class="split val-split"><div class="kpis">
      ${kpi('P/E', times(val.pe), 'price per $1 of profit')}${kpi('Earnings yield', pct(val.earningsYield), 'profit ÷ market value')}
      ${kpi('P/S', times(val.ps), 'market value ÷ revenue')}${kpi('P/B', times(val.pb), 'market value ÷ equity')}
      ${kpi('EV / EBITDA', times(val.evEbitda), 'enterprise value ÷ EBITDA')}${kpi('EV / Sales', times(val.evSales), 'enterprise value ÷ revenue')}
      ${kpi('FCF yield', pct(val.fcfYield), 'free cash flow ÷ market value')}${kpi('Enterprise value', compact(val.enterpriseValue, cur), `market value ${val.netDebt >= 0 ? '+' : '−'} net debt ${compact(Math.abs(val.netDebt), cur)}`)}
    </div>
    <div class="card"><h3 style="margin-top:0">Multiples at each past fiscal year-end</h3>
      <div class="chart-box short"><canvas id="c-multiples"></canvas></div><div id="multiples-text"></div></div></div>
  </section>

  <section class="az-section" id="dcf">
    <h2>Discounted cash flow (DCF) model</h2>
    <p class="muted">A DCF estimates what the business could be worth from the cash it may produce. The starting assumptions come from the company's <b>own history</b>;
      move the sliders to test your own. Built like the <a href="/learn/dcf.html">DCF lesson</a>, simplified, with one refinement: growth fades in a straight line from year 6 to year 10 towards the long-term rate.</p>
    <div class="dcf-grid">
      <div class="col-stack"><form class="card calc-form" id="dcf-form" onsubmit="return false"></form><div class="card" id="dcf-sens"></div></div>
      <div id="dcf-out"></div>
    </div>
  </section>

  <section class="az-section" id="whatif">
    <h2>💭 What if I had invested?</h2>
    <p class="muted">Pick a date and an amount to see what an investment in ${escapeHtml(p.name)} would be worth today, based on the real daily prices and dividends.</p>
    <div class="calc-layout" style="margin-top:12px">
      <form class="card calc-form" id="wi-form" onsubmit="return false">
        <div><label for="wi-amount">Amount invested</label><div class="input-unit"><input type="number" id="wi-amount" min="1" step="100" value="1000"><span class="unit">${escapeHtml(pcur)}</span></div></div>
        <div><label for="wi-date">Date of purchase</label><input type="date" id="wi-date" style="width:100%;font:inherit;font-size:1.05rem;padding:12px 14px;border:2px solid var(--line);border-radius:12px;background:var(--surface);color:var(--ink);min-height:52px">
          <div class="range-btns" id="wi-quick" style="margin-top:8px"><button type="button" data-y="1">1 year ago</button><button type="button" data-y="5">5 years</button><button type="button" data-y="10">10 years</button><button type="button" data-y="0">At listing</button></div></div>
        <label class="check"><input type="checkbox" id="wi-reinvest" checked> Reinvest dividends in more shares</label>
        <p class="hint" style="margin:0">Taxes, fees and currency changes are not included.</p>
        <div class="stats" id="wi-stats" style="margin:0"></div>
      </form>
      <div id="wi-out"><div class="spinner"></div><p class="center muted">Waiting for the price history…</p></div>
    </div>
  </section>

  <p class="small muted" style="margin-top:32px">Data: ${escapeHtml(c.source)}. Fiscal years as reported by the company. Ratios and models calculated by Financial Rat.
    Figures can contain errors or omissions from the data provider; check the company's official filings before relying on them. Nothing here is a recommendation to buy or sell.</p>`;

  wireDownload(c);
  wireTabs();
  renderBusiness(c);
  renderSegments(c);
  renderStory(c);
  renderEps(c);
  renderStatement('income');
  $$('#st-btns button').forEach((b) => b.addEventListener('click', () => {
    $$('#st-btns button').forEach((x) => x.classList.toggle('active', x === b));
    renderStatement(b.dataset.st);
  }));
  renderRatioCharts(c, ratios);
  // Tables keep oldest → newest order but open scrolled to the latest years on small screens.
  $$('.ratio-table').forEach((el) => { el.scrollLeft = el.scrollWidth; });
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
    box.innerHTML = `<h3 style="margin-top:0">🍩 Where the revenue comes from</h3>
      <p class="muted">A breakdown of revenue by product or region isn't available from our current data source for this company.
      You can find it in the "Segment information" note of the company's annual report.</p>`;
    return;
  }
  box.innerHTML = `<div class="toolbar"><h3 style="margin:0">🍩 Where the revenue comes from</h3>
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
    $('#seg-legend').innerHTML = items.map((it, i) => `<li class="seg-row"><div class="seg-top"><span><span class="sw" style="background:${colors[i]}"></span> ${escapeHtml(it.name)}</span><span><b>${pct(it.value / total)}</b> <span class="muted small">${isPct ? '' : money2(it.value)}</span></span></div>
      <div class="seg-bar"><i style="width:${(it.value / items[0].value) * 100}%;background:${colors[i]}"></i></div></li>`).join('');
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
  $('#st-table').innerHTML = `<table class="rt compact"><thead><tr><th>${kind === 'income' ? 'Income statement' : kind === 'balance' ? 'Balance sheet' : 'Cash flow statement'}</th>${years.map((y) => `<th>${y}</th>`).join('')}</tr></thead>
    <tbody>${rows.filter(([f]) => data.some((r) => isNum(r[f]))).map(([f, label, ex]) => `<tr class="${totals.has(f) ? 'total' : ''}"><td title="${ex}"><span class="rname">${label} <span class="info" aria-label="${ex}">ⓘ</span></span></td>${data.map((r) => `<td class="${isNum(r[f]) && r[f] < 0 ? 'neg' : ''}">${cell(f, r[f])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  $('#st-table').scrollLeft = 0;

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
      ${g.filter(isNum).length ? `Profit changed by ${signedPct(g[g.length - 1])} in the latest year.` : ''}`)
      + marginFacts(data);
  } else if (kind === 'balance') {
    barChart(canvas, years, [{ label: 'Total assets', data: m('totalAssets'), color: pal.series[1] }, { label: 'Total liabilities', data: m('totalLiabilities'), color: pal.series[4] }, { label: "Shareholders' equity", data: m('totalEquity'), color: pal.series[0] }], { yFormat: fmt });
    const b = data[data.length - 1];
    exp.innerHTML = arrow(`At the end of FY${b.fiscalYear} the company owned ${words(b.totalAssets, cur)} of assets and owed ${words(b.totalLiabilities, cur)},
      leaving ${words(b.totalEquity, cur)} for shareholders. ${isNum(b.totalDebt) ? `Of what it owed, ${words(b.totalDebt, cur)} was borrowed money (debt).` : ''}`)
      + balanceFacts(data);
  } else {
    barChart(canvas, years, [{ label: 'Cash from operations', data: m('operatingCashFlow'), color: pal.series[1] }, { label: 'Capital expenditure', data: m('capitalExpenditure'), color: pal.series[2] }, { label: 'Free cash flow', data: m('freeCashFlow'), color: pal.series[0] }], { yFormat: fmt });
    const total = (k) => data.reduce((s, r) => s + (isNum(r[k]) ? r[k] : 0), 0);
    exp.innerHTML = arrow(`Over these ${data.length} years the company generated ${words(total('freeCashFlow'), cur)} of free cash flow in total.
      It used ${words(Math.abs(total('dividendsPaid')), cur)} for dividends and ${words(Math.abs(total('shareBuybacks')), cur)} for share buybacks.`)
      + cashFacts(data);
  }
}


// Extra plain-language facts for the "What the numbers say" card.
function marginFacts(data) {
  const first = data.find((r) => isNum(r.revenue) && r.revenue > 0), last = [...data].reverse().find((r) => isNum(r.revenue) && r.revenue > 0);
  if (!first || !last) return '';
  const gm = (r) => safeMargin(r.grossProfit, r.revenue), om = (r) => safeMargin(r.operatingIncome, r.revenue);
  return (isNum(gm(last)) ? arrow(`Gross margin: <b>${pct(gm(last))}</b> in FY${last.fiscalYear}${isNum(gm(first)) ? ` (FY${first.fiscalYear}: ${pct(gm(first))})` : ''}: the share of each sale left after direct costs.`) : '')
    + (isNum(om(last)) ? arrow(`Operating margin: <b>${pct(om(last))}</b> in FY${last.fiscalYear}${isNum(om(first)) ? ` (FY${first.fiscalYear}: ${pct(om(first))})` : ''}: profit from the core business per 100 of sales.`) : '');
}
function balanceFacts(data) {
  const cur = state.cur, b = data[data.length - 1], a = data[0];
  const cashNow = (b.cash || 0) + (b.shortTermInvestments || 0), cashThen = (a.cash || 0) + (a.shortTermInvestments || 0);
  return arrow(`Cash and short-term investments: <b>${words(cashNow, cur)}</b>, compared with ${words(cashThen, cur)} in FY${a.fiscalYear}.`)
    + (isNum(b.totalEquity) && isNum(a.totalEquity) ? arrow(`Shareholders' equity went from ${words(a.totalEquity, cur)} to <b>${words(b.totalEquity, cur)}</b>.`) : '');
}
function cashFacts(data) {
  const cur = state.cur, l = data[data.length - 1];
  return (isNum(l.operatingCashFlow) && isNum(l.capitalExpenditure) && l.operatingCashFlow > 0
    ? arrow(`In FY${l.fiscalYear}, <b>${pct(Math.abs(l.capitalExpenditure) / l.operatingCashFlow, 0)}</b> of the cash from operations was reinvested in equipment and buildings (capex).`) : '')
    + (isNum(l.freeCashFlow) ? arrow(`Free cash flow in FY${l.fiscalYear}: <b>${words(l.freeCashFlow, cur)}</b>.`) : '');
}
const safeMargin = (a, b) => (isNum(a) && isNum(b) && b > 0 ? a / b : null);

// ---------- Ratios ----------
function fmtRatio(v, f) { return f === 'pct' ? pct(v) : f === 'x1' ? times(v) : times(v, 2); }
function ratioTable(ratios) {
  const rows = ratios; // oldest to newest
  const cols = rows.length + 2;
  const cell = (v, f) => (isNum(v) ? fmtRatio(v, f) : '<span class="na" title="Not reported, or not meaningful (e.g. negative profit or equity)">—</span>');
  return `<table class="rt compact"><thead><tr><th>Ratio</th>${rows.map((y) => `<th>FY${y.fiscalYear}</th>`).join('')}<th>Average</th></tr></thead><tbody>
    ${RATIO_ROWS.map((r) => (r.group ? `<tr class="grp"><td colspan="${cols}"><span class="grp-label">${r.group}</span></td></tr>`
    : `<tr><td title="${r.explain}"><span class="rname">${r.label} <span class="info" aria-label="${r.explain}">ⓘ</span></span></td>${rows.map((y) => `<td class="${isNum(y[r.key]) && y[r.key] < 0 ? 'neg' : ''}">${cell(y[r.key], r.fmt)}</td>`).join('')}<td><b>${cell(average(ratios.map((y) => y[r.key])), r.fmt)}</b></td></tr>`)).join('')}
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
    time: d, value: prices.volume[i] || 0, color: candles[i].close >= candles[i].open ? `${v('--brand')}38` : `${v('--red')}38`,
  })) : [];

  priceChartApi?.remove();
  box.innerHTML = '';
  const chart = LWC.createChart(box, {
    autoSize: true,
    layout: { background: { color: 'transparent' }, textColor: v('--muted'), fontFamily: v('--font') },
    grid: { vertLines: { visible: false }, horzLines: { color: v('--line') } },
    rightPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false, timeVisible: false, minBarSpacing: 0.01 },
    crosshair: { mode: 0 },
    localization: { priceFormatter: (x) => money(x, pcur) },
  });
  priceChartApi = chart;
  // Never stretch the vertical axis to less than ±10% around the price: otherwise, on short ranges,
  // ordinary small moves fill the whole chart and look dramatic.
  const calmScale = (original) => {
    const res = original();
    if (!res?.priceRange) return res;
    const { minValue, maxValue } = res.priceRange;
    const mid = (minValue + maxValue) / 2, span = maxValue - minValue, minSpan = mid * 0.2;
    if (span < minSpan) res.priceRange = { minValue: Math.max(0, mid - minSpan / 2), maxValue: mid + minSpan / 2 };
    return res;
  };
  const candleSeries = chart.addSeries(LWC.CandlestickSeries, {
    upColor: v('--brand'), downColor: v('--red'), borderVisible: false, wickUpColor: v('--brand'), wickDownColor: v('--red'),
    autoscaleInfoProvider: calmScale,
  });
  const lineSeries = chart.addSeries(LWC.LineSeries, { color: v('--brand'), lineWidth: 2, visible: false, autoscaleInfoProvider: calmScale });
  candleSeries.setData(candles);
  lineSeries.setData(line);
  if (vols.length) {
    const volSeries = chart.addSeries(LWC.HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    volSeries.setData(vols);
  }
  chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.12, bottom: vols.length ? 0.26 : 0.08 } });

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
  // Open zoomed out on the last 10 years (or the whole history if shorter).
  $('#range-btns button[data-r="10Y"]').click();
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
  // Start from the latest year that actually reports revenue.
  const lastInc = [...c.income].reverse().find((r) => isNum(r.revenue) && r.revenue > 0) || c.income[c.income.length - 1];
  const g5 = hist.revenueCagr5 ?? hist.revenueCagr;
  const m5 = hist.avgFcfMargin5 ?? hist.avgFcfMargin;
  const defaults = {
    growth: isNum(g5) ? g5 * 100 : 2.5,
    margin: isNum(m5) ? m5 * 100 : 5,
    discount: 9,
    terminal: 2.5,
  };
  const round1 = (v) => Math.round(v * 10) / 10;
  const sliders = [
    { id: 'growth', label: 'Revenue growth, years 1–5', min: -20, max: 60, step: 0.1, why: isNum(g5) ? `Default: the company's average growth over the <b>last ${hist.span5} years</b>: revenue went from ${compact(hist.cagr5From.value, cur)} (FY${hist.cagr5From.year}) to ${compact(hist.cagr5To.value, cur)} (FY${hist.cagr5To.year}) = <b>${pct(g5)} a year</b>.${isNum(hist.revenueCagr) && hist.span > hist.span5 ? ` Over the whole history shown (FY${hist.cagr5To.year - hist.span}–FY${hist.cagr5To.year}) it was ${pct(hist.revenueCagr)} a year.` : ''}`
      : 'Revenue history is incomplete, so the default is 2.5% (long-run economic growth). Set your own estimate.' },
    { id: 'margin', label: 'Free cash flow margin', min: -20, max: 60, step: 0.1, why: `Default: its average free cash flow ÷ revenue over the last 5 years (${pct(m5)}).` },
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
    sliders.forEach((s) => { $(`#o-${s.id}`).textContent = `${v[s.id].toFixed(s.step < 0.1 || s.step === 0.25 ? 2 : 1)}%`; });
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
      <div class="answer iv"><div class="label">⭐ Intrinsic value per share (DCF), with these assumptions</div>
        <div class="value">${isNum(r.perShare) ? (r.perShare > 0 ? money(r.perShare, pcur) : 'Below zero') : DASH}</div>
        ${isNum(price) ? `<div class="iv-compare"><span>Intrinsic value <b>${isNum(r.perShare) && r.perShare > 0 ? money(r.perShare, pcur) : DASH}</b></span><span>Market price <b>${money(price, pcur)}</b></span></div>` : ''}
        <p class="say">${isNum(diff) ? `The current price of ${money(price, pcur)} is <b>${pct(Math.abs(diff))} ${diff >= 0 ? 'above' : 'below'}</b> this model value. Change the assumptions to see what the price implies.` :
    r.perShare <= 0 ? 'With these assumptions the projected cash flows do not cover the company\'s net debt.' : ''}</p></div>
      <div class="stats">
        ${stat('Enterprise value', compact(r.enterpriseValue, cur))}${stat(val.netDebt >= 0 ? '− Net debt' : '+ Net cash', compact(Math.abs(val.netDebt), cur))}
        ${stat('Equity value', compact(r.equityValue, cur))}${stat('Shares', isNum(shares) ? `${(shares / 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 })}M` : DASH)}
        ${stat('Share of value after year 10', pct(r.terminalShare, 0))}
      </div>
      <div class="card"><h3 style="margin-top:0">Revenue and free cash flow: history and projection</h3><div class="chart-box tall"><canvas id="c-dcf"></canvas></div></div>

      <details class="card" style="margin-top:16px"><summary style="cursor:pointer;font-weight:800">See the year-by-year projection</summary>
        <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Year</th><th>Growth</th><th>Revenue</th><th>Free cash flow</th><th>Value today</th></tr></thead><tbody>
        ${r.rows.map((x) => `<tr><td>${lastInc.fiscalYear + x.year}</td><td>${pct(x.growth)}</td><td>${compact(x.revenue, cur)}</td><td>${compact(x.fcf, cur)}</td><td>${compact(x.pv, cur)}</td></tr>`).join('')}
        <tr class="total"><td>After ${lastInc.fiscalYear + 10}</td><td>${pct(v.terminal / 100)}</td><td></td><td>Terminal value ${compact(r.terminalValue, cur)}</td><td>${compact(r.pvTerminal, cur)}</td></tr>
        </tbody></table></div></details>
      ${arrow('The model is only as good as its assumptions. Using the company\'s history as the starting point is a neutral choice, not a forecast: the past does not guarantee the future.')}`;
    $('#dcf-sens').innerHTML = `<h3 style="margin-top:0">🎯 Sensitivity: value per share</h3><p class="small muted" style="margin-top:0">How the result changes with the discount rate (rows) and growth (columns).</p>
      <div class="table-wrap"><table class="sens"><thead><tr><th>Discount ↓ / growth →</th>${[-4, -2, 0, 2, 4].map((dg) => `<th>${(v.growth + dg).toFixed(1)}%</th>`).join('')}</tr></thead><tbody>
        ${[-2, -1, 0, 1, 2].map((dd) => `<tr><td>${(v.discount + dd).toFixed(2)}%</td>${[-4, -2, 0, 2, 4].map((dg) => {
    const x = run(v.growth + dg, v.discount + dd);
    return `<td class="${dd === 0 && dg === 0 ? 'mid' : ''}">${x && !x.error && isNum(x.perShare) ? money(x.perShare, pcur) : DASH}</td>`;
  }).join('')}</tr>`).join('')}
      </tbody></table></div>`;
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




// ---------- Business section visuals ----------
function renderBusiness(c) {
  const p = c.profile, cur = state.cur, val = state.val;
  const last = [...c.income].reverse().find((r) => isNum(r.revenue)) || c.income[c.income.length - 1];
  const site = p.website ? (p.website.startsWith('http') ? p.website : `https://${p.website}`) : '';
  const facts = [
    ['🏷️', 'Sector', p.sector, 'var(--blue)'],
    ['🏭', 'Industry', p.industry, 'var(--brand)'],
    ['🌍', 'Country', p.country, 'var(--accent)'],
    ['👥', 'Employees', p.employees ? p.employees.toLocaleString('en-US') : '', '#8b5cf6'],
    ['📅', 'Listed since', p.ipoDate, 'var(--chart-6)'],
    ['💰', `Revenue FY${last.fiscalYear}`, isNum(last.revenue) ? compact(last.revenue, cur) : '', 'var(--brand)'],
    ['📊', 'Market value', isNum(val.marketCap) ? compact(val.marketCap, cur) : '', 'var(--blue)'],
    ['🧑‍💼', 'Revenue per employee', p.employees && isNum(last.revenue) ? compact(last.revenue / p.employees, cur) : '', 'var(--accent)'],
    ['🔗', 'Website', site ? `<a href="${escapeHtml(site)}" target="_blank" rel="noopener nofollow">${escapeHtml(site.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))} ↗</a>` : '', '#64748b', true],
  ].filter((f) => f[2]);
  $('#facts').innerHTML = facts.map(([icon, k, v, color, html]) => `<div class="fact" style="--c:${color}"><span class="fi">${icon}</span><div><div class="fk">${k}</div><div class="fv">${html ? v : escapeHtml(v)}</div></div></div>`).join('');

  const text = p.description || '';
  const box = $('#about-text');
  if (text) {
    const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) || [text];
    const lead = sentences.slice(0, 2).join('').trim();
    const rest = sentences.slice(2).join('').trim();
    box.innerHTML = `<p class="lead-quote">${escapeHtml(lead)}</p>${rest ? `<details class="more"><summary>Read the full description</summary><p>${escapeHtml(rest)}</p></details>` : ''}`;
  } else {
    box.innerHTML = '<p class="lead-quote muted">Looking up a description…</p>';
    if (!c.isDemo) wikiFindCompany(p.name).then((w) => {
      box.innerHTML = w?.extract ? `<p class="lead-quote">${escapeHtml(firstSentences(w.extract, 3))}</p><p class="small muted"><a href="${escapeHtml(w.url)}" target="_blank" rel="noopener">Source: Wikipedia ↗</a></p>`
        : `<p class="muted">No description is available from our data sources. The company's annual report ("Business" section) explains what it does. Industry: <b>${escapeHtml(p.industry || 'not available')}</b>.</p>`;
    });
  }

  // Every 100 of sales split into: direct costs, operating costs, interest/tax/other, profit.
  const flow = $('#money-flow');
  const rev = last.revenue, gp = last.grossProfit, op = last.operatingIncome, ni = last.netIncome;
  if (!(isNum(rev) && rev > 0 && isNum(op) && isNum(ni))) { flow.innerHTML = '<p class="muted">Not enough data for this year.</p>'; return; }
  const cogs = isNum(gp) ? rev - gp : null;
  const parts = [
    ...(isNum(cogs) ? [['Direct costs (making the product)', cogs, 'var(--chart-7)']] : []),
    [isNum(cogs) ? 'Operating costs (staff, R&D, marketing…)' : 'All operating costs', isNum(cogs) ? gp - op : rev - op, 'var(--chart-2)'],
    ['Interest, tax & other', op - ni, 'var(--chart-3)'],
    [ni >= 0 ? 'Profit for shareholders' : 'Loss', ni, ni >= 0 ? 'var(--brand)' : 'var(--red)'],
  ];
  if (parts.some(([, v]) => v < 0) && ni >= 0) {
    flow.innerHTML = arrow(`Of every 100 of sales in FY${last.fiscalYear}, <b>${(ni / rev * 100).toFixed(1)}</b> ended up as profit for shareholders.`);
    return;
  }
  const scale = ni >= 0 ? rev : rev - ni; // with a loss, costs exceed sales
  flow.innerHTML = `<div class="flowbar">${parts.filter(([, v]) => v > 0 || v < 0).map(([, v, color]) => `<i style="flex:${Math.abs(v) / scale};background:${color}" title="${(Math.abs(v) / rev * 100).toFixed(1)}"></i>`).join('')}</div>
    <div class="flow-legend">${parts.map(([label, v, color]) => `<div><span class="sw" style="background:${color}"></span><b>${(v / rev * 100).toFixed(1)}</b> ${escapeHtml(label)}</div>`).join('')}</div>
    ${arrow(ni >= 0 ? `Out of every 100 the customers paid, <b>${(ni / rev * 100).toFixed(1)}</b> was left as profit after all costs, interest and taxes.` : `Costs were higher than sales: for every 100 of sales the company lost <b>${(-ni / rev * 100).toFixed(1)}</b>.`)}`;
}


// ---------- What if I had invested? ----------
function renderWhatIf(prices) {
  const out = $('#wi-out');
  if (!out) return;
  if (!prices?.dates?.length) { out.innerHTML = '<p class="muted">Needs the price history, which is not available right now.</p>'; return; }
  const pcur = state.pcur, name = state.company.profile.name;
  const first = prices.dates[0], lastD = prices.dates[prices.dates.length - 1];
  const dateIn = $('#wi-date');
  dateIn.min = first;
  dateIn.max = lastD;
  const yearsAgo = (y) => {
    if (!y) return first;
    const d = new Date(Date.parse(lastD) - y * 365.25 * 864e5).toISOString().slice(0, 10);
    return d < first ? first : d;
  };
  dateIn.value = yearsAgo(10);
  const run = () => {
    const amount = Number($('#wi-amount').value);
    const r = investmentSince({ prices, dividends: prices.dividends || [], startDate: dateIn.value || first, amount, reinvest: $('#wi-reinvest').checked });
    if (!r) { out.innerHTML = '<div class="notice error">Choose an amount above zero and a date within the price history.</div>'; return; }
    const up = r.value >= amount;
    out.innerHTML = `<div class="answer" style="${up ? '' : 'background:linear-gradient(135deg,#b93838,#d64545)'}"><div class="label">${money(amount, pcur, 0)} invested in ${escapeHtml(name)} on ${r.buyDate} would be worth</div>
        <div class="value">${money(r.value, pcur, 0)}</div>
        <p class="say">${up ? 'A gain' : 'A loss'} of <b>${money(Math.abs(r.profit), pcur, 0)}</b> (${signedPct(r.totalReturn)})${isNum(r.annualReturn) ? `, or <b>${signedPct(r.annualReturn)}</b> a year on average over ${r.years.toFixed(1)} years` : ''}.</p></div>
      <div class="card wi-chart" style="margin-top:16px"><div class="chart-box"><canvas id="c-whatif"></canvas></div></div>`;
    $('#wi-stats').innerHTML = `${stat('Bought at', `${money(r.buyPrice, pcur)} <span class="muted small">${r.buyDate}</span>`)}
        ${stat('Price today', `${money(r.endPrice, pcur)} <span class="muted small">${r.endDate}</span>`)}
        ${stat('Shares bought', r.sharesBought.toLocaleString('en-US', { maximumFractionDigits: 2 }))}
        ${stat('Dividends received', money(r.dividendsReceived, pcur, 0))}
        ${$('#wi-reinvest').checked ? stat('Shares today (with reinvested dividends)', r.sharesNow.toLocaleString('en-US', { maximumFractionDigits: 2 })) : ''}
        ${stat('Price change alone', signedPct(r.priceOnlyReturn))}`;
    const pal = palette();
    lineChart($('#c-whatif'), r.series.map((x) => x[0]), [
      { label: 'Value of the investment', data: r.series.map((x) => Math.round(x[1])), color: up ? pal.brand : pal.red, fill: true, pointRadius: 0, tension: 0.1 },
      { label: 'Amount invested', data: r.series.map(() => amount), color: pal.muted, borderDash: [6, 6], pointRadius: 0, fill: false },
    ], { yFormat: (v) => money(Number(v), pcur, 0), xFormat: function (v) { const l = this.getLabelForValue(v); return l ? l.slice(0, 4) : ''; } });
  };
  $('#wi-form').addEventListener('input', run);
  $$('#wi-quick button').forEach((b) => b.addEventListener('click', () => { dateIn.value = yearsAgo(Number(b.dataset.y)); run(); }));
  run();
}

// ---------- Earnings & dividends per share ----------
function renderEps(c) {
  const pal = palette();
  const inc = splitAdjustedIncome(c.income);
  const eps = inc.map((r) => r.epsDiluted ?? r.eps);
  const years = inc.map((r) => `FY${r.fiscalYear}`);
  const r2 = (v) => (isNum(v) ? Math.round(v * 100) / 100 : null);
  barChart($('#c-eps'), years, [{ label: 'EPS (diluted)', data: eps.map(r2), color: pal.series[0], colorBySign: true }],
    { yFormat: (v) => money(Number(v), state.cur), legend: false });
  const pts = eps.map((v, i) => [v, inc[i].fiscalYear]).filter(([v]) => isNum(v));
  const box = $('#eps-text');
  if (pts.length < 2) { box.innerHTML = '<p class="muted small">Not enough EPS history.</p>'; return; }
  const [first, firstY] = pts[0], [last, lastY] = pts[pts.length - 1];
  const g = growthSeries(eps);
  const ups = g.filter((x) => isNum(x) && x > 0).length, downs = g.filter((x) => isNum(x) && x < 0).length;
  const gr = first > 0 && last > 0 ? cagr(first, last, lastY - firstY) : null;
  box.innerHTML = arrow(`EPS went from ${money(first, state.cur)} (FY${firstY}) to ${money(last, state.cur)} (FY${lastY})${isNum(gr) ? `: <b>${signedPct(gr)}</b> a year on average` : ''}.
    It rose in <b>${ups}</b> years and fell in <b>${downs}</b>. ${isNum(g[g.length - 1]) ? `Latest year: ${signedPct(g[g.length - 1])}.` : ''}
    EPS can also rise when a company buys back its own shares, because profit is shared among fewer shares.`);
}

function renderDividends(prices) {
  const c = state.company, pal = palette(), pcur = state.pcur;
  let payments = prices?.dividends;
  let source = 'every payment recorded since listing';
  if (!payments?.length) {
    // No payment list from the data source: estimate from the cash flow statement (dividends paid ÷ shares).
    payments = c.cashflow.map((cf) => {
      const inc = c.income.find((r) => r.fiscalYear === cf.fiscalYear);
      return isNum(cf.dividendsPaid) && cf.dividendsPaid !== 0 && inc?.sharesDiluted ? [`${cf.fiscalYear}-06-30`, Math.abs(cf.dividendsPaid) / inc.sharesDiluted] : null;
    }).filter(Boolean);
    source = 'estimated from the cash flow statement (dividends paid ÷ shares), by fiscal year';
  }
  const h = dividendHistory(payments);
  const box = $('#div-text');
  if (!h.rows.length) {
    $('#div-box').innerHTML = '<p class="muted center" style="padding-top:110px">💤 No dividends paid in the available history.</p>';
    box.innerHTML = arrow('This company has not paid dividends in the period we can see. Many growing companies reinvest all their profit (or buy back shares) instead.');
    return;
  }
  barChart($('#c-div'), h.rows.map((r) => (r.partial ? `${r.year} (so far)` : String(r.year))),
    [{ label: 'Dividends per share', data: h.rows.map((r) => Math.round(r.amount * 1e4) / 1e4), backgroundColor: h.rows.map((r) => (r.partial ? `${pal.accent}88` : pal.accent)) }],
    { yFormat: (v) => money(Number(v), pcur), legend: false });
  const yieldNow = isNum(h.lastFullAmount) && isNum(state.val.price) && state.val.price > 0 && pcur === (c.reportingCurrency || pcur) ? h.lastFullAmount / state.val.price : null;
  box.innerHTML = arrow(`First dividend in our data: <b>${h.firstYear}</b>. In ${h.lastFullYear} one share received <b>${money(h.lastFullAmount, pcur)}</b>${isNum(yieldNow) ? ` (${pct(yieldNow, 2)} of today's price)` : ''}.
    ${h.increaseStreak ? `The yearly total has risen for <b>${h.increaseStreak}</b> year${h.increaseStreak > 1 ? 's' : ''} in a row.` : 'The yearly total did not rise last year.'}
    ${isNum(h.cagr10) ? `Over 10 years it grew ${pct(h.cagr10)} a year on average.` : ''}`) + `<p class="small muted" style="margin:0">Source: ${source}. A year's total depends on how many payments fell in that calendar year.</p>`;
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


// ---------- Symmetric tile grids ----------
// Choose the number of columns so rows come out even (8 tiles → 4 + 4, 9 → 3 + 3 + 3) instead of 6 + 2.
function balanceGrids(root = result) {
  const MIN = { kpis: 150, facts: 160, stats: 130 };
  root.querySelectorAll('.kpis, .facts, .stats:not(.stack)').forEach((el) => {
    const n = el.children.length;
    if (!n) return;
    const kind = Object.keys(MIN).find((k) => el.classList.contains(k));
    const gap = 12, width = el.clientWidth || el.parentElement.clientWidth;
    const maxCols = Math.max(1, Math.min(n, Math.floor((width + gap) / (MIN[kind] + gap))));
    let best = maxCols, bestWaste = Infinity;
    for (let c = maxCols; c >= Math.max(Math.min(2, maxCols), Math.ceil(maxCols / 2)); c--) {
      const waste = Math.ceil(n / c) * c - n;
      if (waste < bestWaste) { best = c; bestWaste = waste; }
    }
    el.style.gridTemplateColumns = `repeat(${best}, minmax(0, 1fr))`;
  });
}
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => balanceGrids(), 150); });
new MutationObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => balanceGrids(), 50); }).observe(result, { childList: true, subtree: true });

// ===================== Start =====================
renderSuggestions();
setupSearch();
const initial = new URLSearchParams(location.search).get('t');
if (initial) load(initial);
// Back/forward buttons: reload only when the ticker itself changed. (Clicking a section link such as
// #overview also fires "popstate"; reloading then wiped the page and the link never arrived.)
window.addEventListener('popstate', () => {
  const t = (new URLSearchParams(location.search).get('t') || '').toUpperCase();
  const shown = state.company?.profile?.symbol?.toUpperCase() || '';
  if (t && t !== shown) load(t);
  else if (!t) { result.innerHTML = ''; compactHero(false); state.company = null; }
});

// Section links (tabs, "See the full breakdown"...): scroll smoothly below the sticky bars.
result.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const target = document.getElementById(a.getAttribute('href').slice(1));
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  history.replaceState(history.state, '', `${location.search}#${target.id}`);
});
