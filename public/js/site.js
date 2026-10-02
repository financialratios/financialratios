// Shared header, footer, motto and ads for every page.
import { SITE } from './config.js';

function logoImg(size = 42) {
  return `<img src="/img/logo.svg" width="${size}" height="${size}" alt="" style="border-radius:12px">`;
}

export function mottoHtml(extraClass = '') {
  return `<span class="motto ${extraClass}" tabindex="0" role="button" aria-label="Finance For All, All For Finance (tap to swap colours)">
    <span class="m1">Finance For All</span><span class="m2">All For Finance</span></span>`;
}

const NAV = [
  ['/learn/', 'Learn', 'learn'],
  ['/calculators/', 'Calculators', 'calculators'],
  ['/analyze/', 'Analyze a company', 'analyze'],
];

function header() {
  const section = location.pathname.split('/')[1];
  const links = NAV.map(([href, text, key]) => `<a href="${href}"${section === key ? ' aria-current="page"' : ''}>${text}</a>`).join('');
  return `<a class="skip" href="#main">Skip to content</a>
  <header class="site-header"><div class="container bar">
    <a class="logo" href="/" aria-label="Financial Rat home">${logoImg()}<span>Financial <span class="rat">Rat</span></span></a>
    <button class="menu-btn" aria-expanded="false" aria-controls="nav">☰ Menu</button>
    <nav class="nav" id="nav" aria-label="Main">${links}</nav>
  </div></header>`;
}

function footer() {
  return `<footer class="site-footer"><div class="container">
    <div class="cols">
      <div>
        <a class="logo" href="/">${logoImg(36)}<span>Financial <span class="rat">Rat</span></span></a>
        <div>${mottoHtml()}</div>
        <p class="muted small" style="margin-top:12px">Learn, calculate and analyze companies in one simple place.</p>
      </div>
      <div><h4>Learn</h4><ul>
        <li><a href="/learn/income-statement.html">Income statement</a></li>
        <li><a href="/learn/balance-sheet.html">Balance sheet</a></li>
        <li><a href="/learn/cash-flow.html">Cash flow statement</a></li>
        <li><a href="/learn/ratios.html">Financial ratios</a></li>
        <li><a href="/learn/valuation.html">Valuation: DCF, P/E, EV/EBITDA</a></li>
        <li><a href="/learn/case-studies.html">3 real company case studies</a></li>
      </ul></div>
      <div><h4>Calculators</h4><ul>
        <li><a href="/calculators/compound-interest.html">Compound interest</a></li>
        <li><a href="/calculators/mortgage.html">Mortgage</a></li>
        <li><a href="/calculators/investment-return.html">Investment return</a></li>
        <li><a href="/calculators/savings-goal.html">Savings goal</a></li>
        <li><a href="/calculators/">All calculators</a></li>
      </ul></div>
      <div><h4>Financial Rat</h4><ul>
        <li><a href="/analyze/">Analyze a company</a></li>
        <li><a href="/about.html">About</a></li>
        <li><a href="/privacy.html">Privacy policy</a></li>
        <li><a href="/terms.html">Terms &amp; disclaimer</a></li>
        <li><a href="mailto:${SITE.contactEmail}">Contact</a></li>
      </ul></div>
    </div>
    <p class="disclaimer">Financial Rat is for education only. Nothing on this website is investment advice or a recommendation to buy or sell anything.
    Company data comes from third-party providers and may contain errors or delays. Always check original company filings before making decisions.
    © ${new Date().getFullYear()} Financial Rat.</p>
  </div></footer>`;
}

function wireMotto(root = document) {
  root.querySelectorAll('.motto').forEach((el) => {
    if (el.dataset.wired) return;
    el.dataset.wired = '1';
    const toggle = () => el.classList.toggle('swapped');
    el.addEventListener('click', toggle);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });
}

function setupAds() {
  const slots = document.querySelectorAll('.ad-slot');
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!SITE.adsenseClient) {
    // No AdSense yet: show where ads will go when previewing locally, nothing on the live site.
    slots.forEach((s) => { if (isLocal) { s.classList.add('placeholder'); s.textContent = 'Ad space'; } });
    return;
  }
  if (!document.querySelector('script[src*="adsbygoogle.js"]')) {
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${SITE.adsenseClient}`;
    document.head.appendChild(s);
  }
  slots.forEach((slot) => {
    const id = SITE.adSlots[slot.dataset.slot || 'middle'];
    if (!id) return; // Auto ads will place ads by themselves.
    slot.innerHTML = `<ins class="adsbygoogle" style="display:block;width:100%" data-ad-client="${SITE.adsenseClient}" data-ad-slot="${id}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  });
}

function init() {
  const h = document.getElementById('site-header');
  const f = document.getElementById('site-footer');
  if (h) h.outerHTML = header();
  if (f) f.outerHTML = footer();
  const btn = document.querySelector('.menu-btn');
  const nav = document.getElementById('nav');
  btn?.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });
  document.querySelectorAll('[data-motto]').forEach((el) => { el.outerHTML = mottoHtml(el.dataset.motto); });
  wireMotto();
  setupAds();
}

init();
export { wireMotto };
