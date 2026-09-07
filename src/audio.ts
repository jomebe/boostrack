import { settings } from "./storage.ts";

// Original, synthesized music. No downloaded recordings or external audio assets.
export class Audio {
  private ctx?: AudioContext;
  private music?: GainNode;
  private sfx?: GainNode;
  private engine?: OscillatorNode;
  private engineGain?: GainNode;
  private timer?: number;
  private step = 0;
  private next = 0;
  private mode = 0;
  async start() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.music = this.ctx.createGain();
      this.sfx = this.ctx.createGain();
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.connect(this.ctx.destination);
      this.music.connect(compressor);
      this.sfx.connect(compressor);
      this.engine = this.ctx.createOscillator();
      this.engine.type = "sawtooth";
      this.engineGain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 280;
      this.engine.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.sfx);
      this.engineGain.gain.value = 0;
      this.engine.start();
      this.next = this.ctx.currentTime + 0.08;
      this.timer = window.setInterval(() => this.schedule(), 80);
    }
    await this.ctx.resume();
    this.volumes();
  }
  volumes() {
    if (this.ctx) {
      this.music!.gain.setTargetAtTime(
        settings.music * 0.15,
        this.ctx.currentTime,
        0.25,
      );
      this.sfx!.gain.setTargetAtTime(settings.sfx, this.ctx.currentTime, 0.15);
    }
  }
  scene(mode: number) {
    this.mode = mode;
    this.step = 0;
  }
  suspend() {
    void this.ctx?.suspend();
  }
  drive(speed: number, gas: number, slip: number) {
    if (this.ctx && this.engine) {
      this.engine.frequency.setTargetAtTime(
        40 + (speed % 55) * 1.1 + speed * 0.28,
        this.ctx.currentTime,
        0.07,
      );
      this.engineGain!.gain.setTargetAtTime(
        gas === 0 && speed < 2
          ? 0
          : 0.016 +
              Math.abs(gas) * 0.025 +
              Math.min(0.018, Math.abs(slip) * 0.02),
        this.ctx.currentTime,
        0.12,
      );
    }
  }
  beep(kind: "checkpoint" | "finish" | "count" | "impact") {
    if (!this.ctx) return;
    const frequency =
      kind === "finish"
        ? 880
        : kind === "checkpoint"
          ? 660
          : kind === "impact"
            ? 75
            : 440;
    this.note(frequency, this.ctx.currentTime, 0.2, 0.12, "sine", this.sfx!);
    if (kind === "finish")
      for (let i = 1; i < 4; i++)
        this.note(
          440 * [1, 1.25, 1.5, 2][i],
          this.ctx.currentTime + i * 0.13,
          0.4,
          0.1,
          "triangle",
          this.sfx!,
        );
  }
  private note(
    freq: number,
    time: number,
    length: number,
    level: number,
    type: OscillatorType,
    bus: GainNode,
  ) {
    const osc = this.ctx!.createOscillator(),
      gain = this.ctx!.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(time);
    osc.stop(time + length + 0.02);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
  private schedule() {
    if (!this.ctx || this.ctx.state !== "running") return;
    if (this.next < this.ctx.currentTime)
      this.next = this.ctx.currentTime + 0.03;
    const beat = 60 / (this.mode === 0 ? 100 : this.mode === 3 ? 136 : 128) / 4;
    while (this.next < this.ctx.currentTime + 0.2) {
      const chord = [0, 5, 3, 7][Math.floor(this.step / 32) % 4],
        base = 55 * 2 ** (chord / 12),
        arp = [0, 7, 12, 7, 3, 7, 10, 7][this.step % 8];
      if (this.step % 2 === 0)
        this.note(
          base * 4 * 2 ** (arp / 12),
          this.next,
          beat * 1.5,
          0.12,
          "triangle",
          this.music!,
        );
      if (this.step % 4 === 0)
        this.note(base, this.next, beat * 3, 0.3, "sine", this.music!);
      if (this.mode > 0) {
        if (this.step % 4 === 0)
          this.note(45, this.next, 0.11, 0.7, "sine", this.music!);
        if (this.step % 4 === 2)
          this.note(
            1500 + (this.step % 3) * 400,
            this.next,
            0.035,
            0.045,
            "square",
            this.music!,
          );
        if (this.step % 8 === 4)
          this.note(130, this.next, 0.06, 0.16, "triangle", this.music!);
      }
      this.next += beat;
      this.step++;
    }
  }
  dispose() {
    if (this.timer) clearInterval(this.timer);
    void this.ctx?.close();
  }
}
