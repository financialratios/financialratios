// Sends an event to Google Analytics (GA4) when the gtag script on the page has loaded; does nothing otherwise.
// Events show up in Analytics under Reports → Engagement → Events.
export function track(name, params = {}) {
  try { if (typeof window.gtag === 'function') window.gtag('event', name, params); } catch { /* analytics must never break the page */ }
}
