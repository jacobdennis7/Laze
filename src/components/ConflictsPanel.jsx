import React from 'react';
import { fmtDayShort } from '../lib/time.js';

export default function ConflictsPanel({ conflicts, onClose }) {
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="Conflicts and warnings">
        <div className="sheet-head">
          <h2>Conflicts &amp; warnings</h2>
          <button className="x-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="sheet-scroll">
          {conflicts.length === 0 && <div className="empty-note">Nothing flagged in this range. Clean schedule.</div>}
          {conflicts.map((c, i) => (
            <div className={`conf-card ${c.severity}`} key={i}>
              <div className="conf-meta">
                <span className="sev">{c.severity === 'high' ? 'Fix now' : c.severity === 'med' ? 'Heads-up' : 'Tidy'}</span>
                <span>{c.type}</span>
                <span>{fmtDayShort(c.day)}</span>
              </div>
              <div className="conf-title">{c.title}</div>
              <div className="conf-detail">{c.detail}</div>
              <div className="conf-fix"><b>Fix:</b> {c.fix}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
