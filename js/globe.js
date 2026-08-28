// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — The globe
//
// Our own Earth, rendered in three.js, rather than Google's.
//
// Google's photorealistic tiles are the right thing once you are
// descending toward a real place, but they cannot be a planet: the
// element will not cold-start at orbital range, and it gives no
// clouds, no atmosphere, no terminator and no sky to put it in.
// Everything this view needs is presentational, so it is ours.
//
// What is real here rather than decorative:
//   · the surface is NASA Blue Marble imagery (public domain)
//   · the terminator follows the true sub-solar point for right now
//   · night lights appear only on the dark side, and only on land
//   · the moon shows tonight's actual phase, lit from the sun's side
//   · the naked-eye planets sit where they currently are
//
// See astro.js for the arithmetic behind all of that.
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { skyState, RAD } from './astro.js';

const R_EARTH = 100;                 // scene units for the planet radius

// ---------------------------------------------------------------
// Earth surface — real satellite imagery
//
// This was procedural to begin with: coastlines from Natural Earth,
// biome colour blended from latitude and noise. It produced a
// recognisable planet, and it never stopped looking like a render —
// noise cannot invent the Sahara's actual colour, the Amazon's actual
// shape, or the silt plumes off a river mouth.
//
// So the surface is NASA Blue Marble now, vendored into images/planet
// rather than pulled from a CDN at runtime. Roughly 1.9MB for the set,
// which buys the one thing procedural generation cannot: it looks like
// a photograph because it is one.
// ---------------------------------------------------------------

const TEX_PATH = 'images/planet/';

/** Seeded RNG, so the starfield is the same on every load. */
function mulberry(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Fallback procedural textures in case an image asset fails to load */
function createFallbackTexture(name, srgb = false) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const strName = String(name || '');
  if (strName.includes('normal')) {
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, 256, 256);
  } else if (strName.includes('specular')) {
    ctx.fillStyle = '#404040';
    ctx.fillRect(0, 0, 256, 256);
  } else if (strName.includes('lights')) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 256, 256);
  } else if (strName.includes('clouds')) {
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(0, 0, 256, 256);
  } else if (strName.includes('moon')) {
    ctx.fillStyle = '#888888';
    ctx.fillRect(0, 0, 256, 256);
  } else {
    ctx.fillStyle = '#0c2340';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#225533';
    ctx.fillRect(40, 60, 100, 80);
    ctx.fillRect(160, 80, 70, 90);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function loadTexture(file, { srgb = false, aniso = 8 } = {}) {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(
      TEX_PATH + file,
      (t) => {
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = aniso;
        resolve(t);
      },
      undefined,
      (err) => {
        console.warn(`[globe] Texture ${file} failed to load, using resilient fallback`, err);
        resolve(createFallbackTexture(file, srgb));
      },
    );
  });
}

