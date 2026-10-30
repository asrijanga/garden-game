import * as THREE from 'three';
import { touch } from '../render/touch';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng, hashJitter, lerp } from '../core/random';
import { regrow } from '../core/regrow';
import { addWind } from '../render/wind';
import { addMoss, mossAttribute, mossStart } from '../render/moss';

export type FenceStyle = 'picket' | 'rustic' | 'hedge' | 'wall' | EdgeStyle;
/** Low edgings for flower beds and paths, drawn just like a fence. */
export type EdgeStyle = 'boxEdge' | 'stoneEdge' | 'brickEdge' | 'willowEdge' | 'picketEdge';
export const EDGE_STYLES = new Set<FenceStyle>(['boxEdge', 'stoneEdge', 'brickEdge', 'willowEdge', 'picketEdge']);
export type PartShape = 'picketPost' | 'picket' | 'rail' | 'logPost' | 'log' | 'hedge' | 'wallStone';
/** How a part arrives: knocked in from above, popped into place, or grown up out of the lawn. */
import type { Perch } from './perchingBirds';

/** Shapes that stand on the ground (as opposed to rails and pickets hung between posts). */
const SOLID = new Set<PartShape>(['picketPost', 'logPost', 'hedge', 'wallStone']);
const cellKey = (x: number, z: number) => Math.floor(x) * 4096 + Math.floor(z);

export type Arrival = 'drop' | 'pop' | 'grow';

const CAPACITY: Record<PartShape, number> = { picketPost: 600, picket: 5000, rail: 1500, logPost: 600, log: 1500, hedge: 2500, wallStone: 2500 };
const VARIANTS: Record<PartShape, number> = { picketPost: 3, picket: 4, rail: 2, logPost: 4, log: 4, hedge: 5, wallStone: 6 };

function colorize(g: THREE.BufferGeometry, color: (x: number, y: number, z: number) => THREE.Color): THREE.BufferGeometry {
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = color(pos.getX(i), pos.getY(i), pos.getZ(i));
    col.set([c.r, c.g, c.b], i * 3);
  }
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Weathered paint: a touch of grime toward the ground, the grain catching a little light. */
function weathered(base: string, rng: () => number, grime = 0.25) {
  const c = new THREE.Color(base);
  const dirt = new THREE.Color('#6b5a44');
  const phase = rng() * 10;
  return (x: number, y: number, z: number) =>
    c
      .clone()
      .lerp(dirt, Math.max(0, 0.25 - y) * grime * 2.5)
      .multiplyScalar(0.92 + 0.08 * Math.sin((x + z) * 60 + y * 7 + phase));
}

/** A square painted post, 1.05 m, with a little pyramid cap. Origin at its foot. */
function picketPostGeometry(seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const h = lerp(1.0, 1.08, rng());
  const post = new RoundedBoxGeometry(0.085, h, 0.085, 1, 0.012);
  post.translate(0, h / 2, 0);
  const cap = new THREE.ConeGeometry(0.075, 0.07, 4, 1);
  cap.rotateY(Math.PI / 4);
  cap.translate(0, h + 0.03, 0);
  const tone = weathered('#f1ebdf', rng);
  return mergeGeometries([colorize(post.toNonIndexed(), tone), colorize(cap.toNonIndexed(), tone)]);
}

/** A picket board with a pointed top, 1 m tall before scaling. Origin at its foot. */
function picketGeometry(seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const w = lerp(0.068, 0.078, rng());
  const tip = lerp(0.07, 0.1, rng());
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, 1 - tip);
  s.lineTo((rng() - 0.5) * 0.01, 1);
  s.lineTo(-w / 2, 1 - tip);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1 });
  g.translate(0, 0, -0.009);
  return colorize(g, weathered('#f3eee3', rng, 0.35));
}

/** A painted rail, 1 m long along x before scaling. Origin at its middle. */
function railGeometry(seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const g = new RoundedBoxGeometry(1, 0.055, 0.03, 1, 0.008);
  return colorize(g.toNonIndexed(), weathered('#ece5d6', rng, 0));
}

