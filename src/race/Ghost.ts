import * as THREE from 'three';

export interface GhostFrame {
  t: number;
  position: [number, number, number];
  rotation: [number, number, number, number];
}

export interface GhostRun {
  time: number;
  frames: GhostFrame[];
  splits: number[];
}

export class GhostRecorder {
  frames: GhostFrame[] = [];
  private nextSample = 0;

  reset(): void {
    this.frames = [];
    this.nextSample = 0;
  }

  record(t: number, object: THREE.Object3D): void {
    if (t < this.nextSample) return;
    this.nextSample = t + 0.08;
    this.frames.push({
      t,
      position: object.position.toArray() as [number, number, number],
      rotation: object.quaternion.toArray() as [number, number, number, number],
    });
  }
}

export class GhostPlayer {
  private run: GhostRun | null = null;
  private cursor = 0;

  constructor(readonly object: THREE.Object3D) {
    object.visible = false;
  }

  setRun(run: GhostRun | null): void {
    this.run = run;
    this.cursor = 0;
    this.object.visible = Boolean(run?.frames.length);
  }

  reset(): void {
    this.cursor = 0;
    this.object.visible = Boolean(this.run?.frames.length);
  }

  update(time: number): void {
    const frames = this.run?.frames;
    if (!frames?.length) return;
    while (this.cursor < frames.length - 2 && frames[this.cursor + 1].t < time) this.cursor += 1;
    const a = frames[this.cursor];
    const b = frames[Math.min(this.cursor + 1, frames.length - 1)];
    const alpha = Math.min(1, Math.max(0, (time - a.t) / Math.max(0.001, b.t - a.t)));
    this.object.position.fromArray(a.position).lerp(new THREE.Vector3().fromArray(b.position), alpha);
    this.object.quaternion.fromArray(a.rotation).slerp(new THREE.Quaternion().fromArray(b.rotation), alpha);
    if (time > frames[frames.length - 1].t + 0.25) this.object.visible = false;
  }
}
