// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — Earth engine
// The real planet is the cemetery. Two renderers, one API:
//   · Google Photorealistic 3D Maps (Maps JS API, maps3d) —
//     true Google-Earth photorealism; needs an API key.
//   · Keyless fallback: Leaflet + Esri World Imagery satellite
//     tiles — works today with zero setup (demo mode).
// Public surface used by the UI:
//   init(), flyTo({lat,lng,range}), addMemorialMarker(m),
//   setPlacementMode(bool), getCenter(), geocode(q), reverseGeocode(lat,lng)
// Callbacks: onMemorialClick(m), onPlaceAt({lat,lng}), onRBVClick()
// ============================================================
import { GOOGLE_MAPS_API_KEY, HAS_MAPS3D } from './config.js?v=6';
import { RBV } from './social.js?v=6';
import { icon as uiIcon, speciesIcon, speciesKey, rainbowMark } from './icons.js?v=6';

/**
 * The view of the whole planet from space.
 *
 * `range` is metres from the camera to the centre point; 17,500km puts
 * the full disc in frame with space around it. Centred over the
 * Americas rather than mid-ocean, so the opening frame reads as Earth
 * immediately.
 *
 * SATELLITE, not HYBRID: at planetary range the hybrid layer serves a
 * featureless blue base with no continents at all. Labels are only
 * useful once you are close to the ground anyway, so the mode is
 * switched on descent.
 */
export const GLOBE = {
  lat: 15, lng: -60,
  range: 17_500_000,   // the framing we want to end on
};
const ORBIT_MODE = 'SATELLITE';
const GROUND_MODE = 'HYBRID';

/**
 * PinElement takes a DOM node for its glyph, so our SVG icons can be
 * dropped straight in — no emoji glyph, and no dependence on whatever
 * emoji font the visitor's platform happens to ship.
 */
