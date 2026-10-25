import * as THREE from 'three';
import { regrow } from '../core/regrow';
import { createNoise2D } from '../core/noise';
import { smoothstep } from '../core/random';
import { uniforms as windUniforms, windSampleGLSL } from '../render/wind';
import type { Ground } from './ground';
import type { SeasonPalette } from './season';

/** World half-size covered by the pond field (the clearing plus a margin). */
export const POND_HALF = 25;
const N = 256; // field vertices per side, ~20 cm apart
const CELL = (POND_HALF * 2) / N;
const CH = 32; // cells per chunk side
const CHUNKS = N / CH;
/** Depth range encoded in the pond texture's red channel. */
export const POND_MAX_DEPTH = 1.2;
/** Height range (either side of the waterline) encoded in the pond texture's blue channel. */
export const POND_WATERLINE_RANGE = 0.4;
const DEPTH = 0.62; // deepest dig, reached ~1.8 m in from the edge
const SHORE_HALO = 0.6; // damp grass this far round the water (and where the lawn steps aside)
const BANK_MARGIN = 2.4; // the basin mesh covers this much lawn round a pond (lowered lawn reaches ~2.1 m)
const BLEND = 1.0; // radius of the soft curve where separate ponds meet
const NONE = -99;
const FILL_TIME = 3.2;
const RIPPLES = 8;

/** Dig depth (R), shore halo (G) and height above the waterline (B), read by the lawn shader. One texel per field vertex. */
export function createPondTexture(): THREE.DataTexture {
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) data[i * 4 + 2] = 255; // far above any water
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** GLSL: world xz → pond-texture uv (texel centres sit exactly on field vertices). */
export const pondUvGLSL = /* glsl */ `
vec2 pondUv(vec2 xz) { return (xz + ${POND_HALF.toFixed(1)}) / ${(POND_HALF * 2).toFixed(1)}; }
`;

export interface PondBody {
  id: number;
  /** Field vertices (indices) under this pond's outline. */
  cells: number[];
  /** Water surface height now, and where it's heading. */
  level: number;
  target: number;
  filled: boolean;
  fillFrom: number;
  fillT: number;
  delay: number;
  chunks: Set<number>;
}

interface Chunk {
  key: number;
  i0: number;
  j0: number;
  nx: number;
  nz: number;
  basin: THREE.Mesh;
  water: THREE.Mesh;
}

/**
 * Ponds dug into the lawn. A signed "inside distance" field on a fine grid defines every pond's
 * outline (strokes melt together with soft, rounded joins); the depth profile, the lawn's muddy
 * banks, the basin mesh and the flat water surface all follow from it.
 *
 * The lawn mesh is too coarse to dig into, so near a pond it steps down out of sight and a fine
 * basin mesh (painted with the very same lawn shader) takes over, sinking gently into shape.
 */
export class Ponds {
  readonly group = new THREE.Group();
  readonly bodies = new Map<number, PondBody>();
  private readonly S = new Float32Array(N * N).fill(NONE);
  private readonly base = new Float32Array(N * N);
  private readonly strokeS = new Float32Array(N * N);
  private readonly D = new Float32Array(N * N);
  /** How far below the lawn the finished bed lies (D, plus levelling on sloping ground). */
  private readonly O = new Float32Array(N * N);
  private readonly G = new Float32Array(N * N).fill(NaN);
  private readonly B = new Float32Array(N * N).fill(NaN);
  private comp = new Int32Array(N * N).fill(-1);
  private readonly chunks = new Map<number, Chunk>();
  private readonly spare = new Map<number, Chunk>();
  private prebuildNext = 0;
  private readonly digging = new Set<number>();
  private readonly data: Uint8Array;
  private readonly noise = createNoise2D(913);
  private readonly waterMat: THREE.ShaderMaterial;
  private readonly index: THREE.BufferAttribute[] = [];
  private nextId = 1;
  private compsDirty = false;
  private sinceBodies = 0;
  /** Bounds of every field vertex that has ever been inside a pond (the flood fill's search area). */
  private bounds = { i0: N, i1: -1, j0: N, j1: -1 };
  private texDirty = false;
  private stroking = false;
  private time = 0;
  private ripple = 0;
  private readonly tmp = new THREE.Color();

  constructor(
    private readonly ground: Ground,
    private readonly texture: THREE.DataTexture,
    palette: SeasonPalette,
    private readonly onFill: (body: PondBody) => void = () => {},
  ) {
    this.data = texture.image.data as Uint8Array;
    this.waterMat = waterMaterial(palette);
    // Hidden stand-ins, so the basin and water shaders are compiled at load, not on first dig.
    const geo = new THREE.BufferGeometry();
    for (const [name, size] of [['position', 3], ['normal', 3], ['color', 3], ['aMeadow', 1], ['aDepth', 1], ['aWet', 1]] as const) {
      geo.setAttribute(name, new THREE.BufferAttribute(new Float32Array(3 * size), size));
    }
    for (const mat of [this.ground.basinMaterial, this.waterMat]) {
      const warm = new THREE.Mesh(geo, mat);
      warm.visible = false;
      this.group.add(warm);
    }
  }

