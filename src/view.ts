import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { racingFov } from './camera-fov.ts';
import type { CameraMode } from './storage.ts';
import RAPIER from "@dimforge/rapier3d-compat";
import { Track } from "./engine/track.ts";
import { Vehicle, WHEELS } from "./engine/vehicle.ts";
import type { RecordRun } from "./engine/race.ts";
import type { Racer } from "./multiplayer/protocol.ts";

function material(color: THREE.ColorRepresentation, emissive = false) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.8,
    metalness: 0.05,
    flatShading: true,
    emissive: emissive ? color : 0,
    emissiveIntensity: emissive ? 0.6 : 0,
  });
}
function box(
  parent: THREE.Object3D,
  size: number[],
  pos: number[],
  mat: THREE.Material,
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    mat,
  );
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function carModel(ghost = false, color?: THREE.ColorRepresentation) {
  const group = new THREE.Group();
  const paint = material(color ?? (ghost ? 0x78eee4 : 0xf36a3e)),
    black = material(0x18212c),
    glass = material(0x3c6069),
    white = material(0xf3eddd);
  const materials = [paint, black, glass, white];
  if (ghost)
    materials.forEach((m) => {
      m.transparent = true;
      m.opacity = 0.28;
      m.depthWrite = false;
    });
  box(group, [1.5, 0.35, 2.85], [0, 0.08, 0], paint);
  const nose = box(group, [1.15, 0.19, 1.1], [0, 0.02, 1.28], paint);
  nose.rotation.x = 0.09;
  box(group, [0.94, 0.34, 0.9], [0, 0.4, -0.22], glass);
  box(group, [1.06, 0.1, 0.7], [0, 0.6, -0.3], black);
  box(group, [0.22, 0.365, 2.65], [0, 0.09, 0.04], white);
  const wing=new THREE.Group();group.add(wing);
  box(wing, [2, 0.12, 0.44], [0, 0.44, -1.45], black);
  for (const x of [-0.58, 0.58])
    box(wing, [0.09, 0.36, 0.12], [x, 0.26, -1.45], black);
  for (const x of [-0.48, 0.48])
    box(group, [0.27, 0.07, 0.05], [x, 0.14, 1.85], white);
  const wheels: THREE.Group[] = [];
  for (const [x, , z] of WHEELS) {
    const pivot = new THREE.Group();
    pivot.position.set(x, -0.22, z);
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12),
      black,
    );
    tire.rotation.z = Math.PI / 2;
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 0.295, 8),
      white,
    );
    hub.rotation.z = Math.PI / 2;
    pivot.add(tire, hub);
    group.add(pivot);
    wheels.push(pivot);
  }
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = !ghost;
  });
  return { group, wheels, paint, accent:white, wing };
}

