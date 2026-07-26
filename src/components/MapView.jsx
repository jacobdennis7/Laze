import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { HOOD_COLORS } from '../data/events.js';
import { venueOf } from '../lib/geo.js';
import { routableStops, dayLegs, lodgingFor } from '../lib/schedule.js';
import { fmtTime } from '../lib/time.js';
import { MODE_ICON } from '../lib/geo.js';

const TILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const ATTR = '&copy; OpenStreetMap &copy; CARTO';

export default function MapView({ day, mode, dataVersion }) {
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    const map = L.map('leaflet-map', { zoomControl: false });
    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    L.tileLayer(TILES, { attribution: ATTR, maxZoom: 19 }).addTo(map);
    map.setView([37.7845, -122.41], 13);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => map.remove();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const stops = routableStops(day).filter((s) => s.kind !== 'flight');
    const legs = dayLegs(day, mode).filter((l) => l.from.kind !== 'flight' && l.to.kind !== 'flight');
    const lodging = lodgingFor(day);
    const pts = [];

    // lodging marker (only when a base is configured)
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

    stops.forEach((ev, i) => {
      const v = venueOf(ev);
      const color = HOOD_COLORS[v.hood] || '#555';
      const m = L.marker([v.lat, v.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div class="wp-marker" style="background:${color};width:28px;height:28px">${i + 1}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        zIndexOffset: 100 + i,
      }).addTo(layer);
      m.bindTooltip(
        `<b>${fmtTime(ev.start)} · ${ev.title}</b><span class="sub">${v.name} — ${v.hood}</span>`,
        { className: 'wp-tip' }
      );
      pts.push([v.lat, v.lng]);
    });

    legs.forEach((leg) => {
      const line = L.polyline(
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

  return <div id="leaflet-map" aria-label="Meeting map" />;
}
