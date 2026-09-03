// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — Object thumbnails
//
// Every physical thing a visitor can buy or place is rendered here
// in 3D, offscreen, with the same procedural PBR materials it will
// have once it is standing on the plot (see materials.js). The shop
// grid therefore shows the actual object rather than a stand-in —
// the candle in the gift list is the candle that gets lit.
//
// One shared 256px renderer does all of them, lit like a product
// shot: neutral studio probe, warm key, cool rim. Results are cached
// in memory and in sessionStorage, so the cost is paid once per
// session and never during an interaction.
// ============================================================
// three.js and the material library are loaded ON DEMAND, not at import
// time. This module is imported by ui.js, which is on the boot path —
// a static `import * as THREE from 'three'` here would put a ~1.3MB CDN
// download in front of the loading screen, and a slow or blocked CDN
// would strand the visitor there. Nothing in the entrance needs a
// renderer, so nothing in the entrance waits for one.
let THREE = null;
let RoomEnvironment = null;
let Surfaces = null;
let loadingLibs = null;

const SIZE = 256;
const CACHE_KEY = 'rbv_thumbs_v1';

// Photographs, where we have one AND hold its attribution. The
// manifest lists only credited files: shipping a CC-BY image without a
// visible credit is a licence breach, so an uncredited download is
// treated as though it does not exist.
const PHOTO_DIR = 'images/catalog/';
let photoSet = null;
export const photosReady = Promise.race([
  fetch(PHOTO_DIR + 'manifest.json')
    .then(r => (r.ok ? r.json() : []))
    .then(list => { photoSet = new Set(list); return photoSet; })
    .catch(() => { photoSet = new Set(); return photoSet; }),
  new Promise(resolve => setTimeout(() => {
    if (!photoSet) photoSet = new Set();
    resolve(photoSet);
  }, 1000)),
]);

/** Path to a real photograph for this id, or null. */
export function photoFor(id) {
  const key = ALIASES[id] || id;
  return photoSet?.has(key) ? PHOTO_DIR + key + '.jpg' : null;
}

const mem = new Map();
let store = null;
try { store = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}'); } catch { store = {}; }

let R = null;   // { renderer, scene, camera, key, rim, env }

/** Pull in the renderer stack. Safe to call repeatedly. */
export async function loadLibs() {
  if (THREE) return true;
  loadingLibs ||= (async () => {
    const [three, roomEnv, materials] = await Promise.all([
      import('three'),
      import('three/addons/environments/RoomEnvironment.js?v=6'),
      import('./materials.js?v=6'),
    ]);
    THREE = three;
    RoomEnvironment = roomEnv.RoomEnvironment;
    Surfaces = materials.Surfaces;
    return true;
  })();
  return loadingLibs;
}

let studioFailed = false;

function studio() {
  if (R) return R;
  if (studioFailed) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.background = null;

    // A neutral room probe is what makes a product shot read as a
    // photograph: every surface picks up soft bounce from all sides.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.85;

    const key = new THREE.DirectionalLight(0xfff2dc, 2.6);
    key.position.set(4, 7, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 40 });
    key.shadow.bias = -0.0012;
    scene.add(key);

    const rim = new THREE.DirectionalLight(0xbcd4ff, 1.5);
    rim.position.set(-6, 4, -5);
    scene.add(rim);

    // Ground shadow receiver
    const floorGeo = new THREE.PlaneGeometry(16, 16);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.28 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);

    R = { renderer, scene, camera, key, rim, floor, pmrem };
    return R;
  } catch (e) {
    studioFailed = true;
    console.log('[thumbs] studio renderer init failed:', e);
    return null;
  }
}

// ---------------------------------------------------------------
// Geometry builders — one per catalog id. Units are "about a metre",
// and every builder returns a Group sitting on y = 0.
// ---------------------------------------------------------------
// Resolved lazily — THREE does not exist until loadLibs() has run, so
// the class cannot be captured at module scope. Declared as a function
// rather than an arrow so the existing `new V3(...)` call sites still
// work (an explicit object return overrides `new`).
function V3(x, y, z) { return new THREE.Vector3(x, y, z); }

function mesh(geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.scale.setScalar(scale);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** A bevelled slab, so stone edges catch a highlight instead of dying. */
function slab(w, h, d, mat, bevel = 0.04) {
  const shape = new THREE.Shape();
  const r = Math.min(w, h) * bevel;
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: d, bevelEnabled: true, bevelSize: d * 0.08, bevelThickness: d * 0.08, bevelSegments: 2, curveSegments: 8,
  });
  geo.center();
  return mesh(geo, mat);
}

function createCurvedLeafCardGeo(w, h, curveDepth = 0.45) {
  const geo = new THREE.PlaneGeometry(w, h, 2, 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const u = x / (w * 0.5), v = y / (h * 0.5);
    pos.setZ(i, (1.0 - u * u) * curveDepth * (1.0 - v * 0.25));
  }
  geo.computeVertexNormals();
  return geo;
}

