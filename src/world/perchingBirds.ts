import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng, lerp } from '../core/random';

/** Somewhere a bird can sit: a fence post, a hedge top, the cottage ridge, a birdhouse roof, the lawn. */
export interface Perch {
  pos: THREE.Vector3;
  /** Which way the perch runs (birds sit across a ridge or rail, facing either side). */
  yaw: number;
  /** False once the thing it's on has gone (erased, rebuilt). */
  alive: () => boolean;
  /** On the ground: the bird hops about and pecks. */
  ground?: boolean;
}

interface Kind {
  name: string;
  back: string;
  breast: string;
  head: string;
  wing: string;
  beak: string;
  size: number;
}

const KINDS: Kind[] = [
  { name: 'robin', back: '#8a6a4a', breast: '#e4733a', head: '#8a6a4a', wing: '#7a5c40', beak: '#3a3028', size: 1 },
  { name: 'blue tit', back: '#8aa25a', breast: '#f0d548', head: '#4a7ccf', wing: '#5a86c8', beak: '#2e2a26', size: 0.85 },
  { name: 'sparrow', back: '#9a7650', breast: '#cfc5b4', head: '#7a6a5a', wing: '#8a6038', beak: '#4a3a2a', size: 0.95 },
  { name: 'goldfinch', back: '#c8a878', breast: '#efe2c8', head: '#d8443a', wing: '#2e2a26', beak: '#e8d8c0', size: 0.85 },
  { name: 'blackbird', back: '#2a2624', breast: '#34302c', head: '#2a2624', wing: '#221f1d', beak: '#f2a52a', size: 1.2 },
];

/** Storybook scale, like the bees: real songbirds would be specks from the garden camera. */
const SCALE = 2.2;
const LEG = 0.026;

function paint(g: THREE.BufferGeometry, color: (x: number, y: number, z: number) => THREE.Color): THREE.BufferGeometry {
  const g2 = g.index ? g.toNonIndexed() : g;
  if (g2.attributes.uv) g2.deleteAttribute('uv');
  const p = g2.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = color(p.getX(i), p.getY(i), p.getZ(i));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g2.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g2;
}

/** A plump little songbird (forward +z, feet at the origin), plus its head and wings as parts. */
function buildBird(kind: Kind, rng: () => number) {
  const back = new THREE.Color(kind.back);
  const breast = new THREE.Color(kind.breast);
  const head = new THREE.Color(kind.head);
  const dark = new THREE.Color('#2a2420');
  const body = new THREE.SphereGeometry(0.045, 10, 8).scale(1, 0.92, 1.3).translate(0, LEG + 0.04, 0);
  const tail = new THREE.BoxGeometry(0.034, 0.006, 0.07).translate(0, 0, -0.03).rotateX(-0.35).translate(0, LEG + 0.045, -0.05);
  const legs = [-1, 1].map((s) => new THREE.CylinderGeometry(0.003, 0.003, LEG + 0.01, 4).translate(s * 0.014, (LEG + 0.01) / 2, 0.004));
  const bodyGeo = mergeGeometries([
    paint(body, (_x, y, z) => (y - LEG - 0.04 < -0.005 + z * 0.3 ? breast : back)),
    paint(tail, () => back.clone().multiplyScalar(0.85)),
    ...legs.map((l) => paint(l, () => dark)),
  ]);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const group = new THREE.Group();
  const bodyMesh = new THREE.Mesh(bodyGeo, mat);
  group.add(bodyMesh);

  const headGeo = mergeGeometries([
    paint(new THREE.SphereGeometry(0.031, 9, 7), (_x, y, z) => (kind.name === 'goldfinch' && z > 0.012 ? head : kind.name === 'goldfinch' ? new THREE.Color('#f4efe4') : kind.name === 'robin' && z > 0.01 && y < 0.008 ? breast : head)),
    paint(new THREE.ConeGeometry(0.008, 0.024, 5).rotateX(Math.PI / 2).translate(0, -0.002, 0.038), () => new THREE.Color(kind.beak)),
    ...[-1, 1].map((s) => paint(new THREE.SphereGeometry(0.0055, 5, 4).translate(s * 0.021, 0.008, 0.019), () => new THREE.Color('#141210'))),
  ]);
  const headPivot = new THREE.Group();
  headPivot.position.set(0, LEG + 0.085, 0.045);
  headPivot.add(new THREE.Mesh(headGeo, mat));
  group.add(headPivot);

  // Wings: a soft teardrop that folds against the flank when perched and spreads to fly.
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0.03);
  wingShape.quadraticCurveTo(0.07, 0.035, 0.11, -0.01);
  wingShape.quadraticCurveTo(0.06, -0.04, 0, -0.035);
  wingShape.closePath();
  const wingGeo = paint(new THREE.ShapeGeometry(wingShape, 6).rotateX(Math.PI / 2), (x) => new THREE.Color(kind.wing).multiplyScalar(x > 0.07 ? 0.8 : 1));
  const wingMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const wings = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.04, LEG + 0.062, 0.02);
    const w = new THREE.Mesh(wingGeo, wingMat);
    if (s < 0) w.scale.x = -1;
    pivot.add(w);
    group.add(pivot);
    return pivot;
  });
  group.scale.setScalar(SCALE * kind.size * lerp(0.92, 1.08, rng()));
  return { group, body: bodyMesh, head: headPivot, wings };
}

