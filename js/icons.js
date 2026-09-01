// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — Icon system
//
// Replaces every emoji in the interface. Three kinds of art live
// behind one call site:
//
//   · UI_ICONS   — stroke icons on a 24-grid for actions and nav
//   · SPECIES    — filled animal profiles, for whose memorial it is
//   · the rainbow mark — the brand, drawn as a real spectral arc
//
// Physical objects a visitor can buy or place (headstones, candles,
// benches, wreaths) are deliberately NOT here: those are rendered in
// 3D by thumbs.js with the same materials they will have once they
// are standing on the plot, so the shop art is the actual object.
//
// `icon()` returns markup, so it drops straight into the innerHTML
// templates the rest of the UI is built from.
// ============================================================

// ---------------------------------------------------------------
// Stroke icons — 24×24, 1.6 stroke, round caps. Sized by font-size
// via `1em` so they inherit their context.
// ---------------------------------------------------------------
const UI_ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/>',

  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',

  globe: '<circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2"/><path d="M12 3.4c2.4 2.4 3.6 5.4 3.6 8.6S14.4 18.2 12 20.6c-2.4-2.4-3.6-5.4-3.6-8.6S9.6 5.8 12 3.4Z"/>',

  share: '<circle cx="17.5" cy="6" r="2.6"/><circle cx="6.5" cy="12" r="2.6"/><circle cx="17.5" cy="18" r="2.6"/><path d="m8.9 10.7 6.2-3.4M8.9 13.3l6.2 3.4"/>',

  close: '<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>',

  edit: '<path d="M4 20h4.2L19 9.2a2.1 2.1 0 0 0 0-3l-1.2-1.2a2.1 2.1 0 0 0-3 0L4 15.8Z"/><path d="m13.8 5.9 4.3 4.3"/>',

  eye: '<path d="M2.4 12S6.2 5.6 12 5.6 21.6 12 21.6 12 17.8 18.4 12 18.4 2.4 12 2.4 12Z"/><circle cx="12" cy="12" r="3.1"/>',

  walk: '<circle cx="13.2" cy="4.3" r="1.9"/><path d="m10 21 2.4-5.4-2-2.2.9-4.6 3 1.5 1.2 3.1 2.7 1.1"/><path d="m8.3 12.4 2.6-4.2 3.4-.9"/><path d="m14.4 15.6.9 5.4"/>',

  key: '<circle cx="8" cy="14.5" r="4.2"/><path d="m11.1 11.5 8-8"/><path d="m16.4 6.2 2.1 2.1M18.6 4l2.2 2.2"/>',

  shield: '<path d="M12 3.2 4.8 6.1v5.3c0 4.3 3 8.1 7.2 9.4 4.2-1.3 7.2-5.1 7.2-9.4V6.1Z"/><path d="m8.9 12 2.2 2.2 4-4.4"/>',

  lock: '<rect x="4.8" y="10.4" width="14.4" height="9.8" rx="2.2"/><path d="M8.3 10.4V7.9a3.7 3.7 0 0 1 7.4 0v2.5"/>',

  warning: '<path d="M12 3.6 21 19.4H3Z"/><path d="M12 9.6v4.2M12 16.7v.1"/>',

  mail: '<rect x="2.8" y="5.2" width="18.4" height="13.6" rx="2.4"/><path d="m3.4 7 8.6 6 8.6-6"/>',

  letter: '<rect x="3.4" y="4.4" width="17.2" height="15.2" rx="2.2"/><path d="M7 9h10M7 12.6h10M7 16.2h5.6"/>',

  chat: '<path d="M20.4 12.4c0 4-3.8 7.2-8.4 7.2a9.9 9.9 0 0 1-2.9-.4L4.2 21l1.4-3.7a6.8 6.8 0 0 1-2-4.9c0-4 3.8-7.2 8.4-7.2s8.4 3.2 8.4 7.2Z"/>',

  // A headstone, for plots and memorials
  grave: '<path d="M6.6 20.4V9.6a5.4 5.4 0 0 1 10.8 0v10.8Z"/><path d="M4.4 20.4h15.2"/><path d="M12 9.4v5.6M9.6 11.6h4.8"/>',

  gift: '<rect x="3.4" y="9.4" width="17.2" height="10.8" rx="1.8"/><path d="M2.6 9.4h18.8M12 9.4v10.8"/><path d="M12 9.4S10.6 4 8.2 4a2.2 2.2 0 0 0 0 5.4Zm0 0S13.4 4 15.8 4a2.2 2.2 0 0 1 0 5.4Z"/>',

  candle: '<path d="M9.4 20.6h5.2V10.2H9.4Z"/><path d="M8.2 20.6h7.6"/><path d="M12 10.2V8.4"/><path d="M12 3.2c1.6 1.7 2.4 2.9 2.4 4a2.4 2.4 0 0 1-4.8 0c0-1.1.8-2.3 2.4-4Z"/>',

  book: '<path d="M4 4.6h5.6A2.4 2.4 0 0 1 12 7v13a2 2 0 0 0-2-2H4Z"/><path d="M20 4.6h-5.6A2.4 2.4 0 0 0 12 7v13a2 2 0 0 1 2-2h6Z"/>',

  camera: '<rect x="2.8" y="7" width="18.4" height="13" rx="2.6"/><circle cx="12" cy="13.5" r="3.8"/><path d="M8.6 7 10 4.2h4L15.4 7"/>',

  person: '<circle cx="12" cy="8" r="3.8"/><path d="M4.8 20.4a7.2 7.2 0 0 1 14.4 0"/>',

  handshake: '<path d="m11 7.4-2.6 2.6a1.9 1.9 0 0 0 2.7 2.7l1.3-1.3 3.3 3.3a1.9 1.9 0 0 1-2.7 2.7"/><path d="m13.1 17.4-.9-.9M10.4 18.1l-.9-.9"/><path d="M2.6 9.6 6.4 6h4l2.8 2.6L17 6h4.4l-3.2 3.6"/>',

  coins: '<ellipse cx="12" cy="6.6" rx="7.4" ry="3"/><path d="M4.6 6.6v4.2c0 1.7 3.3 3 7.4 3s7.4-1.3 7.4-3V6.6"/><path d="M4.6 10.8V15c0 1.7 3.3 3 7.4 3s7.4-1.3 7.4-3v-4.2"/>',

  phone: '<rect x="6.4" y="2.6" width="11.2" height="18.8" rx="2.6"/><path d="M10.6 5.4h2.8M12 18.2v.1"/>',

  scroll: '<path d="M6.6 4.4h11a2.4 2.4 0 0 1 2.4 2.4v12.8H9.4"/><path d="M6.6 4.4A2.4 2.4 0 0 0 4.2 6.8v1.8h4.4"/><path d="M9.4 19.6a2.4 2.4 0 0 1-4.8 0V8.6"/><path d="M11.4 8.6h5.4M11.4 12h5.4M11.4 15.4h3.4"/>',

  gate: '<path d="M3.4 20.6h17.2"/><path d="M5.6 20.6V9.4M18.4 20.6V9.4"/><path d="M5.6 9.4h12.8"/><path d="M8.4 20.6v-7a3.6 3.6 0 0 1 7.2 0v7"/><path d="M12 20.6v-7"/><path d="M4.4 6.4h15.2M12 6.4V3.6"/>',

  satellite: '<circle cx="12" cy="12" r="2.6"/><path d="M12 3.4v3.4M12 17.2v3.4M3.4 12h3.4M17.2 12h3.4"/><path d="m6 6 2.4 2.4M15.6 15.6 18 18M18 6l-2.4 2.4M8.4 15.6 6 18"/>',

  tower: '<path d="M9 20.6 12 3.4l3 17.2Z"/><path d="M6.6 20.6h10.8"/><path d="M10.2 13.4h3.6"/>',

  museum: '<path d="M3.4 9.4 12 4l8.6 5.4Z"/><path d="M5.6 9.4v8.4M9.4 9.4v8.4M14.6 9.4v8.4M18.4 9.4v8.4"/><path d="M3.4 17.8h17.2M2.6 20.6h18.8"/>',

  dove: '<path d="M20.6 6.4c-1.6-.5-3 .1-4 1.2l-2.4 2.6-4.4-1.8a4.6 4.6 0 0 0-5 1.3L3.4 11.4l4.4 1 1 4.4 1.7-1.4a4.6 4.6 0 0 0 1.3-5l-.4-1"/><path d="M14.2 10.2 12 20.6"/>',

  heart: '<path d="M12 20.4S3.6 15.2 3.6 9.6a4.6 4.6 0 0 1 8.4-2.6 4.6 4.6 0 0 1 8.4 2.6c0 5.6-8.4 10.8-8.4 10.8Z"/>',

  sparkle: '<path d="M12 3.2 13.6 9 19.4 10.6 13.6 12.2 12 18 10.4 12.2 4.6 10.6 10.4 9Z"/><path d="M18.4 15.6 19.2 18l2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8Z"/>',

  // The site's own crest — a bridge arch over still water
  crest: '<path d="M3.4 17.4h17.2"/><path d="M4.6 17.4a7.4 7.4 0 0 1 14.8 0"/><path d="M12 10v7.4M7.8 12.6v4.8M16.2 12.6v4.8"/><path d="M3.4 20.6h17.2"/>',

  paw: '<ellipse cx="12" cy="16.4" rx="4.3" ry="3.6"/><ellipse cx="6.6" cy="10.6" rx="2.1" ry="2.7"/><ellipse cx="10.4" cy="7.4" rx="2.1" ry="2.8"/><ellipse cx="14.6" cy="7.4" rx="2.1" ry="2.8"/><ellipse cx="17.4" cy="10.9" rx="2" ry="2.6"/>',

  flower: '<circle cx="12" cy="12" r="2.6"/><path d="M12 9.4c0-2.6-1-4.4-2.6-4.4S6.6 6.4 6.6 8.6 8.4 12 12 12"/><path d="M12 9.4c0-2.6 1-4.4 2.6-4.4s2.8 1.4 2.8 3.6-1.8 3.4-5.4 3.4"/><path d="M12 14.6c0 2.6 1 4.4 2.6 4.4s2.8-1.4 2.8-3.6-1.8-3.4-5.4-3.4"/><path d="M12 14.6c0 2.6-1 4.4-2.6 4.4S6.6 17.6 6.6 15.4 8.4 12 12 12"/>',

  leaf: '<path d="M4.6 19.4C3 14.2 5.2 8.4 10 5.8c2.8-1.5 6.4-1.9 9.4-1.2.7 3-.3 6.6-2.2 9.3-3.2 4.5-8.6 6.4-12.6 5.5Z"/><path d="M4.6 19.4 13.8 10"/>',

  cake: '<path d="M4.4 20.6h15.2v-6a2.4 2.4 0 0 0-2.4-2.4H6.8a2.4 2.4 0 0 0-2.4 2.4Z"/><path d="M4.4 17h15.2"/><path d="M8.4 12.2V9.6M12 12.2V9.6M15.6 12.2V9.6"/><path d="M8.4 7.2c0-1 1.2-1.6 1.2-2.8 0-.7-.5-1.2-1.2-1.6-.7.4-1.2.9-1.2 1.6 0 1.2 1.2 1.8 1.2 2.8ZM15.6 7.2c0-1 1.2-1.6 1.2-2.8 0-.7-.5-1.2-1.2-1.6-.7.4-1.2.9-1.2 1.6 0 1.2 1.2 1.8 1.2 2.8Z"/>',

  toy: '<circle cx="12" cy="9" r="5"/><path d="M8.2 5.4 6 3.2M15.8 5.4 18 3.2"/><circle cx="9.8" cy="8.4" r=".9" fill="currentColor"/><circle cx="14.2" cy="8.4" r=".9" fill="currentColor"/><path d="M6.6 20.8v-3.2a5.4 5.4 0 0 1 10.8 0v3.2Z"/>',

  disc: '<ellipse cx="12" cy="12.6" rx="9" ry="4.4"/><path d="M3 12.6v-.6c0-2.4 4-4.4 9-4.4s9 2 9 4.4v.6"/><ellipse cx="12" cy="11.6" rx="4.6" ry="2.1"/>',

  bone: '<path d="M8.4 11.6a2.7 2.7 0 1 0-2.5-3.9 2.7 2.7 0 1 0 1.2 5"/><path d="M15.6 12.4a2.7 2.7 0 1 0 2.5 3.9 2.7 2.7 0 1 0-1.2-5"/><path d="m8.6 11.4 6.8 1.2"/><path d="m7.4 12.6 6.8 1.2"/>',

  plane: '<path d="M21 4.4 3.6 10.2c-.8.3-.8 1.4 0 1.7l6.5 2.3 2.3 6.5c.3.8 1.4.8 1.7 0Z"/><path d="m10.1 14.2 5.6-5.6"/>',

  // Platform marks. Deliberately simplified rather than exact
  // trademarks — they only need to be legible at 14px in a chip.
  instagram: '<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="4.8"/><circle cx="12" cy="12" r="4.1"/><circle cx="17" cy="7" r="1.1" fill="currentColor" stroke="none"/>',
  x: '<path d="M4 4h3.9l4.5 6 5.2-6H21l-6.9 7.9L21.4 20h-3.9l-4.8-6.4L7.1 20H4.3l7.3-8.4Z" fill="currentColor" stroke="none"/>',
  tiktok: '<path d="M14.2 3.2v10.9a3.3 3.3 0 1 1-3.3-3.3c.3 0 .6 0 .9.1"/><path d="M14.2 3.2c.4 2.4 2.2 4.2 4.6 4.5"/>',
  facebook: '<path d="M13.4 21v-7.9h2.7l.5-3.2h-3.2V7.8c0-.9.4-1.7 1.8-1.7h1.5V3.3A17 17 0 0 0 14.4 3c-2.4 0-4 1.5-4 4.3v2.6H7.5v3.2h2.9V21"/>',
  whatsapp: '<path d="M3.4 20.6 4.9 16A8.3 8.3 0 1 1 8 19.1Z"/><path d="M9 8.6c.4 0 .6.2.8.6l.6 1.4c.1.3 0 .5-.1.7l-.5.6c-.1.2-.2.4 0 .7a6 6 0 0 0 2.6 2.3c.3.1.5 0 .7-.1l.6-.6c.2-.2.4-.2.7-.1l1.4.7c.3.1.4.4.4.7 0 .8-.6 1.5-1.4 1.6-.5 0-1 0-3.2-1.1a9 9 0 0 1-3.6-3.7c-.9-1.8-.9-2.4-.8-2.9.1-.7.8-1.3 1.5-1.3Z"/>',
  google: '<path d="M20.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.7h4.9a4.2 4.2 0 0 1-1.8 2.7v2.3h2.9a8.8 8.8 0 0 0 2.6-6.8Z"/><path d="M12 21c2.4 0 4.5-.8 6-2.2l-2.9-2.3a5.5 5.5 0 0 1-8.2-2.9H3.9v2.4A9 9 0 0 0 12 21Z"/><path d="M6.9 13.6a5.4 5.4 0 0 1 0-3.4V7.8H3.9a9 9 0 0 0 0 8.1Z"/><path d="M12 6.6c1.3 0 2.5.5 3.5 1.4l2.6-2.6A9 9 0 0 0 3.9 7.8l3 2.4A5.4 5.4 0 0 1 12 6.6Z"/>',

  check: '<path d="m5 12.6 4.6 4.6L19 7.8"/>',
  plus: '<path d="M12 5.2v13.6M5.2 12h13.6"/>',
  arrowRight: '<path d="M4.6 12h14.2M13 6.2 18.8 12 13 17.8"/>',
  home: '<path d="M3.8 10.6 12 3.8l8.2 6.8v9a1.4 1.4 0 0 1-1.4 1.4H5.2a1.4 1.4 0 0 1-1.4-1.4Z"/><path d="M9.6 21v-6.4h4.8V21"/>',
  power: '<path d="M12 3.6v8"/><path d="M6.9 6.9a7.2 7.2 0 1 0 10.2 0"/>',
  calendar: '<rect x="3.6" y="5.4" width="16.8" height="15" rx="2.2"/><path d="M3.6 10h16.8M8.4 3.4v4M15.6 3.4v4"/>',
  music: '<path d="M9 18.4V5.6l10-1.8v12.6"/><ellipse cx="6.6" cy="18.4" rx="2.4" ry="2"/><ellipse cx="16.6" cy="16.4" rx="2.4" ry="2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  rainbow: '<path d="M3.4 19.4a8.6 8.6 0 0 1 17.2 0"/><path d="M6.2 19.4a5.8 5.8 0 0 1 11.6 0"/><path d="M9 19.4a3 3 0 0 1 6 0"/>',
  photo: '<rect x="3.4" y="4.4" width="17.2" height="15.2" rx="2.4"/><circle cx="8.5" cy="9.5" r="2"/><path d="m20.6 15.6-4.6-4.6a2.1 2.1 0 0 0-3 0l-7.6 7.6"/>',
  tree: '<path d="M12 21v-4.5M12 3l-6 7.5h4.2L5.4 16.5h13.2l-4.8-6h4.2Z"/>',
};

