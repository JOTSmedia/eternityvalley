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
// C2 continuous quintic Hermite polynomial: zero 1st & 2nd derivative at grid borders (eliminates boxy creases)
function smooth(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
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
export function ridgeNoise(x, y, oct = 4) {
  let sum = 0, amp = 1.0, freq = 1.0, maxAmp = 0;
  for (let i = 0; i < oct; i++) {
    const n = Math.abs(noise2(x * freq, y * freq) - 0.5) * 2.0; // V-shaped sharp arêtes
    sum += (1.0 - n) * amp;
    maxAmp += amp;
    amp *= 0.5;
    freq *= 2.02;
  }
  return sum / maxAmp;
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function sstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return smooth(t); // C2 continuous quintic Hermite interpolation: 6t^5 - 15t^4 + 10t^3
}
function dist(x1, z1, x2, z2) { return Math.hypot(x1 - x2, z1 - z2); }

// ---------- Key world constants ----------
export const WORLD = {
  size: 2000,
  waterLevel: 12.5,
  plungeLevel: 18.0,
  oceanLevel: 0.35,
  gate: { x: 0, z: 880 },
  plaza: { x: 0, z: 20, r: 62 },
  bridge: { x: 0, z: 440 },          // the Rainbow Bridge on Grand Boulevard
  lake: { x: 430, z: -260, r: 295 },
  summit: { x: -520, z: -470 },
  island: { x: 20, z: 2100, r: 340 },
  kayaIsland: { x: 20, z: 2100, r: 340 },
  cathedral: { x: 0, z: -640, y: 182.0 },
  buddhistTemple: { x: 560, z: -540, y: 135.0 },
  mosque: { x: -480, z: -200, y: 96.0 },
  templeOfBaal: { x: -110, z: 2160, y: 22.0 },
  jewishTemple: { x: -110, z: 2160, y: 22.0 }, // legacy alias
};

// The Rainbow River System:
// 1. Inlet River: Mountain Waterfall Plunge Pool (x=0, z=-360, y=18.0) → Mirror Lake Shoreline (x=145, z=-326, y=12.5)
export const RIVER_INLET = [
  [0, -360, 18.0], [45, -350, 16.5], [95, -338, 14.5], [145, -326, 12.5]
];

// 2. Outlet River: Mirror Lake Shoreline (x=236, z=-38, y=12.5) → under Rainbow Bridge (x=0, z=440, y=11.0) → Eastern Coastal Gorge (x=165, z=918, y=7.8)
export const RIVER_OUTLET = [
  [236, -38, 12.5], [180, 160, 11.9], [90, 310, 11.5], [0, 440, 11.0],
  [65, 560, 10.4], [115, 680, 9.6], [145, 800, 8.8], [160, 875, 8.3], [165, 918, 7.8]
];

export const RIVER = RIVER_OUTLET; // for backward compatibility

// Returns { dist, y } for the closest point on either river branch
export function getRiverInfo(x, z) {
  let bestDist = Infinity;
  let bestY = 12.5;
  const branches = [RIVER_INLET, RIVER_OUTLET];
  for (const branch of branches) {
    for (let i = 0; i < branch.length - 1; i++) {
      const [x1, z1, y1] = branch[i], [x2, z2, y2] = branch[i + 1];
      const dx = x2 - x1, dz = z2 - z1;
      const lenSq = dx * dx + dz * dz;
      const t = lenSq > 0 ? clamp(((x - x1) * dx + (z - z1) * dz) / lenSq, 0, 1) : 0;
      const px = x1 + dx * t, pz = z1 + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < bestDist) {
        bestDist = d;
        bestY = y1 + (y2 - y1) * t;
      }
    }
  }
  return { dist: bestDist, y: bestY };
}

export function distToRiver(x, z) {
  return getRiverInfo(x, z).dist;
}

export function riverWaterElevation(x, z) {
  return getRiverInfo(x, z).y;
}

