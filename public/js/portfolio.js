// Portfolio tracker. Everything is stored in this browser (localStorage); prices come from /api/quote.
import { portfolioSummary, isNum } from './lib/finance.js';
import { money, pct, signedPct, escapeHtml, compact } from './lib/format.js';
import { donutChart, barChart, lineChart, palette } from './charts.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const KEY = 'fr-portfolio-v1';
const BASES = ['USD', 'EUR', 'RON', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY'];

// ---------- storage ----------
function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { base: 'USD', transactions: [] }; } catch { return { base: 'USD', transactions: [] }; }
}
let data = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { message('Your browser blocked saving (private mode?). Use "Save a backup" to keep your data.', true); }
}
let quotes = {}, fx = {}, asOf = null, historyCache = new Map();
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function message(text, error = false) {
  $('#pf-msg').innerHTML = text ? `<div class="notice ${error ? 'error' : ''}" style="margin:0">${text}</div>` : '';
}

// ---------- prices ----------
async function refreshPrices() {
  const symbols = [...new Set(data.transactions.map((t) => t.symbol))];
  if (!symbols.length) { quotes = {}; fx = { [data.base]: 1 }; render(); return; }
  $('#pf-asof').textContent = 'Updating prices…';
  try {
    const res = await fetch(`/api/quote?symbols=${encodeURIComponent(symbols.join(','))}&base=${data.base}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error);
    quotes = Object.fromEntries(body.quotes.filter((q) => !q.error).map((q) => [q.symbol, q]));
    fx = body.fx;
    asOf = body.asOf;
  } catch (e) {
    $('#pf-asof').textContent = `Prices could not be updated (${e.message}).`;
  }
  render();
}

// ---------- rendering ----------
const kpi = (k, v, s, cls = '') => `<div class="kpi"><div class="k">${k}</div><div class="v ${cls}">${v}</div><div class="s">${s}</div></div>`;

function render() {
  const base = data.base;
  const { rows, totals } = portfolioSummary(data.transactions, quotes, fx);
  const up = (x) => (x >= 0 ? 'up' : 'down');
  const sgn = (x) => `${x >= 0 ? '+' : '−'}${money(Math.abs(x), base)}`;
  $('#pf-kpis').innerHTML = [
    kpi('Total value today', money(totals.value, base), (() => { const n = rows.filter((r) => r.shares > 0).length; return `${n} holding${n === 1 ? '' : 's'}`; })()),
    kpi('Total invested', money(totals.cost, base), 'what you paid for the shares you still own'),
    kpi('Gain or loss', sgn(totals.unrealized), `${signedPct(totals.gainPct)}${totals.realized ? ` · realised from sales: ${sgn(totals.realized)}` : ''}`, up(totals.unrealized)),
    kpi('Today', sgn(totals.dayChange), signedPct(totals.dayChangePct, 2), up(totals.dayChange)),
  ].join('');
  $('#pf-asof').textContent = asOf ? `Prices as of ${new Date(asOf).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}${totals.missing.length ? ` · no price for ${totals.missing.join(', ')}` : ''}` : '';

  const held = rows.filter((r) => r.shares > 0);
  if (!data.transactions.length) {
    $('#pf-table').innerHTML = '<p class="muted" style="padding:16px;margin:0">Your portfolio is empty. Add your first purchase with the form above, or <b>try an example portfolio</b> at the bottom of the page.</p>';
  } else {
    $('#pf-table').innerHTML = `<table class="rt compact"><thead><tr><th>Holding</th><th>Shares</th><th>Avg. price paid</th><th>Price today</th><th>Value (${base})</th><th>Gain / loss</th><th>%</th><th>Today</th><th>Weight</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td><a href="/analyze/?t=${encodeURIComponent(r.symbol)}" title="Analyze ${escapeHtml(r.name)}"><b>${escapeHtml(r.symbol)}</b></a><span class="pf-name">${escapeHtml(r.name !== r.symbol ? r.name : '')}</span></td>
        <td>${r.shares.toLocaleString('en-US', { maximumFractionDigits: 4 })}</td>
        <td>${isNum(r.avgCost) ? money(r.avgCost, r.currency || base) : '—'}</td>
        <td>${isNum(r.price) ? money(r.price, r.currency || base) : '—'}</td>
        <td><b>${money(r.value, base)}</b></td>
        <td class="${isNum(r.gain) ? up(r.gain) : ''}">${isNum(r.gain) ? sgn(r.gain) : '—'}</td>
        <td class="${isNum(r.gainPct) ? up(r.gainPct) : ''}">${signedPct(r.gainPct)}</td>
        <td class="${isNum(r.dayChange) ? up(r.dayChange) : ''}">${isNum(r.dayChange) ? sgn(r.dayChange) : '—'}</td>
        <td>${pct(r.weight)}</td></tr>`).join('')}
      <tr class="total"><td>Total</td><td></td><td></td><td></td><td>${money(totals.value, base)}</td><td class="${up(totals.unrealized)}">${sgn(totals.unrealized)}</td><td>${signedPct(totals.gainPct)}</td><td class="${up(totals.dayChange)}">${sgn(totals.dayChange)}</td><td>${totals.value ? '100%' : '—'}</td></tr>
      </tbody></table>`;
  }

  // Allocation donut
  const valued = held.filter((r) => isNum(r.value) && r.value > 0);
  if (valued.length) {
    const colors = donutChart($('#pf-donut'), valued.map((r) => r.symbol), valued.map((r) => Math.round(r.value)), { format: (v) => `${money(v, base, 0)} (${pct(v / totals.value)})` });
    $('#pf-legend').innerHTML = valued.map((r, i) => `<li class="seg-row"><div class="seg-top"><span><span class="sw" style="background:${colors[i]}"></span> ${escapeHtml(r.symbol)}</span><span><b>${pct(r.weight)}</b> <span class="muted small">${compact(r.value, base)}</span></span></div>
      <div class="seg-bar"><i style="width:${(r.value / valued[0].value) * 100}%;background:${colors[i]}"></i></div></li>`).join('');
    const top = valued[0];
    $('#pf-alloc-note').innerHTML = `<div class="explain"><span class="ar">→</span><p style="margin:0">Your largest holding, <b>${escapeHtml(top.symbol)}</b>, is ${pct(top.weight)} of your portfolio.
      ${top.weight > 0.4 ? 'That is a large share in one company: if it falls, your whole portfolio feels it (see the lesson on diversification).' : 'Spreading money over several holdings reduces the damage any single one can do.'}</p></div>`;
  } else {
    $('#pf-legend').innerHTML = '';
    $('#pf-alloc-note').innerHTML = '<p class="muted">Your allocation will appear here.</p>';
  }

  // Gain / loss bars
  const pal = palette();
  const g = held.filter((r) => isNum(r.gain));
  barChart($('#pf-gains'), g.map((r) => r.symbol), [{ label: `Gain / loss (${base})`, data: g.map((r) => Math.round(r.gain)), color: pal.brand, colorBySign: true }],
    { yFormat: (v) => money(Number(v), base, 0), legend: false, horizontal: true });

  // Transactions
  const tx = [...data.transactions].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  $('#pf-tx').innerHTML = tx.length ? `<table class="rt compact"><thead><tr><th>Date</th><th>Type</th><th>Ticker</th><th>Shares</th><th>Price</th><th>Total</th><th></th></tr></thead><tbody>
    ${tx.map((t) => `<tr><td>${escapeHtml(t.date || '—')}</td><td>${t.type === 'sell' ? '🔴 Sold' : '🟢 Bought'}</td><td><b>${escapeHtml(t.symbol)}</b></td>
      <td>${t.shares.toLocaleString('en-US', { maximumFractionDigits: 4 })}</td><td>${money(t.price, quotes[t.symbol]?.currency || base)}</td>
      <td>${money(t.shares * t.price, quotes[t.symbol]?.currency || base)}</td><td><button class="pf-del" data-id="${t.id}" title="Delete this transaction" aria-label="Delete">🗑️</button></td></tr>`).join('')}
    </tbody></table>` : '<p class="muted" style="margin:0">No transactions yet.</p>';
  $$('.pf-del').forEach((b) => b.addEventListener('click', () => {
    if (!confirm('Delete this transaction?')) return;
    data.transactions = data.transactions.filter((t) => t.id !== b.dataset.id);
    save();
    historyCache.clear();
    refreshPrices();
  }));
  renderHistory();
}

// ---------- value over time ----------
async function renderHistory() {
  const note = $('#pf-history-note');
  const symbols = [...new Set(data.transactions.map((t) => t.symbol))];
  if (!symbols.length) { lineChart($('#pf-history'), [], []); note.textContent = 'Add transactions with dates to see how your portfolio grew.'; return; }
  if (symbols.length > 15) { note.textContent = 'The history chart is shown for portfolios with up to 15 different holdings.'; return; }
  note.textContent = 'Loading price histories…';
  const series = await Promise.all(symbols.map(async (s) => {
    if (!historyCache.has(s)) historyCache.set(s, fetch(`/api/prices?symbol=${encodeURIComponent(s)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
    return [s, await historyCache.get(s)];
  }));
  const hist = Object.fromEntries(series.filter(([, h]) => h?.dates?.length));
  const dated = data.transactions.filter((t) => t.date && hist[t.symbol]);
  if (!dated.length) { note.textContent = 'Add the dates of your purchases to see your portfolio\'s value over time.'; return; }
  const start = dated.map((t) => t.date).sort()[0];
  const allDates = [...new Set(Object.values(hist).flatMap((h) => h.dates.filter((d) => d >= start)))].sort();
  const step = Math.max(1, Math.floor(allDates.length / 300));
  const pick = allDates.filter((_, i) => i % step === 0 || i === allDates.length - 1);
  const idx = Object.fromEntries(Object.keys(hist).map((s) => [s, 0]));
  const last = {};
  const tx = [...dated].sort((a, b) => a.date.localeCompare(b.date));
  const held = {};
  let ti = 0, invested = 0;
  const values = [], investedLine = [];
  for (const d of pick) {
    while (ti < tx.length && tx[ti].date <= d) {
      const t = tx[ti++];
      const rate = fx[quotes[t.symbol]?.currency] ?? 1;
      held[t.symbol] = (held[t.symbol] || 0) + (t.type === 'sell' ? -t.shares : t.shares);
      invested += (t.type === 'sell' ? -1 : 1) * t.shares * t.price * rate;
    }
    let v = 0;
    for (const s of Object.keys(hist)) {
      const h = hist[s];
      while (idx[s] < h.dates.length && h.dates[idx[s]] <= d) { last[s] = h.close[idx[s]]; idx[s]++; }
      if (held[s] && last[s] != null) v += held[s] * last[s] * (fx[quotes[s]?.currency] ?? 1);
    }
    values.push(Math.round(v));
    investedLine.push(Math.round(invested));
  }
  const pal = palette();
  lineChart($('#pf-history'), pick, [
    { label: 'Portfolio value', data: values, color: pal.brand, fill: true, pointRadius: 0, tension: 0.1 },
    { label: 'Money put in (net)', data: investedLine, color: pal.muted, borderDash: [6, 6], pointRadius: 0, fill: false, stepped: true },
  ], { yFormat: (v) => money(Number(v), data.base, 0), xFormat: function (v) { const l = this.getLabelForValue(v); return l ? l.slice(0, 7) : ''; } });
  note.textContent = `From your first dated purchase (${start}). Uses today's exchange rates for all dates; transactions without a date are left out of this chart.`;
}

// ---------- form ----------
let type = 'buy';
$$('#pf-type button').forEach((b) => b.addEventListener('click', () => {
  type = b.dataset.t;
  $$('#pf-type button').forEach((x) => x.classList.toggle('active', x === b));
}));
let searchTimer;
$('#pf-symbol').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (q.length < 1) return;
  searchTimer = setTimeout(async () => {
    try {
      const { results } = await (await fetch(`/api/search?q=${encodeURIComponent(q)}`)).json();
      $('#pf-tickers').innerHTML = (results || []).map((r) => `<option value="${escapeHtml(r.symbol)}">${escapeHtml(r.name)} · ${escapeHtml(r.exchange || '')}</option>`).join('');
    } catch { /* suggestions are optional */ }
  }, 250);
});
$('#pf-today').addEventListener('click', async () => {
  const s = $('#pf-symbol').value.trim().toUpperCase();
  if (!s) { message('Type a ticker first.', true); return; }
  try {
    const body = await (await fetch(`/api/quote?symbols=${encodeURIComponent(s)}&base=${data.base}`)).json();
    const q = body.quotes?.[0];
    if (!q || q.error) throw new Error(q?.error || 'not found');
    $('#pf-price').value = Number(q.price.toFixed(4));
    $('#pf-symbol-hint').textContent = `${q.name} · price in ${q.currency}`;
    message('');
  } catch (e) { message(`No price found for ${escapeHtml(s)} (${escapeHtml(e.message)}).`, true); }
});
$('#pf-date').max = new Date().toISOString().slice(0, 10);
$('#pf-date').value = new Date().toISOString().slice(0, 10);
$('#pf-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const symbol = $('#pf-symbol').value.trim().toUpperCase();
  const shares = Number($('#pf-shares').value), price = Number($('#pf-price').value);
  if (!/^[A-Z0-9.\-^=]{1,20}$/.test(symbol)) return message('Please enter a valid ticker, for example AAPL.', true);
  if (!(shares > 0)) return message('Please enter how many shares (more than 0).', true);
  if (!(price >= 0) || $('#pf-price').value === '') return message('Please enter the price per share.', true);
  if (type === 'sell') {
    const owned = portfolioSummary(data.transactions).rows.find((r) => r.symbol === symbol)?.shares || 0;
    if (shares > owned + 1e-9) return message(`You can't sell ${shares} shares of ${escapeHtml(symbol)}: your portfolio holds ${owned}.`, true);
  }
  data.transactions.push({ id: newId(), symbol, type, shares, price, date: $('#pf-date').value || null });
  save();
  historyCache.delete(symbol);
  message(`✅ Added: ${type === 'sell' ? 'sold' : 'bought'} ${shares} ${escapeHtml(symbol)} at ${price}.`);
  $('#pf-shares').value = ''; $('#pf-price').value = '';
  refreshPrices();
});

// ---------- backup, sample, clear ----------
$('#pf-export').addEventListener('click', () => {
  const lines = ['date,type,symbol,shares,price', ...data.transactions.map((t) => [t.date || '', t.type, t.symbol, t.shares, t.price].join(','))];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  a.download = `my-portfolio-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#pf-import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const rows = (await file.text()).trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
  const tx = rows.map(([date, t, symbol, shares, price]) => ({ id: newId(), date: date || null, type: t === 'sell' ? 'sell' : 'buy', symbol: String(symbol || '').trim().toUpperCase(), shares: Number(shares), price: Number(price) }))
    .filter((t) => /^[A-Z0-9.\-^=]{1,20}$/.test(t.symbol) && t.shares > 0 && t.price >= 0);
  if (!tx.length) { alert('No valid transactions found in this file.'); return; }
  if (data.transactions.length && !confirm(`Replace your current portfolio with the ${tx.length} transactions in this file?`)) return;
  data.transactions = tx;
  save();
  historyCache.clear();
  refreshPrices();
  e.target.value = '';
});
$('#pf-sample').addEventListener('click', () => {
  if (data.transactions.length && !confirm('Replace your current portfolio with an example? (Save a backup first if you want to keep it.)')) return;
  data.transactions = [
    { symbol: 'AAPL', type: 'buy', shares: 10, price: 150, date: '2022-01-03' },
    { symbol: 'KO', type: 'buy', shares: 20, price: 55, date: '2021-06-01' },
    { symbol: 'MSFT', type: 'buy', shares: 5, price: 280, date: '2023-01-03' },
    { symbol: 'AAPL', type: 'sell', shares: 2, price: 190, date: '2024-03-01' },
    { symbol: 'DEMO', type: 'buy', shares: 100, price: 9.5, date: '2023-05-02' },
  ].map((t) => ({ ...t, id: newId() }));
  save();
  historyCache.clear();
  refreshPrices();
});
$('#pf-clear').addEventListener('click', () => {
  if (!confirm('Delete your whole portfolio from this browser? This cannot be undone (unless you saved a backup).')) return;
  data.transactions = [];
  save();
  historyCache.clear();
  refreshPrices();
});

// ---------- base currency ----------
$('#pf-base').innerHTML = BASES.map((c) => `<option${c === data.base ? ' selected' : ''}>${c}</option>`).join('');
$('#pf-base').addEventListener('change', (e) => { data.base = e.target.value; save(); refreshPrices(); });
$('#pf-refresh').addEventListener('click', refreshPrices);

refreshPrices();
