import * as THREE from 'three';
import type { Perch } from './perchingBirds';
import type { NightLight } from './nightMagic';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng, lerp } from '../core/random';
import { regrow } from '../core/regrow';
import type { WindField } from '../render/wind';
import { Flag } from './flag';
import { ChimeSet } from './chimes';

export type PropKind = 'bench' | 'lantern' | 'birdhouse' | 'gazebo' | 'flag' | 'chimes';

type Rng = () => number;

/** A rounded box of the given size, centred at (x, y, z), in one flat colour. */
function block(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.Color, round = 0.012, rot?: THREE.Euler): THREE.BufferGeometry {
  // (A rounded box is built as loose triangles already.)
  const g = new RoundedBoxGeometry(w, h, d, 1, Math.min(round, w / 2.1, h / 2.1, d / 2.1));
  if (rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot));
  g.translate(x, y, z);
  return paint(g, color);
}

function paint(g: THREE.BufferGeometry, color: THREE.Color, shade = true): THREE.BufferGeometry {
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    // A hint of grime low down, as on anything that's stood out in a garden for a while.
    const k = shade ? 0.9 + Math.min(0.1, Math.max(0, pos.getY(i)) * 0.15) : 1;
    col.set([color.r * k, color.g * k, color.b * k], i * 3);
  }
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g.index ? g.toNonIndexed() : g;
}

/** A slatted garden bench with arms, ~1.4 m wide; its seat faces +z. Origin at its feet. */
function benchGeometry(rng: Rng, painted: boolean): THREE.BufferGeometry {
  const wood = new THREE.Color(painted ? '#8fa88a' : '#a27a52');
  const frame = new THREE.Color(painted ? '#6f8a6c' : '#7a5a3c');
  const parts: THREE.BufferGeometry[] = [];
  const W = lerp(1.3, 1.5, rng());
  const slat = () => wood.clone().multiplyScalar(lerp(0.9, 1.08, rng()));
  // Seat slats, each a hair different, with a little gap between.
  for (let i = 0; i < 4; i++) parts.push(block(W, 0.035, 0.09, 0, 0.45, -0.17 + i * 0.105 + (rng() - 0.5) * 0.006, slat(), 0.012));
  // Back slats, leaning back a touch.
  const lean = new THREE.Euler(-0.2, 0, 0);
  for (let i = 0; i < 3; i++) parts.push(block(W, 0.085, 0.03, 0, 0.6 + i * 0.12, -0.24 - i * 0.025, slat(), 0.012, lean));
  // Sides: legs, arm rest and back upright.
  for (const sx of [-W / 2 + 0.05, W / 2 - 0.05]) {
    parts.push(block(0.06, 0.45, 0.06, sx, 0.225, 0.16, frame));
    parts.push(block(0.06, 0.95, 0.06, sx, 0.47, -0.25, frame, 0.012, new THREE.Euler(-0.12, 0, 0)));
    parts.push(block(0.07, 0.04, 0.52, sx, 0.66, -0.03, frame));
    parts.push(block(0.05, 0.22, 0.05, sx, 0.55, 0.17, frame));
    parts.push(block(0.05, 0.05, 0.42, sx, 0.12, -0.04, frame));
  }
  return mergeGeometries(parts);
}

/** A slim iron garden lamp post, ~1.7 m, with a four-paned lantern and a little roof. */
function lanternGeometry(rng: Rng): { body: THREE.BufferGeometry; glass: THREE.BufferGeometry } {
  const iron = new THREE.Color('#2f2b28');
  const h = lerp(1.55, 1.8, rng());
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paint(new THREE.CylinderGeometry(0.11, 0.14, 0.08, 10).translate(0, 0.04, 0), iron));
  parts.push(paint(new THREE.CylinderGeometry(0.03, 0.04, h, 8).translate(0, h / 2, 0), iron));
  parts.push(paint(new THREE.CylinderGeometry(0.07, 0.05, 0.05, 8).translate(0, h + 0.02, 0), iron));
  // Lantern frame: corner posts, base and a pyramid roof with a finial.
  const top = h + 0.05;
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) parts.push(block(0.02, 0.26, 0.02, x * 0.085, top + 0.13, z * 0.085, iron, 0.006));
  parts.push(block(0.21, 0.025, 0.21, 0, top, 0, iron, 0.006));
  parts.push(paint(new THREE.ConeGeometry(0.17, 0.13, 4, 1).rotateY(Math.PI / 4).translate(0, top + 0.32, 0), iron));
  parts.push(paint(new THREE.SphereGeometry(0.025, 8, 6).translate(0, top + 0.4, 0), iron));
  const glass = new THREE.BoxGeometry(0.16, 0.24, 0.16).translate(0, top + 0.13, 0);
  glass.deleteAttribute('uv');
  return { body: mergeGeometries(parts), glass };
}

