import * as THREE from "three";
import { settings } from "./storage.ts";

// Original, synthesized music. No downloaded recordings or external audio assets.
export class Audio {
  private ctx?: AudioContext;
  private music?: GainNode;
  private sfx?: GainNode;
  private engineGain?: GainNode;
  private engineFilter?: BiquadFilterNode;
  private engineSources: AudioBufferSourceNode[] = [];
  private engineLayers: GainNode[] = [];
  private engineReady?: Promise<void>;
  private rpm = 900;
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
      this.engineGain = this.ctx.createGain();
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = "lowpass";
      this.engineFilter.frequency.value = 700;
      this.engineFilter.Q.value = 0.8;
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.sfx);
      this.engineGain.gain.value = 0;
      this.engineReady = this.loadEngineLoops();
      this.next = this.ctx.currentTime + 0.08;
      this.timer = window.setInterval(() => this.schedule(), 80);
    }
    await this.engineReady;
    await this.ctx.resume();
    this.volumes();
  }
  private async loadEngineLoops() {
    try {
      // The supplied loops are separate engine characters, not RPM layers.
      // Use the longest loop as one strong engine voice and move it through
      // the rev range solely with pitch and filtering.
      const response = await fetch("/audio/engine-loop-0.wav");
      if (!response.ok) throw new Error("engine loop failed to load");
      this.createEngineLayers([
        await this.ctx!.decodeAudioData(await response.arrayBuffer()),
      ]);
    } catch (error) {
      console.warn("Engine sound loops could not be loaded", error);
    }
  }
  private createEngineLayers(buffers: AudioBuffer[]) {
    if (!this.ctx || !this.engineFilter || this.engineSources.length) return;
    const now = this.ctx.currentTime;
    buffers.forEach((buffer) => {
      const source = this.ctx!.createBufferSource();
      const gain = this.ctx!.createGain();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = 0;
      source.loopEnd = buffer.duration;
      gain.gain.setValueAtTime(0, now);
      source.connect(gain);
      gain.connect(this.engineFilter!);
      source.start(now);
      this.engineSources.push(source);
      this.engineLayers.push(gain);
    });
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
    if (this.ctx && this.engineGain && this.engineFilter && this.engineLayers.length) {
      const throttle = Math.max(0, gas);
      // The physics model has no transmission, so create a compact six-speed
      // RPM model from road speed. It drives the pitch of one engine loop.
      const gear = speed < 8 ? 1 : Math.min(6, Math.floor((speed - 8) / 34) + 1);
      const gearSpeed = Math.max(0, speed - 8 - (gear - 1) * 34);
      const gearProgress = THREE.MathUtils.clamp(gearSpeed / 34, 0, 1);
      const targetRpm = 920 + gearProgress * 6750 * (0.58 + throttle * 0.42);
      this.rpm += (targetRpm - this.rpm) * 0.11;

      this.engineLayers[0].gain.setTargetAtTime(1, this.ctx.currentTime, 0.04);
      this.engineSources[0].playbackRate.setTargetAtTime(
        THREE.MathUtils.clamp(0.78 + ((this.rpm - 900) / 6750) * 0.72, 0.78, 1.5),
        this.ctx.currentTime,
        0.055,
      );
      this.engineFilter.frequency.setTargetAtTime(
        750 + this.rpm * 0.82 + throttle * 950,
        this.ctx.currentTime,
        0.08,
      );
      this.engineGain!.gain.setTargetAtTime(
        0.2 + throttle * 0.26 + Math.min(0.08, Math.abs(slip) * 0.14),
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
    this.engineSources.forEach((source) => source.stop());
    void this.ctx?.close();
  }
}
