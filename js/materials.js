// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — Procedural PBR materials
//
// Every surface in the valley is generated here, in code: albedo,
// normal, roughness and AO maps painted onto canvases at load time.
// No downloaded textures, no image assets — which keeps the whole
// site a static folder that works offline, while still giving the
// renderer the per-pixel detail that reads as real material rather
// than flat colour.
//
// The same library backs the offscreen thumbnail renderer
// (see thumbs.js), so a candle in the shop grid is lit and shaded
// with exactly the material it will have once it is on the plot.
//
// Everything is lazily built and cached by key — nothing is
// generated until something actually asks for it.
// ============================================================
import * as THREE from 'three';

const _imgLoader = new THREE.TextureLoader();

const _pbrCache = new Map();
function loadPBR(basePath) {
  if (_pbrCache.has(basePath)) return _pbrCache.get(basePath);
  const load = (suffix) => {
    const tex = _imgLoader.load(`images/textures/${basePath}_${suffix}.jpg`);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = suffix === 'diff' ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
    return tex;
  };
  const result = {
    map: load('diff'),
    normalMap: load('nor'),
    roughnessMap: load('rough'),
  };
  _pbrCache.set(basePath, result);
  return result;
}

const texCache = new Map();
const matCache = new Map();

// ---------------------------------------------------------------
// Noise — value-noise fbm, seeded, evaluated on the CPU into pixels
// ---------------------------------------------------------------
// Integer hash, kept inside int32 with Math.imul so it stays exactly
// deterministic across engines — the same seed must give the same
// texture every load, or cached thumbnails would not match the world.
function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
// C2 continuous quintic Hermite polynomial: 6t^5 - 15t^4 + 10t^3 (eliminates grid seams and 2nd derivative creases)
function smooth(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smooth(xf), v = smooth(yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** Tiling fbm: wraps cleanly at `period` so textures repeat seamlessly. */
function fbmTile(x, y, period, octaves = 3, seed = 1, gain = 0.5, lac = 2) {
  let sum = 0, amp = 1, norm = 0, p = period, freq = 1;
  for (let o = 0; o < octaves; o++) {
    // wrap coordinates into the current octave's period
    const xf = ((x * freq) % p + p) % p;
    const yf = ((y * freq) % p + p) % p;
    sum += valueNoise(xf, yf, seed + o * 977) * amp;
    norm += amp;
    amp *= gain;
    freq *= lac;
    p *= lac;
  }
  return sum / norm;
}

// ---------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------
function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/**
 * Paint a canvas from a per-pixel function.
 * @param {number} size
 * @param {(x:number,y:number,u:number,v:number)=>[number,number,number]} fn
 */
function paint(size, fn) {
  const cv = makeCanvas(size);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = fn(x, y, x / size, y / size);
      const i = (y * size + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/**
 * Paint an RGBA canvas from a per-pixel function supporting alpha cutouts.
 * @param {number} size
 * @param {(x:number,y:number,u:number,v:number)=>[number,number,number,number]} fn
 */
function paintRGBA(size, fn) {
  const cv = makeCanvas(size);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a = 255] = fn(x, y, x / size, y / size);
      const i = (y * size + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** Build a greyscale height field as a Float32Array. */
function heightField(size, fn) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      h[y * size + x] = fn(x, y, x / size, y / size);
  return h;
}

/**
 * Derive a tangent-space normal map from a height field by central
 * differences. Direct pixel buffer writes with pre-computed stride offsets
 * for instant GPU warmup and zero object allocation.
 */
function normalFromHeight(size, h, strength = 2.4) {
  const cv = makeCanvas(size);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  let idx = 0;
  for (let y = 0; y < size; y++) {
    const ym = (y === 0 ? size - 1 : y - 1) * size;
    const yp = (y === size - 1 ? 0 : y + 1) * size;
    const y0 = y * size;
    for (let x = 0; x < size; x++) {
      const xm = (x === 0 ? size - 1 : x - 1);
      const xp = (x === size - 1 ? 0 : x + 1);
      const l = h[y0 + xm];
      const r = h[y0 + xp];
      const u = h[ym + x];
      const dn = h[yp + x];
      const nx = (l - r) * strength;
      const ny = (u - dn) * strength;
      const invLen = 1.0 / (Math.hypot(nx, ny, 1) || 1);
      d[idx]     = Math.round((nx * invLen * 0.5 + 0.5) * 255);
      d[idx + 1] = Math.round((ny * invLen * 0.5 + 0.5) * 255);
      d[idx + 2] = Math.round((invLen * 0.5 + 0.5) * 255);
      d[idx + 3] = 255;
      idx += 4;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

function toTexture(canvas, { repeat = 1, srgb = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
const clamp01 = (v) => Math.max(0, Math.min(1, v));
function tint(base, k) { return [clamp255(base[0] * k), clamp255(base[1] * k), clamp255(base[2] * k)]; }

// ---------------------------------------------------------------
// Texture recipes
// Each returns { map, normalMap, roughnessMap?, aoMap? } of canvases.
// ---------------------------------------------------------------
const RECIPES = {
  /** Weathered limestone ashlar — the bridge, the gate, the plaza. */
  limestone(size = 256) {
    const rows = 7, cols = 4, seed = 11;
    const mortar = (u, v) => {
      const ry = v * rows;
      const row = Math.floor(ry);
      const fy = ry - row;
      const offset = row % 2 ? 0.5 : 0;
      const rx = (u * cols + offset) % 1;
      // distance to the nearest joint, in texture units
      const dy = Math.min(fy, 1 - fy) / rows;
      const dx = Math.min(rx, 1 - rx) / cols;
      return Math.min(dx, dy);
    };
    const h = heightField(size, (x, y, u, v) => {
      const joint = mortar(u, v);
      const jointDepth = smooth(Math.min(1, joint / 0.012));      // recessed mortar
      const grain = fbmTile(u * 9, v * 9, 9, 3, seed) * 0.35;
      const pit = Math.pow(fbmTile(u * 34, v * 34, 34, 3, seed + 5), 6) * 0.5;
      const microGrit = (fbmTile(u * 96, v * 96, 96, 3, seed + 13) - 0.5) * 0.12;
      const microChisel = (fbmTile(u * 180, v * 40, 180, 2, seed + 17) - 0.5) * 0.06;
      return jointDepth * (0.62 + grain + microGrit + microChisel) - pit;
    });
    const map = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      const grain = fbmTile(u * 16, v * 16, 16, 3, seed + 2);
      const stain = Math.pow(fbmTile(u * 3.2, v * 3.2, 3, 3, seed + 9), 2.1);
      const micro = fbmTile(u * 128, v * 128, 128, 2, seed + 4) * 0.08;
      const base = [206, 197, 174];
      const c = tint(base, 0.62 + hv * 0.42 + grain * 0.13 - stain * 0.2 + micro);
      // faint warm lichen in the damp joints
      const lichen = Math.max(0, 0.55 - hv) * Math.pow(fbmTile(u * 7, v * 7, 7, 3, seed + 21), 3) * 1.6;
      return [clamp255(c[0] - lichen * 34), clamp255(c[1] - lichen * 12), clamp255(c[2] - lichen * 40)];
    });
    const rough = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      const microScratches = Math.pow(fbmTile(u * 84, v * 84, 84, 2, seed + 19), 3) * 35;
      const microPits = Math.pow(fbmTile(u * 140, v * 140, 140, 2, seed + 23), 4) * 45;
      const g = clamp255(185 - hv * 40 + fbmTile(u * 22, v * 22, 22, 3, seed + 3) * 35 + microScratches + microPits);
      return [g, g, g];
    });
    const ao = paint(size, (x, y, u, v) => {
      const joint = mortar(u, v);
      const jointAO = smooth(Math.min(1, joint / 0.018));
      const g = clamp255(70 + jointAO * 115 + h[y * size + x] * 70);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 3.6), rough, ao };
  },

  /** Polished veined marble — headstones, statuary, fountains. */
  marble(size = 256) {
    const seed = 31;
    // Real marble veining is fractal: a few broad seams, each broken up
    // by finer ones running at their own angle.
    const seam = (u, v, freq, ang, warpAmt, sharp, s) => {
      const warp = fbmTile(u * freq * 0.6, v * freq * 0.6, Math.max(2, Math.round(freq * 0.6)), 3, s) * warpAmt;
      const t = Math.sin((u * freq * Math.cos(ang) + v * freq * Math.sin(ang) + warp) * Math.PI);
      return Math.pow(1 - Math.abs(t), sharp);
    };
    const veinField = (u, v) => {
      const broad = seam(u, v, 2.2, 0.6, 2.6, 3, seed);
      const mid = seam(u, v, 5.5, 1.1, 2.0, 4, seed + 41) * (0.35 + broad * 0.9);
      const fine = seam(u, v, 13.0, 0.4, 1.4, 4, seed + 83) * (0.15 + broad * 0.7);
      const micro = seam(u, v, 28.0, 0.8, 0.9, 4, seed + 107) * (0.08 + broad * 0.5);
      return Math.min(1, broad * 0.55 + mid * 0.7 + fine * 0.5 + micro * 0.35);
    };
    const h = heightField(size, (x, y, u, v) => {
      const microCrystals = fbmTile(u * 110, v * 110, 110, 2, seed + 9) * 0.04;
      const grainRelief = (fbmTile(u * 180, v * 180, 180, 2, seed + 17) - 0.5) * 0.025;
      return 0.5 + veinField(u, v) * 0.08 + fbmTile(u * 40, v * 40, 40, 2, seed + 3) * 0.05 + microCrystals + grainRelief;
    });
    const map = paint(size, (x, y, u, v) => {
      const vein = veinField(u, v);
      const mottle = fbmTile(u * 6, v * 6, 6, 3, seed + 7);
      const warmth = fbmTile(u * 2.4, v * 2.4, 2, 3, seed + 63);       // cream drifts
      const microSparkle = Math.pow(fbmTile(u * 140, v * 140, 140, 2, seed + 15), 4) * 0.14;
      const base = [186, 180, 168];
      const c = tint(base, 0.90 + mottle * 0.10 + microSparkle);
      return [
        clamp255(c[0] - vein * 80 + warmth * 8),
        clamp255(c[1] - vein * 76 + warmth * 4),
        clamp255(c[2] - vein * 64 - warmth * 5),
      ];
    });
    const rough = paint(size, (x, y, u, v) => {
      const microRough = fbmTile(u * 90, v * 90, 90, 2, seed + 27) * 20;
      const microScratches = Math.pow(fbmTile(u * 160, v * 160, 160, 2, seed + 39), 3) * 28;
      const g = clamp255(45 + fbmTile(u * 12, v * 12, 12, 3, seed + 11) * 30 + veinField(u, v) * 45 + microRough + microScratches);
      return [g, g, g];
    });
    const ao = paint(size, (x, y, u, v) => {
      const vf = veinField(u, v);
      const g = clamp255(190 + (1.0 - vf * 0.45) * 55 + (h[y * size + x] - 0.5) * 40);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 1.4), rough, ao };
  },

  /** Speckled granite — the classic headstone. */
  granite(size = 256) {
    const seed = 47;
    const h = heightField(size, (x, y, u, v) => {
      const grain = fbmTile(u * 60, v * 60, 60, 3, seed) * 0.35;
      const crystals = fbmTile(u * 140, v * 140, 140, 2, seed + 4) * 0.20;
      const microCleavage = (fbmTile(u * 240, v * 240, 240, 2, seed + 11) - 0.5) * 0.10;
      return 0.5 + grain + crystals + microCleavage;
    });
    const map = paint(size, (x, y, u, v) => {
      const grain = fbmTile(u * 70, v * 70, 70, 2, seed + 1);
      const fleck = Math.pow(fbmTile(u * 150, v * 150, 150, 2, seed + 6), 8);
      const feldspar = Math.pow(fbmTile(u * 46, v * 46, 46, 2, seed + 12), 5);
      const quartz = Math.pow(fbmTile(u * 90, v * 90, 90, 2, seed + 16), 4);
      const base = [128, 128, 136];
      let c = tint(base, 0.62 + grain * 0.55);
      c = [c[0] + feldspar * 70 + quartz * 25, c[1] + feldspar * 60 + quartz * 25, c[2] + feldspar * 52 + quartz * 35];
      const k = fleck * 90;
      return [clamp255(c[0] - k), clamp255(c[1] - k), clamp255(c[2] - k * 0.8)];
    });
    const rough = paint(size, (x, y, u, v) => {
      const quartz = Math.pow(fbmTile(u * 90, v * 90, 90, 2, seed + 16), 4);
      const fleck = Math.pow(fbmTile(u * 150, v * 150, 150, 2, seed + 6), 8);
      const micro = fbmTile(u * 160, v * 160, 160, 2, seed + 8) * 35;
      const g = clamp255(90 + fbmTile(u * 90, v * 90, 90, 2, seed + 2) * 60 - quartz * 45 + fleck * 35 + micro);
      return [g, g, g];
    });
    const ao = paint(size, (x, y) => {
      const hv = h[y * size + x];
      const g = clamp255(135 + hv * 120);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 2.2), rough, ao };
  },

  /** Natural furrowed oak and pine bark with North-aspect moss patches and micro-lichen flecks. */
  bark(size = 256) {
    const seed = 63;
    const h = heightField(size, (x, y, u, v) => {
      const furrows = fbmTile(u * 14, v * 4.0, 14, 3, seed) * 0.65;
      const grain = fbmTile(u * 50, v * 14, 50, 3, seed + 7) * 0.35;
      return furrows + grain;
    });
    const map = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      // Subtle moss on North/sheltered aspect & micro-lichen flecks
      const northBias = Math.max(0.0, Math.sin(u * Math.PI));
      const mossNoise = Math.pow(fbmTile(u * 6, v * 6, 6, 3, seed + 17), 2.8);
      const moss = mossNoise * (0.25 + 0.75 * northBias);
      const lichen = Math.pow(fbmTile(u * 16, v * 16, 16, 3, seed + 29), 4.0) * 0.45;
      const base = [84, 66, 52];
      let c = tint(base, 0.72 + hv * 0.45);
      // Subtle organic emerald moss & golden lichen
      const mossGreen = [42, 94, 38];
      const goldLichen = [138, 142, 72];
      c = [
        clamp255(c[0] * (1.0 - moss) + mossGreen[0] * moss + lichen * goldLichen[0] * 0.4),
        clamp255(c[1] * (1.0 - moss) + mossGreen[1] * moss + lichen * goldLichen[1] * 0.4),
        clamp255(c[2] * (1.0 - moss) + mossGreen[2] * moss + lichen * goldLichen[2] * 0.4),
      ];
      return c;
    });
    const rough = paint(size, (x, y, u, v) => {
      const g = clamp255(210 + fbmTile(u * 20, v * 20, 20, 2, seed + 3) * 40);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 2.8), rough };
  },

  /** Close-up meadow grass, for terrain detail. */
  grass(size = 256) {
    const seed = 83;
    const h = heightField(size, (x, y, u, v) => {
      const blades = Math.abs(Math.sin((u * 90 + fbmTile(u * 8, v * 8, 8, 3, seed) * 6) * Math.PI));
      return blades * 0.45 + fbmTile(u * 24, v * 24, 24, 3, seed + 2) * 0.55;
    });
    const map = paint(size, (x, y, u, v) => {
      const clump = fbmTile(u * 7, v * 7, 7, 3, seed + 5);
      const blade = h[y * size + x];
      const dry = Math.pow(fbmTile(u * 3.5, v * 3.5, 3, 3, seed + 9), 2.4);
      const lush = [86, 122, 62], parched = [140, 146, 84];
      const t = Math.min(1, dry * 1.5);
      const base = [
        lush[0] + (parched[0] - lush[0]) * t,
        lush[1] + (parched[1] - lush[1]) * t,
        lush[2] + (parched[2] - lush[2]) * t,
      ];
      return tint(base, 0.66 + clump * 0.34 + blade * 0.22);
    });
    const rough = paint(size, (x, y, u, v) => {
      const g = clamp255(210 + fbmTile(u * 20, v * 20, 20, 2, seed + 1) * 40);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 1.9), rough };
  },

  /**
   * Neutral ground detail — greyscale, so the terrain's vertex colours
   * supply the hue while this supplies the per-pixel variation. A
   * coloured albedo cannot work here: the same texture has to sit under
   * meadow, sand, rock and pine floor without tinting any of them.
   *
   * Deliberately centred near 0.8 rather than 0.5, and paired with a
   * material colour above 1, so it modulates brightness without
   * halving it.
   */
  groundDetail(size = 256) {
    const seed = 313;
    // Strictly isotropic. An earlier version added a sin() "blades"
    // term, which is correct for grass seen from standing height but
    // becomes directional streaking once the texture is tiled ~100
    // times across the valley — it moirés into visible corduroy on
    // every slope. Only noise, at several scales, survives tiling.
    const h = heightField(size, (x, y, u, v) => {
      const clump = fbmTile(u * 5, v * 5, 5, 3, seed);
      const tuft = fbmTile(u * 21, v * 21, 21, 3, seed + 2);
      const grain = fbmTile(u * 78, v * 78, 78, 3, seed + 5);
      return clump * 0.52 + tuft * 0.30 + grain * 0.18;
    });
    const map = paint(size, (x, y, u, v) => {
      // three scales of patchiness, so it never reads as one tiling cell
      const broad = fbmTile(u * 2.5, v * 2.5, 2, 3, seed + 11);
      const mid = fbmTile(u * 11, v * 11, 11, 3, seed + 13);
      const fine = fbmTile(u * 46, v * 46, 46, 3, seed + 17);
      const wear = Math.pow(fbmTile(u * 4, v * 4, 4, 3, seed + 23), 3) * 0.35;
      const l = 0.66 + broad * 0.18 + mid * 0.13 + fine * 0.09 - wear;
      const g = clamp255(l * 255);
      // a whisper of hue variation keeps large areas from banding
      return [g, clamp255(g * (1 + (mid - 0.5) * 0.03)), clamp255(g * (1 - (broad - 0.5) * 0.04))];
    });
    const rough = paint(size, (x, y, u, v) => {
      const g = clamp255(196 + fbmTile(u * 18, v * 18, 18, 3, seed + 31) * 52);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 2.1), rough };
  },

  /** Rippled beach and desert sand. */
  sand(size = 256) {
    const seed = 97;
    const h = heightField(size, (x, y, u, v) => {
      const ripple = Math.sin((v * 30 + fbmTile(u * 4, v * 4, 4, 3, seed) * 8) * Math.PI) * 0.5 + 0.5;
      return ripple * 0.42 + fbmTile(u * 70, v * 70, 70, 3, seed + 2) * 0.58;
    });
    const map = paint(size, (x, y, u, v) => {
      const grain = fbmTile(u * 120, v * 120, 120, 2, seed + 3);
      const hv = h[y * size + x];
      return tint([156, 124, 76], 0.82 + grain * 0.22 + hv * 0.16);
    });
    const rough = paint(size, () => [210, 210, 210]);
    return { map, normal: normalFromHeight(size, h, 2.2), rough };
  },

  /** Multi-octave crisp capillary and wave normal maps for lakes, waterfalls and rivers. */
  waterNormals(size = 512) {
    const seed = 131;
    const h = heightField(size, (x, y, u, v) => {
      // Octave 1 & 2: Primary broad undulating gravity swells & tidal chops
      const swell1 = Math.sin((u * 4.0 + fbmTile(u * 2.0, v * 2.0, 2, 3, seed) * 2.5) * Math.PI * 2.0);
      const swell2 = Math.sin((v * 6.0 - u * 2.0 + fbmTile(u * 4.0, v * 4.0, 4, 3, seed + 3) * 3.2) * Math.PI * 2.0);
      
      // Octave 3 & 4: Directional cross-surface wind waves & cresting chop
      const chop1 = Math.sin((u * 14.0 + v * 10.0 + fbmTile(u * 8.0, v * 8.0, 8, 3, seed + 7) * 4.0) * Math.PI * 2.0) * 0.22;
      const chop2 = Math.cos((v * 22.0 - u * 16.0 + fbmTile(u * 12.0, v * 12.0, 12, 3, seed + 11) * 4.5) * Math.PI * 2.0) * 0.16;
      
      // Octave 5, 6, 7 & 8: High-frequency capillary ripples & surface micro-turbulence
      const cap1 = Math.sin((u * 44.0 + v * 32.0) * Math.PI * 2.0) * Math.cos((u * 32.0 - v * 44.0) * Math.PI * 2.0) * 0.12;
      const cap2 = Math.sin((u * 88.0 - v * 64.0 + fbmTile(u * 28.0, v * 28.0, 28, 2, seed + 19) * 5.0) * Math.PI * 2.0) * 0.08;
      const cap3 = Math.cos((u * 128.0 + v * 96.0 + fbmTile(u * 40.0, v * 40.0, 40, 2, seed + 23) * 4.0) * Math.PI * 2.0) * 0.05;
      const cap4 = Math.sin((u * 200.0 + v * 160.0 + fbmTile(u * 60.0, v * 60.0, 60, 2, seed + 29) * 3.0) * Math.PI * 2.0) * 0.03;
      return 0.5 + swell1 * 0.20 + swell2 * 0.15 + chop1 + chop2 + cap1 + cap2 + cap3 + cap4;
    });
    return { normal: normalFromHeight(size, h, 3.4) };
  },

  /** Dancing Voronoi/FBM sunlight caustics and refraction normal map for shallow waters. */
  waterCaustics(size = 512) {
    const seed = 177;
    const h = heightField(size, (x, y, u, v) => {
      // Dual-network interference pattern for physical water caustics
      const c1 = fbmTile(u * 12.0, v * 12.0, 12, 3, seed);
      const c2 = fbmTile(u * 18.0 + 3.4, v * 18.0 + 1.8, 18, 3, seed + 11);
      const cell1 = Math.sin((u * 28.0 + c1 * 3.5) * Math.PI) * Math.cos((v * 28.0 + c2 * 3.5) * Math.PI);
      const cell2 = Math.cos((u * 48.0 - v * 32.0 + c2 * 2.8) * Math.PI);
      const caust = Math.pow(Math.max(0.0, cell1 * 0.6 + cell2 * 0.4), 2.5);
      return caust;
    });
    const map = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      const g = clamp255(hv * 255);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 2.8) };
  },

  /** Cast bronze / weathered gold, for finials and lettering. */
  bronze(size = 128) {
    const seed = 149;
    const h = heightField(size, (x, y, u, v) =>
      0.5 + fbmTile(u * 26, v * 26, 26, 3, seed) * 0.5);
    const map = paint(size, (x, y, u, v) => {
      const patina = Math.pow(fbmTile(u * 6, v * 6, 6, 3, seed + 3), 2.6);
      const wear = fbmTile(u * 18, v * 18, 18, 3, seed + 7);
      const base = [176, 141, 72];
      const c = tint(base, 0.74 + wear * 0.4);
      // verdigris settles into the recesses
      return [clamp255(c[0] - patina * 96), clamp255(c[1] - patina * 20), clamp255(c[2] + patina * 44)];
    });
    const rough = paint(size, (x, y, u, v) => {
      const patina = Math.pow(fbmTile(u * 6, v * 6, 6, 3, seed + 3), 2.6);
      const g = clamp255(64 + patina * 150 + fbmTile(u * 30, v * 30, 30, 2, seed + 1) * 30);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 1.0), rough };
  },

  /** Wrought iron — railings, lanterns, gates. */
  iron(size = 128) {
    const seed = 173;
    const h = heightField(size, (x, y, u, v) =>
      0.5 + fbmTile(u * 35, v * 35, 35, 3, seed) * 0.35 + fbmTile(u * 90, v * 90, 90, 2, seed + 4) * 0.15);
    const map = paint(size, (x, y, u, v) => {
      const rust = Math.pow(fbmTile(u * 12, v * 12, 12, 3, seed + 9), 3.2);
      const hammer = fbmTile(u * 6, v * 6, 6, 3, seed + 2);
      const base = [42, 44, 48];
      const c = tint(base, 0.7 + hammer * 0.5);
      return [clamp255(c[0] + rust * 88), clamp255(c[1] + rust * 32), clamp255(c[2] + rust * 12)];
    });
    const rough = paint(size, (x, y, u, v) => {
      const g = clamp255(150 + fbmTile(u * 40, v * 40, 40, 2, seed + 1) * 55);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 2.0), rough };
  },

  /** Translucent candle wax with micro-surface pits. */
  wax(size = 128) {
    const seed = 199;
    const h = heightField(size, (x, y, u, v) =>
      0.5 + fbmTile(u * 18, v * 18, 18, 3, seed) * 0.25);
    const map = paint(size, (x, y, u, v) => {
      const drip = fbmTile(u * 8, v * 2, 8, 3, seed + 3);
      const base = [252, 246, 230];
      return tint(base, 0.94 + drip * 0.06);
    });
    const rough = paint(size, () => [128, 128, 128]);
    return { map, normal: normalFromHeight(size, h, 0.8), rough };
  },

  /** Glazed ceramic / porcelain with fine crackle. */
  ceramic(size = 128) {
    const seed = 227;
    // Voronoi crackle network for aged glaze
    const crackle = (u, v) => {
      const f = fbmTile(u * 30, v * 30, 30, 3, seed);
      const s = Math.abs(Math.sin((u * 40 + v * 40 + f * 4) * Math.PI));
      return Math.pow(1 - s, 16);
    };
    const h = heightField(size, (x, y, u, v) => 0.5 - crackle(u, v) * 0.15);
    const map = paint(size, (x, y, u, v) => {
      const cr = crackle(u, v);
      const base = [242, 240, 234];
      return [clamp255(base[0] - cr * 40), clamp255(base[1] - cr * 44), clamp255(base[2] - cr * 48)];
    });
    const rough = paint(size, (x, y, u, v) => {
      const cr = crackle(u, v);
      const g = clamp255(35 + cr * 160);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 0.6), rough };
  },

  /** Weathered timber planks — benches, signs, fences. */
  timber(size = 256) {
    const seed = 251;
    const planks = 6;
    const h = heightField(size, (x, y, u, v) => {
      const py = (v * planks) % 1;
      const seam = smooth(Math.min(1, Math.min(py, 1 - py) / 0.025));
      const ring = Math.sin((u * 8 + fbmTile(u * 3, v * 12, 3, 3, seed) * 3) * Math.PI * 4) * 0.5 + 0.5;
      const grain = fbmTile(u * 60, v * 4, 60, 3, seed + 5) * 0.35;
      const microVessels = (fbmTile(u * 160, v * 8, 160, 2, seed + 9) - 0.5) * 0.12;
      return seam * (0.55 + ring * 0.25 + grain + microVessels);
    });
    const map = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      const grain = fbmTile(u * 50, v * 4, 50, 3, seed + 2);
      const grey = Math.pow(fbmTile(u * 2, v * 2, 2, 3, seed + 11), 2);
      const microGrain = fbmTile(u * 140, v * 6, 140, 2, seed + 7) * 0.08;
      const warm = [148, 114, 82], silvered = [138, 134, 128];
      const base = [
        warm[0] * (1 - grey) + silvered[0] * grey,
        warm[1] * (1 - grey) + silvered[1] * grey,
        warm[2] * (1 - grey) + silvered[2] * grey,
      ];
      return tint(base, 0.68 + hv * 0.42 + grain * 0.12 + microGrain);
    });
    const rough = paint(size, (x, y, u, v) => {
      const striations = fbmTile(u * 90, v * 6, 90, 2, seed + 13) * 40;
      const g = clamp255(180 + fbmTile(u * 20, v * 20, 20, 2, seed + 3) * 45 + striations);
      return [g, g, g];
    });
    const ao = paint(size, (x, y, u, v) => {
      const py = (v * planks) % 1;
      const seam = smooth(Math.min(1, Math.min(py, 1 - py) / 0.035));
      const g = clamp255(80 + seam * 145 + h[y * size + x] * 30);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 3.0), rough, ao };
  },

  /** Generic dense foliage albedo + normal for distant clumps. */
  foliage(size = 128) {
    const seed = 281;
    const h = heightField(size, (x, y, u, v) =>
      0.5 + fbmTile(u * 16, v * 16, 16, 3, seed) * 0.35 + fbmTile(u * 48, v * 48, 48, 2, seed + 3) * 0.15);
    const map = paint(size, (x, y, u, v) => {
      const n = fbmTile(u * 12, v * 12, 12, 3, seed + 1);
      const d = fbmTile(u * 3, v * 3, 3, 3, seed + 7);
      const c = [120, 168, 88];
      return tint(c, 0.65 + n * 0.4 + d * 0.2);
    });
    const rough = paint(size, () => [220, 220, 220]);
    return { map, normal: normalFromHeight(size, h, 1.8), rough };
  },

  /** Semi-translucent rose quartz / petal material. */
  quartz(size = 128) {
    const seed = 307;
    const vein = (u, v) => Math.pow(Math.abs(Math.sin((u * 8 + v * 4 + fbmTile(u * 4, v * 4, 4, 3, seed) * 3) * Math.PI)), 4);
    const h = heightField(size, (x, y, u, v) => 0.5 + vein(u, v) * 0.15 + fbmTile(u * 20, v * 20, 20, 3, seed + 2) * 0.1);
    const map = paint(size, (x, y, u, v) => {
      const n = fbmTile(u * 9, v * 9, 9, 3, seed);
      const c = tint([255, 255, 255], 0.78 + n * 0.3);
      const vn = vein(u, v) * 40;
      return [clamp255(c[0] - vn * 0.4), clamp255(c[1] - vn * 0.2), clamp255(c[2] - vn * 0.6)];
    });
    const rough = paint(size, (x, y, u, v) => {
      const g = clamp255(150 + fbmTile(u * 14, v * 14, 14, 3, seed + 2) * 70);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 1.4), rough };
  },

  /** Mountain rock cliff face with stratified ridges, crevice AO and fractured normals. */
  rockCliff(size = 256) {
    const seed = 419;
    const h = heightField(size, (x, y, u, v) => {
      // Natural fractured granite / basalt rock face (no repeating periodic sine waves)
      const crags = fbmTile(u * 8, v * 8, 8, 3, seed) * 0.55;
      const ridges = Math.abs(fbmTile(u * 16 + 2.3, v * 16 + 2.3, 16, 3, seed + 7) - 0.5) * 0.65;
      const micro = fbmTile(u * 48, v * 48, 48, 3, seed + 13) * 0.18;
      return crags + ridges + micro;
    });
    const map = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      const warmLichen = Math.pow(fbmTile(u * 8, v * 8, 8, 3, seed + 29), 3) * 0.35;
      const slate = [86, 94, 104];
      const c = tint(slate, 0.75 + hv * 0.45);
      return [
        clamp255(c[0] + warmLichen * 35),
        clamp255(c[1] + warmLichen * 32),
        clamp255(c[2] - warmLichen * 10),
      ];
    });
    const rough = paint(size, (x, y, u, v) => {
      const g = clamp255(200 + fbmTile(u * 28, v * 28, 28, 3, seed + 3) * 45);
      return [g, g, g];
    });
    const ao = paint(size, (x, y) => {
      const g = clamp255(130 + h[y * size + x] * 125);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 2.0), rough, ao };
  },

  /** Rich pine needle and damp moss forest floor. */
  forestFloor(size = 256) {
    const seed = 521;
    const h = heightField(size, (x, y, u, v) => {
      const needles = Math.abs(Math.sin((u * 45 - v * 35 + fbmTile(u * 8, v * 8, 8, 3, seed) * 4) * Math.PI)) * 0.4;
      const mossMounds = fbmTile(u * 9, v * 9, 9, 3, seed + 5) * 0.6;
      return needles + mossMounds;
    });
    const map = paint(size, (x, y, u, v) => {
      const moss = Math.pow(fbmTile(u * 7, v * 7, 7, 3, seed + 11), 2.2);
      const pineNeedles = [94, 66, 42];
      const mossGreen = [58, 92, 48];
      const c = [
        pineNeedles[0] * (1 - moss) + mossGreen[0] * moss,
        pineNeedles[1] * (1 - moss) + mossGreen[1] * moss,
        pineNeedles[2] * (1 - moss) + mossGreen[2] * moss,
      ];
      return tint(c, 0.78 + fbmTile(u * 16, v * 16, 16, 3, seed + 2) * 0.35);
    });
    const rough = paint(size, (x, y) => [220, 220, 220]);
    return { map, normal: normalFromHeight(size, h, 2.2), rough };
  },

  /** Lush sunlit meadow grass with multi-octave fescue blades, clover, and micro-relief normals. */
  meadowLush(size = 512) {
    const seed = 613;
    const h = heightField(size, (x, y, u, v) => {
      const sodClumps   = fbmTile(u * 5, v * 5, 5, 3, seed);
      const grassTufts  = fbmTile(u * 22, v * 22, 22, 3, seed + 3);
      // Multi-directional micro-blade ridges: dense intersecting alpine fescue blades
      const blade1 = Math.abs(Math.sin((u * 110 + v * 32 + fbmTile(u * 8, v * 8, 8, 3, seed + 5) * 5) * Math.PI));
      const blade2 = Math.abs(Math.cos((v * 110 - u * 32 + fbmTile(u * 8, v * 8, 8, 3, seed + 8) * 5) * Math.PI));
      const blade3 = Math.abs(Math.sin((u * 220 - v * 80 + fbmTile(u * 16, v * 16, 16, 2, seed + 12) * 3) * Math.PI));
      const microBlades = (Math.max(blade1, blade2 * 0.85) * 0.32 + blade3 * 0.12);
      const clover = Math.pow(fbmTile(u * 18, v * 18, 18, 3, seed + 14), 3.5) * 0.24;
      const fineTurf = fbmTile(u * 160, v * 160, 160, 3, seed + 11) * 0.14;
      const soilPores = (fbmTile(u * 320, v * 320, 320, 2, seed + 19) - 0.5) * 0.08;
      return sodClumps * 0.24 + grassTufts * 0.22 + microBlades + clover + fineTurf + soilPores;
    });
    const map = paint(size, (x, y, u, v) => {
      const clump = fbmTile(u * 5, v * 5, 5, 3, seed + 9);
      const clover = Math.pow(fbmTile(u * 18, v * 18, 18, 3, seed + 14), 3.5);
      const soil = Math.pow(fbmTile(u * 28, v * 28, 28, 3, seed + 23), 3.8);
      const microGrain = fbmTile(u * 128, v * 128, 128, 2, seed + 27) * 0.12;
      const hv = h[y * size + x];

      // Deep rich fescue grass palette: #2e5c1e base [46, 92, 30], #4a882a sunlit crest [74, 136, 42], #183410 soil shadow [24, 52, 16]
      const fescueSoil   = [24, 52, 16];   // #183410 soil shadow
      const fescueBase   = [46, 92, 30];   // #2e5c1e rich fescue base
      const fescueSunlit = [74, 136, 42];  // #4a882a sunlit crest
      const cloverGreen  = [112, 184, 54];
      const loamSoil     = [32, 26, 18];
      const pollenGold   = [196, 214, 62];

      let r = fescueSoil[0] * (1 - clump) + fescueBase[0] * clump;
      let g = fescueSoil[1] * (1 - clump) + fescueBase[1] * clump;
      let b = fescueSoil[2] * (1 - clump) + fescueBase[2] * clump;

      // Blend clover patches
      r = r * (1 - clover) + cloverGreen[0] * clover;
      g = g * (1 - clover) + cloverGreen[1] * clover;
      b = b * (1 - clover) + cloverGreen[2] * clover;

      // Micro-blade highlight on sunlit blade crests
      const bladeHighlight = Math.max(0, hv - 0.48) * 0.70;
      r += bladeHighlight * (fescueSunlit[0] - r) + Math.pow(bladeHighlight, 2.0) * pollenGold[0] * 0.38 + microGrain * 12;
      g += bladeHighlight * (fescueSunlit[1] - g) + Math.pow(bladeHighlight, 2.0) * pollenGold[1] * 0.38 + microGrain * 18;
      b += bladeHighlight * (fescueSunlit[2] - b) + Math.pow(bladeHighlight, 2.0) * pollenGold[2] * 0.38 + microGrain * 6;

      // Dark rich loam humus in deep soil crevices
      r = r * (1 - soil) + loamSoil[0] * soil;
      g = g * (1 - soil) + loamSoil[1] * soil;
      b = b * (1 - soil) + loamSoil[2] * soil;

      return [clamp255(r), clamp255(g), clamp255(b)];
    });
    const rough = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      const soil = Math.pow(fbmTile(u * 28, v * 28, 28, 3, seed + 23), 3.8);
      const clover = Math.pow(fbmTile(u * 18, v * 18, 18, 3, seed + 14), 3.5);
      // Waxy grass cuticle on sunlit blades produces specular sheen (~0.41 - 0.49)
      const bladeRough = 105 + (1.0 - Math.max(0, hv - 0.38)) * 68;
      const cloverRough = 112;
      const soilRough = 238;
      let g = bladeRough * (1 - clover) + cloverRough * clover;
      g = g * (1 - soil) + soilRough * soil;
      return [clamp255(g), clamp255(g), clamp255(g)];
    });
    const ao = paint(size, (x, y) => {
      const g = clamp255(55 + h[y * size + x] * 200);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 4.2), rough, ao };
  },

  /** Mossy scree slopes with alluvial gravel stones, damp emerald moss cushions, and lichen crusts. */
  mossyScree(size = 512) {
    const seed = 743;
    const h = heightField(size, (x, y, u, v) => {
      const screeBed     = fbmTile(u * 7, v * 7, 7, 3, seed);
      const gravelStones = Math.pow(Math.abs(fbmTile(u * 28, v * 28, 28, 3, seed + 4) - 0.5) * 2.0, 1.7) * 0.50;
      const mossCushions = Math.pow(fbmTile(u * 14, v * 14, 14, 3, seed + 9), 2.4) * 0.44;
      const microPebbles = (fbmTile(u * 120, v * 120, 120, 3, seed + 15) - 0.5) * 0.18;
      return screeBed * 0.22 + gravelStones + mossCushions + microPebbles;
    });
    const map = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      const mossMask = Math.pow(fbmTile(u * 14, v * 14, 14, 3, seed + 8), 2.4);
      const lichen = Math.pow(fbmTile(u * 26, v * 26, 26, 3, seed + 19), 3.2);

      // Geological scree palette: alpine slate gravel, warm quartzite pebbles, velvety emerald moss, gold lichen
      const slateGravel = [118, 110, 98];
      const warmPebble  = [128, 120, 98];
      const emeraldMoss = [38, 92, 28];
      const sunlitMoss  = [98, 154, 44];
      const goldLichen  = [156, 132, 58];
      const dampSilt    = [48, 42, 32];

      const stoneGrain = fbmTile(u * 48, v * 48, 48, 2, seed + 3);
      let r = slateGravel[0] * (1 - stoneGrain) + warmPebble[0] * stoneGrain;
      let g = slateGravel[1] * (1 - stoneGrain) + warmPebble[1] * stoneGrain;
      let b = slateGravel[2] * (1 - stoneGrain) + warmPebble[2] * stoneGrain;

      // Dark silt in lower recesses
      if (hv < 0.38) {
        const k = (0.38 - hv) / 0.38;
        r = r * (1 - k) + dampSilt[0] * k;
        g = g * (1 - k) + dampSilt[1] * k;
        b = b * (1 - k) + dampSilt[2] * k;
      }

      // Blend damp moss cushions
      const mossCol = [
        emeraldMoss[0] * (1 - hv) + sunlitMoss[0] * hv,
        emeraldMoss[1] * (1 - hv) + sunlitMoss[1] * hv,
        emeraldMoss[2] * (1 - hv) + sunlitMoss[2] * hv,
      ];
      r = r * (1 - mossMask) + mossCol[0] * mossMask + lichen * goldLichen[0] * 0.45;
      g = g * (1 - mossMask) + mossCol[1] * mossMask + lichen * goldLichen[1] * 0.45;
      b = b * (1 - mossMask) + mossCol[2] * mossMask + lichen * goldLichen[2] * 0.45;

      return [clamp255(r), clamp255(g), clamp255(b)];
    });
    const rough = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      const mossMask = Math.pow(fbmTile(u * 14, v * 14, 14, 3, seed + 8), 2.4);
      const isPebble = Math.pow(Math.abs(fbmTile(u * 28, v * 28, 28, 3, seed + 4) - 0.5) * 2.0, 1.7) > 0.45;
      const stoneRough = isPebble ? 102 : (212 + fbmTile(u * 28, v * 28, 28, 2, seed + 2) * 35);
      const mossRough = 132 + fbmTile(u * 16, v * 16, 16, 2, seed + 5) * 30;
      const g = clamp255(stoneRough * (1 - mossMask) + mossRough * mossMask);
      return [g, g, g];
    });
    const ao = paint(size, (x, y) => {
      const g = clamp255(60 + h[y * size + x] * 195);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 4.0), rough, ao };
  },

  /** Submerged Glacial Granite Boulders with golden pyrite flecks, alpine moss, and deep abyss mineral striations. */
  glacialPyriteGranite(size = 512) {
    const seed = 8831;
    const h = heightField(size, (x, y, u, v) => {
      const crags = fbmTile(u * 6, v * 6, 6, 3, seed) * 0.45;
      const ridges = Math.abs(fbmTile(u * 14 + 1.2, v * 14 + 1.2, 14, 3, seed + 5) - 0.5) * 0.55;
      const pyriteCubes = Math.pow(Math.max(0.0, Math.sin(u * 64.0 * Math.PI) * Math.sin(v * 64.0 * Math.PI)), 8.0) * 0.40;
      const microGrit = (fbmTile(u * 80, v * 80, 80, 2, seed + 11) - 0.5) * 0.12;
      return crags + ridges + pyriteCubes + microGrit;
    });
    const map = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      const mossMask = Math.pow(fbmTile(u * 10, v * 10, 10, 3, seed + 7), 2.2);
      const pyriteMask = Math.pow(Math.max(0.0, Math.sin(u * 64.0 * Math.PI) * Math.sin(v * 64.0 * Math.PI)), 8.0);

      const slateBlue = [72, 92, 106];      // Glacial cold granite diorite
      const darkCrevice = [32, 44, 52];
      const alpineMoss = [26, 78, 42];      // Submerged velvety alpine moss
      const pyriteGold = [218, 178, 62];    // Golden chalcopyrite / pyrite flecks

      let r = slateBlue[0] * (0.7 + hv * 0.5) * (1 - mossMask) + alpineMoss[0] * mossMask;
      let g = slateBlue[1] * (0.7 + hv * 0.5) * (1 - mossMask) + alpineMoss[1] * mossMask;
      let b = slateBlue[2] * (0.7 + hv * 0.5) * (1 - mossMask) + alpineMoss[2] * mossMask;

      if (hv < 0.3) {
        const k = (0.3 - hv) / 0.3;
        r = r * (1 - k) + darkCrevice[0] * k;
        g = g * (1 - k) + darkCrevice[1] * k;
        b = b * (1 - k) + darkCrevice[2] * k;
      }

      // Pyrite metallic gold inclusions
      if (pyriteMask > 0.15) {
        const pK = Math.min(1.0, (pyriteMask - 0.15) * 2.5);
        r = r * (1 - pK) + pyriteGold[0] * pK;
        g = g * (1 - pK) + pyriteGold[1] * pK;
        b = b * (1 - pK) + pyriteGold[2] * pK;
      }

      return [clamp255(r), clamp255(g), clamp255(b)];
    });
    const rough = paint(size, (x, y, u, v) => {
      const pyriteMask = Math.pow(Math.max(0.0, Math.sin(u * 64.0 * Math.PI) * Math.sin(v * 64.0 * Math.PI)), 8.0);
      const mossMask = Math.pow(fbmTile(u * 10, v * 10, 10, 3, seed + 7), 2.2);
      const baseR = 150 + fbmTile(u * 20, v * 20, 20, 2, seed + 2) * 60;
      // Pyrite is smooth metallic reflective (low roughness), moss is soft (higher roughness)
      const rVal = pyriteMask > 0.2 ? 45 : (mossMask > 0.4 ? 195 : baseR);
      return [clamp255(rVal), clamp255(rVal), clamp255(rVal)];
    });
    const ao = paint(size, (x, y) => {
      const g = clamp255(80 + h[y * size + x] * 175);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 2.6), rough, ao };
  },

  /** Freshwater Riverbed Pebbles with tumbled quartzite, agate, river slate, and dancing sun caustics. */
  riverPebblesCaustics(size = 512) {
    const seed = 4421;
    const h = heightField(size, (x, y, u, v) => {
      // Cell-based tumbled river pebble distribution
      const pebbleGrid = Math.pow(Math.abs(Math.sin(u * 24.0 * Math.PI + fbmTile(u * 6, v * 6, 6, 2, seed) * 3.0) *
                                           Math.cos(v * 24.0 * Math.PI + fbmTile(u * 6, v * 6, 6, 2, seed + 3) * 3.0)), 0.65);
      const siltBed = fbmTile(u * 8, v * 8, 8, 3, seed + 8) * 0.35;
      const caustics = Math.pow(Math.max(0.0, Math.sin(u * 16.0 * Math.PI + v * 12.0 * Math.PI) * 0.5 + 0.5), 3.0) * 0.25;
      return pebbleGrid * 0.65 + siltBed + caustics;
    });
    const map = paint(size, (x, y, u, v) => {
      const pebbleIdx = Math.floor((u * 12.0 + v * 8.0 + fbmTile(u * 4, v * 4, 4, 2, seed) * 4.0)) % 5;
      const pebbleColors = [
        [168, 142, 114], // Warm quartzite
        [112, 126, 138], // River slate grey
        [182, 94, 68],   // Red jasper pebble
        [194, 178, 152], // Pale cream agate
        [78, 92, 80],    // Dark mossy riverstone
      ];
      const baseCol = pebbleColors[Math.abs(pebbleIdx) % pebbleColors.length];
      const causticsPattern = Math.pow(Math.max(0.0, Math.sin(u * 16.0 * Math.PI + v * 12.0 * Math.PI) * 0.5 + 0.5), 3.0);
      const causticsGlint = [255, 245, 210]; // Sunlit golden caustics

      const r = baseCol[0] * (0.8 + fbmTile(u * 18, v * 18, 18, 2, seed + 1) * 0.4) + causticsPattern * causticsGlint[0] * 0.45;
      const g = baseCol[1] * (0.8 + fbmTile(u * 18, v * 18, 18, 2, seed + 2) * 0.4) + causticsPattern * causticsGlint[1] * 0.45;
      const b = baseCol[2] * (0.8 + fbmTile(u * 18, v * 18, 18, 2, seed + 3) * 0.4) + causticsPattern * causticsGlint[2] * 0.45;
      return [clamp255(r), clamp255(g), clamp255(b)];
    });
    const rough = paint(size, (x, y, u, v) => {
      const g = clamp255(95 + fbmTile(u * 20, v * 20, 20, 2, seed + 4) * 60);
      return [g, g, g];
    });
    const ao = paint(size, (x, y) => {
      const g = clamp255(90 + h[y * size + x] * 165);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 2.2), rough, ao };
  },

  /** Sunken waterlogged river driftwood with deep saturated grain, weathering fissures, and algae glaze. */
  sunkenDriftwood(size = 256) {
    const seed = 6652;
    const h = heightField(size, (x, y, u, v) => {
      const grain = Math.sin((v * 48.0 + fbmTile(u * 8, v * 8, 8, 3, seed) * 5.0) * Math.PI) * 0.35;
      const cracks = Math.pow(Math.abs(fbmTile(u * 14, v * 28, 14, 2, seed + 4) - 0.5) * 2.0, 3.0) * 0.45;
      return 0.5 + grain + cracks;
    });
    const map = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      const algae = Math.pow(fbmTile(u * 8, v * 8, 8, 2, seed + 9), 2.5);
      const wetWood = [56, 42, 32];
      const darkFissure = [24, 18, 14];
      const riverAlgae = [38, 72, 44];

      let r = wetWood[0] * (0.8 + hv * 0.4) * (1 - algae) + riverAlgae[0] * algae;
      let g = wetWood[1] * (0.8 + hv * 0.4) * (1 - algae) + riverAlgae[1] * algae;
      let b = wetWood[2] * (0.8 + hv * 0.4) * (1 - algae) + riverAlgae[2] * algae;

      if (hv < 0.35) {
        const k = (0.35 - hv) / 0.35;
        r = r * (1 - k) + darkFissure[0] * k;
        g = g * (1 - k) + darkFissure[1] * k;
        b = b * (1 - k) + darkFissure[2] * k;
      }
      return [clamp255(r), clamp255(g), clamp255(b)];
    });
    const rough = paint(size, (x, y, u, v) => {
      const g = clamp255(180 + fbmTile(u * 12, v * 24, 12, 2, seed + 6) * 45);
      return [g, g, g];
    });
    const ao = paint(size, (x, y) => {
      const g = clamp255(95 + h[y * size + x] * 160);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 2.0), rough, ao };
  },

  /** Calcareous Porous Aragonite Coral Reef Rock substrate with crustose coralline algae (rose, magenta, violet). */
  coralReefRock(size = 512) {
    const seed = 9182;
    const h = heightField(size, (x, y, u, v) => {
      const porous = fbmTile(u * 14, v * 14, 14, 3, seed) * 0.45;
      const cups = Math.pow(Math.abs(Math.sin(u * 32.0 * Math.PI) * Math.sin(v * 32.0 * Math.PI)), 1.5) * 0.35;
      const microPores = (fbmTile(u * 96, v * 96, 96, 2, seed + 8) - 0.5) * 0.20;
      return porous + cups + microPores;
    });
    const map = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      const corallineMask = Math.pow(fbmTile(u * 10, v * 10, 10, 3, seed + 12), 2.2);
      const aragonite = [192, 178, 162];   // Bleached calcium carbonate limestone
      const corallineRose = [198, 64, 112]; // Encrusting coralline algae
      const deepPore = [78, 62, 58];

      let r = aragonite[0] * (0.85 + hv * 0.3) * (1 - corallineMask) + corallineRose[0] * corallineMask;
      let g = aragonite[1] * (0.85 + hv * 0.3) * (1 - corallineMask) + corallineRose[1] * corallineMask;
      let b = aragonite[2] * (0.85 + hv * 0.3) * (1 - corallineMask) + corallineRose[2] * corallineMask;

      if (hv < 0.32) {
        const k = (0.32 - hv) / 0.32;
        r = r * (1 - k) + deepPore[0] * k;
        g = g * (1 - k) + deepPore[1] * k;
        b = b * (1 - k) + deepPore[2] * k;
      }
      return [clamp255(r), clamp255(g), clamp255(b)];
    });
    const rough = paint(size, (x, y, u, v) => {
      const g = clamp255(160 + fbmTile(u * 24, v * 24, 24, 2, seed + 3) * 55);
      return [g, g, g];
    });
    const ao = paint(size, (x, y) => {
      const g = clamp255(85 + h[y * size + x] * 170);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 2.8), rough, ao };
  },

  /** Photorealistic dense botanical foliage sprig containing 36 natural pointed leaves with branchlets. */
  leafCard(size = 512) {
    const seed = 719;
    const leaves = [];
    const rng = (s => () => { s = (s * 9301 + 49297) % 233280; return s / 233280; })(seed);

    // Main central twig + 8 lateral branchlets
    for (let b = 0; b < 8; b++) {
      const by = 0.18 + b * 0.095;
      const bSide = b % 2 === 0 ? 1 : -1;
      const bAng = bSide * (0.45 + rng() * 0.25) - Math.PI * 0.5;
      const bLen = 0.26 + rng() * 0.12;
      for (let l = 0; l < 4; l++) {
        const frac = (l + 1) / 4.2;
        const lx = 0.5 + Math.cos(bAng) * bLen * frac;
        const ly = by + Math.sin(bAng) * bLen * frac;
        const lSide = l % 2 === 0 ? 1 : -1;
        const lAng = bAng + lSide * (0.55 + rng() * 0.25);
        leaves.push({
          cx: lx,
          cy: ly,
          len: 0.11 + rng() * 0.04,
          ang: lAng,
          w: 0.042 + rng() * 0.014,
        });
      }
    }
    // Terminal crest leaves
    leaves.push({ cx: 0.50, cy: 0.12, len: 0.13, ang: -Math.PI * 0.5, w: 0.045 });
    leaves.push({ cx: 0.46, cy: 0.14, len: 0.11, ang: -Math.PI * 0.65, w: 0.038 });
    leaves.push({ cx: 0.54, cy: 0.14, len: 0.11, ang: -Math.PI * 0.35, w: 0.038 });

    const h = heightField(size, (x, y, u, v) => {
      let maxH = 0;
      for (const lf of leaves) {
        const dx = u - lf.cx, dy = v - lf.cy;
        const cosA = Math.cos(lf.ang), sinA = Math.sin(lf.ang);
        const along = (dx * cosA + dy * sinA) / lf.len;
        const perp = Math.abs(-dx * sinA + dy * cosA);
        if (along >= 0 && along <= 1) {
          const profile = Math.sin(along * Math.PI) * lf.w;
          if (perp < profile) {
            const relPerp = perp / Math.max(0.001, profile);
            const dome = Math.sqrt(Math.max(0, 1 - relPerp * relPerp));
            maxH = Math.max(maxH, dome * 0.6);
          }
        }
      }
      return maxH;
    });

    const map = paintRGBA(size, (x, y, u, v) => {
      let inLeaf = false, maxAlpha = 0, isVein = 0, isTip = 0;
      for (const lf of leaves) {
        const dx = u - lf.cx, dy = v - lf.cy;
        const cosA = Math.cos(lf.ang), sinA = Math.sin(lf.ang);
        const along = (dx * cosA + dy * sinA) / lf.len;
        const perp = Math.abs(-dx * sinA + dy * cosA);
        if (along >= 0 && along <= 1) {
          const profile = Math.sin(along * Math.PI) * lf.w;
          const dEdge = profile - perp;
          if (dEdge > 0) {
            inLeaf = true;
            maxAlpha = Math.max(maxAlpha, Math.min(1, dEdge / 0.0035));
            const relPerp = perp / Math.max(0.001, profile);
            if (relPerp < 0.14) isVein = Math.max(isVein, 1 - relPerp);
            if (along > 0.65) isTip = Math.max(isTip, (along - 0.65) * 2.8);
          }
        }
      }

      // Main twig
      const stemDist = Math.abs(u - 0.5);
      const stemW = 0.011 * (1.1 - v * 0.5);
      if (stemDist < stemW && v > 0.16) {
        const a = Math.min(1, (stemW - stemDist) / 0.0025);
        return [74, 52, 32, Math.round(a * 255)];
      }

      if (!inLeaf) return [0, 0, 0, 0];

      const micro = fbmTile(u * 28, v * 28, 28, 3, seed);
      const deepGreen = [74, 138, 56];
      const sunlitGreen = [124, 186, 72];
      const veinGreen = [148, 208, 88];
      const goldCrest = [174, 224, 98];

      let c = [
        deepGreen[0] * (1 - micro) + sunlitGreen[0] * micro,
        deepGreen[1] * (1 - micro) + sunlitGreen[1] * micro,
        deepGreen[2] * (1 - micro) + sunlitGreen[2] * micro,
      ];
      if (isVein > 0.1) c = [c[0] * 0.5 + veinGreen[0] * 0.5, c[1] * 0.5 + veinGreen[1] * 0.5, c[2] * 0.5 + veinGreen[2] * 0.5];
      if (isTip > 0.2) c = [c[0] * 0.6 + goldCrest[0] * 0.4, c[1] * 0.6 + goldCrest[1] * 0.4, c[2] * 0.6 + goldCrest[2] * 0.4];
      return [clamp255(c[0]), clamp255(c[1]), clamp255(c[2]), Math.round(maxAlpha * 255)];
    });

    const rough = paint(size, () => [225, 225, 225]);
    return { map, normal: normalFromHeight(size, h, 1.8), rough };
  },

  /** Organic evergreen pine needle branch with radiating sprigs and multi-tiered needle clusters. */
  pineNeedles(size = 512) {
    const seed = 823;
    const h = heightField(size, (x, y, u, v) => {
      const dx = Math.abs(u - 0.5);
      const maxWidth = 0.48 * (1.1 - v * 0.38);
      if (dx > maxWidth) return 0;
      // Multi-frequency needle fascicles radiating off central shoot
      const sprig = Math.abs(Math.sin((v * 64 + dx * 36 + fbmTile(u * 8, v * 8, 8, 3, seed) * 3.5) * Math.PI));
      const subSprig = Math.abs(Math.sin((v * 42 - dx * 28 + fbmTile(u * 12, v * 12, 12, 2, seed + 19) * 2.5) * Math.PI));
      const combined = Math.max(Math.pow(sprig, 2.4), Math.pow(subSprig, 2.8) * 0.85);
      const inSprig = dx < maxWidth;
      return inSprig ? combined * (1.0 - Math.pow(dx / maxWidth, 1.8) * 0.4) : 0;
    });

    const map = paintRGBA(size, (x, y, u, v) => {
      const dx = Math.abs(u - 0.5);
      const maxWidth = 0.48 * (1.1 - v * 0.38);
      if (dx > maxWidth) return [0, 0, 0, 0];

      // Central woody twig shoot
      if (dx < 0.022) {
        const c = tint([76, 52, 34], 0.8 + fbmTile(u * 16, v * 16, 16, 2, seed) * 0.4);
        return [c[0], c[1], c[2], 255];
      }

      // Radiating needle sprigs with fine fascicle distribution
      const sprig = Math.abs(Math.sin((v * 64 + dx * 36 + fbmTile(u * 8, v * 8, 8, 3, seed) * 3.5) * Math.PI));
      const subSprig = Math.abs(Math.sin((v * 42 - dx * 28 + fbmTile(u * 12, v * 12, 12, 2, seed + 19) * 2.5) * Math.PI));
      const needlePattern = Math.max(Math.pow(sprig, 2.2), Math.pow(subSprig, 2.6) * 0.85);
      if (needlePattern < 0.14) return [0, 0, 0, 0];

      // Natural mountain pine chlorophyll albedo gradient
      const needleCore = [58, 112, 54];
      const needleMid  = [80, 140, 65];
      const needleTip  = [102, 168, 76];
      const t = Math.min(1.0, (dx / maxWidth) * 1.25);
      let c = [0, 0, 0];
      if (t < 0.5) {
        const k = t / 0.5;
        c = [needleCore[0] * (1 - k) + needleMid[0] * k, needleCore[1] * (1 - k) + needleMid[1] * k, needleCore[2] * (1 - k) + needleMid[2] * k];
      } else {
        const k = (t - 0.5) / 0.5;
        c = [needleMid[0] * (1 - k) + needleTip[0] * k, needleMid[1] * (1 - k) + needleTip[1] * k, needleMid[2] * (1 - k) + needleTip[2] * k];
      }
      return [clamp255(c[0]), clamp255(c[1]), clamp255(c[2]), Math.round(Math.min(1.0, needlePattern * 1.8) * 255)];
    });

    const rough = paint(size, () => [195, 195, 195]);
    return { map, normal: normalFromHeight(size, h, 3.6), rough };
  },

  /** Photorealistic tropical pinnate palm frond with arching central rachis and 44 individual leaflets. */
  palmFrond(size = 512) {
    const seed = 5891;
    const leaflets = [];
    const rng = (s => () => { s = (s * 9301 + 49297) % 233280; return s / 233280; })(seed);

    // 22 pairs of leaflets along the rachis (v from 0.08 to 0.95)
    for (let i = 0; i < 22; i++) {
      const vPos = 0.08 + (i / 22) * 0.86;
      const taper = Math.sin(Math.pow((i + 1) / 23, 0.65) * Math.PI);
      const leafletLen = (0.24 + taper * 0.22) * (1.0 - Math.pow(vPos, 2.5) * 0.35);
      const leafletWidth = 0.024 * (0.6 + taper * 0.4);

      // Left leaflet
      leaflets.push({
        rx: 0.50,
        ry: vPos,
        ang: -Math.PI * 0.5 - (0.42 + (1.0 - vPos) * 0.35) + (rng() - 0.5) * 0.1,
        len: leafletLen,
        w: leafletWidth,
      });
      // Right leaflet
      leaflets.push({
        rx: 0.50,
        ry: vPos + 0.015,
        ang: -Math.PI * 0.5 + (0.42 + (1.0 - vPos) * 0.35) + (rng() - 0.5) * 0.1,
        len: leafletLen,
        w: leafletWidth,
      });
    }

    const h = heightField(size, (x, y, u, v) => {
      // Central rachis height
      const dxRachis = Math.abs(u - 0.50);
      const rachisW = 0.018 * (1.1 - v * 0.55);
      let maxH = dxRachis < rachisW ? Math.sqrt(1.0 - dxRachis / rachisW) * 0.95 : 0;

      // Leaflets height
      for (const lf of leaflets) {
        const dx = u - lf.rx, dy = v - lf.ry;
        const cosA = Math.cos(lf.ang), sinA = Math.sin(lf.ang);
        const along = (dx * cosA + dy * sinA) / lf.len;
        const perp = Math.abs(-dx * sinA + dy * cosA);
        if (along >= 0 && along <= 1) {
          const profile = Math.sin(Math.pow(along, 0.45) * Math.PI) * lf.w;
          if (perp < profile) {
            const relPerp = perp / Math.max(0.001, profile);
            const dome = Math.sqrt(Math.max(0, 1.0 - relPerp * relPerp));
            maxH = Math.max(maxH, dome * (0.75 - along * 0.25));
          }
        }
      }
      return maxH;
    });

    const map = paintRGBA(size, (x, y, u, v) => {
      // 1. Central golden-green woody rachis (stem)
      const dxRachis = Math.abs(u - 0.50);
      const rachisW = 0.016 * (1.1 - v * 0.55);
      if (dxRachis < rachisW && v > 0.05) {
        const rachisAlpha = Math.min(1.0, (rachisW - dxRachis) / 0.002);
        const rachisBase = [108, 142, 54];
        const rachisTip = [156, 186, 68];
        const rc = [
          rachisBase[0] * (1 - v) + rachisTip[0] * v,
          rachisBase[1] * (1 - v) + rachisTip[1] * v,
          rachisBase[2] * (1 - v) + rachisTip[2] * v,
        ];
        return [clamp255(rc[0]), clamp255(rc[1]), clamp255(rc[2]), Math.round(rachisAlpha * 255)];
      }

      // 2. Leaflets
      let inLeaf = false, maxAlpha = 0, leafletAlong = 0;
      for (const lf of leaflets) {
        const dx = u - lf.rx, dy = v - lf.ry;
        const cosA = Math.cos(lf.ang), sinA = Math.sin(lf.ang);
        const along = (dx * cosA + dy * sinA) / lf.len;
        const perp = Math.abs(-dx * sinA + dy * cosA);
        if (along >= 0 && along <= 1) {
          const profile = Math.sin(Math.pow(along, 0.45) * Math.PI) * lf.w;
          const dEdge = profile - perp;
          if (dEdge > 0) {
            inLeaf = true;
            maxAlpha = Math.max(maxAlpha, Math.min(1.0, dEdge / 0.003));
            leafletAlong = along;
          }
        }
      }

      if (!inLeaf) return [0, 0, 0, 0];

      // Photorealistic tropical palm chlorophyll gradient
      const deepEmerald = [30, 92, 34];
      const sunlitLime = [88, 168, 48];
      const goldApex = [152, 212, 74];
      const micro = fbmTile(u * 32, v * 32, 32, 3, seed) * 0.15;

      let r = deepEmerald[0] * (1 - v) + sunlitLime[0] * v;
      let g = deepEmerald[1] * (1 - v) + sunlitLime[1] * v;
      let b = deepEmerald[2] * (1 - v) + sunlitLime[2] * v;

      if (leafletAlong > 0.65) {
        const k = (leafletAlong - 0.65) / 0.35;
        r = r * (1 - k) + goldApex[0] * k;
        g = g * (1 - k) + goldApex[1] * k;
        b = b * (1 - k) + goldApex[2] * k;
      }

      r += micro * 30; g += micro * 35; b += micro * 20;

      return [clamp255(r), clamp255(g), clamp255(b), Math.round(maxAlpha * 255)];
    });

    const rough = paint(size, () => [170, 170, 170]);
    return { map, normal: normalFromHeight(size, h, 3.0), rough };
  },

  /** 3D Instanced grass blade cluster for meadow groundcover. */
  grassTuft(size = 128) {
    const seed = 937;
    const blades = [
      { ox: 0.50, tipX: 0.48, h: 0.96, w: 0.034 },
      { ox: 0.46, tipX: 0.30, h: 0.84, w: 0.030 },
      { ox: 0.54, tipX: 0.70, h: 0.89, w: 0.030 },
      { ox: 0.42, tipX: 0.20, h: 0.72, w: 0.026 },
      { ox: 0.58, tipX: 0.80, h: 0.76, w: 0.026 },
      { ox: 0.48, tipX: 0.36, h: 0.90, w: 0.032 },
      { ox: 0.52, tipX: 0.62, h: 0.87, w: 0.032 },
      { ox: 0.38, tipX: 0.12, h: 0.60, w: 0.024 },
      { ox: 0.62, tipX: 0.88, h: 0.64, w: 0.024 },
      { ox: 0.34, tipX: 0.08, h: 0.48, w: 0.020 },
      { ox: 0.66, tipX: 0.92, h: 0.50, w: 0.020 },
    ];

    const h = heightField(size, (x, y, u, v) => {
      let maxH = 0;
      const vy = 1 - v; // 0 at bottom, 1 at top
      for (const b of blades) {
        if (vy <= b.h) {
          const t = vy / b.h;
          const cx = b.ox + (b.tipX - b.ox) * (t * t);
          const width = b.w * (1 - t * 0.9);
          const dx = Math.abs(u - cx);
          if (dx < width) {
            const dome = Math.sqrt(1 - dx / width);
            maxH = Math.max(maxH, dome * (1 - t * 0.3));
          }
        }
      }
      return maxH;
    });

    const map = paintRGBA(size, (x, y, u, v) => {
      const vy = 1 - v;
      let inBlade = false, bladeAlpha = 0, topFactor = 0;
      for (const b of blades) {
        if (vy <= b.h) {
          const t = vy / b.h;
          const cx = b.ox + (b.tipX - b.ox) * (t * t);
          const width = b.w * (1 - t * 0.9);
          const dx = Math.abs(u - cx);
          if (dx < width) {
            inBlade = true;
            bladeAlpha = Math.max(bladeAlpha, Math.min(1, (width - dx) / 0.0035));
            topFactor = Math.max(topFactor, t);
          }
        }
      }

      if (!inBlade) return [0, 0, 0, 0];

      const rootGreen = [22, 46, 20];
      const midGreen = [48, 88, 36];
      const sunlitTip = [88, 122, 42];

      let c = [0, 0, 0];
      if (topFactor < 0.45) {
        const k = topFactor / 0.45;
        c = [rootGreen[0] * (1 - k) + midGreen[0] * k, rootGreen[1] * (1 - k) + midGreen[1] * k, rootGreen[2] * (1 - k) + midGreen[2] * k];
      } else {
        const k = (topFactor - 0.45) / 0.55;
        c = [midGreen[0] * (1 - k) + sunlitTip[0] * k, midGreen[1] * (1 - k) + sunlitTip[1] * k, midGreen[2] * (1 - k) + sunlitTip[2] * k];
      }

      return [clamp255(c[0]), clamp255(c[1]), clamp255(c[2]), Math.round(bladeAlpha * 255)];
    });

    const rough = paint(size, () => [185, 185, 185]);
    return { map, normal: normalFromHeight(size, h, 2.6), rough };
  },

  /** Photorealistic individual botanical grass blade for 3D ribbon geometry */
  grassBlade(size = 128) {
    const seed = 4492;
    const h = heightField(size, (x, y, u, v) => {
      const dx = Math.abs(u - 0.5) * 2.0;
      const dome = Math.sqrt(Math.max(0, 1.0 - dx * dx));
      return dome * 0.85;
    });

    const map = paint(size, (x, y, u, v) => {
      // Natural lush pasture fescue tones (photographic Earth field greens)
      const rootGreen = [38, 54, 30];
      const midGreen  = [62, 90, 46];
      const sunlitTip = [84, 120, 58];

      let r, g, b;
      if (v < 0.45) {
        const k = v / 0.45;
        r = rootGreen[0] * (1 - k) + midGreen[0] * k;
        g = rootGreen[1] * (1 - k) + midGreen[1] * k;
        b = rootGreen[2] * (1 - k) + midGreen[2] * k;
      } else {
        const k = (v - 0.45) / 0.55;
        r = midGreen[0] * (1 - k) + sunlitTip[0] * k;
        g = midGreen[1] * (1 - k) + sunlitTip[1] * k;
        b = midGreen[2] * (1 - k) + sunlitTip[2] * k;
      }

      const vein = Math.sin(u * 16.0 * Math.PI) * 0.05;
      const noise = fbmTile(u * 12, v * 32, 12, 2, seed) * 0.10;
      const lightTint = 0.96 + vein + noise;

      return [
        clamp255(r * lightTint),
        clamp255(g * lightTint),
        clamp255(b * lightTint),
      ];
    });

    const rough = paint(size, (x, y, u, v) => {
      const g = clamp255(215 + fbmTile(u * 16, v * 16, 16, 2, seed + 1) * 35);
      return [g, g, g];
    });

    return { map, normal: normalFromHeight(size, h, 1.6), rough };
  },

  /** Alpine wildflower blooms: buttercup, lupine, clover, and daisy. */
  wildflowers(size = 128) {
    const seed = 1047;
    const blooms = [
      { cx: 0.28, cy: 0.32, r: 0.20, color: [248, 208, 54], center: [224, 138, 28], petals: 5 },  // Buttercup
      { cx: 0.72, cy: 0.30, r: 0.22, color: [112, 138, 235], center: [245, 235, 180], petals: 6 }, // Alpine Lupine
      { cx: 0.30, cy: 0.72, r: 0.19, color: [232, 94, 142], center: [142, 42, 88], petals: 5 },   // Wild Clover
      { cx: 0.72, cy: 0.70, r: 0.21, color: [250, 248, 242], center: [244, 196, 44], petals: 8 }, // Edelweiss
    ];

    const h = heightField(size, (x, y, u, v) => {
      let maxH = 0;
      for (const bl of blooms) {
        const dx = u - bl.cx, dy = v - bl.cy;
        const dist = Math.hypot(dx, dy);
        if (dist < bl.r) {
          const ang = Math.atan2(dy, dx);
          const petalShape = Math.abs(Math.sin(ang * bl.petals * 0.5));
          const edge = bl.r * (0.35 + petalShape * 0.65);
          if (dist < edge) {
            maxH = Math.max(maxH, Math.sqrt(Math.max(0, 1.0 - dist / edge)));
          }
        }
      }
      return maxH;
    });

    const map = paintRGBA(size, (x, y, u, v) => {
      for (const bl of blooms) {
        const dx = u - bl.cx, dy = v - bl.cy;
        const dist = Math.hypot(dx, dy);
        if (dist < bl.r) {
          const ang = Math.atan2(dy, dx);
          const petalShape = Math.abs(Math.sin(ang * bl.petals * 0.5));
          const edge = bl.r * (0.35 + petalShape * 0.65);
          if (dist < edge) {
            if (dist < bl.r * 0.25) return [...bl.center, 255];
            return [...bl.color, 255];
          }
        }
      }
      return [0, 0, 0, 0];
    });

    const rough = paint(size, () => [180, 180, 180]);
    return { map, normal: normalFromHeight(size, h, 1.6), rough };
  },

  /** Japanese Sakura Cherry Blossom Clusters with Notched Petals & Young Copper-Green Leaves */
  sakuraBlossom(size = 256) {
    const seed = 3841;
    const clusters = [
      { cx: 0.32, cy: 0.30, r: 0.26, ang: 0.4 },
      { cx: 0.70, cy: 0.28, r: 0.24, ang: 1.1 },
      { cx: 0.30, cy: 0.70, r: 0.25, ang: 1.7 },
      { cx: 0.70, cy: 0.68, r: 0.24, ang: 2.3 },
      { cx: 0.50, cy: 0.48, r: 0.26, ang: 0.0 },
    ];
    const leaves = [
      { cx: 0.16, cy: 0.46, len: 0.16, ang: -0.6, w: 0.045 },
      { cx: 0.82, cy: 0.48, len: 0.17, ang: 0.5, w: 0.048 },
      { cx: 0.50, cy: 0.84, len: 0.15, ang: 1.6, w: 0.042 },
    ];

    const h = heightField(size, (x, y, u, v) => {
      let maxH = 0;
      for (const cl of clusters) {
        const dx = u - cl.cx, dy = v - cl.cy;
        const dist = Math.hypot(dx, dy);
        if (dist < cl.r) {
          const ang = Math.atan2(dy, dx) + cl.ang;
          // 5 notched sakura petals
          const petalShape = Math.abs(Math.sin(ang * 2.5));
          const notch = 1.0 - Math.pow(Math.abs(Math.cos(ang * 2.5)), 6.0) * 0.22;
          const edge = cl.r * (0.45 + petalShape * 0.55) * notch;
          if (dist < edge) {
            const dome = Math.sqrt(Math.max(0, 1.0 - dist / edge));
            maxH = Math.max(maxH, dome * 0.9);
          }
        }
      }
      for (const lf of leaves) {
        const dx = u - lf.cx, dy = v - lf.cy;
        const cosA = Math.cos(lf.ang), sinA = Math.sin(lf.ang);
        const along = (dx * cosA + dy * sinA) / lf.len;
        const perp = Math.abs(-dx * sinA + dy * cosA);
        if (along >= 0 && along <= 1) {
          const profile = Math.sin(along * Math.PI) * lf.w;
          if (perp < profile) {
            const relPerp = perp / Math.max(0.001, profile);
            maxH = Math.max(maxH, Math.sqrt(Math.max(0, 1 - relPerp * relPerp)) * 0.5);
          }
        }
      }
      return maxH;
    });

    const map = paintRGBA(size, (x, y, u, v) => {
      // 1. Spring foliage leaflets
      for (const lf of leaves) {
        const dx = u - lf.cx, dy = v - lf.cy;
        const cosA = Math.cos(lf.ang), sinA = Math.sin(lf.ang);
        const along = (dx * cosA + dy * sinA) / lf.len;
        const perp = Math.abs(-dx * sinA + dy * cosA);
        if (along >= 0 && along <= 1) {
          const profile = Math.sin(along * Math.PI) * lf.w;
          const dEdge = profile - perp;
          if (dEdge > 0) {
            const leafAlpha = Math.min(1.0, dEdge / 0.004);
            const springGreen = [114, 182, 72];
            const sunlitGreen = [162, 218, 92];
            const c = along > 0.6 ? sunlitGreen : springGreen;
            return [c[0], c[1], c[2], Math.round(leafAlpha * 255)];
          }
        }
      }

      // 2. Sakura Blossoms
      for (const cl of clusters) {
        const dx = u - cl.cx, dy = v - cl.cy;
        const dist = Math.hypot(dx, dy);
        if (dist < cl.r) {
          const ang = Math.atan2(dy, dx) + cl.ang;
          const petalShape = Math.abs(Math.sin(ang * 2.5));
          const notch = 1.0 - Math.pow(Math.abs(Math.cos(ang * 2.5)), 6.0) * 0.22;
          const edge = cl.r * (0.45 + petalShape * 0.55) * notch;
          if (dist < edge) {
            const alpha = Math.min(1.0, (edge - dist) / 0.005);
            const t = dist / edge;

            // Heart / Stamen eye
            if (dist < cl.r * 0.22) {
              const eyeT = dist / (cl.r * 0.22);
              const magentaHeart = [218, 42, 98];
              const goldPistil = [252, 224, 76];
              const eyeCol = [
                goldPistil[0] * (1 - eyeT) + magentaHeart[0] * eyeT,
                goldPistil[1] * (1 - eyeT) + magentaHeart[1] * eyeT,
                goldPistil[2] * (1 - eyeT) + magentaHeart[2] * eyeT,
              ];
              return [eyeCol[0], eyeCol[1], eyeCol[2], Math.round(alpha * 255)];
            }

            // Petals: Celestial blush white center grading to soft sakura pink margins (#fff0f8 to #ffb8d8)
            const blushWhite = [255, 240, 248];
            const sakuraPink = [255, 184, 216];
            const petalCrest = [255, 204, 224];

            let r = blushWhite[0] * (1 - t) + sakuraPink[0] * t;
            let g = blushWhite[1] * (1 - t) + sakuraPink[1] * t;
            let b = blushWhite[2] * (1 - t) + sakuraPink[2] * t;

            if (t > 0.8) {
              const k = (t - 0.8) / 0.2;
              r = r * (1 - k) + petalCrest[0] * k;
              g = g * (1 - k) + petalCrest[1] * k;
              b = b * (1 - k) + petalCrest[2] * k;
            }

            return [clamp255(r), clamp255(g), clamp255(b), Math.round(alpha * 255)];
          }
        }
      }

      // 3. Woody Branchlets
      const stemDist = Math.abs(u - 0.5);
      if (stemDist < 0.012 && v > 0.25 && v < 0.85) {
        return [76, 52, 38, 255];
      }

      return [0, 0, 0, 0];
    });

    const rough = paint(size, () => [170, 170, 170]);
    return { map, normal: normalFromHeight(size, h, 1.8), rough };
  },

  /** California & Alpine Golden Poppies with vibrant gold-to-orange silk petals. */
  goldenPoppy(size = 128) {
    const seed = 4412;
    const blooms = [
      { cx: 0.32, cy: 0.35, r: 0.22, rot: 0.2 },
      { cx: 0.68, cy: 0.32, r: 0.20, rot: 0.8 },
      { cx: 0.35, cy: 0.68, r: 0.19, rot: 1.5 },
      { cx: 0.70, cy: 0.70, r: 0.24, rot: 2.1 },
    ];

    const h = heightField(size, (x, y, u, v) => {
      let maxH = 0;
      for (const bl of blooms) {
        const dx = u - bl.cx, dy = v - bl.cy;
        const dist = Math.hypot(dx, dy);
        if (dist < bl.r) {
          const ang = Math.atan2(dy, dx) + bl.rot;
          const petalWave = Math.abs(Math.sin(ang * 2.0));
          const edge = bl.r * (0.65 + petalWave * 0.35);
          if (dist < edge) {
            maxH = Math.max(maxH, Math.sqrt(1 - dist / edge) * 0.85);
          }
        }
      }
      return maxH;
    });

    const map = paintRGBA(size, (x, y, u, v) => {
      for (const bl of blooms) {
        const dx = u - bl.cx, dy = v - bl.cy;
        const dist = Math.hypot(dx, dy);
        if (dist < bl.r) {
          const ang = Math.atan2(dy, dx) + bl.rot;
          const petalWave = Math.abs(Math.sin(ang * 2.0));
          const edge = bl.r * (0.65 + petalWave * 0.35);
          if (dist < edge) {
            const alpha = Math.min(1.0, (edge - dist) / 0.006);
            if (dist < bl.r * 0.20) {
              return [46, 58, 30, Math.round(alpha * 255)]; // Dark green seed capsule
            }
            const t = dist / edge;
            const goldCenter = [255, 206, 42];
            const orangePetal = [252, 138, 20];
            const fieryEdge = [242, 88, 14];

            let cr = goldCenter[0] * (1 - t) + orangePetal[0] * t;
            let cg = goldCenter[1] * (1 - t) + orangePetal[1] * t;
            let cb = goldCenter[2] * (1 - t) + orangePetal[2] * t;
            if (t > 0.75) {
              const k = (t - 0.75) / 0.25;
              cr = cr * (1 - k) + fieryEdge[0] * k;
              cg = cg * (1 - k) + fieryEdge[1] * k;
              cb = cb * (1 - k) + fieryEdge[2] * k;
            }
            return [clamp255(cr), clamp255(cg), clamp255(cb), Math.round(alpha * 255)];
          }
        }
      }
      return [0, 0, 0, 0];
    });

    const rough = paint(size, () => [160, 160, 160]);
    return { map, normal: normalFromHeight(size, h, 2.0), rough };
  },

  /** High Alpine Edelweiss Star Blooms with woolly white star petals and golden-green eye. */
  edelweiss(size = 128) {
    const seed = 9184;
    const blooms = [
      { cx: 0.30, cy: 0.32, r: 0.24, petals: 10, rot: 0.1 },
      { cx: 0.72, cy: 0.30, r: 0.22, petals: 9, rot: 0.9 },
      { cx: 0.32, cy: 0.72, r: 0.21, petals: 10, rot: 1.4 },
      { cx: 0.70, cy: 0.70, r: 0.25, petals: 11, rot: 2.2 },
    ];

    const h = heightField(size, (x, y, u, v) => {
      let maxH = 0;
      for (const b of blooms) {
        const dx = u - b.cx, dy = v - b.cy;
        const dist = Math.hypot(dx, dy);
        if (dist < b.r) {
          const ang = Math.atan2(dy, dx) + b.rot;
          const star = Math.pow(Math.abs(Math.sin(ang * b.petals * 0.5)), 2.2);
          const edge = b.r * (0.35 + star * 0.65);
          if (dist < edge) {
            maxH = Math.max(maxH, Math.sqrt(1 - dist / edge) * 0.85);
          }
        }
      }
      return maxH;
    });

    const map = paintRGBA(size, (x, y, u, v) => {
      for (const b of blooms) {
        const dx = u - b.cx, dy = v - b.cy;
        const dist = Math.hypot(dx, dy);
        if (dist < b.r) {
          const ang = Math.atan2(dy, dx) + b.rot;
          const star = Math.pow(Math.abs(Math.sin(ang * b.petals * 0.5)), 2.2);
          const edge = b.r * (0.35 + star * 0.65);
          if (dist < edge) {
            const alpha = Math.min(1.0, (edge - dist) / 0.005);
            if (dist < b.r * 0.28) {
              const eyeT = dist / (b.r * 0.28);
              const goldPistil = [238, 198, 48];
              const oliveCenter = [138, 156, 68];
              return [
                clamp255(goldPistil[0] * (1 - eyeT) + oliveCenter[0] * eyeT),
                clamp255(goldPistil[1] * (1 - eyeT) + oliveCenter[1] * eyeT),
                clamp255(goldPistil[2] * (1 - eyeT) + oliveCenter[2] * eyeT),
                Math.round(alpha * 255)
              ];
            }
            const woollyWhite = [250, 252, 246];
            const silverSage = [218, 230, 214];
            const t = dist / edge;
            const col = [
              woollyWhite[0] * (1 - t * 0.3) + silverSage[0] * (t * 0.3),
              woollyWhite[1] * (1 - t * 0.3) + silverSage[1] * (t * 0.3),
              woollyWhite[2] * (1 - t * 0.3) + silverSage[2] * (t * 0.3),
            ];
            return [clamp255(col[0]), clamp255(col[1]), clamp255(col[2]), Math.round(alpha * 255)];
          }
        }
      }
      return [0, 0, 0, 0];
    });

    const rough = paint(size, () => [180, 180, 180]);
    return { map, normal: normalFromHeight(size, h, 1.8), rough };
  },

  /** Fragrant French & Alpine Lavender Sprigs with tiered violet/indigo florets. */
  lavenderSprig(size = 128) {
    const seed = 6721;
    const h = heightField(size, (x, y, u, v) => {
      const dx = Math.abs(u - 0.5);
      const isStem = dx < 0.025;
      const florets = Math.abs(Math.sin((v * 48 + dx * 24 + fbmTile(u * 12, v * 12, 12, 2, seed) * 4) * Math.PI));
      const inSpike = dx < (0.28 * (1.1 - v * 0.45)) && v > 0.15 && v < 0.92;
      return inSpike ? Math.pow(florets, 2.5) * (1 - dx / 0.28) * 0.8 : (isStem ? 0.4 : 0);
    });

    const map = paintRGBA(size, (x, y, u, v) => {
      const dx = Math.abs(u - 0.5);
      const maxW = 0.28 * (1.1 - v * 0.45);
      if (dx > maxW && (dx > 0.025 || v > 0.92 || v < 0.12)) return [0, 0, 0, 0];

      // Sage-green stem
      if (dx < 0.025 && (v >= 0.85 || v < 0.25)) {
        return [88, 126, 84, 255];
      }

      // Lavender florets
      const floretPattern = Math.abs(Math.sin((v * 48 + dx * 24 + fbmTile(u * 12, v * 12, 12, 2, seed) * 4) * Math.PI));
      const floretAlpha = Math.pow(floretPattern, 2.0);
      if (floretAlpha < 0.12) return [0, 0, 0, 0];

      const deepViolet = [128, 76, 198];
      const brightLavender = [174, 128, 238];
      const softLilac = [206, 172, 252];
      const t = Math.min(1.0, (dx / maxW) * 1.2);

      let r = deepViolet[0] * (1 - t) + brightLavender[0] * t;
      let g = deepViolet[1] * (1 - t) + brightLavender[1] * t;
      let b = deepViolet[2] * (1 - t) + brightLavender[2] * t;

      if (v < 0.35) {
        const topFrac = (0.35 - v) / 0.35;
        r = r * (1 - topFrac) + softLilac[0] * topFrac;
        g = g * (1 - topFrac) + softLilac[1] * topFrac;
        b = b * (1 - topFrac) + softLilac[2] * topFrac;
      }

      return [clamp255(r), clamp255(g), clamp255(b), Math.round(Math.min(1.0, floretAlpha * 1.8) * 255)];
    });

    const rough = paint(size, () => [175, 175, 175]);
    return { map, normal: normalFromHeight(size, h, 2.4), rough };
  },

  /** Fallen Pine Needles & Forest Floor Detritus for Tree Understories */
  fallenPineNeedles(size = 128) {
    const seed = 3881;
    const h = heightField(size, (x, y, u, v) => {
      const n1 = Math.abs(Math.sin((u * 44 + v * 32 + fbmTile(u * 6, v * 6, 6, 3, seed) * 5) * Math.PI));
      const n2 = Math.abs(Math.cos((v * 44 - u * 32 + fbmTile(u * 8, v * 8, 8, 3, seed + 4) * 5) * Math.PI));
      const needles = Math.max(Math.pow(n1, 3.2), Math.pow(n2, 3.2)) * 0.65;
      const humus = fbmTile(u * 12, v * 12, 12, 3, seed + 9) * 0.35;
      return needles + humus;
    });

    const map = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      const russet = [124, 76, 42];
      const ochre = [156, 102, 54];
      const darkHumus = [48, 36, 26];
      const dampSoil = [36, 28, 20];

      let c = darkHumus;
      if (hv > 0.45) {
        const k = (hv - 0.45) / 0.55;
        c = [russet[0] * (1 - k) + ochre[0] * k, russet[1] * (1 - k) + ochre[1] * k, russet[2] * (1 - k) + ochre[2] * k];
      } else {
        const k = hv / 0.45;
        c = [dampSoil[0] * (1 - k) + darkHumus[0] * k, dampSoil[1] * (1 - k) + darkHumus[1] * k, dampSoil[2] * (1 - k) + darkHumus[2] * k];
      }
      return [clamp255(c[0]), clamp255(c[1]), clamp255(c[2])];
    });

    const rough = paint(size, () => [230, 230, 230]);
    const ao = paint(size, (x, y) => {
      const g = clamp255(110 + h[y * size + x] * 145);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 2.8), rough, ao };
  },

  /** Weathered Granite Boulders with Velvety Emerald Moss Cushions */
  mossyStone(size = 128) {
    const seed = 8172;
    const h = heightField(size, (x, y, u, v) => {
      const stoneRelief = fbmTile(u * 14, v * 14, 14, 3, seed) * 0.5;
      const mossPads = Math.pow(fbmTile(u * 8, v * 8, 8, 3, seed + 5), 2.6) * 0.5;
      return stoneRelief + mossPads;
    });

    const map = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      const mossMask = Math.pow(fbmTile(u * 8, v * 8, 8, 3, seed + 5), 2.6);
      const graniteSlate = [92, 88, 84];
      const emeraldMoss = [44, 96, 34];
      const sunlitMoss = [98, 154, 48];

      let r = graniteSlate[0] * (1 - mossMask) + (emeraldMoss[0] * (1 - hv) + sunlitMoss[0] * hv) * mossMask;
      let g = graniteSlate[1] * (1 - mossMask) + (emeraldMoss[1] * (1 - hv) + sunlitMoss[1] * hv) * mossMask;
      let b = graniteSlate[2] * (1 - mossMask) + (emeraldMoss[2] * (1 - hv) + sunlitMoss[2] * hv) * mossMask;

      return [clamp255(r), clamp255(g), clamp255(b)];
    });

    const rough = paint(size, (x, y, u, v) => {
      const mossMask = Math.pow(fbmTile(u * 8, v * 8, 8, 3, seed + 5), 2.6);
      const g = clamp255(190 * (1 - mossMask) + 130 * mossMask);
      return [g, g, g];
    });

    const ao = paint(size, (x, y) => {
      const g = clamp255(90 + h[y * size + x] * 165);
      return [g, g, g];
    });

    return { map, normal: normalFromHeight(size, h, 2.6), rough, ao };
  },

  /** Soft volumetric cumulus cloud puff with translucent alpha falloff. */
  cloudCard(size = 256) {
    const seed = 991;
    const map = paintRGBA(size, (x, y, u, v) => {
      const dx = (u - 0.5) * 2;
      const dy = (v - 0.5) * 2.2;
      const dist = Math.hypot(dx, dy);
      if (dist >= 1.0) return [0, 0, 0, 0];

      const n1 = fbmTile(u * 5, v * 5, 5, 3, seed);
      const n2 = fbmTile(u * 14, v * 14, 14, 3, seed + 7);
      const density = Math.max(0, (1 - dist) * 1.3 - (1 - n1) * 0.45 - (1 - n2) * 0.25);
      const alpha = Math.min(1, density * 1.8);
      if (alpha <= 0.01) return [0, 0, 0, 0];

      // Silver-white illuminated cumulus with warm sunlit top and soft ambient underside
      const sunlit = [255, 252, 246];
      const ambient = [218, 230, 244];
      const t = Math.max(0, Math.min(1, 0.5 - dy * 0.5 + n1 * 0.2));
      const c = [
        ambient[0] * (1 - t) + sunlit[0] * t,
        ambient[1] * (1 - t) + sunlit[1] * t,
        ambient[2] * (1 - t) + sunlit[2] * t,
      ];
      return [clamp255(c[0]), clamp255(c[1]), clamp255(c[2]), Math.round(alpha * 255)];
    });
    return { map };
  },

  /** High-resolution Google Earth-grade aerial satellite orthophoto. */
  satelliteOrthophoto(size = 256) {
    const seed = 8821;
    const h = heightField(size, (x, y, u, v) => {
      const drainage = Math.abs(fbmTile(u * 8, v * 8, 8, 3, seed) - 0.5) * 0.6;
      const parcels = Math.sin(u * 14 * Math.PI) * Math.cos(v * 14 * Math.PI) * 0.15;
      const micro = fbmTile(u * 48, v * 48, 48, 3, seed + 9) * 0.25;
      return drainage + parcels + micro;
    });

    const map = paint(size, (x, y, u, v) => {
      const fieldCell = Math.floor(u * 12) + Math.floor(v * 12) * 12;
      const fieldVar = ((Math.sin(fieldCell * 91.3) * 43758.5453) % 1 + 1) * 0.5;
      
      const moisture = fbmTile(u * 5, v * 5, 5, 3, seed + 1);
      const gravelSilt = Math.pow(fbmTile(u * 20, v * 20, 20, 3, seed + 5), 3.2);
      const canopyMottle = fbmTile(u * 32, v * 32, 32, 3, seed + 11);

      // Natural realistic aerial satellite palette (rich alpine sod, vibrant fescue, golden pollen drifts, river silt)
      let r = 38 + moisture * 22 + gravelSilt * 54 - canopyMottle * 8;
      let g = 84 + fieldVar * 24 - gravelSilt * 12 - canopyMottle * 10;
      let b = 34 + moisture * 16 + gravelSilt * 42 - canopyMottle * 6;

      const pathNoise = Math.abs(Math.sin((u * 4 + v * 3 + fbmTile(u * 4, v * 4, 4, 2, seed) * 0.8) * Math.PI));
      if (pathNoise < 0.08) {
        r = r * 0.7 + 130 * 0.3;
        g = g * 0.7 + 122 * 0.3;
        b = b * 0.7 + 104 * 0.3;
      }

      return [clamp255(r), clamp255(g), clamp255(b)];
    });

    const rough = paint(size, (x, y, u, v) => {
      const g = clamp255(195 + fbmTile(u * 18, v * 18, 18, 3, seed + 3) * 45);
      return [g, g, g];
    });

    const ao = paint(size, (x, y) => {
      const g = clamp255(120 + h[y * size + x] * 135);
      return [g, g, g];
    });

    return { map, normal: normalFromHeight(size, h, 2.4), rough, ao };
  },

  /** Scanned Photogrammetry Rock Cliffs with razor fracture normal maps and mineral deposits. */
  photogrammetryRock(size = 512) {
    const seed = 9103;
    const h = heightField(size, (x, y, u, v) => {
      // Natural fractured granite rock face with sharp vertical joint fractures, quartz veins and tectonic strata
      const crags          = fbmTile(u * 6, v * 6, 6, 3, seed) * 0.42;
      const fissures       = Math.pow(Math.abs(fbmTile(u * 16, v * 16, 16, 3, seed + 5) - 0.5) * 2.0, 2.2) * 0.48;
      const vertFractures  = Math.pow(Math.abs(fbmTile(u * 28, v * 7, 28, 3, seed + 19) - 0.5) * 2.0, 3.0) * 0.42;
      const quartzVein     = Math.pow(Math.abs(fbmTile(u * 24, v * 24, 24, 3, seed + 23) - 0.5) * 2.0, 3.5) * 0.28;
      const strata         = Math.sin(v * 32.0 + fbmTile(u * 8, v * 8, 8, 3, seed + 11) * 4.5) * 0.12 + 0.12;
      const microCrag      = fbmTile(u * 80, v * 80, 80, 3, seed + 17) * 0.20;
      const microGrain     = (fbmTile(u * 160, v * 160, 160, 2, seed + 29) - 0.5) * 0.08;
      return crags + fissures + vertFractures + quartzVein + strata + microCrag + microGrain;
    });

    const map = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      // Rich alpine mineral palette: deep charcoal bedrock, weathered granite matrix, crystalline quartz, dark iron oxide stains
      const deepCharcoal   = [26, 25, 24];
      const graniteMatrix  = [82, 78, 72];
      const quartz         = [184, 180, 172];
      const ironOxide      = [142, 94, 46]; // Dark iron oxide mineral stain
      const deepOxideRust  = [96, 52, 28];
      const lichen         = [88, 108, 64];

      const lichenMask    = Math.pow(fbmTile(u * 12, v * 12, 12, 3, seed + 7), 2.8);
      const quartzVein    = Math.pow(Math.abs(fbmTile(u * 24, v * 24, 24, 3, seed + 23) - 0.5) * 2.0, 3.5);
      const oxideMask     = Math.pow(fbmTile(u * 14, v * 14, 14, 3, seed + 31), 2.8);
      const vertOxideSeam = Math.pow(Math.abs(fbmTile(u * 28, v * 7, 28, 3, seed + 19) - 0.5) * 2.0, 3.0);

      let c = [
        deepCharcoal[0] * (1 - hv) + graniteMatrix[0] * hv,
        deepCharcoal[1] * (1 - hv) + graniteMatrix[1] * hv,
        deepCharcoal[2] * (1 - hv) + graniteMatrix[2] * hv,
      ];

      // Overlay crystalline quartz veins
      c = [
        c[0] * (1 - quartzVein) + quartz[0] * quartzVein,
        c[1] * (1 - quartzVein) + quartz[1] * quartzVein,
        c[2] * (1 - quartzVein) + quartz[2] * quartzVein,
      ];

      // Dark iron oxide mineral staining along vertical fractures and seams
      const oxideTotal = Math.min(1.0, oxideMask * 0.55 + vertOxideSeam * 0.45);
      c = [
        c[0] * (1 - oxideTotal) + (ironOxide[0] * 0.7 + deepOxideRust[0] * 0.3) * oxideTotal,
        c[1] * (1 - oxideTotal) + (ironOxide[1] * 0.7 + deepOxideRust[1] * 0.3) * oxideTotal,
        c[2] * (1 - oxideTotal) + (ironOxide[2] * 0.7 + deepOxideRust[2] * 0.3) * oxideTotal,
      ];

      // Sheltered crustose alpine lichen in micro-hollows
      c = [
        c[0] * (1 - lichenMask) + lichen[0] * lichenMask,
        c[1] * (1 - lichenMask) + lichen[1] * lichenMask,
        c[2] * (1 - lichenMask) + lichen[2] * lichenMask,
      ];
      return [clamp255(c[0]), clamp255(c[1]), clamp255(c[2])];
    });

    const rough = paint(size, (x, y, u, v) => {
      const quartzVein = Math.pow(Math.abs(fbmTile(u * 24, v * 24, 24, 3, seed + 23) - 0.5) * 2.0, 3.5);
      const baseRough = 198 + fbmTile(u * 28, v * 28, 28, 3, seed + 5) * 40;
      // Crystalline quartz veins reflect tight specular sheen (~0.22)
      const g = clamp255(baseRough * (1 - quartzVein * 0.72) + 56 * quartzVein);
      return [g, g, g];
    });

    const ao = paint(size, (x, y) => {
      const g = clamp255(35 + h[y * size + x] * 220);
      return [g, g, g];
    });

    return { map, normal: normalFromHeight(size, h, 5.2), rough, ao };
  },

  /** Dalian Fine-Art Weathered Travertine & Ancient Carved Roman Limestone */
  weatheredTravertine(size = 256) {
    const seed = 9182;
    const h = heightField(size, (x, y, u, v) => {
      // Natural honed limestone / travertine with subtle porous weathering
      const stoneGrain = fbmTile(u * 12, v * 12, 12, 3, seed) * 0.45;
      const fissures = Math.pow(Math.abs(fbmTile(u * 18, v * 18, 18, 3, seed + 3) - 0.5) * 2.0, 3.0) * 0.35;
      const pores = Math.pow(fbmTile(u * 48, v * 48, 48, 2, seed + 8), 2.5) * 0.20;
      return clamp01(0.4 + stoneGrain - fissures + pores);
    });

    const map = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      const creamPatina = [218, 206, 188];
      const warmOchre   = [188, 172, 148];
      const deepFissure = [132, 118, 98];

      const vein = fbmTile(u * 8, v * 8, 8, 3, seed + 14);
      let r = creamPatina[0] * (1 - vein) + warmOchre[0] * vein;
      let g = creamPatina[1] * (1 - vein) + warmOchre[1] * vein;
      let b = creamPatina[2] * (1 - vein) + warmOchre[2] * vein;

      // Darken inside pore crevices
      const crevice = Math.pow(1.0 - hv, 2.0);
      r = r * (1 - crevice * 0.4) + deepFissure[0] * (crevice * 0.4);
      g = g * (1 - crevice * 0.4) + deepFissure[1] * (crevice * 0.4);
      b = b * (1 - crevice * 0.4) + deepFissure[2] * (crevice * 0.4);

      return [clamp255(r), clamp255(g), clamp255(b)];
    });

    const rough = paint(size, (x, y, u, v) => {
      const g = clamp255(190 + fbmTile(u * 28, v * 28, 28, 3, seed + 9) * 55);
      return [g, g, g];
    });

    const ao = paint(size, (x, y) => {
      const g = clamp255(140 + h[y * size + x] * 115);
      return [g, g, g];
    });

    return { map, normal: normalFromHeight(size, h, 1.4), rough, ao };
  },

  /** Authentic French High Gothic Rose Window Stained Glass Mandala (Notre-Dame / Sainte-Chapelle / Chartres) */
  stainedGlassRose(size = 1024) {
    const seed = 5412;
    const PI = Math.PI;

    // Outer ring jewel spectrum: Cobalt Sapphire (#0a2884), Flashed Ruby (#9c0e28), Golden Amber (#d48a14), Imperial Amethyst (#6b1d7d), Forest Emerald (#0d6b38)
    const outerJewelPalette = [
      [10, 40, 132],   // Cobalt Sapphire (#0a2884)
      [156, 14, 40],   // Sainte-Chapelle / Flashed Ruby (#9c0e28)
      [212, 138, 20],  // Golden Amber (#d48a14)
      [107, 29, 125],  // Imperial Amethyst (#6b1d7d)
      [13, 107, 56],   // Forest Emerald (#0d6b38)
      [10, 40, 132],   // Cobalt Sapphire
      [156, 14, 40],   // Flashed Ruby
      [212, 138, 20],  // Golden Amber
    ];

    // Evaluate lead structure and junction solder nodes
    function evalGothicCame(dx, dy, r, ang) {
      if (r > 1.0) return { isLead: false, isSolder: false, dist_med16: 999.0 };

      // Concentric structural iron came rings
      const ring0 = Math.abs(r - 0.075) < 0.010;
      const ring1 = Math.abs(r - 0.190) < 0.012;
      const ring2 = Math.abs(r - 0.240) < 0.010;
      const ring3 = Math.abs(r - 0.490) < 0.014;
      const ring4 = Math.abs(r - 0.540) < 0.010;
      const ring5 = Math.abs(r - 0.810) < 0.012;
      const ring6 = Math.abs(r - 0.940) < 0.014;
      const ring7 = Math.abs(r - 0.985) < 0.016;

      // Radial iron came spokes
      const spoke8 = r > 0.075 && Math.abs(Math.sin(ang * 4)) * r < 0.012;
      const spoke16 = r > 0.190 && Math.abs(Math.sin(ang * 8)) * r < 0.011;
      const spoke32 = r > 0.540 && Math.abs(Math.sin(ang * 16)) * r < 0.010;
      const spoke64 = r > 0.810 && Math.abs(Math.sin(ang * 32)) * r < 0.009;

      // Central 8-petal rosette cusps
      const petal8 = (r >= 0.075 && r <= 0.190) && Math.abs(r - (0.132 + 0.052 * Math.cos(ang * 8))) < 0.010;

      // Middle 16 Quatrefoil Medallions
      const theta_near16 = Math.round((ang / (PI / 8)) - 0.5) * (PI / 8) + (PI / 16);
      const mx16 = 0.365 * Math.cos(theta_near16), my16 = 0.365 * Math.sin(theta_near16);
      const dist_med16 = Math.hypot(dx - mx16, dy - my16);
      const medRing16 = (r >= 0.240 && r <= 0.490) && Math.abs(dist_med16 - 0.118) < 0.010;
      const medAng16 = Math.atan2(dy - my16, dx - mx16);
      const medQuatrefoil16 = (dist_med16 < 0.118) && Math.abs(dist_med16 - (0.068 + 0.036 * Math.cos(medAng16 * 4))) < 0.009;

      // Outer 32 Pointed Gothic Lancet Arches & Cusps
      const phi_near32 = Math.round((ang / (PI / 16)) - 0.5) * (PI / 16) + (PI / 32);
      const dphi32 = ang - phi_near32;
      const arch_r32 = 0.935 - Math.pow(Math.abs(dphi32) / (PI / 32), 1.5) * 0.125;
      const lancetArch32 = (r >= 0.76 && r <= 0.945) && Math.abs(r - arch_r32) < 0.011;

      // Raised solder nodes at structural intersections
      let isSolder = false;
      const junctionRings = [0.075, 0.190, 0.240, 0.490, 0.540, 0.810, 0.940];
      for (let j = 0; j < junctionRings.length; j++) {
        const jr = junctionRings[j];
        const jcount = jr < 0.2 ? 8 : (jr < 0.5 ? 16 : 32);
        const j_ang = Math.round(ang / (2 * PI / jcount)) * (2 * PI / jcount);
        const jx = jr * Math.cos(j_ang), jy = jr * Math.sin(j_ang);
        if (Math.hypot(dx - jx, dy - jy) < 0.016) {
          isSolder = true;
          break;
        }
      }

      const isLead = (ring0 || ring1 || ring2 || ring3 || ring4 || ring5 || ring6 || ring7 ||
                      spoke8 || spoke16 || spoke32 || spoke64 ||
                      petal8 || medRing16 || medQuatrefoil16 || lancetArch32 || isSolder);

      return { isLead, isSolder, dist_med16 };
    }

    const h = heightField(size, (x, y, u, v) => {
      const dx = (u - 0.5) * 2.0, dy = (v - 0.5) * 2.0;
      const r = Math.hypot(dx, dy);
      if (r > 1.0) return 0.0;
      const ang = Math.atan2(dy, dx);
      const came = evalGothicCame(dx, dy, r, ang);

      if (came.isLead) {
        return came.isSolder ? 0.98 : 0.94; // Raised 3D lead came contours & solder bead nodes
      }

      // Pot-metal glass micro-texture: thickness ripples & seeds
      const ripple = fbmTile(u * 32, v * 32, 32, 3, seed) * 0.12;
      const seedHash = hash2(Math.floor(u * 180), Math.floor(v * 180), seed + 555);
      let seedDepression = 0;
      if (seedHash > 0.988) {
        const bx = (u * 180) % 1.0 - 0.5, by = (v * 180) % 1.0 - 0.5;
        const bDist = Math.hypot(bx, by);
        if (bDist < 0.35) {
          seedDepression = (1.0 - bDist / 0.35) * 0.05;
        }
      }

      return 0.22 + ripple - seedDepression;
    });

    const map = paintRGBA(size, (x, y, u, v) => {
      const dx = (u - 0.5) * 2.0, dy = (v - 0.5) * 2.0;
      const r = Math.hypot(dx, dy);
      if (r > 1.0) return [0, 0, 0, 0];
      const ang = Math.atan2(dy, dx);
      const came = evalGothicCame(dx, dy, r, ang);

      if (came.isLead) {
        return [18, 18, 22, 255]; // Authentic dark iron lead cames with solder nodes
      }

      const sec16 = Math.floor(((ang + PI) / (2 * PI)) * 16) % 16;
      const sec32 = Math.floor(((ang + PI) / (2 * PI)) * 32) % 32;
      let col;

      if (r < 0.075) {
        // Central Golden Dove / Christ halo core
        const coreFalloff = r / 0.075;
        col = [
          clamp255(255 * (1 - coreFalloff) + 212 * coreFalloff),
          clamp255(230 * (1 - coreFalloff) + 138 * coreFalloff),
          clamp255(140 * (1 - coreFalloff) + 20 * coreFalloff),
          255
        ];
      } else if (r < 0.190) {
        // Central 8-petal golden Christ/Dove medallion (#d48a14)
        col = [212, 138, 20, 255];
      } else if (r < 0.240) {
        // Intermediate amethyst & ruby border
        col = (sec16 % 2 === 0) ? [107, 29, 125, 255] : [156, 14, 40, 255];
      } else if (r < 0.490) {
        // Middle ring of 16 alternating Chartres Cobalt Sapphire (#0a2884) and Sainte-Chapelle Ruby (#9c0e28)
        if (came.dist_med16 < 0.118) {
          col = (sec16 % 2 === 0) ? [10, 40, 132, 255] : [156, 14, 40, 255];
          if (came.dist_med16 < 0.045) {
            // Central jewel in medallion
            col = (sec16 % 2 === 0) ? [212, 138, 20, 255] : [10, 40, 132, 255];
          }
        } else {
          // Medallion spandrels
          col = (sec16 % 2 === 0) ? [156, 14, 40, 255] : [10, 40, 132, 255];
        }
      } else if (r < 0.540) {
        // Intermediate golden band
        col = (sec32 % 2 === 0) ? [212, 138, 20, 255] : [10, 40, 132, 255];
      } else {
        // Outer ring of 32 lancet sub-petals in jewel tones (Cobalt Sapphire, Flashed Ruby, Golden Amber, Imperial Amethyst, Forest Emerald)
        const jCol = outerJewelPalette[sec32 % outerJewelPalette.length];
        col = [jCol[0], jCol[1], jCol[2], 255];
      }

      // Pot-metal micro-texture: thickness ripples, air bubbles/seeds, and waxy polish
      const ripple = fbmTile(u * 32, v * 32, 32, 3, seed) - 0.5;
      const seedHash = hash2(Math.floor(u * 180), Math.floor(v * 180), seed + 555);
      let seedSparkle = 0;
      if (seedHash > 0.988) {
        const bx = (u * 180) % 1.0 - 0.5, by = (v * 180) % 1.0 - 0.5;
        const bDist = Math.hypot(bx, by);
        if (bDist < 0.35) {
          seedSparkle = (1.0 - bDist / 0.35) * 0.25;
        }
      }

      const mod = 0.88 + ripple * 0.24 + seedSparkle;
      return [
        clamp255(col[0] * mod),
        clamp255(col[1] * mod),
        clamp255(col[2] * mod),
        255
      ];
    });

    const rough = paint(size, (x, y, u, v) => {
      const dx = (u - 0.5) * 2.0, dy = (v - 0.5) * 2.0;
      const r = Math.hypot(dx, dy);
      if (r > 1.0) return [24, 24, 24];
      const came = evalGothicCame(dx, dy, r, Math.atan2(dy, dx));
      if (came.isLead) return [175, 175, 175]; // Lead metal came roughness
      const ripple = fbmTile(u * 32, v * 32, 32, 2, seed + 1);
      const glassRough = clamp255(18 + ripple * 10); // Waxy smooth glass polish
      return [glassRough, glassRough, glassRough];
    });

    const ao = paint(size, (x, y, u, v) => {
      const dx = (u - 0.5) * 2.0, dy = (v - 0.5) * 2.0;
      const r = Math.hypot(dx, dy);
      if (r > 1.0) return [255, 255, 255];
      const came = evalGothicCame(dx, dy, r, Math.atan2(dy, dx));
      const g = came.isLead ? 135 : 240;
      return [g, g, g];
    });

    return { map, normal: normalFromHeight(size, h, 2.8), rough, ao };
  },

  /** Michelangelo Sistine Chapel Style Celestial Fresco Murals & Gilded Constellation Ribs */
  sistineVaultFresco(size = 256) {
    const seed = 3819;
    const h = heightField(size, (x, y, u, v) => {
      const cofferX = Math.abs(Math.sin(u * Math.PI * 6));
      const cofferY = Math.abs(Math.sin(v * Math.PI * 3));
      return (cofferX < 0.08 || cofferY < 0.12) ? 0.95 : 0.3;
    });

    const map = paint(size, (x, y, u, v) => {
      const cofferX = Math.abs(Math.sin(u * Math.PI * 6));
      const cofferY = Math.abs(Math.sin(v * Math.PI * 3));
      const isRib = (cofferX < 0.08 || cofferY < 0.12);

      if (isRib) {
        const goldLeaf = [218, 178, 64];
        const gVein = fbmTile(u * 12, v * 12, 12, 3, seed);
        return tint(goldLeaf, 0.85 + gVein * 0.3);
      }

      const cloud = fbmTile(u * 8, v * 8, 8, 3, seed + 1);
      const deepLapis = [16, 36, 84];
      const astralAzure = [48, 92, 168];
      const divineGold = [240, 206, 124];

      let r = deepLapis[0] * (1 - cloud) + astralAzure[0] * cloud;
      let g = deepLapis[1] * (1 - cloud) + astralAzure[1] * cloud;
      let b = deepLapis[2] * (1 - cloud) + astralAzure[2] * cloud;
      const panelU = ((u * 6) % 1.0) - 0.5;
      const panelV = ((v * 3) % 1.0) - 0.5;
      const distToCenter = Math.hypot(panelU * 2, panelV * 2);
      if (distToCenter < 0.65) {
        const star = Math.pow(1.0 - distToCenter / 0.65, 2.5);
        r = r * (1 - star) + divineGold[0] * star;
        g = g * (1 - star) + divineGold[1] * star;
        b = b * (1 - star) + divineGold[2] * star;
      }

      return [clamp255(r), clamp255(g), clamp255(b)];
    });

    const rough = paint(size, (x, y, u, v) => {
      const g = clamp255(140 + fbmTile(u * 16, v * 16, 16, 2, seed) * 45);
      return [g, g, g];
    });

    return { map, normal: normalFromHeight(size, h, 1.8), rough };
  },

  /** High-Definition Mediterranean Cypress Foliage Sprig (Dark Columnar Evergreen) */
  cypressFoliage(size = 256) {
    const seed = 941;
    const h = heightField(size, (x, y, u, v) => {
      const dx = Math.abs(u - 0.5);
      const inScale = dx < (0.35 * (1 - v * 0.4));
      const fan = Math.sin((v * 72 + dx * 48 + fbmTile(u * 8, v * 8, 8, 3, seed) * 6) * Math.PI);
      return inScale ? Math.abs(fan) * (1 - dx / 0.35) : 0;
    });

    const map = paintRGBA(size, (x, y, u, v) => {
      const dx = Math.abs(u - 0.5);
      const maxW = 0.36 * (1.1 - v * 0.45);
      if (dx > maxW) return [0, 0, 0, 0];

      const micro = fbmTile(u * 24, v * 24, 24, 3, seed);
      const deepCypress = [28, 56, 26];
      const sunlitCypress = [52, 94, 42];
      const tipGold = [84, 136, 56];

      let c = [
        deepCypress[0] * (1 - micro) + sunlitCypress[0] * micro,
        deepCypress[1] * (1 - micro) + sunlitCypress[1] * micro,
        deepCypress[2] * (1 - micro) + sunlitCypress[2] * micro,
      ];
      if (v < 0.15) c = [c[0] * 0.6 + tipGold[0] * 0.4, c[1] * 0.6 + tipGold[1] * 0.4, c[2] * 0.6 + tipGold[2] * 0.4];

      const alpha = Math.min(1.0, (maxW - dx) / 0.025);
      return [clamp255(c[0]), clamp255(c[1]), clamp255(c[2]), Math.round(alpha * 255)];
    });

    const rough = paint(size, () => [210, 210, 210]);
    return { map, normal: normalFromHeight(size, h, 1.6), rough };
  },

  /** Jerusalem Golden Limestone Masonry */
  jerusalemStone(size = 256) {
    const seed = 6382;
    const h = heightField(size, (x, y, u, v) => {
      const bx = Math.abs(Math.sin(u * Math.PI * 8));
      const by = Math.abs(Math.sin(v * Math.PI * 14));
      const joint = (bx < 0.06 || by < 0.08) ? 0.0 : 0.85;
      const chisel = fbmTile(u * 18, v * 18, 18, 3, seed) * 0.25;
      return clamp01(joint + chisel);
    });
    const map = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      const stoneGold = [142, 126, 98];
      const ochreWarm = [124, 108, 82];
      const mortarDark = [62, 54, 42];
      const grain = fbmTile(u * 12, v * 12, 12, 3, seed + 5);
      let c = [stoneGold[0] * (1 - grain) + ochreWarm[0] * grain, stoneGold[1] * (1 - grain) + ochreWarm[1] * grain, stoneGold[2] * (1 - grain) + ochreWarm[2] * grain];
      if (hv < 0.3) c = mortarDark;
      return [clamp255(c[0]), clamp255(c[1]), clamp255(c[2])];
    });
    const rough = paint(size, () => [210, 210, 210]);
    return { map, normal: normalFromHeight(size, h, 2.6), rough };
  },

  /** Moorish Alhambra Zellij Mosaic Star Tile — Authentic 8-pointed / 16-pointed Alicatado Geometric Tessellation */
  moorishZellij(size = 512) {
    const seed = 4120;
    // Moroccan 8-pointed star & rosette geometry
    const zellijGeometry = (u, v) => {
      const cu = (u * 2) % 1;
      const cv = (v * 2) % 1;
      const dx = cu - 0.5;
      const dy = cv - 0.5;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);

      // 8-fold radial symmetry
      const a8 = Math.abs((((angle + Math.PI / 8) % (Math.PI / 4)) + Math.PI / 4) % (Math.PI / 4) - Math.PI / 8);
      const starR = 0.28 / Math.cos(a8);
      const isCentralStar = dist < starR;

      // 8 diamond petals radiating from central star
      const a8_offset = Math.abs(((angle % (Math.PI / 4)) + Math.PI / 4) % (Math.PI / 4) - Math.PI / 8);
      const isPetal = !isCentralStar && dist < 0.42 && a8_offset < 0.22;

      // Interlocking knot ribbons
      const isKnotRibbon = !isCentralStar && !isPetal && (dist < 0.52 || Math.abs(dx) > 0.42 || Math.abs(dy) > 0.42);

      // Corner stars
      const cornerDx = Math.min(cu, 1 - cu);
      const cornerDy = Math.min(cv, 1 - cv);
      const cornerDist = Math.hypot(cornerDx, cornerDy);
      const isCorner = cornerDist < 0.18;

      // Mortar joint edge distance
      const jointDist = Math.min(Math.abs(dist - starR), Math.abs(dist - 0.42), Math.abs(dist - 0.52), cornerDist - 0.18);
      const isMortar = Math.abs(jointDist) < 0.012;

      let zone = 0; // 0: terracotta border, 1: center star (turquoise), 2: saffron gold petal, 3: cobalt lapis knot, 4: emerald corner, 5: mortar
      if (isMortar) zone = 5;
      else if (isCentralStar) zone = 1;
      else if (isPetal) zone = 2;
      else if (isCorner) zone = 4;
      else if (isKnotRibbon) zone = 3;

      return { zone, dist, isMortar, dx, dy };
    };

    const h = heightField(size, (x, y, u, v) => {
      const z = zellijGeometry(u, v);
      const microBevel = z.isMortar ? 0.22 : 0.78 + 0.14 * (1.0 - z.dist);
      const ceramicWobble = (fbmTile(u * 18, v * 18, 18, 2, seed) - 0.5) * 0.06;
      const crackle = Math.pow(Math.abs(fbmTile(u * 48, v * 48, 48, 2, seed + 9) - 0.5) * 2, 4.0) * 0.08;
      return clamp01(microBevel + ceramicWobble - crackle);
    });

    const map = paint(size, (x, y, u, v) => {
      const z = zellijGeometry(u, v);
      const hv = h[y * size + x];
      const grit = (fbmTile(u * 32, v * 32, 32, 2, seed + 1) - 0.5) * 0.12;

      const turquoise = [22, 168, 192];
      const saffronGold = [238, 178, 42];
      const royalLapis = [26, 68, 164];
      const emeraldGreen = [24, 138, 76];
      const terracotta = [184, 76, 44];
      const mortarIvory = [228, 222, 210];

      let baseCol;
      if (z.zone === 1) baseCol = turquoise;
      else if (z.zone === 2) baseCol = saffronGold;
      else if (z.zone === 3) baseCol = royalLapis;
      else if (z.zone === 4) baseCol = emeraldGreen;
      else if (z.zone === 5) baseCol = mortarIvory;
      else baseCol = terracotta;

      let r = baseCol[0] * (0.92 + grit + (hv - 0.5) * 0.2);
      let g = baseCol[1] * (0.92 + grit + (hv - 0.5) * 0.2);
      let b = baseCol[2] * (0.92 + grit + (hv - 0.5) * 0.2);
      return [clamp255(r), clamp255(g), clamp255(b)];
    });

    const rough = paint(size, (x, y, u, v) => {
      const z = zellijGeometry(u, v);
      const glaze = z.zone === 5 ? 210 : 38 + fbmTile(u * 24, v * 24, 24, 2, seed + 5) * 25;
      return [glaze, glaze, glaze];
    });

    const ao = paint(size, (x, y, u, v) => {
      const z = zellijGeometry(u, v);
      const g = clamp255(z.zone === 5 ? 85 : 170 + h[y * size + x] * 80);
      return [g, g, g];
    });

    return { map, normal: normalFromHeight(size, h, 2.2), rough, ao };
  },

  /** Japanese Flared Ceramic Hongawara Pagoda Roof Tile — Dark Kawara Slate with Corrugated Ridges & Step Overlaps */
  pagodaTile(size = 512) {
    const seed = 7712;
    const cols = 8;
    const rows = 12;

    const tileCoord = (u, v) => {
      const colX = (u * cols) % 1;
      const rowY = (v * rows) % 1;
      const barrelProfile = Math.sin(colX * Math.PI);
      const stepLap = Math.pow(1.0 - rowY, 0.45);
      return { colX, rowY, barrelProfile, stepLap };
    };

    const h = heightField(size, (x, y, u, v) => {
      const tc = tileCoord(u, v);
      const ridgeH = Math.pow(tc.barrelProfile, 2.2) * 0.55;
      const panH = Math.pow(Math.abs(tc.colX - 0.5) * 2.0, 1.6) * 0.18;
      const stepRelief = tc.stepLap * 0.32;
      const slateGrain = (fbmTile(u * 28, v * 90, 90, 2, seed) - 0.5) * 0.08;
      const chiselGrit = (fbmTile(u * 64, v * 64, 64, 2, seed + 3) - 0.5) * 0.05;
      return clamp01(0.25 + ridgeH + panH + stepRelief + slateGrain + chiselGrit);
    });

    const map = paint(size, (x, y, u, v) => {
      const tc = tileCoord(u, v);
      const hv = h[y * size + x];
      const darkCharcoal = [36, 40, 44];
      const slateGrey = [62, 68, 76];
      const agedMoss = [68, 82, 58];

      const mossPatina = Math.pow(fbmTile(u * 12, v * 12, 12, 2, seed + 7), 3.2) * (1.0 - tc.barrelProfile);
      const slateMineral = fbmTile(u * 36, v * 80, 80, 2, seed + 1);

      let r = darkCharcoal[0] * (1 - slateMineral * 0.4) + slateGrey[0] * (slateMineral * 0.4);
      let g = darkCharcoal[1] * (1 - slateMineral * 0.4) + slateGrey[1] * (slateMineral * 0.4);
      let b = darkCharcoal[2] * (1 - slateMineral * 0.4) + slateGrey[2] * (slateMineral * 0.4);

      r = r * (1 - mossPatina) + agedMoss[0] * mossPatina;
      g = g * (1 - mossPatina) + agedMoss[1] * mossPatina;
      b = b * (1 - mossPatina) + agedMoss[2] * mossPatina;

      const light = 0.82 + hv * 0.35;
      return [clamp255(r * light), clamp255(g * light), clamp255(b * light)];
    });

    const rough = paint(size, (x, y, u, v) => {
      const tc = tileCoord(u, v);
      const g = clamp255(110 - tc.barrelProfile * 45 + fbmTile(u * 20, v * 20, 20, 2, seed + 4) * 35);
      return [g, g, g];
    });

    const ao = paint(size, (x, y, u, v) => {
      const tc = tileCoord(u, v);
      const jointShadow = Math.min(tc.rowY / 0.12, 1.0);
      const g = clamp255(80 + jointShadow * 120 + h[y * size + x] * 55);
      return [g, g, g];
    });

    return { map, normal: normalFromHeight(size, h, 3.2), rough, ao };
  },

  /** Hollywood Crystalline Glacial Ice with Turquoise Subsurface Veins */
  glacialIce(size = 512) {
    const seed = 1904;
    const h = heightField(size, (x, y, u, v) => {
      const f1 = fbmTile(u * 6, v * 6, 6, 3, seed);
      const f2 = Math.abs(fbmTile(u * 18, v * 18, 18, 3, seed + 1) - 0.5) * 2.0;
      return f1 * 0.7 + (1.0 - f2) * 0.3;
    });
    const map = paint(size, (x, y, u, v) => {
      const deepIce = [16, 78, 120];
      const cyanVein = [58, 176, 218];
      const frostRim = [210, 242, 255];
      const n = fbmTile(u * 12, v * 12, 12, 3, seed);
      const fissure = Math.pow(Math.abs(fbmTile(u * 20, v * 20, 20, 2, seed + 2) - 0.5) * 2.0, 4.0);
      let c = [deepIce[0] * (1 - n) + cyanVein[0] * n, deepIce[1] * (1 - n) + cyanVein[1] * n, deepIce[2] * (1 - n) + cyanVein[2] * n];
      if (fissure > 0.4) c = tint(frostRim, 0.95);
      return [clamp255(c[0]), clamp255(c[1]), clamp255(c[2])];
    });
    const rough = paint(size, () => [24, 24, 24]);
    return { map, normal: normalFromHeight(size, h, 3.2), rough };
  },

  /** Windblown Alpine Snow Drift with Sparkling Specular Glints */
  alpineSnowDrift(size = 512) {
    const seed = 8402;
    const h = heightField(size, (x, y, u, v) => {
      const drift = Math.sin((u * 14 + v * 8 + fbmTile(u * 4, v * 4, 4, 3, seed) * 4) * Math.PI) * 0.5 + 0.5;
      const sastrugi = Math.pow(Math.sin((u * 28 - v * 16 + fbmTile(u * 8, v * 8, 8, 3, seed + 5) * 3) * Math.PI) * 0.5 + 0.5, 2.0) * 0.45;
      const grain = fbmTile(u * 64, v * 64, 64, 3, seed + 1) * 0.15;
      return drift * 0.55 + sastrugi + grain;
    });
    const map = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      // Pristine Alpine Firn Snow Palette: sunlit pure white crystal crests, ice-blue subsurface hollows, delicate shadow drifts
      const sunlitSnow = [255, 255, 255];
      const shadowSnow = [120, 168, 204];
      const microGlint = Math.pow(fbmTile(u * 96, v * 96, 96, 2, seed + 12), 4) * 0.25;
      
      let c = [
        shadowSnow[0] * (1 - hv) + sunlitSnow[0] * hv + microGlint * 40,
        shadowSnow[1] * (1 - hv) + sunlitSnow[1] * hv + microGlint * 40,
        shadowSnow[2] * (1 - hv) + sunlitSnow[2] * hv + microGlint * 40,
      ];
      return [clamp255(c[0]), clamp255(c[1]), clamp255(c[2])];
    });
    const rough = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      // Wind-packed crust has satin sheen (~0.45-0.65), loose snow is softer (~0.75)
      const g = clamp255(115 + (1.0 - hv) * 80 + fbmTile(u * 32, v * 32, 32, 2, seed) * 45);
      return [g, g, g];
    });
    const ao = paint(size, (x, y) => {
      const g = clamp255(120 + h[y * size + x] * 135);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 2.2), rough, ao };
  },

  /** Stratified Dark Basalt & Granite Cliff Fissures */
  stratifiedBasalt(size = 512) {
    const seed = 5519;
    const h = heightField(size, (x, y, u, v) => {
      const strata = Math.sin((v * 36 + fbmTile(u * 6, v * 6, 6, 3, seed) * 8) * Math.PI) * 0.5 + 0.5;
      const crag = fbmTile(u * 16, v * 16, 16, 3, seed + 1);
      return strata * 0.55 + crag * 0.45;
    });
    const map = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      const darkBasalt = [32, 34, 38];
      const ironOxide = [68, 54, 46];
      const slate = [56, 62, 68];
      const oMask = Math.pow(fbmTile(u * 12, v * 12, 12, 2, seed + 2), 2.5);
      let c = [darkBasalt[0] * (1 - oMask) + ironOxide[0] * oMask, darkBasalt[1] * (1 - oMask) + ironOxide[1] * oMask, darkBasalt[2] * (1 - oMask) + ironOxide[2] * oMask];
      c = [c[0] * (1 - hv * 0.3) + slate[0] * (hv * 0.3), c[1] * (1 - hv * 0.3) + slate[1] * (hv * 0.3), c[2] * (1 - hv * 0.3) + slate[2] * (hv * 0.3)];
      return [clamp255(c[0]), clamp255(c[1]), clamp255(c[2])];
    });
    const rough = paint(size, () => [210, 210, 210]);
    return { map, normal: normalFromHeight(size, h, 3.4), rough };
  },

  /** Honed Carrara Marble with Multi-Scale Veining, Calcite Crystals & Crevice AO */
  honedCarraraMarble(size = 512) {
    const seed = 31415;
    const seam = (u, v, freq, ang, warpAmt, sharp, s) => {
      const warp = fbmTile(u * freq * 0.6, v * freq * 0.6, Math.max(2, Math.round(freq * 0.6)), 3, s) * warpAmt;
      const t = Math.sin((u * freq * Math.cos(ang) + v * freq * Math.sin(ang) + warp) * Math.PI);
      return Math.pow(1.0 - Math.abs(t), sharp);
    };
    const veinField = (u, v) => {
      const broad = seam(u, v, 1.8, 0.55, 2.8, 3.2, seed);
      const mid = seam(u, v, 4.8, 1.15, 2.2, 4.0, seed + 41) * (0.4 + broad * 0.85);
      const fine = seam(u, v, 12.0, 0.35, 1.5, 4.5, seed + 83) * (0.2 + broad * 0.7);
      const micro = seam(u, v, 26.0, 0.85, 1.0, 4.5, seed + 107) * (0.1 + broad * 0.5);
      return Math.min(1.0, broad * 0.5 + mid * 0.65 + fine * 0.45 + micro * 0.3);
    };
    const h = heightField(size, (x, y, u, v) => {
      const microCrystals = fbmTile(u * 120, v * 120, 120, 2, seed + 9) * 0.05;
      const grainRelief = (fbmTile(u * 200, v * 200, 200, 2, seed + 17) - 0.5) * 0.02;
      return 0.5 + veinField(u, v) * 0.12 + fbmTile(u * 32, v * 32, 32, 2, seed + 3) * 0.04 + microCrystals + grainRelief;
    });
    const map = paint(size, (x, y, u, v) => {
      const vein = veinField(u, v);
      const warmth = fbmTile(u * 2.2, v * 2.2, 2, 3, seed + 63);
      const sparkle = Math.pow(fbmTile(u * 140, v * 140, 140, 2, seed + 15), 4) * 0.15;
      const base = [248, 246, 240];
      const veinColor = [114, 118, 126];
      let r = base[0] * (1 - vein * 0.65) + veinColor[0] * (vein * 0.65) + (warmth - 0.5) * 12 + sparkle * 25;
      let g = base[1] * (1 - vein * 0.65) + veinColor[1] * (vein * 0.65) + (warmth - 0.5) * 10 + sparkle * 25;
      let b = base[2] * (1 - vein * 0.65) + veinColor[2] * (vein * 0.65) - (warmth - 0.5) * 6 + sparkle * 25;
      return [clamp255(r), clamp255(g), clamp255(b)];
    });
    const rough = paint(size, (x, y, u, v) => {
      const vein = veinField(u, v);
      const microRough = fbmTile(u * 80, v * 80, 80, 2, seed + 27) * 22;
      const g = clamp255(38 + vein * 45 + microRough);
      return [g, g, g];
    });
    const ao = paint(size, (x, y, u, v) => {
      const vf = veinField(u, v);
      const g = clamp255(205 + (1.0 - vf * 0.5) * 50 + (h[y * size + x] - 0.5) * 35);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 1.35), rough, ao };
  },

  /** Aged Caen Limestone Ashlar — French High Gothic Masonry with Fossil Inclusions & Baked Crevice AO */
  agedCaenLimestone(size = 512) {
    const rows = 3, cols = 2, seed = 5171;
    const mortar = (u, v) => {
      const ry = v * rows;
      const row = Math.floor(ry);
      const fy = ry - row;
      const offset = row % 2 ? 0.5 : 0;
      const rx = (u * cols + offset) % 1;
      const dy = Math.min(fy, 1 - fy) / rows;
      const dx = Math.min(rx, 1 - rx) / cols;
      return Math.min(dx, dy);
    };
    const h = heightField(size, (x, y, u, v) => {
      const joint = mortar(u, v);
      const jointDepth = 0.88 + 0.12 * smooth(Math.min(1.0, joint / 0.008));
      const grain = fbmTile(u * 12, v * 12, 12, 3, seed) * 0.18;
      const pits = Math.pow(fbmTile(u * 28, v * 28, 28, 2, seed + 5), 4.5) * 0.15;
      const chisel = (fbmTile(u * 80, v * 20, 80, 2, seed + 11) - 0.5) * 0.06;
      return jointDepth * (0.82 + grain + chisel) - pits;
    });
    const map = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      const grain = fbmTile(u * 14, v * 14, 14, 3, seed + 2);
      const warmCaen = [238, 228, 208];
      const mortarColor = [205, 195, 178];
      let r = warmCaen[0] * (0.85 + hv * 0.15 + grain * 0.05);
      let g = warmCaen[1] * (0.85 + hv * 0.15 + grain * 0.05);
      let b = warmCaen[2] * (0.85 + hv * 0.15 + grain * 0.05);
      if (hv < 0.88) {
        const k = (0.88 - hv) / 0.15;
        const clampedK = Math.min(1.0, Math.max(0.0, k));
        r = r * (1 - clampedK) + mortarColor[0] * clampedK;
        g = g * (1 - clampedK) + mortarColor[1] * clampedK;
        b = b * (1 - clampedK) + mortarColor[2] * clampedK;
      }
      return [clamp255(r), clamp255(g), clamp255(b)];
    });
    const rough = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      const g = clamp255(185 - hv * 20 + fbmTile(u * 24, v * 24, 24, 2, seed + 3) * 25);
      return [g, g, g];
    });
    const ao = paint(size, (x, y) => {
      const joint = mortar(x / size, y / size);
      const jointAO = smooth(Math.min(1.0, joint / 0.012));
      const g = clamp255(140 + jointAO * 80 + h[y * size + x] * 35);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 1.4), rough, ao };
  },

  /** 24K Celestial Gold with Micro-Polish Swirl Normals, Mirror-Satin Sheen & Baked AO */
  celestialGold24K(size = 256) {
    const seed = 9241;
    const h = heightField(size, (x, y, u, v) => {
      const polish1 = Math.sin((u * 40 + v * 20 + fbmTile(u * 12, v * 12, 12, 2, seed) * 4) * Math.PI) * 0.12;
      const polish2 = (fbmTile(u * 80, v * 80, 80, 2, seed + 3) - 0.5) * 0.14;
      return 0.5 + polish1 + polish2;
    });
    const map = paint(size, (x, y, u, v) => {
      const luster = fbmTile(u * 16, v * 16, 16, 2, seed + 7);
      const baseGold = [252, 224, 98];
      let r = baseGold[0] * (0.88 + luster * 0.18);
      let g = baseGold[1] * (0.88 + luster * 0.18);
      let b = baseGold[2] * (0.82 + luster * 0.22);
      return [clamp255(r), clamp255(g), clamp255(b)];
    });
    const rough = paint(size, (x, y, u, v) => {
      const g = clamp255(35 + fbmTile(u * 28, v * 28, 28, 2, seed + 1) * 30);
      return [g, g, g];
    });
    const ao = paint(size, (x, y) => {
      const g = clamp255(160 + h[y * size + x] * 95);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 0.75), rough, ao };
  },

  /** Cast Weathered Verdigris Bronze with Natural Turquoise Patina in Crevices & Burnished Highlights */
  weatheredVerdigrisBronze(size = 256) {
    const seed = 4419;
    const h = heightField(size, (x, y, u, v) => {
      const castPits = Math.pow(fbmTile(u * 24, v * 24, 24, 3, seed), 2.2) * 0.45;
      const hammerRelief = fbmTile(u * 8, v * 8, 8, 2, seed + 4) * 0.35;
      return 0.5 + castPits + hammerRelief;
    });
    const map = paint(size, (x, y, u, v) => {
      const patina = Math.pow(fbmTile(u * 7, v * 7, 7, 3, seed + 8), 2.4);
      const burnish = fbmTile(u * 14, v * 14, 14, 2, seed + 12);
      const darkBronze = [68, 52, 38];
      const burnishedGold = [194, 154, 76];
      const verdigrisTurquoise = [52, 168, 148];
      let r = darkBronze[0] * (1 - burnish * 0.5) + burnishedGold[0] * (burnish * 0.5);
      let g = darkBronze[1] * (1 - burnish * 0.5) + burnishedGold[1] * (burnish * 0.5);
      let b = darkBronze[2] * (1 - burnish * 0.5) + burnishedGold[2] * (burnish * 0.5);
      r = r * (1 - patina) + verdigrisTurquoise[0] * patina;
      g = g * (1 - patina) + verdigrisTurquoise[1] * patina;
      b = b * (1 - patina) + verdigrisTurquoise[2] * patina;
      return [clamp255(r), clamp255(g), clamp255(b)];
    });
    const rough = paint(size, (x, y, u, v) => {
      const patina = Math.pow(fbmTile(u * 7, v * 7, 7, 3, seed + 8), 2.4);
      const g = clamp255(60 * (1 - patina) + 210 * patina);
      return [g, g, g];
    });
    const ao = paint(size, (x, y) => {
      const g = clamp255(110 + h[y * size + x] * 145);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 1.8), rough, ao };
  },

  /** Carved Andalusian Stucco Muqarnas Plaster with Fine Sand Grit & Deep Crevice AO */
  stuccoMuqarnas(size = 256) {
    const seed = 6619;
    const h = heightField(size, (x, y, u, v) => {
      const grit = (fbmTile(u * 64, v * 64, 64, 2, seed) - 0.5) * 0.22;
      const relief = fbmTile(u * 14, v * 14, 14, 2, seed + 3) * 0.45;
      return 0.5 + grit + relief;
    });
    const map = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      const warmIvory = [246, 240, 230];
      const agedPlaster = [218, 208, 192];
      const k = hv;
      let r = agedPlaster[0] * (1 - k) + warmIvory[0] * k;
      let g = agedPlaster[1] * (1 - k) + warmIvory[1] * k;
      let b = agedPlaster[2] * (1 - k) + warmIvory[2] * k;
      return [clamp255(r), clamp255(g), clamp255(b)];
    });
    const rough = paint(size, () => [175, 175, 175]);
    const ao = paint(size, (x, y) => {
      const g = clamp255(95 + h[y * size + x] * 160);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 1.6), rough, ao };
  },

  /** Deep Crystalline Lapis Lazuli with Golden Pyrite Clusters & Calcite Veins */
  lapisLazuli(size = 256) {
    const seed = 5719;
    const h = heightField(size, (x, y, u, v) => {
      const pyriteRelief = Math.pow(fbmTile(u * 32, v * 32, 32, 3, seed + 9), 3.5) * 0.45;
      const calciteVeins = Math.pow(fbmTile(u * 12, v * 12, 12, 3, seed + 14), 2.2) * 0.25;
      const microPolish = (fbmTile(u * 96, v * 96, 96, 2, seed + 21) - 0.5) * 0.08;
      return 0.5 + pyriteRelief - calciteVeins * 0.3 + microPolish;
    });
    const map = paint(size, (x, y, u, v) => {
      const lazuriteWave = fbmTile(u * 6, v * 6, 6, 3, seed);
      const deepBlue = [14, 38, 120];
      const royalBlue = [26, 76, 192];
      const midnightIndigo = [8, 20, 68];
      
      let r = deepBlue[0] * (1 - lazuriteWave) + royalBlue[0] * lazuriteWave;
      let g = deepBlue[1] * (1 - lazuriteWave) + royalBlue[1] * lazuriteWave;
      let b = deepBlue[2] * (1 - lazuriteWave) + royalBlue[2] * lazuriteWave;

      // Dark indigo swirls
      const swirl = Math.pow(fbmTile(u * 14, v * 14, 14, 2, seed + 4), 2.0);
      r = r * (1 - swirl * 0.4) + midnightIndigo[0] * (swirl * 0.4);
      g = g * (1 - swirl * 0.4) + midnightIndigo[1] * (swirl * 0.4);
      b = b * (1 - swirl * 0.4) + midnightIndigo[2] * (swirl * 0.4);

      // Calcite white/grey seams
      const calcite = Math.pow(fbmTile(u * 10, v * 10, 10, 3, seed + 14), 3.2);
      const calciteColor = [228, 234, 245];
      r = r * (1 - calcite) + calciteColor[0] * calcite;
      g = g * (1 - calcite) + calciteColor[1] * calcite;
      b = b * (1 - calcite) + calciteColor[2] * calcite;

      // Sparkling golden pyrite crystal flecks
      const pyrite = Math.pow(fbmTile(u * 32, v * 32, 32, 3, seed + 9), 4.2);
      if (pyrite > 0.15) {
        const pyriteGold = [238, 204, 78];
        const pFrac = Math.min(1.0, (pyrite - 0.15) * 4.0);
        r = r * (1 - pFrac) + pyriteGold[0] * pFrac;
        g = g * (1 - pFrac) + pyriteGold[1] * pFrac;
        b = b * (1 - pFrac) + pyriteGold[2] * pFrac;
      }

      return [clamp255(r), clamp255(g), clamp255(b)];
    });
    const rough = paint(size, (x, y, u, v) => {
      const calcite = Math.pow(fbmTile(u * 10, v * 10, 10, 3, seed + 14), 3.2);
      const pyrite = Math.pow(fbmTile(u * 32, v * 32, 32, 3, seed + 9), 4.2);
      const g = clamp255(24 + calcite * 40 + pyrite * 18 + fbmTile(u * 24, v * 24, 24, 2, seed + 3) * 16);
      return [g, g, g];
    });
    const ao = paint(size, (x, y) => {
      const g = clamp255(140 + h[y * size + x] * 115);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 1.4), rough, ao };
  },

  /** 32-Point Celestial Compass Starburst Inlay Mosaic (Carrara Marble, Black Gabbro, Gold Quartzite) */
  carraraStarburstMosaic(size = 512) {
    const seed = 8831;
    const center = size / 2;
    const maxR = size * 0.48;

    const cv = makeCanvas(size);
    const ctx = cv.getContext('2d');

    // Honed Carrara base ground
    ctx.fillStyle = '#f0ebe1';
    ctx.fillRect(0, 0, size, size);

    // Marble veining pass
    ctx.strokeStyle = '#d6cebe';
    ctx.lineWidth = 2;
    for (let v = 0; v < 16; v++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * size, Math.random() * size);
      ctx.bezierCurveTo(Math.random() * size, Math.random() * size, Math.random() * size, Math.random() * size, Math.random() * size, Math.random() * size);
      ctx.stroke();
    }

    // Outer Guilloche / Roman Mosaic Border
    ctx.strokeStyle = '#181b1e';
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(center, center, maxR, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(center, center, maxR - 8, 0, Math.PI * 2); ctx.stroke();

    // 32-point radiating starburst compass
    const numPoints = 32;
    for (let p = 0; p < numPoints; p++) {
      const ang0 = (p / numPoints) * Math.PI * 2;
      const angMid = ((p + 0.5) / numPoints) * Math.PI * 2;
      const ang1 = ((p + 1) / numPoints) * Math.PI * 2;
      const isMajor = p % 2 === 0;
      const starLen = isMajor ? maxR * 0.85 : maxR * 0.60;

      // Black Gabbro facet
      ctx.fillStyle = isMajor ? '#14171a' : '#2d3136';
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.lineTo(center + Math.cos(ang0) * (maxR * 0.15), center + Math.sin(ang0) * (maxR * 0.15));
      ctx.lineTo(center + Math.cos(angMid) * starLen, center + Math.sin(angMid) * starLen);
      ctx.closePath();
      ctx.fill();

      // Gold Quartzite facet
      ctx.fillStyle = isMajor ? '#d4af37' : '#f2d04a';
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.lineTo(center + Math.cos(angMid) * starLen, center + Math.sin(angMid) * starLen);
      ctx.lineTo(center + Math.cos(ang1) * (maxR * 0.15), center + Math.sin(ang1) * (maxR * 0.15));
      ctx.closePath();
      ctx.fill();
    }

    // Central 24K Gold Rosette Ring
    ctx.fillStyle = '#14171a';
    ctx.beginPath(); ctx.arc(center, center, maxR * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#f2d04a';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(center, center, maxR * 0.14, 0, Math.PI * 2); ctx.stroke();

    const h = heightField(size, (x, y, u, v) => {
      const jointGrit = (fbmTile(u * 64, v * 64, 64, 2, seed) - 0.5) * 0.12;
      return 0.5 + jointGrit;
    });

    const rough = paint(size, (x, y, u, v) => {
      const g = clamp255(65 + fbmTile(u * 32, v * 32, 32, 2, seed + 5) * 45);
      return [g, g, g];
    });

    const ao = paint(size, (x, y) => {
      const g = clamp255(130 + h[y * size + x] * 125);
      return [g, g, g];
    });

    return { map: cv, normal: normalFromHeight(size, h, 1.8), rough, ao };
  },

  /** Optical Starlight Crystal with Subtle Prismatic Facet Normals */
  opticalCrystal(size = 256) {
    const seed = 7123;
    const h = heightField(size, (x, y, u, v) => {
      const facets = (fbmTile(u * 16, v * 16, 16, 2, seed) - 0.5) * 0.18;
      const microSheen = (fbmTile(u * 64, v * 64, 64, 2, seed + 7) - 0.5) * 0.05;
      return 0.5 + facets + microSheen;
    });
    const map = paint(size, (x, y, u, v) => {
      const wave = fbmTile(u * 8, v * 8, 8, 2, seed + 2);
      const crystalBase = [240, 250, 255];
      let r = crystalBase[0] * (0.92 + wave * 0.08);
      let g = crystalBase[1] * (0.94 + wave * 0.06);
      let b = crystalBase[2];
      return [clamp255(r), clamp255(g), clamp255(b)];
    });
    const rough = paint(size, () => [12, 12, 12]);
    const ao = paint(size, () => [245, 245, 245]);
    return { map, normal: normalFromHeight(size, h, 0.9), rough, ao };
  },

  /**
   * Honed Roman Travertine & Carrara Marble Ceremonial Boulevard
   * Warm golden-cream honed travertine pavers (#d8cfbe / #e2d8c6) with
   * dark Italian porphyry mosaic runner borders (#3a2c28), 24K gold studs,
   * weathered ashlar joints, and Carrara marble margins.
   */
  
  /** Intricate Byzantine gold and lapis mosaic for cathedral altars and domes. */
  byzantineMosaic(size = 512) {
    const seed = 9283;
    const tilesX = 32, tilesY = 32;
    const h = heightField(size, (x, y, u, v) => {
      const tx = (u * tilesX) % 1;
      const ty = (v * tilesY) % 1;
      const joint = Math.min(tx, 1 - tx, ty, 1 - ty);
      const jDepth = smooth(Math.min(1, joint / 0.15));
      const tileTilt = fbmTile(u * 16, v * 16, 16, 2, seed) * 0.1;
      return jDepth * 0.9 + tileTilt;
    });
    const map = paint(size, (x, y, u, v) => {
      const tcX = Math.floor(u * tilesX);
      const tcY = Math.floor(v * tilesY);
      const tileSeed = seed + tcX * 13 + tcY * 37;
      const tRandom = hash2(tcX, tcY, tileSeed);
      
      const lapis = [24, 48, 128];
      const gold = [212, 175, 55];
      const ivory = [240, 235, 220];
      const ruby = [138, 24, 32];
      
      let base = lapis;
      if (tRandom < 0.4) base = gold;
      else if (tRandom < 0.7) base = ivory;
      else if (tRandom < 0.85) base = ruby;
      
      const stain = Math.pow(fbmTile(u * 3.2, v * 3.2, 3, 3, tileSeed), 2.1);
      return tint(base, 0.8 + stain * 0.2);
    });
    const rough = paint(size, (x, y, u, v) => {
      const tx = (u * tilesX) % 1;
      const ty = (v * tilesY) % 1;
      const joint = Math.min(tx, 1 - tx, ty, 1 - ty);
      const tcX = Math.floor(u * tilesX);
      const tcY = Math.floor(v * tilesY);
      const tRandom = hash2(tcX, tcY, seed + tcX * 13 + tcY * 37);
      const g = (tRandom < 0.4) ? 40 : 80; // gold is shinier
      const roughVal = joint < 0.05 ? 220 : g; 
      return [roughVal, roughVal, roughVal];
    });
    const ao = paint(size, (x, y, u, v) => {
      const tx = (u * tilesX) % 1;
      const ty = (v * tilesY) % 1;
      const joint = Math.min(tx, 1 - tx, ty, 1 - ty);
      const jAO = smooth(Math.min(1, joint / 0.15));
      const g = clamp255(100 + jAO * 155);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 2.0), rough, ao };
  },

  ceremonialBoulevard(size = 512) {
    const seed = 3847;
    const cols = 8;
    const rows = 16;

    // Evaluate central paver grid distance and coordinates
    const centralPaver = (u, v) => {
      if (u < 0.15 || u > 0.85) return { inCentral: false, jointDist: 1.0, col: 0, row: 0, fu: 0, fv: 0 };
      const normU = (u - 0.15) / 0.70;
      const col = Math.floor(normU * cols);
      const fu = (normU * cols) - col;

      const rowOffset = (col % 2 === 1) ? 0.5 : 0.0;
      const normV = (v * rows + rowOffset) % rows;
      const row = Math.floor(normV);
      const fv = normV - row;

      const du = Math.min(fu, 1.0 - fu) / cols;
      const dv = Math.min(fv, 1.0 - fv) / rows;
      const jointDist = Math.min(du, dv);
      return { inCentral: true, jointDist, col, row, fu, fv };
    };

    // Evaluate dark porphyry mosaic runner with gold studs
    const porphyryRunner = (u, v) => {
      const inLeft = (u >= 0.045 && u < 0.15);
      const inRight = (u > 0.85 && u <= 0.955);
      if (!inLeft && !inRight) return { inRunner: false, isStud: false, tesseraJoint: 1.0, runnerU: 0 };

      const runnerU = inLeft ? (u - 0.045) / 0.105 : (u - 0.85) / 0.105;
      const tCols = 6, tRows = 32;
      const tc = Math.floor(runnerU * tCols);
      const tfu = (runnerU * tCols) - tc;
      const tr = Math.floor(v * tRows);
      const tfv = (v * tRows) - tr;
      const tesseraJoint = Math.min(Math.min(tfu, 1 - tfu) / tCols, Math.min(tfv, 1 - tfv) / tRows);

      const isCenterCol = (tc === 2 || tc === 3);
      const isStudRow = (tr % 8 === 0 || tr % 8 === 1);
      const studDist = Math.hypot((runnerU - 0.5) * 7.0, (tfv - 0.5) * 3.5);
      const isStud = isCenterCol && isStudRow && (studDist < 0.85);

      return { inRunner: true, isStud, tesseraJoint, inLeft, runnerU, tc, tr };
    };

    const h = heightField(size, (x, y, u, v) => {
      const cp = centralPaver(u, v);
      const pr = porphyryRunner(u, v);

      // Outer Carrara Marble Curbs (u < 0.045 or u > 0.955)
      if (u < 0.045 || u > 0.955) {
        const curbDist = u < 0.045 ? u / 0.045 : (1.0 - u) / 0.045;
        const bevel = smooth(Math.min(1.0, curbDist * 2.2));
        const microChisel = (fbmTile(u * 120, v * 30, 120, 2, seed + 1) - 0.5) * 0.04;
        return 0.70 * bevel + microChisel;
      }

      // Dark Porphyry Mosaic Runners (0.045..0.15 and 0.85..0.955)
      if (pr.inRunner) {
        if (pr.isStud) {
          return 0.82; // Raised 24K bronze/gold stud
        }
        const tJointDepth = smooth(Math.min(1.0, pr.tesseraJoint / 0.015));
        const tGrain = fbmTile(u * 80, v * 80, 80, 2, seed + 7) * 0.12;
        return 0.52 * tJointDepth + tGrain;
      }

      // Central Honed Roman Travertine Pavers
      if (cp.inCentral) {
        const jointDepth = smooth(Math.min(1.0, cp.jointDist / 0.012));
        const travertineGrain = fbmTile(u * 14, v * 14, 14, 3, seed + 11) * 0.28;
        const porousPits = Math.pow(fbmTile(u * 42, v * 42, 42, 3, seed + 19), 5.0) * 0.35;
        const microStriations = (fbmTile(u * 160, v * 28, 160, 2, seed + 23) - 0.5) * 0.06;
        return jointDepth * (0.64 + travertineGrain + microStriations) - porousPits;
      }

      return 0.5;
    });

    const map = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      const cp = centralPaver(u, v);
      const pr = porphyryRunner(u, v);

      // 1. Carrara Marble Curbs
      if (u < 0.045 || u > 0.955) {
        const mGrain = fbmTile(u * 24, v * 8, 24, 3, seed + 31);
        const mVein = Math.pow(Math.abs(fbmTile(u * 12, v * 12, 12, 3, seed + 37) - 0.5) * 2.0, 3.0);
        const baseMarble = [238, 234, 226]; // #eeeae2 warm Carrara
        let c = tint(baseMarble, 0.92 + mGrain * 0.12 - mVein * 0.22);
        return [clamp255(c[0]), clamp255(c[1]), clamp255(c[2])];
      }

      // 2. Dark Porphyry Mosaic Runners & Gold Studs
      if (pr.inRunner) {
        if (pr.isStud) {
          const goldBase = [245, 212, 85]; // 24K Celestial Gold
          const studShine = fbmTile(u * 60, v * 60, 60, 2, seed + 43);
          return [clamp255(goldBase[0] + studShine * 15), clamp255(goldBase[1] + studShine * 12), clamp255(goldBase[2] - studShine * 10)];
        }
        const tVar = hash2(pr.tc, pr.tr, seed + 51);
        const porphyryBase = [58, 44, 40]; // #3a2c28 dark Italian porphyry
        const darkOxide = [42, 32, 30];
        const warmClaret = [74, 52, 48];
        let base = (tVar < 0.35) ? darkOxide : (tVar > 0.70 ? warmClaret : porphyryBase);
        const mortarLichen = Math.max(0, 0.50 - hv) * 45;
        let c = tint(base, 0.85 + (tVar - 0.5) * 0.25);
        return [clamp255(c[0] + mortarLichen * 0.8), clamp255(c[1] + mortarLichen * 0.9), clamp255(c[2] + mortarLichen * 0.7)];
      }

      // 3. Central Honed Roman Travertine Pavers (#d8cfbe / #e2d8c6)
      if (cp.inCentral) {
        const paverSeed = hash2(cp.col, cp.row, seed + 67);
        const creamA = [216, 207, 190]; // #d8cfbe
        const creamB = [226, 216, 198]; // #e2d8c6
        const warmBuff = [208, 196, 176];
        const paleIvory = [232, 224, 208];

        let baseStone = (paverSeed < 0.25) ? creamA : (paverSeed < 0.55 ? creamB : (paverSeed < 0.80 ? warmBuff : paleIvory));
        const veinWave = fbmTile(u * 16, v * 16, 16, 3, seed + 73);
        const poreStain = Math.pow(fbmTile(u * 38, v * 38, 38, 3, seed + 79), 3.0);
        const microGrit = fbmTile(u * 120, v * 120, 120, 2, seed + 83) * 0.08;

        let c = tint(baseStone, 0.78 + hv * 0.26 + (paverSeed - 0.5) * 0.12 + veinWave * 0.10 - poreStain * 0.18 + microGrit);
        // Subtle warm ochre / moss in recessed joints
        const jointMoss = Math.max(0, 0.55 - hv) * Math.pow(fbmTile(u * 8, v * 8, 8, 3, seed + 89), 2.0) * 1.8;
        return [
          clamp255(c[0] - jointMoss * 28),
          clamp255(c[1] - jointMoss * 10),
          clamp255(c[2] - jointMoss * 34)
        ];
      }

      return [210, 200, 185];
    });

    const rough = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      const pr = porphyryRunner(u, v);

      if (pr.inRunner && pr.isStud) {
        return [65, 65, 65]; // Polished gold stud
      }
      if (u < 0.045 || u > 0.955) {
        return [165, 165, 165]; // Honed Carrara marble curb (roughness ~0.65)
      }
      if (pr.inRunner) {
        return [195, 195, 195]; // Porphyry runner (roughness ~0.76)
      }

      // Honed Roman Travertine (roughness ~0.72 with rougher mortar ~0.88)
      const microScratches = Math.pow(fbmTile(u * 96, v * 96, 96, 2, seed + 97), 3) * 30;
      const g = clamp255(184 - hv * 32 + fbmTile(u * 24, v * 24, 24, 3, seed + 101) * 28 + microScratches);
      return [g, g, g];
    });

    const ao = paint(size, (x, y, u, v) => {
      const cp = centralPaver(u, v);
      const pr = porphyryRunner(u, v);
      let jointAO = 1.0;
      if (cp.inCentral) {
        jointAO = smooth(Math.min(1.0, cp.jointDist / 0.018));
      } else if (pr.inRunner) {
        jointAO = smooth(Math.min(1.0, pr.tesseraJoint / 0.020));
      }
      const g = clamp255(85 + jointAO * 110 + h[y * size + x] * 60);
      return [g, g, g];
    });

    return { map, normal: normalFromHeight(size, h, 3.2), rough, ao };
  },

  /** Alpine Forget-Me-Nots (Myosotis alpestris) with sky-blue petals and golden-yellow star eye. */
  forgetMeNot(size = 128) {
    const seed = 5129;
    const blooms = [
      { cx: 0.30, cy: 0.32, r: 0.23, rot: 0.1 },
      { cx: 0.72, cy: 0.30, r: 0.21, rot: 0.8 },
      { cx: 0.32, cy: 0.72, r: 0.20, rot: 1.5 },
      { cx: 0.70, cy: 0.70, r: 0.24, rot: 2.2 },
      { cx: 0.50, cy: 0.50, r: 0.18, rot: 0.4 },
    ];

    const h = heightField(size, (x, y, u, v) => {
      let maxH = 0;
      for (const bl of blooms) {
        const dx = u - bl.cx, dy = v - bl.cy;
        const dist = Math.hypot(dx, dy);
        if (dist < bl.r) {
          const ang = Math.atan2(dy, dx) + bl.rot;
          const petalWave = Math.pow(Math.abs(Math.sin(ang * 2.5)), 1.4);
          const edge = bl.r * (0.45 + petalWave * 0.55);
          if (dist < edge) {
            maxH = Math.max(maxH, Math.sqrt(1.0 - dist / edge) * 0.85);
          }
        }
      }
      return maxH;
    });

    const map = paintRGBA(size, (x, y, u, v) => {
      for (const bl of blooms) {
        const dx = u - bl.cx, dy = v - bl.cy;
        const dist = Math.hypot(dx, dy);
        if (dist < bl.r) {
          const ang = Math.atan2(dy, dx) + bl.rot;
          const petalWave = Math.pow(Math.abs(Math.sin(ang * 2.5)), 1.4);
          const edge = bl.r * (0.45 + petalWave * 0.55);
          if (dist < edge) {
            const alpha = Math.min(1.0, (edge - dist) / 0.006);
            // Center Golden Star Eye (R < 0.24) with white pentagonal ring
            if (dist < bl.r * 0.24) {
              const eyeT = dist / (bl.r * 0.24);
              const goldEye = [255, 208, 48];
              const whiteHalo = [252, 252, 255];
              if (eyeT < 0.55) {
                const c = tint(goldEye, 1.0 + (1.0 - eyeT * 2.0) * 0.15);
                return [clamp255(c[0]), clamp255(c[1]), clamp255(c[2]), Math.round(alpha * 255)];
              } else {
                return [whiteHalo[0], whiteHalo[1], whiteHalo[2], Math.round(alpha * 255)];
              }
            }
            // Sky-blue petal blade with delicate radial gradient
            const skyBlue = [92, 160, 242];
            const celestialAzure = [118, 186, 255];
            const deepCobalt = [64, 128, 218];
            const t = dist / edge;
            let cr = skyBlue[0] * (1 - t) + celestialAzure[0] * t;
            let cg = skyBlue[1] * (1 - t) + celestialAzure[1] * t;
            let cb = skyBlue[2] * (1 - t) + celestialAzure[2] * t;
            if (t > 0.80) {
              const k = (t - 0.80) / 0.20;
              cr = cr * (1 - k) + deepCobalt[0] * k;
              cg = cg * (1 - k) + deepCobalt[1] * k;
              cb = cb * (1 - k) + deepCobalt[2] * k;
            }
            return [clamp255(cr), clamp255(cg), clamp255(cb), Math.round(alpha * 255)];
          }
        }
      }
      return [0, 0, 0, 0];
    });

    const rough = paint(size, () => [170, 170, 170]);
    return { map, normal: normalFromHeight(size, h, 1.9), rough };
  },

  /** Cast Bronze Memorial Plaque with Verdigris Patina and Raised Carved Brass Lettering */
  bronzePlaque(size = 256) {
    const seed = 7719;
    const h = heightField(size, (x, y, u, v) => {
      const border = (u < 0.06 || u > 0.94 || v < 0.06 || v > 0.94) ? 0.35 : 0.0;
      const innerBevel = (Math.abs(u - 0.5) > 0.42 || Math.abs(v - 0.5) > 0.42) ? 0.20 : 0.0;
      const grain = fbmTile(u * 32, v * 32, 32, 2, seed) * 0.15;
      return 0.5 + border + innerBevel + grain;
    });

    const map = paint(size, (x, y, u, v) => {
      const isBorder = (u < 0.06 || u > 0.94 || v < 0.06 || v > 0.94);
      const patina = Math.pow(fbmTile(u * 8, v * 8, 8, 3, seed + 5), 2.2);
      const brass = [198, 162, 88];
      const verdigris = [52, 134, 112];
      const darkBronze = [68, 54, 42];

      if (isBorder) {
        return tint(brass, 0.90 + (1.0 - patina) * 0.20);
      }
      let base = tint(darkBronze, 0.75 + patina * 0.45);
      return [
        clamp255(base[0] * (1 - patina * 0.6) + verdigris[0] * (patina * 0.6)),
        clamp255(base[1] * (1 - patina * 0.6) + verdigris[1] * (patina * 0.6)),
        clamp255(base[2] * (1 - patina * 0.6) + verdigris[2] * (patina * 0.6)),
      ];
    });

    const rough = paint(size, (x, y, u, v) => {
      const isBorder = (u < 0.06 || u > 0.94 || v < 0.06 || v > 0.94);
      return isBorder ? [95, 95, 95] : [175, 175, 175];
    });

    const ao = paint(size, (x, y) => {
      const g = clamp255(150 + h[y * size + x] * 105);
      return [g, g, g];
    });

    return { map, normal: normalFromHeight(size, h, 2.0), rough, ao };
  },
};