/** A painted birdhouse on a wooden post: pitched roof, round door, a little perch. */
function birdhouseGeometry(rng: Rng): THREE.BufferGeometry {
  const coats = ['#9cc3d5', '#b7cfa3', '#efe3c8', '#d9a49a', '#c9b6d9'];
  const roofs = ['#b5523b', '#4e6d8c', '#6b4f3a', '#557a4a'];
  const body = new THREE.Color(coats[Math.floor(rng() * coats.length)]);
  const roof = new THREE.Color(roofs[Math.floor(rng() * roofs.length)]);
  const wood = new THREE.Color('#8a6a4a');
  const h = lerp(1.35, 1.6, rng());
  const parts: THREE.BufferGeometry[] = [];
  parts.push(block(0.07, h, 0.07, 0, h / 2, 0, wood, 0.01));
  parts.push(block(0.24, 0.025, 0.24, 0, h + 0.01, 0, wood, 0.006));
  // The house: a box with a gable, front facing +z.
  const s = new THREE.Shape();
  s.moveTo(-0.11, 0);
  s.lineTo(0.11, 0);
  s.lineTo(0.11, 0.2);
  s.lineTo(0, 0.31);
  s.lineTo(-0.11, 0.2);
  s.closePath();
  const house = new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: false });
  house.translate(0, h + 0.02, -0.1);
  parts.push(paint(house, body));
  // Roof: two boards meeting at the ridge, overhanging all round.
  for (const side of [-1, 1]) {
    parts.push(block(0.17, 0.02, 0.28, side * 0.062, h + 0.275, 0, roof, 0.006, new THREE.Euler(0, 0, side * -0.78)));
  }
  // Door hole and perch.
  parts.push(paint(new THREE.CircleGeometry(0.035, 14).translate(0, h + 0.15, 0.101), new THREE.Color('#2a2018'), false));
  parts.push(paint(new THREE.CylinderGeometry(0.007, 0.007, 0.06, 6).rotateX(Math.PI / 2).translate(0, h + 0.09, 0.13), wood));
  return mergeGeometries(parts);
}

/**
 * An octagonal garden gazebo, ~3.6 m across, entrance facing +z. Returned as separate pieces in
 * the order it goes together: deck and step, eight posts, railings, top beams, eight roof
 * panels, then the finial.
 */
