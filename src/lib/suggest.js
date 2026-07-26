import { CAFES } from '../data/events.js';
import { haversineKm, travelMinutes } from './geo.js';
import { freeWindows } from './schedule.js';
import { fmtDayLong } from './time.js';

// Light parser: pull weekday / date / daypart hints out of a pasted email or text.
const WEEKDAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };

export function parseMessage(text) {
  const t = text.toLowerCase();
  const hints = { weekdays: [], dates: [], dayparts: [], times: [] };
  for (const [w, n] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${w}\\b`).test(t) && !hints.weekdays.includes(n)) hints.weekdays.push(n);
  }
  const dateRe = /\b(\d{1,2})\/(\d{1,2})\b/g;
  let m;
  while ((m = dateRe.exec(t))) hints.dates.push(`2026-${String(+m[1]).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`);
  // Ordinals like "the 10th" — day-of-month, resolved against the range later.
  const ordRe = /\bthe\s+(\d{1,2})(?:st|nd|rd|th)\b/g;
  while ((m = ordRe.exec(t))) hints.ordinals = [...(hints.ordinals || []), +m[1]];
  if (/morning|breakfast/.test(t)) hints.dayparts.push('morning');
  if (/afternoon|lunch/.test(t)) hints.dayparts.push('afternoon');
  if (/evening|dinner|drinks/.test(t)) hints.dayparts.push('evening');
  const timeRe = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/g;
  while ((m = timeRe.exec(t))) hints.times.push(`${m[1]}${m[2] ? ':' + m[2] : ''}${m[3]}`);
  return hints;
}

// Rank free windows by detour cost from the surrounding anchors to the guest's location.
export function rankWindows({ start, end, them, durationMin = 45, hints = null }) {
  let windows = freeWindows(start, end, { minMinutes: durationMin + 20 });
  let missedAsk = false;

  if (hints) {
    const wanted = new Set(hints.dates);
    for (const o of hints.ordinals || []) {
      // resolve "the 10th" against the days in range
      const hit = windows.map((w) => w.day).concat([start, end]).find((d) => +d.slice(8, 10) === o);
      if (hit) wanted.add(hit);
      else wanted.add(`${start.slice(0, 8)}${String(o).padStart(2, '0')}`);
    }
    const wds = new Set(hints.weekdays);
    if (wanted.size || wds.size) {
      const filtered = windows.filter((w) => {
        const d = new Date(w.day + 'T12:00:00');
        return wanted.has(w.day) || wds.has(d.getDay());
      });
      if (filtered.length) windows = filtered;
      else missedAsk = true; // they asked for a day we can't do — say so in the draft
    }
    if (hints.dayparts.length && !missedAsk) {
      const PART = { morning: [8, 12], afternoon: [12, 17], evening: [17, 21] };
      const overlapsPart = (w) => {
        const h1 = localHour(w.s, w.offset), h2 = localHour(w.e, w.offset);
        return hints.dayparts.some((p) => {
          const [lo, hi] = PART[p];
          return h1 < hi && h2 > lo;
        });
      };
      const parted = windows.filter(overlapsPart);
      if (parted.length) windows = parted;
      else missedAsk = true; // right day, wrong part of it
    }
  }

  const scored = windows.map((w) => {
    let detour = 0;
    if (them && w.anchorBefore && w.anchorAfter) {
      const base = haversineKm(w.anchorBefore, w.anchorAfter);
      detour = haversineKm(w.anchorBefore, them) + haversineKm(them, w.anchorAfter) - base;
      if (w.beforeSoft && w.afterSoft) detour *= 0.4; // both edges soft → location barely matters
    }
    const slack = w.minutes - durationMin;
    return { ...w, detour, score: detour * 10 - Math.min(slack, 120) / 60 };
  });

  return { windows: scored.sort((a, b) => a.score - b.score).slice(0, 6), missedAsk };
}

function localHour(ms, off) {
  const sign = off[0] === '-' ? -1 : 1;
  const [h, m] = off.slice(1).split(':').map(Number);
  return new Date(ms + sign * (h * 60 + m) * 60000).getUTCHours();
}

export function nearestCafe(them, city = 'SF') {
  if (!them) return null;
  const c = CAFES.filter((c) => c.city === city)
    .map((c) => ({ ...c, km: haversineKm(c, them) }))
    .sort((a, b) => a.km - b.km)[0];
  return c || null;
}

export function slotLabel(w, offset) {
  const f = (ms) => {
    const d = new Date(ms + offsetMs(w.offset));
    let h = d.getUTCHours(), min = d.getUTCMinutes();
    const ap = h >= 12 ? 'pm' : 'am';
    h = h % 12 === 0 ? 12 : h % 12;
    return min ? `${h}:${String(min).padStart(2, '0')}${ap}` : `${h}${ap}`;
  };
  return `${fmtDayLong(w.day)}, ${f(w.s)}–${f(w.e)}`;
}
function offsetMs(off) {
  const sign = off[0] === '-' ? -1 : 1;
  const [h, m] = off.slice(1).split(':').map(Number);
  return sign * (h * 60 + m) * 60000;
}

export function proposeStart(w, durationMin) {
  // Prefer starting on the half hour, 15 min after the window opens.
  const startMs = w.s + 15 * 60000;
  const rounded = Math.ceil(startMs / (30 * 60000)) * 30 * 60000;
  return Math.min(rounded, w.e - durationMin * 60000);
}

export function fmtSlotTime(ms, off) {
  const d = new Date(ms + offsetMs(off));
  let h = d.getUTCHours(), min = d.getUTCMinutes();
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 === 0 ? 12 : h % 12;
  return min ? `${h}:${String(min).padStart(2, '0')}${ap}` : `${h}${ap}`;
}

export function buildDraft({ tone, slots, them, cafe, missedAsk }) {
  const lines = slots.map((s) => `• ${s.label}`);
  const venueLine = cafe
    ? them
      ? `Happy to come to you — or ${cafe.name} (${cafe.address.split(',')[0]}) if you'd rather step out.`
      : `${cafe.name} (${cafe.address.split(',')[0]}) is easy for me if that works.`
    : 'Happy to meet wherever is easy for you.';
  const regret = missedAsk ? "That window's packed on my end unfortunately. " : '';

  if (tone === 'text') {
    return `${regret}A few times that do work:\n${lines.join('\n')}\n\n${venueLine}`;
  }
  return `Hi —\n\nGreat to hear from you. ${regret}A few windows that work well on my end:\n\n${lines.join('\n')}\n\n${venueLine}\n\nBest,\nJacob`;
}
