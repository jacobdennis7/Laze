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
  `prefs.js` (home/office/favorites/placements), `routes.js` (live drive times),
  `flags.js` (per-browser feature switches).
- `api/` — Vercel functions: `auth/{login,callback,token,logout}.js`
  (authorization-code flow; refresh token AES-sealed in httpOnly cookie
  `laze_session`, server stores NOTHING), `booking.js` (Calendly availability
  proxy, allowlisted), `_lib/session.js`.
- Header wordmark: `src/components/Wordmark.jsx` — Jacob's own vector (Nov
  2026), path data copied verbatim, filled with `currentColor`.
  It is a link that resets the app to its opening state (`goHome` in
  App.jsx, which remounts MapView via `key`). On phones it stays 18px tall:
  wider and the date picker wraps to a third header row.
- **Brand blue is #0F2DF7 everywhere** (Jacob's call, Nov 2026; it was
  #2B3BE2). CSS uses `--brand`; it is repeated as a literal in
  `public/icon.svg`, `public/icon-maskable.svg`, `scripts/og/og.svg` and the
  static-landing `<h1>` in index.html — change all together, then rerun
  `bun scripts/og/generate.mjs` to rebuild `og.png` and `icon-180.png`.
  The logo on Google's sign-in screen is uploaded in GCP Branding and is
  NOT changed: editing it triggers a branding re-review.
- `public/` — `icon.svg` (route-L brand mark),
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
7. **Per-occurrence overrides** (`prefs.js` getOverride/setOverride, set from
   the event popup): `remote` = not there in person (becomes a call: off the
   map unless placed, time still blocked); `skip` = ignored (no pin, no
   conflicts, time counts as free). Applied on read by `withOverride` in the
   two `schedule.js` accessors (`eventsForDay`/`eventsForRange`) — every
   surface reads through those, so never read `getEvents()` directly or the
   views will disagree. Keyed by Google's per-occurrence event id, so one
   date of a recurring series is overridden alone. Laze stays read-only.
8. **Cross-city hops** (`FAR_KM` = 150 km straight-line, geo.js): `dayLegs`
   marks them `intercity` — never a walk/drive/transit figure (a live report
   showed "64,159 min walk" across the US), never sent to the paid Routes API,
   no travel-block button. Flagged as a "Different cities" conflict only when
   there isn't realistically time (`intercityMinutes`) and no flight on the
   calendar spans the gap. Separately, `routableStops` drops a call that is
   pinned only by the global default when the day's in-person meetings are
   in another city (a call follows the user); a placement chosen for that
   specific call is always kept.
9. **Flights have two ends.** A flight event's location is its *departure*
   airport; the arrival airport is resolved at sync from the title
   (`flightDestination` → `destGeo`: "Flight to Denver (UA 123)",
   "EWR → SFO"). Routing uses `arriveVenue` (where you must be for an event
   to start) and `departVenue` (where you are when it ends) — only flights
   differ. `airportStops(day)` pins whichever end is in the same city as the
   day's other stops (else home), never the far end. A leg into a flight
   carries `leaveBy` (start − `AIRPORT_LEAD_MIN` 90 − travel) and is judged
   against that, not the gap; the Airport-run conflict covers it, so no
   Tight-transfer card is raised for it. Known gaps: an ambiguous city name
   ("Flight to Portland", multi-airport cities) can resolve to the wrong
   airport, and on a day with no other stop in the trip city the airport is
   only pinned if home is there (needs the trip-base concept).

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
  SESSION_SECRET (Jacob holds secrets; never paste them in chat),
  VITE_TILES_URL + VITE_TILES_DETAIL_URL (CARTO `light_all` / `rastertiles/
  voyager` with `?key=` — CARTO required keys as of Sep 2026; Jacob got a free
  key, 5M tiles/mo. This pale-Positron look is the canonical map identity —
  Stadia styles were tried and rejected. Keyless OSM is the code fallback).
