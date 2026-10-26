import * as THREE from 'three';
import { createRng, lerp } from '../core/random';
import type { Fences } from '../world/fences';
import type { Wildflowers } from '../world/wildflowers';

const WIDTH = 1.25; // deck width, metres
const PLANK = 0.17; // plank pitch along the span
const WOODS = ['#9a6a45', '#8c5e3c', '#a87650', '#946545', '#7f5638'];

/**
 * An arched wooden footbridge across a pond. Draw from one bank to the other; when you let go
 * it builds itself: stone footings on each bank, beams springing across, planks laid one by
 * one along a gentle arch, then posts and handrails following the curve.
 */
export class BridgeBuilder {
  private rng = createRng(5151);
  private start: THREE.Vector2 | null = null;
  private to = new THREE.Vector2();
  private nextOwner = 1_000_000;

  constructor(
    private readonly fences: Fences,
    private readonly wildflowers: Wildflowers,
    private readonly heightAt: (x: number, z: number) => number,
    private readonly waterDepth: (x: number, z: number) => number,
    private readonly onRefuse: (why: string) => void,
  ) {}

  /** Back to an untouched garden (before an undo replays what remains). */
  reset() {
    this.rng = createRng(5151);
    this.start = null;
    this.nextOwner = 1_000_000;
  }

  begin(p: THREE.Vector3) {
    this.start = new THREE.Vector2(p.x, p.z);
    this.to.copy(this.start);
  }

  extend(p: THREE.Vector3) {
    if (this.start) this.to.set(p.x, p.z);
  }

  end() {
    const a = this.start;
    if (!a) return;
    this.start = null;
    const b = this.to.clone();
    const span = a.distanceTo(b);
    if (span < 2) return this.onRefuse('Draw a bridge from one bank across to the other');
    if (span > 12) return this.onRefuse('That’s a long way: try a shorter bridge');
    let wet = 0;
    for (let i = 1; i < 24; i++) if (this.waterDepth(a.x + ((b.x - a.x) * i) / 24, a.y + ((b.y - a.y) * i) / 24) > 0.05) wet++;
    if (!wet) return this.onRefuse('Bridges need a pond to cross');
    this.build(a, b);
  }

  private build(a: THREE.Vector2, b: THREE.Vector2) {
    const owner = this.nextOwner++;
    const span = a.distanceTo(b);
    const dir = b.clone().sub(a).divideScalar(span);
    const perp = new THREE.Vector3(-dir.y, 0, dir.x);
    const ya = this.heightAt(a.x, a.y) + 0.06;
    const yb = this.heightAt(b.x, b.y) + 0.06;
    const rise = 0.22 + span * 0.08;
    const pointAt = (t: number) => new THREE.Vector3(a.x + (b.x - a.x) * t, lerp(ya, yb, t) + rise * Math.sin(Math.PI * t), a.y + (b.y - a.y) * t);
    const tangentAt = (t: number) => new THREE.Vector3(dir.x * span, yb - ya + rise * Math.PI * Math.cos(Math.PI * t), dir.y * span).normalize();
    const wood = () => new THREE.Color(WOODS[Math.floor(this.rng() * WOODS.length)]).multiplyScalar(lerp(0.85, 1.05, this.rng()));
    // Orientation with local x across the bridge, local z along its curve.
    const across = (t: number) => {
      const z = tangentAt(t);
      const y = new THREE.Vector3().crossVectors(z, perp).normalize();
      const x = new THREE.Vector3().crossVectors(y, z).normalize();
      return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    };
    // ...and with local x along a segment from p to q (beams and handrails).
    const along = (p: THREE.Vector3, q: THREE.Vector3) => {
      const x = q.clone().sub(p).normalize();
      const z = new THREE.Vector3().crossVectors(x, new THREE.Vector3(0, 1, 0)).normalize();
      const y = new THREE.Vector3().crossVectors(z, x).normalize();
      return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    };
    for (const end of [a, b]) this.wildflowers.clearNear(end.x, end.y, 1.2);

    // Footings: a few big stones bedded into each bank.
    let d = 0;
    for (const [t, out] of [[0, -1], [1, 1]] as const) {
      const p = pointAt(t);
      for (let k = 0; k < 3; k++) {
        const side = (k - 1) * 0.5;
        const s = lerp(0.35, 0.5, this.rng());
        const pos = new THREE.Vector3(p.x + perp.x * side + dir.x * out * 0.15, this.heightAt(p.x, p.z) - 0.02, p.z + perp.z * side + dir.y * out * 0.15);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((this.rng() - 0.5) * 0.2, this.rng() * 6, (this.rng() - 0.5) * 0.2));
        this.fences.add('wallStone', pos, q, new THREE.Vector3(s, s * 0.5, s * 0.8), new THREE.Color(1, 1, 1).multiplyScalar(lerp(0.85, 1.05, this.rng())), 'drop', d, owner);
        d += 0.08;
      }
    }

