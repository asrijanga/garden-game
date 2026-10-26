import * as THREE from 'three';
import { regrow } from '../core/regrow';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng, lerp } from '../core/random';

export type StoneKind = 'curb' | 'step' | 'rock' | 'shore';
const SHAPES: Record<StoneKind, number> = { curb: 5, step: 8, rock: 7, shore: 7 };
const CAPACITY = 2000; // per shape
const CELL = 0.5; // spatial hash cell, metres

/** A low, hand-cut edging stone with softly worn arrises, 0.4 m long along z. */
function curbGeometry(seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const g = new RoundedBoxGeometry(lerp(0.09, 0.12, rng()), lerp(0.09, 0.11, rng()), 0.4, 2, lerp(0.025, 0.04, rng()));
  g.translate(0, 0.045, 0);
  g.deleteAttribute('uv');
  colorByHeight(g, -0.02, 0.12);
  return g;
}

/**
 * A hand-dressed stepping stone: a rounded-square outline (superellipse) whose corners are each
 * rounded a little differently, with gently wobbling sides and softly bevelled top edges.
 */
function stepGeometry(seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const hx = lerp(0.19, 0.23, rng());
  const hz = lerp(0.18, 0.22, rng());
  const cornerRound = [0, 1, 2, 3].map(() => lerp(3.8, 6.0, rng())); // lower = rounder corner
  const wobble = [0, 1, 2].map(() => rng() * Math.PI * 2);
  const shape = new THREE.Shape();
  const N = 40;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // Blend the corner roundness of whichever quadrant we're in.
    const q = Math.floor(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2));
    const n = cornerRound[q];
    const r = 1 / Math.pow(Math.pow(Math.abs(c), n) + Math.pow(Math.abs(s), n), 1 / n);
    const w = 1 + Math.sin(a * 3 + wobble[0]) * 0.025 + Math.sin(a * 5 + wobble[1]) * 0.015 + Math.sin(a * 2 + wobble[2]) * 0.02;
    const x = c * r * hx * w;
    const z = s * r * hz * w;
    if (i === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.022,
    bevelSegments: 3,
    curveSegments: 1,
  });
  g.rotateX(Math.PI / 2); // extrude downward: the shape's y becomes world z
  g.translate(0, 0.07, 0);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const merged = mergeVertices(g, 1e-4);
  colorByHeight(merged, 0.0, 0.09);
  merged.computeVertexNormals();
  return merged;
}

/** A natural field stone: rounded and lumpy, flatter on the bottom, unit-sized (scaled per stone). */
function rockGeometry(seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(0.5, 2);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const bumps = Array.from({ length: 5 }, () => new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize());
  const amp = bumps.map(() => lerp(-0.12, 0.14, rng()));
  const sx = lerp(0.85, 1.3, rng());
  const sz = lerp(0.75, 1.05, rng());
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const dir = v.clone().normalize();
    let k = 1;
    bumps.forEach((b, j) => (k += amp[j] * Math.max(0, dir.dot(b)) ** 2));
    v.multiplyScalar(k);
    v.x *= sx;
    v.z *= sz;
    v.y = v.y > 0 ? v.y * 0.62 : v.y * 0.35; // settled: a flatter bottom
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  colorByHeight(g, -0.1, 0.3);
  g.computeVertexNormals();
  return g;
}

/** A pond-side rock: the same weathered field stone, with soft moss on its upper faces. */
function shoreGeometry(seed: number): THREE.BufferGeometry {
  const g = rockGeometry(seed);
  const rng = createRng(seed + 5);
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const col = g.attributes.color as THREE.BufferAttribute;
  const phase = [rng() * 6.28, rng() * 6.28];
  const amount = lerp(0.6, 1.0, rng());
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    // Moss gathers on the tops, in soft patches rather than an even cap.
    const patch = 0.5 + 0.3 * Math.sin(x * 9 + phase[0]) * Math.cos(z * 8 + phase[1]) + 0.2 * Math.sin((x + z) * 17);
    const m = Math.min(1, Math.max(0, (nrm.getY(i) - 0.45) / 0.35)) * Math.min(1, Math.max(0, (patch - 0.35) / 0.3)) * amount;
    const grey = col.getX(i);
    col.setXYZ(i, lerp(grey, 0.66, m), lerp(grey, 0.86, m), lerp(grey, 0.42, m));
  }
  return g;
}

