// ===== The only file you need to edit to change site-wide settings. =====
export const SITE = {
  name: 'Financial Rat',
  url: 'https://financialrat.com', // your real domain once you buy it
  contactEmail: 'hello@financialrat.com', // shown on the Contact / Privacy pages

  // Google AdSense. Easiest: run `npm run set-adsense -- ca-pub-1234567890123456`
  // which fills this in AND adds the verification code to every page.
  adsenseClient: 'ca-pub-5021141099891568', // e.g. 'ca-pub-1234567890123456'
  // Optional: ad unit IDs you create in AdSense (Ads > By ad unit). Leave empty to use Auto ads only.
  adSlots: {
    top: '',
    middle: '',
    bottom: '',
  },
};
