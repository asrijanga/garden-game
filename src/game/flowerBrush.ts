import * as THREE from 'three';
import { createRng, lerp } from '../core/random';
import type { Ground } from '../world/ground';
import { TOPPING_STEPS, type GroundPaint } from '../world/groundPaint';
import type { RaisedSoil } from '../world/raisedSoil';
import type { Flowers, LeafKind } from '../world/flowers';
import type { Wildflowers } from '../world/wildflowers';
import type { Season } from '../world/season';
import type { Stones } from '../world/stones';
import { MIX_ID, SPECIES, WATER_MIX_ID, type FlowerSpecies } from '../world/flowerSpecies';
import { seasonShift } from '../world/season';

const DAB_STEP = 0.3; // metres between brush dabs along a stroke
const BED_RADIUS = 0.8; // painted soil (visible edge at ~80% of this), mostly hidden under foliage
const PLANT_RADIUS = 0.62; // flowers scatter this far from the stroke, inside the bed's edge
const EDGE_RADIUS = 0.67; // natural stone border sits just outside the mulch's visible edge
const EDGE_SPACING = 0.24; // metres between border stones
const BLEND = 0.8; // radius of the rounded curve where separate beds meet
const ROCK_TONES = ['#a39b8f', '#8f877c', '#b3aa9b', '#9b8f80', '#7f786f', '#b8ad9c', '#a8a091'];
/** Plant scale. Heads are already drawn large (see HEAD); stems stay fairly short so blooms sit over their bed. */
const FLOWER_SCALE = 1.2;
/** Gap between flowers, as a multiple of each species' natural spacing (was 0.62: too dense). */
const SPACING = 1.05;
/** Minimum gap between leafy clumps. */
const FOLIAGE_SPACING = 0.55;
const SEED_BROWN = '#8a6a44'; // dry seed heads
const KNOT_GREEN = '#5f8a3e'; // a resting plant's tight green knot
const FOLIAGE_GREEN = ['#4f8a36', '#5e9a3f', '#6aa548', '#47803a', '#578f3c'];
const FOLIAGE_AUTUMN = ['#4f8434', '#5e9440', '#6a9a42', '#7d9a40', '#567f35'];
const FOLIAGE_WINTER = ['#557a50', '#5f8459', '#4d7048'];

/**
 * Paints flower beds. Each dab digs soft soil and scatters plants around it; their birth times
 * are offset by distance from the stroke, so the bed blooms outward in a wave.
 */
/** A bed's colour scheme: cool blues and whites, hot reds and golds, soft pastels, or a cottage jumble. */
type Theme = 'cool' | 'hot' | 'pastel' | 'jumble';
const THEMES: Theme[] = ['cool', 'hot', 'pastel', 'jumble'];

/** Does a colour belong in a theme? */
function fits(hex: string, theme: Theme): boolean {
  if (theme === 'jumble') return true;
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(hex.split('|')[0]).getHSL(hsl);
  if (theme === 'cool') return (hsl.h > 0.48 && hsl.h < 0.86) || hsl.l > 0.86;
  if (theme === 'hot') return (hsl.h < 0.17 || hsl.h > 0.94) && hsl.s > 0.45 && hsl.l < 0.8;
  return hsl.l > 0.66;
}

/**
 * How a bed is planted, chosen when it's started: its colour theme, a tall plant for the middle,
 * mid-height plants round it and low edgers at the rim (each in drifts that repeat along the
 * bed), and two foliage plants woven between. Every bed gets its own.
 */
interface BedPlan {
  theme: Theme;
  tiers: { tall: FlowerSpecies[]; mid: FlowerSpecies[]; low: FlowerSpecies[] };
  /** The species each tier is in the middle of a drift of. */
  drift: { tall: FlowerSpecies | null; mid: FlowerSpecies | null; low: FlowerSpecies | null };
  /** A taller foliage plant for the middle, and a low one for the edges. */
  leaves: [LeafKind, LeafKind];
}

/** Foliage tints by kind (autumn and winter turn grasses to straw). */
const LEAF_TINTS: Record<LeafKind, string[]> = {
  clump: ['#4f8a36', '#5e9a3f', '#6aa548', '#47803a'],
  grass: ['#7f9f4c', '#94a75a', '#6f8f74', '#8a9a52'],
  fern: ['#5f9a3e', '#6aa548', '#579238'],
  hosta: ['#5a8a5a', '#7aa860', '#4f7f6e', '#8fb45e'],
  silver: ['#b9c2b3', '#aab4a6', '#c4cabe'],
  box: ['#3f6a32', '#4a7638', '#456f36'],
};

/**
 * How a bed is edged: a natural stone border (the original), no edge at all, bricks set on end,
 * a woven willow (wattle) edge, or raised: in a timber frame or a low dry-stone wall.
 */
export type BedStyle = 'stone' | 'none' | 'brick' | 'wattle' | 'timber' | 'raised';
export const BED_STYLES: BedStyle[] = ['stone', 'none', 'brick', 'wattle', 'timber', 'raised'];
const BED_CODE: Record<BedStyle, string> = { stone: 's', none: 'n', brick: 'b', wattle: 'w', timber: 't', raised: 'r' };
/** How high a raised bed's soil sits. */
const LIFT: Record<BedStyle, number> = { stone: 0, none: 0, brick: 0, wattle: 0, timber: 0.28, raised: 0.22 };
const WILLOW = ['#8a7258', '#7d6650', '#958067', '#6f5a46'];
const BOARD = ['#8f6f50', '#9c7b5a', '#836548', '#a6865f'];
const BRICKS = ['#b5583d', '#a94f37', '#c0654a', '#9c4a35', '#b86a4c', '#8f4632'];

/** How much each touch plants: a drift (a bed along the stroke), a little clump, or one flower. */
export type PlantAmount = 'drift' | 'clump' | 'one';
const AMOUNT_CODE: Record<PlantAmount, string> = { drift: '', clump: 'c', one: '1' };
/** How far round the finger a clump or a single flower reaches (and the soil it gets on lawn). */
const FOOTPRINT: Record<PlantAmount, number | null> = { drift: null, clump: 0.5, one: 0.26 };

