// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — Time-reactive UI theme
//
// The interface breathes with the same clock as the world.
// `ambience.js` already tells the 3D valley what hour and season
// it is; this module carries that same signal into the DOM as CSS
// custom properties, so chrome, panels, glows and the spectrum ramp
// drift from dawn rose → daylight → dusk amber → deep night indigo
// while the visitor is inside the site.
//
// Contract: everything is a CSS variable on <html>. Nothing here
// knows about any particular component. Subscribe with onChange()
// to react in canvas-land (see atmosphere.js).
// ============================================================
import { getDayPhase, getSeason, SEASON_STYLE, MOODS } from './ambience.js?v=9';

// Colours are stored as "r g b" triplets so CSS can compose alphas:
//   background: rgb(var(--surface) / 0.86)
const PALETTES = {
  dawn: {
    label: 'Dawn',
    ink: '18 20 30',
    surface: '30 28 40',
    text: '250 242 232',
    accent: '233 178 122',        // apricot gold
    accentHi: '255 214 164',
    accentInk: '46 26 14',
    glow: '244 178 128',
    sky: ['#2b2740', '#6f5a7a', '#d79a86', '#f6c9a0'],
    spectrum: ['#e88a8a', '#f0ab7a', '#f2d08a', '#a8cf96', '#8ab9d8', '#9d9ada', '#c99ad0'],
    stars: 0.35,
    aurora: 0.12,
  },
  sunlit: {
    label: 'Sunlit Daylight',
    ink: '16 22 20',
    surface: '26 34 30',
    text: '246 241 228',
    accent: '214 176 84',         // the site's home gold (5600K)
    accentHi: '240 208 118',
    accentInk: '38 30 12',
    glow: '232 201 106',
    sky: ['#3a5f7d', '#7fb2d9', '#c8dce8', '#f2e2c4'],
    spectrum: ['#e88a7a', '#f2c063', '#e8dd7a', '#8fce8a', '#7ab2e0', '#9a8fd8', '#c98fd0'],
    stars: 0,
    aurora: 0,
  },
  day: {
    label: 'Daylight',
    ink: '16 22 20',
    surface: '26 34 30',
    text: '246 241 228',
    accent: '214 176 84',         // the site's home gold
    accentHi: '240 208 118',
    accentInk: '38 30 12',
    glow: '232 201 106',
    sky: ['#3a5f7d', '#7fb2d9', '#c8dce8', '#f2e2c4'],
    spectrum: ['#e88a7a', '#f2c063', '#e8dd7a', '#8fce8a', '#7ab2e0', '#9a8fd8', '#c98fd0'],
    stars: 0,
    aurora: 0,
  },
  dusk: {
    label: 'Dusk',
    ink: '20 16 26',
    surface: '34 26 36',
    text: '250 238 226',
    accent: '236 164 86',         // low amber sun
    accentHi: '255 198 118',
    accentInk: '44 24 8',
    glow: '250 166 96',
    sky: ['#241d3a', '#4a3a6a', '#c06a58', '#f2a95f'],
    spectrum: ['#f09a72', '#f5b45f', '#e8c96a', '#8fc48f', '#6fa8d8', '#9282d8', '#c682cc'],
    stars: 0.45,
    aurora: 0.25,
  },
  night: {
    label: 'Night',
    ink: '9 12 22',
    surface: '18 23 38',
    text: '232 238 250',
    accent: '212 184 118',        // lamplight gold, cooled
    accentHi: '245 224 160',
    accentInk: '24 20 10',
    glow: '178 198 255',
    sky: ['#05070f', '#101a33', '#22304f', '#3a4668'],
    spectrum: ['#e0857f', '#e8ab6a', '#e8d98a', '#8fd0a4', '#7ab8e8', '#a49ae8', '#cf9ada'],
    stars: 1,
    aurora: 0.55,
  },
  blessing: {
    label: 'Rain Blessing',
    ink: '12 18 28',
    surface: '22 30 46',
    text: '248 244 255',
    accent: '224 186 255',        // iridescent prismatic lavender-gold
    accentHi: '255 230 190',
    accentInk: '32 18 44',
    glow: '210 180 255',
    sky: ['#18345c', '#5a78aa', '#b8a4d8', '#f0d8e8'],
    spectrum: ['#ff7e7e', '#ffa85c', '#ffe066', '#7ee8a2', '#66ccff', '#a088ff', '#f088e8'],
    stars: 0.15,
    aurora: 0.40,
  },
};

// Season tints the accent-adjacent surfaces very slightly, so
// spring feels different from winter without fighting the phase.
const SEASON_TINT = {
  spring: { bloom: '#f2b0cc', name: 'Spring' },
  summer: { bloom: '#f3d84a', name: 'Summer' },
  autumn: { bloom: '#e0913a', name: 'Autumn' },
  winter: { bloom: '#dbe8f5', name: 'Winter' },
};

function lerp(a, b, t) { return a + (b - a) * t; }

function parseTriplet(s) { return s.split(' ').map(Number); }
function fmtTriplet(a) { return a.map(v => Math.round(v)).join(' '); }

