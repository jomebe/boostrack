import R from '@dimforge/rapier3d-compat';
import { Vehicle, createWorld, STEP } from '../src/engine/vehicle.ts';
import { Track, COURSES } from '../src/engine/track.ts';
import { Race } from '../src/engine/race.ts';
import { drive } from '../tests/driver.mjs';

await R.init();

for (const course of COURSES) {
  const track = new Track(course);
  const world = createWorld(track);
  const car = new Vehicle(world);
  const race = new Race(track);
  car.reset(track);
  for (let i = 0; i < 120; i++) {
    car.step({ throttle: 0, steer: 0, brake: false });
    world.step();
    car.sync();
  }
  for (let i = 0; i < 180 * 120 && !race.finished; i++) {
    car.step(drive(track, car), track.boost(track.nearest(car.position).sample.t));
    world.step();
    car.sync();
    race.update(STEP, car.previousPosition, car.position, car.rotation);
  }
  world.free();
  console.log(`${course.id}: finished in ${race.elapsed.toFixed(3)}s, frames: ${race.frames.length}`);
}
