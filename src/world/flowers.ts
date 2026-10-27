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

  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, opts: { n?: THREE.Vector3; shade?: [number, number, number]; color: THREE.Color; petal?: boolean; hinge?: THREE.Vector3; axis?: THREE.Vector3; close?: number; glow?: number }) {
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
    });
  }

  /** Append a stock three.js geometry (e.g. a floret), translated/oriented, as petal or not. */
  addGeometry(g: THREE.BufferGeometry, color: THREE.Color, petal: boolean, hinge0: THREE.Vector3) {
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
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aIsPetal', new THREE.Float32BufferAttribute(this.petal, 1));
    g.setAttribute('aHinge', new THREE.Float32BufferAttribute(this.hinge, 3));
    g.setAttribute('aAxis', new THREE.Float32BufferAttribute(this.axis, 3));
    g.setAttribute('aClose', new THREE.Float32BufferAttribute(this.close, 1));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.glow, 1));
    return g;
  }
}

const STEM = new THREE.Color('#4f8a3a');
const LEAF = new THREE.Color('#5f9a42');
const WHITE = new THREE.Color('#ffffff');

function stem(m: FlowerMesh, height: number, lean: THREE.Vector3, rng: () => number) {
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
  const leaves = height < 0.26 ? 5 : 2 + Math.floor(rng() * 2);
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
  const opts = (sh: [number, number, number]) => ({ color: WHITE, petal: true, hinge, axis, close: Math.max(0, open - closeTo), shade: sh });
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
    m.tri(l0, l1, c1, opts([shadeAt(t0, 1), shadeAt(t1, 1), shadeAt(t1, 0)]));
    m.tri(l0, c1, c0, opts([shadeAt(t0, 1), shadeAt(t1, 0), shadeAt(t0, 0)]));
    m.tri(c0, c1, r1, opts([shadeAt(t0, 0), shadeAt(t1, 0), shadeAt(t1, 1)]));
    m.tri(c0, r1, r0, opts([shadeAt(t0, 0), shadeAt(t1, 1), shadeAt(t0, 1)]));
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

/** Storybook proportions: blooms drawn about twice life size so they read from the garden camera. */
const HEAD = 2.8;

/** Build one geometry variant of a species. */
export function flowerGeometry(sp: FlowerSpecies, seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const m = new FlowerMesh();
  const height = lerp(sp.height[0], sp.height[1], rng());
  const lean = new THREE.Vector3((rng() - 0.5) * 0.06, 0, (rng() - 0.5) * 0.06);
  const top = stem(m, height, lean, rng);
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
  private readonly uniforms = { uFlowerTime: { value: 0 } };
  private readonly grid = new Map<string, { x: number; z: number; r: number }[]>();
  private readonly blooms: Pending[] = [];
  private readonly heads: { pos: THREE.Vector3; openAt: number; species: string }[] = [];
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
            attribute float aIsPetal, aClose, aBirth, aBloomMax, aGlow;
            attribute vec3 aHinge, aAxis, aPetalColor;
            varying float vGlow;`,
          )
          .replace(
            '#include <color_vertex>',
            '#include <color_vertex>\nvColor.rgb = mix(vColor.rgb, vColor.rgb * aPetalColor, aIsPetal);',
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
    geo.setAttribute('aBirth', new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(1e6), 1));
    geo.setAttribute('aBloomMax', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
    geo.setAttribute('aPetalColor', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
    const mesh = new THREE.InstancedMesh(geo, material, capacity);
    mesh.count = 0;
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  /** A leafy clump that fills the bed around the flowers. It swells in alongside them. */
  plantFoliage(x: number, y: number, z: number, yaw: number, scale: number, delay: number, color: THREE.Color) {
    const mesh = this.foliage[Math.floor(this.rng() * this.foliage.length)];
    this.write(mesh, x, y, z, yaw, scale, delay + regrow.offset, 1, color);
  }

  private write(mesh: THREE.InstancedMesh, x: number, y: number, z: number, yaw: number, scale: number, delay: number, bloomMax: number, color: THREE.Color): boolean {
    if (mesh.count >= (mesh.geometry.attributes.aBirth as THREE.InstancedBufferAttribute).count) return false;
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
    set('aBirth', [this.time + delay]);
    set('aBloomMax', [bloomMax]);
    set('aPetalColor', [color.r, color.g, color.b]);
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

  plant(sp: FlowerSpecies, variant: number, x: number, y: number, z: number, yaw: number, scale: number, delay: number, bloomMax: number, color: THREE.Color) {
    delay += regrow.offset;
    const mesh = this.variants(sp)[variant % VARIANTS];
    if (!this.write(mesh, x, y, z, yaw, scale, delay, bloomMax, color)) return;
    const birth = this.time + delay;

    const key = `${Math.floor(x)},${Math.floor(z)}`;
    if (!this.grid.has(key)) this.grid.set(key, []);
    this.grid.get(key)!.push({ x, z, r: sp.spacing });
    if (bloomMax > 0.5) {
      this.blooms.push({ at: birth + BLOOM_START + 0.6, pos: new THREE.Vector3(x, y, z) });
      const headY = (mesh.geometry.userData.headY as number) ?? 0.4;
      this.heads.push({ pos: new THREE.Vector3(x, y + headY * scale + 0.03, z), openAt: birth + BLOOM_END, species: sp.id });
    }
  }

  /** Back to an untouched garden (before an undo replays what remains). */
  reset() {
    for (const m of [...[...this.meshes.values()].flat(), ...this.foliage]) {
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
  openHeads(): { pos: THREE.Vector3; species: string }[] {
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
