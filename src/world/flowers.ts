import * as THREE from 'three';
import { regrow } from '../core/regrow';
import { createRng, lerp } from '../core/random';
import { addWind } from '../render/wind';
import type { FlowerSpecies } from './flowerSpecies';

const VARIANTS = 5; // geometry variants per species (plus per-plant scale, yaw, colour)
const CAPACITY = 1500; // plants per variant
const FOLIAGE_VARIANTS = 3;
const FOLIAGE_CAPACITY = 4000;
const UP = new THREE.Vector3(0, 1, 0);

/** Growth timeline (seconds after a plant's birth): sprout → bud → bloom. */
export const SPROUT_END = 0.9;
export const BLOOM_START = 1.1;
export const BLOOM_END = 2.8;

/**
 * Accumulates triangles plus the per-vertex data the shader needs to grow and unfurl a flower:
 *  - aIsPetal: tint by the plant's petal colour (stems and leaves stay green)
 *  - aHinge / aAxis / aClose: each petal pivots about its hinge from closed (bud) to open
 */
class FlowerMesh {
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

  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, opts: { n?: THREE.Vector3; shade?: [number, number, number]; color: THREE.Color; petal?: boolean; hinge?: THREE.Vector3; axis?: THREE.Vector3; close?: number; glow?: number; edge?: [number, number, number] }) {
    let n = opts.n ?? new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    if (n.y < 0 && !opts.n) n.negate();
    n = this.td(n);
    const shade = opts.shade ?? [1, 1, 1];
    const hinge = opts.hinge ? this.tp(opts.hinge) : null;
    const ax = this.td(opts.axis ?? UP);
    [a, b, c].forEach((v0, i) => {
      const v = this.tp(v0);
      this.pos.push(v.x, v.y, v.z);
      this.nrm.push(n.x, n.y, n.z);
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

const STEM = new THREE.Color('#4f8a3a');
const LEAF = new THREE.Color('#5f9a42');
const WHITE = new THREE.Color('#ffffff');

function stem(m: FlowerMesh, height: number, lean: THREE.Vector3, rng: () => number, withLeaves = true) {
  const segs = 4;
  const r0 = 0.0055;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push(new THREE.Vector3(lean.x * t * t, height * t, lean.z * t * t));
  }
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const ra = r0 * (1 - (i / segs) * 0.4);
    const rb = r0 * (1 - ((i + 1) / segs) * 0.4);
    for (let k = 0; k < 4; k++) {
      const a0 = (k / 4) * Math.PI * 2;
      const a1 = ((k + 1) / 4) * Math.PI * 2;
      const o = (ang: number, r: number) => new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r);
      const n = o((a0 + a1) / 2, 1);
      m.tri(a.clone().add(o(a0, ra)), b.clone().add(o(a1, rb)), b.clone().add(o(a0, rb)), { n, color: STEM });
      m.tri(a.clone().add(o(a0, ra)), a.clone().add(o(a1, ra)), b.clone().add(o(a1, rb)), { n, color: STEM });
    }
  }
  // A few leaves along the stem (a rosette near the ground for short plants).
  const leaves = !withLeaves ? 0 : height < 0.26 ? 5 : 2 + Math.floor(rng() * 2);
  for (let i = 0; i < leaves; i++) {
    const az = rng() * Math.PI * 2;
    const y = height < 0.26 ? 0.015 + rng() * 0.03 : lerp(0.06, height * 0.5, rng());
    const len = height < 0.26 ? lerp(0.09, 0.12, rng()) : lerp(0.1, 0.16, rng());
    const tilt = height < 0.26 ? 0.25 : lerp(0.5, 0.9, rng());
    const d = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const dir = d.clone().multiplyScalar(Math.cos(tilt)).add(UP.clone().multiplyScalar(Math.sin(tilt)));
    const side = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(len * 0.22);
    const base = new THREE.Vector3(lean.x * 0.1, y, lean.z * 0.1);
    const mid = base.clone().addScaledVector(dir, len * 0.45);
    const tip = base.clone().addScaledVector(dir, len).add(new THREE.Vector3(0, -len * 0.12, 0));
    m.tri(base, mid.clone().add(side), tip, { color: LEAF, shade: [0.8, 1, 1.05] });
    m.tri(base, tip, mid.clone().sub(side), { color: LEAF, shade: [0.8, 1.05, 1] });
  }
  return pts[segs];
}

/**
 * One petal: a soft, rounded blade from `hinge`, opened `open` radians from vertical. It has a
 * gentle centre crease (light catches each half differently), a curl of its own, a rounded tip,
 * and shading that deepens toward the heart of the flower.
 */
interface PetalStyle {
  notch?: boolean;
  pointed?: boolean;
  blotch?: number;
}

function petal(m: FlowerMesh, hinge: THREE.Vector3, az: number, open: number, len: number, width: number, cupIn: number, closeTo: number, rng: () => number, style: PetalStyle = {}) {
  const d = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
  const v = d.clone().multiplyScalar(Math.sin(open)).addScaledVector(UP, Math.cos(open));
  const s = new THREE.Vector3(-d.z, 0, d.x);
  const axis = new THREE.Vector3().crossVectors(d, UP).normalize();
  const crease = new THREE.Vector3().crossVectors(s, v).normalize(); // out of the petal's plane
  if (crease.y < 0) crease.negate();
  const curl = lerp(0.06, 0.2, rng()); // each petal curls a little differently
  const twist = (rng() - 0.5) * 0.25;
  // Smooth, rounded outline: narrow at the base, fullest past the middle, softly rounded tip.
  const rows: [number, number][] = style.pointed
    ? [
        [0, 0.2],
        [0.2, 0.62],
        [0.42, 0.92],
        [0.62, 0.86],
        [0.8, 0.55],
        [0.93, 0.22],
        [1, 0.02],
      ]
    : style.notch
      ? [
          [0, 0.22],
          [0.2, 0.6],
          [0.42, 0.88],
          [0.65, 1.0],
          [0.85, 0.98],
          [0.97, 0.9],
          [1, 0.72],
        ]
      : [
          [0, 0.22],
          [0.18, 0.62],
          [0.4, 0.92],
          [0.62, 1.0],
          [0.8, 0.86],
          [0.93, 0.55],
          [1, 0.12],
        ];
  // Notched petals dip in the middle of the tip (a cosmos's little serrations).
  const centreT = (t: number) => (style.notch && t > 0.95 ? t - 0.1 : t);
  const at = (t: number, w: number) =>
    hinge
      .clone()
      .addScaledVector(v, t * len)
      .addScaledVector(s, w * width * 0.5 + twist * t * t * len * 0.3)
      .addScaledVector(UP, t * t * len * curl) // the tip curls up
      .addScaledVector(d, -t * t * len * cupIn) // cupped petals curve inward
      .addScaledVector(crease, (1 - Math.abs(w)) * width * 0.08 * Math.sin(t * Math.PI)); // soft centre crease
  const edgeAt = (t: number) => Math.min(1, Math.max(0, (t - 0.3) / 0.7)) ** 1.5;
  const opts = (sh: [number, number, number], ts: [number, number, number]) => ({ color: WHITE, petal: true, hinge, axis, close: Math.max(0, open - closeTo), shade: sh, edge: ts.map(edgeAt) as [number, number, number] });
  // Deeper colour at the heart, glowing toward the tip.
  // A dark "face" toward the heart (pansies, poppies) when blotch > 0.
  const blotch = style.blotch ?? 0;
  const shadeAt = (t: number, edge: number) => {
    const face = blotch > 0 ? lerp(1 - blotch, 1, Math.min(1, Math.max(0, (t - 0.12) / 0.38))) : 1;
    return lerp(0.74, 0.98, Math.pow(t, 0.7)) * (1 - edge * 0.06) * face;
  };
  for (let i = 0; i < rows.length - 1; i++) {
    const [t0, w0] = rows[i];
    const [t1, w1] = rows[i + 1];
    const l0 = at(t0, -w0);
    const c0 = at(centreT(t0), 0);
    const r0 = at(t0, w0);
    const l1 = at(t1, -w1);
    const c1 = at(centreT(t1), 0);
    const r1 = at(t1, w1);
    m.tri(l0, l1, c1, opts([shadeAt(t0, 1), shadeAt(t1, 1), shadeAt(t1, 0)], [t0, t1, t1]));
    m.tri(l0, c1, c0, opts([shadeAt(t0, 1), shadeAt(t1, 0), shadeAt(t0, 0)], [t0, t1, t0]));
    m.tri(c0, c1, r1, opts([shadeAt(t0, 0), shadeAt(t1, 0), shadeAt(t1, 1)], [t0, t1, t1]));
    m.tri(c0, r1, r0, opts([shadeAt(t0, 0), shadeAt(t1, 1), shadeAt(t0, 1)], [t0, t1, t0]));
  }
}

/** Small green sepals cupping the underside of a bloom. */
function sepals(m: FlowerMesh, top: THREE.Vector3, size: number, rng: () => number) {
  const n = 5;
  const off = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const az = off + (i / n) * Math.PI * 2;
    const d = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const s = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(size * 0.28);
    const base = top.clone().add(new THREE.Vector3(0, -size * 0.15, 0));
    const tip = base.clone().addScaledVector(d, size).add(new THREE.Vector3(0, -size * 0.35, 0));
    const mid = base.clone().addScaledVector(d, size * 0.5).add(new THREE.Vector3(0, -size * 0.1, 0));
    m.tri(base, mid.clone().add(s), tip, { color: LEAF, shade: [0.75, 0.95, 1] });
    m.tri(base, tip, mid.clone().sub(s), { color: LEAF, shade: [0.75, 1, 0.95] });
  }
}

/**
 * A leafy clump of foliage that fills a bed between the flowers, so beds read lush and green
 * rather than bare soil. Leaves are tinted per clump (they use the "petal" tint channel).
 */
