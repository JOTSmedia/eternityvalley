// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — guided tour
//
// A first-visit walkthrough: a spotlight moves around the real
// interface while a card explains the thing under it, then fades on
// to the next. It reads the live DOM rather than describing a
// remembered layout, so a step whose control isn't on screen is
// skipped instead of pointing at nothing.
//
// Pacing is the whole game here. An auto-advancing tour that outruns
// its reader is worse than no tour, so each step's dwell is derived
// from how much there is to read, it pauses whenever the pointer is
// over the card, and a progress bar shows exactly how long is left.
// Anyone who would rather drive can: the controls are always there,
// and prefers-reduced-motion turns auto-advance off entirely.
// ============================================================
import { icon } from './icons.js';

const SEEN_KEY = 'ev_tour_seen_v1';

const reduceMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * The script. `target` is a selector resolved at the moment the step
 * runs — never cached, because views mount lazily and the toolbar
 * reflows. A step with no target is shown centred.
 */
const STEPS = [
  {
    id: 'orbit',
    target: null,
    icon: 'globe',
    title: 'This is Earth, right now',
    body: 'Not a picture of it — the real thing, at this minute. The sunlight falls where the sun actually is, the city lights come on as night reaches them, and the moon overhead is tonight’s moon at tonight’s phase.',
  },
  {
    id: 'valley',
    target: '#enterValleyBtn',
    icon: 'crest',
    title: 'The valley is through here',
    body: 'Rainbow Bridge Valley is a place you can walk: meadows, a lakeside, pines, shores, a summit. Every companion has a spot here, whether or not you ever choose one on the map.',
  },
  {
    id: 'search',
    target: '#earthSearch',
    icon: 'search',
    title: 'Or somewhere they actually loved',
    body: 'Type any real address or place — your own backyard, the beach they tore up and down, the trail you walked every evening. This is the heart of it: their memorial can sit on the ground they knew.',
  },
  {
    id: 'fly',
    target: '#earthGo',
    icon: 'plane',
    title: 'Then fly there',
    body: 'The planet turns under you and drops you into real satellite imagery of that exact place. “My location” does the same for wherever you’re standing now.',
  },
  {
    id: 'views',
    target: '.view-toggle',
    icon: 'eye',
    title: 'Four ways to be there',
    body: 'Orbit is the whole planet. Map is real imagery of one place on it. Valley is the sanctuary itself, in 3D. 2D is a plain overhead plan for when you just want to find something quickly.',
  },
  {
    id: 'place',
    target: '#placeBtn',
    icon: 'paw',
    title: 'Place their memorial',
    body: 'Choose the spot, add their name, their photo, the years, a few words. It stays at those coordinates — you can come back and stand there any time.',
    optional: true,
  },
  {
    id: 'cause',
    target: '#causeBtn',
    icon: 'heart',
    title: 'Remembering one animal should help a living one',
    body: 'A share of every plot, membership and gift goes to an animal charity — the one the memorial’s owner picked, not one we picked for them. And if you never buy anything at all, you can still start a free campaign in your companion’s name: 100% of what it raises goes straight to the charity you chose.',
    optional: true,
  },
  {
    id: 'ledger',
    target: '#causeBtn',
    icon: 'scroll',
    title: 'And you can check that we mean it',
    body: 'Every transaction this site has ever taken is published — what came in, what the card processor took, what reached the charity. The list is hash-chained, so an entry cannot be quietly rewritten later. Open it from here any time.',
    optional: true,
  },
  {
    id: 'browse',
    target: '#browseBtn',
    icon: 'grave',
    title: 'Visit other companions',
    body: 'Every memorial anyone has placed, and every plot in the valley. Leave flowers, light a candle, or just read what someone wrote about a dog you never met.',
    optional: true,
  },
  {
    id: 'feed',
    target: '#feedBtn',
    icon: 'chat',
    title: 'Nobody grieves well alone',
    body: 'The community feed is where people say the things that are hard to say elsewhere. Read it, or add to it.',
    optional: true,
  },
  {
    id: 'mine',
    target: '#myBtn',
    icon: 'heart',
    title: 'Everything of yours lives here',
    body: 'My Bridge collects the memorials you’ve made and the gifts you’ve left. You can look around as a guest for as long as you like — an account only matters when you want it kept.',
    optional: true,
  },
  {
    id: 'done',
    target: '#tourBtn',
    icon: 'sparkle',
    title: 'That’s the whole map',
    body: 'Take your time — nothing here is in a hurry. This guide lives under this button whenever you want it again.',
    optional: true,
    last: true,
  },
];

// Long enough to actually read: a floor, plus time proportional to the
// text. The earlier loading screen shipped with a fixed interval and
// changed before anyone finished a sentence; this is deliberately slow.
function dwellFor(step) {
  const chars = (step.title + step.body).length;
  return Math.min(13000, 3800 + chars * 52);
}

