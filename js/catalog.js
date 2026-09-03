// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — Store catalog: memberships, plot items, gifts
// Prices in USD. `stripePriceId` is filled in when you create
// products in your Stripe dashboard (see SETUP.md). In demo mode
// checkout is simulated and these IDs are ignored.
// ============================================================

export const MEMBERSHIPS = [
  {
    id: 'mem_guardian', name: 'Guardian', price: 4.99, interval: 'month',
    stripePriceId: '', tagline: 'For every loving owner',
    perks: ['Own up to 2 plots', 'Basic customization (12 items)', 'Memorial page with photos', 'Visitor guestbook'],
  },
  {
    id: 'mem_legacy', name: 'Legacy', price: 9.99, interval: 'month', featured: true,
    stripePriceId: '', tagline: 'Our most beloved tier',
    perks: ['Own up to 6 plots', 'Full customization catalog', 'Seasonal decorations & candle vigils', 'Video & audio memories', 'Priority waterfront waitlist'],
  },
  {
    id: 'mem_eternal', name: 'Eternal', price: 199, interval: 'year',
    stripePriceId: '', tagline: 'A forever promise',
    perks: ['Unlimited plots', 'Everything in Legacy', 'Custom statue commissions', 'Estate plots unlocked', 'Annual remembrance ceremony feature'],
  },
];

export const PLOT_ITEMS = [
  // Headstones & markers
  { id: 'it_headstone_classic', cat: 'Markers', name: 'Classic Granite Headstone', price: 24.99, minTier: null },
  { id: 'it_headstone_heart',   cat: 'Markers', name: 'Heart Marble Marker',      price: 34.99, minTier: null },
  { id: 'it_obelisk',           cat: 'Markers', name: 'Marble Obelisk',           price: 59.99, minTier: 'mem_legacy' },
  { id: 'it_statue_dog',        cat: 'Markers', name: 'Faithful Companion Statue',price: 89.99, minTier: 'mem_legacy' },
  { id: 'it_statue_cat',        cat: 'Markers', name: 'Sleeping Cat Statue',      price: 89.99, minTier: 'mem_legacy' },
  { id: 'it_plaque_bronze',     cat: 'Markers', name: 'Engraved Bronze Plaque',   price: 19.99, minTier: null },
  // Nature
  { id: 'it_oak',      cat: 'Nature', name: 'Memorial Oak Tree',      price: 29.99, minTier: null },
  { id: 'it_willow',   cat: 'Nature', name: 'Weeping Willow',         price: 39.99, minTier: null },
  { id: 'it_cherry',   cat: 'Nature', name: 'Cherry Blossom Tree',    price: 44.99, minTier: 'mem_legacy' },
  { id: 'it_rosebed',  cat: 'Nature', name: 'Rose Garden Bed',        price: 14.99, minTier: null },
  { id: 'it_wildflow', cat: 'Nature', name: 'Wildflower Patch',       price: 9.99, minTier: null },
  { id: 'it_cactus',   cat: 'Nature', name: 'Flowering Saguaro',      price: 24.99, minTier: null },
  // Furnishings
  { id: 'it_bench',    cat: 'Furnishings', name: 'Wrought-Iron Bench',   price: 34.99, minTier: null },
  { id: 'it_fountain', cat: 'Furnishings', name: 'Stone Fountain',       price: 79.99, minTier: 'mem_legacy' },
  { id: 'it_lantern',  cat: 'Furnishings', name: 'Eternal Flame Lantern',price: 24.99, minTier: null },
  { id: 'it_fence',    cat: 'Furnishings', name: 'Iron Plot Fence',      price: 44.99, minTier: null },
  { id: 'it_windchime',cat: 'Furnishings', name: 'Silver Wind Chimes',   price: 12.99, minTier: null },
  { id: 'it_gazebo',   cat: 'Furnishings', name: 'White Gazebo',         price: 149.99, minTier: 'mem_eternal' },
];

export const GIFTS = [
  { id: 'g_flowers',  name: 'Fresh Flowers',      price: 1.99, note: 'Lasts 7 days at the plot' },
  { id: 'g_candle',   name: 'Vigil Candle',       price: 0.99, note: 'Glows at the plot for 3 nights' },
  { id: 'g_ball',     name: 'Favorite Ball',      price: 2.99, note: 'A toy left in loving memory' },
  { id: 'g_bone',     name: 'Treat Offering',     price: 1.99, note: 'A little something for the road' },
  { id: 'g_letter',   name: 'Letter to a Friend', price: 0.99, note: 'A private note pinned to the memorial' },
  { id: 'g_balloon',  name: 'Remembrance Balloon',price: 2.99, note: 'Released over the valley at sunset' },
  { id: 'g_wreath',   name: 'Seasonal Wreath',    price: 4.99, note: 'Lasts 30 days' },
  { id: 'g_donation', name: 'Shelter Donation',   price: 5.00, note: '100% donated to animal shelters in their name' },
];

// ---------- Plot customization: placement & 3D mapping ----------
// Where an item sits on the plot (local coords: +z faces the road)
export const SLOTS = [
  { id: 'base',  label: 'At the base of the memorial', dx: 0,    dz: 5 },
  { id: 'left',  label: 'Left side',                   dx: -5.5, dz: -1 },
  { id: 'right', label: 'Right side',                  dx: 5.5,  dz: -1 },
  { id: 'tree',  label: 'Back corner (under the tree)',dx: -5,   dz: -6 },
];