function leafyCrown(mat, r = 1, isWeeping = false, seedOff = 0) {
  const g = new THREE.Group();
  const numCards = isWeeping ? 28 : 24;
  for (let i = 0; i < numCards; i++) {
    const phi = Math.acos(1 - 2 * ((i + 0.5) / numCards));
    const theta = i * 2.39996 + seedOff; // golden angle
    const rad = r * (0.35 + 0.55 * Math.sin((i * 1.7) % Math.PI));
    const x = Math.sin(phi) * Math.cos(theta) * rad;
    const y = Math.cos(phi) * (rad * (isWeeping ? 0.65 : 0.85));
    const z = Math.sin(phi) * Math.sin(theta) * rad;
    
    const cardW = r * (isWeeping ? 0.45 : 0.85);
    const cardH = r * (isWeeping ? 1.45 : 0.95);
    const cardGeo = createCurvedLeafCardGeo(cardW, cardH, 0.45);
    const m = mesh(cardGeo, mat, [x, y, z], [
      (Math.sin(i * 1.3) - 0.5) * 0.8,
      theta + Math.PI * 0.5,
      (Math.cos(i * 1.7) - 0.5) * 0.5
    ]);
    g.add(m);
  }
  return g;
}

function tree(crownColor, { trunkH = 1.5, crownR = 1.35, weeping = false } = {}) {
  const g = new THREE.Group();
  const bark = Surfaces.bark(1.2);
  // Organic flared trunk
  const trunkGeo = new THREE.CylinderGeometry(0.09, 0.22, trunkH, 14);
  g.add(mesh(trunkGeo, bark, [0, trunkH / 2, 0]));
  
  // Scaffold branchlets
  for (let b = 0; b < 4; b++) {
    const bAng = (b / 4) * Math.PI * 2 + 0.3;
    const bLen = crownR * 0.55;
    const br = new THREE.CylinderGeometry(0.035, 0.07, bLen, 6);
    br.rotateZ(0.68);
    br.rotateY(bAng);
    br.translate(Math.cos(bAng) * (bLen * 0.4), trunkH * 0.85, Math.sin(bAng) * (bLen * 0.4));
    g.add(mesh(br, bark));
  }

  const foliage = Surfaces.foliage(1.4, crownColor);
  const crown = leafyCrown(foliage, crownR, weeping);
  crown.position.y = trunkH + crownR * 0.45;
  if (weeping) {
    // Cascading willow tendril ribbons
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const rad = crownR * (0.75 + (i % 3) * 0.22);
      const tendrilH = crownR * (1.2 + (i % 2) * 0.4);
      const tGeo = createCurvedLeafCardGeo(crownR * 0.38, tendrilH, 0.35);
      tGeo.rotateY(a + Math.PI * 0.5);
      tGeo.translate(Math.cos(a) * rad, trunkH + crownR * 0.2 - tendrilH * 0.35, Math.sin(a) * rad);
      g.add(mesh(tGeo, foliage));
    }
  }
  g.add(crown);
  return g;
}

