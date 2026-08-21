// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — UI: panels, modals, purchase & gift flows
// ============================================================
import { DISTRICTS, SIZE_LABELS } from './terrain.js';
import { MEMBERSHIPS, PLOT_ITEMS, GIFTS, EARTH_PLOT, SLOTS, HEADSTONE_STYLES, ITEM_DECOR, GIFT_DECOR, CHARITIES, GIFT_CHARITY_SHARE, charityName, fmtPrice } from './catalog.js';
import { Auth } from './auth.js';
import { State } from './state.js';
import { checkout } from './checkout.js';
import { IS_DEMO, HAS_MAPS3D, IS_ADMIN } from './config.js';
import { RBV, allMemorials, allActivity, timeAgo } from './social.js';
import { Motion } from './motion.js';
import { icon, speciesIcon, speciesKey, rainbowMark, SPECIES_LABELS } from './icons.js';
import { thumbImg, canRender as canRenderThumb } from './thumbs.js';

const $ = (s) => document.querySelector(s);

// The species picker: value is the icon key, so a memorial stores a
// stable key rather than a display string or an emoji glyph.
const SPECIES_OPTIONS = ['dog', 'cat', 'rabbit', 'bird', 'horse', 'hamster', 'fish', 'turtle', 'other'];
const speciesOptionsHTML = (sel = 'dog') => SPECIES_OPTIONS
  .map(k => `<option value="${k}"${k === sel ? ' selected' : ''}>${SPECIES_LABELS[k]}</option>`)
  .join('');

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

/** The art for a memorial: their photo if there is one, else their species. */
const memorialArt = (m, size = 44) => m.photo
  ? `<img src="${m.photo}" class="pet-photo" alt="${m.petName || 'memorial'}">`
  : `<div class="pet-species">${speciesIcon(m.species || speciesKey(m.speciesLabel || ''), { size })}</div>`;

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

