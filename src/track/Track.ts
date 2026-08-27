import * as THREE from 'three';

export interface TrackDefinition {
  id: string;
  name: string;
  subtitle: string;
  accent: number;
  roadColor: number;
  points: Array<[number, number]>;
  checkpoints: number[];
  boostPads: number[];
  jumps: number[];
  tunnel: number;
  loop: number;
  bankStart: number;
  bankEnd: number;
}

export const TRACKS: TrackDefinition[] = [
  {
    id: 'boost-valley', name: 'BOOST VALLEY', subtitle: 'FLOATING VALLEY · 3 CP', accent: 0x48e7ff, roadColor: 0x273044,
    points: [[0, 0], [0, 95], [30, 190], [-34, 285], [15, 380], [4, 485], [48, 585], [84, 690], [52, 805], [-28, 910], [-12, 1020], [0, 1135], [0, 1250], [0, 1390]],
    checkpoints: [0.245, 0.505, 0.715], boostPads: [0.29, 0.825], jumps: [0.335, 0.66], tunnel: 0.585, loop: 0.77, bankStart: 0.44, bankEnd: 0.56,
  },
  {
    id: 'skyline-sprint', name: 'SKYLINE SPRINT', subtitle: 'CLOUD CIRCUIT · 3 CP', accent: 0xffc44d, roadColor: 0x342b46,
    points: [[0, 0], [0, 88], [-48, 165], [-86, 255], [-38, 350], [42, 420], [86, 515], [45, 610], [-35, 700], [-72, 795], [-18, 890], [34, 990], [0, 1090], [0, 1240]],
    checkpoints: [0.23, 0.49, 0.73], boostPads: [0.18, 0.78], jumps: [0.31, 0.65], tunnel: 0.54, loop: 0.83, bankStart: 0.38, bankEnd: 0.5,
  },
];

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
const ELEVATION = 43;

function seeded(index: number): number {
  const x = Math.sin(index * 91.733) * 43758.5453;
  return x - Math.floor(x);
}

export class Track {
  readonly group = new THREE.Group();
  readonly samples: TrackSample[] = [];
  readonly checkpoints: number[];
  readonly boostPads: number[];
  readonly jumps: number[];
  readonly width = TRACK_WIDTH;
  readonly start: TrackSample;
  readonly definition: TrackDefinition;
  private readonly curve: THREE.CatmullRomCurve3;

