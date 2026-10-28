import * as THREE from 'three';
import { createNoise2D } from '../core/noise';
import { createRng, smoothstep } from '../core/random';
import { uniforms as windUniforms, windSampleGLSL } from '../render/wind';
import { rainRingsGLSL, wetUniforms } from '../render/wet';
import { paintUvGLSL } from './groundPaint';
import { pondUvGLSL, POND_WATERLINE_RANGE } from './pond';
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
  /** The same lawn, for the finer meshes dug into ponds. */
  readonly basinMaterial: THREE.MeshLambertMaterial;

  constructor(
    seed: number,
    palette: SeasonPalette,
    private readonly paint: THREE.Texture,
    private readonly pond: THREE.Texture,
  ) {
    this.hNoise = createNoise2D(seed);
    this.edgeNoise = createNoise2D(seed + 1);
    this.colorNoise = createNoise2D(seed + 2);
    this.meadow = palette.meadow.map((c) => new THREE.Color(c));
    this.floor = new THREE.Color(palette.forestFloor);
    this.mesh = this.buildMesh();
    this.basinMaterial = lawnMaterial(paint, pond, true);
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
    // Broad, gentle drifts of colour only: painterly, never blotchy.
    const a = this.colorNoise(x * 0.045, z * 0.045) * 0.5 + 0.5;
    const b = this.colorNoise(x * 0.08 + 30, z * 0.08) * 0.5 + 0.5;
    out.copy(this.meadow[0]).lerp(this.meadow[1], smoothstep(0.2, 0.8, a));
    return out.lerp(this.meadow[2], smoothstep(0.55, 1.0, b) * 0.3);
  }

  /** The lawn's base colour at (x, z) (meadow fading into forest floor); returns how meadowy it is. */
  vertexColor(x: number, z: number, out: THREE.Color): number {
    const f = this.forestness(x, z);
    this.meadowColor(x, z, out);
    // Forest floor is darker and leaf-littered, with a soft shaded fringe at the treeline.
    const shade = this.floor.clone().multiplyScalar(0.75 + this.colorNoise(x * 0.3, z * 0.3) * 0.15);
    out.lerp(shade, f);
    return 1 - f;
  }

  private buildMesh(): THREE.Mesh {
    const segs = 220;
    const geo = new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const meadowMask = new Float32Array(pos.count);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.heightAt(x, z));
      meadowMask[i] = this.vertexColor(x, z, c);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aMeadow', new THREE.BufferAttribute(meadowMask, 1));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, lawnMaterial(this.paint, this.pond, false));
    mesh.receiveShadow = true;
    return mesh;
  }
}

