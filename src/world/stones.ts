import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise2D } from '../core/noise';
import { createRng, lerp } from '../core/random';

export type StoneFamily = 'flat' | 'pebble' | 'angular';
const SHAPES_PER_FAMILY = 5;
const CAPACITY = 1500; // per shape
const CELL = 0.5; // spatial hash cell, metres

/** Procedural stone shapes. Every family has several hand-picked variations. */
function stoneGeometry(family: StoneFamily, seed: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, family === 'angular' ? 1 : 2);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const noise = createNoise2D(seed);
  const rng = createRng(seed);
  const sx = lerp(0.8, 1.2, rng());
  const sz = lerp(0.7, 1.0, rng());
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const top = family === 'flat' ? 0.3 : family === 'pebble' ? 0.55 : 0.5;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const a = Math.atan2(v.z, v.x);
    let lump = 1 + noise(Math.cos(a) * 1.3, Math.sin(a) * 1.3) * (family === 'pebble' ? 0.08 : 0.16);
    if (family === 'angular') lump += (rng() - 0.5) * 0.28; // chipped, faceted rock
    v.x *= sx * lump;
    v.z *= sz * lump;
    v.y = v.y > 0 ? Math.pow(v.y, family === 'flat' ? 1.6 : 1.1) * top * lump : v.y * 0.25;
    pos.setXYZ(i, v.x, v.y, v.z);
    // Lighter, sun-bleached top; darker, earthy underside.
    const shade = v.y > 0 ? lerp(0.9, 1.06, Math.min(1, v.y / top)) : 0.7;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

interface Falling {
  mesh: THREE.InstancedMesh;
  index: number;
  pos: THREE.Vector3;
  yaw: number;
  size: number;
  /** Seconds until it starts falling (stones settle one after another). */
  delay: number;
  t: number;
  landed: boolean;
}

/**
 * Path stones that drop into place with a soft squash and bounce. All stones of a shape share
 * one InstancedMesh; only the ones still settling are updated each frame.
 */
export class Stones {
  readonly group = new THREE.Group();
  private readonly families = new Map<StoneFamily, THREE.InstancedMesh[]>();
  private readonly falling: Falling[] = [];
  private readonly grid = new Map<string, { x: number; z: number; r: number }[]>();
  private readonly rng = createRng(31);
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly e = new THREE.Euler();

  constructor(private readonly onLand: (p: THREE.Vector3, size: number) => void) {
    const smooth = new THREE.MeshLambertMaterial({ vertexColors: true });
    const faceted = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    (['flat', 'pebble', 'angular'] as StoneFamily[]).forEach((family, fi) => {
      const meshes: THREE.InstancedMesh[] = [];
      for (let k = 0; k < SHAPES_PER_FAMILY; k++) {
        const mesh = new THREE.InstancedMesh(stoneGeometry(family, 100 + fi * 50 + k * 7), family === 'angular' ? faceted : smooth, CAPACITY);
        mesh.count = 0;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        meshes.push(mesh);
        this.group.add(mesh);
      }
      this.families.set(family, meshes);
    });
  }

  private key(x: number, z: number) {
    return `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  }

  /** Would a stone of radius `r` at (x, z) overlap an existing one? Keeps paths from piling up. */
  isOccupied(x: number, z: number, r: number): boolean {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    const reach = Math.ceil((r + 0.4) / CELL);
    for (let i = cx - reach; i <= cx + reach; i++) {
      for (let j = cz - reach; j <= cz + reach; j++) {
        const cell = this.grid.get(`${i},${j}`);
        if (!cell) continue;
        for (const s of cell) {
          const min = r + s.r;
          if ((s.x - x) ** 2 + (s.z - z) ** 2 < min * min) return true;
        }
      }
    }
    return false;
  }

  add(family: StoneFamily, x: number, y: number, z: number, size: number, tone: THREE.Color, delay: number) {
    const meshes = this.families.get(family)!;
    const mesh = meshes[Math.floor(this.rng() * meshes.length)];
    if (mesh.count >= CAPACITY) return;
    const index = mesh.count++;
    mesh.setColorAt(index, tone);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    const f: Falling = { mesh, index, pos: new THREE.Vector3(x, y, z), yaw: this.rng() * Math.PI * 2, size, delay, t: 0, landed: false };
    const k = this.key(x, z);
    if (!this.grid.has(k)) this.grid.set(k, []);
    this.grid.get(k)!.push({ x, z, r: size * 0.85 });
    this.falling.push(f);
    this.write(f, 0, 0.0001); // hidden until its turn
  }

  private write(f: Falling, lift: number, scale: number, squash = 0) {
    this.e.set(0, f.yaw, 0);
    this.q.setFromEuler(this.e);
    this.s.set(f.size * scale * (1 + squash * 0.5), f.size * scale * (1 - squash), f.size * scale * (1 + squash * 0.5));
    this.m.compose(new THREE.Vector3(f.pos.x, f.pos.y + lift, f.pos.z), this.q, this.s);
    f.mesh.setMatrixAt(f.index, this.m);
    f.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt: number) {
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      if (f.delay > 0) {
        f.delay -= dt;
        continue;
      }
      f.t += dt;
      const fallTime = 0.3;
      const drop = 0.4 + f.size * 2.2; // small pebbles drop from lower down
      if (f.t < fallTime) {
        const k = f.t / fallTime;
        this.write(f, (1 - k * k) * drop, lerp(0.6, 1, k));
      } else {
        if (!f.landed) {
          f.landed = true;
          this.onLand(f.pos, f.size);
        }
        // Damped squash-and-stretch as it settles into the soil.
        const s = f.t - fallTime;
        const squash = Math.exp(-s * 9) * Math.cos(s * 26) * 0.3;
        const hop = Math.max(0, Math.exp(-s * 10) * Math.sin(s * 20)) * f.size * 0.18;
        this.write(f, hop, 1, squash);
        if (s > 0.7) {
          this.write(f, 0, 1, 0);
          this.falling.splice(i, 1);
        }
      }
    }
  }
}
