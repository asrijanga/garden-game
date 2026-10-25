import * as THREE from 'three';
import { createRng, lerp } from '../core/random';
import { addWind } from '../render/wind';
import type { Terrain } from './terrain';

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

export function createGrass(terrain: Terrain, count: number, seed: number): THREE.InstancedMesh {
  const rng = createRng(seed);
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  addWind(material, 'position.y', (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vBladeH;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBladeH = position.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBladeH;')
      // Light both faces of a blade the same way; flipped back-face normals read as black specks.
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        // Dark, cool roots rising to warm, sunlit tips.
        diffuseColor.rgb *= mix(0.62, 1.15, smoothstep(0.0, 1.0, vBladeH));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.1, 0.72), smoothstep(0.6, 1.0, vBladeH) * 0.6);`,
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

  let placed = 0;
  let guard = 0;
  while (placed < count && guard++ < count * 4) {
    const x = (rng() * 2 - 1) * 10;
    const z = (rng() * 2 - 1) * 10;
    // Blades also cover most of the rounded lip, so the turf reads as a soft carpet.
    if (!terrain.isOnTop(x, z, -0.32)) continue;

    const edge = Math.min(terrain.edgeFactor(x, z), 1);
    const height = lerp(0.28, 0.6, rng() * rng()) * lerp(1, 0.7, edge * edge);
    const width = lerp(0.07, 0.12, rng());

    p.set(x, terrain.surfaceHeight(x, z) - 0.04, z);
    e.set(lerp(-0.25, 0.25, rng()), rng() * Math.PI * 2, lerp(-0.25, 0.25, rng()));
    q.setFromEuler(e);
    s.set(width, height, width);
    m.compose(p, q, s);
    mesh.setMatrixAt(placed, m);

    terrain.meadowColor(x, z, color);
    tint.setHSL(0.22 + rng() * 0.08, 0.5, 0.5);
    color.lerp(tint, 0.12).multiplyScalar(lerp(0.85, 1.15, rng()));
    mesh.setColorAt(placed, color);
    placed++;
  }
  mesh.count = placed;
  return mesh;
}

const WILDFLOWER_PALETTE = ['#fff6e8', '#fff6e8', '#ffe27a', '#f6b3c8', '#c9b8f0', '#ffffff'];

/** Tiny wildflower heads peeking out of the meadow, bobbing with the same wind. */
export function createWildflowers(terrain: Terrain, count: number, seed: number): THREE.InstancedMesh {
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
  const color = new THREE.Color();

  let placed = 0;
  let guard = 0;
  while (placed < count && guard++ < count * 6) {
    // Clustered: pick a patch centre, then scatter around it.
    const cx = (rng() * 2 - 1) * 8;
    const cz = (rng() * 2 - 1) * 8;
    const patch = 3 + Math.floor(rng() * 6);
    const hex = WILDFLOWER_PALETTE[Math.floor(rng() * WILDFLOWER_PALETTE.length)];
    for (let i = 0; i < patch && placed < count; i++) {
      const x = cx + (rng() - 0.5) * 1.4;
      const z = cz + (rng() - 0.5) * 1.4;
      if (!terrain.isOnTop(x, z, 0.3)) continue;
      const size = lerp(0.035, 0.055, rng());
      p.set(x, terrain.heightAt(x, z), z);
      q.setFromEuler(new THREE.Euler(0, rng() * Math.PI * 2, 0));
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
