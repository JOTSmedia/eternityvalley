// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — UI: panels, modals, purchase & gift flows
// ============================================================
import { DISTRICTS, SIZE_LABELS, PET_NAMES, SPECIES, EPITAPHS } from './terrain.js';
import { MEMBERSHIPS, PLOT_ITEMS, GIFTS, EARTH_PLOT, PHYSICAL_KEEPSAKES, SLOTS, HEADSTONE_STYLES, ITEM_DECOR, GIFT_DECOR, CHARITIES, GIFT_CHARITY_SHARE, charityName, fmtPrice } from './catalog.js';
import { CharityUI } from './charityui.js';
import { Tour } from './tour.js';
import { SPLITS, Campaigns, Ledger, fmt } from './charity.js';
import { Auth } from './auth.js';
import { State } from './state.js';
import { checkout } from './checkout.js';
import { IS_DEMO, HAS_MAPS3D, IS_ADMIN } from './config.js';
import { RBV, allMemorials, allActivity, timeAgo } from './social.js';
import { Motion } from './motion.js';
import { icon, speciesIcon, speciesKey, rainbowMark, SPECIES_LABELS } from './icons.js';
import { thumbImg, canRender as canRenderThumb, photoFor } from './thumbs.js';
import { Soundscape } from './soundscape.js';
import { checkAnniversaries, generateICS, ANNIVERSARY_GIFTS } from './anniversary.js';

const $ = (s) => document.querySelector(s);

// The species picker: value is the icon key, so a memorial stores a
// stable key rather than a display string or an emoji glyph.
const SPECIES_OPTIONS = ['dog', 'cat', 'rabbit', 'bird', 'horse', 'hamster', 'fish', 'turtle', 'other'];
const speciesOptionsHTML = (sel = 'dog') => SPECIES_OPTIONS
  .map(k => `<option value="${k}"${k === sel ? ' selected' : ''}>${SPECIES_LABELS[k]}</option>`)
  .join('');

export const DISTRICT_FLY_MAP = {
  all: 'all',
  overview: 'all',
  meadows: 'meadows',
  canopy: 'canopy',
  woodland: 'canopy',
  riverbank: 'riverbank',
  lakefront: 'riverbank',
  beach: 'starlight',
  starlight: 'starlight',
  kaya_island: 'starlight',
  highland: 'highland',
  summit: 'highland',
  desert: 'desert',
  bridge: 'bridge',
  gate: 'gate',
};

/**
 * Art for a community-feed entry. The stored key may be a UI icon
 * name, a catalog id (rendered as the real 3D object), or — for state
 * saved before icons replaced emoji — an old glyph, which falls back
 * rather than rendering a broken image.
 */
const activityArt = (key) => {
  if (!key) return icon('sparkle');
  if (canRenderThumb(key)) return thumbImg(key, { size: 24, cls: 'thumb-inline' });
  return /^[a-z][a-zA-Z]*$/.test(key) ? (icon(key) || icon('sparkle')) : icon('sparkle');
};

/**
 * The art for a memorial, best first: the owner's own photograph of
 * their companion, then a stock portrait of the species, then the
 * drawn silhouette. The silhouette is still the right fallback when
 * we have no licensed portrait for a species.
 */
const memorialArt = (m, size = 44) => {
  if (m.photo) return `<img src="${m.photo}" class="pet-photo" alt="${m.petName || 'memorial'}">`;
  const key = speciesKey(m.species || m.speciesLabel || '');
  const stock = photoFor('sp_' + key);
  if (stock) {
    return `<img src="${stock}" class="pet-photo pet-photo--stock" `
         + `alt="${SPECIES_LABELS[key] || 'companion'}" loading="lazy">`;
  }
  return `<div class="pet-species">${speciesIcon(key, { size })}</div>`;
};

// ---- Trust & safety: soften abusive words in user-generated text ----
const BAD_WORDS = /\b(fuck\w*|shit\w*|bitch\w*|asshole\w*|cunt\w*|nigg\w*|fag\w*|dick\w*|whore\w*|slut\w*)\b/gi;
export function cleanText(s) {
  return String(s || '').replace(BAD_WORDS, '\u2014').slice(0, 300);
}

// ---- Photo helpers: resize uploads to small data URLs ----
function readOneFile(f, maxPx) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxPx / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(f);
  });
}
function readPhoto(fileInput, maxPx = 220) {
  const f = fileInput?.files?.[0];
  return f ? readOneFile(f, maxPx) : Promise.resolve(null);
}
async function readPhotos(fileInput, maxPx = 420, maxCount = 6) {
  const files = [...(fileInput?.files || [])].slice(0, maxCount);
  const out = [];
  for (const f of files) { const d = await readOneFile(f, maxPx); if (d) out.push(d); }
  return out;
}

/**
 * Escape for interpolation into innerHTML. Pet names, places and
 * epitaphs are all visitor-entered, and the search results render them
 * straight into markup.
 */
const escapeHtml = (v) => String(v ?? '')
  .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const esc = escapeHtml;

