import * as THREE from 'three';
import { createRng, lerp } from '../core/random';

/** Storybook scale: real bees would be invisible specks from the garden camera. */
const BEE_SCALE = 5.5;
const MAX_BEES = 8;

interface BeeKind {
  name: string;
  length: number; // body length, metres (before BEE_SCALE)
  girth: number; // body width relative to length
  stripes: [string, string];
  tail?: string;
  speed: number; // m/s
  hover: [number, number]; // seconds spent on each flower
  buzz: number; // relative buzz pitch
}

const KINDS: BeeKind[] = [
  { name: 'honeybee', length: 0.016, girth: 0.42, stripes: ['#d99a2b', '#3a2a1a'], speed: 1.5, hover: [1.2, 2.6], buzz: 1.15 },
  { name: 'bumblebee', length: 0.022, girth: 0.62, stripes: ['#f2c230', '#1e1a16'], tail: '#f4efe4', speed: 1.0, hover: [2.2, 4.5], buzz: 0.75 },
  { name: 'mason bee', length: 0.013, girth: 0.45, stripes: ['#2a3550', '#1a1d28'], speed: 1.7, hover: [1.0, 2.2], buzz: 1.3 },
];

/** A little striped bee: a soft body (stripes in vertex colour), a head, and two glassy wings. */
function buildBee(kind: BeeKind): { group: THREE.Group; wings: THREE.Mesh[] } {
  const group = new THREE.Group();
  const L = kind.length;
  const body = new THREE.SphereGeometry(0.5, 12, 8);
  body.scale(kind.girth * L, kind.girth * L * 0.95, L);
  const pos = body.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Color(kind.stripes[0]);
  const b = new THREE.Color(kind.stripes[1]);
  const tail = kind.tail ? new THREE.Color(kind.tail) : null;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getZ(i) / L + 0.5; // 0 = tail, 1 = front
    let c = Math.sin(t * Math.PI * 5) > 0 ? a : b;
    if (tail && t < 0.18) c = tail;
    if (t > 0.82) c = b; // dark thorax
    col.set([c.r, c.g, c.b], i * 3);
  }
  body.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  group.add(new THREE.Mesh(body, bodyMat));

  const head = new THREE.Mesh(new THREE.SphereGeometry(kind.girth * L * 0.42, 8, 6), new THREE.MeshLambertMaterial({ color: kind.stripes[1] }));
  head.position.z = L * 0.55;
  group.add(head);

  const wingGeo = new THREE.CircleGeometry(L * 0.42, 10);
  wingGeo.scale(1, 0.55, 1);
  wingGeo.rotateX(-Math.PI / 2);
  wingGeo.translate(L * 0.35, 0, 0); // hinge at the body
  const wingMat = new THREE.MeshBasicMaterial({ color: '#eef6ff', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
  const wings: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Mesh(wingGeo, wingMat);
    pivot.position.set(0, kind.girth * L * 0.42, L * 0.15);
    if (side < 0) pivot.rotation.y = Math.PI; // mirror to the other side
    group.add(pivot);
    wings.push(pivot);
  }
  group.scale.setScalar(BEE_SCALE);
  return { group, wings };
}

interface Bee {
  kind: BeeKind;
  group: THREE.Group;
  wings: THREE.Mesh[];
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  target: THREE.Vector3;
  state: 'flying' | 'hovering' | 'leaving';
  hoverLeft: number;
  phase: number;
}

/**
 * Bees busy among the blooms: honeybees, fat fuzzy bumblebees and little mason bees. Each
 * bobs from flower to open flower, hovers a while, moves on; now and then one wanders off into
 * the woods and another arrives. More flowers attract more bees.
 */
export class Bees {
  readonly group = new THREE.Group();
  private readonly bees: Bee[] = [];
  private readonly rng = createRng(909);
  private time = 0;
  private spawnIn = 2;

  constructor(
    private readonly openBlooms: () => THREE.Vector3[],
    private readonly edgePoint: (angle: number) => THREE.Vector3,
  ) {}

  /** How loud the buzz should be for a listener at `ear` (0 when no bee is close). */
  buzzNear(ear: THREE.Vector3): { level: number; pitch: number } {
    let level = 0;
    let pitch = 1;
    for (const b of this.bees) {
      const l = Math.max(0, 1 - b.pos.distanceTo(ear) / 7);
      if (l > level) {
        level = l;
        pitch = b.kind.buzz;
      }
    }
    return { level: level * level, pitch };
  }

