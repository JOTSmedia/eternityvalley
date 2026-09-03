// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — 2D overview map (canvas)
// Same world data as the 3D engine: districts, roads, lake, plots.
// Pan/zoom, hover tooltips, click-to-select.
// ============================================================
import { WORLD, DISTRICTS, ROADS, RIVER_INLET, RIVER_OUTLET, terrainHeight } from './terrain.js?v=7';

export class Map2D {
  constructor(canvas, plots, onPlotClick) {
    this.cv = canvas || (typeof document !== 'undefined' ? (document.getElementById('canvas2d') || document.querySelector('canvas#canvas2d') || document.createElement('canvas')) : null);
    this.ctx = this.cv?.getContext?.('2d');
    this.plots = plots || [];
    this.onPlotClick = onPlotClick;
    this.scale = 0.34;
    this.cx = 0; this.cz = 60;       // world coords at canvas center
    this.hover = null;
    this.selected = null;
    this._bind();
    this._bg = null;
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => { this._resize(); this.draw(); });
    }
    this._onResize = () => { this._resize(); this.draw(); };
    if (typeof addEventListener === 'function') {
      addEventListener('resize', this._onResize);
    }
  }

  destroy() {
    if (typeof removeEventListener === 'function') {
      removeEventListener('resize', this._onResize);
      removeEventListener('pointermove', this._onPointerMove);
      removeEventListener('pointerup', this._onPointerUp);
    }
    this.cv?.removeEventListener?.('pointerdown', this._onPointerDown);
    this.cv?.removeEventListener?.('wheel', this._onWheel);
  }

  _resize() {
    if (!this.cv) return;
    const p = this.cv.parentElement;
    const r = p ? p.getBoundingClientRect() : { width: (typeof window !== 'undefined' ? window.innerWidth : 800), height: (typeof window !== 'undefined' ? window.innerHeight : 600) };
    if (r.width < 1 || r.height < 1) return;
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    this.cv.width = r.width * dpr;
    this.cv.height = r.height * dpr;
    this.cv.style.width = r.width + 'px';
    this.cv.style.height = r.height + 'px';
    this._bg = null;
  }

  // world → screen (north = up, so world z increases downward on screen)
  w2s(x, z) {
    const k = this.scale * devicePixelRatio;
    return [this.cv.width / 2 + (x - this.cx) * k, this.cv.height / 2 + (z - this.cz) * k];
  }
  s2w(px, py) {
    const k = this.scale * devicePixelRatio;
    return [(px * devicePixelRatio - this.cv.width / 2) / k + this.cx,
            (py * devicePixelRatio - this.cv.height / 2) / k + this.cz];
  }

  _bind() {
    let drag = null;
    this._onPointerDown = e => { drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz, moved: false }; };
    this._onPointerMove = e => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        this.cx = drag.cx - dx / this.scale;
        this.cz = drag.cz - dy / this.scale;
        this.draw();
      } else if (e.target === this.cv) {
        const rect = this.cv.getBoundingClientRect();
        const [wx, wz] = this.s2w(e.clientX - rect.left, e.clientY - rect.top);
        const p = this._plotAt(wx, wz);
        if (p !== this.hover) { this.hover = p; this.draw(); }
        this.cv.style.cursor = p ? 'pointer' : 'grab';
      }
    };
    this._onPointerUp = e => {
      if (drag && !drag.moved && e.target === this.cv) {
        const rect = this.cv.getBoundingClientRect();
        const [wx, wz] = this.s2w(e.clientX - rect.left, e.clientY - rect.top);
        const p = this._plotAt(wx, wz);
        if (p) { this.selected = p; this.onPlotClick?.(p); this.draw(); }
      }
      drag = null;
    };
    this._onWheel = e => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.15 : 0.87;
      this.scale = Math.min(3, Math.max(0.12, this.scale * f));
      this._bg = null;
      this.draw();
    };

    this.cv.addEventListener('pointerdown', this._onPointerDown);
    addEventListener('pointermove', this._onPointerMove);
    addEventListener('pointerup', this._onPointerUp);
    this.cv.addEventListener('wheel', this._onWheel, { passive: false });
  }

  _plotAt(wx, wz) {
    let best = null, bd = 14 / this.scale + 6;
    for (const p of this.plots) {
      const d = Math.hypot(p.x - wx, p.z - wz);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  select(plot) { this.selected = plot; if (plot) { this.cx = plot.x; this.cz = plot.z; this.scale = Math.max(this.scale, 0.9); this._bg = null; } this.draw(); }

  // ------- background layer (terrain tint, lake, roads, districts) -------
  _renderBG() {
    const bg = document.createElement('canvas');
    bg.width = this.cv.width; bg.height = this.cv.height;
    const c = bg.getContext('2d');

    // terrain sampling
    const step = 8 * devicePixelRatio;
    for (let py = 0; py < bg.height; py += step) {
      for (let px = 0; px < bg.width; px += step) {
        const [wx, wz] = this.s2w(px / devicePixelRatio, py / devicePixelRatio);
        if (Math.abs(wx) > 1050 || Math.abs(wz) > 1050) { c.fillStyle = '#b9c4b2'; c.fillRect(px, py, step, step); continue; }
        const h = terrainHeight(wx, wz);
        let col;
        if (h < WORLD.waterLevel) col = '#6fa7c8';
        else if (h > 190) col = '#e8e6df';
        else if (h > 95) col = '#a49c8d';
        else {
          const dLake = Math.hypot(wx - WORLD.lake.x, wz - WORLD.lake.z) - WORLD.lake.r;
          if (dLake < 26 && wx > WORLD.lake.x - 80) col = '#e2cc96';
          else if (wx < -220 && wz > 180 && h < 60) col = '#d3b57e';
          else if (wz < -380 && Math.abs(wx) < 260) col = '#5f8a55';
          else col = '#83a86e';
        }
        c.fillStyle = col;
        c.fillRect(px, py, step, step);
      }
    }

    // rivers
    c.strokeStyle = '#6fa7c8'; c.lineCap = 'round'; c.lineJoin = 'round';
    c.lineWidth = Math.max(4, 28 * this.scale * devicePixelRatio * 0.7);
    for (const branch of [RIVER_INLET, RIVER_OUTLET]) {
      c.beginPath();
      branch.forEach(([x, z], i) => {
        const [sx, sy] = this.w2s(x, z);
        i ? c.lineTo(sx, sy) : c.moveTo(sx, sy);
      });
      c.stroke();
    }

    // roads
    c.strokeStyle = '#d8c9a3'; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const r of ROADS) {
      c.lineWidth = Math.max(2, r.w * this.scale * devicePixelRatio * 0.7);
      c.beginPath();
      if (r.ring) {
        const [sx, sy] = this.w2s(r.cx + r.r, r.cz);
        c.moveTo(sx, sy);
        for (let a = 1; a <= 40; a++) {
          const t = (a / 40) * Math.PI * 2;
          const [x, y] = this.w2s(r.cx + Math.cos(t) * r.r, r.cz + Math.sin(t) * r.r);
          c.lineTo(x, y);
        }
      } else {
        r.pts.forEach(([x, z], i) => {
          const [sx, sy] = this.w2s(x, z);
          i ? c.lineTo(sx, sy) : c.moveTo(sx, sy);
        });
      }
      c.stroke();
    }

    // Gate and bridge are drawn, not typed. A text glyph here would
    // render as whatever emoji font the visitor's OS supplies — and at
    // map scale it has to line up with the geometry underneath it.
    const dpr = devicePixelRatio;
    c.textAlign = 'center';

    // gate marker: two posts under a lintel
    const [gx, gy] = this.w2s(WORLD.gate.x, WORLD.gate.z);
    c.strokeStyle = '#2c2c34';
    c.lineWidth = 2.2 * dpr;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(gx - 9 * dpr, gy + 8 * dpr); c.lineTo(gx - 9 * dpr, gy - 5 * dpr);
    c.moveTo(gx + 9 * dpr, gy + 8 * dpr); c.lineTo(gx + 9 * dpr, gy - 5 * dpr);
    c.moveTo(gx - 12 * dpr, gy - 5 * dpr); c.lineTo(gx + 12 * dpr, gy - 5 * dpr);
    c.moveTo(gx - 10 * dpr, gy - 9 * dpr); c.lineTo(gx + 10 * dpr, gy - 9 * dpr);
    c.stroke();

    // the Rainbow Bridge: the spectrum, arched over the crossing
    const [bx, by] = this.w2s(WORLD.bridge.x, WORLD.bridge.z);
    const BANDS = ['#e05a4f', '#ee9740', '#f2d04a', '#63c268', '#4a9fd8', '#5566c4', '#8f57b8'];
    c.lineCap = 'butt';
    c.lineWidth = 2.4 * dpr;
    BANDS.forEach((col, i) => {
      c.strokeStyle = col;
      c.beginPath();
      c.arc(bx, by + 7 * dpr, (15 - i * 2) * dpr, Math.PI, 0);
      c.stroke();
    });
    c.fillStyle = '#2c2c34';
    c.font = `600 ${11 * dpr}px system-ui, sans-serif`;
    c.fillStyle = 'rgba(20,26,20,0.75)';
    c.fillText('THE RAINBOW BRIDGE', bx, by + 24 * devicePixelRatio);

    // district labels
    const labels = {
      meadows: [0, 420], woodland: [-30, -480], lakefront: [150, -220],
      beach: [740, -200], summit: [-540, -450], desert: [-480, 330],
      ocean_cove: [20, 1080], highland_sanctuary: [0, -640], kaya_island: [20, 2100],
    };
    c.font = `600 ${13 * devicePixelRatio}px system-ui, sans-serif`;
    for (const [k, [x, z]] of Object.entries(labels)) {
      if (!DISTRICTS[k]) continue;
      const [sx, sy] = this.w2s(x, z);
      c.fillStyle = 'rgba(20,26,20,0.55)';
      const t = DISTRICTS[k].name.toUpperCase();
      c.fillText(t, sx, sy);
    }
    // Landmark labels
    const [lx, ly] = this.w2s(WORLD.lake.x, WORLD.lake.z);
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.font = `italic ${14 * devicePixelRatio}px Georgia, serif`;
    c.fillText('Mirror Lake', lx, ly);

    const [cx, cy] = this.w2s(WORLD.cathedral.x, WORLD.cathedral.z);
    c.fillStyle = 'rgba(244,212,120,0.85)';
    c.font = `600 ${12 * devicePixelRatio}px Georgia, serif`;
    c.fillText('✦ Grand Universal Cathedral', cx, cy - 18 * devicePixelRatio);

    const [kx, ky] = this.w2s(WORLD.kayaIsland.x, WORLD.kayaIsland.z);
    c.fillStyle = 'rgba(100,230,250,0.90)';
    c.font = `600 ${12 * devicePixelRatio}px Georgia, serif`;
    c.fillText('🐾 Guardian Husky Kaya Beacon', kx, ky - 18 * devicePixelRatio);

    return bg;
  }

  draw() {
    if (this.cv.width < 1 || this.cv.height < 1) return;  // not laid out yet
    if (!this._bg) this._bg = this._renderBG();
    const c = this.ctx;
    c.clearRect(0, 0, this.cv.width, this.cv.height);
    c.drawImage(this._bg, 0, 0);

    // plots
    const r = Math.max(2.2, 5 * this.scale) * devicePixelRatio;
    for (const p of this.plots) {
      const [sx, sy] = this.w2s(p.x, p.z);
      if (sx < -20 || sy < -20 || sx > this.cv.width + 20 || sy > this.cv.height + 20) continue;
      c.beginPath();
      c.arc(sx, sy, p.size === 'estate' ? r * 1.5 : p.size === 'premium' ? r * 1.2 : r, 0, Math.PI * 2);
      c.fillStyle = p.status === 'available' ? '#79c164' : '#8b95a3';
      c.fill();
      if (p === this.hover || p === this.selected) {
        c.lineWidth = 3 * devicePixelRatio;
        c.strokeStyle = p === this.selected ? '#e8b23a' : '#ffffff';
        c.stroke();
      }
    }

    // hover tooltip
    if (this.hover) {
      const p = this.hover;
      const [sx, sy] = this.w2s(p.x, p.z);
      const txt = `${p.id} · ${DISTRICTS[p.district].name} · ${p.status === 'available' ? '$' + p.price : 'Occupied'}`;
      c.font = `600 ${12 * devicePixelRatio}px system-ui, sans-serif`;
      const w = c.measureText(txt).width + 20 * devicePixelRatio;
      c.fillStyle = 'rgba(22,28,24,0.92)';
      const bx = sx - w / 2, by = sy - 38 * devicePixelRatio;
      c.beginPath();
      c.roundRect(bx, by, w, 26 * devicePixelRatio, 6 * devicePixelRatio);
      c.fill();
      c.fillStyle = '#f3ead6';
      c.textAlign = 'center';
      c.fillText(txt, sx, by + 17 * devicePixelRatio);
    }
  }
}
