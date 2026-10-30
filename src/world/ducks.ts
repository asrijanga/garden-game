import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise2D } from '../core/noise';
import { createRng, lerp } from '../core/random';

/** Storybook scale, like the birds and bunnies. */
const ADULT = 1.6;
const CHICK = 1.25;
const MIN_POND_CELLS = 150; // ~6 m² of open water

type Rng = () => number;
type Look = 'drake' | 'hen' | 'white' | 'chick' | 'whiteChick';

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

interface Model {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  wings: THREE.Group[];
}

/**
 * A duck (forward +z, the waterline at y = 0): a boat-shaped body riding low, a tail that tips
 * up, a head on a short neck, and folded wings. Ducklings are round balls of fluff with big
 * heads and stubby bills.
 */
function buildDuck(look: Look, rng: Rng): Model {
  const C = (h: string) => new THREE.Color(h);
  const n = createNoise2D(Math.floor(rng() * 1e6));
  const chick = look === 'chick' || look === 'whiteChick';
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const tone = lerp(0.93, 1.06, rng());
  // Body colour by where on the body (x across, y up, z along).
  const bodyCol = (x: number, y: number, z: number): THREE.Color => {
    let c: THREE.Color;
    switch (look) {
      case 'drake':
        c = z > 0.08 && y < 0.07 ? C('#7a4a32') : z < -0.12 ? (y > 0.05 ? C('#2a2a2e') : C('#f1efe8')) : Math.abs(x) > 0.07 && y > 0.04 ? C('#8d8a84') : C('#b9b6ae');
        break;
      case 'hen': {
        const speck = n(x * 60 + z * 40, y * 60 + z * 30) > 0.25 ? 0.72 : 1;
        c = C(y < 0.0 ? '#a88a64' : '#8c6a46').multiplyScalar(speck);
        break;
      }
      case 'white':
        c = C('#f6f3ec');
        break;
      case 'chick':
        c = y > 0.045 || z < -0.05 ? C('#6a4e2e') : C('#f2d45a');
        break;
      default:
        c = C('#fbf3c8');
    }
    return c.multiplyScalar(tone);
  };
  const body = new THREE.Group();
  const hull = chick
    ? new THREE.SphereGeometry(0.06, 11, 8).scale(0.9, 0.85, 1.1).translate(0, 0.03, 0)
    : new THREE.SphereGeometry(0.1, 13, 9).scale(0.95, 0.62, 1.55).translate(0, 0.035, 0);
  const tail = chick
    ? new THREE.ConeGeometry(0.02, 0.03, 5).rotateX(-2.1).translate(0, 0.05, -0.065)
    : new THREE.ConeGeometry(0.045, 0.09, 6).scale(1, 1, 0.5).rotateX(-2.0).translate(0, 0.075, -0.17);
  body.add(new THREE.Mesh(mergeGeometries([paint(hull, bodyCol), paint(tail, (x, y, z) => (look === 'drake' ? C('#f1efe8') : bodyCol(x, y, z)))]), mat));

  // Head and neck, on a pivot at the base of the neck.
  const head = new THREE.Group();
  const headCol = look === 'drake' ? C('#1f6a44') : look === 'hen' ? C('#7a5a3c') : look === 'white' ? C('#f6f3ec') : look === 'chick' ? C('#f2d45a') : C('#fbf3c8');
  const bill = C(look === 'drake' ? '#e2c23a' : look === 'hen' ? '#d68a3a' : look === 'white' ? '#f0a03a' : '#5a4a3a');
  const hr = chick ? 0.042 : 0.048;
  const neck = chick ? null : new THREE.CylinderGeometry(0.028, 0.036, 0.11, 7).translate(0, 0.055, 0);
  const skull = new THREE.SphereGeometry(hr, 10, 8).scale(0.92, 0.95, 1.12).translate(0, chick ? 0.035 : 0.115, chick ? 0.005 : 0.01);
  const beak = new THREE.BoxGeometry(chick ? 0.03 : 0.036, chick ? 0.01 : 0.013, chick ? 0.028 : 0.055).translate(0, chick ? 0.03 : 0.105, chick ? 0.048 : 0.066);
  const eyes = [-1, 1].map((s) => new THREE.SphereGeometry(chick ? 0.009 : 0.008, 5, 4).translate(s * hr * 0.78, chick ? 0.045 : 0.125, chick ? 0.018 : 0.025));
  const stripe = look === 'chick' ? [-1, 1].map((s) => new THREE.SphereGeometry(0.014, 5, 4).scale(0.6, 0.4, 1.4).translate(s * hr * 0.8, 0.038, 0.002)) : [];
  const ring = look === 'drake' ? [new THREE.TorusGeometry(0.031, 0.006, 4, 12).rotateX(Math.PI / 2).translate(0, 0.02, 0)] : [];
  head.add(
    new THREE.Mesh(
      mergeGeometries([
        ...(neck ? [paint(neck, () => (look === 'drake' ? C('#1f6a44') : headCol))] : []),
        paint(skull, (_x, y) => (look === 'hen' && y < 0.11 ? C('#a88a64') : headCol)),
        paint(beak, () => bill),
        ...eyes.map((e) => paint(e, () => C('#141210'))),
        ...stripe.map((e) => paint(e, () => C('#6a4e2e'))),
        ...ring.map((e) => paint(e, () => C('#f6f4ee'))),
      ]),
      mat,
    ),
  );
  head.position.set(0, chick ? 0.06 : 0.07, chick ? 0.045 : 0.115);
  body.add(head);

  // Wings: folded along the back (a darker patch, with the drake's blue speculum), they open to fly.
  const wings: THREE.Group[] = [];
  if (!chick) {
    // A feathered wing: a curved leading edge, and a trailing edge broken into the scallops of
    // the flight feathers (so an open wing reads as feathers, not a flat board).
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.05);
    shape.quadraticCurveTo(0.14, 0.045, 0.25, -0.035);
    const tips = [
      [0.21, -0.07],
      [0.17, -0.055],
      [0.14, -0.085],
      [0.1, -0.068],
      [0.07, -0.09],
      [0.035, -0.072],
    ];
    let px = 0.25;
    for (const [x, z] of tips) {
      shape.quadraticCurveTo((px + x) / 2 + 0.01, z + 0.012, x, z);
      px = x;
    }
    shape.lineTo(0, -0.06);
    shape.closePath();
    const wcol = look === 'white' ? C('#efebe2') : look === 'drake' ? C('#7d7a74') : C('#7a5a3c');
    const tipCol = look === 'white' ? C('#e2ddd2') : look === 'drake' ? C('#5e5b56') : C('#5f4530');
    const wing = new THREE.ShapeGeometry(shape, 6).rotateX(Math.PI / 2);
    // A gentle camber: the wing curves down toward its tip and trailing edge.
    const wp = wing.attributes.position;
    for (let i = 0; i < wp.count; i++) wp.setY(i, -wp.getX(i) * wp.getX(i) * 0.9 - Math.max(0, -wp.getZ(i) - 0.03) * 0.25);
    wing.computeVertexNormals();
    const wgeo = paint(wing, (x, _y, z) => (x > 0.06 && x < 0.13 && z < -0.02 && z > -0.06 && look !== 'white' ? C('#3a5aa8') : z < -0.055 ? tipCol : wcol));
    const wmat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.07, 0.07, 0.03);
      const w = new THREE.Mesh(wgeo, wmat);
      if (s < 0) w.scale.x = -1;
      pivot.add(w);
      body.add(pivot);
      wings.push(pivot);
    }
  }
  const root = new THREE.Group();
  root.add(body);
  root.scale.setScalar((chick ? CHICK : ADULT) * lerp(0.92, 1.08, rng()));
  return { root, body, head, wings };
}