// ---------- Majestic Glacial Cirque & Alpine Mountain Morphology ----------
export function terrainHeightBase(x, z) {
  const r = Math.hypot(x, z);

  // 1. Majestic Alpine Glacial Massif (Smooth Swiss Alpine morphology - zero Minecraft spikes)
  const massifMacro = fbm(x * 0.0012 + 15.0, z * 0.0012 + 15.0, 4);
  const alpineRidge = (1.0 - Math.abs(fbm(x * 0.0028 + 4.2, z * 0.0028 + 4.2, 4) - 0.5) * 2.0);
  const couloirErosion = Math.pow(Math.abs(fbm(x * 0.0050 + 3.1, z * 0.0050 + 3.1, 3) - 0.5) * 2.0, 1.5);
  
  // Natural rounded alpine massif domes surrounding the valley
  const domeWest = Math.exp(-Math.pow(dist(x, z, -720, -340) / 240, 2)) * 130;
  const domeEast = Math.exp(-Math.pow(dist(x, z, 680, -390) / 240, 2)) * 125;
  const domeNorthW = Math.exp(-Math.pow(dist(x, z, -220, -600) / 220, 2)) * 110;
  const domeNorthE = Math.exp(-Math.pow(dist(x, z, 220, -600) / 220, 2)) * 110;
  const domes = domeWest + domeEast + domeNorthW + domeNorthE;

  const hydraulicErosion = 0.45 + 0.65 * alpineRidge + 0.30 * massifMacro - 0.35 * couloirErosion;
  
  // Grand surrounding natural alpine massifs
  let mountains = sstep(540, 1300, r) * (180 + massifMacro * 140) * Math.max(0.15, hydraulicErosion) + domes;
  
  // 2. North Mountain Massif & Highland Cathedral Plateau (Solid bedrock backing — Zero gap behind waterfall!)
  if (z < -340) {
    // Headwall slope behind cataract from y=14.0m plunge basin at z=-360 up to y=182.0m plateau at z=-460
    const headwallDrop = sstep(-360, -460, z);
    const headwallElevation = lerp(14.0, 182.0, headwallDrop);

    // High Alpine Plateau above waterfall (z <= -460, |x| < 320)
    let plateau = 182.0;
    if (z <= -460) {
      const plateauRoll = (fbm(x * 0.005 + 8.0, z * 0.005 + 8.0, 3) - 0.5) * 5.0;
      const cathedralTerrace = Math.exp(-Math.pow(dist(x, z, WORLD.cathedral.x, WORLD.cathedral.z) / 140, 2));
      plateau = 182.0 + plateauRoll * (1.0 - cathedralTerrace * 0.95);
    }

    // Surrounding high mountain crests on northern perimeter
    const ridgeNoise = (fbm(x * 0.004 + 12.0, z * 0.004 + 12.0, 4) - 0.45) * 45.0;
    const cirqueElevation = 24.0 + sstep(-340, -680, z) * 195.0 + ridgeNoise;

    const headwallTerrain = (z <= -460) ? plateau : headwallElevation;
    const notchMask = sstep(45, 280, Math.abs(x));
    mountains = Math.max(mountains, lerp(headwallTerrain, cirqueElevation, notchMask));
  }

  // South pass (Grand Gate corridor opens out towards the vast ocean horizon)
  if (z > 60 && z <= 915) {
    const passFactor = sstep(120, 360, Math.abs(x));
    mountains *= (0.01 + 0.99 * passFactor);
  } else if (z > 915) {
    const flankFactor = sstep(380, 580, Math.abs(x - 30));
    const oceanDistTaper = Math.max(0, 1.0 - (z - 880) / 340);
    mountains *= flankFactor * oceanDistTaper;
  }

  // NW Highlands for Summit Rest (High alpine terraces overlooking the lake)
  const hl = Math.exp(-Math.pow(dist(x, z, WORLD.summit.x, WORLD.summit.z) / 340, 2)) * 75;

  // Soft rolling valley meadows (serene pasture undulations)
  const terrace = Math.sin(fbm(x * 0.0026, z * 0.0026, 3) * Math.PI * 4) * 2.2;
  let rolling = (fbm(x * 0.0028 + 5, z * 0.0028 + 5, 3) - 0.5) * 4.5 + terrace;
  if (x < -220 && z > 180) rolling += (fbm(x * 0.010, z * 0.010, 2) - 0.5) * 4.0;
  if (z > 915) rolling *= Math.max(0, 1.0 - (z - 915) / 40.0);

  // Dampen rolling hills along the Grand Boulevard and river gorge corridor
  const avenueProximity = Math.abs(x);
  if (avenueProximity < 85 && z >= 20 && z <= 915) {
    const avenueDamp = sstep(18, 85, avenueProximity);
    rolling *= avenueDamp;
  }

  // Base valley floor elevation (gentle continuous slope from Central Plaza y=18.5 to Grand Gate y=32.0)
  let baseValley = 18.5;
  if (z > 20 && z <= 915) {
    if (z >= 500) {
      baseValley = 26.0 + ((z - 500) / 380) * 6.0;
    } else if (z >= 380) {
      const bt = (z - 380) / 120;
      baseValley = 21.0 * (1 - bt) + 26.0 * bt;
    } else {
      baseValley = 18.5 + ((z - 20) / 360) * 2.5;
    }
  }

  // Coastal Cliff Bluff & Crescent Beach (z > 915)
  if (z > 915) {
    const cliffT = sstep(915, 955, z);
    const coveDist = Math.hypot((x - 35) / 160, (z - 1080) / 130);
    const coveMask = Math.exp(-Math.pow(coveDist, 2));
    
    const sandSlope = Math.max(0, 1.0 - (z - 955) / 220);
    const beachSand = 0.6 + sandSlope * 2.0 + coveMask * 1.0;
    const seaFloor = -4.5 * (1.0 - coveMask);
    const bottomTarget = (z < 1160) ? beachSand : lerp(beachSand, seaFloor, sstep(1160, 1340, z));
    
    baseValley = lerp(32.0, bottomTarget, cliffT);
  }

  // Combine initial macro terrain
  let h = mountains + hl + rolling + baseValley;

  // Dedicated Carved Riverbed Channels (Inlet and Outlet rivers sit inside deep natural troughs)
  const riverInfo = getRiverInfo(x, z);
  if (riverInfo.dist < 42.0 && z > -360 && z < 915) {
    const channelWidth = (z > 200) ? 36.0 : 28.0;
    if (riverInfo.dist < channelWidth) {
      const channelMask = Math.cos((riverInfo.dist / channelWidth) * Math.PI * 0.5);
      const targetRiverBed = riverInfo.y - 2.2;
      h = Math.min(h, lerp(h, targetRiverBed, channelMask * 0.92));
    }
  }

  // Central Plaza Terrace (x=0, z=20, r=64) - level firm foundation at y=18.5m
  const dPlaza = dist(x, z, WORLD.plaza.x, WORLD.plaza.z);
  if (dPlaza < 76.0) {
    const plazaWeight = sstep(76.0, 52.0, dPlaza);
    h = lerp(h, 18.5, plazaWeight * 0.96);
  }

  // Mirror Lake glacial tarn basin (Center 430, -260, r=295, waterLevel=12.5)
  const dl = dist(x, z, WORLD.lake.x, WORLD.lake.z);
  if (dl < WORLD.lake.r + 35) {
    const lakeBedTarget = 6.2; // 6.3m deep crystal clear lake bed
    const shoreBlend = sstep(WORLD.lake.r - 25, WORLD.lake.r + 35, dl);
    h = lerp(lakeBedTarget, h, shoreBlend);
  }

  // Highland Glacial Tarn Water Source Basin at (x=0, z=-640, waterLevel=182.0m)
  // Situated at the Universal Cathedral (z=-640) and directly feeding the Waterfall Lip
  const dxTarn = x / 36.0;
  const dzTarn = (z - (-560)) / 30.0;
  const dTarnNorm = Math.hypot(dxTarn, dzTarn);
  if (dTarnNorm < 1.35) {
    const tarnBedTarget = 174.0; // 8.0m deep crystal alpine lake bed beneath 182.0m water surface
    const tarnShoreBlend = sstep(0.65, 1.35, dTarnNorm);
    h = lerp(tarnBedTarget, h, tarnShoreBlend);
  }

  // Mountain Waterfall Plunge Pool Basin at (x=0, z=-360, waterLevel=18.0)
  const dPlunge = Math.hypot(x, z - (-360));
  if (dPlunge < 64.0) {
    const poolBedTarget = 14.2; // 3.8m deep basin beneath 18.0m water surface
    const poolShoreBlend = sstep(26.0, 64.0, dPlunge);
    h = lerp(poolBedTarget, h, poolShoreBlend);
  }

  // Clear notch and gorge channel directly along the waterfall cataract line (x ≈ 0, z = -340..-650)
  if (Math.abs(x) < 45 && z <= -340 && z >= -650) {
    const gorgeMask = (1.0 - Math.abs(x) / 45);
    let gorgeSlope = 174.0;
    if (z > -465) {
      const gorgeDrop = sstep(-360, -465, z);
      gorgeSlope = lerp(16.0, 180.0, gorgeDrop);
    }
    h = Math.min(h, lerp(h, gorgeSlope - 3.5, gorgeMask));
  }

  // 1. High Alpine Plateau for Highland Sanctuary & Universal Cathedral (z <= -450, |x| < 260)
  if (z <= -450 && z >= -820 && Math.abs(x) < 260) {
    const plateauEdge = (1.0 - sstep(160, 260, Math.abs(x))) * (1.0 - sstep(-740, -820, z));
    const roll = (fbm(x * 0.008 + 8.0, z * 0.008 + 8.0, 2) - 0.5) * 4.0;
    const catTerrace = Math.exp(-Math.pow(dist(x, z, WORLD.cathedral.x, WORLD.cathedral.z) / 100, 2));
    const tarnHole = Math.exp(-Math.pow(dTarnNorm / 1.5, 2.0));
    // also factor in the channel
    const chanFactor = (z >= -640 && z <= -460) ? Math.exp(-Math.pow(x/20.0, 2.0)) : 0.0;
    const waterCarve = Math.max(tarnHole, chanFactor);
    const targetH = lerp(184.0 + roll * (1.0 - catTerrace * 0.95), 173.0, waterCarve * 0.98);
    h = lerp(h, targetH, plateauEdge * 0.98);
  }

  // 2. Eastern Mountain Sanctuary: Buddhist Zen Pagoda Terrace (x=560, z=-540, y=135m)
  const dEastTemple = dist(x, z, WORLD.buddhistTemple.x, WORLD.buddhistTemple.z);
  if (dEastTemple < 85) {
    const tWeight = sstep(85, 30, dEastTemple);
    h = lerp(h, WORLD.buddhistTemple.y, tWeight * 0.96);
  }

  // 3. Western Mountain Sanctuary: Moorish Mosque Terrace (x=-480, z=-200, y=96m)
  const dWestMosque = dist(x, z, WORLD.mosque.x, WORLD.mosque.z);
  if (dWestMosque < 85) {
    const mWeight = sstep(85, 30, dWestMosque);
    h = lerp(h, WORLD.mosque.y, mWeight * 0.96);
  }

  // 4. KAYA ISLAND: Expanded Offshore Tropical Sanctuary Island (z = 1750..2240, x = -280..300, r = 240m)
  if (z > 1700) {
    // Elliptical island body centered at (10, 2060), radiusX=190m, radiusZ=125m
    const islandDist = Math.hypot((x - 10) / 190, (z - 2060) / 125);
    if (islandDist < 1.15) {
      const islandMask = Math.cos(Math.min(1.0, islandDist / 1.15) * Math.PI * 0.5);
      const jungleKnolls = (fbm(x * 0.010 + 7.2, z * 0.010 + 7.2, 4) - 0.45) * 8.0;
      
      // Central Guardian Husky Crystal Beacon Summit (x=20, z=2100)
      const dHusky = dist(x, z, WORLD.kayaIsland.x, WORLD.kayaIsland.z);
      const huskyPeak = Math.exp(-Math.pow(dHusky / 75, 2)) * 34.0;
      
      // Sacred Jewish Temple Elevated Sea-Cliff Bluff (x=-110, z=2160)
      const dTemple = dist(x, z, WORLD.jewishTemple.x, WORLD.jewishTemple.z);
      const templeBluff = Math.exp(-Math.pow(dTemple / 65, 2)) * 20.0;
      
      let islandElevation = islandMask * 8.0 + jungleKnolls * islandMask + huskyPeak + templeBluff;
      
      if (dHusky < 28) {
        islandElevation = lerp(islandElevation, 32.0, sstep(28, 22, dHusky));
      }
      if (dTemple < 35) {
        islandElevation = lerp(islandElevation, 22.0, sstep(35, 26, dTemple));
      }

      if (islandElevation > 0.4) {
        h = Math.max(h, islandElevation);
      }
    }
    
    // Outlying rocky sea-stacks & coral islets
    const stack1 = Math.exp(-Math.pow(dist(x, z, -280, 2020) / 45, 2)) * 16.0;
    const stack2 = Math.exp(-Math.pow(dist(x, z, 310, 2260) / 44, 2)) * 18.0;
    const stack3 = Math.exp(-Math.pow(dist(x, z, -150, 2380) / 40, 2)) * 14.0;
    if (stack1 + stack2 + stack3 > 0.5) {
      h = Math.max(h, (stack1 + stack2 + stack3) - 1.8);
    }

    // Submerged Kaya Coral Reef Lagoon & Deep Marine Shelf (z = 2190..2480, |x| < 240)
    // Deep crystal ocean lagoon (bedrock at y = -11.5m to -12.0m, allowing deep dive at y = -6.5m with ~5.0m of safe clearance above seabed)
    if (z >= 2190 && z <= 2480 && Math.abs(x) < 240) {
      const dropT = sstep(2190, 2240, z);
      const reefLagoonMask = Math.cos(Math.min(1.0, Math.hypot(x / 180, (z - 2350) / 110)) * Math.PI * 0.5);
      const targetBed = -11.8;
      h = lerp(h, targetBed, dropT * reefLagoonMask * 0.98);
    }
  }

  // Grand Boulevard Corridor & River Canyon Grading
  if (z >= 20 && z <= 915) {
    const roadDist = Math.abs(x);
    if (roadDist < 65) {
      const rf = sstep(65, 18, roadDist);
      if (z >= 500) {
        const targetSouthRoad = 26.0 + ((z - 500) / 380) * 6.0;
        h = lerp(h, targetSouthRoad, rf * 0.85);
      } else if (z <= 380) {
        const targetNorthRoad = 18.5 + ((z - 20) / 360) * 2.5;
        h = lerp(h, targetNorthRoad, rf * 0.85);
      } else {
        // Across the Rainbow Bridge span (z = 380..500):
        // Solid rock abutment shelves at North (z <= 392) and South (z >= 488)
        if (z <= 392) {
          const abWeight = sstep(392, 378, z);
          h = lerp(h, 21.65, abWeight * rf);
        } else if (z >= 488) {
          const abWeight = sstep(488, 502, z);
          h = lerp(h, 26.65, abWeight * rf);
        }
      }
    }
  }

  // Grand Gate Entrance Plaza Terrace (z = 840..915, |x| < 120):
  // Perfectly level and firm stone plaza terrace at y = 32.0m for the Grand Gate
  if (z >= 840 && z <= 915 && Math.abs(x) < 120) {
    const gateTerraceWeight = sstep(120, 60, Math.abs(x)) * sstep(840, 860, z) * sstep(915, 895, z);
    h = lerp(h, 32.0, gateTerraceWeight * 0.95);
  }

  // Continuous River Channel Carving (Guarantees 100% unbroken water flow and open canyon under bridge)
  const { dist: dRiver, y: rWaterY } = getRiverInfo(x, z);
  if (dRiver < 42.0 && z > -370 && z <= 980) {
    const channelBed = rWaterY - 2.4;
    const bankWeight = sstep(16.0, 42.0, dRiver);
    h = Math.min(h, lerp(channelBed, h, bankWeight));
  }

  return h;
}

