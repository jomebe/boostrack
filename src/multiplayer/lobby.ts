import { COURSES } from "../engine/track.ts";
import { formatTime } from "../engine/race.ts";
import { $ } from "../ui.ts";
import { Multiplayer } from "./client.ts";
import type { RoomState } from "./protocol.ts";

export class Lobby {
  constructor(
    private net: Multiplayer,
    selected: () => number,
    private exit: () => void,
  ) {
    document.getElementById("app")!.insertAdjacentHTML(
      "beforeend",
      `
      <div id="multiplayer" class="overlay" hidden><section class="dialog multiplayer-dialog" role="dialog" aria-modal="true" aria-labelledby="multi-title">
        <span class="eyebrow">LIVE / 2–6 RACERS</span><h2 id="multi-title">RACE TOGETHER.</h2>
        <div id="multi-entry"><label class="setting">닉네임 <input id="nickname" maxlength="16" value="Racer" autocomplete="nickname"></label>
          <p id="multi-course"></p><button id="quick-match" class="primary">전체 맵 빠른 참가 <span>↗</span></button>
          <button id="create-room" class="secondary">방 만들기</button>
          <label class="setting">방 코드 <input id="join-code" maxlength="8" placeholder="8자리 코드" autocapitalize="characters" spellcheck="false"></label>
          <button id="join-room" class="secondary">코드로 참가</button></div>
        <div id="multi-room" hidden><p>ROOM <b id="room-code"></b> <button id="copy-code" class="text-button">코드 복사</button></p>
          <label class="setting">레이스 코스 <select id="room-course">${COURSES.map(c=>`<option value="${c.id}">${c.name}</option>`).join("")}</select></label><label class="setting">차량 간 충돌 <select id="room-collisions"><option value="off">비허용 · 통과</option><option value="on">허용 · 부딪히면 반동</option></select></label><p id="collision-note" class="settings-note"></p><div id="room-players"></div><p class="settings-note">모두 준비하면 방장이 출발시킬 수 있습니다.<br>충돌 설정은 대기실에서 방장만 변경할 수 있습니다.<br>첫 완주 후 45초에 경기가 종료됩니다.</p>
          <button id="ready-room" class="primary">준비</button><button id="start-room" class="secondary">레이스 시작 (방장)</button></div>
        <p id="multi-error" role="status"></p><button id="leave-room" class="text-button">← 나가기</button>
      </section></div>`,
    );
    $("multiplayer-open").onclick = () => {
      $("multiplayer").hidden = false;
      $("multi-course").textContent =
        `선택한 코스: ${COURSES[selected()].name}`;
      $("nickname").focus();
    };
    for (const [id, mode] of [
      ["quick-match", "quick"],
      ["create-room", "create"],
      ["join-room", "join"],
    ] as const) {
      $(id).onclick = async () => {
        this.busy(true);
        this.error("연결 중…");
        try {
          await net.connect(
            mode,
            COURSES[selected()].id,
            $<HTMLInputElement>("nickname").value,
            $<HTMLInputElement>("join-code").value,
          );
          this.error("");
        } catch (e) {
          this.error(e instanceof Error ? e.message : "연결 실패");
        } finally {
          this.busy(false);
        }
      };
    }
    $('room-course').onchange=()=>net.send({type:'course',course:$<HTMLSelectElement>('room-course').value});
    $("leave-room").onclick = () => this.exit();
    $("ready-room").onclick = () => net.send({ type: "ready" });
    $("start-room").onclick = () => net.send({ type: "start" });
    $('room-collisions').onchange = () => net.send({type:'collisions',enabled:$<HTMLSelectElement>('room-collisions').value==='on'});
    $("copy-code").onclick = () =>
      void navigator.clipboard.writeText(net.room?.code || "").then(
        () => this.error("코드를 복사했습니다."),
        () => this.error("위의 코드를 직접 복사해 주세요."),
      );
  }
  private busy(busy: boolean) {
    for (const id of ["quick-match", "create-room", "join-room", "leave-room"])
      $<HTMLButtonElement>(id).disabled = busy;
  }
  error(message: string) {
    $("multi-error").textContent = message;
  }
  close() {
    $("multiplayer").hidden = true;
    $("multi-entry").hidden = false;
    $("multi-room").hidden = true;
    this.error("");
  }
  update(room: RoomState) {
    $("multi-entry").hidden = true;
    $("multi-room").hidden = false;
    $("room-code").textContent = room.code;
    $<HTMLSelectElement>("room-course").value=room.course;
    $<HTMLSelectElement>("room-course").disabled=room.host!==this.net.id || room.phase!=="lobby";
    const me = room.players.find((p) => p.id === this.net.id);
    $("ready-room").textContent = me?.ready ? "준비 취소" : "준비";
    $("start-room").hidden = room.host !== this.net.id;
    $<HTMLSelectElement>('room-collisions').value = room.collisions ? 'on' : 'off';
    $<HTMLSelectElement>('room-collisions').disabled = room.host !== this.net.id || room.phase !== 'lobby';
    $('collision-note').textContent = room.collisions ? '충돌 허용 · 출발/복귀 후 2초 보호 · 설정 변경 시 준비 해제' : '충돌 비허용 · 차량끼리 통과합니다.';
    $<HTMLButtonElement>("start-room").disabled =
      room.players.length < 2 || room.players.some((p) => !p.ready);
    this.rows("room-players", room);
  }
  rows(id: string, room: RoomState) {
    const container = $(id);
    container.replaceChildren();
    const players = [...room.players].sort(
      (a, b) =>
        (a.time ?? Infinity) - (b.time ?? Infinity) ||
        Number(a.dnf) - Number(b.dnf) ||
        b.checkpoint - a.checkpoint,
    );
    for (const [i, p] of players.entries()) {
      const row = document.createElement("div");
      row.className = "racer-row";
      const name = document.createElement("span");
      name.textContent = `${i + 1}. ${p.name}${p.id === this.net.id ? " (나)" : ""}${p.id === room.host ? " ♛" : ""}`;
      name.style.borderColor = p.color;
      const status = document.createElement("b");
      status.textContent =
        room.phase === "lobby"
          ? p.ready
            ? "READY"
            : "대기"
          : p.time !== null
            ? formatTime(p.time)
            : p.dnf
              ? "DNF"
              : `CP ${p.checkpoint}`;
      row.append(name, status);
      container.append(row);
    }
  }
}
