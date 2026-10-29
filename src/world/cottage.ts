import * as THREE from 'three';
import type { Perch } from './perchingBirds';
import type { NightLight } from './nightMagic';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng, lerp } from '../core/random';
import type { WindField } from '../render/wind';
import type { SeasonPalette } from './season';
import { ChimeSet } from './chimes';

const W = 4.6; // wall length (along local x)
const D = 3.4; // wall depth (along local z)
const WALL_H = 2.3;
const BASE_H = 0.45;
const ROOF_RISE = 1.75;
const COTTAGE_SCALE = 1.1;

const lambert = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, ...extra });

/** How the cottage looks: an option index for each part, plus the upgrades it has. */
export interface CottageStyle {
  roof: number;
  walls: number;
  shutters: number;
  door: number;
  chimney: number;
  porch: boolean;
  bay: boolean;
  boxes: boolean;
  roses: boolean;
  wisteria: boolean;
  shed: boolean;
  chimes: boolean;
}

export const ROOFS = [
  { name: 'Terracotta', a: '#a65a41', b: '#8f4935' },
  { name: 'Slate', a: '#5f6872', b: '#4e565f' },
  { name: 'Thatch', a: '#b8955a', b: '#a6844c', thatch: true },
  { name: 'Mossy', a: '#71895a', b: '#5f774a' },
  { name: 'Blue-grey', a: '#687b8d', b: '#58697a' },
];
export const WALLS = [
  { name: 'Cream', c: '#f1e3c8' },
  { name: 'White', c: '#f7f3eb' },
  { name: 'Butter', c: '#f0dc9f' },
  { name: 'Blush', c: '#efd0c5' },
  { name: 'Sage', c: '#d3dcc3' },
  { name: 'Stone', c: '#bdb4a6', stone: true },
];
export const SHUTTERS = [
  { name: 'Teal', c: '#6e9896' },
  { name: 'Sage', c: '#8aa37a' },
  { name: 'Navy', c: '#4a5f80' },
  { name: 'Barn red', c: '#a64b3e' },
  { name: 'Butter', c: '#e0c26c' },
  { name: 'Lavender', c: '#9c90ba' },
];
export const DOORS = [
  { name: 'Oak', c: '#7c4f33' },
  { name: 'Red', c: '#a3403a' },
  { name: 'Green', c: '#4f7552' },
  { name: 'Blue', c: '#4a6f95' },
  { name: 'Yellow', c: '#d6b04a' },
];
export const CHIMNEYS = ['Stone', 'Brick', 'White with pot'];

export const DEFAULT_STYLE: CottageStyle = { roof: 0, walls: 0, shutters: 0, door: 0, chimney: 0, porch: false, bay: false, boxes: true, roses: false, wisteria: false, shed: false, chimes: false };

/** Compact text form for saving: five digits, then the upgrades' letters. */
export function encodeStyle(s: CottageStyle): string {
  const ups = (s.porch ? 'p' : '') + (s.bay ? 'b' : '') + (s.boxes ? 'f' : '') + (s.roses ? 'r' : '') + (s.wisteria ? 'v' : '') + (s.shed ? 's' : '') + (s.chimes ? 'w' : '');
  return `${s.roof}${s.walls}${s.shutters}${s.door}${s.chimney}:${ups}`;
}

export function decodeStyle(text: string): CottageStyle {
  const [d, ups = ''] = text.split(':');
  const n = (i: number, max: number) => Math.min(max - 1, Math.max(0, Number(d[i]) || 0));
  return {
    roof: n(0, ROOFS.length),
    walls: n(1, WALLS.length),
    shutters: n(2, SHUTTERS.length),
    door: n(3, DOORS.length),
    chimney: n(4, CHIMNEYS.length),
    porch: ups.includes('p'),
    bay: ups.includes('b'),
    boxes: ups.includes('f'),
    roses: ups.includes('r'),
    wisteria: ups.includes('v'),
    shed: ups.includes('s'),
    chimes: ups.includes('w'),
  };
}

/**
 * A small storybook cottage, built from simple procedural pieces with hand-placed charm. Its
 * look comes from a CottageStyle, and it rebuilds itself (with a soft bounce) when that changes.
 */
