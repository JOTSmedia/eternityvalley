# 🌈 SOMEWHERE OVER THE RAINBOW BRIDGE

A social memorial network where **the whole real Earth is the cemetery**. Families place photorealistic memorials anywhere on the planet — their actual backyard, the beach where she chased the tide, the trail you walked every morning — using Google's Photorealistic 3D Maps (the Google Earth engine) with a keyless satellite fallback.

It all begins at **Rainbow Bridge Valley (RBV)** — anchored at the real *Rainbow Bridge National Monument, Utah*: the world's largest natural bridge, a sandstone rainbow arched over a canyon at Lake Powell. RBV is the center point on load and the entrance to the entire cemetery. From its 🌈 marker you can **Enter the Sanctuary** — the stylized valley world with the glowing Rainbow Bridge, seasonal blooms and living skies.

## ▶ How to access the demo (step by step)

The demo runs entirely on your computer — no accounts, no keys, nothing to sign up for.

**Option A — one command (recommended):**

1. Open Terminal.
2. Run:
   ```bash
   cd "ETERNITY VALLEY/server"
   npm install
   npm start
   ```
3. Open your browser to **http://localhost:4242**
4. Click **Cross the Bridge**. You're in.

**Option B — no Node installed:**

```bash
cd "ETERNITY VALLEY"
python3 -m http.server 8000
```
Then open **http://localhost:8000**.

**What to try in the demo:**

- You land in **🌍 Earth mode over Rainbow Bridge Valley, Utah** (satellite imagery keyless; photorealistic 3D with a Google Maps key — SETUP.md §3).
- Click the pulsing 🌈 **RAINBOW BRIDGE VALLEY** marker → **Enter the Sanctuary** — the stylized valley with the glowing bridge, pawprints and living skies.
- **Search any place on Earth** in the top bar (try your own home address) → Fly → **🐾 Place a memorial** → click the exact spot in your yard → memorial form → simulated payment → their marker is on the real world map.
- Click any pet marker (Max in Central Park, Pepper in Malibu, Ranger at RBV…) → read their memorial → **leave a gift** or **sign the guestbook free** (anonymous guests welcome).
- **💬 Community** shows the live feed — gifts, letters, new memorials across the country. Click any entry to fly there.
- In the Sanctuary: district chips fly you around; green plots are buyable; skies follow **your real local time**, blooms follow **the season**, and with location allowed, **your live weather** — rain makes the rainbow glow brightest.

Demo progress is saved in your browser. To go live with real Firebase accounts and Stripe payments, follow **SETUP.md**.

## The world

- **Grand Gate** — wrought-iron gates ajar between fluted stone columns, "THE RAINBOW BRIDGE" arched overhead in gold.
- **The Rainbow Bridge** — heart of the valley. The Grand Boulevard crosses the Rainbow River on an arched stone bridge beneath seven translucent rainbow bands that shimmer day and night.
- **Rainbow River** — flows out of Mirror Lake, under the Bridge, to the southwest meadows. Blooms crowd its banks.
- **Six districts**, priced by desirability:

| District | Setting | Base price |
|---|---|---|
| Desert Bloom | High-desert garden (rain shadow) | $199 |
| Memorial Meadows | Classic garden cemetery | $249 |
| Whispering Pines | Northern pine forest | $299 |
| Lakeside Rest | Grassy west shore of Mirror Lake | $449 |
| Golden Shores | Sandy eastern beach | $499 |
| Summit Rest | Terraced NW mountain slopes | $599 |

Standard / Premium / Estate sizes with waterfront, plaza and view premiums ($199–$2,009). About a third of plots hold memorials already.

## Living paradise features

- **Time of day** — dawn, golden day, dusk, starry night follow your clock (updates every minute).
- **Seasons** — spring cherry-blossom, summer wildflower, autumn gold, winter snowdrop palettes for ~1,100 blooms and every tree crown, from today's real date.
- **Live weather** — optional; rain becomes a "blessing" (silver mist, most vivid rainbow), snow a "crystal hush". Never storms — always paradise.
- **Glowing pawprints** — a pulsing gold trail padding from the gate over the Bridge.
- **Customizable memorials** — name, species, years, epitaph; headstones, statues, trees, benches, fountains, lanterns.

## Business model

