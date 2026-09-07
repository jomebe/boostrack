import assert from 'node:assert/strict';
import { test } from 'node:test';
import { carImpact } from '../src/multiplayer/impact.ts';
const pose=(from,to=from)=>({from,to,q:[0,0,0,1]});
test('server collision sweep catches high speed crossings and gives bounded opposing impulses',()=>{
  const hit=carImpact(pose([-4,0,0],[4,0,0]),pose([4,0,0],[-4,0,0]),.1);
  assert.ok(hit);assert.ok(hit[0]>0&&hit[0]<=20);assert.equal(hit[1],0);
  const reverse=carImpact(pose([4,0,0],[-4,0,0]),pose([-4,0,0],[4,0,0]),.1);
  assert.equal(hit[0],-reverse[0]);
});
test('bumps exclude separate bridges and noncontact paths, and do not accelerate separating cars',()=>{
  assert.equal(carImpact(pose([-4,0,0],[4,0,0]),pose([4,4,0],[-4,4,0]),.1),null);
  assert.equal(carImpact(pose([0,0,0],[0,0,4]),pose([4,0,0],[4,0,4]),.1),null);
  assert.equal(carImpact(pose([-.7,0,0],[-2,0,0]),pose([.7,0,0],[2,0,0]),.1),null);
});
