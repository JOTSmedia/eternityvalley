// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — World geometry & plots
// Single source of truth shared by the 3D engine, 2D map & UI.
// Coordinates: x = east(+), z = south(+). Gate sits at south (z≈900).
// The Rainbow River flows from Mirror Lake through the valley
// heart, crossed by the Rainbow Bridge on the Grand Boulevard.
// ============================================================

// ---------- Seeded RNG (deterministic world) ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const WORLD_SEED = 20260707;

// ---------- Value noise ----------
function hash2(x, y) {
  let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}
function smooth(t) { return t * t * (3 - 2 * t); }
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 3) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += amp * noise2(x * f, y * f); amp *= 0.5; f *= 2.1; }
  return v;
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function sstep(a, b, t) { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
function dist(x1, z1, x2, z2) { return Math.hypot(x1 - x2, z1 - z2); }

// ---------- Key world constants ----------
export const WORLD = {
  size: 2000,
  waterLevel: -2.0,
  gate: { x: 0, z: 880 },
  plaza: { x: 0, z: 20, r: 62 },
  bridge: { x: 0, z: 230 },          // the Rainbow Bridge
  lake: { x: 430, z: -260, r: 295 },
  summit: { x: -520, z: -470 },
};

// The Rainbow River: Mirror Lake → valley heart → SW meadow pond
export const RIVER = [
  [165, -70], [110, 40], [50, 140], [0, 230], [-70, 300],
  [-190, 350], [-360, 400], [-520, 435],
];
export function distToRiver(x, z) {
  let best = Infinity;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [x1, z1] = RIVER[i], [x2, z2] = RIVER[i + 1];
    const dx = x2 - x1, dz = z2 - z1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - (x1 + dx * t), z - (z1 + dz * t)));
  }
  return best;
}

// ---------- Terrain height ----------
export function terrainHeight(x, z) {
  const r = Math.hypot(x, z);
  const ang = Math.atan2(z, x);

  // Ring of mountains around the valley, with a pass at the south gate
  const ridgeNoise = 0.65 + 0.7 * noise2(Math.cos(ang) * 3 + 10, Math.sin(ang) * 3 + 10);
  let mountains = sstep(660, 1000, r) * 300 * ridgeNoise;
  // South pass (gate corridor): carve the ridge down near x≈0, z>0
  const passFactor = sstep(60, 260, Math.abs(x)) ;
  if (z > 300) mountains *= (0.12 + 0.88 * passFactor);

  // NW highlands for Summit Rest (terraced feel added by renderer)
  const hl = Math.exp(-Math.pow(dist(x, z, WORLD.summit.x, WORLD.summit.z) / 330, 2)) * 95;

  // Lake basin
  const dl = dist(x, z, WORLD.lake.x, WORLD.lake.z);
  const basin = -sstep(WORLD.lake.r + 90, WORLD.lake.r - 120, dl) * 14;

  // Rainbow River channel (carved from lake to SW)
  const dRiver = distToRiver(x, z);
  const channel = -sstep(36, 4, dRiver) * 9;

  // Gentle rolling ground + subtle dunes in the SW desert
  let rolling = (fbm(x * 0.004 + 5, z * 0.004 + 5, 3) - 0.5) * 14;
  if (x < -220 && z > 180) rolling += (fbm(x * 0.012, z * 0.012, 2) - 0.5) * 10; // dunes

  // Flatten the ceremonial corridor & plaza
  const roadFlat = sstep(90, 20, Math.abs(x)) * sstep(950, 200, Math.abs(z - 500)) ;
  const plazaFlat = sstep(WORLD.plaza.r + 60, WORLD.plaza.r - 10, dist(x, z, WORLD.plaza.x, WORLD.plaza.z));
  let h = mountains + hl + basin + rolling;
  h = h * (1 - 0.85 * clamp(roadFlat + plazaFlat, 0, 1));
  return h + channel; // river survives the boulevard flattening (bridge spans it)
}
export function isUnderWater(x, z) {
  return terrainHeight(x, z) < WORLD.waterLevel;
}

// ---------- Districts ----------
export const DISTRICTS = {
  meadows:  { key: 'meadows',  name: 'Memorial Meadows',  base: 249, color: '#7fae6e',
              blurb: 'Classic garden cemetery. Rolling lawns, old oaks and wrought-iron fences along the grand boulevard.' },
  woodland: { key: 'woodland', name: 'Whispering Pines',  base: 299, color: '#4e7d54',
              blurb: 'A quiet pine forest north of the plaza. Dappled light, ferns and birdsong.' },
  lakefront:{ key: 'lakefront',name: 'Lakeside Rest',     base: 449, color: '#5f93b8',
              blurb: 'Grassy west shore of Mirror Lake. Willows lean over still water.' },
  beach:    { key: 'beach',    name: 'Golden Shores',     base: 499, color: '#d9bd7f',
              blurb: 'The sandy eastern shore. Warm sand, sea-grass and gentle waves.' },
  summit:   { key: 'summit',   name: 'Summit Rest',       base: 599, color: '#9b8ea3',
              blurb: 'Terraced plots high on the northwest slopes, above the morning mist.' },
  desert:   { key: 'desert',   name: 'Desert Bloom',      base: 199, color: '#c8a468',
              blurb: 'A serene high-desert garden in the mountains’ rain shadow. Saguaros and blooming ocotillo.' },
};

