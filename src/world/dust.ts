import * as THREE from 'three';
import { createRng, lerp } from '../core/random';

const MAX = 400;

/** Soft puffs of dust and soil kicked up when things land or are dug in. Pooled points. */
export class Dust {
  readonly points: THREE.Points;
  private readonly pos = new Float32Array(MAX * 3);
  private readonly vel = new Float32Array(MAX * 3);
  private readonly life = new Float32Array(MAX);
  private readonly age = new Float32Array(MAX).fill(1e9);
  private readonly alpha = new Float32Array(MAX);
  private readonly size = new Float32Array(MAX);
  private readonly rng = createRng(5);
  private next = 0;

  constructor(color = '#d8c3a0') {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color(color) }, uScale: { value: 300 } },
      vertexShader: /* glsl */ `
        uniform float uScale;
        attribute float aAlpha, aSize;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uScale / -mv.z;
          vAlpha = aAlpha;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(uColor, smoothstep(0.5, 0.05, d) * vAlpha);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  setPixelRatio(pr: number, viewportHeight: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = viewportHeight * pr * 0.9;
  }

  puff(at: THREE.Vector3, count: number, spread: number) {
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const a = this.rng() * Math.PI * 2;
      const sp = lerp(0.3, 1.0, this.rng()) * spread;
      this.pos[i * 3] = at.x + Math.cos(a) * spread * 0.3;
      this.pos[i * 3 + 1] = at.y + 0.05;
      this.pos[i * 3 + 2] = at.z + Math.sin(a) * spread * 0.3;
      this.vel[i * 3] = Math.cos(a) * sp;
      this.vel[i * 3 + 1] = lerp(0.2, 0.6, this.rng());
      this.vel[i * 3 + 2] = Math.sin(a) * sp;
      this.age[i] = 0;
      this.life[i] = lerp(0.5, 0.9, this.rng());
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
      const drag = Math.exp(-dt * 4);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag - dt * 0.15;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = this.age[i] / this.life[i];
      this.alpha[i] = (1 - t) * Math.min(1, t * 8) * 0.55;
      this.size[i] = lerp(0.12, 0.38, t);
    }
    if (any) {
      const g = this.points.geometry;
      g.attributes.position.needsUpdate = true;
      g.attributes.aAlpha.needsUpdate = true;
      g.attributes.aSize.needsUpdate = true;
    }
  }
}
