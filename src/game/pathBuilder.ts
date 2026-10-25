import * as THREE from 'three';
import { createRng, lerp } from '../core/random';
import type { Ground } from '../world/ground';
import type { GroundPaint } from '../world/groundPaint';
import type { Stones } from '../world/stones';
import type { EdgePlants } from '../world/edgePlants';
import type { Wildflowers } from '../world/wildflowers';

const STEP = 0.16; // metres the path advances per smoothing step
const WEAR_RADIUS = 0.95;
const CURB_OFFSET = 0.64; // centre line → edging stone centre
const CURB_LENGTH = 0.4;
const INNER_HALF = 0.55; // half-width of the paved area inside the edging
const SLAB_GAP = 0.04;
const DOOR_SNAP = 3.5; // paths ending this close to the door finish themselves

const SLAB_TONES = ['#d3cabb', '#c6bcab', '#dcd3c3', '#bdb6aa', '#cbbfa8', '#c9c3b8'];
const MOSSY_TONES = ['#aeb393', '#a3ab8a', '#b6b89c'];
const CURB_TONES = ['#b4ab9d', '#aaa294', '#bab1a2', '#a59d91'];

export interface PathRecord {
  seed: number;
  style: string;
  points: { x: number; z: number }[];
}

/**
 * Turns a finger stroke into a neat flagstone path. A "walker" follows the finger with a lazy,
 * smoothed heading (so wobbly strokes become graceful curves). Behind it, rows of hand-cut
 * flagstones are fitted across the path, moss creeps into the joints, and neatly cut edging
 * stones line both sides, following every curve.
 */