/** A rough-split, silvered wooden post, 1.15 m, slightly tapered and out of round. */
function logPostGeometry(seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const h = lerp(1.05, 1.2, rng());
  const g = new THREE.CylinderGeometry(lerp(0.05, 0.06, rng()), lerp(0.062, 0.075, rng()), h, 7, 3);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const ph = rng() * 6;
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i));
    const k = 1 + Math.sin(a * 3 + ph) * 0.08 + Math.sin(pos.getY(i) * 9 + ph) * 0.03;
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  g.translate(0, h / 2, 0);
  g.computeVertexNormals();
  return colorize(g.toNonIndexed(), weathered('#9a8b78', rng, 0.4));
}

/** A split log rail, 1 m along x before scaling: flattish, with knots of darker grain. */
function logGeometry(seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const g = new THREE.CylinderGeometry(0.042, 0.038, 1, 6, 4);
  g.rotateZ(Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const ph = rng() * 6;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setY(i, pos.getY(i) * 0.8 + Math.sin(x * 5 + ph) * 0.006);
    pos.setZ(i, pos.getZ(i) * (1 + Math.sin(x * 11 + ph) * 0.07));
  }
  g.computeVertexNormals();
  const base = weathered('#8f806c', rng, 0);
  return colorize(g.toNonIndexed(), (x, y, z) => base(x, y, z).multiplyScalar(Math.sin(x * 23 + ph) > 0.93 ? 0.75 : 1));
}

/** A clipped section of hedge, 1 m cube before scaling: soft rounded corners, gently lumpy. */
function hedgeGeometry(seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  let g: THREE.BufferGeometry = new RoundedBoxGeometry(1, 1, 1, 4, 0.32);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const bumps = Array.from({ length: 6 }, () => ({ d: new THREE.Vector3(rng() - 0.5, rng() * 0.6, rng() - 0.5).normalize(), a: lerp(0.02, 0.06, rng()) }));
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const dir = v.clone().normalize();
    let k = 1;
    for (const b of bumps) k += b.a * Math.max(0, dir.dot(b.d)) ** 3;
    v.multiplyScalar(k);
    pos.setXYZ(i, v.x, v.y + 0.5, v.z);
  }
  g.computeVertexNormals();
  const dark = new THREE.Color('#3b6a2c');
  const light = new THREE.Color('#5f9440');
  return colorize(g, (_x, y) => dark.clone().lerp(light, Math.min(1, Math.max(0, y))));
}

/**
 * A dry-stone walling stone, a unit block before scaling (centred): flattish faces, softly
 * worn edges, a little lumpy, never square. Grey with a warm cast and a darker underside.
 */
function wallStoneGeometry(seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  let g: THREE.BufferGeometry = new RoundedBoxGeometry(1, 1, 1, 2, lerp(0.14, 0.22, rng()));
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const ph = [rng() * 6, rng() * 6, rng() * 6];
  const skew = (rng() - 0.5) * 0.25;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = Math.sin(x * 5 + ph[0]) * Math.cos(z * 6 + ph[1]) * 0.05 + Math.sin(y * 7 + x * 3 + ph[2]) * 0.03;
    // Slightly wedge-shaped, the way split stone comes.
    pos.setXYZ(i, x * (1 + n), y * (1 + n * 0.6) + x * skew * 0.2, z * (1 + n) * (1 - (y + 0.5) * 0.08));
  }
  g.computeVertexNormals();
  const base = new THREE.Color('#bab5ab');
  return colorize(g, (_x, y) => base.clone().multiplyScalar(0.84 + (y + 0.5) * 0.22));
}

const BUILD: Record<PartShape, (seed: number) => THREE.BufferGeometry> = {
  picketPost: picketPostGeometry,
  picket: picketGeometry,
  rail: railGeometry,
  logPost: logPostGeometry,
  log: logGeometry,
  hedge: hedgeGeometry,
  wallStone: wallStoneGeometry,
};

export interface Part {
  id: number;
  shape: PartShape;
  mesh: THREE.InstancedMesh;
  index: number;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: THREE.Vector3;
  /** Half-length along the part's local x (rails), for hit tests. */
  half: number;
  arrival: Arrival;
  delay: number;
  t: number;
  owner: number;
  gone?: boolean;
}

