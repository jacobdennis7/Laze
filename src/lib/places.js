// Place search for map Search mode: Google Places autocomplete when a Maps key
// is configured (best results), Nominatim/OSM as the key-less fallback.
// Unified result shape: { label, sub, getPlace: () => Promise<{name,address,lat,lng}> }
import { loadSettings } from './store.js';

export async function searchPlaces(query, center) {
  const key = loadSettings().mapsKey;
  if (key) {
    try {
      return await googleAutocomplete(query, center, key);
    } catch { /* key may lack Places API — fall through */ }
  }
  return nominatimSearch(query, center);
}

async function googleAutocomplete(query, center, key) {
  const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
    },
    body: JSON.stringify({
      input: query,
      ...(center
        ? { locationBias: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: 30000 } } }
        : {}),
    }),
  });
  if (!r.ok) throw new Error(`Autocomplete ${r.status}`);
  const js = await r.json();
  return (js.suggestions || [])
    .map((s) => s.placePrediction)
    .filter(Boolean)
    .slice(0, 6)
    .map((p) => ({
      label: p.structuredFormat?.mainText?.text || p.text?.text || 'Unknown',
      sub: p.structuredFormat?.secondaryText?.text || '',
      getPlace: () => resolveGooglePlace(p.placeId, key),
    }));
}

async function resolveGooglePlace(placeId, key) {
  const r = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'displayName,formattedAddress,location',
    },
  });
  if (!r.ok) throw new Error(`Place details ${r.status}`);
  const js = await r.json();
  return {
    name: js.displayName?.text || 'Unknown',
    address: js.formattedAddress || '',
    lat: js.location.latitude,
    lng: js.location.longitude,
  };
}

async function nominatimSearch(query, center) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '6');
  url.searchParams.set('q', query);
  if (center) {
    // bias to the visible area without hard-bounding
    url.searchParams.set('viewbox', `${center.lng - 0.3},${center.lat + 0.3},${center.lng + 0.3},${center.lat - 0.3}`);
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Nominatim ${r.status}`);
  const js = await r.json();
  return js.map((p) => {
    const parts = p.display_name.split(', ');
    const place = {
      name: parts[0],
      address: parts.slice(0, 4).join(', '),
      lat: +p.lat,
      lng: +p.lon,
    };
    return {
      label: parts[0],
      sub: parts.slice(1, 4).join(', '),
      getPlace: async () => place,
    };
  });
}