type Act = 'none' | 'dabble' | 'preen' | 'flap' | 'drift' | 'doze' | 'dive' | 'chase' | 'sit';

interface Duck extends Model {
  look: Look;
  chick: boolean;
  /** Who it follows in the line (ducklings), or null (the mother leads, a drake tags along). */
  ahead: Duck | null;
  pos: THREE.Vector2;
  vel: THREE.Vector2;
  yaw: number;
  y: number;
  /** In the water, waddling on land, or flying. */
  mode: 'swim' | 'walk' | 'fly' | 'gone';
  act: Act;
  actT: number;
  actDur: number;
  nextAct: number;
  dart: THREE.Vector2 | null;
  flight: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number } | null;
  /** On foot: where to (a list of points, the last one where it plops into the water). */
  walkTo: THREE.Vector2[];
  phase: number;
  wake: number;
}

interface Family {
  body: number;
  ducks: Duck[];
  mother: Duck;
  target: THREE.Vector2;
  phase: 'arriving' | 'pond' | 'bank' | 'leaving';
  /** Seconds left in this phase (and for the visit). */
  t: number;
  stay: number;
  bankAt: THREE.Vector2 | null;
}

/** What the ducks need to know about the ponds and the garden around them. */
export interface DuckWorld {
  /** Ponds full of water, with roughly how many field cells of open water each has. */
  ponds(): { id: number; cells: number }[];
  /** A random spot of open water (clear of lily pads) on this pond, or null. */
  waterPoint(id: number, rng: Rng): THREE.Vector2 | null;
  /** Can a duck swim here (deep enough, no lily pad)? */
  swimmable(x: number, z: number): boolean;
  /** Which pond is at (x, z), if any. */
  pondAt(x: number, z: number): number | null;
  /** Water level at (x, z), or null on land. */
  level(x: number, z: number): number | null;
  heightAt(x: number, z: number): number;
  /** The nearest dry grass to (x, z), just up the bank (or null if there's nowhere to sit). */
  bank(x: number, z: number): THREE.Vector2 | null;
  /** A point just inside the trees toward (x, z). */
  woods(x: number, z: number): THREE.Vector2;
  /** Is there a reed clump within `r`? (Ducks doze by the reeds.) */
  reedsNear(x: number, z: number, r: number): boolean;
  wake(slot: number, x: number, z: number, yaw: number, strength: number): void;
  splash(x: number, y: number, z: number, count: number, power: number): void;
  quack(at: THREE.Vector3, chick: boolean): void;
  wind(): THREE.Vector2;
  camera(): THREE.Vector3;
}

