import assert from 'node:assert/strict';
import { test } from 'node:test';
import R from '@dimforge/rapier3d-compat';
import { Vehicle, STEP } from '../src/engine/vehicle.ts';

test('short steering taps are gentler without losing held lock or fast recentering', async () => {
  await R.init();
  for (const side of [-1, 1]) {
    const world = new R.World({ x:0, y:-22, z:0 }), car = new Vehicle(world);
    try {
      for (let i=0;i<12;i++) car.step({throttle:0, steer:side, brake:false});
      const legacy = .46*(1-Math.exp(-9*12*STEP));
      assert.ok(Math.abs(car.steering) < legacy*.6);
      for (let i=0;i<228;i++) car.step({throttle:0, steer:side, brake:false});
      assert.ok(Math.abs(car.steering) > .45);
      for (let i=0;i<36;i++) car.step({throttle:0, steer:0, brake:false});
      assert.ok(Math.abs(car.steering) < .05);
    } finally { world.free(); }
  }
});
