// Google Calendar live sync via Google Identity Services (token flow, browser-only).
// Needs an OAuth Client ID (Web application, origin http://localhost:5174) with the
// Google Calendar API enabled. Read-only scope; the token never leaves the browser.
import { VENUES } from '../data/events.js';

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const GSI_SRC = 'https://accounts.google.com/gsi/client';

let accessToken = null;
let tokenExpiry = 0;
let gsiLoaded = null;

// Access tokens last ~1h. Persisting one across reloads means no re-auth within
// that window; after expiry, a silent reconnect (prompt:'') reuses the Google
// session without asking again. True "never sign in" needs a backend with
// refresh tokens — planned alongside app verification.
const TOKEN_LS = 'laze-token';
try {
  const saved = JSON.parse(localStorage.getItem(TOKEN_LS) || 'null');
  if (saved && saved.exp > Date.now() + 60000) {
    accessToken = saved.token;
    tokenExpiry = saved.exp;
  }
} catch { /* ignore */ }

function loadGsi() {
  if (gsiLoaded) return gsiLoaded;
  gsiLoaded = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = GSI_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Google sign-in script'));
    document.head.appendChild(s);
  });
  return gsiLoaded;
}

export function isConnected() {
  return !!accessToken && Date.now() < tokenExpiry - 60000;
}

export async function connect(clientId, { silent = false } = {}) {
  if (!clientId) throw new Error('Paste your OAuth Client ID first');
  await loadGsi();
  return new Promise((resolve, reject) => {
    const tc = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) return reject(new Error(resp.error_description || resp.error));
        accessToken = resp.access_token;
        tokenExpiry = Date.now() + (resp.expires_in || 3600) * 1000;
        try { localStorage.setItem(TOKEN_LS, JSON.stringify({ token: accessToken, exp: tokenExpiry })); } catch { /* full */ }
        resolve();
      },
      error_callback: (e) => reject(new Error(e.message || 'Sign-in was closed')),
    });
    tc.requestAccessToken({ prompt: silent ? '' : 'consent' });
  });
}

