// Tiny WebAudio synth for placeholder sound effects (no asset files needed).
export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.last = Object.create(null);
  }

  /** Must be called from a user gesture (browsers block audio until then). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.5;
      this.out.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  throttle(name, gap) {
    const now = this.ctx.currentTime;
    if (this.last[name] !== undefined && now - this.last[name] < gap) return false;
    this.last[name] = now;
    return true;
  }

  tone(type, f0, f1, dur, vol, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), gn = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, vol, f0, f1) {
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    const gn = c.createGain();
    gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(gn).connect(this.out);
    src.start(t);
    src.stop(t + dur);
  }

  /** Continuous neon-laser hum; level 0..1 (0 = silent). */
  setLaser(level) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (!this.enabled) level = 0;
    if (level > 0 && !this.laserGain) {
      const c = this.ctx;
      this.laserGain = c.createGain();
      this.laserGain.gain.value = 0;
      const filt = c.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 1400;
      for (const [type, f] of [['sawtooth', 110], ['square', 221], ['sine', 880]]) {
        const o = c.createOscillator();
        o.type = type;
        o.frequency.value = f;
        o.connect(filt);
        o.start();
      }
      filt.connect(this.laserGain).connect(this.out);
    }
    if (this.laserGain) this.laserGain.gain.setTargetAtTime(level * 0.05, this.ctx.currentTime, 0.03);
  }

  play(name) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    switch (name) {
      case 'shoot':
        if (this.throttle(name, 0.07)) this.tone('square', 1300, 650, 0.04, 0.02);
        break;
      case 'hit':
        if (this.throttle(name, 0.04)) this.tone('triangle', 420, 240, 0.05, 0.05);
        break;
      case 'explode':
        if (this.throttle(name, 0.05)) {
          this.noise(0.35, 0.22, 1800, 200);
          this.tone('sine', 160, 40, 0.3, 0.15);
        }
        break;
      case 'bigExplode':
        this.noise(0.9, 0.35, 1400, 60);
        this.tone('sine', 90, 25, 0.8, 0.3);
        break;
      case 'playerDie':
        this.noise(1.0, 0.4, 2500, 80);
        this.tone('sawtooth', 500, 40, 0.9, 0.12);
        break;
      case 'power':
        this.tone('sine', 520, 1250, 0.16, 0.12);
        this.tone('sine', 780, 1560, 0.16, 0.08, 0.06);
        break;
      case 'shock':
        this.noise(1.2, 0.45, 3000, 50);
        this.tone('sine', 70, 28, 1.1, 0.35);
        break;
      case 'bombDrop':
        // Release clunk, then the classic falling whistle.
        this.tone('square', 160, 90, 0.06, 0.05);
        this.tone('sine', 1500, 520, 1.0, 0.035, 0.05);
        break;
      case 'enemyShot':
        if (this.throttle(name, 0.09)) this.tone('sine', 700, 360, 0.08, 0.035);
        break;
      case 'charge':
        if (this.throttle(name, 0.15)) this.tone('sawtooth', 180, 720, 0.45, 0.02);
        break;
      case 'snipe':
        if (this.throttle(name, 0.05)) this.tone('square', 1800, 500, 0.06, 0.035);
        break;
      case 'wingBomb':
        this.tone('triangle', 260, 120, 0.12, 0.06);
        break;
      case 'shieldUp':
        this.tone('sine', 300, 900, 0.18, 0.1);
        break;
      case 'shieldDown':
        this.tone('sine', 700, 200, 0.2, 0.08);
        break;
      case 'deflect':
        if (this.throttle(name, 0.05)) this.tone('triangle', 1500, 1100, 0.04, 0.03);
        break;
      case 'laserCharge':
        this.tone('sawtooth', 90, 900, 1.5, 0.05);
        break;
      case 'laserFire':
        this.noise(1.0, 0.3, 3500, 300);
        this.tone('sawtooth', 140, 60, 1.0, 0.12);
        break;
      case 'alarm':
        [0, 0.35, 0.7].forEach((d) => this.tone('square', 660, 440, 0.25, 0.06, d));
        break;
      case 'mortar':
        if (this.throttle(name, 0.08)) {
          this.tone('sine', 180, 60, 0.18, 0.12);
          this.noise(0.12, 0.08, 1200, 300);
        }
        break;
      case 'cannon':
        this.noise(0.7, 0.4, 2200, 60);
        this.tone('sine', 85, 28, 0.6, 0.35);
        break;
      case 'missileLaunch':
        if (this.throttle(name, 0.1)) {
          this.noise(0.35, 0.08, 4000, 800);
          this.tone('sawtooth', 220, 520, 0.3, 0.025);
        }
        break;
      case 'specialCharge':
        if (this.throttle(name, 0.12)) this.tone('triangle', 300, 1200, 0.5, 0.04);
        break;
      case 'playerMissile':
        this.noise(0.25, 0.1, 3000, 600);
        this.tone('triangle', 300, 900, 0.22, 0.05);
        break;
      case 'bounce':
        if (this.throttle(name, 0.06)) this.tone('sine', 220, 90, 0.09, 0.08);
        break;
      case 'split':
        if (this.throttle(name, 0.05)) this.tone('square', 900, 1400, 0.05, 0.03);
        break;
      case 'well':
        if (this.throttle(name, 0.2)) this.tone('sine', 260, 60, 0.6, 0.1);
        break;
      case 'sling':
        this.noise(0.25, 0.12, 2400, 400);
        this.tone('sawtooth', 160, 420, 0.18, 0.04);
        break;
      case 'reflect':
        if (this.throttle(name, 0.05)) this.tone('triangle', 2200, 1600, 0.05, 0.04);
        break;
      case 'extra':
        [660, 880, 1320].forEach((f, i) => this.tone('triangle', f, f, 0.12, 0.1, i * 0.09));
        break;
    }
  }
}
