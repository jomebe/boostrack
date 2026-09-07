import { DurableObject } from "cloudflare:workers";
import * as THREE from "three";
import { COURSES, Track } from "../src/engine/track";
import { crossedGate } from "../src/engine/race";
import { carImpact } from '../src/multiplayer/impact';
import {
  PROTOCOL,
  type Racer,
  type RoomState,
} from "../src/multiplayer/protocol";

type Meta = {
  code: string;
  course: string;
  host: string;
  phase: RoomState["phase"];
  startAt: number;
  expires: number;
  collisions?: boolean;
  protocol?: string;
};
type Session = Racer & {
  last: number;
  received: number;
  window: number;
  packets: number;
  joined: number;
  velocity?: number[];
  protectedUntil?: number;
  impactAt?: number;
};
const colors = [
  "#ed6438",
  "#66a6ff",
  "#d0a1ff",
  "#65d8a4",
  "#ffc562",
  "#f599c6",
];

export class RaceRoom extends DurableObject<Env> {
  private meta?: Meta;
  private track?: Track;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.meta = await ctx.storage.get<Meta>("meta");
      if (this.meta)
        this.track = new Track(
          COURSES.find((c) => c.id === this.meta!.course)!,
        );
    });
  }
  async initialize(code: string, course: string): Promise<void> {
    if (this.meta) return;
    const meta: Meta = {
      code,
      course,
      host: "",
      phase: "lobby",
      startAt: 0,
      collisions: false,
      protocol: PROTOCOL,
      expires: Date.now() + 1800000,
    };
    await this.ctx.storage.put("meta", meta);
    this.meta = meta;
    this.track = new Track(COURSES.find((c) => c.id === course)!);
    await this.ctx.storage.setAlarm(meta.expires);
  }
  available() {
    return (
      !!this.meta &&
      this.meta.protocol === PROTOCOL &&
      this.meta.phase === "lobby" &&
      this.ctx.getWebSockets().length < 6 &&
      this.meta.expires > Date.now()
    );
  }
  private players(): { ws: WebSocket; data: Session }[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws.readyState === WebSocket.OPEN)
      .map((ws) => ({ ws, data: ws.deserializeAttachment() as Session }));
  }
  private publicPlayer(p: Session): Racer {
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      accent: p.accent,
      spoiler: p.spoiler,
      ready: p.ready,
      checkpoint: p.checkpoint,
      time: p.time,
      dnf: p.dnf,
      p: p.p,
      q: p.q,
    };
  }
  private send(ws: WebSocket, value: unknown) {
    try {
      ws.send(JSON.stringify(value));
    } catch {
      ws.close(1011, "Connection closed");
    }
  }
  private broadcast(value: unknown, except?: WebSocket) {
    for (const ws of this.ctx.getWebSockets())
      if (ws !== except) this.send(ws, value);
  }
  private state() {
    if (!this.meta) return;
    this.broadcast({
      type: "room",
      ...this.meta,
      collisions: this.meta.collisions ?? false,
      serverNow: Date.now(),
      players: this.players().map((p) => this.publicPlayer(p.data)),
    });
  }
  async fetch(request: Request): Promise<Response> {
    if (!this.meta || !this.available())
      return new Response("방이 없거나 이미 출발했거나 가득 찼습니다.", {
        status: 409,
      });
    const url = new URL(request.url);
    if (url.searchParams.get("v") !== PROTOCOL)
      return new Response("새로고침 후 다시 참가해 주세요.", { status: 409 });
    const name =
      (url.searchParams.get("name") || "Racer")
        .replace(/[<>\u0000-\u001f]/g, "")
        .trim()
        .slice(0, 16) || "Racer";
    const pair = new WebSocketPair(),
      ws = pair[1],
      id = crypto.randomUUID();
    const s = this.track!.sample(0.008),
      now = Date.now();
    const used = new Set(this.players().map((p) => p.data.color));
    const data: Session = {
      id,
      name,
      color: /^#[a-f0-9]{6}$/i.test(url.searchParams.get('paint')||'') ? url.searchParams.get('paint')! : colors.find((c) => !used.has(c)) || colors[0],
      accent: /^#[a-f0-9]{6}$/i.test(url.searchParams.get('accent')||'') ? url.searchParams.get('accent')! : '#f3eddd',
      spoiler: url.searchParams.get('spoiler')!=='false',
      ready: false,
      checkpoint: 0,
      time: null,
      dnf: false,
      p: s.p.clone().addScaledVector(s.up, 0.82).toArray(),
      q: s.q.toArray(),
      last: now,
      received: now,
      window: now,
      packets: 0,
      joined: now,
    };
    this.ctx.acceptWebSocket(ws);
    ws.serializeAttachment(data);
    if (!this.meta.host) {
      const meta = { ...this.meta, host: id };
      await this.ctx.storage.put("meta", meta);
      this.meta = meta;
    }
    this.send(ws, { type: "welcome", id });
    this.state();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || raw.length > 2048) {
      ws.close(1009, "Message too large");
      return;
    }
    const p = ws.deserializeAttachment() as Session,
      now = Date.now();
    if (now - p.window > 1000) {
      p.window = now;
      p.packets = 0;
    }
    if (++p.packets > 45) {
      ws.close(1008, "Rate limit");
      return;
    }
    p.received = now;
    ws.serializeAttachment(p);
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(raw);
      if (!m || typeof m !== "object") return;
    } catch {
      ws.close(1003, "Invalid JSON");
      return;
    }
    if (m.type === "ping") {
      this.send(ws, { type: "pong", sent: m.sent, serverNow: now });
      ws.serializeAttachment(p);
      return;
    }
    const meta = this.meta!;
    if(m.type==='course') {
      if(meta.host!==p.id || meta.phase!=='lobby' || !COURSES.some(c=>c.id===m.course))return;
      const next={...meta,course:m.course as string};
      await this.ctx.storage.put('meta',next);this.meta=next;
      this.track=new Track(COURSES.find(c=>c.id===next.course)!);
      for(const player of this.players()){player.data.ready=false;player.ws.serializeAttachment(player.data);}
      this.state();return;
    }
    if (m.type === 'collisions') {
      if (meta.host !== p.id || meta.phase !== 'lobby' || typeof m.enabled !== 'boolean') return;
      const next = { ...meta, collisions: m.enabled };
      await this.ctx.storage.put('meta', next);
      this.meta = next;
      for (const player of this.players()) {
        player.data.ready = false;
        player.ws.serializeAttachment(player.data);
      }
      this.state();
      return;
    }
    if (m.type === "ready" && meta.phase === "lobby") {
      p.ready = !p.ready;
      ws.serializeAttachment(p);
      this.state();
      return;
    }
    if (m.type === "start" && meta.host === p.id && meta.phase === "lobby") {
      const players = this.players();
      if (players.length < 2 || players.some((x) => !x.data.ready)) {
        this.send(ws, {
          type: "error",
          message: "2명 이상 참가하고 모두 준비해야 출발합니다.",
        });
        return;
      }
      const next = {
        ...meta,
        phase: "race" as const,
        startAt: now + 5000,
        expires: now + 305000,
      };
      await this.ctx.storage.put("meta", next);
      this.meta = next;
      for (const [index, player] of players.entries()) {
        const spawn = this.track!.sample(0.008 - (meta.collisions ? Math.floor(index/2)*5/this.track!.length : 0));
        player.data.checkpoint = 0;
        player.data.time = null;
        player.data.dnf = false;
        player.data.last = next.startAt;
        player.data.velocity = [0,0,0];
        player.data.protectedUntil = next.startAt + 2000;
        player.data.impactAt = 0;
        player.data.p = spawn.p
          .clone()
          .addScaledVector(spawn.up, 0.82)
          .addScaledVector(spawn.right, meta.collisions ? (index%2 ? 2.2 : -2.2) : 0)
          .toArray();
        player.data.q = spawn.q.toArray();
        player.ws.serializeAttachment(player.data);
      }
      await this.ctx.storage.setAlarm(next.expires);
      this.state();
      return;
    }
    if (
      m.type === "rematch" &&
      meta.host === p.id &&
      meta.phase === "results"
    ) {
      const next = {
        ...meta,
        phase: "lobby" as const,
        startAt: 0,
        expires: now + 1800000,
      };
      await this.ctx.storage.put("meta", next);
      this.meta = next;
      for (const x of this.players()) {
        x.data.ready = false;
        x.data.dnf = false;
        x.data.time = null;
        x.data.checkpoint = 0;
        x.ws.serializeAttachment(x.data);
      }
      await this.ctx.storage.setAlarm(next.expires);
      this.state();
      return;
    }
    if (
      m.type === "recover" &&
      meta.phase === "race" &&
      now >= meta.startAt &&
      p.time === null &&
      !p.dnf
    ) {
      const progress = p.checkpoint
        ? this.track!.course.checkpoints[p.checkpoint - 1] + 0.002
        : 0.008;
      const s = this.track!.sample(progress);
      p.p = s.p.clone().addScaledVector(s.up, 0.82).toArray();
      p.q = s.q.toArray();
      p.last = now;
      p.velocity = [0,0,0];
      p.protectedUntil = now + 2000;
      ws.serializeAttachment(p);
      this.send(ws, { type: "recover", progress });
      return;
    }
    if (
      m.type !== "pose" ||
      meta.phase !== "race" ||
      now < meta.startAt ||
      p.time !== null ||
      p.dnf
    ) {
      ws.serializeAttachment(p);
      return;
    }
    if (
      !Array.isArray(m.p) ||
      m.p.length !== 3 ||
      !m.p.every(
        (v) =>
          typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 5000,
      ) ||
      !Array.isArray(m.q) ||
      m.q.length !== 4 ||
      !m.q.every(
        (v) =>
          typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1.01,
      )
    )
      return;
    const position = new THREE.Vector3().fromArray(m.p),
      previous = new THREE.Vector3().fromArray(p.p);
    const elapsed = (now - p.last) / 1000;
    if (elapsed < 0.035) {
      ws.serializeAttachment(p);
      return;
    }
    // Casual race validation: bounded motion + server-observed ordered gate crossings.
    // This does not claim to replace a fully authoritative anti-cheat physics server.
    if (
      position.distanceTo(previous) > Math.min(2, elapsed) * 115 + 4 ||
      position.y > 130 ||
      position.y < -20
    ) {
      this.send(ws, {
        type: "error",
        message: "위치 동기화가 어긋났습니다. T로 복귀해 주세요.",
      });
      ws.serializeAttachment(p);
      return;
    }
    const gate = this.track!.course.checkpoints[p.checkpoint];
    let changed = false;
    if (
      gate !== undefined &&
      crossedGate(
        previous,
        position,
        this.track!.sample(gate),
        this.track!.course.width,
      )
    ) {
      p.checkpoint++;
      changed = true;
    }
    if (
      p.checkpoint === this.track!.course.checkpoints.length &&
      crossedGate(
        previous,
        position,
        this.track!.sample(0),
        this.track!.course.width,
      )
    ) {
      p.time = (now - meta.startAt) / 1000;
      changed = true;
    }
    p.velocity = position.clone().sub(previous).divideScalar(elapsed).clampLength(0,115).toArray();
    p.p = m.p;
    p.q = m.q;
    p.last = now;
    ws.serializeAttachment(p);
    if (meta.collisions && p.time === null && elapsed <= .2 && now >= (p.protectedUntil ?? 0) && now-(p.impactAt ?? 0)>180) {
      for (const other of this.players()) {
        const b = other.data;
        if(b.id===p.id || b.time!==null || b.dnf || now-b.last>200 || now<(b.protectedUntil ?? 0) || now-(b.impactAt ?? 0)<=180) continue;
        const velocity = new THREE.Vector3().fromArray(b.velocity ?? [0,0,0]);
        const end = new THREE.Vector3().fromArray(b.p).addScaledVector(velocity,(now-b.last)/1000);
        const impact = carImpact({from:previous.toArray(),to:p.p,q:p.q}, {from:end.clone().addScaledVector(velocity,-elapsed).toArray(),to:end.toArray(),q:b.q},elapsed);
        if (!impact) continue;
        p.impactAt = b.impactAt = now;
        ws.serializeAttachment(p);
        other.ws.serializeAttachment(b);
        this.send(ws,{type:'impact',velocity:impact.map(v=>-v)});
        this.send(other.ws,{type:'impact',velocity:impact});
        break;
      }
    }
    this.broadcast(
      {
        type: "pose",
        id: p.id,
        p: p.p,
        q: p.q,
        checkpoint: p.checkpoint,
        serverNow: now,
      },
      ws,
    );
    if (changed) {
      await this.completeIfDone();
      this.state();
    }
  }
  private async completeIfDone() {
    const players = this.players();
    if (
      this.meta?.phase === "race" &&
      players.every((p) => p.data.time !== null || p.data.dnf)
    ) {
      const next = {
        ...this.meta,
        phase: "results" as const,
        expires: Date.now() + 1800000,
      };
      await this.ctx.storage.put("meta", next);
      this.meta = next;
      await this.ctx.storage.setAlarm(next.expires);
    } else if (
      this.meta?.phase === "race" &&
      players.some((p) => p.data.time !== null) &&
      this.meta.expires > Date.now() + 45000
    ) {
      const next = { ...this.meta, expires: Date.now() + 45000 };
      await this.ctx.storage.put("meta", next);
      this.meta = next;
      await this.ctx.storage.setAlarm(next.expires);
    }
  }
  async webSocketClose(ws: WebSocket) {
    ws.close();
    if (!this.meta) return;
    const others = this.players().filter((p) => p.ws !== ws);
    if (this.meta.host === (ws.deserializeAttachment() as Session).id) {
      const next = { ...this.meta, host: others[0]?.data.id || "" };
      await this.ctx.storage.put("meta", next);
      this.meta = next;
    }
    await this.completeIfDone();
    this.state();
  }
  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }
  async alarm() {
    if (this.meta?.phase === "race") {
      for (const x of this.players()) {
        if (x.data.time === null) x.data.dnf = true;
        x.ws.serializeAttachment(x.data);
      }
      await this.completeIfDone();
      this.state();
    } else {
      for (const ws of this.ctx.getWebSockets()) ws.close(1000, "Room expired");
      await this.ctx.storage.deleteAll();
      this.meta = undefined;
    }
  }
}

