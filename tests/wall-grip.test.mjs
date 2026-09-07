import assert from 'node:assert/strict';
import { test } from 'node:test';
import R from '@dimforge/rapier3d-compat';
import { Track, COURSES } from '../src/engine/track.ts';
import { Vehicle, createWorld } from '../src/engine/vehicle.ts';

test('suspension must not treat either fence top as drivable ground', async () => {
  await R.init();
  for (const side of [-1, 1]) {
    const track = new Track(COURSES[0]), world = createWorld(track);
    try {
      const car = new Vehicle(world), s = track.sample(.06);
      car.reset(track, .06);
      car.body.setTranslation(s.p.clone().addScaledVector(s.right, side * (track.course.width / 2 - .5)).addScaledVector(s.up, 1.8), true);
      world.step();
      car.step({ throttle: 0, steer: 0, brake: false });
      assert.equal([0,1,2,3].filter(i => car.controller.wheelIsInContact(i)).length, 0, `fence ${side} became a wheel support`);
    } finally { world.free(); }
  }
});

test('both fences contain glancing collisions across sloped and banked courses', async () => {
  await R.init();
  for (const course of COURSES) {
    const track = new Track(course), world = createWorld(track), car = new Vehicle(world);
    try {
      for (const t of [.14,.28,.43,.7,.88]) for (const side of [-1,1]) {
        const s = track.sample(t);
        car.reset(track,t);
        car.body.setTranslation(s.p.clone().addScaledVector(s.right,side*(course.width/2-2)).addScaledVector(s.up,.65),true);
        car.body.setLinvel(s.forward.clone().multiplyScalar(45).addScaledVector(s.right,side*15),true);
        car.sync();
        for(let i=0;i<70;i++) {
          car.step({throttle:0,steer:0,brake:false});world.step();car.sync();
          const near = track.nearest(car.position);
          assert.ok(Math.abs(near.lateral)<course.width/2+.15,`${course.name} ${t} side ${side}: escaped ${near.lateral}`);
          assert.ok(car.position.clone().sub(near.sample.p).dot(near.sample.up)<2.5,`${course.name}: climbed fence`);
        }
      }
    } finally {world.free();}
  }
});
