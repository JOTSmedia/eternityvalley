// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — Motion
//
// Interaction choreography, kept out of the feature code. UI panels
// and modals in this app are built by innerHTML, so everything here
// is idempotent and re-appliable: call Motion.enhance(node) after
// injecting markup and the new content picks up the same behaviour
// as everything else.
//
// Every effect no-ops under prefers-reduced-motion.
// ============================================================

const REDUCED = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const FLAG = '__rbMotion';       // marks an element as already wired

function once(el, key) {
  el[FLAG] ||= {};
  if (el[FLAG][key]) return false;
  el[FLAG][key] = true;
  return true;
}

// ---------------------------------------------------------------
// Reveal — staggered entrance as content enters the viewport (or
// immediately, for elements injected into an already-visible panel).
// ---------------------------------------------------------------
let revealObserver = null;
function ensureObserver() {
  if (revealObserver) return revealObserver;
  revealObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-revealed');
      revealObserver.unobserve(e.target);
    }
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
  return revealObserver;
}

export const Motion = {
  /**
   * Wire every effect found under `root`. Safe to call repeatedly.
   * @param {ParentNode} root
   */
  enhance(root = document) {
    this.reveal(root);
    this.magnetic(root);
    this.tilt(root);
    this.ripple(root);
    return root;
  },

  /** Elements with [data-reveal] fade+rise in, staggered by DOM order. */
  reveal(root = document) {
    const els = root.querySelectorAll?.('[data-reveal]:not(.is-revealed)') || [];
    const obs = ensureObserver();
    els.forEach((el, i) => {
      if (!once(el, 'reveal')) return;
      const delay = el.dataset.revealDelay ?? (i * 70);
      el.style.setProperty('--reveal-delay', `${delay}ms`);
      if (REDUCED.matches) { el.classList.add('is-revealed'); return; }
      obs.observe(el);
    });
  },

  /**
   * Reveal a freshly built list right now, staggered — for panel and
   * modal bodies, which are already on screen when they are written.
   */
  cascade(root, selector = '[data-reveal]', step = 55) {
    const els = [...(root.querySelectorAll?.(selector) || [])];
    els.forEach((el, i) => {
      // Opt anything into the reveal transition, not just authored markup.
      el.setAttribute('data-reveal', '');
      el.style.setProperty('--reveal-delay', `${i * step}ms`);
      if (REDUCED.matches) { el.classList.add('is-revealed'); return; }
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-revealed')));
    });
    return els.length;
  },

  /** Buttons marked .btn lean gently toward the cursor. */
  magnetic(root = document) {
    if (REDUCED.matches) return;
    const els = root.querySelectorAll?.('.btn-gold, .btn-lg, [data-magnetic]') || [];
    for (const el of els) {
      if (!once(el, 'magnetic')) continue;
      const strength = Number(el.dataset.magnetic) || 0.28;
      const reset = () => { el.style.setProperty('--mx', '0px'); el.style.setProperty('--my', '0px'); };
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        el.style.setProperty('--mx', `${dx * strength}px`);
        el.style.setProperty('--my', `${dy * strength}px`);
      });
      el.addEventListener('pointerleave', reset);
      el.addEventListener('pointerup', reset);
    }
  },

  /** Cards with [data-tilt] rotate in 3D under the pointer. */
  tilt(root = document) {
    if (REDUCED.matches) return;
    const els = root.querySelectorAll?.('[data-tilt]') || [];
    for (const el of els) {
      if (!once(el, 'tilt')) continue;
      const max = Number(el.dataset.tilt) || 8;
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.setProperty('--tilt-x', `${-py * max}deg`);
        el.style.setProperty('--tilt-y', `${px * max}deg`);
        el.style.setProperty('--shine-x', `${(px + 0.5) * 100}%`);
        el.style.setProperty('--shine-y', `${(py + 0.5) * 100}%`);
      });
      el.addEventListener('pointerleave', () => {
        el.style.setProperty('--tilt-x', '0deg');
        el.style.setProperty('--tilt-y', '0deg');
      });
    }
  },

  /** A light bloom expands from the click point on buttons. */
  ripple(root = document) {
    if (REDUCED.matches) return;
    const els = root.querySelectorAll?.('.btn') || [];
    for (const el of els) {
      if (!once(el, 'ripple')) continue;
      el.addEventListener('pointerdown', (e) => {
        const r = el.getBoundingClientRect();
        const d = document.createElement('span');
        d.className = 'btn-ripple';
        d.style.left = `${e.clientX - r.left}px`;
        d.style.top = `${e.clientY - r.top}px`;
        el.appendChild(d);
        setTimeout(() => d.remove(), 620);
      });
    }
  },

  /**
   * A soft pool of light that trails the pointer, tinted by the
   * current phase. One per document; cheap (a single transformed div).
   */
  cursorGlow() {
    if (REDUCED.matches || matchMedia('(pointer: coarse)').matches) return;
    if (document.querySelector('.cursor-glow')) return;
    const el = document.createElement('div');
    el.className = 'cursor-glow';
    document.body.appendChild(el);
    let x = innerWidth / 2, y = innerHeight / 2, tx = x, ty = y, raf = 0;
    addEventListener('pointermove', (e) => {
      tx = e.clientX; ty = e.clientY;
      el.style.opacity = '1';
      if (!raf) raf = requestAnimationFrame(step);
    }, { passive: true });
    addEventListener('pointerleave', () => { el.style.opacity = '0'; });
    function step() {
      x += (tx - x) * 0.16; y += (ty - y) * 0.16;
      el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      raf = (Math.abs(tx - x) > 0.4 || Math.abs(ty - y) > 0.4) ? requestAnimationFrame(step) : 0;
    }
    return el;
  },

  /**
   * Scatter a burst of spectral sparks from a point — used to mark
   * the moments that matter: a memorial placed, a candle lit.
   */
  spark(x, y, count = 22) {
    if (REDUCED.matches) return;
    const layer = document.createElement('div');
    layer.className = 'spark-layer';
    document.body.appendChild(layer);
    const spectrum = getComputedStyle(document.documentElement);
    for (let i = 0; i < count; i++) {
      const s = document.createElement('i');
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const d = 40 + Math.random() * 90;
      s.style.left = `${x}px`;
      s.style.top = `${y}px`;
      s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
      s.style.setProperty('--dy', `${Math.sin(a) * d - 30}px`);
      s.style.setProperty('--dur', `${600 + Math.random() * 500}ms`);
      s.style.background = spectrum.getPropertyValue(`--spec-${(i % 7) + 1}`).trim() || '#fff';
      layer.appendChild(s);
    }
    setTimeout(() => layer.remove(), 1300);
  },

  /** Count a number up — for prices and totals that deserve a beat. */
  countUp(el, to, { from = 0, ms = 700, prefix = '', suffix = '' } = {}) {
    if (REDUCED.matches) { el.textContent = `${prefix}${to}${suffix}`; return; }
    const t0 = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = `${prefix}${Math.round(from + (to - from) * e)}${suffix}`;
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },
};

export default Motion;
