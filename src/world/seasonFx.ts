import * as THREE from 'three';
import { createRng, lerp } from '../core/random';
import { touch } from '../render/touch';
import type { Season } from './season';

const MAX_DRIFT = 160;
const SNOW = 900;
const SNOW_RADIUS = 13;
const SNOW_HEIGHT = 9;

type Rng = () => number;

interface Drifter {
  pos: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  t: number;
  /** Seconds left lying on the ground before fading (Infinity: stays till pushed out). */
  rest: number;
  landed: boolean;
  size: number;
  phase: number;
  bornAt: number;
  /** Its resting place has been written (nothing to update while it lies still). */
  settled: boolean;
}

/** What drifts through the air in each season: how often, how big, what colours, how it falls. */
const DRIFT: Record<Season, { rate: number; size: [number, number]; colors: string[]; fall: number; flutter: number; stay: number; leaf: boolean } | null> = {
  spring: { rate: 1.6, size: [0.03, 0.045], colors: ['#f6c6d4', '#fbe2ea', '#f2a6c0', '#ffffff'], fall: 0.32, flutter: 0.9, stay: 25, leaf: false },
  summer: { rate: 0.35, size: [0.018, 0.026], colors: ['#fbfbf4', '#f4f0e0'], fall: 0.12, flutter: 0.5, stay: 6, leaf: false },
  autumn: { rate: 3.2, size: [0.05, 0.075], colors: ['#c98236', '#b25a3a', '#d8a948', '#a8703f', '#cf9440', '#9c4a33', '#c9a04a', '#e0b050'], fall: 0.55, flutter: 1.3, stay: Infinity, leaf: true },
  winter: null,
};

function leafGeometry(leaf: boolean): THREE.BufferGeometry {
  // A leaf (pointed oval with a centre fold) or a petal (a rounded cup); both very small.
  const shape = new THREE.Shape();
  if (leaf) {
    shape.moveTo(0, -0.5);
    shape.quadraticCurveTo(0.42, -0.15, 0.08, 0.5);
    shape.quadraticCurveTo(0, 0.56, -0.08, 0.5);
    shape.quadraticCurveTo(-0.42, -0.15, 0, -0.5);
  } else {
    shape.moveTo(0, -0.5);
    shape.quadraticCurveTo(0.5, -0.3, 0.38, 0.25);
    shape.quadraticCurveTo(0, 0.6, -0.38, 0.25);
    shape.quadraticCurveTo(-0.5, -0.3, 0, -0.5);
  }
  const g = new THREE.ShapeGeometry(shape, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, leaf ? Math.abs(p.getX(i)) * 0.35 : (p.getX(i) ** 2 + p.getY(i) ** 2) * 0.3);
  g.computeVertexNormals();
  return g;
}

/**
 * The air of the season: cherry-blossom petals in spring, the odd floating seed in summer, amber
 * and gold leaves tumbling down in autumn (gathering where they land), and soft snow in winter.
 * Everything rides the garden's own gusts.
 */