const BUILDERS = {
  // ---- Markers ----
  it_headstone_classic() {
    const g = new THREE.Group();
    const granite = Surfaces.granite(0.7);
    const base = slab(1.5, 0.22, 0.55, granite);
    base.position.y = 0.11;
    g.add(base);
    // rounded-top headstone
    const shape = new THREE.Shape();
    shape.moveTo(-0.55, 0); shape.lineTo(-0.55, 0.75);
    shape.absarc(0, 0.75, 0.55, Math.PI, 0, true);
    shape.lineTo(0.55, 0); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 16 });
    g.add(mesh(geo, granite, [0, 0.22, -0.1]));
    return g;
  },

  it_headstone_heart() {
    const g = new THREE.Group();
    const marble = Surfaces.marble(0.6);
    const base = slab(1.4, 0.2, 0.5, marble);
    base.position.y = 0.1; g.add(base);
    const s = new THREE.Shape();
    s.moveTo(0, -0.5);
    s.bezierCurveTo(-0.75, 0.1, -0.4, 0.72, 0, 0.4);
    s.bezierCurveTo(0.4, 0.72, 0.75, 0.1, 0, -0.5);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 4, curveSegments: 24 });
    g.add(mesh(geo, marble, [0, 0.72, -0.1]));
    return g;
  },

  it_obelisk() {
    const g = new THREE.Group();
    const marble = Surfaces.marble(0.5);
    g.add(mesh(new THREE.BoxGeometry(0.8, 0.16, 0.8), marble, [0, 0.08, 0]));
    g.add(mesh(new THREE.BoxGeometry(0.6, 0.14, 0.6), marble, [0, 0.23, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.19, 0.26, 1.5, 4), marble, [0, 1.05, 0], [0, Math.PI / 4, 0]));
    g.add(mesh(new THREE.ConeGeometry(0.27, 0.34, 4), marble, [0, 1.97, 0], [0, Math.PI / 4, 0]));
    return g;
  },

  // A seated dog, carved. Built in strict side profile along +X, which
  // is the only arrangement that still reads as a dog once it is
  // shaded white-on-white at thumbnail size.
  it_statue_dog() {
    const g = new THREE.Group();
    const marble = Surfaces.marble(0.5);
    g.add(mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.2, 32), marble, [0, 0.1, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.56, 0.62, 0.1, 32), marble, [0, 0.24, 0]));

    // rear haunch, sitting
    const haunch = mesh(new THREE.SphereGeometry(0.3, 24, 18), marble, [-0.22, 0.5, 0]);
    haunch.scale.set(1, 0.92, 0.78);
    g.add(haunch);

    // chest rising forward to the shoulders
    const chest = mesh(new THREE.CapsuleGeometry(0.21, 0.42, 8, 20), marble, [0.06, 0.7, 0], [0, 0, -0.34]);
    chest.scale.set(1, 1, 0.86);
    g.add(chest);

    // straight front legs down to the plinth
    for (const z of [-0.14, 0.14]) {
      g.add(mesh(new THREE.CapsuleGeometry(0.072, 0.34, 6, 14), marble, [0.26, 0.47, z]));
      g.add(mesh(new THREE.SphereGeometry(0.085, 14, 10), marble, [0.3, 0.31, z]));
    }

    // head, muzzle, ears
    const head = mesh(new THREE.SphereGeometry(0.19, 24, 18), marble, [0.26, 1.06, 0]);
    head.scale.set(1, 1, 0.92);
    g.add(head);
    const muzzle = mesh(new THREE.CapsuleGeometry(0.085, 0.16, 6, 14), marble, [0.44, 1.0, 0], [0, 0, Math.PI / 2 - 0.18]);
    g.add(muzzle);
    g.add(mesh(new THREE.SphereGeometry(0.045, 12, 10), marble, [0.53, 0.99, 0]));
    for (const z of [-0.13, 0.13]) {
      const ear = mesh(new THREE.CapsuleGeometry(0.048, 0.15, 5, 12), marble, [0.19, 1.18, z], [0.26 * Math.sign(z), 0, 0.42]);
      ear.scale.set(1, 1, 0.5);
      g.add(ear);
    }

    // tail curling up behind
    const tail = new THREE.CatmullRomCurve3([
      new V3(-0.45, 0.4, 0), new V3(-0.6, 0.56, 0), new V3(-0.58, 0.78, 0), new V3(-0.42, 0.86, 0),
    ]);
    g.add(mesh(new THREE.TubeGeometry(tail, 20, 0.055, 10), marble));
    return g;
  },

  // A sitting cat, upright — the classic garden statue pose. The
  // curled-up version read as a stack of rings at this size.
  it_statue_cat() {
    const g = new THREE.Group();
    const marble = Surfaces.marble(0.5);
    g.add(mesh(new THREE.CylinderGeometry(0.58, 0.64, 0.18, 32), marble, [0, 0.09, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.52, 0.58, 0.09, 32), marble, [0, 0.22, 0]));

    // body: a tapered cone from haunch to shoulder
    const body = mesh(new THREE.CylinderGeometry(0.2, 0.4, 0.78, 28), marble, [-0.02, 0.65, 0]);
    body.scale.set(1, 1, 0.88);
    g.add(body);
    const haunch = mesh(new THREE.SphereGeometry(0.28, 22, 16), marble, [-0.12, 0.4, 0]);
    haunch.scale.set(1, 0.78, 0.9);
    g.add(haunch);

    // front legs, straight and close together
    for (const z of [-0.12, 0.12]) {
      g.add(mesh(new THREE.CapsuleGeometry(0.055, 0.3, 6, 14), marble, [0.2, 0.42, z]));
      g.add(mesh(new THREE.SphereGeometry(0.068, 14, 10), marble, [0.24, 0.29, z]));
    }

    // head with a short muzzle and two clear triangular ears
    const head = mesh(new THREE.SphereGeometry(0.2, 24, 18), marble, [0.03, 1.14, 0]);
    head.scale.set(1, 0.94, 0.94);
    g.add(head);
    g.add(mesh(new THREE.SphereGeometry(0.085, 14, 12), marble, [0.17, 1.08, 0]));
    for (const z of [-0.11, 0.11]) {
      g.add(mesh(new THREE.ConeGeometry(0.082, 0.19, 4), marble, [0.0, 1.32, z], [0, Math.PI / 4, z > 0 ? -0.22 : 0.22]));
    }

    // tail curling around the base
    const tail = new THREE.CatmullRomCurve3([
      new V3(-0.3, 0.32, 0.1), new V3(-0.5, 0.3, 0.24), new V3(-0.4, 0.3, 0.46), new V3(-0.12, 0.31, 0.5),
      new V3(0.16, 0.32, 0.4),
    ]);
    g.add(mesh(new THREE.TubeGeometry(tail, 26, 0.058, 10), marble));
    return g;
  },

  it_plaque_bronze() {
    const g = new THREE.Group();
    const bronze = Surfaces.bronze(0.8);
    const stone = Surfaces.limestone(1.2);
    g.add(mesh(new THREE.BoxGeometry(1.5, 0.18, 0.9), stone, [0, 0.09, 0]));
    const p = slab(1.25, 0.72, 0.07, bronze, 0.06);
    p.position.set(0, 0.3, 0.06);
    p.rotation.x = -0.42;
    g.add(p);
    return g;
  },

  // ---- Nature ----
  it_oak() { return tree(0x5e8f4e, { trunkH: 1.5, crownR: 1.4 }); },
  it_willow() { return tree(0x84ad6c, { trunkH: 1.3, crownR: 1.35, weeping: true }); },
  it_cherry() { return tree(0xf2b8cf, { trunkH: 1.45, crownR: 1.35 }); },

  it_rosebed() {
    const g = new THREE.Group();
    const soil = Surfaces.limestoneDark(2).clone();
    soil.color.setHex(0x6b5946);
    g.add(mesh(new THREE.CylinderGeometry(1.05, 1.1, 0.24, 28), soil, [0, 0.12, 0]));
    const leaf = Surfaces.foliage(1, 0x4e7f45);
    const rose = Surfaces.petal(1, 0xc4324a);
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * Math.PI * 2 + i * 0.7;
      const rad = 0.28 + (i % 3) * 0.26;
      const h = 0.34 + (i % 4) * 0.1;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      g.add(mesh(new THREE.CylinderGeometry(0.022, 0.03, h, 6), leaf, [x, 0.24 + h / 2, z]));
      // layered bloom
      const head = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        head.add(mesh(new THREE.IcosahedronGeometry(0.085 - k * 0.018, 1), rose, [0, k * 0.03, 0], [k * 0.9, k * 0.7, 0]));
      }
      head.position.set(x, 0.24 + h, z);
      g.add(head);
    }
    return g;
  },

  it_wildflow() {
    const g = new THREE.Group();
    const grass = Surfaces.grass(3).clone();
    g.add(mesh(new THREE.CylinderGeometry(1.1, 1.12, 0.16, 28), grass, [0, 0.08, 0]));
    const stem = Surfaces.foliage(1, 0x5f8a4a);
    const colors = [0xf3d84a, 0xe8734a, 0xd8639b, 0xfaf3e0, 0x8f7fd8];
    for (let i = 0; i < 22; i++) {
      const a = i * 2.399;                        // golden-angle scatter
      const rad = Math.sqrt(i / 22) * 0.95;
      const h = 0.26 + ((i * 7) % 5) * 0.07;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      g.add(mesh(new THREE.CylinderGeometry(0.014, 0.018, h, 5), stem, [x, 0.16 + h / 2, z]));
      const petal = Surfaces.petal(1, colors[i % colors.length]);
      const head = new THREE.Group();
      for (let p = 0; p < 5; p++) {
        const pa = (p / 5) * Math.PI * 2;
        head.add(mesh(new THREE.SphereGeometry(0.045, 10, 8),
          petal, [Math.cos(pa) * 0.05, 0, Math.sin(pa) * 0.05], [0, 0, 0], 1));
      }
      head.position.set(x, 0.16 + h, z);
      head.scale.set(1, 0.5, 1);
      g.add(head);
    }
    return g;
  },

  it_cactus() {
    const g = new THREE.Group();
    const sandy = Surfaces.sand(2);
    const flesh = Surfaces.foliage(1.6, 0x4d7a45);
    g.add(mesh(new THREE.CylinderGeometry(0.95, 1, 0.16, 28), sandy, [0, 0.08, 0]));
    g.add(mesh(new THREE.CapsuleGeometry(0.24, 1.5, 6, 20), flesh, [0, 1.06, 0]));
    g.add(mesh(new THREE.CapsuleGeometry(0.13, 0.5, 6, 16), flesh, [-0.4, 1.0, 0], [0, 0, 0.5]));
    g.add(mesh(new THREE.CapsuleGeometry(0.13, 0.42, 6, 16), flesh, [0.38, 1.24, 0], [0, 0, -0.55]));
    const bloom = Surfaces.petal(1, 0xf07a9c);
    g.add(mesh(new THREE.SphereGeometry(0.11, 12, 10), bloom, [0, 1.86, 0]));
    g.add(mesh(new THREE.SphereGeometry(0.075, 12, 10), bloom, [-0.55, 1.24, 0]));
    return g;
  },

  // ---- Furnishings ----
  it_bench() {
    const g = new THREE.Group();
    const wood = Surfaces.timber(1.1);
    const iron = Surfaces.iron(1.2);
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(1.9, 0.075, 0.17), wood, [0, 0.5, -0.19 + i * 0.19]));
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(1.9, 0.16, 0.07), wood, [0, 0.66 + i * 0.19, -0.29], [0.16, 0, 0]));
    for (const x of [-0.8, 0.8]) {
      g.add(mesh(new THREE.BoxGeometry(0.07, 0.5, 0.07), iron, [x, 0.25, 0.19]));
      g.add(mesh(new THREE.BoxGeometry(0.07, 0.5, 0.07), iron, [x, 0.25, -0.24]));
      g.add(mesh(new THREE.BoxGeometry(0.07, 0.06, 0.52), iron, [x, 0.47, -0.03]));
      g.add(mesh(new THREE.TorusGeometry(0.16, 0.028, 8, 20, Math.PI), iron, [x, 0.72, -0.27], [0, Math.PI / 2, 0]));
    }
    return g;
  },

  it_fountain() {
    const g = new THREE.Group();
    const marble = Surfaces.marble(0.7);
    const water = new THREE.MeshPhysicalMaterial({
      color: 0x3f86a8, roughness: 0.08, metalness: 0.02, transmission: 1.0,
      thickness: 2.0, ior: 1.333, transparent: false, clearcoat: 1.0, clearcoatRoughness: 0.02,
      attenuationColor: new THREE.Color(0x0a384c), attenuationDistance: 4.0, envMapIntensity: 2.0,
    });
    g.add(mesh(new THREE.CylinderGeometry(1.1, 1.18, 0.34, 40), marble, [0, 0.17, 0]));
    g.add(mesh(new THREE.TorusGeometry(1.1, 0.075, 12, 40), marble, [0, 0.34, 0], [Math.PI / 2, 0, 0]));
    g.add(mesh(new THREE.CylinderGeometry(1.02, 1.02, 0.06, 40), water, [0, 0.32, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.62, 20), marble, [0, 0.64, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.44, 0.28, 0.14, 28), marble, [0, 1.0, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 28), water, [0, 1.06, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 14), marble, [0, 1.2, 0]));
    g.add(mesh(new THREE.SphereGeometry(0.11, 18, 14), water, [0, 1.4, 0]));
    // falling water
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.add(mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.66, 6), water,
        [Math.cos(a) * 0.4, 0.7, Math.sin(a) * 0.4]));
    }
    return g;
  },

  it_lantern() {
    const g = new THREE.Group();
    const iron = Surfaces.iron(1);
    const glass = Surfaces.glass();
    const flame = new THREE.MeshStandardMaterial({
      color: 0xffd9a0, emissive: 0xffab3d, emissiveIntensity: 3.4, roughness: 0.4,
    });
    g.add(mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.12, 8), iron, [0, 0.06, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 8), iron, [0, 0.4, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.08, 8), iron, [0, 0.74, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.52, 8, 1, true), glass, [0, 1.04, 0]));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      g.add(mesh(new THREE.BoxGeometry(0.035, 0.52, 0.035), iron, [Math.cos(a) * 0.24, 1.04, Math.sin(a) * 0.24]));
    }
    g.add(mesh(new THREE.SphereGeometry(0.11, 16, 12), flame, [0, 1.0, 0], [0, 0, 0], 1));
    g.add(mesh(new THREE.ConeGeometry(0.3, 0.24, 8), iron, [0, 1.42, 0]));
    g.add(mesh(new THREE.TorusGeometry(0.1, 0.022, 8, 18), iron, [0, 1.62, 0], [Math.PI / 2, 0, 0]));
    return g;
  },

  it_fence() {
    const g = new THREE.Group();
    const iron = Surfaces.iron(1.4);
    g.add(mesh(new THREE.BoxGeometry(2.2, 0.05, 0.05), iron, [0, 0.62, 0]));
    g.add(mesh(new THREE.BoxGeometry(2.2, 0.05, 0.05), iron, [0, 0.16, 0]));
    for (let i = 0; i <= 9; i++) {
      const x = -1.05 + (i / 9) * 2.1;
      g.add(mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.82, 8), iron, [x, 0.41, 0]));
      g.add(mesh(new THREE.ConeGeometry(0.05, 0.13, 8), iron, [x, 0.88, 0]));
    }
    for (const x of [-1.1, 1.1]) {
      g.add(mesh(new THREE.BoxGeometry(0.08, 1.05, 0.08), iron, [x, 0.52, 0]));
      g.add(mesh(new THREE.SphereGeometry(0.07, 14, 10), iron, [x, 1.08, 0]));
    }
    for (let i = 0; i < 4; i++) {
      g.add(mesh(new THREE.TorusGeometry(0.11, 0.018, 8, 20), iron, [-0.79 + i * 0.53, 0.39, 0]));
    }
    return g;
  },

  // Wind chimes read only if the tubes are the dominant shape: thick
  // enough to see, dark enough to separate from the pale ground, and
  // hung on visible cords rather than hairline cylinders.
  it_windchime() {
    const g = new THREE.Group();
    const wood = Surfaces.timber(0.8);
    const silver = new THREE.MeshStandardMaterial({ color: 0x9aa4b0, roughness: 0.22, metalness: 1 });
    const cord = new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 0.92 });

    // hanging loop and top disc
    g.add(mesh(new THREE.TorusGeometry(0.11, 0.022, 10, 22), cord, [0, 2.34, 0], [Math.PI / 2, 0, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.22, 8), cord, [0, 2.14, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.075, 32), wood, [0, 2.0, 0]));

    // six tubes at graded lengths, the tallest at the front
    const lens = [0.95, 0.84, 0.72, 0.62, 0.72, 0.84];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      const x = Math.cos(a) * 0.33, z = Math.sin(a) * 0.33;
      g.add(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.2, 6), cord, [x, 1.88, z]));
      const tube = mesh(new THREE.CylinderGeometry(0.055, 0.055, lens[i], 18, 1, true), silver,
        [x, 1.78 - lens[i] / 2, z]);
      tube.material.side = THREE.DoubleSide;
      g.add(tube);
      // capped top, so the tube does not read as an open ring
      g.add(mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.012, 18), silver, [x, 1.78, z]));
    }

    // central cord → striker disc → sail
    g.add(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.86, 6), cord, [0, 1.45, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.045, 26), wood, [0, 1.0, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.34, 6), cord, [0, 0.8, 0]));
    const sail = slab(0.3, 0.42, 0.03, wood, 0.1);
    sail.position.set(0, 0.44, 0);
    sail.rotation.y = 0.35;
    g.add(sail);
    return g;
  },

  it_gazebo() {
    const g = new THREE.Group();
    const white = Surfaces.marble(0.6).clone();
    white.color.setHex(0xf4f2ec);
    const stone = Surfaces.limestone(2);
    g.add(mesh(new THREE.CylinderGeometry(1.6, 1.7, 0.2, 8), stone, [0, 0.1, 0]));
    g.add(mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.1, 8), white, [0, 0.24, 0]));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = Math.cos(a) * 1.3, z = Math.sin(a) * 1.3;
      g.add(mesh(new THREE.CylinderGeometry(0.075, 0.09, 1.5, 12), white, [x, 1.0, z]));
      g.add(mesh(new THREE.BoxGeometry(0.14, 0.1, 0.14), white, [x, 1.79, z]));
      // rail between posts
      const a2 = ((i + 1) / 8) * Math.PI * 2;
      const mx = (x + Math.cos(a2) * 1.3) / 2, mz = (z + Math.sin(a2) * 1.3) / 2;
      g.add(mesh(new THREE.BoxGeometry(1.0, 0.06, 0.06), white, [mx, 0.62, mz], [0, -a - Math.PI / 8, 0]));
    }
    g.add(mesh(new THREE.CylinderGeometry(0.06, 1.75, 0.62, 8), white, [0, 2.1, 0]));
    g.add(mesh(new THREE.SphereGeometry(0.13, 16, 12), white, [0, 2.5, 0]));
    return g;
  },

  // ---- Gifts ----
  // A wrapped bouquet standing upright: cone tip down, blooms crowding
  // the mouth. The earlier version tipped the whole cone backwards, so
  // it read as an empty paper funnel with sticks in it.
  g_flowers() {
    const g = new THREE.Group();
    const paper = Surfaces.ceramic(1).clone();
    paper.color.setHex(0xf3ede1);
    paper.roughness = 0.78;
    paper.clearcoat = 0;
    const stem = Surfaces.foliage(1, 0x54834a);

    // wrapper — open cone, tip at the base
    const cone = mesh(new THREE.CylinderGeometry(0.5, 0.09, 0.92, 24, 1, true), paper, [0, 0.46, 0]);
    cone.material.side = THREE.DoubleSide;
    g.add(cone);
    // a rolled collar so the paper has an edge to catch light
    g.add(mesh(new THREE.TorusGeometry(0.5, 0.032, 10, 32), paper, [0, 0.92, 0], [Math.PI / 2, 0, 0]));
    // ribbon tied near the tip
    const ribbon = new THREE.MeshPhysicalMaterial({
      color: 0xc4324a, roughness: 0.34, sheen: 1, sheenColor: new THREE.Color(0xff8fa0),
    });
    g.add(mesh(new THREE.TorusGeometry(0.14, 0.036, 10, 26), ribbon, [0, 0.26, 0], [Math.PI / 2, 0, 0]));

    const colors = [0xe8536f, 0xf5d3dd, 0xf3d84a, 0xfbf6ec, 0xc987d8, 0xef8a4a];
    // blooms packed into a shallow dome across the mouth of the cone
    for (let i = 0; i < 15; i++) {
      const a = i * 2.399;                       // golden angle keeps it from clumping
      const rad = Math.sqrt(i / 15) * 0.44;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      const y = 1.0 + (0.44 - rad) * 0.34;       // centre blooms sit higher

      g.add(mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.3, 6), stem, [x * 0.72, y - 0.2, z * 0.72]));

      const petal = Surfaces.petal(1, colors[i % colors.length]);
      const head = new THREE.Group();
      for (let p = 0; p < 6; p++) {
        const pa = (p / 6) * Math.PI * 2 + i;
        const pet = mesh(new THREE.SphereGeometry(0.062, 12, 10), petal,
          [Math.cos(pa) * 0.062, 0, Math.sin(pa) * 0.062]);
        pet.scale.set(1, 0.62, 1);
        head.add(pet);
      }
      // a darker centre reads as a real flower rather than a berry cluster
      head.add(mesh(new THREE.SphereGeometry(0.038, 12, 10),
        Surfaces.petal(1, 0xe8b23a), [0, 0.022, 0]));
      head.position.set(x, y, z);
      g.add(head);
    }

    // a few leaves breaking the outline
    const leaf = Surfaces.foliage(1, 0x4a7a42);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.6;
      const lf = mesh(new THREE.SphereGeometry(0.12, 12, 8), leaf,
        [Math.cos(a) * 0.5, 0.98, Math.sin(a) * 0.5], [0, -a, 0.5]);
      lf.scale.set(1, 0.16, 0.5);
      g.add(lf);
    }
    return g;
  },

  g_candle() {
    const g = new THREE.Group();
    const wax = Surfaces.wax(1);
    const glass = Surfaces.glass();
    const flame = new THREE.MeshStandardMaterial({
      color: 0xfff0c8, emissive: 0xffb03a, emissiveIntensity: 4.2, roughness: 0.3,
    });
    g.add(mesh(new THREE.CylinderGeometry(0.4, 0.38, 1.0, 32, 1, true), glass, [0, 0.5, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.05, 32), glass, [0, 0.03, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.66, 32), wax, [0, 0.38, 0]));
    g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.9 }), [0, 0.74, 0]));
    const f = mesh(new THREE.SphereGeometry(0.08, 16, 14), flame, [0, 0.84, 0]);
    f.scale.set(0.72, 1.7, 0.72);
    f.castShadow = false;
    g.add(f);
    return g;
  },

  // A tennis ball. The seam is the whole identity of the object, and
  // two flat half-tori did not make one — a real seam is a closed curve
  // that waves up and down twice around the sphere, so it is swept
  // along that path instead.
  g_ball() {
    const g = new THREE.Group();
    const R = 0.62;
    const felt = new THREE.MeshPhysicalMaterial({
      color: 0xc8de3c, roughness: 0.95, sheen: 1, sheenRoughness: 0.85,
      sheenColor: new THREE.Color(0xe4f39c),
    });
    const seam = new THREE.MeshStandardMaterial({ color: 0xf7f5ee, roughness: 0.62 });

    g.add(mesh(new THREE.SphereGeometry(R, 48, 36), felt, [0, R, 0]));

    // The classic curve: azimuth sweeps once, elevation oscillates twice.
    const pts = [];
    for (let i = 0; i <= 160; i++) {
      const t = (i / 160) * Math.PI * 2;
      const phi = Math.sin(t * 2) * 0.62;                 // up/down twice
      const r = R * 1.004;
      pts.push(new V3(
        Math.cos(t) * Math.cos(phi) * r,
        Math.sin(phi) * r,
        Math.sin(t) * Math.cos(phi) * r,
      ));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const s = mesh(new THREE.TubeGeometry(curve, 200, 0.032, 8, true), seam, [0, R, 0]);
    s.castShadow = false;
    g.add(s);
    return g;
  },

  g_bone() {
    const g = new THREE.Group();
    const bone = Surfaces.ceramic(1).clone();
    bone.color.setHex(0xf0e8d4);
    g.add(mesh(new THREE.CapsuleGeometry(0.13, 0.9, 8, 20), bone, [0, 0.15, 0], [0, 0, Math.PI / 2]));
    for (const x of [-0.58, 0.58]) {
      for (const z of [-0.13, 0.13]) {
        g.add(mesh(new THREE.SphereGeometry(0.19, 18, 14), bone, [x, 0.16, z]));
      }
    }
    return g;
  },

  g_letter() {
    const g = new THREE.Group();
    const paper = Surfaces.ceramic(1).clone();
    paper.color.setHex(0xf6f1e2);
    paper.roughness = 0.85;
    paper.clearcoat = 0;
    const env = slab(1.5, 1.0, 0.045, paper, 0.02);
    env.position.set(0, 0.55, 0);
    env.rotation.x = -0.28;
    g.add(env);
    // flap
    const s = new THREE.Shape();
    s.moveTo(-0.75, 0.5); s.lineTo(0, 0); s.lineTo(0.75, 0.5); s.closePath();
    const flap = mesh(new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false }), paper,
      [0, 0.55, 0.03], [-0.28, 0, 0]);
    g.add(flap);
    const wax = new THREE.MeshPhysicalMaterial({ color: 0xa8322e, roughness: 0.42, clearcoat: 0.5 });
    g.add(mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.05, 20), wax, [0, 0.5, 0.07], [Math.PI / 2 - 0.28, 0, 0]));
    return g;
  },

  g_balloon() {
    const g = new THREE.Group();
    const latex = new THREE.MeshPhysicalMaterial({
      color: 0xe0607f, roughness: 0.18, clearcoat: 0.9, clearcoatRoughness: 0.12,
      transmission: 0.12, thickness: 0.4,
    });
    const body = mesh(new THREE.SphereGeometry(0.6, 40, 32), latex, [0, 1.5, 0]);
    body.scale.set(1, 1.2, 1);
    g.add(body);
    g.add(mesh(new THREE.ConeGeometry(0.09, 0.16, 14), latex, [0, 0.79, 0], [Math.PI, 0, 0]));
    const curve = new THREE.CatmullRomCurve3([
      new V3(0, 0.76, 0), new V3(0.1, 0.5, 0.06), new V3(-0.08, 0.26, -0.04), new V3(0.05, 0.02, 0.02),
    ]);
    g.add(mesh(new THREE.TubeGeometry(curve, 24, 0.012, 6),
      new THREE.MeshStandardMaterial({ color: 0xf2ede0, roughness: 0.8 })));
    return g;
  },

  g_wreath() {
    const g = new THREE.Group();
    const leaf = Surfaces.foliage(1.6, 0x39653f);
    g.add(mesh(new THREE.TorusGeometry(0.62, 0.13, 16, 44), leaf, [0, 0.14, 0], [Math.PI / 2, 0, 0]));
    // sprigs around the ring
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const r = 0.62 + (i % 3) * 0.045;
      g.add(mesh(new THREE.IcosahedronGeometry(0.11, 1), leaf,
        [Math.cos(a) * r, 0.16 + Math.sin(i * 2.1) * 0.05, Math.sin(a) * r], [i, a, 0], 0.8 + (i % 4) * 0.15));
    }
    const berry = new THREE.MeshPhysicalMaterial({ color: 0xb8323a, roughness: 0.25, clearcoat: 0.8 });
    for (let i = 0; i < 9; i++) {
      const a = i * 2.399;
      g.add(mesh(new THREE.SphereGeometry(0.05, 14, 10), berry,
        [Math.cos(a) * 0.63, 0.24, Math.sin(a) * 0.63]));
    }
    const ribbon = new THREE.MeshPhysicalMaterial({
      color: 0xc4324a, roughness: 0.32, sheen: 1, sheenColor: new THREE.Color(0xff8fa0),
    });
    for (const s of [-1, 1]) {
      g.add(mesh(new THREE.TorusGeometry(0.16, 0.05, 10, 24), ribbon,
        [s * 0.16, 0.2, -0.6], [0.5, 0, s * 0.5]));
    }
    return g;
  },

  g_donation() {
    const g = new THREE.Group();
    const heart = new THREE.MeshPhysicalMaterial({
      color: 0xc4324a, roughness: 0.25, clearcoat: 0.85, clearcoatRoughness: 0.1,
    });
    const s = new THREE.Shape();
    s.moveTo(0, -0.5);
    s.bezierCurveTo(-0.78, 0.12, -0.42, 0.74, 0, 0.42);
    s.bezierCurveTo(0.42, 0.74, 0.78, 0.12, 0, -0.5);
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: 0.3, bevelEnabled: true, bevelSize: 0.09, bevelThickness: 0.09, bevelSegments: 6, curveSegments: 24,
    });
    geo.center();
    const h = mesh(geo, heart, [0, 0.75, 0], [0, 0, 0]);
    g.add(h);
    // cupped hands beneath
    const skin = Surfaces.ceramic(1).clone();
    skin.color.setHex(0xd8bfa6);
    for (const x of [-0.34, 0.34]) {
      const palm = mesh(new THREE.SphereGeometry(0.38, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2), skin, [x, 0.16, 0]);
      palm.scale.set(1, 0.5, 0.78);
      palm.rotation.z = x < 0 ? 0.2 : -0.2;
      g.add(palm);
    }
    return g;
  },
};

