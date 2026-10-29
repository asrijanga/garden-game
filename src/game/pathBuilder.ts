import * as THREE from 'three';
import { createRng, lerp } from '../core/random';
import type { Ground } from '../world/ground';
import type { GroundPaint } from '../world/groundPaint';
import type { Stones } from '../world/stones';
import type { EdgePlants } from '../world/edgePlants';
import type { Wildflowers } from '../world/wildflowers';

const STEP = 0.12; // metres the path advances per smoothing step
const STRIDE = 0.62; // metres between stones, like footsteps
const CELL = 1; // spatial hash for path centre lines
const LEAD = 0.55; // the finger leads the path by this much before it moves on (ignores jitter)

const STONE_TONES = ['#d6cfc3', '#cdc5b7', '#dcd4c6', '#c8c1b5', '#d2c8b6'];

export interface PathRecord {
  seed: number;
  points: { x: number; z: number }[];
}

interface LinePoint {
  x: number;
  z: number;
  id: number;
}

/**
 * A stepping-stone path: big, flat, hand-dressed stones set straight into the lawn, staggered
 * left and right like footsteps, with a little trodden earth round each and clover creeping in
 * beside them. It starts where the finger sets off and follows just behind it, with light
 * smoothing so wobbles become gentle curves. Where it meets another path, the stones there
 * carry on, so the two never double up.
 */
export class PathBuilder {
  readonly records: PathRecord[] = [];
  private rng = createRng(1234);
  private walker = new THREE.Vector2();
  private heading = new THREE.Vector2();
  private sinceStone = 0;
  private stride = 0;
  private active: PathRecord | null = null;
  private pathId = 0;
  private started = false;
  private readonly lastTarget = new THREE.Vector2();
  private readonly lines = new Map<number, LinePoint[]>();

  constructor(
    private readonly ground: Ground,
    private readonly paint: GroundPaint,
    private readonly stones: Stones,
    private readonly edges: EdgePlants,
    private readonly wildflowers: Wildflowers,
    private readonly blocked: (x: number, z: number) => boolean,
  ) {}

  begin(p: THREE.Vector3) {
    this.pathId++;
    this.active = { seed: Math.floor(this.rng() * 1e9), points: [] };
    this.records.push(this.active);
    this.walker.set(p.x, p.z);
    this.lastTarget.set(p.x, p.z);
    this.heading.set(0, 0);
    this.sinceStone = 0;
    this.stride = 0;
    this.started = false;
    // Nothing is laid until the finger actually sets off: a tap or a long press leaves no trace.
  }

  extend(p: THREE.Vector3) {
    if (!this.active) return;
    this.lastTarget.set(p.x, p.z);
    this.walkTo(this.lastTarget, LEAD);
  }

  end() {
    // Finish exactly where the finger lifted (if it's ahead of us).
    if (this.active) this.walkTo(this.lastTarget, STEP);
    this.active = null;
  }

  /**
   * Walk toward `target` until within `stopAt`. The finger must lead by `LEAD` before the path
   * moves on, and targets behind us are ignored, so jitter or wiggling in place never makes
   * the path loop back on itself.
   */
  private walkTo(target: THREE.Vector2, stopAt: number) {
    const dir = new THREE.Vector2();
    for (let guard = 0; guard < 300; guard++) {
      dir.subVectors(target, this.walker);
      const dist = dir.length();
      if (dist < Math.max(stopAt, STEP)) break;
      dir.divideScalar(dist);
      if (this.heading.lengthSq() > 0 && this.heading.dot(dir) < -0.1 && dist < 1.2) break;
      // Light smoothing: the heading eases toward the finger, so jitter becomes gentle curves.
      if (this.heading.lengthSq() === 0) this.heading.copy(dir);
      else this.heading.lerp(dir, 0.25).normalize();
      if (!this.started) {
        // The very first stone sits where the stroke began, facing the way you set off.
        this.started = true;
        this.stepAt(this.walker, true);
      }
      this.walker.addScaledVector(this.heading, STEP);
      this.stepAt(this.walker, false);
    }
  }