export const Tour = {
  i: -1,
  running: false,
  paused: false,
  root: null,

  /**
   * Start automatically, but only on a first visit — and only if the
   * visitor isn't already doing something. Someone who opened a modal
   * or a panel in the seconds before this fires has already found
   * their own way in, and a tour dropping a veil over their open
   * dialog is an interruption, not an introduction.
   */
  maybeStart() {
    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch {}
    if (seen || this.running) return false;
    if (this._busy()) return false;
    this.start();
    return true;
  },

  /** True when a modal or a side panel is open. */
  _busy() {
    const open = (sel) => {
      const el = document.querySelector(sel);
      return el && !el.classList.contains('hidden');
    };
    return open('#modalRoot') || open('#campaignPanel') || open('#feedPanel')
        || open('#browsePanel') || open('#plotPanel');
  },

  start(from = 0) {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this._build();
    // A timer, not requestAnimationFrame. rAF does not fire at all in a
    // background tab, and the site can perfectly well be opened in one:
    // the tour would then sit there as a dim veil with no card on it,
    // and no card ever arriving. A timeout is throttled in the
    // background but it does still run, so the tour is correct whenever
    // the visitor gets round to looking at it.
    setTimeout(() => {
      if (!this.running) return;
      this.root.classList.add('is-live');
      this.go(from);
    }, 40);
  },

  /** Ends the tour and remembers that it has been seen. */
  end() {
    if (!this.running) return;
    this.running = false;
    clearTimeout(this._timer);
    cancelAnimationFrame(this._tick);
    try { localStorage.setItem(SEEN_KEY, '1'); } catch {}
    this._unbind();
    const root = this.root;
    this.root = null;
    root?.classList.remove('is-live');
    setTimeout(() => root?.remove(), 420);
  },

  // ---------------- steps ----------------

  /**
   * Resolve a step's target, skipping steps whose control isn't on
   * screen. `dir` keeps that skip moving the way the visitor asked.
   */
  go(i, dir = 1) {
    if (!this.running) return;
    while (i >= 0 && i < STEPS.length) {
      const step = STEPS[i];
      const el = step.target ? document.querySelector(step.target) : null;
      const usable = !step.target || (el && this._visible(el));
      if (usable) { this._render(i, el); return; }
      if (!step.optional) { this._render(i, null); return; }
      i += dir;
    }
    this.end();
  },

  next() { this.go(this.i + 1, 1); },
  back() { this.go(this.i - 1, -1); },

  _visible(el) {
    if (!el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    return getComputedStyle(el).visibility !== 'hidden';
  },

  async _render(i, el) {
    this.i = i;
    const step = STEPS[i];
    clearTimeout(this._timer);
    cancelAnimationFrame(this._tick);

    // Controls can sit inside the horizontally scrolling action row on
    // a phone. Bring it into view and let the scroll settle before
    // measuring, or the spotlight lands where the button used to be.
    if (el?.scrollIntoView) {
      el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
      await new Promise(r => setTimeout(r, reduceMotion() ? 0 : 320));
      if (this.i !== i || !this.running) return;   // moved on while we waited
    }

    const card = this.card;
    card.classList.add('is-swapping');
    await new Promise(r => setTimeout(r, reduceMotion() ? 0 : 200));
    if (this.i !== i || !this.running) return;

    card.innerHTML = this._cardHtml(step, i);
    this._target = el || null;
    this._place();
    card.classList.remove('is-swapping');

    card.querySelector('[data-tour="next"]')?.addEventListener('click', () => this._act(() => step.last ? this.end() : this.next()));
    card.querySelector('[data-tour="back"]')?.addEventListener('click', () => this._act(() => this.back()));
    card.querySelector('[data-tour="skip"]')?.addEventListener('click', () => this.end());

    this._startClock(dwellFor(step), () => step.last ? this.end() : this.next());
  },

  /** A manual move cancels the clock first, so the two can't race. */
  _act(fn) {
    clearTimeout(this._timer);
    cancelAnimationFrame(this._tick);
    fn();
  },

  _cardHtml(step, i) {
    const dots = STEPS.map((s, n) =>
      `<i class="tour-dot${n === i ? ' is-on' : ''}${n < i ? ' is-past' : ''}"></i>`).join('');
    return `
      <div class="tour-card__bar"><span data-tour="bar"></span></div>
      <div class="tour-card__head">
        ${icon(step.icon, { cls: 'tour-card__ico', size: 22 })}
        <h2 class="tour-card__title" id="tourTitle">${step.title}</h2>
      </div>
      <p class="tour-card__body">${step.body}</p>
      <div class="tour-card__foot">
        <div class="tour-dots" aria-hidden="true">${dots}</div>
        <div class="tour-card__btns">
          <button class="tour-btn tour-btn--quiet" data-tour="skip">Skip</button>
          ${i > 0 ? '<button class="tour-btn" data-tour="back">Back</button>' : ''}
          <button class="tour-btn tour-btn--go" data-tour="next">${step.last ? 'Done' : 'Next'}</button>
        </div>
      </div>`;
  },

  // ---------------- the clock ----------------

  /**
   * Auto-advance, drawn as a filling bar so the countdown is visible
   * rather than a surprise. Pauses while the pointer is over the card;
   * off entirely when the visitor has asked for reduced motion, since
   * things moving on their own is the thing they asked not to have.
   */
  _startClock(ms, done) {
    const bar = this.card.querySelector('[data-tour="bar"]');
    if (reduceMotion()) { if (bar) bar.style.width = '0%'; return; }
    let elapsed = 0;
    let last = performance.now();
    const frame = (now) => {
      if (!this.running) return;
      // Clamped: rAF stops in a hidden tab, so the first frame after
      // the visitor comes back reports the whole absence as one delta
      // and would skip the step they were reading.
      const dt = Math.min(100, now - last);
      last = now;
      if (!this.paused) elapsed += dt;
      if (bar) bar.style.width = Math.min(100, (elapsed / ms) * 100) + '%';
      if (elapsed >= ms) { done(); return; }
      this._tick = requestAnimationFrame(frame);
    };
    this._tick = requestAnimationFrame(frame);
  },

  // ---------------- geometry ----------------

  /** Move the spotlight onto the target and put the card beside it. */
  _place() {
    const spot = this.spot;
    const card = this.card;
    const vw = innerWidth, vh = innerHeight;
    const M = 14;             // breathing room around the highlight
    const GAP = 18;           // between highlight and card

    if (!this._target) {
      // No target: dim everything, centre the card.
      this.root.classList.add('is-centred');
      spot.style.opacity = '0';
      card.style.left = card.style.top = '50%';
      card.style.transform = 'translate(-50%, -50%)';
      return;
    }
    this.root.classList.remove('is-centred');
    spot.style.opacity = '1';

    const r = this._target.getBoundingClientRect();
    const x = r.left - M, y = r.top - M, w = r.width + M * 2, h = r.height + M * 2;
    spot.style.left = x + 'px';
    spot.style.top = y + 'px';
    spot.style.width = w + 'px';
    spot.style.height = h + 'px';
    // Follow the control's own corner radius so the highlight reads as
    // that control lit up, not a rectangle dropped over it.
    const rad = parseFloat(getComputedStyle(this._target).borderRadius) || 12;
    spot.style.borderRadius = Math.min(rad + M, 999) + 'px';

    // Measure the card, then choose the side with room for it.
    card.style.transform = 'none';
    const cw = Math.min(card.offsetWidth, vw - 24);
    const ch = card.offsetHeight;
    const below = y + h + GAP;
    const above = y - GAP - ch;
    let top = (below + ch <= vh - 12) ? below
            : (above >= 12) ? above
            : Math.max(12, Math.min(vh - ch - 12, y + h + GAP));
    let left = r.left + r.width / 2 - cw / 2;
    left = Math.max(12, Math.min(vw - cw - 12, left));
    card.style.left = left + 'px';
    card.style.top = top + 'px';
  },

  // ---------------- scaffolding ----------------

  _build() {
    const root = document.createElement('div');
    root.className = 'tour';
    root.id = 'tourRoot';
    root.innerHTML = `
      <div class="tour__veil" data-tour="veil"></div>
      <div class="tour__spot" data-tour="spot"></div>
      <div class="tour-card" role="dialog" aria-modal="true"
           aria-labelledby="tourTitle" tabindex="-1"></div>`;
    document.body.appendChild(root);
    this.root = root;
    this.spot = root.querySelector('[data-tour="spot"]');
    this.card = root.querySelector('.tour-card');

    // Clicking the dimmed area moves on — a forgiving target for
    // anyone who doesn't reach for the button.
    this._onVeil = () => this._act(() => this.next());
    root.querySelector('[data-tour="veil"]').addEventListener('click', this._onVeil);

    this._onEnter = () => { this.paused = true; this.root?.classList.add('is-paused'); };
    this._onLeave = () => { this.paused = false; this.root?.classList.remove('is-paused'); };
    this.card.addEventListener('mouseenter', this._onEnter);
    this.card.addEventListener('mouseleave', this._onLeave);
    this.card.addEventListener('focusin', this._onEnter);

    this._onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.end(); }
      else if (e.key === 'ArrowRight') this._act(() => this.next());
      else if (e.key === 'ArrowLeft') this._act(() => this.back());
    };
    addEventListener('keydown', this._onKey);

    this._onResize = () => this._place();
    addEventListener('resize', this._onResize);
    addEventListener('scroll', this._onResize, true);
  },

  _unbind() {
    removeEventListener('keydown', this._onKey);
    removeEventListener('resize', this._onResize);
    removeEventListener('scroll', this._onResize, true);
  },
};

export default Tour;