// Headstone style previews reuse the marker builders.
const ALIASES = {
  hs_classic: 'it_headstone_classic',
  hs_heart: 'it_headstone_heart',
  hs_obelisk: 'it_obelisk',
  hs_slab: 'it_plaque_bronze',
  hs_statue: 'it_statue_dog',
};

// ---------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------

/** Frame the camera on a group's bounding box, three-quarter view. */
function frame(group, camera, pad = 1.22) {
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new V3());
  const center = box.getCenter(new V3());
  const radius = Math.max(size.x, size.y, size.z) * 0.5 * pad;
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const dist = radius / Math.sin(fov / 2);

  const dir = new V3(0.72, 0.46, 1).normalize();
  camera.position.copy(dir.multiplyScalar(dist)).add(center);
  camera.lookAt(center);
  camera.near = Math.max(0.05, dist - radius * 3);
  camera.far = dist + radius * 6;
  camera.updateProjectionMatrix();
  return { center, radius };
}

function disposeGroup(g) {
  g.traverse(o => {
    if (!o.isMesh) return;
    o.geometry?.dispose();
    // Materials come from the shared cache in materials.js — disposing
    // them here would break every other object that uses them.
  });
}

/**
 * Render one object to a PNG data URL.
 * @param {string} id  catalog id (or headstone style key)
 */
