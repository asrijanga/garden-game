import * as THREE from 'three';
import { createNoise2D } from '../core/noise';
import { clamp, createRng, lerp, smoothstep } from '../core/random';

/** The garden plot: a soft, rolling island with a cut-away earthen edge, like a diorama. */
export const ISLAND_RADIUS = 9;
const LIP = 0.45; // radius of the rounded grassy lip
const SIDE_DEPTH = 2.6; // how far the earthen cliff drops
const BOTTOM_DEPTH = 3.6;

export class Terrain {
  private readonly hNoise: (x: number, y: number) => number;
  private readonly edgeNoise: (x: number, y: number) => number;
  private readonly colorNoise: (x: number, y: number) => number;
  readonly mesh: THREE.Mesh;

  constructor(seed: number) {
    this.hNoise = createNoise2D(seed);
    this.edgeNoise = createNoise2D(seed + 1);
    this.colorNoise = createNoise2D(seed + 2);
    this.mesh = this.buildMesh();
  }

  /** Radius of the island outline at angle `theta` (organic, never a perfect circle). */
  edgeRadius(theta: number): number {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const n = this.edgeNoise(c * 0.9, s * 0.9) * 0.08 + this.edgeNoise(c * 2.2 + 5, s * 2.2) * 0.03;
    return ISLAND_RADIUS * (1 + n);
  }

  /** Ground height of the grassy top surface. */
  heightAt(x: number, z: number): number {
    const n =
      this.hNoise(x * 0.07, z * 0.07) * 0.75 +
      this.hNoise(x * 0.16 + 11, z * 0.16) * 0.25 +
      this.hNoise(x * 0.4 - 7, z * 0.4) * 0.05;
    // A gentle overall tilt keeps it from looking like a flat table.
    return n + x * 0.02 - z * 0.015;
  }

  /** 0 at the centre, 1 at the edge of the walkable top. */
  edgeFactor(x: number, z: number): number {
    const r = Math.hypot(x, z);
    return r / (this.edgeRadius(Math.atan2(z, x)) - LIP);
  }

  /** Height of the visible surface, including the rounded lip (or -Infinity off the island). */
  surfaceHeight(x: number, z: number): number {
    const theta = Math.atan2(z, x);
    const rTop = this.edgeRadius(theta) - LIP;
    const r = Math.hypot(x, z);
    if (r <= rTop) return this.heightAt(x, z);
    const over = r - rTop;
    if (over >= LIP) return -Infinity;
    const hEdge = this.heightAt(Math.cos(theta) * rTop, Math.sin(theta) * rTop);
    return hEdge - LIP + Math.sqrt(LIP * LIP - over * over);
  }

  isOnTop(x: number, z: number, margin = 0): boolean {
    const r = Math.hypot(x, z);
    return r < this.edgeRadius(Math.atan2(z, x)) - LIP - margin;
  }

  /** Painterly meadow colour (shared with the grass so ground and blades match). */
  meadowColor(x: number, z: number, out: THREE.Color): THREE.Color {
    const a = this.colorNoise(x * 0.09, z * 0.09) * 0.5 + 0.5;
    const b = this.colorNoise(x * 0.25 + 30, z * 0.25) * 0.5 + 0.5;
    out.copy(MEADOW_DEEP).lerp(MEADOW_MID, smoothstep(0.15, 0.7, a));
    out.lerp(MEADOW_SUN, smoothstep(0.6, 1.0, b) * 0.35);
    return out;
  }

