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
  private readonly clearing: { x: number; z: number; r: number; t: number }[] = [];
  /**
   * Everything painted, in order, so the canvas can be repainted if the browser throws it
   * away (iOS may discard a backgrounded page's canvases, or lose the WebGL context).
   */
  private readonly log: ({ k: 0; x: number; z: number; rad: number; r: number; g: number; b: number } | { k: 1; x: number; z: number; rad: number })[] = [];
  private checkIn = 2;

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    // CPU-backed: on iOS a GPU canvas must be read back before every upload to WebGL, which stalls.
    this.ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    this.blank();
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
  }

  /** Black, plus a faint marker pixel in the far corner (out in the woods) that shows the canvas is still ours. */
  private blank() {
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, SIZE, SIZE);
    this.ctx.fillStyle = 'rgb(0,0,1)';
    this.ctx.fillRect(0, 0, 1, 1);
  }

  /** Has the browser wiped the canvas behind our back? */
  private wiped(): boolean {
    const px = this.ctx.getImageData(0, 0, 1, 1).data;
    return px[0] !== 0 || px[1] !== 0 || px[2] !== 1;
  }

  /**
   * If the canvas was lost (say, while the app was in the background), paint it all again from
   * the log and re-upload it. Cheap to call: it only checks one pixel unless something's wrong.
   */
  restore(force = false) {
    if (!force && !this.wiped()) {
      this.texture.needsUpdate = true;
      return;
    }
    this.blank();
    for (const op of this.log) {
      if (op.k === 0) this.dab(op.x, op.z, op.rad, op.r, op.g, op.b, false);
      else this.clearNow(op.x, op.z, op.rad, 1);
    }
    for (const c of this.clearing) this.clearNow(c.x, c.z, c.r, c.t);
    this.texture.needsUpdate = true;
  }

  private clearNow(x: number, z: number, radius: number, t: number) {
    // Darken = per-channel minimum: each pass can only take paint away, never add it.
    this.ctx.globalCompositeOperation = 'darken';
    const [cx, cy] = this.toCanvas(x, z);
    const rad = (radius / (PAINT_HALF * 2)) * SIZE;
    const v = Math.round(255 * (1 - t * t * (3 - 2 * t)));
    const grad = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    grad.addColorStop(0, `rgb(${v},${v},${v})`);
    grad.addColorStop(0.6, `rgb(${v},${v},${v})`);
    grad.addColorStop(1, 'rgb(255,255,255)');
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.globalCompositeOperation = 'source-over';
  }

  private toCanvas(x: number, z: number): [number, number] {
    return [((x + PAINT_HALF) / (PAINT_HALF * 2)) * SIZE, ((z + PAINT_HALF) / (PAINT_HALF * 2)) * SIZE];
  }

  /**
   * One soft, round dab. Paint is opaque and combined with a per-channel *maximum*, so going over
   * the same spot again (slow strokes, holding still, doubling back) never makes it any wider:
   * the width is set by `radius` alone.
   */
  private dab(x: number, z: number, radius: number, r: number, g: number, b: number, record = true) {
    if (record) this.log.push({ k: 0, x, z, rad: radius, r, g, b });
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
    this.log.push({ k: 1, x, z, rad: radius });
  }

  /** Back to an untouched garden (before an undo replays what remains). */
  reset() {
    this.blank();
    this.clearing.length = 0;
    this.log.length = 0;
    this.dirty = true;
  }

  /** Upload changes at most once per frame (and now and then, make sure the canvas is still ours). */
  update(dt = 0) {
    for (let i = this.clearing.length - 1; i >= 0; i--) {
      const c = this.clearing[i];
      c.t = Math.min(1, c.t + dt / 0.9);
      this.clearNow(c.x, c.z, c.r, c.t);
      this.dirty = true;
      if (c.t >= 1) this.clearing.splice(i, 1);
    }
    this.checkIn -= dt;
    if (this.checkIn <= 0) {
      this.checkIn = 2;
      if (this.wiped()) this.restore(true);
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
