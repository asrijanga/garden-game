import * as THREE from 'three';
import { createRng, lerp } from '../core/random';
import type { Ground } from '../world/ground';
import type { GroundPaint } from '../world/groundPaint';
import type { Flowers } from '../world/flowers';
import type { Wildflowers } from '../world/wildflowers';
import type { Season } from '../world/season';
import type { Stones } from '../world/stones';
import { MIX_ID, SPECIES, type FlowerSpecies } from '../world/flowerSpecies';

const DAB_STEP = 0.3; // metres between brush dabs along a stroke
const BED_RADIUS = 0.8; // painted soil (visible edge at ~80% of this), mostly hidden under foliage
const PLANT_RADIUS = 0.62; // flowers scatter this far from the stroke, inside the bed's edge
const EDGE_RADIUS = 0.67; // natural stone border sits just outside the mulch's visible edge
const EDGE_SPACING = 0.24; // metres between border stones
const ROCK_TONES = ['#a39b8f', '#8f877c', '#b3aa9b', '#9b8f80', '#7f786f', '#b8ad9c', '#a8a091'];
/** Plant scale. Heads are already drawn large (see HEAD); stems stay fairly short so blooms sit over their bed. */
const FLOWER_SCALE = 1.2;
const FOLIAGE_GREEN = ['#4f8a36', '#5e9a3f', '#6aa548', '#47803a', '#578f3c'];
const FOLIAGE_AUTUMN = ['#4f8434', '#5e9440', '#6a9a42', '#7d9a40', '#567f35'];
const FOLIAGE_WINTER = ['#557a50', '#5f8459', '#4d7048'];

/**
 * Paints flower beds. Each dab digs soft soil and scatters plants around it; their birth times
 * are offset by distance from the stroke, so the bed blooms outward in a wave.
 */
export class FlowerBrush {
  selected = MIX_ID;
  private readonly rng = createRng(4321);
  private last: THREE.Vector2 | null = null;
  private strokeTime = 0;
  /** Every dab of every bed so far (centres), and the dabs of the stroke in progress. */
  private readonly beds: THREE.Vector2[] = [];
  private stroke: THREE.Vector2[] = [];

  constructor(
    private readonly ground: Ground,
    private readonly paint: GroundPaint,
    private readonly flowers: Flowers,
    private readonly wildflowers: Wildflowers,
    private readonly season: Season,
    private readonly blocked: (x: number, z: number) => boolean,
    private readonly distanceToPaths: (x: number, z: number) => number,
    private readonly stones: Stones,
  ) {}

  inSeason(sp: FlowerSpecies): boolean {
    return sp.seasons.includes(this.season);
  }

  /** Species blooming now first, then the rest. */
  ordered(): FlowerSpecies[] {
    return [...SPECIES.filter((s) => this.inSeason(s)), ...SPECIES.filter((s) => !this.inSeason(s))];
  }

  begin(p: THREE.Vector3) {
    this.last = new THREE.Vector2(p.x, p.z);
    this.strokeTime = 0;
    this.stroke = [];
    this.dab(this.last);
  }

  extend(p: THREE.Vector3) {
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
    if (this.stroke.length) this.layBorder(this.stroke);
    this.stroke = [];
    this.last = null;
  }

  /**
   * A hand-laid border of natural stones round the outside of the bed. It follows the outline
   * of all beds together, so a bed that's extended or joins another gets one border round the
   * outside; stones that end up inside the bed are lifted away.
   */
  private layBorder(stroke: THREE.Vector2[]) {
    for (const c of stroke) this.stones.removeNear(c.x, c.y, EDGE_RADIUS - 0.08, 'rock');
    const insideAnother = (p: THREE.Vector2, self: THREE.Vector2) => this.beds.some((c) => c !== self && c.distanceTo(p) < EDGE_RADIUS - 0.03);
    let delay = 0.15;
    for (const c of stroke) {
      const steps = Math.ceil((Math.PI * 2 * EDGE_RADIUS) / EDGE_SPACING);
      const start = this.rng() * Math.PI * 2;
      for (let i = 0; i < steps; i++) {
        const a = start + (i / steps) * Math.PI * 2;
        // Hand-laid: each stone nudged in or out a little and spaced unevenly.
        const r = EDGE_RADIUS + (this.rng() - 0.5) * 0.05;
        const p = new THREE.Vector2(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r);
        if (insideAnother(p, c)) continue;
        if (this.blocked(p.x, p.y) || this.distanceToPaths(p.x, p.y) < 0.7) continue;
        const size = lerp(0.2, 0.3, this.rng() ** 1.3);
        if (this.stones.isOccupied(p.x, p.y, size * 0.42, 'rock')) continue;
        const tone = new THREE.Color(ROCK_TONES[Math.floor(this.rng() * ROCK_TONES.length)]).multiplyScalar(lerp(0.92, 1.08, this.rng()));
        const scale = new THREE.Vector3(size, size * lerp(0.8, 1.15, this.rng()), size);
        // Long side along the edge, with a little twist; set a touch high or low.
        // (local +x maps to (cos yaw, -sin yaw); the tangent here is (-sin a, cos a))
        const yaw = Math.atan2(-Math.cos(a), -Math.sin(a)) + (this.rng() - 0.5) * 0.6;
        const y = this.ground.heightAt(p.x, p.y) - size * lerp(0.06, 0.16, this.rng());
        this.stones.add('rock', p.x, y, p.y, scale, yaw, size * 0.42, tone, delay);
        delay += 0.025;
      }
    }
  }

