import * as THREE from 'three';
import { createRng, lerp } from '../core/random';

const MAX = 300;

/** Bright droplets thrown up where a fish breaks the water. Pooled points under gravity. */
export class Splash {
  readonly points: THREE.Points;
  private readonly pos = new Float32Array(MAX * 3);
  private readonly vel = new Float32Array(MAX * 3);
  private readonly life = new Float32Array(MAX);
  private readonly age = new Float32Array(MAX).fill(1e9);
  private readonly alpha = new Float32Array(MAX);
  private readonly size = new Float32Array(MAX);
  private readonly rng = createRng(17);
  private next = 0;

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color('#f2fbff') }, uScale: { value: 300 } },
      vertexShader: /* glsl */ `
        uniform float uScale;
        attribute float aAlpha, aSize;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = max(1.5, aSize * uScale / -mv.z);
          vAlpha = aAlpha;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(uColor, smoothstep(0.5, 0.2, d) * vAlpha);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
  }

  setPixelRatio(pr: number, viewportHeight: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = viewportHeight * pr * 0.9;
  }

  /** A crown of droplets at the water surface; `power` ~1 for a jumping fish. */
  burst(x: number, y: number, z: number, count: number, power: number) {
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const a = this.rng() * Math.PI * 2;
      const out = lerp(0.25, 0.8, this.rng()) * power;
      this.pos[i * 3] = x + Math.cos(a) * 0.05;
      this.pos[i * 3 + 1] = y + 0.02;
      this.pos[i * 3 + 2] = z + Math.sin(a) * 0.05;
      this.vel[i * 3] = Math.cos(a) * out;
      this.vel[i * 3 + 1] = lerp(0.9, 2.0, this.rng()) * power;
      this.vel[i * 3 + 2] = Math.sin(a) * out;
      this.age[i] = 0;
      this.life[i] = lerp(0.35, 0.65, this.rng());
      this.size[i] = lerp(0.025, 0.05, this.rng());
    }
  }

  update(dt: number) {
    let any = false;
    for (let i = 0; i < MAX; i++) {
      if (this.age[i] > this.life[i]) {
        if (this.alpha[i] !== 0) {
          this.alpha[i] = 0;
          any = true;
        }
        continue;
      }
      any = true;
      this.age[i] += dt;
      this.vel[i * 3 + 1] -= dt * 6.5;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = this.age[i] / this.life[i];
      this.alpha[i] = (1 - t * t) * 0.85;
    }
    if (any) {
      const g = this.points.geometry;
      g.attributes.position.needsUpdate = true;
      g.attributes.aAlpha.needsUpdate = true;
      g.attributes.aSize.needsUpdate = true;
    }
  }
}
