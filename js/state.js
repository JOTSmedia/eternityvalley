// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — App state & persistence
// Real mode: Firestore. Demo mode: localStorage.
// Tracks: memberships, owned plots, memorials, decor, gifts.
// ============================================================
import { IS_DEMO, IS_ADMIN, FIREBASE_CONFIG } from './config.js';
import { MEMBERSHIPS } from './catalog.js';

let db = null, fs = null;

const LS_KEY = 'ev_state_v1';

export const State = {
  data: {
    membership: null, ownedPlots: {}, gifts: {},
    earth: { memorials: [], activity: [] },
    memories: {},            // visitor photos/memories, keyed by plot/memorial id
    profile: {},             // owner social profile: avatar, bio, contactEmail
    charity: null,
    socials: {},
  },
  // ownedPlots: { [plotId]: { memorial:{petName,species,emoji,years,epitaph}, decor:[itemIds], boughtAt } }
  // gifts: { [plotId]: [ {giftId, from, message, at} ] }

  async init(user) {
    if (IS_DEMO || !user || user.isGuest) {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            this.data = {
              membership: parsed.membership || null,
              ownedPlots: parsed.ownedPlots || {},
              gifts: parsed.gifts || {},
              earth: parsed.earth || { memorials: [], activity: [] },
              memories: parsed.memories || {},
              profile: parsed.profile || {},
              charity: parsed.charity || null,
              socials: parsed.socials || {},
            };
          }
        }
      } catch (e) {
        console.warn('[state] load failed', e);
      }
      return;
    }
    try {
      const appMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
      fs = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(FIREBASE_CONFIG);
      db = fs.getFirestore(app);
      const snap = await fs.getDoc(fs.doc(db, 'users', user.uid));
      if (snap.exists()) {
        const d = snap.data();
        // Merge carefully: don't clobber default nested objects with undefined
        this.data = {
          membership: d.membership || this.data.membership,
          ownedPlots: d.ownedPlots || this.data.ownedPlots,
          gifts: d.gifts || this.data.gifts,
          earth: d.earth || this.data.earth || { memorials: [], activity: [] },
          memories: d.memories || this.data.memories || {},
          profile: d.profile || this.data.profile || {},
          charity: d.charity || this.data.charity || null,
          socials: d.socials || this.data.socials || {},
        };
      }
    } catch (e) {
      console.warn('[state] firebase init failed, falling back to localStorage', e);
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            this.data = {
              membership: parsed.membership || null,
              ownedPlots: parsed.ownedPlots || {},
              gifts: parsed.gifts || {},
              earth: parsed.earth || { memorials: [], activity: [] },
              memories: parsed.memories || {},
              profile: parsed.profile || {},
              charity: parsed.charity || null,
              socials: parsed.socials || {},
            };
          }
        }
      } catch (e2) { console.warn('[state] localStorage fallback also failed', e2); }
    }
  },

  _saveTimeout: null,

  async save(user, immediate = false) {
    const doSave = async () => {
      // Always persist to localStorage for instant recovery & offline safety
      try { 
        localStorage.setItem(LS_KEY, JSON.stringify(this.data)); 
      } catch (e) { 
        if (e.name === 'QuotaExceededError') {
          console.warn('[state] LocalStorage quota exceeded, pruning memory cache');
          try {
            this.data.memories = {};
            localStorage.setItem(LS_KEY, JSON.stringify(this.data));
          } catch {}
        } else {
          console.warn('[state] localStorage save failed', e); 
        }
      }
      if (IS_DEMO || !user || user.isGuest || !db) return;
      try {
        await fs.setDoc(fs.doc(db, 'users', user.uid), this.data, { merge: true });
      } catch (e) {
        console.warn('[state] remote Firestore save failed, preserved locally:', e);
      }
    };

    if (immediate) return doSave();
    if (this._saveTimeout) clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(doSave, 1500);
  },

  membershipInfo() {
    return MEMBERSHIPS.find(m => m.id === this.data.membership) || null;
  },
  hasMembership() { return IS_ADMIN || !!this.data.membership; },
  plotLimit() {
    if (IS_ADMIN) return Infinity;
    const m = this.data.membership;
    return m === 'mem_eternal' ? Infinity : m === 'mem_legacy' ? 6 : m === 'mem_guardian' ? 2 : 0;
  },
  ownedCount() { return Object.keys(this.data.ownedPlots || {}).length; },
  canBuyPlot() { return this.ownedCount() < this.plotLimit(); },

  buyPlot(plot, memorial) {
    // memorial.headstone = chosen style (classic/heart/obelisk/slab/statue)
    this.data.ownedPlots ||= {};
    this.data.ownedPlots[plot.id] = { memorial, decor: [], boughtAt: Date.now() };
    plot.status = 'occupied';
    plot.memorial = { ...memorial, owner: 'You', gifts: 0 };
    plot.decor = [{ type: 'headstone', style: memorial.headstone || 'classic' }];
  },
  addDecor(plotId, itemId, slot) {
    if (!this.data.ownedPlots) this.data.ownedPlots = {};
    if (!this.data.ownedPlots[plotId]) this.data.ownedPlots[plotId] = { decor: [] };
    this.data.ownedPlots[plotId].decor ||= [];
    this.data.ownedPlots[plotId].decor.push({ itemId, slot });
  },
  addGift(plot, giftId, from, message) {
    this.data.gifts ||= {};
    (this.data.gifts[plot.id] ||= []).push({ giftId, from, message, at: Date.now() });
    if (plot.memorial) plot.memorial.gifts = (plot.memorial.gifts || 0) + 1;
  },

  // ---------- Earth (real-world) memorials & social ----------
  addEarthMemorial(mem) {
    this.data.earth ||= { memorials: [], activity: [] };
    this.data.earth.memorials.push(mem);
  },
  earthMemorialCount() { return (this.data.earth?.memorials || []).length; },
  // ---------- Visitor memories (photos/stories on any memorial) ----------
  addMemory(id, entry) {
    ((this.data.memories ||= {})[id] ||= []).push(entry);
  },
  getMemories(id) { return this.data.memories?.[id] || []; },

  logActivity(icon, text) {
    this.data.earth ||= { memorials: [], activity: [] };
    (this.data.earth.activity ||= []).unshift({ icon, text, at: Date.now() });
    this.data.earth.activity = this.data.earth.activity.slice(0, 50);
  },
};
