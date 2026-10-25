import * as THREE from 'three';
import { createRng, lerp } from '../core/random';
import type { Ground } from '../world/ground';
import type { GroundPaint } from '../world/groundPaint';
import type { Flowers } from '../world/flowers';
import type { Wildflowers } from '../world/wildflowers';
import type { Season } from '../world/season';
import { MIX_ID, SPECIES, type FlowerSpecies } from '../world/flowerSpecies';

const DAB_STEP = 0.3; // metres between brush dabs along a stroke
const BED_RADIUS = 0.88; // painted soil (visible edge at ~80% of this)
const PLANT_RADIUS = 0.8; // flowers scatter this far from the stroke, right to the bed's edge
/** Plant scale. Heads are already drawn large (see HEAD); stems stay fairly short so blooms sit over their bed. */
const FLOWER_SCALE = 1.2;

/**
 * Paints flower beds. Each dab digs soft soil and scatters plants around it; their birth times
 * are offset by distance from the stroke, so the bed blooms outward in a wave.
 */
export class FlowerBrush {
  selected = MIX_ID;
  private readonly rng = createRng(4321);
  private last: THREE.Vector2 | null = null;
  private strokeTime = 0;

  constructor(
    private readonly ground: Ground,
    private readonly paint: GroundPaint,
    private readonly flowers: Flowers,
    private readonly wildflowers: Wildflowers,
    private readonly season: Season,
    private readonly blocked: (x: number, z: number) => boolean,
    private readonly distanceToPaths: (x: number, z: number) => number,
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
    this.last = null;
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
    this.wildflowers.clearNear(c.x, c.y, BED_RADIUS);
    // In a mix, neighbouring plants tend to share a species, in soft drifts like a real border.
    let drift = this.pickSpecies();
    for (let i = 0; i < 26; i++) {
      if (this.rng() < 0.35) drift = this.pickSpecies();
      const sp = drift;
      const a = this.rng() * Math.PI * 2;
      const r = Math.sqrt(this.rng()) * PLANT_RADIUS;
      const x = c.x + Math.cos(a) * r;
      const z = c.y + Math.sin(a) * r;
      if (this.blocked(x, z) || this.distanceToPaths(x, z) < 0.85) continue;
      if (this.flowers.isCrowded(x, z, sp.spacing * FLOWER_SCALE * 0.8)) continue;
      const base = new THREE.Color(sp.colors[Math.floor(this.rng() * sp.colors.length)]);
      const color = base.offsetHSL((this.rng() - 0.5) * 0.03, (this.rng() - 0.5) * 0.1, (this.rng() - 0.5) * 0.06);
      // The wave: plants further from the stroke sprout a little later.
      const delay = this.strokeTime * 0.2 + 0.1 + (r / PLANT_RADIUS) * 0.9 + this.rng() * 0.25;
      this.flowers.plant(
        sp,
        Math.floor(this.rng() * 4),
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
