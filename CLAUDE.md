# Laze — project brief for Claude

Laze (https://laze.to) is Jacob Dennis's scheduling assistant: it reads the
user's Google Calendar (read-only) and puts their week on a map — travel times
between meetings, conflict warnings, nearby-spots discovery, and "when & where
works" suggestions. Client-side SPA + thin Vercel serverless backend. Verified
Google OAuth app (branding + calendar.readonly scope both approved).

## Stack & structure

- **Vite + React 18 + Leaflet** (CARTO tiles), plain JS (no TS). Bun only —
  this Mac has no node/npm; use `/Users/jacobdennis/.bun/bin/bun`.
- `src/lib/` — `schedule.js` (events→stops/legs/conflicts/free-windows),
  `google.js` (GIS auth + calendar sync + geocoding), `geo.js` (travel
  estimates, gmaps links, nearby spots), `suggest.js` (slot ranking, booking
  links), `places.js` (autocomplete), `store.js` (event store + settings),
  `prefs.js` (home/office/favorites/placements), `routes.js` (live drive times).
- `api/` — Vercel functions: `auth/{login,callback,token,logout}.js`
  (authorization-code flow; refresh token AES-sealed in httpOnly cookie
  `laze_session`, server stores NOTHING), `booking.js` (Calendly availability
  proxy, allowlisted), `_lib/session.js`.
- `public/` — `icon.svg` (route-L brand mark, royal blue #2B3BE2),
  `privacy.html` (required by Google verification — keep truthful).
- Personal calendar snapshot: `src/data/events.local.js` — **gitignored AND
  stripped from non-demo builds by the `local-data-guard` vite plugin**.

## Critical practices

1. **Privacy scan before every push**: after `bun run build`, grep `dist/assets/`
   for personal data (names, addresses, emails). The repo is public.
2. **Env credentials always win** over device-stored keys (`loadSettings` in
   store.js) — a stale stored key once 403'd everything after a GCP project
   rotation. Don't reintroduce stored-key precedence.
3. **Dev vs prod auth**: deployed builds use the server flow (`serverAuthEnabled
   = !DEV`); vite dev falls back to the GIS popup. The embedded Claude browser
   pane blocks OAuth popups — full sign-in can only be tested in a real browser.
4. Google verification: new scopes or consent-screen/Branding changes trigger
   re-verification; ordinary deploys never do. Homepage content must stay in
   **static HTML** (`index.html` static-landing block — React removes on mount);
   Google's checker does not execute JS.
5. Nearby spots use Places **searchText with viewport rectangle** restriction
   (searchNearby's circle bled past screen edges) + client-side bounds filter.
6. Solo calendar events (no other human attendees) are time blocks: never mark
   tbd / raise location conflicts for them.

## Infra

- **Hosting**: Vercel (project "laze", Jacob's account, auto-deploys on push to
  `main`), domain laze.to + www via Namecheap DNS (A 216.198.79.1 apex,
  CNAME www→2b4ca0749421e2ef.vercel-dns-017.com). Apex 308s to www.
- **GitHub**: github.com/jacobdennis7/Laze (public). gh CLI at
  `~/.local/bin/gh`, authed. (GitHub Pages mirror retired Sep 2026 — Vercel
  is the only deploy target; sign-in needs /api functions Pages can't run.)
- **GCP**: project `laze-506216` under jacobadennis@gmail.com (old magid-org
  project deleted). OAuth client 920063632561-…; Maps key restricted to
  Places API (New) + Routes API, referrers laze.to/www/localhost:5174.
- **Vercel env**: VITE_GOOGLE_CLIENT_ID, VITE_MAPS_KEY, GOOGLE_CLIENT_SECRET,
  SESSION_SECRET (Jacob holds secrets; never paste them in chat).
- Version in package.json; bump on each release; commit style: short scope
  line + wrapped body + `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.

## Verify-after-deploy habit

Push → poll for new `assets/index-*.js` hash on https://www.laze.to → test the
touched feature from the browser pane on laze.to (API calls can be made from
the page context with the bundle's key; referrer restrictions pass there).

## Backlog

- PostHog analytics (needs Jacob's account + VITE_POSTHOG_KEY; wire connect/
  sync/suggest/spot events). Vercel Web Analytics loader already conditional
  in index.html — needs dashboard toggle.
- iOS via Capacitor wrapper (auth foundation done — server code flow); needs
  Apple Developer account ($99/yr).
- cal.com support in api/booking.js (Calendly only today).
- "Use secure flows" GCP checkup warning: resolved in practice by server flow;
  frontend GIS fallback still exists for dev.
