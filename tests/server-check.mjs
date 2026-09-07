import assert from "node:assert/strict";
import WebSocket from "ws";
import { setTimeout as delay } from "node:timers/promises";
import { PROTOCOL } from "../src/multiplayer/protocol.ts";
const endpoint = process.env.MULTIPLAYER_ENDPOINT || "http://127.0.0.1:8787";
const origin = "https://boostrack.pages.dev";
const sockets = [];
async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await delay(100);
  }
  throw new Error("Timed out waiting for server state");
}
async function connect(code, name) {
  const ws = new WebSocket(
    `${endpoint.replace(/^http/, "ws")}/ws/${code}?name=${name}&v=${PROTOCOL}`,
    { origin },
  );
  sockets.push(ws);
  const client = { ws, messages: [], room: null, id: "" };
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    client.messages.push(m);
    if (m.type === "room") client.room = m;
    if (m.type === "welcome") client.id = m.id;
  });
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  await until(() => client.room);
  return client;
}
const send = (c, message) => c.ws.send(JSON.stringify(message));
try {
  assert.equal((await fetch(`${endpoint}/health`)).status, 200);
  assert.equal(
    (
      await fetch(`${endpoint}/rooms?course=v2-apex-01`, {
        method: "POST",
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(`${endpoint}/rooms?course=missing`, {
        method: "POST",
        headers: { Origin: origin },
      })
    ).status,
    400,
  );
  const response = await fetch(`${endpoint}/rooms?course=v2-apex-01`, {
    method: "POST",
    headers: { Origin: origin },
  });
  assert.equal(response.status, 200);
  const { code } = await response.json();
  const a = await connect(code, "Host"),
    b = await connect(code, "Guest");
  await until(() => a.room.players.length === 2);
  send(b, { type: "start" });
  await delay(100);
  assert.equal(a.room.phase, "lobby");
  send(a, { type: "start" });
  await until(() => a.messages.some((m) => m.type === "error"));
  assert.equal(a.room.phase, "lobby");
  send(a, { type: "ready" });
  send(b, { type: "ready" });
  await until(() => a.room.players.every((p) => p.ready));
  send(a, { type: "start" });
  await until(() => a.room.phase === "race");
  assert.equal(a.room.startAt, b.room.startAt);
  await delay(Math.max(0, a.room.startAt - Date.now() + 100));
  const p = a.room.players.find((p) => p.id === a.id);
  send(a, { type: "pose", p: [4000, 100, 4000], q: p.q });
  await until(() =>
    a.messages.some((m) => m.type === "error" && m.message.includes("동기화")),
  );
  send(a, { type: "recover" });
  await until(() => a.messages.some((m) => m.type === "recover"));
  assert.equal(a.messages.find((m) => m.type === "recover").progress, 0.008);
  a.ws.close();
  await until(() => b.room.players.length === 1 && b.room.host === b.id);
  assert.equal(b.room.players[0].checkpoint, 0);
  assert.equal(b.room.players[0].time, null);
  console.log(
    "PASS: deployed runtime health, CORS, course validation, room join, ready/host authority, synchronized start, teleport rejection, checkpoint recovery and host migration",
  );
} finally {
  for (const ws of sockets) ws.close();
}
