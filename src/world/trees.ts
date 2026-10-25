import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng, lerp, smoothstep } from '../core/random';
import { addWind } from '../render/wind';
import type { Ground } from './ground';
import { CLEARING_RADIUS } from './ground';
import type { Season, SeasonPalette } from './season';

/*
 * Procedural trees. Each species gets a handful of "archetypes": real branching wood
 * (trunk → limbs → twigs) with crowns built from many small leaf-cluster cards. Every tree in
 * the forest is an instance of an archetype with its own position, size, lean, yaw and colour,
 * so no two look alike, yet thousands of them render in a few draw calls.
 */

const UP = new THREE.Vector3(0, 1, 0);
const TREE_REF_HEIGHT = 10; // metres; wind height is measured against this
const NEAR_RADIUS = CLEARING_RADIUS + 16; // detailed trees (and shadows) inside this
const FOREST_RADIUS = 64;
const TREE_SWAY = 0.8; // how far crowns lean in a gust (scales the shared wind bend)

type Rng = () => number;
type Lod = 'near' | 'far';

interface Part {
  geometry: THREE.BufferGeometry;
  kind: 'wood' | 'leaf' | 'needle' | 'skirt';
}
interface Archetype {
  parts: Part[];
}

// --- Textures -------------------------------------------------------------------------------

