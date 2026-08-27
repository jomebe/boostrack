import * as THREE from 'three';
import { CarController } from '../car/CarController';

const MODES = [
  { name: 'CHASE', distance: 9.5, height: 4.1 },
  { name: 'FAR', distance: 15, height: 7 },
  { name: 'HOOD', distance: -1.2, height: 1.65 },
] as const;

export class CameraController {
  private mode = 0;
  private shake = 0;
  private target = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  cycle(): string {
    this.mode = (this.mode + 1) % MODES.length;
    return MODES[this.mode].name;
  }

  impact(amount: number): void {
    this.shake = Math.max(this.shake, amount);
  }

  snap(car: CarController): void {
    const mode = MODES[this.mode];
    const forward = car.direction;
    this.camera.position.copy(car.object.position).addScaledVector(forward, -mode.distance).add(new THREE.Vector3(0, mode.height, 0));
    this.target.copy(car.object.position).addScaledVector(forward, 7).add(new THREE.Vector3(0, 1, 0));
    this.camera.lookAt(this.target);
  }

  update(car: CarController, dt: number): void {
    const mode = MODES[this.mode];
    const boostPullback = car.boosting ? 1.8 : 0;
    const desired = car.object.position.clone()
      .addScaledVector(car.direction, -(mode.distance + boostPullback))
      .add(new THREE.Vector3(0, mode.height, 0));
    const follow = 1 - Math.exp(-dt * (mode.name === 'HOOD' ? 14 : 6));
    this.camera.position.lerp(desired, follow);
    const desiredTarget = car.object.position.clone().addScaledVector(car.direction, mode.name === 'HOOD' ? 20 : 7).add(new THREE.Vector3(0, 1, 0));
    this.target.lerp(desiredTarget, 1 - Math.exp(-dt * 8));

    if (this.shake > 0.002) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.6;
      this.shake *= Math.pow(0.06, dt);
    }
    this.camera.lookAt(this.target);
    const targetFov = 65 + Math.min(13, car.speed / 4) + (car.boosting ? 7 : 0);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, Math.min(85, targetFov), 1 - Math.exp(-dt * 4));
    this.camera.updateProjectionMatrix();
  }
}