export function terrainHeight(x, z) {
  const SEG = 200, W = 4600, L = 5200;
  const dx = W / SEG, dz = L / SEG;
  
  let cx = (x + W / 2) / dx;
  let cz = (z + L / 2) / dz;
  
  // Clamp to grid bounds
  cx = Math.max(0, Math.min(SEG - 0.001, cx));
  cz = Math.max(0, Math.min(SEG - 0.001, cz));
  
  const ix = Math.floor(cx);
  const iz = Math.floor(cz);
  const fx = cx - ix;
  const fz = cz - iz;
  
  const x0 = ix * dx - W / 2;
  const x1 = (ix + 1) * dx - W / 2;
  const z0 = iz * dz - L / 2;
  const z1 = (iz + 1) * dz - L / 2;
  
  const h00 = terrainHeightBase(x0, z0);
  const h10 = terrainHeightBase(x1, z0);
  const h01 = terrainHeightBase(x0, z1);
  const h11 = terrainHeightBase(x1, z1);
  
  if (fx + fz <= 1.0) {
    return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
  } else {
    return h11 + (h01 - h11) * (1.0 - fx) + (h10 - h11) * (1.0 - fz);
  }
}

export function isUnderWater(x, z) {
  return terrainHeight(x, z) < WORLD.waterLevel;
}

