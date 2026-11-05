// Tiny synthesized sound effects (Web Audio). No audio files, nothing to download. Volume comes from the player's setting.
export class Sfx {
  constructor(volume = 0.7, enabled = true) { this.vol = Math.max(0, Math.min(1, volume)) * 0.6; this.enabled = enabled; this.ctx = null; }
  setEnabled(on) { this.enabled = !!on; }
  _ready() {
    if (!this.enabled || this.vol <= 0) return false;
    if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false; this.ctx = new AC(); }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return true;
  }
  tone(f0, dur, { type = 'sine', gain = 0.25, f1 = null, delay = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain * this.vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.03);
  }
  play(name) {
    if (!this._ready()) return;
    switch (name) {
      case 'select': this.tone(660, 0.07, { type: 'triangle', gain: 0.18 }); break;
      case 'slide': this.tone(220, 0.1, { type: 'triangle', f1: 140, gain: 0.22 }); break;
      case 'turn': this.tone(300, 0.14, { type: 'square', f1: 520, gain: 0.08 }); break;
      case 'jump': this.tone(380, 0.14, { type: 'triangle', f1: 640, gain: 0.14 }); break;
      case 'bump': this.tone(90, 0.12, { type: 'sine', gain: 0.35 }); break;
      case 'undo': this.tone(520, 0.12, { type: 'triangle', f1: 300, gain: 0.18 }); break;
      case 'plateOn': this.tone(660, 0.18, { gain: 0.25 }); this.tone(990, 0.3, { gain: 0.2, delay: 0.1 }); break;
      case 'plateOff': this.tone(440, 0.18, { type: 'triangle', f1: 300, gain: 0.18 }); break;
      case 'portalOpen': this.tone(330, 0.5, { type: 'triangle', f1: 990, gain: 0.25 }); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, { gain: 0.25, delay: i * 0.11 })); break;
      default: break;
    }
  }
  dispose() { this.ctx?.close().catch(() => {}); this.ctx = null; }
}