    // Two beams spring across underneath, in short straight lengths following the arch.
    const steps = Math.max(4, Math.round(span / 0.6));
    for (const side of [-0.48, 0.48]) {
      for (let i = 0; i < steps; i++) {
        const p = pointAt(i / steps).addScaledVector(perp, side);
        const q = pointAt((i + 1) / steps).addScaledVector(perp, side);
        p.y -= 0.09;
        q.y -= 0.09;
        const mid = p.clone().add(q).multiplyScalar(0.5);
        const len = p.distanceTo(q);
        this.fences.add('rail', mid, along(p, q), new THREE.Vector3(len + 0.04, 2.6, 2.2), wood(), 'pop', 0.3 + i * 0.05, owner, len / 2);
      }
    }

    // Planks, laid one after another from bank to bank: never quite even, the odd gap.
    const n = Math.ceil(span / PLANK);
    for (let i = 0; i < n; i++) {
      if (i > 1 && i < n - 2 && this.rng() < 0.02) continue;
      const t = (i + 0.5 + (this.rng() - 0.5) * 0.12) / n;
      const p = pointAt(t);
      const q = across(t).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (this.rng() - 0.5) * 0.04, (this.rng() - 0.5) * 0.03)));
      this.fences.add('rail', p, q, new THREE.Vector3(WIDTH * lerp(0.97, 1.03, this.rng()), 0.9, lerp(4.4, 5.0, this.rng())), wood(), 'pop', 0.6 + i * 0.045, owner, 0);
    }

    // Posts and handrails along both sides, following the curve.
    const posts = Math.max(2, Math.round(span / 1.1));
    const railDelay = 0.6 + n * 0.045;
    for (const side of [-WIDTH / 2 + 0.05, WIDTH / 2 - 0.05]) {
      const tops: THREE.Vector3[] = [];
      for (let i = 0; i <= posts; i++) {
        const t = i / posts;
        const p = pointAt(t).addScaledVector(perp, side);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((this.rng() - 0.5) * 0.04, Math.atan2(-dir.y, dir.x), (this.rng() - 0.5) * 0.04, 'YXZ'));
        this.fences.add('picketPost', p.clone().setY(p.y - 0.05), q, new THREE.Vector3(1, 0.85, 1), wood(), 'drop', railDelay + i * 0.08, owner);
        tops.push(p.clone().setY(p.y + 0.78));
      }
      for (let i = 0; i < posts; i++) {
        const p = tops[i];
        const q = tops[i + 1];
        const mid = p.clone().add(q).multiplyScalar(0.5);
        mid.y += 0.03; // the handrail bows up a little between posts
        const len = p.distanceTo(q);
        this.fences.add('rail', mid, along(p, q), new THREE.Vector3(len + 0.06, 1.3, 1.8), wood(), 'pop', railDelay + 0.4 + i * 0.08, owner, len / 2);
      }
    }
  }
}
