// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — boot
// ============================================================
import { generatePlots } from './terrain.js';
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
import { warmThumbs } from './thumbs.js';

const plots = generatePlots();

// Re-apply saved ownership + customizations onto the generated world
import { SLOTS, ITEM_DECOR, GIFT_DECOR } from './catalog.js';
function applySavedState() {
  for (const [plotId, rec] of Object.entries(State.data.ownedPlots)) {
    const p = plots.find(x => x.id === plotId);
    if (!p || p.status !== 'available') continue;
    p.status = 'occupied';
    const gifts = State.data.gifts[plotId] || [];
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
  for (const [plotId, gifts] of Object.entries(State.data.gifts || {})) {
    if (State.data.ownedPlots[plotId]) continue;
    const p = plots.find(x => x.id === plotId);
    if (!p) continue;
    gifts.forEach((g, i) => {
      const gd = GIFT_DECOR[g.giftId];
      if (gd) p.decor.push({ ...gd, dx: ((i % 3) - 1) * 2.8, dz: 4.5 + Math.floor(i / 3) * 2.2 });
    });
  }
}

// ---------------- Preloader ----------------
// Progress reflects real boot milestones, not a fake timer.
const preloader = {
  el: document.getElementById('preloader'),
  bar: document.getElementById('preloaderBar'),
  step(pct) { if (this.bar) this.bar.style.width = pct + '%'; },
  done() {
    // Stand the index.html watchdog down — boot got here on its own.
    window.__rbvBooted = true;
    this.step(100);
    setTimeout(() => {
      this.el?.classList.add('is-done');
      setTimeout(() => this.el?.remove(), 950);
    }, 260);
  },
  /** Boot failed. Say so on the loading screen instead of hanging. */
  fail(err) {
    window.__rbvBooted = true;
    console.error('[boot]', err);
    const note = document.getElementById('preloaderNote');
    const word = document.getElementById('preloaderWord');
    if (word) word.textContent = 'Something went wrong';
    if (note) {
      note.textContent = (err && err.message) ? err.message : String(err);
      note.classList.remove('hidden');
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
  worldPromise ||= (async () => {
    const [{ World3D }, { Map2D }] = await Promise.all([
      import('./world3d.js'),
      import('./map2d.js'),
    ]);
    const world = new World3D(document.getElementById('canvas3d'), plots, (p) => UI.openPlot(p));
    world.onAmbience = (w, season) => {
      Theme.setMood(w.mood);
      UI.toast(`${SEASON_STYLE[season].name} · ${MOODS[w.mood].label}${w.live ? ' (live weather)' : ''}`, 5000);
    };
    const map = new Map2D(document.getElementById('canvas2d'), plots,
      (p) => { UI.openPlot(p); world.selectPlot(p); });
    UI.attachWorld(world, map);
    return { world, map };
  })();
  return worldPromise;
}

async function boot() {
  // The clock drives the whole interface — start it before anything paints.
  Theme.init();
  // Fill the [data-icon] slots in index.html before the chrome is shown,
  // so no frame ever renders with empty icon holes.
  hydrateIcons(document);
  preloader.step(12);

  const atmosphere = new Atmosphere(document.getElementById('atmosphere'));
  Theme.onChange(snap => { atmosphere.setTheme(snap); describeNow(snap); });
  atmosphere.start();
  Motion.enhance(document);
  Motion.cursorGlow();
  preloader.step(28);

  await Auth.init();
  preloader.step(46);
  await State.init(Auth.user);
  applySavedState();
  preloader.step(62);

  const earth = new EarthView(document.getElementById('earthMap'));
  UI.init({ earth, plots, ensureWorld: () => startWorld(plots) });
  preloader.step(92);
  preloader.done();

  // Everything below is deliberately off the critical path: the
  // entrance is already interactive, and none of it is needed to
  // press "Cross the Bridge".
  startWorld(plots).catch(e => console.warn('[world] failed to load', e));
  warmThumbs().catch(e => console.warn('[thumbs] warm failed', e));

  // Dev handle: lets the valley be inspected and its clock overridden
  // from the console without rebuilding (`RBV.setPhase('dusk')`).
  window.RBV = {
    UI, Theme, atmosphere, plots, earth,
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

  document.getElementById('enterBtn').onclick = async (e) => {
    // Crossing over: a spark burst at the button, then the welcome
    // dissolves into the world behind it.
    const r = e.currentTarget.getBoundingClientRect();
    Motion.spark(r.left + r.width / 2, r.top + r.height / 2, 30);
    const welcome = document.getElementById('welcome');
    welcome.style.opacity = '0';
    welcome.style.transform = 'scale(1.04)';
    welcome.style.transition = 'opacity 1.1s var(--ease), transform 1.4s var(--ease)';
    setTimeout(() => {
      welcome.remove();
      // The sky canvas is fully occluded by the map from here on —
      // stop it rather than burn frames behind an opaque view.
      atmosphere.stop();
    }, 1200);
    document.body.classList.add('has-entered');
    document.getElementById('topbar').classList.remove('hidden');
    document.getElementById('stage').classList.remove('hidden');
    // Land in Earth mode, centered on Rainbow Bridge Valley — the
    // entrance to the whole cemetery (real Rainbow Bridge, Utah).
    UI.showEarth();
    await UI.mountEarth();
    // Shared memorial deep links: ?m=<earth id> or ?p=<sanctuary plot id>
    const params = new URLSearchParams(location.search);
    const memId = params.get('m');
    if (memId) {
      const { allMemorials } = await import('./social.js');
      const m = allMemorials(State.data).find(x => x.id === memId);
      if (m) setTimeout(() => UI.openEarthMemorial(m), 1200);
      else UI.toast('That memorial link could not be found on this device.');
    }
    const plotId = params.get('p');
    if (plotId) {
      const pl = plots.find(x => x.id === plotId);
      if (pl) { await UI.show3D(); UI.world?.selectPlot(pl); UI.openPlot(pl); }
    }
    // Partner referrals: ?ref=<partner-code> (vets, cremators, shelters)
    const ref = params.get('ref');
    if (ref) {
      try { localStorage.setItem('ev_ref', ref.slice(0, 40)); } catch {}
      fetch((await import('./config.js')).API_BASE + '/track', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'referral', name: 'Partner referral: ' + ref.slice(0, 40), amount: 0, user: 'visitor' }),
      }).catch(() => {});
      UI.toast('Welcome — you were referred by a caring partner.', 'handshake');
    }
    // Pre-position the sanctuary camera for when they enter it. The
    // world may still be loading, so this waits rather than assuming.
    startWorld(plots).then(({ world }) => {
      world.camera.position.set(0, 520, 1900);
      world.controls.target.set(0, 30, 700);
    }).catch(() => {});
  };
}

boot().catch(err => preloader.fail(err));
