import React from 'react';
import { gcalTemplate, MODE_ICON, MODE_LABEL } from '../lib/geo.js';
import { fmtSlotTime } from '../lib/suggest.js';
import { fmtDayLong, fmtTime, toEpoch } from '../lib/time.js';

// Click a travel chip (map or calendar) → offer to put that travel time on the
// calendar as a real block. Never automatic — one tap per block, user's choice.
export default function TravelBlockModal({ leg, day, onClose }) {
  const offset = leg.to.start.slice(-6);
  const pad = Math.max(5, Math.ceil((leg.mins + 5) / 5) * 5); // travel + buffer, rounded to 5m
  const arriveEnd = toEpoch(leg.to.start);
  const arriveStart = arriveEnd - pad * 60000;
  const departStart = toEpoch(leg.from.end);
  const departEnd = departStart + pad * 60000;

  const title = `${MODE_ICON[leg.mode]} ${leg.va.hood} → ${leg.vb.hood}`;
  const details = `~${leg.mins} min ${MODE_LABEL[leg.mode]} · ${leg.va.name} → ${leg.vb.name} · via Laze`;
  const mk = (s, e) =>
    gcalTemplate({ title, location: leg.vb.address || leg.vb.name, details, startMs: s, endMs: e, offset });

  const rows = [
    {
      key: 'arrive',
      label: `${fmtSlotTime(arriveStart, offset)}–${fmtSlotTime(arriveEnd, offset)}`,
      sub: `Arrive on time — leave ${pad} min before ${leg.to.title}`,
      url: mk(arriveStart, arriveEnd),
    },
    {
      key: 'depart',
      label: `${fmtSlotTime(departStart, offset)}–${fmtSlotTime(departEnd, offset)}`,
      sub: `Head out right after ${leg.from.title}`,
      url: mk(departStart, departEnd),
    },
  ];

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal">
        <div className="modal-card" style={{ width: 'min(430px, 100%)' }} role="dialog" aria-label="Add travel block">
          <div className="modal-head">
            <h2>Block travel time</h2>
            <button className="x-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div className="modal-col" style={{ paddingTop: 12 }}>
            <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 13 }}>
              {fmtDayLong(day)} · {leg.from.title} ends {fmtTime(leg.from.end)}, {leg.to.title} starts{' '}
              {fmtTime(leg.to.start)} — about {leg.mins} min by {MODE_LABEL[leg.mode]}. Pick a version and
              Google Calendar opens prefilled.
            </p>
            <div className="slot-list">
              {rows.map((r) => (
                <a key={r.key} className="slot-item" href={r.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                  <div>
                    <div className="when">{r.label}</div>
                    <div className="why">{r.sub}</div>
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
