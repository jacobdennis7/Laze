import { VENUES, LODGING, HOME } from '../data/events.js';
import { getEvents, loadSettings } from './store.js';
import { liveMinutes } from './routes.js';
import { resolvePlacement, getPlaces } from './prefs.js';
import { toEpoch, eachDay } from './time.js';
import { travelMinutes, venueOf, bestMode } from './geo.js';

// Where an event effectively happens: its real venue, or — for virtual meetings —
// wherever the user says they'll take the call (home / office / other).
export function effectiveVenue(ev) {
  if (!ev.virtual) return venueOf(ev);
  return resolvePlacement(ev);
}

export function eventsForRange(start, end) {
  return getEvents().filter((e) => e.day >= start && e.day <= end && !e.hidden).sort(
    (a, b) => toEpoch(a.start) - toEpoch(b.start)
  );
}

export function eventsForDay(day) {
  return getEvents().filter((e) => e.day === day && !e.hidden).sort((a, b) => toEpoch(a.start) - toEpoch(b.start));
}

export function lodgingFor(day) {
  const l = LODGING.find((l) => day >= l.from && day <= l.to);
  if (l && VENUES[l.venue]) return { ...VENUES[l.venue], label: l.label };
  const home = getPlaces().home;
  if (home) return { ...home, label: 'Home' };
  if (HOME && VENUES[HOME]) return { ...VENUES[HOME], label: 'Home' };
  return null; // no base configured — anchors fall back to the day's meetings
}

// Routable stops for a day: in-person meetings with coordinates, plus virtual
// meetings the user has placed somewhere. Excludes home-city noise and TBDs.
export function routableStops(day) {
  return eventsForDay(day).filter((e) => !e.homeCity && !e.tbd && effectiveVenue(e));
}

// Travel legs between consecutive in-person stops, with gap feasibility.
export function dayLegs(day, mode = 'drive') {
  const stops = routableStops(day);
  const legs = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    const va = effectiveVenue(a), vb = effectiveVenue(b);
    const gapMin = Math.round((toEpoch(b.start) - toEpoch(a.end)) / 60000);
    const auto = bestMode(va, vb);
    const useMode = mode === 'auto' ? auto : mode;
    const live = liveMinutes(va, vb, useMode); // Google Routes figure when a key is set
    const mins = live ?? travelMinutes(va, vb, useMode);
    const walkMins = liveMinutes(va, vb, 'walk') ?? travelMinutes(va, vb, 'walk');
    // A hop is only tight if NO reasonable mode makes it (walking counts when short).
    const effMins = walkMins <= 25 ? Math.min(mins, walkMins) : mins;
    legs.push({
      from: a, to: b, va, vb, gapMin, mins, walkMins, effMins,
      live: live != null,
      mode: useMode,
      tight: gapMin >= 0 && effMins + 10 > gapMin,
      overlap: gapMin < 0,
    });
  }
  return legs;
}

// ---------- Conflict engine ----------

