import * as THREE from 'three';
import { createRng, lerp } from '../core/random';

const MAX_BIRDS = 12;
const WING_ROOT = 0.035;
const WING_SPAN = 0.34; // half span, metres
const UP = new THREE.Vector3(0, 1, 0);
/** Storybook scale: real songbirds would be specks from the garden camera. */
const BIRD_SCALE = 2.1;

/**
 * A small songbird: a soft body and two swept wings. Wing vertices carry `aWing` (side) so the
 * vertex shader can flap them around the body's long axis.
 */
function birdGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const wing: number[] = [];
  const back = new THREE.Color('#ffffff');
  const belly = new THREE.Color('#f3dcc0');
  const wingTone = new THREE.Color('#d8d2cc');
  const tri = (a: number[], b: number[], c: number[], color: THREE.Color, side: number) => {
    for (const v of [a, b, c]) {
      pos.push(v[0], v[1], v[2]);
      col.push(color.r, color.g, color.b);
      wing.push(side);
    }
  };

  // Body: a little faceted spindle (forward is +z), back on top, warm belly underneath.
  const rings = [
    [-0.13, 0.012],
    [-0.06, 0.04],
    [0.03, 0.05],
    [0.09, 0.038],
    [0.14, 0.012],
  ];
  const sides = 6;
  for (let r = 0; r < rings.length - 1; r++) {
    const [z0, r0] = rings[r];
    const [z1, r1] = rings[r + 1];
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const p = (z: number, rad: number, a: number) => [Math.cos(a) * rad, Math.sin(a) * rad * 0.85, z];
      const c = Math.sin((a0 + a1) / 2) > 0 ? back : belly;
      tri(p(z0, r0, a0), p(z1, r1, a1), p(z1, r1, a0), c, 0);
      tri(p(z0, r0, a0), p(z0, r0, a1), p(z1, r1, a1), c, 0);
    }
  }
  // Tail fan.
  tri([0, 0.005, -0.12], [-0.045, 0.0, -0.22], [0.045, 0.0, -0.22], back, 0);

  // Wings: swept, slightly rounded, with a pale underside tone.
  for (const s of [-1, 1]) {
    const root0 = [s * WING_ROOT, 0.02, 0.06];
    const root1 = [s * WING_ROOT, 0.02, -0.05];
    const mid = [s * (WING_ROOT + WING_SPAN * 0.55), 0.02, 0.03];
    const tip = [s * (WING_ROOT + WING_SPAN), 0.02, -0.06];
    const trail = [s * (WING_ROOT + WING_SPAN * 0.5), 0.02, -0.08];
    tri(root0, mid, root1, wingTone, s);
    tri(root1, mid, trail, wingTone, s);
    tri(mid, tip, trail, wingTone, s);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  g.computeVertexNormals();
  return g;
}

interface Bird {
  offset: THREE.Vector3; // position in the flock's frame (x = side, y = up, z = back)
  phase: number;
  flap: number;
  flapTarget: number;
  flapTimer: number;
  wobble: number;
  color: THREE.Color;
}

interface Flight {
  from: THREE.Vector3;
  via: THREE.Vector3;
  to: THREE.Vector3;
  duration: number;
  t: number;
  birds: Bird[];
}

const SONGBIRD_COLORS = ['#8a6448', '#7a5a42', '#9a7656', '#6b5446', '#a88462'];
const FLOCK_COLORS = ['#4a423c', '#3f3a36', '#55493f'];

/**
 * Rare little visitors: a single songbird, a pair, or a small flock crossing the sky over the
 * clearing. They flap and glide like real birds, bank into curves, and cast soft shadows.
 */
export class FlyingBirds {
  readonly mesh: THREE.InstancedMesh;
  private readonly rng = createRng(4242);
  private readonly flights: Flight[] = [];
  private readonly flapAttr: THREE.InstancedBufferAttribute;
  private readonly phaseAttr: THREE.InstancedBufferAttribute;
  private readonly uniforms = { uTime: { value: 0 } };
  private nextIn: number;
  private time = 0;

