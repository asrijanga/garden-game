import * as THREE from 'three';

const VERTS_PER_BATCH = 90000;
const FALL = 0.28;

export interface SlabOutline {
  /** Top outline in world space (convex, counter-clockwise or clockwise). */
  points: THREE.Vector3[];
  tone: THREE.Color;
  /** Seconds from now until it drops in. */
  delay: number;
  pathId: number;
}

interface Batch {
  mesh: THREE.Mesh;
  used: number;
}

/**
 * Crazy paving: every flagstone is its own hand-cut polygon, appended into a few large
 * buffers (one draw call each). The drop-and-settle animation runs in the vertex shader from
 * per-vertex start times, so hundreds of unique stones cost almost nothing per frame.
 */
export class Paving {
  readonly group = new THREE.Group();
  private readonly batches: Batch[] = [];
  private readonly material: THREE.MeshLambertMaterial;
  private readonly uniforms = { uTime: { value: 0 } };
  private time = 0;
  private readonly landings: { at: number; pos: THREE.Vector3; r: number }[] = [];
  private readonly grid = new Map<string, { x: number; z: number; r: number; pathId: number }[]>();

  constructor(private readonly onLand: (p: THREE.Vector3, r: number) => void) {
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.material.customProgramCacheKey = () => 'paving';
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      // Stones are double-sided (outline winding varies); keep our explicit normals unflipped.
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute vec3 aCenter;\nattribute float aStart;')
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          {
            float t = uTime - aStart;
            float k = 1.0, lift = 0.0, squash = 0.0;
            if (t < 0.0) {
              k = 0.0;
            } else if (t < ${FALL.toFixed(2)}) {
              float u = t / ${FALL.toFixed(2)};
              k = mix(0.7, 1.0, u);
              lift = (1.0 - u * u) * 0.6;
            } else {
              float s = t - ${FALL.toFixed(2)};
              squash = exp(-s * 10.0) * cos(s * 28.0) * 0.28;
              lift = max(0.0, exp(-s * 11.0) * sin(s * 22.0)) * 0.025;
            }
            vec3 rel = transformed - aCenter;
            rel.xz *= k * (1.0 + squash * 0.4);
            rel.y *= k * (1.0 - squash);
            transformed = aCenter + rel + vec3(0.0, lift, 0.0);
          }`,
        );
    };
  }

  private newBatch(): Batch {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(VERTS_PER_BATCH * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(VERTS_PER_BATCH * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(VERTS_PER_BATCH * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCenter', new THREE.BufferAttribute(new Float32Array(VERTS_PER_BATCH * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aStart', new THREE.BufferAttribute(new Float32Array(VERTS_PER_BATCH), 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const mesh = new THREE.Mesh(g, this.material);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    const b = { mesh, used: 0 };
    this.batches.push(b);
    return b;
  }

  /** Does a stone from a *different* path already cover (x, z)? */
  isOccupied(x: number, z: number, r: number, exceptPath = -1): boolean {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    for (let i = cx - 1; i <= cx + 1; i++) {
      for (let j = cz - 1; j <= cz + 1; j++) {
        for (const s of this.grid.get(`${i},${j}`) ?? []) {
          if (s.pathId === exceptPath) continue;
          if ((s.x - x) ** 2 + (s.z - z) ** 2 < (r + s.r) ** 2) return true;
        }
      }
    }
    return false;
  }

  add(slab: SlabOutline) {
    const top = slab.points;
    const n = top.length;
    if (n < 3) return;
    const center = new THREE.Vector3();
    for (const p of top) center.add(p);
    center.divideScalar(n);
    let r = 0;
    for (const p of top) r = Math.max(r, Math.hypot(p.x - center.x, p.z - center.z));

    const ring = top;

    const bevel = 0.014;
    const depth = 0.07;
    const inner = ring.map((p) => {
      const d = new THREE.Vector3(center.x - p.x, 0, center.z - p.z);
      const len = d.length();
      return p.clone().addScaledVector(d, len > 1e-4 ? Math.min(bevel, len * 0.4) / len : 0);
    });
    const outer = ring.map((p) => p.clone().setY(p.y - bevel));
    const bottom = ring.map((p) => p.clone().setY(p.y - depth));

    const tris: THREE.Vector3[] = [];
    const shades: number[] = [];
    const normals: THREE.Vector3[] = [];
    const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, shade: number, normal: THREE.Vector3) => {
      tris.push(a, b, c, a, c, d);
      for (let k = 0; k < 6; k++) {
        shades.push(shade);
        normals.push(normal);
      }
    };
    const up = new THREE.Vector3(0, 1, 0);
    // Top face (fan), sun-bleached.
    for (let i = 1; i < n - 1; i++) {
      tris.push(inner[0], inner[i], inner[i + 1]);
      shades.push(1.03, 1.03, 1.03);
      normals.push(up, up, up);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const out = new THREE.Vector3((ring[i].x + ring[j].x) / 2 - center.x, 0, (ring[i].z + ring[j].z) / 2 - center.z).normalize();
      quad(inner[i], outer[i], outer[j], inner[j], 0.9, out.clone().add(up).normalize()); // softened arris
      quad(outer[i], bottom[i], bottom[j], outer[j], 0.68, out); // cut side
    }

    let batch = this.batches[this.batches.length - 1];
    if (!batch || batch.used + tris.length > VERTS_PER_BATCH) batch = this.newBatch();
    const g = batch.mesh.geometry;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    const col = g.attributes.color as THREE.BufferAttribute;
    const cen = g.attributes.aCenter as THREE.BufferAttribute;
    const st = g.attributes.aStart as THREE.BufferAttribute;
    const start = this.time + slab.delay;
    const first = batch.used;
    for (let i = 0; i < tris.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = batch.used++;
        const p = tris[i + k];
        const fn = normals[i + k];
        pos.setXYZ(v, p.x, p.y, p.z);
        nrm.setXYZ(v, fn.x, fn.y, fn.z);
        const sh = shades[i + k];
        col.setXYZ(v, slab.tone.r * sh, slab.tone.g * sh, slab.tone.b * sh);
        cen.setXYZ(v, center.x, center.y, center.z);
        st.setX(v, start);
      }
    }
    for (const attr of [pos, nrm, col, cen, st]) {
      attr.addUpdateRange(first * attr.itemSize, (batch.used - first) * attr.itemSize);
      attr.needsUpdate = true;
    }
    g.setDrawRange(0, batch.used);

    const key = `${Math.floor(center.x)},${Math.floor(center.z)}`;
    if (!this.grid.has(key)) this.grid.set(key, []);
    this.grid.get(key)!.push({ x: center.x, z: center.z, r: r * 0.8, pathId: slab.pathId });
    this.landings.push({ at: start + FALL, pos: center, r });
  }

  update(dt: number) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    for (let i = this.landings.length - 1; i >= 0; i--) {
      if (this.time >= this.landings[i].at) {
        this.onLand(this.landings[i].pos, this.landings[i].r);
        this.landings.splice(i, 1);
      }
    }
  }
}
