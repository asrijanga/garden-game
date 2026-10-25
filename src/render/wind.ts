import * as THREE from 'three';

/**
 * Shared wind state. Every swaying thing (grass, flowers, later trees) reads these
 * same uniforms, so a gust visibly rolls across the whole meadow at once.
 */
export const windUniforms = {
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(0.86, 0.5).normalize() },
  uWindStrength: { value: 1 },
};

/**
 * GLSL helper. `p` is an instanced vertex in the mesh's space (the vegetation meshes sit
 * at the world origin, so that is world space). `h` is the 0..1 height along the plant.
 */
export const windGLSL = /* glsl */ `
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;

vec3 gardenWind(vec3 root, float h, float plantHeight) {
  float along = dot(root.xz, uWindDir);
  // Big, slow gust fronts that roll across the island.
  float gust = 0.5 + 0.5 * sin(uTime * 0.85 - along * 0.32);
  gust = gust * gust * gust;
  // Gentle constant sway plus a per-plant flutter.
  float sway = sin(uTime * 1.9 - along * 0.8 + root.z * 0.6) * 0.25 + 0.35 + gust * 0.9;
  float flutter = sin(uTime * 6.5 + root.x * 13.1 + root.z * 7.7) * 0.07 * (0.4 + gust);
  float bend = (sway * uWindStrength + flutter) * h * h * plantHeight * 0.55;
  return vec3(uWindDir.x * bend, -abs(bend) * 0.3, uWindDir.y * bend);
}
`;

/**
 * Patches a built-in material so instanced vertices bend in the wind.
 * `heightExpr` is a GLSL expression giving the 0..1 height of the current vertex.
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
    Object.assign(shader.uniforms, windUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${windGLSL}`)
      .replace(
        '#include <project_vertex>',
        /* glsl */ `
        vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
        vec3 plantRoot = instanceMatrix[3].xyz;
        mvPosition.xyz += gardenWind(plantRoot, ${heightExpr}, ${plantHeight});
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