export class Cottage {
  readonly group = new THREE.Group();
  style: CottageStyle = { ...DEFAULT_STYLE };
  private readonly smoke: Smoke;
  private readonly yaw: number;
  private readonly flowerTints: THREE.Color[];
  private bounce = 1;
  private readonly snowy: boolean;
  private chimeSet: ChimeSet | null = null;
  private glassMat: THREE.MeshLambertMaterial | null = null;
  private lampMat: THREE.MeshLambertMaterial | null = null;
  /** The glowing windows and the door lamp (local position, and which way the light spills). */
  private glowSpots: { at: THREE.Vector3; out: THREE.Vector3; size: number }[] = [];
  private night = 0;
  /** A chime on the eaves rang (frequency, 0–1 loudness, where). */
  onChime: (freq: number, volume: number, at: THREE.Vector3) => void = () => {};

  constructor(
    readonly position: THREE.Vector3,
    yaw: number,
    palette: SeasonPalette,
    private readonly seed: number,
  ) {
    this.yaw = yaw;
    this.flowerTints = palette.wildflowers.map((c) => new THREE.Color(c));
    this.snowy = !!palette.snowy;
    this.group.position.copy(position);
    this.group.rotation.y = yaw;
    this.group.scale.setScalar(COTTAGE_SCALE);
    this.smoke = new Smoke(new THREE.Vector3(), seed + 3);
    this.build();
  }

  /** Change the cottage's look; it rebuilds and gives a little bounce. */
  setStyle(style: CottageStyle, animate = true) {
    this.style = { ...style };
    this.build();
    this.onBuilt();
    if (animate) this.bounce = 0;
  }

  private build() {
    const g = this.group;
    // Clear out the old cottage (it's only ever a few hundred small meshes).
    for (const child of [...g.children]) {
      child.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      g.remove(child);
    }
    const st = this.style;
    const rng = createRng(this.seed);
    const roofOpt = ROOFS[st.roof];
    const wallOpt = WALLS[st.walls];

    const plaster = lambert(wallOpt.c);
    const timber = lambert('#5e412d');
    const stone = lambert('#a29a8d');
    const roof = lambert(roofOpt.a);
    const roofDark = lambert(roofOpt.b);
    const shutter = lambert(SHUTTERS[st.shutters].c);
    // Windows glow (warmer and brighter on a snowy day).
    const glass = new THREE.MeshLambertMaterial({ color: '#3a2a1a', emissive: '#ffbf6e', emissiveIntensity: this.snowy ? 2.2 : 1.6 });
    this.glassMat = glass;
    this.glowSpots = [];
    const snowMat = new THREE.MeshLambertMaterial({ color: '#f4f7fb', emissive: '#c8d4e4', emissiveIntensity: 0.12 });
    const trim = lambert('#efe6d6');
    const leafy = lambert('#5f8a3e');

    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = g, shadow = true) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // Stone plinth with a few chunky cobbles around it.
    box(W + 0.35, BASE_H, D + 0.35, stone, 0, BASE_H / 2 - 0.05, 0);
    const cobbleGeo = new THREE.DodecahedronGeometry(1, 0);
    const cobbleMats = ['#9f978a', '#b2a998', '#8d867b'].map((c) => lambert(c, { flatShading: true }));
    for (let i = 0; i < 46; i++) {
      const side = i % 4;
      const t = rng() - 0.5;
      const x = side < 2 ? t * (W + 0.3) : (side === 2 ? -1 : 1) * (W / 2 + 0.2);
      const z = side < 2 ? (side === 0 ? -1 : 1) * (D / 2 + 0.2) : t * (D + 0.3);
      const s = lerp(0.1, 0.2, rng());
      const c = new THREE.Mesh(cobbleGeo.clone(), cobbleMats[i % 3]);
      c.position.set(x, lerp(0.05, BASE_H - 0.05, rng()), z);
      c.scale.set(s * 1.3, s, s);
      c.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      c.castShadow = true;
      g.add(c);
    }

