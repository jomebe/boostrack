import RAPIER from "@dimforge/rapier3d-compat";
import { COURSES, Track } from "./engine/track.ts";
import {
  Vehicle,
  createWorld,
  STEP,
  IDLE,
  type Controls,
} from "./engine/vehicle.ts";
import { Race, formatTime, type RecordRun } from "./engine/race.ts";
import { View } from "./view.ts";
import { Audio } from "./audio.ts";
import { Input } from "./input.ts";
import {
  settings,
  saveSettings,
  loadRecord,
  saveRecord,
  storageAvailable,
} from "./storage.ts";
import { mountUI, $, updateMenu, mapPath } from "./ui.ts";
import { Multiplayer } from "./multiplayer/client.ts";
import { Lobby } from "./multiplayer/lobby.ts";
import { Leaderboard, type ChallengerGhost } from './leaderboard.ts';
import "./style.css";

mountUI();
type State = "menu" | "countdown" | "running" | "paused" | "finished";

async function boot() {
  await RAPIER.init();
  const view = new View($<HTMLCanvasElement>("world"));
  await view.ready;
  const input = new Input(),
    audio = new Audio();
  let selected = 0,
    track: Track,
    world: RAPIER.World,
    vehicle: Vehicle,
    race: Race,
    record: RecordRun | undefined,
    challenger: ChallengerGhost | undefined;
  let state: State = "menu",
    beforePause: State = "running",
    countdown = 3,
    lastCount = 3,
    accumulator = 0,
    previous = performance.now(),
    toastLeft = 0,
    hudTime = 0;
  let projector: ReturnType<typeof mapPath>;
  let testDriver: ((track: Track, vehicle: Vehicle) => Controls) | undefined;
  const cameras = [['chase','추적'],['bumper','범퍼 1인칭'],['hood','보닛'],['top','탑뷰']] as const;
  function applyCamera() {
    view.setCameraMode(settings.camera);
    $('camera-switch').textContent = `C · ${cameras.find(c=>c[0]===settings.camera)![1]}`;
  }
  applyCamera();
  function applyAppearance(){
    view.car.paint.color.set(settings.paint);
    view.car.accent.color.set(settings.accent);
    view.car.wing.visible=settings.spoiler;
    $('garage-preview').style.setProperty('--car-paint',settings.paint);
    $('garage-preview').style.setProperty('--car-accent',settings.accent);
    $('garage-wing').style.visibility=settings.spoiler?'visible':'hidden';
  }
  applyAppearance();
  for(const key of ['paint','accent'] as const){
    $<HTMLInputElement>(`car-${key}`).value=settings[key];
    $(`car-${key}`).oninput=()=>{settings[key]=$<HTMLInputElement>(`car-${key}`).value;applyAppearance();saveSettings();};
  }
  $<HTMLInputElement>('car-spoiler').checked=settings.spoiler;
  $('car-spoiler').onchange=()=>{settings.spoiler=$<HTMLInputElement>('car-spoiler').checked;applyAppearance();saveSettings();};
  $('camera-switch').onclick = () => {
    settings.camera = cameras[(cameras.findIndex(c=>c[0]===settings.camera)+1)%cameras.length][0];
    applyCamera();saveSettings();
  };
  const net = new Multiplayer();
  const leaderboard = new Leaderboard();
  $('ranking-open').onclick = () => leaderboard.open(track.course.id);
  leaderboard.onChallenge = (ghost) => {
    challenger = ghost;
    const courseIndex = COURSES.findIndex((c) => c.id === ghost.track);
    if (courseIndex >= 0 && courseIndex !== selected) {
      select(courseIndex, false);
    }
    toast(`⚔️ 1:1 대결: ${ghost.nickname} (${formatTime(ghost.time)})`, 3);
    void start();
  };
  let online = false;
  net.onImpact = (velocity) => {
    if (!online || state !== 'running') return;
    vehicle.body.applyImpulse({x:velocity[0]*vehicle.body.mass(),y:0,z:velocity[2]*vehicle.body.mass()},true);
    audio.beep('impact');
    toast('차량 충돌', .8);
  };
  let recoverSent = 0;
  function recoverOnline() {
    if (performance.now() - recoverSent < 1500) return;
    recoverSent = performance.now();
    net.send({ type: "recover" });
  }
  const lobby = new Lobby(
    net,
    () => selected,
    () => {
      net.leave();
      online = false;
      lobby.close();
      view.setOpponents([]);
      menu();
    },
  );
  net.onError = (message) => {
    lobby.error(message);
    toast(message, 5);
  };
  net.onClose = () => {
    online = false;
    menu();
    lobby.close();
    $("multiplayer").hidden = false;
    lobby.error("연결이 끊겼습니다. 다시 참가해 주세요.");
    view.setOpponents([]);
  };
  net.onPose = (players) => view.setOpponents(players);
  net.onRecover = (progress) => {
    vehicle.reset(track, progress);
    view.snap(vehicle);
    race.checkpoint =
      net.room?.players.find((p) => p.id === net.id)?.checkpoint ??
      race.checkpoint;
  };
  net.onRoom = (room) => {
    lobby.update(room);
    lobby.rows("online-players", room);
    if (room.phase === "lobby" && online) {
      online = false;
      menu();
      $("multiplayer").hidden = false;
    }
    const me = room.players.find((p) => p.id === net.id);
    if (me){view.car.paint.color.set(me.color);view.car.accent.color.set(me.accent??settings.accent);view.car.wing.visible=me.spoiler!==false;}
    if (
      room.phase === "results" ||
      (me?.time !== null && me?.time !== undefined)
    ) {
      if (online) {
        state = "finished";
        input.keys.clear();
        audio.drive(0, 0, 0);
        $("overlay").hidden = false;
        $("resume").hidden = true;
        $("dialog-tag").textContent = "LIVE RACE / SERVER RESULTS";
        $("dialog-title").textContent =
          room.phase === "results" ? "RACE RESULTS" : "FINISH.";
        $("result").replaceChildren();
        const standings = document.createElement("div");
        standings.id = "result-players";
        $("result").append(standings);
        lobby.rows("result-players", room);
        const note = document.createElement("p");
        note.className = "settings-note";
        note.textContent =
          room.phase === "results"
            ? "방장이 재경기를 선택하면 로비로 돌아갑니다."
            : "다른 플레이어의 완주를 기다리는 중…";
        $("result").append(note);
        $("restart").hidden = room.phase !== "results" || room.host !== net.id;
        $("restart").textContent = "같은 방에서 재경기";
      }
    }
  };
  net.onStart = (room) => {
    online = true;
    select(COURSES.findIndex((c) => c.id === room.course));
    $("multiplayer").hidden = true;
    void start();
  };
  // Vite removes this test-only seam from production. It accepts controls, never transforms.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has("qa")) {
    Object.assign(window, {
      __raceTest: {
        setDriver: (driver: typeof testDriver) => {
          testDriver = driver;
        },
        snapshot: () => ({
          state,
          time: race.elapsed,
          checkpoint: race.checkpoint,
          speed: vehicle.speed,
          fov: view.camera.fov,
          cameraMode: view.cameraMode,
          cameraPosition: view.camera.position.toArray(),
          carVisible: view.car.group.visible,
          forwardSpeed: vehicle.velocity.clone().applyQuaternion(vehicle.rotation.clone().invert()).z,
          grounded: vehicle.grounded,
          position: vehicle.position.toArray(),
          rotation: vehicle.rotation.toArray(),
          ghostVisible: view.ghost.group.visible,
          challenger: challenger ? {time:challenger.time,nickname:challenger.nickname} : null,
          challengerPosition: view.challengerGhost.group.position.toArray(),
          challengerRotation: view.challengerGhost.group.quaternion.toArray(),
          challengerSteering: view.challengerGhost.wheels[0].rotation.y,
          paint: view.car.paint.color.getHexString(),
          spoiler: view.car.wing.visible,
          drawCalls: view.renderer.info.render.calls,
          triangles: view.renderer.info.render.triangles,
          room: net.room,
          playerId: net.id,
        }),
      },
    });
  }
  const hud = {
    timer: $("timer"),
    speed: $("speed"),
    checkpoint: $("checkpoint"),
    rev: $("rev"),
    carState: $("car-state"),
    progress: $("progress"),
    player: $("map-player"),
  };
  function toast(text: string, duration = 2.5) {
    $("toast").textContent = text;
    $("toast").classList.add("visible");
    toastLeft = duration;
  }
  function select(index: number, resetChallenger = true) {
    if (resetChallenger) challenger = undefined;
    selected = index;
    world?.free();
    track = new Track(COURSES[selected]);
    world = createWorld(track);
    vehicle = new Vehicle(world);
    race = new Race(track);
    vehicle.reset(track);
    world.step();
    vehicle.sync();
    view.load(track, world);
    view.quality(settings.quality === "high");
    updateMenu(selected, track);
    record = loadRecord(track.course.id);
    projector = mapPath(track);
    $("map-line").setAttribute("d", projector.path);
    $("map-gates").innerHTML = track.course.checkpoints
      .map((t) => {
        const p = track.sample(t).p,
          xy = projector.project(p.x, p.z);
        return `<circle cx="${xy[0]}" cy="${xy[1]}" r="3" fill="#f7f5ed"/>`;
      })
      .join("");
    $("race-name").textContent = track.course.name;
    $("race-pb").textContent = formatTime(record?.time);
  }
  async function start() {
    if (!$("settings").hidden || !$("rankings").hidden) return;
    try {
      if (online) void audio.start().catch(() => {});
      else await audio.start();
    } catch {
      toast("오디오를 시작할 수 없습니다. 음소거 상태로 계속합니다.");
    }
    audio.scene(selected + 1);
    input.keys.clear();
    race.reset();
    vehicle.reset(track);
    const spawn = online ? net.room?.players.find(p=>p.id===net.id) : undefined;
    if (spawn) {
      vehicle.body.setTranslation({x:spawn.p[0],y:spawn.p[1],z:spawn.p[2]},true);
      vehicle.body.setRotation({x:spawn.q[0],y:spawn.q[1],z:spawn.q[2],w:spawn.q[3]},true);
      vehicle.sync();
      vehicle.previousPosition.copy(vehicle.position);
      vehicle.previousRotation.copy(vehicle.rotation);
    }
    world.step();
    vehicle.sync();
    view.snap(vehicle);
    record = loadRecord(track.course.id);
    $("race-pb").textContent = formatTime(record?.time);
    state = "countdown";
    countdown = online
      ? Math.max(0, (net.room!.startAt - net.serverTime) / 1000)
      : 3;
    lastCount = Math.ceil(countdown);
    accumulator = 0;
    $("countdown").textContent = String(lastCount);
    $("online-board").hidden = !online;
    if (challenger && !online) {
      $("challenger-banner").hidden = false;
      $("challenger-name").textContent = `vs ${challenger.nickname} (${challenger.rank}위 · ${formatTime(challenger.time)})`;
      $("challenger-delta").textContent = "±0.00s";
      $("challenger-delta").className = "delta-neutral";
      $("restart").textContent = "고스트와 다시 대결 R";
    } else {
      $("challenger-banner").hidden = true;
      $("restart").textContent = online
        ? "재경기는 경기 종료 후 가능합니다"
        : "다시 도전 R";
    }
    $("restart").hidden = false;
    document.querySelector(".race-controls")!.textContent = online
      ? `T 체크포인트 · 차량 충돌 ${net.room?.collisions ? '허용' : '비허용'} · 온라인 일시 정지 불가`
      : (challenger ? `1:1 대결 중 · R 다시 시작 · T 체크포인트 · ESC 일시 정지` : "R 처음부터 · T 체크포인트 · ESC 일시 정지");
    audio.beep("count");
    $("menu").hidden = true;
    $("overlay").hidden = true;
    $("hud").hidden = false;
    $("toast").classList.remove("visible");
  }
  function menu() {
    applyAppearance();
    state = "menu";
    input.keys.clear();
    challenger = undefined;
    $("challenger-banner").hidden = true;
    $("overlay").hidden = true;
    $("hud").hidden = true;
    $("menu").hidden = false;
    audio.scene(0);
    audio.drive(0, 0, 0);
    updateMenu(selected, track);
    $("online-board").hidden = true;
    $("restart").hidden = false;
    $("restart").textContent = "다시 도전 R";
  }
  function pause() {
    if (online) {
      input.keys.clear();
      toast("온라인 경기는 계속 진행됩니다. T로 복귀할 수 있습니다.");
      return;
    }
    if (state !== "running" && state !== "countdown") return;
    beforePause = state;
    state = "paused";
    input.keys.clear();
    $("overlay").hidden = false;
    $("dialog-tag").textContent = "TAKE A BREATH";
    $("dialog-title").textContent = "PAUSED";
    $("result").innerHTML = "";
    $("resume").hidden = false;
    audio.drive(0, 0, 0);
    $("resume").focus();
  }
  function resume() {
    if (state !== "paused") return;
    state = beforePause;
    accumulator = 0;
    previous = performance.now();
    $("overlay").hidden = true;
    void audio.start().catch(() => {});
  }
  function finish() {
    if (online) {
      state = "finished";
      input.keys.clear();
      audio.drive(0, 0, 0);
      toast("완주 판정 확인 중…");
      return;
    }
    state = "finished";
    audio.beep("finish");
    audio.drive(0, 0, 0);
    input.keys.clear();
    const previousBest = record?.time,
      newBest = previousBest === undefined || race.elapsed < previousBest;
    const currentRun = race.record();
    const saved = newBest ? saveRecord(track.course.id, currentRun) : true;
    if (newBest) record = currentRun;
    const medal = track.course.medals.findIndex((t) => race.elapsed <= t);
    const wonChallenger = challenger ? race.elapsed <= challenger.time : false;
    const challengerDiff = challenger ? Math.abs(race.elapsed - challenger.time).toFixed(3) : '0';
    const challengerHtml = challenger ? `
      <div class="challenger-result-card ${wonChallenger ? 'won' : 'lost'}">
        <div class="challenger-result-badge">${wonChallenger ? '🏆 1:1 대결 승리!' : '⚔️ 1:1 대결 패배'}</div>
        <p class="challenger-result-text">상대 <strong id="ghost-result-name"></strong> (${formatTime(challenger.time)})보다 <strong>${wonChallenger ? '-' : '+'}${challengerDiff}초</strong> ${wonChallenger ? '앞섰습니다!' : '뒤처졌습니다.'}</p>
        <button id="finish-challenger-pick" class="secondary" style="width:100%;margin:10px 0 4px">다른 랭커와 1:1 대결 ↗</button>
      </div>` : '';
    $("dialog-tag").textContent = challenger
      ? (wonChallenger ? "1:1 GHOST BATTLE VICTORIOUS!" : "1:1 GHOST BATTLE FINISHED")
      : (newBest ? "A NEW PERSONAL BEST" : "ANOTHER LAP. ANOTHER LIMIT.");
    $("dialog-title").textContent = challenger
      ? (wonChallenger ? "VICTORY!" : "DEFEAT.")
      : "FINISH.";
    $("result").innerHTML =
      `<div class="result-time">${formatTime(race.elapsed)}</div>${challengerHtml}<p class="medal-earned">${medal < 0 ? "✓ COURSE COMPLETE" : ["◆ GOLD MEDAL", "◆ SILVER MEDAL", "◆ BRONZE MEDAL"][medal]}</p><p class="result-message">${previousBest === undefined ? "첫 기록을 세웠습니다." : `이전 최고 ${formatTime(previousBest)} · ${newBest ? "-" : "+"}${Math.abs(race.elapsed - previousBest).toFixed(3)}초`}<br>${saved ? "기록과 고스트는 이 브라우저에 저장됩니다." : "브라우저 저장 공간이 부족해 이번 기록을 저장하지 못했습니다."}<br>체크포인트 ${race.checkpoint}/${track.course.checkpoints.length} · 복귀 ${race.respawns}회</p>`;
    if(challenger) $("ghost-result-name").textContent=challenger.nickname;
    $("resume").hidden = true;
    $("overlay").hidden = false;
    leaderboard.finish(track.course.id, currentRun, race.respawns);
    if (challenger) {
      const pickBtn = document.getElementById('finish-challenger-pick');
      if (pickBtn) pickBtn.onclick = () => { $("overlay").hidden = true; leaderboard.open(track.course.id); };
      $("restart").textContent = "고스트와 다시 대결 R";
    }
    $("restart").focus();
  }
  $("play").onclick = () => void start();
  $("pause").onclick = pause;
  $("resume").onclick = resume;
  $("restart").onclick = () => {
    if (online) net.send({ type: "rematch" });
    else void start();
  };
  $("back").onclick = () => {
    if (online) $("leave-room").click();
    else menu();
  };
  $("online-leave").onclick = () => $("leave-room").click();
  document
    .querySelectorAll<HTMLButtonElement>("[data-course]")
    .forEach((b) => (b.onclick = () => select(Number(b.dataset.course))));
  $("settings-open").onclick = () => {
    $("settings").hidden = false;
    $("music").focus();
    void audio.start().catch(() => {});
  };
  $('garage-open').onclick=()=>$('settings-open').click();
  $("settings-close").onclick = () => {
    saveSettings();
    $("settings").hidden = true;
    view.quality(settings.quality === "high");
    $("settings-open").focus();
  };
  for (const key of ["music", "sfx"] as const)
    $<HTMLInputElement>(key).oninput = (e) => {
      settings[key] = Number((e.target as HTMLInputElement).value);
      audio.volumes();
    };
  $<HTMLSelectElement>("quality").onchange = (e) => {
    settings.quality = (e.target as HTMLSelectElement).value as "high" | "low";
  };
  $<HTMLInputElement>("ghost").onchange = (e) => {
    settings.ghost = (e.target as HTMLInputElement).checked;
  };
  input.onAction = (key) => {
    if (!$('rankings').hidden) {
      if (key === 'Escape') $('ranking-close').click();
      return;
    }
    if (!$("multiplayer").hidden) {
      if (key === "Escape") $("leave-room").click();
      return;
    }
    if (!$("settings").hidden) {
      if (key === "Escape") $("settings-close").click();
      return;
    }
    if (key === "Enter" && state === "menu") void start();
    if (key === 'KeyC' && state !== 'menu') $('camera-switch').click();
    if (key === "KeyR" && state !== "menu") {
      if (online) toast("온라인 경기는 T로 체크포인트에 복귀하세요.");
      else void start();
    }
    if (key === "KeyT" && state === "running") {
      if (online) recoverOnline();
      else vehicle.reset(track, race.recoverProgress());
      view.snap(vehicle);
      toast("CHECKPOINT RESET · 시간은 계속 흐릅니다");
    }
    if (key === "Escape") {
      if (state === "paused") resume();
      else if (state === "finished" && !online) menu();
      else pause();
    }
  };
  window.addEventListener("blur", pause);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pause();
      audio.suspend();
    }
  });
  $<HTMLCanvasElement>("world").addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    pause();
    $("load-message").textContent =
      "그래픽 연결이 끊어졌습니다. 페이지를 새로고침해 주세요.";
    $("loading").hidden = false;
  });
  select(0);
  $("loading").hidden = true;
  $("menu").hidden = false;
  if (!storageAvailable) $("menu-pb").textContent = "저장 불가";
  function frame(now: number) {
    const dt = Math.min((now - previous) / 1000, 0.1);
    previous = now;
    hudTime += dt;
    if (state === "running" || state === "countdown") {
      accumulator += dt;
      while (accumulator >= STEP) {
        accumulator -= STEP;
        if (state === "countdown") {
          countdown = online
            ? (net.room!.startAt - net.serverTime) / 1000
            : countdown - STEP;
          if (Math.ceil(countdown) !== lastCount) {
            lastCount = Math.ceil(countdown);
            $("countdown").textContent =
              lastCount > 0 ? String(lastCount) : "GO";
            audio.beep("count");
          }
          vehicle.step(IDLE);
          world.step();
          vehicle.sync();
          if (countdown <= 0) {
            state = "running";
            toast("모든 체크포인트를 지나 출발선으로 돌아오세요", 3);
          }
        } else if (state === "running") {
          const near = track.nearest(vehicle.position);
          const controls =
            import.meta.env.DEV && testDriver
              ? testDriver(track, vehicle)
              : input.read();
          vehicle.step(
            controls,
            track.boost(near.sample.t) &&
              Math.abs(near.lateral) < track.course.width / 2,
          );
          const oldSpeed = vehicle.speed;
          world.step();
          vehicle.sync();
          if (oldSpeed - vehicle.speed > 18) audio.beep("impact");
          const event = race.update(
            STEP,
            vehicle.previousPosition,
            vehicle.position,
            vehicle.rotation,
            vehicle.steering,
          );
          if (online)
            race.elapsed = Math.max(
              0,
              (net.serverTime - net.room!.startAt) / 1000,
            );
          if (event === "checkpoint") {
            audio.beep("checkpoint");
            const pb = record?.splits[race.checkpoint - 1];
            let msg = `CHECKPOINT ${race.checkpoint} / ${track.course.checkpoints.length}${pb !== undefined ? `  ${race.elapsed < pb ? "-" : "+"}${Math.abs(race.elapsed - pb).toFixed(3)}` : ""}`;
            if (challenger) {
              const split=challenger.splits[race.checkpoint-1];
              if(split!==undefined){const delta=race.elapsed-split;msg+=` · 고스트 대비 ${delta>=0?'+':''}${delta.toFixed(3)}초`;}
            }
            toast(msg);
          }
          if (event === "finish") finish();
          if (
            vehicle.position.y < -8 ||
            vehicle.position.y > 150 ||
            race.elapsed > 900
          ) {
            if (race.elapsed > 900) {
              pause();
              toast("레이스 제한 시간에 도달했습니다. R로 다시 시작하세요.");
            } else {
              if (online) recoverOnline();
              else vehicle.reset(track, race.recoverProgress());
              view.snap(vehicle);
              toast("다시 도전하세요 · 체크포인트 복귀");
            }
          }
        }
      }
    } else accumulator = 0;
    if (online && net.racing && (state === "running" || state === "finished"))
      net.pose(vehicle.position.toArray(), vehicle.rotation.toArray());
    if (state === "running" && race.elapsed > 0.7)
      $("countdown").textContent = "";
    if (toastLeft > 0) {
      toastLeft -= dt;
      if (toastLeft <= 0) $("toast").classList.remove("visible");
    }
    if (state === "running" || state === "countdown")
      audio.drive(vehicle.speed, input.read().throttle, vehicle.slip);
    if (hudTime > 0.045) {
      hudTime = 0;
      if (online)
        $("online-status").textContent =
          `LIVE · ${net.ping}ms · ${net.room?.players.length ?? 0}/6 RACERS`;
      if (challenger && !online) {
        const split=challenger.splits[race.checkpoint-1];
        const delta=split===undefined?undefined:race.splits[race.checkpoint-1]-split;
        const deltaEl=$('challenger-delta');
        deltaEl.textContent=delta===undefined?'첫 CP에서 기록 비교':`CP ${race.checkpoint} · ${delta>=0?'+':''}${delta.toFixed(3)}초`;
        deltaEl.className=delta===undefined?'delta-neutral':delta<=0?'delta-ahead':'delta-behind';
      }
      hud.timer.textContent = formatTime(race.elapsed);
      hud.speed.textContent = Math.round(vehicle.speed)
        .toString()
        .padStart(3, "0");
      hud.checkpoint.textContent = `CHECKPOINT ${race.checkpoint} / ${track.course.checkpoints.length}`;
      hud.rev.style.width = `${Math.min(100, vehicle.speed / 2.5)}%`;
      hud.carState.textContent = vehicle.turbo
        ? "TURBO / FULL THROTTLE"
        : vehicle.grounded < 2
          ? "AIR / HOLD YOUR LINE"
          : Math.abs(vehicle.slip) > 0.12
            ? "SLIDE / FIND YOUR EXIT"
            : "GRIP / ROAD";
      const xy = projector.project(vehicle.position.x, vehicle.position.z);
      hud.player.setAttribute("cx", String(xy[0]));
      hud.player.setAttribute("cy", String(xy[1]));
      hud.progress.textContent = `${Math.round(track.nearest(vehicle.position).sample.t * 100)}% COMPLETE`;
    }
    view.render(
      vehicle,
      dt,
      state === "running" || state === "countdown" ? accumulator / STEP : 1,
      state === "menu",
      state === "menu" ? now / 1000 : race.elapsed,
      settings.ghost && !online && !challenger ? record : undefined,
      !online ? challenger : undefined,
    );
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot().catch((error) => {
  console.error(error);
  $("load-message").textContent =
    "게임을 시작할 수 없습니다. WebGL 지원 브라우저에서 새로고침해 주세요.";
  const button = document.createElement("button");
  button.className = "secondary";
  button.style.width = "200px";
  button.textContent = "다시 불러오기";
  button.onclick = () => location.reload();
  $("loading").append(button);
});
