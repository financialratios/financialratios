# 🐀 Financial Rat

**Finance For All, All For Finance.**

Financial Rat puts learning, calculating and analyzing companies in one simple website, explained in plain language.

| Section | What it does |
|---|---|
| 📘 **Learn** (`/learn/`) | Income statement, balance sheet and cash flow line by line (with an arrow next to each number), then ratios, valuation (P/E, EV/EBITDA, DCF) and 3 real case studies (Caterpillar, P&G, Microsoft) |
| 🧮 **Calculators** (`/calculators/`) | Compound interest, mortgage, loan, investment return, savings goal, inflation, dividends, rule of 72, stock value, loss recovery. Each one shows its formula and sources |
| 🔍 **Analyze** (`/analyze/`) | Type a ticker to see the business, revenue sources (donut chart), 10 years of statements, ratios, valuation history, an adjustable DCF (default growth = the company's 10-year history), price since IPO, and an Excel/PDF download |

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
* **Free fallback (no key):** statements from the US SEC (EDGAR) and prices from Yahoo Finance. US companies only, with no business description or revenue segments. Set `SEC_USER_AGENT` to `"Your Name your@email.com"`, as the SEC requires.
* `DEMO` always shows a fictional sample company.

All content is for education only and is not investment advice.
