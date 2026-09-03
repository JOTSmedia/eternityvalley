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
// 1. The registry & Categories
//
// Verified 501(c)(3) animal rescue organisations with public EINs,
// physical headquarters coordinates for 3D Earth placement, and
// tangible real-world impact tiers.
// ---------------------------------------------------------------
export const CHARITY_CATEGORIES = [
  { id: 'all', label: 'All Rescues', icon: 'paw' },
  { id: 'nokill', label: 'No-Kill Sanctuaries', icon: 'crest' },
  { id: 'senior', label: 'Senior & Hospice Pets', icon: 'heart' },
  { id: 'emergency', label: 'Emergency Vet Grants', icon: 'sparkle' },
  { id: 'cruelty', label: 'Cruelty & Disaster Rescue', icon: 'globe' },
  { id: 'community', label: 'Local Shelter Grants', icon: 'flower' },
  { id: 'sanctuary', label: 'Farm & Equine Sanctuaries', icon: 'tree' },
];

export const CHARITIES = [
  {
    id: 'ch_bestfr',
    name: 'Best Friends Animal Society',
    catId: 'nokill',
    cat: 'No-kill shelters & rescue',
    ein: '23-7147797',
    city: 'Kanab',
    state: 'UT',
    lat: 37.0483,
    lng: -112.5317,
    rating: 'Charity Navigator 4-Star ★★★★ · Platinum Transparency',
    blurb: 'Spearheads the nationwide movement to make every shelter in the country no-kill, operating the largest animal sanctuary in the nation.',
    url: 'https://bestfriends.org',
    impactTiers: [
      { amount: 1500, label: '$15', desc: 'Provides warm beds & nutrient-rich meals for a rescued shelter pet' },
      { amount: 3500, label: '$35', desc: 'Vaccines, microchip & full health intake exam' },
      { amount: 7500, label: '$75', desc: 'Spay/neuter surgery & vital medical rehabilitation' },
      { amount: 15000, label: '$150', desc: 'Full medical intake & rescue sponsorship from a high-kill shelter' },
    ],
  },
  {
    id: 'ch_greymuzzle',
    name: 'The Grey Muzzle Organization',
    catId: 'senior',
    cat: 'Senior pet & hospice care',
    ein: '26-2580749',
    city: 'Raleigh',
    state: 'NC',
    lat: 35.7796,
    lng: -78.6382,
    rating: 'Charity Navigator 4-Star ★★★★ · 100% Impact Rating',
    blurb: 'Dedicated entirely to senior dogs across America — funding hospice care, medical grants, and loving forever-foster homes so older pets never die alone in shelters.',
    url: 'https://www.greymuzzle.org',
    impactTiers: [
      { amount: 2000, label: '$20', desc: 'One month of essential pain relief and arthritis medication for a senior dog' },
      { amount: 5000, label: '$50', desc: 'Senior bloodwork panel and comprehensive geriatric dental exam' },
      { amount: 10000, label: '$100', desc: 'Senior hospice comfort care kit and orthopedic bedding for forever-fosters' },
      { amount: 25000, label: '$250', desc: 'Full medical grant preventing a senior pet from being surrendered' },
    ],
  },
  {
    id: 'ch_redrover',
    name: 'RedRover Relief',
    catId: 'emergency',
    cat: 'Emergency vet-care grants',
    ein: '68-0124097',
    city: 'Sacramento',
    state: 'CA',
    lat: 38.5816,
    lng: -121.4944,
    rating: 'Charity Navigator 4-Star ★★★★ · Platinum Transparency',
    blurb: 'Provides urgent, life-saving financial grants for veterinary emergencies and helps families escaping domestic violence keep their beloved pets safely with them.',
    url: 'https://redrover.org',
    impactTiers: [
      { amount: 2500, label: '$25', desc: 'Emergency diagnostic supplies & antibiotics for an urgent care case' },
      { amount: 5000, label: '$50', desc: 'Emergency pet sheltering supplies for families fleeing crisis' },
      { amount: 12500, label: '$125', desc: 'Life-saving emergency veterinary grant for a critical illness' },
      { amount: 30000, label: '$300', desc: 'Full emergency surgery co-pay preventing economic euthanasia' },
    ],
  },
  {
    id: 'ch_aspca',
    name: 'ASPCA',
    catId: 'cruelty',
    cat: 'Cruelty prevention & disaster rescue',
    ein: '13-1623829',
    city: 'New York',
    state: 'NY',
    lat: 40.7831,
    lng: -73.9712,
    rating: 'Founded 1866 · Accredited 501(c)(3)',
    blurb: 'Provides rapid-deployment disaster response, field rescues from cruelty and hoarding cases, forensic investigations, and the 24/7 Animal Poison Control Center.',
    url: 'https://aspca.org',
    impactTiers: [
      { amount: 1800, label: '$18', desc: 'Emergency food & medical kit for a cruelty-case rescue' },
      { amount: 4500, label: '$45', desc: '24/7 toxicological poison rescue intervention & antidote' },
      { amount: 10000, label: '$100', desc: 'Behavioral rehabilitation & recovery for traumatized rescues' },
      { amount: 25000, label: '$250', desc: 'Disaster deployment team search-and-rescue mission support' },
    ],
  },
  {
    id: 'ch_northshore',
    name: 'North Shore Animal League America',
    catId: 'nokill',
    cat: 'Pioneer no-kill adoption',
    ein: '11-1804907',
    city: 'Port Washington',
    state: 'NY',
    lat: 40.8298,
    lng: -73.6987,
    rating: 'World’s Largest No-Kill Rescue & Adoption Organization',
    blurb: 'Rescued and placed over 1.1 million companion animals since 1944. Runs mobile rescue units saving pets from overcrowded shelters and natural disaster zones.',
    url: 'https://www.animalleague.org',
    impactTiers: [
      { amount: 2000, label: '$20', desc: 'Microchip, wellness exam & safe shelter for a newborn puppy/kitten' },
      { amount: 5000, label: '$50', desc: 'Mobile rescue transport from an endangered municipal facility' },
      { amount: 10000, label: '$100', desc: 'Foster incubator & bottle-feeding care kit for orphaned litters' },
    ],
  },
  {
    id: 'ch_petfinder',
    name: 'Petfinder Foundation',
    catId: 'community',
    cat: 'Direct grants to local grassroots shelters',
    ein: '84-1595601',
    city: 'Tucson',
    state: 'AZ',
    lat: 32.2226,
    lng: -110.9747,
    rating: 'GuideStar Platinum Transparency',
    blurb: 'Distributes 100% direct financial grants to small, volunteer-run local shelters and foster rescues across North America with no national fundraising overhead.',
    url: 'https://petfinderfoundation.com',
    impactTiers: [
      { amount: 1500, label: '$15', desc: 'Enrichment toys & calming pheromone diffusers for shelter kennels' },
      { amount: 3500, label: '$35', desc: 'Flea/tick preventatives & core vaccinations for 3 shelter animals' },
      { amount: 10000, label: '$100', desc: 'Grassroots shelter emergency food pantry grant' },
    ],
  },
  {
    id: 'ch_farmsanct',
    name: 'Farm Sanctuary',
    catId: 'sanctuary',
    cat: 'Farm animal rescue & sanctuary',
    ein: '16-1274996',
    city: 'Watkins Glen',
    state: 'NY',
    lat: 42.3809,
    lng: -76.8744,
    rating: 'Charity Navigator 4-Star ★★★★ · Platinum Transparency',
    blurb: 'Provides lifetime sanctuary, medical care, and legal protection to rescued farm animals, educating millions on compassion and welfare.',
    url: 'https://www.farmsanctuary.org',
    impactTiers: [
      { amount: 2500, label: '$25', desc: 'Fresh hay, grain, and nutritional supplements for rescued sanctuary residents' },
      { amount: 6000, label: '$60', desc: 'Specialized veterinary hoof care & pasture maintenance' },
      { amount: 15000, label: '$150', desc: 'Emergency rescue intake & lifetime sanctuary sponsorship' },
    ],
  },
];

