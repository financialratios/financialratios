# Financial Rat: step-by-step launch plan

Claude built the website and tested it with the fictional company **DEMO**. A few steps need **you**: they involve accounts, money, legal identity or a domain. Follow them in order. Each step says roughly how long it takes.

---

## Step 1: Preview the site on your computer (10 min)
1. Install **Node.js** (LTS version) from https://nodejs.org.
2. Download this repository (GitHub → green **Code** button → *Download ZIP*) and unzip it.
3. Open a terminal in the folder and run `npm start`.
4. Open http://localhost:3000. Try the lessons and calculators, and type **DEMO** in *Analyze*.
   Real tickers such as AAPL will also work on your computer, because the free data sources are reachable from your own internet connection.

## Step 2: Get a data provider key (15 min; free to start, ~$20–30/month later)
Why: the free sources (SEC + Yahoo) only cover US companies, have no business description and no revenue breakdown, so the **donut chart stays empty**. Yahoo can also block servers without warning.
1. Create an account at https://site.financialmodelingprep.com/ and copy your **API key**.
2. The free plan is enough to test. To get **10 years** of statements, **revenue segments** (donut chart) and **full price history since IPO**, you will need a paid plan. Check their pricing page for which plan includes "revenue segmentation" and history length.
3. Keep the key secret. Never put it in the code; you will paste it into the hosting settings in step 4.

## Step 3: Buy the domain (10 min, ~$10–15/year)
1. Check that `financialrat.com` (or `.net`, `.io`, `.ro`) is free at a registrar such as Namecheap, Cloudflare or Porkbun.
2. Buy it. Then change `url:` in `public/js/config.js`, plus the domain in `public/robots.txt` and `public/sitemap.xml`, to your real one.

## Step 4: Put the site online with Netlify (20 min, free)
Netlify's free plan allows commercial sites (Vercel's free plan does not, so use Vercel only on its paid plan).
1. Create an account at https://www.netlify.com using **Sign up with GitHub**.
2. **Add new site → Import an existing project → GitHub →** choose `financialratios/financialratios`.
3. Leave the build settings as they are (they are read from `netlify.toml`).
4. **Site configuration → Environment variables**, add:
   * `FMP_API_KEY` = your key from step 2
   * `SEC_USER_AGENT` = `Financial Rat your@email.com`
5. Deploy, then open the `*.netlify.app` address and test AAPL, KO, CAT and MSFT.
6. **Domain management → Add a domain** → follow the instructions to connect your domain from step 3. HTTPS is set up automatically.

## Step 5: Make the legal pages yours (30 min)
1. In `public/privacy.html`, replace `[your name or company, address]` with your details.
2. Set `contactEmail` in `public/js/config.js`.
3. Before you earn real money, have the privacy policy and terms reviewed by a lawyer or a GDPR template service. You are in the EU, so GDPR applies.
4. Consider registering a business (in Romania: PFA or SRL) for the advertising and affiliate income. Ask an accountant.

## Step 6: Apply for Google AdSense (1 hour of work, then days to weeks of waiting)
AdSense approves sites that have original, useful content. The lessons and calculators are there for exactly this reason.
1. Wait until the site is live on your own domain and has been online for a little while.
2. Apply at https://adsense.google.com with your domain.
3. Google gives you a publisher ID such as `ca-pub-1234567890123456`. In the project folder run:
   ```bash
   npm run set-adsense -- ca-pub-1234567890123456
   ```
   This adds the verification code to every page, fills in `ads.txt` and turns on the ad spaces. Commit and push (Netlify redeploys automatically), then click **Verify** in AdSense.
4. **Required in the EU:** in AdSense open **Privacy & messaging → European regulations** and publish Google's consent message (cookie banner). No code is needed.
5. After approval, either turn on **Auto ads**, or create 3 display ad units and paste their slot IDs into `adSlots` in `public/js/config.js` (`top`, `middle`, `bottom`).

