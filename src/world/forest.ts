import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise2D } from '../core/noise';
import { createRng, lerp } from '../core/random';
import { addWind } from '../render/wind';
import type { Ground } from './ground';
import { CLEARING_RADIUS } from './ground';
import type { SeasonPalette } from './season';

const FOREST_RADIUS = 72;
const SHADOW_RADIUS = CLEARING_RADIUS + 12; // only trees near the garden cast shadows

/** Soft, lumpy ball of foliage. Shared by every broadleaf canopy and bush. */
function foliageGeometry(): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 1);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const noise = createNoise2D(7);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const lump = 1 + noise(v.x * 1.6 + v.y, v.z * 1.6 - v.y) * 0.13;
    v.multiplyScalar(lump);
    v.y *= 0.82; // slightly flattened, like a real crown
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

class Batch {
  readonly matrices: THREE.Matrix4[] = [];
  readonly colors: THREE.Color[] = [];
  add(m: THREE.Matrix4, c: THREE.Color) {
    this.matrices.push(m.clone());
    this.colors.push(c.clone());
  }
  build(geo: THREE.BufferGeometry, mat: THREE.Material, shadows: boolean): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, this.matrices.length));
    this.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    this.colors.forEach((c, i) => mesh.setColorAt(i, c));
    mesh.count = this.matrices.length;
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return mesh;
  }
}

function canopyMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial();
  addWind(
    mat,
    'clamp(position.y * 0.5 + 0.5, 0.0, 1.0)',
    (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vLocalY;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalY = position.y;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vLocalY;')
        .replace(
          '#include <color_fragment>',
          // Self-shading: crowns are darker underneath, glowing on top.
          '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.55, 1.12, smoothstep(-0.9, 0.9, vLocalY));',
        );
    },
    0.22,
  );
  return mat;
}

function pineMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ flatShading: true });
  addWind(mat, 'position.y', undefined, 0.09);
  return mat;
}

/**
 * A dense, layered forest wrapping the clearing: broadleaf trees in seasonal colours,
 * dark evergreens for contrast, and a soft fringe of bushes where the meadow meets the trees.
 */
export function createForest(
  ground: Ground,
  palette: SeasonPalette,
  seed: number,
  avoid: (x: number, z: number) => boolean,
): THREE.Group {
  const rng = createRng(seed);
  const canopyColors = palette.canopy.map((c) => new THREE.Color(c));
  const pineColors = palette.pine.map((c) => new THREE.Color(c));

  const near = { trunk: new Batch(), blob: new Batch(), cone: new Batch() };
  const far = { trunk: new Batch(), blob: new Batch(), cone: new Batch() };

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  const bark = new THREE.Color('#6b4a33');
  const birch = new THREE.Color('#e6ddd0');

  const place = (batch: Batch, x: number, y: number, z: number, sx: number, sy: number, sz: number, col: THREE.Color, yaw = rng() * 6.28) => {
    p.set(x, y, z);
    e.set(0, yaw, 0);
    q.setFromEuler(e);
    s.set(sx, sy, sz);
    m.compose(p, q, s);
    batch.add(m, col);
  };

  const spacing = 2.35;
  for (let gx = -FOREST_RADIUS; gx <= FOREST_RADIUS; gx += spacing) {
    for (let gz = -FOREST_RADIUS; gz <= FOREST_RADIUS; gz += spacing) {
      const x = gx + (rng() - 0.5) * spacing * 0.9;
      const z = gz + (rng() - 0.5) * spacing * 0.9;
      const r = Math.hypot(x, z);
      if (r > FOREST_RADIUS) continue;
      const f = ground.forestness(x, z);
      if (f < 0.75 || avoid(x, z)) continue;

      const set = r < SHADOW_RADIUS ? near : far;
      const y = ground.heightAt(x, z);
      // Trees right at the edge are a little smaller, so the forest steps down to the meadow.
      const edgeScale = lerp(0.7, 1.0, Math.min(1, (f - 0.75) * 4)) * lerp(0.9, 1.2, rng());

      if (rng() < 0.3) {
        // Evergreen: stacked, slightly irregular tiers.
        const col = c.copy(pineColors[Math.floor(rng() * pineColors.length)]).multiplyScalar(lerp(0.85, 1.1, rng()));
        const height = lerp(6, 10, rng()) * edgeScale;
        const width = height * lerp(0.26, 0.32, rng());
        place(set.trunk, x, y, z, 0.25, height * 0.25, 0.25, bark);
        const tiers = 4;
        for (let t = 0; t < tiers; t++) {
          const k = t / tiers;
          const tw = width * (1 - k * 0.62);
          const ty = y + height * (0.18 + k * 0.62);
          place(set.cone, x, ty, z, tw, height * 0.38, tw, col);
        }
      } else {
        const col = c.copy(canopyColors[Math.floor(rng() * canopyColors.length)]).multiplyScalar(lerp(0.88, 1.08, rng()));
        const isBirch = rng() < 0.15;
        const trunkH = lerp(2.0, 3.6, rng()) * edgeScale;
        const crown = lerp(1.9, 2.8, rng()) * edgeScale;
        place(set.trunk, x, y, z, isBirch ? 0.2 : 0.32, trunkH + crown * 0.5, isBirch ? 0.2 : 0.32, isBirch ? birch : bark);
        const cy = y + trunkH + crown * 0.55;
        place(set.blob, x, cy, z, crown, crown, crown, col);
        const extra = set === near ? 3 : 2;
        for (let b = 0; b < extra; b++) {
          const a = rng() * Math.PI * 2;
          const d = crown * lerp(0.45, 0.75, rng());
          const sub = crown * lerp(0.55, 0.75, rng());
          const tint = col.clone().offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.06);
          place(set.blob, x + Math.cos(a) * d, cy + lerp(-0.3, 0.6, rng()) * crown, z + Math.sin(a) * d, sub, sub, sub, tint);
        }
      }
    }
  }

  // A soft fringe of bushes where meadow meets forest.
  for (let i = 0; i < 520; i++) {
    const a = rng() * Math.PI * 2;
    const r = ground.clearingRadius(a) + lerp(0.2, 3.2, rng());
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (avoid(x, z)) continue;
    const size = lerp(0.6, 1.3, rng());
    const col = c.copy(canopyColors[Math.floor(rng() * canopyColors.length)]).lerp(pineColors[0], 0.35).multiplyScalar(lerp(0.85, 1.05, rng()));
    place(near.blob, x, ground.heightAt(x, z) + size * 0.35, z, size * 1.2, size, size * 1.2, col);
  }

  const group = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.6, 1, 1, 6).translate(0, 0.5, 0);
  const coneGeo = new THREE.ConeGeometry(1, 1, 8, 1).translate(0, 0.5, 0);
  const blobGeo = foliageGeometry();
  const trunkMat = new THREE.MeshLambertMaterial();
  const canopyMat = canopyMaterial();
  const coneMat = pineMaterial();

  for (const [set, shadows] of [[near, true], [far, false]] as const) {
    group.add(set.trunk.build(trunkGeo, trunkMat, shadows));
    group.add(set.blob.build(blobGeo, canopyMat, shadows));
    group.add(set.cone.build(coneGeo, coneMat, shadows));
  }
  return group;
}