export function findConflicts(start, end, mode = 'drive') {
  const out = [];
  const days = eachDay(start, end);

  for (const day of days) {
    const evs = eventsForDay(day).filter((e) => e.kind !== 'flight');
    const all = eventsForDay(day);
    const flights = all.filter((e) => e.kind === 'flight');

    // 1. Overlaps (ignore pairs where one is a home-city phantom — those get their own card)
    for (let i = 0; i < evs.length; i++) {
      for (let j = i + 1; j < evs.length; j++) {
        const a = evs[i], b = evs[j];
        if (a.homeCity || b.homeCity) continue;
        if (toEpoch(a.start) < toEpoch(b.end) && toEpoch(b.start) < toEpoch(a.end)) {
          out.push({
            severity: 'high', day, type: 'Double-booked',
            title: `${a.title} overlaps ${b.title}`,
            detail: `Both occupy ${overlapLabel(a, b)}. One needs to move.`,
            fix: a.tbd && !b.tbd ? `“${a.title}” has no venue yet — easiest to reschedule.` : b.tbd ? `“${b.title}” has no venue yet — easiest to reschedule.` : 'Pick one to move.',
            ids: [a.id, b.id],
          });
        }
      }
    }

    // 2. Meetings scheduled while airborne
    for (const f of flights) {
      for (const e of evs) {
        if (e.homeCity) continue;
        if (toEpoch(e.start) < toEpoch(f.end) && toEpoch(f.start) < toEpoch(e.end)) {
          out.push({
            severity: 'high', day, type: 'In-flight',
            title: `${e.title} lands mid-flight`,
            detail: `${f.title} overlaps this ${e.virtual ? 'call' : 'meeting'}.`,
            fix: e.virtual ? 'Hand it off or move it — no wifi guarantee.' : 'Reschedule.',
            ids: [e.id, f.id],
          });
        }
      }
    }

    // Departure-day squeeze: anything ending within 130 min of an outbound flight's start
    for (const f of flights) {
      const cutoff = toEpoch(f.start) - 130 * 60000;
      for (const e of evs) {
        if (e.homeCity) continue;
        if (toEpoch(e.end) > cutoff && toEpoch(e.end) <= toEpoch(f.start) && !e.virtual) {
          out.push({
            severity: 'high', day, type: 'Airport run',
            title: `${e.title} ends inside the airport window`,
            detail: `${f.title} needs you rolling ~2h10m before wheels-up. This ends too late.`,
            fix: 'End by ' + new Date(cutoff).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) + ' PT or move it earlier.',
            ids: [e.id, f.id],
          });
        }
        if (e.virtual && toEpoch(e.start) > cutoff && toEpoch(e.start) < toEpoch(f.start)) {
          out.push({
            severity: 'med', day, type: 'Airport run',
            title: `${e.title} lands during the ride to the airport`,
            detail: 'Doable from the car, not ideal.',
            fix: 'Shift it 90 min earlier and it fits cleanly.',
            ids: [e.id, f.id],
          });
        }
      }
    }

    // 3. Tight transitions
    for (const leg of dayLegs(day, mode)) {
      if (leg.overlap) continue;
      if (leg.tight) {
        out.push({
          severity: leg.effMins > leg.gapMin ? 'high' : 'med', day, type: 'Tight transfer',
          title: `${leg.va.hood} → ${leg.vb.hood} in ${leg.gapMin} min`,
          detail: `${leg.from.title} ends ${leg.gapMin} min before ${leg.to.title}; fastest way over is ~${leg.effMins} min.`,
          fix: leg.effMins > leg.gapMin ? 'Push the second meeting or shorten the first.' : `Only ${leg.gapMin - leg.effMins} min of slack — ask for a 15-min push.`,
          ids: [leg.from.id, leg.to.id],
        });
      }
    }

    // 4. Home-city phantoms
    for (const e of all) {
      if (e.homeCity) {
        out.push({
          severity: 'low', day, type: 'Home-city event',
          title: `${e.title} is in New York`,
          detail: 'Recurring NYC event still on the calendar during the trip — it makes your free/busy lie.',
          fix: 'Decline this occurrence.',
          ids: [e.id],
        });
      }
    }

    // 5. Committed but no location
    for (const e of evs) {
      if (e.tbd && !e.homeCity && e.kind !== 'hold') {
        out.push({
          severity: 'med', day, type: 'No location',
          title: `${e.title} has no confirmed venue`,
          detail: e.locationText ? `Calendar says: “${e.locationText}”.` : 'Location field is empty.',
          fix: 'Use Suggest to propose a spot near the surrounding meetings.',
          ids: [e.id],
        });
      }
      if (e.kind === 'hold') {
        out.push({
          severity: 'low', day, type: 'Unconfirmed hold',
          title: `${e.title}`,
          detail: 'Still a hold — confirm or release it so the slot can be offered.',
          fix: 'Decide 48h out.',
          ids: [e.id],
        });
      }
    }
  }

  const rank = { high: 0, med: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.day < b.day ? -1 : 1));
}