export class SeasonFx {
  readonly group = new THREE.Group();
  private readonly drift: (typeof DRIFT)[Season];
  private readonly mesh: THREE.InstancedMesh | null = null;
  private readonly items: (Drifter | null)[] = [];
  private readonly rng: Rng = createRng(5050);
  private readonly snowUniforms = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2() } };
  private spawnDebt = 0;
  private time = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();

  constructor(
    season: Season,
    private readonly heightAt: (x: number, z: number) => number,
    private readonly wind: () => THREE.Vector2,
    private readonly around: () => THREE.Vector3,
  ) {
    this.drift = DRIFT[season];
    if (this.drift) {
      const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
      this.mesh = new THREE.InstancedMesh(leafGeometry(this.drift.leaf), mat, MAX_DRIFT);
      this.mesh.frustumCulled = false;
      this.mesh.receiveShadow = true;
      for (let i = 0; i < MAX_DRIFT; i++) {
        this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
        this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
        this.items.push(null);
      }
      this.group.add(this.mesh);
    }
    if (season === 'winter') this.group.add(this.snow());
  }

  /**
   * Snow, entirely on the GPU: each flake's place is worked out in the vertex shader from its
   * own seed and the time, falling and swaying in a column that follows the view.
   */
  private snow(): THREE.Points {
    const seeds = new Float32Array(SNOW * 3);
    for (let i = 0; i < SNOW; i++) seeds.set([this.rng(), this.rng(), this.rng()], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: this.snowUniforms,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uCenter;
        uniform vec2 uWind;
        varying float vFade;
        void main() {
          vec3 s = position;
          float speed = mix(0.45, 0.85, s.z);
          float fall = mod(s.y * ${SNOW_HEIGHT.toFixed(1)} - uTime * speed, ${SNOW_HEIGHT.toFixed(1)});
          // Spread round the view, drifting downwind, swaying as it falls.
          vec2 home = (vec2(s.x, fract(s.x * 7.13 + s.z * 3.7)) * 2.0 - 1.0) * ${SNOW_RADIUS.toFixed(1)};
          vec2 drift = uWind * uTime * 0.4 + vec2(sin(uTime * 0.8 + s.z * 30.0), cos(uTime * 0.7 + s.x * 20.0)) * 0.35;
          vec2 xz = mod(home + drift - uCenter.xz + ${SNOW_RADIUS.toFixed(1)}, ${(SNOW_RADIUS * 2).toFixed(1)}) - ${SNOW_RADIUS.toFixed(1)} + uCenter.xz;
          vec4 mv = modelViewMatrix * vec4(xz.x, uCenter.y + fall - 1.0, xz.y, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = mix(2.0, 4.5, s.z) * (60.0 / -mv.z) * 1.0;
          // Fade in at the top and out near the ground, so the column has no edges.
          vFade = smoothstep(0.0, 0.8, fall) * smoothstep(${SNOW_HEIGHT.toFixed(1)}, ${(SNOW_HEIGHT - 1.5).toFixed(1)}, fall);
        }`,
      fragmentShader: /* glsl */ `
        varying float vFade;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.15, d) * vFade * 0.9;
          if (a < 0.02) discard;
          gl_FragColor = vec4(vec3(0.97, 0.98, 1.0), a);
        }`,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    return pts;
  }

  private spawn() {
    const d = this.drift!;
    let slot = this.items.indexOf(null);
    if (slot < 0) {
      // Full: the oldest one lying on the ground gives way (fading away first would be nicer,
      // but at this size nobody can tell which one went).
      let oldest = -1;
      let at = Infinity;
      this.items.forEach((it, i) => {
        if (it && it.landed && it.bornAt < at) {
          at = it.bornAt;
          oldest = i;
        }
      });
      if (oldest < 0) return;
      slot = oldest;
    }
    const c = this.around();
    const a = this.rng() * Math.PI * 2;
    const r = Math.sqrt(this.rng()) * 12;
    const x = c.x + Math.cos(a) * r;
    const z = c.z + Math.sin(a) * r;
    this.items[slot] = {
      pos: new THREE.Vector3(x, this.heightAt(x, z) + lerp(3, 6, this.rng()), z),
      rot: new THREE.Euler(this.rng() * 6, this.rng() * 6, this.rng() * 6),
      spin: new THREE.Vector3(lerp(-3, 3, this.rng()), lerp(-2, 2, this.rng()), lerp(-3, 3, this.rng())),
      t: 0,
      rest: d.stay * lerp(0.7, 1.3, this.rng()),
      landed: false,
      size: lerp(d.size[0], d.size[1], this.rng()) * 2.2,
      phase: this.rng() * 10,
      bornAt: this.time,
      settled: false,
    };
    this.mesh!.setColorAt(slot, new THREE.Color(d.colors[Math.floor(this.rng() * d.colors.length)]).multiplyScalar(lerp(0.88, 1.08, this.rng())));
    if (this.mesh!.instanceColor) touch(this.mesh!.instanceColor, slot);
  }

  update(dt: number) {
    this.time += dt;
    const w = this.wind();
    this.snowUniforms.uTime.value = this.time;
    this.snowUniforms.uCenter.value.copy(this.around());
    this.snowUniforms.uWind.value.copy(w);
    const d = this.drift;
    if (!d || !this.mesh) return;
    // More in a gust (leaves let go when the wind picks up).
    this.spawnDebt += dt * d.rate * (0.5 + w.length() * 1.5);
    while (this.spawnDebt >= 1) {
      this.spawnDebt -= 1;
      this.spawn();
    }
    for (let i = 0; i < MAX_DRIFT; i++) {
      const it = this.items[i];
      if (!it) continue;
      it.t += dt;
      let k = it.size;
      if (!it.landed) {
        // Falling: drifting downwind, swaying, tumbling over and over.
        const sway = Math.sin(it.t * 2.6 + it.phase) * d.flutter * 0.3;
        it.pos.x += (w.x * 0.9 + sway) * dt;
        it.pos.z += (w.y * 0.9 + Math.cos(it.t * 2.1 + it.phase) * d.flutter * 0.25) * dt;
        it.pos.y -= (d.fall + Math.sin(it.t * 4 + it.phase) * d.fall * 0.4) * dt;
        it.rot.x += it.spin.x * dt;
        it.rot.y += it.spin.y * dt;
        it.rot.z += it.spin.z * dt;
        const ground = this.heightAt(it.pos.x, it.pos.z) + 0.012;
        if (it.pos.y <= ground) {
          it.pos.y = ground;
          it.landed = true;
          it.rot.set(-Math.PI / 2 + (this.rng() - 0.5) * 0.5, this.rng() * 6, (this.rng() - 0.5) * 0.3);
        }
      } else {
        it.rest -= dt;
        if (it.rest < 2) k *= Math.max(0, it.rest / 2);
        if (it.rest <= 0) {
          this.items[i] = null;
          this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
          touch(this.mesh.instanceMatrix, i);
          continue;
        }
        // Lying still: written once, then left alone until it starts to fade.
        if (it.rest >= 2) {
          if (it.settled) continue;
          it.settled = true;
        }
      }
      this.q.setFromEuler(it.rot);
      this.mesh.setMatrixAt(i, this.m.compose(it.pos, this.q, this.s.setScalar(k)));
      touch(this.mesh.instanceMatrix, i);
    }
  }
}