// ---------- Monumental Distant Alpine Mountain Ring Massif (R = 2200m - 5300m, y = 650m - 1450m) ----------
export function backgroundMountainElevation(x, z) {
  const r = Math.hypot(x, z);
  if (r < 2100 || r > 5500) return 0;

  const RING_INNER = 2200, RING_OUTER = 5300;
  const tNorm = clamp((r - RING_INNER) / (RING_OUTER - RING_INNER), 0, 1);
  
  // Smooth asymmetric bell-curve radial envelope:
  // Starts at r=2200m, surges upwards towards peak alpine massif spine at r=3100m..4400m, then tapers smoothly at r=5300m
  const radialEnvelope = Math.pow(Math.sin(tNorm * Math.PI), 0.72);

  // Directional modulation:
  // North, East, NW, and NE form titanic towering alpine mountain ranges rising up to 1450m;
  // South/SE/SW sector (z > 250) cascades into dramatic maritime alpine fjords and coastal cliffs framing the ocean
  let dirWeight = 1.0;
  if (z > 250) {
    const southFactor = Math.min(1.0, (z - 250) / 950);
    const angleFromSouth = Math.abs(Math.atan2(x, z));
    const oceanGap = Math.max(0, 1.0 - angleFromSouth / 0.95);
    dirWeight = lerp(1.0, 0.22, southFactor * (0.42 + 0.58 * oceanGap));
  }

  // 1. Multi-Octave Sharp Alpine Arêtes (Matterhorn / Grand Teton razor crests)
  const r1 = Math.pow(ridgeNoise(x * 0.00078, z * 0.00078, 6), 2.35) * 940;
  const r2 = Math.pow(ridgeNoise(x * 0.0019 + 11.2, z * 0.0019 + 11.2, 5), 1.85) * 440;
  const r3 = Math.pow(ridgeNoise(x * 0.0042 + 23.7, z * 0.0042 + 23.7, 4), 1.4) * 180;
  const r4 = ridgeNoise(x * 0.0092 + 37.1, z * 0.0092 + 37.1, 3) * 65;

  // 2. Glacial Couloirs & Hydraulic Runoff Erosion Chutes
  const couloir1 = Math.pow(Math.abs(fbm(x * 0.0024 + 7.5, z * 0.0024 + 7.5, 4) - 0.5) * 2.0, 1.85);
  const couloir2 = Math.pow(Math.abs(fbm(x * 0.0065 + 18.2, z * 0.0065 + 18.2, 3) - 0.5) * 2.0, 1.5);
  const erosionFactor = Math.max(0.22, 1.0 - (couloir1 * 0.38 + couloir2 * 0.18));

  // 3. Macro Tectonic Massif Uplift & Cirque Swelling
  const macroTectonic = (fbm(x * 0.00038 + 19.4, z * 0.00038 + 19.4, 4) - 0.36) * 420;

  // 4. Iconic Monumental Alpine Horns, Pyramidal Massifs & Needle Spires
  // NW Matterhorn Pyramidal Horn (x=-1650, z=-3350)
  const hornMatterhorn = Math.exp(-Math.pow(dist(x, z, -1650, -3350) / 460, 2)) * 640;
  // N Grand Teton Cathedral Spire (x=1680, z=-3550)
  const hornGrandTeton = Math.exp(-Math.pow(dist(x, z, 1680, -3550) / 480, 2)) * 680;
  // NNW Mont Blanc Dome & Massif (x=-3450, z=-1450)
  const hornMontBlanc  = Math.exp(-Math.pow(dist(x, z, -3450, -1450) / 520, 2)) * 620;
  // NNE Jungfrau Summit (x=3650, z=-1350)
  const hornJungfrau   = Math.exp(-Math.pow(dist(x, z, 3650, -1350) / 500, 2)) * 590;
  // NE Eiger North Wall (x=2800, z=-2800)
  const hornEigerNorth = Math.exp(-Math.pow(dist(x, z, 2800, -2800) / 450, 2)) * 560;
  // N Monte Rosa Summit (x=-550, z=-4200)
  const hornMonteRosa  = Math.exp(-Math.pow(dist(x, z, -550, -4200) / 510, 2)) * 720;
  // W Monte Cristallo Towers (x=-3800, z=450)
  const hornCristallo  = Math.exp(-Math.pow(dist(x, z, -3800, 450) / 460, 2)) * 510;
  // E Dolomite Spires (x=3900, z=550)
  const hornDolomites  = Math.exp(-Math.pow(dist(x, z, 3900, 550) / 470, 2)) * 530;
  // NW Weisshorn Sharp Arête Horn (x=-2700, z=-3900)
  const hornWeisshorn  = Math.exp(-Math.pow(dist(x, z, -2700, -3900) / 440, 2)) * 580;

  const monumentalPeaks = hornMatterhorn + hornGrandTeton + hornMontBlanc + hornJungfrau +
                          hornEigerNorth + hornMonteRosa + hornCristallo + hornDolomites + hornWeisshorn;

  const baseElevation = 540 * dirWeight;
  const ruggedSpine = (r1 + r2 + r3 + r4 + macroTectonic) * erosionFactor * dirWeight;
  const totalH = (baseElevation + ruggedSpine + monumentalPeaks * dirWeight) * radialEnvelope;

  // Seamless boundary blending with the inner valley terrain at r=2200m
  const innerBlend = Math.max(30.0 * (1.0 - tNorm), totalH);
  return innerBlend;
}

