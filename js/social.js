// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — Social layer
// Earth memorials (any lat/lng on the planet), community
// activity feed, guestbooks. Seeds give the world life on day 1.
// ============================================================

// Rainbow Bridge Valley — anchored at the real Rainbow Bridge
// National Monument, Utah, USA: the world's largest natural
// bridge, a sandstone rainbow over a canyon at Lake Powell.
export const RBV = {
  lat: 37.0775, lng: -110.9642,
  name: 'Rainbow Bridge Valley',
  place: 'Rainbow Bridge National Monument, Utah, USA',
};

let _id = 0;
// `species` is a plain label; the icon is derived from it at render
// time by icons.js/speciesKey, so there is no glyph stored on a memorial.
const seed = (petName, species, years, epitaph, lat, lng, place, gifts, guestbook = []) => ({
  id: 'seed_' + (++_id), petName, species, years, epitaph, lat, lng, place,
  owner: 'A loving family', gifts, guestbook, seeded: true,
  decorations: [], createdAt: Date.now() - Math.random() * 90 * 864e5,
});

export const SEED_MEMORIALS = [
  // Clustered in RBV — the sacred heart of the cemetery
  seed('Ranger', 'Dog', '2011 – 2024', 'He knew every trail before we did.', 37.0801, -110.9668, 'Rainbow Bridge Valley, Utah', 42,
    [{ from: 'Maria & kids', msg: 'We hiked here for Ranger. The rainbow was out.', at: Date.now() - 12 * 864e5 }]),
  seed('Cleo', 'Cat', '2008 – 2023', 'Queen of every sunbeam in Arizona.', 37.0752, -110.9601, 'Rainbow Bridge Valley, Utah', 31),
  seed('Biscuit', 'Rabbit', '2018 – 2025', 'Softest ears west of the Rockies.', 37.0789, -110.9612, 'Rainbow Bridge Valley, Utah', 17),
  // Across the USA — where they actually lived and played
  seed('Max', 'Dog', '2010 – 2023', 'Central Park was his kingdom, every squirrel his subject.', 40.7812, -73.9665, 'Central Park, New York', 128,
    [{ from: 'Anonymous Visitor', msg: 'I never met Max but this made me hug my own boy tighter.', at: Date.now() - 3 * 864e5 }]),
  seed('Luna', 'Cat', '2012 – 2024', 'She watched the fog roll over the Gate every morning.', 37.7694, -122.4762, 'Golden Gate Park, San Francisco', 89),
  seed('Duke', 'Horse', '1998 – 2021', 'Twenty-three summers of Montana wind in his mane.', 45.6770, -111.0429, 'Bozeman, Montana', 54),
  seed('Sunny', 'Bird', '2015 – 2025', 'He learned to whistle the whole first verse of Over the Rainbow.', 25.7907, -80.1300, 'South Beach, Miami', 36),
  seed('Pepper', 'Dog', '2013 – 2025', 'Fastest dog on the Malibu sand, forever chasing the tide.', 34.0259, -118.7798, 'Malibu, California', 71),
  seed('Mochi', 'Cat', '2016 – 2024', 'Chicago winters were warmer with her on the windowsill.', 41.9484, -87.6553, 'Lincoln Park, Chicago', 44),
  seed('Scout', 'Dog', '2009 – 2022', 'Best trail dog in the Rockies. Wait for us at the top.', 39.6654, -105.2057, 'Red Rocks, Colorado', 93),
  seed('Waffles', 'Guinea Pig', '2020 – 2025', 'Tiny heart, mighty squeaks, endless love.', 30.2672, -97.7431, 'Austin, Texas', 22),
  seed('Willow', 'Dog', '2014 – 2026', 'She loved the Savannah oaks and everyone under them.', 32.0809, -81.0912, 'Forsyth Park, Savannah', 38),
];

// Rich profiles on a couple of seeds so the feature shows itself
Object.assign(SEED_MEMORIALS.find(m => m.petName === 'Max'), {
  petProfile: {
    birthday: 'March 3, 2010', passing: 'June 12, 2023',
    about: 'A golden retriever with a mayor’s confidence. Max greeted every dog, jogger and hot-dog vendor on the East Side like an old friend, and considered the Great Lawn his personal estate.',
    favToys: 'Tennis ball (the gray one), squeaky mallard',
    favActivities: 'Squirrel patrol, swimming at Dog Beach, snow days',
    favTreats: 'Peanut butter, pizza crusts (allegedly)',
    videos: ['https://youtube.com/watch?v=max-snow-day'],
  },
  memories: [
    { from: 'Dana R.', text: 'Max stole an entire hot dog from my hand in 2019 and I never stopped laughing. King of the park.', at: Date.now() - 20 * 864e5 },
    { from: 'The Muellers', text: 'Our puppy learned to swim by copying him. Thank you, old friend.', at: Date.now() - 6 * 864e5 },
  ],
});
Object.assign(SEED_MEMORIALS.find(m => m.petName === 'Ranger'), {
  petProfile: {
    birthday: 'May 20, 2011', passing: 'October 2, 2024',
    about: 'Trail dog, trip planner, first over every ridge in Utah.',
    favToys: 'Any stick longer than he was',
    favActivities: 'Scrambling slickrock, riding shotgun',
    favTreats: 'Jerky ends around the campfire',
  },
});

// Pre-baked community activity so the feed feels alive in demo
export const SEED_ACTIVITY = [
  { icon: 'candle', text: 'Anna lit a Vigil Candle for Max in Central Park', at: Date.now() - 2 * 36e5 },
  { icon: 'flower', text: 'A visitor left Fresh Flowers for Scout at Red Rocks', at: Date.now() - 5 * 36e5 },
  { icon: 'crest', text: 'Ranger received a Remembrance Balloon in Rainbow Bridge Valley', at: Date.now() - 9 * 36e5 },
  { icon: 'letter', text: 'Someone wrote a Letter to Luna overlooking the Golden Gate', at: Date.now() - 14 * 36e5 },
  { icon: 'paw', text: 'A new memorial was created for Willow in Savannah, Georgia', at: Date.now() - 26 * 36e5 },
  { icon: 'heart', text: '$85 donated to shelters this week in memory of our friends', at: Date.now() - 40 * 36e5 },
];

export function timeAgo(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 3600) return Math.max(1, Math.floor(s / 60)) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

// Merge seeds + user-created (user data lives in State.data.earth)
export function allMemorials(state) {
  return [...SEED_MEMORIALS, ...(state.earth?.memorials || [])];
}
export function allActivity(state) {
  return [...(state.earth?.activity || []), ...SEED_ACTIVITY]
    .sort((a, b) => b.at - a.at).slice(0, 30);
}
