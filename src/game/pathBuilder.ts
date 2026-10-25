import * as THREE from 'three';
import { createRng, lerp } from '../core/random';
import type { Ground } from '../world/ground';
import type { GroundPaint } from '../world/groundPaint';
import type { Stones } from '../world/stones';
import type { EdgePlants } from '../world/edgePlants';
import type { Wildflowers } from '../world/wildflowers';

const STEP = 0.12; // metres the path advances per smoothing step
const STONE_SPACING = 0.58; // centre stones
const GRAVEL_RADIUS = 0.9; // painted gravel; its edge sits under the edging
const CURB_OFFSET = 0.62; // centre line → edging stone centre
const CURB_LENGTH = 0.4;

const STONE_TONES = ['#d6cfc3', '#cdc5b7', '#dcd4c6', '#c8c1b5', '#d2c8b6'];
const CURB_TONES = ['#b4ab9d', '#aaa294', '#bab1a2', '#a59d91'];

export interface PathRecord {
  seed: number;
  points: { x: number; z: number }[];
}

/**
 * A simple, tidy garden path: rounded-square stones down the middle, pale gravel either side,
 * and neat cut-stone edging. It starts exactly where you touch and follows just behind your
 * finger, with light smoothing so wobbles become gentle curves.
 */
export class PathBuilder {
  readonly records: PathRecord[] = [];
  private readonly rng = createRng(1234);
  private walker = new THREE.Vector2();
  private heading = new THREE.Vector2();
  private sinceStone = 0;
  private lastCurb: (THREE.Vector2 | null)[] = [null, null];
  private active: PathRecord | null = null;
  private pathId = 0;
  private started = false;

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
    this.heading.set(0, 0);
    this.lastCurb = [null, null];
    this.sinceStone = 0;
    this.started = false;
    // Gravel appears under the finger straight away.
    if (!this.blocked(p.x, p.z)) this.paint.wear(p.x, p.z, GRAVEL_RADIUS, 1, 1);
  }

  extend(p: THREE.Vector3) {
    if (!this.active) return;
    const target = new THREE.Vector2(p.x, p.z);
    const dir = new THREE.Vector2();
    for (let guard = 0; guard < 300; guard++) {
      dir.subVectors(target, this.walker);
      const dist = dir.length();
      if (dist < STEP) break;
      dir.divideScalar(dist);
      // Light smoothing: the heading eases toward the finger, so jitter becomes gentle curves.
      if (this.heading.lengthSq() === 0) this.heading.copy(dir);
      else this.heading.lerp(dir, 0.35).normalize();
      if (!this.started) {
        // The very first stone sits exactly where the stroke began, facing the way you set off.
        this.started = true;
        this.stepAt(this.walker, true);
      }
      this.walker.addScaledVector(this.heading, STEP);
      this.stepAt(this.walker, false);
    }
  }

  end() {
    this.active = null;
  }

  private stepAt(w: THREE.Vector2, first: boolean) {
    if (this.blocked(w.x, w.y)) {
      this.lastCurb = [null, null]; // break the edging cleanly at obstacles
      return;
    }
    this.active?.points.push({ x: w.x, z: w.y });
    this.paint.wear(w.x, w.y, GRAVEL_RADIUS, 1, 1);
    this.wildflowers.clearNear(w.x, w.y, 1.1);

    // Centre stones.
    this.sinceStone += first ? 0 : STEP;
    if (first || this.sinceStone >= STONE_SPACING) {
      this.sinceStone = 0;
      if (!this.stones.isOccupied(w.x, w.y, 0.18, 'step')) {
        const tone = new THREE.Color(STONE_TONES[Math.floor(this.rng() * STONE_TONES.length)]).multiplyScalar(lerp(0.96, 1.04, this.rng()));
        const yaw = Math.atan2(this.heading.x, this.heading.y) + (this.rng() - 0.5) * 0.12;
        const scale = new THREE.Vector3(1, 1, 1).multiplyScalar(lerp(0.95, 1.05, this.rng()));
        this.stones.add('step', w.x, this.ground.heightAt(w.x, w.y) - 0.03, w.y, scale, yaw, 0.2, tone, 0.05, this.pathId);
      }
    }

    // Edging: each side measures its own distance, so blocks stay evenly spaced round curves.
    const perp = new THREE.Vector2(-this.heading.y, this.heading.x);
    [-1, 1].forEach((side, i) => {
      const at = w.clone().addScaledVector(perp, side * CURB_OFFSET);
      const last = this.lastCurb[i];
      if (!last) {
        this.lastCurb[i] = at;
        return;
      }
      const span = at.distanceTo(last);
      if (span > CURB_LENGTH * 2) {
        // A sharp swing moved this edge a long way: restart it rather than bridging the path.
        this.lastCurb[i] = at;
        return;
      }
      if (span < CURB_LENGTH + 0.015) return;
      const mid = at.clone().add(last).multiplyScalar(0.5);
      const dir = at.clone().sub(last).normalize();
      this.lastCurb[i] = at;
      // Never let edging land inside a path (this one on a tight bend, or another one).
      if (this.distanceToPath(mid) < CURB_OFFSET - 0.12 || this.stones.isOccupied(mid.x, mid.y, 0.1)) return;
      if (this.blocked(mid.x, mid.y)) return;
      const tone = new THREE.Color(CURB_TONES[Math.floor(this.rng() * CURB_TONES.length)]).multiplyScalar(lerp(0.96, 1.04, this.rng()));
      const scale = new THREE.Vector3(1, lerp(0.95, 1.05, this.rng()), Math.min(1.15, Math.max(0.85, span / CURB_LENGTH)));
      this.stones.add('curb', mid.x, this.ground.heightAt(mid.x, mid.y) - 0.03, mid.y, scale, Math.atan2(dir.x, dir.y), 0.12, tone, 0.1, this.pathId);
    });

    // Clover and tiny flowers grow along the outside of the edging a moment later.
    if (this.rng() < 0.25) {
      const s = this.rng() < 0.5 ? -1 : 1;
      const o = lerp(0.82, 1.0, this.rng());
      const ex = w.x + perp.x * s * o + (this.rng() - 0.5) * 0.2;
      const ez = w.y + perp.y * s * o + (this.rng() - 0.5) * 0.2;
      if (!this.blocked(ex, ez) && this.distanceToPath(new THREE.Vector2(ex, ez)) > 0.78 && !this.stones.isOccupied(ex, ez, 0.12)) {
        this.edges.add(ex, this.ground.heightAt(ex, ez), ez, lerp(0.7, 1.6, this.rng()));
      }
    }
  }

  /** Distance from p to the nearest centre-line point of any path drawn so far. */
  private distanceToPath(p: THREE.Vector2): number {
    let best = Infinity;
    for (const r of this.records) {
      for (const q of r.points) best = Math.min(best, (q.x - p.x) ** 2 + (q.z - p.y) ** 2);
    }
    return Math.sqrt(best);
  }
}
