import * as THREE from 'three';
import { makeCanvas } from '../engine/env';
import { createRng, lerp } from '../core/random';
import type { Season } from './season';

/** Storybook scale: wings ~20 cm across, so they read from the garden camera. */
const SCALE = 3.6;
const MAX = 12;
const CELL = 128; // atlas cell (one wing pair's right half: forewing + hindwing), pixels

type Ctx = CanvasRenderingContext2D;

/** A wing outline: forewing and hindwing (and tails), in cell pixels, hinge on the left, front up. */
interface Shape {
  fore: number; // forewing reach (0..1 of the cell)
  sweep: number; // how far forward the forewing tip sits
  hind: number; // hindwing reach
  round: number; // hindwing fullness
  tail?: boolean;
}

interface Kind {
  name: string;
  size: number;
  body: string;
  seasons: Season[];
  /** How likely, relative to the others. */
  weight: number;
  shape: Shape;
  /** Paint the upper side (and the underside, which is often duller). */
  top: (c: Ctx, p: Path2D, s: Shape) => void;
  under: (c: Ctx, p: Path2D, s: Shape) => void;
  /** Glides more, flaps slower (big wings) or flits (small ones). */
  flap: number;
  /** Flowers it particularly likes. */
  likes?: string[];
  shimmer?: boolean;
  glass?: boolean;
}

/** The wing's area, and (as `outer`) just its outer edges, for painting a margin along them. */
type Wing = Path2D & { outer: Path2D };

function wingPath(s: Shape): Wing {
  const p = new Path2D() as Wing;
  const outer = new Path2D();
  const fx = s.fore * 124;
  const fy = 10 + (1 - s.sweep) * 14;
  // Forewing: leading edge out to the tip, the outer edge down, back along the body.
  const fore = (q: Path2D, close: boolean) => {
    q.moveTo(2, 50);
    q.bezierCurveTo(fx * 0.35, 18, fx * 0.75, fy - 4, fx, fy);
    q.bezierCurveTo(fx * 1.02, fy + 22, fx * 0.85, 62, fx * 0.62, 70);
    if (close) {
      q.lineTo(2, 64);
      q.closePath();
    }
  };
  // Hindwing: rounder, below (its top edge tucks under the forewing).
  const hx = s.hind * 112;
  const hind = (q: Path2D, close: boolean) => {
    if (close) {
      q.moveTo(2, 60);
      q.bezierCurveTo(hx * 0.6, 58, hx, 66 + s.round * 4, hx * 0.95, 82 + s.round * 8);
    } else {
      // Only the part of the edge that shows below the forewing.
      q.moveTo(hx * 0.9, 68 + s.round * 3);
      q.bezierCurveTo(hx * 0.98, 72 + s.round * 4, hx, 76 + s.round * 6, hx * 0.95, 82 + s.round * 8);
    }
    if (s.tail) {
      q.bezierCurveTo(hx * 0.85, 98, hx * 0.62, 104, hx * 0.55, 108);
      q.lineTo(hx * 0.5, 126); // the swallowtail's tail
      q.lineTo(hx * 0.42, 108);
      q.bezierCurveTo(hx * 0.3, 106, 10, 98, 3, 88);
    } else {
      q.bezierCurveTo(hx * 0.85, 100 + s.round * 10, hx * 0.35, 104 + s.round * 8, 3, 88);
    }
    if (close) q.closePath();
  };
  fore(p, true);
  hind(p, true);
  fore(outer, false);
  hind(outer, false);
  p.outer = outer;
  return p;
}

