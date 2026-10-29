import * as THREE from 'three';
import type { Stones } from '../world/stones';
import type { Flowers } from '../world/flowers';
import type { EdgePlants } from '../world/edgePlants';
import type { PondPlants } from '../world/pondPlants';
import type { Ponds } from '../world/pond';
import type { GroundPaint } from '../world/groundPaint';
import type { Wildflowers } from '../world/wildflowers';
import type { Dust } from '../world/dust';
import type { PathBuilder } from './pathBuilder';
import type { FlowerBrush } from './flowerBrush';

const DAB_STEP = 0.25;

/**
 * Tidies the garden back to lawn. Under the brush, stones sink into the earth, plants wilt
 * away, ponds fill back in, worn earth and mulch fade, and a moment later the grass and
 * wildflowers grow back.
 */
export class EraseBrush {
  /** Brush radius in metres (set from the zoom, and shown by the touch ring). */
  radius = 1;
  private last: THREE.Vector2 | null = null;
  private touchedPond = false;
  private trail: THREE.Vector2[] = [];

  constructor(
    private readonly world: {
      stones: Stones;
      flowers: Flowers;
      edgePlants: EdgePlants;
      pondPlants: PondPlants;
      ponds: Ponds;
      paint: GroundPaint;
      wildflowers: Wildflowers;
      dust: Dust;
      paths: PathBuilder;
      beds: FlowerBrush;
      heightAt: (x: number, z: number) => number;
      /** Is (x, z) still somewhere wildflowers shouldn't grow (cottage, built things)? */
      occupied: (x: number, z: number) => boolean;
      /** Fences and hedges: removes what's within r and says where posts and hedges were. */
      fences: { erase(x: number, z: number, r: number): THREE.Vector3[] };
    },
    private readonly onErase: (amount: number) => void,
  ) {}

  begin(p: THREE.Vector3) {
    this.last = new THREE.Vector2(p.x, p.z);
    this.touchedPond = false;
    this.trail = [];
    this.dab(p.x, p.z);
  }

  extend(p: THREE.Vector3) {
    if (!this.last) return;
    const to = new THREE.Vector2(p.x, p.z);
    let d = to.distanceTo(this.last);
    while (d >= DAB_STEP) {
      this.last.addScaledVector(to.clone().sub(this.last).normalize(), DAB_STEP);
      this.dab(this.last.x, this.last.y);
      d = to.distanceTo(this.last);
    }
  }

  end() {
    if (!this.last) return;
    this.last = null;
    if (this.touchedPond) this.world.ponds.settle();
  }

  private dab(x: number, z: number) {
    const w = this.world;
    const r = this.radius;
    this.trail.push(new THREE.Vector2(x, z));
    const sunk = w.stones.erase(x, z, r);
    for (const p of sunk.slice(0, 6)) w.dust.puff(p, 2, 0.3);
    let amount = sunk.length;
    const felled = w.fences.erase(x, z, r);
    for (const p of felled.slice(0, 4)) w.dust.puff(p, 2, 0.3);
    amount += felled.length;
    const wilted = w.flowers.erase(x, z, r) + w.edgePlants.erase(x, z, r) + w.pondPlants.erase(x, z, r);
    if (wilted) w.dust.puff(new THREE.Vector3(x, w.heightAt(x, z), z), Math.min(6, 2 + wilted), r * 0.6);
    amount += wilted;
    if (w.ponds.erase(x, z, r)) {
      this.touchedPond = true;
      amount += 3;
    }
    w.paths.erase(x, z, r);
    w.beds.erase(x, z, r * 0.9);
    // Paint fades a little beyond the brush, so what's left keeps a soft, natural edge.
    w.paint.clear(x, z, r * 1.15);
    // Wildflowers return to grass that's free again.
    w.wildflowers.restoreIf((fx, fz) => (fx - x) ** 2 + (fz - z) ** 2 < r * r && !w.occupied(fx, fz), 1.2);
    if (amount) this.onErase(Math.min(1, amount / 6));
  }
}