function mixTriplet(a, b, t) {
  const A = parseTriplet(a), B = parseTriplet(b);
  return fmtTriplet(A.map((v, i) => lerp(v, B[i], t)));
}

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((v, i) => lerp(v, B[i], t)));
}

// The phase boundaries are hard edges in ambience.js (07:59 is dawn,
// 08:00 is day). For the UI that reads as a jump, so we cross-fade the
// last/first 12% of each phase into its neighbour.
const ORDER = ['night', 'dawn', 'sunlit', 'dusk'];
function nextPhase(key) {
  const normKey = key === 'day' ? 'sunlit' : key;
  const idx = ORDER.indexOf(normKey);
  return idx >= 0 ? ORDER[(idx + 1) % ORDER.length] : 'sunlit';
}
const BLEND = 0.12;

function blendedPalette(phase) {
  const normKey = phase?.key === 'day' ? 'sunlit' : (phase?.key || 'sunlit');
  const cur = PALETTES[normKey] || PALETTES.sunlit;
  if (!phase || phase.t === undefined || phase.t < 1 - BLEND) return { pal: cur, blendT: 0, nextPal: cur };
  const nxt = PALETTES[nextPhase(normKey)] || PALETTES.sunlit;
  const t = (phase.t - (1 - BLEND)) / BLEND;   // 0 → 1 across the seam
  return { pal: cur, nextPal: nxt, blendT: Math.min(1, Math.max(0, t)) };
}

export const Theme = {
  phase: null,
  season: null,
  mood: 'clear',
  _subs: new Set(),
  _timer: null,

  /** Subscribe to phase/season/mood changes. Returns an unsubscribe fn. */
  onChange(fn) {
    this._subs.add(fn);
    if (this.phase) fn(this.snapshot());
    return () => this._subs.delete(fn);
  },

  /** Everything a consumer (canvas, 3D, UI copy) needs, resolved. */
  snapshot() {
    const { pal, nextPal, blendT } = blendedPalette(this.phase);
    const sky = pal.sky.map((c, i) => mixHex(c, nextPal.sky[i], blendT));
    const spectrum = pal.spectrum.map((c, i) => mixHex(c, nextPal.spectrum[i], blendT));
    return {
      key: this.phase.key,
      t: this.phase.t,
      label: pal.label,
      season: this.season,
      seasonName: SEASON_STYLE[this.season].name,
      mood: this.mood,
      moodLabel: (MOODS[this.mood] || MOODS.clear).label,
      sky,
      spectrum,
      accent: `rgb(${mixTriplet(pal.accent, nextPal.accent, blendT)})`,
      glow: `rgb(${mixTriplet(pal.glow, nextPal.glow, blendT)})`,
      stars: lerp(pal.stars, nextPal.stars, blendT),
      aurora: lerp(pal.aurora, nextPal.aurora, blendT),
      bloom: SEASON_TINT[this.season].bloom,
      // Rain makes the rainbow the brightest thing in the valley —
      // the chrome follows suit.
      vividness: (MOODS[this.mood] || MOODS.clear).rainbow,
    };
  },

  /** Pin the interface to a phase, ignoring the clock (dev / preview). */
  forcePhase(key) {
    this._forced = key ? { key, t: 0.5 } : null;
    this.apply();
  },

  /** Recompute from the real clock and push to CSS + subscribers. */
  apply() {
    this.phase = this._forced || getDayPhase();
    this.season = getSeason();

    const { pal, nextPal, blendT } = blendedPalette(this.phase);
    const snap = this.snapshot();
    const r = document.documentElement;
    const v = (k, val) => r.style.setProperty(k, val);

    const mix = (k) => mixTriplet(pal[k], nextPal[k], blendT);

    v('--ink', mix('ink'));
    v('--surface', mix('surface'));
    v('--text', mix('text'));
    v('--accent', mix('accent'));
    v('--accent-hi', mix('accentHi'));
    v('--accent-ink', mix('accentInk'));
    v('--glow', mix('glow'));

    snap.sky.forEach((c, i) => v(`--sky-${i + 1}`, c));
    snap.spectrum.forEach((c, i) => v(`--spec-${i + 1}`, c));
    v('--spectrum', `linear-gradient(90deg, ${snap.spectrum.join(', ')})`);
    v('--bloom', snap.bloom);
    v('--stars-opacity', snap.stars.toFixed(3));
    v('--vividness', snap.vividness.toFixed(2));

    r.dataset.phase = this.phase.key;
    r.dataset.season = this.season;
    r.dataset.mood = this.mood;

    this._subs.forEach(fn => { try { fn(snap); } catch (e) { console.log('[theme]', e); } });
    return snap;
  },

  /** Live weather arrives asynchronously; fold it in when it does. */
  setMood(mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    this.apply();
  },

  /** Boot: apply immediately, then follow the clock. */
  init() {
    this.apply();
    clearInterval(this._timer);
    this._timer = setInterval(() => this.apply(), 60000);
    // Coming back to a backgrounded tab should not show a stale sky.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.apply();
    });
    return this;
  },
};

export { PALETTES, SEASON_TINT };
