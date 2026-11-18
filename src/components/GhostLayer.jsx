import React, { useState } from 'react';
import { PX_PER_MIN, yFor } from '../lib/calgrid.js';

// PROTOTYPE — suggested meeting times drawn over one day column of the
// calendar. Three looks are being compared (ghost.cfg.look):
//   windows — each open stretch is one soft block; move over it and a
//             meeting-sized outline follows, click to drop a time there
//   slots   — every viable start is its own row, like a booking page laid
//             over your own calendar
//   top     — only the best few times, numbered, nothing else marked
// Picked times look the same in all three.

const spanStyle = (startMin, endMin) => ({
  top: yFor(startMin),
  height: Math.max((endMin - startMin) * PX_PER_MIN - 2, 14),
});

function Detour({ s }) {
  return s.detourMin > 5 ? <span className="g-detour"> · +{s.detourMin}m</span> : null;
}

// One open stretch. The outline snaps to the nearest viable start.
function GhostWindow({ win, slots, ghost }) {
  const [hoverId, setHoverId] = useState(null);
  if (!slots.length) return null;

  function slotAt(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    // centre the meeting on the pointer
    const min = win.startMin + (e.clientY - rect.top) / PX_PER_MIN - ghost.cfg.duration / 2;
    return slots.reduce((best, s) => (Math.abs(s.startMin - min) < Math.abs(best.startMin - min) ? s : best));
  }
  const hover = slots.find((s) => s.id === hoverId && !ghost.picks.includes(s.id));

  return (
    <div
      className="g-window"
      style={spanStyle(win.startMin, win.endMin)}
      onMouseMove={(e) => setHoverId(slotAt(e).id)}
      onMouseLeave={() => setHoverId(null)}
      onClick={(e) => ghost.toggle(slotAt(e).id)}
      role="button"
      aria-label={`Open ${win.label}. Click to suggest a time here.`}
    >
      <span className="g-window-label">Open {win.label}</span>
      {hover && (
        <span
          className="g-outline"
          style={{
            top: (hover.startMin - win.startMin) * PX_PER_MIN,
            height: ghost.cfg.duration * PX_PER_MIN - 2,
          }}
        >
          ＋ {hover.short}<Detour s={hover} />
        </span>
      )}
    </div>
  );
}

export default function GhostLayer({ day, ghost }) {
  const { look } = ghost.cfg;
  const daySlots = ghost.slots.filter((s) => s.day === day);
  const picked = ghost.picked.filter((s) => s.day === day);
  const isPicked = (s) => ghost.picks.includes(s.id);

  return (
    <>
      {look === 'windows' &&
        ghost.windows
          .filter((w) => w.day === day)
          .map((win) => (
            <GhostWindow key={win.w.s} win={win} slots={daySlots.filter((s) => s.w === win.w)} ghost={ghost} />
          ))}

      {look === 'slots' &&
        daySlots.filter((s) => !isPicked(s)).map((s) => (
          <button
            key={s.id}
            className="g-cell"
            style={{ top: yFor(s.startMin), height: 30 * PX_PER_MIN - 2 }}
            onClick={() => ghost.toggle(s.id)}
            title={`Suggest ${s.label}`}
          >
            <span className="g-cell-time">{s.short.split('–')[0]}</span>
            {/* the full meeting length, shown while pointing at a start */}
            <span className="g-cell-span" style={{ height: ghost.cfg.duration * PX_PER_MIN - 2 }}>
              ＋ {s.short}<Detour s={s} />
            </span>
          </button>
        ))}

      {look === 'top' &&
        ghost.top.filter((s) => s.day === day && !isPicked(s)).map((s) => (
          <button
            key={s.id}
            className="g-top"
            style={spanStyle(s.startMin, s.endMin)}
            onClick={() => ghost.toggle(s.id)}
            title={`Suggest ${s.label}`}
          >
            <span className="g-rank">{ghost.top.indexOf(s) + 1}</span>
            {s.short}<Detour s={s} />
          </button>
        ))}

      {picked.map((s) => (
        <button
          key={`p${s.id}`}
          className="g-picked"
          style={spanStyle(s.startMin, s.endMin)}
          onClick={() => ghost.toggle(s.id)}
          title={`${s.label} — click to remove`}
        >
          ✓ {s.short}<Detour s={s} />
        </button>
      ))}
    </>
  );
}
