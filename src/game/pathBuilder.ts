import * as THREE from 'three';
import { createRng, lerp } from '../core/random';
import type { Ground } from '../world/ground';
import type { GroundPaint } from '../world/groundPaint';
import type { Stones } from '../world/stones';
import type { EdgePlants } from '../world/edgePlants';
import type { Wildflowers } from '../world/wildflowers';

const STEP = 0.12; // metres the path advances per smoothing step
const STONE_SPACING = 0.8; // centre stones
const GRAVEL_RADIUS = 0.8; // painted gravel; its visible edge (~80% of this) sits under the edging
const CURB_OFFSET = 0.62; // centre line → edging stone centre
const INSIDE = CURB_OFFSET - 0.1; // closer than this to a centre line = inside that path
const CELL = 1; // spatial hash for path centre lines
const LEAD = 0.55; // the finger leads the path by this much before it moves on (ignores jitter)
const FLARE_START = 2.4; // junction curve begins this far from another path's centre line…
const FLARE_FULL = 0.7; // …and is fully flared by here

/** Smoothstep from a (0) to b (1); works with a > b. */
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const STONE_TONES = ['#d6cfc3', '#cdc5b7', '#dcd4c6', '#c8c1b5', '#d2c8b6'];
const CURB_TONES = ['#b4ab9d', '#aaa294', '#bab1a2', '#a59d91', '#bdb6a8', '#9f988c'];

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
 * A simple, tidy garden path: rounded stones down the middle, gravel either side, and low,
 * hand-laid edging. It starts exactly where you touch and follows just behind your finger,
 * with light smoothing so wobbles become gentle curves.
 *
 * Paths merge: where a new path runs into or over an existing one, it stops laying its own
 * stones and edging inside the old path, and lifts the old path's edging out of its way, so
 * the two join into one gravel area edged only around the outside.
 */