    // Walls (a stone cottage gets courses of stone drawn on in darker mortar lines).
    const wallY = BASE_H + WALL_H / 2;
    box(W, WALL_H, D, plaster, 0, wallY, 0);
    if (wallOpt.stone) {
      const mortar = lambert('#a39a8b');
      for (let k = 1; k < 7; k++) {
        const y = BASE_H + (k / 7) * WALL_H;
        for (const sz of [-1, 1]) box(W + 0.01, 0.025, 0.02, mortar, 0, y, sz * (D / 2 + 0.005), g, false);
        for (const sx of [-1, 1]) box(0.02, 0.025, D + 0.01, mortar, sx * (W / 2 + 0.005), y, 0, g, false);
      }
    }

    // Gable ends: a triangular prism spanning the width (ridge runs along x).
    const tri = new THREE.Shape();
    tri.moveTo(-D / 2, 0);
    tri.lineTo(D / 2, 0);
    tri.lineTo(0, ROOF_RISE);
    tri.closePath();
    const gableGeo = new THREE.ExtrudeGeometry(tri, { depth: W, bevelEnabled: false });
    gableGeo.translate(0, 0, -W / 2);
    gableGeo.rotateY(Math.PI / 2);
    const gable = new THREE.Mesh(gableGeo, plaster);
    gable.position.y = BASE_H + WALL_H;
    gable.castShadow = true;
    gable.receiveShadow = true;
    g.add(gable);