/** Lighter, sun-bleached top faces; darker sides. */
function colorByHeight(g: THREE.BufferGeometry, lo: number, hi: number) {
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = lerp(0.72, 1.04, Math.min(1, Math.max(0, (pos.getY(i) - lo) / (hi - lo))));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

interface Placed {
  kind: StoneKind;
  mesh: THREE.InstancedMesh;
  index: number;
  pos: THREE.Vector3;
  scale: THREE.Vector3;
  yaw: number;
  r: number;
  owner: number;
  removed?: boolean;
}

interface Falling {
  stone: Placed;
  /** Seconds until it starts falling (stones settle one after another). */
  delay: number;
  t: number;
  landed: boolean;
}

/**
 * Stones (stepping stones, edging, bed borders and pond rocks) that drop into place with a soft squash and bounce.
 * All stones of a shape share one InstancedMesh; only those still settling update each frame.
 */
export class Stones {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<StoneKind, THREE.InstancedMesh[]>();
  private readonly falling: Falling[] = [];
  private readonly sinking: { stone: Placed; t: number }[] = [];
  private readonly grid = new Map<string, Placed[]>();
  private rng = createRng(31);
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();

  constructor(private readonly onLand: (p: THREE.Vector3, size: number, kind: StoneKind) => void) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    (Object.keys(SHAPES) as StoneKind[]).forEach((kind, ki) => {
      const list: THREE.InstancedMesh[] = [];
      for (let k = 0; k < SHAPES[kind]; k++) {
        const geo =
          kind === 'curb' ? curbGeometry(300 + k * 11)
          : kind === 'rock' ? rockGeometry(700 + k * 17)
          : kind === 'shore' ? shoreGeometry(900 + k * 23)
          : stepGeometry(500 + ki * 50 + k * 13);
        const mesh = new THREE.InstancedMesh(geo, mat, CAPACITY);
        mesh.count = 0;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        list.push(mesh);
        this.group.add(mesh);
      }
      this.meshes.set(kind, list);
    });
  }

  private *near(x: number, z: number, r: number): Generator<Placed> {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    const reach = Math.ceil((r + 0.5) / CELL);
    for (let i = cx - reach; i <= cx + reach; i++) {
      for (let j = cz - reach; j <= cz + reach; j++) {
        const cell = this.grid.get(`${i},${j}`);
        if (cell) yield* cell;
      }
    }
  }

  /** Would a stone of radius `r` at (x, z) overlap an existing one? */
  isOccupied(x: number, z: number, r: number, kind?: StoneKind): boolean {
    for (const s of this.near(x, z, r)) {
      if (s.removed || (kind && s.kind !== kind)) continue;
      const min = r + s.r;
      if ((s.pos.x - x) ** 2 + (s.pos.z - z) ** 2 < min * min) return true;
    }
    return false;
  }

  /** The top of a random settled stone of `kind` (a stepping stone to bask on), or null. */
  randomTop(kind: StoneKind, rng: () => number): THREE.Vector3 | null {
    const cells = [...this.grid.values()];
    for (let k = 0; k < 10 && cells.length; k++) {
      const cell = cells[Math.floor(rng() * cells.length)];
      const s = cell[Math.floor(rng() * cell.length)];
      if (!s || s.removed || s.kind !== kind || this.falling.some((f) => f.stone === s)) continue;
      return new THREE.Vector3(s.pos.x, s.pos.y + 0.09 * s.scale.y, s.pos.z);
    }
    return null;
  }

  /** Lift away stones of `kind` within `r`, except `keepOwner`'s (e.g. edging where a new path crosses). */
  removeNear(x: number, z: number, r: number, kind: StoneKind, keepOwner = -1) {
    for (const s of this.near(x, z, r)) {
      if (s.removed || s.kind !== kind || s.owner === keepOwner) continue;
      if ((s.pos.x - x) ** 2 + (s.pos.z - z) ** 2 < (r + s.r * 0.5) ** 2) {
        s.removed = true;
        this.m.makeScale(0, 0, 0);
        s.mesh.setMatrixAt(s.index, this.m);
        s.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  /** Lift away stones of `kind` within `r` of (x, z) for which `inside(x, z)` is true. */
  removeIf(x: number, z: number, r: number, kind: StoneKind, inside: (x: number, z: number) => boolean) {
    for (const s of this.near(x, z, r)) {
      if (s.removed || s.kind !== kind) continue;
      if ((s.pos.x - x) ** 2 + (s.pos.z - z) ** 2 > r * r || !inside(s.pos.x, s.pos.z)) continue;
      s.removed = true;
      this.m.makeScale(0, 0, 0);
      s.mesh.setMatrixAt(s.index, this.m);
      s.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Every stone within `r` of (x, z) sinks back into the earth. Returns where they were. */
  erase(x: number, z: number, r: number): THREE.Vector3[] {
    const gone: THREE.Vector3[] = [];
    for (const s of this.near(x, z, r)) {
      if (s.removed || (s.pos.x - x) ** 2 + (s.pos.z - z) ** 2 > r * r) continue;
      s.removed = true;
      const f = this.falling.findIndex((f) => f.stone === s);
      if (f >= 0) this.falling.splice(f, 1);
      this.sinking.push({ stone: s, t: 0 });
      gone.push(s.pos);
    }
    return gone;
  }

  add(kind: StoneKind, x: number, y: number, z: number, scale: THREE.Vector3, yaw: number, r: number, tone: THREE.Color, delay: number, owner = 0) {
    const list = this.meshes.get(kind)!;
    const mesh = list[Math.floor(this.rng() * list.length)];
    if (mesh.count >= CAPACITY) return;
    const index = mesh.count++;
    mesh.setColorAt(index, tone);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    const stone: Placed = { kind, mesh, index, pos: new THREE.Vector3(x, y, z), scale: scale.clone(), yaw, r, owner };
    const k = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    if (!this.grid.has(k)) this.grid.set(k, []);
    this.grid.get(k)!.push(stone);
    this.falling.push({ stone, delay: delay + regrow.offset, t: 0, landed: false });
    this.write(stone, 0, 0.0001);
  }

  private write(st: Placed, lift: number, k: number, squash = 0, force = false) {
    if (st.removed && !force) return;
    this.e.set(0, st.yaw, 0);
    this.q.setFromEuler(this.e);
    this.s.set(st.scale.x * k * (1 + squash * 0.4), st.scale.y * k * (1 - squash), st.scale.z * k * (1 + squash * 0.4));
    this.m.compose(this.p.set(st.pos.x, st.pos.y + lift, st.pos.z), this.q, this.s);
    st.mesh.setMatrixAt(st.index, this.m);
    st.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Back to an untouched garden (before an undo replays what remains). */
  reset() {
    for (const list of this.meshes.values()) for (const m of list) m.count = 0;
    this.falling.length = 0;
    this.sinking.length = 0;
    this.grid.clear();
    this.rng = createRng(31);
  }

  /** Is anything still settling or sinking (so shadows need redrawing)? */
  get busy(): boolean {
    return this.falling.length > 0 || this.sinking.length > 0;
  }

  update(dt: number) {
    for (let i = this.sinking.length - 1; i >= 0; i--) {
      const s = this.sinking[i];
      s.t = Math.min(1, s.t + dt / 0.45);
      // A little shrug, then down into the soil.
      const k = 1 - s.t * s.t;
      this.write(s.stone, -s.t * s.stone.r * 0.8 + Math.sin(s.t * Math.PI) * 0.03, Math.max(0.0001, k), 0, true);
      if (s.t >= 1) {
        this.m.makeScale(0, 0, 0);
        s.stone.mesh.setMatrixAt(s.stone.index, this.m);
        s.stone.mesh.instanceMatrix.needsUpdate = true;
        this.sinking.splice(i, 1);
      }
    }
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      const st = f.stone;
      if (f.delay > 0) {
        f.delay -= dt;
        continue;
      }
      f.t += dt;
      const fallTime = 0.28;
      if (f.t < fallTime) {
        const k = f.t / fallTime;
        this.write(st, (1 - k * k) * 0.7, lerp(0.7, 1, k));
      } else {
        if (!f.landed) {
          f.landed = true;
          this.onLand(st.pos, st.r, st.kind);
        }
        // Damped squash-and-stretch as it beds into the soil.
        const s = f.t - fallTime;
        const squash = Math.exp(-s * 10) * Math.cos(s * 28) * 0.28;
        const hop = Math.max(0, Math.exp(-s * 11) * Math.sin(s * 22)) * 0.025;
        this.write(st, hop, 1, squash);
        if (s > 0.6) {
          this.write(st, 0, 1, 0);
          this.falling.splice(i, 1);
        }
      }
    }
  }
}
