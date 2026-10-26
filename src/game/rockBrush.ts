import * as THREE from 'three';
import { createRng, lerp } from '../core/random';
import type { Boulders } from '../world/boulders';
import type { Wildflowers } from '../world/wildflowers';

const SCATTER = 0.9; // metres between rocks along a dragged line

/**
 * Places rocks. A tap sets a boulder exactly where you touch, with a few smaller stones
 * nestled round its foot; dragging scatters a natural rocky line of mixed sizes.
 */
export class RockBrush {
  private rng = createRng(8080);
  private last: THREE.Vector2 | null = null;
  private start = new THREE.Vector2();
  private travelled = 0;
  private delay = 0;

  constructor(
    private readonly rocks: Boulders,
    private readonly wildflowers: Wildflowers,
    private readonly heightAt: (x: number, z: number) => number,
    /** Places a rock can't go: paths, ponds, the cottage, the woods. */
    private readonly blocked: (x: number, z: number) => boolean,
  ) {}

  /** Back to an untouched garden (before an undo replays what remains). */
  reset() {
    this.rng = createRng(8080);
    this.last = null;
  }

  begin(p: THREE.Vector3) {
    this.last = new THREE.Vector2(p.x, p.z);
    this.start.copy(this.last);
    this.travelled = 0;
    this.delay = 0;
    this.place(p.x, p.z, lerp(1.0, 1.5, this.rng()), true);
  }

  extend(p: THREE.Vector3) {
    if (!this.last) return;
    const to = new THREE.Vector2(p.x, p.z);
    let d = to.distanceTo(this.last);
    while (d >= SCATTER) {
      const dir = to.clone().sub(this.last).normalize();
      this.last.addScaledVector(dir, SCATTER);
      this.travelled += SCATTER;
      // Mostly middling stones, now and then a big one, nudged off the line a little.
      const big = this.rng() < 0.25;
      const size = big ? lerp(0.9, 1.3, this.rng()) : lerp(0.4, 0.75, this.rng());
      const side = (this.rng() - 0.5) * 0.5;
      this.place(this.last.x - dir.y * side, this.last.y + dir.x * side, size, false);
      d = to.distanceTo(this.last);
    }
  }

  end() {
    if (!this.last) return;
    // A tap: smaller stones settle round the boulder's foot, as if it had always been there.
    if (this.travelled === 0) {
      const n = 2 + Math.floor(this.rng() * 3);
      const a0 = this.rng() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * Math.PI * 2 + (this.rng() - 0.5) * 0.8;
        const r = lerp(0.75, 1.05, this.rng());
        this.place(this.start.x + Math.cos(a) * r, this.start.y + Math.sin(a) * r, lerp(0.25, 0.5, this.rng()), false);
      }
    }
    this.last = null;
  }

  private place(x: number, z: number, size: number, exact: boolean) {
    if (this.blocked(x, z)) return;
    // Let rocks nestle against each other, but never sit inside one another.
    if (!exact && this.rocks.occupied(x, z, size * 0.3)) return;
    this.wildflowers.clearNear(x, z, size * 0.6);
    this.rocks.add(x, this.heightAt(x, z), z, size, this.delay);
    this.delay += 0.12;
  }
}
