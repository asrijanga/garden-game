import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng, lerp } from '../core/random';

/** Storybook scale, like the birds and bees, so a bunny reads from the garden camera. */
const ADULT = 1.7;
const BABY = 0.95;
const COATS = [
  { coat: '#b89a72', belly: '#e8dccb' }, // sandy brown
  { coat: '#8f8272', belly: '#d8d0c4' }, // grey-brown
  { coat: '#a47e5a', belly: '#e6d4bc' }, // warm brown
  { coat: '#e6d6ba', belly: '#f4ece0' }, // cream
];
const WHITE = { coat: '#f4f1ea', belly: '#fbf9f4' };

type Rng = () => number;

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

interface Body {
  root: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  ears: THREE.Group[];
  tail: THREE.Mesh;
}

/** A round, soft rabbit (forward +z, feet at the origin). Babies are rounder, with bigger heads. */
function buildBunny(coat: { coat: string; belly: string }, baby: boolean, rng: Rng): Body {
  const c = new THREE.Color(coat.coat).multiplyScalar(lerp(0.94, 1.05, rng()));
  const b = new THREE.Color(coat.belly);
  const dark = new THREE.Color('#2a2220');
  const pink = new THREE.Color('#e9a3a6');
  const fur = (y: number, z: number, y0: number) => (y < y0 + z * 0.15 ? b : c);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });

  const torsoGeo = mergeGeometries([
    paint(new THREE.SphereGeometry(0.1, 12, 9).scale(0.85, 0.78, 1.25).translate(0, 0.095, -0.01), (_x, y, z) => fur(y, z, 0.06)),
    ...[-1, 1].map((s) => paint(new THREE.SphereGeometry(0.068, 9, 7).scale(0.8, 1, 1.2).translate(s * 0.052, 0.07, -0.05), (_x, y) => (y < 0.035 ? b : c))),
    ...[-1, 1].map((s) => paint(new THREE.SphereGeometry(0.022, 6, 5).scale(1, 0.7, 1.6).translate(s * 0.03, 0.015, 0.085), () => b)),
  ]);
  const torso = new THREE.Group();
  torso.add(new THREE.Mesh(torsoGeo, mat));
  const tail = new THREE.Mesh(paint(new THREE.SphereGeometry(baby ? 0.032 : 0.028, 8, 6), () => new THREE.Color('#fbf8f2')), mat);
  tail.position.set(0, 0.11, -0.13);
  torso.add(tail);

  const hs = baby ? 1.22 : 1; // babies: bigger heads for their size
  const headGeo = mergeGeometries([
    paint(new THREE.SphereGeometry(0.06, 11, 8).scale(0.92, 0.88, 1.08), (_x, y, z) => (z > 0.035 && y < -0.005 ? b : c)),
    paint(new THREE.SphereGeometry(0.026, 7, 5).scale(1.2, 0.8, 0.9).translate(0, -0.02, 0.05), () => b),
    paint(new THREE.SphereGeometry(0.008, 5, 4).translate(0, -0.006, 0.066), () => pink),
    ...[-1, 1].map((s) => paint(new THREE.SphereGeometry(0.011, 6, 5).translate(s * 0.036, 0.012, 0.035), () => dark)),
  ]);
  const head = new THREE.Group();
  head.position.set(0, 0.17, 0.1);
  head.scale.setScalar(hs);
  head.add(new THREE.Mesh(headGeo, mat));
  torso.add(head);

  const earLen = baby ? 0.8 : 1;
  const earGeo = mergeGeometries([
    paint(new THREE.SphereGeometry(0.022, 7, 6).scale(1, 3.3 * earLen, 0.45).translate(0, 0.066 * earLen, 0), () => c),
    paint(new THREE.SphereGeometry(0.014, 6, 5).scale(1, 3.6 * earLen, 0.3).translate(0, 0.064 * earLen, 0.007), () => pink),
  ]);
  const ears = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.024, 0.04, -0.012);
    pivot.add(new THREE.Mesh(earGeo, mat));
    head.add(pivot);
    return pivot;
  });
  const root = new THREE.Group();
  root.add(torso);
  root.scale.setScalar((baby ? BABY : ADULT) * lerp(0.92, 1.08, rng()));
  return { root, torso, head, ears, tail };
}