## Step 6b: Switch on paid downloads (Stripe + Resend, about 1 hour)
Everyone gets 3 free downloads. After that the site offers 5 downloads for €0.99, Premium monthly (€4.99) or Premium yearly (€49.99).
Until the steps below are done, the payment buttons politely say "Payments are not switched on yet".
1. **Business first.** Stripe pays out to a business or a sole trader. In Romania that means a PFA or an SRL. Ask an accountant about VAT (EU OSS) for digital sales.
2. **Stripe account** at https://dashboard.stripe.com. Complete the activation (identity, bank account).
3. **Products → Add product**, create three prices in EUR:
   * "5 downloads", **one-off** price €0.99
   * "Premium monthly", **recurring monthly** €4.99
   * "Premium yearly", **recurring yearly** €49.99
   Copy each price ID (it starts with `price_`).
4. **Developers → Webhooks → Add endpoint**: URL `https://YOUR-DOMAIN/api/stripe-webhook`, events `checkout.session.completed`,
   `customer.subscription.updated` and `customer.subscription.deleted`. Copy the **signing secret** (`whsec_…`).
5. **Settings → Billing → Customer portal**: turn it on, so subscribers can cancel themselves from their receipt email.
6. **Resend** (thank-you emails) at https://resend.com: add your domain, add the DNS records it shows you at your registrar, wait until it says *Verified*,
   then create an API key.
7. On Netlify, **Environment variables**, add:
   * `STRIPE_SECRET_KEY` = `sk_live_…` (use `sk_test_…` first to try it with the test card 4242 4242 4242 4242)
   * `STRIPE_WEBHOOK_SECRET` = `whsec_…`
   * `STRIPE_PRICE_PACK5`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY` = the three `price_…` IDs
   * `RESEND_API_KEY` = `re_…`
   * `EMAIL_FROM` = `Financial Rat <hello@YOUR-DOMAIN>` (and optionally `EMAIL_REPLY_TO` = your own inbox, so replies to the thank-you email reach you)
   * `SITE_URL` = `https://YOUR-DOMAIN`
   Then **Deploys → Trigger deploy**.
8. Test: in test mode, buy each option once. You should land on `/premium.html` with your access code and receive the "Dear …" thank-you email.

## Step 7: Help people find the site (ongoing)
1. Add the site to **Google Search Console** (https://search.google.com/search-console) and submit `https://yourdomain/sitemap.xml`.
2. Share the lessons and calculators on Reddit (r/investing, r/personalfinance, r/eupersonalfinance), in Romanian finance groups, and on TikTok or Instagram with short "explained simply" videos.

## Step 8: Later monetization
* **Affiliates:** brokers (eToro, Interactive Brokers, XTB, Trading 212) and books. Mark affiliate links clearly. The privacy policy already mentions them.
* **Premium extras:** Premium already gives unlimited downloads (step 6b). Company comparisons, a watchlist or alerts could be added to it later.
* **Section 4:** a portfolio tracker, a company comparison tool or a community. The home page already teases it.

---

### What Claude could not do (and why)
| Item | Reason | Your step |
|---|---|---|
| Test live company data | The build environment blocks financial data websites, so live data was tested with sample responses in the providers' documented formats | Step 1 (local) or Step 4 (online): try several tickers and report anything odd |
| Data provider account and key | Needs your identity and payment | Step 2 |
| Domain, hosting account | Needs your identity and payment | Steps 3–4 |
| Stripe and Resend accounts | Need your identity, business and bank account | Step 6b |
| AdSense approval | Only Google approves, and only for the site owner | Step 6 |
| Legal review and business registration | Needs a professional and your details | Step 5 |

---

## Managing reviews
Visitors' reviews are saved for free in **Netlify Blobs** (built into Netlify; nothing to set up).
To be able to delete a review (spam, insults):
1. On Netlify: **Project configuration → Environment variables → Add a variable**: key `REVIEWS_ADMIN_TOKEN`, value = a secret word only you know. Then **Deploys → Trigger deploy**.
2. Each review has an id. To find it, open `https://your-site/api/reviews` and look for `"id"` next to the review.
3. Open `https://your-site/api/reviews?delete=THE_ID&token=YOUR_SECRET_WORD`. The review disappears.

Built-in protection: links are not allowed, a hidden trap field catches spam robots, and each visitor can post at most 3 reviews per 10 minutes.
