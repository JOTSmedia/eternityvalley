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

// The Node payment server from /server (Stripe test mode).
// Leave as-is for local development. When the site is published as a
// static build (GitHub Pages and friends) there is no server to talk
// to, and a page served over HTTPS cannot call http://localhost at all
// — the browser blocks it as mixed content. So the base is resolved at
// runtime: on a real host it becomes empty, and every caller checks
// HAS_API first rather than firing requests that are certain to fail.
const CONFIGURED_API_BASE = 'http://localhost:4242';

const isLoopback = (host) =>
  host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '' || host.endsWith('.local');

// A loopback server is only reachable from a loopback page. Point
// CONFIGURED_API_BASE at a real deployed server and it is always used.
export const API_BASE = (() => {
  let configuredHost = '';
  try { configuredHost = new URL(CONFIGURED_API_BASE).hostname; } catch { return ''; }
  const host = typeof location !== 'undefined' && location.hostname ? location.hostname : '';
  if (isLoopback(configuredHost)) return isLoopback(host) ? CONFIGURED_API_BASE : '';
  return CONFIGURED_API_BASE;
})();

export const HAS_API = API_BASE !== '';

// Google Maps Platform key → unlocks PHOTOREALISTIC 3D Earth mode
// (Maps JavaScript API, "3D Maps" — free during Preview).
// Two ways to provide it:
//   1. Paste it in the app: the Enable 3D button (saved in your browser), or
//   2. Hardcode it here, replacing 'PASTE_YOUR_MAPS_KEY'.
// Without it, Earth mode uses keyless satellite imagery (still works!).
// ⚠️  THIS KEY IS PUBLIC THE MOMENT THIS FILE IS.
//
// That is normal for a Maps *browser* key — it has to reach the
// visitor's browser to work, so it cannot be kept secret, and Google
// designs for that. What protects it is not secrecy but an HTTP
// referrer restriction, and an unrestricted key in a public repo WILL
// be found by scrapers and billed to you.
//
// Before (or immediately after) publishing this repo:
//   Google Cloud Console → APIs & Services → Credentials → this key
//   • Application restrictions → Websites
//   • Add:  https://<your-github-username>.github.io/*
//           (and your custom domain, plus http://localhost:*/* for dev)
//   • API restrictions → only "Maps JavaScript API" + "Places API"
//   • Billing → set a budget alert, and a quota cap on the Maps API
//
// To ship without a key at all, set this back to 'PASTE_YOUR_MAPS_KEY'.
// The site still works: Earth mode falls back to keyless satellite
// imagery, and the "Enable 3D" button lets any visitor paste their own.
const HARDCODED_MAPS_KEY = 'AIzaSyAXXrmLNJI_x9AjrNrVkGDHzTAQCrhEVTA';
const savedMapsKey = (() => { try { return localStorage.getItem('ev_maps_key') || ''; } catch { return ''; } })();
// Hardcoded key wins (so an old key pasted via the Enable 3D button can't shadow it)
export const GOOGLE_MAPS_API_KEY = (HARDCODED_MAPS_KEY !== 'PASTE_YOUR_MAPS_KEY' ? HARDCODED_MAPS_KEY : savedMapsKey) || 'PASTE_YOUR_MAPS_KEY';

export const IS_DEMO = FIREBASE_CONFIG.apiKey === 'PASTE_YOUR_API_KEY';

export const IS_ADMIN = (() => {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === '0' || params.get('admin') === 'false') {
      localStorage.removeItem('ev_admin_mode');
      return false;
    }
    if (params.get('admin') === '1' || params.get('admin') === 'true' || params.get('mode') === 'admin' || params.get('dev') === '1') {
      localStorage.setItem('ev_admin_mode', '1');
      return true;
    }
    return localStorage.getItem('ev_admin_mode') === '1';
  } catch {
    return false;
  }
})();
export const HAS_MAPS3D = GOOGLE_MAPS_API_KEY !== 'PASTE_YOUR_MAPS_KEY' && GOOGLE_MAPS_API_KEY.length > 20;