export const charityById = (id) => CHARITIES.find(c => c.id === id) || null;
export const charityName = (id) => charityById(id)?.name || null;

/** Real-world animal rescue impact calculated from ledger cents */
export function calculateImpact(cents) {
  const c = Math.max(0, cents || 0);
  return {
    totalDollars: (c / 100).toFixed(2),
    mealsProvided: Math.max(1, Math.floor(c / 250)),            // $2.50 / meal
    veterinaryExams: Math.max(0, Math.floor(c / 3500)),        // $35 / exam & vaccines
    emergencySurgeries: Math.max(0, Math.floor(c / 15000)),    // $150 / surgery sponsorship
    seniorComfortDays: Math.max(1, Math.floor(c / 800)),       // $8.00 / day of senior hospice care
  };
}

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
  const gross = Math.max(0, Math.round(Number(grossCents) || 0));
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
async function digest(text, preferredAlg = null) {
  const subtle = globalThis.crypto?.subtle;
  if (subtle && preferredAlg !== 'fnv-1a') {
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
      if (raw) {
        this.entries = JSON.parse(raw) || [];
      } else {
        // Seed initial transactions matching starter campaigns
        const starterData = [
          { seq: 1, at: Date.now() - 86400000 * 3, kind: 'donation', label: 'Donation in memory of Ranger', gross: 10000, processor: 320, charity: 9680, ops: 0, charityId: 'ch_bestfr', campaignId: 'cmp_ranger_bf', donor: 'Sarah & Dan', demo: true },
          { seq: 2, at: Date.now() - 86400000 * 2, kind: 'donation', label: 'Donation in memory of Ranger', gross: 5000, processor: 175, charity: 4825, ops: 0, charityId: 'ch_bestfr', campaignId: 'cmp_ranger_bf', donor: 'Uncle David', demo: true },
          { seq: 3, at: Date.now() - 86400000 * 1, kind: 'donation', label: 'Donation in memory of Ranger', gross: 3500, processor: 132, charity: 3368, ops: 0, charityId: 'ch_bestfr', campaignId: 'cmp_ranger_bf', donor: 'A Denver neighbor', demo: true },
          { seq: 4, at: Date.now() - 86400000 * 6, kind: 'donation', label: 'Donation in memory of Barnaby', gross: 7500, processor: 248, charity: 7252, ops: 0, charityId: 'ch_greymuzzle', campaignId: 'cmp_barnaby_gm', donor: 'Forever Foster Friend', demo: true },
          { seq: 5, at: Date.now() - 86400000 * 5, kind: 'donation', label: 'Donation in memory of Barnaby', gross: 5000, processor: 175, charity: 4825, ops: 0, charityId: 'ch_greymuzzle', campaignId: 'cmp_barnaby_gm', donor: 'Rescue Volunteer', demo: true },
          { seq: 6, at: Date.now() - 86400000 * 9, kind: 'donation', label: 'Donation in memory of Cleo', gross: 5000, processor: 175, charity: 4825, ops: 0, charityId: 'ch_redrover', campaignId: 'cmp_cleo_rr', donor: 'Vet Tech Team', demo: true },
          { seq: 7, at: Date.now() - 86400000 * 7, kind: 'donation', label: 'Donation in memory of Cleo', gross: 10000, processor: 320, charity: 9680, ops: 0, charityId: 'ch_redrover', campaignId: 'cmp_cleo_rr', donor: 'Maya & Chris', demo: true },
        ];
        let prev = 'genesis';
        this.entries = starterData.map(e => {
          e.prev = prev;
          // Synchronous deterministic hash for starter entries
          let h1 = 0x811c9dc5, h2 = 0x01000193;
          const text = canonical(e);
          for (let i = 0; i < text.length; i++) {
            h1 = Math.imul(h1 ^ text.charCodeAt(i), 0x01000193) >>> 0;
            h2 = Math.imul(h2 + text.charCodeAt(i) * (i + 1), 0x85ebca6b) >>> 0;
          }
          const hash = (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).repeat(2);
          e.alg = 'fnv-1a';
          e.hash = hash;
          prev = hash;
          return e;
        });
        this._persist();
      }
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
    await this.load();
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

    const fs = await getFs();
    if (fs && _db) {
      await fs.setDoc(fs.doc(_db, 'ledger', 'don_' + entry.seq + '_' + entry.hash.slice(0, 8)), entry);
    }

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
      const { hash } = await digest(canonical(e), e.alg);
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
import { IS_DEMO, FIREBASE_CONFIG } from './config.js?v=7';

// ============================================================
// FIRESTORE STRUCTURE (Implemented / Mocked)
// Campaigns: /campaigns/{campaignId} -> { petName, species, years, story, charityId, goalCents, photo, owner, createdAt, donations }
// Donations: /ledger/{donationId} -> { kind, label, gross, processor, charity, ops, charityId, campaignId, donor, prev, alg, hash }
// ============================================================
let _db = null;
let _fs = null;

async function getFs() {
  if (IS_DEMO) return null;
  if (_fs) return _fs;
  try {
    const appMod = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js?v=7');
    _fs = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js?v=7');
    const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(FIREBASE_CONFIG);
    _db = _fs.getFirestore(app);
    return _fs;
  } catch (err) {
    console.error('Failed to init Firestore for Campaigns:', err);
    return null;
  }
}

export const Campaigns = {
  all: [],
  _loaded: false,

  async load() {
    if (this._loaded) return this.all;
    this._loaded = true;
    try {
      const raw = localStorage.getItem(CAMPAIGN_KEY);
      if (raw) {
        this.all = JSON.parse(raw) || [];
      } else {
        // Starter community campaigns showcasing diverse rescue missions
        this.all = [
          {
            id: 'cmp_ranger_bf',
            petName: 'Ranger',
            species: 'Golden Retriever',
            years: '2011 – 2024',
            story: 'Ranger was rescued from a high-kill shelter when he was 2. He gave us 13 years of unconditional love and lake swims. In his honor, we are helping Best Friends bring every US shelter to no-kill status.',
            charityId: 'ch_bestfr',
            goalCents: 50000,
            photo: null,
            owner: 'The Miller Family',
            createdAt: Date.now() - 86400000 * 4,
            donations: [
              { at: Date.now() - 86400000 * 3, donor: 'Sarah & Dan', message: 'For the sweetest golden boy. Run free Ranger.', gross: 10000, charity: 9680, seq: 1 },
              { at: Date.now() - 86400000 * 2, donor: 'Uncle David', message: 'Always in our hearts.', gross: 5000, charity: 4825, seq: 2 },
              { at: Date.now() - 86400000 * 1, donor: 'A Denver neighbor', message: 'Remembering Ranger playing at the dog park.', gross: 3500, charity: 3368, seq: 3 },
            ],
          },
          {
            id: 'cmp_barnaby_gm',
            petName: 'Barnaby',
            species: 'Senior Basset Hound',
            years: '2010 – 2023',
            story: 'We adopted Barnaby when he was already 9 years old with frosted whiskers and sleepy eyes. He proved that senior dogs have the biggest hearts. Dedicated to providing hospice grants for shelter elders.',
            charityId: 'ch_greymuzzle',
            goalCents: 35000,
            photo: null,
            owner: 'Elena & Marcus',
            createdAt: Date.now() - 86400000 * 8,
            donations: [
              { at: Date.now() - 86400000 * 6, donor: 'Forever Foster Friend', message: 'Senior dogs are angels on earth.', gross: 7500, charity: 7252, seq: 4 },
              { at: Date.now() - 86400000 * 5, donor: 'Rescue Volunteer', message: 'In honor of Barnaby’s sweet soul.', gross: 5000, charity: 4825, seq: 5 },
            ],
          },
          {
            id: 'cmp_cleo_rr',
            petName: 'Cleo',
            species: 'Calico Cat',
            years: '2013 – 2025',
            story: 'Cleo survived an apartment fire when she was young thanks to emergency veterinary care. We want to ensure other families in crisis never have to say goodbye because of vet bills.',
            charityId: 'ch_redrover',
            goalCents: 25000,
            photo: null,
            owner: 'Maya Lin',
            createdAt: Date.now() - 86400000 * 12,
            donations: [
              { at: Date.now() - 86400000 * 9, donor: 'Vet Tech Team', message: 'Cleo was a brave fighter.', gross: 5000, charity: 4825, seq: 6 },
              { at: Date.now() - 86400000 * 7, donor: 'Maya & Chris', message: 'Rest in peace our little purr machine.', gross: 10000, charity: 9680, seq: 7 },
            ],
          },
        ];
        this._persist();
      }
    } catch { this.all = []; }

    const fs = await getFs();
    if (fs && _db) {
      try {
        const snap = await fs.getDocs(fs.collection(_db, 'campaigns'));
        const remote = [];
        snap.forEach(doc => remote.push({ id: doc.id, ...doc.data() }));
        const merged = new Map(this.all.map(c => [c.id, c]));
        for (const r of remote) merged.set(r.id, r);
        this.all = Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt);
        this._persist();
      } catch (err) {
        console.warn('Failed to load campaigns from Firestore', err);
      }
    }

    return this.all;
  },
  _persist() {
    try { localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(this.all)); } catch {}
  },

  async get(id) { return (await this.load()).find(c => c.id === id) || null; },

  async create({ petName, species = '', years = '', story = '', charityId, goalCents = 25000, photo = null, owner = 'A friend' }) {
    await this.load();
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

    const fs = await getFs();
    if (fs && _db) {
      await fs.setDoc(fs.doc(_db, 'campaigns', c.id), c);
    }

    this.all.unshift(c);
    this._persist();
    return c;
  },

  /** Records to the ledger first; the campaign only counts what the ledger accepted. */
  async donate(campaignId, { amountCents, donor = 'Anonymous', message = '' }) {
    const c = await this.get(campaignId);
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
    
    const donObj = { at: entry.at, donor, message, gross: entry.gross, charity: entry.charity, seq: entry.seq };
    c.donations.push(donObj);
    
    const fs = await getFs();
    if (fs && _db) {
      await fs.updateDoc(fs.doc(_db, 'campaigns', c.id), {
        donations: fs.arrayUnion(donObj)
      });
    }

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