export function renderThumb(id) {
  const key = ALIASES[id] || id;
  if (mem.has(key)) return mem.get(key);
  if (store[key]) { mem.set(key, store[key]); return store[key]; }

  const build = BUILDERS[key];
  if (!build) return null;
  // Renderer not loaded yet — the caller gets a placeholder and the
  // image is patched in by warmThumbs() once the libraries arrive.
  if (!THREE) { loadLibs().then(() => warmThumbs()); return null; }

  const s = studio();
  if (!s) return null;
  const { renderer, scene, camera, floor } = s;
  const group = build();
  scene.add(group);

  const { center, radius } = frame(group, camera);
  floor.position.y = new THREE.Box3().setFromObject(group).min.y - 0.001;
  floor.visible = true;

  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');

  scene.remove(group);
  disposeGroup(group);

  mem.set(key, url);
  store[key] = url;
  return url;
}

/** Every id this module can draw. */
export const THUMB_IDS = [...Object.keys(BUILDERS), ...Object.keys(ALIASES)];
export const canRender = (id) => !!BUILDERS[ALIASES[id] || id];

/**
 * Render a batch without blocking the frame, then persist the cache.
 * Yields between objects so the interface stays responsive.
 */
export async function warmThumbs(ids = Object.keys(BUILDERS), onProgress) {
  await loadLibs();
  let done = 0;
  for (const id of ids) {
    if (!mem.has(id) && !store[id]) {
      try { renderThumb(id); } catch (e) { console.log('[thumbs]', id, e); }
      // Yield to main thread with idle callback / breather between 3D thumbnail renders
      await new Promise(r => {
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          window.requestIdleCallback(r, { timeout: 100 });
        } else {
          setTimeout(r, 40);
        }
      });
    }
    onProgress?.(++done / ids.length, id);
  }
  persist();
  patchPending();
}

