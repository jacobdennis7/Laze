import { useEffect, useMemo, useState } from 'react';
import { parseMessage, rankWindows, rankSlots, fmtSlotTime, localMinutes, nearestCafe } from './suggest.js';
import { eventsForDay, FLIGHT_PRE_MIN, FLIGHT_POST_MIN } from './schedule.js';
import { loadSettings } from './store.js';
import { eachDay, fmtDayLong, fmtDayShort, minutesOfDay } from './time.js';

// PROTOTYPE — Suggest as a mode ("ghost mode"): candidate meeting times are
// drawn in place on the calendar and map instead of listed in a pop-up.
// Everything here sits on the same engine the pop-up uses (rankWindows /
// rankSlots), so working hours, buffers, overrides and message hints apply.
//
// What ends up on the calendar:
//   windows   — free stretches (a quiet wash: "you can click here")
//   suggested — the engine's best few times, never overlapping each other
//               or anything picked; what the reply offers until you pick
//   picked    — times the user chose (never overlapping, any number, date order)
//   blocked   — time that looks empty but isn't offered (around a flight),
//               drawn so the gap in the green explains itself

const MAX_SUGGESTED = 3;
// Starts snap to a quarter-hour: on a half-hour grid a gap that fits the
// meeting exactly at :15 or :45 (common once buffers are carved out) offered
// nothing at all.
const STEP_MIN = 15;
// start-of-meeting ranges, minutes from midnight
const DAYPART = { morning: [8 * 60, 12 * 60], afternoon: [12 * 60, 17 * 60], evening: [17 * 60, 21 * 60] };

function clock(min) {
  const h = Math.floor(min / 60), m = min % 60;
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}`;
}

export function useGhost(range, dataVersion) {
  const [on, setOn] = useState(false);
  const [cfg, setCfg] = useState({ duration: 45, them: null, msg: '' });
  const [picks, setPicks] = useState([]); // slot ids (start time, epoch ms)

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
    let slots = rankSlots(windows, cfg.duration, STEP_MIN).map(({ w, ms }) => {
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

    // Time a flight blocks around itself. It isn't on the calendar as an
    // event, so without this the missing green there looks like a mistake.
    const blocked = [];
    for (const day of eachDay(range.start, range.end)) {
      for (const e of eventsForDay(day)) {
        if (e.kind !== 'flight' || e.skipped) continue;
        const s = minutesOfDay(e.start), en = minutesOfDay(e.end);
        blocked.push({ key: `${e.id}-pre`, day, startMin: s - FLIGHT_PRE_MIN, endMin: s, label: 'Getting to the airport' });
        // a flight landing after midnight has no same-day "after"
        if (en > s) blocked.push({ key: `${e.id}-post`, day, startMin: en, endMin: en + FLIGHT_POST_MIN, label: 'Leaving the airport' });
      }
    }

    // The rule behind the green, in the user's own settings, for the bar.
    const st = loadSettings();
    const rule = `free between ${clock(st.workStart)} and ${clock(st.workEnd)}${
      st.bufferMin ? `, with ${st.bufferMin} min kept clear around meetings` : ''
    }`;

    const cafe = nearestCafe(cfg.them, cfg.them && cfg.them.lat > 39 ? 'NYC' : 'SF');
    return { windows: wins, slots, blocked, rule, missedAsk, hints, cafe };
    // dataVersion re-runs this after a sync or a settings/override change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, cfg, range, dataVersion]);

  const durMs = cfg.duration * 60000;
  const clash = (a, b) => a.ms < b.ms + durMs && b.ms < a.ms + durMs;

  const slots = model?.slots || [];
  const picked = slots.filter((s) => picks.includes(s.id)).sort((a, b) => a.ms - b.ms);
  const overlapsPick = (s) => picked.some((p) => p.id !== s.id && clash(p, s));

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
    // drop ids that no longer exist while adding
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
    overlapsPick,
    toggle,
    clearPicks: () => setPicks([]),
    windows: model?.windows || [],
    slots,
    blocked: model?.blocked || [],
    rule: model?.rule || '',
    missedAsk: model?.missedAsk || false,
    hints: model?.hints || null,
    cafe: model?.cafe || null,
  };
}