async function gapi(path, params = {}) {
  const url = new URL(`https://www.googleapis.com/calendar/v3/${path}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw new Error(`Calendar API ${r.status}: ${(await r.json()).error?.message || r.statusText}`);
  return r.json();
}

export async function listCalendars() {
  const js = await gapi('users/me/calendarList', { minAccessRole: 'reader' });
  return (js.items || []).map((c) => ({ id: c.id, label: c.summaryOverride || c.summary, primary: !!c.primary }));
}

export async function fetchRange({ calendarIds, timeMin, timeMax, tz, mapsKey = null }) {
  const all = [];
  for (const calId of calendarIds) {
    let pageToken;
    do {
      const js = await gapi(`calendars/${encodeURIComponent(calId)}/events`, {
        singleEvents: 'true',
        orderBy: 'startTime',
        timeMin,
        timeMax,
        timeZone: tz,
        maxResults: '250',
        pageToken,
      });
      for (const item of js.items || []) all.push({ item, calId });
      pageToken = js.nextPageToken;
    } while (pageToken);
  }
  return normalizeAll(all, tz, mapsKey);
}

// ---------- normalization ----------

const VIRTUAL_RE = /zoom\.us|meet\.google|teams\.microsoft|webex|https?:\/\//i;
const TBD_RE = /\btbd\b|somewhere|to be|irl\s*-|in person\s*-/i;
const FLIGHT_RE = /\bflight\b|✈|airlines?\b|\b(UA|AA|DL|B6|WN|AS)\s?\d{2,4}\b/i;
const HOLD_RE = /\bhold\b|\bmaybe\b|tentative/i;

async function normalizeAll(rows, tz, mapsKey = null) {
  const out = [];
  for (const { item, calId } of rows) {
    if (item.status === 'cancelled' || item.eventType === 'workingLocation' || item.eventType === 'birthday') continue;
    const selfDeclined = (item.attendees || []).some((a) => a.self && a.responseStatus === 'declined');
    if (selfDeclined) continue;
    const start = item.start?.dateTime;
    const end = item.end?.dateTime;
    if (!start || !end) continue; // skip all-day banners for the grid (kept simple)

    const title = item.summary || '(untitled)';
    const locText = (item.location || '').trim();
    const hasConf = !!(item.conferenceData || item.hangoutLink) || /zoom\.us|meet\.google/.test(item.description || '');
    const locIsUrl = VIRTUAL_RE.test(locText) && !/,/.test(locText);
    const virtual = (hasConf && !locText) || locIsUrl;
    const kind = FLIGHT_RE.test(title) ? 'flight' : HOLD_RE.test(title) ? 'hold' : 'meeting';
    // Solo events (no other human attendees) are time blocks / reminders, not
    // meetings — they don't need a venue and must never raise location warnings.
    const solo = !(item.attendees || []).some((a) => !a.self && !a.resource);

    // "TBD", "IRL - somewhere", etc. are placeholders, not addresses — never geocode
    // them (Nominatim will happily match "TBD" to a real town somewhere on Earth).
    const isPlaceholder = TBD_RE.test(locText) || (locText.length < 8 && !/\d/.test(locText));
    let venueKey = null;
    let geo = null;
    if (locText && !locIsUrl && !isPlaceholder) {
      venueKey = matchKnownVenue(locText);
      if (!venueKey) geo = await geocode(locText, mapsKey);
    }
    const tbd = !virtual && kind !== 'flight' && !solo && (!locText || locIsUrl || isPlaceholder || (!venueKey && !geo));

    out.push({
      id: item.id,
      gid: item.id,
      htmlLink: item.htmlLink,
      calId,
      day: start.slice(0, 10),
      start,
      end,
      title,
      org: guessOrg(item),
      venue: venueKey,
      geo, // {name,address,lat,lng,hood} for ad-hoc geocoded venues
      locationText: locText || undefined,
      virtual: virtual || undefined,
      tbd: tbd || undefined,
      solo: solo || undefined,
      kind,
      live: true,
    });
  }
  return out;
}

function matchKnownVenue(loc) {
  const l = loc.toLowerCase();
  for (const [key, v] of Object.entries(VENUES)) {
    const streetPart = v.address.toLowerCase().split(',')[0];
    if (l.includes(streetPart) || l.includes(v.name.toLowerCase())) return key;
  }
  return null;
}

function guessOrg(item) {
  const others = (item.attendees || []).filter((a) => !a.self && !a.resource);
  if (others.length === 1) {
    const dom = others[0].email.split('@')[1];
    if (dom && !['gmail.com', 'yahoo.com', 'icloud.com', 'outlook.com'].includes(dom)) {
      const name = dom.split('.')[0];
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  }
  return undefined;
}

// ---------- geocoding (Places Text Search first, Nominatim fallback; cached) ----------

// v2: v1 cached failures for messy strings the old resolver couldn't handle.
const GEO_LS = 'laze-geocache-v2';
let geoCache = null;
let lastGeo = 0;

const hoodFromAddress = (addr) => {
  const parts = (addr || '').split(',').map((s) => s.trim());
  return parts.slice(1).find((p) => p && !/^\d+[\w-]*$/.test(p)) || '—';
};

// Google Places handles human location strings ("OL'DAYS Farm to Table - Tribeca
// (73 Warren St...)") far better than pure geocoders.
async function placesTextSearch(q, key) {
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify({ textQuery: q, maxResultCount: 1 }),
  });
  if (!r.ok) throw new Error(`TextSearch ${r.status}`);
  const p = (await r.json()).places?.[0];
  if (!p) return null;
  return {
    name: p.displayName?.text || q.split(/[(,\-–]/)[0].trim(),
    address: p.formattedAddress || q,
    lat: p.location.latitude,
    lng: p.location.longitude,
    hood: hoodFromAddress(p.formattedAddress),
  };
}

// Noisy strings → plausible address candidates for the OSM fallback:
// full string, any parenthesized part, and the substring from the first digit.
function addressCandidates(locText) {
  const out = [locText];
  const paren = locText.match(/\(([^)]{8,})\)/);
  if (paren) out.push(paren[1]);
  const digit = locText.match(/\d.*$/s);
  if (digit && digit[0].length >= 8 && digit[0] !== locText) out.push(digit[0].replace(/\)+\s*$/, ''));
  return [...new Set(out.map((s) => s.trim()))];
}

function loadGeoCache() {
  if (!geoCache) {
    try { geoCache = JSON.parse(localStorage.getItem(GEO_LS) || '{}'); } catch { geoCache = {}; }
    // Purge junk entries from before the placeholder guard existed (e.g. "tbd" → Raipur).
    let dirty = false;
    for (const k of Object.keys(geoCache)) {
      if (TBD_RE.test(k) || (k.length < 8 && !/\d/.test(k))) { delete geoCache[k]; dirty = true; }
    }
    if (dirty) { try { localStorage.setItem(GEO_LS, JSON.stringify(geoCache)); } catch { /* full */ } }
  }
  return geoCache;
}

export async function geocode(locText, mapsKey = null) {
  const cache = loadGeoCache();
  const key = locText.toLowerCase().slice(0, 120);
  if (key in cache && cache[key] !== null) return cache[key];

  let result = null;

  if (mapsKey) {
    try { result = await placesTextSearch(locText, mapsKey); } catch { /* fall through to OSM */ }
  }

  if (!result) {
    for (const candidate of addressCandidates(locText)) {
      // polite throttle: 1 req/sec against Nominatim
      const wait = Math.max(0, lastGeo + 1100 - Date.now());
      if (wait) await new Promise((r) => setTimeout(r, wait));
      lastGeo = Date.now();
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(candidate)}`);
        const js = await r.json();
        if (js[0]) {
          const a = js[0].address || {};
          result = {
            name: locText.split(/[(,\-–]/)[0].trim() || candidate.split(',')[0],
            address: candidate,
            lat: +js[0].lat,
            lng: +js[0].lon,
            hood: a.neighbourhood || a.suburb || a.quarter || a.city_district || a.city || '—',
          };
          break;
        }
      } catch { /* offline or blocked — try next candidate */ }
    }
  }

  cache[key] = result;
  try { localStorage.setItem(GEO_LS, JSON.stringify(cache)); } catch { /* full */ }
  return result;
}
