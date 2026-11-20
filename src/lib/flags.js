// Per-browser feature switches.
//
// GHOST — Suggest and "Create a meeting here" drawn on the calendar and map
// (useGhost.js, SuggestTray, MeetHereTray). On for everyone since v0.11.0.
// Opening the site once with ?ghost=0 switches that one browser back to the
// old Suggest pop-up (useful for comparing, or as an escape hatch);
// ?ghost=1 switches it on again.
const KEY = 'laze-ghost';

function readGhost() {
  let stored = null;
  try {
    const q = new URLSearchParams(window.location.search).get('ghost');
    if (q === '1' || q === '0') localStorage.setItem(KEY, q);
    stored = localStorage.getItem(KEY);
  } catch { /* private mode: fall through to the default */ }
  return stored !== '0';
}

export const GHOST = readGhost();
