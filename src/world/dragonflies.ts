import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng, lerp } from '../core/random';
import type { Season } from './season';

/** Storybook scale: ~25 cm long, so they read from the garden camera. */
const SCALE = 3.4;

const KINDS = [
  { name: 'azure damsel', body: '#3f8fe0', band: '#1c2430', eye: '#2a5aa0', wing: '#dfeefa' },
  { name: 'broad-bodied chaser', body: '#7aa6d8', band: '#2a3a4a', eye: '#3a3a3a', wing: '#f2ead6' },
  { name: 'common darter', body: '#d8452b', band: '#7a2418', eye: '#8a3020', wing: '#f6eee0' },
  { name: 'emperor', body: '#5fb070', band: '#2a4a8a', eye: '#4a8a9a', wing: '#e6f2ee' },
];

function colorize(g: THREE.BufferGeometry, color: (z: number) => THREE.Color): THREE.BufferGeometry {
  const g2 = g.index ? g.toNonIndexed() : g;
  if (g2.attributes.uv) g2.deleteAttribute('uv');
  const p = g2.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = color(p.getZ(i));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g2.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g2;
}

type Kind = (typeof KINDS)[number];

/** A long slender body (banded abdomen), big round eyes, and two pairs of glassy wings. */
function build(kind: Kind) {
  const body = new THREE.Color(kind.body);
  const band = new THREE.Color(kind.band);
  const abdomen = new THREE.CylinderGeometry(0.0022, 0.0016, 0.05, 6, 8).rotateX(Math.PI / 2).translate(0, 0, -0.03);
  const thorax = new THREE.SphereGeometry(0.0045, 7, 5).scale(1, 1, 1.5);
  const eyes = [-1, 1].map((s) => new THREE.SphereGeometry(0.0034, 6, 5).translate(s * 0.0028, 0.001, 0.0075));
  const geo = mergeGeometries([
    colorize(abdomen, (z) => (Math.sin(z * 900) > 0.55 ? band : body)),
    colorize(thorax, () => body.clone().multiplyScalar(0.85)),
    ...eyes.map((e) => colorize(e, () => new THREE.Color(kind.eye))),
  ]);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
  // Wings: four long narrow blades, faintly tinted, with darker tips.
  const blade = new THREE.CircleGeometry(0.5, 12).scale(0.034, 0.0075, 1).translate(0.018, 0, 0).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: kind.wing, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  const wings: THREE.Mesh[] = [];
  for (const z of [0.003, -0.004]) {
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(blade, mat);
      w.position.set(s * 0.002, 0.003, z);
      if (s < 0) w.scale.x = -1;
      w.rotation.y = s * (z > 0 ? -0.12 : 0.18); // forewings swept a touch forward, hind back
      group.add(w);
      wings.push(w);
    }
  }
  group.scale.setScalar(SCALE);
  return { group, wings };
}

interface Dragonfly {
  group: THREE.Group;
  wings: THREE.Mesh[];
  body: number;
  pos: THREE.Vector3;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  hover: number;
  yaw: number;
  /** Dipping to touch the water at the end of this dart. */
  dip: boolean;
  /** Landing on a flower at the end of this dart (and resting there, wings still). */
  perched: boolean;
  leaving: boolean;
  phase: number;
}

/** What the dragonflies need to know about the ponds. */
export interface PondAir {
  /** Ids of ponds that are full of water. */
  bodies(): number[];
  /** A random point on the water of `body` (y = the water level), or null if it's gone. */
  pointOn(body: number, rng: () => number): THREE.Vector3 | null;
  ripple(x: number, z: number, strength: number): void;
  /** Somewhere to land: the top of an open iris, lotus or other water flower (null: none). */
  perch?(rng: () => number): THREE.Vector3 | null;
}

/**
 * Dragonflies patrolling the ponds: they hang in the air, then dart off in a blink to a new
 * spot, now and then dipping down to touch the water and leave a ring. One or two per pond;
 * none in winter.
 */
export class Dragonflies {
  readonly group = new THREE.Group();
  private readonly flies: Dragonfly[] = [];
  private readonly rng = createRng(31337);
  private spawnIn = 3;
  /** How active they are right now (0 at night or in heavy rain … 1), set from the time and weather. */
  activity = 1;

  private time = 0;
  private readonly enabled: boolean;

  constructor(
    season: Season,
    private readonly ponds: PondAir,
  ) {
    this.enabled = season !== 'winter';
  }