type Act = 'none' | 'sit' | 'nibble' | 'look' | 'wash' | 'lie' | 'binky';

interface Bunny extends Body {
  baby: boolean;
  parent: Bunny | null;
  /** Where a baby likes to keep, relative to its parent (behind and to one side). */
  slot: THREE.Vector2;
  pos: THREE.Vector2;
  yaw: number;
  /** A hop in progress: from, to, progress (0..1), duration. */
  hop: { from: THREE.Vector2; to: THREE.Vector2; t: number; dur: number; h: number; yaw0: number; yaw1: number } | null;
  pause: number;
  hopsLeft: number;
  act: Act;
  actT: number;
  actDur: number;
  look: number;
  lookWant: number;
  earTwitch: [number, number];
  /** Hopping away from a finger (a few quicker hops), or out of the garden. */
  flee: THREE.Vector2 | null;
  phase: number;
}

interface Family {
  members: Bunny[];
  leader: Bunny;
  target: THREE.Vector2;
  stay: number;
  leaving: boolean;
}

/** What the bunnies need to know about the garden. */
export interface BunnyWorld {
  heightAt(x: number, z: number): number;
  /** Can a bunny sit here? (Lawn, paths and bed edges: not ponds, stones, walls or the cottage.) */
  walkable(x: number, z: number): boolean;
  /** A spot just inside the trees at this angle round the clearing. */
  edge(angle: number): THREE.Vector2;
  /** Somewhere nice to wander to: open lawn, or the edge of a flower bed (null: anywhere). */
  wander(rng: Rng): THREE.Vector2 | null;
  /** Is this out among the trees (where the family can slip away)? */
  inWoods(x: number, z: number): boolean;
}

/**
 * Bunny families: a grown-up or two and a few fluffy babies, who now and then hop out of the
 * woods, wander the lawn and the edges of the beds, sit up and look about, nibble, wash, lie
 * in the sun, and hop home again. Babies bounce after their parent with quick, clumsy little
 * hops (and the odd happy binky). Draw or plant right beside them and they lollop a few hops
 * away; tap one and it sits up to look at you.
 */
export class Bunnies {
  readonly group = new THREE.Group();
  private readonly families: Family[] = [];
  private readonly rng = createRng(5151);
  private nextFamily: number;
  private time = 0;
  private readonly v = new THREE.Vector2();

  constructor(private readonly world: BunnyWorld) {
    this.nextFamily = lerp(25, 60, this.rng());
  }

  private get all(): Bunny[] {
    return this.families.flatMap((f) => f.members);
  }

  private make(coat: { coat: string; belly: string }, baby: boolean, parent: Bunny | null, at: THREE.Vector2): Bunny {
    const body = buildBunny(coat, baby, this.rng);
    const side = this.rng() < 0.5 ? -1 : 1;
    const b: Bunny = {
      ...body, baby, parent,
      slot: new THREE.Vector2(side * lerp(0.15, 0.45, this.rng()), -lerp(0.3, 0.7, this.rng())),
      pos: at.clone().add(new THREE.Vector2((this.rng() - 0.5) * 0.6, (this.rng() - 0.5) * 0.6)),
      yaw: 0, hop: null, pause: this.rng() * 0.5, hopsLeft: 0, act: 'none', actT: 0, actDur: 0, look: 0, lookWant: 0, earTwitch: [0, 0], flee: null, phase: this.rng() * 50,
    };
    this.group.add(body.root);
    return b;
  }

  private spawn() {
    const a = this.rng() * Math.PI * 2;
    const at = this.world.edge(a);
    const coat = this.rng() < 0.08 ? WHITE : COATS[Math.floor(this.rng() * COATS.length)];
    const leader = this.make(coat, false, null, at);
    const members = [leader];
    // Sometimes a second grown-up; two to four babies, mostly like their parent.
    if (this.rng() < 0.35) members.push(this.make(this.rng() < 0.5 ? coat : COATS[Math.floor(this.rng() * COATS.length)], false, leader, at));
    const babies = 2 + Math.floor(this.rng() * 3);
    for (let i = 0; i < babies; i++) members.push(this.make(this.rng() < 0.75 ? coat : COATS[Math.floor(this.rng() * COATS.length)], true, leader, at));
    for (const m of members) m.yaw = Math.atan2(-at.x, -at.y); // facing into the garden
    this.families.push({ members, leader, target: this.world.wander(this.rng) ?? new THREE.Vector2(), stay: lerp(90, 180, this.rng()), leaving: false });
  }

