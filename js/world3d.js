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
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD, DISTRICTS, ROADS, RIVER, terrainHeight, distToRoads, distToRiver, fbm, mulberry32, SIZE_DIMS } from './terrain.js';
import { getSeason, SEASON_STYLE, getDayPhase, PHASES, MOODS, fetchWeather } from './ambience.js';
import { Surfaces, waterNormalTexture, textures, material } from './materials.js';

const V3 = THREE.Vector3;

export class World3D {
  constructor(canvas, plots, onPlotClick) {
    this.canvas = canvas;
    this.plots = plots;
    this.onPlotClick = onPlotClick;
    this.clock = new THREE.Clock();
    this.pickables = [];
    this.plotMeshIndex = new Map(); // instancedMesh -> plot[]
    this._flyTween = null;
    this._init();
  }

  // ---------------- Core setup ----------------
  _init() {
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      // The bloom pass reads back the frame, so it needs a buffer it
      // is allowed to sample rather than a directly-presented one.
      preserveDrawingBuffer: false,
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    // Exponential fog reads far more like real aerial perspective than
    // a linear ramp — distant ridges wash out the way haze actually
    // works, instead of clipping to the fog colour at a hard distance.
    scene.fog = new THREE.FogExp2(0xd8e2e8, 0.00042);
    this.scene = scene;

    const cam = new THREE.PerspectiveCamera(52, 1, 1, 12000);
    cam.position.set(0, 320, 1450);
    this.camera = cam;

    const controls = new OrbitControls(cam, this.canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.478;
    controls.minDistance = 30;
    controls.maxDistance = 2200;
    controls.target.set(0, 0, 300);
    this.controls = controls;

    this.season = getSeason();
    this.mood = 'clear';

    this._lights();
    this._sky();
    this._stars();
    this._horizon();
    this._terrain();
    this._water();
    this._river();
    this._roads();
    this._gate();
    this._plaza();
    this._rainbowBridge();
    this._pawprints();
    this._vegetation();
    this._blooms();
    this._plots();
    this._picking();
    this._composer();

    this.applyAmbience();
    setInterval(() => this.applyAmbience(), 60000);         // follow real time
    fetchWeather().then(w => { this.mood = w.mood; this.applyAmbience(); this.onAmbience?.(w, this.season); });

    addEventListener('resize', () => this._resize());
    this._resize();
    this._animate();
  }

  _resize() {
    const w = this.canvas.clientWidth || this.canvas.parentElement.clientWidth;
    const h = this.canvas.clientHeight || this.canvas.parentElement.clientHeight;
    if (w < 1 || h < 1) return;         // hidden view — keep the last good size
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _lights() {
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7f66, 0.42);
    this.scene.add(this.hemi);

    const sun = new THREE.DirectionalLight(0xffe3b0, 2.1);
    sun.position.set(-700, 800, 500);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const s = 1400;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 500, far: 6000 });
    // The sun sits 3000 units out, so the shadow frustum has to reach
    // that far; normalBias handles the peter-panning that a plain bias
    // causes on the terrain's shallow slopes.
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.6;
    sun.shadow.radius = 2;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;
  }

  // Real atmospheric scattering rather than a painted gradient. The
  // sky is computed from Rayleigh/Mie coefficients and a sun position,
  // which is why dusk goes orange at the horizon and stays blue
  // overhead on its own — no hand-tuned colour ramp involved.
  _sky() {
    const sky = new Sky();
    sky.scale.setScalar(20000);
    sky.material.depthWrite = false;
    this.scene.add(sky);
    this.sky = sky;

    const u = sky.material.uniforms;
    u.turbidity.value = 4.5;
    u.rayleigh.value = 2.2;
    u.mieCoefficient.value = 0.006;
    u.mieDirectionalG.value = 0.82;

    // The sky itself becomes the scene's light probe: every PBR
    // surface picks up sky colour and sun bounce from this, which is
    // what stops the shadowed sides reading as flat dead grey.
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.pmrem.compileEquirectangularShader();
    this._envScene = new THREE.Scene();
    this._envSky = new Sky();
    this._envSky.scale.setScalar(20000);
    this._envScene.add(this._envSky);

    // A photographic bloom on the sun disc itself.
    this._buildLensflare();
  }

  /** Regenerate the image-based lighting from the current sky. */
  _updateEnvironment() {
    if (!this.pmrem) return;
    const src = this.sky.material.uniforms;
    const dst = this._envSky.material.uniforms;
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG', 'sunPosition', 'up']) {
      if (dst[k] && src[k]) {
        dst[k].value = src[k].value?.clone?.() ?? src[k].value;
      }
    }
    this._envRT?.dispose();
    this._envRT = this.pmrem.fromScene(this._envScene);
    this.scene.environment = this._envRT.texture;
    // Night sky carries almost no energy; lift the ambient probe so
    // the valley stays readable rather than going pitch black.
    this.scene.environmentIntensity = this._envIntensity ?? 1;
  }

  _flareTexture(inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, inner);
    g.addColorStop(0.35, outer);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  _buildLensflare() {
    const flare = new Lensflare();
    flare.addElement(new LensflareElement(this._flareTexture('rgba(255,246,224,1)', 'rgba(255,214,150,0.55)'), 520, 0));
    flare.addElement(new LensflareElement(this._flareTexture('rgba(255,226,180,0.5)', 'rgba(255,190,120,0.12)'), 90, 0.32));
    flare.addElement(new LensflareElement(this._flareTexture('rgba(200,224,255,0.4)', 'rgba(150,190,255,0.08)'), 62, 0.62));
    flare.addElement(new LensflareElement(this._flareTexture('rgba(255,232,200,0.35)', 'rgba(255,200,150,0.06)'), 116, 0.95));
    this.lensflare = flare;
    this.sun.add(flare);
  }

  // ---------------- Post-processing ----------------
  _composer() {
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));

    // Bloom is what sells the rainbow, the lanterns and the candles as
    // light sources rather than bright-coloured plastic.
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(this.canvas.clientWidth || 1, this.canvas.clientHeight || 1),
      0.42,   // strength — raised after dark in applyAmbience()
      0.85,   // radius
      0.82,   // threshold: only genuinely bright pixels bloom
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    this.composer = composer;
    this.bloomPass = bloom;
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
    return new THREE.CanvasTexture(c);
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

    // Soft round sprites with per-star size — the default PointsMaterial
    // draws hard squares, which is the one thing a night sky must not do.
    this.starMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTex: { value: this._starSprite() }, uOpacity: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `
        attribute float size;
        varying vec3 vColor; varying float vTw;
        uniform float uTime;
        void main(){
          vColor = color;
          vTw = 0.75 + 0.25 * sin(uTime * 1.4 + position.x * 0.01 + position.z * 0.013);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uTex; uniform float uOpacity;
        varying vec3 vColor; varying float vTw;
        void main(){
          vec4 t = texture2D(uTex, gl_PointCoord);
          gl_FragColor = vec4(vColor, t.a * uOpacity * vTw);
        }`,
      vertexColors: true,
    });
    this.stars = new THREE.Points(g, this.starMat);
    this.stars.visible = false;
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  /**
   * The valley is only 1800 units across, but the sky dome is 20000.
   * Without this the camera sees straight past the terrain edge into
   * the scattering model's lower hemisphere — a flat brown void. A
   * large fog-coloured skirt closes that gap and reads as the haze of
   * distant land.
   */
  _horizon() {
    const geo = new THREE.RingGeometry(WORLD.size * 0.48, 9000, 96, 1);
    geo.rotateX(-Math.PI / 2);
    this.horizonMat = new THREE.MeshBasicMaterial({
      color: 0xd8e2e8, fog: false, side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(geo, this.horizonMat);
    ring.position.y = WORLD.waterLevel - 6;
    ring.renderOrder = -1;
    this.scene.add(ring);
    this.horizon = ring;
  }

  // ---------------- Terrain ----------------
  _terrain() {
    const SEG = 256, S = WORLD.size;
    const geo = new THREE.PlaneGeometry(S, S, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();

    const grass = new THREE.Color(0x6f9e5c), grassDry = new THREE.Color(0x8fa863);
    const sand = new THREE.Color(0xe0c58f);
    const desertC = new THREE.Color(0xc9a466), rock = new THREE.Color(0x8d8578);
    const rockHigh = new THREE.Color(0xa8a29a), snow = new THREE.Color(0xf2f0ea);
    const pineFloor = new THREE.Color(0x5c8250);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = terrainHeight(x, z);
      pos.setY(i, h);

      const dLake = Math.hypot(x - WORLD.lake.x, z - WORLD.lake.z) - WORLD.lake.r;
      const n = fbm(x * 0.01, z * 0.01, 2);

      if (h > 190) c.copy(rockHigh).lerp(snow, Math.min(1, (h - 190) / 130));
      else if (h > 95) c.copy(rock).lerp(rockHigh, (h - 95) / 95);
      else if (dLake < 26 && x > WORLD.lake.x - 80) c.copy(sand);            // eastern beach
      else if (dLake < 12) c.copy(sand).lerp(grass, 0.45);                    // thin shore
      else if (x < -220 && z > 180 && h < 60) c.copy(desertC).lerp(sand, n * 0.5);
      else if (z < -380 && Math.abs(x) < 260) c.copy(pineFloor).lerp(grass, n * 0.6);
      else c.copy(grass).lerp(grassDry, n);

      // path tint near roads
      if (distToRoads(x, z) < 9) c.lerp(new THREE.Color(0xbfb39a), 0.75);

      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    // Vertex colours carry the large-scale biome painting. On their own
    // that reads as flat painted card, so a neutral greyscale detail
    // map is tiled over the top to supply per-pixel albedo, normal and
    // roughness variation. Two tiling rates are used — a fine one for
    // close-range texture and a coarse one for large-scale patchiness —
    // because a single repeat at this world scale visibly grids.
    const detail = textures('groundDetail');
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      map: detail.map.clone(),
      normalMap: detail.normalMap.clone(),
      roughnessMap: detail.roughnessMap.clone(),
    });
    for (const t of [mat.map, mat.normalMap, mat.roughnessMap]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      // 55 repeats across an 1800-unit valley is ~33 units per tile:
      // fine enough to hold up at walking height, coarse enough that
      // the repeat is not legible from the overlook.
      t.repeat.set(55, 55);
      t.anisotropy = 16;
      t.needsUpdate = true;
    }
    // The detail map averages ~0.8; lifting the base colour past 1
    // keeps the ground at its intended brightness while still getting
    // the modulation.
    mat.color.setRGB(1.28, 1.28, 1.28);
    mat.normalScale = new THREE.Vector2(0.85, 0.85);

    // A second, much coarser pass of the same map breaks up the tiling
    // at distance — added through the shader so it costs one texture
    // fetch rather than a second material.
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uMacro = { value: mat.map };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uMacro;')
        .replace('#include <map_fragment>', `
          #include <map_fragment>
          // Two decorrelated low-frequency samples, centred on 1 so
          // they only modulate. These are what stop the eye locking
          // onto the repeat: the tile is still there, but no two
          // instances of it are the same brightness.
          float macroA = texture2D(uMacro, vMapUv * 0.031).g;
          float macroB = texture2D(uMacro, vMapUv * 0.0093 + vec2(0.37, 0.61)).r;
          diffuseColor.rgb *= mix(0.82, 1.18, macroA) * mix(0.90, 1.10, macroB);
        `);
    };

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.terrainMesh = mesh;
  }

  // Mirror Lake, living up to the name: a real planar reflection with
  // animated wave normals, sun specular and depth-tinted refraction.
  _water() {
    const geo = new THREE.CircleGeometry(WORLD.lake.r + 60, 96);
    const normals = waterNormalTexture();
    normals.wrapS = normals.wrapT = THREE.RepeatWrapping;

    const water = new Water(geo, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: normals,
      sunDirection: new V3(0, 1, 0),
      sunColor: 0xffe3b0,
      waterColor: 0x2e6d90,
      distortionScale: 2.6,
      fog: true,
      alpha: 0.92,
    });
    water.rotation.x = -Math.PI / 2;
    water.position.set(WORLD.lake.x, WORLD.waterLevel, WORLD.lake.z);
    this.scene.add(water);
    this.water = water;

    // The river shares the lake's look but not its reflection buffer —
    // a second full planar reflection is not worth the frame time, so
    // it uses a matched PBR material instead.
    this.waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x2e6d90,
      roughness: 0.08,
      metalness: 0.02,
      transmission: 0.55,
      thickness: 3,
      ior: 1.333,
      transparent: true,
      opacity: 0.94,
      normalMap: normals.clone(),
      normalScale: new THREE.Vector2(0.35, 0.35),
    });
    this.waterMat.normalMap.wrapS = this.waterMat.normalMap.wrapT = THREE.RepeatWrapping;
    this.waterMat.normalMap.repeat.set(14, 14);
  }

  // The Rainbow River — a gentle ribbon from Mirror Lake to the SW meadows
  _river() {
    const pts = RIVER.map(([x, z]) => new V3(x, WORLD.waterLevel - 0.2, z));
    const curve = new THREE.CatmullRomCurve3(pts);
    const divisions = 120, positions = [], indices = [], up = new V3(0, 1, 0);
    for (let i = 0; i <= divisions; i++) {
      const t = i / divisions;
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const side = new V3().crossVectors(tan, up).normalize().multiplyScalar(26);
      const a = p.clone().add(side), b = p.clone().sub(side);
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      if (i > 0) { const k = i * 2; indices.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, this.waterMat); // shares lake material (& night tint)
    this.scene.add(m);
  }

  // ---------------- Roads ----------------
  _roadRibbon(pts, width) {
    const shapePts = [];
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      shapePts.push(new V3(x, terrainHeight(x, z) + 0.6, z));
    }
    const curve = new THREE.CatmullRomCurve3(shapePts);
    const divisions = pts.length * 14;
    const positions = [], indices = [], up = new V3(0, 1, 0);
    for (let i = 0; i <= divisions; i++) {
      const t = i / divisions;
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const side = new V3().crossVectors(tan, up).normalize().multiplyScalar(width / 2);
      const a = p.clone().add(side), b = p.clone().sub(side);
      // clamp above water where a road crosses the river (stone causeway)
      a.y = Math.max(terrainHeight(a.x, a.z), WORLD.waterLevel + 0.3) + 0.6;
      b.y = Math.max(terrainHeight(b.x, b.z), WORLD.waterLevel + 0.3) + 0.6;
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      if (i > 0) {
        const k = i * 2;
        indices.push(k - 2, k - 1, k, k - 1, k + 1, k);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }

  _roads() {
    const mat = Surfaces.sand(18).clone();
    mat.color.setHex(0xc9bb9d);   // compacted gravel, warmer than beach sand
    for (const r of ROADS) {
      let geo;
      if (r.ring) {
        const pts = [];
        for (let a = 0; a <= 40; a++) {
          const t = (a / 40) * Math.PI * 2;
          pts.push([r.cx + Math.cos(t) * r.r, r.cz + Math.sin(t) * r.r]);
        }
        geo = this._roadRibbon(pts, r.w);
      } else geo = this._roadRibbon(r.pts, r.w);
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true;
      this.scene.add(m);
    }
  }

  // ---------------- The Grand Gate ----------------
  _gate() {
    const g = new THREE.Group();
    const { x, z } = WORLD.gate;
    const baseY = terrainHeight(x, z);

    const stone = Surfaces.limestone(1.6);
    const stoneDark = Surfaces.limestoneDark(1.2);
    const iron = Surfaces.iron(2);
    const gold = Surfaces.bronze(1);

    const HALF = 34; // half gate span

    // Stone columns — plinth, fluted shaft, cornice, orb finial
    const column = (cx) => {
      const col = new THREE.Group();
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 14), stoneDark);
      plinth.position.y = 3; col.add(plinth);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.4, 34, 12), stone);
      shaft.position.y = 6 + 17; col.add(shaft);
      // fluting suggestion: thin vertical ribs
      for (let i = 0; i < 8; i++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.7, 32, 0.7), stoneDark);
        const a = (i / 8) * Math.PI * 2;
        rib.position.set(Math.cos(a) * 5, 23, Math.sin(a) * 5);
        col.add(rib);
      }
      const cornice = new THREE.Mesh(new THREE.BoxGeometry(13, 3.4, 13), stone);
      cornice.position.y = 42; col.add(cornice);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 5.2, 5, 8), stoneDark);
      cap.position.y = 46; col.add(cap);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12), gold);
      orb.position.y = 50.5; col.add(orb);
      col.position.set(cx, 0, 0);
      return col;
    };
    g.add(column(-HALF), column(HALF));

    // Iron arch spanning the columns
    const archCurve = new THREE.QuadraticBezierCurve3(
      new V3(-HALF + 2, 44, 0), new V3(0, 62, 0), new V3(HALF - 2, 44, 0));
    const arch = new THREE.Mesh(new THREE.TubeGeometry(archCurve, 24, 1.1, 8), iron);
    g.add(arch);
    const arch2 = new THREE.Mesh(new THREE.TubeGeometry(archCurve, 24, 0.55, 8), iron);
    arch2.position.y = -4; g.add(arch2);
    // scroll drops between the two arch ribs
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      const p = archCurve.getPoint(t);
      const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 4.2, 6), iron);
      drop.position.set(p.x, p.y - 2.1, 0);
      g.add(drop);
      const curl = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.28, 6, 12), iron);
      curl.position.set(p.x, p.y - 5, 0);
      g.add(curl);
    }

    // "THE RAINBOW BRIDGE" sign on the arch (canvas texture)
    const cnv = document.createElement('canvas');
    cnv.width = 1024; cnv.height = 160;
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fillRect(0, 0, 1024, 160);
    ctx.font = '700 84px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8c96a';
    ctx.strokeStyle = '#3a2f14'; ctx.lineWidth = 5;
    ctx.letterSpacing = '18px';
    ctx.strokeText('THE RAINBOW BRIDGE', 512, 84);
    ctx.fillText('THE RAINBOW BRIDGE', 512, 84);
    const tex = new THREE.CanvasTexture(cnv);
    tex.anisotropy = 8;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(52, 8.2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
    sign.position.set(0, 52.5, 0.2);
    g.add(sign);

    // Twin iron gates (open inward), bars + scrollwork
    const gateLeaf = (sign_) => {
      const leaf = new THREE.Group();
      const W = HALF - 8;
      const frameTop = new THREE.Mesh(new THREE.BoxGeometry(W, 1, 1), iron);
      frameTop.position.set(W / 2, 34, 0); leaf.add(frameTop);
      const frameMid = frameTop.clone(); frameMid.position.y = 20; leaf.add(frameMid);
      const frameLow = frameTop.clone(); frameLow.position.y = 2; leaf.add(frameLow);
      for (let i = 0; i <= 10; i++) {
        const bx = (i / 10) * (W - 1) + 0.5;
        const hgt = 33 + Math.sin((i / 10) * Math.PI) * 5; // barred crest curve
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, hgt, 6), iron);
        bar.position.set(bx, hgt / 2 + 1.5, 0);
        leaf.add(bar);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.2, 6), gold);
        tip.position.set(bx, hgt + 2.6, 0);
        leaf.add(tip);
      }
      // heart-scroll centrepiece
      const scroll = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.35, 8, 20), iron);
      scroll.position.set(W / 2, 12, 0); leaf.add(scroll);
      const scroll2 = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.3, 8, 16), iron);
      scroll2.position.set(W / 2, 26.5, 0); leaf.add(scroll2);
      leaf.rotation.y = sign_ * 0.55; // ajar, welcoming
      return leaf;
    };
    const left = gateLeaf(1); left.position.set(-HALF + 7, 0, 0); g.add(left);
    const right = gateLeaf(1); right.rotation.y = Math.PI - 0.55; right.position.set(HALF - 7, 0, 0); g.add(right);

    // Flanking stone walls fading into the hills
    const wallGeo = new THREE.BoxGeometry(150, 10, 4);
    for (const s of [-1, 1]) {
      const wall = new THREE.Mesh(wallGeo, stone);
      wall.position.set(s * (HALF + 80), 5, 4);
      wall.rotation.y = s * -0.12;
      wall.castShadow = true;
      g.add(wall);
      // pilasters along the wall
      for (let i = 1; i <= 4; i++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(6, 14, 6), stoneDark);
        p.position.set(s * (HALF + 20 + i * 32), 7, 4);
        g.add(p);
        const po = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), gold);
        po.position.set(s * (HALF + 20 + i * 32), 15.5, 4);
        g.add(po);
      }
    }

    g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    g.position.set(x, baseY, z);
    this.scene.add(g);
  }

  // ---------------- Central plaza ----------------
  _plaza() {
    const { x, z, r } = WORLD.plaza;
    const y = terrainHeight(x, z);
    const g = new THREE.Group();
    const stone = Surfaces.limestone(4);
    const marble = Surfaces.marble(1);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r - 6, r - 6, 1.4, 64), stone);
    disc.position.y = 0.7; disc.receiveShadow = true; g.add(disc);
    // Fountain
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(14, 15, 3, 48), marble);
    basin.position.y = 2.2; g.add(basin);
    const waterDisc = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 0.6, 48), this.waterMat);
    waterDisc.position.y = 3.6; g.add(waterDisc);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 10, 24), marble);
    pillar.position.y = 8; g.add(pillar);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 4, 2, 32), marble);
    bowl.position.y = 13.4; g.add(bowl);
    // Angel-wing obelisk centrepiece
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.4, 9, 16), marble);
    spire.position.y = 19; g.add(spire);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.position.set(x, y, z);
    this.scene.add(g);
  }

  // ---------------- THE RAINBOW BRIDGE ----------------
  // Heart of the world: an arched stone bridge carrying the Grand
  // Boulevard over the Rainbow River, crowned by a glowing rainbow.

  // A single smooth spectral arc (shader) — soft edges, gentle shimmer
  _makeRainbowArc(r0, r1, baseOpacity) {
    const geo = new THREE.RingGeometry(r0, r1, 96, 6, 0, Math.PI);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uOpacity: { value: baseOpacity }, uTime: { value: 0 }, uR0: { value: r0 }, uR1: { value: r1 } },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vP; uniform float uOpacity, uTime, uR0, uR1;
        vec3 hsv2rgb(vec3 c){ vec3 p = abs(fract(c.xxx + vec3(0.,2./3.,1./3.))*6.-3.);
          return c.z * mix(vec3(1.), clamp(p-1.,0.,1.), c.y); }
        void main(){
          float r = length(vP.xy);
          float t = clamp((r - uR0) / (uR1 - uR0), 0., 1.);
          // red on the outer edge, violet inner — like the real thing
          vec3 col = hsv2rgb(vec3((1.0 - t) * 0.78, 0.72, 1.0));
          float edge = smoothstep(0., 0.10, t) * smoothstep(1., 0.90, t);
          float shimmer = 0.86 + 0.14 * sin(uTime * 1.1 + t * 5.0 + vP.x * 0.02);
          float foot = smoothstep(-4., 26., vP.y);            // melt softly into the banks
          gl_FragColor = vec4(col, uOpacity * edge * shimmer * foot);
        }`,
    });
    return new THREE.Mesh(geo, mat);
  }

  _deckY(z) {
    const { z: bz } = WORLD.bridge;
    const t = (z - (bz - 55)) / 110;
    if (t < 0 || t > 1) return null;
    return 1.5 + Math.sin(t * Math.PI) * 7.5;
  }

  _rainbowBridge() {
    const { x: bx, z: bz } = WORLD.bridge;
    const g = new THREE.Group();
    const stone = Surfaces.limestone(2.2);
    const stoneDark = Surfaces.limestoneDark(1.4);

    // Arched deck: segments following a sine arc across the river
    const SEG = 13;
    for (let i = 0; i < SEG; i++) {
      const t = i / (SEG - 1);
      const z = bz - 55 + t * 110;
      const y = this._deckY(z);
      const seg = new THREE.Mesh(new THREE.BoxGeometry(30, 1.6, 110 / SEG + 1.2), stone);
      seg.position.set(bx, y, z);
      seg.rotation.x = -Math.cos(t * Math.PI) * 0.16;
      seg.castShadow = seg.receiveShadow = true;
      g.add(seg);
      // balustrade posts + rails
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.4, 1.2), stoneDark);
        post.position.set(bx + s * 14, y + 2.2, z);
        g.add(post);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 110 / SEG + 1.4), stoneDark);
        rail.position.set(bx + s * 14, y + 4, z);
        rail.rotation.x = -Math.cos(t * Math.PI) * 0.16;
        g.add(rail);
      }
    }
    // Stone arch faces under the deck
    for (const s of [-1, 1]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(30, 3, 8, 24, Math.PI), stoneDark);
      arch.position.set(bx + s * 13.5, WORLD.waterLevel + 1, bz);
      arch.rotation.y = Math.PI / 2;
      g.add(arch);
    }

    // The Rainbow — one continuous spectral arc (soft-edged shader),
    // feet on either bank, visible face-on from the Grand Boulevard.
    // Narrower and taller than a real 42° bow, because it has to frame
    // the bridge rather than fill the sky, but kept thin: the earlier
    // wide band read as a lens smear across the whole valley.
    const arc = this._makeRainbowArc(104, 126, 0.5);
    arc.position.set(bx, 2, bz);
    g.add(arc);
    // faint wide glow around it — humid-air halo
    const glow = this._makeRainbowArc(96, 134, 0.10);
    glow.position.set(bx, 2, bz - 0.5);
    g.add(glow);
    this._rainbowShaders = [arc.material, glow.material];

    this.scene.add(g);
  }

  // ---------------- Glowing pawprints ----------------
  // A trail of soft gold pawprints pads from the gate, over the
  // Rainbow Bridge, to the plaza — brighter after dark.
  _pawTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    const pad = (cx, cy, rx, ry) => { x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.fill(); };
    pad(64, 82, 26, 22);                       // main pad
    pad(34, 46, 11, 14); pad(58, 34, 11, 14);  // toes
    pad(82, 36, 11, 14); pad(102, 50, 10, 13);
    return new THREE.CanvasTexture(c);
  }

  _pawprints() {
    const tex = this._pawTexture();
    this.pawMat = new THREE.MeshBasicMaterial({
      color: 0xffd76a, alphaMap: tex, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const geo = new THREE.PlaneGeometry(5.2, 5.2);
    const path = [];
    for (let z = 850; z > 60; z -= 17) path.push(z);
    const mesh = new THREE.InstancedMesh(geo, this.pawMat, path.length);
    const tmp = new THREE.Object3D();
    path.forEach((z, i) => {
      const x = (i % 2 ? 4.5 : -4.5) + Math.sin(z * 0.02) * 2;
      const deck = this._deckY(z);
      const y = deck !== null ? deck + 1.3 : Math.max(terrainHeight(x, z), WORLD.waterLevel + 0.4) + 0.5;
      tmp.position.set(x, y, z);
      tmp.rotation.set(-Math.PI / 2, 0, Math.PI + (i % 2 ? -0.12 : 0.12));
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    this.scene.add(mesh);
  }

  // ---------------- Seasonal blooms ----------------
  _blooms() {
    const style = SEASON_STYLE[this.season];
    const rng = mulberry32(20260401);
    const positions = [];
    for (let i = 0; i < 4200 && positions.length < 1100; i++) {
      const x = (rng() - 0.5) * 1800, z = (rng() - 0.5) * 1800;
      const h = terrainHeight(x, z);
      if (h < WORLD.waterLevel + 1 || h > 95) continue;
      if (distToRoads(x, z) < 9) continue;
      if (Math.hypot(x - WORLD.gate.x, z - WORLD.gate.z) < 90) continue;
      // blooms love the riverbanks & lakeshore
      const nearWater = distToRiver(x, z) < 70 || Math.abs(Math.hypot(x - WORLD.lake.x, z - WORLD.lake.z) - WORLD.lake.r) < 55;
      if (!nearWater && rng() < 0.55) continue;
      positions.push([x, h, z, rng()]);
    }
    // A bloom is a little clump — a few petal lobes over a stem —
    // rather than one floating ball. Single spheres at this scale read
    // as scattered confetti; a clump catches light on top and shades
    // underneath, which is what makes it sit in the grass.
    // Several small flowers on short stems, sized against a person
    // (a headstone here is ~5 units, so a flower head is well under
    // one). The first attempt at this made single 2-unit blooms, which
    // rendered as toadstools standing over the graves.
    const clump = (() => {
      const parts = [];
      const rng2 = mulberry32(9091);
      for (let f = 0; f < 4; f++) {
        const fx = (rng2() - 0.5) * 1.3;
        const fz = (rng2() - 0.5) * 1.3;
        const hgt = 0.5 + rng2() * 0.45;
        const stem = new THREE.CylinderGeometry(0.028, 0.038, hgt, 4);
        stem.translate(fx, hgt / 2, fz);
        parts.push(stem);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + f;
          const petal = new THREE.SphereGeometry(0.13, 6, 4);
          petal.scale(1, 0.45, 1);
          petal.translate(fx + Math.cos(a) * 0.1, hgt, fz + Math.sin(a) * 0.1);
          parts.push(petal);
        }
      }
      return mergeGeometries(parts, false) || parts[0];
    })();

    const mat = new THREE.MeshStandardMaterial({ roughness: 0.74, metalness: 0 });
    const mesh = new THREE.InstancedMesh(clump, mat, positions.length);
    const tmp = new THREE.Object3D();
    const col = new THREE.Color();
    positions.forEach(([x, y, z, r], i) => {
      tmp.position.set(x, y, z);
      tmp.scale.setScalar(0.85 + r * 0.5);
      tmp.rotation.set(0, r * 6, 0);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
      col.setHex(style.bloom[Math.floor(r * style.bloom.length)]);
      mesh.setColorAt(i, col);
    });
    mesh.instanceColor.needsUpdate = true;
    this.scene.add(mesh);
  }

  // ---------------- Living ambience ----------------
  /** Pin the valley to a phase, ignoring the clock (dev / preview). */
  forcePhase(key) {
    this._forcedPhase = key ? { key, t: 0.5 } : null;
    this.applyAmbience();
  }

  applyAmbience() {
    const phase = this._forcedPhase || getDayPhase();
    const P = PHASES[phase.key];
    const M = MOODS[this.mood] || MOODS.clear;

    // --- Sun placement drives everything else ---
    // Elevation is what the scattering model actually responds to:
    // a low sun reddens the horizon and dims the disc by itself.
    const ELEV = { dawn: 6, day: 58, dusk: 4, night: -12 };
    const AZI = { dawn: 96, day: 205, dusk: 274, night: 20 };
    const elevation = ELEV[phase.key];
    const azimuth = AZI[phase.key];
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);

    const sky = this.sky.material.uniforms;
    sky.sunPosition.value.copy(sunDir);
    // Rain thickens the air; snow scatters it bright and even.
    sky.turbidity.value = { clear: 3.2, soft: 6.5, blessing: 11, crystal: 8 }[this.mood] ?? 4;
    sky.rayleigh.value = phase.key === 'night' ? 0.35 : (phase.key === 'day' ? 1.6 : 3.1);
    sky.mieCoefficient.value = M.rainbow > 0.7 ? 0.014 : 0.005;

    // --- Exposure & light balance ---
    // With a scattering sky feeding a real light probe, the sun, the
    // probe and the hemisphere light were triple-counting and blowing
    // the whole valley out. These are measured against the rendered
    // frame: the probe carries ambient, the sun carries direction, and
    // the hemisphere light is left as a token fill.
    const LOOK = {
      dawn:  { exposure: 0.55, sun: 2.4, env: 0.62, hemi: 0.08 },
      day:   { exposure: 0.42, sun: 3.2, env: 0.55, hemi: 0.05 },
      dusk:  { exposure: 0.60, sun: 2.1, env: 0.66, hemi: 0.10 },
      night: { exposure: 1.15, sun: 0.32, env: 1.45, hemi: 0.18 },
    }[phase.key];

    this.sun.position.copy(sunDir).multiplyScalar(3000);
    this.sun.color.setHex(P.sun);
    this.sun.intensity = LOOK.sun * M.light;
    this.hemi.intensity = LOOK.hemi;
    if (this.lensflare) this.lensflare.visible = phase.key !== 'night' && this.mood !== 'blessing';

    this.renderer.toneMappingExposure = LOOK.exposure * (M.light * 0.25 + 0.8);
    this._envIntensity = LOOK.env;
    this._updateEnvironment();

    // --- Aerial perspective ---
    this.scene.fog.color.setHex(P.fog);
    // FogExp2 density, mapped from the mood's old near/far intent
    this.scene.fog.density = { clear: 0.00034, soft: 0.00052, blessing: 0.00095, crystal: 0.00062 }[this.mood] ?? 0.0004;

    this.stars.visible = P.night > 0.02;
    this.starMat.uniforms.uOpacity.value = P.night * 0.95;

    // The distant-haze skirt has to match the fog it is pretending
    // to be, or the seam at the terrain edge shows.
    this.horizonMat.color.setHex(P.fog);

    // --- Bloom: stronger after dark, strongest in the rain blessing ---
    // Threshold stays high so bloom only touches genuine light sources
    // (lanterns, candles, the rainbow, the sun) instead of smearing
    // every pale stone surface into mush.
    if (this.bloomPass) {
      this.bloomPass.strength = 0.24 + P.night * 0.3 + M.rainbow * 0.16;
      this.bloomPass.radius = 0.55 + P.night * 0.25;
      this.bloomPass.threshold = phase.key === 'night' ? 0.78 : 0.92;
    }

    // The rainbow: always present, most vivid in rain & at dusk/night.
    // Scaled against the new exposure — the arc is additive, so it has
    // to be read relative to how hard the camera is stopped down, or it
    // vanishes in daylight and blows out at night.
    this._rainbowBase = (0.16 + 0.34 * M.rainbow) * (1 + P.night * 0.3) / (LOOK.exposure / 0.42);
    this._pawBase = 0.4 + P.night * 0.45;

    // --- Water tracks the sun it is reflecting ---
    if (this.water?.material?.uniforms) {
      const wu = this.water.material.uniforms;
      wu.sunDirection.value.copy(sunDir);
      wu.sunColor.value.setHex(P.sun);
      wu.waterColor.value.setHex(P.night > 0.5 ? 0x14293d : 0x2e6d90);
      wu.distortionScale.value = M.rainbow > 0.7 ? 4.2 : 2.4;
    }
    this.waterMat.color.setHex(P.night > 0.5 ? 0x14293d : 0x2e6d90);
  }
  _vegetation() {
    const rng = mulberry32(777);
    const pine = { trunks: [], crowns: [] }, oak = { trunks: [], crowns: [] },
          palm = { trunks: [], crowns: [] }, cactus = [];
    const tmp = new THREE.Object3D();

    const place = (x, z) => {
      const h = terrainHeight(x, z);
      if (h < WORLD.waterLevel + 1 || h > 170) return null;
      if (distToRoads(x, z) < 14) return null;
      if (Math.hypot(x - WORLD.plaza.x, z - WORLD.plaza.z) < WORLD.plaza.r + 30) return null;
      if (Math.hypot(x - WORLD.gate.x, z - WORLD.gate.z) < 120) return null;
      if (Math.hypot(x - WORLD.bridge.x, z - WORLD.bridge.z) < 130) return null; // keep the rainbow vista clear
      for (const p of this.plots) if (Math.hypot(x - p.x, z - p.z) < 16) return null;
      return h;
    };

    for (let i = 0; i < 3200; i++) {
      const x = (rng() - 0.5) * 1900, z = (rng() - 0.5) * 1900;
      const h = place(x, z);
      if (h === null) continue;
      const s = 0.7 + rng() * 0.9;
      const dLake = Math.hypot(x - WORLD.lake.x, z - WORLD.lake.z) - WORLD.lake.r;
      const inDesert = x < -220 && z > 180 && h < 70;
      const inPines = (z < -330 && Math.abs(x) < 300) || h > 60;

      tmp.position.set(x, h, z);
      tmp.rotation.y = rng() * Math.PI * 2;

      if (inDesert) {
        if (rng() < 0.3) { tmp.scale.setScalar(s); tmp.updateMatrix(); cactus.push(tmp.matrix.clone()); }
        continue;
      }
      if (dLake > -5 && dLake < 40 && x > WORLD.lake.x - 60) { // beach palms
        if (rng() < 0.35) {
          tmp.scale.setScalar(s); tmp.updateMatrix();
          palm.trunks.push(tmp.matrix.clone()); palm.crowns.push(tmp.matrix.clone());
        }
        continue;
      }
      if (rng() < (inPines ? 0.75 : 0.22)) {
        tmp.scale.setScalar(s); tmp.updateMatrix();
        if (inPines) { pine.trunks.push(tmp.matrix.clone()); pine.crowns.push(tmp.matrix.clone()); }
        else { oak.trunks.push(tmp.matrix.clone()); oak.crowns.push(tmp.matrix.clone()); }
      }
    }

    const inst = (geo, mat, mats, yOff = 0, castShadow = true) => {
      if (!mats.length) return;
      const m = new THREE.InstancedMesh(geo, mat, mats.length);
      const t = new THREE.Matrix4(), off = new THREE.Matrix4().makeTranslation(0, yOff, 0);
      mats.forEach((mx, i) => { t.copy(mx).multiply(off); m.setMatrixAt(i, t); });
      m.castShadow = castShadow;
      this.scene.add(m);
    };

    // Bark and foliage both carry real normal maps now. Crowns are
    // built as clustered lobes rather than one blob: a single sphere on
    // a stick reads as a lollipop from any distance, while a handful of
    // overlapping lobes gives a broken silhouette and self-shadowing,
    // which is most of what makes a tree read as a tree.
    const barkMat = Surfaces.bark(1.5);
    const palmBark = Surfaces.bark(2).clone();
    palmBark.color.setHex(0xb09472);

    /** Merge several offset spheres into one crown geometry. */
    const crownGeo = (radius, lobes, spread, detail = 2) => {
      const parts = [];
      const rng2 = mulberry32(Math.round(radius * 1000) + lobes);
      for (let i = 0; i < lobes; i++) {
        const a = (i / lobes) * Math.PI * 2 + rng2() * 0.9;
        const rad = radius * spread * (0.45 + rng2() * 0.55);
        const s = radius * (0.46 + rng2() * 0.36);
        const g2 = new THREE.IcosahedronGeometry(s, detail);
        g2.translate(
          Math.cos(a) * rad,
          (rng2() - 0.35) * radius * 0.7,
          Math.sin(a) * rad,
        );
        parts.push(g2);
      }
      parts.push(new THREE.IcosahedronGeometry(radius * 0.66, detail));
      return mergeGeometries(parts, false) || parts[0];
    };

    // Pines: stacked, tapering skirts instead of one long cone
    const pineGeo = (() => {
      const tiers = [];
      for (let i = 0; i < 4; i++) {
        const t = i / 3;
        const c = new THREE.ConeGeometry(6.2 * (1 - t * 0.62), 7.5 - t * 1.2, 11, 2);
        c.translate(0, i * 3.5, 0);
        tiers.push(c);
      }
      return mergeGeometries(tiers, false) || tiers[0];
    })();

    inst(new THREE.CylinderGeometry(0.55, 1.25, 11, 10), barkMat, pine.trunks, 5.5);
    inst(pineGeo, Surfaces.foliage(3, 0x3d6b48), pine.crowns, 9);

    inst(new THREE.CylinderGeometry(0.8, 1.5, 9, 10), barkMat, oak.trunks, 4.5);
    // Oak crowns follow the season: spring blush, summer green, autumn gold, winter frost
    inst(crownGeo(6.2, 6, 0.72), Surfaces.foliage(2.5, SEASON_STYLE[this.season].crown), oak.crowns, 12);

    inst(new THREE.CylinderGeometry(0.45, 0.85, 13, 10), palmBark, palm.trunks, 6.5);
    inst(crownGeo(4.2, 7, 0.95, 1), Surfaces.foliage(2, 0x5ea24f), palm.crowns, 13);

    inst(new THREE.CapsuleGeometry(1.4, 6, 4, 12),
      Surfaces.foliage(1.5, 0x4d7a45), cactus, 4);
  }

  // ---------------- Plots ----------------
  _plots() {
    const avail = [], occup = [];
    for (const p of this.plots) (p.status === 'available' ? avail : occup).push(p);

    const tmp = new THREE.Object3D();
    // A plot is a tended bed sunk into the meadow, not a translucent
    // tile laid on top of it: a shallow turf slab with a cut stone kerb
    // around the rim. The kerb is what actually reads at distance —
    // a bright flat rectangle looked like a sticky note on the grass.
    const makePlotMesh = (list, tint, kerbTint) => {
      if (!list.length) return null;

      const bed = new THREE.BoxGeometry(1, 0.34, 1);
      bed.translate(0, 0.17, 0);
      // The grass texture is already dark; tinting it further turned
      // every plot into a pit. Use the neutral ground detail and let
      // the tint set the hue, matching how the terrain is shaded.
      const bedMat = material('groundDetail', { repeat: 3, roughness: 1, metalness: 0, normalScale: 0.7 }).clone();
      bedMat.color.setHex(tint);
      bedMat.color.multiplyScalar(1.24);
      const mesh = new THREE.InstancedMesh(bed, bedMat, list.length);

      // kerb: a thin frame sitting just proud of the turf
      const kerbGeo = new THREE.BoxGeometry(1, 0.5, 1);
      kerbGeo.translate(0, 0.25, 0);
      const kerbMat = Surfaces.limestone(1.1).clone();
      kerbMat.color.setHex(kerbTint);
      const kerb = new THREE.InstancedMesh(kerbGeo, kerbMat, list.length);

      list.forEach((p, i) => {
        const [w, d] = SIZE_DIMS[p.size];
        tmp.position.set(p.x, p.h + 0.02, p.z);
        tmp.rotation.set(0, p.rot, 0);
        tmp.scale.set(w - 1.1, 1, d - 1.1);
        tmp.updateMatrix();
        mesh.setMatrixAt(i, tmp.matrix);

        tmp.position.set(p.x, p.h - 0.16, p.z);
        tmp.scale.set(w, 1, d);
        tmp.updateMatrix();
        kerb.setMatrixAt(i, tmp.matrix);
      });

      mesh.receiveShadow = true;
      kerb.receiveShadow = kerb.castShadow = true;
      this.scene.add(kerb);
      this.scene.add(mesh);
      // Only the turf is pickable; the kerb would steal clicks at
      // grazing angles without adding anything.
      this.pickables.push(mesh);
      this.plotMeshIndex.set(mesh, list);
      this._decorMeshes = this._decorMeshes || [];
      this._decorMeshes.push(kerb);
      return mesh;
    };
    // Both sit close to the surrounding meadow: a plot should read as
    // tended ground, not as a coloured tile dropped on the grass. The
    // stone kerb does the work of marking the boundary.
    this.availMesh = makePlotMesh(avail, 0x9fb583, 0xcfc7b2);
    this.occupMesh = makePlotMesh(occup, 0x93a97a, 0xb8b09c);

    // ----- Decor: headstones, items & gifts at their chosen spots -----
    // Each decor entry: { type, style?, color?, dx?, dz? } — dx/dz are
    // plot-local ("base" is in front of the headstone, toward the road).
    const DEFAULT_POS = {
      headstone: [0, -2], flowers: [0, 5], tree: [-5, -6], bench: [5.5, -1],
      lantern: [-5.5, -1], candle: [1.5, 4.5], ball: [-1.5, 4.5], bone: [2.5, 5],
      wreath: [0, 4], cactus: [5, -5], fountain: [-5.5, -1],
    };
    const buckets = {}; // type/style key -> { mats: [], colors: [] }
    const pushDecor = (key, p, d, extraS = 1) => {
      const [ddx, ddz] = DEFAULT_POS[d.type] || [0, 4];
      const dx = d.dx ?? ddx, dz = d.dz ?? ddz;
      const rx = dx * Math.cos(p.rot) + dz * Math.sin(p.rot);
      const rz = -dx * Math.sin(p.rot) + dz * Math.cos(p.rot);
      tmp.position.set(p.x + rx, p.h + 0.9, p.z + rz);
      tmp.rotation.set(0, p.rot, 0);
      tmp.scale.setScalar(extraS);
      tmp.updateMatrix();
      (buckets[key] ||= { mats: [], colors: [] });
      buckets[key].mats.push(tmp.matrix.clone());
      const DEFAULT_COLOR = { flowers: 0xd66a8a, tree: 0x5e8f4e, ball: 0xc8e84a };
      buckets[key].colors.push(d.color || DEFAULT_COLOR[d.type] || null);
    };
    for (const p of occup) {
      for (const d of p.decor || []) {
        if (!d || !d.type) continue;
        const key = d.type === 'headstone' ? 'hs_' + (d.style || 'classic') : d.type;
        pushDecor(key, p, d);
        if (d.type === 'fountain') pushDecor('fountain_water', p, { ...d, type: 'fountain' });
      }
    }

    const graniteMat = Surfaces.granite(0.9);
    const marbleMat = Surfaces.marble(0.8);
    const inst = (key, geo, mat, yOff = 0, useColor = false) => {
      const b = buckets[key];
      if (!b?.mats.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, b.mats.length);
      const t = new THREE.Matrix4(), off = new THREE.Matrix4().makeTranslation(0, yOff, 0);
      const col = new THREE.Color();
      b.mats.forEach((mx, i) => {
        t.copy(mx).multiply(off);
        mesh.setMatrixAt(i, t);
        if (useColor) mesh.setColorAt(i, col.setHex(b.colors[i] ?? 0xffffff));
      });
      if (useColor && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = true;
      this.scene.add(mesh);
      this._decorMeshes.push(mesh);
    };
    this._decorMeshes = this._decorMeshes || [];

    // headstones — polished granite and marble, both with real
    // veining, clearcoat and beveled edges
    inst('hs_classic', new THREE.BoxGeometry(4.4, 5.4, 1), graniteMat, 2);
    inst('hs_obelisk', new THREE.ConeGeometry(1.5, 8, 4), marbleMat, 3.4);
    inst('hs_heart',   new THREE.SphereGeometry(2.4, 24, 18), marbleMat, 2.2);
    inst('hs_slab',    new THREE.BoxGeometry(6, 1, 4), graniteMat, 0.2);
    inst('hs_statue',  new THREE.CylinderGeometry(1.4, 1.8, 5, 20), marbleMat, 2.4);
    // nature & furnishings
    inst('flowers', new THREE.IcosahedronGeometry(1.5, 2),
      Surfaces.petal(1, 0xffffff), 0.8, true);
    inst('tree', new THREE.CylinderGeometry(0.5, 0.8, 6, 10), Surfaces.bark(1), 3);
    // crowns share the tree bucket positions
    if (buckets.tree) {
      buckets.tree_crown = { mats: buckets.tree.mats, colors: buckets.tree.colors };
      inst('tree_crown', new THREE.IcosahedronGeometry(4.2, 2),
        Surfaces.foliage(2, 0xffffff), 8.5, true);
    }
    inst('bench', new THREE.BoxGeometry(5, 0.6, 1.6), Surfaces.timber(1.2), 1.6);
    // Lanterns and candles are genuine emitters — the bloom pass turns
    // their emissive into real glow rather than a bright flat colour.
    inst('lantern', new THREE.CylinderGeometry(0.5, 0.7, 2.4, 12),
      new THREE.MeshStandardMaterial({
        color: 0xe8b23a, emissive: 0xffb347, emissiveIntensity: 2.6,
        roughness: 0.35, metalness: 0.1,
      }), 1.2);
    inst('cactus', new THREE.CapsuleGeometry(0.9, 3.6, 4, 12),
      Surfaces.foliage(1.2, 0x4d7a45), 2.2);
    inst('fountain', new THREE.CylinderGeometry(2.4, 2.8, 1.6, 24), marbleMat, 0.8);
    inst('fountain_water', new THREE.CylinderGeometry(2, 2, 0.5, 24), this.waterMat, 1.7);
    // gifts laid at the base
    inst('candle', new THREE.CylinderGeometry(0.35, 0.45, 1.4, 14),
      (() => {
        const m = Surfaces.wax(1).clone();
        m.emissive = new THREE.Color(0xffc46a);
        m.emissiveIntensity = 2.2;
        return m;
      })(), 0.7);
    inst('ball', new THREE.SphereGeometry(0.8, 24, 18),
      new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.3 }), 0.7, true);
    inst('bone', new THREE.CapsuleGeometry(0.4, 1.8, 4, 12),
      Surfaces.ceramic(1).clone(), 0.4);
    inst('wreath', new THREE.TorusGeometry(1.2, 0.4, 12, 28),
      Surfaces.foliage(1, 0x3e6b45), 0.5);

    // Selection ring
    this.selRing = new THREE.Mesh(
      new THREE.RingGeometry(9, 12, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }));
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.visible = false;
    this.scene.add(this.selRing);
  }

  rebuildPlots() {
    // Called after a purchase/customization: rebuild plot & decor meshes
    for (const m of this.pickables) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    this.pickables = [];
    for (const m of this._decorMeshes || []) { this.scene.remove(m); m.geometry.dispose(); }
    this._decorMeshes = [];
    this.plotMeshIndex.clear();
    this.scene.remove(this.selRing);
    this._plots();
  }

  // ---------------- Picking & camera ----------------
  _picking() {
    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    let downAt = null;
    this.canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
    this.canvas.addEventListener('pointerup', e => {
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
        if (plot) { this.selectPlot(plot); this.onPlotClick?.(plot); return; }
      }
    });
  }

  selectPlot(plot) {
    if (!plot) { this.selRing.visible = false; return; }
    this.selRing.visible = true;
    this.selRing.position.set(plot.x, plot.h + 1.2, plot.z);
    this.flyTo(new V3(plot.x, plot.h, plot.z), 120, 0.9);
  }

  flyToDistrict(key) {
    const centers = {
      bridge: [0, 232, 330], meadows: [0, 420, 520], woodland: [-30, -450, 420],
      lakefront: [120, -220, 480], beach: [660, -120, 420], summit: [-540, -430, 520],
      desert: [-480, 340, 520], gate: [0, 860, 260], overview: [0, 300, 1500],
    };
    const c = centers[key] || centers.overview;
    const y = key === 'overview' ? 0 : terrainHeight(c[0], c[1]);
    this.flyTo(new V3(c[0], y, c[1]), c[2], 1.4);
  }

  flyTo(target, distance, secs = 1.2) {
    const startT = this.controls.target.clone();
    const startP = this.camera.position.clone();
    const dir = new V3().subVectors(startP, startT).normalize();
    if (dir.y < 0.35) dir.y = 0.55;
    dir.normalize();
    const endP = target.clone().add(dir.multiplyScalar(distance));
    const t0 = performance.now();
    this._flyTween = () => {
      const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.controls.target.lerpVectors(startT, target, e);
      this.camera.position.lerpVectors(startP, endP, e);
      if (k >= 1) this._flyTween = null;
    };
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    if (this.canvas.offsetParent === null) return; // hidden (Earth/2D active) — save the GPU
    const t = this.clock.getElapsedTime();
    if (this._flyTween) this._flyTween();
    this.controls.update();
    if (this.water) {
      this.water.position.y = WORLD.waterLevel + Math.sin(t * 0.7) * 0.15;
      // Water advances its own wave normals; the river's shared normal
      // map is scrolled by hand to match.
      if (this.water.material?.uniforms?.time) this.water.material.uniforms.time.value = t * 0.35;
    }
    if (this.waterMat?.normalMap) {
      this.waterMat.normalMap.offset.set(t * 0.012, t * 0.008);
    }
    if (this._rainbowShaders) {
      const base = this._rainbowBase || 0.5;
      this._rainbowShaders[0].uniforms.uTime.value = t;
      this._rainbowShaders[0].uniforms.uOpacity.value = base;
      this._rainbowShaders[1].uniforms.uTime.value = t;
      this._rainbowShaders[1].uniforms.uOpacity.value = base * 0.22;
    }
    if (this.pawMat) this.pawMat.opacity = (this._pawBase || 0.45) * (0.72 + 0.28 * Math.sin(t * 2.1));
    if (this.stars.visible) this.starMat.uniforms.uTime.value = t;
    if (this.selRing.visible) {
      this.selRing.rotation.z = t * 0.6;
      const s = 1 + Math.sin(t * 3) * 0.06;
      this.selRing.scale.set(s, s, 1);
    }
    // Composer owns the frame now (render → bloom → tonemap/output).
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
