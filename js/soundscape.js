// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — Web Audio Soundscapes
// Zero external files: 100% procedural Web Audio synthesis
// Crystal singing bowls (432Hz/528Hz/639Hz/741Hz/852Hz/963Hz),
// true Voss-McCartney pink noise, stereo binaural brainwave entrainment,
// and angelic wind chimes for emotional solace and peace.
// ============================================================

export const SOLFEGGIO_FREQUENCIES = {
  '432': {
    freq: 432,
    name: '432Hz Cosmic Peace',
    label: 'Grounding & Natural Resonance',
    sub: 108,
    drone: 216,
    fifth: 648,
    octave: 864,
    desc: 'Deep peace and harmonic resonance tuned to the natural vibration of Earth and living souls.',
    scale: [432, 486, 540, 648, 720, 864, 972]
  },
  '528': {
    freq: 528,
    name: '528Hz Miracle & Love',
    label: 'Transformation & DNA Restoration',
    sub: 132,
    drone: 264,
    fifth: 792,
    octave: 1056,
    desc: 'The ancient Solfeggio miracle tone known for emotional restoration, peace, and unconditional love.',
    scale: [528, 594, 660, 792, 880, 1056, 1188]
  },
  '639': {
    freq: 639,
    name: '639Hz Heart Connection',
    label: 'Harmonious Bonds & Spiritual Solace',
    sub: 159.75,
    drone: 319.5,
    fifth: 958.5,
    octave: 1278,
    desc: 'Harmonious frequency creating radiant empathy, enduring connection, and heart-to-heart comfort.',
    scale: [639, 718.8, 798.75, 958.5, 1065, 1278, 1437.75]
  },
  '741': {
    freq: 741,
    name: '741Hz Intuition & Clarity',
    label: 'Awakening & Pure Awareness',
    sub: 185.25,
    drone: 370.5,
    fifth: 1111.5,
    octave: 1482,
    desc: 'Pure resonant frequency for releasing sorrow, awakening intuition, and expanding consciousness.',
    scale: [741, 833.6, 926.25, 1111.5, 1235, 1482, 1667.25]
  },
  '852': {
    freq: 852,
    name: '852Hz Spiritual Order',
    label: 'Celestial Insight & Higher Peace',
    sub: 213,
    drone: 426,
    fifth: 1278,
    octave: 1704,
    desc: 'Elevated frequency guiding the spirit into tranquil spiritual order, clarity, and inner sight.',
    scale: [852, 958.5, 1065, 1278, 1420, 1704, 1917]
  },
  '963': {
    freq: 963,
    name: '963Hz Crown Light',
    label: 'Divine Oneness & Rainbow Bridge Light',
    sub: 240.75,
    drone: 481.5,
    fifth: 1444.5,
    octave: 1926,
    desc: 'Pure crown vibration uniting cherished memories with eternal, boundless celestial light.',
    scale: [963, 1083.3, 1203.75, 1444.5, 1605, 1926, 2166.75]
  }
};

export const BINAURAL_PRESETS = {
  'off': { name: 'Off', beatHz: 0, desc: 'Pure acoustic drone' },
  'delta': { name: 'Delta (2.5 Hz)', beatHz: 2.5, desc: 'Restorative deep sleep & eternal rest' },
  'theta': { name: 'Theta (5.5 Hz)', beatHz: 5.5, desc: 'Grief release, deep solace & meditation' },
  'schumann': { name: 'Schumann (7.83 Hz)', beatHz: 7.83, desc: 'Earth atmospheric electromagnetic resonance' },
  'alpha': { name: 'Alpha (8.0 Hz)', beatHz: 8.0, desc: 'Gentle lucidity, calm remembrance & peace' }
};