  private pickBloom(near: THREE.Vector3 | null, blooms: THREE.Vector3[]): THREE.Vector3 | null {
    if (!blooms.length) return null;
    if (!near) return blooms[Math.floor(this.rng() * blooms.length)];
    // Prefer a flower close by, like a real forager working a patch.
    let best: THREE.Vector3 | null = null;
    let bestScore = Infinity;
    for (let i = 0; i < 12; i++) {
      const c = blooms[Math.floor(this.rng() * blooms.length)];
      const d = c.distanceTo(near);
      if (d < 0.15) continue;
      const score = d + this.rng() * 0.8;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  private spawn(blooms: THREE.Vector3[]) {
    const kind = KINDS[Math.floor(this.rng() * KINDS.length)];
    const { group, wings } = buildBee(kind);
    const start = this.edgePoint(this.rng() * Math.PI * 2);
    const target = this.pickBloom(null, blooms)!.clone();
    const bee: Bee = { kind, group, wings, pos: start.clone(), vel: new THREE.Vector3(), target, state: 'flying', hoverLeft: 0, phase: this.rng() * 100 };
    group.position.copy(start);
    this.group.add(group);
    this.bees.push(bee);
  }

  update(dt: number) {
    this.time += dt;
    const blooms = this.openBlooms();
    // About one bee per 25 open blooms, up to eight.
    const want = blooms.length ? Math.min(MAX_BEES, 1 + Math.floor(blooms.length / 25)) : 0;
    this.spawnIn -= dt;
    if (this.bees.length < want && this.spawnIn <= 0) {
      this.spawn(blooms);
      this.spawnIn = lerp(1.5, 5, this.rng());
    }

    for (let i = this.bees.length - 1; i >= 0; i--) {
      const b = this.bees[i];
      const t = this.time + b.phase;

      if (b.state === 'hovering') {
        b.hoverLeft -= dt;
        // Tiny, busy hovering over the bloom.
        const wob = new THREE.Vector3(Math.sin(t * 7.1) * 0.012, Math.sin(t * 9.3) * 0.01 + 0.015, Math.cos(t * 6.3) * 0.012);
        b.pos.lerp(b.target.clone().add(wob), 1 - Math.exp(-dt * 8));
        b.group.rotation.y += dt * Math.sin(t * 0.7) * 0.8;
        if (b.hoverLeft <= 0) {
          if (this.rng() < 0.12 || this.bees.length > want) {
            b.state = 'leaving';
            b.target = this.edgePoint(this.rng() * Math.PI * 2).add(new THREE.Vector3(0, 3, 0));
          } else {
            const next = this.pickBloom(b.pos, blooms);
            if (next) {
              b.target = next.clone();
              b.state = 'flying';
            } else b.hoverLeft = 1;
          }
        }
      } else {
        // Fly with a lazy, bobbing wander toward the target, slowing to arrive.
        const to = b.target.clone().sub(b.pos);
        const dist = to.length();
        const speed = b.kind.speed * Math.min(1, dist / 0.5 + 0.25);
        const desired = to.normalize().multiplyScalar(speed);
        desired.x += Math.sin(t * 2.3) * 0.35;
        desired.z += Math.cos(t * 1.9) * 0.35;
        desired.y += Math.sin(t * 3.1) * 0.25 + (dist > 1 ? 0.25 : 0); // lift a little between flowers
        b.vel.lerp(desired, 1 - Math.exp(-dt * 3));
        b.pos.addScaledVector(b.vel, dt);
        if (b.vel.lengthSq() > 0.001) b.group.rotation.y = Math.atan2(b.vel.x, b.vel.z);
        if (b.state === 'flying' && dist < 0.07) {
          b.state = 'hovering';
          b.hoverLeft = lerp(b.kind.hover[0], b.kind.hover[1], this.rng());
        } else if (b.state === 'leaving' && dist < 0.5) {
          this.group.remove(b.group);
          this.bees.splice(i, 1);
          continue;
        }
      }

      b.group.position.copy(b.pos);
      // Wings beat far faster than the frame rate: the flicker reads as a soft blur.
      const beat = Math.sin(this.time * 70 + b.phase) * 0.9;
      // (The second wing is the first turned half round, so the same angle mirrors it.)
      b.wings[0].rotation.z = beat;
      b.wings[1].rotation.z = beat;
    }
  }
}