function gazeboPieces(rng: Rng): { geo: THREE.BufferGeometry; roof?: boolean }[] {
  const R = 1.55; // to the post centres
  const H = 2.25; // post height
  const white = new THREE.Color('#f2eee6');
  const deck = new THREE.Color('#a8825a');
  const roofs = [['#7f9a7a', '#6c8768'], ['#b7654a', '#9e5440'], ['#6b7680', '#59636c']];
  const [roofA, roofB] = roofs[Math.floor(rng() * roofs.length)].map((c) => new THREE.Color(c));
  const pieces: { geo: THREE.BufferGeometry; roof?: boolean }[] = [];
  // Angles of the eight posts: a flat side (the entrance) faces +z.
  const ang = (k: number) => Math.PI / 2 + Math.PI / 8 + (k * Math.PI) / 4;
  const at = (k: number, r: number) => new THREE.Vector2(Math.cos(ang(k)) * r, Math.sin(ang(k)) * r);
  // Deck: a low octagonal platform of boards, with a step at the entrance.
  const plat = new THREE.CylinderGeometry(R + 0.25, R + 0.3, 0.2, 8, 1).rotateY(Math.PI / 8).translate(0, 0.1, 0);
  const deckParts = [paint(plat, deck)];
  deckParts.push(block(1.1, 0.1, 0.35, 0, 0.05, R + 0.4, deck.clone().multiplyScalar(0.92), 0.02));
  pieces.push({ geo: mergeGeometries(deckParts) });
  for (let k = 0; k < 8; k++) {
    const p = at(k, R);
    pieces.push({ geo: block(0.11, H, 0.11, p.x, 0.2 + H / 2, p.y, white, 0.02) });
  }
  // Railings between posts, leaving the front open (between posts 7 and 0).
  for (let k = 0; k < 7; k++) {
    const p0 = at(k, R);
    const p1 = at(k + 1, R);
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    const len = p0.distanceTo(p1) - 0.1;
    const yaw = Math.atan2(-(p1.y - p0.y), p1.x - p0.x);
    const rot = new THREE.Euler(0, yaw, 0);
    const parts = [block(len, 0.05, 0.06, mid.x, 0.95, mid.y, white, 0.01, rot), block(len, 0.04, 0.05, mid.x, 0.35, mid.y, white, 0.01, rot)];
    for (let b = 1; b < 7; b++) {
      const q = p0.clone().lerp(p1, b / 7);
      parts.push(block(0.035, 0.6, 0.035, q.x, 0.65, q.y, white, 0.008, rot));
    }
    pieces.push({ geo: mergeGeometries(parts) });
  }
  // Ring of beams along the tops of the posts.
  const beams: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 8; k++) {
    const p0 = at(k, R);
    const p1 = at(k + 1, R);
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    beams.push(block(p0.distanceTo(p1) + 0.12, 0.14, 0.12, mid.x, 0.2 + H, mid.y, white, 0.015, new THREE.Euler(0, Math.atan2(-(p1.y - p0.y), p1.x - p0.x), 0)));
  }
  pieces.push({ geo: mergeGeometries(beams) });
  // Roof: eight shingled panels rising to a point, the eaves overhanging the posts.
  const eave = 0.2 + H + 0.07;
  const rise = 1.15;
  for (let k = 0; k < 8; k++) {
    const g = new THREE.CylinderGeometry(0.02, R + 0.5, rise, 1, 6, true, ang(k), Math.PI / 4);
    g.translate(0, eave + rise / 2, 0);
    // A gentle bell curve, and rows of shingles in two tones.
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) - eave) / rise;
      pos.setY(i, pos.getY(i) - Math.sin(t * Math.PI) * 0.08);
    }
    g.computeVertexNormals();
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const row = Math.floor(((pos.getY(i) - eave) / rise) * 6 + 0.01);
      const c = (row % 2 ? roofA : roofB).clone().multiplyScalar(0.92 + (k % 2) * 0.06);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.deleteAttribute('uv');
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    pieces.push({ geo: g.index ? g.toNonIndexed() : g, roof: true });
  }
  const top = eave + rise - 0.05;
  pieces.push({ geo: mergeGeometries([paint(new THREE.CylinderGeometry(0.06, 0.09, 0.14, 8).translate(0, top + 0.05, 0), white), paint(new THREE.SphereGeometry(0.08, 10, 8).translate(0, top + 0.18, 0), white)]) });
  return pieces;
}

/** A white flagpole, ~2.6 m, with a gold ball on top. Origin at its foot. */
function flagpoleGeometry(rng: Rng): THREE.BufferGeometry {
  const white = new THREE.Color('#f3efe7');
  const h = lerp(2.45, 2.7, rng());
  return mergeGeometries([
    paint(new THREE.CylinderGeometry(0.1, 0.13, 0.12, 10).translate(0, 0.06, 0), new THREE.Color('#9a958c')),
    paint(new THREE.CylinderGeometry(0.022, 0.032, h, 8).translate(0, h / 2, 0), white),
    paint(new THREE.SphereGeometry(0.045, 10, 8).translate(0, h + 0.03, 0), new THREE.Color('#d9b45a')),
  ]);
}

