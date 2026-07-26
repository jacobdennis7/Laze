import React from 'react';
import { GIDS, CAL_EMAILS, PERSONAL_IDS, HOOD_COLORS } from '../data/events.js';
import { venueOf, gmapsPlace } from '../lib/geo.js';
import { fmtTime, fmtDayLong } from '../lib/time.js';

function gcalLink(ev) {
  if (ev.htmlLink) return ev.htmlLink; // live-synced events carry it
  const gid = ev.gid || GIDS[ev.id];
  if (!gid) return null;
  const email = ev.calId || CAL_EMAILS[PERSONAL_IDS.has(ev.id) ? 'personal' : 'work'];
  const eid = btoa(`${gid} ${email}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `https://www.google.com/calendar/event?eid=${eid}`;
}

export default function EventModal({ ev, onClose }) {
  const v = venueOf(ev);
  const color = v ? HOOD_COLORS[v.hood] || '#5a6572' : ev.virtual ? '#8C929C' : '#C0473E';
  const gcal = gcalLink(ev);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal">
        <div className="modal-card" style={{ width: 'min(440px, 100%)' }} role="dialog" aria-label={ev.title}>
          <div className="modal-head" style={{ borderLeft: `5px solid ${color}` }}>
            <h2>{ev.title}{ev.org ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {ev.org}</span> : null}</h2>
            <button className="x-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div className="modal-col" style={{ paddingTop: 14 }}>
            <div className="field">
              <label>When</label>
              <div>{fmtDayLong(ev.day)} · {fmtTime(ev.start)} – {ev.endDisplay || fmtTime(ev.end)}</div>
            </div>
            <div className="field">
              <label>Where</label>
              <div>
                {v && !ev.tbd ? (
                  <>
                    {v.name} · {v.hood}
                    <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>{v.address}</div>
                  </>
                ) : ev.virtual ? (
                  'Video call — no travel'
                ) : (
                  <>
                    <span style={{ color: 'var(--alert)' }}>No location yet — use Suggest to pick a spot</span>
                    {ev.locationText && (
                      <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>Calendar says: “{ev.locationText}”</div>
                    )}
                  </>
                )}
              </div>
            </div>
            {ev.note && (
              <div className="field">
                <label>Heads-up</label>
                <div style={{ color: 'var(--warn)' }}>⚑ {ev.note}</div>
              </div>
            )}
            <div className="copy-row" style={{ marginTop: 4, flexWrap: 'wrap' }}>
              {gcal && (
                <a className="pill-btn primary" style={{ textDecoration: 'none' }} href={gcal} target="_blank" rel="noreferrer">
                  Open in Google Calendar ↗
                </a>
              )}
              {v && (
                <a className="pill-btn" style={{ textDecoration: 'none' }} href={gmapsPlace(v)} target="_blank" rel="noreferrer">
                  Venue in Maps ↗
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
