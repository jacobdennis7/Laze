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

// Nearby spots via Overpass (OpenStreetMap) — free, key-less, CORS-friendly.
export async function fetchNearbySpots(bounds) {
  const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
  const q = `[out:json][timeout:12];(
    node["amenity"~"^(cafe|restaurant|bar|pub)$"]["name"](${bbox});
  );out 80;`;
  // Public Overpass instances rate-limit under load — try the main one, then a mirror.
  let r;
  for (const host of ['https://overpass-api.de', 'https://overpass.kumi.systems']) {
    try {
      r = await fetch(`${host}/api/interpreter`, { method: 'POST', body: 'data=' + encodeURIComponent(q) });
      if (r.ok) break;
    } catch { r = null; }
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
