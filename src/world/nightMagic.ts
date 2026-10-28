import * as THREE from 'three';
import { createRng, lerp } from '../core/random';
import { touch } from '../render/touch';

const POOLS = 48;
const FIREFLIES = 140;
const STARS = 900;
const SKY_RADIUS = 300;
const SOURCE_REFRESH = 0.5;

/** Somewhere that glows after dark: a lantern, a window. */
export interface NightLight {
  /** The glowing thing itself (where its halo sits). */
  pos: THREE.Vector3;
  /** Where its light falls on the lawn, and how wide the pool is. */
  pool: THREE.Vector3;
  radius: number;
}

/** A soft round spot for points: bright core, long falloff. */
const POINT_GLOW = /* glsl */ `
  float glowAt(vec2 c) {
    float d = length(c - 0.5) * 2.0;
    return pow(max(0.0, 1.0 - d), 2.2);
  }`;

/**
 * Night in the garden: lanterns and windows throw warm pools of light on the grass (with a soft
 * halo round each), fireflies rise from the flowers and blink, and stars come out overhead.
 * It all hangs off one number, how dark it is (0 by day, 1 at full night).
 */
export class NightMagic {
  readonly group = new THREE.Group();
  private readonly pools: THREE.InstancedMesh;
  private readonly halos: THREE.Points;
  private readonly flies: THREE.Points | null = null;
  private flySeeds: Float32Array | null = null;

  private readonly lights: NightLight[] = [];
  private readonly glowU = { uNight: { value: 0 }, uPixel: { value: 1 } };
  private readonly flyU = { uTime: { value: 0 }, uDark: { value: 0 }, uPixel: { value: 1 } };
  private readonly starU = { uTime: { value: 0 }, uStars: { value: 0 }, uPixel: { value: 1 } };
  private readonly rng = createRng(4404);
  private night = 0;
  private dark = 0;
  private refresh = 0;
  private resettle = 0;
  private time = 0;
  private readonly m = new THREE.Matrix4();

