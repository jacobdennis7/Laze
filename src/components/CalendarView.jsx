import React, { useEffect, useRef, useState } from 'react';
import { HOOD_COLORS, BANNERS } from '../data/events.js';
import { eventsForDay, dayLegs } from '../lib/schedule.js';
import { venueOf, MODE_ICON } from '../lib/geo.js';
import { calColor } from '../lib/colors.js';
import { DAY_START, DAY_END, PX_PER_MIN, yFor } from '../lib/calgrid.js';
import { eachDay, minutesOfDay, fmtTimeShort, fmtDayTiny, fmtDayShort } from '../lib/time.js';
import GhostLayer from './GhostLayer.jsx';

// Greedy column packing for overlapping events.
function packColumns(evs) {
  const sorted = [...evs].sort((a, b) => minutesOfDay(a.start) - minutesOfDay(b.start));
  const cols = [];
  const placed = [];
  for (const ev of sorted) {
    const s = minutesOfDay(ev.start);
    let col = 0;
    while (cols[col] !== undefined && cols[col] > s) col++;
    cols[col] = minutesOfDay(ev.end);
    placed.push({ ev, col });
  }
  const nCols = cols.length;
  return placed.map((p) => ({ ...p, nCols }));
}

const SPANS = [[1, 'Day'], [3, '3 days'], [7, 'Week'], [0, 'Full range']];

