import * as THREE from 'three';
import { addWet } from '../render/wet';
import { touch } from '../render/touch';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng, lerp } from '../core/random';
import { regrow } from '../core/regrow';

const SHAPES = 10;
const CAPACITY = 400; // per shape
const MOSS_TIME = 150; // seconds for moss to creep over a new rock's top

/**
 * A weathered boulder, unit-sized: a lumpy, softly faceted stone with a flatter base, a few
 * worn planes where it split, and faint strata in its grey. Every shape is different.
 */
function boulderGeometry(seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(0.5, 3);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const bumps = Array.from({ length: 7 }, () => ({ d: new THREE.Vector3(rng() - 0.5, rng() - 0.3, rng() - 0.5).normalize(), a: lerp(-0.1, 0.16, rng()) }));
  // A few split faces: the rock is shaved flat where a plane cuts through it.
  const cuts = Array.from({ length: 3 + Math.floor(rng() * 3) }, () => ({ n: new THREE.Vector3(rng() - 0.5, rng() * 0.8, rng() - 0.5).normalize(), d: lerp(0.36, 0.46, rng()) }));
  const sx = lerp(0.85, 1.35, rng());
  const sz = lerp(0.75, 1.1, rng());
  const sy = lerp(0.8, 1.1, rng());
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const dir = v.clone().normalize();
    let k = 1;
    for (const b of bumps) k += b.a * Math.max(0, dir.dot(b.d)) ** 2;
    v.multiplyScalar(k);
    for (const c of cuts) {
      const over = v.dot(c.n) - c.d;
      if (over > 0) v.addScaledVector(c.n, -over * 0.85);
    }
    v.set(v.x * sx, v.y > 0 ? v.y * sy : v.y * 0.55, v.z * sz);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  // Grey stone, a touch warmer low down, with faint strata bands.
  const col = new Float32Array(pos.count * 3);
  const tilt = rng() * 0.6;
  const phase = rng() * 6;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const band = Math.sin((y + pos.getX(i) * tilt) * 26 + phase) * 0.5 + 0.5;
    // Mid grey: lit stone should read as stone, not bleach white in the sun.
    const t = 0.5 + band * 0.08 + Math.min(0.1, Math.max(0, y) * 0.2);
    col[i * 3] = t * 1.02;
    col[i * 3 + 1] = t;
    col[i * 3 + 2] = t * 0.96;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

interface Rock {
  mesh: THREE.InstancedMesh;
  index: number;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: THREE.Vector3;
  size: number;
  delay: number;
  t: number;
  landed: boolean;
  gone?: boolean;
}

/**
 * Rocks and boulders placed by the player. Each settles with a thud and, over the next couple
 * of minutes, moss creeps over its top (in soft patches, on the faces that look up at the sky).
 */
export class Boulders {
  readonly group = new THREE.Group();
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly rocks: Rock[] = [];
  private readonly falling = new Set<Rock>();
  private readonly leaving: { rock: Rock; t: number }[] = [];
  private rng = createRng(2024);
  private readonly uniforms = { uMossTime: { value: 0 } };
  private readonly m = new THREE.Matrix4();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();

  constructor(private readonly onLand: (at: THREE.Vector3, size: number) => void) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    mat.customProgramCacheKey = () => 'boulder';
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aMossStart;\nuniform float uMossTime;\nvarying float vMoss;\nvarying vec3 vRockPos;\nvarying vec3 vUpN;')
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          vMoss = smoothstep(0.0, ${MOSS_TIME.toFixed(1)}, uMossTime - aMossStart);
          vRockPos = position * 3.0;
          // Which way this bit of rock faces in the world (moss likes the sky).
          vUpN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
          varying float vMoss;
          varying vec3 vRockPos;
          varying vec3 vUpN;
          float mHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
          float mNoise(vec3 p) {
            vec3 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(mHash(i), mHash(i + vec3(1, 0, 0)), f.x), mix(mHash(i + vec3(0, 1, 0)), mHash(i + vec3(1, 1, 0)), f.x), f.y),
                       mix(mix(mHash(i + vec3(0, 0, 1)), mHash(i + vec3(1, 0, 1)), f.x), mix(mHash(i + vec3(0, 1, 1)), mHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
          }`,
        )
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          // Lichen speckle on the stone.
          float speck = mNoise(vRockPos * 9.0);
          diffuseColor.rgb *= 0.9 + speck * 0.16;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 1.06, 0.86), smoothstep(0.82, 0.9, mNoise(vRockPos * 4.0 + 7.0)) * 0.5);
          // Moss: soft cushions on the upward faces, spreading as the rock ages.
          float patches = mNoise(vRockPos * 2.2) * 0.7 + mNoise(vRockPos * 6.0) * 0.3;
          float up = smoothstep(0.25, 0.75, vUpN.y);
          // Even fully grown it stays in cushions on the tops, never a blanket.
          float moss = smoothstep(1.05 - vMoss * 0.45, 1.17 - vMoss * 0.45, patches * 0.7 + up * 0.45) * up;
          vec3 mossCol = mix(vec3(0.16, 0.22, 0.08), vec3(0.28, 0.35, 0.13), mNoise(vRockPos * 14.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, mossCol, moss * 0.85);`,
        );
    };
    addWet(mat, 0.7);
    for (let k = 0; k < SHAPES; k++) {
      const geo = boulderGeometry(4100 + k * 37);
      geo.setAttribute('aMossStart', new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY).fill(1e9), 1));
      const mesh = new THREE.InstancedMesh(geo, mat, CAPACITY);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
  }

  /** Back to an untouched garden (before an undo replays what remains). */
  reset() {
    for (const m of this.meshes) m.count = 0;
    this.rocks.length = 0;
    this.falling.clear();
    this.leaving.length = 0;
    this.rng = createRng(2024);
  }

  get busy(): boolean {
    return this.falling.size > 0 || this.leaving.length > 0;
  }

  /** Is there a rock whose footprint overlaps a circle of radius r at (x, z)? */
  occupied(x: number, z: number, r: number): boolean {
    return this.rocks.some((k) => !k.gone && (k.pos.x - x) ** 2 + (k.pos.z - z) ** 2 < (r + k.size * 0.42) ** 2);
  }

  /** Place a rock about `size` metres across, sunk a little into the ground at height y. */
  add(x: number, y: number, z: number, size: number, delay: number) {
    const mesh = this.meshes[Math.floor(this.rng() * SHAPES)];
    if (mesh.count >= CAPACITY) return;
    const index = mesh.count++;
    const tone = lerp(0.85, 1.12, this.rng());
    const warm = (this.rng() - 0.5) * 0.06;
    mesh.setColorAt(index, new THREE.Color(tone * (1 + warm), tone, tone * (1 - warm)));
    if (mesh.instanceColor) touch(mesh.instanceColor, index);
    // Rocks rebuilt from a save are old friends: their moss is already grown.
    const moss = mesh.geometry.attributes.aMossStart as THREE.InstancedBufferAttribute;
    moss.setX(index, regrow.offset > 0 || regrow.instant ? -1e4 : this.uniforms.uMossTime.value + delay + this.rng() * 20);
    touch(moss, index);
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler((this.rng() - 0.5) * 0.35, this.rng() * Math.PI * 2, (this.rng() - 0.5) * 0.35));
    const scale = new THREE.Vector3(size * lerp(0.85, 1.15, this.rng()), size * lerp(0.8, 1.2, this.rng()), size * lerp(0.85, 1.15, this.rng()));
    const rock: Rock = { mesh, index, pos: new THREE.Vector3(x, y - size * lerp(0.05, 0.12, this.rng()), z), quat, scale, size, delay: delay + regrow.offset, t: 0, landed: false };
    this.rocks.push(rock);
    this.falling.add(rock);
    this.write(rock, 0.0001, 0);
  }

  erase(x: number, z: number, r: number): THREE.Vector3[] {
    const at: THREE.Vector3[] = [];
    for (const k of this.rocks) {
      if (k.gone || (k.pos.x - x) ** 2 + (k.pos.z - z) ** 2 > (r + k.size * 0.3) ** 2) continue;
      k.gone = true;
      this.falling.delete(k);
      this.leaving.push({ rock: k, t: 0 });
      at.push(k.pos);
    }
    return at;
  }

  private write(k: Rock, scale: number, lift: number, squash = 0) {
    this.s.copy(k.scale).multiplyScalar(scale);
    this.s.set(this.s.x * (1 + squash * 0.3), this.s.y * (1 - squash), this.s.z * (1 + squash * 0.3));
    this.m.compose(this.p.copy(k.pos).setY(k.pos.y + lift), k.quat, this.s);
    k.mesh.setMatrixAt(k.index, this.m);
    touch(k.mesh.instanceMatrix, k.index);
  }

  update(dt: number) {
    this.uniforms.uMossTime.value += dt;
    for (const k of this.falling) {
      if (k.delay > 0) {
        k.delay -= dt;
        continue;
      }
      k.t += dt;
      // Heavier rocks fall a touch slower and land harder.
      const fall = 0.3 + k.size * 0.05;
      if (k.t < fall) {
        const a = k.t / fall;
        this.write(k, lerp(0.75, 1, a), (1 - a * a) * (0.6 + k.size * 0.4));
      } else {
        if (!k.landed) {
          k.landed = true;
          this.onLand(k.pos, k.size);
        }
        const s = k.t - fall;
        this.write(k, 1, Math.max(0, Math.exp(-s * 10) * Math.sin(s * 20)) * 0.02 * k.size, Math.exp(-s * 9) * Math.cos(s * 24) * 0.14);
        if (s > 0.6) {
          this.write(k, 1, 0);
          this.falling.delete(k);
        }
      }
    }
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const l = this.leaving[i];
      l.t = Math.min(1, l.t + dt / 0.5);
      if (l.t >= 1) {
        this.m.makeScale(0, 0, 0);
        l.rock.mesh.setMatrixAt(l.rock.index, this.m);
        touch(l.rock.mesh.instanceMatrix, l.rock.index);
        this.leaving.splice(i, 1);
      } else this.write(l.rock, 1 - l.t * l.t, -l.t * l.rock.size * 0.6);
    }
  }
}
