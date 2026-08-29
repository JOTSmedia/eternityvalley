class CelestialAudio {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
  }
  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  
  // Continuous ethereal wind & distant waterfall rumble
  startAmbience() {
    this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.isPlaying) return;
    this.isPlaying = true;
    
    // Wind Noise (Pink Noise approximation)
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.1;
    }
    
    this.windSource = this.ctx.createBufferSource();
    this.windSource.buffer = buffer;
    this.windSource.loop = true;
    
    // Lowpass filter to make it sound like distant, roaring wind and waterfall
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400; // Low frequency rumble
    
    const gain = this.ctx.createGain();
    gain.gain.value = 0.08; // Subtle volume
    
    this.windSource.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    this.windSource.start();
  }

  playChime(freq = 528) { // 528Hz: Love & Miracle frequency
    this.init();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 4.5);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 4.5);
  }
  
  triggerRandomChime() {
    // Pentatonic ethereal scale
    const scale = [432, 528, 639, 741, 852];
    const freq = scale[Math.floor(Math.random() * scale.length)];
    this.playChime(freq);
  }
}

export const soundscape = new CelestialAudio();
