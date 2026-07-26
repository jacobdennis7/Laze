import React, { useState, useEffect, useRef } from 'react';
import { PRESETS } from '../data/events.js';
import { parseDay, dayStr, addDays, daySpan, fmtRange, monthLabel } from '../lib/time.js';

const MAX_DAYS = 7;

export default function RangePicker({ range, onChange }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = parseDay(range.start);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [pending, setPending] = useState(null); // first click of a new range
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const nights = daySpan(range.start, range.end) + 1;

  function clickDay(d) {
    if (!pending) {
      setPending(d);
    } else {
      let a = pending, b = d;
      if (b < a) [a, b] = [b, a];
      if (daySpan(a, b) + 1 > MAX_DAYS) b = addDays(a, MAX_DAYS - 1);
      onChange({ start: a, end: b });
      setPending(null);
      setOpen(false);
    }
  }

  function preset(start, end) {
    onChange({ start, end });
    setPending(null);
    setOpen(false);
  }

  // build month grid
  const first = new Date(month.y, month.m, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(dayStr(new Date(month.y, month.m, d)));
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const selStart = pending || range.start;
  const selEnd = pending ? pending : range.end;

  return (
    <div className="popover-wrap" ref={ref}>
      <button className="range-btn" onClick={() => setOpen(!open)} aria-haspopup="dialog" aria-expanded={open}>
        <svg className="cal-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        {fmtRange(range.start, range.end)}
        <span className="nights">{nights} day{nights > 1 ? 's' : ''}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
      </button>

      {open && (
        <div className="popover" role="dialog" aria-label="Choose date range">
          <div className="pop-head">
            <button onClick={() => setMonth((m) => (m.m === 0 ? { y: m.y - 1, m: 11 } : { y: m.y, m: m.m - 1 }))} aria-label="Previous month">‹</button>
            <span className="mo">{monthLabel(month.y, month.m)}</span>
            <button onClick={() => setMonth((m) => (m.m === 11 ? { y: m.y + 1, m: 0 } : { y: m.y, m: m.m + 1 }))} aria-label="Next month">›</button>
          </div>
          <div className="dow-row">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i}>{d}</span>)}
          </div>
          {weeks.map((w, wi) => (
            <div className="week-row" key={wi}>
              {w.map((d, di) => {
                if (!d) return <button key={di} disabled />;
                const inR = !pending && d >= range.start && d <= range.end;
                const isStart = d === selStart && (pending || d === range.start);
                const isEnd = !pending && d === range.end;
                const cls = [
                  inR && !isStart && !isEnd ? 'inRange' : '',
                  isStart || isEnd ? 'edge' : '',
                  isStart && isEnd ? 'single' : isStart ? 'start' : isEnd ? 'end' : '',
                ].join(' ');
                return (
                  <button key={di} className={cls} onClick={() => clickDay(d)}>
                    {parseDay(d).getDate()}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="pop-presets">
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => preset(p.start, p.end)}>{p.label}</button>
            ))}
          </div>
          <div className="pop-hint">
            {pending ? 'Now pick an end date (max 7 days).' : 'Click a start date, then an end date — or grab a preset.'}
          </div>
        </div>
      )}
    </div>
  );
}
