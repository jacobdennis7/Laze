import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { HOOD_COLORS } from '../data/events.js';
import { fetchNearbySpots } from '../lib/geo.js';
import { routableStops, dayLegs, lodgingFor, effectiveVenue } from '../lib/schedule.js';
import { fmtTime } from '../lib/time.js';
import { MODE_ICON } from '../lib/geo.js';

const TILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const TILES_DETAIL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const ATTR = '&copy; OpenStreetMap &copy; CARTO';

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

export default function MapView({ day, mode, dataVersion, onSpotSuggest }) {
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const spotLayerRef = useRef(null);
  const tileRef = useRef(null);
  const [spotsOn, setSpotsOn] = useState(false);
  const [spotState, setSpotState] = useState('idle'); // idle | loading | ok | error
  const suggestRef = useRef(onSpotSuggest);
  suggestRef.current = onSpotSuggest;
  const loadSpotsRef = useRef(null);

  useEffect(() => {
    const map = L.map('leaflet-map', { zoomControl: false });
    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    tileRef.current = L.tileLayer(TILES, { attribution: ATTR, maxZoom: 19 }).addTo(map);
    map.setView([37.7845, -122.41], 13);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    spotLayerRef.current = L.layerGroup().addTo(map);
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
      L.marker(mid, {
        interactive: false,
        icon: L.divIcon({
          className: `leg-chip-label${leg.tight ? ' tight' : ''}`,
          html: `<span>${MODE_ICON[leg.mode]} ${leg.mins} min${leg.tight ? ` · ${leg.gapMin} min gap` : ''}</span>`,
          iconSize: [0, 0],
        }),
      }).addTo(layer);
    });

    if (pts.length > 1) map.fitBounds(pts, { padding: [56, 56], maxZoom: 15 });
    else if (pts.length === 1) map.setView(pts[0], 13);
  }, [day, mode, dataVersion]);

  // ---- spots layer ----
  async function loadSpots() {
    const map = mapRef.current;
    const layer = spotLayerRef.current;
    if (!map || !layer) return;
    setSpotState('loading');
    layer.clearLayers();
    try {
      const spots = await fetchNearbySpots(map.getBounds());
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
      setSpotState(spots.length ? 'ok' : 'empty');
    } catch {
      setSpotState('error');
    }
  }

  loadSpotsRef.current = loadSpots;

  function toggleSpots() {
    const next = !spotsOn;
    setSpotsOn(next);
    const map = mapRef.current;
    if (next) {
      tileRef.current.setUrl(TILES_DETAIL);
      loadSpotsRef.current();
      map._spotsHandler = () => loadSpotsRef.current();
      map.on('moveend', map._spotsHandler);
    } else {
      tileRef.current.setUrl(TILES);
      if (map._spotsHandler) map.off('moveend', map._spotsHandler);
      spotLayerRef.current.clearLayers();
      setSpotState('idle');
    }
  }

  return (
    <>
      <div id="leaflet-map" aria-label="Meeting map" />
      <button className={`spots-toggle pill-btn${spotsOn ? ' on' : ''}`} onClick={toggleSpots}>
        ☕ Spots
        {spotState === 'loading' && ' …'}
        {spotState === 'error' && ' — retry?'}
      </button>
    </>
  );
}
