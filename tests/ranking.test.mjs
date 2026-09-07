import assert from 'node:assert/strict';
import { test } from 'node:test';
import R from '@dimforge/rapier3d-compat';
import { Vehicle, createWorld, STEP } from '../src/engine/vehicle.ts';
import { Track, COURSES } from '../src/engine/track.ts';
import { Race } from '../src/engine/race.ts';
import { validateRankingRun } from '../src/engine/ranking.ts';
import { drive } from './driver.mjs';

test('all courses accept real complete replays; reject missing gates, teleports and invalid times', async () => {
  await R.init();
  for (const course of COURSES) {
    const track = new Track(course), world = createWorld(track), car = new Vehicle(world), race = new Race(track);
    try {
      car.reset(track);
      for (let i=0;i<120;i++) {car.step({throttle:0,steer:0,brake:false});world.step();car.sync();}
      for (let i=0;i<180*120&&!race.finished;i++) {
        car.step(drive(track,car), track.boost(track.nearest(car.position).sample.t));world.step();car.sync();
        race.update(STEP,car.previousPosition,car.position,car.rotation);
      }
      assert.ok(race.finished);
      const run = {track:course.id,nickname:'테스트 Racer',...race.record()};
      assert.ok(validateRankingRun(run), course.name);
      assert.equal(validateRankingRun({...run,time:1}),false);
      assert.equal(validateRankingRun({...run,nickname:'<script>'}),false);
      assert.equal(validateRankingRun({...run,frames:race.frames.filter((_,i)=>i%10===0)}),false);
      assert.equal(validateRankingRun({...run,frames:race.frames.map((f,i)=>i===80?{...f,p:[0,1000,0]}:f)}),false);
      assert.equal(validateRankingRun({...run,frames:race.frames.slice(0,-30)}),false);
    } finally {world.free();}
  }
});

test('fence rendering uses the exact collision prism vertices and two alternating colors', () => {
  const track = new Track(COURSES[0]), geometry = track.wallGeometry();
  assert.deepEqual(Array.from(geometry.attributes.position.array.slice(0,24)), Array.from(track.wallVertices(0,-1)));
  const colors = geometry.attributes.color;
  assert.deepEqual(Array.from(colors.array.slice(0,3)), Array.from(colors.array.slice(48,51)));
  assert.notDeepEqual(Array.from(colors.array.slice(0,3)), Array.from(colors.array.slice(144,147)));
  geometry.dispose();
});