export default function CalendarView({ range, mode, onSelect, onTravel, ghost }) {
  const allDays = eachDay(range.start, range.end);
  // View span: how many of the range's days show at once. Phones default to
  // 3 days (like the Google Calendar app); desktop shows the whole range.
  const [span, setSpan] = useState(() => {
    try {
      const s = localStorage.getItem('laze-cal-span');
      if (s !== null) return +s;
    } catch { /* private mode */ }
    return typeof window !== 'undefined' && window.innerWidth < 720 ? 3 : 0;
  });
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [range.start, range.end]);
  const n = span === 0 ? allDays.length : Math.min(span, allDays.length);
  const maxOff = Math.max(0, allDays.length - n);
  const off = Math.min(offset, maxOff);
  const days = allDays.slice(off, off + n);
  function pickSpan(v) {
    setSpan(v);
    setOffset(0);
    try { localStorage.setItem('laze-cal-span', String(v)); } catch { /* ignore */ }
  }

  // PROTOTYPE (suggest mode): on entering, bring the first open time into view
  // rather than leaving the user looking at empty early-morning rows.
  const wrapRef = useRef(null);
  const suggesting = !!ghost;
  useEffect(() => {
    if (!suggesting || !wrapRef.current || !ghost.windows.length) return;
    const first = Math.min(...ghost.windows.map((w) => w.startMin));
    wrapRef.current.scrollTop = Math.max(0, yFor(first) - 28);
    // only when the mode turns on — not on every pick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggesting]);

  const height = (DAY_END - DAY_START) * PX_PER_MIN;
  const hours = [];
  for (let h = Math.ceil(DAY_START / 60); h <= Math.floor(DAY_END / 60); h++) hours.push(h);
  // 100px keeps a 7-day week on screen at tablet/half-window widths; at 120px
  // the last day was pushed off the right edge behind a scrollbar.
  const gridCols = `56px repeat(${days.length}, minmax(100px, 1fr))`;

  const banners = BANNERS.filter((b) => b.from <= range.end && b.to >= range.start);

  return (
    <div ref={wrapRef} className={`cal-wrap${ghost ? ' suggesting' : ''}`}>
      <div className="cal-toolbar">
        <button className="cal-nav" disabled={off === 0} onClick={() => setOffset(Math.max(0, off - n))} aria-label="Earlier days">‹</button>
        <select value={span} onChange={(e) => pickSpan(+e.target.value)} aria-label="Calendar view span">
          {SPANS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="cal-nav" disabled={off >= maxOff} onClick={() => setOffset(Math.min(maxOff, off + n))} aria-label="Later days">›</button>
        <span className="cal-range-note">
          {fmtDayShort(days[0])}{days.length > 1 ? ` – ${fmtDayShort(days[days.length - 1])}` : ''}
        </span>
      </div>
      <div className="cal-headrow" style={{ gridTemplateColumns: gridCols }}>
        <div />
        {days.map((d) => {
          const t = fmtDayTiny(d);
          return (
            <div className="cal-daylabel" key={d}>
              <div className="wd">{t.wd}</div>
              <div className="num">{t.num}</div>
            </div>
          );
        })}
        {banners.length > 0 && (
          <div className="cal-banner">
            {banners.map((b, i) => (
              <span key={i}>{b.label}</span>
            ))}
          </div>
        )}
      </div>

      <div className="cal-body" style={{ gridTemplateColumns: gridCols, height }}>
        <div className="cal-gutter">
          {hours.map((h) => (
            <span key={h} style={{ top: yFor(h * 60) }}>
              {h % 12 === 0 ? 12 : h % 12} {h >= 12 ? 'PM' : 'AM'}
            </span>
          ))}
        </div>
        {days.map((d) => {
          const evs = eventsForDay(d).filter((e) => e.kind !== 'flight' || true);
          const packed = packColumns(evs);
          const legs = dayLegs(d, mode);
          return (
            <div className="cal-col" key={d}>
              {hours.map((h) => (
                <div className="cal-hourline" key={h} style={{ top: yFor(h * 60) }} />
              ))}
              {ghost && <GhostLayer day={d} ghost={ghost} />}
              {packed.map(({ ev, col, nCols }) => {
                const s = minutesOfDay(ev.start);
                let e = minutesOfDay(ev.end);
                if (e <= s) e = Math.min(s + 60, DAY_END); // crosses midnight/ET end — clamp
                const v = venueOf(ev);
                // Identity color per calendar (like Google Calendar); demo
                // snapshot events have no calId and keep the venue palette.
                const color = calColor(ev) || (v ? HOOD_COLORS[v.hood] : ev.tbd ? '#a8574e' : '#8C929C');
                const w = 100 / nCols;
                const title = `${ev.title}${ev.org ? ' · ' + ev.org : ''}\n${fmtTimeShort(ev.start)}–${fmtTimeShort(ev.end)}\n${v && !ev.tbd ? v.name + ' — ' + v.hood : ev.virtual ? 'Virtual' : ev.tbd ? 'No location yet' : ev.locationText || 'No location'}`;
                return (
                  <button
                    key={ev.id}
                    className={`cal-ev${ev.virtual ? ' virtual' : ''}${ev.tbd && !ev.virtual && !ev.skipped ? ' tbd-ev' : ''}${ev.homeCity || ev.skipped ? ' ny-ev' : ''}${ev.kind === 'hold' ? ' hold-ev' : ''}`}
                    style={{
                      top: yFor(s),
                      height: Math.max((e - s) * PX_PER_MIN - 2, 17),
                      left: `calc(${col * w}% + 2px)`,
                      width: `calc(${w}% - 5px)`,
                      // virtual = tint of its calendar color, not washed-out white
                      ...(ev.virtual
                        ? { background: `${color}1f`, color, borderLeftColor: color }
                        : { background: color }),
                    }}
                    title={title}
                    onClick={() => onSelect && onSelect(ev)}
                  >
                    <span className="t">{fmtTimeShort(ev.start)} </span>
                    {ev.kind === 'flight' ? '✈ ' : ev.virtual ? '▶ ' : ''}
                    {ev.title}
                    {ev.tbd && !ev.virtual ? ' · TBD' : ''}
                  </button>
                );
              })}
              {legs
                .filter((l) => l.gapMin >= 0 && l.gapMin <= 90 && l.from.kind !== 'flight' && l.to.kind !== 'flight')
                .map((l, i) => {
                  const mid = (minutesOfDay(l.from.end) + minutesOfDay(l.to.start)) / 2;
                  return (
                    <div className={`cal-travel${l.tight ? ' tight' : ''}`} key={i} style={{ top: yFor(mid) - 8 }}>
                      {l.intercity ? (
                        <button disabled title="These two are in different cities">
                          {l.km > 500 ? '✈' : '🚆'} other city{l.tight ? ` / ${l.gapMin}m gap` : ''}
                        </button>
                      ) : (
                        <button
                          onClick={() => onTravel && onTravel(l, d)}
                          title="Add a travel block to your calendar"
                        >
                          {MODE_ICON[l.mode]} {l.mins}m{l.tight ? ` / ${l.gapMin}m gap` : ''}
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