// Master terrain color palette tokens
export const TERRAIN_COLORS = {
  fescueBase: '#2e5c1e',      // Deep rich fescue base tone
  fescueSunlit: '#4a882a',    // Sunlit blade crest tone
  fescueSoil: '#183410',      // Shaded loam & soil hollows
  graniteCliff: '#565e68',    // Weathered slate grey granite bedrock
  graniteCrest: '#6e7682',    // Sunlit granite crest
  screeTalus: '#766e62',      // Scree and talus slopes (warm alpine moraine soil)
  forestConifer: '#22361e',   // Subalpine forest belt (deep conifer green)
  glacialIceCore: '#78a8cc',  // Glacial ice-blue shadow tone
  alpineSnow: '#dce6f0',      // Soft firn snow crest
  ironOxide: '#8e5e2e',       // Mineral iron oxide fracture stains
};

/**
 * Dual-radius baked terrain crevice ambient occlusion calculation.
 * Accurately darkens valleys, couloirs, ravines, and steep cliff faces.
 */
export function computeTerrainCreviceAO(x, z, h = terrainHeight(x, z), slope = 1.0) {
  const epsFine = 2.0;
  const avgFine = (
    terrainHeight(x, z - epsFine) + terrainHeight(x, z + epsFine) +
    terrainHeight(x - epsFine, z) + terrainHeight(x + epsFine, z) +
    terrainHeight(x - epsFine * 0.707, z - epsFine * 0.707) + terrainHeight(x + epsFine * 0.707, z - epsFine * 0.707) +
    terrainHeight(x - epsFine * 0.707, z + epsFine * 0.707) + terrainHeight(x + epsFine * 0.707, z + epsFine * 0.707)
  ) * 0.125;
  const concavityFine = Math.max(0.0, avgFine - h);

  const epsMacro = 10.0;
  const avgMacro = (
    terrainHeight(x, z - epsMacro) + terrainHeight(x, z + epsMacro) +
    terrainHeight(x - epsMacro, z) + terrainHeight(x + epsMacro, z) +
    terrainHeight(x - epsMacro * 0.707, z - epsMacro * 0.707) + terrainHeight(x + epsMacro * 0.707, z - epsMacro * 0.707) +
    terrainHeight(x - epsMacro * 0.707, z + epsMacro * 0.707) + terrainHeight(x + epsMacro * 0.707, z + epsMacro * 0.707)
  ) * 0.125;
  const concavityMacro = Math.max(0.0, avgMacro - h);

  const steepnessAO = Math.min(1.0, slope * 0.70 + 0.30);
  const rawAO = (1.0 - (concavityFine * 0.22 + concavityMacro * 0.09)) * steepnessAO;
  return Math.max(0.28, Math.min(1.0, rawAO));
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
              blurb: 'A quiet sun-baked corner southwest of the bridge with flowering cacti and red rock.' },
  ocean_cove:{ key: 'ocean_cove', name: 'Crescent Beach Cove', base: 549, color: '#38bdf8',
              blurb: 'Secluded golden sandy cove beneath dramatic 40m sheer cliffs where the Rainbow River cascades directly into the turquoise ocean surf.' },
  highland_sanctuary:{ key: 'highland_sanctuary', name: 'Highland Cathedral Plateau', base: 749, color: '#e2d4b7',
              blurb: 'Majestic high alpine territory above the northern waterfall. Paved scenic promenades, panoramic valley overlooks, and the Grand Universal Cathedral.' },
  kaya_island:{ key: 'kaya_island', name: 'Kaya Island', base: 699, color: '#67e8f9',
              blurb: 'A sacred offshore island sanctuary honoring guardian spirit Husky Kaya. Coral beaches, the 3D Husky crystal beacon, and the monumental sea-cliff Temple of Baal.' },
  kaya_reef:  { key: 'kaya_reef', name: 'Kaya Coral Reef Sanctuary', base: 899, color: '#06b6d4',
              blurb: 'Submerged coral gardens, glowing sea fans, and pearl oyster beds in crystal turquoise ocean depths around Kaya Island.' },
  lake_submerged:{ key: 'lake_submerged', name: 'Lake of Reflection Aquatic Plots', base: 599, color: '#38bdf8',
              blurb: 'Submerged crystal lotus blossoms, polished river jade anchors, and drifting water lilies along the mirror lake bed.' },
  highland_rapids:{ key: 'highland_rapids', name: 'Cataract Lip & Mountain Rapids', base: 799, color: '#93c5fd',
              blurb: 'Dramatic cliffside plots perched along the mountain rapids and the 182-meter glacial cataract crest overlooking the entire valley.' },
};