export function foliageGeometry(seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const m = new FlowerMesh();
  const n = 9 + Math.floor(rng() * 4);
  const base = new THREE.Vector3(0, 0, 0);
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + (rng() - 0.5) * 0.5;
    const len = lerp(0.12, 0.22, rng());
    const width = lerp(0.04, 0.06, rng());
    const tilt = lerp(0.35, 0.95, rng()); // radians above horizontal
    const d = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const s = new THREE.Vector3(-d.z, 0, d.x);
    const rows: [number, number][] = [
      [0, 0.15],
      [0.3, 0.85],
      [0.6, 0.95],
      [0.85, 0.6],
      [1, 0.05],
    ];
    const at = (t: number, w: number) =>
      base
        .clone()
        .addScaledVector(d, Math.cos(tilt) * t * len)
        .addScaledVector(UP, Math.sin(tilt) * t * len - t * t * len * 0.45) // arching, drooping tip
        .addScaledVector(s, w * width * 0.5);
    for (let r = 0; r < rows.length - 1; r++) {
      const [t0, w0] = rows[r];
      const [t1, w1] = rows[r + 1];
      const sh = (t: number) => lerp(0.62, 1.08, t);
      const o = (a: number, b: number, c: number) => ({ color: WHITE, petal: true, glow: 0.1, hinge: base, axis: UP, close: 0, shade: [a, b, c] as [number, number, number] });
      m.tri(at(t0, -w0), at(t1, -w1), at(t1, w1), o(sh(t0), sh(t1), sh(t1)));
      m.tri(at(t0, -w0), at(t1, w1), at(t0, w0), o(sh(t0), sh(t1), sh(t0)));
    }
  }
  return m.build();
}

/** Kinds of foliage plant woven between the flowers in a bed. */
export type LeafKind = 'clump' | 'grass' | 'fern' | 'hosta' | 'silver' | 'box';
export const LEAF_KINDS: LeafKind[] = ['clump', 'grass', 'fern', 'hosta', 'silver', 'box'];

/** A tinted leaf (its colour comes from the plant's tint, like a petal's). */
const leafOpts = (a: number, b: number, c: number, hinge: THREE.Vector3) => ({ color: WHITE, petal: true, glow: 0.1, hinge, axis: UP, close: 0, shade: [a, b, c] as [number, number, number] });

/**
 * A leaf as a strip along a curve: `at(t, w)` gives the point `t` of the way along, `w` (−1…1)
 * across, and `width(t)` its half-width there; darker at the base, lighter at the tip.
 */
function leafStrip(m: FlowerMesh, at: (t: number, w: number) => THREE.Vector3, width: (t: number) => number, rows: number, base: THREE.Vector3, dark = 0.6) {
  const sh = (t: number) => lerp(dark, 1.08, t);
  for (let r = 0; r < rows; r++) {
    const t0 = r / rows;
    const t1 = (r + 1) / rows;
    const w0 = width(t0);
    const w1 = width(t1);
    m.tri(at(t0, -w0), at(t1, -w1), at(t1, w1), leafOpts(sh(t0), sh(t1), sh(t1), base));
    m.tri(at(t0, -w0), at(t1, w1), at(t0, w0), leafOpts(sh(t0), sh(t1), sh(t0), base));
  }
}

/** An ornamental grass: a fountain of thin arching blades (~0.6 m), some with a feathery plume. */
function grassGeometry(seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const m = new FlowerMesh();
  const base = new THREE.Vector3();
  const n = 22 + Math.floor(rng() * 8);
  for (let i = 0; i < n; i++) {
    const az = rng() * Math.PI * 2;
    const len = lerp(0.42, 0.7, rng());
    const lean = lerp(0.15, 0.75, rng());
    const d = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const sd = new THREE.Vector3(-d.z, 0, d.x);
    const root = d.clone().multiplyScalar(rng() * 0.04);
    const at = (t: number, w: number) => root.clone().addScaledVector(UP, Math.sin((1 - lean * t) * Math.PI / 2) * t * len).addScaledVector(d, t * t * len * lean).addScaledVector(sd, w);
    leafStrip(m, at, (t) => 0.008 * (1 - t * 0.85), 5, base, 0.55);
    if (rng() < 0.18) {
      // A soft seed plume at the tip.
      const tip = at(1, 0);
      for (let k = 0; k < 3; k++) {
        const a2 = rng() * Math.PI * 2;
        const o = new THREE.Vector3(Math.cos(a2) * 0.02, -0.05, Math.sin(a2) * 0.02);
        m.tri(tip, tip.clone().add(o), tip.clone().add(o).add(new THREE.Vector3(0.015, 0.02, 0)), leafOpts(1.25, 1.35, 1.3, base));
      }
    }
  }
  return m.build();
}

/** A fern: arching fronds of paired leaflets, low and lacy (~0.4 m). */
function fernGeometry(seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const m = new FlowerMesh();
  const base = new THREE.Vector3();
  const n = 7 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + (rng() - 0.5) * 0.4;
    const len = lerp(0.32, 0.46, rng());
    const rise = lerp(0.6, 1.0, rng());
    const d = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const sd = new THREE.Vector3(-d.z, 0, d.x);
    const spine = (t: number) => new THREE.Vector3().addScaledVector(d, t * len).addScaledVector(UP, Math.sin(t * Math.PI * 0.85) * len * 0.55 * rise);
    const pairs = 9;
    for (let k = 1; k <= pairs; k++) {
      const t = k / (pairs + 1);
      const p = spine(t);
      const ahead = spine(Math.min(1, t + 0.06));
      const leafLen = 0.075 * Math.sin(t * Math.PI) + 0.012;
      for (const side of [-1, 1]) {
        const tip = p.clone().addScaledVector(sd, side * leafLen).addScaledVector(d, leafLen * 0.35).addScaledVector(UP, -leafLen * 0.25);
        m.tri(p, ahead, tip, leafOpts(lerp(0.7, 0.9, t), lerp(0.75, 0.95, t), 1.05, base));
      }
    }
    // The midrib.
    leafStrip(m, (t, w) => spine(t).addScaledVector(sd, w), () => 0.004, 4, base, 0.5);
  }
  return m.build();
}

/** A hosta: a low mound of broad, ribbed, heart-shaped leaves (~0.3 m). */
function hostaGeometry(seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const m = new FlowerMesh();
  const base = new THREE.Vector3();
  const n = 8 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + (rng() - 0.5) * 0.5;
    const len = lerp(0.2, 0.3, rng());
    const lift = lerp(0.5, 1.0, rng());
    const d = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const sd = new THREE.Vector3(-d.z, 0, d.x);
    // A short stalk up, then the leaf blade curving out and down.
    const at = (t: number, w: number) => new THREE.Vector3().addScaledVector(d, 0.04 + t * len).addScaledVector(UP, 0.08 * lift + Math.sin(t * Math.PI) * 0.08 * lift - t * 0.06).addScaledVector(sd, w).addScaledVector(UP, -Math.abs(w) * 0.25);
    leafStrip(m, at, (t) => 0.085 * Math.sin(Math.min(1, t * 1.15) * Math.PI) ** 0.7 + 0.004, 6, base, 0.65);
  }
  return m.build();
}

/** Lamb's ear: a low rosette of soft, silvery tongue-shaped leaves (~0.12 m). */
function silverGeometry(seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const m = new FlowerMesh();
  const base = new THREE.Vector3();
  const n = 11 + Math.floor(rng() * 5);
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 * 2.3 + rng() * 0.3;
    const len = lerp(0.1, 0.17, rng()) * (i < 4 ? 0.7 : 1);
    const tilt = lerp(0.15, 0.6, rng()) * (i < 4 ? 2 : 1);
    const d = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const sd = new THREE.Vector3(-d.z, 0, d.x);
    const at = (t: number, w: number) => new THREE.Vector3().addScaledVector(d, Math.cos(tilt) * t * len).addScaledVector(UP, Math.sin(tilt) * t * len + 0.01).addScaledVector(sd, w);
    leafStrip(m, at, (t) => 0.03 * Math.sin(Math.min(1, t * 1.1 + 0.08) * Math.PI) ** 0.6, 4, base, 0.8);
  }
  return m.build();
}

/** A clipped box ball: a dense, slightly lumpy sphere of tiny leaves (~0.35 m across). */
function boxGeometry(seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const m = new FlowerMesh();
  const base = new THREE.Vector3();
  const ico = new THREE.IcosahedronGeometry(0.17, 3).toNonIndexed();
  const pos = ico.attributes.position;
  // Soft lumps where the shears missed a bit, and a fine leafy roughness (the same at shared
  // corners, so the surface stays whole).
  const ph = [rng() * 6, rng() * 6, rng() * 6];
  const bump = (v: THREE.Vector3) => {
    const k = 1 + Math.sin(v.x * 22 + ph[0]) * Math.sin(v.y * 19 + ph[1]) * 0.06 + Math.sin(v.z * 25 + ph[2]) * 0.04 + Math.sin((v.x + v.z) * 95 + v.y * 80) * 0.025;
    return new THREE.Vector3(v.x * k, v.y * k * 0.92 + 0.15, v.z * k);
  };
  for (let i = 0; i < pos.count; i += 3) {
    const a = bump(new THREE.Vector3().fromBufferAttribute(pos, i));
    const b = bump(new THREE.Vector3().fromBufferAttribute(pos, i + 1));
    const c = bump(new THREE.Vector3().fromBufferAttribute(pos, i + 2));
    // Lighter on top where the sun gets in, darker underneath, speckled with leaf.
    const h = (v: THREE.Vector3) => lerp(0.62, 1.1, Math.min(1, v.y / 0.3)) * (0.86 + 0.2 * (0.5 + 0.5 * Math.sin(v.x * 140 + v.z * 120 + v.y * 90)));
    const n = new THREE.Vector3().addVectors(a, b).add(c).sub(new THREE.Vector3(0, 0.45, 0)).normalize();
    m.tri(a, b, c, { ...leafOpts(h(a), h(b), h(c), base), n });
  }
  return m.build();
}

