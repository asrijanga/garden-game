import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng, lerp } from '../core/random';
import { regrow } from '../core/regrow';
import type { Season } from './season';

export type VineKind = 'rose' | 'clematis' | 'honeysuckle' | 'ivy' | 'wisteria';

const STEP = 0.07; // metres of stem between leaf nodes
/** Storybook scale (like the birds and bees): life-size leaves and roses vanish from the garden camera. */
const BIG = 2.3;
const CAP = { stem: 9000, leaf: 14000, ivy: 9000, rose: 2400, star: 2400, trumpet: 2400, raceme: 1200 };

type Part = keyof typeof CAP;

function colored(g: THREE.BufferGeometry, c: THREE.Color | string): THREE.BufferGeometry {
  const col = new THREE.Color(c);
  const g2 = g.index ? g.toNonIndexed() : g;
  if (g2.attributes.uv) g2.deleteAttribute('uv');
  const n = g2.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  g2.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g2;
}

/** The pieces, all built along +y from the origin (so they grow out from where they're attached). */
function geometries(): Record<Part, THREE.BufferGeometry> {
  // A stem section: a thin tapering twig, one unit long (scaled to its length).
  const stem = colored(new THREE.CylinderGeometry(0.0045, 0.0055, 1, 4, 1, true).translate(0, 0.5, 0), '#ffffff');
  // An oval leaf on a short stalk, cupped a little.
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.quadraticCurveTo(0.024, 0.02, 0.012, 0.045);
  leafShape.quadraticCurveTo(0.004, 0.056, 0, 0.06);
  leafShape.quadraticCurveTo(-0.004, 0.056, -0.012, 0.045);
  leafShape.quadraticCurveTo(-0.024, 0.02, 0, 0);
  const leaf = colored(new THREE.ShapeGeometry(leafShape, 4).translate(0, 0.006, 0), '#ffffff');
  // Ivy: a three-pointed leaf.
  const ivyShape = new THREE.Shape();
  ivyShape.moveTo(0, 0);
  ivyShape.lineTo(0.03, 0.022);
  ivyShape.lineTo(0.016, 0.03);
  ivyShape.lineTo(0.012, 0.055);
  ivyShape.lineTo(0, 0.042);
  ivyShape.lineTo(-0.012, 0.055);
  ivyShape.lineTo(-0.016, 0.03);
  ivyShape.lineTo(-0.03, 0.022);
  ivyShape.closePath();
  const ivy = colored(new THREE.ShapeGeometry(ivyShape).translate(0, 0.004, 0), '#ffffff');
  // A rose: overlapping cupped petals round a tight heart (tinted by the instance colour).
  const roseParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    roseParts.push(colored(new THREE.SphereGeometry(0.016, 5, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 0.7).rotateX(-0.9).translate(0, 0.004, 0.011).rotateY(a), '#ffffff'));
  }
  roseParts.push(colored(new THREE.SphereGeometry(0.012, 6, 4).scale(1, 0.85, 1).translate(0, 0.012, 0), '#f2dfe2'));
  const rose = mergeGeometries(roseParts); // opens toward +y
  // A clematis star: six pointed petals and a pale boss.
  const starShape = new THREE.Shape();
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = i % 2 ? 0.012 : 0.032;
    if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const star = mergeGeometries([colored(new THREE.ShapeGeometry(starShape), '#ffffff'), colored(new THREE.CircleGeometry(0.008, 6).translate(0, 0, 0.002), '#f6eecb')]).rotateX(-Math.PI / 2);
  // Honeysuckle: a little whorl of slender trumpets.
  const trumpets: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const t = new THREE.ConeGeometry(0.006, 0.04, 5, 1, true).translate(0, 0.02, 0).rotateZ(0.9).rotateY((i / 6) * Math.PI * 2);
    trumpets.push(colored(t, '#ffffff'));
  }
  const trumpet = mergeGeometries(trumpets);
  // Wisteria: a long hanging cone of little blossoms (hangs down -y; its colour from the instance).
  const blossoms: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const r = 0.03 * (1 - t * 0.75);
    const a = i * 2.4;
    blossoms.push(colored(new THREE.IcosahedronGeometry(0.013 * (1 - t * 0.4), 0).translate(Math.cos(a) * r, -t * 0.2, Math.sin(a) * r), new THREE.Color(1, 1, 1).multiplyScalar(1 - t * 0.12)));
  }
  const raceme = mergeGeometries(blossoms);
  return { stem, leaf, ivy, rose, star, trumpet, raceme };
}

