// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — Authentication
// Real mode: Firebase Auth (email/password, Google, Facebook).
// Demo mode: simulated accounts stored in localStorage.
// Guests: browse everything, leave gifts — no account needed.
// ============================================================
import { FIREBASE_CONFIG, IS_DEMO, IS_ADMIN } from './config.js';

let fbAuth = null, fbApp = null, fbFns = null;

export const Auth = {
  user: null,               // { uid, name, email, provider, isGuest }
  listeners: [],
  onChange(fn) { this.listeners.push(fn); fn(this.user); },
  _emit() { this.listeners.forEach(fn => fn(this.user)); },

  async init() {
    if (IS_ADMIN) {
      // Admin browsing: auto signed-in, no account needed
      this.user = { uid: 'admin', name: 'Admin', email: null, provider: 'admin', isGuest: false, isAdmin: true };
      this._emit();
      return;
    }
    if (IS_DEMO) {
      const saved = localStorage.getItem('ev_user');
      this.user = saved ? JSON.parse(saved) : null;
      this._emit();
      return;
    }
    // Real Firebase (loaded lazily from CDN so demo mode needs no network)
    const appMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    fbFns = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
    fbApp = appMod.initializeApp(FIREBASE_CONFIG);
    fbAuth = fbFns.getAuth(fbApp);
    fbFns.onAuthStateChanged(fbAuth, (u) => {
      this.user = u ? { uid: u.uid, name: u.displayName || u.email?.split('@')[0], email: u.email, provider: u.providerData[0]?.providerId || 'password', isGuest: false } : null;
      this._emit();
    });
  },

  async signUpEmail(name, email, password) {
    if (IS_DEMO) return this._demoLogin(name || email.split('@')[0], email, 'email');
    const cred = await fbFns.createUserWithEmailAndPassword(fbAuth, email, password);
    if (name) await fbFns.updateProfile(cred.user, { displayName: name });
  },
  async signInEmail(email, password) {
    if (IS_DEMO) return this._demoLogin(email.split('@')[0], email, 'email');
    await fbFns.signInWithEmailAndPassword(fbAuth, email, password);
  },
  async signInGoogle() {
    if (IS_DEMO) return this._demoLogin('Demo Googler', 'you@gmail.com', 'google');
    await fbFns.signInWithPopup(fbAuth, new fbFns.GoogleAuthProvider());
  },
  async signInFacebook() {
    if (IS_DEMO) return this._demoLogin('Demo Friend', 'you@facebook.com', 'facebook');
    await fbFns.signInWithPopup(fbAuth, new fbFns.FacebookAuthProvider());
  },
  async signInApple() {
    if (IS_DEMO) return this._demoLogin('Demo Apple', 'you@icloud.com', 'apple');
    const provider = new fbFns.OAuthProvider('apple.com');
    provider.addScope('email'); provider.addScope('name');
    await fbFns.signInWithPopup(fbAuth, provider);
  },
  continueAsGuest(anonymous = true, name = '') {
    this.user = { uid: 'guest_' + Math.random().toString(36).slice(2, 9), name: anonymous ? 'Anonymous Visitor' : (name || 'Visitor'), email: null, provider: 'guest', isGuest: true };
    if (IS_DEMO) localStorage.setItem('ev_user', JSON.stringify(this.user));
    this._emit();
  },
  async signOut() {
    if (!IS_DEMO && fbAuth) await fbFns.signOut(fbAuth);
    this.user = null;
    localStorage.removeItem('ev_user');
    this._emit();
  },
  _demoLogin(name, email, provider) {
    this.user = { uid: 'demo_' + provider + '_' + email, name, email, provider, isGuest: false };
    localStorage.setItem('ev_user', JSON.stringify(this.user));
    this._emit();
  },
};
