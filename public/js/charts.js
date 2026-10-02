// Small helpers around Chart.js (loaded from /vendor/chart.umd.min.js as window.Chart)
// so every chart on the site shares the same look, colours and number formats.

export function palette() {
  const css = getComputedStyle(document.documentElement);
  const v = (n) => css.getPropertyValue(n).trim();
  return {
    series: [1, 2, 3, 4, 5, 6, 7].map((i) => v(`--chart-${i}`)),
    ink: v('--ink'), muted: v('--muted'), line: v('--line'), surface: v('--surface'),
    brand: v('--brand'), red: v('--red'), accent: v('--accent'), blue: v('--blue'),
  };
}

export function alpha(color, a) {
  if (color.startsWith('#') && color.length === 7) {
    const n = parseInt(color.slice(1), 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  return color;
}

function base(p, { yFormat, xFormat, legend = true, stacked = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: legend, labels: { color: p.ink, usePointStyle: true, boxWidth: 8, font: { weight: '600' } } },
      tooltip: {
        backgroundColor: p.ink, titleColor: p.surface, bodyColor: p.surface, padding: 10, cornerRadius: 10,
        callbacks: yFormat ? { label: (ctx) => `${ctx.dataset.label ? ctx.dataset.label + ': ' : ''}${yFormat(ctx.parsed.y ?? ctx.parsed)}` } : {},
      },
    },
    scales: {
      x: { stacked, grid: { display: false }, ticks: { color: p.muted, maxRotation: 0, autoSkipPadding: 14, ...(xFormat ? { callback: xFormat } : {}) }, border: { color: p.line } },
      y: { stacked, grid: { color: p.line }, border: { display: false }, ticks: { color: p.muted, ...(yFormat ? { callback: (v) => yFormat(v) } : {}) } },
    },
  };
}

const charts = new WeakMap();
function make(canvas, config) {
  charts.get(canvas)?.destroy();
  const c = new window.Chart(canvas, config);
  charts.set(canvas, c);
  return c;
}

export function barChart(canvas, labels, datasets, opts = {}) {
  const p = palette();
  return make(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: datasets.map((d, i) => ({
        borderRadius: 6, maxBarThickness: 46, skipNull: true,
        backgroundColor: d.colorBySign ? d.data.map((v) => (v < 0 ? p.red : d.color || p.series[i])) : d.color || p.series[i],
        ...d,
      })),
    },
    options: base(p, opts),
  });
}

export function lineChart(canvas, labels, datasets, opts = {}) {
  const p = palette();
  return make(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map((d, i) => ({
        borderColor: d.color || p.series[i], backgroundColor: alpha(d.color || p.series[i], 0.12),
        borderWidth: 3, pointRadius: 3, pointHoverRadius: 6, tension: 0.25, spanGaps: true, ...d,
      })),
    },
    options: base(p, opts),
  });
}

export function donutChart(canvas, labels, values, opts = {}) {
  const p = palette();
  const colors = labels.map((_, i) => p.series[i % p.series.length]);
  make(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: p.surface, borderWidth: 3, hoverOffset: 8 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '62%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: p.ink, titleColor: p.surface, bodyColor: p.surface, padding: 10, cornerRadius: 10,
          callbacks: { label: (ctx) => `${ctx.label}: ${opts.format ? opts.format(ctx.parsed) : ctx.parsed}` },
        },
      },
    },
  });
  return colors;
}

/** Daily price line with a numeric (timestamp) x axis: fast for decades of data, no date library needed. */
export function priceChart(canvas, points, { currency = '', logScale = false } = {}) {
  const p = palette();
  const fmtDate = (t) => new Date(t).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const spanYears = points.length ? (points[points.length - 1].x - points[0].x) / 3.156e10 : 0;
  return make(canvas, {
    type: 'line',
    data: { datasets: [{ data: points, borderColor: p.brand, backgroundColor: alpha(p.brand, 0.1), fill: !logScale, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: false, parsing: false, normalized: true, animation: false,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      plugins: {
        legend: { display: false },
        decimation: { enabled: true, algorithm: 'lttb', samples: 900 },
        tooltip: {
          backgroundColor: p.ink, titleColor: p.surface, bodyColor: p.surface, padding: 10, cornerRadius: 10, displayColors: false,
          callbacks: { title: (items) => fmtDate(items[0].parsed.x), label: (ctx) => `${currency}${ctx.parsed.y.toFixed(2)}` },
        },
      },
      scales: {
        x: {
          type: 'linear', grid: { display: false }, border: { color: p.line },
          ticks: {
            color: p.muted, maxRotation: 0, autoSkipPadding: 20,
            callback: (t) => new Date(t).toLocaleDateString('en-US', spanYears > 3 ? { year: 'numeric' } : { month: 'short', year: '2-digit' }),
          },
        },
        y: { type: logScale ? 'logarithmic' : 'linear', grid: { color: p.line }, border: { display: false }, ticks: { color: p.muted, callback: (v) => `${currency}${Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}` } },
      },
    },
  });
}