  /** A finger drawing or planting at (x, z): bunnies close by lollop a few hops away. */
  disturb(x: number, z: number, r = 1.4) {
    for (const b of this.all) {
      const d = b.pos.distanceTo(this.v.set(x, z));
      if (d > r * (b.baby ? 1.3 : 1)) continue;
      const away = b.pos.clone().sub(this.v).normalize();
      if (!isFinite(away.x)) away.set(1, 0);
      b.flee = away;
      b.hopsLeft = 3 + Math.floor(this.rng() * 2);
      b.act = 'none';
      b.pause = Math.min(b.pause, 0.1);
    }
  }

  /** A tap at (x, z): a bunny right there sits up and looks toward `from` (the camera). */
  tap(x: number, z: number, from: THREE.Vector3): boolean {
    let best: Bunny | null = null;
    let bestD = 0.55;
    for (const b of this.all) {
      const d = b.pos.distanceTo(this.v.set(x, z));
      if (d < bestD && !b.hop) {
        bestD = d;
        best = b;
      }
    }
    if (!best) return false;
    best.act = 'sit';
    best.actT = 0;
    best.actDur = lerp(2.5, 4, this.rng());
    best.hopsLeft = 0;
    let turn = Math.atan2(from.x - best.pos.x, from.z - best.pos.y) - best.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    best.lookWant = THREE.MathUtils.clamp(turn, -1.1, 1.1);
    best.pause = best.actDur;
    return true;
  }

  update(dt: number) {
    this.time += dt;
    this.nextFamily -= dt;
    if (this.nextFamily <= 0) {
      if (this.families.length < 2) this.spawn();
      this.nextFamily = lerp(120, 260, this.rng());
    }
    for (let f = this.families.length - 1; f >= 0; f--) {
      const fam = this.families[f];
      fam.stay -= dt;
      if (!fam.leaving && fam.stay <= 0) {
        fam.leaving = true;
        fam.target = this.world.edge(Math.atan2(fam.leader.pos.y, fam.leader.pos.x) + (this.rng() - 0.5));
      }
      // The leader wanders: a new spot once it's reached the last one.
      if (!fam.leaving && fam.leader.pos.distanceTo(fam.target) < 0.5) fam.target = this.world.wander(this.rng) ?? fam.target;
      for (const b of fam.members) this.step(b, fam, dt);
      // Home: once the grown-ups are in the trees, the family is gone.
      const lead = fam.leader.pos;
      if (fam.leaving && this.world.inWoods(lead.x, lead.y) && lead.distanceTo(fam.target) < 0.6 && fam.members.every((m) => this.world.inWoods(m.pos.x, m.pos.y) || m.pos.distanceTo(lead) < 1.2)) {
        for (const m of fam.members) this.group.remove(m.root);
        this.families.splice(f, 1);
      }
    }
  }

  /** Where this bunny wants to go now (or null: stay put). */
  private goal(b: Bunny, fam: Family): THREE.Vector2 | null {
    if (b.flee) return b.pos.clone().addScaledVector(b.flee, 2);
    if (b === fam.leader) return fam.target;
    const p = b.parent ?? fam.leader;
    // Keep to its spot behind the parent (turned with the parent).
    const c = Math.cos(p.yaw);
    const s = Math.sin(p.yaw);
    const spot = new THREE.Vector2(p.pos.x + b.slot.x * c + b.slot.y * s, p.pos.y - b.slot.x * s + b.slot.y * c);
    return b.pos.distanceTo(spot) > (b.baby ? 0.3 : 0.6) ? spot : null;
  }

