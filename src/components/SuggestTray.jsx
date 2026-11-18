import React, { useEffect, useState } from 'react';
import { GHOST_LOOKS } from '../lib/useGhost.js';
import { buildDraft } from '../lib/suggest.js';
import { track } from '../lib/analytics.js';
import AddressInput from './AddressInput.jsx';

// PROTOTYPE — the control bar for Suggest-as-a-mode. It docks under the
// calendar/map (taking its own space, never covering the week) and holds the
// few inputs plus the reply being built from the picked times.

const DUR = [30, 45, 60, 90];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const HINTS = {
  windows: 'Move over a green stretch and click to drop a time there — up to 3.',
  slots: 'Click any start time — up to 3.',
  top: 'Click a numbered time — up to 3.',
};

export default function SuggestTray({ ghost, view, onClassic }) {
  const [open, setOpen] = useState(false); // message + draft panel
  const [tone, setTone] = useState('text');
  const [edited, setEdited] = useState(null); // user's own edits to the draft
  const [copied, setCopied] = useState(false);
  const [addrKey, setAddrKey] = useState(0); // remounts the address field to clear it

  const { cfg, picked, hints } = ghost;
  // Until something is picked the reply offers the three best times.
  const offered = picked.length ? picked : ghost.top.slice(0, 3);
  const pickSig = ghost.picks.join(',');
  useEffect(() => setEdited(null), [pickSig, tone, cfg.duration, cfg.them, cfg.msg]);

  const draft = edited ?? buildDraft({ tone, slots: offered, them: cfg.them, cafe: ghost.cafe, missedAsk: ghost.missedAsk });

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      track('suggest_draft_copied', { slots: offered.length, has_location: !!cfg.them, tone, surface: 'ghost', look: cfg.look });
    } catch { /* clipboard blocked */ }
  }

  const hint =
    view === 'map'
      ? cfg.them
        ? 'Picked times show their detour on this day’s map. Pick times in Calendar.'
        : 'Say where they are to see the detour on the map — pick times in Calendar.'
      : HINTS[cfg.look];

  return (
    <section className={`g-tray${open ? ' open' : ''}`} aria-label="Suggest times">
      {open && (
        <div className="g-tray-panel">
          <div className="field">
            <label>Their message — optional, narrows to what they asked</label>
            <textarea
              value={cfg.msg}
              onChange={(e) => ghost.set({ msg: e.target.value })}
              placeholder={'"Why don\'t we do coffee Thursday afternoon?"'}
            />
            {hints && (hints.weekdays.length || hints.dates.length || hints.dayparts.length) ? (
              <div className="hint-chips">
                {hints.dates.map((d) => <span key={d}>asks: {d.slice(5).replace('-', '/')}</span>)}
                {hints.weekdays.map((w) => <span key={w}>asks: {WD[w]}</span>)}
                {hints.dayparts.map((p) => <span key={p}>{p}</span>)}
              </div>
            ) : null}
          </div>
          <div className="field">
            <label>
              Reply {picked.length ? `· your ${picked.length} pick${picked.length > 1 ? 's' : ''}` : '· best 3 until you pick'}
              {ghost.cafe ? ` · suggesting ${ghost.cafe.name}` : ''}
            </label>
            <div className="tone-seg">
              <button className={tone === 'text' ? 'on' : ''} onClick={() => setTone('text')}>Text</button>
              <button className={tone === 'email' ? 'on' : ''} onClick={() => setTone('email')}>Email</button>
            </div>
            <textarea className="draft-box" value={draft} onChange={(e) => setEdited(e.target.value)} />
          </div>
        </div>
      )}

      <div className="g-tray-bar">
        <div className="g-tray-group">
          <span className="g-tray-title">Suggest</span>
          <div className="tone-seg g-seg" role="tablist" aria-label="Prototype look">
            {GHOST_LOOKS.map(([k, label]) => (
              <button key={k} className={cfg.look === k ? 'on' : ''} onClick={() => ghost.set({ look: k })}>{label}</button>
            ))}
          </div>
        </div>

        <div className="g-tray-group">
          <div className="tone-seg g-seg" aria-label="Meeting length">
            {DUR.map((d) => (
              <button key={d} className={cfg.duration === d ? 'on' : ''} onClick={() => ghost.set({ duration: d })}>{d}m</button>
            ))}
          </div>
          <div className="g-tray-addr">
            <AddressInput
              key={addrKey}
              dropUp
              placeholder="Where are they? (optional)"
              onSelect={(place) => ghost.set({ them: place })}
              ariaLabel="Their address or place"
            />
            {cfg.them && (
              <button className="g-addr-clear" onClick={() => { ghost.set({ them: null }); setAddrKey((k) => k + 1); }} aria-label="Clear their location">✕</button>
            )}
          </div>
        </div>

        <div className="g-tray-picks">
          {picked.length === 0 ? (
            <span className="g-tray-hint">
              {hint}
              {view !== 'map' && cfg.look === 'top' && ghost.top.length >= cfg.topN && (
                <button className="g-link" onClick={() => ghost.set({ topN: cfg.topN + 6 })}>Show more</button>
              )}
            </span>
          ) : (
            picked.map((s) => (
              <button key={s.id} className="g-chip" onClick={() => ghost.toggle(s.id)} title="Remove">
                ✓ {s.chip}{s.detourMin > 5 ? ` · +${s.detourMin}m` : ''} <span aria-hidden="true">✕</span>
              </button>
            ))
          )}
        </div>

        <div className="g-tray-group">
          <button className="g-link" onClick={onClassic} title="Open the current pop-up version to compare">Classic</button>
          <button className="pill-btn" onClick={() => setOpen(!open)}>{open ? 'Hide reply' : 'Reply'}</button>
          <button className="pill-btn primary" onClick={copy}>{copied ? 'Copied ✓' : 'Copy reply'}</button>
          <button className="x-btn" onClick={ghost.exit} aria-label="Leave suggest mode">✕</button>
        </div>
      </div>
    </section>
  );
}
