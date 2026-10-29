import * as THREE from 'three';
import { touch } from './touch';

/**
 * What the camera can see, kept lazily: the view is only re-measured once the camera has turned
 * or moved a little, and everything tested against it gets a matching margin round the screen
 * edges, so nothing pops in at the edge in between. `version` changes whenever it's re-measured.
 */
export class View {
  version = 0;
  private readonly frustum = new THREE.Frustum();
  private readonly projScreen = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly lastPos = new THREE.Vector3(Infinity, 0, 0);
  private readonly lastFwd = new THREE.Vector3();
  private readonly lastProj = new THREE.Matrix4();
  /** Margin: metres per metre of distance from the camera (~2.3°), plus a fixed pad. */
  private readonly slope = 0.04;
  private pad = 1;

  /** Re-measures the view if the camera has turned or moved far enough; true if it did. */
  update(camera: THREE.PerspectiveCamera, focusDistance: number): boolean {
    camera.updateMatrixWorld();
    camera.getWorldDirection(this.forward);
    const moved = this.lastPos.distanceTo(camera.position) > focusDistance * 0.015;
    const turned = this.lastFwd.dot(this.forward) < Math.cos(0.02);
    if (!moved && !turned && this.lastProj.equals(camera.projectionMatrix)) return false;
    this.lastPos.copy(camera.position);
    this.lastFwd.copy(this.forward);
    this.lastProj.copy(camera.projectionMatrix);
    this.position.copy(camera.position);
    this.pad = 0.5 + focusDistance * 0.03;
    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    this.version++;
    return true;
  }

  /** Whether a sphere is (or is about to be) on screen. */
  sees(x: number, y: number, z: number, r: number): boolean {
    const d = Math.hypot(x - this.position.x, y - this.position.y, z - this.position.z);
    const slack = r + this.pad + d * this.slope;
    for (const p of this.frustum.planes) {
      if (p.normal.x * x + p.normal.y * y + p.normal.z * z + p.constant < -slack) return false;
    }
    return true;
  }
}

/**
 * Draws only the instances on screen. A set of instanced meshes sharing one list of instances
 * (a tree's trunk and crown, say) keeps every instance's matrix (and colour) aside, and whenever
 * the view changes the visible ones are packed to the front of the meshes' buffers and the draw
 * count cut to match. The meshes share one matrix buffer, so it's sent to the GPU once.
 *
 * Instances can still change (`setMatrix`, `setColor`); `showAll` draws everything, for the
 * shadow pass (trees off screen still cast shadows on screen).
 */
export class InstanceCuller {
  readonly matrices: Float32Array;
  private readonly colors = new Map<THREE.InstancedMesh, Float32Array>();
  private readonly matrixAttr: THREE.InstancedBufferAttribute;
  /** Each instance's bounding sphere in world space: x, y, z, r. */
  private readonly spheres: Float32Array;
  private readonly local: THREE.Sphere;
  private readonly hidden: Uint8Array;
  private readonly kept: Uint32Array;
  /** Where each instance sits in the packed buffer (-1: not drawn). */
  private readonly slot: Int32Array;
  private seen = -1;
  private dirty = true;
  private all = false;
  count: number;

  constructor(
    private readonly meshes: THREE.InstancedMesh[],
    capacity: number,
    count = 0,
    /** Which meshes have a per-instance colour to keep (the others' colours never change). */
    coloured: THREE.InstancedMesh[] = [],
  ) {
    this.count = count;
    this.matrices = new Float32Array(capacity * 16);
    this.spheres = new Float32Array(capacity * 4);
    this.hidden = new Uint8Array(capacity);
    this.kept = new Uint32Array(capacity);
    this.slot = new Int32Array(capacity).fill(-1);
    this.matrixAttr = meshes[0].instanceMatrix;
    this.matrices.set(this.matrixAttr.array.subarray(0, capacity * 16));
    this.local = new THREE.Sphere();
    const box = new THREE.Box3();
    for (const m of meshes) {
      m.geometry.computeBoundingBox();
      box.union(m.geometry.boundingBox!);
      m.instanceMatrix = this.matrixAttr;
      m.frustumCulled = false;
    }
    box.getBoundingSphere(this.local);
    // Colours shared between meshes that use the same source share one buffer too.
    for (const m of coloured) {
      if (!m.instanceColor) continue;
      this.colors.set(m, (m.instanceColor.array as Float32Array).slice(0, capacity * 3));
    }
    for (let i = 0; i < count; i++) this.measure(i);
  }