export class FlowerBrush {
  selected = MIX_ID;
  /** Drift (today's bed stroke), a clump, or a single flower placed exactly where the finger lifts. */
  amount: PlantAmount = 'drift';
  /** How new beds are edged (or raised), and what covers their soil (an index into TOPPINGS). */
  bedStyle: BedStyle = 'stone';
  topping = 0;
  /** The stroke in progress' style, topping and soil height (fixed when it starts). */
  private strokeStyle: BedStyle = 'stone';
  private strokeTopping = 0;
  private lift = 0;
  /** Raised beds' soil, drawn with the lawn's own shader so the topping shows on it. */
  raised: RaisedSoil | null = null;
  /** A clump or single flower went in at (x, z) (for its sound). */
  onPlace: (x: number, z: number, water: boolean) => void = () => {};
  private placeAt: THREE.Vector2 | null = null;
  private plan: BedPlan | null = null;
  private row = 0;
  private rng = createRng(4321);
  private last: THREE.Vector2 | null = null;
  private strokeTime = 0;
  /** Every dab of every bed so far (centre + which stroke made it), and the stroke in progress. */
  private readonly beds: { c: THREE.Vector2; stroke: number; lift?: number }[] = [];
  /** Bed dabs by 1 m cell, for quick "how far is the nearest bed?" checks. */
  private readonly bedCells = new Map<number, THREE.Vector2[]>();
  private stroke: THREE.Vector2[] = [];
  private strokeId = 0;
  private readonly fieldIds: number[] = [];
  private readonly foliageAt = new Map<number, { x: number; z: number }[]>();
  private readonly fieldMins: number[] = [];

  constructor(
    private readonly ground: Ground,
    private readonly paint: GroundPaint,
    private readonly flowers: Flowers,
    private readonly wildflowers: Wildflowers,
    private readonly season: Season,
    private readonly blocked: (x: number, z: number) => boolean,
    private readonly distanceToPaths: (x: number, z: number) => number,
    private readonly stones: Stones,
    /** Where water flowers can grow: a pond's deep middle, its shallows, or the damp bank. */
    private readonly water: { zone(x: number, z: number): 'deep' | 'shallow' | 'bank' | null; level(x: number, z: number): number | null } = { zone: () => null, level: () => null },
  ) {}

  inSeason(sp: FlowerSpecies): boolean {
    return sp.seasons.includes(this.season);
  }

  /**
   * Where a flower is in its year: blooming; in bud (its season comes next); gone to seed (its
   * season has just passed); or resting, just leaves, until its time comes round again.
   */
  private stage(sp: FlowerSpecies): 'bloom' | 'bud' | 'seed' | 'rest' {
    if (sp.seasons.includes(this.season)) return 'bloom';
    if (sp.seasons.includes(seasonShift(this.season, 1))) return 'bud';
    if (sp.seasons.includes(seasonShift(this.season, -1))) return 'seed';
    return 'rest';
  }

  /**
   * How far a plant opens and what colour it shows for its stage (`r` is one random draw). Seed
   * heads are dry and brown; resting plants keep only a tight green knot where the bloom will be.
   */
  private seasonal(sp: FlowerSpecies, r: number, color: THREE.Color, edge?: THREE.Color): { open: number; color: THREE.Color; edge?: THREE.Color } {
    switch (this.stage(sp)) {
      case 'bloom':
        return { open: lerp(0.9, 1, r), color, edge };
      case 'bud':
        return { open: lerp(0.3, 0.4, r), color, edge };
      case 'seed': {
        const dry = new THREE.Color(SEED_BROWN).multiplyScalar(lerp(0.85, 1.1, r));
        return { open: lerp(0.18, 0.26, r), color: color.clone().lerp(dry, 0.8), edge: edge?.clone().lerp(dry, 0.8) };
      }
      default: {
        const knot = new THREE.Color(KNOT_GREEN).multiplyScalar(lerp(0.9, 1.1, r));
        return { open: 0.12, color: knot, edge: knot };
      }
    }
  }

  /** Species blooming now first, then the rest. */
  /**
   * The choice as saved with each stroke: "species", "species:colour", plus "@c" for a clump or
   * "@1" for a single flower (old saves have neither, so they replay as drifts).
   */
  get selection(): string {
    const code = AMOUNT_CODE[this.amount];
    const bed = this.bedStyle !== 'stone' || this.topping ? `#${BED_CODE[this.bedStyle]}${this.topping}` : '';
    return `${this.selected}${bed}${code ? '@' + code : ''}`;
  }

  /** "species[:colour][#<edge><topping>][@<amount>]" (old saves have neither # nor @). */
  set selection(s: string) {
    const [rest, code] = s.split('@');
    const [sel, bed] = rest.split('#');
    this.selected = sel;
    this.amount = code === 'c' ? 'clump' : code === '1' ? 'one' : 'drift';
    this.bedStyle = (bed && BED_STYLES.find((b) => BED_CODE[b] === bed[0])) || 'stone';
    this.topping = bed ? Math.min(TOPPING_STEPS - 1, Math.max(0, Number(bed.slice(1)) || 0)) : 0;
  }

  /** The ring under the finger for a clump or single flower (null for a drift). */
  get footprint(): number | null {
    return FOOTPRINT[this.amount];
  }

  ordered(): FlowerSpecies[] {
    return [...SPECIES.filter((s) => this.inSeason(s)), ...SPECIES.filter((s) => !this.inSeason(s))];
  }

  begin(p: THREE.Vector3) {
    this.strokeStyle = this.bedStyle;
    this.strokeTopping = this.topping;
    this.lift = LIFT[this.bedStyle];
    // A clump or one flower: nothing goes in until the finger lifts, exactly where it lifts.
    if (this.amount !== 'drift') {
      this.placeAt = new THREE.Vector2(p.x, p.z);
      return;
    }
    this.last = new THREE.Vector2(p.x, p.z);
    this.plan = this.makePlan();
    this.strokeTime = 0;
    this.stroke = [];
    this.strokeId++;
    this.dab(this.last);
  }

