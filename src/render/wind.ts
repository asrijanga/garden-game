import * as THREE from 'three';
import { createRng } from '../core/random';

/**
 * The garden's air. A tileable noise field of gust patches drifts across the world with the
 * wind, and a slow global "breath" rises into gusts and settles back to calm. On top, a soft
 * wave rolls through the meadow in the wind's direction, so each plant leans a moment after
 * its upwind neighbour. Over minutes the wind slowly swings direction and drifts between
 * calmer and slightly breezier moods (never strong).
 *
 * The GPU (lawn, flowers, trees) and the CPU (smoke, sound; flags and chimes later) sample the
 * *same* field, so everything responds to the same gust at the same moment.
 */
const SIZE = 128;
const WORLD_SCALE = 1 / 56; // one tile of gust noise spans ~56 m
const GUST_SPEED = 3.2; // m/s that gust patches travel
const BASE_ANGLE = Math.atan2(0.5, 0.86);

export class WindField {
  readonly direction = new THREE.Vector2(Math.cos(BASE_ANGLE), Math.sin(BASE_ANGLE));
  /** 0 = dead calm, ~1 = a proper gust. Changes slowly over time. */
  envelope = 0.6;
  time = 0;
  readonly texture: THREE.DataTexture;
  private readonly data: Float32Array;
  /** How far the gust field has drifted (integrated, so turning the wind never makes it jump). */
  private readonly offset = new THREE.Vector2();

  constructor(seed: number) {
    this.data = buildGustNoise(seed);
    // 8-bit RGBA is linearly filterable on every iPhone (float textures aren't guaranteed).
    const rgba = new Uint8Array(SIZE * SIZE * 4);
    for (let i = 0; i < SIZE * SIZE; i++) rgba[i * 4] = Math.round(Math.min(1, this.data[i]) * 255);
    this.texture = new THREE.DataTexture(rgba, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping;
    this.texture.magFilter = this.texture.minFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
  }

  update(dt: number) {
    this.time += dt;
    const t = this.time;
    // The wind slowly swings back and forth over many minutes.
    const angle = BASE_ANGLE + 0.7 * Math.sin(t * 0.0045) + 0.35 * Math.sin(t * 0.0113 + 1.3);
    this.direction.set(Math.cos(angle), Math.sin(angle));
    this.offset.addScaledVector(this.direction, GUST_SPEED * dt);
    // A slow mood: some spells are calmer, some a little breezier. Never strong.
    const mood = 0.88 + 0.16 * Math.sin(t * 0.0151 + 0.4) + 0.08 * Math.sin(t * 0.037 + 2.1);
    // Layered slow waves: long calm spells, then a gust builds, peaks and fades.
    const breath = 0.5 + 0.28 * Math.sin(t * 0.13) + 0.17 * Math.sin(t * 0.31 + 1.7) + 0.08 * Math.sin(t * 0.71 + 4.1);
    this.envelope = Math.min(1, Math.max(0.12, breath * mood));
    uniforms.uWindTime.value = t;
    uniforms.uWindEnvelope.value = this.envelope;
    uniforms.uWindOffset.value.copy(this.offset);
  }

  /** Wind strength at a world position right now (0..~1.3). Matches the shader exactly. */
  sample(x: number, z: number): number {
    const u = (x - this.offset.x) * WORLD_SCALE;
    const v = (z - this.offset.y) * WORLD_SCALE;
    const g = this.lookup(u, v);
    const gust = smooth(0.35, 0.8, g);
    return this.envelope * (0.3 + 0.9 * gust);
  }

  private lookup(u: number, v: number): number {
    const x = (u - Math.floor(u)) * SIZE - 0.5;
    const y = (v - Math.floor(v)) * SIZE - 0.5;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const at = (i: number, j: number) => this.data[((j + SIZE) % SIZE) * SIZE + ((i + SIZE) % SIZE)];
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
    return a + (b - a) * fy;
  }
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function buildGustNoise(seed: number): Float32Array {
  const rng = createRng(seed);
  const out = new Float32Array(SIZE * SIZE);
  const octave = (cells: number, amp: number) => {
    const grid = Array.from({ length: cells * cells }, () => rng());
    const g = (i: number, j: number) => grid[(j % cells) * cells + (i % cells)];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const fx = (x / SIZE) * cells;
        const fy = (y / SIZE) * cells;
        const i = Math.floor(fx);
        const j = Math.floor(fy);
        let tx = fx - i;
        let ty = fy - j;
        tx = tx * tx * (3 - 2 * tx);
        ty = ty * ty * (3 - 2 * ty);
        const a = g(i, j) + (g(i + 1, j) - g(i, j)) * tx;
        const b = g(i, j + 1) + (g(i + 1, j + 1) - g(i, j + 1)) * tx;
        out[y * SIZE + x] += (a + (b - a) * ty) * amp;
      }
    }
  };
  octave(4, 0.6);
  octave(9, 0.3);
  octave(19, 0.1);
  return out;
}