/** The geometry for one variant of a foliage kind. */
function leafGeometry(kind: LeafKind, seed: number): THREE.BufferGeometry {
  switch (kind) {
    case 'grass':
      return grassGeometry(seed);
    case 'fern':
      return fernGeometry(seed);
    case 'hosta':
      return hostaGeometry(seed);
    case 'silver':
      return silverGeometry(seed);
    case 'box':
      return boxGeometry(seed);
    default:
      return foliageGeometry(seed);
  }
}

const ROSE_STEM = new THREE.Color('#4a6a32');
const ROSE_LEAF = new THREE.Color('#3f6f32');
const THORN = new THREE.Color('#8a4a3a');

/** A thin tapering cane through `pts`, with a few small hooked thorns along it. */
function cane(m: FlowerMesh, pts: THREE.Vector3[], r0: number, rng: () => number) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const ra = r0 * (1 - (i / pts.length) * 0.5);
    const rb = r0 * (1 - ((i + 1) / pts.length) * 0.5);
    const dir = b.clone().sub(a).normalize();
    const u = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
    const w = new THREE.Vector3().crossVectors(dir, u);
    for (let k = 0; k < 4; k++) {
      const a0 = (k / 4) * Math.PI * 2;
      const a1 = ((k + 1) / 4) * Math.PI * 2;
      const o = (ang: number, r: number) => u.clone().multiplyScalar(Math.cos(ang) * r).addScaledVector(w, Math.sin(ang) * r);
      const n = o((a0 + a1) / 2, 1);
      m.tri(a.clone().add(o(a0, ra)), b.clone().add(o(a1, rb)), b.clone().add(o(a0, rb)), { n, color: ROSE_STEM });
      m.tri(a.clone().add(o(a0, ra)), a.clone().add(o(a1, ra)), b.clone().add(o(a1, rb)), { n, color: ROSE_STEM });
    }
    // Thorns: little red-brown hooks, pointing a touch downward.
    if (rng() < 0.7) {
      const ang = rng() * Math.PI * 2;
      const out = u.clone().multiplyScalar(Math.cos(ang)).addScaledVector(w, Math.sin(ang));
      const base = a.clone().lerp(b, rng()).addScaledVector(out, ra * 0.8);
      const tip = base.clone().addScaledVector(out, r0 * 2.2).addScaledVector(dir, -r0 * 0.8);
      const side = dir.clone().multiplyScalar(r0 * 0.9);
      m.tri(base.clone().sub(side), base.clone().add(side), tip, { color: THORN });
    }
  }
}

/** A rose leaf: five glossy, toothed leaflets along a stalk (a pair, a pair, and one at the tip). */
function roseLeaf(m: FlowerMesh, base: THREE.Vector3, dir: THREE.Vector3, len: number, rng: () => number) {
  const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  const tone = ROSE_LEAF.clone().multiplyScalar(lerp(0.85, 1.12, rng()));
  const leaflet = (at: THREE.Vector3, d: THREE.Vector3, l: number) => {
    const s = new THREE.Vector3().crossVectors(d, UP).normalize().multiplyScalar(l * 0.32);
    if (s.lengthSq() < 1e-8) s.copy(side).multiplyScalar(l * 0.32);
    const mid = at.clone().addScaledVector(d, l * 0.5);
    const tip = at.clone().addScaledVector(d, l);
    // A saw-toothed edge: the widest points nudged out a little, unevenly.
    const tooth = 1 + (rng() - 0.5) * 0.25;
    m.tri(at, mid.clone().addScaledVector(s, tooth), tip, { color: tone, shade: [0.8, 1.05, 1] });
    m.tri(at, tip, mid.clone().addScaledVector(s, -tooth), { color: tone, shade: [0.8, 1, 1.08] });
  };
  for (let k = 0; k < 2; k++) {
    const at = base.clone().addScaledVector(dir, len * (0.35 + k * 0.3));
    for (const sgn of [-1, 1]) {
      const d = dir.clone().multiplyScalar(0.45).addScaledVector(side, sgn).add(new THREE.Vector3(0, 0.15, 0)).normalize();
      leaflet(at, d, len * lerp(0.42, 0.5, rng()));
    }
  }
  leaflet(base.clone().addScaledVector(dir, len * 0.85), dir.clone().add(new THREE.Vector3(0, 0.1, 0)).normalize(), len * 0.55);
}

/**
 * A rose bloom at `top`: petals in a golden-angle spiral, wrapped tight and cupped at the heart,
 * opening and curling back toward the outside. `opened` (0 bud … 1 full) sets how far this bloom
 * has opened, so one bush carries buds, half-open and open roses together.
 */
function roseBloom(m: FlowerMesh, top: THREE.Vector3, size: number, petals: number, opened: number, wild: boolean, rng: () => number) {
  sepals(m, top, size * 0.7, rng);
  if (wild) {
    // A simple open five-petalled rose with a boss of golden stamens.
    const off = rng() * Math.PI * 2;
    for (let i = 0; i < 5; i++) {
      const az = off + (i / 5) * Math.PI * 2 + (rng() - 0.5) * 0.15;
      petal(m, top.clone(), az, lerp(0.5, 1.35, opened), size * lerp(0.92, 1.08, rng()), size * 1.05, 0.12, 0.1, rng, { notch: true });
    }
    m.addGeometry(new THREE.IcosahedronGeometry(size * 0.18, 1).scale(1, 0.5, 1).translate(top.x, top.y + size * 0.05, top.z), new THREE.Color('#d8c050'), false, top);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const dot = new THREE.IcosahedronGeometry(size * 0.05, 0).translate(top.x + Math.cos(a) * size * 0.26, top.y + size * 0.1, top.z + Math.sin(a) * size * 0.26);
      m.addGeometry(dot, new THREE.Color('#f2c230'), false, top);
    }
    return;
  }
  const off = rng() * Math.PI * 2;
  for (let i = petals - 1; i >= 0; i--) {
    const k = i / (petals - 1); // 0 = the heart … 1 = the outermost
    const az = off + i * 2.39996 + (rng() - 0.5) * 0.2;
    // Inner petals stand tight and upright; outer ones open (more so on an open bloom) and curl back.
    const reach = k * (0.35 + opened * 0.65);
    const open = lerp(0.12, 0.35, k) + reach * 1.35;
    const len = size * lerp(0.42, 1.0, Math.sqrt(k)) * lerp(0.92, 1.08, rng());
    const width = len * lerp(0.95, 1.15, rng());
    const ring = size * 0.18 * k;
    const hinge = top.clone().add(new THREE.Vector3(Math.cos(az) * ring, size * 0.12 * (1 - k), Math.sin(az) * ring));
    const cup = lerp(0.45, 0.05, k) * (1 - opened * 0.4);
    petal(m, hinge, az, open, len, width, cup, 0.06, rng);
  }
}

/**
 * A rose bush of one of six habits, built of thorny canes with five-leaflet leaves and roses in
 * every stage from bud to full bloom. Returns where the highest bloom sits.
 */
function roseBush(m: FlowerMesh, type: 'tea' | 'floribunda' | 'cabbage' | 'climber' | 'wild' | 'mini', height: number, size: number, rng: () => number): THREE.Vector3 {
  const petals = type === 'cabbage' ? 42 : type === 'tea' ? 26 : type === 'mini' ? 16 : type === 'floribunda' ? 20 : 22;
  const canes = type === 'tea' ? 2 : type === 'cabbage' ? 3 : type === 'floribunda' ? 3 : type === 'climber' ? 3 : type === 'wild' ? 4 : 4;
  let top = new THREE.Vector3(0, 0, 0);
  for (let c = 0; c < canes; c++) {
    const az = (c / canes) * Math.PI * 2 + rng() * 1.2;
    const d = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    // Climbers and wild roses arch outward; the rest grow fairly upright.
    const arch = type === 'climber' ? lerp(0.25, 0.4, rng()) : type === 'wild' ? lerp(0.15, 0.25, rng()) : lerp(0.02, 0.08, rng());
    const h = height * lerp(0.75, 1.05, rng()) * (c === 0 ? 1 : 0.85);
    const pts: THREE.Vector3[] = [];
    const segs = 6;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const out = arch * Math.sin(t * Math.PI * 0.6) + c * 0.012;
      const droop = type === 'climber' || type === 'wild' ? Math.max(0, t - 0.75) * arch * 0.6 : 0;
      pts.push(new THREE.Vector3(d.x * out, h * t - droop, d.z * out));
    }
    cane(m, pts, type === 'mini' ? 0.0035 : 0.005, rng);
    // Leaves all along (climbers more), each a spray of five.
    const leaves = type === 'climber' ? 5 : type === 'mini' ? 2 : 3;
    for (let l = 0; l < leaves; l++) {
      const t = lerp(0.2, 0.85, (l + rng() * 0.6) / leaves);
      const at = pts[Math.floor(t * segs)].clone().lerp(pts[Math.min(segs, Math.floor(t * segs) + 1)], (t * segs) % 1);
      const la = rng() * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(la), lerp(-0.1, 0.4, rng()), Math.sin(la)).normalize();
      roseLeaf(m, at, dir, (type === 'mini' ? 0.06 : 0.085) * lerp(0.85, 1.15, rng()), rng);
    }
    // Blooms: one at the tip (a cluster on floribundas and patio roses; along the cane on climbers and wild roses).
    const tip = pts[segs];
    const blooms: THREE.Vector3[] = [];
    if (type === 'floribunda' || type === 'mini') {
      const n = type === 'mini' ? 3 + Math.floor(rng() * 3) : 3 + Math.floor(rng() * 3);
      for (let b = 0; b < n; b++) {
        const a = (b / n) * Math.PI * 2 + rng();
        const r = b === 0 ? 0 : size * lerp(1.4, 2.0, rng());
        blooms.push(tip.clone().add(new THREE.Vector3(Math.cos(a) * r, -r * 0.4 - (b ? size * 0.3 : 0), Math.sin(a) * r)));
      }
    } else if (type === 'climber' || type === 'wild') {
      for (const t of [1, 0.78, 0.6]) {
        const i = Math.round(t * segs);
        blooms.push(pts[i].clone().add(new THREE.Vector3((rng() - 0.5) * size, size * 0.4, (rng() - 0.5) * size)));
      }
    } else blooms.push(tip.clone());
    for (const [b, at] of blooms.entries()) {
      // A mix of stages on every bush: mostly open, some half, the odd tight bud.
      const r = rng();
      const opened = b === 0 && type !== 'wild' ? lerp(0.55, 1, rng()) : r < 0.2 ? 0.05 : r < 0.5 ? 0.45 : lerp(0.7, 1, rng());
      if (b > 0) {
        // A short stalk from the cane to each side bloom.
        const from = tip.clone().lerp(at, 0.2);
        from.y = Math.min(from.y, at.y);
        m.tri(from.clone().add(new THREE.Vector3(-0.002, 0, 0)), at, from.clone().add(new THREE.Vector3(0.002, 0, 0)), { color: ROSE_STEM });
      }
      const s = size * (opened < 0.2 ? 0.55 : 1) * lerp(0.9, 1.1, rng());
      roseBloom(m, at, s, opened < 0.2 ? Math.round(petals * 0.4) : petals, opened, type === 'wild', rng);
      if (at.y > top.y) top = at.clone();
    }
  }
  return top;
}

