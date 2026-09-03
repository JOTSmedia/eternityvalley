// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — Grand Ceremonial Boulevard & Roads
//
// Magnificent Honed Roman Travertine & Carrara Marble Ceremonial Boulevard
// with dark Italian porphyry mosaic runner borders, 24K gold bronze studs,
// weathered ashlar joints, raised marble curb stones, and seamless connections
// between Grand Gate, Rainbow Bridge, and Central Plaza.
// ============================================================
import * as THREE from 'three';
import { WORLD, ROADS, terrainHeight } from './terrain.js?v=6';
import { Surfaces } from './materials.js?v=6';

const V3 = THREE.Vector3;

/**
 * Creates the Grand Ceremonial Boulevard connecting Grand Gate (z = 940..880),
 * Rainbow Bridge (z = 500..380), and Central Plaza (z = 82..20).
 */
export function buildGrandBoulevard() {
  const group = new THREE.Group();
  group.name = 'GrandCeremonialBoulevard';

  const pts = [
    new V3(0, terrainHeight(0, 820), 820),
    new V3(0, terrainHeight(0, 720), 720),
    new V3(0, terrainHeight(0, 560), 560),
    new V3(0, terrainHeight(0, 440), 440),
    new V3(0, terrainHeight(0, 320), 320),
    new V3(0, terrainHeight(0, 180), 180),
    new V3(0, terrainHeight(0, 82), 82),
  ];

  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.25);
  const divisions = 260;
  const crossDivs = 10;
  const roadWidth = 26.0;
  const halfW = roadWidth * 0.5;

  const positions = [];
  const uvs = [];
  const normals = [];
  const indices = [];

  const up = new V3(0, 1, 0);

  // Approximate total length along spline
  const totalLength = curve.getLength();
  const vScale = totalLength / 14.0; // Repeat travertine pattern every 14 meters

  for (let i = 0; i <= divisions; i++) {
    const t = i / divisions;
    const centerPt = curve.getPoint(t);
    const tan = curve.getTangent(t).normalize();
    const side = new V3().crossVectors(tan, up).normalize();

    // Longitudinal position along boulevard (world Z)
    const zPos = centerPt.z;

    for (let j = 0; j <= crossDivs; j++) {
      const u = j / crossDivs; // 0.0 (left) to 1.0 (right)
      const latOffset = (u - 0.5) * roadWidth;
      const xPos = centerPt.x + side.x * latOffset;
      const zCur = zPos + side.z * latOffset;

      // Base terrain elevation
      let groundY = terrainHeight(xPos, zCur);

      // Camber arch (water drainage profile across boulevard crown)
      const crown = (1.0 - Math.pow((u - 0.5) * 2.0, 2.0)) * 0.08;

      const yPos = groundY + 0.25 + crown;

      positions.push(xPos, yPos, zCur);
      uvs.push(u, t * vScale);
      normals.push(0, 1, 0);
    }

    if (i > 0) {
      const prevZ = curve.getPoint((i - 1) / divisions).z;
      const currZ = zPos;
      const isBridgeSpan = (Math.min(prevZ, currZ) >= 378 && Math.max(prevZ, currZ) <= 502);
      if (!isBridgeSpan) {
        for (let j = 0; j < crossDivs; j++) {
          const rowPrev = (i - 1) * (crossDivs + 1);
          const rowCurr = i * (crossDivs + 1);
          const a = rowPrev + j;
          const b = rowCurr + j;
          const c = rowPrev + (j + 1);
          const d = rowCurr + (j + 1);

          indices.push(a, b, c);
          indices.push(c, b, d);
        }
      }
    }
  }

  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  roadGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  roadGeo.setIndex(indices);
  roadGeo.computeVertexNormals();
  roadGeo.computeBoundingSphere();
  roadGeo.computeBoundingBox();

  const roadMat = Surfaces.ceremonialBoulevard(1);
  roadMat.polygonOffset = true;
  roadMat.polygonOffsetFactor = -1.0;
  roadMat.polygonOffsetUnits = -1.0;
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  roadMesh.castShadow = false;
  group.add(roadMesh);

  // -------------------------------------------------------------
  // Raised Carrara Marble Beveled Curb Stones (Left & Right Flanks)
  // -------------------------------------------------------------
  const marbleCurbMat = Surfaces.honedCarraraMarble(1.5);
  const curbWidth = 0.85;
  const curbHeight = 0.38;

  for (const sideSign of [-1, 1]) {
    const curbPositions = [];
    const curbUvs = [];
    const curbIndices = [];

    for (let i = 0; i <= divisions; i++) {
      const t = i / divisions;
      const centerPt = curve.getPoint(t);
      const tan = curve.getTangent(t).normalize();
      const side = new V3().crossVectors(tan, up).normalize();

      const curbCenterOffset = sideSign * (halfW - curbWidth * 0.5);
      const cx = centerPt.x + side.x * curbCenterOffset;
      const cz = centerPt.z + side.z * curbCenterOffset;
      const localWater = (cz > 915) ? (WORLD.oceanLevel || 0.35) : WORLD.waterLevel;
      const groundY = Math.max(terrainHeight(cx, cz), localWater + 0.3);

      const innerX = cx - side.x * (curbWidth * 0.5 * sideSign);
      const innerZ = cz - side.z * (curbWidth * 0.5 * sideSign);
      const outerX = cx + side.x * (curbWidth * 0.5 * sideSign);
      const outerZ = cz + side.z * (curbWidth * 0.5 * sideSign);

      const topY = groundY + 0.48;
      const bottomY = groundY - 0.65; // Embedded into sub-base

      // 4 profile vertices per slice: [outerBottom, outerTop, innerTop, innerBottom]
      curbPositions.push(outerX, bottomY, outerZ);
      curbPositions.push(outerX, topY, outerZ);
      curbPositions.push(innerX, topY, innerZ);
      curbPositions.push(innerX, bottomY, innerZ);

      curbUvs.push(0, t * vScale * 2);
      curbUvs.push(0.33, t * vScale * 2);
      curbUvs.push(0.66, t * vScale * 2);
      curbUvs.push(1.0, t * vScale * 2);

      if (i > 0) {
        const prevZ = curve.getPoint((i - 1) / divisions).z;
        const currZ = centerPt.z;
        const isBridgeSpan = (Math.min(prevZ, currZ) >= 378 && Math.max(prevZ, currZ) <= 502);
        if (!isBridgeSpan) {
          const pSlice = (i - 1) * 4;
          const cSlice = i * 4;
          for (let k = 0; k < 3; k++) {
            const a = pSlice + k, b = cSlice + k;
            const c = pSlice + (k + 1), d = cSlice + (k + 1);
            curbIndices.push(a, b, c);
            curbIndices.push(c, b, d);
          }
        }
      }
    }

    const curbGeo = new THREE.BufferGeometry();
    curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(curbPositions, 3));
    curbGeo.setAttribute('uv', new THREE.Float32BufferAttribute(curbUvs, 2));
    curbGeo.setIndex(curbIndices);
    curbGeo.computeVertexNormals();
    curbGeo.computeBoundingSphere();
    curbGeo.computeBoundingBox();

    const curbMesh = new THREE.Mesh(curbGeo, marbleCurbMat);
    curbMesh.castShadow = true;
    curbMesh.receiveShadow = true;
    group.add(curbMesh);
  }

  // -------------------------------------------------------------
  // Solid Sub-Base Stone Foundation Bed (prevents terrain seams)
  // -------------------------------------------------------------
  const subBasePositions = [];
  const subBaseIndices = [];
  const subBaseMat = Surfaces.agedCaenLimestone(4);

  for (let i = 0; i <= divisions; i += 2) {
    const t = i / divisions;
    const centerPt = curve.getPoint(t);
    const tan = curve.getTangent(t).normalize();
    const side = new V3().crossVectors(tan, up).normalize();
    const baseW = roadWidth + 3.0;

    const leftX = centerPt.x - side.x * (baseW * 0.5);
    const leftZ = centerPt.z - side.z * (baseW * 0.5);
    const rightX = centerPt.x + side.x * (baseW * 0.5);
    const rightZ = centerPt.z + side.z * (baseW * 0.5);

    const localWaterL = (leftZ > 915) ? (WORLD.oceanLevel || 0.35) : WORLD.waterLevel;
    const localWaterR = (rightZ > 915) ? (WORLD.oceanLevel || 0.35) : WORLD.waterLevel;
    const leftY = Math.max(terrainHeight(leftX, leftZ), localWaterL + 0.2) - 0.18;
    const rightY = Math.max(terrainHeight(rightX, rightZ), localWaterR + 0.2) - 0.18;

    subBasePositions.push(leftX, leftY, leftZ, rightX, rightY, rightZ);
    if (i > 0) {
      const k = (i / 2) * 2;
      subBaseIndices.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }

  const subBaseGeo = new THREE.BufferGeometry();
  subBaseGeo.setAttribute('position', new THREE.Float32BufferAttribute(subBasePositions, 3));
  subBaseGeo.setIndex(subBaseIndices);
  subBaseGeo.computeVertexNormals();
  const subBaseMesh = new THREE.Mesh(subBaseGeo, subBaseMat);
  subBaseMesh.receiveShadow = true;
  group.add(subBaseMesh);

  return group;
}

