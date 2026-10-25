import * as THREE from 'three';
import { createRng } from '../core/random';

/** Glowing pollen and dust drifting through the warm light. Cheap, but adds a lot of life. */
export function createMotes(count: number, seed: number): THREE.Points {
  const rng = createRng(seed);
  const pos = new Float32Array(count * 3);
  const rnd = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 17;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = 0.3 + rng() * 4.5;
    pos[i * 3 + 2] = Math.sin(a) * r;
    rnd[i] = rng();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uColor: { value: new THREE.Color('#ffd89a') },
    },
    vertexShader: /* glsl */ `
      uniform float uTime, uPixelRatio;
      attribute float aRnd;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float t = uTime * (0.15 + aRnd * 0.2) + aRnd * 40.0;
        p.x += sin(t) * 0.8 + uTime * 0.12;
        p.z += cos(t * 0.8) * 0.8 + uTime * 0.07;
        p.y += sin(t * 1.3) * 0.4;
        // Wrap drifting motes back over the island.
        p.xz = mod(p.xz + 17.0, 34.0) - 17.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (2.0 + aRnd * 2.5) * uPixelRatio * (40.0 / -mv.z);
        float twinkle = 0.5 + 0.5 * sin(uTime * (1.0 + aRnd * 2.0) + aRnd * 20.0);
        float edge = 1.0 - smoothstep(14.0, 17.0, length(p.xz));
        vAlpha = (0.25 + 0.75 * twinkle) * edge;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(uColor * 1.6, a * a * vAlpha * 0.8);
      }`,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  return points;
}
