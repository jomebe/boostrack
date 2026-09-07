import assert from "node:assert/strict";
import { test, before } from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { Track, COURSES } from "../src/engine/track.ts";
import { Vehicle, createWorld, STEP, IDLE } from "../src/engine/vehicle.ts";
import { Race, crossedGate } from "../src/engine/race.ts";
import { drive } from "./driver.mjs";

before(async () => await RAPIER.init());
function setup(course = COURSES[0]) {
  const track = new Track(course),
    world = createWorld(track),
    car = new Vehicle(world);
  car.reset(track);
  world.step();
  car.sync();
  return { track, world, car };
}
function tick(world, car, input = IDLE, turbo = false) {
  car.step(input, turbo);
  world.step();
  car.sync();
  assert.ok(Number.isFinite(car.position.y));
}

test("suspension settles; engine accelerates; brake slows without reversing at speed", () => {
  const { world, car } = setup();
  try {
    for (let i = 0; i < 240; i++) tick(world, car);
    assert.ok(car.grounded === 4);
    assert.ok(Math.abs(car.position.y - 8.6) < 0.2);
    for (let i = 0; i < 240; i++)
      tick(world, car, { throttle: 1, steer: 0, brake: false });
    const speed = car.speed;
    assert.ok(speed > 65 && speed < 100, `acceleration: ${speed}`);
    for (let i = 0; i < 80; i++)
      tick(world, car, { throttle: -1, steer: 0, brake: false });
    assert.ok(car.speed < speed * 0.65, `braking: ${speed} -> ${car.speed}`);
  } finally {
    world.free();
  }
});

test("wheels below an elevated road cannot attach through its underside", () => {
  const { world, car, track } = setup();
  try {
    const p = track.sample(0.05).p;
    car.body.setTranslation({ x: p.x, y: p.y - 4, z: p.z }, true);
    car.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    car.sync();
    for (let i = 0; i < 100; i++) {
      tick(world, car);
      assert.ok(car.position.y < p.y - 3.9, "car teleported to bridge");
    }
    assert.equal(car.grounded, 0);
  } finally {
    world.free();
  }
});

test("CCD contains head-on and glancing high-speed wall impacts without trapped overlap", () => {
  for (const side of [-1, 1])
    for (const inward of [15, 65, 100]) {
      const { world, car, track } = setup();
      try {
        const s = track.sample(0.055);
        car.reset(track, 0.055);
        for (let i = 0; i < 100; i++) tick(world, car);
        car.body.setTranslation(
          s.p
            .clone()
            .addScaledVector(s.right, side * 8)
            .addScaledVector(s.up, 0.65),
          true,
        );
        car.body.setLinvel(
          s.right
            .clone()
            .multiplyScalar(side * inward)
            .addScaledVector(s.forward, inward === 15 ? 55 : 0),
          true,
        );
        car.sync();
        for (let i = 0; i < 80; i++) {
          tick(world, car);
          const n = track.nearest(car.position);
          assert.ok(
            Math.abs(n.lateral) < 11.1,
            `escaped wall at ${inward}m/s: ${n.lateral}`,
          );
        }
        assert.ok(car.position.y < 11, "collision launched vehicle");
      } finally {
        world.free();
      }
    }
});

test("checkpoint crossings require correct direction and actual gate bounds", () => {
  const track = new Track(COURSES[0]),
    s = track.sample(0.23),
    a = s.p.clone().addScaledVector(s.forward, -1),
    b = s.p.clone().addScaledVector(s.forward, 1);
  assert.ok(crossedGate(a, b, s, 22));
  assert.ok(!crossedGate(b, a, s, 22));
  assert.ok(
    !crossedGate(
      a.clone().addScaledVector(s.right, 30),
      b.clone().addScaledVector(s.right, 30),
      s,
      22,
    ),
  );
  const race = new Race(track);
  const finish = track.sample(0);
  race.update(
    STEP,
    finish.p.clone().addScaledVector(finish.forward, -1),
    finish.p.clone().addScaledVector(finish.forward, 1),
    finish.q,
  );
  assert.equal(race.finished, false);
  race.elapsed = 20;
  race.checkpoint = 1;
  assert.ok(race.recoverProgress() > 0.23);
  assert.equal(race.elapsed, 20);
  assert.equal(race.checkpoint, 1);
  race.reset();
  assert.equal(race.elapsed, 0);
  assert.equal(race.checkpoint, 0);
  assert.equal(race.frames.length, 0);
});

for (const course of COURSES)
  test(`${course.name}: complete a full race using real physics and only driving inputs`, () => {
    const { world, car, track } = setup(course),
      race = new Race(track);
    let maxY = 0,
      maxSpeed = 0,
      maxLateral = 0,
      air = 0;
    try {
      for (let i = 0; i < 120; i++) tick(world, car);
      for (let i = 0; i < 120 * 180 && !race.finished; i++) {
        const near = track.nearest(car.position);
        tick(world, car, drive(track, car), track.boost(near.sample.t));
        race.update(STEP, car.previousPosition, car.position, car.rotation);
        maxY = Math.max(maxY, car.position.y);
        maxSpeed = Math.max(maxSpeed, car.speed);
        maxLateral = Math.max(maxLateral, Math.abs(near.lateral));
        if (car.grounded < 2) air++;
        assert.ok(
          car.position.y > -8,
          `fell at ${near.sample.t.toFixed(3)}, lap ${race.elapsed.toFixed(1)}`,
        );
        assert.ok(car.position.y < 75, `ramp launch: ${car.position.y}`);
      }
      console.log(
        course.name,
        JSON.stringify({
          time: race.elapsed,
          checkpoints: race.checkpoint,
          maxY,
          maxSpeed,
          maxLateral,
          airSeconds: air * STEP,
        }),
      );
      assert.ok(
        race.finished,
        `did not finish at ${track.nearest(car.position).sample.t}, cp ${race.checkpoint}, speed ${car.speed}`,
      );
      assert.ok(race.elapsed > 30 && race.elapsed < 150);
      assert.ok(race.frames.length > 900);
      assert.equal(race.splits.length, course.checkpoints.length);
    } finally {
      world.free();
    }
  });
