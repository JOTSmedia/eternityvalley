// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — 3D world engine (Three.js)
// A living paradise: the Rainbow Bridge at the valley's heart,
// glowing pawprints, seasonal blooms, real time-of-day skies
// and live weather moods — always gentle, always paradise.
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js?v=6';
import { Sky } from 'three/addons/objects/Sky.js?v=6';
import { Water } from 'three/addons/objects/Water.js?v=6';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js?v=6';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js?v=6';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js?v=6';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js?v=6';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js?v=6';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js?v=6';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js?v=6';
import { mergeGeometries as _rawMergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js?v=6';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js?v=6';

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
        return merged;
    } catch (err) {
        console.warn('[world3d] mergeGeometries fallback:', err);
        return null;
    }
};
const safeMerge = mergeGeometries;

import { WORLD, DISTRICTS, ROADS, RIVER, RIVER_INLET, RIVER_OUTLET, terrainHeight, backgroundMountainElevation, distToRoads, distToRiver, getRiverInfo, riverWaterElevation, fbm, ridgeNoise, mulberry32, SIZE_DIMS } from './terrain.js?v=6';
import { getSeason, SEASON_STYLE, getDayPhase, PHASES, MOODS, fetchWeather } from './ambience.js?v=6';
import { Surfaces, waterNormalTexture, textures, material, createBotanicalFoliageMaterial, clearCache } from './materials.js?v=6';
import { icon, speciesIcon, speciesKey } from './icons.js?v=6';
import { charityName } from './catalog.js?v=6';
import { DRONE_TOUR_LANDMARKS } from './tour.js?v=6';
import { buildGrandBoulevard, buildSecondaryRoad } from './roads.js?v=6';


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
    _sharedShadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
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

export class WorldTourController {
  constructor(world) {
    this.world = world;
  }

  _setupWalkControls() {
    this.walkMode = false;
    this.tourMode = false;
    this.keysDown = { w: false, a: false, s: false, d: false, q: false, e: false, Shift: false };
    this.walkPos = new THREE.Vector3(0, 4.0, 310);
    this.walkYaw = Math.PI; // Look north towards the Rainbow Bridge
    this.walkPitch = 0.0;
    this.walkVelocity = new THREE.Vector3();
    this.eyeHeight = 2.4;
    this._isDraggingLook = false;
    this._prevMouse = { x: 0, y: 0 };
    // Pre-allocated scratch vectors to eliminate per-frame GC pressure
    this._walkForward = new THREE.Vector3();
    this._walkRight = new THREE.Vector3();
    this._walkMoveDir = new THREE.Vector3();
    this._walkLookDir = new THREE.Vector3();
    this._walkLookTarget = new THREE.Vector3();
    this._walkZero = new THREE.Vector3(0, 0, 0);
    this.world._joystickInput = new THREE.Vector2(0, 0);

    this._onKeyDown = (e) => {
      // Input focus & modal isolation: never hijack keystrokes when typing or modal is open
      const activeEl = document.activeElement;
      const isTyping = activeEl && (
        ['input', 'textarea', 'select'].includes(activeEl.tagName?.toLowerCase()) ||
        activeEl.isContentEditable ||
        activeEl.closest('input, textarea, select, [contenteditable]')
      );
      if (isTyping) return;

      const isModalOpen = !!(
        document.querySelector('#modalRoot:not(.hidden)') ||
        document.querySelector('.devotional-dialog') ||
        document.querySelector('.panel:not(.hidden)') ||
        document.querySelector('.feed-panel:not(.hidden)')
      );
      if (isModalOpen) return;

      const k = e.key.toLowerCase();

      // Drone Tour hotkeys
      if (this.tourMode) {
        if (e.code === 'Space') {
          e.preventDefault();
          this.toggleTourPlayPause();
          return;
        }
        if (k === 'arrowright' || k === 'n') {
          e.preventDefault();
          this.nextTourStage();
          return;
        }
        if (k === ' ') {
          e.preventDefault();
          this.toggleTourPause();
          return;
        }
        if (k === 'arrowleft' || k === 'p') {
          e.preventDefault();
          this.prevTourStage();
          return;
        }
        if (e.key === 'Escape' || k === 'x') {
          e.preventDefault();
          this.exitTour();
          return;
        }
      }

      // If near a sacred devotional station and user presses 'E', trigger devotional dialog
      if (k === 'e' && this._nearDevotionalTemple) {
        e.preventDefault();
        if (window.UI?.showDevotionalModal) {
          window.UI.showDevotionalModal(this._nearDevotionalTemple);
        }
        return;
      }

      if (k === 'w' || k === 'arrowup') this.keysDown.w = true;
      if (k === 's' || k === 'arrowdown') this.keysDown.s = true;
      if (k === 'a' || k === 'arrowleft') this.keysDown.a = true;
      if (k === 'd' || k === 'arrowright') this.keysDown.d = true;
      if (k === 'q') this.keysDown.q = true;
      if (k === 'e') this.keysDown.e = true;
      if (e.key === 'Shift') this.keysDown.Shift = true;

      if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(k) && !this.walkMode && !this.tourMode) {
        this.setMode('walk');
      }
    };

