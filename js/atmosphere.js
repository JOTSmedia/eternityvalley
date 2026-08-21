// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — Atmosphere
//
// A living sky behind the interface. Everything it draws is driven
// by the same signal the 3D valley uses (see theme.js): the real
// hour paints the gradient and decides whether stars and aurora are
// out; the real season decides what drifts through the air; live
// weather decides how vivid the distant rainbow burns.
//
// Deliberately cheap: one canvas, capped particle counts, DPR-aware,
// paused whenever it is off-screen or the tab is hidden, and reduced
// to a still gradient when the visitor asks for less motion.
// ============================================================

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');

function rand(a, b) { return a + Math.random() * (b - a); }

// Seasonal drift: what is actually in the air right now.
const DRIFT = {
  spring: { kind: 'petal',  count: 34, colors: ['#f7c9dd', '#ffffff', '#f2d6ef', '#ffe0ec'], size: [3.5, 7], fall: [8, 20],  sway: 26 },
  summer: { kind: 'mote',   count: 44, colors: ['#ffe9a8', '#fff6d0', '#d8f0a8', '#ffd98a'], size: [1.2, 2.8], fall: [-6, 6], sway: 16 },
  autumn: { kind: 'leaf',   count: 28, colors: ['#e0913a', '#c9642f', '#e8b45a', '#a8562a'], size: [4, 9],   fall: [14, 30], sway: 40 },
  winter: { kind: 'snow',   count: 52, colors: ['#ffffff', '#e4f0ff', '#d6e6f7'], size: [1.6, 4],  fall: [10, 26], sway: 20 },
};

export class Atmosphere {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts  { intensity=1, ridge=true, rainbow=true }
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = { intensity: 1, ridge: true, rainbow: true, ...opts };
    this.snap = null;
    this.running = false;
    this.t = 0;
    this.px = 0; this.py = 0;      // pointer parallax, -1..1
    this._tpx = 0; this._tpy = 0;
    this.shooting = [];
    this._onResize = () => this.resize();
    this._onPointer = (e) => {
      this._tpx = (e.clientX / innerWidth) * 2 - 1;
      this._tpy = (e.clientY / innerHeight) * 2 - 1;
    };
    this._onVis = () => { document.hidden ? this.stop() : this.start(); };

