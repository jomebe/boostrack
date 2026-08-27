import * as THREE from 'three';

function material(color: number, emissive = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.35, emissive, emissiveIntensity: emissive ? 1.5 : 0 });
}

export function createCar(ghost = false): THREE.Group {
  const car = new THREE.Group();
  car.name = ghost ? 'PB Ghost' : 'Player car';

  const bodyMat = material(ghost ? 0x4de5ff : 0xff4057, ghost ? 0x165d68 : 0);
  const darkMat = material(0x101522);
  if (ghost) {
    bodyMat.transparent = true;
    bodyMat.opacity = 0.3;
    bodyMat.depthWrite = false;
    darkMat.transparent = true;
    darkMat.opacity = 0.16;
  }

  const lower = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.48, 4.2), bodyMat);
  lower.position.y = 0.65;
  lower.castShadow = !ghost;
  car.add(lower);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.28, 1.3), bodyMat);
  nose.position.set(0, 0.86, 1.55);
  nose.rotation.x = -0.08;
  car.add(nose);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.58, 1.65), material(ghost ? 0x8cf3ff : 0x14243d, ghost ? 0x165d68 : 0));
  cabin.position.set(0, 1.1, -0.2);
  cabin.rotation.x = -0.05;
  car.add(cabin);

  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.12, 0.45), bodyMat);
  spoiler.position.set(0, 1.17, -1.7);
  spoiler.castShadow = !ghost;
  car.add(spoiler);
  const spoilerPost = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.38, 0.12), darkMat);
  spoilerPost.position.set(0.65, 0.98, -1.65);
  car.add(spoilerPost, spoilerPost.clone());
  spoilerPost.position.x = -0.65;

  const wheelGeometry = new THREE.CylinderGeometry(0.47, 0.47, 0.36, 14);
  for (const x of [-1.08, 1.08]) {
    for (const z of [-1.25, 1.25]) {
      const wheel = new THREE.Mesh(wheelGeometry, darkMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.48, z);
      wheel.castShadow = !ghost;
      wheel.name = 'wheel';
      car.add(wheel);
    }
  }

  const glass = material(0x75d8ff, 0x123849);
  for (const x of [-0.58, 0.58]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.08), glass);
    light.position.set(x, 0.73, 2.13);
    car.add(light);
  }

  const tailMat = material(0xff184c, 0xff184c);
  for (const x of [-0.62, 0.62]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.08), tailMat);
    tail.position.set(x, 0.73, -2.12);
    car.add(tail);
  }

  return car;
}
