import * as THREE from 'three';
import { createRng, lerp } from '../core/random';
import { addWind } from '../render/wind';
import type { Ground } from './ground';

type Blocked = (x: number, z: number) => boolean;

/**
 * Wildflowers drifting through untended meadow, in the colours of the current season.
 * Built things (paths, beds, ponds) gently push them aside.
 */
export class Wildflowers {
  readonly mesh: THREE.InstancedMesh;
  private readonly base: THREE.Matrix4[] = [];
  private readonly positions: THREE.Vector2[] = [];
  private readonly scale: Float32Array;
  private readonly target: Float32Array;
  private readonly shrinking = new Set<number>();

  constructor(ground: Ground, palette: string[], count: number, seed: number, blocked: Blocked) {
    this.mesh = buildWildflowers(ground, palette, count, seed, blocked, this.base, this.positions);
    this.scale = new Float32Array(this.base.length).fill(1);
    this.target = new Float32Array(this.base.length).fill(1);
  }

  /** Flowers within `r` of (x, z) shrink away into the lawn. */
  clearNear(x: number, z: number, r: number) {
    const r2 = r * r;
    for (let i = 0; i < this.positions.length; i++) {
      if (this.target[i] === 0) continue;
      const dx = this.positions[i].x - x;
      const dz = this.positions[i].y - z;
      if (dx * dx + dz * dz < r2) {
        this.target[i] = 0;
        this.shrinking.add(i);
      }
    }
  }

  update(dt: number) {
    if (!this.shrinking.size) return;
    const m = new THREE.Matrix4();
    const sc = new THREE.Matrix4();
    for (const i of this.shrinking) {
      this.scale[i] = Math.max(0, this.scale[i] - dt * 2.5);
      const k = Math.max(0.0001, this.scale[i]);
      m.copy(this.base[i]).multiply(sc.makeScale(k, k, k));
      this.mesh.setMatrixAt(i, m);
      if (this.scale[i] <= 0) this.shrinking.delete(i);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function buildWildflowers(
  ground: Ground,
  palette: string[],
  count: number,
  seed: number,
  blocked: Blocked,
  base: THREE.Matrix4[],
  positions: THREE.Vector2[],
): THREE.InstancedMesh {
  const rng = createRng(seed);
  const head = new THREE.IcosahedronGeometry(1, 0);
  head.scale(1, 0.55, 1);
  head.translate(0, 1.6, 0); // tiny blooms sitting just above the lawn

  const material = new THREE.MeshLambertMaterial();
  addWind(material, '1.0', undefined, 3.0);
  const mesh = new THREE.InstancedMesh(head, material, count);
  mesh.frustumCulled = false;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const e = new THREE.Euler();
  const color = new THREE.Color();

  let placed = 0;
  let guard = 0;
  while (placed < count && guard++ < count * 6) {
    // Clustered: pick a patch centre, then scatter around it.
    const cx = (rng() * 2 - 1) * 20;
    const cz = (rng() * 2 - 1) * 20;
    const patch = 3 + Math.floor(rng() * 7);
    const hex = palette[Math.floor(rng() * palette.length)];
    for (let i = 0; i < patch && placed < count; i++) {
      const x = cx + (rng() - 0.5) * 1.6;
      const z = cz + (rng() - 0.5) * 1.6;
      if (ground.forestness(x, z) > 0.3 || blocked(x, z)) continue;
      const size = lerp(0.035, 0.055, rng());
      p.set(x, ground.heightAt(x, z), z);
      q.setFromEuler(e.set(0, rng() * Math.PI * 2, 0));
      s.setScalar(size);
      m.compose(p, q, s);
      mesh.setMatrixAt(placed, m);
      base.push(m.clone());
      positions.push(new THREE.Vector2(x, z));
      mesh.setColorAt(placed, color.set(hex).multiplyScalar(lerp(0.9, 1.1, rng())));
      placed++;
    }
  }
  mesh.count = placed;
  return mesh;
}