type State = 'arriving' | 'perched' | 'leaving';

interface Bird {
  kind: Kind;
  group: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Group;
  wings: THREE.Group[];
  state: State;
  perch: Perch | null;
  /** Flight: from, to, the arc's height, progress and duration. */
  from: THREE.Vector3;
  to: THREE.Vector3;
  arc: number;
  t: number;
  dur: number;
  yaw: number;
  stay: number;
  next: number;
  hop: number;
  peck: number;
  headTurn: number;
  headWant: number;
  flap: number;
}

/**
 * Songbirds that drop in to sit on what you've built: fence posts and rails, hedge tops, the
 * cottage ridge, birdhouses and lanterns, or the lawn, where they hop about and peck. They
 * look round, flick their tails, chirp now and then, and fly off after a while (or at once,
 * if their perch is taken away). More places to sit bring more birds.
 */
export class PerchingBirds {
  readonly group = new THREE.Group();
  private readonly birds: Bird[] = [];
  private readonly rng = createRng(4242);
  private spawnIn = 4;
  private time = 0;
  private readonly v = new THREE.Vector3();

  constructor(
    private readonly perches: () => Perch[],
    private readonly edgePoint: (angle: number) => THREE.Vector3,
    private readonly onChirp: (at: THREE.Vector3) => void,
  ) {}

  /** A free perch (no other bird within a hand's width). */
  private pickPerch(list: Perch[]): Perch | null {
    for (let i = 0; i < 10 && list.length; i++) {
      const p = list[Math.floor(this.rng() * list.length)];
      if (this.birds.some((b) => b.perch && b.perch !== p && b.to.distanceToSquared(p.pos) < 0.35 * 0.35)) continue;
      if (this.birds.some((b) => b.perch === p)) continue;
      return p;
    }
    return null;
  }

  private fly(b: Bird, to: THREE.Vector3, speed: number) {
    b.from.copy(b.group.position);
    b.to.copy(to);
    const d = b.from.distanceTo(b.to);
    b.dur = Math.max(0.5, d / speed);
    b.arc = Math.min(2.5, 0.3 + d * 0.18);
    b.t = 0;
  }

