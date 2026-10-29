import * as THREE from 'three';
import { cullers, InstanceCuller } from '../render/cull';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng, lerp } from '../core/random';
import { addWind } from '../render/wind';
import { CLEARING_RADIUS, type Ground } from './ground';
import type { Season } from './season';

type Rng = () => number;

function colored(g: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g.index ? g.toNonIndexed() : g;
}

/** A fern: a ring of arching fronds, each a tapering, slightly curled strip. */
function fernGeometry(rng: Rng, tone: THREE.Color): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const fronds = 6 + Math.floor(rng() * 4);
  for (let f = 0; f < fronds; f++) {
    const len = lerp(0.35, 0.55, rng());
    const seg = 6;
    const pos: number[] = [];
    // A strip out along +x, rising then arching back down, narrowing to the tip.
    for (let s = 0; s <= seg; s++) {
      const t = s / seg;
      const x = t * len;
      const y = Math.sin(t * Math.PI * 0.85) * len * 0.55 - t * t * len * 0.15;
      const w = 0.07 * (1 - t * 0.85) * (s % 2 ? 0.75 : 1); // a little leaflet ripple
      pos.push(x, y, -w, x, y, w);
    }
    const idx: number[] = [];
    for (let s = 0; s < seg; s++) {
      const a = s * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.rotateY((f / fronds) * Math.PI * 2 + rng() * 0.5);
    parts.push(colored(g, tone.clone().multiplyScalar(lerp(0.85, 1.1, rng()))));
  }
  return mergeGeometries(parts);
}

/** A little huddle of mushrooms: pale stems and domed caps of one colour. */
function mushroomGeometry(rng: Rng, capC: THREE.Color): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = 2 + Math.floor(rng() * 3);
  const stemC = new THREE.Color('#efe6d2');
  for (let i = 0; i < n; i++) {
    const h = lerp(0.04, 0.09, rng());
    const r = lerp(0.025, 0.045, rng());
    const x = (rng() - 0.5) * 0.12;
    const z = (rng() - 0.5) * 0.12;
    const lean = (rng() - 0.5) * 0.3;
    const stem = new THREE.CylinderGeometry(r * 0.3, r * 0.38, h, 6).translate(0, h / 2, 0);
    const cap = new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1).translate(0, h, 0);
    for (const g of [stem, cap]) g.rotateZ(lean).translate(x, 0, z);
    parts.push(colored(stem, stemC), colored(cap, capC.clone().multiplyScalar(lerp(0.9, 1.08, rng()))));
  }
  return mergeGeometries(parts);
}

/**
 * The shady fringe where the meadow meets the trees: ferns arching out of the forest floor and,
 * here and there, a huddle of mushrooms. Grows thickest just inside the tree line.
 */
export function createForestFloor(ground: Ground, season: Season, seed: number, avoid: (x: number, z: number) => boolean): THREE.Group {
  const group = new THREE.Group();
  if (season === 'winter') return group; // the ferns have died back under the snow
  const rng = createRng(seed);
  const fernTone = new THREE.Color(season === 'autumn' ? '#9a8a3e' : season === 'spring' ? '#6fa045' : '#4f8a3a');
  const fernMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  addWind(fernMat, 'clamp(position.y * 2.5, 0.0, 1.0)', undefined, 0.5);
  const VARIANTS = 3;
  const ferns = Array.from({ length: VARIANTS }, (_, k) => {
    const m = new THREE.InstancedMesh(fernGeometry(createRng(seed + 7 + k), fernTone), fernMat, 160);
    m.count = 0;
    m.receiveShadow = true;
    m.frustumCulled = false;
    group.add(m);
    return m;
  });
  const shroomMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const shrooms = ['#b5493a', '#c9a27a', '#a8784e', '#e8dcc4'].map((c, k) => {
    const mesh = new THREE.InstancedMesh(mushroomGeometry(createRng(seed + 20 + k), new THREE.Color(c)), shroomMat, 24);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  });

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  // Ferns grow in small colonies: pick a spot along the edge, then a few around it.
  for (let colony = 0; colony < 90; colony++) {
    const a = rng() * Math.PI * 2;
    const r = CLEARING_RADIUS + lerp(-1, 4, rng());
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const n = 2 + Math.floor(rng() * 5);
    for (let i = 0; i < n; i++) {
      const x = cx + (rng() - 0.5) * 1.6;
      const z = cz + (rng() - 0.5) * 1.6;
      const f = ground.forestness(x, z);
      if (f < 0.3 || f > 0.85 || avoid(x, z)) continue;
      const mesh = ferns[Math.floor(rng() * VARIANTS)];
      if (mesh.count >= 160) continue;
      const k = lerp(0.75, 1.3, rng()) * lerp(0.85, 1.1, f);
      m.compose(p.set(x, ground.heightAt(x, z) - 0.02, z), q.setFromEuler(e.set((rng() - 0.5) * 0.15, rng() * 6.28, (rng() - 0.5) * 0.15)), s.set(k, k * lerp(0.85, 1.15, rng()), k));
      mesh.setMatrixAt(mesh.count++, m);
    }
  }
  // Mushrooms: fewer, in the damp just under the trees, sometimes by a fern.
  for (let tries = 0; tries < 400; tries++) {
    const a = rng() * Math.PI * 2;
    const r = CLEARING_RADIUS + lerp(0, 4, rng());
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const f = ground.forestness(x, z);
    if (f < 0.4 || f > 0.9 || avoid(x, z) || rng() > 0.4) continue;
    const k = lerp(0.8, 1.4, rng());
    m.compose(p.set(x, ground.heightAt(x, z) - 0.01, z), q.setFromEuler(e.set(0, rng() * 6.28, 0)), s.set(k, k, k));
    const mesh = shrooms[Math.floor(rng() * shrooms.length)];
    if (mesh.count < 24) mesh.setMatrixAt(mesh.count++, m);
  }
  // Only those in view are drawn.
  for (const mesh of [...ferns, ...shrooms]) if (mesh.count) cullers.push(new InstanceCuller([mesh], mesh.count, mesh.count));
  return group;
}