/** What grows on each kind of vine: its leaves, its flowers (and their colours), and how it grows. */
const KINDS: Record<VineKind, { leaf: Part; bloom: Part | null; colours: string[]; stem: string; leafTone: string[]; blooms: number; leaves: number; size: number }> = {
  rose: { leaf: 'leaf', bloom: 'rose', colours: ['#e46f86', '#f2a0b2', '#c9405c', '#fbd0d8', '#fff4f0'], stem: '#5a6a3a', leafTone: ['#4f7f33', '#5a8a3a', '#46752e'], blooms: 0.5, leaves: 1.6, size: 1 },
  clematis: { leaf: 'leaf', bloom: 'star', colours: ['#8a6ac8', '#b48ae0', '#f4eef8', '#c45a8a'], stem: '#6a5a3a', leafTone: ['#5f8f3c', '#6a9a45'], blooms: 0.45, leaves: 1.3, size: 0.85 },
  honeysuckle: { leaf: 'leaf', bloom: 'trumpet', colours: ['#f6e6b0', '#f2c86a', '#f4d8c8'], stem: '#7a5a3a', leafTone: ['#6a9a4a', '#5f8f40'], blooms: 0.4, leaves: 1.4, size: 0.8 },
  ivy: { leaf: 'ivy', bloom: null, colours: [], stem: '#5a4a32', leafTone: ['#2f5a2a', '#3a6a30', '#28502a', '#46783a'], blooms: 0, leaves: 2.6, size: 1.0 },
  wisteria: { leaf: 'leaf', bloom: 'raceme', colours: ['#a48ad8', '#b9a2e6', '#8f78cc', '#d6cdf2'], stem: '#6e5a44', leafTone: ['#7aa04a', '#6a9440'], blooms: 0.7, leaves: 1.2, size: 1.1 },
};

/** How much each season flowers (ivy and the leaves carry on regardless). */
const BLOOMING: Record<Season, number> = { spring: 0.75, summer: 1, autumn: 0.45, winter: 0 };

export interface ClimbOptions {
  kind: VineKind;
  /** Who it belongs to (a fence stretch's id; the cottage uses -1), for tidying it away. */
  owner: number;
  seed: number;
  /** Seconds from now before it starts to creep (ignored when the garden is being rebuilt). */
  delay?: number;
  /** Metres per second it creeps along its path. */
  speed?: number;
  /** Wind round the path (around a rail or post) with this radius… */
  wrap?: number;
  /** …or lie on a surface facing this way, wandering from side to side across it. */
  face?: THREE.Vector3;
  /** A side shoot (which doesn't put out shoots of its own). */
  shoot?: boolean;
}

interface Placed {
  part: Part;
  index: number;
  x: number;
  z: number;
  owner: number;
}

/**
 * Climbers: stems that creep along fences, walls and the cottage, putting out leaves as they
 * go, then roses (or clematis, honeysuckle, wisteria) opening along them. Everything is grown
 * in the shader from each piece's start time, so a long vine costs nothing per frame. Pieces
 * from a rebuilt garden are already fully grown.
 */
export class Vines {
  readonly group = new THREE.Group();
  private readonly meshes = {} as Record<Part, THREE.InstancedMesh>;
  private readonly life = {} as Record<Part, THREE.InstancedBufferAttribute>;
  private readonly placed: Placed[] = [];
  private readonly uniforms = { uVineTime: { value: 0 } };
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly bloomRate: number;

