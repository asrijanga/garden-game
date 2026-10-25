import * as THREE from 'three';

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
  private readonly ctx: CanvasRenderingContext2D;
  private dirty = false;

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    this.ctx = canvas.getContext('2d', { willReadFrequently: false })!;
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, SIZE, SIZE);
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
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

  /** Upload changes at most once per frame. */
  update() {
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
