import assert from "node:assert/strict";
import { test, before } from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { Input } from "../src/input.ts";
import { Track, COURSES } from "../src/engine/track.ts";
import { Vehicle, createWorld } from "../src/engine/vehicle.ts";

before(async () => await RAPIER.init());

// Exercise the shared keyboard/touch key mapping without a DOM.
function controls(...keys) {
  return Input.prototype.read.call({ keys: new Set(keys) });
}

test("A/left and D/right share opposite steering; simultaneous keys cancel", () => {
  assert.equal(controls("KeyA").steer, 1);
  assert.equal(controls("ArrowLeft").steer, 1);
  assert.equal(controls("KeyD").steer, -1);
  assert.equal(controls("ArrowRight").steer, -1);
  assert.equal(controls("KeyA", "KeyD").steer, 0);
  assert.deepEqual(controls("KeyW", "Space"), {
    throttle: 1,
    steer: 0,
    brake: true,
  });
  assert.equal(controls("KeyS").throttle, -1);
});

for (const [key, direction] of [
  ["KeyA", 1],
  ["KeyD", -1],
  ["ArrowLeft", 1],
  ["ArrowRight", -1],
]) {
  test(`${key} turns the actual vehicle toward the correct side of the chase camera`, () => {
    const track = new Track(COURSES[0]);
    const world = createWorld(track);
    const vehicle = new Vehicle(world);
    const start = track.sample(0.008);
    try {
      vehicle.reset(track, 0.008);
      const tick = (input) => {
        vehicle.step(input);
        world.step();
        vehicle.sync();
      };
      for (let i = 0; i < 120; i++) tick(controls());
      for (let i = 0; i < 160; i++) tick(controls("KeyW"));
      const before = vehicle.position.clone();
      for (let i = 0; i < 60; i++) tick(controls("KeyW", key));
      // The chase camera looks along +forward: +track.right appears screen-left.
      const lateral = vehicle.position.clone().sub(before).dot(start.right);
      assert.ok(
        lateral * direction > 0.25,
        `${key}: lateral displacement ${lateral}`,
      );
    } finally {
      world.free();
    }
  });
}
