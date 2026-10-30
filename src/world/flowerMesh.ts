import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Accumulates triangles plus the per-vertex data the shader needs to grow and unfurl a flower:
 *  - aIsPetal: tint by the plant's petal colour (stems and leaves stay green)
 *  - aHinge / aAxis / aClose: each petal pivots about its hinge from closed (bud) to open
 */
export class FlowerMesh {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  petal: number[] = [];
  hinge: number[] = [];
  axis: number[] = [];
  close: number[] = [];
  glow: number[] = [];
  /** How far toward the petal's edge (0 heart … 1 tip): bicolour flowers blend to their edge colour. */
  edge: number[] = [];
  /** Optional rotation applied to everything added (used to tilt a whole bloom, e.g. pansies). */
  private xo: THREE.Vector3 | null = null;
  private xq: THREE.Quaternion | null = null;

  setTilt(origin: THREE.Vector3 | null, q: THREE.Quaternion | null) {
    this.xo = origin;
    this.xq = q;
  }

  private tp(v: THREE.Vector3): THREE.Vector3 {
    return this.xo && this.xq ? v.clone().sub(this.xo).applyQuaternion(this.xq).add(this.xo) : v;
  }

  private td(v: THREE.Vector3): THREE.Vector3 {
    return this.xq ? v.clone().applyQuaternion(this.xq) : v;
  }

  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, opts: { n?: THREE.Vector3; ns?: [THREE.Vector3, THREE.Vector3, THREE.Vector3]; shade?: [number, number, number]; color: THREE.Color; petal?: boolean; hinge?: THREE.Vector3; axis?: THREE.Vector3; close?: number; glow?: number; edge?: [number, number, number] }) {
    let n = opts.n ?? new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    if (n.y < 0 && !opts.n) n.negate();
    n = this.td(n);
    const shade = opts.shade ?? [1, 1, 1];
    const hinge = opts.hinge ? this.tp(opts.hinge) : null;
    const ax = this.td(opts.axis ?? UP);
    [a, b, c].forEach((v0, i) => {
      const v = this.tp(v0);
      this.pos.push(v.x, v.y, v.z);
      // (Smoothly curved surfaces pass a normal for each corner.)
      const vn = opts.ns ? this.td(opts.ns[i]) : n;
      this.nrm.push(vn.x, vn.y, vn.z);
      this.col.push(opts.color.r * shade[i], opts.color.g * shade[i], opts.color.b * shade[i]);
      this.petal.push(opts.petal ? 1 : 0);
      const h = hinge ?? v;
      this.hinge.push(h.x, h.y, h.z);
      this.axis.push(ax.x, ax.y, ax.z);
      this.close.push(opts.close ?? 0);
      this.glow.push(opts.glow ?? (opts.petal ? 1 : 0));
      this.edge.push(opts.edge ? opts.edge[i] : 0);
    });
  }

  /** Append a stock three.js geometry (e.g. a floret), translated/oriented, as petal or not. */
  /** Add a ready-made shape. `edge` (0 heart … 1 edge colour) may vary per vertex, e.g. by height. */
  addGeometry(g: THREE.BufferGeometry, color: THREE.Color, petal: boolean, hinge0: THREE.Vector3, edge: number | ((v: THREE.Vector3) => number) = 0) {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.computeVertexNormals();
    const p = ng.attributes.position;
    const n = ng.attributes.normal;
    const hinge = this.tp(hinge0);
    const v = new THREE.Vector3();
    const nn = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const tv = this.tp(v.fromBufferAttribute(p, i));
      const tn = this.td(nn.fromBufferAttribute(n, i));
      this.pos.push(tv.x, tv.y, tv.z);
      this.nrm.push(tn.x, tn.y, tn.z);
      this.col.push(color.r, color.g, color.b);
      this.petal.push(petal ? 1 : 0);
      this.hinge.push(hinge.x, hinge.y, hinge.z);
      this.axis.push(0, 1, 0);
      this.close.push(0);
      this.glow.push(petal ? 1 : 0);
      this.edge.push(typeof edge === 'number' ? edge : edge(tv));
    }
  }

  /** Recolour everything that isn't petal (leaves, pads, stems), e.g. for the season. */
  tintLeaves(to: THREE.Color, amount: number, dim = 1) {
    const rgb = [to.r, to.g, to.b];
    for (let i = 0; i < this.petal.length; i++) {
      if (this.petal[i]) continue;
      for (let c = 0; c < 3; c++) this.col[i * 3 + c] = THREE.MathUtils.lerp(this.col[i * 3 + c], rgb[c], amount) * dim;
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    // Petal flag, unfurl angle, glow and edge share one attribute: WebGL allows only 16 vertex
    // inputs, and the instance matrix alone takes four.
    const info = new Float32Array(this.petal.length * 4);
    for (let i = 0; i < this.petal.length; i++) info.set([this.petal[i], this.close[i], this.glow[i], this.edge[i]], i * 4);
    g.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
    g.setAttribute('aHinge', new THREE.Float32BufferAttribute(this.hinge, 3));
    g.setAttribute('aAxis', new THREE.Float32BufferAttribute(this.axis, 3));

    return g;
  }
}