  // --- Field helpers ---------------------------------------------------------------------------

  private wx(i: number) {
    return -POND_HALF + (i + 0.5) * CELL;
  }

  private gi(x: number) {
    return (x + POND_HALF) / CELL - 0.5;
  }

  private groundAt(v: number): number {
    let g = this.G[v];
    if (Number.isNaN(g)) {
      g = this.G[v] = this.ground.heightAt(this.wx(v % N), this.wx(Math.floor(v / N)));
    }
    return g;
  }

  private basinAt(v: number): number {
    const b = this.B[v];
    return Number.isNaN(b) ? this.groundAt(v) : b;
  }

  private bilinear(arr: Float32Array, x: number, z: number, fallback: number): number {
    const fx = this.gi(x);
    const fz = this.gi(z);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= N - 1 || j >= N - 1) return fallback;
    const tx = fx - i;
    const tz = fz - j;
    const v = j * N + i;
    const a = arr[v] + (arr[v + 1] - arr[v]) * tx;
    const b = arr[v + N] + (arr[v + N + 1] - arr[v + N]) * tx;
    return a + (b - a) * tz;
  }

  private nearest(x: number, z: number): number {
    const i = Math.round(this.gi(x));
    const j = Math.round(this.gi(z));
    if (i < 0 || j < 0 || i >= N || j >= N) return -1;
    return j * N + i;
  }

  /** Signed distance into the nearest pond's outline (negative outside). */
  inside(x: number, z: number): number {
    return this.bilinear(this.S, x, z, NONE);
  }

  /** Is (x, z) in a pond, or within `margin` of one? */
  contains(x: number, z: number, margin = 0): boolean {
    return this.inside(x, z) > -margin;
  }

  /** Height of the finished pond bed at (x, z) (the lawn, away from ponds). */
  bedHeight(x: number, z: number): number {
    // From the cached lawn heights near ponds (cheap), the analytic lawn elsewhere.
    const fx = this.gi(x);
    const fz = this.gi(z);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= N - 1 || j >= N - 1) return this.ground.heightAt(x, z);
    const v = j * N + i;
    const h = (c: number) => this.groundAt(c) - this.O[c];
    const tx = fx - i;
    const a = h(v) + (h(v + 1) - h(v)) * tx;
    const b = h(v + N) + (h(v + N + 1) - h(v + N)) * tx;
    return a + (b - a) * (fz - j);
  }

  bodyAt(x: number, z: number): PondBody | undefined {
    const v = this.nearest(x, z);
    return v < 0 ? undefined : this.bodies.get(this.comp[v]);
  }

  /** How deep the (finished) water is at (x, z); 0 on dry land. */
  waterDepth(x: number, z: number): number {
    const body = this.bodyAt(x, z);
    if (!body || !body.filled) return 0;
    return Math.max(0, body.target - this.bedHeight(x, z));
  }

  cellPosition(v: number, out: THREE.Vector2): THREE.Vector2 {
    return out.set(this.wx(v % N), this.wx(Math.floor(v / N)));
  }

  /** Field vertices on the edge of a pond (inside, with a dry neighbour). */
  rim(body: PondBody): number[] {
    return body.cells.filter((v) => this.S[v - 1] <= 0 || this.S[v + 1] <= 0 || this.S[v - N] <= 0 || this.S[v + N] <= 0);
  }

  /** Expanding rings on the water at (x, z). */
  addRipple(x: number, z: number, strength: number) {
    const r = this.waterMat.uniforms.uRipples.value[this.ripple] as THREE.Vector4;
    r.set(x, z, this.time, strength);
    this.ripple = (this.ripple + 1) % RIPPLES;
  }

  // --- Digging ---------------------------------------------------------------------------------

  beginStroke() {
    this.base.set(this.S);
    this.strokeS.fill(NONE);
    this.stroking = true;
  }

  /** Dig a soft round dab of pond, `r` metres across the middle, into the current stroke. */
  dab(x: number, z: number, r: number) {
    this.dig(x - r, x + r, z - r, z + r, (px, pz) => r - Math.hypot(px - x, pz - z));
  }

  /** Dig out the whole area inside a closed outline, reaching `pad` metres past it. */
  fillOutline(outline: THREE.Vector2[], pad: number) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of outline) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.y); z1 = Math.max(z1, p.y);
    }
    this.dig(x0 - pad, x1 + pad, z0 - pad, z1 + pad, (px, pz) => {
      let d = Infinity;
      let inside = false;
      for (let k = 0, l = outline.length - 1; k < outline.length; l = k++) {
        const a = outline[l];
        const b = outline[k];
        if (a.y > pz !== b.y > pz && px < ((b.x - a.x) * (pz - a.y)) / (b.y - a.y) + a.x) inside = !inside;
        const ex = b.x - a.x;
        const ez = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((px - a.x) * ex + (pz - a.y) * ez) / (ex * ex + ez * ez || 1)));
        d = Math.min(d, Math.hypot(px - a.x - ex * t, pz - a.y - ez * t));
      }
      return (inside ? d : -d) + pad;
    });
  }

  /** Merge a shape (signed distance `shape`, positive inside) into the current stroke. */
  private dig(x0: number, x1: number, z0: number, z1: number, shape: (x: number, z: number) => number) {
    const reach = BLEND + 0.6;
    const i0 = Math.max(1, Math.floor(this.gi(x0 - reach)));
    const i1 = Math.min(N - 2, Math.ceil(this.gi(x1 + reach)));
    const j0 = Math.max(1, Math.floor(this.gi(z0 - reach)));
    const j1 = Math.min(N - 2, Math.ceil(this.gi(z1 + reach)));
    for (let j = j0; j <= j1; j++) {
      const pz = this.wx(j);
      for (let i = i0; i <= i1; i++) {
        const px = this.wx(i);
        const v = j * N + i;
        // A hand-dug outline: gently lobed, never a perfect circle.
        const raw = shape(px, pz);
        // Already dug at least this deep by an earlier dab of this stroke (wobble is at most ±0.27).
        if (raw + 0.28 <= this.strokeS[v]) continue;
        const wob = this.noise(px * 0.55, pz * 0.55) * 0.2 + this.noise(px * 1.7 + 7, pz * 1.7) * 0.07;
        const s = raw + wob;
        if (s <= this.strokeS[v]) continue;
        this.strokeS[v] = s;
        // Separate ponds (earlier strokes) meet in a soft, rounded curve.
        const a = this.base[v];
        const h = Math.max(BLEND - Math.abs(a - s), 0) / BLEND;
        const S = Math.max(a, s) + h * h * BLEND * 0.25;
        if (S <= this.S[v] + 1e-4) continue;
        this.S[v] = S;
        this.setDepth(v, px, pz);
        if (S > 0) {
          const b = this.bounds;
          b.i0 = Math.min(b.i0, i); b.i1 = Math.max(b.i1, i);
          b.j0 = Math.min(b.j0, j); b.j1 = Math.max(b.j1, j);
        }
      }
    }
    // Make sure basin meshes cover the dig and the lowered lawn round it.
    const span = BANK_MARGIN + 0.5;
    const c0 = Math.max(0, Math.floor((this.gi(x0 - span) + 0.5) / CH));
    const c1 = Math.min(CHUNKS - 1, Math.floor((this.gi(x1 + span) + 0.5) / CH));
    const d0 = Math.max(0, Math.floor((this.gi(z0 - span) + 0.5) / CH));
    const d1 = Math.min(CHUNKS - 1, Math.floor((this.gi(z1 + span) + 0.5) / CH));
    for (let cj = d0; cj <= d1; cj++) for (let ci = c0; ci <= c1; ci++) this.chunk(ci, cj);
    this.compsDirty = true;
  }

  private setDepth(v: number, px: number, pz: number) {
    const s = this.S[v];
    let d = 0;
    if (s > 0) {
      // Gentle shelving banks, a soft uneven floor.
      d = DEPTH * Math.pow(smoothstep(0, 1.8, s), 0.8);
      d += this.noise(px * 0.8 + 3, pz * 0.8) * 0.06 * smoothstep(0.3, 1.2, s);
    }
    this.D[v] = d;
    this.data[v * 4 + 1] = Math.round(smoothstep(-SHORE_HALO, 0, s) * 255);
    // Provisional until the pond's waterline is known (next frame).
    this.retarget(v, s > 0 ? this.groundAt(v) : Infinity);
  }

  /**
   * Final bed height for a vertex in a pond whose lowest bank is at `bank`. On sloping ground the
   * higher side is cut down to the same level a little way in, so the water reaches the far
   * shore instead of leaving a dry shelf.
   */
  private retarget(v: number, bank: number) {
    const g = this.groundAt(v);
    const s = this.S[v];
    const o = s > 0 ? this.D[v] + Math.max(0, g - bank) * smoothstep(0, 0.9, s) : 0;
    if (Math.abs(o - this.O[v]) > 1e-4) {
      this.O[v] = o;
      this.digging.add(this.chunkKey(v % N, Math.floor(v / N)));
    }
    this.data[v * 4] = Math.round((Math.min(o, POND_MAX_DEPTH) / POND_MAX_DEPTH) * 255);
    const above = s > 0 ? g - o - (bank - 0.07) : POND_WATERLINE_RANGE;
    this.data[v * 4 + 2] = Math.round(Math.min(1, Math.max(0, 0.5 + (0.5 * above) / POND_WATERLINE_RANGE)) * 255);
    this.texDirty = true;
  }

  private chunkKey(i: number, j: number) {
    return Math.min(CHUNKS - 1, Math.floor(j / CH)) * CHUNKS + Math.min(CHUNKS - 1, Math.floor(i / CH));
  }

  /**
   * Finish the stroke: every pond it touched fills (or tops up) to just below its lowest bank.
   * Returns the ponds that changed.
   */
  endStroke(): PondBody[] {
    if (!this.stroking) return [];
    this.stroking = false;
    this.recomputeBodies();
    const changed: PondBody[] = [];
    for (const body of this.bodies.values()) {
      if (!body.cells.some((v) => this.strokeS[v] > 0)) continue;
      const rim = this.rim(body);
      let low = Infinity;
      for (const v of rim) low = Math.min(low, this.groundAt(v));
      const target = low - 0.07;
      body.delay = (body.filled ? 0 : 0.7) + regrow.offset;
      body.filled = true;
      body.fillFrom = body.level;
      body.fillT = 0;
      body.target = target;
      this.showWater(body);
      this.onFill(body);
      changed.push(body);
    }
    return changed;
  }

  /**
   * Fill in pond within `r` of (x, z): the outline is pulled back with a soft curve and the bed
   * rises back up to the lawn. Returns whether any pond was touched.
   */
  erase(x: number, z: number, r: number): boolean {
    const k = 0.5;
    const reach = r + k;
    const i0 = Math.max(1, Math.floor(this.gi(x - reach)));
    const i1 = Math.min(N - 2, Math.ceil(this.gi(x + reach)));
    const j0 = Math.max(1, Math.floor(this.gi(z - reach)));
    const j1 = Math.min(N - 2, Math.ceil(this.gi(z + reach)));
    let touched = false;
    for (let j = j0; j <= j1; j++) {
      const pz = this.wx(j);
      for (let i = i0; i <= i1; i++) {
        const v = j * N + i;
        const a = this.S[v];
        if (a <= -SHORE_HALO - 0.5) continue;
        const px = this.wx(i);
        const d = Math.hypot(px - x, pz - z) - r;
        const h = Math.max(k - Math.abs(a - d), 0) / k;
        const S = Math.min(a, d) - h * h * k * 0.25;
        if (S >= a - 1e-4) continue;
        this.S[v] = S;
        this.setDepth(v, px, pz);
        touched = true;
      }
    }
    if (touched) this.compsDirty = true;
    return touched;
  }

  /** After erasing: ponds that lost part of their bank settle to their new lowest edge. */
  settle() {
    this.recomputeBodies();
    for (const body of this.bodies.values()) {
      if (!body.filled) continue;
      let low = Infinity;
      for (const v of this.rim(body)) low = Math.min(low, this.groundAt(v));
      const target = low - 0.07;
      if (Math.abs(target - body.target) < 0.01) continue;
      body.fillFrom = body.level;
      body.fillT = 0;
      body.target = target;
    }
  }

  private showWater(body: PondBody) {
    for (const k of body.chunks) {
      const ch = this.chunks.get(k);
      if (!ch) continue;
      ch.water.visible = true;
      this.writeChunk(ch);
    }
  }

  /** Re-find the separate bodies of water (flood fill), carrying levels over from before. */
  private recomputeBodies() {
    this.compsDirty = false;
    this.sinceBodies = 0;
    const wet = new Set<number>(); // chunks whose water may change
    const old = this.comp;
    const comp = new Int32Array(N * N).fill(-1);
    const oldBodies = new Map(this.bodies);
    for (const b of oldBodies.values()) if (b.filled) for (const k of b.chunks) wet.add(k);
    this.bodies.clear();
    const stack: number[] = [];
    const { i0, i1, j0, j1 } = this.bounds;
    for (let v = j0 * N + i0; v <= j1 * N + i1; v++) {
      if (v % N < i0 || v % N > i1) continue;
      if (this.S[v] <= 0 || comp[v] !== -1) continue;
      const id = this.nextId++;
      const cells: number[] = [];
      stack.push(v);
      comp[v] = id;
      while (stack.length) {
        const c = stack.pop()!;
        cells.push(c);
        for (const n of [c - 1, c + 1, c - N, c + N]) {
          if (comp[n] === -1 && this.S[n] > 0) {
            comp[n] = id;
            stack.push(n);
          }
        }
      }
      // Level the bed to the lowest bank.
      let bank = Infinity;
      for (const c of cells) {
        if (this.S[c - 1] <= 0 || this.S[c + 1] <= 0 || this.S[c - N] <= 0 || this.S[c + N] <= 0) bank = Math.min(bank, this.groundAt(c));
      }
      for (const c of cells) this.retarget(c, bank);
      // Water already here (an older pond being extended) flows straight into the new part.
      let bottom = Infinity;
      let was: PondBody | undefined;
      for (const c of cells) {
        bottom = Math.min(bottom, this.groundAt(c) - this.O[c]);
        const b = oldBodies.get(old[c]);
        if (b?.filled && (!was || b.level < was.level)) was = b;
      }
      const chunks = new Set<number>();
      for (const c of cells) chunks.add(this.chunkKey(c % N, Math.floor(c / N)));
      const level = was ? was.level : bottom - 0.05;
      // Keep any rise that's under way going.
      this.bodies.set(id, {
        id,
        cells,
        level,
        target: was ? was.target : level,
        filled: !!was,
        fillFrom: was ? was.fillFrom : level,
        fillT: was ? was.fillT : 1,
        delay: was ? was.delay : 0,
        chunks,
      });
    }
    this.comp = comp;
    for (const b of this.bodies.values()) if (b.filled) for (const k of b.chunks) wet.add(k);
    for (const k of wet) {
      const ch = this.chunks.get(k);
      if (!ch) continue;
      ch.water.visible = false;
      this.writeChunk(ch);
    }
    for (const body of this.bodies.values()) if (body.filled) this.showWater(body);
  }

  // --- Meshes ----------------------------------------------------------------------------------

  /** Build one more hidden chunk in a quiet frame, so digging rarely has to build any. */
  private prebuild() {
    while (this.prebuildNext < CHUNKS * CHUNKS) {
      const key = this.prebuildNext++;
      const ci = key % CHUNKS;
      const cj = Math.floor(key / CHUNKS);
      if (this.chunks.has(key) || this.spare.has(key)) continue;
      // Only where a pond could ever be (the clearing, give or take the banks).
      const x = this.wx(ci * CH + CH / 2);
      const z = this.wx(cj * CH + CH / 2);
      if (Math.hypot(x, z) > 21 + CH * CELL) continue;
      const ch = this.build(ci, cj);
      ch.basin.visible = false;
      this.spare.set(key, ch);
      return;
    }
  }

  private chunk(ci: number, cj: number): Chunk {
    const key = cj * CHUNKS + ci;
    const have = this.chunks.get(key);
    if (have) return have;
    const spare = this.spare.get(key);
    if (spare) {
      this.spare.delete(key);
      spare.basin.visible = true;
      this.chunks.set(key, spare);
      this.writeChunk(spare);
      return spare;
    }
    const ch = this.build(ci, cj);
    this.chunks.set(key, ch);
    this.writeChunk(ch);
    return ch;
  }

  private build(ci: number, cj: number): Chunk {
    const key = cj * CHUNKS + ci;
    const i0 = ci * CH;
    const j0 = cj * CH;
    const nx = Math.min(CH, N - 1 - i0) + 1;
    const nz = Math.min(CH, N - 1 - j0) + 1;
    const count = nx * nz;
    const indexKey = nx * 1000 + nz;
    let index = this.index[indexKey];
    if (!index) {
      const idx: number[] = [];
      for (let b = 0; b < nz - 1; b++) {
        for (let a = 0; a < nx - 1; a++) {
          const p = b * nx + a;
          idx.push(p, p + nx, p + 1, p + 1, p + nx, p + nx + 1);
        }
      }
      index = this.index[indexKey] = new THREE.BufferAttribute(new Uint16Array(idx), 1);
    }
    const basinGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const meadow = new Float32Array(count);
    // The lawn's base colour only drifts over metres: sample it every 4th vertex and blend between.
    const C = 4;
    const cx = Math.ceil((nx - 1) / C) + 1;
    const cz = Math.ceil((nz - 1) / C) + 1;
    const coarse = new Float32Array(cx * cz * 4);
    for (let b = 0; b < cz; b++) {
      for (let a = 0; a < cx; a++) {
        const k = (b * cx + a) * 4;
        coarse[k + 3] = this.ground.vertexColor(this.wx(i0 + a * C), this.wx(j0 + b * C), this.tmp);
        coarse[k] = this.tmp.r;
        coarse[k + 1] = this.tmp.g;
        coarse[k + 2] = this.tmp.b;
      }
    }
    for (let b = 0; b < nz; b++) {
      const fb = b / C;
      const b0 = Math.min(cz - 2, Math.floor(fb));
      const tb = fb - b0;
      for (let a = 0; a < nx; a++) {
        const p = b * nx + a;
        pos[p * 3] = this.wx(i0 + a);
        pos[p * 3 + 2] = this.wx(j0 + b);
        const fa = a / C;
        const a0 = Math.min(cx - 2, Math.floor(fa));
        const ta = fa - a0;
        const k00 = (b0 * cx + a0) * 4;
        const k10 = k00 + 4;
        const k01 = k00 + cx * 4;
        const k11 = k01 + 4;
        const mix = (o: number) =>
          (coarse[k00 + o] * (1 - ta) + coarse[k10 + o] * ta) * (1 - tb) + (coarse[k01 + o] * (1 - ta) + coarse[k11 + o] * ta) * tb;
        col[p * 3] = mix(0);
        col[p * 3 + 1] = mix(1);
        col[p * 3 + 2] = mix(2);
        meadow[p] = mix(3);
      }
    }
    basinGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    basinGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    basinGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    basinGeo.setAttribute('aMeadow', new THREE.BufferAttribute(meadow, 1));
    basinGeo.setIndex(index);
    const waterGeo = new THREE.BufferGeometry();
    waterGeo.setAttribute('position', new THREE.BufferAttribute(pos.slice(), 3));
    waterGeo.setAttribute('aDepth', new THREE.BufferAttribute(new Float32Array(count), 1));
    waterGeo.setAttribute('aWet', new THREE.BufferAttribute(new Float32Array(count), 1));
    waterGeo.setIndex(index);
    const centre = new THREE.Vector3(this.wx(i0 + nx / 2), this.ground.heightAt(this.wx(i0 + nx / 2), this.wx(j0 + nz / 2)), this.wx(j0 + nz / 2));
    const sphere = new THREE.Sphere(centre, CH * CELL * 0.75 + 1.5);
    basinGeo.boundingSphere = sphere;
    waterGeo.boundingSphere = sphere.clone();
    const basin = new THREE.Mesh(basinGeo, this.ground.basinMaterial);
    basin.receiveShadow = true;
    const water = new THREE.Mesh(waterGeo, this.waterMat);
    water.visible = false;
    water.renderOrder = 1;
    this.group.add(basin, water);
    return { key, i0, j0, nx, nz, basin, water };
  }

  /** Copy field state into a chunk's meshes, optionally only the vertices in [i0..i1] × [j0..j1]. */
  private writeChunk(ch: Chunk, i0 = 0, i1 = N, j0 = 0, j1 = N) {
    const bPos = ch.basin.geometry.attributes.position as THREE.BufferAttribute;
    const nrm = ch.basin.geometry.attributes.normal as THREE.BufferAttribute;
    const wPos = ch.water.geometry.attributes.position as THREE.BufferAttribute;
    const wDepth = ch.water.geometry.attributes.aDepth as THREE.BufferAttribute;
    const wWet = ch.water.geometry.attributes.aWet as THREE.BufferAttribute;
    const a0 = Math.max(0, i0 - ch.i0);
    const a1 = Math.min(ch.nx - 1, i1 - ch.i0);
    const b0 = Math.max(0, j0 - ch.j0);
    const b1 = Math.min(ch.nz - 1, j1 - ch.j0);
    for (let b = b0; b <= b1; b++) {
      const j = ch.j0 + b;
      for (let a = a0; a <= a1; a++) {
        const i = ch.i0 + a;
        const v = j * N + i;
        const p = b * ch.nx + a;
        const y = this.basinAt(v);
        bPos.setY(p, y);
        // Smooth normals straight from the field, so chunk seams never show.
        const l = i > 0 ? this.basinAt(v - 1) : y;
        const r = i < N - 1 ? this.basinAt(v + 1) : y;
        const d = j > 0 ? this.basinAt(v - N) : y;
        const u = j < N - 1 ? this.basinAt(v + N) : y;
        const nx = -(r - l) / (2 * CELL);
        const nz = -(u - d) / (2 * CELL);
        const k = 1 / Math.hypot(nx, 1, nz);
        nrm.setXYZ(p, nx * k, k, nz * k);
        const body = this.bodies.get(this.comp[v]);
        const wet = body?.filled ? 1 : 0;
        const wy = wet ? body!.level : y - 0.3;
        wPos.setY(p, wy);
        wDepth.setX(p, wy - y);
        wWet.setX(p, wet);
      }
    }
    bPos.needsUpdate = nrm.needsUpdate = wPos.needsUpdate = wDepth.needsUpdate = wWet.needsUpdate = true;
  }

  // --- Animation -------------------------------------------------------------------------------

  update(dt: number) {
    this.time += dt;
    if (!this.stroking && this.time > 1.5) this.prebuild();
    this.waterMat.uniforms.uTime.value = this.time;
    // While digging, the (whole-field) flood fill runs a few times a second, not every frame.
    this.sinceBodies += dt;
    if (this.compsDirty && (!this.stroking || this.sinceBodies > 0.25)) this.recomputeBodies();
    if (this.texDirty) {
      this.texture.needsUpdate = true;
      this.texDirty = false;
    }
    const refresh = new Set<number>();
    const strips: { ch: Chunk; i0: number; i1: number; j0: number; j1: number }[] = [];
    // The ground sinks softly into its new shape.
    const k = 1 - Math.exp(-dt * 2.2);
    for (const key of [...this.digging]) {
      const ci = key % CHUNKS;
      const cj = Math.floor(key / CHUNKS);
      let moving = false;
      for (let j = cj * CH; j < Math.min(N, cj * CH + CH); j++) {
        for (let i = ci * CH; i < Math.min(N, ci * CH + CH); i++) {
          const v = j * N + i;
          const target = this.groundAt(v) - this.O[v];
          const b = this.basinAt(v);
          if (Math.abs(target - b) < 0.0005) {
            this.B[v] = target;
            continue;
          }
          this.B[v] = b + (target - b) * k;
          moving = true;
        }
      }
      if (!moving) this.digging.delete(key);
      refresh.add(key);
      // Neighbours share this chunk's edge vertices (and their normals look one vertex across):
      // refresh just that thin strip of theirs.
      const ri0 = ci * CH - 1;
      const ri1 = ci * CH + CH;
      const rj0 = cj * CH - 1;
      const rj1 = cj * CH + CH;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ch = this.chunks.get(key + dj * CHUNKS + di);
          if (ch) strips.push({ ch, i0: ri0, i1: ri1, j0: rj0, j1: rj1 });
        }
      }
    }
    // Water rises gently to its level.
    for (const body of this.bodies.values()) {
      if (!body.filled || body.fillT >= 1) continue;
      if (body.delay > 0) {
        body.delay -= dt;
        continue;
      }
      body.fillT = Math.min(1, body.fillT + dt / FILL_TIME);
      const t = body.fillT;
      const e = t * t * (3 - 2 * t);
      body.level = body.fillFrom + (body.target - body.fillFrom) * e;
      for (const c of body.chunks) refresh.add(c);
    }
    for (const key of refresh) {
      const ch = this.chunks.get(key);
      if (ch) this.writeChunk(ch);
    }
    for (const s of strips) if (!refresh.has(s.ch.key)) this.writeChunk(s.ch, s.i0, s.i1, s.j0, s.j1);
  }

  /** The water level (now) at (x, z), or null on dry land. */
  levelAt(x: number, z: number): number | null {
    const body = this.bodyAt(x, z);
    return body?.filled ? body.level : null;
  }
}

