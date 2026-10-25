import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise2D } from '../core/noise';
import { createRng, lerp } from '../core/random';

const ARCHETYPES = 7;
const CAPACITY = 700; // per archetype
const STONE_TONES = ['#d6cfc2', '#c7c0b4', '#ddd3c1', '#bdb7ad', '#d0c2ab', '#c9c4ba'];

/** A flat, rounded, irregular stepping stone. Each archetype is a different hand-picked shape. */
function stoneGeometry(seed: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 2);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const noise = createNoise2D(seed);
  const rng = createRng(seed);
  const sx = lerp(0.85, 1.15, rng());
  const sz = lerp(0.75, 1.0, rng());
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const a = Math.atan2(v.z, v.x);
    const lump = 1 + noise(Math.cos(a) * 1.3, Math.sin(a) * 1.3) * 0.16 + noise(v.x * 2.5, v.z * 2.5) * 0.05;
    v.x *= sx * lump;
    v.z *= sz * lump;
    // Flat, worn top; rounded shoulders; a buried bottom.
    v.y = v.y > 0 ? Math.pow(v.y, 1.6) * 0.32 : v.y * 0.25;
    pos.setXYZ(i, v.x, v.y, v.z);
    // Lighter, sun-bleached top; darker, earthy underside.
    const shade = v.y > 0 ? lerp(0.92, 1.06, v.y / 0.32) : 0.72;
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
 * Stepping stones that drop into place with a soft squash and bounce. All stones of a shape share
 * one InstancedMesh; only the ones still settling are updated each frame.
 */
export class Stones {
  readonly group = new THREE.Group();
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly falling: Falling[] = [];
  private readonly placed: THREE.Vector2[] = [];
  private readonly rng = createRng(31);
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly e = new THREE.Euler();

  constructor(private readonly onLand: (p: THREE.Vector3, size: number) => void) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (let a = 0; a < ARCHETYPES; a++) {
      const mesh = new THREE.InstancedMesh(stoneGeometry(100 + a * 17), mat, CAPACITY);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
  }

  /** Is there already a stone within `r` of (x, z)? Keeps crossing paths from piling up. */
  isOccupied(x: number, z: number, r: number): boolean {
    const r2 = r * r;
    for (const p of this.placed) {
      const dx = p.x - x;
      const dz = p.y - z;
      if (dx * dx + dz * dz < r2) return true;
    }
    return false;
  }

  add(x: number, y: number, z: number, size: number, delay: number) {
    const mesh = this.meshes[Math.floor(this.rng() * this.meshes.length)];
    if (mesh.count >= CAPACITY) return;
    const index = mesh.count++;
    const tone = new THREE.Color(STONE_TONES[Math.floor(this.rng() * STONE_TONES.length)]).multiplyScalar(lerp(0.94, 1.06, this.rng()));
    mesh.setColorAt(index, tone);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    const f: Falling = { mesh, index, pos: new THREE.Vector3(x, y, z), yaw: this.rng() * Math.PI * 2, size, delay, t: 0, landed: false };
    this.placed.push(new THREE.Vector2(x, z));
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
      const fallTime = 0.32;
      if (f.t < fallTime) {
        // Drop in from a little above, growing to full size as it falls.
        const k = f.t / fallTime;
        this.write(f, (1 - k * k) * 1.1, lerp(0.6, 1, k));
      } else {
        if (!f.landed) {
          f.landed = true;
          this.onLand(f.pos, f.size);
        }
        // Damped squash-and-stretch as it settles into the soil.
        const s = f.t - fallTime;
        const squash = Math.exp(-s * 9) * Math.cos(s * 26) * 0.32;
        const hop = Math.max(0, Math.exp(-s * 10) * Math.sin(s * 20)) * 0.06;
        this.write(f, hop, 1, squash);
        if (s > 0.7) {
          this.write(f, 0, 1, 0);
          this.falling.splice(i, 1);
        }
      }
    }
  }
}
