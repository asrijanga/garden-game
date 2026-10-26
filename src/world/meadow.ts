import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise2D } from '../core/noise';
import { createRng, lerp } from '../core/random';
import { addWind } from '../render/wind';
import type { Ground } from './ground';
import type { Season } from './season';

const SITES = 1500;
const GROW_PER_SECOND = 1.3; // the meadow fills over ~20 minutes of play
const CHECKS_PER_FRAME = 40;

type Rng = () => number;

function colored(g: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g.index ? g.toNonIndexed() : g;
}

/**
 * A little clump of wildflowers, ~25 cm tall: thin stems, a couple of leaves, and a few blooms
 * of one kind. Bloom petals are white in the geometry and take their colour from the instance;
 * hearts, stems and leaves keep theirs (slightly tinted, which only warms them a touch).
 */
function clumpGeometry(rng: Rng, kind: 'disc' | 'cup' | 'bell' | 'spray'): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stemC = new THREE.Color('#5e8e3e');
  const leafC = new THREE.Color('#6a9c45');
  const white = new THREE.Color('#ffffff');
  const heart = new THREE.Color(kind === 'disc' ? '#f2c230' : '#3a3020');
  const n = kind === 'spray' ? 5 : 4;
  for (let i = 0; i < n; i++) {
    const h = lerp(0.14, 0.28, rng());
    const x = (rng() - 0.5) * 0.12;
    const z = (rng() - 0.5) * 0.12;
    const lean = (rng() - 0.5) * 0.4;
    const stem = new THREE.PlaneGeometry(0.008, h, 1, 2).translate(0, h / 2, 0);
    stem.rotateZ(lean * 0.3);
    stem.rotateY(rng() * 3);
    stem.translate(x, 0, z);
    parts.push(colored(stem, stemC));
    const top = new THREE.Vector3(x - Math.sin(lean * 0.3) * h, h, z);
    if (kind === 'disc') {
      const petals = new THREE.CircleGeometry(lerp(0.026, 0.036, rng()), 9).rotateX(-Math.PI / 2 + 0.3).translate(top.x, top.y, top.z);
      parts.push(colored(petals, white));
      parts.push(colored(new THREE.CircleGeometry(0.009, 6).rotateX(-Math.PI / 2 + 0.3).translate(top.x, top.y + 0.003, top.z + 0.001), heart));
    } else if (kind === 'cup') {
      const cup = new THREE.ConeGeometry(0.026, 0.03, 6, 1, true).rotateX(Math.PI).translate(top.x, top.y + 0.012, top.z);
      parts.push(colored(cup, white));
      parts.push(colored(new THREE.CircleGeometry(0.008, 5).rotateX(-Math.PI / 2).translate(top.x, top.y + 0.006, top.z), heart));
    } else if (kind === 'bell') {
      for (let b = 0; b < 3; b++) {
        const bell = new THREE.ConeGeometry(0.012, 0.025, 5, 1, true).translate(top.x + 0.012 * (b - 1), top.y - b * 0.03, top.z);
        parts.push(colored(bell, white));
      }
    } else {
      for (let b = 0; b < 4; b++) {
        const dot = new THREE.IcosahedronGeometry(0.012, 0).translate(top.x + (rng() - 0.5) * 0.04, top.y + (rng() - 0.5) * 0.02, top.z + (rng() - 0.5) * 0.04);
        parts.push(colored(dot, white));
      }
    }
  }
  for (let l = 0; l < 2; l++) {
    const leaf = new THREE.CircleGeometry(0.035, 5).scale(0.45, 1, 1).rotateX(-Math.PI / 2 + 0.7).rotateY(rng() * 6).translate((rng() - 0.5) * 0.1, 0.03, (rng() - 0.5) * 0.1);
    parts.push(colored(leaf, leafC));
  }
  return mergeGeometries(parts);
}

/** What flowers the meadow brings in each season: [shape, colours]. */
const SEASONAL: Record<Season, ['disc' | 'cup' | 'bell' | 'spray', string[]][]> = {
  spring: [['disc', ['#ffffff', '#fff4f6']], ['cup', ['#f6d743', '#f9e36a']], ['bell', ['#7d8ee0', '#9aa6ea']], ['spray', ['#f6f1e4']]],
  summer: [['cup', ['#e8402f', '#f05b3a']], ['disc', ['#ffffff']], ['disc', ['#5e7fe0', '#6f8cf0']], ['spray', ['#f3e9d6', '#e9c6d6']]],
  autumn: [['disc', ['#9b7fd6', '#b49be6', '#c78bc9']], ['spray', ['#f1e7cf', '#e6d6b8']], ['cup', ['#f2b51c']], ['disc', ['#ffffff']]],
  winter: [['bell', ['#ffffff', '#f4f6ff']], ['spray', ['#f1ede6']]],
};