/** A clump of little leaves, greyscale so each tree can tint it with its own colour. */
function leafClusterTexture(rng: Rng): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  const c = size / 2;
  for (let i = 0; i < 95; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * size * 0.36;
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    const len = lerp(28, 44, rng());
    const wid = len * lerp(0.42, 0.55, rng());
    const rot = a + lerp(-0.6, 0.6, rng());
    const shade = Math.round(lerp(165, 255, rng()));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.beginPath();
    ctx.moveTo(-len / 2, 0);
    ctx.quadraticCurveTo(0, -wid, len / 2, 0);
    ctx.quadraticCurveTo(0, wid, -len / 2, 0);
    ctx.fill();
    ctx.strokeStyle = `rgba(0,0,0,0.18)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-len / 2, 0);
    ctx.lineTo(len / 2, 0);
    ctx.stroke();
    ctx.restore();
  }
  return finishTexture(canvas);
}

/** A tuft of needles radiating from a twig. */
function needleTexture(rng: Rng): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.lineCap = 'round';
  for (let twig = 0; twig < 5; twig++) {
    const sx = size * lerp(0.3, 0.7, rng());
    const sy = size * lerp(0.3, 0.7, rng());
    const dir = rng() * Math.PI * 2;
    for (let i = 0; i < 70; i++) {
      const t = rng();
      const bx = sx + Math.cos(dir) * t * 70;
      const by = sy + Math.sin(dir) * t * 70;
      const side = rng() < 0.5 ? -1 : 1;
      const a = dir + side * lerp(0.5, 1.1, rng());
      const len = lerp(16, 30, rng()) * (1 - t * 0.4);
      const shade = Math.round(lerp(150, 245, rng()));
      ctx.strokeStyle = `rgb(${shade},${shade},${shade})`;
      ctx.lineWidth = lerp(2.5, 4, rng());
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(a) * len, by + Math.sin(a) * len);
      ctx.stroke();
    }
  }
  return finishTexture(canvas);
}

function finishTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// --- Geometry builders ------------------------------------------------------------------------

/** A tapered wooden segment from a to b, with darker bark toward the base of the tree. */
function woodSegment(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, radial = 6): THREE.BufferGeometry {
  const dir = b.clone().sub(a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(rb, ra, len, radial, 1, true);
  g.deleteAttribute('uv');
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  g.translate(a.x, a.y, a.z);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = lerp(0.62, 1.0, smoothstep(0, 4, pos.getY(i)));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * Leaf cards scattered around cluster centres. Normals point out from the crown's centre so
 * the whole crown shades like one soft, round volume; vertex colours darken the interior.
 */
function leafCards(rng: Rng, clusters: { center: THREE.Vector3; radius: number; count: number; size: number }[], crownCenter: THREE.Vector3, crownRadius: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const corner = new THREE.Vector3();
  const n = new THREE.Vector3();
  const corners = [[-0.5, -0.5, 0, 0], [0.5, -0.5, 1, 0], [0.5, 0.5, 1, 1], [-0.5, 0.5, 0, 1]];

  for (const cl of clusters) {
    for (let i = 0; i < cl.count; i++) {
      const center = randomInSphere(rng).multiplyScalar(cl.radius).add(cl.center);
      const size = cl.size * lerp(0.75, 1.25, rng());
      e.set(rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2);
      q.setFromEuler(e);
      const tint = [lerp(0.92, 1.06, rng()), lerp(0.94, 1.06, rng()), lerp(0.9, 1.04, rng())];
      const base = pos.length / 3;
      for (const [cx, cy, u, v] of corners) {
        corner.set(cx * size, cy * size, 0).applyQuaternion(q).add(center);
        pos.push(corner.x, corner.y, corner.z);
        uv.push(u, v);
        n.copy(corner).sub(crownCenter);
        const d = Math.min(1, n.length() / crownRadius);
        n.y += crownRadius * 0.35;
        n.normalize();
        nrm.push(n.x, n.y, n.z);
        // Inner leaves sit in the crown's own shade; the top catches more light.
        const ao = lerp(0.62, 1.0, smoothstep(0.15, 0.95, d)) * lerp(0.85, 1.08, smoothstep(-crownRadius, crownRadius, corner.y - crownCenter.y));
        col.push(ao * tint[0], ao * tint[1], ao * tint[2]);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function randomInSphere(rng: Rng): THREE.Vector3 {
  const v = new THREE.Vector3();
  do v.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
  while (v.lengthSq() > 1);
  return v;
}

/** Rotate `dir` away from itself by `tilt` radians, around azimuth `az`. */
function tiltDir(dir: THREE.Vector3, tilt: number, az: number): THREE.Vector3 {
  const ref = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP;
  const p1 = new THREE.Vector3().crossVectors(dir, ref).normalize();
  const p2 = new THREE.Vector3().crossVectors(dir, p1).normalize();
  const perp = p1.multiplyScalar(Math.cos(az)).add(p2.multiplyScalar(Math.sin(az)));
  return dir.clone().multiplyScalar(Math.cos(tilt)).add(perp.multiplyScalar(Math.sin(tilt))).normalize();
}

interface BroadleafOpts {
  birch: boolean;
  lod: Lod;
  /** 0..1: how much foliage remains (winter strips it). */
  leafiness: number;
}

function buildBroadleaf(rng: Rng, o: BroadleafOpts): Archetype {
  const wood: THREE.BufferGeometry[] = [];
  const tips: THREE.Vector3[] = [];
  const maxDepth = 2;
  const radial = o.lod === 'near' ? 6 : 4;

  const grow = (start: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number) => {
    // Two gently bent pieces per limb so branches never look like straight pipes.
    const bend = tiltDir(dir, lerp(0.05, 0.25, rng()), rng() * Math.PI * 2);
    bend.y += 0.12;
    bend.normalize();
    const mid = start.clone().addScaledVector(dir, len * 0.5);
    const end = mid.clone().addScaledVector(bend, len * 0.5);
    wood.push(woodSegment(start, mid, rad, rad * 0.82, radial), woodSegment(mid, end, rad * 0.82, rad * 0.66, radial));
    if (depth >= maxDepth) {
      tips.push(end);
      // Twigs: a couple of short sprigs carry leaves outward.
      if (o.lod === 'near' && !o.birch) {
        for (let k = 0; k < 2; k++) {
          const tw = tiltDir(bend, lerp(0.5, 0.9, rng()), rng() * Math.PI * 2);
          const twEnd = end.clone().addScaledVector(tw, len * 0.45);
          wood.push(woodSegment(end, twEnd, rad * 0.6, rad * 0.3, 4));
        }
      }
      return;
    }
    const children = depth === 0 ? (o.birch ? 3 : 3 + Math.floor(rng() * 2)) : 2 + Math.floor(rng() * 2);
    const az0 = rng() * Math.PI * 2;
    for (let i = 0; i < children; i++) {
      const az = az0 + (i / children) * Math.PI * 2 + lerp(-0.4, 0.4, rng());
      const tilt = o.birch ? lerp(0.3, 0.55, rng()) : depth === 0 ? lerp(0.55, 0.95, rng()) : lerp(0.45, 0.85, rng());
      const childDir = tiltDir(bend, tilt, az);
      childDir.y += 0.15;
      childDir.normalize();
      const from = end.clone().addScaledVector(bend, -len * 0.5 * lerp(0, 0.5, rng()));
      grow(from, childDir, len * lerp(0.6, 0.75, rng()), rad * 0.6, depth + 1);
    }
    // A leader carries on upward for a taller, natural silhouette.
    if (depth === 0) grow(end, tiltDir(bend, 0.15, rng() * 6), len * 0.7, rad * 0.65, depth + 1);
  };

  const trunkLen = o.birch ? lerp(4.2, 5.2, rng()) : lerp(2.6, 3.4, rng());
  const trunkRad = o.birch ? 0.17 : lerp(0.28, 0.36, rng());
  const lean = tiltDir(UP, lerp(0, 0.12, rng()), rng() * Math.PI * 2);
  grow(new THREE.Vector3(0, -0.2, 0), lean, trunkLen, trunkRad, 0);

  const crownCenter = tips.reduce((acc, t) => acc.add(t), new THREE.Vector3()).divideScalar(tips.length);
  const crownRadius = Math.max(...tips.map((t) => t.distanceTo(crownCenter))) + 0.9;

  const near = o.lod === 'near';
  const perTip = Math.max(1, Math.round((near ? (o.birch ? 7 : 7) : 3) * o.leafiness));
  const size = (o.birch ? 1.1 : 1.55) * (near ? 1 : 1.7);
  const clusters = tips
    .filter(() => rng() < Math.max(0.15, o.leafiness))
    .map((center) => ({ center, radius: o.birch ? 0.9 : 1.25, count: perTip, size }));
  // Fill the heart of the crown so it never looks hollow from above.
  if (o.leafiness > 0.5) {
    clusters.push({ center: crownCenter.clone().add(new THREE.Vector3(0, 0.3, 0)), radius: crownRadius * 0.55, count: near ? 18 : 7, size: size * 1.1 });
  }

  const parts: Part[] = [{ geometry: mergeGeometries(wood), kind: 'wood' }];
  if (clusters.length) parts.push({ geometry: leafCards(rng, clusters, crownCenter, crownRadius), kind: 'leaf' });
  return { parts };
}

function buildPine(rng: Rng, lod: Lod): Archetype {
  const height = lerp(8, 11, rng());
  const wood = [woodSegment(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0, height * 0.92, 0), 0.26, 0.05, lod === 'near' ? 6 : 4)];

  // Layered, drooping, jagged tiers: the classic storybook fir.
  const tiers = lod === 'near' ? 6 : 5;
  const base = height * 0.16;
  const span = height - base;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const tufts: { center: THREE.Vector3; radius: number; count: number; size: number }[] = [];
  const rimN = lod === 'near' ? 18 : 12;
  for (let t = 0; t < tiers; t++) {
    const k = t / tiers;
    const radius = lerp(2.5, 0.7, Math.pow(k, 0.9)) * lerp(0.9, 1.1, rng());
    const yTop = base + span * (k + 1.25 / tiers);
    const yRim = base + span * k - radius * 0.18;
    const top = pos.length / 3;
    pos.push(0, Math.min(yTop, height), 0);
    col.push(1, 1, 1);
    const twist = rng() * Math.PI * 2;
    for (let i = 0; i < rimN; i++) {
      const a = twist + (i / rimN) * Math.PI * 2;
      const jag = i % 2 === 0 ? lerp(0.95, 1.12, rng()) : lerp(0.72, 0.85, rng());
      const r = radius * jag;
      const droop = (i % 2 === 0 ? 0 : 0.18) + rng() * 0.12;
      // Mid ring bulges the skirt outward so tiers look soft and full.
      pos.push(Math.cos(a) * r * 0.55, lerp(yRim, yTop, 0.5) + 0.12, Math.sin(a) * r * 0.55);
      col.push(0.92, 0.92, 0.92);
      pos.push(Math.cos(a) * r, yRim - droop, Math.sin(a) * r);
      col.push(0.66, 0.66, 0.66);
      if (lod === 'near' && i % 3 === 0) {
        tufts.push({ center: new THREE.Vector3(Math.cos(a) * r * 0.85, yRim + 0.05, Math.sin(a) * r * 0.85), radius: 0.25, count: 1, size: 0.9 });
      }
    }
    for (let i = 0; i < rimN; i++) {
      const j = (i + 1) % rimN;
      const m0 = top + 1 + i * 2;
      const r0 = m0 + 1;
      const m1 = top + 1 + j * 2;
      const r1 = m1 + 1;
      idx.push(top, m1, m0, m0, m1, r1, m0, r1, r0);
    }
  }
  const skirt = new THREE.BufferGeometry();
  skirt.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  skirt.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  skirt.setIndex(idx);
  skirt.computeVertexNormals();

  const parts: Part[] = [
    { geometry: mergeGeometries(wood), kind: 'wood' },
    { geometry: skirt, kind: 'skirt' },
  ];
  if (tufts.length) {
    parts.push({ geometry: leafCards(rng, tufts, new THREE.Vector3(0, height * 0.45, 0), height * 0.5), kind: 'needle' });
  }
  return { parts };
}

function buildBush(rng: Rng): Archetype {
  const clusters = [];
  for (let i = 0; i < 4; i++) {
    const a = rng() * Math.PI * 2;
    clusters.push({ center: new THREE.Vector3(Math.cos(a) * 0.5, lerp(0.3, 0.7, rng()), Math.sin(a) * 0.5), radius: 0.45, count: 4, size: 0.85 });
  }
  return { parts: [{ geometry: leafCards(rng, clusters, new THREE.Vector3(0, 0.3, 0), 1.2), kind: 'leaf' }] };
}

// --- Materials --------------------------------------------------------------------------------

function foliageMaterial(map: THREE.Texture): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({
    map,
    vertexColors: true,
    alphaTest: 0.45,
    alphaToCoverage: true,
    side: THREE.DoubleSide,
  });
  addWind(
    mat,
    `clamp(position.y / ${TREE_REF_HEIGHT.toFixed(1)}, 0.0, 1.0)`,
    (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        // Leaves shimmer on their own, more as the wind picks up.
        float leafPhase = position.x * 2.3 + position.z * 1.9 + position.y * 1.3;
        transformed += objectNormal * sin(uWindTime * 5.5 + leafPhase) * 0.05 * (0.35 + uWindEnvelope);`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        // Keep the crown's soft spherical normals on both faces of every card.
        '#include <normal_fragment_begin>\nnormal = normalize(vNormal);',
      ).replace(
        '#include <color_fragment>',
        // Light glows through thin leaves a little, so crowns stay luminous, never muddy.
        '#include <color_fragment>\ndiffuseColor.rgb *= 1.18;',
      );
    },
    TREE_SWAY,
  );
  return mat;
}

function woodMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  addWind(mat, `clamp(position.y / ${TREE_REF_HEIGHT.toFixed(1)}, 0.0, 1.0)`, undefined, TREE_SWAY);
  return mat;
}

function skirtMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  addWind(mat, `clamp(position.y / ${TREE_REF_HEIGHT.toFixed(1)}, 0.0, 1.0)`, undefined, TREE_SWAY);
  return mat;
}

// --- Forest -----------------------------------------------------------------------------------

interface Species {
  archetypes: Archetype[];
  /** Colours for the leafy parts of each instance. */
  foliage: THREE.Color[];
  bark: THREE.Color;
}

class InstanceSet {
  readonly matrices: THREE.Matrix4[] = [];
  readonly foliage: THREE.Color[] = [];
}

/**
 * A dense, layered forest wrapping the clearing: broadleaf trees and birches in seasonal
 * colours, dark firs for contrast, and a soft fringe of bushes where meadow meets forest.
 */
export function createForest(ground: Ground, palette: SeasonPalette, season: Season, seed: number, avoid: (x: number, z: number) => boolean): THREE.Group {
  const rng = createRng(seed);
  const leafiness = season === 'winter' ? 0.25 : 1;
  const canopy = palette.canopy.map((c) => new THREE.Color(c));
  const pine = palette.pine.map((c) => new THREE.Color(c));

  const build = (lod: Lod) => ({
    broadleaf: { archetypes: Array.from({ length: lod === 'near' ? 6 : 4 }, () => buildBroadleaf(rng, { birch: false, lod, leafiness })), foliage: canopy, bark: new THREE.Color('#6e4c34') },
    birch: { archetypes: Array.from({ length: 3 }, () => buildBroadleaf(rng, { birch: true, lod, leafiness })), foliage: canopy, bark: new THREE.Color('#ece5da') },
    pine: { archetypes: Array.from({ length: 4 }, () => buildPine(rng, lod)), foliage: pine, bark: new THREE.Color('#5a3e2c') },
  });
  const speciesByLod: Record<Lod, Record<string, Species>> = { near: build('near'), far: build('far') };
  const bushes: Species = { archetypes: Array.from({ length: 4 }, () => buildBush(rng)), foliage: canopy, bark: new THREE.Color('#000') };

  // instances[lod][species][archetype]
  const sets = new Map<Species, InstanceSet[]>();
  const setFor = (sp: Species, a: number) => {
    if (!sets.has(sp)) sets.set(sp, sp.archetypes.map(() => new InstanceSet()));
    return sets.get(sp)![a];
  };

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const addInstance = (sp: Species, x: number, z: number, scale: number, colorJitter = 1) => {
    const a = Math.floor(rng() * sp.archetypes.length);
    p.set(x, ground.heightAt(x, z), z);
    e.set(lerp(-0.05, 0.05, rng()), rng() * Math.PI * 2, lerp(-0.05, 0.05, rng()));
    q.setFromEuler(e);
    s.setScalar(scale);
    m.compose(p, q, s);
    const set = setFor(sp, a);
    set.matrices.push(m.clone());
    const c = sp.foliage[Math.floor(rng() * sp.foliage.length)].clone();
    set.foliage.push(c.offsetHSL((rng() - 0.5) * 0.02, 0, (rng() - 0.5) * 0.05 * colorJitter));
  };

  const spacing = 3.1;
  for (let gx = -FOREST_RADIUS; gx <= FOREST_RADIUS; gx += spacing) {
    for (let gz = -FOREST_RADIUS; gz <= FOREST_RADIUS; gz += spacing) {
      const x = gx + (rng() - 0.5) * spacing * 0.95;
      const z = gz + (rng() - 0.5) * spacing * 0.95;
      const r = Math.hypot(x, z);
      if (r > FOREST_RADIUS) continue;
      const f = ground.forestness(x, z);
      if (f < 0.8 || avoid(x, z)) continue;
      const lod: Lod = r < NEAR_RADIUS ? 'near' : 'far';
      const sp = speciesByLod[lod];
      // The forest steps down toward the meadow: smaller trees at the edge.
      const edge = lerp(0.72, 1.0, Math.min(1, (f - 0.8) * 5));
      const roll = rng();
      const species = roll < 0.28 ? sp.pine : roll < 0.4 ? sp.birch : sp.broadleaf;
      addInstance(species, x, z, edge * lerp(0.85, 1.2, rng()));
    }
  }

  // A soft fringe of bushes where meadow meets forest.
  for (let i = 0; i < 380; i++) {
    const a = rng() * Math.PI * 2;
    const r = ground.clearingRadius(a) + lerp(0.0, 3.5, rng());
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (avoid(x, z)) continue;
    addInstance(bushes, x, z, lerp(0.8, 1.5, rng()));
  }

  // Build one InstancedMesh per archetype part.
  const group = new THREE.Group();
  const leafTex = leafClusterTexture(rng);
  const needleTex = needleTexture(rng);
  const mats = {
    wood: woodMaterial(),
    leaf: foliageMaterial(leafTex),
    needle: foliageMaterial(needleTex),
    skirt: skirtMaterial(),
  };
  for (const [sp, perArchetype] of sets) {
    const isNear = sp === bushes || Object.values(speciesByLod.near).includes(sp);
    sp.archetypes.forEach((arch, a) => {
      const inst = perArchetype[a];
      if (!inst.matrices.length) return;
      for (const part of arch.parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, mats[part.kind], inst.matrices.length);
        inst.matrices.forEach((mat, i) => {
          mesh.setMatrixAt(i, mat);
          mesh.setColorAt(i, part.kind === 'wood' ? sp.bark : inst.foliage[i]);
        });
        mesh.castShadow = isNear;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        group.add(mesh);
      }
    });
  }
  return group;
}