// ---------------------------------------------------------------
// Public API
// ---------------------------------------------------------------

/**
 * Get the raw texture set for a recipe, generated once and cached.
 * @param {keyof RECIPES} name
 */

const RECIPE_ALIASES = {
  'gold': 'celestialGold24K',
  'celestialGold': 'celestialGold24K',
  'sunGold': 'celestialGold24K',
  'flagstone': 'limestone',
  'paving': 'limestone',
  'pavers': 'limestone',
  'bronze': 'weatheredVerdigrisBronze'
};

const _warnedAliases = new Set();
function resolveAlias(name) {
  if (RECIPE_ALIASES[name]) {
    if (!_warnedAliases.has(name)) {
      console.warn(`[materials] alias used: "${name}" -> "${RECIPE_ALIASES[name]}"`);
      _warnedAliases.add(name);
    }
    return RECIPE_ALIASES[name];
  }
  return name;
}

export function textures(name, size) {
  name = resolveAlias(name);
  
  // PHOTOREALISM UPGRADE: Intercept procedural generation and return real PBR textures
  if (name === 'photogrammetryRock') return loadPBR('rock');
  if (name === 'mossyScree' || name === 'groundDetail') return loadPBR('mud');
  if (name === 'meadowLush' || name === 'grass') return loadPBR('grass');
  if (name === 'agedCaenLimestone' || name === 'plazaPaving') return loadPBR('stone');
  if (name === 'honedCarraraMarble') return loadPBR('marble');

  const key = `${name}@${size || 'auto'}`;
  if (texCache.has(key)) return texCache.get(key);
  const recipe = RECIPES[name];
  if (!recipe) {
    console.warn(`[materials] no texture recipe "${name}"`);
    return {};
  }
  const canvases = size ? recipe(size) : recipe();
  const out = {};
  if (canvases.map) out.map = toTexture(canvases.map, { srgb: true });
  if (canvases.normal) {
    const normTex = toTexture(canvases.normal);
    out.normalMap = normTex;
    out.normal = normTex;
  }
  if (canvases.rough) out.roughnessMap = toTexture(canvases.rough);
  if (canvases.ao) out.aoMap = toTexture(canvases.ao);
  texCache.set(key, out);
  return out;
}

