import React, { useMemo, useState } from 'react';
import { CAFES } from '../data/events.js';
import { parseMessage, rankWindows, nearestCafe, proposeStart, fmtSlotTime, buildDraft } from '../lib/suggest.js';
import { fmtDayLong } from '../lib/time.js';

const DUR = [30, 45, 60, 90];
const WD_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SuggestModal({ range, onClose }) {
  const [msg, setMsg] = useState('');
  const [themKey, setThemKey] = useState('');
  const [customAddr, setCustomAddr] = useState('');
  const [customPt, setCustomPt] = useState(null);
  const [geoState, setGeoState] = useState('idle');
  const [duration, setDuration] = useState(45);
  const [tone, setTone] = useState('text');
  const [selected, setSelected] = useState([]);
  const [copied, setCopied] = useState(false);
  const [draftOverride, setDraftOverride] = useState(null);

  const hints = useMemo(() => (msg.trim() ? parseMessage(msg) : null), [msg]);

  const them = useMemo(() => {
    if (customPt) return customPt;
    if (themKey) {
      const c = CAFES.find((c) => c.key === themKey);
      if (c) return c;
    }
    return null;
  }, [themKey, customPt]);

  const { windows, missedAsk } = useMemo(
    () => rankWindows({ start: range.start, end: range.end, them, durationMin: duration, hints }),
    [range, them, duration, hints]
  );

  const slots = useMemo(
    () =>
      windows.map((w, i) => {
        const startMs = proposeStart(w, duration);
        const endMs = startMs + duration * 60000;
        return {
          id: i,
          w,
          label: `${fmtDayLong(w.day)}, ${fmtSlotTime(startMs, w.offset)}–${fmtSlotTime(endMs, w.offset)}`,
          context: !w.before && !w.after
            ? 'Fully flexible — nothing on either side'
            : `${w.before ? `After ${w.before.title}${w.beforeSoft ? ' (venue TBD)' : ` (${w.anchorBefore.hood})`}` : 'Open morning'}${w.after ? `, before ${w.after.title}${w.afterSoft ? ' (venue TBD)' : ''}` : ''}`,
          detourKm: w.detour,
        };
      }),
    [windows, duration]
  );

  const cafe = useMemo(() => nearestCafe(them, them && them.lat > 39 ? 'NYC' : 'SF'), [them]);

  const chosen = slots.filter((s) => selected.includes(s.id));
  const draft = draftOverride ?? buildDraft({ tone, slots: chosen.length ? chosen : slots.slice(0, 3), them, cafe, missedAsk });

  async function locate() {
    if (!customAddr.trim()) return;
    setGeoState('loading');
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(customAddr)}`
      );
      const js = await r.json();
      if (js[0]) {
        setCustomPt({ lat: +js[0].lat, lng: +js[0].lon, name: customAddr, address: customAddr });
        setThemKey('');
        setGeoState('ok');
      } else setGeoState('miss');
    } catch {
      setGeoState('miss');
    }
  }

  function toggleSlot(id) {
    setDraftOverride(null);
    setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id].slice(-3)));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* ignore */ }
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal">
        <div className="modal-card" role="dialog" aria-label="Suggest meeting times">
          <div className="modal-head">
            <h2>Suggest times &amp; a spot</h2>
            <button className="x-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div className="modal-body">
            <div className="modal-col">
              <div className="field">
                <label>Paste their message (email or text) — optional</label>
                <textarea
                  value={msg}
                  onChange={(e) => { setMsg(e.target.value); setDraftOverride(null); }}
                  placeholder={'e.g. "Let\'s do it! Why don\'t we do a coffee on the afternoon of the 10th? How\'s 1:30pm for you?"'}
                />
                {hints && (hints.weekdays.length || hints.dates.length || hints.times.length || hints.dayparts.length) ? (
                  <div className="hint-chips">
                    {hints.dates.map((d) => <span key={d}>asks: {d.slice(5).replace('-', '/')}</span>)}
                    {hints.weekdays.map((w) => <span key={w}>asks: {WD_NAMES[w]}</span>)}
                    {hints.times.map((t) => <span key={t}>at {t}</span>)}
                    {hints.dayparts.map((p) => <span key={p}>{p}</span>)}
                  </div>
                ) : null}
              </div>

              <div className="field">
                <label>Where are they? (their office / neighborhood)</label>
                <select value={themKey} onChange={(e) => { setThemKey(e.target.value); setCustomPt(null); setDraftOverride(null); }}>
                  <option value="">— not sure / doesn't matter —</option>
                  <optgroup label="Neighborhoods">
                    <option value="farleys">Potrero Hill</option>
                    <option value="blueBottleSansome">FiDi / Downtown</option>
                    <option value="sightglass">SoMa</option>
                    <option value="saintFrank">Russian Hill / Polk</option>
                    <option value="theMill">NoPa / Divisadero</option>
                    <option value="watchhouse">NYC — Flatiron</option>
                  </optgroup>
                </select>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Or exact address</label>
                  <input
                    value={customAddr}
                    onChange={(e) => setCustomAddr(e.target.value)}
                    placeholder="555 Market St, San Francisco"
                    onKeyDown={(e) => e.key === 'Enter' && locate()}
                  />
                </div>
                <div className="field" style={{ flex: '0 0 auto', alignSelf: 'flex-end' }}>
                  <button className="pill-btn" onClick={locate}>
                    {geoState === 'loading' ? 'Locating…' : geoState === 'ok' ? 'Located ✓' : geoState === 'miss' ? 'Not found — retry' : 'Locate'}
                  </button>
                </div>
              </div>
              <div className="field">
                <label>Length</label>
                <div className="tone-seg">
                  {DUR.map((d) => (
                    <button key={d} className={duration === d ? 'on' : ''} onClick={() => { setDuration(d); setDraftOverride(null); }}>
                      {d}m
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-col">
              <div className="field">
                <label>
                  Ranked windows in {range.start.slice(5).replace('-', '/')}–{range.end.slice(5).replace('-', '/')} · pick up to 3
                </label>
                <div className="slot-list">
                  {slots.length === 0 && <div className="empty-note">No open windows fit — widen the range or shorten the meeting.</div>}
                  {slots.map((s) => (
                    <button key={s.id} className={`slot-item${selected.includes(s.id) ? ' sel' : ''}`} onClick={() => toggleSlot(s.id)}>
                      <div>
                        <div className="when">{s.label}</div>
                        <div className="why">{s.context}</div>
                      </div>
                      {them && (
                        <span className={`det${s.detourKm > 4 ? ' far' : ''}`}>
                          {s.detourKm <= 0.8 ? 'on your way' : `+${s.detourKm.toFixed(1)} km`}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>Draft reply {cafe ? `· suggesting ${cafe.name}` : ''}</label>
                <div className="tone-seg">
                  <button className={tone === 'text' ? 'on' : ''} onClick={() => { setTone('text'); setDraftOverride(null); }}>Text</button>
                  <button className={tone === 'email' ? 'on' : ''} onClick={() => { setTone('email'); setDraftOverride(null); }}>Email</button>
                </div>
                <textarea className="draft-box" value={draft} onChange={(e) => setDraftOverride(e.target.value)} />
                <div className="copy-row">
                  <button className="pill-btn primary" onClick={copy}>Copy draft</button>
                  {copied && <span className="ok-note">Copied ✓</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