    this._onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') this.keysDown.w = false;
      if (k === 's' || k === 'arrowdown') this.keysDown.s = false;
      if (k === 'a' || k === 'arrowleft') this.keysDown.a = false;
      if (k === 'd' || k === 'arrowright') this.keysDown.d = false;
      if (k === 'q') this.keysDown.q = false;
      if (k === 'e') this.keysDown.e = false;
      if (e.key === 'Shift') this.keysDown.Shift = false;
    };

    this._onMouseDown = (e) => {
      if (!this.walkMode) return;
      if (e.target.closest('#sanctuaryWalkPill, #sanctuaryAmbiencePill, #topbar, .panel, .modal')) return;
      this._isDraggingLook = true;
      this._prevMouse = { x: e.clientX, y: e.clientY };
    };

    this._onMouseMove = (e) => {
      if (!this.walkMode || !this._isDraggingLook) return;
      const dx = e.clientX - this._prevMouse.x;
      const dy = e.clientY - this._prevMouse.y;
      this._prevMouse = { x: e.clientX, y: e.clientY };
      this.walkYaw -= dx * 0.0035;
      this.walkPitch = Math.max(-Math.PI * 0.40, Math.min(Math.PI * 0.40, this.walkPitch - dy * 0.0035));
    };

    this._onMouseUp = () => { this._isDraggingLook = false; };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.world.canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);

    // Touch events for mobile walkthrough
    this._onTouchStart = (e) => {
      if (!this.walkMode || !e.touches[0]) return;
      if (e.target.closest('#sanctuaryWalkPill, #walkJoystick, #sanctuaryAmbiencePill, #topbar, .panel, .modal')) return;
      this._isDraggingLook = true;
      this._prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    this._onTouchMove = (e) => {
      if (!this.walkMode || !this._isDraggingLook || !e.touches[0]) return;
      const dx = e.touches[0].clientX - this._prevMouse.x;
      const dy = e.touches[0].clientY - this._prevMouse.y;
      this._prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      this.walkYaw -= dx * 0.004;
      this.walkPitch = Math.max(-Math.PI * 0.40, Math.min(Math.PI * 0.40, this.walkPitch - dy * 0.004));
    };

    this.world.canvas.addEventListener('touchstart', this._onTouchStart, { passive: true });
    this.world.canvas.addEventListener('touchmove', this._onTouchMove, { passive: true });
    // Fixed ghost onTouchEnd

    this._initTourSpline();
  }

  _initTourSpline() {
    if (this._tourSpline && this._tourStages && this._stageArc) return;
    this._tourStages = DRONE_TOUR_LANDMARKS;

    const tourPoints = [
      // === LEG 1: THE GRAND TRIUMPHAL GATE (Stage 1: t in [0.0, 0.091], indices 0..7) ===
      new THREE.Vector3(0, 80.0, 1200),   // 0: Panoramic establishing aerial view
      new THREE.Vector3(0, 65.0, 1040),   // 1: Lining up with the grand approach
      new THREE.Vector3(0, 55.0, 980),    // 2: Monumental approach on Grand Marble Esplanade
      new THREE.Vector3(0, 52.0, 930),    // 3: Gliding between classical torchiere colonnades
      new THREE.Vector3(0, 51.0, 880),    // 4: Flight straight through triumphal archway center
      new THREE.Vector3(0, 49.0, 820),    // 5: Passing inner gate colonnade
      new THREE.Vector3(0, 45.0, 700),    // 6: Gliding down imperial avenue
      new THREE.Vector3(0, 42.0, 560),    // 7: Aligning with Rainbow Bridge south approach

      // === LEG 2: THE RAINBOW BRIDGE CREST (Stage 2: t in [0.091, 0.182], indices 8..15) ===
      new THREE.Vector3(0, 44.0, 490),    // 8: Approaching glowing prismatic bridge roadbed
      new THREE.Vector3(0, 45.0, 440),    // 9: Soaring cleanly over Rainbow Bridge apex crest
      new THREE.Vector3(0, 44.0, 400),    // 10: Soaring over northern Rainbow Bridge prism span
      new THREE.Vector3(0, 42.0, 340),    // 11: Descending northern bridge approach
      new THREE.Vector3(0, 40.0, 270),    // 12: Gliding over river boulevard lower terrace
      new THREE.Vector3(0, 39.0, 200),    // 13: Approaching Central Plaza southern promenade
      new THREE.Vector3(0, 38.0, 140),    // 14: Passing flower terraces & bronze urns
      new THREE.Vector3(0, 37.5, 85),     // 15: Entering Central Plaza outer perimeter

      // === LEG 3: CENTRAL PLAZA & LIVING FOUNTAIN (Stage 3: t in [0.182, 0.273], indices 16..23) ===
      new THREE.Vector3(0, 37.0, 70.0),    // 16: South entry to Living Fountain orbit
      new THREE.Vector3(35.4, 37.5, 55.4), // 17: Southeast orbit over outer plaza
      new THREE.Vector3(50.0, 38.0, 20.0), // 18: East orbit around fountain basin
      new THREE.Vector3(35.4, 38.0, -15.4),// 19: Northeast orbit viewing northern peaks
      new THREE.Vector3(0, 37.5, -30.0),   // 20: North orbit apex viewing cascading waterjets
      new THREE.Vector3(-35.4, 37.0, -15.4),// 21: Northwest orbit
      new THREE.Vector3(-50.0, 37.0, 20.0),// 22: West orbit closing the circle
      new THREE.Vector3(-35.4, 37.5, 55.4),// 23: Southwest orbit finishing the fountain

      // === LEG 4: CATARACT WATERFALL VERTICAL ASCENT (Stage 4: t in [0.273, 0.364], indices 24..31) ===
      new THREE.Vector3(0, 52.0, -20),    // 24: Peeling out of fountain orbit, climbing
      new THREE.Vector3(0, 64.0, -100),   // 25: Climbing high over central meadow crowns
      new THREE.Vector3(0, 70.0, -180),   // 26: Soaring over Sanctuary Tree canopy
      new THREE.Vector3(0, 60.0, -260),   // 27: Gentle descent down misty central gorge
      new THREE.Vector3(0, 65.0, -320),   // 28: Beginning ascent (smoothed from sharp dip)
      new THREE.Vector3(0, 105.0, -360),  // 29: Soaring vertically through roaring lower spray
      new THREE.Vector3(0, 150.0, -400),  // 30: Mid-cataract vertical climb
      new THREE.Vector3(0, 190.0, -470),  // 31: Cresting waterfall lip

      // === LEG 5: HIGHLAND WATER SOURCE & SUBMERGED TARN DIVE (Stage 5: t in [0.364, 0.455], indices 32..39) ===
      new THREE.Vector3(0, 178.0, -492),  // 32: Submerged dive into 24m deep Glacial Tarn
      new THREE.Vector3(12, 175.0, -512), // 33: Deep submerged tarn basin glide over granite floor
      new THREE.Vector3(14, 176.0, -528), // 34: Swimming through crystal depths
      new THREE.Vector3(0, 178.0, -540),  // 35: Cruising deep alpine tarn, curving upward
      new THREE.Vector3(-10, 185.0, -548),// 36: Approaching water surface
      new THREE.Vector3(-6, 200.0, -554), // 37: Clean breach breaking water surface
      new THREE.Vector3(0, 230.0, -565),  // 38: Majestic vertical rocket climb
      new THREE.Vector3(45, 255.0, -590), // 39: Soaring high into cathedral aerial orbit approach

      // === LEG 6: UNIVERSAL CATHEDRAL AERIAL ORBIT (Stage 6: t in [0.455, 0.545], indices 40..47) ===
      new THREE.Vector3(90, 260.0, -640), // 40: High East aerial orbit
      new THREE.Vector3(0, 270.0, -740),  // 41: High North aerial orbit commanding panoramic vista
      new THREE.Vector3(-90, 260.0, -640),// 42: High West aerial orbit
      new THREE.Vector3(0, 205.0, -530),  // 43: Descending ceremonial avenue
      new THREE.Vector3(0, 192.0, -565),  // 44: Approaching West Portal steps
      new THREE.Vector3(0, 190.0, -600),  // 45: Entering straight between open doors
      new THREE.Vector3(-15, 190.0, -635),// 46: Banking left inside transept crossing
      new THREE.Vector3(-60, 192.0, -644),// 47: Flying out North Transept archway smoothly

      // === LEG 7: MOORISH MOSQUE OF LIGHT (Stage 7: t in [0.545, 0.636], indices 48..55) ===
      new THREE.Vector3(-150, 215.0, -530),// 48: High panoramic descent
      new THREE.Vector3(-300, 185.0, -430),// 49: Gliding along western mountain ridge
      new THREE.Vector3(-430, 150.0, -320),// 50: Approach toward turquoise ribbed dome
      new THREE.Vector3(-520, 130.0, -250),// 51: Wrapping around west side of mosque
      new THREE.Vector3(-480, 118.0, -130),// 52: Wide turn to the south of the mosque
      new THREE.Vector3(-480, 108.0, -168),// 53: Entering South Horseshoe Portal
      new THREE.Vector3(-480, 108.0, -201.5),// 54: Flying over reflecting pool
      new THREE.Vector3(-445, 110.0, -201.5),// 55: Exiting east through open arcade arch

      // === LEG 8: MIRROR LAKE & SUBMERGED AQUATIC REALM (Stage 8: t in [0.636, 0.727], indices 56..63) ===
      new THREE.Vector3(-300, 95.0, -210), // 56: Gliding east down western hillside
      new THREE.Vector3(-100, 65.0, -225), // 57: Soaring across central meadow
      new THREE.Vector3(100, 45.0, -240),  // 58: Crossing central river corridor
      new THREE.Vector3(260, 32.0, -250),  // 59: Approaching Mirror Lake western shore
      new THREE.Vector3(360, 25.0, -260),  // 60: Skim safely OVER willow canopy
      new THREE.Vector3(430, 12.0, -270),  // 61: Hydrodynamic dive into 14.5m deep lake basin
      new THREE.Vector3(455, 8.0, -305),   // 62: Cruising underwater with Golden Koi & Emperors
      new THREE.Vector3(420, 10.0, -335),  // 63: Submerged sweeping turn through sunlit caustics

      // === LEG 9: BUDDHIST PAGODA & ZEN GARDEN (Stage 9: t in [0.727, 0.818], indices 64..71) ===
      new THREE.Vector3(380, 30.0, -300),  // 64: Resurface from Mirror Lake
      new THREE.Vector3(430, 85.0, -360),  // 65: Ascending eastern forested mountain slopes
      new THREE.Vector3(490, 125.0, -435), // 66: Approaching Zen mountain terrace
      new THREE.Vector3(560, 150.0, -485), // 67: South porch axial alignment
      new THREE.Vector3(605, 160.0, -530), // 68: East spiral climb
      new THREE.Vector3(560, 175.0, -585), // 69: North spiral climb
      new THREE.Vector3(510, 190.0, -520), // 70: West spiral climb past Sōrin finial
      new THREE.Vector3(450, 150.0, -380), // 71: Exiting pagoda terrace smoothly

      // === LEG 10: KAYA ISLAND ORBIT & COASTAL CLIFF (Stage 10: t in [0.818, 0.909], indices 72..79) ===
      new THREE.Vector3(350, 100.0, -150), // 72: High coastal flight
      new THREE.Vector3(120, 65.0, 950),   // 73: Open coastal flight
      new THREE.Vector3(100, 55.0, 1980),  // 74: Approach Kaya Island from East
      new THREE.Vector3(80, 52.0, 2100),   // 75: Eastward pass by Kaya Statue Orb
      new THREE.Vector3(20, 50.0, 2140),   // 76: Curving around South of Orb
      new THREE.Vector3(-40, 45.0, 2150),  // 77: Passing West, aligning with cliff
      new THREE.Vector3(-110, 38.0, 2160), // 78: Close pass by Coastal Cliff Building (Temple of Baal)
      new THREE.Vector3(-100, -8.0, 2270), // 79: Oceanic coral abyss plunge

      // === LEG 11: CELESTIAL SUNRISE ASCENT (Stage 11: t in [0.909, 1.000], indices 80..87) ===
      new THREE.Vector3(-80, -12.0, 2280), // 80: Submarine abyss glide among manta rays
      new THREE.Vector3(-120, 38.0, 2140), // 81: Sunrise breach in western open sea
      new THREE.Vector3(-170, 95.0, 1820), // 82: Soaring climb in open sky
      new THREE.Vector3(-210, 150.0, 1520),// 83: Sweeping high altitude climb
      new THREE.Vector3(-290, 195.0, 1260),// 84: Peak panoramic vista
      new THREE.Vector3(-270, 170.0, 1050),// 85: High banking turn over western bluffs
      new THREE.Vector3(-180, 120.0, 980), // 86: Descending to y = 120m banking smoothly
      new THREE.Vector3(-70, 75.0, 960),   // 87: Final smooth tangent transition
    ];

    // Smooth Centripetal Catmull-Rom Spline with 0.4 tension (zero loops, zero jerky yaw snaps)
    this._tourSpline = new THREE.CatmullRomCurve3(tourPoints, true, 'centripetal');

    // Precompute arc length for each stage
    this._stageArc = [];
    for (const stage of this._tourStages) {
      let arc = 0;
      const steps = 64;
      for (let i = 0; i < steps; i++) {
        const t1 = stage.tStart + (stage.tEnd - stage.tStart) * (i / steps);
        const t2 = stage.tStart + (stage.tEnd - stage.tStart) * ((i + 1) / steps);
        const p1 = this._tourSpline.getPoint(t1);
        const p2 = this._tourSpline.getPoint(t2);
        arc += p1.distanceTo(p2);
      }
      this._stageArc.push(arc);
    }
    this._tourTime = 0;
    this.world._tourSpeed = 1.0;
    this.world._tourPaused = false;
    this.world._currentRoll = 0.0;
    this.world._activeStageIndex = 0;
    this._lastStageNum = -1;
  }

  _calculateTourLookTarget(t, pos, tangent, outTarget) {
    const target = outTarget || this.world._v3TourLook;
    const normT = ((t % 1.0) + 1.0) % 1.0;
    const tan = (tangent && tangent.lengthSq() > 0.0001 && !isNaN(tangent.x)) ? tangent : this.world._v3TourTan;
    const smooth = _hermiteSmooth;

    // We have 11 stages, exactly 1/11 each.
    const S = 1.0 / 11.0; 

    // === LEG 1: THE GRAND TRIUMPHAL GATE (0 to S) ===
    if (normT < S) {
      const frac = smooth(Math.min(1.0, normT / (S * 0.62)));
      const gateAim = this.world._v3TourTarget.set(0.0, 34.0, 640.0);
      const fwdAim = this.world._v3Tmp1.copy(pos).addScaledVector(tan, 45.0);
      target.copy(gateAim).lerp(fwdAim, frac);
      return target;
    }

    // === LEG 2: THE RAINBOW BRIDGE CREST (S to 2S) ===
    if (normT < 2 * S) {
      if (normT < S + S * 0.6) {
        target.set(0.0, pos.y - 12.0, pos.z - 96.0);
      } else {
        const frac = smooth((normT - (S + S * 0.6)) / (S * 0.4));
        const start = this.world._v3Tmp1.set(0.0, pos.y - 12.0, pos.z - 96.0);
        const end = this.world._v3Tmp2.set(0.0, 20.0, 20.0); // look at plaza
        target.copy(start).lerp(end, frac);
      }
      return target;
    }

    // === LEG 3: CENTRAL PLAZA & LIVING FOUNTAIN (2S to 3S) ===
    if (normT < 3 * S) {
      if (normT < 2 * S + S * 0.7) {
        target.set(0.0, 22.0, 20.0);
      } else {
        const frac = smooth((normT - (2 * S + S * 0.7)) / (S * 0.3));
        target.set(0.0, 22.0 + (30.0 - 22.0) * frac, 20.0 + (-320.0 - 20.0) * frac);
      }
      return target;
    }

    // === LEG 4: CATARACT WATERFALL VERTICAL ASCENT (3S to 4S) ===
    if (normT < 4 * S) {
      if (normT < 3 * S + S * 0.4) {
        target.set(0.0, 65.0, -380.0);
      } else if (normT < 3 * S + S * 0.8) {
        target.set(0.0, Math.min(215.0, pos.y + 35.0), -465.0);
      } else {
        const frac = smooth((normT - (3 * S + S * 0.8)) / (S * 0.2));
        target.set(0.0, 184.0 + (177.5 - 184.0) * frac, -475.0 + (-500.0 - (-475.0)) * frac);
      }
      return target;
    }

    // === LEG 5: HIGHLAND WATER SOURCE & SUBMERGED TARN DIVE (4S to 5S) ===
    if (normT < 5 * S) {
      if (normT < 4 * S + S * 0.3) {
        const frac = smooth((normT - 4 * S) / (S * 0.3));
        target.set(0.0, 172.0 + (169.0 - 172.0) * frac, -490.0 + (-515.0 - (-490.0)) * frac);
      } else if (normT < 4 * S + S * 0.7) {
        const frac = smooth((normT - (4 * S + S * 0.3)) / (S * 0.4));
        target.set(12.0 + (0.0 - 12.0) * frac, 169.0 + (174.0 - 169.0) * frac, -515.0 + (-545.0 - (-515.0)) * frac);
      } else {
        const frac = smooth((normT - (4 * S + S * 0.7)) / (S * 0.3));
        target.set(0.0, 174.0 + (235.0 - 174.0) * frac, -545.0 + (-640.0 - (-545.0)) * frac);
      }
      return target;
    }

    // === LEG 6: UNIVERSAL CATHEDRAL AERIAL ORBIT (5S to 6S) ===
    if (normT < 6 * S) {
      if (normT < 5 * S + S * 0.4) {
        target.set(0.0, 215.0, -640.0);
      } else if (normT < 5 * S + S * 0.6) {
        const frac = smooth((normT - (5 * S + S * 0.4)) / (S * 0.2));
        target.set(0.0, 215.0 + (196.0 - 215.0) * frac, -640.0 + (-600.0 - (-640.0)) * frac);
      } else if (normT < 5 * S + S * 0.8) {
        target.set(0.0, 188.5, -675.0);
      } else if (normT < 5 * S + S * 0.9) {
        const frac = smooth((normT - (5 * S + S * 0.8)) / (S * 0.1));
        target.set(0.0 + (-60.0 - 0.0) * frac, 188.5 + (190.0 - 188.5) * frac, -675.0 + (-644.0 - (-675.0)) * frac);
      } else {
        target.copy(pos).addScaledVector(tan, 36.0);
      }
      return target;
    }

    // === LEG 7: MOORISH MOSQUE OF LIGHT (6S to 7S) ===
    if (normT < 7 * S) {
      if (normT < 6 * S + S * 0.4) {
        target.set(-480.0, 118.0, -200.0);
      } else if (normT < 6 * S + S * 0.6) {
        target.set(-480.0, 104.5, -170.0);
      } else if (normT < 6 * S + S * 0.8) {
        target.set(-480.0, 104.5, -215.0);
      } else {
        const frac = smooth((normT - (6 * S + S * 0.8)) / (S * 0.2));
        target.set(-480.0 + (200.0 - (-480.0)) * frac, 104.5 + (45.0 - 104.5) * frac, -215.0 + (-240.0 - (-215.0)) * frac);
      }
      return target;
    }

    // === LEG 8: MIRROR LAKE & SUBMERGED AQUATIC REALM (7S to 8S) ===
    if (normT < 8 * S) {
      if (normT < 7 * S + S * 0.4) {
        const frac = smooth((normT - 7 * S) / (S * 0.4));
        target.set(100.0 + (400.0 - 100.0) * frac, 32.0 + (12.5 - 32.0) * frac, -240.0 + (-270.0 - -240.0) * frac);
      } else if (normT < 7 * S + S * 0.6) {
        const frac = smooth((normT - (7 * S + S * 0.4)) / (S * 0.2));
        target.set(400.0 + (448.0 - 400.0) * frac, 12.5 + (7.8 - 12.5) * frac, -270.0 + (-295.0 - -270.0) * frac);
      } else if (normT < 7 * S + S * 0.8) {
        const frac = smooth((normT - (7 * S + S * 0.6)) / (S * 0.2));
        target.set(448.0 + (460.0 - 448.0) * frac, 7.8 + (8.0 - 7.8) * frac, -295.0 + (-330.0 - -295.0) * frac);
      } else if (normT < 7 * S + S * 0.9) {
        const frac = smooth((normT - (7 * S + S * 0.8)) / (S * 0.1));
        target.set(460.0 + (385.0 - 460.0) * frac, 8.0 + (8.2 - 8.0) * frac, -330.0 + (-310.0 - -330.0) * frac);
      } else {
        const frac = smooth((normT - (7 * S + S * 0.9)) / (S * 0.1));
        target.set(385.0 + (560.0 - 385.0) * frac, 8.2 + (135.0 - 8.2) * frac, -310.0 + (-500.0 - -310.0) * frac);
      }
      return target;
    }

    // === LEG 9: BUDDHIST PAGODA & ZEN GARDEN (8S to 9S) ===
    if (normT < 9 * S) {
      if (normT < 8 * S + S * 0.4) {
        target.set(560.0, 142.0, -535.0);
      } else if (normT < 8 * S + S * 0.8) {
        target.set(560.0, Math.min(186.0, pos.y + 4.0), -540.0);
      } else {
        const frac = smooth((normT - (8 * S + S * 0.8)) / (S * 0.2));
        target.set(560.0 + (360.0 - 560.0) * frac, 186.0 + (80.0 - 186.0) * frac, -540.0 + (-180.0 - (-540.0)) * frac);
      }
      return target;
    }

    // === LEG 10: KAYA ISLAND ORBIT & COASTAL CLIFF (9S to 10S) ===
    if (normT < 10 * S) {
      const localFrac = (normT - 9 * S) / S;
      if (localFrac < 0.2) {
        const transitionFrac = smooth(localFrac / 0.2);
        target.set(
          360.0 + (20.0 - 360.0) * transitionFrac,
          80.0 + (34.0 - 80.0) * transitionFrac,
          -180.0 + (2100.0 - -180.0) * transitionFrac
        );
      } else if (localFrac < 0.6) {
        // Cinematic pan up to the central Orb (y=48.5) and then sweep around Kaya Island
        const orbitFrac = (localFrac - 0.2) / 0.4;
        const orbY = 34.0 + Math.sin(orbitFrac * Math.PI) * 14.5;
        target.set(20.0, orbY, 2100.0);
      } else if (localFrac < 0.8) {
        // Transition to Temple of Baal Idol (target higher up to see the majestic statue)
        const transitionFrac = smooth((localFrac - 0.6) / 0.2);
        target.set(
          20.0 + (-110.0 - 20.0) * transitionFrac,
          34.0 + (28.0 - 34.0) * transitionFrac,
          2100.0 + (2160.0 - 2100.0) * transitionFrac
        );
      } else {
        const transitionFrac = smooth((localFrac - 0.8) / 0.2);
        target.set(
          -110.0 + (-45.0 - -110.0) * transitionFrac,
          28.0 + (-16.0 - 28.0) * transitionFrac,
          2160.0 + (2280.0 - 2160.0) * transitionFrac
        );
      }
      return target;
    }

    // === LEG 11: CELESTIAL SUNRISE ASCENT & PANORAMA (10S to 11S) ===
    if (normT < 1.0) {
      if (normT < 10 * S + S * 0.1) {
        const frac = smooth((normT - 10 * S) / (S * 0.1));
        target.set(-45.0 + (-110.0 - -45.0) * frac, -16.0 + (12.0 - -16.0) * frac, 2280.0 + (2140.0 - 2280.0) * frac);
      } else if (normT < 10 * S + S * 0.3) {
        const frac = smooth((normT - (10 * S + S * 0.1)) / (S * 0.2));
        target.set(-110.0 + (-160.0 - -110.0) * frac, 12.0 + (85.0 - 12.0) * frac, 2140.0 + (1820.0 - 2140.0) * frac);
      } else if (normT < 10 * S + S * 0.6) {
        target.set(0.0, 75.0, 420.0);
      } else {
        const frac = smooth((normT - (10 * S + S * 0.6)) / (S * 0.4));
        target.set(0.0, 75.0 + (34.0 - 75.0) * frac, 420.0 + (640.0 - 420.0) * frac);
      }
    }

    // Steadicam Gimbal Anti-Lock Singularity Guard
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const hDistSq = dx * dx + dz * dz;
    if (hDistSq < 0.0025) {
      if (tan && (tan.x !== 0 || tan.z !== 0)) {
        target.x += tan.x * 0.1;
        target.z += tan.z * 0.1;
      } else {
        target.z += 0.1;
      }
    }

    return target;
  }

  _initWalkHUD() {
    let pill = document.getElementById('sanctuaryWalkPill');
    if (!pill) {
      pill = document.createElement('div');
      pill.className = 'sanctuary-walk-pill';
      pill.id = 'sanctuaryWalkPill';
      pill.innerHTML = `
        <button class="swp-btn" data-cam-mode="orbit">🗺️ Orbit Map</button>
        <button class="swp-btn is-active" data-cam-mode="tour">🎬 Drone Tour</button>
        <button class="swp-btn" data-cam-mode="walk">🚶 Walk (WASD)</button>
      `;
      document.body.appendChild(pill);

      pill.addEventListener('click', (e) => {
        const btn = e.target.closest('.swp-btn');
        if (!btn) return;
        if (btn.dataset.camMode === 'tour') {
          if (this.tourMode) {
            this.setMode('orbit');
            if (window.UI?._setView) window.UI._setView({ view: 'view3d', btn: 'btn3d' });
          } else {
            this.startDroneTour(0);
            if (window.UI?._setView) window.UI._setView({ view: 'view3d', btn: 'btnDroneTour' });
          }
        } else {
          this.setMode(btn.dataset.camMode);
          if (window.UI?._setView) window.UI._setView({ view: 'view3d', btn: 'btn3d' });
        }
      });
    }

    // Suppress and remove any drone tour card overlay
    const oldCard = document.getElementById('droneTourCard');
    if (oldCard) oldCard.classList.add("hidden");

    // Mobile Virtual Touch Joystick for Walk Mode
    let joystick = document.getElementById('walkJoystick');
    if (!joystick) {
      joystick = document.createElement('div');
      joystick.className = 'walk-joystick';
      joystick.id = 'walkJoystick';
      joystick.innerHTML = `
        <div class="walk-joystick-base">
          <div class="walk-joystick-knob" id="walkJoystickKnob"></div>
        </div>
      `;
      document.body.appendChild(joystick);
      
      const knob = joystick.querySelector('#walkJoystickKnob');
      let touchId = null;
      let center = { x: 0, y: 0 };
      const maxR = 38;

      this._onJoystickTouchStart = (e) => {
        if (touchId !== null) return;
        const touch = e.changedTouches[0];
        touchId = touch.identifier;
        const rect = joystick.getBoundingClientRect();
        center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        e.preventDefault();
      };

      this._onJoystickTouchMove = (e) => {
        if (touchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === touchId) {
            let dx = t.clientX - center.x;
            let dy = t.clientY - center.y;
            const dist = Math.hypot(dx, dy);
            if (dist > maxR) {
              dx = (dx / dist) * maxR;
              dy = (dy / dist) * maxR;
            }
            if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
            this.world._joystickInput.set(dx / maxR, dy / maxR);
            e.preventDefault();
            break;
          }
        }
      };

      this._onJoystickTouchEnd = (e) => {
        if (touchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === touchId) {
            touchId = null;
            if (knob) knob.style.transform = 'translate(0px, 0px)';
            this.world._joystickInput.set(0, 0);
            break;
          }
        }
      };

      joystick.addEventListener('touchstart', this._onJoystickTouchStart, { passive: false });
      window.addEventListener('touchmove', this._onJoystickTouchMove, { passive: false });
      window.addEventListener('touchend', this._onJoystickTouchEnd);
      window.addEventListener('touchcancel', this._onJoystickTouchEnd);
    }
    this._joystick = joystick;
  }

  _initFPSHUD() {
    let pill = document.getElementById('sanctuaryFpsPill');
    if (!pill) {
      pill = document.createElement('div');
      pill.className = 'sanctuary-fps-pill fps-good';
      pill.id = 'sanctuaryFpsPill';
      pill.setAttribute('aria-label', 'Real-time FPS and Render Time');
      pill.innerHTML = `
        <span class="sfp-dot"></span>
        <span class="sfp-text" id="sanctuaryFpsText"><span class="sfp-fps">60 FPS</span><span class="sfp-sep">·</span><span class="sfp-ms">16ms</span></span>
      `;
      const view3d = document.getElementById('view3d');
      if (view3d) {
        view3d.appendChild(pill);
      } else {
        document.body.appendChild(pill);
      }
    }
    this.world._fpsPill = pill;
    this.world._fpsTextEl = pill.querySelector('#sanctuaryFpsText');
  }

  toggleTourPlayPause() {
    this.world._tourPaused = !this.world._tourPaused;
  }

  nextTourStage() {
    if (!this._tourStages || this._tourStages.length === 0) return;
    const nextIdx = (this.world._activeStageIndex + 1) % this._tourStages.length;
    this.setTourStage(nextIdx);
  }

  toggleTourPause() {
    this.world._tourPaused = !this.world._tourPaused;
  }

  prevTourStage() {
    if (!this._tourStages || this._tourStages.length === 0) return;
    const prevIdx = (this.world._activeStageIndex - 1 + this._tourStages.length) % this._tourStages.length;
    this.setTourStage(prevIdx);
  }

  setTourStage(index) {
    if (!this._tourStages || index < 0 || index >= this._tourStages.length) return;
    if (!this.tourMode) this.setMode('tour');
    const targetT = this._tourStages[index].tStart;
    this.world._tourPaused = false;
    this.world._activeStageIndex = index;
    
    if (!this._tourSpline) this._initTourSpline();
    this._tourSpline.getPoint(targetT, this.world._v3TourPos);
    if (isNaN(this.world._v3TourPos.x) || isNaN(this.world._v3TourPos.y) || isNaN(this.world._v3TourPos.z)) {
      this.world._v3TourPos.set(0, 48, 960);
    }
    const groundY = terrainHeight(this.world._v3TourPos.x, this.world._v3TourPos.z);
    const minRockY = groundY + 0.8;
    if (this.world._v3TourPos.y < minRockY) this.world._v3TourPos.y = minRockY;

    this._tourSpline.getTangent(targetT, this.world._v3TourTan);
    if (this.world._v3TourTan.lengthSq() < 0.0001 || isNaN(this.world._v3TourTan.x) || isNaN(this.world._v3TourTan.y) || isNaN(this.world._v3TourTan.z)) {
      this.world._v3TourTan.set(0, 0, -1);
    } else {
      this.world._v3TourTan.normalize();
    }

    this._calculateTourLookTarget(targetT, this.world._v3TourPos, this.world._v3TourTan, this.world._v3TourLook);
    if (this.world._v3TourLook.distanceToSquared(this.world._v3TourPos) < 1.0) {
      this.world._v3TourLook.copy(this.world._v3TourPos).addScaledVector(this.world._v3TourTan, 50.0);
    }

    // Instant seamless transition to stage landmark
    this._stageTween = null;
    this.world.camera.position.copy(this.world._v3TourPos);
    if (!this.world._currentLook) this.world._currentLook = new THREE.Vector3();
    this.world._currentLook.copy(this.world._v3TourLook);
    this.world.camera.up.set(0, 1, 0);
    this.world._currentRoll = 0.0;
    this.world.camera.lookAt(this.world._currentLook);
    this.world._currentQuat = this.world.camera.quaternion.clone();

    this._tourTime = targetT;
    this._updateTourHUD(targetT, true);
  }

  startDroneTour(stageIndex = 0) {
    this.setMode('tour');
    this.setTourStage(stageIndex);
  }

  exitTour() {
    this.setMode('orbit');
    if (window.UI?._setView) {
      window.UI._setView({ view: 'view3d', btn: 'btn3d' });
    }
  }

  _updateTourHUD(t, force = false) {
    if (!this._tourStages || this._tourStages.length === 0) return;
    let activeStage = this._tourStages[0];
    for (let i = 0; i < this._tourStages.length; i++) {
      const s = this._tourStages[i];
      if (t >= s.tStart && (t < s.tEnd || i === this._tourStages.length - 1)) {
        activeStage = s;
        break;
      }
    }
    this.world._activeStageIndex = this._tourStages.indexOf(activeStage);
    
    let card = document.getElementById('droneTourCard');
    if (this._lastStageNum !== activeStage.stage || !card || force) {
      this._lastStageNum = activeStage.stage;
      
      if (!card) {
        card = document.createElement('div');
        card.id = 'droneTourCard';
        document.body.appendChild(card);
        
        // Add event listeners (delegation)
        card.addEventListener('click', (e) => {
          const btn = e.target.closest('.dtc-btn');
          if (!btn) return;
          if (btn.classList.contains('dtc-prev')) this.prevTourStage();
          if (btn.classList.contains('dtc-next')) this.nextTourStage();
          if (btn.classList.contains('dtc-play')) this.toggleTourPause();
          if (btn.classList.contains('dtc-exit')) this.exitTour();
          if (btn.classList.contains('dtc-speed')) {
            const currentSpeed = this.world._tourSpeedMultiplier || 1.0;
            if (currentSpeed === 1.0) this.world._tourSpeedMultiplier = 1.5;
            else if (currentSpeed === 1.5) this.world._tourSpeedMultiplier = 2.0;
            else if (currentSpeed === 2.0) this.world._tourSpeedMultiplier = 0.5;
            else this.world._tourSpeedMultiplier = 1.0;
            this._updateTourHUD(this._tourTime, true); // force re-render
          }
        });
      }
      
      card.classList.remove('hidden');
      const mult = this.world._tourSpeedMultiplier || 1.0;
      card.innerHTML = `
        <div class="dtc-content">
          <div class="dtc-progress-wrap"><div class="dtc-progress" id="dtcProgress"></div></div>
          <span class="dtc-title"><span class="dtc-stage">${activeStage.stage}/11</span> ${activeStage.title}</span>
          <div class="dtc-controls">
            <button class="dtc-btn dtc-speed" aria-label="Tour Speed">${mult}x</button>
            <button class="dtc-btn dtc-prev" aria-label="Previous Stage">❮</button>
            <button class="dtc-btn dtc-play" aria-label="Pause/Play">${this.world._tourPaused ? '▶' : '⏸'}</button>
            <button class="dtc-btn dtc-next" aria-label="Next Stage">❯</button>
            <button class="dtc-btn dtc-exit" aria-label="Exit Tour">✖</button>
          </div>
        </div>
      `;
    } else {
      // Just update play/pause icon if it changed
      const playBtn = card.querySelector('.dtc-play i');
      if (playBtn) playBtn.textContent = this.world._tourPaused ? '▶' : '⏸';
    }
    
    // Update progress bar every frame
    const pBar = document.getElementById('dtcProgress');
    if (pBar && activeStage.tEnd > activeStage.tStart) {
      const pct = Math.max(0, Math.min(100, ((t - activeStage.tStart) / (activeStage.tEnd - activeStage.tStart)) * 100));
      pBar.style.width = pct + '%';
    }
  }

  startEntranceFlight(opts = {}) {
    const { targetMode = 'orbit', duration = 7.0, onThresholdCross, onComplete } = opts;
    this.walkMode = false;
    this.tourMode = false;
    this.world.controls.enabled = false;
    this.world.terrain.gateTargetOpen = 0.0;

    // Spline path: Outside Grand Gate -> Down Torchiere Avenue -> Through Arch Threshold -> Along Grand Boulevard -> Over Rainbow Bridge -> Central Plaza
    const pathPoints = [
      new THREE.Vector3(0, 24.0, 980),  // Outside Grand Gate establishing monumental framing in open air
      new THREE.Vector3(0, 20.0, 930),  // Gliding down the grand approach avenue between torchiere columns
      new THREE.Vector3(0, 18.0, 880),  // Passing directly through soaring upper triumphal arch threshold (middle of gate, can see top)
      new THREE.Vector3(0, 25.0, 780),  // Sweeping through inner colonnade portals onto sunlit Grand Boulevard
      new THREE.Vector3(0, 32.0, 650),  // Gliding along avenue with emerald valley panorama opening
      new THREE.Vector3(0, 42.0, 540),  // Approaching the glowing Rainbow Bridge
      new THREE.Vector3(0, 42.0, 440),  // Gracefully soaring over Rainbow Bridge prism crest in open air (y = 42m)
      new THREE.Vector3(0, 39.0, 320),  // Descending past bridge into heart of the sanctuary
      new THREE.Vector3(0, 37.5, 180),  // Approaching Central Plaza and Living Fountain
      new THREE.Vector3(0, 36.5, 60),   // Leveling off over Central Plaza looking out to northern peaks
    ];
    const lookPoints = [
      new THREE.Vector3(0, 22.0, 750),  // Looking through grand portal toward golden valley vista
      new THREE.Vector3(0, 24.0, 750),  // Focusing past the parting doors into the valley
      new THREE.Vector3(0, 34.0, 680),  // Looking down the grand sunlit boulevard
      new THREE.Vector3(0, 30.0, 560),  // Looking toward the glowing Rainbow Bridge
      new THREE.Vector3(0, 28.0, 440),  // Framing Rainbow Bridge arch
      new THREE.Vector3(0, 26.0, 300),  // Looking over the bridge into the sanctuary
      new THREE.Vector3(0, 24.0, 140),  // Framing Central Plaza and cascades
      new THREE.Vector3(0, 22.0, 20),   // Focusing on Central Plaza celestial mosaic
      new THREE.Vector3(0, 24.0, -80),  // Looking toward Sanctuary Tree and northern mountains
      new THREE.Vector3(0, 26.0, -180), // Framing northern peaks and waterfall
    ];

    this._entranceFlight = {
      spline: new THREE.CatmullRomCurve3(pathPoints),
      lookSpline: new THREE.CatmullRomCurve3(lookPoints),
      duration: Math.max(2.0, duration),
      startTime: performance.now(),
      crossedThreshold: false,
      onThresholdCross,
      onComplete,
      targetMode,
    };
  }

  setMode(mode) {
    if (this._entranceFlight) {
      this._entranceFlight = null;
    }
    if (this._stageTween) {
      this._stageTween = null;
    }

    if (!document.getElementById('sanctuaryWalkPill')) {
      this._initWalkHUD();
    }

    let pill = document.getElementById('sanctuaryWalkPill');
    if (pill) {
      pill.querySelectorAll('.swp-btn').forEach(b => {
        b.classList.toggle('is-active', b.dataset.camMode === mode);
      });
    }

    const card = document.getElementById('droneTourCard');
    if (card) card.classList.add("hidden");

    let joystick = document.getElementById('walkJoystick');
    if (joystick) {
      const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      joystick.classList.toggle('is-active', mode === 'walk' && isTouch);
    }

    let hint = document.getElementById('walkInstructionsHint');

    if (mode === 'walk') {
      this.walkMode = true;
      this.tourMode = false;
      this.world.controls.enabled = false;
      this.world.camera.up.set(0, 1, 0);
      this.world._currentRoll = 0.0;
      if (!this.walkPos) {
        this.walkPos = new THREE.Vector3(0, terrainHeight(0, 520) + 2.2, 520);
        this.walkYaw = Math.PI; // Face North down Grand Boulevard
      }
      this.world.camera.position.copy(this.walkPos);
      if (hint) hint.classList.add('is-active');
    } else if (mode === 'tour') {
      this.walkMode = false;
      this.tourMode = true;
      this.world.controls.enabled = false;
      this.world._tourPaused = false;
      this.world._tourSpeed = 1.0;
      this.world._currentRoll = 0.0;
      this.world.camera.up.set(0, 1, 0);

      if (!this._tourSpline) this._initTourSpline();
      if (typeof this._tourTime !== 'number' || isNaN(this._tourTime)) this._tourTime = 0.0;

      if (hint) hint.classList.remove('is-active');

      // Immediate camera placement and look alignment
      const t = ((this._tourTime % 1.0) + 1.0) % 1.0;
      this._tourSpline.getPoint(t, this.world._v3TourPos);
      if (isNaN(this.world._v3TourPos.x) || isNaN(this.world._v3TourPos.y) || isNaN(this.world._v3TourPos.z)) {
        this.world._v3TourPos.set(0, 48, 960);
      }
      const groundY = terrainHeight(this.world._v3TourPos.x, this.world._v3TourPos.z);
      const minRockY = groundY + 0.8;
      if (this.world._v3TourPos.y < minRockY) this.world._v3TourPos.y = minRockY;
      this.world.camera.position.copy(this.world._v3TourPos);

      this._tourSpline.getTangent(t, this.world._v3TourTan);
      if (this.world._v3TourTan.lengthSq() < 0.0001 || isNaN(this.world._v3TourTan.x) || isNaN(this.world._v3TourTan.y) || isNaN(this.world._v3TourTan.z)) {
        this.world._v3TourTan.set(0, 0, -1);
      } else {
        this.world._v3TourTan.normalize();
      }

      this._calculateTourLookTarget(t, this.world._v3TourPos, this.world._v3TourTan, this.world._v3TourLook);
      if (!this.world._currentLook) this.world._currentLook = new THREE.Vector3();
      this.world._currentLook.copy(this.world._v3TourLook);
      this.world.camera.up.set(0, 1, 0);
      this.world._currentRoll = 0.0;
      this.world.camera.lookAt(this.world._currentLook);
      this.world._currentQuat = this.world.camera.quaternion.clone();
      this._updateTourHUD(t, true);
    } else {
      this.walkMode = false;
      this.tourMode = false;
      this.world.controls.enabled = true;
      this.world.camera.up.set(0, 1, 0);
      this.world._currentRoll = 0.0;
      if (hint) hint.classList.remove('is-active');
      if (!this.world.controls.target || this.world.controls.target.lengthSq() < 1.0) {
        this.world.camera.position.set(0, 48.0, 960);
        this.world.controls.target.set(0, 36.0, 600);
      }
      this.world.controls.update();
    }
  }

  _updateWalk(dt) {
    let safeDt = dt;
    if (isNaN(safeDt) || safeDt === undefined || safeDt == null) safeDt = 0.016;
    safeDt = Math.min(Math.max(safeDt, 0.0005), 0.0333);

    // 0. Grand Entrance Flight Sequence
    if (this._entranceFlight) {
      const ef = this._entranceFlight;
      const elapsed = (performance.now() - ef.startTime) / 1000;
      const rawT = Math.min(1.0, elapsed / ef.duration);

      // Smooth easeInOutCubic curve
      const t = rawT < 0.5 ? 4 * rawT * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 3) / 2;
      const pos = ef.spline.getPoint(t, this.world._v3Tmp1);
      const look = ef.lookSpline.getPoint(t, this.world._v3Tmp2);

      // Terrain & bridge safety clearance
      const terrY = terrainHeight(pos.x, pos.z);
      const deckY = this.world._deckY ? this.world._deckY(pos.z) : null;
      const minY = Math.max(terrY + 3.2, (deckY !== null ? deckY + 3.2 : 0));
      pos.y = Math.max(pos.y, minY);

      this.world.camera.up.set(0, 1, 0);
      this.world._currentRoll = 0.0;
      this.world.camera.position.copy(pos);
      this.world.camera.lookAt(look);

      if ((pos.z <= 885 || t >= 0.20) && !ef.crossedThreshold) {
        ef.crossedThreshold = true;
        if (typeof ef.onThresholdCross === 'function') ef.onThresholdCross();
      }

      if (rawT >= 1.0) {
        const targetMode = ef.targetMode;
        const cb = ef.onComplete;
        this._entranceFlight = null;
        this.setMode(targetMode);
        if (typeof cb === 'function') cb();
      }
      return;
    }

    if (this.tourMode) {
      // this.world.terrain.gateTargetOpen = 1.0; // Let proximity check handle this

      // Stage jump smooth transition tween (0.6s cubic ease-in-out)
      if (this._stageTween) {
        const tw = this._stageTween;
        tw.elapsed += safeDt;
        const rawP = Math.min(1.0, tw.elapsed / tw.duration);
        const p = rawP < 0.5 ? 4 * rawP * rawP * rawP : 1 - Math.pow(-2 * rawP + 2, 3) / 2;
        this.world.camera.position.lerpVectors(tw.startPos, tw.endPos, p);
        this.world._currentLook.lerpVectors(tw.startLook, tw.endLook, p);
        this.world.camera.up.set(0, 1, 0);
        this.world._currentRoll = 0.0;
        this.world.camera.lookAt(this.world._currentLook);
        if (rawP >= 1.0) this._stageTween = null;
        return;
      }

      // Smooth Play / Pause acceleration & deceleration
      const targetPlaySpeed = this.world._tourPaused ? 0.0 : 1.0;
      const speedDamp = 1.0 - Math.exp(-8.0 * safeDt);
      this.world._tourSpeed += (targetPlaySpeed - this.world._tourSpeed) * speedDamp;

      // Dynamic Point of Interest speed easing across the 11 flight legs
      const currentNormT = ((this._tourTime % 1.0) + 1.0) % 1.0;
      let poiEase = 1.0;
      let stageMetres = 1000, stageSeconds = 12;
      const normT = ((this._tourTime % 1.0) + 1.0) % 1.0;

      if (this._tourStages && this._tourStages.length) {
        for (let i = 0; i < this._tourStages.length; i++) {
          const st = this._tourStages[i];
          if (normT >= st.tStart && normT <= st.tEnd + 1e-5) {
            stageMetres = this._stageArc ? this._stageArc[i] : 1000;
            stageSeconds = st.seconds || 12;
            const frac = (normT - st.tStart) / (st.tEnd - st.tStart);
            const scale = st.speedScale || 0.82;
            
            // Smoother U-shaped deceleration that holds the slowdown over the landmark
            const dist = Math.abs(frac - 0.5) * 2.0; // 0 at middle, 1 at edges
            const smoothDist = dist * dist * (3 - 2 * dist); // Smoothstep curve
            const easeRaw = scale + (1.0 - scale) * smoothDist;
            
            const easeMean = (1.0 + scale) / 2.0;
            poiEase = easeRaw / easeMean;
            break;
          }
        }
      }

      const speedMult = ((typeof this.world._tourSpeedMultiplier === 'number' && !isNaN(this.world._tourSpeedMultiplier)) ? this.world._tourSpeedMultiplier : 1.0) * 1.75;
      const targetMps = (stageMetres / stageSeconds) * poiEase;
      if (!this._tourSpline) this._initTourSpline();
      if (!this._totalSplineLength) this._totalSplineLength = this._tourSpline.getLength() || 11000;
      const stageFracPerSec = (1.0 / (this._tourStages.length || 11)) / (stageSeconds || 12);
      if (!this.world._tourPaused) this._tourTime += safeDt * stageFracPerSec * poiEase * this.world._tourSpeed * speedMult;
      if (isNaN(this._tourTime)) this._tourTime = 0.0;
      const t = ((this._tourTime % 1.0) + 1.0) % 1.0;

      if (!this._tourSpline) this._initTourSpline();

      // Spline Position (Uniform Parameterized across all 90 stage waypoints)
      this._tourSpline.getPoint(t, this.world._v3TourPos);
      if (isNaN(this.world._v3TourPos.x) || isNaN(this.world._v3TourPos.y) || isNaN(this.world._v3TourPos.z)) {
        this.world._v3TourPos.set(0, 48, 960);
      }

      // Terrain bedrock safety clearance (allows diving underwater while preventing clipping into solid bedrock)
      const groundY = terrainHeight(this.world._v3TourPos.x, this.world._v3TourPos.z);
      const minRockY = groundY + 0.8;
      if (this.world._v3TourPos.y < minRockY) {
        this.world._v3TourPos.y = minRockY;
      }

      // Smooth Look-Ahead Tangent Vector (Uniform Parameterized)
      this._tourSpline.getTangent(t, this.world._v3TourTan);
      if (this.world._v3TourTan.lengthSq() < 0.0001 || isNaN(this.world._v3TourTan.x) || isNaN(this.world._v3TourTan.y) || isNaN(this.world._v3TourTan.z)) {
        this.world._v3TourTan.set(0, 0, -1);
      } else {
        this.world._v3TourTan.normalize();
      }

      // Dynamic POI Camera Look Target (strictly forward for Legs 1 & 2, rotating & tracking POI objects for Legs 3-11)
      this._calculateTourLookTarget(t, this.world._v3TourPos, this.world._v3TourTan, this.world._v3TourLook);

      // Smoothly interpolate the look target point FIRST, then use lookAt.
      // This produces much more natural and cinematic panning than snapping the target and slerping the quaternion.
      const lookDamp = 1.0 - Math.exp(-4.5 * safeDt);
      if (!this.world._currentLook) this.world._currentLook = this.world._v3TourLook.clone();
      this.world._currentLook.lerp(this.world._v3TourLook, lookDamp);

      this.world.camera.position.copy(this.world._v3TourPos);
      this.world.camera.lookAt(this.world._currentLook);

      // Cinematic Drone Banking (roll into turns)
      const futureT = (t + 0.002) % 1.0;
      if (!this.world._v3Tmp1) this.world._v3Tmp1 = new THREE.Vector3();
      const futureTan = this._tourSpline.getTangent(futureT, this.world._v3Tmp1) || this.world._v3Tmp1;
      const yawCurrent = Math.atan2(-this.world._v3TourTan.x, -this.world._v3TourTan.z);
      const yawFuture = Math.atan2(-futureTan.x, -futureTan.z);
      let dYaw = yawFuture - yawCurrent;
      if (dYaw > Math.PI) dYaw -= Math.PI * 2;
      if (dYaw < -Math.PI) dYaw += Math.PI * 2;
      
      const isStraightLeg = (t <= 0.182);
      const targetRoll = isStraightLeg ? 0.0 : Math.max(-0.25, Math.min(0.25, dYaw * 8.0));
      const rollDamp = 1.0 - Math.exp(-3.5 * safeDt);
      this.world._currentRoll = (this.world._currentRoll || 0.0) + (targetRoll - (this.world._currentRoll || 0.0)) * rollDamp;

      this.world.camera.rotateZ(this.world._currentRoll);

      // Real-time HUD Card update
      this._updateTourHUD(t);
      return;
    }

    if (!this.walkMode) return;

    // Reset camera up vector in walk mode
    this.world.camera.up.set(0, 1, 0);

    // Rotation: Left / Right Arrow or Q / E = Turn View
    const turnSpeed = 2.4;
    if (this.keysDown.ArrowLeft || this.keysDown.q) this.walkYaw += turnSpeed * safeDt;
    if (this.keysDown.ArrowRight || this.keysDown.e) this.walkYaw -= turnSpeed * safeDt;
    if (this.keysDown.ArrowUp) this.walkPitch = Math.min(Math.PI * 0.40, this.walkPitch + turnSpeed * safeDt);
    if (this.keysDown.ArrowDown) this.walkPitch = Math.max(-Math.PI * 0.40, this.walkPitch - turnSpeed * safeDt);

    const speed = this.keysDown.Shift ? 32.0 : 16.0;
    this._walkForward.set(-Math.sin(this.walkYaw), 0, -Math.cos(this.walkYaw));
    this._walkRight.set(Math.cos(this.walkYaw), 0, -Math.sin(this.walkYaw));

    this._walkMoveDir.set(0, 0, 0);
    if (this.keysDown.w) this._walkMoveDir.add(this._walkForward);
    if (this.keysDown.s) this._walkMoveDir.sub(this._walkForward);
    if (this.keysDown.d) this._walkMoveDir.add(this._walkRight);
    if (this.keysDown.a) this._walkMoveDir.sub(this._walkRight);

    // Mobile touch joystick input integration
    if (this.world._joystickInput && this.world._joystickInput.lengthSq() > 0.001) {
      this._walkMoveDir.addScaledVector(this._walkRight, this.world._joystickInput.x);
      this._walkMoveDir.addScaledVector(this._walkForward, -this.world._joystickInput.y);
    }

    if (this._walkMoveDir.lengthSq() > 0.001) {
      this._walkMoveDir.normalize().multiplyScalar(speed);
      const accelDamp = 1.0 - Math.exp(-14.0 * safeDt);
      this.walkVelocity.lerp(this._walkMoveDir, accelDamp);
    } else {
      const decelDamp = 1.0 - Math.exp(-16.0 * safeDt);
      this.walkVelocity.lerp(this._walkZero, decelDamp);
    }

    // Candidate next position
    const candidateX = this.walkPos.x + this.walkVelocity.x * safeDt;
    const candidateZ = this.walkPos.z + this.walkVelocity.z * safeDt;

    // Obstacle & Architecture Collisions (Living Fountain, Gate Pylons, Temples)
    const OBSTACLES = [
      { x: 0, z: 20, r: 14.0 },       // Living Fountain basin
      { x: -14, z: 880, r: 3.8 },     // Grand Gate West Pylon
      { x: 14, z: 880, r: 3.8 },      // Grand Gate East Pylon
    ];

    let finalX = candidateX;
    let finalZ = candidateZ;

    for (let i = 0; i < OBSTACLES.length; i++) {
      const obs = OBSTACLES[i];
      const dx = finalX - obs.x;
      const dz = finalZ - obs.z;
      const d = Math.hypot(dx, dz);
      if (d < obs.r) {
        const push = (obs.r - d) / (d || 1);
        finalX += dx * push;
        finalZ += dz * push;
      }
    }

    // Building Walkthrough Portal & Exterior Collision Handling:
    // 1. Universal Cathedral: allow central nave aisle (Math.abs(x) < 6.5, z: -580 to -678) & open North Transept (x: -48 to 0, z: -650 to -638)
    const cathDx = finalX - WORLD.cathedral.x;
    const cathDz = finalZ - WORLD.cathedral.z;
    const inCathNave = Math.abs(cathDx) < 6.5 && finalZ <= -580 && finalZ >= -678;
    const inCathTransept = cathDx >= -48.0 && cathDx <= 0.0 && Math.abs(cathDz - (-4.0)) < 6.0;
    const inCathedral = inCathNave || inCathTransept;
    if (!inCathedral) {
      const dCath = Math.hypot(cathDx, cathDz);
      if (dCath < 26.0) {
        const push = (26.0 - dCath) / (dCath || 1);
        finalX += cathDx * push;
        finalZ += cathDz * push;
      }
    }

    // 2. Buddhist Pagoda: allow approaching open South entrance & Hondō sanctuary
    const pagDx = finalX - WORLD.buddhistTemple.x;
    const pagDz = finalZ - WORLD.buddhistTemple.z;
    const inPagEntry = Math.abs(pagDx) < 4.2 && pagDz >= -5.0 && pagDz <= 28.0;
    if (!inPagEntry) {
      const dPag = Math.hypot(pagDx, pagDz);
      if (dPag < 20.0) {
        const push = (20.0 - dPag) / (dPag || 1);
        finalX += pagDx * push;
        finalZ += pagDz * push;
      }
    }

    // 3. Moorish Mosque: allow reflecting court and prayer hall
    const mosDx = finalX - WORLD.mosque.x;
    const mosDz = finalZ - WORLD.mosque.z;
    const inMosqueCourt = Math.abs(mosDx) < 13.5 && mosDz >= -22.0 && mosDz <= 36.0;
    if (!inMosqueCourt) {
      const dMos = Math.hypot(mosDx, mosDz);
      if (dMos < 22.0) {
        const push = (22.0 - dMos) / (dMos || 1);
        finalX += mosDx * push;
        finalZ += mosDz * push;
      }
    }

    // Steep cliff climb barrier (> 1.35m vertical step blocks horizontal walking into sheer headwall)
    const currGroundY = terrainHeight(this.walkPos.x, this.walkPos.z);
    const nextGroundY = terrainHeight(finalX, finalZ);
    const stepDiff = nextGroundY - currGroundY;
    if (stepDiff > 1.35 && !inCathedral && !inPagEntry && !inMosqueCourt) {
      finalX = this.walkPos.x;
      finalZ = this.walkPos.z;
      this.walkVelocity.set(0, 0, 0);
    }

    // Keep player within sanctuary world bounds
    this.walkPos.x = Math.max(-2000, Math.min(2000, finalX));
    this.walkPos.z = Math.max(-1000, Math.min(2600, finalZ));

    // Ground height clamping (including bridge deck and interior sanctuary floors)
    const onBridge = Math.abs(this.walkPos.x) < 16 &&
                     this.walkPos.z >= (WORLD.bridge.z - 55) &&
                     this.walkPos.z <= (WORLD.bridge.z + 55);

    let groundY;
    if (onBridge) {
      groundY = (this.world._deckY(this.walkPos.z) || 2.0) + 0.15;
    } else {
      groundY = terrainHeight(this.walkPos.x, this.walkPos.z);
      const localWater = (this.walkPos.z > 915) ? (WORLD.oceanLevel || 0.35) : WORLD.waterLevel;
      if (groundY < localWater) {
        groundY = localWater;
      }
      // Floor height elevation adjustments for walkable interiors:
      if ((Math.abs(this.walkPos.x - WORLD.cathedral.x) < 12 && this.walkPos.z <= -585 && this.walkPos.z >= -682) ||
          (this.walkPos.x <= WORLD.cathedral.x && this.walkPos.x >= WORLD.cathedral.x - 48 && Math.abs(this.walkPos.z - (WORLD.cathedral.z - 4)) < 6.5)) {
        groundY = Math.max(groundY, WORLD.cathedral.y + 2.2); // Carrara marble nave & transept floor
      } else if (Math.hypot(this.walkPos.x - WORLD.buddhistTemple.x, this.walkPos.z - WORLD.buddhistTemple.z) < 15) {
        groundY = Math.max(groundY, WORLD.buddhistTemple.y + 1.88); // Pagoda veranda & Hinoki floor
      } else if (Math.hypot(this.walkPos.x - WORLD.mosque.x, this.walkPos.z - (WORLD.mosque.z + 7)) < 24) {
        groundY = Math.max(groundY, WORLD.mosque.y + 2.22); // Mosque courtyard & prayer hall marble floor
      }
    }

    // Smooth vertical ground height following
    const targetY = groundY + this.eyeHeight;
    const yDamp = 1.0 - Math.exp(-20.0 * safeDt);
    this.walkPos.y += (targetY - this.walkPos.y) * yDamp;
    
    // Hard clamp to prevent clipping under terrain bedrock during steep climbs
    if (this.walkPos.y < groundY + 0.4) {
      this.walkPos.y = groundY + 0.4;
    }

    // Gentle footsteps head bob
    const isMoving = this.walkVelocity.length() > 0.5;
    const bob = isMoving ? Math.sin(performance.now() * 0.012) * 0.05 : 0;

    this.world.camera.position.set(this.walkPos.x, this.walkPos.y + bob, this.walkPos.z);

    this._walkLookDir.set(
      -Math.sin(this.walkYaw) * Math.cos(this.walkPitch),
      Math.sin(this.walkPitch),
      -Math.cos(this.walkYaw) * Math.cos(this.walkPitch)
    );
    this._walkLookTarget.copy(this.world.camera.position).add(this._walkLookDir);
    this.world.camera.lookAt(this._walkLookTarget);
  }

  flyToPlot(plot) {
    this.world.selectPlot(plot);
  }

  flyToDistrict(key, plot) {
    if (plot) {
      this.flyToPlot(plot);
      return;
    }
    const centers = {
      meadows: { x: -120, y: 22, z: 380, dist: 180 },
      canopy: { x: -180, y: 35, z: -120, dist: 180 },
      woodland: { x: -180, y: 35, z: -120, dist: 180 },
      riverbank: { x: 180, y: 24, z: 260, dist: 160 },
      lakefront: { x: 180, y: 24, z: 260, dist: 160 },
      starlight: { x: 350, y: 28, z: -220, dist: 180 },
      beach: { x: 350, y: 28, z: -220, dist: 180 },
      kaya_island: { x: 350, y: 28, z: -220, dist: 180 },
      highland: { x: -360, y: 92, z: -380, dist: 220 },
      summit: { x: -360, y: 92, z: -380, dist: 220 },
      highland_sanctuary: { x: -360, y: 92, z: -380, dist: 220 },
      all: { x: 0, y: 160, z: 720, dist: 380 },
      overview: { x: 0, y: 160, z: 720, dist: 380 },
      desert: { x: -480, y: 32, z: 340, dist: 200 },
      bridge: { x: 0, y: 14, z: 440, dist: 150 },
      gate: { x: 0, y: 32, z: 880, dist: 160 },
    };
    const c = centers[key] || centers.all;
    const targetY = c.y !== undefined ? c.y : terrainHeight(c.x, c.z);
    _v3Temp1.set(c.x, targetY, c.z);
    this.flyTo(_v3Temp1, c.dist || 200, 1.4);
  }

  flyTo(target, distance, secs = 1.2) {
    if (!this._flyStartT) this._flyStartT = new THREE.Vector3();
    if (!this._flyStartP) this._flyStartP = new THREE.Vector3();
    if (!this._flyEndP) this._flyEndP = new THREE.Vector3();
    if (!this._flyDir) this._flyDir = new THREE.Vector3();
    if (!this._flyTarget) this._flyTarget = new THREE.Vector3();

    this._flyStartT.copy(this.world.controls.target);
    this._flyStartP.copy(this.world.camera.position);
    this._flyTarget.copy(target);
    this._flyDir.subVectors(this._flyStartP, this._flyStartT).normalize();
    if (this._flyDir.y < 0.35) this._flyDir.y = 0.55;
    this._flyDir.normalize();
    this._flyEndP.copy(this._flyTarget).addScaledVector(this._flyDir, distance);

    const startT = this._flyStartT;
    const startP = this._flyStartP;
    const endP = this._flyEndP;
    const targ = this._flyTarget;
    const t0 = performance.now();
    const durationMs = secs * 1000;

    this.world._flyTween = () => {
      const k = Math.min(1, (performance.now() - t0) / durationMs);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.world.controls.target.lerpVectors(startT, targ, e);
      this.world.camera.position.lerpVectors(startP, endP, e);
      this.world.camera.up.set(0, 1, 0);
      this.world._currentRoll = 0.0;
      if (k >= 1) this.world._flyTween = null;
    };
  }

}
