import { VENUES } from '../data/events.js';

export function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const ROUTE_FACTOR = 1.3; // streets aren't straight lines

// Piecewise city speeds; returns minutes. Estimates for planning, not live routing.
export function travelMinutes(a, b, mode = 'drive') {
  const km = haversineKm(a, b) * ROUTE_FACTOR;
  if (km < 0.05) return 0;
  if (mode === 'walk') return Math.round((km / 4.8) * 60);
  if (mode === 'transit') return Math.round(10 + (km / 15) * 60);
  // drive: slow downtown, faster on highway-length hops
  const speed = km < 2.5 ? 14 : km < 9 ? 21 : 45;
  return Math.round(4 + (km / speed) * 60);
}

export function bestMode(a, b) {
  const km = haversineKm(a, b) * ROUTE_FACTOR;
  return km <= 1.3 ? 'walk' : 'drive';
}

export const MODE_ICON = { walk: '🚶', drive: '🚗', transit: '🚌' };
export const MODE_LABEL = { walk: 'walk', drive: 'drive', transit: 'transit' };

export function venueOf(ev) {
  if (ev.venue && VENUES[ev.venue]) return VENUES[ev.venue];
  if (ev.geo && typeof ev.geo.lat === 'number') return ev.geo; // live-synced, ad-hoc geocoded
  return null;
}

export function gmapsDir(a, b, mode = 'drive') {
  const m = mode === 'walk' ? 'walking' : mode === 'transit' ? 'transit' : 'driving';
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(a.address || `${a.lat},${a.lng}`)}&destination=${encodeURIComponent(b.address || `${b.lat},${b.lng}`)}&travelmode=${m}`;
}

export function gmapsRoute(stops) {
  if (stops.length < 2) return null;
  const path = stops.map((s) => encodeURIComponent(s.address || `${s.lat},${s.lng}`)).join('/');
  return `https://www.google.com/maps/dir/${path}`;
}

export function gmapsPlace(v) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.address || `${v.lat},${v.lng}`)}`;
}

// Prefilled "create event" in the user's own Google Calendar — no write scope
// needed; Google's own UI does the saving. Times are floating-local strings.
export function gcalTemplate({ title, location, details, startMs, endMs, offset }) {
  const sign = offset[0] === '-' ? -1 : 1;
  const [oh, om] = offset.slice(1).split(':').map(Number);
  const f = (ms) => {
    const d = new Date(ms + sign * (oh * 60 + om) * 60000);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00`;
  };
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${f(startMs)}/${f(endMs)}`,
    location: location || '',
    details: details || '',
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

// Nearby spots: Google Places when a Maps key is configured (fast, reliable,
// real place data), else public Overpass/OSM mirrors (free but best-effort).
export async function fetchNearbySpots(bounds, mapsKey = null) {
  if (mapsKey) {
    try {
      return await googleNearby(bounds, mapsKey);
    } catch { /* key may lack Places API — fall through to OSM */ }
  }
  return overpassNearby(bounds);
}

const G_TYPE = (types = [], primary = '') => {
  const all = [primary, ...types];
  if (all.some((t) => /cafe|coffee|bakery|tea/.test(t))) return 'cafe';
  if (all.some((t) => /bar|pub|night_club|wine/.test(t))) return 'bar';
  return 'restaurant';
};

// Places Text Search accepts a RECTANGLE restriction — the exact visible
// viewport — unlike searchNearby's circle, which on a wide screen bulged past
// the top/bottom edges and returned spots outside the view. One query per
// category, 20 results each, all strictly inside what the user is looking at.
const NEARBY_QUERIES = ['coffee shops', 'restaurants', 'bars'];

async function googleNearby(bounds, key) {
  const rectangle = {
    low: { latitude: bounds.getSouth(), longitude: bounds.getWest() },
    high: { latitude: bounds.getNorth(), longitude: bounds.getEast() },
  };

  const one = async (textQuery) => {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.displayName,places.location,places.primaryType,places.types,places.shortFormattedAddress,places.rating',
      },
      body: JSON.stringify({
        textQuery,
        pageSize: 20,
        locationRestriction: { rectangle },
      }),
    });
    if (!r.ok) throw new Error(`Places ${r.status}`);
    return ((await r.json()).places || []);
  };

  const settled = await Promise.allSettled(NEARBY_QUERIES.map(one));
  if (settled.every((s) => s.status === 'rejected')) throw new Error('Places unavailable');

  const seen = new Set();
  const out = [];
  for (const s of settled) {
    if (s.status !== 'fulfilled') continue;
    for (const p of s.value) {
      const dedupe = `${p.displayName?.text}|${p.location.latitude.toFixed(5)}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({
        id: `g${out.length}`,
        name: p.displayName?.text || 'Unnamed',
        type: G_TYPE(p.types, p.primaryType),
        cuisine: p.rating ? `★ ${p.rating}` : null,
        address: p.shortFormattedAddress || null,
        lat: p.location.latitude,
        lng: p.location.longitude,
      });
    }
  }
  return out;
}

async function overpassNearby(bounds) {
  const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
  const q = `[out:json][timeout:8];(
    node["amenity"~"^(cafe|restaurant|bar|pub)$"]["name"](${bbox});
  );out 80;`;
  // Public Overpass instances rate-limit under load — try the main one, then a
  // mirror, each with a hard client-side timeout so a hang fails fast.
  let r;
  for (const host of ['https://overpass-api.de', 'https://overpass.kumi.systems', 'https://overpass.private.coffee']) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    try {
      r = await fetch(`${host}/api/interpreter`, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(q),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (r.ok) break;
    } catch {
      clearTimeout(t);
      r = null;
    }
  }
  if (!r || !r.ok) throw new Error('Overpass unavailable');
  const js = await r.json();
  return (js.elements || []).map((n) => ({
    id: n.id,
    name: n.tags.name,
    type: n.tags.amenity === 'pub' ? 'bar' : n.tags.amenity,
    cuisine: n.tags.cuisine ? n.tags.cuisine.split(';')[0].replace(/_/g, ' ') : null,
    address: [n.tags['addr:housenumber'], n.tags['addr:street']].filter(Boolean).join(' ') || null,
    lat: n.lat,
    lng: n.lon,
  }));
}