    this.resize();
    this._seed();
    addEventListener('resize', this._onResize);
    addEventListener('pointermove', this._onPointer, { passive: true });
    document.addEventListener('visibilitychange', this._onVis);
    // `resize` alone does not fire when the element gains size because
    // the tab became visible or the pane was opened, so watch the box.
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(this.canvas);
    }
  }

  /** Feed it a theme snapshot (see Theme.onChange). */
  setTheme(snap) {
    const seasonChanged = this.snap?.season !== snap.season;
    this.snap = snap;
    if (seasonChanged) this._seedDrift();
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || innerWidth || 0;
    const h = this.canvas.clientHeight || innerHeight || 0;
    // A background tab, a minimised window or an not-yet-laid-out
    // embed all report a 0×0 viewport. Drawing into that produces
    // zero-sized canvases and throws, so the loop idles until there is
    // something real to paint and a ResizeObserver wakes it back up.
    this.ready = w > 0 && h > 0;
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(this.w * dpr));
    this.canvas.height = Math.max(1, Math.round(this.h * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._seedRidge();
  }

  _seed() {
    // Stars — a fixed field, twinkling at their own rates.
    const n = Math.round(220 * this.opts.intensity);
    this.stars = Array.from({ length: n }, () => ({
      x: Math.random(), y: Math.random() * 0.72,
      r: rand(0.4, 1.5),
      base: rand(0.35, 1),
      tw: rand(0.4, 2.2),
      ph: rand(0, Math.PI * 2),
      depth: rand(0.2, 1),            // parallax weight
    }));

    // Light motes — always present, the "dust in a sunbeam" layer.
    const m = Math.round(30 * this.opts.intensity);
    this.motes = Array.from({ length: m }, () => ({
      x: Math.random(), y: Math.random(),
      r: rand(0.8, 2.6),
      vx: rand(-4, 4), vy: rand(-9, -2),
      a: rand(0.18, 0.5),
      ph: rand(0, Math.PI * 2),
      depth: rand(0.3, 1),
    }));

    this._seedDrift();
    this._seedRidge();
  }

  _seedDrift() {
    const cfg = DRIFT[this.snap?.season || 'summer'];
    this.driftCfg = cfg;
    const n = Math.round(cfg.count * this.opts.intensity);
    this.drift = Array.from({ length: n }, () => this._newDrifter(cfg, true));
  }

  _newDrifter(cfg, anywhere = false) {
    return {
      x: Math.random(),
      y: anywhere ? Math.random() : -0.05,
      r: rand(cfg.size[0], cfg.size[1]),
      vy: rand(cfg.fall[0], cfg.fall[1]),
      sway: rand(cfg.sway * 0.4, cfg.sway),
      ph: rand(0, Math.PI * 2),
      sp: rand(0.3, 1.1),
      rot: rand(0, Math.PI * 2),
      vr: rand(-1.4, 1.4),
      color: cfg.colors[(Math.random() * cfg.colors.length) | 0],
      a: rand(0.45, 0.95),
      depth: rand(0.4, 1),
    };
  }

  // A soft ridge silhouette gives the sky somewhere to end.
  _seedRidge() {
    const pts = [];
    const n = 26;
    for (let i = 0; i <= n; i++) {
      const x = i / n;
      const y = 0.80
        + Math.sin(x * 5.2 + 1.3) * 0.035
        + Math.sin(x * 11.7 + 0.4) * 0.018
        + Math.sin(x * 2.1) * 0.02;
      pts.push([x, y]);
    }
    this.ridge = pts;
  }

  start() {
    if (this.running) return;
    // Deliberately no `document.hidden` guard here: at boot the document
    // can report hidden for a frame, and bailing meant the loop never
    // started and no visibilitychange ever arrived to restart it.
    // requestAnimationFrame is already throttled to nothing in a
    // background tab, so starting unconditionally costs nothing.
    this.running = true;
    this.last = performance.now();
    // The first frame is scheduled, never drawn inline: start() is
    // called during boot, and a synchronous draw here would let any
    // canvas error escape into boot and strand the loading screen.
    this._raf = requestAnimationFrame(() => this._loop());
  }

  stop() { this.running = false; cancelAnimationFrame(this._raf); }

  destroy() {
    this.stop();
    removeEventListener('resize', this._onResize);
    removeEventListener('pointermove', this._onPointer);
    document.removeEventListener('visibilitychange', this._onVis);
    this._ro?.disconnect();
  }

  _loop() {
    if (!this.running) return;
    this._raf = requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);   // clamp after a stall
    this.last = now;
    this.t += dt;
    // The backdrop is decoration. It must never take the rest of the
    // page down with it, and a per-frame failure must not spam the
    // console forever — report once, then keep trying quietly.
    try {
      this._update(dt);
      this._draw();
    } catch (e) {
      if (!this._warned) { this._warned = true; console.warn('[atmosphere] draw failed', e); }
    }
  }

  _update(dt) {
    if (REDUCED.matches) return;
    // ease the parallax so it glides rather than snaps
    this.px += (this._tpx - this.px) * Math.min(1, dt * 2.4);
    this.py += (this._tpy - this.py) * Math.min(1, dt * 2.4);

    const cfg = this.driftCfg;
    for (const d of this.drift) {
      d.y += (d.vy / this.h) * dt;
      d.ph += d.sp * dt;
      d.rot += d.vr * dt;
      if (d.y > 1.08) Object.assign(d, this._newDrifter(cfg));
    }
    for (const m of this.motes) {
      m.x += (m.vx / this.w) * dt;
      m.y += (m.vy / this.h) * dt;
      m.ph += dt * 0.8;
      if (m.y < -0.05) { m.y = 1.05; m.x = Math.random(); }
      if (m.x < -0.05) m.x = 1.05; else if (m.x > 1.05) m.x = -0.05;
    }

    // Shooting stars belong to the night.
    const nightness = this.snap?.stars ?? 0;
    if (nightness > 0.5 && Math.random() < dt * 0.14) {
      this.shooting.push({
        x: rand(0.1, 0.9), y: rand(0.05, 0.4),
        vx: rand(-0.5, -0.16), vy: rand(0.07, 0.2),
        life: 0, ttl: rand(0.7, 1.3), len: rand(60, 170),
      });
    }
    for (const s of this.shooting) {
      s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt;
    }
    this.shooting = this.shooting.filter(s => s.life < s.ttl);
  }

  _draw() {
    const { ctx, w, h } = this;
    const snap = this.snap;
    if (!snap || !this.ready) return;    // nothing to paint, or nowhere to paint it
    ctx.clearRect(0, 0, w, h);

    // ---- sky gradient ----
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, snap.sky[0]);
    g.addColorStop(0.42, snap.sky[1]);
    g.addColorStop(0.76, snap.sky[2]);
    g.addColorStop(1, snap.sky[3]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const par = REDUCED.matches ? 0 : 1;

    // ---- aurora ----
    if (snap.aurora > 0.02) this._drawAurora(snap.aurora);

    // ---- stars ----
    if (snap.stars > 0.01) {
      ctx.save();
      for (const s of this.stars) {
        const tw = 0.55 + 0.45 * Math.sin(this.t * s.tw + s.ph);
        const a = snap.stars * s.base * tw;
        if (a <= 0.01) continue;
        const x = s.x * w + this.px * 14 * s.depth * par;
        const y = s.y * h + this.py * 8 * s.depth * par;
        ctx.globalAlpha = a;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
        // the brightest few get a cross-flare
        if (s.base > 0.9 && a > 0.6) {
          ctx.globalAlpha = a * 0.35;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(x - s.r * 4, y); ctx.lineTo(x + s.r * 4, y);
          ctx.moveTo(x, y - s.r * 4); ctx.lineTo(x, y + s.r * 4);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // ---- shooting stars ----
    for (const s of this.shooting) {
      const k = s.life / s.ttl;
      const a = Math.sin(k * Math.PI);
      const x = s.x * w, y = s.y * h;
      const tail = ctx.createLinearGradient(x, y, x - s.vx * s.len, y - s.vy * s.len);
      tail.addColorStop(0, `rgba(255,255,255,${a * 0.95})`);
      tail.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = tail;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - s.vx * s.len, y - s.vy * s.len);
      ctx.stroke();
    }

    // ---- the distant rainbow ----
    if (this.opts.rainbow) this._drawRainbow(snap);

    // ---- horizon glow: where the sun is, or the moon ----
    this._drawHorizonGlow(snap);

    // ---- ridge silhouette ----
    if (this.opts.ridge) this._drawRidge(snap);

    // ---- seasonal drift + motes, in front of the ridge ----
    this._drawDrift(par);
    this._drawMotes(snap, par);

    // ---- vignette ----
    const vg = ctx.createRadialGradient(w / 2, h * 0.48, Math.min(w, h) * 0.28, w / 2, h * 0.5, Math.max(w, h) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  _drawAurora(strength) {
    const { ctx, w, h } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const bands = [
      { y: 0.20, amp: 0.045, sp: 0.10, hue: '#5fe8c0', a: 0.30 },
      { y: 0.27, amp: 0.062, sp: 0.07, hue: '#7aa8f0', a: 0.24 },
      { y: 0.16, amp: 0.035, sp: 0.13, hue: '#c79af0', a: 0.18 },
    ];
    for (const b of bands) {
      ctx.beginPath();
      for (let i = 0; i <= 48; i++) {
        const x = (i / 48) * w;
        const k = i / 48;
        const y = (b.y
          + Math.sin(k * 4.1 + this.t * b.sp * 6) * b.amp
          + Math.sin(k * 9.3 + this.t * b.sp * 3.4) * b.amp * 0.45) * h;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      // curtain falls from the ribbon
      const grad = ctx.createLinearGradient(0, b.y * h - 40, 0, b.y * h + h * 0.30);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.18, b.hue);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.lineWidth = h * 0.20;
      ctx.globalAlpha = strength * b.a;
      ctx.strokeStyle = grad;
      ctx.filter = 'blur(18px)';
      ctx.stroke();
      ctx.filter = 'none';
    }
    ctx.restore();
  }

  // The signature: a wide, soft spectral arc, its feet off both edges
  // and only its crown rising into frame. Brightest in rain — "the
  // Bridge glows brightest" — and after dark. Kept faint on purpose:
  // it is atmosphere behind the copy, never competition for it.
  _drawRainbow(snap) {
    const { ctx, w, h } = this;
    const cx = w * 0.5 + this.px * 26;
    const cy = h * 1.10 + this.py * 10;
    const R = Math.max(w, h) * 0.60;
    const band = R * 0.048;
    const breathe = 0.88 + 0.12 * Math.sin(this.t * 0.5);
    const alpha = (0.045 + snap.vividness * 0.085) * (0.8 + snap.stars * 0.3) * breathe;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.filter = `blur(${Math.round(band * 0.7)}px)`;
    snap.spectrum.forEach((c, i) => {
      ctx.beginPath();
      ctx.arc(cx, cy, R - i * band, Math.PI, Math.PI * 2);
      ctx.lineWidth = band * 1.5;
      ctx.strokeStyle = c;
      ctx.globalAlpha = alpha;
      ctx.stroke();
    });
    ctx.restore();
  }

  _drawHorizonGlow(snap) {
    const { ctx, w, h } = this;
    // Sun/moon sits where the phase puts it: east at dawn, west at dusk.
    // Night keeps the moon well out toward the corner so it never lands
    // behind the headline.
    const pos = { dawn: 0.22, day: 0.5, dusk: 0.78, night: 0.86 }[snap.key] ?? 0.5;
    const x = w * pos + this.px * 18;
    const y = h * (snap.key === 'day' ? 0.16 : snap.key === 'night' ? 0.13 : 0.72);
    const r = Math.max(w, h) * (snap.key === 'night' ? 0.20 : 0.42);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, snap.key === 'night' ? 'rgba(196,214,255,0.26)' : 'rgba(255,224,170,0.42)');
    g.addColorStop(0.42, snap.key === 'night' ? 'rgba(140,168,232,0.09)' : 'rgba(255,196,132,0.14)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    if (snap.key === 'night' || snap.stars > 0.45) {
      this._drawMoon(x, y, Math.min(w, h) * 0.028, snap.stars);
    }
  }

  /**
   * The moon, at tonight's real phase. Composited on its own buffer:
   * carving the terminator with `destination-out` straight onto the sky
   * would punch a hole clean through every layer already painted.
   */
  _drawMoon(x, y, r, alpha) {
    if (!(r > 0.5)) return;            // too small to draw, and a 0-sized buffer throws
    const pad = Math.ceil(r * 1.6);
    const size = Math.max(2, Math.ceil(r * 2 + pad * 2));
    if (!this._moonCv || this._moonCv.width !== size) {
      this._moonCv = document.createElement('canvas');
      this._moonCv.width = this._moonCv.height = size;
    }
    const m = this._moonCv.getContext('2d');
    const c = size / 2;
    m.clearRect(0, 0, size, size);

    m.fillStyle = '#f4f6ff';
    m.beginPath(); m.arc(c, c, r, 0, Math.PI * 2); m.fill();

    // Synodic month from a known new moon (2000-01-06 18:14 UTC).
    const SYNODIC = 29.530588853;
    const age = (((Date.now() - 947182440000) / 86400000) % SYNODIC + SYNODIC) % SYNODIC;
    const frac = age / SYNODIC;                     // 0 new → 0.5 full → 1 new
    const offset = Math.cos(frac * Math.PI * 2) * r * 2.0;

    m.globalCompositeOperation = 'destination-out';
    m.beginPath(); m.arc(c + offset, c, r * 1.03, 0, Math.PI * 2); m.fill();
    m.globalCompositeOperation = 'source-over';

    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = r * 2.2;
    ctx.shadowColor = 'rgba(214,228,255,0.85)';
    ctx.drawImage(this._moonCv, x - c, y - c);
    ctx.restore();
  }

  _drawRidge(snap) {
    const { ctx, w, h } = this;
    const shift = this.py * 6;
    // two ridges, the far one hazier — cheap aerial perspective
    for (const [depth, alpha, scale] of [[0.55, 0.34, 0.965], [1, 0.82, 1]]) {
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (const [x, y] of this.ridge) {
        ctx.lineTo(x * w, y * h * scale + shift * depth);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      // Darkened against the deepest sky stop, so the ridge always reads
      // as the same land under whatever sky is currently overhead.
      ctx.fillStyle = this._shade(snap.sky[0], alpha);
      ctx.fill();
    }
  }

  _shade(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * 0.42);
    const g = Math.round(((n >> 8) & 255) * 0.42);
    const b = Math.round((n & 255) * 0.46);
    return `rgba(${r},${g},${b},${a})`;
  }

  _drawDrift(par) {
    const { ctx, w, h } = this;
    const cfg = this.driftCfg;
    ctx.save();
    for (const d of this.drift) {
      const x = d.x * w + Math.sin(d.ph) * d.sway + this.px * 22 * d.depth * par;
      const y = d.y * h;
      ctx.globalAlpha = d.a;
      ctx.fillStyle = d.color;
      ctx.translate(x, y);
      ctx.rotate(d.rot);
      switch (cfg.kind) {
        case 'petal':
          ctx.beginPath();
          ctx.ellipse(0, 0, d.r, d.r * 0.52, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'leaf':
          ctx.beginPath();
          ctx.moveTo(0, -d.r);
          ctx.quadraticCurveTo(d.r * 0.8, 0, 0, d.r);
          ctx.quadraticCurveTo(-d.r * 0.8, 0, 0, -d.r);
          ctx.fill();
          break;
        case 'snow':
        case 'mote':
        default:
          ctx.shadowBlur = d.r * 3;
          ctx.shadowColor = d.color;
          ctx.beginPath();
          ctx.arc(0, 0, d.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
      }
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    ctx.restore();
  }

  _drawMotes(snap, par) {
    const { ctx, w, h } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const warm = snap.stars > 0.5 ? '#b8ccff' : snap.glow;
    for (const m of this.motes) {
      const x = m.x * w + this.px * 30 * m.depth * par;
      const y = m.y * h + this.py * 16 * m.depth * par;
      const pulse = 0.6 + 0.4 * Math.sin(m.ph);
      ctx.globalAlpha = m.a * pulse;
      ctx.fillStyle = warm;
      ctx.shadowBlur = m.r * 6;
      ctx.shadowColor = warm;
      ctx.beginPath();
      ctx.arc(x, y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