export class View {
  cameraMode: CameraMode = 'chase';
  private cameraCut = true;
  setCameraMode(mode: CameraMode) { this.cameraMode = mode; this.cameraCut = true; }
  private opponents = new Map<
    string,
    {
      model: ReturnType<typeof carModel>;
      p: THREE.Vector3;
      q: THREE.Quaternion;
      label: HTMLDivElement;
    }
  >();
  setOpponents(players: Racer[]) {
    for (const [id, opponent] of this.opponents)
      if (!players.some((p) => p.id === id)) {
        this.scene.remove(opponent.model.group);
        opponent.label.remove();
        opponent.model.group.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            (Array.isArray(o.material) ? o.material : [o.material]).forEach(
              (m) => m.dispose(),
            );
          }
        });
        this.opponents.delete(id);
      }
    for (const p of players) {
      let car = this.opponents.get(p.id);
      if (!car) {
        const model = carModel(false, p.color),
          label = document.createElement("div");
        label.className = "opponent-label";
        label.textContent = p.name;
        document.body.append(label);
        car = {
          model,
          p: new THREE.Vector3().fromArray(p.p),
          q: new THREE.Quaternion().fromArray(p.q),
          label,
        };
        model.group.position.copy(car.p);
        this.scene.add(model.group);
        this.opponents.set(p.id, car);
      }
      car.p.fromArray(p.p);
      car.q.fromArray(p.q);
      car.model.paint.color.set(p.color);
      car.model.accent.color.set(p.accent ?? '#f3eddd');
      car.model.wing.visible=p.spoiler!==false;
    }
  }
  /**
   * Uses WebGPU when the browser and GPU support it. Three's renderer retains
   * a WebGL2 fallback so the game remains playable on unsupported browsers.
   */
  readonly renderer: WebGPURenderer;
  readonly ready: Promise<void>;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(65, 1, 0.1, 2200);
  readonly car = carModel();
  readonly ghost = carModel(true);
  readonly challengerGhost = carModel(true, 0xffa020);
  private challengerLabel: HTMLDivElement;
  private environment = new THREE.Group();
  private sun = new THREE.DirectionalLight(0xffe1ba, 3.6);
  private fill = new THREE.HemisphereLight(0x9bbde8, 0x080b10, 0.45);
  private keyFill = new THREE.DirectionalLight(0xfff0dc, 0.38);
  private keyFillTarget = new THREE.Object3D();
  private rim = new THREE.DirectionalLight(0x9ec9ff, 1.25);
  private rimTarget = new THREE.Object3D();
  private studioEnvironment?: THREE.Texture;
  private skybox?: THREE.Texture;
  private track!: Track;
  private center = new THREE.Vector3();
  private cameraHeading = new THREE.Vector3(0, 0, 1);
  private ghostIndex = 0;
  private challengerIndex = 0;
  private dust: THREE.InstancedMesh;
  private dustData: {
    p: THREE.Vector3;
    velocity: THREE.Vector3;
    age: number;
    lifetime: number;
    size: number;
    seed: number;
  }[] = Array.from(
    { length: 220 },
    () => ({
      p: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      age: 99,
      lifetime: 1,
      size: 1,
      seed: Math.random() * Math.PI * 2,
    }),
  );
  private dustCursor = 0;
  private dustEmission = 0;
  private dustColor = new THREE.Color();
  private contactShadow: THREE.Mesh;
  private contactUp = new THREE.Vector3();
  private dummy = new THREE.Object3D();
  private shadowTarget = new THREE.Object3D();
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGPURenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.ready = this.renderer.init().then(() => {
      this.createStudioEnvironment();
      this.loadSkybox();
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    Object.assign(this.sun.shadow.camera, {
      left: -65,
      right: 65,
      top: 65,
      bottom: -65,
      near: 0.1,
      far: 250,
    });
    this.sun.shadow.normalBias = 0.055;
    this.sun.shadow.bias = -0.0001;
    this.sun.target = this.shadowTarget;
    this.keyFill.target = this.keyFillTarget;
    this.rim.target = this.rimTarget;
    this.challengerLabel = document.createElement("div");
    this.challengerLabel.className = "opponent-label ghost-opponent-label";
    this.challengerLabel.hidden = true;
    document.body.append(this.challengerLabel);
    this.scene.add(
      this.sun,
      this.shadowTarget,
      this.fill,
      this.keyFill,
      this.keyFillTarget,
      this.rim,
      this.rimTarget,
      this.environment,
      this.car.group,
      this.ghost.group,
      this.challengerGhost.group,
    );
    this.dust = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xd5dbd9,
        map: this.createSmokeTexture(),
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      this.dustData.length,
    );
    this.dust.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
    const contactGeometry = new THREE.PlaneGeometry(1, 1);
    contactGeometry.rotateX(-Math.PI / 2);
    this.contactShadow = new THREE.Mesh(
      contactGeometry,
      new THREE.MeshBasicMaterial({
        color: 0x05070a,
        map: this.createContactShadowTexture(),
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    this.contactShadow.renderOrder = 1;
    this.scene.add(this.contactShadow);
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.loadPlayerCar();
  }
  private createStudioEnvironment() {
    // Use the procedural map only while the real, photographed HDRI streams.
    // It keeps the bodywork lit during loading and is replaced immediately.
    this.createFallbackStudioEnvironment();
    new RGBELoader().load(
      "/hdr/studio-small-09-1k.hdr",
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        this.studioEnvironment?.dispose();
        this.studioEnvironment = texture;
        this.scene.environment = texture;
        this.scene.environmentIntensity = 0.9;
      },
      undefined,
      (error) => console.warn("Studio HDRI could not be loaded", error),
    );
  }
  private loadSkybox() {
    new THREE.TextureLoader().load(
      "/sky/hazy-afternoon-2k.png",
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.mapping = THREE.EquirectangularReflectionMapping;
        this.skybox = texture;
        this.scene.background = texture;
      },
      undefined,
      (error) => console.warn("Hazy afternoon skybox could not be loaded", error),
    );
  }
  private createFallbackStudioEnvironment() {
    // A static cubemap gives the GT3's dark clear coat the long, clean
    // softbox reflections seen in an automotive studio. Unlike a PMREM scene
    // capture, this uses only standard texture sampling and is reliable on
    // Three's WebGPU renderer.
    const makeFace = (index: number) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 512;
      const context = canvas.getContext("2d")!;
      const base = context.createLinearGradient(0, 0, 0, 512);
      base.addColorStop(0, "#2a303a");
      base.addColorStop(0.46, "#11151c");
      base.addColorStop(1, "#05070b");
      context.fillStyle = base;
      context.fillRect(0, 0, 512, 512);

      // Ceiling panel plus side strips. Different placements per cube face
      // keep the reflections from looking like a flat colour wash.
      const panel = (x: number, y: number, width: number, height: number, color: string) => {
        const glow = context.createLinearGradient(x, y, x + width, y + height);
        glow.addColorStop(0, color);
        glow.addColorStop(0.42, "rgba(255,255,255,0.82)");
        glow.addColorStop(1, "rgba(118,158,218,0.08)");
        context.fillStyle = glow;
        context.fillRect(x, y, width, height);
      };
      if (index === 2) panel(42, 118, 428, 108, "rgba(255,238,210,0.96)");
      else if (index === 3) panel(80, 320, 352, 52, "rgba(42,60,86,0.45)");
      else {
        panel(index % 2 ? 365 : 58, 50, 74, 390, index < 2 ? "rgba(185,214,255,0.92)" : "rgba(255,220,178,0.9)");
        panel(index % 2 ? 94 : 340, 166, 42, 205, "rgba(255,255,255,0.45)");
      }
      return canvas;
    };
    this.studioEnvironment = new THREE.CubeTexture(
      [0, 1, 2, 3, 4, 5].map(makeFace),
    );
    this.studioEnvironment.colorSpace = THREE.SRGBColorSpace;
    this.studioEnvironment.mapping = THREE.CubeReflectionMapping;
    this.studioEnvironment.needsUpdate = true;
    this.scene.environment = this.studioEnvironment;
    this.scene.environmentIntensity = 0.8;
  }
  private createSmokeTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d")!;
    context.clearRect(0, 0, 256, 256);
    // Overlapping soft blobs prevent the hard, round look of basic particles.
    for (let i = 0; i < 26; i++) {
      const angle = (i / 26) * Math.PI * 2;
      const radius = 16 + ((i * 37) % 48);
      const x = 128 + Math.cos(angle) * radius * 0.52;
      const y = 128 + Math.sin(angle) * radius * 0.52;
      const blob = context.createRadialGradient(x, y, 0, x, y, 62 + (i % 4) * 9);
      blob.addColorStop(0, "rgba(255,255,255,0.18)");
      blob.addColorStop(0.42, "rgba(255,255,255,0.07)");
      blob.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = blob;
      context.fillRect(0, 0, 256, 256);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  private createContactShadowTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d")!;
    const shadow = context.createRadialGradient(128, 128, 10, 128, 128, 126);
    shadow.addColorStop(0, "rgba(0,0,0,0.9)");
    shadow.addColorStop(0.42, "rgba(0,0,0,0.58)");
    shadow.addColorStop(0.76, "rgba(0,0,0,0.16)");
    shadow.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = shadow;
    context.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(canvas);
  }
  private loadPlayerCar() {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      "/models/porsche-992-gt3-r.meshopt.glb",
      (gltf) => {
        const porsche = gltf.scene;

        // Sketchfab exports this asset in centimetres. Match it to the
        // existing Rapier chassis without changing the driving physics.
        // Deliberately oversized slightly: the player car should have the
        // prominent, planted third-person presence of a modern arcade racer.
        porsche.scale.setScalar(134.4);
        // The physics chassis sits ~0.82 units above the road at rest. Align
        // the imported tyre contact patch to it rather than its visual centre.
        porsche.position.y = -0.74;
        porsche.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.castShadow = true;
          object.receiveShadow = true;
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => {
            if (!(material instanceof THREE.MeshStandardMaterial)) return;
            // Preserve the GT3 R livery while giving its clear coat, carbon
            // fibre, and metalwork a richer response to track lighting.
            material.envMapIntensity = 1.25;
            material.roughness = Math.max(0.2, material.roughness * 0.96);
            material.metalness = Math.min(1, material.metalness + 0.02);
            if (material instanceof THREE.MeshPhysicalMaterial) {
              material.clearcoat = Math.max(material.clearcoat, 0.32);
              material.clearcoatRoughness = Math.min(
                material.clearcoatRoughness,
                0.28,
              );
            }
            [
              material.map,
              material.normalMap,
              material.roughnessMap,
              material.metalnessMap,
              material.aoMap,
              material.emissiveMap,
            ].forEach((texture) => {
              if (!texture) return;
              texture.anisotropy = 8;
              texture.needsUpdate = true;
            });
            material.needsUpdate = true;
          });
        });

        // Keep the simple vehicle only as a loading/fallback silhouette. The
        // imported Porsche becomes the actual player-facing vehicle.
        this.car.group.children.forEach((child) => (child.visible = false));
        this.car.group.add(porsche);
      },
      undefined,
      (error) => console.warn("Porsche GT3 R model could not be loaded", error),
    );
  }
  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
  quality(high: boolean) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, high ? 2 : 1));
    this.renderer.shadowMap.enabled = high;
    this.sun.shadow.mapSize.set(high ? 4096 : 1024, high ? 4096 : 1024);
    this.sun.shadow.needsUpdate = true;
    this.resize();
  }
  load(track: Track, world: RAPIER.World) {
    this.environment.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => {
          if (
            m instanceof THREE.MeshStandardMaterial ||
            m instanceof THREE.MeshBasicMaterial
          )
            m.map?.dispose();
          m.dispose();
        });
      }
    });
    this.environment.clear();
    this.setOpponents([]);
    this.track = track;
    this.ghostIndex = 0;
    this.challengerIndex = 0;
    this.challengerGhost.group.visible = false;
    this.challengerLabel.hidden = true;
    const night = track.course.id.includes("pulse"),
      accent = track.course.color,
      h = track.course.width / 2;
    if (!this.skybox) this.scene.background = new THREE.Color(track.course.sky);
    this.scene.fog = new THREE.Fog(track.course.sky, 220, 1250);
    this.fill.intensity = night ? 0.25 : 0.45;
    this.sun.intensity = night ? 2.1 : 4.7;
    this.keyFill.intensity = night ? 0.16 : 0.38;
    this.rim.intensity = night ? 0.95 : 1.55;
    this.center.copy(
      new THREE.Box3()
        .setFromPoints(track.samples.map((s) => s.p))
        .getCenter(new THREE.Vector3()),
    );
    const road = material(night ? 0x788193 : 0xe7e7d9),
      side = material(night ? 0x343e55 : 0x566b69),
      curb = material(accent);
    const fence = material(0xffffff);
    fence.vertexColors = true;
    for (const [geometry, mat] of [
      [track.geometry(-h, h), road],
      [track.geometry(-h, h, -0.65), side],
      [track.wallGeometry(), fence],
      [track.geometry(-h, -h + 0.65, 0.022), curb],
      [track.geometry(h - 0.65, h, 0.022), curb],
    ] as [THREE.BufferGeometry, THREE.MeshStandardMaterial][]) {
      mat.side = THREE.DoubleSide;
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.receiveShadow = true;
      this.environment.add(mesh);
    }
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(7000, 7000),
      material(track.course.ground),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -12;
    ground.receiveShadow = true;
    this.environment.add(ground);
    const pillarSamples = track.samples.filter((_, i) => i % 22 === 0);
    const pillars = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      side,
      pillarSamples.length,
    );
    pillarSamples.forEach((s, i) => {
      this.dummy.position
        .copy(s.p)
        .add(new THREE.Vector3(0, -(s.p.y + 12) / 2, 0));
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(3, s.p.y + 12, 3);
      this.dummy.updateMatrix();
      pillars.setMatrixAt(i, this.dummy.matrix);
    });
    pillars.castShadow = true;
    this.environment.add(pillars);
    const dashSamples = track.samples.filter(
      (s, i) => i % 7 === 0 && !track.gap(s.t),
    );
    const dashes = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.12, 0.025, 2.5),
      material(night ? 0xaab2c5 : 0xb1bfb7),
      dashSamples.length,
    );
    dashSamples.forEach((s, i) => {
      this.dummy.position.copy(s.p).addScaledVector(s.up, 0.023);
      this.dummy.quaternion.copy(s.q);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      dashes.setMatrixAt(i, this.dummy.matrix);
    });
    this.environment.add(dashes);
    this.gate(0, "START / FINISH", accent, world);
    track.course.checkpoints.forEach((p, i) =>
      this.gate(p, `CHECKPOINT 0${i + 1}`, accent, world),
    );
    for (const [a, b] of track.course.turbo)
      for (let p = a; p < b; p += 4 / track.length) {
        const s = track.sample(p);
        const group = new THREE.Group();
        group.position.copy(s.p).addScaledVector(s.up, 0.035);
        group.quaternion.copy(s.q);
        box(
          group,
          [track.course.width - 1.6, 0.035, 2.1],
          [0, 0, 0],
          material(0xf4b344, true),
        );
        for (const x of [-5, 0, 5]) {
          const stripe = box(
            group,
            [0.35, 0.04, 2],
            [x, 0.04, 0],
            material(0xfff3c5),
          );
          stripe.rotation.y = -0.55;
        }
        this.environment.add(group);
      }
    // Scenery is rejected using full road clearance, not just its center line.
    const trees: number[][] = [];
    let seed = track.length;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 190; i++) {
      const p = new THREE.Vector3(
        this.center.x + (random() - 0.5) * 1050,
        10,
        this.center.z + (random() - 0.5) * 950,
      );
      const near = track.nearest(p);
      if (Math.hypot(near.sample.p.x - p.x, near.sample.p.z - p.z) < h + 22)
        continue;
      trees.push([p.x, p.z, 8 + random() * 24]);
    }
    const scenery = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1, 1, night ? 4 : 5),
      material(
        night
          ? 0x39415e
          : track.course.id.includes("air")
            ? 0x8c9db2
            : 0x3f755d,
      ),
      trees.length,
    );
    trees.forEach(([x, z, height], i) => {
      this.dummy.position.set(x, -12 + height / 2, z);
      this.dummy.rotation.set(0, i * 1.3, 0);
      this.dummy.scale.set(height * 0.4, height, height * 0.4);
      this.dummy.updateMatrix();
      scenery.setMatrixAt(i, this.dummy.matrix);
      world.createCollider(
        RAPIER.ColliderDesc.cone(height / 2, height * 0.4).setTranslation(
          x,
          -12 + height / 2,
          z,
        ),
      );
    });
    scenery.castShadow = true;
    this.environment.add(scenery);
    // A straight open-ended tunnel with matching roof collision, unique to Neon.
    if (night)
      for (let p = 0.045; p < 0.095; p += 8 / track.length) {
        const s = track.sample(p),
          g = new THREE.Group();
        g.position.copy(s.p);
        g.quaternion.copy(s.q);
        box(g, [track.course.width + 1, 0.5, 8], [0, 6.8, 0], side);
        for (const x of [-h, h]) box(g, [0.45, 7, 8], [x, 3.3, 0], side);
        for (const x of [-h + 0.4, h - 0.4])
          box(g, [0.1, 0.1, 7.5], [x, 5.8, 0], material(accent, true));
        const rp = s.p.clone().addScaledVector(s.up, 6.8);
        world.createCollider(
          RAPIER.ColliderDesc.cuboid(h + 0.5, 0.25, 4)
            .setTranslation(rp.x, rp.y, rp.z)
            .setRotation(s.q),
        );
        this.environment.add(g);
      }
    this.car.group.visible = true;
    for (const [t, sign] of track.course.barriers ?? []) {
      const s = track.sample(t),
        g = new THREE.Group();
      g.position
        .copy(s.p)
        .addScaledVector(s.right, sign * track.course.width * 0.25);
      g.quaternion.copy(s.q);
      box(
        g,
        [track.course.width * 0.58, 1.6, 1.3],
        [0, 0.8, 0],
        material(0xf2a043),
      );
      for (let i = -3; i <= 3; i++) {
        const stripe = box(
          g,
          [0.38, 1.65, 1.32],
          [i * 1.5, 0.8, 0],
          material(0x26383e),
        );
        stripe.rotation.z = 0.3;
      }
      this.environment.add(g);
    }
    this.ghost.group.visible = false;
    this.dustData.forEach((d) => (d.age = d.lifetime));
    this.dustEmission = 0;
  }
  private gate(t: number, text: string, color: string, world: RAPIER.World) {
    const s = this.track.sample(t),
      g = new THREE.Group(),
      w = this.track.course.width;
    g.position.copy(s.p);
    g.quaternion.copy(s.q);
    const mat = material(color),
      dark = material(0x273936);
    for (const x of [-w / 2, w / 2]) box(g, [0.5, 5, 0.5], [x, 2.5, 0], mat);
    box(g, [w + 0.5, 0.9, 0.65], [0, 5, 0], dark);
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 96;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#f8f7ec";
    ctx.font = "bold 44px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, 512, 64);
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.77, 0.8),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(canvas),
        transparent: true,
        side: THREE.DoubleSide,
      }),
    );
    label.position.set(0, 5, -0.34);
    label.rotation.y = Math.PI;
    g.add(label);
    if (t === 0) {
      for (let i = 0; i < 22; i++)
        for (let j = 0; j < 2; j++)
          box(
            g,
            [w / 22, 0.025, 1],
            [(-0.5 + (i + 0.5) / 22) * w, 0.026, -j],
            material((i + j) % 2 ? 0x263d3b : 0xf1f1df),
          );
    } else box(g, [w, 0.025, 0.7], [0, 0.026, 0], mat);
    const p = s.p.clone().addScaledVector(s.up, 5);
    world.createCollider(
      RAPIER.ColliderDesc.cuboid((w + 0.5) / 2, 0.45, 0.325)
        .setTranslation(p.x, p.y, p.z)
        .setRotation(s.q),
    );
    this.environment.add(g);
  }
  snap(vehicle: Vehicle) {
    this.cameraCut = true;
    this.cameraHeading.set(0, 0, 1).applyQuaternion(vehicle.rotation);
    this.camera.position
      .copy(vehicle.position)
      .addScaledVector(this.cameraHeading, -5.8)
      .add(new THREE.Vector3(0, 2.05, 0));
    this.camera.fov = 72;
    this.ghostIndex = 0;
    this.challengerIndex = 0;
  }
  render(
    vehicle: Vehicle,
    dt: number,
    alpha: number,
    menu: boolean,
    time: number,
    record?: RecordRun,
    challenger?: { nickname: string; rank?: number; time: number; frames: { t: number; p: number[]; q?: number[]; s?: number }[] },
  ) {
    const p = this.car.group.position.lerpVectors(
      vehicle.previousPosition,
      vehicle.position,
      alpha,
    );
    this.car.group.quaternion
      .copy(vehicle.previousRotation)
      .slerp(vehicle.rotation, alpha);
    this.car.group.visible = menu || this.cameraMode !== 'bumper';
    this.contactShadow.visible = !menu && vehicle.grounded > 0;
    if (this.contactShadow.visible) {
      this.contactUp.set(0, 1, 0).applyQuaternion(this.car.group.quaternion);
      this.contactShadow.position
        .copy(p)
        .addScaledVector(this.contactUp, -0.807);
      this.contactShadow.quaternion.copy(this.car.group.quaternion);
      const speedStretch = 1 + Math.min(0.16, vehicle.speed * 0.0015);
      this.contactShadow.scale.set(3.05, 6.35 * speedStretch, 1);
    }
    this.car.wheels.forEach((wheel, i) => {
      wheel.position.y = -(vehicle.controller.wheelSuspensionLength(i) ?? 0.3);
      wheel.rotation.set(0, i < 2 ? vehicle.steering : 0, 0);
    });
    if (menu) {
      this.camera.up.set(0,1,0);
      const angle = time * 0.055;
      this.camera.position.set(
        this.center.x + Math.sin(angle) * 390,
        this.center.y + 300,
        this.center.z + Math.cos(angle) * 390,
      );
      this.camera.lookAt(this.center.clone().add(new THREE.Vector3(-65, 0, 0)));
      this.camera.fov = 48;
    } else if (this.cameraMode === 'bumper' || this.cameraMode === 'hood') {
      // Mounted views follow the interpolated chassis, so the camera never trails through the car.
      const forward = new THREE.Vector3(0,0,1).applyQuaternion(this.car.group.quaternion);
      const up = new THREE.Vector3(0,1,0).applyQuaternion(this.car.group.quaternion);
      const bumper = this.cameraMode === 'bumper';
      this.camera.position.copy(p).addScaledVector(forward,bumper?1.98:.48).addScaledVector(up,bumper?.32:.88);
      this.camera.up.copy(up);
      this.camera.lookAt(this.camera.position.clone().addScaledVector(forward,30));
      const targetFov = racingFov(vehicle.speed,vehicle.turbo);
      this.camera.fov = this.cameraCut ? targetFov : THREE.MathUtils.damp(this.camera.fov,targetFov,5,dt);
    } else {
      this.camera.up.set(0,1,0);
      const heading = new THREE.Vector3(0, 0, 1).applyQuaternion(
        vehicle.rotation,
      );
      heading.y = THREE.MathUtils.clamp(heading.y, -0.3, 0.3);
      heading.normalize();
      if (vehicle.speed > 25) {
        const travel = vehicle.velocity.clone().normalize();
        travel.y = heading.y;
        heading.lerp(travel, 0.22).normalize();
      }
      if(this.cameraCut)this.cameraHeading.copy(heading);
      else this.cameraHeading.lerp(heading, 1 - Math.exp(-9 * dt)).normalize();
      const top = this.cameraMode === 'top';
      const desired = p
        .clone()
        .addScaledVector(
          this.cameraHeading,
          top ? -10 : -5.8,
        )
        .add(new THREE.Vector3(0, top ? 28 : 2.05, 0));
      if(this.cameraCut)this.camera.position.copy(desired);
      else this.camera.position.lerp(desired, 1 - Math.exp(-12 * dt));
      this.camera.lookAt(
        p
          .clone()
          .addScaledVector(this.cameraHeading, 9)
          .add(new THREE.Vector3(0, 0.35, 0)),
      );
      const targetFov = top
        ? 54 + Math.min(8, vehicle.speed * 0.035)
        : Math.min(
            70,
            Math.max(70, racingFov(vehicle.speed, vehicle.turbo) - 2),
          );
      this.camera.fov = this.cameraCut ? targetFov : THREE.MathUtils.damp(
        this.camera.fov,
        targetFov,
        5,
        dt,
      );
    }
    if(!menu)this.cameraCut = false;
    this.camera.updateProjectionMatrix();
    const focus = menu ? this.center : p;
    this.shadowTarget.position.copy(focus);
    this.sun.position.copy(focus).add(new THREE.Vector3(-55, 110, 35));
    this.keyFillTarget.position.copy(focus);
    this.keyFill.position.copy(focus).add(new THREE.Vector3(-24, 30, -38));
    this.rimTarget.position.copy(focus);
    this.rim.position.copy(focus).add(new THREE.Vector3(42, 28, -52));
    this.ghost.group.visible = !menu && !!record && time <= record.time;
    if (this.ghost.group.visible && record) {
      if (
        this.ghostIndex >= record.frames.length - 1 ||
        record.frames[this.ghostIndex].t > time
      )
        this.ghostIndex = 0;
      while (
        this.ghostIndex < record.frames.length - 2 &&
        record.frames[this.ghostIndex + 1].t < time
      )
        this.ghostIndex++;
      const a = record.frames[this.ghostIndex],
        b = record.frames[this.ghostIndex + 1] || a;
      if (a && b) {
        const f = THREE.MathUtils.clamp(
          (time - a.t) / Math.max(0.001, b.t - a.t),
          0,
          1,
        );
        this.ghost.group.position
          .fromArray(a.p)
          .lerp(new THREE.Vector3().fromArray(b.p), f);
        if (a.q && b.q) {
          this.ghost.group.quaternion
            .fromArray(a.q)
            .slerp(new THREE.Quaternion().fromArray(b.q), f);
        }
        const steer = THREE.MathUtils.lerp(a.s ?? 0, b.s ?? a.s ?? 0, f);
        this.ghost.wheels.forEach((wheel, i) => {
          if (i < 2) wheel.rotation.set(0, steer, 0);
        });
      }
    }
    this.challengerGhost.group.visible = !menu && !!challenger && time <= challenger.time;
    if (this.challengerGhost.group.visible && challenger) {
      if (
        this.challengerIndex >= challenger.frames.length - 1 ||
        challenger.frames[this.challengerIndex].t > time
      )
        this.challengerIndex = 0;
      while (
        this.challengerIndex < challenger.frames.length - 2 &&
        challenger.frames[this.challengerIndex + 1].t < time
      )
        this.challengerIndex++;
      const a = challenger.frames[this.challengerIndex],
        b = challenger.frames[this.challengerIndex + 1] || a;
      if (a && b) {
        const f = THREE.MathUtils.clamp(
          (time - a.t) / Math.max(0.001, b.t - a.t),
          0,
          1,
        );
        this.challengerGhost.group.position
          .fromArray(a.p)
          .lerp(new THREE.Vector3().fromArray(b.p), f);
        if (a.q && b.q) {
          this.challengerGhost.group.quaternion
            .fromArray(a.q)
            .slerp(new THREE.Quaternion().fromArray(b.q), f);
        } else {
          const dir = new THREE.Vector3().fromArray(b.p).sub(new THREE.Vector3().fromArray(a.p));
          if (dir.lengthSq() > 0.0001) {
            dir.normalize();
            this.challengerGhost.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
          }
        }
        const steer = THREE.MathUtils.lerp(a.s ?? 0, b.s ?? a.s ?? 0, f);
        this.challengerGhost.wheels.forEach((wheel, i) => {
          if (i < 2) wheel.rotation.set(0, steer, 0);
        });
      }
      const screen = this.challengerGhost.group.position
        .clone()
        .add(new THREE.Vector3(0, 2.1, 0))
        .project(this.camera);
      this.challengerLabel.hidden =
        menu ||
        screen.z > 1 ||
        screen.z < 0 ||
        Math.abs(screen.x) > 1 ||
        Math.abs(screen.y) > 1;
      this.challengerLabel.textContent = `⚔️ ${challenger.nickname}${challenger.rank ? ` (${challenger.rank}위)` : ''}`;
      this.challengerLabel.style.left = `${(screen.x * 0.5 + 0.5) * innerWidth}px`;
      this.challengerLabel.style.top = `${(-screen.y * 0.5 + 0.5) * innerHeight}px`;
    } else {
      this.challengerLabel.hidden = true;
    }
    const smokeLoad = THREE.MathUtils.clamp(
      (Math.abs(vehicle.slip) - 0.06) / 0.28,
      0,
      1,
    ) * THREE.MathUtils.clamp((vehicle.speed - 24) / 38, 0, 1);
    if (!menu && vehicle.grounded >= 2 && smokeLoad > 0) {
      // Emit at a rate, rather than once per render frame, so the cloud's
      // volume stays consistent at every frame rate.
      this.dustEmission += dt * (8 + smokeLoad * 58);
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(vehicle.rotation);
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(vehicle.rotation);
      while (this.dustEmission >= 1) {
        this.dustEmission -= 1;
        const d = this.dustData[this.dustCursor++ % this.dustData.length];
        const wheelSide = this.dustCursor % 2 ? -0.88 : 0.88;
        const jitter = (Math.random() - 0.5) * 0.28;
        d.p
          .set(wheelSide, -0.42, -1.35)
          .applyQuaternion(vehicle.rotation)
          .add(p)
          .addScaledVector(side, jitter);
        // Smoke starts with a fraction of the car's velocity, then loses
        // momentum and is advected sideways/upward by a small turbulent field.
        d.velocity.copy(vehicle.velocity).multiplyScalar(0.12 + smokeLoad * 0.1);
        d.velocity.addScaledVector(side, (Math.random() - 0.5) * (1.5 + smokeLoad * 3));
        d.velocity.addScaledVector(forward, -0.5 - Math.random() * 0.9);
        d.velocity.y = 0.45 + smokeLoad * 0.95 + Math.random() * 0.3;
        d.age = 0;
        d.lifetime = 1.9 + smokeLoad * 1.25 + Math.random() * 0.55;
        d.size = 0.72 + smokeLoad * 0.7 + Math.random() * 0.35;
      }
    } else this.dustEmission = Math.max(0, this.dustEmission - dt * 8);
    this.dustData.forEach((d, i) => {
      d.age += dt;
      const progress = d.age / d.lifetime;
      if (progress < 1) {
        const turbulence = 0.45 + progress * 1.1;
        d.velocity.x += Math.sin(time * 1.7 + d.seed + d.p.z * 0.12) * turbulence * dt;
        d.velocity.z += Math.cos(time * 1.3 + d.seed + d.p.x * 0.12) * turbulence * dt;
        d.velocity.y += (0.13 + progress * 0.28) * dt;
        d.velocity.multiplyScalar(Math.exp(-1.35 * dt));
        d.p.addScaledVector(d.velocity, dt);
      }
      const fade = progress < 0.74
        ? 1
        : 1 - THREE.MathUtils.smoothstep(progress, 0.74, 1);
      const scale = progress < 1
        ? d.size * (0.35 + progress * 4.6) * fade
        : 0;
      this.dummy.position.copy(d.p);
      this.dummy.quaternion.copy(this.camera.quaternion);
      this.dummy.rotateZ(Math.sin(d.seed + progress * 3) * 0.45);
      this.dummy.scale.set(scale * 1.25, scale, 1);
      this.dummy.updateMatrix();
      this.dust.setMatrixAt(i, this.dummy.matrix);
      this.dustColor.setRGB(
        0.62 + (1 - Math.min(1, progress)) * 0.22,
        0.66 + (1 - Math.min(1, progress)) * 0.2,
        0.66 + (1 - Math.min(1, progress)) * 0.18,
      );
      this.dust.setColorAt(i, this.dustColor);
    });
    this.dust.instanceMatrix.needsUpdate = true;
    if (this.dust.instanceColor) this.dust.instanceColor.needsUpdate = true;
    for (const opponent of this.opponents.values()) {
      opponent.model.group.visible = !menu;
      opponent.model.group.position.lerp(opponent.p, 1 - Math.exp(-18 * dt));
      opponent.model.group.quaternion.slerp(opponent.q, 1 - Math.exp(-18 * dt));
      const screen = opponent.model.group.position
        .clone()
        .add(new THREE.Vector3(0, 2.1, 0))
        .project(this.camera);
      opponent.label.hidden =
        menu ||
        screen.z > 1 ||
        screen.z < 0 ||
        Math.abs(screen.x) > 1 ||
        Math.abs(screen.y) > 1;
      opponent.label.style.left = `${(screen.x * 0.5 + 0.5) * innerWidth}px`;
      opponent.label.style.top = `${(-screen.y * 0.5 + 0.5) * innerHeight}px`;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