  constructor(
    private readonly groundHeight: (x: number, z: number) => number,
    private readonly worldRadius: number,
    firstIn = 15,
  ) {
    const geo = birdGeometry();
    this.flapAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BIRDS), 1);
    this.phaseAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BIRDS), 1);
    this.flapAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aFlap', this.flapAttr);
    geo.setAttribute('aPhase', this.phaseAttr);

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.customProgramCacheKey = () => 'flying-birds';
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aWing;\nattribute float aFlap;\nattribute float aPhase;')
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          if (aWing != 0.0) {
            // Flap the wing around the body's long axis: a strong downstroke while flapping,
            // a gentle raised "V" while gliding.
            float beat = sin(uTime * 19.0 + aPhase);
            float ang = beat * 0.95 * aFlap + 0.18;
            float r = abs(transformed.x) - ${WING_ROOT.toFixed(3)};
            transformed.x = aWing * (${WING_ROOT.toFixed(3)} + r * cos(ang));
            transformed.y += r * sin(ang);
            // Body lifts slightly with each downstroke.
          }
          transformed.y += sin(uTime * 19.0 + aPhase) * 0.012 * aFlap;`,
        );
    };

    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_BIRDS);
    this.mesh.count = 0;
    this.mesh.castShadow = false; // far overhead; not worth redrawing shadows for
    this.mesh.frustumCulled = false;
    this.nextIn = firstIn;
  }

  private launch() {
    const rng = this.rng;
    const kind = rng();
    const count = kind < 0.4 ? 1 : kind < 0.6 ? 2 : 5 + Math.floor(rng() * 5);
    const isFlock = count > 2;
    const R = this.worldRadius;

    const a = rng() * Math.PI * 2;
    const from = new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R);
    const b = a + Math.PI + lerp(-0.7, 0.7, rng());
    const to = new THREE.Vector3(Math.cos(b) * R, 0, Math.sin(b) * R);
    const via = new THREE.Vector3(lerp(-10, 10, rng()), 0, lerp(-10, 10, rng()));
    const alt = isFlock ? lerp(20, 28, rng()) : lerp(14, 22, rng());
    from.y = alt + lerp(-3, 3, rng());
    via.y = alt;
    to.y = alt + lerp(-3, 5, rng());
    const length = from.distanceTo(via) + via.distanceTo(to);
    const speed = isFlock ? lerp(8, 10, rng()) : lerp(6, 9, rng());

    const palette = isFlock ? FLOCK_COLORS : SONGBIRD_COLORS;
    const birds: Bird[] = [];
    for (let i = 0; i < count; i++) {
      let offset: THREE.Vector3;
      if (!isFlock) {
        offset = new THREE.Vector3(i === 0 ? 0 : lerp(0.8, 1.6, rng()) * (rng() < 0.5 ? -1 : 1), lerp(-0.3, 0.3, rng()), i * lerp(0.8, 1.6, rng()));
      } else {
        // A loose, imperfect V.
        const rank = Math.ceil(i / 2);
        const side = i === 0 ? 0 : i % 2 === 0 ? 1 : -1;
        offset = new THREE.Vector3(side * rank * lerp(0.75, 1.0, rng()), lerp(-0.25, 0.25, rng()), rank * lerp(0.7, 0.95, rng()));
      }
      birds.push({
        offset,
        phase: rng() * Math.PI * 2,
        flap: 1,
        flapTarget: 1,
        flapTimer: lerp(0.3, 1.5, rng()),
        wobble: rng() * 100,
        color: new THREE.Color(palette[Math.floor(rng() * palette.length)]),
      });
    }
    this.flights.push({ from, via, to, duration: length / speed, t: 0, birds });
  }

  private pathAt(f: Flight, t: number, out: THREE.Vector3): THREE.Vector3 {
    const u = 1 - t;
    out.set(0, 0, 0).addScaledVector(f.from, u * u).addScaledVector(f.via, 2 * u * t).addScaledVector(f.to, t * t);
    return out;
  }

  /** For testing: send some birds over right now. */
  launchNow() {
    this.launch();
  }

  /** How many fly over (busier at dawn, few in the rain, none at night). */
  activity = 1;

  update(dt: number) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    this.nextIn -= dt * Math.max(0.05, this.activity);
    if (this.nextIn <= 0) {
      if (this.activity > 0.2) this.launch();
      this.nextIn = lerp(30, 75, this.rng());
    }

    const p = new THREE.Vector3();
    const ahead = new THREE.Vector3();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const bank = new THREE.Quaternion();
    const prevFwd = new THREE.Vector3();
    const one = new THREE.Vector3(BIRD_SCALE, BIRD_SCALE, BIRD_SCALE);
    let n = 0;

    for (let fi = this.flights.length - 1; fi >= 0; fi--) {
      const f = this.flights[fi];
      f.t += dt / f.duration;
      if (f.t >= 1.08) {
        this.flights.splice(fi, 1);
        continue;
      }
      const t = f.t;
      this.pathAt(f, t, p);
      this.pathAt(f, t + 0.01, ahead);
      forward.copy(ahead).sub(p).normalize();
      this.pathAt(f, Math.max(0, t - 0.01), prevFwd);
      prevFwd.subVectors(p, prevFwd).normalize();
      const turn = prevFwd.x * forward.z - prevFwd.z * forward.x; // signed curvature
      right.crossVectors(forward, UP).normalize();

      for (const b of f.birds) {
        if (n >= MAX_BIRDS) break;
        // Flap for a moment, then glide, like real small birds.
        b.flapTimer -= dt;
        if (b.flapTimer <= 0) {
          b.flapTarget = b.flapTarget > 0.5 ? 0.08 : 1;
          b.flapTimer = b.flapTarget > 0.5 ? lerp(0.7, 1.6, this.rng()) : lerp(0.5, 1.4, this.rng());
        }
        b.flap += (b.flapTarget - b.flap) * Math.min(1, dt * 6);

        const wob = this.time * 0.9 + b.wobble;
        const pos = p
          .clone()
          .addScaledVector(right, b.offset.x * BIRD_SCALE + Math.sin(wob) * 0.25)
          .addScaledVector(forward, -b.offset.z * BIRD_SCALE)
          .add(new THREE.Vector3(0, b.offset.y + Math.sin(wob * 1.3) * 0.12, 0));
        // Never dip into the canopy.
        pos.y = Math.max(pos.y, this.groundHeight(pos.x, pos.z) + 12);

        m.lookAt(pos.clone().add(forward), pos, UP);
        q.setFromRotationMatrix(m);
        bank.setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.clamp(-turn * 40, -0.5, 0.5));
        q.multiply(bank);
        m.compose(pos, q, one);
        this.mesh.setMatrixAt(n, m);
        this.mesh.setColorAt(n, b.color);
        this.flapAttr.setX(n, b.flap);
        this.phaseAttr.setX(n, b.phase);
        n++;
      }
    }
    this.mesh.count = n;
    if (n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
      this.flapAttr.needsUpdate = true;
      this.phaseAttr.needsUpdate = true;
    }
  }
}