// --- Painting helpers (all clipped to the wing) ---
const fill = (c: Ctx, p: Path2D, col: string) => {
  c.fillStyle = col;
  c.fill(p);
};
/** A dark margin round the outer edge (the stroke is half outside, so double the width). */
const border = (c: Ctx, p: Path2D, w: number, col: string) => {
  c.save();
  c.clip(p);
  c.strokeStyle = col;
  c.lineWidth = w * 2;
  c.lineJoin = 'round';
  c.stroke((p as Wing).outer ?? p);
  c.restore();
};
const veins = (c: Ctx, p: Path2D, col: string, w = 1.6) => {
  c.save();
  c.clip(p);
  c.strokeStyle = col;
  c.lineWidth = w;
  for (let i = 0; i < 9; i++) {
    const a = -0.95 + i * 0.27;
    c.beginPath();
    c.moveTo(3, 64);
    c.quadraticCurveTo(50 * Math.cos(a), 64 + 50 * Math.sin(a) - 8, 140 * Math.cos(a), 64 + 140 * Math.sin(a));
    c.stroke();
  }
  c.restore();
};
const dot = (c: Ctx, p: Path2D, x: number, y: number, r: number, col: string) => {
  c.save();
  c.clip(p);
  c.fillStyle = col;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.restore();
};
/** Spots just inside the outer edge, following the wing's outline roughly. */
const edgeDots = (c: Ctx, p: Path2D, s: Shape, col: string, r = 2.2) => {
  const fx = s.fore * 124;
  const hx = s.hind * 112;
  for (let i = 0; i < 7; i++) dot(c, p, fx * (0.55 + i * 0.065), 14 + i * 7.5 + (1 - s.sweep) * 8, r, col);
  for (let i = 0; i < 6; i++) dot(c, p, hx * (0.92 - i * 0.12), 80 + i * 3.5 + s.round * 6, r, col);
};
const band = (c: Ctx, p: Path2D, x0: number, y0: number, x1: number, y1: number, w: number, col: string) => {
  c.save();
  c.clip(p);
  c.strokeStyle = col;
  c.lineWidth = w;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
  c.restore();
};
const eye = (c: Ctx, p: Path2D, x: number, y: number, r: number, rings: string[]) => rings.forEach((col, i) => dot(c, p, x, y, r * (1 - i / rings.length), col));
const shade = (c: Ctx, p: Path2D, col: string, alpha: number) => {
  c.save();
  c.clip(p);
  const g = c.createRadialGradient(0, 64, 4, 0, 64, 70);
  g.addColorStop(0, col);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalAlpha = alpha;
  c.fillStyle = g;
  c.fillRect(0, 0, CELL, CELL);
  c.restore();
};

const S = (fore: number, sweep: number, hind: number, round: number, tail = false): Shape => ({ fore, sweep, hind, round, tail });

