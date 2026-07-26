# Laze

Geography-aware scheduling: map your meetings, see travel time between them, catch
conflicts, and answer "when can we meet?" with slots ranked by where you'll already be.

```bash
bun install
bun run dev   # http://localhost:5174
```

## Data sources

Laze starts on a bundled snapshot (`src/data/events.js`). Two ways to go live:

### 1. Google Calendar (live sync)

One-time setup, ~5 minutes:

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create a project (e.g. "laze").
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **OAuth consent screen** → External → fill the two required fields → add your own
   email as a **test user** (no verification needed for personal use).
4. **Credentials → Create credentials → OAuth client ID** → *Web application* →
   Authorized JavaScript origins: `http://localhost:5174`.
5. Copy the Client ID into Laze → click the source chip (top-left) → paste → **Connect Google** → pick calendars → **Sync**.

Scope is read-only (`calendar.readonly`); the token lives only in your browser tab.
The **Sync** button in the top bar re-pulls anytime.

### 2. Google Routes API (live drive times, optional)

1. Same project → enable **Routes API**.
2. **Credentials → Create credentials → API key**. Restrict it to the Routes API
   (and to `http://localhost:5174/*` as an HTTP referrer).
3. Paste it in the same settings panel.

With a key set, leg times switch from calibrated estimates (`~12 min`) to live
traffic-aware figures (`12 min · live`), cached locally. Without it, estimates are used.

### Fallback: snapshot refresh via Claude

Ask Claude to "sync laze data" — it re-pulls both calendars over MCP and rewrites
`src/data/events.js`. Useful when you don't want to set up GCP credentials.

## Deploying (hosted, phone-ready, multi-user)

The app is a static Vite build — any static host works. A GitHub Actions workflow for
GitHub Pages is included (`.github/workflows/deploy.yml`); Vercel/Netlify need zero config
(build command `bun run build`, output `dist`).

1. Push this repo to GitHub (it is safe to make public: personal calendar data in
   `src/data/events.local.js` is gitignored AND stripped from production builds by the
   `local-data-guard` vite plugin — verify with a grep of `dist/` if paranoid).
2. Set build-time env vars on the host: `VITE_GOOGLE_CLIENT_ID` and `VITE_MAPS_KEY`
   (for Pages: repo → Settings → Secrets and variables → Actions → **Variables**).
3. In Google Cloud console, add the production URL to:
   - the OAuth client's **Authorized JavaScript origins** (e.g. `https://you.github.io`), and
   - the Maps key's **HTTP referrer** restriction (e.g. `https://you.github.io/*`).
4. **Testers:** while the OAuth consent screen is in *Testing* mode, add each tester's
   Google email under **Audience → Test users** (up to 100). They then just open the URL
   and click "Connect Google Calendar" — no setup on their side. Going past 100 users or
   removing the "unverified app" interstitial requires Google's app verification.

**Phone:** the deployed URL works in mobile browsers (bottom-sheet itinerary, day chips,
full-bleed map) and installs to the home screen as a PWA (Share → Add to Home Screen).

## Views

- **Map** — day-by-day route with neighborhood-colored pins, travel legs, gaps, and
  Google Maps deep links (full-route + per-leg).
- **Calendar** — gcal-style week grid; click any event for details + "Open in Google Calendar".
- **Conflicts** — double-bookings, tight transfers, airport-window squeezes, phantom
  home-city events, missing venues.
- **Suggest** — paste an inbound email/text; get free windows ranked by detour cost
  from your surrounding meetings, a venue suggestion, and a copyable draft reply.
