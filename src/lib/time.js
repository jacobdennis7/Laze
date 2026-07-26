// All events store ISO strings with their LOCAL offset baked in.
// Display parses the string directly (never the browser tz); math uses epoch ms.

export const toEpoch = (iso) => new Date(iso).getTime();

export function localHM(iso) {
  const m = iso.match(/T(\d{2}):(\d{2})/);
  return { h: +m[1], m: +m[2] };
}

export function minutesOfDay(iso) {
  const { h, m } = localHM(iso);
  return h * 60 + m;
}

export function fmtTime(iso) {
  const { h, m } = localHM(iso);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hh} ${ampm}` : `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function fmtTimeShort(iso) {
  const { h, m } = localHM(iso);
  const ampm = h >= 12 ? 'p' : 'a';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hh}${ampm}` : `${hh}:${String(m).padStart(2, '0')}${ampm}`;
}

// 'YYYY-MM-DD' helpers — treated as plain calendar dates, no tz.
export function parseDay(d) {
  const [y, mo, da] = d.split('-').map(Number);
  return new Date(y, mo - 1, da);
}
export function dayStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function addDays(d, n) {
  const dt = parseDay(d);
  dt.setDate(dt.getDate() + n);
  return dayStr(dt);
}
export function daySpan(a, b) {
  return Math.round((parseDay(b) - parseDay(a)) / 86400000);
}
export function eachDay(start, end) {
  const out = [];
  let d = start;
  while (d <= end) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WD_S = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MO_L = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function fmtDayLong(d) {
  const dt = parseDay(d);
  return `${WD[dt.getDay()]} ${MO[dt.getMonth()]} ${dt.getDate()}`;
}
export function fmtDayShort(d) {
  const dt = parseDay(d);
  return `${WD_S[dt.getDay()]} ${dt.getDate()}`;
}
export function fmtDayTiny(d) {
  const dt = parseDay(d);
  return { wd: WD_S[dt.getDay()].toUpperCase(), num: dt.getDate() };
}
export function fmtRange(start, end) {
  const a = parseDay(start), b = parseDay(end);
  if (a.getMonth() === b.getMonth()) return `${MO[a.getMonth()]} ${a.getDate()} – ${b.getDate()}`;
  return `${MO[a.getMonth()]} ${a.getDate()} – ${MO[b.getMonth()]} ${b.getDate()}`;
}
export function monthLabel(y, m) {
  return `${MO_L[m]} ${y}`;
}
export { WD_S, MO };
