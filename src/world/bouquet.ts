import * as THREE from 'three';

/** Where the stems are cut, below the tie (m): level across the bundle, as with a sharp knife. */
const CUT = 0.15;
/** How tall a bouquet stands, roughly (the tallest heads), before each stem's own variation. */
const TALL = 0.5;

/**
 * A hand-tied bouquet, on a turntable of its own: the cut stems (each its full close-up, without
 * the leaves low down that would sit below the water), laid in a spiral round the tie the way a
 * florist builds one, so every stem leans the same way round and the heads open into a dome.
 * Tied with a few turns of twine and a knot, nothing else; the stems cut level below.
 *
 * It's a scene of its own (a black backdrop and gentle light), drawn instead of the garden
 * while it's shown. Drag to turn it; it turns slowly on its own.
 */
export class Bouquet {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.02, 20);
  /** Keeps the stems below the cut from being drawn (set as the renderer's clipping while shown). */
  readonly clip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), CUT)];
  active = false;
  private readonly holder = new THREE.Group();
  private stems: THREE.InstancedMesh[] = [];
  private twine: THREE.Mesh | null = null;
  private total = 0;
  private arrived = 0;
  private spin = 0;
  private spinVel = 0;
  private drag: { x: number; t: number } | null = null;
  private readonly twineMat = new THREE.MeshLambertMaterial({ vertexColors: true });

  constructor() {
    // A plain black backdrop: the flower colours stand out cleanly against it (a light one let
    // similar petal tones blend together).
    this.scene.background = new THREE.Color('#000000');
    this.scene.add(new THREE.HemisphereLight('#f4f0ea', '#8a7a5a', 1.05));
    const sun = new THREE.DirectionalLight('#fff1dc', 1.7);
    sun.position.set(-1.2, 2.2, 1.6);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#e2ecff', 0.45);
    fill.position.set(1.5, 0.6, -1);
    this.scene.add(fill);
    this.scene.add(this.holder);
  }

  /** A new bouquet of `count` stems (they arrive one by one: see `add`). */
  begin(count: number) {
    this.clear();
    this.total = count;
    this.arrived = 0;
    this.spin = 0.4;
    this.spinVel = 0;
    this.active = true;
  }

  /** Done with it: back to the garden. */
  end() {
    this.clear();
    this.active = false;
  }

  /** Every stem in, and tied. */
  get ready(): boolean {
    return this.active && this.arrived >= this.total && this.twine !== null;
  }

  private clear() {
    for (const m of this.stems) {
      this.holder.remove(m);
      m.geometry.dispose();
    }
    this.stems = [];
    if (this.twine) {
      this.holder.remove(this.twine);
      this.twine.geometry.dispose();
      this.twine = null;
    }
  }

  /**
   * Stem `k` (of the `begin` count) has been grown: its close-up geometry (stripped of its low
   * leaves), drawn with its species' own material in its own colours.
   */
  add(k: number, geo: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], petal: THREE.Color, edge: THREE.Color, seed: number) {
    if (!this.active) {
      geo.dispose();
      return;
    }
    const rnd = mulberry(seed * 7 + k * 131);
    geo.computeBoundingBox();
    const tall = Math.max(0.05, geo.boundingBox!.max.y);
    // Each stem brought to bouquet size (a little taller in the middle, shorter round the edge),
    // and gripped about halfway down.
    const n = this.total;
    const ring = Math.sqrt((k + 0.5) / n);
    // (Only part way: a tall foxglove still stands above a daisy, as it would in a real bunch.)
    const s = THREE.MathUtils.clamp(Math.pow((TALL * (1.06 - ring * 0.28) * (0.94 + rnd() * 0.12)) / tall, 0.6), 0.45, 1.8);
    const tie = tall * 0.47;
    // The spiral: round by the golden angle, leaning out the more the further from the middle,
    // and every stem turned the same way round (that's what makes it hold its shape).
    const around = k * 2.39996 + rnd() * 0.3;
    const lean = 0.06 + ring * 0.5 + (rnd() - 0.5) * 0.08;
    const radial = new THREE.Vector3(Math.cos(around), 0, Math.sin(around));
    const twist = radial.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.55);
    const axis = new THREE.Vector3(0, 1, 0).cross(twist).normalize();
    const m = new THREE.Matrix4()
      .makeTranslation(radial.x * ring * 0.012, 0, radial.z * ring * 0.012)
      .multiply(new THREE.Matrix4().makeRotationAxis(axis, lean))
      .multiply(new THREE.Matrix4().makeRotationY(rnd() * Math.PI * 2))
      .multiply(new THREE.Matrix4().makeScale(s, s, s))
      .multiply(new THREE.Matrix4().makeTranslation(0, -tie, 0));
    // Fully grown and open; its own colours.
    const count = 1;
    geo.setAttribute('aLife', new THREE.InstancedBufferAttribute(new Float32Array([-1e4, 1]), 2));
    geo.setAttribute('aPetalColor', new THREE.InstancedBufferAttribute(new Float32Array([petal.r, petal.g, petal.b]), 3));
    geo.setAttribute('aEdgeColor', new THREE.InstancedBufferAttribute(new Float32Array([edge.r, edge.g, edge.b]), 3));
    const mesh = new THREE.InstancedMesh(geo, material, count);
    mesh.setMatrixAt(0, m);
    mesh.frustumCulled = false;
    this.holder.add(mesh);
    this.stems.push(mesh);
    this.arrived++;
    if (this.arrived >= this.total) this.tie();
  }

  /** A few turns of twine round the stems where they cross, a knot, and two loose ends. */
  private tie() {
    // How thick the bundle is at the tie: from the stems themselves.
    let r = 0.006;
    const v = new THREE.Vector3();
    const im = new THREE.Matrix4();
    for (const mesh of this.stems) {
      mesh.getMatrixAt(0, im);
      const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i += 3) {
        v.fromBufferAttribute(pos, i).applyMatrix4(im);
        if (Math.abs(v.y) < 0.012) r = Math.max(r, Math.hypot(v.x, v.z));
      }
    }
    r = Math.min(r, 0.05) + 0.0015;
    const rnd = mulberry(this.total * 977 + 3);
    const pts: THREE.Vector3[] = [];
    const turns = 6 + Math.floor(rnd() * 3);
    const steps = turns * 24;
    // Wound by hand: each turn a touch looser or tighter, crossing over itself here and there.
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = t * turns * Math.PI * 2;
      const rr = r * (1 + Math.sin(a * 0.37 + rnd() * 0.2) * 0.04);
      const y = (t - 0.5) * 0.02 + Math.sin(a * 0.5) * 0.0012;
      pts.push(new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr));
    }
    // The knot, then the two ends, hanging and curling a little.
    const last = pts[pts.length - 1];
    const out = last.clone().setY(0).normalize();
    const ends: THREE.Vector3[][] = [0, 1].map((e) => {
      const side = new THREE.Vector3(-out.z, 0, out.x).multiplyScalar(e ? 1 : -1);
      const len = 0.04 + rnd() * 0.025;
      const end: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        end.push(
          last.clone()
            .addScaledVector(out, 0.004 + t * 0.012)
            .addScaledVector(side, t * 0.01 + Math.sin(t * 3) * 0.004)
            .add(new THREE.Vector3(0, -t * len, 0)),
        );
      }
      return end;
    });
    const parts = [
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), steps, 0.0011, 5, false),
      ...ends.map((e) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(e), 16, 0.001, 5, false)),
      new THREE.SphereGeometry(0.0028, 8, 6).translate(last.x + out.x * 0.002, last.y, last.z + out.z * 0.002),
    ];
    const geo = mergeTubes(parts, rnd);
    this.twine = new THREE.Mesh(geo, this.twineMat);
    this.holder.add(this.twine);
  }

  pointer(type: string, x: number, t: number) {
    if (type === 'pointerdown') this.drag = { x, t };
    else if (type === 'pointermove' && this.drag) {
      const d = (x - this.drag.x) * 0.012;
      const dt = Math.max(1, t - this.drag.t) / 1000;
      this.spin += d;
      this.spinVel = THREE.MathUtils.lerp(this.spinVel, d / dt, 0.5);
      this.drag = { x, t };
    } else if (type === 'pointerup' || type === 'pointercancel') this.drag = null;
  }

  update(dt: number, aspect: number) {
    if (!this.active) return;
    if (!this.drag) {
      // Coasts after a flick, settling back to a slow turn of its own.
      this.spinVel += (0.28 - this.spinVel) * Math.min(1, dt * 1.5);
      this.spin += this.spinVel * dt;
    }
    this.holder.rotation.y = this.spin;
    // Framed whole, a little from above, whatever the screen's shape.
    const cam = this.camera;
    cam.aspect = aspect;
    const half = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const fit = Math.max(0.36 / half, 0.27 / (half * aspect));
    const pitch = 0.32;
    cam.position.set(0, 0.12 + Math.sin(pitch) * fit, Math.cos(pitch) * fit);
    // (Aimed a little low, so the card along the bottom doesn't hide the stems.)
    cam.lookAt(0, 0.1, 0);
    cam.updateProjectionMatrix();
  }
}

