// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — Web Audio Soundscapes
// Zero external files: 100% procedural Web Audio synthesis
// Crystal singing bowls (432Hz/528Hz), gentle breezes, river murmurs,
// and angelic wind chimes for emotional solace and peace.
// ============================================================
export const Soundscape = {
  ctx: null,
  masterGain: null,
  droneGain: null,
  windGain: null,
  chimeGain: null,
  isPlaying: false,
  mode: 'crystal', // 'crystal', 'breeze', 'chimes', 'silent'
  volume: 0.35,
  _chimeTimer: null,
  _nodes: [],

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      this.ctx = new AudioCtx();
    } catch { return; }

    const unlock = () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      ['click', 'touchstart', 'keydown'].forEach(evt => window.removeEventListener(evt, unlock));
    };
    ['click', 'touchstart', 'keydown'].forEach(evt => window.addEventListener(evt, unlock, { passive: true }));

    // Master bus
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    // Sub-buses
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.droneGain.connect(this.masterGain);

    this.windGain = this.ctx.createGain();
    this.windGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.windGain.connect(this.masterGain);

    this.chimeGain = this.ctx.createGain();
    this.chimeGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
    this.chimeGain.connect(this.masterGain);

    this._buildDrone();
    this._buildWind();
    this._startChimeLoop();
  },

  // ---------------- Crystal Singing Bowls (432Hz & 528Hz) ----------------
  _buildDrone() {
    if (!this.ctx) return;
    // Frequencies: 108Hz (Sub), 216Hz (Ground), 432Hz (Healing root), 528Hz (Love/Miracle), 648Hz (Ethereal 5th)
    const freqs = [108, 216, 432, 528, 648];
    const amps = [0.18, 0.14, 0.22, 0.16, 0.10];

    freqs.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f, this.ctx.currentTime);

      // Gentle detuning for beating acoustic shimmer
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.setValueAtTime(0.08 + idx * 0.03, this.ctx.currentTime);
      lfoGain.gain.setValueAtTime(0.8 + idx * 0.4, this.ctx.currentTime);
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
      this._nodes.push(osc, lfo);
    });
  },

  // ---------------- Gentle Mountain Wind & River Murmur ----------------
  _buildWind() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 3;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + (0.02 * white)) / 1.02; // Pink-ish noise filter
      lastOut = output[i];
      output[i] *= 3.5;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    // Filter to soft atmospheric breeze frequencies
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(260, this.ctx.currentTime);
    filter.Q.setValueAtTime(1.8, this.ctx.currentTime);

    // Modulate filter frequency slowly
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.setValueAtTime(0.12, this.ctx.currentTime);
    lfoGain.gain.setValueAtTime(140, this.ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    whiteNoise.connect(filter);
    filter.connect(this.windGain);
    whiteNoise.start();
    this._nodes.push(whiteNoise, lfo);
  },

  // ---------------- Angelic Wind Chimes ----------------
  _startChimeLoop() {
    const trigger = () => {
      if (this.isPlaying && (this.mode === 'crystal' || this.mode === 'chimes')) {
        if (Math.random() < 0.7) {
          const pentatonic = [528, 594, 660, 792, 880, 1056, 1188, 1320, 1584];
          const f = pentatonic[Math.floor(Math.random() * pentatonic.length)];
          this.playChime(f, 0.06);
          if (Math.random() < 0.45) {
            setTimeout(() => {
              const f2 = pentatonic[Math.floor(Math.random() * pentatonic.length)];
              this.playChime(f2, 0.04);
            }, 350 + Math.random() * 400);
          }
        }
      }
      this._chimeTimer = setTimeout(trigger, 4000 + Math.random() * 5000);
    };
    this._chimeTimer = setTimeout(trigger, 3000);
  },

  // ---------------- Play Individual Musical FX ----------------
  playChime(freq = 528, gainLevel = 0.08) {
    if (!this.ctx) this.init();
    if (!this.ctx || this.ctx.state !== 'running' || this.mode === 'silent') return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const panner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    // Shimmer harmonic overtone
    const osc2 = this.ctx.createOscillator();
    const g2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2.76, t); // Bell harmonic ratio
    g2.gain.setValueAtTime(gainLevel * 0.35, t);
    g2.gain.exponentialRampToValueAtTime(0.00001, t + 1.8);
    osc2.connect(g2);

    g.gain.setValueAtTime(gainLevel, t);
    g.gain.exponentialRampToValueAtTime(0.00001, t + 3.4);

    osc.connect(g);

    if (panner) {
      panner.pan.setValueAtTime((Math.random() * 2 - 1) * 0.6, t);
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

  playBowlGong(freq = 216) {
    if (!this.ctx) this.init();
    if (!this.ctx || this.mode === 'silent') return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 5.0);

    osc.connect(g);
    g.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 5.2);
  },

  playCandleShimmer() {
    this.playChime(880, 0.07);
    setTimeout(() => this.playChime(1320, 0.05), 180);
    setTimeout(() => this.playChime(1760, 0.04), 360);
  },

  playHarmonicChord(freq = 432) {
    this.playBowlGong(freq / 2);
    this.playChime(freq, 0.08);
    setTimeout(() => this.playChime(freq * 1.25, 0.06), 150);
    setTimeout(() => this.playChime(freq * 1.5, 0.05), 300);
  },

  // ---------------- Toggle & Preset Modes ----------------
  setMode(mode) {
    this.init();
    this.mode = mode;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    if (mode === 'silent') {
      this.droneGain.gain.setTargetAtTime(0, t, 0.8);
      this.windGain.gain.setTargetAtTime(0, t, 0.8);
      if (this._chimeTimer) { clearTimeout(this._chimeTimer); this._chimeTimer = null; }
      this.isPlaying = false;
    } else if (mode === 'crystal') {
      this.droneGain.gain.setTargetAtTime(0.24, t, 1.2);
      this.windGain.gain.setTargetAtTime(0.08, t, 1.2);
      this.isPlaying = true;
    } else if (mode === 'breeze') {
      this.droneGain.gain.setTargetAtTime(0.08, t, 1.2);
      this.windGain.gain.setTargetAtTime(0.22, t, 1.2);
      this.isPlaying = true;
    } else if (mode === 'chimes') {
      this.droneGain.gain.setTargetAtTime(0.12, t, 1.2);
      this.windGain.gain.setTargetAtTime(0.12, t, 1.2);
      this.isPlaying = true;
    }
  },

  toggle() {
    if (this.isPlaying) {
      this.setMode('silent');
    } else {
      this.setMode('crystal');
    }
    return this.isPlaying;
  },

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.1);
    }
  },
};

if (typeof window !== 'undefined') {
  window.Soundscape = Soundscape;
}