// `art` is the thumbnail id rendered by thumbs.js — the real object,
// shaded with the material it will have once it is on the plot.
export const HEADSTONE_STYLES = [
  { id: 'classic', label: 'Classic Granite',  art: 'hs_classic' },
  { id: 'heart',   label: 'Heart Marble',     art: 'hs_heart' },
  { id: 'obelisk', label: 'Marble Obelisk',   art: 'hs_obelisk' },
  { id: 'slab',    label: 'Bronze Slab',      art: 'hs_slab' },
  { id: 'statue',  label: 'Companion Statue', art: 'hs_statue' },
];

// Catalog item → how it renders in the 3D sanctuary
export const ITEM_DECOR = {
  it_headstone_classic: { type: 'headstone', style: 'classic' },
  it_headstone_heart:   { type: 'headstone', style: 'heart' },
  it_obelisk:           { type: 'headstone', style: 'obelisk' },
  it_statue_dog:        { type: 'headstone', style: 'statue' },
  it_statue_cat:        { type: 'headstone', style: 'statue' },
  it_plaque_bronze:     { type: 'headstone', style: 'slab' },
  it_oak:      { type: 'tree', color: 0x5e8f4e },
  it_willow:   { type: 'tree', color: 0x7da86a },
  it_cherry:   { type: 'tree', color: 0xf2b8cf },
  it_rosebed:  { type: 'flowers', color: 0xd64a5f },
  it_wildflow: { type: 'flowers', color: 0xf3d84a },
  it_cactus:   { type: 'cactus' },
  it_bench:    { type: 'bench' },
  it_fountain: { type: 'fountain' },
  it_lantern:  { type: 'lantern' },
  it_fence:    null,      // shown on the memorial page (not yet rendered in 3D)
  it_windchime: null,
  it_gazebo:   null,
};

// Gift → small object laid at the base of the memorial
export const GIFT_DECOR = {
  g_flowers: { type: 'flowers', color: 0xd66a8a },
  g_candle:  { type: 'candle' },
  g_ball:    { type: 'ball', color: 0xc8e84a },
  g_bone:    { type: 'bone' },
  g_wreath:  { type: 'wreath' },
  g_letter:  null, g_balloon: null, g_donation: null, // guestbook/feed only
};

// ---------- Charitable giving ----------
// Re-exported, not redefined. Who the money can go to and how it is
// split are decided in one place — js/charity.js — because the moment
// there are two lists, the interface starts promising one thing while
// the ledger records another. These aliases exist only so the many
// existing `from './catalog.js?v=6'` imports keep working.
export { CHARITIES, charityName, GIFT_CHARITY_SHARE } from './charity.js?v=6';

// Real-world placement: a memorial anywhere on Earth
export const EARTH_PLOT = {
  id: 'earth_home', name: 'Anywhere on Earth memorial', price: 149,
  blurb: 'Their favorite spot, forever marked — your backyard, their beach, the trail you walked every morning. Visible to the whole community, guestbook included.',
};

// Physical Heirloom Keepsakes & Artifact Memories
export const PHYSICAL_KEEPSAKES = [
  {
    id: 'pk_print_framed',
    name: 'Fine Art Framed Print',
    category: 'Prints',
    price: 38.00,
    blurb: 'Archival 8x10” lustre print with solid timber frame and museum-grade anti-reflective glass.',
    icon: 'photo',
    options: ['Gold Gilded Frame', 'Warm Walnut Frame', 'Obsidian Black Frame'],
  },
  {
    id: 'pk_crystal_block',
    name: 'Illuminated Crystal Glass Block',
    category: 'Prints',
    price: 48.00,
    blurb: 'Ultra-clear 1-inch solid acrylic crystal block that catches sunlight on your mantel.',
    icon: 'sparkle',
    options: ['5x7” Crystal Block', '6x8” Crystal Block'],
  },
  {
    id: 'pk_hardcover_book',
    name: 'Rainbow Bridge Memorial Keepsake Book',
    category: 'Books',
    price: 54.00,
    blurb: '24-page linen hardcover book featuring your pet’s photos, life stories, and the Rainbow Bridge poem.',
    icon: 'book',
    options: ['Celestial Gold Foil Linen', 'Midnight Sage Linen', 'Rose Dust Linen'],
  },
  {
    id: 'pk_ceramic_mug',
    name: 'Morning Comfort Ceramic Mug',
    category: 'Mugs',
    price: 22.00,
    blurb: '15oz warm ceramic mug with companion portrait and “Always in My Heart” gold foil script.',
    icon: 'cup',
    options: ['15oz Matte Bone White', '15oz Warm Twilight Green'],
  },
  {
    id: 'pk_custom_plush',
    name: 'Custom Lookalike Memory Plush',
    category: 'Plush',
    price: 78.00,
    blurb: 'Handcrafted ultra-soft cuddle plush styled after your companion with engraved heart collar tag.',
    icon: 'paw',
    options: ['Small (10-inch)', 'Medium (14-inch)'],
  },
  {
    id: 'pk_suncatcher',
    name: 'Rainbow Bridge Crystal Suncatcher',
    category: 'Decor',
    price: 28.00,
    blurb: 'K9 optical crystal prism with engraved companion silhouette that casts dancing rainbows across your room.',
    icon: 'rainbow',
    options: ['Prism Teardrop', 'Celestial Heart Prism'],
  },
  {
    id: 'pk_sticker_pack',
    name: 'Holographic Memorial Sticker Pack',
    category: 'Stickers',
    price: 14.00,
    blurb: 'Pack of 6 waterproof UV-resistant vinyl & holographic stickers for laptops, journals, and cars.',
    icon: 'star',
    options: ['6-Pack Holographic & Matte'],
  },
];

export function fmtPrice(n) {
  return n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
}
