// User places & preferences: home base, office, favorite spots, and per-event
// placements for virtual meetings. All localStorage; geocoded once via Nominatim.
import { geocode } from './google.js';

const LS = 'laze-places';
let cache = null;
let version = 0;
const listeners = new Set();

function load() {
  if (!cache) {
    try { cache = JSON.parse(localStorage.getItem(LS) || '{}'); } catch { cache = {}; }
    cache.favorites ||= [];
    cache.placements ||= {};
    cache.virtualDefault ||= 'none'; // 'none' | 'home' | 'office'
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

// kind: 'home' | 'office'. Returns geo or throws with a friendly message.
export async function setBasePlace(kind, address) {
  load();
  if (!address?.trim()) {
    cache[kind] = null;
    save();
    return null;
  }
  const geo = await geocode(address.trim());
  if (!geo) throw new Error(`Couldn't find “${address}” — try adding city + state`);
  cache[kind] = { ...geo, label: kind === 'home' ? 'Home' : 'Office' };
  save();
  return cache[kind];
}

export function setVirtualDefault(v) {
  load();
  cache.virtualDefault = v;
  save();
}

// ---- favorites: { id, name, address, category: 'coffee'|'lunch'|'dinner', lat, lng } ----
export async function addFavorite({ name, address, category }) {
  load();
  const geo = await geocode(address.trim());
  if (!geo) throw new Error(`Couldn't find “${address}”`);
  cache.favorites.push({ id: `fav${Date.now()}`, name: name.trim() || geo.name, address: geo.address, category, lat: geo.lat, lng: geo.lng, hood: geo.hood });
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

export async function setPlacementOther(evId, address) {
  load();
  const geo = await geocode(address.trim());
  if (!geo) throw new Error(`Couldn't find “${address}”`);
  cache.placements[evId] = { type: 'other', geo };
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