const PAD = new THREE.Color('#4f8a3a');
const PAD_DARK = new THREE.Color('#3f7a32');

/** A floating leaf: a disc (with the lily pad's notch) lying on the water, at height y. */
function pad(m: FlowerMesh, cx: number, cz: number, r: number, y: number, notch: boolean, cupped: number, rng: () => number) {
  const n = 16;
  const gap = notch ? 0.5 : 0;
  const a0 = rng() * Math.PI * 2;
  const centre = new THREE.Vector3(cx, y - cupped * r, cz);
  const tone = (rng() < 0.5 ? PAD : PAD_DARK).clone().multiplyScalar(lerp(0.9, 1.1, rng()));
  for (let i = 0; i < n; i++) {
    const t0 = gap / 2 + (i / n) * (Math.PI * 2 - gap);
    const t1 = gap / 2 + ((i + 1) / n) * (Math.PI * 2 - gap);
    const rr0 = r * (1 + Math.sin(t0 * 3 + a0) * 0.04);
    const rr1 = r * (1 + Math.sin(t1 * 3 + a0) * 0.04);
    const p0 = new THREE.Vector3(cx + Math.cos(a0 + t0) * rr0, y, cz + Math.sin(a0 + t0) * rr0);
    const p1 = new THREE.Vector3(cx + Math.cos(a0 + t1) * rr1, y, cz + Math.sin(a0 + t1) * rr1);
    m.tri(centre, p1, p0, { color: tone, shade: [0.85, 1.05, 1.05], n: UP });
  }
}

/** An upright leaf on a stalk: a broad heart (round) or an arrow, standing out of the water. */
function standingLeaf(m: FlowerMesh, base: THREE.Vector3, h: number, len: number, az: number, arrow: boolean, rng: () => number) {
  const d = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
  const top = base.clone().add(new THREE.Vector3(d.x * 0.02, h, d.z * 0.02));
  // The stalk.
  const side = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(0.003);
  m.tri(base.clone().sub(side), top, base.clone().add(side), { color: STEM });
  // The blade, tilted out from the stalk, pointing up and away.
  const up = d.clone().multiplyScalar(0.6).addScaledVector(UP, 0.8).normalize();
  const across = new THREE.Vector3(-d.z, 0, d.x);
  const tone = LEAF.clone().multiplyScalar(lerp(0.85, 1.05, rng()));
  const tip = top.clone().addScaledVector(up, len);
  const w = len * (arrow ? 0.45 : 0.5);
  if (arrow) {
    // An arrowhead: a pointed blade with two back-swept lobes.
    const mid = top.clone().addScaledVector(up, len * 0.3);
    const lobeL = top.clone().addScaledVector(up, -len * 0.45).addScaledVector(across, w);
    const lobeR = top.clone().addScaledVector(up, -len * 0.45).addScaledVector(across, -w);
    m.tri(top, mid.clone().addScaledVector(across, w * 0.7), tip, { color: tone, shade: [0.85, 1, 1.05] });
    m.tri(top, tip, mid.clone().addScaledVector(across, -w * 0.7), { color: tone, shade: [0.85, 1.05, 1] });
    m.tri(top, lobeL, mid.clone().addScaledVector(across, w * 0.7), { color: tone, shade: [0.85, 0.95, 1] });
    m.tri(top, mid.clone().addScaledVector(across, -w * 0.7), lobeR, { color: tone, shade: [0.85, 1, 0.95] });
  } else {
    const mid = top.clone().addScaledVector(up, len * 0.45);
    for (const sg of [-1, 1]) {
      m.tri(top, mid.clone().addScaledVector(across, sg * w), tip, { color: tone, shade: [0.85, 1, 1.05] });
      m.tri(top, top.clone().addScaledVector(across, sg * w * 0.6).addScaledVector(up, -len * 0.08), mid.clone().addScaledVector(across, sg * w), { color: tone, shade: [0.85, 0.95, 1] });
    }
  }
}

/** A sword-shaped leaf (iris), rising in a gentle arch from the water. */
function sword(m: FlowerMesh, base: THREE.Vector3, h: number, az: number, rng: () => number) {
  const d = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
  const s = new THREE.Vector3(-d.z, 0, d.x);
  const lean = lerp(0.08, 0.22, rng());
  const w = lerp(0.012, 0.018, rng());
  const tone = LEAF.clone().multiplyScalar(lerp(0.85, 1.05, rng()));
  const at = (t: number) => base.clone().addScaledVector(UP, t * h).addScaledVector(d, t * t * h * lean);
  const rows = 5;
  for (let i = 0; i < rows; i++) {
    const t0 = i / rows;
    const t1 = (i + 1) / rows;
    const w0 = w * (1 - t0 * 0.7);
    const w1 = i === rows - 1 ? 0 : w * (1 - t1 * 0.7);
    m.tri(at(t0).addScaledVector(s, -w0), at(t1).addScaledVector(s, -w1), at(t1).addScaledVector(s, w1), { color: tone, shade: [0.8, 1, 1] });
    m.tri(at(t0).addScaledVector(s, -w0), at(t1).addScaledVector(s, w1), at(t0).addScaledVector(s, w0), { color: tone, shade: [0.8, 1, 0.95] });
  }
}

/** A simple bloom of `n` petals at `top` (petal colour from the plant), with a heart. */
function simpleBloom(m: FlowerMesh, top: THREE.Vector3, n: number, len: number, width: number, open: number, cup: number, heart: THREE.Color | null, rng: () => number, style: PetalStyle = {}) {
  const off = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const az = off + (i / n) * Math.PI * 2 + (rng() - 0.5) * 0.15;
    petal(m, top.clone(), az, open + (rng() - 0.5) * 0.1, len * lerp(0.9, 1.1, rng()), width, cup, 0.1, rng, style);
  }
  if (heart) m.addGeometry(new THREE.IcosahedronGeometry(len * 0.22, 1).scale(1, 0.55, 1).translate(top.x, top.y + len * 0.06, top.z), heart, false, top);
}

/**
 * Water flowers, built around the water's surface at y = 0: floating pads and blooms (lotus,
 * lilies, water hyacinth), and marginals standing up out of the shallows (iris, marsh
 * marigold, pickerelweed, arrowhead). Returns where the main bloom sits.
 */
