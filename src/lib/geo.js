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