// ---------------------------------------------------------------
// Species — filled silhouettes, 64×64, all in SIDE PROFILE facing
// right, standing on a common ground line at y≈57.
//
// Profile is the whole trick: an animal drawn face-on is an
// unreadable blob at 20px, while its profile stays recognisable —
// which is why every pet-shop sign in the world is drawn this way.
//
// Each is composed from overlapping primitives rather than one
// heroic bezier. Same fill, so the union silhouettes cleanly, and
// any single part can be nudged without redrawing the animal.
// ---------------------------------------------------------------
const SPECIES = {
  // sitting dog: haunch, chest, foreleg, head, muzzle, drop ear, tail
  dog: `
    <ellipse cx="24" cy="41" rx="14.5" ry="15"/>
    <path d="M31 30h11v25a2.5 2.5 0 0 1-2.5 2.5h-6A2.5 2.5 0 0 1 31 55Z"/>
    <ellipse cx="38" cy="33" rx="10" ry="13"/>
    <circle cx="44.5" cy="19" r="9"/>
    <path d="M50 15.5c5.5-.6 10 .8 11.5 3.2.8 1.3.3 2.9-1.1 3.4l-9.2 3.2Z"/>
    <path d="M38.5 11c-3.6.6-5.5 3.4-5.2 7.4l.7 8.4c.1 1.9 2.6 2.5 3.6.9l4.8-8Z"/>
    <path d="M11 39c-4.5-1.8-7.2-5.6-7.6-10.4-.1-1.6 1.9-2.4 2.9-1.1l7.6 9.6Z"/>
    <ellipse cx="26" cy="54.5" rx="16" ry="3.4"/>`,

  // sitting cat: teardrop body, small round head, twin ears, hooked tail
  cat: `
    <path d="M30 57c-8.8 0-15-6-15-14.5 0-9 5-16 12.5-18.5l14 2.5c2.5 3.6 3.5 8 3.5 12.5 0 9.5-6 18-15 18Z"/>
    <circle cx="42.5" cy="21" r="9.5"/>
    <path d="M34 14.5 33.6 5.6c0-.9 1-1.4 1.7-.9l7.2 5.6Z"/>
    <path d="M51 14.5 55.8 6c.5-.8 1.6-.6 1.8.3l1.6 8.9Z"/>
    <path d="M44 33h7.5v21.5a2.5 2.5 0 0 1-2.5 2.5h-2.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
    <path d="M15.5 50c-6 0-9.5-3.6-9.5-9 0-3.6 1.6-6.6 4.4-8.4 1.2-.8 2.6.5 2 1.8-.8 1.8-1.2 3.6-1.2 5.4 0 3.2 1.8 5.2 4.8 5.6Z"/>
    <ellipse cx="30" cy="55" rx="16" ry="3"/>`,

  // perched bird: body, wing, head, beak, long tail, legs
  bird: `
    <ellipse cx="30" cy="30" rx="15" ry="12" transform="rotate(-14 30 30)"/>
    <ellipse cx="28" cy="29" rx="10" ry="6.5" transform="rotate(-22 28 29)" opacity="0.999"/>
    <circle cx="44" cy="18" r="8"/>
    <path d="M51.5 15.5 61 18.6c.8.3.8 1.4 0 1.7l-9.5 3.2Z"/>
    <path d="M17 36 4.5 50.5c-.8.9.1 2.3 1.2 1.9L22 46.5Z"/>
    <path d="M31 41.5h3v9h-3zM38 41h3v9.5h-3z"/>
    <rect x="24" y="50" width="24" height="3.4" rx="1.7"/>`,

  // standing horse: barrel, neck, head, four legs, mane, tail
  horse: `
    <ellipse cx="26" cy="29" rx="18" ry="11.5"/>
    <path d="M36 33 41 15c.7-2.4 3-3.8 5.4-3.2l3 .8-4 22.4Z"/>
    <path d="M46 7.5c4.2-.6 7 1.4 8 5l1 3.6c.4 1.6-.6 3.2-2.2 3.5l-8.6 1.6Z"/>
    <path d="M45.5 6.4 44 .9c-.2-.8.7-1.4 1.3-.9l4.4 3.6ZM52 6.6l3.8-4c.6-.6 1.6-.1 1.5.7l-.8 5.2Z"/>
    <path d="M14 34h5v22h-5zM23 36h5v20h-5zM31 36h5v20h-5zM39 34h5v22h-5z"/>
    <path d="M9 22c-4.5 2.5-7 7-7.5 13.4-.1 1.5 1.8 2.2 2.7 1l7.8-10.4Z"/>`,

  // sitting rabbit: round body, head, two long ears, puff tail
  rabbit: `
    <ellipse cx="27" cy="41" rx="15" ry="16"/>
    <circle cx="41" cy="29" r="10.5"/>
    <path d="M50.5 22.5 55 25.8c1 .7.8 2.2-.3 2.6l-6.2 2.2Z"/>
    <ellipse cx="38" cy="12" rx="4.4" ry="11.5" transform="rotate(-10 38 12)"/>
    <ellipse cx="47.5" cy="13.5" rx="4.2" ry="11" transform="rotate(9 47.5 13.5)"/>
    <circle cx="12" cy="37" r="6"/>
    <path d="M35 46h9v9.5a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2Z"/>
    <ellipse cx="28" cy="55.5" rx="16" ry="3"/>`,

  // turtle: domed shell, plastron, head, front and rear flippers
  turtle: `
    <path d="M8 40c0-11.6 9.4-19 24-19s24 7.4 24 19Z"/>
    <rect x="7" y="39.5" width="50" height="6" rx="3"/>
    <ellipse cx="58" cy="35" rx="7.5" ry="6"/>
    <path d="M62.5 31.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" fill="#000" opacity="0.001"/>
    <path d="M14 45.5h9l-2.5 7.5c-.4 1.2-1.6 1.9-2.8 1.6l-2.4-.6c-1.5-.4-2.3-2-1.7-3.4Z"/>
    <path d="M41 45.5h9l3.4 5.1c.9 1.4.1 3.2-1.5 3.6l-2.4.6c-1.2.3-2.4-.4-2.8-1.6Z"/>`,

  // fish: body, tail fin, dorsal and pelvic fins, eye
  fish: `
    <path d="M6 32c6.5-10 16.5-16 27-16s19 6 21.5 16C52 42 44 48 33 48S12.5 42 6 32Z"/>
    <path d="M54.5 26 62.5 18c.9-.9 2.4-.2 2.2 1l-2.2 13c-.2 1.2-1.8 1.6-2.5.6Z" transform="translate(-6 6)"/>
    <path d="M28 16.5c1.5-6 4-9.6 7.6-11 1.1-.5 2.2.6 1.8 1.7l-3.4 9.8Z"/>
    <path d="M24 46.5c1 4.8 3 7.8 6 9 1.1.5 2.2-.6 1.8-1.7L29 46Z"/>
    <circle cx="16.5" cy="28" r="2.6" fill="#000" opacity="0.28"/>`,

  // hamster / small pet: rounded body, head, ear, tiny feet
  hamster: `
    <ellipse cx="27" cy="37" rx="21" ry="16"/>
    <ellipse cx="45" cy="33" rx="12" ry="11"/>
    <circle cx="45" cy="21" r="5.5"/>
    <path d="M55.5 30.5 60 32.4c1 .4 1 1.8 0 2.2l-4.5 1.9Z"/>
    <ellipse cx="18" cy="52" rx="6" ry="3.4"/>
    <ellipse cx="36" cy="52" rx="6" ry="3.4"/>
    <path d="M6.5 39c-3.4.6-5.5 2.6-6.2 6-.2 1.1 1.1 1.8 1.9 1l5.4-5Z"/>`,

  // any other companion: a paw print, on the same grid
  other: `
    <ellipse cx="32" cy="43" rx="11.5" ry="9.6"/>
    <ellipse cx="17.6" cy="28.2" rx="5.6" ry="7.2"/>
    <ellipse cx="27.7" cy="19.7" rx="5.6" ry="7.4"/>
    <ellipse cx="38.9" cy="19.7" rx="5.6" ry="7.4"/>
    <ellipse cx="46.4" cy="29" rx="5.3" ry="6.9"/>`,
};