function glyphNode(markup, color = '#2a2210') {
  const el = document.createElement('div');
  el.style.cssText = `display:flex;align-items:center;justify-content:center;color:${color};width:100%;height:100%`;
  el.innerHTML = markup;
  const svg = el.querySelector('svg');
  if (svg) { svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%'); }
  return el;
}

export class EarthView {
  constructor(container) {
    this.container = container;
    this.mode = HAS_MAPS3D ? 'google3d' : 'satellite';
    this.placement = false;
    this.markers = new Map(); // memorial.id -> marker
    this.charityMarkers = new Map(); // charity.id -> marker
    this.onMemorialClick = null;
    this.onCharityClick = null;
    this.onPlaceAt = null;
    this.onRBVClick = null;
    this._ready = null;
  }

  init() {
    this._ready ||= (this.mode === 'google3d' ? this._initGoogle() : this._initLeaflet())
      .catch(err => {
        console.log('Earth: Google 3D failed, falling back to satellite —', err.message);
        this.mode = 'satellite';
        return this._initLeaflet();
      });
    return this._ready;
  }

  // ---------------- Google Photorealistic 3D ----------------
  async _loadMapsAPI() {
    if (window.google?.maps?.importLibrary) return;
    // Official bootstrap loader
    /* eslint-disable */
    (g => { var h, a, k, p = "The Google Maps JavaScript API", c = "google", l = "importLibrary", q = "__ib__", m = document, b = window; b = b[c] || (b[c] = {}); var d = b.maps || (b.maps = {}), r = new Set, e = new URLSearchParams, u = () => h || (h = new Promise(async (f, n) => { await (a = m.createElement("script")); e.set("libraries", [...r] + ""); for (k in g) e.set(k.replace(/[A-Z]/g, t => "_" + t[0].toLowerCase()), g[k]); e.set("callback", c + ".maps." + q); a.src = `https://maps.${c}apis.com/maps/api/js?` + e; d[q] = f; a.onerror = () => h = n(Error(p + " could not load.")); a.nonce = m.querySelector("script[nonce]")?.nonce || ""; m.head.append(a) })); d[l] ? console.log(p + " only loads once.") : d[l] = (f, ...n) => r.add(f) && u().then(() => d[l](f, ...n)) })({ key: GOOGLE_MAPS_API_KEY, v: 'alpha' });
    /* eslint-enable */
  }

  async _initGoogle() {
    await this._loadMapsAPI();
    const { Map3DElement } = await google.maps.importLibrary('maps3d');
    // Open on the whole planet hanging in space, not already zoomed
    // into one valley: the globe is the map of every place a companion
    // ever loved, and choosing one should be a descent from orbit.
    // Initialised at ground range over Rainbow Bridge Valley, NOT at
    // orbit. Cold-starting this element at any planetary range leaves
    // Google's tile pipeline with nothing to stream: the planet comes
    // up as a featureless blue disc, or the loader stalls on its
    // spinner and never resolves. A close seed always streams, so the
    // camera is pulled back to orbit once tiles are up — which also
    // makes a better opening than starting wide: the bridge, then the
    // whole world it sits on.
    const map = new Map3DElement({
      center: { lat: RBV.lat, lng: RBV.lng, altitude: 1250 },
      range: 2800, tilt: 60, heading: 25,
      mode: GROUND_MODE,
    });
    map.style.width = '100%';
    map.style.height = '100%';
    this.container.appendChild(map);
    this.map3d = map;
    this.atOrbit = true;

    // Terrain clicks (for placement mode)
    map.addEventListener('gmp-click', (e) => {
      if (this.placement && e.position && this.onPlaceAt) {
        this.onPlaceAt({ lat: e.position.lat, lng: e.position.lng });
      }
    });

    await this._addRBVMarkerGoogle();
    return this;
  }

  async _addRBVMarkerGoogle() {
    const { Marker3DInteractiveElement } = await google.maps.importLibrary('maps3d');
    const { PinElement } = await google.maps.importLibrary('marker');
    const pin = new PinElement({ glyph: glyphNode(uiIcon('crest', { size: 18 })), scale: 1.8, background: '#e8c96a', borderColor: '#7a5f1e' });
    const m = new Marker3DInteractiveElement({
      position: { lat: RBV.lat, lng: RBV.lng, altitude: 40 },
      altitudeMode: 'RELATIVE_TO_GROUND', extruded: true,
      label: 'RAINBOW BRIDGE VALLEY — Enter',
    });
    m.append(pin);
    m.addEventListener('gmp-click', () => this.onRBVClick?.());
    this.map3d.append(m);
  }

  async _addMarkerGoogle(mem) {
    const { Marker3DInteractiveElement } = await google.maps.importLibrary('maps3d');
    const { PinElement } = await google.maps.importLibrary('marker');
    // Prominent: large gold pin on a tall extruded stem, name always visible
    const pin = new PinElement({
      glyph: glyphNode(speciesIcon(speciesKey(mem.species || ''), { size: 16 })), glyphColor: '#2a2210', scale: 1.6,
      background: '#e8c96a', borderColor: '#7a5f1e',
    });
    const marker = new Marker3DInteractiveElement({
      position: { lat: mem.lat, lng: mem.lng, altitude: 16 },
      altitudeMode: 'RELATIVE_TO_GROUND', extruded: true,
      label: mem.petName,
    });
    marker.append(pin);
    marker.addEventListener('gmp-click', () => this.onMemorialClick?.(mem));
    this.map3d.append(marker);
    return marker;
  }

  // ---------------- Candidate placement spots ----------------
  // When someone flies to an address, show a clear grid of glowing
  // "place a memorial here" spots around it — click one to begin.
  async showCandidateSpots(center) {
    this.clearCandidateSpots();
    this._spots = [];
    const D = 0.00016; // ≈ 15 m spacing
    const offsets = [
      [0, 0], [D, 0], [-D, 0], [0, D], [0, -D],
      [D, D], [D, -D], [-D, D], [-D, -D],
      [2 * D, 0], [-2 * D, 0],
    ];
    for (const [i, [dLat, dLng]] of offsets.entries()) {
      const pos = { lat: center.lat + dLat, lng: center.lng + dLng };
      if (this.mode === 'google3d') {
        const { Marker3DInteractiveElement } = await google.maps.importLibrary('maps3d');
        const { PinElement } = await google.maps.importLibrary('marker');
        const pin = new PinElement({ glyph: glyphNode(uiIcon('paw', { size: 12 }), '#14260f'), scale: 1.05, background: '#79c164', borderColor: '#2f5c28', glyphColor: '#14260f' });
        const m = new Marker3DInteractiveElement({
          position: { ...pos, altitude: 3 }, altitudeMode: 'RELATIVE_TO_GROUND', extruded: true,
          // Only the centre spot is labelled. These sit ~15m apart, so
          // eleven copies of the same caption pile into an illegible
          // stack — the pin already says what it is.
          label: i === 0 ? 'Available — place here' : undefined,
        });
        m.append(pin);
        m.addEventListener('gmp-click', () => this.onPlaceAt?.(pos));
        this.map3d.append(m);
        this._spots.push(m);
      } else {
        const spotIcon = L.divIcon({ className: '', html: `<div class="em-spot">${uiIcon('paw', { size: 15 })}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
        const m = L.marker([pos.lat, pos.lng], { icon: spotIcon }).addTo(this.leaflet);
        m.bindTooltip('Available — place a memorial here', { direction: 'top' });
        m.on('click', () => this.onPlaceAt?.(pos));
        this._spots.push(m);
      }
    }
  }

  clearCandidateSpots() {
    for (const s of this._spots || []) {
      if (this.mode === 'google3d') s.remove();
      else this.leaflet.removeLayer(s);
    }
    this._spots = [];
  }

  // ---------------- Ground-level views ----------------
  // "Ground view": drop the photorealistic 3D camera to yard height
  // and orbit slightly — a walk-around recreation of the actual place.
  groundView({ lat, lng }) {
    if (this.mode === 'google3d' && this.map3d) {
      this.map3d.flyCameraTo({
        endCamera: { center: { lat, lng, altitude: 4 }, range: 55, tilt: 80, heading: 35 },
        durationMillis: 2200,
      });
      // gentle orbit once we arrive, so the place reveals itself
      setTimeout(() => {
        try {
          this.map3d.flyCameraAround({
            camera: { center: { lat, lng, altitude: 4 }, range: 55, tilt: 80 },
            durationMillis: 24000, rounds: 1,
          });
        } catch {}
      }, 2400);
      return true;
    }
    if (this.leaflet) { this.leaflet.flyTo([lat, lng], 19, { duration: 1.4 }); }
    return false; // satellite can't go lower — caller explains
  }

  stopOrbit() {
    try { this.map3d?.stopCameraAnimation(); } catch {}
  }

  // Real Google Street View imagery at (or near) the location.
  // Returns the panorama; throws if unavailable / no key.
  async openStreetView(lat, lng, container) {
    if (this.mode !== 'google3d') {
      throw new Error('Street View needs the Google Maps key — click Enable 3D first.');
    }
    const sv = await google.maps.importLibrary('streetView');
    const svc = new sv.StreetViewService();
    const { data } = await svc.getPanorama({
      location: { lat, lng }, radius: 150,
      source: sv.StreetViewSource?.OUTDOOR || 'outdoor',
    }); // rejects if no imagery nearby
    container.innerHTML = '';
    return new sv.StreetViewPanorama(container, {
      pano: data.location.pano,
      pov: { heading: 0, pitch: 5 }, zoom: 0.7,
      addressControl: false, fullscreenControl: true, motionTracking: false,
    });
  }

  // ---------------- Leaflet satellite fallback ----------------
  async _loadLeaflet() {
    if (window.L) return;
    await new Promise((res, rej) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js?v=6';
      s.onload = res; s.onerror = () => rej(new Error('Leaflet failed to load'));
      document.head.appendChild(s);
    });
  }

  async _initLeaflet() {
    await this._loadLeaflet();
    const map = L.map(this.container, { zoomControl: false, attributionControl: true })
      .setView([RBV.lat, RBV.lng], 15);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    }).addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, opacity: 0.9,
    }).addTo(map);
    this.leaflet = map;

    map.on('click', (e) => {
      if (this.placement && this.onPlaceAt) this.onPlaceAt({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    // RBV — the grand entrance
    const rbvIcon = L.divIcon({ className: '', html: `<div class="em-marker em-rbv">${rainbowMark({ size: 30 })}<span>RAINBOW BRIDGE VALLEY</span></div>`, iconSize: [46, 46], iconAnchor: [23, 40] });
    L.marker([RBV.lat, RBV.lng], { icon: rbvIcon, zIndexOffset: 1000 })
      .addTo(map).on('click', () => this.onRBVClick?.());
    return this;
  }

  _addMarkerLeaflet(mem) {
    const icon = L.divIcon({
      className: '',
      html: `<div class="em-marker">${speciesIcon(speciesKey(mem.species || ''), { size: 21 })}</div>`,
      iconSize: [34, 34], iconAnchor: [17, 30],
    });
    const marker = L.marker([mem.lat, mem.lng], { icon }).addTo(this.leaflet);
    marker.on('click', () => this.onMemorialClick?.(mem));
    return marker;
  }

  // ---------------- Charity Sanctuaries ----------------
  async _addCharityMarkerGoogle(ch) {
    if (!ch.lat || !ch.lng) return null;
    const { Marker3DInteractiveElement } = await google.maps.importLibrary('maps3d');
    const { PinElement } = await google.maps.importLibrary('marker');
    const pin = new PinElement({
      glyph: glyphNode(uiIcon('heart', { size: 16 }), '#ffffff'),
      glyphColor: '#ffffff',
      scale: 1.5,
      background: '#2ecc71',
      borderColor: '#27ae60',
    });
    const marker = new Marker3DInteractiveElement({
      position: { lat: ch.lat, lng: ch.lng, altitude: 25 },
      altitudeMode: 'RELATIVE_TO_GROUND', extruded: true,
      label: `Rescue: ${ch.name}`,
    });
    marker.append(pin);
    marker.addEventListener('gmp-click', () => this.onCharityClick?.(ch));
    this.map3d.append(marker);
    return marker;
  }

  _addCharityMarkerLeaflet(ch) {
    if (!ch.lat || !ch.lng) return null;
    const icon = L.divIcon({
      className: '',
      html: `<div class="em-marker em-charity-pin" title="${ch.name}">${uiIcon('heart', { size: 18 })}</div>`,
      iconSize: [36, 36], iconAnchor: [18, 32],
    });
    const marker = L.marker([ch.lat, ch.lng], { icon }).addTo(this.leaflet);
    marker.bindTooltip(`<b>${ch.name}</b><br><span style="font-size:11px;color:#ffd700">${ch.cat}</span>`, { direction: 'top' });
    marker.on('click', () => this.onCharityClick?.(ch));
    return marker;
  }

  async addCharityMarker(ch) {
    if (!ch.lat || !ch.lng || this.charityMarkers.has(ch.id)) return;
    const marker = this.mode === 'google3d'
      ? await this._addCharityMarkerGoogle(ch)
      : this._addCharityMarkerLeaflet(ch);
    if (marker) this.charityMarkers.set(ch.id, marker);
  }

  // ---------------- Shared API ----------------
  async addMemorialMarker(mem) {
    if (this.markers.has(mem.id)) return;
    const marker = this.mode === 'google3d'
      ? await this._addMarkerGoogle(mem)
      : this._addMarkerLeaflet(mem);
    this.markers.set(mem.id, marker);
  }

  /**
   * Descend from orbit to a place on Earth.
   *
   * The descent is deliberately longer when starting from the globe:
   * a 2.6s move from 20,000km reads as a cut, while ~5s reads as
   * travelling. Tilt is introduced on the way down so the camera
   * arrives looking across the place rather than straight at it.
   */
  flyTo({ lat, lng, range = 320, zoom = 18, tilt = 62, heading = 0, duration } = {}) {
    if (this.mode === 'google3d' && this.map3d) {
      const fromOrbit = this.atOrbit;
      this.atOrbit = false;
      // Labels and roads are worth having on the ground, and actively
      // harmful from orbit (see GLOBE).
      this.map3d.mode = GROUND_MODE;
      this.map3d.flyCameraTo({
        endCamera: {
          center: { lat, lng, altitude: 120 },
          range, tilt, heading,
        },
        durationMillis: duration ?? (fromOrbit ? 5200 : 2600),
      });
    } else if (this.leaflet) {
      this.leaflet.flyTo([lat, lng], zoom, { duration: 2.2 });
    }
    return this;
  }

  /** Pull back out until the whole planet is in frame again. */
  flyToOrbit({ lat = GLOBE.lat, lng = GLOBE.lng, duration = 3400 } = {}) {
    if (this.mode === 'google3d' && this.map3d) {
      this.atOrbit = true;
      this.map3d.flyCameraTo({
        endCamera: { center: { lat, lng, altitude: 0 }, range: GLOBE.range, tilt: 0, heading: 0 },
        durationMillis: duration,
      });
      // Drop the label layer only once the ascent is under way, so the
      // switch is hidden by the movement rather than popping in frame.
      setTimeout(() => { if (this.atOrbit) this.map3d.mode = ORBIT_MODE; }, duration * 0.55);
    } else if (this.leaflet) {
      this.leaflet.flyTo([lat, lng], 3, { duration: 2.6 });
    }
    return this;
  }

  /**
   * Settle the camera into the orbit framing and let imagery stream.
   *
   * There is no auto-rotation, deliberately. Driving the globe with a
   * repeating flyCameraTo corrupts the camera — overlapping animations
   * leave `range` at 0 and the planet renders as a featureless blue
   * disc — as well as preventing tiles from ever resolving and burning
   * Maps quota on every idle second. A still Earth loads sharp; a
   * spinning one never finishes loading.
   */
  settleOrbit({ delay = 2600, duration = 5200 } = {}) {
    if (this.mode !== 'google3d' || !this.map3d) return this;
    this.atOrbit = true;
    // Let the seed framing stream in first, then rise to the full
    // disc. Animating (rather than assigning `range`) keeps the loaded
    // tiles on screen for the whole climb.
    clearTimeout(this._settle);
    this._settle = setTimeout(() => {
      if (!this.atOrbit) return;          // someone already flew somewhere
      this.map3d.mode = ORBIT_MODE;
      this.map3d.flyCameraTo({
        endCamera: { center: { lat: GLOBE.lat, lng: GLOBE.lng, altitude: 0 }, range: GLOBE.range, tilt: 0, heading: 0 },
        durationMillis: duration,
      });
    }, delay);
    return this;
  }

  flyHome() { this.flyTo({ lat: RBV.lat, lng: RBV.lng, range: 2800, zoom: 15 }); }

  getCenter() {
    if (this.mode === 'google3d' && this.map3d) {
      const c = this.map3d.center;
      return { lat: c.lat, lng: c.lng };
    }
    const c = this.leaflet.getCenter();
    return { lat: c.lat, lng: c.lng };
  }

  setPlacementMode(on) {
    this.placement = on;
    this.container.style.cursor = on ? 'crosshair' : '';
  }

  // ---------------- Geocoding ----------------
  async geocode(q) {
    if (this.mode === 'google3d') {
      const { Geocoder } = await google.maps.importLibrary('geocoding');
      const r = await new Geocoder().geocode({ address: q });
      const g = r.results?.[0];
      if (!g) throw new Error('No results');
      return { lat: g.geometry.location.lat(), lng: g.geometry.location.lng(), name: g.formatted_address };
    }
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { 'Accept-Language': 'en' } });
    const j = await res.json();
    if (!j.length) throw new Error('No results');
    return { lat: +j[0].lat, lng: +j[0].lon, name: j[0].display_name };
  }

  async reverseGeocode(lat, lng) {
    try {
      if (this.mode === 'google3d') {
        const { Geocoder } = await google.maps.importLibrary('geocoding');
        const r = await new Geocoder().geocode({ location: { lat, lng } });
        return r.results?.[0]?.formatted_address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16`,
        { headers: { 'Accept-Language': 'en' } });
      const j = await res.json();
      return j.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch {
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  }
}
