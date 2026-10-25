import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * Tilt-shift blur: sharp in a horizontal band around `uFocus`, blurring smoothly above and
 * below. This is what makes the garden read as a tiny handcrafted diorama.
 */
const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uDir: { value: new THREE.Vector2(1, 0) },
    uFocus: { value: 0.45 },
    uBand: { value: 0.12 },
    uAmount: { value: 3.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uDir;
    uniform float uFocus, uBand, uAmount;
    varying vec2 vUv;
    void main() {
      float d = abs(vUv.y - uFocus);
      float blur = smoothstep(uBand, uBand + 0.35, d) * uAmount;
      vec2 step = uDir * blur;
      vec4 sum = texture2D(tDiffuse, vUv) * 0.2270270270;
      sum += texture2D(tDiffuse, vUv + step * 1.3846153846) * 0.3162162162;
      sum += texture2D(tDiffuse, vUv - step * 1.3846153846) * 0.3162162162;
      sum += texture2D(tDiffuse, vUv + step * 3.2307692308) * 0.0702702703;
      sum += texture2D(tDiffuse, vUv - step * 3.2307692308) * 0.0702702703;
      gl_FragColor = sum;
    }`,
};

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
  vertexShader: TiltShiftShader.vertexShader,
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
  private readonly tiltH: ShaderPass;
  private readonly tiltV: ShaderPass;
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

    this.tiltH = new ShaderPass(TiltShiftShader);
    this.tiltV = new ShaderPass(TiltShiftShader);
    this.tiltV.uniforms.uDir.value = new THREE.Vector2(0, 1);
    this.composer.addPass(this.tiltH);
    this.composer.addPass(this.tiltV);

    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  setSize(width: number, height: number, pixelRatio: number) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    const w = width * pixelRatio;
    const h = height * pixelRatio;
    // Blur radius scales with the shorter side so it looks the same on every phone.
    const px = Math.min(w, h) / 390;
    this.tiltH.uniforms.uDir.value.set((1.6 * px) / w, 0);
    this.tiltV.uniforms.uDir.value.set(0, (1.6 * px) / h);
    this.grade.uniforms.uAspect.value = width / height;
  }

  /** Vertical screen position (0 = bottom, 1 = top) that stays in sharp focus. */
  setFocus(y: number) {
    this.tiltH.uniforms.uFocus.value = y;
    this.tiltV.uniforms.uFocus.value = y;
  }

  render(delta: number) {
    this.composer.render(delta);
  }
}
