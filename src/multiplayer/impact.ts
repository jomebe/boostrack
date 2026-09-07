import * as THREE from 'three';

export interface Motion { from: number[]; to: number[]; q: number[] }

// Sweep two pairs of chassis-sized circles between server samples. Height separates bridges.
// Equal/opposite velocity changes give a bounded arcade bump without teleporting either body.
export function carImpact(a: Motion, b: Motion, dt: number): number[] | null {
  const ap = new THREE.Vector3().fromArray(a.from), bp = new THREE.Vector3().fromArray(b.from);
  const ad = new THREE.Vector3().fromArray(a.to).sub(ap), bd = new THREE.Vector3().fromArray(b.to).sub(bp);
  const af = new THREE.Vector3(0,0,.7).applyQuaternion(new THREE.Quaternion().fromArray(a.q));
  const bf = new THREE.Vector3(0,0,.7).applyQuaternion(new THREE.Quaternion().fromArray(b.q));
  const relative = bd.clone().sub(ad), velocity = relative.clone().divideScalar(dt);
  const steps = Math.min(64, Math.max(1, Math.ceil(relative.length()/.4)));
  for (let i=0;i<=steps;i++) {
    const ac = ap.clone().addScaledVector(ad,i/steps), bc = bp.clone().addScaledVector(bd,i/steps);
    if (Math.abs(ac.y-bc.y)>.9) continue;
    for (const frontA of [-1,1]) for (const frontB of [-1,1]) {
      const normal = bc.clone().addScaledVector(bf,frontB).sub(ac.clone().addScaledVector(af,frontA));
      normal.y=0;
      const distance = normal.length();
      if (distance>=1.7) continue;
      if(distance<.001) normal.set(1,0,0); else normal.divideScalar(distance);
      const closing = -velocity.dot(normal);
      if(closing<-.5) continue;
      return normal.multiplyScalar(Math.min(20,Math.max(0,closing)*.6+Math.min(3,(1.7-distance)*3))).toArray();
    }
  }
  return null;
}
