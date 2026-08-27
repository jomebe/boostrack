import * as THREE from 'three';
import { AudioSystem } from '../audio/AudioSystem';
import { CameraController } from '../camera/CameraController';
import { CarController } from '../car/CarController';
import { createCar } from '../car/CarVisual';
import { GhostPlayer, GhostRecorder, GhostRun } from '../race/Ghost';
import { Track } from '../track/Track';
import { HUD } from '../ui/HUD';
import { Input } from './Input';

type GameState = 'menu' | 'running' | 'paused' | 'finished';

export class Game {
  private readonly hud: HUD;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 2600);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  private readonly input = new Input();
  private readonly audio = new AudioSystem();
  private readonly track: Track;
  private readonly car: CarController;
  private readonly cameraController: CameraController;
  private readonly recorder = new GhostRecorder();
  private readonly ghost: GhostPlayer;
  private readonly clock = new THREE.Clock();
  private readonly particles = new THREE.Group();

  private state: GameState = 'menu';
  private elapsed = 0;
  private checkpoint = 0;
  private checkpointProgress = 0;
  private splitTimes: number[] = [];
  private cleanCombo = 0;
  private personalBest: GhostRun | null = null;
  private padBurst = 0;
  private startLights = 0;

  constructor(root: HTMLElement) {
    this.hud = new HUD(root);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.hud.canvasHost.appendChild(this.renderer.domElement);

    this.setupScene();
    this.track = new Track(this.scene);
    const carObject = createCar();
    this.scene.add(carObject);
    this.car = new CarController(carObject, this.input, this.track, {
      onCrash: (strength) => this.crash(strength),
      onLand: (good) => this.land(good),
      onBoostPad: () => this.boostPad(),
      onDrift: (amount) => this.car.addBoost(amount * 2.2),
      onFall: () => this.respawn(),
    });
    const ghostObject = createCar(true);
    this.scene.add(ghostObject);
    this.ghost = new GhostPlayer(ghostObject);
    this.cameraController = new CameraController(this.camera);
    this.createParticles();
    this.loadBest();
    this.car.reset();
    this.cameraController.snap(this.car);

    this.hud.onPlay = () => this.beginRace();
    this.hud.onResume = () => this.togglePause();
    this.hud.onRestart = () => this.beginRace();
    addEventListener('resize', () => this.resize());
    addEventListener('pointerdown', () => this.audio.resume(), { once: true });
  }

  start(): void {
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private setupScene(): void {
    this.scene.background = new THREE.Color(0x87c9f4);
    this.scene.fog = new THREE.Fog(0x87c9f4, 280, 1050);
    const hemisphere = new THREE.HemisphereLight(0xd8f2ff, 0x395533, 2.2);
    this.scene.add(hemisphere);
    const sun = new THREE.DirectionalLight(0xfff3d5, 3.6);
    sun.position.set(-110, 180, -60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -130;
    sun.shadow.camera.right = 130;
    sun.shadow.camera.top = 130;
    sun.shadow.camera.bottom = -130;
    sun.shadow.camera.far = 500;
    this.scene.add(sun);

    for (let i = 0; i < 18; i += 1) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j += 1) {
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(9 + Math.random() * 8, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
        puff.scale.y = 0.55;
        puff.position.set(j * 13, Math.random() * 5, Math.random() * 5);
        cloud.add(puff);
      }
      cloud.position.set((Math.random() - 0.5) * 700, 90 + Math.random() * 85, i * 85 - 80);
      this.scene.add(cloud);
    }
  }

  private createParticles(): void {
    const geometry = new THREE.TetrahedronGeometry(0.11, 0);
    const material = new THREE.MeshBasicMaterial({ color: 0x64efff });
    for (let i = 0; i < 38; i += 1) {
      const particle = new THREE.Mesh(geometry, material);
      particle.visible = false;
      this.particles.add(particle);
    }
    this.scene.add(this.particles);
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.033);
    if (this.input.take('KeyR') && this.state !== 'menu') this.beginRace();
    if (this.input.take('KeyC') && this.state !== 'menu') this.hud.flash(this.cameraController.cycle());
    if (this.input.take('Escape') && (this.state === 'running' || this.state === 'paused')) this.togglePause();
    if (this.input.take('Enter') && this.state === 'menu') this.beginRace();

    if (this.state === 'running') this.updateRace(dt);
    this.cameraController.update(this.car, dt);
    this.updateParticles(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private updateRace(dt: number): void {
    this.elapsed += dt;
    this.startLights = Math.max(0, this.startLights - dt);
    this.car.update(dt);
    this.recorder.record(this.elapsed, this.car.object);
    this.ghost.update(this.elapsed);
    this.audio.update(this.car.speed / 60, this.car.boosting || this.padBurst > 0);
    this.padBurst = Math.max(0, this.padBurst - dt);

    const target = this.track.checkpoints[this.checkpoint];
    if (target !== undefined && this.car.progress >= target) this.passCheckpoint();
    if (this.checkpoint === this.track.checkpoints.length && this.car.progress >= 0.982) this.finishRace();
    this.hud.update(this.elapsed, this.checkpoint, this.car.boost, this.car.speed, this.car.boosting, this.car.drifting);
  }

  private beginRace(): void {
    this.audio.resume();
    this.state = 'running';
    this.elapsed = 0;
    this.checkpoint = 0;
    this.checkpointProgress = 0;
    this.splitTimes = [];
    this.cleanCombo = 0;
    this.padBurst = 0;
    this.startLights = 0.8;
    this.recorder.reset();
    this.car.reset();
    this.ghost.setRun(this.personalBest);
    this.ghost.reset();
    this.cameraController.snap(this.car);
    this.hud.showRace(this.personalBest);
    this.hud.flash('GO!', 'gold');
    this.audio.beep(880, 0.16);
  }

  private passCheckpoint(): void {
    const splitIndex = this.checkpoint;
    this.checkpoint += 1;
    this.checkpointProgress = this.track.checkpoints[splitIndex];
    this.splitTimes.push(this.elapsed);
    this.cleanCombo += 1;
    const reward = 15 + Math.min(12, (this.cleanCombo - 1) * 4);
    this.car.addBoost(reward);
    const pbSplit = this.personalBest?.splits[splitIndex];
    const delta = pbSplit === undefined ? '' : `  ${this.elapsed - pbSplit <= 0 ? '−' : '+'}${Math.abs(this.elapsed - pbSplit).toFixed(3)}`;
    this.hud.flash(`CHECKPOINT ${this.checkpoint}/3${delta}${this.cleanCombo > 1 ? `  CLEAN ×${this.cleanCombo}` : ''}`);
    this.audio.beep(680 + this.checkpoint * 90, 0.13);
  }

  private finishRace(): void {
    const time = this.elapsed;
    const previous = this.personalBest?.time ?? null;
    const newBest = previous === null || time < previous;
    this.state = 'finished';
    if (newBest) {
      this.recorder.record(time, this.car.object);
      this.personalBest = { time, frames: this.recorder.frames, splits: this.splitTimes };
      localStorage.setItem('boostrack:boost-valley:pb', JSON.stringify(this.personalBest));
    }
    this.hud.showFinish(time, previous, newBest);
    this.audio.beep(newBest ? 1040 : 820, 0.5);
    this.audio.update(0, false);
  }

  private crash(strength: number): void {
    this.cleanCombo = 0;
    this.cameraController.impact(0.16 + strength * 0.28);
    this.hud.flash('WALL HIT · CLEAN LOST', 'red');
    this.audio.beep(120, 0.09);
  }

  private land(good: boolean): void {
    this.cameraController.impact(good ? 0.08 : 0.17);
    if (good) {
      this.car.addBoost(10);
      this.hud.flash('PERFECT LANDING  +10', 'gold');
      this.audio.beep(760, 0.1);
    }
  }

  private boostPad(): void {
    this.padBurst = 0.65;
    this.cameraController.impact(0.09);
    this.hud.flash('BOOST PAD', 'cyan');
    this.audio.beep(920, 0.08);
  }

  private respawn(): void {
    const at = Math.max(0, this.checkpointProgress - 0.012);
    this.car.reset(at);
    this.cameraController.snap(this.car);
    this.cleanCombo = 0;
    this.hud.flash('RECOVERED · CLEAN LOST', 'red');
  }

  private togglePause(): void {
    if (this.state === 'running') {
      this.state = 'paused';
      this.hud.showPause(true);
      this.audio.update(0, false);
    } else if (this.state === 'paused') {
      this.state = 'running';
      this.hud.showPause(false);
      this.clock.getDelta();
    }
  }

  private updateParticles(dt: number): void {
    const active = this.state === 'running' && (this.car.boosting || this.padBurst > 0);
    const forward = this.car.direction;
    let index = 0;
    for (const child of this.particles.children) {
      const particle = child as THREE.Mesh;
      particle.visible = active && index < (this.car.boosting ? 34 : 24);
      if (particle.visible) {
        const phase = (performance.now() * 0.02 + index * 1.7) % 24;
        particle.position.copy(this.car.object.position)
          .addScaledVector(forward, -2.2 - phase * 0.34)
          .add(new THREE.Vector3((Math.random() - 0.5) * 1.7, 0.42 + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.25));
        particle.scale.setScalar(0.5 + (1 - phase / 24) * 1.8);
        particle.rotation.x += dt * 8;
      }
      index += 1;
    }
  }

  private loadBest(): void {
    try {
      const raw = localStorage.getItem('boostrack:boost-valley:pb');
      if (raw) this.personalBest = JSON.parse(raw) as GhostRun;
    } catch {
      this.personalBest = null;
    }
  }

  private resize(): void {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }
}
