// "Download" button: the three financial statements, laid out like Yahoo Finance
// (numbers in thousands, sections in bold with indented sub-lines, years from oldest to newest),
// as an Excel workbook or a PDF. Libraries load only when someone clicks.
import { INCOME_LAYOUT, BALANCE_LAYOUT, CASHFLOW_LAYOUT, RATIO_ROWS, layoutValue } from './rows.js';
import { yearlyRatios } from './lib/finance.js';

const loaded = {};
function loadScript(src) {
  loaded[src] ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(s);
  });
  return loaded[src];
}

const fileBase = (c) => `${c.profile.symbol}_financial_statements_FinancialRat`;
const today = () => new Date().toISOString().slice(0, 10);
const curOf = (c) => c.reportingCurrency || c.profile.currency || 'USD';
const usDate = (iso) => (iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : '');

const STATEMENTS = [
  ['Income Statement', 'income', INCOME_LAYOUT],
  ['Balance Sheet', 'balance', BALANCE_LAYOUT],
  ['Cash Flow', 'cashflow', CASHFLOW_LAYOUT],
];

/** Lines with at least one reported value, each with its values newest-first, scaled for display. */
function buildTable(company, key, layout) {
  const years = company[key]; // oldest year first, newest on the right
  const lines = [];
  for (const line of layout) {
    if (line.spacer) { lines.push({ spacer: true }); continue; }
    const raw = years.map((r) => layoutValue(line, r));
    if (raw.every((v) => v == null)) continue;
    const kind = line.kind || 'money';
    const values = raw.map((v) => (v == null ? null : kind === 'pershare' ? v : v / 1000));
    lines.push({ ...line, kind, values });
  }
  while (lines.length && lines[lines.length - 1].spacer) lines.pop();
  return { years, lines };
}

