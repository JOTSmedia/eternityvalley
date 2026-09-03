// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — boot
// ============================================================
import { generatePlots, DISTRICTS, PET_NAMES } from './terrain.js';
import { World3D } from './world3d.js';
import { Map2D } from './map2d.js';
import { Auth } from './auth.js';
import { State } from './state.js';
import { UI } from './ui.js';
import { SEASON_STYLE, MOODS } from './ambience.js';
import { EarthView } from './earth.js';
import { Theme } from './theme.js';
import { Atmosphere } from './atmosphere.js';
import { soundscape } from './soundscapes.js';
import { Motion } from './motion.js';
import { hydrate as hydrateIcons } from './icons.js';
import { warmThumbs, photosReady } from './thumbs.js';
import { Tour } from './tour.js';
import { CharityUI } from './charityui.js';
import { warmAllTextures } from './materials.js';

window.UI = UI;

const plots = generatePlots();

// Re-apply saved ownership + customizations onto the generated world
import { SLOTS, ITEM_DECOR, GIFT_DECOR, GIFTS, CHARITIES } from './catalog.js';
function applySavedState() {
  const owned = State.data?.ownedPlots || {};
  for (const [plotId, rec] of Object.entries(owned)) {
    const p = plots.find(x => x.id === plotId);
    if (!p) continue;
    p.status = 'occupied';
    const gifts = State.data?.gifts?.[plotId] || [];
    p.memorial = { ...rec.memorial, owner: 'You', gifts: gifts.length };
    // chosen headstone
    p.decor = [{ type: 'headstone', style: rec.memorial?.headstone || 'classic' }];
    // purchased items at their chosen slots
    for (const entry of rec.decor || []) {
      const d = ITEM_DECOR[entry.itemId];
      const slot = SLOTS.find(s => s.id === entry.slot) || SLOTS[0];
      if (d) p.decor.push({ ...d, dx: slot.dx, dz: slot.dz });
    }
    // gifts laid at the base
    gifts.forEach((g, i) => {
      const gd = GIFT_DECOR[g.giftId];
      if (gd) p.decor.push({ ...gd, dx: ((i % 3) - 1) * 2.8, dz: 4.5 + Math.floor(i / 3) * 2.2 });
    });
  }
  // gifts left on pre-occupied (seeded) plots
  for (const [plotId, gifts] of Object.entries(State.data?.gifts || {})) {
    if (owned[plotId]) continue;
    const p = plots.find(x => x.id === plotId);
    if (!p) continue;
    gifts.forEach((g, i) => {
      const gd = GIFT_DECOR[g.giftId];
      if (gd) p.decor.push({ ...gd, dx: ((i % 3) - 1) * 2.8, dz: 4.5 + Math.floor(i / 3) * 2.2 });
    });
  }
}

// ---------------- Preloader ----------------
// Responsive boot time that smoothly draws full rainbow arc.
const preloader = {
  el: document.getElementById('preloader'),
  bar: document.getElementById('preloaderBarFill'),
  step(pct) {
    if (window.__setRainbowProgress) window.__setRainbowProgress(pct);
  },
  done() {
    window.__rbvBooted = true;
    window.__appBootReady = true;
    if (typeof window.__finishPreloader === 'function') {
      window.__finishPreloader();
    }
  },
  /** Boot failed. Say so on the loading screen and dismiss gracefully. */
  fail(err) {
    window.__rbvBooted = true;
    window.__appBootReady = true;
    console.log('[boot]', err);
    const note = document.getElementById('preloaderNote');
    const word = document.getElementById('preloaderWord');
    if (word) word.textContent = 'Opening Sanctuary...';
    if (note) {
      note.textContent = (err && err.message) ? err.message : String(err);
      note.classList.remove('hidden');
    }
    if (this.el) {
      this.el.classList.add('is-done');
      this.el.style.display = 'none';
      if (this.el.parentNode) this.el.remove();
    }
    if (typeof window.enter === 'function') {
      window.enter('tour');
    }
  },
};

// A live line on the welcome screen: what the valley looks like right now.
function describeNow(snap) {
  const el = document.getElementById('welcomeNow');
  if (!el) return;
  const season = SEASON_STYLE[snap.season].name.split(' — ')[0];
  el.textContent = `${snap.label} in the valley · ${season}`;
}

/**
 * Build the 3D valley and the 2D map. Runs after the entrance is on
 * screen, so a slow CDN delays only the Sanctuary, never the door.
 * Returns the same promise on repeat calls.
 */
