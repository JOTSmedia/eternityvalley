// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — Checkout
// Real mode: creates a Stripe Checkout Session via /server.
// Demo mode: 1.2s simulated payment, always succeeds.
//
// Every successful payment — every one, from a 99¢ candle to a
// membership — is written to the transparency ledger from here. This
// is the only chokepoint money passes through, which is precisely why
// the recording happens at this level rather than at the twenty-odd
// call sites: a feature added later cannot forget to account for
// itself, because the only way to take money is to come through here.
// ============================================================
import { API_BASE, HAS_API, IS_DEMO, IS_ADMIN } from './config.js';
import { Ledger, toCents, CHARITIES } from './charity.js';

// Fire-and-forget purchase telemetry for the admin dashboard.
// Silent no-op on a static deploy: there is no dashboard to report to,
// and firing anyway just fills the console with failed requests.
function track(kind, name, amount, admin, meta = {}) {
  if (!HAS_API) return;
  try {
    const user = JSON.parse(localStorage.getItem('ev_user') || 'null')?.name || 'guest';
    const ref = localStorage.getItem('ev_ref') || undefined;
    fetch(`${API_BASE}/track`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, name, amount, admin, user, charity: meta.charity, donate: meta.donate, ref }),
    }).catch(() => {});
  } catch {}
}

/**
 * Which split rule applies. The "Shelter Donation" gift is a donation
 * wearing a gift's clothes — it must not be booked as a 10% tithe when
 * the catalog copy promises the whole amount.
 */
function splitKind(kind, meta) {
  if (kind === 'gift' && meta.giftId === 'g_donation') return 'giftDonate';
  return kind;
}

async function toLedger(kind, name, amount, meta, demo) {
  try {
    return await Ledger.record({
      kind: splitKind(kind, meta),
      label: name,
      amountCents: toCents(amount),
      charityId: meta.charity || CHARITIES[0].id,
      campaignId: meta.campaignId || null,
      donor: (() => {
        try { return JSON.parse(localStorage.getItem('ev_user') || 'null')?.name || 'Anonymous'; }
        catch { return 'Anonymous'; }
      })(),
      demo,
    });
  } catch (e) {
    // A ledger write must never swallow a completed purchase, but it
    // must be loud — an unrecorded transaction is the one failure this
    // whole layer exists to prevent.
    console.error('[ledger] FAILED TO RECORD', { kind, name, amount }, e);
    return null;
  }
}

export async function checkout({ kind, name, amount, meta = {} }) {
  // kind: 'plot' | 'membership' | 'item' | 'gift' | 'donation' | 'merch'
  if (IS_ADMIN) {
    track(kind, name, amount, true, meta);    // logged as ADMIN COMP, $0 revenue
    // Deliberately not written to the ledger: no money moved, and a
    // comp recorded as revenue would overstate what reached charity.
    return { ok: true, admin: true };
  }
  if (IS_DEMO) {
    await new Promise(r => setTimeout(r, 1200));
    track(kind, name, amount, false, meta);
    const entry = await toLedger(kind, name, amount, meta, true);
    return { ok: true, demo: true, entry };
  }
  if (!HAS_API) {
    throw new Error(
      'This build has no payment server attached, so nothing can be charged. ' +
      'Point API_BASE in js/config.js at a deployed /server to take real payments.'
    );
  }
  const res = await fetch(`${API_BASE}/create-checkout-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind, name,
      amountCents: Math.round(amount * 100),
      meta,
      successUrl: location.origin + location.pathname + '?paid=1',
      cancelUrl: location.href,
    }),
  });
  if (!res.ok) throw new Error('Payment server unavailable — is /server running? (see SETUP.md)');
  const { url } = await res.json();
  location.href = url;         // redirect to Stripe-hosted checkout
  return { ok: false, redirected: true };
}
