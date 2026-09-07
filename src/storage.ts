import type { RecordRun } from "./engine/race.ts";
export type CameraMode = 'chase' | 'bumper' | 'hood' | 'top';

export interface Settings {
  music: number;
  sfx: number;
  quality: "high" | "low";
  ghost: boolean;
  camera: CameraMode;
  paint: string;
  accent: string;
  spoiler: boolean;
}
export const settings: Settings = {
  music: 0.35,
  sfx: 0.65,
  quality: "high",
  ghost: true,
  camera: 'chase',
  paint: '#f36a3e',
  accent: '#f3eddd',
  spoiler: true,
};
export let storageAvailable = true;
try {
  Object.assign(
    settings,
    JSON.parse(localStorage.getItem("boostrack.v2.settings") || "{}"),
  );
} catch {
  storageAvailable = false;
}
if (!['chase','bumper','hood','top'].includes(settings.camera)) settings.camera='chase';
if(!/^#[a-f0-9]{6}$/i.test(settings.paint))settings.paint='#f36a3e';
if(!/^#[a-f0-9]{6}$/i.test(settings.accent))settings.accent='#f3eddd';
settings.spoiler=settings.spoiler!==false;
export function saveSettings() {
  try {
    localStorage.setItem("boostrack.v2.settings", JSON.stringify(settings));
  } catch {
    storageAvailable = false;
  }
}
export function loadRecord(id: string): RecordRun | undefined {
  try {
    const run = JSON.parse(
      localStorage.getItem(`boostrack.v2.${id}`) || "null",
    );
    if (
      run?.version === 2 &&
      Number.isFinite(run.time) &&
      Array.isArray(run.frames) &&
      Array.isArray(run.splits)
    )
      return run;
  } catch {
    storageAvailable = false;
  }
}
export function saveRecord(id: string, run: RecordRun): boolean {
  try {
    localStorage.setItem(`boostrack.v2.${id}`, JSON.stringify(run));
    return true;
  } catch {
    storageAvailable = false;
    return false;
  }
}