  private stepAt(w: THREE.Vector2, first: boolean) {
    if (this.blocked(w.x, w.y)) return;
    this.active?.points.push({ x: w.x, z: w.y });
    this.addLinePoint(w.x, w.y);
    this.wildflowers.clearNear(w.x, w.y, 0.45);
    const perp = new THREE.Vector2(-this.heading.y, this.heading.x);
    const yaw = Math.atan2(this.heading.x, this.heading.y);
    // Where another path already runs, its stones carry on there.
    const insideOther = this.distanceTo(w.x, w.y, true, 2) < 0.55;
    this.sinceStone += first ? 0 : STEP;
    if ((first || this.sinceStone >= STRIDE) && !insideOther) {
      this.sinceStone = 0;
      // Staggered left and right, like footsteps, each a touch different.
      const side = this.stride++ % 2 === 0 ? -1 : 1;
      const o = side * lerp(0.07, 0.15, this.rng());
      const p = new THREE.Vector2(w.x + perp.x * o, w.y + perp.y * o);
      if (!this.blocked(p.x, p.y) && !this.stones.isOccupied(p.x, p.y, 0.24, 'step')) {
        const k = lerp(1.15, 1.4, this.rng());
        const tone = new THREE.Color(STONE_TONES[Math.floor(this.rng() * STONE_TONES.length)]).multiplyScalar(lerp(0.94, 1.05, this.rng()));
        const scale = new THREE.Vector3(k * lerp(0.92, 1.08, this.rng()), lerp(0.8, 1.0, this.rng()), k * lerp(0.92, 1.08, this.rng()));
        this.stones.add('step', p.x, this.ground.heightAt(p.x, p.y) - 0.04, p.y, scale, yaw + (this.rng() - 0.5) * 0.8, 0.26, tone, 0.05, this.pathId);
        this.paint.wear(p.x, p.y, 0.32, 0.55, 0); // a little trodden earth round each stone
      }
    }
    // Clover, grass tufts and tiny flowers creep in beside the stones now and then.
    if (this.rng() < 0.12) {
      const s = this.rng() < 0.5 ? -1 : 1;
      const o = lerp(0.5, 0.74, this.rng());
      const ex = w.x + perp.x * s * o + (this.rng() - 0.5) * 0.2;
      const ez = w.y + perp.y * s * o + (this.rng() - 0.5) * 0.2;
      if (!this.blocked(ex, ez) && this.distanceTo(ex, ez, false) > 0.48 && !this.stones.isOccupied(ex, ez, 0.12)) {
        this.edges.add(ex, this.ground.heightAt(ex, ez), ez, lerp(0.7, 1.6, this.rng()));
      }
    }
  }

  /** Distance from (x, z) to the nearest path centre line (for keeping beds off paths). */
  distanceToPaths(x: number, z: number): number {
    return this.distanceTo(x, z, false, 2);
  }

  private addLinePoint(x: number, z: number) {
    const key = Math.floor(x / CELL) * 4096 + Math.floor(z / CELL);
    if (!this.lines.has(key)) this.lines.set(key, []);
    this.lines.get(key)!.push({ x, z, id: this.pathId });
  }

  /** Back to an untouched garden (before an undo replays what remains). */
  reset() {
    this.records.length = 0;
    this.rng = createRng(1234);
    this.sinceStone = 0;
    this.stride = 0;
    this.active = null;
    this.pathId = 0;
    this.started = false;
    this.lines.clear();
  }

  /** The nearest point on any path's centre line within `reach` metres of (x, z), if any. */
  nearestPoint(x: number, z: number, reach: number): THREE.Vector2 | null {
    let best: THREE.Vector2 | null = null;
    let bestD = reach * reach;
    const r = Math.ceil(reach / CELL);
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let i = cx - r; i <= cx + r; i++) {
      for (let j = cz - r; j <= cz + r; j++) {
        for (const p of this.lines.get(i * 4096 + j) ?? []) {
          const d = (p.x - x) ** 2 + (p.z - z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = new THREE.Vector2(p.x, p.z);
          }
        }
      }
    }
    return best;
  }

  /** Forget path centre line within `r` of (x, z), so the lawn there is free again. */
  erase(x: number, z: number, r: number) {
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) {
      for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
        const list = this.lines.get(i * 4096 + j);
        if (list) this.lines.set(i * 4096 + j, list.filter((p) => (p.x - x) ** 2 + (p.z - z) ** 2 > r * r));
      }
    }
  }

  /** Distance to the nearest path centre line (optionally ignoring the path being drawn). */
  private distanceTo(x: number, z: number, othersOnly: boolean, reach = 1): number {
    let best = Infinity;
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let i = cx - reach; i <= cx + reach; i++) {
      for (let j = cz - reach; j <= cz + reach; j++) {
        for (const p of this.lines.get(i * 4096 + j) ?? []) {
          if (othersOnly && p.id === this.pathId) continue;
          best = Math.min(best, (p.x - x) ** 2 + (p.z - z) ** 2);
        }
      }
    }
    return Math.sqrt(best);
  }
}
