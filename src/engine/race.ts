import * as THREE from "three";
import { Track, type TrackSample } from "./track.ts";

export interface GhostFrame {
  t: number;
  p: number[];
  q: number[];
  s?: number;
}
export interface RecordRun {
  version: 2;
  captureVersion?: 1;
  time: number;
  splits: number[];
  frames: GhostFrame[];
  date: string;
}

export function crossedGate(
  previous: THREE.Vector3,
  current: THREE.Vector3,
  gate: TrackSample,
  width: number,
): boolean {
  const a = previous.clone().sub(gate.p),
    b = current.clone().sub(gate.p);
  const d0 = a.dot(gate.forward),
    d1 = b.dot(gate.forward);
  if (d0 >= 0 || d1 < 0 || d1 - d0 < 0.0001) return false;
  const intersection = a.lerp(b, -d0 / (d1 - d0));
  return (
    Math.abs(intersection.dot(gate.right)) < width / 2 &&
    Math.abs(intersection.dot(gate.up)) < 4
  );
}

export class Race {
  elapsed = 0;
  checkpoint = 0;
  finished = false;
  splits: number[] = [];
  frames: GhostFrame[] = [];
  respawns = 0;
  readonly track: Track;
  constructor(track: Track) {
    this.track = track;
  }
  reset() {
    this.elapsed = 0;
    this.checkpoint = 0;
    this.finished = false;
    this.splits = [];
    this.frames = [];
    this.respawns = 0;
  }
  update(
    dt: number,
    previous: THREE.Vector3,
    current: THREE.Vector3,
    rotation: THREE.Quaternion,
    steering = 0,
  ): "checkpoint" | "finish" | null {
    if (this.finished) return null;
    this.elapsed += dt;
    if (
      this.frames.length === 0 ||
      this.elapsed - this.frames[this.frames.length - 1].t >= 1 / 30 - 0.001
    ) {
      this.frames.push({
        t: this.elapsed,
        p: current.toArray(),
        q: rotation.toArray(),
        s: steering,
      });
    }
    const next = this.track.course.checkpoints[this.checkpoint];
    if (
      next !== undefined &&
      crossedGate(
        previous,
        current,
        this.track.sample(next),
        this.track.course.width,
      )
    ) {
      this.checkpoint++;
      this.splits.push(this.elapsed);
      return "checkpoint";
    }
    if (
      this.checkpoint === this.track.course.checkpoints.length &&
      crossedGate(
        previous,
        current,
        this.track.sample(0),
        this.track.course.width,
      )
    ) {
      this.finished = true;
      if (this.frames[this.frames.length - 1]?.t !== this.elapsed)
        this.frames.push({
          t: this.elapsed,
          p: current.toArray(),
          q: rotation.toArray(),
          s: steering,
        });
      return "finish";
    }
    return null;
  }
  recoverProgress(): number {
    this.respawns++;
    return this.checkpoint
      ? this.track.course.checkpoints[this.checkpoint - 1] + 0.002
      : 0.008;
  }
  record(): RecordRun {
    return {
      version: 2,
      captureVersion: 1,
      time: this.elapsed,
      splits: [...this.splits],
      frames: this.frames,
      date: new Date().toISOString(),
    };
  }
}

export function formatTime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return "—:——.———";
  const ms = Math.max(0, Math.round(seconds * 1000));
  return `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, "0")}:${Math.floor((ms / 1000) % 60)
    .toString()
    .padStart(2, "0")}.${(ms % 1000).toString().padStart(3, "0")}`;
}
