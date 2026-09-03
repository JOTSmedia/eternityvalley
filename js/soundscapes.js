// ============================================================
// SOMEWHERE OVER THE RAINBOW BRIDGE — Unified Celestial Soundscape Bridge
// Delegates all audio playback to the master procedural Soundscape engine
// ============================================================
import { Soundscape, SOLFEGGIO_FREQUENCIES, BINAURAL_PRESETS } from './soundscape.js?v=7';

class CelestialAudio {
  constructor() {
    this.engine = Soundscape;
  }

  get ctx() {
    return this.engine.ctx;
  }

  get isPlaying() {
    return this.engine.isPlaying;
  }

  init() {
    this.engine.init();
  }

  startAmbience() {
    this.engine.setMode('breeze');
  }

  playChime(freq = 528, gainLevel = 0.08) {
    this.engine.playChime(freq, gainLevel);
  }

  triggerRandomChime() {
    const solf = SOLFEGGIO_FREQUENCIES[this.engine.solfeggio] || SOLFEGGIO_FREQUENCIES['432'];
    const scale = solf.scale;
    const freq = scale[Math.floor(Math.random() * scale.length)];
    this.playChime(freq, 0.07);
  }

  playBowlGong(freq = 216, gainLevel = 0.18) {
    this.engine.playBowlGong(freq, gainLevel);
  }

  playHarmonicChord(freq = 432) {
    this.engine.playHarmonicChord(freq);
  }
}

export const soundscape = new CelestialAudio();
export { Soundscape, SOLFEGGIO_FREQUENCIES, BINAURAL_PRESETS };
