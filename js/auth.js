// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — Authentication
// Real mode: Firebase Auth (email/password, Google, Facebook, Apple, X).
// Demo mode: simulated accounts stored in localStorage.
// Guests: browse everything, leave gifts — no account needed.
// ============================================================
import { FIREBASE_CONFIG, IS_DEMO, IS_ADMIN } from './config.js';

let fbAuth = null;
let fbApp = null;
let fbAuthMod = null;

async function getFbAuth() {
  if (fbAuth && fbAuthMod) return { auth: fbAuth, mod: fbAuthMod };
  const appMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  fbAuthMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
  fbApp = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(FIREBASE_CONFIG);
  fbAuth = fbAuthMod.getAuth(fbApp);
  return { auth: fbAuth, mod: fbAuthMod };
}

export const Auth = {
  user: null,               // { uid, name, email, provider, isGuest }
  listeners: new Set(),
  onChange(fn) {
    this.listeners.add(fn);
    fn(this.user);
    return () => this.listeners.delete(fn);
  },
  offChange(fn) { this.listeners.delete(fn); },
  _emit() { this.listeners.forEach(fn => fn(this.user)); },

  async init() {
    if (IS_ADMIN) {
      this.user = { uid: 'admin', name: 'Admin', email: null, provider: 'admin', isGuest: false, isAdmin: true };
      this._emit();
      return;
    }
    if (IS_DEMO) {
      try {
        const saved = localStorage.getItem('ev_user');
        this.user = saved ? JSON.parse(saved) : null;
      } catch {
        this.user = null;
      }
      this._emit();
      return;
    }
    
    try {
      const { auth, mod } = await getFbAuth();
      mod.onAuthStateChanged(auth, (u) => {
        if (u) {
          const provider = u.providerData[0]?.providerId || 'password';
          this.user = { 
            uid: u.uid, 
            name: u.displayName || u.email?.split('@')[0], 
            email: u.email, 
            provider: provider, 
            isGuest: false 
          };
          window.USER = this.user; // Connect Auth state to global
          localStorage.setItem('ev_user', JSON.stringify(this.user));
        } else {
          this.user = null;
          window.USER = null;
          localStorage.removeItem('ev_user');
        }
        this._emit();
      });
    } catch (e) {
      console.log('[auth] firebase init failed, falling back to local user:', e);
      try {
        const saved = localStorage.getItem('ev_user');
        this.user = saved ? JSON.parse(saved) : null;
      } catch {
        this.user = null;
      }
      this._emit();
    }
  },

  async signUpEmail(name, email, password) {
    if (IS_DEMO) return this._demoLogin(name || email.split('@')[0], email, 'email');
    const { auth, mod } = await getFbAuth();
    const cred = await mod.createUserWithEmailAndPassword(auth, email, password);
    if (name) {
      await mod.updateProfile(cred.user, { displayName: name });
      if (this.user && this.user.uid === cred.user.uid) {
        this.user.name = name;
        window.USER = this.user;
        localStorage.setItem('ev_user', JSON.stringify(this.user));
        this._emit();
      }
    }
  },
  async signInEmail(email, password) {
    if (IS_DEMO) return this._demoLogin(email.split('@')[0], email, 'email');
    const { auth, mod } = await getFbAuth();
    await mod.signInWithEmailAndPassword(auth, email, password);
  },
  async signInGoogle() {
    if (IS_DEMO) return this._demoLogin('Test User (Google)', 'you@gmail.com', 'google');
    const { auth, mod } = await getFbAuth();
    await mod.signInWithPopup(auth, new mod.GoogleAuthProvider());
  },
  async signInFacebook() {
    if (IS_DEMO) return this._demoLogin('Test User (Facebook)', 'you@facebook.com', 'facebook');
    const { auth, mod } = await getFbAuth();
    await mod.signInWithPopup(auth, new mod.FacebookAuthProvider());
  },
  async signInApple() {
    if (IS_DEMO) return this._demoLogin('Test User (Apple)', 'you@icloud.com', 'apple');
    const { auth, mod } = await getFbAuth();
    const provider = new mod.OAuthProvider('apple.com');
    provider.addScope('email'); 
    provider.addScope('name');
    await mod.signInWithPopup(auth, provider);
  },
  async signInTwitter() {
    if (IS_DEMO) return this._demoLogin('Test User (X)', 'you@x.com', 'twitter');
    const { auth, mod } = await getFbAuth();
    await mod.signInWithPopup(auth, new mod.TwitterAuthProvider());
  },
  continueAsGuest(anonymous = true, name = '') {
    const randomSuffix = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 9);
    this.user = { uid: 'guest_' + randomSuffix, name: anonymous ? 'Anonymous Visitor' : (name || 'Visitor'), email: null, provider: 'guest', isGuest: true };
    window.USER = this.user;
    localStorage.setItem('ev_user', JSON.stringify(this.user));
    this._emit();
  },
  async signOut() {
    if (!IS_DEMO && fbAuth && fbAuthMod) await fbAuthMod.signOut(fbAuth);
    this.user = null;
    window.USER = null;
    localStorage.removeItem('ev_user');
    localStorage.removeItem('ev_state_v1');
    this._emit();
  },
  _demoLogin(name, email, provider) {
    this.user = { uid: 'demo_' + provider + '_' + email, name, email, provider, isGuest: false };
    window.USER = this.user;
    localStorage.setItem('ev_user', JSON.stringify(this.user));
    this._emit();
  },
};
