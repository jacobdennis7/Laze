import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { DEFAULT_RANGE } from './data/events.js';
import { eachDay, fmtDayShort, addDays } from './lib/time.js';
import { findConflicts, dayLegs } from './lib/schedule.js';
import { subscribe, getState, loadSettings, saveSettings, setSyncing, setLiveEvents, setSyncError } from './lib/store.js';
import { fetchRange, isConnected, connect, listCalendars } from './lib/google.js';
import { warmLegs, subscribeRoutes, routesVersion } from './lib/routes.js';
import { subscribePrefs, prefsVersion } from './lib/prefs.js';
import SpotSuggestModal from './components/SpotSuggestModal.jsx';
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
  }

  async function doSync(settings) {
    const s = settings || loadSettings();
    if (!isConnected()) {
      setShowSettings(true);
      return;
    }
    setSyncing(true);
    try {
      const events = await fetchRange({
        calendarIds: s.calendars?.length ? s.calendars : ['primary'],
        timeMin: `${addDays(range.start, -7)}T00:00:00Z`,
        timeMax: `${addDays(range.end, 21)}T00:00:00Z`,
        tz: s.tz,
      });
      setLiveEvents(events);
    } catch (e) {
      setSyncError(e.message);
    }
  }

  // One-click path for fresh users: app creds are baked into the build, so the
  // onboarding button goes straight to the Google popup; settings only on failure.
  async function onboardConnect() {
    const s = loadSettings();
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
          <span className="logo">Laze</span>
          <button className="src-chip" onClick={() => setShowSettings(true)} title="Data source — click to manage connections">
            <span className={`dot ${store.source}`} />
            {syncLabel}
          </button>
        </div>

        <RangePicker range={range} onChange={changeRange} />

        <div className="seg" role="tablist" aria-label="View">
          <button className={view === 'map' ? 'on' : ''} onClick={() => setView('map')} role="tab" aria-selected={view === 'map'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="1 6 8 3 16 6 23 3 23 18 16 21 8 18 1 21 1 6" /><line x1="8" y1="3" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="21" /></svg>
            Map
          </button>
          <button className={view === 'cal' ? 'on' : ''} onClick={() => setView('cal')} role="tab" aria-selected={view === 'cal'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="9" y1="10" x2="9" y2="22" /><line x1="15" y1="10" x2="15" y2="22" /></svg>
            Calendar
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
          {store.syncing ? 'Syncing…' : 'Sync'}
        </button>
        <button className="pill-btn" onClick={() => setShowConflicts(true)}>
          <span className={`badge${conflicts.length === 0 ? ' zero' : ''}`}>{conflicts.length}</span>
          Conflicts
        </button>
        <button className="pill-btn primary" onClick={() => setShowSuggest(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.8 2.8M16.2 16.2L19 19M19 5l-2.8 2.8M7.8 16.2L5 19" /></svg>
          Suggest
        </button>
      </header>

      <main className="main">
        {view === 'map' ? (
          <>
            <div className="map-pane">
              <MapView day={activeDay} mode={mode} dataVersion={`${store.version}.${rVersion}.${pVersion}`} onSpotSuggest={setSpotSuggest} />
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
            <DayPanel day={activeDay} mode={mode} onSelect={setSelectedEvent} mobileOpen={showItin} />
          </>
        ) : (
          <CalendarView range={range} mode={mode} onSelect={setSelectedEvent} />
        )}
        {isEmpty && (
          <div className="onboard">
            <div className="onboard-card">
              <h2>Your week, on a map</h2>
              <p>
                Laze pulls your Google Calendar, places every meeting on the map, computes travel time
                between them, flags conflicts, and suggests times &amp; spots when someone asks to meet.
              </p>
              <button className="pill-btn primary" onClick={onboardConnect}>
                Connect Google Calendar
              </button>
              <p className="fine">Read-only access · your data stays in this browser</p>
            </div>
          </div>
        )}
      </main>

      {showConflicts && <ConflictsPanel conflicts={conflicts} onClose={() => setShowConflicts(false)} />}
      {showSuggest && <SuggestModal range={range} onClose={() => setShowSuggest(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onSync={(s) => { setShowSettings(false); doSync(s); }} />}
      {selectedEvent && <EventModal ev={selectedEvent} onClose={() => setSelectedEvent(null)} />}
      {spotSuggest && <SpotSuggestModal spot={spotSuggest} day={activeDay} onClose={() => setSpotSuggest(null)} />}
    </div>
  );
}