/** Human labels, so the UI never has to hard-code them. */
export const SPECIES_LABELS = {
  dog: 'Dog', cat: 'Cat', bird: 'Bird', horse: 'Horse',
  rabbit: 'Rabbit', turtle: 'Turtle', fish: 'Fish',
  hamster: 'Small pet', other: 'Companion',
};

export const SPECIES_KEYS = Object.keys(SPECIES);

/** Map free-text species onto an icon key. */
export function speciesKey(text = '') {
  const s = String(text).toLowerCase();
  if (/dog|puppy|pup|canine|retriever|terrier|shepherd|poodle|hound|collie|beagle|boxer|husky/.test(s)) return 'dog';
  if (/cat|kitten|feline|tabby|siamese/.test(s)) return 'cat';
  if (/bird|parrot|budgie|cockatiel|finch|canary|parakeet|macaw/.test(s)) return 'bird';
  if (/horse|pony|mare|stallion|foal/.test(s)) return 'horse';
  if (/rabbit|bunny|hare|lop/.test(s)) return 'rabbit';
  if (/turtle|tortoise|terrapin/.test(s)) return 'turtle';
  if (/fish|goldfish|koi|betta/.test(s)) return 'fish';
  if (/hamster|guinea|gerbil|rat|mouse|ferret|chinchilla/.test(s)) return 'hamster';
  return 'other';
}

