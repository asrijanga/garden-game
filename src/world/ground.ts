import * as THREE from 'three';
import { createNoise2D } from '../core/noise';
import { smoothstep } from '../core/random';
import type { SeasonPalette } from './season';

/** Radius of the open meadow in the middle of the forest: the player's garden. */
export const CLEARING_RADIUS = 21;
const WORLD_HALF = 110;

export class Ground {
  private readonly hNoise: (x: number, y: number) => number;
  private readonly edgeNoise: (x: number, y: number) => number;
  private readonly colorNoise: (x: number, y: number) => number;
  private readonly meadow: THREE.Color[];
  private readonly floor: THREE.Color;
  readonly mesh: THREE.Mesh;

  constructor(seed: number, palette: SeasonPalette) {
    this.hNoise = createNoise2D(seed);
    this.edgeNoise = createNoise2D(seed + 1);
    this.colorNoise = createNoise2D(seed + 2);
    this.meadow = palette.meadow.map((c) => new THREE.Color(c));
    this.floor = new THREE.Color(palette.forestFloor);
    this.mesh = this.buildMesh();
  }

  /** Organic outline of the clearing at angle `theta`. */
  clearingRadius(theta: number): number {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    return CLEARING_RADIUS * (1 + this.edgeNoise(c * 0.8, s * 0.8) * 0.12 + this.edgeNoise(c * 2.1 + 4, s * 2.1) * 0.05);
  }

  /** 0 inside the meadow, rising to 1 a few metres into the forest. */
  forestness(x: number, z: number): number {
    const r = Math.hypot(x, z);
    return smoothstep(-1.5, 3.5, r - this.clearingRadius(Math.atan2(z, x)));
  }

  heightAt(x: number, z: number): number {
    const r = Math.hypot(x, z);
    const gentle = this.hNoise(x * 0.06, z * 0.06) * 0.35 + this.hNoise(x * 0.18 + 9, z * 0.18) * 0.08;
    // The forest floor rises softly away from the clearing, cradling the garden in a bowl.
    const bowl = smoothstep(CLEARING_RADIUS - 2, CLEARING_RADIUS + 30, r) * 4.5;
    const hills = this.hNoise(x * 0.025 + 40, z * 0.025) * 2.2 * smoothstep(CLEARING_RADIUS, CLEARING_RADIUS + 25, r);
    return gentle + bowl + hills;
  }

  meadowColor(x: number, z: number, out: THREE.Color): THREE.Color {
    const a = this.colorNoise(x * 0.09, z * 0.09) * 0.5 + 0.5;
    const b = this.colorNoise(x * 0.25 + 30, z * 0.25) * 0.5 + 0.5;
    out.copy(this.meadow[0]).lerp(this.meadow[1], smoothstep(0.15, 0.7, a));
    return out.lerp(this.meadow[2], smoothstep(0.6, 1.0, b) * 0.35);
  }

  private buildMesh(): THREE.Mesh {
    const segs = 220;
    const geo = new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const shade = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.heightAt(x, z));
      const f = this.forestness(x, z);
      this.meadowColor(x, z, c);
      // Forest floor is darker and leaf-littered, with a soft shaded fringe at the treeline.
      shade.copy(this.floor).multiplyScalar(0.75 + this.colorNoise(x * 0.3, z * 0.3) * 0.15);
      c.lerp(shade, f);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.receiveShadow = true;
    return mesh;
  }
}
