import assert from 'node:assert/strict';
import {test} from 'node:test';
import {racingFov} from '../src/camera-fov.ts';

test('FOV grows exponentially with speed, with safe normal and turbo limits',()=>{
  const values=[0,50,100,150,200].map(v=>racingFov(v));
  const increases=values.slice(1).map((v,i)=>v-values[i]);
  assert.equal(values[0],72);
  assert.equal(values[4],118);
  for(let i=1;i<increases.length;i++)assert.ok(increases[i]>increases[i-1]*1.6);
  assert.equal(racingFov(-10),72);
  assert.equal(racingFov(10000),118);
  assert.equal(racingFov(200,true),123);
  assert.equal(racingFov(10000,true),123);
  console.log('FOV at 0/50/100/150/200 km/h:',values.map(v=>v.toFixed(1)));
});