function overlapLabel(a, b) {
  const s = Math.max(toEpoch(a.start), toEpoch(b.start));
  const e = Math.min(toEpoch(a.end), toEpoch(b.end));
  const st = new Date(s), en = new Date(e);
  const f = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });
  return `${f(st)}–${f(en)} PT`;
}

// ---------- Free windows ----------

// Free windows in a range with the in-person anchors on each side.
// Day bounds default to the user's working hours setting.
export function freeWindows(start, end, { minMinutes = 45, dayStart = null, dayEnd = null } = {}) {
  const settings = loadSettings();
  dayStart = dayStart ?? settings.workStart ?? 8 * 60;
  dayEnd = dayEnd ?? settings.workEnd ?? 21 * 60;
  const out = [];
  for (const day of eachDay(start, end)) {
    const evs = eventsForDay(day).filter((e) => !e.homeCity && e.kind !== 'hold');
    const busy = evs
      .map((e) => {
        // A flight blocks ~2h10m before wheels-up (airport + ride) and ~35m after landing (deplane, bags, car).
        const pre = e.kind === 'flight' ? 130 * 60000 : 0;
        const post = e.kind === 'flight' ? 35 * 60000 : 0;
        return { s: toEpoch(e.start) - pre, e: toEpoch(e.end) + post, ev: e };
      })
      .sort((a, b) => a.s - b.s);

    // Build the day's local window using the first event's offset, else default PT/ET by city guess
    const sample = evs[0]?.start || `${day}T12:00:00-07:00`;
    const offset = sample.slice(-6);
    const dayStartEpoch = toEpoch(`${day}T${String(Math.floor(dayStart / 60)).padStart(2, '0')}:${String(dayStart % 60).padStart(2, '0')}:00${offset}`);
    const dayEndEpoch = toEpoch(`${day}T${String(Math.floor(dayEnd / 60)).padStart(2, '0')}:${String(dayEnd % 60).padStart(2, '0')}:00${offset}`);

    let cursor = dayStartEpoch;
    let prev = null;
    const merged = [];
    for (const b of busy) {
      if (merged.length && b.s <= merged[merged.length - 1].e) {
        merged[merged.length - 1].e = Math.max(merged[merged.length - 1].e, b.e);
        merged[merged.length - 1].evs.push(b.ev);
      } else merged.push({ s: b.s, e: b.e, evs: [b.ev] });
    }
    for (const b of merged) {
      // A gap running into an evening event still ends at the workday cutoff.
      const wEnd = Math.min(b.s, dayEndEpoch);
      if (wEnd - cursor >= minMinutes * 60000) {
        // the earliest-starting event in the group is what the window runs into
        const firstEv = b.evs.reduce((x, y) => (toEpoch(y.start) < toEpoch(x.start) ? y : x));
        out.push(mkWindow(day, cursor, wEnd, prev, firstEv, offset));
      }
      cursor = Math.max(cursor, b.e);
      // the latest-ending event in the group is what the next window follows
      prev = b.evs.reduce((x, y) => (toEpoch(y.end) > toEpoch(x.end) ? y : x));
    }
    if (dayEndEpoch - cursor >= minMinutes * 60000) {
      out.push(mkWindow(day, cursor, dayEndEpoch, prev, null, offset));
    }
  }
  return out;
}

function mkWindow(day, s, e, before, after, offset) {
  const vb = before ? effectiveVenue(before) : null;
  const va = after ? effectiveVenue(after) : null;
  const lodging = lodgingFor(day);
  return {
    day, s, e,
    minutes: Math.round((e - s) / 60000),
    before, after,
    anchorBefore: vb || lodging || va || null,
    anchorAfter: va || lodging || vb || null,
    beforeSoft: !vb,
    afterSoft: !va,
    offset,
  };
}
