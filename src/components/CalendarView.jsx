import React from 'react';
import { HOOD_COLORS, BANNERS } from '../data/events.js';
import { eventsForDay, dayLegs } from '../lib/schedule.js';
import { venueOf, MODE_ICON } from '../lib/geo.js';
import { eachDay, minutesOfDay, fmtTimeShort, fmtDayTiny } from '../lib/time.js';

const DAY_START = 6 * 60; // 6 AM
const DAY_END = 23 * 60; // 11 PM
const PX_PER_MIN = 44 / 60;

function yFor(min) {
  return (Math.max(min, DAY_START) - DAY_START) * PX_PER_MIN;
}

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

export default function CalendarView({ range, mode, onSelect, onTravel }) {
  const days = eachDay(range.start, range.end);
  const height = (DAY_END - DAY_START) * PX_PER_MIN;
  const hours = [];
  for (let h = Math.ceil(DAY_START / 60); h <= Math.floor(DAY_END / 60); h++) hours.push(h);
  const gridCols = `56px repeat(${days.length}, minmax(120px, 1fr))`;

  const banners = BANNERS.filter((b) => b.from <= range.end && b.to >= range.start);

  return (
    <div className="cal-wrap">
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
              {packed.map(({ ev, col, nCols }) => {
                const s = minutesOfDay(ev.start);
                let e = minutesOfDay(ev.end);
                if (e <= s) e = Math.min(s + 60, DAY_END); // crosses midnight/ET end — clamp
                const v = venueOf(ev);
                const color = v ? HOOD_COLORS[v.hood] : ev.tbd ? '#a8574e' : '#8C929C';
                const w = 100 / nCols;
                const title = `${ev.title}${ev.org ? ' · ' + ev.org : ''}\n${fmtTimeShort(ev.start)}–${fmtTimeShort(ev.end)}\n${v && !ev.tbd ? v.name + ' — ' + v.hood : ev.virtual ? 'Virtual' : ev.tbd ? 'No location yet' : ev.locationText || 'No location'}`;
                return (
                  <button
                    key={ev.id}
                    className={`cal-ev${ev.virtual ? ' virtual' : ''}${ev.tbd && !ev.virtual ? ' tbd-ev' : ''}${ev.homeCity ? ' ny-ev' : ''}`}
                    style={{
                      top: yFor(s),
                      height: Math.max((e - s) * PX_PER_MIN - 2, 17),
                      left: `calc(${col * w}% + 2px)`,
                      width: `calc(${w}% - 5px)`,
                      background: color,
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
                      <button
                        onClick={() => onTravel && onTravel(l, d)}
                        title="Add a travel block to your calendar"
                      >
                        {MODE_ICON[l.mode]} {l.mins}m{l.tight ? ` / ${l.gapMin}m gap` : ''}
                      </button>
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
