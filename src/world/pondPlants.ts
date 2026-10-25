import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng, lerp } from '../core/random';
import { addWind } from '../render/wind';

const CAPACITY = 600;

function colorize(g: THREE.BufferGeometry, color: (x: number, y: number, z: number) => THREE.Color): THREE.BufferGeometry {
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = color(pos.getX(i), pos.getY(i), pos.getZ(i));
    col.set([c.r, c.g, c.b], i * 3);
  }
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** A lily pad of unit radius: a round, slightly cupped leaf with its V-shaped notch. */
function padGeometry(seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const notch = lerp(0.35, 0.6, rng());
  const wob = rng() * 6.28;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  const steps = 22;
  for (let k = 0; k <= steps; k++) {
    const a = notch / 2 + (k / steps) * (Math.PI * 2 - notch);
    const r = 1 + Math.sin(a * 3 + wob) * 0.03;
    shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape, 1);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    pos.setY(i, r * r * 0.07); // the rim curls up a touch
  }
  g.computeVertexNormals();
  const inner = new THREE.Color('#79a64a');
  const outer = new THREE.Color('#4c7a33');
  return colorize(g, (x, _y, z) => {
    const r = Math.hypot(x, z);
    const vein = 0.95 + 0.05 * Math.cos(Math.atan2(z, x) * 11);
    return inner.clone().lerp(outer, Math.min(1, r * 1.1)).multiplyScalar(vein);
  });
}

/** A water lily of unit radius: two rings of pointed, cupped petals round a golden heart. */
function lilyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const petal = (len: number, wid: number, a: number, lift: number, white: THREE.Color) => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.quadraticCurveTo(len * 0.5, wid, len, 0);
    s.quadraticCurveTo(len * 0.5, -wid, 0, 0);
    const g = new THREE.ShapeGeometry(s, 4);
    g.rotateX(-Math.PI / 2);
    g.rotateZ(lift); // tip tilts up
    g.rotateY(a);
    return colorize(g, (x, _y, z) => white.clone().multiplyScalar(0.86 + 0.14 * Math.min(1, Math.hypot(x, z) / len)));
  };
  const white = new THREE.Color('#ffffff');
  for (let k = 0; k < 8; k++) parts.push(petal(1, 0.32, (k / 8) * Math.PI * 2, 0.35, white));
  for (let k = 0; k < 7; k++) parts.push(petal(0.72, 0.26, (k / 7 + 0.07) * Math.PI * 2, 0.9, white));
  const heart = new THREE.SphereGeometry(0.2, 8, 5);
  heart.scale(1, 0.6, 1);
  heart.translate(0, 0.12, 0);
  parts.push(colorize(heart, () => new THREE.Color('#f2c230')));
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
}

/** A clump of reeds, unit height: slender blades fanning up and out, tips paling. */
function reedGeometry(seed: number, cattails: boolean): THREE.BufferGeometry {
  const rng = createRng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const base = new THREE.Color('#4f7d34');
  const tip = new THREE.Color('#a7b864');
  const blades = cattails ? 8 : 14;
  for (let b = 0; b < blades; b++) {
    const h = lerp(0.6, 1.0, rng());
    const w = lerp(0.02, 0.032, rng());
    const a = rng() * Math.PI * 2;
    const lean = lerp(0.05, 0.3, rng());
    const ox = (rng() - 0.5) * 0.12;
    const oz = (rng() - 0.5) * 0.12;
    const g = new THREE.PlaneGeometry(w, h, 1, 4);
    g.translate(0, h / 2, 0);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = y / h;
      pos.setX(i, pos.getX(i) * (1 - t * 0.85)); // taper to a point
      pos.setZ(i, lean * t * t * h); // arch outwards
    }
    g.rotateY(a);
    g.translate(ox, 0, oz);
    parts.push(colorize(g, (_x, y) => base.clone().lerp(tip, Math.min(1, Math.max(0, y / h)) ** 1.5)));
  }
  if (cattails) {
    for (let c = 0; c < 3; c++) {
      const h = lerp(0.85, 1.1, rng());
      const ox = (rng() - 0.5) * 0.1;
      const oz = (rng() - 0.5) * 0.1;
      const stalk = new THREE.CylinderGeometry(0.006, 0.009, h, 4, 1);
      stalk.translate(ox, h / 2, oz);
      parts.push(colorize(stalk, () => new THREE.Color('#6d8a3e')));
      const head = new THREE.CapsuleGeometry(0.022, 0.14, 2, 6);
      head.translate(ox, h - 0.12, oz);
      parts.push(colorize(head, () => new THREE.Color('#5b3c22')));
    }
  }
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
}

interface Item {
  mesh: THREE.InstancedMesh;
  index: number;
  pos: THREE.Vector3;
  yaw: number;
  size: number;
  delay: number;
  t: number;
  reed: boolean;
  gone?: boolean;
}

