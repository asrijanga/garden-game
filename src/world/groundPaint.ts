import * as THREE from 'three';
import type { Mulch } from './flowerSpecies';

/** Mulch styles as colours in the style layer (cedar is the default, black). */
const MULCH_RGB: Record<Mulch, string> = { cedar: '#000000', cocoa: '#ff0000', pea: '#00ff00', slate: '#0000ff' };

/** World half-size covered by the paint layer (the clearing plus a margin). */
export const PAINT_HALF = 25;
const SIZE = 512; // ~10 cm per texel

/**
 * What the player has done to the ground, painted into a texture the lawn shader reads.
 * Red = worn earth under paths. Green = how sandy/gravelly that earth is (relative to red).
 * Blue = flower-bed soil.
 */
export class GroundPaint {
  readonly texture: THREE.CanvasTexture;
  /** Which dressing each bed has: R cocoa, G pea gravel, B slate gravel, black cedar. */
  readonly mulchTexture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly mulchCtx: CanvasRenderingContext2D;
  private dirty = false;
  private mulchDirty = false;
  private readonly clearing: { x: number; z: number; r: number; t: number }[] = [];

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    // CPU-backed: on iOS a GPU canvas must be read back before every upload to WebGL, which stalls.
    this.ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, SIZE, SIZE);
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    const mc = document.createElement('canvas');
    mc.width = mc.height = SIZE;
    this.mulchCtx = mc.getContext('2d', { willReadFrequently: true })!;
    this.mulchCtx.fillStyle = '#000';
    this.mulchCtx.fillRect(0, 0, SIZE, SIZE);
    this.mulchTexture = new THREE.CanvasTexture(mc);
    this.mulchTexture.colorSpace = THREE.NoColorSpace;
    this.mulchTexture.minFilter = THREE.LinearFilter;
    this.mulchTexture.magFilter = THREE.LinearFilter;
    this.mulchTexture.generateMipmaps = false;
  }

  /** Set the dressing under a bed dab (the newest bed wins where two styles overlap). */
  mulch(x: number, z: number, radius: number, style: Mulch) {
    const [cx, cy] = this.toCanvas(x, z);
    this.mulchCtx.fillStyle = MULCH_RGB[style];
    this.mulchCtx.beginPath();
    this.mulchCtx.arc(cx, cy, (radius / (PAINT_HALF * 2)) * SIZE, 0, Math.PI * 2);
    this.mulchCtx.fill();
    this.mulchDirty = true;
  }

  private toCanvas(x: number, z: number): [number, number] {
    return [((x + PAINT_HALF) / (PAINT_HALF * 2)) * SIZE, ((z + PAINT_HALF) / (PAINT_HALF * 2)) * SIZE];
  }

  /**
   * One soft, round dab. Paint is opaque and combined with a per-channel *maximum*, so going over
   * the same spot again (slow strokes, holding still, doubling back) never makes it any wider:
   * the width is set by `radius` alone.
   */
  private dab(x: number, z: number, radius: number, r: number, g: number, b: number) {
    const [cx, cy] = this.toCanvas(x, z);
    const rad = (radius / (PAINT_HALF * 2)) * SIZE;
    const grad = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    const at = (k: number) => `rgb(${Math.round(255 * r * k)},${Math.round(255 * g * k)},${Math.round(255 * b * k)})`;
    // Full strength in the middle, then a soft shoulder: the visible edge sits at about 80% of radius.
    grad.addColorStop(0, at(1));
    grad.addColorStop(0.55, at(0.9));
    grad.addColorStop(0.8, at(0.45));
    grad.addColorStop(1, at(0));
    this.ctx.globalCompositeOperation = 'lighten';
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.globalCompositeOperation = 'source-over';
    this.dirty = true;
  }

  /** Wear a dab of path earth (or gravel, when `sand` is 1) into the lawn at (x, z). */
  wear(x: number, z: number, radius: number, strength = 1, sand = 0) {
    this.dab(x, z, radius, strength, strength * sand, 0);
  }

  /** Dig a dab of rich, dark bed soil (blue channel) at (x, z). */
  bed(x: number, z: number, radius: number, strength = 1) {
    this.dab(x, z, radius, 0, 0, strength);
  }

  /** Let the lawn grow back over (x, z): paint fades away there over a moment, softly at the rim. */
  clear(x: number, z: number, radius: number) {
    this.clearing.push({ x, z, r: radius, t: 0 });
  }

  /** Upload changes at most once per frame. */
  update(dt = 0) {
    // Darken = per-channel minimum: each pass can only take paint away, never add it.
    this.ctx.globalCompositeOperation = 'darken';
    for (let i = this.clearing.length - 1; i >= 0; i--) {
      const c = this.clearing[i];
      c.t = Math.min(1, c.t + dt / 0.9);
      const [cx, cy] = this.toCanvas(c.x, c.z);
      const rad = (c.r / (PAINT_HALF * 2)) * SIZE;
      const v = Math.round(255 * (1 - c.t * c.t * (3 - 2 * c.t)));
      const grad = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      grad.addColorStop(0, `rgb(${v},${v},${v})`);
      grad.addColorStop(0.6, `rgb(${v},${v},${v})`);
      grad.addColorStop(1, 'rgb(255,255,255)');
      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      this.ctx.fill();
      this.dirty = true;
      if (c.t >= 1) this.clearing.splice(i, 1);
    }
    this.ctx.globalCompositeOperation = 'source-over';
    if (this.mulchDirty) {
      this.mulchTexture.needsUpdate = true;
      this.mulchDirty = false;
    }
    if (!this.dirty) return;
    this.texture.needsUpdate = true;
    this.dirty = false;
  }
}

/** GLSL: world xz → paint-texture uv (canvas textures are flipped vertically on upload). */
export const paintUvGLSL = /* glsl */ `
vec2 paintUv(vec2 xz) {
  vec2 uv = (xz + ${PAINT_HALF.toFixed(1)}) / ${(PAINT_HALF * 2).toFixed(1)};
  return vec2(uv.x, 1.0 - uv.y);
}
`;
