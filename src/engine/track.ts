import * as THREE from "three";

export interface Course {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  difficulty: string;
  width: number;
  color: string;
  sky: number;
  ground: number;
  medals: [number, number, number];
  points: number[][];
  checkpoints: number[];
  turbo: [number, number][];
  gaps: [number, number][];
  bank: [number, number, number][];
  jumps?: [number, number, number, number][];
  barriers?: [number, number, number][];
}

export const COURSES: Course[] = [
  {
    id: "v2-apex-01",
    name: "APEX VALLEY",
    subtitle: "01 / SPEED & FLOW",
    difficulty: "입문",
    description:
      "넓게 열리는 코너와 초록빛 계곡. 브레이킹 포인트를 찾고, 가장 짧은 라인을 그리세요.",
    width: 22,
    color: "#ed6438",
    sky: 0xc9dfdc,
    ground: 0x749c7c,
    medals: [38, 48, 65],
    points: [
      [0, 8, 0],
      [0, 8, 100],
      [25, 10, 200],
      [110, 12, 270],
      [230, 12, 260],
      [310, 9, 190],
      [330, 8, 80],
      [300, 8, -30],
      [220, 14, -120],
      [120, 18, -140],
      [40, 12, -120],
      [-35, 8, -150],
      [-100, 8, -80],
      [0, 8, -65],
    ],
    checkpoints: [0.23, 0.49, 0.76],
    turbo: [
      [0.075, 0.1],
      [0.51, 0.54],
    ],
    gaps: [],
    bank: [[0.25, 0.52, -0.17]],
  },
  {
    id: "v2-air-01",
    name: "SKYLINE RUN",
    subtitle: "02 / HEIGHT & FLIGHT",
    difficulty: "중급",
    description:
      "구름 위 뱅크 코너와 고속 도약. 점프 직전에 차체를 정렬하고 다음 플랫폼을 향하세요.",
    width: 20,
    color: "#5994ee",
    sky: 0xd8dfec,
    ground: 0x788ca8,
    medals: [44, 56, 75],
    points: [
      [0, 18, 0],
      [0, 18, 120],
      [0, 30, 230],
      [50, 44, 320],
      [170, 48, 360],
      [300, 44, 300],
      [340, 36, 200],
      [320, 26, 90],
      [380, 23, -20],
      [300, 18, -140],
      [160, 18, -180],
      [40, 22, -210],
      [-80, 22, -160],
      [-120, 18, -40],
      [0, 18, -65],
    ],
    checkpoints: [0.24, 0.51, 0.78],
    turbo: [
      [0.025, 0.05],
      [0.55, 0.575],
    ],
    gaps: [[0.075, 0.084]],
    bank: [
      [0.2, 0.48, -0.24],
      [0.61, 0.76, -0.16],
    ],
  },
  {
    id: "v2-pulse-01",
    name: "NEON SECTOR",
    subtitle: "03 / PRECISION & GRIP",
    difficulty: "상급",
    description:
      "연속 에스 코너, 긴 헤어핀, 야간 터널. 속도를 줄일 줄 아는 드라이버가 더 빠릅니다.",
    width: 19,
    color: "#b99afa",
    sky: 0x20253a,
    ground: 0x292d43,
    medals: [47, 60, 80],
    points: [
      [0, 8, 0],
      [0, 8, 110],
      [60, 10, 185],
      [140, 14, 200],
      [190, 14, 270],
      [280, 12, 300],
      [370, 10, 250],
      [370, 8, 150],
      [285, 8, 90],
      [260, 12, 0],
      [340, 16, -70],
      [330, 16, -150],
      [240, 12, -200],
      [140, 8, -165],
      [70, 8, -225],
      [-30, 8, -230],
      [-100, 8, -150],
      [-90, 8, -50],
      [0, 8, -60],
    ],
    checkpoints: [0.2, 0.42, 0.65, 0.84],
    turbo: [
      [0.045, 0.066],
      [0.64, 0.665],
    ],
    gaps: [],
    bank: [
      [0.24, 0.4, -0.12],
      [0.72, 0.88, 0.12],
    ],
  },
  {
    id: "v3-cascade-01",
    name: "CASCADE RALLY",
    subtitle: "04 / JUMP & DIVE",
    difficulty: "중급",
    description:
      "두 번의 계곡 도약, 급강하, 산을 감싸는 거대한 뱅크. 착지 후 이어지는 코너까지 라인을 설계하세요.",
    width: 23,
    color: "#e79d34",
    sky: 0xf0dfc8,
    ground: 0x9d9870,
    medals: [56, 70, 92],
    points: [
      [0, 14, 0],
      [0, 14, 150],
      [0, 18, 310],
      [80, 35, 430],
      [230, 50, 450],
      [380, 38, 370],
      [420, 16, 210],
      [460, 14, 70],
      [460, 14, -100],
      [410, 18, -240],
      [280, 28, -330],
      [110, 30, -310],
      [-25, 16, -370],
      [-170, 14, -300],
      [-200, 14, -150],
      [-125, 14, -40],
      [0, 14, -80],
    ],
    checkpoints: [0.19, 0.4, 0.65, 0.84],
    turbo: [
      [0.022, 0.045],
      [0.435, 0.46],
      [0.76, 0.78],
    ],
    gaps: [
      [0.064, 0.071],
      [0.49, 0.497],
    ],
    jumps: [
      [0.044, 0.064, 0.071, 2.8],
      [0.47, 0.49, 0.497, 2.8],
    ],
    bank: [
      [0.2, 0.4, -0.32],
      [0.55, 0.72, -0.22],
      [0.8, 0.94, -0.12],
    ],
  },
  {
    id: "v3-switch-01",
    name: "SWITCHBACK WORKS",
    subtitle: "05 / SLALOM & SWITCHBACK",
    difficulty: "상급",
    description:
      "좌우로 번갈아 열리는 방호벽, 고가 교차로와 연속 헤어핀. 브레이킹과 정확한 라인으로 공장 구역을 돌파하세요.",
    width: 24,
    color: "#52bba8",
    sky: 0xc6d4da,
    ground: 0x667f80,
    medals: [60, 78, 105],
    points: [
      [0, 10, 0],
      [0, 10, 160],
      [0, 10, 300],
      [100, 14, 390],
      [230, 22, 390],
      [300, 34, 290],
      [200, 38, 190],
      [70, 38, 180],
      [-45, 34, 280],
      [-150, 26, 270],
      [-190, 26, 150],
      [-140, 26, 30],
      [-70, 26, -100],
      [70, 12, -180],
      [220, 12, -180],
      [300, 10, -290],
      [200, 10, -380],
      [20, 10, -350],
      [-140, 10, -300],
      [-210, 10, -180],
      [-130, 10, -75],
      [0, 10, -70],
    ],
    checkpoints: [0.2, 0.4, 0.62, 0.82],
    turbo: [
      [0.027, 0.043],
      [0.64, 0.66],
    ],
    gaps: [],
    bank: [
      [0.2, 0.35, -0.15],
      [0.42, 0.55, 0.2],
      [0.68, 0.82, -0.18],
    ],
    barriers: [
      [0.062, -1, 1],
      [0.092, 1, 1],
      [0.125, -1, 1],
      [0.625, 1, 1],
    ],
  },
];