export const DISTRICT_NAMES = {
  meadows: 'Memorial Meadows', woodland: 'Whispering Pines',
  lakefront: 'Lakeside Rest', beach: 'Golden Shores',
  summit: 'Summit Rest', desert: 'Desert Bloom',
  ocean_cove: 'Crescent Beach Cove', highland_sanctuary: 'Highland Cathedral Plateau',
  kaya_island: 'Kaya Island', kaya_reef: 'Kaya Coral Reef Sanctuary',
  lake_submerged: 'Lake of Reflection Aquatic Plots', highland_rapids: 'Cataract Lip & Mountain Rapids',
};

// District key mappings for aliases/legacy strings
export const DISTRICT_KEY_MAP = {
  memorial_meadows: 'meadows',
  whispering_pines: 'woodland',
  lakeside_rest: 'lakefront',
  golden_shores: 'beach',
  summit_rest: 'summit',
  desert_bloom: 'desert',
  ocean_cove: 'ocean_cove',
  highland_sanctuary: 'highland_sanctuary',
  starlight_isle: 'kaya_island',
  kaya_island: 'kaya_island',
  kaya_reef: 'kaya_reef',
  lake_submerged: 'lake_submerged',
  highland_rapids: 'highland_rapids',
};

// ---------- Roads (polylines, in world coords) ----------
export const ROADS = [
  { name: 'Grand Boulevard', w: 26, pts: [[0, 940], [0, 880], [0, 720], [0, 560], [0, 440], [0, 320], [0, 180], [0, 82]] },
  { name: 'Ocean Cliff Path',w: 12, pts: [[0, 880], [15, 920], [35, 980], [60, 1080], [75, 1180]] },
  { name: 'Plaza Ring',      w: 14, ring: true, cx: WORLD.plaza.x, cz: WORLD.plaza.z, r: WORLD.plaza.r },
  { name: 'Lakeshore Way',   w: 12, pts: [[44, -4], [140, -60], [100, -180], [100, -320], [180, -480], [340, -580], [550, -580]] },
  { name: 'Shoreline Path',  w: 10, pts: [[550, -580], [720, -430], [770, -260], [750, -100], [690, -20], [600, 40]] },
  { name: 'Summit Ascent',   w: 12, pts: [[-52, -8], [-180, -70], [-300, -150], [-360, -250], [-460, -340], [-520, -420]] },
  { name: 'Pinewood Lane',   w: 12, pts: [[-42, -42], [-110, -160], [-140, -280], [-110, -420], [-40, -520]] },
  { name: 'Desert Trail',    w: 12, pts: [[-16, 560], [-160, 490], [-320, 450], [-460, 390], [-560, 300]] },
  { name: 'Meadow Row E',    w: 8,  pts: [[18, 480], [150, 440], [260, 380]] },
  { name: 'Meadow Row W',    w: 8,  pts: [[-30, 500], [-160, 470], [-280, 420]] },
  { name: 'Cathedral Terrace Way', w: 12, pts: [[-120, -560], [-80, -640], [0, -720], [80, -640], [120, -560]] },
  { name: 'Buddhist Ridge Path', w: 10, pts: [[440, -440], [480, -480], [510, -520]] },
  { name: 'Moorish Terrace Walk', w: 10, pts: [[-360, -180], [-440, -190], [-450, -192]] },
  { name: 'Kaya Island Promenade', w: 12, pts: [[65, 1990], [45, 2100], [-80, 2150], [-150, 2240]] },
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
export const PET_NAMES = [
  'Kaya', 'Luna', 'Bella', 'Charlie', 'Lucy', 'Cooper', 'Max', 'Bailey', 'Daisy',
  'Sadie', 'Milo', 'Buddy', 'Rocky', 'Oliver', 'Leo', 'Stella', 'Bear',
  'Sophie', 'Chloe', 'Zoe', 'Lola', 'Jack', 'Toby', 'Penny', 'Cody',
  'Buster', 'Duke', 'Harley', 'Rosie', 'Maggie', 'Sam', 'Gus', 'Finn',
  'Barnaby', 'Cleo', 'Jasper', 'Freya', 'Atlas', 'Willow', 'Shadow', 'Scout'
];
export const SPECIES = ['Dog', 'Cat', 'Horse', 'Rabbit', 'Bird', 'Guinea Pig', 'Ferret', 'Hamster', 'Reptile', 'Other'];
export const EPITAPHS = [
  'Forever in our hearts.', 'Until we meet at the bridge.', 'The best boy.',
  'A true and faithful friend.', 'Running free in sunny meadows.', 'Sleep well, sweet girl.',
  'Always by our side in spirit.', 'You brought so much joy.', 'Our companion across the years.',
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
    ocean_cove: [
      { x0: -160, z0: 910,  cols: 4, rows: 2, dx: 42, dz: 44 },  // West mountain cliffside overlook
      { x0: 20,   z0: 1060, cols: 6, rows: 4, dx: 44, dz: 46 },  // Golden sandy beach cove down at sea level
      { x0: 120,  z0: 1120, cols: 4, rows: 3, dx: 46, dz: 48 },  // Seaside surf plots
    ],
    highland_sanctuary: [
      { x0: -180, z0: -580, cols: 8, rows: 4, dx: 46, dz: 44 },  // High alpine promenade plots
      { x0: 40,   z0: -580, cols: 7, rows: 4, dx: 46, dz: 44 },  // East waterfall plateau plots
      { x0: -140, z0: -720, cols: 6, rows: 3, dx: 48, dz: 48 },  // Cathedral north garden plots
    ],
    kaya_island: [
      { x0: -120, z0: 2020, cols: 7, rows: 4, dx: 42, dz: 44 },  // Island jungle glades & palm groves
      { x0: -60,  z0: 2140, cols: 6, rows: 4, dx: 44, dz: 42 },  // Island coral beach & south lagoon
      { x0: -160, z0: 2200, cols: 5, rows: 3, dx: 44, dz: 44 },  // Sacred Temple sea-cliff bluff
    ],
    kaya_reef: [
      { x0: -90,  z0: 2320, cols: 6, rows: 3, dx: 38, dz: 38 },  // Submerged South Coral Shelf
      { x0: 60,   z0: 2240, cols: 5, rows: 3, dx: 40, dz: 40 },  // Submerged East Anemone Garden
    ],
    lake_submerged: [
      { x0: 380,  z0: -240, cols: 4, rows: 3, dx: 36, dz: 36 },  // Submerged Lotus Garden Center
      { x0: 460,  z0: -320, cols: 4, rows: 3, dx: 36, dz: 36 },  // Submerged Crystal Bed
    ],
    highland_rapids: [
      { x0: -40,  z0: -480, cols: 4, rows: 2, dx: 34, dz: 32 },  // Rapids Lip West
      { x0: 20,   z0: -480, cols: 4, rows: 2, dx: 34, dz: 32 },  // Cataract Crest East
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
          const isSubmerged = dk === 'kaya_reef' || dk === 'lake_submerged';
          const localWater = (dk === 'ocean_cove' || dk === 'kaya_island' || dk === 'kaya_reef') ? (WORLD.oceanLevel || 0.35) : WORLD.waterLevel;
          
          if (!isSubmerged && h < localWater + 0.8) continue;
          if (dk === 'kaya_reef' && (h > -0.5 || h < -18.0)) continue;
          if (dk === 'lake_submerged' && (h > WORLD.waterLevel - 1.0 || h < 2.0)) continue;
          if (h > 120 && dk !== 'summit' && dk !== 'highland_sanctuary' && dk !== 'highland_rapids') continue;
          if (dk === 'summit' && h > 150) continue;
          if (dk === 'highland_sanctuary' && (h < 175 || h > 198)) continue;
          if (dk === 'highland_rapids' && (h < 178 || h > 188)) continue;

          const dr = distToRoads(x, z);
          if (dr < 12) continue;
          if (dist(x, z, WORLD.plaza.x, WORLD.plaza.z) < WORLD.plaza.r + 24) continue;
          if (dk !== 'highland_rapids' && distToRiver(x, z) < 24) continue; // keep river channels clear of plots
          if (Math.hypot(x, z - (-360)) < 68) continue; // keep plunge pool clear of plots
          if (Math.hypot(x, z - (-720)) < 55) continue; // keep Cathedral Glacial Tarn clear of plots
          if (dist(x, z, WORLD.cathedral.x, WORLD.cathedral.z) < 65) continue; // clear cathedral footprint
          if (dist(x, z, WORLD.buddhistTemple.x, WORLD.buddhistTemple.z) < 45) continue; // clear buddhist temple
          if (dist(x, z, WORLD.mosque.x, WORLD.mosque.z) < 45) continue; // clear mosque
          if (dist(x, z, WORLD.templeOfBaal.x, WORLD.templeOfBaal.z) < 48) continue; // clear temple of baal
          if (dist(x, z, WORLD.kayaIsland.x, WORLD.kayaIsland.z) < 32) continue; // clear husky crystal beacon
          const dLake = dist(x, z, WORLD.lake.x, WORLD.lake.z) - WORLD.lake.r;
          if ((dk === 'lakefront' || dk === 'beach') && dLake < 8) continue;

          counters[dk]++;
          const num = counters[dk];
          const roll = rng();
          const size = roll > 0.9 ? 'estate' : roll > 0.65 ? 'premium' : 'standard';
          const sizeMult = size === 'estate' ? 3.7 : size === 'premium' ? 1.8 : 1;
          const tier = size === 'estate' ? 3 : size === 'premium' ? 2 : 1;

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
            size, tier, price, status: occupied ? 'occupied' : 'available',
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
