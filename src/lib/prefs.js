// User places & preferences: home base, office, favorite spots, and per-event
// placements for virtual meetings. All localStorage; addresses arrive
// pre-resolved from the AddressInput autocomplete.

const LS = 'laze-places';
const MAX_OVERRIDES = 300;
let cache = null;
let version = 0;
const listeners = new Set();

function load() {
  if (!cache) {
    try { cache = JSON.parse(localStorage.getItem(LS) || '{}'); } catch { cache = {}; }
    cache.favorites ||= [];
    cache.placements ||= {};
    cache.virtualDefault ||= 'none'; // 'none' | 'home' | 'office'
    cache.overrides ||= {};
    // Overrides are per occurrence, so they accumulate. Keep the store bounded
    // by dropping the oldest dates — never by age alone, which would silently
    // undo an override on a week the user scrolled back to.
    const entries = Object.entries(cache.overrides);
    if (entries.length > MAX_OVERRIDES) {
      entries.sort((a, b) => (a[1].day < b[1].day ? 1 : -1));
      cache.overrides = Object.fromEntries(entries.slice(0, MAX_OVERRIDES));
    }
  }
  return cache;
}

function save() {
  try { localStorage.setItem(LS, JSON.stringify(cache)); } catch { /* full */ }
  version++;
  listeners.forEach((fn) => fn());
}

export const prefsVersion = () => version;
export function subscribePrefs(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getPlaces() {
  const p = load();
  return { home: p.home || null, office: p.office || null, virtualDefault: p.virtualDefault, favorites: p.favorites };
}

// kind: 'home' | 'office'. Place comes pre-resolved from the autocomplete.
export function setBaseGeo(kind, place) {
  load();
  cache[kind] = place ? { ...place, label: kind === 'home' ? 'Home' : 'Office' } : null;
  save();
}

export function setVirtualDefault(v) {
  load();
  cache.virtualDefault = v;
  save();
}

// ---- favorites: { id, name, address, category: 'coffee'|'lunch'|'dinner', lat, lng } ----
export function addFavoriteGeo({ name, category, place }) {
  load();
  cache.favorites.push({
    id: `fav${Date.now()}`,
    name: (name || '').trim() || place.name,
    address: place.address,
    category,
    lat: place.lat,
    lng: place.lng,
    hood: place.hood,
  });
  save();
}

export function removeFavorite(id) {
  load();
  cache.favorites = cache.favorites.filter((f) => f.id !== id);
  save();
}

// ---- per-event placement for virtual (or ambiguous) meetings ----
// { type: 'home' | 'office' | 'other' | 'none', geo? } — 'none' = explicit unplaced.
export function getPlacement(evId) {
  return load().placements[evId] || null;
}

export function setPlacement(evId, placement) {
  load();
  if (!placement || placement.type === 'default') delete cache.placements[evId];
  else cache.placements[evId] = placement;
  save();
}

export function setPlacementGeo(evId, place) {
  load();
  cache.placements[evId] = { type: 'other', geo: place };
  save();
}

// ---- per-occurrence attendance override ----
// 'remote' = not there in person: treated as a call (off the map unless placed,
//            time still blocked).
// 'skip'   = ignored entirely: off the map, no conflicts, time counts as free.
// Keyed by the event id, which Google makes unique per occurrence, so one date
// of a recurring series can be overridden without touching the rest. Laze is
// read-only: this never changes the user's calendar.
export function getOverride(evId) {
  return load().overrides[evId]?.mode || null;
}

export function setOverride(ev, mode) {
  load();
  if (!mode) delete cache.overrides[ev.id];
  else cache.overrides[ev.id] = { mode, day: ev.day };
  save();
}

// Resolve where a virtual event is being taken from, honoring per-event override
// then the global default. Returns {lat,lng,name,address,hood,label} or null.
export function resolvePlacement(ev) {
  const p = load();
  const pl = p.placements[ev.id];
  if (pl) {
    if (pl.type === 'none') return null;
    if (pl.type === 'home') return p.home;
    if (pl.type === 'office') return p.office;
    if (pl.type === 'other') return pl.geo || null;
  }
  if (p.virtualDefault === 'home') return p.home;
  if (p.virtualDefault === 'office') return p.office;
  return null;
}
