import React, { useState } from 'react';
import { HOOD_COLORS, BANNERS } from '../data/events.js';
import { eventsForDay, dayLegs, routableStops, lodgingFor, effectiveVenue } from '../lib/schedule.js';
import { gmapsRoute, gmapsDir, gmapsPlace, MODE_ICON, MODE_LABEL } from '../lib/geo.js';
import { getPlaces, getPlacement, setPlacement, setPlacementGeo } from '../lib/prefs.js';
import { fmtTime, fmtDayLong, toEpoch } from '../lib/time.js';
import AddressInput from './AddressInput.jsx';

// Dropdown on virtual cards: where is this call being taken from?
function PlacementPicker({ ev }) {
  const places = getPlaces();
  const pl = getPlacement(ev.id);
  const [otherOpen, setOtherOpen] = useState(false);
  const value = pl ? pl.type : 'default';

  function change(v) {
    if (v === 'other') { setOtherOpen(true); return; }
    setOtherOpen(false);
    setPlacement(ev.id, v === 'default' ? null : { type: v });
  }

  return (
    <div className="placement" onClick={(e) => e.stopPropagation()}>
      <select value={value} onChange={(e) => change(e.target.value)} aria-label="Taken from">
        <option value="default">Taken from: default</option>
        <option value="home" disabled={!places.home}>Home{places.home ? '' : ' (set in Connections)'}</option>
        <option value="office" disabled={!places.office}>Office{places.office ? '' : ' (set in Connections)'}</option>
        <option value="other">Other address…</option>
        <option value="none">Don't place on map</option>
      </select>
      {otherOpen && (
        <span className="placement-other">
          <AddressInput
            placeholder="Search address…"
            onSelect={(place) => { setPlacementGeo(ev.id, place); setOtherOpen(false); }}
            ariaLabel="Taken from address"
          />
        </span>
      )}
    </div>
  );
}

