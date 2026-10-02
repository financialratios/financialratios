// Number formatting in plain words: 1.2 billion, 12.5%, 3.4x.
import { isNum } from './finance.js';

export const DASH = '—';

export function compact(v, currency) {
  if (!isNum(v)) return DASH;
  const sign = v < 0 ? '−' : '';
  const a = Math.abs(v);
  const sym = currencySymbol(currency);
  const [n, unit] = a >= 1e12 ? [a / 1e12, 'T'] : a >= 1e9 ? [a / 1e9, 'B'] : a >= 1e6 ? [a / 1e6, 'M'] : a >= 1e3 ? [a / 1e3, 'K'] : [a, ''];
  return `${sign}${sym}${n.toFixed(n >= 100 || !unit ? (unit ? 0 : 2) : 1)}${unit}`;
}

export function words(v, currency) {
  if (!isNum(v)) return DASH;
  const sym = currencySymbol(currency);
  const a = Math.abs(v), sign = v < 0 ? 'minus ' : '';
  if (a >= 1e12) return `${sign}${sym}${(a / 1e12).toFixed(2)} trillion`;
  if (a >= 1e9) return `${sign}${sym}${(a / 1e9).toFixed(2)} billion`;
  if (a >= 1e6) return `${sign}${sym}${(a / 1e6).toFixed(1)} million`;
  return `${sign}${money(a, currency)}`;
}

export function money(v, currency = 'USD', digits = 2) {
  if (!isNum(v)) return DASH;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
  } catch {
    return `${v.toFixed(digits)} ${currency}`;
  }
}

export function currencySymbol(currency) {
  if (!currency) return '';
  try {
    const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value || '';
  } catch {
    return '';
  }
}

export const pct = (v, d = 1) => (isNum(v) ? `${(v * 100).toFixed(d)}%` : DASH);
export const signedPct = (v, d = 1) => (isNum(v) ? `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)}%` : DASH);
export const times = (v, d = 1) => (isNum(v) ? `${v.toFixed(d)}x` : DASH);
export const plain = (v, d = 2) => (isNum(v) ? v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }) : DASH);
export const int = (v) => (isNum(v) ? Math.round(v).toLocaleString('en-US') : DASH);

/** Statement cells: millions with thousands separators, negatives in brackets like annual reports. */
export function millions(v) {
  if (!isNum(v)) return DASH;
  const m = Math.abs(v) / 1e6;
  const s = m.toLocaleString('en-US', { maximumFractionDigits: m < 10 ? 1 : 0, minimumFractionDigits: m < 10 ? 1 : 0 });
  return v < 0 ? `(${s})` : s;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