/**
 * A duck family on a pond: a mother (sometimes with a drake) and a wobbly line of ducklings.
 * They paddle about, dabble tail-up, preen, flap and shake, drift on the breeze and doze by
 * the reeds; the ducklings dart after flies, bob under and pop up, and huddle by their mother.
 * Now and then they waddle up the bank to sit in the grass. The grown-ups fly in low over the
 * trees (and out again); the ducklings walk in from the woods. Each paddler draws a soft V of
 * wake on the water.
 */
export class Ducks {
  readonly group = new THREE.Group();
  private readonly families: Family[] = [];
  private readonly rng = createRng(8282);
  private time = 0;
  private check = 10;
  private ambient = 15;
  private wakeSlot = 0;

  constructor(private readonly world: DuckWorld) {}

  private get all(): Duck[] {
    return this.families.flatMap((f) => f.ducks);
  }

  private make(look: Look, ahead: Duck | null): Duck {
    const m = buildDuck(look, this.rng);
    const d: Duck = {
      ...m, look, chick: look === 'chick' || look === 'whiteChick', ahead,
      pos: new THREE.Vector2(), vel: new THREE.Vector2(), yaw: 0, y: 0, mode: 'swim',
      act: 'none', actT: 0, actDur: 0, nextAct: lerp(3, 8, this.rng()), dart: null, flight: null, walkTo: [], phase: this.rng() * 50, wake: -1,
    };
    this.group.add(m.root);
    return d;
  }