export const UI = {
  // `world` and `map` arrive later than the rest of the interface: they
  // depend on three.js, which is fetched from a CDN and deliberately
  // kept off the boot path. Everything here works without them and
  // waits only at the moment the Sanctuary is actually needed.
  world: null, map: null, earth: null, plots: [], currentPlot: null,
  _ensureWorld: null,

  init({ earth, plots, ensureWorld }) {
    this.earth = earth;
    this.plots = plots || [];
    this._ensureWorld = ensureWorld;

    $('#panelClose').onclick = () => this.closePanel();
    $('#authBtn').onclick = () => this.authModal();
    $('#signOutBtn').onclick = async () => { await Auth.signOut(); this.toast('Signed out. You are browsing as a guest.'); };
    $('#membershipBtn').onclick = () => this.membershipModal();

    $('#districtNav').addEventListener('click', async (e) => {
      const d = e.target.dataset?.d;
      if (d) { await this.show3D(); this.world?.flyToDistrict(d); }
    });
    $('#btnEarth').onclick = () => this.showEarth();
    $('#btn3d').onclick = () => this.show3D();
    $('#btn2d').onclick = () => this.show2D();
    this._initEarthUI();

    Auth.onChange(u => {
      $('#authBtn').classList.toggle('hidden', !!u);
      $('#userChip').classList.toggle('hidden', !u);
      if (u) $('#userName').textContent = u.name;
    });
    $('#userName').style.cursor = 'pointer';
    $('#userName').title = 'My Bridge — profile, plots & memorials';
    $('#userName').onclick = () => this.myBridgeModal();
    $('#myBtn').onclick = () => this.myBridgeModal();

    if (IS_ADMIN) {
      const chip = document.createElement('div');
      chip.className = 'demo-chip';
      chip.style.borderColor = '#8fce8a';
      chip.style.color = '#8fce8a';
      chip.style.cursor = 'pointer';
      chip.innerHTML = icon('shield') + ' ADMIN MODE — paywalls off, purchases comped · click to exit';
      chip.title = 'Click to exit admin mode';
      chip.onclick = () => {
        try { localStorage.removeItem('ev_admin_mode'); } catch {}
        location.reload();
      };
      document.body.appendChild(chip);
    } else if (IS_DEMO) {
      const chip = document.createElement('div');
      chip.className = 'demo-chip';
      chip.textContent = '● Demo mode — add your Firebase & Stripe keys to go live (SETUP.md)';
      document.body.appendChild(chip);
    }
  },

  _setView(which) {
    for (const [id, btn] of [['viewEarth', 'btnEarth'], ['view3d', 'btn3d'], ['view2d', 'btn2d']]) {
      $('#' + id).classList.toggle('hidden', id !== which.view);
      $('#' + btn).classList.toggle('active', btn === which.btn);
    }
    $('#districtNav').style.display = which.view === 'view3d' ? '' : 'none';
    document.querySelector('.legend').style.display = which.view === 'viewEarth' ? 'none' : '';
  },
  showEarth() { this._setView({ view: 'viewEarth', btn: 'btnEarth' }); },
  /** Called by main.js once the renderer modules have loaded. */
  attachWorld(world, map) {
    this.world = world;
    this.map = map;
  },

  /** Resolve when the 3D world exists; starts loading it if needed. */
  async ensureWorld() {
    if (this.world) return this.world;
    // Only announce the wait if there actually is one worth announcing.
    this._loadingToast ||= setTimeout(
      () => this.toast('Loading the Sanctuary…', 8000, 'sparkle'), 350);
    try {
      await this._ensureWorld?.();
    } catch (e) {
      console.warn('[ui] world failed to load', e);
    } finally {
      clearTimeout(this._loadingToast);
      this._loadingToast = null;
    }
    return this.world;
  },

  // Both 3D views wait for the renderer BEFORE switching. Switching
  // first and awaiting after shows an unsized, unrendered canvas —
  // i.e. a black screen — for as long as three.js takes to arrive.
  // The visitor keeps the view they are on until there is something
  // to show them.
  async show3D() {
    if (!this.world) await this.ensureWorld();
    if (!this.world) return this.toast('The Sanctuary could not be loaded. Check your connection and reload.', 6000, 'warning');
    this._setView({ view: 'view3d', btn: 'btn3d' });
    this.world._resize();
  },
  async show2D() {
    if (!this.map) await this.ensureWorld();
    if (!this.map) return this.toast('The map could not be loaded. Check your connection and reload.', 6000, 'warning');
    this._setView({ view: 'view2d', btn: 'btn2d' });
    this.map._resize(); this.map.draw();
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
    const owned = !!State.data.ownedPlots[plot.id];

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
      const giftList = (State.data.gifts[plot.id] || []).slice(-4).reverse();
      body.innerHTML = `
        <span class="badge badge-occ">OCCUPIED${owned ? ' · YOURS' : ''}</span>
        <h2>Plot ${plot.id}</h2>
        <div class="sub">${d.name} · ${SIZE_LABELS[plot.size]}</div>
        <div class="memorial">
          ${memorialArt(m, 52)}
          <h3>${m.petName || 'Beloved Friend'}</h3>
          <div class="years">${m.species || ''} · ${m.years || ''}</div>
          <p class="epitaph">“${m.epitaph || 'Forever loved.'}”</p>
          <div class="gifts-count">${icon('gift')} ${m.gifts || 0} gifts from visitors · resting with ${m.owner || 'a loving family'}</div>
          ${m.charity ? `<div class="gifts-count">${icon('heart')} ${Math.round(GIFT_CHARITY_SHARE * 100)}% of every gift supports <b>${charityName(m.charity)}</b></div>` : ''}
        </div>
        ${this.petProfileHTML(m, plot.id, owned)}
        ${giftList.length ? `<div class="sub">Recent gifts:</div>` + giftList.map(g => {
          const gi = GIFTS.find(x => x.id === g.giftId);
          return `<div style="font-size:12.5px;margin:4px 0;color:var(--cream-dim)">${thumbImg(g.giftId, { size: 22, cls: 'thumb-inline' }) || icon('gift')} ${gi?.name || 'Gift'} — <i>${g.from}</i>${g.message ? ': “' + g.message + '”' : ''}</div>`;
        }).join('') : ''}
        <button class="btn btn-gold btn-block" id="giftBtn">${icon('candle')} Leave a gift</button>
        <button class="btn btn-outline btn-block" id="pShareBtn">${icon('share')} Share this memorial</button>
        ${owned ? `<button class="btn btn-green btn-block" id="decorBtn">${icon('flower')} Customize this plot</button>` : ''}`;
      $('#giftBtn').onclick = () => this.giftModal(plot);
      $('#pShareBtn').onclick = () => {
        const url = `${location.origin}${location.pathname}?p=${encodeURIComponent(plot.id)}`;
        this.shareModal(`${m.petName || 'a friend'}'s memorial`, url,
          `Visit ${m.petName || 'our friend'}'s memorial in the Rainbow Bridge Sanctuary — light a candle or leave a gift.`);
      };
      if (owned) $('#decorBtn').onclick = () => this.decorModal(plot);
      this._wirePetProfile(m, plot.id, owned, () => this.openPlot(plot), (pp) => {
        const rec = State.data.ownedPlots[plot.id];
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
    const box = $('#modalBox');
    box.innerHTML = html;
    $('#modalRoot').classList.remove('hidden');
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
    if (this._escClose) document.removeEventListener('keydown', this._escClose);
  },

  authModal(afterLogin) {
    this.modal(`
      <h2>Welcome</h2>
      <div class="modal-sub">One tap and you're in — own plots, build memorials, keep them forever.</div>
      <div class="auth-providers">
        <button class="btn" id="pGoogle" style="background:#fff;color:#1a1a1a;font-weight:700">${icon('google')} Continue with Google</button>
        <button class="btn" id="pApple" style="background:#000;color:#fff;border-color:#444;font-weight:700"> Continue with Apple</button>
        <button class="btn" id="pFacebook" style="background:#1877f2;color:#fff;font-weight:700">ⓕ Continue with Facebook</button>
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
    const p = State.data.profile || {};
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
      State.data.profile = {
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
    const p = State.data.profile || {};
    const s = State.data.socials || {};
    const mem = State.membershipInfo();
    const myPlots = Object.keys(State.data.ownedPlots)
      .map(id => this.plots.find(x => x.id === id)).filter(Boolean);
    const myMems = (State.data.earth?.memorials || []).filter(m => !Auth.user || m.ownerUid === Auth.user.uid || IS_ADMIN);
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
        ${State.data.charity ? `<span class="btn btn-outline" style="cursor:default">${icon('heart')} ${charityName(State.data.charity)}</span>` : ''}
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
      <div class="modal-sub">A membership lets you own plots and build lasting memorials.</div>
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
    $('#modalBox').querySelectorAll('[data-m]').forEach(btn => {
      btn.onclick = async () => {
        const m = MEMBERSHIPS.find(x => x.id === btn.dataset.m);
        if (!Auth.user || Auth.user.isGuest) { this.closeModal(); return this.authModal(() => this.membershipModal(afterJoin)); }
        btn.textContent = 'Processing…'; btn.disabled = true;
        try {
          const r = await checkout({ kind: 'membership', name: `Rainbow Bridge — ${m.name} membership`, amount: m.price, meta: { membershipId: m.id, uid: Auth.user.uid } });
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
      <div class="modal-sub">Plot ${plot.id} · ${d.name} · ${SIZE_LABELS[plot.size]} · <b>$${plot.price}</b></div>
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
      <label>Charity — ${Math.round(GIFT_CHARITY_SHARE * 100)}% of every gift to this plot</label>
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
        const r = await checkout({ kind: 'plot', name: `Rainbow Bridge — Plot ${plot.id} (${d.name})`, amount: plot.price, meta: { plotId: plot.id, uid: Auth.user.uid } });
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
    this.modal(`
      <h2>Leave a gift for ${plot.memorial?.petName || 'this friend'}</h2>
      <div class="modal-sub">Gifts are laid at the base of the memorial, in 3D, for every visitor to see. ${!from ? 'You can give as an anonymous guest.' : `Giving as <b>${from}</b>.`}</div>
      ${plotCharity
        ? `<div class="district-blurb">${icon('heart')} ${pctS}% of your gift goes to <b>${charityName(plotCharity)}</b> — the family's chosen cause.</div>`
        : `<label>${icon('heart')} ${pctS}% of your gift goes to a charity of your choice</label>
           <select id="sgCharity">${CHARITIES.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select>`}
      <div class="shop-grid">
        ${GIFTS.map(g => `
          <button class="shop-item" data-g="${g.id}">
            <div class="s-emoji">${thumbImg(g.id, { size: 46, alt: g.name })}</div>
            <div class="s-name">${g.name}</div>
            <div class="s-price">${fmtPrice(g.price)}</div>
          </button>`).join('')}
      </div>
      <label>Add a short message (optional)</label>
      <input id="giftMsg" maxlength="80" placeholder="Run free, sweet friend…">
      <p class="fine">${IS_DEMO ? 'Demo mode: payment is simulated.' : 'Processed securely by Stripe.'}</p>`);
    $('#modalBox').querySelectorAll('[data-g]').forEach(btn => {
      btn.onclick = async () => {
        const g = GIFTS.find(x => x.id === btn.dataset.g);
        const msg = cleanText($('#giftMsg').value.trim());
        const charity = plotCharity || $('#sgCharity')?.value || 'ch_local';
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
    const owned = State.data.ownedPlots[plot.id]?.decor || [];
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
          const r = await checkout({ kind: 'item', name: `Plot item: ${it.name}`, amount: it.price, meta: { plotId: plot.id, itemId: it.id, slot: slotId } });
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
  _initEarthUI() {
    const earth = this.earth;
    earth.onMemorialClick = (m) => this.openEarthMemorial(m);
    earth.onRBVClick = () => this.rbvPanel();
    earth.onPlaceAt = (pos) => { this._exitPlacement(); this.beginMemorialAt(pos); };

    const doSearch = async () => {
      const q = $('#earthSearch').value.trim();
      if (!q) return;
      try {
        const r = await earth.geocode(q);
        this._lastPos = { lat: r.lat, lng: r.lng };
        earth.flyTo({ lat: r.lat, lng: r.lng, range: 380, zoom: 18 });
        this.toast(`${r.name.split(',').slice(0, 2).join(',')} — glowing spots are available. Try Ground or Street to stand there.`, 7000);
        // show clear placement spots around the destination
        setTimeout(() => earth.showCandidateSpots(r), 1800);
      } catch { this.toast('Could not find that place — try a fuller address.'); }
    };
    $('#earthGo').onclick = doSearch;
    $('#earthSearch').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

    // Fly to the user's current location
    $('#locBtn').onclick = () => {
      if (!navigator.geolocation) return this.toast('Your browser does not support location.');
      this.toast('Finding you…', 'pin');
      navigator.geolocation.getCurrentPosition(async (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        this._lastPos = pos;
        earth.flyTo({ ...pos, range: 380, zoom: 18 });
        setTimeout(() => earth.showCandidateSpots(pos), 1800);
        const name = await earth.reverseGeocode(pos.lat, pos.lng);
        this.toast(`${name.split(',').slice(0, 2).join(',')} — glowing spots are available here. Try Ground to stand in it.`, 7000);
      }, (err) => {
        this.toast(err.code === 1
          ? 'Location permission denied — type your address in the search bar instead.'
          : 'Could not get your location — try typing the address.', 6000);
      }, { timeout: 10000, maximumAge: 60000 });
    };

    $('#homeBtn').onclick = () => { this._lastPos = null; earth.flyHome(); this.toast('Returning to Rainbow Bridge Valley…'); };

    // Ground-level & Street View
    $('#groundBtn').onclick = () => {
      const pos = this._lastPos || earth.getCenter();
      const ok = earth.groundView(pos);
      if (ok) this.toast('Standing at the place — the camera will slowly circle it. Drag to look around.');
      else this.toast('Satellite mode is top-down only — click Enable 3D for the full ground-level recreation (buildings, trees, yards).', 7000);
    };
    $('#streetBtn').onclick = () => this.streetViewOpen(this._lastPos || earth.getCenter());
    $('#streetClose').onclick = () => {
      $('#streetPanel').classList.add('hidden');
      $('#streetContainer').innerHTML = '';
    };
    $('#placeBtn').onclick = () => this.startPlacement();
    $('#placeCancel').onclick = () => this._exitPlacement();
    $('#placeCenter').onclick = () => { const c = earth.getCenter(); this._exitPlacement(); this.earthMemorialForm(c); };

    $('#feedBtn').onclick = () => this.toggleFeed();
    $('#feedClose').onclick = () => $('#feedPanel').classList.add('hidden');
    $('#browseBtn').onclick = () => this.toggleBrowse();
    $('#browseClose').onclick = () => $('#browsePanel').classList.add('hidden');

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
    await this.earth.init();
    if (HAS_MAPS3D && this.earth.mode === 'satellite') {
      this.toast('Your Maps key was rejected (check APIs enabled & restrictions) — running satellite fallback. Click Enable 3D to update it.', 8000, 'warning');
    }
    for (const m of allMemorials(State.data)) this.earth.addMemorialMarker(m);
    if (!HAS_MAPS3D) this.toast('Satellite mode — click Enable 3D and paste a free Google Maps key for full photorealism', 7000);
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
    $('#rbvFly').onclick = () => this.earth.flyTo({ lat: RBV.lat, lng: RBV.lng, range: 900, zoom: 16 });
    $('#plotPanel').classList.remove('hidden');
  },

  openEarthMemorial(m) {
    const gb = (m.guestbook || []).slice(-5).reverse();
    const own = !m.seeded && (IS_ADMIN || (Auth.user && m.ownerUid && m.ownerUid === Auth.user.uid));
    const body = $('#plotPanelBody');
    body.innerHTML = `
      <span class="badge badge-occ">MEMORIAL${own ? ' · YOURS' : ''}</span>
      <h2>${speciesIcon(speciesKey(m.species || ''), { size: 26 })} ${m.petName}</h2>
      <div class="sub">${m.place}</div>
      <div class="memorial">
        ${memorialArt(m, 52)}
        <h3>${m.petName}</h3>
        <div class="years">${m.species} · ${m.years}</div>
        <p class="epitaph">“${m.epitaph}”</p>
        <div class="gifts-count">${icon('gift')} ${m.gifts || 0} gifts · resting with ${m.owner}</div>
        ${m.charity ? `<div class="gifts-count">${icon('heart')} ${Math.round(GIFT_CHARITY_SHARE * 100)}% of every gift supports <b>${charityName(m.charity)}</b></div>` : ''}
        ${m.socials && Object.values(m.socials).some(v => v) ? `<div class="gifts-count">${['instagram', 'x', 'tiktok', 'facebook'].filter(k => m.socials[k]).map(k => icon({ instagram: 'instagram', x: 'x', tiktok: 'tiktok', facebook: 'facebook' }[k]) + ' ' + m.socials[k]).join(' · ')}</div>` : ''}
      </div>
      ${this.petProfileHTML(m, m.id, own)}
      <button class="btn btn-outline btn-block" id="evisitBtn">${icon('walk')} Visit at ground level</button>
      <button class="btn btn-outline btn-block" id="esvBtn">${icon('eye')} Street View here</button>
      <button class="btn btn-outline btn-block" id="eshareBtn">${icon('share')} Share this memorial</button>
      ${(m.decorations?.length ? `<div class="sub">At the memorial:</div>` + m.decorations.map(d =>
        `<div class="guestbook-entry">${thumbImg(d.itemId, { size: 22, cls: 'thumb-inline' })} <b>${d.name}</b> — ${d.slotLabel}</div>`).join('') : '')}
      <button class="btn btn-gold btn-block" id="egiftBtn">${icon('candle')} Leave a gift at the base</button>
      <button class="btn btn-outline btn-block" id="egbBtn">${icon('letter')} Sign the guestbook (free)</button>
      ${own ? `<button class="btn btn-green btn-block" id="edecorBtn">${icon('flower')} Customize this memorial</button>` : ''}
      ${gb.length ? '<div class="sub" style="margin-top:14px">Guestbook:</div>' + gb.map(g =>
        `<div class="guestbook-entry"><b>${g.from}</b> · ${timeAgo(g.at)}<br>${g.msg}</div>`).join('') : ''}`;
    $('#egiftBtn').onclick = () => this.earthGiftModal(m);
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
    this.earth.flyTo({ lat: m.lat, lng: m.lng, range: 260, zoom: 18 });
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
          const r = await checkout({ kind: 'item', name: `Memorial item: ${it.name} for ${m.petName}`, amount: it.price, meta: { earthMemorialId: m.id, itemId: it.id, slot: slot.id } });
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
        const charity = m.charity || $('#egCharity')?.value || 'ch_local';
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

  // ----- browse plots & memorials -----
  toggleBrowse() {
    const p = $('#browsePanel');
    if (!p.classList.contains('hidden')) return p.classList.add('hidden');
    $('#feedPanel').classList.add('hidden');

    const mems = allMemorials(State.data);
    const mine = Auth.user ? mems.filter(m => m.ownerUid === Auth.user.uid) : [];
    const avail = this.plots.filter(x => x.status === 'available');
    // cheapest available plot per district
    const byDistrict = {};
    for (const pl of avail) {
      if (!byDistrict[pl.district] || pl.price < byDistrict[pl.district].price) byDistrict[pl.district] = pl;
    }
    const memRow = (m) => `
      <div class="feed-item" data-bmem="${m.id}"><div class="fi-icon">${memorialArt(m, 20)}</div>
        <div><b>${m.petName}</b> · ${m.place.split(',').slice(0, 2).join(',')}
        <span class="fi-time">${m.years} · ${icon('gift')} ${m.gifts || 0} gifts</span></div></div>`;

    $('#browseBody').innerHTML = `
      ${mine.length ? `<div class="sub">Your memorials (${mine.length}):</div>` + mine.map(memRow).join('') : ''}
      <div class="sub" style="margin-top:${mine.length ? 14 : 0}px">Memorials across the Earth (${mems.length}):</div>
      ${mems.slice().sort((a, b) => (b.gifts || 0) - (a.gifts || 0)).map(memRow).join('')}
      <div class="sub" style="margin-top:16px">${icon('sparkle')} Available plots in the Sanctuary (${avail.length}):</div>
      <div style="font-size:12px;color:rgba(246,241,228,.55);margin:4px 0 8px">
        Anywhere on Earth can also be a plot — search an address above and pick a glowing spot (${fmtPrice(EARTH_PLOT.price)}).</div>
      ${Object.values(byDistrict).sort((a, b) => a.price - b.price).map(pl => `
        <div class="feed-item" data-bplot="${pl.id}"><div class="fi-icon">${icon('leaf')}</div>
          <div><b>${DISTRICTS[pl.district].name}</b> · from $${pl.price}
          <span class="fi-time">Plot ${pl.id} · ${SIZE_LABELS[pl.size]}</span></div></div>`).join('')}
      <button class="btn btn-outline btn-block" id="browseSanctuary">${icon('sparkle')} Browse all in the Sanctuary</button>`;

    $('#browseBody').querySelectorAll('[data-bmem]').forEach(el => {
      el.onclick = () => {
        const m = mems.find(x => x.id === el.dataset.bmem);
        if (m) { p.classList.add('hidden'); this.showEarth(); this.openEarthMemorial(m); }
      };
    });
    $('#browseBody').querySelectorAll('[data-bplot]').forEach(el => {
      el.onclick = () => {
        const pl = this.plots.find(x => x.id === el.dataset.bplot);
        if (pl) { p.classList.add('hidden'); this.show3D().then(() => this.world?.selectPlot(pl)); this.openPlot(pl); }
      };
    });
    $('#browseSanctuary').onclick = () => { p.classList.add('hidden'); this.show3D().then(() => this.world?.flyToDistrict('overview')); };
    p.classList.remove('hidden');
  },

  async earthMemorialForm(pos) {
    const placeName = await this.earth.reverseGeocode(pos.lat, pos.lng);
    this.modal(`
      <h2>A memorial at their favorite place</h2>
      <div class="modal-sub">${icon('pin')} ${placeName}<br><b>${fmtPrice(EARTH_PLOT.price)}</b> one-time · ${EARTH_PLOT.blurb}</div>
      <label>Pet's name</label><input id="emName" maxlength="24" placeholder="e.g. Biscuit">
      <label>Species</label>
      <select id="emSpecies">
        ${speciesOptionsHTML()}
      </select>
      <label>Years</label><input id="emYears" maxlength="16" placeholder="2012 – 2025">
      <label>Epitaph</label><textarea id="emEpitaph" rows="2" maxlength="140" placeholder="Why this place was theirs…"></textarea>
      <label>Their photo (optional)</label><input id="emPhoto" type="file" accept="image/*">
      <label>Charity — ${Math.round(GIFT_CHARITY_SHARE * 100)}% of every gift to this memorial</label>
      <select id="emCharity">
        <option value="">Let each giver choose</option>
        ${CHARITIES.map(c => `<option value="${c.id}" ${State.data.charity === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
      </select>
      <button class="btn btn-gold btn-block" id="emPay">Pay ${fmtPrice(EARTH_PLOT.price)} & create memorial</button>
      <p class="fine">${IS_DEMO ? 'Demo: payment simulated.' : 'Stripe secure checkout.'}</p>`);
    $('#emPay').onclick = async () => {
      const name = $('#emName').value.trim() || 'Beloved Friend';
      const sp = $('#emSpecies').value;
      const btn = $('#emPay');
      btn.disabled = true; btn.textContent = 'Processing…';
      try {
        const r = await checkout({ kind: 'plot', name: `Rainbow Bridge — memorial for ${name} (anywhere on Earth)`, amount: EARTH_PLOT.price, meta: { lat: pos.lat, lng: pos.lng, uid: Auth.user.uid } });
        if (r.ok) {
          const photo = await readPhoto($('#emPhoto'));
          const mem = {
            id: 'em_' + Date.now(), petName: cleanText(name), species: sp,
            years: $('#emYears').value.trim() || String(new Date().getFullYear()),
            epitaph: cleanText($('#emEpitaph').value.trim()) || 'Forever loved.',
            photo,
            charity: $('#emCharity').value || null,
            socials: { ...(State.data.socials || {}) },
            lat: pos.lat, lng: pos.lng, place: placeName,
            owner: Auth.user.name, ownerUid: Auth.user.uid, gifts: 0, guestbook: [], decorations: [], createdAt: Date.now(),
          };
          State.addEarthMemorial(mem);
          State.logActivity('paw', `${Auth.user.name} created a memorial for ${name} — ${placeName.split(',')[0]}`);
          await State.save(Auth.user);
          await this.earth.addMemorialMarker(mem);
          this.closeModal();
          this.openEarthMemorial(mem);
          this.toast(`${name} rests at their favorite place now.`);
        }
      } catch (e) { this.toast(String(e.message), 'warning'); btn.disabled = false; btn.textContent = `Pay ${fmtPrice(EARTH_PLOT.price)} & create memorial`; }
    };
  },

  // ----- community feed -----
  toggleFeed() {
    const p = $('#feedPanel');
    if (!p.classList.contains('hidden')) return p.classList.add('hidden');
    const items = allActivity(State.data);
    $('#feedBody').innerHTML = items.map(a => `
      <div class="feed-item"><div class="fi-icon">${activityArt(a.icon)}</div>
        <div>${a.text}<span class="fi-time">${timeAgo(a.at)}</span></div></div>`).join('') +
      `<div class="sub" style="margin-top:14px">Recent memorials:</div>` +
      allMemorials(State.data).slice(-6).reverse().map(m => `
        <div class="feed-item" data-mem="${m.id}"><div class="fi-icon">${memorialArt(m, 20)}</div>
          <div><b>${m.petName}</b> · ${m.place.split(',').slice(0, 2).join(',')}<span class="fi-time">${m.years}</span></div></div>`).join('');
    $('#feedBody').querySelectorAll('[data-mem]').forEach(el => {
      el.onclick = () => {
        const m = allMemorials(State.data).find(x => x.id === el.dataset.mem);
        if (m) { p.classList.add('hidden'); this.showEarth(); this.openEarthMemorial(m); }
      };
    });
    p.classList.remove('hidden');
  },

  refreshWorld() {
    // Rebuild 3D plot meshes & redraw 2D after ownership changes.
    this.world?.rebuildPlots();
    if (this.map) { this.map._bg = null; this.map.draw(); }
  },
};
