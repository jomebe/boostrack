import * as THREE from 'three';
import { Input } from '../game/Input';
import { Track, TrackLocation } from '../track/Track';

export interface CarEvents {
  onCrash: (strength: number) => void;
  onLand: (good: boolean) => void;
  onBoostPad: () => void;
  onDrift: (amount: number) => void;
  onFall: () => void;
}

export class CarController {
  readonly velocity = new THREE.Vector3();
  readonly direction = new THREE.Vector3(0, 0, 1);
  progress = 0;
  speed = 0;
  boost = 100;
  boosting = false;
  drifting = false;
  grounded = true;
  falling = false;
  yaw = 0;

  private verticalVelocity = 0;
  private padCooldown = 0;
  private jumpCooldown = 0;
  private roll = 0;

  constructor(
    readonly object: THREE.Group,
    private readonly input: Input,
    private readonly track: Track,
    private readonly events: CarEvents,
  ) {}

  reset(progress = 0): void {
    const sample = this.track.sampleAt(progress);
    this.object.position.copy(sample.position).add(new THREE.Vector3(0, 0.7, 0));
    this.yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
    this.object.rotation.set(0, this.yaw, 0);
    this.velocity.set(0, 0, 0);
    this.speed = 0;
    this.progress = progress;
    this.boost = 100;
    this.boosting = false;
    this.grounded = true;
    this.verticalVelocity = 0;
    this.padCooldown = 0;
    this.jumpCooldown = 0;
    this.roll = 0;
    this.falling = false;
  }

  update(dt: number): void {
    this.padCooldown -= dt;
    this.jumpCooldown -= dt;

    const location = this.track.nearest(this.object.position, this.progress);
    this.progress = location.progress;
    const forwardInput = (this.input.held('KeyW', 'ArrowUp') ? 1 : 0) - (this.input.held('KeyS', 'ArrowDown') ? 1 : 0);
    const steerInput = (this.input.held('KeyA', 'ArrowLeft') ? 1 : 0) - (this.input.held('KeyD', 'ArrowRight') ? 1 : 0);
    const handbrake = this.input.held('Space');

    this.direction.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const longitudinal = this.velocity.dot(this.direction);
    const speedAbs = Math.abs(longitudinal);
    const wasBoosting = this.boosting;
    this.boosting = this.input.held('ShiftLeft', 'ShiftRight') && this.boost > 0.25 && forwardInput > 0 && this.grounded;
    if (this.boosting) this.boost = Math.max(0, this.boost - dt * 28);

    const maxSpeed = this.boosting ? 82 : 52;
    const reverseMax = -16;
    let acceleration = 0;
    if (forwardInput > 0 && longitudinal < maxSpeed) acceleration = this.boosting ? 66 : 25;
    if (forwardInput < 0) acceleration = longitudinal > 2 ? -44 : -18;
    if (longitudinal < reverseMax && acceleration < 0) acceleration = 0;
    this.velocity.addScaledVector(this.direction, acceleration * dt);
    if (this.boosting && !wasBoosting) this.velocity.addScaledVector(this.direction, 8);

    const speedRatio = Math.min(1, speedAbs / 52);
    const steerStrength = THREE.MathUtils.lerp(1.85, 0.72, speedRatio);
    const directionSign = longitudinal < -0.5 ? -1 : 1;
    if (speedAbs > 0.8 && this.grounded) this.yaw += steerInput * steerStrength * directionSign * dt * Math.min(1, speedAbs / 8);

    this.direction.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(this.direction.z, 0, -this.direction.x);
    const forwardVelocity = this.direction.clone().multiplyScalar(this.velocity.dot(this.direction));
    const lateralVelocity = right.clone().multiplyScalar(this.velocity.dot(right));
    const slip = Math.abs(this.velocity.dot(right));
    const grip = this.grounded ? (handbrake ? 1.35 : 6.5) : 0.18;
    lateralVelocity.multiplyScalar(Math.max(0, 1 - grip * dt));
    this.velocity.x = forwardVelocity.x + lateralVelocity.x;
    this.velocity.z = forwardVelocity.z + lateralVelocity.z;
    this.drifting = this.grounded && speedAbs > 15 && slip > 2.6 && Math.abs(steerInput) > 0.2;
    if (this.drifting) this.events.onDrift(dt * Math.min(2.4, slip / 4));

    const drag = this.grounded ? (forwardInput === 0 ? 0.985 : 0.995) : 0.999;
    const frameDrag = Math.pow(drag, dt * 60);
    this.velocity.x *= frameDrag;
    this.velocity.z *= frameDrag;
    this.velocity.y = 0;

    this.applyTrackForces(location);
    this.object.position.addScaledVector(this.velocity, dt);
    this.object.position.y += this.verticalVelocity * dt;

    const after = this.track.nearest(this.object.position, this.progress);
    this.progress = after.progress;
    const onRoad = Math.abs(after.distance) <= this.track.width * 0.5;
    const roadY = after.position.y + 0.64 + Math.sin(after.bank) * after.distance;
    if (this.grounded && !onRoad) {
      this.grounded = false;
      this.falling = true;
      this.verticalVelocity = Math.min(0, this.verticalVelocity);
      this.events.onFall();
    }
    if (!this.grounded) {
      this.verticalVelocity -= 21 * dt;
      this.roll += steerInput * dt * 0.45;
      if (onRoad && this.object.position.y <= roadY && this.verticalVelocity < 0) {
        const impact = -this.verticalVelocity;
        this.object.position.y = roadY;
        this.verticalVelocity = 0;
        this.grounded = true;
        this.falling = false;
        const good = Math.abs(this.roll) < 0.32 && impact < 17;
        this.events.onLand(good);
        this.roll *= 0.25;
      }
    } else {
      this.object.position.y = THREE.MathUtils.lerp(this.object.position.y, roadY, Math.min(1, dt * 14));
      this.roll = THREE.MathUtils.lerp(this.roll, -after.bank - steerInput * speedRatio * 0.07, Math.min(1, dt * 7));
    }

    this.speed = Math.abs(this.velocity.dot(this.direction));
    this.object.rotation.set(0, this.yaw, this.roll);

  }

  addBoost(amount: number): void {
    this.boost = Math.min(100, this.boost + amount);
  }

  private applyTrackForces(location: TrackLocation): void {
    for (const pad of this.track.boostPads) {
      if (Math.abs(this.progress - pad) < 0.008 && this.padCooldown <= 0 && Math.abs(location.distance) < 7.5) {
        this.velocity.addScaledVector(location.tangent, 17);
        this.padCooldown = 1.2;
        this.events.onBoostPad();
      }
    }

    for (const jump of this.track.jumps) {
      if (Math.abs(this.progress - jump) < 0.005 && this.jumpCooldown <= 0 && this.speed > 14 && this.grounded) {
        this.verticalVelocity = jump < 0.5 ? 12.5 : 10;
        this.grounded = false;
        this.jumpCooldown = 1.5;
      }
    }
  }
}
