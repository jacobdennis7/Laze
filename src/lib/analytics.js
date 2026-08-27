// Product analytics via PostHog. Fully env-gated: without VITE_POSTHOG_KEY
// (or off the real domain) nothing loads and track() is a no-op, so dev,
// previews, and self-hosters ship zero telemetry. posthog-js is imported
// lazily — it stays out of the main bundle entirely.
//
// Privacy rules, enforced here by construction:
// - explicit events only (autocapture off) — no DOM or content scraping
// - no session recording
// - props are counts / booleans / enums only; never titles, addresses,
//   emails, or anything from the user's calendar.

const KEY = import.meta.env.VITE_POSTHOG_KEY;
// First-party proxy (vercel.json rewrites /ingest → PostHog) so ad-blockers
// that block *.posthog.com don't silently drop 20-40% of users.
const HOST =
  import.meta.env.VITE_POSTHOG_HOST ||
  (typeof window !== 'undefined' ? `${window.location.origin}/ingest` : '');

const enabled =
  !!KEY && typeof window !== 'undefined' && /(^|\.)laze\.to$/.test(window.location.hostname);

let client = null; // resolved posthog instance, once loaded
let loading = null;

function load() {
  if (!loading) {
    loading = import('posthog-js')
      .then(({ default: posthog }) => {
        posthog.init(KEY, {
          api_host: HOST,
          ui_host: 'https://us.posthog.com',
          autocapture: false,
          capture_pageview: true,
          disable_session_recording: true,
          persistence: 'localStorage',
        });
        client = posthog;
        return posthog;
      })
      .catch(() => null); // ad-blocked or offline — analytics just stays off
  }
  return loading;
}

export function initAnalytics() {
  if (enabled) load();
}

export function track(name, props) {
  if (!enabled) {
    if (import.meta.env.DEV) console.debug('[analytics]', name, props || {});
    return;
  }
  if (client) client.capture(name, props);
  else load().then((p) => p && p.capture(name, props));
}

// Ties this browser's event stream to the signed-in user (email as the
// distinct id) so sign-ups are people, not anonymous ids. The identity comes
// from Google's basic openid/email/profile scopes — never from calendar data —
// and this is disclosed in the privacy policy.
export function identify(email, props) {
  if (!email) return;
  if (!enabled) {
    if (import.meta.env.DEV) console.debug('[analytics] identify', email, props || {});
    return;
  }
  load().then((p) => p && p.identify(email, { email, ...props }));
}