/**
 * Warm up all procedural textures in progressive chunks with event-loop yielding
 * so the browser never drops frames or freezes during loading, even in background tabs.
 * @param {(pct: number) => void} [onProgress] Callback receiving progress (0.0 to 1.0)
 */
export async function warmAllTextures(onProgress) {
  try {
    // Pre-warm ONLY the primary core textures needed for the initial 3D viewport rendering.
    // All other secondary / special textures build lazily on demand when their meshes are added.
    const CORE_TEXTURES = [
      'limestone',
      'agedCaenLimestone',
      'marble',
      'honedCarraraMarble',
      'granite',
      'ceremonialBoulevard',
      'forgetMeNot',
      'bronzePlaque',
      'grass',
      'meadowLush',
      'mossyScree',
      'photogrammetryRock',
      'alpineSnowDrift',
      'satelliteOrthophoto',
      'bark',
      'sand',
      'waterNormals',
      'waterCaustics',
      'glacialPyriteGranite',
      'riverPebblesCaustics',
      'sunkenDriftwood',
      'coralReefRock',
      'leafCard',
      'pineNeedles',
      'palmFrond',
      'celestialGold24K',
      'weatheredVerdigrisBronze',
      'stuccoMuqarnas',
      'moorishZellij',
      'pagodaTile',
    ];
    const total = CORE_TEXTURES.length;
    for (let i = 0; i < total; i++) {
      const name = CORE_TEXTURES[i];
      try {
        textures(name);
      } catch (e) {
        console.log(`[materials] failed warming texture "${name}":`, e);
      }
      if (typeof onProgress === 'function') {
        try { onProgress((i + 1) / total); } catch {}
      }
      // Yield to microtask/macrotask so UI updates immediately without tab-pause hang
      await new Promise(r => setTimeout(r, 0));
    }
  } catch (err) {
    console.log('[materials] warmAllTextures caught error:', err);
  } finally {
    if (typeof onProgress === 'function') {
      try { onProgress(1.0); } catch {}
    }
  }
}

