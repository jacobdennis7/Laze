import React, { useEffect, useRef, useState } from 'react';
import { searchPlaces } from '../lib/places.js';

// Maps-style type-ahead: debounced suggestions under the bar; picking one
// resolves coordinates and hands the place up to MapView.
export default function MapSearch({ getCenter, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const debounceRef = useRef(null);
  const seqRef = useRef(0);
  const inputRef = useRef(null);
  const suppressRef = useRef(null); // don't re-search the name we just picked

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (q.trim() === suppressRef.current) {
      setResults([]);
      setLoading(false);
      return;
    }
    if (q.trim().length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const seq = ++seqRef.current;
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchPlaces(q.trim(), getCenter());
        if (seq === seqRef.current) {
          setResults(res);
          setLoading(false);
        }
      } catch {
        if (seq === seqRef.current) {
          setResults([]);
          setLoading(false);
        }
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function pick(r) {
    setResolving(true);
    try {
      const place = await r.getPlace();
      suppressRef.current = place.name;
      onPick(place);
      setResults([]);
      setQ(place.name);
    } catch { /* leave the list up */ }
    setResolving(false);
  }

  return (
    <div className="map-search">
      <div className="map-search-bar">
        <span className="ms-icon">🔍</span>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a place…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) pick(results[0]);
            if (e.key === 'Escape') onClose();
          }}
          aria-label="Search a place"
        />
        {(loading || resolving) && <span className="ms-spin">…</span>}
        <button className="x-btn" onClick={onClose} aria-label="Exit search">✕</button>
      </div>
      {results.length > 0 && (
        <div className="map-search-results">
          {results.map((r, i) => (
            <button key={i} onClick={() => pick(r)}>
              <span className="msr-label">{r.label}</span>
              {r.sub && <span className="msr-sub">{r.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
