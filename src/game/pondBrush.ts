import * as THREE from 'three';
import { createNoise2D } from '../core/noise';
import { createRng, lerp } from '../core/random';
import type { Ponds, PondBody } from '../world/pond';
import type { PondPlants } from '../world/pondPlants';
import type { Fish } from '../world/fish';
import type { Stones } from '../world/stones';
import type { Wildflowers } from '../world/wildflowers';
import type { Dust } from '../world/dust';
import type { Season } from '../world/season';

const DAB_STEP = 0.3; // metres between dabs along a stroke
const RADIUS = 1.9; // pond reaches this far either side of your finger
const MIN_RADIUS = 0.6;
const ROCK_TONES = ['#a39b8f', '#8f877c', '#b3aa9b', '#9b8f80', '#7f786f', '#b8ad9c', '#a8a091'];
const LILY_COLORS = ['#fbf7f1', '#fbf7f1', '#f4bfd0', '#f8dbe1'];

/**
 * Digs ponds. The pond spreads out from under your finger as you draw (or as a round pool if you
 * just tap); when you let go the water wells up, rocks settle round the shore, and lily pads,
 * reeds and fish follow over the next few seconds.
 */
export class PondBrush {
  private rng = createRng(2468);
  private readonly zones = createNoise2D(1357);
  private last: THREE.Vector2 | null = null;
  private dabs = 0;
  private start = new THREE.Vector2();
  private trail: THREE.Vector2[] = [];
  private readonly v2 = new THREE.Vector2();

  constructor(
    private readonly ponds: Ponds,
    private readonly plants: PondPlants,
    private readonly fish: Fish,
    private readonly stones: Stones,
    private readonly wildflowers: Wildflowers,
    private readonly dust: Dust,
    private readonly season: Season,
    /** Places a pond mustn't reach: the cottage, paths, flower beds, the woods. */
    private readonly blocked: (x: number, z: number) => boolean,
  ) {}

  /** Back to an untouched garden (before an undo replays what remains). */
  reset() {
    this.rng = createRng(2468);
    this.last = null;
    this.dabs = 0;
    this.trail = [];
  }

  begin(p: THREE.Vector3) {
    this.ponds.beginStroke();
    this.last = new THREE.Vector2(p.x, p.z);
    this.start.copy(this.last);
    this.dabs = 0;
    this.trail = [this.start.clone()];
    this.dab(p.x, p.z, RADIUS);
  }

  extend(p: THREE.Vector3) {
    if (!this.last) return;
    const to = new THREE.Vector2(p.x, p.z);
    let d = to.distanceTo(this.last);
    while (d >= DAB_STEP) {
      this.last.addScaledVector(to.clone().sub(this.last).normalize(), DAB_STEP);
      this.dab(this.last.x, this.last.y, RADIUS);
      this.trail.push(this.last.clone());
      d = to.distanceTo(this.last);
    }
  }

  end() {
    if (!this.last) return;
    // Just a tap: a rounder pool, lobed a little, centred where you touched.
    if (this.dabs <= 1) {
      const a0 = this.rng() * Math.PI * 2;
      for (let k = 0; k < 3; k++) {
        const a = a0 + (k / 3) * Math.PI * 2 + (this.rng() - 0.5) * 0.6;
        this.dab(this.start.x + Math.cos(a) * 0.8, this.start.y + Math.sin(a) * 0.8, RADIUS * lerp(0.85, 1.0, this.rng()));
      }
    } else if (this.isLoop()) {
      // Drawn round in a loop: the pond fills the whole shape you drew.
      this.ponds.fillOutline(this.trail, 0.5);
    }
    this.last = null;
    const changed = this.ponds.endStroke();
    if (changed.length) this.wildflowers.clearIf((x, z) => this.ponds.inside(x, z) > -0.4);
    for (const body of changed) this.dress(body);
  }