  update(dt: number) {
    this.time += dt;
    const list = this.perches();
    const built = list.filter((p) => !p.ground).length;
    // A bird or two on an empty lawn; more as there's more to sit on.
    const want = Math.min(6, 1 + Math.floor(built / 5));
    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawnIn = lerp(4, 12, this.rng());
      const perch = this.birds.length < want ? this.pickPerch(list) : null;
      if (perch) {
        const kind = KINDS[Math.floor(this.rng() * KINDS.length)];
        const parts = buildBird(kind, this.rng);
        const start = this.edgePoint(this.rng() * Math.PI * 2).add(this.v.set(0, 3 + this.rng() * 3, 0));
        parts.group.position.copy(start);
        const b: Bird = { kind, ...parts, state: 'arriving', perch, from: new THREE.Vector3(), to: new THREE.Vector3(), arc: 0, t: 0, dur: 1, yaw: 0, stay: 0, next: 0, hop: 0, peck: 0, headTurn: 0, headWant: 0, flap: this.rng() * 10 };
        this.fly(b, perch.pos, lerp(3.5, 4.5, this.rng()));
        this.group.add(parts.group);
        this.birds.push(b);
      }
    }

    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i];
      if (b.state === 'perched') {
        this.perched(b, dt, list);
      } else {
        b.t = Math.min(1, b.t + dt / b.dur);
        const u = b.t;
        // Ease in and out, along an arc; the last stretch is a gentle glide down.
        const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
        const p = this.v.lerpVectors(b.from, b.to, e);
        p.y += Math.sin(Math.PI * u) * b.arc;
        const dx = b.to.x - b.from.x;
        const dz = b.to.z - b.from.z;
        if (dx * dx + dz * dz > 1e-4) b.yaw = Math.atan2(dx, dz);
        b.group.position.copy(p);
        b.group.rotation.set(0, b.yaw, 0);
        // Flap hard to rise, glide in the middle, flare to land.
        b.flap += dt * (u > 0.85 ? 10 : u < 0.3 ? 26 : 16);
        const beat = u > 0.85 ? 0.9 + Math.sin(b.flap) * 0.4 : u > 0.45 && u < 0.7 ? 0.15 + Math.sin(b.flap) * 0.15 : Math.sin(b.flap) * 1.1;
        b.wings[0].rotation.set(0, 0, -beat);
        b.wings[1].rotation.set(0, 0, beat);
        b.head.rotation.set(0, 0, 0);
        if (b.t >= 1) {
          if (b.state === 'leaving') {
            this.group.remove(b.group);
            this.birds.splice(i, 1);
            continue;
          }
          if (!b.perch || !b.perch.alive()) {
            this.leave(b);
            continue;
          }
          b.state = 'perched';
          b.stay = b.perch.ground ? lerp(6, 16, this.rng()) : lerp(10, 28, this.rng());
          b.next = lerp(0.4, 1.2, this.rng());
          b.hop = 0.25; // a little settle on landing
          b.flap = 0;
          // Sit across the perch, facing one side or the other (or wherever, on the lawn).
          b.yaw = b.perch.ground ? b.yaw : b.perch.yaw + (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) + (this.rng() - 0.5) * 0.6;
        }
      }
    }
  }

  private leave(b: Bird) {
    b.state = 'leaving';
    b.perch = null;
    this.fly(b, this.edgePoint(this.rng() * Math.PI * 2).add(this.v.set(0, 4 + this.rng() * 3, 0)), lerp(4, 5, this.rng()));
  }

  private perched(b: Bird, dt: number, list: Perch[]) {
    const perch = b.perch!;
    b.stay -= dt;
    if (!perch.alive()) {
      this.leave(b); // startled: its perch is gone
      return;
    }
    if (b.stay <= 0) {
      // Off to somewhere else in the garden, or away into the trees.
      const next = this.rng() < 0.4 ? this.pickPerch(list) : null;
      if (next) {
        b.state = 'arriving';
        b.perch = next;
        this.fly(b, next.pos, lerp(3, 4, this.rng()));
      } else this.leave(b);
      return;
    }
    b.next -= dt;
    if (b.next <= 0) {
      b.next = lerp(0.5, 2.0, this.rng());
      const r = this.rng();
      if (perch.ground && r < 0.35) {
        b.peck = 0.35; // peck at the grass
      } else if (perch.ground && r < 0.6) {
        // Hop a step or two across the lawn.
        b.yaw += (this.rng() - 0.5) * 2;
        b.hop = 0.22;
        perch.pos.x += Math.sin(b.yaw) * 0.12;
        perch.pos.z += Math.cos(b.yaw) * 0.12;
      } else if (r < 0.7) {
        b.headWant = (this.rng() - 0.5) * 2.2; // look round
      } else if (r < 0.82) {
        b.yaw += (this.rng() < 0.5 ? 1 : -1) * lerp(0.5, Math.PI, this.rng()); // hop round
        b.hop = 0.22;
      } else if (r < 0.9) {
        this.onChirp(b.group.position);
        b.headWant = (this.rng() - 0.5) * 0.6;
        b.peck = -0.3; // head up to sing
      } else {
        b.flap = 0.35; // a quick shuffle of the wings
      }
    }
    b.headTurn += (b.headWant - b.headTurn) * Math.min(1, dt * 14);
    b.hop = Math.max(0, b.hop - dt);
    const hopY = b.hop > 0 ? Math.sin((b.hop / 0.22) * Math.PI) * 0.05 : 0;
    b.group.position.set(perch.pos.x, perch.pos.y + hopY, perch.pos.z);
    // Pecking tips the whole bird forward; singing tips it back.
    let tilt = 0;
    if (b.peck > 0) {
      b.peck = Math.max(0, b.peck - dt);
      tilt = Math.sin((b.peck / 0.35) * Math.PI) * 0.7;
    } else if (b.peck < 0) {
      b.peck = Math.min(0, b.peck + dt);
      tilt = -Math.sin((b.peck / -0.3) * Math.PI) * 0.35;
    }
    b.group.rotation.set(tilt, b.yaw, 0, 'YXZ');
    b.head.rotation.set(0, b.headTurn, 0);
    // Wings folded along the flanks (a quick flutter now and then); a breath of a tail flick.
    // (Folded: turned to point back along the body, tips drooping a little.)
    let lift = 0;
    if (b.flap > 0 && b.flap < 0.36) {
      b.flap = Math.max(0, b.flap - dt);
      lift = Math.abs(Math.sin(b.flap * 40)) * 0.5;
    }
    b.wings[0].rotation.set(0, -1.4 + lift, 0.3 - lift);
    b.wings[1].rotation.set(0, 1.4 - lift, -0.3 + lift);
    b.body.rotation.x = Math.sin(this.time * 2.3 + b.flap) * 0.02;
  }
}
