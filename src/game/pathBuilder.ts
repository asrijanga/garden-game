import * as THREE from 'three';
import { createRng, lerp } from '../core/random';
import type { Ground } from '../world/ground';
import type { GroundPaint } from '../world/groundPaint';
import type { Stones } from '../world/stones';
import type { EdgePlants } from '../world/edgePlants';
import type { Wildflowers } from '../world/wildflowers';

const STEP = 0.18; // metres the path advances per smoothing step
const STONE_SPACING = 0.86;
const WEAR_RADIUS = 0.92;
const DOOR_SNAP = 3.5; // paths ending this close to the door finish themselves

export interface PathRecord {
  seed: number;
  points: { x: number; z: number }[];
}

/**
 * Turns a finger stroke into a gently winding path. A "walker" follows the finger with a lazy,
 * smoothed heading (so wobbly strokes become graceful curves), wearing earth into the lawn and
 * dropping stepping stones one after another just behind the fingertip.
 */
export class PathBuilder {
  readonly records: PathRecord[] = [];
  private readonly rng = createRng(1234);
  private walker = new THREE.Vector2();
  private heading = new THREE.Vector2();
  private sinceStone = 0;
  private side = 1;
  private active: PathRecord | null = null;
  private autoDelay = 0;

  constructor(
    private readonly ground: Ground,
    private readonly paint: GroundPaint,
    private readonly stones: Stones,
    private readonly edges: EdgePlants,
    private readonly wildflowers: Wildflowers,
    private readonly blocked: (x: number, z: number) => boolean,
    private readonly door: THREE.Vector2,
  ) {}

  begin(p: THREE.Vector3) {
    this.active = { seed: Math.floor(this.rng() * 1e9), points: [] };
    this.records.push(this.active);
    this.heading.set(0, 0);
    this.sinceStone = STONE_SPACING; // first stone right where you touch
    const start = new THREE.Vector2(p.x, p.z);
    if (start.distanceTo(this.door) < DOOR_SNAP && start.distanceTo(this.door) > 0.4) {
      // Starting near the cottage: lay the path out from the doorstep to the finger first.
      this.walker.copy(this.door);
      this.auto(start);
    } else {
      this.walker.copy(start);
      this.stepAt(this.walker, 0.05);
    }
  }

  extend(p: THREE.Vector3) {
    if (!this.active) return;
    this.walkToward(new THREE.Vector2(p.x, p.z), 0.08, false);
  }

  end(connectToDoor = true) {
    if (!this.active) return;
    const d = this.walker.distanceTo(this.door);
    if (connectToDoor && d < DOOR_SNAP && d > 0.5) this.auto(this.door);
    this.active = null;
  }

  /** Builds on its own toward `target`, stones settling one after another. */
  private auto(target: THREE.Vector2) {
    this.autoDelay = 0.05;
    this.walkToward(target, -1, true);
  }

  private walkToward(target: THREE.Vector2, delay: number, auto: boolean) {
    const dir = new THREE.Vector2();
    for (let guard = 0; guard < 400; guard++) {
      dir.subVectors(target, this.walker);
      const dist = dir.length();
      if (dist < (auto ? 0.25 : STEP * 1.5)) break;
      dir.divideScalar(dist);
      // Lazy steering: the heading turns gradually, which smooths jitter into curves.
      if (this.heading.lengthSq() === 0) this.heading.copy(dir);
      else this.heading.lerp(dir, auto ? 0.3 : 0.22).normalize();
      // If the finger doubled back sharply, turn faster rather than orbit.
      if (this.heading.dot(dir) < 0) this.heading.lerp(dir, 0.6).normalize();
      this.walker.addScaledVector(this.heading, STEP);
      this.sinceStone += STEP;
      let d = delay;
      if (auto) {
        this.autoDelay += 0.03;
        d = this.autoDelay;
      }
      this.stepAt(this.walker, d);
    }
  }

  private stepAt(w: THREE.Vector2, delay: number) {
    if (this.blocked(w.x, w.y)) return;
    this.active?.points.push({ x: w.x, z: w.y });
    // Width breathes along the path, with the odd scuff off to one side: a worn trail, not a stripe.
    this.paint.wear(w.x, w.y, WEAR_RADIUS * lerp(0.82, 1.08, this.rng()));
    if (this.rng() < 0.25) {
      const k = (this.rng() - 0.5) * 1.1;
      this.paint.wear(w.x - this.heading.y * k, w.y + this.heading.x * k, lerp(0.35, 0.6, this.rng()), 0.8);
    }
    this.wildflowers.clearNear(w.x, w.y, 1.15);

    const perp = new THREE.Vector2(-this.heading.y, this.heading.x);
    if (this.sinceStone >= STONE_SPACING) {
      this.sinceStone = 0;
      this.side = -this.side;
      const off = this.side * lerp(0.12, 0.26, this.rng());
      const sx = w.x + perp.x * off + (this.rng() - 0.5) * 0.08;
      const sz = w.y + perp.y * off + (this.rng() - 0.5) * 0.08;
      if (!this.stones.isOccupied(sx, sz, 0.62)) {
        this.stones.add(sx, this.ground.heightAt(sx, sz) - 0.02, sz, lerp(0.34, 0.46, this.rng()), Math.max(0, delay));
        // Now and then a smaller companion stone fills out the width.
        if (this.rng() < 0.45) {
          const cx = w.x - perp.x * (off + this.side * 0.5);
          const cz = w.y - perp.y * (off + this.side * 0.5);
          if (!this.stones.isOccupied(cx, cz, 0.4)) {
            this.stones.add(cx, this.ground.heightAt(cx, cz) - 0.02, cz, lerp(0.18, 0.26, this.rng()), Math.max(0, delay) + 0.08);
          }
        }
      }
    }

    // Clover and tiny flowers creep in along both edges a moment later.
    if (this.rng() < 0.42) {
      const s = this.rng() < 0.5 ? -1 : 1;
      const o = lerp(0.85, 1.2, this.rng());
      const ex = w.x + perp.x * s * o + (this.rng() - 0.5) * 0.2;
      const ez = w.y + perp.y * s * o + (this.rng() - 0.5) * 0.2;
      if (!this.blocked(ex, ez) && !this.stones.isOccupied(ex, ez, 0.55)) {
        this.edges.add(ex, this.ground.heightAt(ex, ez), ez, Math.max(0, delay) + lerp(0.7, 1.6, this.rng()));
      }
    }
  }
}