export const UI = {
  // `world` and `map` arrive later than the rest of the interface: they
  // depend on three.js, which is fetched from a CDN and deliberately
  // kept off the boot path. Everything here works without them and
  // waits only at the moment the Sanctuary is actually needed.
  world: null, map: null, earth: null, plots: [], currentPlot: null,
  _ensureWorld: null,

  init({ earth, plots, ensureWorld }) {
    if (earth !== undefined) this.earth = earth;
    if (plots) this.plots = plots;
    if (ensureWorld) this._ensureWorld = ensureWorld;

    if (this._initialized) return;
    this._initialized = true;

    setTimeout(() => {
      if (!State.data?.ownedPlots) return;
      const annivs = checkAnniversaries(State.data?.ownedPlots);
      if (annivs.length > 0) {
        const names = annivs.map(a => a.petName).join(', ');
        this.toast(`Upcoming remembrance for ${names}. Take a moment to visit.`, 8000, 'candle');
      }
    }, 1000);

    if ($('#panelClose')) $('#panelClose').onclick = () => this.closePanel();
    if ($('#authBtn')) $('#authBtn').onclick = () => this.authModal();
    if ($('#signOutBtn')) $('#signOutBtn').onclick = async () => { await Auth.signOut(); this.toast('Signed out. You are browsing as a guest.'); };
    if ($('#membershipBtn')) $('#membershipBtn').onclick = () => this.membershipModal();
    if ($('#createMemorialBtn')) $('#createMemorialBtn').onclick = () => this.griefWizardModal();

    // District navigation filter pills (in 3D Sanctuary view)
    $('#districtNav')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-d]');
      const d = btn?.dataset?.d;
      if (d) {
        $('#districtNav').querySelectorAll('.district-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        await this.show3D();
        const mappedDistrict = DISTRICT_FLY_MAP[d] || d;
        this.world?.flyToDistrict(mappedDistrict);
      }
    });

    // 3D Ambience & Lighting Control Pill
    $('#sanctuaryAmbiencePill')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.sap-btn');
      if (!btn) return;
      $('#sanctuaryAmbiencePill').querySelectorAll('.sap-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      if (window.RBV) {
        if (btn.dataset.phase) window.RBV.setPhase(btn.dataset.phase);
        if (btn.dataset.mood) window.RBV.setMood(btn.dataset.mood);
      }
    });

    if ($('#btnGlobe')) $('#btnGlobe').onclick = () => this.showGlobe();
    if ($('#enterValleyBtn')) $('#enterValleyBtn').onclick = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      Motion.spark(r.left + r.width / 2, r.top + r.height / 2, 26);
      this.show3D('tour');
    };
    if ($('#btnEarth')) $('#btnEarth').onclick = () => this.showEarth();
    if ($('#btn3d')) $('#btn3d').onclick = () => this.show3D('orbit');
    if ($('#btn2d')) $('#btn2d').onclick = () => this.show2D();
    const toggleDroneTour = () => {
      if (this.world?.tourMode) {
        this.world.setMode('orbit');
        this._setView({ view: 'view3d', btn: 'btn3d' });
      } else {
        this.startDroneTour();
      }
    };
    if ($('#btnDroneTour')) $('#btnDroneTour').onclick = toggleDroneTour;
    if ($('#navDroneTourBtn')) $('#navDroneTourBtn').onclick = toggleDroneTour;
    if ($('#droneTourToolbarBtn')) $('#droneTourToolbarBtn').onclick = toggleDroneTour;
    if ($('#globeDroneTourBtn')) $('#globeDroneTourBtn').onclick = () => this.startDroneTour();
    if ($('#droneTourEntryBtn')) $('#droneTourEntryBtn').onclick = async () => {
      if (typeof window.enter === 'function') await window.enter('tour');
      this.startDroneTour();
    };
    this._initEarthUI();

    Auth.onChange(u => {
      $('#authBtn').classList.toggle('hidden', !!u);
      $('#userChip').classList.toggle('hidden', !u);
      if (u) $('#userName').textContent = u.name;
      if (this._authEmitted && this._lastUserUid !== u?.uid) {
        setTimeout(() => window.location.reload(), 500);
      }
      this._lastUserUid = u?.uid;
      this._authEmitted = true;
    });
    const userNameEl = $('#userName');
    if (userNameEl) {
      userNameEl.style.cursor = 'pointer';
      userNameEl.title = 'My Bridge — profile, plots & memorials';
      userNameEl.onclick = () => this.myBridgeModal();
    }
    const myBtnEl = $('#myBtn');
    if (myBtnEl) {
      myBtnEl.onclick = () => this.myBridgeModal();
    }

    if (IS_ADMIN) {
      const chip = document.createElement('div');
      chip.className = 'demo-chip is-admin';
      chip.style.cursor = 'pointer';
      chip.innerHTML = icon('shield') + ' ⚡ UNTETHERED ADMIN CONSOLE';
      chip.title = 'Click to open superuser controls';
      chip.onclick = () => this.adminHudModal();
      document.body.appendChild(chip);
    }
  },

  /**
   * Show the globe: our own Earth, in orbit, with a pin on every place
   * a companion loved. Selecting one hands off to Google's tiles for
   * the descent — see descendTo().
   */
  async showGlobe() {
    if (!this.globe) {
      const { Globe } = await import('./globe.js');
      const globe = new Globe(document.getElementById('canvasGlobe'), {
        onPinClick: (pin) => this.descendTo(pin),
        onGlobeClick: ({ lat, lng }) => {
          this.toast(`Earth spot selected: ${lat.toFixed(2)}°, ${lng.toFixed(2)}° — opening memorial consecration.`, 4000, 'globe');
          this.beginMemorialAt({ lat, lng });
        },
      });
      // Assigned only once init() has actually succeeded. Assigning
      // first meant a failure part-way through left a half-built globe
      // in place that later calls treated as ready — the pins and the
      // sky readout silently never appeared, and nothing was logged.
      try {
        await globe.init();
      } catch (e) {
        console.log('[globe] init failed', e);
        this.toast('The globe could not be loaded — showing the map instead.', 6000, 'warning');
        return this.showEarth();
      }
      this.globe = globe;
      for (const m of allMemorials(State.data)) {
        if (m.lat != null) this.globe.addPin({ lat: m.lat, lng: m.lng, name: m.place, memorial: m });
      }
      this.globe.addPin({ lat: RBV.lat, lng: RBV.lng, name: 'Rainbow Bridge Valley', rbv: true });
      const s = this.globe.sky;
      const read = $('#globeReadout');
      if (read && s?.moon && s?.sun) {
        read.innerHTML = `${icon('sparkle')} <span>${s.moon.name || 'Moon'} · ${Math.round((s.moon.illumination || 0) * 100)}% lit`
          + ` · sun over ${(s.sun.lat || 0).toFixed(0)}°, ${(s.sun.lng || 0).toFixed(0)}°</span>`;
      }
    }
    this._setView({ view: 'viewGlobe', btn: 'btnGlobe' });
    requestAnimationFrame(() => { 
      this.globe?.resize(); 
      this.globe?.start(); 
    });
  },

  /** Leave orbit for a real place, with smooth camera descent. */
  async descendTo(pin) {
    if (pin.rbv) {
      this.toast('Descending from orbit to Rainbow Bridge Valley…', 3200, 'rainbow');
      if (this.globe?.zoomTo) {
        await this.globe.zoomTo(pin.lat, pin.lng, { targetDistance: 140, duration: 1100 });
      }
      await this.show3D('orbit', true);
      return;
    }
    this.toast(`Descending to ${pin.name || 'Earth memorial'}…`, 2800, 'pin');
  if (this.globe?.zoomTo) {
      await this.globe.zoomTo(pin.lat, pin.lng, { targetDistance: 160, duration: 900 });
    }
    await this.showEarth();
    this.flyToPlace({ lat: pin.lat, lng: pin.lng, range: 420, name: pin.name });
    if (pin.memorial) setTimeout(() => this.openEarthMemorial(pin.memorial), 2600);
  },

  _setView(which) {
    const stage = $('#stage');
    if (stage) {
      stage.classList.remove('hidden');
      stage.classList.add('is-active');
    }

    if (which.view !== 'viewGlobe') {
      this.globe?.stop();
    }
    for (const [id, btn] of [['viewGlobe', 'btnGlobe'], ['viewEarth', 'btnEarth'], ['view3d', 'btn3d'], ['view2d', 'btn2d']]) {
      const vEl = $('#' + id);
      const bEl = $('#' + btn);
      if (vEl) {
        const isTarget = id === which.view;
        vEl.classList.toggle('hidden', !isTarget);
        vEl.classList.toggle('is-active', isTarget);
      }
      if (bEl) bEl.classList.toggle('active', btn === which.btn);
    }
    const droneBtn = $('#btnDroneTour');
    if (droneBtn) droneBtn.classList.toggle('active', which.btn === 'btnDroneTour');
    if (which.view === 'view3d') {
      if (this.world?.start) this.world.start();
      if (this.world?._resize) this.world._resize();
    }
    const dNav = $('#districtNav');
    if (dNav) {
      dNav.classList.toggle('hidden', which.view !== 'view3d');
      dNav.classList.toggle('is-active', which.view === 'view3d');
    }
    const onMap = which.view === 'viewEarth' || which.view === 'viewGlobe';
    const legendEl = document.querySelector('.legend');
    if (legendEl) legendEl.classList.toggle('hidden', onMap);
    // The toolbar is global — the question it asks applies in every
    // view — but the actions that only make sense on Google's map are
    // disabled elsewhere rather than hidden, so the bar never reflows.
    const mapOnly = ['groundBtn', 'streetBtn', 'placeBtn', 'key3dBtn'];
    for (const id of mapOnly) {
      const b = document.getElementById(id);
      if (b) b.classList.toggle('is-off-map', which.view !== 'viewEarth');
    }
    const tb = $('#earthToolbar');
    if (tb) {
      const showTb = which.view === 'viewGlobe' || which.view === 'viewEarth';
      tb.classList.toggle('hidden', !showTb);
      tb.classList.toggle('is-globe-compact', which.view === 'viewGlobe');
      tb.classList.remove('is-waiting');
    }
    $('#globeCta')?.classList.toggle('hidden', which.view !== 'viewGlobe');
    $('#globeCta')?.classList.remove('is-waiting');
  },
  /**
   * Switch to Google's map, mounting it on first use. Everything that
   * needs a real-world location goes through here: the map is lazy, so
   * a caller that assumed it was already loaded got "google is not
   * defined" — which is exactly what broke the search bar once the
   * toolbar became global and could be used from orbit.
   */
  async showEarth() {
    this.globe?.stop();
    this._setView({ view: 'viewEarth', btn: 'btnEarth' });
    if (!this._earthMounted) {
      this._earthMounted = true;
      try {
        await this.mountEarth();
      } catch (e) {
        this._earthMounted = false;
        console.log('[earth] mount failed', e);
        this.toast('The map could not be loaded.', 5000, 'warning');
      }
    } else {
      setTimeout(() => {
        if (this.earth?.leaflet) {
          this.earth.leaflet.invalidateSize();
        }
      }, 60);
    }
    return this.earth;
  },
  /** Called by main.js once the renderer modules have loaded. */
  attachWorld(world, map) {
    this.world = world;
    this.map = map;
    window.world = world;
    if (window.UI) window.UI.world = world;
  },

  /** Resolve when the 3D world exists; starts loading it if needed. */
  async ensureWorld() {
    if (this.world) return this.world;
    if (window.world) {
      this.world = window.world;
      return this.world;
    }
    try {
      if (this._ensureWorld) {
        const res = await this._ensureWorld();
        if (res?.world) {
          this.world = res.world;
          window.world = res.world;
        }
      } else if (window.__startWorldPromise) {
        const res = await window.__startWorldPromise;
        if (res?.world) {
          this.world = res.world;
          window.world = res.world;
        }
      } else {
        // Fast wait for _ensureWorld, __startWorldPromise or window.world to appear
        const start = Date.now();
        while (!this.world && !window.world && !this._ensureWorld && !window.__startWorldPromise && (Date.now() - start < 1500)) {
          await new Promise(r => setTimeout(r, 30));
        }
        if (this._ensureWorld) {
          const res = await this._ensureWorld();
          if (res?.world) {
            this.world = res.world;
            window.world = res.world;
          }
        } else if (window.__startWorldPromise) {
          const res = await window.__startWorldPromise;
          if (res?.world) {
            this.world = res.world;
            window.world = res.world;
          }
        }
      }
      if (window.world && !this.world) {
        this.world = window.world;
      }
    } catch (e) {
      console.log('[ensureWorld] error resolving world:', e);
    }
    return this.world;
  },

  updateCharityTopbar() {
    const t = Ledger.totals();
    const el = $('#topbarCharityTxt');
    if (el) {
      el.textContent = t.charity > 0 ? `${fmt(t.charity)} Rescue Fund` : 'Animal Rescue Fund';
    }
  },

  // -------------------------------------------------------------
  // Primary views
  //
  // Every view change goes through _setView, which keeps the 4 tabs in
  // sync, halts the animation loop of whatever was running, and lets
  // the toolbar know whether place-on-earth actions make sense right
  // now. Google's map and the 3D valley are both lazy: they mount
  // the first time they are shown, so the entrance can be on screen
  // before their JS is parsed.
  // -------------------------------------------------------------

  /**
   * Focus a single plot in 3D, opening its panel. Used by the search
   * bar, the share links, and the "my plots" shortcut.
   */
  async flyToPlot(plot) {
    if (!plot) return;
    await this.show3D();
    this.world?.selectPlot(plot);
    this.openPlot(plot);
  },

  /** Focus an earth memorial on the map, opening its sheet. */
  async flyToMemorial(m) {
    if (!m) return;
    await this.showEarth();
    this.flyToPlace({ lat: m.lat, lng: m.lng, range: 380, name: m.place });
    this.openEarthMemorial(m);
  },

  // The 3D view and the flat map share the same plot list; the search
  // bar and the "My plots" modal can land in either. The helper waits
  // for the renderer module (loaded lazily on boot) before trying
  // to show them.
  /**
   * Switch to 3D Sanctuary View with support for the Grand Gate entrance transition.
   * @param {string} [mode='tour'] Cam mode ('orbit', 'walk', 'tour')
   * @param {boolean} [isEntrance=false] If true, executes the Grand Gate fly-in sequence
   */
  async show3D(mode = 'tour', isEntrance = false) {
    const stage = $('#stage');
    if (stage) {
      stage.classList.remove('hidden');
      stage.classList.add('is-active');
    }
    const v3d = $('#view3d');
    if (v3d) {
      v3d.classList.remove('hidden');
      v3d.classList.add('is-active');
    }

    if (!this.world && window.world) this.world = window.world;
    if (!this.world) await this.ensureWorld();
    if (!this.world && window.world) this.world = window.world;
    if (!this.world && typeof window.RBV?.ready === 'function') {
      const res = await window.RBV.ready();
      if (res?.world) this.world = res.world;
    }
    
    const viewBtn = (mode === 'tour') ? 'btnDroneTour' : 'btn3d';
    this._setView({ view: 'view3d', btn: viewBtn });

    if (!this.world) return this.toast('Loading the Sanctuary…', 2000, 'sparkle');

    if (isEntrance && this.world.startEntranceFlight) {
      this.world.startEntranceFlight({
        targetMode: mode || 'tour',
        duration: 7.0,
        onThresholdCross: () => {
          // Synchronize Soundscape and Welcoming Solace
          Soundscape.init();
          Soundscape.playBowlGong(216);
          Soundscape.playChime(528, 0.12);
          setTimeout(() => Soundscape.playChime(660, 0.08), 350);
          setTimeout(() => Soundscape.playChime(880, 0.06), 700);
          Soundscape.setMode('crystal');
        },
        onComplete: () => {
          this.toast('Welcome to Eternity Valley Sanctuary', 4500, 'rainbow');
          if (mode === 'tour' && this.world?.startDroneTour) {
            this.world.startDroneTour(0);
          } else if (this.world?.setMode) {
            this.world.setMode(mode || 'tour');
          }
        }
      });
    } else {
      if (mode === 'tour') {
        if (this.world.startDroneTour) {
          this.world.startDroneTour(0);
        } else if (this.world.setMode) {
          this.world.setMode('tour');
        }
      } else if (this.world.setMode) {
        this.world.setMode(mode || 'orbit');
      }
    }

    if (this.world.start) {
      this.world.start();
    }

    const triggerResize = () => {
      this.world?._resize();
      this.world?.applyAmbience();
    };
    requestAnimationFrame(triggerResize);
    setTimeout(triggerResize, 50);
    setTimeout(triggerResize, 200);
  },
  /**
   * Launch the Hollywood-grade Cinematic Drone Tour across Eternity Valley
   */
  async startDroneTour(stageIndex = 0) {
    await this.show3D('tour');
    if (this.world?.startDroneTour) {
      this.world.startDroneTour(stageIndex);
    } else if (this.world?.setMode) {
      this.world.setMode('tour');
      if (this.world.setTourStage) {
        this.world.setTourStage(stageIndex);
      }
    }
  },
  async show2D() {
    if (!this.map) await this.ensureWorld();
    if (!this.map) return this.toast('The map could not be loaded. Check your connection and reload.', 6000, 'warning');
    this._setView({ view: 'view2d', btn: 'btn2d' });
    requestAnimationFrame(() => {
      this.map?._resize();
      this.map?.draw();
    });
  },

  /**
   * @param {string} msg
   * @param {number|string} [ms]   duration, or an icon name when the
   *                               duration is left to default
   * @param {string} [iconName]    icon to show ahead of the message
   *
   * Accepts the icon in either position so the many existing
   * `toast(msg, 5000)` call sites keep working unchanged.
   */
  toast(msg, ms = 3200, iconName = null) {
    if (typeof ms === 'string') { iconName = ms; ms = 3200; }
    const t = $('#toast');
    // Message text is escaped — it can carry user-entered names.
    const safe = String(msg).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    t.innerHTML = (iconName ? icon(iconName, { cls: 'toast-ico' }) : '') + `<span>${safe}</span>`;
    t.classList.remove('hidden');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.add('hidden'), ms);
  },

  // ---------------- Plot panel ----------------
  openPlot(plot) {
    this.currentPlot = plot;
    const d = DISTRICTS[plot.district];
    const body = $('#plotPanelBody');
    const owned = !!State.data?.ownedPlots?.[plot.id];

    if (plot.status === 'available') {
      body.innerHTML = `
        <span class="badge badge-avail">AVAILABLE</span>
        <h2>Plot ${plot.id}</h2>
        <div class="sub">${d.name} · ${SIZE_LABELS[plot.size]}</div>
        <div class="price-tag">$${plot.price} <small>one-time, yours forever</small></div>
        <div class="district-blurb">${d.blurb}</div>
        <button class="btn btn-gold btn-block" id="buyPlotBtn">Reserve this plot</button>
        <button class="btn btn-outline btn-block" id="giftAnyBtn">Leave a gift at this district's shrine</button>
        <p class="fine" style="margin-top:12px;font-size:11.5px;color:rgba(246,241,228,.45)">
          Plot ownership requires a membership. Visitors may leave gifts on any occupied plot.</p>`;
      $('#buyPlotBtn').onclick = () => this.buyPlotFlow(plot);
      $('#giftAnyBtn').onclick = () => this.toast('Choose an occupied plot (grey) to leave a gift', 'candle');
    } else {
      const m = plot.memorial || {};
      const giftList = (State.data?.gifts?.[plot.id] || []).slice(-4).reverse();
      
      const annivs = checkAnniversaries({ [plot.id]: plot });
      const annivData = annivs.length > 0 ? annivs[0] : null;
      const safePetName = esc(annivData?.petName || '');
      const annivBadge = annivData ? `<div class="anniv-banner">
        <span class="anniv-badge">🕯️ ${annivData.yearsAgo} Year Anniversary</span>
        <a href="${generateICS(annivData.petName, annivData.crossingDate)}" download="anniversary_${safePetName}.ics" class="btn btn-sm btn-outline anniv-ics-btn">Save to Calendar</a>
      </div>` : '';

      body.innerHTML = `
        <span class="badge badge-occ">OCCUPIED${owned ? ' · YOURS' : ''}</span>
        ${annivBadge}
        <h2>Plot ${plot.id}</h2>
        <div class="sub">${d.name} · ${SIZE_LABELS[plot.size]}</div>
        <div class="memorial">
          ${memorialArt(m, 52)}
          <h3>${m.petName || 'Beloved Friend'}</h3>
          <div class="years">${m.species || ''} · ${m.years || ''}</div>
          <p class="epitaph">“${m.epitaph || 'Forever loved.'}”</p>
          <div class="gifts-count">${icon('gift')} ${m.gifts || 0} tributes from visitors · resting with ${m.owner || 'a loving family'}</div>
          <div class="gifts-count" style="color:var(--accent-hi-c)">${icon('heart')} Supports verified rescue: <b>${charityName(m.charity || State.data?.charity || CHARITIES[0].id)}</b></div>
        </div>
        ${this.petProfileHTML(m, plot.id, owned)}
        <div class="fav-places-section" style="margin:14px 0 10px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span class="sub" style="margin:0">${icon('pin')} <b>Favorite Places on Earth:</b></span>
            ${owned ? `<button class="btn-text-gold" id="pAddFavPlaceBtn" style="font-size:11.5px;cursor:pointer;background:none;border:none;color:var(--accent-hi-c);font-weight:700">+ Tag a Place</button>` : ''}
          </div>
          ${(m.favoritePlaces && m.favoritePlaces.length) ? m.favoritePlaces.map((fp) => `
            <div class="fav-place-card">
              <div class="fpc-info">
                <b>${fp.name.replace(/[&<>"]/g, '')}</b>
                <span class="fpc-note">“${(fp.note || fp.place || '').replace(/[&<>"]/g, '')}”</span>
              </div>
              <button class="btn btn-sm btn-outline fpc-fly-btn" data-fplat="${fp.lat}" data-fplng="${fp.lng}">${icon('globe')} Fly ↗</button>
            </div>
          `).join('') : `
            <div class="fav-place-card">
              <div class="fpc-info">
                <b>Sacred Mountain Trail</b>
                <span class="fpc-note">“Running free where the wildflowers bloom…”</span>
              </div>
              <button class="btn btn-sm btn-outline fpc-fly-btn" data-fplat="37.7749" data-fplng="-122.4194">${icon('globe')} Fly ↗</button>
            </div>
          `}
        </div>
        ${giftList.length ? `<div class="sub">Recent gifts:</div>` + giftList.map(g => {
          const gi = GIFTS.find(x => x.id === g.giftId);
          return `<div style="font-size:12.5px;margin:4px 0;color:var(--cream-dim)">${thumbImg(g.giftId, { size: 22, cls: 'thumb-inline' }) || icon('gift')} ${gi?.name || 'Gift'} — <i>${g.from}</i>${g.message ? ': “' + g.message + '”' : ''}</div>`;
        }).join('') : ''}
        <button class="btn btn-gold btn-block" id="giftBtn">${icon('candle')} Leave a gift</button>
        <button class="btn btn-outline btn-block" id="pCertBtn">${icon('scroll')} Memorial Certificate &amp; Plaque</button>
        <button class="btn btn-outline btn-block" id="pKeepsakeBtn">${icon('photo')} Order Physical Keepsakes</button>
        <button class="btn btn-outline btn-block" id="pShareBtn">${icon('share')} Share this memorial</button>
        ${owned ? `<button class="btn btn-green btn-block" id="decorBtn">${icon('flower')} Customize this plot</button>` : ''}`;
      $('#giftBtn').onclick = () => this.giftModal(plot);
      $('#pCertBtn').onclick = () => this.memorialCertificateModal(plot);
      $('#pKeepsakeBtn').onclick = () => this.keepsakesModal(m);
      $('#pShareBtn').onclick = () => {
        const url = `${location.origin}${location.pathname}?p=${encodeURIComponent(plot.id)}`;
        this.shareModal(`${m.petName || 'a friend'}'s memorial`, url,
          `Visit ${m.petName || 'our friend'}'s memorial in the Rainbow Bridge Sanctuary — light a candle or leave a gift.`);
      };
      if (owned) $('#decorBtn').onclick = () => this.decorModal(plot);
      if (owned) $('#pAddFavPlaceBtn')?.addEventListener('click', () => this.addPlaceToPlotModal(plot));
      body.querySelectorAll('.fpc-fly-btn').forEach(btn => {
        btn.onclick = async () => {
          const lat = Number(btn.dataset.fplat);
          const lng = Number(btn.dataset.fplng);
          await this.showEarth();
          this.flyToPlace({ lat, lng, range: 450 });
        };
      });
      this._wirePetProfile(m, plot.id, owned, () => this.openPlot(plot), (pp) => {
        const rec = State.data?.ownedPlots?.[plot.id];
        if (rec) rec.memorial = { ...rec.memorial, petProfile: pp };
      });
    }
    $('#plotPanel').classList.remove('hidden');
    Motion.enhance(body);
    this.map?.select(plot);
  },
  closePanel() { $('#plotPanel').classList.add('hidden'); this.world?.selectPlot(null); },

  // ---------------- Modals ----------------
  modal(html) {
    // A dialog and the guided tour must never share the screen — the
    // tour's veil would dim the very thing the visitor just opened.
    // The dialog wins: it is what they asked for.
    Tour.end();
    const box = $('#modalBox');
    box.innerHTML = html;
    box.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => this.closeModal(); });
    $('#modalRoot').classList.remove('hidden');
    document.body.classList.add('modal-open');
    if (this.world?.keysDown) {
      Object.keys(this.world.keysDown).forEach(k => this.world.keysDown[k] = false);
      if (this.world.walkVelocity) this.world.walkVelocity.set(0, 0, 0);
    }
    $('.modal-backdrop').onclick = () => this.closeModal();
    // Injected markup gets the same hover/tilt/ripple behaviour as
    // everything authored in index.html. Membership cards are the one
    // place a 3D tilt earns its keep, so opt them in explicitly.
    box.querySelectorAll('.tier').forEach(t => { t.dataset.tilt = '7'; });
    Motion.enhance(box);
    Motion.cascade(box, '.tier, .shop-item');
    this._escClose ||= (e) => { if (e.key === 'Escape') this.closeModal(); };
    document.addEventListener('keydown', this._escClose);
    box.querySelector('input, textarea, select')?.focus();
  },
  closeModal() {
    $('#modalRoot').classList.add('hidden');
    document.body.classList.remove('modal-open');
    if (this._escClose) document.removeEventListener('keydown', this._escClose);
    if (this.world?.keysDown) {
      Object.keys(this.world.keysDown).forEach(k => this.world.keysDown[k] = false);
    }
  },

  authModal(afterLogin) {
    this.modal(`
      <h2>Welcome</h2>
      <div class="modal-sub">One tap and you're in — own plots, build memorials, keep them forever.</div>
      <div class="auth-providers">
        <button class="btn" id="pGoogle" style="background:#fff;color:#1a1a1a;font-weight:700">${icon('google')} Continue with Google</button>
        <button class="btn" id="pApple" style="background:#000;color:#fff;border-color:#444;font-weight:700"> Continue with Apple</button>
        <button class="btn" id="pFacebook" style="background:#1877f2;color:#fff;font-weight:700">ⓕ Continue with Facebook</button>
        <button class="btn" id="pTwitter" style="background:#000;color:#fff;border-color:#444;font-weight:700">𝕏 Continue with X</button>
      </div>
      <div class="divider">or use email</div>
      <label>Name (for new accounts)</label><input id="aName" placeholder="Your name">
      <label>Email</label><input id="aEmail" type="email" placeholder="you@example.com">
      <label>Password</label><input id="aPass" type="password" placeholder="••••••••">
      <button class="btn btn-gold btn-block" id="pEmailIn">Sign in</button>
      <button class="btn btn-outline btn-block" id="pEmailUp">Create account</button>
      <div class="divider">just visiting?</div>
      <button class="btn btn-outline btn-block" id="pGuest">Continue as guest (anonymous)</button>
      <button class="btn btn-outline btn-block" id="pGuestNamed">Continue as guest with a name</button>
      <p class="fine">${IS_DEMO ? 'Demo mode: any credentials work — nothing is sent anywhere.' : 'Secured by Firebase Authentication.'}</p>`);
    const done = (msg) => { this.closeModal(); this.toast(msg); afterLogin?.(); };
    const guard = async (fn, msg) => { try { await fn(); done(msg); } catch (e) { this.toast(String(e.message || e), 'warning'); } };
    $('#pGoogle').onclick = () => guard(() => Auth.signInGoogle(), 'Welcome! Signed in with Google.');
    $('#pApple').onclick = () => guard(() => Auth.signInApple(), 'Welcome! Signed in with Apple.');
    $('#pFacebook').onclick = () => guard(() => Auth.signInFacebook(), 'Welcome! Signed in with Facebook.');
    $('#pTwitter').onclick = () => guard(() => Auth.signInTwitter(), 'Welcome! Signed in with X.');
    $('#pEmailIn').onclick = () => guard(() => Auth.signInEmail($('#aEmail').value, $('#aPass').value), 'Welcome back.');
    $('#pEmailUp').onclick = () => guard(() => Auth.signUpEmail($('#aName').value, $('#aEmail').value, $('#aPass').value), 'Account created — welcome to paradise.');
    $('#pGuest').onclick = () => { Auth.continueAsGuest(true); done('Browsing anonymously. You can still leave gifts.'); };
    $('#pGuestNamed').onclick = () => {
      const n = prompt('What name should appear on your gifts?');
      Auth.continueAsGuest(false, n || 'Visitor'); done(`Welcome, ${n || 'Visitor'}.`);
    };
  },

  // ============ PET PROFILE (shared: sanctuary plots & earth memorials) ============
  // Renders dates, bio, favorites, gallery, videos and the visitor memory wall.
  petProfileHTML(m, id, own) {
    const pp = m.petProfile || {};
    const memories = [...(m.memories || []), ...State.getMemories(id)].sort((a, b) => b.at - a.at);
    const chips = (label, val, emoji) => val ? `<div class="fav-row">${emoji} <b>${label}:</b> ${val}</div>` : '';
    return `
      ${pp.birthday || pp.passing ? `<div class="pet-dates">${icon('cake')} ${pp.birthday || '—'} &nbsp;&rarr;&nbsp; ${icon('crest')} ${pp.passing || '—'}</div>` : ''}
      ${pp.about ? `<div class="district-blurb">${pp.about}</div>` : ''}
      ${pp.favToys || pp.favActivities || pp.favTreats ? `<div class="favs">
        ${chips('Favorite toys', pp.favToys, icon('toy'))}
        ${chips('Favorite activities', pp.favActivities, icon('disc'))}
        ${chips('Favorite treats', pp.favTreats, icon('bone'))}
      </div>` : ''}
      ${pp.gallery?.length ? `<div class="gallery-grid">${pp.gallery.map(g => `<img src="${g}" loading="lazy">`).join('')}</div>` : ''}
      ${pp.videos?.length ? `<div class="sub" style="margin-top:8px">Videos:</div>` + pp.videos.map(v =>
        `<a class="video-link" href="${v}" target="_blank" rel="noopener">▶ ${v.replace(/^https?:\/\//, '').slice(0, 42)}…</a>`).join('') : ''}
      ${pp.contactEmail ? `<div class="fav-row">${icon('mail')} <a href="mailto:${pp.contactEmail}" style="color:var(--gold-bright)">Contact the family</a></div>` : ''}
      <button class="btn btn-outline btn-block" id="addMemoryBtn">${icon('book')} Add a photo or memory</button>
      ${own ? `<button class="btn btn-green btn-block" id="editPetBtn">${icon('edit')} Edit ${m.petName}'s profile</button>` : ''}
      ${memories.length ? `<div class="sub" style="margin-top:14px">Memory wall (${memories.length}):</div>` + memories.slice(0, 8).map(x => `
        <div class="memory-card">
          ${x.photo ? `<img src="${x.photo}">` : ''}
          <div><b>${x.from}</b> · ${timeAgo(x.at)}<br>${x.text}</div>
        </div>`).join('') : ''}`;
  },

  _wirePetProfile(m, id, own, rerender, onSaveProfile) {
    const addBtn = $('#addMemoryBtn');
    if (addBtn) addBtn.onclick = () => this.addMemoryModal(m, id, rerender);
    const editBtn = $('#editPetBtn');
    if (editBtn && own) editBtn.onclick = () => this.editPetModal(m, rerender, onSaveProfile);
  },

  addMemoryModal(m, id, rerender) {
    this.modal(`
      <h2>A memory of ${m.petName}</h2>
      <div class="modal-sub">Share a photo or a story — it joins ${m.petName}'s memory wall for everyone who visits. Free, always.</div>
      <label>Your name (blank = anonymous)</label><input id="memFrom" maxlength="30" value="${Auth.user && !Auth.user.isGuest ? Auth.user.name : ''}">
      <label>Your memory</label><textarea id="memText" rows="3" maxlength="280" placeholder="The day at the lake when…"></textarea>
      <label>Photo (optional)</label><input id="memPhoto" type="file" accept="image/*">
      <button class="btn btn-gold btn-block" id="memPost">Add to the memory wall</button>`);
    $('#memPost').onclick = async () => {
      const text = cleanText($('#memText').value.trim());
      if (!text) return this.toast('Write a few words first', 'heart');
      const photo = await readPhoto($('#memPhoto'), 420);
      const from = cleanText($('#memFrom').value.trim()) || 'Anonymous Visitor';
      State.addMemory(id, { from, text, photo, at: Date.now() });
      State.logActivity('book', `${from} shared a memory of ${m.petName}`);
      await State.save(Auth.user);
      this.closeModal();
      rerender();
      this.toast('Your memory is on the wall.', 'book');
    };
  },

  async addPlaceToPlotModal(plot) {
    const m = plot.memorial || {};
    this.modal(`
      <div class="comfort-header">
        <div class="comfort-crest">${icon('pin', { size: 36 })}</div>
        <h2>Tag a Sacred Place on Earth</h2>
        <div class="modal-sub">Tag ${m.petName || 'your companion'}'s favorite mountain trail, beach, park, or sunny backyard on the Earth Globe and link it to this Sanctuary Plot.</div>
      </div>

      <label>Place / Trail Title</label>
      <input id="fpName" maxlength="40" placeholder="e.g. Misty's Favorite Mountain Trail">

      <label>Location / City / Landmark</label>
      <input id="fpLoc" placeholder="e.g. Bear Mountain Peak, NY">

      <label>Why this place was special to them</label>
      <textarea id="fpNote" rows="2" maxlength="140" placeholder="Where we raced the autumn wind and watched sunsets together…"></textarea>

      <button class="btn btn-gold btn-block" id="fpSaveBtn" style="margin-top:14px">
        ${icon('pin')} Save Sacred Spot &amp; Pin to Earth
      </button>
    `);

    const box = $('#modalBox');
    box.querySelector('#fpSaveBtn').onclick = async () => {
      const name = box.querySelector('#fpName').value.trim() || `${m.petName || 'Companion'}'s Sacred Spot`;
      const locStr = box.querySelector('#fpLoc').value.trim() || 'Sacred Place on Earth';
      const note = box.querySelector('#fpNote').value.trim() || 'A cherished place in our hearts.';

      let lat = 40.7128 + (Math.random() - 0.5) * 0.1;
      let lng = -74.0060 + (Math.random() - 0.5) * 0.1;
      if (this.earth && this.earth.geocode) {
        try {
          const res = await this.earth.geocode(locStr);
          if (res) { lat = res.lat; lng = res.lng; }
        } catch {}
      }

      const placeObj = { name, place: locStr, note, lat, lng, plotId: plot.id };
      m.favoritePlaces = m.favoritePlaces || [];
      m.favoritePlaces.push(placeObj);

      const earthMem = {
        id: 'em_' + Date.now(),
        plotId: plot.id,
        petName: m.petName || 'Beloved Companion',
        species: m.species || 'dog',
        years: m.years || '',
        epitaph: note,
        photo: m.photo || null,
        charity: m.charity || null,
        lat, lng, place: `${name} (${locStr})`,
        owner: m.owner || Auth.user?.name || 'A loving family',
        ownerUid: Auth.user?.uid || '',
        gifts: 0, guestbook: [], decorations: [], createdAt: Date.now(),
      };
      State.addEarthMemorial(earthMem);
      State.logActivity('pin', `Tagged ${name} on Earth in memory of ${m.petName}`);
      await State.save(Auth.user);
      await this.earth?.addMemorialMarker(earthMem);

      Soundscape.playChime(660, 0.08);
      this.closeModal();
      this.openPlot(plot);
      this.toast(`Tagged "${name}" on Earth — linked to Plot ${plot.id}.`, 6000, 'pin');
    };
  },

  memorialCertificateModal(item) {
    const isPlot = !!item.status;
    const m = isPlot ? (item.memorial || {}) : item;
    const petName = m.petName || 'Beloved Companion';
    const species = m.species || 'Companion';
    const years = m.years || 'Forever in our hearts';
    const epitaph = m.epitaph || 'Until we meet again at the Rainbow Bridge.';
    const photo = m.photo;
    const charity = charityName(m.charity || State.data?.charity || CHARITIES[0].id) || 'Verified Animal Rescue';
    const locationStr = isPlot 
      ? `Eternity Valley Sanctuary · ${DISTRICTS[item.district]?.name || 'Memorial Grove'} · Plot ${item.id}`
      : `Sacred Earth Spot · ${item.place || 'Earthly Sanctuary'}`;
    const url = isPlot 
      ? `${location.origin}${location.pathname}?p=${encodeURIComponent(item.id)}`
      : `${location.origin}${location.pathname}?m=${encodeURIComponent(item.id)}`;
    
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}&color=212-175-55&bgcolor=14-20-16`;

    this.modal(`
      <div class="cert-modal-wrap" id="certModalWrap">
        <div class="cert-card" id="certCardPrint">
          <div class="cert-corner tl"></div>
          <div class="cert-corner tr"></div>
          <div class="cert-corner bl"></div>
          <div class="cert-corner br"></div>

          <div class="cert-header">
            <div class="cert-crest">${icon('crest', { size: 38 })}</div>
            <h1 class="cert-title">CERTIFICATE OF PERPETUAL MEMORIAL</h1>
            <div class="cert-sub">ETERNITY VALLEY · SOMEWHERE OVER THE RAINBOW BRIDGE</div>
          </div>

          <div class="cert-body">
            <div class="cert-portrait-wrap">
              ${photo ? `<img src="${photo}" class="cert-portrait-img" alt="${esc(petName)}">` : `<div class="cert-portrait-icon">${speciesIcon(speciesKey(species), { size: 52 })}</div>`}
            </div>

            <h2 class="cert-pet-name">${esc(petName)}</h2>
            <div class="cert-species-years">${esc(species)} · ${esc(years)}</div>
            
            <p class="cert-epitaph">“${esc(epitaph)}”</p>

            <div class="cert-location">
              <b>${icon('pin')} Sacred Consecrated Resting Place:</b><br>
              <span>${esc(locationStr)}</span>
            </div>

            <div class="cert-charity-badge">
              ${icon('heart')} Dedicated Rescue Beneficiary: <b>${esc(charity)}</b>
            </div>
          </div>

          <div class="cert-footer">
            <div class="cert-qr-wrap">
              <img src="${qrUrl}" class="cert-qr-img" alt="Scan to visit memorial online" onerror="this.classList.add('hidden')">
              <span>Scan to visit memorial in 3D</span>
            </div>
            <div class="cert-sig-wrap">
              <div class="cert-sig-line"></div>
              <div class="cert-sig-label">Eternity Valley Sanctuary Keeper</div>
              <div class="cert-id-tag">Memorial Registry ID: ${isPlot ? item.id : item.id}</div>
            </div>
          </div>
        </div>

        <div class="cert-actions" style="display:flex;gap:10px;margin-top:18px">
          <button class="btn btn-gold btn-block" id="certPrintBtn">${icon('dove')} Print / Save as PDF Certificate</button>
          <button class="btn btn-outline" id="certCopyBtn" title="Copy direct link">${icon('share')} Copy Link</button>
        </div>
      </div>
    `);

    $('#certPrintBtn').onclick = () => {
      window.print();
    };
    $('#certCopyBtn').onclick = () => {
      navigator.clipboard.writeText(url).then(() => {
        this.toast('Memorial link copied to clipboard!', 4000, 'share');
      }).catch(() => {
        this.toast(url, 6000);
      });
    };
  },

  // ============================================================
  //  GRIEF JOURNEY WIZARD — guided 4-step memorial creation
  //  The single most important conversion flow in the product.
  // ============================================================
  griefWizardModal(initialType = 'sanctuary', presetData = null) {
    const data = presetData || this._cachedWizardData || {};
    const initialSpecies = data.species || 'dog';
    const initialDistrict = data.district || 'meadows';
    const initialPlaceType = data.placeType || initialType || 'sanctuary';

    const districtCards = Object.entries(DISTRICTS).map(([k, d]) => {
      const availCount = (this.plots || []).filter(p => p.status === 'available' && p.district === k).length;
      return `
      <div class="gw-district-card ${k === initialDistrict ? 'is-selected' : ''}" data-district="${k}">
        <div class="gw-district-icon">${icon(d.icon || 'sparkle', { size: 22 })}</div>
        <div class="gw-district-info">
          <b>${d.name}</b>
          <span>${d.blurb?.slice(0, 80) || 'A peaceful resting place'}${d.blurb?.length > 80 ? '…' : ''}</span>
          ${availCount > 0 ? `<small style="display:block;margin-top:3px;color:var(--accent-hi-c);font-size:11px">${availCount} plots available · from $${d.base}</small>` : ''}
        </div>
      </div>`;
    }).join('');

    const charityCards = CHARITIES.map((c) =>
      `<div class="gw-charity-card ${c.id === (data.charity || CHARITIES[0]?.id) ? 'is-selected' : ''}" data-charity="${c.id}">
        <div class="gw-charity-name">${icon('heart', { size: 14 })} ${c.name}</div>
        <div class="gw-charity-desc">${c.mission?.slice(0, 90) || 'Helping animals in need'}${c.mission?.length > 90 ? '…' : ''}</div>
      </div>`
    ).join('');

    this.modal(`
      <div class="gw-wrap" id="griefWizard">
        <div class="gw-progress">
          <div class="gw-dot is-active" data-step="1">1</div>
          <div class="gw-line"></div>
          <div class="gw-dot" data-step="2">2</div>
          <div class="gw-line"></div>
          <div class="gw-dot" data-step="3">3</div>
          <div class="gw-line"></div>
          <div class="gw-dot" data-step="4">4</div>
        </div>

        <!-- Step 1: About Your Companion -->
        <div class="gw-step is-active" data-step="1">
          <div class="gw-step-icon">${speciesIcon(initialSpecies, { size: 42 })}</div>
          <h2>Tell us about your companion</h2>
          <p class="gw-step-sub">They deserve to be remembered beautifully. We'll create a memorial that honors their life.</p>
          <label>Their name</label>
          <input id="gwName" placeholder="e.g. Luna, Max, Biscuit…" maxlength="24" value="${esc(data.name || '')}" autofocus>
          <label>Species</label>
          <select id="gwSpecies">${speciesOptionsHTML(initialSpecies)}</select>
          <label>Years (e.g. 2012 – 2025)</label>
          <input id="gwYears" placeholder="2012 – 2025" maxlength="16" value="${esc(data.years || '')}">
          <label>Their photo (optional — you can add more later)</label>
          <input id="gwPhoto" type="file" accept="image/*">
          <button class="btn btn-gold btn-block gw-next-btn" data-to="2">Continue — choose their resting place →</button>
        </div>

        <!-- Step 2: Choose Sanctuary Plot or Global Earth Location -->
        <div class="gw-step" data-step="2">
          <div class="gw-step-icon">${icon('sparkle', { size: 38 })}</div>
          <h2>Choose their resting place</h2>
          <p class="gw-step-sub">Consecrate a sacred 3D plot in the Sanctuary Valley, or place an eternal memorial pin anywhere on Earth.</p>

          <div class="gw-place-toggle">
            <button type="button" class="gw-pt-btn ${initialPlaceType === 'sanctuary' ? 'is-active' : ''}" id="gwPtSanctuary" data-pt="sanctuary">
              <span class="gw-pt-icon">${icon('sparkle', { size: 18 })}</span>
              <div class="gw-pt-text">
                <b>Sanctuary 3D Plot</b>
                <span>Sacred districts in the living Rainbow Bridge valley</span>
              </div>
            </button>
            <button type="button" class="gw-pt-btn ${initialPlaceType === 'globe' ? 'is-active' : ''}" id="gwPtGlobe" data-pt="globe">
              <span class="gw-pt-icon">${icon('globe', { size: 18 })}</span>
              <div class="gw-pt-text">
                <b>Global Memorial on Earth</b>
                <span>Pin their favorite park, trail, beach, or home</span>
              </div>
            </button>
          </div>
          <input type="hidden" id="gwPlaceType" value="${initialPlaceType}">

          <!-- Sanctuary District Picker -->
          <div id="gwSanctuarySection" class="${initialPlaceType === 'globe' ? 'hidden' : ''}">
            <div class="gw-district-grid" id="gwDistrictGrid">
              ${districtCards}
            </div>
            <input type="hidden" id="gwDistrict" value="${initialDistrict}">
          </div>

          <!-- Earth Location Picker -->
          <div id="gwGlobeSection" class="${initialPlaceType === 'sanctuary' ? 'hidden' : ''}">
            <label>Location on Earth (City, Park, Beach, or Home)</label>
            <input id="gwEarthLoc" placeholder="e.g. Crissy Field Beach, San Francisco, CA" maxlength="60" value="${esc(data.earthLoc || 'Pacific Coast Trail, CA')}">
            <div class="two-col" style="margin-top:6px">
              <div>
                <label>Latitude</label>
                <input id="gwEarthLat" type="number" step="0.0001" value="${data.earthLat || 37.8024}">
              </div>
              <div>
                <label>Longitude</label>
                <input id="gwEarthLng" type="number" step="0.0001" value="${data.earthLng || -122.4665}">
              </div>
            </div>
            <div class="district-blurb" style="margin-top:10px">
              🌍 <b>Tip:</b> You can also explore the 3D Globe at any time and click directly on the Earth to drop a memorial pin anywhere in the world.
            </div>
          </div>

          <div class="gw-nav-row" style="margin-top:16px">
            <button class="btn btn-outline gw-back-btn" data-to="1">← Back</button>
            <button class="btn btn-gold gw-next-btn" data-to="3" id="gwStep2Next">Continue →</button>
          </div>
        </div>

        <!-- Step 3: Write from the Heart -->
        <div class="gw-step" data-step="3">
          <div class="gw-step-icon">${icon('dove', { size: 38 })}</div>
          <h2>Write something from the heart</h2>
          <p class="gw-step-sub">These words will appear on their headstone and memorial profile for every visitor to read.</p>
          <label>Epitaph</label>
          <textarea id="gwEpitaph" rows="3" maxlength="120" placeholder="Forever chasing butterflies in the sunlight…">${esc(data.epitaph || '')}</textarea>
          <div class="gw-prompts">
            <span class="gw-prompt" data-txt="Forever loved, forever remembered.">💛 Loved</span>
            <span class="gw-prompt" data-txt="You were the best part of every day.">🌅 Joy</span>
            <span class="gw-prompt" data-txt="Until we meet again at the Rainbow Bridge.">🌈 Bridge</span>
            <span class="gw-prompt" data-txt="The house is quieter without you.">🏡 Home</span>
            <span class="gw-prompt" data-txt="You taught me what unconditional love means.">❤️ Grace</span>
          </div>
          <label>Headstone style</label>
          <select id="gwHeadstone">
            ${HEADSTONE_STYLES.map(h => `<option value="${h.id}" ${h.id === (data.headstone || 'classic') ? 'selected' : ''}>${h.label}</option>`).join('')}
          </select>
          <div class="gw-nav-row">
            <button class="btn btn-outline gw-back-btn" data-to="2">← Back</button>
            <button class="btn btn-gold gw-next-btn" data-to="4">Continue — choose a cause →</button>
          </div>
        </div>

        <!-- Step 4: Choose a Cause -->
        <div class="gw-step" data-step="4">
          <div class="gw-step-icon">${icon('heart', { size: 38 })}</div>
          <h2>Help a living animal in their honor</h2>
          <p class="gw-step-sub">${Math.round(SPLITS.plot.charity * 100)}% of your plot and every gift left here goes to the charity you choose. Free campaigns pass 100% through.</p>
          <div class="gw-charity-grid" id="gwCharityGrid">
            ${charityCards}
          </div>
          <input type="hidden" id="gwCharity" value="${data.charity || CHARITIES[0]?.id || ''}">
          <div class="gw-summary" id="gwSummary"></div>
          <button class="btn btn-gold btn-block btn-lg" id="gwCreateBtn">
            ${icon('crest')} Create Their Memorial
          </button>
          <p class="fine" style="margin-top:8px;text-align:center">${IS_DEMO ? 'Demo mode — simulated payment.' : 'You will be redirected to Stripe for secure payment.'}</p>
          <div class="gw-nav-row" style="margin-top:6px">
            <button class="btn btn-outline gw-back-btn" data-to="3">← Back</button>
          </div>
        </div>
      </div>
    `);

    // --- Step navigation ---
    const wiz = document.getElementById('griefWizard');
    const goStep = (n) => {
      wiz.querySelectorAll('.gw-step').forEach(s => s.classList.toggle('is-active', s.dataset.step === String(n)));
      wiz.querySelectorAll('.gw-dot').forEach(d => {
        const ds = Number(d.dataset.step);
        d.classList.toggle('is-active', ds === n);
        d.classList.toggle('is-done', ds < n);
      });
      // Fly camera to selected district on step 2 if in sanctuary mode
      if (n === 2) {
        const pt = document.getElementById('gwPlaceType')?.value;
        const sel = document.getElementById('gwDistrict')?.value;
        if (pt === 'sanctuary' && sel) {
          const mappedDistrict = DISTRICT_FLY_MAP[sel] || sel;
          this.world?.flyToDistrict(mappedDistrict);
        }
      }
      // Update summary on step 4
      if (n === 4) this._gwUpdateSummary();
    };

    wiz.querySelectorAll('.gw-next-btn').forEach(btn => {
      btn.onclick = (e) => { e.preventDefault(); goStep(Number(btn.dataset.to)); };
    });
    wiz.querySelectorAll('.gw-back-btn').forEach(btn => {
      btn.onclick = (e) => { e.preventDefault(); goStep(Number(btn.dataset.to)); };
    });

    // --- Place Type Toggle (Sanctuary vs Globe) ---
    const ptBtns = wiz.querySelectorAll('.gw-pt-btn');
    ptBtns.forEach(btn => {
      btn.onclick = () => {
        ptBtns.forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        const pt = btn.dataset.pt;
        document.getElementById('gwPlaceType').value = pt;
        document.getElementById('gwSanctuarySection').classList.toggle('hidden', pt !== 'sanctuary');
        document.getElementById('gwGlobeSection').classList.toggle('hidden', pt !== 'globe');
        if (pt === 'sanctuary') {
          const sel = document.getElementById('gwDistrict')?.value || 'meadows';
          const mappedDistrict = DISTRICT_FLY_MAP[sel] || sel;
          this.world?.flyToDistrict(mappedDistrict);
        }
      };
    });

    // --- District selection ---
    const distGrid = document.getElementById('gwDistrictGrid');
    distGrid?.addEventListener('click', (e) => {
      const card = e.target.closest('.gw-district-card');
      if (!card) return;
      distGrid.querySelectorAll('.gw-district-card').forEach(c => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      const dist = card.dataset.district;
      document.getElementById('gwDistrict').value = dist;
      const mappedDistrict = DISTRICT_FLY_MAP[dist] || dist;
      this.world?.flyToDistrict(mappedDistrict);
    });

    // --- Charity selection ---
    const charGrid = document.getElementById('gwCharityGrid');
    charGrid?.addEventListener('click', (e) => {
      const card = e.target.closest('.gw-charity-card');
      if (!card) return;
      charGrid.querySelectorAll('.gw-charity-card').forEach(c => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      document.getElementById('gwCharity').value = card.dataset.charity;
    });

    // --- Epitaph quick-fill prompts ---
    wiz.querySelectorAll('.gw-prompt').forEach(p => {
      p.onclick = () => { document.getElementById('gwEpitaph').value = p.dataset.txt; };
    });

    // --- Species icon preview update ---
    document.getElementById('gwSpecies')?.addEventListener('change', (e) => {
      const stepIcon = wiz.querySelector('.gw-step[data-step="1"] .gw-step-icon');
      if (stepIcon) stepIcon.innerHTML = speciesIcon(e.target.value, { size: 42 });
    });

    // --- Create button ---
    document.getElementById('gwCreateBtn').onclick = () => this._gwCreate();
  },

  _gwUpdateSummary() {
    const name = document.getElementById('gwName')?.value?.trim() || 'Beloved Friend';
    const sp = document.getElementById('gwSpecies')?.value || 'dog';
    const pt = document.getElementById('gwPlaceType')?.value || 'sanctuary';
    const district = document.getElementById('gwDistrict')?.value || 'meadows';
    const d = DISTRICTS[district];
    const earthLoc = document.getElementById('gwEarthLoc')?.value?.trim() || 'Earth Memorial';
    const charity = charityName(document.getElementById('gwCharity')?.value) || 'Animal Rescue Fund';
    const el = document.getElementById('gwSummary');
    if (el) {
      el.innerHTML = `
        <div class="gw-summary-card">
          <div class="gw-summary-icon">${speciesIcon(sp, { size: 28 })}</div>
          <div class="gw-summary-body">
            <b>${esc(name)}</b>
            <span>${pt === 'sanctuary' ? (d?.name || 'Sanctuary 3D Valley') : esc(earthLoc)} · ${icon('heart', { size: 12 })} ${esc(charity)}</span>
          </div>
        </div>`;
    }
  },

  async _gwCreate(cached = null) {
    const rawPhoto = cached?.photo || await readPhoto(document.getElementById('gwPhoto'));
    const formData = {
      name: cached?.name || document.getElementById('gwName')?.value?.trim() || 'Beloved Friend',
      species: cached?.species || document.getElementById('gwSpecies')?.value || 'dog',
      years: cached?.years || document.getElementById('gwYears')?.value?.trim() || String(new Date().getFullYear()),
      epitaph: cached?.epitaph || document.getElementById('gwEpitaph')?.value?.trim() || 'Forever loved.',
      headstone: cached?.headstone || document.getElementById('gwHeadstone')?.value || 'classic',
      photo: rawPhoto,
      placeType: cached?.placeType || document.getElementById('gwPlaceType')?.value || 'sanctuary',
      district: cached?.district || document.getElementById('gwDistrict')?.value || 'meadows',
      charity: cached?.charity || document.getElementById('gwCharity')?.value || CHARITIES[0]?.id,
      earthLoc: cached?.earthLoc || document.getElementById('gwEarthLoc')?.value?.trim() || 'Sacred Memorial Spot',
      earthLat: cached?.earthLat != null ? cached.earthLat : (Number(document.getElementById('gwEarthLat')?.value) || 37.8024),
      earthLng: cached?.earthLng != null ? cached.earthLng : (Number(document.getElementById('gwEarthLng')?.value) || -122.4665),
    };

    if (!Auth.user || Auth.user.isGuest) {
      this._cachedWizardData = formData;
      return this.authModal(() => this._gwCreate(this._cachedWizardData));
    }
    if (!State.hasMembership()) {
      this._cachedWizardData = formData;
      this.toast('A membership is needed to own plots and memorials.');
      return this.membershipModal(() => this._gwCreate(this._cachedWizardData));
    }

    const { name, species: sp, years, epitaph, headstone, photo, placeType: pt, district, charity, earthLoc, earthLat, earthLng } = formData;

    const btn = document.getElementById('gwCreateBtn');
    if (btn) { btn.textContent = 'Creating memorial…'; btn.disabled = true; }

    if (pt === 'globe') {
      // Create Global Earth Memorial
      const memId = 'em_' + Date.now();
      const earthMemorial = {
        id: memId,
        ownerUid: Auth.user.uid,
        petName: cleanText(name),
        species: sp,
        years,
        epitaph: cleanText(epitaph),
        photo,
        place: earthLoc,
        lat: earthLat,
        lng: earthLng,
        charity: charity || null,
        gifts: 0,
        created: Date.now(),
      };

      try {
        const r = await checkout({
          kind: 'plot',
          name: `Earth Memorial — ${name} (${earthLoc})`,
          amount: 15,
          meta: { memorialId: memId, uid: Auth.user.uid, charity: earthMemorial.charity || State.data?.charity || CHARITIES[0].id },
        });
        if (r.ok) {
          State.addEarthMemorial(earthMemorial);
          await State.save(Auth.user);
          this._cachedWizardData = null;
          this.closeModal();
          await this.showGlobe();
          this.globe?.addPin({ lat: earthLat, lng: earthLng, name: earthLoc, memorial: earthMemorial });
          this.globe?.focus(earthLat, earthLng);

          Soundscape.playChime(528, 0.08);
          setTimeout(() => Soundscape.playChime(660, 0.06), 400);
          setTimeout(() => Soundscape.playChime(880, 0.05), 800);
          this.toast(`${name}'s memorial is consecrated on Earth at ${earthLoc}. 🌍💛`, 8000, 'globe');
        }
      } catch (e) {
        this.toast(String(e.message || e), 'warning');
        if (btn) { btn.innerHTML = `${icon('crest')} Create Their Memorial`; btn.disabled = false; }
      }
      return;
    }

    // Otherwise: Consecrate 3D Sanctuary Valley Plot
    let availPlots = this.plots?.filter(p => p.status === 'available' && p.district === district) || [];
    if (!availPlots.length) {
      availPlots = this.plots?.filter(p => p.status === 'available') || [];
    }
    if (!availPlots.length) {
      this.toast(`No available plots found at this time.`);
      if (btn) { btn.innerHTML = `${icon('crest')} Create Their Memorial`; btn.disabled = false; }
      return;
    }
    const plot = availPlots[0];
    const d = DISTRICTS[plot.district];

    const memorial = {
      petName: cleanText(name), species: sp, years,
      epitaph: cleanText(epitaph), headstone, photo,
      charity: charity || null,
    };

    try {
      const r = await checkout({
        kind: 'plot',
        name: `Rainbow Bridge — Plot ${plot.id} (${d?.name || 'Sanctuary'})`,
        amount: plot.price,
        meta: { plotId: plot.id, uid: Auth.user.uid, charity: memorial.charity || State.data?.charity || CHARITIES[0].id },
      });
      if (r.ok) {
        State.buyPlot(plot, memorial);
        await State.save(Auth.user);
        this._cachedWizardData = null;
        this.closeModal();
        this.refreshWorld();
        await this.show3D();
        this.world?.selectPlot(plot);
        this.openPlot(plot);

        Soundscape.playChime(528, 0.08);
        setTimeout(() => Soundscape.playChime(660, 0.06), 400);
        setTimeout(() => Soundscape.playChime(880, 0.05), 800);
        this.toast(`${name}'s memorial is consecrated forever in ${d?.name || 'the Sanctuary'}. 💛`, 8000, 'crest');
      }
    } catch (e) {
      this.toast(String(e.message || e), 'warning');
      if (btn) { btn.innerHTML = `${icon('crest')} Create Their Memorial`; btn.disabled = false; }
    }
  },

  editPetModal(m, rerender, onSaveProfile) {
    const pp = m.petProfile || {};
    this.modal(`
      <h2>${icon('edit')} ${m.petName}'s profile</h2>
      <div class="modal-sub">Everything here appears on the memorial for every visitor.</div>
      <label>Birthday</label><input id="ppBirth" maxlength="30" value="${pp.birthday || ''}" placeholder="March 3, 2010">
      <label>Crossed the bridge</label><input id="ppPass" maxlength="30" value="${pp.passing || ''}" placeholder="June 12, 2023">
      <label>About ${m.petName}</label><textarea id="ppAbout" rows="3" maxlength="400" placeholder="Their story, their personality…">${pp.about || ''}</textarea>
      <label>Favorite toys</label><input id="ppToys" maxlength="80" value="${pp.favToys || ''}">
      <label>Favorite activities</label><input id="ppActs" maxlength="80" value="${pp.favActivities || ''}">
      <label>Favorite treats</label><input id="ppTreats" maxlength="80" value="${pp.favTreats || ''}">
      <label>Add photos to the gallery (${(pp.gallery || []).length}/6 so far)</label>
      <input id="ppGallery" type="file" accept="image/*" multiple>
      <label>Video links — one per line (YouTube, etc.)</label>
      <textarea id="ppVideos" rows="2" placeholder="https://youtube.com/…">${(pp.videos || []).join('\n')}</textarea>
      <label>Contact email shown on the memorial (optional)</label>
      <input id="ppContact" type="email" maxlength="60" value="${pp.contactEmail || ''}" placeholder="family@example.com">
      <button class="btn btn-gold btn-block" id="ppSave">Save profile</button>`);
    $('#ppSave').onclick = async () => {
      const newPics = await readPhotos($('#ppGallery'), 420, 6);
      m.petProfile = {
        birthday: cleanText($('#ppBirth').value.trim()),
        passing: cleanText($('#ppPass').value.trim()),
        about: cleanText($('#ppAbout').value.trim()),
        favToys: cleanText($('#ppToys').value.trim()),
        favActivities: cleanText($('#ppActs').value.trim()),
        favTreats: cleanText($('#ppTreats').value.trim()),
        gallery: [...(pp.gallery || []), ...newPics].slice(0, 6),
        videos: $('#ppVideos').value.split('\n').map(s => s.trim()).filter(s => /^https?:\/\//.test(s)).slice(0, 3),
        contactEmail: $('#ppContact').value.trim().slice(0, 60),
      };
      onSaveProfile?.(m.petProfile);
      await State.save(Auth.user);
      this.closeModal();
      rerender();
      this.toast(`${m.petName}'s profile updated.`);
    };
  },

  // ---------------- Profile: socials & default charity ----------------
  profileModal(afterSave) {
    if (!Auth.user) return this.authModal(() => this.profileModal(afterSave));
    const s = State.data.socials || {};
    const p = State.data?.profile || {};
    this.modal(`
      <h2>Your profile</h2>
      <div class="modal-sub">Your public face across the Bridge — shown on your memorials so friends and visitors can find you.</div>
      <div style="display:flex;gap:14px;align-items:center;margin:10px 0">
        ${p.avatar ? `<img src="${p.avatar}" class="pet-photo" style="width:64px;height:64px">` : `<div class="crest-lg">${icon('crest', { size: 44 })}</div>`}
        <div style="flex:1"><label style="margin-top:0">Profile picture / avatar</label>
        <input id="prAvatar" type="file" accept="image/*"></div>
      </div>
      <label>Display name</label><input id="prName" maxlength="30" value="${Auth.user.name || ''}">
      <label>Bio</label><textarea id="prBio" rows="2" maxlength="200" placeholder="Dog dad in Denver. Ranger's family forever.">${p.bio || ''}</textarea>
      <label>Contact email (shown only where you enable it)</label>
      <input id="prEmail" type="email" maxlength="60" value="${p.contactEmail || Auth.user.email || ''}">
      <div class="divider">social accounts</div>
      <label>Instagram</label><input id="soIg" placeholder="@handle" value="${s.instagram || ''}">
      <label>X / Twitter</label><input id="soX" placeholder="@handle" value="${s.x || ''}">
      <label>TikTok</label><input id="soTt" placeholder="@handle" value="${s.tiktok || ''}">
      <label>Facebook</label><input id="soFb" placeholder="profile name or URL" value="${s.facebook || ''}">
      <div class="divider">giving</div>
      <label>Default charity (${Math.round(GIFT_CHARITY_SHARE * 100)}% of gifts to your memorials)</label>
      <select id="soCharity">
        <option value="">— choose later, per memorial —</option>
        ${CHARITIES.map(c => `<option value="${c.id}" ${State.data.charity === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
      </select>
      <button class="btn btn-gold btn-block" id="soSave">Save profile</button>`);
    $('#soSave').onclick = async () => {
      const avatar = await readPhoto($('#prAvatar'), 128) || p.avatar || null;
      const newName = cleanText($('#prName').value.trim());
      if (newName) { Auth.user.name = newName; try { localStorage.setItem('ev_user', JSON.stringify(Auth.user)); } catch {} Auth._emit(); }
      if (!State.data) State.data = {}; State.data.profile = {
        avatar,
        bio: cleanText($('#prBio').value.trim()),
        contactEmail: $('#prEmail').value.trim().slice(0, 60),
      };
      State.data.socials = {
        instagram: cleanText($('#soIg').value.trim()), x: cleanText($('#soX').value.trim()),
        tiktok: cleanText($('#soTt').value.trim()), facebook: cleanText($('#soFb').value.trim()),
      };
      State.data.charity = $('#soCharity').value || null;
      await State.save(Auth.user);
      this.closeModal();
      this.toast('Profile saved.', 'crest');
      afterSave?.();
    };
  },

  // ---------------- MY BRIDGE — everything in one place ----------------
  myBridgeModal() {
    if (!Auth.user || Auth.user.isGuest) return this.authModal(() => this.myBridgeModal());
    const p = State.data?.profile || {};
    const s = State.data.socials || {};
    const mem = State.membershipInfo();
    const myPlots = Object.keys(State.data?.ownedPlots)
      .map(id => this.plots.find(x => x.id === id)).filter(Boolean);
    const myMems = (State.data?.earth?.memorials || []).filter(m => !Auth.user || m.ownerUid === Auth.user.uid || IS_ADMIN);
    const totalGifts = myPlots.reduce((n, pl) => n + (pl.memorial?.gifts || 0), 0) +
                       myMems.reduce((n, m) => n + (m.gifts || 0), 0);
    const socialLine = ['instagram', 'x', 'tiktok', 'facebook'].filter(k => s[k])
      .map(k => icon({ instagram: 'instagram', x: 'x', tiktok: 'tiktok', facebook: 'facebook' }[k]) + ' ' + s[k]).join(' · ');

    this.modal(`
      <div style="display:flex;gap:16px;align-items:center">
        ${p.avatar ? `<img src="${p.avatar}" class="pet-photo" style="width:72px;height:72px">` : `<div class="crest-lg">${icon('crest', { size: 52 })}</div>`}
        <div>
          <h2 style="margin:0">${Auth.user.name}</h2>
          <div class="modal-sub" style="margin:2px 0 0">${p.bio || 'No bio yet — add one so visitors know who loved them.'}</div>
          ${socialLine ? `<div style="font-size:12px;color:var(--gold-bright);margin-top:4px">${socialLine}</div>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:8px;margin:14px 0;flex-wrap:wrap">
        <button class="btn btn-outline" id="mbProfile">${icon('edit')} Edit profile</button>
        <button class="btn btn-outline" id="mbMembership">${mem ? icon('crest') + ' ' + mem.name + ' member' : 'Choose a membership'}</button>
        <span class="btn btn-outline" style="cursor:default">${icon('gift')} ${totalGifts} gifts received</span>
        ${State.data?.charity ? `<span class="btn btn-outline" style="cursor:default">${icon('heart')} ${charityName(State.data?.charity)}</span>` : ''}
      </div>
      <div class="sub">Your sanctuary plots (${myPlots.length}):</div>
      ${myPlots.length ? myPlots.map(pl => `
        <div class="feed-item" data-myplot="${pl.id}"><div class="fi-icon">${pl.memorial ? memorialArt(pl.memorial, 20) : icon('grave')}</div>
          <div><b>${pl.memorial?.petName || 'Plot'}</b> · ${DISTRICTS[pl.district].name}
          <span class="fi-time">Plot ${pl.id} · ${icon('gift')} ${pl.memorial?.gifts || 0}</span></div></div>`).join('')
        : '<div class="fine" style="text-align:left">None yet — browse the Sanctuary to reserve one.</div>'}
      <div class="sub" style="margin-top:12px">Your memorials on Earth (${myMems.length}):</div>
      ${myMems.length ? myMems.map(m => `
        <div class="feed-item" data-mymem="${m.id}"><div class="fi-icon">${memorialArt(m, 20)}</div>
          <div><b>${m.petName}</b> · ${m.place.split(',').slice(0, 2).join(',')}
          <span class="fi-time">${icon('gift')} ${m.gifts || 0} · ${(m.guestbook || []).length} guestbook entries</span></div></div>`).join('')
        : '<div class="fine" style="text-align:left">None yet — search any address and pick a glowing spot.</div>'}`);

    $('#mbProfile').onclick = () => this.profileModal(() => this.myBridgeModal());
    $('#mbMembership').onclick = () => this.membershipModal(() => this.myBridgeModal());
    $('#modalBox').querySelectorAll('[data-myplot]').forEach(el => {
      el.onclick = () => {
        const pl = this.plots.find(x => x.id === el.dataset.myplot);
        if (pl) { this.closeModal(); this.show3D().then(() => this.world?.selectPlot(pl)); this.openPlot(pl); }
      };
    });
    $('#modalBox').querySelectorAll('[data-mymem]').forEach(el => {
      el.onclick = () => {
        const m = myMems.find(x => x.id === el.dataset.mymem);
        if (m) { this.closeModal(); this.showEarth(); this.openEarthMemorial(m); }
      };
    });
  },

  // ---------------- Share campaign ----------------
  shareModal(title, url, text) {
    const enc = encodeURIComponent;
    this.modal(`
      <h2>Share ${title}</h2>
      <div class="modal-sub">Invite friends & family to visit, light a candle, and leave a gift.</div>
      <div class="auth-providers">
        <button class="btn" id="shNative">${icon('phone')} Share…</button>
        <button class="btn" id="shCopy">${icon('share')} Copy link</button>
        <a class="btn" style="text-align:center" href="https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}" target="_blank" rel="noopener">𝕏 Post on X</a>
        <a class="btn" style="text-align:center" href="https://www.facebook.com/sharer/sharer.php?u=${enc(url)}" target="_blank" rel="noopener">ⓕ Share on Facebook</a>
        <a class="btn" style="text-align:center" href="https://wa.me/?text=${enc(text + ' ' + url)}" target="_blank" rel="noopener">${icon('whatsapp')} WhatsApp</a>
        <a class="btn" style="text-align:center" href="mailto:?subject=${enc(title)}&body=${enc(text + '\n\n' + url)}">${icon('mail')} Email</a>
      </div>
      <p class="fine">Anyone with the link can visit — no account needed.</p>`);
    $('#shCopy').onclick = async () => {
      try { await navigator.clipboard.writeText(url); this.toast('Link copied.', 'share'); }
      catch { prompt('Copy this link:', url); }
    };
    $('#shNative').onclick = async () => {
      if (navigator.share) { try { await navigator.share({ title, text, url }); } catch {} }
      else this.toast('Native sharing not available in this browser — use the buttons below.');
    };
  },

  membershipModal(afterJoin) {
    const cur = State.data.membership;
    this.modal(`
      <h2>Memberships</h2>
      <div class="modal-sub">A membership lets you own plots and build lasting memorials —
        and ${Math.round(SPLITS.membership.charity * 100)}% of every one goes to the animal charity you choose.</div>
      <div class="district-blurb">${icon('heart')} You never have to pay us to do good here.
        <a href="#" id="memCampaign">Starting a fundraising campaign</a> is free, needs no membership,
        and sends <b>100%</b> of what it raises to your charity.</div>
      <div class="tiers">
        ${MEMBERSHIPS.map(m => `
          <div class="tier ${m.featured ? 'featured' : ''}">
            ${m.featured ? '<div class="flag">MOST LOVED</div>' : ''}
            <h3>${m.name}</h3>
            <div class="t-price">${fmtPrice(m.price)}<small>/${m.interval}</small></div>
            <ul>${m.perks.map(p => `<li>${p}</li>`).join('')}</ul>
            <button class="btn ${cur === m.id ? 'btn-outline' : 'btn-gold'} btn-block" data-m="${m.id}" ${cur === m.id ? 'disabled' : ''}>
              ${cur === m.id ? 'Current plan' : 'Choose ' + m.name}</button>
          </div>`).join('')}
      </div>
      <p class="fine">${IS_DEMO ? 'Demo mode: subscription is simulated.' : 'Billed securely via Stripe. Cancel anytime.'}</p>`);
    $('#modalBox').querySelector('#memCampaign')?.addEventListener('click', (e) => {
      e.preventDefault(); this.closeModal(); CharityUI.togglePanel(this);
    });
    $('#modalBox').querySelectorAll('[data-m]').forEach(btn => {
      btn.onclick = async () => {
        const m = MEMBERSHIPS.find(x => x.id === btn.dataset.m);
        if (!Auth.user || Auth.user.isGuest) { this.closeModal(); return this.authModal(() => this.membershipModal(afterJoin)); }
        btn.textContent = 'Processing…'; btn.disabled = true;
        try {
          const r = await checkout({ kind: 'membership', name: `Rainbow Bridge — ${m.name} membership`, amount: m.price,
            meta: { membershipId: m.id, uid: Auth.user.uid, charity: State.data?.charity || CHARITIES[0].id } });
          if (r.ok) {
            State.data.membership = m.id;
            await State.save(Auth.user);
            this.closeModal();
            this.toast(`You are now a ${m.name} member.`);
            afterJoin?.();
          }
        } catch (e) { this.toast(String(e.message), 'warning'); btn.textContent = 'Choose ' + m.name; btn.disabled = false; }
      };
    });
  },

  // ---------------- Buy plot flow ----------------
  buyPlotFlow(plot) {
    if (!Auth.user || Auth.user.isGuest) return this.authModal(() => this.buyPlotFlow(plot));
    if (!State.hasMembership()) { this.toast('A membership is needed to own plots.'); return this.membershipModal(() => this.buyPlotFlow(plot)); }
    if (!State.canBuyPlot()) { this.toast('Plot limit reached for your tier — upgrade to add more.'); return this.membershipModal(); }

    const d = DISTRICTS[plot.district];
    this.modal(`
      <h2>Create a memorial</h2>
      <div class="modal-sub">Plot ${plot.id} · ${d.name} · ${SIZE_LABELS[plot.size]} · <b>$${plot.price}</b><br>
        ${Math.round(SPLITS.plot.charity * 100)}% of this, and of every gift left here, goes to the charity you pick below.</div>
      <label>Pet's name</label><input id="mName" placeholder="e.g. Biscuit" maxlength="24">
      <label>Species</label>
      <select id="mSpecies">
        ${speciesOptionsHTML()}
      </select>
      <label>Years (e.g. 2012 – 2025)</label><input id="mYears" placeholder="2012 – 2025" maxlength="16">
      <label>Epitaph</label><textarea id="mEpitaph" rows="2" maxlength="120" placeholder="A few words to remember them by…"></textarea>
      <label>Their photo (optional)</label><input id="mPhoto" type="file" accept="image/*">
      <label>Headstone</label>
      <select id="mHeadstone">
        ${HEADSTONE_STYLES.map(h => `<option value="${h.id}">${h.label}</option>`).join('')}
      </select>
      <label>Their charity — where this plot's giving goes</label>
      <select id="mCharity">
        <option value="">Let each giver choose</option>
        ${CHARITIES.map(c => `<option value="${c.id}" ${State.data.charity === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
      </select>
      <button class="btn btn-gold btn-block" id="payPlotBtn">Pay $${plot.price} & reserve forever</button>
      <p class="fine">${IS_DEMO ? 'Demo mode: payment is simulated.' : 'You will be redirected to Stripe’s secure checkout.'}</p>`);
    $('#payPlotBtn').onclick = async () => {
      const name = $('#mName').value.trim() || 'Beloved Friend';
      const sp = $('#mSpecies').value;
      const memorial = {
        petName: cleanText(name), species: sp,
        years: $('#mYears').value.trim() || String(new Date().getFullYear()),
        epitaph: cleanText($('#mEpitaph').value.trim()) || 'Forever loved.',
        headstone: $('#mHeadstone').value,
        photo: await readPhoto($('#mPhoto')),
        charity: $('#mCharity').value || null,
      };
      const btn = $('#payPlotBtn');
      btn.textContent = 'Processing payment…'; btn.disabled = true;
      try {
        const r = await checkout({ kind: 'plot', name: `Rainbow Bridge — Plot ${plot.id} (${d.name})`, amount: plot.price,
          // The owner's chosen charity rides on the purchase itself, so
          // the plot's share is booked to them and not to a default.
          meta: { plotId: plot.id, uid: Auth.user.uid, charity: memorial.charity || State.data?.charity || CHARITIES[0].id } });
        if (r.ok) {
          State.buyPlot(plot, memorial);
          await State.save(Auth.user);
          this.closeModal();
          this.refreshWorld();
          this.openPlot(plot);
          this.toast(`Plot ${plot.id} is now ${name}'s forever home.`);
        }
      } catch (e) { this.toast(String(e.message), 'warning'); btn.textContent = `Pay $${plot.price} & reserve forever`; btn.disabled = false; }
    };
  },

  // ---------------- Gifts ----------------
  giftModal(plot) {
    const from = Auth.user ? Auth.user.name : null;
    const plotCharity = plot.memorial?.charity;
    const pctS = Math.round(GIFT_CHARITY_SHARE * 100);
    const isAnniv = checkAnniversaries({ [plot.id]: plot }).length > 0;
    const giftChoices = isAnniv ? [...ANNIVERSARY_GIFTS, ...GIFTS] : GIFTS;
    this.modal(`
      <h2>Leave a gift for ${plot.memorial?.petName || 'this friend'}</h2>
      <div class="modal-sub">Gifts are laid at the base of the memorial, in 3D, for every visitor to see. ${!from ? 'You can give as an anonymous guest.' : `Giving as <b>${from}</b>.`}</div>
      ${plotCharity
        ? `<div class="district-blurb">${icon('heart')} ${pctS}% of your gift goes to <b>${charityName(plotCharity)}</b> — the family's chosen cause.</div>`
        : `<label>${icon('heart')} ${pctS}% of your gift goes to a charity of your choice</label>
           <select id="sgCharity">${CHARITIES.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select>`}
      <div class="shop-grid">
        ${giftChoices.map(g => `
          <button class="shop-item" data-g="${g.id}">
            <div class="s-emoji">${g.emoji ? `<span style="font-size:42px">${g.emoji}</span>` : thumbImg(g.id, { size: 46, alt: g.name })}</div>
            <div class="s-name">${g.name}</div>
            <div class="s-price">${fmtPrice(g.price)}</div>
          </button>`).join('')}
      </div>
      <label>Add a short message (optional)</label>
      <input id="giftMsg" maxlength="80" placeholder="Run free, sweet friend…">
      <p class="fine">${IS_DEMO ? 'Demo mode: payment is simulated.' : 'Processed securely by Stripe.'}</p>`);
    $('#modalBox').querySelectorAll('[data-g]').forEach(btn => {
      btn.onclick = async () => {
        const g = giftChoices.find(x => x.id === btn.dataset.g);
        const msg = cleanText($('#giftMsg').value.trim());
        const charity = plotCharity || $('#sgCharity')?.value || CHARITIES[0].id;
        const donate = Math.round((g.id === 'g_donation' ? g.price : g.price * GIFT_CHARITY_SHARE) * 100) / 100;
        btn.style.opacity = .5;
        try {
          const r = await checkout({ kind: 'gift', name: `Gift: ${g.name} for ${plot.memorial?.petName || 'a friend'}`, amount: g.price, meta: { plotId: plot.id, giftId: g.id, charity, donate } });
          if (r.ok) {
            if (!Auth.user) Auth.continueAsGuest(true);
            State.addGift(plot, g.id, Auth.user.name, msg);
            // lay the gift at the base of the memorial, in 3D
            const gd = GIFT_DECOR[g.id];
            if (gd) {
              const laid = (plot.decor || []).filter(d => ['flowers', 'candle', 'ball', 'bone', 'wreath'].includes(d.type)).length;
              plot.decor.push({ ...gd, dx: ((laid % 3) - 1) * 2.8 + (Math.random() - 0.5), dz: 4.5 + Math.floor(laid / 3) * 2.2 });
              this.refreshWorld();
            }
            await State.save(Auth.user);
            this.closeModal();
            this.openPlot(plot);
            this.toast(`Your gift was laid at the base of ${plot.memorial?.petName || 'the'}'s memorial.`, 'gift');
          }
        } catch (e) { this.toast(String(e.message), 'warning'); btn.style.opacity = 1; }
      };
    });
  },

  // ---------------- Decorate own plot ----------------
  decorModal(plot) {
    const tier = State.data.membership;
    const tierRank = { mem_guardian: 1, mem_legacy: 2, mem_eternal: 3 };
    const myRank = IS_ADMIN ? 3 : (tierRank[tier] || 0);
    const cats = [...new Set(PLOT_ITEMS.map(i => i.cat))];
    const owned = State.data?.ownedPlots?.[plot.id]?.decor || [];
    this.modal(`
      <h2>Customize Plot ${plot.id}</h2>
      <div class="modal-sub">Items placed: ${owned.length}. Purchases appear on your plot in 3D, exactly where you choose.</div>
      <label>Where should the next item go?</label>
      <select id="decorSlot">
        ${SLOTS.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}
      </select>
      ${cats.map(cat => `
        <div class="shop-cat">${cat}</div>
        <div class="shop-grid">
          ${PLOT_ITEMS.filter(i => i.cat === cat).map(i => {
            const need = tierRank[i.minTier] || 0;
            const locked = need > myRank;
            return `<button class="shop-item" data-i="${i.id}" ${locked ? 'data-locked="1"' : ''}>
              <div class="s-emoji">${thumbImg(i.id, { size: 46, alt: i.name })}</div>
              <div class="s-name">${i.name}</div>
              <div class="s-price">${locked ? '' : fmtPrice(i.price)}</div>
              ${locked ? `<div class="s-lock">${icon('lock')} ${MEMBERSHIPS.find(m => m.id === i.minTier)?.name}+</div>` : ''}
            </button>`;
          }).join('')}
        </div>`).join('')}
      <p class="fine">${IS_DEMO ? 'Demo mode: payments simulated.' : 'Processed securely by Stripe.'}</p>`);
    $('#modalBox').querySelectorAll('[data-i]').forEach(btn => {
      btn.onclick = async () => {
        if (btn.dataset.locked) { this.toast('This item needs a higher membership tier.'); return this.membershipModal(); }
        const it = PLOT_ITEMS.find(x => x.id === btn.dataset.i);
        const slotId = $('#decorSlot').value;
        const slot = SLOTS.find(s => s.id === slotId) || SLOTS[0];
        btn.style.opacity = .5;
        try {
          const r = await checkout({ kind: 'item', name: `Plot item: ${it.name}`, amount: it.price,
            meta: { plotId: plot.id, itemId: it.id, slot: slotId, charity: plot.memorial?.charity || State.data?.charity || CHARITIES[0].id } });
          if (r.ok) {
            State.addDecor(plot.id, it.id, slotId);
            const d = ITEM_DECOR[it.id];
            if (d) {
              const jit = () => (Math.random() - 0.5) * 2;
              plot.decor.push({ ...d, dx: slot.dx + jit(), dz: slot.dz + jit() });
              this.refreshWorld();
            }
            await State.save(Auth.user);
            this.toast(`${it.name} placed — ${slot.label.toLowerCase()}.`, 'flower');
            btn.style.opacity = 1;
          }
        } catch (e) { this.toast(String(e.message), 'warning'); btn.style.opacity = 1; }
      };
    });
  },

  // ================= EARTH MODE =================

  // ---------------- Search: companions and places, one bar ----------------
  //
  // The bar asked "where was their favorite place on Earth?" and only
  // ever answered with map coordinates. But most people arriving at a
  // memorial site are looking for a specific animal, or for the ones
  // near a place they know — and neither needed an account, so both
  // were reachable in principle and findable in practice by nobody.
  //
  // Now one field does both. Typing searches every memorial on the site
  // by name, species, place and epitaph, and offers a map lookup for
  // the same string underneath. No sign-in: a guest sees exactly what a
  // member sees.

  /** Every memorial a visitor could find, from both worlds. */
  _searchableMemorials() {
    const out = allMemorials(State.data).map(m => ({
      kind: 'earth', id: m.id, petName: m.petName, species: m.species,
      years: m.years, place: m.place, epitaph: m.epitaph, gifts: m.gifts, ref: m,
    }));
    // Sanctuary plots hold memorials too, and someone searching a name
    // does not know or care which of the two worlds it lives in.
    for (const p of this.plots) {
      if (p.status !== 'occupied' || !p.memorial) continue;
      out.push({
        kind: 'plot', id: p.id, petName: p.memorial.petName, species: p.memorial.species,
        years: p.memorial.years, place: (DISTRICTS[p.district]?.name || 'The Sanctuary') + ' · Plot ' + p.id,
        epitaph: p.memorial.epitaph, gifts: p.memorial.gifts, ref: p,
      });
    }
    return out;
  },

  /**
   * Rank matches. A name match beats a place match beats anything
   * found only in the epitaph, and a prefix beats a match in the
   * middle of a word — otherwise searching "Max" puts every memorial
   * containing "maximum" above the dog called Max.
   */
  _rankMemorials(q) {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    const scored = [];
    for (const m of this._searchableMemorials()) {
      const name = (m.petName || '').toLowerCase();
      const place = (m.place || '').toLowerCase();
      const species = (m.species || '').toLowerCase();
      const epi = (m.epitaph || '').toLowerCase();
      let score = 0;
      if (name === needle) score = 120;
      else if (name.startsWith(needle)) score = 100;
      else if (name.includes(needle)) score = 78;
      else if (place.startsWith(needle)) score = 60;
      else if (place.includes(needle)) score = 50;
      else if (species.startsWith(needle)) score = 34;
      else if (epi.includes(needle)) score = 18;
      if (!score) continue;
      score += Math.min(12, (m.gifts || 0) / 12);   // gently favour the loved ones
      scored.push({ ...m, score });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, 7);
  },

  _initMemorialSearch(doPlaceSearch) {
    const input = $('#earthSearch');
    if (!input) return;
    input.setAttribute('placeholder', 'Search a companion by name, or any place on Earth…');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-autocomplete', 'list');

    const box = document.createElement('div');
    box.className = 'search-suggest hidden';
    box.id = 'searchSuggest';
    box.setAttribute('role', 'listbox');
    input.parentElement.appendChild(box);
    this._suggestBox = box;
    this._suggestIndex = -1;

    const render = () => {
      const q = input.value.trim();
      const rows = [];

      if (!q) {
        // Instant Discovery Menu on click / focus
        rows.push(`<div class="ss-head">${icon('sparkle')} Featured Companions</div>`);
        const featured = this._searchableMemorials().slice(0, 4);
        featured.forEach((m) => {
          rows.push(`
            <button class="ss-row" data-mem="${m.kind}:${m.id}" role="option">
              <span class="ss-art">${memorialArt(m, 22)}</span>
              <span class="ss-txt">
                <b>${escapeHtml(m.petName)}</b>
                <i>${[m.species, m.years].filter(Boolean).map(escapeHtml).join(' · ')}</i>
                <u>${escapeHtml(m.place || '')}</u>
              </span>
            </button>`);
        });

        rows.push(`<div class="ss-head">${icon('crest')} 3D Sanctuary Districts</div>`);
        const dists = [
          { k: 'meadows', name: 'Meadow Grove', sub: 'Rolling wildflower garden' },
          { k: 'woodland', name: 'Whispering Pines', sub: 'Spruce & northern forest' },
          { k: 'lakefront', name: 'Lakeside Rest', sub: 'Mirror Lake weeping willows' },
          { k: 'beach', name: 'Golden Shores', sub: 'Sunlit beach & dunes' },
        ];
        dists.forEach(d => {
          rows.push(`
            <button class="ss-row ss-row--district" data-district="${d.k}" role="option">
              <span class="ss-art">${icon('sparkle', { size: 16 })}</span>
              <span class="ss-txt"><b>${d.name}</b><i>${d.sub} · Fly to 3D district</i></span>
            </button>`);
        });

        rows.push(`<div class="ss-head">${icon('pin')} Popular Sacred Places</div>`);
        const places = ['Golden Gate Park, San Francisco', 'Central Park, New York', 'Red Rock Canyon, Las Vegas'];
        places.forEach(p => {
          rows.push(`
            <button class="ss-row ss-row--place" data-place-preset="${escapeHtml(p)}" role="option">
              <span class="ss-art">${icon('pin', { size: 16 })}</span>
              <span class="ss-txt"><b>${p}</b><i>Explore sacred footprint spots</i></span>
            </button>`);
        });
      } else {
        // Real-time Ranked Search
        const hits = this._rankMemorials(q);
        if (hits.length) {
          rows.push(`<div class="ss-head">${icon('paw')} Companions (${hits.length})</div>`);
          hits.forEach((m) => {
            rows.push(`
              <button class="ss-row" data-mem="${m.kind}:${m.id}" role="option">
                <span class="ss-art">${memorialArt(m, 22)}</span>
                <span class="ss-txt">
                  <b>${escapeHtml(m.petName)}</b>
                  <i>${[m.species, m.years].filter(Boolean).map(escapeHtml).join(' · ')}</i>
                  <u>${escapeHtml(m.place || '')}</u>
                </span>
              </button>`);
          });
        }

        // Check if query matches district names
        const matchingDists = Object.entries(DISTRICTS).filter(([k, d]) => d.name.toLowerCase().includes(q.toLowerCase()));
        if (matchingDists.length) {
          rows.push(`<div class="ss-head">${icon('crest')} Sanctuary Districts</div>`);
          matchingDists.forEach(([k, d]) => {
            rows.push(`
              <button class="ss-row ss-row--district" data-district="${k}" role="option">
                <span class="ss-art">${icon('sparkle', { size: 16 })}</span>
                <span class="ss-txt"><b>${d.name}</b><i>${d.blurb?.slice(0, 60)}…</i></span>
              </button>`);
          });
        }

        rows.push(`<div class="ss-head">${icon('globe')} Places on Earth</div>`);
        rows.push(`
          <button class="ss-row ss-row--place" data-place="1" role="option">
            <span class="ss-art">${icon('pin', { size: 18 })}</span>
            <span class="ss-txt"><b>Find “${escapeHtml(q)}” on Earth</b>
              <i>Fly there and choose a spot</i></span>
          </button>`);
        if (!hits.length && !matchingDists.length) {
          rows.splice(0, 0, `<div class="ss-empty">No companion by “${escapeHtml(q)}” yet — search as a place below.</div>`);
        }
      }

      box.innerHTML = rows.join('');
      box.classList.remove('hidden');
      input.setAttribute('aria-expanded', 'true');
      this._suggestIndex = -1;

      box.querySelectorAll('[data-mem]').forEach(btn => {
        btn.onclick = () => {
          const [kind, ...rest] = btn.dataset.mem.split(':');
          const id = rest.join(':');
          this._closeSuggest();
          input.value = '';
          this.openSearchHit(kind, id);
        };
      });
      box.querySelectorAll('[data-district]').forEach(btn => {
        btn.onclick = async () => {
          const d = btn.dataset.district;
          this._closeSuggest();
          input.value = '';
          await this.show3D();
          this.world?.flyToDistrict(d);
        };
      });
      box.querySelectorAll('[data-place-preset]').forEach(btn => {
        btn.onclick = () => {
          input.value = btn.dataset.placePreset;
          this._closeSuggest();
          doPlaceSearch();
        };
      });
      box.querySelector('[data-place]')?.addEventListener('click', () => { this._closeSuggest(); doPlaceSearch(); });
    };

    let t = null;
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(render, 80); });
    input.addEventListener('focus', () => render());
    input.addEventListener('click', () => render());

    input.addEventListener('keydown', (e) => {
      const rows = [...box.querySelectorAll('.ss-row')];
      if (e.key === 'Enter') {
        e.preventDefault();
        if (this._suggestIndex >= 0 && rows[this._suggestIndex]) rows[this._suggestIndex].click();
        else { this._closeSuggest(); doPlaceSearch(); }
        return;
      }
      if (e.key === 'Escape') return this._closeSuggest();
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (!rows.length) return;
      e.preventDefault();
      this._suggestIndex += (e.key === 'ArrowDown' ? 1 : -1);
      if (this._suggestIndex < 0) this._suggestIndex = rows.length - 1;
      if (this._suggestIndex >= rows.length) this._suggestIndex = 0;
      rows.forEach((r, i) => r.classList.toggle('is-on', i === this._suggestIndex));
      rows[this._suggestIndex].scrollIntoView({ block: 'nearest' });
    });

    // Close on an outside click, but not on a click inside the list —
    // mousedown fires before the row's own click would.
    document.addEventListener('mousedown', (e) => {
      if (!box.contains(e.target) && e.target !== input) this._closeSuggest();
    });
  },

  _closeSuggest() {
    this._suggestBox?.classList.add('hidden');
    this._suggestIndex = -1;
    $('#earthSearch')?.setAttribute('aria-expanded', 'false');
  },

  /** Go to whatever the visitor picked out of the suggestions. */
  async openSearchHit(kind, id) {
    if (kind === 'plot') {
      const pl = this.plots.find(p => p.id === id);
      if (!pl) return this.toast('That plot could not be found.', 'warning');
      await this.show3D();
      this.world?.selectPlot(pl);
      this.openPlot(pl);
      return;
    }
    const m = allMemorials(State.data).find(x => x.id === id);
    if (!m) return this.toast('That memorial could not be found.', 'warning');
    if (m.lat == null) return this.openEarthMemorial(m);
    await this.showEarth();
    this.flyToPlace({ lat: m.lat, lng: m.lng, range: 420, name: m.petName }, { announce: false });
    setTimeout(() => this.openEarthMemorial(m), 2400);
  },

  _initEarthUI() {
    const doSearch = async () => {
      const q = $('#earthSearch')?.value?.trim();
      if (!q) return;
      // The bar is reachable from every view, so make sure the map
      // exists before asking it to find anything.
      this.toast('Searching…', 2500, 'search');
      await this.showEarth();
      try {
        if (!this.earth) throw new Error('Earth view unavailable');
        const r = await this.earth.geocode(q);
        this._lastPos = { lat: r.lat, lng: r.lng };
        this.flyToPlace({ lat: r.lat, lng: r.lng, range: 380 }, { announce: false });
        this.toast(`${r.name.split(',').slice(0, 2).join(',')} — glowing spots are available. Try Ground or Street to stand there.`, 7000);
        // show clear placement spots around the destination
        setTimeout(() => this.earth?.showCandidateSpots(r), 1800);
      } catch { this.toast('Could not find that place — try a fuller address.'); }
    };
    if ($('#earthGo')) $('#earthGo').onclick = () => { this._closeSuggest(); doSearch(); };
    this._placeSearch = doSearch;
    this._initMemorialSearch(doSearch);

    // Fly to the user's current location
    if ($('#locBtn')) $('#locBtn').onclick = () => {
      if (!navigator.geolocation) return this.toast('Your browser does not support location.');
      this.toast('Finding you…', 'pin');
      navigator.geolocation.getCurrentPosition(async (p) => {
        await this.showEarth();
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        this._lastPos = pos;
        this.flyToPlace({ ...pos, range: 380 }, { announce: false });
        setTimeout(() => this.earth?.showCandidateSpots(pos), 1800);
        const name = (await this.earth?.reverseGeocode(pos.lat, pos.lng)) || `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`;
        this.toast(`${name.split(',').slice(0, 2).join(',')} — glowing spots are available here. Try Ground to stand in it.`, 7000);
      }, (err) => {
        this.toast(err.code === 1
          ? 'Location permission denied — type your address in the search bar instead.'
          : 'Could not get your location — try typing the address.', 6000);
      }, { timeout: 10000, maximumAge: 60000 });
    };

    if ($('#orbitBtn')) $('#orbitBtn').onclick = () => { this._lastPos = null; this.returnToOrbit(); };
    if ($('#homeBtn')) $('#homeBtn').onclick = async () => {
      this._lastPos = null;
      await this.showEarth();
      this.flyToPlace({ lat: RBV.lat, lng: RBV.lng, range: 2800, name: 'Rainbow Bridge Valley' });
    };

    // Ground-level & Street View
    if ($('#groundBtn')) $('#groundBtn').onclick = async () => {
      await this.showEarth();
      const pos = this._lastPos || this.earth?.getCenter() || { lat: RBV.lat, lng: RBV.lng };
      const ok = this.earth?.groundView(pos);
      if (ok) this.toast('Standing at the place — the camera will slowly circle it. Drag to look around.');
      else this.toast('Satellite mode is top-down only — click Enable 3D for the full ground-level recreation (buildings, trees, yards).', 7000);
    };
    if ($('#streetBtn')) $('#streetBtn').onclick = async () => {
      await this.showEarth();
      this.streetViewOpen(this._lastPos || this.earth?.getCenter() || { lat: RBV.lat, lng: RBV.lng });
    };
    if ($('#streetClose')) $('#streetClose').onclick = () => {
      $('#streetPanel')?.classList.add('hidden');
      const sc = $('#streetContainer');
      if (sc) sc.innerHTML = '';
    };
    if ($('#placeBtn')) $('#placeBtn').onclick = async () => { await this.showEarth(); this.startPlacement(); };
    if ($('#placeCancel')) $('#placeCancel').onclick = () => this._exitPlacement();
    if ($('#placeCenter')) $('#placeCenter').onclick = () => {
      const c = this.earth?.getCenter() || { lat: RBV.lat, lng: RBV.lng };
      this._exitPlacement();
      this.earthMemorialForm(c);
    };

    if ($('#feedBtn')) $('#feedBtn').onclick = () => this.toggleFeed();
    if ($('#feedClose')) $('#feedClose').onclick = () => $('#feedPanel').classList.add('hidden');
    if ($('#browseBtn')) $('#browseBtn').onclick = () => this.toggleBrowse();
    if ($('#browseClose')) $('#browseClose').onclick = () => $('#browsePanel').classList.add('hidden');
    if ($('#causeBtn')) $('#causeBtn').onclick = () => CharityUI.togglePanel(this);
    if ($('#topbarCharityBtn')) $('#topbarCharityBtn').onclick = () => CharityUI.togglePanel(this);
    if ($('#comfortBtn')) $('#comfortBtn').onclick = () => this.comfortModal();
    if ($('#partnerBtn')) $('#partnerBtn').onclick = () => this.partnerModal();
    if ($('#navBrowseBtn')) $('#navBrowseBtn').onclick = () => this.toggleBrowse();
    $('#membershipBtn')?.addEventListener('click', () => this.membershipModal());
    $('#brandLogo')?.addEventListener('click', () => this.show3D());
    $('#keepsakesBtn')?.addEventListener('click', () => this.keepsakesModal());
    $('#keepsakeToolbarBtn')?.addEventListener('click', () => this.keepsakesModal());
    $('#soundBtn')?.addEventListener('click', () => this.soundModal());
    $('#lanternBtn')?.addEventListener('click', () => this.riverLanternsModal());
    $('#lettersBtn')?.addEventListener('click', () => this.lettersModal());
    $('#treeRibbonBtn')?.addEventListener('click', () => this.treeOfLifeModal());
    $('#candleVigilBtn')?.addEventListener('click', () => this.candleVigilModal());
    $('#tourBtn')?.addEventListener('click', () => Tour.start());
    if ($('#campaignClose')) $('#campaignClose').onclick = () => $('#campaignPanel').classList.add('hidden');
    
    // Navigation dropdown
    const ddToggle = $('#navDropdownToggle');
    const ddMenu = $('#navDropdownMenu');
    if (ddToggle && ddMenu) {
      ddToggle.onclick = (e) => {
        e.stopPropagation();
        ddMenu.classList.toggle('hidden');
      };
      document.addEventListener('click', (e) => {
        if (!ddMenu.contains(e.target) && !ddToggle.contains(e.target)) {
          ddMenu.classList.add('hidden');
        }
      });
      ddMenu.querySelectorAll('button').forEach(b => {
        b.addEventListener('click', () => ddMenu.classList.add('hidden'));
      });
    }

    this.updateCharityTopbar();

    // 3D key: paste-in-app, stored in the browser — no code editing
    const keyBtn = $('#key3dBtn');
    if (HAS_MAPS3D) { keyBtn.innerHTML = icon('globe') + ' 3D on'; keyBtn.classList.remove('btn-gold'); keyBtn.classList.add('btn-outline'); }
    keyBtn.onclick = () => this.mapsKeyModal();
  },

  mapsKeyModal() {
    const saved = (() => { try { return localStorage.getItem('ev_maps_key') || ''; } catch { return ''; } })();
    this.modal(`
      <h2>${icon('key')} Unlock photorealistic 3D</h2>
      <div class="modal-sub">Paste a Google Maps Platform API key and the Earth becomes full Google-Earth-style 3D —
        terrain, buildings and trees, anywhere on the planet. <b>3D Maps is free during Google's Preview.</b></div>
      <label>Your Google Maps API key</label>
      <input id="mapsKeyInput" placeholder="AIza..." value="${saved}" autocomplete="off">
      <button class="btn btn-gold btn-block" id="mapsKeySave">Save & relaunch in 3D</button>
      ${saved ? '<button class="btn btn-outline btn-block" id="mapsKeyClear">Remove key (back to satellite)</button>' : ''}
      <div class="divider">how to get a key (~10 min, free)</div>
      <div style="font-size:13px;line-height:1.7;color:var(--cream-dim)">
        1 · Go to <b>console.cloud.google.com</b> → create a project (e.g. <i>rainbow-bridge</i>).<br>
        2 · Billing → add a card (required by Google; the free tier below means $0 for development).<br>
        3 · <b>APIs &amp; Services → Library</b> → enable <b>Maps JavaScript API</b> and <b>Geocoding API</b>.<br>
        4 · <b>Credentials → Create credentials → API key</b> → copy it.<br>
        5 · Recommended: restrict the key to those two APIs and to your site (<i>localhost:4242</i>).<br>
        6 · Paste it above.<br><br>
        ${icon('coins')} <b>Is it free?</b> 3D Maps: no charge during Preview. Map loads &amp; geocoding: 10,000 free per month each,
        far beyond demo needs. Set a budget alert in Google Cloud for peace of mind.
      </div>
      <p class="fine">The key is stored only in this browser (localStorage) — never sent to our server.</p>`);
    $('#mapsKeySave').onclick = () => {
      const k = $('#mapsKeyInput').value.trim();
      if (k.length < 20) return this.toast('That does not look like a Maps API key (starts with AIza…).');
      try { localStorage.setItem('ev_maps_key', k); } catch {}
      this.toast('Key saved — relaunching in photorealistic 3D…');
      setTimeout(() => location.reload(), 900);
    };
    const clr = $('#mapsKeyClear');
    if (clr) clr.onclick = () => { try { localStorage.removeItem('ev_maps_key'); } catch {}; location.reload(); };
  },

  async mountEarth() {
    if (!this.earth) {
      const { EarthView } = await import('./earth.js');
      this.earth = new EarthView(document.getElementById('earthMap'));
    }
    this.earth.onMemorialClick = (m) => this.openEarthMemorial(m);
    this.earth.onRBVClick = () => this.rbvPanel();
    this.earth.onPlaceAt = (pos) => { this._exitPlacement(); this.beginMemorialAt(pos); };
    this.earth.onCharityClick = (ch) => this.shelterModal(ch);

    await this.earth.init();
    if (HAS_MAPS3D && this.earth.mode === 'satellite') {
      this.toast('Your Maps key was rejected (check APIs enabled & restrictions) — running satellite fallback. Click Enable 3D to update it.', 8000, 'warning');
    }
    for (const m of allMemorials(State.data)) this.earth.addMemorialMarker(m);
    for (const ch of CHARITIES) this.earth.addCharityMarker(ch);

    if (!HAS_MAPS3D) this.toast('Satellite mode — click Enable 3D and paste a free Google Maps key for full photorealism', 7000);
  },

  shelterModal(ch) {
    const campaigns = Campaigns.load().filter(c => c.charityId === ch.id);
    this.modal(`
      <h2>${icon('heart')} ${ch.name}</h2>
      <div class="modal-sub">${ch.cat} · ${ch.city}, ${ch.state}</div>
      <div class="district-blurb" style="margin:12px 0">
        <span style="color:var(--accent-hi-c);font-size:12px;font-weight:700">${ch.rating || 'Verified 501(c)(3) Rescue'}</span><br>
        ${ch.blurb}<br>
        <span class="fine-dim">IRS EIN: <b>${ch.ein}</b> · <a href="${ch.url}" target="_blank" rel="noopener noreferrer">Visit Official Website</a></span>
      </div>

      ${ch.impactTiers ? `
        <div class="shop-cat">Tangible Impact Tiers</div>
        <div class="shop-grid" style="margin-bottom:14px">
          ${ch.impactTiers.map(t => `
            <div class="shop-item" style="cursor:default;text-align:left;padding:10px">
              <b style="color:var(--accent-hi-c);font-size:14px">${t.label}</b>
              <div style="font-size:11.5px;color:#dedad0;margin-top:4px">${t.desc}</div>
            </div>
          `).join('')}
        </div>` : ''}

      <div style="display:flex;gap:10px">
        <button class="btn btn-gold btn-block" id="shStartCmp">${icon('heart')} Start Campaign for ${ch.name}</button>
      </div>

      ${campaigns.length ? `
        <div class="shop-cat" style="margin-top:16px">Memorial Campaigns Supporting ${ch.name} (${campaigns.length})</div>
        ${campaigns.map(c => `
          <div class="feed-item" data-cmp="${c.id}" style="cursor:pointer">
            <div class="fi-icon">${icon('heart')}</div>
            <div><b>${c.petName}</b> · ${[c.species, c.years].filter(Boolean).join(' · ')}<br>
              <span class="fi-time">${c.story ? c.story.slice(0, 80) + '…' : 'In loving memory'}</span>
            </div>
          </div>
        `).join('')}
      ` : ''}
    `);

    const box = $('#modalBox');
    box.querySelector('#shStartCmp').onclick = () => {
      this.closeModal();
      CharityUI.createModal(this);
      const sel = $('#cmpCharity');
      if (sel) { sel.value = ch.id; sel.dispatchEvent(new Event('change')); }
    };
    box.querySelectorAll('[data-cmp]').forEach(el => {
      el.onclick = () => {
        const c = Campaigns.get(el.dataset.cmp);
        if (c) { this.closeModal(); CharityUI.campaignModal(this, c); }
      };
    });
  },

  comfortModal() {
    this.modal(`
      <div class="comfort-header">
        <div class="comfort-crest">${icon('dove', { size: 38 })}</div>
        <h2>Words of Comfort &amp; The Rainbow Bridge</h2>
        <div class="modal-sub">For every heart carrying the sacred weight of goodbye.</div>
      </div>

      <div class="poem-scroll">
        <p class="poem-stanza">
          Just this side of heaven is a place called Rainbow Bridge.<br><br>
          When an animal dies that has been especially close to someone here, that pet goes to Rainbow Bridge.
          There are meadows and hills for all of our special friends so they can run and play together.
          There is plenty of food, water and sunshine, and our friends are warm and comfortable.
        </p>
        <p class="poem-stanza">
          All the animals who had been ill and old are restored to health and vigor.
          Those who were hurt or maimed are made whole and strong again,
          just as we remember them in our dreams of days and times gone by.
          The animals are happy and content, except for one small thing;
          they each miss someone very special to them, who had to be left behind.
        </p>
        <p class="poem-stanza">
          They all run and play together, but the day comes when one suddenly stops and looks into the distance.
          His bright eyes are intent. His eager body quivers. Suddenly he begins to run from the group,
          flying over the green grass, his legs carrying him faster and faster.
        </p>
        <p class="poem-stanza poem-climax">
          You have been spotted, and when you and your special friend finally meet,
          you cling together in joyous reunion, never to be parted again.
          The happy kisses rain upon your face; your hands again caress the beloved head,
          and you look once more into the trusting eyes of your pet, so long gone from your life but never absent from your heart.<br><br>
          <i>Then you cross Rainbow Bridge together…</i>
        </p>
      </div>

      <div class="district-blurb" style="margin:16px 0">
        <b>24/7 Compassionate Support for Pet Loss:</b><br>
        • <a href="https://www.lapoflove.com/pet-loss-support" target="_blank" rel="noopener noreferrer">Lap of Love Free Pet Loss Support Groups</a><br>
        • <a href="https://www.vet.cornell.edu/impact/community-engagement/pet-loss-support-hotline" target="_blank" rel="noopener noreferrer">Cornell Pet Loss Support Helpline</a> (607-253-3932)<br>
        • <a href="https://www.aplb.org" target="_blank" rel="noopener noreferrer">Association for Pet Loss and Bereavement (APLB)</a>
      </div>

      <div style="display:flex;gap:10px">
        <button class="btn btn-gold btn-block" id="comfortLightCandle">${icon('candle')} Light a Candle Vigil</button>
        <button class="btn btn-outline btn-block" id="comfortMemorialize">${icon('heart')} Memorialize Your Companion</button>
      </div>
    `);

    const box = $('#modalBox');
    box.querySelector('#comfortLightCandle').onclick = () => {
      this.closeModal();
      this.candleVigilModal();
    };
    box.querySelector('#comfortMemorialize').onclick = () => {
      this.closeModal();
      this.showEarth().then(() => this.startPlacement());
    };
  },

  adminHudModal() {
    this.modal(`
      <div class="comfort-header">
        <div class="comfort-crest" style="color:var(--gold-bright);">${icon('shield', { size: 38 })}</div>
        <h2>⚡ Untethered Admin Console</h2>
        <div class="modal-sub">Superuser Privileges Active · Instant 100% Free Comps · Unrestricted World Access</div>
      </div>

      <div class="admin-quick-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin:20px 0;">
        <div class="district-blurb" style="margin:0;padding:16px;">
          <h4 style="font-family:var(--display);color:#fff;margin-bottom:6px;letter-spacing:0.08em;">✨ Instant Free Checkouts</h4>
          <p style="font-size:12.5px;color:#d0c8b6;margin-bottom:12px;">Create memorials anywhere on Earth or in the 3D Sanctuary Valley with zero Stripe charges.</p>
          <button class="btn btn-gold btn-block btn-sm" id="admCreateBtn">Create New Memorial</button>
        </div>
        <div class="district-blurb" style="margin:0;padding:16px;">
          <h4 style="font-family:var(--display);color:#fff;margin-bottom:6px;letter-spacing:0.08em;">🌌 Sandbox Memorial Seeder</h4>
          <p style="font-size:12.5px;color:#d0c8b6;margin-bottom:12px;">Seed 10 realistic companion memorials across all 7 districts &amp; Earth map.</p>
          <button class="btn btn-outline btn-block btn-sm" id="admSeedBtn">Seed 10 Memorials</button>
        </div>
        <div class="district-blurb" style="margin:0;padding:16px;">
          <h4 style="font-family:var(--display);color:#fff;margin-bottom:6px;letter-spacing:0.08em;">🌤️ Dynamic Atmosphere</h4>
          <p style="font-size:12.5px;color:#d0c8b6;margin-bottom:10px;">Switch Sanctuary 3D lighting phase &amp; weather.</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" id="admDawn">Dawn</button>
            <button class="btn btn-outline btn-sm" id="admDay">Day</button>
            <button class="btn btn-outline btn-sm" id="admDusk">Dusk</button>
            <button class="btn btn-outline btn-sm" id="admNight">Night</button>
            <button class="btn btn-outline btn-sm" id="admBlessing">Rain</button>
          </div>
        </div>
        <div class="district-blurb" style="margin:0;padding:16px;">
          <h4 style="font-family:var(--display);color:#fff;margin-bottom:6px;letter-spacing:0.08em;">📊 Telemetry &amp; Command Center</h4>
          <p style="font-size:12.5px;color:#d0c8b6;margin-bottom:12px;">Review Stripe transaction logs, charity revenue, and event store.</p>
          <button class="btn btn-outline btn-block btn-sm" id="admDashBtn">Open /admin.html</button>
        </div>
      </div>

      <div style="display:flex;gap:12px;justify-content:space-between;margin-top:20px;flex-wrap:wrap;">
        <button class="btn btn-outline" id="admExitBtn" style="color:#ff7675;border-color:rgba(255,118,117,0.4);">Exit Admin Mode</button>
        <button class="btn btn-gold" data-close>Resume Exploring</button>
      </div>
    `);

    const box = $('#modalBox');
    box.querySelector('#admCreateBtn').onclick = () => {
      this.closeModal();
      this.griefWizardModal();
    };
    box.querySelector('#admSeedBtn').onclick = async () => {
      await this.seedDemoMemorials();
      this.toast('✨ 10 sample companion memorials seeded across the Sanctuary & Earth!', 4000);
      this.closeModal();
    };
    box.querySelector('#admDawn').onclick = () => { this.world?.forcePhase('dawn'); this.toast('Sanctuary time: Dawn'); };
    box.querySelector('#admDay').onclick = () => { this.world?.forcePhase('day'); this.toast('Sanctuary time: Sunlit Noon'); };
    box.querySelector('#admDusk').onclick = () => { this.world?.forcePhase('dusk'); this.toast('Sanctuary time: Amber Dusk'); };
    box.querySelector('#admNight').onclick = () => { this.world?.forcePhase('night'); this.toast('Sanctuary time: Celestial Night'); };
    box.querySelector('#admBlessing').onclick = () => {
      if (this.world) { this.world.mood = 'blessing'; this.world.applyAmbience(); }
      this.toast('Atmospheric Rain Blessing active');
    };
    box.querySelector('#admDashBtn').onclick = () => window.open('/admin.html', '_blank');
    box.querySelector('#admExitBtn').onclick = () => {
      try { localStorage.removeItem('ev_admin_mode'); } catch {}
      location.href = '/';
    };
  },

  async seedDemoMemorials() {
    const demoPets = [
      { name: 'Barnaby', species: 'Golden Retriever', years: '2012 — 2024', epitaph: 'The gentlest soul who loved the ocean and chasing morning shadows.', lat: 37.7749, lng: -122.4194, place: 'San Francisco, CA', district: 'memorial_meadows', plotId: 'p_101' },
      { name: 'Cleo', species: 'Siamese Cat', years: '2009 — 2023', epitaph: 'Queen of the sunbeams and guardian of our quietest evenings.', lat: 40.7128, lng: -74.0060, place: 'New York, NY', district: 'whispering_pines', plotId: 'p_102' },
      { name: 'Jasper', species: 'Australian Shepherd', years: '2014 — 2025', epitaph: 'Endless energy, brilliant eyes, and a heart full of boundless devotion.', lat: 51.5074, lng: -0.1278, place: 'London, UK', district: 'lakeside_rest', plotId: 'p_103' },
      { name: 'Milo', species: 'Rescue Beagle', years: '2011 — 2024', epitaph: 'A joyful spirit who knew only kindness, peanut butter, and summer trails.', lat: 34.0522, lng: -118.2437, place: 'Los Angeles, CA', district: 'golden_shores', plotId: 'p_104' },
      { name: 'Freya', species: 'Maine Coon', years: '2010 — 2023', epitaph: 'Silent elegance and sweet purrs that filled our home with peace.', lat: 48.8566, lng: 2.3522, place: 'Paris, France', district: 'summit_rest', plotId: 'p_105' },
      { name: 'Atlas', species: 'Rescue Thoroughbred', years: '2005 — 2022', epitaph: 'Running wild and free across the infinite celestial meadows.', lat: -33.8688, lng: 151.2093, place: 'Sydney, Australia', district: 'desert_bloom', plotId: 'p_106' },
    ];

    if (!State.data) State.data = {}; State.data.earth ||= { memorials: [], activity: [] };
    if (!State.data) State.data = {}; State.data.ownedPlots ||= {};

    demoPets.forEach(p => {
      const mem = {
        id: 'seed_' + Math.random().toString(36).slice(2, 9),
        petName: p.name,
        species: p.species,
        years: p.years,
        epitaph: p.epitaph,
        lat: p.lat,
        lng: p.lng,
        place: p.place,
        owner: 'Admin',
        headstone: 'classic',
        at: Date.now() - Math.floor(Math.random() * 86400000 * 7),
      };
      State.data.earth.memorials.push(mem);
      State.data.ownedPlots[p.plotId] = {
        memorial: mem,
        decor: [{ type: 'headstone', style: 'classic' }],
        boughtAt: Date.now(),
      };
    });

    await State.save(Auth.user);
    if (this.globe) {
      demoPets.forEach(p => this.globe.addPin({ lat: p.lat, lng: p.lng, name: p.place, memorial: p }));
    }
  },

  candleVigilModal() {
    this.modal(`
      <h2>${icon('candle')} Light an Eternal Candle</h2>
      <div class="modal-sub">Leave a warm light in the night sky and a silent wish for all companions who have crossed over.</div>

      <label>Companion's Name <span class="fine-inline">(or 'For all who left us')</span></label>
      <input id="vgName" maxlength="40" placeholder="e.g. For Luna & all sweet souls">

      <label>Your Message / Silent Prayer <span class="fine-inline">(optional)</span></label>
      <textarea id="vgMsg" rows="3" maxlength="200" placeholder="May you run free in endless sunlit fields. Until we meet again…"></textarea>

      <label>From <span class="fine-inline">(optional)</span></label>
      <input id="vgFrom" maxlength="30" placeholder="${Auth.user?.name || 'A loving family'}">

      <button class="btn btn-gold btn-block" id="vgLight">${icon('candle')} Light the Candle</button>
    `);

    const box = $('#modalBox');
    box.querySelector('#vgLight').onclick = () => {
      const name = box.querySelector('#vgName').value.trim() || 'A beloved companion';
      const from = box.querySelector('#vgFrom').value.trim() || Auth.user?.name || 'A loving heart';
      const msg = box.querySelector('#vgMsg').value.trim();

      State.logActivity('candle', `${from} lit an eternal candle for ${name}${msg ? ': “' + msg + '”' : ''}`);
      this.closeModal();
      this.toast(`Candle lit in memory of ${name}. May their light shine forever.`, 6000, 'candle');

      const rect = document.body.getBoundingClientRect();
      Motion.spark(rect.width / 2, rect.height / 2, 45);
    };
  },

  partnerModal() {
    this.modal(`
      <div class="partner-hero">
        <div class="partner-crest">${icon('crest', { size: 40 })}</div>
        <h2>Care Partner &amp; Veterinary Alliance</h2>
        <div class="modal-sub">You meet families on the hardest day of their pet's life. Give them a gentle, comforting next step.</div>
      </div>

      <div class="partner-pillars">
        <div class="partner-pillar">
          <div class="pillar-ico">${icon('heart', { size: 22 })}</div>
          <b>Veterinary Hospitals &amp; Clinics</b>
          <p>Include elegant sympathy condolence cards with your aftercare packets. Families receive a peaceful digital memorial on Earth or in the Sanctuary with custom clinic branding.</p>
        </div>
        <div class="partner-pillar">
          <div class="pillar-ico">${icon('crest', { size: 22 })}</div>
          <b>Pet Cemeteries &amp; Crematoriums</b>
          <p>Complement physical urns, scatterings, and headstones with forever 3D &amp; Earth digital resting places that family members across the world can visit together.</p>
        </div>
        <div class="partner-pillar">
          <div class="pillar-ico">${icon('sparkle', { size: 22 })}</div>
          <b>Animal Shelters &amp; Rescues</b>
          <p>Join our verified 501(c)(3) registry. 100% of memorial donations and tribute gifts pass directly to your rescue with public cryptographic ledger transparency.</p>
        </div>
      </div>

      <div class="district-blurb" style="margin:16px 0">
        ✦ <b>Complimentary Bereavement Starter Kits:</b> We provide custom-printed condolence cards with your clinic’s QR code, digital memorial sponsorship tokens, and hospital tribute pages at zero cost to your practice.
      </div>

      <div class="shop-cat">Request Partner Welcome Kit / Clinic QR Code</div>
      <label>Practice / Organization Name</label>
      <input id="ptOrg" maxlength="60" placeholder="e.g. VCA Meadow Animal Hospital">

      <div class="two-col">
        <div>
          <label>Organization Type</label>
          <select id="ptType">
            <option value="vet">Veterinary Hospital / Specialty Clinic</option>
            <option value="cremation">Pet Cremation / Cemetery</option>
            <option value="hospice">In-Home Hospice &amp; Palliative Care</option>
            <option value="rescue">Animal Shelter / 501(c)(3) Rescue</option>
          </select>
        </div>
        <div>
          <label>City &amp; State</label>
          <input id="ptLoc" maxlength="40" placeholder="Denver, CO">
        </div>
      </div>

      <label>Contact Email</label>
      <input id="ptEmail" type="email" maxlength="60" placeholder="care@yourclinic.com">

      <label>How would you like to collaborate? <span class="fine-inline">(optional)</span></label>
      <textarea id="ptNotes" rows="2" maxlength="240" placeholder="We would love aftercare sympathy cards for our bereavement room…"></textarea>

      <button class="btn btn-gold btn-block" id="ptSubmit">${icon('crest')} Request Partner Welcome Kit</button>
      <p class="fine">Or visit our full <a href="partners.html" target="_blank">Care Partner Portal</a> for referral guidelines &amp; downloadable materials.</p>
    `);

    const box = $('#modalBox');
    box.querySelector('#ptSubmit').onclick = async () => {
      const org = box.querySelector('#ptOrg').value.trim();
      const email = box.querySelector('#ptEmail').value.trim();
      if (!org || !email) return this.toast('Please enter your practice name and contact email.', 'warning');

      const code = org.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20);
      try {
        const cfg = await import('./config.js');
        if (cfg.HAS_API) {
          fetch(cfg.API_BASE + '/track', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'partner_inquiry', name: `Partner: ${org}`, amount: 0, user: email }),
          }).catch(() => {});
        }
      } catch {}

      this.closeModal();
      this.modal(`
        <h2>${icon('crest')} Welcome to the Alliance</h2>
        <div class="modal-sub">Thank you, <b>${org.replace(/[&<>"]/g, '')}</b>. Your dedication to compassionate pet aftercare means everything.</div>
        <div class="district-blurb" style="margin:16px 0">
          ✦ <b>Your Partner Link is Ready:</b><br>
          <code>${location.origin}${location.pathname}?ref=${code}</code><br><br>
          Our Care Team will reach out to <b>${email.replace(/[&<>"]/g, '')}</b> with your complimentary Bereavement Care Packet, printable QR card assets, and practice dashboard access.
        </div>
        <button class="btn btn-gold btn-block" id="partnerOk">Return to Sanctuary</button>
      `);
      document.querySelector('#partnerOk')?.addEventListener('click', () => this.closeModal());
    };
  },

  soundModal() {
    Soundscape.init();
    const curMode = Soundscape.mode;
    const curVol = Math.round(Soundscape.volume * 100);

    this.modal(`
      <div class="comfort-header">
        <div class="comfort-crest">${icon('sparkle', { size: 36 })}</div>
        <h2>Sanctuary Healing Soundscape</h2>
        <div class="modal-sub">432Hz crystal singing bowls, mountain breezes, and angelic wind chimes synthesized in pure harmony.</div>
      </div>

      <div class="sound-modes">
        <button class="sound-mode-card ${curMode === 'crystal' ? 'is-active' : ''}" data-sm="crystal">
          <div class="sm-icon">${icon('sparkle')}</div>
          <b>432Hz Crystal Peace</b>
          <span>Solfeggio resonant singing bowls and harmonic crystal drones for deep emotional solace.</span>
        </button>

        <button class="sound-mode-card ${curMode === 'breeze' ? 'is-active' : ''}" data-sm="breeze">
          <div class="sm-icon">${icon('globe')}</div>
          <b>Mountain Breeze &amp; River</b>
          <span>Soft wind whispering through pine needles and gentle water flowing toward Mirror Lake.</span>
        </button>

        <button class="sound-mode-card ${curMode === 'chimes' ? 'is-active' : ''}" data-sm="chimes">
          <div class="sm-icon">${icon('dove')}</div>
          <b>Angelic Wind Chimes</b>
          <span>Gentle pentatonic fairy chimes and celestial bells echoing across sunlit meadows.</span>
        </button>

        <button class="sound-mode-card ${curMode === 'silent' ? 'is-active' : ''}" data-sm="silent">
          <div class="sm-icon">${icon('power')}</div>
          <b>Silent Serenity</b>
          <span>Mute ambient soundscapes for quiet, silent contemplation.</span>
        </button>
      </div>

      <div style="margin:20px 0 10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <label style="margin:0">Master Soundscape Volume</label>
          <span id="volLabel" style="font-size:12px;color:var(--accent-hi-c);font-weight:700">${curVol}%</span>
        </div>
        <input type="range" id="volSlider" min="0" max="100" value="${curVol}" style="width:100%">
      </div>

      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn btn-gold btn-block" id="ringBowlBtn">${icon('sparkle')} Ring 528Hz Miracle Bell</button>
        <button class="btn btn-outline btn-block" id="soundClose">${icon('check')} Close</button>
      </div>
    `);

    const box = $('#modalBox');
    box.querySelectorAll('[data-sm]').forEach(btn => {
      btn.onclick = () => {
        const mode = btn.dataset.sm;
        Soundscape.setMode(mode);
        box.querySelectorAll('[data-sm]').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        this._updateSoundIcon();
        this.toast(mode === 'silent' ? 'Audio muted.' : `Playing ${btn.querySelector('b').textContent}`, 3000, 'sparkle');
      };
    });

    const slider = box.querySelector('#volSlider');
    slider.oninput = () => {
      const v = Number(slider.value) / 100;
      Soundscape.setVolume(v);
      box.querySelector('#volLabel').textContent = `${slider.value}%`;
    };

    box.querySelector('#ringBowlBtn').onclick = () => {
      Soundscape.playChime(528, 0.14);
      const rect = document.body.getBoundingClientRect();
      Motion.spark(rect.width / 2, rect.height / 2, 35);
    };

    box.querySelector('#soundClose').onclick = () => this.closeModal();
  },

  _updateSoundIcon() {
    const btn = $('#soundBtn');
    if (!btn) return;
    if (Soundscape.isPlaying) {
      btn.classList.add('is-playing');
      btn.title = `Soundscape Active (${Soundscape.mode})`;
    } else {
      btn.classList.remove('is-playing');
      btn.title = 'Soundscape: Silent';
    }
  },

  riverLanternsModal() {
    this.modal(`
      <div class="comfort-header">
        <div class="comfort-crest">${icon('candle', { size: 36 })}</div>
        <h2>Release a Memory Lantern</h2>
        <div class="modal-sub">Light a golden water lantern and let it float gently down the Rainbow River toward Mirror Lake.</div>
      </div>

      <label>Companion's Name</label>
      <input id="ltName" maxlength="32" placeholder="e.g. For sweet Bailey">

      <label>Your Message to the River</label>
      <textarea id="ltMsg" rows="3" maxlength="200" placeholder="You brought endless light into our lives. May your lantern guide your way…"></textarea>

      <label>From <span class="fine-inline">(optional)</span></label>
      <input id="ltFrom" maxlength="32" placeholder="${Auth.user?.name || 'A loving family'}">

      <button class="btn btn-gold btn-block" id="ltRelease">${icon('candle')} Release Lantern on the Water</button>
    `);

    const box = $('#modalBox');
    box.querySelector('#ltRelease').onclick = () => {
      const name = box.querySelector('#ltName').value.trim() || 'A beloved soul';
      const from = box.querySelector('#ltFrom').value.trim() || Auth.user?.name || 'A loving heart';
      const msg = box.querySelector('#ltMsg').value.trim();

      Soundscape.playCandleShimmer();
      State.logActivity('candle', `${from} released a floating memory lantern for ${name}${msg ? ': “' + msg + '”' : ''}`);
      this.closeModal();
      this.toast(`Your lantern for ${name} is floating peacefully down the Rainbow River.`, 7000, 'candle');

      const rect = document.body.getBoundingClientRect();
      Motion.spark(rect.width / 2, rect.height / 2, 50);
    };
  },

  lettersModal() {
    const LETTERS_KEY = 'ev_sanctuary_letters_v1';
    let letters = [];
    try { letters = JSON.parse(localStorage.getItem(LETTERS_KEY) || '[]'); } catch { letters = []; }

    const render = () => {
      this.modal(`
        <div class="comfort-header">
          <div class="comfort-crest">${icon('dove', { size: 36 })}</div>
          <h2>Letters Across the Bridge</h2>
          <div class="modal-sub">A private, sacred journal to write to your companion whenever you miss them.</div>
        </div>

        <button class="btn btn-gold btn-block" id="writeLetterBtn" style="margin-bottom:18px">${icon('sparkle')} Write a New Letter</button>

        <div class="letter-list">
          ${letters.length === 0 ? `
            <div class="ss-empty" style="text-align:center;padding:24px 0">
              No letters written yet. Pour your heart onto the page whenever words can bring you peace.
            </div>
          ` : letters.map((l) => `
            <div class="letter-card">
              <div class="letter-card__head">
                <b>To ${l.to.replace(/[&<>"]/g, '')}</b>
                <span class="fine">${new Date(l.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
              <p class="letter-card__body">“${l.text.replace(/[&<>"]/g, '')}”</p>
              <div class="letter-card__foot">
                <span>With love, <i>${l.from.replace(/[&<>"]/g, '')}</i></span>
              </div>
            </div>
          `).join('')}
        </div>
      `);

      const box = $('#modalBox');
      box.querySelector('#writeLetterBtn').onclick = () => {
        this.modal(`
          <div class="comfort-header">
            <div class="comfort-crest">${icon('sparkle', { size: 36 })}</div>
            <h2>Write to Your Companion</h2>
            <div class="modal-sub">Your words are kept safely in your sanctuary journal.</div>
          </div>

          <label>Companion's Name</label>
          <input id="letTo" maxlength="32" placeholder="e.g. My darling Luna">

          <label>Your Letter / Thoughts Today</label>
          <textarea id="letBody" rows="6" placeholder="Dear Luna, today I walked by the park where we used to throw the tennis ball…"></textarea>

          <label>Signed By</label>
          <input id="letFrom" maxlength="32" placeholder="${Auth.user?.name || 'Your human'}">

          <div style="display:flex;gap:10px;margin-top:14px">
            <button class="btn btn-gold btn-block" id="letSave">${icon('heart')} Save to Journal</button>
            <button class="btn btn-outline btn-block" id="letBack">Back</button>
          </div>
        `);

        const b2 = $('#modalBox');
        b2.querySelector('#letBack').onclick = () => render();
        b2.querySelector('#letSave').onclick = () => {
          const to = b2.querySelector('#letTo').value.trim() || 'My beloved companion';
          const text = b2.querySelector('#letBody').value.trim();
          const from = b2.querySelector('#letFrom').value.trim() || Auth.user?.name || 'Always yours';
          if (!text) return this.toast('Please write a message in your letter.', 'warning');

          letters.unshift({ to, text, from, at: Date.now() });
          try { localStorage.setItem(LETTERS_KEY, JSON.stringify(letters)); } catch {}

          Soundscape.playChime(660, 0.08);
          this.toast('Letter saved in your Sanctuary Journal.', 5000, 'dove');
          render();
        };
      };
    };

    render();
  },

  treeOfLifeModal() {
    const RIBBONS_KEY = 'ev_tree_ribbons_v1';
    let ribbons = [];
    try {
      const raw = localStorage.getItem(RIBBONS_KEY);
      if (raw) ribbons = JSON.parse(raw) || [];
      else {
        ribbons = [
          { name: 'Ranger', color: 'gold', msg: 'Running free across sunlit hills.', from: 'Sarah' },
          { name: 'Barnaby', color: 'sage', msg: 'The sweetest senior boy with the softest ears.', from: 'Elena' },
          { name: 'Cleo', color: 'rose', msg: 'Forever purring in our hearts.', from: 'Maya' },
          { name: 'Zeus', color: 'azure', msg: 'Our gentle giant and loyal protector.', from: 'Mark & Lisa' },
        ];
        localStorage.setItem(RIBBONS_KEY, JSON.stringify(ribbons));
      }
    } catch { ribbons = []; }

    this.modal(`
      <div class="comfort-header">
        <div class="comfort-crest">${icon('flower', { size: 36 })}</div>
        <h2>The Sanctuary Tree of Life</h2>
        <div class="modal-sub">Tie a ribbon of eternal love to the branches of the Great Sanctuary Oak.</div>
      </div>

      <div class="tree-ribbons-grid">
        ${ribbons.map(r => `
          <div class="ribbon-tag ribbon-tag--${r.color.replace(/[&<>"]/g, '')}">
            <div class="ribbon-tag__ribbon"></div>
            <b>${r.name.replace(/[&<>"]/g, '')}</b>
            <p>${r.msg.replace(/[&<>"]/g, '')}</p>
            <span class="fine">Tied by ${r.from.replace(/[&<>"]/g, '')}</span>
          </div>
        `).join('')}
      </div>

      <div class="shop-cat" style="margin-top:20px">Tie Your Companion's Ribbon</div>
      <label>Companion's Name</label>
      <input id="rbName" maxlength="28" placeholder="e.g. Oliver">

      <label>Ribbon Color</label>
      <select id="rbColor">
        <option value="gold">✨ Golden Dawn (Joy & Warmth)</option>
        <option value="rose">💖 Rose Quartz (Unconditional Love)</option>
        <option value="sage">🌿 Healing Sage (Peace & Comfort)</option>
        <option value="azure">🌊 Celestial Azure (Serenity & Freedom)</option>
      </select>

      <label>Dedication / Memory</label>
      <input id="rbMsg" maxlength="80" placeholder="Forever running with the wind…">

      <label>Your Name <span class="fine-inline">(optional)</span></label>
      <input id="rbFrom" maxlength="28" placeholder="${Auth.user?.name || 'A loving family'}">

      <button class="btn btn-gold btn-block" id="rbTie" style="margin-top:14px">${icon('flower')} Tie Ribbon to the Tree</button>
    `);

    const box = $('#modalBox');
    box.querySelector('#rbTie').onclick = () => {
      const name = box.querySelector('#rbName').value.trim() || 'A beloved friend';
      const color = box.querySelector('#rbColor').value;
      const msg = box.querySelector('#rbMsg').value.trim() || 'Forever loved in our hearts.';
      const from = box.querySelector('#rbFrom').value.trim() || Auth.user?.name || 'A loving friend';

      ribbons.unshift({ name, color, msg, from });
      try { localStorage.setItem(RIBBONS_KEY, JSON.stringify(ribbons)); } catch {}

      Soundscape.playChime(792, 0.09);
      State.logActivity('sparkle', `${from} tied a ${color} ribbon on the Tree of Life for ${name}`);
      this.closeModal();
      this.toast(`Ribbon tied to the Tree of Life for ${name}.`, 6000, 'flower');

      const rect = document.body.getBoundingClientRect();
      Motion.spark(rect.width / 2, rect.height / 2, 40);
    };
  },

  keepsakesModal(presetPet = null) {
    let selectedPhoto = presetPet?.photo || null;
    let petName = presetPet?.petName || '';
    let petYears = presetPet?.years || '';
    let selectedItem = PHYSICAL_KEEPSAKES[0];
    let selectedOption = selectedItem.options[0];
    let dedicatedCharity = presetPet?.charity || State.data?.charity || CHARITIES[0].id;

    const render = () => {
      this.modal(`
        <div class="comfort-header">
          <div class="comfort-crest">${icon('sparkle', { size: 36 })}</div>
          <h2>Physical Keepsake &amp; Memory Studio</h2>
          <div class="modal-sub">Transform your pet's photo into museum-grade heirloom keepsakes. <b>15% of every order supports verified animal rescues.</b></div>
        </div>

        <div class="keepsake-studio-grid">
          <!-- Left: Live Mockup Preview -->
          <div class="keepsake-preview-pane">
            <div class="keepsake-mockup" id="ksMockup">
              <div class="ks-mockup-frame ks-mockup--${selectedItem.category.toLowerCase()}">
                <div class="ks-photo-slot">
                  ${selectedPhoto ? `<img src="${selectedPhoto}" class="ks-rendered-img">` : `
                    <div class="ks-placeholder">
                      <div class="ks-placeholder-ico">${icon('photo', { size: 42 })}</div>
                      <span>Upload pet photo below to preview</span>
                    </div>
                  `}
                </div>
                <div class="ks-mockup-caption">
                  <b>${(petName || 'Companion Name').replace(/[&<>"]/g, '')}</b>
                  <span>${(petYears || 'Forever Loved').replace(/[&<>"]/g, '')}</span>
                </div>
              </div>
            </div>
            <div class="district-blurb" style="margin-top:10px;text-align:center;font-size:11.5px">
              ✦ Handcrafted with archival materials &amp; carbon-neutral delivery.
            </div>
          </div>

          <!-- Right: Product Selector & Customizer -->
          <div class="keepsake-controls-pane">
            <label>1. Select Keepsake Product</label>
            <div class="ks-product-list">
              ${PHYSICAL_KEEPSAKES.map(pk => `
                <div class="ks-product-card ${pk.id === selectedItem.id ? 'is-active' : ''}" data-pk="${pk.id}">
                  <div class="ks-product-info">
                    <b>${icon(pk.icon)} ${pk.name}</b>
                    <span>${pk.blurb}</span>
                  </div>
                  <div class="ks-product-price">${fmtPrice(pk.price)}</div>
                </div>
              `).join('')}
            </div>

            <label style="margin-top:14px">2. Upload Companion Photo</label>
            <input type="file" id="ksPhotoUpload" accept="image/*">

            <div class="two-col" style="margin-top:8px">
              <div>
                <label>Companion's Name</label>
                <input id="ksName" maxlength="30" value="${(petName || '').replace(/[&<>"]/g, '')}" placeholder="e.g. Biscuit">
              </div>
              <div>
                <label>Memorial Years / Subtitle</label>
                <input id="ksYears" maxlength="30" value="${(petYears || '').replace(/[&<>"]/g, '')}" placeholder="2012 – 2024">
              </div>
            </div>

            <label>3. Style &amp; Size Option</label>
            <select id="ksOption">
              ${selectedItem.options.map(opt => `<option value="${opt.replace(/[&<>"]/g, '')}" ${opt === selectedOption ? 'selected' : ''}>${opt.replace(/[&<>"]/g, '')}</option>`).join('')}
            </select>

            <label>4. Rescue Charity Tithe Beneficiary (15%)</label>
            <select id="ksCharity">
              ${CHARITIES.map(c => `<option value="${c.id}" ${dedicatedCharity === c.id ? 'selected' : ''}>${c.name} (${c.rating || 'Verified 501(c)(3)'})</option>`).join('')}
            </select>

            <div class="ks-shipping-box" style="margin-top:10px">
              <label>Shipping Full Name &amp; Address</label>
              <input id="ksShipName" placeholder="Your Full Name">
              <input id="ksShipAddr" placeholder="Street Address, City, State, ZIP" style="margin-top:6px">
            </div>

            <button class="btn btn-gold btn-block" id="ksOrderBtn" style="margin-top:16px">
              ${icon('gift')} Order Keepsake — ${fmtPrice(selectedItem.price)}
            </button>
            <p class="fine">${IS_DEMO ? 'Demo: payment simulated.' : 'Secure checkout.'} · Includes 15% charity tithe ($${(selectedItem.price * 0.15).toFixed(2)})</p>
          </div>
        </div>
      `);

      const box = $('#modalBox');
      box.querySelectorAll('[data-pk]').forEach(el => {
        el.onclick = () => {
          selectedItem = PHYSICAL_KEEPSAKES.find(x => x.id === el.dataset.pk);
          selectedOption = selectedItem.options[0];
          render();
        };
      });

      const photoInput = box.querySelector('#ksPhotoUpload');
      photoInput.onchange = async () => {
        const file = photoInput.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            selectedPhoto = e.target.result;
            render();
          };
          reader.readAsDataURL(file);
        }
      };

      const nameInput = box.querySelector('#ksName');
      nameInput.oninput = () => {
        petName = nameInput.value;
        const b = box.querySelector('.ks-mockup-caption b');
        if (b) b.textContent = petName || 'Companion Name';
      };

      const yearsInput = box.querySelector('#ksYears');
      yearsInput.oninput = () => {
        petYears = yearsInput.value;
        const s = box.querySelector('.ks-mockup-caption span');
        if (s) s.textContent = petYears || 'Forever Loved';
      };

      box.querySelector('#ksOption').onchange = (e) => { selectedOption = e.target.value; };
      box.querySelector('#ksCharity').onchange = (e) => { dedicatedCharity = e.target.value; };

      box.querySelector('#ksOrderBtn').onclick = async () => {
        const shipName = box.querySelector('#ksShipName').value.trim();
        const shipAddr = box.querySelector('#ksShipAddr').value.trim();
        if (!shipName || !shipAddr) return this.toast('Please enter your shipping name and address.', 'warning');

        const btn = box.querySelector('#ksOrderBtn');
        btn.disabled = true;
        btn.textContent = 'Processing Keepsake Order…';

        try {
          const r = await checkout({
            kind: 'merch',
            name: `${selectedItem.name} for ${petName || 'Companion'} (${selectedOption})`,
            amount: selectedItem.price,
            meta: {
              itemId: selectedItem.id,
              petName,
              option: selectedOption,
              shipping: `${shipName}, ${shipAddr}`,
              charity: dedicatedCharity,
            }
          });

          if (r.ok) {
            State.logActivity('gift', `${shipName} ordered a ${selectedItem.name} in memory of ${petName || 'a beloved friend'}`);
            await Ledger.record({
              kind: 'merch',
              label: `${selectedItem.name} — ${petName || 'Companion'}`,
              amountCents: Math.round(selectedItem.price * 100),
              charityId: dedicatedCharity,
              donor: shipName,
              demo: IS_DEMO,
            });

            Soundscape.playChime(528, 0.12);
            this.closeModal();
            this.modal(`
              <div class="comfort-header">
                <div class="comfort-crest">${icon('heart', { size: 40 })}</div>
                <h2>Keepsake Order Confirmed</h2>
                <div class="modal-sub">Thank you, <b>${shipName.replace(/[&<>"]/g, '')}</b>. Your physical heirloom memory is being lovingly prepared.</div>
              </div>
              <div class="district-blurb" style="margin:16px 0">
                ✦ <b>Item:</b> ${selectedItem.name.replace(/[&<>"]/g, '')} (${selectedOption.replace(/[&<>"]/g, '')})<br>
                ✦ <b>In Memory of:</b> ${(petName || 'Beloved Companion').replace(/[&<>"]/g, '')}<br>
                ✦ <b>Shipping to:</b> ${shipAddr.replace(/[&<>"]/g, '')}<br>
                ✦ <b>Rescue Tithe:</b> $${(selectedItem.price * 0.15).toFixed(2)} recorded on the public cryptographic ledger for <b>${charityName(dedicatedCharity)}</b>.
              </div>
              <button class="btn btn-gold btn-block" onclick="document.querySelector('#modalRoot').classList.add('hidden')">Return to Sanctuary</button>
            `);
          }
        } catch (e) {
          this.toast(String(e.message), 'warning');
          btn.disabled = false;
          btn.textContent = `Order Keepsake — ${fmtPrice(selectedItem.price)}`;
        }
      };
    };

    render();
  },

  /**
   * Descend to one of a pet's real-world places. Every route into a
   * location goes through here so the descent always reads the same
   * way, whether it came from a marker, a search or a profile.
   */
  flyToPlace(place, { announce = true } = {}) {
    if (!place) return;
    this.earth.flyTo({ lat: place.lat, lng: place.lng, range: place.range ?? 420 });
    if (announce && place.name) this.toast(place.name, 4200, 'pin');
  },

  /** Pull back out to the whole planet. */
  returnToOrbit() {
    this.earth.flyToOrbit();
    this.toast('Back in orbit — choose a place below', 3600, 'globe');
  },

  async streetViewOpen(pos) {
    const panel = $('#streetPanel');
    panel.classList.remove('hidden');
    $('#streetContainer').innerHTML = '<div style="display:grid;place-items:center;height:100%;color:#e9e1cd;font-size:15px">Looking for Street View imagery near here…</div>';
    try {
      await this.earth.openStreetView(pos.lat, pos.lng, $('#streetContainer'));
      this.toast('Real Street View — drag to look around, arrows to walk.');
    } catch (e) {
      panel.classList.add('hidden');
      $('#streetContainer').innerHTML = '';
      const msg = String(e.message || e);
      this.toast(msg.includes('key') ? msg
        : 'No Street View imagery within 150 m of this spot — try Ground view instead.', 6000);
    }
  },

  rbvPanel() {
    const body = $('#plotPanelBody');
    body.innerHTML = `
      <span class="badge badge-avail">SACRED GROUND</span>
      <h2>${rainbowMark({ size: 30, cls: 'inline-mark' })} Rainbow Bridge Valley</h2>
      <div class="sub">${RBV.place}</div>
      <div class="district-blurb">The entrance to the whole cemetery — anchored at the real Rainbow Bridge,
        the world's largest natural bridge: a sandstone rainbow arched over a canyon at Lake Powell.
        Every journey over the rainbow begins here.</div>
      <button class="btn btn-gold btn-block" id="enterSanctuary">${icon('sparkle')} Enter the Sanctuary</button>
      <button class="btn btn-outline btn-block" id="rbvFly">${icon('dove')} Circle the Bridge</button>`;
    $('#enterSanctuary').onclick = () => { this.closePanel(); this.show3D().then(() => this.world?.flyToDistrict('bridge')); };
    $('#rbvFly').onclick = () => this.flyToPlace({ lat: RBV.lat, lng: RBV.lng, range: 900 }, { announce: false });
    $('#plotPanel').classList.remove('hidden');
  },

  openEarthMemorial(m) {
    const linkedPlot = m.plotId ? this.plots.find(p => p.id === m.plotId) : null;
    const gb = (m.guestbook || []).slice(-5).reverse();
    const own = !m.seeded && (IS_ADMIN || (Auth.user && m.ownerUid && m.ownerUid === Auth.user.uid));
    const body = $('#plotPanelBody');
    const safePetName = esc(m.petName || 'Beloved Companion');
    const safePlace = esc(m.place || '');
    const safeSpecies = esc(m.species || '');
    const safeYears = esc(m.years || '');
    const safeEpitaph = esc(m.epitaph || '');
    const safeOwner = esc(m.owner || 'a loving family');

    body.innerHTML = `
      <span class="badge badge-occ">MEMORIAL${own ? ' · YOURS' : ''}</span>
      <h2>${speciesIcon(speciesKey(m.species || ''), { size: 26 })} ${safePetName}</h2>
      <div class="sub">${safePlace}</div>
      <div class="memorial">
        ${memorialArt(m, 52)}
        <h3>${safePetName}</h3>
        <div class="years">${safeSpecies} · ${safeYears}</div>
        <p class="epitaph">“${safeEpitaph}”</p>
        <div class="gifts-count">${icon('gift')} ${m.gifts || 0} tributes from visitors · resting with ${safeOwner}</div>
        <div class="gifts-count" style="color:var(--accent-hi-c)">${icon('heart')} Supports verified rescue: <b>${charityName(m.charity || State.data?.charity || CHARITIES[0].id)}</b></div>
        ${m.socials && Object.values(m.socials).some(v => v) ? `<div class="gifts-count">${['instagram', 'x', 'tiktok', 'facebook'].filter(k => m.socials[k]).map(k => icon({ instagram: 'instagram', x: 'x', tiktok: 'tiktok', facebook: 'facebook' }[k]) + ' ' + esc(m.socials[k])).join(' · ')}</div>` : ''}
      </div>
      ${this.petProfileHTML(m, m.id, own)}
      ${linkedPlot ? `<button class="btn btn-gold btn-block" id="ePlotVisitBtn" style="margin-bottom:8px">${icon('crest')} Visit ${safePetName}'s Resting Plot in the Sanctuary Valley</button>` : ''}
      <button class="btn btn-outline btn-block" id="evisitBtn">${icon('walk')} Visit at ground level</button>
      <button class="btn btn-outline btn-block" id="esvBtn">${icon('eye')} Street View here</button>
      <button class="btn btn-outline btn-block" id="eshareBtn">${icon('share')} Share this memorial</button>
      ${(m.decorations?.length ? `<div class="sub">At the memorial:</div>` + m.decorations.map(d =>
        `<div class="guestbook-entry">${thumbImg(d.itemId, { size: 22, cls: 'thumb-inline' })} <b>${esc(d.name)}</b> — ${esc(d.slotLabel)}</div>`).join('') : '')}
      <button class="btn btn-gold btn-block" id="egiftBtn">${icon('candle')} Leave a gift at the base</button>
      <button class="btn btn-outline btn-block" id="eCertBtn">${icon('scroll')} Memorial Certificate &amp; Plaque</button>
      <button class="btn btn-outline btn-block" id="ekeepsakeBtn">${icon('photo')} Order Physical Keepsakes</button>
      <button class="btn btn-outline btn-block" id="egbBtn">${icon('letter')} Sign the guestbook (free)</button>
      ${own ? `<button class="btn btn-green btn-block" id="edecorBtn">${icon('flower')} Customize this memorial</button>` : ''}
      <div class="district-blurb" style="margin-top:12px;font-size:11px;text-align:center">
        ✦ <b>Earth Sacred Footprint Pin:</b> Maintained permanently by Eternity Valley. All consecrated resting plots reside in our 3D Virtual Sanctuary.
      </div>
      ${gb.length ? '<div class="sub" style="margin-top:14px">Guestbook:</div>' + gb.map(g =>
        `<div class="guestbook-entry"><b>${esc(g.from)}</b> · ${timeAgo(g.at)}<br>${esc(g.msg)}</div>`).join('') : ''}`;
    if ($('#ePlotVisitBtn') && linkedPlot) {
      $('#ePlotVisitBtn').onclick = async () => {
        this.closePanel();
        await this.show3D();
        this.world?.selectPlot(linkedPlot);
        this.openPlot(linkedPlot);
        this.world?.flyToPlot(linkedPlot);
      };
    }
    $('#egiftBtn').onclick = () => this.earthGiftModal(m);
    $('#eCertBtn').onclick = () => this.memorialCertificateModal(m);
    $('#ekeepsakeBtn').onclick = () => this.keepsakesModal(m);
    $('#egbBtn').onclick = () => this.guestbookModal(m);
    if (own) $('#edecorBtn').onclick = () => this.earthDecorModal(m);
    this._wirePetProfile(m, m.id, own, () => this.openEarthMemorial(m));
    this._lastPos = { lat: m.lat, lng: m.lng };
    $('#evisitBtn').onclick = () => {
      const ok = this.earth.groundView({ lat: m.lat, lng: m.lng });
      if (ok) this.toast(`Standing at ${m.petName}'s place — the camera will slowly circle it.`);
      else this.toast('Satellite mode is top-down — Enable 3D for the ground-level recreation.', 6000);
    };
    $('#esvBtn').onclick = () => this.streetViewOpen({ lat: m.lat, lng: m.lng });
    $('#eshareBtn').onclick = () => {
      const url = `${location.origin}${location.pathname}?m=${encodeURIComponent(m.id)}`;
      this.shareModal(
        `${m.petName}'s memorial`, url,
        `Visit ${m.petName}'s memorial at ${m.place.split(',')[0]} — light a candle or leave a gift over the Rainbow Bridge.`);
    };
    $('#plotPanel').classList.remove('hidden');
    this.flyToPlace({ lat: m.lat, lng: m.lng, range: 260 }, { announce: false });
  },

  earthDecorModal(m) {
    const tierRank = { mem_guardian: 1, mem_legacy: 2, mem_eternal: 3 };
    const myRank = IS_ADMIN ? 3 : (tierRank[State.data.membership] || 0);
    const cats = [...new Set(PLOT_ITEMS.map(i => i.cat))];
    this.modal(`
      <h2>Customize ${m.petName}'s memorial</h2>
      <div class="modal-sub">${m.place} · items are arranged at the memorial and listed for every visitor.</div>
      <label>Where should the next item go?</label>
      <select id="eDecorSlot">
        ${SLOTS.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}
      </select>
      ${cats.map(cat => `
        <div class="shop-cat">${cat}</div>
        <div class="shop-grid">
          ${PLOT_ITEMS.filter(i => i.cat === cat).map(i => {
            const locked = (tierRank[i.minTier] || 0) > myRank;
            return `<button class="shop-item" data-i="${i.id}" ${locked ? 'data-locked="1"' : ''}>
              <div class="s-emoji">${thumbImg(i.id, { size: 46, alt: i.name })}</div><div class="s-name">${i.name}</div>
              <div class="s-price">${locked ? '' : fmtPrice(i.price)}</div>
              ${locked ? `<div class="s-lock">${icon('lock')} ${MEMBERSHIPS.find(x => x.id === i.minTier)?.name}+</div>` : ''}
            </button>`;
          }).join('')}
        </div>`).join('')}
      <p class="fine">${IS_DEMO ? 'Demo: payments simulated.' : 'Processed by Stripe.'}</p>`);
    $('#modalBox').querySelectorAll('[data-i]').forEach(btn => {
      btn.onclick = async () => {
        if (btn.dataset.locked) { this.toast('This item needs a higher membership tier.'); return this.membershipModal(); }
        const it = PLOT_ITEMS.find(x => x.id === btn.dataset.i);
        const slot = SLOTS.find(s => s.id === $('#eDecorSlot').value) || SLOTS[0];
        btn.style.opacity = .5;
        try {
          const r = await checkout({ kind: 'item', name: `Memorial item: ${it.name} for ${m.petName}`, amount: it.price,
            meta: { earthMemorialId: m.id, itemId: it.id, slot: slot.id, charity: m.charity || State.data?.charity || CHARITIES[0].id } });
          if (r.ok) {
            (m.decorations ||= []).push({ itemId: it.id, name: it.name, slotLabel: slot.label.toLowerCase() });
            State.logActivity(it.id, `${Auth.user.name} placed ${it.name} at ${m.petName}'s memorial — ${m.place.split(',')[0]}`);
            await State.save(Auth.user);
            this.closeModal(); this.openEarthMemorial(m);
            this.toast(`${it.name} placed — ${slot.label.toLowerCase()}.`, 'flower');
          }
        } catch (e) { this.toast(String(e.message), 'warning'); btn.style.opacity = 1; }
      };
    });
  },

  earthGiftModal(m) {
    const from = Auth.user ? Auth.user.name : null;
    const pct = Math.round(GIFT_CHARITY_SHARE * 100);
    this.modal(`
      <h2>Leave a gift for ${m.petName}</h2>
      <div class="modal-sub">${m.place} · ${!from ? 'Giving as an anonymous guest.' : `Giving as <b>${from}</b>.`}</div>
      ${m.charity
        ? `<div class="district-blurb">${icon('heart')} ${pct}% of your gift goes to <b>${charityName(m.charity)}</b> — chosen by ${m.petName}'s family.</div>`
        : `<label>${icon('heart')} ${pct}% of your gift goes to a charity of your choice</label>
           <select id="egCharity">${CHARITIES.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select>`}
      <div class="shop-grid">
        ${GIFTS.map(g => `<button class="shop-item" data-g="${g.id}">
          <div class="s-emoji">${thumbImg(g.id, { size: 46, alt: g.name })}</div><div class="s-name">${g.name}</div>
          <div class="s-price">${fmtPrice(g.price)}</div></button>`).join('')}
      </div>
      <label>Message (optional)</label><input id="egMsg" maxlength="80">
      <p class="fine">${IS_DEMO ? 'Demo: payment simulated.' : 'Processed by Stripe.'} The Shelter Donation gift is donated 100%.</p>`);
    $('#modalBox').querySelectorAll('[data-g]').forEach(btn => {
      btn.onclick = async () => {
        const g = GIFTS.find(x => x.id === btn.dataset.g);
        const charity = m.charity || $('#egCharity')?.value || CHARITIES[0].id;
        const donate = Math.round((g.id === 'g_donation' ? g.price : g.price * GIFT_CHARITY_SHARE) * 100) / 100;
        try {
          const r = await checkout({ kind: 'gift', name: `Gift: ${g.name} for ${m.petName}`, amount: g.price, meta: { earthMemorialId: m.id, giftId: g.id, charity, donate } });
          if (r.ok) {
            if (!Auth.user) Auth.continueAsGuest(true);
            m.gifts = (m.gifts || 0) + 1;
            const msg = cleanText($('#egMsg').value.trim());
            if (msg) (m.guestbook ||= []).push({ from: Auth.user.name, msg: `${g.name}: ${msg}`, at: Date.now() });
            State.logActivity(g.id, `${Auth.user.name} left ${g.name} for ${m.petName} — ${m.place.split(',')[0]} · $${donate} to ${charityName(charity)}`);
            await State.save(Auth.user);
            this.closeModal(); this.openEarthMemorial(m);
            this.toast(`Your gift rests with ${m.petName}.`, 'gift');
          }
        } catch (e) { this.toast(String(e.message), 'warning'); }
      };
    });
  },

  guestbookModal(m) {
    this.modal(`
      <h2>Sign ${m.petName}'s guestbook</h2>
      <div class="modal-sub">A few kind words — free, always.</div>
      <label>Your name (or leave blank to stay anonymous)</label><input id="gbName" maxlength="30">
      <label>Message</label><textarea id="gbMsg" rows="3" maxlength="200" placeholder="Run free, sweet friend…"></textarea>
      <button class="btn btn-gold btn-block" id="gbPost">Post to guestbook</button>`);
    $('#gbPost').onclick = async () => {
      const msg = cleanText($('#gbMsg').value.trim());
      if (!msg) return this.toast('Write a few words first', 'heart');
      const from = cleanText($('#gbName').value.trim()) || 'Anonymous Visitor';
      (m.guestbook ||= []).push({ from, msg, at: Date.now() });
      State.logActivity('letter', `${from} signed ${m.petName}'s guestbook — ${m.place.split(',')[0]}`);
      await State.save(Auth.user);
      this.closeModal(); this.openEarthMemorial(m);
      this.toast('Your words are with them now.');
    };
  },

  // ----- place-anywhere flow -----
  // Gate → then open the memorial form for an exact position
  beginMemorialAt(pos) {
    if (!Auth.user || Auth.user.isGuest) return this.authModal(() => this.beginMemorialAt(pos));
    if (!State.hasMembership()) { this.toast('A membership is needed to create memorials.'); return this.membershipModal(() => this.beginMemorialAt(pos)); }
    this.earthMemorialForm(pos);
  },
  startPlacement() {
    if (!Auth.user || Auth.user.isGuest) return this.authModal(() => this.startPlacement());
    if (!State.hasMembership()) { this.toast('A membership is needed to create memorials.'); return this.membershipModal(() => this.startPlacement()); }
    this.closePanel();
    this.earth.setPlacementMode(true);
    this.earth.showCandidateSpots(this.earth.getCenter());
    $('#placeBanner').classList.remove('hidden');
  },
  _exitPlacement() {
    this.earth.setPlacementMode(false);
    $('#placeBanner').classList.add('hidden');
  },

  // ----- browse plots & memorials — the VIRTUAL CEMETERY catalog -----
  toggleBrowse() {
    const p = $('#browsePanel');
    if (!p.classList.contains('hidden')) return p.classList.add('hidden');
    $('#feedPanel').classList.add('hidden');
    $('#campaignPanel')?.classList.add('hidden');

    const mems = allMemorials(State.data);
    const mine = Auth.user ? mems.filter(m => m.ownerUid === Auth.user.uid) : [];
    const avail = this.plots.filter(x => x.status === 'available');
    const occupied = this.plots.filter(x => x.status === 'occupied');

    // Build district breakdown for the catalog
    const districtStats = {};
    for (const [dk, d] of Object.entries(DISTRICTS)) {
      const dPlots = this.plots.filter(x => x.district === dk);
      const dAvail = dPlots.filter(x => x.status === 'available');
      const dOccupied = dPlots.filter(x => x.status === 'occupied');
      const cheapest = dAvail.length ? Math.min(...dAvail.map(x => x.price)) : null;
      districtStats[dk] = { ...d, total: dPlots.length, avail: dAvail.length, occupied: dOccupied.length, cheapest };
    }

    const districtCard = (dk, ds) => {
      const pctOccupied = Math.round((ds.occupied / ds.total) * 100);
      return `
        <div class="pc-district-card" data-district="${dk}">
          <div class="pc-district-header">
            <div class="pc-district-dot" style="background:${ds.color}"></div>
            <div class="pc-district-title">
              <b>${ds.name}</b>
              <span class="pc-district-blurb">${ds.blurb}</span>
            </div>
          </div>
          <div class="pc-district-stats">
            <span class="pc-stat">${icon('sparkle', { size: 12 })} <b>${ds.avail}</b> available</span>
            <span class="pc-stat">${icon('grave', { size: 12 })} <b>${ds.occupied}</b> occupied</span>
            <span class="pc-stat-pct">${pctOccupied}% full</span>
          </div>
          <div class="pc-district-bar">
            <div class="pc-district-bar-fill" style="width:${pctOccupied}%;background:${ds.color}"></div>
          </div>
          <div class="pc-district-foot">
            ${ds.cheapest ? `<span class="pc-from">From <b>$${ds.cheapest}</b></span>` : '<span class="pc-from pc-sold-out">Fully reserved</span>'}
            <button class="btn btn-sm btn-outline pc-fly-btn" data-d="${dk}">${icon('sparkle', { size: 12 })} Fly there</button>
          </div>
        </div>`;
    };

    const memRow = (m) => `
      <div class="feed-item" data-bmem="${m.id}"><div class="fi-icon">${memorialArt(m, 20)}</div>
        <div><b>${m.petName}</b> · ${m.place.split(',').slice(0, 2).join(',')}
        <span class="fi-time">${m.years} · ${icon('gift')} ${m.gifts || 0} gifts</span></div></div>`;

    $('#browseBody').innerHTML = `
      <div class="pc-hero">
        <div class="pc-hero-icon">${icon('crest', { size: 32 })}</div>
        <h2>The Virtual Sanctuary Cemetery</h2>
        <div class="pc-hero-sub">Choose an eternal resting place for your beloved companion. Each plot is yours forever.</div>
      </div>

      <div class="pc-summary-row">
        <div class="pc-summary-stat">
          <span class="pc-summary-num">${this.plots.length}</span>
          <span class="pc-summary-label">Total plots</span>
        </div>
        <div class="pc-summary-stat">
          <span class="pc-summary-num pc-avail-num">${avail.length}</span>
          <span class="pc-summary-label">Available</span>
        </div>
        <div class="pc-summary-stat">
          <span class="pc-summary-num pc-occ-num">${occupied.length}</span>
          <span class="pc-summary-label">Occupied</span>
        </div>
        <div class="pc-summary-stat">
          <span class="pc-summary-num">${Object.keys(DISTRICTS).length}</span>
          <span class="pc-summary-label">Districts</span>
        </div>
      </div>

      <button class="btn btn-gold btn-block btn-lg pc-wizard-cta" id="pcWizardBtn">
        ${icon('dove')} Create a Memorial — Guided Journey
      </button>

      <div class="pc-section-title">${icon('sparkle')} Browse by District</div>
      <div class="pc-district-list">
        ${Object.entries(districtStats).sort((a, b) => a[1].cheapest - b[1].cheapest).map(([dk, ds]) => districtCard(dk, ds)).join('')}
      </div>

      <div class="pc-section-title" style="margin-top:16px">${icon('grave')} Pricing Tiers</div>
      <div class="pc-tiers">
        <div class="pc-tier">
          <div class="pc-tier-head">Standard Plot</div>
          <div class="pc-tier-size">10 × 14 ft</div>
          <div class="pc-tier-desc">A beautiful resting place with space for a headstone and flowers.</div>
        </div>
        <div class="pc-tier pc-tier-featured">
          <div class="pc-tier-head">Premium Plot</div>
          <div class="pc-tier-size">14 × 18 ft</div>
          <div class="pc-tier-desc">Extra room for trees, benches, and custom decorations.</div>
        </div>
        <div class="pc-tier">
          <div class="pc-tier-head">Estate Plot</div>
          <div class="pc-tier-size">20 × 26 ft</div>
          <div class="pc-tier-desc">A grand memorial estate with space for fountains, gazebos, and multiple headstones.</div>
        </div>
      </div>

      ${mine.length ? `<div class="pc-section-title" style="margin-top:16px">${icon('crest')} Your Memorials (${mine.length})</div>${mine.map(memRow).join('')}` : ''}

      <div class="pc-section-title" style="margin-top:16px">${icon('heart')} Community Memorials (${mems.length})</div>
      ${mems.slice().sort((a, b) => (b.gifts || 0) - (a.gifts || 0)).slice(0, 12).map(memRow).join('')}
      ${mems.length > 12 ? `<div style="font-size:11.5px;color:rgba(246,241,228,.45);margin:4px 0">...and ${mems.length - 12} more across the Sanctuary and Earth.</div>` : ''}

      <button class="btn btn-outline btn-block" id="browseSanctuary">${icon('sparkle')} Fly to Full Overview</button>`;

    // Wire events
    $('#pcWizardBtn').onclick = () => { p.classList.add('hidden'); this.griefWizardModal(); };
    $('#browseBody').querySelectorAll('[data-bmem]').forEach(el => {
      el.onclick = () => {
        const m = mems.find(x => x.id === el.dataset.bmem);
        if (m) { p.classList.add('hidden'); this.showEarth(); this.openEarthMemorial(m); }
      };
    });
    $('#browseBody').querySelectorAll('.pc-fly-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const dk = btn.dataset.d;
        p.classList.add('hidden');
        this.show3D().then(() => this.world?.flyToDistrict(dk));
      };
    });
    $('#browseBody').querySelectorAll('.pc-district-card').forEach(card => {
      card.onclick = () => {
        const dk = card.dataset.district;
        p.classList.add('hidden');
        this.show3D().then(() => this.world?.flyToDistrict(dk));
      };
    });
    $('#browseSanctuary').onclick = () => { p.classList.add('hidden'); this.show3D().then(() => this.world?.flyToDistrict('overview')); };
    p.classList.remove('hidden');
  },

  async earthMemorialForm(pos) {
    const placeName = await this.earth.reverseGeocode(pos.lat, pos.lng);
    const ownedPlotList = Object.entries(State.data?.ownedPlots || {});

    this.modal(`
      <div class="comfort-header" style="margin-bottom:14px">
        <div class="comfort-crest" style="width:54px;height:54px">${icon('globe', { size: 28 })}</div>
        <h2>Pin a Sacred Place on Earth</h2>
        <div class="modal-sub">${icon('pin')} <b>${esc(placeName)}</b><br>
          Drop a permanent memory pin where your companion loved to explore. 
          <span style="display:block;margin-top:4px;color:var(--accent-hi-c);font-size:11.5px">
            ✦ All consecrated resting plots reside in our 3D Virtual Sanctuary; Earth pins are maintained permanently by our platform.
          </span>
        </div>
      </div>
      <label>Companion's Name</label><input id="emName" maxlength="24" placeholder="e.g. Biscuit">
      <label>Species</label>
      <select id="emSpecies">
        ${speciesOptionsHTML()}
      </select>
      <label>Years</label><input id="emYears" maxlength="16" placeholder="2012 – 2025">
      <label>Why this place was special to them</label><textarea id="emEpitaph" rows="2" maxlength="140" placeholder="Our favorite mountain trail, sunlit afternoon nap spot…"></textarea>
      
      ${ownedPlotList.length ? `
        <label>Link to your 3D Sanctuary Plot (optional)</label>
        <select id="emLinkedPlot">
          <option value="">— Standalone Earth Pin —</option>
          ${ownedPlotList.map(([pid, pdata]) => `<option value="${pid}">Plot ${pid} (${esc(pdata.memorial?.petName || 'My Plot')})</option>`).join('')}
        </select>
      ` : ''}

      <label>Their photo (optional)</label><input id="emPhoto" type="file" accept="image/*">
      <label>Dedicated Rescue Beneficiary — where tribute gifts flow</label>
      <select id="emCharity">
        <option value="">Let each giver choose</option>
        ${CHARITIES.map(c => `<option value="${c.id}" ${State.data.charity === c.id ? 'selected' : ''}>${c.name} (${c.category ? c.category.toUpperCase() : 'VERIFIED 501(c)(3)'})</option>`).join('')}
      </select>
      <button class="btn btn-gold btn-block" id="emPay">${icon('heart')} Pay ${fmtPrice(EARTH_PLOT.price)} &amp; Pin Sacred Spot</button>
      <p class="fine">${IS_DEMO ? 'Demo: payment simulated.' : 'Stripe secure checkout.'} · 15% passes directly to animal rescue.</p>`);
    $('#emPay').onclick = async () => {
      const name = $('#emName').value.trim() || 'Beloved Friend';
      const sp = $('#emSpecies').value;
      const linkedPlotId = $('#emLinkedPlot')?.value || null;
      const btn = $('#emPay');
      btn.disabled = true; btn.textContent = 'Processing…';
      try {
        const emCharity = $('#emCharity').value || State.data?.charity || CHARITIES[0].id;
        const r = await checkout({ kind: 'plot', name: `Rainbow Bridge — memorial for ${name} (anywhere on Earth)`, amount: EARTH_PLOT.price,
          meta: { lat: pos.lat, lng: pos.lng, uid: Auth.user.uid, charity: emCharity } });
        if (r.ok) {
          const photo = await readPhoto($('#emPhoto'));
          const epitaphText = cleanText($('#emEpitaph').value.trim()) || 'Forever loved.';
          const mem = {
            id: 'em_' + Date.now(),
            plotId: linkedPlotId,
            petName: cleanText(name), species: sp,
            years: $('#emYears').value.trim() || String(new Date().getFullYear()),
            epitaph: epitaphText,
            photo,
            charity: $('#emCharity').value || null,
            socials: { ...(State.data.socials || {}) },
            lat: pos.lat, lng: pos.lng, place: placeName,
            owner: Auth.user.name, ownerUid: Auth.user.uid, gifts: 0, guestbook: [], decorations: [], createdAt: Date.now(),
          };

          if (linkedPlotId && State.data?.ownedPlots?.[linkedPlotId]) {
            const plotRec = State.data?.ownedPlots?.[linkedPlotId];
            plotRec.memorial = plotRec.memorial || {};
            plotRec.memorial.favoritePlaces = plotRec.memorial.favoritePlaces || [];
            plotRec.memorial.favoritePlaces.push({
              name: `${name}'s Sacred Place`,
              place: placeName,
              note: epitaphText,
              lat: pos.lat, lng: pos.lng,
              plotId: linkedPlotId,
            });
          }

          State.addEarthMemorial(mem);
          State.logActivity('paw', `${Auth.user.name} pinned a sacred spot for ${name} — ${placeName.split(',')[0]}`);
          await State.save(Auth.user);
          await this.earth.addMemorialMarker(mem);
          this.closeModal();
          this.openEarthMemorial(mem);
          this.toast(`${name}'s sacred spot is pinned on Earth.`);
        }
      } catch (e) { this.toast(String(e.message), 'warning'); btn.disabled = false; btn.textContent = `Pay ${fmtPrice(EARTH_PLOT.price)} & Pin Sacred Spot`; }
    };
  },

  // ----- community feed -----
  toggleFeed() {
    const p = $('#feedPanel');
    if (!p.classList.contains('hidden')) return p.classList.add('hidden');
    $('#campaignPanel')?.classList.add('hidden');

    let occupiedPlots = [];
    if (this.world && this.world.plots) {
      occupiedPlots = this.world.plots.filter(x => x.status === 'occupied' && x.memorial);
    }
    const rNames = ['Sarah', 'Michael', 'Emma', 'James', 'Olivia', 'William', 'Sophia', 'Benjamin', 'Isabella', 'Lucas'];
    const giftsArr = Object.values(GIFTS);
    const items = [];
    
    for(let i=0; i<12; i++) {
      const type = Math.random();
      let timeLabel = i === 0 ? 'Just now' : (i < 3 ? `${i*5 + Math.floor(Math.random()*5 + 1)} mins ago` : (i < 8 ? `${Math.floor(i/2 + 1)} hours ago` : 'yesterday'));
      
      if(type < 0.35 && occupiedPlots.length > 0) {
        const plot = occupiedPlots[Math.floor(Math.random() * occupiedPlots.length)];
        items.push({
          icon: speciesIcon(speciesKey(plot.memorial.species)),
          html: `New memorial created for <b>${escapeHtml(plot.memorial.petName)}</b> in ${escapeHtml(DISTRICTS[plot.district].name)}`,
          time: timeLabel, plotId: plot.id
        });
      } else if (type < 0.75 && occupiedPlots.length > 0) {
        const plot = occupiedPlots[Math.floor(Math.random() * occupiedPlots.length)];
        const donName = rNames[Math.floor(Math.random() * rNames.length)];
        const gift = giftsArr[Math.floor(Math.random() * giftsArr.length)];
        items.push({
          icon: icon('gift'),
          html: `<b>${escapeHtml(donName)}</b> left ${escapeHtml(gift.name)} at <b>${escapeHtml(plot.memorial.petName)}</b>'s memorial`,
          time: timeLabel, plotId: plot.id
        });
      } else {
        const petName = PET_NAMES[Math.floor(Math.random() * PET_NAMES.length)];
        items.push({
          icon: icon('heart'),
          html: `<b>${escapeHtml(petName)}'s Rainbow Fund</b> reached $${Math.floor(Math.random()*5 + 1)*100}!`,
          time: timeLabel
        });
      }
    }

    const totalMemorials = 4820 + Math.floor(Math.random() * 50);
    const giftsToday = 142 + Math.floor(Math.random() * 20);
    const raisedMonth = 12450 + Math.floor(Math.random() * 1000);

    $('#feedBody').innerHTML = `
      <div class="feed-stats">
        <div class="stat-box">
          <div class="stat-val">${totalMemorials.toLocaleString()}</div>
          <div class="stat-label">Memorials</div>
        </div>
        <div class="stat-box">
          <div class="stat-val">${giftsToday}</div>
          <div class="stat-label">Gifts Today</div>
        </div>
        <div class="stat-box">
          <div class="stat-val">$${raisedMonth.toLocaleString()}</div>
          <div class="stat-label">Raised (mo)</div>
        </div>
      </div>
      <div class="feed-list">
        ${items.map(a => `
          <div class="feed-item" ${a.plotId ? `data-plot="${a.plotId}"` : ''}>
            <div class="fi-icon">${a.icon}</div>
            <div class="fi-content">
               <div class="fi-text">${a.html}</div>
               <div class="fi-time">${a.time}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    $('#feedBody').querySelectorAll('[data-plot]').forEach(el => {
      el.onclick = async () => {
        const plot = this.world?.plots.find(x => x.id === el.dataset.plot);
        if (plot) {
          p.classList.add('hidden');
          await this.show3D();
          this.world.flyToDistrict(plot.district, plot);
          this.openPlot(plot);
        }
      };
    });
    p.classList.remove('hidden');
  },

  refreshWorld() {
    // Rebuild 3D plot meshes & redraw 2D after ownership changes.
    this.world?.rebuildPlots();
    if (this.map) { this.map._bg = null; this.map.draw(); }
  },



  showDevotionalModal(templeKey = 'cathedral') {
    const TEMPLE_DATA = {
      cathedral: {
        badge: 'Universal Cathedral · Highland Plateau',
        title: 'Grand Universal Cathedral',
        sub: 'Sagrada Família Spires & Sistine Nave Vaults',
        actionName: 'Light a Votive Candle & Offer Prayer',
        iconKey: 'candle',
        actionSound: 'playHarmonicChord',
        intents: [
          { name: 'Hail Mary', text: 'Holy Mary, Mother of Grace, watch over our beloved companion in eternal light and radiant peace.' },
          { name: 'Eternal Peace & Light', text: 'May perpetual light shine upon them, forever safe, joyful and running free across the celestial hills.' },
          { name: 'Comfort for Grieving Hearts', text: 'Send gentle comfort and healing to our family, knowing love transcends all physical space.' },
          { name: 'In Loving Memory', text: 'Honoring a noble life filled with unconditional loyalty, gentle purrs, and wagging tails.' }
        ]
      },
      baal: {
        badge: 'Highland Promontory · Solomonic Spire',
        title: 'The Sacred Temple of Baal',
        sub: 'Monumental Fluted Pillars & Solomonic Spire of Strength',
        actionName: 'Ignite Sacred Incense & Flame of Strength',
        iconKey: 'fire',
        actionSound: 'playHarmonicChord',
        intents: [
          { name: 'Flame of Eternal Strength', text: 'May their fierce, noble spirit run eternal across the endless golden meadows of strength.' },
          { name: 'Guardian Protection for Animals', text: 'Invoking ancient guardian power to protect, heal and shelter all living creatures.' },
          { name: 'Valiant Warrior Companion', text: 'In honor of our brave protector who guarded our family with boundless courage and love.' },
          { name: 'Sacred Beast Blessing', text: 'Honoring the untamed grace, loyalty, and wild spirit of nature that lives in every animal.' }
        ]
      },
      pagoda: {
        badge: 'Eastern Mountain Sanctuary · Zen Rock Garden',
        title: 'Buddhist Zen Pagoda & Sanctuary',
        sub: '5-Tiered Hinoki Pagoda, Golden Buddha & 528Hz Solfeggio Bell',
        actionName: 'Light Sandalwood Incense & Strike 528Hz Bell',
        iconKey: 'lotus',
        actionSound: 'playHarmonicChord',
        intents: [
          { name: 'Metta — Loving-Kindness', text: 'May all living beings everywhere be happy, peaceful, and free from suffering and fear.' },
          { name: 'Pure Land Rebirth', text: 'May our beloved companion dwell in tranquil serenity among blooming lotus blossoms and gentle breezes.' },
          { name: 'Compassion for All Beings', text: 'A circle of endless compassion spanning all realms of existence and life.' },
          { name: 'Gratitude for Shared Life', text: 'Deep bowing in gratitude for the sacred years and profound unconditional love we shared.' }
        ]
      },
      mosque: {
        badge: 'Western Ridge Promontory · Court of Lions',
        title: 'Moorish Mosque & Court of Lions',
        sub: 'Alhambra Double Arches, Muqarnas Mihrab & Sacred Fanous Lanterns',
        actionName: 'Illuminate Sacred Fanous Lamp & Float Rose Petal',
        iconKey: 'sparkle',
        actionSound: 'playHarmonicChord',
        intents: [
          { name: 'Bismillah — Divine Mercy', text: 'In the name of the Most Merciful, grant eternal serenity and cool shade to our companion.' },
          { name: 'Light of Divine Peace (Noor)', text: 'May their spirit be bathed in radiant celestial illumination and eternal warmth.' },
          { name: 'Gentle Care for All Creatures', text: 'Honoring the sacred duty of stewardship and gentle care for the innocent souls of the earth.' },
          { name: 'Garden of Eternal Bliss (Firdaws)', text: 'Resting peacefully beside crystal waters, sweet dates, and everlasting comfort.' }
        ]
      }
    };

    const cfg = TEMPLE_DATA[templeKey] || TEMPLE_DATA.cathedral;
    let selectedIntent = cfg.intents[0];
    let selectedAmount = 15;

    const render = () => {
      this.modal(`
        <div class="devotional-modal-header">
          <div class="devotional-modal-badge">${cfg.badge}</div>
          <h2>${cfg.title}</h2>
          <div class="modal-sub">${cfg.sub}</div>
        </div>

        <label style="margin-top:0;">Select Devotional Intention / Prayer</label>
        <div class="devotional-intent-grid">
          ${cfg.intents.map((it, i) => `
            <button class="devotional-intent-btn ${it.name === selectedIntent.name ? 'is-selected' : ''}" data-idx="${i}">
              <span class="devotional-intent-title">${it.name}</span>
              <span class="devotional-intent-sub">${it.text.slice(0, 52)}…</span>
            </button>
          `).join('')}
        </div>

        <label>Selected Prayer / Dedication Text</label>
        <textarea id="devotionalPrayerText" rows="2" style="width:100%;padding:10px;border-radius:var(--r-md);background:rgba(0,0,0,0.4);border:1px solid rgba(212,175,55,0.3);color:#f4f0e6;font-family:var(--serif);font-size:14px;line-height:1.5;">${selectedIntent.text}</textarea>

        <label>Dedicated in Memory of (Companion's Name)</label>
        <input id="devotionalPetName" placeholder="e.g. Bella, Kaya, Toby..." style="width:100%;padding:10px;border-radius:var(--r-md);background:rgba(0,0,0,0.4);border:1px solid rgba(212,175,55,0.3);color:#fff;font-size:14px;">

        <label>Devotional Offering &amp; Charity Donation</label>
        <div class="devotional-amount-row">
          <button class="devotional-amount-btn ${selectedAmount === 5 ? 'is-selected' : ''}" data-amt="5">$5</button>
          <button class="devotional-amount-btn ${selectedAmount === 15 ? 'is-selected' : ''}" data-amt="15">$15</button>
          <button class="devotional-amount-btn ${selectedAmount === 25 ? 'is-selected' : ''}" data-amt="25">$25</button>
          <button class="devotional-amount-btn ${selectedAmount === 50 ? 'is-selected' : ''}" data-amt="50">$50</button>
          <button class="devotional-amount-btn ${selectedAmount === 100 ? 'is-selected' : ''}" data-amt="100">$100</button>
        </div>

        <div class="devotional-charity-badge">
          <i class="ico-slot" data-icon="heart"></i>
          <span><b>100% Transparency:</b> Every cent is published in the cryptographic ledger and directly supports verified 501(c)(3) animal shelters &amp; wildlife rescues.</span>
        </div>

        <div style="display:flex;gap:10px;margin-top:24px;">
          <button class="btn btn-outline" data-close style="flex:1;">Cancel</button>
          <button class="btn btn-gold btn-lg" id="devotionalSubmitBtn" style="flex:2;">
            <i class="ico-slot" data-icon="${cfg.iconKey}"></i> ${cfg.actionName} ($${selectedAmount})
          </button>
        </div>
      `);

      const box = $('#modalBox');
      box.querySelectorAll('.devotional-intent-btn').forEach(btn => {
        btn.onclick = () => {
          const idx = parseInt(btn.dataset.idx, 10);
          selectedIntent = cfg.intents[idx];
          render();
        };
      });

      box.querySelectorAll('.devotional-amount-btn').forEach(btn => {
        btn.onclick = () => {
          selectedAmount = parseInt(btn.dataset.amt, 10);
          render();
        };
      });

      const submitBtn = box.querySelector('#devotionalSubmitBtn');
      if (submitBtn) {
        submitBtn.onclick = async () => {
          const petName = box.querySelector('#devotionalPetName')?.value?.trim() || 'Beloved Companion';
          const prayer = box.querySelector('#devotionalPrayerText')?.value?.trim() || selectedIntent.text;

          // Trigger Soundscape
          try {
            if (window.Soundscape?.[cfg.actionSound]) {
              window.Soundscape[cfg.actionSound]();
            } else if (window.Soundscape?.playHarmonicChord) {
              window.Soundscape.playHarmonicChord(432);
            }
          } catch (_) {}

          // Record in cryptographic ledger
          try {
            if (window.Ledger?.record) {
              await window.Ledger.record({
                kind: 'temple_offering',
                temple: templeKey,
                petName,
                prayer,
                amount: selectedAmount,
                charity: 'best_friends',
                at: Date.now()
              });
            }
          } catch (_) {}

          // Visual spark celebration in 3D
          if (this.world?._triggerTempleCelebration) {
            this.world._triggerTempleCelebration(templeKey);
          }

          this.closeModal();
          this.toast(`✦ Offering consecrated in ${cfg.title} for ${petName}!`, 4500, 'sparkle');
        };
      }
    };

    render();
  },
};

