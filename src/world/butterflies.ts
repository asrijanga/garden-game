import * as THREE from 'three';
import { createRng, lerp } from '../core/random';
import type { Season } from './season';

/** Storybook scale: wings ~20 cm across, so they read from the garden camera. */
const SCALE = 3.6;
const MAX = 7;

type Paint = (u: number, r: number) => THREE.Color;

interface Kind {
  name: string;
  /** Wing colour at a point: u runs front (0) to back (1) round the wing, r from body (0) to edge (1). */
  paint: Paint;
  size: number;
  body: string;
  /** Some only come out in some seasons. */
  seasons: Season[];
}

const c = (hex: string) => new THREE.Color(hex);
const KINDS: Kind[] = [
  {
    name: 'cabbage white', size: 0.95, body: '#3a3a36', seasons: ['spring', 'summer', 'autumn'],
    paint: (u, r) => (u < 0.35 && r > 0.82 ? c('#3a3834') : u < 0.5 && r > 0.45 && r < 0.6 && Math.abs(u - 0.3) < 0.06 ? c('#3a3834') : c('#f5f2e6')),
  },
  {
    name: 'brimstone', size: 1.05, body: '#7a7a3a', seasons: ['spring', 'summer', 'autumn'],
    paint: (_u, r) => (r < 0.2 ? c('#d8d060') : c('#f2e46a')),
  },
  {
    name: 'orange tip', size: 0.9, body: '#3a3a36', seasons: ['spring', 'summer'],
    paint: (u, r) => (u < 0.45 && r > 0.55 ? (r > 0.9 ? c('#3a3834') : c('#f28a2a')) : c('#f7f4ea')),
  },
  {
    name: 'common blue', size: 0.8, body: '#2a2e40', seasons: ['spring', 'summer', 'autumn'],
    paint: (_u, r) => (r > 0.92 ? c('#f4f4f0') : r > 0.84 ? c('#3a3c48') : c('#7f9ff0').lerp(c('#a6b8f6'), r * 0.6)),
  },
  {
    name: 'red admiral', size: 1.1, body: '#24201c', seasons: ['summer', 'autumn'],
    paint: (u, r) => {
      if (u < 0.45 && r > 0.8 && Math.sin(u * 40) > 0.3) return c('#f4f1e8');
      if (u < 0.5 && r > 0.45 && r < 0.68) return c('#d8452b');
      if (u > 0.6 && r > 0.82) return c('#d8452b');
      return c('#2a2420');
    },
  },
  {
    name: 'peacock', size: 1.1, body: '#3a2420', seasons: ['spring', 'summer', 'autumn'],
    paint: (u, r) => {
      const eye = (u0: number, r0: number, k: number) => Math.hypot((u - u0) * 1.6, r - r0) < k;
      if (eye(0.22, 0.78, 0.09)) return eye(0.22, 0.78, 0.045) ? c('#4a68b0') : c('#f0d08a');
      if (eye(0.78, 0.74, 0.1)) return eye(0.78, 0.74, 0.05) ? c('#2a3048') : c('#6a7aa8');
      return r > 0.93 ? c('#4a3028') : c('#b8462e');
    },
  },
];

/**
 * One wing pair's half (forewing + hindwing) as a fan of triangles from the body, coloured per
 * vertex by the kind's pattern. Lies in the xz plane, reaching out along +x.
 */