    // Half-timbering: corner posts, sill and eave beams (not on a stone cottage's walls).
    const post = 0.16;
    if (!wallOpt.stone) {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) box(post, WALL_H, post, timber, sx * (W / 2), wallY, sz * (D / 2));
      }
      for (const sz of [-1, 1]) {
        box(W + 0.05, post, post, timber, 0, BASE_H + 0.05, sz * (D / 2));
        box(W + 0.05, post, post, timber, 0, BASE_H + WALL_H - 0.05, sz * (D / 2));
      }
      for (const sx of [-1, 1]) box(post, post, D + 0.05, timber, sx * (W / 2), BASE_H + WALL_H - 0.05, 0);
    }

    // Roof: overlapping courses on each slope. Thatch is thicker, softer and shaggier.
    const thatch = !!roofOpt.thatch;
    const slopeLen = Math.hypot(D / 2 + 0.45, ROOF_RISE + 0.3);
    const pitch = Math.atan2(ROOF_RISE + 0.3, D / 2 + 0.45);
    const courses = thatch ? 5 : 6;
    for (const side of [-1, 1]) {
      for (let k = 0; k < courses; k++) {
        const along = (k + 0.5) / courses; // 0 = eave, 1 = ridge
        const geo = thatch ? new RoundedBoxGeometry(W + 0.9, 0.24, slopeLen / courses + 0.2, 2, 0.1) : new THREE.BoxGeometry(W + 0.8, 0.12, slopeLen / courses + 0.12);
        const mesh = new THREE.Mesh(geo, k % 2 === 0 ? roof : roofDark);
        const zEave = side * (D / 2 + 0.45);
        const yEave = BASE_H + WALL_H - 0.3;
        mesh.position.set(
          (rng() - 0.5) * 0.04,
          yEave + Math.sin(pitch) * slopeLen * along + 0.06 * (courses - k) * 0.15 + (thatch ? 0.06 : 0),
          zEave - side * Math.cos(pitch) * slopeLen * along,
        );
        mesh.rotation.x = side * pitch;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        g.add(mesh);
        // Winter: a soft blanket of snow on each course (thinner toward the eave, where it slides off).
        if (this.snowy && k > 0) {
          const snow = new THREE.Mesh(new RoundedBoxGeometry(W + 0.86 + (rng() - 0.5) * 0.05, 0.08, slopeLen / courses + 0.1, 2, 0.035), snowMat);
          snow.position.copy(mesh.position);
          snow.position.y += (thatch ? 0.14 : 0.08) * Math.cos(pitch);
          snow.position.z += side * (thatch ? 0.14 : 0.08) * Math.sin(pitch);
          snow.rotation.x = side * pitch;
          snow.scale.y = lerp(0.6, 1.1, along);
          snow.receiveShadow = true;
          g.add(snow);
        }
      }
    }
    if (thatch) {
      const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, W + 0.95, 10), roofDark);
      ridge.rotation.z = Math.PI / 2;
      ridge.position.set(0, BASE_H + WALL_H + ROOF_RISE + 0.12, 0);
      ridge.castShadow = true;
      g.add(ridge);
    } else {
      box(W + 0.9, 0.16, 0.22, timber, 0, BASE_H + WALL_H + ROOF_RISE + 0.05, 0); // ridge
    }

    // Front (+z): a door and windows with shutters (and flower boxes, if it has them).
    const front = D / 2 + 0.03;
    box(0.95, 1.7, 0.1, lambert(DOORS[st.door].c), -0.55, BASE_H + 0.85, front);
    box(1.15, 0.12, 0.14, timber, -0.55, BASE_H + 1.76, front);
    box(1.1, 0.12, 0.7, stone, -0.55, BASE_H - 0.12, front + 0.35); // doorstep
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), lambert('#d8b46a'));
    knob.position.set(-0.2, BASE_H + 0.85, front + 0.08);
    g.add(knob);

    const flowers = this.flowerTints;
    const flowerBox = (w: THREE.Object3D, width: number, y: number, z: number) => {
      box(width, 0.2, 0.26, lambert('#7a5236'), 0, y, z, w);
      const bloom = new THREE.IcosahedronGeometry(0.075, 0);
      const n = Math.round(width * 10);
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(bloom.clone(), lambert('#fff', { color: flowers[i % flowers.length] }));
        m.position.set(lerp(-width / 2 + 0.07, width / 2 - 0.07, i / (n - 1)), y + 0.14 + rng() * 0.06, z - 0.04 + (rng() - 0.5) * 0.12);
        w.add(m);
      }
      for (let i = 0; i < n - 2; i++) {
        const leaf = new THREE.Mesh(bloom.clone(), leafy);
        leaf.position.set(lerp(-width / 2 + 0.08, width / 2 - 0.08, i / (n - 3)), y + 0.1, z + 0.06);
        leaf.scale.setScalar(1.2);
        w.add(leaf);
      }
    };
    const windowAt = (x: number, y: number, z: number, rotY: number, withBox: boolean) => {
      const w = new THREE.Group();
      w.position.set(x, y, z);
      w.rotation.y = rotY;
      this.glowSpots.push({ at: new THREE.Vector3(x, y, z), out: new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY)), size: 1 });
      box(0.8, 0.85, 0.06, glass, 0, 0, 0, w);
      box(0.92, 0.08, 0.1, trim, 0, 0.46, 0.02, w);
      box(0.92, 0.08, 0.1, trim, 0, -0.46, 0.02, w);
      box(0.05, 0.85, 0.08, trim, 0, 0, 0.03, w);
      box(0.8, 0.05, 0.08, trim, 0, 0, 0.03, w);
      for (const sx of [-1, 1]) box(0.36, 0.9, 0.05, shutter, sx * 0.62, 0, 0.04, w);
      if (withBox && st.boxes) flowerBox(w, 0.95, -0.6, 0.14);
      g.add(w);
    };
    if (st.bay) {
      // A bay window: a little three-sided glazed bump with its own lead roof.
      const bay = new THREE.Group();
      bay.position.set(1.15, BASE_H, front);
      const bw = 1.3;
      const bd = 0.55;
      box(bw, 0.55, bd, plaster, 0, 0.35, bd / 2, bay);
      box(bw - 0.12, 0.95, 0.05, glass, 0, 1.1, bd, bay);
      this.glowSpots.push({ at: new THREE.Vector3(1.15, BASE_H + 1.1, front + bd), out: new THREE.Vector3(0, 0, 1), size: 1.3 });
      for (const sx of [-1, 1]) box(0.05, 0.95, bd - 0.1, glass, sx * (bw / 2 - 0.02), 1.1, bd / 2, bay);
      for (const sx of [-1, 0, 1]) box(0.06, 0.97, 0.07, trim, sx * (bw / 2 - 0.03), 1.1, bd + 0.01, bay);
      box(bw + 0.12, 0.08, bd + 0.14, trim, 0, 0.62, bd / 2, bay);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.2, 0.1, bd + 0.25), roofDark);
      cap.position.set(0, 1.66, bd / 2 + 0.02);
      cap.rotation.x = 0.28;
      cap.castShadow = true;
      bay.add(cap);
      if (st.boxes) flowerBox(bay, bw - 0.1, 0.5, bd + 0.16);
      g.add(bay);
    } else {
      windowAt(1.15, BASE_H + 1.25, front, 0, true);
    }
    windowAt(-W / 2 - 0.03, BASE_H + 1.25, 0, -Math.PI / 2, true);
    windowAt(W / 2 + 0.03, BASE_H + 1.25, 0, Math.PI / 2, false);
    windowAt(0.9, BASE_H + 1.3, -front, Math.PI, false);

    // Lantern by the door.
    this.lampMat = new THREE.MeshLambertMaterial({ color: '#2b2118', emissive: '#ffb45c', emissiveIntensity: 2.2 });
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), this.lampMat);
    lantern.position.set(0.12, BASE_H + 1.55, front + 0.12);
    this.glowSpots.push({ at: lantern.position.clone(), out: new THREE.Vector3(0, 0, 1), size: 0.8 });
    this.setNight(this.night);
    g.add(lantern);

    if (st.porch) {
      // A little gabled porch over the door, on two white posts.
      const px = -0.55;
      const pd = 1.0;
      for (const sx of [-1, 1]) box(0.09, 1.95, 0.09, trim, px + sx * 0.65, BASE_H + 0.95, front + pd);
      box(1.5, 0.1, 0.1, trim, px, BASE_H + 1.97, front + pd);
      for (const side of [-1, 1]) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.07, pd + 0.35), roof);
        slab.position.set(px + side * 0.38, BASE_H + 2.2, front + pd / 2);
        slab.rotation.z = -side * 0.62;
        slab.castShadow = true;
        g.add(slab);
      }
      box(1.6, 0.1, pd + 0.2, stone, px, BASE_H - 0.1, front + pd / 2 + 0.1);
    }

    // Chimney through the right side of the roof: stone, brick, or white with a pot on top.
    const chimX = W / 2 - 0.75;
    const chimTop = BASE_H + WALL_H + ROOF_RISE + 0.75;
    const chimMat = st.chimney === 1 ? lambert('#9a5440') : st.chimney === 2 ? lambert('#efe8dc') : stone;
    box(0.62, chimTop - BASE_H - WALL_H + 0.2, 0.62, chimMat, chimX, (chimTop + BASE_H + WALL_H) / 2, -0.55);
    if (st.chimney === 1) {
      for (let k = 1; k < 6; k++) box(0.63, 0.02, 0.63, lambert('#7d4434'), chimX, BASE_H + WALL_H + ROOF_RISE * 0.6 + k * 0.17, -0.55, g, false);
    }
    box(0.74, 0.14, 0.74, lambert(st.chimney === 1 ? '#6f3a2c' : '#8d867b'), chimX, chimTop, -0.55);
    let smokeY = chimTop + 0.1;
    if (st.chimney === 2) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.32, 10), lambert('#b8643f'));
      pot.position.set(chimX, chimTop + 0.22, -0.55);
      pot.castShadow = true;
      g.add(pot);
      smokeY += 0.3;
    }

    if (st.shed) {
      // A lean-to shed on the right gable end: timber boards, a sloping roof, a little door.
      const sh = new THREE.Group();
      sh.position.set(W / 2 + 0.85, 0, 0.2);
      const boards = lambert('#8a6a4a');
      box(1.6, 1.75, 2.1, boards, 0, BASE_H + 0.8, 0, sh);
      for (let k = 0; k < 8; k++) box(0.025, 1.7, 0.02, lambert('#6e5338'), -0.75 + k * 0.21, BASE_H + 0.8, 1.06, sh, false);
      box(0.6, 1.35, 0.06, lambert(DOORS[st.door].c), 0.1, BASE_H + 0.62, 1.07, sh);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.09, 2.45), roofDark);
      lid.position.set(0, BASE_H + 1.85, 0);
      lid.rotation.z = -0.3;
      lid.castShadow = true;
      sh.add(lid);
      box(1.7, BASE_H, 2.2, stone, 0, BASE_H / 2 - 0.05, 0, sh);
      g.add(sh);
    }

    this.chimeSet = null;
    if (st.chimes) {
      // Wind chimes hung from a little iron bracket under the front eave, by the door.
      const bx = -W / 2 + 0.45;
      const by = BASE_H + WALL_H - 0.12;
      box(0.03, 0.03, 0.42, lambert('#2f2b28'), bx, by, D / 2 + 0.2);
      const set = new ChimeSet(this.seed + 9, (f, v, at) => this.onChime(f, v, at));
      set.group.position.set(bx, by - 0.04, D / 2 + 0.38);
      set.group.scale.setScalar(0.9);
      g.add(set.group);
      this.chimeSet = set;
    }

    this.merge();
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    g.updateMatrixWorld(true);
    this.smoke.moveTo(g.localToWorld(new THREE.Vector3(chimX, smokeY, -0.55)));
  }

  /**
   * The cottage is built from a couple of hundred little pieces, but nothing in it moves (bar the
   * chimes): pieces that look the same are merged into one mesh, so it costs a handful of draw
   * calls rather than 150.
   */
  private merge() {
    const g = this.group;
    g.updateMatrixWorld(true);
    const toLocal = new THREE.Matrix4().copy(g.matrixWorld).invert();
    const keep = this.chimeSet?.group;
    const pieces: THREE.Mesh[] = [];
    g.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === keep) return;
      pieces.push(o);
    });
    const buckets = new Map<string, { mat: THREE.MeshLambertMaterial; geos: THREE.BufferGeometry[] }>();
    const used = new Set<THREE.Material>();
    const m = new THREE.Matrix4();
    for (const piece of pieces) {
      const mat = piece.material as THREE.MeshLambertMaterial;
      // The window glass and lamp keep their own materials (they brighten at night).
      const key =
        mat === this.glassMat || mat === this.lampMat
          ? mat.uuid
          : [mat.type, mat.color.getHex(), mat.emissive.getHex(), mat.emissiveIntensity, mat.side, mat.transparent, mat.opacity, mat.vertexColors, mat.flatShading, mat.map?.uuid].join('|');
      if (!buckets.has(key)) buckets.set(key, { mat, geos: [] });
      used.add(buckets.get(key)!.mat);
      const geo = piece.geometry.index ? piece.geometry.toNonIndexed() : piece.geometry.clone();
      for (const name of Object.keys(geo.attributes)) {
        if (name !== 'position' && name !== 'normal' && !(name === 'color' && mat.vertexColors) && !(name === 'uv' && mat.map)) geo.deleteAttribute(name);
      }
      if (!geo.attributes.normal) geo.computeVertexNormals();
      m.multiplyMatrices(toLocal, piece.matrixWorld);
      geo.applyMatrix4(m);
      // A mirrored piece turns inside out once baked: wind its triangles the other way.
      if (m.determinant() < 0) {
        for (const a of Object.values(geo.attributes)) {
          const k = a.itemSize;
          const arr = a.array;
          for (let t = 0; t < a.count; t += 3) {
            for (let c = 0; c < k; c++) {
              const i1 = (t + 1) * k + c;
              const i2 = (t + 2) * k + c;
              const tmp = arr[i1];
              arr[i1] = arr[i2];
              arr[i2] = tmp;
            }
          }
        }
      }
      buckets.get(key)!.geos.push(geo);
      piece.geometry.dispose();
      piece.removeFromParent();
    }
    for (const piece of pieces) {
      const mat = piece.material as THREE.Material;
      if (!used.has(mat)) mat.dispose();
    }
    for (const { mat, geos } of buckets.values()) {
      const merged = mergeGeometries(geos);
      if (!merged) {
        for (const geo of geos) g.add(new THREE.Mesh(geo, mat)); // (can't happen; just in case)
        continue;
      }
      for (const geo of geos) geo.dispose();
      g.add(new THREE.Mesh(merged, mat));
    }
  }

  /** Ground point just in front of the doorstep, where garden paths should arrive. */
  get doorstep(): THREE.Vector2 {
    const p = this.group.localToWorld(new THREE.Vector3(-0.55, 0, D / 2 + 1.15));
    return new THREE.Vector2(p.x, p.z);
  }

  get smokePoints(): THREE.Points {
    return this.smoke.points;
  }

  /** Called after every (re)build, so climbers can be grown over the new walls. */
  onBuilt: () => void = () => {};

  /**
   * Where climbers grow on this cottage (world points, from the root): climbing roses up the
   * front corners and round the door, wisteria up a corner and along under the front eave.
   */
  vinePaths(): { kind: 'rose' | 'wisteria'; points: THREE.Vector3[]; face: THREE.Vector3; seed: number }[] {
    const st = this.style;
    const out: { kind: 'rose' | 'wisteria'; points: THREE.Vector3[]; face: THREE.Vector3; seed: number }[] = [];
    const front = D / 2 + 0.06;
    const face = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    // (By hand rather than from the group's matrix, which may be mid-bounce.)
    const world = (pts: [number, number, number][]) => pts.map(([x, y, z]) => new THREE.Vector3(x, y, z).multiplyScalar(COTTAGE_SCALE).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).add(this.position));
    const eave = BASE_H + WALL_H - 0.12;
    if (st.roses) {
      // Up beside the door and over it, and up the left front corner.
      out.push({ kind: 'rose', face, seed: this.seed + 101, points: world([[-0.75, 0.05, front], [-0.7, 0.9, front], [-0.68, 1.75, front], [-0.4, 2.05, front], [0.05, 2.1, front], [0.35, 1.95, front]]) });
      out.push({ kind: 'rose', face, seed: this.seed + 102, points: world([[0.42, 0.05, front], [0.4, 1.0, front], [0.38, 1.6, front]]) });
      out.push({ kind: 'rose', face, seed: this.seed + 103, points: world([[-W / 2 + 0.12, 0.05, front], [-W / 2 + 0.15, 1.2, front], [-W / 2 + 0.2, eave, front], [-W / 2 + 0.9, eave + 0.02, front]]) });
    }
    if (st.wisteria) {
      // A gnarled trunk up the right corner, then a long arm under the eave, racemes hanging.
      const x0 = W / 2 - 0.14;
      const arm = eave - 0.22; // low enough that the flowers hang below the eave
      out.push({ kind: 'wisteria', face, seed: this.seed + 111, points: world([[x0, 0.05, front], [x0 - 0.04, 0.8, front], [x0 + 0.02, 1.6, front], [x0 - 0.05, arm, front], [x0 - 1.2, arm + 0.04, front], [x0 - 2.4, arm - 0.03, front], [x0 - 3.4, arm + 0.03, front], [-W / 2 + 0.2, arm, front]]) });
    }
    return out;
  }

  /** Places a bird could sit along the roof ridge. */
  perches(out: Perch[]) {
    const top = BASE_H + WALL_H + ROOF_RISE + (ROOFS[this.style.roof]?.thatch ? 0.33 : 0.13);
    for (let i = 0; i < 5; i++) {
      const pos = this.group.localToWorld(new THREE.Vector3(lerp(-W / 2 + 0.2, W / 2 - 0.2, i / 4), top, 0));
      out.push({ pos, yaw: this.yaw, alive: () => true });
    }
  }

  /** After dark the windows and the door lamp burn brighter. */
  setNight(n: number) {
    this.night = n;
    if (this.glassMat) this.glassMat.emissiveIntensity = (this.snowy ? 2.2 : 1.6) * (1 + n * 0.9);
    if (this.lampMat) this.lampMat.emissiveIntensity = 2.2 * (1 + n * 0.8);
  }

  /** Where the cottage's light falls after dark: a pool on the grass outside each window. */
  nightLights(out: NightLight[]) {
    for (const s of this.glowSpots) {
      const pos = this.group.localToWorld(s.at.clone().addScaledVector(s.out, 0.15));
      const ground = s.at.clone().addScaledVector(s.out, 1.1);
      ground.y = 0;
      out.push({ pos, pool: this.group.localToWorld(ground), radius: 1.6 * s.size });
    }
  }

  /** True if (x, z) is within the cottage footprint (with its shed and porch) plus `margin`. */
  contains(x: number, z: number, margin = 0): boolean {
    const dx = x - this.position.x;
    const dz = z - this.position.z;
    const c = Math.cos(-this.yaw);
    const s = Math.sin(-this.yaw);
    const lx = (dx * c + dz * s) / COTTAGE_SCALE;
    const lz = (-dx * s + dz * c) / COTTAGE_SCALE;
    const m = margin / COTTAGE_SCALE;
    const right = W / 2 + 0.5 + (this.style.shed ? 1.7 : 0);
    const frontEdge = D / 2 + 0.5 + (this.style.porch ? 0.9 : 0);
    return lx > -(W / 2 + 0.5) - m && lx < right + m && lz > -(D / 2 + 0.5) - m && lz < frontEdge + m;
  }

  update(dt: number, wind: WindField) {
    this.smoke.update(dt, wind);
    this.chimeSet?.update(dt, wind.direction, wind.sample(this.position.x, this.position.z + 2));
    if (this.bounce < 1) {
      // A happy little bounce when it's been given a new look.
      this.bounce = Math.min(1, this.bounce + dt / 0.7);
      const t = this.bounce;
      const k = Math.exp(-t * 6) * Math.sin(t * 22) * 0.05;
      this.group.scale.set(COTTAGE_SCALE * (1 - k * 0.5), COTTAGE_SCALE * (1 + k), COTTAGE_SCALE * (1 - k * 0.5));
    }
  }

  setPixelRatio(pr: number) {
    this.smoke.setPixelRatio(pr);
  }
}