const KINDS: Kind[] = [
  {
    name: 'monarch', size: 1.25, body: '#1e1a18', seasons: ['summer', 'autumn'], weight: 1.2, flap: 0.8, shape: S(0.98, 0.7, 0.78, 0.6), likes: ['aster', 'cosmos', 'sedum'],
    top: (c, p, s) => {
      fill(c, p, '#e8771e');
      veins(c, p, '#1e1a18', 2.2);
      border(c, p, 7, '#1e1a18');
      edgeDots(c, p, s, '#f8f2e6', 1.8);
      dot(c, p, s.fore * 108, 22, 3, '#f2b24a');
    },
    under: (c, p, s) => {
      fill(c, p, '#eea05a');
      veins(c, p, '#2a2220', 2);
      border(c, p, 6, '#2a2220');
      edgeDots(c, p, s, '#f8f2e6', 1.6);
    },
  },
  {
    name: 'swallowtail', size: 1.3, body: '#2a2622', seasons: ['spring', 'summer'], weight: 1, flap: 0.85, shape: S(0.95, 0.85, 0.8, 0.4, true), likes: ['salvia', 'lavender'],
    top: (c, p, s) => {
      fill(c, p, '#f5e27a');
      for (let i = 0; i < 5; i++) band(c, p, 12 + i * 15, 10, 4 + i * 12, 70, i % 2 ? 4 : 6, '#24201c');
      border(c, p, 9, '#24201c');
      edgeDots(c, p, s, '#f5e27a', 2.4);
      dot(c, p, s.hind * 60, 100, 5, '#4a7ae0');
      dot(c, p, s.hind * 42, 104, 4, '#e86a2a');
    },
    under: (c, p) => {
      fill(c, p, '#f7eaa6');
      for (let i = 0; i < 5; i++) band(c, p, 12 + i * 15, 10, 4 + i * 12, 70, 3, '#5a5040');
      border(c, p, 6, '#5a5040');
    },
  },
  {
    name: 'blue morpho', size: 1.45, body: '#3a2a20', seasons: ['summer'], weight: 0.5, flap: 0.7, shape: S(1.0, 0.75, 0.82, 0.8), shimmer: true,
    top: (c, p) => {
      fill(c, p, '#2f86f0');
      shade(c, p, '#7fd0ff', 0.6);
      border(c, p, 8, '#141a2a');
      edgeDots(c, p, S(1.0, 0.75, 0.82, 0.8), '#e8f0ff', 1.6);
    },
    under: (c, p) => {
      fill(c, p, '#7a5a3a');
      veins(c, p, '#5a4028', 1.2);
      eye(c, p, 70, 40, 9, ['#f2d08a', '#3a2a20', '#f4ece0']);
      eye(c, p, 60, 92, 10, ['#f2d08a', '#3a2a20', '#f4ece0']);
      eye(c, p, 32, 98, 7, ['#f2d08a', '#3a2a20', '#f4ece0']);
    },
  },
  {
    name: 'painted lady', size: 1.05, body: '#3a3028', seasons: ['spring', 'summer', 'autumn'], weight: 1.2, flap: 1, shape: S(0.92, 0.8, 0.74, 0.55), likes: ['cosmos', 'aster', 'lavender'],
    top: (c, p, s) => {
      fill(c, p, '#e8925a');
      shade(c, p, '#a85a32', 0.6);
      c.save();
      c.clip(p);
      c.fillStyle = '#2a2420';
      c.fillRect(s.fore * 70, 0, 80, 46);
      c.restore();
      dot(c, p, s.fore * 98, 20, 4, '#f8f2e6');
      dot(c, p, s.fore * 86, 32, 3.5, '#f8f2e6');
      dot(c, p, s.fore * 108, 30, 2.5, '#f8f2e6');
      for (let i = 0; i < 4; i++) dot(c, p, s.hind * (0.85 - i * 0.16) * 112, 86 + i * 2, 3, '#2a2420');
    },
    under: (c, p) => {
      fill(c, p, '#d9b48c');
      eye(c, p, 70, 90, 6, ['#4a6aa8', '#f2d08a']);
      eye(c, p, 48, 96, 5, ['#4a6aa8', '#f2d08a']);
      veins(c, p, '#9a7a5a', 1);
    },
  },
  {
    name: 'cabbage white', size: 0.95, body: '#3a3a36', seasons: ['spring', 'summer', 'autumn'], weight: 1.4, flap: 1.1, shape: S(0.88, 0.75, 0.72, 0.6),
    top: (c, p, s) => {
      fill(c, p, '#f6f3e8');
      c.save();
      c.clip(p);
      c.fillStyle = '#3a3834';
      c.beginPath();
      c.arc(s.fore * 124, 14, 22, 0, Math.PI * 2);
      c.fill();
      c.restore();
      dot(c, p, s.fore * 70, 40, 5, '#3a3834');
    },
    under: (c, p) => fill(c, p, '#eef0d8'),
  },
  {
    name: 'brimstone', size: 1.05, body: '#7a7a3a', seasons: ['spring', 'summer', 'autumn'], weight: 1, flap: 1, shape: S(0.9, 0.95, 0.8, 0.5),
    top: (c, p) => {
      fill(c, p, '#f4e66a');
      dot(c, p, 62, 44, 3, '#e8902a');
      dot(c, p, 58, 86, 3.5, '#e8902a');
    },
    under: (c, p) => {
      fill(c, p, '#e8eaa8');
      veins(c, p, '#c8c888', 1);
    },
  },
  {
    name: 'orange tip', size: 0.9, body: '#3a3a36', seasons: ['spring', 'summer'], weight: 0.8, flap: 1.1, shape: S(0.86, 0.75, 0.7, 0.6),
    top: (c, p, s) => {
      fill(c, p, '#f7f4ea');
      c.save();
      c.clip(p);
      c.fillStyle = '#f28a2a';
      c.beginPath();
      c.arc(s.fore * 124, 18, 46, 0, Math.PI * 2);
      c.fill();
      c.restore();
      border(c, p, 3, '#3a3834');
    },
    under: (c, p) => {
      fill(c, p, '#f4f2e6');
      c.save();
      c.clip(p);
      c.globalAlpha = 0.6;
      for (let i = 0; i < 40; i++) {
        c.fillStyle = i % 2 ? '#8aa05a' : '#a8b878';
        c.beginPath();
        c.arc(20 + ((i * 37) % 80), 66 + ((i * 53) % 44), 5, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    },
  },
  {
    name: 'peacock', size: 1.15, body: '#3a2420', seasons: ['spring', 'summer', 'autumn'], weight: 0.9, flap: 1, shape: S(0.94, 0.8, 0.78, 0.55), likes: ['lavender', 'sedum'],
    top: (c, p, s) => {
      fill(c, p, '#b8402c');
      border(c, p, 4, '#4a2a24');
      eye(c, p, s.fore * 98, 26, 13, ['#f2d08a', '#4a68b0', '#2a2030', '#f4f2ea']);
      eye(c, p, s.hind * 74, 82, 14, ['#3a3048', '#6a7ab0', '#2a2030']);
    },
    under: (c, p) => {
      fill(c, p, '#2e2622');
      veins(c, p, '#3e342e', 1.2);
    },
  },
  {
    name: 'red admiral', size: 1.1, body: '#24201c', seasons: ['summer', 'autumn'], weight: 1, flap: 1, shape: S(0.93, 0.78, 0.75, 0.55), likes: ['sedum', 'aster'],
    top: (c, p, s) => {
      fill(c, p, '#22201c');
      band(c, p, 30, 26, s.fore * 90, 62, 10, '#d8452b');
      c.save();
      c.clip(p);
      c.strokeStyle = '#d8452b';
      c.lineWidth = 7;
      c.beginPath();
      c.arc(0, 64, s.hind * 102, 0.25, 1.05);
      c.stroke();
      c.restore();
      dot(c, p, s.fore * 104, 18, 3.5, '#f4f1e8');
      dot(c, p, s.fore * 94, 26, 2.8, '#f4f1e8');
      dot(c, p, s.fore * 112, 28, 2.4, '#f4f1e8');
    },
    under: (c, p) => {
      fill(c, p, '#4a3a32');
      band(c, p, 30, 30, 90, 60, 5, '#a8503a');
      veins(c, p, '#6a5448', 1);
    },
  },
  {
    name: 'common blue', size: 0.7, body: '#2a2e40', seasons: ['spring', 'summer', 'autumn'], weight: 1, flap: 1.35, shape: S(0.85, 0.8, 0.74, 0.7),
    top: (c, p) => {
      fill(c, p, '#8ea6f2');
      shade(c, p, '#b8c4f8', 0.5);
      border(c, p, 2.5, '#3a3c48');
      border(c, p, 1, '#f4f4f0');
    },
    under: (c, p, s) => {
      fill(c, p, '#cfcac0');
      edgeDots(c, p, s, '#e8892a', 2.2);
      for (let i = 0; i < 6; i++) dot(c, p, 30 + i * 12, 40 + (i % 3) * 22, 2.2, '#3a3834');
    },
  },
  {
    name: 'small copper', size: 0.68, body: '#3a2a20', seasons: ['spring', 'summer', 'autumn'], weight: 0.9, flap: 1.35, shape: S(0.86, 0.78, 0.72, 0.6),
    top: (c, p, s) => {
      fill(c, p, '#ee7a2a');
      for (let i = 0; i < 6; i++) dot(c, p, 26 + (i % 3) * 22, 26 + Math.floor(i / 3) * 18, 4, '#2a2018');
      border(c, p, 5, '#4a3020');
      c.save();
      c.clip(p);
      c.fillStyle = '#4a3020';
      c.fillRect(0, 70, s.hind * 70, 40);
      c.restore();
      edgeDots(c, p, s, '#ee7a2a', 2);
    },
    under: (c, p) => {
      fill(c, p, '#d8a878');
      for (let i = 0; i < 5; i++) dot(c, p, 28 + i * 14, 34 + (i % 2) * 20, 2.4, '#3a2a20');
    },
  },
  {
    name: 'glasswing', size: 1.0, body: '#2a2420', seasons: ['summer'], weight: 0.25, flap: 0.9, shape: S(0.95, 0.7, 0.8, 0.5), glass: true,
    top: (c, p) => {
      // Clear panes (faintly tinted, mostly see-through) framed in brown, a white bar at the tip.
      c.fillStyle = 'rgba(220, 232, 240, 0.16)';
      c.fill(p);
      veins(c, p, 'rgba(80, 56, 40, 0.9)', 1.2);
      border(c, p, 4, '#5a3a2a');
      band(c, p, 90, 12, 110, 34, 5, '#f4f1ea');
    },
    under: (c, p) => {
      c.fillStyle = 'rgba(220, 232, 240, 0.16)';
      c.fill(p);
      veins(c, p, 'rgba(80, 56, 40, 0.9)', 1.2);
      border(c, p, 4, '#5a3a2a');
      band(c, p, 90, 12, 110, 34, 5, '#f4f1ea');
    },
  },
];

const FAVOURITES = new Set(['lavender', 'salvia', 'sedum', 'cosmos', 'aster']);

/** One canvas holding every kind's wing (upper side left, underside right), a row each. */
function atlas(): THREE.CanvasTexture {
  const canvas = makeCanvas(CELL * 2, CELL * KINDS.length);
  const c = canvas.getContext('2d')!;
  KINDS.forEach((k, i) => {
    const path = wingPath(k.shape);
    for (const [side, paint] of [[0, k.top], [1, k.under]] as const) {
      c.save();
      c.translate(side * CELL, i * CELL);
      paint(c, path, k.shape);
      // A soft, slightly darker body-side and a fine edge, so wings don't look cut from paper.
      if (!k.glass) {
        c.save();
        c.clip(path);
        const g = c.createLinearGradient(0, 0, 26, 0);
        g.addColorStop(0, 'rgba(40,30,20,0.35)');
        g.addColorStop(1, 'rgba(40,30,20,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, 26, CELL);
        c.restore();
      }
      c.restore();
    }
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Wing geometry: a right and a left quad hinged on the body (local z forward, x out to the
 * side), each carrying `aSide` so the shader can fold it up and down. UVs map into an atlas cell.
 */
function wingGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const side: number[] = [];
  const idx: number[] = [];
  const W = 0.032; // half span (one wing), metres before scaling
  const L = 0.032; // front to back
  for (const s of [1, -1]) {
    const base = pos.length / 3;
    // Corners: hinge-front, out-front, out-back, hinge-back (u out from the body, v up = front).
    for (const [u, v] of [[0, 1], [1, 1], [1, 0], [0, 0]]) {
      pos.push(s * u * W, 0, (v - 0.5) * L);
      uv.push(u, v);
      side.push(s);
    }
    // Wound so the upper face faces up on both sides.
    if (s > 0) idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setIndex(idx);
  return g;
}

type State = 'flying' | 'sipping' | 'basking' | 'puddling' | 'leaving';

interface Fly {
  kind: number;
  slot: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  target: THREE.Vector3;
  state: State;
  rest: number;
  heading: number;
  phase: number;
  size: number;
  /** Fluttering in a spiral with another butterfly for a few seconds. */
  partner: Fly | null;
  dance: number;
  /** Gliding (wings held open) for a moment between bursts of flapping. */
  glide: number;
  /** Shooed by a nearby stroke: drift off this way for a while, then come back. */
  shoo: number;
  tilt: number;
  /** What it will do on reaching its target. */
  next: State;
}

/** What the butterflies need to know about the garden. */
export interface ButterflyWorld {
  /** Open bed flowers, with their species. */
  beds(): { pos: THREE.Vector3; species: string }[];
  meadow(rng: () => number): THREE.Vector3 | null;
  meadowCount(): number;
  /** A warm stepping stone to bask on, or the muddy edge of a pond to sip at (null if none). */
  stone(rng: () => number): THREE.Vector3 | null;
  mud(rng: () => number): THREE.Vector3 | null;
  edge(angle: number): THREE.Vector3;
  wind(): THREE.Vector2;
}

/**
 * Butterflies of many kinds (monarchs, swallowtails, morphos, painted ladies, whites,
 * brimstones, orange tips, peacocks, red admirals, blues, coppers and the rare glasswing) by
 * season. Each flutters in a bobbing, wandering line, gliding on open wings between flaps and
 * drifting with the gusts; they sip at blooms (favouring lavender, salvia, sedum, cosmos and
 * asters), bask flat on warm path stones, puddle at a pond's edge, and now and then spiral
 * round each other in pairs. All share one instanced wing mesh and one body mesh; the flap
 * itself runs in the shader.
 */
export class Butterflies {
  readonly group = new THREE.Group();
  private readonly flies: Fly[] = [];
  private readonly rng = createRng(777);
  private spawnIn = 3;
  /** How active they are right now (0 at night or in heavy rain … 1), set from the time and weather. */
  activity = 1;

  private time = 0;
  private readonly kinds: number[];
  private readonly wings: THREE.InstancedMesh;
  private readonly bodies: THREE.InstancedMesh;
  /** Per wing instance: base opening, flap amplitude, flap speed, phase. */
  private readonly flap: THREE.InstancedBufferAttribute;
  private readonly kindAttr: THREE.InstancedBufferAttribute;
  private readonly uniforms = { uFlyTime: { value: 0 }, uAtlasRows: { value: KINDS.length } };
  private readonly free: number[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(
    season: Season,
    private readonly world: ButterflyWorld,
  ) {
    this.kinds = KINDS.map((_, i) => i).filter((i) => KINDS[i].seasons.includes(season));
    const geo = wingGeometry();
    this.flap = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.kindAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    geo.setAttribute('aFlap', this.flap);
    geo.setAttribute('aKind', this.kindAttr);
    const morpho = KINDS.findIndex((k) => k.shimmer);
    const mat = new THREE.MeshLambertMaterial({ map: atlas(), side: THREE.DoubleSide, alphaTest: 0.08, transparent: true, depthWrite: true });
    mat.customProgramCacheKey = () => 'butterfly-wings';
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute float aSide;
          attribute vec4 aFlap;
          attribute float aKind;
          uniform float uFlyTime;
          varying float vKind;
          varying vec2 vWingUv;`,
        )
        .replace(
          '#include <beginnormal_vertex>',
          `// Fold the wing up about the body's long axis: open + a flap (both halves mirror).
          float open = aFlap.x + aFlap.y * sin(uFlyTime * aFlap.z + aFlap.w);
          float ang = aSide * open;
          mat3 fold = mat3(cos(ang), sin(ang), 0.0, -sin(ang), cos(ang), 0.0, 0.0, 0.0, 1.0);
          vec3 objectNormal = fold * vec3(normal);
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3(tangent.xyz);
          #endif`,
        )
        .replace('#include <begin_vertex>', `vec3 transformed = fold * vec3(position);\nvKind = aKind;\nvWingUv = uv;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform float uAtlasRows;\nvarying float vKind;\nvarying vec2 vWingUv;`)
        .replace(
          '#include <map_fragment>',
          `// Upper side or underside from the atlas row for this kind.
          vec2 cell = vec2(vWingUv.x * 0.5 + (gl_FrontFacing ? 0.0 : 0.5), 1.0 - (floor(vKind + 0.5) + 1.0 - vWingUv.y) / uAtlasRows);
          vec4 wing = texture2D(map, cell);
          diffuseColor *= wing;`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          // The morpho's blue shimmers as the wing turns to the light.
          if (abs(vKind - ${morpho}.0) < 0.5 && gl_FrontFacing) {
            float glance = 1.0 - abs(dot(normalize(vViewPosition), normal));
            totalEmissiveRadiance += vec3(0.1, 0.35, 0.8) * (0.25 + glance * glance * 0.9) * diffuseColor.b;
          }`,
        );
    };
    this.wings = new THREE.InstancedMesh(geo, mat, MAX);
    this.wings.count = 0;
    this.wings.frustumCulled = false;
    const bodyGeo = new THREE.CapsuleGeometry(0.0024, 0.017, 2, 6).rotateX(Math.PI / 2);
    this.bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial(), MAX);
    this.bodies.count = 0;
    this.bodies.frustumCulled = false;
    for (let i = 0; i < MAX; i++) {
      this.free.push(MAX - 1 - i);
      this.hide(i);
    }
    this.group.add(this.wings, this.bodies);
  }

  private hide(slot: number) {
    this.m.makeScale(0, 0, 0);
    this.wings.setMatrixAt(slot, this.m);
    this.bodies.setMatrixAt(slot, this.m);
  }

  /** How many there should be: more flowers, more butterflies (but never a swarm). */
  private wanted(): number {
    if (!this.kinds.length) return 0;
    const blooms = this.world.beds().length + this.world.meadowCount() * 0.3;
    return blooms ? Math.min(MAX - 2, 1 + Math.floor(blooms / 45)) : 0;
  }

  /** Somewhere to go next: a (preferably favourite) bloom, a warm stone, or the pond's edge. */
  private pick(f: Fly): { at: THREE.Vector3; state: State } | null {
    const r = this.rng();
    if (r < 0.1) {
      const s = this.world.stone(this.rng);
      if (s) return { at: s.add(this.v.set(0, 0.01, 0)), state: 'basking' };
    } else if (r < 0.16) {
      const m = this.world.mud(this.rng);
      if (m) return { at: m, state: 'puddling' };
    }
    const beds = this.world.beds();
    const likes = KINDS[f.kind].likes;
    if (beds.length && this.rng() < beds.length / (beds.length + this.world.meadowCount() * 0.3)) {
      // Look over a few and take the favourite (and nearer is nicer).
      let best: THREE.Vector3 | null = null;
      let score = -Infinity;
      for (let k = 0; k < 6; k++) {
        const b = beds[Math.floor(this.rng() * beds.length)];
        let sc = -b.pos.distanceTo(f.pos) * 0.15 + this.rng();
        if (FAVOURITES.has(b.species)) sc += 1;
        if (likes?.includes(b.species)) sc += 1;
        if (sc > score) {
          score = sc;
          best = b.pos;
        }
      }
      if (best) return { at: best.clone().add(this.v.set(0, 0.06, 0)), state: 'sipping' };
    }
    const m = this.world.meadow(this.rng);
    return m ? { at: m, state: 'sipping' } : null;
  }

  private spawn() {
    const slot = this.free.pop();
    if (slot === undefined) return;
    // Rarer kinds turn up less often.
    let total = 0;
    for (const k of this.kinds) total += KINDS[k].weight;
    let r = this.rng() * total;
    let kind = this.kinds[0];
    for (const k of this.kinds) {
      r -= KINDS[k].weight;
      if (r <= 0) {
        kind = k;
        break;
      }
    }
    const pos = this.world.edge(this.rng() * Math.PI * 2).add(this.v.set(0, 1, 0));
    const f: Fly = { kind, slot, pos, vel: new THREE.Vector3(), target: pos.clone(), state: 'flying', rest: 0, heading: 0, phase: this.rng() * 100, size: KINDS[kind].size * lerp(0.88, 1.12, this.rng()), partner: null, dance: 0, glide: 0, shoo: 0, tilt: 0, next: 'sipping' };
    const next = this.pick(f);
    if (!next) {
      this.free.push(slot);
      return;
    }
    f.target.copy(next.at);
    f.next = next.state;
    this.kindAttr.setX(slot, kind);
    this.kindAttr.needsUpdate = true;
    this.bodies.setColorAt(slot, new THREE.Color(KINDS[kind].body));
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    this.flies.push(f);
  }

  /** A stroke nearby: butterflies close by drift off for a while, then come back. */
  disturb(x: number, z: number) {
    for (const f of this.flies) {
      if (f.state === 'leaving' || (f.pos.x - x) ** 2 + (f.pos.z - z) ** 2 > 2.5 * 2.5) continue;
      f.shoo = lerp(3, 5, this.rng());
      f.state = 'flying';
      f.heading = Math.atan2(f.pos.x - x, f.pos.z - z);
      f.target.set(f.pos.x + Math.sin(f.heading) * 4, f.pos.y + 1, f.pos.z + Math.cos(f.heading) * 4);
    }
  }

  /** A tap: the nearest butterfly flutters down onto a flower close by (or the touched spot). */
  tap(p: THREE.Vector3): boolean {
    let best: Fly | null = null;
    let bestD = 0.8;
    for (const f of this.flies) {
      const d = Math.hypot(f.pos.x - p.x, f.pos.z - p.z);
      if (d < bestD && f.state !== 'leaving') {
        bestD = d;
        best = f;
      }
    }
    if (!best) return false;
    const beds = this.world.beds();
    let to = p.clone().add(this.v.set(0, 0.03, 0));
    for (const b of beds) if (b.pos.distanceTo(p) < to.distanceTo(p) + 0.6 && b.pos.distanceTo(p) < 1.2) to = b.pos.clone().add(this.v.set(0, 0.06, 0));
    best.target.copy(to);
    best.state = 'flying';
    best.next = 'sipping';
    best.shoo = 0;
    return true;
  }

  update(dt: number) {
    this.time += dt;
    this.uniforms.uFlyTime.value = this.time;
    const want = Math.floor(this.wanted() * this.activity + 0.3);
    this.spawnIn -= dt;
    if (this.flies.length < want && this.spawnIn <= 0) {
      this.spawnIn = lerp(2, 7, this.rng());
      this.spawn();
    }
    const wind = this.world.wind();
    for (let i = this.flies.length - 1; i >= 0; i--) {
      const f = this.flies[i];
      const t = this.time + f.phase;
      const kind = KINDS[f.kind];
      let base: number; // wing opening (0 flat … ~1.4 closed above the back)
      let amp: number;
      let speed: number;
      let pitch = 0;
      if (f.state === 'sipping' || f.state === 'basking' || f.state === 'puddling') {
        f.rest -= dt;
        f.pos.copy(f.target);
        if (f.state === 'basking') {
          // Spread flat to the sun, with the odd slow lift.
          base = 0.12;
          amp = 0.1;
          speed = 0.8;
        } else {
          // Sipping: wings slowly opening and closing.
          base = 0.75;
          amp = 0.55;
          speed = 1.3;
          pitch = f.state === 'puddling' ? 0.15 : 0;
        }
        if (f.rest <= 0) {
          if (this.rng() < 0.12 || this.flies.length > want) {
            f.state = 'leaving';
            f.target = this.world.edge(this.rng() * Math.PI * 2).add(this.v.set(0, 2.5, 0));
          } else {
            const next = this.pick(f);
            if (next) {
              f.target.copy(next.at);
              f.next = next.state;
              f.state = 'flying';
              // Sometimes a second butterfly nearby joins it for a spiralling dance.
              const other = this.flies.find((o) => o !== f && o.state === 'flying' && !o.partner && o.pos.distanceTo(f.pos) < 3);
              if (other && this.rng() < 0.35) {
                f.partner = other;
                other.partner = f;
                f.dance = other.dance = lerp(3, 6, this.rng());
              }
            } else f.rest = 2;
          }
        }
      } else {
        // A wandering, bobbing flutter, gliding now and then, drifting on the gusts.
        if (f.shoo > 0) f.shoo -= dt;
        const to = this.v.copy(f.target).sub(f.pos);
        const dist = to.length();
        let aim = Math.atan2(to.x, to.z) + Math.sin(t * 0.9) * 0.9 * Math.min(1, dist / 1.5) + Math.sin(t * 2.7) * 0.4;
        let climbTo = dist < 0.8 ? f.target.y + 0.05 : f.target.y + 0.9;
        if (f.partner && f.dance > 0) {
          // Spiral round each other, rising a little.
          f.dance -= dt;
          const mid = f.pos.clone().add(f.partner.pos).multiplyScalar(0.5);
          aim = Math.atan2(mid.x - f.pos.x, mid.z - f.pos.z) + 1.3;
          climbTo = mid.y + 0.4;
          if (f.dance <= 0) f.partner = null;
        }
        let dh = aim - f.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        f.heading += dh * Math.min(1, dt * 2.5);
        f.glide -= dt;
        if (f.glide < -lerp(0.8, 2, this.rng()) && this.rng() < dt * 0.8) f.glide = lerp(0.4, 1.0, this.rng());
        const gliding = f.glide > 0;
        const flapRate = 11 * kind.flap;
        const sp = Math.min(1.1, 0.35 + dist * 0.6) * (f.shoo > 0 ? 1.4 : 1);
        // Each downstroke gives a little lift: a fluttery up-and-down (a gentle sink in a glide).
        const lift = gliding ? -0.25 : Math.max(0, Math.sin(this.time * flapRate + f.phase)) * 1.2 - 0.45;
        f.vel.set(Math.sin(f.heading) * sp + wind.x * 0.45, lift + (climbTo - f.pos.y) * (dist < 0.8 ? 3 : 0.8), Math.cos(f.heading) * sp + wind.y * 0.45);
        f.pos.addScaledVector(f.vel, dt);
        base = gliding ? 0.15 : 0.3;
        amp = gliding ? 0.04 : 1.0;
        speed = gliding ? 3 : flapRate;
        pitch = -0.25;
        f.tilt += (dh * 0.8 - f.tilt) * Math.min(1, dt * 4);
        const next = f.next;
        if (f.state === 'flying' && f.shoo <= 0 && !f.partner && dist < 0.08) {
          f.state = next;
          f.rest = next === 'basking' ? lerp(5, 12, this.rng()) : next === 'puddling' ? lerp(4, 9, this.rng()) : lerp(2, 7, this.rng());
          f.tilt = 0;
        } else if (f.state === 'flying' && f.shoo <= 0 && dist > 6 && f.target.y > f.pos.y + 0.5) {
          // Done drifting off after a shoo: come back to a flower.
          const back = this.pick(f);
          if (back) f.target.copy(back.at);
        } else if (f.state === 'leaving' && dist < 0.6) {
          this.hide(f.slot);
          this.free.push(f.slot);
          if (f.partner) f.partner.partner = null;
          this.flies.splice(i, 1);
          continue;
        }
      }
      this.flap.setXYZW(f.slot, base, amp, speed, f.phase);
      this.e.set(pitch, f.heading, f.tilt);
      this.q.setFromEuler(this.e);
      this.m.compose(f.pos, this.q, this.s.setScalar(SCALE * f.size));
      this.wings.setMatrixAt(f.slot, this.m);
      this.bodies.setMatrixAt(f.slot, this.m);
    }
    this.flap.needsUpdate = true;
    this.wings.count = this.bodies.count = MAX;
    this.wings.instanceMatrix.needsUpdate = true;
    this.bodies.instanceMatrix.needsUpdate = true;
  }
}