// ---------- Roads (polylines, in world coords) ----------
export const ROADS = [
  { name: 'Grand Boulevard', w: 26, pts: [[0, 880], [0, 620], [0, 400], [0, 230], [0, 84]] },
  { name: 'Plaza Ring',      w: 14, ring: true, cx: WORLD.plaza.x, cz: WORLD.plaza.z, r: WORLD.plaza.r },
  { name: 'Lakeshore Way',   w: 12, pts: [[44, -4], [180, -50], [300, -100], [360, -170], [380, -290], [440, -440], [520, -520]] },
  { name: 'Shoreline Path',  w: 10, pts: [[520, -520], [650, -440], [730, -300], [740, -140], [690, -20], [600, 40]] },
  { name: 'Summit Ascent',   w: 12, pts: [[-52, -8], [-180, -70], [-300, -150], [-360, -250], [-460, -340], [-520, -420]] },
  { name: 'Pinewood Lane',   w: 12, pts: [[0, -42], [-40, -180], [-20, -340], [20, -500], [0, -620]] },
  { name: 'Desert Trail',    w: 12, pts: [[-16, 560], [-160, 490], [-320, 450], [-460, 390], [-560, 300]] },
  { name: 'Meadow Row E',    w: 8,  pts: [[18, 480], [150, 440], [260, 380]] },
  { name: 'Meadow Row W',    w: 8,  pts: [[-30, 500], [-160, 470], [-280, 420]] },
];

export function distToRoads(x, z) {
  let best = Infinity;
  for (const r of ROADS) {
    if (r.ring) {
      best = Math.min(best, Math.abs(dist(x, z, r.cx, r.cz) - r.r));
      continue;
    }
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [x1, z1] = r.pts[i], [x2, z2] = r.pts[i + 1];
      const dx = x2 - x1, dz = z2 - z1;
      const t = clamp(((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz), 0, 1);
      best = Math.min(best, dist(x, z, x1 + dx * t, z1 + dz * t));
    }
  }
  return best;
}

// ---------- Pet memorial flavor (for pre-occupied plots) ----------
const PET_NAMES = ['Max','Bella','Charlie','Luna','Rocky','Daisy','Buddy','Molly','Jack','Sadie','Toby','Chloe','Bear','Lola','Duke','Zoe','Oreo','Ruby','Gizmo','Penny','Shadow','Rosie','Simba','Maggie','Oscar','Coco','Rex','Willow','Bandit','Pepper','Whiskers','Ginger','Felix','Misty','Boots','Cleo','Milo','Nala','Thumper','Goldie'];
// Weighted toward dogs and cats, as real pet cemeteries are. Labels
// only — the icon is resolved from the label by icons.js/speciesKey.
const SPECIES = ['Dog', 'Dog', 'Dog', 'Cat', 'Cat', 'Rabbit', 'Bird', 'Horse', 'Hamster', 'Fish', 'Turtle', 'Guinea Pig'];
const EPITAPHS = [
  'Forever chasing sunbeams.','The best boy there ever was.','Softest paws, biggest heart.',
  'Until we meet at the rainbow bridge.','You were my favorite hello and my hardest goodbye.',
  'A loyal friend rests here.','Small paws leave the deepest prints.','Run free, sweet soul.',
  'The house is quiet without you.','Good night, little hunter.','Always in our hearts.',
  'Thank you for every wag.','Purring somewhere beyond the stars.','Our sunshine on four legs.',
];

