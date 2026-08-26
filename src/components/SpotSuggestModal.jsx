import React, { useMemo, useState } from 'react';
import { freeWindows, eventsForDay } from '../lib/schedule.js';
import { proposeStart, fmtSlotTime } from '../lib/suggest.js';
import { gcalTemplate } from '../lib/geo.js';
import { track } from '../lib/analytics.js';
import { fmtDayLong, toEpoch } from '../lib/time.js';

const TYPE_TITLE = { cafe: 'Coffee', restaurant: 'Lunch', bar: 'Drinks' };
const DURATIONS = [30, 45, 60, 90];

export default function SpotSuggestModal({ spot, day, onClose }) {
  const windows = useMemo(() => freeWindows(day, day, { minMinutes: 45 }), [day]);
  const duration = spot.type === 'cafe' ? 45 : 60;
  const [customTime, setCustomTime] = useState('10:00');
  const [customDur, setCustomDur] = useState(duration);

  // The day's UTC offset: from a free window, else any event that day, else the device.
  const offset = useMemo(() => {
    if (windows[0]) return windows[0].offset;
    const ev = eventsForDay(day)[0];
    if (ev) return ev.start.slice(-6);
    const mins = -new Date().getTimezoneOffset();
    const sign = mins < 0 ? '-' : '+';
    const a = Math.abs(mins);
    return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
  }, [windows, day]);

  const location = `${spot.name}${spot.address ? `, ${spot.address}` : ''}`;

  const custom = useMemo(() => {
    const startMs = new Date(`${day}T${customTime}:00${offset}`).getTime();
    if (Number.isNaN(startMs)) return null;
    const endMs = startMs + customDur * 60000;
    const hour = +customTime.slice(0, 2);
    const kind = spot.type === 'restaurant' && hour >= 17 ? 'Dinner' : TYPE_TITLE[spot.type] || 'Meet';
    const clash = eventsForDay(day).find(
      (e) => !e.homeCity && e.kind !== 'hold' && toEpoch(e.start) < endMs && startMs < toEpoch(e.end)
    );
    return {
      url: gcalTemplate({ title: `${kind} — ${spot.name}`, location, details: 'Scheduled via Laze', startMs, endMs, offset }),
      clash,
    };
  }, [day, customTime, customDur, offset, spot, location]);

  const rows = windows.slice(0, 4).map((w) => {
    const startMs = proposeStart(w, duration);
    const endMs = startMs + duration * 60000;
    const sign = w.offset[0] === '-' ? -1 : 1;
    const [oh, om] = w.offset.slice(1).split(':').map(Number);
    const localHour = new Date(startMs + sign * (oh * 60 + om) * 60000).getUTCHours();
    const kind = spot.type === 'restaurant' && localHour >= 17 ? 'Dinner' : TYPE_TITLE[spot.type] || 'Meet';
    const title = `${kind} — ${spot.name}`;
    const location = `${spot.name}${spot.address ? `, ${spot.address}` : ''}`;
    return {
      key: w.s,
      label: `${fmtSlotTime(startMs, w.offset)}–${fmtSlotTime(endMs, w.offset)}`,
      context: w.before || w.after
        ? `${w.before ? `after ${w.before.title}` : 'open morning'}${w.after ? `, before ${w.after.title}` : ''}`
        : 'fully open',
      url: gcalTemplate({ title, location, details: 'Scheduled via Laze', startMs, endMs, offset: w.offset }),
    };
  });

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal">
        <div className="modal-card" style={{ width: 'min(430px, 100%)' }} role="dialog" aria-label={`Suggest a time at ${spot.name}`}>
          <div className="modal-head">
            <h2>{spot.name}</h2>
            <button className="x-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div className="modal-col" style={{ paddingTop: 12 }}>
            <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 13 }}>
              Open windows on {fmtDayLong(day)} — pick one and Google Calendar opens prefilled with this spot as the location. Invite them from there.
            </p>
            {rows.length === 0 && <div className="empty-note">No open windows left this day — pick your own time below.</div>}
            <div className="slot-list">
              {rows.map((r) => (
                <a key={r.key} className="slot-item" href={r.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }} onClick={() => track('spot_event_created', { custom_time: false })}>
                  <div>
                    <div className="when">{r.label}</div>
                    <div className="why">{r.context}</div>
                  </div>
                  <span className="det">create ↗</span>
                </a>
              ))}
            </div>

            <div className="custom-slot">
              <label>Or pick your own time</label>
              <div className="custom-row">
                <input type="time" value={customTime} onChange={(e) => setCustomTime(e.target.value)} step="900" />
                <select value={customDur} onChange={(e) => setCustomDur(+e.target.value)}>
                  {DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
                </select>
                {custom && (
                  <a className="pill-btn primary" href={custom.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }} onClick={() => track('spot_event_created', { custom_time: true })}>
                    Create ↗
                  </a>
                )}
              </div>
              {custom?.clash && (
                <div className="clash-note">⚠ Overlaps “{custom.clash.title}” — creating anyway is up to you.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