/**
 * Build a MeshStandardMaterial (or Physical, for anything with a
 * clearcoat) from a recipe plus overrides.
 *
 * @param {string} name    recipe key
 * @param {object} opts    { repeat, color, roughness, metalness, physical, ...THREE material props }
 */
export function material(name, opts = {}) {
  name = resolveAlias(name);
  const { repeat = 1, physical = false, normalScale = 1, ...rest } = opts;
  const key = `${name}|${repeat}|${physical}|${normalScale}|${JSON.stringify(rest)}`;
  if (matCache.has(key)) return matCache.get(key);

  const t = textures(name);
  // Each material may need its own repeat, so clone rather than share.
  const cloneWith = (tex) => {
    if (!tex) return null;
    const c = tex.clone();
    c.repeat.set(repeat, repeat);
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.needsUpdate = true;
    return c;
  };

  const Ctor = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const mat = new Ctor({
    map: cloneWith(t.map),
    normalMap: cloneWith(t.normalMap),
    roughnessMap: cloneWith(t.roughnessMap),
    aoMap: cloneWith(t.aoMap),
    ...rest,
  });
  if (mat.normalMap) {
    if (typeof normalScale === 'number') {
      mat.normalScale = new THREE.Vector2(normalScale, normalScale);
    } else if (normalScale instanceof THREE.Vector2) {
      mat.normalScale = normalScale.clone();
    } else if (normalScale && typeof normalScale.x === 'number') {
      mat.normalScale = new THREE.Vector2(normalScale.x, normalScale.y);
    }
  }
  matCache.set(key, mat);
  return mat;
}

