import * as THREE from 'three';
import { lerp } from '../core/random';
import type { FlowerMesh } from './flowerMesh';

/**
 * The close-up ("hero") toolkit: smooth surfaces with a normal at every corner, for plants seen
 * from a hand's width away. Everything here is far finer than the garden's own shapes, and only
 * ever built for the few plants of the bed you're looking at.
 */

const UP = new THREE.Vector3(0, 1, 0);
type Rng = () => number;

/** What a flower looks like close up, beyond its garden shape (botanical details, per species). */
export interface HeroHints {
  /** Petal edges: how crinkled or wavy (0 smooth … 1 poppy-crinkled), and how many veins show. */
  ruffle?: number;
  veins?: number;
  /** The middle of a daisy-like flower: tiny disc florets, a raised cone, a spiky cone (echinacea), or a boss of stamens. */
  disc?: 'florets' | 'cone' | 'spiky' | 'boss' | 'eye';
  /** Disc colours: outer ring (pollen) and the heart. */
  discColors?: [string, string];
  /** The single florets of a spike or cluster. */
  floret?: 'bell' | 'pea' | 'tube' | 'lipped' | 'snap' | 'saucer' | 'star' | 'funnel' | 'cross' | 'spurred';
  /** Petals of each floret (star, funnel). */
  floretPetals?: number;
  /** Leaves: their shape, how many up the stem, opposite pairs, a basal rosette. */
  leaf?: LeafShape;
  leaves?: number;
  opposite?: boolean;
  basal?: boolean;
  /** Leaf and stem colour (otherwise a fresh mid green). */
  green?: string;
  /** Stamens round the heart: colour, how many, how long (fraction of a petal). */
  stamens?: { color: string; count: number; length: number };
  /** A speckled throat (foxglove) or a blotch at each petal base (poppy). */
  speckles?: string;
  /** An iris: three falls hanging down (bearded), three standards upright, style arms between. */
  iris?: boolean;
  /** Fine hairs on stems and leaves (a softer, silvery look). */
  hairy?: boolean;
}

export type LeafShape = 'lance' | 'oval' | 'heart' | 'strap' | 'palmate' | 'pinnate' | 'feathery' | 'toothed' | 'round' | 'needle';

const GREEN = new THREE.Color('#4f8a3a');

/**
 * A smooth surface over (t, u), t 0 → 1 along it and u −1 → 1 across, with `rows` × `cols`
 * quads. `shade` gives each corner's brightness; `skip` leaves out torn or missing bits.
 */
export function surface(
  m: FlowerMesh,
  rows: number,
  cols: number,
  at: (t: number, u: number) => THREE.Vector3,
  look: { color: THREE.Color; petal?: boolean; hinge?: THREE.Vector3; axis?: THREE.Vector3; close?: number; glow?: number },
  shade: (t: number, u: number) => number = () => 1,
  edge: (t: number, u: number) => number = () => 0,
  skip: (t: number, u: number) => boolean = () => false,
) {
  const P: THREE.Vector3[][] = [];
  const N: THREE.Vector3[][] = [];
  const e = 1e-3;
  for (let r = 0; r <= rows; r++) {
    P.push([]);
    N.push([]);
    const t = r / rows;
    for (let c = 0; c <= cols; c++) {
      const u = (c / cols) * 2 - 1;
      const p = at(t, u);
      P[r].push(p);
      const dt = at(Math.min(1, t + e), u).sub(at(Math.max(0, t - e), u));
      const du = at(t, Math.min(1, u + e)).sub(at(t, Math.max(-1, u - e)));
      const n = new THREE.Vector3().crossVectors(du, dt);
      if (n.lengthSq() < 1e-14) n.copy(UP);
      N[r].push(n.normalize());
    }
  }
  for (let r = 0; r < rows; r++) {
    const t0 = r / rows;
    const t1 = (r + 1) / rows;
    for (let c = 0; c < cols; c++) {
      const u0 = (c / cols) * 2 - 1;
      const u1 = ((c + 1) / cols) * 2 - 1;
      if (skip((t0 + t1) / 2, (u0 + u1) / 2)) continue;
      const opts = (ts: number[], us: number[], ns: THREE.Vector3[]) => ({
        ...look,
        ns: ns as [THREE.Vector3, THREE.Vector3, THREE.Vector3],
        shade: [shade(ts[0], us[0]), shade(ts[1], us[1]), shade(ts[2], us[2])] as [number, number, number],
        edge: [edge(ts[0], us[0]), edge(ts[1], us[1]), edge(ts[2], us[2])] as [number, number, number],
      });
      m.tri(P[r][c], P[r + 1][c], P[r + 1][c + 1], opts([t0, t1, t1], [u0, u0, u1], [N[r][c], N[r + 1][c], N[r + 1][c + 1]]));
      m.tri(P[r][c], P[r + 1][c + 1], P[r][c + 1], opts([t0, t1, t0], [u0, u1, u1], [N[r][c], N[r + 1][c + 1], N[r][c + 1]]));
    }
  }
}