// ---------- Plot generation ----------
function districtRegions() {
  // Each region: anchor grid rows of plots. rows: [startX, startZ, cols, rows, dx, dz, rowStagger]
  return {
    meadows: [
      { x0: -270, z0: 260, cols: 12, rows: 6, dx: 44, dz: 52 },
      { x0: 60,   z0: 260, cols: 12, rows: 6, dx: 44, dz: 52 },
      { x0: -240, z0: 590, cols: 9,  rows: 4, dx: 46, dz: 54 },
      { x0: 90,   z0: 590, cols: 9,  rows: 4, dx: 46, dz: 54 },
    ],
    woodland: [
      { x0: -170, z0: -560, cols: 7, rows: 6, dx: 52, dz: 58 },
      { x0: 90,   z0: -560, cols: 5, rows: 5, dx: 54, dz: 60 },
    ],
    lakefront: [
      { x0: 30,  z0: -430, cols: 3, rows: 9, dx: 38, dz: 44 },  // west shore
      { x0: 200, z0: 66,   cols: 6, rows: 3, dx: 44, dz: 42 },  // south shore
    ],
    beach: [
      { x0: 560, z0: 96,  cols: 6, rows: 3, dx: 44, dz: 44 },   // SE sandy shore
      { x0: 660, z0: -80, cols: 3, rows: 5, dx: 40, dz: 46 },   // east shore
    ],
    summit: [
      { x0: -640, z0: -560, cols: 6, rows: 5, dx: 48, dz: 54 },
      { x0: -450, z0: -260, cols: 4, rows: 4, dx: 48, dz: 52 },
    ],
    desert: [
      { x0: -620, z0: 220, cols: 7, rows: 5, dx: 50, dz: 56 },
      { x0: -400, z0: 470, cols: 6, rows: 4, dx: 50, dz: 56 },
    ],
  };
}

export function generatePlots() {
  const rng = mulberry32(WORLD_SEED);
  const plots = [];
  const regions = districtRegions();
  const counters = {};

  for (const [dk, regs] of Object.entries(regions)) {
    const d = DISTRICTS[dk];
    counters[dk] = 0;
    for (const rg of regs) {
      for (let r = 0; r < rg.rows; r++) {
        for (let c = 0; c < rg.cols; c++) {
          const jx = (rng() - 0.5) * 10, jz = (rng() - 0.5) * 10;
          const x = rg.x0 + c * rg.dx + jx + (r % 2 ? rg.dx * 0.35 : 0);
          const z = rg.z0 + r * rg.dz + jz;
          const h = terrainHeight(x, z);
          // reject: underwater, too steep (mountain), on a road, in plaza
          if (h < WORLD.waterLevel + 1.5) continue;
          if (h > 120 && dk !== 'summit') continue;
          if (dk === 'summit' && h > 150) continue;
          const dr = distToRoads(x, z);
          if (dr < 12) continue;
          if (dist(x, z, WORLD.plaza.x, WORLD.plaza.z) < WORLD.plaza.r + 24) continue;
          const dLake = dist(x, z, WORLD.lake.x, WORLD.lake.z) - WORLD.lake.r;
          if ((dk === 'lakefront' || dk === 'beach') && dLake < 8) continue;

          counters[dk]++;
          const num = counters[dk];
          const roll = rng();
          const size = roll > 0.9 ? 'estate' : roll > 0.65 ? 'premium' : 'standard';
          const sizeMult = size === 'estate' ? 2.8 : size === 'premium' ? 1.6 : 1;

          let price = d.base * sizeMult;
          if (dLake > 0 && dLake < 70) price *= 1.3;                          // waterfront
          if (dist(x, z, WORLD.plaza.x, WORLD.plaza.z) < 220) price *= 1.15;  // near plaza
          if (dr < 26) price *= 1.08;                                          // road access
          if (dk === 'summit' && h > 60) price *= 1.2;                        // view premium
          price = Math.round(price / 10) * 10 - 1;                            // $xx9

          const occupied = rng() < 0.34;
          let memorial = null, decor = [];
          if (occupied) {
            const species = SPECIES[Math.floor(rng() * SPECIES.length)];
            const born = 2005 + Math.floor(rng() * 14);
            const died = born + 4 + Math.floor(rng() * 14);
            memorial = {
              petName: PET_NAMES[Math.floor(rng() * PET_NAMES.length)],
              species,
              years: `${born} – ${Math.min(died, 2026)}`,
              epitaph: EPITAPHS[Math.floor(rng() * EPITAPHS.length)],
              owner: 'A loving family',
              gifts: Math.floor(rng() * 18),
            };
            const styles = ['classic', 'obelisk', 'heart', 'slab', 'statue'];
            decor.push({ type: 'headstone', style: styles[Math.floor(rng() * styles.length)] });
            if (rng() > 0.4) decor.push({ type: 'flowers' });
            if (rng() > 0.7) decor.push({ type: 'tree' });
            if (rng() > 0.8) decor.push({ type: 'bench' });
            if (rng() > 0.85) decor.push({ type: 'lantern' });
          }

          plots.push({
            id: `${dk.slice(0, 2).toUpperCase()}-${String(num).padStart(3, '0')}`,
            district: dk, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10,
            h: Math.round(h * 100) / 100,
            rot: Math.atan2(WORLD.plaza.x - x, WORLD.plaza.z - z),
            size, price, status: occupied ? 'occupied' : 'available',
            memorial, decor,
          });
        }
      }
    }
  }
  return plots;
}

export const SIZE_LABELS = { standard: 'Standard Plot', premium: 'Premium Plot', estate: 'Estate Plot' };
export const SIZE_DIMS = { standard: [10, 14], premium: [14, 18], estate: [20, 26] };
