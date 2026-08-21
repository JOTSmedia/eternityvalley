// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — Checkout
// Real mode: creates a Stripe Checkout Session via /server.
// Demo mode: 1.2s simulated payment, always succeeds.
// ============================================================
import { API_BASE, IS_DEMO, IS_ADMIN } from './config.js';

// Fire-and-forget purchase telemetry for the admin dashboard
function track(kind, name, amount, admin, meta = {}) {
  try {
    const user = JSON.parse(localStorage.getItem('ev_user') || 'null')?.name || 'guest';
    const ref = localStorage.getItem('ev_ref') || undefined;
    fetch(`${API_BASE}/track`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, name, amount, admin, user, charity: meta.charity, donate: meta.donate, ref }),
    }).catch(() => {});
  } catch {}
}

export async function checkout({ kind, name, amount, meta = {} }) {
  // kind: 'plot' | 'membership' | 'item' | 'gift'
  if (IS_ADMIN) {
    track(kind, name, amount, true, meta);    // logged as ADMIN COMP, $0 revenue
    return { ok: true, admin: true };
  }
  if (IS_DEMO) {
    await new Promise(r => setTimeout(r, 1200));
    track(kind, name, amount, false, meta);
    return { ok: true, demo: true };
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
