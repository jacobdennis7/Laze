import React, { useEffect, useState } from 'react';
import { buildDraft } from '../lib/suggest.js';
import { track } from '../lib/analytics.js';
import AddressInput from './AddressInput.jsx';

// PROTOTYPE — the control bar for Suggest-as-a-mode. It docks under the
// calendar/map (taking its own space, never covering the week): one row of
// controls, one status row saying what the reply will offer.

const DUR = [30, 45, 60, 90];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SuggestTray({ ghost, view, onClassic }) {
  const [open, setOpen] = useState(false); // message + reply panel
  const [tone, setTone] = useState('text');
  const [edited, setEdited] = useState(null); // user's own edits to the reply
  const [copied, setCopied] = useState(false);
  const [addrKey, setAddrKey] = useState(0); // remounts the address field to clear it

  const { cfg, picked, suggested, hints } = ghost;
  // Until something is picked, the reply offers the dashed suggestions.
  const offered = picked.length ? picked : suggested;
  const offerSig = offered.map((s) => s.id).join(',');
  useEffect(() => setEdited(null), [offerSig, tone, cfg.them]);

  const draft = edited ?? buildDraft({ tone, slots: offered, them: cfg.them, cafe: ghost.cafe, missedAsk: ghost.missedAsk });

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      track('suggest_draft_copied', { slots: offered.length, has_location: !!cfg.them, tone, surface: 'ghost' });
    } catch { /* clipboard blocked */ }
  }

  let status;
  if (picked.length) {
    status = (
      <>
        {picked.map((s) => (
          <button key={s.id} className="g-chip" onClick={() => ghost.toggle(s.id)} title="Remove this time">
            ✓ {s.chip}{s.detourMin > 5 ? ` · +${s.detourMin}m` : ''} <span aria-hidden="true">✕</span>
          </button>
        ))}
        <span className="g-status-text">
          {picked.length} picked
          {view === 'map' ? ' · add or change times in Calendar view' : ' · click green to add more · ✕ removes one'}
        </span>
        {picked.length > 1 && <button className="g-link" onClick={ghost.clearPicks}>Clear all</button>}
      </>
    );
  } else if (view === 'map') {
    status = (
      <span className="g-status-text">
        Times are picked in Calendar view.{' '}
        {cfg.them ? 'Picked times will show their detour here.' : 'Add where they are to see each time’s detour on this map.'}
      </span>
    );
  } else if (!ghost.slots.length) {
    status = <span className="g-status-text">No open time in this range for a {cfg.duration}-minute meeting.</span>;
  } else {
    status = (
      <span className="g-status-text">
        Green is when you’re {ghost.rule}. Click it to add as many times as you like — until you do, the
        reply offers the {suggested.length} dashed suggestion{suggested.length === 1 ? '' : 's'}.
      </span>
    );
  }

  return (
    <section className="g-tray" aria-label="Suggest times">
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
              Reply · {picked.length ? `your ${picked.length} pick${picked.length > 1 ? 's' : ''}` : 'the suggested times'}
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
        <span className="g-tray-title">Suggest</span>
        <div className="tone-seg g-seg" aria-label="Meeting length">
          {DUR.map((d) => (
            <button key={d} className={cfg.duration === d ? 'on' : ''} onClick={() => ghost.set({ duration: d })}>{d}m</button>
          ))}
        </div>
        <div className="g-tray-addr">
          {/* Shows a place carried over from "Meet here" (Offer several times
              instead); remounts when the place changes from outside. */}
          <AddressInput
            key={`${addrKey}-${cfg.them ? `${cfg.them.lat},${cfg.them.lng}` : ''}`}
            initial={cfg.them ? cfg.them.address || cfg.them.name : ''}
            dropUp
            placeholder="Where are they?"
            onSelect={(place) => ghost.set({ them: place })}
            ariaLabel="Their address or place (optional)"
          />
          {cfg.them && (
            <button className="g-addr-clear" onClick={() => { ghost.set({ them: null }); setAddrKey((k) => k + 1); }} aria-label="Clear their location">✕</button>
          )}
        </div>
        <div className="g-tray-actions">
          <button className="g-link" onClick={onClassic} title="The same times as a list, where you can also paste a booking link">List view</button>
          <button className="pill-btn" onClick={() => setOpen(!open)}>{open ? 'Hide reply' : 'Reply'}</button>
          <button className="pill-btn primary" onClick={copy}>{copied ? 'Copied ✓' : 'Copy reply'}</button>
          <button className="x-btn" onClick={ghost.exit} aria-label="Leave suggest mode" title="Leave suggest mode">✕</button>
        </div>
      </div>

      <div className="g-tray-status" aria-live="polite">{status}</div>
    </section>
  );
}