export class PathBuilder {
  readonly records: PathRecord[] = [];
  private readonly rng = createRng(1234);
  private walker = new THREE.Vector2();
  private heading = new THREE.Vector2();
  private sinceRow = 0;
  private rowLength = 0.45;
  private rowsLaid = 0;
  private lastCurb: (THREE.Vector2 | null)[] = [null, null];
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
    this.active = { seed: Math.floor(this.rng() * 1e9), style: 'flagstones', points: [] };
    this.records.push(this.active);
    this.heading.set(0, 0);
    this.sinceRow = 0;
    this.rowsLaid = 0;
    this.lastCurb = [null, null];
    const start = new THREE.Vector2(p.x, p.z);
    if (start.distanceTo(this.door) < DOOR_SNAP && start.distanceTo(this.door) > 0.4) {
      // Starting near the cottage: lay the path out from the doorstep to the finger first.
      this.walker.copy(this.door);
      this.auto(start);
    } else {
      this.walker.copy(start);
    }
  }

  extend(p: THREE.Vector3) {
    if (!this.active) return;
    this.walkToward(new THREE.Vector2(p.x, p.z), 0.06, false);
  }

  end(connectToDoor = true) {
    if (!this.active) return;
    const d = this.walker.distanceTo(this.door);
    if (connectToDoor && d < DOOR_SNAP && d > 0.5) this.auto(this.door);
    else if (this.rowsLaid > 0) this.endCap(this.walker, this.heading, 0.3);
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
      else this.heading.lerp(dir, auto ? 0.3 : 0.2).normalize();
      // If the finger doubled back sharply, turn faster rather than orbit.
      if (this.heading.dot(dir) < 0) this.heading.lerp(dir, 0.6).normalize();
      this.walker.addScaledVector(this.heading, STEP);
      let d = delay;
      if (auto) {
        this.autoDelay += 0.03;
        d = this.autoDelay;
      }
      this.stepAt(this.walker, Math.max(0, d));
    }
  }

  private stepAt(w: THREE.Vector2, delay: number) {
    if (this.blocked(w.x, w.y)) {
      this.lastCurb = [null, null]; // break the edging cleanly at obstacles
      return;
    }
    this.active?.points.push({ x: w.x, z: w.y });
    this.paint.wear(w.x, w.y, WEAR_RADIUS);
    this.wildflowers.clearNear(w.x, w.y, 1.2);
    const perp = new THREE.Vector2(-this.heading.y, this.heading.x);

    // Flagstones: a row of 2–3 hand-cut slabs fitted across the path.
    this.sinceRow += STEP;
    if (this.sinceRow >= this.rowLength) {
      const centre = w.clone().addScaledVector(this.heading, -this.rowLength / 2);
      this.layRow(centre, perp, this.rowLength, delay);
      if (this.rowsLaid === 0) this.endCap(w.clone().addScaledVector(this.heading, -this.rowLength), this.heading.clone().negate(), delay);
      this.rowsLaid++;
      this.sinceRow = 0;
      this.rowLength = lerp(0.38, 0.52, this.rng());
    }

    // Edging: each side measures its own distance, so blocks stay evenly spaced round curves.
    [-1, 1].forEach((side, i) => {
      const at = w.clone().addScaledVector(perp, side * CURB_OFFSET);
      const last = this.lastCurb[i];
      if (!last) {
        this.lastCurb[i] = at;
        return;
      }
      const span = at.distanceTo(last);
      if (span < CURB_LENGTH + 0.015) return;
      const mid = at.clone().add(last).multiplyScalar(0.5);
      const dir = at.clone().sub(last).normalize();
      this.lastCurb[i] = at;
      this.placeCurb(mid, Math.atan2(dir.x, dir.y), span / CURB_LENGTH, delay + 0.05);
    });

    // Clover and tiny flowers grow along the outside of the edging a moment later.
    if (this.rng() < 0.3) {
      const s = this.rng() < 0.5 ? -1 : 1;
      const o = lerp(0.82, 1.05, this.rng());
      const ex = w.x + perp.x * s * o + (this.rng() - 0.5) * 0.2;
      const ez = w.y + perp.y * s * o + (this.rng() - 0.5) * 0.2;
      if (!this.blocked(ex, ez) && !this.stones.isOccupied(ex, ez, 0.12)) {
        this.edges.add(ex, this.ground.heightAt(ex, ez), ez, delay + lerp(0.7, 1.6, this.rng()));
      }
    }
  }

  private layRow(c: THREE.Vector2, perp: THREE.Vector2, length: number, delay: number) {
    const width = INNER_HALF * 2;
    const pieces = this.rng() < 0.6 ? 2 : 3;
    // Random but tidy split points across the width.
    const cuts = [0];
    for (let i = 1; i < pieces; i++) cuts.push((i / pieces) * width + (this.rng() - 0.5) * 0.18);
    cuts.push(width);
    const yaw = Math.atan2(this.heading.x, this.heading.y);
    for (let i = 0; i < pieces; i++) {
      const w = cuts[i + 1] - cuts[i];
      const across = -INNER_HALF + (cuts[i] + cuts[i + 1]) / 2;
      const x = c.x + perp.x * across;
      const z = c.y + perp.y * across;
      // Where this path crosses another, its edging steps aside and the paving joins up.
      this.stones.removeNear(x, z, Math.max(w, length) * 0.55, 'curb');
      const r = Math.min(w, length) * 0.42;
      if (this.stones.isOccupied(x, z, r, 'slab')) continue;
      const mossy = this.rng() < 0.14;
      const tone = new THREE.Color((mossy ? MOSSY_TONES : SLAB_TONES)[Math.floor(this.rng() * (mossy ? MOSSY_TONES.length : SLAB_TONES.length))]).multiplyScalar(lerp(0.95, 1.05, this.rng()));
      const y = this.ground.heightAt(x, z) - 0.035 + this.rng() * 0.008; // tiny jitter: no z-fighting
      const scale = new THREE.Vector3(w - SLAB_GAP, 1, length - SLAB_GAP);
      this.stones.add('slab', x, y, z, scale, yaw + (this.rng() - 0.5) * 0.04, r, tone, delay + i * 0.05);
    }
  }

  private placeCurb(mid: THREE.Vector2, yaw: number, stretch: number, delay: number, room = 0.1) {
    // Skip if another edging block is here, or if it would sit on another path's paving.
    if (this.blocked(mid.x, mid.y) || this.stones.isOccupied(mid.x, mid.y, room, 'curb') || this.stones.isOccupied(mid.x, mid.y, 0.04, 'slab')) return;
    const tone = new THREE.Color(CURB_TONES[Math.floor(this.rng() * CURB_TONES.length)]).multiplyScalar(lerp(0.96, 1.04, this.rng()));
    const y = this.ground.heightAt(mid.x, mid.y) - 0.03;
    const scale = new THREE.Vector3(1, lerp(0.95, 1.05, this.rng()), Math.min(1.15, Math.max(0.85, stretch)));
    this.stones.add('curb', mid.x, y, mid.y, scale, yaw + (this.rng() - 0.5) * 0.03, 0.12, tone, delay);
  }

  /** Edging blocks laid across the end of the path, finishing it neatly. */
  private endCap(at: THREE.Vector2, heading: THREE.Vector2, delay: number) {
    const perp = new THREE.Vector2(-heading.y, heading.x);
    const yaw = Math.atan2(perp.x, perp.y);
    const tip = at.clone().addScaledVector(heading, 0.06);
    [-1, 0, 1].forEach((s, i) => {
      const p = tip.clone().addScaledVector(perp, s * 0.41);
      this.placeCurb(p, yaw, 1.0, delay + i * 0.05, 0.05);
    });
  }
}
