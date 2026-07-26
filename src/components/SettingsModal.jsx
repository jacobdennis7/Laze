import React, { useState } from 'react';
import { loadSettings, saveSettings, getState, resetToSnapshot } from '../lib/store.js';
import { connect, listCalendars, isConnected } from '../lib/google.js';
import { testRoutesKey } from '../lib/routes.js';

export default function SettingsModal({ onClose, onSync }) {
  const [s, setS] = useState(loadSettings);
  const [cals, setCals] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [keyTest, setKeyTest] = useState(null);
  const st = getState();

  async function doTestKey() {
    setKeyTest('testing');
    setKeyTest(await testRoutesKey(s.mapsKey.trim()));
  }

  function upd(patch) {
    const next = { ...s, ...patch };
    setS(next);
    saveSettings(next);
  }

  async function doConnect() {
    setErr(null);
    setBusy(true);
    try {
      await connect(s.clientId.trim());
      const list = await listCalendars();
      setCals(list);
      if (!s.calendars) {
        // default: primary + the personal gmail if present
        upd({ calendars: list.filter((c) => c.primary || /gmail\.com$/.test(c.id)).map((c) => c.id) });
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function toggleCal(id) {
    const cur = new Set(s.calendars || []);
    cur.has(id) ? cur.delete(id) : cur.add(id);
    upd({ calendars: [...cur] });
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal">
        <div className="modal-card" style={{ width: 'min(560px, 100%)' }} role="dialog" aria-label="Connections">
          <div className="modal-head">
            <h2>Connections</h2>
            <button className="x-btn" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div className="modal-col">
            <div className="field">
              <label>Google OAuth Client ID — for live calendar</label>
              <input
                value={s.clientId}
                onChange={(e) => upd({ clientId: e.target.value })}
                placeholder="1234567890-xxxx.apps.googleusercontent.com"
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label>Google Maps Platform API key — for live drive times (optional)</label>
              <div className="field-row" style={{ alignItems: 'center' }}>
                <input
                  value={s.mapsKey}
                  onChange={(e) => { upd({ mapsKey: e.target.value }); setKeyTest(null); }}
                  placeholder="AIza…"
                  autoComplete="off"
                  style={{ flex: 1 }}
                />
                <button className="pill-btn" onClick={doTestKey} disabled={!s.mapsKey.trim() || keyTest === 'testing'}>
                  {keyTest === 'testing' ? 'Testing…' : 'Test key'}
                </button>
              </div>
              {keyTest && keyTest !== 'testing' && (
                <div style={{ fontSize: 12.5, marginTop: 6, color: keyTest.ok ? 'var(--ok)' : 'var(--alert)' }}>
                  {keyTest.ok ? `✓ Routes API working — ${keyTest.detail}` : `✕ ${keyTest.detail}`}
                </div>
              )}
            </div>
            <div className="field">
              <label>Display timezone for synced events</label>
              <select value={s.tz} onChange={(e) => upd({ tz: e.target.value })}>
                <option value="America/Los_Angeles">Pacific (SF trip)</option>
                <option value="America/New_York">Eastern (home)</option>
              </select>
            </div>

            <div className="copy-row" style={{ flexWrap: 'wrap' }}>
              <button className="pill-btn primary" onClick={doConnect} disabled={busy || !s.clientId.trim()}>
                {busy ? 'Connecting…' : isConnected() ? 'Reconnect Google' : 'Connect Google'}
              </button>
              <button
                className="pill-btn"
                onClick={() => onSync(s)}
                disabled={!isConnected() || st.syncing}
              >
                {st.syncing ? 'Syncing…' : 'Sync now'}
              </button>
              {st.source === 'live' && (
                <button className="pill-btn" onClick={resetToSnapshot}>Back to snapshot</button>
              )}
            </div>
            {err && (
              <div style={{ color: 'var(--alert)', fontSize: 13, marginTop: 10 }}>
                {err}
                {/popup/i.test(err) && (
                  <div style={{ color: 'var(--muted)', marginTop: 4 }}>
                    This embedded preview blocks sign-in popups — open <b>http://localhost:5174</b> in your regular
                    browser (Chrome/Safari) and connect there. Everything else works in both.
                  </div>
                )}
              </div>
            )}
            {st.error && <div style={{ color: 'var(--alert)', fontSize: 13, marginTop: 10 }}>{st.error}</div>}

            {cals && (
              <div className="field" style={{ marginTop: 14 }}>
                <label>Calendars to include</label>
                {cals.map((c) => (
                  <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      id={`cal-${c.id}`}
                      checked={(s.calendars || []).includes(c.id)}
                      onChange={() => toggleCal(c.id)}
                    />
                    <label htmlFor={`cal-${c.id}`} style={{ all: 'unset', cursor: 'pointer' }}>{c.label}</label>
                  </div>
                ))}
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--hairline)', marginTop: 16, paddingTop: 12, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
              <b style={{ color: 'var(--ink)' }}>One-time setup</b> (≈5 min, see README for detail):
              <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                <li>console.cloud.google.com → new project → enable <b>Google Calendar API</b> (+ <b>Routes API</b> for drive times)</li>
                <li>OAuth consent screen → External → add yourself as a test user</li>
                <li>Credentials → OAuth Client ID → Web app → authorized JS origin <code>http://localhost:5174</code></li>
                <li>Paste the Client ID (and an API key) above, Connect, then Sync</li>
              </ol>
              Tokens stay in this browser; scope is read-only.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
