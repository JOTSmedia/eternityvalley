// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — Living ambience
// The paradise follows the visitor's real world, gently:
//  · time of day  → sun position, sky palette, stars
//  · date         → season (blooms, tree tints)
//  · live weather → soft mist, cloud light, rainbow vividness
// Everything degrades gracefully — no permission, no problem.
// ============================================================

export function getSeason(date = new Date()) {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

export const SEASON_STYLE = {
  spring: { bloom: [0xf7a8c4, 0xffffff, 0xc9a8f7, 0xf7d6a8], crown: 0x74a95e, cherry: 0xf2b8cf, name: 'Spring — cherry blossom' },
  summer: { bloom: [0xe85f5f, 0xf3d84a, 0x9a6fd8, 0xf08c3a], crown: 0x5e8f4e, cherry: 0x6f9e5c, name: 'Summer — wildflower' },
  autumn: { bloom: [0xe8a13a, 0xd8742f, 0xc9552f, 0xe8c96a], crown: 0xc07a35, cherry: 0xd8952f, name: 'Autumn — golden' },
  winter: { bloom: [0xffffff, 0xcfe4f2, 0xe8f0e6, 0xdfe8ff], crown: 0x7d8f74, cherry: 0xe8f0ee, name: 'Winter — snowdrop' },
};

// 0..1 through the day → phase key + sun elevation
export function getDayPhase(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 5 && h < 8)   return { key: 'dawn',  t: (h - 5) / 3 };
  if (h >= 8 && h < 17)  return { key: 'day',   t: (h - 8) / 9 };
  if (h >= 17 && h < 20.5) return { key: 'dusk', t: (h - 17) / 3.5 };
  return { key: 'night', t: h >= 20.5 ? (h - 20.5) / 8.5 : (h + 3.5) / 8.5 };
}

// Palette per phase: sky top/mid/horizon, sun color+intensity, fog, hemi
export const PHASES = {
  dawn:  { top: 0x6d8fc4, mid: 0xe8c8d8, low: 0xf7d9a8, sun: 0xffc9a0, sunI: 1.5, fog: 0xe8d3c8, hemi: 0.7, night: 0 },
  day:   { top: 0x7fb2d9, mid: 0xd9e6ee, low: 0xf6dfc0, sun: 0xffe3b0, sunI: 2.1, fog: 0xd8e2e8, hemi: 0.85, night: 0 },
  dusk:  { top: 0x4a5a8f, mid: 0xd88a6f, low: 0xf2b25f, sun: 0xff9d5c, sunI: 1.6, fog: 0xd8b8a8, hemi: 0.6, night: 0.25 },
  night: { top: 0x101a33, mid: 0x27334f, low: 0x3d4668, sun: 0xa8bfe8, sunI: 0.5, fog: 0x2a3348, hemi: 0.35, night: 1 },
};

// WMO weather codes → paradise-grade mood
function moodFromCode(code) {
  if (code === 0) return 'clear';
  if (code <= 3) return 'soft';                    // partly cloudy → pearly light
  if (code >= 51 && code <= 67) return 'blessing'; // rain → vivid rainbow, silver mist
  if (code >= 71 && code <= 77) return 'crystal';  // snow → bright hush
  if (code >= 95) return 'blessing';
  return 'soft';
}

export const MOODS = {
  clear:    { fogNear: 900, fogFar: 2600, rainbow: 0.4, light: 1.0, label: 'Clear skies' },
  soft:     { fogNear: 700, fogFar: 2200, rainbow: 0.55, light: 0.85, label: 'Pearl-soft light' },
  blessing: { fogNear: 420, fogFar: 1700, rainbow: 1.0, light: 0.7, label: 'Rain blessing — the Bridge glows brightest' },
  crystal:  { fogNear: 600, fogFar: 2000, rainbow: 0.7, light: 0.95, label: 'Crystal hush' },
};

// Live weather via open-meteo (keyless). Geolocation is optional and
// time-boxed; failure of any step falls back to 'clear'.
export function fetchWeather() {
  return new Promise((resolve) => {
    const fallback = () => resolve({ mood: 'clear', live: false });
    if (!navigator.geolocation) return fallback();
    const timer = setTimeout(fallback, 4000);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      clearTimeout(timer);
      try {
        const { latitude, longitude } = pos.coords;
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=weather_code`);
        const j = await r.json();
        resolve({ mood: moodFromCode(j.current?.weather_code ?? 0), live: true });
      } catch { fallback(); }
    }, fallback, { timeout: 3500, maximumAge: 600000 });
  });
}