/**
 * Every fence post, rail, picket and hedge section in the garden, one instanced mesh per
 * shape variant. Parts arrive with a little animation (posts are knocked in, boards pop into
 * place, hedges grow up out of the lawn) and sink or shrink away when tidied.
 */
export class Fences {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<PartShape, THREE.InstancedMesh[]>();
  private readonly parts = new Map<number, Part>();
  /** Posts, hedges and wall stones by 1 m cell, so "is anything solid here?" needn't scan every part. */
  private readonly cells = new Map<number, Part[]>();
  private readonly moving = new Set<Part>();
  private readonly leaving: { part: Part; t: number }[] = [];
  private rng = createRng(1717);
  private nextId = 1;
  private readonly m = new THREE.Matrix4();
  private readonly box = new THREE.Box3();
  private readonly e = new THREE.Euler();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();

  constructor(
    private readonly onArrive: (shape: PartShape, at: THREE.Vector3) => void,
    /** Winter: hoar frost on the hedges (0 none … 1 white-tipped). */
    frost = 0,
  ) {
    const wood = new THREE.MeshLambertMaterial({ vertexColors: true });
    // Wall and edging stones gather moss on their tops over a few minutes, as boulders do.
    const stone = new THREE.MeshLambertMaterial({ vertexColors: true });
    addMoss(stone, { time: 240, amount: 0.75, trodden: false });
    const hedge = new THREE.MeshLambertMaterial({ vertexColors: true });
    // Leafy, clipped-box texture: small-leaf speckle and darker hollows, from world position, so
    // neighbouring sections blend into one hedge. A barely-there sway in the wind.
    addWind(hedge, 'clamp(position.y, 0.0, 1.0)', (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLeaf;')
        .replace('worldPosition = modelMatrix * worldPosition;', 'worldPosition = modelMatrix * worldPosition;\nvLeaf = worldPosition.xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
          varying vec3 vLeaf;
          float hHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
          float hNoise(vec3 p) {
            vec3 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(hHash(i), hHash(i + vec3(1, 0, 0)), f.x), mix(hHash(i + vec3(0, 1, 0)), hHash(i + vec3(1, 1, 0)), f.x), f.y),
                       mix(mix(hHash(i + vec3(0, 0, 1)), hHash(i + vec3(1, 0, 1)), f.x), mix(hHash(i + vec3(0, 1, 1)), hHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
          }`,
        )
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          float leaves = hNoise(vLeaf * 34.0);
          float clumps = hNoise(vLeaf * 7.0 + 3.0);
          diffuseColor.rgb *= 0.72 + leaves * 0.42;
          diffuseColor.rgb *= 0.85 + clumps * 0.25;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.15, 1.2, 0.85), smoothstep(0.8, 0.95, leaves) * 0.6); // sunlit leaf tips
          // Frost: pale, crystalline tips (more on the outermost leaves).
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.95), ${frost.toFixed(2)} * (0.25 + 0.6 * smoothstep(0.55, 0.85, leaves)));`,
        );
    }, 0.12);
    (Object.keys(BUILD) as PartShape[]).forEach((shape, si) => {
      const list: THREE.InstancedMesh[] = [];
      for (let k = 0; k < VARIANTS[shape]; k++) {
        const geo = BUILD[shape](900 + si * 40 + k * 7);
        if (shape === 'wallStone') mossAttribute(geo, CAPACITY[shape]);
        const mesh = new THREE.InstancedMesh(geo, shape === 'hedge' ? hedge : shape === 'wallStone' ? stone : wood, CAPACITY[shape]);
        mesh.count = 0;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        list.push(mesh);
        this.group.add(mesh);
      }
      this.meshes.set(shape, list);
    });
  }

  /** Back to an untouched garden (before an undo replays what remains). */
  reset() {
    for (const list of this.meshes.values()) for (const m of list) m.count = 0;
    this.parts.clear();
    this.cells.clear();
    this.moving.clear();
    this.leaving.length = 0;
    this.rng = createRng(1717);
    this.nextId = 1;
  }

  /** Is anything still arriving or leaving (so shadows need redrawing)? */
  get busy(): boolean {
    return this.moving.size > 0 || this.leaving.length > 0;
  }

  add(shape: PartShape, pos: THREE.Vector3, quat: THREE.Quaternion, scale: THREE.Vector3, tint: THREE.Color, arrival: Arrival, delay: number, owner: number, half = 0): Part | null {
    const list = this.meshes.get(shape)!;
    const mesh = list[Math.floor(this.rng() * list.length)];
    if (mesh.count >= CAPACITY[shape]) return null;
    const index = mesh.count++;
    mesh.setColorAt(index, tint);
    if (mesh.instanceColor) touch(mesh.instanceColor, index);
    const part: Part = { id: this.nextId++, shape, mesh, index, pos: pos.clone(), quat: quat.clone(), scale: scale.clone(), half, arrival, delay: delay + regrow.offset, t: 0, owner };
    this.parts.set(part.id, part);
    if (SOLID.has(shape)) {
      const key = cellKey(pos.x, pos.z);
      let list = this.cells.get(key);
      if (!list) this.cells.set(key, (list = []));
      list.push(part);
    }
    this.moving.add(part);
    if (shape === 'wallStone') mossStart(mesh, index, delay, hashJitter(pos.x, pos.z) * 30);
    this.write(part, 0.0001, 0);
    return part;
  }

  /** Posts, hedge sections and wall stones within reach of (x, z), from the spatial grid. */
  private *solidAround(x: number, z: number, reach: number): Generator<Part> {
    const r = reach + 0.6; // the widest part's own half-size
    for (let i = Math.floor(x - r); i <= Math.floor(x + r); i++) {
      for (let j = Math.floor(z - r); j <= Math.floor(z + r); j++) {
        const list = this.cells.get(i * 4096 + j);
        if (list) yield* list;
      }
    }
  }

  /** The nearest post (of any fence) within `r` of (x, z). */
  postNear(x: number, z: number, r: number): Part | null {
    let best: Part | null = null;
    let bestD = r * r;
    for (const p of this.solidAround(x, z, r)) {
      if (p.gone || (p.shape !== 'picketPost' && p.shape !== 'logPost')) continue;
      const d = (p.pos.x - x) ** 2 + (p.pos.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  /** Places a bird could sit: the tops of posts, rustic log rails and hedges. */
  perches(out: Perch[]) {
    for (const p of this.parts.values()) {
      if (p.gone || this.moving.has(p) || (p.shape !== 'picketPost' && p.shape !== 'logPost' && p.shape !== 'log' && p.shape !== 'hedge')) continue;
      const geo = p.mesh.geometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      this.box.copy(geo.boundingBox!).applyMatrix4(this.m.compose(p.pos, p.quat, p.scale));
      const yaw = this.e.setFromQuaternion(p.quat, 'YXZ').y;
      const pos = new THREE.Vector3((this.box.min.x + this.box.max.x) / 2, this.box.max.y - (p.shape === 'hedge' ? 0.06 : p.shape === 'picketPost' ? 0.03 : 0.01), (this.box.min.z + this.box.max.z) / 2);
      out.push({ pos, yaw, alive: () => !p.gone });
    }
  }

  /** Is there something solid underfoot within `r` of (x, z): a post, a hedge, a wall stone? */
  solidNear(x: number, z: number, r: number): boolean {
    for (const p of this.solidAround(x, z, r)) {
      if (p.gone) continue;
      const reach = r + (p.shape === 'hedge' ? 0.3 : p.shape === 'wallStone' ? Math.max(p.scale.x, p.scale.z) * 0.5 : 0.05);
      if ((p.pos.x - x) ** 2 + (p.pos.z - z) ** 2 < reach * reach) return true;
    }
    return false;
  }

  /** Take parts away (shrinking and sinking), e.g. to rebuild a stretch with a gate. */
  remove(part: Part) {
    if (part.gone) return;
    part.gone = true;
    this.moving.delete(part);
    this.parts.delete(part.id);
    if (SOLID.has(part.shape)) {
      const key = cellKey(part.pos.x, part.pos.z);
      const list = this.cells.get(key);
      if (list) this.cells.set(key, list.filter((p) => p !== part));
    }
    this.leaving.push({ part, t: 0 });
  }

  /** Remove every part within `r` of (x, z) (rails count along their whole length). */
  erase(x: number, z: number, r: number): { count: number; owners: Set<number>; at: THREE.Vector3[] } {
    const owners = new Set<number>();
    const at: THREE.Vector3[] = [];
    for (const p of [...this.parts.values()]) {
      let d2: number;
      if (p.half > 0) {
        // Distance to the rail's centre line.
        const dir = this.p.set(1, 0, 0).applyQuaternion(p.quat);
        const dx = x - p.pos.x;
        const dz = z - p.pos.z;
        const len = Math.hypot(dir.x, dir.z) || 1;
        const t = Math.max(-p.half, Math.min(p.half, (dx * dir.x + dz * dir.z) / len));
        d2 = (dx - (dir.x / len) * t) ** 2 + (dz - (dir.z / len) * t) ** 2;
      } else d2 = (p.pos.x - x) ** 2 + (p.pos.z - z) ** 2;
      if (d2 > r * r) continue;
      owners.add(p.owner);
      if (p.shape !== 'picket' && p.shape !== 'rail' && p.shape !== 'log') at.push(p.pos.clone());
      this.remove(p);
    }
    return { count: at.length, owners, at };
  }

  ownedBy(owner: number): Part[] {
    return [...this.parts.values()].filter((p) => p.owner === owner);
  }

  private write(p: Part, k: number, lift: number, squash = 0) {
    const s = this.s.copy(p.scale);
    if (p.arrival === 'grow') s.set(s.x * lerp(0.55, 1, k), s.y * k, s.z * lerp(0.55, 1, k));
    else s.multiplyScalar(k).multiply(this.p.set(1 + squash * 0.4, 1 - squash, 1 + squash * 0.4));
    this.m.compose(this.p.copy(p.pos).setY(p.pos.y + lift), p.quat, s);
    p.mesh.setMatrixAt(p.index, this.m);
    touch(p.mesh.instanceMatrix, p.index);
  }

  update(dt: number) {
    for (const p of this.moving) {
      if (p.delay > 0) {
        p.delay -= dt;
        continue;
      }
      p.t += dt;
      if (p.arrival === 'drop') {
        // Knocked in: falls the last bit, lands with a thud, a squash, a little bounce.
        const fall = 0.22;
        if (p.t < fall) {
          const k = p.t / fall;
          this.write(p, lerp(0.6, 1, k), (1 - k * k) * 0.55);
        } else {
          if (p.t - dt < fall) this.onArrive(p.shape, p.pos);
          const s = p.t - fall;
          this.write(p, 1, Math.max(0, Math.exp(-s * 12) * Math.sin(s * 24)) * 0.03, Math.exp(-s * 11) * Math.cos(s * 30) * 0.12);
          if (s > 0.5) {
            this.write(p, 1, 0);
            this.moving.delete(p);
          }
        }
      } else {
        const dur = p.arrival === 'grow' ? 0.9 : 0.35;
        const t = Math.min(1, p.t / dur);
        // Ease out with a soft overshoot.
        const k = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
        if (p.t - dt <= 0) this.onArrive(p.shape, p.pos);
        this.write(p, Math.max(0.0001, k), 0);
        if (t >= 1) this.moving.delete(p);
      }
    }
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const l = this.leaving[i];
      l.t = Math.min(1, l.t + dt / 0.4);
      const k = 1 - l.t * l.t;
      if (l.t >= 1) {
        this.m.makeScale(0, 0, 0);
        l.part.mesh.setMatrixAt(l.part.index, this.m);
        touch(l.part.mesh.instanceMatrix, l.part.index);
        this.leaving.splice(i, 1);
      } else this.write(l.part, Math.max(0.0001, k), -l.t * 0.3);
    }
  }
}