  extend(p: THREE.Vector3) {
    if (this.placeAt) {
      this.placeAt.set(p.x, p.z);
      return;
    }
    if (!this.last) return;
    const to = new THREE.Vector2(p.x, p.z);
    let d = to.distanceTo(this.last);
    while (d >= DAB_STEP) {
      this.last.addScaledVector(to.clone().sub(this.last).normalize(), DAB_STEP);
      this.strokeTime += 0.05;
      this.dab(this.last);
      d = to.distanceTo(this.last);
    }
  }

  end() {
    if (this.placeAt) {
      this.placeExactly(this.placeAt);
      this.placeAt = null;
      return;
    }
    if (this.stroke.length) this.layBorder(this.stroke);
    this.stroke = [];
    this.last = null;
  }

  /** Forget bed dabs centred within `r` of (x, z). */
  erase(x: number, z: number, r: number) {
    this.raised?.erase(x, z, r);
    for (const [k, list] of this.foliageAt) this.foliageAt.set(k, list.filter((p) => (p.x - x) ** 2 + (p.z - z) ** 2 > r * r));
    for (let i = this.beds.length - 1; i >= 0; i--) {
      if (Math.hypot(this.beds[i].c.x - x, this.beds[i].c.y - z) < r) this.beds.splice(i, 1);
    }
    for (const [k, list] of this.bedCells) this.bedCells.set(k, list.filter((c) => Math.hypot(c.x - x, c.y - z) >= r));
  }

  /** Back to an untouched garden (before an undo replays what remains). */
  reset() {
    this.rng = createRng(4321);
    this.raised?.reset();
    this.row = 0;
    this.last = null;
    this.placeAt = null;
    this.strokeTime = 0;
    this.beds.length = 0;
    this.bedCells.clear();
    this.stroke = [];
    this.strokeId = 0;
    this.foliageAt.clear();
  }

  /** After erasing along `path`: lay stones along the new edges of beds that were cut. */
  reborder(path: THREE.Vector2[], r: number) {
    const cut = this.beds.filter((b) => path.some((p) => b.c.distanceTo(p) < r + EDGE_RADIUS + 0.4)).map((b) => b.c);
    if (cut.length) this.layBorder(cut);
  }

  private foliageNear(x: number, z: number, r: number): boolean {
    for (let i = Math.floor(x) - 1; i <= Math.floor(x) + 1; i++) {
      for (let j = Math.floor(z) - 1; j <= Math.floor(z) + 1; j++) {
        for (const p of this.foliageAt.get(i * 4096 + j) ?? []) if ((p.x - x) ** 2 + (p.z - z) ** 2 < r * r) return true;
      }
    }
    return false;
  }

  private addFoliageSpot(x: number, z: number) {
    const k = Math.floor(x) * 4096 + Math.floor(z);
    if (!this.foliageAt.has(k)) this.foliageAt.set(k, []);
    this.foliageAt.get(k)!.push({ x, z });
  }

  /** Rough distance from (x, z) to the edge of the nearest flower bed (negative inside). */
  /**
   * Distance from (x, z) to the nearest bed's edge (negative inside). Only looked for nearby:
   * anything further than ~1 m reads as 1.5 (every caller only asks "is a bed within a step?").
   */
  distanceToBeds(x: number, z: number): number {
    let d = 1.5;
    const reach = EDGE_RADIUS + 1.5;
    for (let i = Math.floor(x - reach); i <= Math.floor(x + reach); i++) {
      for (let j = Math.floor(z - reach); j <= Math.floor(z + reach); j++) {
        const cell = this.bedCells.get(i * 4096 + j);
        if (cell) for (const c of cell) d = Math.min(d, Math.hypot(x - c.x, z - c.y) - EDGE_RADIUS);
      }
    }
    return d;
  }

  /**
   * Signed distance to the outline of all beds near `p` (negative inside). Beds are blended with
   * a smooth union, so where two beds meet (or nearly touch) they join in a soft, rounded curve
   * instead of a sharp notch, the way a gardener would cut the edge.
   */
  private bedField(x: number, z: number, near: { c: THREE.Vector2; stroke: number }[]): number {
    // Each stroke's own outline is exact (a plain union of its dabs)...
    // (Plain arrays rather than a Map: this runs tens of thousands of times per border.)
    const ids = this.fieldIds;
    const mins = this.fieldMins;
    ids.length = mins.length = 0;
    for (const b of near) {
      const di = Math.hypot(x - b.c.x, z - b.c.y) - EDGE_RADIUS;
      const k = ids.indexOf(b.stroke);
      if (k < 0) {
        ids.push(b.stroke);
        mins.push(di);
      } else if (di < mins[k]) mins[k] = di;
    }
    // ...and separate beds join with a round fillet of radius BLEND where they meet.
    let d = Infinity;
    for (const di of mins) {
      if (d === Infinity) d = di;
      else d = Math.max(BLEND, Math.min(d, di)) - Math.hypot(Math.max(BLEND - d, 0), Math.max(BLEND - di, 0));
    }
    return d;
  }

