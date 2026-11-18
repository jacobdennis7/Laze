import { useEffect, useMemo, useState } from 'react';
import { parseMessage, rankWindows, rankSlots, fmtSlotTime, localMinutes, nearestCafe } from './suggest.js';
import { fmtDayLong, fmtDayShort } from './time.js';

// PROTOTYPE — Suggest as a mode ("ghost mode"): candidate meeting times are
// drawn in place on the calendar and map instead of listed in a pop-up.
// Everything here sits on the same engine the pop-up uses (rankWindows /
// rankSlots), so working hours, buffers, overrides and message hints apply.
//
// One model, three kinds of thing on the calendar:
//   windows   — free stretches (a quiet wash: "you can click here")
//   suggested — the engine's best few times, never overlapping each other
//               or anything picked; what the reply offers until you pick
//   picked    — times the user chose (never overlapping, capped, in date order)

export const MAX_PICKS = 3;
const MAX_SUGGESTED = 3;
// start-of-meeting ranges, minutes from midnight
const DAYPART = { morning: [8 * 60, 12 * 60], afternoon: [12 * 60, 17 * 60], evening: [17 * 60, 21 * 60] };

export function useGhost(range, dataVersion) {
  const [on, setOn] = useState(false);
  const [cfg, setCfg] = useState({ duration: 45, them: null, msg: '' });
  const [picks, setPicks] = useState([]); // slot ids (start time, epoch ms)
  const [nudge, setNudge] = useState(0); // bumps when a click is refused at the cap

  // A pick is a specific time of a specific length in a specific range —
  // change either and the old picks no longer mean what the user chose.
  useEffect(() => { setPicks([]); }, [cfg.duration, range.start, range.end]);

  const model = useMemo(() => {
    if (!on) return null;
    const hints = cfg.msg.trim() ? parseMessage(cfg.msg) : null;
    const { windows, missedAsk } = rankWindows({
      start: range.start, end: range.end, them: cfg.them, durationMin: cfg.duration, hints,
    });
    const durMs = cfg.duration * 60000;

    // Every viable start, best first, with where it sits on the calendar grid.
    let slots = rankSlots(windows, cfg.duration).map(({ w, ms }) => {
      const startMin = localMinutes(ms, w.offset);
      const from = fmtSlotTime(ms, w.offset);
      const to = fmtSlotTime(ms + durMs, w.offset);
      const range12 = `${from}–${to}`;
      // On the grid a column can be ~100px wide, so say am/pm once when both
      // ends share it: "3–3:45pm", but "11:30am–12:15pm".
      const compact = from.slice(-2) === to.slice(-2) ? `${from.slice(0, -2)}–${to}` : range12;
      return {
        id: ms, ms, w, day: w.day,
        startMin, endMin: startMin + cfg.duration,
        short: compact,
        label: `${fmtDayLong(w.day)}, ${range12}`,
        chip: `${fmtDayShort(w.day)} ${fmtSlotTime(ms, w.offset)}`,
        detourMin: w.detourMin,
      };
    });

    // "Thursday afternoon" means the meeting starts in the afternoon. The
    // engine only keeps free stretches that touch the asked part of the day,
    // which would still offer 10:30am out of a 10am–2:30pm stretch.
    if (hints?.dayparts?.length) {
      const inPart = slots.filter((s) =>
        hints.dayparts.some((p) => s.startMin >= DAYPART[p][0] && s.startMin < DAYPART[p][1])
      );
      if (inPart.length) slots = inPart;
    }

    // The wash covers exactly where a meeting can go: from the first viable
    // start to the last viable end of each free stretch — never a ragged raw
    // edge like 1:04pm, and nothing where a click couldn't place a time.
    const wins = windows
      .map((w) => {
        const mine = slots.filter((s) => s.w === w);
        if (!mine.length) return null;
        return {
          w, day: w.day,
          startMin: Math.min(...mine.map((s) => s.startMin)),
          endMin: Math.max(...mine.map((s) => s.endMin)),
        };
      })
      .filter(Boolean);

    const cafe = nearestCafe(cfg.them, cfg.them && cfg.them.lat > 39 ? 'NYC' : 'SF');
    return { windows: wins, slots, missedAsk, hints, cafe };
    // dataVersion re-runs this after a sync or a settings/override change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, cfg, range, dataVersion]);

  const durMs = cfg.duration * 60000;
  const clash = (a, b) => a.ms < b.ms + durMs && b.ms < a.ms + durMs;

  const slots = model?.slots || [];
  const picked = slots.filter((s) => picks.includes(s.id)).sort((a, b) => a.ms - b.ms);
  const overlapsPick = (s) => picked.some((p) => p.id !== s.id && clash(p, s));
  const atLimit = picked.length >= MAX_PICKS;

  const suggested = [];
  for (const s of slots) {
    if (suggested.length >= MAX_SUGGESTED) break;
    if (picks.includes(s.id) || overlapsPick(s) || suggested.some((t) => clash(t, s))) continue;
    suggested.push(s);
  }
  suggested.sort((a, b) => a.ms - b.ms); // chosen by rank, offered in date order

  function toggle(id) {
    if (picks.includes(id)) {
      setPicks((p) => p.filter((x) => x !== id));
      return;
    }
    const s = slots.find((x) => x.id === id);
    if (!s || overlapsPick(s)) return; // never stack one time on another
    if (atLimit) {
      setNudge((n) => n + 1); // say so, rather than silently dropping an earlier pick
      return;
    }
    // drop ids that no longer exist so they can't count toward the cap
    setPicks((p) => [...p.filter((x) => slots.some((y) => y.id === x)), id]);
  }

  return {
    on,
    enter: () => setOn(true),
    exit: () => { setOn(false); setPicks([]); },
    cfg,
    set: (patch) => setCfg((c) => ({ ...c, ...patch })),
    picks,
    picked,
    suggested,
    atLimit,
    nudge,
    overlapsPick,
    toggle,
    windows: model?.windows || [],
    slots,
    missedAsk: model?.missedAsk || false,
    hints: model?.hints || null,
    cafe: model?.cafe || null,
  };
}
