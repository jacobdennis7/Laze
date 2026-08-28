import { loadSettings } from './store.js';

// Google-Calendar-style identity colors: each connected calendar gets a
// stable saturated color (indexed by the user's calendar selection), so
// tiles read at a glance on desktop and phone. Neighborhood colors remain
// the map's language — geography belongs there, not on the week grid.
export const CAL_PALETTE = [
  '#1a73e8', // blue
  '#0b8043', // green
  '#8e24aa', // purple
  '#e8710a', // orange
  '#3949ab', // indigo
  '#c2185b', // magenta
  '#00796b', // teal
  '#7b5e2e', // umber
];

export function calColor(ev) {
  if (!ev.calId) return null;
  const cals = loadSettings().calendars || [];
  let i = cals.indexOf(ev.calId);
  if (i < 0) i = [...ev.calId].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0);
  return CAL_PALETTE[i % CAL_PALETTE.length];
}
