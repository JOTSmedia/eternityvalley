// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — the charitable layer
//
// Three things live here, and they are deliberately one file because
// they are one idea:
//
//   1. WHO the money can go to      — a registry of real charities,
//                                      each verifiable by EIN.
//   2. HOW every dollar is split    — one table, no exceptions.
//   3. WHERE IT WENT                — an append-only ledger that
//                                      every payment writes through.
//
// The ledger is the reason this is a module and not a feature. A
// transparency page bolted on later can only ever report what the
// database happened to keep; built as the layer money moves through,
// "publish every cent" is just reading the table back out. Nothing in
// this app may take money without calling record() — that is the whole
// design, and it is why splits are computed here rather than at the
// call sites.
//
// MONEY IS IN INTEGER CENTS everywhere below. Splitting $4.99 three
// ways in floating point loses fractions of a cent, and a ledger that
// does not add up is worse than no ledger at all. The only place a
// float appears is at the very edge, in fmt().
// ============================================================

// ---------------------------------------------------------------
// 1. The registry
//
// These are real organisations, listed with the EIN they file under so
// that any claim made here can be checked against the IRS Tax Exempt
// Organization Search rather than taken on trust. Listing is NOT a
// partnership and NOT an endorsement by them of us — none of these
// organisations has any relationship with this site. `verify` is the
// public record; `url` is theirs.
// ---------------------------------------------------------------
export const CHARITIES = [
  {
    id: 'ch_bestfr',
    name: 'Best Friends Animal Society',
    ein: '23-7147797',
    cat: 'No-kill shelters & rescue',
    blurb: 'Works toward no-kill status for every US shelter, and runs the country’s largest no-kill sanctuary.',
    url: 'https://bestfriends.org',
  },
  {
    id: 'ch_aspca',
    name: 'ASPCA',
    ein: '13-1623829',
    cat: 'Cruelty prevention & rescue',
    blurb: 'Rescue and rehabilitation for animals out of cruelty and neglect cases, plus poison control and legal advocacy.',
    url: 'https://aspca.org',
  },
  {
    id: 'ch_humane',
    name: 'Humane World for Animals',
    ein: '53-0225390',
    cat: 'Policy & disaster response',
    blurb: 'Formerly the Humane Society of the United States. Disaster rescue, puppy-mill enforcement, and animal-welfare law.',
    url: 'https://www.humaneworld.org',
  },
  {
    id: 'ch_petsmart',
    name: 'PetSmart Charities',
    ein: '93-1140967',
    cat: 'Adoption & access to vet care',
    blurb: 'Funds adoption programs and pays for veterinary care for families who could not otherwise afford it.',
    url: 'https://petsmartcharities.org',
  },
  {
    id: 'ch_redrover',
    name: 'RedRover',
    ein: '68-0124097',
    cat: 'Emergency vet-care grants',
    blurb: 'Emergency grants for urgent veterinary care, and help keeping pets with owners fleeing domestic violence.',
    url: 'https://redrover.org',
  },
  {
    id: 'ch_petfinder',
    name: 'Petfinder Foundation',
    ein: '84-1595601',
    cat: 'Direct grants to local shelters',
    blurb: 'Grants straight to small local shelters and rescues — the ones with no fundraising staff of their own.',
    url: 'https://petfinderfoundation.com',
  },
];

export const charityById = (id) => CHARITIES.find(c => c.id === id) || null;
export const charityName = (id) => charityById(id)?.name || null;

// ---------------------------------------------------------------
// 2. The split table
//
// One place, so that what the interface promises and what the ledger
// records cannot drift apart. Shares are of the NET amount — what is
// left after the payment processor takes its cut — because promising
// "100% to charity" and then quietly paying card fees out of it is the
// exact dishonesty this whole layer exists to avoid.
//
// `charity` and `ops` must sum to 1 for every kind. There is a test
// for that at the bottom of this file which throws on load, on the
// theory that a build which cannot account for its money should not
// start at all.
// ---------------------------------------------------------------
export const SPLITS = {
  // A straight donation to a memorial campaign. We take nothing.
  donation:   { charity: 1.00, ops: 0.00, label: 'Campaign donation' },
  // The "Shelter Donation" gift is exactly that — a donation.
  giftDonate: { charity: 1.00, ops: 0.00, label: 'Donation gift' },
  // Ordinary gifts left at a memorial.
  gift:       { charity: 0.10, ops: 0.90, label: 'Memorial gift' },
  // Plots, items and merch: goods and hosting, with a tithe.
  item:       { charity: 0.10, ops: 0.90, label: 'Memorial item' },
  plot:       { charity: 0.10, ops: 0.90, label: 'Plot' },
  merch:      { charity: 0.15, ops: 0.85, label: 'Merchandise' },
  // Memberships pay for the servers that keep memorials online.
  membership: { charity: 0.05, ops: 0.95, label: 'Membership' },
};

