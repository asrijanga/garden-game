import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** Final storybook grade in display space: warm lift, gentle saturation, soft vignette. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uLift: { value: new THREE.Color('#2a1a10') },
    uGain: { value: new THREE.Color('#fff4e6') },
    uSaturation: { value: 1.08 },
    uVignette: { value: 0.22 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uLift, uGain;
    uniform float uSaturation, uVignette, uAspect;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // Lift shadows toward a warm brown so darks never go dead black.
      c = uLift * 0.35 + c * (uGain - uLift * 0.35);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, uSaturation);
      vec2 v = (vUv - 0.5) * vec2(uAspect, 1.0);
      float vig = smoothstep(0.95, 0.25, length(v) * 1.1);
      c *= mix(1.0 - uVignette, 1.0, vig);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class PostFX {
  readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly grade: ShaderPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.35, 0.7, 0.92);
    this.composer.addPass(this.bloom);

    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  setSize(width: number, height: number, pixelRatio: number) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.grade.uniforms.uAspect.value = width / height;
  }

  render(delta: number) {
    this.composer.render(delta);
  }
}
