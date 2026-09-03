// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — 3D world engine (Three.js)
// A living paradise: the Rainbow Bridge at the valley's heart,
// glowing pawprints, seasonal blooms, real time-of-day skies
// and live weather moods — always gentle, always paradise.
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js?v=9';
import { Sky } from 'three/addons/objects/Sky.js?v=9';
import { Water } from 'three/addons/objects/Water.js?v=9';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js?v=9';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js?v=9';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js?v=9';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js?v=9';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js?v=9';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js?v=9';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js?v=9';
import { mergeGeometries as _rawMergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js?v=9';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js?v=9';

// Fully Robust Safe Merge Wrapper (Universal Index & Attribute Normalization)
const mergeGeometries = (geos, useGroups = false) => {
    if (!geos || !Array.isArray(geos) || geos.length === 0) return null;
    const validGeos = geos.filter(g => g && g.attributes && g.attributes.position);
    if (validGeos.length === 0) return null;
    if (validGeos.length === 1) return validGeos[0];
    
    let anyIndexed = false;
    let anyNonIndexed = false;
    let anyColor = false;
    let anyUv = false;
    let anyNormal = false;
    
    for (const g of validGeos) {
        if (g.index) anyIndexed = true;
        else anyNonIndexed = true;
        if (g.attributes.color) anyColor = true;
        if (g.attributes.uv) anyUv = true;
        if (g.attributes.normal) anyNormal = true;
    }
    
    const normalized = validGeos.map(g => {
        let out = g;
        // Normalize indexing: if mixed, convert all to non-indexed
        if (anyIndexed && anyNonIndexed && g.index) {
            out = g.toNonIndexed();
        }
        
        // Normalize normals
        if (anyNormal && !out.attributes.normal) {
            out.computeVertexNormals();
        }
        
        // Normalize UVs
        if (anyUv && !out.attributes.uv) {
            const count = out.attributes.position.count;
            const uvs = new Float32Array(count * 2);
            out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        }
        
        // Normalize Color
        if (anyColor && !out.attributes.color) {
            const count = out.attributes.position.count;
            const colors = new Float32Array(count * 3).fill(1);
            out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        } else if (!anyColor && out.attributes.color) {
            out.deleteAttribute('color');
        }
        return out;
    });
    
    try {
        const merged = _rawMergeGeometries(normalized, useGroups);
        normalized.forEach(g => { if (g) g.dispose(); });
        return merged;
    } catch (err) {
        console.warn('[world3d] mergeGeometries fallback:', err);
        return null;
    }
};
const safeMerge = mergeGeometries;

import { WORLD, DISTRICTS, ROADS, RIVER, RIVER_INLET, RIVER_OUTLET, terrainHeight, backgroundMountainElevation, distToRoads, distToRiver, getRiverInfo, riverWaterElevation, fbm, ridgeNoise, mulberry32, SIZE_DIMS } from './terrain.js?v=9';
import { getSeason, SEASON_STYLE, getDayPhase, PHASES, MOODS, fetchWeather } from './ambience.js?v=9';
import { Surfaces, waterNormalTexture, textures, material, createBotanicalFoliageMaterial, clearCache } from './materials.js?v=9';
import { icon, speciesIcon, speciesKey } from './icons.js?v=9';
import { charityName } from './catalog.js?v=9';
import { DRONE_TOUR_LANDMARKS } from './tour.js?v=9';
import { buildGrandBoulevard, buildSecondaryRoad } from './roads.js?v=9';


// Soft Radial Contact Ambient Occlusion Shadow Decal Texture
let _sharedShadowMat = null;
function createContactShadow(radius, yPos = 0.04) {
  if (!_sharedShadowMat) {
    const shadowCnv = document.createElement('canvas');
    shadowCnv.width = shadowCnv.height = 128;
    const sCtx = shadowCnv.getContext('2d');
    const sGrad = sCtx.createRadialGradient(64, 64, 4, 64, 64, 64);
    sGrad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
    sGrad.addColorStop(0.4, 'rgba(0, 0, 0, 0.38)');
    sGrad.addColorStop(0.8, 'rgba(0, 0, 0, 0.10)');
    sGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 128, 128);
    const shadowTex = new THREE.CanvasTexture(shadowCnv);
    _sharedShadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, logarithmicDepthBuffer: true, depthWrite: false });
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), _sharedShadowMat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = yPos;
  return mesh;
}

// ---- GPU OPTIMIZATION: Foliage Overdraw Elimination ----
// Force canopy materials to use binary alpha cutouts and write to depth buffer instantly
const _origLeafCard = Surfaces.leafCard;
Surfaces.leafCard = function(...args) {
  const m = _origLeafCard.apply(this, args);
  m.transparent = false; m.alphaTest = 0.5; m.depthWrite = true;
  return m;
};
const _origPineNeedles = Surfaces.pineNeedles;
Surfaces.pineNeedles = function(...args) {
  const m = _origPineNeedles.apply(this, args);
  m.transparent = false; m.alphaTest = 0.5; m.depthWrite = true;
  return m;
};
const _origCypressFoliage = Surfaces.cypressFoliage;
Surfaces.cypressFoliage = function(...args) {
  const m = _origCypressFoliage.apply(this, args);
  m.transparent = false; m.alphaTest = 0.5; m.depthWrite = true;
  return m;
};
const _origSakuraBlossom = Surfaces.sakuraBlossom;
Surfaces.sakuraBlossom = function(...args) {
  const m = _origSakuraBlossom.apply(this, args);
  m.transparent = false; m.alphaTest = 0.45; m.depthWrite = true;
  return m;
};

const V3 = THREE.Vector3;
// Pre-allocated colour constants — avoids per-vertex GC pressure during terrain build
const _roadTint = new THREE.Color(0xbfb39a);

// Pre-allocated scratch variables for 120 FPS render loop & sub-frame integration (zero GC allocations)
const _v3Temp1 = new THREE.Vector3();
const _v3Temp2 = new THREE.Vector3();
const _v3Temp3 = new THREE.Vector3();
const _v3Temp4 = new THREE.Vector3();
const _colTemp = new THREE.Color();
const _colTemp2 = new THREE.Color();
const _quatTemp = new THREE.Quaternion();
const _mat4Temp = new THREE.Matrix4();

function _hermiteSmooth(x) {
  const c = Math.max(0.0, Math.min(1.0, x));
  return c * c * (3.0 - 2.0 * c);
}

// ---------------- Procedural Geometry Math Utilities ----------------
// De-sterilizes procedural meshes with organic artisanal weathering & vertex crevice occlusion
export function applyOrganicWeathering(geometry, noiseScale = 0.08, noiseAmp = 0.28, seed = 17) {
  if (!geometry || !geometry.attributes || !geometry.attributes.position) return geometry;
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (isNaN(x) || !isFinite(x)) x = 0;
    if (isNaN(y) || !isFinite(y)) y = 0;
    if (isNaN(z) || !isFinite(z)) z = 0;
    const n = (fbm(x * noiseScale + seed, z * noiseScale + seed, 2) - 0.5) * noiseAmp;
    const ny = (fbm(y * noiseScale * 1.5 + seed * 2, x * noiseScale + seed, 2) - 0.5) * (noiseAmp * 0.6);
    const fx = isNaN(n) ? x : x + n;
    const fy = isNaN(ny) ? y : y + ny;
    const fz = isNaN(n) ? z : z + n;
    pos.setXYZ(i, fx, fy, fz);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  if (geometry.computeBoundingSphere) geometry.computeBoundingSphere();
  if (geometry.computeBoundingBox) geometry.computeBoundingBox();
  return geometry;
}

export function bakeVertexCreviceOcclusion(geometry, groundY = 0, creviceStrength = 0.45) {
  if (!geometry || !geometry.attributes.position) return geometry;
  const pos = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const ny = normals ? normals.getY(i) : 0;
    const groundFactor = Math.max(0, Math.min(1, (y - groundY) / 4.0));
    const normalFactor = Math.max(0, ny * 0.5 + 0.5);
    const ao = Math.max(0.35, Math.min(1.0, 0.45 + 0.35 * groundFactor + 0.20 * normalFactor));
    colors[i * 3]     = ao;
    colors[i * 3 + 1] = ao;
    colors[i * 3 + 2] = ao;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export class WorldTerrain {
  constructor(world) {
    this.world = world;
  }

  async _terrain() {
    // Adaptive terrain density: desktop gets high-poly for photorealism, mobile stays performant
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    const SEG = isMobile ? 96 : 128;
    const W = 4600, L = 5200;
     const geo = new THREE.PlaneGeometry(W, L, SEG, SEG); 
    geo.rotateX(-Math.PI / 2);
     const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const normals = new Float32Array(pos.count * 3);
    const creviceAOs = new Float32Array(pos.count);
    const c = new THREE.Color();

    let lastY = performance.now(); const yieldMain = () => { if (performance.now() - lastY > 16) { lastY = performance.now(); return new Promise(r => setTimeout(r, 0)); } else return Promise.resolve(); };

    // 100% Photographic Reference Biome Palette (Deep Fescue Valley, Granite Crags & High Alpine Snow)
    const fescueBase      = new THREE.Color(0x2e5c1e); // Deep rich fescue base (#2e5c1e)
    const fescueSunlit    = new THREE.Color(0x4a882a); // Sunlit blade crest tone (#4a882a)
    const fescueSoil      = new THREE.Color(0x183410); // Shaded loam & soil hollows (#183410)
    const forestDark      = new THREE.Color(0x184614);
    const forestCanopy    = new THREE.Color(0x286220);
    const forestSunlit    = new THREE.Color(0x4ca830);
    const riverGravel     = new THREE.Color(0x767062);
    const riverSilt       = new THREE.Color(0x524636);
    const sandBeach       = new THREE.Color(0xb8a482);
    const sandWet         = new THREE.Color(0x685844);
    const rockCliff       = new THREE.Color(0x565e68); // Weathered granite bedrock (#565e68 slate grey)
    const rockGraniteCrest= new THREE.Color(0x6e7682); // Exposed granite crest (#6e7682)
    const ironOxide       = new THREE.Color(0x8e5e2e);
    const screeGravel     = new THREE.Color(0x766e62); // Scree and talus moraine (#766e62 warm alpine soil)
    const jungleEmerald   = new THREE.Color(0x144c16);
    const jungleLush      = new THREE.Color(0x24701e);
    const coralSand       = new THREE.Color(0xe6e0cc);
    const alpineSnow      = new THREE.Color(0xdce6f0); // Soft firn snow (#dce6f0)
    const iceBlueSSS      = new THREE.Color(0x78a8cc); // Glacial ice-blue shadow tone (#78a8cc)
    const _roadTint       = new THREE.Color(0x96866e);

    // Pass 1: Set heights (1 evaluation per vertex instead of 21)
    console.log("[world3d] _terrain Pass 1 start", performance.now());
    for (let i = 0; i < pos.count; i++) {
      if (i % 8192 === 0) {
        console.log(`[world3d] _terrain Pass 1: ${i} / ${pos.count}`);
        await yieldMain();
      }
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, terrainHeight(x, z));
    }
    console.log('[world3d] _terrain Pass 1 done');
    
    // Automatically compute optimal vertex normals using Three.js built-in
    geo.computeVertexNormals();
    const computedNormals = geo.attributes.normal;
    
    // Pass 2: Calculate colors and fast AO based on neighboring vertices in the grid
    const stride = SEG + 1;
    console.log("[world3d] _terrain Pass 2 start", performance.now());
    for (let i = 0; i < pos.count; i++) {
      if (i % 8192 === 0) {
        console.log(`[world3d] _terrain Pass 2: ${i} / ${pos.count}`);
        await yieldMain();
      }
      const x = pos.getX(i), z = pos.getZ(i);
      const h = pos.getY(i);
      
      const n1 = fbm(x * 0.006, z * 0.006, 2);
      const n2 = fbm(x * 0.02, z * 0.02, 2);
      const canopyClumps = fbm(x * 0.035, z * 0.035, 2);
      const nErode = Math.abs(fbm(x * 0.012, z * 0.012, 2) - 0.5) * 2.0;
      
      const nx = computedNormals.getX(i);
      const ny = computedNormals.getY(i);
      const nz = computedNormals.getZ(i);
      
      normals[i * 3]     = nx;
      normals[i * 3 + 1] = ny;
      normals[i * 3 + 2] = nz;
      
      const slope = ny; // Normalized
      
      // Fast grid-based AO (using adjacent vertex heights)
      let avgHeight = h;
      let samples = 1;
      
      const row = Math.floor(i / stride);
      const col = i % stride;
      
      if (row > 0) { avgHeight += pos.getY(i - stride); samples++; }
      if (row < SEG) { avgHeight += pos.getY(i + stride); samples++; }
      if (col > 0) { avgHeight += pos.getY(i - 1); samples++; }
      if (col < SEG) { avgHeight += pos.getY(i + 1); samples++; }
      
      avgHeight /= samples;
      
      const concavity = Math.max(0.0, avgHeight - h);
      const steepnessAO = Math.min(1.0, slope * 0.70 + 0.30);
      const rawAO = (1.0 - (concavity * 0.8)) * steepnessAO;
      const creviceAO = Math.max(0.28, Math.min(1.0, rawAO));
      creviceAOs[i] = creviceAO;

      // Smooth continuous macro biome tinting (eliminates hard discrete step boundaries)
      if (z > 1750) {
        // Offshore Tropical Jungle Island Biome
        const islandCoast = Math.max(0.0, Math.min(1.0, (h - 1.2) / 2.0));
        const islandRock = Math.max(0.0, Math.min(1.0, (0.62 - slope) / 0.18));
        c.copy(sandWet).lerp(coralSand, islandCoast);
        c.lerp(jungleEmerald, Math.max(0.0, Math.min(1.0, (h - 2.5) / 3.0)));
        c.lerp(jungleLush, canopyClumps * 0.5);
        c.lerp(rockCliff, islandRock * 0.85);
      } else {
        // Alpine Valley & Surrounding Mountain Forest Massif
        const altFactor = Math.max(0.0, Math.min(1.0, (h - 18.0) / 45.0));
        const steepFactor = Math.max(0.0, Math.min(1.0, (0.85 - slope) / 0.28));
        
        // Base deep rich fescue pasture with subtle organic tonal variation
        const microVar = fbm(x * 0.05, z * 0.05, 1) * 0.25;
        const broadDrift = fbm(x * 0.0035 + 7.0, z * 0.0035 + 7.0, 2);
        
        // Aspect calculation: south/west facing slopes get warm sunlit pasture, north/east get cool damp soil shadow
        const sunAspect = Math.max(0.0, (nx * (-0.4) + nz * 0.5 + 0.35) / 1.25);
        
        c.copy(fescueSoil).lerp(fescueBase, n1 * 0.55 + 0.35);
        c.lerp(fescueSunlit, (n2 * 0.45 + sunAspect * 0.45 + microVar) * 0.55);

        // High alpine forest & mountain rock blend
        const forestMix = c.clone().copy(forestDark).lerp(forestCanopy, canopyClumps * 0.65 + 0.2);
        if (slope > 0.62) forestMix.lerp(forestSunlit, (slope - 0.62) * 1.5);

        c.lerp(forestMix, Math.max(altFactor * 0.85, steepFactor * 0.6));
        
        // High steep mountain granite crags on slopes > 30° (Ny < 0.85)
        const rockMix = Math.max(0.0, Math.min(1.0, (0.85 - slope) / 0.25));
        c.lerp(rockCliff, rockMix * 0.78);
        c.lerp(screeGravel, rockMix * nErode * 0.35);
        c.lerp(ironOxide, rockMix * n1 * 0.20);

        // Delicate snow-capped peak tinting only on extreme heights > 280m (never on 182m waterfall headwall!)
        if (h > 280.0) {
          const snowT = Math.min(1.0, (h - 280.0) / 60.0) * Math.max(0.0, (slope - 0.55) / 0.35);
          c.lerp(iceBlueSSS, snowT * 0.35);
          c.lerp(alpineSnow, snowT * 0.65);
        }

        // River gravel banks & alluvial silt transitions
        const dRiver = distToRiver(x, z);
        if (dRiver < 26.0 && z <= 915 && z > -370) {
          const bankFactor = Math.max(0.0, 1.0 - dRiver / 26.0);
          const siltFactor = Math.max(0.0, 1.0 - dRiver / 9.5);
          c.lerp(riverGravel, bankFactor * (0.48 + n1 * 0.28));
          c.lerp(riverSilt, siltFactor * 0.62);
        }
      }

      const dRoad = distToRoads(x, z);
      if (dRoad < 4.8 && z <= 915) {
        const roadF = Math.max(0, 1.0 - dRoad / 4.8);
        c.lerp(_roadTint, roadF * 0.70);
      }

      colors[i * 3]     = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('position', pos);
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    console.log("[world3d] _terrain Pass 2 done", performance.now()); geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aCreviceAO', new THREE.BufferAttribute(creviceAOs, 1));
     geo.computeBoundingSphere();
    geo.computeBoundingBox();
    
    // Procedural generation of 1024x1024 textures locks the main thread for 14+ seconds.
    // We cap procedural generation at 64 to allow sub-second loading.
     const procSize = 64;
    const isHigh = typeof window !== 'undefined' && window.innerWidth > 768 ? 1024 : 512;
     const groundDetailTex = textures('groundDetail', isHigh);
     const orthophotoTex = textures('satelliteOrthophoto', procSize);
     const photoRockTex = textures('photogrammetryRock', isHigh);
    const mossyScreeTex = textures('mossyScree', isHigh);
    const meadowTex = textures('meadowLush', isHigh);
     const snowTex = textures('alpineSnowDrift', procSize);

    
    [
      groundDetailTex.map, groundDetailTex.normalMap, groundDetailTex.roughnessMap,
      orthophotoTex.map,
      photoRockTex.map, photoRockTex.normalMap, photoRockTex.roughnessMap, photoRockTex.aoMap,
      mossyScreeTex.map, mossyScreeTex.normalMap, mossyScreeTex.roughnessMap, mossyScreeTex.aoMap,
      meadowTex.map, meadowTex.normalMap, meadowTex.roughnessMap, meadowTex.aoMap,
      snowTex.map, snowTex.normalMap, snowTex.roughnessMap, snowTex.aoMap,
    ].forEach(t => {
      if (t) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = this.world.renderer.capabilities.getMaxAnisotropy?.() || 16;
      }
    });

    const mat = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.02,
      envMapIntensity: 1.1,
      clearcoat: 0.05,
      clearcoatRoughness: 0.8,
    });
    mat.color.setRGB(1.0, 1.0, 1.0);

    // High-performance slope-dependent triplanar blended terrain shader with crevice AO & snow caps
    mat.onBeforeCompile = (shader) => {
      if (!this._terrainShaders) this._terrainShaders = []; this._terrainShaders.push(shader);
      shader.uniforms.uSunDir = { value: this.world.lighting._sunDir ? this.world.lighting._sunDir.clone() : new THREE.Vector3(0.4, 0.8, 0.5).normalize() };
      shader.uniforms.uGroundDetail = { value: groundDetailTex.map };
      shader.uniforms.uGroundDetailNorm = { value: groundDetailTex.normalMap };
      shader.uniforms.uOrthophoto = { value: orthophotoTex.map };
      shader.uniforms.uMeadowMap = { value: meadowTex.map };
      shader.uniforms.uMeadowNorm = { value: meadowTex.normalMap };
      shader.uniforms.uScreeMap = { value: mossyScreeTex.map };
      shader.uniforms.uCliffMap = { value: photoRockTex.map };
      shader.uniforms.uCliffNorm = { value: photoRockTex.normalMap };
      shader.uniforms.uSnowMap = { value: snowTex.map };
      shader.uniforms.uTime = { value: 0 };
      
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         attribute float aCreviceAO;
         varying vec3 vCustomWorldNormal;
         varying vec3 vCustomWorldPosition;
         varying vec3 vTerrainColor;
         varying float vCreviceAO;`
      ).replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
         vCustomWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);`
      ).replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vCustomWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
         vTerrainColor = color;
         vCreviceAO = aCreviceAO;`
      );

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `
          #include <common>
          uniform vec3 uSunDir;
          uniform sampler2D uGroundDetail;
          uniform sampler2D uGroundDetailNorm;
          uniform sampler2D uOrthophoto;
          uniform sampler2D uMeadowMap;
          uniform sampler2D uMeadowNorm;
          uniform sampler2D uScreeMap;
          uniform sampler2D uCliffMap;
          uniform sampler2D uCliffNorm;
          uniform sampler2D uSnowMap;
          uniform float uTime;
          varying vec3 vCustomWorldNormal;
          varying vec3 vCustomWorldPosition;
          varying vec3 vTerrainColor;
          varying float vCreviceAO;
        `)
        .replace('#include <normal_fragment_begin>', `
          #include <normal_fragment_begin>
          // Slope distribution: Meadow flats (<30°, Ny >= 0.85), Scree / Mossy Ledges, and Granite Cliffs (>30°, Ny < 0.85)
          float slopeN = clamp(vCustomWorldNormal.y, 0.0, 1.0);
          float cliffWeightN = 1.0 - smoothstep(0.60, 0.85, slopeN);
          float meadowWeightN = smoothstep(0.78, 0.92, slopeN);
          float screeWeightN = clamp(1.0 - cliffWeightN - meadowWeightN, 0.0, 1.0);
          float totalWeightN = cliffWeightN + meadowWeightN + screeWeightN + 0.0001;
          cliffWeightN /= totalWeightN;
          meadowWeightN /= totalWeightN;
          screeWeightN /= totalWeightN;

          // 1. Lush Fescue Meadow Grass & groundDetail micro-blade normal mapping
          vec3 gNorm1 = texture2D(uMeadowNorm, vCustomWorldPosition.xz * 0.045).xyz * 2.0 - 1.0;
          vec3 gNorm2 = texture2D(uMeadowNorm, vCustomWorldPosition.xz * 0.045).xyz * 2.0 - 1.0;
          vec3 gNorm3 = texture2D(uGroundDetailNorm, vCustomWorldPosition.xz * 0.06).xyz * 2.0 - 1.0;
          vec3 grassTangentNorm = normalize(gNorm1 * 0.52 + gNorm2 * 0.30 + gNorm3 * 0.22);
          vec3 grassWorldNorm = normalize(vec3(grassTangentNorm.x * 1.35, 1.0, grassTangentNorm.y * 1.35));

          // 2. Mossy Scree Slopes gravel pebble & rounded moss cushion normal mapping
          vec3 sNorm1 = texture2D(uCliffNorm, vCustomWorldPosition.xz * 0.09).xyz * 2.0 - 1.0;
          vec3 sNorm2 = texture2D(uCliffNorm, vCustomWorldPosition.xz * 0.022).xyz * 2.0 - 1.0;
          vec3 screeTangentNorm = normalize(sNorm1 * 0.75 + sNorm2 * 0.35);
          vec3 screeWorldNorm = normalize(vec3(screeTangentNorm.x * 1.25, 1.0, screeTangentNorm.y * 1.25));

          // 3. 6th-power pow(6.0) Triplanar Granite Cliff Rock normal mapping (sharp vertical fractures, zero vertical stretch)
          vec3 blendingNorm = pow(abs(vCustomWorldNormal), vec3(6.0));
          blendingNorm /= (blendingNorm.x + blendingNorm.y + blendingNorm.z + 0.0001);

          vec3 normX1 = texture2D(uCliffNorm, vCustomWorldPosition.zy * 0.040).xyz * 2.0 - 1.0;
          vec3 normY1 = texture2D(uCliffNorm, vCustomWorldPosition.xz * 0.040).xyz * 2.0 - 1.0;
          vec3 normZ1 = texture2D(uCliffNorm, vCustomWorldPosition.xy * 0.040).xyz * 2.0 - 1.0;

          vec3 normX2 = texture2D(uCliffNorm, vCustomWorldPosition.zy * 0.010).xyz * 2.0 - 1.0;
          vec3 normY2 = texture2D(uCliffNorm, vCustomWorldPosition.xz * 0.010).xyz * 2.0 - 1.0;
          vec3 normZ2 = texture2D(uCliffNorm, vCustomWorldPosition.xy * 0.010).xyz * 2.0 - 1.0;

          vec3 normX3 = vec3(0.0);
          vec3 normY3 = vec3(0.0);
          vec3 normZ3 = vec3(0.0);

          vec3 normX = normalize(normX1 * 0.55 + normX2 * 0.35 + normX3 * 0.22);
          vec3 normY = normalize(normY1 * 0.55 + normY2 * 0.35 + normY3 * 0.22);
          vec3 normZ = normalize(normZ1 * 0.55 + normZ2 * 0.35 + normZ3 * 0.22);

          vec3 cliffWorldX = vec3(0.0, normX.y, normX.x * sign(vCustomWorldNormal.x));
          vec3 cliffWorldY = vec3(normY.x, 0.0, normY.y * sign(vCustomWorldNormal.y));
          vec3 cliffWorldZ = vec3(normZ.x * sign(vCustomWorldNormal.z), normZ.y, 0.0);
          vec3 cliffWorldNorm = normalize(vCustomWorldNormal + (cliffWorldX * blendingNorm.x + cliffWorldY * blendingNorm.y + cliffWorldZ * blendingNorm.z) * 2.2);

          // 4. Snowy Mountain Ridge Caps normal mapping (extreme heights > 280m only)
          vec3 snowNorm1 = texture2D(uMeadowNorm, vCustomWorldPosition.xz * 0.08).xyz * 2.0 - 1.0;
          vec3 snowNorm2 = texture2D(uMeadowNorm, vCustomWorldPosition.xz * 0.02).xyz * 2.0 - 1.0;
          vec3 snowTangentNorm = normalize(snowNorm1 * 0.70 + snowNorm2 * 0.35);
          vec3 snowWorldNorm = normalize(vec3(snowTangentNorm.x * 0.95, 1.0, snowTangentNorm.y * 0.95));

          // Snow distribution: extreme high peaks > 280m only (preserves waterfall headwall as 100% natural rock)
          float snowElevationN = smoothstep(280.0, 360.0, vCustomWorldPosition.y + sin(vCustomWorldPosition.x * 0.015 + vCustomWorldPosition.z * 0.015) * 6.0);
          float snowSlopeN = smoothstep(0.55, 0.85, slopeN);
          float snowMaskN = clamp(snowElevationN * snowSlopeN, 0.0, 1.0);

          // Blend world-space micro-relief normals across the terrain zones
          vec3 blendedTerrainNorm = normalize(
            grassWorldNorm * meadowWeightN * (1.0 - snowMaskN) +
            screeWorldNorm * screeWeightN * (1.0 - snowMaskN) +
            cliffWorldNorm * cliffWeightN * (1.0 - snowMaskN * 0.75) +
            snowWorldNorm * snowMaskN
          );

          // Transform blended normal into view space and combine with geometric normal
          vec3 viewPerturb = normalize((viewMatrix * vec4(blendedTerrainNorm, 0.0)).xyz);
          normal = normalize(mix(normal, viewPerturb, 0.88));
        `)
        .replace('#include <map_fragment>', `
          #include <map_fragment>
          float slope = clamp(vCustomWorldNormal.y, 0.0, 1.0);

          // Slope blending: flats (<30°, Ny >= 0.85), scree, sheer cliffs (>30°, Ny < 0.85)
          float cliffFactor = 1.0 - smoothstep(0.60, 0.85, slope);
          float meadowFactor = smoothstep(0.78, 0.92, slope);
          float screeFactor = clamp(1.0 - cliffFactor - meadowFactor, 0.0, 1.0);
          float totalFactor = cliffFactor + meadowFactor + screeFactor + 0.0001;
          cliffFactor /= totalFactor;
          meadowFactor /= totalFactor;
          screeFactor /= totalFactor;

          // 1. Photorealistic Alpine Meadow Grass Albedo (70% photo-driven, 30% artistic tint)
          vec3 grassFine   = texture2D(uMeadowMap, vCustomWorldPosition.xz * 0.08).rgb;
          vec3 grassMid    = texture2D(uMeadowMap, vCustomWorldPosition.xz * 0.02).rgb;
          
          // Photographic PBR texture is primary color source
          vec3 photoGrass = grassFine * (grassMid * 0.6 + 0.55);
          
          // Subtle artistic Swiss Alps tinting overlay (30% influence)
          vec3 fescueTint = mix(vec3(0.16, 0.36, 0.10), vec3(0.32, 0.62, 0.18), grassFine.g);
          vec3 meadowAlbedo = mix(photoGrass, fescueTint, 0.30);

          // Subtle tonal drifts: golden clover accents and cool shaded emerald
          float macroColorDrift = sin(vCustomWorldPosition.x * 0.012 + vCustomWorldPosition.z * 0.008) * cos(vCustomWorldPosition.z * 0.010);
          vec3 sunlitLimeGreen = vec3(1.18, 1.34, 0.88);
          vec3 shadedEmerald = vec3(0.88, 1.06, 0.94);
          vec3 goldCloverAccents = vec3(1.30, 1.25, 0.70);

          meadowAlbedo = mix(meadowAlbedo, meadowAlbedo * sunlitLimeGreen, clamp(macroColorDrift * 0.35 + 0.20, 0.0, 0.50));
          meadowAlbedo = mix(meadowAlbedo, meadowAlbedo * shadedEmerald, clamp(-macroColorDrift * 0.35 + 0.15, 0.0, 0.38));
          float cloverPatch = pow(texture2D(uMeadowMap, vCustomWorldPosition.xz * 0.045).g, 2.4);
          meadowAlbedo = mix(meadowAlbedo, meadowAlbedo * goldCloverAccents, cloverPatch * 0.30);

          // Living chlorophyll sunlit sheen & waxy cuticular sun sheen with backlight forward transmission
          vec3 sunDir = normalize(uSunDir);
          vec3 viewDir = normalize(cameraPosition - vCustomWorldPosition + vec3(0.0001));
          vec3 halfVec = normalize(sunDir + viewDir);
          float bladeNdotH = max(0.0, dot(vCustomWorldNormal, halfVec));
          float bladeSpecular = pow(bladeNdotH, 28.0) * 0.42 * meadowFactor;
          vec3 bladeSheenCol = vec3(0.92, 1.05, 0.78) * bladeSpecular;

          float sunDot = max(0.0, dot(vCustomWorldNormal, sunDir));
          float backLight = max(0.0, dot(-viewDir, sunDir));
          vec3 chlorophyllSunGlow = vec3(0.29, 0.53, 0.16) * (pow(sunDot, 1.3) * 0.45 + pow(backLight, 2.6) * 0.38) * meadowFactor;
          meadowAlbedo += chlorophyllSunGlow;

          // 2. Mossy Scree Slopes Albedo (weathered gravel, quartzite pebbles & emerald moss)
          vec3 screeFine = texture2D(uScreeMap, vCustomWorldPosition.xz * 0.09).rgb;
          vec3 screeMacro = texture2D(uScreeMap, vCustomWorldPosition.xz * 0.022).rgb;
          vec3 screeAlbedo = screeFine * (screeMacro * 1.14 + 0.32);

          // 3. 6th-power pow(6.0) Triplanar Granite Cliff Rock Albedo (zero vertical stretch, sharp fractures & dark iron oxide stains)
          vec3 blendingCol = pow(abs(vCustomWorldNormal), vec3(6.0));
          blendingCol /= (blendingCol.x + blendingCol.y + blendingCol.z + 0.0001);

          vec3 cliffX1 = texture2D(uCliffMap, vCustomWorldPosition.zy * 0.040).rgb;
          vec3 cliffY1 = texture2D(uCliffMap, vCustomWorldPosition.xz * 0.040).rgb;
          vec3 cliffZ1 = texture2D(uCliffMap, vCustomWorldPosition.xy * 0.040).rgb;
          vec3 cliffDetail1 = cliffX1 * blendingCol.x + cliffY1 * blendingCol.y + cliffZ1 * blendingCol.z;

          vec3 cliffX2 = texture2D(uCliffMap, vCustomWorldPosition.zy * 0.010).rgb;
          vec3 cliffY2 = texture2D(uCliffMap, vCustomWorldPosition.xz * 0.010).rgb;
          vec3 cliffZ2 = texture2D(uCliffMap, vCustomWorldPosition.xy * 0.010).rgb;
          vec3 cliffDetail2 = cliffX2 * blendingCol.x + cliffY2 * blendingCol.y + cliffZ2 * blendingCol.z;

          vec3 cliffX3 = texture2D(uCliffMap, vCustomWorldPosition.zy * 0.12).rgb;
          vec3 cliffY3 = texture2D(uCliffMap, vCustomWorldPosition.xz * 0.12).rgb;
          vec3 cliffZ3 = texture2D(uCliffMap, vCustomWorldPosition.xy * 0.12).rgb;
          vec3 cliffDetail3 = cliffX3 * blendingCol.x + cliffY3 * blendingCol.y + cliffZ3 * blendingCol.z;

          vec3 triplanarCliff = cliffDetail1 * (cliffDetail2 * 1.25 + 0.25) * (cliffDetail3 * 0.65 + 0.68);

          // Mossy rock shelves on intermediate slopes
          float intermediateShelf = smoothstep(0.65, 0.88, slope) * (1.0 - meadowFactor);
          vec3 shelfMoss = screeAlbedo * vec3(0.92, 1.26, 0.84);
          triplanarCliff = mix(triplanarCliff, shelfMoss, intermediateShelf * 0.65);

          // Splat the three geological layers with continuous smooth weighting
          vec3 groundBase = meadowAlbedo * meadowFactor + screeAlbedo * screeFactor + triplanarCliff * cliffFactor;

          // 4. Delicate Snow-Capped Mountain Peaks with Ice-Blue Subsurface Scattering on Extreme Heights > 280m
          float snowElevation = smoothstep(280.0, 360.0, vCustomWorldPosition.y + sin(vCustomWorldPosition.x * 0.015 + vCustomWorldPosition.z * 0.015) * 6.0);
          float snowSlope = smoothstep(0.55, 0.85, slope);
          float snowFactor = clamp(snowElevation * snowSlope, 0.0, 1.0);

          vec3 snowFine = texture2D(uSnowMap, vCustomWorldPosition.xz * 0.08).rgb;
          vec3 snowMacro = texture2D(uSnowMap, vCustomWorldPosition.xz * 0.02).rgb;
          vec3 snowAlbedo = snowFine * (snowMacro * 0.85 + 0.35);

          // Ice-blue Subsurface Scattering forward-scattering glow
          float snowSunDot = max(0.0, dot(vCustomWorldNormal, sunDir));
          float snowBackLight = max(0.0, dot(-viewDir, sunDir));
          float snowSSS = (pow(snowBackLight, 3.2) * 0.58 + pow(snowSunDot, 1.25) * 0.42) * snowFactor;
          vec3 snowIceBlueSSSGlow = vec3(0.471, 0.659, 0.800) * snowSSS; // Ice-blue subsurface radiance

          // Sparkling micro-specular crystal glints on sunlit snow
          float snowHalfDot = max(0.0, dot(vCustomWorldNormal, halfVec));
          float snowGlint = pow(snowHalfDot, 48.0) * 0.55 * snowFactor;

          // Scree moraine / talus transition around snowline base
          float snowMeltBorder = smoothstep(0.05, 0.45, snowElevation) * (1.0 - smoothstep(0.45, 0.85, snowElevation)) * (1.0 - cliffFactor);
          groundBase = mix(groundBase, screeAlbedo * 0.92 + vec3(0.04, 0.05, 0.06), snowMeltBorder * 0.45);

          // Blend in snow caps
          groundBase = mix(groundBase, snowAlbedo, snowFactor);

          // Macro Aerial Satellite Orthophoto drape over valley floor
          vec2 orthoUv = (vCustomWorldPosition.xz + vec2(1000.0, 1000.0)) / 2000.0;
          vec3 satelliteDraped = texture2D(uOrthophoto, orthoUv).rgb;
          groundBase = mix(groundBase, groundBase * (satelliteDraped * 1.28 + 0.38), 0.36 * meadowFactor * (1.0 - snowFactor));

          // 5. Layered Triplanar Granite Cliff Strata with Wet Rock Sheen, Cascade Spray Moisture & Mossy Shelves (|x| < 75, z < -290)
          float isWaterfallChasm = (1.0 - smoothstep(24.0, 75.0, abs(vCustomWorldPosition.x))) * smoothstep(-580.0, -290.0, vCustomWorldPosition.z);
          if (isWaterfallChasm > 0.001) {
            vec3 wetCliffStrata = triplanarCliff * vec3(0.55, 0.58, 0.62) + vec3(0.05, 0.06, 0.07);
            float shelfSpray = smoothstep(0.55, 0.88, slope);
            vec3 gorgeMoss = screeAlbedo * vec3(0.75, 1.18, 0.70) * (grassFine * 0.6 + 0.5);
            vec3 gorgeRock = mix(wetCliffStrata, gorgeMoss, shelfSpray * 0.55);
            float gorgeSpec = pow(max(0.0, dot(vCustomWorldNormal, halfVec)), 24.0) * 0.35 * (1.0 - shelfSpray * 0.5);
            gorgeRock += vec3(0.70, 0.85, 0.95) * gorgeSpec;
            groundBase = mix(groundBase, gorgeRock, isWaterfallChasm * 0.88);
          }

          // Shoreline wet sand transition only immediately adjacent to Mirror Lake perimeter
          float distToLakeEdge = length(vCustomWorldPosition.xz - vec2(430.0, -260.0));
          float isLakeShore = (1.0 - smoothstep(285.0, 305.0, distToLakeEdge)) * smoothstep(270.0, 285.0, distToLakeEdge);
          float waterDist = max(0.0, vCustomWorldPosition.y - 12.5);
          float shorelineWet = (1.0 - smoothstep(0.0, 0.6, waterDist)) * isLakeShore * (1.0 - cliffFactor);
          vec3 wetSandCol = vec3(0.34, 0.30, 0.24) * (grassFine * 0.35 + 0.75);
          groundBase = mix(groundBase, wetSandCol, shorelineWet * 0.70);

          vec3 finalAlbedo = groundBase;

          // Multiply baked dual-radius vertex crevice ambient occlusion (darkens valleys, couloirs, and cliffs)
          finalAlbedo *= (vCreviceAO * 0.78 + 0.22);

          // Multi-octave organic procedural drifting cloud shadows across landscape
          float cloudDrift1 = sin(vCustomWorldPosition.x * 0.0016 + vCustomWorldPosition.z * 0.0012 + uTime * 0.075) *
                              cos(vCustomWorldPosition.z * 0.0014 - vCustomWorldPosition.x * 0.0006 - uTime * 0.045);
          float cloudDrift2 = sin(vCustomWorldPosition.x * 0.0034 - vCustomWorldPosition.z * 0.0028 - uTime * 0.09) * 0.35;
          float cloudShadowMask = smoothstep(0.12, 0.68, cloudDrift1 + cloudDrift2);
          diffuseColor.rgb = (finalAlbedo + bladeSheenCol + snowIceBlueSSSGlow + vec3(snowGlint)) * mix(1.0, 0.74, cloudShadowMask);
        `)
        .replace('#include <roughnessmap_fragment>', `
          #include <roughnessmap_fragment>
          float slopeRough = clamp(vCustomWorldNormal.y, 0.0, 1.0);
          float cFactorRough = 1.0 - smoothstep(0.60, 0.85, slopeRough);
          float mFactorRough = smoothstep(0.78, 0.92, slopeRough);
          float sFactorRough = clamp(1.0 - cFactorRough - mFactorRough, 0.0, 1.0);
          float tFactorRough = cFactorRough + mFactorRough + sFactorRough + 0.0001;
          float terrainRough = 0.72 * (mFactorRough / tFactorRough) + 0.86 * (sFactorRough / tFactorRough) + 0.82 * (cFactorRough / tFactorRough);

          float snowElevR = smoothstep(280.0, 360.0, vCustomWorldPosition.y + sin(vCustomWorldPosition.x * 0.015 + vCustomWorldPosition.z * 0.015) * 6.0);
          float snowSlopeR = smoothstep(0.55, 0.85, slopeRough);
          float snowMaskR = clamp(snowElevR * snowSlopeR, 0.0, 1.0);
          terrainRough = mix(terrainRough, 0.65, snowMaskR);

          float isWFallChasm = (1.0 - smoothstep(24.0, 75.0, abs(vCustomWorldPosition.x))) * smoothstep(-580.0, -290.0, vCustomWorldPosition.z);
          float dToLakeRough = length(vCustomWorldPosition.xz - vec2(430.0, -260.0));
          float isLakeShoreRough = (1.0 - smoothstep(285.0, 305.0, dToLakeRough)) * smoothstep(270.0, 285.0, dToLakeRough);
          float wDist = max(0.0, vCustomWorldPosition.y - 12.5);
          float sWet = (1.0 - smoothstep(0.0, 0.6, wDist)) * isLakeShoreRough * (1.0 - (cFactorRough / tFactorRough));
          terrainRough = mix(terrainRough, 0.18, isWFallChasm * 0.85);
          terrainRough = mix(terrainRough, 0.28, sWet * 0.75);
          roughnessFactor = clamp(terrainRough, 0.04, 1.0);
        `)
        .replace('#include <color_fragment>', '');
    };

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.world.scene.add(mesh); console.log("[world3d] mesh added to scene", performance.now());
    this.terrainMesh = mesh;
  
        if (false) {
      // Streaming Close-Range Patch disabled per P0-C Option 1
    } else {
      this.terrainPatch = null;
      this._updateTerrainPatch = () => {};
    }
  }

  async _water() {
    let normals;
    try {
      const normTex = textures('waterNormals');
      const src = normTex?.normalMap || normTex?.normal || normTex;
      normals = src && typeof src.clone === 'function' ? src.clone() : null;
    } catch (e) {
      console.warn('[water] normal texture failed, using fallback', e);
    }
    if (!normals) {
      // Fallback: create a flat normal texture so water still renders
      const c = document.createElement('canvas');
      c.width = c.height = 4;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#8080ff'; // flat normal pointing up
      ctx.fillRect(0, 0, 4, 4);
      normals = new THREE.CanvasTexture(c);
    }
    normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
    normals.repeat.set(16, 16);
    this._waterNormals = normals;
    this._fountainBasinMat = this._createFountainBasinMaterial(normals);
    this._fountainCascadeMat = this._createFountainCascadeMaterial(normals);
    this.riverMat = this._createRiverMaterial(normals);

    // Photorealistic Crystalline Mirror Lake with Concentric Ring Tessellation, Gerstner Swells, Dielectric Fresnel & Beer-Lambert Depth
    const lakeRadius = WORLD.lake.r;
    const rings = 36;
    const segments = 96;
    const positions = [];
    const uvs = [];
    const indices = [];

    // Center vertex
    positions.push(0, 0, 0);
    uvs.push(0.5, 0.5);

    // Concentric ring vertices
    for (let r = 1; r <= rings; r++) {
      const rad = (r / rings) * lakeRadius;
      for (let s = 0; s < segments; s++) {
        const theta = (s / segments) * Math.PI * 2;
        const x = Math.cos(theta) * rad;
        const z = Math.sin(theta) * rad;
        positions.push(x, 0, z);
        uvs.push((x / (lakeRadius * 2)) + 0.5, (z / (lakeRadius * 2)) + 0.5);
      }
    }

    // Center fan indices
    for (let s = 0; s < segments; s++) {
      const next = (s + 1) % segments;
      indices.push(0, s + 1, next + 1);
    }

    // Concentric quad indices
    for (let r = 1; r < rings; r++) {
      const rowA = 1 + (r - 1) * segments;
      const rowB = 1 + r * segments;
      for (let s = 0; s < segments; s++) {
        const next = (s + 1) % segments;
        const a = rowA + s;
        const b = rowB + s;
        const c = rowB + next;
        const d = rowA + next;
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    const lakeGeo = new THREE.BufferGeometry();
    lakeGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    lakeGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    lakeGeo.setIndex(indices);
    lakeGeo.computeVertexNormals();

    const lakeMat = this._createPhysicalWaterMaterial(this._waterNormals, 'lake');
    this._lakeShader = lakeMat;
    lakeGeo.computeBoundingSphere();
    lakeGeo.computeBoundingBox();
    const lake = new THREE.Mesh(lakeGeo, lakeMat);
    lake.position.set(WORLD.lake.x, WORLD.waterLevel, WORLD.lake.z);
    lake.receiveShadow = true;
    lake.frustumCulled = false;
    lake.renderOrder = 1;
    this.world.scene.add(lake);
    this.lakeWater = lake;
    this.water = lake;
    this._lakeMesh = lake;
    this.waterMat = lakeMat;

    // Delicate animated shoreline foam ring around Mirror Lake perimeter (Eliminates abrupt shorelines)
    const shoreRingGeo = new THREE.RingGeometry(WORLD.lake.r - 2.5, WORLD.lake.r + 2.0, 64, 1);
    shoreRingGeo.computeBoundingSphere();
    const foamVert = `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      #include <fog_pars_vertex>
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      
      vec3 gerstnerWave(vec2 dir, float steepness, float wavelength, vec2 p, float speed, float t) {
          float k = 2.0 * 3.14159265 / wavelength;
          float c = sqrt(9.8 / k);
          vec2 d = normalize(dir);
          float f = k * (dot(d, p) - c * speed * t);
          float a = steepness / k;
          return vec3(
              d.x * (a * cos(f)),
              a * sin(f),
              d.y * (a * cos(f))
          );
      }
      
      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        
        vec3 g1 = gerstnerWave(vec2(1.0, 0.4), 0.12, 12.0, worldPos.xz, 1.2, uTime);
        vec3 g2 = gerstnerWave(vec2(-0.5, 1.0), 0.10, 8.0, worldPos.xz, 1.5, uTime);
        vec3 g3 = gerstnerWave(vec2(0.8, -0.6), 0.08, 5.0, worldPos.xz, 1.8, uTime);
        vec3 gWave = g1 + g2 + g3;
        
        worldPos.xyz += gWave;
        vWorldPos = worldPos.xyz;
        
        gl_Position = projectionMatrix * viewMatrix * worldPos;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }
    `;
    const foamFrag = `
      #include <logdepthbuf_pars_fragment>
      #include <fog_pars_fragment>
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      void main() {
        float radial = abs(vUv.y - 0.5) * 2.0;
        float angle = atan(vWorldPos.z - (${WORLD.lake.z.toFixed(1)}), vWorldPos.x - (${WORLD.lake.x.toFixed(1)}));
        float pulse = sin(angle * 28.0 - uTime * 2.4) * cos(angle * 14.0 + uTime * 1.6);
        float foamLace = noise(vWorldPos.xz * 0.9 + vec2(uTime * 0.25, -uTime * 0.18));
        float foam = 1.0 - smoothstep(0.15, 0.85, radial + pulse * 0.25 + foamLace * 0.15);
        float alpha = foam * (1.0 - smoothstep(0.15, 1.0, radial)) * 0.76;
        vec3 col = mix(vec3(0.68, 0.88, 0.98), vec3(1.0, 1.0, 1.0), foam);
        gl_FragColor = vec4(col, alpha);
        #include <logdepthbuf_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `;
    const shoreFoamMat = new THREE.ShaderMaterial({
      vertexShader: foamVert,
      fragmentShader: foamFrag,
      uniforms: { uTime: { value: 0 } },
      transparent: true, logarithmicDepthBuffer: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const shoreFoamMesh = new THREE.Mesh(shoreRingGeo, shoreFoamMat);
    shoreFoamMesh.rotation.x = -Math.PI / 2;
    shoreFoamMesh.position.set(WORLD.lake.x, WORLD.waterLevel + 0.08, WORLD.lake.z);
    shoreFoamMesh.renderOrder = 2;
    shoreFoamMesh.frustumCulled = false;
    this.world.scene.add(shoreFoamMesh);
    this._shorelineFoamMaterial = shoreFoamMat;

    // Southern Infinite Ocean spanning the entire coastal horizon with physical Gerstner waves & Jacobian whitecaps
    const oceanGeo = new THREE.PlaneGeometry(36000, 24000, 48, 32);
    oceanGeo.rotateX(-Math.PI / 2);
    // Translate ocean plane geometry so its northern boundary begins strictly south of the coastal beach (z >= 1050)
    oceanGeo.translate(0, 0, 12000);
    oceanGeo.computeBoundingSphere();
    oceanGeo.computeBoundingBox();
    const oceanMat = this._createPhysicalWaterMaterial(normals, 'ocean');
    this._oceanShader = oceanMat;
    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.position.y = WORLD.oceanLevel || 0.35;
    oceanMesh.receiveShadow = true;
    oceanMesh.frustumCulled = true;
    oceanMesh.renderOrder = 1;
    this.world.scene.add(oceanMesh);
    this.oceanMesh = oceanMesh;

    const troutSchools = [
      // 1. Highland Glacial Tarn (Top of Waterfall, waterLevel = 182.0m, deep bed at 158.0m -> 24m deep!)
      { cx: 0,   cy: 161.5, cz: -535, radiusX: 38, radiusZ: 32, count: 84, type: 'abyssal_trout' },  // Deep Submerged Granite Floor (20.5m below surface)
      { cx: 16,  cy: 165.0, cz: -515, radiusX: 34, radiusZ: 36, count: 84, type: 'abyssal_trout' },  // Deep Basin Gliders (17m below surface)
      { cx: -18, cy: 169.0, cz: -540, radiusX: 32, radiusZ: 30, count: 84, type: 'glacial_trout' },  // Mid-depth Emerald Alpine Brook Trout (13m below surface)
      { cx: 8,   cy: 172.5, cz: -495, radiusX: 32, radiusZ: 34, count: 78, type: 'glacial_trout' },  // Mid-depth North Channel Brook Trout (9.5m below surface)
      { cx: -15, cy: 175.5, cz: -520, radiusX: 30, radiusZ: 28, count: 72, type: 'sapphire_gliders' }, // West Cathedral Shoreline & Cavern Gliders (6.5m below surface)
      { cx: 12,  cy: 177.0, cz: -545, radiusX: 28, radiusZ: 26, count: 66, type: 'sapphire_gliders' }, // East Cathedral Submerged Shelf (5m below surface)
      { cx: 0,   cy: 179.5, cz: -475, radiusX: 26, radiusZ: 26, count: 66, type: 'rapids_trout' },   // Shallow Waterfall Outflow Lip & Rapids (2.5m below surface)

      // 2. Mountain Waterfall Plunge Pool & Grotto (Base of Waterfall, waterLevel = 18.0m, deep bed at 4.5m -> 13.5m deep!)
      { cx: 0,   cy: 7.5,   cz: -362, radiusX: 34, radiusZ: 34, count: 78, type: 'grotto_trout' },   // Deep Churning Grotto Basin (10.5m below surface)
      { cx: 16,  cy: 11.5,  cz: -355, radiusX: 30, radiusZ: 32, count: 72, type: 'grotto_trout' },   // Mid-Grotto Basin (6.5m below surface)
      { cx: -14, cy: 14.5,  cz: -365, radiusX: 28, radiusZ: 30, count: 66, type: 'cascade_gliders' }, // Cascade Mist Swirlers (3.5m below surface)

      // 3. Rainbow River Canyon & Bridges (waterLevel = 18.0 -> 12.5 -> 7.8m)
      { cx: 75,  cy: 13.0,  cz: -345, radiusX: 32, radiusZ: 28, count: 24, type: 'river_gliders' },  // Inlet River Gorge
      { cx: 0,   cy: 9.2,   cz: 440,  radiusX: 25, radiusZ: 48, count: 26, type: 'river_gliders' },  // Under Rainbow Bridge Span
      { cx: 115, cy: 7.2,   cz: 680,  radiusX: 28, radiusZ: 50, count: 24, type: 'river_gliders' },  // South Estuary Canyon
    ];
    const troutGeo = this._buildKoiMesh();
    // Upgraded to Physical material for wet, scaled, realistic look
    const fishMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, 
      roughness: 0.15, 
      metalness: 0.1, 
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      vertexColors: true
    });
    this._instancedFishMat = fishMat;
    fishMat.onBeforeCompile = function(shader) {
      shader.uniforms.uTime = { value: 0 };
      this.userData.shader = shader;
      
      shader.vertexShader = `
        attribute float aPhase;
        attribute float aSpeed;
        attribute vec3 aColor;
        varying vec3 vInstColor;
        varying vec3 vLocalPos;
        varying vec3 vLocalNormal;
        varying vec2 vFishUv;
        varying float vFinTranslucency;
        varying vec3 vVertColor;
        uniform float uTime;
      ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        `
        #include <beginnormal_vertex>
        // Normal adjustment to match spine curvature
        float swimFreqNorm = aSpeed * 10.5;
        float spinePhaseNorm = aPhase + uTime * swimFreqNorm - (position.z - 1.15) * 2.6;
        float flexGrowthNorm = smoothstep(0.85, -1.95, position.z);
        float bodyAmpNorm = 0.035 + 0.46 * pow(flexGrowthNorm, 1.45);
        float dWaveDz = -2.6 * cos(spinePhaseNorm) * bodyAmpNorm;
        float yawAngle = atan(dWaveDz) * 0.65;
        float cosY = cos(yawAngle);
        float sinY = sin(yawAngle);
        objectNormal = vec3(
          objectNormal.x * cosY + objectNormal.z * sinY,
          objectNormal.y,
          -objectNormal.x * sinY + objectNormal.z * cosY
        );
        `
      );
      
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        vec3 transformed = vec3( position );
        vLocalPos = position;
        vLocalNormal = normal;
        vFishUv = uv;
        vInstColor = aColor;
        #ifdef USE_COLOR
          vVertColor = color;
          vFinTranslucency = ((color.r < 0.95 || color.g < 0.95 || color.b < 0.95) && (color.r > 0.05)) ? 1.0 : 0.0;
        #else
          vVertColor = vec3(1.0);
          vFinTranslucency = 0.0;
        #endif

        // 1. Organic Undulatory Locomotion (Lighthill Slender-Body Dynamics)
        float swimFreq = aSpeed * 10.5;
        float spinePhase = aPhase + uTime * swimFreq - (transformed.z - 1.15) * 2.6;

        // Lateral sway envelope: Stable head, smooth exponential amplitude towards caudal tail
        float flexGrowth = smoothstep(0.85, -1.95, transformed.z);
        float bodyAmp = 0.035 + 0.46 * pow(flexGrowth, 1.45);
        float bodyWave = sin(spinePhase) * bodyAmp;

        // Trailing caudal fin elasticity (fin whip & secondary harmonic)
        float caudalLag = smoothstep(-0.9, -1.95, transformed.z);
        float caudalWhip = sin(spinePhase - 0.75) * 0.14 * caudalLag;

        transformed.x += bodyWave + caudalWhip;

        // Head micro-counter-yaw (momentum conservation)
        float headCounterYaw = smoothstep(0.2, 1.15, transformed.z) * sin(aPhase + uTime * swimFreq + 3.14159) * 0.032;
        transformed.x += headCounterYaw;

        // Pectoral Fin sculling & vertical flutter
        if (abs(position.x) > 0.20 && position.z > 0.10 && position.z < 0.75 && position.y < 0.05) {
          float pecPhase = aPhase + uTime * swimFreq * 1.35 + sign(position.x) * 1.6;
          float pecFlap = sin(pecPhase) * 0.065;
          transformed.y += pecFlap;
          transformed.x += pecFlap * sign(position.x) * 0.55;
        }

        // Dorsal Fin wave ripple
        if (position.y > 0.25 && position.z < 0.35 && position.z > -0.65) {
          float dorsalRipple = sin(spinePhase + position.z * 3.2) * 0.045 * smoothstep(0.25, 0.55, position.y);
          transformed.x += dorsalRipple;
        }
        `
      );

      shader.fragmentShader = `
        varying vec3 vInstColor;
        varying vec3 vLocalPos;
        varying vec3 vLocalNormal;
        varying vec2 vFishUv;
        varying float vFinTranslucency;
        varying vec3 vVertColor;

        // Precision procedural ctenoid/cycloid scale generator
        float ctenoidScales(vec2 uv) {
          vec2 st = uv * vec2(26.0, 16.0);
          st.x += step(1.0, mod(st.y, 2.0)) * 0.5;
          vec2 g = fract(st) - vec2(0.5, 0.3);
          float d = length(g);
          float ridge = smoothstep(0.48, 0.38, d) * smoothstep(0.12, 0.36, d);
          float plate = smoothstep(0.46, 0.10, d);
          return plate * 0.65 + ridge * 0.55;
        }

        // Multi-spectrum Guanine crystal iridescence (violet -> cyan -> gold)
        vec3 fishIridescence(vec3 norm, vec3 viewD, vec3 baseCol, float zPos) {
          float NdotV = clamp(dot(norm, viewD), 0.0, 1.0);
          float fresnel = pow(1.0 - NdotV, 2.2);
          vec3 thinFilm = vec3(0.5) + 0.5 * cos(vec3(0.0, 2.1, 4.2) + fresnel * 4.5 + zPos * 1.8);
          return mix(baseCol, thinFilm * 1.25, fresnel * 0.42);
        }
      ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        diffuseColor.rgb *= vInstColor;

        bool isEye = vVertColor.r < 0.05 && vVertColor.g < 0.05 && vVertColor.b < 0.05;
        bool isFin = vFinTranslucency > 0.5;

        if (isEye) {
          // Photorealistic 3D Corneal Eye: Obsidian pupil with shimmering 24K Gold iris
          float eyeDist = length(vec2(vLocalPos.y - 0.10, vLocalPos.z - 0.76));
          float pupil = smoothstep(0.042, 0.032, eyeDist);
          float irisRing = smoothstep(0.075, 0.042, eyeDist) * (1.0 - pupil);
          vec3 irisColor = vec3(1.0, 0.82, 0.28);
          diffuseColor.rgb = mix(irisColor, vec3(0.02, 0.02, 0.03), pupil);
        } else if (isFin) {
          // Fin membrane: Ray striations, translucent light transmission, edge rim glow
          float rayUv = vFishUv.x * 32.0 + vFishUv.y * 12.0;
          float rays = sin(rayUv * 6.28318) * 0.5 + 0.5;
          rays = pow(rays, 1.6);
          vec3 rayCol = mix(vInstColor * 1.15, vec3(0.95, 0.98, 1.0), 0.35);
          vec3 membraneCol = vInstColor * 0.75;
          diffuseColor.rgb = mix(membraneCol, rayCol, rays * 0.6);
          diffuseColor.rgb += vInstColor * 0.30;
          diffuseColor.a *= 0.82;
        } else {
          // Photorealistic Body Skin
          float scales = ctenoidScales(vec2(vFishUv.y * 3.5, vFishUv.x));
          vec3 viewDir = normalize(vViewPosition);
          diffuseColor.rgb = fishIridescence(normalize(vLocalNormal), viewDir, diffuseColor.rgb, vLocalPos.z);
          diffuseColor.rgb *= mix(0.78, 1.22, scales);
          
          // Realistic Countershading: Dark dorsal crest, shimmering lateral line, pearlescent ventral belly
          float dorsalShade = smoothstep(-0.15, 0.38, vLocalPos.y);
          float lateralBand = exp(-pow((vLocalPos.y + 0.02) * 6.0, 2.0));
          diffuseColor.rgb = mix(diffuseColor.rgb * vec3(1.15, 1.12, 1.05), diffuseColor.rgb * 0.72, dorsalShade * 0.45);
          diffuseColor.rgb += vec3(0.12, 0.15, 0.18) * lateralBand;
          
          float ventralBright = smoothstep(0.0, -0.35, vLocalPos.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.90, 0.85) * (vInstColor * 0.4 + 0.6), ventralBright * 0.55);
        }
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `
        #include <normal_fragment_maps>
        if (!isEye && !isFin) {
          vec2 eps = vec2(0.008, 0.0);
          vec2 uvCoord = vec2(vFishUv.y * 3.5, vFishUv.x);
          float s0 = ctenoidScales(uvCoord);
          float sU = ctenoidScales(uvCoord + eps.xy);
          float sV = ctenoidScales(uvCoord + eps.yx);
          vec3 scaleNormal = normalize(vec3((sU - s0) * 2.2, (sV - s0) * 2.2, 0.55));
          normal = normalize(normal + scaleNormal * 0.38);
        }
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `
        #include <roughnessmap_fragment>
        if (isEye) {
          roughnessFactor = 0.02;
        } else if (isFin) {
          roughnessFactor = 0.22;
        } else {
          roughnessFactor = 0.12;
        }
        `
      );
    };
    const troutFish = [];
    const troutRng = mulberry32(112233);
    troutSchools.forEach(sch => {
      for (let i = 0; i < sch.count; i++) {
        const ang = (i / sch.count) * Math.PI * 2 + (troutRng() - 0.5) * 0.6;
        const radX = (troutRng() * 0.80 + 0.20) * sch.radiusX;
        const radZ = (troutRng() * 0.80 + 0.20) * sch.radiusZ;
        const depth = (troutRng() - 0.5) * 3.2;
        let color = [0.22, 0.82, 0.65]; // Emerald brook trout
        const cPick = troutRng();
        if (sch.type === 'abyssal_trout') {
          color = cPick < 0.5 ? [0.15, 0.68, 0.95] : [0.08, 0.45, 0.85];
        } else if (sch.type === 'sapphire_gliders') {
          color = cPick < 0.5 ? [0.35, 0.75, 0.98] : [0.85, 0.92, 0.98];
        } else if (sch.type === 'grotto_trout') {
          color = cPick < 0.5 ? [0.28, 0.85, 0.62] : [0.18, 0.65, 0.55];
        } else if (sch.type === 'rapids_trout' || sch.type === 'cascade_gliders') {
          color = cPick < 0.5 ? [0.95, 0.45, 0.22] : [0.92, 0.85, 0.35];
        } else {
          color = cPick < 0.6 ? [0.22, 0.82, 0.65] : [0.32, 0.72, 0.92];
        }
        troutFish.push({
          center: { x: sch.cx, y: sch.cy, z: sch.cz },
          radiusX: radX, radiusZ: radZ,
          angle: ang, yOffset: depth,
          phase: troutRng() * Math.PI * 2,
          speed: (troutRng() * 0.4 + 0.6) * 1.2,
          orbitSpeed: (troutRng() * 0.4 + 0.6) * 0.08,
          dir: troutRng() < 0.5 ? 1 : -1,
          wanderAmp: troutRng() * 8.0 + 4.0,
          vertAmp: troutRng() * 0.45 + 0.35,
          scale: troutRng() * 0.4 + 0.8,
          color: color
        });
      }
    });

    const troutCount = troutFish.length;
    troutGeo.computeBoundingSphere();
    const troutMesh = new THREE.InstancedMesh(troutGeo, fishMat, troutCount);

    const troutPhases = new Float32Array(troutCount);
    const troutSpeeds = new Float32Array(troutCount);
    const troutColors = new Float32Array(troutCount * 3);

    const initDummy = new THREE.Object3D();
    troutFish.forEach((f, i) => {
      troutPhases[i] = f.phase;
      troutSpeeds[i] = f.speed;
      troutColors[i * 3]     = f.color[0];
      troutColors[i * 3 + 1] = f.color[1];
      troutColors[i * 3 + 2] = f.color[2];

      const fx = f.center.x + Math.cos(f.angle) * f.radiusX;
      const fz = f.center.z + Math.sin(f.angle) * f.radiusZ;
      const fy = f.center.y + f.yOffset;
      initDummy.position.set(fx, fy, fz);
      initDummy.rotation.set(0, f.angle + Math.PI / 2, 0);
      initDummy.scale.setScalar(f.scale);
      initDummy.updateMatrix();
      troutMesh.setMatrixAt(i, initDummy.matrix);
    });

    troutGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(troutPhases, 1));
    troutGeo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(troutSpeeds, 1));
    troutGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(troutColors, 3));
    troutMesh.instanceMatrix.needsUpdate = true;
    troutMesh.frustumCulled = false;
    troutMesh.castShadow = false;
    troutMesh.receiveShadow = false;

    this._troutData = troutFish;
    this._troutMesh = troutMesh;
    this.world.scene.add(troutMesh);

    // =========================================================================
    // 3. Mirror Lake Realm: 240+ Stratified Golden Koi & River Gliders (_buildKoiMesh)
    // =========================================================================
    const koiGeo = this._buildKoiMesh();
    const koiSchools = [
      // Mirror Lake Wide Realm (r=295m, center 430, -260, 14.5m water depth, bed at -2.0m, surface 12.5m)
      { cx: 430, cy: -0.5, cz: -260, radiusX: 115, radiusZ: 125, count: 135, type: 'sovereign_koi' }, // Deepest Basin Kohaku Ruby & 24K Gold Emperors (13m below surface)
      { cx: 460, cy: 2.5,  cz: -280, radiusX: 105, radiusZ: 115, count: 144, type: 'sovereign_koi' }, // Deep Basin Pelagic Emperors (10m below surface)
      { cx: 410, cy: 5.5,  cz: -240, radiusX: 105, radiusZ: 115, count: 126, type: 'golden_koi' },    // Mid-Depth Yamabuki & Platinum Ogon (7m below surface)
      { cx: 330, cy: 7.8,  cz: -200, radiusX: 85,  radiusZ: 95,  count: 114, type: 'golden_koi' },    // Western Lotus Sanctuary & Driftwood Shallows (4.7m below surface)
      { cx: 450, cy: 8.2,  cz: -380, radiusX: 95,  radiusZ: 100, count: 120, type: 'lake_trout' },    // Northern Alpine Mountain Reflection Shoal (4.3m below surface)
      { cx: 530, cy: 8.8,  cz: -250, radiusX: 85,  radiusZ: 90,  count: 105, type: 'golden_koi' },    // Eastern Forest Shoreline (3.7m below surface)
      { cx: 370, cy: 9.5,  cz: -120, radiusX: 75,  radiusZ: 85,  count: 102, type: 'river_gliders' }, // Southern River Outlet Bay (3m below surface)
    ];

    const koiFish = [];
    const koiRng = mulberry32(559922);

    koiSchools.forEach(sch => {
      for (let i = 0; i < sch.count; i++) {
        const ang = (i / sch.count) * Math.PI * 2 + (koiRng() - 0.5) * 0.6;
        const radX = (koiRng() * 0.80 + 0.20) * sch.radiusX;
        const radZ = (koiRng() * 0.80 + 0.20) * sch.radiusZ;
        const depth = (koiRng() - 0.5) * 3.8;

        let color = [1.0, 0.78, 0.16];
        const cPick = koiRng();
        if (sch.type === 'sovereign_koi' || sch.type === 'golden_koi') {
          // Living Koi Palette: Kohaku Ruby, Yamabuki 24K Gold, Platinum Ogon, Showa Amber, Ki-Utsuri
          if (cPick < 0.28) color = [0.98, 0.28, 0.12];      // Kohaku Ruby Scarlet
          else if (cPick < 0.58) color = [1.0, 0.78, 0.16];  // Yamabuki Celestial 24K Gold
          else if (cPick < 0.78) color = [0.98, 0.96, 0.90]; // Platinum Ogon Metallic Silver
          else if (cPick < 0.90) color = [1.0, 0.52, 0.12];  // Showa Fire Amber
          else color = [0.92, 0.75, 0.22];                   // Ki-Utsuri Golden Sun
        } else {
          // Freshwater Trout & River Gliders
          if (cPick < 0.45) color = [0.22, 0.82, 0.65];      // Emerald Brook Trout
          else if (cPick < 0.80) color = [0.28, 0.68, 0.95]; // Azure River Glider
          else color = [0.95, 0.78, 0.35];                   // Golden River Dace
        }

        koiFish.push({
          center: new THREE.Vector3(sch.cx, sch.cy, sch.cz),
          radiusX: radX,
          radiusZ: radZ,
          angle: ang,
          speed: 0.42 + koiRng() * 0.35,
          orbitSpeed: 0.08 + koiRng() * 0.12,
          dir: koiRng() < 0.5 ? 1 : -1,
          wanderAmp: koiRng() * 12.0 + 6.0,
          vertAmp: koiRng() * 0.55 + 0.40,
          yOffset: depth,
          scale: 3.2 + koiRng() * 2.2,
          phase: koiRng() * Math.PI * 2,
          color: color,
        });
      }
    });

    const koiCount = koiFish.length;
    koiGeo.computeBoundingSphere();
    const koiMesh = new THREE.InstancedMesh(koiGeo, fishMat, koiCount);

    const koiPhases = new Float32Array(koiCount);
    const koiSpeeds = new Float32Array(koiCount);
    const koiColors = new Float32Array(koiCount * 3);

    koiFish.forEach((f, i) => {
      koiPhases[i] = f.phase;
      koiSpeeds[i] = f.speed;
      koiColors[i * 3]     = f.color[0];
      koiColors[i * 3 + 1] = f.color[1];
      koiColors[i * 3 + 2] = f.color[2];

      const fx = f.center.x + Math.cos(f.angle) * f.radiusX;
      const fz = f.center.z + Math.sin(f.angle) * f.radiusZ;
      const fy = f.center.y + f.yOffset;
      initDummy.position.set(fx, fy, fz);
      initDummy.rotation.set(0, f.angle + Math.PI / 2, 0);
      initDummy.scale.setScalar(f.scale);
      initDummy.updateMatrix();
      koiMesh.setMatrixAt(i, initDummy.matrix);
    });

    koiGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(koiPhases, 1));
    koiGeo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(koiSpeeds, 1));
    koiGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(koiColors, 3));
    koiMesh.instanceMatrix.needsUpdate = true;
    koiMesh.frustumCulled = false;
    koiMesh.castShadow = false;
    koiMesh.receiveShadow = false;

    this._koiData = koiFish;
    this._koiMesh = koiMesh;
    this.world.scene.add(koiMesh);

    // =========================================================================
    // 4. Kaya Island & Pelagic Lagoon: 460+ Tropical Reef Fish across Multiple Depths (_buildReefFishMesh)
    // =========================================================================
    const reefFishGeo = this._buildReefFishMesh();
    const reefSchools = [
      // Shallow Sunlit Coral Gardens (y = -3.2m to -6.5m)
      { cx: 35,  cy: -3.8, cz: 2210, radiusX: 65, radiusZ: 75, count: 165, type: 'reef_clownfish' }, // Coral Clownfish & Anthias
      { cx: -25, cy: -4.5, cz: 2250, radiusX: 70, radiusZ: 80, count: 180, type: 'reef_tangs' },      // Lemon Yellow Tangs & Moorish Idols
      { cx: -55, cy: -5.2, cz: 2280, radiusX: 60, radiusZ: 68, count: 150, type: 'reef_beauties' },   // Mint Wrasses & Coral Beauties

      // Mid-Depth Gorgonian Wall & Marine Shelf (y = -14.0m to -22.0m)
      { cx: 20,  cy: -16.5, cz: 2320, radiusX: 95, radiusZ: 110, count: 195, type: 'reef_tangs' },    // Neon Azure Tangs & Blue Damselfish
      { cx: -45, cy: -18.2, cz: 2360, radiusX: 90, radiusZ: 100, count: 165, type: 'reef_clownfish' },// Magenta Anthias & Coral Firefish

      // Deep 40-Meter Oceanic Abyss & Submarine Trench (y = -28.0m to -38.0m)
      { cx: 0,   cy: -32.0, cz: 2390, radiusX: 135, radiusZ: 155, count: 180, type: 'pelagic_jacks' },// Pelagic Sapphire Jacks & Silver Sea Kings
      { cx: 85,  cy: -36.5, cz: 2460, radiusX: 125, radiusZ: 140, count: 135, type: 'pelagic_jacks' },// Abyssal Canyon Trevallies
      
      // Extreme Abyssal Volumes (-60m to -126m)
      { cx: 20,  cy: -65.0, cz: 2500, radiusX: 140, radiusZ: 160, count: 240, type: 'pelagic_jacks' },// Midnight Zone Patrols
      { cx: -40, cy: -95.0, cz: 2550, radiusX: 150, radiusZ: 180, count: 255, type: 'pelagic_jacks' },// Twilight Depths
      { cx: 60,  cy: -120.0, cz: 2600, radiusX: 180, radiusZ: 200, count: 300, type: 'pelagic_jacks' },// Hadal Floor Schools

      // Coastal Ocean Lagoon (z = 980 to 1420)
      { cx: 65,  cy: -6.5, cz: 1180, radiusX: 85, radiusZ: 95, count: 120, type: 'reef_clownfish' },
      { cx: -60, cy: -8.0, cz: 1320, radiusX: 90, radiusZ: 100, count: 105, type: 'reef_tangs' },
    ];

    const reefFish = [];
    const reefRng = mulberry32(771144);

    reefSchools.forEach(sch => {
      for (let i = 0; i < sch.count; i++) {
        const ang = (i / sch.count) * Math.PI * 2 + (reefRng() - 0.5) * 0.5;
        const radX = (reefRng() * 0.75 + 0.25) * sch.radiusX;
        const radZ = (reefRng() * 0.75 + 0.25) * sch.radiusZ;
        const depth = (reefRng() - 0.5) * 3.0;

        let color = [1.0, 0.45, 0.12];
        const cPick = reefRng();
        if (sch.type === 'reef_clownfish') {
          // Clownfish Coral Amber, Electric Turquoise Chromis, Magenta Anthias
          if (cPick < 0.40) color = [1.0, 0.48, 0.10];       // Clownfish Orange
          else if (cPick < 0.70) color = [0.08, 0.95, 0.85]; // Turquoise Chromis
          else color = [0.98, 0.22, 0.65];                   // Magenta Reef Anthias
        } else if (sch.type === 'reef_tangs') {
          // Neon Azure Damselfish, Lemon Tang, Moorish Idol Gold & Violet
          if (cPick < 0.35) color = [0.05, 0.65, 1.0];       // Blue Tang / Azure Damselfish
          else if (cPick < 0.68) color = [1.0, 0.92, 0.08];  // Lemon Yellow Tang
          else if (cPick < 0.86) color = [0.95, 0.82, 0.15]; // Moorish Idol Gold
          else color = [0.75, 0.20, 0.95];                   // Royal Queen Angelfish
        } else if (sch.type === 'reef_beauties') {
          // Coral Beauty Deep Purple, Sunset Peach, Mint Emerald
          if (cPick < 0.45) color = [0.55, 0.15, 0.85];      // Coral Beauty Purple
          else if (cPick < 0.75) color = [1.0, 0.62, 0.28];  // Sunset Peach
          else color = [0.15, 0.95, 0.72];                   // Mint Fairy Wrasse
        } else {
          // Pelagic deep sapphire jacks & silver sea kings
          if (cPick < 0.50) color = [0.12, 0.55, 0.95];      // Deep Pelagic Sapphire
          else color = [0.88, 0.92, 0.98];                   // Silver Sea King
        }

        reefFish.push({
          center: new THREE.Vector3(sch.cx, sch.cy, sch.cz),
          radiusX: radX,
          radiusZ: radZ,
          angle: ang,
          speed: 0.55 + reefRng() * 0.45,
          orbitSpeed: 0.12 + reefRng() * 0.16,
          dir: reefRng() < 0.5 ? 1 : -1,
          wanderAmp: reefRng() * 10.0 + 5.0,
          vertAmp: reefRng() * 0.50 + 0.35,
          yOffset: depth,
          scale: 2.2 + reefRng() * 1.6,
          phase: reefRng() * Math.PI * 2,
          color: color,
        });
      }
    });

    const reefCount = reefFish.length;
    reefFishGeo.computeBoundingSphere();
    const reefFishMesh = new THREE.InstancedMesh(reefFishGeo, fishMat, reefCount);

    const reefPhases = new Float32Array(reefCount);
    const reefSpeeds = new Float32Array(reefCount);
    const reefColors = new Float32Array(reefCount * 3);

    reefFish.forEach((f, i) => {
      reefPhases[i] = f.phase;
      reefSpeeds[i] = f.speed;
      reefColors[i * 3]     = f.color[0];
      reefColors[i * 3 + 1] = f.color[1];
      reefColors[i * 3 + 2] = f.color[2];

      const fx = f.center.x + Math.cos(f.angle) * f.radiusX;
      const fz = f.center.z + Math.sin(f.angle) * f.radiusZ;
      const fy = f.center.y + f.yOffset;
      initDummy.position.set(fx, fy, fz);
      initDummy.rotation.set(0, f.angle + Math.PI / 2, 0);
      initDummy.scale.setScalar(f.scale);
      initDummy.updateMatrix();
      reefFishMesh.setMatrixAt(i, initDummy.matrix);
    });

    reefFishGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(reefPhases, 1));
    reefFishGeo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(reefSpeeds, 1));
    reefFishGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(reefColors, 3));
    reefFishMesh.instanceMatrix.needsUpdate = true;
    reefFishMesh.frustumCulled = false;
    reefFishMesh.castShadow = false;
    reefFishMesh.receiveShadow = false;

    this._reefFishData = reefFish;
    this._reefFishMesh = reefFishMesh;
    this._fishData = reefFish; // Backward compatibility fallback
    this._fishMesh = reefFishMesh;
    this.world.scene.add(reefFishMesh);

    // =========================================================================
    // 5. Swimming Green Sea Turtles (_buildSeaTurtleMesh) (8 Turtles across Lagoons)
    // =========================================================================
    const turtleGeo = this._buildSeaTurtleMesh();
    const turtleShader = {
      uniforms: {
        uTime: { value: 0 },
        uDeepWaterColor: { value: new THREE.Color(0x083244) },
        uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.5).normalize() },
        uSunColor: { value: new THREE.Color(0xffeedd) },
      },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        #include <fog_pars_vertex>
        attribute float aPhase;
        attribute float aSpeed;
        attribute vec3 aColor;
        varying vec2 vUv;
        varying vec3 vCustomWorldNormal;
        varying vec3 vWorldPos;
        varying vec3 vTurtleColor;
        varying float vIsFlipper;
        varying float vIsPlastron;
        uniform float uTime;

        void main() {
          vUv = uv;
          vTurtleColor = aColor;
          vec3 pos = position;

          float swimSpeed = 2.8 * aSpeed;
          float strokeTime = uTime * swimSpeed + aPhase;

          // Detect front flippers by position: |x| > 0.65 and z > -0.2
          float flipperWeight = smoothstep(0.65, 2.2, abs(pos.x)) * smoothstep(-0.4, 1.2, pos.z);
          vIsFlipper = flipperWeight;
          vIsPlastron = step(pos.y, -0.08);

          // Hydrodynamic flipper stroke: downstroke power stroke with forward pitch rotation
          float flapDispY = sin(strokeTime) * (abs(pos.x) - 0.65) * 0.72;
          float flapDispZ = cos(strokeTime) * (abs(pos.x) - 0.65) * 0.28;

          pos.y += flapDispY * flipperWeight;
          pos.z += flapDispZ * flipperWeight;

          // Hind flipper steering flutter
          float hindWeight = smoothstep(0.4, 1.2, abs(pos.x)) * smoothstep(-0.8, -1.8, pos.z);
          pos.y += sin(strokeTime * 1.4 + 1.2) * 0.14 * hindWeight;

          // Gentle full body heave & glide pitching
          pos.y += cos(strokeTime * 0.5) * 0.08;
          pos.x += sin(strokeTime * 0.5) * 0.05;

          vec4 wPos = modelMatrix * vec4(pos, 1.0);
          vWorldPos = wPos.xyz;
          vCustomWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          gl_Position = projectionMatrix * viewMatrix * wPos;
                  #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        #include <fog_pars_fragment>
        uniform float uTime;
        uniform vec3 uDeepWaterColor;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        varying vec2 vUv;
        varying vec3 vCustomWorldNormal;
        varying vec3 vWorldPos;
        varying vec3 vTurtleColor;
        varying float vIsFlipper;
        varying float vIsPlastron;

        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos + vec3(0.0001));
          vec3 normal = normalize(vCustomWorldNormal);

          // Scute pattern synthesis for carapace shell
          float scuteGrid = abs(sin(vWorldPos.x * 3.5) * cos(vWorldPos.z * 3.5));
          float scuteBorder = smoothstep(0.72, 0.88, scuteGrid);

          // Olive-emerald carapace with golden amber margins
          vec3 oliveBase = vTurtleColor;
          vec3 amberMargin = vec3(0.82, 0.62, 0.22);
          vec3 scuteDark = vec3(0.10, 0.18, 0.08);
          vec3 plastronCream = vec3(0.91, 0.88, 0.78);

          vec3 shellColor = mix(oliveBase, amberMargin, 0.35);
          shellColor = mix(shellColor, scuteDark, scuteBorder * 0.65);

          // Plastron underbelly
          vec3 baseAlbedo = mix(shellColor, plastronCream, vIsPlastron * 0.85);

          // Fresnel rim glow
          float fresnel = pow(1.0 - max(0.0, dot(normal, viewDir)), 3.0);
          vec3 halfVec = normalize(uSunDir + viewDir);
          float spec = pow(max(0.0, dot(normal, halfVec)), 28.0) * 1.2;

          vec3 finalCol = mix(baseAlbedo, uDeepWaterColor, 0.06) + uSunColor * spec * 0.75 + vec3(0.0, 0.45, 0.65) * fresnel * 0.45;
          gl_FragColor = vec4(finalCol, 1.0);
                  #include <logdepthbuf_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
      side: THREE.DoubleSide,
    };

    const turtleMat = new THREE.ShaderMaterial(turtleShader);
    this._seaTurtleShader = turtleMat;

    const turtleSchools = [
      { cx: 15,  cy: -8.5, cz: 2225, radiusX: 35, radiusZ: 40, count: 2 },
      { cx: -18, cy: -14.0, cz: 2275, radiusX: 42, radiusZ: 48, count: 2 },
      { cx: -35, cy: -18.5, cz: 2245, radiusX: 38, radiusZ: 42, count: 2 },
      { cx: 38,  cy: -12.0, cz: 2290, radiusX: 45, radiusZ: 50, count: 2 },
      { cx: -42, cy: -22.0, cz: 2330, radiusX: 52, radiusZ: 56, count: 2 },
      { cx: 0,   cy: -26.0, cz: 2360, radiusX: 58, radiusZ: 64, count: 2 },
      { cx: -45, cy: -6.5, cz: 1150, radiusX: 55, radiusZ: 65, count: 2 },
      { cx: 55,  cy: -7.5, cz: 1220, radiusX: 60, radiusZ: 70, count: 2 },
      { cx: 10,  cy: -55.0, cz: 2450, radiusX: 80, radiusZ: 90, count: 4 }, // Deep Diving
      { cx: -20, cy: -85.0, cz: 2550, radiusX: 100, radiusZ: 110, count: 6 }, // Abyssal Wanderers
      { cx: 40,  cy: -105.0, cz: 2600, radiusX: 120, radiusZ: 130, count: 4 }, // Hadal Explorers
    ];

    const turtleData = [];
    const turtRng = mulberry32(111444);
    turtleSchools.forEach(sch => {
      for (let i = 0; i < sch.count; i++) {
        const ang = (i / sch.count) * Math.PI * 2 + (turtRng() - 0.5) * 0.4;
        const radX = (turtRng() * 0.6 + 0.4) * sch.radiusX;
        const radZ = (turtRng() * 0.6 + 0.4) * sch.radiusZ;
        const depth = (turtRng() - 0.5) * 2.0;
        turtleData.push({
          center: new THREE.Vector3(sch.cx, sch.cy, sch.cz),
          radiusX: radX, radiusZ: radZ,
          angle: ang,
          speed: 0.25 + turtRng() * 0.15,
          orbitSpeed: 0.035 + turtRng() * 0.02,
          dir: turtRng() < 0.5 ? 1 : -1,
          wanderAmp: turtRng() * 6.0 + 3.0,
          vertAmp: turtRng() * 0.3 + 0.2,
          yOffset: depth,
          scale: 2.5 + turtRng() * 0.4,
          phase: turtRng() * Math.PI * 2,
          color: [0.22 + turtRng()*0.04, 0.42 + turtRng()*0.06, 0.18 + turtRng()*0.04]
        });
      }
    });

    const turtleCount = turtleData.length;
    turtleGeo.computeBoundingSphere();
    const seaTurtleMesh = new THREE.InstancedMesh(turtleGeo, turtleMat, turtleCount);

    const turtlePhases = new Float32Array(turtleCount);
    const turtleSpeeds = new Float32Array(turtleCount);
    const turtleColors = new Float32Array(turtleCount * 3);

    turtleData.forEach((t, i) => {
      turtlePhases[i] = t.phase;
      turtleSpeeds[i] = t.speed;
      turtleColors[i * 3]     = t.color[0];
      turtleColors[i * 3 + 1] = t.color[1];
      turtleColors[i * 3 + 2] = t.color[2];

      const tx = t.cx + Math.cos(t.phase) * t.radiusX;
      const tz = t.cz + Math.sin(t.phase) * t.radiusZ;
      initDummy.position.set(tx, t.cy, tz);
      initDummy.rotation.set(0, t.phase + Math.PI / 2, 0);
      initDummy.scale.setScalar(t.scale);
      initDummy.updateMatrix();
      seaTurtleMesh.setMatrixAt(i, initDummy.matrix);
    });

    turtleGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(turtlePhases, 1));
    turtleGeo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(turtleSpeeds, 1));
    turtleGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(turtleColors, 3));
    seaTurtleMesh.instanceMatrix.needsUpdate = true;
    seaTurtleMesh.frustumCulled = false;
    seaTurtleMesh.castShadow = false;
    seaTurtleMesh.receiveShadow = false;

    this._seaTurtleData = turtleData;
    this._seaTurtleMesh = seaTurtleMesh;
    this.world.scene.add(seaTurtleMesh);

    // =========================================================================
    // 6. Soaring Pelagic Manta Rays (_buildMantaRayMesh) (6 Giant Rays in 40m Abyss)
    // =========================================================================
    const mantaGeo = this._buildMantaRayMesh();
    const mantaRayShader = {
      uniforms: {
        uTime: { value: 0 },
        uDeepWaterColor: { value: new THREE.Color(0x062838) },
        uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.5).normalize() },
        uSunColor: { value: new THREE.Color(0xffeedd) },
      },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        #include <fog_pars_vertex>
        attribute float aPhase;
        attribute float aSpeed;
        varying vec2 vUv;
        varying vec3 vCustomWorldNormal;
        varying vec3 vWorldPos;
        varying float vIsVentral;
        varying float vWingSpan;
        uniform float uTime;

        void main() {
          vUv = uv;
          vec3 pos = position;

          float swimSpeed = 1.8 * aSpeed;
          float wingTime = uTime * swimSpeed + aPhase;

          // Wingtip fluid flapping: amplitude increases non-linearly with distance from centerline (|x|)
          float spanNorm = clamp(abs(pos.x) / 3.4, 0.0, 1.0);
          float wingFlap = sin(wingTime + pos.z * 0.45) * pow(spanNorm, 1.7) * 0.95;
          pos.y += wingFlap;

          // Whip tail traveling undulation wave
          float tailFactor = smoothstep(-1.0, -5.5, pos.z);
          pos.x += sin(wingTime * 1.5 + pos.z * 1.2) * 0.35 * tailFactor;
          pos.y += cos(wingTime * 1.5 + pos.z * 1.2) * 0.25 * tailFactor;

          // Majestic pitch glide
          pos.y += cos(wingTime * 0.4) * 0.12;

          vIsVentral = step(pos.y, -0.02);
          vWingSpan = spanNorm;

          vec4 wPos = modelMatrix * vec4(pos, 1.0);
          vWorldPos = wPos.xyz;
          vCustomWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          gl_Position = projectionMatrix * viewMatrix * wPos;
                  #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        #include <fog_pars_fragment>
        uniform float uTime;
        uniform vec3 uDeepWaterColor;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        varying vec2 vUv;
        varying vec3 vCustomWorldNormal;
        varying vec3 vWorldPos;
        varying float vIsVentral;
        varying float vWingSpan;

        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos + vec3(0.0001));
          vec3 normal = normalize(vCustomWorldNormal);

          // Dorsal: Midnight obsidian with chevron celestial cyan wing markings
          vec3 midnightObsidian = vec3(0.04, 0.08, 0.14);
          vec3 celestialCyan = vec3(0.22, 0.72, 0.92);
          float chevron = sin(vWorldPos.z * 2.2 - abs(vWorldPos.x) * 1.8) * 0.5 + 0.5;
          float spotPattern = smoothstep(0.68, 0.85, chevron) * vWingSpan;
          vec3 dorsalCol = mix(midnightObsidian, celestialCyan, spotPattern * 0.55);

          // Ventral: Lunar pearl white
          vec3 ventralWhite = vec3(0.92, 0.95, 0.98);
          vec3 baseCol = mix(dorsalCol, ventralWhite, vIsVentral * 0.90);

          // Fresnel rim glow & specular glints
          float fresnel = pow(1.0 - max(0.0, dot(normal, viewDir)), 3.2);
          vec3 halfVec = normalize(uSunDir + viewDir);
          float spec = pow(max(0.0, dot(normal, halfVec)), 32.0) * 1.5;

          vec3 finalCol = mix(baseCol, uDeepWaterColor, 0.05) + uSunColor * spec * 0.85 + vec3(0.1, 0.6, 0.85) * fresnel * 0.55;
          gl_FragColor = vec4(finalCol, 1.0);
                  #include <logdepthbuf_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
      side: THREE.DoubleSide,
    };

    const mantaMat = new THREE.ShaderMaterial(mantaRayShader);
    this._mantaRayShader = mantaMat;

    // Pelagic Manta Ray Pod Data (6 giant oceanic manta rays soaring through 40m deep abyss)
    const mantaData = [
      { cx: 10,  cy: -18.5, cz: 2235, radiusX: 45, radiusZ: 55, speed: 0.26, orbitSpeed: 0.028, scale: 3.2, phase: 0.6, dir: 1 }, 
      { cx: -20, cy: -24.0, cz: 2270, radiusX: 52, radiusZ: 60, speed: 0.24, orbitSpeed: 0.025, scale: 3.5, phase: 2.4, dir: -1 }, 
      { cx: -38, cy: -28.5, cz: 2230, radiusX: 48, radiusZ: 56, speed: 0.25, orbitSpeed: 0.027, scale: 3.1, phase: 1.2, dir: 1 }, 
      { cx: 32,  cy: -32.0, cz: 2285, radiusX: 58, radiusZ: 66, speed: 0.22, orbitSpeed: 0.022, scale: 3.4, phase: 4.6, dir: -1 }, 
      { cx: -45, cy: -12.0, cz: 1240, radiusX: 85, radiusZ: 95, speed: 0.22, orbitSpeed: 0.024, scale: 3.0, phase: 0.0, dir: 1 }, 
      { cx: 55,  cy: -14.5, cz: 1300, radiusX: 90, radiusZ: 100, speed: 0.20, orbitSpeed: 0.022, scale: 3.2, phase: 3.5, dir: -1 }, 
      
      // Additional Pods for denser realism
      { cx: 20,  cy: -15.5, cz: 2255, radiusX: 55, radiusZ: 65, speed: 0.28, orbitSpeed: 0.030, scale: 2.8, phase: 1.6, dir: -1 }, 
      { cx: -10, cy: -22.0, cz: 2260, radiusX: 62, radiusZ: 70, speed: 0.23, orbitSpeed: 0.024, scale: 3.7, phase: 3.4, dir: 1 }, 
      { cx: -28, cy: -30.5, cz: 2250, radiusX: 58, radiusZ: 66, speed: 0.26, orbitSpeed: 0.026, scale: 2.9, phase: 2.2, dir: -1 }, 
      { cx: 42,  cy: -35.0, cz: 2305, radiusX: 68, radiusZ: 76, speed: 0.21, orbitSpeed: 0.021, scale: 3.6, phase: 5.6, dir: 1 }, 
      { cx: -35, cy: -15.0, cz: 1260, radiusX: 95, radiusZ: 105, speed: 0.24, orbitSpeed: 0.026, scale: 3.3, phase: 1.0, dir: -1 }, 
      { cx: 65,  cy: -17.5, cz: 1280, radiusX: 100, radiusZ: 110, speed: 0.21, orbitSpeed: 0.023, scale: 3.5, phase: 4.5, dir: 1 }, 

      // Deep Ocean Abyssal Manta Squad
      { cx: 0,   cy: -45.0, cz: 2400, radiusX: 120, radiusZ: 140, speed: 0.18, orbitSpeed: 0.018, scale: 4.2, phase: 0.5, dir: 1 }, 
      { cx: -20, cy: -50.0, cz: 2450, radiusX: 130, radiusZ: 150, speed: 0.19, orbitSpeed: 0.019, scale: 4.0, phase: 2.5, dir: -1 }, 
      { cx: 20,  cy: -55.0, cz: 2430, radiusX: 140, radiusZ: 160, speed: 0.17, orbitSpeed: 0.017, scale: 4.5, phase: 4.5, dir: 1 }, 
    ];

    mantaData.forEach(m => {
      m.center = { x: m.cx, y: m.cy, z: m.cz };
      m.yOffset = 0;
      m.wanderAmp = 15;
      m.vertAmp = 5;
    });

    const mantaCount = mantaData.length;
    mantaGeo.computeBoundingSphere();
    const mantaMesh = new THREE.InstancedMesh(mantaGeo, mantaMat, mantaCount);

    const mantaPhases = new Float32Array(mantaCount);
    const mantaSpeeds = new Float32Array(mantaCount);

    mantaData.forEach((r, i) => {
      mantaPhases[i] = r.phase;
      mantaSpeeds[i] = r.speed;

      const mx = r.cx + Math.cos(r.phase) * r.radiusX;
      const mz = r.cz + Math.sin(r.phase) * r.radiusZ;
      initDummy.position.set(mx, r.cy, mz);
      initDummy.rotation.set(0, r.phase + Math.PI / 2, 0);
      initDummy.scale.setScalar(r.scale);
      initDummy.updateMatrix();
      mantaMesh.setMatrixAt(i, initDummy.matrix);
    });

    mantaGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(mantaPhases, 1));
    mantaGeo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(mantaSpeeds, 1));
    mantaMesh.instanceMatrix.needsUpdate = true;
    mantaMesh.frustumCulled = false;
    mantaMesh.castShadow = false;
    mantaMesh.receiveShadow = false;

    this._mantaRayData = mantaData;
    this._mantaRayMesh = mantaMesh;
    this.world.scene.add(mantaMesh);

    // =========================================================================
    // 7. Pods of Leaping & Cruising Bottlenose Dolphins (_buildDolphinMesh) (20 Dolphins)
    // =========================================================================
    const dolphinGeo = this._buildDolphinMesh();
    const dolphinMat = new THREE.MeshPhysicalMaterial({
      color: 0x3d586e,
      roughness: 0.18,
      metalness: 0.08,
      envMapIntensity: 1.4,
    });
    
    const dolphinPods = [
      { cx: 30,  cy: -12.0, cz: 2260, radiusX: 90,  radiusZ: 110, count: 8 }, // Coral Reef Lagoon & Deep Plunge Pod
      { cx: -75, cy: -18.0, cz: 1950, radiusX: 110, radiusZ: 125, count: 6 }, // Open Ocean Coast Pod
      { cx: 85,  cy: -8.0,  cz: 1400, radiusX: 95,  radiusZ: 105, count: 6 }, // Coastal Estuary Pod
      { cx: 10,  cy: -55.0, cz: 2450, radiusX: 130, radiusZ: 140, count: 12 }, // Deep Pelagic Hunting Pod
      { cx: -30, cy: -85.0, cz: 2550, radiusX: 150, radiusZ: 165, count: 10 }, // Abyssal Diving Pod
    ];

    const dolphins = [];
    const dolphRng = mulberry32(882233);
    dolphinPods.forEach(pod => {
      for (let i = 0; i < pod.count; i++) {
        const ang = (i / pod.count) * Math.PI * 2 + (dolphRng() - 0.5) * 0.4;
        const radX = (dolphRng() * 0.6 + 0.4) * pod.radiusX;
        const radZ = (dolphRng() * 0.6 + 0.4) * pod.radiusZ;
        const depth = (dolphRng() - 0.5) * 6.0;
        dolphins.push({
          center: new THREE.Vector3(pod.cx, pod.cy, pod.cz),
          radiusX: radX,
          radiusZ: radZ,
          angle: ang,
          speed: 0.85 + dolphRng() * 0.45,
          orbitSpeed: 0.09 + dolphRng() * 0.08,
          dir: dolphRng() < 0.5 ? 1 : -1,
          wanderAmp: dolphRng() * 10.0 + 5.0,
          yOffset: depth,
          scale: 1.6 + dolphRng() * 0.4,
          phase: dolphRng() * Math.PI * 2,
        });
      }
    });

    const dolphCount = dolphins.length;
    dolphinGeo.computeBoundingSphere();
    const dolphinMesh = new THREE.InstancedMesh(dolphinGeo, dolphinMat, dolphCount);
    dolphins.forEach((d, i) => {
      const dx = d.center.x + Math.cos(d.angle) * d.radiusX;
      const dz = d.center.z + Math.sin(d.angle) * d.radiusZ;
      const dy = d.center.y + d.yOffset;
      initDummy.position.set(dx, dy, dz);
      initDummy.rotation.set(0, d.angle + Math.PI / 2, 0);
      initDummy.scale.setScalar(d.scale);
      initDummy.updateMatrix();
      dolphinMesh.setMatrixAt(i, initDummy.matrix);
    });
    dolphinMesh.instanceMatrix.needsUpdate = true;
    dolphinMesh.frustumCulled = false;
    dolphinMesh.castShadow = true;
    dolphinMesh.receiveShadow = false;
    this._dolphinData = dolphins;
    this._dolphinMesh = dolphinMesh;
    this.world.scene.add(dolphinMesh);

    // =========================================================================
    // 8. Blacktip & Reef Sharks Patrolling Coral Drop-off & Deep Trench (_buildSharkMesh) (16 Sharks)
    // =========================================================================
    const sharkGeo = this._buildSharkMesh();
    const sharkMat = new THREE.MeshPhysicalMaterial({
      color: 0x2b3842,
      roughness: 0.32,
      metalness: 0.06,
      envMapIntensity: 1.2,
    });

    const sharkPatrols = [
      { cx: -20, cy: -20.0, cz: 2340, radiusX: 110, radiusZ: 130, count: 6 }, // Coral Wall Drop-off
      { cx: 70,  cy: -34.0, cz: 2440, radiusX: 135, radiusZ: 155, count: 6 }, // 40m Deep Abyss Floor
      { cx: -70, cy: -16.0, cz: 1650, radiusX: 95,  radiusZ: 110, count: 4 }, // Coastal Ocean Shelf
      { cx: 15,  cy: -65.0, cz: 2500, radiusX: 150, radiusZ: 170, count: 8 }, // Midnight Zone Hunters
      { cx: -45, cy: -95.0, cz: 2550, radiusX: 160, radiusZ: 185, count: 8 }, // Twilight Trench Patrol
      { cx: 50,  cy: -125.0, cz: 2600, radiusX: 190, radiusZ: 210, count: 12 }, // Hadal Floor Leviathans
    ];

    const sharks = [];
    const sharkRng = mulberry32(993311);
    sharkPatrols.forEach(patrol => {
      for (let i = 0; i < patrol.count; i++) {
        const ang = (i / patrol.count) * Math.PI * 2 + (sharkRng() - 0.5) * 0.5;
        const radX = (sharkRng() * 0.6 + 0.4) * patrol.radiusX;
        const radZ = (sharkRng() * 0.6 + 0.4) * patrol.radiusZ;
        const depth = (sharkRng() - 0.5) * 4.0;
        sharks.push({
          center: new THREE.Vector3(patrol.cx, patrol.cy, patrol.cz),
          radiusX: radX,
          radiusZ: radZ,
          angle: ang,
          speed: 0.48 + sharkRng() * 0.32,
          orbitSpeed: 0.055 + sharkRng() * 0.045,
          dir: sharkRng() < 0.5 ? 1 : -1,
          wanderAmp: sharkRng() * 12.0 + 6.0,
          yOffset: depth,
          scale: 1.7 + sharkRng() * 0.5,
          phase: sharkRng() * Math.PI * 2,
        });
      }
    });

    const sharkCount = sharks.length;
    sharkGeo.computeBoundingSphere();
    const sharkMesh = new THREE.InstancedMesh(sharkGeo, sharkMat, sharkCount);
    sharks.forEach((s, i) => {
      const sx = s.center.x + Math.cos(s.angle) * s.radiusX;
      const sz = s.center.z + Math.sin(s.angle) * s.radiusZ;
      const sy = s.center.y + s.yOffset;
      initDummy.position.set(sx, sy, sz);
      initDummy.rotation.set(0, s.angle + Math.PI / 2, 0);
      initDummy.scale.setScalar(s.scale);
      initDummy.updateMatrix();
      sharkMesh.setMatrixAt(i, initDummy.matrix);
    });
    sharkMesh.instanceMatrix.needsUpdate = true;
    sharkMesh.frustumCulled = false;
    sharkMesh.castShadow = true;
    sharkMesh.receiveShadow = false;
    this._sharkData = sharks;
    this._sharkMesh = sharkMesh;
    this.world.scene.add(sharkMesh);

    // =========================================================================
    // 9. Submerged Cold Water & Deep Ocean Aeration Bubble System (GPU Points)
    // =========================================================================
    const bubbleCount = 220;
    const bubbleGeo = new THREE.BufferGeometry();
    const bubblePos = new Float32Array(bubbleCount * 3);
    const bubbleData = new Float32Array(bubbleCount * 3);

    const allVentSchools = [...troutSchools, ...koiSchools, ...reefSchools];
    for (let i = 0; i < bubbleCount; i++) {
      const sch = allVentSchools[i % allVentSchools.length];
      const ang = Math.random() * Math.PI * 2;
      const rx = Math.random() * sch.radiusX;
      const rz = Math.random() * sch.radiusZ;
      bubblePos[i * 3]     = sch.cx + Math.cos(ang) * rx;
      bubblePos[i * 3 + 1] = sch.cy - 3.8 + Math.random() * 4.2;
      bubblePos[i * 3 + 2] = sch.cz + Math.sin(ang) * rz;

      bubbleData[i * 3]     = 1.4 + Math.random() * 2.8; // rise speed
      bubbleData[i * 3 + 1] = 0.2 + Math.random() * 0.45; // wobble amplitude
      bubbleData[i * 3 + 2] = Math.random() * 100.0;     // phase offset
    }

    bubbleGeo.setAttribute('position', new THREE.BufferAttribute(bubblePos, 3));
    bubbleGeo.setAttribute('aBubbleData', new THREE.BufferAttribute(bubbleData, 3));
    bubbleGeo.computeBoundingSphere();

    const bubbleMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        #include <fog_pars_vertex>
        attribute vec3 aBubbleData;
        varying float vAlpha;
        uniform float uTime;

        void main() {
          vec3 pos = position;
          float t = mod(uTime * aBubbleData.x + aBubbleData.z, 6.0);
          pos.y += t;
          pos.x += sin(uTime * 3.0 + aBubbleData.z) * aBubbleData.y;
          pos.z += cos(uTime * 2.5 + aBubbleData.z) * aBubbleData.y;

          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = min(32.0, 48.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
          vAlpha = smoothstep(0.0, 0.8, t) * (1.0 - smoothstep(4.5, 6.0, t));
                  #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        #include <fog_pars_fragment>
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float r = length(uv);
          if (r > 0.5) discard;
          float ring = (1.0 - smoothstep(0.38, 0.48, r)) * smoothstep(0.18, 0.38, r);
          float core = (1.0 - smoothstep(0.0, 0.5, r)) * 0.3;
          gl_FragColor = vec4(vec3(0.82, 0.95, 1.0), (ring + core) * vAlpha * 0.85);
                  #include <logdepthbuf_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
      transparent: true, logarithmicDepthBuffer: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this._bubbleMat = bubbleMat;
    const bubbles = new THREE.Points(bubbleGeo, bubbleMat);
    bubbles.frustumCulled = true;
    this.world.scene.add(bubbles);

    // =========================================================================
    // 8. ZONE 1: Submerged Glacial Granite Boulders with Golden Pyrite Flecks & Alpine Moss (y = 174m)
    // =========================================================================
    const tarnBoulderGeo = applyOrganicWeathering(new THREE.DodecahedronGeometry(1.6, 1), 0.14, 0.45, 88);
    bakeVertexCreviceOcclusion(tarnBoulderGeo, 175.0, 0.55);
    const tarnBoulderMat = Surfaces.photogrammetryRock(1.5);
    tarnBoulderMat.vertexColors = true;
//     tarnBoulderMat.roughness = 0.35;

    const tarnBoulderCount = 56;
    const tarnBoulderMesh = new THREE.InstancedMesh(tarnBoulderGeo, tarnBoulderMat, tarnBoulderCount);
    const tarnDummy = new THREE.Object3D();
    const tarnRng = mulberry32(112233);

    for (let i = 0; i < tarnBoulderCount; i++) {
      const side = (i % 2 === 0) ? 1 : -1;
      const bx = side * (16 + tarnRng() * 14);
      const bz = -505 + (tarnRng() - 0.5) * 55;
      const by = terrainHeight(bx, bz) + 0.45;
      const s = 0.6 + tarnRng() * 0.7;

      tarnDummy.position.set(bx, by, bz);
      tarnDummy.rotation.set(tarnRng() * 0.4, tarnRng() * Math.PI * 2, tarnRng() * 0.4);
      tarnDummy.scale.set(s * (0.8 + tarnRng() * 0.5), s, s * (0.8 + tarnRng() * 0.5));
      tarnDummy.updateMatrix();
      tarnBoulderMesh.setMatrixAt(i, tarnDummy.matrix);
    }
    tarnBoulderMesh.instanceMatrix.needsUpdate = true;
    tarnBoulderMesh.frustumCulled = false;
    tarnBoulderMesh.castShadow = false;
    tarnBoulderMesh.receiveShadow = true;
    this.world.scene.add(tarnBoulderMesh);

    // =========================================================================
    // 9. ZONE 2: Submerged Sunken River Driftwood & Riverbed Pebbles in Mirror Lake (y = 6m -> 12.5m)
    // =========================================================================
    // 9a. Sunken River Driftwood Logs
    const buildDriftwoodGeometry = () => {
      const parts = [];
      const trunk = new THREE.CylinderGeometry(0.35, 0.65, 7.5, 8, 6);
      trunk.rotateZ(Math.PI / 2);
      const pos = trunk.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i);
        pos.setY(i, pos.getY(i) + Math.sin(px * 0.6) * 0.45);
        pos.setZ(i, pos.getZ(i) + Math.cos(px * 0.7) * 0.35);
      }
      trunk.computeVertexNormals();
      parts.push(trunk);

      // Root spurs & branch knots
      const b1 = new THREE.CylinderGeometry(0.18, 0.32, 3.2, 6);
      b1.rotateZ(0.65);
      b1.rotateY(0.45);
      b1.translate(2.2, 0.6, 0.4);

      const b2 = new THREE.CylinderGeometry(0.15, 0.28, 2.8, 6);
      b2.rotateZ(-0.75);
      b2.rotateY(-0.35);
      b2.translate(-2.4, 0.5, -0.3);
      parts.push(b1, b2);

      return safeMerge(parts, false) || trunk;
    };

    const geoDriftwood = buildDriftwoodGeometry();
    const matDriftwood = Surfaces.sunkenDriftwood ? Surfaces.sunkenDriftwood(2.0) : Surfaces.timber(1.5);
    const driftwoodCount = 20;
    const driftwoodMesh = new THREE.InstancedMesh(geoDriftwood, matDriftwood, driftwoodCount);
    const woodDummy = new THREE.Object3D();
    const woodRng = mulberry32(441199);

    for (let i = 0; i < driftwoodCount; i++) {
      const wx = 400 + woodRng() * 75;
      const wz = -275 - woodRng() * 65;
      const wy = 6.3 + woodRng() * 0.7;
      const s = 0.9 + woodRng() * 0.6;

      woodDummy.position.set(wx, wy, wz);
      woodDummy.rotation.set((woodRng() - 0.5) * 0.15, woodRng() * Math.PI * 2, (woodRng() - 0.5) * 0.15);
      woodDummy.scale.set(s, s, s);
      woodDummy.updateMatrix();
      driftwoodMesh.setMatrixAt(i, woodDummy.matrix);
    }
    driftwoodMesh.instanceMatrix.needsUpdate = true;
    driftwoodMesh.frustumCulled = false;
    this.world.scene.add(driftwoodMesh);

    // 9b. Riverbed Pebbles Bed with Animated Sun Caustics
    const geoPebble = applyOrganicWeathering(new THREE.DodecahedronGeometry(0.65, 1), 0.12, 0.35, 33);
    const matPebble = Surfaces.riverPebbles ? Surfaces.riverPebbles(1.0) : Surfaces.rockCliff(2.0);
    const pebbleCount = 130;
    const pebbleMesh = new THREE.InstancedMesh(geoPebble, matPebble, pebbleCount);
    const pebDummy = new THREE.Object3D();
    const pebRng = mulberry32(228844);

    for (let i = 0; i < pebbleCount; i++) {
      const isRiver = i >= 90;
      let px, pz, py;
      if (isRiver) {
        px = 100 + (pebRng() - 0.5) * 35;
        pz = 240 + pebRng() * 80;
        py = 9.2 + pebRng() * 0.4;
      } else {
        px = 395 + pebRng() * 80;
        pz = -270 - pebRng() * 70;
        py = 6.3 + pebRng() * 0.5;
      }
      const s = 0.5 + pebRng() * 1.1;

      pebDummy.position.set(px, py, pz);
      pebDummy.rotation.set(pebRng() * Math.PI, pebRng() * Math.PI, pebRng() * Math.PI);
      pebDummy.scale.set(s * (0.8 + pebRng() * 0.4), s * 0.5, s * (0.8 + pebRng() * 0.4));
      pebDummy.updateMatrix();
      pebbleMesh.setMatrixAt(i, pebDummy.matrix);
    }
    pebbleMesh.instanceMatrix.needsUpdate = true;
    pebbleMesh.frustumCulled = false;
    this.world.scene.add(pebbleMesh);

    // 9c. Submerged Water Lily Root Networks (y = 6.2m -> 12.5m)
    const buildLilyRootCluster = () => {
      const parts = [];
      const mainStem = new THREE.CylinderGeometry(0.04, 0.08, 6.3, 5, 8);
      mainStem.translate(0, 3.15, 0);
      const pos = mainStem.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const py = pos.getY(i);
        pos.setX(i, pos.getX(i) + Math.sin(py * 1.2) * 0.22);
        pos.setZ(i, pos.getZ(i) + Math.cos(py * 1.1) * 0.22);
      }
      mainStem.computeVertexNormals();
      parts.push(mainStem);

      for (let r = 0; r < 4; r++) {
        const ang = (r / 4) * Math.PI * 2;
        const tendril = new THREE.CylinderGeometry(0.02, 0.05, 1.8, 4);
        tendril.rotateZ(0.75);
        tendril.rotateY(ang);
        tendril.translate(Math.cos(ang) * 0.4, 0.6, Math.sin(ang) * 0.4);
        parts.push(tendril);
      }
      return safeMerge(parts, false) || mainStem;
    };

    const geoLilyRoots = buildLilyRootCluster();
    const matLilyRoots = new THREE.MeshPhysicalMaterial({
      color: 0x225832,
      emissive: 0x082a15,
      emissiveIntensity: 0.25,
      roughness: 0.75,
      metalness: 0.05,
    });

    const rootCount = 90;
    const rootMesh = new THREE.InstancedMesh(geoLilyRoots, matLilyRoots, rootCount);
    const rootDummy = new THREE.Object3D();
    const rootRng = mulberry32(551122);

    for (let i = 0; i < rootCount; i++) {
      const sch = koiSchools[i % koiSchools.length];
      const ang = rootRng() * Math.PI * 2;
      const r = (0.10 + rootRng() * 0.85) * sch.radiusX;
      const sx = sch.cx + Math.cos(ang) * r;
      const sz = sch.cz + Math.sin(ang) * r;
      const sy = 6.2;

      rootDummy.position.set(sx, sy, sz);
      rootDummy.rotation.set((rootRng() - 0.5) * 0.18, rootRng() * Math.PI * 2, (rootRng() - 0.5) * 0.18);
      rootDummy.scale.set(1.0, 0.85 + rootRng() * 0.35, 1.0);
      rootDummy.updateMatrix();
      rootMesh.setMatrixAt(i, rootDummy.matrix);
    }
    rootMesh.instanceMatrix.needsUpdate = true;
    rootMesh.frustumCulled = false;
    this.world.scene.add(rootMesh);

    // 9d. Volumetric Sunlit Golden Mist & Shoreline Haze over Mirror Lake (y = 12.8m - 36m)
    const lakeMistCount = 360;
    const lakeMistGeo = new THREE.BufferGeometry();
    const lakeMistPos = new Float32Array(lakeMistCount * 3);
    const lakeMistData = new Float32Array(lakeMistCount * 3);
    const mistRng = mulberry32(773311);

    for (let i = 0; i < lakeMistCount; i++) {
      const ang = mistRng() * Math.PI * 2;
      const rad = 20 + mistRng() * 160;
      lakeMistPos[i * 3]     = 420 + Math.cos(ang) * rad;
      lakeMistPos[i * 3 + 1] = 12.8 + mistRng() * 18.0;
      lakeMistPos[i * 3 + 2] = -290 + Math.sin(ang) * (rad * 0.85);

      lakeMistData[i * 3]     = 0.4 + mistRng() * 0.8; // rise speed
      lakeMistData[i * 3 + 1] = 1.2 + mistRng() * 2.2; // swirl radius
      lakeMistData[i * 3 + 2] = mistRng() * 100.0;     // phase
    }

    lakeMistGeo.setAttribute('position', new THREE.BufferAttribute(lakeMistPos, 3));
    lakeMistGeo.setAttribute('aMistData', new THREE.BufferAttribute(lakeMistData, 3));
    lakeMistGeo.computeBoundingSphere();

    const lakeMistMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        #include <fog_pars_vertex>
        attribute vec3 aMistData;
        varying float vAlpha;
        varying float vGlint;
        uniform float uTime;

        void main() {
          vec3 pos = position;
          float t = mod(uTime * aMistData.x * 0.35 + aMistData.z, 14.0);
          pos.y += t * 1.2;
          pos.x += sin(uTime * 0.4 + aMistData.z) * aMistData.y;
          pos.z += cos(uTime * 0.35 + aMistData.z * 1.3) * aMistData.y;

          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = min(64.0, 95.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
          vAlpha = smoothstep(0.0, 2.5, t) * (1.0 - smoothstep(9.5, 14.0, t));
          vGlint = sin(pos.x * 0.15 + pos.y * 0.2 + uTime * 0.8) * 0.5 + 0.5;
                  #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        #include <fog_pars_fragment>
        varying float vAlpha;
        varying float vGlint;
        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float r = length(uv);
          if (r > 0.5) discard;
          float soft = 1.0 - smoothstep(0.0, 0.5, r);
          vec3 goldMist = mix(vec3(1.0, 0.88, 0.55), vec3(1.0, 0.72, 0.38), vGlint);
          gl_FragColor = vec4(goldMist, soft * vAlpha * 0.38);
                  #include <logdepthbuf_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
      transparent: true, logarithmicDepthBuffer: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this._lakeMistShader = lakeMistMat;
    const lakeMistPoints = new THREE.Points(lakeMistGeo, lakeMistMat);
    lakeMistPoints.frustumCulled = false;
    this.world.scene.add(lakeMistPoints);

    // =========================================================================
    // 10. ZONE 3: Rich Branching Coral Reef Architecture (Kaya Island & Coastal Reefs)
    // =========================================================================
    const coralRng = mulberry32(994422);

    // 10a. Branching Staghorn Corals (Multi-tiered antler branches)
    const buildStaghornGeometry = () => {
      const parts = [];
      const trunk = new THREE.CylinderGeometry(0.18, 0.28, 1.8, 6);
      trunk.translate(0, 0.9, 0);
      parts.push(trunk);

      const b1 = new THREE.CylinderGeometry(0.12, 0.16, 1.4, 5);
      b1.rotateZ(0.42);
      b1.translate(-0.35, 1.6, 0);
      const b2 = new THREE.CylinderGeometry(0.10, 0.14, 1.2, 5);
      b2.rotateZ(-0.48);
      b2.translate(0.35, 1.7, 0.1);
      const b3 = new THREE.CylinderGeometry(0.08, 0.11, 1.0, 5);
      b3.rotateX(0.45);
      b3.translate(0, 1.9, -0.3);
      const b4 = new THREE.CylinderGeometry(0.08, 0.11, 0.9, 5);
      b4.rotateX(-0.40);
      b4.translate(0, 2.0, 0.3);
      parts.push(b1, b2, b3, b4);

      const tip1 = new THREE.ConeGeometry(0.08, 0.4, 5);
      tip1.rotateZ(0.42);
      tip1.translate(-0.68, 2.2, 0);
      const tip2 = new THREE.ConeGeometry(0.08, 0.4, 5);
      tip2.rotateZ(-0.48);
      tip2.translate(0.68, 2.2, 0.1);
      parts.push(tip1, tip2);

      return safeMerge(parts, false) || trunk;
    };

    const geoStaghorn = buildStaghornGeometry();
    const matStaghorn = new THREE.MeshPhysicalMaterial({
      roughness: 0.65,
      metalness: 0.08,
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    this._staghornMat = matStaghorn;

    const staghornCount = 432;
    const staghornMesh = new THREE.InstancedMesh(geoStaghorn, matStaghorn, staghornCount);
    const staghornColors = new Float32Array(staghornCount * 3);
    const staghornPalettes = [
      [1.0, 0.42, 0.28], // Apricot Coral
      [0.0, 0.90, 1.0],  // Radiant Cyan
      [0.88, 0.28, 0.92],// Lavender Rose
      [0.98, 0.72, 0.15],// Golden Amber
      [0.22, 0.92, 0.65],// Mint Emerald
    ];

    for (let i = 0; i < staghornCount; i++) {
      const isKayaReef = i >= 102;
      let bx, bz, by;
      if (isKayaReef) {
        bx = (coralRng() - 0.5) * 85;
        bz = 2210 + coralRng() * 110;
        by = -10.2 + coralRng() * 4.4;
      } else {
        bx = (coralRng() - 0.5) * 320;
        bz = 990 + coralRng() * 300;
        by = -7.2 + coralRng() * 4.2;
      }
      const s = 0.9 + coralRng() * 1.4;

      initDummy.position.set(bx, by, bz);
      initDummy.rotation.set((coralRng() - 0.5) * 0.25, coralRng() * Math.PI * 2, (coralRng() - 0.5) * 0.25);
      initDummy.scale.set(s, s * (0.9 + coralRng() * 0.4), s);
      initDummy.updateMatrix();
      staghornMesh.setMatrixAt(i, initDummy.matrix);

      const pal = staghornPalettes[Math.floor(coralRng() * staghornPalettes.length)];
      staghornColors[i * 3]     = pal[0];
      staghornColors[i * 3 + 1] = pal[1];
      staghornColors[i * 3 + 2] = pal[2];
    }
    geoStaghorn.setAttribute('color', new THREE.InstancedBufferAttribute(staghornColors, 3));
    staghornMesh.instanceMatrix.needsUpdate = true;
    staghornMesh.frustumCulled = false;
    this.world.scene.add(staghornMesh);

    // 10b. Branching Elkhorn Corals (Broad palmate branching plates)
    const buildElkhornGeometry = () => {
      const parts = [];
      const trunk = new THREE.CylinderGeometry(0.35, 0.55, 1.4, 6);
      trunk.translate(0, 0.7, 0);
      parts.push(trunk);

      const plate1 = new THREE.BoxGeometry(1.8, 0.22, 1.2);
      plate1.rotateZ(0.28);
      plate1.rotateY(0.35);
      plate1.translate(-0.6, 1.6, 0.2);
      const plate2 = new THREE.BoxGeometry(1.6, 0.20, 1.4);
      plate2.rotateZ(-0.32);
      plate2.rotateY(-0.40);
      plate2.translate(0.6, 1.7, -0.2);
      const plate3 = new THREE.BoxGeometry(1.4, 0.18, 1.1);
      plate3.rotateX(0.30);
      plate3.translate(0, 2.0, 0.4);
      parts.push(plate1, plate2, plate3);

      return safeMerge(parts, false) || trunk;
    };

    const geoElkhorn = buildElkhornGeometry();
    const matElkhorn = new THREE.MeshPhysicalMaterial({
      roughness: 0.60,
      metalness: 0.08,
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    this._elkhornMat = matElkhorn;

    const elkhornCount = 288;
    const elkhornMesh = new THREE.InstancedMesh(geoElkhorn, matElkhorn, elkhornCount);
    const elkhornColors = new Float32Array(elkhornCount * 3);

    for (let i = 0; i < elkhornCount; i++) {
      const isKayaReef = i >= 72;
      let bx, bz, by;
      if (isKayaReef) {
        bx = (coralRng() - 0.5) * 80;
        bz = 2215 + coralRng() * 105;
        by = -10.4 + coralRng() * 4.5;
      } else {
        bx = (coralRng() - 0.5) * 300;
        bz = 1010 + coralRng() * 290;
        by = -7.5 + coralRng() * 4.0;
      }
      const s = 1.0 + coralRng() * 1.5;

      initDummy.position.set(bx, by, bz);
      initDummy.rotation.set((coralRng() - 0.5) * 0.2, coralRng() * Math.PI * 2, (coralRng() - 0.5) * 0.2);
      initDummy.scale.set(s, s * 0.9, s);
      initDummy.updateMatrix();
      elkhornMesh.setMatrixAt(i, initDummy.matrix);

      const pal = staghornPalettes[Math.floor(coralRng() * staghornPalettes.length)];
      elkhornColors[i * 3]     = pal[0];
      elkhornColors[i * 3 + 1] = pal[1];
      elkhornColors[i * 3 + 2] = pal[2];
    }
    geoElkhorn.setAttribute('color', new THREE.InstancedBufferAttribute(elkhornColors, 3));
    elkhornMesh.instanceMatrix.needsUpdate = true;
    elkhornMesh.frustumCulled = false;
    this.world.scene.add(elkhornMesh);

    // 10c. Domed Brain Corals with organic furrow gyri (Meandrine Labyrinth Grooves)
    const buildBrainCoralGeometry = () => {
      const geo = new THREE.SphereGeometry(2.4, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.56);
      geo.scale(1.0, 0.75, 1.0);
      const pos = geo.attributes.position;
      const norm = geo.attributes.normal || geo.computeVertexNormals() || geo.attributes.normal;
      const v = new THREE.Vector3(), n = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
        n.set(norm.getX(i), norm.getY(i), norm.getZ(i));
        const g1 = Math.sin(v.x * 5.5 + Math.sin(v.z * 4.5) * 2.2);
        const g2 = Math.cos(v.z * 5.5 + Math.cos(v.x * 4.5) * 2.2);
        const gyri = (g1 * g2) * 0.22;
        v.addScaledVector(n, gyri);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      return geo;
    };

    const geoBrain = buildBrainCoralGeometry();
    const matBrain = new THREE.MeshPhysicalMaterial({
      color: 0xf43f5e,
      emissive: 0xdb2777,
      emissiveIntensity: 2.2,
      roughness: 0.65,
      metalness: 0.1,
      vertexColors: true,
    });
    this._coralMat = matBrain;

    const brainCount = 456;
    const brainMesh = new THREE.InstancedMesh(geoBrain, matBrain, brainCount);
    const brainColors = new Float32Array(brainCount * 3);
    const coralPalettes = [
      [0.96, 0.25, 0.37], // Neon Magenta Coral
      [0.98, 0.57, 0.24], // Sunset Coral Orange
      [0.66, 0.33, 0.97], // Royal Violet Coral
      [0.05, 0.84, 0.63], // Bioluminescent Emerald
      [0.15, 0.75, 0.98], // Electric Cyan Coral
    ];

    for (let i = 0; i < brainCount; i++) {
      const isKayaReef = i >= 114;
      let bx, bz, by;
      if (isKayaReef) {
        bx = (coralRng() - 0.5) * 80;
        bz = 2210 + coralRng() * 110;
        by = -10.2 + coralRng() * 4.6;
      } else {
        bx = (coralRng() - 0.5) * 340;
        bz = 980 + coralRng() * 320;
        by = -6.8 + coralRng() * 4.5;
      }
      const s = 0.9 + coralRng() * 1.5;

      initDummy.position.set(bx, by, bz);
      initDummy.rotation.set(coralRng() * 0.5, coralRng() * Math.PI * 2, coralRng() * 0.5);
      initDummy.scale.set(s, s * 0.85, s);
      initDummy.updateMatrix();
      brainMesh.setMatrixAt(i, initDummy.matrix);

      const pal = coralPalettes[Math.floor(coralRng() * coralPalettes.length)];
      brainColors[i * 3]     = pal[0];
      brainColors[i * 3 + 1] = pal[1];
      brainColors[i * 3 + 2] = pal[2];
    }
    geoBrain.setAttribute('color', new THREE.InstancedBufferAttribute(brainColors, 3));
    brainMesh.instanceMatrix.needsUpdate = true;
    brainMesh.frustumCulled = false;
    brainMesh.castShadow = false;
    brainMesh.receiveShadow = false;
    this.world.scene.add(brainMesh);

    // 10d. Swaying Sea Anemones & Soft Coral Polyps
    const buildAnemoneGeometry = () => {
      const parts = [];
      const base = new THREE.CylinderGeometry(0.45, 0.65, 0.6, 8);
      base.translate(0, 0.3, 0);
      parts.push(base);

      const tentacleCount = 14;
      for (let t = 0; t < tentacleCount; t++) {
        const ang = (t / tentacleCount) * Math.PI * 2;
        const tent = new THREE.CylinderGeometry(0.03, 0.08, 1.3, 4);
        tent.rotateZ(0.35);
        tent.rotateY(ang);
        tent.translate(Math.cos(ang) * 0.4, 0.95, Math.sin(ang) * 0.4);
        parts.push(tent);
      }
      return safeMerge(parts, false) || base;
    };

    const geoAnemone = buildAnemoneGeometry();
    const anemoneShader = {
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        #include <fog_pars_vertex>
        attribute vec3 aColor;
        varying vec2 vUv;
        varying vec3 vCustomWorldNormal;
        varying vec3 vWorldPos;
        varying vec3 vAnemoneColor;
        uniform float uTime;

        void main() {
          vUv = uv;
          vAnemoneColor = aColor;
          vec3 pos = position;

          // Tentacle gentle waving sway with height factor
          float h = smoothstep(0.3, 1.4, pos.y);
          pos.x += sin(uTime * 2.2 + pos.y * 3.0 + pos.z * 2.0) * 0.15 * h;
          pos.z += cos(uTime * 1.8 + pos.y * 2.5 + pos.x * 2.0) * 0.15 * h;

          vec4 wPos = modelMatrix * vec4(pos, 1.0);
          vWorldPos = wPos.xyz;
          vCustomWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          gl_Position = projectionMatrix * viewMatrix * wPos;
                  #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        #include <fog_pars_fragment>
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vCustomWorldNormal;
        varying vec3 vWorldPos;
        varying vec3 vAnemoneColor;

        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos + vec3(0.0001));
          vec3 normal = normalize(vCustomWorldNormal);

          float fresnel = pow(1.0 - max(0.0, dot(normal, viewDir)), 2.5);
          float pulse = sin(uTime * 2.5 + vWorldPos.x * 0.5 + vWorldPos.z * 0.5) * 0.25 + 0.75;
          vec3 emissiveGlow = vAnemoneColor * pulse * 0.85;

          vec3 finalCol = vAnemoneColor * 0.75 + emissiveGlow + vec3(fresnel * 0.45);
          gl_FragColor = vec4(finalCol, 0.95);
                  #include <logdepthbuf_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
      transparent: false,
      side: THREE.DoubleSide,
    };

    const matAnemone = new THREE.ShaderMaterial(anemoneShader);
    this._anemoneMat = matAnemone;

    const anemoneCount = 128;
    const anemoneMesh = new THREE.InstancedMesh(geoAnemone, matAnemone, anemoneCount);
    const anemoneColors = new Float32Array(anemoneCount * 3);
    const anemonePalettes = [
      [1.0, 0.35, 0.55], // Strawberry Pink
      [0.25, 0.95, 0.82], // Fluorescent Mint
      [0.78, 0.42, 0.98], // Luminous Lavender
      [1.0, 0.65, 0.32], // Sunburst Peach
    ];

    for (let i = 0; i < anemoneCount; i++) {
      const isKayaReef = i >= 32;
      let ax, az, ay;
      if (isKayaReef) {
        ax = (coralRng() - 0.5) * 75;
        az = 2215 + coralRng() * 100;
        ay = -10.0 + coralRng() * 4.4;
      } else {
        ax = (coralRng() - 0.5) * 290;
        az = 1000 + coralRng() * 280;
        ay = -7.0 + coralRng() * 4.0;
      }
      const s = 0.9 + coralRng() * 1.3;

      initDummy.position.set(ax, ay, az);
      initDummy.rotation.set((coralRng() - 0.5) * 0.2, coralRng() * Math.PI * 2, (coralRng() - 0.5) * 0.2);
      initDummy.scale.set(s, s, s);
      initDummy.updateMatrix();
      anemoneMesh.setMatrixAt(i, initDummy.matrix);

      const pal = anemonePalettes[Math.floor(coralRng() * anemonePalettes.length)];
      anemoneColors[i * 3]     = pal[0];
      anemoneColors[i * 3 + 1] = pal[1];
      anemoneColors[i * 3 + 2] = pal[2];
    }
    geoAnemone.setAttribute('aColor', new THREE.InstancedBufferAttribute(anemoneColors, 3));
    anemoneMesh.instanceMatrix.needsUpdate = true;
    anemoneMesh.frustumCulled = false;
    this.world.scene.add(anemoneMesh);

    // 10e. Swaying Giant Kelp Forest (Tall undulating ribbons anchored on ocean floor)
    const buildKelpGeometry = () => {
      const parts = [];
      const stem = new THREE.CylinderGeometry(0.06, 0.12, 13.0, 5, 8);
      stem.translate(0, 6.5, 0);
      parts.push(stem);

      for (let l = 0; l < 10; l++) {
        const ly = 2.0 + l * 1.1;
        const leaf = new THREE.PlaneGeometry(0.9, 2.4, 2, 4);
        const lAng = (l % 2 === 0 ? 1 : -1) * 0.65 + l * 0.8;
        leaf.rotateZ(0.45 * (l % 2 === 0 ? 1 : -1));
        leaf.rotateY(lAng);
        leaf.translate(Math.cos(lAng) * 0.3, ly, Math.sin(lAng) * 0.3);
        parts.push(leaf);
      }
      return safeMerge(parts, false) || stem;
    };

    const geoKelp = buildKelpGeometry();
    const kelpShader = {
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        #include <fog_pars_vertex>
        varying vec2 vUv;
        varying vec3 vCustomWorldNormal;
        varying vec3 vWorldPos;
        uniform float uTime;

        void main() {
          vUv = uv;
          vec3 pos = position;

          // Undulating ocean current sway along height
          float heightFactor = smoothstep(0.5, 13.0, pos.y);
          float sway = sin(uTime * 1.4 + pos.y * 0.35 + modelMatrix[3][0] * 0.05) * 1.4 * heightFactor;
          float swayZ = cos(uTime * 1.1 + pos.y * 0.28 + modelMatrix[3][2] * 0.05) * 0.9 * heightFactor;
          pos.x += sway;
          pos.z += swayZ;

          vec4 wPos = modelMatrix * vec4(pos, 1.0);
          vWorldPos = wPos.xyz;
          vCustomWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          gl_Position = projectionMatrix * viewMatrix * wPos;
                  #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        #include <fog_pars_fragment>
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vCustomWorldNormal;
        varying vec3 vWorldPos;

        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos + vec3(0.0001));
          vec3 normal = normalize(vCustomWorldNormal);

          // Translucent amber-emerald kelp gradient
          vec3 baseKelp = vec3(0.18, 0.38, 0.12);
          vec3 sunlitKelp = vec3(0.52, 0.68, 0.22);
          vec3 amberKelp = vec3(0.68, 0.54, 0.18);

          float fresnel = pow(1.0 - max(0.0, dot(normal, viewDir)), 2.2);
          vec3 kelpCol = mix(baseKelp, sunlitKelp, smoothstep(2.0, 10.0, vWorldPos.y + 11.0));
          kelpCol = mix(kelpCol, amberKelp, fresnel * 0.45);

          gl_FragColor = vec4(kelpCol, 0.92);
                  #include <logdepthbuf_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
      transparent: false,
      side: THREE.DoubleSide,
    };

    const matKelp = new THREE.ShaderMaterial(kelpShader);
    this._kelpMat = matKelp;

    const kelpCount = 152;
    const kelpMesh = new THREE.InstancedMesh(geoKelp, matKelp, kelpCount);

    for (let i = 0; i < kelpCount; i++) {
      const isKayaReef = i >= 38;
      let kx, kz, ky;
      if (isKayaReef) {
        kx = (coralRng() - 0.5) * 90;
        kz = 2210 + coralRng() * 110;
        ky = -10.8;
      } else {
        kx = (coralRng() - 0.5) * 340;
        kz = 980 + coralRng() * 320;
        ky = -8.2;
      }
      const s = 0.85 + coralRng() * 0.5;

      initDummy.position.set(kx, ky, kz);
      initDummy.rotation.set((coralRng() - 0.5) * 0.15, coralRng() * Math.PI * 2, (coralRng() - 0.5) * 0.15);
      initDummy.scale.set(s, s * (0.9 + coralRng() * 0.4), s);
      initDummy.updateMatrix();
      kelpMesh.setMatrixAt(i, initDummy.matrix);
    }
    kelpMesh.instanceMatrix.needsUpdate = true;
    kelpMesh.frustumCulled = false;
    this.world.scene.add(kelpMesh);

    // 10f. Submerged Cyan Memorial Reef Crystals
    const geoReefCrystal = (() => {
      const base = new THREE.CylinderGeometry(0.75, 1.3, 5.0, 6);
      base.translate(0, 2.5, 0);
      const tip = new THREE.ConeGeometry(0.75, 1.8, 6);
      tip.translate(0, 5.9, 0);
      return safeMerge([base, tip], false) || base;
    })();
    const matReefCrystal = new THREE.MeshPhysicalMaterial({
      color: 0x06b6d4,
      emissive: 0x22d3ee,
      emissiveIntensity: 2.6,
      roughness: 0.12,
      metalness: 0.25,
    });
    this._reefCrystalMat = matReefCrystal;

    const crystalCount = 84;
    const crystalMesh = new THREE.InstancedMesh(geoReefCrystal, matReefCrystal, crystalCount);

    for (let i = 0; i < crystalCount; i++) {
      const isKayaReef = i >= 20;
      let cx, cz, cy;
      if (isKayaReef) {
        cx = (coralRng() - 0.5) * 75;
        cz = 2220 + coralRng() * 100;
        cy = -10.5 + coralRng() * 4.8;
      } else {
        cx = (coralRng() - 0.5) * 260;
        cz = 1040 + coralRng() * 240;
        cy = -8.5 + coralRng() * 4.0;
      }
      const s = 1.0 + coralRng() * 1.6;

      initDummy.position.set(cx, cy, cz);
      initDummy.rotation.set((coralRng() - 0.5) * 0.25, coralRng() * Math.PI * 2, (coralRng() - 0.5) * 0.25);
      initDummy.scale.set(s, s * (1.0 + coralRng() * 0.6), s);
      initDummy.updateMatrix();
      crystalMesh.setMatrixAt(i, initDummy.matrix);
    }
    crystalMesh.instanceMatrix.needsUpdate = true;
    crystalMesh.frustumCulled = false;
    crystalMesh.castShadow = false;
    crystalMesh.receiveShadow = false;
    this.world.scene.add(crystalMesh);

    // 10g. Sea Fans & Branching Gorgonians
    const geoFan = (() => {
      const fan = new THREE.PlaneGeometry(2.4, 2.8, 4, 4);
      fan.translate(0, 1.4, 0);
      return fan;
    })();
    const matFan = new THREE.MeshPhysicalMaterial({
      color: 0xec4899,
      emissive: 0x9d174d,
      emissiveIntensity: 0.75,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });

    const fanCount = 112;
    const fanMesh = new THREE.InstancedMesh(geoFan, matFan, fanCount);

    for (let i = 0; i < fanCount; i++) {
      const isKayaReef = i >= 28;
      let fx, fz, fy;
      if (isKayaReef) {
        fx = (coralRng() - 0.5) * 80;
        fz = 2215 + coralRng() * 105;
        fy = -9.8 + coralRng() * 4.2;
      } else {
        fx = (coralRng() - 0.5) * 280;
        fz = 1010 + coralRng() * 280;
        fy = -6.5 + coralRng() * 4.0;
      }
      const s = 1.0 + coralRng() * 1.2;

      initDummy.position.set(fx, fy, fz);
      initDummy.rotation.set((coralRng() - 0.5) * 0.35, coralRng() * Math.PI * 2, (coralRng() - 0.5) * 0.35);
      initDummy.scale.set(s, s, s);
      initDummy.updateMatrix();
      fanMesh.setMatrixAt(i, initDummy.matrix);
    }
    fanMesh.instanceMatrix.needsUpdate = true;
    fanMesh.frustumCulled = false;
    fanMesh.castShadow = false;
    fanMesh.receiveShadow = false;
    this.world.scene.add(fanMesh);

    // 10h. Submerged Emerald & Cyan Sea Grass Meadows (Delicate seabed ribbons with organic curvature)
    const geoGrass = (() => {
      const parts = [];
      const numBlades = 5;
      for (let b = 0; b < numBlades; b++) {
        const bAng = (b / numBlades) * Math.PI * 2;
        const blade = new THREE.PlaneGeometry(0.12, 1.4, 2, 4);
        const bPos = blade.attributes.position;
        for (let p = 0; p < bPos.count; p++) {
          const py = bPos.getY(p);
          const curve = Math.pow((py + 0.7) / 1.4, 1.8) * 0.35;
          bPos.setZ(p, bPos.getZ(p) + curve);
        }
        blade.computeVertexNormals();
        blade.rotateY(bAng);
        blade.translate(Math.cos(bAng) * 0.15, 0.7, Math.sin(bAng) * 0.15);
        parts.push(blade);
      }
      return safeMerge(parts, false) || parts[0];
    })();
    const matGrass = new THREE.MeshPhysicalMaterial({
      color: 0x14532d,
      roughness: 0.65,
      side: THREE.DoubleSide,
    });

    const grassCount = 192;
    const grassMesh = new THREE.InstancedMesh(geoGrass, matGrass, grassCount);

    for (let i = 0; i < grassCount; i++) {
      const isKayaReef = i >= 48;
      let gx, gz, gy;
      if (isKayaReef) {
        gx = (coralRng() - 0.5) * 85;
        gz = 2210 + coralRng() * 110;
        gy = -10.5 + coralRng() * 4.6;
      } else {
        gx = (coralRng() - 0.5) * 320;
        gz = 990 + coralRng() * 300;
        gy = -7.5 + coralRng() * 4.2;
      }
      const s = 0.6 + coralRng() * 0.6;

      initDummy.position.set(gx, gy, gz);
      initDummy.rotation.set((coralRng() - 0.5) * 0.2, coralRng() * Math.PI * 2, (coralRng() - 0.5) * 0.2);
      initDummy.scale.set(s, s * (0.8 + coralRng() * 0.5), s);
      initDummy.updateMatrix();
      grassMesh.setMatrixAt(i, initDummy.matrix);
    }
    grassMesh.instanceMatrix.needsUpdate = true;
    grassMesh.frustumCulled = false;
    grassMesh.castShadow = false;
    grassMesh.receiveShadow = false;
    this.world.scene.add(grassMesh);

    // =========================================================================
    // 10.5. Deep Kaya Abyss Coral Ecosystem (down to -126m)
    // =========================================================================
    const abyssRng = mulberry32(112233);

    const geoMassiveCoral = applyOrganicWeathering(new THREE.DodecahedronGeometry(3.5, 2), 0.3, 1.0, 55);
    const matMassiveCoral = Surfaces.massiveCoral ? Surfaces.massiveCoral() : new THREE.MeshPhysicalMaterial({color: 0x883355, roughness: 0.8});
    const massiveCoralMesh = new THREE.InstancedMesh(geoMassiveCoral, matMassiveCoral, 180);

    const geoAbyssRock = applyOrganicWeathering(new THREE.DodecahedronGeometry(4.0, 1), 0.2, 0.8, 99);
    const matAbyssRock = Surfaces.seabedRock ? Surfaces.seabedRock() : new THREE.MeshPhysicalMaterial({color: 0x334455, roughness: 0.9});
    const abyssRockMesh = new THREE.InstancedMesh(geoAbyssRock, matAbyssRock, 220);

    const geoAbyssAnemone = (() => {
      const parts = [];
      const base = new THREE.CylinderGeometry(0.6, 0.8, 1.0, 8);
      base.translate(0, 0.5, 0);
      parts.push(base);
      for (let t = 0; t < 16; t++) {
        const ang = (t / 16) * Math.PI * 2;
        const tent = new THREE.CylinderGeometry(0.05, 0.1, 1.8, 4);
        tent.rotateZ(0.4);
        tent.rotateY(ang);
        tent.translate(Math.cos(ang) * 0.5, 1.4, Math.sin(ang) * 0.5);
        parts.push(tent);
      }
      return safeMerge(parts, false) || base;
    })();
    const matAbyssAnemone = Surfaces.anemone ? Surfaces.anemone() : new THREE.MeshPhysicalMaterial({color: 0x33ffcc, emissive: 0x118866});
    const abyssAnemoneMesh = new THREE.InstancedMesh(geoAbyssAnemone, matAbyssAnemone, 250);

    const geoBioPlant = (() => {
      const parts = [];
      for(let b=0; b<3; b++) {
         const stalk = new THREE.CylinderGeometry(0.08, 0.2, 3.5, 5);
         stalk.translate(0, 1.75, 0);
         stalk.rotateX((abyssRng()-0.5)*0.3);
         stalk.rotateZ((abyssRng()-0.5)*0.3);
         parts.push(stalk);
      }
      return safeMerge(parts, false) || new THREE.CylinderGeometry(0.1, 0.2, 3);
    })();
    const matBioPlant = Surfaces.bioluminescentPlant ? Surfaces.bioluminescentPlant() : new THREE.MeshPhysicalMaterial({color: 0x00ffaa, emissive: 0x00ffaa, emissiveIntensity: 1.5});
    const bioPlantMesh = new THREE.InstancedMesh(geoBioPlant, matBioPlant, 300);

    const placeAbyssInstances = (mesh, count, scaleBase) => {
      for (let i = 0; i < count; i++) {
        // z = 2100..2750, |x| < 450
        const ax = (abyssRng() - 0.5) * 800;
        const az = 2120 + abyssRng() * 600;
        const ay = terrainHeight(ax, az);
        
        // Only place in deep abyss (-20 to -126)
        if (ay > -15) {
          // Hide it away if it didn't land in abyss
          initDummy.position.set(0, -9999, 0);
          initDummy.scale.set(0,0,0);
        } else {
          const s = scaleBase * (0.7 + abyssRng() * 0.6);
          initDummy.position.set(ax, ay, az);
          initDummy.rotation.set((abyssRng() - 0.5) * 0.4, abyssRng() * Math.PI * 2, (abyssRng() - 0.5) * 0.4);
          initDummy.scale.set(s, s * (0.8 + abyssRng() * 0.4), s);
        }
        initDummy.updateMatrix();
        mesh.setMatrixAt(i, initDummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      this.world.scene.add(mesh); console.log("[world3d] mesh added to scene", performance.now());
    };

    placeAbyssInstances(massiveCoralMesh, 180, 1.5);
    placeAbyssInstances(abyssRockMesh, 220, 1.8);
    placeAbyssInstances(abyssAnemoneMesh, 250, 1.2);
    placeAbyssInstances(bioPlantMesh, 300, 1.0);

    // =========================================================================
    // 11. Dynamic Sun Caustics Projection on Lakebed and Shallow Reef Seabed
    // =========================================================================
    const causticsShader = {
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        #include <fog_pars_vertex>
        varying vec2 vUv;
        varying vec3 vWorldPos;

        void main() {
          vUv = uv;
          vec4 wPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = wPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * wPos;
                  #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        #include <fog_pars_fragment>
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vWorldPos;

        void main() {
          vec2 p = vWorldPos.xz * 0.08;
          float t = uTime * 1.1;

          vec2 uv1 = p + vec2(sin(t * 0.6 + p.y * 1.6), cos(t * 0.5 + p.x * 1.6)) * 0.35;
          vec2 uv2 = p * 1.3 - vec2(cos(t * 0.7 + p.y * 2.0), sin(t * 0.65 + p.x * 2.0)) * 0.35;

          float c1 = pow(abs(sin(uv1.x * 10.0) * cos(uv1.y * 10.0)), 0.6);
          float c2 = pow(abs(sin(uv2.x * 14.0 + 1.2) * cos(uv2.y * 14.0 + 2.1)), 0.6);
          float caustic = pow(c1 * c2, 1.6) * 2.8;

          vec3 causticCol = mix(vec3(0.42, 0.92, 1.0), vec3(1.0, 0.95, 0.78), 0.35);
          float alpha = clamp(caustic * 0.55, 0.0, 0.75);

          gl_FragColor = vec4(causticCol * caustic, alpha);
                  #include <logdepthbuf_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
      transparent: true, logarithmicDepthBuffer: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    };

    const causticsMat = new THREE.ShaderMaterial(causticsShader);
    this._causticsShader = causticsMat;

    // Projection planes over Mirror Lake bed, Kaya Island Reef, and Coastal Reef
    const causticsPlanes = [
      { x: 430, y: 6.35, z: -280, sx: 240, sz: 240 },   // Mirror Lake
      { x: 0,   y: -10.8, z: 2280, sx: 320, sz: 260 },  // Kaya Reef
      { x: 0,   y: -7.2,  z: 1120, sx: 340, sz: 280 },  // Coastal Reef
    ];

    causticsPlanes.forEach(cp => {
      const planeGeo = new THREE.PlaneGeometry(cp.sx, cp.sz, 8, 8);
      planeGeo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(planeGeo, causticsMat);
      mesh.position.set(cp.x, cp.y, cp.z);
      mesh.frustumCulled = false;
      this.world.scene.add(mesh); console.log("[world3d] mesh added to scene", performance.now());
    });

    // =========================================================================
    // 12. Suspended Marine Snow Particle System (GPU Points with Subtle Bioluminescence)
    // =========================================================================
    const marineSnowCount = 520;
    const marineSnowGeo = new THREE.BufferGeometry();
    const marineSnowPos = new Float32Array(marineSnowCount * 3);
    const marineSnowData = new Float32Array(marineSnowCount * 3);
    const snowRng = mulberry32(338811);

    for (let i = 0; i < marineSnowCount; i++) {
      const isOcean = snowRng() > 0.35;
      if (isOcean) {
        // Kaya Island & Coastal Ocean lagoon (z = 980..2440, y = -11..0)
        marineSnowPos[i * 3]     = (snowRng() - 0.5) * 280;
        marineSnowPos[i * 3 + 1] = -11.0 + snowRng() * 11.2;
        marineSnowPos[i * 3 + 2] = 1000 + snowRng() * 1440;
      } else {
        // Mirror Lake Basin (x = 430, z = -280, y = 6.2..12.5)
        const ang = snowRng() * Math.PI * 2;
        const rad = snowRng() * 120;
        marineSnowPos[i * 3]     = 430 + Math.cos(ang) * rad;
        marineSnowPos[i * 3 + 1] = 6.2 + snowRng() * 6.2;
        marineSnowPos[i * 3 + 2] = -280 + Math.sin(ang) * (rad * 0.9);
      }

      marineSnowData[i * 3]     = 0.3 + snowRng() * 0.6; // drift speed
      marineSnowData[i * 3 + 1] = 0.8 + snowRng() * 1.4; // swirl amplitude
      marineSnowData[i * 3 + 2] = snowRng() * 100.0;     // phase
    }

    marineSnowGeo.setAttribute('position', new THREE.BufferAttribute(marineSnowPos, 3));
    marineSnowGeo.setAttribute('aSnowData', new THREE.BufferAttribute(marineSnowData, 3));
    marineSnowGeo.computeBoundingSphere();

    const marineSnowMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        #include <fog_pars_vertex>
        attribute vec3 aSnowData;
        varying float vAlpha;
        varying float vSparkle;
        uniform float uTime;

        void main() {
          vec3 pos = position;
          float t = mod(uTime * aSnowData.x * 0.4 + aSnowData.z, 12.0);
          pos.y -= t * 0.6;
          pos.x += sin(uTime * 0.6 + aSnowData.z) * aSnowData.y;
          pos.z += cos(uTime * 0.5 + aSnowData.z * 1.2) * aSnowData.y;

          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = min(28.0, 36.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
          vAlpha = smoothstep(0.0, 1.5, t) * (1.0 - smoothstep(8.5, 12.0, t));
          vSparkle = sin(uTime * 2.4 + aSnowData.z * 3.0) * 0.5 + 0.5;
                  #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        #include <fog_pars_fragment>
        varying float vAlpha;
        varying float vSparkle;

        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float r = length(uv);
          if (r > 0.5) discard;
          float soft = 1.0 - smoothstep(0.0, 0.5, r);
          vec3 bioCol = mix(vec3(0.55, 0.88, 1.0), vec3(0.4, 1.0, 0.8), vSparkle);
          gl_FragColor = vec4(bioCol, soft * vAlpha * (0.4 + vSparkle * 0.45));
                  #include <logdepthbuf_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
      transparent: true, logarithmicDepthBuffer: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this._marineSnowShader = marineSnowMat;
    const marineSnowPoints = new THREE.Points(marineSnowGeo, marineSnowMat);
    marineSnowPoints.frustumCulled = false;
    this.world.scene.add(marineSnowPoints);

    // this.world.scene.add(g);
    console.log('[cathedral] successfully added to scene!');
  }

  _coastalCliff() {
    const g = new THREE.Group();
    const rockMat = Surfaces.rockCliff(3.5);
    rockMat.side = THREE.DoubleSide;
    const darkStone = Surfaces.weatheredTravertine(2.2);
//     darkStone.color.setHex(0x8a7c68);
    const wood = Surfaces.timber(1.5);
    const bronze = Surfaces.bronze(1.0);

    // 1. High-Density Sculpted 3D Rocky Cliff Walls on West (x: -240..-52) and East (x: 52..260) Flanks
    // Central entrance avenue (x: -52..52, z: 860..1040) is kept 100% open & unobstructed for the Grand Promenade!
    const buildCliffSection = (minX, maxX, segsX) => {
      const width = maxX - minX;
      const cliffGeo = new THREE.PlaneGeometry(width, 64, segsX, 20);
      const pos = cliffGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const u = (pos.getX(i) + width * 0.5) / width;
        const v = (pos.getY(i) + 32) / 64;
        const worldX = minX + u * width;
        const topY = terrainHeight(worldX, 915) + 0.3;
        const bottomY = 0.8;

        const currY = bottomY + v * (topY - bottomY);
        const crags = fbm(worldX * 0.045, currY * 0.055, 3) * 6.5;
        const ledge = Math.sin(v * Math.PI * 4.0 + fbm(worldX * 0.02, 0, 2) * 2.0) * 3.5;
        const worldZ = 918.0 + (1.0 - v) * 38.0 + Math.max(0.5, crags + ledge + 2.0);

        pos.setX(i, worldX);
        pos.setY(i, currY);
        pos.setZ(i, worldZ);
      }
      cliffGeo.computeVertexNormals();
      const mesh = new THREE.Mesh(cliffGeo, rockMat);
      mesh.castShadow = mesh.receiveShadow = true;
      return mesh;
    };

    g.add(buildCliffSection(-240, -52, 28));
    g.add(buildCliffSection(52, 260, 28));

    // 1b. Volumetric 3D Rocky Buttresses & Overhangs along the cliff face flanks
    const buttressPositions = [-180, -145, -115, -85, 85, 115, 145, 185, 235];
    buttressPositions.forEach((bx, idx) => {
      const bHeight = terrainHeight(bx, 915) - 0.5;
      const bGeo = new THREE.DodecahedronGeometry(8.5 + (idx % 3) * 3.2, 1);
      bGeo.scale(1.2, bHeight / 12.0, 1.8);

      // Organic weathering: 3D FBM noise vertex perturbation (eliminates sterile geometry)
      const bPos = bGeo.attributes.position;
      const bNorm = bGeo.attributes.normal || bGeo.computeVertexNormals() || bGeo.attributes.normal;
      const bColors = new Float32Array(bPos.count * 3);
      const v = new THREE.Vector3(), n = new THREE.Vector3();
      for (let i = 0; i < bPos.count; i++) {
        v.set(bPos.getX(i), bPos.getY(i), bPos.getZ(i));
        // 3D FBM perturbation along vertex normal for organic crag surface
        const noiseVal = fbm((bx + v.x) * 0.08, v.y * 0.08, 3);
        const disp = (noiseVal - 0.5) * 0.35;
        const dir = v.clone().normalize();
        v.addScaledVector(dir, disp);
        bPos.setXYZ(i, v.x, v.y, v.z);

        // Vertex crevice AO baking: darken ground contact and recessed areas
        n.set(bNorm?.getX?.(i) || 0, bNorm?.getY?.(i) || 1, bNorm?.getZ?.(i) || 0);
        const groundDist = Math.max(0, v.y + bHeight * 0.5);
        const contactAO = Math.min(1.0, groundDist / 1.8);
        const upwardFacing = Math.max(0.0, n.y);
        const skyAO = 0.65 + 0.35 * upwardFacing;
        const ao = contactAO * skyAO;
        bColors[i * 3] = ao;
        bColors[i * 3 + 1] = ao;
        bColors[i * 3 + 2] = ao;
      }
      bGeo.setAttribute('color', new THREE.BufferAttribute(bColors, 3));
      bGeo.computeVertexNormals();

      const bMat = rockMat.clone();
      bMat.vertexColors = true;
      const bMesh = new THREE.Mesh(bGeo, bMat);
      bMesh.position.set(bx, bHeight * 0.5, 932 + (idx % 2) * 6);
      bMesh.rotation.set(0.2, idx * 1.1, 0.1);
      bMesh.castShadow = bMesh.receiveShadow = true;
      g.add(bMesh);
    });

    const createSeaStack = (sx, sz, height, radius, arch = false) => {
      const stackGroup = new THREE.Group();
      const segs = 18;
      const stackGeo = new THREE.CylinderGeometry(radius * 0.65, radius * 1.25, height, segs, 16);
      const sPositions = stackGeo.attributes.position;
      for (let i = 0; i < sPositions.count; i++) {
        const py = sPositions.getY(i);
        const px = sPositions.getX(i);
        const pz = sPositions.getZ(i);
        const disp = fbm((sx + px) * 0.08, py * 0.08, 3) * (radius * 0.45);
        sPositions.setX(i, px + disp);
        sPositions.setZ(i, pz + disp);
      }
      stackGeo.computeVertexNormals();
      const stackMesh = new THREE.Mesh(stackGeo, rockMat);
      stackMesh.position.set(0, height * 0.5 - 2.0, 0);
      stackMesh.castShadow = stackMesh.receiveShadow = true;
      stackGroup.add(stackMesh);

      // Foam ring around the sea stack base
      const foamDisc = new THREE.Mesh(
        new THREE.RingGeometry(radius * 1.1, radius * 2.2, 24),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, logarithmicDepthBuffer: true, opacity: 0.65, side: THREE.DoubleSide })
      );
      foamDisc.rotation.x = -Math.PI / 2;
      foamDisc.position.y = (WORLD.oceanLevel || 0.35) + 0.05;
      stackGroup.add(foamDisc);

      stackGroup.position.set(sx, 0, sz);
      return stackGroup;
    };

    // Offshore Monoliths Framed Dramatically in the Distance:
    // Monolith 1 (West sea stack):
    g.add(createSeaStack(-85, 1150, 26, 9.5));
    // Monolith 2 (East majestic sea stack with arch formation):
    g.add(createSeaStack(115, 1210, 34, 13.0, true));
    // Monolith 3 (Far coastal sea needle):
    g.add(createSeaStack(195, 1140, 22, 7.5));

    // 3. Flanking Overlook Balustrades (z=915) - Leaving Center Promenade (x: -52..52) Clear
    const balustrade = (x1, x2) => {
      const bGroup = new THREE.Group();
      const count = Math.max(2, Math.floor(Math.abs(x2 - x1) / 3.4));
      for (let i = 0; i <= count; i++) {
        const x = x1 + (i / count) * (x2 - x1);
        const z = 915.0;
        const y = terrainHeight(x, z);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.45, 2.2, 8), darkStone);
        post.position.set(x, y + 1.1, z);
        post.castShadow = true;
        bGroup.add(post);
      }
      const midX = (x1 + x2) * 0.5;
      const midY = (terrainHeight(x1, 915) + terrainHeight(x2, 915)) * 0.5 + 2.2;
      const railLen = Math.abs(x2 - x1) + 1.0;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(railLen, 0.45, 0.75), darkStone);
      rail.position.set(midX, midY, 915.0);
      rail.castShadow = true;
      bGroup.add(rail);
      return bGroup;
    };
    g.add(balustrade(-160, -52));
    g.add(balustrade(52, 140));

    // Lookout Viewpoint Benches on Scenic Flank Overlooks
    const bench = (bx, bz, rotY) => {
      const b = new THREE.Group();
      const by = terrainHeight(bx, bz);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.35, 1.4), wood);
      seat.position.set(0, 1.1, 0);
      b.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.2, 0.25), wood);
      back.position.set(0, 1.8, -0.6);
      b.add(back);
      const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.1, 1.2), darkStone);
      leg1.position.set(-1.7, 0.55, 0);
      const leg2 = leg1.clone();
      leg2.position.set(1.7, 0.55, 0);
      b.add(leg1, leg2);
      b.position.set(bx, by, bz);
      b.rotation.y = rotY;
      return b;
    };
    g.add(bench(-58, 908, 0.25));
    g.add(bench(58, 908, -0.25));

    // Bronze Viewfinder Pedestal on West Ocean Overlook
    const vf = new THREE.Group();
    const vfy = terrainHeight(-52, 912);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 2.4, 8), darkStone);
    base.position.y = 1.2;
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.6, 8), bronze);
    scope.rotation.x = Math.PI / 2 - 0.25;
    scope.position.set(0, 2.6, 0.2);
    vf.add(base, scope);
    vf.position.set(-52, vfy, 912);
    g.add(vf);

    this.world.scene.add(g);
  }

  _oceanWaterfall() {
    const g = new THREE.Group();
    const cliffX = 165, cliffZ = 918;
    const topY = 7.80; // exact water height of RIVER_OUTLET terminus
    const bottomY = 0.40; // ocean surface level
    const fallHeight = topY - bottomY;

    // 1. High-Velocity Cascading Water Curtain with Accelerated Gravitational Descent
    const oceanFallShader = {
      uniforms: {
        uTime: { value: 0 },
        uDeepColor: { value: new THREE.Color(0x083244) },
        uGlacierColor: { value: new THREE.Color(0x38b8e0) },
        uFoamColor: { value: new THREE.Color(0xffffff) },
        uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.5).normalize() },
        uSunColor: { value: new THREE.Color(0xffeedd) },
      },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        #include <fog_pars_vertex>
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        uniform float uTime;

        void main() {
          vUv = uv;
          vec3 pos = position;
          float fallFactor = clamp(1.0 - uv.y, 0.0, 1.0);
          float gravitySpeed = 10.0 + 28.0 * sqrt(fallFactor + 0.005);
          
          float wave1 = sin(pos.y * 1.8 - uTime * (gravitySpeed * 1.6)) * 0.28;
          float wave2 = cos(pos.x * 3.5 + pos.y * 1.2 - uTime * (gravitySpeed * 1.2)) * 0.20;
          float wave3 = sin(pos.x * 6.5 - pos.y * 2.8 - uTime * (gravitySpeed * 2.1)) * 0.12;
          
          float edgeMask = smoothstep(0.01, 0.10, uv.y) * smoothstep(1.0, 0.95, uv.y);
          pos.x += normal.x * (wave1 + wave2) * edgeMask;
          pos.z += normal.z * (wave1 + wave3) * edgeMask;
          
          vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                  #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        #include <fog_pars_fragment>
        uniform float uTime;
        uniform vec3 uDeepColor;
        uniform vec3 uGlacierColor;
        uniform vec3 uFoamColor;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormal;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 5; i++) {
            v += amp * noise(p);
            p *= 2.02;
            amp *= 0.5;
          }
          return v;
        }

        void main() {
          float fallFactor = clamp(1.0 - vUv.y, 0.0, 1.0);
          float speedY = uTime * (10.0 + 28.0 * sqrt(fallFactor + 0.005));
          vec2 flow1 = vec2(vUv.x * 20.0, vUv.y * 36.0 - speedY);
          vec2 flow2 = vec2(vUv.x * 40.0 + 1.8, vUv.y * 72.0 - speedY * 1.6);
          vec2 flow3 = vec2(vUv.x * 80.0 - 1.2, vUv.y * 120.0 - speedY * 2.4);

          float n1 = fbm(flow1);
          float n2 = fbm(flow2);
          float n3 = noise(flow3);
          
          float foamMask = smoothstep(0.28, 0.72, n1 * 0.50 + n2 * 0.35 + n3 * 0.20);
          
          // Contact edge shear aeration along sea cliff wall
          float edgeDist = abs(vUv.x - 0.5) * 2.0;
          float edgeFoam = smoothstep(0.35, 0.92, edgeDist) * 0.75;
          foamMask = clamp(foamMask + edgeFoam + (1.0 - vUv.y) * 0.20, 0.0, 1.0);

          vec3 viewDir = normalize(cameraPosition - vWorldPos + vec3(0.0001));
          float cosTheta = clamp(dot(vNormal, viewDir), 0.0, 1.0);
          float fresnel = 0.0204 + (1.0 - 0.0204) * pow(1.0 - cosTheta, 5.0);

          vec3 sunDir = normalize(uSunDir);
          vec3 halfVec = normalize(sunDir + viewDir);
          float NdotH = max(0.0, dot(vNormal, halfVec));
          float spec = pow(NdotH, 54.0) * 2.8;

          vec3 baseWater = mix(uDeepColor, uGlacierColor, n1 * 0.65 + 0.35);
          vec3 waterCol = mix(baseWater, uFoamColor, foamMask);
          waterCol += fresnel * vec3(0.35, 0.65, 0.85) * 0.45;
          waterCol += uSunColor * spec;

          float alpha = mix(0.75, 0.98, foamMask) * smoothstep(0.0, 0.04, vUv.y) * (1.0 - smoothstep(0.96, 1.0, vUv.y));
          gl_FragColor = vec4(waterCol, alpha);
                  #include <logdepthbuf_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
      transparent: true, logarithmicDepthBuffer: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      };
    const waterMat = new THREE.ShaderMaterial(oceanFallShader);
    this._oceanWaterfallShader = waterMat;

    const fallCurve = new THREE.CatmullRomCurve3([
      new V3(cliffX, topY + 0.1, cliffZ),
      new V3(cliffX + 0.8, topY - 1.2, cliffZ + 8),
      new V3(cliffX + 1.8, topY - fallHeight * 0.55, cliffZ + 20),
      new V3(cliffX + 2.5, bottomY + 0.3, cliffZ + 36),
    ]);
    const fallGeo = new THREE.TubeGeometry(fallCurve, 20, 5.5, 8, false);
    fallGeo.scale(1.8, 0.30, 1.0);
    fallGeo.computeBoundingSphere();
    const fallMesh = new THREE.Mesh(fallGeo, waterMat);
    fallMesh.castShadow = fallMesh.receiveShadow = true;
    fallMesh.frustumCulled = false;
    fallMesh.renderOrder = 1;
    g.add(fallMesh);

    // Dark wet cliff rock backing
    const rockBackingPoints = [
      new V3(cliffX, topY - 0.4, cliffZ - 1),
      new V3(cliffX + 0.6, topY - 1.6, cliffZ + 6),
      new V3(cliffX + 1.4, topY - fallHeight * 0.58, cliffZ + 18),
      new V3(cliffX + 2.2, bottomY, cliffZ + 34),
    ];
    const rockCurve = new THREE.CatmullRomCurve3(rockBackingPoints);
    const rockGeo = new THREE.TubeGeometry(rockCurve, 16, 7.0, 8, false);
    rockGeo.scale(1.9, 0.4, 1.0);
    rockGeo.computeBoundingSphere();
    const wetRockMat = Surfaces.photogrammetryRock(3.0);
//     wetRockMat.color.setHex(0x181a1c);
//     wetRockMat.roughness = 0.25;
    const rockMesh = new THREE.Mesh(rockGeo, wetRockMat);
    rockMesh.frustumCulled = false;
    g.add(rockMesh);

    // 2. Base Plunge Pool with Dynamic Animated Ripple Disc
    const poolGeo = new THREE.CircleGeometry(24, 24);
    poolGeo.computeBoundingSphere();
    const poolDisc = new THREE.Mesh(poolGeo, this.world._waterPoolMat);
    poolDisc.rotation.x = -Math.PI / 2;
    poolDisc.position.set(cliffX + 2.5, bottomY + 0.15, cliffZ + 36);
    poolDisc.renderOrder = 1;
    poolDisc.frustumCulled = true;
    g.add(poolDisc);

    // 3. Small plunge-pool foam disc at the base (No GPU particles)
    const foamDiscGeo = new THREE.CircleGeometry(6, 16);
    const foamDiscMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true, logarithmicDepthBuffer: true,
      opacity: 0.8,
      depthWrite: false,
      });
    const foamDisc = new THREE.Mesh(foamDiscGeo, foamDiscMat);
    foamDisc.rotation.x = -Math.PI / 2;
    foamDisc.position.set(cliffX + 2.5, bottomY + 0.16, cliffZ + 36);
    foamDisc.renderOrder = 2;
    g.add(foamDisc);

    // 4. Crystal Stream draining from plunge pool across beach sand into the ocean bay
    const streamPts = [
      new V3(cliffX + 2.5, bottomY + 0.12, cliffZ + 36),
      new V3(cliffX + 12, bottomY * 0.7 + 0.12, cliffZ + 85),
      new V3(cliffX + 22, bottomY * 0.4 + 0.12, cliffZ + 150),
      new V3(cliffX + 32, 0.35, cliffZ + 220),
    ];
    const streamCurve = new THREE.CatmullRomCurve3(streamPts);
    const streamGeo = new THREE.TubeGeometry(streamCurve, 16, 5.0, 6, false);
    streamGeo.scale(1.8, 0.16, 1.0);
    streamGeo.computeBoundingSphere();
    const streamMesh = new THREE.Mesh(streamGeo, this.waterMat);
    streamMesh.frustumCulled = false;
    g.add(streamMesh);

    this.world.scene.add(g);
  }

  _coveOceanSurf() {
    const g = new THREE.Group();
    
    // Contoured ocean shoreline surf plane draped over the crescent beach
    const surfGeo = new THREE.PlaneGeometry(380, 110, 90, 32);
    surfGeo.rotateX(-Math.PI / 2);
    surfGeo.computeBoundingSphere();
    surfGeo.computeBoundingBox();

    const surfShader = {
      uniforms: {
        uTime: { value: 0 },
        uDeepWater: { value: new THREE.Color(0x06283d) },
        uCrestColor: { value: new THREE.Color(0x18b0c8) },
        uFoamColor: { value: new THREE.Color(0xf6fbff) },
        uWetSand: { value: new THREE.Color(0x1e150d) },
        uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.5).normalize() },
        uSunColor: { value: new THREE.Color(0xffeedd) },
      },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        #include <fog_pars_vertex>
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying float vJacobian;
        varying float vWaveHeight;
        uniform float uTime;
        
        vec3 gerstnerSurf(vec2 dir, float steepness, float wavelength, vec3 pos, float time, float depthFade, inout vec3 tangent, inout vec3 binormal) {
          float k = 2.0 * 3.14159265 / wavelength;
          float c = sqrt(9.81 / k);
          vec2 d = normalize(dir);
          float f = k * (dot(d, pos.xz) - c * time);
          float a = (steepness / k) * depthFade;
          float sinF = sin(f);
          float cosF = cos(f);

          tangent += vec3(
            -d.x * d.x * (steepness * sinF * depthFade),
            d.x * (steepness * cosF * depthFade),
            -d.x * d.y * (steepness * sinF * depthFade)
          );
          binormal += vec3(
            -d.x * d.y * (steepness * sinF * depthFade),
            d.y * (steepness * cosF * depthFade),
            -d.y * d.y * (steepness * sinF * depthFade)
          );

          return vec3(d.x * (a * cosF), a * sinF, d.y * (a * cosF));
        }

        void main() {
          vUv = uv;
          vec3 pos = position;
          
          // Shore depth attenuation: waves surge, peak, and disperse gently on beach sand
          float shoreFade = smoothstep(0.04, 0.70, uv.y);
          
          vec3 tangent = vec3(1.0, 0.0, 0.0);
          vec3 binormal = vec3(0.0, 0.0, 1.0);

          vec3 w1 = gerstnerSurf(vec2(0.25, 0.97), 0.32, 42.0, pos, uTime * 1.8, shoreFade, tangent, binormal);
          vec3 w2 = gerstnerSurf(vec2(-0.15, 0.98), 0.24, 26.0, pos, uTime * 2.2, shoreFade, tangent, binormal);
          vec3 w3 = gerstnerSurf(vec2(0.40, 0.91), 0.16, 14.0, pos, uTime * 2.8, shoreFade, tangent, binormal);

          vec3 offset = w1 + w2 + w3;
          pos += offset;
          vWaveHeight = offset.y;

          // Analytical Jacobian determinant: whitecap pinching
          float jDet = tangent.x * binormal.z - tangent.z * binormal.x;
          vJacobian = jDet;

          vec3 waveNormal = normalize(cross(binormal, tangent));
          vNormal = normalize((modelMatrix * vec4(waveNormal, 0.0)).xyz);
          
          vec4 worldPos = modelMatrix * vec4(pos, 1.0);
          vWorldPos = worldPos.xyz;
          
          gl_Position = projectionMatrix * viewMatrix * worldPos;
                  #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        #include <fog_pars_fragment>
        uniform float uTime;
        uniform vec3 uDeepWater;
        uniform vec3 uCrestColor;
        uniform vec3 uFoamColor;
        uniform vec3 uWetSand;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;

        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying float vJacobian;
        varying float vWaveHeight;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 5; i++) {
            v += amp * noise(p);
            p *= 2.02;
            amp *= 0.5;
          }
          return v;
        }

        void main() {
          // Multi-frequency procedural Perlin foam wash with trailing foam lacing
          vec2 foamUv1 = vUv * vec2(32.0, 14.0) + vec2(uTime * 0.35, uTime * 0.12);
          vec2 foamUv2 = vUv * vec2(64.0, 28.0) - vec2(uTime * 0.50, -uTime * 0.20);
          float nFoam1 = fbm(foamUv1);
          float nFoam2 = noise(foamUv2);
          float nFoam = nFoam1 * 0.70 + nFoam2 * 0.30;

          // Jacobian determinant wave crest froth (whitecap pinching where J_det < 0.45)
          float whitecap = 1.0 - smoothstep(0.10, 0.45, vJacobian);

          float shoreFade = smoothstep(0.02, 0.25, vUv.y);
          float crestWave = sin(vUv.x * 28.0 + vUv.y * 14.0 - uTime * 3.2) * 0.5 + 0.5;

          // Shore wash uprush and backwash lacing
          float washFront = smoothstep(0.35, 0.75, nFoam * crestWave + whitecap * 0.8) * shoreFade;
          float trailingLace = smoothstep(0.48, 0.82, nFoam1) * (1.0 - shoreFade * 0.6);
          float totalFoam = clamp(washFront + trailingLace * 0.65 + whitecap * 0.85, 0.0, 1.0);

          float wetSandMask = 1.0 - smoothstep(0.0, 0.14, vUv.y);

          vec3 baseWater = mix(uCrestColor, uDeepWater, shoreFade * 0.85);
          vec3 finalColor = mix(baseWater, uFoamColor, totalFoam * 0.92);
          finalColor = mix(finalColor, uWetSand, wetSandMask * 0.80);

          // Exact Dielectric Fresnel (F0 = 0.0204 for water IOR 1.333)
          vec3 viewDir = normalize(cameraPosition - vWorldPos + vec3(0.0001));
          float cosTheta = clamp(dot(vNormal, viewDir), 0.0, 1.0);
          float fresnel = 0.0204 + (1.0 - 0.0204) * pow(1.0 - cosTheta, 5.0);

          // GGX Microfacet Sun Specular Highlights
          vec3 sunDir = normalize(uSunDir);
          vec3 halfVec = normalize(sunDir + viewDir);
          float NdotH = max(0.0, dot(vNormal, halfVec));
          float NdotV = max(0.001, dot(vNormal, viewDir));
          float NdotL = max(0.001, dot(vNormal, sunDir));
          float alphaRoughness = 0.06;
          float alphaSq = alphaRoughness * alphaRoughness;
          float denom = (NdotH * NdotH * (alphaSq - 1.0) + 1.0);
          float D = alphaSq / (3.14159265 * denom * denom);
          float k = (alphaRoughness + 1.0) * (alphaRoughness + 1.0) / 8.0;
          float G = (NdotV / (NdotV * (1.0 - k) + k)) * (NdotL / (NdotL * (1.0 - k) + k));
          vec3 specLight = uSunColor * ((D * fresnel * G) / (4.0 * NdotV * NdotL + 0.001)) * NdotL * 3.8;
          finalColor += specLight;

          float alpha = smoothstep(0.008, 0.12, vUv.y) * mix(0.88, 0.98, fresnel);
          gl_FragColor = vec4(finalColor, alpha);
                  #include <logdepthbuf_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
      transparent: true, logarithmicDepthBuffer: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
    };

    const surfMat = new THREE.ShaderMaterial(surfShader);
    this._surfShader = surfMat;
    const surfMesh = new THREE.Mesh(surfGeo, surfMat);
    surfMesh.position.set(35, 1.2, 1140);
    g.add(surfMesh);
    this._surfWaves = [surfMesh];

    // Sculpted Weathered Driftwood on the Beach
    const woodMat = Surfaces.timber(2.0);
    const rng = mulberry32(884422);
    for (let i = 0; i < 16; i++) {
      const dx = (rng() - 0.5) * 240 + 35;
      const dz = 980 + rng() * 180;
      if (Math.abs(dx) < 48 || distToRoads(dx, dz) < 14) continue;
      const dy = terrainHeight(dx, dz);
      if (dy < 0.4 || dy > 3.0) continue;
      const len = 4.0 + rng() * 6.0;
      const rad = 0.35 + rng() * 0.45;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.7, rad, len, 8), woodMat);
      log.position.set(dx, dy + rad * 0.8, dz);
      log.rotation.set(0.1, rng() * Math.PI, 1.57 + (rng() - 0.5) * 0.2);
      log.castShadow = log.receiveShadow = true;
      g.add(log);
    }

    // Coastal Sea Oats & Beach Grass Tufts
    const seaOatMat = new THREE.MeshPhysicalMaterial({
      color: 0xc8b27a,
      roughness: 0.8,
      metalness: 0.05,
      side: THREE.DoubleSide,
      alphaTest: 0.5,
    });
    const seaOatGeo = new THREE.PlaneGeometry(1.8, 3.2);
    seaOatGeo.translate(0, 1.6, 0);
    for (let o = 0; o < 32; o++) {
      const ox = (rng() - 0.5) * 260 + 35;
      const oz = 960 + rng() * 140;
      if (Math.abs(ox) < 48 || distToRoads(ox, oz) < 14) continue;
      const oy = terrainHeight(ox, oz);
      if (oy < 1.2 || oy > 4.5) continue;
      const oat = new THREE.Mesh(seaOatGeo, seaOatMat);
      oat.position.set(ox, oy, oz);
      oat.rotation.set(0.15, rng() * Math.PI * 2, (rng() - 0.5) * 0.2);
      oat.scale.setScalar(0.8 + rng() * 0.5);
      g.add(oat);
    }

    // Pearlescent Seashells & Tidal Sandstones
    const shellMat = new THREE.MeshPhysicalMaterial({
      color: 0xfbf2ea,
      roughness: 0.25,
      metalness: 0.1,
    });
    const shellGeo = new THREE.ConeGeometry(0.25, 0.45, 6);
    shellGeo.scale(1.2, 0.6, 1.0);
    for (let s = 0; s < 45; s++) {
      const sx = (rng() - 0.5) * 280 + 35;
      const sz = 1010 + rng() * 160;
      const sy = terrainHeight(sx, sz);
      if (sy < 0.2 || sy > 2.2) continue;
      const shell = new THREE.Mesh(shellGeo, shellMat);
      shell.position.set(sx, sy + 0.1, sz);
      shell.rotation.set((rng() - 0.5) * 0.4, rng() * Math.PI * 2, (rng() - 0.5) * 0.4);
      g.add(shell);
    }

    this.world.scene.add(g);
  }

  _mountainWaterfall() {
    const g = new THREE.Group();

    // 1. High-Speed Turbulent Waterfall Cataract Shader
    const waterfallShader = {
      uniforms: {
        uTime: { value: 0 },
        uDeepColor: { value: new THREE.Color(0x0a1e28) },
        uGlacierColor: { value: new THREE.Color(0x227497) },
        uFoamColor: { value: new THREE.Color(0xffffff) },
        uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
      },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        #include <fog_pars_vertex>
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        uniform float uTime;

        vec3 gerstnerWave(vec2 dir, float steepness, float wavelength, vec2 p, float speed, float t) {
            float k = 2.0 * 3.14159265 / wavelength;
            float c = sqrt(9.8 / k);
            vec2 d = normalize(dir);
            float f = k * (dot(d, p) - c * speed * t);
            float a = steepness / k;
            return vec3(
                d.x * (a * cos(f)),
                d.y * (a * cos(f)),
                a * sin(f)
            );
        }

        void main() {
          vUv = uv;
          vec3 pos = position;
          
          vec3 g1 = gerstnerWave(vec2(0.0, 1.0), 0.2, 5.0, pos.xy, 4.0, uTime);
          vec3 g2 = gerstnerWave(vec2(0.2, 1.0), 0.15, 3.0, pos.xy, 5.0, uTime);
          vec3 g3 = gerstnerWave(vec2(-0.2, 1.0), 0.1, 2.0, pos.xy, 6.0, uTime);
          
          vec3 gWave = (g1 + g2 + g3) * smoothstep(0.05, 0.2, uv.y) * smoothstep(1.0, 0.9, uv.y);
          pos += gWave;
          
          vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                  #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        #include <fog_pars_fragment>
        uniform float uTime;
        uniform vec3 uDeepColor;
        uniform vec3 uGlacierColor;
        uniform vec3 uFoamColor;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying vec3 vNormal;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 5; i++) {
            v += amp * noise(p);
            p *= 2.02;
            amp *= 0.5;
          }
          return v;
        }

        void main() {
          // Multi-frequency FBM foam aeration
          vec2 flow1 = vec2(vUv.x * 12.0, vUv.y * 22.0 - uTime * 4.5);
          vec2 flow2 = vec2(vUv.x * 24.0 + 2.0, vUv.y * 38.0 - uTime * 7.2);
          vec2 spray = vec2(vUv.x * 45.0, vUv.y * 55.0 - uTime * 10.5);

          float n1 = fbm(flow1);
          float n2 = fbm(flow2);
          float nSpray = noise(spray);

          // Foam mask with braided aeration
          float foamMask = smoothstep(0.45, 0.85, n1 * 0.6 + n2 * 0.3 + nSpray * 0.2);
          
          // Edge aeration (turbulent friction against bedrock)
          float edgeDist = abs(vUv.x - 0.5) * 2.0;
          float edgeFoam = smoothstep(0.65, 0.95, edgeDist) * 0.45;
          foamMask = clamp(foamMask + edgeFoam, 0.0, 1.0);

          // Crystalline glacial depth gradient
          vec3 waterCol = mix(uDeepColor, uGlacierColor, n1 * 0.8 + 0.2);
          vec3 finalCol = mix(waterCol, uFoamColor, foamMask);

          // Specular highlights
          vec3 viewDir = normalize(cameraPosition - vWorldPos + vec3(0.0001));
          vec3 halfVector = normalize(vec3(0.4, 0.8, 0.5) + viewDir + vec3(0.0001));
          float spec = pow(max(0.0, dot(vNormal, halfVector)), 48.0) * 0.6;
          finalCol += vec3(spec);

          float alpha = mix(0.85, 0.98, foamMask) * smoothstep(0.0, 0.04, vUv.y) * smoothstep(1.0, 0.96, vUv.y);
          alpha *= smoothstep(1.0, 0.85, edgeDist);

          gl_FragColor = vec4(finalCol, alpha);
                  #include <logdepthbuf_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
      transparent: true, logarithmicDepthBuffer: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      };
    const waterfallMat = new THREE.ShaderMaterial(waterfallShader);
    this._mountainWaterfallShader = waterfallMat;

    // Spline Chute Builder
    const buildChuteRibbon = (curve, widthTop, widthBottom, segs = 140) => {
      const positions = [], uvs = [], indices = [];
      const up = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const p = curve.getPoint(u);
        const tan = curve.getTangent(u).normalize();
        let binorm = new THREE.Vector3().crossVectors(tan, up).normalize();
        if (binorm.lengthSq() < 0.1) binorm = new THREE.Vector3(1, 0, 0);
        const w = (widthTop * (1 - u) + widthBottom * u) * 0.5;
        const pL = p.clone().addScaledVector(binorm, -w);
        const pR = p.clone().addScaledVector(binorm, w);
        positions.push(pL.x, pL.y, pL.z, pR.x, pR.y, pR.z);
        uvs.push(0, u, 1, u);
        if (i > 0) {
          const k = i * 2;
          indices.push(k - 2, k - 1, k, k - 1, k + 1, k);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    };

    // 1. High Alpine Glacial Reservoir Tarn (Cathedral Feeding Pool) at (x=0, y=182, z=-515)
    // Rich expansive water plane covering full tarn basin (z = -460..-570, |x| < 60)
    const upperTarnGeo = new THREE.PlaneGeometry(120, 140, 32, 32);
    upperTarnGeo.rotateX(-Math.PI / 2);
    const tarnMat = this._createPhysicalWaterMaterial(this._waterNormals, 'lake');
    tarnMat.side = THREE.DoubleSide;
    tarnMat.depthWrite = false;
    const upperTarnMesh = new THREE.Mesh(upperTarnGeo, tarnMat);
    upperTarnMesh.position.set(0, 182.0, -565);
    upperTarnMesh.receiveShadow = true;
    upperTarnMesh.frustumCulled = false;
    upperTarnMesh.renderOrder = 1;
    this._upperTarnMesh = upperTarnMesh;
    g.add(upperTarnMesh);

    // Continuous Cataract Waterfall: From Cathedral Feeding Pool outflow (z = -510, y = 182.0m)
    // rushing through upper rapids (z = -485..-468), pouring over the 175m cliff lip (z = -450),
    // and plunging 157m vertically down the mountain face into the plunge pool at (z = -360, y = 18.0m)
    const fallPoints = [
      new V3(0, 182.0, -605),   // Glacial tarn outflow
      new V3(0, 180.5, -595),   // Upper alpine rapids
      new V3(0, 178.0, -588),   // Channel narrows toward cliff lip
      new V3(0, 175.0, -585),   // Soaring over the great cataract cliff lip
      new V3(0, 120.0, -575),   // Free vertical fall begins
      new V3(0, 80.0, -565),    // Mid-cataract roaring spray
      new V3(0, 40.0, -555),    // Lower cataract churning curtain
      new V3(0, 20.0, -550),    // Base impact cascade
      new V3(0, 14.5, -550),    // Plunge pool water level
    ];
    const fallCurve = new THREE.CatmullRomCurve3(fallPoints);

    // 2. Dark Wet Granite Bedrock Backing — sits safely behind the waterfall chute
    const bedrockPoints = [
      new V3(0, 180.5, -605),
      new V3(0, 178.5, -595),
      new V3(0, 175.0, -588),
      new V3(0, 169.0, -585),
      new V3(0, 133.0, -575),
      new V3(0, 78.0, -565),
      new V3(0, 36.0, -555),
      new V3(0, 13.0, -550),
      new V3(0, 14.0, -545),
    ];
    const bedrockCurve = new THREE.CatmullRomCurve3(bedrockPoints);
    let bedrockGeo = buildChuteRibbon(bedrockCurve, 38, 75, 140);
    applyOrganicWeathering(bedrockGeo, 0.12, 0.40, 77);
    bakeVertexCreviceOcclusion(bedrockGeo, 4.5);

    const wetRockMat = Surfaces.photogrammetryRock(4.0);

    const bedrockMesh = new THREE.Mesh(bedrockGeo, wetRockMat);
    bedrockMesh.position.z -= 1.2;
    bedrockMesh.receiveShadow = bedrockMesh.castShadow = true;
    g.add(bedrockMesh);

    // 3. Primary Cascade & Aerated Outer Veil
    const primaryFall = new THREE.Mesh(buildChuteRibbon(fallCurve, 20, 48, 140), waterfallMat);
    primaryFall.position.z += 0.2;
    primaryFall.renderOrder = 1;
    g.add(primaryFall);
    
    const veilPoints = fallPoints.map(p => new V3(p.x, p.y - 0.3, p.z + 1.8));
    const veilCurve = new THREE.CatmullRomCurve3(veilPoints);
    const veilMesh = new THREE.Mesh(buildChuteRibbon(veilCurve, 26, 64, 140), waterfallMat);
    veilMesh.position.z += 0.8;
    veilMesh.renderOrder = 2;
    g.add(veilMesh);

    // 4. Physical Plunge Pool Water Basin (Disc of water with foam churning at z=-360)
    const poolGeo = new THREE.CircleGeometry(56, 48);
    const poolDisc = new THREE.Mesh(poolGeo, this.waterMat);
    poolDisc.rotation.x = -Math.PI / 2;
    poolDisc.position.set(0, 14.5, -550);
    poolDisc.receiveShadow = true;
    poolDisc.frustumCulled = false;
    poolDisc.renderOrder = 1;
    g.add(poolDisc);

    // Dynamic Concentric Plunge Pool Churn Foam Rings overlay
    const poolFoamGeo = new THREE.PlaneGeometry(96, 96);
    const poolFoamMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        #include <fog_pars_vertex>
 varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
#include <logdepthbuf_vertex>
          #include <fog_vertex>
        }`,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        #include <fog_pars_fragment>
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vec2 uv = vUv - 0.5;
          float dist = length(uv);
          float rings = sin(dist * 36.0 - uTime * 6.0) * 0.5 + 0.5;
          float swirl = sin(atan(uv.y, uv.x) * 4.0 + dist * 24.0 - uTime * 4.0) * 0.3;
          float alpha = (rings + swirl) * smoothstep(0.5, 0.12, dist) * 0.85;
          gl_FragColor = vec4(vec3(0.94, 0.97, 1.0), alpha);
                  #include <logdepthbuf_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
      transparent: true, logarithmicDepthBuffer: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this._poolShader = poolFoamMat;
    const poolFoamMesh = new THREE.Mesh(poolFoamGeo, poolFoamMat);
    poolFoamMesh.rotation.x = -Math.PI / 2;
    poolFoamMesh.position.set(0, 14.58, -550);
    poolFoamMesh.renderOrder = 2;
    poolFoamMesh.frustumCulled = false;
    g.add(poolFoamMesh);

    // 5. Cheap Additive Mist Sprites (Static planes rotating to face camera, or simple stationary clouds)
    const mistCanvas = document.createElement('canvas');
    mistCanvas.width = mistCanvas.height = 128;
    const mctx = mistCanvas.getContext('2d');
    const grd = mctx.createRadialGradient(64,64,0, 64,64,64);
    grd.addColorStop(0, 'rgba(255,255,255,0.8)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.2)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    mctx.fillStyle = grd;
    mctx.fillRect(0,0,128,128);
    const mistTex = new THREE.CanvasTexture(mistCanvas);

    const sideMistGeo = new THREE.PlaneGeometry(60, 45);
    const sideMistMat = new THREE.MeshBasicMaterial({
      map: mistTex,
      transparent: true, logarithmicDepthBuffer: true, blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.15,
      color: 0xeef5ff
    });
    for(let i=0; i<4; i++) {
      const sm = new THREE.Sprite(sideMistMat);
      sm.scale.set(60, 45, 1);
      sm.position.set((i%2===0 ? -1 : 1) * (18 + Math.random()*15), 14.5 + Math.random()*10, -550 + (Math.random()-0.5)*15);
      sm.rotation.y = (Math.random()-0.5)*0.2;
      g.add(sm);
    }
    
    // 6. Thinner high-frequency sheet
    const thinSheetMat = waterfallMat;
    const thinSheetGeo = buildChuteRibbon(fallCurve, 12, 32, 140);
    const thinUvs = thinSheetGeo.attributes.uv;
    for(let i=0; i<thinUvs.count; i++) thinUvs.setY(i, thinUvs.getY(i) * 2.0);
    const thinSheet = new THREE.Mesh(thinSheetGeo, thinSheetMat);
    thinSheet.position.z += 1.4;
    thinSheet.renderOrder = 3;
    g.add(thinSheet);

    // 6. Small plunge-pool foam disc at the base (No GPU particles)
    const foamDiscGeo = new THREE.CircleGeometry(14, 24);
    const foamDiscMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true, logarithmicDepthBuffer: true,
      opacity: 0.8,
      depthWrite: false,
      });
    const foamDisc = new THREE.Mesh(foamDiscGeo, foamDiscMat);
    foamDisc.rotation.x = -Math.PI / 2;
    foamDisc.position.set(0, 14.62, -548);
    foamDisc.renderOrder = 2;
    g.add(foamDisc);

    this.world.scene.add(g);
  }

  _updateUnderwater(dt, t) {
    if (!this._dummyObject) {
      this._dummyObject = new THREE.Object3D();
      this._v3A = new THREE.Vector3();
      this._v3B = new THREE.Vector3();
      this._v3C = new THREE.Vector3();
    }
    const dummy = this._dummyObject;
    const vA = this._v3A;
    const vB = this._v3B;
    const vC = this._v3C;
    
    // Helper to update a flock
    const updateFlock = (data, mesh, predators = []) => {
      if (!data || !mesh) return;
      const len = data.length;
      for (let i = 0; i < len; i++) {
        const f = data[i];
        
        // Base orbital motion
        f.angle += f.dir * f.orbitSpeed * dt;
        
        // Target position based on orbit + wander
        const wanderX = Math.sin(t * 0.5 + f.phase) * f.wanderAmp;
        const wanderZ = Math.cos(t * 0.4 + f.phase) * f.wanderAmp;
        const wanderY = Math.sin(t * 0.3 + f.phase) * f.vertAmp;
        
        const tx = f.center.x + Math.cos(f.angle) * f.radiusX + wanderX;
        const tz = f.center.z + Math.sin(f.angle) * f.radiusZ + wanderZ;
        const ty = f.center.y + f.yOffset + wanderY;
        
        vA.set(tx, ty, tz);
        
        // Predator avoidance
        for (let p = 0; p < predators.length; p++) {
          const pred = predators[p];
          if (!pred) continue;
          for(let k = 0; k < pred.length; k++) {
             const px = pred[k].worldX;
             const pz = pred[k].worldZ;
             const py = pred[k].worldY;
             if (px === undefined) continue;
             const dx = f.worldX - px;
             const dy = f.worldY - py;
             const dz = f.worldZ - pz;
             const distSq = dx*dx + dy*dy + dz*dz;
             if (distSq < 900) { // 30m radius avoidance
                const dist = Math.sqrt(distSq) + 0.1;
                vA.x += (dx / dist) * 15;
                vA.y += (dy / dist) * 15;
                vA.z += (dz / dist) * 15;
             }
          }
        }

        // Pseudo-boids: avoid 1 random peer to create schooling spread without O(N^2)
        if (len > 1) {
          const peerIdx = (i + 7) % len;
          const peer = data[peerIdx];
          if (peer.worldX !== undefined) {
             const dx = f.worldX - peer.worldX;
             const dy = f.worldY - peer.worldY;
             const dz = f.worldZ - peer.worldZ;
             const distSq = dx*dx + dy*dy + dz*dz;
             if (distSq < 16.0) {
                vA.x += dx * 0.5;
                vA.y += dy * 0.5;
                vA.z += dz * 0.5;
             }
          }
        }
        
        // Integration
        if (f.worldX === undefined) {
          f.worldX = tx; f.worldY = ty; f.worldZ = tz;
        }
        
        const speed = f.speed * 6.0 * dt;
        vB.set(f.worldX, f.worldY, f.worldZ);
        vC.copy(vA).sub(vB);
        
        if (vC.lengthSq() > 0.01) {
           vC.normalize();
           f.worldX += vC.x * speed;
           f.worldY += vC.y * speed * 0.5; // less vertical speed
           f.worldZ += vC.z * speed;
           
           // Orientation
           const targetYaw = Math.atan2(vC.x, vC.z);
           // smooth yaw
           if (f.yaw === undefined) f.yaw = targetYaw;
           let diff = targetYaw - f.yaw;
           while (diff < -Math.PI) diff += Math.PI * 2;
           while (diff > Math.PI) diff -= Math.PI * 2;
           f.yaw += diff * Math.min(1.0, dt * 3.0);
        }
        
        dummy.position.set(f.worldX, f.worldY, f.worldZ);
        dummy.rotation.set(0, f.yaw || 0, 0);
        dummy.scale.setScalar(f.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };

    updateFlock(this._sharkData, this._sharkMesh);
    updateFlock(this._dolphinData, this._dolphinMesh);
    updateFlock(this._seaTurtleData, this._seaTurtleMesh);
    updateFlock(this._mantaRayData, this._mantaRayMesh);
    if (this._mantaRayShader) {
      this._mantaRayShader.uniforms.uTime.value = t;
    }
    
    // Prey fish avoid sharks and dolphins
    const predators = [this._sharkData, this._dolphinData];
    updateFlock(this._troutData, this._troutMesh, predators);
    updateFlock(this._koiData, this._koiMesh, predators);
    updateFlock(this._reefFishData, this._reefFishMesh, predators);
  }
  _underwaterWorld() {
    const uwGroup = new THREE.Group();
    uwGroup.name = "UnderwaterRealism";

    // 1. Ambient Plankton & Bubbles
    const particleCount = 4500;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(particleCount * 3);
    const pPhase = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      // Spread across the lake, river, and ocean
      pPos[i * 3] = (Math.random() - 0.5) * 1200;
      pPos[i * 3 + 1] = Math.random() * 20 - 5; // -5 to 15
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 1800 + 400; 
      pPhase[i] = Math.random() * Math.PI * 2;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute('aPhase', new THREE.BufferAttribute(pPhase, 1));

    const pMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.0 } // updated from WorldCore via this._bubbleMat
      },
      vertexShader: `
        uniform float uTime;
        attribute float aPhase;
        varying float vAlpha;
        void main() {
          vec3 pos = position;
          pos.y += sin(uTime * 0.5 + aPhase) * 1.5 + (uTime * 0.8 * fract(aPhase * 11.0));
          pos.y = mod(pos.y + 10.0, 25.0) - 10.0; 
          pos.x += sin(uTime * 0.2 + aPhase * 3.0) * 0.5;
          
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          
          gl_PointSize = (4.0 + sin(aPhase * 15.0) * 2.0) * (100.0 / -mvPosition.z);
          vAlpha = smoothstep(25.0, 5.0, pos.y) * 0.6;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          vec2 pc = gl_PointCoord - vec2(0.5);
          float dist = length(pc);
          if (dist > 0.5) discard;
          
          // Bubble rim lighting effect
          float rim = smoothstep(0.3, 0.5, dist);
          float alpha = vAlpha * uOpacity * (0.2 + rim * 0.8);
          gl_FragColor = vec4(0.8, 0.9, 1.0, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const particles = new THREE.Points(pGeo, pMat);
    particles.frustumCulled = false;
    uwGroup.add(particles);
    this.world._bubbleMat = pMat; // Link to WorldCore update loop

    // 2. God Rays (Volumetric Light Shafts)
    const shaftCount = 15;
    const sGeo = new THREE.CylinderGeometry(0.5, 8.0, 40, 16, 1, true);
    sGeo.translate(0, -20, 0); // Origin at top
    
    const sMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.0 }
      },
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 pos = position;
          pos.x += sin(uTime * 0.5 + pos.y * 0.1) * 2.0 * (1.0 - uv.y);
          pos.z += cos(uTime * 0.4 + pos.y * 0.1) * 2.0 * (1.0 - uv.y);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          float grad = smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
          float alpha = grad * uOpacity * 0.15;
          gl_FragColor = vec4(0.5, 0.8, 1.0, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    const shafts = new THREE.InstancedMesh(sGeo, sMat, shaftCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < shaftCount; i++) {
      dummy.position.set(
        (Math.random() - 0.5) * 400,
        12.5, // Water level
        (Math.random() - 0.5) * 400
      );
      dummy.rotation.set(Math.random() * 0.2 - 0.1, Math.random() * Math.PI, Math.random() * 0.2 - 0.1);
      dummy.scale.set(1 + Math.random() * 2, 1, 1 + Math.random() * 2);
      dummy.updateMatrix();
      shafts.setMatrixAt(i, dummy.matrix);
    }
    shafts.frustumCulled = false;
    uwGroup.add(shafts);
    this.world._godRaysMat = sMat;

    this.world.scene.add(uwGroup);
  }
  // ============================================================

  _trees() {
    return this._vegetation();
  }

  async _vegetation() {
    const rng = mulberry32(777);
    const pine = { trunks: [], crowns: [], crownsColors: [], clutter: [] },
          oak = { trunks: [], crowns: [], crownsColors: [], stones: [] },
          goldenOak = { trunks: [], crowns: [], crownsColors: [], stones: [] },
          sakura = { trunks: [], crowns: [], crownsColors: [] },
          palm = { trunks: [], crowns: [], crownsColors: [] },
          willow = { trunks: [], crowns: [], crownsColors: [], stones: [] },
          cypress = { trunks: [], crowns: [], crownsColors: [] },
          cactus = [];
    const tmp = new THREE.Object3D();

    const place = (x, z) => {
      const h = terrainHeight(x, z);
      const rDist = distToRiver(x, z);
      const rElev = riverWaterElevation(x, z);
      if (rDist < 45 && h < rElev + 1.2) return null;
      if (h < WORLD.waterLevel + 1 || h > 170) return null;
      if (distToRoads(x, z) < 15) return null; // Increased to 15 to keep all roads clear
      if (Math.hypot(x, z - (-360)) < 68 && h < 19.0) return null; // Keep plunge pool clear of trees
      if (rDist < 12) return null; // keep river channels clear of tree trunks
      if (Math.abs(x) < 36 && z < -240) return null; // keep entire northern waterfall gorge & plunge pool 100% open and visible!
      if (z <= -450 && Math.abs(x) < 180) return null; // keep Highland Cathedral terrace & promenade open!
      if (Math.hypot(x - WORLD.buddhistTemple.x, z - WORLD.buddhistTemple.z) < 120) return null; // keep Buddhist Zen garden & panorama 100% clear!
      if (Math.hypot(x - WORLD.mosque.x, z - WORLD.mosque.z) < 110) return null; // keep Moorish Mosque courtyard & panorama 100% clear!
      if (z > 1700) return null; // Kaya Island handled separately in _kayaIsland()
      if (Math.abs(x) < 22 && z < 320) return null; // keep central boulevard vista open from bridge
      if (Math.hypot(x - WORLD.plaza.x, z - WORLD.plaza.z) < WORLD.plaza.r + 30) return null;
      if (Math.hypot(x - WORLD.gate.x, z - WORLD.gate.z) < 130) return null;
      if (Math.abs(x) < 52 && z >= 760 && z <= 1120) return null; // keep entire Grand Gate entrance corridor & promenade 100% clear
      if (Math.hypot(x - WORLD.bridge.x, z - WORLD.bridge.z) < 130) return null; // keep the rainbow vista clear
      for (const p of this.world.plots) if (Math.hypot(x - p.x, z - p.z) < 16) return null;
      return h;
    };

    for (let i = 0; i < 1200; i++) {
      const x = (rng() - 0.5) * 2600, z = (rng() - 0.5) * 2400;
      const h = place(x, z);
      if (h === null) continue;
      const s = 0.82 + rng() * 0.85;
      const dLake = Math.hypot(x - WORLD.lake.x, z - WORLD.lake.z) - WORLD.lake.r;
      const dRiver = distToRiver(x, z);
      const dRoad = distToRoads(x, z);
      const inDesert = x < -220 && z > 180 && h < 70;

      // Ensure perfectly grounded vegetation by sinking the root base slightly into the terrain
      tmp.position.set(x, h - 0.35 * s, z);
      tmp.rotation.set(0, rng() * Math.PI * 2, 0);

      if (inDesert) {
        if (rng() < 0.3) { tmp.scale.setScalar(s); tmp.updateMatrix(); cactus.push(tmp.matrix.clone()); }
        continue;
      }
      // Slender Mediterranean Cypress along knolls and pathway approaches
      if (dRoad > 8 && dRoad < 28 && rng() < 0.34) {
        tmp.scale.setScalar(s * 1.15); tmp.updateMatrix();
        cypress.trunks.push(tmp.matrix.clone()); cypress.crowns.push(tmp.matrix.clone()); cypress.crownsColors.push(new THREE.Color().setHSL(0, 0, 0.75 + rng() * 0.45));
        continue;
      }
      // Weeping willows along riverbanks and lake shores
      if ((dRiver < 28 || (dLake > 4 && dLake < 35)) && rng() < 0.42) {
        tmp.scale.setScalar(s * 0.95); tmp.updateMatrix();
        willow.trunks.push(tmp.matrix.clone()); willow.crowns.push(tmp.matrix.clone()); willow.crownsColors.push(new THREE.Color().setHSL(0, 0, 0.75 + rng() * 0.45));
        if (rng() < 0.65) willow.stones.push(tmp.matrix.clone());
        continue;
      }
      // Sakura Cherry Blossoms in garden knolls & memorial parklands
      if (h > 24 && h < 75 && Math.hypot(x, z) < 580 && rng() < 0.14) {
        tmp.scale.setScalar(s * 1.10); tmp.updateMatrix();
        sakura.trunks.push(tmp.matrix.clone()); sakura.crowns.push(tmp.matrix.clone()); sakura.crownsColors.push(new THREE.Color().setHSL(0, 0, 0.75 + rng() * 0.45));
        continue;
      }
      if (dLake > -5 && dLake < 40 && x > WORLD.lake.x - 60) { // beach palms
        if (rng() < 0.35) {
          tmp.scale.setScalar(s); tmp.updateMatrix();
          palm.trunks.push(tmp.matrix.clone()); palm.crowns.push(tmp.matrix.clone()); palm.crownsColors.push(new THREE.Color().setHSL(0, 0, 0.75 + rng() * 0.45));
        }
        continue;
      }
      // Ecological grove clustering using FBM noise (creates wild mountain cloud forests)
      const forestDensity = fbm(x * 0.0045, z * 0.0045, 3);
      const isClustered = forestDensity > 0.38;
      
      const inPines = (z < -340 && Math.abs(x) < 420) || h > 75;
      const prob = inPines ? (isClustered ? 0.82 : 0.15) : (isClustered ? 0.58 : 0.10);

      if (rng() < prob) {
        // Natural mountain altitude scaling
        const altScale = Math.max(0.65, 1.0 - Math.max(0, h - 80) / 180);
        tmp.scale.setScalar(s * altScale);
        tmp.updateMatrix();
        if (inPines) {
          pine.trunks.push(tmp.matrix.clone());
          pine.crowns.push(tmp.matrix.clone()); pine.crownsColors.push(new THREE.Color().setHSL(0, 0, 0.75 + rng() * 0.45));
          if (rng() < 0.75) pine.clutter.push(tmp.matrix.clone());
        } else if (rng() < 0.32) {
          // Radiant Golden Oaks
          goldenOak.trunks.push(tmp.matrix.clone());
          goldenOak.crowns.push(tmp.matrix.clone()); goldenOak.crownsColors.push(new THREE.Color().setHSL(0, 0, 0.75 + rng() * 0.45));
          if (rng() < 0.60) goldenOak.stones.push(tmp.matrix.clone());
        } else {
          // Lush Green Oaks
          oak.trunks.push(tmp.matrix.clone());
          oak.crowns.push(tmp.matrix.clone()); oak.crownsColors.push(new THREE.Color().setHSL(0, 0, 0.75 + rng() * 0.45));
          if (rng() < 0.60) oak.stones.push(tmp.matrix.clone());
        }
      }
    }

    // 1. Dense Mountain Cloud-Forest Blanket (1,600+ multi-species conifers & alpine oaks blanketing all mountain slopes)
    const mountainPineMatrices = []; const mountainPineColors = [];
    const mountainOakMatrices = []; const mountainOakColors = [];
    const rngMF = mulberry32(110293);
    for (let i = 0; i < 1800; i++) {
      const mx = (rngMF() - 0.5) * 3200;
      const mz = (rngMF() - 0.5) * 3000;
      const mh = terrainHeight(mx, mz);
      if (mh < 32 || mh > 240) continue;
      if (Math.abs(mx) < 55 && mz < -200) continue; // keep waterfall gorge clear
      if (Math.hypot(mx, mz) < 320) continue;        // keep central valley floor open for pastures
      if (Math.hypot(mx - WORLD.buddhistTemple.x, mz - WORLD.buddhistTemple.z) < 120) continue; // keep Buddhist Zen garden clear
      if (Math.hypot(mx - WORLD.mosque.x, mz - WORLD.mosque.z) < 110) continue; // keep Moorish Mosque clear
      if (mz <= -450 && Math.abs(mx) < 180) continue; // keep Highland Cathedral terrace clear
      if (Math.abs(mx) < 52 && mz >= 760 && mz <= 1120) continue; // keep Grand Gate corridor clear

      // Forest density clustering with FBM noise
      const density = fbm(mx * 0.0035, mz * 0.0035, 3);
      if (density < 0.28) continue;

      // Subtle hillside tilt alignment matching mountain slope
      const hX = terrainHeight(mx + 2, mz) - terrainHeight(mx - 2, mz);
      const hZ = terrainHeight(mx, mz + 2) - terrainHeight(mx, mz - 2);
      const tiltX = -Math.atan2(hZ, 4.0) * 0.05;
      const tiltZ = Math.atan2(hX, 4.0) * 0.05;

      const altScale = Math.max(0.70, 1.0 - Math.max(0, mh - 110) / 220);
      const s = (1.35 + rngMF() * 1.65) * altScale;

      tmp.position.set(mx, mh - 1.5, mz);
      tmp.rotation.set(tiltX + (rngMF() - 0.5) * 0.12, rngMF() * Math.PI * 2, tiltZ + (rngMF() - 0.5) * 0.12);
      tmp.scale.setScalar(s);
      tmp.updateMatrix();

      // Higher altitudes and north/east ridges feature alpine pines; lower slopes mix in mountain oaks
      const isPine = mh > 65 || mz < -180 || rngMF() < 0.72;
      if (isPine) {
        mountainPineMatrices.push(tmp.matrix.clone()); mountainPineColors.push(new THREE.Color().setHSL(0, 0, 0.75 + rngMF() * 0.45));
      } else {
        mountainOakMatrices.push(tmp.matrix.clone()); mountainOakColors.push(new THREE.Color().setHSL(0, 0, 0.75 + rngMF() * 0.45));
      }
    }

    const inst = (geo, mat, mats, yOff = 0, castShadow = true, colors = null) => {
      if (!mats.length) return;
      const m = new THREE.InstancedMesh(geo, mat, mats.length);
      const t = new THREE.Matrix4(), off = new THREE.Matrix4().makeTranslation(0, yOff, 0);
      mats.forEach((mx, i) => { 
        t.copy(mx).multiply(off); 
        m.setMatrixAt(i, t); 
        if (colors && colors[i]) m.setColorAt(i, colors[i]);
      });
      m.instanceMatrix.needsUpdate = true;
      if (colors && colors.length > 0) m.instanceColor.needsUpdate = true;
      m.geometry.computeBoundingSphere();
      if (typeof m.computeBoundingSphere === 'function') m.computeBoundingSphere();
      m.castShadow = castShadow;
      m.receiveShadow = true;
      m.frustumCulled = true;
      this.world.scene.add(m);
    };

    const barkMat = Surfaces.bark(1.6);
    const palmBark = Surfaces.bark(2);
//     palmBark.color.setHex(0xb09472);
    const cherryBark = Surfaces.bark(1.5);
//     cherryBark.color.setHex(0x382820);

    // Procedural curved leaf card generator with normal curvature for 100% volumetric depth
    const createCurvedLeafCardGeo = (w, h, curveDepth = 0.45) => {
      const g1 = new THREE.PlaneGeometry(w, h, 2, 2);
      const pos = g1.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const u = x / (w * 0.5);
        const v = y / (h * 0.5);
        const curve = (1.0 - u * u) * curveDepth * (1.0 - v * 0.35) + (1.0 - v * v) * curveDepth * 0.25;
        pos.setZ(i, curve);
      }
      g1.computeVertexNormals();
      
      const g2 = g1.clone();
      g2.rotateY(Math.PI / 2);
      
      const g3 = g1.clone();
      g3.rotateY(Math.PI / 4);
      g3.rotateX(0.2);

      const merged = safeMerge([g1, g2, g3], false);
      return merged || g1;
    };

    // 1. AAA Caliber Deciduous Oak (Flared buttress root flare, curved multi-segment trunk, 5 scaffold limbs + 6 secondary branchlets)
    const oakTrunkGeo = (() => {
      const parts = [];
      // Flared buttress base with 6 organic root spurs
      const baseRootGeo = new THREE.CylinderGeometry(1.3, 2.6, 2.4, 16);
      const bPos = baseRootGeo.attributes.position;
      for (let i = 0; i < bPos.count; i++) {
        const px = bPos.getX(i), py = bPos.getY(i), pz = bPos.getZ(i);
        const hFrac = (py + 1.2) / 2.4; // 0 at ground, 1 at top
        const angle = Math.atan2(pz, px);
        const rad = Math.hypot(px, pz);
        const flare = Math.cos(angle * 6) * Math.pow(1.0 - hFrac, 1.6) * 0.85;
        bPos.setX(i, Math.cos(angle) * (rad + flare));
        bPos.setY(i, py + 1.2);
        bPos.setZ(i, Math.sin(angle) * (rad + flare));
      }
      baseRootGeo.computeVertexNormals();
      parts.push(baseRootGeo);

      // 6 Extended buttress root toes spreading outward into the terrain
      for (let r = 0; r < 6; r++) {
        const rAng = (r / 6) * Math.PI * 2 + 0.15;
        const root = new THREE.CylinderGeometry(0.25, 0.55, 3.2, 6);
        root.rotateZ(0.78);
        root.rotateY(rAng);
        root.translate(Math.cos(rAng) * 1.8, 0.4, Math.sin(rAng) * 1.8);
        parts.push(root);
      }

      // Middle curved trunk segment
      const trunkMid = new THREE.CylinderGeometry(0.95, 1.3, 4.6, 10);
      trunkMid.rotateZ(0.12);
      trunkMid.translate(0.28, 4.4, 0.15);
      parts.push(trunkMid);

      // Upper trunk fork segment
      const trunkTop = new THREE.CylinderGeometry(0.72, 0.95, 4.2, 8);
      trunkTop.rotateZ(-0.16);
      trunkTop.translate(0.1, 7.8, -0.2);
      parts.push(trunkTop);

      // 5 Major scaffold limbs spreading into the upper crown
      for (let b = 0; b < 5; b++) {
        const ang = (b / 5) * Math.PI * 2 + 0.25;
        const br1 = new THREE.CylinderGeometry(0.32, 0.58, 5.8, 6);
        br1.rotateZ(0.68);
        br1.rotateY(ang);
        br1.translate(Math.cos(ang) * 3.0, 9.6, Math.sin(ang) * 3.0);
        parts.push(br1);

        // Secondary fork twig branchlet supporting leaf cloud
        const br2 = new THREE.CylinderGeometry(0.14, 0.30, 4.0, 5);
        br2.rotateZ(0.92);
        br2.rotateY(ang + 0.35);
        br2.translate(Math.cos(ang + 0.35) * 4.6, 12.0, Math.sin(ang + 0.35) * 4.6);
        parts.push(br2);
      }
      return applyOrganicWeathering(safeMerge(parts, false) || baseRootGeo, 0.14, 0.22, 31);
    })();

    // Volumetric multi-bough broadleaf canopy with 14 spherical cloud node clusters (96+ curved double-curvature leaf cards)
    const oakCanopyGeo = (() => {
      const parts = [];
      const rngO = mulberry32(202611);
      const clusterCenters = [
        [0, 15.2, 0, 6.2, 12],              // Central crown apex dome (12 cards)
        [4.2, 12.4, 2.0, 5.2, 8],           // East-North upper limb cloud (8 cards)
        [-4.2, 12.4, -2.0, 5.2, 8],         // West-South upper limb cloud (8 cards)
        [2.0, 12.6, 4.2, 5.2, 8],           // North-West upper limb cloud (8 cards)
        [-2.0, 12.6, -4.2, 5.2, 8],         // South-East upper limb cloud (8 cards)
        [3.2, 14.0, -2.8, 4.8, 7],          // Upper diagonal North-East (7 cards)
        [-3.2, 14.0, 2.8, 4.8, 7],          // Upper diagonal South-West (7 cards)
        [3.8, 9.2, -2.5, 4.6, 6],           // Lower drooping bough East (6 cards)
        [-3.8, 9.2, 2.5, 4.6, 6],           // Lower drooping bough West (6 cards)
        [2.5, 8.8, 3.8, 4.6, 6],            // Lower drooping bough North (6 cards)
        [-2.5, 8.8, -3.8, 4.6, 6],          // Lower drooping bough South (6 cards)
        [0, 11.6, 0, 5.0, 8],               // Central understory core (8 cards)
        [1.8, 16.2, 1.2, 4.2, 6],           // Sub-apex spire North (6 cards)
        [-1.8, 16.2, -1.2, 4.2, 6],         // Sub-apex spire South (6 cards)
      ];

      for (const [cx, cy, cz, crad, cardCount] of clusterCenters) {
        for (let p = 0; p < cardCount; p++) {
          const phi = Math.acos(1 - 2 * rngO());
          const theta = rngO() * Math.PI * 2;
          const r = crad * (0.25 + rngO() * 0.75);
          const px = cx + Math.sin(phi) * Math.cos(theta) * r;
          const py = cy + Math.cos(phi) * (r * 0.82);
          const pz = cz + Math.sin(phi) * Math.sin(theta) * r;
          
          const sw = 5.6 + rngO() * 1.8;
          const sh = 5.0 + rngO() * 1.6;
          const q = createCurvedLeafCardGeo(sw, sh, 0.55);
          q.rotateX((rngO() - 0.5) * Math.PI * 0.85);
          q.rotateY(rngO() * Math.PI * 2);
          q.rotateZ((rngO() - 0.5) * 0.65);
          q.translate(px, py, pz);
          parts.push(q);
        }
      }
      const merged = safeMerge(parts, false) || parts[0];
      if (merged && merged.attributes.position && merged.attributes.normal) {
        const pos = merged.attributes.position;
        const norm = merged.attributes.normal;
        for (let i = 0; i < pos.count; i++) {
          const px = pos.getX(i), py = pos.getY(i) - 13.0, pz = pos.getZ(i);
          const rad = Math.hypot(px, py * 0.75, pz) || 1.0;
          const nx = (px / rad) * 0.82 + norm.getX(i) * 0.18;
          const ny = (py / rad) * 0.82 + norm.getY(i) * 0.18;
          const nz = (pz / rad) * 0.82 + norm.getZ(i) * 0.18;
          const len = Math.hypot(nx, ny, nz) || 1.0;
          norm.setXYZ(i, nx / len, ny / len, nz / len);
        }
        norm.needsUpdate = true;
      }
      return merged;
    })();

    // 2. AAA Caliber Alpine Conifer / Mountain Spruce (10 Drooping Whorl Tiers with Primary & Lateral Fan Needle Sprigs, Inner Mantle, Apex Spire, & Outward Spherical Normal Bulging)
    const pineTrunkGeo = (() => {
      const parts = [];
      // Flared buttress base with 5 anchoring root spurs
      const baseGeo = new THREE.CylinderGeometry(1.1, 2.2, 2.0, 12);
      baseGeo.translate(0, 1.0, 0);
      parts.push(baseGeo);

      for (let r = 0; r < 5; r++) {
        const rAng = (r / 5) * Math.PI * 2;
        const root = new THREE.CylinderGeometry(0.18, 0.45, 2.8, 6);
        root.rotateZ(0.72);
        root.rotateY(rAng);
        root.translate(Math.cos(rAng) * 1.6, 0.35, Math.sin(rAng) * 1.6);
        parts.push(root);
      }

      // Tall tapering central trunk
      const trunk = new THREE.CylinderGeometry(0.18, 1.1, 23.0, 8);
      trunk.translate(0, 12.5, 0);
      parts.push(trunk);

      // Interior timber scaffold branchlets inside each whorl tier
      for (let w = 0; w < 7; w++) {
        const frac = w / 6;
        const y = 4.0 + frac * 17.5;
        const bLen = 3.6 * (1.0 - frac * 0.55);
        for (let b = 0; b < 4; b++) {
          const ang = (b / 4) * Math.PI * 2 + w * 0.45;
          const br = new THREE.CylinderGeometry(0.08, 0.18, bLen, 5);
          br.rotateZ(0.65);
          br.rotateY(ang);
          br.translate(Math.cos(ang) * (bLen * 0.4), y, Math.sin(ang) * (bLen * 0.4));
          parts.push(br);
        }
      }
      return applyOrganicWeathering(safeMerge(parts, false) || baseGeo, 0.12, 0.18, 52);
    })();

    const pineCanopyGeo = (() => {
      const parts = [];
      const rngP = mulberry32(811);
      // Generate drooping conical whorls (tiers) for photorealistic pine branches
      for (let w = 0; w < 9; w++) {
        const frac = w / 8;
        const y = 3.5 + frac * 18.5; 
        const tierRadius = 5.2 * (1.0 - frac * 0.85); // Wider at base, narrow at top
        const numBranches = 6 + Math.floor((1.0 - frac) * 5); // More branches at bottom
        
        for (let b = 0; b < numBranches; b++) {
          const ang = (b / numBranches) * Math.PI * 2 + (w * 0.6);
          const droop = -0.15 - (1.0 - frac) * 0.35; // Droop down
          
          const q = createCurvedLeafCardGeo(3.8, 5.2, 0.42);
          q.rotateX(droop);
          q.rotateZ((rngP() - 0.5) * 0.2);
          q.rotateY(ang);
          q.translate(Math.cos(ang) * tierRadius * 0.4, y, Math.sin(ang) * tierRadius * 0.4);
          parts.push(q);

          // Add a second card to bulk up the branch
          const q2 = createCurvedLeafCardGeo(2.8, 3.8, 0.45);
          q2.rotateX(droop - 0.2);
          q2.rotateY(ang + 0.15);
          q2.translate(Math.cos(ang) * tierRadius * 0.6, y - 0.4, Math.sin(ang) * tierRadius * 0.6);
          parts.push(q2);
        }
      }
      // Top apex spire cards
      for(let i = 0; i < 4; i++) {
         const q = createCurvedLeafCardGeo(2.5, 4.0, 0.4);
         q.rotateX(0.15); // point slightly up
         q.rotateY((i/4)*Math.PI*2);
         q.translate(0, 22.5, 0);
         parts.push(q);
      }
      
      const merged = safeMerge(parts, false) || parts[0];
      if (merged && merged.attributes.position && merged.attributes.normal) {
        const pos = merged.attributes.position;
        const norm = merged.attributes.normal;
        for (let i = 0; i < pos.count; i++) {
          const px = pos.getX(i), py = pos.getY(i) - 10.0, pz = pos.getZ(i);
          const rad = Math.hypot(px, py, pz) || 1.0;
          const nx = (px / rad) * 0.75 + norm.getX(i) * 0.25;
          const ny = (py / rad) * 0.75 + norm.getY(i) * 0.25;
          const nz = (pz / rad) * 0.75 + norm.getZ(i) * 0.25;
          const len = Math.hypot(nx, ny, nz) || 1.0;
          norm.setXYZ(i, nx / len, ny / len, nz / len);
        }
        norm.needsUpdate = true;
      }
      return merged;
    })();

    const willowTrunkGeo = (() => {
      const parts = [];
      // Flared root base
      const baseGeo = new THREE.CylinderGeometry(1.1, 2.0, 2.0, 10);
      baseGeo.translate(0, 1.0, 0);
      parts.push(baseGeo);

      for (let r = 0; r < 4; r++) {
        const rAng = (r / 4) * Math.PI * 2 + 0.3;
        const root = new THREE.CylinderGeometry(0.22, 0.48, 2.6, 6);
        root.rotateZ(0.72);
        root.rotateY(rAng);
        root.translate(Math.cos(rAng) * 1.5, 0.35, Math.sin(rAng) * 1.5);
        parts.push(root);
      }

      const trunk1 = new THREE.CylinderGeometry(0.78, 1.1, 4.6, 8);
      trunk1.rotateZ(0.18);
      trunk1.translate(0.35, 3.2, 0);
      parts.push(trunk1);

      const trunk2 = new THREE.CylinderGeometry(0.52, 0.78, 5.0, 8);
      trunk2.rotateZ(0.34);
      trunk2.translate(1.1, 6.8, 0.2);
      parts.push(trunk2);

      // 4 Curved arching structural timber boughs
      for (let b = 0; b < 4; b++) {
        const ang = (b / 4) * Math.PI * 2 + 0.35;
        const br = new THREE.CylinderGeometry(0.22, 0.46, 5.2, 6);
        br.rotateZ(0.78);
        br.rotateY(ang);
        br.translate(Math.cos(ang) * 2.8 + 1.1, 9.2, Math.sin(ang) * 2.8 + 0.2);
        parts.push(br);
      }
      return applyOrganicWeathering(safeMerge(parts, false) || baseGeo, 0.15, 0.25, 87);
    })();

    const willowCanopyGeo = (() => {
      const parts = [];
      // 1. Inner dense core curtain (28 vertical tendril ribbon cards)
      const numInner = 28;
      for (let i = 0; i < numInner; i++) {
        const ang = (i / numInner) * Math.PI * 2;
        const rad = 3.0 + (i % 2) * 1.0;
        const tendrilH = 9.2 + (i % 3) * 1.6;
        const q = createCurvedLeafCardGeo(3.6, tendrilH, 0.38);
        q.rotateY(ang + Math.PI * 0.5);
        q.translate(Math.cos(ang) * rad + 0.8, 6.2, Math.sin(ang) * rad + 0.1);
        parts.push(q);
      }
      // 2. Mid weeping curtain (36 sweeping draping tendril cards)
      const numMid = 36;
      for (let i = 0; i < numMid; i++) {
        const ang = (i / numMid) * Math.PI * 2 + 0.12;
        const rad = 5.6 + (i % 3) * 1.5;
        const tendrilH = 11.2 + (i % 4) * 1.8;
        const q = createCurvedLeafCardGeo(3.8, tendrilH, 0.42);
        q.rotateX(0.14);
        q.rotateY(ang + Math.PI * 0.5);
        q.translate(Math.cos(ang) * rad + 0.8, 5.6, Math.sin(ang) * rad + 0.1);
        parts.push(q);
      }
      // 3. Outer weeping curtain (48 sweeping draping tendril cards)
      const numOuter = 48;
      for (let i = 0; i < numOuter; i++) {
        const ang = (i / numOuter) * Math.PI * 2 + 0.22;
        const rad = 7.8 + (i % 3) * 1.6;
        const tendrilH = 12.8 + (i % 4) * 2.0;
        const q = createCurvedLeafCardGeo(4.0, tendrilH, 0.46);
        q.rotateX(0.22);
        q.rotateY(ang + Math.PI * 0.5);
        q.translate(Math.cos(ang) * rad + 0.8, 5.0, Math.sin(ang) * rad + 0.1);
        parts.push(q);
      }
      // 4. Upper crown arching umbrella dome (24 curved canopy cards)
      const numDome = 24;
      for (let i = 0; i < numDome; i++) {
        const ang = (i / numDome) * Math.PI * 2;
        const q = createCurvedLeafCardGeo(5.6, 5.6, 0.58);
        q.rotateX(0.44);
        q.rotateY(ang);
        q.translate(Math.cos(ang) * 4.2 + 0.8, 10.8, Math.sin(ang) * 4.2 + 0.1);
        parts.push(q);
      }
      const merged = safeMerge(parts, false) || parts[0];
      if (merged && merged.attributes.position && merged.attributes.normal) {
        const pos = merged.attributes.position;
        const norm = merged.attributes.normal;
        for (let i = 0; i < pos.count; i++) {
          const px = pos.getX(i) - 0.8, py = pos.getY(i) - 7.0, pz = pos.getZ(i) - 0.1;
          const rad = Math.hypot(px, pz) || 1.0;
          const nx = (px / rad) * 0.82 + norm.getX(i) * 0.18;
          const ny = (py / (Math.hypot(px, py, pz) || 1.0)) * 0.5 + norm.getY(i) * 0.18;
          const nz = (pz / rad) * 0.82 + norm.getZ(i) * 0.18;
          const len = Math.hypot(nx, ny, nz) || 1.0;
          norm.setXYZ(i, nx / len, ny / len, nz / len);
        }
        norm.needsUpdate = true;
      }
      return merged;
    })();

    // 4. AAA Caliber Tropical Beach Palm (Flared Swelling Base, Segmented Trunk, 4-Tier Arching/Drooping Crown, 74 Pinnate Frond Cards)
    const palmTrunkGeo = (() => {
      const parts = [];
      const base = new THREE.CylinderGeometry(0.75, 1.35, 2.2, 10);
      base.translate(0, 1.1, 0);
      parts.push(base);

      const segCount = 8;
      for (let s = 0; s < segCount; s++) {
        const frac = s / segCount;
        const r1 = 0.75 * (1.0 - frac * 0.38);
        const r2 = 0.75 * (1.0 - ((s + 1) / segCount) * 0.38);
        const seg = new THREE.CylinderGeometry(r2, r1, 1.45, 8);
        const curveX = Math.sin(frac * Math.PI * 0.75) * 0.85;
        const curveZ = Math.cos(frac * Math.PI * 0.65) * 0.55;
        seg.translate(curveX, 2.2 + s * 1.4 + 0.72, curveZ);
        parts.push(seg);
      }
      return safeMerge(parts, false) || base;
    })();

    const palmCanopyGeo = (() => {
      const parts = [];
      // Tier 1: Upright emerging inner heart spear fronds (10 fronds)
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2 + 0.1;
        const sRad = 2.2;
        const droop = -0.50;
        const q = createCurvedLeafCardGeo(2.6, 4.8, 0.42);
        q.rotateX(droop);
        q.rotateY(ang);
        q.translate(Math.cos(ang) * sRad, 2.6, Math.sin(ang) * sRad);
        parts.push(q);
      }
      // Tier 2: Mid arching spreading fronds (16 fronds, 2 segments each = 32 cards)
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        for (let s = 0; s < 2; s++) {
          const frac = s / 2;
          const sRad = 1.8 + frac * 5.2;
          const droop = 0.22 + frac * 1.18;
          const q = createCurvedLeafCardGeo(3.2 * (1.0 - frac * 0.28), 4.6, 0.50);
          q.rotateX(droop);
          q.rotateY(ang);
          q.translate(Math.cos(ang) * sRad, 1.6 - Math.sin(droop) * 2.8, Math.sin(ang) * sRad);
          parts.push(q);
        }
      }
      // Tier 3: Lower drooping weeping mature fronds (12 fronds, 2 segments each = 24 cards)
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2 + 0.25;
        for (let s = 0; s < 2; s++) {
          const frac = s / 2;
          const sRad = 2.4 + frac * 4.6;
          const droop = 0.72 + frac * 0.85;
          const q = createCurvedLeafCardGeo(2.8 * (1.0 - frac * 0.25), 4.4, 0.52);
          q.rotateX(droop);
          q.rotateY(ang);
          q.translate(Math.cos(ang) * sRad, -0.6 - Math.sin(droop) * 2.4, Math.sin(ang) * sRad);
          parts.push(q);
        }
      }
      // Tier 4: Skirt fronds draping along trunk collar (8 fronds)
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + 0.4;
        const sRad = 2.8;
        const droop = 1.35;
        const q = createCurvedLeafCardGeo(2.4, 3.8, 0.45);
        q.rotateX(droop);
        q.rotateY(ang);
        q.translate(Math.cos(ang) * sRad, -2.4, Math.sin(ang) * sRad);
        parts.push(q);
      }
      return safeMerge(parts, false) || parts[0];
    })();

    // 5. AAA Caliber Mediterranean Cypress (Flared Base, Columnar Evergreen, 56 Dense Spiraling Sprigs in Golden-Angle Fibonacci Spiral)
    const cypressTrunkGeo = (() => {
      const parts = [];
      const base = new THREE.CylinderGeometry(0.55, 1.1, 1.8, 8);
      base.translate(0, 0.9, 0);
      parts.push(base);

      const trunk = new THREE.CylinderGeometry(0.28, 0.55, 5.5, 8);
      trunk.translate(0, 4.25, 0);
      parts.push(trunk);
      return safeMerge(parts, false) || base;
    })();

    const cypressCanopyGeo = (() => {
      const parts = [];
      const numSprigs = 56;
      const goldenAngle = 2.39996;
      for (let i = 0; i < numSprigs; i++) {
        const frac = i / (numSprigs - 1);
        const y = 1.4 + frac * 16.5;
        const ang = i * goldenAngle;
        const profile = Math.sin(Math.pow(frac, 0.45) * Math.PI);
        const radius = (0.65 * profile + 0.18);
        
        const cardW = 1.45 * (1.0 - frac * 0.30);
        const cardH = 2.4 * (1.0 - frac * 0.30);
        const q1 = createCurvedLeafCardGeo(cardW, cardH, 0.28);
        q1.rotateX(0.18 + (1.0 - frac) * 0.20);
        q1.rotateY(ang);
        q1.translate(Math.cos(ang) * radius, y, Math.sin(ang) * radius);
        parts.push(q1);
      }
      const merged = safeMerge(parts, false) || parts[0];
      if (merged && merged.attributes.position && merged.attributes.normal) {
        const pos = merged.attributes.position;
        const norm = merged.attributes.normal;
        for (let i = 0; i < pos.count; i++) {
          const px = pos.getX(i), pz = pos.getZ(i);
          const rad = Math.hypot(px, pz) || 1.0;
          const nx = (px / rad) * 0.85 + norm.getX(i) * 0.15;
          const ny = 0.15 + norm.getY(i) * 0.15;
          const nz = (pz / rad) * 0.85 + norm.getZ(i) * 0.15;
          const len = Math.hypot(nx, ny, nz) || 1.0;
          norm.setXYZ(i, nx / len, ny / len, nz / len);
        }
        norm.needsUpdate = true;
      }
      return merged;
    })();

    // 6. AAA Caliber Japanese Sakura Cherry Blossom Tree (Bonsai Gnarled Trunk with 4 Root Buttresses, 5 Scaffold Limbs, 82 Blossom Cloud Clusters)
    const sakuraTrunkGeo = (() => {
      const parts = [];
      // Flared root base
      const base = new THREE.CylinderGeometry(0.75, 1.45, 1.8, 8);
      base.translate(0, 0.9, 0);
      parts.push(base);

      for (let r = 0; r < 4; r++) {
        const rAng = (r / 4) * Math.PI * 2 + 0.2;
        const root = new THREE.CylinderGeometry(0.20, 0.42, 2.4, 6);
        root.rotateZ(0.70);
        root.rotateY(rAng);
        root.translate(Math.cos(rAng) * 1.3, 0.4, Math.sin(rAng) * 1.3);
        parts.push(root);
      }

      const trunk1 = new THREE.CylinderGeometry(0.55, 0.75, 3.8, 8);
      trunk1.rotateZ(0.12);
      trunk1.translate(0.15, 3.4, 0);
      parts.push(trunk1);

      for (let b = 0; b < 5; b++) {
        const ang = (b / 5) * Math.PI * 2 + 0.35;
        const br = new THREE.CylinderGeometry(0.16, 0.38, 5.0, 6);
        br.rotateZ(0.74);
        br.rotateY(ang);
        br.translate(Math.cos(ang) * 2.5, 6.0, Math.sin(ang) * 2.5);
        parts.push(br);
      }
      return applyOrganicWeathering(safeMerge(parts, false) || base, 0.16, 0.22, 103);
    })();

    const sakuraCanopyGeo = (() => {
      const parts = [];
      const rngS = mulberry32(7821);
      const clusterCenters = [
        [0, 10.2, 0, 5.2, 14],             // Central apex blossom cloud (14 cards)
        [3.6, 8.2, 2.0, 4.6, 10],          // East-North limb cloud (10 cards)
        [-3.6, 8.2, -2.0, 4.6, 10],        // West-South limb cloud (10 cards)
        [2.0, 8.4, 3.6, 4.6, 10],          // North-West limb cloud (10 cards)
        [-2.0, 8.4, -3.6, 4.6, 10],        // South-East limb cloud (10 cards)
        [2.8, 9.8, -2.6, 4.2, 8],          // Upper diagonal North-East (8 cards)
        [-2.8, 9.8, 2.6, 4.2, 8],          // Upper diagonal South-West (8 cards)
        [1.8, 11.2, 1.4, 3.8, 6],          // Sub-apex spire North (6 cards)
        [-1.8, 11.2, -1.4, 3.8, 6],        // Sub-apex spire South (6 cards)
      ];
      for (const [cx, cy, cz, crad, cardCount] of clusterCenters) {
        for (let p = 0; p < cardCount; p++) {
          const phi = Math.acos(1 - 2 * rngS());
          const theta = rngS() * Math.PI * 2;
          const r = crad * (0.28 + rngS() * 0.72);
          const px = cx + Math.sin(phi) * Math.cos(theta) * r;
          const py = cy + Math.cos(phi) * (r * 0.78);
          const pz = cz + Math.sin(phi) * Math.sin(theta) * r;
          const sw = 4.8 + rngS() * 1.6;
          const sh = 4.6 + rngS() * 1.5;
          const q = createCurvedLeafCardGeo(sw, sh, 0.44);
          q.rotateX((rngS() - 0.5) * Math.PI * 0.85);
          q.rotateY(rngS() * Math.PI * 2);
          q.rotateZ((rngS() - 0.5) * 0.6);
          q.translate(px, py, pz);
          parts.push(q);
        }
      }
      const merged = safeMerge(parts, false) || parts[0];
      if (merged && merged.attributes.position && merged.attributes.normal) {
        const pos = merged.attributes.position;
        const norm = merged.attributes.normal;
        for (let i = 0; i < pos.count; i++) {
          const px = pos.getX(i), py = pos.getY(i) - 9.0, pz = pos.getZ(i);
          const rad = Math.hypot(px, py * 0.85, pz) || 1.0;
          const nx = (px / rad) * 0.82 + norm.getX(i) * 0.18;
          const ny = (py / rad) * 0.82 + norm.getY(i) * 0.18;
          const nz = (pz / rad) * 0.82 + norm.getZ(i) * 0.18;
          const len = Math.hypot(nx, ny, nz) || 1.0;
          norm.setXYZ(i, nx / len, ny / len, nz / len);
        }
        norm.needsUpdate = true;
      }
      return merged;
    })();

    // 7. Ground Clutter Geometries: Fallen Pine Needle Bed & Mossy Stone Clusters
    const pineBedGeo = (() => {
      const g = new THREE.CircleGeometry(5.2, 8);
      g.rotateX(-Math.PI / 2);
      return g;
    })();

    const mossyStoneGeo = (() => {
      const stone1 = new THREE.DodecahedronGeometry(1.1, 1);
      stone1.translate(0, 0.55, 0);
      const stone2 = new THREE.DodecahedronGeometry(0.7, 1);
      stone2.translate(1.2, 0.35, 0.6);
      return applyOrganicWeathering(safeMerge([stone1, stone2], false) || stone1, 0.12, 0.32, 91);
    })();

    const pineMat = Surfaces.pineNeedles(0x284f24);
    pineMat.alphaTest = 0.5;
    pineMat.depthWrite = true;

    const oakTex = textures('leafCard');
    const oakMat = createBotanicalFoliageMaterial(0x487d32, oakTex.map, {
      isTree: true,
      normalMap: oakTex.normalMap,
      normalScale: 0.65,
      roughness: 0.72,
      sssColor: new THREE.Color(0x82d835),
      shadowColor: new THREE.Color(0x1a4414),
      sssIntensity: 0.88,
      windIntensity: 1.1,
    });

    const goldenOakMat = createBotanicalFoliageMaterial(0xd8982a, oakTex.map, {
      isTree: true,
      normalMap: oakTex.normalMap,
      normalScale: 0.65,
      roughness: 0.70,
      sssColor: new THREE.Color(0xffca42),
      shadowColor: new THREE.Color(0x3a2208),
      sssIntensity: 0.92,
      windIntensity: 1.1,
    });

    const sakuraMat = Surfaces.sakuraBlossom(0xffffff);

    const willowMat = createBotanicalFoliageMaterial(0x5a9436, oakTex.map, {
      isTree: true,
      normalMap: oakTex.normalMap,
      normalScale: 0.55,
      roughness: 0.72,
      sssColor: new THREE.Color(0x82d835),
      shadowColor: new THREE.Color(0x1a4414),
      sssIntensity: 0.90,
      windIntensity: 1.35,
    });

    const palmMat = Surfaces.palmFrond(0xffffff);

    const cypressTex = textures('cypressFoliage');
    const cypressMat = createBotanicalFoliageMaterial(0x245426, cypressTex.map, {
      isTree: true,
      normalMap: cypressTex.normalMap,
      normalScale: 1.3,
      roughness: 0.76,
      sssColor: new THREE.Color(0x62c828),
      shadowColor: new THREE.Color(0x163a12),
      sssIntensity: 0.70,
      windIntensity: 0.95,
    });

    const fallenPineNeedlesMat = Surfaces.fallenPineNeedles(2.5);
    const mossyStoneMat = Surfaces.mossyStone(1.0);

    if (this.world._windMaterials) {
      this.world._windMaterials.push(pineMat, oakMat, goldenOakMat, sakuraMat, willowMat, palmMat, cypressMat);
    }

    // Instanced Valley Trees
    inst(pineTrunkGeo, barkMat, pine.trunks, 0, true);
    inst(pineCanopyGeo, pineMat, pine.crowns, 0, false, pine.crownsColors);
    inst(pineBedGeo, fallenPineNeedlesMat, pine.clutter, 0.06, false);

    inst(oakTrunkGeo, barkMat, oak.trunks, 0, true);
    inst(oakCanopyGeo, oakMat, oak.crowns, 0, false, oak.crownsColors);
    inst(mossyStoneGeo, mossyStoneMat, oak.stones, 0, true);

    inst(oakTrunkGeo, barkMat, goldenOak.trunks, 0, true);
    inst(oakCanopyGeo, goldenOakMat, goldenOak.crowns, 0, false, goldenOak.crownsColors);
    inst(mossyStoneGeo, mossyStoneMat, goldenOak.stones, 0, true);

    inst(sakuraTrunkGeo, cherryBark, sakura.trunks, 0, true);
    inst(sakuraCanopyGeo, sakuraMat, sakura.crowns, 0, false, sakura.crownsColors);

    // Dense Living Mountain Forest Blanket (Alpine Spruces & Mountain Oaks)
    inst(pineTrunkGeo, barkMat, mountainPineMatrices, 0, true);
    inst(pineCanopyGeo, pineMat, mountainPineMatrices, 0, false, mountainPineColors);
    inst(oakTrunkGeo, barkMat, mountainOakMatrices, 0, true);
    inst(oakCanopyGeo, oakMat, mountainOakMatrices, 0, false, mountainOakColors);

    inst(cypressTrunkGeo, barkMat, cypress.trunks, 0, true);
    inst(cypressCanopyGeo, cypressMat, cypress.crowns, 0, false, cypress.crownsColors);

    inst(willowTrunkGeo, barkMat, willow.trunks, 0, true);
    inst(willowCanopyGeo, willowMat, willow.crowns, 0, false, willow.crownsColors);
    inst(mossyStoneGeo, mossyStoneMat, willow.stones, 0, true);

    inst(palmTrunkGeo, palmBark, palm.trunks, 0, true);
    inst(palmCanopyGeo, palmMat, palm.crowns, 13.5, false, palm.crownsColors);

    // Surreal Daliesque Monolithic Obelisks with 24k Gold Pyramidions
    const obeliskStoneGeo = new THREE.CylinderGeometry(0.9, 1.6, 20, 4);
    obeliskStoneGeo.translate(0, 10.0, 0);
    obeliskStoneGeo.rotateY(Math.PI / 4);

    const pyramidionGeo = new THREE.ConeGeometry(1.27, 3.2, 4);
    pyramidionGeo.translate(0, 21.6, 0);
    pyramidionGeo.rotateY(Math.PI / 4);

    const obeliskStoneMat = Surfaces.limestoneDark(2.0);
    const goldMat = Surfaces.gold(1.0);

    const obeliskPositions = [
      [-280, terrainHeight(-280, 260), 260, 0.05],
      [310, terrainHeight(310, 140), 140, -0.08],
      [-190, terrainHeight(-190, -180), -180, 0.12],
      [180, terrainHeight(180, 720), 720, 0.0],
      [-80, terrainHeight(-80, 980), 980, -0.06],
    ];

    const obeliskGroup = new THREE.Group();
    obeliskPositions.forEach(([ox, oy, oz, rotY]) => {
      const stoneMesh = new THREE.Mesh(obeliskStoneGeo, obeliskStoneMat);
      stoneMesh.position.set(ox, oy, oz);
      stoneMesh.rotation.y = rotY;
      stoneMesh.castShadow = stoneMesh.receiveShadow = true;
      obeliskGroup.add(stoneMesh);

      const goldMesh = new THREE.Mesh(pyramidionGeo, goldMat);
      goldMesh.position.set(ox, oy, oz);
      goldMesh.rotation.y = rotY;
      goldMesh.castShadow = true;
      obeliskGroup.add(goldMesh);
    });
    this.world.scene.add(obeliskGroup);

    // Procedural Ribbed Sonoran Saguaro Cactus with Arching Arms & Fluted Radial Ridges
    const saguaroCactusGeo = (() => {
      const parts = [];
      const trunk = new THREE.CylinderGeometry(0.72, 0.85, 9.2, 16);
      const tPos = trunk.attributes.position;
      for (let i = 0; i < tPos.count; i++) {
        const px = tPos.getX(i), py = tPos.getY(i), pz = tPos.getZ(i);
        const ang = Math.atan2(pz, px);
        const rad = Math.hypot(px, pz);
        const rib = Math.cos(ang * 16) * 0.06;
        tPos.setX(i, Math.cos(ang) * (rad + rib));
        tPos.setY(i, py + 4.6);
        tPos.setZ(i, Math.sin(ang) * (rad + rib));
      }
      trunk.computeVertexNormals();
      parts.push(trunk);

      const topDome = new THREE.SphereGeometry(0.72, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      topDome.translate(0, 9.2, 0);
      parts.push(topDome);

      const arm1Elbow = new THREE.CylinderGeometry(0.38, 0.42, 1.8, 8);
      arm1Elbow.rotateZ(Math.PI / 2);
      arm1Elbow.translate(1.2, 4.8, 0);
      parts.push(arm1Elbow);

      const arm1Up = new THREE.CylinderGeometry(0.36, 0.38, 3.8, 8);
      arm1Up.translate(2.1, 6.7, 0);
      parts.push(arm1Up);

      const arm1Dome = new THREE.SphereGeometry(0.36, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      arm1Dome.translate(2.1, 8.6, 0);
      parts.push(arm1Dome);

      const arm2Elbow = new THREE.CylinderGeometry(0.35, 0.40, 1.6, 8);
      arm2Elbow.rotateZ(-Math.PI / 2);
      arm2Elbow.rotateY(0.4);
      arm2Elbow.translate(-1.1 * Math.cos(0.4), 3.6, -1.1 * Math.sin(0.4));
      parts.push(arm2Elbow);

      const arm2Up = new THREE.CylinderGeometry(0.34, 0.35, 3.2, 8);
      arm2Up.translate(-1.9 * Math.cos(0.4), 5.2, -1.9 * Math.sin(0.4));
      parts.push(arm2Up);

      const arm2Dome = new THREE.SphereGeometry(0.34, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      arm2Dome.translate(-1.9 * Math.cos(0.4), 6.8, -1.9 * Math.sin(0.4));
      parts.push(arm2Dome);

      return applyOrganicWeathering(safeMerge(parts, false) || trunk, 0.12, 0.15, 66);
    })();

    inst(saguaroCactusGeo, Surfaces.foliage(1.2, 0x4a7a40), cactus, 0, true);
  }

  _meadowCarpet() {
    const rng = mulberry32(20260405);
    const grassPos = [], poppyPos = [], edelweissPos = [], lavenderPos = [], forgetMeNotPos = [], stoneClutterPos = [];
    const tmp = new THREE.Object3D();

    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    const numGrass = isMobile ? 10000 : 35000;
    const numFlowers = isMobile ? 3000 : 10000;

    // 1. Concentrated alpine pasture grass tufts across active sanctuary floor
    for (let i = 0; i < numGrass; i++) {
      const z = rng() * 1300 - 420;
      const x = (rng() - 0.5) * 620;
      const h = terrainHeight(x, z);
      if (h < WORLD.waterLevel + 0.3 || h > 145) continue;
      const dRoad = distToRoads(x, z);
      if (dRoad < 0.6) continue;
      if (Math.hypot(x - WORLD.plaza.x, z - WORLD.plaza.z) < WORLD.plaza.r + 6) continue;
      if (Math.hypot(x - WORLD.bridge.x, z - WORLD.bridge.z) < 80) continue;

      const s = 0.85 + rng() * 0.65;
      tmp.position.set(x, h, z);
      tmp.rotation.set(0, rng() * Math.PI * 2, 0);
      tmp.scale.setScalar(s);
      tmp.updateMatrix();
      grassPos.push(tmp.matrix.clone());
    }

    // 2. Clustered Wildflowers & Ground Clutter along pathways and viewpoints
    for (let i = 0; i < numFlowers; i++) {
      const z = rng() * 1300 - 420;
      const x = (rng() - 0.5) * 620;
      const h = terrainHeight(x, z);
      if (h < WORLD.waterLevel + 0.3 || h > 145) continue;
      const dRoad = distToRoads(x, z);
      if (dRoad < 0.8) continue;
      if (Math.hypot(x - WORLD.plaza.x, z - WORLD.plaza.z) < WORLD.plaza.r + 8) continue;
      if (Math.hypot(x - WORLD.bridge.x, z - WORLD.bridge.z) < 80) continue;

      const s = 0.85 + rng() * 0.55;
      tmp.position.set(x, h, z);
      tmp.rotation.set(0, rng() * Math.PI * 2, 0);
      tmp.scale.setScalar(s);
      tmp.updateMatrix();

      const roll = rng();
      if (roll < 0.28) {
        poppyPos.push(tmp.matrix.clone());
      } else if (roll < 0.52) {
        edelweissPos.push(tmp.matrix.clone());
      } else if (roll < 0.74) {
        lavenderPos.push(tmp.matrix.clone());
      } else if (roll < 0.90) {
        forgetMeNotPos.push(tmp.matrix.clone());
      } else {
        tmp.scale.setScalar(0.35 + rng() * 0.40);
        tmp.updateMatrix();
        stoneClutterPos.push(tmp.matrix.clone());
      }
    }

    const inst = (geo, mat, mats, castShadow = false) => {
      if (!mats.length) return;
      if (geo.computeBoundingSphere) geo.computeBoundingSphere();
      const m = new THREE.InstancedMesh(geo, mat, mats.length);
      mats.forEach((mx, i) => m.setMatrixAt(i, mx));
      m.instanceMatrix.needsUpdate = true;
      if (typeof m.computeBoundingSphere === 'function') m.computeBoundingSphere();
      if (typeof m.computeBoundingBox === 'function') m.computeBoundingBox();
      m.castShadow = castShadow;
      m.receiveShadow = false;
      m.frustumCulled = false;
      this.world.scene.add(m);
    };

    // Instanced grass blades for photorealistic volume and depth (replacing flat texture cards)
    const grassGeo = (() => {
      const parts = [];
      const rngG = mulberry32(842);
      for (let b = 0; b < 10; b++) {
        const width = 0.03 + rngG() * 0.04;
        const height = 0.4 + rngG() * 0.7;
        const blade = new THREE.PlaneGeometry(width, height, 1, 3);
        const pos = blade.attributes.position;
        const curveDir = rngG() * Math.PI * 2;
        const curveAmt = 0.15 + rngG() * 0.35;
        const r = rngG() * 0.25;
        const cx = Math.cos(rngG() * Math.PI * 2) * r;
        const cz = Math.sin(rngG() * Math.PI * 2) * r;
        
        for (let i = 0; i < pos.count; i++) {
          let x = pos.getX(i);
          const y = pos.getY(i) + height * 0.5; // base at 0
          const yFrac = Math.max(0.0, y / height);
          
          x *= (1.0 - Math.pow(yFrac, 1.5)); // Taper
          const zOffset = Math.pow(yFrac, 2.0) * curveAmt; // Curve
          
          const fx = x * Math.cos(curveDir) - zOffset * Math.sin(curveDir);
          const fz = x * Math.sin(curveDir) + zOffset * Math.cos(curveDir);
          
          pos.setXYZ(i, fx + cx, y, fz + cz);
        }
        blade.computeVertexNormals();
        parts.push(blade);
      }
      return safeMerge(parts, false) || parts[0];
    })();

    // Multi-angled wildflower bloom geometry (3-quad cross cluster)
    const flowerGeo = (() => {
      const parts = [];
      for (let b = 0; b < 3; b++) {
        const a = (b / 3) * Math.PI;
        const q = new THREE.PlaneGeometry(1.15, 1.25);
        q.translate(0, 0.625, 0);
        q.rotateY(a);
        parts.push(q);
      }
      return safeMerge(parts, false) || parts[0];
    })();

    // Vertical lavender spike geometry (3-quad cross cluster)
    const lavenderGeo = (() => {
      const parts = [];
      for (let b = 0; b < 3; b++) {
        const a = (b / 3) * Math.PI;
        const q = new THREE.PlaneGeometry(0.90, 1.45);
        q.translate(0, 0.725, 0);
        q.rotateY(a);
        parts.push(q);
      }
      return safeMerge(parts, false) || parts[0];
    })();

    const smallStoneGeo = (() => {
      const g = new THREE.DodecahedronGeometry(0.65, 1);
      g.translate(0, 0.32, 0);
      return applyOrganicWeathering(g, 0.2, 0.25, 47);
    })();

    const grassMat = createBotanicalFoliageMaterial(0x56963e, null, {
      isTree: false,
      roughness: 0.92,
      sssColor: 0x8ce045,
      sssIntensity: 0.75,
      windIntensity: 0.8
    });
    grassMat.depthWrite = true;
    grassMat.transparent = false;

    const poppyMat = Surfaces.goldenPoppy();
    poppyMat.alphaTest = 0.5;
    poppyMat.depthWrite = true;
    poppyMat.transparent = false;

    const edelweissMat = Surfaces.edelweiss();
    edelweissMat.alphaTest = 0.5;
    edelweissMat.depthWrite = true;
    edelweissMat.transparent = false;

    const lavenderMat = Surfaces.lavenderSprig();
    lavenderMat.alphaTest = 0.5;
    lavenderMat.depthWrite = true;
    lavenderMat.transparent = false;

    const forgetMeNotMat = Surfaces.forgetMeNot();
    forgetMeNotMat.alphaTest = 0.5;
    forgetMeNotMat.depthWrite = true;
    forgetMeNotMat.transparent = false;

    const meadowStoneMat = Surfaces.mossyStone(1.0);

    if (this.world._windMaterials) {
      this.world._windMaterials.push(grassMat, poppyMat, edelweissMat, lavenderMat, forgetMeNotMat);
    }

    inst(grassGeo, grassMat, grassPos, false);
    inst(flowerGeo, poppyMat, poppyPos, false);
    inst(flowerGeo, edelweissMat, edelweissPos, false);
    inst(lavenderGeo, lavenderMat, lavenderPos, false);
    inst(flowerGeo, forgetMeNotMat, forgetMeNotPos, false);
    inst(smallStoneGeo, meadowStoneMat, stoneClutterPos, true);
  }

  _districtFeatures() {
    const rng = mulberry32(88442);
    const tmp = new THREE.Object3D();

    const place = (x, z, clearRoads = 14) => {
      const h = terrainHeight(x, z);
      if (h < WORLD.waterLevel + 1 || h > 170) return null;
      if (distToRoads(x, z) < clearRoads) return null;
      if (Math.hypot(x - WORLD.plaza.x, z - WORLD.plaza.z) < WORLD.plaza.r + 26) return null;
      if (Math.hypot(x - WORLD.bridge.x, z - WORLD.bridge.z) < 140) return null;
      if (Math.hypot(x - WORLD.gate.x, z - WORLD.gate.z) < 120) return null;
      if (Math.abs(x) < 52 && z >= 760 && z <= 1120) return null; // keep entire Grand Gate entrance corridor & promenade 100% clear
      for (const p of this.world.plots) if (Math.hypot(x - p.x, z - p.z) < 14) return null;
      return h;
    };

    // ─── Lakefront: Weeping Willows ───
    const willowTrunks = [], willowCrowns = [], willowDrapes = [];
    for (let i = 0; i < 180; i++) {
      const a = rng() * Math.PI * 2;
      const r = WORLD.lake.r + 8 + rng() * 48;
      const x = WORLD.lake.x + Math.cos(a) * r;
      const z = WORLD.lake.z + Math.sin(a) * r;
      const h = place(x, z, 16);
      if (h === null || rng() > 0.15) continue;
      const s = 0.8 + rng() * 0.5;
      tmp.position.set(x, h - 1.5, z);
      tmp.rotation.set(0, rng() * Math.PI * 2, 0);
      tmp.scale.setScalar(s);
      tmp.updateMatrix();
      willowTrunks.push(tmp.matrix.clone());
      willowCrowns.push(tmp.matrix.clone());
      willowDrapes.push(tmp.matrix.clone());
    }

    // ─── Beach / Golden Shores: Sea Grass Tufts & Driftwood ───
    const seaGrass = [], driftwood = [];
    for (let i = 0; i < 250; i++) {
      const x = 500 + rng() * 300, z = -200 + rng() * 400;
      const dLake = Math.hypot(x - WORLD.lake.x, z - WORLD.lake.z) - WORLD.lake.r;
      if (dLake < 2 || dLake > 80) continue;
      const h = place(x, z, 10);
      if (h === null) continue;
      tmp.position.set(x, h, z);
      tmp.rotation.set(0, rng() * Math.PI * 2, 0);
      tmp.scale.setScalar(0.6 + rng() * 0.6);
      tmp.updateMatrix();
      if (rng() < 0.85) seaGrass.push(tmp.matrix.clone());
      else driftwood.push(tmp.matrix.clone());
    }

    // ─── Whispering Pines: Ferns & Mushrooms ───
    const ferns = [], mushrooms = [];
    for (let i = 0; i < 300; i++) {
      const x = -200 + rng() * 400, z = -650 + rng() * 320;
      const h = place(x, z, 8);
      if (h === null) continue;
      tmp.position.set(x, h, z);
      tmp.rotation.set(0, rng() * Math.PI * 2, 0);
      tmp.scale.setScalar(0.5 + rng() * 0.6);
      tmp.updateMatrix();
      if (rng() < 0.8) ferns.push(tmp.matrix.clone());
      else mushrooms.push(tmp.matrix.clone());
    }

    // ─── Desert Bloom: Flowering Cacti & Tumbleweeds ───
    const desertFlowers = [], tumbleweeds = [];
    for (let i = 0; i < 200; i++) {
      const x = -650 + rng() * 350, z = 200 + rng() * 350;
      const h = place(x, z, 10);
      if (h === null || h > 70) continue;
      tmp.position.set(x, h, z);
      tmp.rotation.set(0, rng() * Math.PI * 2, 0);
      tmp.scale.setScalar(0.5 + rng() * 0.7);
      tmp.updateMatrix();
      if (rng() < 0.7) desertFlowers.push(tmp.matrix.clone());
      else tumbleweeds.push(tmp.matrix.clone());
    }

    // ─── Summit Rest: Cairns & Wind-Twisted Shrubs ───
    const cairns = [], alpineShrubs = [];
    for (let i = 0; i < 160; i++) {
      const x = -700 + rng() * 350, z = -600 + rng() * 400;
      const h = place(x, z, 12);
      if (h === null || h < 45) continue;
      tmp.position.set(x, h, z);
      tmp.rotation.set(0, rng() * Math.PI * 2, 0);
      tmp.scale.setScalar(0.6 + rng() * 0.5);
      tmp.updateMatrix();
      if (rng() < 0.35) cairns.push(tmp.matrix.clone());
      else alpineShrubs.push(tmp.matrix.clone());
    }

    // ─── Memorial Meadows: Garden Hedges & Rose Bushes ───
    const hedges = [], roseBushes = [];
    for (let i = 0; i < 200; i++) {
      const x = -300 + rng() * 600, z = 240 + rng() * 450;
      const h = place(x, z, 12);
      if (h === null || h > 60) continue;
      tmp.position.set(x, h, z);
      tmp.rotation.set(0, rng() * Math.PI * 2, 0);
      tmp.scale.setScalar(0.7 + rng() * 0.5);
      tmp.updateMatrix();
      if (rng() < 0.4) hedges.push(tmp.matrix.clone());
      else roseBushes.push(tmp.matrix.clone());
    }

    // ─── Instantiate everything ───
    const inst = (geo, mat, mats, yOff = 0) => {
      if (!mats.length) return;
      if (geo.computeBoundingSphere) geo.computeBoundingSphere();
      const m = new THREE.InstancedMesh(geo, mat, mats.length);
      const t = new THREE.Matrix4(), off = new THREE.Matrix4().makeTranslation(0, yOff, 0);
      mats.forEach((mx, i) => { t.copy(mx).multiply(off); m.setMatrixAt(i, t); });
      m.instanceMatrix.needsUpdate = true;
      if (typeof m.computeBoundingSphere === 'function') m.computeBoundingSphere();
      if (typeof m.computeBoundingBox === 'function') m.computeBoundingBox();
      m.castShadow = true;
      m.frustumCulled = false;
      this.world.scene.add(m);
    };

    const instColored = (geo, mat, mats, yOff, colorFn) => {
      if (!mats.length) return;
      if (geo.computeBoundingSphere) geo.computeBoundingSphere();
      const m = new THREE.InstancedMesh(geo, mat, mats.length);
      const t = new THREE.Matrix4(), off = new THREE.Matrix4().makeTranslation(0, yOff, 0);
      const col = new THREE.Color();
      mats.forEach((mx, i) => {
        t.copy(mx).multiply(off); m.setMatrixAt(i, t);
        m.setColorAt(i, col.setHex(colorFn(i)));
      });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      if (typeof m.computeBoundingSphere === 'function') m.computeBoundingSphere();
      if (typeof m.computeBoundingBox === 'function') m.computeBoundingBox();
      m.castShadow = true;
      m.frustumCulled = false;
      this.world.scene.add(m);
    };

    // Willow trunk: AAA gnarled leaning timber with flared buttress roots and 4 structural scaffold boughs
    const willowBark = Surfaces.bark(1.5);
//     willowBark.color.setHex(0x948268);

    const willowTrunkGeo = (() => {
      const parts = [];
      const baseGeo = new THREE.CylinderGeometry(1.1, 2.0, 2.0, 10);
      baseGeo.translate(0, 1.0, 0);
      parts.push(baseGeo);

      for (let r = 0; r < 4; r++) {
        const rAng = (r / 4) * Math.PI * 2 + 0.3;
        const root = new THREE.CylinderGeometry(0.22, 0.48, 2.6, 6);
        root.rotateZ(0.72);
        root.rotateY(rAng);
        root.translate(Math.cos(rAng) * 1.5, 0.35, Math.sin(rAng) * 1.5);
        parts.push(root);
      }

      const trunk1 = new THREE.CylinderGeometry(0.78, 1.1, 4.6, 8);
      trunk1.rotateZ(0.18);
      trunk1.translate(0.35, 3.2, 0);
      parts.push(trunk1);

      const trunk2 = new THREE.CylinderGeometry(0.52, 0.78, 5.0, 8);
      trunk2.rotateZ(0.34);
      trunk2.translate(1.1, 6.8, 0.2);
      parts.push(trunk2);

      for (let b = 0; b < 4; b++) {
        const ang = (b / 4) * Math.PI * 2 + 0.35;
        const br = new THREE.CylinderGeometry(0.22, 0.46, 5.2, 6);
        br.rotateZ(0.78);
        br.rotateY(ang);
        br.translate(Math.cos(ang) * 2.8 + 1.1, 9.2, Math.sin(ang) * 2.8 + 0.2);
        parts.push(br);
      }
      return applyOrganicWeathering(safeMerge(parts, false) || baseGeo, 0.15, 0.25, 87);
    })();
    inst(willowTrunkGeo, willowBark, willowTrunks, 0);

    // Willow canopy: 60 cascading tendril ribbons & umbrella dome cards with chlorophyll SSS
    const createCurvedWillowCardGeo = (w, h, curveDepth = 0.40) => {
      const geo = new THREE.PlaneGeometry(w, h, 2, 2);
      const cpos = geo.attributes.position;
      for (let i = 0; i < cpos.count; i++) {
        const x = cpos.getX(i), y = cpos.getY(i);
        const u = x / (w * 0.5), v = y / (h * 0.5);
        cpos.setZ(i, (1.0 - u * u) * curveDepth * (1.0 - v * 0.25));
      }
      geo.computeVertexNormals();
      return geo;
    };

    const willowCrownGeo = (() => {
      const parts = [];
      // 1. Inner dense core curtain (28 vertical tendril ribbon cards)
      const numInner = 28;
      for (let i = 0; i < numInner; i++) {
        const ang = (i / numInner) * Math.PI * 2;
        const rad = 3.0 + (i % 2) * 1.0;
        const tendrilH = 9.2 + (i % 3) * 1.6;
        const q = createCurvedWillowCardGeo(3.6, tendrilH, 0.38);
        q.rotateY(ang + Math.PI * 0.5);
        q.translate(Math.cos(ang) * rad + 0.8, 6.2, Math.sin(ang) * rad + 0.1);
        parts.push(q);
      }
      // 2. Mid weeping curtain (36 sweeping draping tendril cards)
      const numMid = 36;
      for (let i = 0; i < numMid; i++) {
        const ang = (i / numMid) * Math.PI * 2 + 0.12;
        const rad = 5.6 + (i % 3) * 1.5;
        const tendrilH = 11.2 + (i % 4) * 1.8;
        const q = createCurvedWillowCardGeo(3.8, tendrilH, 0.42);
        q.rotateX(0.14);
        q.rotateY(ang + Math.PI * 0.5);
        q.translate(Math.cos(ang) * rad + 0.8, 5.6, Math.sin(ang) * rad + 0.1);
        parts.push(q);
      }
      // 3. Outer weeping curtain (48 sweeping draping tendril cards)
      const numOuter = 48;
      for (let i = 0; i < numOuter; i++) {
        const ang = (i / numOuter) * Math.PI * 2 + 0.22;
        const rad = 7.8 + (i % 3) * 1.6;
        const tendrilH = 12.8 + (i % 4) * 2.0;
        const q = createCurvedWillowCardGeo(4.0, tendrilH, 0.46);
        q.rotateX(0.22);
        q.rotateY(ang + Math.PI * 0.5);
        q.translate(Math.cos(ang) * rad + 0.8, 5.0, Math.sin(ang) * rad + 0.1);
        parts.push(q);
      }
      // 4. Upper crown arching umbrella dome (24 curved canopy cards)
      const numDome = 24;
      for (let i = 0; i < numDome; i++) {
        const ang = (i / numDome) * Math.PI * 2;
        const q = createCurvedWillowCardGeo(5.6, 5.6, 0.58);
        q.rotateX(0.44);
        q.rotateY(ang);
        q.translate(Math.cos(ang) * 4.2 + 0.8, 10.8, Math.sin(ang) * 4.2 + 0.1);
        parts.push(q);
      }
      const merged = safeMerge(parts, false) || parts[0];
      if (merged && merged.attributes.position && merged.attributes.normal) {
        const pos = merged.attributes.position;
        const norm = merged.attributes.normal;
        for (let i = 0; i < pos.count; i++) {
          const px = pos.getX(i) - 0.8, py = pos.getY(i) - 7.0, pz = pos.getZ(i) - 0.1;
          const rad = Math.hypot(px, pz) || 1.0;
          const nx = (px / rad) * 0.82 + norm.getX(i) * 0.18;
          const ny = (py / (Math.hypot(px, py, pz) || 1.0)) * 0.5 + norm.getY(i) * 0.18;
          const nz = (pz / rad) * 0.82 + norm.getZ(i) * 0.18;
          const len = Math.hypot(nx, ny, nz) || 1.0;
          norm.setXYZ(i, nx / len, ny / len, nz / len);
        }
        norm.needsUpdate = true;
      }
      return merged;
    })();
    const willowFoliage = Surfaces.leafCard(0x5a9436);
    if (this.world._windMaterials) this.world._windMaterials.push(willowFoliage);
    inst(willowCrownGeo, willowFoliage, willowCrowns, 0);

    // Sea grass: organic curved grass blade ribbons
    const grassTuftGeo = (() => {
      const parts = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const q = new THREE.PlaneGeometry(0.35, 1.8);
        q.rotateX(0.25);
        q.rotateY(a);
        q.translate(Math.cos(a) * 0.3, 0.9, Math.sin(a) * 0.3);
        parts.push(q);
      }
      return safeMerge(parts, false) || parts[0];
    })();
    inst(grassTuftGeo, Surfaces.grassTuft(), seaGrass, 0);

    // Driftwood: weathered sun-bleached logs
    const driftwoodMat = Surfaces.bark(1);
//     driftwoodMat.color.setHex(0xb8aa96);
    inst(new THREE.CapsuleGeometry(0.35, 3.8, 6, 10), driftwoodMat, driftwood, 0.25);

    // Ferns: botanical curved frond ribbons with leaf textures
    const fernGeo = (() => {
      const parts = [];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const q = new THREE.PlaneGeometry(0.65, 1.9);
        q.rotateX(0.55);
        q.rotateY(a);
        q.translate(Math.cos(a) * 0.6, 0.65, Math.sin(a) * 0.6);
        parts.push(q);
      }
      return safeMerge(parts, false) || parts[0];
    })();
    inst(fernGeo, Surfaces.leafCard(0x386b3e), ferns, 0);

    // Mushrooms: natural forest floor caps
    const mushroomGeo = (() => {
      const stem = new THREE.CylinderGeometry(0.08, 0.12, 0.6, 6);
      stem.translate(0, 0.3, 0);
      const cap = new THREE.SphereGeometry(0.24, 8, 6);
      cap.scale(1.2, 0.45, 1.2);
      cap.translate(0, 0.6, 0);
      return safeMerge([stem, cap], false) || cap;
    })();
    inst(mushroomGeo, new THREE.MeshPhysicalMaterial({
      color: 0xded2be, roughness: 0.92, metalness: 0
    }), mushrooms, 0);

    // Desert Flora: sculpted agave succulents with botanical flower spires
    const desertAgaveGeo = (() => {
      const parts = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const q = new THREE.PlaneGeometry(0.45, 1.8);
        q.rotateX(0.65);
        q.rotateY(a);
        q.translate(Math.cos(a) * 0.5, 0.6, Math.sin(a) * 0.5);
        parts.push(q);
      }
      const spire = new THREE.CylinderGeometry(0.06, 0.12, 3.2, 6);
      spire.translate(0, 1.6, 0);
      parts.push(spire);
      return safeMerge(parts, false) || parts[0];
    })();
    inst(desertAgaveGeo, Surfaces.foliage(1.2, 0x6e8862), desertFlowers, 0);

    // Alpine Rock Boulders & Cairns: fractured craggy rock with PBR normal maps
    const boulderGeo = (() => {
      const parts = [];
      for (let i = 0; i < 3; i++) {
        const s = 1.2 - i * 0.28;
        const rk = new THREE.DodecahedronGeometry(s, 1);
        rk.translate((i - 1) * 0.4, s * 0.7, (i % 2 - 0.5) * 0.3);
        parts.push(rk);
      }
      return safeMerge(parts, false) || parts[0];
    })();
    inst(boulderGeo, Surfaces.rockCliff(2.5), cairns, 0);

    // Alpine wind-twisted shrubs: organic leafy clusters
    const alpineGeo = (() => {
      const parts = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const q = new THREE.PlaneGeometry(1.4, 1.4);
        q.rotateX(0.4);
        q.rotateY(a);
        q.translate(Math.cos(a) * 0.9, 0.7, Math.sin(a) * 0.9);
        parts.push(q);
      }
      return safeMerge(parts, false) || parts[0];
    })();
    inst(alpineGeo, Surfaces.leafCard(0x486b42), alpineShrubs, 0);

    // Garden hedges: natural dense botanical shrub rows
    const hedgeGeo = (() => {
      const parts = [];
      for (let i = 0; i < 14; i++) {
        const x = (i - 7) * 0.35;
        const q = new THREE.PlaneGeometry(1.6, 2.2);
        q.rotateY(i * 0.8);
        q.translate(x, 1.1, 0);
        parts.push(q);
      }
      return safeMerge(parts, false) || parts[0];
    })();
    inst(hedgeGeo, Surfaces.leafCard(0x3e6e38), hedges, 0);

    // Flowering Rose & Floral Bushes: lush botanical foliage cards with delicate blossoms
    const roseGeo = (() => {
      const parts = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const q = new THREE.PlaneGeometry(1.1, 1.4);
        q.rotateX(0.35);
        q.rotateY(a);
        q.translate(Math.cos(a) * 0.7, 0.8, Math.sin(a) * 0.7);
        parts.push(q);
      }
      return safeMerge(parts, false) || parts[0];
    })();
    inst(roseGeo, Surfaces.wildflowers(), roseBushes, 0);
  }

  _sanctuaryTree() {
    const tx = 0, tz = -140;
    const th = terrainHeight(tx, tz);
    const g = new THREE.Group();
    g.position.set(tx, th, tz);

    const trunkMat = Surfaces.bark(1.2);
    const limbMat = Surfaces.bark(1.5);
    const leafTex = textures('leafCard');
    const leafMat = createBotanicalFoliageMaterial(0x94ea50, leafTex.map, {
      isTree: true,
      normalMap: leafTex.normalMap,
      normalScale: 0.65,
      roughness: 0.72,
      sssColor: new THREE.Color(0xa4ff58),
      shadowColor: new THREE.Color(0x1a4414),
      sssIntensity: 0.92,
      windIntensity: 1.15,
    });
    if (this.world._windMaterials) this.world._windMaterials.push(leafMat);

    // Deep soft ground contact ambient occlusion shadow
    const shadowGeo = new THREE.RingGeometry(0.1, 18, 32);
    const shadowCnv = document.createElement('canvas');
    shadowCnv.width = shadowCnv.height = 128;
    const sCtx = shadowCnv.getContext('2d');
    const sGrad = sCtx.createRadialGradient(64, 64, 10, 64, 64, 64);
    sGrad.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
    sGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.40)');
    sGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 128, 128);
    const shadowTex = new THREE.CanvasTexture(shadowCnv);
    const shadowMesh = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, logarithmicDepthBuffer: true, depthWrite: false }));
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.08;
    g.add(shadowMesh);

    // Sculpted organic ancient trunk with natural fluting and basal flare, terminating at cathedral fork (y=13)
    const trunkSegments = 24, heightSegments = 20;
    const trunkGeo = new THREE.CylinderGeometry(2.4, 6.4, 13.5, trunkSegments, heightSegments);
    const pos = trunkGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      const hFrac = (py + 6.75) / 13.5; // 0 at base, 1 at top
      const angle = Math.atan2(pz, px);
      const rad = Math.hypot(px, pz);
      // Fluted buttress ridges (6 organic ribs) that flare strongly at the base
      const rib = Math.cos(angle * 6) * Math.pow(1.0 - hFrac, 1.8) * 2.4;
      const newRad = rad + rib;
      pos.setX(i, Math.cos(angle) * newRad);
      pos.setY(i, py + 6.75);
      pos.setZ(i, Math.sin(angle) * newRad);
    }
    trunkGeo.computeVertexNormals();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    g.add(trunk);

    // 8 Natural sculpted boughs branching out and smoothly tapering into the foliage
    for (let b = 0; b < 8; b++) {
      const bAng = (b / 8) * Math.PI * 2 + (b % 2) * 0.25;
      const boughGroup = [];
      // Segment 1: main fork (thick)
      const seg1 = new THREE.CylinderGeometry(1.0, 1.4, 4.5, 8);
      seg1.rotateZ(0.42);
      seg1.rotateY(bAng);
      seg1.translate(Math.cos(bAng) * 2.8, 14.5, Math.sin(bAng) * 2.8);
      boughGroup.push(seg1);

      // Segment 2: mid branch (medium)
      const seg2 = new THREE.CylinderGeometry(0.55, 1.0, 4.8, 8);
      seg2.rotateZ(0.65);
      seg2.rotateY(bAng + 0.15);
      seg2.translate(Math.cos(bAng + 0.15) * 5.8, 17.5, Math.sin(bAng + 0.15) * 5.8);
      boughGroup.push(seg2);

      // Segment 3: outer branch (tapered twig)
      const seg3 = new THREE.CylinderGeometry(0.18, 0.55, 4.5, 6);
      seg3.rotateZ(0.82);
      seg3.rotateY(bAng + 0.28);
      seg3.translate(Math.cos(bAng + 0.28) * 8.8, 19.8, Math.sin(bAng + 0.28) * 8.8);
      boughGroup.push(seg3);

      const mergedBough = safeMerge(boughGroup, false) || seg1;
      const bm = new THREE.Mesh(mergedBough, limbMat);
      bm.castShadow = true;
      g.add(bm);
    }

    // Sacred Leaf Canopy: 340 lush curved multi-planar leaf cards clustered organically over the cathedral crown
    const createCurvedLeafCardGeo = (w, h, curveDepth = 0.45) => {
      const geo = new THREE.PlaneGeometry(w, h, 2, 2);
      const cpos = geo.attributes.position;
      for (let i = 0; i < cpos.count; i++) {
        const x = cpos.getX(i), y = cpos.getY(i);
        const u = x / (w * 0.5), v = y / (h * 0.5);
        cpos.setZ(i, (1.0 - u * u) * curveDepth * (1.0 - v * 0.35) + (1.0 - v * v) * curveDepth * 0.25);
      }
      geo.computeVertexNormals();
      return geo;
    };

    const leafCards = [];
    const rng = mulberry32(8888);
    for (let i = 0; i < 340; i++) {
      const phi = Math.acos(1 - 2 * rng());
      const theta = rng() * Math.PI * 2;
      const rad = 2.5 + rng() * 16.5;
      const cx = Math.sin(phi) * Math.cos(theta) * rad;
      const cy = 21.0 + Math.cos(phi) * (rad * 0.82);
      const cz = Math.sin(phi) * Math.sin(theta) * rad;
      const s = 3.8 + rng() * 2.0;
      
      const q = createCurvedLeafCardGeo(s, s * 0.95, 0.52);
      q.rotateX((rng() - 0.5) * Math.PI * 0.85);
      q.rotateY(rng() * Math.PI * 2);
      q.rotateZ((rng() - 0.5) * 0.65);
      q.translate(cx, cy, cz);
      leafCards.push(q);
    }

    const mergedLeaves = safeMerge(leafCards, false) || leafCards[0];
    if (mergedLeaves && mergedLeaves.attributes.position && mergedLeaves.attributes.normal) {
      const pos = mergedLeaves.attributes.position;
      const norm = mergedLeaves.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i), py = pos.getY(i) - 21.0, pz = pos.getZ(i);
        const rad = Math.hypot(px, py, pz) || 1.0;
        const nx = (px / rad) * 0.85 + norm.getX(i) * 0.15;
        const ny = (py / rad) * 0.85 + norm.getY(i) * 0.15;
        const nz = (pz / rad) * 0.85 + norm.getZ(i) * 0.15;
        const len = Math.hypot(nx, ny, nz) || 1.0;
        norm.setXYZ(i, nx / len, ny / len, nz / len);
      }
      norm.needsUpdate = true;
    }
    const leafMesh = new THREE.Mesh(mergedLeaves, leafMat);
    leafMesh.castShadow = false;
    leafMesh.receiveShadow = true;
    g.add(leafMesh);

    // Hanging Warm Celestial Crystal Lanterns
    const lanternMat = new THREE.MeshPhysicalMaterial({
      color: 0x3d2c18,
      emissive: 0xf5b041,
      emissiveIntensity: 2.2,
      roughness: 0.25,
      metalness: 0.8,
    });
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2 + 0.12;
      const dist = 6.5 + (i % 4) * 2.8;
      const ly = 13.5 - (i % 3) * 1.6;
      const lGeo = new THREE.DodecahedronGeometry(0.75, 0);
      const lm = new THREE.Mesh(lGeo, lanternMat);
      lm.position.set(Math.cos(ang) * dist, ly, Math.sin(ang) * dist);
      g.add(lm);
    }

    this.world.scene.add(g);
  }

  _celestialMotes() {
    const COUNT = 240;
    const pos = new Float32Array(COUNT * 3);
    const col = new Float32Array(COUNT * 3);
    const siz = new Float32Array(COUNT);
    const rng = mulberry32(777123);
    const c = new THREE.Color();

    for (let i = 0; i < COUNT; i++) {
      const x = (rng() - 0.5) * 1500;
      const z = (rng() - 0.5) * 1500;
      const h = Math.max(terrainHeight(x, z), WORLD.waterLevel) + 2.5 + rng() * 16;
      pos[i * 3] = x;
      pos[i * 3 + 1] = h;
      pos[i * 3 + 2] = z;

      // Golden champagne and celestial rose tints
      c.setHSL(0.11 + rng() * 0.10, 0.85, 0.78 + rng() * 0.22);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;

      siz[i] = (0.25 + rng() * 0.45) * 12;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(siz, 1));
    g.computeBoundingSphere();

    this.moteMat = new THREE.ShaderMaterial({
      transparent: true, logarithmicDepthBuffer: true, depthWrite: false, fog: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTex: { value: this.world.lighting._starSprite() },
        uTime: { value: 0 },
        uOpacity: { value: 0.0 }, // Disabled for photographic realism
      },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        #include <fog_pars_vertex>
        attribute float size;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uTime;
        void main(){
          vColor = color;
          vec3 p = position;
          p.y += sin(uTime * 1.1 + position.x * 0.03 + position.z * 0.02) * 1.5;
          p.x += cos(uTime * 0.8 + position.z * 0.02) * 0.8;
          p.z += sin(uTime * 0.7 + position.x * 0.02) * 0.8;
          vAlpha = 0.45 + 0.55 * sin(uTime * 2.2 + position.x * 0.08 + position.z * 0.06);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = min(64.0, size * (80.0 / -mv.z));
          gl_Position = projectionMatrix * mv;
                  #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        #include <fog_pars_fragment>
        uniform sampler2D uTex;
        uniform float uOpacity;
        varying vec3 vColor;
        varying float vAlpha;
        void main(){
          vec4 t = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(vColor, t.a * uOpacity * vAlpha);
                  #include <logdepthbuf_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
      vertexColors: true,
    });

    this.motes = new THREE.Points(g, this.moteMat);
    this.world.scene.add(this.motes);
  }

  _kayaIsland() {
    const g = new THREE.Group();
    const ix = 20, iz = 2100;
    const marble = Surfaces.honedCarraraMarble(1.5);
    const gold = Surfaces.celestialGold(1.0);
    const darkBronze = Surfaces.verdigrisBronze(1.0);
    const stone = Surfaces.flagstone(2.4);
    const crystalColMat = Surfaces.crystalColumn();
    const starlightOrbMat = Surfaces.starlightCrystal();
    const palmBark = Surfaces.bark(2.2);
//     if (palmBark && palmBark.color) palmBark.color.setHex(0xa88e6e);

    // 1. Classical Guardian Husky Kaya Starlight Pavilion on Island Peak
    const peakY = terrainHeight(ix, iz); // ~32m
    const pavGroup = new THREE.Group();
    pavGroup.position.set(ix, peakY + 0.1, iz);

    // Circular multi-tier stepped Carrara marble stylobate plinth
    const plinthStep1 = new THREE.Mesh(new THREE.CylinderGeometry(20, 22, 1.2, 48), marble);
    plinthStep1.position.y = 0.6;
    plinthStep1.receiveShadow = plinthStep1.castShadow = true;
    pavGroup.add(plinthStep1);

    const plinthStep2 = new THREE.Mesh(new THREE.CylinderGeometry(18, 19.5, 1.2, 48), marble);
    plinthStep2.position.y = 1.8;
    plinthStep2.receiveShadow = plinthStep2.castShadow = true;
    pavGroup.add(plinthStep2);

    // Inlaid 24K Gold Celestial Starburst Pavement inside the pavilion
    for (let rot = 0; rot < 8; rot++) {
      const ray = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 15.0), gold);
      ray.position.y = 2.45;
      ray.rotation.y = (rot * Math.PI) / 8;
      pavGroup.add(ray);
    }
    const starCenterDisc = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.1, 24), gold);
    starCenterDisc.position.y = 2.46;
    pavGroup.add(starCenterDisc);

    // Inscribed 24K Gold Plinth Base for Kaya Monument
    const basePlaqueGeo = new THREE.CylinderGeometry(5.8, 6.4, 1.6, 24);
    const basePlaque = new THREE.Mesh(basePlaqueGeo, gold);
    basePlaque.position.y = 3.2;
    basePlaque.castShadow = basePlaque.receiveShadow = true;
    pavGroup.add(basePlaque);

    // 8 Peristyle Optical Crystal Columns with 24K Gold Capitals & Bases
    const numCols = 8;
    for (let c = 0; c < numCols; c++) {
      const ang = (c / numCols) * Math.PI * 2 + Math.PI / 8;
      const cx = Math.cos(ang) * 14.2, cz = Math.sin(ang) * 14.2;

      // 24K Gold Molded Column Base
      const colBase = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 2.4), gold);
      colBase.position.set(cx, 2.8, cz);
      pavGroup.add(colBase);

      const colBaseTorus = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.22, 12, 24), gold);
      colBaseTorus.rotation.x = Math.PI / 2;
      colBaseTorus.position.set(cx, 3.2, cz);
      pavGroup.add(colBaseTorus);

      // Fluted Optical Crystal Column Shaft (Refractive PBR Crystal)
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.88, 10.5, 20), crystalColMat);
      col.position.set(cx, 8.5, cz);
      col.castShadow = true;
      pavGroup.add(col);

      // 24K Gold Corinthian Capital
      const capGroup = new THREE.Group();
      capGroup.position.set(cx, 13.8, cz);

      const capKalathos = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 0.8, 1.8, 16), gold);
      capKalathos.position.y = 0.9;
      capGroup.add(capKalathos);

      for (let l = 0; l < 8; l++) {
        const lAng = (l / 8) * Math.PI * 2;
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.2, 4), gold);
        leaf.rotation.z = -Math.cos(lAng) * 0.3;
        leaf.rotation.x = Math.sin(lAng) * 0.3;
        leaf.position.set(Math.cos(lAng) * 1.0, 0.6, Math.sin(lAng) * 1.0);
        capGroup.add(leaf);
      }

      const capAbacus = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.5, 2.8), marble);
      capAbacus.position.y = 1.9;
      capGroup.add(capAbacus);

      pavGroup.add(capGroup);

      // Pierced Crystal Balustrade between outer bays (leaving front north entrance clear)
      if (c !== 3) {
        const nextAng = ((c + 1) / numCols) * Math.PI * 2 + Math.PI / 8;
        const midAng = (ang + nextAng) / 2;
        const mx = Math.cos(midAng) * 14.2;
        const mz = Math.sin(midAng) * 14.2;

        const balRail = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.55, 1.0), marble);
        balRail.position.set(mx, 5.2, mz);
        balRail.rotation.y = -midAng + Math.PI / 2;
        pavGroup.add(balRail);

        for (let b = -1; b <= 1; b++) {
          const balX = mx + Math.cos(midAng + Math.PI / 2) * (b * 1.1);
          const balZ = mz + Math.sin(midAng + Math.PI / 2) * (b * 1.1);
          const crystalBal = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.8, 8), crystalColMat);
          crystalBal.position.set(balX, 3.8, balZ);
          pavGroup.add(crystalBal);
        }
      }
    }

    // Circular Carrara Marble Entablature & Frieze
    const entRing = new THREE.Mesh(new THREE.TorusGeometry(14.2, 0.95, 16, 48), marble);
    entRing.rotation.x = Math.PI / 2;
    entRing.position.y = 16.2;
    pavGroup.add(entRing);

    const goldEntBand = new THREE.Mesh(new THREE.TorusGeometry(14.3, 0.24, 8, 48), gold);
    goldEntBand.rotation.x = Math.PI / 2;
    goldEntBand.position.y = 16.8;
    pavGroup.add(goldEntBand);

    // Crystalline Dome with 8 Gilded Meridian Tracery Ribs
    const domeMesh = new THREE.Mesh(new THREE.SphereGeometry(14.1, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.5), starlightOrbMat);
    domeMesh.position.y = 16.4;
    pavGroup.add(domeMesh);

    for (let r = 0; r < 8; r++) {
      const ribAng = (r / 8) * Math.PI;
      const rib = new THREE.Mesh(new THREE.TorusGeometry(14.15, 0.22, 8, 32, Math.PI), gold);
      rib.rotation.y = ribAng;
      rib.position.y = 16.4;
      pavGroup.add(rib);
    }

    // 24K Gold Starburst Crest Finial crowning the Dome Apex
    const domeApexStarburst = new THREE.Mesh(new THREE.OctahedronGeometry(2.2, 0), gold);
    domeApexStarburst.position.y = 30.6;
    pavGroup.add(domeApexStarburst);

    for (let ray = 0; ray < 8; ray++) {
      const ang = (ray / 8) * Math.PI * 2;
      const raySpike = new THREE.Mesh(new THREE.ConeGeometry(0.42, 3.8, 4), gold);
      raySpike.rotation.z = -ang + Math.PI / 2;
      raySpike.position.set(Math.cos(ang) * 2.8, 30.6 + Math.sin(ang) * 0.5, Math.sin(ang) * 2.8);
      pavGroup.add(raySpike);
    }

    // Front Inscribed Dedication Plaque (North pavilion entrance facing the valley and bridge approach)
    const plaqueGeo = new THREE.BoxGeometry(6.4, 1.1, 0.35);
    const plaque = new THREE.Mesh(plaqueGeo, gold);
    plaque.position.set(0, 3.2, -14.2);
    pavGroup.add(plaque);

    // 3D Siberian Husky KAYA Monument (Standing proudly facing North out pavilion entrance toward the valley & Rainbow Bridge)
    const huskyKaya = this._buildHuskyMesh();
    huskyKaya.scale.setScalar(1.85);
    huskyKaya.position.set(0, 4.0, 0);
    huskyKaya.rotation.y = Math.PI; // Face North toward incoming drone approach at z = 2040
    huskyKaya.castShadow = true;
    pavGroup.add(huskyKaya);

    // Floral Lei Flower Tributes at the base of Kaya's plinth (Frangipani, Hibiscus, Marigolds)
    const leiColors = [0xff4081, 0xffd54f, 0xffffff, 0xff7043, 0xba68c8];
    for (let fl = 0; fl < 32; fl++) {
      const flAng = (fl / 32) * Math.PI * 2;
      const flRad = 5.2 + (fl % 3) * 0.45;
      const flMat = new THREE.MeshPhysicalMaterial({
        color: leiColors[fl % leiColors.length],
        roughness: 0.6,
        metalness: 0.05,
      });
      const flGeo = new THREE.SphereGeometry(0.35, 8, 6);
      flGeo.scale(1.0, 0.4, 1.0);
      const flower = new THREE.Mesh(flGeo, flMat);
      flower.position.set(Math.cos(flAng) * flRad, 3.22, Math.sin(flAng) * flRad);
      flower.rotation.set((fl % 5) * 0.15, flAng, (fl % 3) * 0.1);
      pavGroup.add(flower);
    }

    // Radiant Starlight Starburst Jewel suspended high in the pavilion dome ceiling (y = 16.5m), keeping Kaya fully visible and unobstructed
    const starJewelGroup = new THREE.Group();
    starJewelGroup.position.set(0, 16.5, 0);

    const mesmerizingOrbMat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        uniform float time;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vPosition = position;
          
          vec3 pos = position * (1.0 + 0.04 * sin(time * 1.5 + position.y * 3.0));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        uniform float time;

        vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
        float snoise(vec2 v) {
          const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
          vec2 i  = floor(v + dot(v, C.yy) );
          vec2 x0 = v -   i + dot(i, C.xx);
          vec2 i1;
          i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;
          i = mod(i, 289.0);
          vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
          vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
          m = m*m ;
          m = m*m ;
          vec3 x = 2.0 * fract(p * C.www) - 1.0;
          vec3 h = abs(x) - 0.5;
          vec3 ox = floor(x + 0.5);
          vec3 a0 = x - ox;
          m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
          vec3 g;
          g.x  = a0.x  * x0.x  + h.x  * x0.y;
          g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
        }

        void main() {
          vec2 uv0 = vUv;
          float n1 = snoise(uv0 * 4.0 + vec2(time * 0.3, time * 0.2));
          float n2 = snoise(uv0 * 8.0 - vec2(time * 0.1, time * 0.4));
          float energy = max(0.0, sin(n1 * 3.14 + n2 * 3.14));

          float runeNoise = snoise(uv0 * 15.0 + vec2(0.0, time * 0.15));
          float runes = smoothstep(0.82, 0.86, abs(runeNoise)) * smoothstep(0.0, 0.2, sin(uv0.y * 40.0 + time * 3.0));
          
          float fresnel = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 1.5);

          vec3 baseColor = vec3(0.05, 0.4, 0.85);
          vec3 energyColor = vec3(0.3, 0.85, 1.0);
          vec3 runeColor = vec3(1.0, 0.95, 0.4);
          
          vec3 finalColor = baseColor + (energy * energyColor) + (runes * runeColor * 2.5) + (fresnel * vec3(0.2, 0.6, 1.0));
          
          gl_FragColor = vec4(finalColor, 0.92);
        }
      `,
      transparent: true, logarithmicDepthBuffer: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const starJewelCore = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 16), mesmerizingOrbMat);
    starJewelCore.castShadow = true;
    starJewelGroup.add(starJewelCore);
    
    if (!this._kayaShaders) this._kayaShaders = [];
    this._kayaShaders.push(mesmerizingOrbMat);

    // Inner swirling energy sphere
    const energyInnerGeo = new THREE.SphereGeometry(1.2, 32, 32);
    const energyInnerMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        uniform float time;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vec3 pos = position;
          pos.x += sin(time * 2.5 + pos.y * 5.0) * 0.08;
          pos.z += cos(time * 2.5 + pos.x * 5.0) * 0.08;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        uniform float time;
        void main() {
          float glow = abs(sin(vUv.x * 25.0 + time * 4.0) * cos(vUv.y * 25.0 - time * 3.5));
          vec3 col = mix(vec3(0.0, 0.6, 1.0), vec3(0.8, 0.3, 0.9), glow);
          float fresnel = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
          gl_FragColor = vec4(col * (glow + fresnel * 1.5), 0.7);
        }
      `,
      transparent: true, logarithmicDepthBuffer: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const energyInner = new THREE.Mesh(energyInnerGeo, energyInnerMat);
    starJewelGroup.add(energyInner);
    this._kayaShaders.push(energyInnerMat);

    const starJewelRing = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.12, 16, 48), gold);
    starJewelRing.rotation.x = Math.PI / 2;
    starJewelGroup.add(starJewelRing);

    for (let r = 0; r < 8; r++) {
      const rAng = (r / 8) * Math.PI * 2;
      const ray = new THREE.Mesh(new THREE.ConeGeometry(0.18, 2.2, 8), gold);
      ray.rotation.z = -rAng + Math.PI / 2;
      ray.position.set(Math.cos(rAng) * 2.1, Math.sin(rAng) * 0.1, Math.sin(rAng) * 2.1);
      starJewelGroup.add(ray);
    }
    pavGroup.add(starJewelGroup);

    // Rotating Celestial Constellation Stardust Ring suspended high around the Starlight Jewel
    const stardustCount = 128;
    const stardustGeo = new THREE.BufferGeometry();
    const stardustPos = new Float32Array(stardustCount * 3);
    const stardustSizes = new Float32Array(stardustCount);
    for (let st = 0; st < stardustCount; st++) {
      const sAng = (st / stardustCount) * Math.PI * 2;
      const sRad = 4.8 + Math.sin(st * 3.7) * 1.5;
      stardustPos[st * 3] = Math.cos(sAng) * sRad;
      stardustPos[st * 3 + 1] = 16.5 + Math.sin(sAng * 4.0) * 1.2;
      stardustPos[st * 3 + 2] = Math.sin(sAng) * sRad;
      stardustSizes[st] = Math.random();
    }
    stardustGeo.setAttribute('position', new THREE.BufferAttribute(stardustPos, 3));
    stardustGeo.setAttribute('aSize', new THREE.BufferAttribute(stardustSizes, 1));
    const stardustMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `
        uniform float time;
        attribute float aSize;
        varying float vAlpha;
        void main() {
          vec3 pos = position;
          float angle = time * 0.6;
          float x = pos.x * cos(angle) - pos.z * sin(angle);
          float z = pos.x * sin(angle) + pos.z * cos(angle);
          pos.x = x; pos.z = z;
          
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = (15.0 * aSize + 5.0) * (10.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
          vAlpha = 0.5 + 0.5 * sin(time * 3.0 + aSize * 10.0);
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          vec2 coord = gl_PointCoord - vec2(0.5);
          if (length(coord) > 0.5) discard;
          gl_FragColor = vec4(0.4, 0.9, 1.0, vAlpha * 0.85);
        }
      `,
      transparent: true, logarithmicDepthBuffer: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const stardustPoints = new THREE.Points(stardustGeo, stardustMat);
    pavGroup.add(stardustPoints);
    this._kayaStardust = stardustPoints;
    this._kayaShaders.push(stardustMat);

    // Celestial Core Beacon Light (Casting radiant light from the high dome ceiling over Kaya and the pavilion)
    const beaconLight = new THREE.PointLight(0x40c4ff, 5.0, 200);
    beaconLight.position.set(0, 16.5, 0);
    pavGroup.add(beaconLight);

    g.add(pavGroup);

    // 2. THE MONUMENTAL TEMPLE OF BAAL (Elevated Sea-cliff bluff at x=-110, z=2160, y=22.0)
    const tx = -110, tz = 2160;
    const ty = terrainHeight(tx, tz);
    const templeGroup = new THREE.Group();
    templeGroup.position.set(tx, ty, tz); // perfectly grounded foundation




    const ancientTravertine = material('weatheredTravertine', { repeat: 2.5, color: 0x9c9284, roughness: 0.9, metalness: 0.0, normalScale: 2.5, aoMapIntensity: 1.8 });
    const cedarWood = material('timber', { repeat: 1.5, color: 0x3d2416, roughness: 0.8, metalness: 0.0, normalScale: 1.5 });
    const templeBronze = material('bronze', { repeat: 1.2, color: 0x8a6e45, roughness: 0.4, metalness: 0.85, physical: true, clearcoat: 0.2, clearcoatRoughness: 0.5 });
    const sunGold = Surfaces.gold(1.0);
    const blackGranite = material('granite', { repeat: 1.8, color: 0x12100e, roughness: 0.2, metalness: 0.05, physical: true, clearcoat: 0.5, clearcoatRoughness: 0.3, normalScale: 1.2 });
    const tyrianPurple = new THREE.MeshPhysicalMaterial({ color: 0x4a0515, roughness: 0.85, metalness: 0.05 });
    const fireEmberMat = new THREE.MeshBasicMaterial({ color: 0xff5500 });
    const fireFlameMat = new THREE.MeshBasicMaterial({ color: 0xffbb22 });
    const sunGlowMat = new THREE.MeshPhysicalMaterial({ color: 0xffd700, emissive: 0xffaa24, emissiveIntensity: 1.8, roughness: 0.2, metalness: 0.8 });

    const travertineGeoms = [];
    const woodGeoms = [];
    const bronzeGeoms = [];
    const goldGeoms = [];
    const graniteGeoms = [];
    const purpleGeoms = [];
    const emberGeoms = [];
    const flameGeoms = [];
    const glowGeoms = [];

    // Monumental 3-Tiered Megalithic Ashlar Plinth
    const plinthLowerGeo = new THREE.BoxGeometry(36, 1.6, 50);
    plinthLowerGeo.translate(0, 0.8, 0);
    travertineGeoms.push(plinthLowerGeo);

    const plinthMidGeo = new THREE.BoxGeometry(32, 1.4, 46);
    plinthMidGeo.translate(0, 2.3, 0);
    travertineGeoms.push(plinthMidGeo);

    const plinthUpperGeo = new THREE.BoxGeometry(28, 1.2, 42);
    plinthUpperGeo.translate(0, 3.6, 0);
    travertineGeoms.push(plinthUpperGeo);

    // Grand Ceremonial Approach Staircase at Front (z = +20)
    const stepCount = 14;
    for (let s = 0; s < stepCount; s++) {
      const stepGeo = new THREE.BoxGeometry(18, 0.35, 1.4);
      stepGeo.translate(0, 0.18 + s * 0.30, 27.5 - s * 0.75);
      travertineGeoms.push(stepGeo);
    }

    // Colossal Megalithic Colonnade (12 Fluted Columns of Baal with Carved Lotus/Palm Capitals)
    const colGeo = new THREE.CylinderGeometry(0.85, 1.1, 12.0, 16);
    const capGeo = new THREE.BoxGeometry(2.6, 1.0, 2.6);
    const colPositions = [
      [-10.5, -18], [10.5, -18],
      [-10.5, -10], [10.5, -10],
      [-10.5, -2],  [10.5, -2],
      [-10.5, 6],   [10.5, 6],
      [-10.5, 14],  [10.5, 14],
      [-10.5, 20],  [10.5, 20], // Extended colonnade
    ];
    colPositions.forEach(([cx, cz]) => {
      const cGeo = colGeo.clone();
      cGeo.translate(cx, 4.2 + 6.0, cz);
      travertineGeoms.push(cGeo);

      const cg = capGeo.clone();
      cg.translate(cx, 4.2 + 12.5, cz);
      travertineGeoms.push(cg);

      const goldTrim = new THREE.BoxGeometry(2.8, 0.3, 2.8);
      goldTrim.translate(cx, 4.2 + 13.0, cz);
      goldGeoms.push(goldTrim);
    });

    // Megalithic Cella Perimeter Walls
    const wallLGeo = new THREE.BoxGeometry(1.6, 12.0, 32);
    wallLGeo.translate(-11.5, 4.2 + 6.0, -2);
    travertineGeoms.push(wallLGeo);

    const wallRGeo = new THREE.BoxGeometry(1.6, 12.0, 32);
    wallRGeo.translate(11.5, 4.2 + 6.0, -2);
    travertineGeoms.push(wallRGeo);

    const wallBackGeo = new THREE.BoxGeometry(24.6, 12.0, 1.6);
    wallBackGeo.translate(0, 4.2 + 6.0, -17.2);
    travertineGeoms.push(wallBackGeo);

    // Gabled Heavy Cedar Timber Truss Roof
    const roofLGeo = new THREE.BoxGeometry(18.5, 1.2, 50);
    roofLGeo.rotateZ(0.40);
    roofLGeo.translate(-7.2, 4.2 + 12.0 + 3.8, 0);
    woodGeoms.push(roofLGeo);

    const roofRGeo = new THREE.BoxGeometry(18.5, 1.2, 50);
    roofRGeo.rotateZ(-0.40);
    roofRGeo.translate(7.2, 4.2 + 12.0 + 3.8, 0);
    woodGeoms.push(roofRGeo);

    // Stone Tympanum Pediment with Winged Sun Disc of Baal Shamin
    const tympShape = new THREE.Shape();
    tympShape.moveTo(-13.5, 0);
    tympShape.lineTo(13.5, 0);
    tympShape.lineTo(0, 6.0);
    tympShape.closePath();
    const tympGeo = new THREE.ExtrudeGeometry(tympShape, { depth: 1.2, bevelEnabled: false });
    
    const tympFrontGeo = tympGeo.clone();
    tympFrontGeo.translate(0, 4.2 + 12.0, 22.8);
    travertineGeoms.push(tympFrontGeo);

    // Front Winged Sun Disc Emblem (keeps individual mesh to reuse group builder)
    const sunDiscFront = this._buildWingedSunDisc();
    sunDiscFront.position.set(0, 4.2 + 12.0 + 2.5, 24.1);
    sunDiscFront.scale.setScalar(1.5);
    templeGroup.add(sunDiscFront);

    const tympBackGeo = tympGeo.clone();
    tympBackGeo.translate(0, 4.2 + 12.0, -19.2);
    travertineGeoms.push(tympBackGeo);

    // Dual Ceremonial Pillars of Sun & Fire (Hammanim) at Entrance Portico
    for (const px of [-9.5, 9.5]) {
      const pBase = new THREE.BoxGeometry(2.6, 1.5, 2.6);
      pBase.translate(px, 4.2 + 0.75, 23.5);
      bronzeGeoms.push(pBase);

      const pShaft = new THREE.CylinderGeometry(0.65, 0.85, 13.0, 10);
      pShaft.translate(px, 4.2 + 1.5 + 6.5, 23.5);
      bronzeGeoms.push(pShaft);

      const pCap = new THREE.SphereGeometry(1.3, 16, 12);
      pCap.translate(px, 4.2 + 14.5, 23.5);
      glowGeoms.push(pCap);
    }

    // 1. SACRED HORNED BRONZE BULL ALTAR (Center Court, z = -2)
    const altarBaseGeo = new THREE.BoxGeometry(7.0, 1.5, 4.2);
    altarBaseGeo.translate(0, 4.2 + 0.75, -2);
    graniteGeoms.push(altarBaseGeo);

    const bronzeBull = this._buildBronzeBull();
    bronzeBull.position.set(0, 4.2 + 1.5, -2);
    bronzeBull.rotation.y = -Math.PI * 0.72; // Heroic 3/4 diagonal stance showing full muscular profile & horns
    bronzeBull.scale.setScalar(1.5);
    templeGroup.add(bronzeBull);

    // Interactive Bronze Offering Bowl
    const offeringBowlGroup = new THREE.Group();
    offeringBowlGroup.position.set(0, 4.2 + 0.75, 1.5);
    
    const offeringBowlGeo = new THREE.CylinderGeometry(1.0, 0.5, 0.6, 16);
    offeringBowlGeo.translate(0, 0.3, 0);
    bronzeGeoms.push(offeringBowlGeo.clone().translate(0, 4.2 + 0.75, 1.5));
    
    const offeringHitbox = new THREE.Mesh(new THREE.BoxGeometry(4, 5, 4), new THREE.MeshBasicMaterial({ visible: false }));
    offeringHitbox.position.set(0, 4.2 + 2.0, 1.5);
    offeringHitbox.userData = { action: 'donation_temple_baal', label: 'Place an Offering at the Great Altar' };
    this.world.pickables.push(offeringHitbox);
    templeGroup.add(offeringHitbox);

    // 2. DUAL ROARING ETERNAL FIRE BRAZIERS (Flanking Bull Altar at x = -7.5 and +7.5)
    for (const fx of [-7.5, 7.5]) {
      const brazierTripod = new THREE.CylinderGeometry(0.25, 0.45, 2.6, 8);
      brazierTripod.translate(fx, 4.2 + 1.3, -2);
      bronzeGeoms.push(brazierTripod);

      const cauldron = new THREE.SphereGeometry(1.5, 16, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
      cauldron.rotateX(Math.PI);
      cauldron.translate(fx, 4.2 + 2.6, -2);
      bronzeGeoms.push(cauldron);

      // Glowing Fire Embers
      const emberBed = new THREE.CylinderGeometry(1.2, 0.9, 0.5, 12);
      emberBed.translate(fx, 4.2 + 2.5, -2);
      emberGeoms.push(emberBed);

      // Roaring Flame Core
      const flameCore = new THREE.ConeGeometry(0.9, 2.2, 10);
      flameCore.translate(fx, 4.2 + 3.6, -2);
      flameGeoms.push(flameCore);
    }

    // 3. COLOSSAL CULT STATUE OF BAAL HADAD (Inner Adyton Sanctum, z = -13.5)
    const baalDaisGeo = new THREE.BoxGeometry(10.0, 2.0, 6.0);
    baalDaisGeo.translate(0, 4.2 + 1.0, -13.5);
    graniteGeoms.push(baalDaisGeo);

    const baalIdol = this._buildBaalIdol();
    baalIdol.position.set(0, 4.2 + 2.0, -13.5);
    baalIdol.scale.setScalar(1.8);
    templeGroup.add(baalIdol);

    // Tyrian Purple Sanctuary Banners flanking Baal
    for (const bx of [-6.2, 6.2]) {
      const bannerGeo = new THREE.PlaneGeometry(3.2, 10.0);
      bannerGeo.translate(bx, 4.2 + 7.0, -16.0);
      purpleGeoms.push(bannerGeo);
    }

    // 4. Interior Cella Bronze Torch Sconces
    const torchZ = [-11, -3, 5, 13];
    for (const tz of torchZ) {
      for (const tx of [-10.6, 10.6]) {
        const sconce = new THREE.CylinderGeometry(0.15, 0.1, 1.5, 8);
        sconce.rotateZ((tx < 0 ? 1 : -1) * 0.35);
        sconce.translate(tx, 4.2 + 5.8, tz);
        bronzeGeoms.push(sconce);

        const flame = new THREE.ConeGeometry(0.25, 0.7, 6);
        flame.translate(tx + (tx < 0 ? 0.3 : -0.3), 4.2 + 6.6, tz);
        flameGeoms.push(flame);
      }
    }

    // --- Merge and add meshes ---
    const buildMerged = (geoms, mat, shadow = true) => {
      if (geoms.length === 0) return;
      const merged = safeMerge(geoms, false);
      if (merged) {
        const mesh = new THREE.Mesh(merged, mat);
        if (shadow) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
        templeGroup.add(mesh);
      }
    };

    buildMerged(travertineGeoms, ancientTravertine);
    buildMerged(woodGeoms, cedarWood);
    buildMerged(bronzeGeoms, templeBronze);
    buildMerged(goldGeoms, sunGold);
    buildMerged(graniteGeoms, blackGranite);
    buildMerged(purpleGeoms, tyrianPurple, false);
    buildMerged(emberGeoms, fireEmberMat, false);
    buildMerged(flameGeoms, fireFlameMat, false);
    buildMerged(glowGeoms, sunGlowMat, false);

    g.add(templeGroup);

    // 3. Island Stone Pathways connecting Coral Beach, Husky Beacon, and Temple
    const pathPoints = [
      new V3(ix + 85, terrainHeight(ix + 85, iz - 130) + 0.15, iz - 130), // Beach landing
      new V3(ix + 45, terrainHeight(ix + 45, iz - 65) + 0.15, iz - 65),
      new V3(ix, peakY + 0.2, iz),                                       // Guardian Husky Beacon
      new V3(ix - 55, terrainHeight(ix - 55, iz + 40) + 0.15, iz + 40),
      new V3(tx, ty + 0.2, tz),                                          // Jewish Temple
      new V3(tx - 35, terrainHeight(tx - 35, tz + 65) + 0.15, tz + 65),  // Sea-cliff overlook
    ];
    const pathCurve = new THREE.CatmullRomCurve3(pathPoints);
    const pathGeo = applyOrganicWeathering(new THREE.TubeGeometry(pathCurve, 80, 2.8, 8, false), 0.08, 0.22, 55);
    pathGeo.scale(1.0, 0.15, 1.0);
    bakeVertexCreviceOcclusion(pathGeo, peakY);
    const pathMesh = new THREE.Mesh(pathGeo, stone);
    pathMesh.receiveShadow = true;
    g.add(pathMesh);

    // 4. Glowing Sea-Lantern Posts along paths
    const lanternMat = new THREE.MeshPhysicalMaterial({
      color: 0xfff4d6, emissive: 0xffaa24, emissiveIntensity: 3.6, roughness: 0.1,
    });
    const lanternPositions = [
      { x: ix + 85, z: iz - 130 },
      { x: ix + 45, z: iz - 65 },
      { x: ix - 35, z: iz - 70 },
      { x: ix - 80, z: iz - 20 },
      { x: tx + 20, z: tz - 20 },
      { x: tx - 25, z: tz + 35 },
      { x: ix + 105, z: iz + 20 },
      { x: ix + 70,  z: iz + 95 },
    ];
    lanternPositions.forEach((lp) => {
      const ly = terrainHeight(lp.x, lp.z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 4.2, 8), Surfaces.bronze(1));
      post.position.set(lp.x, ly + 2.1, lp.z);
      post.castShadow = true;
      g.add(post);

      const lamp = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85, 0), lanternMat);
      lamp.position.set(lp.x, ly + 4.6, lp.z);
      g.add(lamp);
    });

    // 5. Dense Multi-Layered Tropical Rainforest & Flora System
    const tmp = new THREE.Object3D();
    const palmTrunks = [], palmCrowns = [];
    const bananaTrunks = [], bananaCrowns = [];
    const monsteraMatrices = [], fernMatrices = [];
    const rngJ = mulberry32(882211);

    for (let p = 0; p < 380; p++) {
      const ang = rngJ() * Math.PI * 2;
      const rad = 16 + Math.pow(rngJ(), 0.70) * 280;
      const px = ix + Math.cos(ang) * rad;
      const pz = iz + Math.sin(ang) * rad;
      const py = terrainHeight(px, pz);
      if (py < WORLD.waterLevel + 0.6 || py > peakY + 12) continue;
      if (Math.hypot(px - ix, pz - iz) < 22 || Math.hypot(px - tx, pz - tz) < 24) continue;

      const isCoastal = py < 4.5 || rad > 180;
      const scale = 0.85 + rngJ() * 0.60;
      tmp.position.set(px, py, pz);
      tmp.rotation.y = rngJ() * Math.PI * 2;

      if (isCoastal) {
        const leanAngle = 0.22 + rngJ() * 0.32;
        const leanDir = Math.atan2(pz - iz, px - ix);
        tmp.rotation.x = Math.sin(leanDir) * leanAngle;
        tmp.rotation.z = -Math.cos(leanDir) * leanAngle;
      } else {
        tmp.rotation.x = (rngJ() - 0.5) * 0.14;
        tmp.rotation.z = (rngJ() - 0.5) * 0.14;
      }
      tmp.scale.setScalar(scale);
      tmp.updateMatrix();

      const roll = rngJ();
      if (roll < 0.45 || isCoastal) {
        palmTrunks.push(tmp.matrix.clone());
        palmCrowns.push(tmp.matrix.clone());
      } else if (roll < 0.72) {
        bananaTrunks.push(tmp.matrix.clone());
        bananaCrowns.push(tmp.matrix.clone());
      } else if (roll < 0.88) {
        monsteraMatrices.push(tmp.matrix.clone());
      } else {
        fernMatrices.push(tmp.matrix.clone());
      }
    }

    // 5a. Curved Segmented Coconut Palms with Flared Base & 74 Curved Pinnate Fronds
    const createCurvedFrondGeo = (w, h, curveDepth = 0.45) => {
      const geo = new THREE.PlaneGeometry(w, h, 2, 2);
      const cpos = geo.attributes.position;
      for (let i = 0; i < cpos.count; i++) {
        const x = cpos.getX(i), y = cpos.getY(i);
        const u = x / (w * 0.5), v = y / (h * 0.5);
        cpos.setZ(i, (1.0 - u * u) * curveDepth * (1.0 - v * 0.35) + (1.0 - v * v) * curveDepth * 0.25);
      }
      geo.computeVertexNormals();
      return geo;
    };

    const palmTrunkGeo = (() => {
      const parts = [];
      const base = new THREE.CylinderGeometry(0.75, 1.35, 2.2, 10);
      base.translate(0, 1.1, 0);
      parts.push(base);

      const segCount = 8;
      for (let s = 0; s < segCount; s++) {
        const frac = s / segCount;
        const r1 = 0.75 * (1.0 - frac * 0.38);
        const r2 = 0.75 * (1.0 - ((s + 1) / segCount) * 0.38);
        const seg = new THREE.CylinderGeometry(r2, r1, 1.45, 8);
        const curveX = Math.sin(frac * Math.PI * 0.75) * 0.85;
        const curveZ = Math.cos(frac * Math.PI * 0.65) * 0.55;
        seg.translate(curveX, 2.2 + s * 1.4 + 0.72, curveZ);
        parts.push(seg);
      }
      return safeMerge(parts, false) || base;
    })();

    const palmCrownGeo = (() => {
      const parts = [];
      // Tier 1: Upright emerging inner heart spear fronds (10 fronds)
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2 + 0.1;
        const sRad = 2.2;
        const droop = -0.50;
        const q = createCurvedFrondGeo(2.6, 4.8, 0.42);
        q.rotateX(droop);
        q.rotateY(ang);
        q.translate(Math.cos(ang) * sRad, 13.5 + 2.6, Math.sin(ang) * sRad);
        parts.push(q);
      }
      // Tier 2: Mid arching spreading fronds (16 fronds, 2 segments each = 32 cards)
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        for (let s = 0; s < 2; s++) {
          const frac = s / 2;
          const sRad = 1.8 + frac * 5.2;
          const droop = 0.22 + frac * 1.18;
          const q = createCurvedFrondGeo(3.2 * (1.0 - frac * 0.28), 4.6, 0.50);
          q.rotateX(droop);
          q.rotateY(ang);
          q.translate(Math.cos(ang) * sRad, 13.5 + 1.6 - Math.sin(droop) * 2.8, Math.sin(ang) * sRad);
          parts.push(q);
        }
      }
      // Tier 3: Lower drooping weeping mature fronds (12 fronds, 2 segments each = 24 cards)
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2 + 0.25;
        for (let s = 0; s < 2; s++) {
          const frac = s / 2;
          const sRad = 2.4 + frac * 4.6;
          const droop = 0.72 + frac * 0.85;
          const q = createCurvedFrondGeo(2.8 * (1.0 - frac * 0.25), 4.4, 0.52);
          q.rotateX(droop);
          q.rotateY(ang);
          q.translate(Math.cos(ang) * sRad, 13.5 - 0.6 - Math.sin(droop) * 2.4, Math.sin(ang) * sRad);
          parts.push(q);
        }
      }
      // Tier 4: Skirt fronds draping along trunk collar (8 fronds)
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + 0.4;
        const sRad = 2.8;
        const droop = 1.35;
        const q = createCurvedFrondGeo(2.4, 3.8, 0.45);
        q.rotateX(droop);
        q.rotateY(ang);
        q.translate(Math.cos(ang) * sRad, 13.5 - 2.4, Math.sin(ang) * sRad);
        parts.push(q);
      }
      return safeMerge(parts, false) || parts[0];
    })();

    // 5b. Broadleaf Banana Palms (Musa)
    const bananaTrunkGeo = new THREE.CylinderGeometry(0.35, 0.65, 7.5, 8);
    bananaTrunkGeo.translate(0, 3.75, 0);

    const bananaCrownGeo = (() => {
      const leaves = [];
      for (let l = 0; l < 6; l++) {
        const lAng = (l / 6) * Math.PI * 2;
        const leaf = new THREE.PlaneGeometry(2.8, 6.2);
        leaf.rotateX(0.55);
        leaf.rotateY(lAng);
        leaf.translate(Math.cos(lAng) * 2.2, 7.2, Math.sin(lAng) * 2.2);
        leaves.push(leaf);
      }
      return safeMerge(leaves, false) || leaves[0];
    })();

    // 5c. Giant Monstera Deliciosa & Tropical Understory
    const monsteraGeo = (() => {
      const parts = [];
      for (let m = 0; m < 5; m++) {
        const mAng = (m / 5) * Math.PI * 2;
        const leaf = new THREE.CircleGeometry(2.2, 8);
        leaf.rotateX(-Math.PI * 0.35);
        leaf.rotateY(mAng);
        leaf.translate(Math.cos(mAng) * 1.8, 1.2, Math.sin(mAng) * 1.8);
        parts.push(leaf);
      }
      return safeMerge(parts, false) || parts[0];
    })();

    // 5d. Bioluminescent Tropical Jungle Ferns
    const fernGeo = (() => {
      const parts = [];
      for (let f = 0; f < 6; f++) {
        const fAng = (f / 6) * Math.PI * 2;
        const frond = new THREE.PlaneGeometry(1.4, 3.8);
        frond.rotateX(0.45);
        frond.rotateY(fAng);
        frond.translate(Math.cos(fAng) * 1.2, 0.6, Math.sin(fAng) * 1.2);
        parts.push(frond);
      }
      return safeMerge(parts, false) || parts[0];
    })();

    const palmFrondMat = Surfaces.palmFrond(0xffffff);
    const bananaLeafMat = Surfaces.leafCard(0x4caf50);
    const monsteraMat = Surfaces.leafCard(0x2e7d32);
    const fernMat = new THREE.MeshPhysicalMaterial({
      color: 0x10b981, emissive: 0x059669, emissiveIntensity: 0.65, roughness: 0.4, alphaTest: 0.5, side: THREE.DoubleSide,
    });

    if (this.world._windMaterials) {
      this.world._windMaterials.push(palmFrondMat, bananaLeafMat, monsteraMat, fernMat);
    }

    const inst = (geo, mat, mats, castShadow = true) => {
      if (!mats.length) return;
      if (geo.computeBoundingSphere) geo.computeBoundingSphere();
      const m = new THREE.InstancedMesh(geo, mat, mats.length);
      mats.forEach((mx, i) => m.setMatrixAt(i, mx));
      m.instanceMatrix.needsUpdate = true;
      if (typeof m.computeBoundingSphere === 'function') m.computeBoundingSphere();
      if (typeof m.computeBoundingBox === 'function') m.computeBoundingBox();
      m.castShadow = castShadow;
      m.receiveShadow = true;
      m.frustumCulled = false;
      g.add(m);
    };

    inst(palmTrunkGeo, palmBark, palmTrunks, true);
    inst(palmCrownGeo, palmFrondMat, palmCrowns, true);
    inst(bananaTrunkGeo, Surfaces.bark(1.2), bananaTrunks, true);
    inst(bananaCrownGeo, bananaLeafMat, bananaCrowns, true);
    inst(monsteraGeo, monsteraMat, monsteraMatrices, true);
    inst(fernGeo, fernMat, fernMatrices, false);

    this.world.scene.add(g);
  }

  _highlandSanctuary() {
    const g = new THREE.Group();
    const stone = Surfaces.flagstone(2.5);
    const marble = Surfaces.marble(1.5);
    const bronze = Surfaces.bronze(1.0);

    // 1. Grand Cataract Overlook Promenade (z = -460, x = 0, y = 182.0m)
    const plateauY = 182.0;
    const terraceGeo = new THREE.BoxGeometry(110, 1.6, 42);
    const terrace = new THREE.Mesh(terraceGeo, stone);
    terrace.position.set(0, plateauY + 0.8, -475);
    terrace.receiveShadow = terrace.castShadow = true;
    g.add(terrace);

    // Carved Stone Balustrade along the waterfall edge (z = -455)
    for (let b = -48; b <= 48; b += 4) {
      if (Math.abs(b) < 16) continue; // Cataract chute gap
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 1.4, 8), marble);
      post.position.set(b, plateauY + 1.6 + 0.7, -455);
      post.castShadow = true;
      g.add(post);
    }
    const railGeo = new THREE.BoxGeometry(32, 0.35, 0.45);
    const railL = new THREE.Mesh(railGeo, marble);
    railL.position.set(-32, plateauY + 2.9, -455);
    g.add(railL);
    const railR = new THREE.Mesh(railGeo, marble);
    railR.position.set(32, plateauY + 2.9, -455);
    g.add(railR);

    // 2. Ceremonial Grand Walkway leading to the Cathedral (z = -490 to -600, connecting directly to Cathedral steps)
    const avenueGeo = new THREE.BoxGeometry(22, 1.2, 110);
    const avenue = new THREE.Mesh(avenueGeo, stone);
    avenue.position.set(0, plateauY + 0.6, -545);
    avenue.receiveShadow = true;
    g.add(avenue);

    // Flanking Bronze Lantern Posts
    const lanternMat = new THREE.MeshPhysicalMaterial({
      color: 0xfff4d6, emissive: 0xffaa24, emissiveIntensity: 3.5, roughness: 0.1,
    });
    for (let lz = -475; lz >= -585; lz -= 28) {
      [-12, 12].forEach(lx => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 4.5, 8), bronze);
        post.position.set(lx, plateauY + 1.2 + 2.25, lz);
        post.castShadow = true;
        g.add(post);

        const lamp = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 0), lanternMat);
        lamp.position.set(lx, plateauY + 1.2 + 4.8, lz);
        g.add(lamp);
      });
    }

    this.world.scene.add(g);
  }

  _universalCathedral() {
    const g = new THREE.Group();



    const cx = WORLD.cathedral.x, cz = WORLD.cathedral.z;
    const cy = terrainHeight(cx, cz); // ensure perfectly grounded foundation
    g.position.set(cx, cy, cz);

    // Master Material Palette
    const stone = Surfaces.agedCaenLimestone(14.0);
    // Enhanced photorealistic stone and ambient occlusion
    const darkStone = material('agedCaenLimestone', { repeat: 12.0, color: 0x847966, roughness: 0.86, metalness: 0.02, normalScale: 2.0, aoMapIntensity: 1.65 });
    // Enhanced weathered copper
    const copperRoof = material('weatheredVerdigrisBronze', { repeat: 4.0, color: 0x347060, roughness: 0.25, metalness: 0.9, physical: true, clearcoat: 0.35, clearcoatRoughness: 0.45, normalScale: 1.5 });
    const slateRoof = Surfaces.pagodaTile(4.0);
    // Enhanced celestially reflective bronze & gold
    const bronze = Surfaces.verdigrisBronze(1.4);
    const gold = Surfaces.gold(1.0);
//     gold.color.setHex(0xffd700);
//     gold.roughness = 0.15;
//     gold.clearcoat = 0.8;
//     gold.clearcoatRoughness = 0.1;
    const darkWood = Surfaces.wood(2.4);
    const marble = material('honedCarraraMarble', { repeat: 2.5, color: 0xffffff, roughness: 0.08, metalness: 0.0, physical: true, ior: 1.53, clearcoat: 1.0, clearcoatRoughness: 0.04, normalScale: 1.15, envMapIntensity: 2.0 });
    const stainedGlassRose = Surfaces.stainedGlassRose();
    const byzantineMosaic = Surfaces.byzantineMosaic(12.0); // Add mosaic

    
    // Multi-layer chromatic refraction and iridescent liquid glass
    const stainedGlassLancet = new THREE.MeshPhysicalMaterial({
      color: 0x1848a4,
      emissive: 0x2458d4,
      emissiveIntensity: 4.5,
      roughness: 0.08,
      metalness: 0.1,
      transparent: true, logarithmicDepthBuffer: true,
      opacity: 0.88,
      side: THREE.DoubleSide
    });
    const leadCame = new THREE.MeshPhysicalMaterial({ color: 0x101214, roughness: 0.75, metalness: 0.95 });

    // =========================================================================
    // 1. FOUNDATION PODIUM & CASCADING CEREMONIAL STAIRS (z = 44 to 62)
    // =========================================================================
    const lowerTerrace = new THREE.Mesh(new THREE.BoxGeometry(72, 4.0, 124), darkStone);
    lowerTerrace.position.set(0, -0.6, -4);
    lowerTerrace.receiveShadow = lowerTerrace.castShadow = true;
    g.add(lowerTerrace);

    const upperPodium = new THREE.Mesh(new THREE.BoxGeometry(60, 0.65, 110), stone);
    upperPodium.position.set(0, 1.725, -4);
    upperPodium.receiveShadow = upperPodium.castShadow = true;
    g.add(upperPodium);

    // Extended North Transept Terrace out to x = -48 for seamless drone approach
    const northTerracePlatform = new THREE.Mesh(new THREE.BoxGeometry(20, 4.0, 28), darkStone);
    northTerracePlatform.position.set(-40, -0.6, -4);
    northTerracePlatform.receiveShadow = northTerracePlatform.castShadow = true;
    g.add(northTerracePlatform);

    const northTerraceUpper = new THREE.Mesh(new THREE.BoxGeometry(18, 0.65, 24), stone);
    northTerraceUpper.position.set(-39, 1.725, -4);
    northTerraceUpper.receiveShadow = northTerraceUpper.castShadow = true;
    g.add(northTerraceUpper);

    // North Transept Step Approach (x = -48 down to mountain terrace)
    for (let st = 0; st < 6; st++) {
      const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.22, 16 - st * 1.2), stone);
      stepMesh.position.set(-47.2 - st * 0.8, 0.2 + st * 0.32, -4);
      stepMesh.receiveShadow = stepMesh.castShadow = true;
      g.add(stepMesh);
    }

    // Cascading Semicircular / Stepped Grand West Approach Stairs
    for (let st = 0; st < 10; st++) {
      const stepWidth = 44 - st * 1.6;
      const stepDepth = 2.0;
      const stepY = 0.2 + st * 0.20;
      const stepZ = 58 - st * 1.5;
      const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(stepWidth, 0.22, stepDepth), stone);
      stepMesh.position.set(0, stepY, stepZ);
      stepMesh.receiveShadow = stepMesh.castShadow = true;
      g.add(stepMesh);
    }

    // =========================================================================
    // 2. MONUMENTAL FRENCH GOTHIC WEST FACADE & TWIN BELL TOWERS (z = 41)
    // =========================================================================
    // Twin Western Bell Towers: Southwest (x = -20) and Southeast (x = +20)
    [-20, 20].forEach((tx, ti) => {
      const sign = tx > 0 ? 1 : -1;
      const towerGroup = new THREE.Group();
      towerGroup.position.set(tx, 2.0, 39);

      // --- Tier 1: Heavy Ashlar Base with Clustered Angle Buttresses (y = 0 to 22) ---
      const baseShaft = new THREE.Mesh(new THREE.BoxGeometry(13.6, 22, 13.6), stone);
      baseShaft.position.set(0, 11, 0);
      baseShaft.castShadow = baseShaft.receiveShadow = true;
      towerGroup.add(baseShaft);

      // Stepped Angle Buttress Projections on Exterior Corners
      [[-7.2, 7.2], [-7.2, -7.2], [7.2, 7.2], [7.2, -7.2]].forEach(([bx, bz]) => {
        const buttress = new THREE.Mesh(new THREE.BoxGeometry(2.4, 23, 2.4), stone);
        buttress.position.set(bx, 11.5, bz);
        buttress.castShadow = true;
        towerGroup.add(buttress);

        const buttressCap = new THREE.Mesh(new THREE.ConeGeometry(1.6, 4.0, 4), darkStone);
        buttressCap.position.set(bx, 24.5, bz);
        buttressCap.rotation.y = Math.PI / 4;
        buttressCap.castShadow = true;
        towerGroup.add(buttressCap);
      });

      // Molded Cornice Band Level 1
      const cornice1 = new THREE.Mesh(new THREE.BoxGeometry(14.8, 1.4, 14.8), darkStone);
      cornice1.position.set(0, 22.7, 0);
      cornice1.castShadow = true;
      towerGroup.add(cornice1);

      // --- Tier 2: Intermediate Blind Arcade & Statue Niches (y = 22 to 38) ---
      const midShaft = new THREE.Mesh(new THREE.BoxGeometry(12.8, 16, 12.8), stone);
      midShaft.position.set(0, 30.7, 0);
      midShaft.castShadow = midShaft.receiveShadow = true;
      towerGroup.add(midShaft);

      // Traceried Ashlar Lancet Niches & Sculpted Statues on Tower Faces
      [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach(ang => {
        const rad = 6.45;
        const nx = Math.sin(ang) * rad, nz = Math.cos(ang) * rad;

        // Recessed Dark Ashlar Niche Wall
        const nicheBack = new THREE.Mesh(new THREE.BoxGeometry(3.2, 10.5, 0.5), darkStone);
        nicheBack.position.set(nx, 30.8, nz);
        nicheBack.rotation.y = ang;
        towerGroup.add(nicheBack);

        // Molded Caen Limestone Bracket Corbel Base
        const nicheCorbel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 1.2), stone);
        nicheCorbel.position.set(nx + Math.sin(ang) * 0.35, 25.5, nz + Math.cos(ang) * 0.35);
        nicheCorbel.rotation.y = ang;
        nicheCorbel.castShadow = true;
        towerGroup.add(nicheCorbel);

        // Flanking Splayed Colonnettes with Molded Capitals
        [-1.45, 1.45].forEach(cx => {
          const colX = nx + Math.sin(ang) * 0.3 + Math.cos(ang) * cx;
          const colZ = nz + Math.cos(ang) * 0.3 - Math.sin(ang) * cx;
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.20, 10.0, 8), stone);
          col.position.set(colX, 30.5, colZ);
          col.castShadow = true;
          towerGroup.add(col);

          const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.16, 0.7, 8), darkStone);
          cap.position.set(colX, 35.5, colZ);
          towerGroup.add(cap);
        });

        // Pointed Gothic Molded Archivolt Arch & Trefoil Head
        const nicheArch = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.32, 8, 20, Math.PI), stone);
        nicheArch.position.set(nx + Math.sin(ang) * 0.3, 35.5, nz + Math.cos(ang) * 0.3);
        nicheArch.rotation.y = ang;
        towerGroup.add(nicheArch);

        // High Gothic Wimperg Gable Canopy & Crocket Finial
        const canopyGable = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.8, 4), stone);
        canopyGable.position.set(nx + Math.sin(ang) * 0.35, 37.6, nz + Math.cos(ang) * 0.35);
        canopyGable.rotation.y = ang + Math.PI / 4;
        canopyGable.castShadow = true;
        towerGroup.add(canopyGable);

        const canopyFinial = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 1), gold);
        canopyFinial.position.set(nx + Math.sin(ang) * 0.4, 39.2, nz + Math.cos(ang) * 0.4);
        towerGroup.add(canopyFinial);

        // Sculpted Caen Limestone Celestial Statuary Figure
        const statueBody = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 4.6, 8), stone);
        statueBody.position.set(nx + Math.sin(ang) * 0.25, 28.3, nz + Math.cos(ang) * 0.25);
        statueBody.castShadow = true;
        towerGroup.add(statueBody);

        const statueHead = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), stone);
        statueHead.position.set(nx + Math.sin(ang) * 0.25, 31.0, nz + Math.cos(ang) * 0.25);
        towerGroup.add(statueHead);

        const statueHalo = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 6, 16), gold);
        statueHalo.position.set(nx + Math.sin(ang) * 0.22, 31.2, nz + Math.cos(ang) * 0.22);
        statueHalo.rotation.y = ang;
        towerGroup.add(statueHalo);
      });

      // Molded Cornice Band Level 2
      const cornice2 = new THREE.Mesh(new THREE.BoxGeometry(13.8, 1.4, 13.8), darkStone);
      cornice2.position.set(0, 38.7, 0);
      cornice2.castShadow = true;
      towerGroup.add(cornice2);

      // --- Tier 3: Grand Belfry Stage with Open Gothic Louvers & Antique Bronze Bells (y = 38 to 70) ---
      const belfryPiers = new THREE.Mesh(new THREE.BoxGeometry(12.0, 30, 12.0), stone);
      belfryPiers.position.set(0, 53.7, 0);
      belfryPiers.castShadow = true;
      towerGroup.add(belfryPiers);

      // Open Louvered Arches on all 4 faces
      [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach(ang => {
        [-2.4, 2.4].forEach(lx => {
          const louverOpening = new THREE.Mesh(new THREE.BoxGeometry(2.0, 18, 1.2), darkWood);
          const rad = 6.1;
          louverOpening.position.set(
            Math.sin(ang) * rad + Math.cos(ang) * lx,
            53.5,
            Math.cos(ang) * rad - Math.sin(ang) * lx
          );
          louverOpening.rotation.y = ang;
          towerGroup.add(louverOpening);

          const louverArch = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.3, 8, 16, Math.PI), stone);
          louverArch.position.set(
            Math.sin(ang) * rad + Math.cos(ang) * lx,
            62.5,
            Math.cos(ang) * rad - Math.sin(ang) * lx
          );
          louverArch.rotation.y = ang;
          towerGroup.add(louverArch);
        });
      });

      // Visibly Suspended Cast Antique Bronze Cathedral Bell & Timber Yoke
      const bellYoke = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.8, 0.8), darkWood);
      bellYoke.position.set(0, 59.5, 0);
      towerGroup.add(bellYoke);

      const bellYokeStrapL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.0, 0.85), darkStone);
      bellYokeStrapL.position.set(-1.8, 59.5, 0);
      towerGroup.add(bellYokeStrapL);

      const bellYokeStrapR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.0, 0.85), darkStone);
      bellYokeStrapR.position.set(1.8, 59.5, 0);
      towerGroup.add(bellYokeStrapR);

      const bellDome = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 2.2, 3.4, 20), bronze);
      bellDome.position.set(0, 56.8, 0);
      bellDome.castShadow = true;
      towerGroup.add(bellDome);

      const bellRim = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.35, 12, 24), bronze);
      bellRim.rotation.x = Math.PI / 2;
      bellRim.position.set(0, 55.1, 0);
      towerGroup.add(bellRim);

      const clapper = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.28, 2.8, 8), darkStone);
      clapper.position.set(0, 55.6, 0);
      towerGroup.add(clapper);

      // --- Tier 4: Galerie des Chimères, Openwork Balustrade & Corner Tourelles (y = 70 to 76) ---
      const parapet = new THREE.Mesh(new THREE.BoxGeometry(13.2, 2.2, 13.2), stone);
      parapet.position.set(0, 69.8, 0);
      parapet.castShadow = true;
      towerGroup.add(parapet);

      const balustradeRail = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.6, 13.6), darkStone);
      balustradeRail.position.set(0, 71.7, 0);
      towerGroup.add(balustradeRail);

      // 4 Corner Gargoyle Water Spouts projecting from Balustrade
      [[-6.8, 6.8], [-6.8, -6.8], [6.8, 6.8], [6.8, -6.8]].forEach(([gx, gz]) => {
        const gargoyle = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 2.8), stone);
        const gAng = Math.atan2(gz, gx);
        gargoyle.position.set(gx + Math.cos(gAng) * 1.2, 70.8, gz + Math.sin(gAng) * 1.2);
        gargoyle.rotation.y = -gAng + Math.PI / 2;
        gargoyle.castShadow = true;
        towerGroup.add(gargoyle);
      });

      // 4 Corner Tourelle Pinnacles
      [[-5.8, 5.8], [-5.8, -5.8], [5.8, 5.8], [5.8, -5.8]].forEach(([px, pz]) => {
        const pinBase = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 6.0, 8), stone);
        pinBase.position.set(px, 74.3, pz);
        towerGroup.add(pinBase);

        const pinCone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5.5, 8), copperRoof);
        pinCone.position.set(px, 80.0, pz);
        towerGroup.add(pinCone);
      });

      // --- Tier 5: Soaring Octagonal High French Gothic Spire (y = 76 to 102m) ---
      const spireBaseOct = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 6.0, 5.0, 8), stone);
      spireBaseOct.position.set(0, 73.8, 0);
      spireBaseOct.castShadow = true;
      towerGroup.add(spireBaseOct);

      const spireNeedle = new THREE.Mesh(new THREE.ConeGeometry(5.4, 28.0, 8), copperRoof);
      spireNeedle.position.set(0, 90.3, 0);
      spireNeedle.castShadow = true;
      towerGroup.add(spireNeedle);

      // Crockets & Gable Dormers (Lucarnes) on the 4 cardinal faces of the Spire
      [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach(lang => {
        const lucarne = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3.8, 4), stone);
        lucarne.position.set(Math.sin(lang) * 4.2, 81.3, Math.cos(lang) * 4.2);
        lucarne.rotation.y = lang + Math.PI / 4;
        towerGroup.add(lucarne);
      });

      // Multifaceted Gilded Celestial Starburst Finial atop needle apex (y = 104.8m to 106.6m) — NO CROSS!
      const finialSphere = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 12), gold);
      finialSphere.position.set(0, 104.8, 0);
      towerGroup.add(finialSphere);

      const starburst = new THREE.Mesh(new THREE.IcosahedronGeometry(2.0, 1), gold);
      starburst.position.set(0, 106.6, 0);
      towerGroup.add(starburst);

      g.add(towerGroup);
    });

    // =========================================================================
    // 3. CENTRAL WEST FACADE BAY: OPEN TRIPLE PORTALS, GALERIE & GREAT ROSE WINDOW
    // =========================================================================
    // Upper Central Facade Wall (y = 14.5 to 39.0, leaving grand portal archway hollow below)
    const centralBayWallUpper = new THREE.Mesh(new THREE.BoxGeometry(26.4, 24.5, 2.2), stone);
    centralBayWallUpper.position.set(0, 26.75, 39.5);
    centralBayWallUpper.castShadow = centralBayWallUpper.receiveShadow = true;
    g.add(centralBayWallUpper);

    // Left Facade Pier Wall (x = -13.2 to -4.8, y = 2.0 to 14.5)
    const centralBayWallLeft = new THREE.Mesh(new THREE.BoxGeometry(8.4, 12.5, 2.2), stone);
    centralBayWallLeft.position.set(-9.0, 8.25, 39.5);
    centralBayWallLeft.castShadow = centralBayWallLeft.receiveShadow = true;
    g.add(centralBayWallLeft);

    // Right Facade Pier Wall (x = 4.8 to 13.2, y = 2.0 to 14.5)
    const centralBayWallRight = new THREE.Mesh(new THREE.BoxGeometry(8.4, 12.5, 2.2), stone);
    centralBayWallRight.position.set(9.0, 8.25, 39.5);
    centralBayWallRight.castShadow = centralBayWallRight.receiveShadow = true;
    g.add(centralBayWallRight);

    // Monumental Portal Header Lintel (Spanning over portal opening at y = 14.2)
    const portalLintel = new THREE.Mesh(new THREE.BoxGeometry(9.6, 1.2, 2.4), darkStone);
    portalLintel.position.set(0, 14.2, 39.5);
    portalLintel.castShadow = true;
    g.add(portalLintel);

    // Inner Vault Arch Lining above Grand Portal (apex at y = 14.2m)
    const portalInnerArch = new THREE.Mesh(new THREE.TorusGeometry(4.8, 0.45, 10, 24, Math.PI), stone);
    portalInnerArch.position.set(0, 9.4, 39.5);
    portalInnerArch.castShadow = true;
    g.add(portalInnerArch);

    // --- A. TRIPLE GRAND RECESSED PORTALS (z = 40.5 to 43.5) ---
    const portalGroup = new THREE.Group();
    portalGroup.position.set(0, 2.0, 40.6);

    // 1. Central Grand Portal of All Souls (Portail Central, x = 0) - Open Splayed Jamb Walls (Clear 6.8m span)
    const jambLeft = new THREE.Mesh(new THREE.BoxGeometry(1.6, 12.2, 2.4), darkStone);
    jambLeft.position.set(-4.2, 6.1, 0.8);
    jambLeft.rotation.y = 0.22;
    jambLeft.castShadow = jambLeft.receiveShadow = true;
    portalGroup.add(jambLeft);

    const jambRight = new THREE.Mesh(new THREE.BoxGeometry(1.6, 12.2, 2.4), darkStone);
    jambRight.position.set(4.2, 6.1, 0.8);
    jambRight.rotation.y = -0.22;
    jambRight.castShadow = jambRight.receiveShadow = true;
    portalGroup.add(jambRight);

    // Concentric Stepped Pointed Archivolts soaring overhead (y = 7.0 to 12.4 in portalGroup)
    [3.8, 4.4, 5.0, 5.6].forEach((rad, ri) => {
      const archivolt = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.42, 10, 28, Math.PI), stone);
      archivolt.position.set(0, 6.8, 0.4 + ri * 0.45);
      portalGroup.add(archivolt);
    });

    // Openwork Carved Tympanum Arch & Paradise Mandala Ring (Framing above doorway with ZERO solid blockage)
    const tympanumRing = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.28, 8, 32), stone);
    tympanumRing.position.set(0, 9.8, 0.7);
    portalGroup.add(tympanumRing);

    const tympanumEmblem = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.25, 8, 24), gold);
    tympanumEmblem.position.set(0, 9.8, 0.75);
    portalGroup.add(tympanumEmblem);

    // =========================================================================
    // AUTHENTIC FRENCH HIGH GOTHIC CARVED TWIN PORTAL DOORS (West Portal, z = 40.6 local)
    // Swung open at an inviting ~38° ceremonial angle with clear >6.0m drone passage
    // =========================================================================
    const bogOak = Surfaces.wood(3.0);
//     bogOak.color.setHex(0x241911); // Deep ancient bog-oak / dark walnut
//     bogOak.roughness = 0.82;
//     bogOak.metalness = 0.04;

    const forgedIron = new THREE.MeshPhysicalMaterial({ color: 0x141619, roughness: 0.65, metalness: 0.85 });

    const sculptedBronze = new THREE.MeshPhysicalMaterial({ color: 0x9c7a42, roughness: 0.35, metalness: 0.95, clearcoat: 0.35, clearcoatRoughness: 0.25 });

    // Twin Portal Doors: Left Leaf (sign = -1, hinge at x = -4.3) and Right Leaf (sign = 1, hinge at x = +4.3)
    [-1, 1].forEach((sign) => {
      const dir = -sign; // Inward towards doorway opening from hinge
      const doorGroup = new THREE.Group();
      // Anchor hinge pivot on stone portal jamb reveal
      doorGroup.position.set(sign * 4.3, 0, 0.35);
      // Swung open at natural ceremonial angle (~38°), leaving >6.0m clear central passage for drone
      doorGroup.rotation.y = sign * 0.66;

      // 1. Heavy Bog-Oak Main Door Slab (1.62m wide x 7.2m high x 0.22m thick)
      const doorSlab = new THREE.Mesh(new THREE.BoxGeometry(1.62, 7.2, 0.22), bogOak);
      doorSlab.position.set(dir * 0.81, 3.6, 0);
      doorSlab.castShadow = doorSlab.receiveShadow = true;
      doorGroup.add(doorSlab);

      // 2. Heavy Molded Framing Stiles & Rails
      // Outer hinge stile & meeting stile
      const stileHinge = new THREE.Mesh(new THREE.BoxGeometry(0.20, 7.2, 0.28), bogOak);
      stileHinge.position.set(dir * 0.10, 3.6, 0);
      stileHinge.castShadow = true;
      doorGroup.add(stileHinge);

      const stileMeeting = new THREE.Mesh(new THREE.BoxGeometry(0.20, 7.2, 0.28), bogOak);
      stileMeeting.position.set(dir * 1.52, 3.6, 0);
      stileMeeting.castShadow = true;
      doorGroup.add(stileMeeting);

      // Horizontal Rails: Bottom Kick Rail, Middle Lock Rail, and Top Header Rail
      [0.25, 3.6, 6.95].forEach((ry, rIndex) => {
        const railH = rIndex === 0 ? 0.50 : (rIndex === 1 ? 0.44 : 0.48);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(1.62, railH, 0.28), bogOak);
        rail.position.set(dir * 0.81, ry, 0);
        rail.castShadow = true;
        doorGroup.add(rail);
      });

      // 3. Recessed Blind Lancet Gothic Tracery Moldings (Front & Back Faces)
      [-0.12, 0.12].forEach((fz) => {
        // Lower & Upper Tracery Registers
        [
          { baseY: 0.55, h: 2.5, archY: 2.45 },
          { baseY: 3.90, h: 2.5, archY: 5.80 }
        ].forEach((reg) => {
          // Twin slender gothic lancets in each register
          [0.45, 1.17].forEach((lx) => {
            const lancetBack = new THREE.Mesh(new THREE.BoxGeometry(0.48, reg.h - 0.4, 0.04), darkStone);
            lancetBack.position.set(dir * lx, reg.baseY + (reg.h - 0.4) * 0.5, fz);
            doorGroup.add(lancetBack);

            // Torus pointed Gothic arch head
            const lancetArch = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 8, 16, Math.PI), bogOak);
            lancetArch.position.set(dir * lx, reg.archY, fz + (fz > 0 ? 0.02 : -0.02));
            doorGroup.add(lancetArch);

            // Trefoil cusps
            const cusp = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 6, 12), gold);
            cusp.position.set(dir * lx, reg.archY - 0.08, fz + (fz > 0 ? 0.025 : -0.025));
            doorGroup.add(cusp);
          });
        });

        // Carved Rosette Medallions in upper and lower spandrels
        [2.0, 5.4, 6.45].forEach((rosetteY) => {
          const rosetteRing = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.035, 8, 20), gold);
          rosetteRing.position.set(dir * 0.81, rosetteY, fz + (fz > 0 ? 0.02 : -0.02));
          doorGroup.add(rosetteRing);

          const rosetteBoss = new THREE.Mesh(new THREE.OctahedronGeometry(0.10, 1), sculptedBronze);
          rosetteBoss.position.set(dir * 0.81, rosetteY, fz + (fz > 0 ? 0.03 : -0.03));
          doorGroup.add(rosetteBoss);
        });

        // Pyramidal Antique Iron Clavos / Studs along framing stiles & rails
        [0.8, 1.6, 2.4, 3.2, 4.0, 4.8, 5.6, 6.4].forEach((sy) => {
          [0.10, 1.52].forEach((sx) => {
            const stud = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.04, 4), forgedIron);
            stud.position.set(dir * sx, sy, fz + (fz > 0 ? 0.025 : -0.025));
            stud.rotation.x = fz > 0 ? Math.PI / 2 : -Math.PI / 2;
            stud.rotation.z = Math.PI / 4;
            doorGroup.add(stud);
          });
        });
      });

      // 4. Monumental Hand-Forged Iron Strap Scrollwork Hinges (3 tiers: y = 1.2, 3.6, 5.8)
      [1.2, 3.6, 5.8].forEach((hy) => {
        // Hinge knuckle pintle on the jamb
        const pintle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.36, 12), forgedIron);
        pintle.position.set(0, hy, 0);
        pintle.castShadow = true;
        doorGroup.add(pintle);

        const jambPlate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.14), forgedIron);
        jambPlate.position.set(-dir * 0.06, hy, 0);
        doorGroup.add(jambPlate);

        [-0.13, 0.13].forEach((sz) => {
          // Horizontal forged iron strap
          const strap = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.13, 0.03), forgedIron);
          strap.position.set(dir * 0.71, hy, sz);
          strap.castShadow = true;
          doorGroup.add(strap);

          // Gothic bifurcated scrollwork flourishes (volutes branching off strap)
          const voluteUp = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.024, 8, 16, Math.PI * 1.3), forgedIron);
          voluteUp.position.set(dir * 0.92, hy + 0.16, sz);
          doorGroup.add(voluteUp);

          const voluteDn = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.024, 8, 16, Math.PI * 1.3), forgedIron);
          voluteDn.position.set(dir * 0.92, hy - 0.16, sz);
          voluteDn.rotation.x = Math.PI;
          doorGroup.add(voluteDn);

          // Arrowhead / Fleur-de-lis finial at strap terminus
          const tipFinial = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 4), forgedIron);
          tipFinial.position.set(dir * 1.45, hy, sz);
          tipFinial.rotation.z = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
          doorGroup.add(tipFinial);
        });
      });

      // 5. Sculpted Bronze Lion-Head Ring Knocker (Front face at ergonomic height y = 3.2m)
      const knockerGroup = new THREE.Group();
      knockerGroup.position.set(dir * 1.18, 3.2, 0.14);

      // Bronze Backplate Escutcheon
      const escutcheon = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.04, 16), sculptedBronze);
      escutcheon.rotation.x = Math.PI / 2;
      knockerGroup.add(escutcheon);

      // Sculpted Lion Head Boss
      const lionSkull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), sculptedBronze);
      lionSkull.scale.set(1.1, 0.95, 1.1);
      lionSkull.position.set(0, 0.04, 0.08);
      knockerGroup.add(lionSkull);

      const lionSnout = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.08, 0.09), sculptedBronze);
      lionSnout.position.set(0, -0.03, 0.16);
      knockerGroup.add(lionSnout);

      // Lion Mane Curls
      for (let m = 0; m < 8; m++) {
        const mAng = (m / 8) * Math.PI * 2;
        const maneCurl = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 4), sculptedBronze);
        maneCurl.rotation.z = -mAng + Math.PI / 2;
        maneCurl.position.set(Math.cos(mAng) * 0.16, Math.sin(mAng) * 0.16 + 0.02, 0.06);
        knockerGroup.add(maneCurl);
      }

      // Heavy Bronze Knocker Pendant Ring
      const knockerRing = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.038, 10, 20), sculptedBronze);
      knockerRing.position.set(0, -0.10, 0.16);
      knockerGroup.add(knockerRing);

      // Bronze Strike Anvil Stud
      const strikeStud = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), sculptedBronze);
      strikeStud.position.set(0, -0.25, 0.04);
      knockerGroup.add(strikeStud);

      doorGroup.add(knockerGroup);

      portalGroup.add(doorGroup);
    });

    // Sculpted Stepped Jamb Statues flanking the open portal threshold
    [-4.6, -3.8, 3.8, 4.6].forEach((jx) => {
      const jStatue = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 2.8, 8), stone);
      jStatue.position.set(jx, 2.8, 1.2 + Math.abs(jx) * 0.15);
      jStatue.castShadow = true;
      portalGroup.add(jStatue);

      const jCol = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 6.5, 8), darkStone);
      jCol.position.set(jx, 3.25, 1.0 + Math.abs(jx) * 0.15);
      portalGroup.add(jCol);

      const jCanopy = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.75, 6), stone);
      jCanopy.position.set(jx, 6.6, 1.2 + Math.abs(jx) * 0.15);
      portalGroup.add(jCanopy);
    });

    // High French Gothic Wimperg Gable Pediment soaring over Central Portal
    const wimpergGroup = new THREE.Group();
    wimpergGroup.position.set(0, 12.4, 1.8);

    const wimpergShape = new THREE.Shape();
    wimpergShape.moveTo(-5.6, 0);
    wimpergShape.lineTo(5.6, 0);
    wimpergShape.lineTo(0, 5.4);
    wimpergShape.closePath();
    const wimpergExtrude = new THREE.ExtrudeGeometry(wimpergShape, { depth: 0.9, bevelEnabled: false });
    const wimpergMesh = new THREE.Mesh(wimpergExtrude, stone);
    wimpergMesh.castShadow = true;
    wimpergGroup.add(wimpergMesh);

    // Molded Ashlar Raking Coping Cornices with Cascading Crockets
    [-1, 1].forEach(sign => {
      const rakeAngle = sign * 0.77;
      const coping = new THREE.Mesh(new THREE.BoxGeometry(0.45, 7.8, 1.1), darkStone);
      coping.position.set(sign * 2.8, 2.7, 0.45);
      coping.rotation.z = rakeAngle;
      coping.castShadow = true;
      wimpergGroup.add(coping);

      // Cascading Crockets along the pediment rake
      for (let cr = 1; cr <= 4; cr++) {
        const cFrac = cr / 5;
        const cx = sign * (5.4 * (1 - cFrac));
        const cy = 5.4 * cFrac;
        const crocket = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.8, 4), gold);
        crocket.position.set(cx + sign * 0.22, cy + 0.15, 0.6);
        crocket.rotation.z = -rakeAngle;
        wimpergGroup.add(crocket);
      }
    });

    // Relief Blind Trefoil Arcade & Medallion inside Tympanum
    const tympMedallion = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.16, 8, 24), gold);
    tympMedallion.position.set(0, 2.5, 0.95);
    wimpergGroup.add(tympMedallion);

    const tympEmblem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), gold);
    tympEmblem.position.set(0, 2.5, 1.0);
    wimpergGroup.add(tympEmblem);

    [-1.8, 1.8].forEach(lx => {
      const blindArch = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.12, 6, 16, Math.PI), stone);
      blindArch.position.set(lx, 1.1, 0.95);
      wimpergGroup.add(blindArch);
    });

    // Crocketed Gable Apex Pinnacle & Finial
    const apexPin = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.8, 8), darkStone);
    apexPin.position.set(0, 6.2, 0.45);
    apexPin.castShadow = true;
    wimpergGroup.add(apexPin);

    const wimpergFinial = new THREE.Mesh(new THREE.OctahedronGeometry(0.85, 1), gold);
    wimpergFinial.position.set(0, 7.8, 0.45);
    wimpergGroup.add(wimpergFinial);

    portalGroup.add(wimpergGroup);

    // 2. Flanking Left Portal (x = -9.2) & Right Portal (x = +9.2) — Also Open
    [-9.2, 9.2].forEach((px, pi) => {
      const sign = px > 0 ? 1 : -1;
      const sideDoor = new THREE.Mesh(new THREE.BoxGeometry(2.8, 4.4, 0.28), darkWood);
      sideDoor.position.set(px + sign * 0.8, 2.2, 0.2);
      sideDoor.rotation.y = sign * Math.PI * 0.40; // Swung open against side wall
      sideDoor.castShadow = true;
      portalGroup.add(sideDoor);

      [2.2, 2.8, 3.4].forEach((srad, si) => {
        const sideArchivolt = new THREE.Mesh(new THREE.TorusGeometry(srad, 0.32, 8, 20, Math.PI), stone);
        sideArchivolt.position.set(px, 3.8, 0.3 + si * 0.35);
        portalGroup.add(sideArchivolt);
      });

      const sideTympanum = new THREE.Mesh(new THREE.CircleGeometry(2.1, 16, 0, Math.PI), stone);
      sideTympanum.position.set(px, 4.4, 0.5);
      portalGroup.add(sideTympanum);

      [-1.8, 1.8].forEach(sjx => {
        const sideJamb = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 4.0, 8), stone);
        sideJamb.position.set(px + sjx, 2.0, 0.9);
        sideJamb.castShadow = true;
        portalGroup.add(sideJamb);
      });
    });

    g.add(portalGroup);

    // --- B. GALERIE DES ROIS / CELESTIAL STATUE FRIEZE (y = 19 to 23, z = 41.2) ---
    const galleryBase = new THREE.Mesh(new THREE.BoxGeometry(26.0, 1.4, 1.8), darkStone);
    galleryBase.position.set(0, 19.2, 41.0);
    galleryBase.castShadow = true;
    g.add(galleryBase);

    for (let k = -5; k <= 5; k++) {
      const kx = k * 2.3;
      const kArc = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.18, 6, 12, Math.PI), stone);
      kArc.position.set(kx, 22.8, 41.8);
      g.add(kArc);

      const kStatue = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 2.4, 8), stone);
      kStatue.position.set(kx, 21.2, 41.6);
      kStatue.castShadow = true;
      g.add(kStatue);

      const kHead = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), stone);
      kHead.position.set(kx, 22.5, 41.6);
      g.add(kHead);
    }

    const galleryCorniceTop = new THREE.Mesh(new THREE.BoxGeometry(26.4, 1.2, 2.0), darkStone);
    galleryCorniceTop.position.set(0, 23.8, 41.0);
    galleryCorniceTop.castShadow = true;
    g.add(galleryCorniceTop);

    // --- C. MONUMENTAL 16m GREAT ROSE WINDOW WITH STONE & LEAD TRACERY & BACKLIT GLOW ---
    const roseGroup = new THREE.Group();
    roseGroup.position.set(0, 31.0, 40.8);

    // Deep Splayed Caen Limestone Embrasure Reveal (Concentric Torus Steps stepping inward into nave)
    const embrasureOuter = new THREE.Mesh(new THREE.TorusGeometry(9.2, 0.65, 12, 64), darkStone);
    embrasureOuter.position.set(0, 0, -0.15);
    roseGroup.add(embrasureOuter);

    const embrasureMid = new THREE.Mesh(new THREE.TorusGeometry(8.6, 0.55, 12, 64), stone);
    embrasureMid.position.set(0, 0, 0.05);
    roseGroup.add(embrasureMid);

    const embrasureInner = new THREE.Mesh(new THREE.TorusGeometry(8.0, 0.48, 12, 64), darkStone);
    embrasureInner.position.set(0, 0, 0.20);
    roseGroup.add(embrasureInner);

    // Stained Glass Mandala Dial (1024x1024 Authentic French High Gothic Stained Glass)
    const roseGlass = new THREE.Mesh(new THREE.CircleGeometry(7.8, 64), stainedGlassRose);
    roseGlass.position.set(0, 0, 0.1);
    roseGroup.add(roseGlass);

    // Rayonnant Gothic Stone Tracery Matrix
    // Central Octofoil / 8-Petal Rosette Ring
    const roseRimInner = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.22, 10, 36), gold);
    roseRimInner.position.set(0, 0, 0.28);
    roseGroup.add(roseRimInner);

    const roseCenterBoss = new THREE.Mesh(new THREE.IcosahedronGeometry(0.65, 1), gold);
    roseCenterBoss.position.set(0, 0, 0.32);
    roseGroup.add(roseCenterBoss);

    // Middle 16-Lobe Arcade Ring with Lead Came Moldings
    const roseRimMid = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.28, 10, 48), stone);
    roseRimMid.position.set(0, 0, 0.26);
    roseGroup.add(roseRimMid);

    const roseRimMidCame = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.14, 8, 48), leadCame);
    roseRimMidCame.position.set(0, 0, 0.24);
    roseGroup.add(roseRimMidCame);

    // Outer 32-Lancet Stone Perimeter Rim
    const roseRimOuter = new THREE.Mesh(new THREE.TorusGeometry(7.8, 0.42, 12, 64), stone);
    roseRimOuter.position.set(0, 0, 0.25);
    roseGroup.add(roseRimOuter);

    // 16 Primary Chamfered Stone Mullion Spokes & Intermediate Tracery
    for (let s = 0; s < 16; s++) {
      const sAng = (s / 16) * Math.PI * 2;
      const cosA = Math.cos(sAng), sinA = Math.sin(sAng);

      // Primary radiating stone mullion
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.22, 6.0, 0.30), stone);
      spoke.position.set(cosA * 4.85, sinA * 4.85, 0.24);
      spoke.rotation.z = sAng - Math.PI / 2;
      roseGroup.add(spoke);

      // Molded Capital Node at middle ring
      const nodeCap = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.22, 0.55, 8), darkStone);
      nodeCap.position.set(cosA * 4.3, sinA * 4.3, 0.28);
      nodeCap.rotation.z = sAng - Math.PI / 2;
      roseGroup.add(nodeCap);

      // Gilded Trefoil Roundel at Outer Perimeter
      const trefoil = new THREE.Mesh(new THREE.TorusGeometry(0.80, 0.14, 8, 20), gold);
      trefoil.position.set(cosA * 6.5, sinA * 6.5, 0.26);
      roseGroup.add(trefoil);

      // Secondary intermediate outer mullions (32 subdivisions at outer band)
      const subAng = sAng + Math.PI / 16;
      const subSpoke = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.4, 0.22), stone);
      subSpoke.position.set(Math.cos(subAng) * 6.1, Math.sin(subAng) * 6.1, 0.22);
      subSpoke.rotation.z = subAng - Math.PI / 2;
      roseGroup.add(subSpoke);
    }

    // Backlit Sacred God-Ray Divine Point Lights (Radiating through stained glass from nave interior)
    const centralDivineBacklight = new THREE.PointLight(0xffe8aa, 5.5, 65);
    centralDivineBacklight.position.set(0, 0, -2.5); // Inside high nave shining outward
    roseGroup.add(centralDivineBacklight);

    // Multi-Spectrum Divine Backlights creating rich jewel-tone transmission
    const sapphireBacklight = new THREE.PointLight(0x5599ff, 3.6, 45);
    sapphireBacklight.position.set(0, 3.2, -2.0);
    roseGroup.add(sapphireBacklight);

    const amberBacklight = new THREE.PointLight(0xffaa22, 3.6, 45);
    amberBacklight.position.set(0, -3.2, -2.0);
    roseGroup.add(amberBacklight);

    const rubyBacklight = new THREE.PointLight(0xff3366, 3.2, 40);
    rubyBacklight.position.set(-3.2, 0, -2.0);
    roseGroup.add(rubyBacklight);

    const amethystBacklight = new THREE.PointLight(0x9944ff, 3.2, 40);
    amethystBacklight.position.set(3.2, 0, -2.0);
    roseGroup.add(amethystBacklight);

    // Soft Forward Exterior Divine Luminous Aura
    const roseForwardGlow = new THREE.PointLight(0xffeedd, 2.2, 30);
    roseForwardGlow.position.set(0, 0, 1.2);
    roseGroup.add(roseForwardGlow);

    // Flanking Twin Tall Gothic Lancet Windows with Backlights
    [-10.8, 10.8].forEach(flx => {
      const lancetMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 9.5), stainedGlassLancet);
      lancetMesh.position.set(flx, 0, 0.1);
      roseGroup.add(lancetMesh);

      const lFrame = new THREE.Mesh(new THREE.BoxGeometry(3.0, 10.0, 0.4), darkStone);
      lFrame.position.set(flx, 0, 0.05);
      roseGroup.add(lFrame);

      const lArch = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.32, 8, 20, Math.PI), stone);
      lArch.position.set(flx, 4.75, 0.2);
      roseGroup.add(lArch);

      // Lancet Backlight Point Light
      const lBacklight = new THREE.PointLight(0x66aaff, 2.8, 30);
      lBacklight.position.set(flx, 0, -2.0);
      roseGroup.add(lBacklight);
    });

    g.add(roseGroup);

    // --- D. HIGH FACADE GABLE PEDIMENT & APEX PINNACLE (y = 40 to 58) ---
    const gableGroup = new THREE.Group();
    gableGroup.position.set(0, 39.8, 38.6);

    const gableShape = new THREE.Shape();
    gableShape.moveTo(-13.4, 0);
    gableShape.lineTo(13.4, 0);
    gableShape.lineTo(0, 14.2);
    gableShape.closePath();
    const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: 2.4, bevelEnabled: false });
    const facadeGable = new THREE.Mesh(gableGeo, stone);
    facadeGable.castShadow = true;
    gableGroup.add(facadeGable);

    // Molded Ashlar Raking Coping Cornices with Crockets
    [-1, 1].forEach(sign => {
      const rakeAngle = sign * 0.815;
      const coping = new THREE.Mesh(new THREE.BoxGeometry(0.65, 20.0, 2.8), darkStone);
      coping.position.set(sign * 6.7, 7.1, 1.2);
      coping.rotation.z = rakeAngle;
      coping.castShadow = true;
      gableGroup.add(coping);

      // Cascading Crockets on Pediment Slopes
      for (let cr = 1; cr <= 7; cr++) {
        const cFrac = cr / 8;
        const cx = sign * (13.4 * (1 - cFrac));
        const cy = 14.2 * cFrac;
        const crocket = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.2, 4), gold);
        crocket.position.set(cx + sign * 0.35, cy + 0.2, 1.4);
        crocket.rotation.z = -rakeAngle;
        gableGroup.add(crocket);
      }
    });

    // Horizontal Molded Ashlar Corbel Table along Gable Base
    const corbelBase = new THREE.Mesh(new THREE.BoxGeometry(27.2, 0.8, 2.8), darkStone);
    corbelBase.position.set(0, 0.4, 1.2);
    corbelBase.castShadow = true;
    gableGroup.add(corbelBase);

    for (let cb = -6; cb <= 6; cb++) {
      const corbel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.9), stone);
      corbel.position.set(cb * 2.0, -0.2, 2.2);
      corbel.castShadow = true;
      gableGroup.add(corbel);
    }

    // Blind Arcade Gallery of 5 Graduated Lancet Niches with Statuettes
    const nicheHeights = [4.2, 6.2, 8.4, 6.2, 4.2];
    const nichePositions = [-6.4, -3.2, 0, 3.2, 6.4];
    nichePositions.forEach((nx, ni) => {
      const nh = nicheHeights[ni];
      const nFrame = new THREE.Mesh(new THREE.BoxGeometry(1.8, nh, 0.4), darkStone);
      nFrame.position.set(nx, nh * 0.5 + 1.2, 2.45);
      gableGroup.add(nFrame);

      const nArch = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.18, 6, 16, Math.PI), stone);
      nArch.position.set(nx, nh + 1.2, 2.45);
      gableGroup.add(nArch);

      const nStatue = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, nh * 0.6, 8), stone);
      nStatue.position.set(nx, nh * 0.35 + 1.2, 2.55);
      nStatue.castShadow = true;
      gableGroup.add(nStatue);
    });

    // High Relief Rosette Medallion near Gable Apex
    const apexRosette = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.22, 8, 24), gold);
    apexRosette.position.set(0, 10.8, 2.5);
    gableGroup.add(apexRosette);

    // Apex Gilded Crocketed Pinnacle
    const apexPinnacle = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.4, 5.0, 8), stone);
    apexPinnacle.position.set(0, 16.5, 1.2);
    apexPinnacle.castShadow = true;
    gableGroup.add(apexPinnacle);

    const apexSpirelet = new THREE.Mesh(new THREE.ConeGeometry(0.8, 4.5, 8), darkStone);
    apexSpirelet.position.set(0, 20.8, 1.2);
    apexSpirelet.castShadow = true;
    gableGroup.add(apexSpirelet);

    const apexFinial = new THREE.Mesh(new THREE.OctahedronGeometry(1.2, 1), gold);
    apexFinial.position.set(0, 23.5, 1.2);
    gableGroup.add(apexFinial);

    g.add(gableGroup);

    // =========================================================================
    // 4. HIGH NAVE, SIDE AISLES, TRANSEPT CROSSING & APSE (CHEVET)
    // =========================================================================
    // High Clerestory Main Nave Walls (Split around 16m Transept Crossing at z = -4)
    // Left Nave Clerestory (West section z = 4 to 37, East section z = -45 to -12, Crossing Arch above y = 32)
    const naveWallL_West = new THREE.Mesh(new THREE.BoxGeometry(1.8, 36, 33), stone);
    naveWallL_West.position.set(-11, 20, 20.5);
    naveWallL_West.castShadow = naveWallL_West.receiveShadow = true;
    g.add(naveWallL_West);

    const naveWallL_East = new THREE.Mesh(new THREE.BoxGeometry(1.8, 36, 33), stone);
    naveWallL_East.position.set(-11, 20, -28.5);
    naveWallL_East.castShadow = naveWallL_East.receiveShadow = true;
    g.add(naveWallL_East);

    const naveWallL_Top = new THREE.Mesh(new THREE.BoxGeometry(1.8, 6.0, 16), stone);
    naveWallL_Top.position.set(-11, 35, -4);
    naveWallL_Top.castShadow = true;
    g.add(naveWallL_Top);

    // Right Nave Clerestory (West section z = 4 to 37, East section z = -45 to -12, Crossing Arch above y = 32)
    const naveWallR_West = new THREE.Mesh(new THREE.BoxGeometry(1.8, 36, 33), stone);
    naveWallR_West.position.set(11, 20, 20.5);
    naveWallR_West.castShadow = naveWallR_West.receiveShadow = true;
    g.add(naveWallR_West);

    const naveWallR_East = new THREE.Mesh(new THREE.BoxGeometry(1.8, 36, 33), stone);
    naveWallR_East.position.set(11, 20, -28.5);
    naveWallR_East.castShadow = naveWallR_East.receiveShadow = true;
    g.add(naveWallR_East);

    const naveWallR_Top = new THREE.Mesh(new THREE.BoxGeometry(1.8, 6.0, 16), stone);
    naveWallR_Top.position.set(11, 35, -4);
    naveWallR_Top.castShadow = true;
    g.add(naveWallR_Top);

    // High Nave Clerestory Lancet Stained Glass Windows
    for (let wz = -34; wz <= 26; wz += 12) {
      if (wz >= -10 && wz <= 2) continue; // Transept opening gap
      [-11.95, 11.95].forEach(wx => {
        const clereWindow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 9.5), stainedGlassLancet);
        clereWindow.position.set(wx, 26.0, wz);
        clereWindow.rotation.y = wx > 0 ? -Math.PI / 2 : Math.PI / 2;
        g.add(clereWindow);

        const clereArch = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.35, 8, 16, Math.PI), stone);
        clereArch.position.set(wx, 30.75, wz);
        clereArch.rotation.y = wx > 0 ? -Math.PI / 2 : Math.PI / 2;
        g.add(clereArch);
      });
    }

    // Lower Side Aisle Walls (Split around Transept Crossing)
    const aisleWallL_West = new THREE.Mesh(new THREE.BoxGeometry(1.6, 18, 32), stone);
    aisleWallL_West.position.set(-19, 11, 20);
    aisleWallL_West.castShadow = aisleWallL_West.receiveShadow = true;
    g.add(aisleWallL_West);

    const aisleWallL_East = new THREE.Mesh(new THREE.BoxGeometry(1.6, 18, 32), stone);
    aisleWallL_East.position.set(-19, 11, -28);
    aisleWallL_East.castShadow = aisleWallL_East.receiveShadow = true;
    g.add(aisleWallL_East);

    const aisleWallL_Top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.0, 16), stone);
    aisleWallL_Top.position.set(-19, 18.5, -4);
    aisleWallL_Top.castShadow = true;
    g.add(aisleWallL_Top);

    const aisleWallR_West = new THREE.Mesh(new THREE.BoxGeometry(1.6, 18, 32), stone);
    aisleWallR_West.position.set(19, 11, 20);
    aisleWallR_West.castShadow = aisleWallR_West.receiveShadow = true;
    g.add(aisleWallR_West);

    const aisleWallR_East = new THREE.Mesh(new THREE.BoxGeometry(1.6, 18, 32), stone);
    aisleWallR_East.position.set(19, 11, -28);
    aisleWallR_East.castShadow = aisleWallR_East.receiveShadow = true;
    g.add(aisleWallR_East);

    const aisleWallR_Top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.0, 16), stone);
    aisleWallR_Top.position.set(19, 18.5, -4);
    aisleWallR_Top.castShadow = true;
    g.add(aisleWallR_Top);

    // Sloping Slate Lean-to Roofs over Lower Side Aisles (Split around Transept)
    const aisleRoofL_West = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.8, 33), slateRoof);
    aisleRoofL_West.position.set(-15, 19.5, 20.5);
    aisleRoofL_West.rotation.z = -0.32;
    aisleRoofL_West.castShadow = aisleRoofL_West.receiveShadow = true;
    g.add(aisleRoofL_West);

    const aisleRoofL_East = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.8, 33), slateRoof);
    aisleRoofL_East.position.set(-15, 19.5, -28.5);
    aisleRoofL_East.rotation.z = -0.32;
    aisleRoofL_East.castShadow = aisleRoofL_East.receiveShadow = true;
    g.add(aisleRoofL_East);

    const aisleRoofR_West = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.8, 33), slateRoof);
    aisleRoofR_West.position.set(15, 19.5, 20.5);
    aisleRoofR_West.rotation.z = 0.32;
    aisleRoofR_West.castShadow = aisleRoofR_West.receiveShadow = true;
    g.add(aisleRoofR_West);

    const aisleRoofR_East = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.8, 33), slateRoof);
    aisleRoofR_East.position.set(15, 19.5, -28.5);
    aisleRoofR_East.rotation.z = 0.32;
    aisleRoofR_East.castShadow = aisleRoofR_East.receiveShadow = true;
    g.add(aisleRoofR_East);

    // High Gabled Nave Verdigris Copper Roof (Ridge at y = 46.5m)
    const naveRoofL = new THREE.Mesh(new THREE.BoxGeometry(15.2, 1.2, 84), copperRoof);
    naveRoofL.position.set(-6.2, 42.2, -4);
    naveRoofL.rotation.z = 0.62;
    naveRoofL.castShadow = naveRoofL.receiveShadow = true;
    g.add(naveRoofL);

    const naveRoofR = new THREE.Mesh(new THREE.BoxGeometry(15.2, 1.2, 84), copperRoof);
    naveRoofR.position.set(6.2, 42.2, -4);
    naveRoofR.rotation.z = -0.62;
    naveRoofR.castShadow = naveRoofR.receiveShadow = true;
    g.add(naveRoofR);

    // Gilded Gothic Roof Ridge Cresting running full Nave Length
    for (let rz = -44; rz <= 36; rz += 2.4) {
      const crestTooth = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.2, 4), gold);
      crestTooth.position.set(0, 47.4, rz);
      crestTooth.rotation.y = Math.PI / 4;
      g.add(crestTooth);
    }

    // --- MONUMENTAL TRANSEPT CROSSING & WINGS (Hollow Architecture with Open Gothic Portals) ---
    // North Transept Wing (x = -11 to -34.2, z = -12 to +4)
    const northTranseptNorthWall = new THREE.Mesh(new THREE.BoxGeometry(23.2, 36, 1.8), stone);
    northTranseptNorthWall.position.set(-22.6, 20, -12);
    northTranseptNorthWall.castShadow = northTranseptNorthWall.receiveShadow = true;
    g.add(northTranseptNorthWall);

    const northTranseptSouthWall = new THREE.Mesh(new THREE.BoxGeometry(23.2, 36, 1.8), stone);
    northTranseptSouthWall.position.set(-22.6, 20, 4);
    northTranseptSouthWall.castShadow = northTranseptSouthWall.receiveShadow = true;
    g.add(northTranseptSouthWall);

    const northTranseptFloor = new THREE.Mesh(new THREE.PlaneGeometry(35.8, 16), marble);
    northTranseptFloor.rotation.x = -Math.PI / 2;
    northTranseptFloor.position.set(-28.0, 2.05, -4);
    northTranseptFloor.receiveShadow = true;
    g.add(northTranseptFloor);

    // South Transept Wing (x = 11 to 34.2, z = -12 to +4)
    const southTranseptNorthWall = new THREE.Mesh(new THREE.BoxGeometry(23.2, 36, 1.8), stone);
    southTranseptNorthWall.position.set(22.6, 20, -12);
    southTranseptNorthWall.castShadow = southTranseptNorthWall.receiveShadow = true;
    g.add(southTranseptNorthWall);

    const southTranseptSouthWall = new THREE.Mesh(new THREE.BoxGeometry(23.2, 36, 1.8), stone);
    southTranseptSouthWall.position.set(22.6, 20, 4);
    southTranseptSouthWall.castShadow = southTranseptSouthWall.receiveShadow = true;
    g.add(southTranseptSouthWall);

    const southTranseptFloor = new THREE.Mesh(new THREE.PlaneGeometry(25.0, 16), marble);
    southTranseptFloor.rotation.x = -Math.PI / 2;
    southTranseptFloor.position.set(22.6, 2.05, -4);
    southTranseptFloor.receiveShadow = true;
    g.add(southTranseptFloor);

    // High Transept Roofs
    const transeptRoofNorth = new THREE.Mesh(new THREE.BoxGeometry(68, 1.2, 11.2), copperRoof);
    transeptRoofNorth.position.set(0, 42.2, -8.6);
    transeptRoofNorth.rotation.x = -0.62;
    transeptRoofNorth.castShadow = true;
    g.add(transeptRoofNorth);

    const transeptRoofSouth = new THREE.Mesh(new THREE.BoxGeometry(68, 1.2, 11.2), copperRoof);
    transeptRoofSouth.position.set(0, 42.2, 0.6);
    transeptRoofSouth.rotation.x = 0.62;
    transeptRoofSouth.castShadow = true;
    g.add(transeptRoofSouth);

    // North & South Transept Facade Portals, Ashlar Pediments & 10m Transept Rose Windows
    [-34.2, 34.2].forEach(tx => {
      const isNorth = tx < 0;
      const tGableGroup = new THREE.Group();
      tGableGroup.position.set(tx, 38.0, -4.0);
      tGableGroup.rotation.y = tx > 0 ? Math.PI / 2 : -Math.PI / 2;

      const tGableShape = new THREE.Shape();
      tGableShape.moveTo(-8.4, 0);
      tGableShape.lineTo(8.4, 0);
      tGableShape.lineTo(0, 9.6);
      tGableShape.closePath();
      const tGableGeo = new THREE.ExtrudeGeometry(tGableShape, { depth: 1.8, bevelEnabled: false });
      const tGable = new THREE.Mesh(tGableGeo, stone);
      tGable.castShadow = true;
      tGableGroup.add(tGable);

      // Molded Ashlar Raking Coping with Crockets
      [-1, 1].forEach(sign => {
        const rakeAngle = sign * 0.72;
        const coping = new THREE.Mesh(new THREE.BoxGeometry(0.55, 13.5, 2.0), darkStone);
        coping.position.set(sign * 4.2, 4.8, 0.9);
        coping.rotation.z = rakeAngle;
        tGableGroup.add(coping);

        for (let cr = 1; cr <= 4; cr++) {
          const cFrac = cr / 5;
          const cx = sign * (8.4 * (1 - cFrac));
          const cy = 9.6 * cFrac;
          const crocket = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.0, 4), gold);
          crocket.position.set(cx + sign * 0.25, cy + 0.15, 1.1);
          crocket.rotation.z = -rakeAngle;
          tGableGroup.add(crocket);
        }
      });

      // Blind Trefoil Arcade in Transept Pediment
      [-2.4, 0, 2.4].forEach((ax, ai) => {
        const ah = ai === 1 ? 4.5 : 3.2;
        const aFrame = new THREE.Mesh(new THREE.BoxGeometry(1.4, ah, 0.3), darkStone);
        aFrame.position.set(ax, ah * 0.5 + 0.8, 1.85);
        tGableGroup.add(aFrame);

        const aArch = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.15, 6, 16, Math.PI), stone);
        aArch.position.set(ax, ah + 0.8, 1.85);
        tGableGroup.add(aArch);
      });

      // Transept Pediment Apex Pinnacle
      const tApexPin = new THREE.Mesh(new THREE.ConeGeometry(0.8, 4.2, 8), darkStone);
      tApexPin.position.set(0, 11.7, 0.9);
      tGableGroup.add(tApexPin);

      const tApexFinial = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 1), gold);
      tApexFinial.position.set(0, 14.0, 0.9);
      tGableGroup.add(tApexFinial);

      g.add(tGableGroup);

      // Upper Transept End Facade Wall (y = 20 to 38, framing above the open transept portal)
      const tUpperWall = new THREE.Mesh(new THREE.BoxGeometry(1.8, 18.0, 16.0), stone);
      tUpperWall.position.set(tx, 29.0, -4);
      tUpperWall.castShadow = tUpperWall.receiveShadow = true;
      g.add(tUpperWall);

      // Flanking Lower Portal Pier Walls (leaving 8.0m wide central portal archway open: z = -8 to 0)
      const tPierSouth = new THREE.Mesh(new THREE.BoxGeometry(1.8, 18.0, 4.0), stone);
      tPierSouth.position.set(tx, 11.0, 2.0);
      tPierSouth.castShadow = tPierSouth.receiveShadow = true;
      g.add(tPierSouth);

      const tPierNorth = new THREE.Mesh(new THREE.BoxGeometry(1.8, 18.0, 4.0), stone);
      tPierNorth.position.set(tx, 11.0, -10.0);
      tPierNorth.castShadow = tPierNorth.receiveShadow = true;
      g.add(tPierNorth);

      // Soaring Open Pointed Gothic Transept Portal Archway (Clear fly-through width 8.0m, height y = 2 to 17m)
      [3.8, 4.5, 5.2].forEach((rad, ri) => {
        const tArchivolt = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.38, 8, 28, Math.PI), stone);
        tArchivolt.position.set(tx + (tx > 0 ? 0.35 + ri * 0.25 : -0.35 - ri * 0.25), 11.8, -4);
        tArchivolt.rotation.y = tx > 0 ? Math.PI / 2 : -Math.PI / 2;
        tArchivolt.castShadow = true;
        g.add(tArchivolt);
      });

      // Clustered Gothic Transept Jamb Columns
      [-8.0, 0.0].forEach(jz => {
        const jCol = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.40, 14.0, 8), darkStone);
        jCol.position.set(tx + (tx > 0 ? 0.4 : -0.4), 9.0, jz);
        jCol.castShadow = true;
        g.add(jCol);

        const jCap = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.32, 1.2, 8), stone);
        jCap.position.set(tx + (tx > 0 ? 0.4 : -0.4), 16.6, jz);
        g.add(jCap);
      });

      // 10m High Gothic Transept Rose Window Assembly
      const tRoseGroup = new THREE.Group();
      tRoseGroup.position.set(tx, 29.0, -4);
      tRoseGroup.rotation.y = tx > 0 ? Math.PI / 2 : -Math.PI / 2;

      // Deep Splayed Caen Limestone Embrasure Reveal
      const tEmbrasureOuter = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.45, 10, 48), darkStone);
      tEmbrasureOuter.position.set(0, 0, 0.75);
      tRoseGroup.add(tEmbrasureOuter);

      const tEmbrasureMid = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.38, 10, 48), stone);
      tEmbrasureMid.position.set(0, 0, 0.85);
      tRoseGroup.add(tEmbrasureMid);

      const tRoseRim = new THREE.Mesh(new THREE.TorusGeometry(4.8, 0.34, 10, 48), stone);
      tRoseRim.position.set(0, 0, 0.95);
      tRoseGroup.add(tRoseRim);

      // Stained Glass Mandala Dial
      const tRose = new THREE.Mesh(new THREE.CircleGeometry(4.8, 48), stainedGlassRose);
      tRose.position.set(0, 0, 0.90);
      tRoseGroup.add(tRose);

      // Concentric Gothic Stone Tracery Matrix
      const tCenterRing = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.18, 8, 24), gold);
      tCenterRing.position.set(0, 0, 0.98);
      tRoseGroup.add(tCenterRing);

      const tMidCameRing = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.14, 8, 36), leadCame);
      tMidCameRing.position.set(0, 0, 0.96);
      tRoseGroup.add(tMidCameRing);

      // 12 Radiating Stone Mullion Spokes with Gilded Roundels
      for (let s = 0; s < 12; s++) {
        const sAng = (s / 12) * Math.PI * 2;
        const cosA = Math.cos(sAng), sinA = Math.sin(sAng);

        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.6, 0.22), stone);
        spoke.position.set(cosA * 3.0, sinA * 3.0, 0.96);
        spoke.rotation.z = sAng - Math.PI / 2;
        tRoseGroup.add(spoke);

        const trefoil = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.10, 6, 16), gold);
        trefoil.position.set(cosA * 4.0, sinA * 4.0, 0.98);
        tRoseGroup.add(trefoil);
      }

      // Divine Backlight Point Lights (Positioned inside transept shining outward through the rose)
      if (isNorth) {
        // North Transept: Celestial Sapphire & Divine White Radiance
        const northBacklight = new THREE.PointLight(0x7ec8ff, 4.8, 50);
        northBacklight.position.set(0, 0, -2.5); // inside transept wing
        tRoseGroup.add(northBacklight);

        const northWarmAccent = new THREE.PointLight(0xffe0a0, 3.2, 35);
        northWarmAccent.position.set(0, 0, -1.8);
        tRoseGroup.add(northWarmAccent);
      } else {
        // South Transept: Radiant Golden Noon Sunlight & Ruby Glow
        const southBacklight = new THREE.PointLight(0xffd280, 4.8, 50);
        southBacklight.position.set(0, 0, -2.5); // inside transept wing
        tRoseGroup.add(southBacklight);

        const southRubyAccent = new THREE.PointLight(0xff6688, 3.2, 35);
        southRubyAccent.position.set(0, 0, -1.8);
        tRoseGroup.add(southRubyAccent);
      }

      // Soft Forward Exterior Illuminance
      const tForwardGlow = new THREE.PointLight(0xffeedd, 1.8, 22);
      tForwardGlow.position.set(0, 0, 1.8);
      tRoseGroup.add(tForwardGlow);

      g.add(tRoseGroup);
    });

    // --- SEMICIRCULAR APSE / CHEVET & RADIATING CHAPELS (z = -45 to -55) ---
    const apseWallGeo = new THREE.CylinderGeometry(11.0, 11.0, 36, 16, 1, true, Math.PI / 2, Math.PI);
    const apseWall = new THREE.Mesh(apseWallGeo, stone);
    apseWall.position.set(0, 20, -45);
    apseWall.castShadow = apseWall.receiveShadow = true;
    g.add(apseWall);

    const apseRoof = new THREE.Mesh(new THREE.ConeGeometry(11.2, 9.5, 16), copperRoof);
    apseRoof.position.set(0, 42.6, -45);
    apseRoof.castShadow = true;
    g.add(apseRoof);

    // 5 Radiating Ambulatory Chevet Chapels
    for (let cp = 0; cp < 5; cp++) {
      const cpAng = Math.PI * 0.25 + (cp / 4) * Math.PI * 0.5;
      const cpx = Math.cos(cpAng) * 16.5;
      const cpz = -45 - Math.sin(cpAng) * 16.5;

      const chapel = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.8, 14, 12), stone);
      chapel.position.set(cpx, 9.0, cpz);
      chapel.castShadow = chapel.receiveShadow = true;
      g.add(chapel);

      const chapelRoof = new THREE.Mesh(new THREE.ConeGeometry(3.9, 6.0, 12), copperRoof);
      chapelRoof.position.set(cpx, 19.0, cpz);
      chapelRoof.castShadow = true;
      g.add(chapelRoof);

      const chapelFinial = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 1), gold);
      chapelFinial.position.set(cpx, 22.5, cpz);
      g.add(chapelFinial);
    }

    // =========================================================================
    // 5. INTRICATE GOTHIC FLYING BUTTRESS SYSTEM WITH CROCKETED PINNACLES & GARGOYLES
    // =========================================================================
    const buttressZPlacements = [-44, -32, -20, 8, 20, 32];
    buttressZPlacements.forEach(bz => {
      [-23.5, 23.5].forEach(bx => {
        const sign = bx > 0 ? 1 : -1;
        const buttressGroup = new THREE.Group();
        buttressGroup.position.set(bx, 2.0, bz);

        // --- Stepped Outer Buttress Pier (Culée, y = 0 to 28m) ---
        const pierBase = new THREE.Mesh(new THREE.BoxGeometry(2.4, 12, 3.2), darkStone);
        pierBase.position.set(0, 6, 0);
        pierBase.castShadow = true;
        buttressGroup.add(pierBase);

        const pierMid = new THREE.Mesh(new THREE.BoxGeometry(2.0, 10, 2.8), stone);
        pierMid.position.set(-sign * 0.2, 17, 0);
        pierMid.castShadow = true;
        buttressGroup.add(pierMid);

        const pierTop = new THREE.Mesh(new THREE.BoxGeometry(1.8, 8, 2.4), stone);
        pierTop.position.set(-sign * 0.4, 26, 0);
        pierTop.castShadow = true;
        buttressGroup.add(pierTop);

        // --- Soaring Crocketed Pinnacle on Top of Pier (y = 30 to 44m) ---
        const pinShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.1, 7.0, 8), stone);
        pinShaft.position.set(-sign * 0.4, 33.5, 0);
        pinShaft.castShadow = true;
        buttressGroup.add(pinShaft);

        const pinSpire = new THREE.Mesh(new THREE.ConeGeometry(0.85, 6.5, 8), darkStone);
        pinSpire.position.set(-sign * 0.4, 40.25, 0);
        pinSpire.castShadow = true;
        buttressGroup.add(pinSpire);

        const pinGoldFinial = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 1), gold);
        pinGoldFinial.position.set(-sign * 0.4, 44.0, 0);
        buttressGroup.add(pinGoldFinial);

        // --- Double-Tier Arched Flying Flyers (Arcs-Boutants) ---
        // Upper flyer bracing high clerestory wall (Springing from pier y=25.5m to clerestory y=33.2m)
        const upperFlyerCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(-sign * 0.4, 25.5, 0),
          new THREE.Vector3(-sign * 5.8, 29.8, 0),
          new THREE.Vector3(-sign * 11.6, 33.2, 0)
        ]);
        const upperFlyer = new THREE.Mesh(new THREE.TubeGeometry(upperFlyerCurve, 16, 0.44, 8, false), stone);
        upperFlyer.castShadow = true;
        buttressGroup.add(upperFlyer);

        // Lower flyer bracing vault thrust (Springing from pier y=15.2m to clerestory/aisle junction y=22.0m)
        const lowerFlyerCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(-sign * 0.4, 15.2, 0),
          new THREE.Vector3(-sign * 5.6, 18.8, 0),
          new THREE.Vector3(-sign * 11.6, 22.0, 0)
        ]);
        const lowerFlyer = new THREE.Mesh(new THREE.TubeGeometry(lowerFlyerCurve, 16, 0.40, 8, false), stone);
        lowerFlyer.castShadow = true;
        buttressGroup.add(lowerFlyer);

        // Intermediate Openwork Tracery Strut Brace between Flyers
        const flyerStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 10.5, 8), stone);
        flyerStrut.position.set(-sign * 5.8, 24.3, 0);
        flyerStrut.castShadow = true;
        buttressGroup.add(flyerStrut);

        // --- Sculpted Zoomorphic Gargoyle Rainwater Spout ---
        const gargoyleSpout = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 2.6), darkStone);
        gargoyleSpout.position.set(sign * 1.6, 28.5, 0);
        gargoyleSpout.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2;
        gargoyleSpout.castShadow = true;
        buttressGroup.add(gargoyleSpout);

        const gargoyleHead = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), darkStone);
        gargoyleHead.position.set(sign * 2.9, 28.5, 0);
        buttressGroup.add(gargoyleHead);

        g.add(buttressGroup);
      });
    });

    // =========================================================================
    // 6. SOARING CENTRAL CROSSING FLÈCHE SPIRE (Rising to y = 140.0m!)
    // =========================================================================
    const crossingGroup = new THREE.Group();
    crossingGroup.position.set(0, 46.0, -4); // Atop the crossing ridge

    // --- Tier 1: Octagonal Lead / Copper Base Pedestal (y = 46 to 62) ---
    const flecheBase = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 6.2, 16.0, 8), darkStone);
    flecheBase.position.y = 8.0;
    flecheBase.castShadow = true;
    crossingGroup.add(flecheBase);

    // 8 Satellite Flying Spurs around Spire Base
    for (let f = 0; f < 8; f++) {
      const fAng = (f / 8) * Math.PI * 2;
      const spur = new THREE.Mesh(new THREE.BoxGeometry(0.6, 12.0, 2.4), copperRoof);
      spur.position.set(Math.cos(fAng) * 5.6, 8.0, Math.sin(fAng) * 5.6);
      spur.rotation.y = -fAng;
      spur.rotation.z = Math.cos(fAng) * 0.25;
      crossingGroup.add(spur);

      const sPin = new THREE.Mesh(new THREE.ConeGeometry(0.55, 4.0, 6), gold);
      sPin.position.set(Math.cos(fAng) * 5.8, 16.0, Math.sin(fAng) * 5.8);
      crossingGroup.add(sPin);
    }

    // --- Tier 2: Openwork Gothic Belfry Lantern (y = 62 to 84) ---
    const lanternStage1 = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.4, 22.0, 8), copperRoof);
    lanternStage1.position.y = 27.0;
    lanternStage1.castShadow = true;
    crossingGroup.add(lanternStage1);

    const lanternMolding1 = new THREE.Mesh(new THREE.TorusGeometry(3.8, 0.45, 8, 24), gold);
    lanternMolding1.rotation.x = Math.PI / 2;
    lanternMolding1.position.y = 38.0;
    crossingGroup.add(lanternMolding1);

    // --- Tier 3: Slender Open Fluted Lantern (y = 84 to 106) ---
    const lanternStage2 = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.4, 22.0, 8), copperRoof);
    lanternStage2.position.y = 49.0;
    lanternStage2.castShadow = true;
    crossingGroup.add(lanternStage2);

    const lanternMolding2 = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.35, 8, 24), gold);
    lanternMolding2.rotation.x = Math.PI / 2;
    lanternMolding2.position.y = 60.0;
    crossingGroup.add(lanternMolding2);

    // --- Tier 4: Soaring Crocketed Needle Spire (y = 106 to 134) ---
    const needleSpire = new THREE.Mesh(new THREE.ConeGeometry(2.4, 28.0, 8), copperRoof);
    needleSpire.position.y = 74.0;
    needleSpire.castShadow = true;
    crossingGroup.add(needleSpire);

    // Crockets on 4 Spire Tiers
    [64, 72, 80, 86].forEach((cy, ci) => {
      const rad = 2.2 - ci * 0.45;
      for (let cr = 0; cr < 8; cr++) {
        const cAng = (cr / 8) * Math.PI * 2;
        const crocket = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.2, 4), gold);
        crocket.position.set(Math.cos(cAng) * rad, cy, Math.sin(cAng) * rad);
        crocket.rotation.z = Math.cos(cAng) * 0.4;
        crossingGroup.add(crocket);
      }
    });

    // --- Tier 5: Gilded Celestial Starburst Finial & Beacon (Reaching y = 140.0m!) ---
    const finialCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.7, 3.2, 8), gold);
    finialCrown.position.y = 89.6;
    crossingGroup.add(finialCrown);

    const celestialOrb = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 16), gold);
    celestialOrb.position.y = 92.0;
    crossingGroup.add(celestialOrb);

    const grandStarburst = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 1), gold);
    grandStarburst.position.y = 94.0; // 46 + 94 = 140.0m exact!
    crossingGroup.add(grandStarburst);

    // Omnidirectional Starlight Beacon Light at Spire Apex
    const spireBeacon = new THREE.PointLight(0xfff5c0, 5.5, 160);
    spireBeacon.position.y = 94.0;
    crossingGroup.add(spireBeacon);

    g.add(crossingGroup);

    // =========================================================================
    // 7. WALKABLE INTERIOR SANCTUARY (La Sagrada Família & Sistine Chapel)
    // =========================================================================
    // Honed Carrara & Porphyry Marble Nave Floor (36m wide, 80m long)
    const floorGeo = new THREE.PlaneGeometry(20.2, 80);
    floorGeo.rotateX(-Math.PI / 2);
    const interiorFloor = new THREE.Mesh(floorGeo, marble);
    interiorFloor.position.set(0, 2.08, -4);
    interiorFloor.receiveShadow = true;
    g.add(interiorFloor);

    // Soaring Vaulted Ceiling divided into purchasable grid plots
    const vaultZSegments = 26;
    const vaultThetaSegments = 12;
    const vaultRadius = 11;
    const vaultLength = 78;
    const plotZLen = vaultLength / vaultZSegments;
    const plotThetaLen = Math.PI / vaultThetaSegments;
    
    const vaultGroup = new THREE.Group();
    vaultGroup.position.set(0, 25.0, -4);
    
    const sistineMat = Surfaces.sistineVault();
    
    for(let z=0; z<vaultZSegments; z++) {
      for(let t=0; t<vaultThetaSegments; t++) {
        const plotGeo = new THREE.CylinderGeometry(vaultRadius - 0.05, vaultRadius - 0.05, plotZLen, 2, 1, true, t * plotThetaLen, plotThetaLen);
        plotGeo.rotateZ(Math.PI / 2);
        plotGeo.rotateY(Math.PI / 2);
        
        // Correct global UV mapping so the fresco spans the entire ceiling seamlessly
        const uvs = plotGeo.attributes.uv;
        for(let i=0; i<uvs.count; i++) {
          let u = uvs.getX(i);
          let v = uvs.getY(i);
          let globalU = (t + u) / vaultThetaSegments;
          let globalV = (z + v) / vaultZSegments;
          uvs.setXY(i, globalU, globalV);
        }
        
        const plotMat = sistineMat.clone();
        const plotMesh = new THREE.Mesh(plotGeo, plotMat);
        const zPos = -vaultLength / 2 + (z + 0.5) * plotZLen;
        plotMesh.position.set(0, 0, zPos);
        
        // Setup plot data for picking system
        const plotId = `CATHEDRAL_VAULT_${z}_${t}`;
        const fakePlot = {
          id: plotId,
          status: 'available', // Ready to be bought and swap texture to client's animal
          district: 'highland_sanctuary',
          size: 'vault',
          price: 999
        };
        
        this.world.pickables.push(plotMesh);
        // Intercept WorldCore raycaster hit.instanceId (which is undefined for standard Meshes)
        this.world.plotMeshIndex.set(plotMesh, { undefined: fakePlot });
        
        vaultGroup.add(plotMesh);
      }
    }
    g.add(vaultGroup);

    // Gaudí Helicoidal Tree Columns & Clustered Compound Piers (Nave Bays, Choir Bays & 4 Massive Crossing Piers)
    const cathedralPierLocations = [
      { x: -9.8, z: 24, isCrossing: false }, { x: 9.8, z: 24, isCrossing: false },
      { x: -9.8, z: 10, isCrossing: false }, { x: 9.8, z: 10, isCrossing: false },
      // 4 Monumental Crossing Corner Piers (Piliers de la Croisée, framing the open 16m crossing & flèche spire)
      { x: -11.0, z: 4, isCrossing: true },   { x: 11.0, z: 4, isCrossing: true },
      { x: -11.0, z: -12, isCrossing: true }, { x: 11.0, z: -12, isCrossing: true },
      // Choir & Sanctuary Bays
      { x: -9.8, z: -18, isCrossing: false }, { x: 9.8, z: -18, isCrossing: false },
      { x: -9.8, z: -32, isCrossing: false }, { x: 9.8, z: -32, isCrossing: false },
    ];

    cathedralPierLocations.forEach(loc => {
      const colTree = new THREE.Group();
      colTree.position.set(loc.x, 2.0, loc.z);

      const baseRad = loc.isCrossing ? 2.0 : 1.6;
      const topRad = loc.isCrossing ? 2.6 : 2.2;
      const shaftRad1 = loc.isCrossing ? 1.5 : 1.2;
      const shaftRad2 = loc.isCrossing ? 1.8 : 1.5;

      // Fluted Stone Plinth Base
      const plinthMesh = new THREE.Mesh(new THREE.CylinderGeometry(baseRad, topRad, 2.0, 16), stone);
      plinthMesh.position.y = 1.0;
      colTree.add(plinthMesh);

      // Clustered Shaft Pier
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(shaftRad1, shaftRad2, 24.0, 16), stone);
      trunk.position.y = 2.0 + 12.0;
      trunk.castShadow = true;
      colTree.add(trunk);

      // Sculpted Foliate Capital
      const capMesh = new THREE.Mesh(new THREE.CylinderGeometry(loc.isCrossing ? 2.8 : 2.4, shaftRad1 * 1.1, 1.8, 16), darkStone);
      capMesh.position.y = 26.9;
      colTree.add(capMesh);

      // Curved Gothic Vault Ribs arching into Sistine ceiling
      for (let b = 0; b < 6; b++) {
        const bAng = (b / 6) * Math.PI * 2;
        const curvePts = [
          new V3(0, 27.6, 0),
          new V3(Math.cos(bAng) * 3.6, 31.2, Math.sin(bAng) * 3.6),
          new V3(Math.cos(bAng) * 8.2, 34.8, Math.sin(bAng) * 8.2),
        ];
        const ribCurve = new THREE.CatmullRomCurve3(curvePts);
        const ribGeo = new THREE.TubeGeometry(ribCurve, 12, 0.35, 8, false);
        const ribMesh = new THREE.Mesh(ribGeo, stone);
        colTree.add(ribMesh);
      }

      g.add(colTree);
    });

    // Carved Walnut Nave Pews with Molded End Stanchions & Contoured Seats
    const pewEndGeo = new THREE.BoxGeometry(0.24, 1.6, 1.2);
    const pewSeatGeo = new THREE.BoxGeometry(5.2, 0.14, 0.85);
    const pewBackGeo = new THREE.BoxGeometry(5.2, 1.3, 0.14);
    const pewKneelerGeo = new THREE.BoxGeometry(5.0, 0.10, 0.35);

    for (let pz = -22; pz <= 26; pz += 4.6) {
      [-5.6, 5.6].forEach(px => {
        const pewGroup = new THREE.Group();
        pewGroup.position.set(px, 2.0, pz);

        const endL = new THREE.Mesh(pewEndGeo, darkWood);
        endL.position.set(-2.6, 0.8, 0);
        endL.castShadow = true;
        pewGroup.add(endL);

        const endR = new THREE.Mesh(pewEndGeo, darkWood);
        endR.position.set(2.6, 0.8, 0);
        endR.castShadow = true;
        pewGroup.add(endR);

        const seat = new THREE.Mesh(pewSeatGeo, darkWood);
        seat.position.set(0, 0.72, 0.05);
        seat.castShadow = true;
        pewGroup.add(seat);

        const back = new THREE.Mesh(pewBackGeo, darkWood);
        back.position.set(0, 1.35, -0.32);
        back.rotation.x = 0.12;
        back.castShadow = true;
        pewGroup.add(back);

        const kneeler = new THREE.Mesh(pewKneelerGeo, darkWood);
        kneeler.position.set(0, 0.15, -0.65);
        pewGroup.add(kneeler);

        g.add(pewGroup);
      });
    }

    // Apse Sanctuary & High Celestial Altar (North End at z = -38)
    const apseAltar = new THREE.Group();
    apseAltar.position.set(0, 2.0, -38);

    // Breathtaking Byzantine Mosaic Apse Half-Dome (Cul-de-four)
    const apseDomeGeo = new THREE.SphereGeometry(11, 32, 16, Math.PI, Math.PI, 0, Math.PI / 2);
    const apseDome = new THREE.Mesh(apseDomeGeo, byzantineMosaic);
    apseDome.position.set(0, 25.0, -3.5);
    apseDome.material.side = THREE.BackSide; // Viewable from inside
    apseAltar.add(apseDome);

    // Mosaic Apse Floor
    const apseFloorGeo = new THREE.CircleGeometry(11, 32, Math.PI, Math.PI);
    const apseFloor = new THREE.Mesh(apseFloorGeo, byzantineMosaic);
    apseFloor.rotation.x = -Math.PI / 2;
    apseFloor.position.set(0, 0.02, -3.5);
    apseFloor.receiveShadow = true;
    apseAltar.add(apseFloor);

    // Grand Triumphal Arch framing the apse
    const archGeo = new THREE.TorusGeometry(11.2, 0.6, 16, 48, Math.PI);
    const triumphalArch = new THREE.Mesh(archGeo, darkStone);
    triumphalArch.position.set(0, 25.0, 0);
    apseAltar.add(triumphalArch);

    const altarStep1 = new THREE.Mesh(new THREE.BoxGeometry(16, 0.45, 9), marble);
    altarStep1.position.y = 0.22;
    apseAltar.add(altarStep1);

    const altarStep2 = new THREE.Mesh(new THREE.BoxGeometry(12.5, 0.45, 7), marble);
    altarStep2.position.y = 0.67;
    apseAltar.add(altarStep2);

    // Intricate High Altar Table
    const altarTable = new THREE.Mesh(new THREE.BoxGeometry(8.2, 1.3, 2.8), marble);
    altarTable.position.set(0, 1.55, 0);
    altarTable.castShadow = true;
    apseAltar.add(altarTable);

    // Gold trim on Altar
    const altarTrimGeo = new THREE.BoxGeometry(8.3, 0.1, 2.9);
    const altarTrim = new THREE.Mesh(altarTrimGeo, gold);
    altarTrim.position.set(0, 2.15, 0);
    apseAltar.add(altarTrim);

    // Carved Gilded Reredos Screen behind Altar (Magnificent detail)
    const reredosGeo = new THREE.BoxGeometry(11.2, 9.5, 0.8);
    const reredos = new THREE.Mesh(reredosGeo, gold);
    reredos.position.set(0, 5.65, -3.2); 
    reredos.castShadow = true;
    apseAltar.add(reredos);

    // Radiant Celestial Starburst Beacon above Altar
    const altarStarburst = new THREE.Mesh(new THREE.IcosahedronGeometry(2.0, 2), gold);
    altarStarburst.position.set(0, 14.0, -2.4);
    apseAltar.add(altarStarburst);

    const altarLight = new THREE.PointLight(0xfff0cc, 6.2, 90);
    altarLight.position.set(0, 14.0, -2.4);
    apseAltar.add(altarLight);

    // Stained Glass Reflections (Colorful ambient light pools on the floor)
    const sgLight1 = new THREE.PointLight(0xff3366, 2.5, 30);
    sgLight1.position.set(-8, 3.0, 10);
    apseAltar.add(sgLight1);
    
    const sgLight2 = new THREE.PointLight(0x3366ff, 2.5, 30);
    sgLight2.position.set(8, 3.0, 10);
    apseAltar.add(sgLight2);

    const sgLight3 = new THREE.PointLight(0x33cc33, 2.0, 40);
    sgLight3.position.set(0, 4.0, -10);
    apseAltar.add(sgLight3);

    g.add(apseAltar);

    // Interactive Votive Candle Lighting Alcoves (Left & Right Side Chapels)
    [-15.0, 15.0].forEach((vx) => {
      const candleStand = new THREE.Group();
      candleStand.position.set(vx, 2.0, -4);

      // Central Pillar connecting to the floor
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2.4, 8), darkWood);
      pillar.position.y = 1.0;
      candleStand.add(pillar);

      for (let t = 0; t < 3; t++) {
        const ty = 0.8 + t * 0.65;
        const trad = 2.6 - t * 0.55;
        const tierMesh = new THREE.Mesh(new THREE.CylinderGeometry(trad, trad, 0.15, 16), gold);
        tierMesh.position.y = ty;
        candleStand.add(tierMesh);

        const count = 10 - t * 2;
        for (let k = 0; k < count; k++) {
          const kang = (k / count) * Math.PI * 2;
          const kx = Math.cos(kang) * (trad - 0.35);
          const kz = Math.sin(kang) * (trad - 0.35);

          const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.10, 0.22, 8), new THREE.MeshPhysicalMaterial({
            color: 0xffe8a0, roughness: 0.2, metalness: 0.1
          }));
          cup.position.set(kx, ty + 0.11, kz);
          candleStand.add(cup);

          const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 6), new THREE.MeshBasicMaterial({
            color: 0xffaa22
          }));
          flame.position.set(kx, ty + 0.28, kz);
          candleStand.add(flame);
        }
      }
      
      const hitbox = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), new THREE.MeshBasicMaterial({ visible: false }));
      hitbox.position.copy(candleStand.position);
      hitbox.position.y += 2.0;
      hitbox.userData = { 
        action: 'light_candle', 
        label: 'Light a Votive Candle'
      };
      this.world.pickables.push(hitbox);
      g.add(hitbox);
      
      g.add(candleStand);
    });

    // ------------------------------------------------------------------------
    // ARCHITECTURAL PRESERVATION: Robust Geometry Consolidation with Attribute Normalization
    // ------------------------------------------------------------------------
    const matsMap = new Map();
    g.updateMatrixWorld(true);

    g.traverse((child) => {
      if (child.isMesh && child.geometry && child.material && !child.userData.action && !child.userData.noMerge) {
        const mat = child.material;
        if (!matsMap.has(mat)) matsMap.set(mat, []);
        
        const geom = child.geometry.clone();
        // Normalize vertex attributes so mergeGeometries never fails
        if (!geom.attributes.normal) geom.computeVertexNormals();
        if (!geom.attributes.uv) {
          const uvs = new Float32Array(geom.attributes.position.count * 2);
          geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        }
        
        const relMatrix = new THREE.Matrix4().copy(g.matrixWorld).invert().multiply(child.matrixWorld);
        geom.applyMatrix4(relMatrix);
        
        matsMap.get(mat).push({ geom, child });
      }
    });

    // Merge meshes by material safely
    for (const [mat, items] of matsMap.entries()) {
      if (items.length > 0) {
        const geoms = items.map(it => it.geom);
        let mergedGeo = null;
        try {
          mergedGeo = safeMerge(geoms, false);
        } catch (e) {
          console.warn('[cathedral] merge failed for material, keeping separate', e);
        }
        if (mergedGeo) {
          // Remove merged individual meshes only when merge succeeds
          items.forEach(it => { if (it.child.parent) it.child.parent.remove(it.child); });
          const mergedMesh = new THREE.Mesh(mergedGeo, mat);
          mergedMesh.castShadow = true;
          mergedMesh.receiveShadow = true;
          g.add(mergedMesh);
        }
      }
    }

    this.world.scene.add(g);
  }

  _buddhistPagoda() {
    const g = new THREE.Group();
    const px = WORLD.buddhistTemple.x, pz = WORLD.buddhistTemple.z;
    const py = terrainHeight(px, pz); // Perfectly grounded foundation
    g.position.set(px, py, pz);

    const vermilion = material('ceramic', { repeat: 2.0, color: 0xba2418, roughness: 0.1, metalness: 0.0, physical: true, clearcoat: 1.0, clearcoatRoughness: 0.05, ior: 1.6 });
    const vermilionDark = material('ceramic', { repeat: 2.0, color: 0x7c140c, roughness: 0.15, metalness: 0.0, physical: true, clearcoat: 0.9, clearcoatRoughness: 0.08, ior: 1.6 });
    const whitePlaster = Surfaces.stuccoMuqarnas(3.0);
    const ebonyWood = material('timber', { repeat: 2.0, color: 0x1c1511, roughness: 0.65, metalness: 0.0, physical: true, clearcoat: 0.15, clearcoatRoughness: 0.6, normalScale: 1.4 });
    const shojiScreen = new THREE.MeshPhysicalMaterial({
      color: 0xfff6e4,
      emissive: 0xffe4b8,
      emissiveIntensity: 1.2,
      roughness: 0.75,
      metalness: 0.0,
      transparent: true, logarithmicDepthBuffer: true,
      opacity: 0.90,
      side: THREE.DoubleSide
    });
    const cedar = Surfaces.wood(1.4);
    const slateRoof = Surfaces.pagodaTile(3.8);
    const stone = material('agedCaenLimestone', { repeat: 4.0, color: 0x90897f, roughness: 0.9, metalness: 0.0, normalScale: 1.8, aoMapIntensity: 1.5 });
    const granite = Surfaces.granite(1.5);
    const gold = Surfaces.celestialGold(1.0);
    const bronze = Surfaces.verdigrisBronze(1.0);
    const mossMat = Surfaces.forestFloor(3.0);

    // 1. Zen Rock Garden Terrace & Karesansui Landscape (枯山水)
    const terraceGeo = new THREE.CylinderGeometry(28, 30, 4.0, 36);
    const terrace = new THREE.Mesh(terraceGeo, stone);
    terrace.position.y = -0.4;
    terrace.receiveShadow = terrace.castShadow = true;
    g.add(terrace);

    // Tiered Granite Foundation Curb
    const curbGeo = new THREE.TorusGeometry(27.8, 0.45, 8, 36);
    curbGeo.rotateX(Math.PI / 2);
    const curb = new THREE.Mesh(curbGeo, granite);
    curb.position.y = 1.6;
    g.add(curb);

    // Raked White Granite Gravel Bed (Shirakawa Sand)
    const gravelMat = new THREE.MeshPhysicalMaterial({
      color: 0xedeae2, roughness: 0.90, bumpScale: 0.18,
      });
    const gravel = new THREE.Mesh(new THREE.RingGeometry(0, 27.5, 64), gravelMat);
    gravel.rotation.x = -Math.PI / 2;
    gravel.position.y = 1.65;
    gravel.receiveShadow = true;
    g.add(gravel);

    // Geometric Raked Sand Lines (Karesansui ripples)
    const rakedGeo = new THREE.RingGeometry(0.5, 27.5, 64, 48); // 48 segments radially
    // Displace vertices to create physical ripples
    const posAttribute = rakedGeo.attributes.position;
    for(let i=0; i<posAttribute.count; i++) {
        const x = posAttribute.getX(i);
        const y = posAttribute.getY(i);
        const dist = Math.sqrt(x*x + y*y);
        // Sinusoidal ripple based on distance
        const ripple = Math.sin(dist * 6.0) * 0.08;
        posAttribute.setZ(i, posAttribute.getZ(i) + ripple);
    }
    rakedGeo.computeVertexNormals();
    const rakedSand = new THREE.Mesh(rakedGeo, gravelMat);
    rakedSand.rotation.x = -Math.PI / 2;
    rakedSand.position.y = 1.66; // Slightly above the base gravel
    rakedSand.receiveShadow = true;
    g.add(rakedSand);


    // Outer Moss Garden Perimeter Band
    const mossBorder = new THREE.Mesh(new THREE.RingGeometry(24.2, 27.6, 48), mossMat);
    mossBorder.rotation.x = -Math.PI / 2;
    mossBorder.position.y = 1.62;
    g.add(mossBorder);

    // Granite Stepping Stones Path (Tobi-ishi 飛石) winding gracefully to entrance
    const pathPoints = [
      [0, 27], [-0.8, 25.2], [-1.2, 23.4], [-0.5, 21.6], [0.8, 19.8],
      [1.6, 18.0], [1.4, 16.2], [0.4, 14.4], [-0.6, 12.6], [0, 10.8], [0, 9.2]
    ];
    pathPoints.forEach(([sx, sz], pi) => {
      const sRad = 0.85 + Math.sin(pi * 1.7) * 0.15;
      const stepMesh = new THREE.Mesh(new THREE.CylinderGeometry(sRad, sRad * 1.08, 0.18, 10), granite);
      stepMesh.position.set(sx, 1.68, sz);
      stepMesh.rotation.y = pi * 0.45;
      stepMesh.receiveShadow = stepMesh.castShadow = true;
      g.add(stepMesh);
    });

    // Authentic Sansonzon-gumi Monolithic Zen Rock Arrangements with Moss Skirts & Ripple Rings
    const rockGroups = [
      // NW Mountain Trinity (Main Sanzon Group: Master upright, attendant angled, low guardian)
      { cx: -15, cz: -11, items: [{ x: 0, z: 0, s: 3.4, sy: 1.5 }, { x: 2.2, z: 1.2, s: 2.1, sy: 1.0 }, { x: -1.8, z: 1.5, s: 1.5, sy: 0.75 }] },
      // SE Crane Island Group
      { cx: 16, cz: 11, items: [{ x: 0, z: 0, s: 3.0, sy: 1.35 }, { x: -1.6, z: 1.4, s: 1.8, sy: 0.9 }, { x: 1.8, z: -1.2, s: 1.4, sy: 0.7 }] },
      // SW Tortoise Island Group (Flat meditation boulder + twin flanking stones)
      { cx: -14, cz: 14, items: [{ x: 0, z: 0, s: 2.6, sy: 0.65 }, { x: 2.0, z: -1.0, s: 1.5, sy: 1.1 }, { x: -1.6, z: -1.2, s: 1.3, sy: 0.8 }] },
      // NE Solitary Sentinel Rock
      { cx: 14, cz: -15, items: [{ x: 0, z: 0, s: 2.8, sy: 1.4 }, { x: -1.4, z: 1.6, s: 1.3, sy: 0.8 }] }
    ];

    rockGroups.forEach(rg => {
      // Concentric Raked Ripple Rings (Samon 波紋) around rock island
      const rippleRings = new THREE.Mesh(new THREE.RingGeometry(3.5, 5.8, 32), new THREE.MeshPhysicalMaterial({
        color: 0xe2ded6, roughness: 0.95
      }));
      rippleRings.rotation.x = -Math.PI / 2;
      rippleRings.position.set(rg.cx, 1.62, rg.cz);
      g.add(rippleRings);

      // Lush Velvet Moss Base Skirt
      const mossMound = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.2, 0.28, 20), mossMat);
      mossMound.position.set(rg.cx, 1.66, rg.cz);
      g.add(mossMound);

      // Monolithic Boulders
      rg.items.forEach(rk => {
        const rockMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(rk.s, 1), Surfaces.photogrammetryRock(1.5));
        rockMesh.scale.set(1.0, rk.sy, 1.0);
        rockMesh.position.set(rg.cx + rk.x, 1.6 + rk.s * rk.sy * 0.65, rg.cz + rk.z);
        rockMesh.rotation.set(0.15, (rg.cx + rk.x) * 0.4, 0.1);
        rockMesh.castShadow = true;
        g.add(rockMesh);
      });
    });

    // 4 Traditional Japanese Stone Toro Lanterns (Kasuga-dōrō / Yukimi-dōrō)
    const toroPositions = [{ x: -18, z: -14 }, { x: 18, z: 14 }, { x: -15, z: 18 }, { x: 16, z: -16 }];
    toroPositions.forEach(tp => {
      const toro = new THREE.Group();
      toro.position.set(tp.x, 1.6, tp.z);

      // Hexagonal Carved Base Pedestal (Kiso)
      const tBase = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.95, 0.45, 6), granite);
      tBase.position.y = 0.22;
      tBase.castShadow = true;
      toro.add(tBase);

      // Fluted Stone Column Shaft (Sao) with Central Node
      const tShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 1.6, 8), granite);
      tShaft.position.y = 1.25;
      tShaft.castShadow = true;
      toro.add(tShaft);

      const tNode = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.25, 6), granite);
      tNode.position.y = 1.35;
      toro.add(tNode);

      // Middle Platform (Chūdai)
      const tPlatform = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.60, 0.32, 6), granite);
      tPlatform.position.y = 2.2;
      toro.add(tPlatform);

      // Light Chamber Firebox (Hibukuro) with pierced windows & warm lantern glow
      const tBox = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.85, 0.95), new THREE.MeshPhysicalMaterial({
        color: 0xffeed0, emissive: 0xffaa24, emissiveIntensity: 2.6, roughness: 0.4
      }));
      tBox.position.y = 2.78;
      toro.add(tBox);

      // Flared Hexagonal Roof (Kasa) with upturned corner tips
      const tRoof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.75, 6), slateRoof);
      tRoof.position.y = 3.55;
      tRoof.castShadow = true;
      toro.add(tRoof);

      // Sacred Lotus Jewel Finial (Hōju)
      const tJewel = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12), gold);
      tJewel.position.y = 4.08;
      toro.add(tJewel);

      g.add(toro);
    });

    // Traditional Tsukubai / Chōzubachi Water Purification Basin (手水鉢)
    const tsukubai = new THREE.Group();
    tsukubai.position.set(2.8, 1.6, 11.5);
    const tRock = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.1, 0.85, 12), Surfaces.mossyStone(1.5));
    tRock.position.y = 0.42;
    tRock.castShadow = true;
    tsukubai.add(tRock);

    const tWater = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), this.world._waterPoolMat || new THREE.MeshPhysicalMaterial({
      color: 0x184c56, roughness: 0.1, metalness: 0.2
    }));
    tWater.rotation.x = -Math.PI / 2;
    tWater.position.y = 0.86;
    tsukubai.add(tWater);

    const kakehi = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8), cedar);
    kakehi.rotation.z = -0.35;
    kakehi.position.set(-0.45, 1.0, 0);
    tsukubai.add(kakehi);

    const ladle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 8), cedar);
    ladle.position.set(0.15, 0.92, 0);
    tsukubai.add(ladle);
    g.add(tsukubai);

    // 2. 5-Tiered Japanese Gojūnotō Pagoda (五重塔)
    const pagodaGroup = new THREE.Group();
    pagodaGroup.position.set(0, 1.6, 0);

    const furinGeo = (() => {
      const parts = [];
      const hook = new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6);
      hook.translate(0, 0.18, 0);
      parts.push(hook);
      const bell = new THREE.CylinderGeometry(0.12, 0.22, 0.32, 12, 1, true);
      bell.translate(0, -0.05, 0);
      parts.push(bell);
      const dome = new THREE.SphereGeometry(0.12, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      dome.translate(0, 0.11, 0);
      parts.push(dome);
      const rod = new THREE.CylinderGeometry(0.015, 0.015, 0.55, 6);
      rod.translate(0, -0.30, 0);
      parts.push(rod);
      const leaf = new THREE.BoxGeometry(0.14, 0.38, 0.01);
      leaf.translate(0, -0.62, 0);
      parts.push(leaf);
      return safeMerge(parts, false) || parts[0];
    })();

    const tierSpecs = [
      { w: 12.0, h: 5.2, eaveOverhang: 4.0, verandaW: 14.8 }, // Tier 0 (Ground)
      { w: 10.7, h: 4.8, eaveOverhang: 3.6, verandaW: 13.0 }, // Tier 1
      { w: 9.5,  h: 4.4, eaveOverhang: 3.2, verandaW: 11.4 }, // Tier 2
      { w: 8.3,  h: 4.0, eaveOverhang: 2.8, verandaW: 9.9 },  // Tier 3
      { w: 7.2,  h: 3.6, eaveOverhang: 2.5, verandaW: 8.6 }   // Tier 4 (Top)
    ];

    let currentY = 0;

    for (let t = 0; t < 5; t++) {
      const spec = tierSpecs[t];
      const w = spec.w;
      const h = spec.h;
      const halfW = w / 2;
      const ty = currentY;

      // Engawa Veranda & Vermilion Railings (Balustrade / Kōran)
      const verandaDeck = new THREE.Mesh(new THREE.BoxGeometry(spec.verandaW, 0.45, spec.verandaW), ebonyWood);
      verandaDeck.position.y = ty + 0.22;
      verandaDeck.receiveShadow = true;
      pagodaGroup.add(verandaDeck);

      // Veranda Balustrades & Rail Posts
      const railH = 0.75;
      const railThick = 0.12;
      const balustradeGroup = new THREE.Group();
      balustradeGroup.position.y = ty + 0.45;

      // Edge Handrails (Tier 0 leaves South entrance wide open for walkthrough)
      const halfV = spec.verandaW / 2 - 0.15;
      [
        { x: 0, z: halfV, rotY: 0, len: spec.verandaW - 0.3, isSouth: true },
        { x: 0, z: -halfV, rotY: 0, len: spec.verandaW - 0.3, isSouth: false },
        { x: halfV, z: 0, rotY: Math.PI / 2, len: spec.verandaW - 0.3, isSouth: false },
        { x: -halfV, z: 0, rotY: Math.PI / 2, len: spec.verandaW - 0.3, isSouth: false }
      ].forEach(r => {
        if (t === 0 && r.isSouth) {
          // Open South central entrance portal on Ground Veranda
          [-spec.verandaW * 0.32, spec.verandaW * 0.32].forEach(hx => {
            const sideLen = spec.verandaW * 0.32;
            const topRail = new THREE.Mesh(new THREE.BoxGeometry(sideLen, railThick, railThick * 1.5), vermilionDark);
            topRail.position.set(hx, railH, r.z);
            balustradeGroup.add(topRail);
            for (let b = 0; b <= 4; b++) {
              const u = hx + (b / 4 - 0.5) * (sideLen - 0.4);
              const baluster = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, railH, 8), vermilion);
              baluster.position.set(u, railH / 2, r.z);
              balustradeGroup.add(baluster);
            }
          });
        } else {
          const topRail = new THREE.Mesh(new THREE.BoxGeometry(r.len, railThick, railThick * 1.5), vermilionDark);
          topRail.position.set(r.x, railH, r.z);
          topRail.rotation.y = r.rotY;
          balustradeGroup.add(topRail);

          // Balusters
          const count = 8;
          for (let b = 0; b <= count; b++) {
            const u = (b / count - 0.5) * (r.len - 0.4);
            const baluster = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, railH, 8), vermilion);
            if (r.rotY === 0) baluster.position.set(u, railH / 2, r.z);
            else baluster.position.set(r.x, railH / 2, u);
            balustradeGroup.add(baluster);
          }
        }
      });
      pagodaGroup.add(balustradeGroup);

      // Sanctuary Core Walls: Ground Tier 0 is hollowed for magnificent open interior & Golden Buddha Altar
      if (t === 0) {
        // Polished Hinoki / Cedar Sanctuary Floor
        const sanctuaryFloor = new THREE.Mesh(new THREE.BoxGeometry(w - 0.8, 0.12, w - 0.8), cedar);
        sanctuaryFloor.position.set(0, ty + 0.28, 0);
        sanctuaryFloor.receiveShadow = true;
        pagodaGroup.add(sanctuaryFloor);

        // Rear North Wall
        const wallNorth = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, h - 0.2, 0.4), whitePlaster);
        wallNorth.position.set(0, ty + h / 2 + 0.2, -halfW + 0.2);
        wallNorth.castShadow = wallNorth.receiveShadow = true;
        pagodaGroup.add(wallNorth);

        // West Wall
        const wallWest = new THREE.Mesh(new THREE.BoxGeometry(0.4, h - 0.2, w - 0.4), whitePlaster);
        wallWest.position.set(-halfW + 0.2, ty + h / 2 + 0.2, 0);
        wallWest.castShadow = wallWest.receiveShadow = true;
        pagodaGroup.add(wallWest);

        // East Wall
        const wallEast = new THREE.Mesh(new THREE.BoxGeometry(0.4, h - 0.2, w - 0.4), whitePlaster);
        wallEast.position.set(halfW - 0.2, ty + h / 2 + 0.2, 0);
        wallEast.castShadow = wallEast.receiveShadow = true;
        pagodaGroup.add(wallEast);

        // Front South Facade Panels (leaving central 5.2m entrance portal wide open!)
        [-halfW + 1.6, halfW - 1.6].forEach(fx => {
          const wallFrontSide = new THREE.Mesh(new THREE.BoxGeometry(3.2, h - 0.2, 0.4), whitePlaster);
          wallFrontSide.position.set(fx, ty + h / 2 + 0.2, halfW - 0.2);
          wallFrontSide.castShadow = wallFrontSide.receiveShadow = true;
          pagodaGroup.add(wallFrontSide);
        });

        // Entrance Porch Transom Beam & Carved Ranma Latticework Screen over Portal
        const transomBeam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.45, 0.5), vermilionDark);
        transomBeam.position.set(0, ty + 3.8, halfW + 0.05);
        pagodaGroup.add(transomBeam);

        const ranmaScreen = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.95, 0.12), gold);
        ranmaScreen.position.set(0, ty + 4.35, halfW + 0.05);
        pagodaGroup.add(ranmaScreen);

        // Karahafu Entrance Porch Cusped Gable Canopy
        const porchGable = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 1.2, 16, 1, false, 0, Math.PI), slateRoof);
        porchGable.rotation.x = Math.PI / 2;
        porchGable.position.set(0, ty + 4.0, halfW + 0.6);
        pagodaGroup.add(porchGable);

        // Carved Ebony & Vermilion Sliding Temple Doors (Maitogido) — SLID WIDE OPEN against side walls (Clear 5.2m width)
        [-3.2, 3.2].forEach(dx => {
          const door = new THREE.Mesh(new THREE.BoxGeometry(1.8, 3.4, 0.12), ebonyWood);
          door.position.set(dx, ty + 1.9, halfW + 0.12);
          door.castShadow = true;
          pagodaGroup.add(door);

          const doorGoldTrim = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.16, 0.14), gold);
          doorGoldTrim.position.set(dx, ty + 3.5, halfW + 0.13);
          pagodaGroup.add(doorGoldTrim);
        });

        // =========================================================================
        // MAGNIFICENT GOLDEN BUDDHA ALTAR (Butsudan / Daibutsu 仏壇)
        // =========================================================================
        const altarGroup = new THREE.Group();
        altarGroup.position.set(0, ty + 0.28, -2.8);

        // Multi-tiered Black Lacquer & Gold Shumidan Altar Dais (須弥壇)
        const dais1 = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.45, 2.8), ebonyWood);
        dais1.position.y = 0.22;
        dais1.receiveShadow = true;
        altarGroup.add(dais1);

        const daisTrim1 = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.08, 2.9), gold);
        daisTrim1.position.y = 0.45;
        altarGroup.add(daisTrim1);

        const dais2 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.45, 2.2), ebonyWood);
        dais2.position.y = 0.67;
        altarGroup.add(dais2);

        const daisTrim2 = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.08, 2.3), gold);
        daisTrim2.position.y = 0.90;
        altarGroup.add(daisTrim2);

        // Layered Carved Golden Lotus Throne (Rengeza 蓮華座)
        const lotusBase = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.2, 0.45, 16), gold);
        lotusBase.position.y = 1.12;
        lotusBase.castShadow = true;
        altarGroup.add(lotusBase);

        for (let p = 0; p < 12; p++) {
          const pAng = (p / 12) * Math.PI * 2;
          const petal = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), gold);
          petal.scale.set(1.2, 0.5, 1.8);
          petal.position.set(Math.cos(pAng) * 1.45, 1.32, Math.sin(pAng) * 1.45);
          petal.rotation.y = -pAng;
          altarGroup.add(petal);
        }

        // Sculpted Golden Meditating Buddha (Amida Nyorai / Shakyamuni)
        // Padmasana Crossed-Legs Lotus Base
        const legs = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.55, 12), gold);
        legs.position.y = 1.55;
        legs.castShadow = true;
        altarGroup.add(legs);

        // Robed Torso
        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.60, 0.90, 1.35, 12), gold);
        torso.position.y = 2.45;
        torso.castShadow = true;
        altarGroup.add(torso);

        // Arms in Dhyana Meditation Mudra
        const mudraArms = new THREE.Mesh(new THREE.TorusGeometry(0.80, 0.18, 8, 16, Math.PI), gold);
        mudraArms.rotation.x = Math.PI / 2;
        mudraArms.position.set(0, 2.05, 0.32);
        altarGroup.add(mudraArms);

        const mudraHands = new THREE.Mesh(new THREE.SphereGeometry(0.20, 8, 8), gold);
        mudraHands.position.set(0, 2.05, 0.48);
        altarGroup.add(mudraHands);

        // Buddha Head with Serene Countenance & Ushnisha Wisdom Crown
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.35, 8), gold);
        neck.position.y = 3.25;
        altarGroup.add(neck);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 16), gold);
        head.position.y = 3.75;
        head.castShadow = true;
        altarGroup.add(head);

        const ushnisha = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), gold);
        ushnisha.position.y = 4.22;
        altarGroup.add(ushnisha);

        [-0.48, 0.48].forEach(ex => {
          const ear = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.10), gold);
          ear.position.set(ex, 3.65, 0);
          altarGroup.add(ear);
        });

        // Radiating Gilded Halo / Mandorla (Kōhai 光背) with Flame Motifs
        const mandorlaDisc = new THREE.Mesh(new THREE.CircleGeometry(2.3, 32), gold);
        mandorlaDisc.position.set(0, 3.3, -0.45);
        altarGroup.add(mandorlaDisc);

        const mandorlaRim = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.12, 8, 32), gold);
        mandorlaRim.position.set(0, 3.3, -0.42);
        altarGroup.add(mandorlaRim);

        for (let ray = 0; ray < 12; ray++) {
          const rAng = (ray / 12) * Math.PI * 2;
          const flameRay = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.1, 4), gold);
          flameRay.position.set(Math.cos(rAng) * 2.5, 3.3 + Math.sin(rAng) * 2.5, -0.42);
          flameRay.rotation.z = rAng - Math.PI / 2;
          altarGroup.add(flameRay);
        }

        // Flanking Sacred Offerings
        // Brass Flower Vases (Kabin) with Lotus Blooms
        [-1.6, 1.6].forEach(vx => {
          const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.75, 12), gold);
          vase.position.set(vx, 1.25, 0.4);
          altarGroup.add(vase);

          const blossom = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24, 0), new THREE.MeshPhysicalMaterial({
            color: 0xffe8f4, emissive: 0xff88c0, emissiveIntensity: 1.8
          }));
          blossom.position.set(vx, 1.75, 0.4);
          altarGroup.add(blossom);
        });

        // Bronze Candle Stands (Rōsokutate) with Glowing Flame Points
        [-1.1, 1.1].forEach(cx => {
          const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.16, 0.85, 8), bronze);
          stand.position.set(cx, 1.30, 0.8);
          altarGroup.add(stand);

          const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.35, 8), whitePlaster);
          candle.position.set(cx, 1.85, 0.8);
          altarGroup.add(candle);

          const candleFlame = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 6), new THREE.MeshBasicMaterial({ color: 0xffaa22 }));
          candleFlame.position.set(cx, 2.08, 0.8);
          altarGroup.add(candleFlame);
        });

        // Suspended Overhead Gilded Temple Canopy (Tengai 天蓋)
        const tengai = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.25, 8), gold);
        tengai.position.set(0, 4.6, 0);
        altarGroup.add(tengai);

        // Serene Divine Golden Altar Illumination radiating through open entrance porch
        const altarGlow = new THREE.PointLight(0xffdf99, 4.2, 28);
        altarGlow.position.set(0, 3.2, 0.5);
        altarGroup.add(altarGlow);

        pagodaGroup.add(altarGroup);
      } else {
        // Upper Tiers 1-4: Sanctuary Core Walls (White Shikkui Plaster Bays)
        const plasterCore = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, h - 0.2, w - 0.2), whitePlaster);
        plasterCore.position.y = ty + h / 2 + 0.2;
        plasterCore.castShadow = plasterCore.receiveShadow = true;
        pagodaGroup.add(plasterCore);
      }

      // Traditional Vermilion Lacquer Structural Corner & Intermediate Pillars (Sumi-bashira)
      const pillarRadius = 0.36 - t * 0.03;
      const pillarGeo = new THREE.CylinderGeometry(pillarRadius * 0.95, pillarRadius, h, 16);
      const pillarOffsets = [
        [-halfW, -halfW], [0, -halfW], [halfW, -halfW],
        [-halfW, halfW], [0, halfW], [halfW, halfW],
        [-halfW, 0], [halfW, 0]
      ];
      pillarOffsets.forEach(([cx, cz]) => {
        const pillar = new THREE.Mesh(pillarGeo, vermilion);
        pillar.position.set(cx, ty + h / 2 + 0.2, cz);
        pillar.castShadow = true;
        pagodaGroup.add(pillar);
      });

      // Horizontal Vermilion Tie-Beams (Nageshi & Kashiranuki)
      [-halfW, halfW].forEach(zSide => {
        const beamMid = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.35, 0.35), vermilionDark);
        beamMid.position.set(0, ty + h * 0.55, zSide);
        const beamTop = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.40, 0.40), vermilionDark);
        beamTop.position.set(0, ty + h - 0.1, zSide);
        pagodaGroup.add(beamMid, beamTop);
      });
      [-halfW, halfW].forEach(xSide => {
        const beamMid = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, w + 0.6), vermilionDark);
        beamMid.position.set(xSide, ty + h * 0.55, 0);
        const beamTop = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.40, w + 0.8), vermilionDark);
        beamTop.position.set(xSide, ty + h - 0.1, 0);
        pagodaGroup.add(beamMid, beamTop);
      });

      // Shoji Screen Lattices (For Tier 0, South screens are on outer side bays leaving central 5.2m entrance portal wide open)
      const screenGeo = new THREE.PlaneGeometry(w * 0.38, h * 0.62);
      const screenGeoTier0South = new THREE.PlaneGeometry(w * 0.22, h * 0.62);
      const screenConfigs = [
        { x: -w * (t === 0 ? 0.36 : 0.28), z: halfW + 0.08, ry: 0, isSouthTier0: t === 0 },
        { x: w * (t === 0 ? 0.36 : 0.28), z: halfW + 0.08, ry: 0, isSouthTier0: t === 0 },
        { x: -w * 0.24, z: -halfW - 0.08, ry: Math.PI, isSouthTier0: false },
        { x: w * 0.24, z: -halfW - 0.08, ry: Math.PI, isSouthTier0: false },
        { x: halfW + 0.08, z: -w * 0.24, ry: Math.PI / 2, isSouthTier0: false },
        { x: halfW + 0.08, z: w * 0.24, ry: Math.PI / 2, isSouthTier0: false },
        { x: -halfW - 0.08, z: -w * 0.24, ry: -Math.PI / 2, isSouthTier0: false },
        { x: -halfW - 0.08, z: w * 0.24, ry: -Math.PI / 2, isSouthTier0: false },
      ];
      screenConfigs.forEach(sp => {
        const geo = sp.isSouthTier0 ? screenGeoTier0South : screenGeo;
        const screen = new THREE.Mesh(geo, shojiScreen);
        screen.position.set(sp.x, ty + h * 0.45, sp.z);
        screen.rotation.y = sp.ry;
        pagodaGroup.add(screen);
      });

      // Authentic Tokyō / Dougong Interlocking Bracket System (斗栱 - 3-Step Mitesaki Brackets)
      const bracketLevels = 3;
      const bracketGroup = new THREE.Group();
      bracketGroup.position.y = ty + h;

      pillarOffsets.forEach(([px, pz]) => {
        const nx = px === 0 ? 0 : Math.sign(px);
        const nz = pz === 0 ? 0 : Math.sign(pz);

        for (let b = 0; b < bracketLevels; b++) {
          const by = b * 0.32;
          const proj = (b + 1) * 0.38;

          // Bearing Block (Daito / Shoto)
          const block = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.18, 0.46), ebonyWood);
          block.position.set(px + nx * (proj - 0.18), by, pz + nz * (proj - 0.18));
          bracketGroup.add(block);

          // Stepped Cantilever Arms (Hijiki)
          if (nx !== 0 && nz === 0) {
            const hijikiZ = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 1.3 + b * 0.4), vermilion);
            hijikiZ.position.set(px + nx * proj, by + 0.10, pz);
            bracketGroup.add(hijikiZ);
          } else if (nz !== 0 && nx === 0) {
            const hijikiX = new THREE.Mesh(new THREE.BoxGeometry(1.3 + b * 0.4, 0.18, 0.28), vermilion);
            hijikiX.position.set(px, by + 0.10, pz + nz * proj);
            bracketGroup.add(hijikiX);
          } else if (nx !== 0 && nz !== 0) {
            const cornerHijiki = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 1.5 + b * 0.45), vermilion);
            cornerHijiki.rotation.y = (Math.PI / 4) * (nx * nz);
            cornerHijiki.position.set(px + nx * proj * 0.72, by + 0.10, pz + nz * proj * 0.72);
            bracketGroup.add(cornerHijiki);
          }
        }
      });

      // Perimeter Eave Support Purlin Beam
      const purlin = new THREE.Mesh(new THREE.BoxGeometry(w + 2.8, 0.32, w + 2.8), ebonyWood);
      purlin.position.y = bracketLevels * 0.32 + 0.05;
      bracketGroup.add(purlin);
      pagodaGroup.add(bracketGroup);

      // Flared 4-Sided Roof with Authentic Japanese Sori Curvature (反り)
      const roofSpan = (w + spec.eaveOverhang * 2) * 0.7071;
      const roofH = 2.4 + t * 0.1;
      const roofGeo = new THREE.CylinderGeometry(0.12, roofSpan, roofH, 4, 16);
      roofGeo.rotateY(Math.PI / 4);

      const rPos = roofGeo.attributes.position;
      for (let i = 0; i < rPos.count; i++) {
        const py = rPos.getY(i);
        const yFrac = Math.max(0.0, Math.min(1.0, (py + roofH * 0.5) / roofH)); // 0 at eave edge, 1 at ridge peak
        const hDist = Math.hypot(rPos.getX(i), rPos.getZ(i));

        // Bell flare curvature along roof slopes
        const flare = Math.pow(Math.max(0.0, 1.0 - yFrac), 1.7) * 1.25;
        rPos.setX(i, rPos.getX(i) * (1.0 + flare));
        rPos.setZ(i, rPos.getZ(i) * (1.0 + flare));

        // Dramatic upward corner sweep (Authentic Sori hip tip lift)
        if (yFrac < 0.35 && roofSpan > 0.001) {
          const cornerDist = Math.min(2.0, hDist / roofSpan);
          const soriLift = Math.pow(cornerDist, 2.6) * Math.pow(Math.max(0.0, 1.0 - yFrac / 0.35), 1.4) * (roofH * 0.42);
          if (!isNaN(soriLift) && isFinite(soriLift)) {
            rPos.setY(i, py + soriLift);
          }
        }
      }
      roofGeo.computeVertexNormals();
      if (roofGeo.computeBoundingSphere) roofGeo.computeBoundingSphere();
      if (roofGeo.computeBoundingBox) roofGeo.computeBoundingBox();

      const roofMesh = new THREE.Mesh(roofGeo, slateRoof);
      roofMesh.position.y = ty + h + bracketLevels * 0.32 + roofH * 0.5 + 0.1;
      roofMesh.castShadow = roofMesh.receiveShadow = true;
      pagodaGroup.add(roofMesh);

      // 4 Golden Hip Ridge Caps & Ornamental Onigawara Finials
      const ridgeY = ty + h + bracketLevels * 0.32 + roofH * 0.5 + 0.1;
      for (let c = 0; c < 4; c++) {
        const cAng = (c / 4) * Math.PI * 2 + Math.PI / 4;
        const crad = roofSpan * 1.34;
        const cornerX = Math.cos(cAng) * crad;
        const cornerZ = Math.sin(cAng) * crad;
        const cornerY = ridgeY - roofH * 0.35 + (roofH * 0.28);

        // Golden Hip Ridge line
        const hipPts = [
          new V3(0, ridgeY + roofH * 0.48, 0),
          new V3(cornerX * 0.5, ridgeY + roofH * 0.1, cornerZ * 0.5),
          new V3(cornerX, cornerY, cornerZ)
        ];
        const hipCurve = new THREE.CatmullRomCurve3(hipPts);
        const hipGeo = new THREE.TubeGeometry(hipCurve, 12, 0.18, 6, false);
        const hipMesh = new THREE.Mesh(hipGeo, gold);
        pagodaGroup.add(hipMesh);

        // Gilded Onigawara Demon-Tile / Shibi Finial at Corner Tip
        const onigawara = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 1), gold);
        onigawara.position.set(cornerX, cornerY + 0.15, cornerZ);
        pagodaGroup.add(onigawara);

        // Hanging Bronze Wind Bell (Furin / Fūtakaku 風鐸) under eave tip
        const bellMesh = new THREE.Mesh(furinGeo, bronze);
        bellMesh.position.set(cornerX * 0.95, cornerY - 0.25, cornerZ * 0.95);
        bellMesh.castShadow = true;
        pagodaGroup.add(bellMesh);
      }

      currentY += h + bracketLevels * 0.32 + roofH * 0.35;
    }

    // 3. Soaring Golden Sōrin Finial Spire (相輪) atop Tier 5
    const sorinGroup = new THREE.Group();
    sorinGroup.position.set(0, currentY + 0.8, 0);

    // Roban (Square tiered base pedestal)
    const roban1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 2.2), gold);
    roban1.position.y = 0.22;
    sorinGroup.add(roban1);

    const roban2 = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.35, 1.7), gold);
    roban2.position.y = 0.62;
    sorinGroup.add(roban2);

    // Fukubachi (Inverted bronze-gold hemisphere bowl)
    const fukubachi = new THREE.Mesh(new THREE.SphereGeometry(0.88, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), gold);
    fukubachi.position.y = 0.80;
    sorinGroup.add(fukubachi);

    // Ukebana (Sacred Lotus Petal Collar)
    const ukebana = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.55, 0.48, 16), gold);
    ukebana.position.y = 1.85;
    sorinGroup.add(ukebana);

    // Central Spire Shaft (Shinbashira extension)
    const spireH = 11.5;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.38, spireH, 16), gold);
    shaft.position.y = spireH * 0.5 + 1.4;
    sorinGroup.add(shaft);

    // Nine Sacred Cosmic Rings (Kyūrin 九輪)
    const ringBaseY = 2.8;
    const ringSpan = 5.2;
    for (let r = 0; r < 9; r++) {
      const t = r / 8;
      const ry = ringBaseY + t * ringSpan;
      const radius = 0.76 - t * 0.24;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.09, 10, 24), gold);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = ry;
      sorinGroup.add(ring);
    }

    // Suien (Openwork Water-Flame Filigree Halo Wings)
    const suienY = ringBaseY + ringSpan + 0.8;
    for (let f = 0; f < 4; f++) {
      const fAng = (f / 4) * Math.PI * 2;
      const flame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.8, 0.75), gold);
      flame.position.set(Math.cos(fAng) * 0.38, suienY + 0.9, Math.sin(fAng) * 0.38);
      flame.rotation.y = fAng;
      sorinGroup.add(flame);
    }

    // Ryūsha (Dragon Carriage Orb)
    const ryusha = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), gold);
    ryusha.position.y = suienY + 2.1;
    sorinGroup.add(ryusha);

    // Hōju (Sacred Cintamani Treasure Jewel) & Cosmic Needle Pinnacle
    const hoju = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 16), gold);
    hoju.scale.set(1.0, 1.45, 1.0);
    hoju.position.y = suienY + 3.0;
    sorinGroup.add(hoju);

    const needle = new THREE.Mesh(new THREE.ConeGeometry(0.09, 1.4, 12), gold);
    needle.position.y = suienY + 4.15;
    sorinGroup.add(needle);

    // Radiant Golden Spire Beacon Light
    const spireLight = new THREE.PointLight(0xffdf80, 2.5, 45);
    spireLight.position.y = suienY + 3.0;
    sorinGroup.add(spireLight);

    pagodaGroup.add(sorinGroup);

    // Glowing Lotus Tribute Lamps & Grand Bronze Incense Cauldron (Dai-Kōro 大香炉)
    const lotusMat = new THREE.MeshPhysicalMaterial({
      color: 0xf8a8d0, emissive: 0xe05090, emissiveIntensity: 2.4
    });
    [-4.5, 4.5].forEach(lx => {
      const lotus = new THREE.Mesh(new THREE.DodecahedronGeometry(0.72, 0), lotusMat);
      lotus.position.set(lx, 1.0, 8.2);
      pagodaGroup.add(lotus);
    });

    const koroGroup = new THREE.Group();
    koroGroup.position.set(0, 0.4, 8.8);
    const koroBody = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.85, 0.9, 24), bronze);
    koroBody.position.y = 0.75;
    koroBody.castShadow = true;
    koroGroup.add(koroBody);

    // 3 Legs on Incense Cauldron
    for (let l = 0; l < 3; l++) {
      const lang = (l / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.6, 8), bronze);
      leg.position.set(Math.cos(lang) * 0.75, 0.3, Math.sin(lang) * 0.75);
      koroGroup.add(leg);
    }

    // Smoldering Embers in Cauldron
    const embers = new THREE.Mesh(new THREE.CircleGeometry(0.9, 16), new THREE.MeshPhysicalMaterial({
      color: 0x332211, emissive: 0xff6611, emissiveIntensity: 1.8, roughness: 0.9
    }));
    embers.rotation.x = -Math.PI / 2;
    embers.position.y = 1.21;
    koroGroup.add(embers);

    pagodaGroup.add(koroGroup);

    // Saisen-bako (Traditional Wooden Offering Box)
    const saisenGroup = new THREE.Group();
    saisenGroup.position.set(0, 1.8, 6.5);
    const saisenBox = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.8, 2.0), ebonyWood);
    saisenBox.position.y = 0.9;
    saisenBox.castShadow = true;
    saisenGroup.add(saisenBox);
    
    // Slotted top lid
    const saisenLid = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.2, 2.2), ebonyWood);
    saisenLid.position.y = 1.9;
    saisenGroup.add(saisenLid);
    
    // Interactive Hitbox
    const saisenHitbox = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 4), new THREE.MeshBasicMaterial({ visible: false }));
    saisenHitbox.position.y = 1.0;
    saisenHitbox.userData = { 
      action: 'donation_pagoda', 
      label: 'Offer a Coin (Saisen)'
    };
    this.world.pickables.push(saisenHitbox);
    saisenGroup.add(saisenHitbox);
    
    pagodaGroup.add(saisenGroup);

    // 4. Iconic Kyoto Sakura Cherry Blossom Trees (Translucent Glowing SSS Blossoms)
    const cherryBlossomMat = Surfaces.sakuraBlossom(0xffffff);
    if (this.world._windMaterials) this.world._windMaterials.push(cherryBlossomMat);

    const cherryBark = Surfaces.bark(1.5);
//     cherryBark.color.setHex(0x382820);

    const createCurvedBlossomCardGeo = (w, h, curveDepth = 0.42) => {
      const geo = new THREE.PlaneGeometry(w, h, 2, 2);
      const cpos = geo.attributes.position;
      for (let i = 0; i < cpos.count; i++) {
        const x = cpos.getX(i), y = cpos.getY(i);
        const u = x / (w * 0.5), v = y / (h * 0.5);
        cpos.setZ(i, (1.0 - u * u) * curveDepth * (1.0 - v * 0.25));
      }
      geo.computeVertexNormals();
      return geo;
    };

    const sakuraTrunkGeo = (() => {
      const parts = [];
      const base = new THREE.CylinderGeometry(0.75, 1.45, 1.8, 8);
      base.translate(0, 0.9, 0);
      parts.push(base);

      for (let r = 0; r < 4; r++) {
        const ang = (r / 4) * Math.PI * 2 + 0.2;
        const root = new THREE.CylinderGeometry(0.20, 0.42, 2.4, 6);
        root.rotateZ(0.70);
        root.rotateY(ang);
        root.translate(Math.cos(ang) * 1.3, 0.4, Math.sin(ang) * 1.3);
        parts.push(root);
      }

      const trunk1 = new THREE.CylinderGeometry(0.55, 0.75, 3.8, 8);
      trunk1.rotateZ(0.12);
      trunk1.translate(0.15, 3.4, 0);
      parts.push(trunk1);

      for (let b = 0; b < 5; b++) {
        const ang = (b / 5) * Math.PI * 2 + 0.35;
        const br = new THREE.CylinderGeometry(0.16, 0.38, 5.0, 6);
        br.rotateZ(0.74);
        br.rotateY(ang);
        br.translate(Math.cos(ang) * 2.5, 6.0, Math.sin(ang) * 2.5);
        parts.push(br);
      }
      return applyOrganicWeathering(safeMerge(parts, false) || base, 0.16, 0.22, 103);
    })();

    const sakuraCanopyGeo = (() => {
      const parts = [];
      const rngS = mulberry32(7821);
      const clusterCenters = [
        [0, 10.2, 0, 5.2, 14],             // Central apex blossom cloud (14 cards)
        [3.6, 8.2, 2.0, 4.6, 10],          // East-North limb cloud (10 cards)
        [-3.6, 8.2, -2.0, 4.6, 10],        // West-South limb cloud (10 cards)
        [2.0, 8.4, 3.6, 4.6, 10],          // North-West limb cloud (10 cards)
        [-2.0, 8.4, -3.6, 4.6, 10],        // South-East limb cloud (10 cards)
        [2.8, 9.8, -2.6, 4.2, 8],          // Upper diagonal North-East (8 cards)
        [-2.8, 9.8, 2.6, 4.2, 8],          // Upper diagonal South-West (8 cards)
        [1.8, 11.2, 1.4, 3.8, 6],          // Sub-apex spire North (6 cards)
        [-1.8, 11.2, -1.4, 3.8, 6],        // Sub-apex spire South (6 cards)
      ];
      for (const [cx, cy, cz, crad, cardCount] of clusterCenters) {
        for (let p = 0; p < cardCount; p++) {
          const phi = Math.acos(1 - 2 * rngS());
          const theta = rngS() * Math.PI * 2;
          const r = crad * (0.28 + rngS() * 0.72);
          const px = cx + Math.sin(phi) * Math.cos(theta) * r;
          const py = cy + Math.cos(phi) * (r * 0.78);
          const pz = cz + Math.sin(phi) * Math.sin(theta) * r;
          const sw = 4.8 + rngS() * 1.6;
          const sh = 4.6 + rngS() * 1.5;
          const q = createCurvedBlossomCardGeo(sw, sh, 0.44);
          q.rotateX((rngS() - 0.5) * Math.PI * 0.85);
          q.rotateY(rngS() * Math.PI * 2);
          q.rotateZ((rngS() - 0.5) * 0.6);
          q.translate(px, py, pz);
          parts.push(q);
        }
      }
      const merged = safeMerge(parts, false) || parts[0];
      if (merged && merged.attributes.position && merged.attributes.normal) {
        const pos = merged.attributes.position;
        const norm = merged.attributes.normal;
        for (let i = 0; i < pos.count; i++) {
          const px = pos.getX(i), py = pos.getY(i) - 9.0, pz = pos.getZ(i);
          const rad = Math.hypot(px, py * 0.85, pz) || 1.0;
          const nx = (px / rad) * 0.82 + norm.getX(i) * 0.18;
          const ny = (py / rad) * 0.82 + norm.getY(i) * 0.18;
          const nz = (pz / rad) * 0.82 + norm.getZ(i) * 0.18;
          const len = Math.hypot(nx, ny, nz) || 1.0;
          norm.setXYZ(i, nx / len, ny / len, nz / len);
        }
        norm.needsUpdate = true;
      }
      return merged;
    })();

    const sakuraPositions = [
      { x: -34, z: -28, rot: 0.2, s: 1.20 },
      { x: 34, z: -28, rot: 1.8, s: 1.30 },
      { x: -32, z: 28, rot: 3.4, s: 1.10 },
      { x: 32, z: 28, rot: 4.9, s: 1.25 },
    ];
    sakuraPositions.forEach(sp => {
      const sakuraTree = new THREE.Group();
      sakuraTree.position.set(sp.x, 1.6, sp.z);
      sakuraTree.rotation.y = sp.rot;
      sakuraTree.scale.setScalar(sp.s);

      const trunkM = new THREE.Mesh(sakuraTrunkGeo, cherryBark);
      trunkM.castShadow = true;
      sakuraTree.add(trunkM);

      const canopyM = new THREE.Mesh(sakuraCanopyGeo, cherryBlossomMat);
      canopyM.castShadow = false;
      canopyM.receiveShadow = true;
      sakuraTree.add(canopyM);

      g.add(sakuraTree);
    });

    g.add(pagodaGroup);
        this._buildVines(g, 22, 50, 40, 800);
    
    // -------------------------------------------------------------------------
    // NEW: Eastern Pagoda Waterfall & Koi Pond (Requested by User)
    // -------------------------------------------------------------------------
    // 1. Raised Stone Koi Pond on the Terrace
    const pondGroup = new THREE.Group();
    pondGroup.position.set(-15, 1.6, 12); // South-West side of the terrace
    
    // Stone Wall
    const pondWallGeo = new THREE.CylinderGeometry(6, 6, 1.2, 24);
    const pondWall = new THREE.Mesh(pondWallGeo, granite);
    pondWall.position.y = 0.6;
    pondWall.receiveShadow = pondWall.castShadow = true;
    pondGroup.add(pondWall);
    
    // Pond Water
    const pondWaterGeo = new THREE.CylinderGeometry(5.2, 5.2, 1.1, 24);
    // Reuse the fountain pool shader if available, or create a simple blue physical material
    const pondWaterMat = new THREE.MeshPhysicalMaterial({
      color: 0x184c56, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.9, logarithmicDepthBuffer: true, depthWrite: false
    });
    const pondWater = new THREE.Mesh(pondWaterGeo, pondWaterMat);
    pondWater.position.y = 0.61; // Slightly higher to avoid z-fighting with the wall's inner floor if any (but cylinder is solid, so it intersects, which is fine)
    pondGroup.add(pondWater);
    
    // Add 8 Koi Fish to this specific pond (Miniature school)
    for(let i=0; i<8; i++) {
        const fish = this._buildKoiMesh();
        const ang = (i/8) * Math.PI * 2;
        const r = 2.5 + Math.random() * 1.5;
        fish.position.set(Math.cos(ang) * r, 0.9, Math.sin(ang) * r);
        fish.rotation.y = -ang + Math.PI/2;
        fish.scale.setScalar(0.4); // smaller koi
        const fishMat = new THREE.MeshStandardMaterial({
            color: Math.random() > 0.5 ? 0xff4400 : 0xffcc00, 
            roughness: 0.2
        });
        fish.material = fishMat;
        pondGroup.add(fish);
    }
    g.add(pondGroup);

    // 2. Continuous Waterfall dropping from the Pagoda Terrace down to the Lake
    // Local coords relative to (560, 135, -540)
    // Lake is roughly at local (-130, -125, +280).
    const pFallPoints = [
      new THREE.Vector3(-18, 1.6, 25),      // Edge of the terrace
      new THREE.Vector3(-25, -20.0, 45),    // Over the first cliff
      new THREE.Vector3(-45, -60.0, 85),    // Mid-air drop
      new THREE.Vector3(-75, -100.0, 140),  // Crashing down
      new THREE.Vector3(-105, -123.0, 190), // Lake impact zone
      new THREE.Vector3(-115, -124.5, 210), // Under surface
    ];
    const pFallCurve = new THREE.CatmullRomCurve3(pFallPoints);
    
    // Build chute ribbon manually using the internal function if accessible, 
    // or just use a TubeGeometry for the waterfall
    const pWaterfallGeo = new THREE.TubeGeometry(pFallCurve, 64, 4.5, 12, false);
    
    const pWaterfallMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      map: (this._mountainWaterfallShader && this._mountainWaterfallShader.uniforms && this._mountainWaterfallShader.uniforms.tNoise) ? this._mountainWaterfallShader.uniforms.tNoise.value : null,
      depthWrite: false,
      logarithmicDepthBuffer: true,
      side: THREE.DoubleSide
    });
    // We will apply the existing mountainWaterfall shader if possible!
    const pWaterfall = new THREE.Mesh(pWaterfallGeo, this._mountainWaterfallShader || pWaterfallMat);
    pWaterfall.frustumCulled = false;
    pWaterfall.renderOrder = 2;
    g.add(pWaterfall);
    
    // Splash ring at the bottom
    const pSplashGeo = new THREE.RingGeometry(4, 18, 32);
    const pSplash = new THREE.Mesh(pSplashGeo, this._shorelineFoamMaterial || pWaterfallMat);
    pSplash.rotation.x = -Math.PI / 2;
    pSplash.position.copy(pFallPoints[4]);
    pSplash.position.y = -124.9; // just above the lake surface (10.1 in world)
    pSplash.renderOrder = 3;
    g.add(pSplash);

    this.world.scene.add(g);
  }

  _moorishMosque() {
    const g = new THREE.Group();
    const mx = WORLD.mosque.x, mz = WORLD.mosque.z;
    const my = terrainHeight(mx, mz); // perfectly grounded foundation
    g.position.set(mx, my, mz);

    const marble = material('honedCarraraMarble', { repeat: 2.0, color: 0xfffcf8, roughness: 0.12, metalness: 0.05, physical: true, clearcoat: 0.4, clearcoatRoughness: 0.2 });
    const stone = material('agedCaenLimestone', { repeat: 3.0, color: 0xc4b7a6, roughness: 0.8, metalness: 0.0, normalScale: 1.5, aoMapIntensity: 1.3 });
    const zellij = Surfaces.moorishZellij(3.8);
    const carvedStucco = material('stuccoMuqarnas', { repeat: 2.5, color: 0xfdfaf4, roughness: 0.9, metalness: 0.0, normalScale: 2.2, aoMapIntensity: 1.8 });
    const turquoiseTile = material('moorishZellij', {
      repeat: 6.0, color: 0x1292a2, roughness: 0.04, metalness: 0.0, physical: true, clearcoat: 1.0, clearcoatRoughness: 0.01, ior: 1.65, reflectivity: 0.95, clearcoatNormalScale: 0.5
    });
    const gold = Surfaces.gold(1.0);
//     gold.color.setHex(0xffd700);
//     gold.roughness = 0.15;
//     gold.clearcoat = 0.8;
//     gold.clearcoatRoughness = 0.1;
    const darkCedar = material('timber', { repeat: 3.0, color: 0x2e1a10, roughness: 0.7, metalness: 0.0, physical: true, clearcoat: 0.1, clearcoatRoughness: 0.5, normalScale: 1.4 });
    const brass = material('bronze', { repeat: 2.0, color: 0xb5a642, roughness: 0.3, metalness: 0.8, physical: true, clearcoat: 0.3, clearcoatRoughness: 0.4 });

    // 1. Terraced Carrara Marble & Limestone Foundation Platform
    const platformGeo = new THREE.BoxGeometry(40, 4.0, 58);
    const platform = new THREE.Mesh(platformGeo, stone);
    platform.position.set(0, 0.2, 7);
    platform.receiveShadow = platform.castShadow = true;
    g.add(platform);

    const courtyardFloor = new THREE.Mesh(new THREE.PlaneGeometry(38, 56), marble);
    courtyardFloor.rotation.x = -Math.PI / 2;
    courtyardFloor.position.set(0, 2.21, 7);
    courtyardFloor.receiveShadow = true;
    g.add(courtyardFloor);

    // Decorative Zellij Mosaic Runner Borders across courtyard
    const zellijRunnerGeo = new THREE.PlaneGeometry(36, 1.4);
    zellijRunnerGeo.rotateX(-Math.PI / 2);
    [0, 18, 34].forEach(rz => {
      const runner = new THREE.Mesh(zellijRunnerGeo, zellij);
      runner.position.set(0, 2.24, rz);
      g.add(runner);
    });

    // 2. Grand Rectangular Carrara Marble Reflecting Pool (Patio de los Arrayanes style)
    const poolGroup = new THREE.Group();
    poolGroup.position.set(0, 2.2, 17); // Centered in the open court

    const poolLength = 28;
    const poolWidth = 10.5;
    const poolDepth = 0.75;

    // Sunken Basin Walls & Zellij Tiled Interior Floor
    const basinGeo = new THREE.BoxGeometry(poolWidth + 1.2, poolDepth + 0.4, poolLength + 1.2);
    const basinOuter = new THREE.Mesh(basinGeo, marble);
    basinOuter.position.y = -poolDepth * 0.5 + 0.1;
    poolGroup.add(basinOuter);

    const poolWaterGeo = new THREE.PlaneGeometry(poolWidth, poolLength);
    poolWaterGeo.rotateX(-Math.PI / 2);
    const poolWater = new THREE.Mesh(poolWaterGeo, this.world._waterPoolMat || new THREE.MeshPhysicalMaterial({
      color: 0x145262, roughness: 0.05, metalness: 0.4
    }));
    poolWater.position.y = 0.08;
    poolGroup.add(poolWater);
    if (this.world._reflectiveMeshes) this.world._reflectiveMeshes.push(poolWater);

    // Molded Carrara Marble Coping Rims with Beveled Edge
    const curbLongGeo = new THREE.BoxGeometry(0.8, 0.28, poolLength + 1.6);
    [-poolWidth / 2 - 0.4, poolWidth / 2 + 0.4].forEach(cx => {
      const curb = new THREE.Mesh(curbLongGeo, marble);
      curb.position.set(cx, 0.14, 0);
      curb.castShadow = true;
      poolGroup.add(curb);
    });

    const curbShortGeo = new THREE.BoxGeometry(poolWidth + 1.6, 0.28, 0.8);
    [-poolLength / 2 - 0.4, poolLength / 2 + 0.4].forEach(cz => {
      const curb = new THREE.Mesh(curbShortGeo, marble);
      curb.position.set(0, 0.14, cz);
      curb.castShadow = true;
      poolGroup.add(curb);
    });

    // Bubbling Scalloped Marble Fountain Bowls & Runnels at North and South Pool Ends
    [-poolLength / 2 + 1.8, poolLength / 2 - 1.8].forEach(fz => {
      const fountain = new THREE.Group();
      fountain.position.set(0, 0, fz);

      const fBase = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 0.45, 24), marble);
      fBase.position.y = 0.22;
      fountain.add(fBase);

      const fBowl = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 0.8, 0.5, 24), marble);
      fBowl.position.y = 0.65;
      fBowl.castShadow = true;
      fountain.add(fBowl);

      // Bubbling Water Dome inside fountain bowl
      const fWater = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), this.world._waterPoolMat || new THREE.MeshPhysicalMaterial({
        color: 0x22889e, roughness: 0.04, metalness: 0.35, transparent: true, logarithmicDepthBuffer: true, opacity: 0.88
      }));
      fWater.position.y = 0.68;
      fountain.add(fWater);

      const fSpout = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.6, 16), brass);
      fSpout.position.y = 1.05;
      fountain.add(fSpout);

      // Water Runnel Channel (Al-Saqiya) connecting fountain to pool
      const runnel = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 3.2), marble);
      runnel.position.set(0, 0.10, fz > 0 ? -1.8 : 1.8);
      fountain.add(runnel);

      poolGroup.add(fountain);
    });

    // Floating Water Lilies & Lotus Blossoms on Reflecting Pool
    const lilyPadGeo = new THREE.CircleGeometry(0.55, 12, 0, Math.PI * 1.85);
    lilyPadGeo.rotateX(-Math.PI / 2);
    const lilyPadMat = new THREE.MeshPhysicalMaterial({ color: 0x2d6330, roughness: 0.75, side: THREE.DoubleSide });

    const lilyPositions = [
      { x: -2.5, z: -6.0 }, { x: 3.0, z: -4.5 }, { x: -3.2, z: 2.0 },
      { x: 2.8, z: 5.5 }, { x: -2.0, z: 8.0 }, { x: 1.5, z: -9.5 }
    ];
    lilyPositions.forEach((lp, li) => {
      const pad = new THREE.Mesh(lilyPadGeo, lilyPadMat);
      pad.position.set(lp.x, 0.09, lp.z);
      pad.rotation.y = li * 1.1;
      poolGroup.add(pad);

      const blossomMat = new THREE.MeshPhysicalMaterial({
        color: li % 2 === 0 ? 0xffffff : 0xf8b4d8, emissive: 0xffe2f0, emissiveIntensity: 0.6, roughness: 0.3
      });
      const blossom = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24, 0), blossomMat);
      blossom.position.set(lp.x + 0.1, 0.18, lp.z + 0.1);
      poolGroup.add(blossom);
    });

    // Sunken Parterres with Geometric Myrtle Hedges & Stately Columnar Mediterranean Cypresses
    const cypressBark = Surfaces.bark(1.5);
    const cypressFoliageMat = Surfaces.cypressFoliage();
    if (this.world._windMaterials) this.world._windMaterials.push(cypressFoliageMat);

    const createCurvedCypressCardGeo = (w, h, curveDepth = 0.35) => {
      const geo = new THREE.PlaneGeometry(w, h, 2, 2);
      const cpos = geo.attributes.position;
      for (let i = 0; i < cpos.count; i++) {
        const x = cpos.getX(i), y = cpos.getY(i);
        const u = x / (w * 0.5), v = y / (h * 0.5);
        cpos.setZ(i, (1.0 - u * u) * curveDepth * (1.0 - v * 0.25));
      }
      geo.computeVertexNormals();
      return geo;
    };

    const cypressTrunkGeo = (() => {
      const parts = [];
      const base = new THREE.CylinderGeometry(0.55, 1.1, 1.8, 8);
      base.translate(0, 0.9, 0);
      parts.push(base);

      const trunk = new THREE.CylinderGeometry(0.28, 0.55, 5.5, 8);
      trunk.translate(0, 4.25, 0);
      parts.push(trunk);
      return safeMerge(parts, false) || base;
    })();

    const cypressCanopyGeo = (() => {
      const parts = [];
      const numSprigs = 56;
      const goldenAngle = 2.39996;
      for (let i = 0; i < numSprigs; i++) {
        const frac = i / (numSprigs - 1);
        const y = 1.4 + frac * 16.5;
        const ang = i * goldenAngle;
        const profile = Math.sin(Math.pow(frac, 0.45) * Math.PI);
        const radius = (0.65 * profile + 0.18);
        
        const cardW = 1.45 * (1.0 - frac * 0.30);
        const cardH = 2.4 * (1.0 - frac * 0.30);
        const q1 = createCurvedCypressCardGeo(cardW, cardH, 0.28);
        q1.rotateX(0.18 + (1.0 - frac) * 0.20);
        q1.rotateY(ang);
        q1.translate(Math.cos(ang) * radius, y, Math.sin(ang) * radius);
        parts.push(q1);
      }
      const merged = safeMerge(parts, false) || parts[0];
      if (merged && merged.attributes.position && merged.attributes.normal) {
        const pos = merged.attributes.position;
        const norm = merged.attributes.normal;
        for (let i = 0; i < pos.count; i++) {
          const px = pos.getX(i), pz = pos.getZ(i);
          const rad = Math.hypot(px, pz) || 1.0;
          const nx = (px / rad) * 0.85 + norm.getX(i) * 0.15;
          const ny = 0.15 + norm.getY(i) * 0.15;
          const nz = (pz / rad) * 0.85 + norm.getZ(i) * 0.15;
          const len = Math.hypot(nx, ny, nz) || 1.0;
          norm.setXYZ(i, nx / len, ny / len, nz / len);
        }
        norm.needsUpdate = true;
      }
      return merged;
    })();

    // Flanking East and West Sunken Flower Beds & Cypress Columns
    [-11.5, 11.5].forEach(px => {
      // Sunken planter curb
      const planter = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.35, 32), marble);
      planter.position.set(px, 0.18, 0);
      poolGroup.add(planter);

      const planterSoil = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 31.4), new THREE.MeshPhysicalMaterial({
        color: 0x3d3226, roughness: 0.95
      }));
      planterSoil.rotation.x = -Math.PI / 2;
      planterSoil.position.set(px, 0.36, 0);
      poolGroup.add(planterSoil);

      // Manicured Boxwood / Myrtle Hedge
      const hedge = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.65, 31), new THREE.MeshPhysicalMaterial({
        color: 0x224e24, roughness: 0.85
      }));
      hedge.position.set(px, 0.68, 0);
      hedge.castShadow = true;
      poolGroup.add(hedge);

      // 4 Columnar Mediterranean Cypresses along each side
      for (let cyZ = -12; cyZ <= 12; cyZ += 8) {
        const cypressTree = new THREE.Group();
        cypressTree.position.set(px, 0.36, cyZ);

        const trunkMesh = new THREE.Mesh(cypressTrunkGeo, cypressBark);
        trunkMesh.castShadow = true;
        cypressTree.add(trunkMesh);

        const canopyMesh = new THREE.Mesh(cypressCanopyGeo, cypressFoliageMat);
        canopyMesh.castShadow = false;
        canopyMesh.receiveShadow = true;
        cypressTree.add(canopyMesh);

        poolGroup.add(cypressTree);
      }
    });

    g.add(poolGroup);

    // 3. Alhambra Grand Hypostyle Horseshoe & Polylobed Arcade Portico (North Sanctuary)
    const hallGroup = new THREE.Group();
    hallGroup.position.set(0, 2.2, -10);

    // Sanctuary Floor with Carrara Marble & Zellij Inlays
    const hallFloor = new THREE.Mesh(new THREE.BoxGeometry(34, 0.6, 20), zellij);
    hallFloor.position.y = 0.3;
    hallFloor.receiveShadow = true;
    hallGroup.add(hallFloor);

    // Sanctuary Enclosure Walls
    const rearWall = new THREE.Mesh(new THREE.BoxGeometry(34, 11.0, 1.8), marble);
    rearWall.position.set(0, 5.8, -9.2);
    rearWall.castShadow = rearWall.receiveShadow = true;
    hallGroup.add(rearWall);

    // Side Sanctuary Walls (West Wall solid; East Wall has Open Horseshoe Exit Arch at z = 2 to 6 leading to eastern arcade)
    const sideW_West = new THREE.Mesh(new THREE.BoxGeometry(1.8, 11.0, 20), marble);
    sideW_West.position.set(-17, 5.8, 0);
    sideW_West.castShadow = sideW_West.receiveShadow = true;
    hallGroup.add(sideW_West);

    // East Wall sections flanking the open exit portal (world x = -455, z = -195)
    const sideW_East_Rear = new THREE.Mesh(new THREE.BoxGeometry(1.8, 11.0, 11.0), marble);
    sideW_East_Rear.position.set(17, 5.8, -4.5);
    sideW_East_Rear.castShadow = sideW_East_Rear.receiveShadow = true;
    hallGroup.add(sideW_East_Rear);

    const sideW_East_Front = new THREE.Mesh(new THREE.BoxGeometry(1.8, 11.0, 3.0), marble);
    sideW_East_Front.position.set(17, 5.8, 8.5);
    sideW_East_Front.castShadow = sideW_East_Front.receiveShadow = true;
    hallGroup.add(sideW_East_Front);

    const sideW_East_Top = new THREE.Mesh(new THREE.BoxGeometry(1.8, 3.5, 6.0), marble);
    sideW_East_Top.position.set(17, 9.55, 4.0);
    sideW_East_Top.castShadow = true;
    hallGroup.add(sideW_East_Top);

    // 2.4m High Continuous Zellij Geometric Mosaic Dado along interior walls
    const dadoGeo = new THREE.BoxGeometry(33.8, 2.6, 0.1);
    const dadoRear = new THREE.Mesh(dadoGeo, zellij);
    dadoRear.position.set(0, 1.6, -8.2);
    hallGroup.add(dadoRear);

    // Carved Golden Mihrab Niche (Nicho del Mihrab) in Rear Wall
    const mihrabGroup = new THREE.Group();
    mihrabGroup.position.set(0, 0, -8.1);

    const mihrabFrame = new THREE.Mesh(new THREE.BoxGeometry(5.2, 8.2, 0.4), carvedStucco);
    mihrabFrame.position.y = 4.1;
    mihrabGroup.add(mihrabFrame);

    const mihrabNiche = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 6.2, 24, 1, false, 0, Math.PI), zellij);
    mihrabNiche.rotation.y = Math.PI / 2;
    mihrabNiche.position.y = 3.6;
    mihrabGroup.add(mihrabNiche);

    const mihrabDome = new THREE.Mesh(new THREE.SphereGeometry(1.8, 24, 12, 0, Math.PI, 0, Math.PI / 2), gold);
    mihrabDome.position.y = 6.7;
    mihrabGroup.add(mihrabDome);

    const mihrabLight = new THREE.PointLight(0xffe4a0, 3.6, 25);
    mihrabLight.position.set(0, 4.5, 0.8);
    mihrabGroup.add(mihrabLight);
    
    // Sadaqah (Charity Donation Box)
    const sadaqahGroup = new THREE.Group();
    sadaqahGroup.position.set(3.2, 0.0, -7.0);
    const sadaqahBox = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 1.0), darkCedar);
    sadaqahBox.position.y = 0.6;
    sadaqahBox.castShadow = true;
    sadaqahGroup.add(sadaqahBox);
    
    const sadaqahLid = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 1.1), brass);
    sadaqahLid.position.y = 1.25;
    sadaqahGroup.add(sadaqahLid);
    
    const sadaqahHitbox = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshBasicMaterial({ visible: false }));
    sadaqahHitbox.position.y = 1.0;
    sadaqahHitbox.userData = { action: 'donation_mosque', label: 'Offer Sadaqah (Charity)' };
    this.world.pickables.push(sadaqahHitbox);
    sadaqahGroup.add(sadaqahHitbox);
    
    hallGroup.add(sadaqahGroup);
    hallGroup.add(mihrabGroup);

    // Carved Plaster Stucco Muqarnas Corbels (Mocárabes Honeycomb Stalactites)
    const muqarnasClusterGeo = (() => {
      const parts = [];
      const tiers = 4;
      const width = 1.4;
      const height = 1.2;
      const depth = 0.8;
      for (let t = 0; t < tiers; t++) {
        const ty = (t / tiers) * height;
        const stepH = height / tiers;
        const count = t + 2;
        const cellW = width / count;
        const proj = ((t + 1) / tiers) * depth;
        for (let c = 0; c < count; c++) {
          const cx = -width / 2 + (c + 0.5) * cellW;
          const cell = new THREE.BoxGeometry(cellW * 0.94, stepH * 0.94, proj);
          cell.translate(cx, ty + stepH * 0.5, proj * 0.5);
          parts.push(cell);
        }
      }
      return safeMerge(parts, false) || parts[0];
    })();

    // Sebka Diamond Lattice Tracery Screen Geometry
    const sebkaPanelGeo = (() => {
      const parts = [];
      const pw = 3.4, ph = 2.4;
      const border = new THREE.BoxGeometry(pw + 0.2, ph + 0.2, 0.15);
      parts.push(border);
      const diagLen = 1.4;
      const diagAngle = 0.85;
      for (let ix = -3; ix <= 3; ix++) {
        const s1 = new THREE.BoxGeometry(diagLen, 0.08, 0.12);
        s1.rotateZ(diagAngle);
        s1.translate(ix * 0.55, 0, 0.04);
        parts.push(s1);
        const s2 = new THREE.BoxGeometry(diagLen, 0.08, 0.12);
        s2.rotateZ(-diagAngle);
        s2.translate(ix * 0.55, 0, 0.04);
        parts.push(s2);
      }
      return safeMerge(parts, false) || parts[0];
    })();

    // Slender Paired & Single Marble Columns with Fluted Bases and Carved Capitals
    const colGeo = new THREE.CylinderGeometry(0.30, 0.36, 6.2, 16);
    const capGeo = new THREE.BoxGeometry(0.95, 0.55, 0.95);
    const baseGeo = new THREE.BoxGeometry(0.95, 0.35, 0.95);

    // Horseshoe Keyhole Arch Geometry (Arco de Herradura)
    const horseshoeGeo = (() => {
      const shape = new THREE.Shape();
      const rInner = 1.65;
      const rOuter = 2.15;
      const startAng = -0.26;
      const endAng = Math.PI + 0.26;
      const segs = 24;
      const pts = [];
      for (let i = 0; i <= segs; i++) {
        const a = startAng + (i / segs) * (endAng - startAng);
        pts.push(new THREE.Vector2(Math.cos(a) * rInner, Math.sin(a) * rInner));
      }
      for (let i = segs; i >= 0; i--) {
        const a = startAng + (i / segs) * (endAng - startAng);
        pts.push(new THREE.Vector2(Math.cos(a) * rOuter, Math.sin(a) * rOuter));
      }
      shape.setFromPoints(pts);
      return new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
    })();

    // Central Multi-foil Lobed Portal Arch (Arco Polilobulado - 7 Lobes)
    const multifoilPortalGeo = (() => {
      const shape = new THREE.Shape();
      const mainR = 2.4;
      const numLobes = 7;
      const lobeR = (mainR * Math.PI) / (numLobes * 2.1);
      const startAng = -0.15;
      const totalAng = Math.PI + 0.30;
      const pts = [];

      for (let l = 0; l < numLobes; l++) {
        const midLobeAng = startAng + ((l + 0.5) / numLobes) * totalAng;
        const lcx = Math.cos(midLobeAng) * mainR;
        const lcy = Math.sin(midLobeAng) * mainR;
        for (let s = 0; s <= 6; s++) {
          const la = midLobeAng - Math.PI / 2 + (s / 6) * Math.PI;
          pts.push(new THREE.Vector2(lcx + Math.cos(la) * lobeR, lcy + Math.sin(la) * lobeR));
        }
      }
      // Outer rectangular frame
      pts.push(new THREE.Vector2(mainR * 1.35, -0.4));
      pts.push(new THREE.Vector2(mainR * 1.35, mainR * 1.45));
      pts.push(new THREE.Vector2(-mainR * 1.35, mainR * 1.45));
      pts.push(new THREE.Vector2(-mainR * 1.35, -0.4));
      shape.setFromPoints(pts);
      return new THREE.ExtrudeGeometry(shape, { depth: 0.85, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 });
    })();

    // Front Arcade Colonnade (Z = 8.8) with Central Grand Multi-Foil Portal & Flanking Horseshoe Arches
    const colPositions = [-14, -10, -6, -2.5, 2.5, 6, 10, 14];
    colPositions.forEach((cx, ci) => {
      // Column Base & Shaft & Capital
      const cBase = new THREE.Mesh(baseGeo, marble);
      cBase.position.set(cx, 0.48, 8.8);
      hallGroup.add(cBase);

      const col = new THREE.Mesh(colGeo, marble);
      col.position.set(cx, 3.4, 8.8);
      col.castShadow = true;
      hallGroup.add(col);

      const cap = new THREE.Mesh(capGeo, carvedStucco);
      cap.position.set(cx, 6.7, 8.8);
      hallGroup.add(cap);

      // Muqarnas Stalactite Corbel beneath Arch Spandrel
      const muq = new THREE.Mesh(muqarnasClusterGeo, carvedStucco);
      muq.position.set(cx, 6.9, 8.4);
      hallGroup.add(muq);

      // Arches connecting columns
      if (ci < colPositions.length - 1) {
        const nextX = colPositions[ci + 1];
        const midX = (cx + nextX) / 2;

        if (Math.abs(midX) < 1.0) {
          // Central Multi-foil Lobed Portal (z = -195 fly-through arch)
          const portalArch = new THREE.Mesh(multifoilPortalGeo, carvedStucco);
          portalArch.position.set(0, 6.6, 8.4);
          hallGroup.add(portalArch);
        } else {
          // Horseshoe Keyhole Arch
          const arch = new THREE.Mesh(horseshoeGeo, carvedStucco);
          arch.position.set(midX, 6.7, 8.4);
          hallGroup.add(arch);
        }
      }
    });

    // Side Return Colonnades (X = -14 and X = 14) with Open Eastern Arcade Exit Arch
    for (let rz = -4; rz <= 6; rz += 4) {
      [-14, 14].forEach(rx => {
        const cBase = new THREE.Mesh(baseGeo, marble);
        cBase.position.set(rx, 0.48, rz);
        hallGroup.add(cBase);

        const col = new THREE.Mesh(colGeo, marble);
        col.position.set(rx, 3.4, rz);
        col.castShadow = true;
        hallGroup.add(col);

        const cap = new THREE.Mesh(capGeo, carvedStucco);
        cap.position.set(rx, 6.7, rz);
        hallGroup.add(cap);

        const muq = new THREE.Mesh(muqarnasClusterGeo, carvedStucco);
        muq.position.set(rx, 6.9, rz - 0.4);
        hallGroup.add(muq);

        if (rx === 14 && rz >= 2) {
          // Open Eastern Arcade Exit Arch (world x = -455, z = -195) with ZERO blocking screens!
          const exitArch = new THREE.Mesh(horseshoeGeo, carvedStucco);
          exitArch.position.set(rx, 6.7, rz + 2.0);
          exitArch.rotation.y = Math.PI / 2;
          hallGroup.add(exitArch);
        } else {
          // Carved Arabesque Mashrabiya Latticework Screen between outer bays
          const mashrabiya = new THREE.Mesh(sebkaPanelGeo, carvedStucco);
          mashrabiya.position.set(rx > 0 ? rx + 0.1 : rx - 0.1, 4.2, rz + 2.0);
          mashrabiya.rotation.y = Math.PI / 2;
          hallGroup.add(mashrabiya);
        }
      });
    }

    // Carved Entablature & Sebka Tracery Frieze above Arches
    const frieze = new THREE.Mesh(new THREE.BoxGeometry(34, 2.6, 18), zellij);
    frieze.position.set(0, 9.4, 0);
    frieze.castShadow = true;
    hallGroup.add(frieze);

    // Carved Cedar Wood Coffered Ceiling Beams (Alfarje)
    for (let bz = -7; bz <= 7; bz += 2.8) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(33.6, 0.45, 0.35), darkCedar);
      beam.position.set(0, 8.2, bz);
      hallGroup.add(beam);
    }

    // 4. Sculpted Ribbed Central Dome (Qubba / Gumbad) & Octagonal Drum
    const domeDrumGeo = new THREE.CylinderGeometry(7.2, 7.6, 2.8, 8);
    const domeDrum = new THREE.Mesh(domeDrumGeo, carvedStucco);
    domeDrum.position.set(0, 11.8, 0);
    domeDrum.castShadow = true;
    hallGroup.add(domeDrum);

    // 8 Horseshoe Arched Drum Clerestory Windows with warm lantern radiance
    for (let w = 0; w < 8; w++) {
      const wAng = (w / 8) * Math.PI * 2;
      const wx = Math.cos(wAng) * 7.4;
      const wz = Math.sin(wAng) * 7.4;
      const windowMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.0), new THREE.MeshPhysicalMaterial({
        color: 0xfff0cc, emissive: 0xffaa24, emissiveIntensity: 2.2
      }));
      windowMesh.position.set(wx, 11.8, wz);
      windowMesh.rotation.y = -wAng - Math.PI / 2;
      hallGroup.add(windowMesh);
    }

    // Classic Ribbed Ogival Dome Profile Curve
    const domePoints = [];
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      const r = Math.sin(u * Math.PI * 0.78) * 7.0 * (1.0 - Math.pow(u, 2.2) * 0.52);
      const y = u * 9.8;
      domePoints.push(new THREE.Vector2(Math.max(0.01, r), y));
    }
    const domeGeo = new THREE.LatheGeometry(domePoints, 32);
    const domeMesh = new THREE.Mesh(domeGeo, turquoiseTile);
    domeMesh.position.set(0, 13.2, 0);
    domeMesh.castShadow = true;
    hallGroup.add(domeMesh);

    // 16 Meridian Sculpted Golden Ribs on Dome
    const ribPts = domePoints.map(p => new THREE.Vector3(p.x * 1.02, p.y + 13.2, 0));
    const ribCurve = new THREE.CatmullRomCurve3(ribPts);
    const ribGeo = new THREE.TubeGeometry(ribCurve, 20, 0.14, 8, false);

    for (let r = 0; r < 16; r++) {
      const ribAng = (r / 16) * Math.PI * 2;
      const ribMesh = new THREE.Mesh(ribGeo, gold);
      ribMesh.rotation.y = ribAng;
      hallGroup.add(ribMesh);
    }

    // Andalusian Gilded Yamur (3 Descending Celestial Spheres) & Grand Crescent (Hilal) Finial
    const domeFinialGroup = new THREE.Group();
    domeFinialGroup.position.set(0, 23.0, 0);

    const spireMast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.32, 4.2, 12), gold);
    spireMast.position.y = 2.1;
    domeFinialGroup.add(spireMast);

    // 3 Yamur Golden Spheres
    [0.9, 2.1, 3.1].forEach((sy, si) => {
      const sRad = 0.52 - si * 0.11;
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(sRad, 16, 16), gold);
      sphere.position.y = sy;
      domeFinialGroup.add(sphere);
    });

    // Soaring Gilded Crescent (Hilal)
    const domeCrescent = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.16, 10, 24, Math.PI * 1.5), gold);
    domeCrescent.position.set(0, 4.4, 0);
    domeCrescent.rotation.y = Math.PI / 4;
    domeFinialGroup.add(domeCrescent);

    const domeLight = new THREE.PointLight(0xffeed0, 2.8, 50);
    domeLight.position.y = 4.4;
    domeFinialGroup.add(domeLight);
    hallGroup.add(domeFinialGroup);

    // 5. Slender Octagonal Moorish Minaret Tower on North-West Corner (Alminar)
    const minaret = new THREE.Group();
    minaret.position.set(-17, 0, -8);

    // Solid Square Stone Plinth with Zellij Band
    const mBase = new THREE.Mesh(new THREE.BoxGeometry(5.2, 5.0, 5.2), stone);
    mBase.position.y = 2.5;
    minaret.add(mBase);

    const mBaseZellij = new THREE.Mesh(new THREE.BoxGeometry(5.25, 1.2, 5.25), zellij);
    mBaseZellij.position.y = 4.4;
    minaret.add(mBaseZellij);

    // Soaring Octagonal Tower Shaft with Multi-Tier Windows
    const mTower = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.3, 26, 8), marble);
    mTower.position.y = 18;
    mTower.castShadow = true;
    minaret.add(mTower);

    // 3 Tiers of Twin Horseshoe Arched Ajimez Windows
    [10, 16, 22].forEach(wy => {
      const winGeo = new THREE.BoxGeometry(1.1, 1.8, 0.3);
      [-1, 1].forEach(side => {
        const win = new THREE.Mesh(winGeo, zellij);
        win.position.set(side * 0.7, wy, 2.0);
        minaret.add(win);
      });
    });

    // Muezzin Balcony with Carved Muqarnas Honeycomb Corbels & Pierced Balustrade
    const mMuqarnas = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.0, 1.6, 8), carvedStucco);
    mMuqarnas.position.y = 31.2;
    minaret.add(mMuqarnas);

    const mBalcony = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.9, 8), marble);
    mBalcony.position.y = 32.4;
    minaret.add(mBalcony);

    // Upper Octagonal Lantern Pavilion Cupola with Turquoise Zellij Roof
    const mCupolaPillars = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 3.2, 8, 1, true), marble);
    mCupolaPillars.position.y = 34.2;
    minaret.add(mCupolaPillars);

    const mCupolaRoof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 4.2, 8), turquoiseTile);
    mCupolaRoof.position.y = 37.8;
    mCupolaRoof.castShadow = true;
    minaret.add(mCupolaRoof);

    // Gilded Minaret Yamur & Crescent
    const mCrescentGroup = new THREE.Group();
    mCrescentGroup.position.set(0, 40.2, 0);

    const mSpire = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.18, 2.4, 8), gold);
    mSpire.position.y = 1.2;
    mCrescentGroup.add(mSpire);

    const mSphere = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), gold);
    mSphere.position.y = 1.4;
    mCrescentGroup.add(mSphere);

    const mCrescent = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.11, 8, 18, Math.PI * 1.5), gold);
    mCrescent.position.set(0, 2.6, 0);
    mCrescent.rotation.y = Math.PI / 4;
    mCrescentGroup.add(mCrescent);
    minaret.add(mCrescentGroup);

    hallGroup.add(minaret);

    // 6. Hanging Pierced Moroccan Brass Filigree Lanterns (Fanoos) along Front Arcade & Prayer Hall Nave
    const hangingLampMat = new THREE.MeshPhysicalMaterial({
      color: 0xfffae0,
      emissive: 0xffb540,
      emissiveIntensity: 2.8,
      roughness: 0.25,
      metalness: 0.85,
    });

    // Arcade & Nave Lantern Placements guiding the eye to the Golden Mihrab
    const lanternPositions = [
      // Front arcade row (Z = 8.8)
      { x: -10, y: 6.2, z: 8.8 }, { x: -5, y: 6.2, z: 8.8 }, { x: 0, y: 6.2, z: 8.8 }, { x: 5, y: 6.2, z: 8.8 }, { x: 10, y: 6.2, z: 8.8 },
      // Central nave aisle row leading into prayer hall towards Mihrab
      { x: 0, y: 7.2, z: 3.5 }, { x: -4.5, y: 7.0, z: 0.0 }, { x: 4.5, y: 7.0, z: 0.0 },
      { x: 0, y: 7.2, z: -2.0 }, { x: -4.5, y: 7.0, z: -5.0 }, { x: 4.5, y: 7.0, z: -5.0 },
      { x: 0, y: 6.8, z: -6.5 },
    ];

    lanternPositions.forEach(lp => {
      const lampGroup = new THREE.Group();
      lampGroup.position.set(lp.x, lp.y, lp.z);

      // Delicate Brass Hanging Chain
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), brass);
      chain.position.y = 0.7;
      lampGroup.add(chain);

      // Faceted Pierced Octahedral Lantern Body
      const lampBody = new THREE.Mesh(new THREE.OctahedronGeometry(0.65, 0), hangingLampMat);
      lampGroup.add(lampBody);

      // Pierced Cap & Pendant Drop
      const lampCap = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.45, 8), brass);
      lampCap.position.y = 0.45;
      lampGroup.add(lampCap);

      const lampDrop = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.40, 8), brass);
      lampDrop.rotation.x = Math.PI;
      lampDrop.position.y = -0.45;
      lampGroup.add(lampDrop);

      // Subtle warm amber lantern glow along central aisle
      if (lp.x === 0 && (lp.z === 8.8 || lp.z === 3.5 || lp.z === -2.0)) {
        const lampLight = new THREE.PointLight(0xffb84d, 1.8, 16);
        lampLight.position.y = -0.3;
        lampGroup.add(lampLight);
      }

      hallGroup.add(lampGroup);
    });

    // 7. Open Symmetrical Horseshoe Portal Archway at South Courtyard Entrance Threshold (z = 34)
    const southPortalGroup = new THREE.Group();
    southPortalGroup.position.set(0, 2.2, 34);

    [-4.5, 4.5].forEach(px => {
      const pCol = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.48, 5.8, 16), marble);
      pCol.position.set(px, 2.9, 0);
      pCol.castShadow = true;
      southPortalGroup.add(pCol);

      const pCap = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 1.2), carvedStucco);
      pCap.position.set(px, 5.9, 0);
      southPortalGroup.add(pCap);
    });

    const southArch = new THREE.Mesh(horseshoeGeo, carvedStucco);
    southArch.position.set(0, 5.8, -0.4);
    southPortalGroup.add(southArch);

    const southLintel = new THREE.Mesh(new THREE.BoxGeometry(10.5, 1.2, 1.2), zellij);
    southLintel.position.set(0, 8.2, 0);
    southPortalGroup.add(southLintel);

    g.add(southPortalGroup);

    g.add(hallGroup);
    this.world.scene.add(g);
  }

  _roads() {
    // 1. Build Grand Ceremonial Boulevard with Honed Roman Travertine, dark porphyry runners, and Carrara marble curbs
    const grandBoulevard = buildGrandBoulevard();
    this.world.scene.add(grandBoulevard);

    // 2. Build Secondary Roads (Plaza Ring, Lakeshore Way, Shoreline Path, Summit Ascent, Pinewood Lane, etc.)
    for (const r of ROADS) {
      if (r.name === 'Grand Boulevard') continue; // Grand Boulevard is built with architectural travertine above
      const m = buildSecondaryRoad(r);
      this.world.scene.add(m);
    }
  }

  _plaza() {
    const { x, z, r } = WORLD.plaza;
    const y = terrainHeight(x, z);
    const g = new THREE.Group();




    // Luminous Classical & PBR Materials
    const marble = Surfaces.honedCarraraMarble(1.5);
    const stone = Surfaces.agedCaenLimestone(4.0);
    const graniteDark = material('granite', {
      repeat: 2, color: 0x1a1d20, roughness: 0.22, metalness: 0.12, physical: true, clearcoat: 0.70, clearcoatRoughness: 0.12
    });

    // Deep Crystalline Lapis Lazuli PBR Material with Pyrite Flecks & Calcite Veins
    const lapisMaterial = Surfaces.lapisLazuli(1.0);

    const iron = Surfaces.iron(2);
    const gold = Surfaces.celestialGold(1.0);
    const darkBronze = Surfaces.verdigrisBronze(1.0);

    const foliage = Surfaces.foliage(1, 0x3d6b38);
    const jasminePetal = Surfaces.petal(1, 0xffffff);
    const rosePetal = Surfaces.petal(1, 0xfceee9);

    const lanternCoreMat = new THREE.MeshBasicMaterial({ color: 0xfffae8 });
    const haloMat = new THREE.SpriteMaterial({
      map: this.world._glowTex || null,
      color: 0xffdf88,
      transparent: true, logarithmicDepthBuffer: true, opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    // 1. Multi-Tiered Plaza Foundation Platform (deeply embedded to eliminate any terrain gaps)
    const baseDisc = new THREE.Mesh(new THREE.CylinderGeometry(r + 2, r + 6, 6.5, 64), stone);
    baseDisc.position.y = -1.8;
    baseDisc.receiveShadow = true;
    g.add(baseDisc);

    // 2. High-Resolution Radiating Celestial Starburst Inlay Mosaic Pavement (32-Point Compass)
    const cnvMosaic = document.createElement('canvas');
    cnvMosaic.width = 512; cnvMosaic.height = 512;
    const ctxM = cnvMosaic.getContext('2d');
    ctxM.scale(0.25, 0.25);

    // Base: Carrara white marble with soft stone grain
    ctxM.fillStyle = '#eae5d8';
    ctxM.fillRect(0, 0, 2048, 2048);

    // Subtle marble veining texture pass
    ctxM.strokeStyle = '#d4cebf';
    ctxM.lineWidth = 3;
    for (let v = 0; v < 30; v++) {
      ctxM.beginPath();
      ctxM.moveTo(Math.random() * 2048, Math.random() * 2048);
      ctxM.bezierCurveTo(Math.random() * 2048, Math.random() * 2048, Math.random() * 2048, Math.random() * 2048, Math.random() * 2048, Math.random() * 2048);
      ctxM.stroke();
    }

    // Outer Concentric Guilloche / Roman Wave Mosaic Border
    const center = 1024;
    const maxR = 980;

    // Dark gabbro border bands
    ctxM.strokeStyle = '#181b1d';
    ctxM.lineWidth = 24;
    ctxM.beginPath(); ctxM.arc(center, center, maxR, 0, Math.PI * 2); ctxM.stroke();
    ctxM.strokeStyle = '#d4af37';
    ctxM.lineWidth = 10;
    ctxM.beginPath(); ctxM.arc(center, center, maxR - 20, 0, Math.PI * 2); ctxM.stroke();

    // Radiating Cobblestone Fan Arcs (Granite & Travertine)
    ctxM.strokeStyle = 'rgba(120, 110, 95, 0.45)';
    ctxM.lineWidth = 2;
    for (let rad = 420; rad < maxR - 40; rad += 28) {
      ctxM.beginPath(); ctxM.arc(center, center, rad, 0, Math.PI * 2); ctxM.stroke();
    }
    for (let a = 0; a < 64; a++) {
      const ang = (a / 64) * Math.PI * 2;
      ctxM.beginPath();
      ctxM.moveTo(center + Math.cos(ang) * 420, center + Math.sin(ang) * 420);
      ctxM.lineTo(center + Math.cos(ang) * (maxR - 40), center + Math.sin(ang) * (maxR - 40));
      ctxM.stroke();
    }

    // Decorative Floral & Geometric Mosaic Tile Ring
    for (let i = 0; i < 48; i++) {
      const ang = (i / 48) * Math.PI * 2;
      const r_center = 340;
      const x = center + Math.cos(ang) * r_center;
      const y = center + Math.sin(ang) * r_center;
      
      // Diamond mosaic tiles
      ctxM.fillStyle = (i % 2 === 0) ? '#16191b' : '#3c4a3e'; // Black and dark green
      ctxM.beginPath();
      ctxM.moveTo(x + Math.cos(ang) * 30, y + Math.sin(ang) * 30);
      ctxM.lineTo(x + Math.cos(ang + Math.PI/2) * 15, y + Math.sin(ang + Math.PI/2) * 15);
      ctxM.lineTo(x - Math.cos(ang) * 30, y - Math.sin(ang) * 30);
      ctxM.lineTo(x - Math.cos(ang + Math.PI/2) * 15, y - Math.sin(ang + Math.PI/2) * 15);
      ctxM.closePath();
      ctxM.fill();

      // Gold dots
      ctxM.fillStyle = '#d4af37';
      ctxM.beginPath();
      ctxM.arc(x, y, 5, 0, Math.PI * 2);
      ctxM.fill();
    }

    // Inner patterned ring
    ctxM.strokeStyle = '#2c3a2e';
    ctxM.lineWidth = 8;
    for (let i = 0; i < 90; i++) {
       const ang = (i / 90) * Math.PI * 2;
       const r1 = 280;
       const r2 = 300;
       ctxM.beginPath();
       ctxM.moveTo(center + Math.cos(ang) * r1, center + Math.sin(ang) * r1);
       ctxM.lineTo(center + Math.cos(ang + Math.PI/90) * r2, center + Math.sin(ang + Math.PI/90) * r2);
       ctxM.stroke();
    }

    // 32-Point Monumental Celestial Compass Starburst Inlay (White Carrara, Black Gabbro, Gold Quartzite)
    const numPoints = 32;
    for (let p = 0; p < numPoints; p++) {
      const ang0 = (p / numPoints) * Math.PI * 2;
      const angMid = ((p + 0.5) / numPoints) * Math.PI * 2;
      const ang1 = ((p + 1) / numPoints) * Math.PI * 2;

      const isMajor = p % 2 === 0;
      const starLen = isMajor ? 780 : 540;

      // Black Gabbro Star Half-Facet
      ctxM.fillStyle = isMajor ? '#16191b' : '#323639';
      ctxM.beginPath();
      ctxM.moveTo(center, center);
      ctxM.lineTo(center + Math.cos(ang0) * 140, center + Math.sin(ang0) * 140);
      ctxM.lineTo(center + Math.cos(angMid) * starLen, center + Math.sin(angMid) * starLen);
      ctxM.closePath();
      ctxM.fill();

      // Gold Quartzite Star Half-Facet
      ctxM.fillStyle = isMajor ? '#d4af37' : '#f2d04a';
      ctxM.beginPath();
      ctxM.moveTo(center, center);
      ctxM.lineTo(center + Math.cos(angMid) * starLen, center + Math.sin(angMid) * starLen);
      ctxM.lineTo(center + Math.cos(ang1) * 140, center + Math.sin(ang1) * 140);
      ctxM.closePath();
      ctxM.fill();
    }

    // Central Medallion Ring & Gold Rosette Core
    ctxM.fillStyle = '#16191b';
    ctxM.beginPath(); ctxM.arc(center, center, 140, 0, Math.PI * 2); ctxM.fill();
    ctxM.strokeStyle = '#f2d04a';
    ctxM.lineWidth = 14;
    ctxM.beginPath(); ctxM.arc(center, center, 138, 0, Math.PI * 2); ctxM.stroke();

    const texMosaic = new THREE.CanvasTexture(cnvMosaic);
    texMosaic.anisotropy = 16;

    const mosaicMat = new THREE.MeshPhysicalMaterial({
      map: texMosaic,
      roughness: 0.38,
      metalness: 0.12,
      });
    const mosaicDisc = new THREE.Mesh(new THREE.CircleGeometry(r - 2, 64), mosaicMat);
    mosaicDisc.rotation.x = -Math.PI / 2;
    mosaicDisc.position.y = 1.75; mosaicDisc.receiveShadow = true;
    g.add(mosaicDisc);

    // 3. Monumental Multi-Tiered Baroque & Classical Carrara Marble Fountain
    // Stepped Octagonal Marble Terrace Plinth (R ≈ 28m)
    const plinth1 = new THREE.Mesh(new THREE.CylinderGeometry(28, 29, 1.2, 8), stone);
    plinth1.position.y = 2.2;
    plinth1.receiveShadow = true;
    g.add(plinth1);

    const plinth2 = new THREE.Mesh(new THREE.CylinderGeometry(26, 27, 1.2, 8), marble);
    plinth2.position.y = 3.4;
    plinth2.receiveShadow = true;
    g.add(plinth2);

    // 4. Flanking Curved Classical Marble Benches Around Fountain Perimeter
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const benchGroup = new THREE.Group();
      benchGroup.position.set(0, 4.0, 0);
      benchGroup.rotation.y = -ang;

      // Curved seat
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(23.9, 22.1, 0.45, 32, 1, false, -Math.PI / 24, Math.PI / 12), marble);
      seat.position.y = 0.55;
      benchGroup.add(seat);

      // Curved backrest
      const backrest = new THREE.Mesh(new THREE.CylinderGeometry(24.3, 23.9, 1.4, 32, 1, false, -Math.PI / 24, Math.PI / 12), marble);
      backrest.position.y = 1.45;
      benchGroup.add(backrest);

      // Curved legs extended to ground
      const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.0, 1.8), stone);
      leg1.position.set(Math.sin(-Math.PI / 32) * 23.0, -1.5, Math.cos(-Math.PI / 32) * 23.0);
      leg1.rotation.y = Math.PI / 32;
      benchGroup.add(leg1);

      const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.0, 1.8), stone);
      leg2.position.set(Math.sin(Math.PI / 32) * 23.0, -1.5, Math.cos(Math.PI / 32) * 23.0);
      leg2.rotation.y = -Math.PI / 32;
      benchGroup.add(leg2);

      g.add(benchGroup);

      // 5. Sculpted Stone Planters with Blooming Climbing Jasmine & Roses
      const cornerAng = ang + Math.PI / 8;
      const planterGroup = new THREE.Group();
      planterGroup.position.set(Math.cos(cornerAng) * 26.0, 4.0, Math.sin(cornerAng) * 26.0);

      const urnBase = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 2.4), stone);
      urnBase.position.y = 0.7;
      planterGroup.add(urnBase);

      const planterUrn = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.9, 2.2, 16), marble);
      planterUrn.position.y = 2.4;
      planterGroup.add(planterUrn);

      const soil = new THREE.Mesh(new THREE.CircleGeometry(1.5, 16), graniteDark);
      soil.rotation.x = -Math.PI / 2;
      soil.position.y = 3.45;
      planterGroup.add(soil);

      // Wrought-iron Climbing Trellis
      const trellisCurve = new THREE.QuadraticBezierCurve3(
        new V3(-0.9, 3.4, 0), new V3(0, 6.2, 0), new V3(0.9, 3.4, 0)
      );
      const trellisMesh = new THREE.Mesh(new THREE.TubeGeometry(trellisCurve, 16, 0.08, 6), iron);
      planterGroup.add(trellisMesh);

      // Lush foliage mound
      const foliageCluster = new THREE.Mesh(new THREE.SphereGeometry(1.7, 12, 10), foliage);
      foliageCluster.scale.set(1.1, 1.3, 1.1);
      foliageCluster.position.y = 4.2;
      planterGroup.add(foliageCluster);

      // Star-shaped White Jasmine & Velvety White Roses
      for (let fl = 0; fl < 18; fl++) {
        const phi = Math.random() * Math.PI;
        const theta = Math.random() * Math.PI * 2;
        const fx = Math.sin(phi) * Math.cos(theta) * 1.7;
        const fy = 4.2 + Math.cos(phi) * 1.5;
        const fz = Math.sin(phi) * Math.sin(theta) * 1.7;

        const isRose = fl % 3 === 0;
        const bloom = new THREE.Mesh(
          isRose ? new THREE.SphereGeometry(0.32, 8, 8) : new THREE.OctahedronGeometry(0.22, 0),
          isRose ? rosePetal : jasminePetal
        );
        bloom.position.set(fx, fy, fz);
        planterGroup.add(bloom);
      }

      g.add(planterGroup);
    }

    // 6. Tiered Scalloped Carrara Marble Fountain Basins & Cascades
    // Lower Main Scalloped Basin (R = 18.5m)
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(18.5, 19.5, 2.6, 64), marble);
    basin.position.y = 5.2;
    basin.receiveShadow = true;
    g.add(basin);

    const basinRim = new THREE.Mesh(new THREE.TorusGeometry(18.8, 0.85, 16, 64), marble);
    basinRim.rotation.x = Math.PI / 2;
    basinRim.position.y = 6.5;
    g.add(basinRim);

    // Carved Carrara Marble Lion-Paw Corbel Brackets supporting lower basin
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.8, 3.2), marble);
      bracket.position.set(Math.cos(ang) * 18.6, 4.4, Math.sin(ang) * 18.6);
      bracket.rotation.y = -ang;
      g.add(bracket);
    }

    // Basin Water (lower tier)
    const basinWater = new THREE.Mesh(new THREE.CircleGeometry(18.2, 64), this._fountainBasinMat);
    basinWater.rotation.x = -Math.PI / 2;
    basinWater.position.y = 6.1;
    basinWater.receiveShadow = true;
    g.add(basinWater);
    this.world._reflectiveMeshes.push(basinWater);

    // First Fluted Corinthian Pedestal
    const ped1 = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.8, 6.0, 32), marble);
    ped1.position.y = 9.1;
    ped1.castShadow = true;
    g.add(ped1);

    const ped1GoldBand = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.35, 8, 32), gold);
    ped1GoldBand.rotation.x = Math.PI / 2;
    ped1GoldBand.position.y = 6.8;
    g.add(ped1GoldBand);

    // Middle Tier Scalloped Basin with Sculpted Gilded Lion Spouts (R = 11.4m)
    const midBowl = new THREE.Mesh(new THREE.CylinderGeometry(11.4, 7.2, 2.8, 48), marble);
    midBowl.position.y = 13.5;
    midBowl.castShadow = true;
    g.add(midBowl);

    const midRim = new THREE.Mesh(new THREE.TorusGeometry(11.6, 0.65, 16, 64), marble);
    midRim.rotation.x = Math.PI / 2;
    midRim.position.y = 14.9;
    g.add(midRim);

    const midWater = new THREE.Mesh(new THREE.CircleGeometry(10.8, 48), this._fountainBasinMat);
    midWater.rotation.x = -Math.PI / 2;
    midWater.position.y = 14.6;
    g.add(midWater);
    this.world._reflectiveMeshes.push(midWater);

    // 8 Sculpted 24K Gilded Bronze Lion-Head Water Spouts on mid bowl
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const lionGroup = new THREE.Group();
      lionGroup.position.set(Math.cos(ang) * 11.6, 14.1, Math.sin(ang) * 11.6);
      lionGroup.rotation.y = -ang + Math.PI / 2;

      // Lion Head Mask Core
      const lionHead = new THREE.Mesh(new THREE.SphereGeometry(0.92, 16, 12), darkBronze);
      lionGroup.add(lionHead);

      // Sculpted Mane Ruff
      const maneRuff = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.38, 8, 16), gold);
      maneRuff.position.z = -0.25;
      lionGroup.add(maneRuff);

      // Snout & Roaring Jaws
      const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.52, 0.65, 8), darkBronze);
      snout.rotation.x = Math.PI / 2;
      snout.position.set(0, -0.15, 0.65);
      lionGroup.add(snout);

      // Gold Lion Crest Brow
      const brow = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), gold);
      brow.position.set(0, 0.45, 0.6);
      lionGroup.add(brow);

      g.add(lionGroup);
    }

    // Second Fluted Pedestal
    const ped2 = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.4, 5.0, 24), marble);
    ped2.position.y = 17.1;
    ped2.castShadow = true;
    g.add(ped2);

    // Top Crest Scalloped Bowl (R = 6.4m)
    const topBowl = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 4.2, 2.0, 32), marble);
    topBowl.position.y = 20.6;
    topBowl.castShadow = true;
    g.add(topBowl);

    const topWater = new THREE.Mesh(new THREE.CircleGeometry(6.0, 32), this._fountainBasinMat);
    topWater.rotation.x = -Math.PI / 2;
    topWater.position.y = 21.4;
    g.add(topWater);
    this.world._reflectiveMeshes.push(topWater);

    // 7. Central Monolithic Crystalline Lapis Lazuli Obelisk with 24K Gilded Capstone
    const pinPed = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.4, 4.5, 16), marble);
    pinPed.position.y = 23.8;
    pinPed.castShadow = true;
    g.add(pinPed);

    const pinPedGold = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.28, 8, 24), gold);
    pinPedGold.rotation.x = Math.PI / 2;
    pinPedGold.position.y = 25.8;
    g.add(pinPedGold);

    // Monolithic Crystalline Lapis Lazuli Obelisk Shaft (y: 26 to 37.5m, height = 11.5m)
    const obelisk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 1.5, 11.5, 4), lapisMaterial);
    obelisk.rotation.y = Math.PI / 4;
    obelisk.position.y = 31.6;
    obelisk.castShadow = true;
    g.add(obelisk);

    // Inlaid 24K Gold Celestial Starburst Medallions on 4 Faces of Obelisk
    for (let face = 0; face < 4; face++) {
      const fAng = (face / 4) * Math.PI * 2 + Math.PI / 4;
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), gold);
      star.position.set(Math.cos(fAng) * 0.95, 31.6, Math.sin(fAng) * 0.95);
      g.add(star);
    }

    // 24K Polished Celestial Gold Pyramidion / Capstone
    const goldPeak = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.2, 4), gold);
    goldPeak.rotation.y = Math.PI / 4;
    goldPeak.position.y = 38.2;
    goldPeak.castShadow = true;
    g.add(goldPeak);

    // Cascading Tiered Waterfalls & Radial Water Sheets
    const midCascade = new THREE.Mesh(new THREE.CylinderGeometry(11.4, 16.2, 8.5, 64, 1, true), this._fountainCascadeMat);
    midCascade.position.y = 10.35;
    g.add(midCascade);

    const topCascade = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 9.2, 6.8, 48, 1, true), this._fountainCascadeMat);
    topCascade.position.y = 18.0;
    g.add(topCascade);

    // Illuminated Water Plume Nozzles from Obelisk Base
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2;
      const curve = new THREE.QuadraticBezierCurve3(
        new V3(Math.cos(ang) * 1.8, 24.6, Math.sin(ang) * 1.8),
        new V3(Math.cos(ang) * 5.2, 30.8, Math.sin(ang) * 5.2),
        new V3(Math.cos(ang) * 5.8, 21.4, Math.sin(ang) * 5.8)
      );
      const nozzleSpout = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.25, 8), this._fountainCascadeMat);
      g.add(nozzleSpout);
    }

    // 8 Parabolic Lion Head Water Arcs into Lower Basin
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const curve = new THREE.QuadraticBezierCurve3(
        new V3(Math.cos(ang) * 11.6, 14.1, Math.sin(ang) * 11.6),
        new V3(Math.cos(ang) * 15.6, 16.4, Math.sin(ang) * 15.6),
        new V3(Math.cos(ang) * 17.2, 6.2, Math.sin(ang) * 17.2)
      );
      const spoutTube = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.35, 8), this._fountainCascadeMat);
      g.add(spoutTube);
    }

    // 8. Monumental Classical Torchiere Lantern Columns Along the Boulevard & Promenade
    const lanternMat = new THREE.MeshPhysicalMaterial({
      color: 0xfff0c8,
      emissive: 0xffd268,
      emissiveIntensity: 2.2,
      roughness: 0.15,
      metalness: 0.1,
    });

    // Batched High-Performance Plaza Torchiere Bollards (Reduces 56 draw calls to 4 merged meshes!)
    const bBaseGeos = [];
    const bShaftGeos = [];
    const bGoldGeos = [];
    const bLanternGeos = [];

    for (let side of [-1, 1]) {
      for (let b = 0; b < 4; b++) {
        const bz = 32 + b * 14;
        const bx = side * (r * 0.45);

        // Extended base down to ground
        const g1 = new THREE.BoxGeometry(2.0, 6.0, 2.0);
        g1.translate(bx, 1.6 + 0.5 - 2.5, bz);
        bBaseGeos.push(g1);

        const g2 = new THREE.CylinderGeometry(0.55, 0.80, 2.6, 12);
        g2.translate(bx, 1.6 + 2.3, bz);
        bShaftGeos.push(g2);

        // Ornate brazier bowl
        const g3 = new THREE.CylinderGeometry(1.4, 0.6, 1.0, 16);
        g3.translate(bx, 1.6 + 4.1, bz);
        bGoldGeos.push(g3);
        
        const g3_rim = new THREE.TorusGeometry(1.4, 0.15, 8, 16);
        g3_rim.rotateX(Math.PI / 2);
        g3_rim.translate(bx, 1.6 + 4.6, bz);
        bGoldGeos.push(g3_rim);

        // Flame core
        const g4 = new THREE.ConeGeometry(0.8, 1.8, 8);
        g4.translate(bx, 1.6 + 5.5, bz);
        bLanternGeos.push(g4);

        // Outer flame petals
        for (let fp = 0; fp < 4; fp++) {
          const ang = (fp / 4) * Math.PI * 2;
          const g5 = new THREE.ConeGeometry(0.5, 1.4, 6);
          g5.translate(Math.cos(ang) * 0.5, 0, Math.sin(ang) * 0.5);
          g5.rotateZ(Math.cos(ang) * 0.2);
          g5.rotateX(Math.sin(ang) * 0.2);
          g5.translate(bx, 1.6 + 5.2, bz);
          bLanternGeos.push(g5);
        }
      }
    }

    const mBases = mergeGeometries(bBaseGeos, false);
    if (mBases) g.add(new THREE.Mesh(mBases, graniteDark));

    const mShafts = mergeGeometries(bShaftGeos, false);
    if (mShafts) g.add(new THREE.Mesh(mShafts, marble));

    const mGold = mergeGeometries(bGoldGeos, false);
    if (mGold) g.add(new THREE.Mesh(mGold, gold));

    const mLanterns = mergeGeometries(bLanternGeos, false);
    if (mLanterns) g.add(new THREE.Mesh(mLanterns, lanternMat));

    // Strategic Hero PointLight for Central Plaza Living Fountain (Consolidated)
    const plazaHeroLight = new THREE.PointLight(0xffdf80, 3.5, 110, 1.5);
    plazaHeroLight.position.set(0, 20.0, 0);
    g.add(plazaHeroLight);

    g.traverse(o => {
      if (o.isMesh && o.material !== this._fountainCascadeMat && o.material !== this._fountainBasinMat) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    g.position.set(x, y, z);
    this.world.scene.add(g);
  }

  _gate() {
    const g = new THREE.Group();
    const { x, z } = WORLD.gate;
    const baseY = 32.0; // Entrance terrace elevation atop coastal bluff

    // Luminous Classical & PBR Materials
    const marble = Surfaces.honedCarraraMarble(1.5);
    const gold = Surfaces.celestialGold(1.0);
    const darkBronze = Surfaces.verdigrisBronze(1.0);
    const filigreeGold = Surfaces.celestialGold(1.0);
    const stoneLight = Surfaces.agedCaenLimestone(1.8);

    const lanternCoreMat = new THREE.MeshBasicMaterial({ color: 0xfffae8 });
    const haloMat = new THREE.SpriteMaterial({
      map: this.world._glowTex || null,
      color: 0xffdf88,
      transparent: true, logarithmicDepthBuffer: true, opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });



    // Classical Carved Carrara Marble Floral Urn with Cascading Ivy & Blooming Roses
    const flowerLeafTex = textures('leafCard');
    const floralFoliageMat = createBotanicalFoliageMaterial(0x3e7534, flowerLeafTex.map, {
      isTree: false,
      normalMap: flowerLeafTex.normalMap,
      normalScale: 0.8,
      roughness: 0.68,
      sssColor: new THREE.Color(0x7ade38),
      shadowColor: new THREE.Color(0x183e14),
      sssIntensity: 0.85,
      windIntensity: 0.9,
    });
    const soilMat = Surfaces.limestoneDark(2.0);
//     soilMat.color.setHex(0x3e3224);

    const roseColors = [0xc4223d, 0xfceee9, 0xf6d365, 0xe85d75, 0xb072d6];
    const roseMats = roseColors.map(c => new THREE.MeshPhysicalMaterial({
      color: c,
      roughness: 0.45,
      metalness: 0.05,
      side: THREE.DoubleSide,
    }));

    // High-performance merged Floral Urn (reduces 140 draw calls down to 3 draw calls per urn!)
    const createFloralUrn = (scale = 1.0) => {
      const urnGroup = new THREE.Group();

      // 1. Soft contact shadow beneath urn plinth
      const sh = createContactShadow(2.8 * scale, 0.02);
      urnGroup.add(sh);

      // 2. Merged Marble Geometries
      const marbleGeos = [];
      const p1 = new THREE.BoxGeometry(3.6 * scale, 1.0 * scale, 3.6 * scale);
      p1.translate(0, 0.5 * scale, 0);
      marbleGeos.push(p1);

      const p2 = new THREE.CylinderGeometry(3.2 * scale, 1.6 * scale, 2.6 * scale, 16);
      p2.translate(0, 3.4 * scale, 0);
      marbleGeos.push(p2);

      const mergedMarble = mergeGeometries(marbleGeos, false);
      if (mergedMarble) {
        const marbleMesh = new THREE.Mesh(mergedMarble, marble);
        marbleMesh.castShadow = true;
        urnGroup.add(marbleMesh);
      }

      // 3. Merged Gold Geometries
      const goldGeos = [];
      const g1 = new THREE.CylinderGeometry(1.6 * scale, 1.0 * scale, 1.2 * scale, 12);
      g1.translate(0, 1.6 * scale, 0);
      goldGeos.push(g1);

      const g2 = new THREE.TorusGeometry(3.3 * scale, 0.35 * scale, 8, 20);
      g2.rotateX(Math.PI / 2);
      g2.translate(0, 4.7 * scale, 0);
      goldGeos.push(g2);

      for (let s of [-1, 1]) {
        const handle = new THREE.TorusGeometry(1.4 * scale, 0.28 * scale, 6, 12, Math.PI * 1.2);
        handle.rotateZ(s * 0.45);
        handle.translate(s * 3.2 * scale, 3.4 * scale, 0);
        goldGeos.push(handle);
      }

      const mergedGold = mergeGeometries(goldGeos, false);
      if (mergedGold) {
        const goldMesh = new THREE.Mesh(mergedGold, gold);
        goldMesh.castShadow = true;
        urnGroup.add(goldMesh);
      }

      // 4. Soil bed
      const soilBed = new THREE.Mesh(new THREE.CylinderGeometry(2.9 * scale, 2.7 * scale, 0.6 * scale, 12), soilMat);
      soilBed.position.y = 4.5 * scale;
      urnGroup.add(soilBed);

      // 5. Merged Cascading Foliage
      const foliageGeos = [];
      for (let f = 0; f < 8; f++) {
        const fAng = (f / 8) * Math.PI * 2;
        const fRad = 2.8 * scale;
        const droopCard = new THREE.PlaneGeometry(1.6 * scale, 3.4 * scale, 2, 2);
        const cpos = droopCard.attributes.position;
        for (let cp = 0; cp < cpos.count; cp++) {
          const px = cpos.getX(cp), py = cpos.getY(cp);
          const u = px / (1.6 * scale * 0.5), v = py / (3.4 * scale * 0.5);
          cpos.setZ(cp, (1.0 - u * u) * 0.45 * (1.0 - v * 0.25));
        }
        droopCard.computeVertexNormals();
        droopCard.rotateX(0.78);
        droopCard.rotateY(fAng + Math.PI * 0.5);
        droopCard.translate(Math.cos(fAng) * fRad, 4.6 * scale - 0.9 * scale, Math.sin(fAng) * fRad);
        foliageGeos.push(droopCard);
      }
      const mergedFoliage = mergeGeometries(foliageGeos, false);
      if (mergedFoliage) {
        urnGroup.add(new THREE.Mesh(mergedFoliage, floralFoliageMat));
      }

      // 6. Merged Blooming Flowers (2 dome meshes)
      const flowerGeos = [];
      for (let fl = 0; fl < 8; fl++) {
        const flPhi = Math.acos(1 - 2 * ((fl + 0.5) / 8));
        const flTheta = fl * 2.39996;
        const flRad = 2.0 * scale;
        const fx = Math.sin(flPhi) * Math.cos(flTheta) * flRad;
        const fy = 4.8 * scale + Math.cos(flPhi) * (flRad * 0.65);
        const fz = Math.sin(flPhi) * Math.sin(flTheta) * flRad;

        const flSphere = new THREE.SphereGeometry(0.55 * scale, 6, 5);
        flSphere.translate(fx, fy, fz);
        flowerGeos.push(flSphere);
      }
      const mergedFlowers = mergeGeometries(flowerGeos, false);
      if (mergedFlowers) {
        urnGroup.add(new THREE.Mesh(mergedFlowers, roseMats[0]));
      }

      return urnGroup;
    };

    // Soaring Classical Gateway Proportions (Arc de Triomphe / Brandenburg Gate / Imperial Cathedral caliber)
    const HALF = 24.0; // Half opening span (48m clear triumphal gateway opening width)
    const pierWidth = 12.0;
    const pierDepth = 13.0;
    const pierCenterX = HALF + pierWidth / 2; // 30.0m from center axis

    

    // 1. Classical Carved Architectural Stone Entrance Terrace & Grand Esplanade
    const terraceBase = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 240, 8.0, 240), stoneLight);
    terraceBase.position.set(0, -3.8, 60);
    terraceBase.receiveShadow = true;
    g.add(terraceBase);

    // Carved Carrara marble threshold apron spanning central entrance
    const thresholdApron = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 48, 1.6, 210), marble);
    thresholdApron.position.set(0, 0.45, 60);
    thresholdApron.receiveShadow = true;
    g.add(thresholdApron);

    // Outer Esplanade Flanking Classical Colonnade Torcheres & Balustrades (z = 900..1040)
    for (let side of [-1, 1]) {
      const bx = side * (HALF + 22.0);
      for (let zOffset = 30; zOffset <= 150; zOffset += 24) {
        const torchiere = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 3.8, 8), marble);
        torchiere.position.set(bx, 2.35, zOffset);
        torchiere.castShadow = true;
        g.add(torchiere);

        const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.35, 0.75, 8), gold);
        bowl.position.set(bx, 4.35, zOffset);
        g.add(bowl);

        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 8), new THREE.MeshBasicMaterial({ color: 0xffdd88 }));
        flame.position.set(bx, 5.0, zOffset);
        g.add(flame);
      }
    }

    // Inlaid 24K gilded brass & bronze framing borders on threshold
    for (let s of [-HALF - 2, HALF + 2]) {
      const inlay = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.65, 40), gold);
      inlay.position.set(s, 0.46, 0);
      g.add(inlay);
    }
    const centerInlay = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 6, 0.08, 0.55), gold);
    centerInlay.position.set(0, 1.26, 0);
    g.add(centerInlay);

    // Inlaid Monumental 24K Gold & Carrara Marble Eternal Valley Logo Medallion in threshold center
    const cnvEmblem = document.createElement('canvas');
    cnvEmblem.width = 512; cnvEmblem.height = 512;
    const ctxE = cnvEmblem.getContext('2d');
    ctxE.scale(0.25, 0.25);
    const ecx = 1024, ecy = 1024;

    // 1. Honed Carrara White Marble Base with subtle gold veining
    ctxE.fillStyle = '#f6f3eb';
    ctxE.fillRect(0, 0, 2048, 2048);

    // Marble veins
    ctxE.strokeStyle = 'rgba(190, 175, 145, 0.4)';
    ctxE.lineWidth = 4;
    for (let v = 0; v < 24; v++) {
      ctxE.beginPath();
      ctxE.moveTo(Math.random() * 2048, Math.random() * 2048);
      ctxE.bezierCurveTo(Math.random() * 2048, Math.random() * 2048, Math.random() * 2048, Math.random() * 2048, Math.random() * 2048, Math.random() * 2048);
      ctxE.stroke();
    }

    // 2. Dark Italian Porphyry & Obsidian Concentric Border Rings
    ctxE.fillStyle = '#0f1712';
    ctxE.beginPath(); ctxE.arc(ecx, ecy, 980, 0, Math.PI * 2); ctxE.fill();

    ctxE.fillStyle = '#18241c';
    ctxE.beginPath(); ctxE.arc(ecx, ecy, 880, 0, Math.PI * 2); ctxE.fill();

    // 24K Gold Concentric Inlay Bands
    [980, 960, 880, 860, 620, 600].forEach((rad, idx) => {
      ctxE.strokeStyle = (idx % 2 === 0) ? '#d4af37' : '#f8db70';
      ctxE.lineWidth = (idx % 2 === 0) ? 8 : 4;
      ctxE.beginPath(); ctxE.arc(ecx, ecy, rad, 0, Math.PI * 2); ctxE.stroke();
    });

    // 32 Compass Studs around the outer ring
    for (let s = 0; s < 32; s++) {
      const sang = (s / 32) * Math.PI * 2;
      const sx = ecx + Math.cos(sang) * 920;
      const sy = ecy + Math.sin(sang) * 920;
      ctxE.beginPath(); ctxE.arc(sx, sy, (s % 4 === 0) ? 14 : 8, 0, Math.PI * 2);
      ctxE.fillStyle = (s % 4 === 0) ? '#fceaa0' : '#d4af37'; ctxE.fill();
      ctxE.strokeStyle = '#997316'; ctxE.lineWidth = 2; ctxE.stroke();
    }

    // 3. Curved Circular Typography: ETERNAL VALLEY & SOMEWHERE OVER THE RAINBOW BRIDGE
    const drawCurvedText = (text, radius, startAngle, endAngle, font, fillStyle, isTop = true) => {
      ctxE.save();
      ctxE.font = font;
      ctxE.fillStyle = fillStyle;
      ctxE.textAlign = 'center';
      ctxE.textBaseline = 'middle';
      const numChars = text.length;
      const angleSpan = endAngle - startAngle;
      for (let i = 0; i < numChars; i++) {
        const char = text[i];
        const t = (i + 0.5) / numChars;
        const charAngle = startAngle + t * angleSpan;
        ctxE.save();
        ctxE.translate(ecx, ecy);
        if (isTop) {
          ctxE.rotate(charAngle + Math.PI / 2);
          ctxE.translate(0, -radius);
        } else {
          ctxE.rotate(charAngle - Math.PI / 2);
          ctxE.translate(0, radius);
        }
        ctxE.fillText(char, 0, 0);
        ctxE.restore();
      }
      ctxE.restore();
    };

    // Outer ring text: Top arc "ETERNAL VALLEY", Bottom arc "SOMEWHERE OVER THE RAINBOW BRIDGE"
    drawCurvedText(
      '✦   E T E R N I T Y   V A L L E Y   ✦',
      740,
      -Math.PI * 0.78,
      -Math.PI * 0.22,
      'bold 64px "Cinzel", "Georgia", serif',
      '#fceaa0',
      true
    );
    drawCurvedText(
      '✦   SOMEWHERE OVER THE RAINBOW BRIDGE   ✦',
      740,
      Math.PI * 0.78,
      Math.PI * 0.22,
      'bold 42px "Cinzel", "Georgia", serif',
      '#dfb94a',
      false
    );

    // Inner ring text: "WHERE LOVE LIVES FOREVER"
    drawCurvedText(
      '✦  WHERE LOVE LIVES FOREVER  ✦',
      540,
      -Math.PI * 0.65,
      -Math.PI * 0.35,
      'bold 36px "Cinzel", "Georgia", serif',
      '#e8c860',
      true
    );

    // 4. Center Celestial Medallion (R = 480) with Night Blue Gradient & Stars
    const innerGrad = ctxE.createRadialGradient(ecx, ecy, 0, ecx, ecy, 480);
    innerGrad.addColorStop(0.0, '#122438');
    innerGrad.addColorStop(0.6, '#091522');
    innerGrad.addColorStop(1.0, '#040b12');
    ctxE.fillStyle = innerGrad;
    ctxE.beginPath(); ctxE.arc(ecx, ecy, 480, 0, Math.PI * 2); ctxE.fill();

    // Subtle constellation stars
    for (let st = 0; st < 60; st++) {
      const stAng = Math.random() * Math.PI * 2;
      const stRad = Math.random() * 450;
      const stX = ecx + Math.cos(stAng) * stRad;
      const stY = ecy + Math.sin(stAng) * stRad;
      ctxE.fillStyle = 'rgba(255, 240, 180, ' + (0.3 + Math.random() * 0.7) + ')';
      ctxE.beginPath(); ctxE.arc(stX, stY, 1.0 + Math.random() * 2.2, 0, Math.PI * 2); ctxE.fill();
    }

    // 5. Official Rainbow Bridge Arc (Glowing Spectral Colors)
    const rainbowColors = ['#e0503c', '#ef9138', '#e8d84a', '#5ec96a', '#3fa9e0', '#4661d8', '#7a4bd0'];
    const baseArchR = 340;
    rainbowColors.forEach((col, idx) => {
      ctxE.strokeStyle = col;
      ctxE.lineWidth = 14;
      ctxE.beginPath();
      ctxE.arc(ecx, ecy + 60, baseArchR - idx * 13, -Math.PI * 0.88, -Math.PI * 0.12, false);
      ctxE.stroke();
    });

    // 6. Sculpted Mountain Massif Silhouette beneath the Rainbow
    ctxE.fillStyle = '#0d1822';
    ctxE.beginPath();
    ctxE.moveTo(ecx - 360, ecy + 180);
    ctxE.lineTo(ecx - 220, ecy - 30);
    ctxE.lineTo(ecx - 140, ecy + 50);
    ctxE.lineTo(ecx, ecy - 110);
    ctxE.lineTo(ecx + 130, ecy + 40);
    ctxE.lineTo(ecx + 240, ecy - 20);
    ctxE.lineTo(ecx + 360, ecy + 180);
    ctxE.closePath();
    ctxE.fill();
    ctxE.strokeStyle = '#d4af37';
    ctxE.lineWidth = 4;
    ctxE.stroke();

    // Snow caps & gold facets on mountain peaks
    ctxE.fillStyle = '#e8eff8';
    ctxE.beginPath();
    ctxE.moveTo(ecx, ecy - 110);
    ctxE.lineTo(ecx - 35, ecy - 60);
    ctxE.lineTo(ecx + 35, ecy - 60);
    ctxE.closePath();
    ctxE.fill();

    // 7. Center 8-Point Golden Starburst & Heart Emblem
    ctxE.fillStyle = '#fff4cc';
    ctxE.beginPath();
    ctxE.arc(ecx, ecy - 135, 28, 0, Math.PI * 2);
    ctxE.fill();
    ctxE.strokeStyle = '#d4af37'; ctxE.lineWidth = 4; ctxE.stroke();

    for (let r = 0; r < 8; r++) {
      const rang = (r / 8) * Math.PI * 2;
      const rlen = (r % 2 === 0) ? 65 : 42;
      const rx = ecx + Math.cos(rang) * rlen;
      const ry = (ecy - 135) + Math.sin(rang) * rlen;
      ctxE.strokeStyle = '#f8db70'; ctxE.lineWidth = (r % 2 === 0) ? 4 : 2;
      ctxE.beginPath(); ctxE.moveTo(ecx, ecy - 135); ctxE.lineTo(rx, ry); ctxE.stroke();
    }

    const texEmblem = new THREE.CanvasTexture(cnvEmblem);
    texEmblem.anisotropy = Math.min(16, this.world.renderer.capabilities.getMaxAnisotropy?.() || 16);

    const emblemMat = new THREE.MeshPhysicalMaterial({
      map: texEmblem,
      roughness: 0.18,
      metalness: 0.65,
      emissive: new THREE.Color(0xffe890),
      emissiveMap: texEmblem,
      emissiveIntensity: 0.28,
    });

    const emblemMesh = new THREE.Mesh(new THREE.CylinderGeometry(15.0, 15.4, 0.15, 64), emblemMat);
    emblemMesh.rotation.y = -Math.PI / 2; // Upright reading orientation facing the camera
    emblemMesh.position.set(0, 1.36, 0); emblemMesh.receiveShadow = true;
    g.add(emblemMesh);

    // Gilded Bezel Ring around the Medallion
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(15.2, 0.35, 12, 64), gold);
    bezel.rotation.x = Math.PI / 2;
    bezel.position.set(0, 1.28, 0);
    g.add(bezel);

    // Plinth floral urns at the gateway threshold flanks
    [-28.0, 28.0].forEach(tx => {
      const tUrn = createFloralUrn(1.1);
      tUrn.position.set(tx, 1.25, 0);
      g.add(tUrn);
    });

    // 1b. Symmetrical Imperial Balustrade & Torchiere Columns along Approach Avenue (z = 940 to 860)
    const approachZs = [60, 35, 10, -15]; // relative to gate z=880 (world z: 940, 915, 890, 865)
    for (const side of [-1, 1]) {
      const bx = side * 34; // 34m flank from center road
      // Continuous marble ground plinth
      const bPlinth = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 90), marble);
      bPlinth.position.set(bx, 0.45, 22.5);
      g.add(bPlinth);

      const bRail = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 90), marble);
      bRail.position.set(bx, 2.6, 22.5);
      g.add(bRail);

      // Balusters
      for (let bz = -20; bz <= 65; bz += 3.5) {
        const baluster = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 1.6, 8), marble);
        baluster.position.set(bx, 1.5, bz);
        g.add(baluster);
      }

      // Monumental Gilded Bronze Torchiere Lamp Columns (Warm 2700K Glow) with Soft Contact Shadows
      for (const relZ of approachZs) {
        const lampPost = new THREE.Group();
        lampPost.position.set(bx, 0, relZ);

        // Soft contact shadow beneath torchiere column plinth
        const lShadow = createContactShadow(3.2);
        lampPost.add(lShadow);

        const lBase = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.8, 3.0), marble);
        lBase.position.y = 0.9;
        lampPost.add(lBase);

        const lTorus = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.25, 8, 16), gold);
        lTorus.rotation.x = Math.PI / 2;
        lTorus.position.y = 1.9;
        lampPost.add(lTorus);

        const lShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 7.5, 12), darkBronze);
        lShaft.position.y = 5.65;
        lampPost.add(lShaft);

        const lCapital = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.55, 1.4, 8), gold);
        lCapital.position.y = 9.8;
        lampPost.add(lCapital);

        // Lantern Cage
        const cage = new THREE.Mesh(new THREE.DodecahedronGeometry(1.35, 0), gold);
        cage.position.y = 11.6;
        lampPost.add(cage);

        const lCore = new THREE.Mesh(new THREE.SphereGeometry(0.65, 8, 8), lanternCoreMat);
        lCore.position.y = 11.6;
        lampPost.add(lCore);

        if (this.world._glowTex) {
          const lHalo = new THREE.Sprite(haloMat);
          lHalo.position.y = 11.6;
          lHalo.scale.set(6.5, 6.5, 1.0);
          lampPost.add(lHalo);
        }

        const lCap = new THREE.Mesh(new THREE.ConeGeometry(1.45, 1.6, 6), gold);
        lCap.position.y = 13.0;
        lampPost.add(lCap);

        g.add(lampPost);
      }

      // Classical Floral Urns with Blooming Roses alternating along the Approach Avenue Balustrade
      const urnZs = [47.5, 22.5, -2.5];
      for (const uz of urnZs) {
        const aveUrn = createFloralUrn(0.85);
        aveUrn.position.set(bx, 2.9, uz);
        g.add(aveUrn);
      }
    }

    // Shared Brazier Builder for Pier Apexes & Colonnades
    const emberBedMat = new THREE.MeshPhysicalMaterial({
      color: 0x331005,
      emissive: 0xff3404,
      emissiveIntensity: 3.5,
      roughness: 0.85,
      metalness: 0.2,
    });
    const flameCoreMat = new THREE.MeshPhysicalMaterial({
      color: 0xfff3a0,
      emissive: 0xffdf50,
      emissiveIntensity: 4.2,
      roughness: 0.1,
      metalness: 0.0,
    });
    const flameOuterMat = new THREE.MeshBasicMaterial({
      color: 0xff8c1a,
      transparent: true, logarithmicDepthBuffer: true, opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const createBrazier = (scale = 1.0, isLeft = true) => {
      const urnGroup = new THREE.Group();

      const urnPed = new THREE.Mesh(new THREE.BoxGeometry(4.8 * scale, 1.2 * scale, 4.8 * scale), marble);
      urnPed.position.y = 0.6 * scale;
      urnGroup.add(urnPed);

      const urnFoot = new THREE.Mesh(new THREE.CylinderGeometry(2.0 * scale, 1.2 * scale, 1.5 * scale, 16), gold);
      urnFoot.position.y = 1.95 * scale;
      urnGroup.add(urnFoot);

      const urnBowl = new THREE.Mesh(new THREE.CylinderGeometry(4.0 * scale, 2.0 * scale, 3.2 * scale, 24), gold);
      urnBowl.position.y = 4.2 * scale;
      urnGroup.add(urnBowl);

      const urnRim = new THREE.Mesh(new THREE.TorusGeometry(4.1 * scale, 0.45 * scale, 12, 32), gold);
      urnRim.rotation.x = Math.PI / 2;
      urnRim.position.y = 5.8 * scale;
      urnGroup.add(urnRim);

      for (let s of [-1, 1]) {
        const handle = new THREE.Mesh(new THREE.TorusGeometry(1.8 * scale, 0.36 * scale, 8, 16, Math.PI * 1.2), gold);
        handle.rotation.z = s * 0.45;
        handle.position.set(s * 4.0 * scale, 4.2 * scale, 0);
        urnGroup.add(handle);
      }

      const emberBed = new THREE.Mesh(new THREE.CylinderGeometry(3.6 * scale, 3.4 * scale, 0.8 * scale, 16), emberBedMat);
      emberBed.position.y = 5.6 * scale;
      urnGroup.add(emberBed);

      const flameCore = new THREE.Mesh(new THREE.ConeGeometry(1.4 * scale, 5.2 * scale, 12), flameCoreMat);
      flameCore.position.y = 8.2 * scale;
      urnGroup.add(flameCore);

      const flameOuter = new THREE.Mesh(new THREE.ConeGeometry(2.6 * scale, 7.6 * scale, 16), flameOuterMat);
      flameOuter.position.y = 9.0 * scale;
      urnGroup.add(flameOuter);

      for (let fp = 0; fp < 4; fp++) {
        const ang = (fp / 4) * Math.PI * 2;
        const flamePetal = new THREE.Mesh(new THREE.ConeGeometry(1.1 * scale, 5.8 * scale, 8), flameOuterMat);
        flamePetal.position.set(Math.cos(ang) * 1.1 * scale, 8.4 * scale, Math.sin(ang) * 1.1 * scale);
        flamePetal.rotation.z = Math.cos(ang) * 0.22;
        flamePetal.rotation.x = Math.sin(ang) * 0.22;
        urnGroup.add(flamePetal);
      }

      const emberCount = Math.floor(60 * scale);
      const emberGeo = new THREE.BufferGeometry();
      const emberPos = new Float32Array(emberCount * 3);
      for (let ep = 0; ep < emberCount; ep++) {
        const theta = Math.random() * Math.PI * 2;
        const rad = Math.random() * 2.8 * scale;
        emberPos[ep * 3 + 0] = Math.cos(theta) * rad;
        emberPos[ep * 3 + 1] = (6.0 + Math.random() * 12.0) * scale;
        emberPos[ep * 3 + 2] = Math.sin(theta) * rad;
      }
      emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
      const emberMat = new THREE.PointsMaterial({
        color: 0xffb038,
        size: 0.95 * scale,
        transparent: true, logarithmicDepthBuffer: true, opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const emberPoints = new THREE.Points(emberGeo, emberMat);
      urnGroup.add(emberPoints);

      urnGroup.onBeforeRender = () => {
        const time = performance.now() * 0.001;
        const pulse = 1.0 + Math.sin(time * 6.0 + (isLeft ? 0 : 2.5)) * 0.14 + Math.cos(time * 11.0) * 0.07;
        flameCore.scale.set(pulse, 1.0 + (pulse - 1.0) * 1.5, pulse);
        flameOuter.scale.set(pulse * 1.05, 1.0 + (pulse - 1.0) * 1.2, pulse * 1.05);
        flameOuter.rotation.y = time * 1.2;

        const posAttr = emberGeo.attributes.position;
        for (let ep = 0; ep < emberCount; ep++) {
          let ey = posAttr.getY(ep) + 0.08 * scale;
          if (ey > 18.0 * scale) ey = 6.0 * scale;
          posAttr.setY(ep, ey);
          const ex = posAttr.getX(ep) + Math.sin(time * 2.2 + ep) * 0.022;
          const ez = posAttr.getZ(ep) + Math.cos(time * 2.2 + ep) * 0.022;
          posAttr.setX(ep, ex);
          posAttr.setZ(ep, ez);
        }
        posAttr.needsUpdate = true;
      };

      return urnGroup;
    };

    // Helper: Sculpted Classical Fluted Corinthian Column with 24K Gold Capital
    const createCorinthianColumn = (height, baseRadius, topRadius) => {
      const colGroup = new THREE.Group();

      // 1. Classical Attic Base with double torus and scotia
      const plinthBlock = new THREE.Mesh(new THREE.BoxGeometry(baseRadius * 2.5, 0.9, baseRadius * 2.5), marble);
      plinthBlock.position.y = 0.45;
      colGroup.add(plinthBlock);

      const lowerTorus = new THREE.Mesh(new THREE.TorusGeometry(baseRadius * 1.2, baseRadius * 0.22, 12, 24), marble);
      lowerTorus.rotation.x = Math.PI / 2;
      lowerTorus.position.y = 1.05;
      colGroup.add(lowerTorus);

      const baseGoldFillet = new THREE.Mesh(new THREE.CylinderGeometry(baseRadius * 1.25, baseRadius * 1.25, 0.18, 24), gold);
      baseGoldFillet.position.y = 1.35;
      colGroup.add(baseGoldFillet);

      const scotia = new THREE.Mesh(new THREE.CylinderGeometry(baseRadius * 1.05, baseRadius * 1.18, 0.4, 24), marble);
      scotia.position.y = 1.65;
      colGroup.add(scotia);

      const upperTorus = new THREE.Mesh(new THREE.TorusGeometry(baseRadius * 1.08, baseRadius * 0.16, 12, 24), marble);
      upperTorus.rotation.x = Math.PI / 2;
      upperTorus.position.y = 1.95;
      colGroup.add(upperTorus);

      // 2. Fluted Column Shaft with Classical Entasis (height: 2.0 to height - 2.6)
      const shaftLen = height - 4.6;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(topRadius, baseRadius, shaftLen, 24), marble);
      shaft.position.y = 2.0 + shaftLen / 2;
      colGroup.add(shaft);

      // 20 Vertical Concave Flute Fillets around column circumference
      const numFlutes = 16;
      for (let f = 0; f < numFlutes; f++) {
        const fAng = (f / numFlutes) * Math.PI * 2;
        const midR = (baseRadius + topRadius) / 2 + 0.02;
        const flute = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, shaftLen - 0.4, 6), marble);
        flute.position.set(Math.cos(fAng) * midR, 2.0 + shaftLen / 2, Math.sin(fAng) * midR);
        colGroup.add(flute);
      }

      // Astragal gold necking ring at shaft top
      const astragal = new THREE.Mesh(new THREE.TorusGeometry(topRadius * 1.06, 0.12, 8, 24), gold);
      astragal.rotation.x = Math.PI / 2;
      astragal.position.y = 2.0 + shaftLen + 0.1;
      colGroup.add(astragal);

      // 3. Classical 24K Gold Corinthian Capital
      const capY = 2.0 + shaftLen + 0.3;
      const capGroup = new THREE.Group();
      capGroup.position.y = capY;

      // Bell-shaped Kalathos Core
      const kalathos = new THREE.Mesh(new THREE.CylinderGeometry(topRadius * 1.4, topRadius * 0.95, 2.2, 16), gold);
      kalathos.position.y = 1.1;
      capGroup.add(kalathos);

      // Tier 1: 8 Lower Sculpted Acanthus Leaves
      for (let l1 = 0; l1 < 8; l1++) {
        const lAng = (l1 / 8) * Math.PI * 2;
        const leaf1 = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.2, 5), gold);
        leaf1.rotation.z = -Math.cos(lAng) * 0.28;
        leaf1.rotation.x = Math.sin(lAng) * 0.28;
        leaf1.position.set(Math.cos(lAng) * (topRadius * 1.15), 0.65, Math.sin(lAng) * (topRadius * 1.15));
        capGroup.add(leaf1);
      }

      // Tier 2: 8 Upper Taller Acanthus Leaves & Caulicoles
      for (let l2 = 0; l2 < 8; l2++) {
        const lAng = ((l2 + 0.5) / 8) * Math.PI * 2;
        const leaf2 = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.6, 5), gold);
        leaf2.rotation.z = -Math.cos(lAng) * 0.35;
        leaf2.rotation.x = Math.sin(lAng) * 0.35;
        leaf2.position.set(Math.cos(lAng) * (topRadius * 1.28), 1.25, Math.sin(lAng) * (topRadius * 1.28));
        capGroup.add(leaf2);
      }

      // 4 Corner Volute Scrolls / Helices projecting under the abacus
      for (let v = 0; v < 4; v++) {
        const vAng = (v / 4) * Math.PI * 2 + Math.PI / 4;
        const volute = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.14, 8, 16, Math.PI * 1.4), gold);
        volute.rotation.y = vAng;
        volute.rotation.z = Math.PI / 4;
        volute.position.set(Math.cos(vAng) * (topRadius * 1.45), 1.9, Math.sin(vAng) * (topRadius * 1.45));
        capGroup.add(volute);
      }

      // Molded Concave Abacus Slab
      const abacus = new THREE.Mesh(new THREE.BoxGeometry(topRadius * 3.2, 0.55, topRadius * 3.2), marble);
      abacus.position.y = 2.45;
      capGroup.add(abacus);

      // 4 Central 24K Gold Floral Boss Rosettes (Fleurettes) on each abacus face
      for (let f = 0; f < 4; f++) {
        const fAng = (f / 4) * Math.PI * 2;
        const fleurette = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), gold);
        fleurette.position.set(Math.cos(fAng) * (topRadius * 1.65), 2.45, Math.sin(fAng) * (topRadius * 1.65));
        capGroup.add(fleurette);
      }

      colGroup.add(capGroup);
      return colGroup;
    };

    // 2. Towering Twin Carrara Marble Triumphal Piers (Soaring to y = 52m with Corinthian columns & eternal flame braziers)
    const pylon = (cx, isLeft) => {
      const col = new THREE.Group();

      // Soft contact shadow beneath monumental pier plinth
      const pierShadow = createContactShadow(16.0);
      col.add(pierShadow);

      // Multi-tiered Honed Carrara Marble foundation plinth (y: 0 to 4.8)
      const plinthStep1 = new THREE.Mesh(new THREE.BoxGeometry(15.6, 2.0, 15.6), marble);
      plinthStep1.position.y = 1.0;
      col.add(plinthStep1);

      const plinthStep2 = new THREE.Mesh(new THREE.BoxGeometry(14.4, 1.6, 14.4), stoneLight);
      plinthStep2.position.y = 2.8;
      col.add(plinthStep2);

      const plinthTorus = new THREE.Mesh(new THREE.BoxGeometry(13.4, 1.2, 13.4), marble);
      plinthTorus.position.y = 4.2;
      col.add(plinthTorus);

      const plinthGoldBand = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.25, 13.5), gold);
      plinthGoldBand.position.y = 4.8;
      col.add(plinthGoldBand);

      // Layered Honed White Carrara Marble Shaft (y: 4.8 to 42.0, height = 37.2m)
      const shaftHeight = 37.2;
      const numCourses = 12;
      const courseHeight = shaftHeight / numCourses;
      for (let i = 0; i < numCourses; i++) {
        const width = 12.8 - i * 0.05; // subtle classical entasis taper
        const depth = 13.8 - i * 0.05;
        const course = new THREE.Mesh(new THREE.BoxGeometry(width, courseHeight - 0.08, depth), marble);
        course.position.y = 4.8 + courseHeight * (i + 0.5);
        course.castShadow = true;
        course.receiveShadow = true;
        col.add(course);

        // Recessed Carrara panels with gilded molding on facades
        if (i > 0 && i < numCourses - 1) {
          for (let rot of [0, Math.PI]) {
            const panel = new THREE.Mesh(new THREE.BoxGeometry(width - 2.6, courseHeight - 0.24, 0.4), stoneLight);
            panel.position.set(0, 4.8 + courseHeight * (i + 0.5), (depth / 2 + 0.1) * (rot === 0 ? 1 : -1));
            col.add(panel);
          }
        }
      }

      // 4 Monumental Corinthian Fluted Columns with 24K Gold Capitals at the 4 corners of each pier (y: 4.8 to 42.0)
      const colOffsets = [
        [-5.2, -5.2], [5.2, -5.2], [-5.2, 5.2], [5.2, 5.2]
      ];
      colOffsets.forEach(([px, pz]) => {
        const corinthianCol = createCorinthianColumn(shaftHeight - 0.5, 1.15, 0.98);
        corinthianCol.position.set(px, 4.8, pz);
        col.add(corinthianCol);
      });

      // Bas-relief 24K gilded bronze medallions on facades (y = 22.0m)
      [-7.0, 7.0].forEach(pz => {
        const medallion = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.45, 24), gold);
        medallion.rotation.x = Math.PI / 2;
        medallion.position.set(0, 22.0, pz);
        col.add(medallion);

        const starburstCenter = new THREE.Mesh(new THREE.OctahedronGeometry(1.0, 0), gold);
        starburstCenter.position.set(0, 22.0, pz + (pz > 0 ? 0.35 : -0.35));
        col.add(starburstCenter);
      });

      // Impost Molding Band at arch spring level (y: 37.0 to 38.2)
      const impost = new THREE.Mesh(new THREE.BoxGeometry(13.4, 1.2, 14.4), marble);
      impost.position.y = 37.6;
      col.add(impost);

      const impostGold = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.3, 14.5), gold);
      impostGold.position.y = 38.2;
      col.add(impostGold);

      // Classical Entablature & Carved Cornice Moulding (y: 42.0 to 46.5)
      const architrave = new THREE.Mesh(new THREE.BoxGeometry(13.6, 1.2, 14.6), marble);
      architrave.position.y = 42.6;
      col.add(architrave);

      const frieze = new THREE.Mesh(new THREE.BoxGeometry(13.0, 1.6, 14.0), marble);
      frieze.position.y = 44.0;
      col.add(frieze);

      for (let a = 0; a < 4; a++) {
        const rotGroup = new THREE.Group();
        rotGroup.rotation.y = a * (Math.PI / 2);
        for (let rz = -4.5; rz <= 4.5; rz += 3.0) {
          const rosette = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), gold);
          rosette.position.set(rz, 44.0, 7.1);
          rotGroup.add(rosette);
        }
        col.add(rotGroup);
      }

      const cornice = new THREE.Mesh(new THREE.BoxGeometry(15.2, 1.4, 16.2), marble);
      cornice.position.y = 45.5;
      col.add(cornice);

      // Stepped Attic Plinth with Corner Acroteria Finials (y: 46.5 to 52.0)
      const attic = new THREE.Mesh(new THREE.BoxGeometry(12.4, 4.8, 13.4), marble);
      attic.position.y = 48.6;
      col.add(attic);

      [-6.8, 6.8].forEach(pz => {
        const wreath = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.28, 8, 16), gold);
        wreath.position.set(0, 48.6, pz);
        col.add(wreath);
      });

      [[-5.2, -5.8], [5.2, -5.8], [-5.2, 5.8], [5.2, 5.8]].forEach(([ax, az]) => {
        const acroterion = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.0, 4), gold);
        acroterion.rotation.y = Math.PI / 4;
        acroterion.position.set(ax, 51.5, az);
        col.add(acroterion);
      });

      // 3. Classical Sculpted Bronze Urn & Soaring Eternal Flame Brazier (y: 52.0 to 62.0m)
      const pierBrazier = createBrazier(1.0, isLeft);
      pierBrazier.position.set(0, 51.0, 0);
      col.add(pierBrazier);

      col.position.set(cx, 0, 0);
      return col;
    };

    g.add(pylon(-pierCenterX, true), pylon(pierCenterX, false));

    // 4. Soaring Semicircular Triumphal Arch & Pierced Spandrels (Springing at y = 38.0m, soaring to y = 62.0m)
    const archSpringY = 38.0;
    const archR = HALF; // 24.0m radius (spans from x = -24 to x = +24, apex at y = 38 + 24 = 62m)

    // Concentric Archivolt Bands:
    const innerArchPts = [];
    for (let i = 0; i <= 32; i++) {
      const theta = Math.PI - (i / 32) * Math.PI;
      innerArchPts.push(new THREE.Vector3(Math.cos(theta) * (archR - 0.8), archSpringY + Math.sin(theta) * (archR - 0.8), 0));
    }
    const innerArchCurve = new THREE.CatmullRomCurve3(innerArchPts);
    const innerArch = new THREE.Mesh(new THREE.TubeGeometry(innerArchCurve, 48, 0.65, 8), marble);
    g.add(innerArch);

    const mainArchPts = [];
    for (let i = 0; i <= 32; i++) {
      const theta = Math.PI - (i / 32) * Math.PI;
      mainArchPts.push(new THREE.Vector3(Math.cos(theta) * archR, archSpringY + Math.sin(theta) * archR, 0));
    }
    const mainArchCurve = new THREE.CatmullRomCurve3(mainArchPts);
    const mainArch = new THREE.Mesh(new THREE.TubeGeometry(mainArchCurve, 48, 0.95, 8), marble);
    g.add(mainArch);

    const outerArchPts = [];
    for (let i = 0; i <= 32; i++) {
      const theta = Math.PI - (i / 32) * Math.PI;
      outerArchPts.push(new THREE.Vector3(Math.cos(theta) * (archR + 0.9), archSpringY + Math.sin(theta) * (archR + 0.9), 0));
    }
    const outerArchCurve = new THREE.CatmullRomCurve3(outerArchPts);
    const outerArch = new THREE.Mesh(new THREE.TubeGeometry(outerArchCurve, 48, 0.50, 8), gold);
    g.add(outerArch);

    // Radiating Honed Marble Voussoirs along the Arch Extrados (23 wedge-shaped voussoirs)
    const numVoussoirs = 23;
    for (let v = 1; v < numVoussoirs; v++) {
      const vAngle = Math.PI - (v / numVoussoirs) * Math.PI;
      const vx = Math.cos(vAngle) * (archR + 0.45);
      const vy = archSpringY + Math.sin(vAngle) * (archR + 0.45);
      const voussoir = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.4, 2.8), marble);
      voussoir.position.set(vx, vy, 0);
      voussoir.rotation.z = vAngle - Math.PI / 2;
      g.add(voussoir);

      const vCrest = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), gold);
      vCrest.position.set(vx, vy, 1.5);
      g.add(vCrest);
      const vCrestBack = vCrest.clone();
      vCrestBack.position.set(vx, vy, -1.5);
      g.add(vCrestBack);
    }

    // Monumental Sculpted Keystone at Arch Apex (x = 0, y = 62.9m)
    const keystoneGroup = new THREE.Group();
    keystoneGroup.position.set(0, archSpringY + archR + 0.9, 0);
    const keystoneBlock = new THREE.Mesh(new THREE.BoxGeometry(3.6, 4.2, 3.6), marble);
    keystoneGroup.add(keystoneBlock);

    // High-relief Acanthus console scroll and 24K celestial star emblem
    for (let s of [-1.9, 1.9]) {
      const keystoneConsole = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.2, 0.4), gold);
      keystoneConsole.position.set(0, 0, s);
      keystoneGroup.add(keystoneConsole);

      const keystoneCrest = new THREE.Mesh(new THREE.OctahedronGeometry(1.5, 0), gold);
      keystoneCrest.position.set(0, 0.4, s + (s > 0 ? 0.25 : -0.25));
      keystoneGroup.add(keystoneCrest);

      const keystoneWreath = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.22, 8, 16), gold);
      keystoneWreath.position.set(0, 0.4, s + (s > 0 ? 0.2 : -0.2));
      keystoneGroup.add(keystoneWreath);
    }
    g.add(keystoneGroup);

    // Coffered Intrados Vault: 15 Deeply Recessed Stepped Coffer Panels & Multi-Tier Gilded Rosettes
    for (let c = 1; c <= 15; c++) {
      const cAngle = Math.PI - (c / 16) * Math.PI;
      const cx = Math.cos(cAngle) * (archR - 1.1);
      const cy = archSpringY + Math.sin(cAngle) * (archR - 1.1);

      // Outer Stepped Coffer Frame
      const cofferOuter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.45, 3.8), marble);
      cofferOuter.position.set(cx, cy, 0);
      cofferOuter.rotation.z = cAngle - Math.PI / 2;
      g.add(cofferOuter);

      // Inner Sunken Coffer Lacunaria
      const cofferInner = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.25, 3.0), stoneLight);
      cofferInner.position.set(cx, cy, 0);
      cofferInner.rotation.z = cAngle - Math.PI / 2;
      g.add(cofferInner);

      // Multi-Tiered 24K Gilded Rosette
      const rosetteDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.1, 12), gold);
      rosetteDisc.position.set(cx, cy, 0);
      rosetteDisc.rotation.z = cAngle - Math.PI / 2;
      g.add(rosetteDisc);

      const cofferRosetteCore = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), gold);
      cofferRosetteCore.position.set(cx, cy, 0);
      g.add(cofferRosetteCore);
    }

    // 4b. Pierced Classical Spandrels Framing the Valley Vista (y: 38 to 54m)
    for (const side of [-1, 1]) {
      const spandrelGroup = new THREE.Group();
      const spandrelCenterX = side * (HALF / 2 + 4.5);
      const spandrelCenterY = archSpringY + 7.5;
      spandrelGroup.position.set(spandrelCenterX, spandrelCenterY, 0);

      const topFrame = new THREE.Mesh(new THREE.BoxGeometry(HALF - 4.5, 1.4, 2.2), marble);
      topFrame.position.set(0, 6.8, 0);
      spandrelGroup.add(topFrame);

      const outerFrame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 14.5, 2.2), marble);
      outerFrame.position.set(side * ((HALF - 4.5) / 2 - 0.8), 0, 0);
      spandrelGroup.add(outerFrame);

      const oculusRing = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.65, 12, 32), marble);
      spandrelGroup.add(oculusRing);

      const oculusGoldInner = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.28, 8, 24), gold);
      spandrelGroup.add(oculusGoldInner);

      const oculusGoldOuter = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.24, 8, 24), gold);
      spandrelGroup.add(oculusGoldOuter);

      for (let r = 0; r < 8; r++) {
        const ang = (r / 8) * Math.PI * 2;
        const rayMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.1, 6), gold);
        rayMesh.rotation.z = ang;
        rayMesh.position.set(Math.sin(ang) * 1.55, Math.cos(ang) * 1.55, 0);
        spandrelGroup.add(rayMesh);
      }

      const oculusCenterStar = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), gold);
      spandrelGroup.add(oculusCenterStar);

      g.add(spandrelGroup);
    }

    // 5. Floating Gilded Inscription Frieze & Monumental Inscription Plaque (y: 44.0 to 55.0m)
    const atticFriezeY = 48.5;
    const atticWidth = HALF * 2 + 2; // 50m wide attic frieze spanning piers

    const atticBaseBeam = new THREE.Mesh(new THREE.BoxGeometry(atticWidth, 1.4, 3.6), marble);
    atticBaseBeam.position.set(0, atticFriezeY - 4.2, 0);
    g.add(atticBaseBeam);

    const atticTopCornice = new THREE.Mesh(new THREE.BoxGeometry(atticWidth + 2.4, 1.6, 4.2), marble);
    atticTopCornice.position.set(0, atticFriezeY + 4.6, 0);
    g.add(atticTopCornice);

    const cnvMain = document.createElement('canvas');
    cnvMain.width = 512; cnvMain.height = 128;
    const ctxMain = cnvMain.getContext('2d');
    ctxMain.scale(0.25, 0.25);

    const bgGrad = ctxMain.createLinearGradient(0, 0, 0, 512);
    bgGrad.addColorStop(0, '#07100a');
    bgGrad.addColorStop(0.5, '#102015');
    bgGrad.addColorStop(1, '#07100a');
    ctxMain.fillStyle = bgGrad;
    ctxMain.fillRect(0, 0, 2048, 512);

    ctxMain.strokeStyle = '#d4af37';
    ctxMain.lineWidth = 14;
    ctxMain.strokeRect(18, 18, 2012, 476);
    ctxMain.strokeStyle = '#f8db70';
    ctxMain.lineWidth = 4;
    ctxMain.strokeRect(36, 36, 1976, 440);

    ctxMain.fillStyle = '#f8db70';
    [[54, 54], [1994, 54], [54, 458], [1994, 458]].forEach(([cx, cy]) => {
      ctxMain.beginPath(); ctxMain.arc(cx, cy, 15, 0, Math.PI * 2); ctxMain.fill();
      ctxMain.strokeStyle = '#d4af37'; ctxMain.lineWidth = 3; ctxMain.stroke();
    });

    ctxMain.textAlign = 'center'; ctxMain.textBaseline = 'middle';
    ctxMain.font = 'bold 148px "Cinzel", "Georgia", "Times New Roman", serif';
    ctxMain.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctxMain.fillText('ETERNAL VALLEY', 1024 + 4, 180 + 6);

    const goldGrad = ctxMain.createLinearGradient(0, 100, 0, 260);
    goldGrad.addColorStop(0, '#ffffff');
    goldGrad.addColorStop(0.25, '#fff4cc');
    goldGrad.addColorStop(0.55, '#f8db70');
    goldGrad.addColorStop(0.85, '#d4af37');
    goldGrad.addColorStop(1, '#aa8218');
    ctxMain.fillStyle = goldGrad;
    ctxMain.fillText('ETERNAL VALLEY', 1024, 180);

    ctxMain.font = '600 64px "Cinzel", "Georgia", "Times New Roman", serif';
    ctxMain.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctxMain.fillText('✦   SOMEWHERE OVER THE RAINBOW BRIDGE   ✦', 1024 + 3, 340 + 4);

    const subGrad = ctxMain.createLinearGradient(0, 300, 0, 380);
    subGrad.addColorStop(0, '#fff4cc');
    subGrad.addColorStop(0.6, '#f8db70');
    subGrad.addColorStop(1, '#c9a232');
    ctxMain.fillStyle = subGrad;
    ctxMain.fillText('✦   SOMEWHERE OVER THE RAINBOW BRIDGE   ✦', 1024, 340);

    const texMain = new THREE.CanvasTexture(cnvMain);
    texMain.anisotropy = 16;

    const plaqueMount = new THREE.Mesh(
      new THREE.BoxGeometry(45, 7.8, 1.4),
      new THREE.MeshPhysicalMaterial({ color: 0x181714, roughness: 0.30, metalness: 0.85 })
    );
    plaqueMount.position.set(0, atticFriezeY, 0);
    g.add(plaqueMount);

    const signMat = new THREE.MeshPhysicalMaterial({
      map: texMain,
      emissiveMap: texMain,
      emissive: new THREE.Color(0xffdf70),
      emissiveIntensity: 0.95,
      roughness: 0.25,
      metalness: 0.6,
    });
    const signFront = new THREE.Mesh(new THREE.PlaneGeometry(44, 7.2), signMat);
    signFront.position.set(0, atticFriezeY, 0.75);
    g.add(signFront);

    const signBack = signFront.clone();
    signBack.rotation.y = Math.PI;
    signBack.position.set(0, atticFriezeY, -0.75);
    g.add(signBack);

    // Crowning Balustrade & Central Triumphal Pediment atop the Attic (y: 54 to 60m)
    const atticBalustradeRail = new THREE.Mesh(new THREE.BoxGeometry(atticWidth, 0.55, 1.2), marble);
    atticBalustradeRail.position.set(0, atticFriezeY + 6.2, 0);
    g.add(atticBalustradeRail);

    for (let abx = -20; abx <= 20; abx += 4.0) {
      const atticUrn = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 6), gold);
      atticUrn.position.set(abx, atticFriezeY + 7.1, 0);
      g.add(atticUrn);
    }

    const topPediment = new THREE.Mesh(new THREE.ConeGeometry(8.0, 3.6, 4), marble);
    topPediment.rotation.y = Math.PI / 4;
    topPediment.position.set(0, atticFriezeY + 7.2, 0);
    g.add(topPediment);

    const topStarburst = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0), gold);
    topStarburst.position.set(0, atticFriezeY + 9.2, 0);
    g.add(topStarburst);

    // 6. Delicate Openwork Gilded Filigree Gates (this.leftGateDoor, this.rightGateDoor)
    const gateLeaf = (isLeft) => {
      const leafGeos = [];
      const addGeo = (geo, x, y, z, rx=0, ry=0, rz=0, sx=1, sy=1, sz=1) => {
        const g = geo.clone();
        if(rx!==0 || ry!==0 || rz!==0) {
          const e = new THREE.Euler(rx, ry, rz);
          const q = new THREE.Quaternion().setFromEuler(e);
          const m = new THREE.Matrix4().compose(new THREE.Vector3(0,0,0), q, new THREE.Vector3(1,1,1));
          g.applyMatrix4(m);
        }
        if(sx!==1 || sy!==1 || sz!==1) g.scale(sx, sy, sz);
        g.translate(x, y, z);
        leafGeos.push(g);
      };

      const W = HALF - 0.6; // Width of gate leaf (23.4m each leaf)
      const gateHeight = 35.0; // Soaring 35m tall gate leaves

      addGeo(new THREE.BoxGeometry(W, 1.2, 1.2), W / 2, gateHeight - 0.7, 0);
      addGeo(new THREE.BoxGeometry(W, 1.0, 1.0), W / 2, 23.0, 0);
      addGeo(new THREE.BoxGeometry(W, 1.0, 1.0), W / 2, 12.0, 0);
      addGeo(new THREE.BoxGeometry(W, 1.2, 1.2), W / 2, 1.0, 0);
      addGeo(new THREE.BoxGeometry(1.2, gateHeight, 1.2), W, gateHeight / 2, 0);
      addGeo(new THREE.BoxGeometry(1.5, gateHeight + 1.0, 1.5), 0, (gateHeight + 1.0) / 2, 0);

      [3.5, 12.0, 21.0, 31.0].forEach(hy => {
        addGeo(new THREE.CylinderGeometry(0.9, 0.9, 2.0, 16), 0, hy, 0);
      });

      const numPickets = 16;
      for (let i = 1; i < numPickets; i++) {
        const bx = (i / numPickets) * W;
        const archCurveOffset = Math.sin((i / numPickets) * Math.PI) * 3.5;
        const hgt = gateHeight - 1.5 + archCurveOffset;
        
        addGeo(new THREE.CylinderGeometry(0.24, 0.24, hgt, 8), bx, hgt / 2 + 0.8, 0);
        addGeo(new THREE.ConeGeometry(0.65, 2.6, 6), bx, hgt + 2.1, 0);
        addGeo(new THREE.CylinderGeometry(0.18, 0.18, 9.5, 6), bx + W / (numPickets * 2), 5.8, 0);
        addGeo(new THREE.ConeGeometry(0.42, 1.4, 6), bx + W / (numPickets * 2), 10.8, 0);
      }

      for (let s = 1; s <= 4; s++) {
        const sx = (s / 5) * W;
        addGeo(new THREE.TorusGeometry(2.4, 0.28, 8, 20), sx, 6.5, 0);
        addGeo(new THREE.TorusGeometry(2.0, 0.26, 8, 16), sx, 17.5, 0);
        addGeo(new THREE.TorusGeometry(1.8, 0.24, 8, 16), sx, 28.5, 0);
      }

      // Celestial Starburst Centerpiece (Positioned at y = 17.5m)
      addGeo(new THREE.TorusGeometry(3.8, 0.35, 8, 32), W / 2, 17.5, 0);
      addGeo(new THREE.TorusGeometry(2.4, 0.25, 8, 24), W / 2, 17.5, 0);

      for (let r = 0; r < 16; r++) {
        const ang = (r / 16) * Math.PI * 2;
        const rayLen = r % 2 === 0 ? 3.6 : 2.4;
        addGeo(new THREE.ConeGeometry(0.42, rayLen, 4), W / 2 + Math.cos(ang) * (rayLen / 2 + 0.4), 17.5 + Math.sin(ang) * (rayLen / 2 + 0.4), 0, 0, 0, -ang + Math.PI / 2);
      }

      addGeo(new THREE.OctahedronGeometry(1.3, 0), W / 2, 17.5, 0);

      // Sculpted Gilded Bronze Peaceful Dove Emblem (y = 27.5m)
      const dX = W / 2;
      const dY = 27.5;
      
      addGeo(new THREE.SphereGeometry(1.2, 16, 12), dX, dY, 0, 0, 0, 0, 1.5, 0.9, 0.75);
      addGeo(new THREE.SphereGeometry(0.6, 12, 10), dX + (isLeft ? 1.1 : -1.1), dY + 0.55, 0);
      addGeo(new THREE.ConeGeometry(0.22, 0.75, 4), dX + (isLeft ? 1.65 : -1.65), dY + 0.5, 0, 0, 0, isLeft ? -Math.PI / 2 : Math.PI / 2);

      for (let w of [-1, 1]) {
        addGeo(new THREE.ConeGeometry(1.3, 4.2, 6), dX, dY + 1.8, w * 1.3, w * 0.6, 0, (isLeft ? 0.35 : -0.35) + w * 0.4, 1.0, 1.0, 0.2);
      }

      addGeo(new THREE.ConeGeometry(1.0, 2.4, 4), dX + (isLeft ? -1.5 : 1.5), dY - 0.45, 0, 0, 0, isLeft ? 1.2 : -1.2, 1.2, 1.0, 0.15);

      const branchCurve = new THREE.QuadraticBezierCurve3(
        new V3(isLeft ? 1.65 : -1.65, 0.5, 0),
        new V3(isLeft ? 2.8 : -2.8, 0.9, 0.3),
        new V3(isLeft ? 3.7 : -3.7, 0.25, 0)
      );
      addGeo(new THREE.TubeGeometry(branchCurve, 12, 0.14, 6), dX, dY, 0);

      const mergedGeo = safeMerge(leafGeos, false) || leafGeos[0];
      const leafMesh = new THREE.Mesh(mergedGeo, gold);
      leafMesh.castShadow = true;
      leafMesh.receiveShadow = true;
      return leafMesh;
    };

    const left = gateLeaf(true);
    left.position.set(-HALF + 0.5, 1.0, 0);
    left.rotation.y = 0; // Starts closed
    g.add(left);

    const right = gateLeaf(false);
    right.position.set(HALF - 0.5, 1.0, 0);
    right.rotation.y = Math.PI; // Starts closed
    g.add(right);

    this.leftGateDoor = left; left.name = "DynamicGateDoorLeft"; left.userData = { isDynamic: true };
    this.rightGateDoor = right; right.name = "DynamicGateDoorRight"; right.userData = { isDynamic: true };
    this.gateOpenAmount = 0.0;
    this.gateTargetOpen = 0.0;

    // 7. Flanking Curved Semi-Circular Colonnades & Monumental Bronze Braziers (x = +/-36m to +/-96m)
    const curvedColonnade = (isEast) => {

      const colGroup = new THREE.Group();
      const s = isEast ? 1 : -1;
      const numCols = 10;
      const arcRadius = 56.0;
      const startAngle = 0.0;
      const endAngle = 1.15; // ~66 degrees sweeping inward/forward
      const startX = s * (HALF + pierWidth); // 36m from center

      // Stylobate Curved Terrace Platform
      for (let c = 0; c < numCols; c++) {
        const t = c / (numCols - 1);
        const theta = startAngle + t * (endAngle - startAngle);
        const colX = startX + s * (Math.sin(theta) * arcRadius);
        const colZ = (1.0 - Math.cos(theta)) * (arcRadius * 0.7);

        // Stylobate base block under each column
        const styloBlock = new THREE.Mesh(new THREE.BoxGeometry(7.5, 2.0, 8.5), stoneLight);
        styloBlock.position.set(colX, 1.0, colZ);
        styloBlock.rotation.y = -s * theta * 0.7;
        styloBlock.receiveShadow = true;
        colGroup.add(styloBlock);

        const styloStep = new THREE.Mesh(new THREE.BoxGeometry(8.5, 1.0, 9.5), marble);
        styloStep.position.set(colX, 0.5, colZ);
        styloStep.rotation.y = -s * theta * 0.7;
        styloStep.receiveShadow = true;
        colGroup.add(styloStep);

        // Fluted Corinthian Peristyle Column (height 12m)
        const colMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 12.0, 16), marble);
        colMesh.position.set(colX, 8.0, colZ);
        colMesh.castShadow = true;
        colGroup.add(colMesh);

        const colCap = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.4, 3.0), marble);
        colCap.position.set(colX, 14.4, colZ);
        colGroup.add(colCap);

        const colCapGold = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.35, 8, 16), gold);
        colCapGold.rotation.x = Math.PI / 2;
        colCapGold.position.set(colX, 14.2, colZ);
        colGroup.add(colCapGold);

        const colBase = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.2, 3.0), marble);
        colBase.position.set(colX, 2.6, colZ);
        colGroup.add(colBase);

        // Entablature segment
        const entSegment = new THREE.Mesh(new THREE.BoxGeometry(7.8, 2.0, 4.8), marble);
        entSegment.position.set(colX, 15.8, colZ);
        entSegment.rotation.y = -s * theta * 0.7;
        colGroup.add(entSegment);

        const corniceSegment = new THREE.Mesh(new THREE.BoxGeometry(8.4, 1.2, 5.4), marble);
        corniceSegment.position.set(colX, 17.0, colZ);
        corniceSegment.rotation.y = -s * theta * 0.7;
        colGroup.add(corniceSegment);

        // Balustrade between column bays
        if (c < numCols - 1) {
          const nextT = (c + 1) / (numCols - 1);
          const nextTheta = startAngle + nextT * (endAngle - startAngle);
          const midTheta = (theta + nextTheta) / 2;
          const midX = startX + s * (Math.sin(midTheta) * arcRadius);
          const midZ = (1.0 - Math.cos(midTheta)) * (arcRadius * 0.7);

          const balRail = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.6, 1.2), marble);
          balRail.position.set(midX, 5.2, midZ);
          balRail.rotation.y = -s * midTheta * 0.7;
          colGroup.add(balRail);

          for (let b = -2; b <= 2; b++) {
            const bOffset = b * 0.9;
            const balX = midX + Math.cos(midTheta * 0.7) * bOffset;
            const balZ = midZ + Math.sin(midTheta * 0.7) * (s * bOffset);
            const baluster = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 2.4, 8), marble);
            baluster.position.set(balX, 3.8, balZ);
            colGroup.add(baluster);
          }

          // Monumental bronze brazier with dancing golden flames on alternating bays
          if (c % 2 === 1) {
            const colBrazier = createBrazier(0.55, isEast);
            colBrazier.position.set(midX, 17.6, midZ);
            colGroup.add(colBrazier);
          } else {
            // Classical Carved Carrara Marble Floral Urn with Cascading Blooming Roses
            const styloUrn = createFloralUrn(0.78);
            styloUrn.position.set(midX, 5.5, midZ);
            colGroup.add(styloUrn);
          }
        }
      }

      // Terminal Classical Wing Pavilion with Pediment & Monumental Brazier
      const termTheta = endAngle;
      const termX = startX + s * (Math.sin(termTheta) * arcRadius + 7.0);
      const termZ = (1.0 - Math.cos(termTheta)) * (arcRadius * 0.7) + 2.0;

      // Soft contact shadow beneath pavilion
      const pavShadow = createContactShadow(14.0);
      pavShadow.position.set(termX, 0.05, termZ);
      colGroup.add(pavShadow);

      const pavilion = new THREE.Mesh(new THREE.BoxGeometry(16, 15.0, 16), marble);
      pavilion.position.set(termX, 8.5, termZ);
      pavilion.rotation.y = -s * termTheta * 0.7;
      colGroup.add(pavilion);

      const pediment = new THREE.Mesh(new THREE.ConeGeometry(12, 6.0, 4), marble);
      pediment.rotation.y = Math.PI / 4 - s * termTheta * 0.7;
      pediment.position.set(termX, 18.8, termZ);
      colGroup.add(pediment);

      const pavFinial = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 12), gold);
      pavFinial.position.set(termX, 22.8, termZ);
      colGroup.add(pavFinial);

      // Monumental brazier atop terminal wing pavilion
      const terminalBrazier = createBrazier(0.85, isEast);
      terminalBrazier.position.set(termX, 23.6, termZ);
      colGroup.add(terminalBrazier);

      // Colonnade Gilded Inscription Plaque
      const cnvPlaque = document.createElement('canvas');
      cnvPlaque.width = 512; cnvPlaque.height = 128;
      const ctxP = cnvPlaque.getContext('2d');
      ctxP.scale(0.25, 0.25);

      const pGrad = ctxP.createLinearGradient(0, 0, 0, 512);
      pGrad.addColorStop(0, '#0c1810');
      pGrad.addColorStop(0.5, '#16281a');
      pGrad.addColorStop(1, '#0c1810');
      ctxP.fillStyle = pGrad;
      ctxP.fillRect(0, 0, 2048, 512);

      ctxP.strokeStyle = '#d4af37';
      ctxP.lineWidth = 12;
      ctxP.strokeRect(16, 16, 2016, 480);
      ctxP.strokeStyle = '#f8db70';
      ctxP.lineWidth = 4;
      ctxP.strokeRect(32, 32, 1984, 448);

      ctxP.fillStyle = '#f8db70';
      [[48, 48], [2000, 48], [48, 464], [2000, 464]].forEach(([cx, cy]) => {
        ctxP.beginPath(); ctxP.arc(cx, cy, 14, 0, Math.PI * 2); ctxP.fill();
        ctxP.strokeStyle = '#d4af37'; ctxP.lineWidth = 3; ctxP.stroke();
      });

      ctxP.textAlign = 'center'; ctxP.textBaseline = 'middle';
      ctxP.font = 'bold 112px "Cinzel", "Georgia", "Times New Roman", serif';
      ctxP.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctxP.fillText('WELCOME TO ETERNAL VALLEY', 1024 + 3, 175 + 5);

      const titleGrad = ctxP.createLinearGradient(0, 100, 0, 240);
      titleGrad.addColorStop(0, '#ffffff');
      titleGrad.addColorStop(0.3, '#fff4cc');
      titleGrad.addColorStop(0.6, '#f8db70');
      titleGrad.addColorStop(1, '#d4af37');
      ctxP.fillStyle = titleGrad;
      ctxP.fillText('WELCOME TO ETERNAL VALLEY', 1024, 175);

      ctxP.font = '600 76px "Cinzel", "Georgia", "Times New Roman", serif';
      ctxP.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctxP.fillText('✦   WHERE LOVE LIVES FOREVER   ✦', 1024 + 2, 335 + 4);

      const subtitleGrad = ctxP.createLinearGradient(0, 280, 0, 380);
      subtitleGrad.addColorStop(0, '#fff4cc');
      subtitleGrad.addColorStop(0.6, '#f8db70');
      subtitleGrad.addColorStop(1, '#aa8218');
      ctxP.fillStyle = subtitleGrad;
      ctxP.fillText('✦   WHERE LOVE LIVES FOREVER   ✦', 1024, 335);

      const texPlaque = new THREE.CanvasTexture(cnvPlaque);
      texPlaque.anisotropy = 16;

      const plaqueMat = new THREE.MeshPhysicalMaterial({
        map: texPlaque,
        emissiveMap: texPlaque,
        emissive: new THREE.Color(0xffdf70),
        emissiveIntensity: 0.9,
        roughness: 0.28,
        metalness: 0.65,
      });
      const plaqueMesh = new THREE.Mesh(new THREE.PlaneGeometry(36, 1.8), plaqueMat);
      const midColT = 0.45;
      const midColTheta = startAngle + midColT * (endAngle - startAngle);
      const plaqueX = startX + s * (Math.sin(midColTheta) * arcRadius);
      const plaqueZ = (1.0 - Math.cos(midColTheta)) * (arcRadius * 0.7);
      plaqueMesh.position.set(plaqueX, 15.8, plaqueZ + 2.8);
      plaqueMesh.rotation.y = -s * midColTheta * 0.7;
      colGroup.add(plaqueMesh);

      return colGroup;
    };

    g.add(curvedColonnade(false), curvedColonnade(true));

    // Strategic Hero PointLight for the Entrance Grand Gate & Braziers (Consolidated)
    const gateHeroLight = new THREE.PointLight(0xffc266, 3.5, 95, 1.5);
    gateHeroLight.position.set(0, 18.0, 0);
    g.add(gateHeroLight);

    g.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    g.position.set(x, baseY, z);
    this.world.scene.add(g);
  }

  _rainbowBridge() {
    this._rainbowShaders = [];
    const { x: bx, z: bz } = WORLD.bridge;
    const g = new THREE.Group();



    // Luminous Classical & PBR Materials
    const marble = material('honedCarraraMarble', { repeat: 1.5, color: 0xfffef8, roughness: 0.1, metalness: 0.05, physical: true, clearcoat: 0.5, clearcoatRoughness: 0.15 });
    
    const stone = Surfaces.flagstone(3.2);
//     stone.color.setHex(0xc4b7a6);
//     stone.roughness = 0.85;
    if (stone.normalScale) stone.normalScale.set(2.0, 2.0);
//     stone.aoMapIntensity = 1.5;
    
    const stoneDark = Surfaces.limestoneDark(1.8); stoneDark.color.setHex(0x847966); stoneDark.roughness = 0.9; stoneDark.metalness = 0.0; stoneDark.normalScale.set(2.5, 2.5); stoneDark.aoMapIntensity = 1.8;
    
    const gold = Surfaces.gold(1.0);
//     gold.color.setHex(0xffe270);
//     gold.roughness = 0.1;
//     gold.clearcoat = 1.0;
//     gold.clearcoatRoughness = 0.05;
//     gold.roughness = 0.16;
//     gold.metalness = 0.96;

    const goldTrim = gold;

    const darkBronze = Surfaces.verdigrisBronze(1.0);
//     if (darkBronze && darkBronze.color) darkBronze.color.setHex(0x3e3224);
//     darkBronze.roughness = 0.28;
//     darkBronze.metalness = 0.88;

    // Ultra-Pure Optical Physical Crystal for Balustrade Balusters
    const crystalBalusterMat = new THREE.MeshPhysicalMaterial({
      color: 0xdff4ff,
      roughness: 0.04,
      metalness: 0.1,
      transparent: true, logarithmicDepthBuffer: true,
      opacity: 0.78,
      envMapIntensity: 2.2
    });

    // Pure Celestial Crystalline Dome Material
    const crystalDomeMat = new THREE.MeshPhysicalMaterial({
      color: 0xc8f0ff,
      roughness: 0.04,
      metalness: 0.1,
      transparent: true, logarithmicDepthBuffer: true,
      opacity: 0.80,
      envMapIntensity: 2.4,
      side: THREE.DoubleSide
    });

    // 1. Classical Carved Stone Approach Aprons & Retaining Wingwalls
    for (const [zOffset, zEnd] of [[-60, -70], [60, 70]]) {
      const apronZ = bz + (zOffset + zEnd) * 0.5;
      const deckStart = (zOffset < 0) ? 21.65 : 26.65;
      const terrAvg = terrainHeight(bx, apronZ);
      const foundationHeight = Math.max(2.0, deckStart - terrAvg + 2.0); // +2 to sink into ground
      const apronGeo = applyOrganicWeathering(new THREE.BoxGeometry(34, foundationHeight, Math.abs(zEnd - zOffset) + 2), 0.06, 0.18, 42);
      const apronMesh = new THREE.Mesh(apronGeo, stoneDark); // darker stone for wet abutments
      apronMesh.position.set(bx, terrAvg + foundationHeight * 0.5 - 1.0, apronZ);
      
      // Add subtle contact shadow on the water / ground
      const contactShadow = createContactShadow(42.0);
      contactShadow.position.set(bx, terrAvg + 0.1, apronZ);
      g.add(contactShadow);
      apronMesh.receiveShadow = apronMesh.castShadow = true;
      g.add(apronMesh);

      // Flared classical corner pilasters
      for (const s of [-1, 1]) {
        const postGeo = applyOrganicWeathering(new THREE.BoxGeometry(3.6, 4.8, 3.6), 0.08, 0.22, s * 77);
        const postMesh = new THREE.Mesh(postGeo, marble);
        postMesh.position.set(bx + s * 16.8, deckStart + 2.4 - 0.55, bz + zEnd);
        postMesh.castShadow = postMesh.receiveShadow = true;
        g.add(postMesh);

        // 24K gilded bronze acorn finial
        const finial = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 12), goldTrim);
        finial.position.set(bx + s * 16.8, deckStart + 4.8 - 0.55, bz + zEnd);
        finial.castShadow = true;
        g.add(finial);
      }
    }

    // 2. High-Performance Batched Arched Deck (Reduces 672 draw calls down to 5 merged meshes!)
    const SEG = 28;
    const stoneGeos = [];
    const starlightGeos = [];
    const goldStarGeos = [];
    const marbleBalustradeGeos = [];
    const crystalBalusterGeos = [];

    const rotMat = new THREE.Matrix4();
    const posMat = new THREE.Matrix4();
    const transMat = new THREE.Matrix4();

    for (let i = 0; i < SEG; i++) {
      const t = i / (SEG - 1);
      const z = bz - 60 + t * 120;
      const y = this.world._deckY(z);
      const rotX = -Math.cos(t * Math.PI) * 0.15;

      rotMat.makeRotationX(rotX);
      posMat.makeTranslation(bx, y, z);
      transMat.multiplyMatrices(posMat, rotMat);

      // Deck Stone Segment
      const segGeo = applyOrganicWeathering(new THREE.BoxGeometry(32, 1.4, 120 / SEG + 0.8), 0.09, 0.22, i * 7);
      bakeVertexCreviceOcclusion(segGeo, y - 1);
      segGeo.applyMatrix4(transMat);
      stoneGeos.push(segGeo);

      // Starlight Strip
      const stripGeo = new THREE.BoxGeometry(1.2, 0.08, 120 / SEG + 0.4);
      posMat.makeTranslation(bx, y + 0.74, z);
      transMat.multiplyMatrices(posMat, rotMat);
      stripGeo.applyMatrix4(transMat);
      starlightGeos.push(stripGeo);

      // Gold Star Markers
      if (i % 2 === 0) {
        for (const starSide of [-6.0, 6.0]) {
          const starGeo = new THREE.OctahedronGeometry(0.35, 0);
          posMat.makeTranslation(bx + starSide, y + 0.75, z);
          transMat.multiplyMatrices(posMat, rotMat);
          starGeo.applyMatrix4(transMat);
          goldStarGeos.push(starGeo);
        }
      }

      // Balustrades
      for (const s of [-1, 1]) {
        const plinthGeo = new THREE.BoxGeometry(1.6, 0.8, 110 / SEG + 0.9);
        posMat.makeTranslation(bx + s * 15, y + 1.1, z);
        transMat.multiplyMatrices(posMat, rotMat);
        plinthGeo.applyMatrix4(transMat);
        marbleBalustradeGeos.push(plinthGeo);

        for (let b = -1; b <= 1; b++) {
          const balZ = z + b * (120 / (SEG * 3));
          const balY = this.world._deckY(balZ) || y;
          const balGeo = new THREE.CylinderGeometry(0.26, 0.36, 1.8, 8);
          posMat.makeTranslation(bx + s * 15, balY + 2.3, balZ);
          transMat.multiplyMatrices(posMat, rotMat);
          balGeo.applyMatrix4(transMat);
          crystalBalusterGeos.push(balGeo);
        }

        const railGeo = new THREE.BoxGeometry(1.6, 0.6, 120 / SEG + 0.9);
        posMat.makeTranslation(bx + s * 15, y + 3.4, z);
        transMat.multiplyMatrices(posMat, rotMat);
        railGeo.applyMatrix4(transMat);
        marbleBalustradeGeos.push(railGeo);

        const goldCapGeo = new THREE.BoxGeometry(1.4, 0.25, 120 / SEG + 0.8);
        posMat.makeTranslation(bx + s * 15, y + 3.8, z);
        transMat.multiplyMatrices(posMat, rotMat);
        goldCapGeo.applyMatrix4(transMat);
        goldStarGeos.push(goldCapGeo);
      }
    }

    const mergedStone = mergeGeometries(stoneGeos, false);
    if (mergedStone) {
      const stoneMesh = new THREE.Mesh(mergedStone, stone);
      stoneMesh.castShadow = stoneMesh.receiveShadow = true;
      g.add(stoneMesh);
    }

    const mergedStarlight = mergeGeometries(starlightGeos, false);
    if (mergedStarlight) {
      g.add(new THREE.Mesh(mergedStarlight, new THREE.MeshPhysicalMaterial({
        color: 0xfff3cc, emissive: 0xffdf70, emissiveIntensity: 0.85, roughness: 0.2, metalness: 0.8
      })));
    }

    const mergedGoldStars = mergeGeometries(goldStarGeos, false);
    if (mergedGoldStars) {
      g.add(new THREE.Mesh(mergedGoldStars, goldTrim));
    }

    const mergedMarbleBalustrades = mergeGeometries(marbleBalustradeGeos, false);
    if (mergedMarbleBalustrades) {
      const mMesh = new THREE.Mesh(mergedMarbleBalustrades, marble);
      mMesh.castShadow = mMesh.receiveShadow = true;
      g.add(mMesh);
    }

    const mergedCrystalBalusters = mergeGeometries(crystalBalusterGeos, false);
    if (mergedCrystalBalusters) {
      const cMesh = new THREE.Mesh(mergedCrystalBalusters, crystalBalusterMat);
      cMesh.castShadow = true;
      g.add(cMesh);
    }

    // 3. Classical Carved Stone Arch Understructure with Open River Span
    for (const s of [-1, 1]) {
      for (const u of [0.04, 0.10, 0.90, 0.96]) {
        const z = bz - 60 + u * 120;
        const topY = this.world._deckY(z);
        const h = Math.max(1, topY - (WORLD.waterLevel - 2));
        const pierGeo = applyOrganicWeathering(new THREE.BoxGeometry(3.6, h, 8.5), 0.08, 0.26, Math.floor(u * 99));
        bakeVertexCreviceOcclusion(pierGeo, WORLD.waterLevel - 2);
        const pier = new THREE.Mesh(pierGeo, marble);
        pier.position.set(bx + s * 14.8, (WORLD.waterLevel - 2) + h / 2, z);
        pier.castShadow = pier.receiveShadow = true;
        g.add(pier);
      }
    }

    // 3 Monumental Classical Arched Vault Ribs spanning over the river
    for (const s of [-14.5, 0, 14.5]) {
      const archPoints = [];
      const ARCH_SEG = 24;
      for (let j = 0; j <= ARCH_SEG; j++) {
        const u = j / ARCH_SEG;
        const z = bz - 60 + u * 120;
        const topY = this.world._deckY(z);
        const archThick = 1.4 + Math.sin(u * Math.PI) * 0.8;
        archPoints.push(new V3(bx + s, topY - archThick, z));
      }
      const archCurve = new THREE.CatmullRomCurve3(archPoints);
      const tubeGeo = applyOrganicWeathering(new THREE.TubeGeometry(archCurve, 32, 1.2, 8, false), 0.07, 0.24, Math.floor(s + 50));
      const archMesh = new THREE.Mesh(tubeGeo, marble);
      archMesh.castShadow = archMesh.receiveShadow = true;
      g.add(archMesh);
    }

    // 4. Ornate Glowing Classical Lampposts and Balustrade Lanterns
    const cHalo = document.createElement('canvas');
    cHalo.width = cHalo.height = 128;
    const ctxH = cHalo.getContext('2d');
    const gradH = ctxH.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradH.addColorStop(0, 'rgba(255, 235, 150, 1.0)');
    gradH.addColorStop(0.25, 'rgba(255, 180, 50, 0.85)');
    gradH.addColorStop(0.60, 'rgba(255, 130, 20, 0.35)');
    gradH.addColorStop(1, 'rgba(255, 100, 0, 0.0)');
    ctxH.fillStyle = gradH;
    ctxH.fillRect(0, 0, 128, 128);
    const haloTex = new THREE.CanvasTexture(cHalo);
    const haloMat = new THREE.SpriteMaterial({
      map: haloTex,
      color: 0xffd166,
      blending: THREE.AdditiveBlending, transparent: true, logarithmicDepthBuffer: true,
      opacity: 0.95,
      depthWrite: false,
    });

    const lanternMat = new THREE.MeshPhysicalMaterial({
      color: 0xfff6dc,
      emissive: 0xffaa24,
      emissiveIntensity: 3.8,
      roughness: 0.15,
      metalness: 0.1,
    });
    const lanternCoreMat = new THREE.MeshBasicMaterial({ color: 0xfffaea });

    // 4 Grand Entrance Pillars
    const lampPositions = [
      [bx - 15, bz - 56], [bx + 15, bz - 56],
      [bx - 15, bz + 56], [bx + 15, bz + 56]
    ];
    for (const [lx, lz] of lampPositions) {
      const ly = this.world._deckY(lz) || 2;
      const post = new THREE.Group();
      post.position.set(lx, ly + 2.5, lz);
      
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.4, 2.4, 8), marble);
      base.position.y = 1.2; post.add(base);
      
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 4.8, 8), darkBronze);
      shaft.position.y = 4.4; post.add(shaft);
      
      const head = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 0), lanternMat);
      head.position.y = 7.2; post.add(head);

      const core = new THREE.Mesh(new THREE.SphereGeometry(0.65, 8, 8), lanternCoreMat);
      core.position.y = 7.2; post.add(core);

      const halo = new THREE.Sprite(haloMat);
      halo.position.y = 7.2;
      halo.scale.set(7.5, 7.5, 1.0);
      post.add(halo);
      
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.4, 6), goldTrim);
      cap.position.y = 8.4; post.add(cap);
      
      g.add(post);
    }

    // 6 Additional glowing balustrade lanterns along the bridge arch deck span
    const balustradeZ = [bz - 28, bz, bz + 28];
    for (const zVal of balustradeZ) {
      const yVal = this.world._deckY(zVal);
      for (const s of [-1, 1]) {
        const bPost = new THREE.Group();
        bPost.position.set(bx + s * 15, yVal + 3.8, zVal);

        const bLantern = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), lanternMat);
        bLantern.position.y = 0.9;
        bPost.add(bLantern);

        const bCore = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), lanternCoreMat);
        bCore.position.y = 0.9;
        bPost.add(bCore);

        const bHalo = new THREE.Sprite(haloMat);
        bHalo.position.y = 0.9;
        bHalo.scale.set(5.0, 5.0, 1.0);
        bPost.add(bHalo);

        g.add(bPost);
      }
    }

    // 5. THE KAYA STARLIGHT BEACON PAVILION (Overlooking the Rainbow River & Arch Vista)
    // Cantilevered Belvedere Rotunda Platform at the Bridge Apex (x = +24.0, z = bz = 440, y = deckY)
    const apexY = this.world._deckY ? this.world._deckY(bz) : 14.8;
    const terrY = terrainHeight(bx + 24.0, bz);
    const pavGroup = new THREE.Group();
    pavGroup.position.set(bx + 24.0, apexY, bz);

    // Deep structural foundation anchoring the pavilion solidly into the coastal cliffside
    const foundationHeight = Math.max(0.1, apexY - terrY);
    const pavFoundation = new THREE.Mesh(new THREE.CylinderGeometry(15.2, 16.5, foundationHeight, 32), stoneDark);
    pavFoundation.position.y = -foundationHeight / 2;
    pavFoundation.castShadow = true;
    pavFoundation.receiveShadow = true;
    pavGroup.add(pavFoundation);

    // Stepped Circular Carrara Marble Belvedere Platform
    const pavStylobate1 = new THREE.Mesh(new THREE.CylinderGeometry(14.0, 15.2, 1.6, 32), marble);
    pavStylobate1.position.y = 0.8;
    pavStylobate1.receiveShadow = true;
    pavGroup.add(pavStylobate1);

    const pavStylobate2 = new THREE.Mesh(new THREE.CylinderGeometry(12.6, 13.4, 1.2, 32), marble);
    pavStylobate2.position.y = 2.2;
    pavStylobate2.receiveShadow = true;
    pavGroup.add(pavStylobate2);

    // Inlaid 24K Gold Celestial Starburst Pavement inside the pavilion
    for (let rot = 0; rot < 8; rot++) {
      const ray = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 10.5), goldTrim);
      ray.position.y = 2.85;
      ray.rotation.y = (rot * Math.PI) / 8;
      pavGroup.add(ray);
    }
    const starCenter = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.1, 16), goldTrim);
    starCenter.position.y = 2.86;
    pavGroup.add(starCenter);

    // 8 Fluted Corinthian Peristyle Columns with 24K Gilded Acanthus Capitals
    const numPavCols = 8;
    for (let c = 0; c < numPavCols; c++) {
      const ang = (c / numPavCols) * Math.PI * 2;
      const cx = Math.cos(ang) * 10.5;
      const cz = Math.sin(ang) * 10.5;

      const colMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.80, 8.5, 16), marble);
      colMesh.position.set(cx, 2.8 + 4.25, cz);
      colMesh.castShadow = true;
      pavGroup.add(colMesh);

      const colBase = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 2.0), marble);
      colBase.position.set(cx, 3.2, cz);
      pavGroup.add(colBase);

      const colCap = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 2.2), marble);
      colCap.position.set(cx, 2.8 + 8.2, cz);
      pavGroup.add(colCap);

      const colCapGold = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.26, 8, 16), goldTrim);
      colCapGold.rotation.x = Math.PI / 2;
      colCapGold.position.set(cx, 2.8 + 8.1, cz);
      pavGroup.add(colCapGold);

      // Pierced Crystal Balustrade between outer columns
      if (c !== 4) { // keep west entrance towards bridge carriageway open
        const nextAng = ((c + 1) / numPavCols) * Math.PI * 2;
        const midAng = (ang + nextAng) / 2;
        const mx = Math.cos(midAng) * 10.5;
        const mz = Math.sin(midAng) * 10.5;

        const balRail = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.5, 0.8), marble);
        balRail.position.set(mx, 5.0, mz);
        balRail.rotation.y = -midAng + Math.PI / 2;
        pavGroup.add(balRail);

        for (let b = -1; b <= 1; b++) {
          const balX = mx + Math.cos(midAng + Math.PI / 2) * (b * 0.9);
          const balZ = mz + Math.sin(midAng + Math.PI / 2) * (b * 0.9);
          const crystalBal = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.5, 8), crystalBalusterMat);
          crystalBal.position.set(balX, 3.8, balZ);
          pavGroup.add(crystalBal);
        }
      }
    }

    // Circular Carrara Marble Entablature & Frieze
    const entRing = new THREE.Mesh(new THREE.TorusGeometry(10.5, 0.85, 12, 32), marble);
    entRing.rotation.x = Math.PI / 2;
    entRing.position.y = 2.8 + 9.0;
    pavGroup.add(entRing);

    const goldEntBand = new THREE.Mesh(new THREE.TorusGeometry(10.6, 0.22, 8, 32), goldTrim);
    goldEntBand.rotation.x = Math.PI / 2;
    goldEntBand.position.y = 2.8 + 9.6;
    pavGroup.add(goldEntBand);

    // Ultra-Pure Optical Crystalline Dome
    const domeMesh = new THREE.Mesh(new THREE.SphereGeometry(10.4, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.5), crystalDomeMat);
    domeMesh.position.y = 2.8 + 9.2;
    pavGroup.add(domeMesh);

    // 8 Gilded Meridian Tracery Ribs across the Crystal Dome
    for (let r = 0; r < 8; r++) {
      const ribAng = (r / 8) * Math.PI;
      const rib = new THREE.Mesh(new THREE.TorusGeometry(10.45, 0.18, 8, 24, Math.PI), goldTrim);
      rib.rotation.y = ribAng;
      rib.position.y = 2.8 + 9.2;
      pavGroup.add(rib);
    }

    // 24K Polished Golden Starburst Crest Finial crowning the Dome Apex
    const domeApexStarburst = new THREE.Mesh(new THREE.OctahedronGeometry(1.8, 0), goldTrim);
    domeApexStarburst.position.y = 2.8 + 20.2;
    pavGroup.add(domeApexStarburst);

    for (let ray = 0; ray < 8; ray++) {
      const ang = (ray / 8) * Math.PI * 2;
      const raySpike = new THREE.Mesh(new THREE.ConeGeometry(0.35, 3.2, 4), goldTrim);
      raySpike.rotation.z = -ang + Math.PI / 2;
      raySpike.position.set(Math.cos(ang) * 2.2, 2.8 + 20.2 + Math.sin(ang) * 0.4, Math.sin(ang) * 2.2);
      pavGroup.add(raySpike);
    }

    // Sculpted Guardian Siberian Husky KAYA Monument on Inscribed Gold Pedestal
    const huskyPlinth = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.2, 1.8, 24), goldTrim);
    huskyPlinth.position.y = 3.7;
    huskyPlinth.castShadow = true;
    pavGroup.add(huskyPlinth);

    const huskyKaya = this._buildHuskyMesh();
    huskyKaya.scale.setScalar(1.65);
    huskyKaya.position.set(0, 4.6, 0);
    huskyKaya.rotation.y = Math.PI * 0.92; // Proud direct angle toward the bridge and rainbow
    pavGroup.add(huskyKaya);

    // Floral Lei Flower Tributes at the base of Kaya's plinth
    const leiColors = [0xff4081, 0xffd54f, 0xffffff, 0xff7043, 0xba68c8];
    for (let fl = 0; fl < 24; fl++) {
      const flAng = (fl / 24) * Math.PI * 2;
      const flRad = 3.2 + (fl % 3) * 0.35;
      const flMat = new THREE.MeshPhysicalMaterial({
        color: leiColors[fl % leiColors.length],
        roughness: 0.6,
        metalness: 0.05,
      });
      const flGeo = new THREE.SphereGeometry(0.30, 8, 6);
      flGeo.scale(1.0, 0.4, 1.0);
      const flower = new THREE.Mesh(flGeo, flMat);
      flower.position.set(Math.cos(flAng) * flRad, 4.62, Math.sin(flAng) * flRad);
      pavGroup.add(flower);
    }

    // Ultra-Pure Optical Physical Crystal Sphere enclosing Kaya's Starlight Heart
    const crystalOrb = new THREE.Mesh(new THREE.SphereGeometry(3.4, 32, 28), crystalDomeMat);
    crystalOrb.position.set(0, 7.2, 0);
    pavGroup.add(crystalOrb);

    // Rotating Celestial Constellation Stardust Ring around the Crystal Orb
    const stardustCount = 48;
    const stardustGeo = new THREE.BufferGeometry();
    const stardustPos = new Float32Array(stardustCount * 3);
    for (let st = 0; st < stardustCount; st++) {
      const sAng = (st / stardustCount) * Math.PI * 2;
      const sRad = 4.2 + Math.sin(st * 3.7) * 0.5;
      stardustPos[st * 3] = Math.cos(sAng) * sRad;
      stardustPos[st * 3 + 1] = 7.2 + Math.sin(sAng * 2.0) * 0.8;
      stardustPos[st * 3 + 2] = Math.sin(sAng) * sRad;
    }
    stardustGeo.setAttribute('position', new THREE.BufferAttribute(stardustPos, 3));
    const stardustMat = new THREE.PointsMaterial({
      color: 0x67e8f9,
      size: 0.45,
      transparent: true, logarithmicDepthBuffer: true, opacity: 0.90,
      blending: THREE.AdditiveBlending,
    });
    const stardustPoints = new THREE.Points(stardustGeo, stardustMat);
    pavGroup.add(stardustPoints);
    this._kayaStardust = stardustPoints;

    // Radiant Celestial Beacon Light Core
    const beaconLight = new THREE.PointLight(0x78dcfa, 3.8, 140);
    beaconLight.position.set(0, 7.5, 0);
    pavGroup.add(beaconLight);

    g.add(pavGroup);

    // 6. Primary Ethereal Atmospheric Rainbow Arc (Physical spectral wavelength Red 650nm -> Violet 400nm)
    const arcGroup = new THREE.Group();
    arcGroup.position.set(bx, 2, bz);
    for (let offset = -24; offset <= 24; offset += 4) {
      const arc = this._makeRainbowArc(95, 145, 0.16 * (1.0 - Math.abs(offset)/30.0), false);
      arc.position.z = offset;
      arcGroup.add(arc);
      this._rainbowShaders.push(arc.material);
    }
    g.add(arcGroup);

    // Secondary Outer Rainbow Arc (physics-accurate Alexander's Dark Band with inverted spectrum)
    const arc2Group = new THREE.Group();
    arc2Group.position.set(bx, 2, bz - 6);
    for (let offset = -16; offset <= 16; offset += 4) {
      const arc2 = this._makeRainbowArc(150, 180, 0.055 * (1.0 - Math.abs(offset)/20.0), true);
      arc2.position.z = offset;
      arc2Group.add(arc2);
      this._rainbowShaders.push(arc2.material);
    }
    g.add(arc2Group);

    // Atmospheric Sunburst Halo
    const glow = this._makeRainbowArc(85, 155, 0.035, false);
    glow.position.set(bx, 2, bz - 0.5);
    g.add(glow);
    this._rainbowShaders.push(glow.material);

    // Swirling Stardust Particles along the Bridge Arch
    const STAR_COUNT = 240;
    const sPos = new Float32Array(STAR_COUNT * 3);
    const sCol = new Float32Array(STAR_COUNT * 3);
    const sSiz = new Float32Array(STAR_COUNT);
    const sRng = mulberry32(882244);
    const sColor = new THREE.Color();
    for (let i = 0; i < STAR_COUNT; i++) {
      const u = sRng();
      const ang = u * Math.PI;
      const radius = 104 + sRng() * 28;
      sPos[i * 3] = bx + Math.cos(ang) * radius;
      sPos[i * 3 + 1] = 2 + Math.sin(ang) * radius;
      sPos[i * 3 + 2] = bz + (sRng() - 0.5) * 14;
      sColor.setHSL(0.12 + sRng() * 0.12, 0.9, 0.8 + sRng() * 0.2);
      sCol[i * 3] = sColor.r; sCol[i * 3 + 1] = sColor.g; sCol[i * 3 + 2] = sColor.b;
      sSiz[i] = (0.40 + sRng() * 0.60) * 18;
    }
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    sGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
    sGeo.setAttribute('size', new THREE.BufferAttribute(sSiz, 1));
    const sMat = new THREE.ShaderMaterial({
      transparent: true, logarithmicDepthBuffer: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      uniforms: { uTex: { value: this.world.lighting._starSprite() }, uTime: { value: 0 }, uOpacity: { value: 0.85 } },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        #include <fog_pars_vertex>
        attribute float size; varying vec3 vColor; varying float vAlpha; uniform float uTime;
        void main(){
          vColor = color;
          vec3 p = position;
          p.y += sin(uTime * 1.4 + position.x * 0.05 + position.z * 0.03) * 1.5;
          vAlpha = 0.5 + 0.5 * sin(uTime * 2.5 + position.x * 0.08);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = min(68.0, size * (125.0 / -mv.z));
          gl_Position = projectionMatrix * mv;
                  #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        #include <fog_pars_fragment>
        uniform sampler2D uTex; uniform float uOpacity; varying vec3 vColor; varying float vAlpha;
        void main(){
          vec4 t = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(vColor * 1.25, t.a * uOpacity * vAlpha);
                  #include <logdepthbuf_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
      vertexColors: true,
    });
    this._stardustMat = sMat;
    g.add(new THREE.Points(sGeo, sMat));

    // Ethereal Floating Particle Motes along the Bridge Balustrades and Lanterns
    const MOTE_COUNT = 140;
    const mPos = new Float32Array(MOTE_COUNT * 3);
    const mCol = new Float32Array(MOTE_COUNT * 3);
    const mPhase = new Float32Array(MOTE_COUNT);
    const mSpeed = new Float32Array(MOTE_COUNT);
    const mRng = mulberry32(551177);
    const mColor = new THREE.Color();

    for (let i = 0; i < MOTE_COUNT; i++) {
      const side = mRng() < 0.5 ? -1 : 1;
      const zOffset = (mRng() - 0.5) * 104; // along bridge span
      const mz = bz + zOffset;
      const my = (this.world._deckY(mz) || 2) + 3.0 + mRng() * 3.5;
      const mx = bx + side * (14.5 + mRng() * 2.5);

      mPos[i * 3]     = mx;
      mPos[i * 3 + 1] = my;
      mPos[i * 3 + 2] = mz;

      mColor.setHSL(0.11 + mRng() * 0.14, 0.85, 0.75 + mRng() * 0.20);
      mCol[i * 3]     = mColor.r;
      mCol[i * 3 + 1] = mColor.g;
      mCol[i * 3 + 2] = mColor.b;

      mPhase[i] = mRng() * Math.PI * 2;
      mSpeed[i] = 0.8 + mRng() * 1.4;
    }

    const mGeo = new THREE.BufferGeometry();
    mGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
    mGeo.setAttribute('color', new THREE.BufferAttribute(mCol, 3));
    mGeo.setAttribute('aPhase', new THREE.BufferAttribute(mPhase, 1));
    mGeo.setAttribute('aSpeed', new THREE.BufferAttribute(mSpeed, 1));

    const balustradeMoteMat = new THREE.ShaderMaterial({
      transparent: true, logarithmicDepthBuffer: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      uniforms: { uTex: { value: this.world.lighting._starSprite() }, uTime: { value: 0 }, uOpacity: { value: 0.90 } },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        #include <fog_pars_vertex>
        attribute float aPhase;
        attribute float aSpeed;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uTime;

        void main() {
          vColor = color;
          vec3 p = position;
          p.y += sin(uTime * aSpeed + aPhase) * 0.65;
          p.x += cos(uTime * (aSpeed * 0.7) + aPhase) * 0.45;
          p.z += sin(uTime * (aSpeed * 0.5) + aPhase * 1.5) * 0.45;
          
          vAlpha = 0.45 + 0.55 * sin(uTime * (aSpeed * 1.8) + aPhase);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = min(48.0, 85.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
                  #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        #include <fog_pars_fragment>
        uniform sampler2D uTex;
        uniform float uOpacity;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 t = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(vColor * 1.4, t.a * uOpacity * vAlpha);
                  #include <logdepthbuf_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
      vertexColors: true,
    });
    this._balustradeMoteMat = balustradeMoteMat;
    g.add(new THREE.Points(mGeo, balustradeMoteMat));

    this.world.scene.add(g);
  }

  _rainbow() {
    return this._rainbowBridge();
  }

  _makeRainbowArc(r0, r1, baseOpacity, isSecondary = false) {
    const geo = new THREE.RingGeometry(r0, r1, 160, 12, 0, Math.PI);
    const mat = new THREE.ShaderMaterial({
      transparent: true, logarithmicDepthBuffer: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, fog: false,
      uniforms: {
        uOpacity: { value: baseOpacity },
        uTime: { value: 0 },
        uR0: { value: r0 },
        uR1: { value: r1 },
        uIsSecondary: { value: isSecondary ? 1.0 : 0.0 },
      },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        #include <fog_pars_vertex>
        varying vec3 vP;
        void main(){
          vP = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                  #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        #include <fog_pars_fragment>
        varying vec3 vP;
        uniform float uOpacity, uTime, uR0, uR1, uIsSecondary;

        // Physically accurate optical spectral wavelength dispersion (400nm to 650nm)
        vec3 wavelengthToRGB(float nm) {
          float r = 0.0, g = 0.0, b = 0.0;
          if (nm >= 380.0 && nm < 440.0) {
            r = -(nm - 440.0) / (440.0 - 380.0) * 0.65;
            b = 1.0;
          } else if (nm >= 440.0 && nm < 490.0) {
            g = (nm - 440.0) / (490.0 - 440.0);
            b = 1.0;
          } else if (nm >= 490.0 && nm < 510.0) {
            g = 1.0;
            b = -(nm - 510.0) / (510.0 - 490.0);
          } else if (nm >= 510.0 && nm < 580.0) {
            r = (nm - 510.0) / (580.0 - 510.0);
            g = 1.0;
          } else if (nm >= 580.0 && nm < 645.0) {
            r = 1.0;
            g = -(nm - 645.0) / (645.0 - 580.0);
          } else if (nm >= 645.0 && nm <= 700.0) {
            r = 1.0;
          }
          // Perceptual spectral intensity falloff near human visual boundaries
          float factor = 1.0;
          if (nm < 420.0) factor = 0.35 + 0.65 * (nm - 380.0) / (420.0 - 380.0);
          if (nm > 645.0) factor = 0.35 + 0.65 * (700.0 - nm) / (700.0 - 645.0);
          
          return vec3(r, g, b) * factor;
        }

        vec3 spectralColor(float t) {
          // Invert order for secondary bow (Alexander's dark band physics: Violet outer, Red inner)
          if (uIsSecondary > 0.5) t = 1.0 - t;
          float lambda = 405.0 + clamp(t, 0.0, 1.0) * 245.0; // 405nm (Violet) -> 650nm (Red)
          return wavelengthToRGB(lambda);
        }

        void main(){
          float r = length(vP.xy);
          float t = clamp((r - uR0) / (uR1 - uR0), 0.0, 1.0);

          vec3 col = spectralColor(t);

          // Gaussian envelope across the optical arc band
          float band = sin(t * 3.14159265);
          float edge = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.88, 1.0, t));

          // Supernumerary optical wave interference fringes along the inner violet arc (Airy diffraction pattern)
          float supernumerary = 0.0;
          vec3 fringeColor = vec3(0.0);
          if (uIsSecondary < 0.5) {
            float fringePhase = (1.0 - t) * 36.0;
            float fringeWave = sin(fringePhase) * 0.5 + 0.5;
            float fringeDamp = smoothstep(0.35, 0.02, t);
            supernumerary = fringeWave * fringeDamp * 0.26;
            // Alternating delicate magenta-pink and emerald green diffraction fringes
            fringeColor = mix(vec3(0.82, 0.30, 0.72), vec3(0.20, 0.90, 0.52), sin(fringePhase * 0.5) * 0.5 + 0.5) * supernumerary;
          }

          // Gentle celestial breathing shimmer
          float shimmer = 0.92 + 0.08 * sin(uTime * 0.85 + vP.x * 0.015 + t * 4.0);

          // Soft ground dissolve as the arc melts gracefully into the riverbanks
          float foot = smoothstep(-6.0, 32.0, vP.y);

          vec3 finalRgb = (col + fringeColor) * (1.12 + supernumerary * 0.5);
          float alpha = uOpacity * (band + supernumerary * 0.7) * edge * shimmer * foot;
          gl_FragColor = vec4(finalRgb, alpha);
                  #include <logdepthbuf_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
    });
    return new THREE.Mesh(geo, mat);
  }

  _pawprints() {
    const tex = this.world.assetLoader._pawTexture();
    this.pawMat = new THREE.MeshPhysicalMaterial({
      color: 0x221c14,
      alphaMap: tex,
      transparent: true, logarithmicDepthBuffer: true, opacity: 0.28,
      roughness: 0.98,
      metalness: 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const geo = new THREE.PlaneGeometry(4.2, 4.2);
    const path = [];
    for (let z = 850; z > 60; z -= 17) path.push(z);
    const mesh = new THREE.InstancedMesh(geo, this.pawMat, path.length);
    const tmp = new THREE.Object3D();
    path.forEach((z, i) => {
      const x = (i % 2 ? 4.5 : -4.5) + Math.sin(z * 0.02) * 2;
      const deck = this.world._deckY(z);
      const y = deck !== null ? deck + 1.3 : Math.max(terrainHeight(x, z), WORLD.waterLevel + 0.4) + 0.5;
      tmp.position.set(x, y, z);
      tmp.rotation.set(-Math.PI / 2, 0, Math.PI + (i % 2 ? -0.12 : 0.12));
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (typeof mesh.computeBoundingSphere === 'function') mesh.computeBoundingSphere();
    if (typeof mesh.computeBoundingBox === 'function') mesh.computeBoundingBox();
    mesh.frustumCulled = false;
    this.world.scene.add(mesh); console.log("[world3d] mesh added to scene", performance.now());
  }

  _blooms() {
    const rng = mulberry32(104928);
    const tmp = new THREE.Object3D();

    const poppyPositions = [];
    const edelweissPositions = [];
    const lavenderPositions = [];
    const forgetMeNotPositions = [];

    // Dense scenic wildflower patches along Boulevard flanks, lake shorelines, and memorial viewpoints
    const gladeCenters = [
      { x: -35, z: 820, rad: 34, count: 850 },  // Grand Gate South Promenade West
      { x: 35,  z: 820, rad: 34, count: 850 },  // Grand Gate South Promenade East
      { x: -32, z: 640, rad: 38, count: 900 },  // Mid Boulevard Garden Flank West
      { x: 32,  z: 640, rad: 38, count: 900 },  // Mid Boulevard Garden Flank East
      { x: -28, z: 490, rad: 32, count: 750 },  // Rainbow Bridge South Approach Glade
      { x: 28,  z: 490, rad: 32, count: 750 },  // Rainbow Bridge South Approach Glade
      { x: -30, z: 360, rad: 35, count: 800 },  // Rainbow Bridge North Promenade
      { x: 30,  z: 360, rad: 35, count: 800 },  // Rainbow Bridge North Promenade
      { x: -85, z: 120, rad: 45, count: 1100 }, // Central Plaza Southwest Meadow Glade
      { x: 85,  z: 120, rad: 45, count: 1100 }, // Central Plaza Southeast Meadow Glade
      { x: 180, z: -140, rad: 50, count: 1200 },// Mirror Lake Western Iris Shoreline
      { x: -240, z: 320, rad: 55, count: 1300 },// Memorial Meadows Wildflower Carpet
      { x: 160,  z: 380, rad: 50, count: 1100 },// Memorial Meadows East Blossom Field
      { x: -380, z: -120, rad: 45, count: 950 },// Whispering Pines Forest Verge
      { x: -440, z: -380, rad: 45, count: 850 },// Summit Ascent Alpine Rockery
    ];

    for (const glade of gladeCenters) {
      for (let i = 0; i < glade.count; i++) {
        const angle = rng() * Math.PI * 2;
        const dist = Math.sqrt(rng()) * glade.rad;
        const x = glade.x + Math.cos(angle) * dist;
        const z = glade.z + Math.sin(angle) * dist;
        const h = terrainHeight(x, z);

        if (h < 13.2 || h > 165) continue;
        if (distToRoads(x, z) < 2.0) continue;
        if (Math.hypot(x - WORLD.plaza.x, z - WORLD.plaza.z) < WORLD.plaza.r + 4) continue;
        
        // Exclude river and lake beds strictly
        const { dist: dRiver, y: rWaterY } = getRiverInfo(x, z);
        if (dRiver < 42.0 && h < rWaterY + 1.2) continue;
        if (h < 13.5 && x > 50 && z < 0) continue; // Mirror Lake region bounds
        
        // Density falloff
        if (rng() > 0.6) continue;

        const s = 0.35 + rng() * 0.25;
        tmp.position.set(x, h, z);
        tmp.rotation.set(0, rng() * Math.PI * 2, 0);
        tmp.scale.setScalar(s);
        tmp.updateMatrix();

        const speciesRoll = rng();
        if (speciesRoll < 0.28) {
          poppyPositions.push(tmp.matrix.clone());
        } else if (speciesRoll < 0.54) {
          edelweissPositions.push(tmp.matrix.clone());
        } else if (speciesRoll < 0.78) {
          lavenderPositions.push(tmp.matrix.clone());
        } else {
          forgetMeNotPositions.push(tmp.matrix.clone());
        }
      }
    }

    const instFlowers = (geo, mat, mats) => {
      if (!mats.length) return;
      if (geo.computeBoundingSphere) geo.computeBoundingSphere();
      const m = new THREE.InstancedMesh(geo, mat, mats.length);
      mats.forEach((mx, i) => m.setMatrixAt(i, mx));
      m.instanceMatrix.needsUpdate = true;
      if (typeof m.computeBoundingSphere === 'function') m.computeBoundingSphere();
      if (typeof m.computeBoundingBox === 'function') m.computeBoundingBox();
      m.castShadow = false;
      m.receiveShadow = false;
      m.frustumCulled = false;
      this.world.scene.add(m);
    };

    // 3-quad curved cross cluster geometry for flowers
    const flowerGeo = (() => {
      const parts = [];
      for (let b = 0; b < 3; b++) {
        const a = (b / 3) * Math.PI;
        const q = new THREE.PlaneGeometry(1.20, 1.30);
        q.translate(0, 0.65, 0);
        q.rotateY(a);
        parts.push(q);
      }
      return safeMerge(parts, false) || parts[0];
    })();

    // Tall lavender spike geometry
    const lavenderGeo = (() => {
      const parts = [];
      for (let b = 0; b < 3; b++) {
        const a = (b / 3) * Math.PI;
        const q = new THREE.PlaneGeometry(0.95, 1.55);
        q.translate(0, 0.775, 0);
        q.rotateY(a);
        parts.push(q);
      }
      return safeMerge(parts, false) || parts[0];
    })();

    const poppyMat = Surfaces.goldenPoppy();
    poppyMat.alphaTest = 0.5; poppyMat.depthWrite = true; poppyMat.transparent = false;

    const edelweissMat = Surfaces.edelweiss();
    edelweissMat.alphaTest = 0.5; edelweissMat.depthWrite = true; edelweissMat.transparent = false;

    const lavenderMat = Surfaces.lavenderSprig();
    lavenderMat.alphaTest = 0.5; lavenderMat.depthWrite = true; lavenderMat.transparent = false;

    const forgetMeNotMat = Surfaces.forgetMeNot();
    forgetMeNotMat.alphaTest = 0.5; forgetMeNotMat.depthWrite = true; forgetMeNotMat.transparent = false;

    if (this.world._windMaterials) {
      this.world._windMaterials.push(poppyMat, edelweissMat, lavenderMat, forgetMeNotMat);
    }

    instFlowers(flowerGeo, poppyMat, poppyPositions);
    instFlowers(flowerGeo, edelweissMat, edelweissPositions);
    instFlowers(lavenderGeo, lavenderMat, lavenderPositions);
    instFlowers(flowerGeo, forgetMeNotMat, forgetMeNotPositions);
  }

  _buildVines(g, radiusX, radiusZ, height, count, mat) {
    if (!mat) mat = Surfaces.leafCard(0x355a20);
    const parts = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      // random depth for ivy clustering
      const depth = (Math.random() - 0.5) * 3;
      const rx = radiusX + depth;
      const rz = radiusZ + depth;
      const y = Math.random() * height * (0.2 + 0.8 * Math.random());
      const geo = new THREE.PlaneGeometry(2.5, 2.5);
      // stick to walls
      let px = Math.cos(a) * rx;
      let pz = Math.sin(a) * rz;
      // square off for buildings instead of pure circle
      if (Math.abs(Math.cos(a)) > Math.abs(Math.sin(a))) {
         px = Math.sign(Math.cos(a)) * rx;
         pz = Math.sin(a) * rz;
      } else {
         px = Math.cos(a) * rx;
         pz = Math.sign(Math.sin(a)) * rz;
      }
      geo.translate(px, y, pz);
      geo.rotateX((Math.random() - 0.5) * 0.4);
      geo.rotateY(a + Math.PI/2 + (Math.random() - 0.5) * 0.4);
      geo.rotateZ((Math.random() - 0.5) * 0.4);
      parts.push(geo);
    }
    const merged = safeMerge(parts, false) || parts[0];
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    g.add(mesh);
  }

  _buildHuskyMesh() {
    const husky = new THREE.Group();
    const wolfGrey = new THREE.MeshPhysicalMaterial({
      color: 0x383e48,
      roughness: 0.88,
      metalness: 0.02,
    });
    const slateDark = new THREE.MeshPhysicalMaterial({
      color: 0x242830,
      roughness: 0.85,
      metalness: 0.02,
    });
    const snowWhite = new THREE.MeshPhysicalMaterial({
      color: 0xfcfdfd,
      roughness: 0.80,
      metalness: 0.01,
    });
    const iceEyes = new THREE.MeshPhysicalMaterial({
      color: 0x4ac5f0,
      roughness: 0.10,
      metalness: 0.15,
      emissive: 0x30a8e0,
      emissiveIntensity: 0.95,
    });
    const darkPupil = new THREE.MeshBasicMaterial({ color: 0x050608 });
    const blackNose = new THREE.MeshPhysicalMaterial({
      color: 0x121416,
      roughness: 0.35,
      metalness: 0.05,
    });
    const pinkTongue = new THREE.MeshPhysicalMaterial({
      color: 0xe07888,
      roughness: 0.50,
      metalness: 0.02,
    });
    const pinkEar = new THREE.MeshPhysicalMaterial({
      color: 0xe8b4bc,
      roughness: 0.90,
    });
    const goldCollar = Surfaces.gold(1.0);

    // 1. Athletic Muscular Canine Body
    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, 1.38, 0);

    // Dark slate wolf-grey dorsal mantle saddle
    const ribcageGeo = new THREE.CylinderGeometry(0.58, 0.74, 1.95, 16);
    ribcageGeo.rotateX(Math.PI / 2);
    ribcageGeo.scale(0.88, 1.15, 1.0);
    const ribcage = new THREE.Mesh(ribcageGeo, wolfGrey);
    ribcage.castShadow = true;
    torsoGroup.add(ribcage);

    // Tucked Athletic Flank / Loin
    const flankGeo = new THREE.CylinderGeometry(0.48, 0.62, 0.95, 14);
    flankGeo.rotateX(Math.PI / 2);
    flankGeo.scale(0.82, 0.95, 1.0);
    const flank = new THREE.Mesh(flankGeo, wolfGrey);
    flank.position.set(0, 0.08, -0.92);
    flank.castShadow = true;
    torsoGroup.add(flank);

    // Pristine Snow-White Deep Chest & Underbelly Bib
    const chestGeo = new THREE.SphereGeometry(0.66, 16, 14);
    chestGeo.scale(0.84, 1.18, 1.25);
    const chest = new THREE.Mesh(chestGeo, snowWhite);
    chest.position.set(0, -0.06, 0.55);
    chest.receiveShadow = true;
    torsoGroup.add(chest);

    const bellyBib = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.54, 1.6, 12), snowWhite);
    bellyBib.rotateX(Math.PI / 2);
    bellyBib.scale.set(0.80, 0.65, 1.0);
    bellyBib.position.set(0, -0.32, -0.15);
    torsoGroup.add(bellyBib);

    husky.add(torsoGroup);

    // 2. Powerful Neck with Thick Winter Fur Ruff
    const neckGroup = new THREE.Group();
    neckGroup.position.set(0, 1.95, 0.75);

    const neckGeo = new THREE.CylinderGeometry(0.36, 0.54, 0.95, 14);
    neckGeo.rotateX(Math.PI / 4.2);
    neckGeo.scale(0.88, 1.05, 1.0);
    const neck = new THREE.Mesh(neckGeo, wolfGrey);
    neck.castShadow = true;
    neckGroup.add(neck);

    // White Throat & Mane Ruff
    const ruffGeo = new THREE.SphereGeometry(0.48, 14, 12);
    ruffGeo.scale(0.82, 1.15, 1.25);
    const ruff = new THREE.Mesh(ruffGeo, snowWhite);
    ruff.position.set(0, -0.12, 0.32);
    neckGroup.add(ruff);

    husky.add(neckGroup);

    // 3. Expressive Siberian Husky Head & Face
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 2.50, 1.28);

    // Cranium / Skull
    const skullGeo = new THREE.SphereGeometry(0.46, 16, 14);
    skullGeo.scale(0.92, 0.98, 1.08);
    const skull = new THREE.Mesh(skullGeo, wolfGrey);
    headGroup.add(skull);

    // Dark mask cap across forehead
    const capGeo = new THREE.SphereGeometry(0.44, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    capGeo.scale(0.94, 0.96, 1.04);
    capGeo.translate(0, 0.04, 0.02);
    const browCap = new THREE.Mesh(capGeo, slateDark);
    headGroup.add(browCap);

    // Distinctive White Facial Blaze & Spectacle Eye Mask
    const maskWhite = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), snowWhite);
    maskWhite.position.set(0, -0.06, 0.16);
    maskWhite.scale.set(0.88, 0.82, 0.98);
    headGroup.add(maskWhite);

    // White Cheek Fluffs
    [-0.28, 0.28].forEach(cx => {
      const cheek = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.45, 6), snowWhite);
      cheek.rotation.z = (cx > 0 ? -1 : 1) * 0.75;
      cheek.rotation.x = -0.2;
      cheek.position.set(cx, -0.10, 0.18);
      headGroup.add(cheek);
    });

    // Muzzle / Snout (Breed standard: medium length, tapering gradually to black leather nose)
    const snoutGeo = new THREE.CylinderGeometry(0.16, 0.26, 0.56, 12);
    snoutGeo.rotateX(Math.PI / 2);
    snoutGeo.scale(0.92, 0.85, 1.0);
    const snout = new THREE.Mesh(snoutGeo, snowWhite);
    snout.position.set(0, -0.10, 0.54);
    headGroup.add(snout);

    // Dark Muzzle Bridge Band
    const bridgeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.48), slateDark);
    bridgeMesh.position.set(0, 0.04, 0.54);
    headGroup.add(bridgeMesh);

    // Black Leathery Truffle Nose with Nostrils
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.082, 10, 8), blackNose);
    nose.scale.set(1.15, 0.85, 1.0);
    nose.position.set(0, -0.04, 0.84);
    headGroup.add(nose);

    // Gently Open Lower Jaw with Soft Pink Tongue
    const lowerJaw = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.38), snowWhite);
    lowerJaw.position.set(0, -0.21, 0.56);
    lowerJaw.rotation.x = 0.08;
    headGroup.add(lowerJaw);

    const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.26), pinkTongue);
    tongue.position.set(0, -0.18, 0.65);
    tongue.rotation.x = 0.14;
    headGroup.add(tongue);

    // Pierce-Blue Almond Husky Eyes with Dark Eyeliner Contours
    [-0.17, 0.17].forEach(ex => {
      const eyeLid = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.016, 6, 12, Math.PI * 1.2), blackNose);
      eyeLid.rotation.z = (ex > 0 ? -1 : 1) * 0.35 + Math.PI * 0.9;
      eyeLid.position.set(ex, 0.11, 0.41);
      headGroup.add(eyeLid);

      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 10), iceEyes);
      eye.scale.set(0.85, 1.15, 0.85);
      eye.position.set(ex, 0.10, 0.41);
      headGroup.add(eye);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), darkPupil);
      pupil.position.set(ex, 0.10, 0.46);
      headGroup.add(pupil);
    });

    // Triangular Erect Pointed Ears (Pricked alert forward posture)
    [-0.25, 0.25].forEach(ex => {
      const earGroup = new THREE.Group();
      earGroup.position.set(ex, 0.40, -0.04);
      earGroup.rotation.z = (ex > 0 ? -1 : 1) * 0.16;
      earGroup.rotation.x = -0.12;

      const earBack = new THREE.Mesh(new THREE.ConeGeometry(0.20, 0.52, 4), slateDark);
      earBack.scale.set(0.85, 1.0, 0.42);
      earGroup.add(earBack);

      const earInner = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.42, 4), pinkEar);
      earInner.scale.set(0.75, 0.9, 0.32);
      earInner.position.set(0, -0.02, 0.035);
      earGroup.add(earInner);

      // White inner ear fur tufts
      const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), snowWhite);
      tuft.scale.set(0.6, 1.2, 0.4);
      tuft.position.set(0, -0.10, 0.06);
      earGroup.add(tuft);

      headGroup.add(earGroup);
    });

    husky.add(headGroup);

    // 4. 24K Celestial Gold Ceremonial Collar & Star Tag inscribed "KAYA"
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.055, 8, 20), goldCollar);
    collar.rotation.x = Math.PI / 3.4;
    collar.position.set(0, 1.82, 0.92);
    husky.add(collar);

    const tagGroup = new THREE.Group();
    tagGroup.position.set(0, 1.55, 1.18);
    const starTag = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), Surfaces.gold(1.0));
    starTag.scale.set(1.0, 1.2, 0.35);
    tagGroup.add(starTag);
    husky.add(tagGroup);

    // 5. Four Athletic Muscular Legs with Distinct Paws & Pads
    const legPositions = [
      { x: -0.30, z: 0.72, isFront: true },
      { x: 0.30, z: 0.72, isFront: true },
      { x: -0.32, z: -0.74, isFront: false },
      { x: 0.32, z: -0.74, isFront: false },
    ];
    legPositions.forEach(lp => {
      const legGroup = new THREE.Group();
      legGroup.position.set(lp.x, 0, lp.z);

      if (lp.isFront) {
        // Muscular Shoulder & Upper Foreleg
        const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), wolfGrey);
        shoulder.scale.set(0.85, 1.2, 1.0);
        shoulder.position.set(0, 1.15, 0);
        legGroup.add(shoulder);

        const foreleg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.65, 8), snowWhite);
        foreleg.position.set(0, 0.68, 0.02);
        legGroup.add(foreleg);

        const pastern = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.095, 0.35, 8), snowWhite);
        pastern.position.set(0, 0.28, 0.04);
        pastern.rotation.x = 0.12;
        legGroup.add(pastern);
      } else {
        // Broad Muscular Thigh / Haunch
        const thigh = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), wolfGrey);
        thigh.scale.set(0.85, 1.35, 1.15);
        thigh.position.set(0, 1.12, -0.05);
        legGroup.add(thigh);

        // Angulated Hock
        const hock = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.65, 8), snowWhite);
        hock.position.set(0, 0.65, -0.08);
        hock.rotation.x = -0.22;
        legGroup.add(hock);

        const rearPastern = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.095, 0.38, 8), snowWhite);
        rearPastern.position.set(0, 0.26, 0.02);
        legGroup.add(rearPastern);
      }

      // Digitigrade Paw with Four Toes & Dark Claws
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), snowWhite);
      paw.scale.set(0.92, 0.55, 1.28);
      paw.position.set(0, 0.09, 0.10);
      paw.castShadow = true;
      legGroup.add(paw);

      husky.add(legGroup);
    });

    // 6. Glorious Siberian Husky Sickle Plume Tail (Carried in proud arch over the back with white brush tip)
    const tailGroup = new THREE.Group();
    tailGroup.position.set(0, 1.56, -1.02);
    const tailSegs = 9;
    for (let s = 0; s < tailSegs; s++) {
      const frac = s / (tailSegs - 1);
      const ang = frac * Math.PI * 0.98;
      const ty = Math.sin(ang) * 1.08;
      const tz = -Math.cos(ang) * 0.74;
      const segSize = 0.28 * (1.0 - frac * 0.35) + 0.08;
      const seg = new THREE.Mesh(
        new THREE.SphereGeometry(segSize, 10, 8),
        frac > 0.55 ? snowWhite : wolfGrey
      );
      seg.scale.set(0.82, 1.15, 1.15);
      seg.position.set(0, ty, tz);
      tailGroup.add(seg);
    }
    husky.add(tailGroup);

    return husky;
  }

  _buildKoiMesh() {
    const parts = [];

    // Helper to assign vertex colors
    const addColors = (geom, r, g, b) => {
      const count = geom.attributes.position.count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
      }
      geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return geom;
    };

    // 1. STREAMLINED TORPEDO BODY (Smooth Spline-Lofted Parametric Shell)
    const nz = 36;
    const nTheta = 24;
    const bodyPos = [];
    const bodyUv = [];
    const bodyIndex = [];

    for (let i = 0; i <= nz; i++) {
      const tz = i / nz;
      // z ranges from +1.15 (snout) to -1.25 (caudal peduncle)
      const z = 1.15 - 2.40 * tz;
      
      let rx, ry, yc;
      if (tz < 0.22) {
        // Snout & Cranium (bullet-tapered)
        const s = tz / 0.22;
        rx = 0.27 * Math.pow(Math.sin(s * Math.PI * 0.5), 0.62);
        ry = 0.31 * Math.pow(Math.sin(s * Math.PI * 0.5), 0.72);
        yc = -0.035 * (1.0 - s);
      } else if (tz < 0.52) {
        // Girth / Deep chest / Keel
        const s = (tz - 0.22) / 0.30;
        const bulge = Math.sin(s * Math.PI);
        rx = 0.27 + 0.11 * bulge;
        ry = 0.31 + 0.14 * bulge;
        yc = -0.035 * (1.0 - s * 0.5) - 0.03 * bulge;
      } else {
        // Caudal Taper
        const s = (tz - 0.52) / 0.48;
        const sCurve = Math.pow(s, 0.9);
        rx = (1 - sCurve) * 0.27 + sCurve * 0.045;
        ry = (1 - sCurve) * 0.31 + sCurve * 0.085;
        yc = (1 - s) * (-0.017) + s * 0.0;
      }

      for (let j = 0; j <= nTheta; j++) {
        const theta = (j / nTheta) * Math.PI * 2;
        const sinT = Math.sin(theta);
        const cosT = Math.cos(theta);

        // Hydrodynamic oval cross section: slightly deeper belly and sculpted dorsal ridge
        const x = rx * sinT;
        const y = yc + ry * (cosT - 0.06 * sinT * sinT);

        bodyPos.push(x, y, z);
        bodyUv.push(j / nTheta, tz);
      }
    }

    for (let i = 0; i < nz; i++) {
      for (let j = 0; j < nTheta; j++) {
        const a = i * (nTheta + 1) + j;
        const b = (i + 1) * (nTheta + 1) + j;
        const c = (i + 1) * (nTheta + 1) + (j + 1);
        const d = i * (nTheta + 1) + (j + 1);
        bodyIndex.push(a, b, d);
        bodyIndex.push(b, c, d);
      }
    }

    const bodyGeo = new THREE.BufferGeometry();
    bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(bodyPos, 3));
    bodyGeo.setAttribute('uv', new THREE.Float32BufferAttribute(bodyUv, 2));
    bodyGeo.setIndex(bodyIndex);
    bodyGeo.computeVertexNormals();
    addColors(bodyGeo, 1.0, 1.0, 1.0);
    parts.push(bodyGeo);

    // 2. FORKED / BIFURCATED CAUDAL FIN (Tail)
    const tailSegmentsU = 16;
    const tailSegmentsV = 12;
    const tailPos = [];
    const tailUv = [];
    const tailIndex = [];

    for (let i = 0; i <= tailSegmentsU; i++) {
      const u = i / tailSegmentsU; // 0 at peduncle (-1.22), 1 at fin tips
      for (let j = 0; j <= tailSegmentsV; j++) {
        const v = (j / tailSegmentsV) * 2.0 - 1.0; // -1 (ventral tip) to +1 (dorsal tip)
        
        // Forked cleft: center (v=0) recedes at z=-1.62, tips (v=±1) sweep to z=-1.95
        const lobeSpan = Math.abs(v);
        const tipExtension = 0.33 * Math.pow(lobeSpan, 1.4);
        const z = -1.22 - u * (0.42 + tipExtension);

        // Height flares outward towards dorsal & ventral tips
        const heightSpread = 0.08 + u * (0.38 + 0.08 * (v > 0 ? 0.05 : 0.0));
        const y = v * heightSpread;
        const x = 0;

        tailPos.push(x, y, z);
        tailUv.push(u, (v + 1.0) * 0.5);
      }
    }

    for (let i = 0; i < tailSegmentsU; i++) {
      for (let j = 0; j < tailSegmentsV; j++) {
        const a = i * (tailSegmentsV + 1) + j;
        const b = (i + 1) * (tailSegmentsV + 1) + j;
        const c = (i + 1) * (tailSegmentsV + 1) + (j + 1);
        const d = i * (tailSegmentsV + 1) + (j + 1);
        tailIndex.push(a, b, d);
        tailIndex.push(b, c, d);
        tailIndex.push(d, b, a);
        tailIndex.push(d, c, b);
      }
    }

    const tailGeo = new THREE.BufferGeometry();
    tailGeo.setAttribute('position', new THREE.Float32BufferAttribute(tailPos, 3));
    tailGeo.setAttribute('uv', new THREE.Float32BufferAttribute(tailUv, 2));
    tailGeo.setIndex(tailIndex);
    tailGeo.computeVertexNormals();
    addColors(tailGeo, 0.45, 0.70, 0.95);
    parts.push(tailGeo);

    // 3. SWEPT DORSAL FIN
    const dorsalSegU = 14;
    const dorsalSegV = 6;
    const dorsalPos = [];
    const dorsalUv = [];
    const dorsalIndex = [];

    for (let i = 0; i <= dorsalSegU; i++) {
      const u = i / dorsalSegU; // 0 at front (z=0.35), 1 at rear (z=-0.55)
      const z = 0.35 - u * 0.90;
      const baseY = 0.28 + (z > 0 ? 0.08 : (z + 0.2) * 0.1);
      const finHeight = Math.sin(Math.pow(u, 0.45) * Math.PI) * 0.24 + (1.0 - u) * 0.06;

      for (let j = 0; j <= dorsalSegV; j++) {
        const v = j / dorsalSegV;
        const y = baseY + v * finHeight;
        const x = (1.0 - v) * 0.015 * Math.sin(u * Math.PI);
        dorsalPos.push(x, y, z);
        dorsalUv.push(u, v);
      }
    }

    for (let i = 0; i < dorsalSegU; i++) {
      for (let j = 0; j < dorsalSegV; j++) {
        const a = i * (dorsalSegV + 1) + j;
        const b = (i + 1) * (dorsalSegV + 1) + j;
        const c = (i + 1) * (dorsalSegV + 1) + (j + 1);
        const d = i * (dorsalSegV + 1) + (j + 1);
        dorsalIndex.push(a, b, d);
        dorsalIndex.push(b, c, d);
        dorsalIndex.push(d, b, a);
        dorsalIndex.push(d, c, b);
      }
    }

    const dorsalGeo = new THREE.BufferGeometry();
    dorsalGeo.setAttribute('position', new THREE.Float32BufferAttribute(dorsalPos, 3));
    dorsalGeo.setAttribute('uv', new THREE.Float32BufferAttribute(dorsalUv, 2));
    dorsalGeo.setIndex(dorsalIndex);
    dorsalGeo.computeVertexNormals();
    addColors(dorsalGeo, 0.45, 0.70, 0.95);
    parts.push(dorsalGeo);

    // 4. PAIRED PECTORAL FINS (Wing-like Hydrofoils)
    const buildPectoralFin = (isLeft) => {
      const segU = 10;
      const segV = 6;
      const pos = [];
      const uvs = [];
      const idx = [];
      const side = isLeft ? -1 : 1;

      for (let i = 0; i <= segU; i++) {
        const u = i / segU;
        for (let j = 0; j <= segV; j++) {
          const v = j / segV;
          const span = u * 0.48;
          const sweep = u * 0.32 + v * 0.15;
          const droop = u * 0.16 + (v - 0.5) * 0.05;

          const x = side * (0.28 + span * Math.cos(0.4) + (v - 0.5) * 0.12);
          const y = -0.16 - droop;
          const z = 0.52 - sweep;

          pos.push(x, y, z);
          uvs.push(u, v);
        }
      }

      for (let i = 0; i < segU; i++) {
        for (let j = 0; j < segV; j++) {
          const a = i * (segV + 1) + j;
          const b = (i + 1) * (segV + 1) + j;
          const c = (i + 1) * (segV + 1) + (j + 1);
          const d = i * (segV + 1) + (j + 1);
          idx.push(a, b, d);
          idx.push(b, c, d);
          idx.push(d, b, a);
          idx.push(d, c, b);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      addColors(geo, 0.45, 0.70, 0.95);
      return geo;
    };

    parts.push(buildPectoralFin(true), buildPectoralFin(false));

    // 5. PAIRED PELVIC / VENTRAL FINS
    const buildPelvicFin = (isLeft) => {
      const segU = 8;
      const segV = 4;
      const pos = [];
      const uvs = [];
      const idx = [];
      const side = isLeft ? -1 : 1;

      for (let i = 0; i <= segU; i++) {
        const u = i / segU;
        for (let j = 0; j <= segV; j++) {
          const v = j / segV;
          const x = side * (0.12 + u * 0.14 + (v - 0.5) * 0.05);
          const y = -0.36 - u * 0.12;
          const z = -0.15 - u * 0.28 - v * 0.08;
          pos.push(x, y, z);
          uvs.push(u, v);
        }
      }

      for (let i = 0; i < segU; i++) {
        for (let j = 0; j < segV; j++) {
          const a = i * (segV + 1) + j;
          const b = (i + 1) * (segV + 1) + j;
          const c = (i + 1) * (segV + 1) + (j + 1);
          const d = i * (segV + 1) + (j + 1);
          idx.push(a, b, d);
          idx.push(b, c, d);
          idx.push(d, b, a);
          idx.push(d, c, b);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      addColors(geo, 0.45, 0.70, 0.95);
      return geo;
    };

    parts.push(buildPelvicFin(true), buildPelvicFin(false));

    // 6. ANAL FIN (Ventral Keel Fin)
    const analSegU = 8;
    const analSegV = 4;
    const analPos = [];
    const analUv = [];
    const analIdx = [];

    for (let i = 0; i <= analSegU; i++) {
      const u = i / analSegU;
      const z = -0.65 - u * 0.40;
      const baseY = -0.18 - (1.0 - u) * 0.06;
      const finH = Math.sin(u * Math.PI) * 0.16;

      for (let j = 0; j <= analSegV; j++) {
        const v = j / analSegV;
        const y = baseY - v * finH;
        const x = 0;
        analPos.push(x, y, z);
        analUv.push(u, v);
      }
    }

    for (let i = 0; i < analSegU; i++) {
      for (let j = 0; j < analSegV; j++) {
        const a = i * (analSegV + 1) + j;
        const b = (i + 1) * (analSegV + 1) + j;
        const c = (i + 1) * (analSegV + 1) + (j + 1);
        const d = i * (analSegV + 1) + (j + 1);
        analIdx.push(a, b, d);
        analIdx.push(b, c, d);
        analIdx.push(d, b, a);
        analIdx.push(d, c, b);
      }
    }

    const analGeo = new THREE.BufferGeometry();
    analGeo.setAttribute('position', new THREE.Float32BufferAttribute(analPos, 3));
    analGeo.setAttribute('uv', new THREE.Float32BufferAttribute(analUv, 2));
    analGeo.setIndex(analIdx);
    analGeo.computeVertexNormals();
    addColors(analGeo, 0.45, 0.70, 0.95);
    parts.push(analGeo);

    // 7. SENSORY BARBELS (Koi Whiskers)
    const buildBarbel = (isLeft) => {
      const segs = 8;
      const pos = [];
      const uvs = [];
      const idx = [];
      const side = isLeft ? -1 : 1;

      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const x = side * (0.16 + t * 0.08 + Math.sin(t * Math.PI) * 0.03);
        const y = -0.10 - t * 0.14 - Math.sin(t * Math.PI * 0.5) * 0.04;
        const z = 1.02 - t * 0.26;
        const r = (1.0 - t * 0.75) * 0.012;

        for (let j = 0; j <= 4; j++) {
          const ang = (j / 4) * Math.PI * 2;
          pos.push(x + Math.cos(ang) * r, y + Math.sin(ang) * r, z);
          uvs.push(t, j / 4);
        }
      }

      for (let i = 0; i < segs; i++) {
        for (let j = 0; j < 4; j++) {
          const a = i * 5 + j;
          const b = (i + 1) * 5 + j;
          const c = (i + 1) * 5 + (j + 1);
          const d = i * 5 + (j + 1);
          idx.push(a, b, d);
          idx.push(b, c, d);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      addColors(geo, 0.45, 0.70, 0.95);
      return geo;
    };

    parts.push(buildBarbel(true), buildBarbel(false));

    // 8. 3D EYES (Cornea + Iris / Pupil Dome)
    const eyeGeo = new THREE.SphereGeometry(0.065, 12, 12);
    eyeGeo.scale(0.85, 1.0, 1.15);
    const lEye = eyeGeo.clone();
    lEye.rotateY(-0.25);
    lEye.translate(-0.24, 0.10, 0.76);
    addColors(lEye, 0.0, 0.0, 0.0);

    const rEye = eyeGeo.clone();
    rEye.rotateY(0.25);
    rEye.translate(0.24, 0.10, 0.76);
    addColors(rEye, 0.0, 0.0, 0.0);
    parts.push(lEye, rEye);

    // 9. OPERCULUM GILL ARCH CONTOURS
    const buildGill = (isLeft) => {
      const segs = 10;
      const pos = [];
      const uvs = [];
      const idx = [];
      const side = isLeft ? -1 : 1;

      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const angle = (t - 0.5) * Math.PI * 0.75;
        const y = Math.sin(angle) * 0.22 - 0.02;
        const z = 0.58 + Math.cos(angle) * 0.10;
        const x = side * (0.285 + Math.cos(angle) * 0.02);

        pos.push(x, y, z);
        uvs.push(0, t);
        pos.push(x * 0.98, y, z - 0.05);
        uvs.push(1, t);
      }

      for (let i = 0; i < segs; i++) {
        const a = i * 2;
        const b = (i + 1) * 2;
        const c = (i + 1) * 2 + 1;
        const d = i * 2 + 1;
        idx.push(a, b, d);
        idx.push(b, c, d);
        idx.push(d, b, a);
        idx.push(d, c, b);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      addColors(geo, 1.0, 1.0, 1.0);
      return geo;
    };

    parts.push(buildGill(true), buildGill(false));

    const merged = safeMerge(parts, false) || bodyGeo;
    return merged;
  }

  _buildReefFishMesh() {
    const parts = [];
    const addColors = (geom, r, g, b) => {
      const count = geom.attributes.position.count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
      }
      geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return geom;
    };

    // Deep-bodied disc/oval profile (Tangs / Clownfish / Angelfish)
    const nz = 28;
    const nTheta = 20;
    const bodyPos = [];
    const bodyUv = [];
    const bodyIndex = [];

    for (let i = 0; i <= nz; i++) {
      const tz = i / nz;
      const z = 0.65 - 1.40 * tz;
      
      let rx, ry, yc;
      if (tz < 0.25) {
        const s = tz / 0.25;
        rx = 0.16 * Math.pow(Math.sin(s * Math.PI * 0.5), 0.7);
        ry = 0.38 * Math.pow(Math.sin(s * Math.PI * 0.5), 0.6);
        yc = -0.02 * (1.0 - s);
      } else if (tz < 0.65) {
        const s = (tz - 0.25) / 0.40;
        const bulge = Math.sin(s * Math.PI);
        rx = 0.16 + 0.06 * bulge;
        ry = 0.38 + 0.18 * bulge;
        yc = -0.02;
      } else {
        const s = (tz - 0.65) / 0.35;
        const sCurve = Math.pow(s, 0.85);
        rx = (1 - sCurve) * 0.16 + sCurve * 0.025;
        ry = (1 - sCurve) * 0.38 + sCurve * 0.055;
        yc = (1 - s) * (-0.02);
      }

      for (let j = 0; j <= nTheta; j++) {
        const theta = (j / nTheta) * Math.PI * 2;
        const sinT = Math.sin(theta);
        const cosT = Math.cos(theta);

        const x = rx * sinT;
        const y = yc + ry * cosT;

        bodyPos.push(x, y, z);
        bodyUv.push(j / nTheta, tz);
      }
    }

    for (let i = 0; i < nz; i++) {
      for (let j = 0; j < nTheta; j++) {
        const a = i * (nTheta + 1) + j;
        const b = (i + 1) * (nTheta + 1) + j;
        const c = (i + 1) * (nTheta + 1) + (j + 1);
        const d = i * (nTheta + 1) + (j + 1);
        bodyIndex.push(a, b, d);
        bodyIndex.push(b, c, d);
      }
    }

    const bodyGeo = new THREE.BufferGeometry();
    bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(bodyPos, 3));
    bodyGeo.setAttribute('uv', new THREE.Float32BufferAttribute(bodyUv, 2));
    bodyGeo.setIndex(bodyIndex);
    bodyGeo.computeVertexNormals();
    addColors(bodyGeo, 1.0, 1.0, 1.0);
    parts.push(bodyGeo);

    // Caudal Fin (Fan-shaped reef tail)
    const tailSegU = 10;
    const tailSegV = 8;
    const tailPos = [];
    const tailUv = [];
    const tailIdx = [];

    for (let i = 0; i <= tailSegU; i++) {
      const u = i / tailSegU;
      for (let j = 0; j <= tailSegV; j++) {
        const v = (j / tailSegV) * 2.0 - 1.0;
        const z = -0.74 - u * 0.40;
        const y = v * (0.06 + u * 0.28);
        const x = 0;
        tailPos.push(x, y, z);
        tailUv.push(u, (v + 1.0) * 0.5);
      }
    }

    for (let i = 0; i < tailSegU; i++) {
      for (let j = 0; j < tailSegV; j++) {
        const a = i * (tailSegV + 1) + j;
        const b = (i + 1) * (tailSegV + 1) + j;
        const c = (i + 1) * (tailSegV + 1) + (j + 1);
        const d = i * (tailSegV + 1) + (j + 1);
        tailIdx.push(a, b, d, b, c, d, d, b, a, d, c, b);
      }
    }

    const tailGeo = new THREE.BufferGeometry();
    tailGeo.setAttribute('position', new THREE.Float32BufferAttribute(tailPos, 3));
    tailGeo.setAttribute('uv', new THREE.Float32BufferAttribute(tailUv, 2));
    tailGeo.setIndex(tailIdx);
    tailGeo.computeVertexNormals();
    addColors(tailGeo, 0.45, 0.70, 0.95);
    parts.push(tailGeo);

    // Dorsal fin
    const dSegU = 10;
    const dSegV = 4;
    const dPos = [];
    const dUv = [];
    const dIdx = [];

    for (let i = 0; i <= dSegU; i++) {
      const u = i / dSegU;
      const z = 0.25 - u * 0.85;
      const baseY = 0.45 * Math.sin(Math.PI * (0.15 + u * 0.75));
      const finH = 0.16 * Math.sin(u * Math.PI) + (1.0 - u) * 0.06;
      for (let j = 0; j <= dSegV; j++) {
        const v = j / dSegV;
        dPos.push(0, baseY + v * finH, z);
        dUv.push(u, v);
      }
    }

    for (let i = 0; i < dSegU; i++) {
      for (let j = 0; j < dSegV; j++) {
        const a = i * (dSegV + 1) + j;
        const b = (i + 1) * (dSegV + 1) + j;
        const c = (i + 1) * (dSegV + 1) + (j + 1);
        const d = i * (dSegV + 1) + (j + 1);
        dIdx.push(a, b, d, b, c, d, d, b, a, d, c, b);
      }
    }

    const dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute('position', new THREE.Float32BufferAttribute(dPos, 3));
    dGeo.setAttribute('uv', new THREE.Float32BufferAttribute(dUv, 2));
    dGeo.setIndex(dIdx);
    dGeo.computeVertexNormals();
    addColors(dGeo, 0.45, 0.70, 0.95);
    parts.push(dGeo);

    // Ventral / Anal fin
    const vSegU = 10;
    const vSegV = 4;
    const vPos = [];
    const vUv = [];
    const vIdx = [];

    for (let i = 0; i <= vSegU; i++) {
      const u = i / vSegU;
      const z = 0.15 - u * 0.75;
      const baseY = -0.45 * Math.sin(Math.PI * (0.15 + u * 0.75));
      const finH = 0.14 * Math.sin(u * Math.PI);
      for (let j = 0; j <= vSegV; j++) {
        const v = j / vSegV;
        vPos.push(0, baseY - v * finH, z);
        vUv.push(u, v);
      }
    }

    for (let i = 0; i < vSegU; i++) {
      for (let j = 0; j < vSegV; j++) {
        const a = i * (vSegV + 1) + j;
        const b = (i + 1) * (vSegV + 1) + j;
        const c = (i + 1) * (vSegV + 1) + (j + 1);
        const d = i * (vSegV + 1) + (j + 1);
        vIdx.push(a, b, d, b, c, d, d, b, a, d, c, b);
      }
    }

    const vGeo = new THREE.BufferGeometry();
    vGeo.setAttribute('position', new THREE.Float32BufferAttribute(vPos, 3));
    vGeo.setAttribute('uv', new THREE.Float32BufferAttribute(vUv, 2));
    vGeo.setIndex(vIdx);
    vGeo.computeVertexNormals();
    addColors(vGeo, 0.45, 0.70, 0.95);
    parts.push(vGeo);

    // 3D Eyes
    const eyeGeo = new THREE.SphereGeometry(0.048, 10, 10);
    eyeGeo.scale(0.8, 1.0, 1.1);
    const lEye = eyeGeo.clone();
    lEye.translate(-0.14, 0.08, 0.42);
    addColors(lEye, 0.0, 0.0, 0.0);

    const rEye = eyeGeo.clone();
    rEye.translate(0.14, 0.08, 0.42);
    addColors(rEye, 0.0, 0.0, 0.0);
    parts.push(lEye, rEye);

    const merged = safeMerge(parts, false) || bodyGeo;
    return merged;
  }

  _buildDolphinMesh() {
    const parts = [];
    
    // 1. Sleek Streamlined Cetacean Body (3.2m long)
    const body = new THREE.CylinderGeometry(0.01, 0.55, 3.2, 28, 24, false);
    body.rotateX(Math.PI / 2);
    const pos = body.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      const u = (z + 1.6) / 3.2;
      let radX, radY;
      if (u > 0.88) {
        const bu = (u - 0.88) / 0.12;
        radX = 0.22 * Math.sin(bu * Math.PI * 0.5);
        radY = 0.18 * Math.sin(bu * Math.PI * 0.5);
      } else if (u > 0.70) {
        const mu = (u - 0.70) / 0.18;
        radX = 0.22 + 0.65 * Math.sin(mu * Math.PI * 0.5);
        radY = 0.18 + 0.82 * Math.sin(mu * Math.PI * 0.5);
      } else if (u > 0.25) {
        const tu = (u - 0.25) / 0.45;
        radX = 0.45 + 0.42 * Math.sin(tu * Math.PI);
        radY = 0.50 + 0.50 * Math.sin(tu * Math.PI);
      } else {
        const pu = u / 0.25;
        radX = 0.12 + 0.33 * pu;
        radY = 0.16 + 0.34 * pu;
      }
      pos.setX(i, pos.getX(i) * radX);
      pos.setY(i, pos.getY(i) * radY);
    }
    body.computeVertexNormals();
    parts.push(body);

    // 2. Falcate Dorsal Fin
    const dorsalShape = new THREE.Shape();
    dorsalShape.moveTo(0, 0);
    dorsalShape.bezierCurveTo(-0.05, 0.25, -0.18, 0.52, -0.42, 0.58);
    dorsalShape.bezierCurveTo(-0.32, 0.32, -0.22, 0.12, 0, 0);
    const dorsalGeo = new THREE.ExtrudeGeometry(dorsalShape, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, steps: 1 });
    dorsalGeo.rotateY(Math.PI / 2);
    dorsalGeo.translate(0, 0.48, -0.20);
    parts.push(dorsalGeo);

    // 3. Paired Pectoral Flippers
    [-1, 1].forEach(side => {
      const flipShape = new THREE.Shape();
      flipShape.moveTo(0, 0);
      flipShape.bezierCurveTo(0.15, -0.15, 0.55, -0.42, 0.78, -0.65);
      flipShape.bezierCurveTo(0.55, -0.52, 0.25, -0.32, 0, 0);
      const flipGeo = new THREE.ExtrudeGeometry(flipShape, { depth: 0.03, bevelEnabled: false });
      flipGeo.rotateZ(side * 0.35);
      flipGeo.rotateY(side * 0.45);
      flipGeo.translate(side * 0.42, -0.22, 0.45);
      parts.push(flipGeo);
    });

    // 4. Horizontal Caudal Flukes (Tail)
    const flukeShape = new THREE.Shape();
    flukeShape.moveTo(0, 0);
    flukeShape.bezierCurveTo(0.35, -0.15, 0.72, -0.35, 0.95, -0.48);
    flukeShape.bezierCurveTo(0.65, -0.28, 0.28, -0.05, 0, -0.12);
    flukeShape.bezierCurveTo(-0.28, -0.05, -0.65, -0.28, -0.95, -0.48);
    flukeShape.bezierCurveTo(-0.72, -0.35, -0.35, -0.15, 0, 0);
    const flukeGeo = new THREE.ExtrudeGeometry(flukeShape, { depth: 0.03, bevelEnabled: false });
    flukeGeo.rotateX(Math.PI / 2);
    flukeGeo.translate(0, 0, -1.6);
    parts.push(flukeGeo);

    // 5. 3D Eye Spheres
    [-1, 1].forEach(side => {
      const eye = new THREE.SphereGeometry(0.045, 8, 8);
      eye.translate(side * 0.32, 0.12, 0.95);
      parts.push(eye);
    });

    const addColors = (geom, isEye) => {
      const count = geom.attributes.position.count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        colors[i * 3] = isEye ? 0.0 : 1.0;
        colors[i * 3 + 1] = isEye ? 0.0 : 1.0;
        colors[i * 3 + 2] = isEye ? 0.0 : 1.0;
      }
      geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      if (!geom.attributes.normal) geom.computeVertexNormals();
      if (!geom.attributes.uv) {
        const uvs = new Float32Array(count * 2);
        geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      }
    };

    parts.forEach((p, idx) => addColors(p, idx >= 5));
    const merged = safeMerge(parts, false) || body;
    return merged;
  }

  _buildSharkMesh() {
    const parts = [];
    
    // 1. Powerful Torpedo Shark Body (3.6m long)
    const body = new THREE.CylinderGeometry(0.01, 0.58, 3.6, 28, 24, false);
    body.rotateX(Math.PI / 2);
    const pos = body.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      const u = (z + 1.8) / 3.6;
      let radX, radY;
      if (u > 0.75) {
        const su = (u - 0.75) / 0.25;
        radX = 0.85 * Math.pow(su, 0.65);
        radY = 0.65 * Math.pow(su, 0.80);
      } else if (u > 0.28) {
        const tu = (u - 0.28) / 0.47;
        radX = 0.55 + 0.35 * Math.sin(tu * Math.PI);
        radY = 0.52 + 0.40 * Math.sin(tu * Math.PI);
      } else {
        const pu = u / 0.28;
        radX = 0.14 + 0.41 * pu;
        radY = 0.16 + 0.36 * pu;
      }
      pos.setX(i, pos.getX(i) * radX);
      pos.setY(i, pos.getY(i) * radY);
    }
    body.computeVertexNormals();
    parts.push(body);

    // 2. Iconic Tall Triangular Primary Dorsal Fin
    const dorsalShape = new THREE.Shape();
    dorsalShape.moveTo(0, 0);
    dorsalShape.lineTo(-0.25, 0.75);
    dorsalShape.bezierCurveTo(-0.35, 0.55, -0.45, 0.25, -0.55, 0.05);
    dorsalShape.lineTo(0, 0);
    const dorsalGeo = new THREE.ExtrudeGeometry(dorsalShape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, steps: 1 });
    dorsalGeo.rotateY(Math.PI / 2);
    dorsalGeo.translate(0, 0.52, 0.05);
    parts.push(dorsalGeo);

    // 3. Swept Pectoral Foils
    [-1, 1].forEach(side => {
      const pecShape = new THREE.Shape();
      pecShape.moveTo(0, 0);
      pecShape.lineTo(side * 0.95, -0.75);
      pecShape.bezierCurveTo(side * 0.65, -0.62, side * 0.35, -0.38, 0, 0);
      const pecGeo = new THREE.ExtrudeGeometry(pecShape, { depth: 0.03, bevelEnabled: false });
      pecGeo.rotateX(0.15);
      pecGeo.translate(0, -0.18, 0.55);
      parts.push(pecGeo);
    });

    // 4. Heterocercal Caudal Tail Fin (Tall Upper Lobe, Distinct Lower Lobe)
    const tailShape = new THREE.Shape();
    tailShape.moveTo(0, 0);
    tailShape.lineTo(-0.85, 0.85);
    tailShape.bezierCurveTo(-0.72, 0.45, -0.45, 0.15, -0.32, 0.0);
    tailShape.lineTo(-0.55, -0.45);
    tailShape.bezierCurveTo(-0.38, -0.28, -0.18, -0.12, 0, 0);
    const tailGeo = new THREE.ExtrudeGeometry(tailShape, { depth: 0.04, bevelEnabled: false });
    tailGeo.rotateY(-Math.PI / 2);
    tailGeo.translate(0, 0, -1.8);
    parts.push(tailGeo);

    // 5. Secondary Dorsal Fin
    const secDorsal = dorsalGeo.clone();
    secDorsal.scale(0.35, 0.35, 0.35);
    secDorsal.translate(0, -0.32, -1.05);
    parts.push(secDorsal);

    // 6. Eye Spheres
    [-1, 1].forEach(side => {
      const eye = new THREE.SphereGeometry(0.045, 8, 8);
      eye.translate(side * 0.35, 0.08, 1.15);
      parts.push(eye);
    });

    const addColors = (geom, isEye) => {
      const count = geom.attributes.position.count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        colors[i * 3] = isEye ? 0.0 : 1.0;
        colors[i * 3 + 1] = isEye ? 0.0 : 1.0;
        colors[i * 3 + 2] = isEye ? 0.0 : 1.0;
      }
      geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      if (!geom.attributes.normal) geom.computeVertexNormals();
      if (!geom.attributes.uv) {
        const uvs = new Float32Array(count * 2);
        geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      }
    };

    parts.forEach((p, idx) => addColors(p, idx >= 6));
    const merged = safeMerge(parts, false) || body;
    return merged;
  }

  _buildSeaTurtleMesh() {
    const parts = [];
    const shell = new THREE.SphereGeometry(0.6, 16, 12);
    shell.scale(1.0, 0.4, 1.2);
    parts.push(shell);
    const head = new THREE.SphereGeometry(0.2, 8, 8);
    head.scale(1.0, 0.6, 1.2);
    head.translate(0, 0, 0.8);
    parts.push(head);
    const flipperL = new THREE.BoxGeometry(0.8, 0.05, 0.3);
    flipperL.translate(-0.8, 0, 0.4);
    const flipperR = flipperL.clone();
    flipperR.translate(1.6, 0, 0);
    parts.push(flipperL, flipperR);
    const merged = safeMerge(parts, false) || parts[0];
    return merged || shell;
  }

  _buildMantaRayMesh() {
    const parts = [];
    const body = new THREE.CylinderGeometry(0, 1.2, 1.2, 4);
    body.rotateY(Math.PI / 4);
    body.scale(2.5, 0.1, 1.2);
    parts.push(body);
    const tail = new THREE.CylinderGeometry(0.02, 0.02, 2.5);
    tail.rotateX(Math.PI / 2);
    tail.translate(0, 0, -1.8);
    parts.push(tail);
    const merged = safeMerge(parts, false) || parts[0];
    return merged || body;
  }

  _buildBronzeBull() {
    const g = new THREE.Group();
    const bronze = Surfaces.bronze(1.2);
    const gold = Surfaces.gold(1.0);

    // Powerful Muscular Torso
    const bodyGeo = new THREE.CylinderGeometry(0.9, 1.05, 3.2, 14);
    bodyGeo.rotateX(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeo, bronze);
    body.position.y = 1.45;
    body.castShadow = true;
    g.add(body);

    // Muscular Neck Hump & Chest
    const chestGeo = new THREE.SphereGeometry(1.15, 14, 12);
    chestGeo.scale(0.92, 1.15, 1.35);
    const chest = new THREE.Mesh(chestGeo, bronze);
    chest.position.set(0, 1.7, 1.05);
    chest.castShadow = true;
    g.add(chest);

    // Sculpted Head & Snout
    const headGeo = new THREE.ConeGeometry(0.65, 1.3, 12);
    headGeo.rotateX(Math.PI / 3.2);
    const head = new THREE.Mesh(headGeo, bronze);
    head.position.set(0, 2.05, 2.0);
    head.castShadow = true;
    g.add(head);

    // Curved Gilded Horns of Baal
    for (const side of [-1, 1]) {
      const hornPts = [
        new THREE.Vector3(side * 0.38, 2.25, 1.95),
        new THREE.Vector3(side * 0.95, 2.85, 1.85),
        new THREE.Vector3(side * 1.05, 3.45, 2.15),
      ];
      const hornCurve = new THREE.CatmullRomCurve3(hornPts);
      const hornGeo = new THREE.TubeGeometry(hornCurve, 12, 0.16, 8, false);
      const horn = new THREE.Mesh(hornGeo, gold);
      horn.castShadow = true;
      g.add(horn);
    }

    // Solar Disc Medallion between Horns
    const discGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.08, 16);
    discGeo.rotateX(Math.PI / 2);
    const disc = new THREE.Mesh(discGeo, gold);
    disc.position.set(0, 2.95, 1.95);
    disc.castShadow = true;
    g.add(disc);

    // 4 Muscular Legs
    const legGeo = new THREE.CylinderGeometry(0.24, 0.32, 1.45, 8);
    const legPos = [
      [-0.60, 0.72, 0.95],
      [0.60, 0.72, 0.95],
      [-0.60, 0.72, -0.95],
      [0.60, 0.72, -0.95],
    ];
    legPos.forEach(p => {
      const leg = new THREE.Mesh(legGeo, bronze);
      leg.position.set(p[0], p[1], p[2]);
      leg.castShadow = true;
      g.add(leg);
    });

    // Bronze Tail
    const tailPts = [
      new THREE.Vector3(0, 1.45, -1.6),
      new THREE.Vector3(0.05, 0.95, -1.8),
      new THREE.Vector3(-0.05, 0.45, -1.7),
    ];
    const tailCurve = new THREE.CatmullRomCurve3(tailPts);
    const tailGeo = new THREE.TubeGeometry(tailCurve, 10, 0.08, 6, false);
    const tail = new THREE.Mesh(tailGeo, bronze);
    g.add(tail);

    return g;
  }

  _buildBaalIdol() {
    const g = new THREE.Group();
    const gold = Surfaces.gold(1.0);
    const bronze = Surfaces.bronze(1.2);
    const stone = Surfaces.agedCaenLimestone(2.0);

    const bronzeGeoms = [];
    const goldGeoms = [];
    const stoneGeoms = [];

    // Grand Stepped Ceremonial Dais Pedestal
    const daisGeo1 = new THREE.CylinderGeometry(2.4, 2.8, 0.6, 24);
    daisGeo1.translate(0, 0.3, 0);
    stoneGeoms.push(daisGeo1);

    const daisGeo2 = new THREE.CylinderGeometry(2.0, 2.4, 0.6, 24);
    daisGeo2.translate(0, 0.9, 0);
    stoneGeoms.push(daisGeo2);

    const daisGeo3 = new THREE.CylinderGeometry(1.6, 2.0, 0.6, 24);
    daisGeo3.translate(0, 1.5, 0);
    stoneGeoms.push(daisGeo3);

    // Robed Lower Torso & Phoenician Kilt
    const kiltGeo = new THREE.CylinderGeometry(0.70, 1.25, 2.8, 16);
    kiltGeo.translate(0, 3.2, 0);
    bronzeGeoms.push(kiltGeo);

    // Decorative Kilt Belt
    const beltGeo = new THREE.TorusGeometry(0.75, 0.1, 8, 16);
    beltGeo.rotateX(Math.PI / 2);
    beltGeo.translate(0, 4.5, 0);
    goldGeoms.push(beltGeo);

    // Gilded Muscular Upper Torso & Chestplate
    const torsoGeo = new THREE.CylinderGeometry(0.95, 0.70, 2.2, 16);
    torsoGeo.translate(0, 5.7, 0);
    goldGeoms.push(torsoGeo);

    // Broad Shoulders
    const shoulderLGeo = new THREE.SphereGeometry(0.4, 12, 10);
    shoulderLGeo.translate(-1.0, 6.4, 0);
    goldGeoms.push(shoulderLGeo);
    
    const shoulderRGeo = new THREE.SphereGeometry(0.4, 12, 10);
    shoulderRGeo.translate(1.0, 6.4, 0);
    goldGeoms.push(shoulderRGeo);

    // Bearded Head of Baal
    const headGeo = new THREE.SphereGeometry(0.55, 16, 12);
    headGeo.translate(0, 7.2, 0);
    goldGeoms.push(headGeo);

    // Majestic Beard
    const beardGeo = new THREE.ConeGeometry(0.3, 0.8, 8);
    beardGeo.translate(0, 6.8, 0.3);
    bronzeGeoms.push(beardGeo);

    // Divine Conical Horned Crown of Storms
    const crownGeo = new THREE.ConeGeometry(0.55, 1.5, 12);
    crownGeo.translate(0, 8.2, 0);
    goldGeoms.push(crownGeo);

    // Divine Crown Horns
    for (const side of [-1, 1]) {
      const hCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.4, 7.7, 0),
        new THREE.Vector3(side * 0.9, 8.2, 0.1),
        new THREE.Vector3(side * 0.8, 8.8, 0.2),
      ]);
      const hGeo = new THREE.TubeGeometry(hCurve, 10, 0.12, 8, false);
      goldGeoms.push(hGeo);
    }

    // Right Arm Raised brandishing Golden Lightning Bolt Trident
    const armRGeo = new THREE.CylinderGeometry(0.2, 0.25, 2.0, 10);
    armRGeo.rotateZ(-0.65);
    armRGeo.rotateX(-0.45);
    armRGeo.translate(1.2, 6.5, 0.2);
    goldGeoms.push(armRGeo);

    // Jagged Golden Lightning Trident
    const boltShaftGeo = new THREE.CylinderGeometry(0.1, 0.1, 5.0, 10);
    boltShaftGeo.rotateX(Math.PI / 4);
    boltShaftGeo.translate(2.0, 7.8, 0.8);
    goldGeoms.push(boltShaftGeo);

    for (const prong of [-0.5, 0, 0.5]) {
      const pGeo = new THREE.ConeGeometry(0.15, 1.0, 8);
      pGeo.rotateX(Math.PI / 4);
      pGeo.translate(2.0 + prong, 9.8, 0.8 + prong * 0.25);
      goldGeoms.push(pGeo);
    }

    // Left Arm holding Scepter of Dominion
    const armLGeo = new THREE.CylinderGeometry(0.2, 0.25, 1.8, 10);
    armLGeo.rotateX(Math.PI / 3);
    armLGeo.translate(-1.2, 5.8, 0.5);
    goldGeoms.push(armLGeo);

    const scepterGeo = new THREE.CylinderGeometry(0.12, 0.12, 3.5, 10);
    scepterGeo.translate(-1.3, 5.4, 1.4);
    bronzeGeoms.push(scepterGeo);

    // Scepter Head
    const scepterHeadGeo = new THREE.SphereGeometry(0.3, 12, 10);
    scepterHeadGeo.translate(-1.3, 7.15, 1.4);
    goldGeoms.push(scepterHeadGeo);

    // Radiant Sun Halo behind Head
    const haloGeo = new THREE.TorusGeometry(1.3, 0.1, 10, 30);
    haloGeo.translate(0, 7.3, -0.4);
    goldGeoms.push(haloGeo);

    // Merge Geometries
    if (stoneGeoms.length > 0) {
      const mergedStone = safeMerge(stoneGeoms, false);
      if (mergedStone) {
        const mesh = new THREE.Mesh(mergedStone, stone);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        g.add(mesh);
      }
    }
    
    if (bronzeGeoms.length > 0) {
      const mergedBronze = safeMerge(bronzeGeoms, false);
      if (mergedBronze) {
        const mesh = new THREE.Mesh(mergedBronze, bronze);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        g.add(mesh);
      }
    }

    if (goldGeoms.length > 0) {
      const mergedGold = safeMerge(goldGeoms, false);
      if (mergedGold) {
        const mesh = new THREE.Mesh(mergedGold, gold);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        g.add(mesh);
      }
    }

    return g;
  }

  _buildWingedSunDisc() {
    const g = new THREE.Group();
    const gold = Surfaces.gold(1.0);
    const bronze = Surfaces.bronze(1.2);

    // Central Sun Disc Sphere
    const disc = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), gold);
    disc.scale.set(1.0, 1.0, 0.35);
    g.add(disc);

    // Dual Flaring Phoenician Wings
    for (const side of [-1, 1]) {
      const wingShape = new THREE.Shape();
      wingShape.moveTo(0, 0);
      wingShape.quadraticCurveTo(side * 2.5, 1.2, side * 5.2, 0.4);
      wingShape.quadraticCurveTo(side * 3.8, -0.6, side * 1.8, -0.8);
      wingShape.quadraticCurveTo(side * 0.8, -0.4, 0, 0);
      const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.3, bevelEnabled: false });
      const wing = new THREE.Mesh(wingGeo, gold);
      wing.position.set(side * 0.6, 0, -0.15);
      g.add(wing);
    }

    // Sacred Horned Crown Surmounting Sun
    for (const side of [-1, 1]) {
      const uCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.5, 0.9, 0),
        new THREE.Vector3(side * 0.9, 1.6, 0.1),
        new THREE.Vector3(side * 0.6, 2.1, 0.15),
      ]);
      const uMesh = new THREE.Mesh(new THREE.TubeGeometry(uCurve, 8, 0.09, 6, false), bronze);
      g.add(uMesh);
    }

    return g;
  }

  _createPhysicalWaterMaterial(normals, type = 'lake') {
    let norm = null;
    try {
      const src = normals?.normalMap || normals?.normal || normals;
      norm = src && typeof src.clone === 'function' ? src.clone() : src;
    } catch (e) {
      norm = normals;
    }
    if (norm && norm.wrapS !== undefined) {
      norm.wrapS = norm.wrapT = THREE.RepeatWrapping;
    }

    const mat = new THREE.MeshPhysicalMaterial({
      color: type === 'ocean' ? 0x0a4860 : (type === 'river' ? 0x145874 : 0x185a78),
      roughness: 0.08,
      metalness: 0.05,
      transparent: true, logarithmicDepthBuffer: true,
      opacity: type === 'ocean' ? 0.90 : 0.82,
      normalMap: norm || null,
      normalScale: new THREE.Vector2(1.1, 1.1),
      envMapIntensity: 2.4,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    mat.onBeforeCompile = function(shader) {
      shader.uniforms.uTime = { value: 0 };
      this.userData.shader = shader;
      
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         vec3 gerstnerWave(vec2 dir, float steepness, float wavelength, vec2 p, float speed, float t) {
             float k = 2.0 * 3.14159265 / wavelength;
             float c = sqrt(9.8 / k);
             vec2 d = normalize(dir);
             float f = k * (dot(d, p) - c * speed * t);
             float a = steepness / k;
             return vec3(
                 d.x * (a * cos(f)),
                 a * sin(f),
                 d.y * (a * cos(f))
             );
         }`
      ).replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vec4 worldPos = modelMatrix * vec4(position, 1.0);
         vec3 g1 = gerstnerWave(vec2(1.0, 0.4), 0.12, 12.0, worldPos.xz, 1.2, uTime);
         vec3 g2 = gerstnerWave(vec2(-0.5, 1.0), 0.10, 8.0, worldPos.xz, 1.5, uTime);
         vec3 g3 = gerstnerWave(vec2(0.8, -0.6), 0.08, 5.0, worldPos.xz, 1.8, uTime);
         vec3 gWave = g1 + g2 + g3;

         ${type === 'river' ? `
         float channelProfile = 1.0 - pow(abs(uv.x - 0.5) * 2.0, 2.0);
         float currentSpeed = 4.8 + channelProfile * 3.6;
         vec3 r1 = gerstnerWave(vec2(0.0, 1.0), 0.16 * channelProfile, 10.0, worldPos.xz, currentSpeed * 0.2, uTime);
         vec3 r2 = gerstnerWave(vec2(0.2, 0.98), 0.09 * channelProfile, 6.0, worldPos.xz, currentSpeed * 0.25, uTime);
         vec3 r3 = gerstnerWave(vec2(-0.2, 0.98), 0.04, 3.0, worldPos.xz, currentSpeed * 0.3, uTime);
         vec3 riverWave = r1 + r2 + r3;
         
         float distToLake = distance(worldPos.xz, vec2(430.0, -260.0));
         float blendLake = smoothstep(285.0, 320.0, distToLake);
         float blendOcean = 1.0 - smoothstep(900.0, 930.0, worldPos.z);
         float blend = min(blendLake, blendOcean);
         
         vec3 finalWave = mix(gWave, riverWave, blend);
         transformed += finalWave;
         ` : `
         transformed += gWave;
         `}
        `
      );
    };
    return mat;
  }

  _createRiverMaterial(normals) {
    const norm = (normals.normalMap || normals.normal || normals).clone();
    norm.wrapS = norm.wrapT = THREE.RepeatWrapping;

    const riverVert = `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      #include <fog_pars_vertex>
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vCustomWorldNormal;
      varying vec3 vToEye;

      void main() {
        vUv = uv;
        vec3 transformed = position;
        
        // Parabolic channel velocity profile: fastest current in center (u=0.5), slowing at banks
        float channelProfile = 1.0 - pow(abs(uv.x - 0.5) * 2.0, 2.0);
        float currentSpeed = 4.8 + channelProfile * 3.6;
        
        // Multi-octave downstream surging wave ripples with channel profile dampening
        float wave1 = sin(uv.y * 3.8 - uTime * currentSpeed) * 0.16 * channelProfile;
        float wave2 = cos(uv.y * 7.5 + uv.x * 3.14159 - uTime * (currentSpeed * 1.35)) * 0.09 * channelProfile;
        float wave3 = sin(uv.y * 15.0 - uTime * (currentSpeed * 1.9)) * 0.04;
        transformed.y += (wave1 + wave2 + wave3);

        vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
        vWorldPos = worldPos.xyz;
        vCustomWorldNormal = normalize(mat3(modelMatrix) * normal);
        vToEye = cameraPosition - worldPos.xyz;

        gl_Position = projectionMatrix * viewMatrix * worldPos;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }
    `;

    const riverFrag = `
      #include <logdepthbuf_pars_fragment>
      #include <fog_pars_fragment>
      uniform sampler2D normalSampler;
      uniform vec3 uDeepWater;
      uniform vec3 uMidWater;
      uniform vec3 uSunWater;
      uniform vec3 uFoamColor;
      uniform vec3 sunColor;
      uniform vec3 sunDirection;
      uniform float uTime;
      uniform float uLength;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vCustomWorldNormal;
      varying vec3 vToEye;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      void main() {
        float channelProfile = 1.0 - pow(abs(vUv.x - 0.5) * 2.0, 2.0);
        float flowSpeed = uTime * (3.2 + channelProfile * 2.8);

        // Directional downstream flow mapping with dual-speed advection and subtle vortex curls
        vec2 flow1 = vec2(vUv.x * 3.5 + sin(vUv.y * 2.0 - flowSpeed * 0.8) * 0.05, vUv.y * 2.5 - flowSpeed);
        vec2 flow2 = vec2(vUv.x * 7.5 - cos(vUv.y * 3.5 + flowSpeed * 0.65) * 0.07, vUv.y * 5.2 - flowSpeed * 1.65);
        vec2 flow3 = vec2(vUv.x * 16.0 + sin(vUv.x * 9.0) * 0.06, vUv.y * 10.0 - flowSpeed * 2.6);

        vec3 n1 = texture2D(normalSampler, flow1).rgb * 2.0 - 1.0;
        vec3 n2 = texture2D(normalSampler, flow2).rgb * 2.0 - 1.0;
        vec3 n3 = texture2D(normalSampler, flow3).rgb * 2.0 - 1.0;
        vec3 waveNormal = normalize(n1 * 0.48 + n2 * 0.36 + n3 * 0.24);
        vec3 surfaceNormal = normalize(vCustomWorldNormal + waveNormal * 0.38);

        vec3 worldToEye = normalize(vToEye);
        vec3 sunDir = normalize(sunDirection);

        // Exact Dielectric Fresnel for water (IOR 1.333, F0 = 0.0204)
        float cosTheta = clamp(dot(surfaceNormal, worldToEye), 0.0, 1.0);
        float F0 = 0.0204;
        float fresnel = F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);

        // Atmospheric Rayleigh sky radiance gradient reflection
        vec3 reflectDir = reflect(-worldToEye, surfaceNormal);
        float skyGradient = clamp(reflectDir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 skyColor = mix(vec3(0.12, 0.32, 0.55), vec3(0.48, 0.68, 0.88), skyGradient);

        // Physical GGX Microfacet Sun Specular Glints
        vec3 halfVec = normalize(sunDir + worldToEye);
        float NdotH = max(0.0, dot(surfaceNormal, halfVec));
        float NdotV = max(0.001, dot(surfaceNormal, worldToEye));
        float NdotL = max(0.001, dot(surfaceNormal, sunDir));
        float alphaRoughness = 0.042;
        float alphaSq = alphaRoughness * alphaRoughness;
        float denom = (NdotH * NdotH * (alphaSq - 1.0) + 1.0);
        float D = alphaSq / (3.14159265359 * denom * denom);
        float k = (alphaRoughness + 1.0) * (alphaRoughness + 1.0) / 8.0;
        float G = (NdotV / (NdotV * (1.0 - k) + k)) * (NdotL / (NdotL * (1.0 - k) + k));
        vec3 specularLight = sunColor * ((D * fresnel * G) / (4.0 * NdotV * NdotL + 0.001)) * NdotL * 4.6;

        // Channel depth with Beer-Lambert physical extinction
        float channelDepth = channelProfile * 2.8 + 0.25;

        // Submerged riverbed gravel & golden caustics in shallow margins
        vec2 bedUv = vWorldPos.xz * 0.50;
        float pebbleN = noise(bedUv * 5.0) * 0.6 + noise(bedUv * 10.0) * 0.4;
        vec3 riverbed = mix(vec3(0.56, 0.49, 0.39), vec3(0.34, 0.30, 0.25), pebbleN);

        // Shimmering river caustics dancing on the riverbed
        vec2 cUv = vec2(vUv.x * 4.5, vUv.y * 3.5 - flowSpeed * 0.85);
        float caust = pow(min(noise(cUv * 4.5), noise(cUv * 7.0 + 2.2)) * 2.2, 2.6);
        riverbed += sunColor * caust * 0.55 * (1.0 - smoothstep(0.2, 2.5, channelDepth));

        // Beer-Lambert physical depth absorption (#083244 -> #104e6c -> #38b8e0)
        vec3 extinction = exp(-vec3(0.72, 0.20, 0.05) * channelDepth);
        vec3 waterBody = mix(uDeepWater, uSunWater, extinction.g);
        waterBody = mix(waterBody, uMidWater, smoothstep(0.1, 0.9, 1.0 - channelProfile) * 0.45);
        vec3 waterVolume = mix(waterBody, riverbed * extinction, extinction.r * 0.75);

        vec3 albedo = mix(waterVolume, skyColor, fresnel * 0.88);
        vec3 outgoingLight = albedo + specularLight;

        // Dynamic Bank Froth & Boundary Layer Aeration along rock banks
        float bankDist = abs(vUv.x - 0.5) * 2.0;
        float bankShear = noise(vec2(vUv.x * 22.0, vUv.y * 18.0 - flowSpeed * 1.9));
        float bankWave = sin(vUv.y * 14.0 - flowSpeed * 2.4) * 0.07;
        float bankFoam = smoothstep(0.74, 0.98, bankDist + bankShear * 0.20 + bankWave) * 0.88;

        // Rapid whitewater glints in the fast thalweg current
        float rapidFoam = smoothstep(0.80, 0.98, n1.y * 0.6 + n2.y * 0.4 + bankShear * 0.3) * channelProfile * 0.45;
        float totalFoam = clamp(bankFoam + rapidFoam, 0.0, 1.0);

        vec3 finalColor = mix(outgoingLight, uFoamColor, totalFoam * 0.92);

        // Edge & Endpoint Smooth Dissolve
        float edgeAlpha = 1.0 - smoothstep(0.88, 1.0, bankDist);
        float endAlpha = smoothstep(0.0, 0.03, vUv.y / max(1.0, uLength)) * (1.0 - smoothstep(0.97, 1.0, vUv.y / max(1.0, uLength)));
        float alpha = mix(0.88, 1.0, totalFoam) * edgeAlpha * endAlpha;

        gl_FragColor = vec4(finalColor, alpha);
        #include <logdepthbuf_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader: riverVert,
      fragmentShader: riverFrag,
      uniforms: {
        normalSampler: { value: norm },
        uDeepWater: { value: new THREE.Color(0x083244) },
        uMidWater: { value: new THREE.Color(0x104e6c) },
        uSunWater: { value: new THREE.Color(0x38b8e0) },
        uFoamColor: { value: new THREE.Color(0xf8fcff) },
        waterColor: { value: new THREE.Color(0x083244) },
        uDeepColor: { value: new THREE.Color(0x083244) },
        uGlacierColor: { value: new THREE.Color(0x38b8e0) },
        sunColor: { value: new THREE.Color(0xffeedd) },
        uSunColor: { value: new THREE.Color(0xffeedd) },
        sunDirection: { value: new THREE.Vector3(0.4, 0.8, 0.5).normalize() },
        uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.5).normalize() },
        uTime: { value: 0 },
        uLength: { value: 20.0 },
      },
      transparent: true, logarithmicDepthBuffer: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  _createWaterPoolMaterial(normals) {
    const norm = (normals.normalMap || normals.normal || normals).clone();
    norm.wrapS = norm.wrapT = THREE.RepeatWrapping;

    const vert = `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      #include <fog_pars_vertex>
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vCustomWorldNormal;
      varying vec3 vToEye;

      void main() {
        vUv = uv;
        vec3 transformed = position;
        float r = length(uv - vec2(0.5)) * 2.0;
        
        // Multi-octave concentric impact ripples radiating outward from waterfall plunge
        float ripple1 = sin(r * 36.0 - uTime * 7.5) * (1.0 - smoothstep(0.0, 1.0, r)) * 0.16;
        float ripple2 = cos(r * 58.0 - uTime * 11.8) * (1.0 - smoothstep(0.0, 0.85, r)) * 0.08;
        float ripple3 = sin(r * 92.0 - uTime * 15.5) * (1.0 - smoothstep(0.0, 0.65, r)) * 0.04;
        transformed.z += (ripple1 + ripple2 + ripple3);

        vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
        vWorldPos = worldPos.xyz;
        vCustomWorldNormal = normalize(mat3(modelMatrix) * normal);
        vToEye = cameraPosition - worldPos.xyz;

        gl_Position = projectionMatrix * viewMatrix * worldPos;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }
    `;

    const frag = `
      #include <logdepthbuf_pars_fragment>
      #include <fog_pars_fragment>
      uniform sampler2D normalSampler;
      uniform vec3 uDeepWater;
      uniform vec3 uMidWater;
      uniform vec3 uSunWater;
      uniform vec3 uFoamColor;
      uniform vec3 sunColor;
      uniform vec3 sunDirection;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vCustomWorldNormal;
      varying vec3 vToEye;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      void main() {
        float r = length(vUv - vec2(0.5)) * 2.0;
        
        // Dual animated normal map distortion (counter-propagating radial wave distortion and capillary chop)
        vec2 uvOffset1 = vec2(cos(r * 24.0 - uTime * 4.8), sin(r * 24.0 - uTime * 4.8)) * 0.07;
        vec2 uvOffset2 = vec2(-sin(r * 38.0 + uTime * 3.6), cos(r * 38.0 + uTime * 3.6)) * 0.05;
        vec3 n1 = texture2D(normalSampler, vUv * 8.0 + uvOffset1).rgb * 2.0 - 1.0;
        vec3 n2 = texture2D(normalSampler, vUv * 16.0 + uvOffset2).rgb * 2.0 - 1.0;
        vec3 waveNormal = normalize(n1 * 0.60 + n2 * 0.40);
        vec3 surfaceNormal = normalize(vCustomWorldNormal + waveNormal * 0.38);

        vec3 worldToEye = normalize(vToEye);
        vec3 sunDir = normalize(sunDirection);

        // Exact Dielectric Fresnel for water (IOR 1.333, F0 = 0.0204)
        float cosTheta = clamp(dot(surfaceNormal, worldToEye), 0.0, 1.0);
        float F0 = 0.0204;
        float fresnel = F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);

        // Atmospheric Rayleigh sky radiance gradient
        vec3 reflectDir = reflect(-worldToEye, surfaceNormal);
        float skyGradient = clamp(reflectDir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 skyColor = mix(vec3(0.12, 0.32, 0.55), vec3(0.48, 0.68, 0.88), skyGradient);

        // GGX Specular Sun Glints
        vec3 halfVec = normalize(sunDir + worldToEye);
        float NdotH = max(0.0, dot(surfaceNormal, halfVec));
        float NdotV = max(0.001, dot(surfaceNormal, worldToEye));
        float NdotL = max(0.001, dot(surfaceNormal, sunDir));
        float alphaRoughness = 0.045;
        float alphaSq = alphaRoughness * alphaRoughness;
        float denom = (NdotH * NdotH * (alphaSq - 1.0) + 1.0);
        float D = alphaSq / (3.14159265359 * denom * denom);
        float k = (alphaRoughness + 1.0) * (alphaRoughness + 1.0) / 8.0;
        float G = (NdotV / (NdotV * (1.0 - k) + k)) * (NdotL / (NdotL * (1.0 - k) + k));
        vec3 specularLight = sunColor * ((D * fresnel * G) / (4.0 * NdotV * NdotL + 0.001)) * NdotL * 4.6;

        // Submerged pebble bed & caustics in shallow margins
        float depthFactor = max(0.0, (1.0 - r) * 2.8 + 0.2);
        vec2 bedUv = vWorldPos.xz * 0.45;
        float pebbleN = noise(bedUv * 5.0) * 0.6 + noise(bedUv * 9.0) * 0.4;
        vec3 bedColor = mix(vec3(0.54, 0.48, 0.38), vec3(0.30, 0.27, 0.23), pebbleN);

        // Dancing underwater caustics
        vec2 cUv = vWorldPos.xz * 0.35 + vec2(uTime * 0.04, uTime * 0.02);
        float caust = pow(min(noise(cUv * 5.5), noise(cUv * 8.0 + 1.8)) * 2.2, 2.8);
        bedColor += sunColor * caust * 0.55 * (1.0 - smoothstep(0.2, 3.0, depthFactor));

        // Beer-Lambert physical depth extinction (#083244 -> #104e6c -> #38b8e0)
        vec3 extinction = exp(-vec3(0.68, 0.18, 0.045) * depthFactor);
        vec3 waterBody = mix(uDeepWater, uSunWater, extinction.g);
        waterBody = mix(waterBody, uMidWater, smoothstep(0.15, 0.85, r) * 0.45);
        vec3 waterVolume = mix(waterBody, bedColor * extinction, extinction.r * 0.70);

        vec3 albedo = mix(waterVolume, skyColor, fresnel * 0.88);
        vec3 outgoingLight = albedo + specularLight;

        // Concentric pool impact cavitation foam & frothing rings
        float centerCavitation = (1.0 - smoothstep(0.0, 0.42, r)) * 0.85;
        float expandingWaveFoam = sin(r * 32.0 - uTime * 7.5) * (1.0 - r) * 0.32;
        float nFoam = noise(vUv * 24.0 + vec2(uTime * 0.7, -uTime * 0.5)) * 0.22;
        float totalFoam = clamp(centerCavitation + max(0.0, expandingWaveFoam) + nFoam, 0.0, 1.0);

        vec3 finalColor = mix(outgoingLight, uFoamColor, totalFoam * 0.95);
        float alpha = mix(0.92, 1.0, totalFoam) * (1.0 - smoothstep(0.90, 1.0, r));

        gl_FragColor = vec4(finalColor, alpha);
        #include <logdepthbuf_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        normalSampler: { value: norm },
        uDeepWater: { value: new THREE.Color(0x083244) },
        uMidWater: { value: new THREE.Color(0x104e6c) },
        uSunWater: { value: new THREE.Color(0x38b8e0) },
        uFoamColor: { value: new THREE.Color(0xf8fcff) },
        waterColor: { value: new THREE.Color(0x083244) },
        uDeepColor: { value: new THREE.Color(0x083244) },
        uGlacierColor: { value: new THREE.Color(0x38b8e0) },
        sunColor: { value: new THREE.Color(0xffeedd) },
        uSunColor: { value: new THREE.Color(0xffeedd) },
        sunDirection: { value: new THREE.Vector3(0.4, 0.8, 0.5).normalize() },
        uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.5).normalize() },
        uTime: { value: 0 },
      },
      transparent: true, logarithmicDepthBuffer: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  _createFountainBasinMaterial(normals) {
    const norm = (normals.normalMap || normals.normal || normals).clone();
    norm.wrapS = norm.wrapT = THREE.RepeatWrapping;

    const vert = `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      #include <fog_pars_vertex>
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vCustomWorldNormal;
      varying vec3 vToEye;

      void main() {
        vUv = uv;
        vec3 transformed = position;
        float r = length(uv - vec2(0.5)) * 2.0;
        
        // Dynamic concentric ripples expanding from center fountain plume
        float ripple1 = sin(r * 32.0 - uTime * 6.5) * (1.0 - r * 0.5) * 0.08;
        float ripple2 = cos(r * 54.0 - uTime * 10.0) * (1.0 - r * 0.7) * 0.04;
        transformed.z += (ripple1 + ripple2);

        vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
        vWorldPos = worldPos.xyz;
        vCustomWorldNormal = normalize(mat3(modelMatrix) * normal);
        vToEye = cameraPosition - worldPos.xyz;

        gl_Position = projectionMatrix * viewMatrix * worldPos;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }
    `;

    const frag = `
      #include <logdepthbuf_pars_fragment>
      #include <fog_pars_fragment>
      uniform sampler2D normalSampler;
      uniform vec3 uDeepWater;
      uniform vec3 uMidWater;
      uniform vec3 uSunWater;
      uniform vec3 uFoamColor;
      uniform vec3 sunColor;
      uniform vec3 sunDirection;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      varying vec3 vCustomWorldNormal;
      varying vec3 vToEye;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      void main() {
        float r = length(vUv - vec2(0.5)) * 2.0;
        vec2 rippleUv = vUv * 8.0 + vec2(sin(uTime * 1.5 + r * 12.0), cos(uTime * 1.5 + r * 12.0)) * 0.04;
        vec3 n = texture2D(normalSampler, rippleUv).rgb * 2.0 - 1.0;
        vec3 surfaceNormal = normalize(vCustomWorldNormal + n * 0.35);

        vec3 worldToEye = normalize(vToEye);
        vec3 sunDir = normalize(sunDirection);

        // Dielectric Fresnel for water (IOR 1.333, F0 = 0.0204)
        float cosTheta = clamp(dot(surfaceNormal, worldToEye), 0.0, 1.0);
        float F0 = 0.0204;
        float fresnel = F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);

        vec3 reflectDir = reflect(-worldToEye, surfaceNormal);
        float skyGradient = clamp(reflectDir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 skyColor = mix(vec3(0.12, 0.32, 0.55), vec3(0.48, 0.68, 0.88), skyGradient);

        // GGX Specular Sun Highlights
        vec3 halfVec = normalize(sunDir + worldToEye);
        float NdotH = max(0.0, dot(surfaceNormal, halfVec));
        float NdotV = max(0.001, dot(surfaceNormal, worldToEye));
        float NdotL = max(0.001, dot(surfaceNormal, sunDir));
        float alphaRoughness = 0.045;
        float alphaSq = alphaRoughness * alphaRoughness;
        float denom = (NdotH * NdotH * (alphaSq - 1.0) + 1.0);
        float D = alphaSq / (3.14159265359 * denom * denom);
        float k = (alphaRoughness + 1.0) * (alphaRoughness + 1.0) / 8.0;
        float G = (NdotV / (NdotV * (1.0 - k) + k)) * (NdotL / (NdotL * (1.0 - k) + k));
        vec3 specularLight = sunColor * ((D * fresnel * G) / (4.0 * NdotV * NdotL + 0.001)) * NdotL * 4.2;

        // Beer-Lambert Depth Gradient (#083244 -> #104e6c -> #38b8e0)
        float depthFactor = (1.0 - r) * 1.5;
        vec3 extinction = exp(-vec3(0.65, 0.22, 0.07) * max(0.0, depthFactor));
        vec3 baseWater = mix(uDeepWater, uSunWater, extinction.g);
        baseWater = mix(baseWater, uMidWater, smoothstep(0.1, 0.9, r) * 0.45);

        vec3 albedo = mix(baseWater, skyColor, fresnel * 0.88);
        vec3 outgoingLight = albedo + specularLight;

        // Center plume and edge froth
        float centerFoam = (1.0 - smoothstep(0.0, 0.28, r)) * 0.55;
        float edgeFoam = smoothstep(0.86, 0.98, r) * 0.45;
        float totalFoam = clamp(centerFoam + edgeFoam, 0.0, 1.0);

        vec3 finalColor = mix(outgoingLight, uFoamColor, totalFoam);
        float alpha = mix(0.96, 1.0, totalFoam) * (1.0 - smoothstep(0.94, 1.0, r));

        gl_FragColor = vec4(finalColor, alpha);
        #include <logdepthbuf_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `;

    return new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        normalSampler: { value: norm },
        uDeepWater: { value: new THREE.Color(0x083244) },
        uMidWater: { value: new THREE.Color(0x104e6c) },
        uSunWater: { value: new THREE.Color(0x38b8e0) },
        uFoamColor: { value: new THREE.Color(0xf8fcff) },
        waterColor: { value: new THREE.Color(0x083244) },
        sunColor: { value: new THREE.Color(0xffeedd) },
        uSunColor: { value: new THREE.Color(0xffeedd) },
        sunDirection: { value: new THREE.Vector3(0.4, 0.8, 0.5).normalize() },
        uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.5).normalize() },
        uTime: { value: 0 },
      },
      transparent: true, logarithmicDepthBuffer: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  _createFountainCascadeMaterial(normals) {
    const cascadeShader = {
      transparent: true, logarithmicDepthBuffer: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uDeepWater: { value: new THREE.Color(0x083244) },
        uMidWater: { value: new THREE.Color(0x104e6c) },
        uSunWater: { value: new THREE.Color(0x38b8e0) },
        uFoamColor: { value: new THREE.Color(0xf8fcff) },
        uDeepColor: { value: new THREE.Color(0x083244) },
        uGlacierColor: { value: new THREE.Color(0x38b8e0) },
        uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.5).normalize() },
        uSunColor: { value: new THREE.Color(0xffeedd) },
      },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        #include <fog_pars_vertex>
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vCustomWorldPosition;
        uniform float uTime;
        void main() {
          vUv = uv;
          vec3 transformed = position;
          // Turbulent cascade shudder
          float shudder = sin(position.y * 8.0 - uTime * 14.0) * 0.04;
          transformed.x += normal.x * shudder;
          transformed.z += normal.z * shudder;
          vNormal = normalize(normalMatrix * normal);
          vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
          vCustomWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
                  #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        #include <fog_pars_fragment>
        uniform float uTime;
        uniform vec3 uDeepWater;
        uniform vec3 uMidWater;
        uniform vec3 uSunWater;
        uniform vec3 uFoamColor;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vCustomWorldPosition;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }

        void main() {
          // Rapid downward animated cascade streaks
          float flowY = vUv.y * 6.5 + uTime * 8.5;
          float flowX = vUv.x * 36.0;
          float n1 = noise(vec2(flowX, flowY));
          float n2 = noise(vec2(flowX * 2.2, flowY * 1.9 + 18.0));
          
          float streak = pow(n1 * 0.65 + n2 * 0.35, 1.25);
          float foam = smoothstep(0.45, 0.82, streak);
          
          // Dielectric Fresnel for water (F0 = 0.0204)
          vec3 viewDir = normalize(cameraPosition - vCustomWorldPosition + vec3(0.0001));
          float cosTheta = clamp(dot(vNormal, viewDir), 0.0, 1.0);
          float fresnel = 0.0204 + (1.0 - 0.0204) * pow(1.0 - cosTheta, 5.0);

          // GGX Specular Sun Glint
          vec3 sunDir = normalize(uSunDir);
          vec3 halfVec = normalize(sunDir + viewDir);
          float NdotH = max(0.0, dot(vNormal, halfVec));
          float spec = pow(NdotH, 48.0) * 1.8;

          vec3 baseWater = mix(uDeepWater, uSunWater, 0.70);
          vec3 waterCol = mix(baseWater, uFoamColor, foam * 0.60);
          waterCol += fresnel * vec3(0.35, 0.65, 0.85) * 0.45;
          waterCol += uSunColor * spec;
          
          float alpha = mix(0.48, 0.92, streak) * smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.92, 1.0, vUv.y));

          gl_FragColor = vec4(waterCol, alpha);
                  #include <logdepthbuf_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
    };
    return new THREE.ShaderMaterial(cascadeShader);
  }

  _riverLanterns3D() {
    this._lanterns = [];
    const lanternMat = new THREE.MeshPhysicalMaterial({
      color: 0xffe6a8,
      emissive: new THREE.Color(0xff9924),
      emissiveIntensity: 1.8,
      roughness: 0.28,
      metalness: 0.05,
    });
    this._lanternMat = lanternMat;
    const geo = new THREE.CylinderGeometry(1.6, 1.2, 1.6, 6);

    const N = 36;
    const instMesh = new THREE.InstancedMesh(geo, lanternMat, N);
    instMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.world.scene.add(instMesh);

    for (let i = 0; i < N; i++) {
      const isOutlet = i >= 12; // 12 along inlet (waterfall -> lake), 24 along outlet (lake -> under bridge -> ocean)
      const progress = isOutlet ? (i - 12) / 24 : i / 12;
      const dummy = new THREE.Object3D();
      dummy.userData = { isOutlet, progress, speed: 0.008 + (i % 5) * 0.002, bobPhase: i * 0.7 };
      
      const origSet = dummy.position.set.bind(dummy.position);
      dummy.position.set = (x, y, z) => {
        origSet(x, y, z);
        dummy.updateMatrix();
        instMesh.setMatrixAt(i, dummy.matrix);
        instMesh.instanceMatrix.needsUpdate = true;
      };

      let rotY = 0;
      Object.defineProperty(dummy.rotation, 'y', {
        get: () => rotY,
        set: (val) => {
          rotY = val;
          dummy.rotation.set(dummy.rotation.x, val, dummy.rotation.z);
          dummy.updateMatrix();
          instMesh.setMatrixAt(i, dummy.matrix);
          instMesh.instanceMatrix.needsUpdate = true;
        }
      });
      
      this._lanterns.push(dummy);
    }
  }

  async _generateProceduralPlots() {
    let lastY = performance.now(); const yieldMain = () => { if (performance.now() - lastY > 16) { lastY = performance.now(); return new Promise(r => setTimeout(r, 0)); } else return Promise.resolve(); };
    
    if (!this.world.plots) this.world.plots = [];
    const existingPlotIds = new Set(this.world.plots.map(p => p.id));
    let newPlotsCount = 0;

    const addPlot = (id, x, z, rot, type, name, size = 'standard', tier = 1) => {
      if (!existingPlotIds.has(id)) {
        this.world.plots.push({
          id, x, z, rot, type, name, size, tier, status: 'available',
          h: terrainHeight(x, z)
        });
        existingPlotIds.add(id);
        newPlotsCount++;
        return true;
      }
      return false;
    };

    const isClear = (x, z, r = 14) => {
      if (distToRoads(x, z) < r + 4) return false;
      if (distToRiver(x, z) < r + 2) return false;
      if (Math.hypot(x - WORLD.lake.x, z - WORLD.lake.z) < WORLD.lake.r + r + 4) return false;
      const h = terrainHeight(x, z);
      if (h > 120) return false;
      
      for (const p of this.world.plots) {
        if (Math.hypot(x - p.x, z - p.z) < r + 4) return false;
      }
      return true;
    };

    // 1. Forest Plots
    let forestCount = 0;
    for (let r = 300; r < 1400; r += 24) {
      await yieldMain();
      const circum = 2 * Math.PI * r;
      const steps = Math.floor(circum / 24);
      for (let i = 0; i < steps; i++) {
        const ang = (i / steps) * Math.PI * 2;
        const x = Math.cos(ang) * r;
        const z = Math.sin(ang) * r;
        
        const n1 = fbm(x * 0.003, z * 0.003, 3);
        const n2 = fbm(x * 0.015, z * 0.015, 2);
        const density = (n1 * 0.7 + n2 * 0.3);
        if (density > 0.1 && isClear(x, z) && terrainHeight(x, z) > 3) {
           addPlot(`FOREST_${forestCount}`, x, z, ang, 'forest', `Forest Glade ${forestCount}`, 'standard', 1);
           forestCount++;
        }
      }
    }

    // 2. Underwater Plots
    let uwCount = 0;
    for (let x = -800; x < 800; x += 36) {
      await yieldMain();
      for (let z = -800; z < 800; z += 36) {
        const h = terrainHeight(x, z);
        if (h < -2 && isClear(x, z)) {
           addPlot(`UNDERWATER_${uwCount}`, x, z, 0, 'underwater', `Abyssal Plot ${uwCount}`, 'premium', 2);
           uwCount++;
        }
      }
    }

    // 3. Kaya Island Plots
    let kayaCount = 0;
    const kx = 20, kz = 2100;
    for (let r = 30; r < 150; r += 16) {
      const circum = 2 * Math.PI * r;
      const steps = Math.floor(circum / 16);
      for (let i = 0; i < steps; i++) {
        const ang = (i / steps) * Math.PI * 2;
        const px = kx + Math.cos(ang) * r;
        const pz = kz + Math.sin(ang) * r;
        if (terrainHeight(px, pz) > 0 && isClear(px, pz)) {
           addPlot(`KAYA_${kayaCount}`, px, pz, ang, 'kaya', `Kaya Island ${kayaCount}`, 'estate', 3);
           kayaCount++;
        }
      }
    }

    // 4. Photorealistic Memorial Markers
    const gsPos = [];
    let gsAdded = 0;
    
    // Distribute elegantly in clusters across the valley
    const centers = [
      { cx: 650, cz: -650, name: 'East Meadow' },
      { cx: -550, cz: -150, name: 'West Valley' },
      { cx: 350, cz: 900, name: 'South Garden' },
      { cx: -400, cz: -1000, name: 'North Highlands' }
    ];
    
    for (const center of centers) {
      for (let r = 20; r < 350; r += 16) {
        await yieldMain();
        const steps = Math.floor((2 * Math.PI * r) / 14);
        for (let i = 0; i < steps; i++) {
          const ang = (i / steps) * Math.PI * 2 + (Math.random() * 0.5);
          const px = center.cx + Math.cos(ang) * r;
          const pz = center.cz + Math.sin(ang) * r;
          
          // Organic noise masking to create natural clearings and clusters
          if (fbm(px * 0.008, pz * 0.008, 2) > 0.45) {
            if (isClear(px, pz)) {
              const id = `MEMORIAL_${gsAdded}`;
              const isNew = !existingPlotIds.has(id);
              if (isNew) {
                addPlot(id, px, pz, ang + Math.PI, 'cemetery', `${center.name} Memorial ${gsAdded}`, 'standard', 1);
              }
              gsPos.push({x: px, z: pz, rot: ang + Math.PI});
              gsAdded++;
            }
          }
        }
      }
    }

    // Generate photorealistic procedural gravestone meshes
    if (gsPos.length > 0) {
      await yieldMain();
      // Beautiful arched headstone with smooth bevels
      const shape = new THREE.Shape();
      const w = 0.45, h = 1.4, d = 0.2;
      shape.moveTo(-w, 0);
      shape.lineTo(w, 0);
      shape.lineTo(w, h - w);
      shape.absarc(0, h - w, w, 0, Math.PI, false);
      
      const extrudeSettings = {
        depth: d,
        bevelEnabled: true,
        bevelSegments: 6,
        steps: 1,
        bevelSize: 0.03,
        bevelThickness: 0.03,
      };
      const mainStone = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      mainStone.translate(0, 0, -d/2);
      
      // Plinth base
      const plinthShape = new THREE.Shape();
      plinthShape.moveTo(-w - 0.12, -d/2 - 0.12);
      plinthShape.lineTo(w + 0.12, -d/2 - 0.12);
      plinthShape.lineTo(w + 0.12, d/2 + 0.12);
      plinthShape.lineTo(-w - 0.12, d/2 + 0.12);
      
      const plinthExtrude = {
        depth: 0.15,
        bevelEnabled: true,
        bevelSegments: 4,
        steps: 1,
        bevelSize: 0.02,
        bevelThickness: 0.02,
      };
      const plinthGeo = new THREE.ExtrudeGeometry(plinthShape, plinthExtrude);
      plinthGeo.rotateX(Math.PI / 2); // Lay flat
      plinthGeo.translate(0, 0.075, 0);
      
      const mergedGeo = safeMerge([mainStone, plinthGeo]);
      applyOrganicWeathering(mergedGeo, 0.5, 0.02, 12);
      bakeVertexCreviceOcclusion(mergedGeo, 0, 0.5);

      const isHigh = typeof window !== 'undefined' && window.innerWidth > 768 ? 1024 : 512;
      const rockTex = textures('photogrammetryRock', isHigh);
      
      const gsMat = new THREE.MeshStandardMaterial({
        color: 0xd0d4d8,
        roughness: 0.75,
        metalness: 0.05,
        map: rockTex.map,
        normalMap: rockTex.normalMap,
        roughnessMap: rockTex.roughnessMap,
        vertexColors: true
      });
      
      const gsMesh = new THREE.InstancedMesh(mergedGeo, gsMat, gsPos.length);
      const tmp = new THREE.Object3D();
      for (let i = 0; i < gsPos.length; i++) {
        if (i % 500 === 0) await yieldMain();
        const p = gsPos[i];
        const offset = -4.5; // Place headstone elegantly near the back edge of plot
        const gx = p.x + Math.sin(p.rot) * offset;
        const gz = p.z + Math.cos(p.rot) * offset;
        const gh = terrainHeight(gx, gz);
        
        tmp.position.set(gx, gh, gz);
        tmp.rotation.set(0, p.rot, 0);
        
        // Add subtle tilt/variation to make them organic and weathered
        tmp.rotation.x = (Math.random() - 0.5) * 0.08;
        tmp.rotation.z = (Math.random() - 0.5) * 0.06;
        tmp.scale.setScalar(0.9 + Math.random() * 0.2);
        
        tmp.updateMatrix();
        gsMesh.setMatrixAt(i, tmp.matrix);
      }
      gsMesh.instanceMatrix.needsUpdate = true;
      gsMesh.castShadow = true;
      gsMesh.receiveShadow = true;
      this.world.scene.add(gsMesh); console.log("[world3d] gsMesh added to scene");
      if (!this._decorMeshes) this._decorMeshes = [];
      this._decorMeshes.push(gsMesh);
    }

    // 5. On/in other buildings (Mosque and Pagoda)
    const buildings = [
      { idPrefix: 'MOSQUE', x: WORLD.mosque.x, z: WORLD.mosque.z, r: 80, name: 'Mosque Courtyard' },
      { idPrefix: 'PAGODA', x: WORLD.buddhistTemple.x, z: WORLD.buddhistTemple.z, r: 80, name: 'Pagoda Gardens' }
    ];
    
    buildings.forEach(b => {
      let bCount = 0;
      for (let r = 40; r < b.r; r += 16) {
        const steps = Math.floor((2 * Math.PI * r) / 16);
        for (let i = 0; i < steps; i++) {
          const ang = (i / steps) * Math.PI * 2;
          const px = b.x + Math.cos(ang) * r;
          const pz = b.z + Math.sin(ang) * r;
          if (isClear(px, pz)) {
            addPlot(`${b.idPrefix}_${bCount}`, px, pz, ang, b.idPrefix.toLowerCase(), `${b.name} ${bCount}`, 'estate', 3);
            bCount++;
          }
        }
      }
    });

    if (newPlotsCount > 0) {
      console.log(`[WorldTerrain] Generated ${newPlotsCount} procedural plots.`);
    }
  }

  _river() {
    this._riverMaterials = [];
    const buildRiverRibbon = (riverPoints, baseWidth = 46, widthVar = 8, uvScale = 16) => {
      const pts = riverPoints.map(([x, z, waterY]) => new V3(x, waterY, z));
      const curve = new THREE.CatmullRomCurve3(pts);
      const divisions = 240, positions = [], indices = [], uvs = [], up = new V3(0, 1, 0);
      for (let i = 0; i <= divisions; i++) {
        const t = i / divisions;
        const p = curve.getPoint(t);
        const tan = curve.getTangent(t);
        const width = baseWidth + Math.sin(t * Math.PI * 3) * widthVar;
        const side = new V3().crossVectors(tan, up).normalize().multiplyScalar(width * 0.5);
        const a = p.clone().add(side), b = p.clone().sub(side);
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        uvs.push(0, t * uvScale, 1, t * uvScale);
        if (i > 0) {
          const k = i * 2;
          indices.push(k - 2, k, k - 1, k - 1, k, k + 1);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(indices);
      g.computeVertexNormals();

      const mat = this.riverMat.clone();
      if (mat.uniforms) mat.uniforms.uLength = { value: uvScale };
      this._riverMaterials.push(mat);

      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      m.renderOrder = 1;
      this.world.scene.add(m);
      return curve;
    };

    // Build both river branches with continuous, physical water flow
    this._riverInletCurve = buildRiverRibbon(RIVER_INLET, 22, 3.5, 16);
    this._riverOutletCurve = buildRiverRibbon(RIVER_OUTLET, 44, 6.0, 22);
  }

  openGate() {
    this._forceGateOpen = true;
  }

  closeGate() {
    this._forceGateOpen = false;
  }

  async rebuildPlots() {
    // Called after a purchase/customization: rebuild plot & decor meshes
    for (let i = this.world.pickables.length - 1; i >= 0; i--) {
      const m = this.world.pickables[i];
      if (this.world.plotMeshIndex.has(m) && m.isInstancedMesh) {
        this.world.scene.remove(m);
        m.geometry?.dispose();
        m.material?.dispose();
        this.world.pickables.splice(i, 1);
        this.world.plotMeshIndex.delete(m);
      }
    }
    for (const m of this._decorMeshes || []) {
      this.world.scene.remove(m);
      m.geometry?.dispose();
      if (m.material) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach(mat => mat.dispose());
      }
    }
    this._decorMeshes = [];
    this.world.scene.remove(this.world.selRing);
    console.log("[World3D] calling _generateProceduralPlots()..."); await this._generateProceduralPlots();
    console.log("[World3D] calling _plots()..."); await this.world._plots(); console.log("[World3D] _plots() done");
  }

}