export interface TrackSample {
  p: THREE.Vector3;
  forward: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  q: THREE.Quaternion;
  t: number;
}

export class Track {
  readonly course: Course;
  readonly curve: THREE.CatmullRomCurve3;
  readonly length: number;
  readonly samples: TrackSample[];
  readonly segments: number;
  constructor(course: Course) {
    this.course = course;
    this.curve = new THREE.CatmullRomCurve3(
      course.points.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
      true,
      "centripetal",
    );
    this.curve.arcLengthDivisions = 3000;
    this.length = this.curve.getLength();
    this.segments = Math.ceil(this.length / 2.5);
    this.samples = Array.from({ length: this.segments + 1 }, (_, i) =>
      this.sample(i / this.segments),
    );
  }
  sample(t: number): TrackSample {
    const u = ((t % 1) + 1) % 1;
    const p = this.point(u);
    const forward = this.point((u + 0.00005) % 1)
      .sub(this.point((u - 0.00005 + 1) % 1))
      .normalize();
    const right = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), forward)
      .normalize();
    let angle = 0;
    for (const [start, end, amount] of this.course.bank) {
      if (u > start && u < end)
        angle +=
          Math.sin(((u - start) / (end - start)) * Math.PI) ** 2 * amount;
    }
    right.applyAxisAngle(forward, angle);
    const up = new THREE.Vector3().crossVectors(forward, right).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, up, forward),
    );
    return { p, forward, right, up, q, t: u };
  }
  private point(u: number): THREE.Vector3 {
    const p = this.curve.getPointAt(u);
    if (this.course.id === "v2-air-01") {
      // Build the launch slope into both road mesh and collider; no artificial jump impulse.
      if (u > 0.055 && u <= 0.075) p.y += 2.5 * ((u - 0.055) / 0.02) ** 2;
      else if (u > 0.075 && u < 0.084) p.y += 2.5 * (1 - (u - 0.075) / 0.009);
    }
    for (const [start, end, landing, lift] of this.course.jumps ?? []) {
      if (u > start && u <= end)
        p.y += lift * ((u - start) / (end - start)) ** 2;
      else if (u > end && u < landing)
        p.y += lift * (1 - (u - end) / (landing - end));
    }
    return p;
  }
  wallVertices(index: number, side: number): Float32Array {
    const vertices: number[] = [];
    for (const s of [this.samples[index], this.samples[index + 1]]) {
      for (const [out, height] of [
        [0, -0.65],
        [0.7, -0.65],
        [0.7, 1.45],
        [0, 1.45],
      ]) {
        const p = s.p
          .clone()
          .addScaledVector(s.right, side * (this.course.width / 2 + out))
          .addScaledVector(s.up, height);
        vertices.push(p.x, p.y, p.z);
      }
    }
    return new Float32Array(vertices);
  }
  wallGeometry(): THREE.BufferGeometry {
    const vertices: number[] = [], colors: number[] = [], indices: number[] = [];
    const yellow = new THREE.Color(0xffc629), black = new THREE.Color(0x161c25);
    for (let i = 0; i < this.segments; i++) {
      if (this.gap((i + .5) / this.segments)) continue;
      const color = Math.floor(i / 3) % 2 ? black : yellow;
      for (const side of [-1, 1]) {
        const offset = vertices.length / 3;
        vertices.push(...this.wallVertices(i, side));
        for (let j = 0; j < 8; j++) colors.push(color.r, color.g, color.b);
        for (const [a,b,c,d] of [[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]]) {
          indices.push(offset+a,offset+b,offset+c,offset+a,offset+c,offset+d);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }
  gap(t: number): boolean {
    return this.course.gaps.some(([a, b]) => t > a && t < b);
  }
  boost(t: number): boolean {
    return this.course.turbo.some(([a, b]) => t > a && t < b);
  }
  nearest(position: THREE.Vector3): {
    sample: TrackSample;
    lateral: number;
    distance: number;
  } {
    let index = 0,
      best = Infinity;
    for (let i = 0; i < this.segments; i++) {
      const d = this.samples[i].p.distanceToSquared(position);
      if (d < best) {
        best = d;
        index = i;
      }
    }
    const a = this.samples[index],
      b = this.samples[(index + 1) % this.segments];
    const c = this.samples[(index + this.segments - 1) % this.segments];
    let sample = a;
    // Project to either neighboring segment so HUD/progress is not quantized.
    for (const [first, second] of [
      [c, a],
      [a, b],
    ]) {
      const delta = second.p.clone().sub(first.p);
      const f = THREE.MathUtils.clamp(
        position.clone().sub(first.p).dot(delta) / delta.lengthSq(),
        0,
        1,
      );
      const p = first.p.clone().addScaledVector(delta, f);
      if (p.distanceToSquared(position) < best) {
        best = p.distanceToSquared(position);
        let end = second.t;
        if (end < first.t) end += 1;
        sample = this.sample(first.t + (end - first.t) * f);
      }
    }
    return {
      sample,
      lateral: position.clone().sub(sample.p).dot(sample.right),
      distance: Math.sqrt(best),
    };
  }
  geometry(
    left: number,
    right: number,
    height = 0,
    wall = false,
  ): THREE.BufferGeometry {
    const vertices: number[] = [],
      indices: number[] = [];
    for (const s of this.samples) {
      const a = s.p
        .clone()
        .addScaledVector(s.right, left)
        .addScaledVector(s.up, height);
      const b = wall
        ? a.clone().addScaledVector(s.up, 1.45)
        : s.p
            .clone()
            .addScaledVector(s.right, right)
            .addScaledVector(s.up, height);
      vertices.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    for (let i = 0; i < this.segments; i++) {
      if (this.gap((i + 0.5) / this.segments)) continue;
      const a = i * 2,
        b = a + 2;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }
}
