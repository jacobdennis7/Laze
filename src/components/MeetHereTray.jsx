import React, { useEffect, useState } from 'react';
import { gcalTemplate } from '../lib/geo.js';
import { placeEventTitle } from '../lib/suggest.js';
import { placeLabel as labelFor } from '../lib/useGhost.js';
import { eachDay, fmtDayShort } from '../lib/time.js';
import { track } from '../lib/analytics.js';

// PROTOTYPE — the bar for "Meet here": the place is already chosen (from map
// search or a spot), so the job is to pick the day and time and create the
// event. Same canvas as Suggest — green on the calendar, the place on the
// map — but one chosen time and a create button instead of a reply.

const DUR = [30, 45, 60, 90];

export default function MeetHereTray({ ghost, view, range, onCalendar }) {
  const { cfg, picked } = ghost;
  const place = cfg.them;
  const pick = picked[0] || null;

  const days = eachDay(range.start, range.end);
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherDay, setOtherDay] = useState(days[0]);
  const [otherTime, setOtherTime] = useState('10:00');
  const [created, setCreated] = useState(false);
  useEffect(() => setCreated(false), [pick?.id, pick?.ms, cfg.duration]);

  const placeLabel = labelFor(place);
  // "Name, address" unless the address already starts with the name.
  const location = !place.address || place.address === place.name
    ? place.name
    : place.address.startsWith(place.name) ? place.address : `${place.name}, ${place.address}`;

  let createUrl = null;
  if (pick) {
    createUrl = gcalTemplate({
      title: placeEventTitle({ ...place, name: placeLabel }, Math.floor(pick.startMin / 60)),
      location,
      details: 'Scheduled via Laze',
      startMs: pick.ms,
      endMs: pick.ms + cfg.duration * 60000,
      offset: pick.w.offset,
    });
  }

  function applyOtherTime() {
    const [h, m] = otherTime.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    ghost.setCustomTime(days.includes(otherDay) ? otherDay : days[0], h * 60 + m);
    setOtherOpen(false);
  }

  let status;
  if (pick) {
    status = (
      <>
        <span className="g-chosen">
          ✓ {pick.label}
          {!pick.custom && (pick.detourMin > 5 ? ` · +${pick.detourMin} min travel` : ' · on your way')}
        </span>
        {pick.clash && <span className="g-warn">⚠ overlaps “{pick.clash}”</span>}
        {created ? (
          <span className="g-status-text">Opened in Google Calendar — save it there, then Sync to see it here.</span>
        ) : (
          <span className="g-status-text">
            {view === 'map' ? 'Shown in this day’s route.' : 'Click another green time to move it.'}
          </span>
        )}
        {!created && view === 'map' && (
          <button className="g-link" onClick={onCalendar}>Change in calendar</button>
        )}
        <button className="g-link" onClick={ghost.clearPicks}>Clear</button>
      </>
    );
  } else if (view === 'map') {
    status = (
      <>
        <span className="g-status-text">No time chosen yet.</span>
        <button className="g-link" onClick={onCalendar}>See it in your calendar to choose one</button>
      </>
    );
  } else if (!ghost.slots.length) {
    status = <span className="g-status-text">No open time in this range for a {cfg.duration}-minute meeting.</span>;
  } else {
    status = (
      <span className="g-status-text">
        Green is when you’re {ghost.rule}. Click a time to choose it — the dashed ones take you least out of your way.
      </span>
    );
  }

  return (
    <section className="g-tray" aria-label="Schedule a meeting at this place">
      <div className="g-tray-bar">
        <span className="g-tray-title">Meet at</span>
        <span className="g-place" title={location}><span>{placeLabel}</span></span>
        <div className="tone-seg g-seg" aria-label="Meeting length">
          {DUR.map((d) => (
            <button key={d} className={cfg.duration === d ? 'on' : ''} onClick={() => ghost.set({ duration: d })}>{d}m</button>
          ))}
        </div>
        <div className="g-tray-actions">
          <button className="g-link" onClick={ghost.toSuggest} title="Keep this place, but pick several times and send them as a reply">
            Offer several times instead
          </button>
          {createUrl ? (
            <a
              className="pill-btn primary"
              href={createUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => { setCreated(true); track('spot_event_created', { surface: 'ghost', custom_time: !!pick.custom }); }}
            >
              Create in Google Calendar ↗
            </a>
          ) : (
            <span className="pill-btn primary" aria-disabled="true" title="Choose a time first">Create in Google Calendar ↗</span>
          )}
          <button className="x-btn" onClick={ghost.exit} aria-label="Close" title="Close">✕</button>
        </div>
      </div>

      <div className="g-tray-status" aria-live="polite">
        {status}
        {otherOpen ? (
          <span className="g-other">
            <select value={days.includes(otherDay) ? otherDay : days[0]} onChange={(e) => setOtherDay(e.target.value)} aria-label="Day">
              {days.map((d) => <option key={d} value={d}>{fmtDayShort(d)}</option>)}
            </select>
            <input type="time" step="900" value={otherTime} onChange={(e) => setOtherTime(e.target.value)} aria-label="Start time" />
            <button className="pill-btn" onClick={applyOtherTime}>Use this time</button>
            <button className="g-link" onClick={() => setOtherOpen(false)}>Cancel</button>
          </span>
        ) : (
          <button className="g-link" onClick={() => setOtherOpen(true)} title="Choose a time that isn’t green, such as outside your working hours">
            Other time…
          </button>
        )}
      </div>
    </section>
  );
}
