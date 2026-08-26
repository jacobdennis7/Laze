import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { DEFAULT_RANGE } from './data/events.js';
import { eachDay, fmtDayShort, addDays } from './lib/time.js';
import { findConflicts, dayLegs } from './lib/schedule.js';
import { subscribe, getState, loadSettings, saveSettings, setSyncing, setLiveEvents, setSyncError } from './lib/store.js';
import { fetchRange, isConnected, connect, listCalendars, serverAuthEnabled, serverToken, serverLogin } from './lib/google.js';
import { warmLegs, subscribeRoutes, routesVersion } from './lib/routes.js';
import { subscribePrefs, prefsVersion, getPlaces } from './lib/prefs.js';
import { initAnalytics, track } from './lib/analytics.js';
import SpotSuggestModal from './components/SpotSuggestModal.jsx';
import TravelBlockModal from './components/TravelBlockModal.jsx';
import RangePicker from './components/RangePicker.jsx';
import MapView from './components/MapView.jsx';
import DayPanel from './components/DayPanel.jsx';
import CalendarView from './components/CalendarView.jsx';
import ConflictsPanel from './components/ConflictsPanel.jsx';
import SuggestModal from './components/SuggestModal.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import EventModal from './components/EventModal.jsx';

export default function App() {
  const [range, setRange] = useState(DEFAULT_RANGE);
  const [view, setView] = useState('map');
  const [mode, setMode] = useState('drive');
  const [activeDay, setActiveDay] = useState(DEFAULT_RANGE.start);
  const [showConflicts, setShowConflicts] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showItin, setShowItin] = useState(false);

  const store = useSyncExternalStore(subscribe, getState);
  const rVersion = useSyncExternalStore(subscribeRoutes, routesVersion);
  const pVersion = useSyncExternalStore(subscribePrefs, prefsVersion);
  const [spotSuggest, setSpotSuggest] = useState(null);
  const [travelBlock, setTravelBlock] = useState(null); // { leg, day }

  const days = useMemo(() => eachDay(range.start, range.end), [range]);
  // store.version / rVersion are re-computation triggers, not read directly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const conflicts = useMemo(() => findConflicts(range.start, range.end, mode), [range, mode, store.version, rVersion, pVersion]);

  // Warm live drive times for the visible days whenever a Maps key is set.
  useEffect(() => {
    const { mapsKey } = loadSettings();
    if (!mapsKey) return;
    const pairs = [];
    for (const d of days) {
      for (const leg of dayLegs(d, mode)) pairs.push([leg.va, leg.vb]);
    }
    if (pairs.length) warmLegs(pairs, mode, mapsKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, mode, store.version]);

  function changeRange(r) {
    setRange(r);
    setActiveDay(r.start);
    track('range_changed', { days: eachDay(r.start, r.end).length });
  }

  // Returning users sync with zero clicks. Server auth (deployed): the encrypted
  // session cookie mints a fresh token — works for months. Dev fallback: GIS.
  useEffect(() => {
    initAnalytics();
    (async () => {
      const s = loadSettings();
      if (serverAuthEnabled) {
        const justConnected = new URLSearchParams(window.location.search).has('connected');
        if (justConnected) window.history.replaceState({}, '', '/');
        if (await serverToken()) {
          doSync(s);
          return;
        }
        if (justConnected) return; // callback landed but token failed — leave disconnected
      }
      if (!s.clientId || !s.wasConnected) return;
      if (isConnected()) {
        doSync(s);
      } else if (!serverAuthEnabled) {
        connect(s.clientId, { silent: true }).then(() => doSync(s)).catch(() => { /* they'll click Sync */ });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doSync(settings) {
    const s = settings || loadSettings();
    if (!isConnected()) {
      if (serverAuthEnabled) {
        // Try the cookie session first; if there is none, do the redirect sign-in.
        if (!(await serverToken())) {
          track('connect_started');
          serverLogin();
          return;
        }
      } else if (s.clientId && s.wasConnected) {
        try {
          await connect(s.clientId, { silent: true });
        } catch {
          setShowSettings(true);
          return;
        }
      } else {
        setShowSettings(true);
        return;
      }
    }
    setSyncing(true);
    try {
      const events = await fetchRange({
        calendarIds: s.calendars?.length ? s.calendars : ['primary'],
        timeMin: `${addDays(range.start, -7)}T00:00:00Z`,
        timeMax: `${addDays(range.end, 21)}T00:00:00Z`,
        tz: s.tz,
        mapsKey: s.mapsKey || null,
      });
      setLiveEvents(events);
      const firstConnect = !s.wasConnected;
      if (firstConnect) saveSettings({ ...s, wasConnected: true });
      track('sync_completed', { events: events.length, first_connect: firstConnect });
      // Fresh users don't know the Connections panel exists — after the first
      // successful sync, open it so they set home base, office, and favorites.
      const p = getPlaces();
      if (firstConnect && !p.home && !p.office && p.favorites.length === 0) {
        setShowSettings(true);
      }
    } catch (e) {
      setSyncError(e.message);
    }
  }

  // One-click path for fresh users: app creds are baked into the build, so the
  // onboarding button goes straight to the Google popup; settings only on failure.
  async function onboardConnect() {
    const s = loadSettings();
    track('connect_started');
    if (serverAuthEnabled) {
      serverLogin();
      return;
    }
    if (!s.clientId) {
      setShowSettings(true);
      return;
    }
    try {
      await connect(s.clientId);
      let cals = s.calendars;
      if (!cals || !cals.length) {
        const list = await listCalendars();
        cals = list.filter((c) => c.primary).map((c) => c.id);
        saveSettings({ ...s, calendars: cals });
      }
      await doSync({ ...s, calendars: cals });
    } catch {
      setShowSettings(true);
    }
  }

  const syncLabel = store.syncing
    ? 'Syncing…'
    : store.source === 'live'
      ? `Live · ${store.syncedAt}`
      : store.source === 'snapshot'
        ? `Snapshot · ${store.syncedAt}`
        : 'Not connected';
  const isEmpty = store.events.length === 0 && !store.syncing;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-label="Laze">
            <svg className="logo-glyph" viewBox="0 0 96 96" aria-hidden="true">
              <path d="M27 40 L27 60 Q27 71 38 71 L50 71" fill="none" stroke="#2B3BE2" strokeWidth="11" strokeLinecap="round" />
              <circle cx="27" cy="24" r="12" fill="none" stroke="#2B3BE2" strokeWidth="9.5" />
              <circle cx="65" cy="71" r="10.5" fill="none" stroke="#2B3BE2" strokeWidth="8.5" />
            </svg>
            <span className="logo-text">aze</span>
          </span>
          <button className="src-chip" onClick={() => setShowSettings(true)} title="Data source — click to manage connections">
            <span className={`dot ${store.source}`} />
            {syncLabel}
          </button>
        </div>

        <RangePicker range={range} onChange={changeRange} />

        <div className="topbar-break" aria-hidden="true" />

        <div className="seg" role="tablist" aria-label="View">
          <button className={view === 'map' ? 'on' : ''} onClick={() => setView('map')} role="tab" aria-selected={view === 'map'} aria-label="Map view">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="1 6 8 3 16 6 23 3 23 18 16 21 8 18 1 21 1 6" /><line x1="8" y1="3" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="21" /></svg>
            <span className="btn-label">Map</span>
          </button>
          <button className={view === 'cal' ? 'on' : ''} onClick={() => { setView('cal'); track('view_toggled', { view: 'cal' }); }} role="tab" aria-selected={view === 'cal'} aria-label="Calendar view">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="9" y1="10" x2="9" y2="22" /><line x1="15" y1="10" x2="15" y2="22" /></svg>
            <span className="btn-label">Calendar</span>
          </button>
        </div>

        <div className="mode-seg" aria-label="Travel mode">
          <button className={mode === 'drive' ? 'on' : ''} onClick={() => setMode('drive')} title="Drive / rideshare">🚗</button>
          <button className={mode === 'walk' ? 'on' : ''} onClick={() => setMode('walk')} title="Walk">🚶</button>
          <button className={mode === 'transit' ? 'on' : ''} onClick={() => setMode('transit')} title="Transit">🚌</button>
        </div>

        <div className="spacer" />

        <button className="pill-btn" onClick={() => doSync()} disabled={store.syncing} title={isConnected() ? 'Re-pull events from Google Calendar' : 'Connect Google Calendar'}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={store.syncing ? 'spin' : ''}><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
          <span className="btn-label">{store.syncing ? 'Syncing…' : 'Sync'}</span>
        </button>
        <button className="pill-btn" onClick={() => { setShowConflicts(true); track('conflicts_opened', { count: conflicts.length }); }} aria-label={`${conflicts.length} conflicts`}>
          <span className={`badge${conflicts.length === 0 ? ' zero' : ''}`}>{conflicts.length}</span>
          <span className="btn-label">Conflicts</span>
        </button>
        <button className="pill-btn primary" onClick={() => { setShowSuggest(true); track('suggest_opened'); }} aria-label="Suggest times">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.8 2.8M16.2 16.2L19 19M19 5l-2.8 2.8M7.8 16.2L5 19" /></svg>
          <span className="btn-label">Suggest</span>
        </button>
      </header>

      <main className="main">
        {view === 'map' ? (
          <>
            <div className="map-pane">
              <MapView
                day={activeDay}
                mode={mode}
                dataVersion={`${store.version}.${rVersion}.${pVersion}`}
                onSpotSuggest={setSpotSuggest}
                onTravel={(leg) => setTravelBlock({ leg, day: activeDay })}
              />
              <div className="day-chips" role="tablist" aria-label="Day">
                {days.map((d, i) => (
                  <button key={d} className={d === activeDay ? 'on' : ''} onClick={() => setActiveDay(d)} role="tab" aria-selected={d === activeDay}>
                    {days.length > 5 ? fmtDayShort(d) : `Day ${i + 1} · ${fmtDayShort(d)}`}
                  </button>
                ))}
              </div>
              <button className="itin-fab pill-btn" onClick={() => setShowItin(!showItin)}>
                {showItin ? 'Hide itinerary' : 'Itinerary'}
              </button>
            </div>
            <DayPanel
              day={activeDay}
              mode={mode}
              onSelect={setSelectedEvent}
              mobileOpen={showItin}
              onTravel={(leg) => setTravelBlock({ leg, day: activeDay })}
            />
          </>
        ) : (
          <CalendarView range={range} mode={mode} onSelect={setSelectedEvent} onTravel={(leg, d) => setTravelBlock({ leg, day: d })} />
        )}
        {isEmpty && (
          <div className="onboard">
            <div className="onboard-card">
              <h1 className="onboard-name">Laze</h1>
              <h2>Your week, on a map</h2>
              <p>
                Laze is a scheduling assistant. It connects to your Google Calendar (read-only) and
                places every meeting on a map so you can see your day the way you'll actually move
                through it.
              </p>
              <ul className="onboard-feats">
                <li>Travel time between back-to-back meetings, with conflicts flagged before they burn you</li>
                <li>Cafés, restaurants &amp; bars near wherever you'll already be</li>
                <li>"When &amp; where works" suggestions when someone asks to meet</li>
              </ul>
              <button className="pill-btn primary" onClick={onboardConnect}>
                Connect Google Calendar
              </button>
              <p className="fine">
                Read-only access · your data stays in this browser — nothing is stored on a server ·{' '}
                <a href="/privacy.html" target="_blank" rel="noreferrer">Privacy Policy</a> ·{' '}
                <a href="mailto:jacobadennis@gmail.com">Contact</a>
              </p>
            </div>
          </div>
        )}
      </main>

      {showConflicts && <ConflictsPanel conflicts={conflicts} onClose={() => setShowConflicts(false)} />}
      {showSuggest && <SuggestModal range={range} onClose={() => setShowSuggest(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onSync={(s) => { setShowSettings(false); doSync(s); }} />}
      {selectedEvent && <EventModal ev={selectedEvent} onClose={() => setSelectedEvent(null)} />}
      {spotSuggest && <SpotSuggestModal spot={spotSuggest} day={activeDay} onClose={() => setSpotSuggest(null)} />}
      {travelBlock && <TravelBlockModal leg={travelBlock.leg} day={travelBlock.day} onClose={() => setTravelBlock(null)} />}
    </div>
  );
}
