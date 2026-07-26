// Data loader. Generic dictionaries are committed (venues.js); personal calendar
// data lives in events.local.js, which is GITIGNORED and only loaded in dev or
// when VITE_DEMO=1 — a public/production build ships with zero personal data and
// users connect their own Google Calendar instead.
import { VENUES as BASE_VENUES, CAFES as BASE_CAFES, HOOD_COLORS as HOODS } from './venues.js';

// The glob is resolved at build time; the vite plugin `local-data-guard` stubs the
// module out of non-demo production builds (a runtime check alone would still bundle it).
const mods = import.meta.glob('./events.local.js', { eager: true });
const maybeLocal = mods['./events.local.js'] || null;
const local = maybeLocal && maybeLocal.EVENTS && maybeLocal.EVENTS.length ? maybeLocal : null;

export const VENUES = { ...BASE_VENUES, ...(local?.VENUES_EXTRA || {}) };
export const CAFES = BASE_CAFES;
export const HOOD_COLORS = HOODS;

export const EVENTS = local?.EVENTS || [];
export const LODGING = local?.LODGING || [];
export const HOME = local?.HOME || null;
export const BANNERS = local?.BANNERS || [];
export const GIDS = local?.GIDS || {};
export const CAL_EMAILS = local?.CAL_EMAILS || {};
export const PERSONAL_IDS = local?.PERSONAL_IDS || new Set();
export const SYNCED_AT = local?.SYNCED_AT || null;

function thisWeek() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const s = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const e = new Date(d);
  e.setDate(e.getDate() + 6);
  return { start: s, end: `${e.getFullYear()}-${p(e.getMonth() + 1)}-${p(e.getDate())}` };
}
export const DEFAULT_RANGE = local?.DEFAULT_RANGE || thisWeek();

// Range-picker presets: trip presets from local data, else generic.
export const PRESETS = local
  ? [
      { label: 'SF trip · Aug 10–14', start: '2026-08-10', end: '2026-08-16' },
      { label: 'Jul 27 week', start: '2026-07-27', end: '2026-08-02' },
      { label: 'Aug 3 week', start: '2026-08-03', end: '2026-08-09' },
      { label: 'Aug 17 week', start: '2026-08-17', end: '2026-08-23' },
    ]
  : [{ label: 'This week', ...thisWeek() }];