  constructor(season: Season) {
    this.bloomRate = BLOOMING[season];
    const geos = geometries();
    for (const part of Object.keys(CAP) as Part[]) {
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      mat.customProgramCacheKey = () => 'vine';
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uVineTime = this.uniforms.uVineTime;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec2 aLife;\nuniform float uVineTime;')
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            // Unfurl from nothing once its time comes; wither away when tidied up.
            float grow = smoothstep(aLife.x, aLife.x + 1.6, uVineTime);
            grow *= 1.0 - smoothstep(aLife.y, aLife.y + 0.6, uVineTime);
            transformed *= grow * (2.0 - grow);`,
          );
      };
      const mesh = new THREE.InstancedMesh(geos[part], mat, CAP[part]);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      const life = new THREE.InstancedBufferAttribute(new Float32Array(CAP[part] * 2), 2);
      geos[part].setAttribute('aLife', life);
      this.group.add(mesh);
      this.meshes[part] = mesh;
      this.life[part] = life;
    }
  }

  private add(part: Part, pos: THREE.Vector3, dir: THREE.Vector3, roll: number, scale: THREE.Vector3, color: THREE.Color, start: number, owner: number) {
    const mesh = this.meshes[part];
    if (mesh.count >= CAP[part]) return;
    const i = mesh.count++;
    this.q.setFromUnitVectors(this.up, dir.clone().normalize());
    this.q.multiply(new THREE.Quaternion().setFromAxisAngle(this.up, roll));
    mesh.setMatrixAt(i, this.m.compose(pos, this.q, scale));
    mesh.setColorAt(i, color);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.life[part].setXY(i, start, 1e9);
    this.life[part].needsUpdate = true;
    this.placed.push({ part, index: i, x: pos.x, z: pos.z, owner });
  }

  /**
   * Grow a vine along `path` (world points, in order from where it starts). It creeps along at
   * its own pace, wandering off the line a little, with leaves, now and then a side shoot, and
   * flowers opening behind the growing tip.
   */
  climb(path: THREE.Vector3[], o: ClimbOptions) {
    if (path.length < 2) return;
    const rng = createRng(o.seed);
    const kind = KINDS[o.kind];
    const rebuilt = regrow.instant || regrow.offset > 0;
    const t0 = rebuilt ? -1e4 : this.uniforms.uVineTime.value + (o.delay ?? 0);
    const speed = o.speed ?? 0.06;
    // Walk the path at even steps.
    const lens = [0];
    for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + path[i].distanceTo(path[i - 1]));
    const total = lens[lens.length - 1];
    const at = (s: number, out: THREE.Vector3) => {
      let i = 1;
      while (i < lens.length - 1 && lens[i] < s) i++;
      const k = (s - lens[i - 1]) / Math.max(1e-6, lens[i] - lens[i - 1]);
      return out.lerpVectors(path[i - 1], path[i], Math.min(1, Math.max(0, k)));
    };
    const stemTone = new THREE.Color(kind.stem);
    const phase = rng() * 10;
    const twist = lerp(9, 14, rng());
    const prev = new THREE.Vector3();
    const cur = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const n1 = new THREE.Vector3();
    const n2 = new THREE.Vector3();
    const off = new THREE.Vector3();
    let first = true;
    for (let s = 0; s <= total; s += STEP * lerp(0.85, 1.15, rng())) {
      at(s, cur);
      at(Math.min(total, s + 0.02), tangent).sub(at(Math.max(0, s - 0.02), n1));
      if (tangent.lengthSq() < 1e-8) tangent.set(1, 0, 0);
      tangent.normalize();
      // Two directions across the path to wander in.
      if (o.face) {
        n2.copy(o.face).normalize();
        n1.crossVectors(tangent, n2).normalize();
        off.copy(n1).multiplyScalar(Math.sin(s * 5 + phase) * 0.05 + Math.sin(s * 13 + phase * 2) * 0.015).addScaledVector(n2, 0.02);
      } else {
        n1.crossVectors(tangent, Math.abs(tangent.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : this.up).normalize();
        n2.crossVectors(tangent, n1).normalize();
        const a = s * twist + phase;
        const r = o.wrap ?? 0.03;
        off.copy(n1).multiplyScalar(Math.cos(a) * r).addScaledVector(n2, Math.sin(a) * r);
      }
      cur.add(off);
      const start = t0 + s / speed + rng() * 0.6;
      if (!first) {
        const d = cur.clone().sub(prev);
        const len = d.length();
        if (len > 1e-4) this.add('stem', prev, d, 0, this.s.set(BIG * 0.8, len * 1.05, BIG * 0.8), stemTone, start - STEP / speed, o.owner);
      }
      first = false;
      prev.copy(cur);
      // Leaves: on short stalks, out from the stem, every which way (ivy lies flatter and thicker).
      const leaves = Math.floor(kind.leaves + rng());
      for (let l = 0; l < leaves; l++) {
        const dir = o.face && o.kind === 'ivy'
          ? o.face.clone().multiplyScalar(0.6).addScaledVector(n1, (rng() - 0.5) * 1.6).add(this.up.clone().multiplyScalar(0.3 + rng() * 0.4))
          : n1.clone().multiplyScalar(rng() < 0.5 ? -1 : 1).addScaledVector(n2, (rng() - 0.5) * 1.4).add(this.up.clone().multiplyScalar(rng() * 0.6));
        const k = BIG * kind.size * lerp(0.75, 1.25, rng());
        const tones = kind.leafTone;
        const tone = new THREE.Color(tones[Math.floor(rng() * tones.length)]).multiplyScalar(lerp(0.88, 1.08, rng()));
        this.add(kind.leaf, cur, dir, rng() * 6.28, this.s.set(k, k, k), tone, start + 0.4 + rng() * 1.5, o.owner);
      }
      // Flowers open a while after the stem has passed, in little clusters.
      if (kind.bloom && rng() < kind.blooms * this.bloomRate) {
        const n = kind.bloom === 'raceme' ? 1 : 1 + Math.floor(rng() * 2);
        for (let b = 0; b < n; b++) {
          const dir = kind.bloom === 'raceme' ? this.up.clone() : (o.face ? o.face.clone() : n1.clone().multiplyScalar(rng() < 0.5 ? -1 : 1)).add(this.up.clone().multiplyScalar(0.4)).addScaledVector(n2, (rng() - 0.5) * 0.8);
          const p = cur.clone().addScaledVector(dir.clone().normalize(), kind.bloom === 'raceme' ? 0 : 0.03).add(new THREE.Vector3((rng() - 0.5) * 0.08, (rng() - 0.5) * 0.06, (rng() - 0.5) * 0.08));
          if (kind.bloom === 'raceme') p.y -= 0.01;
          const k = BIG * lerp(0.8, 1.25, rng()) * (kind.bloom === 'raceme' ? lerp(0.8, 1.3, rng()) : 1);
          const colour = new THREE.Color(kind.colours[Math.floor(rng() * kind.colours.length)]).multiplyScalar(lerp(0.92, 1.05, rng()));
          this.add(kind.bloom, p, dir, rng() * 6.28, this.s.set(k, k, k), colour, start + lerp(5, 14, rng()), o.owner);
        }
      }
      // Now and then a side shoot wanders off for a hand's length or two.
      if (!o.face && !o.shoot && rng() < 0.05 && total - s > 0.3) {
        const branch = [cur.clone()];
        const drop = rng() < 0.6 ? -1 : 1;
        for (let k = 1; k <= 4; k++) branch.push(cur.clone().addScaledVector(n1, (k * 0.04) * (rng() < 0.5 ? -1 : 1)).add(new THREE.Vector3(0, drop * k * 0.05, 0)));
        this.climb(branch, { ...o, seed: o.seed + Math.floor(s * 1000), delay: rebuilt ? 0 : start - this.uniforms.uVineTime.value, wrap: 0.005, shoot: true });
      }
    }
  }

  /** Let the vines on fences and walls within `r` of (x, z) wither away (the cottage's stay). */
  erase(x: number, z: number, r: number): number {
    return this.wither((p) => p.owner >= 0 && (p.x - x) ** 2 + (p.z - z) ** 2 < r * r);
  }

  /** Let all of one owner's vines wither (a fence stretch rebuilt, the cottage restyled). */
  removeOwner(owner: number, now = false) {
    this.wither((p) => p.owner === owner, now);
  }

  private wither(test: (p: Placed) => boolean, now = false): number {
    const t = now ? -1e4 : this.uniforms.uVineTime.value;
    let n = 0;
    for (let i = this.placed.length - 1; i >= 0; i--) {
      const p = this.placed[i];
      if (!test(p)) continue;
      const life = this.life[p.part];
      life.setY(p.index, Math.min(life.getY(p.index), t));
      life.needsUpdate = true;
      this.placed.splice(i, 1);
      n++;
    }
    return n;
  }

  reset() {
    this.placed.length = 0;
    for (const part of Object.keys(CAP) as Part[]) this.meshes[part].count = 0;
  }

  update(dt: number) {
    this.uniforms.uVineTime.value += dt;
  }
}