/** Lily pads (some in flower) drifting up on the water, and reeds and bulrushes round the edge. */
export class PondPlants {
  readonly group = new THREE.Group();
  private readonly pads: THREE.InstancedMesh[] = [];
  private readonly lilies: THREE.InstancedMesh;
  private readonly reeds: THREE.InstancedMesh[] = [];
  private readonly items: Item[] = [];
  private readonly growing: Item[] = [];
  private readonly wilting: { it: Item; t: number }[] = [];
  private readonly rng = createRng(606);
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly s = new THREE.Vector3();

  constructor() {
    const padMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (let k = 0; k < 3; k++) this.pads.push(this.mesh(padGeometry(11 + k * 5), padMat, false));
    this.lilies = this.mesh(lilyGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), false);
    const reedMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    addWind(reedMat, 'clamp(position.y, 0.0, 1.0)', undefined, 0.45);
    for (let k = 0; k < 3; k++) this.reeds.push(this.mesh(reedGeometry(21 + k * 9, k === 2), reedMat, true));
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadow: boolean) {
    const mesh = new THREE.InstancedMesh(geo, mat, CAPACITY);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.castShadow = shadow;
    this.group.add(mesh);
    return mesh;
  }

  private add(mesh: THREE.InstancedMesh, x: number, y: number, z: number, size: number, tint: THREE.Color, delay: number, reed: boolean) {
    if (mesh.count >= CAPACITY) return;
    const index = mesh.count++;
    mesh.setColorAt(index, tint);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    const item: Item = { mesh, index, pos: new THREE.Vector3(x, y, z), yaw: this.rng() * Math.PI * 2, size, delay, t: 0, reed };
    this.items.push(item);
    this.growing.push(item);
    this.write(item, 0.0001);
  }

  /** A pad of radius `r` floating at height y. */
  pad(x: number, y: number, z: number, r: number, delay: number) {
    const mesh = this.pads[Math.floor(this.rng() * this.pads.length)];
    this.add(mesh, x, y, z, r, new THREE.Color(1, 1, 1).multiplyScalar(lerp(0.85, 1.1, this.rng())), delay, false);
  }

  /** A water lily in flower, sitting on its pad. */
  lily(x: number, y: number, z: number, r: number, color: string, delay: number) {
    this.add(this.lilies, x, y, z, r, new THREE.Color(color), delay, false);
  }

  reed(x: number, y: number, z: number, h: number, delay: number) {
    const mesh = this.reeds[Math.floor(this.rng() * this.reeds.length)];
    this.add(mesh, x, y, z, h, new THREE.Color(1, 1, 1).multiplyScalar(lerp(0.85, 1.1, this.rng())), delay, true);
  }

  /** Is there a reed clump within `r` of (x, z)? */
  reedNear(x: number, z: number, r: number): boolean {
    return this.items.some((it) => it.reed && !it.gone && (it.pos.x - x) ** 2 + (it.pos.z - z) ** 2 < r * r);
  }

  /** Lift away plants for which `drop(x, z, isReed)` is true (e.g. now under deep water). */
  removeIf(drop: (x: number, z: number, reed: boolean) => boolean) {
    for (const it of this.items) {
      if (it.gone || !drop(it.pos.x, it.pos.z, it.reed)) continue;
      it.gone = true;
      this.write(it, 0);
    }
  }

  /** Plants within `r` of (x, z) shrink away. Returns how many. */
  erase(x: number, z: number, r: number): number {
    let n = 0;
    for (const it of this.items) {
      if (it.gone || (it.pos.x - x) ** 2 + (it.pos.z - z) ** 2 > r * r) continue;
      it.gone = true;
      this.wilting.push({ it, t: 0 });
      n++;
    }
    return n;
  }

  private write(it: Item, scale: number) {
    this.e.set(0, it.yaw, 0);
    this.q.setFromEuler(this.e);
    const k = it.size * scale;
    this.m.compose(it.pos, this.q, this.s.set(k, it.reed ? k : it.size * Math.max(scale, 0.0001), k));
    it.mesh.setMatrixAt(it.index, this.m);
    it.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Are reeds (which cast shadows) still growing or wilting? */
  get busy(): boolean {
    return this.growing.some((g) => g.reed) || this.wilting.some((w) => w.it.reed);
  }

  update(dt: number) {
    for (let i = this.wilting.length - 1; i >= 0; i--) {
      const w = this.wilting[i];
      w.t = Math.min(1, w.t + dt / 0.45);
      this.write(w.it, w.t >= 1 ? 0 : Math.max(0.0001, 1 - w.t * w.t));
      if (w.t >= 1) this.wilting.splice(i, 1);
    }
    for (let i = this.growing.length - 1; i >= 0; i--) {
      const g = this.growing[i];
      if (g.gone) {
        this.growing.splice(i, 1);
        continue;
      }
      if (g.delay > 0) {
        g.delay -= dt;
        continue;
      }
      g.t += dt / (g.reed ? 1.6 : 1.2);
      // Ease out with a soft overshoot: it unfurls, then settles.
      const t = Math.min(1, g.t);
      const k = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
      this.write(g, Math.max(0.0001, k));
      if (t >= 1) this.growing.splice(i, 1);
    }
  }
}
