# Somewhere Over the Rainbow Bridge

A pet memorial on the real Earth — and one that gives back to living animals.

Place a memorial anywhere on the planet (their backyard, their beach, the trail
you walked every evening) or in the Rainbow Bridge Valley sanctuary. A share of
every plot, membership and gift goes to an animal charity **the memorial's owner
chooses**. Anyone who never buys anything at all can still start a free
fundraising campaign in their companion's name. Every cent that moves through the
site is published in a public, hash-chained ledger.

This folder is the complete site, ready to upload. It is entirely static — no
build step, no bundler, no server required.

---

## ⚠️ Do this first: restrict the Google Maps key

`js/config.js` contains a live Google Maps API key. Publishing this repo makes it
public.

That is *expected* for a Maps browser key — it has to reach the visitor's browser
to work at all, so it can never be secret. What protects it is an **HTTP referrer
restriction**, not secrecy. An unrestricted key in a public repo will be found by
scrapers within days and billed to your account.

**In the Google Cloud Console → APIs & Services → Credentials → your key:**

1. **Application restrictions → Websites.** Add:
   - `https://<your-username>.github.io/*`
   - your custom domain, if you have one
   - `http://localhost:*/*` for local development
2. **API restrictions →** allow only *Maps JavaScript API* and *Places API*.
3. **Billing →** set a budget alert and a daily quota cap on the Maps API.

**Don't want to publish a key at all?** Set `HARDCODED_MAPS_KEY` back to
`'PASTE_YOUR_MAPS_KEY'` in `js/config.js`. The site still works: Earth mode falls
back to keyless satellite imagery, and the "Enable 3D" button lets any visitor
paste their own key, stored only in their browser.

---

## Publishing to GitHub Pages

1. Create a new repository on GitHub.
2. Upload **the entire contents of this folder** to the repository root — so that
   `index.html` sits at the top level, not inside a subfolder.
3. Repository **Settings → Pages**.
4. **Source:** *Deploy from a branch*. **Branch:** `main`, folder `/ (root)`.
5. Save. The site appears at `https://<your-username>.github.io/<repo-name>/`
   within a minute or two.

Every path in the site is relative, so it works both at a domain root and in a
`/<repo-name>/` subfolder. `.nojekyll` is included so GitHub serves the files
as-is rather than running them through Jekyll.

### Running it locally

Open a terminal in this folder:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

Opening `index.html` directly as a `file://` URL will **not** work — ES modules
and `fetch()` are blocked on that protocol by every modern browser. You need a
server, even locally.

---

## What's in here

| Path | What it is |
|---|---|
| `index.html` | The whole app — entrance, globe, valley, panels |
| `js/` | ES modules, loaded natively; no build step |
| `css/style.css` | One stylesheet; a time-reactive design system |
| `images/planet/` | NASA Blue Marble imagery (public domain) |
| `images/catalog/` | Sourced photographs, with their credits files |
| `credits.html` | Per-image attribution — **required**, see below |
| `server/` | Optional Node payment server (ignored by GitHub Pages) |
| `admin.html` | Dashboard for the Node server; non-functional without it |

Three.js is loaded at runtime from the jsDelivr CDN via an import map in
`index.html`. Nothing else is fetched from a third party.

---

## Photo attribution is a licence condition, not a courtesy

26 of the 34 photographs are CC-BY or CC-BY-SA. Visible credit is a **condition**
of those licences. `credits.html` carries the author, licence and source link for
every image, and is linked from the entrance and all three legal pages.

**Do not remove `credits.html` or the links to it.** Doing so puts the site in
breach of the licences on most of its photography.

`images/catalog/manifest.json` is generated *from* the credits files, so an image
with no recorded attribution is treated as absent rather than shown. The failure
mode is a missing photo, not a licence breach. If you add photographs, add their
credits too.

---

## Demo mode

Out of the box the site runs in **demo mode**: everything works, data is stored in
the visitor's own browser (`localStorage`), and checkout is simulated. Nothing is
charged and no money moves. This is the correct state for a public GitHub Pages
deployment, which cannot keep secrets or run a backend.

The charities named in the app are real, and are listed with their EIN so anyone
can verify them independently — but none of them has any relationship with this
site, and the app says so wherever money is discussed.

### Going live

Real payments need a server; GitHub Pages cannot host one. See `SETUP.md`. In
short:

1. Create a Firebase project, paste its web config into `js/config.js`.
2. Deploy `server/` somewhere that runs Node (Railway, Render, Fly.io, a VPS),
   with your Stripe keys in a `.env` — see `server/.env.example`.
3. Point `CONFIGURED_API_BASE` in `js/config.js` at that deployed server.

`API_BASE` resolves to nothing when the configured server is a `localhost`
address and the page is not itself on localhost — otherwise a published HTTPS
site fires blocked mixed-content requests at `http://localhost:4242` on every
visit. Set it to a real HTTPS URL and it is used everywhere.

---

## The ledger

`js/charity.js` is the money layer, and it is deliberately the thing everything
else routes through:

- Amounts are **integer cents** throughout — splitting `$4.99` in floating point
  loses fractions of a cent, and a ledger that doesn't add up is worse than none.
- One `SPLITS` table decides where each kind of payment goes. The module throws
  on load if any split fails to sum to 1.
- Shares are calculated on the amount left **after** the card processor's cut, so
  "100% to charity" means the amount that actually arrives. Rounding remainders
  always go to the charity.
- `checkout()` is the single chokepoint. A feature added later cannot forget to
  account for itself, because taking money means going through it.
- Entries are hash-chained with SHA-256 (with a clearly-labelled fallback in
  non-secure contexts, where `crypto.subtle` is unavailable). Editing an old row
  breaks every row after it, and the ledger view says so.

In this static build the ledger lives in `localStorage`, which means it is
per-visitor and provable only against casual editing — someone who controls the
storage can recompute the chain. The structure is correct now so that moving it
server-side is a change of storage, not a change of design. **That is the point:**
a ledger retrofitted onto months of existing transactions is a forensic
accounting project; built as the layer money moves through, publishing it is just
reading the table back out.

---

## Browser support

Needs a browser with ES modules, WebGL2 and `import maps` — Chrome/Edge 89+,
Firefox 108+, Safari 16.4+. The valley and globe need WebGL; if it's unavailable
the site says so rather than showing a black screen.

Tested down to 375 × 812 (iPhone SE / mini). Respects `prefers-reduced-motion`
throughout — including the guided tour, which stops advancing on its own.