  private arrive(id: number) {
    const landAt = this.world.waterPoint(id, this.rng);
    if (!landAt) return;
    const white = this.rng() < 0.15;
    const mother = this.make(white ? 'white' : 'hen', null);
    const ducks = [mother];
    if (!white && this.rng() < 0.5) ducks.push(this.make('drake', null));
    // The grown-ups glide in low over the trees to the middle of the pond.
    const from = this.world.woods(landAt.x + (this.rng() - 0.5) * 30, landAt.y + (this.rng() - 0.5) * 30);
    for (const [i, d] of ducks.entries()) {
      const start = new THREE.Vector3(from.x + i * 0.8, this.world.heightAt(from.x, from.y) + 6, from.y + i * 0.5);
      const end = new THREE.Vector3(landAt.x + i * 0.5, 0, landAt.y - i * 0.4);
      d.mode = 'fly';
      d.flight = { from: start, to: end, t: -i * 0.4, dur: lerp(4, 5, this.rng()) };
      d.pos.set(start.x, start.z);
      d.root.visible = false;
    }
    // The ducklings come in on foot, in a line, from the edge of the woods to the bank.
    const n = 3 + Math.floor(this.rng() * 4);
    const bank = this.world.bank(landAt.x, landAt.y);
    const edge = this.world.woods(bank?.x ?? landAt.x, bank?.y ?? landAt.y);
    let ahead: Duck = mother;
    for (let i = 0; i < n; i++) {
      const c = this.make(white ? 'whiteChick' : 'chick', ahead);
      c.mode = 'walk';
      c.pos.set(edge.x - i * 0.12, edge.y - i * 0.12);
      if (bank) c.walkTo = [bank.clone(), this.toWater(bank, landAt)];
      else c.walkTo = [landAt.clone()];
      ducks.push(c);
      ahead = c;
    }
    this.families.push({ body: id, ducks, mother, target: landAt.clone(), phase: 'arriving', t: 0, stay: lerp(150, 300, this.rng()), bankAt: null });
  }

  /** The first bit of open water from a bank spot toward the pond. */
  private toWater(from: THREE.Vector2, toward: THREE.Vector2): THREE.Vector2 {
    const d = toward.clone().sub(from);
    const len = d.length();
    d.divideScalar(Math.max(len, 1e-6));
    for (let s = 0.2; s < len; s += 0.15) {
      const p = from.clone().addScaledVector(d, s);
      if (this.world.swimmable(p.x, p.y)) return p.addScaledVector(d, 0.25);
    }
    return toward.clone();
  }

  /** Digging or building beside them: they paddle calmly to the far side. */
  disturb(x: number, z: number) {
    for (const f of this.families) {
      if (f.phase !== 'pond' || f.mother.pos.distanceTo(new THREE.Vector2(x, z)) > 2.2) continue;
      for (let k = 0; k < 8; k++) {
        const p = this.world.waterPoint(f.body, this.rng);
        if (p && p.distanceTo(new THREE.Vector2(x, z)) > 3) {
          f.target = p;
          break;
        }
      }
      for (const d of f.ducks) if (d.act !== 'dive') d.act = 'none';
    }
  }

