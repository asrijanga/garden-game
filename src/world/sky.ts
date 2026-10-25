import * as THREE from 'three';

/**
 * Storybook backdrop. Because the diorama camera looks down at the garden, the "sky" is
 * really the soft air around it, so it's painted in screen space: cool blue-lilac above,
 * a warm sunlit glow behind the island, and dusty rose below. Always well composed.
 */
export function createBackdrop(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color('#86a9d6') },
      uMid: { value: new THREE.Color('#f4dcbc') },
      uBottom: { value: new THREE.Color('#e7b597') },
      uGlow: { value: new THREE.Color('#fff0cf') },
      uGlowPos: { value: new THREE.Vector2(0.28, 0.72) },
      uAspect: { value: 0.5 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = position.xy * 0.5 + 0.5;
        gl_Position = vec4(position.xy, 1.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uBottom, uGlow;
      uniform vec2 uGlowPos;
      uniform float uAspect, uTime;
      varying vec2 vUv;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
        return v;
      }

      void main() {
        float y = vUv.y;
        vec3 col = mix(uBottom, uMid, smoothstep(0.0, 0.55, y));
        col = mix(col, uTop, smoothstep(0.45, 0.98, y));

        // Warm sun glow, as if the light is pouring in from the upper left.
        vec2 g = (vUv - uGlowPos) * vec2(uAspect, 1.0);
        float glow = exp(-dot(g, g) * 14.0);
        col = mix(col, uGlow, glow * 0.8);

        // Soft painterly cloud wisps drifting through the upper air.
        vec2 cp = vec2(vUv.x * uAspect * 2.2 + uTime * 0.006, vUv.y * 5.0);
        float c = smoothstep(0.5, 0.82, fbm(cp));
        col = mix(col, vec3(1.0, 0.97, 0.92), c * smoothstep(0.55, 0.85, y) * 0.35);

        // A whisper of paper grain so the gradient never bands.
        col += (hash(gl_FragCoord.xy) - 0.5) * 0.012;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}