  /** Did the stroke come back round to where it started, enclosing an area worth filling? */
  private isLoop(): boolean {
    const t = this.trail;
    const length = t.length * DAB_STEP;
    if (length < 6 || t[0].distanceTo(t[t.length - 1]) > Math.max(1.8, length * 0.2)) return false;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of t) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.y); z1 = Math.max(z1, p.y);
    }
    // Never dig over a bed or path you've drawn round.
    for (let x = x0; x <= x1; x += 0.4) {
      for (let z = z0; z <= z1; z += 0.4) {
        if (this.inside(x, z) && this.blocked(x, z)) return false;
      }
    }
    return true;
  }

  private inside(px: number, pz: number): boolean {
    let inside = false;
    const t = this.trail;
    for (let k = 0, l = t.length - 1; k < t.length; l = k++) {
      if (t[l].y > pz !== t[k].y > pz && px < ((t[k].x - t[l].x) * (pz - t[l].y)) / (t[k].y - t[l].y) + t[l].x) inside = !inside;
    }
    return inside;
  }

  /** Dig one dab, shrinking it where it would run into a path, bed or the cottage. */
  private dab(x: number, z: number, radius: number) {
    if (this.blocked(x, z)) return;
    let r = radius;
    while (r >= MIN_RADIUS && !this.fits(x, z, r)) r -= 0.15;
    if (r < MIN_RADIUS) return;
    this.ponds.dab(x, z, r);
    this.dabs++;
    this.wildflowers.clearNear(x, z, r + 0.4);
    if (this.dabs % 3 === 1) this.dust.puff(new THREE.Vector3(x, this.ponds.bedHeight(x, z), z), 3, 0.6);
  }

  private fits(x: number, z: number, r: number): boolean {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      if (this.blocked(x + Math.cos(a) * (r + 0.3), z + Math.sin(a) * (r + 0.3))) return false;
    }
    return true;
  }

  /** Rocks, reeds, lily pads and fish for a pond that has just been dug or grown. */
  private dress(body: PondBody) {
    let cx = 0;
    let cz = 0;
    for (const v of body.cells) {
      this.ponds.cellPosition(v, this.v2);
      cx += this.v2.x;
      cz += this.v2.y;
    }
    cx /= body.cells.length;
    cz /= body.cells.length;
    let span = 0;
    for (const v of body.cells) span = Math.max(span, this.ponds.cellPosition(v, this.v2).distanceTo(new THREE.Vector2(cx, cz)));

    // Rocks and reeds the pond has grown over sink out of sight.
    this.stones.removeIf(cx, cz, span + 1, 'shore', (x, z) => this.ponds.inside(x, z) > 0.45);
    this.plants.removeIf((x, z, reed) => reed && this.ponds.inside(x, z) > 0.7);

    // Work round the shore in order, so rocks settle one after another like someone placing them.
    const rim = this.ponds
      .rim(body)
      .map((v) => {
        const p = this.ponds.cellPosition(v, new THREE.Vector2());
        return { x: p.x, z: p.y, a: Math.atan2(p.y - cz, p.x - cx) };
      })
      .sort((a, b) => a.a - b.a);
    let delay = 0.3;
    const reedDelay = 3.2;
    for (const e of rim) {
      if (this.blocked(e.x, e.z)) continue;
      // Inward direction, from the field's gradient.
      const gx = this.ponds.inside(e.x + 0.05, e.z) - this.ponds.inside(e.x - 0.05, e.z);
      const gz = this.ponds.inside(e.x, e.z + 0.05) - this.ponds.inside(e.x, e.z - 0.05);
      const gl = Math.hypot(gx, gz) || 1;
      const nx = gx / gl;
      const nz = gz / gl;
      // Walk in from the outline to the waterline: that's where rocks and reeds belong.
      let w = 0;
      while (w < 1.6 && this.ponds.bedHeight(e.x + nx * w, e.z + nz * w) > body.target + 0.03) w += 0.05;
      const wx = e.x + nx * w;
      const wz = e.z + nz * w;
      // Rocks gather in loose groups along the shore, with open stretches for reeds between.
      const rocky = this.zones(e.x * 0.45, e.z * 0.45) > -0.2;
      if (rocky && this.rng() < 0.8) {
        const big = this.rng() < 0.18;
        const size = big ? lerp(0.65, 0.95, this.rng()) : lerp(0.25, 0.55, this.rng() ** 1.3);
        // Half in, half out of the water; big ones sit back on the bank.
        const off = lerp(-0.2, 0.12, this.rng()) - (big ? 0.2 : 0);
        const x = wx + nx * off;
        const z = wz + nz * off;
        if (!this.stones.isOccupied(x, z, size * 0.42, 'shore') && !this.blocked(x, z)) {
          const tone = new THREE.Color(ROCK_TONES[Math.floor(this.rng() * ROCK_TONES.length)]).multiplyScalar(lerp(0.9, 1.08, this.rng()));
          const scale = new THREE.Vector3(size, size * lerp(0.7, 1.1, this.rng()), size * lerp(0.85, 1.1, this.rng()));
          const y = this.ponds.bedHeight(x, z) - size * lerp(0.08, 0.2, this.rng());
          this.stones.add('shore', x, y, z, scale, this.rng() * Math.PI * 2, size * 0.42, tone, delay);
          delay += 0.035;
        }
      }
      // Reeds stand in the shallows where the rocks leave room (and the odd clump among them).
      if ((!rocky && this.rng() < 0.35) || this.rng() < 0.03) {
        // A little stand of two or three clumps.
        for (let c = 0; c < 3; c++) {
          const off = lerp(-0.05, 0.45, this.rng());
          const side = (this.rng() - 0.5) * 0.5;
          const x = wx + nx * off - nz * side;
          const z = wz + nz * off + nx * side;
          if (this.plants.reedNear(x, z, 0.22) || this.stones.isOccupied(x, z, 0.12, 'shore')) continue;
          const h = lerp(0.7, 1.15, this.rng()) * (this.season === 'winter' ? 0.75 : 1);
          this.plants.reed(x, this.ponds.bedHeight(x, z) - 0.02, z, h, reedDelay + this.rng() * 3);
        }
      }
    }

    // Lily pads drift up in a few loose rafts on the open water.
    let open = 0;
    for (const v of body.cells) {
      this.ponds.cellPosition(v, this.v2);
      if (this.ponds.waterDepth(this.v2.x, this.v2.y) > 0.22) open++;
    }
    const rafts = Math.min(4, Math.max(open > 30 ? 1 : 0, Math.round((open * 0.038) / 5)));
    const placed: { x: number; z: number; r: number }[] = [];
    const flowering = this.season === 'spring' || this.season === 'summer';
    for (let k = 0; k < rafts; k++) {
      const v = body.cells[Math.floor(this.rng() * body.cells.length)];
      const c = this.ponds.cellPosition(v, new THREE.Vector2());
      if (this.ponds.waterDepth(c.x, c.y) < 0.22) continue;
      const count = 3 + Math.floor(this.rng() * 5);
      let got = 0;
      for (let n = 0; n < count * 3 && got < count; n++) {
        const a = this.rng() * Math.PI * 2;
        const d = Math.sqrt(this.rng()) * 0.7;
        const x = c.x + Math.cos(a) * d;
        const z = c.y + Math.sin(a) * d;
        const r = lerp(0.16, 0.3, this.rng());
        if (this.ponds.waterDepth(x, z) < 0.15 || this.ponds.inside(x, z) < r + 0.25) continue;
        if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r)) continue;
        placed.push({ x, z, r });
        got++;
        const t = 3.6 + placed.length * 0.35 + this.rng() * 0.8;
        this.plants.pad(x, body.target + 0.006, z, r, t);
        if (flowering && this.rng() < 0.3) {
          const col = LILY_COLORS[Math.floor(this.rng() * LILY_COLORS.length)];
          this.plants.lily(x + (this.rng() - 0.5) * r * 0.5, body.target + 0.015, z + (this.rng() - 0.5) * r * 0.5, lerp(0.08, 0.11, this.rng()), col, t + 1.2);
        }
      }
    }

    this.fish.stock(body, 4.2);
  }
}
