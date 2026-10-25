import * as THREE from 'three';
import { createRng, lerp } from '../core/random';
import { addWind } from '../render/wind';
import type { Ground } from './ground';

const BLADES_PER_TUFT = 5;

/**
 * A small tuft of fine, soft blades (1 unit tall, ~0.1 m across). Tufts rather than single
 * blades give a dense, velvety meadow for a fraction of the instances.
 */
function tuftGeometry(): THREE.BufferGeometry {
  const segments = 3;
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  const n = new THREE.Vector3(0, 1, 0.2).normalize();
  for (let b = 0; b < BLADES_PER_TUFT; b++) {
    const a = (b / BLADES_PER_TUFT) * Math.PI * 2 + b * 0.7;
    const ox = Math.cos(a) * 0.06 * (b === 0 ? 0 : 1);
    const oz = Math.sin(a) * 0.06 * (b === 0 ? 0 : 1);
    const yaw = a * 1.7;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const h = b === 0 ? 1 : 0.7 + 0.25 * ((b * 37) % 10) / 10;
    const lean = 0.12 + 0.06 * b;
    const base = pos.length / 3;
    for (let i = 0; i < segments; i++) {
      const v = i / segments;
      // Soft taper: stays full most of the way, then rounds off (no needle points).
      const w = 0.03 * (1 - Math.pow(v, 2.2));
      const curl = v * v * lean;
      for (const side of [-1, 1]) {
        const lx = side * w;
        const lz = curl;
        pos.push(ox + lx * cy - lz * sy, v * h, oz + lx * sy + lz * cy);
      }
    }
    pos.push(ox - lean * sy, h, oz + lean * cy); // tip
    for (let i = 0; i < segments * 2 + 1; i++) nrm.push(n.x, n.y, n.z);
    for (let i = 0; i < segments - 1; i++) {
      const a0 = base + i * 2;
      idx.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
    }
    const last = base + (segments - 1) * 2;
    idx.push(last, last + 1, base + segments * 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  return geo;
}

type Blocked = (x: number, z: number) => boolean;

export function createGrass(ground: Ground, count: number, seed: number, blocked: Blocked): THREE.InstancedMesh {
  const rng = createRng(seed);
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  addWind(material, 'position.y', (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vBladeH;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBladeH = position.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBladeH;\nvarying float vWindAmt;')
      // Light both faces of a blade the same way; flipped back-face normals read as black specks.
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        // Dark, cool roots rising to warm, sunlit tips.
        diffuseColor.rgb *= mix(0.72, 1.12, smoothstep(0.0, 1.0, vBladeH));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.07, 0.82), smoothstep(0.6, 1.0, vBladeH) * 0.45);
        // Bent blades show their paler sides: this is what makes a gust visible as it rolls by.
        diffuseColor.rgb *= 1.0 + smoothstep(0.45, 1.1, vWindAmt) * 0.22 * vBladeH;`,
      );
  });

  const mesh = new THREE.InstancedMesh(tuftGeometry(), material, count);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const e = new THREE.Euler();
  const color = new THREE.Color();
  const tint = new THREE.Color();
  const extent = 25;

  let placed = 0;
  let guard = 0;
  while (placed < count && guard++ < count * 6) {
    const x = (rng() * 2 - 1) * extent;
    const z = (rng() * 2 - 1) * extent;
    // Full meadow in the clearing, thinning out under the trees.
    const f = ground.forestness(x, z);
    if (rng() < f * 1.15 || blocked(x, z)) continue;

    const height = lerp(0.2, 0.38, rng() * rng()) * lerp(1, 0.75, f);
    const spread = lerp(0.85, 1.25, rng());

    p.set(x, ground.heightAt(x, z) - 0.02, z);
    e.set(lerp(-0.1, 0.1, rng()), rng() * Math.PI * 2, lerp(-0.1, 0.1, rng()));
    q.setFromEuler(e);
    s.set(spread, height, spread);
    m.compose(p, q, s);
    mesh.setMatrixAt(placed, m);

    ground.meadowColor(x, z, color);
    tint.setHSL(0.22 + rng() * 0.08, 0.5, 0.5);
    color.lerp(tint, 0.08).multiplyScalar(lerp(0.93, 1.07, rng()));
    mesh.setColorAt(placed, color);
    placed++;
  }
  mesh.count = placed;
  return mesh;
}

/**
 * Wildflowers drifting through untended meadow, in the colours of the current season.
 * (Later, built areas will push them back and empty grass will invite them in.)
 */
export function createWildflowers(ground: Ground, palette: string[], count: number, seed: number, blocked: Blocked): THREE.InstancedMesh {
  const rng = createRng(seed);
  const head = new THREE.IcosahedronGeometry(1, 0);
  head.scale(1, 0.55, 1);
  head.translate(0, 6.5, 0); // head sits on an implied stem just above the lawn

  const material = new THREE.MeshLambertMaterial();
  addWind(material, '1.0', undefined, 6.5);
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
