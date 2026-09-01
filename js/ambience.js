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

// Physically-Based Color Temperatures (Kelvin) & Palettes per Phase
export const PHASES = {
  dawn:     { top: 0x1e2e54, mid: 0x8a6a8e, low: 0xf2b294, sun: 0xffe0ba, sunI: 1.8, fog: 0xb89084, hemi: 0.38, night: 0.00, kelvin: 3200 },
  sunlit:   { top: 0x0f4e9e, mid: 0x4896e0, low: 0x78bce8, sun: 0xfff5dd, sunI: 2.2, fog: 0x90b8d8, hemi: 0.45, night: 0.00, kelvin: 5600 },
  day:      { top: 0x0f4e9e, mid: 0x4896e0, low: 0x78bce8, sun: 0xfff5dd, sunI: 2.2, fog: 0x90b8d8, hemi: 0.45, night: 0.00, kelvin: 5600 },
  dusk:     { top: 0x141a38, mid: 0x9e2b44, low: 0xe05630, sun: 0xff883c, sunI: 1.8, fog: 0xa86854, hemi: 0.38, night: 0.25, kelvin: 2200 },
  night:    { top: 0x060e24, mid: 0x101e3c, low: 0x142848, sun: 0xd4ecff, sunI: 0.9, fog: 0x142236, hemi: 0.30, night: 1.00, kelvin: 8500 },
  blessing: { top: 0x18345c, mid: 0x6e88b8, low: 0xd8c8f0, sun: 0xfffae8, sunI: 2.0, fog: 0xaec2dc, hemi: 0.48, night: 0.05, kelvin: 6200, rainbow: 1.0 },
};

// WMO weather codes → paradise-grade mood
function moodFromCode(code) {
  if (code === 0) return 'clear';
  if (code <= 3) return 'soft';                    // partly cloudy → pearly light
  if (code >= 51 && code <= 67) return 'blessing'; // rain → vivid rainbow, silver mist
  if (code >= 71 && code <= 77) return 'crystal';  // snow → bright mountain hush
  if (code >= 95) return 'blessing';
  return 'soft';
}

export const MOODS = {
  clear:    { fogNear: 1800, fogFar: 18000, rainbow: 0.45, light: 1.00, label: 'Clear alpine skies' },
  soft:     { fogNear: 1200, fogFar: 14000, rainbow: 0.60, light: 0.92, label: 'Pearl-soft light' },
  blessing: { fogNear: 800,  fogFar: 9000,  rainbow: 1.00, light: 0.82, label: 'Rain blessing — prismatic spectral glow' },
  crystal:  { fogNear: 1500, fogFar: 16000, rainbow: 0.75, light: 0.96, label: 'Crystal mountain hush' },
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
