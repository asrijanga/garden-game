import * as THREE from 'three';
import { createRng, lerp } from '../core/random';
import type { Ground } from '../world/ground';
import type { GroundPaint } from '../world/groundPaint';
import type { Stones } from '../world/stones';
import type { Paving } from '../world/paving';
import type { EdgePlants } from '../world/edgePlants';
import type { Wildflowers } from '../world/wildflowers';

const STEP = 0.16; // metres the path advances per smoothing step
const WEAR_RADIUS = 0.95;
const CURB_OFFSET = 0.64; // centre line → edging stone centre
const CURB_LENGTH = 0.4;
const HALF = 0.55; // half-width of the paved area inside the edging
const ROW = 0.4; // average flagstone row length along the path
const GAP = 0.022; // mortar joint half-width
const SLAB_TOP = 0.035;
const DOOR_SNAP = 3.5; // paths ending this close to the door finish themselves
const MAX_TURN = STEP / 1.05; // radians per step: minimum turning radius ≈ 1.05 m

const SLAB_TONES = ['#d3cabb', '#c6bcab', '#dcd3c3', '#bdb6aa', '#cbbfa8', '#c9c3b8', '#d6c8b0'];
const MOSSY_TONES = ['#aeb393', '#a3ab8a', '#b6b89c'];
const CURB_TONES = ['#b4ab9d', '#aaa294', '#bab1a2', '#a59d91'];

export interface PathRecord {
  seed: number;
  style: string;
  points: { x: number; z: number }[];
}

type P2 = [number, number]; // (s along, t across)