function triggerDownload(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ---------------- Excel ----------------
export async function downloadExcel(company) {
  await loadScript('/vendor/exceljs.min.js');
  const ExcelJS = window.ExcelJS;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Financial Rat';
  const { profile } = company;
  const cur = curOf(company);
  const GREEN = 'FF0E9F6E', DARK = 'FF0F1B2D', SECTION = 'FFEEF1F7';

  for (const [title, key, layout] of STATEMENTS) {
    const { years, lines } = buildTable(company, key, layout);
    const ws = wb.addWorksheet(title, { views: [{ state: 'frozen', xSplit: 1, ySplit: 5 }] });
    ws.columns = [{ width: 52 }, ...years.map(() => ({ width: 15 }))];
    ws.addRow([`${profile.name} (${profile.symbol}) — ${title}`]).font = { bold: true, size: 14, color: { argb: DARK } };
    ws.addRow([`All numbers in thousands of ${cur}, except per-share data. Fiscal years, oldest to newest.`]).font = { italic: true, color: { argb: 'FF66738A' } };
    ws.addRow([`Source: ${company.source} · Downloaded from Financial Rat on ${today()} · For education only; check the company's official filings.`]).font = { size: 9, color: { argb: 'FF66738A' } };
    const h1 = ws.addRow(['Breakdown', ...years.map((r) => `FY${r.fiscalYear}`)]);
    const h2 = ws.addRow(['', ...years.map((r) => usDate(r.date))]);
    for (const h of [h1, h2]) {
      h.eachCell((cell, col) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
        cell.font = { bold: h === h1, color: { argb: 'FFFFFFFF' }, size: h === h1 ? 11 : 9 };
        cell.alignment = { horizontal: col === 1 ? 'left' : 'right' };
      });
    }
    for (const line of lines) {
      if (line.spacer) { ws.addRow([]); continue; }
      const row = ws.addRow([line.label, ...line.values]);
      row.getCell(1).alignment = { indent: line.level * 2 };
      row.eachCell((cell, col) => {
        if (line.bold) cell.font = { bold: true };
        if (line.bold && line.level === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECTION } };
        if (col > 1) cell.numFmt = line.kind === 'pershare' ? '0.00;[Red]-0.00' : '#,##0;[Red](#,##0)';
      });
      row.getCell(1).border = line.bold && line.level === 0 ? { top: { style: 'thin', color: { argb: 'FFDDE3EE' } } } : undefined;
    }
  }

  // Ratios, oldest to newest.
  const ratios = yearlyRatios(company);
  const rs = wb.addWorksheet('Ratios', { views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }] });
  rs.columns = [{ width: 40 }, ...ratios.map(() => ({ width: 12 }))];
  rs.addRow([`${profile.name} (${profile.symbol}) — Financial ratios (calculated by Financial Rat)`]).font = { bold: true, size: 14 };
  rs.addRow(['Empty cell = not reported, or not meaningful that year (e.g. negative profit).']).font = { italic: true, color: { argb: 'FF66738A' } };
  const rh = rs.addRow(['Ratio', ...ratios.map((r) => `FY${r.fiscalYear}`)]);
  rh.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } }; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; });
  for (const r of RATIO_ROWS) {
    if (r.group) {
      const g = rs.addRow([r.group]);
      g.font = { bold: true };
      g.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECTION } };
      continue;
    }
    const row = rs.addRow([r.label, ...ratios.map((y) => (typeof y[r.key] === 'number' && Number.isFinite(y[r.key]) ? y[r.key] : null))]);
    row.getCell(1).alignment = { indent: 2 };
    row.eachCell((cell, col) => { if (col > 1) cell.numFmt = r.fmt === 'pct' ? '0.0%' : '0.00"x"'; });
  }

  const about = wb.addWorksheet('About');
  about.columns = [{ width: 18 }, { width: 100 }];
  [['Company', profile.name], ['Ticker', profile.symbol], ['Exchange', profile.exchange], ['Sector', profile.sector], ['Industry', profile.industry],
    ['Reporting currency', cur], ['Share price', company.quote?.price ?? ''], ['Data source', company.source], ['Downloaded', today()], [],
    ['Disclaimer', 'Financial Rat provides this data for education only. It is not investment advice. Data may contain errors; check official filings.']]
    .forEach((r) => { const row = about.addRow(r); row.getCell(1).font = { bold: true }; });

  const buf = await wb.xlsx.writeBuffer();
  triggerDownload(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileBase(company)}.xlsx`);
}

// ---------------- PDF ----------------
// The built-in PDF font has no typographic minus or em dash.
const pdfSafe = (t) => String(t).replace(/[−–]/g, '-').replace(/—/g, '-');

export async function downloadPdf(company) {
  await loadScript('/vendor/jspdf.umd.min.js');
  await loadScript('/vendor/jspdf.plugin.autotable.min.js');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const { profile } = company;
  const cur = curOf(company);
  const W = doc.internal.pageSize.getWidth();
  const fmt = (v, kind) => (v == null ? '-' : kind === 'pershare' ? v.toFixed(2)
    : `${v < 0 ? '(' : ''}${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}${v < 0 ? ')' : ''}`);

  const header = () => {
    doc.setFillColor(14, 159, 110);
    doc.rect(0, 0, W, 58, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(pdfSafe(`${profile.name} (${profile.symbol})`), 36, 28);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(pdfSafe(`All numbers in thousands of ${cur}, except per-share data · Oldest to newest year · Source: ${company.source} · ${today()}`), 36, 46);
    doc.setTextColor(245, 184, 61);
    doc.setFont('helvetica', 'bold');
    doc.text('Financial Rat - Finance For All, All For Finance', W - 36, 28, { align: 'right' });
  };

  STATEMENTS.forEach(([title, key, layout], i) => {
    if (i > 0) doc.addPage();
    header();
    const { years, lines } = buildTable(company, key, layout);
    doc.setTextColor(15, 27, 45);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(title, 36, 84);
    const body = lines.map((l) => (l.spacer ? [{ content: '', colSpan: years.length + 1, styles: { minCellHeight: 6, fillColor: [255, 255, 255] } }]
      : [pdfSafe(l.label), ...l.values.map((v) => fmt(v, l.kind))]));
    doc.autoTable({
      startY: 94,
      head: [['Breakdown', ...years.map((r) => `FY${r.fiscalYear}`)], ['', ...years.map((r) => usDate(r.date))]],
      body,
      styles: { fontSize: 8.5, cellPadding: { top: 3, bottom: 3, left: 4, right: 6 }, halign: 'right', lineWidth: 0 },
      columnStyles: { 0: { halign: 'left', cellWidth: 230 } },
      headStyles: { fillColor: [14, 159, 110], textColor: 255, halign: 'right' },
      margin: { left: 36, right: 36 },
      didParseCell: (d) => {
        if (d.section === 'head' && d.column.index === 0) d.cell.styles.halign = 'left';
        if (d.section === 'head' && d.row.index === 1) { d.cell.styles.fontSize = 7; d.cell.styles.fontStyle = 'normal'; }
        if (d.section !== 'body') return;
        const line = lines[d.row.index];
        if (!line || line.spacer) return;
        if (line.bold) d.cell.styles.fontStyle = 'bold';
        if (line.bold && line.level === 0) d.cell.styles.fillColor = [238, 241, 247];
        if (d.column.index === 0) d.cell.styles.cellPadding = { top: 3, bottom: 3, left: 4 + line.level * 14, right: 4 };
        if (d.column.index > 0 && typeof d.cell.raw === 'string' && d.cell.raw.startsWith('(')) d.cell.styles.textColor = [214, 69, 69];
      },
    });
  });

  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(102, 115, 138);
    doc.text('For education only - not investment advice. Data from third-party providers may contain errors; verify with official company filings. Negative numbers in (brackets).', 36, doc.internal.pageSize.getHeight() - 18);
    doc.text(`Page ${i} of ${pages}`, W - 36, doc.internal.pageSize.getHeight() - 18, { align: 'right' });
  }
  doc.save(`${fileBase(company)}.pdf`);
}
