# 🐀 Financial Rat

**Finance For All, All For Finance.**

Financial Rat puts learning, calculating and analyzing companies in one simple website, explained in plain language.

| Section | What it does |
|---|---|
| 📘 **Learn** (`/learn/`) | Branches of finance, primary & secondary markets, stocks, bonds, gold & silver, funds & interest rates; the 3 statements line by line (arrow next to each number); ratios; multiples; a full DCF (CAPM, cost of debt, WACC, terminal value) with arrows around each formula; 7 industry case studies and the economic cycle |
| 🧮 **Calculators** (`/calculators/`) | Compound interest, mortgage, loan, investment return, savings goal, inflation, dividends, rule of 72, stock value, loss recovery. Each one shows its formula and sources |
| 🔍 **Analyze** (`/analyze/`) | Search US and foreign companies (with popular suggestions); business model, famous products with pictures, what sets the company apart, revenue sources (donut + comparison chart); 10 years of statements, ratios, valuation history, a comparison with competitors (P/E, EV/EBITDA, P/S, P/B, margins, ROE, debt), an adjustable DCF (default growth = 10-year history), daily candles since IPO, and an Excel/PDF download |

## Run it on your computer

You need [Node.js](https://nodejs.org) 18 or newer. Nothing else to install.

```bash
npm start        # then open http://localhost:3000  (try the ticker DEMO)
npm test         # checks all the formulas and data parsers
```

## Where things are

```
public/              the website (HTML, CSS, JS)
  js/config.js       ← site settings: AdSense ID, contact email, domain
  js/lib/finance.js  every formula on the site
  learn/ calculators/ analyze/
server/              the data API (company data, prices, search)
netlify/ api/        small adapters so the API runs on Netlify or Vercel
scripts/set-adsense.mjs   connects Google AdSense in one command
docs/LAUNCH-PLAN.md  ← step-by-step plan to go live
```

## Company data

* **Recommended:** a [Financial Modeling Prep](https://site.financialmodelingprep.com/) API key in the `FMP_API_KEY` environment variable. It provides descriptions, revenue segments (donut chart), 10 years of statements and full price history (which of these you get depends on your FMP plan).
* **Free mode (no key, the default):** US companies get up to 10 years of statements from the SEC (EDGAR); companies elsewhere get about 4 years from Yahoo Finance, which also supplies prices, candles, descriptions and search. Revenue breakdowns for ~25 popular companies are hand-collected in `public/js/profiles.js`; product pictures and short descriptions come from Wikipedia. Set `SEC_USER_AGENT` to `"Your Name your@email.com"`, as the SEC requires.
* `DEMO` always shows a fictional sample company.

## Downloads
The Excel and PDF downloads are free and unlimited. Lines or years the data source does not provide are marked with `*`, and a note under each
table explains why. The site earns money through Google AdSense (see `docs/LAUNCH-PLAN.md` → step 6).

## Reviews
`/reviews.html` lets visitors post a name, star rating and text. They are stored in Netlify Blobs on Netlify (`.data/reviews.json` when running locally). See `docs/LAUNCH-PLAN.md` → "Managing reviews" to delete one.

All content is for education only and is not investment advice.
