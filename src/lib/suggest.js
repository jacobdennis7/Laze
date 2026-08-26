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
    // Detour in added travel minutes: how much longer the before→them→after
    // trip is vs. going before→after directly. Minutes, not km — that's the
    // unit the user actually plans in.
    let detourMin = 0;
    if (them && w.anchorBefore && w.anchorAfter) {
      const base = travelMinutes(w.anchorBefore, w.anchorAfter);
      detourMin = travelMinutes(w.anchorBefore, them) + travelMinutes(them, w.anchorAfter) - base;
      if (w.beforeSoft && w.afterSoft) detourMin *= 0.4; // both edges soft → location barely matters
    }
    const slack = w.minutes - durationMin;
    return { ...w, detourMin: Math.max(0, Math.round(detourMin)), score: detourMin - Math.min(slack, 120) / 60 };
  });

  // All qualifying windows, best first — capping this list hid real availability.
  return { windows: scored.sort((a, b) => a.score - b.score), missedAsk };
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

// ---------- booking links (Calendly / cal.com / Vimcal) ----------

export function detectBookingLink(text) {
  const m = text.match(/https?:\/\/(?:www\.)?(calendly\.com|cal\.com|app\.cal\.com|book\.vimcal\.com|cal\.ai)[^\s>"')]+/i);
  return m ? { url: m[0], provider: m[1].replace(/^(www\.|app\.|book\.)/, '').split('.')[0] } : null;
}

// Direct read of a booking page's availability. Expected to fail from a browser —
// these sites don't send CORS headers — but we try, so a future proxy slots in here.
export async function tryReadBookingLink(url) {
  try {
    const r = await fetch(url, { mode: 'cors' });
    if (!r.ok) return { ok: false, reason: `HTTP ${r.status}` };
    return { ok: false, reason: 'page fetched but availability is loaded by their app — needs the proxy' };
  } catch {
    return { ok: false, reason: 'cors' };
  }
}

// Parse availability text pasted from a booking page: date lines establish context,
// bare times inherit the most recent date. Handles "Monday, August 10", "Mon 8/10",
// "8/10", and times like "1:00pm", "13:30", "1 PM".
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export function parseTheirSlots(text, year = 2026) {
  const out = [];
  let curDay = null;
  for (const rawLine of text.split(/\n+/)) {
    const line = rawLine.trim().toLowerCase();
    if (!line) continue;
    let m = line.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/);
    if (m) curDay = `${year}-${String(MONTHS[m[1]]).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`;
    m = line.match(/\b(\d{1,2})\/(\d{1,2})\b/);
    if (m) curDay = `${year}-${String(+m[1]).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`;
    const timeRe = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(\d{2}):(\d{2})\b/g;
    let t;
    while ((t = timeRe.exec(line))) {
      if (!curDay) continue;
      let h, min;
      if (t[3]) {
        h = +t[1] % 12 + (t[3] === 'pm' ? 12 : 0);
        min = +(t[2] || 0);
      } else {
        h = +t[4];
        min = +t[5];
      }
      out.push({ day: curDay, minutes: h * 60 + min });
    }
  }
  return out;
}

// Intersect their offered slots with my real free windows.
export function matchTheirSlots({ theirs, start, end, durationMin = 30, them = null }) {
  const { windows } = rankWindows({ start, end, them, durationMin });
  const matches = [];
  for (const t of theirs) {
    const w = windows.find((w) => {
      if (w.day !== t.day) return false;
      const tMs = toDayEpoch(t.day, t.minutes, w.offset);
      return tMs >= w.s && tMs + durationMin * 60000 <= w.e;
    });
    if (w) {
      const tMs = toDayEpoch(t.day, t.minutes, w.offset);
      matches.push({ ...t, ms: tMs, window: w, offset: w.offset });
    }
  }
  // dedupe + keep chronological
  const seen = new Set();
  return matches.filter((m) => {
    const k = `${m.day}T${m.minutes}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).sort((a, b) => a.ms - b.ms);
}

function toDayEpoch(day, minutes, off) {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return new Date(`${day}T${h}:${m}:00${off}`).getTime();
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
