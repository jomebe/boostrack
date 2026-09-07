import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {setTimeout as delay} from 'node:timers/promises';
import * as THREE from 'three';
import {PROTOCOL} from '../src/multiplayer/protocol.ts';
const endpoint=process.env.MULTIPLAYER_ENDPOINT||'http://127.0.0.1:8787', origin='https://boostrack.pages.dev';
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await delay(60);}throw Error('server wait timed out');}
async function connect(code){
  const ws=new WebSocket(`${endpoint.replace(/^http/,'ws')}/ws/${code}?name=CollisionQA&v=${PROTOCOL}`,{origin});
  const c={ws,room:null,id:'',hits:[]};
  ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='room')c.room=m;if(m.type==='welcome')c.id=m.id;if(m.type==='impact')c.hits.push(m);});
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
  await until(()=>c.room);return c;
}
const send=(c,m)=>c.ws.send(JSON.stringify(m));
for(const enabled of [false,true]){
  const response=await fetch(`${endpoint}/rooms?course=v2-apex-01`,{method:'POST',headers:{Origin:origin}});
  assert.equal(response.status,200);
  const {code}=await response.json(),a=await connect(code),b=await connect(code);
  try{
    await until(()=>a.room.players.length===2);
    send(b,{type:'collisions',enabled:true});await delay(120);assert.equal(a.room.collisions,false);
    send(b,{type:'course',course:'v2-air-01'});await delay(80);assert.equal(a.room.course,'v2-apex-01');
    send(a,{type:'course',course:'v2-air-01'});await until(()=>b.room.course==='v2-air-01');
    send(a,{type:'course',course:'v2-apex-01'});await until(()=>b.room.course==='v2-apex-01');
    send(a,{type:'ready'});send(b,{type:'ready'});await until(()=>a.room.players.every(p=>p.ready));
    send(a,{type:'collisions',enabled});await until(()=>a.room.players.every(p=>!p.ready));
    assert.equal(b.room.collisions,enabled);
    send(a,{type:'ready'});send(b,{type:'ready'});await until(()=>a.room.players.every(p=>p.ready));
    send(a,{type:'start'});await until(()=>a.room.phase==='race');
    send(a,{type:'collisions',enabled:!enabled});await delay(100);assert.equal(a.room.collisions,enabled);
    send(a,{type:'course',course:'v2-air-01'});await delay(80);assert.equal(a.room.course,'v2-apex-01');
    await delay(Math.max(0,a.room.startAt-Date.now()+2200));
    const spawn=a.room.players.find(p=>p.id===a.id),q=spawn.q;
    const right=new THREE.Vector3(1,0,0).applyQuaternion(new THREE.Quaternion().fromArray(q));
    const center=new THREE.Vector3().fromArray(spawn.p).addScaledVector(right,enabled?2.2:0);
    for(let i=0;i<12;i++){
      const offset=Math.max(.55,2.2-i*.2);
      send(a,{type:'pose',p:center.clone().addScaledVector(right,-offset).toArray(),q});
      send(b,{type:'pose',p:center.clone().addScaledVector(right,offset).toArray(),q});
      await delay(65);
    }
    if(enabled){
      assert.ok(a.hits.length>0&&b.hits.length>0,'both racers receive real collision reaction');
      assert.ok(a.hits[0].velocity.every((v,i)=>Math.abs(v+b.hits[0].velocity[i])<1e-9));
      const count=a.hits.length;
      send(a,{type:'recover'});await delay(80);
      for(let i=0;i<5;i++){
        send(a,{type:'pose',p:center.toArray(),q});send(b,{type:'pose',p:center.toArray(),q});await delay(65);
      }
      assert.equal(a.hits.length,count,'recovery protects against impacts');
    }else assert.equal(a.hits.length+b.hits.length,0,'disabled cars pass through');
    a.ws.close();await until(()=>b.room.host===b.id);
    assert.equal(b.room.collisions,enabled,'host migration preserves option');
  }finally{a.ws.close();b.ws.close();}
}
console.log('PASS collision ON/OFF, host-only setting, ready reset, race lock, equal/opposite impacts, recovery protection and host migration.');