- **Memberships** (required to create memorials): Guardian $4.99/mo · Legacy $9.99/mo · Eternal $199/yr
- **Anywhere on Earth memorial**: $149 one-time — any lat/lng on the planet
- **Sanctuary plots**: one-time, $199–$2,009 by district/size/location
- **Plot items**: $9.99–$149.99, premium items tier-gated
- **Gifts** (anyone, incl. anonymous guests): flowers, candles, toys, letters, shelter donations $0.99–$5; guestbook always free
- **Social loop**: community feed of gifts/letters/new memorials keeps visitors returning
- **Charity**: 10% of every gift goes to a charity chosen by the memorial's family (or by the giver); the Shelter Donation gift is 100% pass-through; totals per charity in the admin dashboard
- **Partners**: vets, cremators, shelters and pet businesses get referral links (`/?ref=code`, tracked in admin) and a pitch page at `partners.html`
- **Sign-up**: one tap with Google, Apple or Facebook; profiles can attach Instagram/X/TikTok/Facebook handles (shown on memorials) and share campaigns to X, Facebook, WhatsApp and email

## 🚀 Go-live checklist

1. **Keys**: Firebase config in `js/config.js` (SETUP §1) · Stripe **live** keys in `server/.env` after testing (SETUP §2) · Maps key restricted to your domain (SETUP §3).
2. **Server-side entitlements**: before charging real money, verify membership/ownership in the webhook + Firestore (rails already in place) — never trust the client.
3. **Legal**: have a lawyer review `terms.html` & `privacy.html` (they are marked templates); set real support/privacy email addresses.
4. **Admin**: set a strong `ADMIN_PASSWORD` in `.env`; serve over HTTPS only.
5. **Deploy**: `docker build -t rainbow-bridge . && docker run -p 4242:4242 --env-file server/.env rainbow-bridge` — works on Fly.io, Railway, Render, Cloud Run. Put it behind HTTPS (the server sends HSTS when `NODE_ENV=production`).
6. **Hardening already in**: rate limiting (5 login attempts/min, 30 tracks/min per IP), security headers, 60 KB body limit, profanity softening on all user text, photo downsizing client-side.
7. **Moderation**: watch the admin activity log daily at launch; add takedown handling per the terms.
8. **Data**: demo state lives in each browser's localStorage — real launch moves memorials/gifts to Firestore (schema mirrors `State.data`), photos to Firebase Storage.

## Admin

- **Dashboard**: http://localhost:4242/admin.html — password `rainbowadmin` (change via `ADMIN_PASSWORD` in `server/.env`). Shows total/7-day revenue, counts and revenue split by memberships/plots/items/gifts, and a full purchase & activity log (demo checkouts, real Stripe payments via webhook, admin comps).
- **View site as Admin**: one click from the dashboard opens the site with all paywalls off — auto signed-in as Admin, unlimited plots, every tier unlocked, all checkouts instantly comped ($0, logged as ADMIN COMP). A green 🛡 badge shows on-site; click it to exit.
- Prototype note: the bypass is client-side for demo convenience; production must enforce entitlements server-side (webhook + Firestore already provide the rails).

## Tech: how "your actual backyard" works

Earth mode uses **Google Photorealistic 3D Maps** (Maps JavaScript API `maps3d`, the same engine as Google Earth) when a key is present in `js/config.js` — real 3D terrain, buildings and trees for the whole planet, with 3D memorial markers at exact lat/lng and cinematic `flyCameraTo` transitions. Without a key it falls back to keyless Esri satellite imagery via Leaflet, so the demo always works. Geocoding: Google (with key) or Nominatim (without).

## Code map

| Path | What it is |
|---|---|
| `js/terrain.js` | World geometry: terrain, river, districts, roads, plot database |
| `js/world3d.js` | 3D engine: bridge, rainbow, gate, pawprints, blooms, ambience |
| `js/ambience.js` | Season / time-of-day / live-weather logic |
| `js/map2d.js` | 2D overview map |
| `js/ui.js`, `js/auth.js`, `js/state.js`, `js/checkout.js`, `js/catalog.js` | Flows, Firebase auth, persistence, Stripe, catalog |
| `server/` | Node/Express: Stripe checkout + webhook, serves the site |
| `firestore.rules` | Only the server may write plot ownership |
