import * as THREE from 'three';
import { regrow } from '../core/regrow';
import { touch } from './touch';

/** The garden's moss clock (seconds), shared by everything that grows moss. */
export const mossUniforms = { uMossTime: { value: 0 } };

export interface MossOptions {
  /** Seconds for moss to creep in after a stone is laid. */
  time: number;
  /** How much of the stone it may cover at most (0 … 1). */
  amount: number;
  /**
   * Stepping stones are walked on: their moss keeps to the rims and the cracks, the worn tops
   * stay bare. Otherwise it settles on the faces that look up at the sky (wall tops, edging).
   */
  trodden: boolean;
}

/**
 * Lets an instanced stone material grow moss slowly, as the boulders do: soft cushions in
 * patches (from the stone's place in the world, so no two stones match), creeping in over a few
 * minutes after each stone is laid. Each mesh needs a per-instance start time: see `mossStart`.
 * Chains onto any shader patch the material already has.
 */
export function addMoss(mat: THREE.MeshLambertMaterial, o: MossOptions) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${prevKey()}|moss${o.trodden ? 't' : 'u'}${o.amount}`;
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    Object.assign(shader.uniforms, mossUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMossStart;\nuniform float uMossTime;\nvarying float vMoss;\nvarying vec3 vMossPos;\nvarying vec3 vMossUp;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        vMoss = smoothstep(0.0, ${o.time.toFixed(1)}, uMossTime - aMossStart);
        vMossPos = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
        vMossUp = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying float vMoss;
        varying vec3 vMossPos;
        varying vec3 vMossUp;
        float mossHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float mossNoise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(mossHash(i), mossHash(i + vec3(1, 0, 0)), f.x), mix(mossHash(i + vec3(0, 1, 0)), mossHash(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(mossHash(i + vec3(0, 0, 1)), mossHash(i + vec3(1, 0, 1)), f.x), mix(mossHash(i + vec3(0, 1, 1)), mossHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        {
          vec3 p = vMossPos * 7.0;
          float patches = mossNoise(p) * 0.7 + mossNoise(p * 2.6) * 0.3;
          float up = smoothstep(0.25, 0.75, vMossUp.y);
          ${
            o.trodden
              ? // The rim and the sides (and low down, where it's damp), never the worn middle.
                'float where = (1.0 - smoothstep(0.82, 0.97, vMossUp.y)) * smoothstep(-0.2, 0.4, vMossUp.y);'
              : 'float where = up;'
          }
          float moss = smoothstep(1.05 - vMoss * 0.45, 1.17 - vMoss * 0.45, patches * 0.7 + where * 0.45) * where;
          vec3 mossCol = mix(vec3(0.16, 0.22, 0.08), vec3(0.28, 0.35, 0.13), mossNoise(p * 2.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, mossCol, moss * ${(0.85 * o.amount).toFixed(3)});
        }`,
      );
  };
}

/** A per-instance moss start time, for a mesh whose material grows moss. */
export function mossAttribute(geo: THREE.BufferGeometry, capacity: number) {
  geo.setAttribute('aMossStart', new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(1e9), 1));
}

/**
 * Starts the moss on one stone: from about now (plus `delay` and a little more, so neighbours
 * differ); a stone rebuilt from a save is an old friend, already mossy.
 */
export function mossStart(mesh: THREE.InstancedMesh, index: number, delay: number, jitter: number) {
  const a = mesh.geometry.attributes.aMossStart as THREE.InstancedBufferAttribute | undefined;
  if (!a) return;
  a.setX(index, regrow.offset > 0 || regrow.instant ? -1e4 : mossUniforms.uMossTime.value + delay + jitter);
  touch(a, index);
}