/** Named, ready-to-use surfaces shared by the world and the thumbnails. */
export const Surfaces = {
  limestone: (repeat = 1, o = {}) => PhotoSurfaces.stone(),
  limestoneDark: (repeat = 1, o = {}) => PhotoSurfaces.stone(),
  agedCaenLimestone: (repeat = 1, o = {}) => PhotoSurfaces.stone(),
  marble: (repeat = 1, o = {}) => PhotoSurfaces.marble(),
  honedCarraraMarble: (repeat = 1, o = {}) => PhotoSurfaces.marble(),
  granite: (repeat = 1, o = {}) => PhotoSurfaces.rock(),
  bark: (repeat = 2, o = {}) => material('bark', {  repeat, color: 0xffffff, roughness: 0.96, metalness: 0, normalScale: 1.5, envMapIntensity: 0.9 , ...o }),
  grass: (repeat = 40, o = {}) => PhotoSurfaces.grass(),
  sand: (repeat = 30, o = {}) => material('sand', {  repeat, color: 0xffffff, roughness: 0.88, metalness: 0.02, normalScale: 1.2, envMapIntensity: 1.1 , ...o }),
  bronze: (repeat = 1, o = {}) => material('weatheredVerdigrisBronze', {  repeat, color: 0xffffff, roughness: 0.35, metalness: 0.95, physical: true, clearcoat: 0.35, clearcoatRoughness: 0.25, normalScale: 1.35, aoMapIntensity: 1.3, envMapIntensity: 1.45 , ...o }),
  verdigrisBronze: (repeat = 1, o = {}) => material('weatheredVerdigrisBronze', {  repeat, color: 0xffffff, roughness: 0.35, metalness: 0.95, physical: true, clearcoat: 0.35, clearcoatRoughness: 0.25, normalScale: 1.35, aoMapIntensity: 1.3, envMapIntensity: 1.45 , ...o }),
  iron: (repeat = 1, o = {}) => material('iron', {  repeat, color: 0xffffff, roughness: 0.65, metalness: 0.85, normalScale: 0.9, envMapIntensity: 1.2 , ...o }),
  wax: (repeat = 1, o = {}) => material('wax', {  repeat, color: 0xffffff, roughness: 0.45, metalness: 0, physical: true, transmission: 0.42, thickness: 1.6, ior: 1.45, normalScale: 0.75, envMapIntensity: 1.1 , ...o }),
  ceramic: (repeat = 1, o = {}) => material('ceramic', {  repeat, color: 0xffffff, roughness: 0.08, metalness: 0, physical: true, ior: 1.52, clearcoat: 1.0, clearcoatRoughness: 0.02, normalScale: 0.45, envMapIntensity: 1.35 , ...o }),
  stainedGlass: (repeat = 1, o = {}) => new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.95, opacity: 1, metalness: 0, roughness: 0.1, ior: 1.5, thickness: 0.1, clearcoat: 1.0, envMapIntensity: 2.0, side: THREE.DoubleSide, ...o }),
  glowingCrystal: (repeat = 1, o = {}) => new THREE.MeshStandardMaterial({ color: 0xffeebb, emissive: 0xffddaa, emissiveIntensity: 2.0, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.9, ...o }),
  mosaic: (repeat = 1, o = {}) => material('ceramic', { repeat, color: 0xffffff, roughness: 0.2, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.1, envMapIntensity: 1.5, ...o }),
  stuccoMuqarnas: (repeat = 1, o = {}) => material('stuccoMuqarnas', {  repeat, color: 0xffffff, roughness: 0.88, metalness: 0.0, normalScale: 1.5, aoMapIntensity: 1.25, envMapIntensity: 1.05 , ...o }),
  timber: (repeat = 2, o = {}) => material('timber', {  repeat, color: 0xffffff, roughness: 0.82, metalness: 0.0, physical: true, clearcoat: 0.05, clearcoatRoughness: 0.9, normalScale: 1.4, aoMapIntensity: 1.0, envMapIntensity: 1.0 , ...o }),
  wood: (repeat = 2, o = {}) => material('timber', {  repeat, color: 0xffffff, roughness: 0.82, metalness: 0.0, physical: true, clearcoat: 0.05, clearcoatRoughness: 0.9, normalScale: 1.4, aoMapIntensity: 1.0, envMapIntensity: 1.0 , ...o }),
  gold: (repeat = 1, o = {}) => material('celestialGold24K', {  repeat, color: 0xffffff, roughness: 0.10, metalness: 1.0, physical: true, ior: 0.47, reflectivity: 0.95, clearcoat: 0.95, clearcoatRoughness: 0.03, normalScale: 0.85, aoMapIntensity: 1.15, envMapIntensity: 2.0 , ...o }),
  celestialGold: (repeat = 1, o = {}) => material('celestialGold24K', {  repeat, color: 0xffffff, roughness: 0.10, metalness: 1.0, physical: true, ior: 0.47, reflectivity: 0.95, clearcoat: 0.95, clearcoatRoughness: 0.03, normalScale: 0.85, aoMapIntensity: 1.15, envMapIntensity: 2.0 , ...o }),
  water: (repeat = 1, o = {}) => {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 1.0,
      ior: 1.333,
      roughness: 0.10,
      metalness: 0.02,
      thickness: 6.5,
      transparent: false,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      dispersion: 0.024,
      attenuationColor: new THREE.Color(0x0a384c),
      attenuationDistance: 4.0,
      envMapIntensity: 2.0,
      normalMap: waterNormalTexture(),
      normalScale: new THREE.Vector2(0.8, 0.8),
      ...o,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uDepthTexture = { value: null };
      shader.uniforms.cameraNear = { value: 0.1 };
      shader.uniforms.cameraFar = { value: 1000.0 };
      shader.uniforms.uCausticsMap = { value: waterCausticsTexture() };
      mat.userData.shader = shader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>\nuniform float uTime;\nvarying vec4 vScreenPos;\nvarying vec3 vWorldPos;`
      ).replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;`
      ).replace(
        '#include <project_vertex>',
        `#include <project_vertex>
         vScreenPos = gl_Position;`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>\nuniform float uTime;\nuniform sampler2D uDepthTexture;\nuniform float cameraNear;\nuniform float cameraFar;\nuniform sampler2D uCausticsMap;\nvarying vec4 vScreenPos;\nvarying vec3 vWorldPos;
         float getLinearDepth(float fragCoordZ) {
             float viewZ = (cameraNear * cameraFar) / ((cameraFar - cameraNear) * fragCoordZ - cameraFar);
             return viewZ;
         }`
      ).replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         vec2 screenUV = vScreenPos.xy / vScreenPos.w * 0.5 + 0.5;
         float bgDepth = texture2D(uDepthTexture, screenUV).r;
         float bgLinearDepth = getLinearDepth(bgDepth);
         float waterLinearDepth = getLinearDepth(gl_FragCoord.z);
         float depthDiff = max(0.0, bgLinearDepth - waterLinearDepth);
         
         // Deep water color blending (enhancing physical transmission)
         float depthBlend = smoothstep(0.0, 10.0, depthDiff);
         gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.04, 0.22, 0.3), depthBlend * 0.5);
         
         // Caustics
         vec2 causticUV = vWorldPos.xz * 0.05 + uTime * 0.05;
         vec3 causticCol = texture2D(uCausticsMap, causticUV).rgb;
         gl_FragColor.rgb += causticCol * exp(-depthDiff * 0.2) * 0.5;
         
         // Foam at intersection points
         float foamEdge = smoothstep(0.0, 0.5, depthDiff) - smoothstep(0.5, 1.5, depthDiff);
         gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0), foamEdge * 0.8);`
      );
    };
    return mat;
  },
  waterNormals: (repeat = 1) => waterNormalTexture(),
  waterCaustics: (repeat = 1) => waterCausticsTexture(),
  leafCard: (color = 0xffffff) => {
    const t = textures('leafCard');
    return createBotanicalFoliageMaterial(color, t.map, {
      isTree: true,
      normalMap: t.normalMap,
      normalScale: 1.15,
      roughness: 0.32,
      metalness: 0.0,
      sssColor: new THREE.Color(0x82d835),
      shadowColor: new THREE.Color(0x1a4414),
      sssIntensity: 1.25,
      windIntensity: 1.1,
    });
  },
  palmFrond: (color = 0xffffff) => {
    const t = textures('palmFrond');
    return createBotanicalFoliageMaterial(color, t.map, {
      isTree: true,
      normalMap: t.normalMap,
      normalScale: 0.95,
      roughness: 0.42,
      metalness: 0.0,
      sssColor: new THREE.Color(0x72d838),
      shadowColor: new THREE.Color(0x1a4414),
      sssIntensity: 0.85,
      windIntensity: 1.15,
    });
  },
  pineNeedles: (color = 0xffffff) => {
    const t = textures('pineNeedles');
    return createBotanicalFoliageMaterial(color, t.map, {
      isTree: true,
      normalMap: t.normalMap,
      normalScale: 1.4,
      roughness: 0.52,
      metalness: 0.0,
      sssColor: new THREE.Color(0x62c828),
      shadowColor: new THREE.Color(0x1a4414),
      sssIntensity: 1.15,
      windIntensity: 0.9,
    });
  },
  sakuraBlossom: (color = 0xffffff) => {
    const t = textures('sakuraBlossom');
    return createBotanicalFoliageMaterial(color, t.map, {
      isTree: true,
      normalMap: t.normalMap,
      normalScale: 0.60,
      roughness: 0.55,
      metalness: 0.0,
      sssColor: new THREE.Color(0xff88b4),
      shadowColor: new THREE.Color(0x4a1828),
      sssIntensity: 0.95,
      windIntensity: 1.25,
    });
  },
  goldenPoppy: (color = 0xffffff) => {
    const t = textures('goldenPoppy');
    return createBotanicalFoliageMaterial(color, t.map, {
      isTree: false,
      normalMap: t.normalMap,
      normalScale: 0.65,
      roughness: 0.60,
      metalness: 0.0,
      sssColor: new THREE.Color(0xffaa28),
      sssIntensity: 0.90,
      windIntensity: 1.0,
    });
  },
  edelweiss: (color = 0xffffff) => {
    const t = textures('edelweiss');
    return createBotanicalFoliageMaterial(color, t.map, {
      isTree: false,
      normalMap: t.normalMap,
      normalScale: 0.60,
      roughness: 0.65,
      metalness: 0.0,
      sssColor: new THREE.Color(0xf6faee),
      sssIntensity: 0.80,
      windIntensity: 1.0,
    });
  },
  lavenderSprig: (color = 0xffffff) => {
    const t = textures('lavenderSprig');
    return createBotanicalFoliageMaterial(color, t.map, {
      isTree: false,
      normalMap: t.normalMap,
      normalScale: 0.70,
      roughness: 0.60,
      metalness: 0.0,
      sssColor: new THREE.Color(0xc090f8),
      sssIntensity: 0.85,
      windIntensity: 1.1,
    });
  },
  forgetMeNot: (color = 0xffffff) => {
    const t = textures('forgetMeNot');
    return createBotanicalFoliageMaterial(color, t.map, {
      isTree: false,
      normalMap: t.normalMap,
      normalScale: 0.65,
      roughness: 0.60,
      metalness: 0.0,
      sssColor: new THREE.Color(0x70c0ff),
      sssIntensity: 0.88,
      windIntensity: 1.0,
    });
  },
  ceremonialBoulevard: (repeat = 1, o = {}) => material('ceremonialBoulevard', { 
    repeat,
    color: 0xffffff,
    roughness: 0.65,
    metalness: 0.02,
    physical: true,
    ior: 1.53,
    clearcoat: 0.35,
    clearcoatRoughness: 0.30,
    normalScale: 1.25,
    aoMapIntensity: 1.20,
    envMapIntensity: 1.20,
    polygonOffset: true,
    polygonOffsetFactor: -1.0,
    polygonOffsetUnits: -1.0,
    ...o
  }),
  honedRomanTravertine: (repeat = 1, o = {}) => material('ceremonialBoulevard', { 
    repeat,
    color: 0xffffff,
    roughness: 0.65,
    metalness: 0.02,
    physical: true,
    ior: 1.53,
    clearcoat: 0.35,
    clearcoatRoughness: 0.30,
    normalScale: 1.25,
    aoMapIntensity: 1.20,
    envMapIntensity: 1.20,
    polygonOffset: true,
    polygonOffsetFactor: -1.0,
    polygonOffsetUnits: -1.0,
    ...o
  }),
  pavedRoad: (repeat = 1, o = {}) => material('limestone', { 
    repeat,
    color: 0xc8baa4,
    roughness: 0.82,
    metalness: 0.02,
    normalScale: 1.35,
    aoMapIntensity: 1.10,
    envMapIntensity: 1.05,
    polygonOffset: true,
    polygonOffsetFactor: -1.0,
    polygonOffsetUnits: -1.0,
    ...o
  }),
  bronzePlaque: (repeat = 1, o = {}) => material('bronzePlaque', { 
    repeat,
    color: 0xffffff,
    roughness: 0.38,
    metalness: 0.90,
    physical: true,
    clearcoat: 0.45,
    clearcoatRoughness: 0.15,
    normalScale: 1.25,
    aoMapIntensity: 1.20,
    envMapIntensity: 1.40,
    ...o
  }),
  fallenPineNeedles: (repeat = 1, o = {}) => material('fallenPineNeedles', { 
    repeat, color: 0xffffff, roughness: 0.94, metalness: 0.01, normalScale: 1.6, aoMapIntensity: 1.1, envMapIntensity: 0.95,
    ...o
  }),
  mossyStone: (repeat = 1, o = {}) => material('mossyStone', { 
    repeat, color: 0xffffff, roughness: 0.86, metalness: 0.02, normalScale: 2.0, aoMapIntensity: 1.15, envMapIntensity: 1.0,
    ...o
  }),
  grassTuft: (color = 0xffffff) => {
    const t = textures('grassTuft');
    return createBotanicalFoliageMaterial(color, t.map, {
      isTree: false,
      normalMap: t.normalMap,
      normalScale: 0.95,
      roughness: 0.82,
      sssColor: new THREE.Color(0x8ce045),
      sssIntensity: 0.80,
      windIntensity: 1.2,
    });
  },
  grassBlade: (color = 0xffffff) => {
    const t = textures('grassBlade');
    return createBotanicalFoliageMaterial(color, t.map, {
      isTree: false,
      normalMap: t.normalMap,
      normalScale: 0.85,
      roughness: 0.85,
      sssColor: new THREE.Color(0x8ce045),
      sssIntensity: 0.80,
      windIntensity: 1.2,
    });
  },
  wildflowers: (color = 0xe8e6df) => {
    const t = textures('wildflowers');
    return createBotanicalFoliageMaterial(color, t.map, {
      isTree: false,
      normalMap: t.normalMap,
      normalScale: 0.65,
      roughness: 0.82,
      sssColor: new THREE.Color(1.0, 0.92, 0.65),
      sssIntensity: 0.80,
      windIntensity: 1.1,
    });
  },
  foliage: (repeat = 1, color = 0x5e8f4e) => {
    const t = textures('foliage');
    return createBotanicalFoliageMaterial(color, t.map, {
      isTree: true,
      normalMap: t.normalMap,
      normalScale: 0.95,
      roughness: 0.70,
      sssColor: new THREE.Color(0x82d835),
      shadowColor: new THREE.Color(0x1a4414),
      sssIntensity: 0.88,
      windIntensity: 1.1,
    });
  },
  rockCliff: (repeat = 12, o = {}) => material('rockCliff', {  repeat, color: 0xffffff, roughness: 0.82, metalness: 0.03, normalScale: 2.2, aoMapIntensity: 1.1, envMapIntensity: 0.95 , ...o }),
  mossyScree: (repeat = 20, o = {}) => material('mossyScree', {  repeat, color: 0xffffff, roughness: 0.70, metalness: 0.0, normalScale: 2.0, aoMapIntensity: 1.1, envMapIntensity: 0.95 , ...o }),
  forestFloor: (repeat = 20, o = {}) => material('forestFloor', {  repeat, color: 0xffffff, roughness: 0.65, metalness: 0.0, normalScale: 1.25, envMapIntensity: 0.95 , ...o }),
  groundDetail: (repeat = 80, o = {}) => material('groundDetail', {  repeat, color: 0xffffff, roughness: 0.95, metalness: 0.0, normalScale: 1.1, envMapIntensity: 0.95 , ...o }),
  flagstone: (repeat = 3, o = {}) => material('limestone', {  repeat, color: 0xb2a58d, roughness: 0.84, metalness: 0.02, normalScale: 1.3, envMapIntensity: 1.05, polygonOffset: true, polygonOffsetFactor: -1.0, polygonOffsetUnits: -1.0, ...o }),
  meadowLush: (repeat = 35, o = {}) => material('meadowLush', {  repeat, color: 0xffffff, roughness: 0.55, metalness: 0.0, normalScale: 1.8, aoMapIntensity: 1.1, envMapIntensity: 1.05 , ...o }),
  weatheredTravertine: (repeat = 2, o = {}) => material('weatheredTravertine', { 
    repeat,
    color: 0xffffff,
    roughness: 0.74,
    metalness: 0.02,
    physical: true,
    ior: 1.53,
    clearcoat: 0.25,
    clearcoatRoughness: 0.45,
    normalScale: 1.8,
    aoMapIntensity: 1.20,
    envMapIntensity: 1.15,
    polygonOffset: true,
    polygonOffsetFactor: -1.0,
    polygonOffsetUnits: -1.0,
    ...o
  }),
  satelliteOrthophoto: (repeat = 1, o = {}) => material('satelliteOrthophoto', {  repeat, color: 0xffffff, roughness: 0.90, metalness: 0.01, normalScale: 1.2, aoMapIntensity: 0.95, envMapIntensity: 1.0 , ...o }),
  petal: (repeat = 1, color = 0xffffff, o = {}) => material('quartz', { 
    repeat,
    color,
    roughness: 0.42,
    metalness: 0.02,
    physical: true,
    transmission: 0.45,
    thickness: 0.6,
    ior: 1.54,
    clearcoat: 0.5,
    clearcoatRoughness: 0.2,
    side: THREE.DoubleSide,
    envMapIntensity: 1.25,
    ...o
  }),
  quartz: (repeat = 1, color = 0xffffff, o = {}) => material('quartz', { 
    repeat,
    color,
    roughness: 0.18,
    metalness: 0.02,
    physical: true,
    transmission: 0.75,
    thickness: 2.0,
    ior: 1.54,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    dispersion: 0.024,
    normalScale: 0.85,
    attenuationColor: new THREE.Color(0xd8f0ff),
    attenuationDistance: 3.5,
    envMapIntensity: 1.65,
    ...o
  }),
  photogrammetryRock: (repeat = 8, o = {}) => material('photogrammetryRock', {  repeat, color: 0xffffff, roughness: 0.84, metalness: 0.03, normalScale: 2.6, aoMapIntensity: 1.15, envMapIntensity: 0.98 , ...o }),
  stainedGlassRose: () => {
    const t = textures('stainedGlassRose', 1024);
    return material('stainedGlassRose', {
      repeat: 1,
      transparent: true,
      side: THREE.DoubleSide,
      roughness: 0.04,
      metalness: 0.02,
      physical: true,
      transmission: 0.95,
      thickness: 2.5,
      ior: 1.52,
      dispersion: 0.024,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      emissive: 0xffffff,
      emissiveIntensity: 0.90,
      emissiveMap: t.map ? t.map.clone() : null,
      envMapIntensity: 1.8,
    });
  },
  sistineVault: (repeat = 1, o = {}) => material('sistineVaultFresco', { 
    repeat, roughness: 0.65, metalness: 0.08, side: THREE.BackSide, envMapIntensity: 1.15,
    ...o
  }),
  cypressFoliage: () => {
    const t = textures('cypressFoliage');
    return createBotanicalFoliageMaterial(0xffffff, t.map, {
      isTree: true,
      normalMap: t.normalMap,
      normalScale: 1.3,
      roughness: 0.74,
      sssColor: new THREE.Color(0x48b836),
      sssIntensity: 0.70,
      windIntensity: 0.95,
    });
  },
  jerusalemStone: (repeat = 2, o = {}) => material('jerusalemStone', { 
    repeat, roughness: 0.82, metalness: 0.02, normalScale: 1.6, aoMapIntensity: 1.05, envMapIntensity: 1.05,
    ...o
  }),
  moorishZellij: (repeat = 4, o = {}) => material('moorishZellij', { 
    repeat, roughness: 0.1, metalness: 0.0, physical: true, ior: 1.52, clearcoat: 1.0, clearcoatRoughness: 0.02, normalScale: 1.35, aoMapIntensity: 1.25, envMapIntensity: 1.45,
    ...o
  }),
  pagodaTile: (repeat = 4, o = {}) => material('pagodaTile', { 
    repeat, roughness: 0.75, metalness: 0.0, physical: true, clearcoat: 0.25, clearcoatRoughness: 0.4, normalScale: 2.4, aoMapIntensity: 1.3, envMapIntensity: 1.15,
    ...o
  }),
  glacialIce: (repeat = 6, o = {}) => material('glacialIce', { 
    repeat, roughness: 0.06, metalness: 0.02, physical: true, transmission: 0.75, thickness: 3.5, ior: 1.31, clearcoat: 0.95, clearcoatRoughness: 0.03, dispersion: 0.022, normalScale: 1.8, envMapIntensity: 1.6,
    ...o
  }),
  alpineSnow: (repeat = 12, o = {}) => material('alpineSnowDrift', { 
    repeat, roughness: 0.78, metalness: 0.02, normalScale: 1.4, envMapIntensity: 1.2,
    ...o
  }),
  stratifiedBasalt: (repeat = 8, o = {}) => material('stratifiedBasalt', { 
    repeat, roughness: 0.88, metalness: 0.04, normalScale: 2.8, aoMapIntensity: 1.2, envMapIntensity: 0.95,
    ...o
  }),
  glacialPyriteGranite: (repeat = 1, o = {}) => material('glacialPyriteGranite', { 
    repeat, roughness: 0.48, metalness: 0.22, physical: true, clearcoat: 0.45, clearcoatRoughness: 0.15, normalScale: 2.4, aoMapIntensity: 1.25, envMapIntensity: 1.35,
    ...o
  }),
  riverPebbles: (repeat = 1, o = {}) => material('riverPebblesCaustics', { 
    repeat, roughness: 0.42, metalness: 0.06, physical: true, clearcoat: 0.55, clearcoatRoughness: 0.12, normalScale: 2.0, aoMapIntensity: 1.15, envMapIntensity: 1.25,
    ...o
  }),
  sunkenDriftwood: (repeat = 1, o = {}) => material('sunkenDriftwood', { 
    repeat, roughness: 0.82, metalness: 0.02, normalScale: 1.8, aoMapIntensity: 1.25, envMapIntensity: 0.95,
    ...o
  }),
  coralReefRock: (repeat = 1, o = {}) => material('coralReefRock', { 
    repeat, roughness: 0.68, metalness: 0.04, normalScale: 2.4, aoMapIntensity: 1.2, envMapIntensity: 1.1,
    ...o
  }),
  cumulonimbusCloud: () => material('cumulonimbusCloud', {
    repeat: 1, transparent: true, depthWrite: false, roughness: 1, metalness: 0, side: THREE.DoubleSide
  }),
  cloudCard: () => material('cloudCard', { repeat: 1, transparent: true, depthWrite: false, roughness: 1, metalness: 0, side: THREE.DoubleSide }),
  glass: () => new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 1.0, 
    transmission: 0.98, ior: 1.52, thickness: 1.5, clearcoat: 1.0, clearcoatRoughness: 0.02,
    attenuationColor: new THREE.Color(0xd0f0ff), attenuationDistance: 2.0, envMapIntensity: 1.5
  }),
  crystal: () => new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.02, metalness: 0.0, transparent: true, opacity: 1.0,
    transmission: 0.96, ior: 1.54, thickness: 2.5, clearcoat: 1.0, clearcoatRoughness: 0.01,
    attenuationColor: new THREE.Color(0x38bdf8), attenuationDistance: 3.5, dispersion: 0.024, envMapIntensity: 1.8
  }),
  prismaticCrystal: () => new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.01, metalness: 0.0, transparent: true, opacity: 1.0,
    transmission: 0.98, ior: 1.55, thickness: 4.0, clearcoat: 1.0, clearcoatRoughness: 0.0,
    dispersion: 0.035, envMapIntensity: 2.0
  }),
  wetLimestone: (repeat = 3, o = {}) => material('limestone', { 
    repeat,
    color: 0x6e6252,
    roughness: 0.22,
    metalness: 0.08,
    physical: true,
    ior: 1.53,
    clearcoat: 0.85,
    clearcoatRoughness: 0.10,
    normalScale: 1.5,
    envMapIntensity: 1.45,
    ...o
  }),
  memoryCrystal: (color = 0x78dcfa) => new THREE.MeshPhysicalMaterial({
    color: 0xffffff, emissive: new THREE.Color(color), emissiveIntensity: 0.6,
    roughness: 0.05, metalness: 0.0, transparent: true, opacity: 1.0,
    transmission: 0.95, ior: 1.54, thickness: 1.5, clearcoat: 1.0, clearcoatRoughness: 0.02,
    attenuationColor: new THREE.Color(color), attenuationDistance: 2.0, dispersion: 0.02, envMapIntensity: 1.8
  }),
  lapisLazuli: (repeat = 1, o = {}) => material('lapisLazuli', { 
    repeat,
    color: 0xffffff,
    roughness: 0.10,
    metalness: 0.18,
    physical: true,
    ior: 1.50,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    normalScale: 0.75,
    envMapIntensity: 1.85,
    ...o
  }),
  carraraStarburstMosaic: (repeat = 1, o = {}) => material('carraraStarburstMosaic', { 
    repeat,
    color: 0xffffff,
    roughness: 0.22,
    metalness: 0.08,
    physical: true,
    ior: 1.53,
    clearcoat: 0.75,
    clearcoatRoughness: 0.08,
    normalScale: 1.15,
    aoMapIntensity: 1.15,
    envMapIntensity: 1.45,
    ...o
  }),
  starlightCrystal: () => new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.02, metalness: 0.0, transparent: true, opacity: 1.0,
    transmission: 0.98, ior: 1.55, thickness: 3.0, clearcoat: 1.0, clearcoatRoughness: 0.01,
    attenuationColor: new THREE.Color(0x90e0ef), attenuationDistance: 2.5, dispersion: 0.03, envMapIntensity: 2.0
  }),
  crystalColumn: () => new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.03, metalness: 0.0, transparent: true, opacity: 1.0,
    transmission: 0.96, ior: 1.54, thickness: 5.0, clearcoat: 1.0, clearcoatRoughness: 0.02,
    attenuationColor: new THREE.Color(0xf0faff), attenuationDistance: 4.0, dispersion: 0.02, envMapIntensity: 1.8
  }),
  massiveCoral: (repeat = 1, o = {}) => material('rockCliff', {
    repeat: repeat * 2, color: 0xff7766, emissive: 0x551122, emissiveIntensity: 0.25,
    roughness: 0.85, metalness: 0.05, normalScale: 2.0, ...o
  }),
  anemone: (color = 0xff44aa, o = {}) => new THREE.MeshPhysicalMaterial({
    color: 0xffffff, emissive: new THREE.Color(color), emissiveIntensity: 0.8,
    roughness: 0.12, metalness: 0.0, transparent: true, opacity: 1.0,
    transmission: 0.95, ior: 1.45, thickness: 2.5, clearcoat: 1.0, clearcoatRoughness: 0.05,
    attenuationColor: new THREE.Color(color), attenuationDistance: 2.0, envMapIntensity: 1.5, ...o
  }),
  seabedRock: (repeat = 2, o = {}) => material('mossyScree', {
    repeat, color: 0x1a2430, emissive: 0x05101a, emissiveIntensity: 0.5,
    roughness: 0.7, metalness: 0.15, normalScale: 1.5, envMapIntensity: 0.7, ...o
  }),
  bioluminescentPlant: (color = 0x00ffcc, o = {}) => {
    const t = textures('leafCard');
    return createBotanicalFoliageMaterial(color, t.map, {
      isTree: false, normalMap: t.normalMap, normalScale: 1.2,
      roughness: 0.2, metalness: 0.1, sssColor: new THREE.Color(color),
      shadowColor: new THREE.Color(0x002233), sssIntensity: 2.5, windIntensity: 1.2,
      emissive: new THREE.Color(color), emissiveIntensity: 1.2, ...o
    });
  },
  createBotanicalFoliageMaterial,
};

