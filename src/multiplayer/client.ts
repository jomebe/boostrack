import { settings } from '../storage.ts';
import {
  PROTOCOL,
  type Racer,
  type RoomState,
  type ServerMessage,
} from "./protocol.ts";

export class Multiplayer {
  room?: RoomState;
  id = "";
  ping = 0;
  offset = 0;
  onRoom: (room: RoomState) => void = () => {};
  onStart: (room: RoomState) => void = () => {};
  onPose: (racers: Racer[]) => void = () => {};
  onError: (message: string) => void = () => {};
  onRecover: (progress: number) => void = () => {};
  onImpact: (velocity: number[]) => void = () => {};
  onClose: () => void = () => {};
  private socket?: WebSocket;
  private pingTimer?: number;
  private lastSend = 0;
  private started = 0;
  private intentional = false;
  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }
  get racing() {
    return this.room?.phase === "race";
  }
  get serverTime() {
    return Date.now() + this.offset;
  }
  async connect(
    mode: "create" | "quick" | "join",
    course: string,
    name: string,
    code = "",
  ) {
    this.leave();
    this.intentional = false;
    this.started = 0;
    const endpoint =
      import.meta.env.VITE_MULTIPLAYER_URL ||
      (import.meta.env.DEV
        ? "http://127.0.0.1:8787"
        : "https://boostrack-multiplayer.valorant.workers.dev");
    if (mode !== "join") {
      const response = await fetch(
        `${endpoint}/${mode === "quick" ? "quickmatch" : "rooms"}?course=${encodeURIComponent(course)}`,
        { method: "POST", signal: AbortSignal.timeout(12000) },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "방을 만들 수 없습니다.");
      code = result.code;
    }
    code = code.trim().toUpperCase();
    if (!/^[A-F0-9]{8}$/.test(code))
      throw new Error("8자리 방 코드를 입력해 주세요.");
    const url = new URL(`/ws/${code}`, endpoint);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("name", name.slice(0, 16) || "Racer");
    url.searchParams.set("v", PROTOCOL);
    url.searchParams.set('paint',settings.paint);
    url.searchParams.set('accent',settings.accent);
    url.searchParams.set('spoiler',String(settings.spoiler));
    const socket = (this.socket = new WebSocket(url));
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error("서버 응답이 없습니다. 다시 시도해 주세요."));
      }, 12000);
      socket.onopen = () => {
        clearTimeout(timeout);
        resolve();
        this.send({ type: "ping", sent: Date.now() });
        this.pingTimer = window.setInterval(
          () => this.send({ type: "ping", sent: Date.now() }),
          3000,
        );
      };
      socket.onerror = () => {
        clearTimeout(timeout);
        reject(
          new Error(
            "방에 연결할 수 없습니다. 코드·진행 상태·네트워크를 확인해 주세요.",
          ),
        );
      };
      socket.onclose = () => {
        clearTimeout(timeout);
        clearInterval(this.pingTimer);
        if (!this.intentional) {
          this.onError(
            "연결이 종료됐습니다. 멀티 메뉴에서 다시 참가해 주세요.",
          );
          this.onClose();
        }
        this.room = undefined;
      };
      socket.onmessage = (event) =>
        this.receive(JSON.parse(event.data) as ServerMessage);
    });
  }
  private receive(message: ServerMessage) {
    if (message.type === 'impact') {
      if (this.room?.collisions && this.racing) this.onImpact(message.velocity);
      return;
    }
    if (message.type === "welcome") {
      this.id = message.id;
      return;
    }
    if (message.type === "error") {
      this.onError(message.message);
      return;
    }
    if (message.type === "pong") {
      this.ping = Math.max(0, Date.now() - message.sent);
      this.offset = message.serverNow + this.ping / 2 - Date.now();
      return;
    }
    if (message.type === "recover") {
      this.onRecover(message.progress);
      return;
    }
    if (message.type === "pose") {
      const p = this.room?.players.find((p) => p.id === message.id);
      if (p) {
        p.p = message.p;
        p.q = message.q;
        p.checkpoint = message.checkpoint;
        this.onPose(this.room!.players.filter((p) => p.id !== this.id));
      }
      return;
    }
    this.room = message;
    if (this.started === 0) this.offset = message.serverNow - Date.now();
    this.onRoom(message);
    this.onPose(message.players.filter((p) => p.id !== this.id));
    if (message.phase === "lobby") this.started = 0;
    if (message.phase === "race" && this.started !== message.startAt) {
      this.started = message.startAt;
      this.onStart(message);
    }
  }
  send(value: unknown) {
    if (this.connected && this.socket!.bufferedAmount < 16000)
      this.socket!.send(JSON.stringify(value));
  }
  pose(p: number[], q: number[]) {
    if (performance.now() - this.lastSend < 50) return;
    this.lastSend = performance.now();
    this.send({ type: "pose", p, q });
  }
  leave() {
    this.intentional = true;
    clearInterval(this.pingTimer);
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
    }
    this.socket = undefined;
    this.room = undefined;
    this.id = "";
  }
}