- **Maps billing & quotas** (set 20 Nov 2026): the GCP free trial ended that
  day and every Maps call returned a bare `403 PERMISSION_DENIED` ("The
  caller does not have permission") until Jacob upgraded to a paid account —
  if Spots/drive times/autocomplete all fail at once, check billing first.
  Spend caps don't exist for Maps, so the hard ceiling is per-day quotas
  (Google Maps Platform → Quotas): Places (New) SearchText 200, Autocomplete
  300, GetPlace 100, SearchNearby 10; Routes ComputeRoutes 300,
  ComputeRouteMatrix 10. A $50/month alerts-only budget ("Laze monthly")
  emails on spend. **Launch day: raise SearchText 2,000, Autocomplete 3,000,
  GetPlace 500, ComputeRoutes 3,000 and the budget to ~$300**, or new users
  hit the caps. When a cap is hit Laze degrades to estimates/OSM; the OSM
  Overpass fallback for Spots timed out on all three mirrors that day, so
  Spots shows "Search failed" instead. Jacob chose not to cut API cost (he
  would rather charge later). Known ToS gap: Google allows caching results
  ~30 days; the geocode and route caches in localStorage never expire.
- **Analytics**: Vercel Web Analytics (dashboard toggle) + PostHog
  (`src/lib/analytics.js` — env-gated on VITE_POSTHOG_KEY + laze.to hostname,
  lazy chunk, autocapture/session-recording off, explicit snake_case events,
  props are counts/enums only, never calendar content). Served through the
  first-party `/ingest` proxy (vercel.json rewrites) to survive ad-blockers.
  Users are identified by email (from the non-sensitive openid/email/profile
  scopes, sealed in the session cookie — never from calendar data), and
  `api/auth/callback.js` records a server-authoritative `user_signed_up`.
  All of this is disclosed in privacy.html — keep that in sync.
- Version in package.json; bump on each release; commit style: short scope
  line + wrapped body + `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.

## Verify-after-deploy habit

Push → poll for new `assets/index-*.js` hash on https://www.laze.to → test the
touched feature from the browser pane on laze.to (API calls can be made from
the page context with the bundle's key; referrer restrictions pass there).

## Backlog

- **Ghost mode is on for everyone** (v0.11.0, Nov 2026; it shipped switched
  off in v0.10.0 until Jacob had judged it on his own phone). `GHOST` in
  `src/lib/flags.js` is true unless that browser opened `?ghost=0` (escape
  hatch back to the SuggestModal pop-up; `?ghost=1` undoes it). Suggest is a
  mode: open time is drawn on the calendar and picks feed the reply
  (`useGhost.js`, `GhostLayer`, `SuggestTray`; the old pop-up is its "List
  view" link). "Create a meeting here" (search or a spot) opens the day's
  slot list with "See in calendar" → `MeetHereTray`: one time is chosen and
  published as a *tentative* event (`setTentative` in schedule.js), so the
  map/itinerary show it as a proposed stop in that day's route. Tentative
  events never count as busy time or raise conflicts. The Calendar toggle
  carries a searched place along. Open questions: should holds block
  suggestions (they count as free today); booking-link availability isn't
  in the mode yet (only in "List view"); travel-aware green and per-day
  detour ranking were planned, not built.
- The map stays mounted behind the calendar (`hidden` + `visible` prop) so a
  searched place, spots and zoom survive view switches — for everyone, not
  just ghost mode. A hidden Leaflet map needs `invalidateSize` and a deferred
  fit when it is shown again (MapView handles both).
- iOS via Capacitor wrapper (auth foundation done — server code flow); needs
  Apple Developer account ($99/yr).
- cal.com support in api/booking.js (Calendly only today).
- Cross-device settings sync (decided Nov 2026, not yet): everything in
  prefs/settings is per-browser today (home, office, favorites, working
  hours, buffer, placements, overrides). Jacob wants the **database route**
  eventually, to make Laze "a more legit app" — not the Drive app-data
  folder. When built: the "nothing is stored on a server" copy in
  privacy.html, the onboarding card, the Connections modal and the
  static-landing block all change, and a delete-my-data path is needed.
- Trip base ("where I'm staying these dates"): no concept for live users;
  Jacob appears to set Home to his hotel as a workaround. Would also allow
  flagging home-city recurring meetings automatically during a trip.
- Outlook support (post-launch, Jacob's explicit sequencing): Microsoft Graph
  Calendars.Read via parallel api/auth/ms/* endpoints — same sealed-cookie
  design, provider tag in the session; normalize Graph event shape (tz,
  attendees, Teams links as virtual). Jacob registers the Azure app. Caveat:
  locked-down M365 tenants need admin consent.
- "Use secure flows" GCP checkup warning: resolved in practice by server flow;
  frontend GIS fallback still exists for dev.
