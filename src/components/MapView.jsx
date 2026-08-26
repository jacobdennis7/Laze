import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { HOOD_COLORS } from '../data/events.js';
import { fetchNearbySpots, travelMinutes, MODE_LABEL } from '../lib/geo.js';
import { liveMinutes } from '../lib/routes.js';
import { loadSettings } from '../lib/store.js';
import { routableStops, dayLegs, lodgingFor, effectiveVenue } from '../lib/schedule.js';
import { fmtTime } from '../lib/time.js';
import { MODE_ICON } from '../lib/geo.js';
import MapSearch from './MapSearch.jsx';

// CARTO began watermarking their free basemaps ("API KEY REQUIRED"), so the
// default is OpenStreetMap's own tiles (key-less). A nicer styled provider
// (e.g. Stadia Alidade Smooth) can be swapped in via env vars — no code change.
const TILES = import.meta.env.VITE_TILES_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILES_DETAIL = import.meta.env.VITE_TILES_DETAIL_URL || TILES;
const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const SPOT_COLORS = { cafe: '#B26234', restaurant: '#3F7D5E', bar: '#6B5B95' };
const SPOT_ICONS = { cafe: '☕', restaurant: '🍽', bar: '🍸' };

// Same-venue meetings would stack exactly — fan duplicates out in a small circle
// so every stop stays individually clickable.
function deoverlap(stops) {
  const seen = new Map();
  return stops.map((ev) => {
    const v = effectiveVenue(ev);
    const key = `${v.lat.toFixed(5)},${v.lng.toFixed(5)}`;
    const n = seen.get(key) || 0;
    seen.set(key, n + 1);
    if (n === 0) return { ev, v, lat: v.lat, lng: v.lng };
    const angle = n * 1.1 + 0.5;
    const r = 0.00022;
    return { ev, v, lat: v.lat + r * Math.cos(angle), lng: v.lng + r * Math.sin(angle) };
  });
}

