import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createRng, lerp } from '../core/random';

export type StoneKind = 'slab' | 'curb';
const SHAPES: Record<StoneKind, number> = { slab: 6, curb: 3 };
const CAPACITY = 2000; // per shape
const CELL = 0.5; // spatial hash cell, metres

/**
 * A hand-cut flagstone: an irregular polygon filling a unit cell (x across, z along the path),
 * a few millimetres short of the edges, with softened, bevelled edges.
 */
function slabGeometry(seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const shape = new THREE.Shape();
  const j = () => lerp(0, 0.07, rng());
  // Walk round the cell, sometimes chamfering a corner or nudging an edge midpoint.
  const pts: [number, number][] = [];
  const corners: [number, number][] = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  corners.forEach(([cx, cz], i) => {
    const sx = -Math.sign(cx);
    const sz = -Math.sign(cz);
    if (rng() < 0.45) {
      const c = lerp(0.08, 0.16, rng());
      // chamfered corner: two points
      const first = i % 2 === 0 ? [cx + sx * j(), cz + sz * c] : [cx + sx * c, cz + sz * j()];
      const second = i % 2 === 0 ? [cx + sx * c, cz + sz * j()] : [cx + sx * j(), cz + sz * c];
      pts.push(first as [number, number], second as [number, number]);
    } else {
      pts.push([cx + sx * j(), cz + sz * j()]);
    }
    const [nx, nz] = corners[(i + 1) % 4];
    if (rng() < 0.5) pts.push([(cx + nx) / 2 + (rng() - 0.5) * 0.05, (cz + nz) / 2 + (rng() - 0.5) * 0.05]);
  });
  shape.moveTo(pts[0][0], pts[0][1]);
  for (const [x, z] of pts.slice(1)) shape.lineTo(x, z);
  shape.closePath();

  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 });
  g.rotateX(Math.PI / 2); // extrude downward; the shape's y becomes world z
  g.translate(0, 0.06, 0);
  g.deleteAttribute('uv');
  colorByHeight(g, 0.03, 0.06);
  g.computeVertexNormals();
  return g;
}

/** A neatly cut edging stone with softly rounded arrises, long along z. */
function curbGeometry(seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const g = new RoundedBoxGeometry(0.15, 0.14, lerp(0.36, 0.42, rng()), 2, 0.025);
  g.translate(0, 0.05, 0);
  g.deleteAttribute('uv');
  colorByHeight(g, -0.02, 0.12);
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
 * Path stones (flagstones and edging) that drop into place with a soft squash and bounce.
 * All stones of a shape share one InstancedMesh; only those still settling update each frame.
 */
export class Stones {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<StoneKind, THREE.InstancedMesh[]>();
  private readonly falling: Falling[] = [];
  private readonly grid = new Map<string, Placed[]>();
  private readonly rng = createRng(31);
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
        const geo = kind === 'slab' ? slabGeometry(200 + ki * 50 + k * 7) : curbGeometry(300 + k * 11);
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

  /** Lift away stones of `kind` within `r` (e.g. edging where a new path crosses). */
  removeNear(x: number, z: number, r: number, kind: StoneKind) {
    for (const s of this.near(x, z, r)) {
      if (s.removed || s.kind !== kind) continue;
      if ((s.pos.x - x) ** 2 + (s.pos.z - z) ** 2 < (r + s.r * 0.5) ** 2) {
        s.removed = true;
        this.m.makeScale(0, 0, 0);
        s.mesh.setMatrixAt(s.index, this.m);
        s.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  add(kind: StoneKind, x: number, y: number, z: number, scale: THREE.Vector3, yaw: number, r: number, tone: THREE.Color, delay: number) {
    const list = this.meshes.get(kind)!;
    const mesh = list[Math.floor(this.rng() * list.length)];
    if (mesh.count >= CAPACITY) return;
    const index = mesh.count++;
    mesh.setColorAt(index, tone);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    const stone: Placed = { kind, mesh, index, pos: new THREE.Vector3(x, y, z), scale: scale.clone(), yaw, r };
    const k = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    if (!this.grid.has(k)) this.grid.set(k, []);
    this.grid.get(k)!.push(stone);
    this.falling.push({ stone, delay, t: 0, landed: false });
    this.write(stone, 0, 0.0001);
  }

  private write(st: Placed, lift: number, k: number, squash = 0) {
    if (st.removed) return;
    this.e.set(0, st.yaw, 0);
    this.q.setFromEuler(this.e);
    this.s.set(st.scale.x * k * (1 + squash * 0.4), st.scale.y * k * (1 - squash), st.scale.z * k * (1 + squash * 0.4));
    this.m.compose(this.p.set(st.pos.x, st.pos.y + lift, st.pos.z), this.q, this.s);
    st.mesh.setMatrixAt(st.index, this.m);
    st.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt: number) {
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
