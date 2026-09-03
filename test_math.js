function smooth(t) { return t * t * (3 - 2 * t); }
function hash2(x, y, seed) {
  let n = (x * 137 + y * 149 + seed * 151) & 0x7fffffff;
  n = (n << 13) ^ n;
  return (1.0 - ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824.0) * 0.5 + 0.5;
}
function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smooth(xf), v = smooth(yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbmTile(x, y, period, octaves = 3, seed = 1, gain = 0.5, lac = 2) {
  let sum = 0, amp = 1, norm = 0, p = period, freq = 1;
  for (let o = 0; o < octaves; o++) {
    const xf = ((x * freq) % p + p) % p;
    const yf = ((y * freq) % p + p) % p;
    sum += valueNoise(xf, yf, seed + o * 977) * amp;
    norm += amp;
    amp *= gain;
    freq *= lac;
    p *= lac;
  }
  return sum / norm;
}
const t0 = performance.now();
const size = 64;
const h = new Float32Array(size * size);
const seed = 8821;
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const u = x / size;
    const v = y / size;
    const drainage = Math.abs(fbmTile(u * 8, v * 8, 8, 3, seed) - 0.5) * 0.6;
    const parcels = Math.sin(u * 14 * Math.PI) * Math.cos(v * 14 * Math.PI) * 0.15;
    const micro = fbmTile(u * 48, v * 48, 48, 3, seed + 9) * 0.25;
    h[y*size+x] = drainage + parcels + micro;
  }
}
const t1 = performance.now();
console.log('Math time:', t1 - t0);
