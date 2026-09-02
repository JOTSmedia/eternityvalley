import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9222;
const USER_DATA_DIR = '/tmp/chrome-qa-profile-' + Date.now();

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
    this.events = [];
    this.consoleLogs = [];
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.method === 'Runtime.consoleAPICalled') {
          this.consoleLogs.push({
            type: msg.params.type,
            args: msg.params.args?.map(a => a.value || a.description),
            timestamp: msg.params.timestamp
          });
        }
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  }
}

async function main() {
  console.log('Launching headless Chrome with WebGL / Metal acceleration...');
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--use-gl=angle',
    '--use-angle=metal',
    '--enable-webgl',
    '--proxy-server=direct://',
    '--proxy-bypass-list=*',
    '--window-size=2560,1440',
    '--force-device-scale-factor=1.5',
    '--mute-audio',
    '--hide-scrollbars',
    'about:blank'
  ], {
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  chrome.stdout.on('data', d => console.log('[Chrome stdout]', d.toString().trim()));
  chrome.stderr.on('data', d => {
    const s = d.toString().trim();
    if (!s.includes('allocator') && !s.includes('updater')) console.log('[Chrome stderr]', s);
  });

  try {
    let connected = false;
    let tabs = null;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      try {
        tabs = await getJson(`http://127.0.0.1:${PORT}/json/list`);
        if (tabs && tabs.length > 0) {
          connected = true;
          break;
        }
      } catch (e) {}
    }

    if (!connected || !tabs) {
      throw new Error('Failed to connect to Headless Chrome on port ' + PORT);
    }

    const tab = tabs[0];
    console.log('Connecting to WebSocket:', tab.webSocketDebuggerUrl);
    const client = new CDPClient(tab.webSocketDebuggerUrl);
    await client.connect();

    console.log('Connected to CDP. Enabling Page & Runtime...');
    await client.send('Page.enable');
    await client.send('Runtime.enable');

    console.log('Navigating to http://127.0.0.1:5173 ...');
    await client.send('Page.navigate', { url: 'http://127.0.0.1:5173' });

    // Wait for page to load and World3D to initialize
    console.log('Waiting for Sanctuary 3D world to boot...');
    let ready = false;
    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      try {
        const val = await client.evaluate(`
          (async () => {
            if (typeof window.__finishPreloader === 'function') {
              window.__finishPreloader();
            }
            if (typeof window.enter === 'function') {
              await window.enter('3d');
            }
            if (!window.world || !window.world.scene || !window.world.renderer) return false;
            
            // Clean up preloader and overlays for pristine visual capture
            const preloader = document.getElementById('preloader');
            if (preloader) {
              preloader.classList.add('is-done');
              preloader.style.display = 'none';
              if (preloader.parentNode) preloader.remove();
            }
            const welcome = document.getElementById('welcome');
            if (welcome) {
              welcome.style.display = 'none';
              if (welcome.parentNode) welcome.remove();
            }
            const modal = document.getElementById('welcomeModal');
            if (modal) modal.style.display = 'none';
            const tour = document.getElementById('tourRoot');
            if (tour) tour.style.display = 'none';
            const hud = document.getElementById('walkInstructionsHint');
            if (hud) hud.style.display = 'none';
            
            const view3d = document.getElementById('view3d');
            if (view3d) {
              view3d.classList.remove('hidden');
              view3d.style.display = 'block';
            }
            const stage = document.getElementById('stage');
            if (stage) {
              stage.classList.remove('hidden');
              stage.style.display = 'block';
            }

            return true;
          })()
        `);
        if (val) {
          console.log('Sanctuary World3D detected ready!');
          ready = true;
          break;
        }
      } catch (e) {
        console.log('Waiting for 3D engine... (' + i + ')', e.message);
      }
    }

    if (!ready) {
      throw new Error('Sanctuary 3D world did not initialize in time.');
    }

    // Warm up shaders, materials, and particle systems
    console.log('Warming up shaders, atmospheric scattering, and textures...');
    await sleep(4000);

    // Retrieve WebGL Renderer Info
    const rendererInfo = await client.evaluate(`
      (() => {
        const gl = window.world.renderer.getContext();
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          glVendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
          glRenderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
          glVersion: gl.getParameter(gl.VERSION),
          glShadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
          memory: window.world.renderer.info.memory,
          render: window.world.renderer.info.render,
          programs: window.world.renderer.info.programs ? window.world.renderer.info.programs.length : 'N/A'
        };
      })()
    `);
    console.log('WebGL Renderer Info:', JSON.stringify(rendererInfo, null, 2));

    const outDir = '/Users/bethrooney/Desktop/JOTS.MEDIA_AG/assets/qa/eternity_valley';
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const scenes = [
      {
        name: '01_entrance_lookup',
        title: 'Entrance Look-Up View (Monumental Approach & Soaring Sky)',
        setup: `
          window.world.walkMode = false;
          window.world.tourMode = false;
          window.world.controls.enabled = false;
          window.world.camera.position.set(0, 26.0, 965);
          window.world.camera.lookAt(0, 58.0, 880);
          window.world.camera.up.set(0, 1, 0);
          window.world.camera.updateProjectionMatrix();
          if (window.world.camera.updateMatrixWorld) window.world.camera.updateMatrixWorld(true);
        `
      },
      {
        name: '02_grand_gate',
        title: 'The Grand Triumphal Gate (Pylons, Torchiere Colonnade & Arch)',
        setup: `
          window.world.walkMode = false;
          window.world.tourMode = false;
          window.world.controls.enabled = false;
          window.world.camera.position.set(0, 44.0, 930);
          window.world.camera.lookAt(0, 38.0, 800);
          window.world.camera.up.set(0, 1, 0);
          window.world.camera.updateProjectionMatrix();
          if (window.world.camera.updateMatrixWorld) window.world.camera.updateMatrixWorld(true);
        `
      },
      {
        name: '03_rainbow_bridge',
        title: 'The Rainbow Bridge (Spectral Prismatic Arc & Golden Deck)',
        setup: `
          window.world.walkMode = false;
          window.world.tourMode = false;
          window.world.controls.enabled = false;
          window.world.camera.position.set(22.0, 36.0, 480);
          window.world.camera.lookAt(0, 24.0, 380);
          window.world.camera.up.set(0, 1, 0);
          window.world.camera.updateProjectionMatrix();
          if (window.world.camera.updateMatrixWorld) window.world.camera.updateMatrixWorld(true);
        `
      },
      {
        name: '04_living_fountain',
        title: 'Living Fountain & Central Plaza (Multi-Tier Cascades & Floral Terraces)',
        setup: `
          window.world.walkMode = false;
          window.world.tourMode = false;
          window.world.controls.enabled = false;
          window.world.camera.position.set(38.0, 34.0, 52.0);
          window.world.camera.lookAt(0, 19.5, 20.0);
          window.world.camera.up.set(0, 1, 0);
          window.world.camera.updateProjectionMatrix();
          if (window.world.camera.updateMatrixWorld) window.world.camera.updateMatrixWorld(true);
        `
      },
      {
        name: '05_waterfall_headwall',
        title: 'Waterfall Cataract Face & Headwall Plunge (182m Vertical Cascade)',
        setup: `
          window.world.walkMode = false;
          window.world.tourMode = false;
          window.world.controls.enabled = false;
          window.world.camera.position.set(0, 85.0, -310);
          window.world.camera.lookAt(0, 186.0, -430);
          window.world.camera.up.set(0, 1, 0);
          window.world.camera.updateProjectionMatrix();
          if (window.world.camera.updateMatrixWorld) window.world.camera.updateMatrixWorld(true);
        `
      },
      {
        name: '06_glacial_tarn_underwater',
        title: 'Highland Glacial Tarn Underwater Dive (Celestial Trout, Bubbles & Boulders)',
        setup: `
          window.world.walkMode = false;
          window.world.tourMode = false;
          window.world.controls.enabled = false;
          window.world.camera.position.set(10, 176.5, -640);
          window.world.camera.lookAt(10, 176.5, -665);
          window.world.camera.up.set(0, 1, 0);
          window.world.camera.updateProjectionMatrix();
          if (window.world.camera.updateMatrixWorld) window.world.camera.updateMatrixWorld(true);
        `
      },
      {
        name: '07_cathedral_aerial_orbit',
        title: 'Universal Cathedral Aerial Orbit (140m Flèche Spire & Gothic Buttresses)',
        setup: `
          window.world.walkMode = false;
          window.world.tourMode = false;
          window.world.controls.enabled = false;
          window.world.camera.position.set(65, 235.0, -660);
          window.world.camera.lookAt(0, 210.0, -640);
          window.world.camera.up.set(0, 1, 0);
          window.world.camera.updateProjectionMatrix();
          if (window.world.camera.updateMatrixWorld) window.world.camera.updateMatrixWorld(true);
        `
      },
      {
        name: '08_cathedral_nave_interior',
        title: 'Universal Cathedral Nave (Caen Limestone Columns, Oak Pews & High Altar)',
        setup: `
          window.world.walkMode = false;
          window.world.tourMode = false;
          window.world.controls.enabled = false;
          window.world.camera.position.set(0, 188.5, -615);
          window.world.camera.lookAt(0, 188.5, -675);
          window.world.camera.up.set(0, 1, 0);
          window.world.camera.updateProjectionMatrix();
          if (window.world.camera.updateMatrixWorld) window.world.camera.updateMatrixWorld(true);
        `
      },
      {
        name: '09_mirror_lake_underwater',
        title: 'Mirror Lake Underwater Dive (Swimming Golden Koi, Caustics & Lotus Roots)',
        setup: `
          window.world.walkMode = false;
          window.world.tourMode = false;
          window.world.controls.enabled = false;
          window.world.camera.position.set(440, 8.0, -280);
          window.world.camera.lookAt(460, 8.0, -325);
          window.world.camera.up.set(0, 1, 0);
          window.world.camera.updateProjectionMatrix();
          if (window.world.camera.updateMatrixWorld) window.world.camera.updateMatrixWorld(true);
        `
      },
      {
        name: '10_kaya_husky_monument',
        title: 'Guardian Husky Kaya Monument (Sculpted Siberian Husky Hero Shot)',
        setup: `
          window.world.walkMode = false;
          window.world.tourMode = false;
          window.world.controls.enabled = false;
          window.world.camera.position.set(0, 48.4, 2074);
          window.world.camera.lookAt(0, 48.0, 2100);
          window.world.camera.up.set(0, 1, 0);
          window.world.camera.updateProjectionMatrix();
          if (window.world.camera.updateMatrixWorld) window.world.camera.updateMatrixWorld(true);
        `
      },
      {
        name: '11_kaya_coral_reef_underwater',
        title: 'Kaya Submerged Coral Reef Plunge (Yellow Tangs, Glowing Brain Corals & Seabed)',
        setup: `
          window.world.walkMode = false;
          window.world.tourMode = false;
          window.world.controls.enabled = false;
          window.world.camera.position.set(0, -5.5, 2270);
          window.world.camera.lookAt(-30, -5.5, 2240);
          window.world.camera.up.set(0, 1, 0);
          window.world.camera.updateProjectionMatrix();
          if (window.world.camera.updateMatrixWorld) window.world.camera.updateMatrixWorld(true);
        `
      }
    ];

    const reportResults = [];

    for (const sc of scenes) {
      console.log(`Setting up scene: ${sc.title}...`);
      await client.evaluate(`
        (() => {
          ${sc.setup}
        })()
      `);

      // Let animation loop settle, water and atmosphere update
      await sleep(1500);

      // Force render frame to guarantee exact camera and lighting
      await client.evaluate(`
        (() => {
          if (window.world && window.world.renderer && window.world.scene && window.world.camera) {
            window.world.renderer.render(window.world.scene, window.world.camera);
          }
        })()
      `);
      await sleep(200);

      console.log(`Capturing screenshot: ${sc.name}...`);
      const screenshot = await client.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true
      });

      const filePath = path.join(outDir, `${sc.name}.png`);
      fs.writeFileSync(filePath, Buffer.from(screenshot.data, 'base64'));
      const sizeMb = (screenshot.data.length * 0.75 / 1024 / 1024).toFixed(2);
      console.log(`Saved screenshot to ${filePath} (${sizeMb} MB)`);

      reportResults.push({
        name: sc.name,
        title: sc.title,
        path: filePath,
        filename: `${sc.name}.png`,
        sizeBytes: fs.statSync(filePath).size
      });
    }

    const reportJsonPath = path.join(outDir, 'qa_validation_report.json');
    fs.writeFileSync(reportJsonPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      rendererInfo,
      scenes: reportResults,
      consoleErrors: client.consoleLogs.filter(l => l.type === 'error')
    }, null, 2));

    console.log('====================================================');
    console.log('Visual QA Validation Succeeded! All 11 High-Res Screenshots Captured.');
    console.log('Report JSON Path:', reportJsonPath);
    console.log('====================================================');

  } finally {
    try {
      chrome.kill('SIGKILL');
    } catch (e) {}
  }
}

main().catch(err => {
  console.error('QA Runner error:', err);
  process.exit(1);
});
