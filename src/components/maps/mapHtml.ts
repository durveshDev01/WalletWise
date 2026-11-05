/**
 * The page inside the Best Card map's WebView: Mapbox GL JS with WalletWise markers.
 * GL JS draws Mapbox's own map, so no Google Maps key is needed on Android, it works the
 * same in Expo Go and in the APK, and Mapbox's required logo and attribution show by
 * themselves. Billing: one "map load" each time the page starts (50,000 free a month),
 * with tiles included.
 *
 * Messages from the app:  { type: 'state', state: MapState } and { type: 'flyTo', ... }.
 * Messages to the app:    { type: 'ready' }, { type: 'marker', id }, { type: 'moveend', lat, lon },
 *                         { type: 'press' }, { type: 'error', message }.
 */

/** Pinned so a Mapbox release can never change the map without an app update. */
export const MAPBOX_GL_VERSION = '3.33.0';

export type MapMarker = { id: string; lat: number; lon: number; emoji: string; selected: boolean; label: string };

export type MapState = {
  markers: MapMarker[];
  user: { lat: number; lon: number } | null;
  circle: { lat: number; lon: number; radiusKm: number } | null;
};

export type MapCamera = { lat: number; lon: number; zoom: number };

const css = (topPx: number) => `
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #0b0d10; overflow: hidden; }
  .ww-marker { width: 34px; height: 34px; border-radius: 17px; background: #15181d; border: 2px solid #7a6a3a;
    display: flex; align-items: center; justify-content: center; font-size: 16px; cursor: pointer; }
  .ww-marker.selected { width: 42px; height: 42px; border-radius: 21px; border-color: #d4af37; background: #2a2414; font-size: 20px; }
  .ww-user { width: 16px; height: 16px; border-radius: 8px; background: #4da3ff; border: 3px solid #ffffff; box-shadow: 0 0 0 6px rgba(77,163,255,0.25); }
  /* Controls sit below search bar, scaled down to prevent mobile screen takeover. */
  .mapboxgl-ctrl-top-left {
    top: ${topPx + 6}px !important;
    left: 8px !important;
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    gap: 4px !important;
    transform: scale(0.72) !important;
    transform-origin: top left !important;
    pointer-events: auto !important;
    z-index: 10 !important;
  }
  .mapboxgl-ctrl-top-right {
    top: ${topPx + 6}px !important;
  }
  .mapboxgl-ctrl-logo {
    margin: 0 !important;
    opacity: 0.85 !important;
  }
  .mapboxgl-ctrl-attrib.mapboxgl-compact {
    background: rgba(18,20,24,0.85) !important;
    border: 1px solid rgba(255,255,255,0.12) !important;
    border-radius: 12px !important;
    max-width: 200px !important;
    max-height: 24px !important;
    overflow: hidden !important;
  }
  .mapboxgl-ctrl-attrib a {
    color: #c9c9c9 !important;
    font-size: 10px !important;
  }
`;

/** Full HTML for the map page. The token is a public Mapbox token (pk.), as Mapbox intends for apps. */
export function mapHtml(token: string, camera: MapCamera, controlsTopPx: number): string {
  const v = MAPBOX_GL_VERSION;
  return `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link href="https://api.mapbox.com/mapbox-gl-js/v${v}/mapbox-gl.css" rel="stylesheet">
<script src="https://api.mapbox.com/mapbox-gl-js/v${v}/mapbox-gl.js"></script>
<style>${css(controlsTopPx)}</style>
</head><body><div id="map"></div>
<script>
(function () {
  var post = function (m) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
  window.onerror = function (msg) { post({ type: 'error', message: String(msg) }); };
  if (!window.mapboxgl) { post({ type: 'error', message: 'Map library did not load' }); return; }
  mapboxgl.accessToken = ${JSON.stringify(token)};
  var map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11',
    center: [${camera.lon}, ${camera.lat}],
    zoom: ${camera.zoom},
    attributionControl: false,
    logoPosition: 'top-left',
    pitchWithRotate: false,
    dragRotate: false,
    touchPitch: false
  });
  map.touchZoomRotate.disableRotation();
  // The place sheet covers the lower part of the screen; centre the map in the part you can see.
  var applyPadding = function () { map.setPadding({ top: ${controlsTopPx}, bottom: Math.round(window.innerHeight * 0.45), left: 0, right: 0 }); };
  applyPadding();
  window.addEventListener('resize', applyPadding);
  map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'top-left');

  var markers = {};
  var userMarker = null;
  var pending = null;
  var loaded = false;

  function circleGeoJson(c) {
    var pts = [], n = 64, dLat = c.radiusKm / 111, dLon = c.radiusKm / (111 * Math.cos(c.lat * Math.PI / 180));
    for (var i = 0; i <= n; i++) { var t = (i / n) * 2 * Math.PI; pts.push([c.lon + dLon * Math.cos(t), c.lat + dLat * Math.sin(t)]); }
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] }, properties: {} };
  }

  function apply(state) {
    if (!loaded) { pending = state; return; }
    // Radius circle.
    var src = map.getSource('radius');
    var data = state.circle ? circleGeoJson(state.circle) : { type: 'FeatureCollection', features: [] };
    if (src) src.setData(data);
    // You-are-here dot.
    if (state.user) {
      if (!userMarker) { var el = document.createElement('div'); el.className = 'ww-user'; userMarker = new mapboxgl.Marker({ element: el }); }
      userMarker.setLngLat([state.user.lon, state.user.lat]).addTo(map);
    } else if (userMarker) { userMarker.remove(); userMarker = null; }
    // Place markers: add new, update changed, remove gone.
    var keep = {};
    state.markers.forEach(function (m) {
      keep[m.id] = true;
      var current = markers[m.id];
      if (!current) {
        var el = document.createElement('div');
        el.className = 'ww-marker' + (m.selected ? ' selected' : '');
        el.textContent = m.emoji;
        el.title = m.label;
        el.addEventListener('click', function (ev) { ev.stopPropagation(); post({ type: 'marker', id: m.id }); });
        var marker = new mapboxgl.Marker({ element: el }).setLngLat([m.lon, m.lat]).addTo(map);
        markers[m.id] = { marker: marker, el: el, selected: m.selected };
      } else {
        if (current.selected !== m.selected) {
          current.selected = m.selected;
          current.el.className = 'ww-marker' + (m.selected ? ' selected' : '');
        }
      }
    });
    Object.keys(markers).forEach(function (id) {
      if (!keep[id]) { markers[id].marker.remove(); delete markers[id]; }
    });
  }

  map.on('load', function () {
    loaded = true;
    map.addSource('radius', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'radius-fill',
      type: 'fill',
      source: 'radius',
      paint: { 'fill-color': '#d4af37', 'fill-opacity': 0.05 }
    });
    map.addLayer({
      id: 'radius-line',
      type: 'line',
      source: 'radius',
      paint: { 'line-color': '#d4af37', 'line-width': 1.5, 'line-dasharray': [3, 2], 'line-opacity': 0.6 }
    });
    if (pending) { apply(pending); pending = null; }
    post({ type: 'ready' });
  });

  map.on('moveend', function () {
    var c = map.getCenter();
    post({ type: 'moveend', lat: Number(c.lat.toFixed(5)), lon: Number(c.lng.toFixed(5)) });
  });
  map.on('click', function () { post({ type: 'press' }); });

  window.WW = {
    state: function (s) { apply(s); },
    flyTo: function (lat, lon, zoom, durationMs) {
      map.flyTo({ center: [lon, lat], zoom: zoom, duration: durationMs || 700, essential: true });
    }
  };
})();
</script></body></html>`;
}