/**
 * Creates secondary paved/gravel ribbons with proper UV coordinates,
 * multi-segment cross-section, and clean terrain clamping.
 */
export function buildSecondaryRoad(roadDef) {
  const { pts, ring, cx, cz, r, w } = roadDef;
  const crossDivs = 4;
  const positions = [], uvs = [], indices = [], normals = [];
  const up = new V3(0, 1, 0);

  if (ring) {
    const ringDivs = 72;
    const halfWidth = w * 0.5;
    for (let a = 0; a <= ringDivs; a++) {
      const angle = (a / ringDivs) * Math.PI * 2;
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      const centerRad = r;

      for (let j = 0; j <= crossDivs; j++) {
        const u = j / crossDivs;
        const rad = centerRad - halfWidth + u * w;
        const x = cx + cosA * rad;
        const z = cz + sinA * rad;
        const localWater = (z > 915) ? (WORLD.oceanLevel || 0.35) : WORLD.waterLevel;
        const groundY = Math.max(terrainHeight(x, z), localWater + 0.3);
        const camber = (1.0 - Math.pow((u - 0.5) * 2.0, 2.0)) * 0.05;
        const y = groundY + 0.12 + camber;

        positions.push(x, y, z);
        uvs.push(u, (a / ringDivs) * 12.0);
        normals.push(0, 1, 0);
      }

      if (a > 0) {
        for (let j = 0; j < crossDivs; j++) {
          const rowPrev = (a - 1) * (crossDivs + 1);
          const rowCurr = a * (crossDivs + 1);
          const idxA = rowPrev + j;
          const idxB = rowCurr + j;
          const idxC = rowPrev + (j + 1);
          const idxD = rowCurr + (j + 1);

          indices.push(idxA, idxB, idxC);
          indices.push(idxC, idxB, idxD);
        }
      }
    }
  } else {
    const shapePts = [];
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      shapePts.push(new V3(x, terrainHeight(x, z), z));
    }
    const curve = new THREE.CatmullRomCurve3(shapePts, false, 'centripetal', 0.25);
    const divisions = pts.length * 18;
    const totalLength = curve.getLength();
    const vScale = totalLength / 8.0;

    for (let i = 0; i <= divisions; i++) {
      const t = i / divisions;
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t).normalize();
      const side = new V3().crossVectors(tan, up).normalize();

      for (let j = 0; j <= crossDivs; j++) {
        const u = j / crossDivs;
        const latOffset = (u - 0.5) * w;
        const x = p.x + side.x * latOffset;
        const z = p.z + side.z * latOffset;
        const localWater = (z > 915) ? (WORLD.oceanLevel || 0.35) : WORLD.waterLevel;
        const groundY = Math.max(terrainHeight(x, z), localWater + 0.3);
        const camber = (1.0 - Math.pow((u - 0.5) * 2.0, 2.0)) * 0.05;
        const y = groundY + 0.12 + camber;

        positions.push(x, y, z);
        uvs.push(u, t * vScale);
        normals.push(0, 1, 0);
      }

      if (i > 0) {
        for (let j = 0; j < crossDivs; j++) {
          const rowPrev = (i - 1) * (crossDivs + 1);
          const rowCurr = i * (crossDivs + 1);
          const idxA = rowPrev + j;
          const idxB = rowCurr + j;
          const idxC = rowPrev + (j + 1);
          const idxD = rowCurr + (j + 1);

          indices.push(idxA, idxB, idxC);
          indices.push(idxC, idxB, idxD);
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  geo.computeBoundingBox();

  const mat = Surfaces.pavedRoad(2);
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1.0;
  mat.polygonOffsetUnits = -1.0;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;
  return mesh;
}
