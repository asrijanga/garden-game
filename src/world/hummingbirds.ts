import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng, lerp } from '../core/random';
import type { Season } from './season';
import type { Perch } from './perchingBirds';

/** Storybook scale, like the other creatures. */
const SCALE = 3.0;
const MAX = 3;

const KINDS = [
  { name: 'ruby-throated', back: '#3f8a4a', belly: '#e8e6dc', throat: '#e0203a', spec: '#ff6a7a' },
  { name: 'violet-green', back: '#2f9a6a', belly: '#f0f0e8', throat: '#8a3ae0', spec: '#c08aff' },
  { name: 'rufous', back: '#c8682a', belly: '#f2e2c8', throat: '#ff5a1a', spec: '#ffb070' },
  { name: 'emerald', back: '#2aa060', belly: '#7ac88a', throat: '#2ae0a0', spec: '#9affd8' },
];

/** Tubular, bright flowers they love most (others will do in a pinch). */
const FAVOURITE: Record<string, number> = { salvia: 3, foxglove: 3, lavender: 1.5, tulip: 1, dahlia: 0.6, cosmos: 0.5, anemone: 0.5 };

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

/** A tiny hummingbird (forward +z): sleek body, round head, a long fine bill, a jewel throat, blurred wings. */
function build(kind: (typeof KINDS)[number]) {
  const back = new THREE.Color(kind.back);
  const belly = new THREE.Color(kind.belly);
  const body = mergeGeometries([
    paint(new THREE.SphereGeometry(0.012, 9, 7).scale(0.85, 0.85, 1.7), (_x, y) => (y > -0.002 ? back : belly)),
    paint(new THREE.SphereGeometry(0.0095, 8, 6).translate(0, 0.006, 0.018), (_x, y) => (y > 0.004 ? back : belly)),
    paint(new THREE.ConeGeometry(0.0016, 0.03, 4).rotateX(Math.PI / 2).translate(0, 0.005, 0.04), () => new THREE.Color('#1a1614')),
    paint(new THREE.ConeGeometry(0.008, 0.024, 5).scale(1, 1, 0.25).rotateX(-Math.PI / 2 - 0.25).translate(0, 0.002, -0.026), () => back.clone().multiplyScalar(0.7)),
    ...[-1, 1].map((s) => paint(new THREE.SphereGeometry(0.0022, 5, 4).translate(s * 0.0072, 0.009, 0.023), () => new THREE.Color('#0e0c0a'))),
  ]);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(body, new THREE.MeshLambertMaterial({ vertexColors: true })));
  // The gorget: glossy, so it flashes as the bird turns to the light.
  const throat = new THREE.Mesh(
    new THREE.SphereGeometry(0.0085, 8, 6, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.4).scale(1, 0.8, 1).rotateX(-0.5).translate(0, 0.004, 0.02),
    new THREE.MeshPhongMaterial({ color: kind.throat, specular: kind.spec, shininess: 70, emissive: kind.throat, emissiveIntensity: 0.15 }),
  );
  group.add(throat);
  // Wings: soft translucent blurs, beating too fast to see.
  const wingMat = new THREE.MeshBasicMaterial({ color: '#e8f0f0', transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
  const wingGeo = new THREE.CircleGeometry(0.5, 12).scale(0.034, 0.012, 1).translate(0.017, 0, 0).rotateX(-Math.PI / 2);
  const wings = [-1, 1].map((s) => {
    const w = new THREE.Mesh(wingGeo, wingMat);
    w.position.set(s * 0.006, 0.008, 0.004);
    if (s < 0) w.scale.x = -1;
    group.add(w);
    return w;
  });
  group.scale.setScalar(SCALE * lerp(0.92, 1.08, Math.random()));
  return { group, wings };
}

type State = 'darting' | 'sipping' | 'backing' | 'perched' | 'watching' | 'chasing' | 'leaving';

interface Hummer {
  group: THREE.Group;
  wings: THREE.Mesh[];
  pos: THREE.Vector3;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  yaw: number;
  face: number;
  state: State;
  hold: number;
  /** The flower it's feeding at. */
  bloom: THREE.Vector3 | null;
  visits: number;
  phase: number;
  rival: Hummer | null;
  /** Darting to a perch (rather than a flower) for a rest. */
  perching: boolean;
}

export interface HummingbirdWorld {
  beds(): { pos: THREE.Vector3; species: string }[];
  edge(angle: number): THREE.Vector3;
  perches(): Perch[];
  camera(): THREE.Vector3;
  chip(at: THREE.Vector3): void;
}

/**
 * Hummingbirds: jewel-bright, tiny, and quick. They zip in from the woods, stop dead in front
 * of a flower (salvia and foxglove above all), hover perfectly still to sip with their long
 * bills, back off and dart to the next; now and then two have a squabbling chase, or one
 * pauses on a perch. Only when there are open flowers; none in winter.
 */
export class Hummingbirds {
  readonly group = new THREE.Group();
  private readonly birds: Hummer[] = [];
  private readonly rng = createRng(4747);
  private spawnIn = 8;
  /** How active they are right now (0 at night or in heavy rain … 1), set from the time and weather. */
  activity = 1;

  private time = 0;
  private readonly cap: number;
  private readonly v = new THREE.Vector3();

  constructor(
    season: Season,
    private readonly world: HummingbirdWorld,
  ) {
    this.cap = season === 'winter' ? 0 : season === 'autumn' ? 1 : MAX;
  }

  /** How loud their wing-hum should be at `ear` (0 when none is close). */
  humNear(ear: THREE.Vector3): number {
    let level = 0;
    for (const b of this.birds) level = Math.max(level, 1 - b.pos.distanceTo(ear) / 6);
    return Math.max(0, level) ** 2;
  }

  private pickBloom(from: THREE.Vector3): THREE.Vector3 | null {
    const beds = this.world.beds();
    let best: THREE.Vector3 | null = null;
    let score = -Infinity;
    for (let k = 0; k < 10 && beds.length; k++) {
      const b = beds[Math.floor(this.rng() * beds.length)];
      const d = b.pos.distanceTo(from);
      if (d < 0.2) continue;
      const sc = (FAVOURITE[b.species] ?? 0.2) - d * 0.12 + this.rng();
      if (sc > score) {
        score = sc;
        best = b.pos;
      }
    }
    return best;
  }

  /** Hover point in front of a bloom: a bill's length out, at its height, on a random side. */
  private hoverAt(bloom: THREE.Vector3, h: Hummer) {
    const a = this.rng() * Math.PI * 2;
    h.face = a + Math.PI; // facing the flower
    return bloom.clone().add(this.v.set(Math.sin(a) * 0.14, 0.03, Math.cos(a) * 0.14));
  }

  private dart(h: Hummer, to: THREE.Vector3, speed = 5) {
    h.from.copy(h.pos);
    h.to.copy(to);
    h.t = 0;
    h.dur = Math.max(0.25, h.from.distanceTo(h.to) / speed);
  }

  private spawn() {
    const beds = this.world.beds();
    const strong = beds.filter((b) => (FAVOURITE[b.species] ?? 0) >= 1).length;
    if (beds.length < 6) return;
    const kind = KINDS[Math.floor(this.rng() * KINDS.length)];
    const { group, wings } = build(kind);
    const start = this.world.edge(this.rng() * Math.PI * 2).add(this.v.set(0, 2, 0));
    const h: Hummer = { group, wings, pos: start.clone(), from: start.clone(), to: start.clone(), t: 1, dur: 1, yaw: 0, face: 0, state: 'darting', hold: 0, bloom: null, visits: 3 + Math.floor(this.rng() * (strong ? 6 : 3)), phase: this.rng() * 10, rival: null, perching: false };
    const bloom = this.pickBloom(start);
    if (!bloom) return;
    h.bloom = bloom;
    this.dart(h, this.hoverAt(bloom, h), 6);
    this.group.add(group);
    this.birds.push(h);
  }

  /** A stroke nearby: it zips off a few metres, and comes back later. */
  disturb(x: number, z: number) {
    for (const h of this.birds) {
      if (h.state === 'leaving' || Math.hypot(h.pos.x - x, h.pos.z - z) > 2) continue;
      const a = Math.atan2(h.pos.x - x, h.pos.z - z) + (this.rng() - 0.5);
      h.state = 'darting';
      h.bloom = null;
      h.perching = false;
      this.dart(h, h.pos.clone().add(this.v.set(Math.sin(a) * 3.5, 1.2, Math.cos(a) * 3.5)), 6);
    }
  }

  /** A tap: the nearest one stops and hovers, turned to look at you. */
  tap(p: THREE.Vector3): boolean {
    const h = this.birds.find((b) => b.state !== 'leaving' && Math.hypot(b.pos.x - p.x, b.pos.z - p.z) < 0.8);
    if (!h) return false;
    h.state = 'watching';
    h.hold = 2.5;
    const cam = this.world.camera();
    h.face = Math.atan2(cam.x - h.pos.x, cam.z - h.pos.z);
    this.world.chip(h.pos);
    return true;
  }

  update(dt: number) {
    this.time += dt;
    const beds = this.world.beds().length;
    const want = beds >= 6 && this.activity > 0.4 ? Math.min(this.cap, 1 + Math.floor(beds / 90)) : 0;
    this.spawnIn -= dt;
    if (this.birds.length < want && this.spawnIn <= 0) {
      this.spawnIn = lerp(10, 30, this.rng());
      this.spawn();
    }
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const h = this.birds[i];
      const t = this.time + h.phase;
      let tiltX = 0;
      if (h.state === 'darting' || h.state === 'backing' || h.state === 'leaving' || h.state === 'chasing') {
        h.t = Math.min(1, h.t + dt / h.dur);
        // Off like a shot, and a sudden stop.
        const e = h.state === 'backing' ? h.t * (2 - h.t) : 1 - (1 - h.t) ** 4;
        h.pos.lerpVectors(h.from, h.to, e);
        if (h.state === 'chasing') h.pos.y += Math.sin(h.t * Math.PI * 3) * 0.15;
        const dx = h.to.x - h.from.x;
        const dz = h.to.z - h.from.z;
        if (h.state !== 'backing' && dx * dx + dz * dz > 1e-4) h.face = Math.atan2(dx, dz);
        tiltX = h.state === 'backing' ? -0.2 : 0.35 * (1 - h.t);
        if (h.t >= 1) this.arrived(h, i);
        if (!this.birds.includes(h)) continue;
      } else {
        h.hold -= dt;
        // Hovering dead still (a hair of drift); sipping: little dips of the bill into the flower.
        const sip = h.state === 'sipping' ? Math.max(0, Math.sin(t * 5)) * 0.02 : 0;
        const k = h.state === 'perched' ? 0 : 1;
        h.group.position.set(h.pos.x + Math.sin(t * 2.1) * 0.006 * k + Math.sin(h.face) * sip, h.pos.y + Math.sin(t * 3.3) * 0.006 * k, h.pos.z + Math.cos(h.face) * sip);
        if (h.hold <= 0) this.next(h);
      }
      if (h.state !== 'sipping' && h.state !== 'watching' && h.state !== 'perched') h.group.position.copy(h.pos);
      let dy = h.face - h.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      h.yaw += dy * Math.min(1, dt * 14);
      h.group.rotation.set(tiltX - 0.35, h.yaw, 0, 'YXZ'); // hovering birds hold their bodies upright-ish
      // Wings: a blur (perched: folded away).
      const perched = h.state === 'perched';
      const beat = Math.sin(this.time * 90 + h.phase) * 0.9;
      h.wings[0].visible = h.wings[1].visible = true;
      h.wings[0].rotation.set(0, perched ? -1.3 : 0, perched ? 0.2 : -beat);
      h.wings[1].rotation.set(0, perched ? 1.3 : 0, perched ? -0.2 : beat);
    }
  }

  private arrived(h: Hummer, i: number) {
    switch (h.state) {
      case 'leaving':
        this.group.remove(h.group);
        this.birds.splice(i, 1);
        if (h.rival) h.rival.rival = null;
        return;
      case 'darting':
        if (h.perching) {
          h.perching = false;
          h.state = 'perched';
          h.hold = lerp(3, 6, this.rng());
        } else if (h.bloom) {
          h.state = 'sipping';
          h.hold = lerp(1.2, 3, this.rng());
        } else this.next(h);
        return;
      case 'chasing':
        h.rival = null;
        this.next(h);
        return;
      case 'backing':
        this.next(h, true);
        return;
    }
  }

  /** What next: back away from the flower, then another flower, a chase, a rest, or home. */
  private next(h: Hummer, backed = false) {
    if (h.state === 'sipping' && !backed) {
      h.state = 'backing';
      this.dart(h, h.pos.clone().add(this.v.set(-Math.sin(h.face) * 0.18, 0.04, -Math.cos(h.face) * 0.18)), 0.6);
      return;
    }
    h.visits--;
    // Dusk, nightfall or rain: off home after this flower.
    if (this.activity < 0.4) h.visits = 0;
    const r = this.rng();
    const other = this.birds.find((o) => o !== h && o.state !== 'leaving' && !o.rival && o.pos.distanceTo(h.pos) < 5);
    if (h.visits <= 0) {
      h.state = 'leaving';
      this.dart(h, this.world.edge(this.rng() * Math.PI * 2).add(this.v.set(0, 3, 0)), 7);
      return;
    }
    if (other && r < 0.2) {
      // A squabble: both zip off together in a looping chase.
      const to = h.pos.clone().add(this.v.set((this.rng() - 0.5) * 6, 1 + this.rng(), (this.rng() - 0.5) * 6));
      for (const [b, off] of [[h, 0], [other, 0.4]] as const) {
        b.state = 'chasing';
        b.rival = b === h ? other : h;
        b.bloom = null;
        this.dart(b, to.clone().add(this.v.set(off, 0.1, -off)), 4.5);
      }
      return;
    }
    if (r < 0.32) {
      const perches = this.world.perches().filter((p) => !p.ground);
      const p = perches[Math.floor(this.rng() * perches.length)];
      if (p) {
        h.state = 'darting';
        h.bloom = null;
        h.perching = true;
        this.dart(h, p.pos.clone().add(this.v.set(0, 0.02, 0)), 5);
        return;
      }
    }
    const bloom = this.pickBloom(h.pos);
    if (!bloom) {
      h.visits = 0;
      this.next(h);
      return;
    }
    h.bloom = bloom;
    h.state = 'darting';
    this.dart(h, this.hoverAt(bloom, h));
    if (this.rng() < 0.3) this.world.chip(h.pos);
  }
}
