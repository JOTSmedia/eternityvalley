// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — Real-time astronomy
//
// Everything the sky shows is computed from the actual clock: where
// the sun is standing over the Earth right now, tonight's real moon
// phase and where the moon sits relative to the sun, and roughly
// where the naked-eye planets are along the ecliptic.
//
// These are the standard low-precision astronomical formulae (Meeus,
// "Astronomical Algorithms", abridged). They are good to a fraction
// of a degree — far past what anyone can perceive on a rendered
// globe — and they cost nothing, which matters because this runs
// every frame.
// ============================================================

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** Julian Day from a JS Date. */
export function julianDay(date = new Date()) {
  return date.getTime() / 86400000 + 2440587.5;
}

/** Days since the J2000.0 epoch. */
export function daysSinceJ2000(date = new Date()) {
  return julianDay(date) - 2451545.0;
}

/**
 * The sub-solar point: the latitude and longitude on Earth where the
 * sun is directly overhead at this instant. This is what puts the
 * terminator in the right place — the day/night line has to match
 * the viewer's actual clock, or the whole illusion fails for anyone
 * who glances out of a window.
 */
export function subsolarPoint(date = new Date()) {
  const n = daysSinceJ2000(date);

  // Mean longitude and anomaly of the sun
  const L = (280.460 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;

  // Ecliptic longitude, with the two largest periodic corrections
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;

  // Obliquity of the ecliptic (slowly decreasing)
  const eps = (23.439 - 0.0000004 * n) * RAD;

  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda)) * DEG;

  // Right ascension, then Greenwich hour angle
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) * DEG;
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  let lng = ((ra - gmst + 540) % 360) - 180;

  return { lat: dec, lng };
}

/**
 * Moon phase and position.
 *
 * `phase` runs 0 → 1 across a synodic month: 0 new, 0.25 first
 * quarter, 0.5 full, 0.75 last quarter. `illumination` is the lit
 * fraction of the disc, which is what actually gets drawn.
 */
const SYNODIC = 29.530588853;
const KNOWN_NEW_MOON = 2451550.1;   // 2000 Jan 6, 18:14 UTC

export function moonState(date = new Date()) {
  const jd = julianDay(date);
  const age = (((jd - KNOWN_NEW_MOON) % SYNODIC) + SYNODIC) % SYNODIC;
  const phase = age / SYNODIC;

  // Illuminated fraction: 0 at new, 1 at full
  const illumination = (1 - Math.cos(phase * 2 * Math.PI)) / 2;

  // Waxing on the way up, waning on the way down — decides which limb
  // is lit, and therefore which way the crescent faces.
  const waxing = phase < 0.5;

  // Low-precision ecliptic longitude, enough to place it in the sky
  const n = daysSinceJ2000(date);
  const lambda = (218.316 + 13.176396 * n) % 360;
  const beta = 5.128 * Math.sin((93.272 + 13.229350 * n) * RAD);

  return { age, phase, illumination, waxing, lambda: (lambda + 360) % 360, beta, name: phaseName(phase) };
}

export function phaseName(phase) {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.02 || p > 0.98) return 'New moon';
  if (p < 0.23) return 'Waxing crescent';
  if (p < 0.27) return 'First quarter';
  if (p < 0.48) return 'Waxing gibbous';
  if (p < 0.52) return 'Full moon';
  if (p < 0.73) return 'Waning gibbous';
  if (p < 0.77) return 'Last quarter';
  return 'Waning crescent';
}

/**
 * Naked-eye planets along the ecliptic.
 *
 * Circular-orbit approximation: each planet's heliocentric longitude
 * advances at its own mean rate from a J2000 epoch value. Wrong by a
 * couple of degrees for the eccentric orbits, right about which side
 * of the sky each planet is on and in what order — which is all a
 * viewer can judge from a rendered starfield.
 */
const PLANETS = [
  // name,        a (AU),  period (days), L0 (deg at J2000), radius, colour
  ['Mercury', 0.387, 87.969, 252.25, 0.38, '#b6b0a6'],
  ['Venus', 0.723, 224.701, 181.98, 0.95, '#f0e0b8'],
  ['Mars', 1.524, 686.980, 355.43, 0.53, '#d1684a'],
  ['Jupiter', 5.203, 4332.589, 34.35, 4.2, '#d8bf9a'],
  ['Saturn', 9.537, 10759.22, 50.08, 3.6, '#e0d0a0'],
];

const EARTH = { a: 1.0, period: 365.256, L0: 100.46 };

export function planetPositions(date = new Date()) {
  const n = daysSinceJ2000(date);
  const earthL = ((EARTH.L0 + 360 * n / EARTH.period) % 360) * RAD;
  const ex = EARTH.a * Math.cos(earthL);
  const ey = EARTH.a * Math.sin(earthL);

  return PLANETS.map(([name, a, period, L0, radius, color]) => {
    const L = ((L0 + 360 * n / period) % 360) * RAD;
    const px = a * Math.cos(L);
    const py = a * Math.sin(L);
    // Geocentric direction: where we see it from Earth
    const dx = px - ex;
    const dy = py - ey;
    const lambda = ((Math.atan2(dy, dx) * DEG) + 360) % 360;
    const distance = Math.hypot(dx, dy);
    // Rough apparent brightness: bigger and closer reads brighter
    const magnitude = radius / (distance * distance);
    return { name, lambda, distance, radius, color, magnitude };
  });
}

/**
 * A convenience bundle for the renderer: everything about right now,
 * computed once per frame-ish rather than per object.
 */
export function skyState(date = new Date()) {
  return {
    date,
    sun: subsolarPoint(date),
    moon: moonState(date),
    planets: planetPositions(date),
  };
}

export { RAD, DEG };