// Stripe's standard US online rate. Named and subtracted openly rather
// than absorbed silently, so the ledger's "to charity" figure is the
// amount that actually arrives.
export const PROCESSOR = { pct: 0.029, flat: 30, name: 'Stripe processing' };

/** Legacy name kept so existing call sites keep working. */
export const GIFT_CHARITY_SHARE = SPLITS.gift.charity;

export const toCents = (dollars) => Math.round(Number(dollars) * 100);
export const fmt = (cents) => {
  const v = (Math.abs(cents) / 100).toFixed(2);
  return (cents < 0 ? '-$' : '$') + v.replace(/\.00$/, '');
};

/**
 * Split one payment. Every field is an integer number of cents, and
 * processor + charity + ops === gross exactly — the remainder from
 * rounding is given to the charity rather than kept, so the books
 * always balance and never in our favour.
 *
 * @param {keyof SPLITS} kind
 * @param {number} grossCents
 */
export function split(kind, grossCents) {
  const rule = SPLITS[kind] || SPLITS.item;
  const gross = Math.max(0, Math.round(grossCents));
  const processor = gross === 0 ? 0 : Math.min(gross, Math.round(gross * PROCESSOR.pct) + PROCESSOR.flat);
  const net = gross - processor;
  const ops = Math.floor(net * rule.ops);
  const charity = net - ops;              // remainder rounds toward the cause
  return { kind, gross, processor, net, charity, ops, rule };
}

// ---------------------------------------------------------------
// 3. The ledger
//
// Append-only, and hash-chained: each entry carries a digest of its own
// contents plus the digest of the entry before it, so any later edit to
// an old row breaks every row after it and verify() says so.
//
// Being honest about what this is: a chain in localStorage proves that
// the file has not been *casually* altered. It is not a defence against
// someone who controls the storage — they can recompute the whole
// chain. Its job on a real deployment is to be written server-side and
// published, at which point the same structure is meaningful, because
// the public copy and our copy can be compared. The shape is correct
// now so that the move server-side is a change of storage, not a
// change of design.
// ---------------------------------------------------------------
const LEDGER_KEY = 'ev_ledger_v1';

/** SHA-256 where the platform offers it; a labelled fallback where it doesn't. */
async function digest(text) {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const buf = await subtle.digest('SHA-256', new TextEncoder().encode(text));
      return { alg: 'sha-256', hash: [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('') };
    } catch {}
  }
  // file:// and other non-secure contexts have no crypto.subtle. Say
  // which algorithm was used rather than pretending it was SHA-256.
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    h1 = Math.imul(h1 ^ text.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + text.charCodeAt(i) * (i + 1), 0x85ebca6b) >>> 0;
  }
  return { alg: 'fnv-1a', hash: (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).repeat(2) };
}

/** The exact bytes that get hashed. Key order is fixed on purpose. */
const canonical = (e) => JSON.stringify([
  e.seq, e.at, e.kind, e.label, e.gross, e.processor, e.charity, e.ops, e.charityId, e.campaignId || '', e.prev,
]);