  private pickSpecies(): FlowerSpecies {
    if (this.selected !== MIX_ID) return SPECIES.find((s) => s.id === this.selected) ?? SPECIES[0];
    const blooming = SPECIES.filter((s) => this.inSeason(s));
    const pool = blooming.length ? blooming : SPECIES;
    return pool[Math.floor(this.rng() * pool.length)];
  }

  private dab(c: THREE.Vector2) {
    if (this.blocked(c.x, c.y) || this.distanceToPaths(c.x, c.y) < 0.7) return;
    this.paint.bed(c.x, c.y, BED_RADIUS);
    const centre = c.clone();
    this.beds.push(centre);
    this.stroke.push(centre);
    this.wildflowers.clearNear(c.x, c.y, BED_RADIUS);
    // Leafy foliage first: the bed fills with green, then the flowers rise out of it.
    const greens = this.season === 'autumn' ? FOLIAGE_AUTUMN : this.season === 'winter' ? FOLIAGE_WINTER : FOLIAGE_GREEN;
    for (let i = 0; i < 7; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = Math.sqrt(this.rng()) * PLANT_RADIUS * 0.95;
      const x = c.x + Math.cos(a) * r;
      const z = c.y + Math.sin(a) * r;
      if (this.blocked(x, z) || this.distanceToPaths(x, z) < 0.8) continue;
      const green = new THREE.Color(greens[Math.floor(this.rng() * greens.length)]).multiplyScalar(lerp(0.9, 1.1, this.rng()));
      this.flowers.plantFoliage(x, this.ground.heightAt(x, z) - 0.02, z, this.rng() * Math.PI * 2, lerp(1.0, 1.6, this.rng()), this.strokeTime * 0.2 + this.rng() * 0.4, green);
    }
    // In a mix, neighbouring plants tend to share a species, in soft drifts like a real border.
    let drift = this.pickSpecies();
    for (let i = 0; i < 40; i++) {
      if (this.rng() < 0.35) drift = this.pickSpecies();
      const sp = drift;
      const a = this.rng() * Math.PI * 2;
      const r = Math.sqrt(this.rng()) * PLANT_RADIUS;
      const x = c.x + Math.cos(a) * r;
      const z = c.y + Math.sin(a) * r;
      if (this.blocked(x, z) || this.distanceToPaths(x, z) < 0.85) continue;
      if (this.flowers.isCrowded(x, z, sp.spacing * FLOWER_SCALE * 0.62)) continue;
      const base = new THREE.Color(sp.colors[Math.floor(this.rng() * sp.colors.length)]);
      const color = base.offsetHSL((this.rng() - 0.5) * 0.03, (this.rng() - 0.5) * 0.1, (this.rng() - 0.5) * 0.06);
      // The wave: plants further from the stroke sprout a little later.
      const delay = this.strokeTime * 0.2 + 0.1 + (r / PLANT_RADIUS) * 0.9 + this.rng() * 0.25;
      this.flowers.plant(
        sp,
        Math.floor(this.rng() * 5),
        x,
        this.ground.heightAt(x, z) - 0.01,
        z,
        this.rng() * Math.PI * 2,
        FLOWER_SCALE * lerp(0.85, 1.15, this.rng()),
        delay,
        // Out of season: plump, half-open buds in their colour, so the bed clearly looks planted.
        this.inSeason(sp) ? lerp(0.9, 1, this.rng()) : lerp(0.3, 0.4, this.rng()),
        color,
      );
    }
  }
}