export const Soundscape = {
  ctx: null,
  masterGain: null,
  compressor: null,
  droneGain: null,
  windGain: null,
  binauralGain: null,
  chimeGain: null,

  isPlaying: false,
  mode: 'crystal', // 'crystal', 'breeze', 'chimes', 'binaural', 'silent'
  solfeggio: '432', // '432', '528', '639', '741', '852', '963'
  binaural: 'off',  // 'off', 'delta', 'theta', 'schumann', 'alpha'
  volume: 0.35,

  _chimeTimer: null,
  _droneNodes: [],
  _windNodes: [],
  _binauralNodes: [],
  _pinkBuffer: null,
  _unlocked: false,

  SOLFEGGIO: SOLFEGGIO_FREQUENCIES,
  BINAURAL: BINAURAL_PRESETS,

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    try {
      this.ctx = new AudioCtx();
    } catch {
      return;
    }

    this._unlockHandler = () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      this._unlocked = true;
      ['click', 'touchstart', 'keydown', 'pointerdown'].forEach(evt =>
        window.removeEventListener(evt, this._unlockHandler)
      );
    };

    if (!this._unlocked) {
      ['click', 'touchstart', 'keydown', 'pointerdown'].forEach(evt =>
        window.addEventListener(evt, this._unlockHandler, { once: true })
      );
    }

    // Studio Dynamics Compressor (prevents digital clipping on multi-voice layers)
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-6, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(12, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(4, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);
    this.compressor.connect(this.ctx.destination);

    // Master Bus
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    this.masterGain.connect(this.compressor);

    // Sub-buses
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.droneGain.connect(this.masterGain);

    this.windGain = this.ctx.createGain();
    this.windGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.windGain.connect(this.masterGain);

    this.binauralGain = this.ctx.createGain();
    this.binauralGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.binauralGain.connect(this.masterGain);

    this.chimeGain = this.ctx.createGain();
    this.chimeGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
    this.chimeGain.connect(this.masterGain);

    // Generate Pink Noise Buffer (Stereo 1/f Voss-McCartney filter)
    this._pinkBuffer = this._generatePinkNoiseBuffer(4);

    // Build generators
    this._buildDrone();
    this._buildWind();
    this._buildBinaural();
    this._startChimeLoop();
  },

  // ---------------- True Voss-McCartney Pink Noise (1/f) ----------------
  _generatePinkNoiseBuffer(duration = 4) {
    if (!this.ctx) return null;
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = sampleRate * duration;
    const buffer = this.ctx.createBuffer(2, bufferSize, sampleRate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        b6 = white * 0.115926;
        data[i] = pink * 0.10; // Controlled gain
      }
    }
    return buffer;
  },

  // ---------------- Crystal Singing Bowls (Tuned Solfeggio Harmonic Drones) ----------------
  _buildDrone() {
    this._teardownDrone();
    if (!this.ctx) return;

    const solf = SOLFEGGIO_FREQUENCIES[this.solfeggio] || SOLFEGGIO_FREQUENCIES['432'];
    const freqs = [solf.sub, solf.drone, solf.freq, solf.fifth, solf.octave];
    const amps = [0.18, 0.14, 0.22, 0.15, 0.09];

    freqs.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f, this.ctx.currentTime);

      // Acoustic chorus beating shimmer
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.setValueAtTime(0.06 + idx * 0.025, this.ctx.currentTime);
      lfoGain.gain.setValueAtTime(0.7 + idx * 0.3, this.ctx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();

      g.gain.setValueAtTime(amps[idx], this.ctx.currentTime);
      osc.connect(g);

      if (panner) {
        panner.pan.setValueAtTime((idx - 2) * 0.35, this.ctx.currentTime);
        g.connect(panner);
        panner.connect(this.droneGain);
      } else {
        g.connect(this.droneGain);
      }

      osc.start();
      this._droneNodes.push(osc, lfo, g, lfoGain);
      if (panner) this._droneNodes.push(panner);
    });
  },

  _teardownDrone() {
    if (!this._droneNodes.length) return;
    const oldNodes = [...this._droneNodes];
    this._droneNodes = [];
    oldNodes.forEach(node => {
      try {
        if (typeof node.stop === 'function') node.stop();
        if (typeof node.disconnect === 'function') node.disconnect();
      } catch {}
    });
  },

  // ---------------- Stereo Binaural Beat Engine ----------------
  _buildBinaural() {
    this._teardownBinaural();
    if (!this.ctx) return;

    const preset = BINAURAL_PRESETS[this.binaural];
    if (!preset || preset.beatHz <= 0) return;

    const solf = SOLFEGGIO_FREQUENCIES[this.solfeggio] || SOLFEGGIO_FREQUENCIES['432'];
    const carrier = solf.freq / 2; // Mid-range carrier (e.g. 216Hz for 432Hz)
    const beatOffset = preset.beatHz;

    // Left Ear: Carrier
    const oscLeft = this.ctx.createOscillator();
    const gainLeft = this.ctx.createGain();
    const panLeft = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

    oscLeft.type = 'sine';
    oscLeft.frequency.setValueAtTime(carrier, this.ctx.currentTime);
    gainLeft.gain.setValueAtTime(0.12, this.ctx.currentTime);
    oscLeft.connect(gainLeft);

    if (panLeft) {
      panLeft.pan.setValueAtTime(-1.0, this.ctx.currentTime); // 100% Left
      gainLeft.connect(panLeft);
      panLeft.connect(this.binauralGain);
      this._binauralNodes.push(panLeft);
    } else {
      gainLeft.connect(this.binauralGain);
    }
    oscLeft.start();
    this._binauralNodes.push(oscLeft, gainLeft);

    // Right Ear: Carrier + Beat offset
    const oscRight = this.ctx.createOscillator();
    const gainRight = this.ctx.createGain();
    const panRight = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

    oscRight.type = 'sine';
    oscRight.frequency.setValueAtTime(carrier + beatOffset, this.ctx.currentTime);
    gainRight.gain.setValueAtTime(0.12, this.ctx.currentTime);
    oscRight.connect(gainRight);

    if (panRight) {
      panRight.pan.setValueAtTime(1.0, this.ctx.currentTime); // 100% Right
      gainRight.connect(panRight);
      panRight.connect(this.binauralGain);
      this._binauralNodes.push(panRight);
    } else {
      gainRight.connect(this.binauralGain);
    }
    oscRight.start();
    this._binauralNodes.push(oscRight, gainRight);
  },

  _teardownBinaural() {
    if (!this._binauralNodes.length) return;
    const oldNodes = [...this._binauralNodes];
    this._binauralNodes = [];
    oldNodes.forEach(node => {
      try {
        if (typeof node.stop === 'function') node.stop();
        if (typeof node.disconnect === 'function') node.disconnect();
      } catch {}
    });
  },

  // ---------------- Gentle Mountain Wind & Mirror Lake River (Pink Noise) ----------------
  _buildWind() {
    this._teardownWind();
    if (!this.ctx) return;
    if (!this._pinkBuffer) this._pinkBuffer = this._generatePinkNoiseBuffer(4);

    // 1. Mountain Breeze Bandpass Layer
    const windSource = this.ctx.createBufferSource();
    windSource.buffer = this._pinkBuffer;
    windSource.loop = true;

    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.setValueAtTime(280, this.ctx.currentTime);
    windFilter.Q.setValueAtTime(1.6, this.ctx.currentTime);

    const windLFO = this.ctx.createOscillator();
    const windLFOGain = this.ctx.createGain();
    windLFO.frequency.setValueAtTime(0.11, this.ctx.currentTime);
    windLFOGain.gain.setValueAtTime(160, this.ctx.currentTime);
    windLFO.connect(windLFOGain);
    windLFOGain.connect(windFilter.frequency);
    windLFO.start();

    const windGainNode = this.ctx.createGain();
    windGainNode.gain.setValueAtTime(0.65, this.ctx.currentTime);

    windSource.connect(windFilter);
    windFilter.connect(windGainNode);
    windGainNode.connect(this.windGain);
    windSource.start();

    // 2. Mirror Lake River Murmur Lowpass Layer
    const riverSource = this.ctx.createBufferSource();
    riverSource.buffer = this._pinkBuffer;
    riverSource.loop = true;

    const riverFilter = this.ctx.createBiquadFilter();
    riverFilter.type = 'lowpass';
    riverFilter.frequency.setValueAtTime(320, this.ctx.currentTime);
    riverFilter.Q.setValueAtTime(1.0, this.ctx.currentTime);

    const riverLFO = this.ctx.createOscillator();
    const riverLFOGain = this.ctx.createGain();
    riverLFO.frequency.setValueAtTime(0.07, this.ctx.currentTime);
    riverLFOGain.gain.setValueAtTime(90, this.ctx.currentTime);
    riverLFO.connect(riverLFOGain);
    riverLFOGain.connect(riverFilter.frequency);
    riverLFO.start();

    const riverGainNode = this.ctx.createGain();
    riverGainNode.gain.setValueAtTime(0.45, this.ctx.currentTime);

    riverSource.connect(riverFilter);
    riverFilter.connect(riverGainNode);
    riverGainNode.connect(this.windGain);
    riverSource.start();

    this._windNodes.push(
      windSource, windFilter, windLFO, windLFOGain, windGainNode,
      riverSource, riverFilter, riverLFO, riverLFOGain, riverGainNode
    );
  },

  _teardownWind() {
    if (!this._windNodes.length) return;
    const oldNodes = [...this._windNodes];
    this._windNodes = [];
    oldNodes.forEach(node => {
      try {
        if (typeof node.stop === 'function') node.stop();
        if (typeof node.disconnect === 'function') node.disconnect();
      } catch {}
    });
  },

  // ---------------- Angelic Wind Chimes Loop ----------------
  _startChimeLoop() {
    if (this._chimeTimer) {
      clearTimeout(this._chimeTimer);
      this._chimeTimer = null;
    }

    const trigger = () => {
      if (this.isPlaying && (this.mode === 'crystal' || this.mode === 'chimes' || this.mode === 'binaural')) {
        if (Math.random() < 0.72) {
          const solf = SOLFEGGIO_FREQUENCIES[this.solfeggio] || SOLFEGGIO_FREQUENCIES['432'];
          const scale = solf.scale;
          const f = scale[Math.floor(Math.random() * scale.length)];
          this.playChime(f, 0.07);

          if (Math.random() < 0.48) {
            setTimeout(() => {
              if (this.isPlaying && this.mode !== 'silent') {
                const f2 = scale[Math.floor(Math.random() * scale.length)];
                this.playChime(f2, 0.05);
              }
            }, 320 + Math.random() * 380);
          }
        }
      }
      this._chimeTimer = setTimeout(trigger, 3800 + Math.random() * 4500);
    };

    this._chimeTimer = setTimeout(trigger, 2500);
  },

  // ---------------- Pure Procedural Musical FX ----------------
  playChime(freq = 528, gainLevel = 0.08) {
    if (!this.ctx) this.init();
    if (!this.ctx || this.mode === 'silent') return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => this.playChime(freq, gainLevel)).catch(() => {});
      return;
    }

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    // Bell overtone harmonic (non-integer metallic partial ratio 2.76)
    const osc2 = this.ctx.createOscillator();
    const g2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2.76, t);
    g2.gain.setValueAtTime(gainLevel * 0.35, t);
    g2.gain.exponentialRampToValueAtTime(0.00001, t + 1.8);
    osc2.connect(g2);

    g.gain.setValueAtTime(gainLevel, t);
    g.gain.exponentialRampToValueAtTime(0.00001, t + 3.4);
    osc.connect(g);

    if (panner) {
      panner.pan.setValueAtTime((Math.random() * 2 - 1) * 0.65, t);
      g.connect(panner);
      g2.connect(panner);
      panner.connect(this.chimeGain);
    } else {
      g.connect(this.chimeGain);
      g2.connect(this.chimeGain);
    }

    osc.start(t);
    osc.stop(t + 3.5);
    osc2.start(t);
    osc2.stop(t + 2.0);
  },

  playBowlGong(freq = 216, gainLevel = 0.18) {
    if (!this.ctx) this.init();
    if (!this.ctx || this.mode === 'silent') return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => this.playBowlGong(freq, gainLevel)).catch(() => {});
      return;
    }

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gainLevel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 5.0);

    // Warm sub-resonance
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(freq / 2, t);
    subGain.gain.setValueAtTime(gainLevel * 0.45, t);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t + 4.0);

    osc.connect(g);
    subOsc.connect(subGain);
    g.connect(this.masterGain);
    subGain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 5.2);
    subOsc.start(t);
    subOsc.stop(t + 4.2);
  },

  playCandleShimmer() {
    this.playChime(880, 0.07);
    setTimeout(() => this.playChime(1320, 0.05), 180);
    setTimeout(() => this.playChime(1760, 0.04), 360);
  },

  playHarmonicChord(freq = 432) {
    this.playBowlGong(freq / 2, 0.16);
    this.playChime(freq, 0.08);
    setTimeout(() => this.playChime(freq * 1.25, 0.06), 150);
    setTimeout(() => this.playChime(freq * 1.5, 0.05), 300);
  },

  playSolfeggioBell(freq = 528) {
    this.playBowlGong(freq / 2, 0.20);
    this.playChime(freq, 0.14);
    setTimeout(() => this.playChime(freq * 1.5, 0.07), 160);
    setTimeout(() => this.playChime(freq * 2.0, 0.05), 320);
  },

  // ---------------- Track & Frequency Selectors ----------------
  setSolfeggio(freqKey) {
    if (!SOLFEGGIO_FREQUENCIES[freqKey]) return;
    this.solfeggio = freqKey;
    this.init();
    if (this.ctx && this.isPlaying) {
      this._buildDrone();
      if (this.binaural !== 'off') this._buildBinaural();
    }
  },

  setBinaural(presetKey) {
    this.binaural = presetKey;
    this.init();
    if (this.ctx && this.isPlaying) {
      this._buildBinaural();
      const t = this.ctx.currentTime;
      if (presetKey === 'off') {
        this.binauralGain.gain.setTargetAtTime(0, t, 0.5);
      } else {
        this.binauralGain.gain.setTargetAtTime(0.25, t, 0.8);
      }
    }
  },

  setMode(mode) {
    this.init();
    this.mode = mode;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    if (mode === 'silent') {
      this.droneGain.gain.setTargetAtTime(0, t, 0.6);
      this.windGain.gain.setTargetAtTime(0, t, 0.6);
      this.binauralGain.gain.setTargetAtTime(0, t, 0.6);
      if (this._chimeTimer) {
        clearTimeout(this._chimeTimer);
        this._chimeTimer = null;
      }
      this.isPlaying = false;
    } else if (mode === 'crystal') {
      this.droneGain.gain.setTargetAtTime(0.24, t, 1.0);
      this.windGain.gain.setTargetAtTime(0.08, t, 1.0);
      this.binauralGain.gain.setTargetAtTime(this.binaural !== 'off' ? 0.22 : 0, t, 1.0);
      this.isPlaying = true;
      this._startChimeLoop();
    } else if (mode === 'breeze') {
      this.droneGain.gain.setTargetAtTime(0.07, t, 1.0);
      this.windGain.gain.setTargetAtTime(0.24, t, 1.0);
      this.binauralGain.gain.setTargetAtTime(0, t, 1.0);
      this.isPlaying = true;
      this._startChimeLoop();
    } else if (mode === 'chimes') {
      this.droneGain.gain.setTargetAtTime(0.10, t, 1.0);
      this.windGain.gain.setTargetAtTime(0.10, t, 1.0);
      this.binauralGain.gain.setTargetAtTime(0, t, 1.0);
      this.isPlaying = true;
      this._startChimeLoop();
    } else if (mode === 'binaural') {
      if (this.binaural === 'off') this.binaural = 'theta';
      this._buildBinaural();
      this.droneGain.gain.setTargetAtTime(0.18, t, 1.0);
      this.windGain.gain.setTargetAtTime(0.06, t, 1.0);
      this.binauralGain.gain.setTargetAtTime(0.28, t, 1.0);
      this.isPlaying = true;
      this._startChimeLoop();
    }
  },

  toggle() {
    if (this.isPlaying) {
      this.setMode('silent');
    } else {
      this.setMode(this.mode === 'silent' ? 'crystal' : this.mode);
    }
    return this.isPlaying;
  },

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.08);
    }
  },

  stop() {
    this.setMode('silent');
    this._teardownDrone();
    this._teardownBinaural();
    this._teardownWind();
    
    if (this._unlockHandler) {
      ['click', 'touchstart', 'keydown', 'pointerdown'].forEach(evt =>
        window.removeEventListener(evt, this._unlockHandler)
      );
      this._unlockHandler = null;
    }
    
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this._unlocked = false;
  }
};

if (typeof window !== 'undefined') {
  window.Soundscape = Soundscape;
}
