import * as THREE from 'three';
import { createRng, lerp } from '../core/random';
import { addWind } from '../render/wind';
import type { Ground } from './ground';

/** A tapered, slightly curved blade, 1 unit tall. Scaled per instance. */
function bladeGeometry(): THREE.BufferGeometry {
  const segments = 4;
  const pos: number[] = [];
  const nrm: number[] = [];
  for (let i = 0; i < segments; i++) {
    const v = i / segments;
    const w = 0.5 * Math.pow(1 - v, 0.8);
    const curl = v * v * 0.25;
    pos.push(-w, v, curl, w, v, curl);
  }
  pos.push(0, 1, 0.25); // tip
  // Normals point mostly up so blades shade like a soft carpet rather than flat cards.
  const n = new THREE.Vector3(0, 1, 0.25).normalize();
  for (let i = 0; i < pos.length / 3; i++) nrm.push(n.x, n.y, n.z);

  const idx: number[] = [];
  for (let i = 0; i < segments - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const last = (segments - 1) * 2;
  idx.push(last, last + 1, segments * 2);

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
        diffuseColor.rgb *= mix(0.62, 1.15, smoothstep(0.0, 1.0, vBladeH));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.1, 0.72), smoothstep(0.6, 1.0, vBladeH) * 0.6);
        // Bent blades show their paler sides: this is what makes a gust visible as it rolls by.
        diffuseColor.rgb *= 1.0 + smoothstep(0.45, 1.1, vWindAmt) * 0.22 * vBladeH;`,
      );
  });

  const mesh = new THREE.InstancedMesh(bladeGeometry(), material, count);
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

    const height = lerp(0.28, 0.6, rng() * rng()) * lerp(1, 0.75, f);
    const width = lerp(0.09, 0.15, rng());

    p.set(x, ground.heightAt(x, z) - 0.04, z);
    e.set(lerp(-0.25, 0.25, rng()), rng() * Math.PI * 2, lerp(-0.25, 0.25, rng()));
    q.setFromEuler(e);
    s.set(width, height, width);
    m.compose(p, q, s);
    mesh.setMatrixAt(placed, m);

    ground.meadowColor(x, z, color);
    tint.setHSL(0.22 + rng() * 0.08, 0.5, 0.5);
    color.lerp(tint, 0.12).multiplyScalar(lerp(0.85, 1.15, rng()));
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
  head.translate(0, 9, 0); // head sits on an implied stem; scale below maps 9 → stem height

  const material = new THREE.MeshLambertMaterial();
  addWind(material, '1.0', undefined, 9);
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
