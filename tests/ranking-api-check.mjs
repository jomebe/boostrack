import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { Vehicle, createWorld, STEP } from '../src/engine/vehicle.ts';
import { Track, COURSES } from '../src/engine/track.ts';
import { Race } from '../src/engine/race.ts';
import { drive } from './driver.mjs';

// Local database only: do not insert synthetic QA records into production rankings.
const origin = 'http://127.0.0.1:8788';
const course = COURSES[4], endpoint = `${origin}/api/leaderboard`;
const initial = await fetch(`${endpoint}?track=${course.id}`);
assert.equal(initial.status,200);
const cookie = initial.headers.get('set-cookie').split(';')[0];
assert.ok(initial.headers.get('set-cookie').includes('HttpOnly'));
const headers = {'Content-Type':'application/json',Origin:origin,Cookie:cookie};
const post = body => fetch(endpoint,{method:'POST',headers,body:JSON.stringify(body)});
assert.equal((await post({time:1})).status,400);
assert.equal((await fetch(`${endpoint}?track=unknown`)).status,400);
assert.equal((await fetch(endpoint,{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:'{}'})).status,403);
await R.init();
const track = new Track(course), world = createWorld(track), car = new Vehicle(world), race = new Race(track);
let run;
try {
  car.reset(track);
  for(let i=0;i<120;i++){car.step({throttle:0,steer:0,brake:false});world.step();car.sync();}
  for(let i=0;i<180*120&&!race.finished;i++){
    car.step(drive(track,car),track.boost(track.nearest(car.position).sample.t));world.step();car.sync();race.update(STEP,car.previousPosition,car.position,car.rotation);
  }
  assert.ok(race.finished);
  run={track:course.id,nickname:'API Test',...race.record()};
}finally{world.free();}
const accepted=await post(run);
assert.equal(accepted.status,200,await accepted.text());
const board=await (await fetch(`${endpoint}?track=${course.id}`,{headers:{Cookie:cookie}})).json();
assert.equal(board.mine.time_ms,Math.round(run.time*1000));
assert.ok(board.mine.rank>=1);
const replay=board.entries.find(e=>e.mine===1).replay;
const original=await (await fetch(`${endpoint}?track=${course.id}&replay=${replay}`)).json();
assert.deepEqual(original.frames,run.frames,'stored/retrieved movement must equal the actual captured movement');
assert.deepEqual(original.splits,run.splits);
assert.equal((await fetch(`${endpoint}?track=${course.id}&ghost_rank=1`)).status,409);
assert.equal((await post({...run,captureVersion:undefined})).status,400);
assert.ok(board.entries.some(e=>e.mine===1));
assert.ok(board.entries.every(e=>!('racer_id' in e)));
assert.equal((await post(run)).status,200);
const slower={...run,time:run.time*1.1,splits:run.splits.map(t=>t*1.1),frames:run.frames.map(f=>({...f,t:f.t*1.1}))};
assert.equal((await post(slower)).status,200);
const retained=await (await fetch(`${endpoint}?track=${course.id}`,{headers:{Cookie:cookie}})).json();
assert.equal(retained.mine.time_ms,board.mine.time_ms);
assert.equal(retained.entries.filter(e=>e.mine===1).length,1);
const ghostRes = await fetch(`${endpoint}?track=${course.id}&replay=${retained.entries.find(e=>e.mine===1).replay}`);
assert.equal(ghostRes.status, 200);
const ghostData = await ghostRes.json();
assert.ok(ghostData.rank >= 1);
assert.ok(ghostData.nickname.length > 0);
assert.ok(ghostData.frames.length >= 100);
assert.ok(Number.isFinite(ghostData.frames[0].t));
assert.ok(Array.isArray(ghostData.frames[0].p));
console.log('Local API: exact captured replay roundtrip, stable replay identity, PB protection, invalid capture and CSRF checks passed.');
