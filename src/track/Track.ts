import * as THREE from 'three';

export interface TrackSample {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  side: THREE.Vector3;
  progress: number;
  bank: number;
}

export interface TrackLocation extends TrackSample {
  distance: number;
  index: number;
}

const TRACK_WIDTH = 19;
const SAMPLE_COUNT = 700;

function seeded(index: number): number {
  const x = Math.sin(index * 91.733) * 43758.5453;
  return x - Math.floor(x);
}

export class Track {
  readonly group = new THREE.Group();
  readonly samples: TrackSample[] = [];
  readonly checkpoints = [0.245, 0.505, 0.715];
  readonly boostPads = [0.29, 0.825];
  readonly jumps = [0.335, 0.66];
  readonly width = TRACK_WIDTH;
  readonly start: TrackSample;

  private curve: THREE.CatmullRomCurve3;

  constructor(scene: THREE.Scene) {
    this.curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 95),
      new THREE.Vector3(30, 0, 190), new THREE.Vector3(-34, 0, 285),
      new THREE.Vector3(15, 0, 380), new THREE.Vector3(4, 0, 485),
      new THREE.Vector3(48, 0, 585), new THREE.Vector3(84, 0, 690),
      new THREE.Vector3(52, 0, 805), new THREE.Vector3(-28, 0, 910),
      new THREE.Vector3(-12, 0, 1020), new THREE.Vector3(0, 0, 1135),
      new THREE.Vector3(0, 0, 1250), new THREE.Vector3(0, 0, 1390),
    ], false, 'catmullrom', 0.38);
    this.buildSamples();
    this.start = this.samples[0];
    this.buildRoad();
    this.buildScenery();
    scene.add(this.group);
  }

  private heightAt(t: number): number {
    const mound = (center: number, radius: number, height: number) => {
      const d = Math.abs(t - center) / radius;
      return d < 1 ? Math.sin((1 - d) * Math.PI / 2) * height : 0;
    };
    return mound(0.33, 0.045, 8) + mound(0.66, 0.035, 5) + mound(0.53, 0.08, 2.5);
  }

  private bankAt(t: number): number {
    if (t < 0.44 || t > 0.56) return 0;
    return Math.sin(((t - 0.44) / 0.12) * Math.PI) * -0.24;
  }

  private buildSamples(): void {
    for (let i = 0; i <= SAMPLE_COUNT; i += 1) {
      const progress = i / SAMPLE_COUNT;
      const position = this.curve.getPointAt(progress);
      position.y = this.heightAt(progress);
      const ahead = this.curve.getPointAt(Math.min(1, progress + 0.002));
      const behind = this.curve.getPointAt(Math.max(0, progress - 0.002));
      ahead.y = this.heightAt(Math.min(1, progress + 0.002));
      behind.y = this.heightAt(Math.max(0, progress - 0.002));
      const tangent = ahead.sub(behind).normalize();
      const side = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
      this.samples.push({ position, tangent, side, progress, bank: this.bankAt(progress) });
    }
  }

  private buildRoad(): void {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const roadColor = new THREE.Color(0x273044);
    for (const sample of this.samples) {
      const bankY = Math.sin(sample.bank) * TRACK_WIDTH * 0.5;
      const left = sample.position.clone().addScaledVector(sample.side, TRACK_WIDTH * 0.5);
      const right = sample.position.clone().addScaledVector(sample.side, -TRACK_WIDTH * 0.5);
      left.y += bankY;
      right.y -= bankY;
      positions.push(...left.toArray(), ...right.toArray());
      const stripe = Math.floor(sample.progress * 80) % 2 === 0;
      const color = stripe ? roadColor : roadColor.clone().multiplyScalar(0.92);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
    for (let i = 0; i < this.samples.length - 1; i += 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const road = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.05 }));
    road.receiveShadow = true;
    this.group.add(road);

    for (let i = 0; i < this.samples.length; i += 7) {
      const sample = this.samples[i];
      this.addEdgeMarker(sample, 1);
      this.addEdgeMarker(sample, -1);
    }
    this.addStartFinish();
    this.checkpoints.forEach((progress, index) => this.addGate(progress, `CP ${index + 1}`, 0x49e9ff));
    this.boostPads.forEach((progress) => this.addBoostPad(progress));
    this.addTunnel(0.585);
    this.addLoop(0.77);
  }

  private addEdgeMarker(sample: TrackSample, sideSign: number): void {
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.22, 2.3),
      new THREE.MeshStandardMaterial({ color: Math.floor(sample.progress * 100) % 2 ? 0xf6f8ff : 0xff4057, roughness: 0.6 }),
    );
    marker.position.copy(sample.position).addScaledVector(sample.side, sideSign * (TRACK_WIDTH * 0.5 - 0.42));
    marker.position.y += 0.16;
    marker.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z);
    marker.castShadow = true;
    this.group.add(marker);
  }

  private addGate(progress: number, label: string, color: number): void {
    const sample = this.sampleAt(progress);
    const gate = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, roughness: 0.25 });
    const postGeo = new THREE.BoxGeometry(0.38, 5.3, 0.38);
    for (const x of [-TRACK_WIDTH * 0.52, TRACK_WIDTH * 0.52]) {
      const post = new THREE.Mesh(postGeo, mat);
      post.position.set(x, 2.65, 0);
      gate.add(post);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 0.8, 0.42, 0.42), mat);
    top.position.y = 5.1;
    gate.add(top);
    const sprite = this.makeLabel(label, color);
    sprite.position.y = 6.35;
    gate.add(sprite);
    gate.position.copy(sample.position);
    gate.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z);
    this.group.add(gate);
  }

  private addStartFinish(): void {
    this.addGate(0.012, 'START', 0xffd84b);
    this.addGate(0.985, 'FINISH', 0xff4f70);
  }

  private makeLabel(text: string, color: number): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext('2d')!;
    context.font = '900 58px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    context.fillText(text, 256, 64);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }));
    sprite.scale.set(8, 2, 1);
    return sprite;
  }

  private addBoostPad(progress: number): void {
    const sample = this.sampleAt(progress);
    const group = new THREE.Group();
    for (let i = -2; i <= 2; i += 1) {
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.08, 4.6),
        new THREE.MeshStandardMaterial({ color: 0x13d9ff, emissive: 0x13bde8, emissiveIntensity: 2.2, roughness: 0.25 }),
      );
      pad.position.x = i * 3.1;
      group.add(pad);
    }
    group.position.copy(sample.position);
    group.position.y += 0.1;
    group.rotation.y = Math.atan2(sample.tangent.x, sample.tangent.z);
    this.group.add(group);
  }

  private addTunnel(progress: number): void {
    const center = this.sampleAt(progress);
    const tunnel = new THREE.Group();
    for (let z = -22; z <= 22; z += 5.5) {
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(10.4, 0.28, 6, 18, Math.PI),
        new THREE.MeshStandardMaterial({ color: 0x5f6f8d, roughness: 0.65 }),
      );
      arch.position.set(0, 0.25, z);
      tunnel.add(arch);
    }
    tunnel.position.copy(center.position);
    tunnel.rotation.y = Math.atan2(center.tangent.x, center.tangent.z);
    this.group.add(tunnel);
  }

  private addLoop(progress: number): void {
    const center = this.sampleAt(progress);
    const group = new THREE.Group();
    const loop = new THREE.Mesh(
      new THREE.TorusGeometry(13, 2.1, 10, 48),
      new THREE.MeshStandardMaterial({ color: 0x3a4761, roughness: 0.62, metalness: 0.15 }),
    );
    loop.position.y = 13;
    group.add(loop);
    const glow = new THREE.Mesh(
      new THREE.TorusGeometry(13, 0.18, 6, 64),
      new THREE.MeshBasicMaterial({ color: 0x48e7ff }),
    );
    glow.position.y = 13;
    glow.position.z = -2.05;
    group.add(glow);
    group.position.copy(center.position);
    group.rotation.y = Math.atan2(center.tangent.x, center.tangent.z);
    this.group.add(group);
  }

  private buildScenery(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 2400),
      new THREE.MeshStandardMaterial({ color: 0x6fa85b, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -1.2, 650);
    ground.receiveShadow = true;
    this.group.add(ground);

    for (let i = 0; i < 90; i += 1) {
      const progress = seeded(i * 3) * 0.95;
      const sample = this.sampleAt(progress);
      const side = seeded(i * 3 + 1) > 0.5 ? 1 : -1;
      const distance = 25 + seeded(i * 3 + 2) * 105;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 3.4, 6), new THREE.MeshStandardMaterial({ color: 0x6f4933 }));
      trunk.position.y = 1.7;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(2.6 + seeded(i) * 1.6, 7, 7), new THREE.MeshStandardMaterial({ color: i % 3 ? 0x276f4a : 0x358559, roughness: 1 }));
      crown.position.y = 5.1;
      tree.add(trunk, crown);
      tree.position.copy(sample.position).addScaledVector(sample.side, side * distance);
      tree.position.y = -1;
      this.group.add(tree);
    }

    for (let i = 0; i < 28; i += 1) {
      const side = i % 2 ? 1 : -1;
      const mountain = new THREE.Mesh(
        new THREE.ConeGeometry(40 + seeded(i) * 45, 60 + seeded(i + 30) * 85, 6),
        new THREE.MeshStandardMaterial({ color: i % 3 === 0 ? 0x718091 : 0x647b75, roughness: 1, flatShading: true }),
      );
      mountain.position.set(side * (150 + seeded(i + 10) * 300), 25, i * 58 - 30);
      mountain.rotation.y = seeded(i + 20) * Math.PI;
      this.group.add(mountain);
    }
  }

  sampleAt(progress: number): TrackSample {
    return this.samples[Math.min(SAMPLE_COUNT, Math.max(0, Math.round(progress * SAMPLE_COUNT)))];
  }

  nearest(position: THREE.Vector3, hint = 0): TrackLocation {
    const center = Math.round(hint * SAMPLE_COUNT);
    let bestIndex = Math.min(SAMPLE_COUNT, Math.max(0, center));
    let bestDistance = Number.POSITIVE_INFINITY;
    const radius = hint > 0 ? 75 : SAMPLE_COUNT;
    for (let i = Math.max(0, center - radius); i <= Math.min(SAMPLE_COUNT, center + radius); i += 1) {
      const sample = this.samples[i];
      const dx = position.x - sample.position.x;
      const dz = position.z - sample.position.z;
      const distance = dx * dx + dz * dz;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    const sample = this.samples[bestIndex];
    const offset = position.clone().sub(sample.position);
    return { ...sample, distance: offset.dot(sample.side), index: bestIndex };
  }
}
