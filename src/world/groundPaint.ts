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
  /**
   * Painted on a 2D canvas, but uploaded from our own pixel copy, a few rows at a time: only
   * the patch that changed goes to the GPU (re-sending the whole 1 MB image every frame while
   * drawing a path was a big cause of lag).
   */
  readonly texture: THREE.DataTexture;
  private readonly data = new Uint8Array(SIZE * SIZE * 4);
  private readonly ctx: CanvasRenderingContext2D;
  /** The changed patch of the canvas since the last upload (pixels; empty when x0 > x1). */
  private x0 = 0;
  private y0 = 0;
  private x1 = -1;
  private y1 = -1;
  private patch = new Uint8Array(SIZE * 64 * 4);
  private renderer: THREE.WebGLRenderer | null = null;
  /** A full upload is still waiting for the texture to reach the GPU. */
  private pendingFull = true;
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
    this.texture = new THREE.DataTexture(this.data, SIZE, SIZE, THREE.RGBAFormat);
    this.blank();
    this.flush();
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
    this.mark(0, 0, SIZE, SIZE);
  }

  private mark(ax: number, ay: number, bx: number, by: number) {
    if (this.x0 > this.x1) {
      this.x0 = ax;
      this.y0 = ay;
      this.x1 = bx;
      this.y1 = by;
    } else {
      this.x0 = Math.min(this.x0, ax);
      this.y0 = Math.min(this.y0, ay);
      this.x1 = Math.max(this.x1, bx);
      this.y1 = Math.max(this.y1, by);
    }
  }

  /** Upload changed patches straight to the GPU (once the texture is there), in a single call. */
  attach(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
  }

  /**
   * Copy the changed patch into our pixels, and send just that rectangle to the GPU in one call
   * (three.js would send a dirty region row by row: a hundred calls a frame while erasing).
   */
  private flush() {
    if (this.x0 > this.x1) return;
    const x0 = Math.max(0, Math.floor(this.x0) - 1);
    const y0 = Math.max(0, Math.floor(this.y0) - 1);
    const x1 = Math.min(SIZE, Math.ceil(this.x1) + 1);
    const y1 = Math.min(SIZE, Math.ceil(this.y1) + 1);
    this.x1 = -1;
    this.x0 = 0;
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) return;
    const px = this.ctx.getImageData(x0, y0, w, h).data;
    // Rows go in upside down (canvas top = texture bottom), as a canvas texture's would; the
    // patch is packed bottom row first for its own upload.
    if (this.patch.length < w * h * 4) this.patch = new Uint8Array(SIZE * Math.max(h, 64) * 4);
    for (let row = 0; row < h; row++) {
      const src = px.subarray(row * w * 4, (row + 1) * w * 4);
      this.data.set(src, ((SIZE - 1 - (y0 + row)) * SIZE + x0) * 4);
      this.patch.set(src, (h - 1 - row) * w * 4);
    }
    const r = this.renderer;
    const tex = r ? (r.properties.get(this.texture) as { __webglTexture?: WebGLTexture }).__webglTexture : undefined;
    if (!r || !tex || this.pendingFull) {
      // Not on the GPU yet (or a whole repaint): let three.js upload the lot.
      this.texture.needsUpdate = true;
      this.pendingFull = !tex;
      return;
    }
    const gl = r.getContext() as WebGL2RenderingContext;
    const st = r.state;
    st.bindTexture(gl.TEXTURE_2D, tex);
    st.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    st.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    st.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    st.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    st.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    st.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, SIZE - y1, w, h, gl.RGBA, gl.UNSIGNED_BYTE, this.patch, 0);
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
    if (!force && !this.wiped()) return;
    this.blank();
    for (const op of this.log) {
      if (op.k === 0) this.dab(op.x, op.z, op.rad, op.r, op.g, op.b, false);
      else this.clearNow(op.x, op.z, op.rad, 1);
    }
    for (const c of this.clearing) this.clearNow(c.x, c.z, c.r, c.t);
    this.mark(0, 0, SIZE, SIZE);
    this.flush();
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
    this.mark(cx - rad, cy - rad, cx + rad, cy + rad);
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
    if (record) {
      this.log.push({ k: 0, x, z, rad: radius, r, g, b });
      // Anything still fading away from an earlier erase finishes now, so it can never eat
      // into paint laid after it (a garden being rebuilt replays strokes far faster than the fade).
      if (this.clearing.length) {
        for (const c of this.clearing) this.clearNow(c.x, c.z, c.r, 1);
        this.clearing.length = 0;
      }
    }
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
    this.mark(cx - rad, cy - rad, cx + rad, cy + rad);
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
  }

  /** Upload changes at most once per frame (and now and then, make sure the canvas is still ours). */
  update(dt = 0) {
    for (let i = this.clearing.length - 1; i >= 0; i--) {
      const c = this.clearing[i];
      c.t = Math.min(1, c.t + dt / 0.9);
      this.clearNow(c.x, c.z, c.r, c.t);
      if (c.t >= 1) this.clearing.splice(i, 1);
    }
    this.checkIn -= dt;
    if (this.checkIn <= 0) {
      this.checkIn = 2;
      if (this.wiped()) this.restore(true);
    }
    this.flush();
  }
}

/** GLSL: world xz → paint-texture uv (rows are stored flipped, as a canvas texture's would be). */
export const paintUvGLSL = /* glsl */ `
vec2 paintUv(vec2 xz) {
  vec2 uv = (xz + ${PAINT_HALF.toFixed(1)}) / ${(PAINT_HALF * 2).toFixed(1)};
  return vec2(uv.x, 1.0 - uv.y);
}
`;