  private measure(i: number) {
    const e = this.matrices;
    const o = i * 16;
    const c = this.local.center;
    const sx = Math.hypot(e[o], e[o + 1], e[o + 2]);
    const sy = Math.hypot(e[o + 4], e[o + 5], e[o + 6]);
    const sz = Math.hypot(e[o + 8], e[o + 9], e[o + 10]);
    const s = this.spheres;
    s[i * 4] = e[o] * c.x + e[o + 4] * c.y + e[o + 8] * c.z + e[o + 12];
    s[i * 4 + 1] = e[o + 1] * c.x + e[o + 5] * c.y + e[o + 9] * c.z + e[o + 13];
    s[i * 4 + 2] = e[o + 2] * c.x + e[o + 6] * c.y + e[o + 10] * c.z + e[o + 14];
    s[i * 4 + 3] = this.local.radius * Math.max(sx, sy, sz);
    // A zero-size instance (not grown yet, mown, built over) needn't be drawn at all.
    this.hidden[i] = sx * sy * sz < 1e-9 ? 1 : 0;
  }

  /** Replace instance `i`'s matrix (16 floats, column-major). */
  setMatrix(i: number, m: THREE.Matrix4) {
    this.matrices.set(m.elements, i * 16);
    const was = this.hidden[i];
    this.measure(i);
    const slot = this.slot[i];
    // Still drawn, just a different size (growing, shrinking): change it where it sits.
    if (!this.dirty && slot >= 0 && !this.hidden[i] && !was) {
      this.matrixAttr.array.set(m.elements, slot * 16);
      touch(this.matrixAttr, slot);
      return;
    }
    // Appearing, vanishing, or off screen anyway: sorted out at the next pack.
    if (slot >= 0 || was !== this.hidden[i]) this.dirty = true;
  }

  setColor(mesh: THREE.InstancedMesh, i: number, c: THREE.Color) {
    const a = this.colors.get(mesh);
    if (!a) return;
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
    this.dirty = true;
  }

  /** Whether these cast shadows (so must all be drawn when the shadow map is redrawn). */
  get casts(): boolean {
    return this.meshes.some((m) => m.castShadow);
  }

  /** Draw every instance until the next `update` (for a shadow pass). */
  showAll() {
    if (this.all && !this.dirty) return;
    this.all = true;
    this.pack(() => true);
  }

  /** Pack the instances in view to the front, if the view (or the instances) changed. */
  update(view: View) {
    if (!this.dirty && !this.all && this.seen === view.version) return;
    this.seen = view.version;
    this.all = false;
    const s = this.spheres;
    this.pack((i) => view.sees(s[i * 4], s[i * 4 + 1], s[i * 4 + 2], s[i * 4 + 3]));
  }

  private pack(visible: (i: number) => boolean) {
    this.dirty = false;
    const out = this.matrixAttr.array as Float32Array;
    const src = this.matrices;
    const kept = this.kept;
    const slot = this.slot;
    let n = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.hidden[i] || !visible(i)) {
        slot[i] = -1;
        continue;
      }
      out.set(src.subarray(i * 16, i * 16 + 16), n * 16);
      slot[i] = n;
      kept[n++] = i;
    }
    this.matrixAttr.clearUpdateRanges();
    this.matrixAttr.addUpdateRange(0, n * 16);
    this.matrixAttr.needsUpdate = true;
    const done = new Set<THREE.BufferAttribute>();
    for (const [mesh, a] of this.colors) {
      const attr = mesh.instanceColor!;
      if (done.has(attr)) continue;
      done.add(attr);
      const dst = attr.array as Float32Array;
      for (let k = 0; k < n; k++) {
        const i = kept[k];
        dst[k * 3] = a[i * 3];
        dst[k * 3 + 1] = a[i * 3 + 1];
        dst[k * 3 + 2] = a[i * 3 + 2];
      }
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n * 3);
      attr.needsUpdate = true;
    }
    for (const m of this.meshes) m.count = n;
  }
}

/** Every culler in the scene, so the shadow pass can show them all and the view pass cull. */
export const cullers: InstanceCuller[] = [];

/**
 * The garden's own pieces (flowers, stones, fences…) are instanced too, one mesh per kind,
 * spread wherever they were planted or built. Each mesh gets a bounding sphere round all its
 * instances, refreshed only when they change, so a mesh with nothing on screen isn't drawn.
 */
export class GardenBounds {
  private readonly seen = new WeakMap<THREE.InstancedMesh, number>();

  constructor(private readonly roots: THREE.Object3D[]) {}

  update() {
    for (const root of this.roots) root.traverse(this.visit);
  }

  private readonly visit = (o: THREE.Object3D) => {
    const m = o as THREE.InstancedMesh;
    if (!m.isInstancedMesh) return;
    // Version and count together say whether anything moved, came or went.
    const key = m.instanceMatrix.version * 65536 + m.count;
    if (this.seen.get(m) === key) return;
    this.seen.set(m, key);
    if (m.count === 0) return;
    m.computeBoundingSphere();
    // A little room for wind sway.
    m.boundingSphere!.radius = m.boundingSphere!.radius * 1.1 + 0.3;
    m.frustumCulled = true;
  };
}