export const PhotoSurfaces = {
  grass: () => {
    const pbr = loadPBR('grass');
    return new THREE.MeshStandardMaterial({
      ...pbr,
      aoMap: _imgLoader.load('images/textures/grass_ao.jpg'),
      color: 0xffffff,
      roughness: 0.85,
    });
  },
  rock: () => {
    const pbr = loadPBR('rock');
    return new THREE.MeshStandardMaterial({
      ...pbr,
      color: 0xffffff,
      roughness: 0.92,
    });
  },
  mud: () => {
    const pbr = loadPBR('mud');
    return new THREE.MeshStandardMaterial({
      ...pbr,
      color: 0xffffff,
      roughness: 0.95,
    });
  },
  stone: () => {
    const pbr = loadPBR('stone');
    return new THREE.MeshStandardMaterial({
      ...pbr,
      color: 0xffffff,
      roughness: 0.78,
    });
  },
  marble: () => {
    const pbr = loadPBR('marble');
    return new THREE.MeshStandardMaterial({
      ...pbr,
      color: 0xffffff,
      roughness: 0.25,
      envMapIntensity: 1.8,
    });
  },
};

export function applyBotanicalWind(mat, isTree = false) {
  mat.side = THREE.DoubleSide;
  mat.shadowSide = THREE.DoubleSide;
  mat.customProgramCacheKey = () => `botanical_${isTree ? 'tree' : 'grass'}`;
  mat.onBeforeCompile = (shader) => {
    try {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uSSSColor = { value: new THREE.Color(isTree ? 0x82d835 : 0x8ce045) };
      shader.uniforms.uShadowColor = { value: new THREE.Color(isTree ? 0x1a4414 : 0x143410) };
      shader.uniforms.uSSSIntensity = { value: isTree ? 0.88 : 0.75 };
      shader.uniforms.uWindIntensity = { value: 1.0 };
      shader.uniforms.uLightDir = { value: new THREE.Vector3(0.4, 0.8, 0.5).normalize() };
      mat.userData.windShader = shader;
      mat.userData.botanicalShader = shader;

      // 1. Vertex Wind Sway & Multi-Frequency Wave Propagation
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform float uWindIntensity;
         varying vec3 vFoliageWorldPos;
         varying vec3 vFoliageWorldNormal;`
      ).replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
         #ifdef USE_INSTANCING
           vFoliageWorldNormal = normalize((modelMatrix * instanceMatrix * vec4(objectNormal, 0.0)).xyz);
         #else
           vFoliageWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);
         #endif`
      ).replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        // Per-instance world position from instanceMatrix (fixes lockstep sway on InstancedMesh)
        #ifdef USE_INSTANCING
          vec4 wPos = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vFoliageWorldPos = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
        #else
          vec4 wPos = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vFoliageWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        #endif
        float branchPhase = uTime * 2.2 + wPos.x * 0.08 + wPos.z * 0.11;
        float heightFactor = ${isTree ? 'smoothstep(1.0, 18.0, position.y)' : 'smoothstep(0.0, 1.1, position.y)'};

        // Multi-frequency organic wind gust displacement (spatial wave propagation)
        float lowFreq = (sin(branchPhase) * 0.38 + cos(branchPhase * 0.72 + wPos.y * 0.04) * 0.20);
        float midFreq = (cos(branchPhase * 2.3 + position.y * 0.30) * 0.16);
        float highFreq = (sin(branchPhase * 5.4 + position.x * 1.8 + position.z * 1.8) * 0.07);
        float gust = (lowFreq + midFreq + highFreq) * uWindIntensity;
        transformed.x += gust * heightFactor;
        transformed.z += cos(branchPhase * 0.85 + position.x * 0.15) * 0.30 * heightFactor * uWindIntensity;
        transformed.y += sin(branchPhase * 1.6 + position.z * 0.2) * 0.06 * heightFactor * uWindIntensity;
        `
      );

      // 2. Fragment Subsurface Scattering & Two-Sided Wrap Lighting
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uSSSColor;
         uniform vec3 uShadowColor;
         uniform float uSSSIntensity;
         uniform vec3 uLightDir;
         varying vec3 vFoliageWorldPos;
         varying vec3 vFoliageWorldNormal;`
      ).replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
         // 1. Double-sided geometric normal orientation
         vec3 lightDir = normalize(uLightDir);
         vec3 viewDir = normalize(cameraPosition - vFoliageWorldPos);
         vec3 norm = normalize(vFoliageWorldNormal);
         if (!gl_FrontFacing) norm = -norm;

         // 2. Forward Mie Chlorophyll Transmission (intense warm glow when backlit by the sun)
         float forwardScatter = max(0.0, dot(viewDir, -lightDir));
         float mieTransmission = pow(forwardScatter, 2.6) * uSSSIntensity * 1.55;

         // 3. Transverse Subsurface Wrap Diffuse Lighting (prevents black shadowed leaf cards)
         float nDotL = dot(norm, lightDir);
         float wrapDiffuse = clamp((nDotL + 0.48) / 1.48, 0.0, 1.0);
         float backWrap = clamp((-nDotL + 0.38) / 1.38, 0.0, 1.0) * 0.70;
         float totalWrap = mix(wrapDiffuse, backWrap, 0.38);

         // 4. Canopy Internal Ambient Radiance (soft diffuse bounce from sky & grass)
         float skyUp = clamp(norm.y * 0.5 + 0.5, 0.0, 1.0);
         vec3 internalRadiance = uSSSColor * (0.24 + 0.16 * skyUp);

         // 5. Chlorophyll Radiance & Translucent Vein Synthesis
         vec3 chlorophyllGlow = uSSSColor * (mieTransmission * 1.15 + totalWrap * 0.82 * uSSSIntensity);

         // 6. Deep Shadow Preservation (keeps shadows in lush emerald/forest tones instead of mud or black)
         vec3 shadowEmerald = uShadowColor * 0.44;
         gl_FragColor.rgb = max(gl_FragColor.rgb * (totalWrap * 0.85 + 0.25), shadowEmerald) + (chlorophyllGlow + internalRadiance) * gl_FragColor.rgb;
        `
      );
    } catch (e) {
      console.log('[materials] applyBotanicalWind onBeforeCompile fallback:', e);
    }
  };
  return mat;
}

/** Factory for high-end botanical foliage with two-sided wrap lighting (Subsurface Scattering) & wind sway. */
export function createBotanicalFoliageMaterial(color = 0x3d7045, alphaMap = null, options = {}) {
  const opts = typeof options === 'boolean' ? { isTree: options } : (options || {});
  const {
    isTree = true,
    roughness = 0.74,
    metalness = 0.02,
    normalMap = null,
    normalScale = 1.0,
    sssColor = new THREE.Color(isTree ? 0x90e838 : 0x8ce045),
    shadowColor = new THREE.Color(isTree ? 0x143810 : 0x143410),
    sssIntensity = isTree ? 1.15 : 0.90,
    windIntensity = 1.0,
    ...rest
  } = opts;

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    map: alphaMap || null,
    roughness,
    metalness,
    alphaTest: alphaMap ? 0.35 : 0.0,
    alphaToCoverage: !!alphaMap,
    transparent: false,
    depthWrite: true,
    side: THREE.DoubleSide,
    shadowSide: THREE.DoubleSide,
    ...rest,
  });

  if (normalMap) {
    mat.normalMap = normalMap;
    mat.normalScale = new THREE.Vector2(normalScale, normalScale);
  }

  mat.side = THREE.DoubleSide;
  mat.shadowSide = THREE.DoubleSide;
  mat.customProgramCacheKey = () => `botanical_${isTree ? 'tree' : 'grass'}_${(typeof sssIntensity === 'number' ? sssIntensity : 0.88).toFixed(2)}`;

  mat.onBeforeCompile = (shader) => {
    try {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uSSSColor = { value: sssColor instanceof THREE.Color ? sssColor : new THREE.Color(sssColor) };
      shader.uniforms.uShadowColor = { value: shadowColor instanceof THREE.Color ? shadowColor : new THREE.Color(shadowColor) };
      shader.uniforms.uSSSIntensity = { value: sssIntensity };
      shader.uniforms.uWindIntensity = { value: windIntensity };
      shader.uniforms.uLightDir = { value: new THREE.Vector3(0.4, 0.8, 0.5).normalize() };
      mat.userData.windShader = shader;
      mat.userData.botanicalShader = shader;

      // 1. Vertex Wind Sway & Wave Propagation
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform float uWindIntensity;
         varying vec3 vFoliageWorldPos;
         varying vec3 vFoliageWorldNormal;`
      ).replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
         #ifdef USE_INSTANCING
           vFoliageWorldNormal = normalize((modelMatrix * instanceMatrix * vec4(objectNormal, 0.0)).xyz);
         #else
           vFoliageWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);
         #endif`
      ).replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 wPos = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vFoliageWorldPos = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
        #else
          vec4 wPos = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vFoliageWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        #endif
        float branchPhase = uTime * 2.2 + wPos.x * 0.08 + wPos.z * 0.11;
        float heightFactor = ${isTree ? 'smoothstep(1.0, 18.0, position.y)' : 'smoothstep(0.0, 1.1, position.y)'};

        // Highly Realistic Multi-frequency organic wind gust displacement (fluid dynamics inspired)
        float lowFreq = sin(branchPhase) * 0.4 + cos(branchPhase * 0.72 + wPos.y * 0.05) * 0.25;
        float midFreq = cos(branchPhase * 2.3 + position.y * 0.35) * 0.18;
        float highFreq = sin(branchPhase * 5.7 + position.x * 2.1 + position.z * 2.1) * 0.09;
        float flutter = sin(uTime * 12.0 + position.x * 10.0 + position.y * 10.0) * 0.03;
        
        float gust = (lowFreq + midFreq + highFreq + flutter) * uWindIntensity;
        
        // Non-linear bending for more organic response
        float bendFactor = pow(heightFactor, 1.2);
        
        transformed.x += gust * bendFactor;
        transformed.z += cos(branchPhase * 0.85 + position.x * 0.15) * 0.35 * bendFactor * uWindIntensity;
        transformed.y += sin(branchPhase * 1.6 + position.z * 0.2) * 0.08 * bendFactor * uWindIntensity;
        
        // Preserve length approximately
        vec3 displaced = transformed;
        float origLen = length(position);
        float newLen = length(displaced);
        transformed = mix(displaced, displaced * (origLen / (newLen + 0.0001)), bendFactor);
        `
      );

      // 2. Fragment Subsurface Scattering & Two-Sided Wrap Lighting
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uSSSColor;
         uniform vec3 uShadowColor;
         uniform float uSSSIntensity;
         uniform vec3 uLightDir;
         varying vec3 vFoliageWorldPos;
         varying vec3 vFoliageWorldNormal;`
      ).replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
         // 1. Double-sided geometric normal orientation
         vec3 lightDir = normalize(uLightDir);
         vec3 viewDir = normalize(cameraPosition - vFoliageWorldPos);
         vec3 norm = normalize(vFoliageWorldNormal);
         if (!gl_FrontFacing) norm = -norm;

         // 2. Forward Mie Chlorophyll Transmission (intense warm glow when backlit by the sun)
         float forwardScatter = max(0.0, dot(viewDir, -lightDir));
         float mieTransmission = pow(forwardScatter, 2.6) * uSSSIntensity * 1.55;

         // 3. Transverse Subsurface Wrap Diffuse Lighting (prevents black shadowed leaf cards)
         float nDotL = dot(norm, lightDir);
         float wrapDiffuse = clamp((nDotL + 0.48) / 1.48, 0.0, 1.0);
         float backWrap = clamp((-nDotL + 0.38) / 1.38, 0.0, 1.0) * 0.70;
         float totalWrap = mix(wrapDiffuse, backWrap, 0.38);

         // 4. Canopy Internal Ambient Radiance (soft diffuse bounce from sky & grass)
         float skyUp = clamp(norm.y * 0.5 + 0.5, 0.0, 1.0);
         vec3 internalRadiance = uSSSColor * (0.24 + 0.16 * skyUp);

         // 5. Chlorophyll Radiance & Translucent Vein Synthesis
         vec3 chlorophyllGlow = uSSSColor * (mieTransmission * 1.15 + totalWrap * 0.82 * uSSSIntensity);

         // 6. Deep Shadow Preservation (keeps shadows in lush emerald/forest tones instead of mud or black)
         vec3 shadowEmerald = uShadowColor * 0.44;
         gl_FragColor.rgb = max(gl_FragColor.rgb * (totalWrap * 0.85 + 0.25), shadowEmerald) + (chlorophyllGlow + internalRadiance) * gl_FragColor.rgb;
        `
      );
    } catch (e) {
      console.log('[materials] createBotanicalFoliageMaterial onBeforeCompile fallback:', e);
    }
  };

  return mat;
}

/** The animated normal map the Water object needs. */
export function waterNormalTexture() {
  const t = textures('waterNormals');
  const tex = t.normalMap.clone();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.needsUpdate = true;
  return tex;
}

/** The dancing caustics and light refraction texture for shallow waters. */
export function waterCausticsTexture() {
  const t = textures('waterCaustics');
  const tex = (t.normalMap || t.map).clone();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.needsUpdate = true;
  return tex;
}

export function clearCache() {
  for (const t of texCache.values()) {
    if (t.map) t.map.dispose();
    if (t.normalMap) t.normalMap.dispose();
    if (t.roughnessMap) t.roughnessMap.dispose();
    if (t.aoMap) t.aoMap.dispose();
    if (t.isTexture) t.dispose();
  }
  texCache.clear();
  
  for (const pbr of _pbrCache.values()) {
    if (pbr.map) pbr.map.dispose();
    if (pbr.normalMap) pbr.normalMap.dispose();
    if (pbr.roughnessMap) pbr.roughnessMap.dispose();
    if (pbr.aoMap) pbr.aoMap.dispose();
  }
  _pbrCache.clear();
  for (const m of matCache.values()) {
    if (m.dispose) m.dispose();
  }
  matCache.clear();
}

export { fbmTile, paint, normalFromHeight, heightField, toTexture };