/** A frame at a point: `along` the direction it grows, `side` across it, `out` its face. */
export function frame(along: THREE.Vector3, hint = UP) {
  const a = along.clone().normalize();
  let side = new THREE.Vector3().crossVectors(a, hint);
  if (side.lengthSq() < 1e-6) side = new THREE.Vector3().crossVectors(a, new THREE.Vector3(1, 0, 0));
  side.normalize();
  const out = new THREE.Vector3().crossVectors(side, a).normalize();
  return { a, side, out };
}

/** A turned (lathed) shape round `axis` from `base`: profile points are [radius, height]. */
export function lathe(
  m: FlowerMesh,
  base: THREE.Vector3,
  axis: THREE.Vector3,
  profile: [number, number][],
  sides: number,
  color: (k: number, a: number) => THREE.Color,
  look: { petal?: boolean; hinge?: THREE.Vector3 } = {},
  wobble: (k: number, a: number) => number = () => 1,
) {
  const f = frame(axis);
  const at = (k: number, a: number) => {
    const n = profile.length - 1;
    const x = Math.min(n - 1e-6, Math.max(0, k * n));
    const i = Math.floor(x);
    const fr = x - i;
    const r = lerp(profile[i][0], profile[Math.min(n, i + 1)][0], fr) * wobble(k, a);
    const h = lerp(profile[i][1], profile[Math.min(n, i + 1)][1], fr);
    return base.clone().addScaledVector(f.a, h).addScaledVector(f.side, Math.cos(a) * r).addScaledVector(f.out, Math.sin(a) * r);
  };
  const rows = profile.length - 1;
  for (let r = 0; r < rows * 2; r++) {
    const k0 = r / (rows * 2);
    const k1 = (r + 1) / (rows * 2);
    for (let s = 0; s < sides; s++) {
      const a0 = (s / sides) * Math.PI * 2;
      const a1 = ((s + 1) / sides) * Math.PI * 2;
      const p = [at(k0, a0), at(k1, a0), at(k1, a1), at(k0, a1)];
      const c = color((k0 + k1) / 2, (a0 + a1) / 2);
      const n = (k: number, a: number) => at(k, a).sub(base).projectOnPlane(f.a).normalize().addScaledVector(f.a, 0.15).normalize();
      const ns = [n(k0, a0), n(k1, a0), n(k1, a1), n(k0, a1)];
      m.tri(p[0], p[1], p[2], { color: c, ns: [ns[0], ns[1], ns[2]], petal: look.petal, hinge: look.hinge });
      m.tri(p[0], p[2], p[3], { color: c, ns: [ns[0], ns[2], ns[3]], petal: look.petal, hinge: look.hinge });
    }
  }
}

/** A round-sectioned tube along `pts`, tapering from r0 to r1. */
export function tube(m: FlowerMesh, pts: THREE.Vector3[], r0: number, r1: number, color: THREE.Color, sides = 7) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const ra = lerp(r0, r1, i / (pts.length - 1));
    const rb = lerp(r0, r1, (i + 1) / (pts.length - 1));
    const f = frame(b.clone().sub(a));
    const ring = (c: THREE.Vector3, r: number, ang: number) => c.clone().addScaledVector(f.side, Math.cos(ang) * r).addScaledVector(f.out, Math.sin(ang) * r);
    const nr = (ang: number) => f.side.clone().multiplyScalar(Math.cos(ang)).addScaledVector(f.out, Math.sin(ang));
    for (let s = 0; s < sides; s++) {
      const a0 = (s / sides) * Math.PI * 2;
      const a1 = ((s + 1) / sides) * Math.PI * 2;
      const shade = 0.88 + 0.12 * Math.sin(a0);
      const c = color.clone().multiplyScalar(shade);
      m.tri(ring(a, ra, a0), ring(b, rb, a0), ring(b, rb, a1), { color: c, ns: [nr(a0), nr(a0), nr(a1)] });
      m.tri(ring(a, ra, a0), ring(b, rb, a1), ring(a, ra, a1), { color: c, ns: [nr(a0), nr(a1), nr(a1)] });
    }
  }
}