  constructor(scene: THREE.Scene, definition: TrackDefinition) {
    this.definition = definition;
    this.checkpoints = definition.checkpoints;
    this.boostPads = definition.boostPads;
    this.jumps = definition.jumps;
    this.curve = new THREE.CatmullRomCurve3(definition.points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', 0.38);
    this.buildSamples();
    this.start = this.samples[0];
    this.buildRoad();
    this.buildScenery();
    scene.add(this.group);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
  }

  private heightAt(t: number): number {
    const mound = (center: number, radius: number, height: number) => {
      const d = Math.abs(t - center) / radius;
      return d < 1 ? Math.sin((1 - d) * Math.PI / 2) * height : 0;
    };
    return ELEVATION + mound(this.jumps[0], 0.045, 8) + mound(this.jumps[1], 0.04, 6) + mound(this.definition.bankStart + 0.09, 0.08, 2.5);
  }

  private bankAt(t: number): number {
    const { bankStart, bankEnd } = this.definition;
    if (t < bankStart || t > bankEnd) return 0;
    return Math.sin(((t - bankStart) / (bankEnd - bankStart)) * Math.PI) * -0.24;
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
    const roadColor = new THREE.Color(this.definition.roadColor);
    for (const sample of this.samples) {
      const bankY = Math.sin(sample.bank) * TRACK_WIDTH * 0.5;
      const left = sample.position.clone().addScaledVector(sample.side, TRACK_WIDTH * 0.5);
      const right = sample.position.clone().addScaledVector(sample.side, -TRACK_WIDTH * 0.5);
      left.y += bankY;
      right.y -= bankY;
      positions.push(...left.toArray(), ...right.toArray());
      const stripe = Math.floor(sample.progress * 80) % 2 === 0;
      const color = stripe ? roadColor : roadColor.clone().multiplyScalar(0.88);
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
      this.addEdgeMarker(this.samples[i], 1);
      this.addEdgeMarker(this.samples[i], -1);
    }
    this.addGate(0.012, 'START', 0xffd84b);
    this.addGate(0.985, 'FINISH', 0xff4f70);
    this.checkpoints.forEach((progress, index) => this.addGate(progress, `CP ${index + 1}`, this.definition.accent));
    this.boostPads.forEach((progress) => this.addBoostPad(progress));
    this.addTunnel(this.definition.tunnel);
    this.addLoop(this.definition.loop);
  }

  private addEdgeMarker(sample: TrackSample, sideSign: number): void {
    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 2.3), new THREE.MeshStandardMaterial({ color: Math.floor(sample.progress * 100) % 2 ? 0xf6f8ff : 0xff4057, roughness: 0.6 }));
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
    for (const x of [-TRACK_WIDTH * 0.52, TRACK_WIDTH * 0.52]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.38, 5.3, 0.38), mat);
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
      const pad = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 4.6), new THREE.MeshStandardMaterial({ color: 0x13d9ff, emissive: 0x13bde8, emissiveIntensity: 2.6, roughness: 0.25 }));
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
      const arch = new THREE.Mesh(new THREE.TorusGeometry(10.4, 0.28, 6, 18, Math.PI), new THREE.MeshStandardMaterial({ color: 0x5f6f8d, roughness: 0.65 }));
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
    const loop = new THREE.Mesh(new THREE.TorusGeometry(13, 2.1, 10, 48), new THREE.MeshStandardMaterial({ color: 0x3a4761, roughness: 0.62, metalness: 0.15 }));
    loop.position.y = 13;
    group.add(loop);
    const glow = new THREE.Mesh(new THREE.TorusGeometry(13, 0.18, 6, 64), new THREE.MeshBasicMaterial({ color: this.definition.accent }));
    glow.position.set(0, 13, -2.05);
    group.add(glow);
    group.position.copy(center.position);
    group.rotation.y = Math.atan2(center.tangent.x, center.tangent.z);
    this.group.add(group);
  }

  private buildScenery(): void {
    for (let i = 18; i < this.samples.length; i += 36) {
      const sample = this.samples[i];
      const rock = new THREE.Mesh(new THREE.ConeGeometry(14 + seeded(i) * 12, 40 + seeded(i + 1) * 20, 7), new THREE.MeshStandardMaterial({ color: 0x536173, roughness: 1, flatShading: true }));
      rock.position.copy(sample.position);
      rock.position.y -= 23;
      rock.rotation.y = seeded(i + 2) * Math.PI;
      this.group.add(rock);
    }
    for (let i = 0; i < 66; i += 1) {
      const progress = seeded(i * 3) * 0.95;
      const sample = this.sampleAt(progress);
      const side = seeded(i * 3 + 1) > 0.5 ? 1 : -1;
      const distance = 25 + seeded(i * 3 + 2) * 75;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 3.4, 6), new THREE.MeshStandardMaterial({ color: 0x6f4933 }));
      trunk.position.y = 1.7;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(2.6 + seeded(i) * 1.6, 7, 7), new THREE.MeshStandardMaterial({ color: i % 3 ? 0x276f4a : 0x358559, roughness: 1 }));
      crown.position.y = 5.1;
      tree.add(trunk, crown);
      tree.position.copy(sample.position).addScaledVector(sample.side, side * distance);
      tree.position.y = sample.position.y - 3;
      this.group.add(tree);
    }
    for (let i = 0; i < 20; i += 1) {
      const side = i % 2 ? 1 : -1;
      const mountain = new THREE.Mesh(new THREE.ConeGeometry(45 + seeded(i) * 45, 70 + seeded(i + 30) * 85, 6), new THREE.MeshStandardMaterial({ color: i % 3 === 0 ? 0x718091 : 0x647b75, roughness: 1, flatShading: true }));
      mountain.position.set(side * (150 + seeded(i + 10) * 300), -10, i * 70 - 50);
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