  /**
   * A hand-laid border of natural stones round the outside of the beds, following their smooth
   * shared outline. Only the area round the new stroke is rebuilt: the curve where beds meet is
   * filled with mulch (and a little foliage), stones that are now inside are lifted, and new
   * stones are laid along the outline, settling one after another.
   */
  private layBorder(stroke: THREE.Vector2[]) {
    const reach = 1.6;
    // Beds that can influence the outline here.
    const near = this.beds.filter((b) => stroke.some((c) => b.c.distanceTo(c) < EDGE_RADIUS * 2 + BLEND + reach));
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const c of stroke) {
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
      minZ = Math.min(minZ, c.y); maxZ = Math.max(maxZ, c.y);
    }
    // Bucket beds and stroke dabs by 1 m cell, so each grid cell only looks at its neighbours.
    const bucket = <T extends { x: number; y: number }>(list: T[]) => {
      const map = new Map<number, T[]>();
      for (const p of list) {
        const k = Math.floor(p.x) * 4096 + Math.floor(p.y);
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(p);
      }
      return (x: number, z: number, r: number, visit: (p: T) => void) => {
        for (let i = Math.floor(x - r); i <= Math.floor(x + r); i++) {
          for (let j = Math.floor(z - r); j <= Math.floor(z + r); j++) for (const p of map.get(i * 4096 + j) ?? []) visit(p);
        }
      };
    };
    const nearBeds = bucket(near.map((b) => Object.assign(b.c.clone(), { bed: b })));
    const nearStroke = bucket(stroke);
    const influence = EDGE_RADIUS + BLEND + 1;
    const local: { c: THREE.Vector2; stroke: number }[] = [];
    const field = (x: number, z: number) => {
      local.length = 0;
      nearBeds(x, z, influence, (p) => local.push(p.bed));
      return local.length ? this.bedField(x, z, local) : Infinity;
    };
    const strokeDist = (x: number, z: number, r: number) => {
      let best = Infinity;
      nearStroke(x, z, r, (c) => (best = Math.min(best, Math.hypot(x - c.x, z - c.y))));
      return best;
    };
    const touches = (x: number, z: number, pad: number) => strokeDist(x, z, EDGE_RADIUS + pad) < EDGE_RADIUS + pad;

    // Lift stones that the new (blended) outline has swallowed.
    const mid = new THREE.Vector2((minX + maxX) / 2, (minZ + maxZ) / 2);
    const span = Math.hypot(maxX - minX, maxZ - minZ) / 2 + EDGE_RADIUS + reach;
    this.stones.removeIf(mid.x, mid.y, span, 'rock', (x, z) => field(x, z) < -0.07 && touches(x, z, reach));

