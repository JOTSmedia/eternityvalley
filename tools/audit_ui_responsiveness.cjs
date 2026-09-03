const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = '/Users/bethrooney/Desktop/JOTS.MEDIA_AG/assets/qa/eternity_valley/responsiveness_audit';

const VIEWPORTS = [
  { name: 'desktop', width: 1920, height: 1080, label: 'Desktop (1920x1080)' },
  { name: 'tablet', width: 768, height: 1024, label: 'Tablet (768x1024)' },
  { name: 'mobile', width: 375, height: 812, label: 'Mobile (375x812)' }
];

async function runAudit() {
  console.log('===============================================================');
  console.log('  ETERNITY VALLEY UI/UX & RESPONSIVENESS TRIPLE-CHECK AUDIT    ');
  console.log('===============================================================');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--use-angle=metal'
    ]
  });

  const auditReport = {
    timestamp: new Date().toISOString(),
    url: 'http://localhost:5174',
    viewportsAudited: VIEWPORTS.map(v => v.label),
    results: {},
    summary: {
      totalChecks: 0,
      passedChecks: 0,
      failedChecks: 0,
      warnings: 0
    },
    screenshots: []
  };

  const consoleLogs = [];
  const pageErrors = [];

  for (const vp of VIEWPORTS) {
    console.log(`\n>>> [AUDIT] Starting test suite for Viewport: ${vp.label} <<<`);
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });

    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      consoleLogs.push({ viewport: vp.name, type, text });
      if (type === 'error' && !text.includes('favicon') && !text.includes('404')) {
        console.error(`[${vp.name.toUpperCase()} CONSOLE ERROR]`, text);
      }
    });

    page.on('pageerror', err => {
      console.error(`[${vp.name.toUpperCase()} PAGE EXCEPTION]`, err.message);
      pageErrors.push({ viewport: vp.name, error: err.message });
    });

    const vpResults = {
      viewTransitions: {},
      uiOverlays: {},
      responsiveness: {},
      domCollisions: [],
      overallStatus: 'PASS'
    };

    try {
      // 1. Navigation & Boot
      console.log(`[${vp.name}] Navigating to http://localhost:5174 ...`);
      await page.goto('http://localhost:5174', { waitUntil: 'domcontentloaded', timeout: 35000 });

      // Dismiss preloader quickly & ensure enter
      await new Promise(r => setTimeout(r, 2000));
      await page.evaluate(() => {
        if (typeof window.__finishPreloader === 'function') window.__finishPreloader();
        const p = document.getElementById('preloader');
        if (p) {
          p.click();
          p.classList.add('is-done');
          p.style.display = 'none';
        }
        if (typeof window.enter === 'function') window.enter('tour');
      });
      await new Promise(r => setTimeout(r, 2500));

      // Check topbar visibility
      const topbarStatus = await page.evaluate(() => {
        const tb = document.getElementById('topbar');
        const stage = document.getElementById('stage');
        return {
          topbarExists: !!tb,
          topbarVisible: tb ? !tb.classList.contains('hidden') && tb.offsetHeight > 0 : false,
          topbarHeight: tb ? tb.offsetHeight : 0,
          topbarWidth: tb ? tb.offsetWidth : 0,
          stageExists: !!stage,
          stageVisible: stage ? !stage.classList.contains('hidden') : false
        };
      });

      // -------------------------------------------------------------
      // TEST 1: VIEW TRANSITIONS
      // -------------------------------------------------------------
      console.log(`[${vp.name}] 1. Testing View Transitions...`);

      // A: 3D Sanctuary ('orbit')
      console.log(`[${vp.name}]  - Switching to 3D Sanctuary Orbit...`);
      await page.evaluate(async () => {
        if (window.UI) await window.UI.show3D('orbit');
      });
      await new Promise(r => setTimeout(r, 1500));
      const s3dState = await page.evaluate(() => {
        const v3d = document.getElementById('view3d');
        const c3d = document.getElementById('canvas3d');
        const pill = document.getElementById('sanctuaryAmbiencePill');
        return {
          view3dVisible: v3d && !v3d.classList.contains('hidden') && v3d.style.display !== 'none',
          canvas3dRendered: c3d && c3d.offsetWidth > 0 && c3d.offsetHeight > 0,
          ambiencePillVisible: pill && pill.offsetHeight > 0,
          tourMode: window.world ? !!window.world.tourMode : false
        };
      });
      const s3dPass = s3dState.view3dVisible && s3dState.canvas3dRendered;
      vpResults.viewTransitions.sanctuary3D = { status: s3dPass ? 'PASS' : 'FAIL', details: s3dState };
      const pic3d = `${vp.name}_01_sanctuary_3d.png`;
      await page.screenshot({ path: path.join(OUTPUT_DIR, pic3d) });
      auditReport.screenshots.push({ name: pic3d, desc: `${vp.label} - 3D Sanctuary Orbit View` });

      // B: Drone Tour ('tour')
      console.log(`[${vp.name}]  - Switching to Drone Tour...`);
      await page.evaluate(async () => {
        if (window.UI) await window.UI.show3D('tour');
      });
      await new Promise(r => setTimeout(r, 1500));
      const tourState = await page.evaluate(() => {
        const w = window.world || window.UI?.world;
        return {
          tourActive: w ? !!w.tourMode : false,
          activeStage: w ? w._activeStageIndex : null,
          hasSpline: w ? !!w._tourSpline : false
        };
      });
      const tourPass = tourState.tourActive;
      vpResults.viewTransitions.droneTour = { status: tourPass ? 'PASS' : 'FAIL', details: tourState };
      const picTour = `${vp.name}_02_drone_tour.png`;
      await page.screenshot({ path: path.join(OUTPUT_DIR, picTour) });
      auditReport.screenshots.push({ name: picTour, desc: `${vp.label} - Cinematic Drone Tour Flight` });

      // C: 2D Layout
      console.log(`[${vp.name}]  - Switching to 2D Layout Map...`);
      await page.evaluate(async () => {
        if (window.UI) await window.UI.show2D();
      });
      await new Promise(r => setTimeout(r, 1200));
      const s2dState = await page.evaluate(() => {
        const v2d = document.getElementById('view2d');
        const c2d = document.getElementById('canvas2d');
        return {
          view2dVisible: v2d && !v2d.classList.contains('hidden'),
          canvas2dRendered: c2d && c2d.offsetWidth > 0 && c2d.offsetHeight > 0
        };
      });
      const s2dPass = s2dState.view2dVisible && s2dState.canvas2dRendered;
      vpResults.viewTransitions.layout2D = { status: s2dPass ? 'PASS' : 'FAIL', details: s2dState };
      const pic2d = `${vp.name}_03_2d_layout.png`;
      await page.screenshot({ path: path.join(OUTPUT_DIR, pic2d) });
      auditReport.screenshots.push({ name: pic2d, desc: `${vp.label} - 2D Sanctuary Map Layout` });

      // D: Earth Globe
      console.log(`[${vp.name}]  - Switching to Earth Globe...`);
      await page.evaluate(async () => {
        if (window.UI) await window.UI.showGlobe();
      });
      await new Promise(r => setTimeout(r, 1500));
      const globeState = await page.evaluate(() => {
        const vg = document.getElementById('viewGlobe');
        const cg = document.getElementById('canvasGlobe');
        const cta = document.getElementById('globeCta');
        return {
          viewGlobeVisible: vg && !vg.classList.contains('hidden'),
          canvasGlobeRendered: cg && cg.offsetWidth > 0 && cg.offsetHeight > 0,
          globeCtaVisible: cta && cta.offsetHeight > 0
        };
      });
      const globePass = globeState.viewGlobeVisible && globeState.canvasGlobeRendered;
      vpResults.viewTransitions.earthGlobe = { status: globePass ? 'PASS' : 'FAIL', details: globeState };
      const picGlobe = `${vp.name}_04_earth_globe.png`;
      await page.screenshot({ path: path.join(OUTPUT_DIR, picGlobe) });
      auditReport.screenshots.push({ name: picGlobe, desc: `${vp.label} - Earth Globe Satellite View` });

      // Return to 3D Sanctuary for overlay & lighting tests
      await page.evaluate(async () => {
        if (window.UI) await window.UI.show3D('orbit');
      });
      await new Promise(r => setTimeout(r, 1200));

      // -------------------------------------------------------------
      // TEST 2: UI OVERLAYS & CONTROLS
      // -------------------------------------------------------------
      console.log(`[${vp.name}] 2. Testing UI Overlays & Controls...`);

      // A: Top Navigation Bar & Dropdown
      console.log(`[${vp.name}]  - Testing Top Navigation Bar & Dropdown...`);
      const navDropdownTest = await page.evaluate(async () => {
        const toggle = document.getElementById('navDropdownToggle');
        const menu = document.getElementById('navDropdownMenu');
        if (!toggle || !menu) return { dropdownSupported: false, error: 'Dropdown elements missing' };

        toggle.click();
        const isOpenAfterClick = !menu.classList.contains('hidden');
        const items = Array.from(menu.querySelectorAll('.dropdown-item')).map(el => el.innerText.trim());

        // close dropdown
        toggle.click();
        const isClosedAfterClick = menu.classList.contains('hidden');

        return {
          dropdownSupported: true,
          isOpenAfterClick,
          isClosedAfterClick,
          itemCount: items.length,
          items
        };
      });

      // Capture screenshot of open dropdown
      await page.evaluate(() => {
        const toggle = document.getElementById('navDropdownToggle');
        if (toggle) toggle.click();
      });
      await new Promise(r => setTimeout(r, 400));
      const picNav = `${vp.name}_05_nav_dropdown.png`;
      await page.screenshot({ path: path.join(OUTPUT_DIR, picNav) });
      auditReport.screenshots.push({ name: picNav, desc: `${vp.label} - Topbar Navigation Dropdown Menu` });

      await page.evaluate(() => {
        const toggle = document.getElementById('navDropdownToggle');
        const menu = document.getElementById('navDropdownMenu');
        if (menu && !menu.classList.contains('hidden') && toggle) toggle.click();
      });

      vpResults.uiOverlays.topNav = {
        status: topbarStatus.topbarVisible && navDropdownTest.dropdownSupported ? 'PASS' : 'FAIL',
        topbar: topbarStatus,
        dropdown: navDropdownTest
      };

      // B: Lighting Preset Buttons (Dawn, Sunlit, Dusk, Night, Blessing)
      console.log(`[${vp.name}]  - Testing Lighting Preset Buttons...`);
      const lightingTest = await page.evaluate(async () => {
        const pill = document.getElementById('sanctuaryAmbiencePill');
        if (!pill) return { supported: false, error: 'sanctuaryAmbiencePill element not found' };

        const buttons = Array.from(pill.querySelectorAll('.sap-btn'));
        const results = [];

        for (const btn of buttons) {
          const phase = btn.dataset.phase || btn.dataset.mood;
          btn.click();
          results.push({
            label: btn.innerText.trim(),
            phaseOrMood: phase,
            isActive: btn.classList.contains('is-active'),
            rbvPhase: window.RBV ? window.RBV.phase : null,
            rbvMood: window.RBV ? window.RBV.mood : null
          });
        }

        // Return to Sunlit/Day
        const dayBtn = pill.querySelector('[data-phase="day"]');
        if (dayBtn) dayBtn.click();

        return {
          supported: true,
          buttonCount: buttons.length,
          results
        };
      });

      const picLight = `${vp.name}_06_lighting_presets.png`;
      await page.screenshot({ path: path.join(OUTPUT_DIR, picLight) });
      auditReport.screenshots.push({ name: picLight, desc: `${vp.label} - Sanctuary Ambience Lighting Control Pill` });

      vpResults.uiOverlays.lightingPresets = {
        status: lightingTest.supported && lightingTest.buttonCount >= 5 ? 'PASS' : 'FAIL',
        details: lightingTest
      };

      // C: Audio Soundscape Toggle & Modal
      console.log(`[${vp.name}]  - Testing Audio Soundscape Toggle & Modal...`);
      const soundModalTest = await page.evaluate(async () => {
        const soundBtn = document.getElementById('soundBtn');
        if (!soundBtn) return { supported: false, error: 'soundBtn not found' };

        soundBtn.click();
        const modalRoot = document.getElementById('modalRoot');
        const modalBox = document.getElementById('modalBox');

        const isOpen = modalRoot && !modalRoot.classList.contains('hidden');
        const modalTitle = modalBox?.querySelector('h2, h3, .modal-title')?.innerText || '';
        const soundPresets = Array.from(modalBox?.querySelectorAll('.sound-chip, button') || []).map(b => b.innerText.trim());

        return {
          supported: true,
          isOpen,
          modalTitle,
          interactiveElementsCount: soundPresets.length
        };
      });

      await new Promise(r => setTimeout(r, 500));
      const picSound = `${vp.name}_07_soundscape_modal.png`;
      await page.screenshot({ path: path.join(OUTPUT_DIR, picSound) });
      auditReport.screenshots.push({ name: picSound, desc: `${vp.label} - Soundscape & Audio Atmosphere Modal` });

      // Close modal
      await page.evaluate(() => {
        if (window.UI && typeof window.UI.closeModal === 'function') {
          window.UI.closeModal();
        } else {
          const root = document.getElementById('modalRoot');
          if (root) root.classList.add('hidden');
        }
      });
      await new Promise(r => setTimeout(r, 400));

      vpResults.uiOverlays.soundscape = {
        status: soundModalTest.supported && soundModalTest.isOpen ? 'PASS' : 'FAIL',
        details: soundModalTest
      };

      // D: Consecrate Memorial Modal (Grief Wizard)
      console.log(`[${vp.name}]  - Testing Consecrate Memorial Modal...`);
      const consecrateModalTest = await page.evaluate(async () => {
        const consecrateBtn = document.getElementById('createMemorialBtn');
        if (consecrateBtn) {
          consecrateBtn.click();
        } else if (window.UI) {
          window.UI.griefWizardModal();
        }

        const modalRoot = document.getElementById('modalRoot');
        const modalBox = document.getElementById('modalBox');

        const isOpen = modalRoot && !modalRoot.classList.contains('hidden');
        const formFields = Array.from(modalBox?.querySelectorAll('input, select, textarea, button') || []).length;
        const modalRect = modalBox ? {
          width: modalBox.offsetWidth,
          height: modalBox.offsetHeight,
          top: modalBox.offsetTop,
          left: modalBox.offsetLeft
        } : null;

        return {
          supported: true,
          isOpen,
          modalRect,
          formFieldsCount: formFields,
          title: modalBox?.querySelector('h2, h3, .modal-title, .gw-title')?.innerText || 'Consecrate Memorial'
        };
      });

      await new Promise(r => setTimeout(r, 500));
      const picConsecrate = `${vp.name}_08_consecrate_modal.png`;
      await page.screenshot({ path: path.join(OUTPUT_DIR, picConsecrate) });
      auditReport.screenshots.push({ name: picConsecrate, desc: `${vp.label} - Consecrate Memorial Guided Wizard Modal` });

      // Close modal
      await page.evaluate(() => {
        if (window.UI && typeof window.UI.closeModal === 'function') {
          window.UI.closeModal();
        } else {
          const root = document.getElementById('modalRoot');
          if (root) root.classList.add('hidden');
        }
      });
      await new Promise(r => setTimeout(r, 400));

      vpResults.uiOverlays.consecrateModal = {
        status: consecrateModalTest.supported && consecrateModalTest.isOpen ? 'PASS' : 'FAIL',
        details: consecrateModalTest
      };

      // -------------------------------------------------------------
      // TEST 3: RESPONSIVENESS & DOM COLLISION AUDIT
      // -------------------------------------------------------------
      console.log(`[${vp.name}] 3. Performing DOM Layout & Collision Audit...`);

      const domAudit = await page.evaluate(() => {
        const collisions = [];
        const overflowElements = [];

        // Check body / HTML horizontal overflow
        const docWidth = document.documentElement.scrollWidth;
        const windowWidth = window.innerWidth;
        const hasHorizontalOverflow = docWidth > windowWidth + 1;

        // Key UI element rects
        const elementsToCheck = [
          { id: 'topbar', el: document.getElementById('topbar') },
          { id: 'sanctuaryAmbiencePill', el: document.getElementById('sanctuaryAmbiencePill') },
          { id: 'districtNav', el: document.getElementById('districtNav') },
          { id: 'earthToolbar', el: document.getElementById('earthToolbar') },
          { id: 'legend', el: document.querySelector('.legend') }
        ];

        const visibleRects = [];
        for (const item of elementsToCheck) {
          if (!item.el) continue;
          const rect = item.el.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(item.el).display !== 'none' && !item.el.classList.contains('hidden');
          if (isVisible) {
            visibleRects.push({ id: item.id, rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height } });
          }
        }

        // Bounding box collision checker between visible fixed overlays
        for (let i = 0; i < visibleRects.length; i++) {
          for (let j = i + 1; j < visibleRects.length; j++) {
            const r1 = visibleRects[i].rect;
            const r2 = visibleRects[j].rect;

            // Check overlap
            const overlapX = Math.max(0, Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left));
            const overlapY = Math.max(0, Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top));

            if (overlapX > 5 && overlapY > 5) {
              collisions.push({
                elem1: visibleRects[i].id,
                elem2: visibleRects[j].id,
                overlapWidth: Math.round(overlapX),
                overlapHeight: Math.round(overlapY)
              });
            }
          }
        }

        // Check interactive button touch target sizes
        const buttons = Array.from(document.querySelectorAll('button:not(.hidden)'));
        const smallTouchTargets = [];
        buttons.forEach(btn => {
          const rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && (rect.width < 28 || rect.height < 28)) {
            smallTouchTargets.push({
              text: btn.innerText.slice(0, 20),
              id: btn.id || btn.className,
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            });
          }
        });

        return {
          windowWidth,
          windowHeight: window.innerHeight,
          docWidth,
          hasHorizontalOverflow,
          visibleRects,
          collisions,
          smallTouchTargetsCount: smallTouchTargets.length,
          smallTouchTargets: smallTouchTargets.slice(0, 5)
        };
      });

      vpResults.responsiveness = domAudit;
      vpResults.domCollisions = domAudit.collisions;

      const vpPass =
        vpResults.viewTransitions.sanctuary3D.status === 'PASS' &&
        vpResults.viewTransitions.droneTour.status === 'PASS' &&
        vpResults.viewTransitions.layout2D.status === 'PASS' &&
        vpResults.viewTransitions.earthGlobe.status === 'PASS' &&
        vpResults.uiOverlays.topNav.status === 'PASS' &&
        vpResults.uiOverlays.lightingPresets.status === 'PASS' &&
        vpResults.uiOverlays.soundscape.status === 'PASS' &&
        vpResults.uiOverlays.consecrateModal.status === 'PASS' &&
        !domAudit.hasHorizontalOverflow &&
        domAudit.collisions.length === 0;

      vpResults.overallStatus = vpPass ? 'PASS' : 'FAIL';

      auditReport.results[vp.name] = vpResults;
      auditReport.summary.totalChecks += 8;
      if (vpPass) auditReport.summary.passedChecks += 8;
      else {
        auditReport.summary.failedChecks += 1;
        auditReport.summary.passedChecks += 7;
      }

      console.log(`[${vp.name}] Overall Viewport Result: ${vpResults.overallStatus}`);
    } catch (err) {
      console.error(`[${vp.name}] Audit failure:`, err);
      vpResults.overallStatus = 'FAIL';
      vpResults.error = err.message;
      auditReport.results[vp.name] = vpResults;
      auditReport.summary.failedChecks += 1;
    } finally {
      await page.close();
    }
  }

  await browser.close();

  // Save audit report JSON
  const reportPath = path.join(OUTPUT_DIR, 'ui_responsiveness_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(auditReport, null, 2));
  console.log(`\n Audit report saved to: ${reportPath}`);

  return auditReport;
}

runAudit().then(report => {
  console.log('\n===============================================================');
  console.log('                 AUDIT EXECUTION COMPLETED                     ');
  console.log('===============================================================');
  console.log(`Total Checks: ${report.summary.totalChecks}`);
  console.log(`Passed: ${report.summary.passedChecks}`);
  console.log(`Failed: ${report.summary.failedChecks}`);
  console.log(`Screenshots Captured: ${report.screenshots.length}`);
}).catch(e => {
  console.error('Fatal audit failure:', e);
  process.exit(1);
});
