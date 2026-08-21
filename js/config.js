// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — Configuration
// 1) Paste your Firebase web-app config below (SETUP.md, step 1).
// 2) Set API_BASE to your running payment server (SETUP.md, step 2).
// While placeholders remain, the app runs in DEMO MODE:
// everything works, stored locally, checkout simulated.
// ============================================================

export const FIREBASE_CONFIG = {
  apiKey: 'PASTE_YOUR_API_KEY',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project',
  storageBucket: 'your-project.appspot.com',
  messagingSenderId: '000000000000',
  appId: 'PASTE_YOUR_APP_ID',
};

// The Node payment server from /server (Stripe test mode)
export const API_BASE = 'http://localhost:4242';

// Google Maps Platform key → unlocks PHOTOREALISTIC 3D Earth mode
// (Maps JavaScript API, "3D Maps" — free during Preview).
// Two ways to provide it:
//   1. Paste it in the app: the Enable 3D button (saved in your browser), or
//   2. Hardcode it here, replacing 'PASTE_YOUR_MAPS_KEY'.
// Without it, Earth mode uses keyless satellite imagery (still works!).
const HARDCODED_MAPS_KEY = 'AIzaSyAXXrmLNJI_x9AjrNrVkGDHzTAQCrhEVTA';
const savedMapsKey = (() => { try { return localStorage.getItem('ev_maps_key') || ''; } catch { return ''; } })();
// Hardcoded key wins (so an old key pasted via the Enable 3D button can't shadow it)
export const GOOGLE_MAPS_API_KEY = (HARDCODED_MAPS_KEY !== 'PASTE_YOUR_MAPS_KEY' ? HARDCODED_MAPS_KEY : savedMapsKey) || 'PASTE_YOUR_MAPS_KEY';

export const IS_DEMO = FIREBASE_CONFIG.apiKey === 'PASTE_YOUR_API_KEY';

// Admin mode: enabled from the admin dashboard ("View site as Admin").
// Bypasses all paywalls client-side. NOTE: this is a prototype
// convenience — production enforcement must stay server-side.
export const IS_ADMIN = (() => { try { return localStorage.getItem('ev_admin_mode') === '1'; } catch { return false; } })();
export const HAS_MAPS3D = GOOGLE_MAPS_API_KEY !== 'PASTE_YOUR_MAPS_KEY' && GOOGLE_MAPS_API_KEY.length > 20;
