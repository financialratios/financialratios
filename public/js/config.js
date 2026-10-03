// ===== The only file you need to edit to change site-wide settings. =====
export const SITE = {
  name: 'Financial Rat',
  url: 'https://financialrat.com', // your real domain once you buy it
  contactEmail: 'hello@financialrat.com', // shown on the Contact / Privacy pages

  // Paid downloads through Gumroad. For each product, paste its link (e.g. 'https://yourname.gumroad.com/l/abcde')
  // and its product ID (Gumroad → the product → Content → License key → "Use your product ID…").
  // While these are empty, downloads stay free and unlimited (no counter, no paywall).
  gumroad: {
    pack5: { url: '', productId: '' }, // one-time €0.99 → 5 downloads
    monthly: { url: '', productId: '' }, // membership €4.99 / month → unlimited
    yearly: { url: '', productId: '' }, // membership €49.99 / year → unlimited
  },

  // Google AdSense. Easiest: run `npm run set-adsense -- ca-pub-1234567890123456`
  // which fills this in AND adds the verification code to every page.
  adsenseClient: '', // e.g. 'ca-pub-1234567890123456'
  // Optional: ad unit IDs you create in AdSense (Ads > By ad unit). Leave empty to use Auto ads only.
  adSlots: {
    top: '',
    middle: '',
    bottom: '',
  },
};
