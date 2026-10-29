import * as THREE from 'three';
import { createRng, lerp } from '../core/random';
import type { Ground } from '../world/ground';
import type { GroundPaint } from '../world/groundPaint';
import type { Stones } from '../world/stones';
import type { EdgePlants } from '../world/edgePlants';
import type { Wildflowers } from '../world/wildflowers';

const STEP = 0.12; // metres the path advances per smoothing step
const STONE_SPACING = 0.8; // centre stones
const GRAVEL_RADIUS = 0.6; // painted gravel; its visible edge (~80% of this) sits under the edging
const CURB_OFFSET = 0.46; // centre line → edging stone centre
const INSIDE = CURB_OFFSET - 0.1; // closer than this to a centre line = inside that path
const CELL = 1; // spatial hash for path centre lines
const LEAD = 0.55; // the finger leads the path by this much before it moves on (ignores jitter)
const FLARE_START = 1.9; // junction curve begins this far from another path's centre line…
const FLARE_FULL = 0.55; // …and is fully flared by here

/** Smoothstep from a (0) to b (1); works with a > b. */
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const STONE_TONES = ['#d6cfc3', '#cdc5b7', '#dcd4c6', '#c8c1b5', '#d2c8b6'];
const CURB_TONES = ['#b4ab9d', '#aaa294', '#bab1a2', '#a59d91', '#bdb6a8', '#9f988c'];
const FLAG_TONES = ['#c9bfae', '#bdb3a2', '#d3c9b6', '#b5ab9b', '#c4b6a0', '#a9a092', '#cfc2a9'];
const BRICK_TONES = ['#b5583d', '#a94f37', '#c0654a', '#9c4a35', '#b86a4c', '#a25a44', '#8f4632', '#c27458'];
const COBBLE_TONES = ['#9d968b', '#8c867c', '#a8a194', '#958d80', '#b0a898', '#827b72'];
const PLANK_TONES = ['#9c7b5a', '#8f6f50', '#a88763', '#836548', '#a6865f', '#94785a'];
const TIMBER_TONES = ['#7a5a3e', '#6f5238', '#86654a', '#644a33'];

/** The kinds of path the player can lay. Gravel (with stepping stones and stone edging) is the original. */
export type PathStyle = 'gravel' | 'stepping' | 'flagstone' | 'brick' | 'cobble' | 'boardwalk' | 'bark' | 'earth';
export const PATH_STYLES: PathStyle[] = ['gravel', 'stepping', 'flagstone', 'brick', 'cobble', 'boardwalk', 'bark', 'earth'];

/** How each style is made: what's painted under it, its edging, and how often plants creep along it. */
const LOOK: Record<PathStyle, { sand: number; mulch?: boolean; edging: 'stone' | 'brick' | 'timber' | null; plants: number; paint: number }> = {
  gravel: { sand: 1, edging: 'stone', plants: 0.25, paint: 1 },
  stepping: { sand: 0, edging: null, plants: 0.12, paint: 0 },
  flagstone: { sand: 0.4, edging: null, plants: 0.35, paint: 0.95 },
  brick: { sand: 0.75, edging: 'brick', plants: 0.15, paint: 0.95 },
  cobble: { sand: 0.55, edging: 'stone', plants: 0.15, paint: 0.95 },
  boardwalk: { sand: 0, edging: null, plants: 0.2, paint: 0.85 },
  bark: { sand: 0, mulch: true, edging: 'timber', plants: 0.25, paint: 0.95 },
  earth: { sand: 0, edging: null, plants: 0.45, paint: 0.9 },
};

export interface PathRecord {
  seed: number;
  style: PathStyle;
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
  /** The style for the next path (set from the path chips, or from a saved stroke). */
  style: PathStyle = 'gravel';
  private current: PathStyle = 'gravel';
  /** Paving laid in rows across the path: distance since the last row, and which row it is. */
  private sinceRow = 0;
  private row = 0;

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
    this.current = this.style;
    this.active = { seed: Math.floor(this.rng() * 1e9), style: this.current, points: [] };
    this.sinceRow = 0;
    this.row = 0;
    this.records.push(this.active);
    this.walker.set(p.x, p.z);
    this.lastTarget.set(p.x, p.z);
    this.heading.set(0, 0);
    this.lastCurb = [null, null];
    this.sinceStone = 0;
    this.started = false;
    // Nothing is laid until the finger actually sets off: a tap or a long press leaves no trace
    // (it used to leave a lone round patch of gravel, the "finger blob").
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

