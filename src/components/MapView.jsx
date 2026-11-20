import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { HOOD_COLORS } from '../data/events.js';
import { fetchNearbySpots, travelMinutes, MODE_LABEL, haversineKm, FAR_KM } from '../lib/geo.js';
import { liveMinutes } from '../lib/routes.js';
import { loadSettings } from '../lib/store.js';
import { track } from '../lib/analytics.js';
import { routableStops, dayLegs, lodgingFor, effectiveVenue, airportStops } from '../lib/schedule.js';
import { fmtTime, isoLike } from '../lib/time.js';
import { MODE_ICON } from '../lib/geo.js';
import MapSearch from './MapSearch.jsx';

// CARTO began watermarking their free basemaps ("API KEY REQUIRED"), so the
// default is OpenStreetMap's own tiles (key-less). A nicer styled provider
// (e.g. Stadia Alidade Smooth) can be swapped in via env vars — no code change.
const TILES = import.meta.env.VITE_TILES_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILES_DETAIL = import.meta.env.VITE_TILES_DETAIL_URL || TILES;
// Provider terms require visible credit — derive it from whichever tiles are configured.
const attrFor = (url) => {
  const osm = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  if (url.includes('cartocdn')) return `${osm} &copy; <a href="https://carto.com/attributions">CARTO</a>`;
  if (url.includes('stadiamaps')) return `${osm} &copy; <a href="https://stadiamaps.com/">Stadia Maps</a>`;
  return osm;
};
const ATTR = attrFor(TILES);

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

