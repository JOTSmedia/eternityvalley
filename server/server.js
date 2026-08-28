// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — Payment & static server (Stripe test mode)
// Run:  cd server && npm install && npm start
// Serves the frontend at http://localhost:4242 and exposes:
//   POST /create-checkout-session  → Stripe-hosted checkout
//   POST /webhook                  → records completed purchases
// ============================================================
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 4242;

// ---------------- Admin & event store ----------------
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'rainbowadmin';
const adminTokens = new Set();
const DATA_DIR = path.join(__dirname, 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

function readEvents() {
  try { return JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8')); } catch { return []; }
}
function writeEvents(evts) {
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(evts.slice(-2000), null, 1));
}
function checkAdmin(req, res, next) {
  const tok = (req.headers.authorization || '').replace('Bearer ', '');
  if (adminTokens.has(tok)) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// Simple in-memory rate limiter (per IP per route bucket)
const rateBuckets = new Map();
function rateLimit(bucket, max, windowMs) {
  return (req, res, next) => {
    const key = bucket + ':' + (req.ip || req.socket.remoteAddress);
    const now = Date.now();
    const rec = rateBuckets.get(key);
    if (!rec || now - rec.t0 > windowMs) { rateBuckets.set(key, { t0: now, n: 1 }); return next(); }
    if (++rec.n > max) return res.status(429).json({ error: 'Too many requests — slow down.' });
    next();
  };
}
setInterval(() => { // sweep old buckets
  const now = Date.now();
  for (const [k, v] of rateBuckets) if (now - v.t0 > 120000) rateBuckets.delete(k);
}, 60000);

// Security headers
const isProd = process.env.NODE_ENV === 'production';
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

const stripeKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeKey ? require('stripe')(stripeKey) : null;

// Optional: Firebase Admin for recording purchases server-side
let db = null;
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const admin = require('firebase-admin');
  admin.initializeApp();
  db = admin.firestore();
}

// Stripe webhook needs the raw body — register BEFORE json parser
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(500).send('Stripe not configured');
  let event;
  try {
    event = process.env.STRIPE_WEBHOOK_SECRET
      ? stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)
      : JSON.parse(req.body);
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const meta = s.metadata || {};
    console.log('✓ Payment complete:', meta.kind, meta.plotId || meta.membershipId || meta.itemId || meta.giftId, s.amount_total / 100);
    // record for the admin dashboard
    const evts = readEvents();
    evts.push({ kind: meta.kind || 'payment', name: 'Stripe: ' + (meta.plotId || meta.membershipId || meta.itemId || meta.giftId || s.id), amount: s.amount_total / 100, admin: false, user: s.customer_details?.email || meta.uid || 'stripe', at: Date.now() });
    writeEvents(evts);
    if (db && meta.uid) {
      const ref = db.collection('purchases').doc(s.id);
      await ref.set({ ...meta, amount: s.amount_total / 100, at: new Date(), email: s.customer_details?.email || null });
      if (meta.kind === 'membership') {
        await db.collection('users').doc(meta.uid).set({ membership: meta.membershipId }, { merge: true });
      }
      if (meta.kind === 'plot') {
        await db.collection('plots').doc(meta.plotId).set({ owner: meta.uid, status: 'occupied', at: new Date() });
      }
    }
  }
  res.json({ received: true });
});

app.use(securityHeaders);
app.use(express.json({ limit: '60kb' }));

app.post('/create-checkout-session', async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Set STRIPE_SECRET_KEY in server/.env (see SETUP.md)' });
  try {
    const { kind, name, amountCents, meta = {}, successUrl, cancelUrl } = req.body;
    if (!name || !amountCents || amountCents < 50 || amountCents > 500000) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    const isSub = kind === 'membership';
    const session = await stripe.checkout.sessions.create({
      mode: isSub ? 'subscription' : 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          product_data: { name },
          unit_amount: amountCents,
          ...(isSub ? { recurring: { interval: meta.membershipId === 'mem_eternal' ? 'year' : 'month' } } : {}),
        },
      }],
      metadata: { kind, ...meta },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: e.message });
  }
});

// ---------------- Admin API ----------------
app.post('/admin/login', rateLimit('login', 5, 60000), (req, res) => {
  if ((req.body?.password || '') !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  adminTokens.add(token);
  res.json({ token });
});

// Lightweight purchase/activity tracking from the frontend
// (demo & admin checkouts post here; real payments arrive via webhook)
app.post('/track', rateLimit('track', 30, 60000), (req, res) => {
  const { kind, name, amount, admin: isAdmin, user, charity, donate, ref } = req.body || {};
  if (!kind || typeof amount !== 'number') return res.status(400).json({ ok: false });
  const evts = readEvents();
  evts.push({
    kind, name: String(name).slice(0, 120), amount, admin: !!isAdmin,
    user: String(user || 'guest').slice(0, 60),
    charity: charity ? String(charity).slice(0, 30) : undefined,
    donate: typeof donate === 'number' ? donate : undefined,
    ref: ref ? String(ref).slice(0, 40) : undefined,
    at: Date.now(),
  });
  writeEvents(evts);
  res.json({ ok: true });
});

app.get('/admin/events', checkAdmin, (req, res) => res.json(readEvents()));

app.delete('/admin/events', checkAdmin, (req, res) => { writeEvents([]); res.json({ ok: true }); });

app.get('/admin/summary', checkAdmin, (req, res) => {
  const evts = readEvents();
  const paid = evts.filter(e => !e.admin);
  const sum = (arr) => Math.round(arr.reduce((s, e) => s + e.amount, 0) * 100) / 100;
  const by = (k) => paid.filter(e => e.kind === k);
  res.json({
    totalRevenue: sum(paid),
    counts: {
      memberships: by('membership').length,
      plots: by('plot').length,
      items: by('item').length,
      gifts: by('gift').length,
      adminComps: evts.filter(e => e.admin).length,
    },
    revenue: {
      memberships: sum(by('membership')),
      plots: sum(by('plot')),
      items: sum(by('item')),
      gifts: sum(by('gift')),
    },
    last7d: sum(paid.filter(e => e.at > Date.now() - 7 * 864e5)),
    events: evts.length,
    // charitable giving (from non-comped gifts)
    donations: (() => {
      const per = {};
      let total = 0;
      for (const e of paid) {
        if (typeof e.donate === 'number' && e.donate > 0) {
          per[e.charity || 'unspecified'] = Math.round(((per[e.charity || 'unspecified'] || 0) + e.donate) * 100) / 100;
          total += e.donate;
        }
      }
      return { total: Math.round(total * 100) / 100, perCharity: per };
    })(),
    referrals: (() => {
      const per = {};
      for (const e of evts) if (e.ref) per[e.ref] = (per[e.ref] || 0) + 1;
      return per;
    })(),
  });
});

// Serve the frontend
app.use(express.static(path.join(__dirname, '..')));

app.listen(PORT, () => {
  console.log(`\n🌈 Somewhere Over the Rainbow Bridge running at http://localhost:${PORT}`);
  console.log(stripe ? '  Stripe: configured ✓' : '  Stripe: NOT configured — frontend will run in demo mode');
  console.log(`  Admin dashboard: http://localhost:${PORT}/admin.html  (password: ${process.env.ADMIN_PASSWORD ? 'from .env' : 'rainbowadmin — set ADMIN_PASSWORD in .env!'})`);
});