const lawnNoiseGLSL = /* glsl */ `
float lawnHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lawnNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lawnHash(i), lawnHash(i + vec2(1.0, 0.0)), f.x), mix(lawnHash(i + vec2(0.0, 1.0)), lawnHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

/** Rounded pebbles of mixed size and tone, half sunk in silt (Voronoi cells ~15 cm across). */
const pebblesGLSL = /* glsl */ `
vec3 pebbles(vec2 p) {
  p = vec2(p.x * 0.8 - p.y * 0.6, p.x * 0.6 + p.y * 0.8) * 6.5;
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  vec2 id = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = vec2(lawnHash(i + g), lawnHash(i + g + 17.3)) * 0.9 + 0.05;
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; id = i + g; } else if (d < d2) { d2 = d; }
    }
  }
  float tone = lawnHash(id + 3.1);
  vec3 silt = vec3(0.3, 0.27, 0.19);
  vec3 col = mix(vec3(0.38, 0.36, 0.31), vec3(0.56, 0.51, 0.43), tone);
  col = mix(col, vec3(0.42, 0.35, 0.26), step(0.72, lawnHash(id + 9.7)));
  col *= 0.85 + 0.2 * (1.0 - d1); // domed
  // Some cells are just silt, so the pebbles lie scattered rather than paved.
  col = mix(silt, col, step(0.35, lawnHash(id + 5.9)));
  return mix(silt * 0.7, col, smoothstep(0.0, 0.14, d2 - d1));
}
`;

/**
 * The lawn is painted, not modelled: a soft, fine grain (mip-mapped, so it melts into smooth
 * colour from afar and never shimmers) plus a gentle sheen where gusts roll across the meadow,
 * driven by the same wind field as everything else.
 */
let sharedGrain: THREE.DataTexture | null = null;

/**
 * `basin`: the variant for meshes dug into ponds. The main lawn steps down out of sight round
 * ponds (its vertices are a metre apart, far too coarse to dig into) and the basin takes over;
 * it is drawn a hair nearer the camera so the two never flicker where they overlap.
 */
function lawnMaterial(paint: THREE.Texture, pond: THREE.Texture, basin: boolean): THREE.MeshLambertMaterial {
  const grain = (sharedGrain ??= grainTexture(256, 1234));
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  if (basin) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -4;
  }
  mat.customProgramCacheKey = () => (basin ? 'lawn-basin' : 'lawn');
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, windUniforms, wetUniforms, { uGrain: { value: grain }, uPaint: { value: paint }, uPond: { value: pond } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aMeadow;\nvarying float vMeadow;\nvarying vec3 vWorld;\nuniform sampler2D uPond;\n${pondUvGLSL}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        ${basin ? '' : 'transformed.y -= step(0.004, texture2D(uPond, pondUv(transformed.xz)).g) * 2.5;'}
        vMeadow = aMeadow;
        vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D uGrain;\nuniform sampler2D uPaint;\nuniform sampler2D uPond;\nvarying float vMeadow;\nvarying vec3 vWorld;\n${windSampleGLSL}\n${paintUvGLSL}\n${pondUvGLSL}\n${lawnNoiseGLSL}\n${pebblesGLSL}\n${rainRingsGLSL}\nuniform float uWet, uRainNow, uCloud, uWetTime;\nuniform vec3 uWetSky;\nuniform vec2 uCloudDrift;`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        // Two scales of fine grain so the pattern never visibly repeats.
        float grain = texture2D(uGrain, vWorld.xz * 0.55).r * 0.6 + texture2D(uGrain, vWorld.xz * 0.13 + 0.37).r * 0.4;
        diffuseColor.rgb *= mix(1.0, 0.88 + grain * 0.24, vMeadow);
        // Worn earth under paths, with a ragged, organic edge and a lusher rim of grass.
        vec4 paintTex = texture2D(uPaint, paintUv(vWorld.xz));
        float wear = paintTex.r;
        float sandy = clamp(paintTex.g / max(paintTex.r, 0.02), 0.0, 1.0);
        // Ragged edge: three octaves of noise nibble the boundary into tufts and bare bites.
        float rough = lawnNoise(vWorld.xz * 0.9 + 2.1) * 0.35 + lawnNoise(vWorld.xz * 2.2) * 0.3 + lawnNoise(vWorld.xz * 5.5 + 7.3) * 0.22 + lawnNoise(vWorld.xz * 13.0 - 3.1) * 0.13;
        float ragged = (rough - 0.5) * 0.3;
        float edgeField = wear + ragged;
        float earth = smoothstep(0.4, 0.5, edgeField);
        // Trodden, slightly damp soil where the earth meets the turf.
        float lip = earth * (1.0 - smoothstep(0.5, 0.66, edgeField));
        float rim = smoothstep(0.1, 0.38, wear) * (1.0 - earth);
        diffuseColor.rgb *= 1.0 - rim * 0.12;
        vec3 soil = mix(vec3(0.24, 0.16, 0.09), vec3(0.34, 0.24, 0.14), grain);
        // Gravel: pale grit speckled with darker and lighter pebbles.
        float speck = lawnNoise(vWorld.xz * 38.0);
        vec3 gravel = mix(vec3(0.3, 0.28, 0.24), vec3(0.42, 0.39, 0.33), grain);
        gravel *= 1.0 - smoothstep(0.72, 0.9, speck) * 0.3 + smoothstep(0.25, 0.08, speck) * 0.15;
        soil = mix(soil, gravel, sandy);
        soil *= 1.0 - lip * 0.2;
        // Flower beds: rich, dark, crumbly soil with a soft hand-dug edge.
        float bedField = paintTex.b + ragged * 1.2;
        float bed = smoothstep(0.32, 0.46, bedField) * (1.0 - earth);
        vec3 bedSoil = vec3(0.0);
        if (bed > 0.0) {
          vec2 mp = vWorld.xz;
          // Cedar bark mulch: warm red-brown shreds, lighter chips, fine dark crumbs between.
          // Red-brown sits opposite the greens, so leaves and blooms glow against it.
          vec2 mr = vec2(mp.x * 0.8 - mp.y * 0.6, mp.x * 0.6 + mp.y * 0.8); // rotated, so chips don't line up
          float shreds = lawnNoise(vec2(mr.x * 34.0, mr.y * 11.0));
          float chips = lawnNoise(mp * 16.0 + 5.3) * 0.65 + lawnNoise(mp * 41.0 - 2.7) * 0.35;
          float crumb = lawnNoise(mp * 90.0);
          bedSoil = mix(vec3(0.115, 0.042, 0.02), vec3(0.2, 0.08, 0.036), shreds);
          bedSoil = mix(bedSoil, vec3(0.32, 0.15, 0.07), smoothstep(0.66, 0.74, chips)); // lighter bark chips
          bedSoil *= 0.8 + crumb * 0.35;
          bedSoil *= 1.0 - (1.0 - smoothstep(0.46, 0.62, bedField)) * 0.2; // tucked-in edge
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, soil, earth);
        diffuseColor.rgb = mix(diffuseColor.rgb, bedSoil, bed);
        // Ponds: damp, darker grass running down the banks, a narrow band of wet mud at the
        // waterline, pebbles in the shallows and dark silt in the deep.
        vec3 pondTex = texture2D(uPond, pondUv(vWorld.xz)).rgb;
        float mud = 0.0;
        if (pondTex.g > 0.0) {
          float aboveWater = (pondTex.b - 0.5) * ${(POND_WATERLINE_RANGE * 2).toFixed(2)};
          float dug = step(0.002, pondTex.r);
          diffuseColor.rgb *= 1.0 - pondTex.g * 0.14;
          mud = smoothstep(0.1, 0.045, aboveWater + ragged * 0.12) * dug;
          vec3 bank = mix(vec3(0.2, 0.15, 0.09), vec3(0.27, 0.21, 0.13), grain);
          bank = mix(bank, vec3(0.2, 0.25, 0.1), smoothstep(0.55, 0.75, lawnNoise(vWorld.xz * 2.7 + 4.0)) * 0.6); // moss
          vec3 floorCol = mix(bank, pebbles(vWorld.xz), smoothstep(0.02, -0.03, aboveWater));
          floorCol = mix(floorCol, vec3(0.15, 0.14, 0.085) * (0.85 + grain * 0.3), smoothstep(-0.2, -0.38, aboveWater));
          diffuseColor.rgb = mix(diffuseColor.rgb, floorCol, mud);
        }
        // Gust sheen: the meadow brightens softly as wind passes, like grass bowing in waves.
        float gust = windAt(vWorld.xz, 0.0);
        diffuseColor.rgb *= 1.0 + smoothstep(0.45, 1.1, gust) * 0.085 * vMeadow * (1.0 - earth) * (1.0 - bed) * (1.0 - mud);
        // Weather: rain soaks the soil dark (and the grass a little), pools in the dips of
        // paths, and rings the puddles; drifting cloud shadows dim the lawn in slow patches.
        float puddle = 0.0;
        if (uWet > 0.001) {
          diffuseColor.rgb *= 1.0 - uWet * (0.1 + 0.32 * max(earth, bed));
          float dip = lawnNoise(vWorld.xz * 0.75 + 11.0) * 0.7 + lawnNoise(vWorld.xz * 2.3 - 4.0) * 0.3;
          puddle = smoothstep(0.66, 0.7, dip + uWet * 0.12 - 0.12 + ragged * 0.2) * earth * uWet;
          diffuseColor.rgb *= 1.0 - puddle * 0.6;
        }
        if (uCloud > 0.001) {
          vec2 cp = vWorld.xz * 0.075 + uCloudDrift;
          float cloud = lawnNoise(cp) * 0.65 + lawnNoise(cp * 2.3 + 3.0) * 0.35;
          float shade = smoothstep(0.4, 0.6, cloud);
          // Under a cloud the lawn dims; in the gaps between, the sun feels brighter still.
          diffuseColor.rgb *= 1.0 + (0.1 - shade * 0.55) * uCloud;
        }`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `if (puddle > 0.001) {
          // Puddles mirror the sky, and rings spread where raindrops land.
          float rings = rainRings(vWorld.xz, uWetTime) * uRainNow;
          outgoingLight = mix(outgoingLight, uWetSky * (0.5 + rings * 0.5), puddle * 0.55);
        }
        #include <opaque_fragment>`,
      );
  };
  return mat;
}

/** Tileable fine noise, greyscale, with mipmaps so it averages out smoothly at distance. */
function grainTexture(size: number, seed: number): THREE.DataTexture {
  const rng = createRng(seed);
  const data = new Uint8Array(size * size * 4);
  const octave = (cells: number, amp: number, acc: Float32Array) => {
    const grid = Array.from({ length: cells * cells }, () => rng());
    const g = (i: number, j: number) => grid[(j % cells) * cells + (i % cells)];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells;
        const fy = (y / size) * cells;
        const i = Math.floor(fx);
        const j = Math.floor(fy);
        const tx = fx - i;
        const ty = fy - j;
        const a = g(i, j) + (g(i + 1, j) - g(i, j)) * tx;
        const b = g(i, j + 1) + (g(i + 1, j + 1) - g(i, j + 1)) * tx;
        acc[y * size + x] += (a + (b - a) * ty) * amp;
      }
    }
  };
  const acc = new Float32Array(size * size);
  octave(16, 0.25, acc);
  octave(64, 0.35, acc);
  octave(128, 0.4, acc);
  for (let i = 0; i < size * size; i++) {
    const v = Math.round(Math.min(1, acc[i]) * 255);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}