// `visible`: the map stays mounted behind the calendar so that a searched
// place, spots and the zoom survive a view switch; while hidden it has no
// size, so framing is deferred until it is shown again.
// `onPlaceFocus`: tells the app which place is selected in search (or null).
export default function MapView({ day, mode, dataVersion, onSpotSuggest, onTravel, onSelect, ghost, visible = true, onPlaceFocus }) {
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const pendingFitRef = useRef(false); // a day was framed while hidden
  const placeFocusRef = useRef(onPlaceFocus);
  placeFocusRef.current = onPlaceFocus;
  // PROTOTYPE (suggest mode): redraw when their location or the picks change.
  const ghostKey = ghost
    ? `${ghost.cfg.them ? `${ghost.cfg.them.lat},${ghost.cfg.them.lng}` : ''}|${ghost.picked.map((s) => s.ms).join(',')}`
    : '';
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
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const fitRef = useRef(null); // the pending "frame this day" call, if one is waiting on a zoom
  const genRef = useRef(0); // invalidates in-flight searches on toggle-off / re-search
  const spotCacheRef = useRef(new Map());
  const searchRef = useRef(null);

  // ---- search mode state ----
  const [searchOn, setSearchOn] = useState(false);
  const [picked, setPicked] = useState(null); // resolved place from the search bar
  const [linked, setLinked] = useState(null); // { ev, venue } meeting to measure against
  const pickedRef = useRef(null);
  pickedRef.current = picked;
  // Meet here is already running for the searched place (its bar is docked
  // below); once a time is chosen on this day the place is a stop in the route.
  const meetingHere = !!(ghost && ghost.cfg.here && ghost.cfg.them && picked
    && Math.abs(ghost.cfg.them.lat - picked.lat) < 1e-5 && Math.abs(ghost.cfg.them.lng - picked.lng) < 1e-5);
  const proposedHere = meetingHere && ghost.picked.some((s) => s.day === day);
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
    return () => {
      // Leaflet's zoom animation ends on a timer that remove() doesn't cancel;
      // if the map is torn down mid-zoom (the wordmark's "home" remounts it),
      // that callback runs against the destroyed map and throws. Its first
      // line bails when no zoom is in flight, so mark it finished.
      map._animatingZoom = false;
      map.remove();
    };
  }, []);

  useEffect(() => {
    if (placeFocusRef.current) placeFocusRef.current(searchOn && picked ? picked : null);
  }, [searchOn, picked]);

  // Shown again after being hidden: re-measure, then apply any framing that
  // was skipped while there was nothing to frame into.
  useEffect(() => {
    const map = mapRef.current;
    if (!visible || !map) return;
    map.invalidateSize({ animate: false });
    if (pendingFitRef.current && fitRef.current) {
      pendingFitRef.current = false;
      fitRef.current();
    }
  }, [visible]);

  // ---- itinerary layer ----
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const stops = routableStops(day).filter((s) => s.kind !== 'flight');
    const placed = deoverlap(stops);
    // The ride to or from a local airport is drawn; the flight itself (a hop
    // to another city) is not.
    const legs = dayLegs(day, mode).filter(
      (l) => !((l.from.kind === 'flight' || l.to.kind === 'flight') && l.intercity)
    );
    const airports = airportStops(day);
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
      const proposed = !!ev.tentative; // Meet here: the time being chosen, not on the calendar yet
      const color = HOOD_COLORS[v.hood] || '#5a6572';
      const ring = ev.virtual ? 'border:2px dashed #fff;' : '';
      const m = L.marker([lat, lng], {
        icon: L.divIcon({
          className: '',
          html: proposed
            ? `<div class="wp-marker proposed" style="width:28px;height:28px">${i + 1}</div>`
            : `<div class="wp-marker" style="background:${color};width:28px;height:28px;${ring}">${i + 1}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        zIndexOffset: 100 + i,
      }).addTo(layer);
      m.bindTooltip(
        `<b>${fmtTime(ev.start)} · ${ev.title}</b><span class="sub">${proposed ? 'Proposed — not on your calendar yet' : ev.virtual ? `Virtual · taken from ${v.label || v.name}` : `${v.name} — ${v.hood}`}</span>`,
        { className: 'wp-tip' }
      );
      // In search mode with a place picked, tapping a meeting measures the hop to
      // it; otherwise a pin opens its event, where it can be taken off the map.
      m.on('click', () => {
        if (pickedRef.current) setLinked({ ev, venue: v });
        else if (!proposed && selectRef.current) selectRef.current(ev);
      });
      pts.push([lat, lng]);
    });

    airports.forEach(({ ev, v, end }) => {
      const m = L.marker([v.lat, v.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div class="wp-marker airport" style="width:28px;height:28px">✈</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        zIndexOffset: 90,
      }).addTo(layer);
      m.bindTooltip(
        `<b>${ev.title}</b><span class="sub">${end === 'dest' ? `Lands ${fmtTime(ev.end)}` : `Departs ${fmtTime(ev.start)}`} · ${v.name}</span>`,
        { className: 'wp-tip' }
      );
      m.on('click', () => {
        if (pickedRef.current) setLinked({ ev, venue: v });
        else if (selectRef.current) selectRef.current(ev);
      });
      pts.push([v.lat, v.lng]);
    });

    legs.forEach((leg) => {
      const toProposed = !!(leg.from.tentative || leg.to.tentative);
      L.polyline(
        [
          [leg.va.lat, leg.va.lng],
          [leg.vb.lat, leg.vb.lng],
        ],
        toProposed && !leg.tight
          ? { color: '#2e7d54', weight: 3.5, dashArray: '7 6', opacity: 1 }
          : { color: leg.tight ? '#c5321f' : '#5a6572', weight: 2.5, dashArray: '6 7', opacity: 0.85 }
      ).addTo(layer);
      const mid = [(leg.va.lat + leg.vb.lat) / 2, (leg.va.lng + leg.vb.lng) / 2];
      const chip = L.marker(mid, {
        icon: L.divIcon({
          className: `leg-chip-label${leg.tight ? ' tight' : toProposed ? ' ghost' : ''}`,
          html: leg.intercity
            ? `<span>${leg.km > 500 ? '✈' : '🚆'} different cities${leg.viaFlight ? '' : leg.tight ? ` · ${leg.gapMin} min gap` : ''}</span>`
            : leg.leaveBy != null
              ? `<span>${MODE_ICON[leg.mode]} ${leg.mins} min · leave by ${fmtTime(isoLike(leg.leaveBy, leg.to.start))}</span>`
              : `<span title="Add a travel block to your calendar">${MODE_ICON[leg.mode]} ${leg.mins} min${leg.tight ? ` · ${leg.gapMin} min gap` : ''}</span>`,
          iconSize: [0, 0],
        }),
      }).addTo(layer);
      // a cross-city hop or the ride to a flight isn't a plain travel block
      if (!leg.intercity && leg.leaveBy == null && !toProposed) chip.on('click', () => travelRef.current && travelRef.current(leg));
    });

    // PROTOTYPE (suggest mode): where the other person is, and for each time
    // picked on this day the detour past them from the meetings on either side.
    // Meet here with a time chosen on this day: the place is already a stop in
    // the route above (pin, travel both ways), so no star or detour is drawn.
    const placedInRoute = !!(ghost && ghost.cfg.here && ghost.picked.some((s) => s.day === day));
    if (ghost && ghost.cfg.them && !placedInRoute) {
      const t = ghost.cfg.them;
      const tm = L.marker([t.lat, t.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div class="wp-marker them" style="width:30px;height:30px">★</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
        zIndexOffset: 300,
      }).addTo(layer);
      tm.bindTooltip(`<b>${t.name}</b><span class="sub">${ghost.cfg.here ? 'Meeting place' : 'Where they are'}</span>`, { className: 'wp-tip' });
      // only zoom to include them when they're in the same city as the day
      if (!pts.length || pts.some(([lat, lng]) => haversineKm({ lat, lng }, t) <= FAR_KM)) pts.push([t.lat, t.lng]);

      ghost.picked.filter((s) => s.day === day).forEach((s, i) => {
        const path = [s.w.anchorBefore, t, s.w.anchorAfter].filter(Boolean).map((p) => [p.lat, p.lng]);
        if (path.length > 1) {
          // white casing under the green so the detour reads on any basemap
          L.polyline(path, { color: '#ffffff', weight: 7, opacity: 0.9 }).addTo(layer);
          L.polyline(path, { color: '#2e7d54', weight: 3.5, dashArray: '7 6', opacity: 1 }).addTo(layer);
        }
        L.marker([t.lat, t.lng], {
          icon: L.divIcon({
            className: 'leg-chip-label ghost',
            html: `<span style="transform: translate(18px, ${-14 + i * 24}px)">✓ ${s.short}${s.detourMin > 5 ? ` · +${s.detourMin} min` : ' · on your way'}</span>`,
            iconSize: [0, 0],
          }),
          zIndexOffset: 310,
          interactive: false,
        }).addTo(layer);
      });
    }

    // In suggest mode the picked-time labels sit to the right of their star,
    // so leave room for them on that side.
    const labelRoom = ghost && ghost.cfg.them && !placedInRoute && ghost.picked.some((s) => s.day === day) ? 210 : 56;
    // Framing a day is done without animation: an animated zoom is queued on
    // the next frame, and a second request arriving before it runs (switching
    // day right after the map opens) could lose to it and leave the map
    // framed on the previous day. An instant jump is always the latest one.
    const fit = () => {
      if (pts.length > 1) {
        map.fitBounds(pts, { paddingTopLeft: [56, 56], paddingBottomRight: [labelRoom, 56], maxZoom: 15, animate: false });
      } else if (pts.length === 1) {
        map.setView(pts[0], 13, { animate: false });
      }
    };
    // Leaflet also ignores any zoom requested while the user's own zoom is
    // still animating; in that case wait for it to finish.
    if (fitRef.current) map.off('zoomend', fitRef.current); // drop a superseded pending fit
    fitRef.current = fit;
    if (!visibleRef.current) pendingFitRef.current = true; // no size to frame into yet
    else if (map._animatingZoom) map.once('zoomend', fit);
    else fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, mode, dataVersion, ghostKey]);

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
          <button class="spot-suggest">＋ Create a meeting here</button>
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
      track('spots_searched', { results: spots.length });
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
    // Its numbered stop in the day's route already marks the spot; a search
    // pin on top would hide the number.
    if (proposedHere) return;
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
  }, [searchOn, picked, linked, mode, proposedHere]);

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
      {/* once it is a stop in the day's route, the card would only cover the route */}
      {searchOn && picked && !proposedHere && (
        <div className="search-card">
          <div className="sc-name">{picked.name}</div>
          <div className="sc-sub">{picked.address}</div>
          <div className="sc-hint">
            {linked
              ? `~${liveMinutes(picked, linked.venue, mode) ?? travelMinutes(picked, linked.venue, mode)} min ${MODE_LABEL[mode]} to ${linked.ev.title} — tap another meeting to compare`
              : 'Tap any meeting pin to see travel time from here'}
          </div>
          {!meetingHere && (
            <button
              className="pill-btn primary"
              onClick={() => onSpotSuggest && onSpotSuggest({ ...picked, type: 'search' })}
            >
              ＋ Create a meeting here
            </button>
          )}
        </div>
      )}
    </>
  );
}