/**
 * Fill in any placeholders that were written to the DOM before the
 * renderer was ready. Panels are built with innerHTML, so the markup
 * is already on screen by the time the first render finishes.
 */
export function patchPending(root = document) {
  for (const img of root.querySelectorAll?.('img[data-thumb]:not([src^="data:"])') || []) {
    const url = renderThumb(img.dataset.thumb);
    if (url) { img.src = url; img.removeAttribute('data-thumb-pending'); }
  }
}

export function persist() {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(store)); }
  catch { /* quota — the in-memory cache still stands for this session */ }
}

/**
 * An <img> for a catalog item, falling back to a neutral icon when
 * the id has no 3D build.
 */
export function thumbImg(id, { size = 56, alt = '', cls = '' } = {}) {
  // A photograph beats a render whenever we have one.
  const photo = photoFor(id);
  if (photo) {
    return `<img class="thumb thumb-photo ${cls}" src="${photo}" width="${size}" height="${size}" `
         + `alt="${alt}" loading="lazy" decoding="async">`;
  }
  if (!canRender(id)) return '';
  const url = renderThumb(id);
  const key = ALIASES[id] || id;
  // A 1×1 transparent GIF holds the layout until patchPending() swaps
  // the real render in — the alternative is markup that reflows, or a
  // broken-image icon, the moment a panel opens before the warm.
  const src = url || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  return `<img class="thumb ${cls}" src="${src}"${url ? '' : ` data-thumb="${key}" data-thumb-pending`} `
       + `width="${size}" height="${size}" alt="${alt}" loading="lazy">`;
}

export default { renderThumb, thumbImg, warmThumbs, canRender, THUMB_IDS, loadLibs, patchPending };
