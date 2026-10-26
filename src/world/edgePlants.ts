import * as THREE from 'three';
import { regrow } from '../core/regrow';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng, lerp } from '../core/random';
import { addWind } from '../render/wind';

const CAPACITY = 1600;

function colored(g: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.deleteAttribute('uv');
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** A leaf: a small flat disc, tilted up a little. */
function leaf(r: number, x: number, y: number, z: number, tilt: number, yaw: number, hex: string) {
  const g = new THREE.CircleGeometry(r, 7);
  g.rotateX(-Math.PI / 2 + tilt);
  g.rotateY(yaw);
  g.translate(x, y, z);
  return colored(g, hex);
}

/** A loose patch of clover: a few trefoil clusters at slightly different heights. */
function cloverGeometry(seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const greens = ['#5f9a3f', '#6fa848', '#578f3a'];
  for (let c = 0; c < 4; c++) {
    const cx = lerp(-0.12, 0.12, rng());
    const cz = lerp(-0.12, 0.12, rng());
    const y = lerp(0.03, 0.08, rng());
    const yaw0 = rng() * Math.PI * 2;
    const hex = greens[c % greens.length];
    for (let k = 0; k < 3; k++) {
      const a = yaw0 + (k / 3) * Math.PI * 2;
      parts.push(leaf(0.032, cx + Math.cos(a) * 0.028, y, cz + Math.sin(a) * 0.028, 0.35, -a, hex));
    }
  }
  return mergeGeometries(parts);
}

/** A couple of tiny daisies with a leaf or two. */
function daisyGeometry(seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let f = 0; f < 3; f++) {
    const x = lerp(-0.1, 0.1, rng());
    const z = lerp(-0.1, 0.1, rng());
    const y = lerp(0.07, 0.13, rng());
    const petals = new THREE.CircleGeometry(0.03, 10);
    petals.rotateX(-Math.PI / 2 + 0.25);
    petals.translate(x, y, z);
    parts.push(colored(petals, '#ffffff'));
    const eye = new THREE.CircleGeometry(0.011, 6);
    eye.rotateX(-Math.PI / 2 + 0.25);
    eye.translate(x, y + 0.004, z + 0.001);
    parts.push(colored(eye, '#f2c94c'));
    parts.push(leaf(0.026, x + 0.03, 0.03, z, 0.5, rng() * 6, '#6aa245'));
  }
  return mergeGeometries(parts);
}

interface Growing {
  mesh: THREE.InstancedMesh;
  index: number;
  pos: THREE.Vector3;
  yaw: number;
  size: number;
  delay: number;
  t: number;
}

/**
 * Clover and tiny flowers that creep in along the edges of paths, growing up out of the lawn
 * a moment after the stones settle.
 */
export class EdgePlants {
  readonly group = new THREE.Group();
  private readonly clover: THREE.InstancedMesh;
  private readonly daisies: THREE.InstancedMesh;
  private readonly growing: Growing[] = [];
  private readonly all: Growing[] = [];
  private readonly wilting: { g: Growing; t: number }[] = [];
  private rng = createRng(77);
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();

  constructor(private readonly flowerTints: string[]) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    addWind(mat, 'clamp(position.y * 7.0, 0.0, 1.0)', undefined, 2.0);
    this.clover = new THREE.InstancedMesh(cloverGeometry(3), mat, CAPACITY);
    this.daisies = new THREE.InstancedMesh(daisyGeometry(9), mat, CAPACITY);
    for (const mesh of [this.clover, this.daisies]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  add(x: number, y: number, z: number, delay: number) {
    const isFlower = this.rng() < 0.4;
    const mesh = isFlower ? this.daisies : this.clover;
    if (mesh.count >= CAPACITY) return;
    const index = mesh.count++;
    const tint = isFlower
      ? new THREE.Color(this.flowerTints[Math.floor(this.rng() * this.flowerTints.length)]).lerp(new THREE.Color('#ffffff'), 0.45)
      : new THREE.Color('#ffffff').multiplyScalar(lerp(0.88, 1.08, this.rng()));
    mesh.setColorAt(index, tint);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    const g: Growing = { mesh, index, pos: new THREE.Vector3(x, y, z), yaw: this.rng() * Math.PI * 2, size: lerp(0.8, 1.3, this.rng()), delay: delay + regrow.offset, t: 0 };
    this.growing.push(g);
    this.all.push(g);
    this.write(g, 0.0001);
  }

  /** Back to an untouched garden (before an undo replays what remains). */
  reset() {
    this.clover.count = this.daisies.count = 0;
    this.growing.length = this.all.length = this.wilting.length = 0;
    this.rng = createRng(77);
  }

  /** Plants within `r` of (x, z) shrink back into the lawn. Returns how many. */
  erase(x: number, z: number, r: number): number {
    let n = 0;
    for (let i = this.all.length - 1; i >= 0; i--) {
      const g = this.all[i];
      if ((g.pos.x - x) ** 2 + (g.pos.z - z) ** 2 > r * r) continue;
      this.all.splice(i, 1);
      const k = this.growing.indexOf(g);
      if (k >= 0) this.growing.splice(k, 1);
      this.wilting.push({ g, t: 0 });
      n++;
    }
    return n;
  }

  private write(g: Growing, scale: number) {
    this.e.set(0, g.yaw, 0);
    this.q.setFromEuler(this.e);
    const s = g.size * scale;
    this.m.compose(g.pos, this.q, new THREE.Vector3(s, s, s));
    g.mesh.setMatrixAt(g.index, this.m);
    g.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt: number) {
    for (let i = this.wilting.length - 1; i >= 0; i--) {
      const w = this.wilting[i];
      w.t = Math.min(1, w.t + dt / 0.4);
      this.write(w.g, Math.max(0.0001, 1 - w.t));
      if (w.t >= 1) {
        this.write(w.g, 0);
        this.wilting.splice(i, 1);
      }
    }
    for (let i = this.growing.length - 1; i >= 0; i--) {
      const g = this.growing[i];
      if (g.delay > 0) {
        g.delay -= dt;
        continue;
      }
      g.t += dt / 0.9;
      // Ease-out with a little overshoot: it pops up, then settles.
      const t = Math.min(1, g.t);
      const k = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
      this.write(g, Math.max(0.0001, k));
      if (t >= 1) this.growing.splice(i, 1);
    }
  }
}