function aquatic(m: FlowerMesh, type: 'lotus' | 'lily' | 'hyacinth' | 'flag' | 'marigold' | 'pickerel' | 'arrowhead', height: number, size: number, rng: () => number): THREE.Vector3 {
  const O = new THREE.Vector3(0, 0, 0);
  switch (type) {
    case 'lily': {
      // A cluster of notched pads, and one star-shaped bloom floating among them.
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7 + rng();
        const r = i === 0 ? 0 : lerp(0.12, 0.2, rng());
        pad(m, Math.cos(a) * r, Math.sin(a) * r, lerp(0.09, 0.13, rng()), 0.004, true, 0, rng);
      }
      const top = new THREE.Vector3(0.03, 0.02, 0.02);
      simpleBloom(m, top, 9, size, size * 0.42, 1.05, 0.05, new THREE.Color('#f2c230'), rng, { pointed: true });
      simpleBloom(m, top.clone().add(new THREE.Vector3(0, 0.006, 0)), 8, size * 0.8, size * 0.38, 0.65, 0.12, null, rng, { pointed: true });
      return top;
    }
    case 'lotus': {
      // Big round leaves, some floating, some held up on stalks; a tall stem with a cupped bloom
      // around a golden seed-pod heart.
      for (let i = 0; i < 3; i++) {
        const a = i * 2.1 + rng();
        pad(m, Math.cos(a) * lerp(0.1, 0.2, rng()), Math.sin(a) * lerp(0.1, 0.2, rng()), lerp(0.13, 0.18, rng()), 0.004, false, 0.04, rng);
      }
      for (let i = 0; i < 2; i++) {
        const a = rng() * Math.PI * 2;
        const x = Math.cos(a) * 0.08;
        const z = Math.sin(a) * 0.08;
        const h = height * lerp(0.4, 0.65, rng());
        m.tri(new THREE.Vector3(x - 0.003, 0, z), new THREE.Vector3(x, h, z), new THREE.Vector3(x + 0.003, 0, z), { color: STEM });
        pad(m, x, z, lerp(0.12, 0.16, rng()), h, false, 0.18, rng);
      }
      const top = stem(m, height, new THREE.Vector3((rng() - 0.5) * 0.06, 0, (rng() - 0.5) * 0.06), rng, false);
      sepals(m, top, size * 0.5, rng);
      // Two rings of broad, cupped, pointed petals.
      simpleBloom(m, top, 8, size * 1.1, size * 0.7, 0.85, 0.3, null, rng, { pointed: true });
      simpleBloom(m, top.clone().add(new THREE.Vector3(0, 0.004, 0)), 7, size * 0.9, size * 0.6, 0.45, 0.35, null, rng, { pointed: true });
      // The seed pod: a flat-topped cone, golden-green, with dark seeds on top.
      const podR = size * 0.32;
      m.addGeometry(new THREE.CylinderGeometry(podR, podR * 0.6, podR * 0.8, 12).translate(top.x, top.y + podR * 0.45, top.z), new THREE.Color('#c8c050'), false, top);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const r = i === 0 ? 0 : podR * 0.55;
        m.addGeometry(new THREE.IcosahedronGeometry(podR * 0.14, 0).translate(top.x + Math.cos(a) * r, top.y + podR * 0.86, top.z + Math.sin(a) * r), new THREE.Color('#5a5a2a'), false, top);
      }
      return top;
    }
    case 'hyacinth': {
      // A glossy rosette floating on the water, and a short spike of pale flowers.
      for (let i = 0; i < 6; i++) {
        const az = (i / 6) * Math.PI * 2 + rng() * 0.3;
        standingLeaf(m, new THREE.Vector3(Math.cos(az) * 0.02, 0.005, Math.sin(az) * 0.02), 0.02, lerp(0.05, 0.07, rng()), az, false, rng);
      }
      const top = new THREE.Vector3(0, height, 0);
      m.tri(new THREE.Vector3(-0.003, 0, 0), top, new THREE.Vector3(0.003, 0, 0), { color: STEM });
      for (let i = 0; i < 7; i++) {
        const az = i * 2.4;
        const y = height - i * size * 0.9;
        const f = new THREE.Vector3(Math.cos(az) * size * 0.8, y, Math.sin(az) * size * 0.8);
        simpleBloom(m, f, 6, size, size * 0.6, 1.2, 0.05, null, rng);
      }
      return top;
    }
    case 'flag': {
      // A fan of tall sword leaves, and a flag flower: three falls drooping, three standards up.
      for (let i = 0; i < 6; i++) sword(m, new THREE.Vector3((rng() - 0.5) * 0.04, 0, (rng() - 0.5) * 0.04), height * lerp(0.7, 1.05, rng()), rng() * Math.PI * 2, rng);
      const top = stem(m, height, new THREE.Vector3(0.02, 0, 0.01), rng, false);
      const off = rng() * Math.PI * 2;
      for (let i = 0; i < 3; i++) {
        petal(m, top.clone(), off + (i / 3) * Math.PI * 2, 1.85, size, size * 0.55, 0.05, 0.1, rng, { blotch: 0.5 });
        petal(m, top.clone(), off + (i / 3) * Math.PI * 2 + Math.PI / 3, 0.35, size * 0.8, size * 0.4, 0.2, 0.05, rng);
      }
      return top;
    }
    case 'marigold': {
      // Round, glossy leaves on short stalks, and a few golden cups.
      for (let i = 0; i < 4; i++) {
        const az = (i / 4) * Math.PI * 2 + rng();
        standingLeaf(m, O.clone(), height * lerp(0.3, 0.5, rng()), lerp(0.06, 0.08, rng()), az, false, rng);
      }
      let top = O;
      for (let i = 0; i < 3; i++) {
        const a = rng() * Math.PI * 2;
        const h = height * lerp(0.75, 1.05, rng());
        const at = new THREE.Vector3(Math.cos(a) * 0.04, h, Math.sin(a) * 0.04);
        m.tri(new THREE.Vector3(-0.002, 0, 0), at, new THREE.Vector3(0.002, 0, 0), { color: STEM });
        simpleBloom(m, at, 5, size, size * 0.9, 0.85, 0.2, new THREE.Color('#e8a020'), rng);
        if (at.y > top.y) top = at;
      }
      return top;
    }
    case 'pickerel': {
      // Glossy heart-shaped leaves held up on stalks, and a spike of violet-blue florets.
      for (let i = 0; i < 4; i++) standingLeaf(m, O.clone(), height * lerp(0.45, 0.7, rng()), lerp(0.08, 0.11, rng()), rng() * Math.PI * 2, false, rng);
      const top = stem(m, height, new THREE.Vector3(0.01, 0, 0.01), rng, false);
      for (let i = 0; i < 18; i++) {
        const az = i * 2.39996;
        const y = top.y - (i / 18) * size * 7;
        const g = new THREE.OctahedronGeometry(size * lerp(0.7, 0.45, i / 18), 0).scale(0.8, 1.2, 0.8).translate(top.x + Math.cos(az) * size * 0.6, y, top.z + Math.sin(az) * size * 0.6);
        m.addGeometry(g, WHITE, true, top);
      }
      return top;
    }
    case 'arrowhead': {
      // Arrow-shaped leaves on stalks; a stem with whorls of small white three-petalled flowers.
      for (let i = 0; i < 4; i++) standingLeaf(m, O.clone(), height * lerp(0.4, 0.65, rng()), lerp(0.1, 0.13, rng()), rng() * Math.PI * 2, true, rng);
      const top = stem(m, height, new THREE.Vector3(0.01, 0, -0.01), rng, false);
      for (let w = 0; w < 3; w++) {
        const y = top.y - w * size * 3;
        for (let i = 0; i < 3; i++) {
          const az = (i / 3) * Math.PI * 2 + w;
          const f = new THREE.Vector3(top.x + Math.cos(az) * size * 1.2, y, top.z + Math.sin(az) * size * 1.2);
          simpleBloom(m, f, 3, size, size * 0.9, 1.2, 0.1, new THREE.Color('#e8d040'), rng);
        }
      }
      return top;
    }
  }
}

/** Storybook proportions: blooms drawn about twice life size so they read from the garden camera. */
const HEAD = 2.8;

/** Build one geometry variant of a species. */
/** A thin strip (stem, stalk) from a to b, of half-width w. */
function strip(m: FlowerMesh, a: THREE.Vector3, b: THREE.Vector3, w: number, color = STEM) {
  const d = b.clone().sub(a);
  const side = new THREE.Vector3(-d.z, 0, d.x).normalize().multiplyScalar(w);
  if (side.lengthSq() === 0) side.set(w, 0, 0);
  m.tri(a.clone().sub(side), b.clone().sub(side), b.clone().add(side), { color });
  m.tri(a.clone().sub(side), b.clone().add(side), a.clone().add(side), { color });
}

/**
 * Arching stems hung with flowers: bleeding heart's lockets (each with a white drop), or bells
 * hanging in a row under the arch (Solomon's seal, with leaves along the stem; fuchsia's two-tone
 * skirts). Smaller towards the tip.
 */
function archPlant(m: FlowerMesh, f: { florets: number; floretSize: number; shape: 'heart' | 'bell' }, height: number, rng: () => number): THREE.BufferGeometry {
  const stems = 2 + Math.floor(rng() * 2);
  let headY = 0;
  for (let s = 0; s < stems; s++) {
    const az = (s / stems) * Math.PI * 2 + (rng() - 0.5) * 0.8;
    const d = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const reach = height * lerp(0.55, 0.8, rng());
    const h = height * lerp(0.85, 1.05, rng());
    const pt = (t: number) => new THREE.Vector3().addScaledVector(d, reach * t).addScaledVector(UP, h * Math.sin(t * Math.PI * 0.72));
    for (let k = 0; k < 7; k++) strip(m, pt(k / 7), pt((k + 1) / 7), 0.0035 * (1 - k / 10));
    headY = Math.max(headY, pt(0.7).y);
    // Solomon's seal: leaves held out along the arch.
    if (f.shape === 'bell' && f.florets > 7) {
      for (let k = 2; k < 7; k++) {
        const p = pt(k / 8);
        const side = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(k % 2 ? 1 : -1);
        const tip = p.clone().addScaledVector(side, 0.07).addScaledVector(d, 0.03);
        m.tri(p, tip.clone().addScaledVector(d, 0.025).add(new THREE.Vector3(0, 0.01, 0)), tip, { color: LEAF, shade: [0.8, 1.05, 1] });
        m.tri(p, tip, tip.clone().addScaledVector(d, -0.04), { color: LEAF, shade: [0.8, 1, 0.95] });
      }
    }
    for (let k = 0; k < f.florets; k++) {
      const t = lerp(0.38, 0.97, k / Math.max(1, f.florets - 1));
      const p = pt(t);
      const size = f.floretSize * HEAD * lerp(1.1, 0.65, k / f.florets) * lerp(0.9, 1.1, rng());
      const hang = p.clone().add(new THREE.Vector3(0, -size * 1.5, 0));
      strip(m, p, hang, 0.0015);
      if (f.shape === 'heart') {
        const heart = new THREE.OctahedronGeometry(size, 1);
        heart.scale(1.15, 0.95, 0.6);
        heart.rotateY(az);
        heart.translate(hang.x, hang.y - size * 0.6, hang.z);
        m.addGeometry(heart, WHITE, true, p, 0);
        const drop = new THREE.ConeGeometry(size * 0.3, size * 0.9, 5);
        drop.rotateX(Math.PI);
        drop.translate(hang.x, hang.y - size * 1.7, hang.z);
        m.addGeometry(drop, WHITE, true, p, 1);
      } else {
        // A bell: the outer flared cup, and a longer inner skirt in the second colour.
        const bell = new THREE.ConeGeometry(size * 0.75, size * 1.6, 7, 1, true);
        bell.translate(hang.x, hang.y - size * 0.8, hang.z);
        m.addGeometry(bell, WHITE, true, p, 0);
        const skirt = new THREE.CylinderGeometry(size * 0.25, size * 0.5, size * 1.0, 6, 1, true);
        skirt.translate(hang.x, hang.y - size * 1.9, hang.z);
        m.addGeometry(skirt, WHITE, true, p, 1);
      }
    }
  }
  // A few leaves at the foot.
  for (let i = 0; i < 4; i++) {
    const az = rng() * Math.PI * 2;
    const d = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const side = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(0.025);
    const tip = d.clone().multiplyScalar(0.12).add(new THREE.Vector3(0, 0.05, 0));
    const mid = d.clone().multiplyScalar(0.06).add(new THREE.Vector3(0, 0.05, 0));
    m.tri(new THREE.Vector3(0, 0.01, 0), mid.clone().add(side), tip, { color: LEAF, shade: [0.75, 1, 1.05] });
    m.tri(new THREE.Vector3(0, 0.01, 0), tip, mid.clone().sub(side), { color: LEAF, shade: [0.75, 1.05, 1] });
  }
  const geo = m.build();
  geo.userData.headY = headY;
  return geo;
}

