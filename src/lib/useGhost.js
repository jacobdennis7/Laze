import { useMemo, useState } from 'react';
import { parseMessage, rankWindows, rankSlots, fmtSlotTime, localMinutes, nearestCafe } from './suggest.js';
import { fmtDayLong, fmtDayShort } from './time.js';

// PROTOTYPE — Suggest as a mode ("ghost mode"): candidate meeting times are
// drawn in place on the calendar and map instead of listed in a pop-up.
// Everything here sits on the same engine the pop-up uses (rankWindows /
// rankSlots), so working hours, buffers, overrides and message hints apply.

// The three visual treatments being compared.
export const GHOST_LOOKS = [
  ['windows', 'Open windows'],
  ['slots', 'Every slot'],
  ['top', 'Top picks'],
];

const MAX_PICKS = 3;

export function useGhost(range, dataVersion) {
  const [on, setOn] = useState(false);
  const [cfg, setCfg] = useState({ look: 'windows', duration: 45, them: null, msg: '', topN: 6 });
  const [picks, setPicks] = useState([]); // slot ids (start time, epoch ms)

  const model = useMemo(() => {
    if (!on) return null;
    const hints = cfg.msg.trim() ? parseMessage(cfg.msg) : null;
    const { windows, missedAsk } = rankWindows({
      start: range.start, end: range.end, them: cfg.them, durationMin: cfg.duration, hints,
    });
    const durMs = cfg.duration * 60000;

    // Every viable start, best first, with where it sits on the calendar grid.
    const slots = rankSlots(windows, cfg.duration).map(({ w, ms }, rank) => {
      const startMin = localMinutes(ms, w.offset);
      const range12 = `${fmtSlotTime(ms, w.offset)}–${fmtSlotTime(ms + durMs, w.offset)}`;
      return {
        id: ms, ms, w, day: w.day, rank,
        startMin, endMin: startMin + cfg.duration,
        short: range12,
        label: `${fmtDayLong(w.day)}, ${range12}`,
        chip: `${fmtDayShort(w.day)} ${fmtSlotTime(ms, w.offset)}`,
        detourMin: w.detourMin,
      };
    });

    const wins = windows.map((w) => ({
      w, day: w.day,
      startMin: localMinutes(w.s, w.offset),
      endMin: localMinutes(w.s, w.offset) + Math.round((w.e - w.s) / 60000),
      label: `${fmtSlotTime(w.s, w.offset)}–${fmtSlotTime(w.e, w.offset)}`,
    }));

    // "Top picks": the best-ranked times that don't overlap one another.
    const top = [];
    for (const s of slots) {
      if (top.length >= cfg.topN) break;
      if (top.some((t) => t.day === s.day && s.ms < t.ms + durMs && t.ms < s.ms + durMs)) continue;
      top.push(s);
    }

    const cafe = nearestCafe(cfg.them, cfg.them && cfg.them.lat > 39 ? 'NYC' : 'SF');
    return { windows: wins, slots, top, missedAsk, hints, cafe };
    // dataVersion re-runs this after a sync or a settings/override change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, cfg, range, dataVersion]);

  const picked = model ? model.slots.filter((s) => picks.includes(s.id)) : [];

  return {
    on,
    enter: () => setOn(true),
    exit: () => { setOn(false); setPicks([]); },
    cfg,
    set: (patch) => setCfg((c) => ({ ...c, ...patch })),
    picks,
    picked,
    toggle: (id) =>
      setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-MAX_PICKS))),
    clearPicks: () => setPicks([]),
    windows: model?.windows || [],
    slots: model?.slots || [],
    top: model?.top || [],
    missedAsk: model?.missedAsk || false,
    hints: model?.hints || null,
    cafe: model?.cafe || null,
  };
}
