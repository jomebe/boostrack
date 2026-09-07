export const PROTOCOL = "boostrack-3.2";
export interface Racer {
  id: string;
  name: string;
  color: string;
  accent?: string;
  spoiler?: boolean;
  ready: boolean;
  checkpoint: number;
  time: number | null;
  dnf: boolean;
  p: number[];
  q: number[];
}
export interface RoomState {
  type: "room";
  code: string;
  course: string;
  host: string;
  phase: "lobby" | "race" | "results";
  startAt: number;
  serverNow: number;
  collisions: boolean;
  players: Racer[];
}
export type ServerMessage =
  | { type: 'impact'; velocity: number[] }
  | RoomState
  | { type: "welcome"; id: string }
  | {
      type: "pose";
      id: string;
      p: number[];
      q: number[];
      checkpoint: number;
      serverNow: number;
    }
  | { type: "pong"; sent: number; serverNow: number }
  | { type: "error"; message: string }
  | { type: "recover"; progress: number };