  private aim(f: Dragonfly) {
    const p = this.activity > 0.4 ? this.ponds.pointOn(f.body, this.rng) : null;
    if (!p) {
      f.leaving = true;
      f.to.copy(f.pos).add(new THREE.Vector3((this.rng() - 0.5) * 16, 5, (this.rng() - 0.5) * 16));
    } else {
      f.dip = this.rng() < 0.25;
      f.to.copy(p).setY(p.y + (f.dip ? 0.02 : lerp(0.3, 0.75, this.rng())));
      // Now and then, a rest on a flower instead.
      const rest = !f.dip && this.rng() < 0.3 ? this.ponds.perch?.(this.rng) : null;
      f.perched = !!rest;
      if (rest) f.to.copy(rest).setY(rest.y + 0.025);
    }
    f.from.copy(f.pos);
    const d = f.from.distanceTo(f.to);
    f.dur = f.leaving ? 1.5 : Math.max(0.18, d / lerp(4, 7, this.rng()));
    f.t = 0;
    const dx = f.to.x - f.from.x;
    const dz = f.to.z - f.from.z;
    if (dx * dx + dz * dz > 1e-4) f.yaw = Math.atan2(dx, dz);
  }

  update(dt: number) {
    this.time += dt;
    const bodies = this.enabled ? this.ponds.bodies() : [];
    // One per pond, two at most.
    const want = this.activity > 0.4 ? Math.min(2, bodies.length) : 0;
    this.spawnIn -= dt;
    if (this.flies.filter((f) => !f.leaving).length < want && this.spawnIn <= 0) {
      this.spawnIn = lerp(4, 10, this.rng());
      const body = bodies[Math.floor(this.rng() * bodies.length)];
      const at = this.ponds.pointOn(body, this.rng);
      if (at) {
        const kind = KINDS[Math.floor(this.rng() * KINDS.length)];
        const { group, wings } = build(kind);
        const a = this.rng() * Math.PI * 2;
        const pos = at.clone().add(new THREE.Vector3(Math.cos(a) * 6, 3, Math.sin(a) * 6));
        group.position.copy(pos);
        this.group.add(group);
        const f: Dragonfly = { group, wings, body, pos, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, dur: 1, hover: 0, yaw: 0, dip: false, perched: false, leaving: false, phase: this.rng() * 50 };
        this.aim(f);
        f.dur = Math.max(f.dur, 1.2); // a calmer arrival
        this.flies.push(f);
      }
    }

    for (let i = this.flies.length - 1; i >= 0; i--) {
      const f = this.flies[i];
      const t = this.time + f.phase;
      if (f.hover > 0) {
        f.hover -= dt;
        // Hanging in the air, with the tiniest drift (or sitting quite still on a flower).
        if (f.perched) f.group.position.copy(f.to);
        else f.group.position.set(f.to.x + Math.sin(t * 1.7) * 0.02, f.to.y + Math.sin(t * 2.3) * 0.015, f.to.z + Math.cos(t * 1.3) * 0.02);
        f.pos.copy(f.group.position);
        if (f.hover <= 0) {
          f.perched = false;
          if (!f.leaving && (!bodies.includes(f.body) || this.rng() < 0.04 || this.flies.length > want + 1)) f.leaving = true;
          if (f.leaving) f.to.copy(f.pos).add(new THREE.Vector3((this.rng() - 0.5) * 16, 5, (this.rng() - 0.5) * 16));
          if (f.leaving) {
            f.from.copy(f.pos);
            f.dur = 1.5;
            f.t = 0;
            f.yaw = Math.atan2(f.to.x - f.from.x, f.to.z - f.from.z);
          } else this.aim(f);
        }
      } else {
        f.t = Math.min(1, f.t + dt / f.dur);
        // A dart: very quick off the mark, braking hard to stop dead.
        const e = 1 - (1 - f.t) ** 3;
        f.pos.lerpVectors(f.from, f.to, e);
        f.group.position.copy(f.pos);
        if (f.t >= 1) {
          if (f.leaving) {
            this.group.remove(f.group);
            this.flies.splice(i, 1);
            continue;
          }
          if (f.dip) {
            this.ponds.ripple(f.to.x, f.to.z, 0.35);
            f.dip = false;
            f.to.y += lerp(0.3, 0.6, this.rng()); // bounce back up off the water
            f.from.copy(f.pos);
            f.dur = 0.25;
            f.t = 0;
          } else f.hover = f.perched ? lerp(3, 8, this.rng()) : lerp(0.6, 3, this.rng());
        }
      }
      // Turn quickly to face the way it's going; nose down a touch when darting.
      let dy = f.yaw - f.group.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      f.group.rotation.y += dy * Math.min(1, dt * 18);
      f.group.rotation.x = f.hover > 0 ? 0.05 : 0.18;
      // Wings blur: fast, small beats, the two pairs out of step.
      for (let w = 0; w < 4; w++) {
        const side = w % 2 ? 1 : -1;
        // (Resting on a flower: wings held still, flat out.)
        const beat = f.perched && f.hover > 0 ? 0.04 : Math.sin(this.time * 60 + (w < 2 ? 0 : 1.6)) * 0.45;
        f.wings[w].rotation.z = side * beat;
      }
    }
  }
}
