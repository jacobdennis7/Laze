import React, { useEffect, useRef, useState } from 'react';
import { searchPlaces } from '../lib/places.js';
import { getPlaces } from '../lib/prefs.js';

// Reusable address field with the same type-ahead as map Search mode:
// 3+ chars → debounced Google Places suggestions (OSM fallback) → pick one
// and `onSelect` receives a resolved { name, address, lat, lng, hood }.
export default function AddressInput({ placeholder, initial = '', onSelect, ariaLabel }) {
  const [q, setQ] = useState(initial);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const seqRef = useRef(0);
  const suppressRef = useRef(initial || null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (q.trim() === suppressRef.current || q.trim().length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const seq = ++seqRef.current;
    debounceRef.current = setTimeout(async () => {
      try {
        // Bias results toward the user's home/office so nearby matches rank first.
        const p = getPlaces();
        const bias = p.home || p.office || null;
        const res = await searchPlaces(q.trim(), bias);
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
    try {
      const place = await r.getPlace();
      // Neighborhood-ish label: first address component after the name that
      // isn't a bare house number.
      const parts = (place.address || '').split(',').map((s) => s.trim());
      const hood =
        place.hood ||
        parts.slice(1).find((p) => p && !/^\d+[\w-]*$/.test(p) && p !== place.name) ||
        '—';
      suppressRef.current = place.address || place.name;
      setQ(place.address || place.name);
      setResults([]);
      onSelect({ ...place, hood });
    } catch { /* leave list up */ }
  }

  return (
    <div className="addr-input">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        autoComplete="off"
        onKeyDown={(e) => e.key === 'Enter' && results[0] && pick(results[0])}
      />
      {loading && <span className="addr-spin">…</span>}
      {results.length > 0 && (
        <div className="addr-results">
          {results.map((r, i) => (
            <button key={i} type="button" onClick={() => pick(r)}>
              <span className="msr-label">{r.label}</span>
              {r.sub && <span className="msr-sub">{r.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
