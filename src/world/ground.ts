import * as THREE from 'three';
import { createNoise2D } from '../core/noise';
import { createRng, smoothstep } from '../core/random';
import { uniforms as windUniforms, windSampleGLSL } from '../render/wind';
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
    // Broad, gentle drifts of colour only: painterly, never blotchy.
    const a = this.colorNoise(x * 0.045, z * 0.045) * 0.5 + 0.5;
    const b = this.colorNoise(x * 0.08 + 30, z * 0.08) * 0.5 + 0.5;
    out.copy(this.meadow[0]).lerp(this.meadow[1], smoothstep(0.2, 0.8, a));
    return out.lerp(this.meadow[2], smoothstep(0.55, 1.0, b) * 0.3);
  }

  private buildMesh(): THREE.Mesh {
    const segs = 220;
    const geo = new THREE.PlaneGeometry(WORLD_HALF * 2, WORLD_HALF * 2, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const meadowMask = new Float32Array(pos.count);
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
      meadowMask[i] = 1 - f;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aMeadow', new THREE.BufferAttribute(meadowMask, 1));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, lawnMaterial());
    mesh.receiveShadow = true;
    return mesh;
  }
}

/**
 * The lawn is painted, not modelled: a soft, fine grain (mip-mapped, so it melts into smooth
 * colour from afar and never shimmers) plus a gentle sheen where gusts roll across the meadow,
 * driven by the same wind field as everything else.
 */
function lawnMaterial(): THREE.MeshLambertMaterial {
  const grain = grainTexture(256, 1234);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.customProgramCacheKey = () => 'lawn';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, windUniforms, { uGrain: { value: grain } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMeadow;\nvarying float vMeadow;\nvarying vec3 vWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMeadow = aMeadow;\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D uGrain;\nvarying float vMeadow;\nvarying vec3 vWorld;\n${windSampleGLSL}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        // Two scales of fine grain so the pattern never visibly repeats.
        float grain = texture2D(uGrain, vWorld.xz * 0.55).r * 0.6 + texture2D(uGrain, vWorld.xz * 0.13 + 0.37).r * 0.4;
        diffuseColor.rgb *= mix(1.0, 0.88 + grain * 0.24, vMeadow);
        // Gust sheen: the meadow brightens softly as wind passes, like grass bowing in waves.
        float gust = windAt(vWorld.xz, 0.0);
        diffuseColor.rgb *= 1.0 + smoothstep(0.45, 1.1, gust) * 0.085 * vMeadow;`,
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