export class PathBuilder {
  readonly records: PathRecord[] = [];
  private rng = createRng(1234);
  private walker = new THREE.Vector2();
  private heading = new THREE.Vector2();
  private sinceStone = 0;
  private lastCurb: (THREE.Vector2 | null)[] = [null, null];
  private curbTarget = [0.36, 0.36];
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
    this.lastCurb = [null, null];
    this.sinceStone = 0;
    this.started = false;
    // Gravel appears under the finger straight away.
    if (!this.blocked(p.x, p.z)) this.paint.wear(p.x, p.z, GRAVEL_RADIUS, 1, 1);
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
        // The very first stone sits exactly where the stroke began, facing the way you set off.
        this.started = true;
        this.stepAt(this.walker, true);
      }
      this.walker.addScaledVector(this.heading, STEP);
      this.stepAt(this.walker, false);
    }
  }

  private stepAt(w: THREE.Vector2, first: boolean) {
    if (this.blocked(w.x, w.y)) {
      this.lastCurb = [null, null]; // break the edging cleanly at obstacles
      return;
    }
    this.active?.points.push({ x: w.x, z: w.y });
    this.addLinePoint(w.x, w.y);

    // Junctions curve: approaching (or leaving) another path, this one gradually flares wider,
    // so its edging sweeps round in a soft fillet to meet the other path's edge.
    const toOther = this.distanceTo(w.x, w.y, true, 3);
    const flare = smooth(FLARE_START, FLARE_FULL, toOther);
    // A wide, soft mouth: the gravel and edging sweep out into a curved fillet on both sides.
    const gravel = GRAVEL_RADIUS * (1 + flare * flare * 0.9);
    const curbOffset = CURB_OFFSET * (1 + flare * flare * 1.1);
    this.paint.wear(w.x, w.y, gravel, 1, 1);
    this.wildflowers.clearNear(w.x, w.y, 1.1 + flare);

    // Merging: the old path's edging that now sits inside our (flared) gravel is lifted away.
    this.stones.removeNear(w.x, w.y, INSIDE * (1 + flare * flare * 1.6), 'curb', this.pathId);

    // Centre stones, unless we're running through or alongside another path's gravel (its
    // stones carry on there, so overlapping paths keep a single row).
    const insideOther = toOther < GRAVEL_RADIUS * 0.95;
    this.sinceStone += first ? 0 : STEP;
    if ((first || this.sinceStone >= STONE_SPACING) && !insideOther) {
      this.sinceStone = 0;
      if (!this.stones.isOccupied(w.x, w.y, 0.3, 'step')) {
        const tone = new THREE.Color(STONE_TONES[Math.floor(this.rng() * STONE_TONES.length)]).multiplyScalar(lerp(0.96, 1.04, this.rng()));
        // Each stone sits a touch differently: a little twist, slightly different proportions.
        const yaw = Math.atan2(this.heading.x, this.heading.y) + (this.rng() - 0.5) * 0.3 + (this.rng() < 0.5 ? 0 : Math.PI / 2);
        const k = lerp(0.92, 1.08, this.rng());
        const scale = new THREE.Vector3(k * lerp(0.94, 1.06, this.rng()), lerp(0.85, 1.1, this.rng()), k * lerp(0.94, 1.06, this.rng()));
        this.stones.add('step', w.x, this.ground.heightAt(w.x, w.y) - 0.03, w.y, scale, yaw, 0.2, tone, 0.05, this.pathId);
      }
    }

    // Edging: low, hand-laid blocks of varied length. Each side measures its own distance,
    // so blocks stay evenly spaced round curves.
    const perp = new THREE.Vector2(-this.heading.y, this.heading.x);
    [-1, 1].forEach((side, i) => {
      const at = w.clone().addScaledVector(perp, side * curbOffset);
      const last = this.lastCurb[i];
      if (!last) {
        this.lastCurb[i] = at;
        return;
      }
      const span = at.distanceTo(last);
      if (span > 0.9) {
        // A sharp swing moved this edge a long way: restart it rather than bridging the path.
        this.lastCurb[i] = at;
        return;
      }
      if (span < this.curbTarget[i]) return;
      const mid = at.clone().add(last).multiplyScalar(0.5);
      const dir = at.clone().sub(last).normalize();
      this.lastCurb[i] = at;
      this.curbTarget[i] = lerp(0.26, 0.46, this.rng());
      // Never inside a path (this one on a tight bend, or another we're merging with).
      if (this.distanceTo(mid.x, mid.y, false) < INSIDE * (1 + flare * 0.8) || this.blocked(mid.x, mid.y)) return;
      if (this.distanceTo(mid.x, mid.y, true) < INSIDE) return;
      if (this.rng() < 0.05) return; // the odd missing block, as in any hand-laid edge
      // Hand-laid: nudged in or out, a little twisted, set slightly high or low.
      const nudge = (this.rng() - 0.5) * 0.05;
      const x = mid.x + perp.x * side * nudge;
      const z = mid.y + perp.y * side * nudge;
      const tone = new THREE.Color(CURB_TONES[Math.floor(this.rng() * CURB_TONES.length)]).multiplyScalar(lerp(0.92, 1.06, this.rng()));
      const scale = new THREE.Vector3(lerp(0.85, 1.1, this.rng()), lerp(0.8, 1.15, this.rng()), (span - 0.025) / 0.4);
      const y = this.ground.heightAt(x, z) - lerp(0.035, 0.06, this.rng());
      this.stones.add('curb', x, y, z, scale, Math.atan2(dir.x, dir.y) + (this.rng() - 0.5) * 0.12, 0.1, tone, 0.1, this.pathId);
    });

    // Clover and tiny flowers grow along the outside of the edging a moment later.
    if (this.rng() < 0.25) {
      const s = this.rng() < 0.5 ? -1 : 1;
      const o = lerp(0.82, 1.0, this.rng());
      const ex = w.x + perp.x * s * o + (this.rng() - 0.5) * 0.2;
      const ez = w.y + perp.y * s * o + (this.rng() - 0.5) * 0.2;
      if (!this.blocked(ex, ez) && this.distanceTo(ex, ez, false) > 0.78 && !this.stones.isOccupied(ex, ez, 0.12)) {
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
    this.lastCurb = [null, null];
    this.curbTarget = [0.36, 0.36];
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
