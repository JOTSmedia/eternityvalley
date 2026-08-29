// ============================================================================
// BETH ELISE — PSYCHIC MEDIUM
// AAA Grade Animation Engine: Tinkerbell & Firefly Pixies with Pixie Dust Trails
// 60FPS HTML5 Canvas + High-Frequency Meteors, Auroras, Firefly Swarms & Interactive Parallax
// ============================================================================

(function() {
  'use strict';

  /* Respect the OS "reduce motion" setting.

     This page runs five independent requestAnimationFrame loops — the hero
     sky, the footer sky, the crystal ball, the assistant avatar and the
     sacred eye — plus a scripted fairy sequence that walks, dives and lands.
     For a visitor with a vestibular disorder that is a lot of unrequested
     movement, and on a phone it is a constant CPU draw.

     With the setting on, each loop paints one frame and stops, so the artwork
     is all still there, just still. The fairy sequence is skipped rather than
     frozen: it is what activates the aEYE assistant at the end, so freezing
     it would leave the assistant unreachable for 48 seconds. */
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduceMotion = () => motionQuery.matches;

  function initMainApp() {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

    // Preloader is handled directly by inline script in index.html (flying orb to homebase)

    // ─── NAVIGATION ──────────────────────────────────
    const nav = document.querySelector('.nav');
    const hamburger = document.querySelector('.nav__hamburger');
    const mobileMenu = document.querySelector('.nav__mobile');

    window.addEventListener('scroll', () => {
      nav?.classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });

    hamburger?.addEventListener('click', () => {
      const open = hamburger.classList.toggle('active');
      mobileMenu?.classList.toggle('open', open);
      hamburger.setAttribute('aria-expanded', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });

    document.querySelectorAll('.nav__mobile a, .nav__link, .nav__cta').forEach(link => {
      link.addEventListener('click', () => {
        if (typeof window.triggerFairyInterrupted === 'function') {
          window.triggerFairyInterrupted();
        }
        hamburger?.classList.remove('active');
        mobileMenu?.classList.remove('open');
        document.body.style.overflow = '';
      });
    });

    // ═══════════════════════════════════════════════
    // HERO ULTRA-SMOOTH 60FPS DUAL-CANVAS ENGINE
    // Canvas 1: Background Auroras, Meteors, Embers, Sky Moon & Pixies (BEHIND content, z-index 1)
    // Canvas 2: Foreground 2.5x Photorealistic Woman Avatar & Moonwalk (IN FRONT of logo, z-index 4)
    // ═══════════════════════════════════════════════
    const heroBgCanvas = document.getElementById('hero-celestial-canvas');
    const heroAvatarCanvas = document.getElementById('hero-avatar-canvas');

    if (heroBgCanvas && heroAvatarCanvas) {
      const bgCtx = heroBgCanvas.getContext('2d', { alpha: true });
      const aCtx = heroAvatarCanvas.getContext('2d', { alpha: true });
      let w, h;
      let isHeroVisible = true;
      let heroAnimId = null;
      const mouse = { x: -1000, y: -1000, vx: 0, vy: 0, lastX: 0, lastY: 0 };
      const pixies = [];
      const meteors = [];
      const embers = [];
      let lastMeteorTime = performance.now();
      let lastBolideTime = performance.now();
      let lastMouseMoveTime = 0;

      // ─── HIGH-PERFORMANCE CACHED TARGET COORDINATES (Zero 60FPS Layout Thrashing) ───
      const cachedHeroTargets = {
        logoMoonX: 0,
        logoMoonY: 0,
        badgeRightX: 0,
        badgeLeftX: 0,
        badgeCenterX: 0,
        badgeTopY: 0,
        bookBtnX: 0,
        bookBtnY: 0,
        aeyeX: 0,
        aeyeY: 0,
        lastUpdate: 0
      };

      function updateHeroLayoutTargets(force = false) {
        const n = performance.now();
        if (!force && (n - cachedHeroTargets.lastUpdate < 300)) return;
        cachedHeroTargets.lastUpdate = n;

        const cw = w || window.innerWidth;
        const ch = h || window.innerHeight;

        let logoMoonX = cw * 0.5;
        let logoMoonY = ch * 0.33;
        let badgeRightX = cw * 0.70;
        let badgeLeftX = cw * 0.30;
        let badgeCenterX = cw * 0.50;
        let badgeTopY = Math.max(50, ch * 0.16);
        let bookBtnX = cw * 0.5;
        let bookBtnY = ch * 0.72;
        let aeyeX = Math.max(40, cw - 60);
        let aeyeY = Math.max(40, ch - 60);

        if (heroAvatarCanvas) {
          const cRect = heroAvatarCanvas.getBoundingClientRect();
          
          const heroLogo = document.querySelector('.hero__logo-img');
          if (heroLogo) {
            const rect = heroLogo.getBoundingClientRect();
            if (rect.width > 0) {
              logoMoonX = rect.left + rect.width * 0.5 - cRect.left;
              logoMoonY = rect.top - cRect.top + (rect.height * 0.095);
            }
          }

          const pillBadge = document.querySelector('.hero__tagline-pill');
          if (pillBadge) {
            const bRect = pillBadge.getBoundingClientRect();
            if (bRect.width > 0 && bRect.height > 0) {
              badgeCenterX = bRect.left + bRect.width * 0.5 - cRect.left;
              const marginPad = Math.min(24, bRect.width * 0.12);
              badgeRightX = bRect.left + bRect.width - marginPad - cRect.left;
              badgeLeftX = bRect.left + marginPad - cRect.left;
              badgeTopY = bRect.top - cRect.top - 10;
            }
          }

          const bookBtn = document.querySelector('.hero__cta-group .btn-primary');
          if (bookBtn) {
            const bbRect = bookBtn.getBoundingClientRect();
            if (bbRect.width > 0) {
              bookBtnX = bbRect.left + bbRect.width * 0.5 - cRect.left;
              bookBtnY = bbRect.top - cRect.top - 8;
            }
          }

          const aeyeWidget = document.getElementById('assistant-avatar-btn');
          if (aeyeWidget) {
            const aeRect = aeyeWidget.getBoundingClientRect();
            if (aeRect.width > 0) {
              const rawAeX = aeRect.left + aeRect.width * 0.5 - cRect.left;
              const rawAeY = aeRect.top + aeRect.height * 0.5 - cRect.top;
              aeyeX = Math.max(36, Math.min(cw - 36, rawAeX));
              aeyeY = Math.max(36, Math.min(ch - 36, rawAeY));
            }
          }
        }

        cachedHeroTargets.logoMoonX = logoMoonX;
        cachedHeroTargets.logoMoonY = logoMoonY;
        cachedHeroTargets.badgeRightX = badgeRightX;
        cachedHeroTargets.badgeLeftX = badgeLeftX;
        cachedHeroTargets.badgeCenterX = badgeCenterX;
        cachedHeroTargets.badgeTopY = badgeTopY;
        cachedHeroTargets.bookBtnX = bookBtnX;
        cachedHeroTargets.bookBtnY = bookBtnY;
        cachedHeroTargets.aeyeX = aeyeX;
        cachedHeroTargets.aeyeY = aeyeY;
      }

      function resize() {
        const heroSection = document.querySelector('.hero');
        const heroW = (heroSection && heroSection.offsetWidth) || heroBgCanvas.offsetWidth || window.innerWidth;
        const heroH = (heroSection && heroSection.offsetHeight) || heroBgCanvas.offsetHeight || window.innerHeight;
        heroBgCanvas.width = heroW;
        heroBgCanvas.height = heroH;

        w = heroAvatarCanvas.width = window.innerWidth;
        h = heroAvatarCanvas.height = window.innerHeight;

        updateHeroLayoutTargets(true);
      }
      resize();
      window.addEventListener('resize', resize, { passive: true });
      window.addEventListener('orientationchange', () => {
        setTimeout(resize, 120);
      }, { passive: true });

      // ─── INTERRUPTED CHOREOGRAPHY HANDLER ───
      window.triggerFairyInterrupted = function() {
        if (!heroTinkerbell) return;
        const s = heroTinkerbell.state;
        if (s !== 'WAITING_FOR_PRELOADER' &&
            s !== 'ASSISTANT_ACTIVE' &&
            s !== 'ASSISTANT_DIVED' &&
            s !== 'FLYING_TO_AEYE' &&
            s !== 'BETH_HIGH_LEAP' &&
            s !== 'PERCHED_ON_AEYE' &&
            !s.startsWith('AURA_') &&
            !s.startsWith('MENU_')) {
          heroTinkerbell.isFastScrolled = true;
          heroTinkerbell.state = 'FLYING_TO_AEYE';
          heroTinkerbell.startX = heroTinkerbell.x;
          heroTinkerbell.startY = heroTinkerbell.y;
          heroTinkerbell.progress = 0;
          heroTinkerbell.isStrutting = false;
          heroTinkerbell.diveAngle = 0;
          heroTinkerbell.catwalkLettersFade = 0;
          // Dismiss any active speech bubble
          const gEl = document.getElementById('beth-greeting-bubble');
          if (gEl) { gEl.classList.remove('is-visible'); setTimeout(() => { gEl.hidden = true; }, 300); }
          if (typeof activeSpeechBubble !== 'undefined') activeSpeechBubble.visible = false;
          // Remove logo and CTA button glow
          const heroLogo = document.querySelector('.hero__logo-img');
          if (heroLogo) heroLogo.classList.remove('fairy-moon-glow');
          const heroBookBtn = document.querySelector('.hero__cta-group .btn-primary');
          if (heroBookBtn) heroBookBtn.classList.remove('fairy-moon-glow');
        }
      };

      // Fast-scroll interrupt: if user scrolls during choreography, trigger interrupted choreography
      window.addEventListener('scroll', () => {
        if (window.triggerFairyInterrupted) window.triggerFairyInterrupted();
      }, { passive: true });

      // Pause rendering loop when hero is out of viewport (saves 60% GPU/CPU on scroll)
      if ('IntersectionObserver' in window) {
        const heroObserver = new IntersectionObserver((entries) => {
          isHeroVisible = entries[0].isIntersecting;
          if (isHeroVisible && !heroAnimId) {
            heroAnimId = requestAnimationFrame(render);
          }
        }, { threshold: 0.05 });
        heroObserver.observe(heroBgCanvas);
      }

      // Track mouse coordinates for pixie attraction & stardust + Tree Portal Interaction
      window.addEventListener('mousemove', (e) => {
        const now = performance.now();
        const dx = e.clientX - mouse.lastX;
        const dy = e.clientY - mouse.lastY;
        mouse.vx = dx * 0.3 + mouse.vx * 0.7;
        mouse.vy = dy * 0.3 + mouse.vy * 0.7;
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouse.lastX = e.clientX;
        mouse.lastY = e.clientY;

        // Tree Portal Hover Detection
        if (treePortal && treePortal.state === 'OPEN') {
          const pdx = e.clientX - treePortal.x;
          const pdy = e.clientY - treePortal.y;
          treePortal.isHovered = (Math.hypot(pdx, pdy) <= treePortal.r);
          if (treePortal.isHovered) {
            document.body.style.cursor = 'pointer';
          } else if (document.body.style.cursor === 'pointer') {
            document.body.style.cursor = '';
          }
        } else if (treePortal) {
          if (treePortal.isHovered) {
            treePortal.isHovered = false;
            if (document.body.style.cursor === 'pointer') document.body.style.cursor = '';
          }
        }

        if (now - lastMouseMoveTime > 80) {
          lastMouseMoveTime = now;
          if (pixieDust.length < 40) {
            emitPixieDust(e.clientX, e.clientY, 2, ['#FFD700', '#00FFC8', '#00E5D4', '#FFF']);
          }
        }
      }, { passive: true });

      // Tree Portal Click Navigation
      window.addEventListener('click', (e) => {
        if (treePortal && treePortal.state === 'OPEN' && treePortal.isHovered) {
          const item = portalHighlights[treePortal.highlightIdx];
          if (item && item.href) {
            if (window.celestialAudio) window.celestialAudio.playChime(963, 1.5);
            emitPixieDust(treePortal.x, treePortal.y, 60, ['#FFD700', '#FF9E00', '#00FFC8', '#FFFFFF']);

            if (item.href === '#sound-sanctuary') {
              const soundBtn = document.getElementById('nav-sound-btn');
              if (soundBtn) soundBtn.click();
            } else if (item.href === '#aura-scanner' || item.href === '#interactive-aura') {
              const aSec = document.getElementById('aura-scanner');
              if (aSec) aSec.scrollIntoView({ behavior: 'smooth' });
            } else {
              const targetEl = document.querySelector(item.href);
              if (targetEl) {
                targetEl.scrollIntoView({ behavior: 'smooth' });
              } else {
                window.location.hash = item.href;
              }
            }
          }
        }
      });

      // Touch Support for Tree Portal Mobile Tap
      window.addEventListener('touchend', (e) => {
        if (!e.changedTouches || e.changedTouches.length === 0) return;
        const t = e.changedTouches[0];
        if (treePortal && treePortal.state === 'OPEN') {
          const pdx = t.clientX - treePortal.x;
          const pdy = t.clientY - treePortal.y;
          if (Math.hypot(pdx, pdy) <= treePortal.r * 1.35) {
            const item = portalHighlights[treePortal.highlightIdx];
            if (item && item.href) {
              if (window.celestialAudio) window.celestialAudio.playChime(963, 1.5);
              emitPixieDust(treePortal.x, treePortal.y, 60, ['#FFD700', '#FF9E00', '#00FFC8', '#FFFFFF']);

              if (item.href === '#sound-sanctuary') {
                const soundBtn = document.getElementById('open-sound-modal-btn') || document.getElementById('open-sound-modal-mobile-btn');
                if (soundBtn) soundBtn.click();
              } else if (item.href === '#aura-scanner' || item.href === '#interactive-aura') {
                const aSec = document.getElementById('aura-scanner');
                if (aSec) aSec.scrollIntoView({ behavior: 'smooth' });
              } else {
                const targetEl = document.querySelector(item.href);
                if (targetEl) {
                  targetEl.scrollIntoView({ behavior: 'smooth' });
                } else {
                  window.location.hash = item.href;
                }
              }
            }
          }
        }
      }, { passive: true });

      window.addEventListener('mouseleave', () => {
        mouse.x = -1000;
        mouse.y = -1000;
        if (treePortal) treePortal.isHovered = false;
        if (document.body.style.cursor === 'pointer') document.body.style.cursor = '';
      });

      // ─── 1. BACKGROUND TINKERBELL & FIREFLY PIXIE PALETTES ───────
      const pixiePalettes = [
        { core: '#FFFFFF', firefly: '#FFD700', aura: 'rgba(255, 215, 0, 0.85)', wing: 'rgba(255, 245, 180, 0.85)', dust: '#FFD700' },
        { core: '#FFFFFF', firefly: '#00FFC8', aura: 'rgba(0, 255, 200, 0.85)', wing: 'rgba(122, 255, 227, 0.85)', dust: '#00FFC8' },
        { core: '#FFFFFF', firefly: '#00E5D4', aura: 'rgba(0, 229, 212, 0.85)', wing: 'rgba(163, 255, 248, 0.85)', dust: '#38FFF0' },
        { core: '#FFFFFF', firefly: '#C77DFF', aura: 'rgba(199, 125, 255, 0.85)', wing: 'rgba(224, 170, 255, 0.85)', dust: '#E0AAFF' }
      ];

      // Spawn 14 Gentle Background Fairies (Rendered BEHIND logo & hero content)
      for (let i = 0; i < 14; i++) {
        const pal = pixiePalettes[i % pixiePalettes.length];
        pixies.push({
          x: Math.random() * (w || window.innerWidth),
          y: Math.random() * ((h || window.innerHeight) * 0.85),
          z: 0.5 + Math.random() * 0.5,
          vx: (Math.random() - 0.5) * 0.9,
          vy: (Math.random() - 0.5) * 0.7,
          targetX: Math.random() * (w || window.innerWidth),
          targetY: Math.random() * ((h || window.innerHeight) * 0.8),
          hoverTimer: Math.random() * 50,
          changeTimer: Math.random() * 120,
          wingPhase: Math.random() * Math.PI * 2,
          wingSpeed: 0.22 + Math.random() * 0.12, // Gentle wing flutter
          fireflyPulse: Math.random() * Math.PI * 2,
          fireflySpeed: 0.02 + Math.random() * 0.03,
          size: 8 + Math.random() * 8,
          palette: pal
        });
      }

      // ─── 1B. WARM BIOLUMINESCENT GLOWING FIREFLIES ──────────────
      const fireflies = [];
      for (let i = 0; i < 24; i++) {
        fireflies.push({
          x: Math.random() * (w || window.innerWidth),
          y: Math.random() * (h || window.innerHeight),
          vx: (Math.random() - 0.5) * 0.45,
          vy: (Math.random() - 0.5) * 0.35,
          pulseSpeed: 0.002 + Math.random() * 0.0025,
          pulsePhase: Math.random() * Math.PI * 2,
          seed: Math.random() * 100,
          size: 1.8 + Math.random() * 2.2,
          glowColor: ['#FFE57F', '#FFD700', '#76FF03', '#00FFC8', '#FFF'][Math.floor(Math.random() * 5)]
        });
      }

      // ─── 2. BIOLUMINESCENT RISING EMBERS (Gentle serene drift) ──────────────
      for (let i = 0; i < 35; i++) {
        embers.push({
          x: Math.random() * (w || window.innerWidth),
          y: Math.random() * (h || window.innerHeight),
          radius: 0.8 + Math.random() * 2.0,
          alpha: 0.25 + Math.random() * 0.5,
          twinkleSpeed: 0.015 + Math.random() * 0.025,
          phase: Math.random() * Math.PI * 2,
          vy: -(0.15 + Math.random() * 0.3),
          vx: (Math.random() - 0.5) * 0.15,
          color: ['#FFD700', '#00FFC8', '#00E5D4', '#C77DFF', '#FFFDF5'][Math.floor(Math.random() * 5)]
        });
      }

      // ─── HIGH-PERFORMANCE REUSABLE PARTICLE POOL (Zero GC Allocations) ───
      const MAX_PIXIE_PARTICLES = 350;
      const pixieDust = [];
      for (let i = 0; i < MAX_PIXIE_PARTICLES; i++) {
        pixieDust.push({
          active: false,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          life: 0,
          decay: 0.02,
          size: 2,
          color: '#FFD700',
          isDiamond: false
        });
      }

      function emitPixieDust(x, y, count = 2, colors = ['#FFD700', '#00FFC8', '#FFF']) {
        let spawned = 0;
        for (let i = 0; i < MAX_PIXIE_PARTICLES && spawned < count; i++) {
          const p = pixieDust[i];
          if (!p.active) {
            p.active = true;
            p.x = x + (Math.random() - 0.5) * 10;
            p.y = y + (Math.random() - 0.5) * 10;
            p.vx = (Math.random() - 0.5) * 1.4;
            p.vy = (Math.random() - 0.5) * 1.4 - 0.3;
            p.life = 1.0;
            p.decay = 0.020 + Math.random() * 0.025;
            p.size = 1.8 + Math.random() * 2.5;
            p.color = colors[Math.floor(Math.random() * colors.length)];
            p.isDiamond = Math.random() > 0.5;
            spawned++;
          }
        }
      }

      function triggerMeteor(isBolide = false) {
        if (meteors.length >= 3) return;
        const startX = Math.random() * (w * 0.75);
        const startY = Math.random() * (h * 0.35);
        const angle = (24 + Math.random() * 28) * Math.PI / 180;
        const speed = isBolide ? (8 + Math.random() * 4) : (10 + Math.random() * 5); // Gentle serene speed

        meteors.push({
          x: startX,
          y: startY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          length: isBolide ? (180 + Math.random() * 100) : (120 + Math.random() * 80),
          life: 1.0,
          decay: isBolide ? 0.012 : 0.018,
          isBolide: isBolide,
          color: isBolide ? '#FFD700' : ['#00FFC8', '#00E5D4', '#FFFFFF', '#38FFF0'][Math.floor(Math.random() * 4)]
        });
      }

      // ─── 0. HERO BACKGROUND SENSIBLE LIVING LIGHT NODES ───
      // Maps directly to the visual light sources in hero-bg.webp (1920x1080)
      const gladeLights = [
        // Celestial Moon & Pool Reflection
        { u: 0.550, v: 0.185, r: 85, color: [220, 245, 255], speed: 0.0016, phase: 0, minA: 0.22, maxA: 0.55 },
        { u: 0.535, v: 0.690, r: 65, color: [180, 245, 255], speed: 0.0022, phase: 1.2, minA: 0.18, maxA: 0.50 },

        // Giant Radiant Butterflies / Fairy Wings (Background Ambience)
        { u: 0.155, v: 0.670, r: 80, color: [0, 255, 200], speed: 0.0028, phase: 0.5, minA: 0.25, maxA: 0.65 },
        { u: 0.915, v: 0.660, r: 80, color: [140, 190, 255], speed: 0.0026, phase: 2.1, minA: 0.25, maxA: 0.65 },
        { u: 0.385, v: 0.625, r: 60, color: [0, 229, 212], speed: 0.0031, phase: 3.4, minA: 0.22, maxA: 0.58 },
        { u: 0.575, v: 0.475, r: 60, color: [0, 255, 220], speed: 0.0033, phase: 4.2, minA: 0.22, maxA: 0.58 },
        { u: 0.720, v: 0.505, r: 55, color: [0, 229, 212], speed: 0.0029, phase: 1.8, minA: 0.18, maxA: 0.52 },

        // Right Ancient Tree Fairy Light Strings
        { u: 0.635, v: 0.380, r: 45, color: [255, 220, 120], speed: 0.0040, phase: 0.8, minA: 0.25, maxA: 0.70 },
        { u: 0.655, v: 0.490, r: 45, color: [255, 215, 80], speed: 0.0044, phase: 2.7, minA: 0.25, maxA: 0.70 },
        { u: 0.640, v: 0.540, r: 45, color: [255, 230, 140], speed: 0.0038, phase: 5.1, minA: 0.25, maxA: 0.70 },

        // Left Arch Fairy Light Strings
        { u: 0.230, v: 0.320, r: 40, color: [255, 235, 150], speed: 0.0042, phase: 1.5, minA: 0.25, maxA: 0.68 },
        { u: 0.290, v: 0.270, r: 45, color: [255, 225, 120], speed: 0.0037, phase: 3.9, minA: 0.25, maxA: 0.68 },
        { u: 0.355, v: 0.330, r: 40, color: [255, 215, 100], speed: 0.0046, phase: 0.3, minA: 0.25, maxA: 0.68 },

        // Bioluminescent Mushrooms (Bottom Left, Center Bank, Bottom Right)
        { u: 0.245, v: 0.880, r: 55, color: [0, 255, 200], speed: 0.0021, phase: 2.3, minA: 0.25, maxA: 0.60 },
        { u: 0.185, v: 0.840, r: 50, color: [180, 255, 220], speed: 0.0025, phase: 4.7, minA: 0.22, maxA: 0.55 },
        { u: 0.680, v: 0.590, r: 45, color: [255, 230, 160], speed: 0.0027, phase: 1.1, minA: 0.22, maxA: 0.58 },
        { u: 0.850, v: 0.820, r: 55, color: [0, 229, 212], speed: 0.0024, phase: 3.6, minA: 0.25, maxA: 0.60 },
        { u: 0.930, v: 0.840, r: 60, color: [120, 230, 255], speed: 0.0023, phase: 5.4, minA: 0.25, maxA: 0.60 },
        { u: 0.965, v: 0.800, r: 50, color: [0, 255, 180], speed: 0.0028, phase: 0.9, minA: 0.22, maxA: 0.58 },

        // Central Glade Stardust Fountain
        { u: 0.520, v: 0.530, r: 70, color: [0, 255, 235], speed: 0.0035, phase: 2.0, minA: 0.20, maxA: 0.55 }
      ];

      // ─── 0b. TREE-WRAPPED FAIRY LIGHT GARLANDS (Individual Micro-Twinkle Nodes) ───
      const treeGarlandLights = [
        // Left Canopy Arch
        { u: 0.240, v: 0.340, r: 22, color: [255, 220, 120], speed: 0.0055, phase: 0.2 },
        { u: 0.265, v: 0.300, r: 20, color: [0, 230, 210], speed: 0.0065, phase: 4.4 },
        { u: 0.290, v: 0.270, r: 24, color: [255, 245, 180], speed: 0.0050, phase: 0.9 },
        { u: 0.320, v: 0.250, r: 20, color: [210, 140, 255], speed: 0.0060, phase: 1.8 },
        { u: 0.355, v: 0.280, r: 22, color: [255, 220, 100], speed: 0.0052, phase: 3.1 },
        { u: 0.375, v: 0.320, r: 19, color: [0, 255, 220], speed: 0.0068, phase: 4.9 },
        { u: 0.215, v: 0.520, r: 18, color: [255, 230, 130], speed: 0.0045, phase: 2.8 },
        { u: 0.175, v: 0.560, r: 20, color: [255, 210, 80], speed: 0.0059, phase: 0.5 },
        { u: 0.150, v: 0.610, r: 22, color: [0, 255, 200], speed: 0.0063, phase: 1.6 },

        // Right Ancient Tree Spiral (Wrapped up main trunk and sprawling branches)
        { u: 0.615, v: 0.620, r: 22, color: [255, 230, 120], speed: 0.0052, phase: 0.4 },
        { u: 0.635, v: 0.570, r: 24, color: [0, 255, 215], speed: 0.0066, phase: 1.7 },
        { u: 0.655, v: 0.520, r: 22, color: [255, 245, 160], speed: 0.0047, phase: 2.9 },
        { u: 0.640, v: 0.460, r: 25, color: [255, 215, 80], speed: 0.0061, phase: 4.1 },
        { u: 0.625, v: 0.410, r: 20, color: [210, 130, 255], speed: 0.0054, phase: 0.7 },
        { u: 0.645, v: 0.360, r: 24, color: [255, 235, 140], speed: 0.0064, phase: 2.0 },
        { u: 0.670, v: 0.320, r: 22, color: [0, 255, 230], speed: 0.0049, phase: 3.5 },
        { u: 0.700, v: 0.370, r: 20, color: [255, 220, 110], speed: 0.0058, phase: 4.8 },
        { u: 0.725, v: 0.420, r: 22, color: [255, 240, 170], speed: 0.0063, phase: 1.3 },
        { u: 0.710, v: 0.480, r: 20, color: [0, 255, 200], speed: 0.0051, phase: 2.6 },
        { u: 0.685, v: 0.530, r: 22, color: [255, 210, 90], speed: 0.0067, phase: 3.9 },
        { u: 0.665, v: 0.580, r: 20, color: [220, 150, 255], speed: 0.0046, phase: 5.2 },
        { u: 0.695, v: 0.640, r: 22, color: [255, 235, 130], speed: 0.0057, phase: 0.8 },
        { u: 0.730, v: 0.590, r: 20, color: [0, 255, 215], speed: 0.0065, phase: 2.2 },
        { u: 0.760, v: 0.540, r: 18, color: [255, 225, 100], speed: 0.0053, phase: 3.6 }
      ];

      // ─── 0c. STATIONARY LIVING BUTTERFLIES (Perched in place, randomly fluttering wings) ───
      const perchedButterflies = [
        { u: 0.155, v: 0.670, scale: 0.95, baseAngle: -0.22, color1: '#00FFC8', color2: '#9D4EDD', nextFlutter: 2000, isFluttering: false, flutterStart: 0, flutterDuration: 700, wingSpan: 24 },
        { u: 0.915, v: 0.660, scale: 0.90, baseAngle: 0.28, color1: '#FFD700', color2: '#00FFC8', nextFlutter: 3200, isFluttering: false, flutterStart: 0, flutterDuration: 850, wingSpan: 22 },
        { u: 0.385, v: 0.625, scale: 0.75, baseAngle: -0.15, color1: '#C77DFF', color2: '#00FFC8', nextFlutter: 1500, isFluttering: false, flutterStart: 0, flutterDuration: 650, wingSpan: 18 },
        { u: 0.575, v: 0.475, scale: 0.80, baseAngle: 0.10, color1: '#00E5D4', color2: '#FFE57F', nextFlutter: 4100, isFluttering: false, flutterStart: 0, flutterDuration: 900, wingSpan: 19 },
        { u: 0.720, v: 0.505, scale: 0.70, baseAngle: -0.30, color1: '#FF80DF', color2: '#C77DFF', nextFlutter: 2800, isFluttering: false, flutterStart: 0, flutterDuration: 600, wingSpan: 17 },
        { u: 0.285, v: 0.450, scale: 0.75, baseAngle: 0.35, color1: '#00FFC8', color2: '#FFD700', nextFlutter: 3700, isFluttering: false, flutterStart: 0, flutterDuration: 750, wingSpan: 18 },
        { u: 0.810, v: 0.580, scale: 0.85, baseAngle: -0.18, color1: '#FFE57F', color2: '#9D4EDD', nextFlutter: 4800, isFluttering: false, flutterStart: 0, flutterDuration: 800, wingSpan: 20 }
      ];

      function renderPerchedButterflies(ctx, bgOffsetX, bgOffsetY, bgS, now) {
        for (let i = 0; i < perchedButterflies.length; i++) {
          const b = perchedButterflies[i];
          const px = bgOffsetX + b.u * 1920 * bgS;
          const py = bgOffsetY + b.v * 1080 * bgS;
          const sz = b.wingSpan * bgS * b.scale;

          if (!b.isFluttering && now >= b.nextFlutter) {
            b.isFluttering = true;
            b.flutterStart = now;
            b.flutterDuration = 550 + Math.random() * 500;
          }

          let wingPhase = 0;
          if (b.isFluttering) {
            const elapsed = now - b.flutterStart;
            if (elapsed >= b.flutterDuration) {
              b.isFluttering = false;
              b.nextFlutter = now + 1800 + Math.random() * 3200;
            } else {
              const prog = elapsed / b.flutterDuration;
              const flutterFreq = 0.038;
              const envelope = Math.sin(prog * Math.PI);
              wingPhase = Math.sin(elapsed * flutterFreq * Math.PI * 2) * envelope;
            }
          }

          const restingFold = 0.65 + Math.sin(now * 0.003 + i) * 0.12;
          const wingScaleX = b.isFluttering ? Math.abs(Math.cos(wingPhase * Math.PI * 0.85)) : restingFold;
          const glowPulse = 0.75 + Math.sin(now * 0.004 + i * 1.3) * 0.25;

          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(b.baseAngle);

          // 1. Soft Luminescent Corona
          const auraGrad = ctx.createRadialGradient(0, 0, sz * 0.2, 0, 0, sz * 2.2);
          auraGrad.addColorStop(0, b.color1 + '88');
          auraGrad.addColorStop(0.5, b.color2 + '44');
          auraGrad.addColorStop(1, 'transparent');
          ctx.fillStyle = auraGrad;
          ctx.beginPath();
          ctx.arc(0, 0, sz * 2.2, 0, Math.PI * 2);
          ctx.fill();

          // 2. Wings (Left & Right foreshortened by wingScaleX)
          [-1, 1].forEach(side => {
            ctx.save();
            ctx.scale(side * wingScaleX, 1);

            // Forewing
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.bezierCurveTo(sz * 0.7, -sz * 1.3, sz * 1.6, -sz * 1.1, sz * 1.8, -sz * 0.4);
            ctx.bezierCurveTo(sz * 1.7, sz * 0.2, sz * 0.8, sz * 0.4, 0, sz * 0.2);
            ctx.closePath();

            const wingGrad = ctx.createLinearGradient(0, -sz, sz * 1.5, sz * 0.5);
            wingGrad.addColorStop(0, b.color1);
            wingGrad.addColorStop(0.6, b.color2);
            wingGrad.addColorStop(1, 'rgba(255, 255, 255, 0.85)');
            ctx.fillStyle = wingGrad;
            ctx.globalAlpha = 0.80 * glowPulse;
            ctx.shadowColor = b.color1;
            ctx.shadowBlur = 12;
            ctx.fill();

            // Hindwing
            ctx.beginPath();
            ctx.moveTo(0, sz * 0.1);
            ctx.bezierCurveTo(sz * 0.8, sz * 0.4, sz * 1.3, sz * 1.0, sz * 0.9, sz * 1.5);
            ctx.bezierCurveTo(sz * 0.5, sz * 1.7, sz * 0.2, sz * 1.2, 0, sz * 0.6);
            ctx.closePath();
            ctx.fillStyle = b.color2;
            ctx.globalAlpha = 0.70 * glowPulse;
            ctx.fill();

            // Luminescent Vein Filigree
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
            ctx.lineWidth = 1.0 * bgS;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(sz * 0.7, -sz * 0.6, sz * 1.4, -sz * 0.3);
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(sz * 0.5, -sz * 0.2, sz * 1.1, sz * 0.1);
            ctx.stroke();

            ctx.restore();
          });

          // 3. Slender Luminescent Body & Head
          ctx.fillStyle = '#FFFFFF';
          ctx.shadowColor = '#FFD700';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.ellipse(0, sz * 0.1, sz * 0.12, sz * 0.45, 0, 0, Math.PI * 2);
          ctx.fill();

          // Antennae
          ctx.strokeStyle = '#00FFC8';
          ctx.lineWidth = 1.0 * bgS;
          ctx.beginPath();
          ctx.moveTo(-sz * 0.05, -sz * 0.3);
          ctx.quadraticCurveTo(-sz * 0.3, -sz * 0.7, -sz * 0.45, -sz * 0.65);
          ctx.moveTo(sz * 0.05, -sz * 0.3);
          ctx.quadraticCurveTo(sz * 0.3, -sz * 0.7, sz * 0.45, -sz * 0.65);
          ctx.stroke();

          ctx.restore();

          if (b.isFluttering && Math.random() > 0.65) {
            emitPixieDust(px + (Math.random() - 0.5) * sz * 1.5, py + (Math.random() - 0.5) * sz, 1, [b.color1, b.color2, '#FFFFFF']);
          }
        }
      }

      // ─── 3. ULTRA-SMOOTH HARDWARE-ACCELERATED RENDER LOOP ───
      let lastRenderTime = 0;
      function render(now) {
        heroAnimId = requestAnimationFrame(render);

        const dt = (lastRenderTime > 0) ? Math.min(0.05, (now - lastRenderTime) / 1000) : 0.016;
        lastRenderTime = now;

        // Always clear the avatar layer (it's position:fixed, always visible)
        aCtx.clearRect(0, 0, w, h);

        // Decay star sparkle burst effect over time
        if (globalStarSparkle > 0) {
          globalStarSparkle *= Math.pow(0.992, dt / 0.016);
          if (globalStarSparkle < 0.01) globalStarSparkle = 0;
        }

        // ═══════════════════════════════════════════════
        // ═══════════════════════════════════════════════
        // LAYER 1 (BACKGROUND CANVAS — BEHIND CONTENT)
        // Only renders when the hero section is in the viewport
        // ═══════════════════════════════════════════════
        if (isHeroVisible) {
        const cW = heroBgCanvas.width;
        const cH = heroBgCanvas.height;
        bgCtx.clearRect(0, 0, cW, cH);

        // 0. SENSIBLE LIVING LIGHT PULSES ON HERO BACKGROUND IMAGE
        let bgS, bgOffsetX, bgOffsetY;
        const imgAspect = 1920 / 1080;
        const canvasAspect = cW / cH;

        if (canvasAspect > imgAspect) {
          bgS = cW / 1920;
          bgOffsetX = 0;
          bgOffsetY = cH - 1080 * bgS; // background-position: center bottom
        } else {
          bgS = cH / 1080;
          bgOffsetX = (cW - 1920 * bgS) * 0.5;
          bgOffsetY = cH - 1080 * bgS;
        }

        bgCtx.save();
        bgCtx.globalCompositeOperation = 'screen';

        // 1. Ambient Glade Lights (Pool, Moon, Mushrooms, Fountain)
        for (let i = 0; i < gladeLights.length; i++) {
          const l = gladeLights[i];
          const px = bgOffsetX + l.u * 1920 * bgS;
          const py = bgOffsetY + l.v * 1080 * bgS;
          const pr = l.r * 1.5 * bgS;

          const wave = 0.5 + 0.5 * Math.sin(now * l.speed + l.phase);
          const alpha = (l.minA + (l.maxA - l.minA) * wave) * 0.45;
          const [r, g, b] = l.color;

          const grad = bgCtx.createRadialGradient(px, py, 0, px, py, pr);
          grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
          grad.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, ${alpha * 0.35})`);
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

          bgCtx.fillStyle = grad;
          bgCtx.beginPath();
          bgCtx.arc(px, py, pr, 0, Math.PI * 2);
          bgCtx.fill();
        }

        // 2. Enhanced Tree-Wrapped Fairy Light Garlands (Micro-twinkles)
        for (let i = 0; i < treeGarlandLights.length; i++) {
          const l = treeGarlandLights[i];
          const px = bgOffsetX + l.u * 1920 * bgS;
          const py = bgOffsetY + l.v * 1080 * bgS;
          const pr = l.r * bgS;

          const wave = 0.5 + 0.5 * Math.sin(now * l.speed + l.phase);
          const alpha = (0.35 + 0.65 * wave) * 0.65;
          const [r, g, b] = l.color;

          // Radial glow
          const grad = bgCtx.createRadialGradient(px, py, 0, px, py, pr);
          grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
          grad.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`);
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          bgCtx.fillStyle = grad;
          bgCtx.beginPath();
          bgCtx.arc(px, py, pr, 0, Math.PI * 2);
          bgCtx.fill();

          // Intense core twinkle glint
          if (wave > 0.75) {
            const flare = (wave - 0.75) / 0.25;
            bgCtx.fillStyle = `rgba(255, 255, 255, ${flare * 0.85})`;
            bgCtx.beginPath();
            bgCtx.arc(px, py, 1.8 * bgS, 0, Math.PI * 2);
            bgCtx.fill();

            // 4-point cross-glint
            bgCtx.strokeStyle = `rgba(255, 255, 255, ${flare * 0.65})`;
            bgCtx.lineWidth = 0.9 * bgS;
            const glintL = 5.0 * bgS * flare;
            bgCtx.beginPath();
            bgCtx.moveTo(px - glintL, py); bgCtx.lineTo(px + glintL, py);
            bgCtx.moveTo(px, py - glintL); bgCtx.lineTo(px, py + glintL);
            bgCtx.stroke();
          }
        }
        bgCtx.restore();

        // 3. Stationary Living Butterflies (Perched, randomly fluttering wings)
        renderPerchedButterflies(bgCtx, bgOffsetX, bgOffsetY, bgS, now);

        // A. Dynamic Glowing Ethereal Sky Aura (Seamless, No hard cuts or diagonal edges)
        bgCtx.save();
        bgCtx.globalCompositeOperation = 'screen';
        const auraX = cW * 0.5;
        const auraY = Math.max(60, cH * 0.12);
        const auraRadius = Math.max(cW * 0.75, cH * 0.55);
        const skyGlow = bgCtx.createRadialGradient(auraX, auraY, 0, auraX, auraY, auraRadius);
        const skyPulse = 0.5 + 0.5 * Math.sin(now * 0.0012);
        skyGlow.addColorStop(0, `rgba(0, 229, 212, ${0.07 + 0.03 * skyPulse})`);
        skyGlow.addColorStop(0.35, `rgba(157, 78, 221, ${0.05 + 0.02 * skyPulse})`);
        skyGlow.addColorStop(0.7, `rgba(0, 255, 200, ${0.02 + 0.01 * skyPulse})`);
        skyGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        bgCtx.fillStyle = skyGlow;
        bgCtx.fillRect(0, 0, cW, cH);
        bgCtx.restore();

        // B. Gentle Meteors (Occasional shooting stars every 4-8 seconds)
        if (now - lastMeteorTime > 4500 + Math.random() * 3500) {
          triggerMeteor(false);
          lastMeteorTime = now;
        }

        if (now - lastBolideTime > 12000 + Math.random() * 6000) {
          triggerMeteor(true);
          lastBolideTime = now;
        }

        for (let i = meteors.length - 1; i >= 0; i--) {
          const m = meteors[i];
          m.x += m.vx;
          m.y += m.vy;
          m.life -= m.decay;

          if (m.life <= 0 || m.x > cW + 120 || m.y > cH + 120) {
            meteors.splice(i, 1);
            continue;
          }

          const tailX = m.x - (m.vx / 14) * m.length;
          const tailY = m.y - (m.vy / 14) * m.length;

          const grad = bgCtx.createLinearGradient(m.x, m.y, tailX, tailY);
          grad.addColorStop(0, '#FFFFFF');
          grad.addColorStop(0.25, m.color);
          grad.addColorStop(0.7, m.isBolide ? 'rgba(255, 69, 0, 0.4)' : 'rgba(0, 229, 212, 0.25)');
          grad.addColorStop(1, 'transparent');

          bgCtx.save();
          bgCtx.beginPath();
          bgCtx.moveTo(m.x, m.y);
          bgCtx.lineTo(tailX, tailY);
          bgCtx.strokeStyle = grad;
          bgCtx.lineWidth = (m.isBolide ? 3.2 : 2.0) * m.life;
          bgCtx.globalAlpha = m.life;
          bgCtx.stroke();

          // Core Head Glow
          bgCtx.beginPath();
          bgCtx.arc(m.x, m.y, (m.isBolide ? 3.0 : 2.0) * m.life, 0, Math.PI * 2);
          bgCtx.fillStyle = '#FFFFFF';
          bgCtx.fill();
          bgCtx.restore();

          if (Math.random() > 0.6) {
            emitPixieDust(m.x, m.y, 1, [m.color, '#FFF']);
          }
        }

        // C. Render Pixie Dust Particles (High-Performance Object Pool)
        for (let i = 0; i < MAX_PIXIE_PARTICLES; i++) {
          const p = pixieDust[i];
          if (!p.active) continue;
          p.x += p.vx;
          p.y += p.vy;
          p.life -= p.decay;

          if (p.life <= 0) {
            p.active = false;
            continue;
          }

          bgCtx.save();
          bgCtx.fillStyle = p.color;
          bgCtx.globalAlpha = p.life * 0.88;

          if (p.isDiamond) {
            const s = p.size * p.life;
            bgCtx.beginPath();
            bgCtx.moveTo(p.x, p.y - s * 1.4);
            bgCtx.lineTo(p.x + s * 0.5, p.y);
            bgCtx.lineTo(p.x, p.y + s * 1.4);
            bgCtx.lineTo(p.x - s * 0.5, p.y);
            bgCtx.closePath();
            bgCtx.fill();
          } else {
            bgCtx.beginPath();
            bgCtx.arc(p.x, p.y, p.size * p.life * 0.55, 0, Math.PI * 2);
            bgCtx.fill();
          }
          bgCtx.restore();
        }

        // D. Render Rising Embers (Serene gentle drift)
        embers.forEach(e => {
          e.x += e.vx;
          e.y += e.vy;
          e.phase += e.twinkleSpeed;

          if (e.y < -20) e.y = h + 20;
          if (e.x < -20) e.x = w + 20;
          if (e.x > w + 20) e.x = -20;

          const a = e.alpha * (0.6 + Math.sin(e.phase) * 0.4);

          bgCtx.save();
          const g = bgCtx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.radius * 2.8);
          g.addColorStop(0, e.color);
          g.addColorStop(1, 'transparent');
          bgCtx.fillStyle = g;
          bgCtx.globalAlpha = a;
          bgCtx.beginPath();
          bgCtx.arc(e.x, e.y, e.radius * 2.8, 0, Math.PI * 2);
          bgCtx.fill();

          if (globalStarSparkle > 0.05) {
            bgCtx.fillStyle = '#FFFFFF';
            bgCtx.globalAlpha = a * globalStarSparkle;
            const spr = e.radius * (1.4 + Math.sin(e.phase * 3) * 0.8) * (1 + globalStarSparkle * 1.4);
            bgCtx.beginPath();
            bgCtx.moveTo(e.x, e.y - spr * 2.0);
            bgCtx.lineTo(e.x + spr * 0.25, e.y - spr * 0.25);
            bgCtx.lineTo(e.x + spr * 2.0, e.y);
            bgCtx.lineTo(e.x + spr * 0.25, e.y + spr * 0.25);
            bgCtx.lineTo(e.x, e.y + spr * 2.0);
            bgCtx.lineTo(e.x - spr * 0.25, e.y + spr * 0.25);
            bgCtx.lineTo(e.x - spr * 2.0, e.y);
            bgCtx.lineTo(e.x - spr * 0.25, e.y - spr * 0.25);
            bgCtx.closePath();
            bgCtx.fill();
          }
          bgCtx.restore();
        });

        // D2. Render Warm Glowing Bioluminescent Fireflies
        fireflies.forEach(f => {
          f.x += f.vx + Math.sin(now * 0.0012 + f.seed) * 0.35;
          f.y += f.vy + Math.cos(now * 0.0014 + f.seed) * 0.25;

          if (f.x < -20) f.x = w + 20;
          if (f.x > w + 20) f.x = -20;
          if (f.y < -20) f.y = h + 20;
          if (f.y > h + 20) f.y = -20;

          const glow = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now * f.pulseSpeed + f.pulsePhase));
          bgCtx.save();
          // Soft ambient firefly aura
          const fg = bgCtx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.size * 5.5 * glow);
          fg.addColorStop(0, '#FFFFFF');
          fg.addColorStop(0.3, f.glowColor);
          fg.addColorStop(1, 'transparent');
          bgCtx.fillStyle = fg;
          bgCtx.globalAlpha = glow * 0.85;
          bgCtx.beginPath();
          bgCtx.arc(f.x, f.y, f.size * 5.5 * glow, 0, Math.PI * 2);
          bgCtx.fill();

          // Bioluminescent Core Bead
          bgCtx.fillStyle = '#FFFFFF';
          bgCtx.globalAlpha = glow;
          bgCtx.beginPath();
          bgCtx.arc(f.x, f.y, f.size * 0.65, 0, Math.PI * 2);
          bgCtx.fill();
          bgCtx.restore();
        });

        // E. Render Gentle Background Fairies (BEHIND logo)
        pixies.forEach(p => {
          p.changeTimer--;
          if (p.changeTimer <= 0) {
            p.targetX = Math.random() * w;
            p.targetY = Math.random() * (h * 0.8);
            p.changeTimer = 90 + Math.random() * 120;
            if (Math.random() > 0.65) p.hoverTimer = 30 + Math.random() * 30;
          }

          if (p.hoverTimer > 0) {
            p.hoverTimer--;
            p.vx *= 0.94;
            p.vy *= 0.94;
          } else {
            const dx = p.targetX - p.x;
            const dy = p.targetY - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;

            p.vx += (dx / dist) * 0.045;
            p.vy += (dy / dist) * 0.045;

            if (mouse.x > 0) {
              const mdx = mouse.x - p.x;
              const mdy = mouse.y - p.y;
              const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
              if (mdist < 180) {
                const angle = Math.atan2(mdy, mdx) + Math.PI * 0.45;
                p.vx += Math.cos(angle) * 0.25;
                p.vy += Math.sin(angle) * 0.25;
              }
            }

            p.vx = Math.max(-1.1, Math.min(1.1, p.vx * 0.98));
            p.vy = Math.max(-0.9, Math.min(0.9, p.vy * 0.98));
          }

          p.x += p.vx;
          p.y += p.vy;

          if (p.x < -30) p.x = w + 30;
          if (p.x > w + 30) p.x = -30;
          if (p.y < -30) p.y = h + 30;
          if (p.y > h + 30) p.y = -30;

          p.wingPhase += p.wingSpeed;
          p.fireflyPulse += p.fireflySpeed;

          if (Math.random() > 0.6) {
            emitPixieDust(p.x, p.y, 1, [p.palette.dust, '#FFFFFF', '#FFF4CC']);
          }

          drawPhotorealisticTinkerbell(bgCtx, p, now);
        });

        // Background Star Sparkles across Constellations
        if (globalStarSparkle > 0.05) {
          drawSkyStarSparkles(bgCtx, now, globalStarSparkle);
        }

        // ═══════════════════════════════════════════════
        // PHOTOREALISTIC POLARIS — TRUE NORTH STAR (Deep Space Astrophotography)
        // Authentic astronomical Airy disc, delicate Rayleigh corona & razor-thin optical diffraction rays
        // ═══════════════════════════════════════════════
        (function drawPolarisOnBg() {
          const polarisX = heroBgCanvas.width * 0.5;
          const polarisY = Math.max(90, heroBgCanvas.height * 0.095);
          const isDescending = heroTinkerbell && (heroTinkerbell.state === 'SPAWNING' || heroTinkerbell.state === 'ORB_FLOATING' || heroTinkerbell.state === 'FLYING_TO_LOGO');
          
          // Organic high-frequency astronomical scintillation (twinkle)
          const twinkle = 0.92 + 0.08 * Math.sin(now * 0.009) + 0.04 * Math.cos(now * 0.017);
          const slowBreathe = 1.0 + Math.sin(now * 0.002) * 0.08;
          const flareBoost = 1.0 + globalStarSparkle * 0.9;
          const starScale = (isDescending ? 1.25 : 1.0) * slowBreathe * flareBoost;

          bgCtx.save();
          bgCtx.translate(polarisX, polarisY);

          // 1. Deep Space Cosmic Corona / Gaussian Starlight Haze (Zero Cartoon Rings)
          const coronaR = 48 * starScale;
          const corona = bgCtx.createRadialGradient(0, 0, 0, 0, 0, coronaR);
          corona.addColorStop(0, `rgba(255, 255, 255, ${0.95 * twinkle})`);
          corona.addColorStop(0.12, `rgba(235, 245, 255, ${0.60 * twinkle})`);
          corona.addColorStop(0.35, `rgba(180, 220, 255, ${0.22 * twinkle})`);
          corona.addColorStop(0.65, `rgba(140, 180, 255, ${0.06 * twinkle})`);
          corona.addColorStop(1, 'transparent');
          bgCtx.fillStyle = corona;
          bgCtx.beginPath();
          bgCtx.arc(0, 0, coronaR, 0, Math.PI * 2);
          bgCtx.fill();

          // 2. Telescopic Hairline Optical Diffraction Spikes (Razor-Thin, Pure Photorealistic Astrophotography)
          const spikeLen = 54 * starScale * twinkle;
          const diagLen = 28 * starScale * twinkle;

          // Vertical Diffraction Ray
          const vGrad = bgCtx.createLinearGradient(0, -spikeLen, 0, spikeLen);
          vGrad.addColorStop(0, 'transparent');
          vGrad.addColorStop(0.25, `rgba(220, 240, 255, ${0.35 * twinkle})`);
          vGrad.addColorStop(0.5, '#FFFFFF');
          vGrad.addColorStop(0.75, `rgba(220, 240, 255, ${0.35 * twinkle})`);
          vGrad.addColorStop(1, 'transparent');
          bgCtx.strokeStyle = vGrad;
          bgCtx.lineWidth = 0.85;
          bgCtx.beginPath();
          bgCtx.moveTo(0, -spikeLen);
          bgCtx.lineTo(0, spikeLen);
          bgCtx.stroke();

          // Horizontal Diffraction Ray
          const hGrad = bgCtx.createLinearGradient(-spikeLen, 0, spikeLen, 0);
          hGrad.addColorStop(0, 'transparent');
          hGrad.addColorStop(0.25, `rgba(220, 240, 255, ${0.35 * twinkle})`);
          hGrad.addColorStop(0.5, '#FFFFFF');
          hGrad.addColorStop(0.75, `rgba(220, 240, 255, ${0.35 * twinkle})`);
          hGrad.addColorStop(1, 'transparent');
          bgCtx.strokeStyle = hGrad;
          bgCtx.lineWidth = 0.85;
          bgCtx.beginPath();
          bgCtx.moveTo(-spikeLen, 0);
          bgCtx.lineTo(spikeLen, 0);
          bgCtx.stroke();

          // 45° Diagonal Secondary Diffraction Rays (Fainter, delicate)
          bgCtx.save();
          bgCtx.rotate(Math.PI * 0.25);
          const dGrad = bgCtx.createLinearGradient(-diagLen, 0, diagLen, 0);
          dGrad.addColorStop(0, 'transparent');
          dGrad.addColorStop(0.5, `rgba(240, 250, 255, ${0.55 * twinkle})`);
          dGrad.addColorStop(1, 'transparent');
          bgCtx.strokeStyle = dGrad;
          bgCtx.lineWidth = 0.65;
          bgCtx.beginPath();
          bgCtx.moveTo(-diagLen, 0);
          bgCtx.lineTo(diagLen, 0);
          bgCtx.moveTo(0, -diagLen);
          bgCtx.lineTo(0, diagLen);
          bgCtx.stroke();
          bgCtx.restore();

          // 3. Piercing White-Hot Stellar Core Singularity (Pinprick Airy Disc)
          bgCtx.fillStyle = '#FFFFFF';
          bgCtx.shadowColor = '#FFFFFF';
          bgCtx.shadowBlur = 10 * starScale;
          bgCtx.beginPath();
          bgCtx.arc(0, 0, 2.2 * starScale, 0, Math.PI * 2);
          bgCtx.fill();

          bgCtx.restore();
        })();

        // 4. Doctor Strange Sling-Ring Dimensional Tree Portal (Left Arch Tree Circle)
        if (isHeroVisible) {
          updateAndRenderTreePortal(bgCtx, bgOffsetX, bgOffsetY, bgS, now, dt);
        } else {
          updateTreePortalLogicOnly(now, dt);
        }

        } // end if (isHeroVisible)

        // ═══════════════════════════════════════════════
        // LAYER 2 (FOREGROUND AVATAR CANVAS — IN FRONT OF ALL CONTENT)
        // Always runs continuously across every section of the page!
        // ═══════════════════════════════════════════════
        updateAndRenderHeroTinkerbell(aCtx, now, dt);
      } // end render()

      // ─── CONSTELLATION STAR SPARKLE BURST (Triggered when avatar lands on logo) ───
      function drawSkyStarSparkles(ctx, now, intensity) {
        ctx.save();
        const count = Math.floor(12 * intensity);
        for (let i = 0; i < count; i++) {
          const sx = (Math.sin(now * 0.0005 + i * 2.17) * 0.5 + 0.5) * w;
          const sy = (Math.cos(now * 0.0004 + i * 3.41) * 0.5 + 0.5) * (h * 0.65);
          const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(now * 0.003 + i * 1.7));
          const starSize = (2.5 + Math.sin(now * 0.002 + i) * 1.5) * intensity;

          ctx.globalAlpha = twinkle * intensity * 0.85;
          ctx.fillStyle = '#FFFFFF';

          // 4-point diamond star
          ctx.beginPath();
          ctx.moveTo(sx, sy - starSize * 2.2);
          ctx.lineTo(sx + starSize * 0.3, sy);
          ctx.lineTo(sx, sy + starSize * 2.2);
          ctx.lineTo(sx - starSize * 0.3, sy);
          ctx.closePath();
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(sx - starSize * 2.2, sy);
          ctx.lineTo(sx, sy - starSize * 0.3);
          ctx.lineTo(sx + starSize * 2.2, sy);
          ctx.lineTo(sx, sy + starSize * 0.3);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      // ─── ASTRONOMICAL LUNAR PHASE ENGINE (Real-Time Location & Moon Cycle) ───
      window.celestialLocation = {
        name: 'Chapel in the Clouds, Costa Rica',
        lat: 10.00,
        lng: -83.85
      };

      function calculateRealtimeMoon(date = new Date()) {
        const synodicMonth = 29.53058867;
        const refNewMoon = new Date('2024-01-11T11:57:00Z').getTime();
        const diffDays = (date.getTime() - refNewMoon) / (1000 * 60 * 60 * 24);
        const phaseValue = ((diffDays % synodicMonth) + synodicMonth) % synodicMonth;
        const phase = phaseValue / synodicMonth; // 0 to 1
        const illum = 0.5 * (1 - Math.cos(phase * 2 * Math.PI));
        const illumPct = Math.round(illum * 100);

        let name = 'Waxing Crescent';
        let icon = 'moon-waxing-crescent';

        if (phase < 0.03 || phase > 0.97) {
          name = 'New Moon';
          icon = 'moon-new';
        } else if (phase < 0.22) {
          name = 'Waxing Crescent';
          icon = 'moon-waxing-crescent';
        } else if (phase < 0.28) {
          name = 'First Quarter';
          icon = 'moon-first-quarter';
        } else if (phase < 0.47) {
          name = 'Waxing Gibbous';
          icon = 'moon-waxing-gibbous';
        } else if (phase < 0.53) {
          name = 'Full Moon';
          icon = 'moon-full';
        } else if (phase < 0.72) {
          name = 'Waning Gibbous';
          icon = 'moon-waning-gibbous';
        } else if (phase < 0.78) {
          name = 'Last Quarter';
          icon = 'moon-last-quarter';
        } else {
          name = 'Waning Crescent';
          icon = 'moon-waning-crescent';
        }

        return { phase, illumination: illumPct, name, icon };
      }

      // ─── PROCEDURAL PHOTOREALISTIC NASA LUNAR TEXTURE MAP ───
      let lunarTextureCanvas = null;
      function getLunarTexture() {
        if (lunarTextureCanvas) return lunarTextureCanvas;
        const cv = document.createElement('canvas');
        cv.width = 256;
        cv.height = 256;
        const ctx = cv.getContext('2d');

        // 1. Base Anorthosite Highlands Regolith
        const baseGrad = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
        baseGrad.addColorStop(0, '#E8EBF0');
        baseGrad.addColorStop(0.7, '#D4D8DF');
        baseGrad.addColorStop(1, '#B8BCC6');
        ctx.fillStyle = baseGrad;
        ctx.fillRect(0, 0, 256, 256);

        // 2. Multi-layer Micro-Crater Regolith Grain
        const imgData = ctx.getImageData(0, 0, 256, 256);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const noise = (Math.random() - 0.5) * 22;
          d[i] = Math.min(255, Math.max(0, d[i] + noise));
          d[i+1] = Math.min(255, Math.max(0, d[i+1] + noise));
          d[i+2] = Math.min(255, Math.max(0, d[i+2] + noise + 2));
        }
        ctx.putImageData(imgData, 0, 0);

        // 3. Basalt Lunar Maria (Dark Volcanic Plains)
        function drawMare(cx, cy, rx, ry, opacity = 0.65, angle = 0) {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(angle);
          const mg = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(rx, ry));
          mg.addColorStop(0, `rgba(52, 56, 64, ${opacity})`);
          mg.addColorStop(0.55, `rgba(68, 73, 82, ${opacity * 0.85})`);
          mg.addColorStop(0.85, `rgba(90, 96, 108, ${opacity * 0.45})`);
          mg.addColorStop(1, 'rgba(120, 126, 138, 0)');
          ctx.fillStyle = mg;
          ctx.beginPath();
          ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Oceanus Procellarum & Mare Imbrium
        drawMare(88, 105, 52, 70, 0.72, -0.15);
        drawMare(105, 68, 42, 38, 0.68, 0.1);
        // Mare Serenitatis & Mare Tranquillitatis
        drawMare(148, 85, 30, 28, 0.65, 0.2);
        drawMare(162, 118, 36, 32, 0.70, -0.1);
        // Mare Fecunditatis & Mare Nectaris
        drawMare(182, 148, 30, 26, 0.62, 0.3);
        drawMare(156, 162, 22, 18, 0.58, 0.15);
        // Mare Crisium (Distinct isolated oval sea)
        drawMare(204, 92, 20, 15, 0.78, 0.35);
        // Mare Nubium & Mare Humorum
        drawMare(96, 168, 34, 30, 0.64, -0.2);
        drawMare(68, 152, 18, 16, 0.60, 0.1);

        // 4. Impact Crater Ray Systems (Tycho, Copernicus, Kepler)
        function drawCrater(cx, cy, r, rays = true, rayCount = 14) {
          ctx.save();
          // Bright Ray Splatter
          if (rays) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = 1.0;
            for (let k = 0; k < rayCount; k++) {
              const ang = (k / rayCount) * Math.PI * 2 + Math.random() * 0.2;
              const len = r * (4.5 + Math.random() * 8.5);
              ctx.beginPath();
              ctx.moveTo(cx, cy);
              ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
              ctx.stroke();
            }
          }
          // Crater Rim (bright sunlight side / dark shadow side)
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#3A3D45';
          ctx.beginPath();
          ctx.arc(cx + r * 0.2, cy, r * 0.75, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Tycho (prominent southern highlands crater with immense ray system)
        drawCrater(125, 205, 6, true, 22);
        // Copernicus (bright ray star in Oceanus Procellarum)
        drawCrater(92, 102, 5, true, 16);
        // Kepler & Aristarchus
        drawCrater(62, 106, 3.5, true, 10);
        drawCrater(60, 78, 3.5, true, 8);

        lunarTextureCanvas = cv;
        return lunarTextureCanvas;
      }

      // ─── PHOTOREALISTIC LOCATION MOON RENDERER (60 FPS CANVAS) ───
      let locationMoonAnimId = null;
      let targetMoonTilt = 0;
      let currentLocMoonTilt = 0;

      function renderPhotorealisticLocationMoon() {
        const canvas = document.getElementById('location-moon-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const w = 180;
        const h = 180;

        if (canvas.width !== w * dpr) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
        }

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, w, h);

        const moon = calculateRealtimeMoon();
        const lat = (window.celestialLocation && typeof window.celestialLocation.lat === 'number') ? window.celestialLocation.lat : 10.0;
        
        // Dynamic Zenith Tilt based on Latitude
        targetMoonTilt = (lat / 90) * (Math.PI * 0.38);
        currentLocMoonTilt += (targetMoonTilt - currentLocMoonTilt) * 0.08;

        const cx = w * 0.5;
        const cy = h * 0.5;
        const R = 74;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(currentLocMoonTilt);

        // 1. Celestial Outer Atmosphere & Rayleigh Halo Glow
        const haloGrad = ctx.createRadialGradient(0, 0, R * 0.8, 0, 0, R * 1.25);
        haloGrad.addColorStop(0, 'rgba(0, 229, 212, 0.45)');
        haloGrad.addColorStop(0.4, 'rgba(157, 78, 221, 0.25)');
        haloGrad.addColorStop(0.8, 'rgba(255, 215, 0, 0.12)');
        haloGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(0, 0, R * 1.25, 0, Math.PI * 2);
        ctx.fill();

        // 2. Clip to 3D Lunar Spherical Disc
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.clip();

        // 3. Draw High-Res NASA Lunar Surface Texture
        const tex = getLunarTexture();
        ctx.drawImage(tex, -R, -R, R * 2, R * 2);

        // 4. Photorealistic 3D Spherical Volume Shading & Phase Terminator
        // Light direction based on phase:
        const p = moon.phase; // 0..1
        // Create 3D spherical curvature and terminator shadow
        const shadowGrad = ctx.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.2, 0, 0, R);
        shadowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
        shadowGrad.addColorStop(0.85, 'rgba(0, 0, 0, 0.45)');
        shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
        ctx.fillStyle = shadowGrad;
        ctx.fillRect(-R, -R, R * 2, R * 2);

        // Phase Terminator Mask (Oren-Nayar / Lommel-Seeliger Volumetric Approximation)
        ctx.save();
        ctx.beginPath();
        // Construct terminator crescent
        if (p < 0.5) {
          // Waxing: Sun is from the Right
          const shadowSpan = (1 - p * 2) * R * 2.0;
          ctx.fillStyle = 'rgba(8, 0, 20, 0.94)';
          ctx.beginPath();
          ctx.arc(0, 0, R + 2, Math.PI * 0.5, Math.PI * 1.5, false);
          ctx.ellipse(0, 0, Math.abs(shadowSpan * 0.5), R + 2, 0, Math.PI * 1.5, Math.PI * 0.5, p > 0.25);
          ctx.fill();
        } else {
          // Waning: Sun is from the Left
          const shadowSpan = (p - 0.5) * 2 * R * 2.0;
          ctx.fillStyle = 'rgba(8, 0, 20, 0.94)';
          ctx.beginPath();
          ctx.arc(0, 0, R + 2, Math.PI * 1.5, Math.PI * 0.5, false);
          ctx.ellipse(0, 0, Math.abs(shadowSpan * 0.5), R + 2, 0, Math.PI * 0.5, Math.PI * 1.5, p < 0.75);
          ctx.fill();
        }
        ctx.restore();

        // 5. Earthshine on the dark side of the moon (subtle blue-gray ambient light)
        const earthshineGrad = ctx.createRadialGradient(R * 0.3, R * 0.3, 0, 0, 0, R);
        earthshineGrad.addColorStop(0, 'rgba(40, 60, 95, 0.16)');
        earthshineGrad.addColorStop(0.8, 'rgba(20, 30, 50, 0.08)');
        earthshineGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = earthshineGrad;
        ctx.fillRect(-R, -R, R * 2, R * 2);

        // 6. Brilliant Sunlit Limb Rim Highlight
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, R - 0.7, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore(); // end clip
        ctx.restore(); // end translate/rotate
        ctx.restore(); // end main ctx save
      }

      function updateMoonUI() {
        const moon = calculateRealtimeMoon();
        const iconEl = document.getElementById('live-moon-icon');
        const phaseNameEl = document.getElementById('live-moon-phase-name');
        const illumEl = document.getElementById('live-moon-illumination');
        const locNameEl = document.getElementById('hero-loc-name');
        const locCoordsEl = document.getElementById('hero-loc-coords');
        const modalLocNameEl = document.getElementById('loc-modal-current-name');
        const modalLocCoordsEl = document.getElementById('loc-modal-current-coords');
        const telemPhaseEl = document.getElementById('loc-telemetry-phase');
        const telemMetricsEl = document.getElementById('loc-telemetry-metrics');

        if (iconEl) setPico(iconEl, moon.icon);
        if (phaseNameEl) phaseNameEl.textContent = moon.name;
        if (illumEl) illumEl.textContent = `${moon.illumination}% Illumination`;
        if (locNameEl) locNameEl.textContent = window.celestialLocation.name;
        if (modalLocNameEl) setPico(modalLocNameEl, 'cloud', window.celestialLocation.name);

        const latStr = `${Math.abs(window.celestialLocation.lat).toFixed(2)}°${window.celestialLocation.lat >= 0 ? 'N' : 'S'}`;
        const lngStr = `${Math.abs(window.celestialLocation.lng).toFixed(2)}°${window.celestialLocation.lng >= 0 ? 'E' : 'W'}`;
        const tiltDeg = ((window.celestialLocation.lat / 90) * 22).toFixed(1);
        
        if (locCoordsEl) locCoordsEl.textContent = `${latStr}, ${lngStr} · Sacred Energy Sanctuary`;
        if (modalLocCoordsEl) modalLocCoordsEl.textContent = `${latStr}, ${lngStr} · Real-Time Sky Moon Phase Active`;
        if (telemPhaseEl) telemPhaseEl.textContent = `${moon.name} · ${moon.illumination}%`;
        if (telemMetricsEl) telemMetricsEl.textContent = `Lat: ${latStr} · Zenith Tilt: ${tiltDeg >= 0 ? '+' : ''}${tiltDeg}°`;

        // Render the photorealistic 3D moon
        renderPhotorealisticLocationMoon();
      }
      updateMoonUI();
      window.renderPhotorealisticLocationMoon = renderPhotorealisticLocationMoon;

      // ─── TINKERBELL MULTI-PERCH, THE WORM & MOONWALK STATE MACHINE ───
      // Starts ONLY when the preloader is done and dismissed

      // ─── TINKERBELL MULTI-PERCH, THE WORM & MOONWALK STATE MACHINE ───
      // Starts ONLY when the preloader is done and dismissed
      const heroTinkerbell = {
        state: 'WAITING_FOR_PRELOADER',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        startX: 0,
        startY: 0,
        targetX: 0,
        targetY: 0,
        progress: 0,
        perchedTime: 0,
        wormTime: 0,
        moonwalkTime: 0,
        alpha: 0,
        jumpSquash: 1,
        eyeSummoned: false,
        greetShown: false,
        greetHidden: false,
        splashTime: -1,
        wingPhase: 0,
        headAngle: 0,
        bodySway: 0,
        wandSpread: 0,
        isDoingTheWorm: false,
        wormPhase: 0,
        isMoonwalking: false,
        moonwalkPhase: 0,
        facingLeft: false,
        diveAngle: 0,
        portalVortexT: 0,
        nextSpawnTime: 0,
        cycleInterval: 14000,
        logoBubbleShown: false,
        logoBubbleHidden: false,
        bookBubbleShown: false,
        bookBubbleHidden: false,
        menuBubbleShown: false,
        isFastScrolled: false
      };
      window.heroTinkerbell = heroTinkerbell;

      const heroAeyeMenu = {
        state: 'IDLE', // 'IDLE', 'MENU_TAKEOFF', 'MENU_PERCHED', 'MENU_DIVE_BACK'
        x: 0,
        y: 0,
        startX: 0,
        startY: 0,
        targetX: 0,
        targetY: 0,
        progress: 0,
        alpha: 0,
        scale: 1.0,
        gazeX: 0,
        gazeY: 0,
        blinkPhase: 0,
        nextBlinkTime: 0
      };

      let activeSpeechBubble = {
        visible: false,
        text: '',
        preferredSide: 'auto', // 'auto', 'top', 'bottom', 'side-left', 'side-right'
      };

      // Ascending empty bubble orb (returns to Polaris after Beth exits)
      const returningBubbleOrb = {
        active: false,
        x: 0, y: 0,
        startX: 0, startY: 0,
        targetX: 0, targetY: 0,
        progress: 0
      };

      function updateBethSpeechBubblePosition() {
        const gEl = document.getElementById('beth-greeting-bubble');
        if (!gEl || !activeSpeechBubble.visible) return;

        const isAuraState = heroTinkerbell.state && heroTinkerbell.state.startsWith('AURA_');
        const targetX = (isAuraState && heroTinkerbell.fairyX !== undefined) ? heroTinkerbell.fairyX : heroTinkerbell.x;
        const targetY = (isAuraState && heroTinkerbell.fairyY !== undefined) ? heroTinkerbell.fairyY : heroTinkerbell.y;
        const isFacingLeft = (isAuraState && heroTinkerbell.fairyFacingLeft !== undefined) ? heroTinkerbell.fairyFacingLeft : heroTinkerbell.facingLeft;
        const mouthX = targetX + (isFacingLeft ? -6 : 6);
        const mouthY = targetY - 38;
        const headTop = targetY - 56;
        const r = gEl.getBoundingClientRect();
        const rw = r.width > 0 ? r.width : (gEl.offsetWidth || 240);
        const rh = r.height > 0 ? r.height : (gEl.offsetHeight || 58);

        let side = activeSpeechBubble.preferredSide || 'auto';

        // Intelligent 'auto' placement:
        if (side === 'auto') {
          // If in bottom right corner (aEye or menu):
          if (targetX > window.innerWidth * 0.65) {
            side = 'side-left';
          } else if (targetX < window.innerWidth * 0.35) {
            side = 'side-right';
          } else if (headTop - rh - 18 < 16) {
            // Close to top edge, place to the side
            side = isFacingLeft ? 'side-left' : 'side-right';
          } else {
            side = 'top';
          }
        }

        let left, top;
        let dirClass = 'beth-greeting--bottom';

        if (isAuraState) {
          // In Aura Scanner modal: Avatar Beth is perched on the top-right corner of the modal card.
          // Place speech bubble clearly to her LEFT with generous margin so it NEVER touches or covers Beth.
          left = targetX - 52 - rw;
          top = mouthY - rh * 0.5;
          dirClass = 'beth-greeting--right'; // Arrow on RIGHT edge pointing right towards her mouth
        } else if (side === 'side-left' || side === 'top-left') {
          // Bubble to the LEFT of Beth: sits snug with arrow tip ~6px from her side
          left = (targetX - 32) - rw;
          top = mouthY - rh * 0.5;
          dirClass = 'beth-greeting--right'; // Arrow on RIGHT edge pointing right towards her mouth
        } else if (side === 'side-right' || side === 'top-right') {
          // Bubble to the RIGHT of Beth: sits snug with arrow tip ~6px from her side
          left = targetX + 32;
          top = mouthY - rh * 0.5;
          dirClass = 'beth-greeting--left'; // Arrow on LEFT edge pointing left towards her mouth
        } else if (side === 'bottom') {
          // Bubble BELOW Beth: sits snug below her feet
          left = targetX - rw * 0.5;
          top = targetY + 22;
          dirClass = 'beth-greeting--top'; // Arrow on TOP edge pointing up
        } else {
          // Bubble ABOVE Beth: sits snug above head/halo
          left = targetX - rw * 0.5;
          top = (headTop - 16) - rh;
          dirClass = 'beth-greeting--bottom'; // Arrow on BOTTOM edge pointing down towards her mouth
        }

        // Clamp securely inside viewport with 12px edge safety
        const clampedLeft = Math.max(12, Math.min(left, window.innerWidth - rw - 12));
        const clampedTop = Math.max(12, Math.min(top, window.innerHeight - rh - 12));

        gEl.style.left = clampedLeft + 'px';
        gEl.style.top = clampedTop + 'px';
        gEl.style.right = 'auto';
        gEl.style.bottom = 'auto';

        // Set direction class
        gEl.classList.remove('beth-greeting--bottom', 'beth-greeting--right', 'beth-greeting--left', 'beth-greeting--top');
        gEl.classList.add(dirClass);

        // Compute exact arrow origin along the bubble edge
        const arrowEl = gEl.querySelector('.beth-greeting__arrow');
        if (arrowEl) {
          if (dirClass === 'beth-greeting--bottom' || dirClass === 'beth-greeting--top') {
            // Horizontal alignment along top/bottom edge pointing at mouthX
            const relArrowX = Math.max(18, Math.min(r.width - 18, mouthX - clampedLeft));
            arrowEl.style.setProperty('--arrow-pos', relArrowX + 'px');
          } else {
            // Vertical alignment along left/right edge pointing at mouthY
            const relArrowY = Math.max(16, Math.min(r.height - 16, mouthY - clampedTop));
            arrowEl.style.setProperty('--arrow-pos', relArrowY + 'px');
          }
        }
      }

      function formatAeyeBrandHtml(str) {
        if (!str) return '';
        return str.replace(/\b([aA])EYE\b|\b([aA])Eye\b|\b([aA])eye\b/gi, '<span class="aeye-brand"><span class="aeye-a">a</span><span class="aeye-eye">EYE</span></span>');
      }

      function showBethSpeechBubble(text, targetX, targetY, preferredSide = 'auto') {
        const gEl = document.getElementById('beth-greeting-bubble');
        const gTxt = document.getElementById('beth-greeting-text');
        if (!gEl) return;
        
        // Strip duplicate diamonds and ensure clean uppercase small-caps with preserved lowercase 'a'
        const cleanText = text.replace(/^[✦\s*]+|[✦\s*]+$/g, '').trim();
        const htmlFormatted = formatAeyeBrandHtml(cleanText);
        if (gTxt) gTxt.innerHTML = `✦ ${htmlFormatted} ✦`;

        // Check if single-line mode is specifically requested (e.g. aura scan buffering)
        const isSingleLine = text.includes('aura-buffering-dots') || text.includes("HANG TIGHT");
        if (isSingleLine) {
          gEl.classList.add('beth-greeting--single-line');
        } else {
          gEl.classList.remove('beth-greeting--single-line');
        }

        activeSpeechBubble.visible = true;
        activeSpeechBubble.text = cleanText;
        activeSpeechBubble.preferredSide = preferredSide;

        gEl.hidden = false;
        gEl.style.visibility = 'visible';
        updateBethSpeechBubblePosition();
        gEl.classList.add('is-visible');
      }

      function hideBethSpeechBubble() {
        activeSpeechBubble.visible = false;
        const gEl = document.getElementById('beth-greeting-bubble');
        if (gEl) {
          gEl.classList.remove('is-visible');
          setTimeout(() => {
            if (!activeSpeechBubble.visible) {
              gEl.hidden = true;
            }
          }, 350);
        }
      }

      window.startHeroBethAvatarIntro = function() {
        if (heroTinkerbell.state !== 'WAITING_FOR_PRELOADER') return;
        heroTinkerbell.state = 'SPAWNING';
        heroTinkerbell.alpha = 1;
        heroTinkerbell.progress = 0;
        heroTinkerbell.orbFlightTime = 0;
        heroTinkerbell.logoBubbleShown = false;
        heroTinkerbell.logoBubbleHidden = false;
        heroTinkerbell.bookBubbleShown = false;
        heroTinkerbell.bookBubbleHidden = false;
        heroTinkerbell.menuBubbleShown = false;
        heroTinkerbell.isFastScrolled = false;
      };

      // Only start intro if site preloader was already completed or doesn't exist
      if (window.preloaderDone || !document.getElementById('site-preloader')) {
        setTimeout(window.startHeroBethAvatarIntro, 350);
      }

      window.triggerHeroDescent = function() {
        heroTinkerbell.state = 'SPAWNING';
        heroTinkerbell.progress = 0;
        heroTinkerbell.wormTime = 0;
        heroTinkerbell.moonwalkTime = 0;
        heroTinkerbell.perchedTime = 0;
        heroTinkerbell.isDoingTheWorm = false;
        heroTinkerbell.isMoonwalking = false;
        heroTinkerbell.facingLeft = false;
        heroTinkerbell.eyeSummoned = false;
        heroTinkerbell.greetShown = false;
        heroTinkerbell.greetHidden = false;
        heroTinkerbell.logoBubbleShown = false;
        heroTinkerbell.logoBubbleHidden = false;
        heroTinkerbell.bookBubbleShown = false;
        heroTinkerbell.bookBubbleHidden = false;
        heroTinkerbell.menuBubbleShown = false;
        heroTinkerbell.isFastScrolled = false;
        heroTinkerbell.splashTime = -1;
        heroTinkerbell.alpha = 1;
        heroTinkerbell.jumpSquash = 1;
        hideBethSpeechBubble();
      };

      // Clicking logo also triggers routine
      document.querySelector('.hero__logo-img')?.addEventListener('click', () => {
        window.triggerHeroDescent();
        if (window.celestialAudio) window.celestialAudio.playChime(963, 1.8);
      });

      // ─── STAR SPARKLE BURST CONTROLLER ───
      let globalStarSparkle = 0;

      const portalHighlights = [
        {"tag": "SACRED MERCHANDISE", "title": "EYE BELIEVE HOODIE", "subtitle": "Organic Lavender Celestial Wear", "action": "Tap to Shop Hoodie", "href": "#merch", "imgSrc": "images/merch-eye-believe-hoodie-lavender.webp", "color": "#C77DFF"},
        {"tag": "ENERGY HEALING", "title": "CHAKRA BALANCING", "subtitle": "7-Vortex Harmonic Alignment", "action": "Tap to Align Chakras", "href": "#services", "imgSrc": "images/chakra-watercolor-transparent.webp", "color": "#00FFC8"},
        {"tag": "INTERACTIVE SCANNER", "title": "3D AURA SCANNER", "subtitle": "LiDAR Biofield Frequency Scan", "action": "Tap to Scan Aura", "href": "#aura-scanner", "imgSrc": "images/aura-silhouette-glow.webp", "color": "#00E5D4"},
        {"tag": "EXCLUSIVE LIVE EVENT", "title": "GHOST KEY WEST", "subtitle": "Historic Gallery Mediumship", "action": "Tap to View Gathering", "href": "#events", "imgSrc": "images/notes-by-beth.webp", "color": "#FFD700"},
        {"tag": "1-ON-1 SESSIONS", "title": "EVIDENTIAL READING", "subtitle": "Private Spirit Communication", "action": "Tap to Book Session", "href": "#contact", "imgSrc": "images/portrait.webp", "color": "#FFE57F"},
        {"tag": "SACRED MERCHANDISE", "title": "EYE BELIEVE HAT", "subtitle": "Embroidered Celestial Headwear", "action": "Tap to Shop Headwear", "href": "#merch", "imgSrc": "images/merch-eye-believe-hat-black.webp", "color": "#FF80DF"},
        {"tag": "SOUND FREQUENCIES", "title": "528Hz SOUND BATH", "subtitle": "Miracle Transformation Tone", "action": "Tap to Open Frequencies", "href": "#sound-sanctuary", "imgSrc": "images/crystal_nebula_panorama.webp", "color": "#9D4EDD"}
      ];

      const portalImgs = portalHighlights.map(item => {
        if (window.PRELOADED_ASSETS && window.PRELOADED_ASSETS[item.imgSrc]) {
          return window.PRELOADED_ASSETS[item.imgSrc];
        }
        const img = new Image();
        img.src = item.imgSrc;
        return img;
      });

      // 64 High-Precision Organic Contour Nodes (Exact Match to User Reference Image Arch)
      let TREE_CONTOUR = [{"u": 0.298, "v": 0.275}, {"u": 0.3082, "v": 0.2763}, {"u": 0.3183, "v": 0.2791}, {"u": 0.3283, "v": 0.2834}, {"u": 0.338, "v": 0.2892}, {"u": 0.3474, "v": 0.2963}, {"u": 0.3564, "v": 0.3047}, {"u": 0.365, "v": 0.3143}, {"u": 0.373, "v": 0.3251}, {"u": 0.3803, "v": 0.3369}, {"u": 0.3868, "v": 0.3496}, {"u": 0.3925, "v": 0.3632}, {"u": 0.3973, "v": 0.3775}, {"u": 0.4011, "v": 0.3925}, {"u": 0.4039, "v": 0.408}, {"u": 0.4056, "v": 0.4239}, {"u": 0.404, "v": 0.44}, {"u": 0.4035, "v": 0.4553}, {"u": 0.4019, "v": 0.4705}, {"u": 0.3993, "v": 0.4852}, {"u": 0.3956, "v": 0.4995}, {"u": 0.391, "v": 0.5132}, {"u": 0.3855, "v": 0.5261}, {"u": 0.3792, "v": 0.5381}, {"u": 0.3721, "v": 0.5492}, {"u": 0.3643, "v": 0.5592}, {"u": 0.3558, "v": 0.5681}, {"u": 0.3469, "v": 0.5757}, {"u": 0.3376, "v": 0.582}, {"u": 0.3279, "v": 0.587}, {"u": 0.318, "v": 0.5906}, {"u": 0.308, "v": 0.5927}, {"u": 0.298, "v": 0.5935}, {"u": 0.2881, "v": 0.5927}, {"u": 0.2783, "v": 0.5906}, {"u": 0.2688, "v": 0.587}, {"u": 0.2597, "v": 0.582}, {"u": 0.251, "v": 0.5757}, {"u": 0.2428, "v": 0.5681}, {"u": 0.2352, "v": 0.5592}, {"u": 0.2282, "v": 0.5492}, {"u": 0.2219, "v": 0.5381}, {"u": 0.2163, "v": 0.5261}, {"u": 0.2116, "v": 0.5132}, {"u": 0.2076, "v": 0.4995}, {"u": 0.2045, "v": 0.4852}, {"u": 0.2023, "v": 0.4705}, {"u": 0.2009, "v": 0.4553}, {"u": 0.2005, "v": 0.44}, {"u": 0.1904, "v": 0.4238}, {"u": 0.1921, "v": 0.4076}, {"u": 0.1949, "v": 0.3917}, {"u": 0.1987, "v": 0.3762}, {"u": 0.2035, "v": 0.3612}, {"u": 0.2092, "v": 0.3471}, {"u": 0.2157, "v": 0.3338}, {"u": 0.223, "v": 0.3216}, {"u": 0.231, "v": 0.3106}, {"u": 0.2396, "v": 0.3009}, {"u": 0.2486, "v": 0.2927}, {"u": 0.258, "v": 0.2859}, {"u": 0.2677, "v": 0.2808}, {"u": 0.2777, "v": 0.2772}, {"u": 0.2878, "v": 0.2753}];
      window.TREE_CONTOUR = TREE_CONTOUR;

      const treePortal = {
        state: 'HOLD_FOR_ASSISTANT', // Held until Avatar Beth dives into aEYE & introduces itself
        timer: 0,
        sputter1Duration: 1.2,
        sputter2Duration: 1.4,
        drawDuration: 2.4,
        openDuration: 11.5,
        closeDuration: 0.85,
        nextTrigger: Infinity,
        ringProgress: 0,
        highlightIdx: 0,
        isHovered: false,
        x: 0,
        y: 0,
        r: 0,
        sparks: [],           // Ejected velocity-aligned flying sparks
        orbitParticles: [],   // Niagara dense orbiting ring sparkler swarm (180 persistent particles)
        ambientEmbers: []     // Floating 3D cinders & embers
      };

      window.startTreePortalSequence = function() {
        if (treePortal.state === 'HOLD_FOR_ASSISTANT') {
          treePortal.state = 'IDLE';
          treePortal.nextTrigger = performance.now() + 1800;
        }
      };

      window.openTreePortalDirectly = function(idx = 0) {
        treePortal.state = 'OPEN';
        treePortal.timer = 1.0;
        treePortal.ringProgress = 1.0;
        treePortal.highlightIdx = idx % portalHighlights.length;
      };

      function updateTreePortalLogicOnly(now, dt) {
        if (treePortal.state === 'HOLD_FOR_ASSISTANT') return;

        if (treePortal.state === 'IDLE') {
          if (now >= treePortal.nextTrigger) {
            treePortal.state = 'SPUTTER_1';
            treePortal.timer = 0;
            treePortal.ringProgress = 0;
            treePortal.highlightIdx = Math.floor(Math.random() * portalHighlights.length);
          }
        } else if (treePortal.state === 'SPUTTER_1') {
          treePortal.timer += dt;
          if (treePortal.timer >= treePortal.sputter1Duration) {
            treePortal.state = 'SPUTTER_2';
            treePortal.timer = 0;
          }
        } else if (treePortal.state === 'SPUTTER_2') {
          treePortal.timer += dt;
          if (treePortal.timer >= treePortal.sputter2Duration) {
            treePortal.state = 'DRAWING_RING';
            treePortal.timer = 0;
            treePortal.ringProgress = 0;
          }
        } else if (treePortal.state === 'DRAWING_RING') {
          treePortal.timer += dt;
          treePortal.ringProgress = Math.min(1, treePortal.timer / treePortal.drawDuration);
          if (treePortal.ringProgress >= 1) {
            treePortal.state = 'OPEN';
            treePortal.timer = 0;
          }
        } else if (treePortal.state === 'OPEN') {
          treePortal.timer += dt;
          if (treePortal.timer >= treePortal.openDuration) {
            treePortal.state = 'CLOSING';
            treePortal.timer = 0;
          }
        } else if (treePortal.state === 'CLOSING') {
          treePortal.timer += dt;
          const closeP = Math.min(1, treePortal.timer / treePortal.closeDuration);
          if (closeP >= 1) {
            treePortal.state = 'IDLE';
            treePortal.timer = 0;
            treePortal.nextTrigger = now + 14000 + Math.random() * 9000;
          }
        }
      }

      function updateAndRenderTreePortal(ctx, bgOffsetX, bgOffsetY, bgS, now, dt) {
        if (treePortal.state === 'HOLD_FOR_ASSISTANT') return;

        // Calculate raw world coordinates for all 64 organic tree contour nodes
        const numNodes = TREE_CONTOUR.length;
        let rawAvgX = 0, rawAvgY = 0;
        const rawPts = [];

        for (let i = 0; i < numNodes; i++) {
          const node = TREE_CONTOUR[i];
          const nx = bgOffsetX + node.u * 1920 * bgS;
          const ny = bgOffsetY + node.v * 1080 * bgS;
          rawPts.push({ x: nx, y: ny });
          rawAvgX += nx;
          rawAvgY += ny;
        }
        rawAvgX /= numNodes;
        rawAvgY /= numNodes;

        // Dynamic On-Screen Viewport Adapter:
        // On widescreen desktop, rawAvgX naturally sits on the left tree arch (~25-30% of screen).
        // On mobile phones & portrait tablets, background-size: cover crops the left/right edges of the 16:9 image,
        // causing rawAvgX to be pushed off-screen (rawAvgX < 0).
        // Adaptively ensure the portal is ALWAYS 100% visible inside the hero glade across every device!
        const isMobile = (w || window.innerWidth) < 600;
        const isTablet = (w || window.innerWidth) >= 600 && (w || window.innerWidth) < 1024;

        let targetCenterX = rawAvgX;
        let targetCenterY = rawAvgY;
        let portalScale = 1.0;

        if (isMobile) {
          // On mobile phones: place portal on top of the logo, exactly in the center!
          targetCenterX = (w || window.innerWidth) * 0.5;
          targetCenterY = (h || window.innerHeight) * 0.22;
          const heroLogo = document.querySelector('.hero__logo-img');
          if (heroLogo) {
            const rect = heroLogo.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              targetCenterX = rect.left + (rect.width * 0.5);
              targetCenterY = rect.top + (rect.height * 0.5);
            }
          }
          portalScale = 0.68; // Gracefully scaled to fit mobile center
        } else if (isTablet) {
          // On portrait tablets: ensure comfortable padding from the left edge
          targetCenterX = Math.max(115, Math.min(rawAvgX, w * 0.26));
          targetCenterY = Math.max(180, Math.min(rawAvgY, h * 0.35));
          portalScale = 0.85;
        } else {
          // Desktop: ensure at least 75px margin from screen edges
          targetCenterX = Math.max(85, Math.min(rawAvgX, w - 85));
          targetCenterY = Math.max(100, Math.min(rawAvgY, h - 100));
          portalScale = 1.0;
        }

        const pts = [];
        let avgX = 0, avgY = 0;
        for (let i = 0; i < numNodes; i++) {
          const raw = rawPts[i];
          const nx = targetCenterX + (raw.x - rawAvgX) * portalScale;
          const ny = targetCenterY + (raw.y - rawAvgY) * portalScale;
          pts.push({ x: nx, y: ny });
          avgX += nx;
          avgY += ny;
        }
        avgX /= numNodes;
        avgY /= numNodes;
        treePortal.x = avgX;
        treePortal.y = avgY;

        // Approximate radius for interaction hover detection
        const dx0 = pts[0].x - avgX;
        const dy0 = pts[0].y - avgY;
        treePortal.r = Math.hypot(dx0, dy0) * 1.05;

        // Helper: High-precision continuous contour sampling (Unreal Niagara Curve Sampler)
        function getContourSample(t, offset = 0, scale = 1.0) {
          const clampedT = ((t % 1.0) + 1.0) % 1.0;
          const rawIdx = clampedT * numNodes;
          const idx0 = Math.floor(rawIdx);
          const frac = rawIdx - idx0;
          const p0 = pts[idx0 % numNodes];
          const p1 = pts[(idx0 + 1) % numNodes];

          const bx = p0.x + (p1.x - p0.x) * frac;
          const by = p0.y + (p1.y - p0.y) * frac;

          const tx = p1.x - p0.x;
          const ty = p1.y - p0.y;
          const tLen = Math.hypot(tx, ty) || 1;
          const tangX = tx / tLen;
          const tangY = ty / tLen;
          const normX = -tangY; // outward normal
          const normY = tangX;

          const px = avgX + (bx - avgX) * scale + normX * offset;
          const py = avgY + (by - avgY) * scale + normY * offset;

          return { x: px, y: py, tangX, tangY, normX, normY };
        }

        // Initialize Niagara Orbit Particle Swarm (180 circulating sparkler particles)
        if (!treePortal.orbitParticles || treePortal.orbitParticles.length === 0) {
          treePortal.orbitParticles = [];
          for (let i = 0; i < 180; i++) {
            treePortal.orbitParticles.push({
              t: Math.random(),
              speed: 0.75 + Math.random() * 0.95, // circuits per second
              offset: (Math.random() - 0.5) * 12.0, // normal offset
              size: 1.4 + Math.random() * 2.8,
              phase: Math.random() * Math.PI * 2,
              color: ['#FFFFFF', '#FFF8DC', '#FFE066', '#FFD700', '#FFAA00', '#FF6B00'][Math.floor(Math.random() * 6)]
            });
          }
        }

        // ─── STATE MACHINE WITH DOCTOR STRANGE SPUTTERING FORMATION ───
        if (treePortal.state === 'IDLE') {
          if (now >= treePortal.nextTrigger) {
            treePortal.state = 'SPUTTER_1';
            treePortal.timer = 0;
            treePortal.ringProgress = 0;
            treePortal.highlightIdx = Math.floor(Math.random() * portalHighlights.length);
            if (window.celestialAudio) window.celestialAudio.playGlissando();
          }
        }
        // ── STAGE 1: First sputter / struggle (Throws initial sparks from top, dies out at 35%) ──
        else if (treePortal.state === 'SPUTTER_1') {
          treePortal.timer += dt;
          const p1 = treePortal.timer / treePortal.sputter1Duration;
          treePortal.ringProgress = Math.min(0.35, p1 * 0.42);

          const sample = getContourSample(treePortal.ringProgress);
          for (let s = 0; s < 6; s++) {
            const spd = 60 + Math.random() * 120;
            const sprkAng = Math.atan2(sample.tangY, sample.tangX) + (Math.random() - 0.5) * 1.1;
            treePortal.sparks.push({
              x: sample.x,
              y: sample.y,
              prevX: sample.x,
              prevY: sample.y,
              vx: Math.cos(sprkAng) * spd,
              vy: Math.sin(sprkAng) * spd + 15,
              life: 1.0,
              maxLife: 1.0,
              decay: 0.035 + Math.random() * 0.04,
              size: 2.4 + Math.random() * 3.0,
              color: ['#FFFFFF', '#FFD700', '#FF7700', '#FF3B00'][Math.floor(Math.random() * 4)]
            });
          }

          if (treePortal.timer >= treePortal.sputter1Duration) {
            treePortal.state = 'SPUTTER_2';
            treePortal.timer = 0;
            emitPixieDust(sample.x, sample.y, 25, ['#FF6B00', '#FFD700', '#FFF']);
          }
        }
        // ── STAGE 2: Second attempt (Reignites clockwise to 70%, crackles with quantum instability) ──
        else if (treePortal.state === 'SPUTTER_2') {
          treePortal.timer += dt;
          const p2 = treePortal.timer / treePortal.sputter2Duration;
          treePortal.ringProgress = Math.min(0.72, p2 * 0.85);

          const sample = getContourSample(treePortal.ringProgress);
          for (let s = 0; s < 8; s++) {
            const spd = 75 + Math.random() * 150;
            const sprkAng = Math.atan2(sample.tangY, sample.tangX) + (Math.random() - 0.5) * 0.9;
            treePortal.sparks.push({
              x: sample.x,
              y: sample.y,
              prevX: sample.x,
              prevY: sample.y,
              vx: Math.cos(sprkAng) * spd,
              vy: Math.sin(sprkAng) * spd + 18,
              life: 1.0,
              maxLife: 1.0,
              decay: 0.03 + Math.random() * 0.035,
              size: 2.6 + Math.random() * 3.2,
              color: ['#FFFFFF', '#FFF8DC', '#FFD700', '#FFAA00', '#FF4500'][Math.floor(Math.random() * 5)]
            });
          }

          if (treePortal.timer >= treePortal.sputter2Duration) {
            treePortal.state = 'DRAWING_RING';
            treePortal.timer = 0;
            treePortal.ringProgress = 0;
            if (window.celestialAudio) window.celestialAudio.playGlissando();
          }
        }
        // ── STAGE 3: Final Masterful Sweep (Completes full 360° tree contour) ──
        else if (treePortal.state === 'DRAWING_RING') {
          treePortal.timer += dt;
          treePortal.ringProgress = Math.min(1, treePortal.timer / treePortal.drawDuration);

          const sample = getContourSample(treePortal.ringProgress);
          for (let s = 0; s < 10; s++) {
            const spd = 90 + Math.random() * 180;
            const sprkAng = Math.atan2(sample.tangY, sample.tangX) + (Math.random() - 0.5) * 0.8;
            treePortal.sparks.push({
              x: sample.x,
              y: sample.y,
              prevX: sample.x,
              prevY: sample.y,
              vx: Math.cos(sprkAng) * spd,
              vy: Math.sin(sprkAng) * spd + 20,
              life: 1.0,
              maxLife: 1.0,
              decay: 0.022 + Math.random() * 0.028,
              size: 2.8 + Math.random() * 3.6,
              color: ['#FFFFFF', '#FFF9E6', '#FFD700', '#FFAA00', '#FF6B00', '#FF3300'][Math.floor(Math.random() * 6)]
            });
          }

          if (treePortal.ringProgress >= 1) {
            treePortal.state = 'OPEN';
            treePortal.timer = 0;
            emitPixieDust(avgX, avgY, 80, ['#FFD700', '#FF9E00', '#00FFC8', '#FFFFFF']);
            if (window.celestialAudio) window.celestialAudio.playChime(741, 1.8);
          }
        }
        // ── STAGE 4: Dimensional Portal Fully Open & Interactive ──
        else if (treePortal.state === 'OPEN') {
          treePortal.timer += dt;
          
          // Unreal Engine 5 Niagara Emitter: High-density velocity-aligned tangential sparks
          const numSparksThisFrame = treePortal.isHovered ? 18 : 10;
          for (let spk = 0; spk < numSparksThisFrame; spk++) {
            const randT = Math.random();
            const sample = getContourSample(randT, (Math.random() - 0.5) * 6.0);
            
            // Tangential ejection angle with outward radial component + turbulence
            const tangAngle = Math.atan2(sample.tangY, sample.tangX);
            const radAngle = Math.atan2(sample.normY, sample.normX);
            const ejectionAngle = tangAngle + (Math.random() - 0.4) * 0.6 + (Math.random() > 0.4 ? radAngle * 0.3 : 0);
            const spd = 90 + Math.random() * 260 * (treePortal.isHovered ? 1.4 : 1.0);
            
            treePortal.sparks.push({
              x: sample.x,
              y: sample.y,
              prevX: sample.x,
              prevY: sample.y,
              vx: Math.cos(ejectionAngle) * spd,
              vy: Math.sin(ejectionAngle) * spd - 15 + Math.random() * 30,
              life: 1.0,
              maxLife: 1.0,
              decay: 0.016 + Math.random() * 0.028,
              size: 2.2 + Math.random() * 3.8,
              color: treePortal.isHovered
                ? ['#FFFFFF', '#7AFFE3', '#00FFC8', '#FFE57F', '#FFD700'][Math.floor(Math.random() * 5)]
                : ['#FFFFFF', '#FFF8DC', '#FFE066', '#FFD700', '#FFAA00', '#FF6B00', '#FF3B00'][Math.floor(Math.random() * 7)]
            });
          }

          // Ambient floating cinders drifting into the forest glade
          if (!treePortal.ambientEmbers) treePortal.ambientEmbers = [];
          if (treePortal.ambientEmbers.length < 35 && Math.random() > 0.4) {
            const sample = getContourSample(Math.random(), (Math.random() - 0.5) * 14.0);
            treePortal.ambientEmbers.push({
              x: sample.x,
              y: sample.y,
              vx: (Math.random() - 0.5) * 25,
              vy: -15 - Math.random() * 35,
              life: 1.0,
              decay: 0.008 + Math.random() * 0.012,
              size: 1.5 + Math.random() * 2.5,
              phase: Math.random() * Math.PI * 2,
              color: ['#FFD700', '#FFAA00', '#00FFC8', '#FFF'][Math.floor(Math.random() * 4)]
            });
          }

          if (treePortal.timer >= treePortal.openDuration) {
            treePortal.state = 'CLOSING';
            treePortal.timer = 0;
          }
        }
        // ── STAGE 5: Inward Implosion & Reset ──
        else if (treePortal.state === 'CLOSING') {
          treePortal.timer += dt;
          const closeP = Math.min(1, treePortal.timer / treePortal.closeDuration);
          
          for (let spk = 0; spk < 6; spk++) {
            const sample = getContourSample(Math.random(), 0, 1 - closeP);
            treePortal.sparks.push({
              x: sample.x,
              y: sample.y,
              prevX: sample.x,
              prevY: sample.y,
              vx: (avgX - sample.x) * 4.0 + (Math.random() - 0.5) * 80,
              vy: (avgY - sample.y) * 4.0 + (Math.random() - 0.5) * 80,
              life: 1.0,
              maxLife: 1.0,
              decay: 0.04 + Math.random() * 0.03,
              size: 2.6 + Math.random() * 2.6,
              color: ['#FFFFFF', '#FFD700', '#FF9E00', '#FF4500'][Math.floor(Math.random() * 4)]
            });
          }

          if (closeP >= 1) {
            treePortal.state = 'IDLE';
            treePortal.timer = 0;
            treePortal.nextTrigger = now + 14000 + Math.random() * 9000;
          }
        }

        // ─── RENDER PORTAL GRAPHICS (NIAGARA COMPOSITE PIPELINE) ───
        if (treePortal.state === 'IDLE' || treePortal.state === 'HOLD_FOR_ASSISTANT') return;

        ctx.save();

        let drawP = treePortal.ringProgress;
        let closeScale = 1.0;
        if (treePortal.state === 'CLOSING') {
          closeScale = Math.max(0, 1 - treePortal.timer / treePortal.closeDuration);
          drawP = closeScale;
        }

        // Helper to construct path tracing along the organic tree contour
        function buildContourPath(targetP, scale = 1.0) {
          ctx.beginPath();
          const maxIdx = Math.max(1, Math.floor(targetP * (numNodes - 1)));
          for (let i = 0; i <= maxIdx; i++) {
            const pt = pts[i];
            const px = avgX + (pt.x - avgX) * scale;
            const py = avgY + (pt.y - avgY) * scale;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          if (targetP >= 0.999) ctx.closePath();
        }

        // 1. LITERAL MYSTICAL PORTAL VIEWPORT (SHOWING REAL SITE CONTENT)
        if (treePortal.state === 'OPEN' || treePortal.state === 'CLOSING') {
          const openBloom = treePortal.state === 'OPEN' 
            ? Math.min(1.0, treePortal.timer / 0.55) 
            : closeScale;

          // 1a. Ambient Golden-Amber Radiance casting glow on surrounding forest
          const boundR = treePortal.r * closeScale;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const ambientGlow = ctx.createRadialGradient(avgX, avgY, boundR * 0.5, avgX, avgY, boundR * 1.9);
          ambientGlow.addColorStop(0, treePortal.isHovered ? 'rgba(0, 255, 200, 0.45)' : 'rgba(255, 120, 0, 0.45)');
          ambientGlow.addColorStop(0.5, treePortal.isHovered ? 'rgba(0, 229, 212, 0.22)' : 'rgba(255, 80, 0, 0.22)');
          ambientGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = ambientGlow;
          ctx.fillRect(avgX - boundR * 2, avgY - boundR * 2, boundR * 4, boundR * 4);
          ctx.restore();

          ctx.save();
          ctx.globalAlpha = openBloom;
          
          // Clip precisely to the organic tree contour opening!
          buildContourPath(1.0, closeScale);
          ctx.clip();

          // 1b. Real Site Feature Image inside the portal
          const item = portalHighlights[treePortal.highlightIdx];
          const imgObj = portalImgs[treePortal.highlightIdx];
          
          if (imgObj && imgObj.complete && imgObj.naturalWidth > 0) {
            const imgZoom = 1.12 + Math.sin(now * 0.001) * 0.04;
            const imgW = boundR * 2.2 * imgZoom;
            const imgH = boundR * 2.2 * imgZoom;
            const imgX = avgX - imgW * 0.5;
            const imgY = avgY - imgH * 0.5;
            ctx.drawImage(imgObj, imgX, imgY, imgW, imgH);
          } else {
            const vortexGrad = ctx.createRadialGradient(avgX, avgY, 0, avgX, avgY, boundR);
            vortexGrad.addColorStop(0, '#060012');
            vortexGrad.addColorStop(0.5, '#120028');
            vortexGrad.addColorStop(1, '#FF6B00');
            ctx.fillStyle = vortexGrad;
            ctx.fillRect(avgX - boundR, avgY - boundR, boundR * 2, boundR * 2);
          }

          // 1c. Luminous Mystical Cosmic Ether Overlay
          const etherGrad = ctx.createRadialGradient(avgX, avgY, boundR * 0.25, avgX, avgY, boundR);
          etherGrad.addColorStop(0, 'rgba(6, 0, 18, 0.40)');
          etherGrad.addColorStop(0.70, 'rgba(18, 0, 42, 0.70)');
          etherGrad.addColorStop(0.96, 'rgba(255, 107, 0, 0.60)');
          etherGrad.addColorStop(1, 'rgba(255, 215, 0, 0.85)');
          ctx.fillStyle = etherGrad;
          ctx.fillRect(avgX - boundR, avgY - boundR, boundR * 2, boundR * 2);

          // 1d. Rotating Celestial Stardust Constellation inside the portal
          ctx.save();
          ctx.translate(avgX, avgY);
          ctx.rotate(now * 0.0015);
          for (let st = 0; st < 16; st++) {
            const stAngle = (st / 16) * Math.PI * 2;
            const stRadius = (boundR * 0.30) + (st % 4) * (boundR * 0.18);
            const sx = Math.cos(stAngle) * stRadius;
            const sy = Math.sin(stAngle) * stRadius;
            ctx.fillStyle = ['#FFFFFF', '#00FFC8', '#FFD700', '#C77DFF'][st % 4];
            ctx.shadowColor = '#FFFFFF';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();

          // 1e. Authentic Site Section Typography & CTA
          if (item && openBloom > 0.3) {
            ctx.save();
            ctx.globalAlpha = openBloom;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const isMobile = (w || window.innerWidth) < 600;

            // Tag Pill (Small Caps, Luminous Cyan/Gold)
            ctx.font = isMobile 
              ? '800 7.5px "Plus Jakarta Sans", sans-serif'
              : '800 10px "Plus Jakarta Sans", sans-serif';
            ctx.fillStyle = item.color || '#00FFC8';
            ctx.shadowColor = item.color || '#00FFC8';
            ctx.shadowBlur = 8;
            ctx.fillText(item.tag.toUpperCase(), avgX, avgY - boundR * 0.40);

            // Title (Bold Plus Jakarta Sans, Clean Celestial Glow)
            ctx.font = isMobile 
              ? '800 10.5px "Plus Jakarta Sans", sans-serif'
              : '800 14.5px "Plus Jakarta Sans", sans-serif';
            ctx.fillStyle = '#FFFFFF';
            ctx.shadowColor = '#FFFFFF';
            ctx.shadowBlur = 10;
            ctx.fillText(item.title.toUpperCase(), avgX, avgY - boundR * 0.10);

            // Subtitle
            ctx.font = isMobile 
              ? '600 8.0px "Plus Jakarta Sans", sans-serif'
              : '600 11px "Plus Jakarta Sans", sans-serif';
            ctx.fillStyle = '#E2FCF7';
            ctx.shadowColor = 'rgba(0,0,0,0.85)';
            ctx.shadowBlur = 6;
            ctx.fillText(item.subtitle, avgX, avgY + boundR * 0.16);

            // Action prompt / CTA button in portal
            ctx.font = isMobile 
              ? '800 8.0px "Plus Jakarta Sans", sans-serif'
              : '800 11px "Plus Jakarta Sans", sans-serif';
            ctx.fillStyle = treePortal.isHovered ? '#FFD700' : '#00FFC8';
            ctx.shadowColor = treePortal.isHovered ? '#FFD700' : '#00FFC8';
            ctx.shadowBlur = treePortal.isHovered ? 18 : 8;
            ctx.fillText(treePortal.isHovered ? '✦ CLICK TO ENTER ✦' : item.action.toUpperCase(), avgX, avgY + boundR * 0.40);

            ctx.restore();
          }

          ctx.restore(); // end clip
        }

        // ─── 2. NIAGARA PARTICLES & SLING-RING EMITTERS (ADDITIVE BLENDING) ───
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const shimmer = 0.94 + Math.sin(now * 0.04) * 0.08 + Math.cos(now * 0.09) * 0.04;
        const sparkJitter = shimmer;

        // 2a. Ultra-Thin Radiant Glow Halo (Soft translucent atmospheric bleed, NO heavy shadowBlur)
        ctx.strokeStyle = treePortal.isHovered ? 'rgba(0, 255, 200, 0.32)' : 'rgba(255, 90, 0, 0.32)';
        ctx.lineWidth = (3.2 + (treePortal.isHovered ? 1.2 : 0)) * sparkJitter;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        buildContourPath(drawP, closeScale);
        ctx.stroke();

        // 2b. Razor-Thin Sizzling 24K Solar Gold Filament
        ctx.strokeStyle = treePortal.isHovered ? '#7AFFE3' : '#FFD700';
        ctx.lineWidth = (1.6 + (treePortal.isHovered ? 0.4 : 0)) * sparkJitter;
        buildContourPath(drawP, closeScale);
        ctx.stroke();

        // 2c. Blinding Needle-Thin White-Hot Core Wire (Exact 1.1px wire line like movie / UE5)
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.1;
        buildContourPath(drawP, closeScale);
        ctx.stroke();

        // 2d. 3 Micro-Thin High-Frequency Electric Sparkler Jitter Filaments
        for (let strand = 0; strand < 3; strand++) {
          const strandOffset = (strand - 1.0) * 1.1;
          const strandPhase = now * (0.055 + strand * 0.028);
          ctx.strokeStyle = strand === 0 ? '#FFFFFF' : (strand === 1 ? '#FFD700' : '#FF7700');
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          const maxIdx = Math.max(1, Math.floor(drawP * (numNodes - 1)));
          for (let i = 0; i <= maxIdx; i++) {
            const pt = pts[i];
            const jitter = Math.sin(strandPhase + i * 2.8) * (1.5 + Math.cos(strandPhase * 1.1 + i * 1.8) * 1.0);
            const px = avgX + (pt.x - avgX) * closeScale + ((pt.x - avgX) / (treePortal.r || 1)) * (strandOffset + jitter);
            const py = avgY + (pt.y - avgY) * closeScale + ((pt.y - avgY) / (treePortal.r || 1)) * (strandOffset + jitter);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }

        // 2e. NIAGARA DENSE ORBITING SPARK SWARM (Batched High-Performance Execution)
        if (treePortal.orbitParticles && (treePortal.state === 'DRAWING_RING' || treePortal.state === 'OPEN' || treePortal.state === 'CLOSING')) {
          // Pass 1: All orbiting motion streaks in 1 single draw call
          ctx.strokeStyle = treePortal.isHovered ? '#7AFFE3' : '#FFD700';
          ctx.lineWidth = 0.95;
          ctx.lineCap = 'round';
          ctx.beginPath();
          for (let i = 0; i < treePortal.orbitParticles.length; i++) {
            const p = treePortal.orbitParticles[i];
            p.t = (p.t + p.speed * dt * (treePortal.isHovered ? 1.6 : 1.0)) % 1.0;
            if (p.t > drawP) continue;

            const clampedOffset = (p.offset % 3.6) * closeScale;
            const sample = getContourSample(p.t, clampedOffset, closeScale);
            const streakLen = (11 + p.speed * 15) * (treePortal.isHovered ? 1.3 : 1.0);
            ctx.moveTo(sample.x - sample.tangX * streakLen, sample.y - sample.tangY * streakLen);
            ctx.lineTo(sample.x, sample.y);
          }
          ctx.stroke();

          // Pass 2: All orbiting spark head particles in 1 single draw call
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          for (let i = 0; i < treePortal.orbitParticles.length; i++) {
            const p = treePortal.orbitParticles[i];
            if (p.t > drawP) continue;
            const clampedOffset = (p.offset % 3.6) * closeScale;
            const sample = getContourSample(p.t, clampedOffset, closeScale);
            ctx.moveTo(sample.x + 0.9, sample.y);
            ctx.arc(sample.x, sample.y, 0.9, 0, Math.PI * 2);
          }
          ctx.fill();
        }

        // 2f. NIAGARA EJECTED FLYING SPARKS (Batched High-Velocity Grinding Wheel Spray)
        if (treePortal.sparks && treePortal.sparks.length > 0) {
          ctx.strokeStyle = treePortal.isHovered ? '#7AFFE3' : '#FFAA00';
          ctx.lineWidth = 0.9;
          ctx.lineCap = 'round';
          ctx.beginPath();

          for (let i = treePortal.sparks.length - 1; i >= 0; i--) {
            const sp = treePortal.sparks[i];
            sp.prevX = sp.x;
            sp.prevY = sp.y;
            sp.x += sp.vx * dt;
            sp.y += sp.vy * dt;
            sp.vy += 150 * dt;
            sp.vx *= 0.975;
            sp.vy *= 0.975;
            sp.life -= sp.decay;

            if (sp.life <= 0) {
              treePortal.sparks.splice(i, 1);
              continue;
            }

            ctx.moveTo(sp.prevX, sp.prevY);
            ctx.lineTo(sp.x, sp.y);
          }
          ctx.stroke();

          // Ejected spark head points in 1 single draw call
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          for (let i = 0; i < treePortal.sparks.length; i++) {
            const sp = treePortal.sparks[i];
            ctx.moveTo(sp.x + 0.8, sp.y);
            ctx.arc(sp.x, sp.y, 0.8, 0, Math.PI * 2);
          }
          ctx.fill();
        }

        // 2g. NIAGARA FLOATING AMBIENT GLADE CINDERS (Batched Execution)
        if (treePortal.ambientEmbers && treePortal.ambientEmbers.length > 0) {
          ctx.fillStyle = treePortal.isHovered ? '#00FFC8' : '#FFD700';
          ctx.beginPath();
          for (let i = treePortal.ambientEmbers.length - 1; i >= 0; i--) {
            const em = treePortal.ambientEmbers[i];
            em.phase += dt * 2.5;
            em.x += (em.vx + Math.sin(em.phase) * 12) * dt;
            em.y += em.vy * dt;
            em.life -= em.decay;

            if (em.life <= 0) {
              treePortal.ambientEmbers.splice(i, 1);
              continue;
            }

            const emR = Math.max(0.6, Math.min(1.2, em.size * 0.45));
            ctx.moveTo(em.x + emR, em.y);
            ctx.arc(em.x, em.y, emR, 0, Math.PI * 2);
          }
          ctx.fill();
        }

        // 2h. Leading Spark Emitter Node (When sputtering or drawing)
        if (treePortal.state === 'SPUTTER_1' || treePortal.state === 'SPUTTER_2' || treePortal.state === 'DRAWING_RING') {
          const leadSample = getContourSample(drawP);
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(leadSample.x, leadSample.y, 3.8, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore(); // end additive blending
        ctx.restore(); // end portal graphics
      }

      function updateAndRenderHeroTinkerbell(ctx, now, dt = 0.016) {
        // Guiding Celestial Star at sky apex (Source of descent)
        const starX = w * 0.5;
        const starY = Math.max(90, h * 0.095);

        // Safely query DOM elements for class animations
        const heroLogo = document.querySelector('.hero__logo-img');
        const heroBookBtn = document.querySelector('.hero__cta-group .btn-primary');
        const aeyeWidget = document.getElementById('assistant-avatar-btn');

        // Update layout targets (efficiently cached every 300ms)
        updateHeroLayoutTargets(false);
        const {
          logoMoonX, logoMoonY,
          badgeRightX, badgeLeftX, badgeCenterX, badgeTopY,
          bookBtnX, bookBtnY,
          aeyeX, aeyeY
        } = cachedHeroTargets;

        // Target 3: Celestial Moon Background Portal Disc
        const portalX = w * 0.5;
        const portalY = h * 0.30;

        // Target 4: Lower Right Corner (Help Assistant Landing Node)
        const cornerTargetX = w - 68;
        const cornerTargetY = h - 68;

        // Polaris star now rendered on background canvas (bgCtx) in render()

        // ─── STATE MACHINE TRANSITIONS & CHOREOGRAPHY ───
        if (heroTinkerbell.state === 'SPAWNING') {
          heroTinkerbell.startX = starX;
          heroTinkerbell.startY = starY;
          heroTinkerbell.x = starX;
          heroTinkerbell.y = starY;
          heroTinkerbell.orbFlightTime = 0;
          heroTinkerbell.state = 'ORB_FLOATING';
          heroTinkerbell.facingLeft = false;
          emitPixieDust(starX, starY, 25, ['#FFD700', '#C77DFF', '#FFF', '#9D4EDD', '#00FFC8']);
        }

        // 2. ORB FLOATING — Dreamy Glinda the Good Witch Starlight Bubble Orb Descent (~7.5s)
        else if (heroTinkerbell.state === 'ORB_FLOATING') {
          heroTinkerbell.orbFlightTime += dt;
          const oft = heroTinkerbell.orbFlightTime;
          const orbDuration = 7.5;
          const progress = Math.min(1, oft / orbDuration);

          // Gentle celestial drift floating down from the star
          const drift = Math.sin(oft * 0.85) * (w * 0.08);
          const gentleBob = Math.sin(oft * 2.2) * 8;
          
          heroTinkerbell.x = starX + drift + (logoMoonX - starX) * (progress * 0.6);
          heroTinkerbell.y = starY + (logoMoonY - starY) * (progress * 0.75) + gentleBob;
          heroTinkerbell.wingPhase += dt * 12.0;

          if (Math.random() > 0.2) {
            emitPixieDust(heroTinkerbell.x, heroTinkerbell.y + 10, 2, ['#C77DFF', '#FFD700', '#FFFFFF', '#00FFC8', '#E0AAFF']);
          }

          if (oft >= orbDuration) {
            // Smooth departure: Beth leaves the Glinda orb and swoops down to the crescent moon
            heroTinkerbell.state = 'FLYING_TO_LOGO';
            heroTinkerbell.startX = heroTinkerbell.x;
            heroTinkerbell.startY = heroTinkerbell.y;
            heroTinkerbell.targetX = logoMoonX;
            heroTinkerbell.targetY = logoMoonY;
            heroTinkerbell.progress = 0;

            // Empty Glinda Starlight Bubble Orb ascends back to Polaris AS SOON AS Beth leaves!
            returningBubbleOrb.active = true;
            returningBubbleOrb.startX = heroTinkerbell.x;
            returningBubbleOrb.startY = heroTinkerbell.y;
            returningBubbleOrb.targetX = starX;
            returningBubbleOrb.targetY = starY;
            returningBubbleOrb.progress = 0;
          }
        }
        
        // 3. ARRIVAL ONTO CRESCENT MOON APEX (~2.5s)
        else if (heroTinkerbell.state === 'FLYING_TO_LOGO') {
          heroTinkerbell.progress += dt / 2.5;
          heroTinkerbell.wingPhase += dt * 24.0;

          const p = Math.min(1, heroTinkerbell.progress);
          const easeP = p * p * (3 - 2 * p);
          const swoop = Math.sin(p * Math.PI) * (w * 0.025);

          heroTinkerbell.x = (1 - easeP) * heroTinkerbell.startX + easeP * logoMoonX + swoop;
          heroTinkerbell.y = (1 - easeP) * heroTinkerbell.startY + easeP * logoMoonY;

          if (Math.random() > 0.15) {
            emitPixieDust(heroTinkerbell.x, heroTinkerbell.y + 10, 2, ['#C77DFF', '#FFD700', '#FFFFFF', '#9D4EDD', '#00FFC8']);
          }

          if (p >= 1) {
            // Land gracefully right on top of the crescent moon!
            // (Synchronously timed with the empty bubble orb arriving back at Polaris!)
            heroTinkerbell.state = 'PERCHED_LOGO';
            heroTinkerbell.x = logoMoonX;
            heroTinkerbell.y = logoMoonY;
            heroTinkerbell.perchedTime = 0;
            heroTinkerbell.logoBubbleShown = true;
            heroTinkerbell.logoBubbleHidden = false;
            globalStarSparkle = 1.0;

            if (heroLogo) heroLogo.classList.add('fairy-moon-glow');
            // Stardust burst upon landing
            emitPixieDust(heroTinkerbell.x, heroTinkerbell.y + 12, 35, ['#FFD700', '#FFFFFF', '#FFE57F', '#00FFC8', '#C77DFF']);

            // EXACT INSTANT SPEECH BUBBLE APPEARANCE ON TOUCHDOWN!
            showBethSpeechBubble("HI, I'M BETH ELISE!", logoMoonX, logoMoonY, 'side-right');
          }
        }
        
        // 4. PERCHED ON TOP OF CRESCENT MOON — Badass Look-Around (~3.2s)
        else if (heroTinkerbell.state === 'PERCHED_LOGO') {
          heroTinkerbell.perchedTime += dt;
          heroTinkerbell.wingPhase += dt * 8.0;
          const pt = heroTinkerbell.perchedTime;

          heroTinkerbell.x = logoMoonX;
          heroTinkerbell.y = logoMoonY;
          heroTinkerbell.bodySway = Math.sin(pt * 2.0) * 1.5;

          // Speech bubble on crescent moon
          if (!heroTinkerbell.logoBubbleShown) {
            heroTinkerbell.logoBubbleShown = true;
            showBethSpeechBubble("HI, I'M BETH ELISE!", heroTinkerbell.x, heroTinkerbell.y, 'side-right');
          }
          if (heroTinkerbell.logoBubbleShown && pt > 3.8 && !heroTinkerbell.logoBubbleHidden) {
            heroTinkerbell.logoBubbleHidden = true;
            hideBethSpeechBubble();
          }

          // Confident look-around sequence
          if (pt < 0.8) {
            heroTinkerbell.headAngle = -0.35; // Look left
          } else if (pt < 1.5) {
            heroTinkerbell.headAngle = 0.0;   // Center
          } else if (pt < 2.2) {
            heroTinkerbell.headAngle = 0.35;  // Look right
          } else {
            heroTinkerbell.headAngle = 0.0;  // Confident ready pose
          }

          if (Math.random() > 0.4) {
            emitPixieDust(heroTinkerbell.x + (Math.random() - 0.5) * 20, heroTinkerbell.y + 12, 1, ['#FFD700', '#FFF', '#FFE57F']);
          }

          // Next: Fly down to the Book a Reading button
          if (pt >= 4.4) {
            heroTinkerbell.state = 'FLYING_TO_BOOK_BTN';
            heroTinkerbell.startX = heroTinkerbell.x;
            heroTinkerbell.startY = heroTinkerbell.y;
            heroTinkerbell.targetX = bookBtnX;
            heroTinkerbell.targetY = bookBtnY;
            heroTinkerbell.progress = 0;
            heroTinkerbell.facingLeft = false;
            if (heroLogo) heroLogo.classList.remove('fairy-moon-glow');
            emitPixieDust(heroTinkerbell.x, heroTinkerbell.y, 25, ['#FFD700', '#C77DFF', '#FFF', '#00FFC8']);
            // Hide logo speech bubble
            if (heroTinkerbell.logoBubbleShown) {
              hideBethSpeechBubble();
              heroTinkerbell.logoBubbleHidden = true;
            }
          }
        }

        // 5. FLYING TO BOOK A READING BUTTON (~2.8s)
        else if (heroTinkerbell.state === 'FLYING_TO_BOOK_BTN') {
          heroTinkerbell.progress += dt / 2.8;
          heroTinkerbell.wingPhase += dt * 22.0;
          const p = Math.min(1, heroTinkerbell.progress);
          const easeP = p * p * (3 - 2 * p);
          const swoop = Math.sin(p * Math.PI) * (w * 0.06);
          heroTinkerbell.x = (1 - easeP) * heroTinkerbell.startX + easeP * heroTinkerbell.targetX + swoop;
          heroTinkerbell.y = (1 - easeP) * heroTinkerbell.startY + easeP * heroTinkerbell.targetY;
          heroTinkerbell.facingLeft = heroTinkerbell.x > heroTinkerbell.targetX;
          if (Math.random() > 0.3) emitPixieDust(heroTinkerbell.x, heroTinkerbell.y + 10, 2, ['#C77DFF', '#FFD700', '#00FFC8']);
          if (p >= 1) {
            heroTinkerbell.state = 'PERCHED_BOOK_BTN';
            heroTinkerbell.x = heroTinkerbell.targetX;
            heroTinkerbell.y = heroTinkerbell.targetY;
            heroTinkerbell.perchedTime = 0;
            heroTinkerbell.facingLeft = false;
            heroTinkerbell.bookBubbleShown = true;
            const heroBookBtn = document.querySelector('.hero__cta-group .btn-primary');
            if (heroBookBtn) heroBookBtn.classList.add('fairy-moon-glow');
            emitPixieDust(heroTinkerbell.x, heroTinkerbell.y + 12, 20, ['#00FFC8', '#FFD700', '#FFFFFF']);

            // EXACT INSTANT SPEECH BUBBLE APPEARANCE ON TOUCHDOWN!
            showBethSpeechBubble("BOOK A READING WITH ME!", heroTinkerbell.targetX, heroTinkerbell.targetY, 'top');
          }
        }

        // 6. PERCHED ON BOOK A READING BUTTON (~4.2s speech bubble)
        else if (heroTinkerbell.state === 'PERCHED_BOOK_BTN') {
          heroTinkerbell.perchedTime += dt;
          heroTinkerbell.wingPhase += dt * 7.0;
          heroTinkerbell.bodySway = Math.sin(heroTinkerbell.perchedTime * 1.8) * 1.2;
          heroTinkerbell.x = bookBtnX;
          heroTinkerbell.y = bookBtnY;

          const heroBookBtn = document.querySelector('.hero__cta-group .btn-primary');
          if (heroBookBtn && !heroBookBtn.classList.contains('fairy-moon-glow')) {
            heroBookBtn.classList.add('fairy-moon-glow');
          }

          if (!heroTinkerbell.bookBubbleShown) {
            heroTinkerbell.bookBubbleShown = true;
            showBethSpeechBubble("BOOK A READING WITH ME!", heroTinkerbell.x, heroTinkerbell.y, 'top');
          }
          if (Math.random() > 0.6) emitPixieDust(heroTinkerbell.x + (Math.random() - 0.5) * 16, heroTinkerbell.y + 10, 1, ['#00FFC8', '#FFD700', '#FFF']);
          if (heroTinkerbell.perchedTime >= 4.2) {
            hideBethSpeechBubble();
            if (heroBookBtn) heroBookBtn.classList.remove('fairy-moon-glow');
            heroTinkerbell.state = 'FLYING_TO_BADGE';
            heroTinkerbell.startX = heroTinkerbell.x;
            heroTinkerbell.startY = heroTinkerbell.y;
            heroTinkerbell.targetX = badgeCenterX - 170;
            heroTinkerbell.targetY = badgeTopY;
            heroTinkerbell.progress = 0;
            heroTinkerbell.facingLeft = false;
            emitPixieDust(heroTinkerbell.x, heroTinkerbell.y, 22, ['#00FFC8', '#FFD700', '#FFFFFF', '#C77DFF']);
          }
        }

        // 6b. FLYING UP FROM BOOK BUTTON TO LEFT EDGE OF CATWALK PILL BAR (~2.0s)
        else if (heroTinkerbell.state === 'FLYING_TO_BADGE') {
          heroTinkerbell.progress += dt / 2.0;
          heroTinkerbell.wingPhase += dt * 24.0;

          const p = Math.min(1, heroTinkerbell.progress);
          const easeP = p * p * (3 - 2 * p);
          const swoop = Math.sin(p * Math.PI) * (w * 0.04);
          const landX = badgeCenterX - 170;

          heroTinkerbell.x = (1 - easeP) * heroTinkerbell.startX + easeP * landX - swoop;
          heroTinkerbell.y = (1 - easeP) * heroTinkerbell.startY + easeP * badgeTopY;
          heroTinkerbell.facingLeft = false;

          if (Math.random() > 0.25) {
            emitPixieDust(heroTinkerbell.x, heroTinkerbell.y + 8, 2, ['#00FFC8', '#FFD700', '#FFF', '#C77DFF']);
          }

          if (p >= 1) {
            // Land gracefully on LEFT side of pill bar and begin confident CATWALK STRUT!
            heroTinkerbell.state = 'STRUT_ON_BADGE';
            const CATWALK_TEXT = "WITH LOVE AND LIGHT";
            const letters = CATWALK_TEXT.split('');
            const numLetters = letters.length; // 19
            const isMobile = (w || window.innerWidth) < 600;
            const usableWidth = (badgeRightX - badgeLeftX) > 0 
              ? (badgeRightX - badgeLeftX) - (isMobile ? 16 : 24)
              : (isMobile ? 260 : 320);
            const letterSpacing = isMobile
              ? Math.min(13.5, Math.max(9.5, usableWidth / (numLetters - 1)))
              : Math.min(19.0, Math.max(14.0, usableWidth / (numLetters - 1)));
            const totalSpan = letterSpacing * (numLetters - 1);
            const letterSpanStart = badgeCenterX - totalSpan * 0.5;
            const letterSpanEnd = badgeCenterX + totalSpan * 0.5;

            heroTinkerbell.x = letterSpanStart - (isMobile ? 10 : 14);
            heroTinkerbell.y = badgeTopY;
            heroTinkerbell.progress = 0;
            heroTinkerbell.strutPhase = 0;
            heroTinkerbell.isStrutting = true;
            heroTinkerbell.facingLeft = false;
            heroTinkerbell.catwalkLetters = [];
            heroTinkerbell.catwalkLettersFade = 1.0;
            heroTinkerbell.vannaBubbleShown = false;
            emitPixieDust(heroTinkerbell.x, heroTinkerbell.y, 30, ['#FFD700', '#C77DFF', '#FFFFFF', '#00FFC8']);

            heroTinkerbell.catwalkLetters = letters.map((ch, i) => ({
              char: ch, 
              isSpace: ch === ' ', 
              revealed: false, 
              revealTime: 0,
              x: badgeCenterX + (i - (numLetters - 1) * 0.5) * letterSpacing,
              y: badgeTopY - (isMobile ? 20 : 24)
            }));
          }
        }

        // 7. STRUTTING ACROSS TAGLINE BADGE — Jeopardy Letter Reveal (~5.4s)
        else if (heroTinkerbell.state === 'STRUT_ON_BADGE') {
          heroTinkerbell.progress += dt / 5.4;
          heroTinkerbell.wingPhase += dt * 14.0;
          const st = heroTinkerbell.progress * 5.4;
          heroTinkerbell.strutPhase = st * 6.5;
          const p = Math.min(1, heroTinkerbell.progress);

          const CATWALK_TEXT = "WITH LOVE AND LIGHT";
          const numLetters = CATWALK_TEXT.length;
          const isMobile = (w || window.innerWidth) < 600;
          const usableWidth = (badgeRightX - badgeLeftX) > 0 
            ? (badgeRightX - badgeLeftX) - (isMobile ? 16 : 24)
            : (isMobile ? 260 : 320);
          const letterSpacing = isMobile
            ? Math.min(13.5, Math.max(9.5, usableWidth / (numLetters - 1)))
            : Math.min(19.0, Math.max(14.0, usableWidth / (numLetters - 1)));
          const totalSpan = letterSpacing * (numLetters - 1);
          const walkStartX = badgeCenterX - totalSpan * 0.5 - (isMobile ? 10 : 14);
          const walkEndX = badgeCenterX + totalSpan * 0.5 + (isMobile ? 12 : 16);

          heroTinkerbell.x = walkStartX + p * (walkEndX - walkStartX);
          heroTinkerbell.y = badgeTopY - Math.abs(Math.sin(st * 6.5)) * 3.2; // High-fashion strut bounce
          heroTinkerbell.bodySway = Math.sin(st * 6.5) * 3.0; // Confident hip sway
          heroTinkerbell.facingLeft = false;

          // Leading reach point for Jeopardy letter touching
          const touchX = heroTinkerbell.x + 8;
          if (heroTinkerbell.catwalkLetters) {
            for (let i = 0; i < heroTinkerbell.catwalkLetters.length; i++) {
              const l = heroTinkerbell.catwalkLetters[i];
              if (!l.revealed && touchX >= l.x) {
                l.revealed = true;
                l.revealTime = now;
                if (!l.isSpace) {
                  emitPixieDust(l.x, l.y, 4, ['#FFD700', '#FFFFFF', '#00FFC8']);
                  if (window.celestialAudio) window.celestialAudio.playChime(640 + i * 22, 0.25);
                }
              }
            }
          }
          if (Math.random() > 0.3) emitPixieDust(heroTinkerbell.x - 8, heroTinkerbell.y + 14, 1, ['#FFD700', '#FFFFFF', '#00FFC8']);
          if (p >= 1) {
            // Reached right edge! Ensure all letters are 100% revealed
            if (heroTinkerbell.catwalkLetters) {
              heroTinkerbell.catwalkLetters.forEach((l) => {
                if (!l.revealed) {
                  l.revealed = true;
                  l.revealTime = now;
                }
              });
            }

            heroTinkerbell.state = 'PAUSE_ON_BADGE_EDGE';
            heroTinkerbell.x = walkEndX;
            heroTinkerbell.y = badgeTopY;
            heroTinkerbell.edgePauseTime = 0;
            heroTinkerbell.isStrutting = false;
            heroTinkerbell.facingLeft = true; // Turn back towards letters in Vanna White pose
            if (heroLogo) heroLogo.classList.add('fairy-moon-glow'); // ✦ ILLUMINATE AND PULSE LOGO DURING VANNA WHITE PRESENTATION ✦
            emitPixieDust(heroTinkerbell.x, heroTinkerbell.y, 30, ['#FFD700', '#C77DFF', '#FFFFFF', '#00FFC8']);
            if (window.celestialAudio) window.celestialAudio.playChime(852, 1.2);
          }
        }

        // 8. VANNA WHITE PAUSE AT BADGE EDGE (~3.4s + speech bubble & smooth transition)
        else if (heroTinkerbell.state === 'PAUSE_ON_BADGE_EDGE') {
          heroTinkerbell.edgePauseTime += dt;
          heroTinkerbell.wingPhase += dt * 8.0;
          heroTinkerbell.isStrutting = false;
          heroTinkerbell.diveAngle = 0;

          const pt = heroTinkerbell.edgePauseTime;
          const CATWALK_TEXT = "WITH LOVE AND LIGHT";
          const numLetters = CATWALK_TEXT.length;
          const usableWidth = Math.max(300, (badgeRightX - badgeLeftX) - 24);
          const letterSpacing = Math.min(19.0, Math.max(15.0, usableWidth / (numLetters - 1)));
          const totalSpan = letterSpacing * (numLetters - 1);
          const edgeStationX = badgeCenterX + totalSpan * 0.5 + 16;

          // Firmly stationed right next to the last letter
          heroTinkerbell.x = edgeStationX;
          heroTinkerbell.y = badgeTopY;

          // Ensure logo is glowing during Vanna White presentation
          if (heroLogo && !heroLogo.classList.contains('fairy-moon-glow')) {
            heroLogo.classList.add('fairy-moon-glow');
          }

          // Phase 1 (0 to 2.7s): Facing left towards the revealed board in Vanna White presentation pose
          if (pt < 2.7) {
            heroTinkerbell.facingLeft = true;
            heroTinkerbell.bodySway = Math.sin(pt * 2.8) * 1.6;
            heroTinkerbell.headAngle = -0.22; // Looking gracefully towards the letters
            heroTinkerbell.jumpSquash = 1.0;
            heroTinkerbell.catwalkLettersFade = 1.0;
          }
          // Phase 2 (2.7 to 3.4s): Turn forward to camera, prep spring crouch!
          else {
            heroTinkerbell.facingLeft = false;
            heroTinkerbell.headAngle = 0;
            const prepP = (pt - 2.7) / 0.7;
            heroTinkerbell.jumpSquash = 1 + Math.sin(prepP * Math.PI) * 0.14; // spring squash crouch
            heroTinkerbell.y = badgeTopY + Math.sin(prepP * Math.PI) * 6;
            heroTinkerbell.catwalkLettersFade = Math.max(0, 1 - prepP); // smooth fade during crouch
          }

          if (heroTinkerbell.edgePauseTime >= 3.4) {
            hideBethSpeechBubble();
            if (heroLogo) heroLogo.classList.remove('fairy-moon-glow');
            heroTinkerbell.state = 'FLYING_TO_AEYE';
            heroTinkerbell.startX = heroTinkerbell.x;
            heroTinkerbell.startY = heroTinkerbell.y;
            heroTinkerbell.progress = 0;
            heroTinkerbell.facingLeft = false;
            heroTinkerbell.diveAngle = 0;
            emitPixieDust(heroTinkerbell.x, heroTinkerbell.y, 35, ['#FFD700', '#C77DFF', '#FFFFFF', '#00FFC8']);
          }
        }

        // 9. FLYING DOWN TO aEYE HOME BASE CORNER (~2.2s, or fast 0.8s on fast-scroll)
        else if (heroTinkerbell.state === 'FLYING_TO_AEYE') {
          const flightDuration = heroTinkerbell.isFastScrolled ? 0.8 : 2.2;
          heroTinkerbell.progress += dt / flightDuration;
          heroTinkerbell.wingPhase += dt * 28.0;

          const p = Math.min(1, heroTinkerbell.progress);
          const easeP = p * p * (3 - 2 * p);
          const swoop = Math.sin(p * Math.PI) * (w * 0.04);

          const targetX = aeyeX;
          const targetY = aeyeY - 48; // Perch directly on top of the aEYE dais

          heroTinkerbell.x = (1 - easeP) * heroTinkerbell.startX + easeP * targetX + swoop;
          heroTinkerbell.y = (1 - easeP) * heroTinkerbell.startY + easeP * targetY;
          heroTinkerbell.facingLeft = false; // Graceful forward flight towards destination
          // Elegant fairy flight: soft aerodynamic banking into curve
          heroTinkerbell.diveAngle = Math.sin(p * Math.PI) * 0.18;

          // Streaming fairy glitter trail
          for (let t = 0; t < 3; t++) {
            emitPixieDust(
              heroTinkerbell.x + (Math.random() - 0.5) * 10,
              heroTinkerbell.y + 6 + (Math.random() - 0.5) * 10,
              2,
              ['#00FFC8', '#FFD700', '#FFFFFF', '#C77DFF']
            );
          }

          if (p >= 1) {
            heroTinkerbell.state = 'PERCHED_ON_AEYE';
            heroTinkerbell.perchedTime = 0;
            heroTinkerbell.x = targetX;
            heroTinkerbell.y = targetY;
            heroTinkerbell.diveAngle = 0; // Stands up straight and poised on the exact location she landed
            heroTinkerbell.facingLeft = true;
            heroTinkerbell.greetShown = true;
            heroTinkerbell.greetHidden = false;
            emitPixieDust(targetX, targetY, 35, ['#C77DFF', '#00FFC8', '#FFD700', '#FFFFFF']);
            if (window.celestialAudio) window.celestialAudio.playChime(639, 1.0);

            // EXACT INSTANT SPEECH BUBBLE APPEARANCE ON TOUCHDOWN!
            const msg = heroTinkerbell.isFastScrolled 
              ? "HI I'M BETH ELISE, WELCOME! USE MY aEYE IF YOU HAVE ANY QUESTIONS!" 
              : "NICE TO MEET YOU! MY aEYE ASSISTANT WILL TAKE CARE OF YOU NOW!";
            showBethSpeechBubble(msg, targetX, targetY, 'side-left');
          }
        }

        // 10. PERCHED ON TOP OF aEYE — Final Channeled Introduction (~4.8s, or 3.0s on fast-scroll)
        else if (heroTinkerbell.state === 'PERCHED_ON_AEYE') {
          heroTinkerbell.perchedTime += dt;
          heroTinkerbell.wingPhase += dt * 8.0;
          heroTinkerbell.isStrutting = false;
          heroTinkerbell.diveAngle = 0;
          heroTinkerbell.facingLeft = true;

          heroTinkerbell.x = aeyeX;
          heroTinkerbell.y = aeyeY - 48;
          heroTinkerbell.bodySway = Math.sin(now * 0.004) * 1.5;

          const pt = heroTinkerbell.perchedTime;

          // Connecting Starlight Aura under boots
          ctx.save();
          const aeyeGlowPulse = 1.0 + Math.sin(now * 0.005) * 0.15;
          const aeyeGlowGrad = ctx.createRadialGradient(heroTinkerbell.x, heroTinkerbell.y + 16, 0, heroTinkerbell.x, heroTinkerbell.y + 16, 28 * aeyeGlowPulse);
          aeyeGlowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
          aeyeGlowGrad.addColorStop(0.35, 'rgba(0, 229, 212, 0.8)');
          aeyeGlowGrad.addColorStop(0.7, 'rgba(255, 215, 0, 0.4)');
          aeyeGlowGrad.addColorStop(1, 'transparent');
          ctx.fillStyle = aeyeGlowGrad;
          ctx.beginPath();
          ctx.arc(heroTinkerbell.x, heroTinkerbell.y + 16, 28 * aeyeGlowPulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // Speech bubble in corner
          if (!heroTinkerbell.greetShown) {
            heroTinkerbell.greetShown = true;
            const msg = heroTinkerbell.isFastScrolled 
              ? "HI I'M BETH ELISE, WELCOME! USE MY aEYE IF YOU HAVE ANY QUESTIONS!" 
              : "NICE TO MEET YOU! MY aEYE ASSISTANT WILL TAKE CARE OF YOU NOW!";
            showBethSpeechBubble(msg, heroTinkerbell.x, heroTinkerbell.y, 'side-left');
          }

          if (Math.random() > 0.5) {
            emitPixieDust(heroTinkerbell.x + (Math.random() - 0.5) * 16, heroTinkerbell.y + 12, 1, ['#00FFC8', '#FFD700', '#FFFFFF']);
          }

          const perchLimit = heroTinkerbell.isFastScrolled ? 3.0 : 4.8;
          if (pt >= perchLimit) {
            hideBethSpeechBubble();
            heroTinkerbell.state = 'BETH_HIGH_LEAP';
            heroTinkerbell.jumpTime = 0;
            heroTinkerbell.startX = heroTinkerbell.x;
            heroTinkerbell.startY = heroTinkerbell.y;
            heroTinkerbell.facingLeft = false;
            emitPixieDust(heroTinkerbell.x, heroTinkerbell.y, 30, ['#FFD700', '#00FFC8', '#FFFFFF']);
          }
        }

        // 11. BETH OLYMPIC HIGH AIR LEAP & VERTICAL HEADFIRST SWAN DIVE INTO aEYE CORNER (~1.4s)
        else if (heroTinkerbell.state === 'BETH_HIGH_LEAP') {
          heroTinkerbell.jumpTime = (heroTinkerbell.jumpTime || 0) + dt;
          heroTinkerbell.isStrutting = false;
          heroTinkerbell.facingLeft = false;

          const CROUCH = 0.25;  // Compress and load spring power
          const FLIGHT = 1.15;  // High vertical leap + Olympic headfirst swan dive
          const jt = heroTinkerbell.jumpTime;

          if (jt < CROUCH) {
            // Dip down and compress into spring squat
            const c = jt / CROUCH;
            heroTinkerbell.wingPhase += dt * 18.0;
            heroTinkerbell.y = heroTinkerbell.startY + Math.sin(c * Math.PI) * 8;
            heroTinkerbell.jumpSquash = 1 + Math.sin(c * Math.PI) * 0.12;
            heroTinkerbell.alpha = 1;
            heroTinkerbell.diveAngle = 0;
          } else {
            const f = Math.min(1, (jt - CROUCH) / FLIGHT);
            heroTinkerbell.wingPhase += dt * 36.0;
            heroTinkerbell.jumpSquash = 1 - Math.sin(f * Math.PI) * 0.08;

            // Olympic leap arc: launches 175px straight upward into the sky above the aEYE!
            const launchArc = Math.sin(f * Math.PI) * 175;
            heroTinkerbell.x = (1 - f) * heroTinkerbell.startX + f * aeyeX;
            heroTinkerbell.y = heroTinkerbell.startY + (aeyeY - heroTinkerbell.startY) * f - launchArc;

            // Phase 1 (f < 0.5): Flies straight UP with upright poise
            // Phase 2 (f 0.5 -> 0.75): Rotates at apex into sleek headfirst Olympic swan dive
            // Phase 3 (f > 0.75): Plunges vertically headfirst straight into the center of the aEye!
            if (f < 0.5) {
              heroTinkerbell.diveAngle = 0;
            } else if (f < 0.75) {
              const rotF = (f - 0.5) / 0.25;
              heroTinkerbell.diveAngle = rotF * Math.PI;
            } else {
              heroTinkerbell.diveAngle = Math.PI;
            }

            // Continuous trailing ribbon stardust off heels
            for (let t = 0; t < 3; t++) {
              emitPixieDust(
                heroTinkerbell.x + (Math.random() - 0.5) * 10,
                heroTinkerbell.y + 6 + (Math.random() - 0.5) * 10,
                2,
                ['#C77DFF', '#FFD700', '#00FFC8', '#FFFFFF', '#E0AAFF']
              );
            }

            // Shrink into center over final plunge
            heroTinkerbell.alpha = f > 0.82 ? Math.max(0, (1 - f) / 0.18) : 1;

            if (f >= 1) {
              // Plunge headfirst into exact center of aEYE circle — perfectly synced aEYE appearance & splash!
              heroTinkerbell.state = 'ASSISTANT_ACTIVE';
              if (typeof window.startTreePortalSequence === 'function') window.startTreePortalSequence();
              heroTinkerbell.x = aeyeX;
              heroTinkerbell.y = aeyeY;
              heroTinkerbell.alpha = 0; // DISAPPEARED inside aEYE until summoned!
              heroTinkerbell.diveAngle = 0;
              heroTinkerbell.splashTime = 0; // Trigger triple expanding shockwave rings and core flash

              // 1. Synchronously make the aEYE widget appear!
              const widget = document.getElementById('sacred-assistant-widget');
              if (widget) {
                widget.classList.add('visible');
              }

              // 2. Trigger widget splash shockwave and 360 stardust burst
              if (aeyeWidget) {
                aeyeWidget.classList.remove('aeye-splash-active');
                void aeyeWidget.offsetWidth;
                aeyeWidget.classList.add('aeye-splash-active');
              }

              // Turn OFF logo warm glowing when she dives into the aEYE
              const heroLogoImg = document.querySelector('.hero__logo-img');
              if (heroLogoImg) {
                heroLogoImg.classList.remove('fairy-moon-glow');
              }

              emitPixieDust(aeyeX, aeyeY, 60, ['#00FFC8', '#FFD700', '#FFFFFF', '#C77DFF', '#9D4EDD']);
              
              for (let i = 0; i < 16; i++) {
                const angle = (i / 16) * Math.PI * 2;
                const dist = 35 + Math.random() * 25;
                emitPixieDust(
                  aeyeX + Math.cos(angle) * dist,
                  aeyeY + Math.sin(angle) * dist,
                  2,
                  ['#00FFC8', '#FFD700', '#FFFFFF']
                );
              }

              // 3. Assistant speech bubble introduction
              const thoughtBubble = document.getElementById('assistant-speech-bubble');
              const bubbleTxt = document.getElementById('assistant-bubble-text');
              if (thoughtBubble && bubbleTxt) {
                thoughtBubble.classList.remove('hidden', 'fading');
                thoughtBubble.style.opacity = '1';
                bubbleTxt.innerHTML = "✦ HI, I'M YOUR <span class=\"aeye-brand\"><span class=\"aeye-a\">a</span><span class=\"aeye-eye\">EYE</span></span> ASSISTANT. CLICK ME FOR ANY HELP YOU NEED. ✦";
                setTimeout(() => {
                  thoughtBubble.classList.add('fading');
                  setTimeout(() => thoughtBubble.classList.add('hidden'), 500);
                }, 6000);
              }

              if (window.celestialAudio) window.celestialAudio.playChime(963, 1.4);
            }
          }
        }

        // 9. ASSISTANT RESTING INSIDE aEYE (DISAPPEARED until summoned)
        else if (heroTinkerbell.state === 'ASSISTANT_DIVED' || heroTinkerbell.state === 'ASSISTANT_ACTIVE') {
          heroTinkerbell.state = 'ASSISTANT_ACTIVE';
          heroTinkerbell.x = aeyeX;
          heroTinkerbell.y = aeyeY;
          heroTinkerbell.alpha = 0; // DISAPPEARED!
          heroTinkerbell.diveAngle = 0;
          heroTinkerbell.isStrutting = false;
        }

        // 10. COMPANION RACE TO MENU: AVATAR BETH & LIVING aEYE
        else if (heroTinkerbell.state === 'MENU_TAKEOFF') {
          heroTinkerbell.progress += dt / 0.82;
          heroTinkerbell.wingPhase += dt * 32.0;
          const p = Math.min(1, heroTinkerbell.progress);
          const easeP = p * p * (3 - 2 * p);

          // Target for Avatar Beth: Top-right corner of the aEYE assistant modal menu
          let menuCornerX = w * 0.5 + 240;
          let menuCornerY = Math.max(40, h * 0.22);
          const modalCard = document.querySelector('.assistant-modal-card');
          if (modalCard) {
            const mRect = modalCard.getBoundingClientRect();
            if (mRect.width > 0) {
              menuCornerX = mRect.right - 18;
              menuCornerY = mRect.top + 28;
            }
          }

          const arc = Math.sin(p * Math.PI) * (-50);
          heroTinkerbell.x = (1 - easeP) * heroTinkerbell.startX + easeP * menuCornerX;
          heroTinkerbell.y = (1 - easeP) * heroTinkerbell.startY + easeP * menuCornerY + arc;
          heroTinkerbell.facingLeft = true;
          heroTinkerbell.alpha = 1; // REAPPEAR!
          heroTinkerbell.diveAngle = -0.25 * (1 - p);

          // Sparkling glitter trail behind Beth's flight
          for (let t = 0; t < 3; t++) {
            emitPixieDust(
              heroTinkerbell.x + (Math.random() - 0.5) * 12,
              heroTinkerbell.y + 4 + (Math.random() - 0.5) * 12,
              2,
              ['#FFD700', '#00FFC8', '#FFFFFF', '#C77DFF']
            );
          }

          if (p >= 1) {
            heroTinkerbell.state = 'MENU_PERCHED';
            heroTinkerbell.x = menuCornerX;
            heroTinkerbell.y = menuCornerY;
            heroTinkerbell.diveAngle = 0;
            heroTinkerbell.menuBubbleShown = true;
            emitPixieDust(menuCornerX, menuCornerY, 25, ['#00FFC8', '#FFD700', '#FFFFFF']);

            // EXACT INSTANT SPEECH BUBBLE APPEARANCE ON TOUCHDOWN!
            showBethSpeechBubble("How may we help you?", menuCornerX, menuCornerY, 'top');
          }
        }

        // 11. HOVER AT TOP CORNER OF MODAL MENU — "HOW MAY WE HELP YOU?"
        else if (heroTinkerbell.state === 'MENU_PERCHED') {
          let menuCornerX = w * 0.5 + 240;
          let menuCornerY = Math.max(40, h * 0.22);
          const modalCard = document.querySelector('.assistant-modal-card');
          if (modalCard) {
            const mRect = modalCard.getBoundingClientRect();
            if (mRect.width > 0) {
              menuCornerX = mRect.right - 18;
              menuCornerY = mRect.top + 28;
            }
          }

          heroTinkerbell.x = menuCornerX;
          heroTinkerbell.y = menuCornerY + Math.sin(now * 0.005) * 3.5;
          heroTinkerbell.wingPhase += dt * 14.0;
          heroTinkerbell.bodySway = Math.sin(now * 0.004) * 1.8;
          heroTinkerbell.facingLeft = true;
          heroTinkerbell.diveAngle = 0;
          heroTinkerbell.alpha = 1;

          if (!heroTinkerbell.menuBubbleShown) {
            heroTinkerbell.menuBubbleShown = true;
            showBethSpeechBubble("How may we help you?", heroTinkerbell.x, heroTinkerbell.y, 'top');
          }

          if (Math.random() > 0.75) {
            emitPixieDust(
              heroTinkerbell.x + (Math.random() - 0.5) * 18,
              heroTinkerbell.y + (Math.random() - 0.5) * 18,
              1,
              ['#FFD700', '#00FFC8', '#FFF']
            );
          }
        }

        // 12. DIVE BACK DOWN TO aEYE WITH GLITTER TRAIL & SPLASH EFFECT (THEN DISAPPEAR)
        else if (heroTinkerbell.state === 'MENU_DIVE_BACK') {
          heroTinkerbell.progress += dt / 0.85;
          heroTinkerbell.wingPhase += dt * 34.0;
          const p = Math.min(1, heroTinkerbell.progress);
          const easeP = p * p * (3 - 2 * p);

          let targetAeyeX = aeyeX;
          let targetAeyeY = aeyeY;
          if (aeyeWidget) {
            const aeRect = aeyeWidget.getBoundingClientRect();
            if (aeRect.width > 0) {
              targetAeyeX = aeRect.left + aeRect.width * 0.5;
              targetAeyeY = aeRect.top + aeRect.height * 0.5;
            }
          }

          const arc = Math.sin(p * Math.PI) * 60;
          heroTinkerbell.x = (1 - easeP) * heroTinkerbell.startX + easeP * targetAeyeX;
          heroTinkerbell.y = (1 - easeP) * heroTinkerbell.startY + easeP * targetAeyeY + arc;
          heroTinkerbell.diveAngle = p * Math.PI * 2.0;
          heroTinkerbell.facingLeft = false;

          // Rich ribbon glitter trail
          for (let t = 0; t < 4; t++) {
            emitPixieDust(
              heroTinkerbell.x + (Math.random() - 0.5) * 14,
              heroTinkerbell.y + 4 + (Math.random() - 0.5) * 14,
              2,
              ['#00FFC8', '#FFD700', '#FFFFFF', '#C77DFF', '#E0AAFF']
            );
          }

          // Shrink into center of aEYE circle on final 20%
          if (p > 0.8) {
            heroTinkerbell.alpha = Math.max(0, (1 - p) / 0.2);
          }

          if (p >= 1) {
            // Dive into aEYE with explosive splash effect and DISAPPEAR!
            heroTinkerbell.state = 'ASSISTANT_ACTIVE';
            heroTinkerbell.x = targetAeyeX;
            heroTinkerbell.y = targetAeyeY;
            heroTinkerbell.alpha = 0; // DISAPPEARED inside aEYE until summoned again!
            heroTinkerbell.diveAngle = 0;
            heroTinkerbell.splashTime = 0; // Trigger 3 expanding shockwave rings and core flash
            emitPixieDust(targetAeyeX, targetAeyeY, 60, ['#00FFC8', '#FFD700', '#FFFFFF', '#C77DFF', '#9D4EDD']);

            if (aeyeWidget) {
              aeyeWidget.classList.remove('aeye-splash-active');
              void aeyeWidget.offsetWidth;
              aeyeWidget.classList.add('aeye-splash-active');
            }

            if (window.celestialAudio) window.celestialAudio.playChime(963, 1.2);
          }
        }

        // ─── LIVING aEYE MENU RACE UPDATE LOOP ───
        if (heroAeyeMenu.state === 'MENU_TAKEOFF') {
          heroAeyeMenu.progress += dt / 0.78;
          const p = Math.min(1, heroAeyeMenu.progress);
          const easeP = p * p * (3 - 2 * p);

          const arc = Math.sin(p * Math.PI) * (-60);
          heroAeyeMenu.x = (1 - easeP) * heroAeyeMenu.startX + easeP * heroAeyeMenu.targetX;
          heroAeyeMenu.y = (1 - easeP) * heroAeyeMenu.startY + easeP * heroAeyeMenu.targetY + arc;
          heroAeyeMenu.alpha = 1;

          if (Math.random() > 0.3) {
            emitPixieDust(
              heroAeyeMenu.x + (Math.random() - 0.5) * 10,
              heroAeyeMenu.y + (Math.random() - 0.5) * 10,
              2,
              ['#00FFC8', '#FFD700', '#FFFFFF', '#C77DFF']
            );
          }

          if (p >= 1) {
            heroAeyeMenu.state = 'MENU_PERCHED';
            heroAeyeMenu.x = heroAeyeMenu.targetX;
            heroAeyeMenu.y = heroAeyeMenu.targetY;
            emitPixieDust(heroAeyeMenu.x, heroAeyeMenu.y, 25, ['#00FFC8', '#FFD700', '#FFFFFF']);
          }
        }
        else if (heroAeyeMenu.state === 'MENU_PERCHED') {
          const eyeOrb = document.getElementById('assistant-modal-icon-orb');
          if (eyeOrb) {
            const oRect = eyeOrb.getBoundingClientRect();
            if (oRect.width > 0) {
              heroAeyeMenu.x = oRect.left + oRect.width * 0.5;
              heroAeyeMenu.y = oRect.top + oRect.height * 0.5;
            }
          }
          heroAeyeMenu.alpha = 1;

          // Mouse cursor tracking vs autonomous look-around saccades
          const isMouseMoving = (now - lastMouseMoveTime < 2500 && mouse.x > -100);
          if (isMouseMoving) {
            const dx = mouse.x - heroAeyeMenu.x;
            const dy = mouse.y - heroAeyeMenu.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.1) {
              const travel = Math.min(0.85, dist * 0.0035);
              heroAeyeMenu.targetGazeX = (dx / dist) * travel;
              heroAeyeMenu.targetGazeY = (dy / dist) * travel;
            }
          } else {
            if (now - (heroAeyeMenu.lastSaccade || 0) > 2000 + Math.random() * 2400) {
              heroAeyeMenu.lastSaccade = now;
              const ang = Math.random() * Math.PI * 2;
              const dst = 0.35 + Math.random() * 0.50;
              heroAeyeMenu.targetGazeX = Math.cos(ang) * dst;
              heroAeyeMenu.targetGazeY = Math.sin(ang) * dst * 0.65;
            }
          }
          heroAeyeMenu.gazeX = (heroAeyeMenu.gazeX || 0) + ((heroAeyeMenu.targetGazeX || 0) - (heroAeyeMenu.gazeX || 0)) * 0.15;
          heroAeyeMenu.gazeY = (heroAeyeMenu.gazeY || 0) + ((heroAeyeMenu.targetGazeY || 0) - (heroAeyeMenu.gazeY || 0)) * 0.15;

          if (now > (heroAeyeMenu.nextBlinkTime || 0)) {
            const bElapsed = (now - (heroAeyeMenu.nextBlinkTime || 0)) / 220;
            if (bElapsed < 0.5) heroAeyeMenu.blinkPhase = bElapsed * 2;
            else if (bElapsed < 1.0) heroAeyeMenu.blinkPhase = (1 - bElapsed) * 2;
            else {
              heroAeyeMenu.blinkPhase = 0;
              heroAeyeMenu.nextBlinkTime = now + 2800 + Math.random() * 2400;
            }
          }
        }
        else if (heroAeyeMenu.state === 'MENU_DIVE_BACK') {
          heroAeyeMenu.progress += dt / 0.65;
          const p = Math.min(1, heroAeyeMenu.progress);
          const easeP = p * p * (3 - 2 * p);

          let targetAeyeX = aeyeX;
          let targetAeyeY = aeyeY;
          if (aeyeWidget) {
            const aeRect = aeyeWidget.getBoundingClientRect();
            if (aeRect.width > 0) {
              targetAeyeX = aeRect.left + aeRect.width * 0.5;
              targetAeyeY = aeRect.top + aeRect.height * 0.5;
            }
          }

          const arc = Math.sin(p * Math.PI) * 40;
          heroAeyeMenu.x = (1 - easeP) * heroAeyeMenu.startX + easeP * targetAeyeX;
          heroAeyeMenu.y = (1 - easeP) * heroAeyeMenu.startY + easeP * targetAeyeY + arc;
          heroAeyeMenu.alpha = 1;

          if (Math.random() > 0.4) {
            emitPixieDust(heroAeyeMenu.x, heroAeyeMenu.y, 2, ['#00FFC8', '#FFD700', '#FFFFFF']);
          }

          if (p >= 1) {
            heroAeyeMenu.state = 'IDLE';
            heroAeyeMenu.alpha = 0;
            heroAeyeMenu.x = targetAeyeX;
            heroAeyeMenu.y = targetAeyeY;
            emitPixieDust(targetAeyeX, targetAeyeY, 40, ['#00FFC8', '#FFD700', '#FFFFFF', '#C77DFF']);

            const widget = document.getElementById('sacred-assistant-widget');
            if (widget) {
              widget.classList.remove('aeye-in-flight');
              widget.classList.remove('aeye-splash-active');
              void widget.offsetWidth;
              widget.classList.add('aeye-splash-active');
            }
            if (aeyeWidget) {
              aeyeWidget.style.opacity = '1';
              aeyeWidget.style.pointerEvents = 'auto';
              aeyeWidget.classList.remove('aeye-splash-active');
              void aeyeWidget.offsetWidth;
              aeyeWidget.classList.add('aeye-splash-active');
            }
          }
        }

        // 13. AURA SCANNER FLIGHT (Takes off from corner homebase, flies into modal portal, looks around and grows bigger)
        else if (heroTinkerbell.state === 'AURA_TAKEOFF') {
          heroTinkerbell.progress += dt / 0.70;
          const p = Math.min(1, heroTinkerbell.progress);
          const easeP = p * p * (3 - 2 * p);

          // Get live portal target
          const portal = document.getElementById('aura-card-eye-portal');
          let curTargetX = heroTinkerbell.targetX || (w * 0.5);
          let curTargetY = heroTinkerbell.targetY || (h * 0.42);
          if (portal) {
            const rect = portal.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              curTargetX = rect.left + rect.width * 0.5;
              curTargetY = rect.top + rect.height * 0.5;
            }
          }

          const arc = Math.sin(p * Math.PI) * (-60);
          heroTinkerbell.x = (1 - easeP) * heroTinkerbell.startX + easeP * curTargetX;
          heroTinkerbell.y = (1 - easeP) * heroTinkerbell.startY + easeP * curTargetY + arc;
          heroTinkerbell.scale = 1.0 + 1.25 * easeP; // Grows from 1.0x to 2.25x!
          heroTinkerbell.alpha = 1;

          // Container top-right corner target for Avatar Beth
          const card = document.getElementById('aura-reading-card');
          let fairyCornerX = curTargetX + 180;
          let fairyCornerY = curTargetY - 120;
          if (card) {
            const cr = card.getBoundingClientRect();
            if (cr.width > 0 && cr.height > 0) {
              fairyCornerX = cr.right - 14;
              fairyCornerY = cr.top + 8;
            }
          }
          heroTinkerbell.fairyCornerX = fairyCornerX;
          heroTinkerbell.fairyCornerY = fairyCornerY;
          const fStartX = heroTinkerbell.fairyStartX || heroTinkerbell.startX;
          const fStartY = heroTinkerbell.fairyStartY || heroTinkerbell.startY;
          heroTinkerbell.fairyX = (1 - easeP) * fStartX + easeP * fairyCornerX + Math.sin(p * Math.PI) * 20;
          heroTinkerbell.fairyY = (1 - easeP) * fStartY + easeP * fairyCornerY - Math.sin(p * Math.PI) * 50;
          heroTinkerbell.fairyWingPhase = (heroTinkerbell.fairyWingPhase || 0) + dt * 32.0;
          heroTinkerbell.fairyFacingLeft = true;

          // Eye looks around curiously during flight up & expansion (normalized gaze -0.45 to +0.45)
          if (now - (heroTinkerbell.auraLastSaccade || 0) > 160 + Math.random() * 180) {
            heroTinkerbell.auraLastSaccade = now;
            const ang = Math.random() * Math.PI * 2;
            const dst = 0.20 + Math.random() * 0.25;
            heroTinkerbell.auraSaccadeX = Math.cos(ang) * dst;
            heroTinkerbell.auraSaccadeY = Math.sin(ang) * dst * 0.7;
          }
          heroTinkerbell.auraGazeX = (heroTinkerbell.auraGazeX || 0) + ((heroTinkerbell.auraSaccadeX || 0) - (heroTinkerbell.auraGazeX || 0)) * 0.22;
          heroTinkerbell.auraGazeY = (heroTinkerbell.auraGazeY || 0) + ((heroTinkerbell.auraSaccadeY || 0) - (heroTinkerbell.auraGazeY || 0)) * 0.22;

          // Sparkling glitter trail from both aEye and Avatar Beth
          for (let t = 0; t < 2; t++) {
            emitPixieDust(
              heroTinkerbell.x + (Math.random() - 0.5) * 16,
              heroTinkerbell.y + (Math.random() - 0.5) * 16,
              1,
              ['#00FFC8', '#FFD700', '#FFFFFF', '#C77DFF']
            );
            emitPixieDust(
              heroTinkerbell.fairyX + (Math.random() - 0.5) * 12,
              heroTinkerbell.fairyY + (Math.random() - 0.5) * 12,
              1,
              ['#FFD700', '#00FFC8', '#FFFFFF']
            );
          }

          if (p >= 1) {
            heroTinkerbell.state = 'AURA_SCANNING';
            heroTinkerbell.scanTimer = 0;
            emitPixieDust(heroTinkerbell.x, heroTinkerbell.y, 40, ['#00FFC8', '#FFD700', '#FFFFFF', '#9D4EDD']);
            emitPixieDust(heroTinkerbell.fairyX, heroTinkerbell.fairyY, 25, ['#FFD700', '#00FFC8', '#FFFFFF']);
            if (typeof showBethSpeechBubble === 'function') {
              showBethSpeechBubble("HANG TIGHT, WE'RE WORKING ON IT<span class=\"aura-buffering-dots\"><span class=\"bdot bdot-1\">.</span><span class=\"bdot bdot-2\">.</span><span class=\"bdot bdot-3\">.</span></span>", heroTinkerbell.fairyX, heroTinkerbell.fairyY, 'side-left');
            }
            if (window.celestialAudio) window.celestialAudio.playTibetanBowl(528, 2.5, true);
          }
        }

        // 13b. AURA RESCAN RAPID BLINK (Stays in place, blinks rapidly 3 times, then restarts laser scan)
        else if (heroTinkerbell.state === 'AURA_RESCAN_BLINK') {
          heroTinkerbell.rescanTimer = (heroTinkerbell.rescanTimer || 0) + dt;
          heroTinkerbell.scale = 2.25;
          heroTinkerbell.alpha = 1;

          // Track live portal coordinates
          const portal = document.getElementById('aura-card-eye-portal');
          if (portal) {
            const rect = portal.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const pX = rect.left + rect.width * 0.5;
              const pY = rect.top + rect.height * 0.5;
              heroTinkerbell.x += (pX - heroTinkerbell.x) * 0.3;
              heroTinkerbell.y += (pY - heroTinkerbell.y) * 0.3;
            }
          }

          // Rapid 3-blink pulse (~0.7s total)
          const BLINK_DURATION = 0.70;
          const bt = heroTinkerbell.rescanTimer;
          heroTinkerbell.auraBlinkPhase = Math.max(0, Math.sin(bt * Math.PI * 4.5));

          const statusStepText = document.getElementById('aura-scanning-step-text');
          if (statusStepText) {
            statusStepText.textContent = '✦ aEYE Recalibrating Bio-Frequency... ✦';
          }

          if (Math.random() > 0.4) {
            emitPixieDust(
              heroTinkerbell.x + (Math.random() - 0.5) * 40,
              heroTinkerbell.y + (Math.random() - 0.5) * 40,
              1,
              ['#00FFC8', '#FFD700', '#FFFFFF', '#C77DFF']
            );
          }

          if (bt >= BLINK_DURATION) {
            heroTinkerbell.state = 'AURA_SCANNING';
            heroTinkerbell.scanTimer = 0;
            heroTinkerbell.auraBlinkPhase = 0;
            emitPixieDust(heroTinkerbell.x, heroTinkerbell.y, 45, ['#00FFC8', '#FFD700', '#FFFFFF', '#9D4EDD']);
            if (window.celestialAudio) window.celestialAudio.playTibetanBowl(528, 2.5, true);
          }
        }

        // 14. AURA SCANNER LASER SCAN (4-Pass: Horizontal -> Vertical -> Horizontal -> Vertical)
        else if (heroTinkerbell.state === 'AURA_SCANNING') {
          heroTinkerbell.scanTimer += dt;
          heroTinkerbell.scale = 1.85;
          heroTinkerbell.alpha = 1;
          heroTinkerbell.auraBlinkPhase = 0;

          // Smoothly track portal center coordinates inside the card
          const portal = document.getElementById('aura-card-eye-portal');
          if (portal) {
            const rect = portal.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const pX = rect.left + rect.width * 0.5;
              const pY = rect.top + rect.height * 0.5;
              heroTinkerbell.x += (pX - heroTinkerbell.x) * 0.25;
              heroTinkerbell.y += (pY - heroTinkerbell.y) * 0.25;
            }
          }

          // Smoothly track container top-right corner coordinates for perched Avatar Beth
          const card = document.getElementById('aura-reading-card');
          if (card) {
            const cr = card.getBoundingClientRect();
            if (cr.width > 0 && cr.height > 0) {
              heroTinkerbell.fairyCornerX = cr.right - 14;
              heroTinkerbell.fairyCornerY = cr.top + 8;
            }
          }
          heroTinkerbell.fairyX = heroTinkerbell.fairyCornerX || (heroTinkerbell.x + 180);
          heroTinkerbell.fairyY = (heroTinkerbell.fairyCornerY || (heroTinkerbell.y - 120)) + Math.sin(now * 0.005) * 1.5;
          heroTinkerbell.fairyWingPhase = (heroTinkerbell.fairyWingPhase || 0) + dt * 10.0;
          heroTinkerbell.fairyFacingLeft = true;

          const SCAN_DURATION = 2.80; // Extended slightly for cinematic pacing (0.70s per pass)
          const totalScanP = Math.min(1, Math.max(0, heroTinkerbell.scanTimer / SCAN_DURATION));
          const passIdx = Math.min(3, Math.floor(totalScanP * 4));
          const passFrac = (totalScanP - passIdx * 0.25) * 4;
          const easeP = passFrac * passFrac * (3 - 2 * passFrac); // Smooth biological scan easing

          // ─── ACTIVE EYE GAZE TRACKING THE LASER BEAM ───
          let targetGazeX = 0;
          let targetGazeY = 0;
          const sW = window.innerWidth || 1920;
          const sH = window.innerHeight || 1080;
          const scanTopY = heroTinkerbell.y + 24;
          const scanBotY = Math.min(sH - 24, heroTinkerbell.y + 520);
          const scanWidth = Math.min(sW * 0.82, 780);

          if (passIdx === 0) {
            // Pass 0: Horizontal Sweep (Left to Right)
            const leftX = heroTinkerbell.x - scanWidth * 0.5;
            const rightX = heroTinkerbell.x + scanWidth * 0.5;
            const sweepX = leftX + easeP * (rightX - leftX);
            const relX = (sweepX - heroTinkerbell.x) / (scanWidth * 0.5);
            targetGazeX = Math.max(-0.95, Math.min(0.95, relX * 0.95));
            targetGazeY = 0.35 + Math.sin(passFrac * Math.PI) * 0.12; // Looking down/forward at the scan
          } else if (passIdx === 1) {
            // Pass 1: Vertical Sweep (Top to Bottom)
            const sweepY = scanTopY + easeP * (scanBotY - scanTopY);
            const relY = (sweepY - heroTinkerbell.y) / (scanBotY - scanTopY);
            targetGazeX = Math.sin(passFrac * Math.PI * 4) * 0.08;
            targetGazeY = 0.10 + relY * 0.80;
          } else if (passIdx === 2) {
            // Pass 2: Horizontal Sweep (Right to Left)
            const leftX = heroTinkerbell.x - scanWidth * 0.5;
            const rightX = heroTinkerbell.x + scanWidth * 0.5;
            const sweepX = rightX - easeP * (rightX - leftX);
            const relX = (sweepX - heroTinkerbell.x) / (scanWidth * 0.5);
            targetGazeX = Math.max(-0.95, Math.min(0.95, relX * 0.95));
            targetGazeY = 0.35 + Math.sin(passFrac * Math.PI) * 0.12;
          } else {
            // Pass 3: Vertical Sweep (Bottom to Top / Crown Attunement)
            const sweepY = scanBotY - easeP * (scanBotY - scanTopY);
            const relY = (sweepY - heroTinkerbell.y) / (scanBotY - scanTopY);
            targetGazeX = Math.sin(passFrac * Math.PI * 4) * 0.08;
            targetGazeY = 0.10 + relY * 0.80;
          }

          // Organic fixational tremor (25Hz micro-ocular oscillation)
          const microTremorX = Math.sin(now * 0.038) * 0.025;
          const microTremorY = Math.cos(now * 0.044) * 0.020;

          // Responsive eye muscle damping
          heroTinkerbell.auraGazeX = (heroTinkerbell.auraGazeX || 0) + (targetGazeX + microTremorX - (heroTinkerbell.auraGazeX || 0)) * 0.35;
          heroTinkerbell.auraGazeY = (heroTinkerbell.auraGazeY || 0) + (targetGazeY + microTremorY - (heroTinkerbell.auraGazeY || 0)) * 0.35;

          const statusStepText = document.getElementById('aura-scanning-step-text');
          if (statusStepText) {
            if (passIdx === 0) statusStepText.textContent = '✦ Pass 1/4: Quantum Bio-Field Mapping (852 Hz) ✦';
            else if (passIdx === 1) statusStepText.textContent = '✦ Pass 2/4: Solar Prana Chakra Resonance (528 Hz) ✦';
            else if (passIdx === 2) statusStepText.textContent = '✦ Pass 3/4: Amethyst Quantum Waveform (963 Hz) ✦';
            else statusStepText.textContent = '✦ Pass 4/4: Divine Crown Attunement (1111 Hz) ✦';
          }

          if (totalScanP >= 1) {
            heroTinkerbell.state = 'AURA_LOCKED';
            heroTinkerbell.lockTimer = 0;
            emitPixieDust(heroTinkerbell.x, heroTinkerbell.y, 50, ['#FFD700', '#00FFC8', '#FFFFFF', '#FFE57F']);
            if (window.celestialAudio) {
              window.celestialAudio.playChime(963, 1.5);
              window.celestialAudio.playChime(528, 1.5);
            }
          }
        }

        // 14b. AURA SCANNER LOCKED-IN CONFIRMATION (~0.55s)
        else if (heroTinkerbell.state === 'AURA_LOCKED') {
          heroTinkerbell.lockTimer = (heroTinkerbell.lockTimer || 0) + dt;
          heroTinkerbell.scale = 1.85;
          heroTinkerbell.alpha = 1;
          heroTinkerbell.auraBlinkPhase = 0;

          // Firmly snap gaze dead-center forward on viewer with intense focused lock
          heroTinkerbell.auraGazeX = (heroTinkerbell.auraGazeX || 0) * 0.50;
          heroTinkerbell.auraGazeY = (heroTinkerbell.auraGazeY || 0) * 0.50;

          // Firmly hold center inside portal
          const portal = document.getElementById('aura-card-eye-portal');
          if (portal) {
            const rect = portal.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const pX = rect.left + rect.width * 0.5;
              const pY = rect.top + rect.height * 0.5;
              heroTinkerbell.x = pX;
              heroTinkerbell.y = pY;
            }
          }

          const statusStepText = document.getElementById('aura-scanning-step-text');
          if (statusStepText) {
            statusStepText.textContent = '✦ QUANTUM BIO-FREQUENCY LOCKED (100%) ✦';
          }

          if (heroTinkerbell.lockTimer >= 0.55) {
            heroTinkerbell.state = 'AURA_HOVER';
            if (typeof showBethSpeechBubble === 'function') {
              showBethSpeechBubble("YOUR AURA IS LUMINOUS! ✦", heroTinkerbell.fairyX, heroTinkerbell.fairyY, 'side-left');
              setTimeout(() => {
                if (heroTinkerbell && heroTinkerbell.state === 'AURA_HOVER') {
                  hideBethSpeechBubble();
                }
              }, 4000);
            }
            if (typeof window.onAuraScanComplete === 'function') {
              window.onAuraScanComplete();
            }
          }
        }

        // 15. AURA HOVER (Elegantly hovers inside modal reading box portal, looking around & blinking)
        else if (heroTinkerbell.state === 'AURA_HOVER') {
          heroTinkerbell.scale = 1.85;
          heroTinkerbell.alpha = 1;
          const portal = document.getElementById('aura-card-eye-portal');
          if (portal) {
            const rect = portal.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const pX = rect.left + rect.width * 0.5;
              const pY = rect.top + rect.height * 0.5;
              heroTinkerbell.x += (pX - heroTinkerbell.x) * 0.25;
              heroTinkerbell.y += (pY + Math.sin(now * 0.004) * 2.5 - heroTinkerbell.y) * 0.25;
            }
          }

          // Container corner tracking for perched fairy
          const card = document.getElementById('aura-reading-card');
          if (card) {
            const cr = card.getBoundingClientRect();
            if (cr.width > 0 && cr.height > 0) {
              heroTinkerbell.fairyCornerX = cr.right - 14;
              heroTinkerbell.fairyCornerY = cr.top + 8;
            }
          }
          heroTinkerbell.fairyX = heroTinkerbell.fairyCornerX || (heroTinkerbell.x + 180);
          heroTinkerbell.fairyY = (heroTinkerbell.fairyCornerY || (heroTinkerbell.y - 120)) + Math.sin(now * 0.004) * 1.5;
          heroTinkerbell.fairyWingPhase = (heroTinkerbell.fairyWingPhase || 0) + dt * 6.0;

          // Mouse cursor tracking vs autonomous look-around saccades
          const isMouseMoving = (now - lastMouseMoveTime < 2500 && mouse.x > -100);
          if (isMouseMoving) {
            const dx = mouse.x - heroTinkerbell.x;
            const dy = mouse.y - heroTinkerbell.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.1) {
              const travel = Math.min(0.85, dist * 0.0035);
              heroTinkerbell.auraTargetGazeX = (dx / dist) * travel;
              heroTinkerbell.auraTargetGazeY = (dy / dist) * travel;
            }
          } else {
            if (now - (heroTinkerbell.auraLastSaccade || 0) > 2200 + Math.random() * 2600) {
              heroTinkerbell.auraLastSaccade = now;
              const ang = Math.random() * Math.PI * 2;
              const dst = 0.35 + Math.random() * 0.50;
              heroTinkerbell.auraTargetGazeX = Math.cos(ang) * dst;
              heroTinkerbell.auraTargetGazeY = Math.sin(ang) * dst * 0.65;
            }
          }
          heroTinkerbell.auraGazeX = (heroTinkerbell.auraGazeX || 0) + ((heroTinkerbell.auraTargetGazeX || 0) - (heroTinkerbell.auraGazeX || 0)) * 0.15;
          heroTinkerbell.auraGazeY = (heroTinkerbell.auraGazeY || 0) + ((heroTinkerbell.auraTargetGazeY || 0) - (heroTinkerbell.auraGazeY || 0)) * 0.15;

          // Biological eyelid blinking
          if (now > (heroTinkerbell.auraNextBlink || 0)) {
            const bElapsed = (now - (heroTinkerbell.auraNextBlink || 0)) / 220;
            if (bElapsed < 0.5) heroTinkerbell.auraBlinkPhase = bElapsed * 2;
            else if (bElapsed < 1.0) heroTinkerbell.auraBlinkPhase = (1 - bElapsed) * 2;
            else {
              heroTinkerbell.auraBlinkPhase = 0;
              heroTinkerbell.auraNextBlink = now + 2800 + Math.random() * 2600;
            }
          }
        }

        // 16. AURA SCANNER RETURN (Shrinks back to normal size as it flies back to corner homebase)
        else if (heroTinkerbell.state === 'AURA_DIVE_BACK') {
          heroTinkerbell.progress += dt / 0.70;
          const p = Math.min(1, heroTinkerbell.progress);
          const easeP = p * p * (3 - 2 * p);

          if (typeof hideBethSpeechBubble === 'function') {
            hideBethSpeechBubble();
          }

          let targetAeyeX = aeyeX;
          let targetAeyeY = aeyeY;
          if (aeyeWidget) {
            const aeRect = aeyeWidget.getBoundingClientRect();
            if (aeRect.width > 0) {
              targetAeyeX = aeRect.left + aeRect.width * 0.5;
              targetAeyeY = aeRect.top + aeRect.height * 0.5;
            }
          }

          const arc = Math.sin(p * Math.PI) * 50;
          heroTinkerbell.x = (1 - easeP) * heroTinkerbell.startX + easeP * targetAeyeX;
          heroTinkerbell.y = (1 - easeP) * heroTinkerbell.startY + easeP * targetAeyeY + arc;
          heroTinkerbell.scale = 2.25 - 1.25 * easeP; // Shrinks back to 1.0x normal size!
          heroTinkerbell.alpha = p > 0.85 ? Math.max(0, (1 - p) / 0.15) : 1;

          // Fairy Avatar Beth dives back to home base alongside aEye
          const fairyStartX = heroTinkerbell.fairyCornerX || heroTinkerbell.startX;
          const fairyStartY = heroTinkerbell.fairyCornerY || heroTinkerbell.startY;
          heroTinkerbell.fairyX = (1 - easeP) * fairyStartX + easeP * targetAeyeX + arc * 0.4;
          heroTinkerbell.fairyY = (1 - easeP) * fairyStartY + easeP * targetAeyeY + arc;
          heroTinkerbell.fairyWingPhase = (heroTinkerbell.fairyWingPhase || 0) + dt * 26.0;

          // Ribbon glitter trail
          for (let t = 0; t < 3; t++) {
            emitPixieDust(
              heroTinkerbell.x + (Math.random() - 0.5) * 14,
              heroTinkerbell.y + (Math.random() - 0.5) * 14,
              2,
              ['#00FFC8', '#FFD700', '#FFFFFF', '#C77DFF']
            );
          }

          if (p >= 1) {
            heroTinkerbell.state = 'ASSISTANT_ACTIVE';
            heroTinkerbell.x = targetAeyeX;
            heroTinkerbell.y = targetAeyeY;
            heroTinkerbell.alpha = 0;
            heroTinkerbell.splashTime = 0;
            emitPixieDust(targetAeyeX, targetAeyeY, 50, ['#00FFC8', '#FFD700', '#FFFFFF', '#C77DFF', '#9D4EDD']);

            const widget = document.getElementById('sacred-assistant-widget');
            if (widget) {
              widget.classList.remove('aeye-in-flight');
              widget.classList.remove('aeye-splash-active');
              void widget.offsetWidth;
              widget.classList.add('aeye-splash-active');
            }
            if (aeyeWidget) {
              aeyeWidget.style.opacity = '1';
              aeyeWidget.style.pointerEvents = 'auto';
              aeyeWidget.classList.remove('aeye-splash-active');
              void aeyeWidget.offsetWidth;
              aeyeWidget.classList.add('aeye-splash-active');
            }

            if (window.celestialAudio) window.celestialAudio.playChime(963, 1.2);
          }
        }

        // ─── SPLASH ON IMPACT ───
        // Three expanding rings plus a flash, drawn where she entered the eye.
        // Runs independently of her state so it keeps playing after she is gone.
        if (heroTinkerbell.splashTime >= 0) {
          heroTinkerbell.splashTime += dt;
          const st = heroTinkerbell.splashTime;
          const SPLASH_LIFE = 1.15;

          if (st > SPLASH_LIFE) {
            heroTinkerbell.splashTime = -1;
          } else {
            ctx.save();
            ctx.translate(aeyeX, aeyeY);

            for (let ring = 0; ring < 3; ring++) {
              const delay = ring * 0.11;
              const rp = (st - delay) / (SPLASH_LIFE - delay);
              if (rp <= 0 || rp >= 1) continue;
              const ease = 1 - Math.pow(1 - rp, 3);          // fast out, slow settle
              const radius = 16 + ease * (78 + ring * 16);
              const fade = (1 - rp) * (1 - ring * 0.22);

              ctx.strokeStyle = ring === 1
                ? 'rgba(255, 215, 0, ' + (0.75 * fade) + ')'
                : 'rgba(0, 255, 200, ' + (0.75 * fade) + ')';
              ctx.lineWidth = 3.2 * (1 - rp) + 0.6;
              ctx.beginPath();
              ctx.arc(0, 0, radius, 0, Math.PI * 2);
              ctx.stroke();
            }

            // core flash, gone within the first fifth of the splash
            const flash = Math.max(0, 1 - st / (SPLASH_LIFE * 0.2));
            if (flash > 0) {
              const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 60 * flash + 12);
              g.addColorStop(0, 'rgba(255, 255, 255, ' + (0.95 * flash) + ')');
              g.addColorStop(0.4, 'rgba(199, 125, 255, ' + (0.55 * flash) + ')');
              g.addColorStop(1, 'transparent');
              ctx.fillStyle = g;
              ctx.beginPath();
              ctx.arc(0, 0, 60 * flash + 12, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }
        }

        // ─── RENDER RETURNING EMPTY BUBBLE ORB (Ascending to Distant Star) ───
        if (returningBubbleOrb.active) {
          returningBubbleOrb.progress += dt / 2.5;
          const op = Math.min(1, returningBubbleOrb.progress);
          const easeOp = op * op * (3 - 2 * op);
          const swoopX = Math.sin(op * Math.PI) * (w * 0.05);

          returningBubbleOrb.x = (1 - easeOp) * returningBubbleOrb.startX + easeOp * returningBubbleOrb.targetX + swoopX;
          returningBubbleOrb.y = (1 - easeOp) * returningBubbleOrb.startY + easeOp * returningBubbleOrb.targetY;

          const orbScale = Math.max(0.04, 1.0 - op * 0.88);
          const orbAlpha = Math.max(0, 1.0 - op * 0.95);
          drawEmptyCelestialBubbleOrb(ctx, returningBubbleOrb.x, returningBubbleOrb.y, 56 * orbScale, now, orbAlpha);

          if (Math.random() > 0.35) {
            emitPixieDust(returningBubbleOrb.x, returningBubbleOrb.y, 1, ['#C77DFF', '#FFD700', '#00FFC8', '#FFF']);
          }

          if (op >= 1) {
            returningBubbleOrb.active = false;
            globalStarSparkle = 1.0; // Polaris starburst flare upon orb merger!
          }
        }

        // ─── DYNAMIC SPEECH BUBBLE REAL-TIME POSITION TRACKING ───
        if (activeSpeechBubble.visible) {
          updateBethSpeechBubblePosition();
        }

        // ─── RENDER AVATAR SPRITE / GLINDA ORB ───
        if (heroTinkerbell.state !== 'SPAWNING') {
          // 1. Inside Glinda Starlight Bubble Orb
          if (heroTinkerbell.state === 'ORB_FLOATING') {
            drawCelestialOrb(ctx, heroTinkerbell.x, heroTinkerbell.y, now, 1.0);
          }
          // 2. Flying down onto Crescent Moon Crest — Wings unfurled
          else if (heroTinkerbell.state === 'FLYING_TO_LOGO') {
            drawHeroTinkerbellSprite(
              ctx,
              heroTinkerbell.x,
              heroTinkerbell.y,
              heroTinkerbell.wingPhase,
              heroTinkerbell.headAngle,
              false,
              0,
              heroTinkerbell.isStrutting,
              heroTinkerbell.strutPhase || 0,
              heroTinkerbell.facingLeft,
              heroTinkerbell.diveAngle || 0,
              false,
              now
            );
          }
          // 3. AURA Scanner Flying aEYE & Laser Scanner
          else if (heroTinkerbell.state === 'AURA_TAKEOFF' || heroTinkerbell.state === 'AURA_SCANNING' || heroTinkerbell.state === 'AURA_HOVER' || heroTinkerbell.state === 'AURA_DIVE_BACK' || heroTinkerbell.state === 'AURA_RESCAN_BLINK' || heroTinkerbell.state === 'AURA_LOCKED') {
            const eyeRad = 28 * (heroTinkerbell.scale || 1.0);
            ctx.save();
            ctx.translate(heroTinkerbell.x, heroTinkerbell.y);
            ctx.globalAlpha = heroTinkerbell.alpha || 1;

            // 1. Radiant Outer Glow Halo
            const outerGlow = ctx.createRadialGradient(0, 0, eyeRad * 0.5, 0, 0, eyeRad * 1.35);
            outerGlow.addColorStop(0, 'rgba(0, 229, 212, 0.55)');
            outerGlow.addColorStop(0.55, 'rgba(157, 78, 221, 0.40)');
            outerGlow.addColorStop(1, 'transparent');
            ctx.fillStyle = outerGlow;
            ctx.beginPath();
            ctx.arc(0, 0, eyeRad * 1.35, 0, Math.PI * 2);
            ctx.fill();

            // 2. Cosmic Dark Amethyst Orb Body Background (Full Solid Widget Orb)
            const bodyGrad = ctx.createRadialGradient(-eyeRad * 0.25, -eyeRad * 0.25, 2, 0, 0, eyeRad * 1.08);
            bodyGrad.addColorStop(0, 'rgba(65, 20, 140, 0.98)');
            bodyGrad.addColorStop(0.7, 'rgba(25, 4, 55, 0.98)');
            bodyGrad.addColorStop(1, 'rgba(14, 2, 32, 1.0)');
            ctx.fillStyle = bodyGrad;
            ctx.beginPath();
            ctx.arc(0, 0, eyeRad * 1.08, 0, Math.PI * 2);
            ctx.fill();

            // 3. Golden Sacred Geometry Outer Frame
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = Math.max(1.8, eyeRad * 0.06);
            ctx.shadowColor = '#00FFC8';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(0, 0, eyeRad * 1.08, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;

            // 4. Filigree Ring Dots
            const dotCount = 8;
            for (let i = 0; i < dotCount; i++) {
              const angle = (i / dotCount) * Math.PI * 2 + now * 0.001;
              const dx = Math.cos(angle) * (eyeRad * 1.08);
              const dy = Math.sin(angle) * (eyeRad * 1.08);
              ctx.fillStyle = i % 2 === 0 ? '#00FFC8' : '#FFD700';
              ctx.beginPath();
              ctx.arc(dx, dy, Math.max(1.5, eyeRad * 0.045), 0, Math.PI * 2);
              ctx.fill();
            }

            // 5. Draw Unified Living aEYE with active dynamic gaze & rapid blink support
            drawOrganicEye(
              ctx,
              0,
              0,
              eyeRad,
              heroTinkerbell.auraGazeX || 0,
              heroTinkerbell.auraGazeY || 0,
              heroTinkerbell.auraBlinkPhase || 0,
              eyeRad * 0.28,
              ['#7B2CBF', '#9D4EDD', '#00FFC8'],
              now,
              false
            );

            // 6. Specular Spherical Glass Highlight on Top
            const glassGrad = ctx.createLinearGradient(0, -eyeRad * 1.08, 0, 0);
            glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.40)');
            glassGrad.addColorStop(0.6, 'rgba(255, 255, 255, 0.08)');
            glassGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = glassGrad;
            ctx.beginPath();
            ctx.arc(0, 0, eyeRad * 1.0, Math.PI, 0);
            ctx.fill();

            // ─── TARGET LOCKED-IN INDICATION HUD RETICLE ───
            if (heroTinkerbell.state === 'AURA_LOCKED') {
              const lt = heroTinkerbell.lockTimer || 0;
              const lockPulse = 1.0 + Math.sin(lt * Math.PI * 4) * 0.12;
              const shockwaveR = eyeRad * (1.1 + lt * 2.2);
              const shockwaveAlpha = Math.max(0, 1 - lt / 0.55);

              // Expanding shockwave ripple
              ctx.strokeStyle = `rgba(255, 215, 0, ${shockwaveAlpha * 0.9})`;
              ctx.lineWidth = 3.0;
              ctx.shadowColor = '#00FFC8';
              ctx.shadowBlur = 18;
              ctx.beginPath();
              ctx.arc(0, 0, shockwaveR, 0, Math.PI * 2);
              ctx.stroke();

              // Concentric Snapping Reticle Brackets
              ctx.strokeStyle = '#00FFC8';
              ctx.lineWidth = 2.5;
              const bracketSz = eyeRad * 1.35 * lockPulse;
              const armLen = 14;

              // Top-Left [
              ctx.beginPath();
              ctx.moveTo(-bracketSz, -bracketSz + armLen);
              ctx.lineTo(-bracketSz, -bracketSz);
              ctx.lineTo(-bracketSz + armLen, -bracketSz);
              ctx.stroke();

              // Top-Right ]
              ctx.beginPath();
              ctx.moveTo(bracketSz - armLen, -bracketSz);
              ctx.lineTo(bracketSz, -bracketSz);
              ctx.lineTo(bracketSz, -bracketSz + armLen);
              ctx.stroke();

              // Bottom-Left [
              ctx.beginPath();
              ctx.moveTo(-bracketSz, bracketSz - armLen);
              ctx.lineTo(-bracketSz, bracketSz);
              ctx.lineTo(-bracketSz + armLen, bracketSz);
              ctx.stroke();

              // Bottom-Right ]
              ctx.beginPath();
              ctx.moveTo(bracketSz - armLen, bracketSz);
              ctx.lineTo(bracketSz, bracketSz);
              ctx.lineTo(bracketSz, bracketSz - armLen);
              ctx.stroke();

              // Center Crosshair Pip
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
              ctx.lineWidth = 1.6;
              ctx.beginPath();
              ctx.moveTo(-8, 0); ctx.lineTo(8, 0);
              ctx.moveTo(0, -8); ctx.lineTo(0, 8);
              ctx.stroke();
            }

            ctx.restore();

            // ─── HIGH-ENERGY 4-PASS 3D TOPOGRAPHICAL LASER SCAN ───
            if (heroTinkerbell.state === 'AURA_SCANNING') {
              const scanTime = heroTinkerbell.scanTimer || 0;
              if (typeof drawComprehensive3DLaserScan === 'function') {
                drawComprehensive3DLaserScan(ctx, heroTinkerbell.x, heroTinkerbell.y, now, scanTime, 2.80);
              }
            }

            // ─── RENDER AVATAR BETH PERCHED ON CONTAINER CORNER DURING AURA SCAN ───
            if (heroTinkerbell.fairyX !== undefined && heroTinkerbell.fairyY !== undefined) {
              const isPerchedInAura = (heroTinkerbell.state === 'AURA_SCANNING' || heroTinkerbell.state === 'AURA_LOCKED' || heroTinkerbell.state === 'AURA_HOVER');
              drawHeroTinkerbellSprite(
                ctx,
                heroTinkerbell.fairyX,
                heroTinkerbell.fairyY,
                heroTinkerbell.fairyWingPhase || 0,
                -0.18, // head angled curiously down at the scan portal
                isPerchedInAura, // gentle perched stance
                0,
                false,
                0,
                heroTinkerbell.fairyFacingLeft !== undefined ? heroTinkerbell.fairyFacingLeft : true,
                heroTinkerbell.fairyDiveAngle || 0,
                false,
                now
              );
            }
          }
          // 4. Fully Materialized 3D Badass Fairy Avatar
          else {
            // Render Jeopardy / Wheel of Fortune Floating Letter Board
            drawCatwalkLetterBoard(ctx, heroTinkerbell, now);

            const isPerched = (heroTinkerbell.state === 'PERCHED_LOGO' || heroTinkerbell.state === 'PERCHED_BOOK_BTN' || heroTinkerbell.state === 'PERCHED_ON_AEYE' || heroTinkerbell.state === 'MENU_PERCHED' || heroTinkerbell.state === 'PAUSE_ON_BADGE_EDGE');
            const isGreeting = (heroTinkerbell.state === 'PERCHED_ON_AEYE' || heroTinkerbell.state === 'MENU_PERCHED' || heroTinkerbell.state === 'PAUSE_ON_BADGE_EDGE');
            const spriteAlpha = heroTinkerbell.alpha === undefined ? 1 : heroTinkerbell.alpha;
            if (spriteAlpha > 0.01 && heroTinkerbell.state !== 'ASSISTANT_ACTIVE') {
              const jumpSq = heroTinkerbell.jumpSquash || 1;
              ctx.save();
              ctx.globalAlpha = spriteAlpha;
              if (jumpSq !== 1) {
                // squash on the crouch, stretch through the arc
                ctx.translate(heroTinkerbell.x, heroTinkerbell.y);
                ctx.scale(1 / jumpSq, jumpSq);
                ctx.translate(-heroTinkerbell.x, -heroTinkerbell.y);
              }
              drawHeroTinkerbellSprite(
                ctx,
                heroTinkerbell.x,
                heroTinkerbell.y,
                heroTinkerbell.wingPhase,
                heroTinkerbell.headAngle,
                isPerched,
                heroTinkerbell.bodySway,
                heroTinkerbell.isStrutting,
                heroTinkerbell.strutPhase || 0,
                heroTinkerbell.facingLeft,
                heroTinkerbell.diveAngle || 0,
                isGreeting,
                now
              );
              ctx.restore();
            }
          }

          // Render heroAeyeMenu if active (The living aEYE companion racing / perched in menu)
          if (heroAeyeMenu.state === 'MENU_TAKEOFF' || heroAeyeMenu.state === 'MENU_PERCHED' || heroAeyeMenu.state === 'MENU_DIVE_BACK') {
            drawUnifiedAEye(
              ctx,
              heroAeyeMenu.x,
              heroAeyeMenu.y,
              28,
              heroAeyeMenu.gazeX || 0,
              heroAeyeMenu.gazeY || 0,
              heroAeyeMenu.blinkPhase || 0,
              now,
              {
                alpha: heroAeyeMenu.alpha || 1
              }
            );
          }
        }
      }
      // ─── UNIFIED aEYE DRAW HELPER ───
      // Renders the ENTIRE living sacred aEYE orb companion (cosmic housing, radiant rim, filigree dots, living eye & specular glass)
      function drawUnifiedAEye(ctx, x, y, radius, gazeX, gazeY, blinkPhase, now, opts) {
        const alpha = (opts && opts.alpha !== undefined) ? opts.alpha : 1;
        if (alpha < 0.01) return;
        ctx.save();
        ctx.translate(x, y);
        ctx.globalAlpha = alpha;

        const orbR = radius * 1.18;

        // 1. Radiant Outer Glow Halo
        const auraGrad = ctx.createRadialGradient(0, 0, orbR * 0.4, 0, 0, orbR * 1.5);
        auraGrad.addColorStop(0, 'rgba(0, 229, 212, 0.55)');
        auraGrad.addColorStop(0.55, 'rgba(157, 78, 221, 0.40)');
        auraGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(0, 0, orbR * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // 2. Cosmic Dark Amethyst Orb Body Background (Full Solid Widget Orb)
        const bodyGrad = ctx.createRadialGradient(-orbR * 0.25, -orbR * 0.25, 2, 0, 0, orbR);
        bodyGrad.addColorStop(0, 'rgba(65, 20, 140, 0.98)');
        bodyGrad.addColorStop(0.7, 'rgba(25, 4, 55, 0.98)');
        bodyGrad.addColorStop(1, 'rgba(14, 2, 32, 1.0)');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.arc(0, 0, orbR, 0, Math.PI * 2);
        ctx.fill();

        // 3. Sacred Golden & Tiffany Outer Rim
        ctx.strokeStyle = '#00FFC8';
        ctx.lineWidth = Math.max(2.0, orbR * 0.065);
        ctx.shadowColor = '#00E5D4';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, 0, orbR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 4. Filigree Ring Starlight Dots
        const dotCount = 8;
        for (let i = 0; i < dotCount; i++) {
          const angle = (i / dotCount) * Math.PI * 2 + now * 0.001;
          const dx = Math.cos(angle) * (orbR * 0.95);
          const dy = Math.sin(angle) * (orbR * 0.95);
          ctx.fillStyle = i % 2 === 0 ? '#00FFC8' : '#FFD700';
          ctx.beginPath();
          ctx.arc(dx, dy, Math.max(1.6, orbR * 0.045), 0, Math.PI * 2);
          ctx.fill();
        }

        // 5. Living Almond Eye inside the orb
        const pupilR = radius * 0.32;
        const colors = ['#7B2CBF', '#9D4EDD', '#00FFC8'];
        drawOrganicEye(ctx, 0, 0, radius * 0.88, gazeX, gazeY, blinkPhase, pupilR, colors, now);

        // 6. Specular Spherical Glass Highlight on Top
        const glassGrad = ctx.createLinearGradient(0, -orbR, 0, 0);
        glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
        glassGrad.addColorStop(0.6, 'rgba(255, 255, 255, 0.08)');
        glassGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = glassGrad;
        ctx.beginPath();
        ctx.arc(0, 0, orbR * 0.92, Math.PI, 0);
        ctx.fill();

        ctx.restore();
      }

      // ─── EMPTY CELESTIAL BUBBLE ORB (No avatar inside — ascending return) ───
      function drawEmptyCelestialBubbleOrb(ctx, x, y, size, now, alpha) {
        if (alpha < 0.01) return;
        ctx.save();
        ctx.translate(x, y);
        ctx.globalAlpha = alpha;

        const pulse = 1.0 + Math.sin(now * 0.004) * 0.06;
        const orbSize = size * pulse;

        // Radiant starlight aura
        const aura = ctx.createRadialGradient(0, 0, 4, 0, 0, orbSize * 1.35);
        aura.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
        aura.addColorStop(0.28, 'rgba(0, 255, 200, 0.45)');
        aura.addColorStop(0.65, 'rgba(199, 125, 255, 0.25)');
        aura.addColorStop(1, 'transparent');
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(0, 0, orbSize * 1.35, 0, Math.PI * 2);
        ctx.fill();

        // Glass bubble surface
        if (imgGlindaOrb.complete && imgGlindaOrb.naturalWidth > 0) {
          ctx.save();
          ctx.globalAlpha = 0.8;
          ctx.drawImage(imgGlindaOrb, -orbSize * 0.5, -orbSize * 0.5, orbSize, orbSize);
          ctx.restore();
        } else {
          const bubbleGrad = ctx.createRadialGradient(-orbSize * 0.25, -orbSize * 0.25, 2, 0, 0, orbSize * 0.5);
          bubbleGrad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
          bubbleGrad.addColorStop(0.5, 'rgba(0, 255, 200, 0.35)');
          bubbleGrad.addColorStop(1, 'rgba(199, 125, 255, 0.2)');
          ctx.fillStyle = bubbleGrad;
          ctx.beginPath();
          ctx.arc(0, 0, orbSize * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      // ─── JEOPARDY / WHEEL OF FORTUNE FLOATING LETTER BOARD RENDERER ───
      function drawCatwalkLetterBoard(ctx, heroTinkerbell, now) {
        if (!heroTinkerbell.catwalkLetters || heroTinkerbell.catwalkLetters.length === 0) return;
        const fadeAlpha = heroTinkerbell.catwalkLettersFade !== undefined ? heroTinkerbell.catwalkLettersFade : 1.0;
        if (fadeAlpha <= 0.005) return;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const isMobile = (w || window.innerWidth) < 600;
        ctx.font = isMobile 
          ? '900 9.5px "Outfit", -apple-system, sans-serif' 
          : '900 12px "Outfit", -apple-system, sans-serif';

        const isVanna = (heroTinkerbell.state === 'PAUSE_ON_BADGE_EDGE');
        const vannaTime = heroTinkerbell.edgePauseTime || 0;

        for (let i = 0; i < heroTinkerbell.catwalkLetters.length; i++) {
          const l = heroTinkerbell.catwalkLetters[i];
          if (!l.revealed || l.isSpace) continue;

          const age = Math.max(0, (now - l.revealTime) / 1000);
          const pop = Math.max(0, 1 - age / 0.28);
          const scaleY = Math.min(1, age * 6.0); // 3D flip over horizontal center

          // Floating wave bob
          const waveBob = Math.sin(now * 0.005 + i * 0.35) * 1.8;
          const px = l.x;
          const py = l.y + waveBob;

          // Shimmer wave during Vanna White presentation pose
          let shimmerGlow = 0;
          if (isVanna && vannaTime > 0.25) {
            const sweep = Math.sin(vannaTime * 4.5 - i * 0.28);
            if (sweep > 0.55) {
              shimmerGlow = (sweep - 0.55) / 0.45;
            }
          }

          ctx.save();
          ctx.translate(px, py);
          ctx.scale(1.0 + pop * 0.35, (1.0 + pop * 0.35) * scaleY);
          ctx.globalAlpha = fadeAlpha * Math.min(1, age * 4.0);

          // 1. Frosted Crystal Jeopardy Tile Background (Official Brand Palette)
          const tileW = isMobile ? 11.0 : 14.5;
          const tileH = isMobile ? 15.5 : 19.5;
          const tileRadius = isMobile ? 2.5 : 3.5;
          const tileGrad = ctx.createLinearGradient(0, -tileH * 0.5, 0, tileH * 0.5);
          if (shimmerGlow > 0) {
            // Brand Shimmer: Indigo-soft (#7040B5) to Tiffany (#4DBFB6)
            tileGrad.addColorStop(0, `rgba(112, 64, 181, ${0.90 * fadeAlpha})`);
            tileGrad.addColorStop(1, `rgba(77, 191, 182, ${0.85 * fadeAlpha})`);
            ctx.shadowColor = '#45DDBB';
            ctx.shadowBlur = 12 + 8 * shimmerGlow;
          } else {
            // Brand Deep Indigo: #36005E to #1A0035
            tileGrad.addColorStop(0, `rgba(54, 0, 94, ${0.94 * fadeAlpha})`);
            tileGrad.addColorStop(1, `rgba(26, 0, 53, ${0.96 * fadeAlpha})`);
            ctx.shadowColor = '#4DBFB6';
            ctx.shadowBlur = 8;
          }

          ctx.fillStyle = tileGrad;
          ctx.strokeStyle = shimmerGlow > 0 ? '#FFFFFF' : 'rgba(77, 191, 182, 0.90)';
          ctx.lineWidth = shimmerGlow > 0 ? 1.6 : 1.2;

          // Draw rounded crystal tile
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(-tileW * 0.5, -tileH * 0.5, tileW, tileH, tileRadius);
          } else {
            ctx.rect(-tileW * 0.5, -tileH * 0.5, tileW, tileH);
          }
          ctx.fill();
          ctx.stroke();

          // 2. Letter Character Typography
          ctx.shadowBlur = 0;
          if (shimmerGlow > 0) {
            ctx.fillStyle = '#FFFFFF';
            ctx.shadowColor = '#45DDBB';
            ctx.shadowBlur = 6;
          } else {
            ctx.fillStyle = (l.char === '!' || l.char === "'") ? '#4DBFB6' : '#FFFFFF';
            ctx.shadowColor = 'rgba(77, 191, 182, 0.5)';
            ctx.shadowBlur = 3;
          }
          ctx.fillText(l.char, 0, 1);

          // Top glint highlight
          ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
          ctx.beginPath();
          ctx.arc(-tileW * 0.28, -tileH * 0.28, 1.3, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        }

        ctx.restore();
      }

      // Load Photorealistic Assets for Hero Animation.
      // The avatar now ships as separate layers (see tools/build_avatar_layers.py):
      // the body has its baked-on wings erased so the wings can actually beat, and
      // the lower legs are split off so she can take steps instead of sliding.
      const imgAvatar = new Image();
      imgAvatar.src = 'images/avatar_body.webp?v=37.0';

      const imgWingL = new Image();
      imgWingL.src = 'images/avatar_wing_left.webp?v=37.0';

      const imgWingR = new Image();
      imgWingR.src = 'images/avatar_wing_right.webp?v=37.0';

      const imgTrain = new Image();
      imgTrain.src = 'images/avatar_train.webp?v=38.0';

      // Source-image geometry the layers were cut against.
      const AV_SRC = 1024;              // layer PNGs are 1024x1024
      const AV_DRAW = 440;              // drawn size in sprite-local units
      const AV_K = AV_DRAW / AV_SRC;    // source px -> local units
      const AV_OX = -AV_DRAW * 0.5;     // drawImage origin used everywhere below
      const AV_OY = -AV_DRAW * 0.85;
      // pivots in source px, from images/avatar_layers.json
      // wings hinge on the cut edge so the seam cannot open as they beat
      const PIV_WING_L = { x: 404, y: 300 };
      const PIV_WING_R = { x: 652, y: 300 };
      const PIV_TRAIN = { x: 596, y: 620 };   // where the train meets her hip

      // Character scale, shared by the renderer and the walk-line layout maths.
      const AVATAR_SCALE = 0.12;

      function avLocal(p) {
        return { x: AV_OX + p.x * AV_K, y: AV_OY + p.y * AV_K };
      }

      /** Draw one layer rotated about a pivot given in source-image pixels. */
      function drawAvatarLayer(ctx, img, pivotSrc, angle) {
        if (!img.complete || !img.naturalWidth) return;
        ctx.save();
        if (angle) {
          const p = avLocal(pivotSrc);
          ctx.translate(p.x, p.y);
          ctx.rotate(angle);
          ctx.translate(-p.x, -p.y);
        }
        ctx.drawImage(img, AV_OX, AV_OY, AV_DRAW, AV_DRAW);
        ctx.restore();
      }

      // ─── ARTICULATED LEGS ───
      // The photographed legs are stripped out by tools/build_avatar_layers.py
      // and redrawn here so they can actually take steps. Cutting them from the
      // render and rotating them was tried and always tore: the skirt panels
      // interleave with both legs, so no cut separates them cleanly. At the size
      // this sprite draws, a clean two-segment leg beats a torn photo fragment.
      const HIP_FRONT = { x: 492, y: 646 };   // source-image coords
      const HIP_BACK = { x: 564, y: 646 };
      const THIGH_LEN = 176;
      const SHIN_LEN = 184;

      const LEG_TONE_FRONT = { thigh: '#C8A28E', shin: '#BB937F' };
      const LEG_TONE_BACK = { thigh: '#A17B67', shin: '#8F6B58' };
      const SHOE_FRONT = '#8E52C8';
      const SHOE_BACK = '#6B3C96';

      /** Hip and knee angles for one leg at a point in the gait cycle.
       *
       * phase 0        = mid-swing, leg passing under the body — knee most bent
       * phase  pi/2    = heel strike, leg forward and straight
       * phase  pi..3pi/2 = stance, foot planted — knee stays straight
       *
       * An earlier version peaked the knee at phase 2.32, i.e. in the middle of
       * the stance phase, so the planted leg buckled while it was meant to be
       * carrying her weight. cos() puts the bend where the swing actually is.
       */
      function gait(phase) {
        return {
          hip: 0.42 * Math.sin(phase),
          knee: Math.max(0, 0.75 * Math.cos(phase))
        };
      }

      function drawLeg(ctx, hipSrc, phase, tone, shoeFill) {
        const hp = avLocal(hipSrc);
        const thigh = THIGH_LEN * AV_K;
        const shin = SHIN_LEN * AV_K;
        const a = gait(phase);

        const kneeX = hp.x + Math.sin(a.hip) * thigh;
        const kneeY = hp.y + Math.cos(a.hip) * thigh;
        const shinAng = a.hip - a.knee;
        const ankX = kneeX + Math.sin(shinAng) * shin;
        const ankY = kneeY + Math.cos(shinAng) * shin;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.strokeStyle = tone.thigh;
        ctx.lineWidth = 44 * AV_K;
        ctx.beginPath();
        ctx.moveTo(hp.x, hp.y);
        ctx.lineTo(kneeX, kneeY);
        ctx.stroke();

        ctx.strokeStyle = tone.shin;
        ctx.lineWidth = 30 * AV_K;
        ctx.beginPath();
        ctx.moveTo(kneeX, kneeY);
        ctx.lineTo(ankX, ankY);
        ctx.stroke();

        // Heel + pointed toe
        ctx.translate(ankX, ankY);
        ctx.rotate(shinAng * 0.55);
        ctx.fillStyle = shoeFill;
        ctx.beginPath();
        ctx.moveTo(-9 * AV_K, -4 * AV_K);
        ctx.lineTo(10 * AV_K, -2 * AV_K);
        ctx.quadraticCurveTo(34 * AV_K, 10 * AV_K, 30 * AV_K, 18 * AV_K);
        ctx.lineTo(-8 * AV_K, 15 * AV_K);
        ctx.closePath();
        ctx.fill();

        // Stiletto heel
        ctx.strokeStyle = shoeFill;
        ctx.lineWidth = 5 * AV_K;
        ctx.beginPath();
        ctx.moveTo(-6 * AV_K, 12 * AV_K);
        ctx.lineTo(-12 * AV_K, 30 * AV_K);
        ctx.stroke();

        // Starlight glint on shoe
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(8 * AV_K, 3 * AV_K, 2 * AV_K, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      function drawTrain(ctx, walkPhase, isWalking, drift) {
        if (!imgTrain.complete || !imgTrain.naturalWidth) return;
        const p = avLocal(PIV_TRAIN);
        // fabric lags the hips by ~0.9rad; idles on a slow flutter when still
        const swing = isWalking
          ? -0.05 + 0.20 * Math.sin(walkPhase - 0.9)
          : 0.03 * Math.sin(drift * 0.6);
        // and billows very slightly as it swings out
        const billow = 1 + 0.05 * Math.abs(Math.sin(walkPhase - 0.9));

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(swing);
        ctx.scale(billow, 1);
        ctx.translate(-p.x, -p.y);
        ctx.drawImage(imgTrain, AV_OX, AV_OY, AV_DRAW, AV_DRAW);
        ctx.restore();
      }

      /**
       * Beat one wing. The wing keeps the original artwork — it is lifted from
       * the render by tools/build_avatar_layers.py — and is rotated about its
       * hinge while being foreshortened horizontally and modulated with micro-harmonic
       * gossamer flutter, creating lifelike fairy flight physics.
       */
      function beatWing(ctx, img, pivotSrc, beat, mirrored) {
        if (!img.complete || !img.naturalWidth) return;
        const p = avLocal(pivotSrc);
        const dir = mirrored ? -1 : 1;
        // Primary flap + secondary gossamer flutter harmonic
        const microFlutter = 0.04 * Math.sin(beat * 2.5);
        const tilt = dir * (-0.13 + 0.28 * (0.5 + 0.5 * beat) + microFlutter);
        const spread = 0.78 + 0.32 * (0.5 + 0.5 * beat);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(tilt);
        ctx.scale(spread, 1);
        ctx.translate(-p.x, -p.y);
        
        // Ethereal bioluminescent wing glow
        const glowAlpha = 0.25 + 0.35 * Math.max(0, Math.sin(beat));
        ctx.shadowColor = mirrored ? 'rgba(0, 229, 212, ' + glowAlpha + ')' : 'rgba(199, 125, 255, ' + glowAlpha + ')';
        ctx.shadowBlur = 12 * (0.5 + 0.5 * beat);
        
        ctx.drawImage(img, AV_OX, AV_OY, AV_DRAW, AV_DRAW);
        ctx.restore();
      }

      const imgGlindaOrb = new Image();
      imgGlindaOrb.src = 'images/photorealistic_glinda_bubble_orb.webp?v=22.0';

      // ─── PHOTOREALISTIC GLINDA STARLIGHT BUBBLE ORB ───
      function drawCelestialOrb(ctx, x, y, now, opacity = 1.0) {
        ctx.save();
        ctx.translate(x, y);
        ctx.globalAlpha = opacity;

        const pulse = 1.0 + Math.sin(now * 0.004) * 0.06;
        const orbSize = 60 * pulse;

        // 1. Perfectly circular radiant starlight aura
        const aura = ctx.createRadialGradient(0, 0, 4, 0, 0, orbSize * 1.35);
        aura.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
        aura.addColorStop(0.28, 'rgba(0, 255, 200, 0.55)');
        aura.addColorStop(0.65, 'rgba(199, 125, 255, 0.30)');
        aura.addColorStop(1, 'transparent');
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(0, 0, orbSize * 1.35, 0, Math.PI * 2);
        ctx.fill();

        // 2. Photorealistic Mini Avatar nestled inside circular bubble (1:1 square aspect)
        if (imgAvatar.complete && imgAvatar.naturalWidth > 0) {
          ctx.save();
          ctx.globalAlpha = 0.95;
          ctx.beginPath();
          ctx.arc(0, 0, orbSize * 0.46, 0, Math.PI * 2);
          ctx.clip();

          const avW = orbSize * 0.88;
          const avH = avW;

          if (imgWingL.complete && imgWingL.naturalWidth > 0) {
            ctx.save();
            ctx.globalAlpha = 0.85;
            ctx.drawImage(imgWingL, -avW * 0.5, -avH * 0.52, avW, avH);
            ctx.restore();
          }
          if (imgWingR.complete && imgWingR.naturalWidth > 0) {
            ctx.save();
            ctx.globalAlpha = 0.85;
            ctx.drawImage(imgWingR, -avW * 0.5, -avH * 0.52, avW, avH);
            ctx.restore();
          }

          if (imgTrain.complete && imgTrain.naturalWidth > 0) {
            ctx.drawImage(imgTrain, -avW * 0.5, -avH * 0.52, avW, avH);
          }
          ctx.drawImage(imgAvatar, -avW * 0.5, -avH * 0.52, avW, avH);

          ctx.restore();
        }

        // 3. Photorealistic 3D Glass Bubble Orb Layer on top (1:1 square aspect)
        if (imgGlindaOrb.complete && imgGlindaOrb.naturalWidth > 0) {
          ctx.save();
          ctx.globalAlpha = 0.92;
          ctx.drawImage(imgGlindaOrb, -orbSize * 0.5, -orbSize * 0.5, orbSize, orbSize);
          ctx.restore();
        } else {
          const bubbleGrad = ctx.createRadialGradient(-orbSize * 0.25, -orbSize * 0.25, 2, 0, 0, orbSize * 0.5);
          bubbleGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
          bubbleGrad.addColorStop(0.4, 'rgba(0, 255, 200, 0.45)');
          bubbleGrad.addColorStop(0.8, 'rgba(199, 125, 255, 0.55)');
          bubbleGrad.addColorStop(1, 'rgba(255, 215, 0, 0.35)');
          ctx.fillStyle = bubbleGrad;
          ctx.beginPath();
          ctx.arc(0, 0, orbSize * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Specular highlight crescent
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, 0, orbSize * 0.42, -Math.PI * 0.75, -Math.PI * 0.25);
        ctx.stroke();

        ctx.restore();
      }

      function drawHeroTinkerbellSprite(ctx, x, y, wingPhase, headAngle = 0, isPerched = false, sway = 0, isStrutting = false, strutPhase = 0, facingLeft = false, diveAngle = 0) {
        ctx.save();
        ctx.translate(x + sway, y);

        if (facingLeft) ctx.scale(-1, 1);
        if (diveAngle !== 0) ctx.rotate(diveAngle);
        const isMobile = window.innerWidth < 600;
        const isTablet = window.innerWidth < 900;
        const respScale = isMobile ? 0.72 : (isTablet ? 0.86 : 1.0);
        const baseScale = AVATAR_SCALE * respScale;
        ctx.scale(baseScale, baseScale);

        // Radiant Stardust Aura
        const pulse = 1.0 + Math.sin(wingPhase * 0.5) * 0.08;
        const aura = ctx.createRadialGradient(0, -60, 20, 0, -60, 260 * pulse);
        aura.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        aura.addColorStop(0.3, 'rgba(0, 255, 200, 0.5)');
        aura.addColorStop(0.7, 'rgba(157, 78, 221, 0.25)');
        aura.addColorStop(1, 'transparent');
        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(0, -60, 260 * pulse, 0, Math.PI * 2);
        ctx.fill();

        // ── WINGS (behind her, always beating) ──
        const beat = Math.sin(wingPhase);
        beatWing(ctx, imgWingL, PIV_WING_L, beat, true);
        beatWing(ctx, imgWingR, PIV_WING_R, beat, false);

        // ── SUPERMODEL RUNWAY CATWALK CYCLE ──
        let lean = 0, bob = 0, squash = 1, drift = 0;
        if (isStrutting) {
          const s = Math.sin(strutPhase);
          const fall = Math.abs(Math.cos(strutPhase));   // 1 at each footfall
          bob = -fall * 5.5;                             // graceful runway rise and fall
          lean = s * 0.045;                              // supermodel shoulder counter-lean
          squash = 1 + fall * 0.015;                     // weight settling
          drift = s * 2.8;                               // confident hip sway side to side
        }

        ctx.save();
        ctx.translate(drift, bob);
        ctx.rotate(lean);
        ctx.scale(1 / squash, squash);

        drawAvatarLayer(ctx, imgAvatar, null, 0);
        ctx.restore();

        // Shimmering Golden Footstep / Boot Sparkles — brighten on footfall
        const fall = isStrutting ? Math.abs(Math.cos(strutPhase)) : 0.5;
        ctx.fillStyle = 'rgba(255, 215, 0, ' + (0.45 + 0.55 * fall) + ')';
        ctx.beginPath();
        ctx.arc(-14, 0, 3.5 + 2.5 * fall, 0, Math.PI * 2);
        ctx.arc(14, 0, 3.5 + 2.5 * fall, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      // Expose interactive menu fairy flight triggers
      window.triggerFairyMenuTakeoff = function() {
        if (!heroAvatarCanvas) return;
        const aeyeWidget = document.getElementById('assistant-avatar-btn');
        const widget = document.getElementById('sacred-assistant-widget');
        if (widget) widget.classList.add('aeye-in-flight');

        let curAeyeX = Math.max(40, window.innerWidth - 60);
        let curAeyeY = Math.max(40, window.innerHeight - 60);
        if (aeyeWidget) {
          const aeRect = aeyeWidget.getBoundingClientRect();
          if (aeRect.width > 0) {
            curAeyeX = aeRect.left + aeRect.width * 0.5;
            curAeyeY = aeRect.top + aeRect.height * 0.5;
          }
          aeyeWidget.style.opacity = '0';
          aeyeWidget.style.pointerEvents = 'none';
        }

        // 1. Target for Avatar Beth: Top-right corner of menu card
        let menuCornerX = window.innerWidth * 0.5 + 240;
        let menuCornerY = Math.max(40, window.innerHeight * 0.22);
        const modalCard = document.querySelector('.assistant-modal-card');
        if (modalCard) {
          const mRect = modalCard.getBoundingClientRect();
          if (mRect.width > 0) {
            menuCornerX = mRect.right - 18;
            menuCornerY = mRect.top + 28;
          }
        }

        // 2. Target for Living aEYE: Top-center orb dais of menu card
        let menuEyeX = window.innerWidth * 0.5;
        let menuEyeY = Math.max(40, window.innerHeight * 0.20);
        const eyeOrb = document.getElementById('assistant-modal-icon-orb');
        if (eyeOrb) {
          const oRect = eyeOrb.getBoundingClientRect();
          if (oRect.width > 0) {
            menuEyeX = oRect.left + oRect.width * 0.5;
            menuEyeY = oRect.top + oRect.height * 0.5;
          }
        }

        // Setup Avatar Beth flight
        heroTinkerbell.state = 'MENU_TAKEOFF';
        heroTinkerbell.progress = 0;
        heroTinkerbell.startX = curAeyeX;
        heroTinkerbell.startY = curAeyeY;
        heroTinkerbell.x = curAeyeX;
        heroTinkerbell.y = curAeyeY;
        heroTinkerbell.alpha = 1;
        heroTinkerbell.isStrutting = false;
        heroTinkerbell.menuBubbleShown = false;

        // Setup Living aEYE flight (Races alongside Beth to top center!)
        heroAeyeMenu.state = 'MENU_TAKEOFF';
        heroAeyeMenu.progress = 0;
        heroAeyeMenu.startX = curAeyeX;
        heroAeyeMenu.startY = curAeyeY;
        heroAeyeMenu.targetX = menuEyeX;
        heroAeyeMenu.targetY = menuEyeY;
        heroAeyeMenu.x = curAeyeX;
        heroAeyeMenu.y = curAeyeY;
        heroAeyeMenu.alpha = 1;
        heroAeyeMenu.scale = 1.0;

        emitPixieDust(curAeyeX, curAeyeY, 45, ['#FFD700', '#00FFC8', '#FFFFFF', '#C77DFF']);
        if (window.celestialAudio) window.celestialAudio.playChime(741, 1.0);
      };

      window.triggerFairyMenuDiveBack = function() {
        hideBethSpeechBubble();
        if (!heroAvatarCanvas) return;

        // aEye races back to homebase first
        heroAeyeMenu.state = 'MENU_DIVE_BACK';
        heroAeyeMenu.progress = 0;
        heroAeyeMenu.startX = heroAeyeMenu.x || (window.innerWidth * 0.5);
        heroAeyeMenu.startY = heroAeyeMenu.y || (window.innerHeight * 0.20);
        heroAeyeMenu.alpha = 1;

        // Avatar Beth follows and dives down into homebase
        heroTinkerbell.state = 'MENU_DIVE_BACK';
        heroTinkerbell.progress = 0;
        heroTinkerbell.startX = heroTinkerbell.x || (window.innerWidth * 0.5 + 240);
        heroTinkerbell.startY = heroTinkerbell.y || (window.innerHeight * 0.22);
        heroTinkerbell.alpha = 1;
        heroTinkerbell.isStrutting = false;

        emitPixieDust(heroTinkerbell.startX, heroTinkerbell.startY, 25, ['#00FFC8', '#FFD700', '#FFFFFF']);
        if (window.celestialAudio) window.celestialAudio.playChime(852, 1.0);
      };

      // Expose aura scanner flight triggers
      window.isAuraEyeInLocation = function() {
        return (
          heroTinkerbell.state === 'AURA_HOVER' ||
          heroTinkerbell.state === 'AURA_SCANNING' ||
          heroTinkerbell.state === 'AURA_LOCKED' ||
          heroTinkerbell.state === 'AURA_RESCAN_BLINK'
        );
      };

      window.triggerAuraEyeRescan = function() {
        if (!heroAvatarCanvas) return;
        heroTinkerbell.state = 'AURA_RESCAN_BLINK';
        heroTinkerbell.rescanTimer = 0;
        heroTinkerbell.auraBlinkPhase = 0;
        heroTinkerbell.alpha = 1;
        heroTinkerbell.scale = 2.25;
        emitPixieDust(heroTinkerbell.x, heroTinkerbell.y, 35, ['#00FFC8', '#FFD700', '#FFFFFF', '#C77DFF']);
        if (window.celestialAudio) window.celestialAudio.playChime(639, 1.0);
      };

      window.triggerAuraEyeTakeoff = function(targetX, targetY) {
        if (!heroAvatarCanvas) return;
        const aeyeWidget = document.getElementById('assistant-avatar-btn');
        const widget = document.getElementById('sacred-assistant-widget');
        if (widget) widget.classList.add('aeye-in-flight');

        let curAeyeX = Math.max(40, window.innerWidth - 60);
        let curAeyeY = Math.max(40, window.innerHeight - 60);
        if (aeyeWidget) {
          const aeRect = aeyeWidget.getBoundingClientRect();
          if (aeRect.width > 0) {
            curAeyeX = aeRect.left + aeRect.width * 0.5;
            curAeyeY = aeRect.top + aeRect.height * 0.5;
          }
          // Hide homebase widget so the ACTUAL aEye moves, NOT a duplicate!
          aeyeWidget.style.opacity = '0';
          aeyeWidget.style.pointerEvents = 'none';
        }
        heroTinkerbell.state = 'AURA_TAKEOFF';
        heroTinkerbell.progress = 0;
        heroTinkerbell.startX = curAeyeX;
        heroTinkerbell.startY = curAeyeY;
        heroTinkerbell.targetX = targetX;
        heroTinkerbell.targetY = targetY;
        heroTinkerbell.scale = 1.0;
        heroTinkerbell.alpha = 1;

        // Container top-right corner target for Avatar Beth
        const card = document.getElementById('aura-reading-card');
        let fairyCornerX = (window.innerWidth * 0.5) + 190;
        let fairyCornerY = (window.innerHeight * 0.42) - 130;
        if (card) {
          const cr = card.getBoundingClientRect();
          if (cr.width > 0 && cr.height > 0) {
            fairyCornerX = cr.right - 14;
            fairyCornerY = cr.top + 8;
          }
        }
        heroTinkerbell.fairyCornerX = fairyCornerX;
        heroTinkerbell.fairyCornerY = fairyCornerY;
        heroTinkerbell.fairyStartX = heroTinkerbell.fairyX !== undefined ? heroTinkerbell.fairyX : curAeyeX;
        heroTinkerbell.fairyStartY = heroTinkerbell.fairyY !== undefined ? heroTinkerbell.fairyY : curAeyeY;
        heroTinkerbell.fairyX = heroTinkerbell.fairyStartX;
        heroTinkerbell.fairyY = heroTinkerbell.fairyStartY;
        heroTinkerbell.fairyWingPhase = 0;
        heroTinkerbell.fairyFacingLeft = true;

        emitPixieDust(curAeyeX, curAeyeY, 30, ['#FFD700', '#00FFC8', '#FFFFFF', '#C77DFF']);
      };

      window.triggerAuraEyeReturn = function(fromX, fromY) {
        if (!heroAvatarCanvas) return;
        if (typeof hideBethSpeechBubble === 'function') {
          hideBethSpeechBubble();
        }
        heroTinkerbell.state = 'AURA_DIVE_BACK';
        heroTinkerbell.progress = 0;
        heroTinkerbell.startX = fromX || heroTinkerbell.x || (window.innerWidth * 0.5);
        heroTinkerbell.startY = fromY || heroTinkerbell.y || (window.innerHeight * 0.40);
        heroTinkerbell.alpha = 1;
        emitPixieDust(heroTinkerbell.startX, heroTinkerbell.startY, 25, ['#00FFC8', '#FFD700', '#FFFFFF']);
      };

      heroAnimId = requestAnimationFrame(render);

    } // end if (heroBgCanvas && heroAvatarCanvas)

    // ═══════════════════════════════════════════════
    // HIGH-PERFORMANCE PHOTOREALISTIC TINKERBELL DRAW ENGINE
    // ═══════════════════════════════════════════════
    function drawPhotorealisticTinkerbell(ctx, p, now) {
      ctx.save();
      ctx.translate(p.x, p.y);
      const scale = p.z || 1;
      ctx.scale(scale, scale);
      
      const heading = Math.atan2(p.vy || 0, p.vx || 1);
      ctx.rotate(heading * 0.2);

      const flap = Math.sin(p.wingPhase || 0);
      const pulse = 1 + Math.sin(p.fireflyPulse || 0) * 0.22;
      const s = p.size;

      // 1. Soft Volumetric Stardust Aura
      const aura = ctx.createRadialGradient(0, 0, 1, 0, 0, s * 3.4 * pulse);
      aura.addColorStop(0, p.palette.aura);
      aura.addColorStop(0.45, p.palette.aura.replace(/[\d\.]+\)$/, '0.30)'));
      aura.addColorStop(1, 'transparent');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, s * 3.4 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // 2. Photorealistic Gossamer Wings
      function drawWingSide(flip) {
        ctx.save();
        ctx.scale(flip * flap, 1);

        const wg = ctx.createLinearGradient(0, 0, -s * 2.5, -s * 1.5);
        wg.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        wg.addColorStop(0.4, p.palette.wing);
        wg.addColorStop(1, 'rgba(0, 229, 212, 0.25)');

        ctx.fillStyle = wg;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.2);
        ctx.bezierCurveTo(-s * 0.8, -s * 1.4, -s * 2.2, -s * 1.8, -s * 2.4, -s * 0.8);
        ctx.bezierCurveTo(-s * 2.1, s * 0.1, -s * 0.9, s * 0.3, 0, -s * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Lower Wing
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-s * 0.6, s * 0.3, -s * 1.5, s * 1.0, -s * 1.2, s * 1.4);
        ctx.bezierCurveTo(-s * 0.8, s * 1.3, -s * 0.3, s * 0.6, 0, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
      }

      drawWingSide(1);
      drawWingSide(-1);

      // 3. Graceful Silhouette
      ctx.fillStyle = '#FFFFFF';

      // Head & Topknot Bun
      ctx.beginPath();
      ctx.arc(0, -s * 0.6, s * 0.22, 0, Math.PI * 2);
      ctx.arc(s * 0.08, -s * 0.85, s * 0.14, 0, Math.PI * 2);
      ctx.fill();

      // Torso
      ctx.beginPath();
      ctx.moveTo(-s * 0.18, -s * 0.4);
      ctx.lineTo(s * 0.18, -s * 0.4);
      ctx.lineTo(s * 0.24, s * 0.15);
      ctx.lineTo(0, s * 0.35);
      ctx.lineTo(-s * 0.24, s * 0.15);
      ctx.closePath();
      ctx.fill();

      // Legs
      ctx.beginPath();
      ctx.moveTo(-s * 0.08, s * 0.3);
      ctx.quadraticCurveTo(-s * 0.15, s * 0.7, -s * 0.05, s * 1.05);
      ctx.lineTo(-s * 0.02, s * 1.05);
      ctx.moveTo(s * 0.08, s * 0.3);
      ctx.quadraticCurveTo(s * 0.18, s * 0.75, s * 0.12, s * 1.15);
      ctx.lineTo(s * 0.15, s * 1.15);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Heart Core with Soft Halo
      const heartHalo = ctx.createRadialGradient(0, -s * 0.1, 0, 0, -s * 0.1, s * 0.8);
      heartHalo.addColorStop(0, p.palette.firefly);
      heartHalo.addColorStop(0.5, p.palette.aura);
      heartHalo.addColorStop(1, 'transparent');
      ctx.fillStyle = heartHalo;
      ctx.beginPath();
      ctx.arc(0, -s * 0.1, s * 0.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, -s * 0.1, s * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();

      ctx.restore();
    }

    // ═══════════════════════════════════════════════
    // FOOTER ULTRA-SMOOTH CELESTIAL CANVAS ENGINE
    // ═══════════════════════════════════════════════
    const footerCanvas = document.getElementById('footer-celestial-canvas');
    if (footerCanvas) {
      const fCtx = footerCanvas.getContext('2d', { alpha: true });
      let fw, fh;
      let isFooterVisible = false;
      let footerAnimId = null;
      const fPixies = [];
      const fMeteors = [];
      const fEmbers = [];
      let lastFMeteor = performance.now();

      function fResize() {
        fw = footerCanvas.width = footerCanvas.offsetWidth || window.innerWidth;
        fh = footerCanvas.height = footerCanvas.offsetHeight || 340;
      }
      fResize();
      window.addEventListener('resize', fResize, { passive: true });

      // Pause footer canvas when scrolled away (saves massive GPU on main content)
      if ('IntersectionObserver' in window) {
        const footerObserver = new IntersectionObserver((entries) => {
          isFooterVisible = entries[0].isIntersecting;
          if (isFooterVisible && !footerAnimId) {
            footerAnimId = requestAnimationFrame(renderFooter);
          }
        }, { threshold: 0.05 });
        footerObserver.observe(footerCanvas);
      }

      const fPalettes = [
        { core: '#FFFFFF', firefly: '#FFD700', aura: 'rgba(255, 215, 0, 0.85)', wing: 'rgba(255, 245, 180, 0.85)', dust: '#FFD700' },
        { core: '#FFFFFF', firefly: '#00FFC8', aura: 'rgba(0, 255, 200, 0.85)', wing: 'rgba(122, 255, 227, 0.85)', dust: '#00FFC8' },
        { core: '#FFFFFF', firefly: '#00E5D4', aura: 'rgba(0, 229, 212, 0.85)', wing: 'rgba(163, 255, 248, 0.85)', dust: '#38FFF0' },
        { core: '#FFFFFF', firefly: '#C77DFF', aura: 'rgba(199, 125, 255, 0.85)', wing: 'rgba(224, 170, 255, 0.85)', dust: '#E0AAFF' }
      ];

      for (let i = 0; i < 8; i++) {
        fPixies.push({
          x: Math.random() * (fw || window.innerWidth),
          y: Math.random() * (fh || 340),
          vx: (Math.random() - 0.5) * 2.0,
          vy: (Math.random() - 0.5) * 1.5,
          targetX: Math.random() * (fw || window.innerWidth),
          targetY: Math.random() * (fh || 340),
          wingPhase: Math.random() * Math.PI * 2,
          wingSpeed: 0.6 + Math.random() * 0.3,
          fireflyPulse: Math.random() * Math.PI * 2,
          fireflySpeed: 0.05,
          size: 8 + Math.random() * 5,
          palette: fPalettes[i % fPalettes.length],
          z: 0.8 + Math.random() * 0.3
        });
      }

      for (let i = 0; i < 22; i++) {
        fEmbers.push({
          x: Math.random() * (fw || window.innerWidth),
          y: Math.random() * (fh || 340),
          radius: 0.8 + Math.random() * 2.0,
          phase: Math.random() * Math.PI * 2,
          vy: -(0.2 + Math.random() * 0.35),
          vx: (Math.random() - 0.5) * 0.2,
          color: ['#FFD700', '#00FFC8', '#00E5D4', '#C77DFF'][Math.floor(Math.random() * 4)]
        });
      }

      function spawnFMeteor() {
        if (fMeteors.length >= 4) return;
        fMeteors.push({
          x: Math.random() * (fw * 1.2),
          y: -20,
          length: 90 + Math.random() * 120,
          speed: 13 + Math.random() * 16,
          angle: (Math.PI / 4) + (Math.random() - 0.5) * 0.2,
          color: ['#00FFC8', '#FFD700', '#C77DFF', '#FFFFFF'][Math.floor(Math.random() * 4)],
          alpha: 1.0
        });
      }

      function renderFooter(now) {
        if (!fCtx || !isFooterVisible) {
          footerAnimId = null;
          return;
        }
        fCtx.clearRect(0, 0, fw, fh);

        // Meteors
        if (now - lastFMeteor > 1800) {
          spawnFMeteor();
          lastFMeteor = now;
        }

        fCtx.globalCompositeOperation = 'lighter';
        for (let i = fMeteors.length - 1; i >= 0; i--) {
          const m = fMeteors[i];
          m.x += Math.cos(m.angle) * m.speed;
          m.y += Math.sin(m.angle) * m.speed;
          m.alpha -= 0.026;

          if (m.alpha <= 0 || m.y > fh + 100) {
            fMeteors.splice(i, 1);
            continue;
          }

          const tx = m.x - Math.cos(m.angle) * m.length;
          const ty = m.y - Math.sin(m.angle) * m.length;
          const grad = fCtx.createLinearGradient(m.x, m.y, tx, ty);
          grad.addColorStop(0, '#FFFFFF');
          grad.addColorStop(0.3, m.color);
          grad.addColorStop(1, 'transparent');

          fCtx.beginPath();
          fCtx.moveTo(m.x, m.y);
          fCtx.lineTo(tx, ty);
          fCtx.strokeStyle = grad;
          fCtx.lineWidth = 2.0;
          fCtx.stroke();
        }

        // Embers
        fEmbers.forEach(em => {
          em.y += em.vy;
          em.x += em.vx;
          em.phase += 0.03;
          if (em.y < -10) em.y = fh + 10;
          if (em.x < 0) em.x = fw;
          if (em.x > fw) em.x = 0;

          const a = 0.3 + 0.5 * Math.sin(em.phase);
          fCtx.beginPath();
          fCtx.arc(em.x, em.y, em.radius, 0, Math.PI * 2);
          fCtx.fillStyle = em.color;
          fCtx.globalAlpha = a;
          fCtx.fill();
        });
        fCtx.globalAlpha = 1.0;

        // Photorealistic Tinkerbell Fairies in Footer
        fPixies.forEach(p => {
          p.x += p.vx;
          p.y += p.vy;
          p.wingPhase += p.wingSpeed;
          p.fireflyPulse += p.fireflySpeed;

          if (p.x < 20 || p.x > fw - 20) p.vx *= -1;
          if (p.y < 20 || p.y > fh - 20) p.vy *= -1;

          drawPhotorealisticTinkerbell(fCtx, p, now);
        });

        if (!reduceMotion()) footerAnimId = requestAnimationFrame(renderFooter);
      }
    }

    // ─── SPARKLE CURSOR TRAIL (GPU-Accelerated & Throttled) ──────
    const sparkleColors = ['#FFD700', '#00FFC8', '#00E5D4', '#38FFF0', '#C77DFF'];
    let lastSparkle = 0;
    let activeSparkleCount = 0;

    document.addEventListener('mousemove', (e) => {
      const now = performance.now();
      if (now - lastSparkle < 55 || activeSparkleCount >= 18) return;
      lastSparkle = now;
      activeSparkleCount++;

      const sparkle = document.createElement('div');
      sparkle.className = 'sparkle-particle';
      const size = 5 + Math.random() * 8;
      const sx   = (Math.random() - 0.5) * 40;
      const color = sparkleColors[Math.floor(Math.random() * sparkleColors.length)];

      sparkle.style.cssText = `
        left: ${e.clientX + (Math.random() - 0.5) * 14}px;
        top:  ${e.clientY + (Math.random() - 0.5) * 14}px;
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        color: ${color};
        --sx: ${sx}px;
      `;
      document.body.appendChild(sparkle);
      setTimeout(() => {
        sparkle.remove();
        activeSparkleCount--;
      }, 1000);
    }, { passive: true });

    // ─── HOLLYWOOD-GRADE 3D TILT (Zero Layout Thrashing) ───
    let isUserScrolling = false;
    let scrollTimeout = null;

    window.addEventListener('scroll', () => {
      isUserScrolling = true;
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => { isUserScrolling = false; }, 80);
    }, { passive: true });

    const tiltCards = document.querySelectorAll('.service-card, .merch-card, .testimonial-card, .notes-step, .pricing-card, .about__image-frame');
    tiltCards.forEach(card => {
      let cachedBounds = null;

      function rotateToMouse(e) {
        if (isUserScrolling || !cachedBounds) return;
        const leftX = e.clientX - cachedBounds.x;
        const topY = e.clientY - cachedBounds.y;
        const center = {
          x: leftX - cachedBounds.width / 2,
          y: topY - cachedBounds.height / 2
        };
        
        card.style.transform = `
          perspective(1000px)
          scale3d(1.02, 1.02, 1.02)
          rotateX(${-center.y / 18}deg)
          rotateY(${center.x / 18}deg)
        `;
        
        let glare = card.querySelector('.card-specular-glare');
        if (!glare) {
          glare = document.createElement('div');
          glare.className = 'card-specular-glare';
          glare.style.cssText = 'position:absolute; inset:0; border-radius:inherit; pointer-events:none; z-index:5; opacity:0; transition:opacity 0.2s ease;';
          card.style.position = 'relative';
          card.appendChild(glare);
        }
        glare.style.opacity = '1';
        glare.style.background = `radial-gradient(circle at ${(leftX / cachedBounds.width) * 100}% ${(topY / cachedBounds.height) * 100}%, rgba(255, 255, 255, 0.22) 0%, rgba(0, 229, 212, 0.12) 30%, transparent 65%)`;
      }

      function removeListener() {
        card.style.transform = '';
        cachedBounds = null;
        const glare = card.querySelector('.card-specular-glare');
        if (glare) glare.style.opacity = '0';
      }

      card.addEventListener('mouseenter', () => {
        cachedBounds = card.getBoundingClientRect();
        card.style.transition = 'transform 0.1s ease-out';
      }, { passive: true });

      card.addEventListener('mousemove', rotateToMouse, { passive: true });
      card.addEventListener('mouseleave', () => {
        card.style.transition = 'transform 0.5s cubic-bezier(0.2, 1, 0.3, 1)';
        removeListener();
      }, { passive: true });
    });

    // ─── MAGNETIC CTA BUTTONS (Cached Bounding Rect) ─────────
    const magneticBtns = document.querySelectorAll('.btn-primary, .btn-secondary, .btn-inquire, .cart-toggle-btn');
    magneticBtns.forEach(btn => {
      let btnRect = null;
      btn.addEventListener('mouseenter', () => {
        btnRect = btn.getBoundingClientRect();
        btn.style.transition = 'transform 0.1s ease-out';
      }, { passive: true });

      btn.addEventListener('mousemove', (e) => {
        if (!btnRect) btnRect = btn.getBoundingClientRect();
        const x = e.clientX - btnRect.left - btnRect.width / 2;
        const y = e.clientY - btnRect.top - btnRect.height / 2;
        btn.style.transform = `translate3d(${x * 0.22}px, ${y * 0.22}px, 0) scale(1.04)`;
      }, { passive: true });

      btn.addEventListener('mouseleave', () => {
        btn.style.transform = '';
        btn.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        btnRect = null;
      }, { passive: true });
    });

    // ─── SCROLL REVEAL ───
    /* Siblings inside the same parent reveal in sequence rather than all at
       once, which reads as the section assembling itself instead of a slab
       appearing. --i is the child's index within its group; the CSS turns it
       into a transition-delay. The stagger is capped so a long grid does not
       leave the last card waiting seconds after the first. */
    const fadeEls = [...document.querySelectorAll('.fade-in')];
    const groups = new Map();
    fadeEls.forEach(el => {
      const parent = el.parentElement;
      if (!groups.has(parent)) groups.set(parent, 0);
      const i = groups.get(parent);
      groups.set(parent, i + 1);
      el.style.setProperty('--i', Math.min(i, 6));
    });

    let pending = new Set(fadeEls);
    const reveal = (el) => {
      el.classList.add('visible');
      pending.delete(el);
    };

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(e => {
          if (!e.isIntersecting) return;
          reveal(e.target);
          obs.unobserve(e.target);   // reveal is one-way; stop watching
        });
      }, { threshold: 0.05, rootMargin: '0px 0px 100px 0px' });
      fadeEls.forEach(el => {
        observer.observe(el);
        if (el.getBoundingClientRect().top < (window.innerHeight || 800) * 1.3) {
          reveal(el);
        }
      });
    }

    /* Backstop.

       The observer stages the reveal; this guarantees it happens. Chrome does
       not deliver IntersectionObserver callbacks to a hidden document, so a
       tab restored from the background — or opened in the background and
       scrolled once visible — can otherwise sit on content that never
       appears. The previous code covered that with a blanket timer that
       revealed everything 1.2s after load, which also threw the choreography
       away. This keeps the choreography and still cannot leave anything
       stranded: on scroll, and once on load, whatever is actually in view
       gets revealed.

       rAF-throttled, and it removes itself as soon as nothing is left. */
    let ticking = false;
    const sweep = () => {
      ticking = false;
      const h = window.innerHeight || document.documentElement.clientHeight;
      pending.forEach(el => {
        // Anything whose top has passed the reveal line counts, including
        // what is now above the viewport. Testing "currently in view" instead
        // strands every element the reader scrolled straight past — a fast
        // flick or an anchor jump would leave holes in the page that never
        // fill in.
        if (el.getBoundingClientRect().top < h * 0.94) reveal(el);
      });
      if (!pending.size) {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
        document.removeEventListener('visibilitychange', sweep);
      }
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(sweep);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    document.addEventListener('visibilitychange', sweep);
    sweep();
    setTimeout(sweep, 1500);
    setTimeout(sweep, 3500);
    setTimeout(sweep, 4500);

    // ─── PRODUCT OPTIONS (SIZE PILLS & COLOR DOTS) ───
    document.querySelectorAll('.size-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        const parent = pill.closest('.option-group');
        parent?.querySelectorAll('.size-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
      });
    });

    document.querySelectorAll('.color-dot').forEach(dot => {
      dot.addEventListener('click', (e) => {
        const parent = dot.closest('.option-group');
        parent?.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');

        // Swap product image if data-img is present
        const newImgSrc = dot.getAttribute('data-img');
        if (newImgSrc) {
          const card = dot.closest('.merch-card, .merch-page-card');
          const img = card?.querySelector('.merch-card__img, .merch-page-card__img');
          if (img) {
            img.style.transition = 'opacity 0.3s ease';
            img.style.opacity = '0.4';
            const tempImg = new Image();
            tempImg.onload = () => {
              img.src = newImgSrc;
              img.style.opacity = '1';
            };
            tempImg.onerror = () => {
              img.style.opacity = '1';
            };
            tempImg.src = newImgSrc;
          }
        }
      });
    });

    // ─── TESTIMONIAL MODAL & 5-STAR PICKER ──────────
    const testModal = document.getElementById('testimonial-modal');
    const openTestModalBtn = document.getElementById('open-testimonial-modal-btn');
    const closeTestModalBtn = document.getElementById('close-testimonial-modal-btn');
    const testForm = document.getElementById('submit-testimonial-form');
    const starPicker = document.getElementById('star-picker');
    let selectedStars = 5;

    openTestModalBtn?.addEventListener('click', () => {
      testModal?.classList.add('active');
      if (typeof window.triggerFairyInterrupted === 'function') {
        window.triggerFairyInterrupted();
      }
    });

    closeTestModalBtn?.addEventListener('click', () => {
      testModal?.classList.remove('active');
    });

    testModal?.addEventListener('click', (e) => {
      if (e.target === testModal) testModal.classList.remove('active');
    });

    // Star Picker Interaction
    starPicker?.querySelectorAll('.star-pick').forEach(star => {
      star.addEventListener('click', () => {
        const val = parseInt(star.getAttribute('data-val'), 10);
        selectedStars = val;
        starPicker.querySelectorAll('.star-pick').forEach(s => {
          const sVal = parseInt(s.getAttribute('data-val'), 10);
          s.classList.toggle('active', sVal <= val);
        });
      });
    });

    // Submit Testimonial Handler
    testForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('review-name')?.value?.trim();
      const service = document.getElementById('review-service')?.value;
      const text = document.getElementById('review-text')?.value?.trim();
      const googleLink = document.getElementById('review-google-link')?.value?.trim();

      if (!name || !service || !text) {
        showToast('Please fill in all required review fields.', 'sparkle');
        return;
      }

      const submitBtn = testForm.querySelector('.form__submit');
      if (submitBtn) { setPico(submitBtn, 'sparkle', 'Saving Your Sacred Story...'); submitBtn.disabled = true; }

      setTimeout(() => {
        testModal?.classList.remove('active');
        showToast('Thank you! Your testimonial has been received and blessed.', 'star');
        testForm.reset();
        if (submitBtn) { setPico(submitBtn, 'sparkle', 'Submit Testimonial'); submitBtn.disabled = false; }
      }, 900);
    });

    // ─── FILTER BUTTONS (Pages/Testimonials & Pages/Merch) ───
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const parent = btn.closest('.merch-filters');
        parent?.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const filter = btn.getAttribute('data-filter');
        const grid = document.querySelector('.merch-page-grid, .testimonials-page-grid');
        if (!grid) return;

        grid.querySelectorAll('.merch-page-card, .testimonial-page-card').forEach(card => {
          if (filter === 'all') {
            card.style.display = '';
          } else {
            const cat = card.getAttribute('data-category') || '';
            card.style.display = cat.includes(filter) ? '' : 'none';
          }
        });
      });
    });

    // ─── CELESTIAL WEB AUDIO ENGINE (Crystal Solfeggio Chimes & Singing Bowls) ────
    class CelestialAudioEngine {
      constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.enabled = false; // OFF by default
        this.currentFreq = 528;
        this.activeOscillators = new Set();
      }

      init() {
        if (!this.ctx) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (AudioContext) {
            this.ctx = new AudioContext();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.setValueAtTime(this.enabled ? 1.0 : 0.0001, this.ctx.currentTime);
            this.masterGain.connect(this.ctx.destination);
          }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
      }

      setEnabled(val) {
        this.enabled = !!val;
        this.init();
        if (this.masterGain && this.ctx) {
          const now = this.ctx.currentTime;
          if (this.enabled) {
            this.masterGain.gain.cancelScheduledValues(now);
            this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
            this.masterGain.gain.linearRampToValueAtTime(1.0, now + 0.04);
          } else {
            this.stopAll();
          }
        }
        if (typeof updateAudioUIState === 'function') updateAudioUIState();
      }

      stopAll() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        if (this.masterGain) {
          this.masterGain.gain.cancelScheduledValues(now);
          this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
          this.masterGain.gain.linearRampToValueAtTime(0.00001, now + 0.03);
        }
        this.activeOscillators.forEach(osc => {
          try {
            osc.stop(now + 0.04);
            setTimeout(() => {
              try { osc.disconnect(); } catch(e) {}
            }, 60);
          } catch(e) {}
        });
        this.activeOscillators.clear();
      }

      playChime(freq = this.currentFreq, duration = 2.2, force = false) {
        if (!this.enabled && !force) return;
        try {
          this.init();
          if (!this.ctx || !this.masterGain) return;
          if (this.ctx.state === 'suspended') {
            this.ctx.resume();
          }
          if (force && this.masterGain.gain.value < 0.1) {
            this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
          }
          const now = this.ctx.currentTime;

          // 1. Fundamental Solfeggio Tone
          const osc1 = this.ctx.createOscillator();
          const gain1 = this.ctx.createGain();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(freq, now);
          gain1.gain.setValueAtTime(0.12, now);
          gain1.gain.linearRampToValueAtTime(0.0001, now + duration);
          osc1.connect(gain1);
          gain1.connect(this.masterGain);

          this.activeOscillators.add(osc1);
          osc1.onended = () => {
            this.activeOscillators.delete(osc1);
            try { osc1.disconnect(); gain1.disconnect(); } catch(e) {}
          };
          osc1.start(now);
          osc1.stop(now + duration);

          // 2. Harmonic Overtone (Octave + 5th)
          const osc2 = this.ctx.createOscillator();
          const gain2 = this.ctx.createGain();
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(freq * 1.5, now);
          gain2.gain.setValueAtTime(0.035, now);
          gain2.gain.linearRampToValueAtTime(0.0001, now + duration * 0.75);
          osc2.connect(gain2);
          gain2.connect(this.masterGain);

          this.activeOscillators.add(osc2);
          osc2.onended = () => {
            this.activeOscillators.delete(osc2);
            try { osc2.disconnect(); gain2.disconnect(); } catch(e) {}
          };
          osc2.start(now);
          osc2.stop(now + duration * 0.75);

          // 3. Shimmer Overtone (Double Octave)
          const osc3 = this.ctx.createOscillator();
          const gain3 = this.ctx.createGain();
          osc3.type = 'sine';
          osc3.frequency.setValueAtTime(freq * 2.0, now);
          gain3.gain.setValueAtTime(0.02, now);
          gain3.gain.linearRampToValueAtTime(0.0001, now + duration * 0.6);
          osc3.connect(gain3);
          gain3.connect(this.masterGain);

          this.activeOscillators.add(osc3);
          osc3.onended = () => {
            this.activeOscillators.delete(osc3);
            try { osc3.disconnect(); gain3.disconnect(); } catch(e) {}
          };
          osc3.start(now);
          osc3.stop(now + duration * 0.6);
        } catch(e) {}
      }

      playTibetanBowl(freq = this.currentFreq, duration = 3.6, force = false) {
        if (!this.enabled && !force) return;
        try {
          this.init();
          if (!this.ctx || !this.masterGain) return;
          if (this.ctx.state === 'suspended') {
            this.ctx.resume();
          }
          if (force && this.masterGain.gain.value < 0.1) {
            this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
          }
          const now = this.ctx.currentTime;
          const freqs = [freq, freq * 1.004, freq * 2.76, freq * 5.4];
          const gains = [0.15, 0.09, 0.04, 0.015];
          const decays = [duration, duration * 0.9, duration * 0.6, duration * 0.4];

          freqs.forEach((f, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, now);
            gain.gain.setValueAtTime(gains[i], now);
            gain.gain.linearRampToValueAtTime(0.0001, now + decays[i]);
            osc.connect(gain);
            gain.connect(this.masterGain);

            this.activeOscillators.add(osc);
            osc.onended = () => {
              this.activeOscillators.delete(osc);
              try { osc.disconnect(); gain.disconnect(); } catch(e) {}
            };
            osc.start(now);
            osc.stop(now + decays[i]);
          });
        } catch(e) {}
      }

      playAngelChimes(force = false) {
        if (!this.enabled && !force) return;
        const notes = [528, 639, 741, 852, 963, 1056];
        notes.forEach((f, idx) => {
          setTimeout(() => {
            if (this.enabled || force) this.playChime(f, 1.6, force);
          }, idx * 75);
        });
      }

      playGlissando(force = false) {
        this.playAngelChimes(force);
      }
    }

    window.celestialAudio = new CelestialAudioEngine();

    // ─── CELESTIAL SOUND FREQUENCY SELECTOR POPUP MODAL ─────
    const soundModal = document.getElementById('sound-modal');
    const openSoundModalBtn = document.getElementById('open-sound-modal-btn');
    const openSoundModalMobileBtn = document.getElementById('open-sound-modal-mobile-btn');
    const closeSoundModalBtn = document.getElementById('close-sound-modal-btn');
    const soundMuteToggleBtn = document.getElementById('toggle-sound-mute-btn');
    const testChimeBtn = document.getElementById('test-sound-chime-btn');
    const navFreqLabel = document.getElementById('nav-sound-freq-label');
    const navFreqMobileLabel = document.getElementById('nav-sound-freq-mobile-label');
    const soundModalGrid = document.getElementById('sound-modal-grid');

    const updateAudioUIState = () => {
      const muteIcon = document.getElementById('sound-mute-icon');
      const muteText = document.getElementById('sound-mute-text');
      if (window.celestialAudio.enabled) {
        if (muteIcon) setPico(muteIcon, 'bell');
        if (muteText) muteText.textContent = 'Sound Active (Click to Mute)';
        if (navFreqLabel) navFreqLabel.textContent = `${window.celestialAudio.currentFreq} Hz`;
        if (navFreqMobileLabel) navFreqMobileLabel.textContent = `${window.celestialAudio.currentFreq} Hz`;
        openSoundModalBtn?.classList.add('audio-active');
        openSoundModalMobileBtn?.classList.add('audio-active');
      } else {
        if (muteIcon) setPico(muteIcon, 'bell-off');
        if (muteText) muteText.textContent = 'Sound Muted (Click to Enable)';
        if (navFreqLabel) navFreqLabel.textContent = 'Sound';
        if (navFreqMobileLabel) navFreqMobileLabel.textContent = 'Sound (Off)';
        openSoundModalBtn?.classList.remove('audio-active');
        openSoundModalMobileBtn?.classList.remove('audio-active');
      }
    };
    updateAudioUIState();

    const openSoundModal = () => {
      soundModal?.classList.add('active');
      if (typeof window.triggerFairyInterrupted === 'function') {
        window.triggerFairyInterrupted();
      }
    };

    const closeSoundModal = () => {
      soundModal?.classList.remove('active');
    };
    window.closeSoundModal = closeSoundModal;

    // Direct toggle on navbar button: If active, single click mutes instantly. If muted, opens frequency modal.
    openSoundModalBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.celestialAudio.enabled) {
        window.celestialAudio.setEnabled(false);
        showToast('Celestial Sound Muted', 'bell-off');
      } else {
        openSoundModal();
      }
    });

    openSoundModalMobileBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.celestialAudio.enabled) {
        window.celestialAudio.setEnabled(false);
        showToast('Celestial Sound Muted', 'bell-off');
      } else {
        openSoundModal();
      }
    });

    closeSoundModalBtn?.addEventListener('click', closeSoundModal);

    soundModal?.addEventListener('click', (e) => {
      if (e.target === soundModal) closeSoundModal();
    });

    // Frequency Card Selection
    soundModalGrid?.querySelectorAll('.sound-modal-freq-card').forEach(card => {
      card.addEventListener('click', () => {
        soundModalGrid.querySelectorAll('.sound-modal-freq-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const freq = parseInt(card.getAttribute('data-freq') || '528', 10);
        window.celestialAudio.currentFreq = freq;
        window.celestialAudio.setEnabled(true);
        window.celestialAudio.playChime(freq, 2.0, true);
        showToast(`Solfeggio Tuned to ${freq}Hz`, 'sparkle');
      });
    });

    // Mute / Unmute Toggle Button inside Modal
    soundMuteToggleBtn?.addEventListener('click', () => {
      const nextState = !window.celestialAudio.enabled;
      window.celestialAudio.setEnabled(nextState);
      if (nextState) {
        window.celestialAudio.playChime(window.celestialAudio.currentFreq, 2.0, true);
        showToast('Sound Activated', 'bell');
      } else {
        showToast('Sound Muted', 'bell-off');
      }
    });

    // Test Chime Button (Preview chime with force=true)
    testChimeBtn?.addEventListener('click', () => {
      window.celestialAudio.init();
      if (window.celestialAudio.masterGain && window.celestialAudio.ctx) {
        window.celestialAudio.masterGain.gain.setValueAtTime(1.0, window.celestialAudio.ctx.currentTime);
      }
      window.celestialAudio.playGlissando(true);
      showToast(`Harmonizing at ${window.celestialAudio.currentFreq}Hz`, 'sparkle');
    });

    // ─── INTUITIVE SOUL ALIGNMENT QUIZ ────────────────
    const quizStep1 = document.getElementById('quiz-step-1');
    const quizStep2 = document.getElementById('quiz-step-2');
    const quizResult = document.getElementById('quiz-result');
    const quizResTitle = document.getElementById('quiz-res-title');
    const quizResDesc = document.getElementById('quiz-res-desc');
    const quizResCta = document.getElementById('quiz-res-cta');
    const quizModalityIcon = document.getElementById('quiz-modality-icon');
    const quizModalityName = document.getElementById('quiz-modality-name');
    const quizModalityDesc = document.getElementById('quiz-modality-desc');
    const quizArtifactIcon = document.getElementById('quiz-artifact-icon');
    const quizArtifactName = document.getElementById('quiz-artifact-name');
    const quizArtifactDesc = document.getElementById('quiz-artifact-desc');
    const quizArtifactCta = document.getElementById('quiz-artifact-cta');
    let quizAnswers = {};

    document.querySelectorAll('.quiz-opt-1').forEach(btn => {
      btn.addEventListener('click', () => {
        quizAnswers.need = btn.getAttribute('data-val');
        quizStep1?.classList.remove('active');
        quizStep2?.classList.add('active');
        if (window.celestialAudio && window.celestialAudio.enabled) window.celestialAudio.playChime(639);
      });
    });

    document.querySelectorAll('.quiz-opt-2').forEach(btn => {
      btn.addEventListener('click', () => {
        quizAnswers.style = btn.getAttribute('data-val');
        quizStep2?.classList.remove('active');
        quizResult?.classList.add('active');
        if (window.celestialAudio && window.celestialAudio.enabled) window.celestialAudio.playGlissando();

        // Dynamic Recommendations: Modality + Sacred Store Artifact
        if (quizAnswers.need === 'mediumship') {
          setPico(quizResTitle, 'orb', 'Evidential Psychic Mediumship & Spirit Connection');
          quizResDesc.textContent = 'Your soul is calling for direct spiritual validation, heartfelt communion with departed loved ones, and divine confirmation of your life path.';
          
          if (quizModalityIcon) setPico(quizModalityIcon, 'orb');
          if (quizModalityName) quizModalityName.textContent = 'Evidential Mediumship Session';
          if (quizModalityDesc) quizModalityDesc.textContent = '1-on-1 private virtual reading bridging the veil to deliver evidential proof, sacred closure, and channeled messages.';
          if (quizResCta) {
            quizResCta.href = '#contact';
            setPico(quizResCta, 'sparkle', 'Book Psychic Mediumship Session');
          }

          if (quizArtifactIcon) setPico(quizArtifactIcon, 'tshirt');
          if (quizArtifactName) quizArtifactName.textContent = 'The Eye Believe Heavyweight Cotton Tee';
          if (quizArtifactDesc) quizArtifactDesc.textContent = 'Anointed organic heavyweight ritual garment featuring the sacred talisman embroidery ($48).';
          if (quizArtifactCta) {
            quizArtifactCta.href = '#merch';
            quizArtifactCta.setAttribute('data-target-product', 'tee');
          }
        } else if (quizAnswers.need === 'reiki') {
          setPico(quizResTitle, 'hand', 'Restorative Reiki Energy Restructuring');
          quizResDesc.textContent = 'Your energetic field is ready to shed physical fatigue, dissolve energy cords, and restore luminous equilibrium across all 7 chakra centers.';
          
          if (quizModalityIcon) setPico(quizModalityIcon, 'hand');
          if (quizModalityName) quizModalityName.textContent = 'Distance Reiki Healing Session';
          if (quizModalityDesc) quizModalityDesc.textContent = 'Multi-dimensional subtle-body purification, chakra cord clearing, and restorative biofield amplification.';
          if (quizResCta) {
            quizResCta.href = '#contact';
            setPico(quizResCta, 'leaf', 'Book Reiki Energy Session');
          }

          if (quizArtifactIcon) setPico(quizArtifactIcon, 'jacket');
          if (quizArtifactName) quizArtifactName.textContent = 'The Eye Believe Heavyweight Sweatshirt';
          if (quizArtifactDesc) quizArtifactDesc.textContent = 'Ultra-plush fleece sanctuary layer for post-session integration and daily warmth ($68).';
          if (quizArtifactCta) {
            quizArtifactCta.href = '#merch';
            quizArtifactCta.setAttribute('data-target-product', 'sweatshirt');
          }
        } else if (quizAnswers.need === 'tapping') {
          setPico(quizResTitle, 'leaf', 'Somatic EFT Acupressure Tapping');
          quizResDesc.textContent = 'Rapid nervous system reprogramming to dissolve anxiety loops, release stored cellular tension, and establish sovereign grounded peace.';
          
          if (quizModalityIcon) setPico(quizModalityIcon, 'leaf');
          if (quizModalityName) quizModalityName.textContent = 'EFT Tapping Solution Session';
          if (quizModalityDesc) quizModalityDesc.textContent = 'Clinical meridian acupressure protocols to clear chronic anxiety, fear triggers, and emotional overload.';
          if (quizResCta) {
            quizResCta.href = '#contact';
            setPico(quizResCta, 'sparkle', 'Book EFT Tapping Session');
          }

          if (quizArtifactIcon) setPico(quizArtifactIcon, 'cap');
          if (quizArtifactName) quizArtifactName.textContent = 'The Eye Believe Classic Trucker Hat';
          if (quizArtifactDesc) quizArtifactDesc.textContent = 'Structured mesh crown with raised dimensional third-eye embroidery for outdoor protection ($34).';
          if (quizArtifactCta) {
            quizArtifactCta.href = '#merch';
            quizArtifactCta.setAttribute('data-target-product', 'hat');
          }
        } else {
          setPico(quizResTitle, 'letter', 'Notes by Beth (Handwritten Channeled Letter)');
          quizResDesc.textContent = 'A sacred, tactile love note channeled directly for your soul, sealed in teal wax and infused with high-vibrational crystal blessings.';
          
          if (quizModalityIcon) setPico(quizModalityIcon, 'letter');
          if (quizModalityName) quizModalityName.textContent = 'Notes by Beth Soul Letter';
          if (quizModalityDesc) quizModalityDesc.textContent = 'A bespoke physical channeled letter handwritten by Beth Elise on archival deckle-edge parchment ($28).';
          if (quizResCta) {
            quizResCta.href = '#notes';
            setPico(quizResCta, 'letter', 'Order Your Soul Letter ($28)');
          }

          if (quizArtifactIcon) setPico(quizArtifactIcon, 'sparkle');
          if (quizArtifactName) quizArtifactName.textContent = 'The Eye Believe Sacred Merch Collection';
          if (quizArtifactDesc) quizArtifactDesc.textContent = 'Complete your sacred space with physical ritual attire and protective apparel.';
          if (quizArtifactCta) {
            quizArtifactCta.href = '#merch';
            quizArtifactCta.setAttribute('data-target-product', 'all');
          }
        }

        // Scroll smoothly to result
        quizResult?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });

    // Handle physical artifact CTA click with store card highlight
    quizArtifactCta?.addEventListener('click', (e) => {
      e.preventDefault();
      const merchSection = document.getElementById('merch');
      if (merchSection) {
        merchSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        showToast('Navigated to Sacred Merch Store', 'bag');
        const cards = merchSection.querySelectorAll('.merch-card');
        cards.forEach(card => {
          card.style.transition = 'transform 0.4s ease, box-shadow 0.4s ease';
          card.style.transform = 'scale(1.04)';
          card.style.boxShadow = '0 0 35px rgba(0, 229, 212, 0.8), 0 0 50px rgba(255, 215, 0, 0.5)';
          setTimeout(() => {
            card.style.transform = '';
            card.style.boxShadow = '';
          }, 2200);
        });
      }
    });

    document.getElementById('quiz-reset-btn')?.addEventListener('click', () => {
      quizResult?.classList.remove('active');
      quizStep1?.classList.add('active');
      quizAnswers = {};
    });

    // ─── BACK TO TOP BUTTON ───────────────────────────
    const backToTopBtn = document.getElementById('back-to-top-btn');
    if (backToTopBtn) {
      window.addEventListener('scroll', () => {
        backToTopBtn.classList.toggle('visible', window.scrollY > 400);
      }, { passive: true });

      backToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (window.celestialAudio && typeof window.celestialAudio.playChime === 'function') {
          window.celestialAudio.playChime(963, 1.2);
        }
      });
    }

    // ─── INTERACTIVE SEVEN CHAKRAS RESONANCE MAP ─────
    const sevenChakrasData = {
      crown: {
        name: 'Crown Chakra (Sahasrara)',
        sanskrit: 'Sahasrara',
        glyph: 'ॐ',
        freq: 963,
        color: '#C77DFF',
        glow: 'rgba(199, 125, 255, 0.6)',
        meta: '963 Hz · Pure Consciousness · Crown of Head',
        desc: 'The sacred portal to divine onepath, angelic guidance, and infinite spiritual illumination. Channeled message from Beth: You are unconditionally held by the cosmos. Release the need to micromanage every step—trust the divine timing currently unfolding in your life.',
        affirmation: '"I am one with divine cosmic light. I know my sacred soul path."'
      },
      thirdeye: {
        name: 'Third Eye Chakra (Ajna)',
        sanskrit: 'Ajna',
        glyph: 'ॐ',
        freq: 852,
        color: '#7289DA',
        glow: 'rgba(67, 97, 238, 0.6)',
        meta: '852 Hz · Light & Clairvoyance · Center of Brow',
        desc: 'Spiritual clairvoyance, prophetic knowing, and heightened intuitive vision. Channeled message from Beth: Your intuitive senses are expanding exponentially. Pay close attention to subtle synchronicities, recurring numbers, and your first immediate gut feelings.',
        affirmation: '"I see beyond the physical illusion. My intuition is crystal clear and trustworthy."'
      },
      throat: {
        name: 'Throat Chakra (Vishuddha)',
        sanskrit: 'Vishuddha',
        glyph: 'हं',
        freq: 741,
        color: '#00E5D4',
        glow: 'rgba(0, 229, 212, 0.6)',
        meta: '741 Hz · Sound & Ether · Vocal Throat Center',
        desc: 'Sovereign authentic expression and speaking your sacred truth without fear. Channeled message from Beth: Unspoken feelings create unnecessary physical neck and throat constriction. Give yourself permission to speak your desires with radiant clarity and compassionate grace.',
        affirmation: '"I speak my sacred truth with courage, loving kindness, and unshakeable poise."'
      },
      heart: {
        name: 'Heart Chakra (Anahata)',
        sanskrit: 'Anahata',
        glyph: 'यं',
        freq: 639,
        color: '#00FFC8',
        glow: 'rgba(0, 255, 200, 0.6)',
        meta: '639 Hz · Sacred Prana & Air · Center of Chest',
        desc: 'Unconditional love, soul-level forgiveness, and profound energetic restoration. Channeled message from Beth: Soften any protective energetic walls around your chest. You are safe to give and receive deep, nurturing love without fear of abandonment.',
        affirmation: '"I open my heart to unconditional love, deep forgiveness, and divine healing."'
      },
      solar: {
        name: 'Solar Plexus (Manipura)',
        sanskrit: 'Manipura',
        glyph: 'रं',
        freq: 528,
        color: '#FFD700',
        glow: 'rgba(255, 215, 0, 0.6)',
        meta: '528 Hz · Fire & Transformation · Upper Abdomen',
        desc: 'Personal sovereignty, gut willpower, and the miraculous 528 Hz transformation frequency. Channeled message from Beth: Step boldly into your self-worth. You already possess the inner strength and wisdom required to manifest your highest soul goals.',
        affirmation: '"I stand sovereign in my divine power. I am worthy, capable, and fearless."'
      },
      sacral: {
        name: 'Sacral Chakra (Svadhisthana)',
        sanskrit: 'Svadhisthana',
        glyph: 'वं',
        freq: 417,
        color: '#FF9E00',
        glow: 'rgba(255, 123, 0, 0.6)',
        meta: '417 Hz · Water & Emotional Flow · Lower Pelvis',
        desc: 'Sensual flow, artistic inspiration, and releasing past stagnation. Channeled message from Beth: Allow your emotions to move like gentle water rather than resisting the tide. Reconnect with playful joy, creativity, and the beautiful sensuousness of being alive.',
        affirmation: '"I feel deep passion, creative flow, and joyful abundance moving through me."'
      },
      root: {
        name: 'Root Chakra (Muladhara)',
        sanskrit: 'Muladhara',
        glyph: 'लं',
        freq: 396,
        color: '#FF5964',
        glow: 'rgba(230, 57, 70, 0.6)',
        meta: '396 Hz · Earth & Ancestral Safety · Base of Spine',
        desc: 'Ancestral grounding, physical safety, and releasing survival anxiety. Channeled message from Beth: You are rooted deeply into Mother Earth. Release fears around lack or instability—the universe is actively orchestrating security and sanctuary around you.',
        affirmation: '"I am safe, grounded, and deeply anchored into the abundant Earth."'
      }
    };

    let activeChakraKey = 'thirdeye';
    const chakraRows = document.querySelectorAll('.chakra-poster-row, .chakra-row');
    const chakraNodeBtns = document.querySelectorAll('.chakra-emblem-btn, .chakra-node-btn');
    const altarBox = document.querySelector('.chakra-poster-canvas, .chakra-poster-altar');
    const readingBox = document.getElementById('chakra-reading-box');
    const resGlyph = document.getElementById('chakra-res-glyph');
    const resTitle = document.getElementById('chakra-res-title');
    const resMeta = document.getElementById('chakra-res-meta');
    const resDesc = document.getElementById('chakra-res-desc');
    const resAffirm = document.getElementById('chakra-res-affirm');
    const resHzBtn = document.getElementById('chakra-res-hz-btn');
    const replayAudioBtn = document.getElementById('chakra-replay-audio-btn');

    function activateChakra(key, playAudio = true) {
      const data = sevenChakrasData[key];
      if (!data) return;
      activeChakraKey = key;

      // Update Hotspot and Row active states
      document.querySelectorAll('.chakra-hotspot-item, .chakra-poster-row, .chakra-row').forEach(el => {
        if (el.getAttribute('data-chakra') === key) {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      });

      document.querySelectorAll('.chakra-hotspot-node, .chakra-emblem-btn, .chakra-node-btn').forEach(btn => {
        if (btn.getAttribute('data-chakra') === key) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });

      // Update Altar Reading Card
      if (resTitle) {
        resTitle.textContent = data.name;
        resTitle.style.color = data.color;
      }
      if (resGlyph) {
        resGlyph.textContent = data.glyph;
        resGlyph.style.borderColor = data.color;
        resGlyph.style.boxShadow = `0 0 20px ${data.glow}`;
      }
      if (resMeta) resMeta.textContent = data.meta;
      if (resDesc) resDesc.textContent = data.desc;
      if (resAffirm) resAffirm.textContent = data.affirmation;
      if (resHzBtn) resHzBtn.textContent = `${data.freq} Hz`;

      if (readingBox) {
        readingBox.style.borderColor = data.color;
        readingBox.style.boxShadow = `0 25px 70px rgba(0,0,0,0.95), 0 0 45px ${data.glow}`;
        readingBox.classList.add('active');
        // On narrow screens the window has to go full-width, which would sit on
        // top of the upper chakras. Open it collapsed there — title bar only —
        // so every node stays reachable; the toggle expands it on demand.
        const narrow = window.innerWidth <= 620;
        readingBox.classList.toggle('collapsed', narrow);
        const tgl = document.getElementById('chakra-popup-toggle-btn');
        if (tgl) {
          tgl.setAttribute('aria-expanded', String(!narrow));
          tgl.setAttribute('aria-label', narrow ? 'Expand chakra details' : 'Collapse chakra details');
        }
      }

      if (altarBox) {
        altarBox.style.boxShadow = `0 35px 90px rgba(0, 0, 0, 0.8), 0 0 50px ${data.glow}`;
      }

      if (playAudio && window.celestialAudio) {
        window.celestialAudio.currentFreq = data.freq;
        window.celestialAudio.playTibetanBowl(data.freq, 3.6, true);
        showToast(`${data.name} Activated · ${data.freq} Hz Tone Playing`, 'sparkle');
      }
    }

    // Close Chakra Eye-Level Popup Window
    const chakraPopupCloseBtn = document.getElementById('chakra-popup-close-btn');
    chakraPopupCloseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      readingBox?.classList.remove('active');
    });

    // Collapse / expand the docked reading window. It stays out of the way of
    // the spine either way, but collapsed it is just a title bar.
    const chakraPopupToggleBtn = document.getElementById('chakra-popup-toggle-btn');
    chakraPopupToggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const collapsed = readingBox.classList.toggle('collapsed');
      chakraPopupToggleBtn.setAttribute('aria-expanded', String(!collapsed));
      chakraPopupToggleBtn.setAttribute(
        'aria-label', collapsed ? 'Expand chakra details' : 'Collapse chakra details');
    });

    // Direct Spinal Hotspot & Item Listeners
    document.querySelectorAll('.chakra-hotspot-item, .chakra-poster-row, .chakra-row').forEach(row => {
      row.addEventListener('click', () => {
        const key = row.getAttribute('data-chakra');
        activateChakra(key, true);
      });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const key = row.getAttribute('data-chakra');
          activateChakra(key, true);
        }
      });
    });

    document.querySelectorAll('.chakra-hotspot-node, .chakra-emblem-btn, .chakra-node-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = btn.getAttribute('data-chakra');
        activateChakra(key, true);
      });
    });

    if (replayAudioBtn) {
      replayAudioBtn.addEventListener('click', () => {
        activateChakra(activeChakraKey, true);
      });
    }

    // ─── HERO CELESTIAL LOCATION POP-UP MODAL CONTROLLER ───
    const heroLocBadge = document.getElementById('hero-location-badge');
    const locationModalBackdrop = document.getElementById('location-modal-backdrop');
    const locModalCloseBtn = document.getElementById('loc-modal-close-btn');
    const locCardBtns = document.querySelectorAll('.loc-card-btn');

    function openLocationModal() {
      locationModalBackdrop?.classList.add('open');
      if (typeof window.triggerFairyInterrupted === 'function') {
        window.triggerFairyInterrupted();
      }
      if (window.celestialAudio) window.celestialAudio.playChime(639, 1.0);
    }

    function closeLocationModal() {
      locationModalBackdrop?.classList.remove('open');
    }
    window.closeLocationModal = closeLocationModal;

    heroLocBadge?.addEventListener('click', (e) => {
      e.stopPropagation();
      openLocationModal();
    });

    locModalCloseBtn?.addEventListener('click', closeLocationModal);

    locationModalBackdrop?.addEventListener('click', (e) => {
      if (e.target === locationModalBackdrop) {
        closeLocationModal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && locationModalBackdrop?.classList.contains('open')) {
        closeLocationModal();
      }
    });

    function setCelestialLocation(name, lat, lng, btnEl = null) {
      window.celestialLocation = { name, lat, lng };
      if (typeof updateMoonUI === 'function') updateMoonUI();
      
      locCardBtns.forEach(b => b.classList.remove('active'));
      if (btnEl) btnEl.classList.add('active');

      // Sync quick pills
      const quickPills = document.querySelectorAll('.location-quick-pill');
      quickPills.forEach(p => {
        const pLat = parseFloat(p.getAttribute('data-lat'));
        const isMatch = Math.abs(pLat - lat) < 0.1 || (p.getAttribute('data-name') === name);
        p.classList.toggle('active', isMatch);
      });

      if (window.celestialAudio) window.celestialAudio.playChime(528, 1.5);
      showToast(`Celestial Node Aligned: ${name}`, 'moon');

      setTimeout(() => {
        closeLocationModal();
      }, 350);
    }

    locCardBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const locKey = btn.getAttribute('data-loc');
        const locName = btn.getAttribute('data-name');
        const latVal = btn.getAttribute('data-lat');
        const lngVal = btn.getAttribute('data-lng');

        if (locKey === 'gps') {
          if ('geolocation' in navigator) {
            showToast('Querying live GPS satellites for astronomical coordinates...', 'satellite');
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                setCelestialLocation('Your Live GPS Sanctuary', lat, lng, btn);
              },
              (err) => {
                showToast('GPS access denied. Reverting to Chapel in the Clouds.', 'warning');
              },
              { timeout: 8000 }
            );
          } else {
            showToast('Geolocation not supported in this browser.', 'warning');
          }
        } else {
          setCelestialLocation(locName, parseFloat(latVal), parseFloat(lngVal), btn);
        }
      });
    });

    // ✦ Bar 2 Quick Location Pills Click Handler ✦
    const quickPills = document.querySelectorAll('.location-quick-pill');
    quickPills.forEach(pill => {
      pill.addEventListener('click', () => {
        const locKey = pill.getAttribute('data-loc');
        const locName = pill.getAttribute('data-name');
        const latVal = pill.getAttribute('data-lat');
        const lngVal = pill.getAttribute('data-lng');

        if (locKey === 'gps') {
          if ('geolocation' in navigator) {
            showToast('Querying live GPS satellites...', 'satellite');
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                setCelestialLocation('Your Live GPS Sanctuary', lat, lng, pill);
              },
              (err) => {
                showToast('GPS access denied.', 'warning');
              },
              { timeout: 8000 }
            );
          } else {
            showToast('Geolocation not supported in this browser.', 'warning');
          }
        } else {
          setCelestialLocation(locName, parseFloat(latVal), parseFloat(lngVal), pill);
        }
      });
    });

    // Continuously animate Photorealistic Moon on Bar 2 (Culled when offscreen)
    let locationMoonAnimId = null;
    let isLocationMoonVisible = true;
    const locationMoonCanvas = document.getElementById('location-moon-canvas');

    if (locationMoonCanvas && 'IntersectionObserver' in window) {
      const moonObs = new IntersectionObserver((entries) => {
        isLocationMoonVisible = entries[0].isIntersecting;
        if (isLocationMoonVisible && !locationMoonAnimId) {
          locationMoonAnimId = requestAnimationFrame(animateLocationMoonLoop);
        }
      }, { threshold: 0.05 });
      moonObs.observe(locationMoonCanvas);
    }

    function animateLocationMoonLoop() {
      if (!isLocationMoonVisible) {
        locationMoonAnimId = null;
        return;
      }
      if (typeof window.renderPhotorealisticLocationMoon === 'function') {
        window.renderPhotorealisticLocationMoon();
      }
      locationMoonAnimId = requestAnimationFrame(animateLocationMoonLoop);
    }
    locationMoonAnimId = requestAnimationFrame(animateLocationMoonLoop);

    // ─── PRODUCT DETAIL LIGHTBOX MODAL CONTROLLER ─────
    const productModalBackdrop = document.getElementById('product-modal-backdrop');
    const productModalClose = document.getElementById('product-modal-close');
    const modalProductImg = document.getElementById('modal-product-img');
    const modalProductName = document.getElementById('modal-product-name');
    const modalProductTag = document.getElementById('modal-product-tag');
    const modalProductPrice = document.getElementById('modal-product-price');
    const modalProductDesc = document.getElementById('modal-product-desc');
    const modalColorSection = document.getElementById('modal-color-section');
    const modalColorLabel = document.getElementById('modal-color-label');
    const modalColorSwatches = document.getElementById('modal-color-swatches');
    const modalSizeSection = document.getElementById('modal-size-section');
    const modalSizeLabel = document.getElementById('modal-size-label');
    const modalSizePills = document.getElementById('modal-size-pills');
    const modalAddCartBtn = document.getElementById('modal-add-cart-btn');

    let activeModalProduct = null;

    window.openProductModalFromCard = function(triggerEl) {
      const card = triggerEl.closest('.merch-card, .merch-page-card');
      if (!card) return;

      const name = card.querySelector('.merch-card__name, .merch-page-card__name')?.textContent?.trim() || 'Sacred Item';
      const tag = card.querySelector('.merch-card__tag, .merch-page-card__tag')?.textContent?.trim() || 'Sacred Offering';
      const price = card.querySelector('.merch-card__price, .merch-page-card__price')?.textContent?.trim() || '$38.00';
      const desc = card.querySelector('.merch-card__desc, .merch-page-card__desc')?.textContent?.trim() || '';
      const img = card.querySelector('img')?.getAttribute('src') || 'images/merch-eye-believe-lavender.webp';

      // Colors
      const colorDots = Array.from(card.querySelectorAll('.color-dot'));
      const sizePills = Array.from(card.querySelectorAll('.size-pill'));

      activeModalProduct = {
        name,
        price: parseFloat(price.replace(/[^0-9\.]+/g, '')) || 0,
        img,
        selectedColor: colorDots.find(d => d.classList.contains('active'))?.getAttribute('title') || '',
        selectedSize: sizePills.find(s => s.classList.contains('active'))?.textContent?.trim() || ''
      };

      if (modalProductName) modalProductName.textContent = name;
      if (modalProductTag) modalProductTag.textContent = tag;
      if (modalProductPrice) modalProductPrice.textContent = price;
      if (modalProductDesc) modalProductDesc.textContent = desc;
      if (modalProductImg) modalProductImg.src = img;

      // Render Swatches in Modal
      if (modalColorSwatches) {
        if (colorDots.length > 0) {
          modalColorSection.style.display = 'flex';
          modalColorSwatches.innerHTML = colorDots.map(dot => {
            const bg = dot.style.background;
            const title = dot.getAttribute('title') || '';
            const dotImg = dot.getAttribute('data-img') || img;
            const isActive = dot.classList.contains('active') ? 'active' : '';
            return `<span class="color-dot ${isActive}" style="background: ${bg};" title="${title}" data-img="${dotImg}"></span>`;
          }).join('');

          if (modalColorLabel) modalColorLabel.textContent = activeModalProduct.selectedColor || 'Classic';

          // Swatch click inside modal
          modalColorSwatches.querySelectorAll('.color-dot').forEach(swatch => {
            swatch.addEventListener('click', () => {
              modalColorSwatches.querySelectorAll('.color-dot').forEach(s => s.classList.remove('active'));
              swatch.classList.add('active');
              const newTitle = swatch.getAttribute('title') || '';
              const newImg = swatch.getAttribute('data-img');
              if (modalColorLabel) modalColorLabel.textContent = newTitle;
              if (modalProductImg && newImg) modalProductImg.src = newImg;
              activeModalProduct.selectedColor = newTitle;
              activeModalProduct.img = newImg;
            });
          });
        } else {
          modalColorSection.style.display = 'none';
        }
      }

      // Render Sizes in Modal
      if (modalSizePills) {
        if (sizePills.length > 0) {
          modalSizeSection.style.display = 'flex';
          modalSizePills.innerHTML = sizePills.map(pill => {
            const text = pill.textContent.trim();
            const isActive = pill.classList.contains('active') ? 'active' : '';
            return `<span class="size-pill ${isActive}">${text}</span>`;
          }).join('');

          if (modalSizeLabel) modalSizeLabel.textContent = activeModalProduct.selectedSize;

          modalSizePills.querySelectorAll('.size-pill').forEach(pill => {
            pill.addEventListener('click', () => {
              modalSizePills.querySelectorAll('.size-pill').forEach(p => p.classList.remove('active'));
              pill.classList.add('active');
              const newSize = pill.textContent.trim();
              if (modalSizeLabel) modalSizeLabel.textContent = newSize;
              activeModalProduct.selectedSize = newSize;
            });
          });
        } else {
          modalSizeSection.style.display = 'none';
        }
      }

      productModalBackdrop?.classList.add('open');
      if (typeof window.triggerFairyInterrupted === 'function') {
        window.triggerFairyInterrupted();
      }
      if (window.celestialAudio) window.celestialAudio.playChime(741, 1.2);
    };

    // Close modal handlers
    productModalClose?.addEventListener('click', () => {
      productModalBackdrop?.classList.remove('open');
    });

    productModalBackdrop?.addEventListener('click', (e) => {
      if (e.target === productModalBackdrop) {
        productModalBackdrop.classList.remove('open');
      }
    });

    // Add to cart from inside Modal
    modalAddCartBtn?.addEventListener('click', () => {
      if (!activeModalProduct) return;
      let variant = '';
      if (activeModalProduct.selectedSize && activeModalProduct.selectedColor) {
        variant = `${activeModalProduct.selectedColor} · Size ${activeModalProduct.selectedSize}`;
      } else if (activeModalProduct.selectedSize) {
        variant = `Size: ${activeModalProduct.selectedSize}`;
      } else if (activeModalProduct.selectedColor) {
        variant = `Color: ${activeModalProduct.selectedColor}`;
      }

      window.addToSacredCart(
        activeModalProduct.name,
        activeModalProduct.price,
        activeModalProduct.img,
        variant
      );
      productModalBackdrop?.classList.remove('open');
    });

    // Make Card Images and Titles Clickable to Open Modal
    document.querySelectorAll('.merch-card__img, .merch-card__name').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        window.openProductModalFromCard(el);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          window.openProductModalFromCard(el);
        }
      });
    });

    // ─── SACRED CART DRAWER CONTROLLER ───
    window.cartState = [];
    const cartDrawer = document.getElementById('cart-drawer');
    const cartOverlay = document.getElementById('cart-drawer-overlay');
    const cartCloseBtn = document.getElementById('cart-close-btn');
    const cartItemsContainer = document.getElementById('cart-drawer-items');
    const cartSubtotalVal = document.getElementById('cart-subtotal-val');
    const cartCheckoutBtn = document.getElementById('cart-checkout-btn');
    const cartToggles = document.querySelectorAll('.cart-toggle-btn');
    const cartBadges = document.querySelectorAll('.cart-badge');

    function openCart() {
      cartDrawer?.classList.add('active');
      cartOverlay?.classList.add('active');
      if (typeof window.triggerFairyInterrupted === 'function') {
        window.triggerFairyInterrupted();
      }
      if (window.celestialAudio) window.celestialAudio.playChime(528, 1.2);
    }

    function closeCart() {
      cartDrawer?.classList.remove('active');
      cartOverlay?.classList.remove('active');
    }

    cartToggles.forEach(btn => btn.addEventListener('click', openCart));
    cartCloseBtn?.addEventListener('click', closeCart);
    cartOverlay?.addEventListener('click', closeCart);

    window.addToSacredCart = function(name, price, img, variant = '') {
      const existing = window.cartState.find(item => item.name === name && item.variant === variant);
      if (existing) {
        existing.qty += 1;
      } else {
        window.cartState.push({ name, price, img, variant, qty: 1 });
      }
      updateCartUI();
      openCart();
      showToast(`Added ${name} to your Sacred Cart!`, 'bag');
    };

    function updateCartUI() {
      const totalCount = window.cartState.reduce((sum, item) => sum + item.qty, 0);
      cartBadges.forEach(b => b.textContent = totalCount);

      if (!cartItemsContainer) return;

      if (window.cartState.length === 0) {
        cartItemsContainer.innerHTML = `
          <div style="text-align:center; padding:3rem 1rem; color:var(--cream-dim);">
            <div style="font-size:2.4rem; margin-bottom:0.75rem;"><span class="pico pico--bag" aria-hidden="true"></span></div>
            <p style="font-family:var(--font-serif); font-style:italic; font-size:1.1rem; color:var(--gold);">Your sacred shopping bag is empty.</p>
            <p style="font-size:0.88rem; margin-top:0.5rem; opacity:0.8;">Explore our collection of enchanted garments and sacred offerings.</p>
          </div>
        `;
        if (cartSubtotalVal) cartSubtotalVal.textContent = '$0.00';
        return;
      }

      const total = window.cartState.reduce((sum, item) => sum + item.price * item.qty, 0);
      if (cartSubtotalVal) cartSubtotalVal.textContent = `$${total.toFixed(2)}`;

      cartItemsContainer.innerHTML = window.cartState.map((item, idx) => `
        <div class="cart-item-row" style="display:flex; gap:1rem; align-items:center; padding:0.85rem 0; border-bottom:1px solid rgba(255,215,0,0.15);">
          <img src="${item.img}" alt="${item.name}" style="width:64px; height:64px; border-radius:8px; object-fit:cover; border:1px solid rgba(255,215,0,0.25);" />
          <div style="flex:1;">
            <div style="font-family:var(--font-serif); font-weight:600; font-size:0.95rem; color:var(--cream);">${item.name}</div>
            ${item.variant ? `<div style="font-size:0.78rem; color:var(--gold); margin-top:2px;">${item.variant}</div>` : ''}
            <div style="font-size:0.85rem; color:var(--cyan); margin-top:3px;">$${item.price.toFixed(2)} × ${item.qty}</div>
          </div>
          <div style="display:flex; align-items:center; gap:0.4rem;">
            <button type="button" onclick="window.updateCartItemQty(${idx}, -1)" style="background:rgba(255,255,255,0.1); border:none; color:#fff; width:26px; height:26px; border-radius:4px; cursor:pointer;">-</button>
            <span style="font-size:0.9rem; font-weight:600; min-width:16px; text-align:center;">${item.qty}</span>
            <button type="button" onclick="window.updateCartItemQty(${idx}, 1)" style="background:rgba(255,255,255,0.1); border:none; color:#fff; width:26px; height:26px; border-radius:4px; cursor:pointer;">+</button>
            <button type="button" onclick="window.removeCartItem(${idx})" style="background:none; border:none; color:rgba(255,100,100,0.8); cursor:pointer; margin-left:4px;" title="Remove"><span class="pico pico--trash" aria-hidden="true"></span></button>
          </div>
        </div>
      `).join('');
    }

    window.updateCartItemQty = function(idx, delta) {
      if (!window.cartState[idx]) return;
      window.cartState[idx].qty += delta;
      if (window.cartState[idx].qty <= 0) {
        window.cartState.splice(idx, 1);
      }
      updateCartUI();
    };

    window.removeCartItem = function(idx) {
      if (!window.cartState[idx]) return;
      window.cartState.splice(idx, 1);
      updateCartUI();
    };

    // ─── CHECKOUT MODAL & ADDRESS HANDLING ──────────
    const checkoutModal = document.getElementById('checkout-modal');
    const closeCheckoutBtn = document.getElementById('close-checkout-modal-btn');
    const checkoutForm = document.getElementById('checkout-order-form');
    const checkoutTotalPrice = document.getElementById('checkout-total-price');

    // Cart checkout button opens Checkout Modal
    cartCheckoutBtn?.addEventListener('click', () => {
      if (window.cartState.length === 0) {
        showToast('Your sacred bag is empty.', 'bag');
        return;
      }
      const total = window.cartState.reduce((sum, item) => sum + item.price * item.qty, 0);
      if (checkoutTotalPrice) checkoutTotalPrice.textContent = `$${total.toFixed(2)}`;
      
      // Close cart drawer & open checkout modal
      cartDrawer?.classList.remove('active');
      cartOverlay?.classList.remove('active');
      checkoutModal?.classList.add('active');
      if (window.celestialAudio) window.celestialAudio.playChime(639);
    });

    closeCheckoutBtn?.addEventListener('click', () => {
      checkoutModal?.classList.remove('active');
    });

    checkoutModal?.addEventListener('click', (e) => {
      if (e.target === checkoutModal) checkoutModal.classList.remove('active');
    });

    // Toggle Billing Address in Checkout Modal
    const checkoutSameBilling = document.getElementById('checkout-same-billing');
    const checkoutBillingBox = document.getElementById('checkout-billing-box');
    checkoutSameBilling?.addEventListener('change', () => {
      if (checkoutBillingBox) {
        checkoutBillingBox.style.display = checkoutSameBilling.checked ? 'none' : 'block';
      }
    });

    // Toggle Billing Address in Notes by Beth Form
    const noteSameBilling = document.getElementById('note-same-billing');
    const noteBillingBox = document.getElementById('note-billing-box');
    noteSameBilling?.addEventListener('change', () => {
      if (noteBillingBox) {
        noteBillingBox.style.display = noteSameBilling.checked ? 'none' : 'block';
      }
    });

    // Checkout Form Submission
    checkoutForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('checkout-name')?.value.trim();
      const email = document.getElementById('checkout-email')?.value.trim();
      const street = document.getElementById('checkout-street')?.value.trim();
      const town = document.getElementById('checkout-town')?.value.trim();
      const state = document.getElementById('checkout-state')?.value;
      const zip = document.getElementById('checkout-zip')?.value.trim();

      if (!name || !email || !street || !town || !state || !zip) {
        showToast('Please complete all required shipping address fields.', 'warning');
        return;
      }

      if (checkoutSameBilling && !checkoutSameBilling.checked) {
        const bName = document.getElementById('checkout-billing-name')?.value.trim();
        const bStreet = document.getElementById('checkout-billing-street')?.value.trim();
        const bTown = document.getElementById('checkout-billing-town')?.value.trim();
        const bState = document.getElementById('checkout-billing-state')?.value;
        const bZip = document.getElementById('checkout-billing-zip')?.value.trim();
        if (!bName || !bStreet || !bTown || !bState || !bZip) {
          showToast('Please complete all required billing address fields.', 'warning');
          return;
        }
      }

      const submitBtn = checkoutForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="pico pico--sparkle" aria-hidden="true"></span> Processing Sacred Order...';
      }

      setTimeout(() => {
        if (window.celestialAudio) window.celestialAudio.playChime(963, 1.8);
        alert(`Sacred Order Confirmed!\n\nThank you, ${name}! Your order has been placed and will be lovingly packed and shipped to:\n${street}, ${town}, ${state} ${zip}.\n\nA confirmation has been sent to ${email}.`);
        window.cartState = [];
        updateCartUI();
        checkoutForm.reset();
        if (checkoutBillingBox) checkoutBillingBox.style.display = 'none';
        if (checkoutSameBilling) checkoutSameBilling.checked = true;
        checkoutModal?.classList.remove('active');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span class="pico pico--sparkle" aria-hidden="true"></span> Complete & Confirm Sacred Order';
        }
      }, 1000);
    });

    // Notes by Beth Form Submission with separate address validation
    const notesForm = document.getElementById('notes-order-form');
    notesForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const senderName = document.getElementById('note-sender-name')?.value.trim();
      const recipientName = document.getElementById('note-recipient-name')?.value.trim();
      const street = document.getElementById('note-street-address')?.value.trim();
      const town = document.getElementById('note-town')?.value.trim();
      const state = document.getElementById('note-state')?.value;
      const zip = document.getElementById('note-zip')?.value.trim();

      if (!senderName || !recipientName || !street || !town || !state || !zip) {
        showToast('Please complete all recipient shipping address fields.', 'warning');
        return;
      }

      if (noteSameBilling && !noteSameBilling.checked) {
        const bName = document.getElementById('note-billing-name')?.value.trim();
        const bStreet = document.getElementById('note-billing-street')?.value.trim();
        const bTown = document.getElementById('note-billing-town')?.value.trim();
        const bState = document.getElementById('note-billing-state')?.value;
        const bZip = document.getElementById('note-billing-zip')?.value.trim();
        if (!bName || !bStreet || !bTown || !bState || !bZip) {
          showToast('Please complete all purchaser billing address fields.', 'warning');
          return;
        }
      }

      const submitBtn = notesForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="pico pico--sparkle" aria-hidden="true"></span> Channeling & Crafting Sacred Note...';
      }

      setTimeout(() => {
        if (window.celestialAudio) window.celestialAudio.playChime(963, 2.0);
        alert(`Sacred Love Note Ordered!\n\nThank you, ${senderName}! Beth Elise will personally meditate, channel, and handwrite your sacred letter on deckle parchment, sealed with wax and mailed directly to:\n${recipientName}\n${street}, ${town}, ${state} ${zip}.`);
        notesForm.reset();
        if (noteBillingBox) noteBillingBox.style.display = 'none';
        if (noteSameBilling) noteSameBilling.checked = true;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span class="pico pico--sparkle" aria-hidden="true"></span> Complete & Send Sacred Love Note ($28.00)';
        }
      }, 1200);
    });

    // Global addToCart helper for onclick & event listeners
    window.addToCart = function(btn) {
      const card = btn.closest('.merch-card, .merch-page-card');
      if (!card) return;
      const name = card.querySelector('.merch-card__name, .merch-page-card__name')?.textContent?.trim() || 'Sacred Offering';
      const priceText = card.querySelector('.merch-card__price, .merch-page-card__price')?.textContent?.trim() || '$0';
      const price = parseFloat(priceText.replace(/[^0-9\.]+/g, '')) || 0;
      const img = card.querySelector('img')?.getAttribute('src') || 'images/merch-eye-believe-lavender.webp';
      const sizeActive = card.querySelector('.size-pill.active')?.textContent?.trim();
      const colorActive = card.querySelector('.color-dot.active')?.getAttribute('title')?.trim();
      
      let variant = '';
      if (sizeActive && colorActive) variant = `${colorActive} · Size ${sizeActive}`;
      else if (sizeActive) variant = `Size: ${sizeActive}`;
      else if (colorActive) variant = `Color: ${colorActive}`;

      window.addToSacredCart(name, price, img, variant);
    };

    // Wire up all "Add to Sacred Cart" buttons
    document.querySelectorAll('.merch-card__btn, .merch-page-card__add').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.addToCart(btn);
      });
    });

    updateCartUI();

    // ─── 3D EARTH-ROTATING PHOTOREALISTIC CRYSTAL BALL CANVAS ENGINE ───
    function initOracleRotatingCrystalBall() {
      const canvas = document.getElementById('oracle-crystal-ball-canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const cw = canvas.width;
      const ch = canvas.height;
      const cx = cw * 0.5;
      const cy = ch * 0.5; // Perfectly centered spherical orb
      const sphereRadius = 215; // Fills entire containing circle!
      const earthTilt = 23.5 * (Math.PI / 180); // 23.5 deg axial Earth tilt

      // Load Photorealistic Assets
      const imgPano = new Image();
      imgPano.src = 'images/crystal_nebula_panorama.webp';

      const imgSpec = new Image();
      imgSpec.src = 'images/crystal_glass_specular.webp';

      // Generate 3D Spherical Cosmic Features (Constellations & Stardust)
      const celestialPoints = [];
      const numPoints = 280;

      for (let i = 0; i < numPoints; i++) {
        const u = Math.random();
        const v = Math.random();
        const lat = Math.acos(2 * u - 1) - Math.PI / 2;
        const lon = 2 * Math.PI * v;
        const r = sphereRadius * (0.45 + Math.random() * 0.52);
        const size = 1.4 + Math.random() * 3.2;
        const color = ['#FFFFFF', '#00FFC8', '#FFD700', '#C77DFF', '#E0AAFF', '#76FF03'][Math.floor(Math.random() * 6)];
        const isMajorStar = Math.random() > 0.8;
        celestialPoints.push({ lat, lon, r, size, color, isMajorStar });
      }

      let animId = null;

      function renderCrystalBall(now) {
        ctx.clearRect(0, 0, cw, ch);

        // Continuous planetary rotation like Earth
        const rotAngle = (now * 0.00065) % (Math.PI * 2);
        const pulse = 1.0 + Math.sin(now * 0.0025) * 0.12;

        ctx.save();

        // ─── 1. BASE VOLUMETRIC AURA (Transparent Multi-tier Radiant Halo) ───
        const auraGrad = ctx.createRadialGradient(cx, cy, sphereRadius * 0.2, cx, cy, sphereRadius * 1.35 * pulse);
        auraGrad.addColorStop(0, 'rgba(0, 255, 200, 0.45)');
        auraGrad.addColorStop(0.35, 'rgba(157, 78, 221, 0.35)');
        auraGrad.addColorStop(0.7, 'rgba(255, 215, 0, 0.2)');
        auraGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, sphereRadius * 1.35 * pulse, 0, Math.PI * 2);
        ctx.fill();

        // ─── 2. PHOTOREALISTIC ROTATING COSMIC GALAXY SPHERE ───
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, sphereRadius, 0, Math.PI * 2);
        ctx.clip(); // Constrain internal 3D elements inside sphere

        // Base Deep Cosmos Glass Gradient
        const cosmosGrad = ctx.createRadialGradient(cx, cy - sphereRadius * 0.2, 0, cx, cy, sphereRadius);
        cosmosGrad.addColorStop(0, '#2D0052');
        cosmosGrad.addColorStop(0.4, '#1C0035');
        cosmosGrad.addColorStop(0.8, '#0E001A');
        cosmosGrad.addColorStop(1, '#05000C');
        ctx.fillStyle = cosmosGrad;
        ctx.fillRect(cx - sphereRadius, cy - sphereRadius, sphereRadius * 2, sphereRadius * 2);

        // Draw Photorealistic Rotating Panoramic Nebula Texture
        if (imgPano.complete && imgPano.naturalWidth > 0) {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(earthTilt); // 23.5° axial Earth tilt

          const panoW = sphereRadius * 4;
          const panoH = sphereRadius * 2.2;
          const scrollSpeed = 0.035;
          const panoOffset = (now * scrollSpeed) % (panoW * 0.5);

          ctx.globalAlpha = 0.88 * pulse;
          ctx.drawImage(imgPano, -panoW * 0.5 - panoOffset, -panoH * 0.5, panoW, panoH);
          ctx.drawImage(imgPano, -panoW * 0.5 - panoOffset + panoW * 0.5, -panoH * 0.5, panoW, panoH);
          ctx.restore();
        }

        // Pulsing luminous core flare
        const coreNebula = ctx.createRadialGradient(cx + Math.sin(rotAngle) * 22, cy + Math.cos(rotAngle) * 16, 0, cx, cy, sphereRadius * 0.95);
        coreNebula.addColorStop(0, `rgba(255, 255, 255, ${0.92 * pulse})`);
        coreNebula.addColorStop(0.25, `rgba(0, 255, 200, ${0.8 * pulse})`);
        coreNebula.addColorStop(0.55, `rgba(199, 125, 255, ${0.7 * pulse})`);
        coreNebula.addColorStop(0.85, 'rgba(28, 0, 53, 0.4)');
        coreNebula.addColorStop(1, 'transparent');
        ctx.fillStyle = coreNebula;
        ctx.fillRect(cx - sphereRadius, cy - sphereRadius, sphereRadius * 2, sphereRadius * 2);

        // ─── 3. ROTATING 3D CELESTIAL STARDUST PARTICLES ───
        const projectedPoints = [];
        celestialPoints.forEach(pt => {
          const curLon = pt.lon + rotAngle;
          const x3 = pt.r * Math.cos(pt.lat) * Math.sin(curLon);
          const y3 = pt.r * Math.sin(pt.lat) * Math.cos(earthTilt) - pt.r * Math.cos(pt.lat) * Math.cos(curLon) * Math.sin(earthTilt);
          const z3 = pt.r * Math.cos(pt.lat) * Math.cos(curLon) * Math.cos(earthTilt) + pt.r * Math.sin(pt.lat) * Math.sin(earthTilt);

          if (z3 > -sphereRadius * 0.3) {
            projectedPoints.push({
              x: cx + x3,
              y: cy + y3,
              z: z3,
              size: pt.size,
              color: pt.color,
              isMajor: pt.isMajorStar,
              alpha: Math.max(0.2, Math.min(1.0, (z3 + sphereRadius * 0.3) / (sphereRadius * 1.3)))
            });
          }
        });

        projectedPoints.sort((a, b) => a.z - b.z);

        projectedPoints.forEach(p => {
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;

          if (p.isMajor) {
            const s = p.size * (1.2 + Math.sin(now * 0.003 + p.x) * 0.4);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y - s * 2.2);
            ctx.lineTo(p.x + s * 0.3, p.y);
            ctx.lineTo(p.x, p.y + s * 2.2);
            ctx.lineTo(p.x - s * 0.3, p.y);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(p.x - s * 2.2, p.y);
            ctx.lineTo(p.x, p.y - s * 0.3);
            ctx.lineTo(p.x + s * 2.2, p.y);
            ctx.lineTo(p.x, p.y + s * 0.3);
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 0.8, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        });

        ctx.restore(); // Exit sphere clipping

        // ─── 4. PHOTOREALISTIC SPECULAR GLASS OVERLAY & FRESNEL RIM GLOW ───
        ctx.save();
        if (imgSpec.complete && imgSpec.naturalWidth > 0) {
          ctx.globalAlpha = 0.88;
          ctx.drawImage(imgSpec, cx - sphereRadius * 1.05, cy - sphereRadius * 1.05, sphereRadius * 2.1, sphereRadius * 2.1);
        }

        // Curved Optical Specular Highlight
        const hlX = cx - sphereRadius * 0.38;
        const hlY = cy - sphereRadius * 0.38;
        const hlGrad = ctx.createRadialGradient(hlX, hlY, 0, hlX, hlY, sphereRadius * 0.45);
        hlGrad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
        hlGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.65)');
        hlGrad.addColorStop(0.7, 'rgba(163, 255, 248, 0.25)');
        hlGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = hlGrad;
        ctx.beginPath();
        ctx.ellipse(hlX, hlY, sphereRadius * 0.36, sphereRadius * 0.22, -Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();

        // Secondary bottom specular reflection
        const bhlX = cx + sphereRadius * 0.32;
        const bhlY = cy + sphereRadius * 0.35;
        const bhlGrad = ctx.createRadialGradient(bhlX, bhlY, 0, bhlX, bhlY, sphereRadius * 0.3);
        bhlGrad.addColorStop(0, 'rgba(0, 255, 200, 0.55)');
        bhlGrad.addColorStop(0.6, 'rgba(199, 125, 255, 0.25)');
        bhlGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = bhlGrad;
        ctx.beginPath();
        ctx.ellipse(bhlX, bhlY, sphereRadius * 0.26, sphereRadius * 0.12, Math.PI / 6, 0, Math.PI * 2);
        ctx.fill();

        // Fresnel Edge Rim Glow
        const rimGrad = ctx.createRadialGradient(cx, cy, sphereRadius * 0.82, cx, cy, sphereRadius);
        rimGrad.addColorStop(0, 'rgba(0, 229, 212, 0)');
        rimGrad.addColorStop(0.7, 'rgba(0, 255, 200, 0.45)');
        rimGrad.addColorStop(0.95, 'rgba(255, 255, 255, 0.95)');
        rimGrad.addColorStop(1, 'rgba(0, 229, 212, 0.85)');
        ctx.fillStyle = rimGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, sphereRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.arc(cx, cy, sphereRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        if (!reduceMotion() && isCrystalBallVisible) {
          animId = requestAnimationFrame(renderCrystalBall);
        } else {
          animId = null;
        }
      }

      let isCrystalBallVisible = true;
      if ('IntersectionObserver' in window) {
        const ballObs = new IntersectionObserver((entries) => {
          isCrystalBallVisible = entries[0].isIntersecting;
          if (isCrystalBallVisible && !animId) {
            animId = requestAnimationFrame(renderCrystalBall);
          }
        }, { threshold: 0.05 });
        ballObs.observe(canvas);
      }

      animId = requestAnimationFrame(renderCrystalBall);
    }

    // Initialize 3D Rotating Crystal Ball
    initOracleRotatingCrystalBall();

    // ─── INTERACTIVE ORACLE CARD PULL WIDGET (Persistent Active Ball) ───
    const oracleCards = [
      { pico: 'sparkle', title: 'The Sacred Glade', text: 'You are held in divine sanctuary. Surrender current worries to spirit; alignment and clarity are blossoming.' },
      { pico: 'star', title: 'Starlight Awakening', text: 'Your intuition is sharper than ever. Trust the quiet nudges and subtle synchronicities appearing in your path.' },
      { pico: 'comet', title: 'Pixie Stardust (Joy)', text: 'Lighten your energetic field. Laughter, nature, and playful presence will dissolve heavy emotional blockages.' },
      { pico: 'hand', title: 'Usui Healing Touch', text: 'Universal life force energy is recalibrating your chakras. Allow yourself to rest and receive cellular renewal.' },
      { pico: 'orb', title: 'Ancestral Confirmation', text: 'Loved ones in spirit are watching over you with unconditional love. A confirmation sign will arrive soon.' },
      { pico: 'leaf', title: 'Somatic Release (EFT)', text: 'Breathe deeply. Release subconscious tension stored in your shoulders and chest. You are safe in this moment.' },
      { pico: 'candle', title: 'Sacred Altar Flame', text: 'Your devotion to inner truth is illuminating hidden paths. Hold your space with reverent grace.' },
      { pico: 'dove', title: 'Angelic Protection', text: 'Spiritual guardians surround you in an impenetrable sphere of celestial peace and unconditional light.' }
    ];

    const oracleContainer = document.getElementById('daily-oracle-card');
    let oracleFlipped = false;

    function revealDailyOracleCard() {
      const randomCard = oracleCards[Math.floor(Math.random() * oracleCards.length)];
      const iconEl = document.getElementById('oracle-res-icon');
      const titleEl = document.getElementById('oracle-res-title');
      const textEl = document.getElementById('oracle-res-text');
      const resultCard = document.getElementById('oracle-overlay-result');

      if (oracleFlipped && resultCard) {
        resultCard.style.animation = 'none';
        void resultCard.offsetWidth;
        resultCard.style.animation = 'resultSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards';
      }

      if (iconEl) {
        setPico(iconEl, randomCard.pico || 'sparkle');
      }
      if (titleEl) titleEl.textContent = randomCard.title;
      if (textEl) textEl.textContent = randomCard.text;

      oracleContainer?.classList.add('revealed');
      oracleFlipped = true;
      showToast('Daily Soul Message Channeled!', 'sparkle');
      if (window.celestialAudio && window.celestialAudio.enabled) window.celestialAudio.playGlissando();
    }

    if (oracleContainer) {
      oracleContainer.addEventListener('click', (e) => {
        // Redraw button, crystal ball click, or initial reveal prompt
        if (e.target.closest('#oracle-redraw-btn') || e.target.closest('.oracle-redraw-badge') || e.target.closest('.crystal-ball-wrapper') || e.target.closest('#oracle-reveal-btn') || !oracleFlipped) {
          revealDailyOracleCard();
        }
      });
    }

    // Shared Photorealistic Iris Asset
    const imgPhotorealisticIris = new Image();
    imgPhotorealisticIris.src = 'images/photorealistic_purple_iris_orb.webp';

    // ═══════════════════════════════════════════════════════════════
    // LIVING SACRED EYE ENGINE (Photorealistic Iris, Organic Almond Geometry, Lush Eyelashes)
    // ═══════════════════════════════════════════════════════════════
    function drawOrganicEye(ctx, cx, cy, r, gazeX, gazeY, blinkPhase, pupilRadius, colors, now, isLocked = false) {
      ctx.save();
      ctx.translate(cx, cy);

      const aw = r * 1.58;
      const ah = r * 0.96;

      // 1. Asymmetric Natural Almond Eye Outline Clip
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-aw * 0.50, 0);
      ctx.bezierCurveTo(-aw * 0.32, -ah * 0.60, aw * 0.16, -ah * 0.54, aw * 0.50, -ah * 0.04);
      ctx.bezierCurveTo(aw * 0.22, ah * 0.52, -aw * 0.30, ah * 0.44, -aw * 0.50, 0);
      ctx.closePath();
      ctx.clip();

      // 2. Sclera with soft 3D Spherical Volumetric Gradients
      const scleraGrad = ctx.createRadialGradient(-r * 0.15, -r * 0.15, 2, 0, 0, r);
      scleraGrad.addColorStop(0, '#FFFFFF');
      scleraGrad.addColorStop(0.55, '#FAF6FE');
      scleraGrad.addColorStop(0.82, '#E8DCF6');
      scleraGrad.addColorStop(1, '#C8ACEC');
      ctx.fillStyle = scleraGrad;
      ctx.fillRect(-aw * 0.65, -ah * 0.65, aw * 1.3, ah * 1.3);

      // 3. Iris (Vibrant, Breathing & Glowing Purple Stroma)
      const irisPulse = 1.0 + Math.sin(now * 0.0032) * 0.08;
      const irisR = r * 0.49 * irisPulse;
      const safeGazeX = Math.max(-0.90, Math.min(0.90, gazeX || 0));
      const safeGazeY = Math.max(-0.85, Math.min(0.85, gazeY || 0));
      const ix = isLocked ? (safeGazeX * r * 0.15) : (safeGazeX * (r * 0.38));
      const iy = isLocked ? (safeGazeY * r * 0.15) : (safeGazeY * (r * 0.30));

      ctx.save();
      ctx.translate(ix, iy);

      // 3a. Electric Amethyst Volumetric Corona Plasma Glow behind Iris
      const purpleCoronaPulse = 1.0 + Math.sin(now * 0.004) * 0.16;
      const irisCorona = ctx.createRadialGradient(0, 0, irisR * 0.1, 0, 0, irisR * 1.32 * purpleCoronaPulse);
      irisCorona.addColorStop(0, 'rgba(224, 170, 255, 0.95)');   // Starlight Lavender
      irisCorona.addColorStop(0.32, 'rgba(199, 125, 255, 0.85)'); // Electric Neon Violet
      irisCorona.addColorStop(0.68, 'rgba(157, 78, 221, 0.65)');  // Deep Amethyst
      irisCorona.addColorStop(0.90, 'rgba(114, 9, 183, 0.35)');   // Royal Ultraviolet
      irisCorona.addColorStop(1, 'transparent');
      ctx.fillStyle = irisCorona;
      ctx.beginPath();
      ctx.arc(0, 0, irisR * 1.32 * purpleCoronaPulse, 0, Math.PI * 2);
      ctx.fill();

      // 3b. High-Res Iris Core + Luminous Screen Blend
      if (imgPhotorealisticIris.complete && imgPhotorealisticIris.naturalWidth > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, irisR, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(imgPhotorealisticIris, -irisR, -irisR, irisR * 2, irisR * 2);

        // Vibrant Purple Luminescence Enhancer: intensifies rich saturated purple & violet depth
        const irisGlowGrad = ctx.createRadialGradient(0, 0, irisR * 0.1, 0, 0, irisR);
        irisGlowGrad.addColorStop(0, 'rgba(224, 170, 255, 0.60)');
        irisGlowGrad.addColorStop(0.35, 'rgba(199, 125, 255, 0.45)');
        irisGlowGrad.addColorStop(0.70, 'rgba(157, 78, 221, 0.40)');
        irisGlowGrad.addColorStop(1, 'rgba(45, 0, 80, 0.65)');
        ctx.fillStyle = irisGlowGrad;
        ctx.fillRect(-irisR, -irisR, irisR * 2, irisR * 2);
        ctx.restore();
      } else {
        const irisGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, irisR);
        irisGrad.addColorStop(0, '#10002b');
        irisGrad.addColorStop(0.18, '#240046');
        irisGrad.addColorStop(0.38, '#5a189a');
        irisGrad.addColorStop(0.62, '#7b2cbf');
        irisGrad.addColorStop(0.82, '#9d4edd');
        irisGrad.addColorStop(0.94, '#c77dff');
        irisGrad.addColorStop(1, '#10002b');
        ctx.fillStyle = irisGrad;
        ctx.beginPath();
        ctx.arc(0, 0, irisR, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3c. Radiating Crystalline Collagen Fibers (Electric Violet & Celestial Cyan)
      const numFibers = 40;
      for (let f = 0; f < numFibers; f++) {
        const fAng = (f / numFibers) * Math.PI * 2 + (now * 0.0004);
        const wave = Math.sin(f * 3.5 + now * 0.002) * (irisR * 0.04);
        const fLen1 = irisR * 0.26;
        const fLen2 = irisR * (0.90 + 0.06 * Math.sin(f * 2.2 + now * 0.002));
        ctx.strokeStyle = (f % 3 === 0) 
          ? 'rgba(255, 215, 0, 0.50)' 
          : (f % 3 === 1 ? 'rgba(0, 255, 200, 0.45)' : 'rgba(224, 170, 255, 0.75)');
        ctx.lineWidth = 0.75;
        const cosA = Math.cos(fAng);
        const sinA = Math.sin(fAng);
        ctx.beginPath();
        ctx.moveTo(cosA * fLen1, sinA * fLen1);
        ctx.lineTo(cosA * fLen2 + (-sinA * wave), sinA * fLen2 + (cosA * wave));
        ctx.stroke();
      }

      // 3d. Luminous Purple Limbal Ring with Pulsing Glow
      ctx.strokeStyle = 'rgba(199, 125, 255, 0.90)';
      ctx.lineWidth = 1.2;
      ctx.shadowColor = '#C77DFF';
      ctx.shadowBlur = 8 * purpleCoronaPulse;
      ctx.beginPath();
      ctx.arc(0, 0, irisR - 0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 4. Breathing Obsidian Pupil with Soft Magenta Margin
      const pupilBreath = 1.0 + Math.sin(now * 0.0026) * 0.12;
      const pRad = Math.max(irisR * 0.24, Math.min(irisR * 0.46, (pupilRadius || irisR * 0.32) * pupilBreath));
      
      // Pupil edge purple halo
      ctx.fillStyle = 'rgba(114, 9, 183, 0.45)';
      ctx.beginPath();
      ctx.arc(0, 0, pRad + 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Deep Obsidian Pupil Core
      ctx.fillStyle = '#05000a';
      ctx.beginPath();
      ctx.arc(0, 0, pRad, 0, Math.PI * 2);
      ctx.fill();

      // 5. Triple Diamond Starlight Specular Glints
      // Primary Brilliance Sparkle
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = '#FFFFFF';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(-irisR * 0.28, -irisR * 0.28, Math.max(2.2, r * 0.042), 0, Math.PI * 2);
      ctx.fill();

      // Secondary Starlight Reflection
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.shadowColor = '#00FFC8';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(irisR * 0.22, irisR * 0.20, Math.max(1.2, r * 0.024), 0, Math.PI * 2);
      ctx.fill();

      // Micro Specular Glint
      ctx.fillStyle = 'rgba(224, 170, 255, 0.85)';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(-irisR * 0.15, irisR * 0.26, Math.max(0.8, r * 0.016), 0, Math.PI * 2);
      ctx.fill();

      ctx.restore(); // end iris translate

      // 6. Smooth Biological Eyelid Blink Cover
      if (blinkPhase > 0) {
        ctx.fillStyle = '#140026';
        const bh = ah * 0.65 * blinkPhase;

        // Upper Eyelid
        ctx.beginPath();
        ctx.moveTo(-aw * 0.6, -ah * 0.6);
        ctx.lineTo(aw * 0.6, -ah * 0.6);
        ctx.lineTo(aw * 0.6, -ah * 0.6 + bh);
        ctx.quadraticCurveTo(0, -ah * 0.6 + bh * 1.4, -aw * 0.6, -ah * 0.6 + bh);
        ctx.closePath();
        ctx.fill();

        // Lower Eyelid
        ctx.beginPath();
        ctx.moveTo(-aw * 0.6, ah * 0.6);
        ctx.lineTo(aw * 0.6, ah * 0.6);
        ctx.lineTo(aw * 0.6, ah * 0.6 - bh);
        ctx.quadraticCurveTo(0, ah * 0.6 - bh * 1.4, -aw * 0.6, ah * 0.6 - bh);
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore(); // end almond clip

      // 7. Gold Almond Eyelid Rim Border
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.88)';
      ctx.lineWidth = Math.max(1.6, r * 0.032);
      ctx.shadowColor = 'rgba(0, 255, 200, 0.75)';
      ctx.shadowBlur = Math.max(4, r * 0.09);
      ctx.beginPath();
      ctx.moveTo(-aw * 0.50, 0);
      ctx.bezierCurveTo(-aw * 0.32, -ah * 0.60, aw * 0.16, -ah * 0.54, aw * 0.50, -ah * 0.04);
      ctx.bezierCurveTo(aw * 0.22, ah * 0.52, -aw * 0.30, ah * 0.44, -aw * 0.50, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 8. PHOTOREALISTIC COUTURE CURVED EYELASHES (Upper & Lower)
      // Upper Lashes: 26 naturally tapered, fanned lashes with root-to-tip curve
      const numUpperLashes = 26;
      ctx.save();
      ctx.lineCap = 'round';
      for (let l = 0; l < numUpperLashes; l++) {
        const t = l / (numUpperLashes - 1);
        const lx = -aw * 0.45 + t * (aw * 0.90);
        const normX = (t - 0.5) * 2;
        const archY = -ah * 0.52 * Math.sqrt(Math.max(0, 1 - normX * normX));
        const ly = blinkPhase > 0.005 ? (archY + blinkPhase * (ah * 0.35)) : archY;

        let lenFactor;
        if (t < 0.25) lenFactor = 0.40 + (t / 0.25) * 0.45;
        else if (t < 0.75) lenFactor = 0.85 + ((t - 0.25) / 0.50) * 0.30;
        else lenFactor = 1.15 - ((t - 0.75) / 0.25) * 0.45;

        const lashLen = (r * 0.38) * lenFactor * (1 - blinkPhase * 0.2);
        const fanAng = -Math.PI * 0.5 + (t - 0.45) * 1.30;
        const curlAng = fanAng + (t < 0.45 ? -0.22 : 0.25);

        const midX = lx + Math.cos(fanAng) * (lashLen * 0.52);
        const midY = ly + Math.sin(fanAng) * (lashLen * 0.52);
        const tipX = lx + Math.cos(curlAng) * lashLen;
        const tipY = ly + Math.sin(curlAng) * lashLen;

        ctx.strokeStyle = l % 2 === 0 ? '#06010D' : '#120320';
        ctx.lineWidth = Math.max(0.7, r * 0.024 * Math.max(0.4, 1 - Math.abs(t - 0.6) * 0.8));
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.quadraticCurveTo(midX, midY, tipX, tipY);
        ctx.stroke();

        // Delicate shimmer tip
        if (l % 4 === 0 && r > 16) {
          ctx.strokeStyle = 'rgba(199, 125, 255, 0.35)';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(midX, midY);
          ctx.lineTo(tipX, tipY);
          ctx.stroke();
        }
      }

      // Lower Lashes: 14 delicate, fine lower lashes
      const numLowerLashes = 14;
      for (let ll = 0; ll < numLowerLashes; ll++) {
        const lt = ll / (numLowerLashes - 1);
        const llx = -aw * 0.38 + lt * (aw * 0.76);
        const lnormX = (lt - 0.5) * 2;
        const lArchY = ah * 0.45 * Math.sqrt(Math.max(0, 1 - lnormX * lnormX));
        const lly = blinkPhase > 0.005 ? (lArchY - blinkPhase * (ah * 0.20)) : lArchY;
        const lLen = (r * 0.16) * Math.max(0.35, 1 - Math.abs(lt - 0.5) * 0.75);
        const lAng = Math.PI * 0.5 + (lt - 0.5) * 0.70;

        const lMidX = llx + Math.cos(lAng) * (lLen * 0.45);
        const lMidY = lly + Math.sin(lAng) * (lLen * 0.45);
        const lTipX = llx + Math.cos(lAng + (lt - 0.5) * 0.2) * lLen;
        const lTipY = lly + Math.sin(lAng + (lt - 0.5) * 0.2) * lLen;

        ctx.strokeStyle = 'rgba(12, 2, 22, 0.65)';
        ctx.lineWidth = Math.max(0.45, r * 0.012);
        ctx.beginPath();
        ctx.moveTo(llx, lly);
        ctx.quadraticCurveTo(lMidX, lMidY, lTipX, lTipY);
        ctx.stroke();
      }
      ctx.restore();

      ctx.restore(); // end eye translate
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // COMPREHENSIVE 3D TOPOGRAPHICAL LASER PROFILOMETRY SCANNER (RIGHT TO LEFT)
    // ═══════════════════════════════════════════════════════════════════════════
    // PHOTOREALISTIC 4-PASS 3D TOPOGRAPHICAL LASER SCANNER
    // Multi-Layer Coherent Optics • Volumetric Rayleigh Haze • Holographic Isobars • Laser Speckle
    // ═══════════════════════════════════════════════════════════════════════════
    function drawComprehensive3DLaserScan(ctx, originX, originY, now, scanTime, scanDuration = 2.80) {
      ctx.save();

      const totalScanP = Math.min(1, Math.max(0, scanTime / scanDuration));
      
      // 4 Passes:
      // Pass 0 (0.00 - 0.25): HORIZONTAL (Sweeps Left to Right across body with vertical blade)
      // Pass 1 (0.25 - 0.50): VERTICAL   (Sweeps Top to Bottom down body with horizontal blade)
      // Pass 2 (0.50 - 0.75): HORIZONTAL (Sweeps Right to Left across body with vertical blade)
      // Pass 3 (0.75 - 1.00): VERTICAL   (Sweeps Bottom to Top up body with horizontal blade)
      const passIdx = Math.min(3, Math.floor(totalScanP * 4));
      const passFrac = (totalScanP - passIdx * 0.25) * 4;
      const easeP = passFrac * passFrac * (3 - 2 * passFrac); // Smooth biological scan easing

      // High-Frequency Coherent Laser Shimmer & Optical Interferences (60Hz / 120Hz harmonics)
      const shimmerFast = 0.85 + 0.15 * Math.sin(now * 0.052);
      const shimmerMedium = 0.88 + 0.12 * Math.cos(now * 0.026 + 1.1);
      const shimmerGlow = 0.80 + 0.20 * Math.sin(now * 0.036 + 2.4);
      const shimmerTotal = shimmerFast * shimmerMedium;
      const pulsePhase = Math.sin(now * 0.008);

      const screenW = window.innerWidth || 1920;
      const screenH = window.innerHeight || 1080;

      // Color themes & physical wavelengths per pass
      const themes = [
        { 
          name: 'QUANTUM BIO-FIELD MAPPING',
          wavelength: 'λ 488.2 nm',
          freq: '852.0 Hz',
          primary: '#00FFC8', 
          secondary: '#00F0FF', 
          tertiary: '#00E5D4',
          glow1: 'rgba(0, 255, 200, ', 
          glow2: 'rgba(0, 240, 255, ',
          sparkle: '#FFFFFF',
          rgb: [0, 255, 200]
        },
        { 
          name: 'SOLAR PRANA RESONANCE',
          wavelength: 'λ 589.4 nm',
          freq: '528.0 Hz',
          primary: '#FFD700', 
          secondary: '#FFE57F', 
          tertiary: '#FFA000',
          glow1: 'rgba(255, 215, 0, ', 
          glow2: 'rgba(255, 230, 128, ',
          sparkle: '#FFF8DC',
          rgb: [255, 215, 0]
        },
        { 
          name: 'QUANTUM AMETHYST WAVEFORM',
          wavelength: 'λ 405.0 nm',
          freq: '963.0 Hz',
          primary: '#C77DFF', 
          secondary: '#9D4EDD', 
          tertiary: '#E0AAFF',
          glow1: 'rgba(199, 125, 255, ', 
          glow2: 'rgba(157, 78, 221, ',
          sparkle: '#FFFFFF',
          rgb: [199, 125, 255]
        },
        { 
          name: 'DIVINE HOLOGRAPHIC ATTUNEMENT',
          wavelength: 'λ 532.8 nm',
          freq: '1111.0 Hz',
          primary: '#00F0FF', 
          secondary: '#FFFFFF', 
          tertiary: '#7AFFE3',
          glow1: 'rgba(0, 240, 255, ', 
          glow2: 'rgba(255, 255, 255, ',
          sparkle: '#00FFC8',
          rgb: [0, 240, 255]
        }
      ];
      const theme = themes[passIdx];

      const isHorizontalPass = (passIdx === 0 || passIdx === 2);
      const numBladeSamples = 72;
      const bladePoints = [];
      const isobars = [[], [], []]; // 3 secondary topographical depth isobars

      // Focused Biometric Scanning Bounds (Directly from aEye aperture down across the bio-field)
      const scanTopY = originY + 24;
      const scanBotY = Math.min(screenH - 24, originY + 520);
      const scanHeight = scanBotY - scanTopY;
      const scanWidth = Math.min(screenW * 0.82, 780);

      // Body 3D Topographical Half-Width profile (Head -> Shoulders -> Torso -> Base)
      function getBodyHalfWidth(v) {
        if (v < 0.04) return 0;
        if (v < 0.22) return Math.sin(((v - 0.04) / 0.18) * Math.PI) * (scanWidth * 0.20);
        if (v < 0.38) return (scanWidth * 0.14) + ((v - 0.22) / 0.16) * (scanWidth * 0.34);
        if (v < 0.65) return (scanWidth * 0.46) - Math.sin(((v - 0.38) / 0.27) * Math.PI) * (scanWidth * 0.08);
        if (v < 0.96) return (scanWidth * 0.36) + Math.sin(((v - 0.65) / 0.31) * Math.PI * 0.5) * (scanWidth * 0.18);
        return 0;
      }

      let primarySweepX = 0;
      let primarySweepY = 0;
      let intersectionLeft = null;
      let intersectionRight = null;

      if (isHorizontalPass) {
        // ─── HORIZONTAL PASS (Vertical laser blade sweeping horizontally across the silhouette) ───
        const leftX = originX - scanWidth * 0.5;
        const rightX = originX + scanWidth * 0.5;
        
        let sweepX;
        if (passIdx === 0) {
          sweepX = leftX + easeP * (rightX - leftX);
        } else {
          sweepX = rightX - easeP * (rightX - leftX);
        }
        primarySweepX = sweepX;

        for (let i = 0; i <= numBladeSamples; i++) {
          const frac = i / numBladeSamples;
          const py = scanTopY + frac * scanHeight;
          const bodyHalfW = getBodyHalfWidth(frac);
          const dx = sweepX - originX;
          
          let deformedX = sweepX;
          let depthZ = 0;

          if (bodyHalfW > 2 && Math.abs(dx) < bodyHalfW) {
            const normDx = dx / bodyHalfW;
            const elevation = Math.sqrt(Math.max(0, 1 - normDx * normDx));
            depthZ = elevation * 38;
            deformedX = (passIdx === 0) ? (sweepX + depthZ * 0.85) : (sweepX - depthZ * 0.85);

            if (!intersectionLeft && frac > 0.12 && frac < 0.88) {
              intersectionLeft = { x: sweepX - bodyHalfW, y: py };
            }
            intersectionRight = { x: sweepX + bodyHalfW, y: py };
          }

          bladePoints.push({ x: deformedX, y: py, depthZ: depthZ, origX: sweepX, origY: py });

          // Compute 3 secondary elevation isobars
          [-18, 18, -36].forEach((offset, idx) => {
            const isoSweepX = sweepX + offset;
            const isoDx = isoSweepX - originX;
            let isoDefX = isoSweepX;
            if (bodyHalfW > 2 && Math.abs(isoDx) < bodyHalfW) {
              const normIsoDx = isoDx / bodyHalfW;
              const isoElev = Math.sqrt(Math.max(0, 1 - normIsoDx * normIsoDx));
              isoDefX = (passIdx === 0) ? (isoSweepX + isoElev * 28) : (isoSweepX - isoElev * 28);
            }
            isobars[idx].push({ x: isoDefX, y: py });
          });
        }
      } else {
        // ─── VERTICAL PASS (Horizontal laser blade sweeping vertically down/up the silhouette) ───
        let sweepY;
        if (passIdx === 1) {
          sweepY = scanTopY + easeP * (scanBotY - scanTopY);
        } else {
          sweepY = scanBotY - easeP * (scanBotY - scanTopY);
        }
        primarySweepY = sweepY;

        const sweepFrac = (sweepY - scanTopY) / (scanBotY - scanTopY);
        const bodyHalfW = getBodyHalfWidth(sweepFrac);

        for (let i = 0; i <= numBladeSamples; i++) {
          const frac = (i / numBladeSamples) - 0.5; // -0.5 to +0.5
          const px = originX + frac * scanWidth;
          const dx = px - originX;

          let deformedY = sweepY;
          let depthZ = 0;

          if (bodyHalfW > 2 && Math.abs(dx) < bodyHalfW) {
            const normDx = dx / bodyHalfW;
            const elevation = Math.sqrt(Math.max(0, 1 - normDx * normDx));
            depthZ = elevation * 38;
            deformedY = (passIdx === 1) ? (sweepY + depthZ * 0.85) : (sweepY - depthZ * 0.85);

            if (!intersectionLeft) intersectionLeft = { x: originX - bodyHalfW, y: sweepY };
            intersectionRight = { x: originX + bodyHalfW, y: sweepY };
          }

          bladePoints.push({ x: px, y: deformedY, depthZ: depthZ, origX: px, origY: sweepY });

          // Compute 3 secondary elevation isobars
          [-18, 18, -36].forEach((offset, idx) => {
            const isoSweepY = sweepY + offset;
            const isoSweepFrac = (isoSweepY - scanTopY) / (scanBotY - scanTopY);
            const isoBodyHalfW = getBodyHalfWidth(isoSweepFrac);
            let isoDefY = isoSweepY;
            if (isoBodyHalfW > 2 && Math.abs(dx) < isoBodyHalfW) {
              const normIsoDx = dx / isoBodyHalfW;
              const isoElev = Math.sqrt(Math.max(0, 1 - normIsoDx * normIsoDx));
              isoDefY = (passIdx === 1) ? (isoSweepY + isoElev * 28) : (isoSweepY - isoElev * 28);
            }
            isobars[idx].push({ x: px, y: isoDefY });
          });
        }
      }

      // ─── 1. OPTICAL LASER EMITTER SOURCE AT aEYE (originX, originY) ───
      ctx.save();
      ctx.translate(originX, originY);
      ctx.globalCompositeOperation = 'screen';

      // Concentric photonic diffraction rings
      for (let ring = 1; ring <= 3; ring++) {
        const ringR = (ring * 9 + Math.sin(now * 0.02 + ring) * 3) * shimmerGlow;
        ctx.strokeStyle = theme.glow1 + (0.55 / ring * shimmerFast) + ')';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, ringR, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 6-Point razor anamorphic optical starburst
      const starAngle = now * 0.0018;
      for (let s = 0; s < 6; s++) {
        const a = starAngle + (s * Math.PI / 3);
        const rayLen = (s % 2 === 0 ? 36 : 22) * shimmerFast;
        const grad = ctx.createLinearGradient(0, 0, Math.cos(a) * rayLen, Math.sin(a) * rayLen);
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.35, theme.primary);
        grad.addColorStop(1, 'transparent');
        ctx.strokeStyle = grad;
        ctx.lineWidth = (s % 2 === 0 ? 2.2 : 1.2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * rayLen, Math.sin(a) * rayLen);
        ctx.stroke();
      }

      // White-hot laser emitter diode core
      const coreBloom = ctx.createRadialGradient(0, 0, 1, 0, 0, 24);
      coreBloom.addColorStop(0, '#FFFFFF');
      coreBloom.addColorStop(0.25, theme.primary);
      coreBloom.addColorStop(0.65, theme.glow1 + '0.45)');
      coreBloom.addColorStop(1, 'transparent');
      ctx.fillStyle = coreBloom;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // ─── 2. VOLUMETRIC RAYLEIGH LIGHT SHEET (Screen blend atmospheric fan) ───
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const avgBladeX = bladePoints[Math.floor(numBladeSamples * 0.5)].x;
      const avgBladeY = bladePoints[Math.floor(numBladeSamples * 0.5)].y;
      const fanGrad = ctx.createLinearGradient(originX, originY, avgBladeX, avgBladeY);

      fanGrad.addColorStop(0, theme.glow1 + (0.95 * shimmerTotal) + ')');
      fanGrad.addColorStop(0.25, theme.glow1 + (0.45 * shimmerFast) + ')');
      fanGrad.addColorStop(0.65, theme.glow2 + (0.28 * shimmerMedium) + ')');
      fanGrad.addColorStop(0.92, theme.glow1 + (0.65 * shimmerTotal) + ')');
      fanGrad.addColorStop(1, '#FFFFFF88');

      ctx.fillStyle = fanGrad;
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      for (let i = 0; i <= numBladeSamples; i++) {
        ctx.lineTo(bladePoints[i].x, bladePoints[i].y);
      }
      ctx.closePath();
      ctx.fill();

      // Laser fan collimated filament rays (Atmospheric micro-shafts)
      for (let r = 1; r < 18; r++) {
        const idx = Math.floor((r / 18) * numBladeSamples);
        const pt = bladePoints[idx];
        const rayAlpha = (0.28 + 0.42 * Math.sin(now * 0.048 + r * 1.8)) * shimmerFast;
        ctx.strokeStyle = theme.glow1 + rayAlpha + ')';
        ctx.lineWidth = (r % 3 === 0 ? 1.8 : 0.9);
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
      }
      ctx.restore();

      // ─── 3. SECONDARY HOLOGRAPHIC TOPOGRAPHICAL ISOBARS ───
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      isobars.forEach((iso, idx) => {
        const isoAlpha = (0.35 - idx * 0.08) * shimmerMedium;
        ctx.strokeStyle = theme.glow2 + isoAlpha + ')';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        for (let i = 0; i <= numBladeSamples; i++) {
          if (i === 0) ctx.moveTo(iso[i].x, iso[i].y);
          else ctx.lineTo(iso[i].x, iso[i].y);
        }
        ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.restore();

      // ─── 4. MULTI-LAYER COHERENT 3D LASER BLADE ───
      ctx.save();
      // Outer Rayleigh bloom sheath
      ctx.strokeStyle = theme.secondary;
      ctx.lineWidth = 22.0 * shimmerGlow;
      ctx.shadowColor = theme.secondary;
      ctx.shadowBlur = 32 * shimmerGlow;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.45 * shimmerTotal;
      ctx.beginPath();
      for (let i = 0; i <= numBladeSamples; i++) {
        if (i === 0) ctx.moveTo(bladePoints[i].x, bladePoints[i].y);
        else ctx.lineTo(bladePoints[i].x, bladePoints[i].y);
      }
      ctx.stroke();

      // Secondary vivid neon wavelength sheath
      ctx.strokeStyle = theme.primary;
      ctx.lineWidth = 7.5 * shimmerFast;
      ctx.shadowColor = theme.primary;
      ctx.shadowBlur = 18;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      for (let i = 0; i <= numBladeSamples; i++) {
        if (i === 0) ctx.moveTo(bladePoints[i].x, bladePoints[i].y);
        else ctx.lineTo(bladePoints[i].x, bladePoints[i].y);
      }
      ctx.stroke();

      // High-frequency interference line
      ctx.strokeStyle = theme.tertiary;
      ctx.lineWidth = 3.0;
      ctx.shadowColor = theme.primary;
      ctx.shadowBlur = 10;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      for (let i = 0; i <= numBladeSamples; i++) {
        if (i === 0) ctx.moveTo(bladePoints[i].x, bladePoints[i].y);
        else ctx.lineTo(bladePoints[i].x, bladePoints[i].y);
      }
      ctx.stroke();

      // Ultra-concentrated white-hot plasma core filament
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.8;
      ctx.shadowColor = '#FFFFFF';
      ctx.shadowBlur = 6;
      ctx.globalAlpha = 1.0;
      ctx.beginPath();
      for (let i = 0; i <= numBladeSamples; i++) {
        if (i === 0) ctx.moveTo(bladePoints[i].x, bladePoints[i].y);
        else ctx.lineTo(bladePoints[i].x, bladePoints[i].y);
      }
      ctx.stroke();
      ctx.restore();

      // ─── 5. DYNAMIC LASER SPECKLE & SURFACE INTERSECTION GLINTS ───
      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      // Laser Speckle: high-frequency photon pips dancing across deformed 3D surface
      for (let i = 0; i < bladePoints.length; i += 3) {
        const pt = bladePoints[i];
        if (pt.depthZ > 4) {
          const specklePulse = Math.sin(now * 0.08 + i * 2.3);
          if (specklePulse > 0.2) {
            const spR = (1.5 + specklePulse * 2.2);
            ctx.fillStyle = (i % 2 === 0 ? '#FFFFFF' : theme.primary);
            ctx.beginPath();
            ctx.arc(pt.x + (Math.sin(i * 11) * 3), pt.y + (Math.cos(i * 7) * 3), spR, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Entry & Exit body intersection contact glints
      [intersectionLeft, intersectionRight].forEach((contact, cIdx) => {
        if (contact) {
          // Anamorphic horizontal contact glare
          const glareGrad = ctx.createLinearGradient(contact.x - 22, contact.y, contact.x + 22, contact.y);
          glareGrad.addColorStop(0, 'transparent');
          glareGrad.addColorStop(0.5, '#FFFFFF');
          glareGrad.addColorStop(1, 'transparent');
          ctx.fillStyle = glareGrad;
          ctx.fillRect(contact.x - 22, contact.y - 2, 44, 4);

          // Contact spark burst
          ctx.fillStyle = theme.primary;
          ctx.beginPath();
          ctx.arc(contact.x, contact.y, 4.5 * shimmerFast, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.restore();

      // ─── 6. CHAKRA HARMONIC RESONANCE FLASHES (Vertical Passes) ───
      if (!isHorizontalPass) {
        const chakraAlts = [
          { name: 'CROWN', frac: 0.12, color: '#C77DFF', freq: '963 Hz' },
          { name: 'THIRD EYE', frac: 0.22, color: '#7289DA', freq: '852 Hz' },
          { name: 'THROAT', frac: 0.34, color: '#00E5D4', freq: '741 Hz' },
          { name: 'HEART', frac: 0.48, color: '#00FFC8', freq: '639 Hz' },
          { name: 'SOLAR PLEXUS', frac: 0.62, color: '#FFD700', freq: '528 Hz' },
          { name: 'SACRAL', frac: 0.74, color: '#FF9E00', freq: '417 Hz' },
          { name: 'ROOT', frac: 0.88, color: '#FF3366', freq: '396 Hz' }
        ];

        const sweepFrac = (primarySweepY - scanTopY) / (scanBotY - scanTopY);
        chakraAlts.forEach(ch => {
          const dist = Math.abs(sweepFrac - ch.frac);
          if (dist < 0.038) {
            const chAlpha = (1 - dist / 0.038) * shimmerFast;
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const cy = scanTopY + ch.frac * (scanBotY - scanTopY);
            
            // Harmonic chakra resonance halo
            const chGrad = ctx.createRadialGradient(originX, cy, 2, originX, cy, 48 * chAlpha);
            chGrad.addColorStop(0, '#FFFFFF');
            chGrad.addColorStop(0.35, ch.color);
            chGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = chGrad;
            ctx.beginPath();
            ctx.arc(originX, cy, 48 * chAlpha, 0, Math.PI * 2);
            ctx.fill();

            // Diamond crosshair
            ctx.strokeStyle = ch.color;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(originX, cy, 14 * chAlpha, 0, Math.PI * 2);
            ctx.moveTo(originX - 18, cy); ctx.lineTo(originX + 18, cy);
            ctx.moveTo(originX, cy - 18); ctx.lineTo(originX, cy + 18);
            ctx.stroke();
            ctx.restore();
          }
        });
      }

      ctx.restore(); // end drawComprehensive3DLaserScan
    }

    // ─── INTERACTIVE AURA & ENERGY FREQUENCY SCANNER ───
    function initAuraScanner() {
      const startBtn = document.getElementById('aura-start-scan-btn');
      const btnLabel = document.getElementById('aura-scan-btn-label');
      const statusText = document.getElementById('aura-scan-status-text');
      const readingModal = document.getElementById('aura-reading-modal');
      const readingCloseBtn = document.getElementById('aura-reading-close-btn');
      const readingContactBtn = document.getElementById('aura-reading-contact-btn');
      const colorPill = document.getElementById('aura-color-pill');
      const freqBadge = document.getElementById('aura-freq-badge');
      const titleEl = document.getElementById('aura-reading-title');
      const descEl = document.getElementById('aura-reading-desc');
      const rescanBtn = document.getElementById('aura-rescan-btn');

      if (!startBtn) return;

      let isScanning = false;

      const auraProfiles = [
        {
          title: 'The Mystic Seer Aura',
          pill: '✦ Electric Aquamarine & Amethyst',
          freq: '852 Hz (Third Eye & Intuition)',
          desc: 'Your energy field radiates profound third-eye clarity, celestial communion, and high-vibrational healing resonance. You are actively shedding subconscious limits and tuning into higher soul telepathy.',
          colors: ['#00FFC8', '#9D4EDD', '#7289DA', '#FFFFFF']
        },
        {
          title: 'The Diamond Healer Aura',
          pill: '✦ Radiant White Light & Tiffany Blue',
          freq: '528 Hz (Miracle & DNA Restoration)',
          desc: 'Your auric sheath carries pure crystalline Usui Reiki light. Your heart chakra is expanding, acting as a natural sanctuary and calming balm for everyone around you.',
          colors: ['#FFFFFF', '#00E5D4', '#7AFFE3', '#E0AAFF']
        },
        {
          title: 'The Solar Alchemist Aura',
          pill: '✦ Celestial 24K Gold & Vivid Amber',
          freq: '528 Hz (Sovereignty & Manifestation)',
          desc: 'A luminous golden fire burns at your core. You are moving through a quantum portal of personal empowerment, creative manifestation, and abundant soul alignment.',
          colors: ['#FFD700', '#FF9E00', '#FFE57F', '#FFFFFF']
        },
        {
          title: 'The Divine Seraph Aura',
          pill: '✦ Royal Amethyst & Magenta Violet',
          freq: '963 Hz (Crown Divine Awakening)',
          desc: 'Your crown chakra is wide open to angelic downloads and evidential mediumship. Departed loved ones and spirit guides are wrapping you in unconditional love and protection.',
          colors: ['#C77DFF', '#E0AAFF', '#3A0CA3', '#00FFC8']
        },
        {
          title: 'The Emerald Empath Aura',
          pill: '✦ Deep Forest Emerald & Opal Green',
          freq: '639 Hz (Heart Harmony & Compassion)',
          desc: 'You are deeply anchored into the heart of Gaia. Your empathetic nature is recalibrating so you can hold divine space without absorbing the emotional heaviness of others.',
          colors: ['#28A85E', '#00FFC8', '#7FE49B', '#FFD700']
        }
      ];

      let activeProfile = auraProfiles[0];

      // Single-Button Start Scan & Return Homebase Logic
      function startScan() {
        if (isScanning) return;
        isScanning = true;
        
        if (startBtn) {
          startBtn.classList.add('is-scanning');
          if (btnLabel) btnLabel.textContent = 'Attuning Field...';
        }
        if (statusText) statusText.textContent = '✦ aEYE Attuning Bio-Frequency... Scanning User ✦';

        // Play 528 Hz Solfeggio Tibetan bowl
        if (window.celestialAudio) {
          window.celestialAudio.playTibetanBowl(528, 3.8, true);
        }

        // 1. Open containing box around the center for the scanning stage so eye stands out
        if (readingModal) {
          readingModal.hidden = false;
          readingModal.classList.remove('is-results-mode');
          readingModal.classList.add('active', 'is-scanning-mode');
        }

        // 2. Measure exact live portal position inside the card
        let targetCenterX = window.innerWidth * 0.5;
        let targetCenterY = window.innerHeight * 0.42;
        const portal = document.getElementById('aura-card-eye-portal');
        if (portal) {
          const rect = portal.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            targetCenterX = rect.left + rect.width * 0.5;
            targetCenterY = rect.top + rect.height * 0.5;
          }
        }

        // 3. Summon the real aEYE to fly directly into modal portal, scale up, look around & perform dual-axis laser scan
        if (typeof window.triggerAuraEyeTakeoff === 'function') {
          window.triggerAuraEyeTakeoff(targetCenterX, targetCenterY);
        }
      }

      window.onAuraScanComplete = function() {
        isScanning = false;
        if (startBtn) {
          startBtn.classList.remove('is-scanning');
          if (btnLabel) btnLabel.textContent = 'Scan Again';
        }
        if (statusText) statusText.textContent = '✦ Bio-Frequency Resonance Revealed ✦';

        // Pick a profile
        activeProfile = auraProfiles[Math.floor(Math.random() * auraProfiles.length)];

        // Update Reading Card
        if (colorPill) colorPill.textContent = activeProfile.pill;
        if (freqBadge) freqBadge.textContent = activeProfile.freq;
        if (titleEl) titleEl.textContent = activeProfile.title;
        if (descEl) descEl.textContent = activeProfile.desc;

        // Transition containing card to results mode (expands smoothly to reveal reading results)
        if (readingModal) {
          readingModal.hidden = false;
          readingModal.classList.remove('is-scanning-mode');
          readingModal.classList.add('active', 'is-results-mode');
        }

        if (window.celestialAudio) {
          window.celestialAudio.playAngelChimes();
        }
        showToast('Auric Resonance Revealed!', 'sparkle');
      };

      function returnHome() {
        if (typeof hideBethSpeechBubble === 'function') {
          hideBethSpeechBubble();
        }
        if (readingModal) {
          readingModal.hidden = true;
          readingModal.classList.remove('active', 'is-scanning-mode', 'is-results-mode');
        }
        if (startBtn) {
          startBtn.classList.remove('is-scanning');
          if (btnLabel) btnLabel.textContent = 'Start Scan';
        }
        if (statusText) statusText.textContent = 'Click to summon the aEYE and align your auric field';

        // Send aEYE from current portal position back down to corner homebase
        let fromX = window.innerWidth * 0.5;
        let fromY = window.innerHeight * 0.42;
        const portal = document.getElementById('aura-card-eye-portal');
        if (portal) {
          const rect = portal.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            fromX = rect.left + rect.width * 0.5;
            fromY = rect.top + rect.height * 0.5;
          }
        }
        if (typeof window.triggerAuraEyeReturn === 'function') {
          window.triggerAuraEyeReturn(fromX, fromY);
        }
      }

      startBtn?.addEventListener('click', () => {
        if (readingModal && !readingModal.hidden) {
          returnHome();
          setTimeout(startScan, 400);
        } else {
          startScan();
        }
      });

      window.returnAuraHome = returnHome;

      readingCloseBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        returnHome();
      });

      readingModal?.addEventListener('click', (e) => {
        if (e.target === readingModal || !e.target.closest('.aura-reading-card')) {
          returnHome();
        }
      });

      rescanBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof window.isAuraEyeInLocation === 'function' && window.isAuraEyeInLocation()) {
          // Eye is already inside the container! Switch container back to scanning mode & trigger in-place rapid blink rescan
          if (readingModal) {
            readingModal.classList.remove('is-results-mode');
            readingModal.classList.add('is-scanning-mode');
          }
          if (typeof window.triggerAuraEyeRescan === 'function') {
            window.triggerAuraEyeRescan();
          }
        } else {
          if (readingModal) readingModal.hidden = true;
          startScan();
        }
      });

      readingContactBtn?.addEventListener('click', () => {
        returnHome();
      });

      // ─── INTERACTIVE SILHOUETTE BIO-AURA GLOW ───
      const silhouetteFrame = document.getElementById('aura-silhouette-frame');

      if (silhouetteFrame) {
        function handleAuraMove(e) {
          const rect = silhouetteFrame.getBoundingClientRect();
          const clientX = e.touches ? e.touches[0].clientX : e.clientX;
          const clientY = e.touches ? e.touches[0].clientY : e.clientY;
          const relX = ((clientX - rect.left) / rect.width) * 100;
          const relY = ((clientY - rect.top) / rect.height) * 100;

          silhouetteFrame.style.setProperty('--aura-mouse-x', `${relX}%`);
          silhouetteFrame.style.setProperty('--aura-mouse-y', `${relY}%`);

          if (Math.random() > 0.75) {
            emitPixieDust(clientX, clientY, 1, ['#00FFC8', '#FFD700', '#FFFFFF', '#C77DFF']);
          }
        }

        silhouetteFrame.addEventListener('mousemove', handleAuraMove, { passive: true });
        silhouetteFrame.addEventListener('touchmove', handleAuraMove, { passive: true });
      }

      // Return to homebase when scrolling away from the Aura section
      const auraSection = document.getElementById('aura-scanner');
      if (auraSection && 'IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (!entry.isIntersecting && entry.intersectionRatio < 0.1) {
              if (isScanning || (readingModal && !readingModal.hidden)) {
                returnHome();
              }
            }
          });
        }, { threshold: [0, 0.1, 0.5] });
        observer.observe(auraSection);
      }
    }

    // ─── ANIMATED CELESTIAL STARS & COSMIC SPARKLES AROUND AURA PORTAL ───
    function initAuraStarsCanvas() {
      const canvas = document.getElementById('aura-stars-canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let width = canvas.width = 560;
      let height = canvas.height = 560;
      let mouseX = -1000;
      let mouseY = -1000;

      function resize() {
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          width = canvas.width = Math.round(rect.width * dpr);
          height = canvas.height = Math.round(rect.height * dpr);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
      }
      resize();
      window.addEventListener('resize', resize, { passive: true });

      const frame = document.getElementById('aura-silhouette-frame');
      if (frame) {
        frame.addEventListener('mousemove', (e) => {
          const r = canvas.getBoundingClientRect();
          mouseX = e.clientX - r.left;
          mouseY = e.clientY - r.top;
        }, { passive: true });
        frame.addEventListener('mouseleave', () => {
          mouseX = -1000;
          mouseY = -1000;
        }, { passive: true });
        frame.addEventListener('touchmove', (e) => {
          if (e.touches && e.touches[0]) {
            const r = canvas.getBoundingClientRect();
            mouseX = e.touches[0].clientX - r.left;
            mouseY = e.touches[0].clientY - r.top;
          }
        }, { passive: true });
      }

      // Generate 48 celestial stars with diverse phases and glint styles
      const numStars = 48;
      const stars = [];
      const starColors = ['#FFFFFF', '#00FFC8', '#FFD700', '#C77DFF', '#7289DA'];

      for (let i = 0; i < numStars; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distNorm = 0.2 + 0.75 * Math.sqrt(Math.random());
        stars.push({
          x: 0.5 + Math.cos(angle) * (distNorm * 0.45),
          y: 0.5 + Math.sin(angle) * (distNorm * 0.45),
          baseSize: 1.2 + Math.random() * 2.6,
          color: starColors[Math.floor(Math.random() * starColors.length)],
          twinkleSpeed: 0.0018 + Math.random() * 0.0035,
          phase: Math.random() * Math.PI * 2,
          isCross: Math.random() > 0.45,
          vx: (Math.random() - 0.5) * 0.00004,
          vy: (Math.random() - 0.5) * 0.00004,
        });
      }

      let isVisible = true;
      let starAnimId = null;
      if ('IntersectionObserver' in window) {
        const obs = new IntersectionObserver((entries) => {
          isVisible = entries[0].isIntersecting;
          if (isVisible && !starAnimId) {
            starAnimId = requestAnimationFrame(drawStars);
          }
        }, { threshold: 0.05 });
        obs.observe(canvas);
      }

      function drawStars(now) {
        if (!isVisible) {
          starAnimId = null;
          return;
        }

        const cssW = canvas.clientWidth || 560;
        const cssH = canvas.clientHeight || 560;
        ctx.clearRect(0, 0, cssW, cssH);

        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          
          // Gentle drift
          s.x = (s.x + s.vx + 1) % 1;
          s.y = (s.y + s.vy + 1) % 1;

          const sx = s.x * cssW;
          const sy = s.y * cssH;

          // Twinkle pulse
          const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now * s.twinkleSpeed + s.phase));

          // Proximity to mouse/touch interaction
          const dx = sx - mouseX;
          const dy = sy - mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const prox = Math.max(0, 1 - dist / 90);
          const flareBonus = prox * 1.8;

          const size = s.baseSize * (1 + flareBonus * 0.8) * twinkle;
          const alpha = Math.min(1, (0.3 + 0.7 * twinkle) + prox * 0.4);

          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = s.color;
          ctx.shadowColor = s.color;
          ctx.shadowBlur = 8 + flareBonus * 12;

          // Center star orb
          ctx.beginPath();
          ctx.arc(sx, sy, size, 0, Math.PI * 2);
          ctx.fill();

          // 4-point cross-glint diamond sparkle for larger stars or hovered stars
          if (s.isCross || prox > 0.2) {
            const armLen = size * (2.8 + flareBonus * 2.0);
            ctx.strokeStyle = s.color;
            ctx.lineWidth = Math.max(0.7, size * 0.28);
            
            // Vertical spike
            ctx.beginPath();
            ctx.moveTo(sx, sy - armLen);
            ctx.lineTo(sx, sy + armLen);
            ctx.stroke();

            // Horizontal spike
            ctx.beginPath();
            ctx.moveTo(sx - armLen, sy);
            ctx.lineTo(sx + armLen, sy);
            ctx.stroke();

            // Tiny central white diamond core
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(sx, sy, size * 0.45, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.restore();
        }

        starAnimId = requestAnimationFrame(drawStars);
      }

      starAnimId = requestAnimationFrame(drawStars);
    }

    initAuraScanner();
    initAuraStarsCanvas();

    // ─── INTERACTIVE APPOINTMENT SCHEDULER (Contact Page) ───
    const timeSlotBtns = document.querySelectorAll('.time-slot-btn');
    let selectedTimeSlot = '';

    timeSlotBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        timeSlotBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedTimeSlot = btn.textContent.trim();
      });
    });

    // ─── INQUIRY FORM ────────────────────────────────
    const inquiryForm = document.getElementById('inquiry-form');
    const formSuccess = document.querySelector('.form__success');

    inquiryForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name    = document.getElementById('name')?.value?.trim();
      const email   = document.getElementById('email')?.value?.trim();
      const service = document.getElementById('service')?.value;
      const message = document.getElementById('message')?.value?.trim();

      if (!name || !email || !service || !message) {
        showToast('Please fill in all required fields.', 'sparkle');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast('Please enter a valid email address.', 'letter');
        return;
      }

      const btn = inquiryForm.querySelector('.form__submit');
      if (btn) { setPico(btn, 'sparkle', 'Connecting with Beth Elise...'); btn.disabled = true; }

      setTimeout(() => {
        inquiryForm.style.display = 'none';
        formSuccess?.classList.add('active');
        showToast('Message sent! Beth Elise will connect within 24–48 hours.', 'star');
      }, 1000);
    });

    // ─── NEWSLETTER FORMS ────────────────────────────
    document.querySelectorAll('.newsletter__form, .footer__newsletter-form').forEach(form => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = form.querySelector('input[type="email"]');
        if (!input?.value?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value)) {
          showToast('Please enter a valid email address.', 'letter');
          return;
        }
        const btn = form.querySelector('button');
        const orig = btn?.textContent;
        if (btn) btn.textContent = '✓ You\'re in!';
        input.value = '';
        showToast('Welcome to the circle, dear soul!', 'blossom');
        setTimeout(() => { if (btn && orig) btn.textContent = orig; }, 3500);
      });
    });

    /* Give an element an icon, optionally followed by a text label.

       The icon is a real <span>, not a ::before, because several of these
       targets already own a ::before of their own — .btn-primary uses one for
       its hover shine, and an element only ever has one, so an icon there was
       being positioned off-canvas and taking the shine with it. The label goes
       in as a text node rather than innerHTML so interpolated values stay
       inert. Pass no text for an icon-only element. */
    function setPico(el, icon, text) {
      if (!el) return;
      el.textContent = '';
      const span = document.createElement('span');
      span.className = `pico pico--${icon}${text ? ' pico--inline' : ''}`;
      span.setAttribute('aria-hidden', 'true');
      if (text) span.style.marginRight = '0.4em';
      el.appendChild(span);
      if (text) el.appendChild(document.createTextNode(text));
    }

    // ─── TOAST NOTIFICATIONS ─────────────────────────
    function showToast(msg, icon = 'sparkle') {
      let toast = document.querySelector('.toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        document.body.appendChild(toast);
      }
      toast.innerHTML = '';
      
      const iconSpan = document.createElement('span');
      iconSpan.className = `pico pico--${icon}`;
      iconSpan.setAttribute('aria-hidden', 'true');
      toast.appendChild(iconSpan);

      const msgSpan = document.createElement('span');
      msgSpan.textContent = ` ${msg} `;
      toast.appendChild(msgSpan);

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'toast__close';
      closeBtn.setAttribute('aria-label', 'Close notification');
      closeBtn.textContent = '×';
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        toast.classList.remove('show');
        clearTimeout(toast._timer);
      };
      toast.appendChild(closeBtn);

      toast.classList.add('show');
      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => toast.classList.remove('show'), 4000);
    }

    // Beth greeting bubble manual close button
    const bethGreetCloseBtn = document.getElementById('beth-greeting-close-btn');
    if (bethGreetCloseBtn) {
      bethGreetCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const gEl = document.getElementById('beth-greeting-bubble');
        if (gEl) {
          gEl.classList.remove('is-visible');
          setTimeout(() => { gEl.hidden = true; }, 300);
        }
      });
    }

    // ─── HIGH-PERFORMANCE SMOOTH SCROLL ────────────────────────
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', (e) => {
        const href = anchor.getAttribute('href');
        if (!href || href === '#') return;
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          const offset = 85;
          const targetY = target.getBoundingClientRect().top + window.pageYOffset - offset;
          window.scrollTo({ top: targetY, behavior: 'smooth' });
        }
      });
    });

    // ─── ACTIVE NAV HIGHLIGHT (High-Performance RAF Scroll Spy) ───
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav__links a, .nav__mobile a');
    let scrollTicking = false;

    function updateActiveNav() {
      const sp = window.scrollY + 140;
      let currentSecId = '';

      sections.forEach(sec => {
        const top = sec.offsetTop;
        const height = sec.offsetHeight;
        if (sp >= top && sp < top + height) {
          currentSecId = sec.id;
        }
      });

      if (currentSecId) {
        navLinks.forEach(lk => {
          const href = lk.getAttribute('href') || '';
          const matches = href === `#${currentSecId}` || href.endsWith(`#${currentSecId}`);
          lk.classList.toggle('active', matches);
        });
      }
      scrollTicking = false;
    }

    window.addEventListener('scroll', () => {
      if (!scrollTicking) {
        requestAnimationFrame(updateActiveNav);
        scrollTicking = true;
      }
    }, { passive: true });

    // ─── PERSISTENT aEYE SACRED GUIDE (Photorealistic Purple Eye + Site Search) ───
    function initSacredAssistant() {
      const widget = document.getElementById('sacred-assistant-widget');
      const avatarBtn = document.getElementById('assistant-avatar-btn');
      const avatarCanvas = document.getElementById('assistant-avatar-canvas');
      const bubble = document.getElementById('assistant-speech-bubble');
      const bubbleText = document.getElementById('assistant-bubble-text');
      const bubbleClose = document.getElementById('assistant-bubble-close');
      const modal = document.getElementById('assistant-modal');
      const closeModalBtn = document.getElementById('close-assistant-modal-btn');
      const modalLinks = document.querySelectorAll('.assistant-link-card');
      const searchInput = document.getElementById('aeye-search-input');

      if (!widget) return;

      // Draw Photorealistic Purple Eye on Avatar Canvas
      if (avatarCanvas) {
        const actx = avatarCanvas.getContext('2d');
        const eyeImg = new Image();
        eyeImg.src = 'images/photorealistic_purple_iris_orb.webp';

        let mouseX = 0.5, mouseY = 0.5;
        window.addEventListener('mousemove', (e) => {
          const rect = avatarCanvas.getBoundingClientRect();
          mouseX = Math.max(-1, Math.min(1, (e.clientX - (rect.left + rect.width * 0.5)) / 200));
          mouseY = Math.max(-1, Math.min(1, (e.clientY - (rect.top + rect.height * 0.5)) / 200));
        }, { passive: true });

        // renderAvatar loop REMOVED — replaced by updateAndRenderSacredEye (living organic eye)
      }

      // ─── aEye Thought Bubble Tips ───
      const tips = [
        "HI, I'M YOUR <span class=\"aeye-brand\">aEYE</span> ASSISTANT. CLICK ME FOR ANY HELP YOU NEED.",
        '<span class="pico pico--meditate" aria-hidden="true"></span> FEELING UNALIGNED? TRY THE SEVEN CHAKRAS RESONANCE MAP — JUST ASK!',
        '<span class="pico pico--ghost" aria-hidden="true"></span> BETH ELISE IS APPEARING LIVE AT GHOST KEY WEST! CHECK UPCOMING EVENTS.',
        '<span class="pico pico--letter" aria-hidden="true"></span> ORDER A HANDWRITTEN SOUL LETTER — "NOTES BY BETH" — SEALED WITH LOVE.',
        '<span class="pico pico--bell" aria-hidden="true"></span> IMMERSE IN 528 HZ SOLFEGGIO BOWLS USING THE SOUND ICON ABOVE.',
        '<span class="pico pico--orb" aria-hidden="true"></span> ASK ME ANYTHING — I CAN HELP YOU NAVIGATE THIS SACRED SPACE.',
        '<span class="pico pico--sparkle" aria-hidden="true"></span> YOUR AURA IS LUMINOUS TODAY. READY TO BOOK A READING WITH BETH?'
      ];
      let tipIndex = 0;
      let fadeTimer = null;
      let cycleTimer = null;

      function showThoughtBubble() {
        if (!bubbleText || !bubble) return;
        bubble.classList.remove('hidden', 'fading');
        bubble.style.opacity = '1';
        bubble.style.transform = 'translateY(0)';
        bubbleText.innerHTML = tips[tipIndex];

        // Auto-fade after 8 seconds
        clearTimeout(fadeTimer);
        fadeTimer = setTimeout(() => {
          bubble.classList.add('fading');
          // After fade completes (1.5s), cycle to next tip after 3s pause
          clearTimeout(cycleTimer);
          cycleTimer = setTimeout(() => {
            tipIndex = (tipIndex + 1) % tips.length;
            showThoughtBubble();
          }, 4500); // 1.5s fade + 3s pause
        }, 8000);
      }

      // Dismiss bubble temporarily on close click
      bubbleClose?.addEventListener('click', (e) => {
        e.stopPropagation();
        clearTimeout(fadeTimer);
        clearTimeout(cycleTimer);
        bubble.classList.add('hidden');
        // Resume after 30s
        setTimeout(() => {
          tipIndex = (tipIndex + 1) % tips.length;
          showThoughtBubble();
        }, 30000);
      });

      // ─── Global closeAssistantModal ───
      window.closeAssistantModal = function() {
        if (!modal) return;
        if (modal.classList.contains('active')) {
          modal.classList.remove('active');
          if (typeof window.triggerFairyMenuDiveBack === 'function') {
            window.triggerFairyMenuDiveBack();
          }
        }
      };

      // Open Modal on Avatar Click with fairy flight takeoff
      avatarBtn?.addEventListener('click', () => {
        if (!modal) return;
        if (typeof window.triggerFairyInterrupted === 'function') {
          window.triggerFairyInterrupted();
        }
        modal.classList.add('active');
        if (typeof window.triggerFairyMenuTakeoff === 'function') {
          window.triggerFairyMenuTakeoff();
        }
        if (window.celestialAudio) window.celestialAudio.playChime(852, 1.2);
        // Focus search input
        setTimeout(() => searchInput?.focus(), 300);
      });

      // Close Modal via close button
      closeModalBtn?.addEventListener('click', () => {
        window.closeAssistantModal();
      });

      // Close Modal via backdrop click
      modal?.addEventListener('click', (e) => {
        if (e.target === modal) window.closeAssistantModal();
      });

      // Close Modal on Escape key press
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
          window.closeAssistantModal();
        }
      });

      // Quick links close modal
      modalLinks.forEach(link => {
        link.addEventListener('click', () => {
          window.closeAssistantModal();
        });
      });

      // ─── aEye Site Search ───
      if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            performAeyeSearch(searchInput.value.trim());
          }
        });
      }

      function performAeyeSearch(query) {
        if (!query || query.length < 2) return;
        const lowerQ = query.toLowerCase();
        window.closeAssistantModal();

        // Search section text content for matches
        const sections = document.querySelectorAll('section[id]');
        for (const sec of sections) {
          const textContent = sec.textContent.toLowerCase();
          if (textContent.includes(lowerQ)) {
            sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Brief highlight
            sec.style.transition = 'box-shadow 0.5s ease';
            sec.style.boxShadow = '0 0 40px rgba(0, 229, 212, 0.6), inset 0 0 30px rgba(0, 229, 212, 0.15)';
            setTimeout(() => {
              sec.style.boxShadow = '';
            }, 2500);
            return;
          }
        }
        // No match found — show bubble with feedback
        if (bubbleText && bubble) {
          clearTimeout(fadeTimer);
          clearTimeout(cycleTimer);
          bubble.classList.remove('hidden', 'fading');
          bubble.style.opacity = '1';
          setPico(bubbleText, 'eye', `I couldn\'t find "${query}" — try "readings", "chakras", "events", or "merch".`);
          fadeTimer = setTimeout(() => {
            bubble.classList.add('fading');
            cycleTimer = setTimeout(() => {
              tipIndex = (tipIndex + 1) % tips.length;
              showThoughtBubble();
            }, 4500);
          }, 6000);
        }
      }

      // ─── CLICK-OUTSIDE-TO-CLOSE FOR ALL MODALS ───
      // Location Modal
      const locBackdrop = document.getElementById('location-modal-backdrop');
      if (locBackdrop) {
        locBackdrop.addEventListener('click', (e) => {
          if (e.target === locBackdrop) {
            locBackdrop.classList.remove('active');
            locBackdrop.setAttribute('aria-hidden', 'true');
          }
        });
      }

      // Product Detail Modal
      const productBackdrop = document.getElementById('product-modal-backdrop');
      if (productBackdrop) {
        productBackdrop.addEventListener('click', (e) => {
          if (e.target === productBackdrop) {
            productBackdrop.classList.remove('active');
            productBackdrop.setAttribute('aria-hidden', 'true');
          }
        });
      }

      // Sound Frequency Modal
      const soundModal = document.getElementById('sound-modal');
      if (soundModal) {
        soundModal.addEventListener('click', (e) => {
          if (e.target === soundModal) {
            soundModal.classList.remove('active');
          }
        });
      }

      // Testimonial Modal
      const testModal = document.getElementById('testimonial-modal');
      if (testModal) {
        testModal.addEventListener('click', (e) => {
          if (e.target === testModal) {
            testModal.classList.remove('active');
          }
        });
      }

      // Checkout Modal
      const checkoutBackdrop = document.getElementById('checkout-modal-backdrop');
      if (checkoutBackdrop) {
        checkoutBackdrop.addEventListener('click', (e) => {
          if (e.target === checkoutBackdrop) {
            checkoutBackdrop.classList.remove('active');
            checkoutBackdrop.setAttribute('aria-hidden', 'true');
          }
        });
      }

      // ─── SACRED ALL-SEEING AMETHYST EYE ASSISTANT ENGINE ───
      // Photorealistic Living Cosmic Eye that randomly looks around, blinks, and follows cursor
      if (avatarCanvas) {
        const eyeCtx = avatarCanvas.getContext('2d');
        const eyeW = avatarCanvas.width;
        const eyeH = avatarCanvas.height;
        const eyeCenterX = eyeW * 0.5;
        const eyeCenterY = eyeH * 0.5;

        // Eye state variables
        let currentIrisX = 0;
        let currentIrisY = 0;
        let targetIrisX = 0;
        let targetIrisY = 0;
        
        let blinkProgress = 0; // 0 = fully open, 1 = fully closed
        let isBlinking = false;
        let nextBlinkTime = performance.now() + 2500;
        let nextLookShiftTime = performance.now() + 1800;

        let mouseX = -9999;
        let mouseY = -9999;
        let lastMouseMoveTime = 0;

        // Listen for mouse movement across the viewport
        window.addEventListener('mousemove', (e) => {
          mouseX = e.clientX;
          mouseY = e.clientY;
          lastMouseMoveTime = performance.now();
        }, { passive: true });

        function updateAndRenderSacredEye(now) {
          if (!eyeCtx) return;
          const aw = avatarCanvas.width;
          const ah = avatarCanvas.height;
          const acx = aw * 0.5;
          const acy = ah * 0.5;

          eyeCtx.clearRect(0, 0, aw, ah);

          // Hide home base eye when the living aEYE is in flight elsewhere
          const tinkState = (window.heroTinkerbell && window.heroTinkerbell.state) || '';
          const menuState = (window.heroAeyeMenu && window.heroAeyeMenu.state) || 'IDLE';
          if (menuState !== 'IDLE' || tinkState.startsWith('MENU_') || tinkState.startsWith('AURA_')) {
            if (!reduceMotion()) requestAnimationFrame(updateAndRenderSacredEye);
            return;
          }

          // 1. Mouse Tracking vs Autonomous Look-Around Saccades
          const rect = avatarCanvas.getBoundingClientRect();
          const canvasScreenCenterX = rect.left + rect.width * 0.5;
          const canvasScreenCenterY = rect.top + rect.height * 0.5;
          const timeSinceMouseMove = now - lastMouseMoveTime;
          const isMouseActive = (timeSinceMouseMove < 2500 && mouseX > -100);

          if (isMouseActive) {
            const dx = mouseX - canvasScreenCenterX;
            const dy = mouseY - canvasScreenCenterY;
            const dist = Math.hypot(dx, dy);
            const maxTravel = 6.5;
            if (dist > 0.1) {
              const travel = Math.min(maxTravel, dist * 0.025);
              targetIrisX = (dx / dist) * travel;
              targetIrisY = (dy / dist) * travel;
            }
          } else {
            if (now > nextLookShiftTime) {
              const angles = [
                { x: 0, y: 0 },
                { x: -5.0, y: -1.2 },
                { x: 5.0, y: -1.2 },
                { x: 0, y: -4.0 },
                { x: -3.0, y: 2.5 },
                { x: 3.0, y: 2.5 },
                { x: 0, y: 0 }
              ];
              const choice = angles[Math.floor(Math.random() * angles.length)];
              targetIrisX = choice.x;
              targetIrisY = choice.y;
              nextLookShiftTime = now + 2200 + Math.random() * 2600;
            }
          }

          currentIrisX += (targetIrisX - currentIrisX) * 0.15;
          currentIrisY += (targetIrisY - currentIrisY) * 0.15;

          // 2. Organic Blinking
          if (now > nextBlinkTime && !isBlinking) {
            isBlinking = true;
          }
          if (isBlinking) {
            blinkProgress += 0.20;
            if (blinkProgress >= 1.0) {
              blinkProgress = 1.0;
              isBlinking = false;
              const isDouble = Math.random() > 0.75;
              nextBlinkTime = now + (isDouble ? 280 : (3200 + Math.random() * 2800));
            }
          } else if (blinkProgress > 0) {
            blinkProgress -= 0.20;
            if (blinkProgress < 0) blinkProgress = 0;
          }

          // 3. Render Unified Living Organic aEye (Almond Shape, Gold Rim & Couture Eyelashes)
          const normGazeX = (currentIrisX / 6.5);
          const normGazeY = (currentIrisY / 6.5);
          const eyeRadius = 31.0;
          const colors = ['#7B2CBF', '#9D4EDD', '#00FFC8'];
          drawOrganicEye(eyeCtx, acx, acy, eyeRadius, normGazeX, normGazeY, blinkProgress, 8.5, colors, now);

          if (!reduceMotion()) requestAnimationFrame(updateAndRenderSacredEye);
        }

        requestAnimationFrame(updateAndRenderSacredEye);
      }

      // Global activation hook from animation sequence
      window.activateSacredAssistantWidget = function() {
        widget.classList.add('visible');
        avatarBtn?.classList.add('splash-active');
        setTimeout(() => avatarBtn?.classList.remove('splash-active'), 1500);
        
        tipIndex = 0;
        showThoughtBubble();

        if (window.celestialAudio) window.celestialAudio.playChime(963, 1.8);
      };

      // Fallback in case the visitor scrolls past the hero before the fairy
      // routine finishes. Kept well clear of that routine's own runtime — the
      // eye is supposed to appear when Beth jumps into it, and a fallback that
      // fires first would give the moment away.
      const revealWidget = () => {
        if (!widget.classList.contains('visible')) {
          widget.classList.add('visible');
          tipIndex = 0;
          showThoughtBubble();
        }
      };

      // With reduced motion the fairy never flies, so nothing would ever hand
      // the assistant over. Show it straight away instead of after the wait.
      if (reduceMotion()) setTimeout(revealWidget, 600);
      else setTimeout(revealWidget, 48000);
    }

    // ─── DYNAMIC EXPIRING EVENTS COUNTDOWN & MANAGEMENT ────────
    function initExpiringEvents() {
      const eventCards = document.querySelectorAll('.event-card[data-event-date]');
      
      eventCards.forEach(card => {
        const dateStr = card.getAttribute('data-event-date');
        if (!dateStr) return;

        const eventDate = new Date(dateStr + 'T00:00:00');
        const now = new Date();
        const diffMs = eventDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        const countdownEl = card.querySelector('.event-countdown');
        const pulseBadge = card.querySelector('.event-pulse-badge');

        if (diffDays > 0) {
          if (countdownEl) {
            countdownEl.textContent = `✦ Live Gathering in ${diffDays} Day${diffDays === 1 ? '' : 's'} · Limited Capacity`;
          }
        } else if (diffDays === 0) {
          if (countdownEl) {
            countdownEl.textContent = '✦ Happening Today Live!';
            countdownEl.style.color = '#00FFC8';
          }
          if (pulseBadge) pulseBadge.textContent = '● Live Today';
        } else {
          // Event Expired
          if (countdownEl) {
            countdownEl.textContent = '✦ Past Sacred Event · Archived';
            countdownEl.style.color = 'var(--text-muted)';
          }
          if (pulseBadge) {
            pulseBadge.textContent = 'Archived';
            pulseBadge.style.background = 'rgba(255, 255, 255, 0.15)';
            pulseBadge.style.color = 'var(--text-muted)';
            pulseBadge.style.borderColor = 'rgba(255, 255, 255, 0.2)';
          }
          card.classList.add('event-expired');
        }
      });
    }

    // ─── UNIVERSAL POPUP & MODAL OUTSIDE-CLICK / CANVAS-CLICK DISMISSAL ───
    function initUniversalModalDismissal() {
      function dismissModalsOnOutsideClick(e) {
        const target = e.target;
        if (!target) return;

        // 1. Aura Reading Modal
        const readingModal = document.getElementById('aura-reading-modal');
        if (readingModal && !readingModal.hidden && !target.closest('.aura-reading-card') && !target.closest('#aura-start-scan-btn') && !target.closest('#aura-rescan-btn')) {
          if (typeof window.returnAuraHome === 'function') {
            window.returnAuraHome();
          }
        }

        // 2. Assistant Modal
        const assistantModal = document.getElementById('assistant-modal');
        if (assistantModal && assistantModal.classList.contains('active') && !target.closest('.assistant-modal-content') && !target.closest('.assistant-card') && !target.closest('#assistant-avatar-btn')) {
          if (typeof window.closeAssistantModal === 'function') {
            window.closeAssistantModal();
          }
        }

        // 3. Sound Modal
        const soundModal = document.getElementById('sound-modal');
        if (soundModal && soundModal.classList.contains('active') && !target.closest('.sound-modal-card') && !target.closest('#nav-sound-btn') && !target.closest('#mobile-sound-btn')) {
          if (typeof window.closeSoundModal === 'function') {
            window.closeSoundModal();
          }
        }

        // 4. Location Modal
        const locModal = document.getElementById('location-modal-backdrop');
        if (locModal && locModal.classList.contains('open') && !target.closest('.location-modal-card') && !target.closest('#hero-location-badge')) {
          if (typeof window.closeLocationModal === 'function') {
            window.closeLocationModal();
          }
        }

        // 5. Testimonial Modal
        const testModal = document.getElementById('testimonial-modal');
        if (testModal && testModal.classList.contains('active') && !target.closest('.modal__card') && !target.closest('#open-testimonial-modal-btn')) {
          testModal.classList.remove('active');
        }

        // 6. Product Modal
        const prodModal = document.getElementById('product-modal-backdrop');
        if (prodModal && prodModal.classList.contains('open') && !target.closest('.product-modal-card') && !target.closest('.merch__card')) {
          prodModal.classList.remove('open');
        }

        // 7. Cart Drawer
        const cartDrawer = document.getElementById('cart-drawer');
        if (cartDrawer && cartDrawer.classList.contains('open') && !target.closest('.cart-drawer') && !target.closest('.nav__cart-btn') && !target.closest('.nav__cart-btn-mobile') && !target.closest('.merch__btn')) {
          if (typeof window.closeCart === 'function') {
            window.closeCart();
          }
        }

        // 8. Checkout Modal
        const checkoutModal = document.getElementById('checkout-modal');
        if (checkoutModal && checkoutModal.classList.contains('active') && !target.closest('.checkout-modal-card') && !target.closest('#cart-checkout-btn')) {
          checkoutModal.classList.remove('active');
        }

        // 9. Mobile Nav
        const mobileNav = document.getElementById('mobile-nav');
        const hamburger = document.getElementById('nav-hamburger');
        if (mobileNav && mobileNav.classList.contains('active') && !target.closest('.mobile-nav') && !target.closest('#nav-hamburger')) {
          mobileNav.classList.remove('active');
          hamburger?.classList.remove('active');
          hamburger?.setAttribute('aria-expanded', 'false');
        }
      }

      window.addEventListener('click', dismissModalsOnOutsideClick, { capture: false });
      window.addEventListener('touchend', dismissModalsOnOutsideClick, { passive: true });
    }

    // Initialize Sacred Assistant, Expiring Events, & Universal Dismissal
    initSacredAssistant();
    initExpiringEvents();
    initUniversalModalDismissal();

    // Initial check
    updateActiveNav();

  } // end initMainApp

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMainApp);
  } else {
    initMainApp();
  }

})();