/** A cloud of tiny florets on fine branching stems (baby's breath, lady's mantle). */
function cloudHead(m: FlowerMesh, top: THREE.Vector3, f: { florets: number; spread: number; floretSize: number }, height: number, rng: () => number): THREE.BufferGeometry {
  const tips: THREE.Vector3[] = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.6;
    const r = f.spread * lerp(0.6, 1.1, rng());
    const tip = top.clone().add(new THREE.Vector3(Math.cos(a) * r, height * lerp(0.2, 0.4, rng()), Math.sin(a) * r));
    const mid = top.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0.02, 0));
    strip(m, top, mid, 0.002);
    strip(m, mid, tip, 0.0015);
    tips.push(tip);
  }
  tips.push(top.clone().add(new THREE.Vector3(0, height * 0.38, 0)));
  for (let i = 0; i < f.florets; i++) {
    const c = tips[i % tips.length];
    const r = f.spread * 0.45 * Math.cbrt(rng());
    const a = rng() * Math.PI * 2;
    const y = (rng() - 0.3) * f.spread * 0.4;
    const g = new THREE.OctahedronGeometry(f.floretSize * HEAD * 0.6 * lerp(0.7, 1.3, rng()), 0);
    g.translate(c.x + Math.cos(a) * r, c.y + y, c.z + Math.sin(a) * r);
    m.addGeometry(g, WHITE, true, top);
  }
  const geo = m.build();
  geo.userData.headY = top.y + height * 0.35;
  return geo;
}

/** Scabious (a domed pincushion in a frill of petals) or globe thistle (a ball of steel spikes). */
function pincushionHead(m: FlowerMesh, top: THREE.Vector3, f: { size: number; spiky: boolean }, rng: () => number): THREE.BufferGeometry {
  const size = f.size * HEAD * 0.6;
  const centre = top.clone().add(new THREE.Vector3(0, size * (f.spiky ? 1 : 0.3), 0));
  if (f.spiky) {
    const ball = new THREE.IcosahedronGeometry(size * 0.7, 1);
    ball.translate(centre.x, centre.y, centre.z);
    m.addGeometry(ball, WHITE, true, top);
    const q = new THREE.Quaternion();
    for (let i = 0; i < 46; i++) {
      const t = (i + 0.5) / 46;
      const phi = Math.acos(1 - 2 * t);
      const th = i * 2.39996;
      const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
      const spike = new THREE.ConeGeometry(size * 0.12, size * 0.55, 4);
      spike.translate(0, size * 0.85, 0);
      q.setFromUnitVectors(UP, dir);
      spike.applyQuaternion(q);
      spike.translate(centre.x, centre.y, centre.z);
      m.addGeometry(spike, WHITE, true, top, 0.25);
    }
  } else {
    // The frill: a ring of wavy petals, open wide.
    for (let i = 0; i < 14; i++) {
      const az = (i / 14) * Math.PI * 2 + (rng() - 0.5) * 0.2;
      const hinge = top.clone().add(new THREE.Vector3(Math.cos(az) * size * 0.8, 0, Math.sin(az) * size * 0.8));
      petal(m, hinge, az, 1.35 + (rng() - 0.5) * 0.2, size * 1.1, size * 0.9, 0, 0.12, rng, { notch: true });
    }
    const dome = new THREE.IcosahedronGeometry(size * 0.85, 1);
    dome.scale(1, 0.6, 1);
    dome.translate(centre.x, centre.y, centre.z);
    m.addGeometry(dome, WHITE, true, top, 0.35);
    // The pins: tiny pale florets dotted over the cushion.
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4;
      const r = Math.sqrt(i / 14) * size * 0.7;
      const pin = new THREE.IcosahedronGeometry(size * 0.1, 0);
      pin.translate(centre.x + Math.cos(a) * r, centre.y + size * 0.5 * (1 - (r / size) ** 2), centre.z + Math.sin(a) * r);
      m.addGeometry(pin, new THREE.Color('#fbf6ff'), false, top);
    }
  }
  const geo = m.build();
  geo.userData.headY = centre.y + size * 0.5;
  return geo;
}

/** Red hot poker: a torch of drooping tubes, gold at the bottom shading to scarlet at the top. */
function torchHead(m: FlowerMesh, top: THREE.Vector3, f: { length: number; radius: number }, rng: () => number): THREE.BufferGeometry {
  // Grassy leaves arching from the base.
  for (let i = 0; i < 8; i++) {
    const az = (i / 8) * Math.PI * 2 + rng() * 0.4;
    const d = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const len = lerp(0.3, 0.45, rng());
    leafStrip(m, (t, w) => d.clone().multiplyScalar(t * len * 0.6).addScaledVector(UP, Math.sin(t * Math.PI * 0.6) * len * 0.8).addScaledVector(new THREE.Vector3(-d.z, 0, d.x), w), (t) => 0.012 * (1 - t), 4, new THREE.Vector3(), 0.6);
  }
  const L = f.length * 1.6;
  const rings = 12;
  for (let k = 0; k < rings; k++) {
    const t = k / (rings - 1);
    const y = top.y + t * L;
    const r = f.radius * 1.2 * (1 - t ** 3 * 0.65);
    const per = 8;
    for (let i = 0; i < per; i++) {
      const az = (i / per) * Math.PI * 2 + (k % 2) * (Math.PI / per) + (rng() - 0.5) * 0.2;
      const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
      const dir = out.clone().multiplyScalar(0.45).add(new THREE.Vector3(0, -0.9, 0)).normalize();
      const tube = new THREE.CylinderGeometry(0.0035, 0.005, 0.04, 4, 1);
      tube.translate(0, -0.02, 0);
      tube.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir));
      tube.translate(top.x + out.x * r, y, top.z + out.z * r);
      // Older tubes at the bottom are gold; the young buds at the top, scarlet.
      m.addGeometry(tube, WHITE, true, top, Math.min(1, t * 1.15));
    }
  }
  const geo = m.build();
  geo.userData.headY = top.y + L;
  return geo;
}

