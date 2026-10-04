// ===== The only file you need to edit to change site-wide settings. =====
export const SITE = {
  name: 'Financial Rat',
  url: 'https://financialrat.com', // your real domain once you buy it
  contactEmail: 'hello@financialrat.com', // shown on the Contact / Privacy pages

  // Google AdSense. Easiest: run `npm run set-adsense -- ca-pub-1234567890123456`
  // which fills this in AND adds the verification code to every page.
  adsenseClient: 'ca-pub-5021141099891568', // e.g. 'ca-pub-1234567890123456'
  // Optional: ad units you create in AdSense (Ads > By ad unit). Leave empty to use Auto ads only.
  // Either just the data-ad-slot number ('1234567890'), or for in-feed / fluid units copy
  // data-ad-slot, data-ad-format and data-ad-layout-key from the AdSense code: { id, format, layoutKey }.
  adSlots: {
    top: { id: '6411072002', format: 'fluid', layoutKey: '-fb+5w+4e-db+86' },
    middle: { id: '6411072002', format: 'fluid', layoutKey: '-fb+5w+4e-db+86' },
    bottom: { id: '7084101835', format: 'autorelaxed' }, // Multiplex unit
  },
};
