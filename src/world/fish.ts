import * as THREE from 'three';
import { regrow } from '../core/regrow';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng, lerp } from '../core/random';
import type { Ponds, PondBody } from './pond';
import type { Splash } from './splash';

const CAPACITY = 40; // per variety
const MAX_FISH = 36;

interface Variety {
  base: string;
  patch?: string;
  spots?: string;
  fin: string;
}

/** Goldfish and a few koi: plain orange, red-on-white, gold, and red-and-black on white. */
const VARIETIES: Variety[] = [
  { base: '#ff7410', fin: '#ff9a40' },
  { base: '#fbf6ec', patch: '#f04418', fin: '#fbf3ea' },
  { base: '#ffbf2a', fin: '#ffd770' },
  { base: '#fbf6ec', patch: '#ea3f1a', spots: '#1d1a18', fin: '#f5eee4' },
];

function paint(g: THREE.BufferGeometry, color: (x: number, z: number) => THREE.Color): THREE.BufferGeometry {
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = color(pos.getX(i), pos.getZ(i));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.deleteAttribute('uv');
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * A small fish, nose along +x, about 24 cm long. Fins are drawn flat (wider than life) so the
 * fish reads clearly from above, the way you see koi from the side of a pond.
 */
function fishGeometry(v: Variety, seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const body = new THREE.SphereGeometry(1, 14, 8);
  const pos = body.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    // Fuller at the shoulders, tapering to the tail.
    const taper = x >= 0 ? 1 - x * x * 0.25 : 1 + x * 0.55;
    pos.setXYZ(i, x * 0.12, pos.getY(i) * 0.04 * taper, pos.getZ(i) * 0.042 * taper);
  }
  body.computeVertexNormals();
  const tail = new THREE.Shape();
  tail.moveTo(-0.1, 0);
  tail.quadraticCurveTo(-0.16, 0.05, -0.21, 0.065);
  tail.quadraticCurveTo(-0.18, 0, -0.21, -0.065);
  tail.quadraticCurveTo(-0.16, -0.05, -0.1, 0);
  const tailGeo = new THREE.ShapeGeometry(tail, 4);
  tailGeo.rotateX(-Math.PI / 2);
  const fins = [1, -1].map((side) => {
    const f = new THREE.CircleGeometry(0.028, 8);
    f.scale(1, 0.55, 1);
    f.rotateZ(side * 0.7);
    f.rotateX(-Math.PI / 2);
    f.translate(0.03, -0.01, side * 0.05);
    return f;
  });
  const ph = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
  const base = new THREE.Color(v.base);
  const patch = v.patch ? new THREE.Color(v.patch) : null;
  const spots = v.spots ? new THREE.Color(v.spots) : null;
  const fin = new THREE.Color(v.fin);
  const bodyColor = (x: number, z: number) => {
    const c = base.clone();
    if (patch && Math.sin(x * 38 + ph[0]) + Math.sin(z * 30 + x * 12 + ph[1]) > 0.3) c.copy(patch);
    if (spots && Math.sin(x * 90 + ph[2]) * Math.sin(z * 80 + ph[0]) > 0.7) c.copy(spots);
    return c;
  };
  return mergeGeometries([paint(body, bodyColor), paint(tailGeo, () => fin), ...fins.map((f) => paint(f, () => fin))]);
}

interface Swimmer {
  mesh: THREE.InstancedMesh;
  index: number;
  x: number;
  z: number;
  y: number;
  heading: number;
  speed: number;
  cruise: number;
  tx: number;
  tz: number;
  pause: number;
  phase: number;
  scale: number;
  grow: number;
  delay: number;
  kiss: number;
  gone?: boolean;
  jump: { t: number; dur: number; x0: number; z0: number; dist: number; h: number; level: number; out: boolean } | null;
}

/**
 * Fish glide about each pond, pausing now and then, nosing up to kiss the surface, and every
 * so often leaping clean out of the water with a splash and spreading rings.
 */
export class Fish {
  readonly group = new THREE.Group();
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly swim: THREE.InstancedBufferAttribute[] = [];
  private readonly fish: Swimmer[] = [];
  private rng = createRng(808);
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly v2 = new THREE.Vector2();
  private nextJump = 5;