export const uniforms = {
  uWindTex: { value: null as THREE.Texture | null },
  uWindTime: { value: 0 },
  uWindEnvelope: { value: 0.6 },
  uWindDir: { value: new THREE.Vector2(0.86, 0.5).normalize() },
  uWindOffset: { value: new THREE.Vector2() },
};

export function bindWind(field: WindField) {
  uniforms.uWindTex.value = field.texture;
  uniforms.uWindDir.value = field.direction;
}

const windCoreGLSL = /* glsl */ `
uniform sampler2D uWindTex;
uniform float uWindTime;
uniform float uWindEnvelope;
uniform vec2 uWindDir;
uniform vec2 uWindOffset;

/** Gust strength at p, as it was \`lag\` seconds ago. */
float windAt(vec2 p, float lag) {
  vec2 uv = (p - uWindOffset + uWindDir * ${GUST_SPEED.toFixed(2)} * lag) * ${WORLD_SCALE.toFixed(6)};
  float g = smoothstep(0.35, 0.8, texture2D(uWindTex, uv).r);
  return uWindEnvelope * (0.3 + 0.9 * g);
}
`;

/** Just the wind sampler (no varyings), for use in fragment shaders such as the lawn. */
export const windSampleGLSL = windCoreGLSL;

export const windGLSL = /* glsl */ `
${windCoreGLSL}
varying float vWindAmt;

/** Offset for a point h (0..1) of the way up a plant plantHeight tall, rooted at root. */
vec3 gardenWind(vec3 root, float h, float plantHeight) {
  float w = windAt(root.xz, 0.0);
  // A little spring: the plant lags behind the gust and settles back softly as it passes.
  float wLag = windAt(root.xz, 0.9);
  float push = w * 1.1 - wLag * 0.2;
  // A gentle wave rolling through the meadow: each plant leans a moment after its upwind
  // neighbour (wavelength ~7 m, travelling ~2.2 m/s).
  float along = dot(root.xz, uWindDir);
  float wave = 0.5 + 0.5 * sin(along * 0.9 - uWindTime * 2.0);
  push += wave * wave * 0.35 * uWindEnvelope;
  // A soft, slow flutter that grows a little with the wind; never jittery.
  float phase = root.x * 1.7 + root.z * 2.3;
  float flutter = (sin(uWindTime * 1.6 + phase) * 0.65 + sin(uWindTime * 2.5 + phase * 1.9) * 0.35) * 0.05 * (0.25 + w);
  float bend = (push * 0.34 + flutter) * h * h * plantHeight;
  vWindAmt = w;
  return vec3(uWindDir.x * bend, -abs(bend) * 0.3, uWindDir.y * bend);
}
`;

/**
 * Patches a built-in instanced material so vertices bend in the wind.
 * `heightExpr` is a GLSL expression for the 0..1 height of the current vertex.
 */
export function addWind(
  material: THREE.Material,
  heightExpr: string,
  extra?: (s: THREE.WebGLProgramParametersWithUniforms) => void,
  heightScale = 1,
) {
  const plantHeight = `(length(instanceMatrix[1].xyz) * ${heightScale.toFixed(3)})`;
  // Distinct cache key: three.js would otherwise share programs between patched materials.
  const key = `wind:${heightExpr}:${heightScale}:${extra ? extra.toString().length : 0}:${material.type}`;
  material.customProgramCacheKey = () => key;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${windGLSL}`)
      .replace(
        '#include <project_vertex>',
        /* glsl */ `
        vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
        mvPosition.xyz += gardenWind(instanceMatrix[3].xyz, ${heightExpr}, ${plantHeight});
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;
        `,
      )
      .replace(
        '#include <worldpos_vertex>',
        /* glsl */ `
        vec4 worldPosition = instanceMatrix * vec4(transformed, 1.0);
        worldPosition.xyz += gardenWind(instanceMatrix[3].xyz, ${heightExpr}, ${plantHeight});
        worldPosition = modelMatrix * worldPosition;
        `,
      );
    extra?.(shader);
  };
}