export const Ledger = {
  entries: [],
  _loaded: false,

  load() {
    if (this._loaded) return this.entries;
    this._loaded = true;
    try {
      const raw = localStorage.getItem(LEDGER_KEY);
      if (raw) this.entries = JSON.parse(raw) || [];
    } catch { this.entries = []; }
    return this.entries;
  },

  _persist() {
    try { localStorage.setItem(LEDGER_KEY, JSON.stringify(this.entries)); } catch {}
  },

  /**
   * Write one transaction. The ONLY way money is allowed to enter the
   * system. Returns the entry, including the split, so callers can
   * show the giver exactly where their money went.
   */
  async record({ kind, label, amountCents, charityId = null, campaignId = null, donor = null, demo = false }) {
    this.load();
    const s = split(kind, amountCents);
    const prev = this.entries.length ? this.entries[this.entries.length - 1].hash : 'genesis';
    const entry = {
      seq: this.entries.length + 1,
      at: Date.now(),
      kind,
      label: String(label || SPLITS[kind]?.label || kind),
      gross: s.gross,
      processor: s.processor,
      charity: s.charity,
      ops: s.ops,
      charityId,
      campaignId,
      donor: donor || 'Anonymous',
      demo,
      prev,
    };
    const { alg, hash } = await digest(canonical(entry));
    entry.alg = alg;
    entry.hash = hash;
    this.entries.push(entry);
    this._persist();
    return entry;
  },

  /** Every figure the transparency page shows, derived — never stored. */
  totals() {
    this.load();
    const t = { gross: 0, processor: 0, charity: 0, ops: 0, count: this.entries.length, byCharity: {}, byKind: {} };
    for (const e of this.entries) {
      t.gross += e.gross; t.processor += e.processor; t.charity += e.charity; t.ops += e.ops;
      if (e.charityId && e.charity > 0) t.byCharity[e.charityId] = (t.byCharity[e.charityId] || 0) + e.charity;
      const k = (t.byKind[e.kind] ||= { gross: 0, charity: 0, ops: 0, count: 0 });
      k.gross += e.gross; k.charity += e.charity; k.ops += e.ops; k.count++;
    }
    return t;
  },

  /**
   * Re-hash the whole chain. Returns the first row that fails, or null.
   * Also checks each row adds up on its own — a chain of internally
   * inconsistent rows would hash perfectly well.
   */
  async verify() {
    this.load();
    let prev = 'genesis';
    for (const e of this.entries) {
      if (e.prev !== prev) return { ok: false, seq: e.seq, why: 'chain broken — this row does not follow the one before it' };
      if (e.gross !== e.processor + e.charity + e.ops) return { ok: false, seq: e.seq, why: 'row does not balance' };
      const { hash } = await digest(canonical(e));
      if (hash !== e.hash) return { ok: false, seq: e.seq, why: 'contents changed after they were recorded' };
      prev = e.hash;
    }
    return { ok: true, seq: null, why: null, count: this.entries.length };
  },

  /** The published artefact: what a third party would audit. */
  exportJSON() {
    this.load();
    return JSON.stringify({
      generated: new Date().toISOString(),
      splits: SPLITS,
      processor: PROCESSOR,
      note: 'All amounts are integer US cents. charity + ops + processor === gross for every entry.',
      totals: this.totals(),
      entries: this.entries,
    }, null, 2);
  },
};

// ---------------------------------------------------------------
// 4. Campaigns
//
// The point of the whole layer: you do not need a plot, a membership,
// or an account to raise money in your animal's name. A campaign is
// free, and 100% of what it raises goes to the chosen charity.
// ---------------------------------------------------------------
const CAMPAIGN_KEY = 'ev_campaigns_v1';

export const Campaigns = {
  all: [],
  _loaded: false,

  load() {
    if (this._loaded) return this.all;
    this._loaded = true;
    try { this.all = JSON.parse(localStorage.getItem(CAMPAIGN_KEY) || '[]'); } catch { this.all = []; }
    return this.all;
  },
  _persist() {
    try { localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(this.all)); } catch {}
  },

  get(id) { return this.load().find(c => c.id === id) || null; },

  create({ petName, species = '', years = '', story = '', charityId, goalCents = 25000, photo = null, owner = 'A friend' }) {
    this.load();
    const c = {
      id: 'cmp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      petName: petName || 'A beloved companion',
      species, years, story,
      charityId: charityId || CHARITIES[0].id,
      goalCents: Math.max(500, Math.round(goalCents)),
      photo,
      owner,
      createdAt: Date.now(),
      donations: [],
    };
    this.all.unshift(c);
    this._persist();
    return c;
  },

  /** Records to the ledger first; the campaign only counts what the ledger accepted. */
  async donate(campaignId, { amountCents, donor = 'Anonymous', message = '' }) {
    const c = this.get(campaignId);
    if (!c) throw new Error('That campaign no longer exists.');
    const entry = await Ledger.record({
      kind: 'donation',
      label: `Donation in memory of ${c.petName}`,
      amountCents,
      charityId: c.charityId,
      campaignId,
      donor,
      demo: true,
    });
    c.donations.push({ at: entry.at, donor, message, gross: entry.gross, charity: entry.charity, seq: entry.seq });
    this._persist();
    return entry;
  },

  raised(c) { return (c.donations || []).reduce((n, d) => n + d.charity, 0); },
  grossRaised(c) { return (c.donations || []).reduce((n, d) => n + d.gross, 0); },
  progress(c) { return Math.min(1, this.raised(c) / Math.max(1, c.goalCents)); },
};

// ---------------------------------------------------------------
// A build that cannot account for its own money should not boot.
// ---------------------------------------------------------------
for (const [kind, rule] of Object.entries(SPLITS)) {
  const sum = rule.charity + rule.ops;
  if (Math.abs(sum - 1) > 1e-9) {
    throw new Error(`[charity] split "${kind}" sums to ${sum}, not 1 — refusing to run.`);
  }
}