  private step(b: Bunny, fam: Family, dt: number) {
    const t = this.time + b.phase;
    if (b.hop) {
      const h = b.hop;
      h.t = Math.min(1, h.t + dt / h.dur);
      this.pose(b, h.t);
      if (h.t >= 1) {
        b.pos.copy(h.to);
        b.yaw = h.yaw1;
        b.hop = null;
        b.hopsLeft--;
        // Followers that have fallen behind hurry to catch up; the leader ambles.
        const behind = b !== fam.leader && !b.flee && (this.goal(b, fam)?.distanceTo(b.pos) ?? 0) > 0.9;
        b.pause = b.flee || behind ? lerp(0.03, 0.12, this.rng()) : b.baby ? lerp(0.05, 0.35, this.rng()) : b === fam.leader ? lerp(0.35, 0.9, this.rng()) : lerp(0.2, 0.7, this.rng());
        if (b.hopsLeft <= 0 && b.flee) b.flee = null;
      }
    } else {
      b.pause -= dt;
      if (b.act !== 'none') {
        b.actT += dt;
        if (b.actT >= b.actDur) b.act = 'none';
      }
      const goal = this.goal(b, fam);
      if (b.pause <= 0 && (b.act === 'none' || b.flee)) {
        const far = goal ? goal.distanceTo(b.pos) : 0;
        if (goal && far > 0.25 && (b.hopsLeft > 0 || b.parent || fam.leaving || b.flee || this.rng() < 0.45)) {
          if (b.hopsLeft <= 0) b.hopsLeft = b.baby ? 2 + Math.floor(this.rng() * 4) : 2 + Math.floor(this.rng() * 4);
          this.startHop(b, goal, fam);
        } else {
          this.idle(b);
        }
      }
      this.pose(b, -1);
    }
    // Always: the nose twitches, ears flick now and then, the head turns toward what it's watching.
    b.look += (b.lookWant - b.look) * Math.min(1, dt * 6);
    for (let e = 0; e < 2; e++) {
      if (b.earTwitch[e] > 0) b.earTwitch[e] = Math.max(0, b.earTwitch[e] - dt);
      else if (this.rng() < dt * 0.25) b.earTwitch[e] = 0.25;
    }
    b.head.position.y = 0.17 + Math.sin(t * 22) * 0.0012;
  }

