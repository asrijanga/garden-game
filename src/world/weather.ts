import * as THREE from 'three';
import { createRng } from '../core/random';
import { wetUniforms } from '../render/wet';
import type { Lighting } from './timeOfDay';
import { CLEARING_RADIUS } from './ground';

export type WeatherKind = 'clear' | 'sunbeams' | 'rain' | 'mist';
export const WEATHERS: WeatherKind[] = ['clear', 'sunbeams', 'rain', 'mist'];

const DROPS = 1400;
const SPLASHES = 260;
const RAIN_RADIUS = 14;
const RAIN_HEIGHT = 10;
const BEAMS = 7;
const BEAM_RADIUS = 11;
const MIST_LAYERS = 3;
/** Seconds to blend from one weather into the next. */
const CHANGE = 6;

const NOISE_GLSL = /* glsl */ `
float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

/**
 * The garden's weather. Soft rain (streaks, splashes, rings on the water, soil and stone going
 * dark and shiny, puddles in the paths that dry slowly after); low mist rolling in banks across
 * the lawn; or broken cloud, its shadows drifting over the grass, with sunbeams slanting down
 * through the gaps. Changes blend in gently, and everything moves on the GPU.
 */
export class Weather {
  readonly group = new THREE.Group();
  kind: WeatherKind = 'clear';
  /** How much of each weather is showing now (they blend while changing). */
  private readonly mix: Record<WeatherKind, number> = { clear: 1, sunbeams: 0, rain: 0, mist: 0 };
  private wet = 0;
  /** The light needs shading again (the weather was just set). */
  private dirty = true;
  private time = 0;
  private readonly rainU = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2() }, uRain: { value: 0 }, uColor: { value: new THREE.Color() }, uPixel: { value: 1 } };
  private readonly mistU = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2() }, uMist: { value: 0 }, uColor: { value: new THREE.Color() } };
  private readonly beamU = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2() }, uBeams: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uColor: { value: new THREE.Color() } };
  private readonly rain: THREE.Object3D[] = [];
  private readonly mist: THREE.Mesh[] = [];
  private readonly beams: THREE.Mesh;
  private readonly rng = createRng(4505);
  private readonly sunView = new THREE.Vector3();
  private readonly grey = new THREE.Color();

  constructor(private readonly snowy: boolean) {
    this.rain.push(this.rainStreaks(), this.splashes());
    for (let i = 0; i < MIST_LAYERS; i++) this.mist.push(this.mistLayer(i));
    this.beams = this.sunbeams();
    for (const o of [...this.rain, ...this.mist, this.beams]) {
      o.visible = false;
      o.frustumCulled = false;
      this.group.add(o);
    }
  }

  /** Can it rain here (in winter it snows instead)? */
  allows(kind: WeatherKind): boolean {
    return !(kind === 'rain' && this.snowy);
  }

  /** Change the weather (blending over a few seconds, or at once when the garden first opens). */
  set(kind: WeatherKind, instant = false) {
    this.kind = this.allows(kind) ? kind : 'clear';
    if (instant) for (const k of WEATHERS) this.mix[k] = k === this.kind ? 1 : 0;
    if (instant && this.kind === 'rain') this.wet = 1;
    this.dirty = true;
  }

  /** How wet the garden still is (0–1). */
  get wetness(): number {
    return this.wet;
  }

  /** How hard it's raining now (0–1). */
  get raining(): number {
    return this.mix.rain;
  }

  /** Rain streaks: short lines falling fast, slanting with the wind, in a column round the view. */
  private rainStreaks(): THREE.LineSegments {
    const seeds = new Float32Array(DROPS * 2 * 3);
    const end = new Float32Array(DROPS * 2);
    for (let i = 0; i < DROPS; i++) {
      const s = [this.rng(), this.rng(), this.rng()];
      seeds.set(s, i * 6);
      seeds.set(s, i * 6 + 3);
      end[i * 2 + 1] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: this.rainU,
      vertexShader: /* glsl */ `
        uniform float uTime, uRain;
        uniform vec3 uCenter;
        uniform vec2 uWind;
        attribute float aEnd;
        varying float vA;
        void main() {
          vec3 s = position;
          float speed = mix(7.0, 9.5, s.z);
          float fall = mod(s.y * ${RAIN_HEIGHT.toFixed(1)} - uTime * speed, ${RAIN_HEIGHT.toFixed(1)});
          vec2 slant = uWind * 1.6;
          vec2 home = (vec2(s.x, fract(s.x * 7.13 + s.z * 3.7)) * 2.0 - 1.0) * ${RAIN_RADIUS.toFixed(1)};
          vec2 xz = mod(home - slant * fall * 0.12 - uCenter.xz + ${RAIN_RADIUS.toFixed(1)}, ${(RAIN_RADIUS * 2).toFixed(1)}) - ${RAIN_RADIUS.toFixed(1)} + uCenter.xz;
          // The tail trails up and back along the way it came.
          float len = mix(0.28, 0.45, s.z);
          vec3 p = vec3(xz.x, uCenter.y + fall - 0.5, xz.y) + aEnd * normalize(vec3(slant * 0.12, 1.0)) * len;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          // Only some of the drops fall in a light shower; all of them in a downpour.
          float on = step(s.z, uRain * 1.2 - 0.1) + step(s.z, 0.25) * step(0.02, uRain);
          vA = min(on, 1.0) * smoothstep(0.0, 1.0, fall) * smoothstep(${RAIN_HEIGHT.toFixed(1)}, ${(RAIN_HEIGHT - 2).toFixed(1)}, fall) * (1.0 - aEnd * 0.8) * min(uRain * 3.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vA;
        void main() {
          if (vA < 0.01) discard;
          gl_FragColor = vec4(uColor, vA * 0.4);
        }`,
    });
    return new THREE.LineSegments(g, mat);
  }

  /** Splashes: tiny crowns of spray that pop up where the rain lands, over and over. */
  private splashes(): THREE.Points {
    const seeds = new Float32Array(SPLASHES * 3);
    for (let i = 0; i < SPLASHES; i++) seeds.set([this.rng(), this.rng(), this.rng()], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: this.rainU,
      vertexShader: /* glsl */ `
        uniform float uTime, uRain, uPixel;
        uniform vec3 uCenter;
        varying float vA;
        void main() {
          vec3 s = position;
          float cyc = uTime * mix(2.0, 3.2, s.z) + s.y * 7.0;
          float k = fract(cyc);
          float n = floor(cyc);
          // A new spot for each splash.
          vec2 r = fract(vec2(sin(n * 12.9 + s.x * 78.2), sin(n * 39.3 + s.y * 11.1)) * 43758.5) * 2.0 - 1.0;
          vec2 xz = uCenter.xz + r * ${(RAIN_RADIUS * 0.75).toFixed(1)};
          vec4 mv = viewMatrix * vec4(xz.x, uCenter.y + 0.03 + k * 0.05, xz.y, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (2.0 + k * 5.0) * uPixel * 30.0 / -mv.z;
          vA = (1.0 - k) * step(s.z, uRain) * step(k, 0.35);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.6, d) * smoothstep(0.2, 0.6, d) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor, a * 0.55);
        }`,
    });
    return new THREE.Points(g, mat);
  }

  /** One sheet of low mist: soft banks of noise drifting with the wind, thinning at the edges. */
  private mistLayer(i: number): THREE.Mesh {
    const height = [0.35, 0.9, 1.6][i];
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { ...this.mistU, uLayer: { value: i }, uHeight: { value: height } },
      vertexShader: /* glsl */ `
        uniform vec3 uCenter;
        uniform float uHeight;
        varying vec3 vWorld;
        void main() {
          vWorld = vec3(uCenter.x + position.x * 70.0, uHeight, uCenter.z + position.z * 70.0);
          gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uMist, uLayer, uHeight;
        uniform vec2 uWind;
        uniform vec3 uCenter, uColor;
        varying vec3 vWorld;
        ${NOISE_GLSL}
        void main() {
          vec2 p = vWorld.xz * (0.09 - uLayer * 0.02) + uWind * uTime * 0.04 + uLayer * 7.3 + vec2(uTime * 0.012, 0.0);
          float n = wNoise(p) * 0.6 + wNoise(p * 2.1 + 3.0) * 0.28 + wNoise(p * 4.7 - 1.0) * 0.12;
          float bank = smoothstep(0.38, 0.75, n);
          // Fade out far off, and where the forest floor rises up through the sheet.
          float r = length(vWorld.xz);
          float floorY = smoothstep(${(CLEARING_RADIUS - 2).toFixed(1)}, ${(CLEARING_RADIUS + 30).toFixed(1)}, r) * 4.5;
          float a = bank * uMist * smoothstep(0.0, 0.6, uHeight - floorY) * smoothstep(34.0, 18.0, length(vWorld.xz - uCenter.xz));
          a *= 0.26 - uLayer * 0.05;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = 5 + i;
    return m;
  }

  /** Sunbeams: soft slanting shafts down the sun's line, drifting and swelling as clouds pass. */
  private sunbeams(): THREE.Mesh {
    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    g.setAttribute('uv', quad.attributes.uv);
    const seeds = new Float32Array(BEAMS * 4);
    for (let i = 0; i < BEAMS; i++) seeds.set([this.rng(), this.rng(), this.rng(), this.rng()], i * 4);
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    g.instanceCount = BEAMS;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: this.beamU,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uCenter, uSunDir;
        uniform vec2 uWind;
        attribute vec4 aSeed;
        varying vec2 vUv;
        varying float vA;
        void main() {
          vUv = uv;
          vec2 home = (aSeed.xy * 2.0 - 1.0) * ${BEAM_RADIUS.toFixed(1)};
          vec2 xz = mod(home + uWind * uTime * 0.5 - uCenter.xz + ${BEAM_RADIUS.toFixed(1)}, ${(BEAM_RADIUS * 2).toFixed(1)}) - ${BEAM_RADIUS.toFixed(1)} + uCenter.xz;
          vec3 base = vec3(xz.x, uCenter.y - 0.2, xz.y);
          vec3 axis = normalize(uSunDir);
          vec3 side = normalize(cross(axis, cameraPosition - base));
          float width = mix(3.0, 6.0, aSeed.z);
          vec3 p = base + axis * position.y * 24.0 + side * position.x * width * (1.0 + position.y * 0.5);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          // Each beam swells and fades as the gaps in the cloud drift by.
          float cyc = sin(uTime * mix(0.08, 0.16, aSeed.w) + aSeed.w * 6.28) * 0.5 + 0.5;
          vA = cyc * cyc * cyc;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uBeams;
        uniform vec3 uColor;
        varying vec2 vUv;
        varying float vA;
        void main() {
          float across = sin(vUv.x * 3.14159);
          float a = pow(across, 3.0) * smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.1, vUv.y) * vA * uBeams * 0.06;
          if (a < 0.003) discard;
          gl_FragColor = vec4(uColor * a, 1.0);
        }`,
    });
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = 8;
    return m;
  }

  /** Change the day's light to suit the weather (grey and soft in rain, pale and close in mist). */
  shade(l: Lighting) {
    const { rain, mist, sunbeams } = this.mix;
    const lum = l.haze.r * 0.3 + l.haze.g * 0.59 + l.haze.b * 0.11;
    this.grey.setRGB(lum * 0.96, lum, lum * 1.05);
    l.haze.lerp(this.grey, Math.min(1, rain * 0.6 + mist * 0.45));
    l.sky.lerp(this.grey, Math.min(1, rain * 0.45 + mist * 0.3));
    l.sun.lerp(this.grey, rain * 0.5);
    l.sunIntensity *= 1 - rain * 0.72 - mist * 0.45 - sunbeams * 0.08;
    l.skyIntensity *= 1 + rain * 0.08 + mist * 0.15;
    l.mist *= 1 - rain * 0.3 - mist * 0.55;
    l.saturation *= 1 - rain * 0.16 - mist * 0.14;
    l.bloom += sunbeams * 0.12 + mist * 0.1;
    l.glow *= 1 - rain * 0.25;
    // Things to carry over to this frame's effects.
    this.rainU.uColor.value.copy(l.sky).lerp(new THREE.Color('#ffffff'), 0.5).multiplyScalar(0.9 * (1 - l.night * 0.6));
    this.mistU.uColor.value.copy(l.haze).multiplyScalar(1.04);
    this.beamU.uColor.value.copy(l.sun).multiplyScalar((1 - l.night) * smoothDay(l.sunDir.y));
    this.beamU.uSunDir.value.copy(l.sunDir);
    wetUniforms.uWetSky.value.copy(l.sky).lerp(this.grey, 0.3).multiplyScalar(0.8 * (1 - l.night * 0.75));
  }

  setPixelRatio(pr: number) {
    this.rainU.uPixel.value = pr;
  }

  /** Returns true when the weather moved on this frame (so the light should be shaded again). */
  update(dt: number, camera: THREE.Camera, center: THREE.Vector3, wind: THREE.Vector2): boolean {
    this.time += dt;
    let moved = this.dirty;
    this.dirty = false;
    for (const k of WEATHERS) {
      const want = k === this.kind ? 1 : 0;
      if (this.mix[k] === want) continue;
      const step = dt / CHANGE;
      this.mix[k] = this.mix[k] < want ? Math.min(want, this.mix[k] + step) : Math.max(want, this.mix[k] - step);
      moved = true;
    }
    const { rain, mist, sunbeams } = this.mix;
    // Soaks in over half a minute of rain; dries out over a couple of minutes.
    this.wet = rain > 0.3 ? Math.min(1, this.wet + dt * rain / 30) : Math.max(0, this.wet - dt / 120);
    wetUniforms.uWet.value = this.wet;
    wetUniforms.uRainNow.value = rain;
    wetUniforms.uWetTime.value = this.time;
    wetUniforms.uCloud.value = Math.min(1, sunbeams + rain * 0.4);
    const drift = wetUniforms.uCloudDrift.value;
    drift.x += (wind.x * 0.012 + 0.004) * dt;
    drift.y += (wind.y * 0.012 + 0.0015) * dt;
    this.sunView.copy(this.beamU.uSunDir.value).transformDirection(camera.matrixWorldInverse);
    wetUniforms.uWetSun.value.copy(this.sunView);

    for (const u of [this.rainU, this.mistU, this.beamU]) {
      u.uTime.value = this.time;
      u.uCenter.value.copy(center);
      u.uWind.value.copy(wind);
    }
    this.rainU.uRain.value = rain;
    this.mistU.uMist.value = mist + rain * 0.25;
    this.beamU.uBeams.value = sunbeams;
    for (const o of this.rain) o.visible = rain > 0.002;
    for (const o of this.mist) o.visible = mist + rain * 0.25 > 0.002;
    this.beams.visible = sunbeams > 0.002;
    return moved;
  }
}

/** Sunbeams need the sun up: fade them as it nears the horizon. */
function smoothDay(y: number): number {
  const t = Math.min(1, Math.max(0, (y - 0.03) / 0.15));
  return t * t * (3 - 2 * t);
}