/** Deterministic 0..1 hash of three integers. */
function hash(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Keep the part of a convex polygon where dot(p, n) <= d. */
function clip(poly: P2[], nx: number, ny: number, d: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = a[0] * nx + a[1] * ny - d;
    const db = b[0] * nx + b[1] * ny - d;
    if (da <= 0) out.push(a);
    if (da * db < 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/**
 * Turns a finger stroke into a neat crazy-paving path. A "walker" follows the finger with a
 * lazy, smoothed heading (so wobbly strokes become graceful curves) and records the centre
 * line. Behind it, flagstones are cut as Voronoi cells laid out in path coordinates (along s,
 * across t) and then bent along the curve: every stone is a unique polygon, and neighbours
 * always share their edges, so they fit together around bends. Neatly cut edging lines both
 * sides, and moss creeps into the joints.
 */
export class PathBuilder {
  readonly records: PathRecord[] = [];
  private readonly rng = createRng(1234);
  private walker = new THREE.Vector2();
  private heading = new THREE.Vector2();
  private lastCurb: (THREE.Vector2 | null)[] = [null, null];
  private active: PathRecord | null = null;
  private autoDelay = 0;
  private pathId = 0;
  // Centre line of the active path, one sample per STEP of arc length.
  private line: { p: THREE.Vector2; n: THREE.Vector2; h: THREE.Vector2 }[] = [];
  private rowsDone = 0;

  constructor(
    private readonly ground: Ground,
    private readonly paint: GroundPaint,
    private readonly stones: Stones,
    private readonly paving: Paving,
    private readonly edges: EdgePlants,
    private readonly wildflowers: Wildflowers,
    private readonly blocked: (x: number, z: number) => boolean,
    private readonly door: THREE.Vector2,
  ) {}

  begin(p: THREE.Vector3) {
    this.pathId++;
    this.active = { seed: Math.floor(this.rng() * 1e9), style: 'flagstones', points: [] };
    this.records.push(this.active);
    this.heading.set(0, 0);
    this.lastCurb = [null, null];
    this.line = [];
    this.rowsDone = 0;
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
    this.walkToward(new THREE.Vector2(p.x, p.z), 0, false);
  }

  end(connectToDoor = true) {
    if (!this.active) return;
    const d = this.walker.distanceTo(this.door);
    const toDoor = connectToDoor && d < DOOR_SNAP && d > 0.5;
    if (toDoor) this.auto(this.door);
    // Lay the remaining rows, cut square at the end of the path.
    const sEnd = (this.line.length - 1) * STEP;
    const delay = toDoor ? this.autoDelay : 0;
    while (this.line.length > 1 && this.rowsDone * ROW < sEnd + ROW) this.layRow(this.rowsDone++, sEnd, delay);
    if (!toDoor && this.line.length > 3) {
      const last = this.line[this.line.length - 1];
      this.endCap(last.p, last.h, delay + 0.2);
    }
    this.active = null;
  }

  /** Builds on its own toward `target`, stones settling one after another. */
  private auto(target: THREE.Vector2) {
    this.autoDelay = 0.05;
    this.walkToward(target, -1, true);
  }

  private walkToward(target: THREE.Vector2, delay: number, auto: boolean) {
    const dir = new THREE.Vector2();
    for (let guard = 0; guard < 600; guard++) {
      dir.subVectors(target, this.walker);
      const dist = dir.length();
      if (dist < (auto ? 0.25 : STEP * 1.5)) break;
      dir.divideScalar(dist);
      // Lazy steering: the heading turns gradually, which smooths jitter into curves. Turning is
      // capped so bends never get tighter than the path is wide (the paving would fold over).
      if (this.heading.lengthSq() === 0) this.heading.copy(dir);
      else {
        const cur = Math.atan2(this.heading.y, this.heading.x);
        let want = Math.atan2(dir.y, dir.x) - cur;
        want = Math.atan2(Math.sin(want), Math.cos(want));
        const maxTurn = auto ? MAX_TURN * 2 : MAX_TURN;
        // Target inside our turning circle and off to the side/behind: we can't reach it without
        // circling, so wait for the finger to lead further away.
        if (dist < (STEP / maxTurn) * 2 && Math.abs(want) > Math.PI / 2.5) break;
        const turn = Math.max(-maxTurn, Math.min(maxTurn, want * (auto ? 0.3 : 0.25)));
        this.heading.set(Math.cos(cur + turn), Math.sin(cur + turn));
      }
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
      // An obstacle ends this stretch of path: finish it neatly and start fresh beyond.
      if (this.line.length > 1) this.flushStretch(delay);
      this.lastCurb = [null, null];
      return;
    }
    const perp = new THREE.Vector2(-this.heading.y, this.heading.x);
    this.line.push({ p: w.clone(), n: perp.clone(), h: this.heading.clone() });
    this.active?.points.push({ x: w.x, z: w.y });
    this.paint.wear(w.x, w.y, WEAR_RADIUS);
    this.wildflowers.clearNear(w.x, w.y, 1.2);

    if (this.line.length === 4) this.endCap(this.line[0].p, this.line[0].h.clone().negate(), delay);

    // Lay flagstone rows once their neighbours ahead are known (a couple of rows behind you).
    const sNow = (this.line.length - 1) * STEP;
    while ((this.rowsDone + 3) * ROW <= sNow) this.layRow(this.rowsDone++, Infinity, delay);

    // Edging: each side measures its own distance, so blocks stay evenly spaced round curves.
    [-1, 1].forEach((side, i) => {
      const at = w.clone().addScaledVector(perp, side * CURB_OFFSET);
      const last = this.lastCurb[i];
      if (!last) {
        this.lastCurb[i] = at;
        return;
      }
      const span = at.distanceTo(last);
      if (span > CURB_LENGTH * 2.2) {
        // The path swung round sharply: restart this edge rather than bridging across the path.
        this.lastCurb[i] = at;
        return;
      }
      if (span < CURB_LENGTH + 0.015) return;
      const mid = at.clone().add(last).multiplyScalar(0.5);
      const dir = at.clone().sub(last).normalize();
      this.lastCurb[i] = at;
      // Never place edging inside the paved area (tight turns fold the inner edge inward).
      if (this.distanceToLine(mid) < HALF) return;
      this.placeCurb(mid, Math.atan2(dir.x, dir.y), span / CURB_LENGTH, delay + 0.05);
    });

    // Clover and tiny flowers grow along the outside of the edging a moment later.
    if (this.rng() < 0.3) {
      const s = this.rng() < 0.5 ? -1 : 1;
      const o = lerp(0.82, 1.05, this.rng());
      const ex = w.x + perp.x * s * o + (this.rng() - 0.5) * 0.2;
      const ez = w.y + perp.y * s * o + (this.rng() - 0.5) * 0.2;
      if (!this.blocked(ex, ez) && !this.stones.isOccupied(ex, ez, 0.12) && !this.paving.isOccupied(ex, ez, 0.1)) {
        this.edges.add(ex, this.ground.heightAt(ex, ez), ez, delay + lerp(0.7, 1.6, this.rng()));
      }
    }
  }

  /** Finish the current stretch (at an obstacle) and begin a new one after it. */
  private flushStretch(delay: number) {
    const sEnd = (this.line.length - 1) * STEP;
    while (this.rowsDone * ROW < sEnd + ROW) this.layRow(this.rowsDone++, sEnd, delay);
    const last = this.line[this.line.length - 1];
    this.endCap(last.p, last.h, delay + 0.2);
    this.line = [];
    this.rowsDone = 0;
    this.pathId++;
  }

  private distanceToLine(p: THREE.Vector2): number {
    let best = Infinity;
    const from = Math.max(0, this.line.length - 30);
    for (let i = from; i < this.line.length; i++) best = Math.min(best, this.line[i].p.distanceTo(p));
    return best;
  }

  /** Seed point of flagstone `c` in row `i`, in path coordinates. Rows hold 2 or 3 stones. */
  private seedsOfRow(i: number): P2[] {
    if (i < 0) return [];
    const seed = this.active?.seed ?? 1;
    const n = hash(seed, i, 99) < 0.55 ? 3 : 2;
    const out: P2[] = [];
    for (let c = 0; c < n; c++) {
      const s = (i + 0.5) * ROW + (hash(seed, i, c * 2) - 0.5) * ROW * 0.55;
      const t = -HALF + ((c + 0.5) / n) * HALF * 2 + (hash(seed, i, c * 2 + 1) - 0.5) * ((HALF * 2) / n) * 0.55;
      out.push([s, t]);
    }
    return out;
  }

  private layRow(i: number, sEnd: number, delay: number) {
    const neighbours: P2[] = [];
    for (let k = i - 2; k <= i + 2; k++) neighbours.push(...this.seedsOfRow(k));
    const seed = this.active?.seed ?? 1;
    this.seedsOfRow(i).forEach((p, c) => {
      // Voronoi cell of p, clipped to the paved band and the path's ends.
      let poly: P2[] = [
        [Math.max(0, p[0] - ROW * 2.5), -HALF],
        [Math.min(sEnd, p[0] + ROW * 2.5), -HALF],
        [Math.min(sEnd, p[0] + ROW * 2.5), HALF],
        [Math.max(0, p[0] - ROW * 2.5), HALF],
      ];
      if (poly[1][0] - poly[0][0] < 0.05) return;
      for (const q of neighbours) {
        if (q === p || (q[0] === p[0] && q[1] === p[1])) continue;
        const nx = q[0] - p[0];
        const ny = q[1] - p[1];
        const d = nx * (p[0] + q[0]) * 0.5 + ny * (p[1] + q[1]) * 0.5;
        poly = clip(poly, nx, ny, d);
        if (poly.length < 3) return;
      }
      // Mortar joint: pull every corner a little toward the stone's centre.
      let cs = 0;
      let ct = 0;
      for (const v of poly) {
        cs += v[0];
        ct += v[1];
      }
      cs /= poly.length;
      ct /= poly.length;
      poly = poly.map(([s, t]) => {
        const ds = s - cs;
        const dt = t - ct;
        const len = Math.hypot(ds, dt);
        const k = len > 1e-4 ? Math.max(0, 1 - GAP / len) : 1;
        return [cs + ds * k, ct + dt * k] as P2;
      });
      // Bend the stone along the path into the world.
      const pts = poly.map(([s, t]) => {
        const w = this.at(s, t);
        return new THREE.Vector3(w.x, this.ground.heightAt(w.x, w.y) + SLAB_TOP, w.y);
      });
      const centre = this.at(cs, ct);
      let r = 0;
      for (const q of pts) r = Math.max(r, Math.hypot(q.x - centre.x, q.z - centre.y));
      // Where this path crosses another, its edging steps aside and the paving joins up.
      this.stones.removeNear(centre.x, centre.y, r + 0.05, 'curb', this.pathId);
      if (this.paving.isOccupied(centre.x, centre.y, r * 0.5, this.pathId)) return;
      const mossy = hash(seed, i, 50 + c) < 0.14;
      const list = mossy ? MOSSY_TONES : SLAB_TONES;
      const tone = new THREE.Color(list[Math.floor(hash(seed, i, 60 + c) * list.length)]).multiplyScalar(lerp(0.95, 1.05, hash(seed, i, 70 + c)));
      this.paving.add({ points: pts, tone, delay: delay + c * 0.05, pathId: this.pathId });
    });
  }

  /** World xz of path coordinate (s along, t across). */
  private at(s: number, t: number): THREE.Vector2 {
    const f = Math.min(Math.max(s / STEP, 0), this.line.length - 1);
    const i = Math.min(Math.floor(f), this.line.length - 2);
    const k = f - i;
    const a = this.line[Math.max(0, i)];
    const b = this.line[Math.min(this.line.length - 1, i + 1)];
    const px = a.p.x + (b.p.x - a.p.x) * k;
    const pz = a.p.y + (b.p.y - a.p.y) * k;
    const nx = a.n.x + (b.n.x - a.n.x) * k;
    const nz = a.n.y + (b.n.y - a.n.y) * k;
    const nl = Math.hypot(nx, nz) || 1;
    return new THREE.Vector2(px + (nx / nl) * t, pz + (nz / nl) * t);
  }

  private placeCurb(mid: THREE.Vector2, yaw: number, stretch: number, delay: number, room = 0.1) {
    // Skip if another edging block is here, or if it would sit on another path's paving.
    if (this.blocked(mid.x, mid.y) || this.stones.isOccupied(mid.x, mid.y, room, 'curb') || this.paving.isOccupied(mid.x, mid.y, 0.04, this.pathId)) return;
    const tone = new THREE.Color(CURB_TONES[Math.floor(this.rng() * CURB_TONES.length)]).multiplyScalar(lerp(0.96, 1.04, this.rng()));
    const y = this.ground.heightAt(mid.x, mid.y) - 0.03;
    const scale = new THREE.Vector3(1, lerp(0.95, 1.05, this.rng()), Math.min(1.15, Math.max(0.85, stretch)));
    this.stones.add('curb', mid.x, y, mid.y, scale, yaw + (this.rng() - 0.5) * 0.03, 0.12, tone, delay, this.pathId);
  }

  /** Edging blocks laid across the end of the path, finishing it neatly. */
  private endCap(at: THREE.Vector2, heading: THREE.Vector2, delay: number) {
    const perp = new THREE.Vector2(-heading.y, heading.x);
    const yaw = Math.atan2(perp.x, perp.y);
    const tip = at.clone().addScaledVector(heading, 0.1);
    [-1, 0, 1].forEach((s, i) => {
      const p = tip.clone().addScaledVector(perp, s * 0.41);
      this.placeCurb(p, yaw, 1.0, delay + i * 0.05, 0.05);
    });
  }
}