interface Site {
  x: number;
  z: number;
  mesh: THREE.InstancedMesh;
  index: number;
  m: THREE.Matrix4;
  /** 0 → not there; 1 → fully grown. */
  scale: number;
  want: number;
}

/**
 * The untended meadow reclaiming the lawn. A fixed, seeded set of sites (in drifts, each drift
 * one kind of flower) fills in slowly as you play, spreading out from where it starts; anything
 * you build keeps them away, and when you tidy something up, they creep back in.
 */
export class Meadow {
  readonly group = new THREE.Group();
  private readonly sites: Site[] = [];
  private cursor = 0;
  /** How many sites (in growth order) are allowed to bloom so far. */
  grown = 0;
  private readonly m = new THREE.Matrix4();
  private readonly sc = new THREE.Matrix4();

  constructor(
    ground: Ground,
    season: Season,
    seed: number,
    private readonly blocked: (x: number, z: number) => boolean,
  ) {
    const rng = createRng(seed);
    const kinds = SEASONAL[season];
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    addWind(mat, 'clamp(position.y * 4.0, 0.0, 1.0)', undefined, 0.6);
    const meshes = kinds.map(([kind], k) => {
      const mesh = new THREE.InstancedMesh(clumpGeometry(createRng(seed + 10 + k), kind), mat, SITES);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    });
    // Drifts: a centre, a kind and a colour, with a dozen or so clumps scattered round it.
    const order = createNoise2D(seed + 3);
    const raw: { x: number; z: number; k: number; tint: THREE.Color; key: number }[] = [];
    let guard = 0;
    while (raw.length < SITES && guard++ < SITES * 20) {
      const cx = (rng() * 2 - 1) * 20;
      const cz = (rng() * 2 - 1) * 20;
      const k = Math.floor(rng() * kinds.length);
      const colours = kinds[k][1];
      const tintHex = colours[Math.floor(rng() * colours.length)];
      const n = 6 + Math.floor(rng() * 14);
      const spread = lerp(0.7, 1.6, rng());
      for (let i = 0; i < n && raw.length < SITES; i++) {
        const a = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * spread;
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        if (ground.forestness(x, z) > 0.25) continue;
        // Growth spreads in slow waves: low "order" noise blooms first.
        raw.push({ x, z, k, tint: new THREE.Color(tintHex).multiplyScalar(lerp(0.9, 1.05, rng())), key: order(x * 0.09, z * 0.09) + rng() * 0.35 });
      }
    }
    raw.sort((a, b) => a.key - b.key);
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (const r of raw) {
      const mesh = meshes[r.k];
      const index = mesh.count++;
      mesh.setColorAt(index, r.tint);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(r.x, ground.heightAt(r.x, r.z) - 0.01, r.z), q.setFromEuler(e.set(0, rng() * 6.28, 0)), new THREE.Vector3(1, 1, 1).multiplyScalar(lerp(1.5, 2.1, rng())));
      this.sites.push({ x: r.x, z: r.z, mesh, index, m, scale: 0, want: 0 });
      mesh.setMatrixAt(index, this.m.makeScale(0, 0, 0));
    }
    for (const mesh of meshes) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** Pick up where the meadow was (its growth is remembered across visits, not in the save). */
  setGrown(n: number) {
    this.grown = Math.max(0, Math.min(this.sites.length, n || 0));
  }

  private write(s: Site) {
    const k = Math.max(0.0001, s.scale);
    this.m.copy(s.m).multiply(this.sc.makeScale(k, k, k));
    s.mesh.setMatrixAt(s.index, this.m);
    s.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt: number) {
    this.grown = Math.min(this.sites.length, this.grown + dt * GROW_PER_SECOND);
    const limit = Math.floor(this.grown);
    // Walk round the sites a few at a time: grown and unbuilt-on → bloom; built over → fade.
    for (let c = 0; c < CHECKS_PER_FRAME && this.sites.length; c++) {
      const i = this.cursor;
      this.cursor = (i + 1) % this.sites.length;
      const s = this.sites[i];
      s.want = i < limit && !this.blocked(s.x, s.z) ? 1 : 0;
    }
    for (let i = 0; i < Math.min(this.sites.length, limit); i++) {
      const s = this.sites[i];
      if (s.scale === s.want) continue;
      // Spring up gently; when something's built, step aside quickly.
      s.scale = s.want > s.scale ? Math.min(1, s.scale + dt * 0.5) : Math.max(0, s.scale - dt * 3);
      this.write(s);
    }
  }
}