    if (this.current !== 'gravel') {
      this.styledStep(w, first);
      return;
    }
    // Junctions curve: approaching (or leaving) another path, this one gradually flares wider,
    // so its edging sweeps round in a soft fillet to meet the other path's edge.
    const toOther = this.distanceTo(w.x, w.y, true, 3);
    const flare = smooth(FLARE_START, FLARE_FULL, toOther);
    // A wide, soft mouth: the gravel and edging sweep out into a curved fillet on both sides.
    const gravel = GRAVEL_RADIUS * (1 + flare * flare * 0.55);
    const curbOffset = CURB_OFFSET * (1 + flare * flare * 0.7);
    this.paint.wear(w.x, w.y, gravel, 1, 1);
    this.wildflowers.clearNear(w.x, w.y, 0.85 + flare);

    // Merging: the old path's edging that now sits inside our (flared) gravel is lifted away.
    this.stones.removeNear(w.x, w.y, INSIDE * (1 + flare * flare * 1.2), 'curb', this.pathId);
    this.stones.removeNear(w.x, w.y, INSIDE * (1 + flare * flare * 1.2), 'brick', this.pathId);

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
      const o = lerp(0.62, 0.78, this.rng());
      const ex = w.x + perp.x * s * o + (this.rng() - 0.5) * 0.2;
      const ez = w.y + perp.y * s * o + (this.rng() - 0.5) * 0.2;
      if (!this.blocked(ex, ez) && this.distanceTo(ex, ez, false) > 0.58 && !this.stones.isOccupied(ex, ez, 0.12)) {
        this.edges.add(ex, this.ground.heightAt(ex, ez), ez, lerp(0.7, 1.6, this.rng()));
      }
    }
  }

  /**
   * One step of a path in one of the newer styles. Each has its own bed underneath (gravel,
   * sandy soil, earth or bark mulch), its own paving laid in rows across the path (or stones
   * set like footsteps), and its own edging; all of it slightly irregular, as if laid by hand.
   */
  private styledStep(w: THREE.Vector2, first: boolean) {
    const look = LOOK[this.current];
    const toOther = this.distanceTo(w.x, w.y, true, 3);
    const flare = smooth(FLARE_START, FLARE_FULL, toOther);
    const width = GRAVEL_RADIUS * (1 + flare * flare * 0.55);
    if (look.mulch) this.paint.bed(w.x, w.y, width * look.paint);
    else if (look.paint > 0) this.paint.wear(w.x, w.y, width * look.paint, 1, look.sand);
    this.wildflowers.clearNear(w.x, w.y, look.paint > 0 ? 0.85 + flare : 0.45);
    if (look.edging) this.stones.removeNear(w.x, w.y, INSIDE * (1 + flare * flare * 1.2), look.edging === 'brick' ? 'brick' : 'curb', this.pathId);
    const perp = new THREE.Vector2(-this.heading.y, this.heading.x);
    const yaw = Math.atan2(this.heading.x, this.heading.y);
    // Where another path already runs, it carries on there (no doubled-up paving).
    const insideOther = toOther < GRAVEL_RADIUS * 0.95;
    this.sinceRow += first ? 0 : STEP;
    const at = (o: number, along = 0) => new THREE.Vector2(w.x + perp.x * o + this.heading.x * along, w.y + perp.y * o + this.heading.y * along);
    const ok = (p: THREE.Vector2) => !this.blocked(p.x, p.y) && this.distanceTo(p.x, p.y, true, 2) > GRAVEL_RADIUS * 0.8;
    const ground = (p: THREE.Vector2) => this.ground.heightAt(p.x, p.y);
    const tone = (list: string[], lo = 0.94, hi = 1.05) => new THREE.Color(list[Math.floor(this.rng() * list.length)]).multiplyScalar(lerp(lo, hi, this.rng()));
    const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    switch (this.current) {
      case 'stepping': {
        // Big flat stones set straight into the lawn, staggered left and right like footsteps.
        if ((first || this.sinceRow >= 0.62) && !insideOther) {
          this.sinceRow = 0;
          const side = this.row++ % 2 === 0 ? -1 : 1;
          const p = at(side * lerp(0.07, 0.15, this.rng()));
          if (ok(p) && !this.stones.isOccupied(p.x, p.y, 0.24, 'step')) {
            const k = lerp(1.15, 1.4, this.rng());
            this.stones.add('step', p.x, ground(p) - 0.04, p.y, v3(k * lerp(0.92, 1.08, this.rng()), lerp(0.8, 1.0, this.rng()), k * lerp(0.92, 1.08, this.rng())), yaw + (this.rng() - 0.5) * 0.8, 0.26, tone(STONE_TONES), 0.05, this.pathId);
            this.paint.wear(p.x, p.y, 0.32, 0.55, 0); // a little trodden earth round each stone
          }
        }
        break;
      }
      case 'flagstone': {
        // Crazy paving: irregular slabs, two or three across, fitted with sandy joints between.
        if ((first || this.sinceRow >= 0.34) && !insideOther) {
          this.sinceRow = 0;
          const n = this.rng() < 0.5 ? 2 : 3;
          const off = this.row++ % 2 === 0 ? 0 : 0.11;
          for (let i = 0; i < n; i++) {
            const o = ((i + 0.5) / n - 0.5) * 0.78 + off * (i % 2 === 0 ? 1 : -1) + (this.rng() - 0.5) * 0.06;
            const p = at(o, (this.rng() - 0.5) * 0.08);
            const r = n === 2 ? lerp(0.19, 0.23, this.rng()) : lerp(0.15, 0.18, this.rng());
            if (!ok(p) || this.stones.isOccupied(p.x, p.y, r * 0.78, 'flag')) continue;
            const k = r / 0.2;
            this.stones.add('flag', p.x, ground(p) - 0.035 + this.rng() * 0.006, p.y, v3(k, lerp(0.8, 1.1, this.rng()), k * lerp(0.85, 1.1, this.rng())), this.rng() * Math.PI * 2, r * 0.9, tone(FLAG_TONES, 0.92, 1.06), 0.03 + i * 0.04, this.pathId);
          }
        }
        break;
      }
      case 'brick': {
        // Courses of bricks across the path, every other one shifted half a brick, fanning round
        // the curves; the odd brick sits a touch proud, and now and then one is missing.
        if ((first || this.sinceRow >= 0.105) && !insideOther) {
          this.sinceRow = 0;
          const shift = this.row++ % 2 === 0 ? 0 : 0.1;
          for (let i = -2; i <= 2; i++) {
            const o = i * 0.205 + shift - 0.1;
            if (Math.abs(o) > 0.42) continue;
            const p = at(o);
            if (!ok(p) || this.rng() < 0.02) continue;
            this.stones.add('brick', p.x, ground(p) - 0.045 + (this.rng() < 0.04 ? 0.008 : this.rng() * 0.003), p.y, v3(lerp(0.97, 1.03, this.rng()), 1, lerp(0.97, 1.02, this.rng())), yaw + Math.PI / 2 + (this.rng() - 0.5) * 0.035, 0.09, tone(BRICK_TONES, 0.94, 1.04), 0.02 + (i + 2) * 0.03, this.pathId);
          }
        }
        break;
      }
      case 'cobble': {
        // Small rounded cobbles packed in staggered rows.
        if ((first || this.sinceRow >= 0.12) && !insideOther) {
          this.sinceRow = 0;
          const shift = this.row++ % 2 === 0 ? 0 : 0.06;
          for (let o = -0.36 + shift; o <= 0.37; o += 0.12) {
            const p = at(o + (this.rng() - 0.5) * 0.025, (this.rng() - 0.5) * 0.025);
            if (!ok(p)) continue;
            const k = lerp(0.85, 1.12, this.rng());
            this.stones.add('cobble', p.x, ground(p) - 0.012, p.y, v3(k, lerp(0.8, 1.15, this.rng()), k), this.rng() * Math.PI * 2, 0.05, tone(COBBLE_TONES, 0.9, 1.08), 0.02 + this.rng() * 0.08, this.pathId);
          }
        }
        break;
      }
      case 'boardwalk': {
        // Weathered planks across the path with narrow gaps; each a little different in length,
        // set and tone, the odd one darker or shorter.
        if ((first || this.sinceRow >= 0.15) && !insideOther) {
          this.sinceRow = 0;
          this.row++;
          const p = at((this.rng() - 0.5) * 0.04);
          if (ok(p)) {
            const len = lerp(0.9, 1.0, this.rng()) * (this.rng() < 0.06 ? 0.85 : 1);
            this.stones.add('plank', p.x, ground(p) + 0.01 + this.rng() * 0.006, p.y, v3(1, lerp(0.95, 1.1, this.rng()), len), yaw + Math.PI / 2 + (this.rng() - 0.5) * 0.05, 0.12, tone(PLANK_TONES, this.rng() < 0.08 ? 0.75 : 0.92, 1.06), 0.03, this.pathId);
          }
        }
        break;
      }
      default:
        // Bark and earth paths: just the ground itself (and their edging, below).
        break;
    }

    // Edging: stone blocks, bricks on end, or timber, along both sides.
    if (look.edging) {
      const curbOffset = CURB_OFFSET * (1 + flare * flare * 0.7);
      const brick = look.edging === 'brick';
      [-1, 1].forEach((side, i) => {
        const e = w.clone().addScaledVector(perp, side * curbOffset);
        const last = this.lastCurb[i];
        if (!last) {
          this.lastCurb[i] = e;
          return;
        }
        const span = e.distanceTo(last);
        if (span > 0.9) {
          this.lastCurb[i] = e;
          return;
        }
        if (span < (brick ? 0.105 : this.curbTarget[i])) return;
        const mid = e.clone().add(last).multiplyScalar(0.5);
        const dir = e.clone().sub(last).normalize();
        this.lastCurb[i] = e;
        this.curbTarget[i] = lerp(0.26, 0.46, this.rng());
        if (this.distanceTo(mid.x, mid.y, false) < INSIDE * (1 + flare * 0.8) || this.blocked(mid.x, mid.y)) return;
        if (this.distanceTo(mid.x, mid.y, true) < INSIDE) return;
        if (this.rng() < 0.04) return;
        const ey = this.ground.heightAt(mid.x, mid.y);
        if (brick) {
          // Bricks set on end across the edge, like a soldier course.
          this.stones.add('brick', mid.x, ey - 0.03, mid.y, v3(1, lerp(1.2, 1.45, this.rng()), lerp(0.95, 1.05, this.rng())), Math.atan2(dir.x, dir.y) + Math.PI / 2 + (this.rng() - 0.5) * 0.08, 0.09, tone(BRICK_TONES, 0.8, 0.98), 0.08, this.pathId);
        } else {
          const tones = look.edging === 'timber' ? TIMBER_TONES : CURB_TONES;
          const scale = v3(lerp(0.85, 1.1, this.rng()), lerp(0.8, 1.15, this.rng()), (span - 0.025) / 0.4);
          this.stones.add('curb', mid.x, ey - lerp(0.035, 0.06, this.rng()), mid.y, scale, Math.atan2(dir.x, dir.y) + (this.rng() - 0.5) * 0.12, 0.1, tone(tones, 0.92, 1.06), 0.1, this.pathId);
        }
      });
    }

    // Clover, grass tufts and tiny flowers creep in along the edges.
    if (this.rng() < look.plants) {
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
    this.lastCurb = [null, null];
    this.curbTarget = [0.36, 0.36];
    this.active = null;
    this.pathId = 0;
    this.started = false;
    this.lines.clear();
    this.sinceRow = 0;
    this.row = 0;
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
