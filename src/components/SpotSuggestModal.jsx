import React, { useMemo } from 'react';
import { freeWindows } from '../lib/schedule.js';
import { proposeStart, fmtSlotTime } from '../lib/suggest.js';
import { gcalTemplate } from '../lib/geo.js';
import { fmtDayLong } from '../lib/time.js';

const TYPE_TITLE = { cafe: 'Coffee', restaurant: 'Lunch', bar: 'Drinks' };

export default function SpotSuggestModal({ spot, day, onClose }) {
  const windows = useMemo(() => freeWindows(day, day, { minMinutes: 45 }), [day]);
  const duration = spot.type === 'cafe' ? 45 : 60;

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
            {rows.length === 0 && <div className="empty-note">No open windows left this day — pick another day first.</div>}
            <div className="slot-list">
              {rows.map((r) => (
                <a key={r.key} className="slot-item" href={r.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                  <div>
                    <div className="when">{r.label}</div>
                    <div className="why">{r.context}</div>
                  </div>
                  <span className="det">create ↗</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