    // March a grid round the stroke: fill the blended curves with mulch and find the outline.
    // The field is sampled once per grid point and neighbours are read back from the grid.
    const step = 0.1;
    const x0 = minX - EDGE_RADIUS - reach;
    const z0 = minZ - EDGE_RADIUS - reach;
    const nx = Math.ceil((maxX + EDGE_RADIUS + reach - x0) / step) + 1;
    const nz = Math.ceil((maxZ + EDGE_RADIUS + reach - z0) / step) + 1;
    // Rasterise distances straight into the grid (each dab stamps the cells round it), rather than
    // searching for the nearest dab from every cell.
    const stamp = (points: { x: number; y: number }[], R: number, out: Float32Array) => {
      for (const p of points) {
        const i0 = Math.max(0, Math.floor((p.x - R - x0) / step));
        const i1 = Math.min(nx - 1, Math.ceil((p.x + R - x0) / step));
        const j0 = Math.max(0, Math.floor((p.y - R - z0) / step));
        const j1 = Math.min(nz - 1, Math.ceil((p.y + R - z0) / step));
        for (let i = i0; i <= i1; i++) {
          const dx = x0 + i * step - p.x;
          for (let j = j0; j <= j1; j++) {
            const dz = z0 + j * step - p.y;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d < out[i * nz + j]) out[i * nz + j] = d;
          }
        }
      }
    };
    const D = new Float32Array(nx * nz).fill(Infinity);
    stamp(stroke, EDGE_RADIUS + reach + step, D);
    // Bed field: exact union within each stroke, round fillet between strokes (as bedField).
    const F = new Float32Array(nx * nz).fill(Infinity);
    const P = new Float32Array(nx * nz).fill(Infinity); // plain distance to the nearest dab
    const groups = new Map<number, THREE.Vector2[]>();
    for (const b of near) {
      if (!groups.has(b.stroke)) groups.set(b.stroke, []);
      groups.get(b.stroke)!.push(b.c);
    }
    const G = new Float32Array(nx * nz);
    let first = true;
    for (const pts of groups.values()) {
      G.fill(Infinity);
      stamp(pts, influence, G);
      for (let k = 0; k < G.length; k++) {
        const di = G[k] - EDGE_RADIUS;
        if (G[k] < P[k]) P[k] = G[k];
        const d = F[k];
        F[k] = first || d === Infinity ? Math.min(d, di) : di === Infinity ? d : Math.max(BLEND, Math.min(d, di)) - Math.hypot(Math.max(BLEND - d, 0), Math.max(BLEND - di, 0));
      }
      first = false;
    }
    const T = new Uint8Array(nx * nz);
    for (let k = 0; k < T.length; k++) T[k] = D[k] < EDGE_RADIUS + reach ? 1 : 0;
    const at = (i: number, j: number) => (i < 0 || j < 0 || i >= nx || j >= nz ? Infinity : F[i * nz + j]);
    const edge: { x: number; z: number; order: number }[] = [];
    const greens = this.season === 'autumn' ? FOLIAGE_AUTUMN : this.season === 'winter' ? FOLIAGE_WINTER : FOLIAGE_GREEN;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        if (!T[i * nz + j]) continue;
        const x = x0 + i * step;
        const z = z0 + j * step;
        const f = F[i * nz + j];
        if (f < 0) {
          // In a blended curve (inside the outline, outside every round dab): mulch it in.
          const plain = P[i * nz + j] - EDGE_RADIUS;
          if (plain > -0.06 && !this.blocked(x, z) && this.distanceToPaths(x, z) > 0.75) {
            this.paint.bed(x, z, 0.32, 1, this.strokeTopping);
            if (this.rng() < 0.08 && !this.foliageNear(x, z, FOLIAGE_SPACING)) {
              this.addFoliageSpot(x, z);
              const green = new THREE.Color(greens[Math.floor(this.rng() * greens.length)]);
              this.flowers.plantFoliage(x, this.ground.heightAt(x, z) - 0.02 + this.lift, z, this.rng() * 6.28, lerp(0.9, 1.3, this.rng()), 0.2 + this.rng() * 0.4, green);
            }
          }
          continue;
        }
        // Outline cells: outside, with an inside neighbour.
        if (at(i + 1, j) < 0 || at(i - 1, j) < 0 || at(i, j + 1) < 0 || at(i, j - 1) < 0) {
          let order = 0;
          let best = Infinity;
          stroke.forEach((c, k) => {
            const d = Math.hypot(x - c.x, z - c.y);
            if (d < best) {
              best = d;
              order = k + Math.atan2(z - c.y, x - c.x) / (Math.PI * 2);
            }
          });
          edge.push({ x, z, order });
        }
      }
    }

    // Lay stones along the outline, in stroke order so they settle like someone working round.
    edge.sort((a, b) => a.order - b.order);
    if (this.strokeStyle !== 'stone') {
      this.layEdge(edge, field);
      return;
    }
    let delay = 0.15;
    for (const e of edge) {
      if (this.blocked(e.x, e.z) || this.distanceToPaths(e.x, e.z) < 0.52) continue;
      if (this.stones.isOccupied(e.x, e.z, EDGE_SPACING * 0.5, 'rock')) continue;
      const size = lerp(0.2, 0.3, this.rng() ** 1.3);
      // Tangent from the field's gradient, so stones run along the curve.
      const gx = field(e.x + 0.02, e.z) - field(e.x - 0.02, e.z);
      const gz = field(e.x, e.z + 0.02) - field(e.x, e.z - 0.02);
      const tx = -gz;
      const tz = gx;
      // Hand-laid: nudged in or out, a little twist, set a touch high or low.
      const nudge = (this.rng() - 0.5) * 0.05;
      const gl = Math.hypot(gx, gz) || 1;
      const x = e.x + (gx / gl) * nudge;
      const z = e.z + (gz / gl) * nudge;
      const tone = new THREE.Color(ROCK_TONES[Math.floor(this.rng() * ROCK_TONES.length)]).multiplyScalar(lerp(0.92, 1.08, this.rng()));
      const scale = new THREE.Vector3(size, size * lerp(0.8, 1.15, this.rng()), size);
      // (local +x maps to (cos yaw, -sin yaw); we want it along the tangent)
      const yaw = Math.atan2(-tz, tx) + (this.rng() - 0.5) * 0.6;
      const y = this.ground.heightAt(x, z) - size * lerp(0.06, 0.16, this.rng());
      this.stones.add('rock', x, y, z, scale, yaw, size * 0.42, tone, delay);
      delay += 0.025;
    }
  }

  /**
   * Edge a bed in its style, along its outline (in the order someone would work round it):
   * bricks on end leaning like a row of dominoes, a woven willow hurdle between stakes, a raised
   * timber frame of boards on edge with posts, or a low dry-stone wall holding raised soil.
   */
  private layEdge(edge: { x: number; z: number }[], field: (x: number, z: number) => number) {
    const style = this.strokeStyle;
    if (style === 'none') return;
    let delay = 0.15;
    let since = Infinity;
    let last: { x: number; z: number } | null = null;
    const spacing = style === 'brick' ? 0.075 : style === 'wattle' ? 0.13 : style === 'timber' ? 0.27 : 0.2;
    const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const tone = (list: string[], lo = 0.92, hi = 1.06) => new THREE.Color(list[Math.floor(this.rng() * list.length)]).multiplyScalar(lerp(lo, hi, this.rng()));
    let posts = 0;
    for (const e of edge) {
      if (last) since += Math.hypot(e.x - last.x, e.z - last.z);
      last = e;
      if (since < spacing) continue;
      if (this.blocked(e.x, e.z) || this.distanceToPaths(e.x, e.z) < 0.52) continue;
      const gx = field(e.x + 0.02, e.z) - field(e.x - 0.02, e.z);
      const gz = field(e.x, e.z + 0.02) - field(e.x, e.z - 0.02);
      const gl = Math.hypot(gx, gz) || 1;
      const nx = gx / gl;
      const nz = gz / gl;
      // Pieces long along their z: line them up with the outline's tangent.
      const yaw = Math.atan2(-nz, nx);
      const y = this.ground.heightAt(e.x, e.z);
      if (style === 'brick') {
        if (this.stones.isOccupied(e.x, e.z, 0.03, 'brick')) continue;
        since = 0;
        // On end, leaning a little along the edge: the old "sawtooth" brick edging.
        this.stones.add('brick', e.x, y - 0.012, e.z, v3(1, 1, lerp(0.97, 1.03, this.rng())), yaw, 0.05, tone(BRICKS, 0.86, 1.04), delay, 0, -Math.PI / 2 + 0.42 + (this.rng() - 0.5) * 0.06);
        delay += 0.012;
      } else if (style === 'wattle') {
        since = 0;
        // A woven willow edge: three withies, in and out round each stake.
        const k = this.row++;
        for (let h = 0; h < 3; h++) {
          const out = ((k + h) % 2 === 0 ? 1 : -1) * 0.012;
          this.stones.add('plank', e.x + nx * out, y + 0.05 + h * 0.05, e.z + nz * out, v3(0.22, 0.85, lerp(0.15, 0.18, this.rng())), yaw + (this.rng() - 0.5) * 0.08, 0.04, tone(WILLOW), delay, 0, (this.rng() - 0.5) * 0.06);
        }
        if (k % 4 === 0) this.stones.add('plank', e.x, y + 0.11, e.z, v3(0.3, 1.2, 0.26), yaw, 0.03, tone(WILLOW, 0.78, 0.92), delay, 0, -Math.PI / 2 + (this.rng() - 0.5) * 0.08);
        delay += 0.02;
      } else if (style === 'timber') {
        since = 0;
        // Boards on edge, a hair outside the soil; a post every few boards.
        const bx = e.x + nx * 0.02;
        const bz = e.z + nz * 0.02;
        this.stones.add('plank', bx, y + 0.15, bz, v3(2.35, lerp(0.9, 1.1, this.rng()), lerp(0.29, 0.31, this.rng())), yaw + (this.rng() - 0.5) * 0.04, 0.14, tone(BOARD), delay, 0, 0, Math.PI / 2 + (this.rng() - 0.5) * 0.03);
        if (posts++ % 4 === 0) this.stones.add('plank', bx + nx * 0.03, y + 0.17, bz + nz * 0.03, v3(0.6, 2.2, 0.36), yaw, 0.05, tone(BOARD, 0.78, 0.9), delay + 0.05, 0, -Math.PI / 2);
        delay += 0.04;
      } else {
        // A low dry-stone wall: a course of stones, then a smaller course on top.
        if (this.stones.isOccupied(e.x, e.z, 0.09, 'rock')) continue;
        since = 0;
        for (let c = 0; c < 2; c++) {
          const size = c === 0 ? lerp(0.24, 0.3, this.rng()) : lerp(0.2, 0.25, this.rng());
          const o = c === 0 ? 0 : (this.rng() - 0.5) * 0.06;
          this.stones.add('rock', e.x + nx * 0.03, y - 0.03 + c * 0.15, e.z + nz * 0.03 + o, v3(size, size * lerp(0.7, 0.9, this.rng()), size * 0.8), yaw + Math.PI / 2 + (this.rng() - 0.5) * 0.5, size * 0.4, tone(ROCK_TONES), delay + c * 0.1, 0);
        }
        delay += 0.03;
      }
    }
  }

  /**
   * The chosen species and, for those with a colour choice (roses), which colour: the selection
   * is saved as "species" or "species:colourIndex".
   */
  private choice(): { id: string; colour: number } {
    const [id, c] = this.selected.split(':');
    return { id, colour: c === undefined ? -1 : Number(c) };
  }

  private pickSpecies(): FlowerSpecies {
    const { id } = this.choice();
    if (id !== MIX_ID) return SPECIES.find((s) => s.id === id) ?? SPECIES[0];
    // (Mixes are flowers: foliage is added by the bed plan, or picked on its own.)
    const blooming = SPECIES.filter((s) => this.inSeason(s) && s.form.kind !== 'foliage');
    const land = SPECIES.filter((s) => !s.zone && s.form.kind !== 'foliage');
    const pool = blooming.filter((s) => !s.zone).length ? blooming.filter((s) => !s.zone) : land;
    return pool[Math.floor(this.rng() * pool.length)];
  }

  /** A water flower for this spot of the pond (the chosen one if it grows here, or the water mix). */
  private pickWater(zone: 'deep' | 'shallow' | 'bank'): FlowerSpecies | null {
    const { id } = this.choice();
    if (id !== WATER_MIX_ID && id !== MIX_ID) {
      const sp = SPECIES.find((s) => s.id === id);
      return sp && sp.zone === zone ? sp : null;
    }
    const here = SPECIES.filter((s) => s.zone === zone);
    const blooming = here.filter((s) => this.inSeason(s));
    const pool = blooming.length ? blooming : here;
    return pool.length ? pool[Math.floor(this.rng() * pool.length)] : null;
  }

  /** A colour for one plant: from the species' list (or the one chosen for it); "base|edge" is a bicolour. */
  private plantColour(sp: FlowerSpecies, theme: Theme = 'jumble'): { color: THREE.Color; edge?: THREE.Color } {
    // In a themed bed, a species shows the colours that suit the theme (if it has any).
    const suits = sp.colors.map((c, i) => (fits(c, theme) ? i : -1)).filter((i) => i >= 0);
    const r = this.rng();
    const pick = suits.length ? suits[Math.floor(r * suits.length)] : Math.floor(r * sp.colors.length);
    const { id: chosenId, colour: chosen } = this.choice();
    const entry = sp.colors[sp.id === chosenId && chosen >= 0 && chosen < sp.colors.length ? chosen : pick];
    const [baseHex, edgeHex] = entry.split('|');
    const dh = (this.rng() - 0.5) * 0.03;
    const ds = (this.rng() - 0.5) * 0.1;
    const dl = (this.rng() - 0.5) * 0.06;
    return { color: new THREE.Color(baseHex).offsetHSL(dh, ds, dl), edge: edgeHex ? new THREE.Color(edgeHex).offsetHSL(dh, ds, dl) : undefined };
  }

  /**
   * Painting across a pond: no soil and no border, just water flowers, each kind in its own
   * zone (floaters in the deep middle, marginals in the shallows, forget-me-nots on the damp
   * bank), in soft drifts.
   */
  private waterDab(c: THREE.Vector2) {
    const drift: Partial<Record<'deep' | 'shallow' | 'bank', FlowerSpecies | null>> = {};
    for (let i = 0; i < 10; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = Math.sqrt(this.rng()) * PLANT_RADIUS * 1.15;
      const x = c.x + Math.cos(a) * r;
      const z = c.y + Math.sin(a) * r;
      const zone = this.water.zone(x, z);
      if (!zone) continue;
      if (drift[zone] === undefined || this.rng() < 0.3) drift[zone] = this.pickWater(zone);
      const sp = drift[zone];
      if (!sp || this.flowers.isCrowded(x, z, sp.spacing * FLOWER_SCALE * SPACING)) continue;
      const { color, edge } = this.plantColour(sp);
      const y = zone === 'bank' ? this.ground.heightAt(x, z) - 0.01 : (this.water.level(x, z) ?? this.ground.heightAt(x, z)) - 0.004;
      const delay = this.strokeTime * 0.2 + 0.1 + (r / PLANT_RADIUS) * 0.9 + this.rng() * 0.25;
      const variant = Math.floor(this.rng() * 5);
      const yaw = this.rng() * Math.PI * 2;
      const scale = FLOWER_SCALE * lerp(0.85, 1.15, this.rng());
      const look = this.seasonal(sp, this.rng(), color, edge);
      this.flowers.plant(sp, variant, x, y, z, yaw, scale, delay, look.open, look.color, look.edge);
    }
  }

  /**
   * One flower exactly at `c`, or a little clump of one kind round it. On open lawn it gets just
   * a small circle of soil (no stone border); in a bed or a pond it simply joins in.
   */
  private placeExactly(c: THREE.Vector2) {
    const one = this.amount === 'one';
    const zone = this.water.zone(c.x, c.y);
    if (zone) {
      const sp = this.pickWater(zone);
      if (!sp) return;
      const n = one ? 1 : 3 + Math.floor(this.rng() * 2);
      const { color, edge } = this.plantColour(sp);
      for (let i = 0; i < n; i++) {
        const at = i === 0 ? c.clone() : this.around(c, sp.spacing * FLOWER_SCALE * 0.6, i, n);
        const z2 = this.water.zone(at.x, at.y);
        if (!z2 || (i > 0 && this.flowers.isCrowded(at.x, at.y, sp.spacing * FLOWER_SCALE * 0.5))) continue;
        const y = z2 === 'bank' ? this.ground.heightAt(at.x, at.y) - 0.01 : (this.water.level(at.x, at.y) ?? this.ground.heightAt(at.x, at.y)) - 0.004;
        this.setPlant(sp, at, y, 0.05 + i * 0.12, color, edge);
      }
      this.onPlace(c.x, c.y, true);
      return;
    }
    const { id } = this.choice();
    if (id === WATER_MIX_ID || SPECIES.find((s) => s.id === id)?.zone) return;
    if (this.blocked(c.x, c.y) || this.distanceToPaths(c.x, c.y) < 0.35) return;
    const reach = FOOTPRINT[this.amount]!;
    // In a raised bed, plants go in on top of its soil.
    let lift = 0;
    for (const b of this.beds) if (b.lift && b.c.distanceTo(c) < EDGE_RADIUS) lift = Math.max(lift, b.lift);
    // On open lawn: a small, hand-dug circle of soil.
    if (this.distanceToBeds(c.x, c.y) > -0.15) this.paint.bed(c.x, c.y, reach * 1.25, 1, this.strokeTopping);
    this.wildflowers.clearNear(c.x, c.y, reach);
    const sp = this.pickSpecies();
    const { color, edge } = this.plantColour(sp);
    if (one) {
      this.setPlant(sp, c, this.ground.heightAt(c.x, c.y) - 0.01 + lift, 0.05, color, edge);
    } else {
      // A clump: one kind, the first right under the finger, the rest close round it, with a
      // leafy tuft tucked in.
      const n = 3 + Math.floor(this.rng() * 3);
      const ring = Math.min(reach * 0.75, sp.spacing * FLOWER_SCALE * 0.7);
      for (let i = 0; i < n; i++) {
        const at = i === 0 ? c.clone() : this.around(c, ring, i, n);
        if (this.blocked(at.x, at.y) || this.distanceToPaths(at.x, at.y) < 0.35) continue;
        if (i > 0 && this.flowers.isCrowded(at.x, at.y, sp.spacing * FLOWER_SCALE * 0.45)) continue;
        this.setPlant(sp, at, this.ground.heightAt(at.x, at.y) - 0.01 + lift, 0.05 + i * 0.12, color, edge);
      }
      const greens = this.season === 'autumn' ? FOLIAGE_AUTUMN : this.season === 'winter' ? FOLIAGE_WINTER : FOLIAGE_GREEN;
      const a = this.rng() * Math.PI * 2;
      const fx = c.x + Math.cos(a) * ring * 0.5;
      const fz = c.y + Math.sin(a) * ring * 0.5;
      if (!this.foliageNear(fx, fz, FOLIAGE_SPACING * 0.6)) {
        this.addFoliageSpot(fx, fz);
        const green = new THREE.Color(greens[Math.floor(this.rng() * greens.length)]).multiplyScalar(lerp(0.9, 1.1, this.rng()));
        this.flowers.plantFoliage(fx, this.ground.heightAt(fx, fz) - 0.02 + lift, fz, this.rng() * Math.PI * 2, lerp(0.8, 1.2, this.rng()), 0.02, green);
      }
    }
    this.onPlace(c.x, c.y, false);
  }

  /** The i-th of n spots round `c`, roughly evenly spaced, each nudged a little by hand. */
  private around(c: THREE.Vector2, r: number, i: number, n: number): THREE.Vector2 {
    const a = ((i - 1) / Math.max(1, n - 1)) * Math.PI * 2 + this.rng() * 0.9;
    const k = r * lerp(0.75, 1.15, this.rng());
    return new THREE.Vector2(c.x + Math.cos(a) * k, c.y + Math.sin(a) * k);
  }

  private setPlant(sp: FlowerSpecies, at: THREE.Vector2, y: number, delay: number, color: THREE.Color, edge?: THREE.Color) {
    const variant = Math.floor(this.rng() * 5);
    const yaw = this.rng() * Math.PI * 2;
    const scale = FLOWER_SCALE * lerp(0.9, 1.1, this.rng());
    const look = this.seasonal(sp, this.rng(), color, edge);
    this.flowers.plant(sp, variant, at.x, y, at.y, yaw, scale, delay, look.open, look.color, look.edge);
  }

  /** Plan a new bed (see BedPlan). With one species chosen, it's that species at every height. */
  private makePlan(): BedPlan {
    const { id } = this.choice();
    const theme = THEMES[Math.floor(this.rng() * THEMES.length)];
    const tall = (sp: FlowerSpecies) => sp.height[1] >= 0.75;
    const low = (sp: FlowerSpecies) => sp.height[1] <= 0.42;
    let tiers: BedPlan['tiers'];
    if (id !== MIX_ID) {
      const sp = SPECIES.find((s) => s.id === id) ?? SPECIES[0];
      tiers = { tall: [sp], mid: [sp], low: [sp] };
    } else {
      const flower = (s: FlowerSpecies) => !s.zone && s.form.kind !== 'foliage';
      const blooming = SPECIES.filter((s) => flower(s) && this.inSeason(s));
      const pool = blooming.length >= 4 ? blooming : SPECIES.filter(flower);
      const themed = pool.filter((s) => s.colors.some((c) => fits(c, theme)));
      const from = themed.length >= 4 ? themed : pool;
      const pick = (list: FlowerSpecies[], n: number, fallback: FlowerSpecies[]) => {
        const src = [...(list.length ? list : fallback)];
        const out: FlowerSpecies[] = [];
        while (out.length < n && src.length) out.push(src.splice(Math.floor(this.rng() * src.length), 1)[0]);
        return out;
      };
      const mids = from.filter((s) => !tall(s) && !low(s));
      tiers = {
        tall: pick(from.filter(tall), 1, pool.filter(tall).length ? pool.filter(tall) : mids),
        mid: pick(mids, 2, from),
        low: pick(from.filter(low), 2, pool.filter(low).length ? pool.filter(low) : mids),
      };
    }
    const tallLeaves: LeafKind[] = ['grass', 'fern', 'hosta', 'box', 'clump'];
    const lowLeaves: LeafKind[] = ['silver', 'hosta', 'clump', 'box', 'fern'];
    const a = tallLeaves[Math.floor(this.rng() * tallLeaves.length)];
    let b = lowLeaves[Math.floor(this.rng() * lowLeaves.length)];
    if (b === a) b = 'clump';
    return { theme, tiers, drift: { tall: null, mid: null, low: null }, leaves: [a, b] };
  }

  /**
   * Plant one dab of a bed, as a gardener would: foliage woven through, tall plants towards the
   * middle of the bed, mid-height round them and low edgers at the rim, each in drifts.
   */
  private plantBed(c: THREE.Vector2) {
    const plan = this.plan ?? (this.plan = this.makePlan());
    const autumnal = this.season === 'autumn' || this.season === 'winter';
    // Foliage first: the bed fills with green (and silver, and bronze), then flowers rise through it.
    for (let i = 0; i < 3; i++) {
      const a = this.rng() * Math.PI * 2;
      const t = Math.sqrt(this.rng());
      const r = t * PLANT_RADIUS * 0.95;
      const x = c.x + Math.cos(a) * r;
      const z = c.y + Math.sin(a) * r;
      const kind = t < 0.55 ? plan.leaves[0] : plan.leaves[1];
      if (this.blocked(x, z) || this.distanceToPaths(x, z) < 0.62 || this.foliageNear(x, z, kind === 'clump' ? FOLIAGE_SPACING : 0.5)) continue;
      this.addFoliageSpot(x, z);
      const tints = kind === 'grass' && autumnal ? ['#b89a5c', '#a88a50', '#c4a76a'] : kind === 'clump' ? (this.season === 'autumn' ? FOLIAGE_AUTUMN : this.season === 'winter' ? FOLIAGE_WINTER : FOLIAGE_GREEN) : LEAF_TINTS[kind];
      const tint = new THREE.Color(tints[Math.floor(this.rng() * tints.length)]).multiplyScalar(lerp(0.9, 1.1, this.rng()) * (this.season === 'winter' ? 0.85 : 1));
      const size = kind === 'clump' ? lerp(1.0, 1.6, this.rng()) : lerp(0.85, 1.2, this.rng()) * FLOWER_SCALE;
      this.flowers.plantLeaf(kind, x, this.ground.heightAt(x, z) - 0.02 + this.lift, z, this.rng() * Math.PI * 2, size, this.strokeTime * 0.2 + this.rng() * 0.4, tint);
    }
    // Flowers by tier: where a plant falls across the bed decides how tall it is.
    for (let i = 0; i < 20; i++) {
      const a = this.rng() * Math.PI * 2;
      const t = Math.sqrt(this.rng());
      const r = t * PLANT_RADIUS;
      const x = c.x + Math.cos(a) * r;
      const z = c.y + Math.sin(a) * r;
      let tier: 'tall' | 'mid' | 'low' = t < 0.4 ? 'tall' : t < 0.75 ? 'mid' : 'low';
      if (!plan.tiers[tier].length) tier = plan.tiers.mid.length ? 'mid' : plan.tiers.low.length ? 'low' : 'tall';
      const list = plan.tiers[tier];
      // Each tier carries on with the same species for a while (a drift), then moves on.
      if (!plan.drift[tier] || this.rng() < 0.22) plan.drift[tier] = list[Math.floor(this.rng() * list.length)];
      const sp = plan.drift[tier]!;
      if (this.blocked(x, z) || this.distanceToPaths(x, z) < 0.67) continue;
      // Room round each plant (edgers sit a little closer, like a real border's front row).
      if (this.flowers.isCrowded(x, z, sp.spacing * FLOWER_SCALE * SPACING * (tier === 'low' ? 0.85 : 1))) continue;
      const { color, edge } = this.plantColour(sp, plan.theme);
      // The wave: plants further from the stroke sprout a little later.
      const delay = this.strokeTime * 0.2 + 0.1 + t * 0.9 + this.rng() * 0.25;
      const variant = Math.floor(this.rng() * 5);
      const yaw = this.rng() * Math.PI * 2;
      const scale = FLOWER_SCALE * lerp(0.85, 1.15, this.rng());
      const look = this.seasonal(sp, this.rng(), color, edge);
      this.flowers.plant(sp, variant, x, this.ground.heightAt(x, z) - 0.01 + this.lift, z, yaw, scale, delay, look.open, look.color, look.edge);
    }
  }

  private dab(c: THREE.Vector2) {
    // Over a pond (or its damp bank): water flowers instead of a bed.
    if (this.water.zone(c.x, c.y)) {
      this.waterDab(c);
      return;
    }
    // Water flowers only grow in and by the water.
    const { id } = this.choice();
    if (id === WATER_MIX_ID || SPECIES.find((s) => s.id === id)?.zone) return;
    if (this.blocked(c.x, c.y) || this.distanceToPaths(c.x, c.y) < 0.52) return;
    this.paint.bed(c.x, c.y, BED_RADIUS, 1, this.strokeTopping);
    // A raised bed: its soil comes up to the top of the frame, with the plants on it.
    if (this.lift > 0) this.raised?.add(c.x, this.ground.heightAt(c.x, c.y) + this.lift, c.y, EDGE_RADIUS * 0.96, this.strokeTime * 0.2);
    const centre = c.clone();
    this.beds.push({ c: centre, stroke: this.strokeId, lift: this.lift || undefined });
    const key = Math.floor(centre.x) * 4096 + Math.floor(centre.y);
    let cell = this.bedCells.get(key);
    if (!cell) this.bedCells.set(key, (cell = []));
    cell.push(centre);
    this.stroke.push(centre);
    this.wildflowers.clearNear(c.x, c.y, BED_RADIUS);
    this.plantBed(c);
  }
}