// ---------------------------------------------------------------
// Public builders
// ---------------------------------------------------------------

/**
 * A stroke UI icon.
 * @param {keyof UI_ICONS} name
 * @param {{size?:string|number, cls?:string, title?:string, stroke?:number}} opts
 */
export function icon(name, opts = {}) {
  const body = UI_ICONS[name];
  if (!body) {
    console.log(`[icons] unknown icon "${name}"`);
    return '';
  }
  const { size = '1em', cls = '', title = '', stroke = 1.6 } = opts;
  const s = typeof size === 'number' ? `${size}px` : size;
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none"
    stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="${title ? 'false' : 'true'}" ${title ? `role="img"` : ''}
    focusable="false">${title ? `<title>${title}</title>` : ''}${body}</svg>`;
}

/**
 * A filled species profile.
 * @param {keyof SPECIES} key
 */
export function speciesIcon(key, opts = {}) {
  const shapes = SPECIES[key] || SPECIES.other;
  const { size = '1em', cls = '', title = '' } = opts;
  const s = typeof size === 'number' ? `${size}px` : size;
  return `<svg class="ico ico-species ${cls}" viewBox="0 0 64 64" width="${s}" height="${s}"
    fill="currentColor" aria-hidden="${title ? 'false' : 'true'}" ${title ? `role="img"` : ''}
    focusable="false">${title ? `<title>${title}</title>` : ''}${shapes}</svg>`;
}

/**
 * The brand mark: a real spectral arc with soft optical falloff and a
 * faint secondary bow, the way a rainbow actually appears. Each band
 * is a stroked arc with a blur, so the colours bleed into one another
 * instead of banding like a flag.
 *
 * @param {{size?:number, cls?:string, secondary?:boolean, id?:string}} opts
 */
export function rainbowMark(opts = {}) {
  const { size = 64, cls = '', secondary = true, id = 'rb' + Math.random().toString(36).slice(2, 8) } = opts;
  // Not seven stripes. A real bow is one continuous spectrum with soft
  // edges, a dimmer colour-reversed secondary outside it, and darker
  // sky between the two (Alexander's band). Each bow is a single arc
  // stroked with a radial gradient centred on that bow's own centre,
  // so colour ramps across the stroke instead of banding.
  const CX = 50, CY = 54;
  return `<svg class="rainbow-mark ${cls}" viewBox="0 0 100 58" width="${size}" height="${size * 0.58}"
    aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="${id}p" gradientUnits="userSpaceOnUse" cx="${CX}" cy="${CY}" r="46">
        <stop offset="0.58" stop-color="#7a4bd0" stop-opacity="0"/>
        <stop offset="0.645" stop-color="#7a4bd0" stop-opacity="0.60"/>
        <stop offset="0.700" stop-color="#4661d8" stop-opacity="0.85"/>
        <stop offset="0.752" stop-color="#3fa9e0" stop-opacity="0.92"/>
        <stop offset="0.804" stop-color="#5ec96a" stop-opacity="0.96"/>
        <stop offset="0.856" stop-color="#e8d84a" stop-opacity="0.98"/>
        <stop offset="0.904" stop-color="#ef9138" stop-opacity="0.94"/>
        <stop offset="0.947" stop-color="#e0503c" stop-opacity="0.74"/>
        <stop offset="1.00" stop-color="#e0503c" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="${id}s" gradientUnits="userSpaceOnUse" cx="${CX}" cy="${CY}" r="58">
        <stop offset="0.74" stop-color="#e0503c" stop-opacity="0"/>
        <stop offset="0.808" stop-color="#e0503c" stop-opacity="0.22"/>
        <stop offset="0.858" stop-color="#e8c04a" stop-opacity="0.24"/>
        <stop offset="0.908" stop-color="#5ec96a" stop-opacity="0.21"/>
        <stop offset="0.950" stop-color="#4661d8" stop-opacity="0.18"/>
        <stop offset="1.00" stop-color="#7a4bd0" stop-opacity="0"/>
      </radialGradient>
      <filter id="${id}a" x="-30%" y="-30%" width="160%" height="170%">
        <feGaussianBlur stdDeviation="0.9"/>
      </filter>
      <filter id="${id}b" x="-30%" y="-30%" width="160%" height="170%">
        <feGaussianBlur stdDeviation="1.8"/>
      </filter>
    </defs>
    ${secondary ? `<path d="M 3 ${CY} A 47 47 0 0 1 97 ${CY}" fill="none"
      stroke="url(#${id}s)" stroke-width="12" stroke-linecap="round" filter="url(#${id}b)"/>` : ''}
    <path d="M 16 ${CY} A 34 34 0 0 1 84 ${CY}" fill="none"
      stroke="url(#${id}p)" stroke-width="15" stroke-linecap="round" filter="url(#${id}a)"/>
  </svg>`;
}

/**
 * Upgrade any `<span data-icon="name">` already in the document.
 * Lets static markup in index.html stay declarative.
 */
export function hydrate(root = document) {
  for (const el of root.querySelectorAll?.('[data-icon]:not([data-icon-done])') || []) {
    const name = el.dataset.icon;
    const size = el.dataset.iconSize || '1em';
    el.innerHTML = name === 'rainbow'
      ? rainbowMark({ size: parseInt(size) || 22 })
      : (SPECIES[name] ? speciesIcon(name, { size }) : icon(name, { size }));
    el.setAttribute('data-icon-done', '');
  }
}

export const Icons = { icon, speciesIcon, rainbowMark, hydrate, speciesKey, SPECIES_LABELS, SPECIES_KEYS };
export default Icons;