// ---------------------------------------------------------------
// The view
// ---------------------------------------------------------------
export class Globe {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{onPinClick?:(pin)=>void}} opts
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.opts = opts;
    this.pins = [];
    this.clock = new THREE.Clock();
    this._raf = 0;
    this.running = false;
  }

  async init() {
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x01020a);
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(38, 1, 1, 100000);
    camera.position.set(0, 90, 360);
    this.camera = camera;

    const controls = new OrbitControls(camera, this.canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.minDistance = R_EARTH * 1.35;
    // On touch devices allow zooming out more — the globe starts further
    // back anyway and users want to see the full planet in their palm
    controls.maxDistance = R_EARTH * 12;
    // Faster rotate on touch for snappier response
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    controls.rotateSpeed = isTouchDevice ? 0.65 : 0.45;
    // The planet turns.
    //
    // The camera orbits rather than the Earth mesh spinning, and that
    // is a deliberate choice, not a shortcut: the terminator is placed
    // from the real sub-solar point and every pin sits at real
    // coordinates, so rotating the globe itself would drag noon around
    // the planet and slide the pins off their cities. Orbiting the
    // viewpoint keeps all of that true — and it is what actually
    // happens, since the thing moving is us.
    controls.autoRotate = true;
    // OrbitControls turns a fixed angle per frame, not per second, so
    // this is calibrated at 60fps: roughly two and a half minutes for
    // a full revolution. Clearly moving when you watch it, slow enough
    // that it never pulls the eye away from what someone is reading.
    controls.autoRotateSpeed = 0.45;
    this.controls = controls;

    // Hands off while someone is dragging; picks up again once they
    // have finished looking. Nothing is worse than a globe that pulls
    // away from where you just put it.
    this._idleTimer = null;
    const holdSpin = () => {
      controls.autoRotate = false;
      clearTimeout(this._idleTimer);
    };
    const resumeSpin = () => {
      clearTimeout(this._idleTimer);
      this._idleTimer = setTimeout(() => { controls.autoRotate = true; }, 4500);
    };
    controls.addEventListener('start', holdSpin);
    controls.addEventListener('end', resumeSpin);

    // Load the imagery up front — the globe is the first thing anyone
    // sees, and a planet that pops in texture by texture looks broken.
    const [albedo, clouds, lights, normal, spec, moonMap] = await Promise.all([
      loadTexture('earth_atmos_2048.jpg', { srgb: true }),
      loadTexture('earth_clouds_1024.png', { srgb: true }),
      loadTexture('earth_lights_2048.png', { srgb: true }),
      loadTexture('earth_normal_2048.jpg'),
      loadTexture('earth_specular_2048.jpg'),
      loadTexture('moon_1024.jpg', { srgb: true }),
    ]);
    this._maps = { albedo, clouds, lights, normal, spec, moonMap };
    this._buildEarth();
    this._buildAtmosphere();
    this._buildStars();
    this._buildMilkyWay();      // after the stars: it reuses their material
    this._buildMoon();
    this._buildPlanets();
    this._buildComposer();

    this.applySky();
    // Opening shot depends on where the sun is, so it comes after the
    // first applySky() rather than from the camera's constructor.
    this.frameSunlit();
    this._syncTimer = setInterval(() => this.applySky(), 60000);

    addEventListener('resize', this._onResize = () => this.resize());
    this.resize();
    this._pickSetup();
    this.warmup();
    return this;
  }

  /**
   * Pre-compiles all Earth shaders and executes warmup frames
   * so globe entrance and rotation are completely lag-free.
   */
  warmup() {
    if (!this.renderer || !this.scene || !this.camera) return;
    try {
      this.renderer.compile(this.scene, this.camera);
      if (this.composer) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    } catch (e) {
      console.warn('[globe] warmup error:', e);
    }
  }

  _buildEarth() {
    const { albedo, clouds, lights, normal, spec } = this._maps;
    const aniso = this.renderer.capabilities.getMaxAnisotropy();
    for (const t of [albedo, clouds, lights, normal, spec]) t.anisotropy = aniso;

    this.earthMat = new THREE.MeshStandardMaterial({
      map: albedo,
      normalMap: normal,
      // Blue Marble ships a specular map: white where water is, black
      // over land. Roughness is the inverse of that, so it is fed in
      // through the green channel and flipped in the shader below.
      roughnessMap: spec,
      roughness: 1,
      metalness: 0,
    });
    this.earthMat.normalScale = new THREE.Vector2(0.85, 0.85);

    this.earthMat.onBeforeCompile = (shader) => {
      shader.uniforms.uLights = { value: lights };
      shader.uniforms.uSunDir = this._sunUniform ||= { value: new THREE.Vector3(1, 0, 0) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldNrm;')
        .replace('#include <worldpos_vertex>',
          '#include <worldpos_vertex>\n vWorldNrm = normalize(mat3(modelMatrix) * normal);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>',
          '#include <common>\nuniform sampler2D uLights;\nuniform vec3 uSunDir;\nvarying vec3 vWorldNrm;')
        // Invert the specular map into roughness: oceans glossy, land matte.
        .replace('#include <roughnessmap_fragment>', `
          float roughnessFactor = roughness;
          vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
          roughnessFactor *= 1.0 - texelRoughness.g * 0.72;
        `)
        .replace('#include <dithering_fragment>', `
          #include <dithering_fragment>
          // Cities appear as the terminator passes, not all at once.
          float night = 1.0 - smoothstep(-0.22, 0.10, dot(normalize(vWorldNrm), uSunDir));
          vec3 lamps = texture2D(uLights, vMapUv).rgb;
          gl_FragColor.rgb += lamps * night * 1.9;
        `);
    };

    const geo = new THREE.SphereGeometry(R_EARTH, 128, 96);
    this.earth = new THREE.Mesh(geo, this.earthMat);
    this.scene.add(this.earth);

    // --- clouds, on their own shell, drifting west to east ---
    // Used as `map` with transparency, NOT as `alphaMap`: three reads
    // alphaMap from the green channel, and this PNG carries its own
    // alpha, so the green channel is white almost everywhere and the
    // clouds came out as hard white blocks over the whole planet.
    this.cloudMat = new THREE.MeshStandardMaterial({
      map: clouds,
      transparent: true,
      opacity: 0.9,
      roughness: 1, metalness: 0,
      depthWrite: false,
    });
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(R_EARTH * 1.008, 96, 64), this.cloudMat);
    this.scene.add(this.clouds);

    // --- the sun ---
    this.sunLight = new THREE.DirectionalLight(0xfff6e8, 2.6);
    this.scene.add(this.sunLight);
    // A hint of fill so the night side is not pure black
    this.scene.add(new THREE.AmbientLight(0x1b2740, 0.35));
  }

  /**
   * Atmosphere: an inverted shell whose opacity rises at grazing
   * angles (Fresnel) and falls off away from the sun, which is what
   * produces the bright crescent on the day limb and the thin blue
   * line at the terminator.
   */
  _buildAtmosphere() {
    const mat = new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uSunDir: this._sunUniform ||= { value: new THREE.Vector3(1, 0, 0) },
        uColor: { value: new THREE.Color(0x5aa9ff) },
        uIntensity: { value: 1.0 },
      },
      vertexShader: `
        varying vec3 vNormalW; varying vec3 vViewDir;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vViewDir = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform vec3 uSunDir; uniform vec3 uColor; uniform float uIntensity;
        varying vec3 vNormalW; varying vec3 vViewDir;
        void main(){
          // Back faces, so the normal points inward — flip it.
          vec3 n = -normalize(vNormalW);
          vec3 v = normalize(vViewDir);
          float rim = pow(1.0 - abs(dot(n, v)), 3.2);
          float lit = max(0.0, dot(n, uSunDir));
          // Scatter forward along the limb, brightest where lit
          float glow = rim * (0.16 + pow(lit, 0.6) * 1.5);
          gl_FragColor = vec4(uColor * glow * uIntensity, glow);
        }`,
    });
    this.atmoMat = mat;
    this.atmosphere = new THREE.Mesh(new THREE.SphereGeometry(R_EARTH * 1.085, 64, 48), mat);
    this.scene.add(this.atmosphere);

    // --- the enchanted layer ---
    // A camera-facing halo rather than another shell. A shell has its
    // own limb, so its Fresnel rim drew a hard ring floating off the
    // planet; a billboard with a radial falloff reads as light
    // spilling off the edge, which is what a halo actually is.
    //
    // The planet underneath stays a photograph. This sits outside it,
    // the way a halo sits outside a lamp.
    const haloSize = R_EARTH * 3.4;
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(haloSize, haloSize),
      new THREE.ShaderMaterial({
        // depthTest stays ON. Transparent objects render after all
        // opaque ones regardless of renderOrder, so with it off the
        // halo painted straight over the planet's night side in
        // green and violet. With it on, the Earth occludes it and
        // only the spill outside the silhouette survives.
        transparent: true, depthWrite: false, depthTest: true,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uInner: { value: R_EARTH / haloSize } },
        vertexShader: `
          varying vec2 vUv;
          void main(){
            vUv = uv;
            // billboard: strip rotation out of the model-view matrix
            mat4 mv = modelViewMatrix;
            mv[0].xyz = vec3(1.0, 0.0, 0.0);
            mv[1].xyz = vec3(0.0, 1.0, 0.0);
            mv[2].xyz = vec3(0.0, 0.0, 1.0);
            gl_Position = projectionMatrix * mv * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform float uTime; uniform float uInner;
          varying vec2 vUv;
          vec3 spectral(float t){
            return 0.55 + 0.45 * cos(6.28318 * (t + vec3(0.00, 0.33, 0.67)));
          }
          void main(){
            vec2 p = vUv - vec2(0.5);
            float r = length(p) * 2.0;              // 0 at centre, 1 at edge
            // Rise just outside the planet's silhouette, then fall away
            float band = smoothstep(uInner * 0.86, uInner * 1.05, r)
                       * (1.0 - smoothstep(uInner * 1.05, 1.0, r));
            float breathe = 0.74 + 0.26 * sin(uTime * 0.5);
            float hue = atan(p.y, p.x) * 0.159 + uTime * 0.015;
            vec3 col = spectral(hue);
            float a = band * 0.30 * breathe;
            gl_FragColor = vec4(col * a, a);
          }`,
      }),
    );
    this.haloMat = halo.material;
    this.halo = halo;
    this.scene.add(halo);
  }

  _buildStars() {
    const N = 9000, R = 42000;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const siz = new Float32Array(N);
    const rnd = mulberry(4242);
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      // even distribution on a sphere
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(a) * s * R;
      pos[i * 3 + 1] = u * R;
      pos[i * 3 + 2] = Math.sin(a) * s * R;
      // real stars run blue-white through orange; most are faint
      const t = rnd();
      c.setHSL(t > 0.82 ? 0.07 : 0.58 - t * 0.1, 0.35 * rnd(), 0.68 + rnd() * 0.32);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      siz[i] = (0.5 + Math.pow(rnd(), 5) * 4.2) * 300;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(siz, 1));
    this.starMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      uniforms: { uTex: { value: discTexture() }, uTime: { value: 0 } },
      vertexShader: `
        attribute float size; varying vec3 vColor; varying float vTw;
        uniform float uTime;
        void main(){
          vColor = color;
          // Each star keeps its own rate and phase, so the field
          // shimmers rather than pulsing as one.
          float rate = 0.6 + fract(position.x * 0.0007 + position.y * 0.0011) * 2.6;
          vTw = 0.55 + 0.45 * sin(uTime * rate + position.z * 0.002);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uTex; varying vec3 vColor; varying float vTw;
        void main(){
          float a = texture2D(uTex, gl_PointCoord).a;
          gl_FragColor = vec4(vColor, a * vTw);
        }`,
    });
    this.stars = new THREE.Points(g, this.starMat);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);

    this.shooting = [];
    this._shootPool = new THREE.Group();
    this.scene.add(this._shootPool);
  }

  _buildMoon() {
    const r = R_EARTH * 0.27;
    const mat = new THREE.MeshStandardMaterial({
      map: this._maps.moonMap, roughness: 0.98, metalness: 0,
    });
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), mat);
    this.scene.add(this.moon);
  }

  /**
   * The naked-eye planets.
   *
   * They were spheres, which is what they are but not what they look
   * like: at any distance you could actually see one from, a planet is
   * a point source. What distinguishes Venus from a star to the eye is
   * that it is steadier, brighter, and slightly coloured — plus the
   * glint the eye's own optics put on anything that bright.
   *
   * So each is a camera-facing sprite: a hot core, a soft halo, and
   * four faint diffraction spikes. Sized by brightness, tinted by the
   * real colour, and unlike the stars they do not twinkle — that is
   * the actual field test for telling a planet from a star.
   */
  _buildPlanets() {
    this.planetMeshes = [];
    const tex = glintTexture();
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex, color: 0xffffff, transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const m = new THREE.Sprite(mat);
      m.visible = false;
      m.frustumCulled = false;
      this.scene.add(m);
      this.planetMeshes.push(m);
    }
  }

  /**
   * The Milky Way, as a band of dust and unresolved stars.
   *
   * Nothing says "this is a render" like a starfield of evenly
   * scattered dots. The real sky has a bright, ragged river through
   * it, and the eye reads its absence immediately even when it can't
   * say what is missing. Two parts: a dense drift of faint stars
   * clustered toward the galactic plane, and a soft glow behind them
   * for the light that never resolves into stars at all.
   */
  _buildMilkyWay() {
    const R = 41000;
    const rnd = mulberry(90210);
    // Galactic plane, tilted ~60° to the ecliptic — roughly where it
    // sits relative to everything else placed in this scene.
    const TILT = 62 * RAD;
    const cosT = Math.cos(TILT), sinT = Math.sin(TILT);
    const toWorld = (v) => new THREE.Vector3(
      v.x,
      v.y * cosT - v.z * sinT,
      v.y * sinT + v.z * cosT,
    );

    // --- the unresolved glow ---
    const glowGeo = new THREE.SphereGeometry(R * 1.02, 64, 48);
    const glow = new THREE.Mesh(glowGeo, new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTilt: { value: TILT } },
      vertexShader: `
        varying vec3 vPos;
        void main(){ vPos = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vPos; uniform float uTilt;
        // cheap value noise, enough for dust lanes
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.99,78.23,45.16))) * 43758.5453); }
        float n(vec3 p){
          vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          float a = mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x), mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x), f.y),
                        mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x), mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x), f.y), f.z);
          return a;
        }
        void main(){
          // rotate into galactic coordinates
          float c = cos(-uTilt), s = sin(-uTilt);
          vec3 g = vec3(vPos.x, vPos.y*c - vPos.z*s, vPos.y*s + vPos.z*c);
          // Narrower than a smooth falloff: the visible band is tight,
          // and widening it turns the whole thing into grey fog.
          float band = exp(-pow(abs(g.z) * 8.5, 1.5));
          // brighter toward the galactic centre, and ragged, not smooth
          float core = pow(max(0.0, g.x * 0.5 + 0.5), 2.4);
          // Structure, weighted toward the fine end. Broad noise alone
          // reads as smoke; it is the small-scale grain that makes it
          // look like unresolved stars rather than cloud.
          float fine = n(g * 13.0) * 0.34 + n(g * 31.0) * 0.36 + n(g * 67.0) * 0.30;
          // The dark rifts. The Milky Way's most recognisable feature
          // is not its light but the dust lanes cutting through it, and
          // without them no amount of brightness reads as a galaxy.
          float lane = smoothstep(0.42, 0.78, n(g * 5.0 + 11.0));
          float a = band * (0.30 + core * 1.0) * (0.22 + fine * 1.05);
          a *= 1.0 - lane * 0.72;
          a = clamp(a, 0.0, 1.0) * 0.30;
          // faintly warm at the core, cooler in the outer arms
          vec3 col = mix(vec3(0.60,0.67,0.88), vec3(0.96,0.89,0.74), core * 0.85);
          gl_FragColor = vec4(col * a, a);
        }`,
    }));
    glow.frustumCulled = false;
    this.scene.add(glow);
    this.milkyWay = glow;

    // --- the faint stars that make it grainy ---
    const N = 7000;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const siz = new Float32Array(N);
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      // concentrate toward the plane: gaussian-ish in z
      const z = (rnd() + rnd() + rnd() - 1.5) * 0.19;
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      const v = toWorld(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z));
      pos[i * 3] = v.x * R; pos[i * 3 + 1] = v.y * R; pos[i * 3 + 2] = v.z * R;
      c.setHSL(0.55 + rnd() * 0.12, 0.18 * rnd(), 0.5 + rnd() * 0.3);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      siz[i] = (0.3 + Math.pow(rnd(), 6) * 1.7) * 300;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(siz, 1));
    const dust = new THREE.Points(g, this.starMat);
    dust.frustumCulled = false;
    this.scene.add(dust);
    this.milkyWayStars = dust;
  }

  _buildComposer() {
    const composer = new EffectComposer(this.renderer);
    composer.setPixelRatio(this.renderer.getPixelRatio());
    composer.addPass(new RenderPass(this.scene, this.camera));
    // Strength down, radius up, threshold up.
    const w = this.canvas.clientWidth || window.innerWidth || 800;
    const h = this.canvas.clientHeight || window.innerHeight || 600;
    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.52, 0.95, 0.80);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;
    this.bloomPass = bloom;
    this.bloom = bloom;
  }

  // ---------------- real-time sky ----------------

  /** Point everything at where it really is, right now. */
  applySky(date = new Date()) {
    const sky = skyState(date);
    this.sky = sky;

    // --- sun: direction of the sub-solar point in world space ---
    const dir = latLngToVec(sky.sun.lat, sky.sun.lng, 1);
    if (this._sunUniform) this._sunUniform.value.copy(dir);
    if (this.sunLight) {
      this.sunLight.position.copy(dir).multiplyScalar(R_EARTH * 40);
      this.sunLight.target.position.set(0, 0, 0);
      this.sunLight.target.updateMatrixWorld();
    }

    // --- moon: along the ecliptic, at its real distance ratio ---
    if (this.moon) {
      const md = 60 * R_EARTH / 6.0;       // compressed, or it is off-screen
      const ml = sky.moon.lambda * RAD;
      const mb = sky.moon.beta * RAD;
      this.moon.position.set(
        Math.cos(ml) * Math.cos(mb) * md,
        Math.sin(mb) * md,
        Math.sin(ml) * Math.cos(mb) * md,
      );
    }

    // --- planets ---
    // `magnitude` here is a brightness proxy (radius / distance²), not
    // an astronomical magnitude, so bigger really is brighter. The
    // square root keeps Venus at closest approach from swamping the
    // sky — the eye's response to brightness is compressive too.
    if (this.planetMeshes) {
      sky.planets.forEach((p, i) => {
        const sprite = this.planetMeshes[i];
        if (!sprite) return;
        const d = 26000;
        const l = p.lambda * RAD;
        sprite.position.set(Math.cos(l) * d, Math.sin(l * 0.13) * d * 0.06, Math.sin(l) * d);
        const bright = Math.min(1, Math.sqrt(p.magnitude) * 0.42);
        sprite.scale.setScalar(700 + bright * 1500);
        sprite.material.color.set(p.color);
        sprite.material.opacity = 0.5 + bright * 0.5;
        sprite.visible = true;
      });
    }

    return sky;
  }

  // ---------------- pins ----------------

  /**
   * Drop a marker on a real place. `pin` needs { lat, lng } and may
   * carry anything else — it is handed straight back on click.
   * If pin.rbv is true, renders the glowing Rainbow Bridge Valley beacon.
   */
  addPin(pin) {
    const isRbv = !!pin.rbv;
    const p = latLngToVec(pin.lat, pin.lng, R_EARTH * 1.005);
    const group = new THREE.Group();

    let head, beam, ring, flare;

    if (isRbv) {
      // Rainbow Bridge Valley — the sacred glowing beacon
      const beamHeight = R_EARTH * 0.16;
      beam = new THREE.Mesh(
        new THREE.CylinderGeometry(R_EARTH * 0.005, R_EARTH * 0.007, beamHeight, 16),
        new THREE.MeshBasicMaterial({ color: 0xf2d04a, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending }),
      );
      beam.position.y = beamHeight / 2;

      head = new THREE.Mesh(
        new THREE.SphereGeometry(R_EARTH * 0.022, 24, 18),
        new THREE.MeshBasicMaterial({ color: 0xfffae0 }),
      );
      head.position.y = beamHeight + R_EARTH * 0.01;

      // Base sanctum ring on the surface
      const ringGeo = new THREE.RingGeometry(R_EARTH * 0.008, R_EARTH * 0.038, 32);
      ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color: 0xe8c96a,
          transparent: true,
          opacity: 0.65,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = R_EARTH * 0.002;

      // Luminous beacon flare
      const flareMat = new THREE.SpriteMaterial({
        map: glintTexture(),
        color: 0xffe270,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      flare = new THREE.Sprite(flareMat);
      flare.position.y = head.position.y;
      flare.scale.setScalar(R_EARTH * 0.12);

      group.add(ring, beam, head, flare);
    } else {
      // Memorial pin
      const beamHeight = R_EARTH * 0.075;
      beam = new THREE.Mesh(
        new THREE.CylinderGeometry(R_EARTH * 0.0035, R_EARTH * 0.0035, beamHeight, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.55 }),
      );
      beam.position.y = beamHeight / 2;

      head = new THREE.Mesh(
        new THREE.SphereGeometry(R_EARTH * 0.012, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffd76a }),
      );
      head.position.y = beamHeight + R_EARTH * 0.003;

      group.add(beam, head);
    }

    group.position.copy(p);
    group.lookAt(0, 0, 0);
    group.rotateX(Math.PI / 2);
    group.userData.pin = pin;
    this.scene.add(group);

    const pinObj = {
      group,
      head,
      beam,
      ring,
      flare,
      pin,
      isRbv,
      phase: Math.random() * Math.PI * 2,
    };
    this.pins.push(pinObj);
    return group;
  }

  clearPins() {
    for (const p of this.pins) {
      this.scene.remove(p.group);
      p.group.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
    }
    this.pins = [];
  }

  _pickSetup() {
    const ray = new THREE.Raycaster();
    const v = new THREE.Vector2();
    let down = null;
    this.canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    this.canvas.addEventListener('pointercancel', () => { down = null; });
    this.canvas.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
      const r = this.canvas.getBoundingClientRect();
      v.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      v.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(v, this.camera);
      const pinTargets = this.pins.map(p => p.group);
      const pinHits = pinTargets.length ? ray.intersectObjects(pinTargets, true) : [];
      const earthHits = this.earth ? ray.intersectObject(this.earth, false) : [];

      if (pinHits.length && (!earthHits.length || pinHits[0].distance < earthHits[0].distance)) {
        let o = pinHits[0].object;
        while (o && !o.userData.pin) o = o.parent;
        if (o) this.opts.onPinClick?.(o.userData.pin);
      } else if (earthHits.length && earthHits[0].point) {
        const { lat, lng } = vecToLatLng(earthHits[0].point);
        this.opts.onGlobeClick?.({ lat, lng });
      }
    });

    // Hover cursor feedback for interactive feel
    this.canvas.addEventListener('pointermove', e => {
      const r = this.canvas.getBoundingClientRect();
      v.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      v.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(v, this.camera);
      const pinTargets = this.pins.map(p => p.group);
      const pinHits = pinTargets.length ? ray.intersectObjects(pinTargets, true) : [];
      const earthHits = this.earth ? ray.intersectObject(this.earth, false) : [];
      if (pinHits.length && (!earthHits.length || pinHits[0].distance < earthHits[0].distance)) {
        this.canvas.style.cursor = 'pointer';
      } else if (earthHits.length) {
        this.canvas.style.cursor = 'grab';
      } else {
        this.canvas.style.cursor = 'default';
      }
    });
    this.canvas.addEventListener('pointerdown', () => {
      if (this.canvas.style.cursor === 'grab') this.canvas.style.cursor = 'grabbing';
    });
  }

  /**
   * Frame the opening shot on daylight.
   *
   * The camera cannot simply sit at a fixed point: whether that lands
   * on a lit Earth or a black one depends entirely on what time the
   * visitor happens to open the page. Measured on a mid-morning load
   * the default put the camera 151° from the sun — a nearly unlit
   * disc, correct but not a planet anyone would recognise.
   *
   * So the opening is defined relative to the sun instead: offset far
   * enough off the sub-solar point to keep the terminator in frame
   * (which is what gives the sphere its depth), and tilted north,
   * where the land is. Rotating the globe from there still reaches
   * the night side, city lights and all.
   */
  frameSunlit({ lngOffset = 46, latBias = 16, distance } = {}) {
    // Built straight from the sub-solar coordinates rather than by
    // rotating the sun vector about a derived axis. Both earlier
    // attempts at that quietly depended on the handedness of a cross
    // product and swung the camera into the southern hemisphere — one
    // of them opened on Antarctica.
    const s = this.sky?.sun ?? { lat: 0, lng: 0 };
    // Stand east of the sub-solar point, and a little north of it:
    // most land is northern, and the offset keeps the terminator in
    // frame, which is what gives the disc its roundness.
    const camLat = Math.max(-25, Math.min(48, s.lat + latBias));
    const camLng = s.lng + lngOffset;

    // On portrait mobile screens pull back significantly so the globe
    // doesn't fill the entire narrow viewport — the planet should be
    // an orb in space, not a wall of blue.
    if (distance == null) {
      const isMobile = window.innerWidth < 760 && window.innerWidth < window.innerHeight;
      distance = isMobile ? R_EARTH * 6.2 : R_EARTH * 4.6;
    }

    this.camera.position.copy(latLngToVec(camLat, camLng, distance));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);
    this.controls?.update();
    return this;
  }

  /** Swing the camera around to face a place, without descending. */
  focus(lat, lng, { duration = 1600 } = {}) {
    const target = latLngToVec(lat, lng, this.camera.position.length());
    const from = this.camera.position.clone();
    const t0 = performance.now();
    this._tween = () => {
      const k = Math.min(1, (performance.now() - t0) / duration);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.camera.position.copy(from).lerp(target, e).normalize()
        .multiplyScalar(from.length() * (1 - e) + target.length() * e);
      this.camera.lookAt(0, 0, 0);
      if (k >= 1) this._tween = null;
    };
  }

  /**
   * Smooth camera zoom and focus toward a target geographic location.
   */
  zoomTo(lat, lng, { targetDistance = R_EARTH * 1.55, duration = 1100 } = {}) {
    return new Promise((resolve) => {
      const targetVec = latLngToVec(lat, lng, targetDistance);
      const from = this.camera.position.clone();
      const t0 = performance.now();
      if (this.controls) this.controls.autoRotate = false;
      this._tween = () => {
        const k = Math.min(1, (performance.now() - t0) / duration);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        this.camera.position.copy(from).lerp(targetVec, e);
        this.camera.lookAt(0, 0, 0);
        if (this.controls) this.controls.target.set(0, 0, 0);
        if (k >= 1) {
          this._tween = null;
          resolve();
        }
      };
    });
  }

  resize() {
    const w = this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || window.innerWidth || 0;
    const h = this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || window.innerHeight || 0;
    if (w < 1 || h < 1) return;
    this.renderer.setSize(w, h, true);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      if (this.bloom) this.bloom.setSize(w, h);
      if (this.bloomPass) this.bloomPass.setSize(w, h); // just in case
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    // Re-frame when orientation changes so the globe never fills the
    // entire portrait viewport or looks tiny in landscape.
    const isMobile = w < 760;
    const isPortrait = h > w;
    const targetDist = isMobile && isPortrait ? R_EARTH * 6.2 : R_EARTH * 4.6;
    const currentDist = this.camera.position.length();
    // Only re-frame if we're at a default distance (haven't been user-scrolled)
    if (Math.abs(currentDist - R_EARTH * 4.6) < 15 || Math.abs(currentDist - R_EARTH * 6.2) < 15 || Math.abs(currentDist - R_EARTH * 4.2) < 15 || Math.abs(currentDist - R_EARTH * 5.8) < 15) {
      this.camera.position.normalize().multiplyScalar(targetDist);
      this.controls?.update();
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this._raf = requestAnimationFrame(() => this._loop());
  }

  stop() { this.running = false; cancelAnimationFrame(this._raf); }

  destroy() {
    this.stop();
    clearInterval(this._syncTimer);
    removeEventListener('resize', this._onResize);
    this.controls?.dispose();
    this.composer?.dispose();
    this.scene?.traverse(obj => {
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
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
  }

  _loop() {
    if (!this.running) return;
    this._raf = requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    try {
      this._update(dt);
      if (this.composer) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
    } catch (e) {
      if (!this._warned) { this._warned = true; console.warn('[globe]', e); }
    }
  }

  _update(dt) {
    const t = this.clock.getElapsedTime();
    this.controls.update();
    if (this._tween) this._tween();

    // Clouds drift a little faster than the planet turns.
    if (this.clouds) this.clouds.rotation.y += dt * 0.006;
    if (this.starMat) this.starMat.uniforms.uTime.value = t;
    if (this.haloMat) this.haloMat.uniforms.uTime.value = t;

    // Pins breathe so they read as live markers
    for (const p of this.pins) {
      if (p.isRbv) {
        const rbvPulse = 1 + Math.sin(t * 3.0) * 0.22;
        p.head.scale.setScalar(rbvPulse);
        if (p.flare) p.flare.scale.setScalar(R_EARTH * 0.12 * (0.85 + Math.sin(t * 4.0) * 0.2));
        if (p.ring) {
          p.ring.rotation.z += dt * 0.6;
          p.ring.scale.setScalar(1 + Math.sin(t * 2.2) * 0.18);
        }
      } else {
        const pulse = 1 + Math.sin(t * 2.2 + p.phase) * 0.16;
        p.head.scale.setScalar(pulse);
      }
    }

    this._updateShooting(dt);
  }

  /**
   * Meteors.
   *
   * These were single-pixel lines that appeared and vanished whole,
   * which reads as a glitch rather than a meteor. A real one is a
   * bright head with an ablation trail streaming behind it, it
   * *travels*, and it fades from the tail forward.
   *
   * So each is a strip of geometry drawn along the path with vertex
   * colours falling to zero at the tail, additively blended. The head
   * advances along its track; the trail is the part of the track it
   * has already covered, which is what a trail is.
   */
  _updateShooting(dt) {
    const SEGS = 24;
    if (Math.random() < dt * 0.55 && this.shooting.length < 4) {
      // Enter high, travel a long way across the field, and stay out
      // near the stars so it never crosses in front of the planet.
      const from = randomSpherePoint(34000);
      const dir = randomSpherePoint(1).normalize();
      // push the direction perpendicular-ish to the view radius, so it
      // streaks across the sky instead of toward or away from us
      dir.sub(from.clone().normalize().multiplyScalar(dir.dot(from.clone().normalize()) * 0.85)).normalize();
      const len = 7000 + Math.random() * 9000;

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEGS * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SEGS * 3), 3));
      const mat = new THREE.LineBasicMaterial({
        transparent: true, opacity: 1, vertexColors: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      this._shootPool.add(line);
      this.shooting.push({
        line, from, dir, len,
        life: 0,
        ttl: 1.1 + Math.random() * 0.9,
        // most meteors are white-green; a few burn orange
        tint: Math.random() < 0.25
          ? new THREE.Color(1.0, 0.72, 0.42)
          : new THREE.Color(0.85, 0.95, 1.0),
      });
    }

    this._headV3 = this._headV3 || new THREE.Vector3();
    const head = this._headV3;
    for (const s of this.shooting) {
      s.life += dt;
      const u = s.life / s.ttl;                 // 0 → 1 along the track
      const trail = 0.22;                       // how much of the track glows
      const pos = s.line.geometry.attributes.position;
      const col = s.line.geometry.attributes.color;
      // Fade the whole thing in quickly and out slowly.
      const envelope = Math.min(1, u * 8) * Math.max(0, 1 - Math.pow(u, 2.2));
      for (let i = 0; i < SEGS; i++) {
        const f = i / (SEGS - 1);               // 0 = tail, 1 = head
        const at = Math.max(0, u - trail * (1 - f));
        head.copy(s.dir).multiplyScalar(at * s.len).add(s.from);
        pos.setXYZ(i, head.x, head.y, head.z);
        // brightness ramps hard toward the head
        const b = Math.pow(f, 2.6) * envelope;
        col.setXYZ(i, s.tint.r * b, s.tint.g * b, s.tint.b * b);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }

    this.shooting = this.shooting.filter(s => {
      if (s.life < s.ttl) return true;
      this._shootPool.remove(s.line);
      s.line.geometry.dispose(); s.line.material.dispose();
      return false;
    });
  }
}

// ---------------------------------------------------------------
// helpers
// ---------------------------------------------------------------

/** Geographic coordinates to a world-space vector. */
export function latLngToVec(lat, lng, radius) {
  const phi = (90 - lat) * RAD;
  const theta = (lng + 180) * RAD;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/** World-space vector on Earth sphere to geographic coordinates. */
export function vecToLatLng(v) {
  const r = v.length() || 1;
  const phi = Math.acos(Math.max(-1, Math.min(1, v.y / r)));
  const lat = 90 - (phi / RAD);
  let theta = Math.atan2(v.z, -v.x);
  let lng = (theta / RAD) - 180;
  while (lng < -180) lng += 360;
  while (lng > 180) lng -= 360;
  return { lat: Math.round(lat * 10000) / 10000, lng: Math.round(lng * 10000) / 10000 };
}

function randomSpherePoint(r) {
  const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return new THREE.Vector3(Math.cos(a) * s * r, u * r, Math.sin(a) * s * r);
}

/**
 * A bright point as the eye actually receives it: a small hot core,
 * a soft halo around it, and four faint diffraction spikes. The
 * spikes are why a bright planet looks like a star shape rather than
 * a dot — they come from the eye's own optics, and leaving them out
 * is most of why rendered night skies look like dots on paper.
 */
let _cachedGlintTex = null;
function glintTexture() {
  if (_cachedGlintTex) return _cachedGlintTex;
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const m = S / 2;

  // halo
  const g = x.createRadialGradient(m, m, 0, m, m, m);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.06, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.16, 'rgba(255,255,255,0.34)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.07)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);

  // spikes — long and very faint, tapering to nothing
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    x.save();
    x.translate(m, m);
    x.rotate((Math.PI / 2) * i);
    const sg = x.createLinearGradient(0, 0, m, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0.5)');
    sg.addColorStop(0.25, 'rgba(255,255,255,0.1)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = sg;
    x.beginPath();
    x.moveTo(0, -1.6);
    x.lineTo(m, 0);
    x.lineTo(0, 1.6);
    x.closePath();
    x.fill();
    x.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  _cachedGlintTex = t;
  return t;
}

let _cachedDiscTex = null;
function discTexture() {
  if (_cachedDiscTex) return _cachedDiscTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  _cachedDiscTex = t;
  return t;
}

export default Globe;