  /** A tap: the nearest duck quacks softly (and the ducklings peep back). */
  tap(x: number, z: number): boolean {
    let best: Duck | null = null;
    let bestD = 0.6;
    for (const d of this.all) {
      if (d.mode === 'fly' || d.mode === 'gone') continue;
      const dist = d.pos.distanceTo(new THREE.Vector2(x, z));
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    if (!best) return false;
    const at = best.root.position.clone();
    this.world.quack(at, best.chick);
    if (!best.chick) {
      const fam = this.families.find((f) => f.ducks.includes(best!));
      const chicks = fam?.ducks.filter((d) => d.chick) ?? [];
      chicks.slice(0, 3).forEach((c, i) => setTimeout(() => this.world.quack(c.root.position.clone(), true), 350 + i * 180));
    }
    best.act = 'none';
    best.head.rotation.x = -0.3;
    return true;
  }

  /** How lively they are: dozing at night, perky in the rain (set from the time and weather). */
  activity = 1;

  update(dt: number) {
    this.time += dt;
    // Now and then, a family finds a big enough pond that hasn't got one.
    this.check -= dt;
    if (this.check <= 0) {
      this.check = lerp(20, 45, this.rng());
      const free = this.world.ponds().filter((p) => p.cells >= MIN_POND_CELLS && !this.families.some((f) => f.body === p.id));
      if (free.length && this.activity > 0.5 && this.rng() < 0.6) this.arrive(free[Math.floor(this.rng() * free.length)].id);
    }
    // The odd soft quack when you're close by.
    this.ambient -= dt;
    if (this.ambient <= 0) {
      // Chattier in the rain (ducks love it); quiet while they sleep at night.
      this.ambient = lerp(18, 40, this.rng()) / Math.max(0.3, this.activity);
      const cam = this.world.camera();
      const near = this.all.filter((d) => d.mode === 'swim' && d.root.position.distanceTo(cam) < 14);
      if (near.length && this.activity >= 0.4) this.world.quack(near[0].root.position.clone(), near[0].chick);
    }
    for (let i = this.families.length - 1; i >= 0; i--) {
      const f = this.families[i];
      this.family(f, dt);
      if (f.ducks.every((d) => d.mode === 'gone')) {
        for (const d of f.ducks) this.group.remove(d.root);
        this.families.splice(i, 1);
      }
    }
  }

  private family(f: Family, dt: number) {
    const pondGone = !this.world.ponds().some((p) => p.id === f.body);
    f.stay -= dt;
    f.t -= dt;
    const m = f.mother;
    if (f.phase === 'arriving') {
      if (f.ducks.every((d) => d.mode === 'swim')) {
        f.phase = 'pond';
        f.t = lerp(40, 90, this.rng());
      }
    } else if (f.phase === 'pond') {
      if (pondGone || f.stay <= 0) this.leave(f);
      else if (m.pos.distanceTo(f.target) < 0.4 || !this.world.swimmable(f.target.x, f.target.y)) f.target = this.world.waterPoint(f.body, this.rng) ?? f.target;
      // Time for a sit on the bank?
      if (f.phase === 'pond' && f.t <= 0) {
        const bank = this.rng() < 0.6 ? this.world.bank(m.pos.x, m.pos.y) : null;
        if (bank) {
          f.phase = 'bank';
          f.bankAt = bank;
          f.t = lerp(15, 30, this.rng());
          for (const d of f.ducks) {
            if (d.mode !== 'swim') continue;
            const spot = bank.clone().add(new THREE.Vector2((this.rng() - 0.5) * 0.7, (this.rng() - 0.5) * 0.7));
            d.walkTo = [spot];
            d.mode = 'walk';
            d.act = 'none';
          }
        } else f.t = lerp(40, 90, this.rng());
      }
    } else if (f.phase === 'bank') {
      if (f.t <= 0 || pondGone) {
        // Back down to the water (and a plop), or home if the visit's over.
        if (pondGone || f.stay <= 0) this.leave(f);
        else {
          f.phase = 'arriving';
          const water = this.world.waterPoint(f.body, this.rng) ?? f.target;
          f.target = water;
          for (const d of f.ducks) if (d.mode === 'walk') d.walkTo = [this.toWater(d.pos, water)];
        }
      }
    }
    for (const d of f.ducks) this.duck(d, f, dt);
  }

  private leave(f: Family) {
    f.phase = 'leaving';
    const m = f.mother;
    const home = this.world.woods(m.pos.x, m.pos.y);
    for (const d of f.ducks) {
      if (d.mode === 'gone') continue;
      if (d.chick) {
        // Ducklings walk home: up the bank (unless already on it), then off to the trees.
        const bank = d.mode === 'swim' ? this.world.bank(d.pos.x, d.pos.y) : null;
        d.mode = 'walk';
        d.act = 'none';
        d.walkTo = [...(bank ? [bank] : []), home.clone().add(new THREE.Vector2((this.rng() - 0.5) * 0.4, (this.rng() - 0.5) * 0.4))];
      } else {
        // Grown-ups run along the water and lift off, low over the trees.
        const from = new THREE.Vector3(d.pos.x, d.y, d.pos.y);
        const to = new THREE.Vector3(home.x + (this.rng() - 0.5) * 6, this.world.heightAt(home.x, home.y) + 7, home.y + (this.rng() - 0.5) * 6);
        to.addScaledVector(to.clone().sub(from).setY(0).normalize(), 10);
        d.mode = 'fly';
        d.flight = { from, to, t: -lerp(4, 8, this.rng()), dur: lerp(4, 5, this.rng()) }; // after the ducklings are on their way
        d.act = 'none';
        this.world.splash(d.pos.x, d.y, d.pos.y, 6, 0.6);
      }
    }
  }

  private duck(d: Duck, f: Family, dt: number) {
    const t = this.time + d.phase;
    if (d.mode === 'gone') return;
    if (d.mode === 'fly') {
      this.fly(d, f, dt);
      return;
    }
    if (d.mode === 'walk') {
      this.walk(d, f, dt);
      return;
    }
    // --- Swimming ---
    let goal: THREE.Vector2;
    // Asleep at night: barely drifting.
    let speed = (d.chick ? 0.4 : 0.28) * Math.min(1, Math.max(0.2, this.activity));
    if (d.chick && d.ahead) {
      // Keep station a little behind the one ahead (huddled close when mother dozes).
      const a = d.ahead;
      const back = d.ahead.act === 'doze' || f.mother.act === 'doze' ? 0.12 : 0.24;
      goal = a.pos.clone().add(new THREE.Vector2(-Math.sin(a.yaw), -Math.cos(a.yaw)).multiplyScalar(back));
      if (f.mother.act === 'doze') goal.lerp(f.mother.pos, 0.6);
      const gap = d.pos.distanceTo(goal);
      speed = Math.min(0.9, 0.12 + gap * 1.4); // falling behind: hurry
      if (d.dart) {
        goal = d.dart;
        speed = 0.9;
        if (d.pos.distanceTo(d.dart) < 0.08) d.dart = null;
      }
    } else if (!d.chick && d !== f.mother) {
      goal = f.mother.pos.clone().add(new THREE.Vector2(0.5 * Math.cos(t * 0.1), 0.5 * Math.sin(t * 0.1)));
      speed = Math.min(0.4, 0.1 + d.pos.distanceTo(goal) * 0.4);
    } else goal = f.target;

    // Little behaviours.
    d.nextAct -= dt;
    if (d.act !== 'none') {
      d.actT += dt;
      if (d.actT >= d.actDur) d.act = 'none';
    } else if (d.nextAct <= 0 && f.phase === 'pond') {
      d.nextAct = lerp(4, 12, this.rng());
      const r = this.rng();
      const pick = (act: Act, a: number, b: number) => {
        d.act = act;
        d.actT = 0;
        d.actDur = lerp(a, b, this.rng());
      };
      if (d.chick) {
        if (r < 0.25) pick('dive', 0.7, 0.9);
        else if (r < 0.5) {
          d.dart = d.pos.clone().add(new THREE.Vector2((this.rng() - 0.5) * 0.9, (this.rng() - 0.5) * 0.9));
          if (!this.world.swimmable(d.dart.x, d.dart.y)) d.dart = null;
          else pick('chase', 0.8, 1.2);
        }
      } else {
        const near = this.world.reedsNear(d.pos.x, d.pos.y, 0.8);
        if (r < 0.28) pick('dabble', 2, 4);
        else if (r < 0.48) pick('preen', 2, 4);
        else if (r < 0.58) {
          pick('flap', 1.0, 1.2);
          this.world.splash(d.pos.x, d.y, d.pos.y, 8, 0.5);
        } else if (r < 0.75) pick('drift', 4, 8);
        else if (r < 0.88 && (near || d === f.mother)) pick('doze', 8, 16);
      }
    }
    // Paddle toward the goal (unless busy); the breeze nudges everyone.
    const busy = d.act === 'dabble' || d.act === 'doze' || d.act === 'preen' || d.act === 'drift';
    const to = goal.clone().sub(d.pos);
    const dist = to.length();
    const want = new THREE.Vector2();
    if (!busy && dist > 0.05) want.copy(to).divideScalar(dist).multiplyScalar(Math.min(speed, dist * 1.5));
    want.addScaledVector(this.world.wind(), d.act === 'drift' ? 0.06 : 0.02);
    d.vel.lerp(want, 1 - Math.exp(-dt * (d.chick ? 4 : 2)));
    const next = d.pos.clone().addScaledVector(d.vel, dt);
    if (this.world.swimmable(next.x, next.y)) d.pos.copy(next);
    else {
      d.vel.multiplyScalar(0.3);
      if (d === f.mother) f.target = this.world.waterPoint(f.body, this.rng) ?? f.target; // steer round
    }
    const sp = d.vel.length();
    if (sp > 0.03) {
      let dy = Math.atan2(d.vel.x, d.vel.y) - d.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      d.yaw += dy * Math.min(1, dt * (d.chick ? 6 : 3));
    }
    const level = this.world.level(d.pos.x, d.pos.y);
    if (level !== null) d.y = level;
    // A soft V of wake behind it while it's paddling along.
    if (sp > 0.06) {
      if (d.wake < 0) d.wake = this.wakeSlot++ % 8;
      this.world.wake(d.wake, d.pos.x, d.pos.y, d.yaw, Math.min(1, sp * 2.5) * (d.chick ? 0.5 : 1));
    } else if (d.wake >= 0) {
      this.world.wake(d.wake, 0, 0, 0, 0);
      d.wake = -1;
    }
    this.poseSwim(d, t, sp);
  }

  private poseSwim(d: Duck, t: number, sp: number) {
    let pitch = 0;
    let sink = 0;
    let headX = Math.sin(t * (d.chick ? 7 : 3.5)) * 0.06 * Math.min(1, sp * 4); // a little nod as it paddles
    let headY = 0;
    let wingOpen = 0;
    let roll = Math.sin(t * 1.3) * 0.04;
    const k = d.act === 'none' ? 0 : Math.min(1, d.actT / 0.35, (d.actDur - d.actT) / 0.35);
    switch (d.act) {
      case 'dabble': // tail up, head down under the water
        pitch = 1.45 * k;
        sink = 0.02 * k;
        headX = 0.5 * k;
        break;
      case 'preen':
        headX = -0.2 * k;
        headY = (2.4 + Math.sin(t * 6) * 0.25) * k * (Math.sin(d.phase) > 0 ? 1 : -1);
        break;
      case 'flap': // rise up and beat the wings, then shake
        pitch = -0.7 * k;
        wingOpen = k;
        roll = Math.sin(t * 30) * 0.08 * k;
        break;
      case 'doze':
        headX = 0.15 * k;
        headY = 2.6 * k; // tucked back into the feathers
        sink = -0.005 * k;
        break;
      case 'dive': {
        const p = d.actT / d.actDur;
        sink = Math.sin(p * Math.PI) * 0.1; // bob under… and pop up
        pitch = 0.6 * Math.sin(p * Math.PI);
        break;
      }
    }
    d.root.visible = true;
    d.root.position.set(d.pos.x, d.y - sink * d.root.scale.y + Math.sin(t * 2.1) * 0.004, d.pos.y);
    d.root.rotation.set(0, d.yaw, 0);
    d.body.rotation.set(pitch, 0, roll, 'YXZ');
    d.head.rotation.set(headX, headY, 0, 'YXZ');
    this.wings(d, wingOpen, 0.3 + Math.sin(t * 28) * 0.8);
  }

  /** `spread` 0 folded along the back … 1 held out to the sides; `beat` lifts them (radians). */
  private wings(d: Duck, spread: number, beat = 0) {
    if (!d.wings.length) return;
    const fold = 1 - spread;
    d.wings[0].rotation.set(0, -1.45 * fold, 0.35 * fold - beat * spread);
    d.wings[1].rotation.set(0, 1.45 * fold, -0.35 * fold + beat * spread);
  }

  private walk(d: Duck, f: Family, dt: number) {
    const t = this.time + d.phase;
    const target = d.walkTo[0];
    if (!target) {
      // Arrived: sitting in the grass (or, on the way home, slipped into the trees).
      if (f.phase === 'leaving') {
        d.mode = 'gone';
        d.root.visible = false;
        return;
      }
      d.act = 'sit';
      d.root.position.set(d.pos.x, this.world.heightAt(d.pos.x, d.pos.y) + 0.035 * d.root.scale.y, d.pos.y);
      d.body.rotation.set(0, 0, 0);
      d.head.rotation.set(0.1, Math.sin(t * 0.5 + d.phase) * 0.6, 0, 'YXZ');
      return;
    }
    const to = target.clone().sub(d.pos);
    const dist = to.length();
    const speed = d.chick ? 0.32 : 0.22;
    const step = Math.min(dist, speed * dt);
    if (dist > 1e-4) d.pos.addScaledVector(to.divideScalar(dist), step);
    if (dist > 0.02) {
      let dy = Math.atan2(target.x - d.pos.x + 1e-6, target.y - d.pos.y) - d.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      d.yaw += dy * Math.min(1, dt * 6);
    }
    // Reached a point: the last one by the water means plop in.
    if (dist < 0.03) {
      d.walkTo.shift();
      if (!d.walkTo.length && this.world.swimmable(d.pos.x, d.pos.y)) {
        d.mode = 'swim';
        d.act = 'none';
        d.y = this.world.level(d.pos.x, d.pos.y) ?? d.y;
        this.world.splash(d.pos.x, d.y, d.pos.y, d.chick ? 3 : 6, d.chick ? 0.3 : 0.5);
      }
    }
    // A waddle: rocking side to side, bobbing a touch, standing up a little out of the water.
    const level = this.world.level(d.pos.x, d.pos.y);
    const ground = this.world.heightAt(d.pos.x, d.pos.y);
    const y = level !== null && level > ground ? level : ground + 0.03 * d.root.scale.y;
    const w = t * (d.chick ? 16 : 10);
    d.root.visible = true;
    d.root.position.set(d.pos.x, y + Math.abs(Math.sin(w)) * 0.012, d.pos.y);
    d.root.rotation.set(0, d.yaw, 0);
    d.body.rotation.set(-0.15, 0, Math.sin(w) * 0.16, 'YXZ');
    d.head.rotation.set(Math.sin(w * 2) * 0.08, 0, 0, 'YXZ');
    this.wings(d, 0);
    if (d.wake >= 0) {
      this.world.wake(d.wake, 0, 0, 0, 0);
      d.wake = -1;
    }
  }

  private fly(d: Duck, f: Family, dt: number) {
    const fl = d.flight!;
    fl.t += dt;
    if (fl.t < 0) {
      // Waiting its turn (on the water before take-off): just bob.
      this.poseSwim(d, this.time + d.phase, 0);
      return;
    }
    const u = Math.min(1, fl.t / fl.dur);
    const arriving = f.phase !== 'leaving';
    // Arriving: a long shallow glide down onto the water. Leaving: a run along the water and up.
    const e = arriving ? 1 - (1 - u) ** 2 : u * u;
    const p = new THREE.Vector3().lerpVectors(fl.from, fl.to, e);
    const startY = fl.from.y;
    const endY = arriving ? (this.world.level(fl.to.x, fl.to.z) ?? 0) : fl.to.y;
    p.y = lerp(startY, endY, arriving ? Math.min(1, e * 1.1) : e);
    d.pos.set(p.x, p.z);
    d.yaw = Math.atan2(fl.to.x - fl.from.x, fl.to.z - fl.from.z);
    d.root.visible = true;
    d.root.position.copy(p);
    d.root.rotation.set(0, d.yaw, 0);
    d.body.rotation.set(arriving && u > 0.85 ? -0.5 : -0.1, 0, 0, 'YXZ');
    d.head.rotation.set(0.25, 0, 0, 'YXZ');
    // Steady beats; wings held out to glide in at the end, feet down.
    const beat = arriving && u > 0.8 ? 0.35 : 0.1 + Math.sin(this.time * 14 + d.phase) * 0.75;
    this.wings(d, 1, beat);
    if (u >= 1) {
      d.flight = null;
      if (arriving) {
        d.mode = 'swim';
        d.y = endY;
        this.world.splash(p.x, endY, p.z, 10, 0.7);
      } else {
        d.mode = 'gone';
        d.root.visible = false;
      }
    }
  }
}