/** A small rounded lump (a bud, an anther, a disc floret, a berry). */
export function blob(m: FlowerMesh, at: THREE.Vector3, r: THREE.Vector3, color: THREE.Color, look: { petal?: boolean; hinge?: THREE.Vector3 } = {}, sides = 6) {
  const profile: [number, number][] = [];
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI;
    profile.push([Math.sin(a) * r.x, -Math.cos(a) * r.y]);
  }
  lathe(m, at.clone().addScaledVector(UP, 0), UP, profile, sides, (k) => color.clone().multiplyScalar(0.85 + 0.2 * k), look);
}

/**
 * A leaf of the given shape, from `base` growing along `dir`, `len` long: a midrib fold, a gentle
 * droop, a paler midrib and darker edges; the odd one with a nibbled edge or a browned tip.
 */
export function leaf(m: FlowerMesh, base: THREE.Vector3, dir: THREE.Vector3, len: number, shape: LeafShape, green: THREE.Color, rng: Rng) {
  if (shape === 'palmate') {
    // Fingers spread from one point (lupin, cannabis-like hand): 7 narrow leaflets.
    const n = 7;
    const f = frame(dir);
    for (let i = 0; i < n; i++) {
      const a = ((i / (n - 1)) - 0.5) * 2.4;
      const d = dir.clone().applyAxisAngle(f.out, a).normalize();
      leaf(m, base, d, len * lerp(0.55, 0.75, 1 - Math.abs(a) / 1.4), 'lance', green, rng);
    }
    return;
  }
  if (shape === 'pinnate' || shape === 'feathery') {
    // A midrib with leaflets in pairs (or fine threads, cosmos-like).
    const f = frame(dir);
    tube(m, [base, base.clone().addScaledVector(dir, len)], 0.0015, 0.0008, green, 4);
    const pairs = shape === 'feathery' ? 7 : 5;
    for (let i = 0; i < pairs; i++) {
      const t = (i + 0.6) / (pairs + 0.6);
      const at = base.clone().addScaledVector(dir, len * t);
      for (const sgn of [-1, 1]) {
        const d = dir.clone().multiplyScalar(0.5).addScaledVector(f.side, sgn).normalize();
        if (shape === 'feathery') tube(m, [at, at.clone().addScaledVector(d, len * 0.32 * (1 - t * 0.5))], 0.0012, 0.0004, green, 3);
        else leaf(m, at, d, len * 0.32 * (1 - t * 0.4), 'oval', green, rng);
      }
    }
    return;
  }
  if (shape === 'needle') {
    tube(m, [base, base.clone().addScaledVector(dir, len)], 0.0012, 0.0003, green, 3);
    return;
  }
  const f = frame(dir);
  // Its outline: half-width (fraction of length) at t along.
  const half = (t: number): number => {
    switch (shape) {
      case 'strap':
        return 0.06 * Math.min(1, t * 6) * (1 - Math.max(0, t - 0.85) * 5);
      case 'heart':
        return 0.42 * Math.sin(Math.PI * Math.pow(t, 0.7)) * (t < 0.15 ? 0.6 + t * 2.7 : 1);
      case 'round':
        return 0.48 * Math.sqrt(Math.max(0, Math.sin(Math.PI * t)));
      case 'oval':
        return 0.3 * Math.sin(Math.PI * t);
      case 'toothed':
        return 0.26 * Math.sin(Math.PI * t) * (1 + 0.12 * Math.sign(Math.sin(t * 40)));
      default:
        return 0.16 * Math.sin(Math.PI * Math.pow(t, 0.8));
    }
  };
  const droop = lerp(0.1, 0.35, rng());
  const fold = lerp(0.12, 0.3, rng());
  const nibble = rng() < 0.08 ? lerp(0.3, 0.8, rng()) : -1;
  const brown = rng() < 0.1;
  const tone = green.clone().multiplyScalar(lerp(0.85, 1.12, rng()));
  const at = (t: number, u: number) => {
    const w = half(t) * len;
    return base
      .clone()
      .addScaledVector(f.a, t * len)
      .addScaledVector(UP, -t * t * len * droop)
      .addScaledVector(f.side, u * w)
      .addScaledVector(f.out, Math.abs(u) * w * fold);
  };
  const rows = shape === 'strap' ? 10 : 8;
  surface(
    m,
    rows,
    4,
    at,
    { color: tone },
    (t, u) => (1 - Math.abs(u) * 0.18 + (Math.abs(u) < 0.12 ? 0.12 : 0)) * (brown && t > 0.85 ? 0.7 : 1),
    () => 0,
    (t, u) => nibble > 0 && Math.abs(t - nibble) < 0.08 && u > 0.5,
  );
}