let worldPromise = null;
function startWorld(plots) {
  if (window.world || UI.world) {
    const w = window.world || UI.world;
    if (!UI.world) UI.world = w;
    if (!window.world) window.world = w;
    return Promise.resolve({ world: w, map: UI.map });
  }
  if (!worldPromise) {
    worldPromise = (async () => {
      try {
        console.log('[startWorld] creating World3D...');
        let canvas = document.getElementById('canvas3d');
        if (!canvas) {
          console.log('[startWorld] #canvas3d missing, finding or creating...');
          canvas = document.querySelector('canvas#canvas3d');
        }
        
        canvas.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
          console.warn('[world] WebGL Context Lost! Falling back...');
          if (window.UI && window.UI.showEarth) {
            window.UI.showEarth();
          }
        }, { once: true });

        const world = new World3D(canvas, plots, (p) => UI.openPlot(p));
        
        // Start building the asynchronous features (water, plots, gate, bridge, islands, etc.)
        await world.initAsync().catch(e => console.warn('[world] async initialization error:', e));

        window.world = world;
        window.UI = window.UI || UI;
        window.UI.world = world;
        console.log('[boot] window.world assigned, creating Map2D...');
        world.onAmbience = (w, season) => {
          Theme.setMood(w.mood);
          UI.toast(`${SEASON_STYLE[season].name} · ${MOODS[w.mood].label}${w.live ? ' (live weather)' : ''}`, 5000);
        };
        let map = UI.map;
        if (!map) {
          map = new Map2D(document.getElementById('canvas2d'), plots,
            (p) => { UI.openPlot(p); world.selectPlot(p); });
        }
        console.log('[startWorld] Map2D created, attaching to UI...');
        UI.attachWorld(world, map);
        
        console.log('[startWorld] done!');
        return { world, map };
      } catch (e) {
        console.log('[world] failed to initialize 3D world:', e.stack || e);
        worldPromise = null;
        window.__startWorldPromise = null;
        if (window.UI && window.UI.showEarth) {
          window.UI.showEarth();
        }
        return { world: null, map: null };
      }
    })();
    window.__startWorldPromise = worldPromise;
  }
  return worldPromise;
}

let tickerInterval = null;
function startTicker() {
  const tickerEl = document.getElementById('welcomeTicker');
  if (!tickerEl) return;
  
  const dk = Object.values(DISTRICTS);
  const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
  
  function getSafeMessage() {
    const type = Math.random();
    const pet = rand(PET_NAMES);
    
    const wrap = document.createElement('span');
    if (type < 0.4) {
      const gift = rand(GIFTS);
      wrap.innerHTML = `<span class="ticker-gold-mark">✦</span> <b>${pet}</b> received <b>${gift.name}</b> tribute`;
    } else if (type < 0.8) {
      const dist = rand(dk);
      wrap.innerHTML = `<span class="ticker-gold-mark">✦</span> Memorial placed for <b>${pet}</b> in <b>${dist.name}</b>`;
    } else {
      const charity = rand(CHARITIES);
      const amount = Math.floor(Math.random() * 80) + 10;
      wrap.innerHTML = `<span class="ticker-gold-mark">✦</span> <b>${pet}</b>’s family raised <b>$${amount}</b> for <b>${charity.name}</b>`;
    }
    return wrap.innerHTML;
  }

  let activeEl = null;

  function tick() {
    if (!document.getElementById('welcomeTicker')) {
      if (tickerInterval) { clearInterval(tickerInterval); tickerInterval = null; }
      return;
    }
    if (activeEl) {
      activeEl.classList.remove('is-active');
      activeEl.classList.add('is-exit');
      const old = activeEl;
      setTimeout(() => { if (old.parentNode) old.remove(); }, 1000);
    }
    
    const newEl = document.createElement('div');
    newEl.className = 'welcome-ticker-content';
    newEl.innerHTML = getSafeMessage();
    tickerEl.appendChild(newEl);
    
    // trigger reflow
    void newEl.offsetWidth;
    
    newEl.classList.add('is-active');
    activeEl = newEl;
  }
  
  tick();
  tickerInterval = setInterval(tick, 4000);

  // Pause ticker when tab is hidden to prevent battery drain & reference leaks
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (tickerInterval) { clearInterval(tickerInterval); tickerInterval = null; }
    } else if (!tickerInterval && document.getElementById('welcomeTicker')) {
      tickerInterval = setInterval(tick, 4000);
    }
  });

  window.addEventListener('beforeunload', () => {
    if (tickerInterval) clearInterval(tickerInterval);
  });
}

