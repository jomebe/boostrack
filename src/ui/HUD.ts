import { GhostRun } from '../race/Ghost';

export function formatTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '--:--.---';
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${remaining.toFixed(3).padStart(6, '0')}`;
}

export class HUD {
  readonly canvasHost: HTMLDivElement;
  private readonly menu: HTMLElement;
  private readonly pause: HTMLElement;
  private readonly finish: HTMLElement;
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
  private readonly playButton: HTMLButtonElement;
  private readonly resumeButton: HTMLButtonElement;
  private readonly restartButton: HTMLButtonElement;

  onPlay: () => void = () => undefined;
  onResume: () => void = () => undefined;
  onRestart: () => void = () => undefined;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div id="canvas-host"></div>
      <div class="vignette"></div>
      <section id="menu" class="overlay menu-overlay">
        <div class="eyebrow">PURE SPEED · ZERO WAIT</div>
        <h1>BOOST<span>RACK</span></h1>
        <p class="tagline">달리고, 충전하고, 자신의 고스트를 추월하세요.</p>
        <button id="play" class="primary"><span>PLAY</span><small>BOOST VALLEY</small></button>
        <div class="controls-grid">
          <div><b>WASD</b><span>DRIVE</span></div><div><b>SHIFT</b><span>BOOST</span></div>
          <div><b>SPACE</b><span>DRIFT</span></div><div><b>R</b><span>RESTART</span></div>
        </div>
        <div class="coming">LEADERBOARD · GARAGE · TRACK EDITOR <b>COMING SOON</b></div>
      </section>
      <section id="hud" class="hud hidden">
        <div class="track-card"><span>BOOST VALLEY</span><b id="checkpoint">CP 0 / 3</b></div>
        <div id="timer" class="timer">00:00.000</div>
        <div class="best-card"><span>PERSONAL BEST</span><b id="best">--:--.---</b></div>
        <div id="event" class="event"></div>
        <div id="drift" class="drift">DRIFT</div>
        <div class="bottom-hud">
          <div class="boost-block">
            <div class="boost-title"><span>BOOST</span><b id="boost-value">100</b></div>
            <div class="boost-bar"><i id="boost-fill"></i></div>
          </div>
          <div class="speed"><b id="speed">000</b><span>KM/H</span></div>
        </div>
        <div class="hints">R RESTART <i></i> C CAMERA <i></i> ESC PAUSE</div>
      </section>
      <section id="pause" class="overlay compact hidden">
        <div class="eyebrow">RACE PAUSED</div><h2>잠깐 숨 고르기</h2>
        <button id="resume" class="primary"><span>RESUME</span></button>
        <button id="restart-pause" class="secondary">RESTART RACE</button>
      </section>
      <section id="finish" class="overlay compact hidden">
        <div id="finish-label" class="eyebrow">FINISH</div><h2 id="finish-time">00:00.000</h2>
        <p id="finish-delta" class="finish-delta"></p>
        <button id="restart-finish" class="primary"><span>RACE AGAIN</span><small>R</small></button>
      </section>`;
    this.canvasHost = this.get<HTMLDivElement>('canvas-host');
    this.menu = this.get('menu');
    this.pause = this.get('pause');
    this.finish = this.get('finish');
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
    this.playButton = this.get<HTMLButtonElement>('play');
    this.resumeButton = this.get<HTMLButtonElement>('resume');
    this.restartButton = this.get<HTMLButtonElement>('restart-finish');
    this.playButton.addEventListener('click', () => this.onPlay());
    this.resumeButton.addEventListener('click', () => this.onResume());
    this.get<HTMLButtonElement>('restart-pause').addEventListener('click', () => this.onRestart());
    this.restartButton.addEventListener('click', () => this.onRestart());
  }

  showRace(best: GhostRun | null): void {
    this.menu.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.finish.classList.add('hidden');
    this.get('hud').classList.remove('hidden');
    this.best.textContent = formatTime(best?.time ?? null);
  }

  update(time: number, checkpoint: number, boost: number, speed: number, boosting: boolean, drifting: boolean): void {
    this.timer.textContent = formatTime(time);
    this.checkpoint.textContent = `CP ${checkpoint} / 3`;
    this.boostFill.style.width = `${boost}%`;
    this.boostValue.textContent = String(Math.round(boost)).padStart(3, '0');
    this.speed.textContent = String(Math.round(speed * 3.6)).padStart(3, '0');
    this.boostFill.parentElement?.classList.toggle('active', boosting);
    this.drift.classList.toggle('visible', drifting);
  }

  flash(text: string, tone: 'cyan' | 'gold' | 'red' = 'cyan'): void {
    this.event.textContent = text;
    this.event.dataset.tone = tone;
    this.event.classList.remove('show');
    void this.event.offsetWidth;
    this.event.classList.add('show');
  }

  showPause(paused: boolean): void {
    this.pause.classList.toggle('hidden', !paused);
  }

  showFinish(time: number, previousBest: number | null, newBest: boolean): void {
    this.finish.classList.remove('hidden');
    this.finishLabel.textContent = newBest ? 'NEW PERSONAL BEST' : 'FINISH';
    this.finishLabel.className = `eyebrow ${newBest ? 'gold-text' : ''}`;
    this.finishTime.textContent = formatTime(time);
    if (previousBest === null) this.finishDelta.textContent = '첫 기록을 저장했습니다';
    else {
      const delta = time - previousBest;
      this.finishDelta.textContent = `${delta <= 0 ? '−' : '+'}${Math.abs(delta).toFixed(3)} SEC`;
      this.finishDelta.className = `finish-delta ${delta <= 0 ? 'faster' : 'slower'}`;
    }
  }

  private get<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing UI element: ${id}`);
    return element as T;
  }
}
