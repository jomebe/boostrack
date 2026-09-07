import { mountAds } from "./ads.ts";
import { COURSES, Track } from "./engine/track.ts";
import { formatTime } from "./engine/race.ts";
import { settings, loadRecord } from "./storage.ts";

export const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

export function mapPath(track: Track) {
  const ps = track.samples
    .filter((_, i) => i % 4 === 0)
    .map((s) => [s.p.x, s.p.z]);
  const xs = ps.map((p) => p[0]),
    zs = ps.map((p) => p[1]);
  const minX = Math.min(...xs),
    minZ = Math.min(...zs),
    size = Math.max(Math.max(...xs) - minX, Math.max(...zs) - minZ);
  const project = (x: number, z: number) => [
    12 + ((x - minX) / size) * 156,
    12 + ((z - minZ) / size) * 156,
  ];
  return {
    path:
      ps
        .map((p, i) => `${i ? "L" : "M"}${project(p[0], p[1]).join(",")}`)
        .join(" ") + " Z",
    project,
  };
}

export function mountUI() {
  $("app").innerHTML = `
  <canvas id="world" aria-label="3D 레이싱 게임"></canvas>
  <div id="loading"><span class="brand">▰ BOOSTRACK<span class="version">/ 02</span></span><div class="load-line"></div><p id="load-message">엔진과 코스를 준비하고 있습니다</p></div>
  <main id="menu" hidden>
    <header><a class="brand" href="./">▰ BOOSTRACK<span class="version">/ 02</span></a><div class="header-right"><span class="status-dot"></span> TIME ATTACK <button id="settings-open" class="icon-button" aria-label="설정">⚙</button></div></header>
    <section class="menu-content"><div class="eyebrow">NO LIMITS. JUST YOU & THE CLOCK.</div><h1>CHASE<br>THE <em>LIMIT.</em></h1><p class="intro">단 한 번의 완벽한 주행.<br>라인을 찾고, 한계를 넘어, 기록을 깨세요.</p>
      <div class="section-label"><span>SELECT YOUR TRACK</span><span>01 — 05</span></div>
      <div id="courses">${COURSES.map((c, i) => `<button class="course ${i === 0 ? "selected" : ""}" data-course="${i}" aria-pressed="${i === 0}"><span class="course-no">0${i + 1}</span><span class="course-copy"><strong>${c.name}</strong><small>${c.difficulty} <span>·</span> <span id="length-${i}"></span> <span>·</span> 1 LAP</small></span><svg viewBox="0 0 180 180" aria-hidden="true"><path d="${mapPath(new Track(c)).path}"/></svg><span class="course-arrow">↗</span></button>`).join("")}</div>
      <button id="play" class="primary">START ENGINE <span>플레이 <kbd>↵</kbd></span></button>
      <button id="multiplayer-open" class="secondary">MULTIPLAYER <span>빠른 참가 / 방 만들기 ↗</span></button>
      <button id="garage-open" class="secondary">GARAGE <span>차량 커스텀 · 설정 ↗</span></button>
      <button id="ranking-open" class="secondary">WORLD RANKING <span>코스별 세계 랭킹 ↗</span></button>
      <div class="menu-record"><span>PERSONAL BEST</span><b id="menu-pb">—:——.———</b><span class="local-tag">LOCAL</span></div>
    </section>
    <aside class="preview-label"><span class="eyebrow" id="preview-index">01 / SPEED & FLOW</span><h2 id="preview-title">APEX VALLEY</h2><p id="preview-description"></p><div class="medals"><span>◆ GOLD <b id="gold-time"></b></span><span>◆ SILVER <b id="silver-time"></b></span><span>◆ BRONZE <b id="bronze-time"></b></span></div></aside>
    <footer><span><kbd>W A S D</kbd> 주행 <kbd>SPACE</kbd> 브레이크 / 슬라이드</span><span>BUILT FOR THE NEXT RUN <span class="build-tag">V3.1 / ONLINE</span></span></footer>
  </main>
  <div id="hud" hidden>
    <div class="hud-top"><div class="race-title"><span class="brand">▰ BOOSTRACK</span><strong id="race-name"></strong><span id="checkpoint">CHECKPOINT 0 / 3</span></div><div class="timer"><span>TIME ATTACK / 1 LAP</span><b id="timer">00:00.000</b><div id="split">PERSONAL BEST <span id="race-pb"></span></div></div><button id="pause" class="icon-button" aria-label="일시 정지">Ⅱ</button></div>
    <div id="challenger-banner" class="challenger-hud" hidden><span class="challenger-tag">⚔️ 1:1 GHOST BATTLE</span><span id="challenger-name"></span><span id="challenger-delta" class="delta-neutral">0.00s</span></div>
    <div id="countdown" aria-live="polite"></div><div id="toast" role="status"></div>
    <button id="camera-switch" aria-label="카메라 시점 전환">C · 추적</button>
    <div id="online-board" hidden><span id="online-status"></span><div id="online-players"></div><button id="online-leave" class="text-button">경기 나가기</button></div>
    <div class="map-panel"><span>TRACK MAP</span><svg id="minimap" viewBox="0 0 180 180" aria-label="실제 코스 미니맵"><path id="map-line"/><g id="map-gates"></g><circle id="map-player" r="4.5"/></svg><span id="progress">0% COMPLETE</span></div>
    <div class="speed-panel"><span id="car-state">GRIP / ROAD</span><div><b id="speed">000</b><span>KM/H</span></div><div class="rev-track"><i id="rev"></i></div></div>
    <div class="race-controls"><kbd>R</kbd> 처음부터 <kbd>T</kbd> 체크포인트 <kbd>ESC</kbd> 일시 정지</div>
    <div class="touch-controls"><div><button data-key="KeyA" aria-label="왼쪽 조향">◀</button><button data-key="KeyD" aria-label="오른쪽 조향">▶</button></div><div><button data-key="KeyS" aria-label="감속 / 후진">REV</button><button data-key="Space" aria-label="브레이크 / 드리프트">DRIFT</button><button data-key="KeyW" aria-label="가속">GAS</button></div></div>
  </div>
  <div id="overlay" class="overlay" hidden><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><span class="eyebrow" id="dialog-tag">TAKE A BREATH</span><h2 id="dialog-title">PAUSED</h2><div id="result"></div><button id="resume" class="primary">계속 달리기 <span>↗</span></button><button id="restart" class="secondary">다시 도전 <kbd>R</kbd></button><button id="back" class="text-button">← 코스 선택으로</button></section></div>
  <div id="settings" class="overlay" hidden><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title"><span class="eyebrow">MAKE IT YOURS</span><h2 id="settings-title">GARAGE / 설정</h2><div id="garage-preview"><svg viewBox="0 0 220 100" aria-label="차량 색상 미리보기"><path fill="var(--car-paint)" d="M25 65L45 35H120L153 52H186L202 75H20Z"/><path fill="var(--car-accent)" d="M43 57H185V65H32Z"/><path fill="#223d3b" d="M62 38H117L140 52H55Z"/><path id="garage-wing" stroke="var(--car-accent)" stroke-width="7" d="M22 25H56M38 25V45"/><circle cx="53" cy="76" r="15" fill="#17222c"/><circle cx="166" cy="76" r="15" fill="#17222c"/></svg></div><label class="setting">차체 색상 <input id="car-paint" type="color"></label><label class="setting">스트라이프 · 휠 색상 <input id="car-accent" type="color"></label><label class="setting">리어 스포일러 <input id="car-spoiler" type="checkbox"></label><p class="settings-note">외형만 변경되며 성능에는 영향이 없습니다. 멀티 참가 시 다른 플레이어에게도 표시됩니다.</p><label class="setting">음악 <input id="music" type="range" min="0" max="1" step=".05" value="${settings.music}"></label><label class="setting">엔진 / 효과음 <input id="sfx" type="range" min="0" max="1" step=".05" value="${settings.sfx}"></label><label class="setting">그래픽 <select id="quality"><option value="high">높음 · 그림자 켜짐</option><option value="low">가벼움 · 낮은 해상도</option></select></label><label class="setting">개인 최고 기록 고스트 <input id="ghost" type="checkbox" ${settings.ghost ? "checked" : ""}></label><p class="settings-note">WASD / 방향키: 가속·후진·조향<br>SPACE: 브레이크를 걸며 슬라이드<br>R: 레이스 재시작 · T: 체크포인트 복귀<br><br>기록은 현재 브라우저에 저장됩니다.</p><button id="settings-close" class="primary">저장하고 돌아가기 <span>↗</span></button></section></div>`;
  COURSES.forEach(
    (c, i) =>
      ($(`length-${i}`).textContent =
        (new Track(c).length / 1000).toFixed(2) + " KM"),
  );
  $<HTMLSelectElement>("quality").value = settings.quality;
  mountAds();
}

export function updateMenu(index: number, track: Track) {
  const c = track.course;
  document.documentElement.style.setProperty("--accent", c.color);
  document
    .querySelectorAll<HTMLButtonElement>("[data-course]")
    .forEach((b, i) => {
      b.classList.toggle("selected", i === index);
      b.setAttribute("aria-pressed", String(i === index));
    });
  $("preview-index").textContent = c.subtitle;
  $("preview-title").textContent = c.name;
  $("preview-description").textContent = c.description;
  ["gold", "silver", "bronze"].forEach(
    (v, i) => ($(v + "-time").textContent = formatTime(c.medals[i])),
  );
  $("menu-pb").textContent = formatTime(loadRecord(c.id)?.time);
}
