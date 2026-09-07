import assert from "node:assert/strict";
import { test, before } from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { Track, COURSES } from "../src/engine/track.ts";
import { Vehicle, createWorld } from "../src/engine/vehicle.ts";

before(async () => await RAPIER.init());
test("after sustained wall contact the car can reverse out; chassis never remains embedded", () => {
  for (const side of [-1, 1])
    for (const t of [0.06, 0.28, 0.8]) {
      const track = new Track(COURSES[0]),
        world = createWorld(track),
        car = new Vehicle(world),
        s = track.sample(t);
      try {
        car.reset(track, t);
        world.step();
        for (let i = 0; i < 120; i++) {
          car.step({ throttle: 0, steer: 0, brake: false });
          world.step();
          car.sync();
        }
        car.body.setRotation(
          s.q
            .clone()
            .multiply(
              new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                (side * Math.PI) / 2,
              ),
            ),
          true,
        );
        car.body.setTranslation(
          s.p
            .clone()
            .addScaledVector(s.right, side * 7)
            .addScaledVector(s.up, 0.7),
          true,
        );
        car.sync();
        for (let i = 0; i < 500; i++) {
          car.step({ throttle: 1, steer: 0, brake: false });
          world.step();
          car.sync();
          assert.ok(Math.abs(track.nearest(car.position).lateral) < 11.1);
          assert.ok(car.position.y < s.p.y + 4);
        }
        const before = car.position.clone();
        for (let i = 0; i < 140; i++) {
          car.step({ throttle: -1, steer: 0, brake: false });
          world.step();
          car.sync();
        }
        assert.ok(car.position.distanceTo(before) > 1.5, `trapped at ${t}`);
      } finally {
        world.free();
      }
    }
});