export function flowerGeometry(sp: FlowerSpecies, seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const m = new FlowerMesh();
  const height = lerp(sp.height[0], sp.height[1], rng());
  if (sp.form.kind === 'aquatic') {
    const top = aquatic(m, sp.form.type, height, sp.form.size * HEAD, rng);
    const geo = m.build();
    geo.userData.headY = top.y;
    return geo;
  }
  if (sp.form.kind === 'rose') {
    const top = roseBush(m, sp.form.type, height, sp.form.size * HEAD, rng);
    const geo = m.build();
    geo.userData.headY = top.y;
    return geo;
  }
  if (sp.form.kind === 'foliage') {
    const geo = leafGeometry(sp.form.leaf, seed);
    geo.userData.headY = 0;
    return geo;
  }
  if (sp.form.kind === 'arch') {
    const geo = archPlant(m, sp.form, height, rng);
    return geo;
  }
  const lean = new THREE.Vector3((rng() - 0.5) * 0.06, 0, (rng() - 0.5) * 0.06);
  if (sp.form.kind === 'cloud') {
    const top = stem(m, height * 0.65, lean, rng);
    const geo = cloudHead(m, top, sp.form, height, rng);
    return geo;
  }
  if (sp.form.kind === 'torch') {
    const top = stem(m, height, lean, rng, false);
    return torchHead(m, top, sp.form, rng);
  }
  const top = stem(m, height, lean, rng);
  if (sp.form.kind === 'pincushion') return pincushionHead(m, top, sp.form, rng);
  const base = sp.form;
  const f: typeof base =
    base.kind === 'spike'
      ? { ...base, floretSize: base.floretSize * HEAD, spikeLength: base.spikeLength * 1.5 }
      : base.kind === 'cluster'
        ? { ...base, floretSize: base.floretSize * HEAD, radius: base.radius * HEAD * 0.7 }
        : base.kind === 'cup'
          ? { ...base, length: base.length * HEAD, width: base.width * HEAD }
          : { ...base, length: base.length * HEAD, width: base.width * HEAD, centerSize: base.centerSize * HEAD, cone: base.cone ? base.cone * HEAD : undefined };

  if (f.kind === 'radial') {
    sepals(m, top, f.length * (f.domed ? 0.45 : 0.35), rng);
    // Tilted blooms (pansies) turn their faces outward.
    if (f.tilt) {
      const az = rng() * Math.PI * 2;
      m.setTilt(top, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(az), 0, Math.sin(az)), f.tilt * lerp(0.85, 1.1, rng())));
    }
    const n = Math.round(lerp(f.petals[0], f.petals[1], rng()));
    const layers = Math.max(1, f.layers + (f.layers > 1 ? Math.round((rng() - 0.5) * 2) : 0));
    const style = { notch: f.notch, pointed: f.pointed, blotch: f.blotch };
    for (let layer = 0; layer < layers; layer++) {
      const k = layers > 1 ? layer / (layers - 1) : 0;
      // Domed blooms build up from wide outer petals to small upright ones at the crown.
      const open = f.domed ? lerp(f.open, 0.25, k) : f.open * (1 - k * 0.45);
      const lenK = f.domed ? lerp(1, 0.5, k) : 1 - k * 0.22;
      const count = Math.max(4, Math.round(n * (f.domed ? lerp(1, 0.55, k) : 1 - k * 0.3)));
      const lift = f.domed ? k * f.length * 0.55 : layer * 0.004;
      const ring = f.domed ? f.centerSize * lerp(1.6, 0.4, k) : f.centerSize * 0.5;
      const off = rng() * Math.PI * 2;
      for (let i = 0; i < count; i++) {
        const az = off + (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.18;
        // Pansies: the two upper petals are a little larger.
        const big = f.tilt ? 1 + 0.18 * Math.max(0, Math.sin(az)) : 1;
        const len = f.length * lenK * lerp(0.88, 1.12, rng()) * big;
        const hinge = top.clone().add(new THREE.Vector3(Math.cos(az) * ring, lift, Math.sin(az) * ring));
        const cup = f.domed ? lerp(0.05, 0.3, k) : 0;
        petal(m, hinge, az, open + (rng() - 0.5) * 0.12, len, f.width * lerp(0.88, 1.12, rng()) * (f.domed ? lerp(1, 0.75, k) : 1), cup, 0.12, rng, style);
      }
    }
    if (f.cone) {
      // Black-eyed Susan: a dark, raised cone.
      const cone = new THREE.ConeGeometry(f.centerSize, f.cone, 10, 2);
      cone.translate(top.x, top.y + f.cone * 0.5, top.z);
      m.addGeometry(cone, new THREE.Color(f.center), false, top);
    } else if (!f.domed) {
      const centre = new THREE.IcosahedronGeometry(f.centerSize, 1);
      centre.scale(1, 0.55, 1);
      centre.translate(top.x, top.y + f.centerSize * 0.25, top.z);
      m.addGeometry(centre, new THREE.Color(f.center), false, top);
    }
    if (f.corona) {
      // Daffodil: a frilled trumpet standing up out of the middle.
      const len = f.length * f.corona.length;
      const cup = new THREE.CylinderGeometry(f.centerSize * 1.9, f.centerSize * 1.1, len, 12, 1, true);
      cup.translate(top.x, top.y + len * 0.5, top.z);
      m.addGeometry(cup, new THREE.Color(f.corona.color), false, top);
    }
    if (f.stamens) {
      // Anemone: a ring of golden stamens round the green centre.
      const c = new THREE.Color(f.stamens);
      for (let i = 0; i < 16; i++) {
        const az = (i / 16) * Math.PI * 2;
        const dot = new THREE.IcosahedronGeometry(f.centerSize * 0.28, 0);
        dot.translate(top.x + Math.cos(az) * f.centerSize * 1.5, top.y + f.centerSize * 0.4, top.z + Math.sin(az) * f.centerSize * 1.5);
        m.addGeometry(dot, c, false, top);
      }
    }
    m.setTilt(null, null);
  } else if (f.kind === 'cluster') {
    // Sedum and yarrow: a flat-topped head of tiny star florets; hydrangea a rounded mophead;
    // allium a ball of stars held up on its bare stem.
    const shape = f.shape ?? 'flat';
    for (let i = 0; i < f.florets; i++) {
      let attach: THREE.Vector3;
      if (shape === 'globe') {
        // Evenly round the sphere (a Fibonacci spiral), with a little jitter.
        const t = (i + 0.5) / f.florets;
        const phi = Math.acos(1 - 2 * t);
        const th = i * 2.39996 + rng() * 0.3;
        const r = f.radius * lerp(0.92, 1.05, rng());
        attach = new THREE.Vector3(top.x + Math.sin(phi) * Math.cos(th) * r, top.y + f.radius * 0.85 + Math.cos(phi) * r, top.z + Math.sin(phi) * Math.sin(th) * r);
      } else {
        const r = Math.sqrt(rng()) * f.radius;
        const a = rng() * Math.PI * 2;
        const rise = shape === 'dome' ? 0.85 : 0.35;
        const y = top.y + (1 - (r / f.radius) ** 2) * f.radius * rise + (shape === 'dome' ? f.floretSize * rng() : 0);
        attach = new THREE.Vector3(top.x + Math.cos(a) * r, y, top.z + Math.sin(a) * r);
      }
      const g = new THREE.OctahedronGeometry(f.floretSize * lerp(0.8, 1.2, rng()), 0);
      g.scale(1, 0.5, 1);
      g.translate(attach.x, attach.y, attach.z);
      m.addGeometry(g, WHITE, true, top);
    }
    // Short branching stalks under the dome (an allium's stalks are hidden inside its ball).
    for (let i = 0; i < (shape === 'globe' ? 0 : 5); i++) {
      const a = (i / 5) * Math.PI * 2;
      const tip = top.clone().add(new THREE.Vector3(Math.cos(a) * f.radius * 0.6, f.radius * 0.1, Math.sin(a) * f.radius * 0.6));
      const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(0.004);
      m.tri(top.clone().sub(side), tip, top.clone().add(side), { color: STEM });
    }
  } else if (f.kind === 'cup') {
    for (let i = 0; i < f.petals; i++) {
      const inner = i % 2 === 1;
      const az = (i / f.petals) * Math.PI * 2 + (rng() - 0.5) * 0.1;
      const hinge = top.clone().add(new THREE.Vector3(Math.cos(az), 0, Math.sin(az)).multiplyScalar(inner ? 0.006 : 0.01));
      petal(m, hinge, az, f.open * (inner ? 0.8 : 1), f.length * (inner ? 0.95 : 1), f.width, 0.22, 0.04, rng);
    }
    sepals(m, top, f.length * 0.25, rng);
  } else {
    // Spike: florets spiral up the top of the stem, smaller toward the tip.
    for (let i = 0; i < f.florets; i++) {
      const t = i / (f.florets - 1);
      const y = top.y - f.spikeLength * (1 - t);
      const az = i * 2.39996; // golden angle
      const size = f.floretSize * lerp(1.1, 0.55, t);
      const d = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
      const attach = new THREE.Vector3(top.x * (y / top.y), y, top.z * (y / top.y));
      let g: THREE.BufferGeometry;
      if (f.bell) {
        // Foxglove bells: open cones hanging outward and down.
        g = new THREE.ConeGeometry(size * 0.55, size * 1.5, 7, 1, true);
        g.rotateX(Math.PI); // open end down
        const dir = d.clone().multiplyScalar(0.75).addScaledVector(UP, -0.55).normalize();
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir));
        g.translate(attach.x + d.x * size * 0.9, attach.y, attach.z + d.z * size * 0.9);
      } else {
        g = new THREE.OctahedronGeometry(size, 0);
        g.scale(0.8, 1.3, 0.8);
        g.translate(attach.x + d.x * size * 0.7, attach.y, attach.z + d.z * size * 0.7);
      }
      m.addGeometry(g, WHITE, true, attach);
    }
  }
  const geo = m.build();
  geo.userData.headY = top.y; // where the bloom sits (bees land here)
  return geo;
}

interface Pending {
  at: number;
  pos: THREE.Vector3;
}

/**
 * Every planted flower. One InstancedMesh per species variant; growth and petal unfurling run
 * in the vertex shader from each plant's birth time, so a bed of hundreds costs almost nothing.
 */
interface Placed {
  mesh: THREE.InstancedMesh;
  index: number;
  pos: THREE.Vector3;
  yaw: number;
  scale: number;
}

export class Flowers {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<string, THREE.InstancedMesh[]>();
  private readonly foliage: THREE.InstancedMesh[] = [];
  private readonly leaves = new Map<LeafKind, THREE.InstancedMesh[]>();
  private readonly uniforms = { uFlowerTime: { value: 0 } };
  private readonly grid = new Map<string, { x: number; z: number; r: number }[]>();
  private readonly blooms: Pending[] = [];
  private readonly heads: { pos: THREE.Vector3; openAt: number; species: string; color: THREE.Color }[] = [];
  /** Every plant placed, by 1 m cell, so the eraser can find them. */
  private readonly placed = new Map<string, Placed[]>();
  private readonly wilting: { p: Placed; t: number }[] = [];
  private time = 0;
  private rng = createRng(4242);
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();

  private readonly material: THREE.MeshLambertMaterial;

  constructor(
    private readonly species: FlowerSpecies[],
    private readonly onBloom: (p: THREE.Vector3) => void,
  ) {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    addWind(
      material,
      'clamp(position.y / 0.55, 0.0, 1.0)',
      (shader) => {
        Object.assign(shader.uniforms, this.uniforms);
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            /* glsl */ `#include <common>
            uniform float uFlowerTime;
            attribute vec4 aInfo;
            attribute vec2 aLife;
            #define aIsPetal aInfo.x
            #define aClose aInfo.y
            #define aGlow aInfo.z
            #define aEdge aInfo.w
            #define aBirth aLife.x
            #define aBloomMax aLife.y
            attribute vec3 aHinge, aAxis, aPetalColor, aEdgeColor;
            varying float vGlow;`,
          )
          .replace(
            '#include <color_vertex>',
            '#include <color_vertex>\nvColor.rgb = mix(vColor.rgb, vColor.rgb * mix(aPetalColor, aEdgeColor, aEdge), aIsPetal);',
          )
          .replace(
            '#include <begin_vertex>',
            /* glsl */ `#include <begin_vertex>
            {
              vGlow = aGlow;
              float age = uFlowerTime - aBirth;
              // Sprout: the whole plant rises from the soil with a little overshoot.
              float g = clamp(age / ${SPROUT_END.toFixed(2)}, 0.0, 1.0);
              float sprout = g * g * (3.0 - 2.0 * g) + sin(g * 3.14159) * 0.12;
              // Bud → bloom: petals pivot open about their hinges and swell to full size.
              float bloom = smoothstep(${BLOOM_START.toFixed(2)}, ${BLOOM_END.toFixed(2)}, age) * aBloomMax;
              if (aIsPetal > 0.5) {
                vec3 rel = transformed - aHinge;
                float ang = (1.0 - bloom) * aClose;
                float c = cos(ang), s = sin(ang);
                rel = rel * c + cross(aAxis, rel) * s + aAxis * dot(aAxis, rel) * (1.0 - c);
                rel *= mix(0.55, 1.0, bloom);
                transformed = aHinge + rel;
              }
              transformed *= max(sprout, 0.0001);
            }`,
          );
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vGlow;')
          .replace(
            '#include <normal_fragment_begin>',
            // Petals and leaves are thin and double-sided: keep their normals facing the light.
            '#include <normal_fragment_begin>\nnormal = normalize(vNormal);',
          )
          .replace(
            '#include <emissivemap_fragment>',
            // A whisper of sunlight through thin petals (kept low: petals should look matte).
            '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.07 * vGlow;',
          );
      },
      0.17, // flowers sway very gently
    );

