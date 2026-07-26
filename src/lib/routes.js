// Live travel times via the Google Routes API (computeRoutes). Browser-callable
// with an API key. Results are cached in localStorage; estimates remain the
// fallback whenever no key is set or a call fails.

const LS = 'laze-routecache';
let cache = null;
let version = 0;
const listeners = new Set();
const inflight = new Set();

function load() {
  if (!cache) {
    try { cache = JSON.parse(localStorage.getItem(LS) || '{}'); } catch { cache = {}; }
  }
  return cache;
}

const keyOf = (a, b, mode) => `${a.lat.toFixed(4)},${a.lng.toFixed(4)}|${b.lat.toFixed(4)},${b.lng.toFixed(4)}|${mode}`;

export const routesVersion = () => version;
export function subscribeRoutes(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Sync read: minutes if we have a live figure, else null.
export function liveMinutes(a, b, mode) {
  const v = load()[keyOf(a, b, mode)];
  return typeof v === 'number' ? v : null;
}

const MODE_MAP = { drive: 'DRIVE', walk: 'WALK', transit: 'TRANSIT' };

// One-shot key check (SFO → downtown SF). Returns { ok, detail }.
export async function testRoutesKey(apiKey) {
  try {
    const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: 37.6191, longitude: -122.3816 } } },
        destination: { location: { latLng: { latitude: 37.7885, longitude: -122.3985 } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
      }),
    });
    const js = await r.json();
    if (r.ok && js.routes?.[0]?.duration) {
      return { ok: true, detail: `SFO → downtown right now: ${Math.round(parseInt(js.routes[0].duration, 10) / 60)} min drive` };
    }
    return { ok: false, detail: js.error?.message || `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, detail: e.message };
  }
}

export async function warmLegs(pairs, mode, apiKey) {
  if (!apiKey) return;
  const c = load();
  let fetched = false;
  for (const [a, b] of pairs) {
    const k = keyOf(a, b, mode);
    if (k in c || inflight.has(k)) continue;
    inflight.add(k);
    try {
      const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: a.lat, longitude: a.lng } } },
          destination: { location: { latLng: { latitude: b.lat, longitude: b.lng } } },
          travelMode: MODE_MAP[mode] || 'DRIVE',
          ...(mode === 'drive' ? { routingPreference: 'TRAFFIC_AWARE' } : {}),
        }),
      });
      if (r.ok) {
        const js = await r.json();
        const dur = js.routes?.[0]?.duration; // e.g. "1234s"
        if (dur) {
          c[k] = Math.round(parseInt(dur, 10) / 60);
          fetched = true;
        }
      } else {
        c[k] = null; // don't hammer a failing key
      }
    } catch {
      c[k] = null;
    } finally {
      inflight.delete(k);
    }
  }
  if (fetched) {
    try { localStorage.setItem(LS, JSON.stringify(c)); } catch { /* full */ }
    version++;
    listeners.forEach((fn) => fn());
  }
}
