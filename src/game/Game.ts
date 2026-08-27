import * as THREE from 'three';
import { AudioSystem } from '../audio/AudioSystem';
import { CameraController } from '../camera/CameraController';
import { CarController } from '../car/CarController';
import { createCar } from '../car/CarVisual';
import { ProfileStore } from '../profile/ProfileStore';
import { GhostPlayer, GhostRecorder, GhostRun } from '../race/Ghost';
import { Track, TrackDefinition, TRACKS } from '../track/Track';
import { HUD } from '../ui/HUD';
import { Input } from './Input';

type GameState = 'menu' | 'running' | 'paused' | 'finished';

export class Game {
  private readonly profile = new ProfileStore();
  private readonly hud: HUD;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 2600);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  private readonly input = new Input();
  private readonly audio = new AudioSystem();
  private readonly recorder = new GhostRecorder();
  private readonly clock = new THREE.Clock();
  private readonly particles = new THREE.Group();
  private readonly cameraController: CameraController;
  private track!: Track;
  private car!: CarController;
  private ghost!: GhostPlayer;
  private playerObject: THREE.Group | null = null;
  private ghostObject: THREE.Group | null = null;
  private selectedTrack = TRACKS[0];

  private state: GameState = 'menu';
  private elapsed = 0;
  private checkpoint = 0;
  private checkpointProgress = 0;
  private splitTimes: number[] = [];
  private cleanCombo = 0;
  private personalBest: GhostRun | null = null;
  private padBurst = 0;

  constructor(root: HTMLElement) {
    this.hud = new HUD(root, TRACKS);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.hud.canvasHost.appendChild(this.renderer.domElement);
    this.setupScene();
    this.cameraController = new CameraController(this.camera);
    this.createParticles();
    this.loadTrack(this.selectedTrack);

    this.hud.onPlay = (trackId) => {
      const definition = TRACKS.find((track) => track.id === trackId) ?? TRACKS[0];
      if (definition.id !== this.selectedTrack.id) this.loadTrack(definition);
      this.beginRace();
    };
    this.hud.onResume = () => this.togglePause();
    this.hud.onRestart = () => this.beginRace();
    this.hud.onMenu = () => this.showMenu();
    this.hud.onProfileSave = (nickname) => {
      this.profile.rename(nickname);
      this.showMenu();
    };
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
    this.scene.add(new THREE.HemisphereLight(0xd8f2ff, 0x395533, 2.2));
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
      cloud.position.set((Math.random() - 0.5) * 700, 12 + Math.random() * 85, i * 85 - 80);
      this.scene.add(cloud);
    }
  }

  private loadTrack(definition: TrackDefinition): void {
    if (this.playerObject) this.scene.remove(this.playerObject);
    if (this.ghostObject) this.scene.remove(this.ghostObject);
    if (this.track) this.track.dispose(this.scene);
    this.selectedTrack = definition;
    this.track = new Track(this.scene, definition);
    this.playerObject = createCar();
    this.scene.add(this.playerObject);
    this.car = new CarController(this.playerObject, this.input, this.track, {
      onCrash: (strength) => this.crash(strength),
      onLand: (good) => this.land(good),
      onBoostPad: () => this.boostPad(),
      onDrift: (amount) => this.car.addBoost(amount * 2.2),
      onFall: () => this.fall(),
    });
    this.ghostObject = createCar(true);
    this.scene.add(this.ghostObject);
    this.ghost = new GhostPlayer(this.ghostObject);
    this.personalBest = this.profile.best(definition.id);
    this.ghost.setRun(this.personalBest);
    this.car.reset();
    this.cameraController.snap(this.car);
    this.showMenu();
  }

  private createParticles(): void {
    const geometry = new THREE.TetrahedronGeometry(0.11, 0);
    const material = new THREE.MeshBasicMaterial({ color: 0x64efff });
    for (let i = 0; i < 72; i += 1) {
      const particle = new THREE.Mesh(geometry, material);
      particle.visible = false;
      this.particles.add(particle);
    }
    this.scene.add(this.particles);
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.033);
    if (this.input.take('KeyR') && this.state !== 'menu') this.beginRace();
    if (this.input.take('KeyT') && this.state === 'running') this.recoverCheckpoint();
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
    this.car.update(dt);
    this.recorder.record(this.elapsed, this.car.object);
    this.ghost.update(this.elapsed);
    this.audio.update(this.car.speed / 82, this.car.boosting || this.padBurst > 0);
    this.padBurst = Math.max(0, this.padBurst - dt);
    const target = this.track.checkpoints[this.checkpoint];
    if (target !== undefined && this.car.progress >= target) this.passCheckpoint();
    if (this.checkpoint === this.track.checkpoints.length && this.car.progress >= 0.982) this.finishRace();
    this.hud.update(this.elapsed, this.checkpoint, this.track.checkpoints.length, this.car.boost, this.car.speed, this.car.boosting, this.car.drifting, this.car.falling);
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
    this.recorder.reset();
    this.personalBest = this.profile.best(this.selectedTrack.id);
    this.car.reset();
    this.ghost.setRun(this.personalBest);
    this.ghost.reset();
    this.cameraController.snap(this.car);
    this.hud.showRace(this.selectedTrack, this.personalBest);
    this.hud.flash('GO!', 'gold');
    this.audio.beep(880, 0.16);
  }

  private showMenu(): void {
    this.state = 'menu';
    this.personalBest = this.profile.best(this.selectedTrack.id);
    this.car.reset();
    this.ghost.setRun(this.personalBest);
    this.cameraController.snap(this.car);
    this.hud.showMenu(this.profile.get(), this.selectedTrack);
    this.audio.update(0, false);
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
    this.hud.flash(`CHECKPOINT ${this.checkpoint}/${this.track.checkpoints.length}${delta}${this.cleanCombo > 1 ? `  CLEAN ×${this.cleanCombo}` : ''}`);
    this.audio.beep(680 + this.checkpoint * 90, 0.13);
  }

  private finishRace(): void {
    const time = this.elapsed;
    const previous = this.personalBest?.time ?? null;
    const run = { time, frames: this.recorder.frames, splits: this.splitTimes };
    const newBest = this.profile.saveBest(this.selectedTrack.id, run);
    if (newBest) this.personalBest = run;
    this.state = 'finished';
    this.hud.showFinish(time, previous, newBest);
    this.audio.beep(newBest ? 1040 : 820, 0.5);
    this.audio.update(0, false);
  }

  private recoverCheckpoint(): void {
    const at = Math.max(0, this.checkpointProgress - 0.012);
    this.car.reset(at);
    this.cameraController.snap(this.car);
    this.cleanCombo = 0;
    this.hud.flash(this.checkpoint ? 'RECOVERED AT CHECKPOINT' : 'RECOVERED AT START', 'cyan');
  }

  private fall(): void {
    this.cleanCombo = 0;
    this.cameraController.impact(0.22);
    this.hud.flash('OFF THE TRACK · T TO RECOVER · R TO RESTART', 'red');
    this.audio.beep(150, 0.14);
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
    this.padBurst = 0.85;
    this.cameraController.impact(0.14);
    this.hud.flash('BOOST PAD · FULL THRUST', 'cyan');
    this.audio.beep(920, 0.08);
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
      particle.visible = active && index < (this.car.boosting ? 68 : 40);
      if (particle.visible) {
        const phase = (performance.now() * 0.035 + index * 1.7) % 32;
        particle.position.copy(this.car.object.position)
          .addScaledVector(forward, -2.2 - phase * 0.55)
          .add(new THREE.Vector3((Math.random() - 0.5) * 2.6, 0.42 + (Math.random() - 0.5) * 1.1, (Math.random() - 0.5) * 0.3));
        particle.scale.setScalar(0.55 + (1 - phase / 32) * 2.6);
        particle.rotation.x += dt * 12;
      }
      index += 1;
    }
  }

  private resize(): void {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }
}
