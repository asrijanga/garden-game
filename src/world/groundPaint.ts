import * as THREE from 'three';

/** World half-size covered by the paint layer (the clearing plus a margin). */
export const PAINT_HALF = 25;
const SIZE = 512; // ~10 cm per texel

/**
 * What the player has done to the ground, painted into a texture the lawn shader reads.
 * Red = worn earth under paths. (Green and blue are reserved for flower beds and the pond.)
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

  /** Wear a soft dab of earth into the lawn at (x, z). */
  wear(x: number, z: number, radius: number, strength = 1) {
    const [cx, cy] = this.toCanvas(x, z);
    const r = (radius / (PAINT_HALF * 2)) * SIZE;
    const g = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    // Light dabs that build up gradually: a gentle ramp at the edge leaves room for roughness.
    g.addColorStop(0, `rgba(255,0,0,${0.16 * strength})`);
    g.addColorStop(0.5, `rgba(255,0,0,${0.1 * strength})`);
    g.addColorStop(1, 'rgba(255,0,0,0)');
    this.ctx.globalCompositeOperation = 'lighter';
    this.ctx.fillStyle = g;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.globalCompositeOperation = 'source-over';
    this.dirty = true;
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
