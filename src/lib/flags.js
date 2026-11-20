// Features switched on per browser, not for everyone.
//
// GHOST — Suggest and "Create a meeting here" drawn on the calendar and map
// (useGhost.js, SuggestTray, MeetHereTray). Off in production until Jacob
// has judged it on his own phone and calendar: opening the site once with
// ?ghost=1 turns it on for that browser, ?ghost=0 turns it back off. On by
// default in local dev. To launch it for everyone, make this `true`.
const KEY = 'laze-ghost';

function readGhost() {
  let stored = null;
  try {
    const q = new URLSearchParams(window.location.search).get('ghost');
    if (q === '1' || q === '0') localStorage.setItem(KEY, q);
    stored = localStorage.getItem(KEY);
  } catch { /* private mode: fall through to the default */ }
  if (stored === '1') return true;
  if (stored === '0') return false;
  return !!import.meta.env.DEV;
}

export const GHOST = readGhost();
