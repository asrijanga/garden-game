import * as THREE from 'three';
import { createRng, lerp } from '../core/random';
import type { Ground } from '../world/ground';
import type { GroundPaint } from '../world/groundPaint';
import type { StoneFamily, Stones } from '../world/stones';
import type { EdgePlants } from '../world/edgePlants';
import type { Wildflowers } from '../world/wildflowers';

const STEP = 0.18; // metres the path advances per smoothing step
const WEAR_RADIUS = 1.02;

/**
 * Each new path picks one of these at random, so the garden fills with a variety of walks.
 *  - layout 'step':    stones alternate side to side along the middle
 *  - layout 'pairs':   rows of slabs laid across the width
 *  - layout 'scatter': many small stones scattered across the trail
 */
interface PathStyle {
  name: string;
  weight: number;
  family: StoneFamily[];
  size: [number, number];
  layout: 'step' | 'pairs' | 'scatter';
  spacing: number; // metres between stones / rows / scatter batches
  perBatch?: number; // scatter: stones per batch
  tones: string[];
  sand: number;
  width: number; // multiplier on the worn width
}

const STYLES: PathStyle[] = [
  { name: 'stepping stones', weight: 3, family: ['flat'], size: [0.16, 0.25], layout: 'step', spacing: 0.6, tones: ['#d6cfc2', '#c7c0b4', '#ddd3c1', '#bdb7ad', '#d0c2ab'], sand: 0, width: 0.85 },
  { name: 'cobbles', weight: 2, family: ['pebble'], size: [0.07, 0.12], layout: 'scatter', spacing: 0.2, perBatch: 3, tones: ['#b8b0a5', '#a49c90', '#c9bfb0', '#9a8f80', '#b9a78f', '#8f8a84'], sand: 0.25, width: 0.9 },
  { name: 'flagstones', weight: 2, family: ['flat'], size: [0.19, 0.27], layout: 'pairs', spacing: 0.52, tones: ['#a9aeb1', '#9ba1a6', '#b6b6ae', '#8f979c', '#a8a397'], sand: 0.1, width: 1.0 },
  { name: 'gravel trail', weight: 2, family: ['pebble', 'angular'], size: [0.045, 0.08], layout: 'scatter', spacing: 0.18, perBatch: 2, tones: ['#a99f8e', '#8f877a', '#b8ab95', '#9c9282', '#c9bea8'], sand: 1, width: 0.9 },
  { name: 'mossy stones', weight: 2, family: ['angular', 'flat'], size: [0.14, 0.22], layout: 'step', spacing: 0.55, tones: ['#9fa88f', '#8f9a80', '#b0b4a0', '#a3a38f', '#879377'], sand: 0, width: 0.8 },
];

function pickStyle(rng: () => number): PathStyle {
  const total = STYLES.reduce((a, s) => a + s.weight, 0);
  let r = rng() * total;
  for (const s of STYLES) if ((r -= s.weight) <= 0) return s;
  return STYLES[0];
}
const DOOR_SNAP = 3.5; // paths ending this close to the door finish themselves

export interface PathRecord {
  seed: number;
  style: string;
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
  private style: PathStyle = STYLES[0];

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
    this.style = pickStyle(this.rng);
    this.active = { seed: Math.floor(this.rng() * 1e9), style: this.style.name, points: [] };
    this.records.push(this.active);
    this.heading.set(0, 0);
    this.sinceStone = this.style.spacing; // first stone right where you touch
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
    const sand = this.style.sand;
    this.paint.wear(w.x, w.y, WEAR_RADIUS * this.style.width * lerp(0.82, 1.08, this.rng()), 1, sand);
    if (this.rng() < 0.25) {
      const k = (this.rng() - 0.5) * 1.1;
      this.paint.wear(w.x - this.heading.y * k, w.y + this.heading.x * k, lerp(0.45, 0.8, this.rng()), 2.5, sand);
    }
    // Small scuffs along both edges so the outline wanders irregularly.
    for (const side of [-1, 1]) {
      if (this.rng() < 0.55) {
        const k = side * lerp(0.55, 0.95, this.rng());
        this.paint.wear(w.x - this.heading.y * k, w.y + this.heading.x * k, lerp(0.25, 0.45, this.rng()), lerp(1.5, 3, this.rng()), sand);
      }
    }
    this.wildflowers.clearNear(w.x, w.y, 1.15);

    const perp = new THREE.Vector2(-this.heading.y, this.heading.x);
    if (this.sinceStone >= this.style.spacing) {
      this.sinceStone = 0;
      this.placeStones(w, perp, Math.max(0, delay));
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

  private placeStones(w: THREE.Vector2, perp: THREE.Vector2, delay: number) {
    const st = this.style;
    const put = (x: number, z: number, size: number, d: number) => {
      if (this.blocked(x, z) || this.stones.isOccupied(x, z, size * 0.85)) return;
      const family = st.family[Math.floor(this.rng() * st.family.length)];
      const tone = new THREE.Color(st.tones[Math.floor(this.rng() * st.tones.length)]).multiplyScalar(lerp(0.93, 1.07, this.rng()));
      this.stones.add(family, x, this.ground.heightAt(x, z) - size * 0.08, z, size, tone, d);
    };
    const size = () => lerp(st.size[0], st.size[1], this.rng());
    const half = 0.55 * st.width;

    if (st.layout === 'step') {
      this.side = -this.side;
      const off = this.side * lerp(0.08, 0.22, this.rng());
      put(w.x + perp.x * off + (this.rng() - 0.5) * 0.06, w.y + perp.y * off + (this.rng() - 0.5) * 0.06, size(), delay);
      if (this.rng() < 0.3) {
        const o = off - this.side * 0.38;
        put(w.x + perp.x * o, w.y + perp.y * o, size() * 0.6, delay + 0.07);
      }
    } else if (st.layout === 'pairs') {
      const shift = (this.rng() - 0.5) * 0.12;
      for (const sgn of [-1, 1]) {
        const o = sgn * 0.27 + shift;
        put(w.x + perp.x * o, w.y + perp.y * o, size(), delay + (sgn > 0 ? 0.06 : 0));
      }
    } else {
      for (let i = 0; i < (st.perBatch ?? 3); i++) {
        const o = (this.rng() * 2 - 1) * half * 0.85;
        const a = (this.rng() - 0.5) * st.spacing;
        put(w.x + perp.x * o + this.heading.x * a, w.y + perp.y * o + this.heading.y * a, size(), delay + i * 0.04);
      }
    }
  }
}
