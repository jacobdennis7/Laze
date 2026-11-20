import React, { useState } from 'react';
import { DAY_START, DAY_END, PX_PER_MIN, yFor } from '../lib/calgrid.js';

// PROTOTYPE — suggested meeting times drawn over one day column.
//   free time   a quiet green wash; a meeting-sized outline follows the
//               pointer and a click drops a time exactly there
//   suggested   the engine's best few times, dashed — one click to take one
//   picked      solid; removed only via its ✕
//   blocked     hatched: time that looks empty but isn't offered (flights)
// A time can never be dropped on top of another, and nothing is ever removed
// except by its ✕ (here or on its chip in the bar).

const block = (startMin, endMin) => ({
  top: yFor(startMin),
  height: Math.max((endMin - startMin) * PX_PER_MIN - 2, 14),
});

const Detour = ({ s }) => (s.detourMin > 5 ? <span className="g-detour"> · +{s.detourMin}m</span> : null);

function FreeWindow({ win, slots, ghost }) {
  const [hoverId, setHoverId] = useState(null);
  // starts that are still placeable here
  const open = slots.filter((s) => !ghost.picks.includes(s.id) && !ghost.overlapsPick(s));

  // The time under the pointer is when the meeting would start (as in any
  // calendar), snapped to the nearest start that actually fits.
  function slotAt(e) {
    if (!open.length) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const min = win.startMin + (e.clientY - rect.top) / PX_PER_MIN - 6;
    const s = open.reduce((best, x) => (Math.abs(x.startMin - min) < Math.abs(best.startMin - min) ? x : best));
    return Math.abs(s.startMin - min) <= 45 ? s : null;
  }
  const hover = open.find((s) => s.id === hoverId);

  return (
    <div
      className="g-free"
      style={block(win.startMin, win.endMin)}
      onMouseMove={(e) => setHoverId(slotAt(e)?.id ?? null)}
      onMouseLeave={() => setHoverId(null)}
      onClick={(e) => { const s = slotAt(e); if (s) ghost.toggle(s.id); }}
    >
      {hover && (
        <span
          className="g-outline"
          style={{ top: (hover.startMin - win.startMin) * PX_PER_MIN, height: ghost.cfg.duration * PX_PER_MIN - 2 }}
        >
          ＋ {hover.short}<Detour s={hover} />
        </span>
      )}
    </div>
  );
}

export default function GhostLayer({ day, ghost }) {
  const daySlots = ghost.slots.filter((s) => s.day === day);

  return (
    <>
      {ghost.blocked
        .filter((b) => b.day === day)
        // only the part that falls inside the hours the grid shows
        .map((b) => ({ ...b, startMin: Math.max(b.startMin, DAY_START), endMin: Math.min(b.endMin, DAY_END) }))
        .filter((b) => b.endMin > b.startMin)
        .map((b) => (
          <div key={b.key} className="g-blocked" style={block(b.startMin, b.endMin)} title={`${b.label} — not offered`}>
            {(b.endMin - b.startMin) * PX_PER_MIN >= 26 ? `✈ ${b.label}` : ''}
          </div>
        ))}

      {ghost.windows
        .filter((w) => w.day === day)
        .map((win) => (
          <FreeWindow key={win.w.s} win={win} slots={daySlots.filter((s) => s.w === win.w)} ghost={ghost} />
        ))}

      {ghost.suggested.filter((s) => s.day === day).map((s) => (
        <button
          key={s.id}
          className="g-suggested"
          style={block(s.startMin, s.endMin)}
          onClick={() => ghost.toggle(s.id)}
          title={`Suggested: ${s.label} — click to add`}
        >
          {s.short}<Detour s={s} />
        </button>
      ))}

      {/* Removing takes a deliberate click on the ✕: a stray click on the block
          itself (easy to do while placing a neighbour) must not delete it. */}
      {ghost.picked.filter((s) => s.day === day).map((s) => (
        <div key={`p${s.id}`} className="g-picked" style={block(s.startMin, s.endMin)} title={s.label}>
          <span className="g-picked-label">✓ {s.short}<Detour s={s} /></span>
          <button className="g-x" onClick={() => ghost.toggle(s.id)} aria-label={`Remove ${s.label}`} title="Remove this time">✕</button>
        </div>
      ))}
    </>
  );
}