    for (let v = 0; v < FOLIAGE_VARIANTS; v++) {
      this.foliage.push(this.makeMesh(foliageGeometry(500 + v * 31), material, FOLIAGE_CAPACITY));
    }

    this.material = material;
  }

  /**
   * A species' meshes, made the first time it's planted (with 50+ species, building them all up
   * front would hold tens of megabytes of empty instance buffers on the phone).
   */
  private variants(sp: FlowerSpecies): THREE.InstancedMesh[] {
    let list = this.meshes.get(sp.id);
    if (!list) {
      const si = this.species.indexOf(sp);
      list = [];
      for (let v = 0; v < VARIANTS; v++) list.push(this.makeMesh(flowerGeometry(sp, 1000 + si * 97 + v * 13), this.material, CAPACITY));
      this.meshes.set(sp.id, list);
    }
    return list;
  }

  private makeMesh(geo: THREE.BufferGeometry, material: THREE.Material, capacity: number): THREE.InstancedMesh {
    // Birth time and how far it blooms, together (x, y).
    const life = new Float32Array(capacity * 2);
    for (let i = 0; i < capacity; i++) life[i * 2] = 1e6;
    geo.setAttribute('aLife', new THREE.InstancedBufferAttribute(life, 2));
    geo.setAttribute('aPetalColor', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
    geo.setAttribute('aEdgeColor', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
    const mesh = new THREE.InstancedMesh(geo, material, capacity);
    mesh.count = 0;
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  /**
   * A foliage plant of a particular kind (grass, fern, hosta, lamb's ear, box ball), made the
   * first time it's planted. It grows in alongside the flowers.
   */
  plantLeaf(kind: LeafKind, x: number, y: number, z: number, yaw: number, scale: number, delay: number, color: THREE.Color) {
    if (kind === 'clump') return this.plantFoliage(x, y, z, yaw, scale, delay, color);
    let list = this.leaves.get(kind);
    if (!list) {
      list = [0, 1, 2].map((v) => this.makeMesh(leafGeometry(kind, 2000 + LEAF_KINDS.indexOf(kind) * 101 + v * 17), this.material, 1500));
      this.leaves.set(kind, list);
    }
    const mesh = list[Math.floor(this.rng() * list.length)];
    this.write(mesh, x, y, z, yaw, scale, delay + regrow.offset, 1, color);
    const key = `${Math.floor(x)},${Math.floor(z)}`;
    if (!this.grid.has(key)) this.grid.set(key, []);
    this.grid.get(key)!.push({ x, z, r: kind === 'grass' || kind === 'hosta' ? 0.32 : kind === 'box' ? 0.26 : 0.22 });
  }

  /** A leafy clump that fills the bed around the flowers. It swells in alongside them. */
  plantFoliage(x: number, y: number, z: number, yaw: number, scale: number, delay: number, color: THREE.Color) {
    const mesh = this.foliage[Math.floor(this.rng() * this.foliage.length)];
    this.write(mesh, x, y, z, yaw, scale, delay + regrow.offset, 1, color);
  }

  private write(mesh: THREE.InstancedMesh, x: number, y: number, z: number, yaw: number, scale: number, delay: number, bloomMax: number, color: THREE.Color, edge: THREE.Color = color): boolean {
    if (mesh.count >= (mesh.geometry.attributes.aLife as THREE.InstancedBufferAttribute).count) return false;
    const i = mesh.count++;
    mesh.visible = true;
    this.q.setFromAxisAngle(UP, yaw);
    this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(scale, scale, scale));
    mesh.setMatrixAt(i, this.m);
    mesh.instanceMatrix.addUpdateRange(i * 16, 16);
    mesh.instanceMatrix.needsUpdate = true;
    const key = `${Math.floor(x)},${Math.floor(z)}`;
    if (!this.placed.has(key)) this.placed.set(key, []);
    this.placed.get(key)!.push({ mesh, index: i, pos: new THREE.Vector3(x, y, z), yaw, scale });
    const g = mesh.geometry;
    const set = (name: string, values: number[]) => {
      const a = g.attributes[name] as THREE.InstancedBufferAttribute;
      a.array.set(values, i * a.itemSize);
      a.addUpdateRange(i * a.itemSize, a.itemSize);
      a.needsUpdate = true;
    };
    set('aLife', [this.time + delay, bloomMax]);
    set('aPetalColor', [color.r, color.g, color.b]);
    set('aEdgeColor', [edge.r, edge.g, edge.b]);
    return true;
  }

  /** Is there a plant within `r` of (x, z)? */
  isCrowded(x: number, z: number, r: number): boolean {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    for (let i = cx - 1; i <= cx + 1; i++) {
      for (let j = cz - 1; j <= cz + 1; j++) {
        for (const p of this.grid.get(`${i},${j}`) ?? []) {
          const min = Math.min(r, p.r);
          if ((p.x - x) ** 2 + (p.z - z) ** 2 < min * min) return true;
        }
      }
    }
    return false;
  }

  plant(sp: FlowerSpecies, variant: number, x: number, y: number, z: number, yaw: number, scale: number, delay: number, bloomMax: number, color: THREE.Color, edge?: THREE.Color) {
    delay += regrow.offset;
    const mesh = this.variants(sp)[variant % VARIANTS];
    if (!this.write(mesh, x, y, z, yaw, scale, delay, bloomMax, color, edge)) return;
    const birth = this.time + delay;

    const key = `${Math.floor(x)},${Math.floor(z)}`;
    if (!this.grid.has(key)) this.grid.set(key, []);
    this.grid.get(key)!.push({ x, z, r: sp.spacing });
    // (Foliage has no flowers for bees and butterflies to visit.)
    if (bloomMax > 0.5 && sp.form.kind !== 'foliage') {
      this.blooms.push({ at: birth + BLOOM_START + 0.6, pos: new THREE.Vector3(x, y, z) });
      const headY = (mesh.geometry.userData.headY as number) ?? 0.4;
      this.heads.push({ pos: new THREE.Vector3(x, y + headY * scale + 0.03, z), openAt: birth + BLOOM_END, species: sp.id, color: (edge ?? color).clone() });
    }
  }

  /** Back to an untouched garden (before an undo replays what remains). */
  reset() {
    for (const m of [...[...this.meshes.values()].flat(), ...this.foliage, ...[...this.leaves.values()].flat()]) {
      m.count = 0;
      m.visible = false;
    }
    this.grid.clear();
    this.blooms.length = 0;
    this.heads.length = 0;
    this.placed.clear();
    this.wilting.length = 0;
    this.rng = createRng(4242);
  }

  /** Plants within `r` of (x, z) wilt and sink back into the soil. Returns how many. */
  erase(x: number, z: number, r: number): number {
    let n = 0;
    const r2 = r * r;
    const near = (p: { x: number; z: number }) => (p.x - x) ** 2 + (p.z - z) ** 2 < r2;
    for (let i = Math.floor(x - r); i <= Math.floor(x + r); i++) {
      for (let j = Math.floor(z - r); j <= Math.floor(z + r); j++) {
        const key = `${i},${j}`;
        const list = this.placed.get(key);
        if (list) {
          const keep = list.filter((p) => !near(p.pos));
          for (const p of list) if (near(p.pos)) this.wilting.push({ p, t: 0 });
          n += list.length - keep.length;
          this.placed.set(key, keep);
        }
        const spacing = this.grid.get(key);
        if (spacing) this.grid.set(key, spacing.filter((p) => !near(p)));
      }
    }
    for (let i = this.heads.length - 1; i >= 0; i--) if (near(this.heads[i].pos)) this.heads.splice(i, 1);
    for (let i = this.blooms.length - 1; i >= 0; i--) if (near(this.blooms[i].pos)) this.blooms.splice(i, 1);
    return n;
  }

  /** Open blooms with their species (for visitors with favourite flowers). */
  openHeads(): { pos: THREE.Vector3; species: string; color: THREE.Color }[] {
    return this.heads.filter((h) => this.time >= h.openAt);
  }

  /** Open blooms bees can visit (in-season flowers that have finished unfurling). */
  openBlooms(): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const h of this.heads) if (this.time >= h.openAt) out.push(h.pos);
    return out;
  }

  update(dt: number) {
    this.time += dt;
    this.uniforms.uFlowerTime.value = this.time;
    for (let i = this.wilting.length - 1; i >= 0; i--) {
      const w = this.wilting[i];
      w.t = Math.min(1, w.t + dt / 0.5);
      const k = Math.max(0, 1 - w.t * w.t) * w.p.scale;
      this.q.setFromAxisAngle(UP, w.p.yaw + w.t * 0.6);
      this.m.compose(new THREE.Vector3(w.p.pos.x, w.p.pos.y - w.t * 0.12, w.p.pos.z), this.q, new THREE.Vector3(k, k, k));
      w.p.mesh.setMatrixAt(w.p.index, this.m);
      w.p.mesh.instanceMatrix.addUpdateRange(w.p.index * 16, 16);
      w.p.mesh.instanceMatrix.needsUpdate = true;
      if (w.t >= 1) this.wilting.splice(i, 1);
    }
    for (let i = this.blooms.length - 1; i >= 0; i--) {
      if (this.time >= this.blooms[i].at) {
        this.onBloom(this.blooms[i].pos);
        this.blooms.splice(i, 1);
      }
    }
  }
}
