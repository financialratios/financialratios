// Free fallback for prices: Yahoo Finance's public chart endpoint (unofficial, no key).
// It can rate-limit or change without notice, which is why the paid FMP key is the recommended setup.
const UA = 'Mozilla/5.0 (compatible; FinancialRat/1.0)';

export function parseChart(json) {
  const result = json?.chart?.result?.[0];
  if (!result) return null;
  const ts = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const dates = [], close = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (typeof c !== 'number') continue;
    dates.push(new Date(ts[i] * 1000).toISOString().slice(0, 10));
    close.push(Math.round(c * 10000) / 10000);
  }
  const m = result.meta || {};
  const price = m.regularMarketPrice ?? close[close.length - 1] ?? null;
  const prev = m.chartPreviousClose ?? m.previousClose ?? (close.length > 1 ? close[close.length - 2] : null);
  return {
    dates,
    close,
    meta: {
      price,
      currency: m.currency || null,
      exchange: m.fullExchangeName || m.exchangeName || '',
      firstTradeDate: m.firstTradeDate ? new Date(m.firstTradeDate * 1000).toISOString().slice(0, 10) : dates[0] || null,
      change: price != null && prev != null ? price - prev : null,
      changePercent: price != null && prev ? ((price - prev) / prev) * 100 : null,
    },
  };
}

export async function yahooChart(symbol, { range = 'max', fetchImpl = fetch } = {}) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false`;
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) {
    const err = new Error(`Yahoo answered ${res.status}`);
    err.status = res.status === 404 ? 404 : 502;
    throw err;
  }
  const parsed = parseChart(await res.json());
  if (!parsed || !parsed.dates.length) {
    const err = new Error(`No price history for "${symbol}"`);
    err.status = 404;
    throw err;
  }
  return parsed;
}
