export class AudioSystem {
  private context: AudioContext | null = null;
  private engine: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private boostNoise: AudioBufferSourceNode | null = null;

  resume(): void {
    if (!this.context) this.create();
    void this.context?.resume();
  }

  private create(): void {
    this.context = new AudioContext();
    const engine = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    engine.type = 'sawtooth';
    engine.frequency.value = 55;
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    gain.gain.value = 0.025;
    engine.connect(filter).connect(gain).connect(this.context.destination);
    engine.start();
    this.engine = engine;
    this.engineGain = gain;
  }

  update(speedRatio: number, boosting: boolean): void {
    if (!this.context || !this.engine || !this.engineGain) return;
    const now = this.context.currentTime;
    this.engine.frequency.setTargetAtTime(48 + speedRatio * 95 + (boosting ? 28 : 0), now, 0.04);
    this.engineGain.gain.setTargetAtTime(0.02 + speedRatio * 0.035, now, 0.08);
    if (boosting && !this.boostNoise) this.startBoostNoise();
    if (!boosting && this.boostNoise) {
      this.boostNoise.stop();
      this.boostNoise = null;
    }
  }

  beep(frequency = 660, duration = 0.12): void {
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.08, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start();
    oscillator.stop(this.context.currentTime + duration);
  }

  private startBoostNoise(): void {
    if (!this.context) return;
    const length = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    gain.gain.value = 0.018;
    source.connect(filter).connect(gain).connect(this.context.destination);
    source.start();
    this.boostNoise = source;
  }
}
