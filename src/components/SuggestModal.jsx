import React, { useMemo, useState } from 'react';
import { CAFES } from '../data/events.js';
import { getPlaces } from '../lib/prefs.js';
import { loadSettings } from '../lib/store.js';
import {
  parseMessage, rankWindows, nearestCafe, proposeStart, fmtSlotTime, buildDraft,
  detectBookingLink, tryReadBookingLink, parseTheirSlots, matchTheirSlots,
} from '../lib/suggest.js';
import { fmtDayLong } from '../lib/time.js';
import AddressInput from './AddressInput.jsx';

const CAT_ICON = { coffee: '☕', lunch: '🍽', dinner: '🌙' };

const DUR = [30, 45, 60, 90];
const WD_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SuggestModal({ range, onClose }) {
  const [msg, setMsg] = useState('');
  const [themKey, setThemKey] = useState('');
  const [customPt, setCustomPt] = useState(null);
  const [duration, setDuration] = useState(45);
  const [tone, setTone] = useState('text');
  const [selected, setSelected] = useState([]);
  const [copied, setCopied] = useState(false);
  const [draftOverride, setDraftOverride] = useState(null);
  const [favId, setFavId] = useState(null); // chosen favorite spot, else nearest café
  const [bookState, setBookState] = useState(null); // null | 'checking' | 'auto' | 'paste'
  const [theirText, setTheirText] = useState('');
  const [autoTheirs, setAutoTheirs] = useState(null); // slots fetched via the server proxy
  const favorites = getPlaces().favorites;

  const booking = useMemo(() => detectBookingLink(msg), [msg]);

  async function checkBooking() {
    setBookState('checking');
    // Server proxy reads Calendly availability directly (no CORS wall server-side).
    try {
      const q = new URLSearchParams({ url: booking.url, start: range.start, end: range.end, tz: loadSettings().tz });
      const r = await fetch(`/api/booking?${q}`);
      const js = await r.json();
      if (js.ok && js.slots?.length) {
        setAutoTheirs(js.slots.map((iso) => ({ day: iso.slice(0, 10), minutes: +iso.slice(11, 13) * 60 + +iso.slice(14, 16) })));
        setBookState('auto');
        return;
      }
    } catch { /* dev build or proxy unavailable */ }
    await tryReadBookingLink(booking.url);
    setBookState('paste');
  }

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

  const theirMatches = useMemo(() => {
    const theirs = autoTheirs || (theirText.trim() ? parseTheirSlots(theirText) : null);
    if (!theirs) return null;
    if (!theirs.length) return [];
    return matchTheirSlots({ theirs, start: range.start, end: range.end, durationMin: duration, them });
  }, [autoTheirs, theirText, range, duration, them]);

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

  const chosenFav = favorites.find((f) => f.id === favId) || null;
  const cafe = useMemo(
    () => chosenFav || nearestCafe(them, them && them.lat > 39 ? 'NYC' : 'SF'),
    [them, chosenFav]
  );

  const chosen = slots.filter((s) => selected.includes(s.id));
  const draft = draftOverride ?? buildDraft({ tone, slots: chosen.length ? chosen : slots.slice(0, 3), them, cafe, missedAsk });

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
              <div className="field">
                <label>Or exact address</label>
                <AddressInput
                  placeholder="555 Market St, San Francisco"
                  onSelect={(place) => { setCustomPt(place); setThemKey(''); setDraftOverride(null); }}
                  ariaLabel="Their exact address"
                />
                {customPt && <div style={{ fontSize: 11.5, color: 'var(--ok)', marginTop: 4 }}>✓ {customPt.name}</div>}
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

              {favorites.length > 0 && (
                <div className="field">
                  <label>Suggest one of your spots</label>
                  <div className="fav-chips">
                    <button className={`fav-chip${!favId ? ' on' : ''}`} onClick={() => { setFavId(null); setDraftOverride(null); }}>
                      Nearest café
                    </button>
                    {favorites.map((f) => (
                      <button key={f.id} className={`fav-chip${favId === f.id ? ' on' : ''}`} onClick={() => { setFavId(f.id === favId ? null : f.id); setDraftOverride(null); }}>
                        {CAT_ICON[f.category]} {f.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {booking && (
                <div className="field booking-box">
                  <label>Booking link detected — {booking.provider}</label>
                  {bookState === null && (
                    <button className="pill-btn" onClick={checkBooking}>Cross-reference their availability</button>
                  )}
                  {bookState === 'checking' && <div className="book-note">Reading their availability…</div>}
                  {bookState === 'auto' && theirMatches && (
                    <>
                      <div className="book-note">
                        ✓ Read {autoTheirs.length} open times from their page — here's where they overlap
                        with your real free windows:
                      </div>
                      <div className="book-matches">
                        {theirMatches.length === 0 && <div className="book-note">No overlap in this date range — try widening the range.</div>}
                        {theirMatches.slice(0, 5).map((m, i) => (
                          <div className="book-match" key={i}>
                            <span>
                              ✓ <b>{fmtDayLong(m.day)}, {fmtSlotTime(m.ms, m.offset)}</b>
                              <span className="why"> — fits {m.window.beforeSoft && m.window.afterSoft ? 'a fully open stretch' : `between ${m.window.before?.title || 'your morning'} and ${m.window.after?.title || 'your evening'}`}</span>
                            </span>
                            <a className="pill-btn" href={booking.url} target="_blank" rel="noreferrer">Book ↗</a>
                          </div>
                        ))}
                      </div>
                      <button
                        style={{ all: 'unset', cursor: 'pointer', color: 'var(--muted)', fontSize: 11.5, marginTop: 6 }}
                        onClick={() => { setAutoTheirs(null); setBookState('paste'); }}
                      >
                        Looks wrong? Paste their times manually instead
                      </button>
                    </>
                  )}
                  {bookState === 'paste' && (
                    <>
                      <div className="book-note">
                        Their site blocks cross-site reads from a browser, so: open{' '}
                        <a href={booking.url} target="_blank" rel="noreferrer">their booking page ↗</a>, copy the
                        visible days &amp; times, and paste below. Laze intersects them with your real calendar.
                      </div>
                      <textarea
                        value={theirText}
                        onChange={(e) => setTheirText(e.target.value)}
                        placeholder={'Monday, August 10\n9:00am  9:30am  1:00pm\nTuesday, August 11\n2:00pm  4:30pm'}
                        style={{ minHeight: 80, marginTop: 8 }}
                      />
                      {theirMatches && (
                        <div className="book-matches">
                          {theirMatches.length === 0 && <div className="book-note">No overlap with your free windows in this range — try other days on their page.</div>}
                          {theirMatches.slice(0, 4).map((m, i) => (
                            <div className="book-match" key={i}>
                              <span>
                                ✓ <b>{fmtDayLong(m.day)}, {fmtSlotTime(m.ms, m.offset)}</b>
                                <span className="why"> — fits {m.window.beforeSoft && m.window.afterSoft ? 'a fully open stretch' : `between ${m.window.before?.title || 'your morning'} and ${m.window.after?.title || 'your evening'}`}</span>
                              </span>
                              <a className="pill-btn" href={booking.url} target="_blank" rel="noreferrer">Book ↗</a>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
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
