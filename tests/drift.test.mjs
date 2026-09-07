import assert from 'node:assert/strict';
import {test} from 'node:test';
import RAPIER from '@dimforge/rapier3d-compat';
import {Track,COURSES} from '../src/engine/track.ts';
import {Vehicle,createWorld} from '../src/engine/vehicle.ts';

test('space drift retains more lateral grip than the previous tune while still slowing down',async()=>{
  await RAPIER.init();
  function run(legacy) {
    const track=new Track({...COURSES[0],width:200});
    const world=createWorld(track),car=new Vehicle(world);
    try {
      car.reset(track,.04);
      const tick=input=>{car.step(input);world.step();car.sync();};
      for(let i=0;i<120;i++)tick({throttle:0,steer:0,brake:false});
      car.body.setLinvel(track.sample(.04).forward.multiplyScalar(30),true);car.sync();
      if(legacy) {
        const friction=car.controller.setWheelFrictionSlip.bind(car.controller);
        const brake=car.controller.setWheelBrake.bind(car.controller);
        const engine=car.controller.setWheelEngineForce.bind(car.controller);
        car.controller.setWheelFrictionSlip=(i,value)=>friction(i,i>=2?1.15:value);
        car.controller.setWheelBrake=(i)=>brake(i,i>=2?40:10);
        car.controller.setWheelEngineForce=(i,value)=>engine(i,value/.45);
      }
      let slip=0,contacts=0;
      for(let i=0;i<120;i++){tick({throttle:1,steer:1,brake:true});slip=Math.max(slip,Math.abs(car.slip));if(car.grounded>=3)contacts++;}
      return {slip,speed:car.speed,contacts};
    } finally {world.free();}
  }
  const old=run(true),current=run(false);console.log({old,current});
  assert.ok(current.slip<old.slip*.9,'drift must reduce excessive lateral slip');
  assert.ok(current.slip>.02,'retain a controllable slide');
  assert.ok(current.speed<108,'space must still decelerate under throttle');
  assert.ok(current.contacts>110,'retain road contact during the slide');
});