/** Soft chimney smoke. Particles rise, swell, and lean with whatever the wind is doing. */
class Smoke {
  readonly points: THREE.Points;
  private readonly count = 34;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly vel: Float32Array;
  private readonly pos: Float32Array;
  private readonly alpha: Float32Array;
  private readonly size: Float32Array;
  private readonly rng: () => number;

  constructor(private origin: THREE.Vector3, seed: number) {
    this.rng = createRng(seed);
    const n = this.count;
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.pos = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    this.size = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.respawn(i);
      this.age[i] = this.rng() * this.life[i]; // start mid-plume
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uPixelRatio: { value: 1 }, uColor: { value: new THREE.Color('#efe8e0') } },
      vertexShader: /* glsl */ `
        uniform float uPixelRatio;
        attribute float aAlpha, aSize;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uPixelRatio * (320.0 / -mv.z);
          vAlpha = aAlpha;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.1, d);
          gl_FragColor = vec4(uColor, a * vAlpha);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  /** The chimney moved (a new chimney style): smoke now rises from here. */
  moveTo(p: THREE.Vector3) {
    const dx = p.x - this.origin.x;
    const dy = p.y - this.origin.y;
    const dz = p.z - this.origin.z;
    this.origin = p.clone();
    for (let i = 0; i < this.count; i++) {
      this.pos[i * 3] += dx;
      this.pos[i * 3 + 1] += dy;
      this.pos[i * 3 + 2] += dz;
    }
  }

  private respawn(i: number) {
    this.age[i] = 0;
    this.life[i] = lerp(4, 7, this.rng());
    this.pos[i * 3] = this.origin.x + (this.rng() - 0.5) * 0.2;
    this.pos[i * 3 + 1] = this.origin.y;
    this.pos[i * 3 + 2] = this.origin.z + (this.rng() - 0.5) * 0.2;
    this.vel[i * 3] = (this.rng() - 0.5) * 0.1;
    this.vel[i * 3 + 1] = lerp(0.45, 0.7, this.rng());
    this.vel[i * 3 + 2] = (this.rng() - 0.5) * 0.1;
  }

  update(dt: number, wind: WindField) {
    for (let i = 0; i < this.count; i++) {
      this.age[i] += dt;
      if (this.age[i] > this.life[i]) this.respawn(i);
      const k = i * 3;
      const w = wind.sample(this.pos[k], this.pos[k + 2]);
      // Ease toward the local wind; smoke is light, so it follows gusts quickly.
      const push = 0.6 + this.pos[k + 1] * 0.05;
      this.vel[k] += (wind.direction.x * w * 1.6 * push - this.vel[k]) * dt * 0.8;
      this.vel[k + 2] += (wind.direction.y * w * 1.6 * push - this.vel[k + 2]) * dt * 0.8;
      this.vel[k + 1] *= 1 - dt * 0.08;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      const t = this.age[i] / this.life[i];
      this.alpha[i] = Math.min(1, t * 6) * (1 - t) * 0.55;
      this.size[i] = lerp(0.35, 1.6, Math.sqrt(t));
    }
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
  }

  setPixelRatio(pr: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uPixelRatio.value = pr;
  }
}
