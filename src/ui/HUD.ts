import { RacerProfile } from '../profile/ProfileStore';
import { LeaderboardEntry } from '../profile/LeaderboardClient';
import { GhostRun } from '../race/Ghost';
import { TrackDefinition } from '../track/Track';

export function formatTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '--:--.---';
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${remaining.toFixed(3).padStart(6, '0')}`;
}

export class HUD {
  readonly canvasHost: HTMLDivElement;
  private readonly tracks: TrackDefinition[];
  private readonly menu: HTMLElement;
  private readonly pause: HTMLElement;
  private readonly finish: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly best: HTMLElement;
  private readonly checkpoint: HTMLElement;
  private readonly boostFill: HTMLElement;
  private readonly boostValue: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly event: HTMLElement;
  private readonly drift: HTMLElement;
  private readonly finishTime: HTMLElement;
  private readonly finishLabel: HTMLElement;
  private readonly finishDelta: HTMLElement;
  private readonly currentTrack: HTMLElement;
  private readonly racerInput: HTMLInputElement;
  private readonly racerId: HTMLElement;
  private readonly leaderboard: HTMLElement;
  private readonly leaderboardTitle: HTMLElement;
  private readonly leaderboardRows: HTMLElement;
  private selectedTrackId: string;

  onPlay: (trackId: string) => void = () => undefined;
  onResume: () => void = () => undefined;
  onRestart: () => void = () => undefined;
  onMenu: () => void = () => undefined;
  onProfileSave: (nickname: string) => void = () => undefined;
  onLeaderboardOpen: () => void = () => undefined;
  onLeaderboardTrack: (trackId: string) => void = () => undefined;
  onLeaderboardClose: () => void = () => undefined;

  constructor(root: HTMLElement, tracks: TrackDefinition[]) {
    this.tracks = tracks;
    this.selectedTrackId = tracks[0].id;
    root.innerHTML = `
      <div id="canvas-host"></div>
      <div id="speed-lines" class="speed-lines"></div>
      <div class="vignette"></div>
      <section id="menu" class="overlay menu-overlay">
        <div class="menu-shell">
          <div class="brand-block"><div class="eyebrow">FLOATING TIME ATTACK</div><h1>BOOST<span>RACK</span></h1><p class="tagline">달리고, 충전하고, 자신의 고스트를 추월하세요.</p></div>
          <aside class="racer-card"><div class="card-kicker">LOCAL RACER PROFILE</div><label for="racer-name">RACER NAME</label><div class="profile-edit"><input id="racer-name" maxlength="18" autocomplete="nickname" /><button id="save-profile" aria-label="Save racer name">SAVE</button></div><b id="racer-id"></b><p>이 브라우저에 맵별 기록과 PB Ghost가 저장됩니다.</p></aside>
          <div class="select-title"><span>SELECT TRACK</span><small>2 PLAYABLE MAPS</small></div>
          <div id="track-grid" class="track-grid">${tracks.map((track, index) => `<button class="track-choice ${index === 0 ? 'selected' : ''}" data-track="${track.id}" style="--accent:#${track.accent.toString(16).padStart(6, '0')}"><span class="track-index">0${index + 1}</span><b>${track.name}</b><small>${track.subtitle}</small><em id="record-${track.id}">PB --:--.---</em></button>`).join('')}</div>
          <button id="play" class="primary"><span>RACE SELECTED TRACK</span><small>ENTER</small></button>
          <button id="leaderboard-open" class="secondary">WORLD RANKING</button>
          <div class="controls-grid"><div><b>WASD</b><span>DRIVE</span></div><div><b>SHIFT</b><span>BOOST</span></div><div><b>SPACE</b><span>DRIFT</span></div><div><b>T / R</b><span>RECOVER / RESTART</span></div></div>
        </div>
      </section>
      <section id="leaderboard" class="overlay compact hidden"><div class="leaderboard-card"><div class="eyebrow">GLOBAL TIME ATTACK</div><h2 id="leaderboard-title">WORLD RANKING</h2><div id="leaderboard-tabs" class="leaderboard-tabs">${tracks.map((track) => `<button data-leaderboard-track="${track.id}">${track.name}</button>`).join('')}</div><div id="leaderboard-list" class="leaderboard-list"></div><button id="leaderboard-back" class="text-button">BACK TO TRACK SELECT</button></div></section>
      <section id="hud" class="hud hidden">
        <div class="track-card"><span id="current-track">BOOST VALLEY</span><b id="checkpoint">CP 0 / 3</b></div>
        <div id="timer" class="timer">00:00.000</div>
        <div class="best-card"><span>PERSONAL BEST</span><b id="best">--:--.---</b></div>
        <div id="event" class="event"></div><div id="drift" class="drift">DRIFT · CHARGING</div>
        <div class="bottom-hud"><div class="boost-block"><div class="boost-title"><span>BOOST</span><b id="boost-value">100</b></div><div class="boost-bar"><i id="boost-fill"></i></div></div><div class="speed"><b id="speed">000</b><span>KM/H</span></div></div>
        <div class="hints">T CHECKPOINT <i></i> R RESTART <i></i> C CAMERA <i></i> ESC PAUSE</div>
      </section>
      <section id="pause" class="overlay compact hidden"><div class="eyebrow">RACE PAUSED</div><h2>잠깐 숨 고르기</h2><button id="resume" class="primary"><span>RESUME</span></button><button id="restart-pause" class="secondary">RESTART RACE</button><button id="menu-pause" class="text-button">BACK TO TRACK SELECT</button></section>
      <section id="finish" class="overlay compact hidden"><div id="finish-label" class="eyebrow">FINISH</div><h2 id="finish-time">00:00.000</h2><p id="finish-delta" class="finish-delta"></p><button id="restart-finish" class="primary"><span>RACE AGAIN</span><small>R</small></button><button id="menu-finish" class="text-button">CHANGE TRACK</button></section>`;
    this.canvasHost = this.get<HTMLDivElement>('canvas-host');
    this.menu = this.get('menu');
    this.pause = this.get('pause');
    this.finish = this.get('finish');
    this.hud = this.get('hud');
    this.timer = this.get('timer');
    this.best = this.get('best');
    this.checkpoint = this.get('checkpoint');
    this.boostFill = this.get('boost-fill');
    this.boostValue = this.get('boost-value');
    this.speed = this.get('speed');
    this.event = this.get('event');
    this.drift = this.get('drift');
    this.finishTime = this.get('finish-time');
    this.finishLabel = this.get('finish-label');
    this.finishDelta = this.get('finish-delta');
    this.currentTrack = this.get('current-track');
    this.racerInput = this.get<HTMLInputElement>('racer-name');
    this.racerId = this.get('racer-id');
    this.leaderboard = this.get('leaderboard');
    this.leaderboardTitle = this.get('leaderboard-title');
    this.leaderboardRows = this.get('leaderboard-list');
    this.get<HTMLButtonElement>('play').addEventListener('click', () => this.onPlay(this.selectedTrackId));
    this.get<HTMLButtonElement>('resume').addEventListener('click', () => this.onResume());
    this.get<HTMLButtonElement>('restart-pause').addEventListener('click', () => this.onRestart());
    this.get<HTMLButtonElement>('restart-finish').addEventListener('click', () => this.onRestart());
    this.get<HTMLButtonElement>('menu-pause').addEventListener('click', () => this.onMenu());
    this.get<HTMLButtonElement>('menu-finish').addEventListener('click', () => this.onMenu());
    this.get<HTMLButtonElement>('save-profile').addEventListener('click', () => this.onProfileSave(this.racerInput.value));
    this.get<HTMLButtonElement>('leaderboard-open').addEventListener('click', () => this.onLeaderboardOpen());
    this.get<HTMLButtonElement>('leaderboard-back').addEventListener('click', () => this.onLeaderboardClose());
    this.racerInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') this.onProfileSave(this.racerInput.value); });
    this.get<HTMLElement>('track-grid').addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-track]');
      if (button) this.selectTrack(button.dataset.track ?? this.selectedTrackId);
    });
    this.get<HTMLElement>('leaderboard-tabs').addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-leaderboard-track]');
      if (button) this.onLeaderboardTrack(button.dataset.leaderboardTrack ?? this.selectedTrackId);
    });
  }

  showMenu(profile: RacerProfile, selectedTrack: TrackDefinition): void {
    this.selectedTrackId = selectedTrack.id;
    this.menu.classList.remove('hidden');
    this.pause.classList.add('hidden');
    this.finish.classList.add('hidden');
    this.leaderboard.classList.add('hidden');
    this.hud.classList.add('hidden');
    this.racerInput.value = profile.nickname;
    this.racerId.textContent = profile.id;
    this.tracks.forEach((track) => {
      const record = this.get(`record-${track.id}`);
      record.textContent = `PB ${formatTime(profile.records[track.id]?.time ?? null)}`;
    });
    this.selectTrack(selectedTrack.id);
  }

  showRace(track: TrackDefinition, best: GhostRun | null): void {
    this.menu.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.finish.classList.add('hidden');
    this.hud.classList.remove('hidden');
    this.leaderboard.classList.add('hidden');
    this.currentTrack.textContent = track.name;
    this.best.textContent = formatTime(best?.time ?? null);
  }

  update(time: number, checkpoint: number, checkpointCount: number, boost: number, speed: number, boosting: boolean, drifting: boolean, driftPower: number, falling: boolean): void {
    this.timer.textContent = formatTime(time);
    this.checkpoint.textContent = `CP ${checkpoint} / ${checkpointCount}`;
    this.boostFill.style.width = `${boost}%`;
    this.boostValue.textContent = String(Math.round(boost)).padStart(3, '0');
    this.speed.textContent = String(Math.round(speed * 3.6)).padStart(3, '0');
    this.boostFill.parentElement?.classList.toggle('active', boosting);
    this.drift.classList.toggle('visible', drifting);
    this.drift.style.setProperty('--drift-power', `${Math.round(driftPower * 100)}%`);
    this.get('speed-lines').classList.toggle('active', boosting);
    this.hud.classList.toggle('falling', falling);
  }

  flash(text: string, tone: 'cyan' | 'gold' | 'red' = 'cyan'): void {
    this.event.textContent = text;
    this.event.dataset.tone = tone;
    this.event.classList.remove('show');
    void this.event.offsetWidth;
    this.event.classList.add('show');
  }

  showPause(paused: boolean): void { this.pause.classList.toggle('hidden', !paused); }

  showLeaderboard(track: TrackDefinition, entries: LeaderboardEntry[], loading = false, message = ''): void {
    this.menu.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.finish.classList.add('hidden');
    this.hud.classList.add('hidden');
    this.leaderboard.classList.remove('hidden');
    this.leaderboardTitle.textContent = `${track.name} RANKING`;
    this.leaderboard.querySelectorAll<HTMLButtonElement>('[data-leaderboard-track]').forEach((button) => {
      button.classList.toggle('selected', button.dataset.leaderboardTrack === track.id);
    });
    this.leaderboardRows.replaceChildren();
    if (loading || message || entries.length === 0) {
      const notice = document.createElement('p');
      notice.className = 'leaderboard-notice';
      notice.textContent = loading ? 'LOADING RANKING…' : message || 'NO TIMES YET — SET THE FIRST RECORD.';
      this.leaderboardRows.append(notice);
      return;
    }
    entries.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = 'leaderboard-row';
      const rank = document.createElement('b');
      rank.textContent = String(index + 1).padStart(2, '0');
      const name = document.createElement('span');
      name.textContent = entry.nickname;
      const time = document.createElement('time');
      time.textContent = formatTime(entry.time);
      row.append(rank, name, time);
      this.leaderboardRows.append(row);
    });
  }

  showFinish(time: number, previousBest: number | null, newBest: boolean): void {
    this.finish.classList.remove('hidden');
    this.finishLabel.textContent = newBest ? 'NEW PERSONAL BEST' : 'FINISH';
    this.finishLabel.className = `eyebrow ${newBest ? 'gold-text' : ''}`;
    this.finishTime.textContent = formatTime(time);
    if (previousBest === null) this.finishDelta.textContent = '이 레이서의 첫 기록을 저장했습니다';
    else {
      const delta = time - previousBest;
      this.finishDelta.textContent = `${delta <= 0 ? '−' : '+'}${Math.abs(delta).toFixed(3)} SEC`;
      this.finishDelta.className = `finish-delta ${delta <= 0 ? 'faster' : 'slower'}`;
    }
  }

  private selectTrack(trackId: string): void {
    this.selectedTrackId = trackId;
    this.tracks.forEach((track) => this.get(`record-${track.id}`).closest('.track-choice')?.classList.toggle('selected', track.id === trackId));
  }

  private get<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing UI element: ${id}`);
    return element as T;
  }
}
