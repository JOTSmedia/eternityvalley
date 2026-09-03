// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — 3D world engine (Three.js)
// A living paradise: the Rainbow Bridge at the valley's heart,
// glowing pawprints, seasonal blooms, real time-of-day skies
// and live weather moods — always gentle, always paradise.
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { mergeGeometries as _rawMergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { CSM } from 'three/addons/csm/CSM.js';

const originalSetupMaterial = CSM.prototype.setupMaterial;
CSM.prototype.setupMaterial = function(material) {
    const origObc = material.onBeforeCompile;
    originalSetupMaterial.call(this, material);
    const csmObc = material.onBeforeCompile;
    if (origObc && origObc !== csmObc) {
        material.onBeforeCompile = function(shader, renderer) {
            origObc.call(this, shader, renderer);
            csmObc.call(this, shader, renderer);
        };
    }
};

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

import { WORLD, DISTRICTS, ROADS, RIVER, RIVER_INLET, RIVER_OUTLET, terrainHeight, backgroundMountainElevation, distToRoads, distToRiver, getRiverInfo, riverWaterElevation, fbm, ridgeNoise, mulberry32, SIZE_DIMS } from './terrain.js';
import { getSeason, SEASON_STYLE, getDayPhase, PHASES, MOODS, fetchWeather } from './ambience.js';
import { Surfaces, waterNormalTexture, textures, material, createBotanicalFoliageMaterial, clearCache } from './materials.js';
import { icon, speciesIcon, speciesKey } from './icons.js';
import { charityName } from './catalog.js';
import { DRONE_TOUR_LANDMARKS } from './tour.js';
import { buildGrandBoulevard, buildSecondaryRoad } from './roads.js';


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

export class WorldLighting {
  constructor(world) {
    this.world = world;
  }

  _lights() {
    // 1. Hemisphere light: sky radiance top bounce + natural meadow ground bounce
    this.hemi = new THREE.HemisphereLight(0x5078a0, 0x384828, 0.45);
    this.world.scene.add(this.hemi);

    // 2. LightProbe: captures spherical harmonics for diffuse ambient fill
    this.lightProbe = new THREE.LightProbe();
    this.world.scene.add(this.lightProbe);

    // 3. Directional Sun/Moon with calibrated CSM cascaded shadows
    const sun = new THREE.DirectionalLight(0xfff4dc, 3.6);
    sun.position.set(-800, 950, 600);
    sun.castShadow = false; // CSM handles shadows

    const isMobileDevice = typeof window !== 'undefined' && (/Mobi|Android/i.test(navigator.userAgent) || window.innerWidth <= 768);
    this.csm = new CSM({
        maxFar: 3500,
        cascades: isMobileDevice ? 2 : 4,
        mode: 'practical',
        parent: this.world.scene,
        shadowMapSize: isMobileDevice ? 1024 : 2048,
        lightDirection: new THREE.Vector3(800, -950, -600).normalize(),
        camera: this.world.camera,
        lightIntensity: 3.6,
        lightNear: 1,
        lightFar: 6000,
        lightMargin: 200,
        customSplitsCallback: function (cascades, far, near) {
            const breaks = [];
            if (cascades === 2) {
                breaks.push(near, near + (far - near) * 0.25, far);
            } else {
                breaks.push(near, near + (far - near) * 0.05, near + (far - near) * 0.15, near + (far - near) * 0.4, far);
            }
            return breaks; // Custom splits for precise near shadow & no acne far shadow
        }
    });

    this.csm.fade = true;

    // Apply shadow biases per cascade
    this.csm.lights.forEach((light, i) => {
        // Bias decreases for distant cascades to prevent acne
        light.shadow.bias = isMobileDevice ? -0.0005 : -0.00015 - (i * 0.0001);
        light.shadow.normalBias = 0.025 + (i * 0.02);
        light.shadow.radius = 2; // PCF blur radius
    });

    this.world.renderer.shadowMap.autoUpdate = false;

    this.world.scene.add(sun);
    this.sun = sun;
  }

  _sky() {
    const skyGeo = new THREE.SphereGeometry(45000, 64, 32);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uSunPosition: { value: new THREE.Vector3(0, 1, 0) },
        uZenithColor: { value: new THREE.Color(0x0a3c7c) },
        uHorizonColor: { value: new THREE.Color(0x82c2f4) },
        uGroundColor: { value: new THREE.Color(0x384828) },
        uSunColor: { value: new THREE.Color(0xfff4dc) },
        uSunIntensity: { value: 3.6 },
      },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        #include <fog_pars_vertex>
        varying vec3 vCustomWorldPosition;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vCustomWorldPosition = worldPos.xyz;
          vec4 p = projectionMatrix * viewMatrix * worldPos;
          gl_Position = p.xyww;
                  #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        #include <fog_pars_fragment>
        uniform vec3 uSunPosition;
        uniform vec3 uZenithColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uGroundColor;
        uniform vec3 uSunColor;
        uniform float uSunIntensity;

        varying vec3 vCustomWorldPosition;

        void main() {
          vec3 dir = normalize(vCustomWorldPosition - cameraPosition);
          vec3 sunDir = normalize(uSunPosition);
          
          float elevation = dir.y;
          float cosTheta = dot(dir, sunDir);
          
          // --- 1. Multi-Octave Atmospheric Rayleigh Sky Gradient ---
          // Non-linear atmospheric optical depth curve from zenith down to horizon
          float zenithFactor = pow(clamp(elevation, 0.0, 1.0), 0.52);
          vec3 skyBase = mix(uHorizonColor, uZenithColor, zenithFactor);
          
          // Stratospheric Ozone Chappuis absorption layer (deepens royal cobalt/sapphire zenith)
          vec3 ozoneColor = uZenithColor * vec3(0.68, 0.82, 1.16);
          float ozoneMask = smoothstep(0.30, 0.95, elevation);
          skyBase = mix(skyBase, ozoneColor, ozoneMask * 0.36);
          
          // --- 2. Golden Horizon Glow & Optical Path Forward Scatter ---
          // Forward scattered light through dense horizon airmass creates warm golden/apricot radiance
          vec2 dirH = normalize(dir.xz);
          vec2 sunH = normalize(sunDir.xz);
          float sunAzimuth = max(0.0, dot(dirH, sunH));
          float horizonAirmass = exp(-max(0.0, elevation) * 4.8);
          float goldenGlow = pow(sunAzimuth, 2.2) * horizonAirmass;
          vec3 warmHorizonColor = mix(uHorizonColor, uSunColor * 1.18, 0.68);
          skyBase = mix(skyBase, warmHorizonColor, clamp(goldenGlow * 0.90 * min(1.4, uSunIntensity), 0.0, 1.0));
          
          // --- 3. Seamless Ground Hemisphere Transition ---
          // Smoothly blends from horizon atmospheric haze into ground bounce radiance (zero flat grey/brown cutoff)
          float groundBlend = 1.0 - smoothstep(-0.30, 0.03, elevation);
          vec3 groundAtmosphere = mix(uHorizonColor * 0.90, uGroundColor, 1.0 - smoothstep(-0.22, 0.0, elevation));
          vec3 atmosphere = mix(skyBase, groundAtmosphere, groundBlend);
          
          // --- 4. Radiant Solar Disc + Mie Aerosol Corona + Circumsolar Golden Halo ---
          // Apparent solar disk with sharp, radiant edge and limb darkening
          float sunDisc = smoothstep(0.99965, 0.99990, cosTheta);
          float sunCore = smoothstep(0.99988, 1.0, cosTheta);
          
          // Mie forward-scattering (Henyey-Greenstein optical aerosol phase function)
          float g = 0.93;
          float g2 = g * g;
          float mieCorona = (1.0 - g2) / pow(max(0.0001, 1.0 + g2 - 2.0 * g * max(0.0, cosTheta)), 1.5) * 0.065;
          
          // Circumsolar forward Rayleigh golden halo
          float solarHalo = pow(max(0.0, cosTheta), 3.5) * 0.28;
          
          vec3 sunRadiance = uSunColor * (sunDisc * 3.8 + sunCore * 4.8 + mieCorona * 2.0 + solarHalo) * uSunIntensity;
          
          // Atmospheric cutoff below true ground horizon with soft wrap
          float sunVisibility = smoothstep(-0.05, 0.04, elevation);
          vec3 finalColor = atmosphere + sunRadiance * sunVisibility;
          
          gl_FragColor = vec4(finalColor, 1.0);
                  #include <logdepthbuf_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });

    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.frustumCulled = false;
    this.world.scene.add(sky);
    this.sky = sky;

    // PMREM Radiance Environment Generator
    this.pmrem = new THREE.PMREMGenerator(this.world.renderer);
    this.pmrem.compileEquirectangularShader();
    this._envScene = new THREE.Scene();
    const envSky = sky.clone();
    envSky.frustumCulled = false;
    this._envSky = envSky;
    this._envScene.add(this._envSky);

    // Ground bounce plane in _envScene so lower hemisphere receives natural earth bounce
    const gGeo = new THREE.PlaneGeometry(1000000, 1000000);
    const gMat = new THREE.MeshBasicMaterial({ color: 0x384828 });
    const gMesh = new THREE.Mesh(gGeo, gMat);
    gMesh.rotation.x = -Math.PI / 2;
    gMesh.position.y = -20;
    this._envScene.add(gMesh);
    this._envGroundPlane = gMesh;

    // A photographic bloom on the sun disc itself.
    this._buildLensflare();
  }

  _updateLighting(phase, mood) {
    const p = phase || this._forcedPhase || getDayPhase();
    const rawKey = typeof p === 'string' ? p : (p?.key || 'sunlit');
    const phaseKey = (rawKey === 'day') ? 'sunlit' : rawKey;
    const m = mood || MOODS[this.mood] || (phaseKey === 'blessing' ? MOODS.blessing : MOODS.clear);

    // Dynamic Time-of-Day Spherical Solar Coordinates
    // Positioned at (-800, 950, 600) for standard daytime illumination
    const ELEV = { dawn: 8.0, sunlit: 43.5, day: 43.5, dusk: 6.0, night: 40.0, blessing: 35.0 };
    const AZI = { dawn: 85.0, sunlit: 307.0, day: 307.0, dusk: 275.0, night: 45.0, blessing: 290.0 };
    const elevation = ELEV[phaseKey] ?? 43.5;
    const azimuth = AZI[phaseKey] ?? 307.0;
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    this._sunDir = sunDir;

    // Atmospheric Sky Palette
    const SKY_PALETTE = {
      dawn: {
        zenith: 0x182a52,   // Mediterranean morning deep sapphire
        horizon: 0xf2a884,  // Radiant apricot-rose & champagne gold horizon
        ground: 0x283424,   // Soft morning loam & foliage ground bounce
        sunCol: 0xffe0ba,   // Radiant morning champagne sunlight (~3200K)
        sunInt: 2.8,
      },
      sunlit: {
        zenith: 0x093b7b,   // Rich celestial azure / cerulean sapphire zenith (5600K daylight)
        horizon: 0x8ac4f6,  // Radiant golden-tinted azure horizon
        ground: 0x384828,   // Deep rich meadow ground bounce
        sunCol: 0xfff5dd,   // Warm natural 5600K champagne gold sunlight
        sunInt: 3.6,
      },
      day: {
        zenith: 0x093b7b,
        horizon: 0x8ac4f6,
        ground: 0x384828,
        sunCol: 0xfff5dd,
        sunInt: 3.6,
      },
      dusk: {
        zenith: 0x121c3e,   // Deep twilight sapphire-violet
        horizon: 0xea7236,  // Radiant molten coral & amber sunset horizon (~2200K)
        ground: 0x2e1e16,   // Warm terracotta shadow ground bounce
        sunCol: 0xff883c,   // Molten gold-orange sunset
        sunInt: 2.8,
      },
      night: {
        zenith: 0x040c1e,   // Lapis-lazuli deep midnight space zenith
        horizon: 0x122444,  // Luminous celestial starlight horizon (~8500K)
        ground: 0x0a1412,   // Moonlit pasture ground bounce
        sunCol: 0xd4ecff,   // Pristine silver-cyan moonlight
        sunInt: 1.4,
      },
      blessing: {
        zenith: 0x18345c,   // Ethereal celestial sapphire zenith
        horizon: 0xd8c8f0,  // Iridescent pearl-lavender horizon (~6200K)
        ground: 0x344c2c,   // Lush emerald-dew ground bounce
        sunCol: 0xfffae8,   // Iridescent prismatic radiance sunlight
        sunInt: 3.4,
      },
    };
    const skyPal = SKY_PALETTE[phaseKey] || SKY_PALETTE.sunlit;

    if (this.sky?.material?.uniforms) {
      const u = this.sky.material.uniforms;
      u.uSunPosition.value.copy(sunDir);
      u.uZenithColor.value.setHex(skyPal.zenith);
      u.uHorizonColor.value.setHex(skyPal.horizon);
      u.uGroundColor.value.setHex(skyPal.ground);
      u.uSunColor.value.setHex(skyPal.sunCol);
      u.uSunIntensity.value = skyPal.sunInt;
    }

    // Directional Sun, Hemisphere Fill, Aerial Perspective Fog & Exposure Matrix
    const LOOK = {
      dawn:     { exposure: 1.00, sun: 1.85, env: 0.70, hemi: 1.15, sunCol: 0xffe0ba, hemiSky: 0x6a5870, hemiGnd: 0x302820, fogCol: 0xb89084, fogDensity: 0.000075, fogNear: 1000, fogFar: 15000, stars: 0.00, clouds: 0xf4dfd4, water: 0x1c4456, bloom: 0.18, rainbow: 0.50, lanternGlow: 0.8 },
      sunlit:   { exposure: 1.05, sun: 1.95, env: 1.10, hemi: 1.30, sunCol: 0xfff5dd, hemiSky: 0x5078a0, hemiGnd: 0x384828, fogCol: 0x90b8d8, fogDensity: 0.000065, fogNear: 1200, fogFar: 18000, stars: 0.00, clouds: 0xffffff, water: 0x185874, bloom: 0.10, rainbow: 0.45, lanternGlow: 0.5 },
      day:      { exposure: 1.05, sun: 1.95, env: 1.10, hemi: 1.30, sunCol: 0xfff5dd, hemiSky: 0x5078a0, hemiGnd: 0x384828, fogCol: 0x90b8d8, fogDensity: 0.000065, fogNear: 1200, fogFar: 18000, stars: 0.00, clouds: 0xffffff, water: 0x185874, bloom: 0.10, rainbow: 0.45, lanternGlow: 0.5 },
      dusk:     { exposure: 1.00, sun: 1.85, env: 0.60, hemi: 1.15, sunCol: 0xff883c, hemiSky: 0x684848, hemiGnd: 0x2e201a, fogCol: 0xa86854, fogDensity: 0.000075, fogNear: 900,  fogFar: 14000, stars: 0.25, clouds: 0xfba680, water: 0x203848, bloom: 0.22, rainbow: 0.65, lanternGlow: 1.4 },
      night:    { exposure: 1.18, sun: 0.65, env: 0.15, hemi: 0.70, sunCol: 0xd4ecff, hemiSky: 0x1c2c3e, hemiGnd: 0x101814, fogCol: 0x142236, fogDensity: 0.000055, fogNear: 800,  fogFar: 12000, stars: 1.00, clouds: 0x42587c, water: 0x142e48, bloom: 0.38, rainbow: 0.75, lanternGlow: 2.4 },
      blessing: { exposure: 1.08, sun: 2.00, env: 0.85, hemi: 1.35, sunCol: 0xfffae8, hemiSky: 0x6c7ea8, hemiGnd: 0x344c2c, fogCol: 0xaec2dc, fogDensity: 0.000100, fogNear: 600,  fogFar: 9000,  stars: 0.15, clouds: 0xf8e8f4, water: 0x1a6078, bloom: 0.28, rainbow: 1.00, lanternGlow: 1.2 },
    };
    const look = LOOK[phaseKey] || LOOK.sunlit;

    if (this.bloomPass) {
      this.bloomPass.strength = look.bloom;
    }

    if (!this.world.scene.background || !this.world.scene.background.isColor) {
      this.world.scene.background = new THREE.Color(skyPal.zenith);
    } else {
      this.world.scene.background.set(skyPal.zenith);
    }

    if (this.csm) {
      this.csm.lightDirection.copy(sunDir).negate();
      this.csm.lights.forEach(light => {
          light.color.setHex(look.sunCol);
          light.intensity = look.sun * (m.light || 1.0);
      });
    }

    if (this.sun) {
      if (phaseKey === 'sunlit' || phaseKey === 'day') {
        this.sun.position.set(-800, 950, 600);
      } else {
        this.sun.position.copy(sunDir).multiplyScalar(3000);
      }
      this.sun.color.setHex(look.sunCol);
      this.sun.intensity = 0.0; // CSM lights handle the illumination now
    }

    if (this.hemi) {
      this.hemi.color.setHex(look.hemiSky);
      this.hemi.groundColor.setHex(look.hemiGnd);
      this.hemi.intensity = look.hemi;
    }

    if (this.world.terrain._terrainShaders) this.world.terrain._terrainShaders.forEach(s => { if (s.uniforms?.uSunDir) s.uniforms.uSunDir.value.copy(sunDir); });
    if (this.world._bgMountainShader?.uniforms?.uSunDir) {
      this.world._bgMountainShader.uniforms.uSunDir.value.copy(sunDir);
    }
    if (this.world._windMaterials) {
      for (let i = 0, len = this.world._windMaterials.length; i < len; i++) {
        const mat = this.world._windMaterials[i];
        if (mat.userData?.botanicalShader?.uniforms?.uLightDir) {
          mat.userData.botanicalShader.uniforms.uLightDir.value.copy(sunDir);
        }
        if (mat.userData?.windShader?.uniforms?.uLightDir) {
          mat.userData.windShader.uniforms.uLightDir.value.copy(sunDir);
        }
      }
    }

    // Dynamic aerial perspective exponential fog calibration
    if (this.world.scene.fog) {
      this.world.scene.fog.color.setHex(look.fogCol);
      if (this.world.scene.fog.isFogExp2) {
        const moodDensityMult = { clear: 1.0, soft: 1.3, blessing: 1.8, crystal: 1.15 }[this.mood] ?? 1.0;
        this.world.scene.fog.density = look.fogDensity * moodDensityMult;
      } else if (this.world.scene.fog.isFog) {
        this.world.scene.fog.near = look.fogNear;
        this.world.scene.fog.far = look.fogFar;
      }
    }

    this.world.renderer.toneMappingExposure = look.exposure * ((m.light || 1.0) * 0.08 + 0.92);
    this._envIntensity = look.env;
    this._updateEnvironment();
    this.world.renderer.shadowMap.needsUpdate = true;
    return { sunDir, LOOK: look, LOOKS: LOOK, SKY_PALETTE: skyPal, SKY_PALETTES: SKY_PALETTE, phaseKey };
  }

  _composer() {
    this.useComposer = false;
    return;
    const w = this.world.canvas.clientWidth || window.innerWidth || 1;
    const h = this.world.canvas.clientHeight || window.innerHeight || 1;
    const isMobile = typeof window !== 'undefined' && (/Mobi|Android/i.test(navigator.userAgent) || window.innerWidth <= 768);
    
    // Create custom render target to retain hardware MSAA (anti-aliasing) during post-processing
    const renderTarget = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      samples: isMobile ? 0 : 2,
    });
    renderTarget.depthTexture = new THREE.DepthTexture(w, h, THREE.FloatType);
    this.world.depthTexture = renderTarget.depthTexture;
    
    const composer = new EffectComposer(this.world.renderer, renderTarget);
    composer.setPixelRatio(this.world.renderer.getPixelRatio());
    composer.addPass(new RenderPass(this.world.scene, this.world.camera));

    if (!isMobile) {
      // 1. High-Fidelity Optical Bloom Pass (Peak specular solar glints, water crests, glowing rainbow, and lanterns)
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(Math.ceil(w / 2), Math.ceil(h / 2)),
        0.28,   // strength (increased for stunning HDR bloom)
        0.85,   // radius (softer cinematic spread)
        0.85,   // threshold
      );
      this.bloomPass = bloom;
      composer.addPass(bloom);

      // 1.5 God Rays Volumetric Light Scattering (Optimized)
      const GodRaysShader = {
        uniforms: {
          tDiffuse: { value: null },
          uLightPosition: { value: new THREE.Vector2(0.5, 0.5) },
          uExposure: { value: 0.18 },
          uDecay: { value: 0.93 },
          uDensity: { value: 0.96 },
          uWeight: { value: 0.4 },
          uClampMax: { value: 1.0 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D tDiffuse;
          uniform vec2 uLightPosition;
          uniform float uExposure;
          uniform float uDecay;
          uniform float uDensity;
          uniform float uWeight;
          uniform float uClampMax;
          varying vec2 vUv;
  
          void main() {
            vec4 originalColor = texture2D(tDiffuse, vUv);
            vec2 texCoord = vUv;
            vec2 deltaTextCoord = texCoord - uLightPosition;
            deltaTextCoord *= 1.0 / 25.0 * uDensity;
            
            vec3 rayColorTotal = vec3(0.0);
            float illuminationDecay = 1.0;
            
            // 25 iterations to maintain 60 FPS performance
            for(int i = 0; i < 25; i++) {
              texCoord -= deltaTextCoord;
              vec3 sampleColor = texture2D(tDiffuse, texCoord).rgb;
              float brightness = dot(sampleColor, vec3(0.299, 0.587, 0.114));
              vec3 rayColor = sampleColor * smoothstep(0.85, 1.0, brightness);
              rayColorTotal += rayColor * illuminationDecay * uWeight;
              illuminationDecay *= uDecay;
            }
            
            vec3 finalColor = originalColor.rgb + rayColorTotal * uExposure;
            gl_FragColor = vec4(clamp(finalColor, 0.0, uClampMax), originalColor.a);
          }
        `
      };
  
      const godRaysPass = new ShaderPass(GodRaysShader);
      godRaysPass.needsSwap = true;
      
      const origRender = godRaysPass.render.bind(godRaysPass);
      godRaysPass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
        if (this.world && this.world.camera && this._sunDir) {
          const sunPos = this._sunDir.clone().multiplyScalar(1e6).add(this.world.camera.position);
          sunPos.project(this.world.camera);
          const x = (sunPos.x + 1) / 2;
          const y = (sunPos.y + 1) / 2;
          if (sunPos.z > 1.0) {
             godRaysPass.uniforms.uLightPosition.value.set(-10, -10);
          } else {
             godRaysPass.uniforms.uLightPosition.value.set(x, y);
          }
        }
        origRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
      };
  
      this.godRaysPass = godRaysPass;
      composer.addPass(godRaysPass);
    }

    // 2. 35mm Lens Optical Clarity Shader Pass
    const CinematicLensShader = {
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(w, h) },
        uChromaticDispersion: { value: 0.0004 },
        uVignetteRoundness: { value: 0.85 },
        uVignetteDarkness: { value: 0.28 },
        uGrainIntensity: { value: 0.005 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform vec2 uResolution;
        uniform float uChromaticDispersion;
        uniform float uVignetteRoundness;
        uniform float uVignetteDarkness;
        uniform float uGrainIntensity;
        varying vec2 vUv;

        float hash21(vec2 p) {
          p = fract(p * vec2(234.34, 435.345));
          p += dot(p, p + 34.23);
          return fract(p.x * p.y);
        }

        void main() {
          vec2 uv = vUv;
          vec2 distFromCenter = uv - 0.5;
          float distSq = dot(distFromCenter, distFromCenter);

          // Radial Chromatic Dispersion (35mm Prime Lens)
          vec2 rOffset = distFromCenter * (uChromaticDispersion * 1.6 * distSq);
          vec2 bOffset = -distFromCenter * (uChromaticDispersion * 1.2 * distSq);
          float r = texture2D(tDiffuse, uv + rOffset).r;
          float g = texture2D(tDiffuse, uv).g;
          float b = texture2D(tDiffuse, uv + bOffset).b;
          vec3 col = vec3(r, g, b);

          // Optical Lens Vignette
          float vignette = 1.0 - smoothstep(0.4, 0.85, length(distFromCenter) * uVignetteRoundness) * uVignetteDarkness;
          col *= vignette;

          // Organic 35mm Film Grain
          float grain = (hash21(uv * uResolution + fract(uTime * 43.12)) - 0.5) * uGrainIntensity;
          col += vec3(grain);

          // Screen-Space Ambient Grounding (micro-contact contrast)
          col = pow(col, vec3(0.96));

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    };

    const lensPass = new ShaderPass(CinematicLensShader);
    composer.addPass(lensPass);
    this._cinematicPass = lensPass;

    // 3. Hollywood ACES Filmic Tone Mapping & Accurate sRGB Output
    composer.addPass(new OutputPass());

    this.composer = composer;
  }

  _stars() {
    const N = 1800;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const siz = new Float32Array(N);
    const rng = mulberry32(42);
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const a = rng() * Math.PI * 2, e = Math.acos(rng() * 0.95); // upper dome
      const r = 8000;                                            // outside the terrain, inside the sky
      pos[i * 3] = Math.cos(a) * Math.sin(e) * r;
      pos[i * 3 + 1] = Math.cos(e) * r + 100;
      pos[i * 3 + 2] = Math.sin(a) * Math.sin(e) * r;
      // Real starfields are not uniformly white: most are faint and
      // slightly warm or blue, with only a handful bright.
      const k = rng();
      c.setHSL(0.08 + rng() * 0.55, 0.35 * rng(), 0.72 + k * 0.28);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      siz[i] = (0.35 + Math.pow(rng(), 5) * 1.9) * 46;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(siz, 1));
    g.computeBoundingSphere();

    // Soft round sprites with per-star size — the default PointsMaterial
    // draws hard squares, which is the one thing a night sky must not do.
    this.starMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTex: { value: this._starSprite() }, uOpacity: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        #include <fog_pars_vertex>
        attribute float size;
        varying vec3 vColor; varying float vTw;
        uniform float uTime;
        void main(){
          vColor = color;
          vTw = 0.75 + 0.25 * sin(uTime * 1.4 + position.x * 0.01 + position.z * 0.013);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
                  #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }`,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        #include <fog_pars_fragment>
        uniform sampler2D uTex; uniform float uOpacity;
        varying vec3 vColor; varying float vTw;
        void main(){
          vec4 t = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(vColor, t.a * uOpacity * vTw);
                  #include <logdepthbuf_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      vertexColors: true,
    });
    this.stars = new THREE.Points(g, this.starMat);
    this.stars.visible = false;
    this.stars.frustumCulled = false;
    this.world.scene.add(this.stars);
  }

  _starSprite() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.22, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  _horizon() {
    // Continuous distant landscape horizon ring beyond the background mountain range (R = 5100m to 24000m)
    const ringGeo = new THREE.RingGeometry(5100, 24000, 96, 24);
    ringGeo.rotateX(-Math.PI / 2);
    ringGeo.translate(0, 0, 500);
    const rPos = ringGeo.attributes.position;
    for (let i = 0; i < rPos.count; i++) {
      const rx = rPos.getX(i), rz = rPos.getZ(i);
      const rDist = Math.hypot(rx, rz - 500);
      if (rz > 800) {
        // Southern ocean horizon
        rPos.setY(i, 0.2);
      } else {
        // Distant atmospheric horizon haze
        const tEdge = Math.max(0, Math.min(1, (rDist - 5100) / 9000));
        const edgeH = (fbm(rx * 0.00035 + 15, rz * 0.00035 + 15, 3) - 0.4) * 160;
        rPos.setY(i, Math.max(0, edgeH * (1.0 - tEdge)));
      }
    }
    ringGeo.computeVertexNormals();
    const horizonMat = new THREE.MeshStandardMaterial({
      color: 0xa0c4de,
      roughness: 0.95,
      metalness: 0.05,
      fog: true,
    });
    this.horizonMat = horizonMat;
    const horizonMesh = new THREE.Mesh(ringGeo, horizonMat);
    horizonMesh.receiveShadow = false;
    this.world.scene.add(horizonMesh);
  }

  _godRays() {
    // Ethereal subtle atmospheric haze — no fake solid plastic cylinders!
    const g = new THREE.Group();
    const rayMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xfffae0) },
        uIntensity: { value: 0.05 },
      },
      vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        #include <fog_pars_vertex>
        varying vec2 vUv;
        varying vec3 vCustomWorldNormal;
        varying vec3 vToEye;
        void main() {
          vUv = uv;
          vec4 wPos = modelMatrix * vec4(position, 1.0);
          vCustomWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          vToEye = normalize(cameraPosition - wPos.xyz + vec3(0.0001));
          gl_Position = projectionMatrix * viewMatrix * wPos;
                  #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        #include <fog_pars_fragment>
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uIntensity;
        varying vec2 vUv;
        varying vec3 vCustomWorldNormal;
        varying vec3 vToEye;

        void main() {
          float viewAngle = max(0.0, dot(vCustomWorldNormal, vToEye));
          float edgeFalloff = pow(1.0 - abs(viewAngle), 3.0);
          float verticalFade = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.60, vUv.y);
          float shimmer = sin(vUv.y * 12.0 - uTime * 0.8) * 0.08;
          float alpha = (edgeFalloff + shimmer) * verticalFade * uIntensity;
          gl_FragColor = vec4(uColor, alpha);
                  #include <logdepthbuf_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this._godRayMat = rayMat;
    // Only a single ultra-subtle mist shaft at the distant northern waterfall chasm
    const chasmRayGeo = new THREE.CylinderGeometry(18, 140, 420, 16, 1, true);
    chasmRayGeo.translate(0, -210, 0);
    const chasmMesh = new THREE.Mesh(chasmRayGeo, rayMat);
    chasmMesh.position.set(0, 240, -420);
    chasmMesh.rotation.set(0.18, 0, -0.12);
    g.add(chasmMesh);

    this.world.scene.add(g);
  }

  _updateEnvironment() {
    if (this.world.assetLoader._hdriEnvMap) {
      this.world.scene.environment = this.world.assetLoader._hdriEnvMap;
      this.world.scene.environmentIntensity = this._envIntensity || 1.15;
      return;
    }
    if (!this.pmrem || !this._envScene || !this._envSky || !this.sky?.material?.uniforms) return;
    const src = this.sky.material.uniforms;
    const dst = this._envSky.material.uniforms;
    for (const k of ['uSunPosition', 'uZenithColor', 'uHorizonColor', 'uGroundColor', 'uSunColor', 'uSunIntensity']) {
      if (dst[k] && src[k]) {
        if (dst[k].value && typeof dst[k].value.copy === 'function' && src[k].value) {
          dst[k].value.copy(src[k].value);
        } else {
          dst[k].value = src[k].value;
        }
      }
    }

    if (this._envGroundPlane?.material?.color) {
      const rawKey = this._forcedPhase?.key || (getDayPhase ? getDayPhase().key : 'sunlit');
      const phaseKey = (rawKey === 'day') ? 'sunlit' : rawKey;
      if (phaseKey === 'dusk') this._envGroundPlane.material.color.setHex(0x3a2c20);
      else if (phaseKey === 'dawn') this._envGroundPlane.material.color.setHex(0x283024);
      else if (phaseKey === 'night') this._envGroundPlane.material.color.setHex(0x06080a);
      else if (phaseKey === 'blessing') this._envGroundPlane.material.color.setHex(0x344c2c);
      else this._envGroundPlane.material.color.setHex(0x384828);
    }

    this._envRT?.dispose();
    this._envRT = this.pmrem.fromScene(this._envScene);
    this.world.scene.environment = this._envRT.texture;
    this.world.scene.environmentIntensity = this._envIntensity || 1.10;
  }

  applyAmbience() {
    if (this.world._disposed) return;
    const phase = this._forcedPhase || getDayPhase();
    const rawKey = typeof phase === 'string' ? phase : (phase?.key || 'sunlit');
    const phaseKey = (rawKey === 'day') ? 'sunlit' : rawKey;
    const P = PHASES[phaseKey] || PHASES[rawKey] || PHASES.sunlit || PHASES.day;
    const M = MOODS[this.mood] || (phaseKey === 'blessing' ? MOODS.blessing : MOODS.clear);

    // Delegate lighting, sun direction, hemisphere fill, and PMREM environment refresh to _updateLighting
    const { sunDir, LOOK } = this._updateLighting(phase, M);

    // --- True Photographic Aerial Perspective Fog (Atmospheric Rayleigh depth cueing) ---
    if (this.world.scene.fog) {
      this.world.scene.fog.color.setHex(LOOK.fogCol);
      if (this.world.scene.fog.isFogExp2) {
        const moodDensityMult = { clear: 1.0, soft: 1.3, blessing: 1.8, crystal: 1.15 }[this.mood] ?? 1.0;
        this.world.scene.fog.density = LOOK.fogDensity * moodDensityMult;
      } else if (this.world.scene.fog.isFog) {
        this.world.scene.fog.near = LOOK.fogNear;
        this.world.scene.fog.far = LOOK.fogFar;
      }
    }
    if (this.sky?.material) this.sky.material.fog = false;

    // --- Dynamic Stars & Twinkle ---
    this.stars.visible = LOOK.stars > 0.01;
    this.starMat.uniforms.uOpacity.value = LOOK.stars;

    // Distant horizon haze skirt matching atmospheric aerial perspective
    if (this.horizonMat) {
      this.horizonMat.visible = true;
      this.horizonMat.color.setHex(LOOK.fogCol);
    }

    if (this.world.renderer && this.world.renderer.shadowMap) {
      this.world.renderer.shadowMap.needsUpdate = true;
    }

    // --- Dynamic Volumetric Cloud Deck Color ---
    if (this._clouds) {
      this._clouds.forEach(c => {
        if (c?.material?.color && typeof c.material.color.setHex === 'function') {
          c.material.color.setHex(LOOK.clouds);
        }
      });
    }

    // --- Floating River Lanterns Glow & Emissive Radiance ---
    if (this.world.terrain._lanternMat) {
      this.world.terrain._lanternMat.emissiveIntensity = LOOK.lanternGlow;
    }

    // --- Ocean & Lake PBR Water Colors ---
    if (this.world.terrain.oceanMesh?.material?.color) {
      this.world.terrain.oceanMesh.material.color.setHex(LOOK.water);
    }
    if (this.world.waterObjects) {
      for (const w of this.world.waterObjects) {
        if (w.material?.uniforms) {
          const wu = w.material.uniforms;
          if (wu.sunDirection) wu.sunDirection.value.copy(sunDir);
          if (wu.sunColor) wu.sunColor.value.setHex(LOOK.sunCol);
          if (wu.waterColor) wu.waterColor.value.setHex(LOOK.water);
          if (wu.distortionScale) wu.distortionScale.value = (M.rainbow > 0.7 || phaseKey === 'blessing') ? 4.2 : 3.8;
        } else if (w.material?.color) {
          w.material.color.setHex(LOOK.water);
        }
      }
    }
    const allCustomWaterMats = [
      this.world.terrain._lakeShader,
      this.world.terrain._oceanShader,
      this.world.terrain._surfShader,
      this.world.terrain._oceanWaterfallShader,
      this.world.terrain._mountainWaterfallShader,
      this.world._impactRingShader,
      this.world._mistShader,
      this.world._splashShader,
      this.world.terrain.riverMat,
      this.world._waterPoolMat,
      this.world.terrain._fountainBasinMat,
      this.world.terrain._fountainCascadeMat,
      this.world.terrain._shorelineFoamMaterial,
      ...(this.world.terrain._riverMaterials || []),
    ];
    for (const mat of allCustomWaterMats) {
      if (mat?.uniforms) {
        if (mat.uniforms.waterColor) mat.uniforms.waterColor.value.setHex(LOOK.water);
        if (mat.uniforms.uDeepColor) mat.uniforms.uDeepColor.value.setHex(LOOK.water);
        if (mat.uniforms.uDeepWater) mat.uniforms.uDeepWater.value.setHex(LOOK.water);
        if (mat.uniforms.sunColor) mat.uniforms.sunColor.value.setHex(LOOK.sunCol);
        if (mat.uniforms.uSunColor) mat.uniforms.uSunColor.value.setHex(LOOK.sunCol);
        if (mat.uniforms.sunDirection) mat.uniforms.sunDirection.value.copy(sunDir);
        if (mat.uniforms.uSunDir) mat.uniforms.uSunDir.value.copy(sunDir);
        
        // Feed depth texture and camera params to support caustics and intersection foam
        if (mat.uniforms.uDepthTexture && this.world.depthTexture) mat.uniforms.uDepthTexture.value = this.world.depthTexture;
        if (mat.uniforms.cameraNear && this.world.camera) mat.uniforms.cameraNear.value = this.world.camera.near;
        if (mat.uniforms.cameraFar && this.world.camera) mat.uniforms.cameraFar.value = this.world.camera.far;
      }
    }

    // --- Bloom: calibrated optical response ---
    if (this.bloomPass) {
      this.bloomPass.strength = LOOK.bloom;
      this.bloomPass.radius = 0.50 + P.night * 0.20;
      this.bloomPass.threshold = phaseKey === 'night' ? 0.74 : 0.94;
    }

    // The rainbow: delicate atmospheric dispersion arc
    this._rainbowBase = (0.08 + 0.10 * (phaseKey === 'blessing' ? 1.0 : M.rainbow)) * (1 + P.night * 0.25);
    this._pawBase = 0.28;
  }

  forcePhase(key) {
    this._forcedPhase = key ? { key, t: 0.5 } : null;
    if (key === 'blessing') this.mood = 'blessing';
    this.applyAmbience();
  }

  _buildLensflare() {
    const flare = new Lensflare();
    flare.addElement(new LensflareElement(this.world.assetLoader._flareTexture('rgba(255,246,224,0.4)', 'rgba(255,214,150,0.1)'), 120, 0));
    flare.addElement(new LensflareElement(this.world.assetLoader._flareTexture('rgba(255,226,180,0.2)', 'rgba(255,190,120,0.04)'), 45, 0.32));
    this.lensflare = flare;
    this.sun.add(flare);
  }

  _cloudScape() {
    this._clouds = [];
    const rng = mulberry32(7024);
    // Subtle wispy alpine cirrus mist cards drifting high in the mountains
    const mistMat = Surfaces.cloudCard();
    if (mistMat) {
      mistMat.opacity = 0.35;
      mistMat.transparent = true;
      mistMat.depthWrite = false;
      mistMat.blending = THREE.AdditiveBlending;
    }
    for (let m = 0; m < 14; m++) {
      const mw = 520 + rng() * 380;
      const mh = 160 + rng() * 120;
      const mGeo = new THREE.PlaneGeometry(mw, mh);
      const mMesh = new THREE.Mesh(mGeo, mistMat);
      mMesh.position.set((rng() - 0.5) * 2600, 520 + rng() * 320, -1100 + rng() * 800);
      mMesh.rotation.x = Math.PI * 0.12;
      mMesh.rotation.y = rng() * Math.PI * 2;
      mMesh.userData = { speedX: (rng() - 0.5) * 0.4 + 0.6, origY: mMesh.position.y, phase: rng() * Math.PI * 2 };
      this.world.scene.add(mMesh);
      this._clouds.push(mMesh);
    }
  }

}