let hasEntered = false;
let enterPromise = null;
/**
 * Cross into the site. Runs automatically once loading finishes —
 * the loading screen should not hand off to another door.
 */
export async function enter(mode = 'tour') {
  console.log('[enter] entering sanctuary in mode:', mode);
  if (hasEntered && enterPromise) return enterPromise;
  hasEntered = true;
  enter._done = true;

  enterPromise = (async () => {
    try {
      const preloaderEl = document.getElementById('preloader');
      if (preloaderEl) {
        preloaderEl.classList.add('is-done');
        preloaderEl.style.pointerEvents = 'none';
        setTimeout(() => {
          if (preloaderEl.parentNode) preloaderEl.remove();
        }, 900);
      }
      if (tickerInterval) {
        clearInterval(tickerInterval);
        tickerInterval = null;
      }
      try {
        if (window.__evAtmosphere?.stop) window.__evAtmosphere.stop();
      } catch (e) {
        console.log('[enter] atmosphere stop error:', e);
      }
      const welcome = document.getElementById('welcome');
      if (welcome && welcome.parentNode) {
        welcome.remove();
      }
      document.body.classList.add('has-entered');
      const topbar = document.getElementById('topbar');
      if (topbar) topbar.classList.remove('hidden');
      const stage = document.getElementById('stage');
      if (stage) {
        stage.classList.remove('hidden');
        stage.style.display = 'block';
      }

      setTimeout(() => {
        document.getElementById('earthToolbar')?.classList.remove('is-waiting');
        document.getElementById('globeCta')?.classList.remove('is-waiting');
      }, 100);

      if (mode === '3d' || mode === 'tour') {
        try {
          console.log('[enter] starting/awaiting startWorld...');
          const res = await startWorld(plots);
          
          if (window.world) {
            if (window.world.start) window.world.start();
            if (window.world._resize) window.world._resize();
          }
          
          if (!res || !res.world) {
            throw new Error('3D World failed to initialize');
          }
          
          console.log('[enter] startWorld resolved, showing 3D in tour mode...');
          // Use show3D but without isEntrance to avoid double-starting
          await UI.show3D(mode === 'tour' ? 'tour' : 'orbit', false);
          console.log('[enter] show3D resolved, world ready:', !!UI.world);
          
          // FORCE the drone tour to start — the show3D call above may
          // skip it if tourMode flags are already set from initAsync
          if (mode === 'tour' && UI.world) {
            if (UI.world.startDroneTour) {
              console.log('[enter] forcing drone tour start');
              UI.world.startDroneTour(0);
            } else if (UI.world.setMode) {
              UI.world.setMode('tour');
            }
          }
        } catch (e) {
          console.log('[enter] 3D world failed, falling back to Earth:', e);
          if (window.UI && window.UI.showEarth) {
            window.UI.showEarth();
          } else {
            try { await UI.showGlobe(); } catch (e2) {
              console.log('[enter] Globe fallback failed, falling back to 2D:', e2);
              try { await UI.show2D(); } catch {}
            }
          }
        }
      } else if (mode === 'globe') {
        try {
          await UI.showGlobe();
          console.log('[enter] showGlobe resolved');
        } catch (e) {
          console.log('[enter] Globe failed, falling back to 3D:', e);
          try {
            await startWorld(plots);
            await UI.show3D('tour');
          } catch (e2) {
            try { await UI.show2D(); } catch {}
          }
        }
      } else if (mode === 'earth') {
        try {
          await UI.showEarth();
        } catch (e) {
          try { await UI.showGlobe(); } catch {}
        }
      } else if (mode === '2d') {
        try {
          await UI.show2D();
        } catch (e) {
          try {
            await startWorld(plots);
            await UI.show3D('tour');
          } catch {}
        }
      }

      // Multi-stage canvas and camera resize dispatch
      const triggerCanvasResize = () => {
        window.dispatchEvent(new Event('resize'));
        if (UI.world?._resize) UI.world._resize();
        if (UI.world?.start) UI.world.start();
        if (UI.globe?.resize) UI.globe.resize();
        if (UI.map?._resize) UI.map._resize();
      };
      requestAnimationFrame(triggerCanvasResize);
      setTimeout(triggerCanvasResize, 50);
      setTimeout(triggerCanvasResize, 200);
      setTimeout(triggerCanvasResize, 500);

      // Shared memorial deep links: ?m=<earth id>, ?p=<sanctuary plot id>, ?campaign=<id>, ?charity=<id>
      try {
        const params = new URLSearchParams(location.search);
        
        if (params.get('paid') === '1') {
          UI.toast('Your memorial contribution was received. It will appear shortly.', 8000, 'crest');
          params.delete('paid');
          window.history.replaceState({}, '', `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`);
        }
        
        const memId = params.get('m');
        if (memId) {
          const { allMemorials } = await import('./social.js');
          const m = allMemorials(State.data).find(x => x.id === memId);
          if (m) setTimeout(() => { UI.showEarth(); UI.openEarthMemorial(m); }, 1200);
          else UI.toast('That memorial link could not be found on this device.');
        }
        const plotId = params.get('p');
        if (plotId) {
          const pl = plots.find(x => x.id === plotId);
          if (pl) { await UI.show3D(); UI.world?.selectPlot(pl); UI.openPlot(pl); }
        }
        const cmpId = params.get('campaign');
        if (cmpId) {
          const { Campaigns } = await import('./charity.js');
          const c = Campaigns.get(cmpId);
          if (c) setTimeout(() => CharityUI.campaignModal(UI, c), 1200);
        }
        const chId = params.get('charity');
        if (chId) {
          const { charityById } = await import('./charity.js');
          const ch = charityById(chId);
          if (ch) setTimeout(() => UI.shelterModal(ch), 1200);
        }
        // Partner referrals: ?ref=<partner-code> (vets, cremators, shelters)
        const ref = params.get('ref');
        if (ref) {
          try { localStorage.setItem('ev_ref', ref.slice(0, 40)); } catch {}
          const cfg = await import('./config.js');
          if (cfg.HAS_API) {
            let consent = false;
            try { consent = localStorage.getItem('ev_privacy_consent') === 'true'; } catch {}
            if (consent) {
              fetch(cfg.API_BASE + '/track', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind: 'referral', name: 'Partner referral: ' + ref.slice(0, 40), amount: 0, user: 'visitor' }),
              }).catch(() => {});
            }
          }
          UI.toast('Welcome — you were referred by a caring partner.', 'heart');
        }
      } catch (err) {
        console.log('[enter] URL param handling failed:', err);
      }
    } catch (err) {
      console.log('[enter] enter error, resetting entry flag:', err);
      hasEntered = false;
      enter._done = false;
      enterPromise = null;
      throw err;
    }
  })();

  return enterPromise;
}
window.enter = enter;