/**
 * Stylized water: clear and green-gold in the shallows, deepening to teal; a sky (and treeline)
 * reflection that strengthens at grazing angles; wavelets that follow the garden's gusts; sun
 * glints; soft foam lapping the shore; rings where fish break the surface.
 */
function waterMaterial(palette: SeasonPalette): THREE.ShaderMaterial {
  const sky = new THREE.Color(palette.sky);
  const ripples = Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0));
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      ...windUniforms,
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color('#8fcac0') },
      uDeep: { value: new THREE.Color('#2f7d93') },
      uSkyLow: { value: sky.clone().lerp(new THREE.Color('#ffffff'), 0.35) },
      uSkyHigh: { value: sky.clone().lerp(new THREE.Color('#7fb2dc'), 0.45) },
      uTree: { value: new THREE.Color('#2f4a2e').lerp(new THREE.Color(palette.fog), 0.25) },
      uFoam: { value: new THREE.Color('#f4f8f2') },
      uSunDir: { value: new THREE.Vector3(-0.62, 0.62, 0.48).normalize() },
      uRipples: { value: ripples },
    },
    vertexShader: /* glsl */ `
      attribute float aDepth;
      attribute float aWet;
      varying vec3 vWorld;
      varying float vDepth;
      varying float vWet;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vDepth = aDepth;
        vWet = aWet;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      ${windSampleGLSL}
      uniform float uTime;
      uniform vec3 uShallow, uDeep, uSkyLow, uSkyHigh, uTree, uFoam, uSunDir;
      uniform vec4 uRipples[${RIPPLES}];
      varying vec3 vWorld;
      varying float vDepth;
      varying float vWet;

      float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float wNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      vec2 wavelet(vec2 p, vec2 d, float freq, float speed, float amp) {
        // A slow wander in phase so the pattern never visibly repeats.
        float ph = dot(p, d) * freq - uTime * speed + sin(p.x * 0.9 + p.y * 0.6 + uTime * 0.2) * 1.5;
        return d * cos(ph) * amp * freq;
      }

      void main() {
        if (vWet < 0.5) discard;
        vec2 p = vWorld.xz;
        float depth = max(vDepth, 0.0);
        float w = windAt(p, 0.0);
        float stir = 0.18 + w * 0.9;
        vec2 d0 = uWindDir;
        vec2 d1 = vec2(d0.x * 0.8 - d0.y * 0.6, d0.x * 0.6 + d0.y * 0.8);
        vec2 d2 = vec2(d0.x * 0.8 + d0.y * 0.6, -d0.x * 0.6 + d0.y * 0.8);
        vec2 d3 = vec2(d0.x * 0.25 - d0.y * 0.97, d0.x * 0.97 + d0.y * 0.25);
        vec2 g = wavelet(p, d0, 7.0, 2.1, 0.0075) + wavelet(p, d1, 11.0, 2.9, 0.004)
               + wavelet(p, d2, 15.0, 3.4, 0.003) + wavelet(p, d3, 23.0, 4.3, 0.0015);
        g *= stir;
        // Rings where fish broke the surface.
        float ring = 0.0;
        for (int k = 0; k < ${RIPPLES}; k++) {
          vec4 r = uRipples[k];
          float age = uTime - r.z;
          if (age < 0.0 || age > 4.5) continue;
          vec2 dv = p - r.xy;
          float dist = length(dv) + 1e-4;
          float x = dist - age * 0.45;
          float env = exp(-x * x * 30.0) * r.w * exp(-age * 0.8) / (1.0 + dist * 1.5);
          g += dv / dist * cos(x * 38.0) * env * 0.9;
          ring += env * smoothstep(0.0, 0.05, -x + 0.05);
        }
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 V = normalize(cameraPosition - vWorld);
        float ndv = clamp(dot(n, V), 0.0, 1.0);
        float fres = 0.16 + 0.84 * pow(1.0 - ndv, 4.0);
        vec3 R = reflect(-V, n);
        // Sky, with the treeline round the clearing reflected near the far bank.
        vec3 refl = mix(uSkyLow, uSkyHigh, smoothstep(0.0, 0.8, R.y));
        vec2 rd = normalize(R.xz + 1e-5);
        float b = dot(p, rd);
        float t = -b + sqrt(max(b * b - dot(p, p) + 23.0 * 23.0, 0.0));
        vec2 hit = p + rd * t;
        float ang = atan(hit.y, hit.x);
        float crowns = 8.5 + 2.0 * sin(ang * 5.0 + 1.0) + 1.3 * sin(ang * 11.0 + 2.0) + 0.8 * sin(ang * 29.0) + 0.5 * sin(ang * 61.0 + 0.4);
        float elev = R.y / max(length(R.xz), 1e-3);
        float treeTop = crowns / max(t, 0.5);
        float tree = smoothstep(treeTop + 0.04, treeTop - 0.04, elev);
        refl = mix(refl, uTree * (0.85 + 0.25 * sin(ang * 47.0)), tree);
        // Body colour: clear shallows, deeper teal; lit softly by the ripples.
        float deep = smoothstep(0.02, 0.5, depth);
        vec3 body = mix(uShallow, uDeep, deep) * (0.92 + 0.12 * dot(n, uSunDir));
        float alpha = mix(0.2, 0.62, smoothstep(0.0, 0.45, depth));
        vec3 col = mix(body, refl, fres * 0.9);
        alpha = mix(alpha, 1.0, fres * 0.6);
        // Sun glints, livelier when the wind blows.
        float spec = pow(max(dot(R, uSunDir), 0.0), 260.0) * (0.5 + w) * 3.5;
        col += spec;
        // Soft foam lapping at the shore, and a pale bloom on fresh rings.
        float lap = sin(uTime * 0.8 + p.x * 1.7 + p.y * 1.3) * 0.008 + (wNoise(p * 5.0 + uTime * 0.15) - 0.5) * 0.02;
        float foam = (1.0 - smoothstep(0.0, 0.045, depth + lap)) * (0.6 + 0.4 * wNoise(p * 9.0 - uTime * 0.2));
        col = mix(col, uFoam, foam * 0.55 + min(ring, 1.0) * 0.25);
        alpha = max(alpha, foam * 0.6);
        alpha = min(1.0, alpha + spec);
        // Melt into the bank right at the waterline.
        alpha *= smoothstep(0.0, 0.012, depth);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}