/**
 * The heart of a daisy-like flower: hundreds of tiny florets packed in a Fibonacci spiral,
 * domed; pollen-gold round the outside and green-gold at the heart (or a raised cone).
 */
export function disc(m: FlowerMesh, top: THREE.Vector3, radius: number, kind: NonNullable<HeroHints['disc']>, colors: [string, string], height: number, rng: Rng) {
  const outer = new THREE.Color(colors[0]);
  const inner = new THREE.Color(colors[1]);
  const coned = kind === 'cone' || kind === 'spiky';
  // A cone is a rounded dome (a black-eyed Susan's is about as tall as it is wide), never a spike.
  if (coned) height = Math.min(height, radius * 0.95);
  const n = Math.round(lerp(60, 160, Math.min(1, radius / 0.03)) * (coned ? 1.4 : 1));
  // The base it sits on (for a cone, filling it, so the florets sit on a solid dome).
  if (coned) blob(m, top.clone().add(new THREE.Vector3(0, radius * 0.1, 0)), new THREE.Vector3(radius * 0.98, height * 0.98, radius * 0.98), inner.clone().multiplyScalar(0.7), {}, 12);
  else blob(m, top.clone().add(new THREE.Vector3(0, height * 0.2, 0)), new THREE.Vector3(radius, Math.max(height * 0.4, radius * 0.25), radius), inner.clone().multiplyScalar(0.7), {}, 10);
  for (let i = 0; i < n; i++) {
    const k = Math.sqrt((i + 0.5) / n);
    const a = i * 2.39996;
    const r = k * radius;
    let y = (1 - k * k) * height;
    if (coned) y = Math.sqrt(Math.max(0, 1 - k * k)) * height;
    const p = top.clone().add(new THREE.Vector3(Math.cos(a) * r, y + radius * 0.1, Math.sin(a) * r));
    const c = inner.clone().lerp(outer, Math.pow(k, 1.5)).multiplyScalar(lerp(0.88, 1.08, rng()));
    const s = radius * (kind === 'spiky' ? 0.07 : kind === 'cone' ? 0.075 : 0.055) * lerp(0.8, 1.2, rng());
    if (kind === 'spiky') {
      // Echinacea: stiff orange spines.
      const d = new THREE.Vector3(Math.cos(a) * k, 0.8, Math.sin(a) * k).normalize();
      tube(m, [p, p.clone().addScaledVector(d, s * 3.2)], s * 0.5, s * 0.05, c, 3);
    } else blob(m, p, new THREE.Vector3(s, s * 0.8, s), c, {}, 5);
  }
}

/** Stamens round the heart: fine filaments, each with a pollen-dusted anther. */
export function stamens(m: FlowerMesh, top: THREE.Vector3, ring: number, count: number, length: number, color: THREE.Color, filament: THREE.Color, rng: Rng) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng() * 0.3;
    const r = ring * lerp(0.4, 1, Math.sqrt(rng()));
    const base = top.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    const d = new THREE.Vector3(Math.cos(a) * 0.45, 1, Math.sin(a) * 0.45).normalize();
    const tip = base.clone().addScaledVector(d, length * lerp(0.8, 1.15, rng()));
    tube(m, [base, tip], length * 0.03, length * 0.02, filament, 3);
    blob(m, tip, new THREE.Vector3(length * 0.07, length * 0.11, length * 0.07), color, {}, 4);
  }
}

/**
 * One floret of a spike or cluster, `size` across, at `at`, facing `dir`. White petals take the
 * plant's colour (as the garden flowers do); throats and spots keep their own.
 */