export default function DayPanel({ day, mode, onSelect, mobileOpen, onTravel }) {
  const evs = eventsForDay(day).filter((e) => e.kind !== 'flight' || true);
  const legs = dayLegs(day, mode);
  const stops = routableStops(day);
  const lodging = lodgingFor(day);
  const banner = BANNERS.find((b) => day >= b.from && day <= b.to);
  const routeUrl = gmapsRoute([...(lodging ? [lodging] : []), ...stops.filter((s) => s.kind !== 'flight').map(effectiveVenue)]);

  const stopIndex = new Map(stops.filter((s) => s.kind !== 'flight').map((s, i) => [s.id, i + 1]));
  const legAfter = new Map(legs.map((l) => [l.from.id, l]));

  // Free windows inside the day: merge overlapping busy intervals first so an
  // event running "inside" a flight (or another meeting) can't fake an open gap.
  const freeGaps = [];
  const timed = evs
    .filter((e) => !e.homeCity && e.kind !== 'hold')
    .map((e) => ({ s: toEpoch(e.start), e: toEpoch(e.end), ev: e }))
    .sort((a, b) => a.s - b.s);
  const merged = [];
  for (const b of timed) {
    if (merged.length && b.s <= merged[merged.length - 1].e) {
      const last = merged[merged.length - 1];
      if (b.e > last.e) { last.e = b.e; last.ev = b.ev; } // latest-ending event owns the gap
    } else merged.push({ ...b });
  }
  for (let i = 0; i < merged.length - 1; i++) {
    const gap = Math.round((merged[i + 1].s - merged[i].e) / 60000);
    if (gap >= 75) freeGaps.push({ afterId: merged[i].ev.id, gap, from: merged[i].ev, to: merged[i + 1].ev });
  }

  return (
    <aside className={`side${mobileOpen ? ' open' : ''}`}>
      <div className="side-head">
        <div className="kicker">Itinerary</div>
        <h2>{fmtDayLong(day)}</h2>
        {banner && <div className="banner-chip">{banner.label}</div>}
        <div>
          {routeUrl && stops.length > 1 && (
            <a className="open-route" href={routeUrl} target="_blank" rel="noreferrer">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>
              Open route in Google Maps
            </a>
          )}
        </div>
      </div>
      <div className="side-scroll">
        {evs.length === 0 && <div className="empty-note">Nothing on the calendar. A clean day.</div>}
        {evs.map((ev) => {
          const v = effectiveVenue(ev);
          const num = stopIndex.get(ev.id);
          const color = v ? HOOD_COLORS[v.hood] : ev.virtual ? HOOD_COLORS.virtual : HOOD_COLORS.tbd;
          const leg = legAfter.get(ev.id);
          const free = freeGaps.find((f) => f.afterId === ev.id);
          return (
            <React.Fragment key={ev.id}>
              <div
                className={`stop-card${ev.note || ev.tbd ? ' flagged' : ''} clickable`}
                onClick={(e) => { if (e.target.closest('a')) return; onSelect && onSelect(ev); }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onSelect && onSelect(ev)}
              >
                <div className={`stop-num${!num ? ' virtual' : ''}`} style={num ? { '--hood': color } : undefined}>
                  {ev.kind === 'flight' ? '✈' : num || (ev.virtual ? '▶' : '?')}
                </div>
                <div className="stop-body">
                  <div className="stop-time">
                    {fmtTime(ev.start)} – {ev.endDisplay || fmtTime(ev.end)}
                  </div>
                  <div className="stop-title">
                    {ev.title}
                    {ev.org ? <span className="org"> · {ev.org}</span> : null}
                    {ev.tbd && <span className="chip tbd">TBD</span>}
                    {ev.virtual && <span className="chip virtual">Virtual</span>}
                    {ev.kind === 'hold' && <span className="chip hold">Hold</span>}
                    {ev.kind === 'flight' && <span className="chip flight">Flight</span>}
                    {ev.homeCity && <span className="chip ny">NYC event</span>}
                  </div>
                  <div className="stop-venue">
                    {v && !ev.tbd ? (
                      <a href={gmapsPlace(v)} target="_blank" rel="noreferrer">
                        {v.name} · {v.hood}
                      </a>
                    ) : ev.virtual ? (
                      'Video call'
                    ) : ev.tbd ? (
                      'No location yet'
                    ) : (
                      ev.locationText || 'No location set'
                    )}
                  </div>
                  {ev.note && <div className="stop-note">⚑ {ev.note}</div>}
                  {ev.virtual && <PlacementPicker ev={ev} />}
                </div>
              </div>

              {leg && (
                <div className={`leg-row${leg.tight ? ' tight' : ''}`}>
                  <span>{MODE_ICON[leg.mode]}</span>
                  <span className="t">
                    {leg.live ? '' : '~'}{leg.mins} min {MODE_LABEL[leg.mode]}{leg.live ? ' ·  live' : ''}
                    {leg.gapMin >= 0 ? ` · ${leg.gapMin} min gap` : ' · overlaps!'}
                  </span>
                  {leg.mode !== 'walk' && leg.walkMins <= 25 && <span className="t">(walk {leg.walkMins})</span>}
                  <a href={gmapsDir(leg.va, leg.vb, leg.mode)} target="_blank" rel="noreferrer">
                    gmaps ↗
                  </a>
                  <button className="leg-add" onClick={() => onTravel && onTravel(leg)} title="Add a travel block to your calendar">
                    ＋ block
                  </button>
                </div>
              )}
              {free && (
                <div className="free-row">
                  <b>{Math.floor(free.gap / 60)}h{free.gap % 60 ? ` ${free.gap % 60}m` : ''}</b> open after this —{' '}
                  {effectiveVenue(free.from) ? `you'll be in ${effectiveVenue(free.from).hood}` : 'location flexible'}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </aside>
  );
}
