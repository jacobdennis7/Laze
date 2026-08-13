// Event source of truth. Starts on the bundled snapshot; a successful Google
// Calendar sync swaps in live events. Components subscribe via useSyncExternalStore.
import { EVENTS as SNAPSHOT, SYNCED_AT } from '../data/events.js';

// Last successful sync is cached locally so a reload (or an expired Google
// token) still shows the calendar instantly — reconnecting only refreshes it.
const EV_LS = 'laze-events-cache';
function loadCachedEvents() {
  try {
    const c = JSON.parse(localStorage.getItem(EV_LS) || 'null');
    if (c && Array.isArray(c.events) && c.events.length) return c;
  } catch { /* corrupt cache */ }
  return null;
}
const cached = loadCachedEvents();

let state = {
  events: cached ? cached.events : SNAPSHOT,
  source: cached ? 'live' : SNAPSHOT.length ? 'snapshot' : 'empty', // 'snapshot' | 'live' | 'empty'
  syncedAt: cached ? cached.at : SYNCED_AT,
  syncing: false,
  error: null,
  version: 0,
};

const listeners = new Set();

export const getState = () => state;
export const getEvents = () => state.events;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(patch) {
  state = { ...state, ...patch, version: state.version + 1 };
  listeners.forEach((fn) => fn());
}

export function setSyncing(on) {
  emit({ syncing: on, error: on ? null : state.error });
}

export function setLiveEvents(events) {
  const at = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  try { localStorage.setItem(EV_LS, JSON.stringify({ events, at })); } catch { /* full */ }
  emit({
    events,
    source: 'live',
    syncedAt: at,
    syncing: false,
    error: null,
  });
}

export function setSyncError(msg) {
  emit({ syncing: false, error: msg });
}

export function resetToSnapshot() {
  try { localStorage.removeItem(EV_LS); } catch { /* ignore */ }
  emit({ events: SNAPSHOT, source: SNAPSHOT.length ? 'snapshot' : 'empty', syncedAt: SYNCED_AT, error: null });
}

// ---- settings (persisted) ----
const LS = 'laze-settings';

// A deployed build can ship app-level credentials so users never paste anything:
// set VITE_GOOGLE_CLIENT_ID / VITE_MAPS_KEY at build time. Stored values override.
const DEFAULTS = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  mapsKey: import.meta.env.VITE_MAPS_KEY || '',
  // default to the device's timezone so new testers see sane times immediately
  tz: (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'; }
    catch { return 'America/New_York'; }
  })(),
  calendars: null,
};

export function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(LS) || '{}');
    const merged = { ...DEFAULTS, ...stored };
    if (!merged.clientId) merged.clientId = DEFAULTS.clientId;
    if (!merged.mapsKey) merged.mapsKey = DEFAULTS.mapsKey;
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s) {
  localStorage.setItem(LS, JSON.stringify(s));
}
