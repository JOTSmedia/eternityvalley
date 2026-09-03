// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — App state & persistence
// Real mode: Firestore. Demo mode: localStorage.
// Tracks: memberships, owned plots, memorials, decor, gifts.
// ============================================================
import { IS_DEMO, IS_ADMIN, FIREBASE_CONFIG } from './config.js?v=7';
import { MEMBERSHIPS } from './catalog.js?v=7';

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
          let parsed = null;
          try {
            parsed = JSON.parse(raw);
          } catch (pe) {
            console.warn('[state] JSON.parse corrupted, resetting local state:', pe);
            parsed = null;
          }
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
        console.log('[state] load failed', e);
      }
      return;
    }
    try {
      const appMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js?v=7');
      fs = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js?v=7');
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
        // Persist to local storage so offline access has the latest cloud state
        try { localStorage.setItem(LS_KEY, JSON.stringify(this.data)); } catch {}
      } else {
        // Cloud doc doesn't exist yet, check if there is local state to adopt
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
      }
    } catch (e) {
      console.log('[state] firebase init failed, falling back to localStorage', e);
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          let parsed = null;
          try {
            parsed = JSON.parse(raw);
          } catch (pe) {
            console.warn('[state] JSON.parse corrupted (firebase error), resetting local state:', pe);
            parsed = null;
          }
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
      } catch (e2) { console.log('[state] localStorage fallback also failed', e2); }
    }
  },

  _saveTimeout: null,

  async save(user, immediate = false) {
    const doSave = async () => {
      // Always persist to localStorage for instant recovery & offline safety
      try { 
        localStorage.setItem(LS_KEY, JSON.stringify(this.data)); 
      } catch (e) { 
        const isQuota = e?.name === 'QuotaExceededError' || 
                        e?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || 
                        e?.code === 22 || e?.code === 1014 || 
                        /quota/i.test(e?.message || '');
        if (isQuota) {
          console.log('[state] LocalStorage quota exceeded, pruning memory cache');
          try {
            this.data.memories = {};
            localStorage.setItem(LS_KEY, JSON.stringify(this.data));
          } catch (e2) {
            // Emergency prune: strip overly large photo data strings to prevent data loss
            try {
              const safeData = JSON.parse(JSON.stringify(this.data));
              if (safeData.earth?.memorials) {
                safeData.earth.memorials.forEach(m => { if (m.photo?.length > 50000) m.photo = null; });
              }
              if (safeData.ownedPlots) {
                Object.values(safeData.ownedPlots).forEach(op => {
                  if (op.memorial?.photo?.length > 50000) op.memorial.photo = null;
                });
              }
              localStorage.setItem(LS_KEY, JSON.stringify(safeData));
            } catch (e3) {
              console.warn('[state] emergency quota save failed:', e3);
            }
          }
        } else {
          console.log('[state] localStorage save failed', e); 
        }
      }
      if (IS_DEMO || !user || user.isGuest || !db) return;
      try {
        await fs.setDoc(fs.doc(db, 'users', user.uid), this.data, { merge: true });
      } catch (e) {
        console.log('[state] remote Firestore save failed, preserved locally:', e);
      }
    };

    if (immediate) return doSave().catch(e => console.error('[state] immediate save error', e));
    
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
      if (this._saveResolve) this._saveResolve();
    }
    
    return new Promise((resolve) => {
      this._saveResolve = resolve;
      this._saveTimeout = setTimeout(() => {
        doSave()
          .catch(e => console.error('[state] delayed save error', e))
          .finally(() => {
            if (this._saveResolve === resolve) {
              this._saveTimeout = null;
              this._saveResolve = null;
            }
            resolve();
          });
      }, 1500);
    });
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
    this.data.earth.memorials ||= [];
    const idx = this.data.earth.memorials.findIndex(m => m.id === mem.id);
    if (idx >= 0) {
      this.data.earth.memorials[idx] = mem;
    } else {
      this.data.earth.memorials.push(mem);
    }
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