export default function MapView({ day, mode, dataVersion, onSpotSuggest, onTravel }) {
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const spotLayerRef = useRef(null);
  const tileRef = useRef(null);
  const [spotsOn, setSpotsOn] = useState(false);
  // idle | loading | ok | empty | error | zoom | stale
  const [spotState, setSpotState] = useState('idle');
  const suggestRef = useRef(onSpotSuggest);
  suggestRef.current = onSpotSuggest;
  const travelRef = useRef(onTravel);
  travelRef.current = onTravel;
  const genRef = useRef(0); // invalidates in-flight searches on toggle-off / re-search
  const spotCacheRef = useRef(new Map());
  const searchRef = useRef(null);

  // ---- search mode state ----
  const [searchOn, setSearchOn] = useState(false);
  const [picked, setPicked] = useState(null); // resolved place from the search bar
  const [linked, setLinked] = useState(null); // { ev, venue } meeting to measure against
  const pickedRef = useRef(null);
  pickedRef.current = picked;
  const searchLayerRef = useRef(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const map = L.map('leaflet-map', { zoomControl: false });
    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    tileRef.current = L.tileLayer(TILES, { attribution: ATTR, maxZoom: 19 }).addTo(map);
    map.setView([37.7845, -122.41], 13);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    spotLayerRef.current = L.layerGroup().addTo(map);
    searchLayerRef.current = L.layerGroup().addTo(map);
    return () => map.remove();
  }, []);

  // ---- itinerary layer ----
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const stops = routableStops(day).filter((s) => s.kind !== 'flight');
    const placed = deoverlap(stops);
    const legs = dayLegs(day, mode).filter((l) => l.from.kind !== 'flight' && l.to.kind !== 'flight');
    const lodging = lodgingFor(day);
    const pts = [];

    if (lodging) {
      const lm = L.marker([lodging.lat, lodging.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div class="wp-marker lodging" style="width:26px;height:26px">⌂</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      }).addTo(layer);
      lm.bindTooltip(`<b>${lodging.label || lodging.name}</b><span class="sub">${lodging.address}</span>`, { className: 'wp-tip' });
      pts.push([lodging.lat, lodging.lng]);
    }

    placed.forEach(({ ev, v, lat, lng }, i) => {
      const color = HOOD_COLORS[v.hood] || '#5a6572';
      const ring = ev.virtual ? 'border:2px dashed #fff;' : '';
      const m = L.marker([lat, lng], {
        icon: L.divIcon({
          className: '',
          html: `<div class="wp-marker" style="background:${color};width:28px;height:28px;${ring}">${i + 1}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        zIndexOffset: 100 + i,
      }).addTo(layer);
      m.bindTooltip(
        `<b>${fmtTime(ev.start)} · ${ev.title}</b><span class="sub">${ev.virtual ? `Virtual · taken from ${v.label || v.name}` : `${v.name} — ${v.hood}`}</span>`,
        { className: 'wp-tip' }
      );
      // In search mode with a place picked, tapping a meeting measures the hop to it.
      m.on('click', () => {
        if (pickedRef.current) setLinked({ ev, venue: v });
      });
      pts.push([lat, lng]);
    });

    legs.forEach((leg) => {
      L.polyline(
        [
          [leg.va.lat, leg.va.lng],
          [leg.vb.lat, leg.vb.lng],
        ],
        { color: leg.tight ? '#c5321f' : '#5a6572', weight: 2.5, dashArray: '6 7', opacity: 0.85 }
      ).addTo(layer);
      const mid = [(leg.va.lat + leg.vb.lat) / 2, (leg.va.lng + leg.vb.lng) / 2];
      const chip = L.marker(mid, {
        icon: L.divIcon({
          className: `leg-chip-label${leg.tight ? ' tight' : ''}`,
          html: `<span title="Add a travel block to your calendar">${MODE_ICON[leg.mode]} ${leg.mins} min${leg.tight ? ` · ${leg.gapMin} min gap` : ''}</span>`,
          iconSize: [0, 0],
        }),
      }).addTo(layer);
      chip.on('click', () => travelRef.current && travelRef.current(leg));
    });

    if (pts.length > 1) map.fitBounds(pts, { padding: [56, 56], maxZoom: 15 });
    else if (pts.length === 1) map.setView(pts[0], 13);
  }, [day, mode, dataVersion]);

  // ---- spots layer: manual "search this area" model ----
  function renderSpots(spots) {
    const map = mapRef.current;
    const layer = spotLayerRef.current;
    layer.clearLayers();
    for (const s of spots) {
      const m = L.marker([s.lat, s.lng], {
        zIndexOffset: -100,
        icon: L.divIcon({
          className: '',
          html: `<div class="spot-dot" style="background:${SPOT_COLORS[s.type] || '#777'}">${SPOT_ICONS[s.type] || '·'}</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      }).addTo(layer);
      const el = document.createElement('div');
      el.className = 'spot-pop';
      el.innerHTML = `
        <b>${s.name}</b>
        <div class="sub">${s.type}${s.cuisine ? ` · ${s.cuisine}` : ''}${s.address ? ` · ${s.address}` : ''}</div>
        <div class="row">
          <button class="spot-suggest">＋ Suggest a time here</button>
          <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.name} ${s.address || ''} ${s.lat},${s.lng}`)}" target="_blank" rel="noreferrer">gmaps ↗</a>
        </div>`;
      el.querySelector('.spot-suggest').addEventListener('click', () => {
        map.closePopup();
        suggestRef.current && suggestRef.current(s);
      });
      m.bindPopup(el, { closeButton: true, offset: [0, -4] });
    }
  }

  async function searchHere() {
    const map = mapRef.current;
    if (!map) return;
    if (map.getZoom() < 13) {
      spotLayerRef.current.clearLayers();
      setSpotState('zoom');
      return;
    }
    const gen = ++genRef.current;
    setSpotState('loading');
    const b = map.getBounds();
    const key = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((n) => n.toFixed(3)).join(',');
    try {
      let spots = spotCacheRef.current.get(key);
      if (!spots) {
        spots = await fetchNearbySpots(b, loadSettings().mapsKey || null);
        // guarantee on-screen results regardless of provider quirks
        spots = spots.filter((s) => b.contains([s.lat, s.lng]));
        spotCacheRef.current.set(key, spots);
      }
      if (gen !== genRef.current) return; // toggled off / superseded while fetching
      renderSpots(spots);
      setSpotState(spots.length ? 'ok' : 'empty');
    } catch {
      if (gen === genRef.current) setSpotState('error');
    }
  }
  searchRef.current = searchHere;

  function toggleSpots() {
    const next = !spotsOn;
    setSpotsOn(next);
    const map = mapRef.current;
    genRef.current++; // kill anything in flight either way
    if (next) {
      tileRef.current.setUrl(TILES_DETAIL);
      searchRef.current();
      // Moving the map never auto-fetches (that's what rate-limited the free API);
      // it just marks results stale so the "Search this area" chip appears.
      map._spotsMove = () => setSpotState((s) => (s === 'ok' || s === 'empty' || s === 'zoom' ? 'stale' : s));
      map.on('moveend', map._spotsMove);
    } else {
      tileRef.current.setUrl(TILES);
      if (map._spotsMove) map.off('moveend', map._spotsMove);
      spotLayerRef.current.clearLayers();
      setSpotState('idle');
    }
  }

  // ---- search mode: pin + measure-line drawing ----
  useEffect(() => {
    const layer = searchLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!searchOn || !picked) return;
    const pin = L.marker([picked.lat, picked.lng], {
      zIndexOffset: 500,
      icon: L.divIcon({
        className: '',
        html: `<div class="search-pin">⌖</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
    }).addTo(layer);
    pin.bindTooltip(`<b>${picked.name}</b><span class="sub">${picked.address}</span>`, { className: 'wp-tip' });
    if (linked) {
      const { venue, ev } = linked;
      const mins = liveMinutes(picked, venue, mode) ?? travelMinutes(picked, venue, mode);
      L.polyline(
        [
          [picked.lat, picked.lng],
          [venue.lat, venue.lng],
        ],
        { color: '#1a73e8', weight: 3, dashArray: '4 8', opacity: 0.9 }
      ).addTo(layer);
      const mid = [(picked.lat + venue.lat) / 2, (picked.lng + venue.lng) / 2];
      L.marker(mid, {
        interactive: false,
        icon: L.divIcon({
          className: 'leg-chip-label search-link',
          html: `<span>${MODE_ICON[mode]} ~${mins} min ${MODE_LABEL[mode]} → ${ev.title}</span>`,
          iconSize: [0, 0],
        }),
      }).addTo(layer);
    }
  }, [searchOn, picked, linked, mode]);

  function toggleSearch() {
    const next = !searchOn;
    setSearchOn(next);
    if (!next) {
      setPicked(null);
      setLinked(null);
    }
  }

  function handlePick(place) {
    setPicked(place);
    setLinked(null);
    const map = mapRef.current;
    if (map) map.flyTo([place.lat, place.lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
  }

  const searchLabel =
    spotState === 'loading' ? 'Searching…'
    : spotState === 'zoom' ? 'Zoom in to see spots'
    : spotState === 'error' ? 'Search failed — try again'
    : spotState === 'stale' ? 'Search this area'
    : spotState === 'empty' ? 'Nothing here — search again?'
    : null;

  return (
    <>
      <div id="leaflet-map" aria-label="Meeting map" />
      <button className={`search-toggle pill-btn${searchOn ? ' on' : ''}`} onClick={toggleSearch}>
        {searchOn ? '✕ Search' : '🔍 Search'}
      </button>
      <button className={`spots-toggle pill-btn${spotsOn ? ' on' : ''}`} onClick={toggleSpots}>
        {spotsOn ? '✕ Spots' : '☕ Spots'}
      </button>
      {spotsOn && searchLabel && (
        <button
          className="search-area pill-btn"
          onClick={() => searchRef.current()}
          disabled={spotState === 'loading' || spotState === 'zoom'}
        >
          {searchLabel}
        </button>
      )}
      {searchOn && (
        <MapSearch
          getCenter={() => mapRef.current?.getCenter()}
          onPick={handlePick}
          onClose={toggleSearch}
        />
      )}
      {searchOn && picked && (
        <div className="search-card">
          <div className="sc-name">{picked.name}</div>
          <div className="sc-sub">{picked.address}</div>
          <div className="sc-hint">
            {linked
              ? `~${liveMinutes(picked, linked.venue, mode) ?? travelMinutes(picked, linked.venue, mode)} min ${MODE_LABEL[mode]} to ${linked.ev.title} — tap another meeting to compare`
              : 'Tap any meeting pin to see travel time from here'}
          </div>
          <button
            className="pill-btn primary"
            onClick={() => onSpotSuggest && onSpotSuggest({ ...picked, type: 'search' })}
          >
            ＋ Create a meeting here
          </button>
        </div>
      )}
    </>
  );
}