  private startHop(b: Bunny, goal: THREE.Vector2, fam: Family) {
    const want = Math.atan2(goal.x - b.pos.x, goal.y - b.pos.y);
    const clumsy = b.baby ? (this.rng() - 0.5) * 0.7 : (this.rng() - 0.5) * 0.3;
    const far = b !== fam.leader && goal.distanceTo(b.pos) > 0.9;
    const len = (b.baby ? lerp(0.16, 0.26, this.rng()) : lerp(0.26, 0.42, this.rng())) * (b.flee ? 1.3 : far ? 1.25 : 1);
    // Find a clear landing, turning a little further each try (never into a pond or onto stones).
    for (const turn of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4]) {
      const a = want + clumsy + turn;
      const to = new THREE.Vector2(b.pos.x + Math.sin(a) * len, b.pos.y + Math.cos(a) * len);
      // Going home, the woods are fine; otherwise, keep to the garden.
      if (!this.world.walkable(to.x, to.y) && !(fam.leaving && this.world.inWoods(to.x, to.y))) continue;
      const dur = (b.baby ? lerp(0.26, 0.34, this.rng()) : lerp(0.38, 0.48, this.rng())) * (b.flee ? 0.85 : 1);
      b.hop = { from: b.pos.clone(), to, t: 0, dur, h: (b.baby ? 0.06 : 0.09) * (b.flee ? 1.2 : 1), yaw0: b.yaw, yaw1: a };
      return;
    }
    // Hemmed in: if it's the leader, it'll pick somewhere else to go.
    if (b === fam.leader && !fam.leaving) fam.target = this.world.wander(this.rng) ?? fam.target;
    b.pause = 0.6;
    b.hopsLeft = 0;
  }

  private idle(b: Bunny) {
    b.hopsLeft = 0;
    const r = this.rng();
    const acts: [Act, number, number][] = b.baby
      ? [['look', 0.8, 2], ['nibble', 1.5, 3], ['binky', 0.55, 0.55], ['sit', 1, 2], ['wash', 1, 2]]
      : [['look', 1.2, 3], ['nibble', 2, 5], ['sit', 2, 4], ['wash', 1.5, 3], ['lie', 5, 10]];
    const weights = b.baby ? [0.3, 0.3, 0.12, 0.14, 0.14] : [0.28, 0.32, 0.18, 0.12, 0.1];
    let acc = 0;
    let pick = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i];
      if (r < acc) {
        pick = i;
        break;
      }
    }
    const [act, d0, d1] = acts[pick];
    b.act = act;
    b.actT = 0;
    b.actDur = lerp(d0, d1, this.rng());
    b.pause = b.actDur;
    b.lookWant = act === 'look' ? (this.rng() - 0.5) * 2 : act === 'sit' ? (this.rng() - 0.5) * 0.8 : 0;
  }

  /** Set the body for this moment: mid-hop (u in 0..1) or between hops (u < 0). */
  private pose(b: Bunny, u: number) {
    const t = this.time + b.phase;
    let x = b.pos.x;
    let z = b.pos.y;
    let lift = 0;
    let pitch = 0;
    let sy = 1;
    let sz = 1;
    let earBack = 0.15;
    let headPitch = 0;
    let roll = 0;
    let yaw = b.yaw;
    if (u >= 0 && b.hop) {
      const h = b.hop;
      // Crouch, spring, fly, land, settle.
      let dy = h.yaw1 - h.yaw0;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      yaw = h.yaw0 + dy * Math.min(1, u * 3);
      if (u < 0.18) {
        const k = u / 0.18;
        sy = 1 - 0.14 * k;
        sz = 1 + 0.06 * k;
        pitch = 0.1 * k;
        earBack = 0.15 + 0.2 * k;
      } else if (u < 0.85) {
        const k = (u - 0.18) / 0.67;
        const e = k * k * (3 - 2 * k);
        x = lerp(h.from.x, h.to.x, e);
        z = lerp(h.from.y, h.to.y, e);
        lift = Math.sin(k * Math.PI) * h.h;
        sy = 1.08 - Math.abs(k - 0.5) * 0.12;
        sz = 1.1 - Math.abs(k - 0.5) * 0.15;
        pitch = lerp(-0.35, 0.3, k); // nose up as it springs, down as it lands
        earBack = 0.6 + Math.sin(k * Math.PI) * 0.3;
      } else {
        const k = (u - 0.85) / 0.15;
        x = h.to.x;
        z = h.to.y;
        sy = 0.88 + 0.12 * k;
        sz = 1.05 - 0.05 * k;
        pitch = 0.15 * (1 - k);
        earBack = 0.5 - 0.35 * k;
      }
    } else {
      const k = b.act === 'none' ? 0 : Math.min(1, b.actT / 0.3, (b.actDur - b.actT) / 0.3);
      switch (b.act) {
        case 'sit':
          pitch = -0.75 * k;
          lift = 0.025 * k; // up on its haunches (the tail stays clear of the grass)
          sy = 1 + 0.12 * k;
          earBack = 0.05;
          headPitch = 0.5 * k;
          break;
        case 'nibble':
          headPitch = 0.55 * k + Math.sin(t * 18) * 0.05 * k;
          pitch = 0.12 * k;
          break;
        case 'wash':
          pitch = -0.55 * k;
          lift = 0.015 * k;
          headPitch = (0.7 + Math.sin(t * 9) * 0.25) * k;
          roll = Math.sin(t * 4.5) * 0.18 * k;
          earBack = 0.35;
          break;
        case 'lie':
          sy = 1 - 0.22 * k;
          sz = 1 + 0.12 * k;
          earBack = 0.15 + 0.9 * k;
          headPitch = 0.12 * k;
          break;
        case 'binky': {
          // A happy leap with a twist in the air.
          const p = b.actT / b.actDur;
          lift = Math.sin(Math.min(1, p) * Math.PI) * 0.12;
          roll = Math.sin(p * Math.PI * 2) * 0.5;
          yaw += Math.sin(p * Math.PI) * 0.6;
          earBack = 0.6;
          break;
        }
      }
    }
    b.root.position.set(x, this.world.heightAt(x, z) + lift * b.root.scale.y, z);
    b.root.rotation.set(0, yaw, 0);
    b.torso.rotation.set(pitch, 0, roll, 'YXZ');
    // Squash and stretch about the feet.
    b.torso.scale.set(1 / Math.sqrt(sy * sz), sy, sz);
    b.head.rotation.set(headPitch - pitch * 0.6, b.look, 0, 'YXZ');
    b.ears[0].rotation.set(-earBack - b.earTwitch[0] * 1.2, 0, 0.22);
    b.ears[1].rotation.set(-earBack - b.earTwitch[1] * 1.2, 0, -0.22);
  }
}
