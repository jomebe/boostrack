import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { Track } from "./track.ts";

export const STEP = 1 / 120;
export interface Controls {
  throttle: number;
  steer: number;
  brake: boolean;
}
export const IDLE: Controls = { throttle: 0, steer: 0, brake: false };
export const WHEELS = [
  [-0.88, 0, 1.12],
  [0.88, 0, 1.12],
  [-0.88, 0, -1.12],
  [0.88, 0, -1.12],
];

export class Vehicle {
  readonly body: RAPIER.RigidBody;
  readonly controller: RAPIER.DynamicRayCastVehicleController;
  readonly world: RAPIER.World;
  steering = 0;
  speed = 0;
  grounded = 0;
  slip = 0;
  turbo = false;
  position = new THREE.Vector3();
  rotation = new THREE.Quaternion();
  velocity = new THREE.Vector3();
  previousPosition = new THREE.Vector3();
  previousRotation = new THREE.Quaternion();
  private forward = new THREE.Vector3();
  private up = new THREE.Vector3();
  constructor(world: RAPIER.World) {
    this.world = world;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setCcdEnabled(true)
        .setLinearDamping(0.05)
        .setAngularDamping(1.6)
        .setCanSleep(false)
        .setAdditionalSolverIterations(4),
    );
    world.createCollider(
      RAPIER.ColliderDesc.roundCuboid(0.72, 0.2, 1.42, 0.13)
        .setMass(650)
        .setFriction(0.12)
        .setRestitution(0.12),
      this.body,
    );
    this.controller = world.createVehicleController(this.body);
    this.controller.indexUpAxis = 1;
    this.controller.setIndexForwardAxis = 2;
    WHEELS.forEach(([x, y, z], i) => {
      this.controller.addWheel(
        { x, y, z },
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 },
        0.38,
        0.36,
      );
      this.controller.setWheelSuspensionStiffness(i, 48);
      this.controller.setWheelSuspensionCompression(i, 5);
      this.controller.setWheelSuspensionRelaxation(i, 5.5);
      this.controller.setWheelMaxSuspensionTravel(i, 0.22);
      this.controller.setWheelMaxSuspensionForce(i, 13000);
      this.controller.setWheelFrictionSlip(i, 2.4);
      this.controller.setWheelSideFrictionStiffness(i, 1);
    });
  }
  reset(track: Track, progress = 0.008) {
    const s = track.sample(progress);
    this.body.setTranslation(s.p.clone().addScaledVector(s.up, 0.82), true);
    this.body.setRotation(s.q, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.resetForces(true);
    this.body.resetTorques(true);
    this.steering = 0;
    this.turbo = false;
    this.grounded = 0;
    this.speed = 0;
    this.sync();
    this.previousPosition.copy(this.position);
    this.previousRotation.copy(this.rotation);
  }
  step(input: Controls, turbo = false) {
    this.previousPosition.copy(this.position);
    this.previousRotation.copy(this.rotation);
    this.velocity.copy(this.body.linvel());
    this.rotation.copy(this.body.rotation());
    this.forward.set(0, 0, 1).applyQuaternion(this.rotation);
    this.up.set(0, 1, 0).applyQuaternion(this.rotation);
    const speed = this.velocity.dot(this.forward);
    const target = input.steer * (0.46 / (1 + Math.abs(speed) * 0.075));
    // Gentle turn-in for keyboard taps; release/opposite input recenters promptly.
    const returning = target === 0 || target * this.steering < 0;
    this.steering = THREE.MathUtils.damp(this.steering, target, input.brake ? 9 : returning ? 8 : 3.8, STEP);
    this.grounded = 0;
    for (let i = 0; i < 4; i++)
      if (this.controller.wheelIsInContact(i)) this.grounded++;
    this.turbo = turbo && this.grounded >= 2;
    const braking = input.throttle < 0 && speed > 2;
    const engine = braking
      ? 0
      : input.throttle *
        (input.brake ? 0.45 : 1) *
        (this.turbo ? 3800 : 1900) *
        Math.max(0.12, 1 - Math.max(0, Math.abs(speed) - 48) / 38);
    for (let i = 0; i < 4; i++) {
      this.controller.setWheelSteering(i, i < 2 ? this.steering : 0);
      this.controller.setWheelEngineForce(i, engine);
      this.controller.setWheelBrake(
        i,
        (braking ? 65 : 0) + (input.brake ? (i >= 2 ? 30 : 22) : 0),
      );
      this.controller.setWheelFrictionSlip(
        i,
        input.brake && i >= 2 ? 1.85 : 2.4,
      );
    }
    // Aerodynamic forces act on the rigid body; never snap height or overwrite impact velocity.
    const v = this.velocity.length();
    if (v > 0.05)
      this.body.applyImpulse(
        this.velocity.clone().multiplyScalar(-(0.7 * v + 0.8) * STEP),
        true,
      );
    if (this.grounded >= 2)
      this.body.applyImpulse(
        this.up.clone().multiplyScalar(-Math.min(7200, v * v * 1.1) * STEP),
        true,
      );
    this.controller.updateVehicle(
      STEP,
      undefined,
      0x0001fffd,
      (c) => c.parent()?.handle !== this.body.handle,
    );
  }
  sync() {
    this.position.copy(this.body.translation());
    this.rotation.copy(this.body.rotation());
    this.velocity.copy(this.body.linvel());
    this.speed = this.velocity.length() * 3.6;
    const local = this.velocity
      .clone()
      .applyQuaternion(this.rotation.clone().invert());
    this.slip = Math.atan2(local.x, Math.max(1, Math.abs(local.z)));
  }
}

export function createWorld(track: Track): RAPIER.World {
  const world = new RAPIER.World({ x: 0, y: -22, z: 0 });
  world.timestep = STEP;
  world.numSolverIterations = 8;
  world.maxCcdSubsteps = 4;
  const h = track.course.width / 2;
  for (const geometry of [
    track.geometry(-h, h),
    track.geometry(-h, h, -0.65),
  ]) {
    const desc = RAPIER.ColliderDesc.trimesh(
      new Float32Array(geometry.attributes.position.array),
      new Uint32Array(geometry.index!.array),
      RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
    );
    world.createCollider(desc.setFriction(0.3).setRestitution(0.08));
    geometry.dispose();
  }
  // Solid convex prisms share the same cross sections on BOTH sides. Thin one-sided
  // triangles had opposite-facing normals and no volume to recover an overlap from.
  for (let i = 0; i < track.segments; i++) {
    if (track.gap((i + 0.5) / track.segments)) continue;
    for (const side of [-1, 1]) {
      const wall = RAPIER.ColliderDesc.convexHull(track.wallVertices(i, side));
      if (wall)
        world.createCollider(wall.setFriction(0.08).setRestitution(0.08).setCollisionGroups(0x0002ffff));
    }
  }
  for (const [t, side] of track.course.barriers ?? []) {
    const s = track.sample(t),
      p = s.p
        .clone()
        .addScaledVector(s.right, side * track.course.width * 0.25)
        .addScaledVector(s.up, 0.8);
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(track.course.width * 0.29, 0.8, 0.65)
        .setTranslation(p.x, p.y, p.z)
        .setRotation(s.q)
        .setFriction(0.08)
        .setRestitution(0.15),
    );
  }
  // The ground is safely below every road and can never snap the vehicle back onto a bridge.
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(4000, 1, 4000)
      .setTranslation(0, -13, 0)
      .setFriction(0.6),
  );
  return world;
}
