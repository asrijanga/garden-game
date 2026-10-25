import * as THREE from 'three';
import { createRng, lerp } from '../core/random';
import { addWind } from '../render/wind';
import type { Ground } from './ground';

type Blocked = (x: number, z: number) => boolean;

/**
 * Wildflowers drifting through untended meadow, in the colours of the current season.
 * (Later, built areas will push them back and empty grass will invite them in.)
 */
export function createWildflowers(ground: Ground, palette: string[], count: number, seed: number, blocked: Blocked): THREE.InstancedMesh {
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
      mesh.setColorAt(placed, color.set(hex).multiplyScalar(lerp(0.9, 1.1, rng())));
      placed++;
    }
  }
  mesh.count = placed;
  return mesh;
}