/** An iron shepherd's-hook post (~2 m) for hanging wind chimes from its crook at +x. */
function hookGeometry(): THREE.BufferGeometry {
  const iron = new THREE.Color('#2f2b28');
  const crook = new THREE.TorusGeometry(0.17, 0.014, 6, 16, Math.PI);
  crook.translate(0.17, 1.95, 0);
  return mergeGeometries([
    paint(new THREE.CylinderGeometry(0.018, 0.02, 1.95, 8).translate(0, 0.975, 0), iron),
    paint(crook, iron),
    paint(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 6).translate(0.34, 1.91, 0), iron),
  ]);
}

/** Gentle pennant colourways: two or three soft bands each. */
const FLAG_COLOURS = [
  ['#e9a6a0', '#f6e8d6'],
  ['#9cc3d5', '#f4efe6', '#9cc3d5'],
  ['#e6c66a', '#f4ead2'],
  ['#a9c49a', '#f2ecdf', '#d99aa6'],
  ['#b8a7d6', '#f3ece4'],
];

interface Prop {
  kind: PropKind;
  group: THREE.Group;
  pos: THREE.Vector3;
  yaw: number;
  /** null while it's being carried under the finger. */
  t: number | null;
  delay: number;
  landed: boolean;
  /** Something that moves with the wind (a flag's cloth, a set of chimes). */
  anim?: { update(dt: number, dir: THREE.Vector2, strength: number): void };
  /** Seconds since a self-assembling prop (the gazebo) touched down. */
  assemble?: number;
  gone?: boolean;
  leaving?: number;
}

/**
 * Garden props: benches, lanterns and birdhouses. While you hold your finger down the prop
 * hovers under it (bobbing gently, turning to face the nearest path or pond); when you let go
 * it drops into place with a little squash and a thud.
 */
export class Props {
  readonly group = new THREE.Group();
  private readonly props: Prop[] = [];
  private readonly box = new THREE.Box3();
  private rng = createRng(3131);
  private readonly wood = new THREE.MeshLambertMaterial({ vertexColors: true });
  private readonly roof = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  private readonly glow = new THREE.MeshLambertMaterial({ color: '#3a2a1a', emissive: '#ffc277', emissiveIntensity: 1.7, transparent: true, opacity: 0.92 });
  private readonly variants: Record<PropKind, (() => THREE.Mesh[])[]>;
  private time = 0;
  /** The garden's wind, which flags and chimes answer to. */
  wind: WindField | null = null;
  /** A chime tube rang (frequency, 0–1 loudness, where). */
  onChime: (freq: number, volume: number, at: THREE.Vector3) => void = () => {};

  constructor(private readonly onLand: (kind: PropKind, at: THREE.Vector3, piece?: boolean) => void) {
    const vr = createRng(77);
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => {
      const x = new THREE.Mesh(g, m);
      x.castShadow = x.receiveShadow = true;
      return x;
    };
    const benches = [0, 1, 2, 3].map((i) => benchGeometry(vr, i % 2 === 1));
    const lanterns = [0, 1, 2].map(() => lanternGeometry(vr));
    const houses = [0, 1, 2, 3, 4].map(() => birdhouseGeometry(vr));
    const gazebos = [0, 1, 2].map(() => gazeboPieces(vr));
    const poles = [0, 1, 2].map(() => flagpoleGeometry(vr));
    const hook = hookGeometry();
    this.variants = {
      bench: benches.map((g) => () => [mesh(g, this.wood)]),
      lantern: lanterns.map((l) => () => [mesh(l.body, this.wood), mesh(l.glass, this.glow)]),
      birdhouse: houses.map((g) => () => [mesh(g, this.wood)]),
      flag: poles.map((g) => () => [mesh(g, this.wood)]),
      chimes: [() => [mesh(hook, this.wood)]],
      gazebo: gazebos.map((pieces) => () =>
        pieces.map((p, i) => {
          const m = mesh(p.geo, p.roof ? this.roof : this.wood);
          m.userData.order = i;
          return m;
        }),
      ),
    };
  }

