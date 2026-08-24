// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — boot
// ============================================================
import { generatePlots, DISTRICTS, PET_NAMES, SPECIES } from './terrain.js';
// World3D and Map2D are NOT imported here. Both pull three.js from a
// CDN, and a static import would put that download in front of the
// loading screen — a slow or blocked CDN would strand the visitor
// there with no way through. They are loaded after the entrance is
// interactive; see startWorld() below.
import { Auth } from './auth.js';
import { State } from './state.js';
import { UI } from './ui.js';
import { SEASON_STYLE, MOODS } from './ambience.js';
import { EarthView } from './earth.js';
import { Theme } from './theme.js';
import { Atmosphere } from './atmosphere.js';
import { Motion } from './motion.js';
import { hydrate as hydrateIcons } from './icons.js';
import { warmThumbs, photosReady } from './thumbs.js';
import { Tour } from './tour.js';

const plots = generatePlots();

// Re-apply saved ownership + customizations onto the generated world
import { SLOTS, ITEM_DECOR, GIFT_DECOR, GIFTS, CHARITIES } from './catalog.js';
function applySavedState() {
  const owned = State.data?.ownedPlots || {};
  for (const [plotId, rec] of Object.entries(owned)) {
    const p = plots.find(x => x.id === plotId);
    if (!p || p.status !== 'available') continue;
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
// Responsive boot time that smoothly draws and clears.
const BOOT_MIN_MS = 1200;
const bootStarted = performance.now();

const preloader = {
  el: document.getElementById('preloader'),
  bar: document.getElementById('preloaderBar'),
  step(pct) { if (this.bar) this.bar.style.width = pct + '%'; },
  done() {
    // Stand the index.html watchdog down — boot got here on its own.
    window.__rbvBooted = true;
    this.step(100);
    const held = performance.now() - bootStarted;
    const wait = Math.max(100, BOOT_MIN_MS - held);
    setTimeout(() => {
      this.el?.classList.add('is-done');
      setTimeout(() => this.el?.remove(), 650);
    }, wait);
    return wait;
  },
  /** Boot failed. Say so on the loading screen and dismiss gracefully. */
  fail(err) {
    window.__rbvBooted = true;
    console.error('[boot]', err);
    const note = document.getElementById('preloaderNote');
    const word = document.getElementById('preloaderWord');
    if (word) word.textContent = 'Opening Sanctuary...';
    if (note) {
      note.textContent = (err && err.message) ? err.message : String(err);
      note.classList.remove('hidden');
    }
    setTimeout(() => {
      this.el?.classList.add('is-done');
      setTimeout(() => this.el?.remove(), 650);
    }, 1200);
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
  worldPromise ||= (async () => {
    try {
      console.log('[startWorld] importing modules...');
      const [{ World3D }, { Map2D }] = await Promise.all([
        import('./world3d.js'),
        import('./map2d.js'),
      ]);
      console.log('[startWorld] modules loaded, creating World3D...');
      const world = new World3D(document.getElementById('canvas3d'), plots, (p) => UI.openPlot(p));
      console.log('[startWorld] World3D created, creating Map2D...');
      world.onAmbience = (w, season) => {
        Theme.setMood(w.mood);
        UI.toast(`${SEASON_STYLE[season].name} · ${MOODS[w.mood].label}${w.live ? ' (live weather)' : ''}`, 5000);
      };
      const map = new Map2D(document.getElementById('canvas2d'), plots,
        (p) => { UI.openPlot(p); world.selectPlot(p); });
      console.log('[startWorld] Map2D created, attaching to UI...');
      UI.attachWorld(world, map);
      console.log('[startWorld] done!');
      return { world, map };
    } catch (e) {
      console.warn('[world] failed to initialize 3D world', e);
      return { world: null, map: null };
    }
  })();
  return worldPromise;
}

let tickerInterval = null;
function startTicker() {
  const tickerEl = document.getElementById('welcomeTicker');
  if (!tickerEl) return;
  
  const dk = Object.values(DISTRICTS);
  const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
  
  function getMessage() {
    const type = Math.random();
    const pet = rand(PET_NAMES);
    
    if (type < 0.4) {
      const gift = rand(GIFTS);
      return `<b>${pet}</b> just received <b>${gift.name}</b>`;
    } else if (type < 0.8) {
      const dist = rand(dk);
      return `A memorial was created for <b>${pet}</b> in <b>${dist.name}</b>`;
    } else {
      const charity = rand(CHARITIES);
      const amount = Math.floor(Math.random() * 80) + 10;
      return `<b>${pet}</b>'s family raised <b>$${amount}</b> for <b>${charity.name}</b>`;
    }
  }

  let activeEl = null;

  function tick() {
    if (activeEl) {
      activeEl.classList.remove('is-active');
      activeEl.classList.add('is-exit');
      const old = activeEl;
      setTimeout(() => old.remove(), 1000);
    }
    
    const newEl = document.createElement('div');
    newEl.className = 'welcome-ticker-content';
    newEl.innerHTML = getMessage();
    tickerEl.appendChild(newEl);
    
    // trigger reflow
    void newEl.offsetWidth;
    
    newEl.classList.add('is-active');
    activeEl = newEl;
  }
  
  tick();
  tickerInterval = setInterval(tick, 4000);
}

async function boot() {
  console.log('[boot] 1: Theme.init');
  // The clock drives the whole interface — start it before anything paints.
  Theme.init();
  // Fill the [data-icon] slots in index.html before the chrome is shown,
  // so no frame ever renders with empty icon holes.
  hydrateIcons(document);
  preloader.step(12);
  
  console.log('[boot] 2: startTicker');
  startTicker();

  console.log('[boot] 3: Atmosphere');
  const atmosphere = new Atmosphere(document.getElementById('atmosphere'));
  Theme.onChange(snap => { atmosphere.setTheme(snap); describeNow(snap); });
  atmosphere.start();
  Motion.enhance(document);
  Motion.cursorGlow();
  preloader.step(28);

  console.log('[boot] 4: photosReady');
  // Cheap, and it decides whether shop art is a photo or a render.
  await photosReady;
  console.log('[boot] 5: Auth.init');
  await Auth.init();
  preloader.step(46);
  console.log('[boot] 6: State.init');
  await State.init(Auth.user);
  applySavedState();
  preloader.step(62);

  console.log('[boot] 7: EarthView + UI.init');
  const earth = new EarthView(document.getElementById('earthMap'));
  UI.init({ earth, plots, ensureWorld: () => startWorld(plots) });
  preloader.step(92);
  console.log('[boot] 8: preloader.done');
  preloader.done();

  // Everything below is deliberately off the critical path: the
  // entrance is already interactive, and none of it is needed to
  // press "Cross the Bridge".
  console.log('[boot] 9: startWorld (background)');
  startWorld(plots).catch(e => console.warn('[world] failed to load', e));
  warmThumbs().catch(e => console.warn('[thumbs] warm failed', e));

  // Dev handle: lets the valley be inspected and its clock overridden
  // from the console without rebuilding (`RBV.setPhase('dusk')`).
  window.RBV = {
    UI, Theme, atmosphere, plots, earth, Tour,
    /** Forget the visitor has seen the tour, so it auto-plays again. */
    resetTour() { try { localStorage.removeItem('ev_tour_seen_v1'); } catch {} return 'tour will play on next load'; },
    get world() { return UI.world; },
    get map() { return UI.map; },
    ready: () => startWorld(plots),
    setPhase(key) { UI.world?.forcePhase(key); Theme.forcePhase?.(key); return key; },
    setMood(mood) { if (UI.world) { UI.world.mood = mood; UI.world.applyAmbience(); } Theme.setMood(mood); return mood; },
  };

  // Stripe return: ?paid=1 (real mode webhook records purchase server-side;
  // client shows confirmation)
  if (new URLSearchParams(location.search).get('paid') === '1') {
    UI.toast('Payment received — thank you. Your purchase is being placed.', 'dove');
    history.replaceState({}, '', location.pathname);
  }

  /**
   * Cross into the site. Runs automatically once loading finishes —
   * the loading screen should not hand off to another door. The
   * title card still plays, briefly, as the world fades up behind it.
   */
  const enter = async (mode = 'globe') => {
    console.log('[enter] called with mode:', mode, '_done:', enter._done);
    if (enter._done) return;
    enter._done = true;
    if (tickerInterval) clearInterval(tickerInterval);
    const welcome = document.getElementById('welcome');
    if (welcome) {
      const btn = document.getElementById('enterBtn');
      if (btn) {
        const r = btn.getBoundingClientRect();
        if (r.width) Motion.spark(r.left + r.width / 2, r.top + r.height / 2, 30);
      }
      welcome.style.opacity = '0';
      welcome.style.transform = 'scale(1.04)';
      welcome.style.transition = 'opacity 1.1s var(--ease), transform 1.4s var(--ease)';
      setTimeout(() => {
        welcome.remove();
        // The sky canvas is fully occluded by the map from here on —
        // stop it rather than burn frames behind an opaque view.
        atmosphere.stop();
      }, 1200);
    }
    document.body.classList.add('has-entered');
    document.getElementById('topbar').classList.remove('hidden');
    document.getElementById('stage').classList.remove('hidden');
    setTimeout(() => {
      document.getElementById('earthToolbar')?.classList.remove('is-waiting');
      document.getElementById('globeCta')?.classList.remove('is-waiting');
    }, 250);

    if (mode === '3d') {
      try {
        await UI.show3D();
        console.log('[enter] show3D resolved, world:', !!UI.world);
        UI.world?.flyToDistrict('bridge');
      } catch (e) {
        console.warn('[enter] 3D world failed, falling back to Globe:', e);
        try { await UI.showGlobe(); } catch {}
      }
    } else {
      // Default: Enter into the Earth Globe — orbit view over the planet
      try {
        await UI.showGlobe();
        console.log('[enter] showGlobe resolved');
      } catch (e) {
        console.warn('[enter] Globe failed, falling back to 3D:', e);
        try { await UI.show3D(); UI.world?.flyToDistrict('bridge'); } catch {}
      }
    }

    // Play subtle welcome chime
    try {
      const { Soundscape } = await import('./soundscape.js');
      Soundscape.playChime(528, 0.08);
    } catch {}

    // Shared memorial deep links: ?m=<earth id>, ?p=<sanctuary plot id>, ?campaign=<id>, ?charity=<id>
    const params = new URLSearchParams(location.search);
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
        fetch(cfg.API_BASE + '/track', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'referral', name: 'Partner referral: ' + ref.slice(0, 40), amount: 0, user: 'visitor' }),
        }).catch(() => {});
      }
      UI.toast('Welcome — you were referred by a caring partner.', 'heart');
    }
  };

  // Primary enter buttons
  document.getElementById('enterBtn')?.addEventListener('click', () => enter('globe'));
  document.getElementById('sanctuaryEntryBtn')?.addEventListener('click', () => enter('3d'));

  // "Create a Memorial — Guided Journey" enters, then opens the wizard
  document.getElementById('wizardEntryBtn')?.addEventListener('click', async () => {
    await enter('3d');
    setTimeout(() => UI.griefWizardModal(), 800);
  });

  // The ledger opens over the entrance without crossing the bridge
  // first — the point of publishing it is that it can be checked
  // before anyone is asked for anything.
  const { CharityUI } = await import('./charityui.js');
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
  // Replay, for anyone who skipped it or wants it again.
  document.getElementById('tourBtn')?.addEventListener('click', () => {
    Tour.end();               // in case it is already running
    setTimeout(() => Tour.start(0), 60);
  });
  // Long enough to read the title and the line under it. The
  // preloader holds its own minimum first, so this is measured
  // from when the title card is actually on screen.
  setTimeout(enter, BOOT_MIN_MS + 3600);
}