// Immediately expose checkAndEnterApp so preloader or button clicks can trigger it

window.__checkAndEnterApp = () => {
  if (window.__appBootReady || window.__rainbowAnimationReady) {
    enter('tour');
  }
};
// Auto-trigger it once boot finishes!
const originalBoot = boot;


async function boot() { 
  console.log('[boot] 1: Theme.init, Icons & Early UI.init');
  try {
    Theme.init();
    hydrateIcons(document);
    window.UI = UI;
    UI.init({ earth: null, plots, ensureWorld: () => startWorld(plots) });
  } catch (e) {
    console.log('[boot] Theme/icons/UI init error:', e);
  }
  preloader.step(20);

  console.log('[boot] 2: Constructing 3D Sanctuary Valley in background...');
  preloader.step(50);

  // Start constructing 3D Sanctuary Valley in background while 4s preloader displays
  const worldInitPromise = startWorld(plots).then(res => {
    if (res.world) {
      window.world = res.world;
      window.UI.world = res.world;
      // warmup is handled automatically inside world.initAsync() now
    }
    preloader.step(100);
    preloader.done();
    return res;
  }).catch(err => {
    console.log('[boot] startWorld error:', err);
    preloader.done();
    return { world: null, map: null };
  });

  // Background non-blocking warmups & async tasks
  (async () => {
    console.log('[boot background] Atmosphere, Ticker, Auth & State...');
    try {
      startTicker();
      const atmosphereEl = document.getElementById('atmosphere');
      if (atmosphereEl) {
        const atmosphere = new Atmosphere(atmosphereEl);
        Theme.onChange(snap => { atmosphere.setTheme(snap); describeNow(snap); });
        atmosphere.start();
        window.__evAtmosphere = atmosphere;
      }
      Motion.enhance(document);
      Motion.cursorGlow();
    } catch (e) {
      console.log('[boot background] Atmosphere/Motion error:', e);
    }

    try {
      await Promise.all([
        photosReady.catch(e => console.log('[boot background] photosReady error:', e)),
        Auth.init().then(() => State.init(Auth.user)).catch(e => console.log('[boot background] Auth/State error:', e)),
      ]);
      applySavedState();
    } catch (e) {
      console.log('[boot background] Auth/State step error:', e);
    }

    try {
      await warmAllTextures();
    } catch (e) {
      console.log('[boot background] Texture warming error:', e);
    }

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(() => {
        warmThumbs().catch(e => console.log('[thumbs] warm failed', e));
      }, { timeout: 3000 });
    } else {
      setTimeout(() => {
        warmThumbs().catch(e => console.log('[thumbs] warm failed', e));
      }, 1200);
    }
  })();

  // Dev handle: lets the valley be inspected and its clock overridden
  const isProd = location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
  
  if (!isProd) {
    // Dev-only globals for console debugging — never exposed in production
    window.UI = UI;
    window.world = window.world || UI.world;
    window.RBV = {
      UI, Theme, get atmosphere() { return window.__evAtmosphere; }, plots, get earth() { return UI.earth; }, Tour,
      /** Forget the visitor has seen the tour, so it auto-plays again. */
      resetTour() { try { localStorage.removeItem('ev_tour_seen_v1'); } catch {} return 'tour will play on next load'; },
      get world() { return UI.world; },
      get map() { return UI.map; },
      ready: () => startWorld(plots),
      setPhase(key) { UI.world?.forcePhase(key); Theme.forcePhase?.(key); return key; },
      setMood(mood) { if (UI.world) { UI.world.mood = mood; UI.world.applyAmbience(); } Theme.setMood(mood); return mood; },
    };
  }
  
  // Ensure IS_ADMIN chip cannot be trivially spoofed on client-side in production
  if (isProd) {
    try {
      localStorage.removeItem('ev_admin_mode');
      const params = new URLSearchParams(window.location.search);
      if (params.has('admin') || params.has('dev')) {
        params.delete('admin');
        params.delete('dev');
        params.delete('mode');
        window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
        // To be completely safe and wipe the already-loaded IS_ADMIN const:
        window.location.reload();
      }
    } catch {}
  }

  // Primary enter buttons
  document.getElementById('enterBtn')?.addEventListener('click', () => enter('tour'));
  document.getElementById('sanctuaryEntryBtn')?.addEventListener('click', () => enter('tour'));
  document.getElementById('enterValleyBtn')?.addEventListener('click', () => UI.show3D('tour'));
  document.getElementById('btn3d')?.addEventListener('click', () => UI.show3D('orbit'));
  document.getElementById('btnGlobe')?.addEventListener('click', () => UI.showGlobe());

  // "Create a Memorial — Guided Journey" enters, then opens the wizard
  document.getElementById('wizardEntryBtn')?.addEventListener('click', async () => {
    await enter('tour');
    setTimeout(() => UI.griefWizardModal(), 800);
  });

  // The ledger opens over the entrance without crossing the bridge
  // first — the point of publishing it is that it can be checked
  // before anyone is asked for anything.
  for (const id of ['welcomeLedger', 'welcomeLedger2']) {
    document.getElementById(id)?.addEventListener('click', (e) => {
      e.preventDefault();
      CharityUI.ledgerModal(UI);
    });
  }
  document.getElementById('ctaCampaigns')?.addEventListener('click', (e) => {
    e.preventDefault();
    CharityUI.togglePanel(UI);
  });

  // Entry is now handled by __finishPreloader -> completeAndDismiss -> enter('tour')
  // No need for a redundant trigger here.
}