  constructor(
    private readonly ponds: Ponds,
    private readonly splash: Splash,
    private readonly onSplash: (size: number) => void,
  ) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.customProgramCacheKey = () => 'fish';
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aSwim;')
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          // The body swings side to side, more towards the tail.
          float sway = smoothstep(0.08, -0.21, transformed.x);
          transformed.z += sin(aSwim.x - transformed.x * 24.0) * aSwim.y * sway * 0.04;`,
        );
    };
    VARIETIES.forEach((v, k) => {
      const mesh = new THREE.InstancedMesh(fishGeometry(v, 40 + k * 7), mat, CAPACITY);
      const swim = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 2), 2);
      swim.setUsage(THREE.DynamicDrawUsage);
      mesh.geometry.setAttribute('aSwim', swim);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
      this.swim.push(swim);
      this.group.add(mesh);
    });
  }

  /** Back to an untouched garden (before an undo replays what remains). */
  reset() {
    for (const m of this.meshes) m.count = 0;
    this.fish.length = 0;
    this.rng = createRng(808);
    this.nextJump = 5;
  }

  /** Make sure a pond has a few fish (more for bigger ponds), arriving after `delay` seconds. */
  stock(body: PondBody, delay: number) {
    delay += regrow.offset;
    let deep = 0;
    for (const v of body.cells) {
      this.ponds.cellPosition(v, this.v2);
      if (this.ponds.waterDepth(this.v2.x, this.v2.y) > 0.3) deep++;
    }
    const area = deep * 0.038;
    const want = Math.min(6, Math.round(area / 2.5));
    let have = 0;
    for (const f of this.fish) if (!f.gone && this.ponds.bodyAt(f.x, f.z)?.id === body.id) have++;
    for (let n = have; n < want && this.fish.filter((f) => !f.gone).length < MAX_FISH; n++) {
      const spot = this.deepSpot(body);
      if (!spot) return;
      // Mostly goldfish and kohaku; the odd gold or three-colour koi.
      const r = this.rng();
      const kind = r < 0.4 ? 0 : r < 0.7 ? 1 : r < 0.85 ? 2 : 3;
      const mesh = this.meshes[kind];
      // Reuse the slot of a fish that slipped away, if there is one.
      const old = this.fish.findIndex((f) => f.gone && f.grow <= 0 && f.mesh === mesh);
      let index: number;
      if (old >= 0) index = this.fish.splice(old, 1)[0].index;
      else if (mesh.count < CAPACITY) index = mesh.count++;
      else continue;
      mesh.setColorAt(index, new THREE.Color(1, 1, 1).multiplyScalar(lerp(0.92, 1.05, this.rng())));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.fish.push({
        mesh,
        index,
        x: spot.x,
        z: spot.y,
        y: body.target - 0.3,
        heading: this.rng() * Math.PI * 2,
        speed: 0,
        cruise: lerp(0.18, 0.32, this.rng()),
        tx: spot.x,
        tz: spot.y,
        pause: 0,
        phase: this.rng() * 6,
        scale: lerp(1.6, 2.2, this.rng()),
        grow: 0,
        delay: delay + n * 0.6,
        kiss: lerp(6, 16, this.rng()),
        jump: null,
      });
    }
    // The first jump comes soon after a pond is stocked.
    this.nextJump = Math.min(this.nextJump, delay + lerp(4, 7, this.rng()));
  }

  private deepSpot(body: PondBody, minDepth = 0.3): THREE.Vector2 | null {
    for (let tries = 0; tries < 20; tries++) {
      const v = body.cells[Math.floor(this.rng() * body.cells.length)];
      const p = this.ponds.cellPosition(v, new THREE.Vector2());
      if (this.ponds.waterDepth(p.x, p.y) > minDepth) return p;
    }
    return null;
  }

  update(dt: number) {
    this.nextJump -= dt;
    if (this.nextJump <= 0) this.tryJump();
    for (const f of this.fish) {
      if (f.delay > 0) {
        f.delay -= dt;
        continue;
      }
      f.grow = Math.min(1, f.grow + dt / 1.5);
      const body = this.ponds.bodyAt(f.x, f.z);
      if (f.gone || (!f.jump && f.grow >= 1 && this.ponds.waterDepth(f.x, f.z) < 0.06)) {
        // Its water was filled in: the fish slips away.
        f.gone = true;
        f.grow = Math.max(0, f.grow - dt * 2.5);
        this.m.makeScale(0, 0, 0);
        if (f.grow > 0) {
          const k = f.scale * f.grow;
          this.m.compose(this.p.set(f.x, f.y, f.z), this.q.setFromEuler(this.e.set(0, -f.heading, 0)), this.s.set(k, k, k));
        }
        f.mesh.setMatrixAt(f.index, this.m);
        f.mesh.instanceMatrix.needsUpdate = true;
        continue;
      }
      if (!body?.filled) continue;
      const level = body.level;
      let pitch = 0;
      if (f.jump) {
        pitch = this.leap(f, dt);
      } else {
        const depth = this.ponds.waterDepth(f.x, f.z);
        const ax = f.x + Math.cos(f.heading) * 0.35;
        const az = f.z + Math.sin(f.heading) * 0.35;
        const ahead = this.ponds.waterDepth(ax, az);
        if (Math.hypot(f.tx - f.x, f.tz - f.z) < 0.25 || ahead < 0.18) {
          const t = this.deepSpot(body, 0.26);
          if (t) {
            f.tx = t.x;
            f.tz = t.y;
          }
          if (this.rng() < 0.3) f.pause = lerp(1, 3.5, this.rng());
        }
        f.pause -= dt;
        const want = Math.atan2(f.tz - f.z, f.tx - f.x);
        let turn = want - f.heading;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        const rate = ahead < 0.18 ? 2.6 : 1.3;
        f.heading += Math.max(-rate * dt, Math.min(rate * dt, turn));
        const goal = f.pause > 0 ? 0.03 : f.cruise * (1 - Math.min(0.6, Math.abs(turn) * 0.3));
        f.speed += (goal - f.speed) * Math.min(1, dt * 1.5);
        f.x += Math.cos(f.heading) * f.speed * dt;
        f.z += Math.sin(f.heading) * f.speed * dt;
        // Cruise a little below the surface; now and then nose up to kiss it.
        f.kiss -= dt;
        let below = Math.min(0.13, Math.max(0.06, depth * 0.25));
        if (f.kiss < 0) {
          below = 0.04;
          if (f.kiss < -0.6) {
            this.ponds.addRipple(f.x + Math.cos(f.heading) * 0.12, f.z + Math.sin(f.heading) * 0.12, 0.35);
            f.kiss = lerp(8, 20, this.rng());
          }
        }
        f.y += (level - below - f.y) * Math.min(1, dt * 1.2);
        f.phase += dt * (3 + f.speed * 22);
      }
      const sw = this.swim[this.meshes.indexOf(f.mesh)];
      sw.setXY(f.index, f.phase, f.jump ? 1.4 : 0.35 + f.speed * 3);
      sw.needsUpdate = true;
      this.e.set(0, -f.heading, pitch);
      this.q.setFromEuler(this.e);
      const k = f.scale * Math.max(0.0001, f.grow);
      this.m.compose(this.p.set(f.x, f.y, f.z), this.q, this.s.set(k, k, k));
      f.mesh.setMatrixAt(f.index, this.m);
      f.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private tryJump() {
    const ready = this.fish.filter((f) => f.grow >= 1 && !f.jump && !f.gone && f.delay <= 0);
    this.nextJump = lerp(7, 15, this.rng());
    for (let tries = 0; tries < 6 && ready.length; tries++) {
      const f = ready[Math.floor(this.rng() * ready.length)];
      const body = this.ponds.bodyAt(f.x, f.z);
      if (!body?.filled || body.fillT < 1) continue;
      const dist = lerp(0.6, 1.0, this.rng());
      const lx = f.x + Math.cos(f.heading) * dist;
      const lz = f.z + Math.sin(f.heading) * dist;
      if (this.ponds.waterDepth(lx, lz) < 0.25 || this.ponds.bodyAt(lx, lz)?.id !== body.id) continue;
      f.jump = { t: 0, dur: lerp(0.7, 0.85, this.rng()), x0: f.x, z0: f.z, dist, h: lerp(0.32, 0.5, this.rng()), level: body.level, out: false };
      return;
    }
    this.nextJump = 1; // nobody could jump right now; try again shortly
  }

  /** One leap: an arc out of the water and back, nose following the curve. Returns the pitch. */
  private leap(f: Swimmer, dt: number): number {
    const j = f.jump!;
    j.t += dt;
    const u = Math.min(1, j.t / j.dur);
    const rise = j.h + 0.15;
    f.x = j.x0 + Math.cos(f.heading) * j.dist * u;
    f.z = j.z0 + Math.sin(f.heading) * j.dist * u;
    f.y = j.level - 0.15 + rise * Math.sin(Math.PI * u);
    f.phase += dt * 16;
    const above = f.y > j.level;
    if (above !== j.out) {
      j.out = above;
      // Out with a flick of spray; back in with a fuller splash.
      this.splash.burst(f.x, j.level, f.z, above ? 10 : 18, above ? 0.8 : 1.0);
      this.ponds.addRipple(f.x, f.z, above ? 0.8 : 1.2);
      this.onSplash(above ? 0.6 : 1);
    }
    if (u >= 1) {
      f.jump = null;
      f.speed = f.cruise * 1.5;
    }
    return Math.atan((rise * Math.PI * Math.cos(Math.PI * u)) / j.dist) * 0.9;
  }
}