  constructor(
    private readonly sources: (out: NightLight[]) => void,
    private readonly heightAt: (x: number, z: number) => number,
    /** Somewhere a firefly might rise from: a flower in bloom, a meadow clump; null if none. */
    private readonly flowerSpot: (rng: () => number) => THREE.Vector3 | null,
    withFireflies: boolean,
  ) {
    this.group.visible = false;

    // Light pools: flat discs lying on the lawn, added on top of whatever is there.
    const disc = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const poolMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      uniforms: this.glowU,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = position.xz;
          gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uNight;
        varying vec2 vUv;
        void main() {
          float d = length(vUv);
          // A soft, warm wash that fades out with no visible rim.
          float a = exp(-d * d * 3.5) * smoothstep(1.0, 0.6, d) * uNight * 0.6;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vec3(1.0, 0.56, 0.24) * a, 1.0);
        }`,
    });
    this.pools = new THREE.InstancedMesh(disc, poolMat, POOLS);
    this.pools.count = 0;
    this.pools.frustumCulled = false;
    this.pools.renderOrder = 2;
    this.group.add(this.pools);

    // Halos: a warm bloom round each glowing thing (depth-tested, so the cottage hides its own).
    const halo = new THREE.BufferGeometry();
    halo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(POOLS * 3), 3));
    halo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(POOLS), 1));
    halo.setDrawRange(0, 0);
    this.halos = new THREE.Points(
      halo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: this.glowU,
        vertexShader: /* glsl */ `
          uniform float uPixel;
          attribute float aSize;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = aSize * uPixel * 300.0 / -mv.z;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uNight;
          ${POINT_GLOW}
          void main() {
            float a = glowAt(gl_PointCoord) * uNight * 0.5;
            if (a < 0.004) discard;
            gl_FragColor = vec4(vec3(1.0, 0.74, 0.42) * a, 1.0);
          }`,
      }),
    );
    this.halos.frustumCulled = false;
    this.halos.renderOrder = 3;
    this.group.add(this.halos);

    if (withFireflies) this.flies = this.fireflies();
    this.starField();
  }

  /**
   * Fireflies, moved on the GPU: each has a home (just above a flower, or somewhere on the lawn)
   * and wanders lazily round it, blinking slowly to its own rhythm.
   */
  private fireflies(): THREE.Points {
    const home = new Float32Array(FIREFLIES * 3);
    const seed = new Float32Array(FIREFLIES * 3);
    for (let i = 0; i < FIREFLIES; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = Math.sqrt(this.rng()) * 15;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      home.set([x, this.heightAt(x, z) + lerp(0.25, 1.2, this.rng()), z], i * 3);
      seed.set([this.rng(), this.rng(), this.rng()], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(home, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    this.flySeeds = seed;
    const pts = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: this.flyU,
        vertexShader: /* glsl */ `
          uniform float uTime, uDark, uPixel;
          attribute vec3 aSeed;
          varying float vLight;
          void main() {
            vec3 s = aSeed * 6.2831;
            float t = uTime * mix(0.25, 0.5, aSeed.z);
            // A lazy wander round home: loops of different sizes, bobbing up and down.
            vec3 p = position + vec3(
              sin(t + s.x) * 0.7 + sin(t * 2.3 + s.y) * 0.25,
              sin(t * 1.7 + s.z) * 0.22 + 0.1 * sin(t * 3.1 + s.x),
              cos(t * 0.9 + s.y) * 0.7 + cos(t * 2.1 + s.z) * 0.25);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            // Blink: mostly dim, then a slow swell and fade; some only come out deep in the night.
            float beat = sin(uTime * mix(0.7, 1.4, aSeed.x) + s.y * 3.0);
            float blink = smoothstep(0.2, 1.0, beat);
            float wake = smoothstep(aSeed.z * 0.6, aSeed.z * 0.6 + 0.4, uDark);
            vLight = (0.04 + blink) * wake;
            gl_PointSize = (2.5 + 6.0 * blink) * uPixel * 70.0 / -mv.z;
          }`,
        fragmentShader: /* glsl */ `
          varying float vLight;
          ${POINT_GLOW}
          void main() {
            float g = glowAt(gl_PointCoord);
            float a = g * vLight;
            if (a < 0.004) discard;
            gl_FragColor = vec4(mix(vec3(0.75, 1.0, 0.35), vec3(1.0, 1.0, 0.8), g * g) * a * 1.6, 1.0);
          }`,
      }),
    );
    pts.frustumCulled = false;
    pts.renderOrder = 4;
    this.group.add(pts);
    return pts;
  }

  /** Stars on a far dome round the view; denser and fainter towards the Milky Way's band. */
  private starField(): THREE.Points {
    const dir = new Float32Array(STARS * 3);
    const info = new Float32Array(STARS * 2);
    const band = new THREE.Vector3(0.6, 0.45, -0.66).normalize();
    const v = new THREE.Vector3();
    for (let i = 0; i < STARS; i++) {
      // Uniform over the upper sky, with a third of them pulled towards a soft band.
      do {
        v.set(this.rng() * 2 - 1, this.rng(), this.rng() * 2 - 1);
      } while (v.lengthSq() > 1 || v.lengthSq() < 0.01);
      v.normalize();
      if (i % 3 === 0) v.addScaledVector(band, -v.dot(band) * lerp(0.7, 0.95, this.rng())).normalize();
      if (v.y < 0.02) v.y = 0.02 + this.rng() * 0.1;
      v.normalize();
      dir.set([v.x, v.y, v.z], i * 3);
      // Brightness (most faint, a few bright) and a twinkle phase.
      info.set([Math.pow(this.rng(), 3), this.rng() * 6.28], i * 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(dir, 3));
    g.setAttribute('aInfo', new THREE.BufferAttribute(info, 2));
    const pts = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: this.starU,
        vertexShader: /* glsl */ `
          uniform float uTime, uStars, uPixel;
          attribute vec2 aInfo;
          varying float vLight;
          void main() {
            vec3 p = cameraPosition + position * ${SKY_RADIUS.toFixed(1)};
            gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
            float tw = 0.75 + 0.25 * sin(uTime * (1.5 + aInfo.y) + aInfo.y * 10.0);
            // Bright stars show first at dusk; the faint ones only once it's properly dark.
            float show = smoothstep(1.0 - aInfo.x, 1.0 - aInfo.x + 0.35, uStars * 1.3);
            vLight = (0.35 + aInfo.x * 0.9) * tw * show * smoothstep(0.0, 0.12, position.y);
            gl_PointSize = mix(1.4, 3.6, aInfo.x) * uPixel;
          }`,
        fragmentShader: /* glsl */ `
          varying float vLight;
          ${POINT_GLOW}
          void main() {
            float a = glowAt(gl_PointCoord) * vLight;
            if (a < 0.004) discard;
            gl_FragColor = vec4(vec3(0.9, 0.94, 1.0) * a * 1.4, 1.0);
          }`,
      }),
    );
    pts.frustumCulled = false;
    pts.renderOrder = -1;
    this.group.add(pts);
    return pts;
  }

  /** How dark it is: `night` lights lamps and stars, `dark` (a little earlier) wakes the fireflies. */
  setNight(night: number, dark: number) {
    this.night = night;
    this.dark = dark;
    this.glowU.uNight.value = night;
    this.flyU.uDark.value = dark;
    this.starU.uStars.value = night;
    this.group.visible = night > 0.005 || dark > 0.005;
    this.refresh = 0;
  }

  setPixelRatio(pr: number) {
    this.glowU.uPixel.value = pr;
    this.flyU.uPixel.value = pr;
    this.starU.uPixel.value = pr;
  }

  private gather() {
    this.lights.length = 0;
    this.sources(this.lights);
    const n = Math.min(POOLS, this.lights.length);
    const hp = this.halos.geometry.attributes.position as THREE.BufferAttribute;
    const hs = this.halos.geometry.attributes.aSize as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      const l = this.lights[i];
      const y = this.heightAt(l.pool.x, l.pool.z) + 0.02;
      this.pools.setMatrixAt(i, this.m.makeScale(l.radius, 1, l.radius).setPosition(l.pool.x, y, l.pool.z));
      hp.setXYZ(i, l.pos.x, l.pos.y, l.pos.z);
      hs.setX(i, l.radius * 0.5);
    }
    this.pools.count = n;
    this.pools.instanceMatrix.needsUpdate = true;
    hp.needsUpdate = true;
    hs.needsUpdate = true;
    this.halos.geometry.setDrawRange(0, n);
  }

  update(dt: number) {
    if (!this.group.visible) return;
    this.time += dt;
    this.flyU.uTime.value = this.time;
    this.starU.uTime.value = this.time;
    // Lights come and go as you build, so look again every so often (only while it's dark).
    this.refresh -= dt;
    if (this.refresh <= 0 && this.night > 0.005) {
      this.refresh = SOURCE_REFRESH;
      this.gather();
    }
    // Now and then a firefly drifts over to settle round a flower instead.
    if (this.flies && this.dark > 0.005) {
      this.resettle -= dt;
      if (this.resettle <= 0) {
        this.resettle = 0.3;
        const i = Math.floor(this.rng() * FIREFLIES);
        const sd = this.flySeeds!;
        // Only one that's between blinks, so nobody sees it jump.
        const beat = Math.sin(this.time * lerp(0.7, 1.4, sd[i * 3]) + sd[i * 3 + 1] * Math.PI * 2 * 3);
        const at = beat < -0.3 ? this.flowerSpot(this.rng) : null;
        if (at) {
          const p = this.flies.geometry.attributes.position as THREE.BufferAttribute;
          p.setXYZ(i, at.x + (this.rng() - 0.5) * 0.6, at.y + lerp(0.15, 0.7, this.rng()), at.z + (this.rng() - 0.5) * 0.6);
          touch(p, i);
        }
      }
    }
  }
}