  private buildMesh(): THREE.Mesh {
    const segs = 200;
    const topRings = 44;
    const lipRings = 6;
    const sideRings = 12;
    const bottomRings = 7;
    const rows = topRings + lipRings + sideRings + bottomRings + 1;

    const positions = new Float32Array(rows * segs * 3);
    const colors = new Float32Array(rows * segs * 3);
    const c = new THREE.Color();

    for (let j = 0; j < segs; j++) {
      const theta = (j / segs) * Math.PI * 2;
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      const rEdge = this.edgeRadius(theta);
      const rTop = rEdge - LIP;
      const hEdge = this.heightAt(ct * rTop, st * rTop);
      let row = 0;

      const put = (r: number, y: number, col: THREE.Color) => {
        const i = (row * segs + j) * 3;
        positions[i] = ct * r;
        positions[i + 1] = y;
        positions[i + 2] = st * r;
        colors[i] = col.r;
        colors[i + 1] = col.g;
        colors[i + 2] = col.b;
        row++;
      };

      // Grassy top: rings from the centre to the start of the lip.
      for (let k = 0; k <= topRings; k++) {
        const t = k / topRings;
        const r = Math.sqrt(t) * rTop; // denser rings toward the edge
        const x = ct * r;
        const z = st * r;
        this.meadowColor(x, z, c);
        put(r, this.heightAt(x, z), c);
      }

      // Rounded lip curling over into the earth.
      for (let k = 1; k <= lipRings; k++) {
        const phi = (k / lipRings) * (Math.PI / 2);
        const r = rTop + Math.sin(phi) * LIP;
        const y = hEdge - LIP + Math.cos(phi) * LIP;
        this.meadowColor(ct * r, st * r, c).lerp(GRASS_SHADE, k / lipRings * 0.7);
        put(r, y, c);
      }

      // Earthen cliff with soft strata and a lumpy, hand-cut feel.
      const yTop = hEdge - LIP;
      const yBottom = -SIDE_DEPTH;
      for (let k = 1; k <= sideRings; k++) {
        const t = k / sideRings;
        const y = lerp(yTop, yBottom, t);
        put(this.cliffRadius(theta, t, y), y, this.soilColor(theta, y, t, c));
      }

      // Rounded underside tucking back to the centre.
      const rSide = rEdge * 0.95;
      for (let k = 1; k <= bottomRings; k++) {
        const t = k / bottomRings;
        const r = rSide * Math.cos(t * Math.PI * 0.5);
        const y = yBottom - Math.sin(t * Math.PI * 0.5) * (BOTTOM_DEPTH - SIDE_DEPTH + 1.2);
        c.copy(SOIL_DEEP).multiplyScalar(0.85);
        put(r, y, c);
      }
    }

    const indices: number[] = [];
    for (let k = 0; k < rows - 1; k++) {
      for (let j = 0; j < segs; j++) {
        const a = k * segs + j;
        const b = k * segs + ((j + 1) % segs);
        const cc = (k + 1) * segs + j;
        const d = (k + 1) * segs + ((j + 1) % segs);
        indices.push(a, b, cc, b, d, cc);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Radius of the earthen cliff at angle `theta`, `t` of the way down (0 = top, 1 = bottom). */
  cliffRadius(theta: number, t: number, y: number): number {
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const lump = this.edgeNoise(ct * 3 + y * 0.6, st * 3 - y * 0.6) * 0.12;
    return this.edgeRadius(theta) * (1 - 0.05 * t * t) + lump;
  }

  /** Top of the cliff (just under the turf lip) at angle `theta`. */
  cliffTop(theta: number): number {
    const rTop = this.edgeRadius(theta) - LIP;
    return this.heightAt(Math.cos(theta) * rTop, Math.sin(theta) * rTop) - LIP;
  }

  private soilColor(theta: number, y: number, t: number, out: THREE.Color): THREE.Color {
    const wobble = this.colorNoise(Math.cos(theta) * 2, Math.sin(theta) * 2) * 0.25;
    const band = Math.sin((y + wobble) * 5.5) * 0.5 + 0.5;
    const fine = Math.sin((y - wobble * 0.5) * 17.0) * 0.5 + 0.5;
    out.copy(SOIL_LIGHT).lerp(SOIL_MID, band);
    out.lerp(SOIL_SAND, smoothstep(0.75, 1.0, fine) * 0.35);
    // Dark, rooty band just under the turf, deepening toward the bottom.
    out.lerp(SOIL_ROOT, (1 - smoothstep(0.0, 0.18, t)) * 0.75);
    out.lerp(SOIL_DEEP, smoothstep(0.55, 1.0, t) * 0.8);
    return out.multiplyScalar(clamp(0.92 + wobble * 0.3, 0.8, 1.05));
  }
}

const MEADOW_DEEP = new THREE.Color('#5f9440');
const MEADOW_MID = new THREE.Color('#86b24a');
const MEADOW_SUN = new THREE.Color('#bcc45c');
const GRASS_SHADE = new THREE.Color('#557a33');
const SOIL_ROOT = new THREE.Color('#5a3e2a');
const SOIL_LIGHT = new THREE.Color('#b9875a');
const SOIL_MID = new THREE.Color('#9a6a45');
const SOIL_DEEP = new THREE.Color('#5a3d2a');
const SOIL_SAND = new THREE.Color('#d4a874');
const STONE_COLORS = ['#a39a8c', '#8e8679', '#b5aa98', '#7d766b'];

/** Little stones poking out of the earthen cliff, so the edge feels hand-cut and real. */
export function createCliffStones(terrain: Terrain, count: number, seed: number): THREE.InstancedMesh {
  const rng = createRng(seed);
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ flatShading: true }), count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const theta = rng() * Math.PI * 2;
    const t = 0.12 + rng() * 0.8;
    const yTop = terrain.cliffTop(theta);
    const y = lerp(yTop, -SIDE_DEPTH, t);
    const r = terrain.cliffRadius(theta, t, y) - 0.02;
    const size = lerp(0.08, 0.26, rng() * rng());
    p.set(Math.cos(theta) * r, y, Math.sin(theta) * r);
    e.set(rng() * 6, rng() * 6, rng() * 6);
    q.setFromEuler(e);
    s.set(size * lerp(1, 1.6, rng()), size * lerp(0.6, 1, rng()), size);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, col.set(STONE_COLORS[Math.floor(rng() * STONE_COLORS.length)]));
  }
  return mesh;
}
