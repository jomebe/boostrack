import * as THREE from 'three';
import { COURSES, Track } from './track.ts';
import { crossedGate } from './race.ts';

export const RANKING_SEASON = 's4';
export interface RankingRun {
  track: string;
  nickname: string;
  time: number;
  captureVersion: 1;
  splits: number[];
  frames: { t: number; p: number[]; q: number[]; s: number }[];
}

// Route/speed sanity checks, not an authoritative physics replay or anti-cheat.
export function validateRankingRun(value: unknown): value is RankingRun {
  if (!value || typeof value !== 'object') return false;
  const run = value as RankingRun;
  const course = COURSES.find(c => c.id === run.track);
  if(run.captureVersion!==1 || !Array.isArray(run.splits) || !run.splits.every(Number.isFinite)) return false;
  if (!course || typeof run.nickname !== 'string' || !/^[\p{L}\p{N} _.-]{2,16}$/u.test(run.nickname) ||
      !Number.isFinite(run.time) || run.time < 20 || run.time > 600 ||
      !Array.isArray(run.frames) || run.frames.length < 100 || run.frames.length > 18002) return false;
  const track = new Track(course), gates = [...course.checkpoints, 0].map(t => track.sample(t));
  let previous = track.sample(.008).p.clone().addScaledVector(track.sample(.008).up, .7);
  let last = 0, checkpoint = 0;
  for (const frame of run.frames) {
    if (!frame || !Number.isFinite(frame.t) || frame.t <= last || frame.t - last > .05 ||
        !Array.isArray(frame.p) || frame.p.length !== 3 || !frame.p.every(n => Number.isFinite(n) && Math.abs(n) < 5000)) return false;
    if (!Array.isArray(frame.q) || frame.q.length !== 4 || !frame.q.every(n => Number.isFinite(n) && Math.abs(n) <= 1.05) || Math.abs(Math.hypot(...frame.q)-1)>.01) return false;
    if (!Number.isFinite(frame.s) || Math.abs(frame.s) > 1.5) return false;
    const current = new THREE.Vector3().fromArray(frame.p);
    if (current.distanceTo(previous) > 115 * (frame.t - last) + .15 || current.y < -10 || current.y > 130) return false;
    if (checkpoint < gates.length && crossedGate(previous, current, gates[checkpoint], course.width)) {
      if(checkpoint<course.checkpoints.length && Math.abs((run.splits[checkpoint] ?? -100)-frame.t)>.05)return false;
      checkpoint++;
    }
    // A submitted time must end at the first valid finish crossing, not after it.
    if (checkpoint === gates.length && frame !== run.frames[run.frames.length - 1]) return false;
    previous = current;
    last = frame.t;
  }
  return checkpoint === gates.length && run.splits.length===course.checkpoints.length && Math.abs(last - run.time) < .001;
}