boot().catch(err => preloader.fail(err));

// -------- Global error boundary --------
// Catches unhandled promise rejections (e.g. CDN timeout, bad network) and
// surfaces a gentle toast rather than leaving the visitor on a silent blank screen.
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.message || String(e.reason || '');
  // Filter noise: ResizeObserver, AbortError, and intentional cancels are harmless
  if (/ResizeObserver|AbortError|cancelled|canceled/i.test(msg)) return;
  console.warn('[unhandledrejection]', e.reason);
  try { UI?.toast('Something went wrong — please reload if the page looks broken.', 6000, 'warning'); } catch {}
});
window.addEventListener('error', (e) => {
  // Filter Three.js WebGL context loss (handled separately in world3d.js)
  if (/WebGL|context lost/i.test(e.message || '')) return;
  console.warn('[error]', e.message, e.filename, e.lineno);
});

// -------- Mobile menu --------
document.addEventListener('DOMContentLoaded', () => {
  const menuToggle = document.getElementById('menuToggle');
  const topbar = document.getElementById('topbar');
  if (menuToggle && topbar) {
    menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      topbar.classList.toggle('nav-open');
    });
    // Close on outside click
    document.addEventListener('click', (e) => {
      if (topbar.classList.contains('nav-open') && !topbar.contains(e.target)) {
        topbar.classList.remove('nav-open');
      }
    });
    // Close when a nav link is tapped on mobile
    topbar.querySelectorAll('a, button').forEach(el => {
      el.addEventListener('click', () => {
        setTimeout(() => topbar.classList.remove('nav-open'), 120);
      });
    });
  }
});
