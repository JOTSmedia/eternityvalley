# 🌈 Somewhere Over the Rainbow Bridge — going live: Firebase + Stripe

The app runs in demo mode until you complete these steps. Each is ~10 minutes.

## 1 · Firebase (accounts & database)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project** (e.g. `rainbow-bridge`).
2. **Build → Authentication → Get started**, enable these sign-in providers:
   - **Email/Password**
   - **Google** (one click)
   - **Facebook** — needs a Facebook Developer app: create one at [developers.facebook.com](https://developers.facebook.com), copy the App ID/Secret into Firebase, and paste Firebase's OAuth redirect URL back into the Facebook app settings.
   - **Apple** — needs an Apple Developer Account: Register an App ID with 'Sign In with Apple' enabled, create a Service ID, configure your domains and return URLs, create a private key, and enter these details into Firebase Auth settings.
   - **X (Twitter)** — needs a Twitter Developer account: create an app at [developer.twitter.com](https://developer.twitter.com), enable OAuth 1.0a or 2.0, set the Callback URI to Firebase's OAuth redirect URL, and paste the API Key and API Secret Key into Firebase Auth settings.
3. **Build → Firestore Database → Create database** (production mode).
4. **Rules** tab → paste the contents of `firestore.rules` → Publish.
5. Project settings (gear) → **Your apps → Web app** (</> icon) → register. Copy the `firebaseConfig` object it shows into **`js/config.js`**, replacing the placeholders.
6. Authentication → Settings → **Authorized domains**: add `localhost` (already there by default) and your real domain when you deploy.

Once `js/config.js` has real values, demo mode switches off automatically.

## 2 · Stripe (payments, test mode first)

1. Create an account at [stripe.com](https://stripe.com) — stay in **Test mode** (toggle, top right).
2. [Dashboard → Developers → API keys](https://dashboard.stripe.com/test/apikeys): copy the **Secret key** (`sk_test_...`).
3. In `server/`:
   ```bash
   cd server
   cp .env.example .env     # paste your sk_test_... into .env
   npm install
   npm start
   ```
4. The site is now served at **http://localhost:4242** with real Stripe checkout. Test card: `4242 4242 4242 4242`, any future date, any CVC.
5. Webhook (so purchases are recorded server-side):
   ```bash
   stripe listen --forward-to localhost:4242/webhook
   ```
   ([Stripe CLI](https://docs.stripe.com/stripe-cli)) — copy the printed `whsec_...` into `.env` as `STRIPE_WEBHOOK_SECRET`, restart the server.
6. Optional: Firebase service account (Project settings → Service accounts → Generate key), save as `server/serviceAccount.json`, set `GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json` in `.env`. Completed payments then write membership/plot ownership straight to Firestore.

## 3 · Google Maps — full photorealistic 3D Earth (~10 min)

Earth mode works out of the box with keyless satellite imagery, but a Google Maps key unlocks the **Photorealistic 3D Maps** engine (real Google Earth-style 3D of the whole planet — free during Preview).

1. [console.cloud.google.com](https://console.cloud.google.com) → create/select a project (e.g. `rainbow-bridge`).
2. **Billing** → add a card. Required by Google, but with the free tiers below development costs $0.
3. **APIs & Services → Library**: enable **Maps JavaScript API** and **Geocoding API**.
4. **Credentials → Create credentials → API key** → copy it. Recommended: restrict it to those two APIs and to your domains (`localhost:4242` + your real domain later).
5. Give the app the key — either way works:
   - **In the app** (easiest): Earth view → **🔑 Enable 3D** → paste → *Save & relaunch in 3D*. Stored in your browser only.
   - **In code**: paste into `js/config.js` as `HARDCODED_MAPS_KEY`.
6. Done — Earth mode renders photorealistic 3D terrain, buildings and trees anywhere on the planet, starting at Rainbow Bridge Valley (Rainbow Bridge National Monument, Utah).

**Is it free?** 3D Maps itself: **no charge during Google's Preview** (usage-based pricing arrives only at GA). Map loads and geocoding: **10,000 free per month each** (the old $200 universal credit was replaced by these per-SKU free tiers in March 2025). A demo/dev workload stays comfortably at $0 — set a Google Cloud budget alert for peace of mind.

## 4 · Deploy (when ready)

- **Frontend**: Firebase Hosting, Netlify or Vercel — it's static files.
- **Server**: Render, Railway, Fly.io or Cloud Run. Set the env vars from `.env`, then update `API_BASE` in `js/config.js` to the server's URL.
- Switch Stripe to live keys only after testing.

## Notes

- **Never commit `.env` or `serviceAccount.json`.**
- Prices for plots/items/gifts are defined in `js/catalog.js` and `js/terrain.js` (district base prices). The server creates Stripe prices dynamically, so no dashboard product setup is required.
- This is a prototype paywall: for production, add server-side verification that a user's membership is active before honoring plot purchases (the webhook + Firestore records in step 2.6 give you everything needed).
