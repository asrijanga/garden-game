import * as THREE from 'three';

/**
 * The weather's mark on surfaces, shared by every material that cares: how wet things are,
 * how hard it's raining (rings in puddles), and the drifting shadows of clouds on the lawn.
 */
export const wetUniforms = {
  /** 0 dry … 1 soaked (rises in the rain, dries slowly after). */
  uWet: { value: 0 },
  /** 0 … 1: rain falling now (raindrop rings). */
  uRainNow: { value: 0 },
  /** The sun's direction in view space, for the sheen on wet stone. */
  uWetSun: { value: new THREE.Vector3(0, 1, 0) },
  /** The sky colour that wet surfaces and puddles mirror. */
  uWetSky: { value: new THREE.Color('#9fb4c8') },
  /** 0 … 1: how much cloud shadow drifts over the lawn, and how far it's drifted. */
  uCloud: { value: 0 },
  uCloudDrift: { value: new THREE.Vector2() },
  uWetTime: { value: 0 },
};

/** Raindrop rings: expanding circles in hashed cells; returns their brightness at `p` (metres). */
export const rainRingsGLSL = /* glsl */ `
float rainRings(vec2 p, float t) {
  float s = 0.0;
  for (int k = 0; k < 2; k++) {
    vec2 q = p * 3.4 + float(k) * vec2(0.37, 0.61);
    vec2 cell = floor(q);
    float h = fract(sin(dot(cell, vec2(127.1, 311.7)) + float(k) * 13.0) * 43758.5453);
    vec2 c = cell + 0.3 + 0.4 * vec2(fract(h * 7.1), fract(h * 13.3));
    float a = fract(t * 0.9 + h);
    float x = length(q - c) - a * 0.3;
    s += exp(-x * x * 900.0) * (1.0 - a);
  }
  return s;
}`;

/**
 * Lets a Lambert material get wet: darker, a touch richer, with a soft sheen of sky and a glint
 * where the sun catches it. Chains onto any shader patch the material already has.
 */
export function addWet(mat: THREE.MeshLambertMaterial, strength = 1) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${prevKey()}|wet${strength}`;
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    Object.assign(shader.uniforms, wetUniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWet;\nuniform vec3 uWetSun;\nuniform vec3 uWetSky;')
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `if (uWet > 0.001) {
          float wet = uWet * ${strength.toFixed(2)};
          vec3 wv = normalize(vViewPosition);
          vec3 wn = normalize(normal);
          float up = max(wn.y, 0.0);
          // Soaked stone goes dark and rich, and its tops mirror the sky and the sun.
          outgoingLight *= 1.0 - wet * 0.32;
          float fres = pow(1.0 - max(dot(wn, wv), 0.0), 3.0);
          float glint = pow(max(dot(wn, normalize(uWetSun + wv)), 0.0), 80.0);
          outgoingLight += (uWetSky * (0.05 + fres * 0.1) * (0.5 + up * 0.5) + vec3(glint * 0.3)) * wet;
        }
        #include <opaque_fragment>`,
      );
  };
}