  /** Back to an untouched garden (before an undo replays what remains). */
  reset() {
    for (const p of this.props) this.group.remove(p.group);
    this.props.length = 0;
    this.rng = createRng(3131);
  }

  get busy(): boolean {
    return this.props.some((p) => p.t === null || (p.t !== null && !p.landed) || p.leaving !== undefined || (p.assemble !== undefined && p.assemble < 6));
  }

  /** Places a bird could sit: a birdhouse roof, a lantern's top, the gazebo's peak. */
  perches(out: Perch[]) {
    for (const p of this.props) {
      if (p.gone || !p.landed || p.leaving !== undefined || (p.kind !== 'birdhouse' && p.kind !== 'lantern' && p.kind !== 'gazebo')) continue;
      if (p.kind === 'gazebo' && (p.assemble ?? 0) < 6) continue;
      this.box.setFromObject(p.group);
      out.push({ pos: new THREE.Vector3(p.pos.x, this.box.max.y - 0.02, p.pos.z), yaw: p.yaw, alive: () => !p.gone && p.leaving === undefined });
    }
  }

  /** After dark the lanterns burn brighter. */
  setNight(n: number) {
    this.glow.emissiveIntensity = 1.7 * (1 + n * 1.1);
  }

  /** The lanterns standing in the garden, for their pools of light after dark. */
  nightLights(out: NightLight[]) {
    for (const p of this.props) {
      if (p.kind !== 'lantern' || p.gone || !p.landed || p.leaving !== undefined) continue;
      this.box.setFromObject(p.group);
      const top = this.box.max.y;
      out.push({ pos: new THREE.Vector3(p.pos.x, top - 0.3, p.pos.z), pool: p.pos.clone(), radius: 2.2 });
    }
  }

  /** Is there a prop within `r` of (x, z)? */
  near(x: number, z: number, r: number): boolean {
    return this.props.some((p) => !p.gone && p.t !== null && (p.pos.x - x) ** 2 + (p.pos.z - z) ** 2 < r * r);
  }

  /** Start carrying a new prop under the finger. Returns a handle for move/drop. */
  pick(kind: PropKind): Prop {
    const list = this.variants[kind];
    const group = new THREE.Group();
    for (const m of list[Math.floor(this.rng() * list.length)]()) group.add(m);
    // Hand-made: each one leans a hair and sits a touch differently.
    group.userData.tilt = new THREE.Euler((this.rng() - 0.5) * 0.04, 0, (this.rng() - 0.5) * 0.04);
    group.userData.size = lerp(0.95, 1.05, this.rng());
    // A gazebo arrives as its deck alone; the rest goes together once it's down.
    if (kind === 'gazebo') for (const c of group.children) c.visible = c.userData.order === 0;
    const prop: Prop = { kind, group, pos: new THREE.Vector3(), yaw: 0, t: null, delay: 0, landed: false };
    if (kind === 'flag') {
      const colours = FLAG_COLOURS[Math.floor(this.rng() * FLAG_COLOURS.length)].map((c) => new THREE.Color(c));
      const flag = new Flag(new THREE.Vector3(0.03, 2.4, 0), lerp(0.85, 1.05, this.rng()), lerp(0.48, 0.58, this.rng()), colours);
      group.add(flag.mesh);
      prop.anim = flag;
    } else if (kind === 'chimes') {
      const set = new ChimeSet(Math.floor(this.rng() * 1e6), (f, v, at) => this.onChime(f, v, at));
      set.group.position.set(0.34, 1.86, 0);
      group.add(set.group);
      prop.anim = set;
    }
    this.group.add(group);
    this.props.push(prop);
    return prop;
  }

  move(prop: Prop, x: number, y: number, z: number, yaw: number) {
    prop.pos.set(x, y, z);
    prop.yaw = yaw;
    if (prop.t === null) this.place(prop, 0.3, 0);
  }