export function floret(m: FlowerMesh, kind: NonNullable<HeroHints['floret']>, at: THREE.Vector3, dir: THREE.Vector3, size: number, petals: number, rng: Rng, speckles?: THREE.Color) {
  const W = new THREE.Color('#ffffff');
  const f = frame(dir);
  const look = { petal: true, hinge: at };
  switch (kind) {
    case 'bell': {
      // Foxglove, bluebell: a tube flaring to a lipped mouth, spotted inside the throat.
      const L = size * 1.4;
      const prof: [number, number][] = [
        [size * 0.14, 0],
        [size * 0.27, L * 0.35],
        [size * 0.33, L * 0.7],
        [size * 0.45, L * 0.92],
        [size * 0.52, L],
      ];
      lathe(m, at, dir, prof, 10, (k) => W.clone().multiplyScalar(0.78 + 0.22 * k), look, (k, a) => 1 + (k > 0.85 ? 0.08 * Math.sin(a * 5) : 0) + (k > 0.8 ? 0.12 * Math.max(0, Math.sin(a)) : 0));
      if (speckles) {
        for (let i = 0; i < 9; i++) {
          const k = lerp(0.45, 0.9, rng());
          const a = -Math.PI / 2 + (rng() - 0.5) * 1.6;
          // On the inside of the lower lip (the bell's own radius there, a touch in).
          const r = lerp(size * 0.27, size * 0.5, (k - 0.35) / 0.65) * 0.88;
          const p = at.clone().addScaledVector(f.a, L * k).addScaledVector(f.side, Math.cos(a) * r).addScaledVector(f.out, Math.sin(a) * r);
          blob(m, p, new THREE.Vector3(size * 0.05, size * 0.05, size * 0.05), speckles, {}, 4);
        }
      }
      return;
    }
    case 'tube':
    case 'lipped': {
      // Lavender, salvia, snapdragon: a slim tube, with a lower lip (and a hood) at the mouth.
      const L = size * 1.3;
      lathe(m, at, dir, [[size * 0.12, 0], [size * 0.18, L * 0.6], [size * 0.24, L]], 6, (k) => W.clone().multiplyScalar(0.8 + 0.2 * k), look);
      const mouth = at.clone().addScaledVector(f.a, L);
      if (kind === 'lipped') {
        petalBlade(m, mouth, f.a.clone().addScaledVector(f.out, -0.9).normalize(), size * 0.9, size * 0.7, 0.3, look, rng);
        petalBlade(m, mouth, f.a.clone().addScaledVector(f.out, 0.6).normalize(), size * 0.7, size * 0.45, -0.4, look, rng);
      } else for (let i = 0; i < 4; i++) petalBlade(m, mouth, f.a.clone().applyAxisAngle(f.a, 0).addScaledVector(f.side.clone().applyAxisAngle(f.a, (i / 4) * Math.PI * 2), 0.9).normalize(), size * 0.38, size * 0.3, 0.1, look, rng);
      return;
    }
    case 'snap': {
      // Snapdragon: a plump pouch, closed by a swollen lower lip (the "jaw", with a golden
      // palate) under a two-lobed upper lip, held close to the spike.
      const L = size * 0.95;
      lathe(m, at, dir, [[size * 0.14, 0], [size * 0.3, L * 0.35], [size * 0.38, L * 0.7], [size * 0.3, L]], 9, (k) => W.clone().multiplyScalar(0.78 + 0.22 * k), look, (_k, a) => 1 + 0.12 * Math.max(0, -Math.sin(a)));
      const mouth = at.clone().addScaledVector(f.a, L * 0.92);
      blob(m, mouth.clone().addScaledVector(f.out, -size * 0.14), new THREE.Vector3(size * 0.3, size * 0.2, size * 0.24), W.clone().multiplyScalar(0.95), look, 7);
      blob(m, mouth.clone().addScaledVector(f.out, -size * 0.05).addScaledVector(f.a, size * 0.12), new THREE.Vector3(size * 0.12, size * 0.07, size * 0.1), new THREE.Color('#f2c230'), {}, 5);
      for (const sgn of [-1, 1]) petalBlade(m, mouth.clone().addScaledVector(f.out, size * 0.12), f.a.clone().addScaledVector(f.out, 0.7).addScaledVector(f.side, sgn * 0.35).normalize(), size * 0.42, size * 0.36, -0.3, look, rng);
      return;
    }
    case 'pea': {
      // Lupin, sweet pea: a broad upright banner, two wings, and a curved keel between them.
      const banner = f.a.clone().addScaledVector(UP, 0.8).normalize();
      petalBlade(m, at, banner, size * 1.1, size * 1.0, 0.35, look, rng);
      for (const sgn of [-1, 1]) petalBlade(m, at, f.a.clone().addScaledVector(f.side, sgn * 0.5).normalize(), size * 0.85, size * 0.45, 0.25, look, rng);
      const keel = at.clone().addScaledVector(f.a, size * 0.45).addScaledVector(UP, -size * 0.1);
      blob(m, keel, new THREE.Vector3(size * 0.15, size * 0.12, size * 0.3), W.clone().multiplyScalar(0.85), look, 6);
      return;
    }
    case 'saucer': {
      // Hollyhock, mallow: a shallow cup of five broad petals overlapping into a saucer, their
      // edges softly frilled, a darker eye and a pale column of stamens in the middle.
      const L = size * 0.32;
      lathe(m, at, dir, [[size * 0.08, 0], [size * 0.22, L * 0.6], [size * 0.3, L]], 10, (k) => W.clone().multiplyScalar(0.6 + 0.4 * k), look);
      const mouth = at.clone().addScaledVector(f.a, L * 0.8);
      const n = petals || 5;
      const off = rng() * Math.PI;
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2 + (rng() - 0.5) * 0.15;
        const d = f.a.clone().multiplyScalar(0.32).addScaledVector(f.side.clone().applyAxisAngle(f.a, a), 1).normalize();
        petalBlade(m, mouth, d, size * 0.62, size * 0.68, 0.12, look, rng);
      }
      tube(m, [mouth, mouth.clone().addScaledVector(f.a, size * 0.22)], size * 0.05, size * 0.04, new THREE.Color('#f4ecc8'), 5);
      blob(m, mouth.clone().addScaledVector(f.a, size * 0.24), new THREE.Vector3(size * 0.07, size * 0.07, size * 0.07), new THREE.Color('#f2dc8a'), {}, 5);
      return;
    }
    case 'funnel': {
      // Gladiolus, petunia, lily: a funnel opening into broad lobes.
      const L = size * 1.2;
      lathe(m, at, dir, [[size * 0.1, 0], [size * 0.25, L * 0.5], [size * 0.4, L]], 8, (k) => W.clone().multiplyScalar(0.72 + 0.28 * k), look);
      const mouth = at.clone().addScaledVector(f.a, L);
      const n = petals || 5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng() * 0.2;
        const d = f.a.clone().multiplyScalar(0.45).addScaledVector(f.side.clone().applyAxisAngle(f.a, a), 1).normalize();
        petalBlade(m, mouth, d, size * 0.85, size * 0.7, 0.15, look, rng);
      }
      return;
    }
    case 'cross':
    case 'star':
    case 'spurred': {
      // Hydrangea (4 sepals), phlox and verbena (5 round), allium and hyacinth (6 points),
      // delphinium (5 and a spur behind).
      const n = kind === 'cross' ? 4 : petals || 5;
      const off = rng() * Math.PI;
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2;
        const d = f.a.clone().multiplyScalar(0.25).addScaledVector(f.side.clone().applyAxisAngle(f.a, a), 1).normalize();
        petalBlade(m, at, d, size * 0.55, size * (kind === 'cross' ? 0.5 : 0.36), 0.1, look, rng);
      }
      blob(m, at.clone().addScaledVector(f.a, size * 0.05), new THREE.Vector3(size * 0.1, size * 0.08, size * 0.1), new THREE.Color('#f2e8b0'), {}, 5);
      if (kind === 'spurred') tube(m, [at, at.clone().addScaledVector(f.a, -size * 0.7).addScaledVector(UP, size * 0.25)], size * 0.12, size * 0.03, W, 5);
      return;
    }
  }
}

/** A small, softly cupped petal blade (for florets), `len` long and `wid` wide. */
export function petalBlade(m: FlowerMesh, base: THREE.Vector3, dir: THREE.Vector3, len: number, wid: number, cup: number, look: { petal?: boolean; hinge?: THREE.Vector3 }, rng: Rng) {
  const f = frame(dir);
  const curl = (rng() - 0.5) * 0.3;
  surface(
    m,
    4,
    3,
    (t, u) =>
      base
        .clone()
        .addScaledVector(f.a, t * len)
        .addScaledVector(f.side, u * wid * 0.5 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)))
        .addScaledVector(f.out, (1 - u * u) * cup * wid * 0.3 + t * t * curl * len),
    { color: new THREE.Color('#ffffff'), petal: look.petal, hinge: look.hinge },
    (t) => 0.8 + 0.2 * t,
    (t) => t,
  );
}

export { GREEN as HERO_GREEN };