export class MatchQueue extends DurableObject<Env> {
  async enter(
    course: string,
    quick: boolean,
    client: string,
  ): Promise<string | null> {
    const now = Date.now(),
      key = `rate:${client}`;
    const limit = await this.ctx.storage.get<{ time: number; count: number }>(
      key,
    );
    if (limit && now - limit.time < 60000 && limit.count >= 8) return null;
    await this.ctx.storage.put(key, {
      time: limit && now - limit.time < 60000 ? limit.time : now,
      count: limit && now - limit.time < 60000 ? limit.count + 1 : 1,
    });
    const listed = (await this.ctx.storage.get<string[]>("rooms")) || [];
    if (quick)
      for (const code of listed)
        if (await this.env.ROOMS.getByName(code).available()) return code;
    const code = crypto
      .randomUUID()
      .replaceAll("-", "")
      .slice(0, 8)
      .toUpperCase();
    await this.env.ROOMS.getByName(code).initialize(code, course);
    if (quick)
      await this.ctx.storage.put("rooms", [code, ...listed].slice(0, 20));
    if ((await this.ctx.storage.getAlarm()) === null)
      await this.ctx.storage.setAlarm(now + 3600000);
    return code;
  }
  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url),
      origin = request.headers.get("Origin") || "";
    const allowed =
      origin === "https://boostrack.pages.dev" ||
      /^https:\/\/[a-z0-9-]+\.boostrack\.pages\.dev$/.test(origin) ||
      /^http:\/\/(127\.0\.0\.1|localhost):(5173|4173)$/.test(origin);
    const headers = {
      "Access-Control-Allow-Origin": allowed
        ? origin
        : "https://boostrack.pages.dev",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
      "Cache-Control": "no-store",
    };
    if (url.pathname === "/health")
      return Response.json({ ok: true, version: PROTOCOL }, { headers });
    if (!allowed) return new Response("Origin not allowed", { status: 403 });
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    const code = url.pathname.match(/^\/ws\/([A-F0-9]{8})$/)?.[1];
    if (code && request.headers.get("Upgrade")?.toLowerCase() === "websocket")
      return env.ROOMS.getByName(code).fetch(request);
    if (
      request.method === "POST" &&
      (url.pathname === "/rooms" || url.pathname === "/quickmatch")
    ) {
      const course = url.searchParams.get("course");
      if (!COURSES.some((c) => c.id === course))
        return Response.json(
          { error: "올바른 코스를 선택해 주세요." },
          { status: 400, headers },
        );
      const client = request.headers.get("CF-Connecting-IP") || "local";
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(client),
          ),
        ),
      )
        .slice(0, 12)
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
      try {
        const room = await env.QUEUES.getByName('all-courses-v32').enter(
          course!,
          url.pathname === "/quickmatch",
          hash,
        );
        return Response.json(
          room ? { code: room } : { error: "잠시 후 다시 시도해 주세요." },
          { status: room ? 200 : 429, headers },
        );
      } catch (error) {
        console.error("matchmaking failed", error);
        return Response.json(
          { error: "서버 연결에 실패했습니다." },
          { status: 503, headers },
        );
      }
    }
    return new Response("Not found", { status: 404, headers });
  },
} satisfies ExportedHandler<Env>;
