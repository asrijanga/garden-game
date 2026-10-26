import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng, lerp } from '../core/random';
import { regrow } from '../core/regrow';

export type PropKind = 'bench' | 'lantern' | 'birdhouse';

type Rng = () => number;

/** A rounded box of the given size, centred at (x, y, z), in one flat colour. */
function block(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.Color, round = 0.012, rot?: THREE.Euler): THREE.BufferGeometry {
  const g = new RoundedBoxGeometry(w, h, d, 1, Math.min(round, w / 2.1, h / 2.1, d / 2.1)).toNonIndexed();
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

interface Prop {
  kind: PropKind;
  group: THREE.Group;
  pos: THREE.Vector3;
  yaw: number;
  /** null while it's being carried under the finger. */
  t: number | null;
  delay: number;
  landed: boolean;
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
  private readonly rng = createRng(3131);
  private readonly wood = new THREE.MeshLambertMaterial({ vertexColors: true });
  private readonly glow = new THREE.MeshLambertMaterial({ color: '#3a2a1a', emissive: '#ffc277', emissiveIntensity: 1.7, transparent: true, opacity: 0.92 });
  private readonly variants: Record<PropKind, (() => THREE.Mesh[])[]>;
  private time = 0;

  constructor(private readonly onLand: (kind: PropKind, at: THREE.Vector3) => void) {
    const vr = createRng(77);
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => {
      const x = new THREE.Mesh(g, m);
      x.castShadow = x.receiveShadow = true;
      return x;
    };
    const benches = [0, 1, 2, 3].map((i) => benchGeometry(vr, i % 2 === 1));
    const lanterns = [0, 1, 2].map(() => lanternGeometry(vr));
    const houses = [0, 1, 2, 3, 4].map(() => birdhouseGeometry(vr));
    this.variants = {
      bench: benches.map((g) => () => [mesh(g, this.wood)]),
      lantern: lanterns.map((l) => () => [mesh(l.body, this.wood), mesh(l.glass, this.glow)]),
      birdhouse: houses.map((g) => () => [mesh(g, this.wood)]),
    };
  }

  get busy(): boolean {
    return this.props.some((p) => p.t === null || (p.t !== null && !p.landed) || p.leaving !== undefined);
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
    const prop: Prop = { kind, group, pos: new THREE.Vector3(), yaw: 0, t: null, delay: 0, landed: false };
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
      if (p.t === null) {
        // Carried: hovering just above the ground, bobbing softly.
        this.place(p, 0.3 + Math.sin(this.time * 5) * 0.03, 0);
        continue;
      }
      if (p.landed) continue;
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
        }
      }
    }
  }
}

export type { Prop };
