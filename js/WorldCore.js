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
        let cloned = false;
        
        // Check if we need to clone to avoid modifying shared original geometries
        const needsToNonIndexed = anyIndexed && anyNonIndexed && g.index;
        const needsMod = (anyNormal && !g.attributes.normal) || 
                         (anyUv && !g.attributes.uv) || 
                         (anyColor && !g.attributes.color) || 
                         (!anyColor && g.attributes.color);
                         
        if (needsToNonIndexed) {
            out = g.toNonIndexed();
            cloned = true;
        } else if (needsMod) {
            out = g.clone();
            cloned = true;
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
        // Clean up any temporary geometries created during normalization
        normalized.forEach((geom, i) => {
            if (geom !== validGeos[i]) geom.dispose();
        });
        if (merged) {
            validGeos.forEach(g => g.dispose());
        }
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
let _sharedShadowGeo = null;
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
    _sharedShadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  }
  if (!_sharedShadowGeo) {
    _sharedShadowGeo = new THREE.PlaneGeometry(1, 1);
  }
  const mesh = new THREE.Mesh(_sharedShadowGeo, _sharedShadowMat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = yPos;
  mesh.scale.set(radius * 2, radius * 2, 1);
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

import { WorldAssetLoader } from './WorldAssetLoader.js?v=9';
import { WorldLighting } from './WorldLighting.js?v=9';
import { WorldTerrain } from './WorldTerrain.js?v=9';
import { WorldTourController } from './WorldTourController.js?v=9';

export class World3DCore {
  constructor(canvas, plots = [], onPlotClick) {
    this.canvas = canvas || (typeof document !== 'undefined' ? (document.getElementById('canvas3d') || document.querySelector('canvas#canvas3d') || document.createElement('canvas')) : null);
    this.plots = (plots || []).map(p => ({ ...p, h: terrainHeight(p.x, p.z) }));
    this.onPlotClick = onPlotClick;
    this.clock = new THREE.Clock();
    this.assetLoader = new WorldAssetLoader(this);
    this.lighting = new WorldLighting(this);
    this.terrain = new WorldTerrain(this);
    this.tourController = new WorldTourController(this);
    this.pickables = [];
    this.plotMeshIndex = new Map(); // instancedMesh -> plot[]
    this._flyTween = null;
    this._v3TourPos = new THREE.Vector3();
    this._v3TourTan = new THREE.Vector3();
    this._v3TourLook = new THREE.Vector3();
    this._v3TourTarget = new THREE.Vector3();
    this._tourCamPos = new THREE.Vector3();
    this._currentLook = new THREE.Vector3();
    this._tmpV3 = new THREE.Vector3();
    this._v3Tmp1 = new THREE.Vector3();
    this._v3Tmp2 = new THREE.Vector3();
    this._v3Tmp3 = new THREE.Vector3();
    this._v3Tmp4 = new THREE.Vector3();
    this._v3WorldUp = new THREE.Vector3(0, 1, 0);
    this._v3Temp1 = _v3Temp1;
    this._v3Temp2 = _v3Temp2;
    this._v3Temp3 = _v3Temp3;
    this._v3Temp4 = _v3Temp4;
    this._colTemp = _colTemp;
    this._colTemp2 = _colTemp2;
    this._quatTemp = _quatTemp;
    this._mat4Temp = _mat4Temp;
    this._currentRoll = 0.0;
    this._tourSpeed = 1.0;
    this._tourPaused = false;
    this._tourSpeedMultiplier = 1.0;
    this._activeStageIndex = 0;
    this._joystickInput = new THREE.Vector2(0, 0);
    this._origFogColor = new THREE.Color(0x90b8d8);
    this._origBgColor = new THREE.Color(0x90b8d8);
    this._origFogDensity = 0.000065;
    this._origFogNear = 1200;
    this._origFogFar = 18000;
    this._isUnderwaterState = false;
    this._underwaterBlend = 0.0;
    this._underwaterTargetFog = new THREE.Color(0x38b8e0);
    this._underwaterTargetBg = new THREE.Color(0x247898);
    this._currentFogColor = new THREE.Color(0x90b8d8);
    this._currentBgColor = new THREE.Color(0x90b8d8);
    this._fpsBuffer = new Float32Array(120);
    this._fpsHead = 0;
    this._fpsCount = 0;
    this._lastFpsTime = 0;
    this._lastFpsHudUpdate = 0;
    this._fpsPill = null;
    this._fpsTextEl = null;
    this._renderScale = 1.0;
    this._qualityTier = localStorage.getItem('ev_quality') || 'auto';
    this._qualityLocked = this._qualityTier !== 'auto';
    if (!this._qualityLocked) this._qualityTier = 'high'; // Default assumption for benchmark
    this._benchFrames = 0;
    this._benchTime = 0;
    this._lastScaleChange = 0;
    this._init();
  }

  _init() {
    const isMobileDevice = typeof window !== 'undefined' && (/Mobi|Android/i.test(navigator.userAgent) || window.innerWidth <= 768);
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !isMobileDevice,  // Skip MSAA on mobile — saves massive fillrate
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
      logarithmicDepthBuffer: true, // Enables precise depth buffer across 0.1m - 50,000m scene
    });
    renderer.autoClear = true;
    // High-performance 1.0x max pixel ratio — prevents high-DPI Retina thermal throttling
    // while keeping WebGL rendering at razor-sharp 60 FPS.
    const maxDpr = 1.0;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr));
    renderer.shadowMap.enabled = !isMobileDevice;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    // Photorealistic vegetation anti-aliasing
    const gl = renderer.getContext();
    if (gl && gl.enable && gl.SAMPLE_ALPHA_TO_COVERAGE) {
      gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    }
    
    this.renderer = renderer;
    this.lighting.useComposer = false;
    if (typeof window !== 'undefined') window.__rbvWorld = this;

    const scene = new THREE.Scene();
    // Atmospheric aerial perspective exponential fog — valley interior (0-2200m) crystal clear with deep contrast, distant mountains razor-sharp and dissolving naturally into Rayleigh sky haze
    scene.fog = new THREE.FogExp2(0x90b8d8, 0.000065);
    this.scene = scene; console.log("[World3D] scene created");

    const cam = new THREE.PerspectiveCamera(35, 1, 2.0, 7500.0);
    cam.position.set(0, 85.0, 1280);
    cam.lookAt(0, 36.0, 800);
    cam.updateProjectionMatrix();
    this.camera = cam; console.log("[World3D] camera created");

    const controls = new OrbitControls(cam, this.canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minPolarAngle = Math.PI * 0.02; // Enables looking high up at soaring arch & eternal braziers
    controls.maxPolarAngle = Math.PI * 0.490; // Prevents dipping below terrain horizon while allowing ground-level hero angles
    controls.minDistance = 20;
    controls.maxDistance = 2800;
    controls.target.set(0, 36.0, 600);
    controls.update();
    this.controls = controls;

    this.season = getSeason();
    this.lighting.mood = 'clear';
    this.lighting._forcedPhase = { key: 'day', t: 0.5 };
    this._reflectiveMeshes = [];
    this._windMaterials = [];
    this._glowTex = this.assetLoader._buildGlowTexture();
    this._fpsFrames = [];
    this._lastFpsHudUpdate = 0;
    this._lastFpsTime = 0;
    
    // Core synchronous setup
    this.lighting._lights();
    this.lighting._sky();
    this.lighting._stars();
    this.lighting._horizon();
    this.lighting._cloudScape();
    this.assetLoader._loadHDRI();
    // _terrain moved to initAsync to prevent blocking the preloader

    this._ambienceTimer = setInterval(() => this.lighting.applyAmbience(), 60000);
    fetchWeather().then(w => { this.lighting.mood = w.mood; this.lighting.applyAmbience(); this.onAmbience?.(w, this.season); }).catch(e => console.log('[world3d] fetchWeather failed:', e));

    let resizeTimer; this._resizeHandler = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => this._resize(), 100); };
    if (typeof window !== 'undefined') window.addEventListener('resize', this._resizeHandler);

    this._resize();
    this._running = true;
    this._animate();
  }

  async initAsync() {
    let lastY = performance.now(); const yieldMain = () => { if (performance.now() - lastY > 16) { lastY = performance.now(); return new Promise(r => setTimeout(r, 0)); } else return Promise.resolve(); };
    const safe = async (name, fn) => {
      console.log('[world3d] initAsync start', name);
      const t0 = performance.now();
      const prevChildrenCount = this.scene.children.length;
      try {
        await yieldMain();
        if (this._disposed) return;
        await fn();
        // Step 6: Name the scene groups automatically
        for (let i = prevChildrenCount; i < this.scene.children.length; i++) {
          const c = this.scene.children[i];
          if (!c.name && c.isGroup) c.name = name;
        }
      } catch (e) {
        console.warn('[world3d]', name, 'skipped', e);
      } finally {
        console.log('[world3d] initAsync done', name, Math.round(performance.now()-t0)+'ms');
      }
    };

    const progress = (pct) => { if (window.__setRainbowProgress) window.__setRainbowProgress(pct); };
    
    await safe('terrain', () => this.terrain._terrain());
    progress(55);
    await safe('backgroundMountains', () => this._backgroundMountains());
    progress(58);
    await safe('water', () => this.terrain._water());
    progress(62);
    await safe('river', () => this.terrain._river());
    await safe('mountainWaterfall', () => this.terrain._mountainWaterfall());
    await safe('oceanWaterfall', () => this.terrain._oceanWaterfall());
    progress(66);
    await safe('coastalCliff', () => this.terrain._coastalCliff());
    await safe('highlandSanctuary', () => this.terrain._highlandSanctuary());
    await safe('godRays', () => this.lighting._godRays());
    progress(70);
    await safe('roads', () => this.terrain._roads());
    await safe('gate', () => this.terrain._gate());
    await safe('plaza', () => this.terrain._plaza());
    await safe('rainbowBridge', () => this.terrain._rainbowBridge());
    progress(75);
    
    await safe('pawprints', () => this.terrain._pawprints());
    await safe('vegetation', () => this.terrain._vegetation());
    progress(80);
    await safe('meadowCarpet', () => this.terrain._meadowCarpet());
    await safe('blooms', () => this.terrain._blooms());
    await safe('districtFeatures', () => this.terrain._districtFeatures());
    await safe('sanctuaryTree', () => this.terrain._sanctuaryTree());
    progress(85);
    
    await safe('riverLanterns', () => this.terrain._riverLanterns3D());
    await safe('celestialMotes', () => this.terrain._celestialMotes());
    await safe('plots', () => this._plots());
    progress(88);
    
    // Expensive architectural/monument builders moved to end
    await safe('underwaterWorld', () => this.terrain._underwaterWorld());
    await safe('universalCathedral', () => this.terrain._universalCathedral());
    await safe('moorishMosque', () => this.terrain._moorishMosque());
    await safe('buddhistPagoda', () => this.terrain._buddhistPagoda());
    await safe('kayaIsland', () => this.terrain._kayaIsland());
    progress(92);
    
    await safe('picking', () => this._picking());
    await safe('composer', () => this.lighting._composer());
    await safe('initAmbienceControls', () => this._initAmbienceControls());
    await safe('setupWalkControls', () => this.tourController._setupWalkControls());
    await safe('initWalkHUD', () => this.tourController._initWalkHUD());
    await safe('initFPSHUD', () => this.tourController._initFPSHUD());
    progress(95);
    
    if (this._disposed) return;

    this.lighting.applyAmbience();

    this._resize();
    this._running = true;
    
    // ---------------- GPU ENFORCEMENT PASS ----------------
    this.scene.traverse((obj) => {
      if (obj.isInstancedMesh) {
        obj.frustumCulled = true;
        if (!obj.boundingSphere && typeof obj.computeBoundingSphere === 'function') {
          obj.computeBoundingSphere();
        }
        if (!obj.boundingBox && typeof obj.computeBoundingBox === 'function') {
          obj.computeBoundingBox();
        }
        if (obj.material && this.lighting.csm) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => this.lighting.csm.setupMaterial(m));
        }
      } else if (obj.isMesh) {
        // 1. Terrain & Water Meshes: Ensure frustum culling (exclude sky/stars)
        if (obj !== this.lighting.stars && obj !== this.lighting.sky && obj !== this.lighting._envSky) {
          obj.frustumCulled = true;
        }
        // 2. Shadow Optimization: Disable cast shadows on transparent/foliage meshes
        if (obj.material) {
          const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
          const isFoliage = mat.transparent || (mat.alphaTest && mat.alphaTest > 0);
          if (isFoliage) {
            obj.castShadow = false;
          }
          
          if (this.lighting.csm && obj !== this.lighting.sky && obj !== this.lighting._envSky && obj !== this.lighting.stars) {
              const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
              mats.forEach(m => this.lighting.csm.setupMaterial(m));
          }
        }
      }
    });

    // Keep active camera mode if tour or walk was already requested
    if (!this.tourController.tourMode && !this.tourController.walkMode) {
      this.tourController.setMode('tour');
    }
    await this.warmup();
    this._optimizeScene();
    console.log('[world3d] initAsync complete');
    if (this.renderer.shadowMap) this.renderer.shadowMap.needsUpdate = true;
  }

  start() {
    this._running = true;
    if (this.clock && !this.clock.running) this.clock.start();
    this._resize();
    if (!this._raf) {
      this._raf = requestAnimationFrame(() => this._animate());
    }
  }

  stop() {
    this._running = false;
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  }

  animate() {
    this._animate();
  }

  resize() {
    this._resize();
  }

  async warmup() {
    if (!this.renderer || !this.scene || !this.camera) return;
    try {
      this.assetLoader._loadHDRI();
      this.lighting._updateEnvironment();
      if (typeof this.renderer.compileAsync === 'function') {
        await this.renderer.compileAsync(this.scene, this.camera);
      } else if (typeof this.renderer.compile === 'function') {
        this.renderer.compile(this.scene, this.camera);
      }
      // Pre-warm composer passes so there is zero initial frame drop
      if (this.lighting.useComposer && this.lighting.composer) {
        this.lighting.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    } catch (e) {
      console.log('[world3d] warmup error:', e);
    }
  }

  _resize() {
    const w = this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || window.innerHeight;
    if (w < 100 || h < 100) return;         // hidden view — keep the last good size
    
    const isMobileDevice = typeof window !== 'undefined' && (/Mobi|Android/i.test(navigator.userAgent) || window.innerWidth <= 768);
    const maxDpr = 1.0;
    const targetDpr = Math.min(window.devicePixelRatio || 1, maxDpr) * this._renderScale;
    this.renderer.setPixelRatio(targetDpr);
    this.renderer.setSize(w, h, true);
    
    let allowPost = (this._qualityTier === 'high' || this._qualityTier === 'ultra');
    if (isMobileDevice) allowPost = false; // Disable UnrealBloomPass & PostProcessing on Mobile to save massive fillrate
    if (allowPost && !this.lighting.composer) {
       this.lighting._composer();
    }
    if (this.lighting && this.lighting.composer) {
       this.lighting.composer.setSize(w, h);
       if (this.lighting.composer.setPixelRatio) this.lighting.composer.setPixelRatio(targetDpr);
    }
    this.lighting.useComposer = allowPost && !!this.lighting.composer;

    if (this.lighting.composer) {
      this.lighting.composer.setPixelRatio(targetDpr);
      this.lighting.composer.setSize(w, h);
      if (this.lighting.bloomPass) this.lighting.bloomPass.setSize(Math.ceil(w / 2), Math.ceil(h / 2));
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.lighting._cinematicPass?.uniforms?.uResolution) {
      this.lighting._cinematicPass.uniforms.uResolution.value.set(w, h);
    }
  }

  async _backgroundMountains() {
    // Majestic outer ring of towering, jagged snow-capped alpine peaks (Matterhorn / Swiss Alps / Grand Tetons scale)
    // Situated between radius R = 2200m and 5300m, rising to elevations of y = 650m - 1450m
    const RING_INNER = 2200, RING_OUTER = 5300;
    const SEG_THETA = 256, SEG_RADIAL = 96;
    const ringGeo = new THREE.RingGeometry(RING_INNER, RING_OUTER, SEG_THETA, SEG_RADIAL);
    ringGeo.rotateX(-Math.PI / 2);

    const pos = ringGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const normals = new Float32Array(pos.count * 3);
    const creviceAOs = new Float32Array(pos.count);
    const c = new THREE.Color();

    // Palette tokens for distant alpine massif (Swiss Alps / Grand Teton summer reference)
    const rockDarkGranite  = new THREE.Color(0x565e68); // Weathered slate grey granite bedrock (#565e68)
    const rockGraniteCrest = new THREE.Color(0x6e7682); // Sunlit granite crest (#6e7682)
    const rockScreeTalus   = new THREE.Color(0x766e62); // Scree and talus slopes (warm alpine moraine soil #766e62)
    const forestConifer    = new THREE.Color(0x22361e); // Subalpine forest belt (deep rich conifer green #22361e)
    const glacialIceCore   = new THREE.Color(0x78a8cc); // Glacial ice-blue shadow tone (#78a8cc)
    const alpineSnowPeak   = new THREE.Color(0xdce6f0); // Soft glacial firn snow (#dce6f0)

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = backgroundMountainElevation(x, z);
      pos.setY(i, h);

      // Central difference analytical normal calculation
      const eps = 4.0;
      const hN = backgroundMountainElevation(x, z - eps);
      const hS = backgroundMountainElevation(x, z + eps);
      const hW = backgroundMountainElevation(x - eps, z);
      const hE = backgroundMountainElevation(x + eps, z);
      const nx = (hW - hE) / (2.0 * eps);
      const nz = (hN - hS) / (2.0 * eps);
      const ny = 1.0;
      const invLen = 1.0 / Math.hypot(nx, ny, nz);
      normals[i * 3]     = nx * invLen;
      normals[i * 3 + 1] = ny * invLen;
      normals[i * 3 + 2] = nz * invLen;
      const slope = ny * invLen;

      // Multi-radius crevice ambient occlusion (couloirs, fissures & shadow crevices)
      const epsWide = 18.0;
      const hN2 = backgroundMountainElevation(x, z - epsWide);
      const hS2 = backgroundMountainElevation(x, z + epsWide);
      const hW2 = backgroundMountainElevation(x - epsWide, z);
      const hE2 = backgroundMountainElevation(x + epsWide, z);
      const concavityFine = Math.max(0.0, ((hN + hS + hW + hE) * 0.25) - h);
      const concavityMacro = Math.max(0.0, ((hN2 + hS2 + hW2 + hE2) * 0.25) - h);
      const steepnessAO = Math.min(1.0, slope * 0.70 + 0.35);
      const creviceAO = Math.max(0.35, Math.min(1.0, (1.0 - (concavityFine * 0.12 + concavityMacro * 0.05)) * steepnessAO));
      creviceAOs[i] = creviceAO;

      // Geological stratification & snowcap albedo tinting
      const altFactor = Math.max(0.0, Math.min(1.0, (h - 240.0) / 600.0));
      const cliffFactor = Math.max(0.0, Math.min(1.0, (0.78 - slope) / 0.35));

      // Lower elevation subalpine conifer belt
      c.copy(forestConifer);
      // Mid-mountain granite rock & talus scree
      c.lerp(rockScreeTalus, altFactor * 0.70);
      c.lerp(rockGraniteCrest, altFactor * 0.80);
      c.lerp(rockDarkGranite, cliffFactor * 0.75);

      // High glacial snow caps (couloirs and summits h > 980m only)
      const snowLineAlt = 980.0 + (nz < 0 ? -120.0 : 80.0);
      const snowAltMask = Math.max(0.0, Math.min(1.0, (h - snowLineAlt) / 440.0));
      const snowSlopeMask = Math.max(0.0, Math.min(1.0, (slope - 0.40) / 0.38));
      const snowWeight = Math.min(1.0, snowAltMask * snowSlopeMask);

      if (snowWeight > 0.0) {
        c.lerp(glacialIceCore, snowWeight * 0.40);
        c.lerp(alpineSnowPeak, snowWeight * 0.85);
      }

      colors[i * 3]     = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    ringGeo.setAttribute('position', pos);
    ringGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    ringGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    ringGeo.setAttribute('aCreviceAO', new THREE.BufferAttribute(creviceAOs, 1));
    ringGeo.computeBoundingSphere();
    ringGeo.computeBoundingBox();

    const photoRockTex = textures('photogrammetryRock');
    const mossyScreeTex = textures('mossyScree');
    const snowTex = textures('alpineSnowDrift');

    [
      photoRockTex.map, photoRockTex.normalMap, photoRockTex.roughnessMap,
      mossyScreeTex.map, mossyScreeTex.normalMap, mossyScreeTex.roughnessMap,
      snowTex.map, snowTex.normalMap, snowTex.roughnessMap,
    ].forEach(t => {
      if (t) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = Math.min(8, this.renderer?.capabilities?.getMaxAnisotropy?.() || 8);
      }
    });

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.04,
      fog: true,
    });
    mat.color.setRGB(1.0, 1.0, 1.0);

    // High-performance triplanar shader with glacial SSS, Alpenglow, aerial perspective and cloud shadows
    mat.onBeforeCompile = (shader) => {
      this._bgMountainShader = shader;
      shader.uniforms.uSunDir = { value: this.lighting._sunDir ? this.lighting._sunDir.clone() : new THREE.Vector3(0.4, 0.8, 0.5).normalize() };
      shader.uniforms.uCliffMap = { value: photoRockTex.map };
      shader.uniforms.uCliffNorm = { value: photoRockTex.normalMap };
      shader.uniforms.uScreeMap = { value: mossyScreeTex.map };
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
          uniform sampler2D uCliffMap;
          uniform sampler2D uCliffNorm;
          uniform sampler2D uScreeMap;
          uniform sampler2D uSnowMap;
          uniform float uTime;
          varying vec3 vCustomWorldNormal;
          varying vec3 vCustomWorldPosition;
          varying vec3 vTerrainColor;
          varying float vCreviceAO;
        `)
        .replace('#include <normal_fragment_begin>', `
          #include <normal_fragment_begin>
          float slopeN = clamp(vCustomWorldNormal.y, 0.0, 1.0);
          float cliffWeightN = 1.0 - smoothstep(0.35, 0.75, slopeN);

          // Triplanar rock normal projection (smooth cubic blend)
          vec3 blendingNorm = pow(abs(vCustomWorldNormal), vec3(3.0));
          blendingNorm /= (blendingNorm.x + blendingNorm.y + blendingNorm.z + 0.0001);

          vec3 normX = texture2D(uCliffNorm, vCustomWorldPosition.zy * 0.0035).xyz * 2.0 - 1.0;
          vec3 normY = texture2D(uCliffNorm, vCustomWorldPosition.xz * 0.0035).xyz * 2.0 - 1.0;
          vec3 normZ = texture2D(uCliffNorm, vCustomWorldPosition.xy * 0.0035).xyz * 2.0 - 1.0;
          vec3 cliffNorm = normalize(normX * blendingNorm.x + normY * blendingNorm.y + normZ * blendingNorm.z);

          // Snow normal mapping
          vec3 snowN = texture2D(uSnowMap, vCustomWorldPosition.xz * 0.008).xyz * 2.0 - 1.0;
          vec3 snowWorldN = normalize(vec3(snowN.x * 0.75, 1.0, snowN.y * 0.75));

          float northAspect = clamp(-vCustomWorldNormal.z * 0.55 + 0.45, 0.0, 1.0);
          float snowElevN = smoothstep(950.0 - northAspect * 140.0, 1420.0, vCustomWorldPosition.y);
          float snowSlopeN = smoothstep(0.40, 0.78, slopeN);
          float snowMaskN = clamp(snowElevN * snowSlopeN, 0.0, 1.0);

          vec3 blendedMountainNorm = normalize(
            mix(cliffNorm, snowWorldN, snowMaskN) * 0.65 + vCustomWorldNormal * 0.35
          );
          vec3 viewPerturb = normalize((viewMatrix * vec4(blendedMountainNorm, 0.0)).xyz);
          normal = normalize(mix(normal, viewPerturb, 0.78));
        `)
        .replace('#include <map_fragment>', `
          #include <map_fragment>
          float slope = clamp(vCustomWorldNormal.y, 0.0, 1.0);
          float cliffFactor = 1.0 - smoothstep(0.35, 0.75, slope);

          // Triplanar granite cliff albedo (smooth cubic blend for natural organic transitions)
          vec3 blendingCol = pow(abs(vCustomWorldNormal), vec3(3.0));
          blendingCol /= (blendingCol.x + blendingCol.y + blendingCol.z + 0.0001);

          vec3 cliffX = texture2D(uCliffMap, vCustomWorldPosition.zy * 0.0035).rgb * 0.65 +
                        texture2D(uCliffMap, vCustomWorldPosition.zy * 0.015).rgb * 0.35;
          vec3 cliffY = texture2D(uCliffMap, vCustomWorldPosition.xz * 0.0035).rgb * 0.65 +
                        texture2D(uCliffMap, vCustomWorldPosition.xz * 0.015).rgb * 0.35;
          vec3 cliffZ = texture2D(uCliffMap, vCustomWorldPosition.xy * 0.0035).rgb * 0.65 +
                        texture2D(uCliffMap, vCustomWorldPosition.xy * 0.015).rgb * 0.35;
          vec3 triplanarCliff = cliffX * blendingCol.x + cliffY * blendingCol.y + cliffZ * blendingCol.z;

          // Calibrate rock cliff striations into slate grey granite (#565e68 / #6e7682) - no black noise
          vec3 calibratedCliff = triplanarCliff * 1.25 + vec3(0.14, 0.15, 0.17);

          // Scree talus albedo (warm alpine moraine soil #766e62)
          vec3 screeCol = texture2D(uScreeMap, vCustomWorldPosition.xz * 0.008).rgb * 1.10 + vec3(0.12, 0.11, 0.09);

          // Glacial firn snow albedo with subtle ice-blue shadows (#dce6f0 / #78a8cc)
          vec3 rawSnow = texture2D(uSnowMap, vCustomWorldPosition.xz * 0.008).rgb * 0.70 +
                         texture2D(uSnowMap, vCustomWorldPosition.xz * 0.024).rgb * 0.30;
          vec3 snowCol = mix(vec3(0.471, 0.659, 0.800), vec3(0.863, 0.902, 0.941), rawSnow.r);

          // North aspect snowline modulation: summits and couloirs > 980m with smooth Hermite curve blending
          float nAspect = clamp(-vCustomWorldNormal.z * 0.55 + 0.45, 0.0, 1.0);
          float snowElevation = smoothstep(950.0 - nAspect * 140.0, 1420.0, vCustomWorldPosition.y);
          // Soft Hermite curve rock-to-snow blend eliminating zebra striping
          float snowSlope = smoothstep(0.40, 0.78, slope);
          float snowFactor = clamp(snowElevation * snowSlope, 0.0, 1.0);

          vec3 rockBase = mix(screeCol, calibratedCliff, cliffFactor);
          vec3 mountainAlbedo = mix(rockBase, snowCol, snowFactor);

          // Harmonize with realistic alpine vertex color palette
          mountainAlbedo *= (vTerrainColor * 1.08 + 0.12);

          // 1. Ice-Blue Glacial Subsurface Scattering & Forward-Scattering Glow
          vec3 sunDir = normalize(uSunDir);
          vec3 viewDir = normalize(cameraPosition - vCustomWorldPosition + vec3(0.0001));
          vec3 halfVec = normalize(sunDir + viewDir);
          float backLight = max(0.0, dot(-viewDir, sunDir));
          float sunDot = max(0.0, dot(vCustomWorldNormal, sunDir));
          float snowSSS = (pow(backLight, 3.2) * 0.50 + pow(sunDot, 1.25) * 0.36) * snowFactor;
          vec3 snowSSSGlow = vec3(0.471, 0.659, 0.800) * snowSSS;

          // 2. Sunlit Golden Alpine Glow (Alpenglow) on jagged crests
          float alpenglow = pow(sunDot, 1.15) * (1.0 - slope * 0.45) * snowFactor * 0.35;
          vec3 alpenglowColor = vec3(1.18, 0.96, 0.80) * alpenglow;

          // 3. Crystalline snow sparkle glints
          float snowHalfDot = max(0.0, dot(vCustomWorldNormal, halfVec));
          float snowGlint = pow(snowHalfDot, 48.0) * 0.45 * snowFactor;

          vec3 finalAlbedo = mountainAlbedo;
          // Apply vertex crevice ambient occlusion
          finalAlbedo *= (vCreviceAO * 0.65 + 0.35);

          // Drifting atmospheric cloud shadows across peaks
          float cloudDrift = sin(vCustomWorldPosition.x * 0.0008 + vCustomWorldPosition.z * 0.0006 + uTime * 0.05) *
                             cos(vCustomWorldPosition.z * 0.0007 - vCustomWorldPosition.x * 0.0004 - uTime * 0.035);
          float cloudShadowMask = smoothstep(0.15, 0.65, cloudDrift);

          diffuseColor.rgb = (finalAlbedo + snowSSSGlow + alpenglowColor + vec3(snowGlint)) * mix(1.0, 0.80, cloudShadowMask);
        `)
        .replace('#include <roughnessmap_fragment>', `
          #include <roughnessmap_fragment>
          float slopeR = clamp(vCustomWorldNormal.y, 0.0, 1.0);
          float cliffR = 1.0 - smoothstep(0.35, 0.75, slopeR);
          float nAspectR = clamp(-vCustomWorldNormal.z * 0.55 + 0.45, 0.0, 1.0);
          float snowElevR = smoothstep(950.0 - nAspectR * 140.0, 1420.0, vCustomWorldPosition.y);
          float snowSlopeR = smoothstep(0.40, 0.78, slopeR);
          float snowMaskR = clamp(snowElevR * snowSlopeR, 0.0, 1.0);

          float mountainRough = mix(0.82, 0.88, cliffR);
          mountainRough = mix(mountainRough, 0.58, snowMaskR);
          roughnessFactor = clamp(mountainRough, 0.05, 1.0);
        `)
        .replace('#include <fog_fragment>', `
          #include <fog_fragment>
          // Calibrated Rayleigh Aerial Perspective for distant alpine massif (R = 2200m - 5300m)
          float distToCam = length(cameraPosition - vCustomWorldPosition);
          float altitudeHaze = clamp(1.0 - (vCustomWorldPosition.y - 200.0) / 1400.0, 0.40, 1.0);
          float aerialFactor = clamp((1.0 - exp(-distToCam * 0.00035)) * altitudeHaze, 0.0, 0.88);
          vec3 rayleighSkyHaze = vec3(0.68, 0.78, 0.88); // 0x90b8d8 Rayleigh sky haze
          vec3 sunDirVec = normalize(uSunDir);
          vec3 viewDirection = normalize(cameraPosition - vCustomWorldPosition + vec3(0.0001));
          float forwardScatter = pow(max(0.0, dot(-viewDirection, sunDirVec)), 3.0) * 0.28;
          vec3 atmosphericHaze = mix(rayleighSkyHaze, vec3(0.92, 0.94, 0.98), forwardScatter);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, atmosphericHaze, aerialFactor);
        `)
        .replace('#include <color_fragment>', '');
    };

    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.bgMountainsMesh = mesh;
  }

  _deckY(z) {
    const bz = 440;
    const t = (z - (bz - 60)) / 120;
    if (t < 0 || t > 1) return null;
    const groundStart = 21.0 + 0.65; // North bridge abutment at z = 380
    const groundEnd = 26.0 + 0.65;   // South bridge abutment at z = 500
    const baseGround = groundStart * (1 - t) + groundEnd * t;
    return baseGround + Math.sin(t * Math.PI) * 8.5;
  }

  _plots() {
    const avail = [], occup = [];
    for (const p of this.plots) {
      if (!p.quaternion) {
        const eps = 0.5;
        const hN = terrainHeight(p.x, p.z - eps);
        const hS = terrainHeight(p.x, p.z + eps);
        const hW = terrainHeight(p.x - eps, p.z);
        const hE = terrainHeight(p.x + eps, p.z);
        p.normal = new THREE.Vector3(hW - hE, 2.0 * eps, hN - hS).normalize();
        p.quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.normal).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot));
      }
      (p.status === 'available' ? avail : occup).push(p);
    }
    const tmp = new THREE.Object3D();

    // Soft Radial Contact Ambient Occlusion Shadow Decal Texture for Plots
    const shadowCnv = document.createElement('canvas');
    shadowCnv.width = shadowCnv.height = 128;
    const sCtx = shadowCnv.getContext('2d');
    const sGrad = sCtx.createRadialGradient(64, 64, 8, 64, 64, 64);
    sGrad.addColorStop(0, 'rgba(0, 0, 0, 0.68)');
    sGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.32)');
    sGrad.addColorStop(0.85, 'rgba(0, 0, 0, 0.08)');
    sGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 128, 128);
    const shadowTex = new THREE.CanvasTexture(shadowCnv);
    const plotContactShadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });

    // Ethereal availability glowing beacon shader
    const beaconMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }
      },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        #include <fog_pars_vertex>
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          vUv = uv;
          vColor = instanceColor;
          vec4 mvPosition = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
                  #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        #include <fog_pars_fragment>
        uniform float uTime;
        varying vec3 vColor;
        varying vec2 vUv;
        void main() {
          float dist = length(vUv - vec2(0.5));
          float ring = smoothstep(0.40, 0.46, dist) - smoothstep(0.46, 0.50, dist);
          float pulse = (sin(uTime * 2.5 - dist * 8.0) * 0.5 + 0.5) * 0.75 + 0.25;
          float glow = ring * pulse * (1.0 - dist * 2.0);
          gl_FragColor = vec4(vColor, glow * 0.85);
                  #include <logdepthbuf_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
    });
    this._beaconMat = beaconMat;

    const makePlotMesh = (list, isAvail = false) => {
      if (!list.length) return null;

      // 1. Pickable hit box aligned with terrain
      const hitGeo = new THREE.BoxGeometry(1, 0.4, 1);
      hitGeo.translate(0, 0.2, 0);
      hitGeo.computeBoundingSphere();
      const hitMat = new THREE.MeshBasicMaterial({ visible: false });
      const mesh = new THREE.InstancedMesh(hitGeo, hitMat, list.length);

      list.forEach((p, i) => {
        const [w, d] = SIZE_DIMS[p.size] || [10, 14];
        const ph = terrainHeight(p.x, p.z);
        tmp.position.set(p.x, ph + 0.15, p.z);
        tmp.quaternion.copy(p.quaternion);
        tmp.scale.set(w, 1, d);
        tmp.updateMatrix();
        mesh.setMatrixAt(i, tmp.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (typeof mesh.computeBoundingSphere === 'function') mesh.computeBoundingSphere();
      if (typeof mesh.computeBoundingBox === 'function') mesh.computeBoundingBox();
      mesh.frustumCulled = false;
      this.scene.add(mesh);

      // 2. Occupied plots receive architectural limestone foundation plinth & rich garden loam bed
      if (!isAvail) {
        // Soft contact shadow ground decal
        const shadowDecalGeo = new THREE.PlaneGeometry(1, 1);
        shadowDecalGeo.rotateX(-Math.PI / 2);
        shadowDecalGeo.computeBoundingSphere();
        const shadowMesh = new THREE.InstancedMesh(shadowDecalGeo, plotContactShadowMat, list.length);
        list.forEach((p, i) => {
          const [w, d] = SIZE_DIMS[p.size] || [10, 14];
          const ph = terrainHeight(p.x, p.z);
          tmp.position.set(p.x, ph + 0.18, p.z);
          tmp.quaternion.copy(p.quaternion);
          tmp.scale.set(w * 1.35, 1, d * 1.35);
          tmp.updateMatrix();
          shadowMesh.setMatrixAt(i, tmp.matrix);
        });
        shadowMesh.instanceMatrix.needsUpdate = true;
        shadowMesh.frustumCulled = false;
        this.scene.add(shadowMesh);
        this.terrain._decorMeshes = this.terrain._decorMeshes || [];
        this.terrain._decorMeshes.push(shadowMesh);

        // Carved Caen limestone architectural curbing plinth
        const plinthGeo = new THREE.BoxGeometry(1, 0.35, 1);
        plinthGeo.translate(0, 0.18, 0);
        plinthGeo.computeBoundingSphere();
        const plinthMat = Surfaces.agedCaenLimestone(2.0);
        const plinthMesh = new THREE.InstancedMesh(plinthGeo, plinthMat, list.length);

        // Rich dark garden loam earth bed
        const bedGeo = new THREE.BoxGeometry(1, 0.08, 1);
        bedGeo.translate(0, 0.36, 0);
        bedGeo.computeBoundingSphere();
        const bedMat = Surfaces.groundDetail(2.0);
//         bedMat.color.setHex(0x2a2218); // Rich dark organic soil loam
        const bedMesh = new THREE.InstancedMesh(bedGeo, bedMat, list.length);

        list.forEach((p, i) => {
          const [w, d] = SIZE_DIMS[p.size] || [10, 14];
          const ph = terrainHeight(p.x, p.z);
          tmp.position.set(p.x, ph + 0.15, p.z);
          tmp.quaternion.copy(p.quaternion);
          tmp.scale.set(w * 0.96, 1, d * 0.96);
          tmp.updateMatrix();
          plinthMesh.setMatrixAt(i, tmp.matrix);

          tmp.scale.set(w * 0.88, 1, d * 0.88);
          tmp.updateMatrix();
          bedMesh.setMatrixAt(i, tmp.matrix);
        });

        plinthMesh.instanceMatrix.needsUpdate = true;
        bedMesh.instanceMatrix.needsUpdate = true;
        plinthMesh.receiveShadow = plinthMesh.castShadow = true;
        bedMesh.receiveShadow = true;
        plinthMesh.frustumCulled = bedMesh.frustumCulled = false;

        this.scene.add(plinthMesh);
        this.scene.add(bedMesh);
        this.terrain._decorMeshes.push(plinthMesh, bedMesh);
      }

      // 3. Available plots receive glowing ethereal beacon disks and solid bronze corner pins
      if (isAvail) {
        const beaconGeo = new THREE.PlaneGeometry(1, 1);
        beaconGeo.rotateX(-Math.PI / 2);
        beaconGeo.computeBoundingSphere();
        
        const beaconMesh = new THREE.InstancedMesh(beaconGeo, beaconMat, list.length);
        beaconMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
        
        const cornerGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.45, 6);
        cornerGeo.translate(0, 0.18, 0);
        cornerGeo.computeBoundingSphere();
        const cornerMat = new THREE.MeshStandardMaterial({
          color: 0xffffff, emissive: 0x000000, emissiveIntensity: 0.0, roughness: 0.35, metalness: 0.8,
        });
        const cornerMesh = new THREE.InstancedMesh(cornerGeo, cornerMat, list.length * 4);
        cornerMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 4 * 3), 3);
        
        const tierColors = {
          1: { corner: new THREE.Color(0x8a703a), beacon: new THREE.Color(0xd4be7b) }, // Bronze
          2: { corner: new THREE.Color(0xa0aab5), beacon: new THREE.Color(0xc8d8e8) }, // Silver
          3: { corner: new THREE.Color(0xd4af37), beacon: new THREE.Color(0xffea70) }  // Gold
        };

        let cIdx = 0;
        list.forEach((p, i) => {
          const tier = p.tier || (p.size === 'estate' ? 3 : p.size === 'premium' ? 2 : 1);
          const colors = tierColors[tier] || tierColors[1];
          
          const [w, d] = SIZE_DIMS[p.size] || [10, 14];
          const ph = terrainHeight(p.x, p.z);
          tmp.position.set(p.x, ph + 0.20, p.z);
          tmp.quaternion.copy(p.quaternion);
          tmp.scale.set(Math.max(w, d) * 1.2, 1, Math.max(w, d) * 1.2);
          tmp.updateMatrix();
          beaconMesh.setMatrixAt(i, tmp.matrix);
          beaconMesh.setColorAt(i, colors.beacon);
          
          const hw = (w * 0.5) - 0.2, hd = (d * 0.5) - 0.2;
          const corners = [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]];
          for (const [cx, cz] of corners) {
            const rx = cx * Math.cos(p.rot) + cz * Math.sin(p.rot);
            const rz = -cx * Math.sin(p.rot) + cz * Math.cos(p.rot);
            const pinY = terrainHeight(p.x + rx, p.z + rz);
            tmp.position.set(p.x + rx, pinY + 0.15, p.z + rz);
            tmp.rotation.set(0, 0, 0);
            tmp.scale.set(1, 1, 1);
            tmp.updateMatrix();
            cornerMesh.setMatrixAt(cIdx, tmp.matrix);
            cornerMesh.setColorAt(cIdx, colors.corner);
            cIdx++;
          }
        });
        
        beaconMesh.instanceMatrix.needsUpdate = true;
        beaconMesh.instanceColor.needsUpdate = true;
        beaconMesh.frustumCulled = false;
        this.scene.add(beaconMesh);
        
        cornerMesh.instanceMatrix.needsUpdate = true;
        cornerMesh.instanceColor.needsUpdate = true;
        cornerMesh.castShadow = true;
        cornerMesh.frustumCulled = false;
        this.scene.add(cornerMesh);
        
        this.terrain._decorMeshes = this.terrain._decorMeshes || [];
        this.terrain._decorMeshes.push(beaconMesh, cornerMesh);
      }

      this.pickables.push(mesh);
      this.plotMeshIndex.set(mesh, list);
      return mesh;
    };

    this.availMesh = makePlotMesh(avail, true);
    this.occupMesh = makePlotMesh(occup, false);

    // ----- Multi-Tier 3D Plot Architecture & Submerged Biomes -----
    const DEFAULT_POS = {
      headstone: [0, -2], flowers: [0, 3.5], tree: [-3.8, -3.8], bench: [4.2, -1],
      lantern: [-4.2, -1], candle: [1.5, 3.2], ball: [-1.5, 3.2], bone: [1.8, 3.8],
      wreath: [0, 2.5], cactus: [3.8, -3.8], fountain: [-4.0, -1],
      memorial_crystal: [0, 0], coral_brain: [-2.8, -2.8], coral_staghorn: [2.8, -3.5], sea_anemone: [-1.8, 2.8],
      crystal_lotus: [0, 0], jade_stones: [-1.8, 2.2], lily_pad: [2.2, 3.2],
      mossy_boulder: [0, 0]
    };

    const buckets = {}; // key -> { mats: [], colors: [] }
    const pushDecor = (key, p, d = {}, extraS = 1, forceDx = null, forceDz = null) => {
      const [ddx, ddz] = DEFAULT_POS[d.type || key] || [0, 0];
      const dx = forceDx ?? d.dx ?? ddx, dz = forceDz ?? d.dz ?? ddz;
      const rx = dx * Math.cos(p.rot) + dz * Math.sin(p.rot);
      const rz = -dx * Math.sin(p.rot) + dz * Math.cos(p.rot);
      const actualY = terrainHeight(p.x + rx, p.z + rz);
      tmp.position.set(p.x + rx, actualY, p.z + rz);
      tmp.quaternion.copy(p.quaternion);
      tmp.scale.setScalar(extraS);
      tmp.updateMatrix();
      (buckets[key] ||= { mats: [], colors: [] });
      buckets[key].mats.push(tmp.matrix.clone());
      const DEFAULT_COLOR = { flowers: 0xd66a8a, tree: 0x5e8f4e, ball: 0xc8e84a };
      buckets[key].colors.push(d.color || DEFAULT_COLOR[d.type] || null);
    };

    for (const p of occup) {
      const isReef = p.district === 'kaya_reef';
      const isLakeSub = p.district === 'lake_submerged';
      const isRapids = p.district === 'highland_rapids';
      const tier = p.tier || (p.size === 'estate' ? 3 : p.size === 'premium' ? 2 : 1);
      const [w, d] = SIZE_DIMS[p.size] || [10, 14];
      const hw = w * 0.5 - 1.2, hd = d * 0.5 - 1.5;

      if (isReef) {
        pushDecor('memorial_crystal', p, {}, 1.3, 0, 0);
        pushDecor('coral_brain', p, {}, 1.1, -hw * 0.7, -hd * 0.6);
        pushDecor('coral_staghorn', p, {}, 1.2, hw * 0.7, -hd * 0.7);
        pushDecor('sea_anemone', p, {}, 1.0, -hw * 0.5, hd * 0.6);
      } else if (isLakeSub) {
        pushDecor('crystal_lotus', p, {}, 1.2, 0, 0);
        pushDecor('jade_stones', p, {}, 1.0, -hw * 0.6, -hd * 0.5);
        pushDecor('lily_pad', p, {}, 1.4, hw * 0.6, hd * 0.6);
      } else if (isRapids) {
        pushDecor('mossy_boulder', p, {}, 1.4, 0, -hd * 0.5);
        pushDecor('flowers', p, { type: 'flowers' }, 1.1, hw * 0.5, hd * 0.5);
      } else {
        // Terrestrial Multi-Tier Plot Varieties
        if (tier === 1) {
          // Tier 1: Honed Carrara Marble Classic Headstone & Fresh Flowers
          pushDecor('hs_classic', p, { type: 'headstone', style: 'classic' }, 1.0, 0, -hd + 1.2);
          pushDecor('flowers', p, { type: 'flowers' }, 1.0, 0, hd - 1.5);
          pushDecor('candle', p, { type: 'candle' }, 1.0, -hw * 0.5, hd - 1.5);
        } else if (tier === 2) {
          // Tier 2: Under-the-Tree Grove Sanctuary with Stele & Timber Bench
          pushDecor('tree', p, { type: 'tree' }, 1.3, -hw * 0.6, -hd * 0.6);
          pushDecor('hs_slab', p, { type: 'headstone', style: 'slab' }, 1.1, 0, -hd * 0.2);
          pushDecor('flowers', p, { type: 'flowers' }, 1.2, hw * 0.5, hd * 0.6);
          pushDecor('bench', p, { type: 'bench' }, 1.0, hw * 0.7, -hd * 0.2);
          pushDecor('lantern', p, { type: 'lantern' }, 1.0, -hw * 0.6, hd * 0.6);
        } else if (tier === 3) {
          // Tier 3: Classical Marble Obelisk Monument, Fountain, Lanterns & Offering Wreath
          pushDecor('hs_obelisk', p, { type: 'headstone', style: 'obelisk' }, 1.3, 0, -hd * 0.4);
          pushDecor('lantern', p, { type: 'lantern' }, 1.1, -hw * 0.7, -hd * 0.4);
          pushDecor('lantern', p, { type: 'lantern' }, 1.1, hw * 0.7, -hd * 0.4);
          pushDecor('fountain', p, { type: 'fountain' }, 1.0, -hw * 0.6, hd * 0.6);
          pushDecor('fountain_water', p, { type: 'fountain' }, 1.0, -hw * 0.6, hd * 0.6);
          pushDecor('wreath', p, { type: 'wreath' }, 1.2, hw * 0.6, hd * 0.6);
        }
      }
    }

    const graniteMat = Surfaces.granite(1.0);
    const marbleMat = Surfaces.honedCarraraMarble(1.0);
    const inst = (key, geo, mat, yOff = 0, useColor = false) => {
      const b = buckets[key];
      if (!b?.mats.length) return;
      if (geo.computeBoundingSphere) geo.computeBoundingSphere();
      const mesh = new THREE.InstancedMesh(geo, mat, b.mats.length);
      if (useColor) {
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(b.mats.length * 3), 3);
      }
      const t = new THREE.Matrix4(), off = new THREE.Matrix4().makeTranslation(0, yOff, 0);
      const col = new THREE.Color();
      b.mats.forEach((mx, i) => {
        t.copy(mx).multiply(off);
        mesh.setMatrixAt(i, t);
        if (useColor) mesh.setColorAt(i, col.setHex(b.colors[i] ?? 0xffffff));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (useColor && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (typeof mesh.computeBoundingSphere === 'function') mesh.computeBoundingSphere();
      if (typeof mesh.computeBoundingBox === 'function') mesh.computeBoundingBox();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.terrain._decorMeshes.push(mesh);
    };
    this.terrain._decorMeshes = this.terrain._decorMeshes || [];

    // 1. Honed Carrara Marble Classic Headstone with Roman Serif Relief Tablet
    const geoClassic = (() => {
      const parts = [];
      const plinth = new THREE.BoxGeometry(4.8, 0.45, 1.8);
      plinth.translate(0, 0.225, 0);
      parts.push(plinth);

      const tablet = new THREE.BoxGeometry(4.0, 3.6, 0.9);
      tablet.translate(0, 2.25, 0);
      parts.push(tablet);

      const arch = new THREE.CylinderGeometry(2.0, 2.0, 0.9, 16, 1, false, 0, Math.PI);
      arch.rotateZ(Math.PI / 2);
      arch.rotateY(Math.PI / 2);
      arch.translate(0, 4.05, 0);
      parts.push(arch);

      // Raised Roman inscription plate
      const plate = new THREE.BoxGeometry(3.2, 2.2, 0.08);
      plate.translate(0, 2.35, 0.46);
      parts.push(plate);

      return applyOrganicWeathering(safeMerge(parts, false) || tablet, 0.06, 0.12, 51);
    })();

    // 2. Monumental Stepped Carrara Marble Obelisk with Gold Celestial Apex
    const geoObelisk = (() => {
      const parts = [];
      const p1 = new THREE.BoxGeometry(4.4, 0.5, 4.4);
      p1.translate(0, 0.25, 0);
      parts.push(p1);

      const p2 = new THREE.BoxGeometry(3.4, 0.5, 3.4);
      p2.translate(0, 0.75, 0);
      parts.push(p2);

      const shaft = new THREE.CylinderGeometry(1.2, 1.8, 6.2, 4);
      shaft.rotateY(Math.PI / 4);
      shaft.translate(0, 4.1, 0);
      parts.push(shaft);

      const cap = new THREE.ConeGeometry(1.2, 1.5, 4);
      cap.rotateY(Math.PI / 4);
      cap.translate(0, 7.95, 0);
      parts.push(cap);

      return applyOrganicWeathering(safeMerge(parts, false) || p1, 0.06, 0.10, 57);
    })();

    // 3. Dark Granite Stele & Kerbed Ledger Stone with Bronze Inlay
    const geoSlab = (() => {
      const parts = [];
      const kerb = new THREE.BoxGeometry(6.4, 0.35, 4.4);
      kerb.translate(0, 0.175, 0);
      parts.push(kerb);

      const slab = new THREE.BoxGeometry(5.4, 0.35, 3.4);
      slab.translate(0, 0.40, 0);
      parts.push(slab);

      const bronzeInlay = new THREE.BoxGeometry(4.2, 0.04, 2.4);
      bronzeInlay.translate(0, 0.58, 0);
      parts.push(bronzeInlay);

      return applyOrganicWeathering(safeMerge(parts, false) || kerb, 0.05, 0.10, 63);
    })();

    inst('hs_classic', geoClassic, marbleMat,  0);
    inst('hs_obelisk', geoObelisk, marbleMat,  0);
    inst('hs_slab',    geoSlab,    graniteMat, 0);

    // 4. Floral Bouquet Offering in Sculpted Marble/Bronze Fluted Vase
    const geoFlowerBouquet = (() => {
      const parts = [];
      const vase = new THREE.CylinderGeometry(0.40, 0.25, 1.2, 12);
      vase.translate(0, 0.60, 0);
      parts.push(vase);

      const vaseRim = new THREE.TorusGeometry(0.42, 0.06, 8, 16);
      vaseRim.rotateX(Math.PI / 2);
      vaseRim.translate(0, 1.20, 0);
      parts.push(vaseRim);

      // Multi-species blossom fan cards (Alpine Poppies, Edelweiss, Forget-Me-Nots)
      for (let b = 0; b < 4; b++) {
        const a = (b / 4) * Math.PI;
        const q = new THREE.PlaneGeometry(1.6, 1.8);
        q.translate(0, 1.85, 0);
        q.rotateY(a);
        parts.push(q);
      }
      return safeMerge(parts, false) || vase;
    })();

    // 5. Fresh Floral Wreath Offering (Layered ivy & blooming roses inclined on ground bed)
    const geoWreath = (() => {
      const parts = [];
      const ring = new THREE.TorusGeometry(1.1, 0.32, 12, 24);
      ring.rotateX(-0.35); // Rest naturally inclined on ground bed
      ring.translate(0, 0.38, 0);
      parts.push(ring);

      // Rose blooms attached to wreath perimeter
      for (let r = 0; r < 8; r++) {
        const rAng = (r / 8) * Math.PI * 2;
        const roseHead = new THREE.SphereGeometry(0.22, 8, 6);
        roseHead.scale(1.0, 0.6, 1.0);
        roseHead.rotateX(-0.35);
        roseHead.translate(Math.cos(rAng) * 1.1, 0.38 + Math.sin(rAng) * 0.40, Math.sin(rAng) * 0.85);
        parts.push(roseHead);
      }
      return safeMerge(parts, false) || ring;
    })();

    // 6. Flickering Golden Bronze Candle Lantern
    const geoLantern = (() => {
      const parts = [];
      const plinth = new THREE.BoxGeometry(1.1, 0.18, 1.1);
      plinth.translate(0, 0.09, 0);
      parts.push(plinth);

      const cage = new THREE.CylinderGeometry(0.35, 0.48, 1.8, 6);
      cage.translate(0, 1.05, 0);
      parts.push(cage);

      const cap = new THREE.ConeGeometry(0.52, 0.65, 6);
      cap.translate(0, 2.25, 0);
      parts.push(cap);

      const loop = new THREE.TorusGeometry(0.18, 0.04, 6, 12);
      loop.translate(0, 2.65, 0);
      parts.push(loop);

      return safeMerge(parts, false) || plinth;
    })();

    const matLantern = new THREE.MeshStandardMaterial({
      color: 0x3a2c1e, emissive: 0xffb84d, emissiveIntensity: 2.4, roughness: 0.35, metalness: 0.85,
    });

    // 7. Memorial Candle with Translucent Wax & Stone Saucer
    const geoCandle = (() => {
      const parts = [];
      const saucer = new THREE.CylinderGeometry(0.55, 0.65, 0.12, 12);
      saucer.translate(0, 0.06, 0);
      parts.push(saucer);

      const candleBody = new THREE.CylinderGeometry(0.28, 0.32, 1.0, 12);
      candleBody.translate(0, 0.62, 0);
      parts.push(candleBody);

      const flame = new THREE.ConeGeometry(0.12, 0.35, 8);
      flame.translate(0, 1.25, 0);
      parts.push(flame);

      return safeMerge(parts, false) || candleBody;
    })();

    const matCandle = (() => {
      const m = Surfaces.wax(1);
      m.emissive = new THREE.Color(0xffc866);
      m.emissiveIntensity = 2.4;
      return m;
    })();

    // 8. Sanctuary Tree Crown & Trunk
    const createCurvedPlotLeafGeo = (w, h, curveDepth = 0.40) => {
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

    const geoPlotTreeCrown = (() => {
      const parts = [];
      const rngT = mulberry32(1234);
      const clusterCenters = [
        [0, 5.8, 0, 2.4, 12],            // Central crown apex (12 cards)
        [1.4, 4.8, 0.8, 1.8, 9],         // East branch cloud (9 cards)
        [-1.4, 4.8, -0.8, 1.8, 9],       // West branch cloud (9 cards)
        [0.6, 5.0, 1.4, 1.8, 9],         // North branch cloud (9 cards)
        [-0.6, 5.0, -1.4, 1.8, 9],       // South branch cloud (9 cards)
      ];
      for (const [cx, cy, cz, crad, cardCount] of clusterCenters) {
        for (let i = 0; i < cardCount; i++) {
          const phi = Math.acos(1 - 2 * rngT());
          const theta = rngT() * Math.PI * 2;
          const rad = crad * (0.35 + rngT() * 0.65);
          const cxp = cx + Math.sin(phi) * Math.cos(theta) * rad;
          const cyp = cy + Math.cos(phi) * (rad * 0.80);
          const czp = cz + Math.sin(phi) * Math.sin(theta) * rad;
          const s = 2.4 + rngT() * 1.0;
          const q = createCurvedPlotLeafGeo(s, s, 0.40);
          q.rotateX((rngT() - 0.5) * Math.PI * 0.85);
          q.rotateY(rngT() * Math.PI * 2);
          q.rotateZ((rngT() - 0.5) * 0.6);
          q.translate(cxp, cyp, czp);
          parts.push(q);
        }
      }
      return safeMerge(parts, false) || parts[0];
    })();

    const geoPlotTreeTrunk = (() => {
      const parts = [];
      const base = new THREE.CylinderGeometry(0.38, 0.85, 1.2, 8);
      base.translate(0, 0.6, 0);
      parts.push(base);

      const trunk = new THREE.CylinderGeometry(0.24, 0.38, 4.0, 8);
      trunk.translate(0, 2.6, 0);
      parts.push(trunk);

      const b1 = new THREE.CylinderGeometry(0.12, 0.22, 2.4, 6);
      b1.rotateZ(0.58);
      b1.translate(0.65, 3.8, 0);
      parts.push(b1);

      const b2 = new THREE.CylinderGeometry(0.12, 0.22, 2.2, 6);
      b2.rotateZ(-0.52);
      b2.rotateY(1.8);
      b2.translate(-0.55, 3.6, 0.3);
      parts.push(b2);

      const b3 = new THREE.CylinderGeometry(0.10, 0.18, 2.0, 5);
      b3.rotateZ(0.45);
      b3.rotateY(-1.5);
      b3.translate(0.2, 4.2, -0.5);
      parts.push(b3);

      return applyOrganicWeathering(safeMerge(parts, false) || trunk, 0.12, 0.18, 44);
    })();

    inst('flowers', geoFlowerBouquet, Surfaces.petal(1, 0xffffff), 0, true);
    inst('tree', geoPlotTreeTrunk, Surfaces.bark(1), 0);
    if (buckets.tree) {
      buckets.tree_crown = { mats: buckets.tree.mats, colors: buckets.tree.colors };
      inst('tree_crown', geoPlotTreeCrown, Surfaces.leafCard(0x76b85e), 0, true);
    }

    const geoBench = (() => {
      const seat = new THREE.BoxGeometry(4.6, 0.25, 1.4);
      seat.translate(0, 1.2, 0);
      const back = new THREE.BoxGeometry(4.6, 1.1, 0.2);
      back.translate(0, 1.85, -0.6);
      const legL = new THREE.BoxGeometry(0.3, 1.2, 1.2);
      legL.translate(-2.0, 0.6, 0);
      const legR = new THREE.BoxGeometry(0.3, 1.2, 1.2);
      legR.translate(2.0, 0.6, 0);
      return safeMerge([seat, back, legL, legR], false) || seat;
    })();
    inst('bench', geoBench, Surfaces.timber(1.2), 0);

    // 9. Classical Marble Fountain & Water Basin
    const geoFountain = (() => {
      const parts = [];
      const basePed = new THREE.CylinderGeometry(1.4, 1.8, 0.4, 16);
      basePed.translate(0, 0.20, 0);
      parts.push(basePed);

      const shaft = new THREE.CylinderGeometry(0.8, 1.1, 1.2, 16);
      shaft.translate(0, 1.0, 0);
      parts.push(shaft);

      const bowl = new THREE.CylinderGeometry(2.6, 1.4, 0.9, 24);
      bowl.translate(0, 1.95, 0);
      parts.push(bowl);

      return safeMerge(parts, false) || basePed;
    })();

    const geoFountainWater = (() => {
      const waterDisc = new THREE.CircleGeometry(2.3, 24);
      waterDisc.rotateX(-Math.PI / 2);
      waterDisc.translate(0, 2.25, 0);
      return waterDisc;
    })();

    inst('lantern', geoLantern, matLantern, 0);
    inst('fountain', geoFountain, marbleMat, 0);
    inst('fountain_water', geoFountainWater, this.terrain.waterMat, 0);
    inst('candle', geoCandle, matCandle, 0);
    inst('wreath', geoWreath, Surfaces.foliage(1, 0x3e6b45), 0);

    // 10. Submerged Coral Reef & Aquatic Biome Geometries (Base at y = 0)
    const geoCrystal = (() => {
      const base = new THREE.CylinderGeometry(0.8, 1.4, 4.2, 6);
      base.translate(0, 2.1, 0);
      const tip = new THREE.ConeGeometry(0.8, 1.6, 6);
      tip.translate(0, 5.0, 0);
      return safeMerge([base, tip], false) || base;
    })();
    const matCrystal = new THREE.MeshStandardMaterial({
      color: 0x06b6d4, emissive: 0x22d3ee, emissiveIntensity: 1.8, roughness: 0.15, metalness: 0.2,
    });
    inst('memorial_crystal', geoCrystal, matCrystal, 0);

    const geoBrainCoral = (() => {
      const g = new THREE.DodecahedronGeometry(1.4, 1);
      g.translate(0, 1.2, 0);
      return applyOrganicWeathering(g, 0.15, 0.20, 81);
    })();
    const matBrainCoral = new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.85, metalness: 0.05 });
    inst('coral_brain', geoBrainCoral, matBrainCoral, 0);

    const geoStaghorn = (() => {
      const branches = [];
      for (let b = 0; b < 6; b++) {
        const cy = new THREE.CylinderGeometry(0.15, 0.3, 3.2, 6);
        cy.rotateZ((b - 2.5) * 0.25);
        cy.rotateY(b * 1.0);
        cy.translate(Math.sin(b) * 0.6, 1.6, Math.cos(b) * 0.6);
        branches.push(cy);
      }
      return safeMerge(branches, false) || branches[0];
    })();
    const matStaghorn = new THREE.MeshStandardMaterial({ color: 0xfb923c, roughness: 0.8, metalness: 0.05 });
    inst('coral_staghorn', geoStaghorn, matStaghorn, 0);

    const geoAnemone = (() => {
      const g = new THREE.SphereGeometry(1.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6);
      g.translate(0, 0.6, 0);
      return g;
    })();
    const matAnemone = new THREE.MeshStandardMaterial({ color: 0xa855f7, emissive: 0xc084fc, emissiveIntensity: 0.8, roughness: 0.5 });
    inst('sea_anemone', geoAnemone, matAnemone, 0);

    const geoLotus = (() => {
      const petals = [];
      for (let p = 0; p < 8; p++) {
        const q = new THREE.ConeGeometry(0.8, 2.2, 4);
        q.rotateZ(0.6);
        q.rotateY((p / 8) * Math.PI * 2);
        q.translate(0, 0.8, 0);
        petals.push(q);
      }
      return safeMerge(petals, false) || petals[0];
    })();
    const matLotus = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x7dd3fc, emissiveIntensity: 1.4, roughness: 0.2 });
    inst('crystal_lotus', geoLotus, matLotus, 0);

    const geoJade = (() => {
      const g = new THREE.DodecahedronGeometry(1.2, 0);
      g.translate(0, 0.6, 0);
      return g;
    })();
    const matJade = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.25, metalness: 0.3 });
    inst('jade_stones', geoJade, matJade, 0);

    const geoLilyPad = (() => {
      const g = new THREE.CircleGeometry(1.8, 16);
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0.04, 0);
      return g;
    })();
    const matLily = Surfaces.foliage(1, 0x15803d);
    inst('lily_pad', geoLilyPad, matLily, 0);

    const geoMossBoulder = (() => {
      const g = new THREE.DodecahedronGeometry(2.0, 1);
      g.translate(0, 1.4, 0);
      return applyOrganicWeathering(g, 0.18, 0.25, 93);
    })();
    const matMossBoulder = Surfaces.rockCliff(2);
//     matMossBoulder.color.setHex(0x4a5d4e);
    inst('mossy_boulder', geoMossBoulder, matMossBoulder, 0);

    // Selection ring
    this.selRing = new THREE.Mesh(
      new THREE.RingGeometry(9, 12, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }));
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.visible = false;
    this.scene.add(this.selRing);
  }

  _picking() {
    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    let downAt = null;
    const tt = document.getElementById('plotHoverTooltip');
    const phtIcon = document.getElementById('phtIcon');
    const phtName = document.getElementById('phtName');
    const phtSub = document.getElementById('phtSub');
    const phtEpitaph = document.getElementById('phtEpitaph');
    const phtBadge = document.getElementById('phtBadge');
    const phtAction = document.getElementById('phtAction');

    this._onPointerDown = e => { downAt = [e.clientX, e.clientY]; };
    this._onPointerUp = e => {
      if (this.tourController.tourMode) return;
      if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
      const r = this.canvas.getBoundingClientRect();
      ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ptr, this.camera);
      const hits = ray.intersectObjects(this.pickables);
      if (hits.length) {
        const hit = hits[0];
        const list = this.plotMeshIndex.get(hit.object);
        const plot = list?.[hit.instanceId];
        if (plot) {
          if (tt) tt.classList.add('hidden');
          this.selectPlot(plot);
          this.onPlotClick?.(plot);
          return;
        }
      }
    };

    this._onPointerMove = e => {
      if (this.tourController.tourMode) {
        if (tt) tt.classList.add('hidden');
        this.canvas.style.cursor = 'default';
        return;
      }
      const r = this.canvas.getBoundingClientRect();
      ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ptr, this.camera);
      const hits = ray.intersectObjects(this.pickables);
      if (hits.length && tt) {
        const hit = hits[0];
        const list = this.plotMeshIndex.get(hit.object);
        const plot = list?.[hit.instanceId];
        if (plot) {
          this.canvas.style.cursor = 'pointer';
          const d = DISTRICTS[plot.district];
          const m = plot.memorial || {};
          
          if (plot.status === 'occupied') {
            const spKey = speciesKey(m.species || 'dog');
            if (phtIcon) phtIcon.innerHTML = speciesIcon(spKey, { size: 20 });
            if (phtName) phtName.textContent = m.petName || 'Beloved Friend';
            if (phtSub) phtSub.textContent = `${m.species || 'Companion'} · Plot ${plot.id} (${d?.name || 'Sanctuary'})`;
            if (phtEpitaph) {
              phtEpitaph.textContent = m.epitaph ? `“${m.epitaph}”` : '“Forever loved and remembered.”';
              phtEpitaph.style.display = '';
            }
            if (phtBadge) {
              const cName = charityName(m.charity) || 'Animal Rescue Fund';
              phtBadge.innerHTML = `${icon('heart', { size: 12 })} ${cName}`;
            }
            if (phtAction) phtAction.textContent = 'View Memorial →';
          } else {
            if (phtIcon) phtIcon.innerHTML = icon('grave', { size: 18 });
            if (phtName) phtName.textContent = `Available Plot ${plot.id}`;
            if (phtSub) phtSub.textContent = `${d?.name || 'Sanctuary'} · ${SIZE_DIMS[plot.size] ? SIZE_DIMS[plot.size].join('×') + 'm' : 'Standard'}`;
            if (phtEpitaph) {
              phtEpitaph.textContent = d?.blurb || 'A peaceful resting place surrounded by nature and gentle music.';
              phtEpitaph.style.display = '';
            }
            if (phtBadge) phtBadge.innerHTML = `${icon('sparkle', { size: 12 })} $${plot.price} (one-time)`;
            if (phtAction) phtAction.textContent = 'Reserve Plot →';
          }

          const ttWidth = 290, ttHeight = 150;
          let posX = e.clientX + 16;
          let posY = e.clientY + 16;
          if (posX + ttWidth > window.innerWidth - 20) posX = e.clientX - ttWidth - 16;
          if (posY + ttHeight > window.innerHeight - 20) posY = e.clientY - ttHeight - 16;

          tt.style.left = `${posX}px`;
          tt.style.top = `${posY}px`;
          tt.style.transform = 'none';
          tt.classList.remove('hidden');
          return;
        }
      }
      this.canvas.style.cursor = 'default';
      if (tt) tt.classList.add('hidden');
    };

    this._onPointerLeave = () => {
      this.canvas.style.cursor = 'default';
      if (tt) tt.classList.add('hidden');
    };

    this.canvas.addEventListener('pointerdown', this._onPointerDown);
    this.canvas.addEventListener('pointerup', this._onPointerUp);
    this.canvas.addEventListener('pointermove', this._onPointerMove);
    this.canvas.addEventListener('pointerleave', this._onPointerLeave);
  }

  _initAmbienceControls() {
    const pill = document.getElementById('sanctuaryAmbiencePill');
    if (!pill) return;
    const curKey = this.lighting._forcedPhase?.key || (getDayPhase ? getDayPhase().key : 'sunlit');
    pill.querySelectorAll('.sap-btn[data-phase]').forEach(b => b.classList.toggle('is-active', b.dataset.phase === curKey || (curKey === 'sunlit' && b.dataset.phase === 'day')));
    pill.querySelectorAll('.sap-btn[data-mood]').forEach(b => b.classList.toggle('is-active', b.dataset.mood === this.lighting.mood));

    pill.querySelectorAll('button[data-phase]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        pill.querySelectorAll('.sap-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        const phase = btn.dataset.phase;
        this.lighting.forcePhase(phase);
        if (window.Theme) window.Theme.forcePhase?.(phase);
      };
    });
    pill.querySelectorAll('button[data-mood]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const mood = btn.dataset.mood;
        if (mood === 'blessing') {
          pill.querySelectorAll('.sap-btn').forEach(b => b.classList.remove('is-active'));
          btn.classList.add('is-active');
          this.lighting.forcePhase('blessing');
          if (window.Theme) {
            window.Theme.forcePhase?.('blessing');
            window.Theme.setMood?.('blessing');
          }
        } else {
          if (this.lighting.mood === mood) {
            this.lighting.mood = 'clear';
            btn.classList.remove('is-active');
          } else {
            this.lighting.mood = mood;
            btn.classList.add('is-active');
          }
          this.lighting.applyAmbience();
          if (window.Theme) window.Theme.setMood?.(this.lighting.mood);
        }
      };
    });
  }

  setQuality(tier, manual = false) {
    if (manual) {
      this._qualityLocked = true;
      localStorage.setItem('ev_quality', tier);
    }
    this._qualityTier = tier;
    
    // Shadow maps
    const isMobileDevice = typeof window !== 'undefined' && (/Mobi|Android/i.test(navigator.userAgent) || window.innerWidth <= 768);
    let shadowSize = isMobileDevice ? 512 : 1024;
    if (tier === 'ultra') shadowSize = isMobileDevice ? 1024 : 4096;
    else if (tier === 'high') shadowSize = isMobileDevice ? 1024 : 2048;
    
    if (this.renderer && this.renderer.shadowMap.enabled) {
       // if we have a directional light, update its shadow map size
       this.scene.traverse(c => {
         if (c.isDirectionalLight && c.shadow) {
            if (c.shadow.mapSize.width !== shadowSize) {
               c.shadow.mapSize.width = shadowSize;
               c.shadow.mapSize.height = shadowSize;
               if (c.shadow.map) {
                 c.shadow.map.dispose();
                 c.shadow.map = null;
               }
            }
         }
       });
    }
    
    this._resize();
  }

  _updateAdaptivePerformance(dt) {
    // Warmup stabilization phase (first 45 frames)
    if (this._benchFrames < 45) {
       this._benchFrames++;
       this._benchTime += dt;
       return;
    }

    const count = Math.min(this._fpsCount, 30);
    if (count < 30) return;
    
    let head = this._fpsHead;
    const sorted = [];
    for (let i = 0; i < count; i++) {
       head = (head - 1 + 120) % 120;
       sorted.push(this._fpsBuffer[head]);
    }
    sorted.sort((a,b)=>a-b);
    const medianMs = sorted[Math.floor(count/2)]; // Median frame time

    // HARDLINE 60FPS FALLBACK (Runs even if quality is manually locked)
    if (false) {
       this._timeUnder60fps = 0;
    }

    if (this._qualityLocked) return;
    
    const now = performance.now();
    if (now - this._lastScaleChange < 3000) return; // 3 second cooldown between scale adjustments

    const isMobile = typeof window !== 'undefined' && (/Mobi|Android/i.test(navigator.userAgent) || window.innerWidth <= 768);
    const minScale = isMobile ? 0.80 : 0.90; // Hardline minimum resolution scaling
    const maxScale = isMobile ? 1.0 : 1.0;
    let targetScale = this._renderScale;
    
    // User requested HARD LINE 60FPS (16.6ms frame time)
    // Dynamic camera.far culling disabled to prevent popping and sky culling
    if (false) {} else if (false) {}
    
    // renderScale disabled to prevent canvas resize black-screen flickering
    if (false) {
       this._renderScale = targetScale;
       this._lastScaleChange = now;
       this._resize();
    }
  }

  _optimizeScene() {
    this.scene.updateMatrixWorld(true);
    const byMaterial = new Map();
    const toRemove = [];

    this.scene.traverse((o) => {
        if (!o.isMesh) return;
        if (o.isInstancedMesh) return;
        if (o.userData && (o.userData.speedX !== undefined || o.userData.phase !== undefined)) return;
        if (o.name && (o.name.includes('Water') || o.name.includes('Sky') || o.name.includes('Cloud') || o.name.includes('Terrain'))) return;
        if (o.material) {
           if (o.material.transparent || o.material.opacity < 1.0) return;
           if (o.material.name && (o.material.name.toLowerCase().includes('water') || o.material.name.toLowerCase().includes('sky'))) return;
        }
        if (Array.isArray(o.material)) return;
        
        if (!o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
        
        // Normalize attributes so mergeGeometries doesn't fail
        if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
        if (!o.geometry.attributes.uv) {
          const uvs = new Float32Array(o.geometry.attributes.position.count * 2);
          o.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        }
        
        const wp = new THREE.Vector3();
        o.getWorldPosition(wp);
        const gridX = Math.floor(wp.x / 150);
        const gridZ = Math.floor(wp.z / 150);
        const matUuid = o.material.uuid;
        const key = `${matUuid}_${gridX}_${gridZ}`;

        if (!byMaterial.has(key)) byMaterial.set(key, { material: o.material, meshes: [] });
        byMaterial.get(key).meshes.push(o);
    });

    let mergedCount = 0;
    for (const [uuid, group] of byMaterial.entries()) {
        if (group.meshes.length < 2) continue;
        
        let currentGeos = [];
        let currentVerts = 0;
        
        const flush = () => {
           if (currentGeos.length === 0) return;
           if (currentGeos.length === 1) return;
           const mergedGeo = safeMerge(currentGeos, false);
           if (mergedGeo) {
               const mergedMesh = new THREE.Mesh(mergedGeo, group.material);
               // Shadows only cast on large/near things, but for merged chunks we can cast them
               mergedMesh.castShadow = true;
               mergedMesh.receiveShadow = true;
               mergedMesh.name = 'MergedStaticChunk_' + mergedCount++;
               this.scene.add(mergedMesh);
               for (const m of toRemoveChunk) {
                   m.removeFromParent();
                   if (m.geometry) m.geometry.dispose();
               }
           }
           // Always dispose of cloned geometries added to currentGeos
           for (const g of currentGeos) g.dispose();
           
           currentGeos = [];
           currentVerts = 0;
           toRemoveChunk = [];
        };
        
        let toRemoveChunk = [];
        for (const m of group.meshes) {
            // Check if geometry has color attribute. If mixed, we have a problem.
            // For now, we strip colors to allow merging, or just ignore. 
            // It's safer to delete color attribute if we don't strictly need it, but some meshes might.
            // Let's rely on material grouping.
            
            let geo = m.geometry.clone();
            if (geo.index) {
                const nonIndexed = geo.toNonIndexed();
                geo.dispose();
                geo = nonIndexed;
            }
            
            // Strip any extraneous attributes (like tangents, colors, uv2) so all geos perfectly match
            for (const key in geo.attributes) {
                if (key !== 'position' && key !== 'normal' && key !== 'uv') {
                    geo.deleteAttribute(key);
                }
            }
            
            geo.applyMatrix4(m.matrixWorld);
            currentGeos.push(geo);
            currentVerts += geo.attributes.position.count;
            toRemoveChunk.push(m);
            toRemove.push(m);
            
            if (currentVerts > 300000) flush();
        }
        flush();
    }
    console.log('[optimizer] Merged ' + toRemove.length + ' meshes into ' + mergedCount + ' chunks.');
  }

  selectPlot(plot) {
    if (!plot) { this.selRing.visible = false; return; }
    this.selRing.visible = true;
    this.selRing.position.set(plot.x, plot.h + 0.05, plot.z);
    _v3Temp1.set(plot.x, plot.h, plot.z);
    this.tourController.flyTo(_v3Temp1, 120, 0.9);
  }

  _animate() {
    if (!this._running) {
      this._raf = null;
      return;
    }
    this._raf = requestAnimationFrame(() => this._animate());
    // Only skip render if the document tab is completely backgrounded
    if (typeof document !== 'undefined' && document.hidden) return;
    if (typeof document !== 'undefined' && !this._view3dEl) this._view3dEl = document.getElementById('view3d');
    const view3d = this._view3dEl;
    if (view3d && (view3d.style.display === 'none' || view3d.classList.contains('hidden')) && !view3d.classList.contains('is-entering')) return;
    if (!this.renderer || !this.scene || !this.camera) return;

    try {
      // --- Real-Time Rolling 120-Frame FPS & Render Time Profiler (Zero Allocation Ring Buffer) ---
      const now = performance.now();
      if (this._lastFpsTime) {
        const delta = now - this._lastFpsTime;
        if (delta > 0 && delta < 500) {
          this._fpsBuffer[this._fpsHead] = delta;
          this._fpsHead = (this._fpsHead + 1) % 120;
          if (this._fpsCount < 120) this._fpsCount++;
        }
      }
      this._lastFpsTime = now;

      if (now - this._lastFpsHudUpdate >= 200 && this._fpsCount >= 5) {
        this._lastFpsHudUpdate = now;
        let totalDelta = 0;
        for (let i = 0; i < this._fpsCount; i++) {
          totalDelta += this._fpsBuffer[i];
        }
        const avgDelta = totalDelta / this._fpsCount;
        const currentFps = Math.min(240, Math.round(1000 / avgDelta));
        const currentMs = Math.round(avgDelta * 10) / 10;

        if (!this._fpsPill || !this._fpsTextEl) {
          this.tourController._initFPSHUD();
        }
        if (this._fpsTextEl) {
          this._fpsTextEl.innerHTML = `<span class="sfp-fps">${currentFps} FPS</span><span class="sfp-sep">·</span><span class="sfp-ms">${currentMs}ms</span>`;
        }
        if (this._fpsPill) {
          if (currentFps >= 115) {
            this._fpsPill.className = 'sanctuary-fps-pill fps-ultra';
          } else if (currentFps >= 55) {
            this._fpsPill.className = 'sanctuary-fps-pill fps-good';
          } else if (currentFps >= 30) {
            this._fpsPill.className = 'sanctuary-fps-pill fps-warn';
          } else {
            this._fpsPill.className = 'sanctuary-fps-pill fps-bad';
          }
        }
        
        // Frame rate monitoring and stable DPR
        if (!this._drsInitialized) {
          const isMob = /Mobi|Android/i.test(navigator.userAgent) || window.innerWidth <= 768;
          this._drsPixelRatio = 1.0;
          this.renderer.setPixelRatio(this._drsPixelRatio);
          if (this.lighting.composer) this.lighting.composer.setPixelRatio(this._drsPixelRatio);
          this._drsInitialized = true;
        }
      }

      // High-precision sub-frame temporal integration for 120Hz / ProMotion displays (8.33ms per frame)
      const rawDt = this.clock.getDelta();
      const dt = Math.min(Math.max(rawDt, 0.0005), 0.0333);
      const t = this.clock.getElapsedTime();

      // Enforce frame rate target (e.g. min 60fps)
      if (this._updateAdaptivePerformance) this._updateAdaptivePerformance(dt);

    // Sky and celestial dome follows the camera to keep horizon level at infinity
    if (this.lighting.sky) this.lighting.sky.position.copy(this.camera.position);
    if (this.lighting.stars) this.lighting.stars.position.copy(this.camera.position);

    if (this.lighting.csm) {
        this.lighting.csm.update();
    }

    if (this._flyTween) this._flyTween();
    if (this.tourController.walkMode || this.tourController.tourMode || this.tourController._entranceFlight) {
      this.tourController._updateWalk(dt);
    } else {
      this.controls.update();
    }

    // --- Front Gate Proximity & Entry Opening Animation ---
    if (this.terrain.leftGateDoor && this.terrain.rightGateDoor) {
      const camZ = this.camera.position.z;
      const camDistGate = Math.hypot(this.camera.position.x - WORLD.gate.x, this.camera.position.z - WORLD.gate.z);
      
      let shouldOpen = false;
      if (this.tourController.tourMode) {
        // Open gate right as drone approaches (z<950)
        shouldOpen = this.terrain.gateTargetOpen === 1.0 || (camZ < 950) || this.terrain._forceGateOpen;
      } else if (this.tourController._entranceFlight) {
        // Open dramatically as we fly towards the gate
        shouldOpen = (camZ < 915) || this.terrain._forceGateOpen;
      } else if (this.tourController.walkMode) {
        shouldOpen = (this.tourController.walkPos.z < 940) || (camDistGate < 380) || this.terrain._forceGateOpen;
      } else {
        shouldOpen = camDistGate < 380 || camZ < 940 || this.terrain._forceGateOpen;
      }
      this.terrain.gateTargetOpen = shouldOpen ? 1.0 : 0.0;
      
      // Majestic hinge rotation — slower opening for dramatic effect
      const hingeSpeed = shouldOpen ? 1.2 : 1.5;
      const hingeDamp = 1.0 - Math.exp(-hingeSpeed * rawDt * 3.0);
      this.terrain.gateOpenAmount += (this.terrain.gateTargetOpen - this.terrain.gateOpenAmount) * Math.min(1.0, hingeDamp);
      
      // Swing open inward toward the valley (-1.48 rad = ~85 deg)
      this.terrain.leftGateDoor.rotation.y = this.terrain.gateOpenAmount * -1.85;
      // Swing open inward toward the valley (PI + 1.48 rad)
      this.terrain.rightGateDoor.rotation.y = Math.PI + this.terrain.gateOpenAmount * 1.85;
    }
    if (this.terrain.water) {
      this.terrain.water.position.y = WORLD.waterLevel;
    }
    if (this.waterObjects) {
      for (let i = 0, len = this.waterObjects.length; i < len; i++) {
        const w = this.waterObjects[i];
        if (w.material?.uniforms?.time) {
          w.material.uniforms.time.value = t * 0.75;
        }
      }
    }
    if (this.terrain._riverMaterials) {
      for (let i = 0, len = this.terrain._riverMaterials.length; i < len; i++) {
        if (this.terrain._riverMaterials[i].uniforms?.uTime) this.terrain._riverMaterials[i].uniforms.uTime.value = t;
      }
    } else if (this.terrain.riverMat?.uniforms?.uTime) {
      this.terrain.riverMat.uniforms.uTime.value = t;
    }
        if (this.terrain._upperTarnMesh?.material?.userData?.shader?.uniforms?.uTime) {
      this.terrain._upperTarnMesh.material.userData.shader.uniforms.uTime.value = t;
    }
    if (this.terrain._lakeShader?.userData?.shader?.uniforms?.uTime) {
      this.terrain._lakeShader.userData.shader.uniforms.uTime.value = t;
    } else if (this.terrain._lakeShader?.uniforms?.uTime) {
      this.terrain._lakeShader.uniforms.uTime.value = t;
    }
    if (this.terrain._oceanShader?.userData?.shader?.uniforms?.uTime) {
      this.terrain._oceanShader.userData.shader.uniforms.uTime.value = t;
    } else if (this.terrain._oceanShader?.uniforms?.uTime) {
      this.terrain._oceanShader.uniforms.uTime.value = t;
    }
    if (this.terrain._kayaShaders) {
      for (let i = 0; i < this.terrain._kayaShaders.length; i++) {
        if (this.terrain._kayaShaders[i].uniforms?.time) this.terrain._kayaShaders[i].uniforms.time.value = t;
      }
    }
    if (this._waterPoolMat?.uniforms?.uTime) {
      this._waterPoolMat.uniforms.uTime.value = t;
    }
    if (this.terrain._fountainBasinMat?.uniforms?.uTime) {
      this.terrain._fountainBasinMat.uniforms.uTime.value = t;
    }
    if (this.terrain._fountainCascadeMat?.uniforms?.uTime) {
      this.terrain._fountainCascadeMat.uniforms.uTime.value = t;
    }
    if (this.terrain._shorelineFoamMaterial?.uniforms?.uTime) {
      this.terrain._shorelineFoamMaterial.uniforms.uTime.value = t;
    }
    if (this.terrain._waterNormals) {
      this.terrain._waterNormals.offset.set(t * 0.012, t * 0.020);
    }
    if (this.terrain.oceanMesh?.material?.normalMap) {
      this.terrain.oceanMesh.material.normalMap.offset.set(t * 0.008, t * 0.024);
    }
    if (this.terrain._rainbowShaders) {
      const base = this.lighting._rainbowBase || 0.55;
      if (this.terrain._rainbowShaders[0]?.uniforms?.uTime) this.terrain._rainbowShaders[0].uniforms.uTime.value = t;
      if (this.terrain._rainbowShaders[0]?.uniforms?.uOpacity) this.terrain._rainbowShaders[0].uniforms.uOpacity.value = base;
      if (this.terrain._rainbowShaders[1]?.uniforms?.uTime) this.terrain._rainbowShaders[1].uniforms.uTime.value = t * 0.9;
      if (this.terrain._rainbowShaders[1]?.uniforms?.uOpacity) this.terrain._rainbowShaders[1].uniforms.uOpacity.value = base * 0.32;
      if (this.terrain._rainbowShaders[2]?.uniforms?.uTime) this.terrain._rainbowShaders[2].uniforms.uTime.value = t;
      if (this.terrain._rainbowShaders[2]?.uniforms?.uOpacity) this.terrain._rainbowShaders[2].uniforms.uOpacity.value = base * 0.18;
    }
    if (this.terrain._instancedFishMat?.userData?.shader?.uniforms?.uTime) { this.terrain._instancedFishMat.userData.shader.uniforms.uTime.value = t; }
    if (this.terrain._updateUnderwater) this.terrain._updateUnderwater(dt, t);
    if (this.terrain._mountainWaterfallShader?.uniforms?.uTime) {
      this.terrain._mountainWaterfallShader.uniforms.uTime.value = t;
    }
    if (this.terrain._oceanWaterfallShader?.uniforms?.uTime) {
      this.terrain._oceanWaterfallShader.uniforms.uTime.value = t;
    }
    if (this.terrain._poolShader?.uniforms?.uTime) {
      this.terrain._poolShader.uniforms.uTime.value = t;
    }
    if (this._splashShader?.uniforms?.uTime) {
      this._splashShader.uniforms.uTime.value = t;
    }
    if (this._mistShader?.uniforms?.uTime) {
      this._mistShader.uniforms.uTime.value = t;
    }
    if (this.terrain._lakeMistShader?.uniforms?.uTime) {
      this.terrain._lakeMistShader.uniforms.uTime.value = t;
    }
    if (this._impactRingShader?.uniforms?.uTime) {
      this._impactRingShader.uniforms.uTime.value = t;
    }
    if (this.lighting._godRayMat?.uniforms?.uTime) {
      this.lighting._godRayMat.uniforms.uTime.value = t;
    }
    const wrapT = t % 6283.1853;
    if (this.terrain._stardustMat?.uniforms?.uTime) this.terrain._stardustMat.uniforms.uTime.value = wrapT;
    if (this.terrain._balustradeMoteMat?.uniforms?.uTime) this.terrain._balustradeMoteMat.uniforms.uTime.value = wrapT;
    if (this.terrain._lanterns) {
      for (let i = 0, len = this.terrain._lanterns.length; i < len; i++) {
        const l = this.terrain._lanterns[i];
        l.userData.progress = (l.userData.progress + l.userData.speed * dt * 0.14) % 1.0;
        const curve = l.userData.isOutlet ? this.terrain._riverOutletCurve : this.terrain._riverInletCurve;
        if (curve) {
          curve.getPoint(l.userData.progress, this._tmpV3);
          l.position.set(this._tmpV3.x, this._tmpV3.y + 0.15 + Math.sin(t * 1.8 + l.userData.bobPhase) * 0.12, this._tmpV3.z);
        }
        l.rotation.y = t * 0.3 + l.userData.bobPhase;
      }
    }
    if (this.terrain._surfShader?.uniforms?.uTime) {
      this.terrain._surfShader.uniforms.uTime.value = t;
    }
    if (this._beaconMat?.uniforms?.uTime) {
      this._beaconMat.uniforms.uTime.value = t;
    }
    if (this.terrain._kayaStardust) {
      this.terrain._kayaStardust.rotation.y = t * 0.45;
    }
    if (this.terrain.moteMat) this.terrain.moteMat.uniforms.uTime.value = t;
    if (this.terrain.pawMat) this.terrain.pawMat.opacity = (this.lighting._pawBase || 0.45) * (0.72 + 0.28 * Math.sin(t * 2.1));
    if (this.lighting.stars?.visible && this.lighting.starMat?.uniforms?.uTime) this.lighting.starMat.uniforms.uTime.value = t;
    if (this.terrain._terrainShaders) this.terrain._terrainShaders.forEach(s => { if (s.uniforms?.uTime) s.uniforms.uTime.value = t; });
    if (this._bgMountainShader?.uniforms?.uTime) this._bgMountainShader.uniforms.uTime.value = t;
    if (this.terrain._oceanShader?.uniforms?.uTime) this.terrain._oceanShader.uniforms.uTime.value = t;
    if (this.lighting._clouds) {
      for (let i = 0, len = this.lighting._clouds.length; i < len; i++) {
        const c = this.lighting._clouds[i];
        c.position.x += (c.userData.speedX || 2.4) * dt * 14.0;
        if (c.position.x > 4200) c.position.x = -4200;
      }
    }
    if (this.lighting._cinematicPass?.uniforms?.uTime) {
      this.lighting._cinematicPass.uniforms.uTime.value = t;
    }
    // Update swimming school of fish positions & headings
    // Throttle terrainHeight lookups — cache ground height, refresh every 30 frames
    if (!this._fishFrameCount) this._fishFrameCount = 0;
    this._fishFrameCount++;
    const refreshFishGround = (this._fishFrameCount % 30 === 0);
    
    if (this.terrain._troutMesh && this.terrain._troutData) {
      const dummy = this._troutDummy = this._troutDummy || new THREE.Object3D();
      const troutTime = t;
      const len = this.terrain._troutData.length;
      for (let i = 0; i < len; i++) {
        const f = this.terrain._troutData[i];
        const dir = f.dir || 1;
        const currentAng = f.angle + troutTime * f.orbitSpeed * dir;
        const wanderX = (Math.sin(troutTime * 0.20 + f.phase) + Math.sin(troutTime * 0.11 + f.phase * 2.3) * 0.6) * (f.wanderAmp || 6.0);
        const wanderZ = (Math.cos(troutTime * 0.16 + f.phase * 1.4) + Math.cos(troutTime * 0.09 + f.phase * 0.8) * 0.7) * (f.wanderAmp || 6.0);
        const fx = f.center.x + Math.cos(currentAng) * f.radiusX + wanderX;
        const fz = f.center.z + Math.sin(currentAng) * f.radiusZ + wanderZ;
        if (refreshFishGround || f._cachedGH === undefined) f._cachedGH = terrainHeight(fx, fz);
        const groundH = f._cachedGH;
        const waterSurface = (fz < -450 ? 182.0 : (fz < -340 && fx < 100 ? 18.0 : 12.4));
        const midY = (waterSurface + groundH) * 0.5;
        const depthRange = Math.max(0, waterSurface - groundH - 1.0);
        const fy = midY + f.yOffset * depthRange + Math.sin(troutTime * f.speed * 2.2 + f.phase) * (f.vertAmp || 0.45);

        const dx = -Math.sin(currentAng) * f.radiusX * dir * f.orbitSpeed + (Math.cos(troutTime * 0.20 + f.phase) * 0.20 + Math.cos(troutTime * 0.11 + f.phase * 2.3) * 0.11 * 0.6) * (f.wanderAmp || 6.0);
        const dz = Math.cos(currentAng) * f.radiusZ * dir * f.orbitSpeed - (Math.sin(troutTime * 0.16 + f.phase * 1.4) * 0.16 + Math.sin(troutTime * 0.09 + f.phase * 0.8) * 0.09 * 0.7) * (f.wanderAmp || 6.0);
        const heading = Math.atan2(dx, dz);

        dummy.position.set(fx, Math.max(Math.min(fy, waterSurface - 0.4), groundH + 0.4), fz);
        dummy.rotation.set(
          Math.cos(troutTime * f.speed * 1.6 + f.phase) * 0.08,
          heading,
          Math.sin(troutTime * f.speed * 3.2 + f.phase) * 0.15
        );
        dummy.scale.setScalar(f.scale);
        dummy.updateMatrix();
        this.terrain._troutMesh.setMatrixAt(i, dummy.matrix);
      }
      this.terrain._troutMesh.instanceMatrix.needsUpdate = true;
    }

    if (this.terrain._koiMesh && this.terrain._koiData) {
      const dummy = this._koiDummy = this._koiDummy || new THREE.Object3D();
      const koiTime = t;
      const len = this.terrain._koiData.length;
      for (let i = 0; i < len; i++) {
        const f = this.terrain._koiData[i];
        const dir = f.dir || 1;
        const currentAng = f.angle + koiTime * f.orbitSpeed * dir;
        const wanderX = (Math.sin(koiTime * 0.20 + f.phase) + Math.sin(koiTime * 0.11 + f.phase * 2.3) * 0.6) * (f.wanderAmp || 8.0);
        const wanderZ = (Math.cos(koiTime * 0.16 + f.phase * 1.4) + Math.cos(koiTime * 0.09 + f.phase * 0.8) * 0.7) * (f.wanderAmp || 8.0);
        const fx = f.center.x + Math.cos(currentAng) * f.radiusX + wanderX;
        const fz = f.center.z + Math.sin(currentAng) * f.radiusZ + wanderZ;
        if (refreshFishGround || f._cachedGH === undefined) f._cachedGH = terrainHeight(fx, fz);
        const groundH = f._cachedGH;
        const waterSurface = 12.4;
        const midY = (waterSurface + groundH) * 0.5;
        const depthRange = Math.max(0, waterSurface - groundH - 1.0);
        const fy = midY + f.yOffset * depthRange + Math.sin(koiTime * f.speed * 1.8 + f.phase) * (f.vertAmp || 0.45);

        const dx = -Math.sin(currentAng) * f.radiusX * dir * f.orbitSpeed + (Math.cos(koiTime * 0.20 + f.phase) * 0.20 + Math.cos(koiTime * 0.11 + f.phase * 2.3) * 0.11 * 0.6) * (f.wanderAmp || 8.0);
        const dz = Math.cos(currentAng) * f.radiusZ * dir * f.orbitSpeed - (Math.sin(koiTime * 0.16 + f.phase * 1.4) * 0.16 + Math.sin(koiTime * 0.09 + f.phase * 0.8) * 0.09 * 0.7) * (f.wanderAmp || 8.0);
        const heading = Math.atan2(dx, dz);

        dummy.position.set(fx, Math.max(Math.min(fy, waterSurface - 0.4), groundH + 0.4), fz);
        dummy.rotation.set(
          Math.cos(koiTime * f.speed * 1.4 + f.phase) * 0.07,
          heading,
          Math.sin(koiTime * f.speed * 2.8 + f.phase) * 0.14
        );
        dummy.scale.setScalar(f.scale);
        dummy.updateMatrix();
        this.terrain._koiMesh.setMatrixAt(i, dummy.matrix);
      }
      this.terrain._koiMesh.instanceMatrix.needsUpdate = true;
    }

    if (this.terrain._reefFishMesh && this.terrain._reefFishData) {
      const dummy = this._fishDummy = this._fishDummy || new THREE.Object3D();
      const fishTime = t;
      const len = this.terrain._reefFishData.length;
      for (let i = 0; i < len; i++) {
        const f = this.terrain._reefFishData[i];
        const dir = f.dir || 1;
        const currentAng = f.angle + fishTime * f.orbitSpeed * dir;
        const wanderX = (Math.sin(fishTime * 0.20 + f.phase) + Math.sin(fishTime * 0.11 + f.phase * 2.3) * 0.6) * (f.wanderAmp || 8.0);
        const wanderZ = (Math.cos(fishTime * 0.16 + f.phase * 1.4) + Math.cos(fishTime * 0.09 + f.phase * 0.8) * 0.7) * (f.wanderAmp || 8.0);
        const fx = f.center.x + Math.cos(currentAng) * f.radiusX + wanderX;
        const fz = f.center.z + Math.sin(currentAng) * f.radiusZ + wanderZ;
        if (refreshFishGround || f._cachedGH === undefined) f._cachedGH = terrainHeight(fx, fz);
        const groundH = f._cachedGH;
        // Ensure fish never clip through terrain or fly above water
        const waterSurface = (fz > 1050) ? 0.0 : (fz < -450 ? 182.0 : (fz < -340 && fx < 100 ? 18.0 : 12.4));
        const midY = (waterSurface + groundH) * 0.5;
        const depthRange = Math.max(0, waterSurface - groundH - 1.0);
        const fy = midY + f.yOffset * depthRange + Math.sin(fishTime * f.speed * 2.4 + f.phase) * (f.vertAmp || 0.50);

        const dx = -Math.sin(currentAng) * f.radiusX * dir * f.orbitSpeed + (Math.cos(fishTime * 0.20 + f.phase) * 0.20 + Math.cos(fishTime * 0.11 + f.phase * 2.3) * 0.11 * 0.6) * (f.wanderAmp || 8.0);
        const dz = Math.cos(currentAng) * f.radiusZ * dir * f.orbitSpeed - (Math.sin(fishTime * 0.16 + f.phase * 1.4) * 0.16 + Math.sin(fishTime * 0.09 + f.phase * 0.8) * 0.09 * 0.7) * (f.wanderAmp || 8.0);
        const heading = Math.atan2(dx, dz);

        dummy.position.set(fx, Math.max(Math.min(fy, waterSurface - 0.4), groundH + 0.4), fz);
        dummy.rotation.set(
          Math.cos(fishTime * f.speed * 1.8 + f.phase) * 0.09,
          heading,
          Math.sin(fishTime * f.speed * 3.4 + f.phase) * 0.16
        );
        dummy.scale.setScalar(f.scale);
        dummy.updateMatrix();
        this.terrain._reefFishMesh.setMatrixAt(i, dummy.matrix);
      }
      this.terrain._reefFishMesh.instanceMatrix.needsUpdate = true;
    }

    // Update Dolphins leaping & vertical fluke undulation
    if (this.terrain._dolphinMesh && this.terrain._dolphinData) {
      const dummy = this._dolphDummy = this._dolphDummy || new THREE.Object3D();
      const dolphTime = t;
      const len = this.terrain._dolphinData.length;
      for (let i = 0; i < len; i++) {
        const d = this.terrain._dolphinData[i];
        const dir = d.dir || 1;
        const currentAng = d.angle + dolphTime * d.orbitSpeed * dir;
        const radX = d.radiusX || 80;
        const radZ = d.radiusZ || 95;
        const wanderX = Math.sin(dolphTime * 0.18 + d.phase) * (d.wanderAmp || 10.0);
        const wanderZ = Math.cos(dolphTime * 0.14 + d.phase * 1.3) * (d.wanderAmp || 10.0);
        const dx = d.center.x + Math.cos(currentAng) * radX + wanderX;
        const dz = d.center.z + Math.sin(currentAng) * radZ + wanderZ;
        if (refreshFishGround || d._cachedGH === undefined) d._cachedGH = terrainHeight(dx, dz);

        // Graceful dolphin vertical wave (undulation with occasional breach arc)
        const waterSurface = (dz > 1050) ? 0.0 : (dz < -450 ? 182.0 : (dz < -340 && dx < 100 ? 18.0 : 12.4));
        const midY = (waterSurface + d._cachedGH) * 0.5;
        const depthRange = Math.max(0, waterSurface - d._cachedGH - 2.0);
        const wave = Math.sin(dolphTime * d.speed * 1.6 + d.phase);
        const rawDy = midY + d.yOffset * depthRange + wave * 2.2;
        const dy = Math.max(d._cachedGH + 0.8, Math.min(waterSurface - 0.4, rawDy));

        const dirX = -Math.sin(currentAng) * radX * dir + Math.cos(dolphTime * 0.18 + d.phase) * (d.wanderAmp || 10.0) * 0.18;
        const dirZ = Math.cos(currentAng) * radZ * dir - Math.sin(dolphTime * 0.14 + d.phase * 1.3) * (d.wanderAmp || 10.0) * 0.14;
        const heading = Math.atan2(dirX, dirZ);

        dummy.position.set(dx, dy, dz);
        const pitchAngle = -Math.cos(dolphTime * d.speed * 1.6 + d.phase) * 0.28;
        const bankRoll = -Math.sin(currentAng) * 0.22 * dir;
        dummy.rotation.set(pitchAngle, heading, bankRoll);
        dummy.scale.setScalar(d.scale);
        dummy.updateMatrix();
        this.terrain._dolphinMesh.setMatrixAt(i, dummy.matrix);
      }
      this.terrain._dolphinMesh.instanceMatrix.needsUpdate = true;
    }

    // Update Sharks powerful lateral patrol glides
    if (this.terrain._sharkMesh && this.terrain._sharkData) {
      const dummy = this._sharkDummy = this._sharkDummy || new THREE.Object3D();
      const sharkTime = t;
      const len = this.terrain._sharkData.length;
      for (let i = 0; i < len; i++) {
        const s = this.terrain._sharkData[i];
        const dir = s.dir || 1;
        const currentAng = s.angle + sharkTime * s.orbitSpeed * dir;
        const radX = s.radiusX || 95;
        const radZ = s.radiusZ || 110;
        const wanderX = Math.sin(sharkTime * 0.15 + s.phase) * (s.wanderAmp || 12.0);
        const wanderZ = Math.cos(sharkTime * 0.12 + s.phase * 1.2) * (s.wanderAmp || 12.0);
        const sx = s.center.x + Math.cos(currentAng) * radX + wanderX;
        const sz = s.center.z + Math.sin(currentAng) * radZ + wanderZ;
        if (refreshFishGround || s._cachedGH === undefined) s._cachedGH = terrainHeight(sx, sz);

        const waterSurface = (sz > 1050) ? 0.0 : (sz < -450 ? 182.0 : (sz < -340 && sx < 100 ? 18.0 : 12.4));
        const midY = (waterSurface + s._cachedGH) * 0.5;
        const depthRange = Math.max(0, waterSurface - s._cachedGH - 2.0);
        const rawSy = midY + s.yOffset * depthRange + Math.sin(sharkTime * s.speed * 0.8 + s.phase) * 0.55;
        const sy = Math.max(s._cachedGH + 1.2, Math.min(waterSurface - 0.8, rawSy));

        const dirX = -Math.sin(currentAng) * radX * dir + Math.cos(sharkTime * 0.15 + s.phase) * (s.wanderAmp || 12.0) * 0.15;
        const dirZ = Math.cos(currentAng) * radZ * dir - Math.sin(sharkTime * 0.12 + s.phase * 1.2) * (s.wanderAmp || 12.0) * 0.12;
        const heading = Math.atan2(dirX, dirZ);

        dummy.position.set(sx, sy, sz);
        const yawSwish = Math.sin(sharkTime * s.speed * 2.2 + s.phase) * 0.12;
        const bankRoll = -Math.sin(currentAng) * 0.15 * dir;
        dummy.rotation.set(0, heading + yawSwish, bankRoll);
        dummy.scale.setScalar(s.scale);
        dummy.updateMatrix();
        this.terrain._sharkMesh.setMatrixAt(i, dummy.matrix);
      }
      this.terrain._sharkMesh.instanceMatrix.needsUpdate = true;
    }

    if (this._fishShader?.uniforms?.uTime) {
      this._fishShader.uniforms.uTime.value = t;
    }
    if (this.terrain._causticsShader?.uniforms?.uTime) {
      this.terrain._causticsShader.uniforms.uTime.value = t;
    }
    if (this.terrain._marineSnowShader?.uniforms?.uTime) {
      this.terrain._marineSnowShader.uniforms.uTime.value = t;
    }

    // Update Green Sea Turtles orbital gliding & banking
    if (this.terrain._seaTurtleMesh && this.terrain._seaTurtleData) {
      const dummy = this._turtleDummy = this._turtleDummy || new THREE.Object3D();
      const turtleTime = t;
      const len = this.terrain._seaTurtleData.length;
      for (let i = 0; i < len; i++) {
        const tur = this.terrain._seaTurtleData[i];
        const dir = tur.dir || 1;
        const currentAng = tur.phase + turtleTime * tur.orbitSpeed * dir;
        const wanderX = Math.sin(turtleTime * 0.20 + tur.phase) * 6.0;
        const wanderZ = Math.cos(turtleTime * 0.16 + tur.phase * 1.3) * 6.0;
        const tx = tur.cx + Math.cos(currentAng) * tur.radiusX * 4.0 + wanderX;
        const tz = tur.cz + Math.sin(currentAng) * tur.radiusZ * 4.0 + wanderZ;

        const dx = -Math.sin(currentAng) * tur.radiusX * 4.0 * dir + Math.cos(turtleTime * 0.20 + tur.phase) * 6.0 * 0.20;
        const dz = Math.cos(currentAng) * tur.radiusZ * 4.0 * dir - Math.sin(turtleTime * 0.16 + tur.phase * 1.3) * 6.0 * 0.16;
        const heading = Math.atan2(dx, dz);

        if (refreshFishGround || tur._cachedGH === undefined) tur._cachedGH = terrainHeight(tx, tz);
        
        const waterSurface = (tz > 1050) ? 0.0 : (tz < -450 ? 182.0 : (tz < -340 && tx < 100 ? 18.0 : 12.4));
        const midY = (waterSurface + tur._cachedGH) * 0.5;
        const depthRange = Math.max(0, waterSurface - tur._cachedGH - 2.0);
        const depthFrac = (tur.phase % 1.0) - 0.5;
        const rawTy = midY + depthFrac * depthRange + Math.sin(turtleTime * tur.speed * 1.2 + tur.phase) * 0.65;
        const ty = Math.max(tur._cachedGH + 0.6, Math.min(waterSurface - 0.8, rawTy));

        dummy.position.set(tx, ty, tz);
        const bankRoll = -Math.sin(currentAng) * 0.18 * dir;
        const pitchAngle = Math.cos(turtleTime * tur.speed * 1.2 + tur.phase) * 0.08;
        dummy.rotation.set(pitchAngle, heading, bankRoll);
        dummy.scale.setScalar(tur.scale);
        dummy.updateMatrix();
        this.terrain._seaTurtleMesh.setMatrixAt(i, dummy.matrix);
      }
      this.terrain._seaTurtleMesh.instanceMatrix.needsUpdate = true;
    }
    if (this.terrain._seaTurtleShader?.uniforms?.uTime) {
      this.terrain._seaTurtleShader.uniforms.uTime.value = t;
    }

    // Update Manta Rays pelagic soaring & banking
    if (this.terrain._mantaRayMesh && this.terrain._mantaRayData) {
      const dummy = this._mantaDummy = this._mantaDummy || new THREE.Object3D();
      const mantaTime = t;
      const len = this.terrain._mantaRayData.length;
      for (let i = 0; i < len; i++) {
        const ray = this.terrain._mantaRayData[i];
        const dir = ray.dir || 1;
        const currentAng = ray.phase + mantaTime * ray.orbitSpeed * dir;
        const wanderX = Math.sin(mantaTime * 0.16 + ray.phase) * 8.0;
        const wanderZ = Math.cos(mantaTime * 0.13 + ray.phase * 1.2) * 8.0;
        const mx = ray.cx + Math.cos(currentAng) * ray.radiusX * 4.0 + wanderX;
        const mz = ray.cz + Math.sin(currentAng) * ray.radiusZ * 4.0 + wanderZ;

        const dx = -Math.sin(currentAng) * ray.radiusX * 4.0 * dir + Math.cos(mantaTime * 0.16 + ray.phase) * 8.0 * 0.16;
        const dz = Math.cos(currentAng) * ray.radiusZ * 4.0 * dir - Math.sin(mantaTime * 0.13 + ray.phase * 1.2) * 8.0 * 0.13;
        const heading = Math.atan2(dx, dz);

        if (refreshFishGround || ray._cachedGH === undefined) ray._cachedGH = terrainHeight(mx, mz);
        
        const waterSurface = (mz > 1050) ? 0.0 : (mz < -450 ? 182.0 : (mz < -340 && mx < 100 ? 18.0 : 12.4));
        const midY = (waterSurface + ray._cachedGH) * 0.5;
        const depthRange = Math.max(0, waterSurface - ray._cachedGH - 2.0);
        const depthFrac = (ray.phase % 1.0) - 0.5;
        const rawMy = midY + depthFrac * depthRange + Math.sin(mantaTime * ray.speed * 0.8 + ray.phase) * 0.85;
        const my = Math.max(ray._cachedGH + 1.0, Math.min(waterSurface - 1.2, rawMy));

        dummy.position.set(mx, my, mz);
        const bankRoll = -Math.sin(currentAng) * 0.28 * dir;
        const pitchAngle = Math.cos(mantaTime * ray.speed * 0.8 + ray.phase) * 0.06;
        dummy.rotation.set(pitchAngle, heading, bankRoll);
        dummy.scale.setScalar(ray.scale);
        dummy.updateMatrix();
        this.terrain._mantaRayMesh.setMatrixAt(i, dummy.matrix);
      }
      this.terrain._mantaRayMesh.instanceMatrix.needsUpdate = true;
    }
    if (this.terrain._mantaRayShader?.uniforms?.uTime) {
      this.terrain._mantaRayShader.uniforms.uTime.value = t;
    }
    if (this.terrain._anemoneMat?.uniforms?.uTime) {
      this.terrain._anemoneMat.uniforms.uTime.value = t;
    }
    if (this.terrain._kelpMat?.uniforms?.uTime) {
      this.terrain._kelpMat.uniforms.uTime.value = t;
    }
    if (this.terrain._bubbleMat?.uniforms?.uTime) {
      this.terrain._bubbleMat.uniforms.uTime.value = t;
    }
    if (this.terrain._coralMat) {
      this.terrain._coralMat.emissiveIntensity = 1.7 + Math.sin(t * 2.2) * 0.45;
    }
    if (this.terrain._reefCrystalMat) {
      this.terrain._reefCrystalMat.emissiveIntensity = 2.2 + Math.sin(t * 1.6 + 1.2) * 0.55;
    }
    if (this._windMaterials) {
      // Natural wind gust dynamics with multi-layered noise approximations
      const baseWind = 0.4;
      const macroGust = Math.sin(t * 0.15) * 0.3 + Math.sin(t * 0.05 + 2.0) * 0.3;
      const microGust = Math.sin(t * 1.2) * 0.15 * Math.max(0.0, macroGust);
      const gustIntensity = baseWind + Math.max(0.0, macroGust) + microGust;
      for (let i = 0, len = this._windMaterials.length; i < len; i++) {
        const m = this._windMaterials[i];
        if (m.userData?.windShader?.uniforms?.uTime) {
          m.userData.windShader.uniforms.uTime.value = t;
        }
        if (m.userData?.windShader?.uniforms?.uWindIntensity) {
          m.userData.windShader.uniforms.uWindIntensity.value = gustIntensity;
        }
      }
    }
    if (this.selRing && this.selRing.visible) {
      this.selRing.rotation.z = t * 0.6;
      const s = 1 + Math.sin(t * 3) * 0.06;
      this.selRing.scale.set(s, s, 1);
    }

    // Dynamic Multi-Zone Underwater Atmosphere Transition (Glacial Tarn, Mirror Lake, Southern Ocean)
    const camPos = this.camera.position;
    const camX = camPos.x;
    const camY = camPos.y;
    const camZ = camPos.z;

    // 1. Highland Glacial Tarn Water Basin (High-altitude crystal lake at y=182.0m, deep basin floor y=158m, z=-460..-570, |x| < 60)
    const isUnderTarn = (Math.abs(camX) < 62 && camZ <= -455 && camZ >= -635) && camY < 182.2;

    // 2. Waterfall Plunge Pool (y=18.0m, bed at 4.5m)
    const dPlunge = Math.hypot(camX, camZ - (-360));
    const isUnderPlunge = dPlunge < 58.0 && camY < 18.2;

    // 3. Mirror Lake Basin (Freshwater lake at y=12.5, deep basin floor y=-2.0m) & Rainbow River
    const dRiver = distToRiver(camX, camZ);
    const localRiverY = riverWaterElevation(camX, camZ);
    const isUnderLake = (Math.hypot(camX - WORLD.lake.x, camZ - WORLD.lake.z) < (WORLD.lake.r + 5.0) && camY < (WORLD.waterLevel + 0.2)) ||
                        (dRiver < 32.0 && camY < (localRiverY + 0.3));

    // 4. Southern Ocean Coral Reef & Abyss (Marine abyss at z > 915, ocean level y=0.35, seabed y=-42m)
    const isUnderOcean = camZ > 915 && camY < (WORLD.oceanLevel || 0.35);

    const isUnderwater = isUnderTarn || isUnderPlunge || isUnderLake || isUnderOcean;

    // Beer-Lambert Exponential Depth Extinction & Target Atmospheric Parameters (Crystal Luminous Visibility)
    let targetDensity = 0.0008;
    let targetNear = 5.0;
    let targetFar = 450.0;

    this._colSunlitAqua = this._colSunlitAqua || new THREE.Color(0x60e0ff); // More vibrant sunlit crystal aqua
    this._colDeepAbyssal = this._colDeepAbyssal || new THREE.Color(0x1878a8); // Richer abyss
    this._colAbyssBg1 = this._colAbyssBg1 || new THREE.Color(0x1878a8);
    this._colAbyssBg2 = this._colAbyssBg2 || new THREE.Color(0x12527c);
    this._colTarnFog1 = this._colTarnFog1 || new THREE.Color(0x58d8f0);
    this._colTarnFog2 = this._colTarnFog2 || new THREE.Color(0x2888a8);
    this._colLakeFog1 = this._colLakeFog1 || new THREE.Color(0x48f8d8);
    this._colLakeFog2 = this._colLakeFog2 || new THREE.Color(0x228898);

    if (isUnderOcean) {
      // Exponential Beer-Lambert depth extinction from sunlit aquamarine to clear deep abyss
      const depth = Math.max(0.0, 0.35 - camY);
      const extinction = Math.exp(-depth * 0.015); // Clearer depth penetration
      this._underwaterTargetFog.copy(this._colSunlitAqua).lerp(this._colDeepAbyssal, 1.0 - extinction);
      this._underwaterTargetBg.copy(this._colAbyssBg1).lerp(this._colAbyssBg2, 1.0 - extinction);
      targetDensity = 0.0003 + (1.0 - extinction) * 0.0002; // Enhanced crystal clarity
      targetNear = 15.0; // Pushed out for near-field clarity
      targetFar = 850.0 - (1.0 - extinction) * 150.0;
    } else if (isUnderTarn) {
      const tarnDepth = Math.max(0.0, 182.0 - camY);
      const tarnExtinction = Math.exp(-tarnDepth * 0.025);
      this._underwaterTargetFog.copy(this._colTarnFog1).lerp(this._colTarnFog2, 1.0 - tarnExtinction);
      this._underwaterTargetBg.setHex(0x2888a8);
      targetDensity = 0.0004;
      targetNear = 10.0;
      targetFar = 700.0;
    } else if (isUnderPlunge) {
      const plungeDepth = Math.max(0.0, 18.0 - camY);
      const plungeExtinction = Math.exp(-plungeDepth * 0.03);
      this._underwaterTargetFog.copy(this._colTarnFog1).lerp(this._colTarnFog2, 1.0 - plungeExtinction);
      this._underwaterTargetBg.setHex(0x2888a8);
      targetDensity = 0.0005;
      targetNear = 10.0;
      targetFar = 650.0;
    } else if (isUnderLake) {
      const lakeDepth = Math.max(0.0, 12.5 - camY);
      const lakeExtinction = Math.exp(-lakeDepth * 0.025);
      this._underwaterTargetFog.copy(this._colLakeFog1).lerp(this._colLakeFog2, 1.0 - lakeExtinction);
      this._underwaterTargetBg.setHex(0x228898);
      targetDensity = 0.0004;
      targetNear = 10.0;
      targetFar = 720.0;
    } else {
      this._underwaterTargetFog.setHex(0x247898);
      this._underwaterTargetBg.setHex(0x1e7888);
    }

    // Smooth organic dive transition with zero pops (exact exponential damping)
    const targetBlend = isUnderwater ? 1.0 : 0.0;
    // Visceral realistic transition: rapid plunge submersion (12.0), slow viscous water drip clearing off the lens (4.5)
    const blendSpeed = isUnderwater ? 12.0 : 4.5;
    const blendDamp = 1.0 - Math.exp(-blendSpeed * dt);
    this._underwaterBlend = this._underwaterBlend || 0.0;
    this._underwaterBlend += (targetBlend - this._underwaterBlend) * blendDamp;

    if (this.scene.fog) {
      if (this._underwaterBlend < 0.001) {
        // Base aerial atmosphere
        this._origFogColor.copy(this.scene.fog.color);
        if (this.scene.fog.isFogExp2) {
          this._origFogDensity = this.scene.fog.density;
        } else if (this.scene.fog.isFog) {
          this._origFogNear = this.scene.fog.near;
          this._origFogFar = this.scene.fog.far;
        }
        if (this.scene.background && this.scene.background.isColor) {
          this._origBgColor.copy(this.scene.background);
        }
        if (this.lighting.sky) this.lighting.sky.visible = true;
        this._isUnderwaterState = false;
      } else {
        this._isUnderwaterState = true;
        // Smoothly blend fog color from atmospheric sky to deep crystal turquoise / sapphire ocean
        this._currentFogColor.copy(this._origFogColor).lerp(this._underwaterTargetFog, this._underwaterBlend);
        this.scene.fog.color.copy(this._currentFogColor);

        if (this.scene.fog.isFogExp2) {
          const aerialDensity = this._origFogDensity || 0.000065;
          this.scene.fog.density = aerialDensity + (targetDensity - aerialDensity) * this._underwaterBlend;
        } else if (this.scene.fog.isFog) {
          const aerialNear = this._origFogNear || 1200;
          const aerialFar = this._origFogFar || 18000;
          this.scene.fog.near = aerialNear + (targetNear - aerialNear) * this._underwaterBlend;
          this.scene.fog.far = aerialFar + (targetFar - aerialFar) * this._underwaterBlend;
        }

        // Never turn background black - maintain illuminated crystal sapphire / aquamarine gradient
        if (!this.scene.background || !this.scene.background.isColor) {
          this.scene.background = new THREE.Color(this._underwaterTargetBg);
        }
        this._currentBgColor.copy(this._origBgColor).lerp(this._underwaterTargetBg, this._underwaterBlend);
        this.scene.background.copy(this._currentBgColor);

        // Keep sky dome illuminated & visible without black screen clipping
        if (this.lighting.sky) {
          this.lighting.sky.visible = true;
        }
      }
    }
      // Shadow map is updated on demand during lighting phase transitions without per-frame hitching

      if (this.terrain.terrainPatch && this.terrain._updateTerrainPatch) this.terrain._updateTerrainPatch();

      if (this.lighting.useComposer && this.lighting.composer) {
        this.lighting.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
      if (!this._firstFrameRendered) {
        this._firstFrameRendered = true;
        console.log("[world3d] first frame"); window.__rbvBooted = true;
      }
    } catch (err) {
      console.log('[world3d] _animate error in frame, falling back to direct render:', err);
      try {
        if (this.renderer && this.scene && this.camera) {
          if (this.terrain.terrainPatch && this.terrain._updateTerrainPatch) this.terrain._updateTerrainPatch();
        this.renderer.render(this.scene, this.camera);
        }
      } catch (e2) {}
    }
  }

  dispose() {
    this._disposed = true;
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this.controls?.dispose();
    clearInterval(this._ambienceTimer);
    if (typeof window !== 'undefined') window.removeEventListener('resize', this._resizeHandler);
    window.removeEventListener('keydown', this.tourController._onKeyDown);
    window.removeEventListener('keyup', this.tourController._onKeyUp);
    this.canvas?.removeEventListener('mousedown', this.tourController._onMouseDown);
    window.removeEventListener('mousemove', this.tourController._onMouseMove);
    window.removeEventListener('mouseup', this.tourController._onMouseUp);
    this.canvas?.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas?.removeEventListener('pointerup', this._onPointerUp);
    this.canvas?.removeEventListener('pointermove', this._onPointerMove);
    this.canvas?.removeEventListener('pointerleave', this._onPointerLeave);
    this.canvas?.removeEventListener('touchstart', this.tourController._onTouchStart);
    this.canvas?.removeEventListener('touchmove', this.tourController._onTouchMove);
    this.canvas?.removeEventListener('touchend', this._onTouchEnd);

    if (this.tourController._joystick) {
      this.tourController._joystick.removeEventListener('touchstart', this.tourController._onJoystickTouchStart);
      window.removeEventListener('touchmove', this.tourController._onJoystickTouchMove);
      window.removeEventListener('touchend', this.tourController._onJoystickTouchEnd);
      window.removeEventListener('touchcancel', this.tourController._onJoystickTouchEnd);
      if (this.tourController._joystick.parentNode) {
        this.tourController._joystick.remove();
      }
      this.tourController._joystick = null;
    }

    // Dispose all scene meshes, geometries, and materials
    this.scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => {
          m.dispose();
          for (const key of Object.keys(m)) {
            if (m[key] && m[key].isTexture) m[key].dispose();
          }
          if (m.uniforms) {
            for (const uKey of Object.keys(m.uniforms)) {
              const val = m.uniforms[uKey]?.value;
              if (val && val.isTexture) val.dispose();
            }
          }
        });
      }
    });
    this.lighting._envRT?.dispose();
    this._glowTex?.dispose();
    this.lighting.pmrem?.dispose();
    this.lighting.composer?.dispose();
    this.renderer?.dispose();
    clearCache();
    if (this._fpsPill && this._fpsPill.parentNode) {
      this._fpsPill.remove();
      this._fpsPill = null;
    }
    this._fpsFrames = [];
  }

}