function wingGeometry(kind: Kind): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const outline: [number, number][] = [];
  // A forewing (rounded triangle, swept forward) then a softer, rounder hindwing.
  const N = 18;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const a = lerp(0.2, 2.7, u); // angle from forward (+z), round through the side (+x) to the back
    const L = u < 0.5 ? 0.026 * (0.55 + 0.45 * Math.sin((Math.PI * u) / 0.5)) : 0.02 * (0.6 + 0.4 * Math.sin((Math.PI * (u - 0.5)) / 0.5));
    outline.push([Math.sin(a) * L, Math.cos(a) * L]);
  }
  const RINGS = 7;
  const vert = (u: number, r: number) => {
    const i = Math.min(N, Math.round(u * N));
    const [x, z] = outline[i];
    return [x * r, 0, z * r];
  };
  for (let i = 0; i < N; i++) {
    const u0 = i / N;
    const u1 = (i + 1) / N;
    for (let k = 0; k < RINGS; k++) {
      const r0 = k / RINGS;
      const r1 = (k + 1) / RINGS;
      const quad = [[u0, r0], [u1, r0], [u1, r1], [u0, r0], [u1, r1], [u0, r1]];
      for (const [u, r] of quad) {
        pos.push(...vert(u, r));
        const cl = kind.paint(u, r);
        col.push(cl.r, cl.g, cl.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

interface Fly {
  kind: Kind;
  group: THREE.Group;
  wings: THREE.Object3D[];
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  target: THREE.Vector3;
  state: 'flying' | 'resting' | 'leaving';
  rest: number;
  flap: number;
  heading: number;
  phase: number;
}

/**
 * Butterflies dancing over the garden: cabbage whites, brimstones, orange tips, blues, red
 * admirals and peacocks (by season). Each flutters in a wandering, bobbing line from bloom to
 * bloom (bed flowers or the wild meadow), rests with its wings slowly opening and closing, and
 * moves on. More flowers, more butterflies.
 */
export class Butterflies {
  readonly group = new THREE.Group();
  private readonly flies: Fly[] = [];
  private readonly rng = createRng(777);
  private spawnIn = 3;
  private time = 0;
  private readonly kinds: Kind[];
  private readonly geos = new Map<Kind, THREE.BufferGeometry>();
  private readonly wingMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  private readonly v = new THREE.Vector3();

  constructor(
    season: Season,
    /** Somewhere to land: a random open bloom (and how many there are, roughly). */
    private readonly bloom: (rng: () => number) => THREE.Vector3 | null,
    private readonly bloomCount: () => number,
    private readonly edgePoint: (angle: number) => THREE.Vector3,
  ) {
    this.kinds = KINDS.filter((k) => k.seasons.includes(season));
  }

  private build(kind: Kind) {
    let geo = this.geos.get(kind);
    if (!geo) this.geos.set(kind, (geo = wingGeometry(kind)));
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.0022, 0.016, 2, 5).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: kind.body }));
    group.add(body);
    const wings = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      const w = new THREE.Mesh(geo, this.wingMat);
      if (s < 0) w.scale.x = -1;
      pivot.add(w);
      group.add(pivot);
      return pivot;
    });
    group.scale.setScalar(SCALE * kind.size * lerp(0.9, 1.1, this.rng()));
    return { group, wings };
  }

  update(dt: number) {
    this.time += dt;
    const blooms = this.bloomCount();
    const want = this.kinds.length && blooms ? Math.min(MAX, 1 + Math.floor(blooms / 60)) : 0;
    this.spawnIn -= dt;
    if (this.flies.length < want && this.spawnIn <= 0) {
      this.spawnIn = lerp(2, 7, this.rng());
      const target = this.bloom(this.rng);
      if (target) {
        const kind = this.kinds[Math.floor(this.rng() * this.kinds.length)];
        const { group, wings } = this.build(kind);
        const pos = this.edgePoint(this.rng() * Math.PI * 2).add(this.v.set(0, 1, 0));
        group.position.copy(pos);
        this.group.add(group);
        this.flies.push({ kind, group, wings, pos: pos.clone(), vel: new THREE.Vector3(), target: target.clone(), state: 'flying', rest: 0, flap: 0, heading: 0, phase: this.rng() * 100 });
      }
    }

    for (let i = this.flies.length - 1; i >= 0; i--) {
      const f = this.flies[i];
      const t = this.time + f.phase;
      let open: number; // wing angle: 0 flat open, ~1.4 closed above the back
      if (f.state === 'resting') {
        f.rest -= dt;
        // Basking: wings slowly open and close.
        open = 0.25 + (Math.sin(t * 1.3) * 0.5 + 0.5) * 1.1;
        f.pos.copy(f.target);
        if (f.rest <= 0) {
          if (this.rng() < 0.15 || this.flies.length > want) {
            f.state = 'leaving';
            f.target = this.edgePoint(this.rng() * Math.PI * 2).add(this.v.set(0, 2.5, 0));
          } else {
            const next = this.bloom(this.rng);
            if (next) {
              f.target.copy(next);
              f.state = 'flying';
            } else f.rest = 2;
          }
        }
      } else {
        // A wandering, bobbing flutter: aim at the target, but drift and swing about on the way.
        const to = this.v.copy(f.target).sub(f.pos);
        const dist = to.length();
        const want = Math.atan2(to.x, to.z) + Math.sin(t * 0.9) * 0.9 * Math.min(1, dist / 1.5) + Math.sin(t * 2.7) * 0.4;
        let dh = want - f.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        f.heading += dh * Math.min(1, dt * 2.5);
        const speed = Math.min(1.1, 0.35 + dist * 0.6);
        f.flap += dt * 11;
        // Each downstroke gives a little lift: a fluttery up-and-down.
        const lift = Math.max(0, Math.sin(f.flap)) * 1.2 - 0.45;
        const climb = dist < 0.8 ? (f.target.y + 0.05 - f.pos.y) * 3 : (f.target.y + 0.9 - f.pos.y) * 0.8;
        f.vel.set(Math.sin(f.heading) * speed, lift + climb, Math.cos(f.heading) * speed);
        f.pos.addScaledVector(f.vel, dt);
        open = 0.3 + Math.sin(f.flap) * 1.0;
        if (f.state === 'flying' && dist < 0.08) {
          f.state = 'resting';
          f.rest = lerp(2, 7, this.rng());
        } else if (f.state === 'leaving' && dist < 0.6) {
          this.group.remove(f.group);
          this.flies.splice(i, 1);
          continue;
        }
      }
      f.group.position.copy(f.pos);
      f.group.rotation.set(f.state === 'resting' ? 0 : -0.25, f.state === 'resting' ? f.group.rotation.y : f.heading, 0, 'YXZ');
      f.wings[0].rotation.z = -open;
      f.wings[1].rotation.z = open;
    }
  }
}