/**
 * A cut stem, for a bouquet: the plant without what grows low down (its basal leaves and the
 * leaves on the lower stem would sit below the tie, in the water); only what's near its middle
 * (the stems themselves) carries on down there.
 */
export function forBouquet(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.attributes.position;
  let tall = 0;
  for (let i = 0; i < pos.count; i++) tall = Math.max(tall, pos.getY(i));
  const below = tall * 0.5;
  const near = tall * 0.045;
  const keep: number[] = [];
  for (let t = 0; t + 2 < pos.count; t += 3) {
    let y = 0;
    let x = 0;
    let z = 0;
    for (let v = t; v < t + 3; v++) {
      x += pos.getX(v) / 3;
      y += pos.getY(v) / 3;
      z += pos.getZ(v) / 3;
    }
    if (y >= below || Math.hypot(x, z) < near) keep.push(t);
  }
  for (const [name, a] of Object.entries(g.attributes)) {
    const n = a.itemSize;
    const src = a.array as Float32Array;
    const out = new Float32Array(keep.length * 3 * n);
    keep.forEach((t, k) => out.set(src.subarray(t * n, (t + 3) * n), k * 3 * n));
    g.setAttribute(name, new (a.constructor as typeof THREE.BufferAttribute)(out, n));
  }
  return g;
}

/** The twine's pieces as one mesh, in a natural jute colour that varies a little along it. */
function mergeTubes(parts: THREE.BufferGeometry[], rnd: () => number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const base = new THREE.Color('#bfa070');
  const c = new THREE.Color();
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    const a = g.attributes.position;
    const n = g.attributes.normal;
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      if (i % 3 === 0) c.copy(base).multiplyScalar(0.88 + rnd() * 0.2);
      col.push(c.r, c.g, c.b);
    }
    p.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