  drop(prop: Prop) {
    prop.t = 0;
    prop.delay = regrow.offset;
    if (prop.delay > 0) this.place(prop, 0.3, 0, 0.0001); // rebuilt from a save: waits its turn
  }

  /** Take back a prop that couldn't be placed. */
  discard(prop: Prop) {
    prop.gone = true;
    this.group.remove(prop.group);
  }

  erase(x: number, z: number, r: number): THREE.Vector3[] {
    const at: THREE.Vector3[] = [];
    for (const p of this.props) {
      if (p.gone || p.t === null || (p.pos.x - x) ** 2 + (p.pos.z - z) ** 2 > r * r) continue;
      p.gone = true;
      p.leaving = 0;
      at.push(p.pos);
    }
    return at;
  }

  /** The gazebo going together: each piece drops into place after the one before. */
  private assemble(p: Prop, dt: number) {
    p.assemble! += dt;
    for (const c of p.group.children) {
      const order = c.userData.order as number;
      if (!order) continue;
      const start = 0.12 + order * 0.14;
      const k = Math.min(1, Math.max(0, (p.assemble! - start) / 0.3));
      c.visible = k > 0;
      c.position.y = (1 - k * k) * 0.8;
      if (k > 0 && !c.userData.landed && k >= 1) {
        c.userData.landed = true;
        this.onLand(p.kind, p.pos, true);
      }
    }
  }

  private place(p: Prop, lift: number, squash: number, scale = 1) {
    const g = p.group;
    const s = (g.userData.size as number) * scale;
    g.position.set(p.pos.x, p.pos.y + lift, p.pos.z);
    const tilt = g.userData.tilt as THREE.Euler;
    g.rotation.set(tilt.x, p.yaw, tilt.z, 'YXZ');
    g.scale.set(s * (1 + squash * 0.3), s * (1 - squash), s * (1 + squash * 0.3));
  }

  update(dt: number) {
    this.time += dt;
    for (let i = this.props.length - 1; i >= 0; i--) {
      const p = this.props[i];
      if (p.leaving !== undefined) {
        p.leaving = Math.min(1, p.leaving + dt / 0.45);
        this.place(p, -p.leaving * 0.4, 0, Math.max(0.0001, 1 - p.leaving * p.leaving));
        if (p.leaving >= 1) {
          this.group.remove(p.group);
          this.props.splice(i, 1);
        }
        continue;
      }
      if (p.gone) continue;
      if (p.anim && this.wind) p.anim.update(dt, this.wind.direction, this.wind.sample(p.pos.x, p.pos.z));
      // Rebuilt at once (an undo replaying the garden): straight to standing, fully assembled.
      if (regrow.instant && p.t !== null && (!p.landed || (p.assemble ?? 6) < 6)) {
        p.delay = 0;
        p.t = 1;
        this.place(p, 0, 0);
        p.landed = true;
        if (p.kind === 'gazebo') {
          p.assemble = 0;
          this.assemble(p, 6);
        }
        continue;
      }
      if (p.t === null) {
        // Carried: hovering just above the ground, bobbing softly.
        this.place(p, 0.3 + Math.sin(this.time * 5) * 0.03, 0);
        continue;
      }
      if (p.landed) {
        if (p.assemble !== undefined && p.assemble < 6) this.assemble(p, dt);
        continue;
      }
      if (p.delay > 0) {
        p.delay -= dt;
        this.place(p, 0.3, 0, 0.0001);
        continue;
      }
      p.t += dt;
      const fall = 0.2;
      if (p.t < fall) {
        const k = p.t / fall;
        this.place(p, (1 - k * k) * 0.3, 0);
      } else {
        const s = p.t - fall;
        if (s - dt < 0) this.onLand(p.kind, p.pos);
        this.place(p, Math.max(0, Math.exp(-s * 11) * Math.sin(s * 22)) * 0.03, Math.exp(-s * 10) * Math.cos(s * 28) * 0.1);
        if (s > 0.6) {
          this.place(p, 0, 0);
          p.landed = true;
          if (p.kind === 'gazebo') p.assemble = 0;
        }
      }
    }
  }
}

export type { Prop };
