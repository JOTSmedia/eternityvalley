const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log("=== Starting Eternity Valley High-Res Visual QA & Pitch Validation ===");

  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--use-angle=metal',
      '--window-size=1920,1080'
    ],
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 }
  });

  const page = await browser.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') {
      console.error(`[CHROME CONSOLE ERROR] ${text}`);
    } else if (text.includes('[startWorld]') || text.includes('[tour]') || text.includes('[render]')) {
      console.log(`[CHROME CONSOLE] ${text}`);
    }
  });

  page.on('pageerror', err => console.error(`[PAGE ERROR] ${err.toString()}`));

  console.log("Navigating to http://localhost:5173...");
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 45000 });

  console.log("Waiting 7s for full 3D engine, terrain, biomes, shaders & wildlife initialization...");
  await new Promise(r => setTimeout(r, 7000));

  // Ensure world is in 3D valley mode
  await page.evaluate(() => {
    if (window.UI && typeof window.UI.show3D === 'function') {
      window.UI.show3D('tour');
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  const outDirWorkspace = '/Users/bethrooney/Desktop/JOTS.MEDIA_AG/assets/qa/eternity_valley';
  const outDirParent = '/Users/bethrooney/.gemini/antigravity/brain/a2fa685a-9c8a-4f1b-859c-51ddb6dfc1c2';
  fs.mkdirSync(outDirWorkspace, { recursive: true });

  const stages = [
    { name: '01_grand_gate', t: 2 / 89, desc: 'Leg 1: Grand Triumphal Gate approach & open arch' },
    { name: '02_rainbow_bridge', t: 9 / 89, desc: 'Leg 2: Rainbow Bridge Crest & Grand Boulevard' },
    { name: '03_living_fountain', t: 18 / 89, desc: 'Leg 3: Central Plaza & Tiered Living Lion Fountain' },
    { name: '04_waterfall_climb', t: 29 / 89, desc: 'Leg 4: Cataract Waterfall vertical climb & mist cascade' },
    { name: '05_glacial_tarn_dive', t: 34 / 89, desc: 'Leg 5: Submerged Glacial Tarn Underwater Dive (Celestial Trout pods, pyrite boulders, crystal bubbles & caustics)' },
    { name: '06a_cathedral_aerial_orbit', t: 38 / 89, desc: 'Leg 6A: Universal Cathedral 140m gold spire & twin bell towers aerial orbit' },
    { name: '06b_cathedral_front_doors', t: 43 / 89, desc: 'Leg 6B: Universal Cathedral West Portal entrance doors' },
    { name: '06c_cathedral_nave_interior', t: 44.5 / 89, desc: 'Leg 6C: Inside Universal Cathedral Nave center aisle & High Celestial Altar' },
    { name: '06d_cathedral_north_transept', t: 47 / 89, desc: 'Leg 6D: Universal Cathedral North Transept archway exit into mountain peaks' },
    { name: '07_moorish_mosque', t: 54 / 89, desc: 'Leg 7: Moorish Mosque of Light terrace, minaret & Alhambra arcade' },
    { name: '08_mirror_lake_koi', t: 62.5 / 89, desc: 'Leg 8: Submerged Mirror Lake Underwater Realm (Golden Koi Pods, Emerald Trout, weeping willows & caustics)' },
    { name: '09_buddhist_pagoda', t: 68 / 89, desc: 'Leg 9: Buddhist Pagoda, Zen Garden & Shoji Porch' },
    { name: '10a_kaya_husky_front', t: 77 / 89, desc: 'Leg 10A: Kaya Island North approach directly facing Siberian Husky statue' },
    { name: '10b_kaya_coral_reef', t: 81 / 89, desc: 'Leg 10B: Submerged Kaya Coral Reef Dive (Sea Turtles, Manta Rays, Yellow Tangs, coral heads & turquoise caustics)' },
    { name: '11_celestial_ascent', t: 86 / 89, desc: 'Leg 11: Radiant Celestial Sunrise panoramic climb over full valley vista' },
  ];

  const results = [];

  for (const st of stages) {
    console.log(`\n[Stage QA] Setting tour position for ${st.name} (t=${st.t}) - ${st.desc}...`);
    
    const stageInfo = await page.evaluate((targetT) => {
      const w = window.world || window.UI?.world;
      if (!w) return { error: 'World instance not found' };

      w.tourMode = true;
      w.walkMode = false;
      w._tourPaused = true;
      w._entranceFlight = false;
      w._tourTime = targetT;

      if (!w._tourSpline) {
        if (typeof w._initTourSpline === 'function') {
          w._initTourSpline();
        }
      }

      if (w._tourSpline) {
        const pt = w._tourSpline.getPoint(targetT);
        const tan = w._tourSpline.getTangent(targetT);
        w.camera.position.copy(pt);
        w.camera.up.set(0, 1, 0);
        if (typeof w._calculateTourLookTarget === 'function') {
          w._calculateTourLookTarget(targetT, pt, tan, w._v3TourLook);
          w.camera.lookAt(w._v3TourLook);
        } else {
          const look = pt.clone().addScaledVector(tan, 30);
          w.camera.lookAt(look);
        }

        // Animate underwater wildlife and caustics for realistic snapshot
        const now = performance.now() * 0.001;
        if (typeof w._animateFauna === 'function') {
          w._animateFauna(0.016, now);
        }
        if (typeof w._updateUnderwaterFX === 'function') {
          w._updateUnderwaterFX(pt.y, 0.016);
        }

        w.renderer.render(w.scene, w.camera);

        return {
          cameraPos: { x: pt.x.toFixed(2), y: pt.y.toFixed(2), z: pt.z.toFixed(2) },
          lookTarget: { x: w._v3TourLook.x.toFixed(2), y: w._v3TourLook.y.toFixed(2), z: w._v3TourLook.z.toFixed(2) },
          underwater: pt.y < 185.0 && (pt.y < 0 || (pt.z < -600 && pt.y < 182) || (pt.z > -350 && pt.z < -200 && pt.y < 18)),
          fps: w._fps || 60
        };
      }
      return { warning: 'Tour spline not available' };
    }, st.t);

    console.log(`Stage ${st.name} state:`, JSON.stringify(stageInfo));

    // Wait for frame to settle
    await new Promise(r => setTimeout(r, 600));

    const shotName = `live_tour_${st.name}.png`;
    const shotPathWorkspace = path.join(outDirWorkspace, shotName);
    const shotPathParent = path.join(outDirParent, shotName);

    await page.screenshot({ path: shotPathWorkspace });
    try {
      fs.copyFileSync(shotPathWorkspace, shotPathParent);
    } catch (e) {
      console.warn(`Could not copy to parent dir: ${e.message}`);
    }

    console.log(`Saved screenshot to:\n  - ${shotPathWorkspace}\n  - ${shotPathParent}`);

    results.push({
      stage: st.name,
      t: st.t,
      description: st.desc,
      screenshot: shotPathWorkspace,
      info: stageInfo
    });
  }

  // Also capture interactive inspection metrics
  const inspectionMetrics = await page.evaluate(() => {
    const w = window.world || window.UI?.world;
    if (!w) return null;
    return {
      drawCalls: w.renderer?.info?.render?.calls || 0,
      triangles: w.renderer?.info?.render?.triangles || 0,
      geometries: w.renderer?.info?.memory?.geometries || 0,
      textures: w.renderer?.info?.memory?.textures || 0,
      activeMeshes: w.scene?.children?.length || 0,
      troutMeshCount: w._troutMesh ? w._troutMesh.count : 0,
      koiMeshCount: w._koiMesh ? w._koiMesh.count : 0,
      turtleMeshCount: w._seaTurtleMesh ? w._seaTurtleMesh.count : 0,
      mantaMeshCount: w._mantaRayMesh ? w._mantaRayMesh.count : 0,
      reefMeshCount: w._reefFishMesh ? w._reefFishMesh.count : 0
    };
  });

  console.log("\n=== 3D Engine Inspection Metrics ===");
  console.log(JSON.stringify(inspectionMetrics, null, 2));

  await browser.close();
  console.log("\n=== High-Res Visual QA & Pitch Validation Completed Successfully! ===");

  const reportPath = path.join(outDirWorkspace, 'qa_inspection_report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), results, inspectionMetrics }, null, 2));
  console.log(`QA Inspection Report saved to: ${reportPath}`);
}

main().catch(err => {
  console.error("FATAL ERROR in Visual QA:", err);
  process.exit(1);
});