boot().catch(err => preloader.fail(err));

// -------- Global error boundary --------
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.message || String(e.reason || '');
  if (/ResizeObserver|AbortError|cancelled|canceled/i.test(msg)) return;
  console.log('[unhandledrejection]', e.reason);
  try { UI?.toast('Something went wrong — please reload if the page looks broken.', 6000, 'warning'); } catch {}
});
window.addEventListener('error', (e) => {
  if (/WebGL|context lost/i.test(e.message || '')) return;
  console.log('[error]', e.message, e.filename, e.lineno);
});

// -------- Mobile menu --------
function initMobileMenu() {
  const menuToggle = document.getElementById('menuToggle');
  const topbar = document.getElementById('topbar');
  if (menuToggle && topbar && !menuToggle._bound) {
    menuToggle._bound = true;
    menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      topbar.classList.toggle('nav-open');
    });
    document.addEventListener('click', (e) => {
      if (topbar.classList.contains('nav-open') && !topbar.contains(e.target)) {
        topbar.classList.remove('nav-open');
      }
    });
    topbar.querySelectorAll('a, button').forEach(el => {
      el.addEventListener('click', () => {
        setTimeout(() => topbar.classList.remove('nav-open'), 120);
      });
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMobileMenu);
} else {
  initMobileMenu();
}
