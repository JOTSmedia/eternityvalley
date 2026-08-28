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
function smooth(t) { return t * t * (3 - 2 * t); }

function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smooth(xf), v = smooth(yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** Tiling fbm: wraps cleanly at `period` so textures repeat seamlessly. */
function fbmTile(x, y, period, octaves = 5, seed = 1, gain = 0.5, lac = 2) {
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
 * differences. This is what turns a flat painted texture into
 * something that catches light like real relief.
 */
function normalFromHeight(size, h, strength = 2.4) {
  const wrap = (v) => (v + size) % size;
  return paint(size, (x, y) => {
    const l = h[wrap(y) * size + wrap(x - 1)];
    const r = h[wrap(y) * size + wrap(x + 1)];
    const u = h[wrap(y - 1) * size + wrap(x)];
    const dn = h[wrap(y + 1) * size + wrap(x)];
    const nx = (l - r) * strength;
    const ny = (u - dn) * strength;
    const nz = 1;
    const len = Math.hypot(nx, ny, nz) || 1;
    return [
      Math.round((nx / len * 0.5 + 0.5) * 255),
      Math.round((ny / len * 0.5 + 0.5) * 255),
      Math.round((nz / len * 0.5 + 0.5) * 255),
    ];
  });
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
function tint(base, k) { return [clamp255(base[0] * k), clamp255(base[1] * k), clamp255(base[2] * k)]; }

// ---------------------------------------------------------------
// Texture recipes
// Each returns { map, normalMap, roughnessMap?, aoMap? } of canvases.
// ---------------------------------------------------------------
const RECIPES = {
  /** Weathered limestone ashlar — the bridge, the gate, the plaza. */
  limestone(size = 512) {
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
      const grain = fbmTile(u * 9, v * 9, 9, 5, seed) * 0.35;
      const pit = Math.pow(fbmTile(u * 34, v * 34, 34, 3, seed + 5), 6) * 0.5;
      return jointDepth * (0.62 + grain) - pit;
    });
    const map = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      const grain = fbmTile(u * 16, v * 16, 16, 4, seed + 2);
      const stain = Math.pow(fbmTile(u * 3.2, v * 3.2, 3, 4, seed + 9), 2.1);
      const base = [206, 197, 174];
      const c = tint(base, 0.62 + hv * 0.42 + grain * 0.13 - stain * 0.2);
      // faint warm lichen in the damp joints
      const lichen = Math.max(0, 0.55 - hv) * Math.pow(fbmTile(u * 7, v * 7, 7, 3, seed + 21), 3) * 1.6;
      return [clamp255(c[0] - lichen * 34), clamp255(c[1] - lichen * 12), clamp255(c[2] - lichen * 40)];
    });
    const rough = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      const g = clamp255(200 - hv * 45 + fbmTile(u * 22, v * 22, 22, 3, seed + 3) * 40);
      return [g, g, g];
    });
    const ao = paint(size, (x, y) => {
      const g = clamp255(120 + h[y * size + x] * 150);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 3.4), rough, ao };
  },

  /** Polished veined marble — headstones, statuary, fountains. */
  marble(size = 512) {
    const seed = 31;
    // Real marble veining is fractal: a few broad seams, each broken up
    // by finer ones running at their own angle. A single warped sine
    // reads as drawn lines, so three scales are layered and the sharp
    // ones are masked by the broad ones.
    const seam = (u, v, freq, ang, warpAmt, sharp, s) => {
      const warp = fbmTile(u * freq * 0.6, v * freq * 0.6, Math.max(2, Math.round(freq * 0.6)), 5, s) * warpAmt;
      const t = Math.sin((u * freq * Math.cos(ang) + v * freq * Math.sin(ang) + warp) * Math.PI);
      return Math.pow(1 - Math.abs(t), sharp);
    };
    const veinField = (u, v) => {
      const broad = seam(u, v, 2.2, 0.6, 2.6, 5, seed);
      const mid = seam(u, v, 5.5, 1.1, 2.0, 11, seed + 41) * (0.35 + broad * 0.9);
      const fine = seam(u, v, 13.0, 0.4, 1.4, 22, seed + 83) * (0.15 + broad * 0.7);
      return Math.min(1, broad * 0.55 + mid * 0.7 + fine * 0.5);
    };
    const h = heightField(size, (x, y, u, v) => 0.5 + veinField(u, v) * 0.08 + fbmTile(u * 40, v * 40, 40, 2, seed + 3) * 0.05);
    const map = paint(size, (x, y, u, v) => {
      const vein = veinField(u, v);
      const mottle = fbmTile(u * 6, v * 6, 6, 5, seed + 7);
      const warmth = fbmTile(u * 2.4, v * 2.4, 2, 4, seed + 63);       // cream drifts
      const base = [234, 229, 219];
      const c = tint(base, 0.93 + mottle * 0.09);
      // Veins run cool grey-taupe and stay soft-edged; the warm drift
      // keeps the stone from reading as flat white.
      return [
        clamp255(c[0] - vein * 74 + warmth * 8),
        clamp255(c[1] - vein * 70 + warmth * 4),
        clamp255(c[2] - vein * 58 - warmth * 5),
      ];
    });
    const rough = paint(size, (x, y, u, v) => {
      const g = clamp255(58 + fbmTile(u * 12, v * 12, 12, 3, seed + 11) * 34 + veinField(u, v) * 40);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 1.1), rough };
  },

  /** Speckled granite — the classic headstone. */
  granite(size = 512) {
    const seed = 47;
    const h = heightField(size, (x, y, u, v) =>
      0.5 + fbmTile(u * 60, v * 60, 60, 3, seed) * 0.35 + fbmTile(u * 140, v * 140, 140, 2, seed + 4) * 0.15);
    const map = paint(size, (x, y, u, v) => {
      const grain = fbmTile(u * 70, v * 70, 70, 2, seed + 1);
      const fleck = Math.pow(fbmTile(u * 150, v * 150, 150, 2, seed + 6), 8);
      const feldspar = Math.pow(fbmTile(u * 46, v * 46, 46, 2, seed + 12), 5);
      const base = [128, 128, 136];
      let c = tint(base, 0.62 + grain * 0.55);
      c = [c[0] + feldspar * 70, c[1] + feldspar * 60, c[2] + feldspar * 52];   // pink feldspar
      const k = fleck * 90;                                                     // dark mica
      return [clamp255(c[0] - k), clamp255(c[1] - k), clamp255(c[2] - k * 0.8)];
    });
    const rough = paint(size, (x, y, u, v) => {
      const g = clamp255(96 + fbmTile(u * 90, v * 90, 90, 2, seed + 2) * 70);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 1.5), rough };
  },

  /** Ridged bark. */
  bark(size = 512) {
    const seed = 63;
    const ridge = (u, v) => {
      const warp = fbmTile(u * 4, v * 1.6, 4, 4, seed) * 1.4;
      const s = Math.sin((u * 26 + warp) * Math.PI);
      return Math.pow(Math.abs(s), 0.55);
    };
    const h = heightField(size, (x, y, u, v) =>
      ridge(u, v) * 0.7 + fbmTile(u * 30, v * 12, 30, 4, seed + 3) * 0.3);
    const map = paint(size, (x, y, u, v) => {
      const hv = h[y * size + x];
      const moss = Math.pow(fbmTile(u * 5, v * 5, 5, 4, seed + 17), 3.5);
      const base = [92, 68, 47];
      const c = tint(base, 0.5 + hv * 0.85);
      return [clamp255(c[0] - moss * 40), clamp255(c[1] + moss * 26), clamp255(c[2] - moss * 30)];
    });
    const rough = paint(size, () => [225, 225, 225]);
    return { map, normal: normalFromHeight(size, h, 3.8), rough };
  },

  /** Close-up meadow grass, for terrain detail. */
  grass(size = 512) {
    const seed = 83;
    const h = heightField(size, (x, y, u, v) => {
      const blades = Math.abs(Math.sin((u * 90 + fbmTile(u * 8, v * 8, 8, 3, seed) * 6) * Math.PI));
      return blades * 0.45 + fbmTile(u * 24, v * 24, 24, 4, seed + 2) * 0.55;
    });
    const map = paint(size, (x, y, u, v) => {
      const clump = fbmTile(u * 7, v * 7, 7, 5, seed + 5);
      const blade = h[y * size + x];
      const dry = Math.pow(fbmTile(u * 3.5, v * 3.5, 3, 4, seed + 9), 2.4);
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
  groundDetail(size = 512) {
    const seed = 313;
    // Strictly isotropic. An earlier version added a sin() "blades"
    // term, which is correct for grass seen from standing height but
    // becomes directional streaking once the texture is tiled ~100
    // times across the valley — it moirés into visible corduroy on
    // every slope. Only noise, at several scales, survives tiling.
    const h = heightField(size, (x, y, u, v) => {
      const clump = fbmTile(u * 5, v * 5, 5, 5, seed);
      const tuft = fbmTile(u * 21, v * 21, 21, 4, seed + 2);
      const grain = fbmTile(u * 78, v * 78, 78, 3, seed + 5);
      return clump * 0.52 + tuft * 0.30 + grain * 0.18;
    });
    const map = paint(size, (x, y, u, v) => {
      // three scales of patchiness, so it never reads as one tiling cell
      const broad = fbmTile(u * 2.5, v * 2.5, 2, 4, seed + 11);
      const mid = fbmTile(u * 11, v * 11, 11, 4, seed + 13);
      const fine = fbmTile(u * 46, v * 46, 46, 3, seed + 17);
      const wear = Math.pow(fbmTile(u * 4, v * 4, 4, 4, seed + 23), 3) * 0.35;
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
  sand(size = 512) {
    const seed = 97;
    const h = heightField(size, (x, y, u, v) => {
      const ripple = Math.sin((v * 30 + fbmTile(u * 4, v * 4, 4, 3, seed) * 8) * Math.PI) * 0.5 + 0.5;
      return ripple * 0.42 + fbmTile(u * 70, v * 70, 70, 3, seed + 2) * 0.58;
    });
    const map = paint(size, (x, y, u, v) => {
      const grain = fbmTile(u * 120, v * 120, 120, 2, seed + 3);
      const hv = h[y * size + x];
      return tint([214, 190, 146], 0.82 + grain * 0.22 + hv * 0.16);
    });
    const rough = paint(size, () => [232, 232, 232]);
    return { map, normal: normalFromHeight(size, h, 1.6), rough };
  },

  /** Two-octave moving water normals for the lake and river. */
  waterNormals(size = 512) {
    const seed = 131;
    const h = heightField(size, (x, y, u, v) => {
      const a = Math.sin((u * 6 + fbmTile(u * 3, v * 3, 3, 3, seed) * 3) * Math.PI * 2);
      const b = Math.sin((v * 9 - u * 2 + fbmTile(u * 5, v * 5, 5, 3, seed + 4) * 4) * Math.PI * 2);
      return 0.5 + a * 0.22 + b * 0.16 + fbmTile(u * 26, v * 26, 26, 3, seed + 8) * 0.24;
    });
    return { normal: normalFromHeight(size, h, 1.5) };
  },

  /** Cast bronze / weathered gold, for finials and lettering. */
  bronze(size = 256) {
    const seed = 149;
    const h = heightField(size, (x, y, u, v) =>
      0.5 + fbmTile(u * 26, v * 26, 26, 4, seed) * 0.5);
    const map = paint(size, (x, y, u, v) => {
      const patina = Math.pow(fbmTile(u * 6, v * 6, 6, 4, seed + 3), 2.6);
      const wear = fbmTile(u * 18, v * 18, 18, 3, seed + 7);
      const base = [176, 141, 72];
      const c = tint(base, 0.74 + wear * 0.4);
      // verdigris settles into the recesses
      return [clamp255(c[0] - patina * 96), clamp255(c[1] - patina * 20), clamp255(c[2] + patina * 44)];
    });
    const rough = paint(size, (x, y, u, v) => {
      const patina = Math.pow(fbmTile(u * 6, v * 6, 6, 4, seed + 3), 2.6);
      const g = clamp255(64 + patina * 150 + fbmTile(u * 30, v * 30, 30, 2, seed + 1) * 30);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 1.0), rough };
  },

  /** Wrought iron — gates, railings. */
  iron(size = 256) {
    const seed = 167;
    const h = heightField(size, (x, y, u, v) =>
      0.5 + fbmTile(u * 34, v * 34, 34, 4, seed) * 0.45);
    const map = paint(size, (x, y, u, v) => {
      const rust = Math.pow(fbmTile(u * 5, v * 5, 5, 5, seed + 11), 3.4);
      const base = [38, 40, 46];
      const c = tint(base, 0.7 + fbmTile(u * 20, v * 20, 20, 3, seed + 2) * 0.6);
      return [clamp255(c[0] + rust * 120), clamp255(c[1] + rust * 54), clamp255(c[2] + rust * 18)];
    });
    const rough = paint(size, (x, y, u, v) => {
      const rust = Math.pow(fbmTile(u * 5, v * 5, 5, 5, seed + 11), 3.4);
      const g = clamp255(90 + rust * 140);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 1.4), rough };
  },

  /** Poured candle wax. */
  wax(size = 256) {
    const seed = 181;
    const h = heightField(size, (x, y, u, v) => {
      const drip = Math.pow(Math.max(0, Math.sin((u * 11 + fbmTile(u * 4, v * 2, 4, 3, seed) * 4) * Math.PI)), 3) * (1 - v);
      return 0.55 + drip * 0.4 + fbmTile(u * 20, v * 20, 20, 3, seed + 2) * 0.15;
    });
    const map = paint(size, (x, y, u, v) =>
      tint([240, 231, 205], 0.9 + fbmTile(u * 10, v * 10, 10, 3, seed + 5) * 0.14));
    const rough = paint(size, () => [130, 130, 130]);
    return { map, normal: normalFromHeight(size, h, 1.7), rough };
  },

  /** Glazed ceramic, for urns and planters. */
  ceramic(size = 256) {
    const seed = 199;
    const h = heightField(size, (x, y, u, v) =>
      0.5 + Math.pow(fbmTile(u * 44, v * 44, 44, 3, seed), 4) * 0.5);
    const map = paint(size, (x, y, u, v) =>
      tint([214, 206, 196], 0.92 + fbmTile(u * 8, v * 8, 8, 3, seed + 2) * 0.14));
    const rough = paint(size, (x, y, u, v) => {
      const g = clamp255(40 + Math.pow(fbmTile(u * 44, v * 44, 44, 3, seed), 4) * 120);
      return [g, g, g];
    });
    return { map, normal: normalFromHeight(size, h, 0.8), rough };
  },

  /** Weathered timber — benches, posts. */
  timber(size = 256) {
    const seed = 211;
    const grainAt = (u, v) => {
      const warp = fbmTile(u * 3, v * 3, 3, 3, seed) * 1.2;
      return Math.abs(Math.sin((v * 22 + warp) * Math.PI));
    };
    const h = heightField(size, (x, y, u, v) =>
      grainAt(u, v) * 0.5 + fbmTile(u * 30, v * 12, 30, 3, seed + 3) * 0.5);
    const map = paint(size, (x, y, u, v) => {
      const g = grainAt(u, v);
      const knot = Math.pow(fbmTile(u * 4, v * 4, 4, 4, seed + 8), 5);
      const c = tint([116, 88, 62], 0.62 + g * 0.42);
      const k = knot * 70;
      return [clamp255(c[0] - k), clamp255(c[1] - k * 0.9), clamp255(c[2] - k * 0.7)];
    });
    const rough = paint(size, () => [218, 218, 218]);
    return { map, normal: normalFromHeight(size, h, 2.2), rough };
  },

  /** Petal / leaf surface, with visible veining. */
  foliage(size = 256) {
    const seed = 223;
    const vein = (u, v) => {
      const rib = Math.pow(1 - Math.abs(Math.sin((u - 0.5) * Math.PI)), 6);
      const side = Math.pow(Math.abs(Math.sin((v * 14 + (u - 0.5) * 8) * Math.PI)), 12);
      return Math.max(rib, side * 0.7);
    };
    const h = heightField(size, (x, y, u, v) => 0.5 + vein(u, v) * 0.5);
    const map = paint(size, (x, y, u, v) => {
      const n = fbmTile(u * 9, v * 9, 9, 4, seed);
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
};

// ---------------------------------------------------------------
// Public API
// ---------------------------------------------------------------

/**
 * Get the raw texture set for a recipe, generated once and cached.
 * @param {keyof RECIPES} name
 */
export function textures(name, size) {
  const key = `${name}@${size || 'auto'}`;
  if (texCache.has(key)) return texCache.get(key);
  const recipe = RECIPES[name];
  if (!recipe) throw new Error(`[materials] no recipe "${name}"`);
  const canvases = size ? recipe(size) : recipe();
  const out = {};
  if (canvases.map) out.map = toTexture(canvases.map, { srgb: true });
  if (canvases.normal) out.normalMap = toTexture(canvases.normal);
  if (canvases.rough) out.roughnessMap = toTexture(canvases.rough);
  if (canvases.ao) out.aoMap = toTexture(canvases.ao);
  texCache.set(key, out);
  return out;
}

/**
 * Build a MeshStandardMaterial (or Physical, for anything with a
 * clearcoat) from a recipe plus overrides.
 *
 * @param {string} name    recipe key
 * @param {object} opts    { repeat, color, roughness, metalness, physical, ...THREE material props }
 */
export function material(name, opts = {}) {
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
  if (mat.normalMap) mat.normalScale = new THREE.Vector2(normalScale, normalScale);
  matCache.set(key, mat);
  return mat;
}

/** Named, ready-to-use surfaces shared by the world and the thumbnails. */
export const Surfaces = {
  limestone: (repeat = 3) => material('limestone', { repeat, color: 0xffffff, roughness: 1, metalness: 0, normalScale: 1.1, aoMapIntensity: 0.8 }),
  limestoneDark: (repeat = 3) => material('limestone', { repeat, color: 0xb4ab97, roughness: 1, metalness: 0, normalScale: 1.2 }),
  marble: (repeat = 1) => material('marble', { repeat, color: 0xffffff, roughness: 0.28, metalness: 0.04, physical: true, clearcoat: 0.65, clearcoatRoughness: 0.22, normalScale: 0.5 }),
  granite: (repeat = 1) => material('granite', { repeat, color: 0xffffff, roughness: 0.55, metalness: 0.06, physical: true, clearcoat: 0.35, clearcoatRoughness: 0.4, normalScale: 0.7 }),
  bark: (repeat = 2) => material('bark', { repeat, color: 0xffffff, roughness: 1, metalness: 0, normalScale: 1.4 }),
  grass: (repeat = 40) => material('grass', { repeat, color: 0xffffff, roughness: 1, metalness: 0, normalScale: 0.9 }),
  sand: (repeat = 30) => material('sand', { repeat, color: 0xffffff, roughness: 1, metalness: 0, normalScale: 0.8 }),
  bronze: (repeat = 1) => material('bronze', { repeat, color: 0xffffff, roughness: 0.4, metalness: 0.92, normalScale: 0.6 }),
  iron: (repeat = 1) => material('iron', { repeat, color: 0xffffff, roughness: 0.62, metalness: 0.88, normalScale: 0.8 }),
  wax: (repeat = 1) => material('wax', { repeat, color: 0xffffff, roughness: 0.5, metalness: 0, physical: true, transmission: 0.35, thickness: 1.4, ior: 1.45, normalScale: 0.7 }),
  ceramic: (repeat = 1) => material('ceramic', { repeat, color: 0xffffff, roughness: 0.2, metalness: 0, physical: true, clearcoat: 0.9, clearcoatRoughness: 0.08, normalScale: 0.4 }),
  timber: (repeat = 2) => material('timber', { repeat, color: 0xffffff, roughness: 0.82, metalness: 0, normalScale: 1.1 }),
  foliage: (repeat = 1, color = 0x5e8f4e) => material('foliage', { repeat, color, roughness: 0.72, metalness: 0, side: THREE.DoubleSide, normalScale: 0.9 }),
  petal: (repeat = 1, color = 0xf2b8cf) => material('foliage', { repeat, color, roughness: 0.55, metalness: 0, side: THREE.DoubleSide, physical: true, sheen: 0.6, sheenRoughness: 0.5, normalScale: 0.6 }),
  glass: () => new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.04, metalness: 0, transmission: 0.96,
    thickness: 0.8, ior: 1.5, transparent: true, clearcoat: 1, clearcoatRoughness: 0.02,
  }),
};

/** The animated normal map the Water object needs. */
export function waterNormalTexture() {
  const t = textures('waterNormals');
  const tex = t.normalMap.clone();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.needsUpdate = true;
  return tex;
}

export { fbmTile, paint, normalFromHeight, heightField, toTexture };
