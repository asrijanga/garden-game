import * as THREE from 'three';
import { createRng, lerp } from '../core/random';
import { addWind } from '../render/wind';
import type { FlowerSpecies } from './flowerSpecies';

const VARIANTS = 4; // geometry variants per species (plus per-plant scale, yaw, colour)
const CAPACITY = 1500; // plants per variant
const UP = new THREE.Vector3(0, 1, 0);

/** Growth timeline (seconds after a plant's birth): sprout → bud → bloom. */
export const SPROUT_END = 0.9;
export const BLOOM_START = 1.1;
export const BLOOM_END = 2.8;

/**
 * Accumulates triangles plus the per-vertex data the shader needs to grow and unfurl a flower:
 *  - aIsPetal: tint by the plant's petal colour (stems and leaves stay green)
 *  - aHinge / aAxis / aClose: each petal pivots about its hinge from closed (bud) to open
 */
class FlowerMesh {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  petal: number[] = [];
  hinge: number[] = [];
  axis: number[] = [];
  close: number[] = [];

  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, opts: { n?: THREE.Vector3; shade?: [number, number, number]; color: THREE.Color; petal?: boolean; hinge?: THREE.Vector3; axis?: THREE.Vector3; close?: number }) {
    const n = opts.n ?? new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    if (n.y < 0 && !opts.n) n.negate();
    const shade = opts.shade ?? [1, 1, 1];
    [a, b, c].forEach((v, i) => {
      this.pos.push(v.x, v.y, v.z);
      this.nrm.push(n.x, n.y, n.z);
      this.col.push(opts.color.r * shade[i], opts.color.g * shade[i], opts.color.b * shade[i]);
      this.petal.push(opts.petal ? 1 : 0);
      const h = opts.hinge ?? v;
      this.hinge.push(h.x, h.y, h.z);
      const ax = opts.axis ?? UP;
      this.axis.push(ax.x, ax.y, ax.z);
      this.close.push(opts.close ?? 0);
    });
  }

  /** Append a stock three.js geometry (e.g. a floret), translated/oriented, as petal or not. */
  addGeometry(g: THREE.BufferGeometry, color: THREE.Color, petal: boolean, hinge: THREE.Vector3) {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.computeVertexNormals();
    const p = ng.attributes.position;
    const n = ng.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nrm.push(n.getX(i), n.getY(i), n.getZ(i));
      this.col.push(color.r, color.g, color.b);
      this.petal.push(petal ? 1 : 0);
      this.hinge.push(hinge.x, hinge.y, hinge.z);
      this.axis.push(0, 1, 0);
      this.close.push(0);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aIsPetal', new THREE.Float32BufferAttribute(this.petal, 1));
    g.setAttribute('aHinge', new THREE.Float32BufferAttribute(this.hinge, 3));
    g.setAttribute('aAxis', new THREE.Float32BufferAttribute(this.axis, 3));
    g.setAttribute('aClose', new THREE.Float32BufferAttribute(this.close, 1));
    return g;
  }
}

const STEM = new THREE.Color('#4f8a3a');
const LEAF = new THREE.Color('#5f9a42');
const WHITE = new THREE.Color('#ffffff');

function stem(m: FlowerMesh, height: number, lean: THREE.Vector3, rng: () => number) {
  const segs = 4;
  const r0 = 0.0055;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push(new THREE.Vector3(lean.x * t * t, height * t, lean.z * t * t));
  }
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const ra = r0 * (1 - (i / segs) * 0.4);
    const rb = r0 * (1 - ((i + 1) / segs) * 0.4);
    for (let k = 0; k < 4; k++) {
      const a0 = (k / 4) * Math.PI * 2;
      const a1 = ((k + 1) / 4) * Math.PI * 2;
      const o = (ang: number, r: number) => new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r);
      const n = o((a0 + a1) / 2, 1);
      m.tri(a.clone().add(o(a0, ra)), b.clone().add(o(a1, rb)), b.clone().add(o(a0, rb)), { n, color: STEM });
      m.tri(a.clone().add(o(a0, ra)), a.clone().add(o(a1, ra)), b.clone().add(o(a1, rb)), { n, color: STEM });
    }
  }
  // A few leaves along the stem (a rosette near the ground for short plants).
  const leaves = height < 0.26 ? 5 : 2 + Math.floor(rng() * 2);
  for (let i = 0; i < leaves; i++) {
    const az = rng() * Math.PI * 2;
    const y = height < 0.26 ? 0.015 + rng() * 0.03 : lerp(0.06, height * 0.5, rng());
    const len = height < 0.26 ? lerp(0.09, 0.12, rng()) : lerp(0.1, 0.16, rng());
    const tilt = height < 0.26 ? 0.25 : lerp(0.5, 0.9, rng());
    const d = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const dir = d.clone().multiplyScalar(Math.cos(tilt)).add(UP.clone().multiplyScalar(Math.sin(tilt)));
    const side = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(len * 0.22);
    const base = new THREE.Vector3(lean.x * 0.1, y, lean.z * 0.1);
    const mid = base.clone().addScaledVector(dir, len * 0.45);
    const tip = base.clone().addScaledVector(dir, len).add(new THREE.Vector3(0, -len * 0.12, 0));
    m.tri(base, mid.clone().add(side), tip, { color: LEAF, shade: [0.8, 1, 1.05] });
    m.tri(base, tip, mid.clone().sub(side), { color: LEAF, shade: [0.8, 1.05, 1] });
  }
  return pts[segs];
}

/** One petal: a soft, rounded blade from `hinge`, opened `open` radians from vertical. */
function petal(m: FlowerMesh, hinge: THREE.Vector3, az: number, open: number, len: number, width: number, cupIn: number, closeTo: number) {
  const d = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
  const v = d.clone().multiplyScalar(Math.sin(open)).addScaledVector(UP, Math.cos(open));
  const s = new THREE.Vector3(-d.z, 0, d.x);
  const axis = new THREE.Vector3().crossVectors(d, UP).normalize();
  const rows: [number, number][] = [
    [0, 0.25],
    [0.35, 0.9],
    [0.7, 0.85],
    [1, 0.15],
  ];
  const at = (t: number, w: number) =>
    hinge
      .clone()
      .addScaledVector(v, t * len)
      .addScaledVector(s, w * width * 0.5)
      .addScaledVector(UP, t * t * len * 0.12) // gentle upward curl at the tip
      .addScaledVector(d, -t * t * len * cupIn); // cupped petals curve inward
  const opts = (shadeA: number, shadeB: number, shadeC: number) => ({
    color: WHITE,
    petal: true,
    hinge,
    axis,
    close: Math.max(0, open - closeTo),
    shade: [shadeA, shadeB, shadeC] as [number, number, number],
  });
  const shadeAt = (t: number) => lerp(0.72, 1.06, t);
  for (let i = 0; i < rows.length - 1; i++) {
    const [t0, w0] = rows[i];
    const [t1, w1] = rows[i + 1];
    const a0 = at(t0, -w0);
    const a1 = at(t0, w0);
    const b0 = at(t1, -w1);
    const b1 = at(t1, w1);
    m.tri(a0, b0, b1, opts(shadeAt(t0), shadeAt(t1), shadeAt(t1)));
    m.tri(a0, b1, a1, opts(shadeAt(t0), shadeAt(t1), shadeAt(t0)));
  }
}

/** Storybook proportions: blooms drawn about twice life size so they read from the garden camera. */
const HEAD = 2.1;

/** Build one geometry variant of a species. */
export function flowerGeometry(sp: FlowerSpecies, seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const m = new FlowerMesh();
  const height = lerp(sp.height[0], sp.height[1], rng());
  const lean = new THREE.Vector3((rng() - 0.5) * 0.06, 0, (rng() - 0.5) * 0.06);
  const top = stem(m, height, lean, rng);
  const base = sp.form;
  const f: typeof base =
    base.kind === 'spike'
      ? { ...base, floretSize: base.floretSize * HEAD, spikeLength: base.spikeLength * 1.5 }
      : base.kind === 'cup'
        ? { ...base, length: base.length * HEAD, width: base.width * HEAD }
        : { ...base, length: base.length * HEAD, width: base.width * HEAD, centerSize: base.centerSize * HEAD };

  if (f.kind === 'radial') {
    const n = Math.round(lerp(f.petals[0], f.petals[1], rng()));
    for (let layer = 0; layer < f.layers; layer++) {
      const k = layer / Math.max(1, f.layers);
      const count = Math.max(4, Math.round(n * (1 - k * 0.3)));
      const off = rng() * Math.PI * 2;
      for (let i = 0; i < count; i++) {
        const az = off + (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.15;
        const open = f.open * (1 - k * 0.45) + (rng() - 0.5) * 0.12;
        const len = f.length * (1 - k * 0.22) * lerp(0.9, 1.1, rng());
        const hinge = top.clone().add(new THREE.Vector3(Math.cos(az), 0, Math.sin(az)).multiplyScalar(f.centerSize * 0.5)).add(new THREE.Vector3(0, layer * 0.004, 0));
        petal(m, hinge, az, open, len, f.width * lerp(0.9, 1.1, rng()), 0, 0.12);
      }
    }
    const centre = new THREE.IcosahedronGeometry(f.centerSize, 1);
    centre.scale(1, 0.55, 1);
    centre.translate(top.x, top.y + f.centerSize * 0.25, top.z);
    m.addGeometry(centre, new THREE.Color(f.center), false, top);
  } else if (f.kind === 'cup') {
    for (let i = 0; i < f.petals; i++) {
      const inner = i % 2 === 1;
      const az = (i / f.petals) * Math.PI * 2 + (rng() - 0.5) * 0.1;
      const hinge = top.clone().add(new THREE.Vector3(Math.cos(az), 0, Math.sin(az)).multiplyScalar(inner ? 0.006 : 0.01));
      petal(m, hinge, az, f.open * (inner ? 0.8 : 1), f.length * (inner ? 0.95 : 1), f.width, 0.22, 0.04);
    }
  } else {
    // Spike: florets spiral up the top of the stem, smaller toward the tip.
    for (let i = 0; i < f.florets; i++) {
      const t = i / (f.florets - 1);
      const y = top.y - f.spikeLength * (1 - t);
      const az = i * 2.39996; // golden angle
      const size = f.floretSize * lerp(1.1, 0.55, t);
      const d = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
      const attach = new THREE.Vector3(top.x * (y / top.y), y, top.z * (y / top.y));
      let g: THREE.BufferGeometry;
      if (f.bell) {
        // Foxglove bells: open cones hanging outward and down.
        g = new THREE.ConeGeometry(size * 0.55, size * 1.5, 7, 1, true);
        g.rotateX(Math.PI); // open end down
        const dir = d.clone().multiplyScalar(0.75).addScaledVector(UP, -0.55).normalize();
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir));
        g.translate(attach.x + d.x * size * 0.9, attach.y, attach.z + d.z * size * 0.9);
      } else {
        g = new THREE.OctahedronGeometry(size, 0);
        g.scale(0.8, 1.3, 0.8);
        g.translate(attach.x + d.x * size * 0.7, attach.y, attach.z + d.z * size * 0.7);
      }
      m.addGeometry(g, WHITE, true, attach);
    }
  }
  return m.build();
}

interface Pending {
  at: number;
  pos: THREE.Vector3;
}

/**
 * Every planted flower. One InstancedMesh per species variant; growth and petal unfurling run
 * in the vertex shader from each plant's birth time, so a bed of hundreds costs almost nothing.
 */
export class Flowers {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<string, THREE.InstancedMesh[]>();
  private readonly uniforms = { uFlowerTime: { value: 0 } };
  private readonly grid = new Map<string, { x: number; z: number; r: number }[]>();
  private readonly blooms: Pending[] = [];
  private time = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();

  constructor(species: FlowerSpecies[], private readonly onBloom: (p: THREE.Vector3) => void) {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    addWind(
      material,
      'clamp(position.y / 0.55, 0.0, 1.0)',
      (shader) => {
        Object.assign(shader.uniforms, this.uniforms);
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            /* glsl */ `#include <common>
            uniform float uFlowerTime;
            attribute float aIsPetal, aClose, aBirth, aBloomMax;
            attribute vec3 aHinge, aAxis, aPetalColor;`,
          )
          .replace(
            '#include <color_vertex>',
            '#include <color_vertex>\nvColor.rgb = mix(vColor.rgb, vColor.rgb * aPetalColor, aIsPetal);',
          )
          .replace(
            '#include <begin_vertex>',
            /* glsl */ `#include <begin_vertex>
            {
              float age = uFlowerTime - aBirth;
              // Sprout: the whole plant rises from the soil with a little overshoot.
              float g = clamp(age / ${SPROUT_END.toFixed(2)}, 0.0, 1.0);
              float sprout = g * g * (3.0 - 2.0 * g) + sin(g * 3.14159) * 0.12;
              // Bud → bloom: petals pivot open about their hinges and swell to full size.
              float bloom = smoothstep(${BLOOM_START.toFixed(2)}, ${BLOOM_END.toFixed(2)}, age) * aBloomMax;
              if (aIsPetal > 0.5) {
                vec3 rel = transformed - aHinge;
                float ang = (1.0 - bloom) * aClose;
                float c = cos(ang), s = sin(ang);
                rel = rel * c + cross(aAxis, rel) * s + aAxis * dot(aAxis, rel) * (1.0 - c);
                rel *= mix(0.55, 1.0, bloom);
                transformed = aHinge + rel;
              }
              transformed *= max(sprout, 0.0001);
            }`,
          );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <normal_fragment_begin>',
          // Petals and leaves are thin and double-sided: keep their normals facing the light.
          '#include <normal_fragment_begin>\nnormal = normalize(vNormal);',
        );
      },
      0.5,
    );

    species.forEach((sp, si) => {
      const list: THREE.InstancedMesh[] = [];
      for (let v = 0; v < VARIANTS; v++) {
        const geo = flowerGeometry(sp, 1000 + si * 97 + v * 13);
        geo.setAttribute('aBirth', new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY).fill(1e6), 1));
        geo.setAttribute('aBloomMax', new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY), 1));
        geo.setAttribute('aPetalColor', new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3));
        const mesh = new THREE.InstancedMesh(geo, material, CAPACITY);
        mesh.count = 0;
        mesh.visible = false;
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        list.push(mesh);
        this.group.add(mesh);
      }
      this.meshes.set(sp.id, list);
    });
  }

  /** Is there a plant within `r` of (x, z)? */
  isCrowded(x: number, z: number, r: number): boolean {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    for (let i = cx - 1; i <= cx + 1; i++) {
      for (let j = cz - 1; j <= cz + 1; j++) {
        for (const p of this.grid.get(`${i},${j}`) ?? []) {
          const min = Math.min(r, p.r);
          if ((p.x - x) ** 2 + (p.z - z) ** 2 < min * min) return true;
        }
      }
    }
    return false;
  }

  plant(sp: FlowerSpecies, variant: number, x: number, y: number, z: number, yaw: number, scale: number, delay: number, bloomMax: number, color: THREE.Color) {
    const mesh = this.meshes.get(sp.id)![variant % VARIANTS];
    if (mesh.count >= CAPACITY) return;
    const i = mesh.count++;
    mesh.visible = true;
    this.q.setFromAxisAngle(UP, yaw);
    this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(scale, scale, scale));
    mesh.setMatrixAt(i, this.m);
    mesh.instanceMatrix.addUpdateRange(i * 16, 16);
    mesh.instanceMatrix.needsUpdate = true;
    const g = mesh.geometry;
    const birth = this.time + delay;
    const set = (name: string, values: number[]) => {
      const a = g.attributes[name] as THREE.InstancedBufferAttribute;
      a.array.set(values, i * a.itemSize);
      a.addUpdateRange(i * a.itemSize, a.itemSize);
      a.needsUpdate = true;
    };
    set('aBirth', [birth]);
    set('aBloomMax', [bloomMax]);
    set('aPetalColor', [color.r, color.g, color.b]);

    const key = `${Math.floor(x)},${Math.floor(z)}`;
    if (!this.grid.has(key)) this.grid.set(key, []);
    this.grid.get(key)!.push({ x, z, r: sp.spacing });
    if (bloomMax > 0.5) this.blooms.push({ at: birth + BLOOM_START + 0.6, pos: new THREE.Vector3(x, y, z) });
  }

  update(dt: number) {
    this.time += dt;
    this.uniforms.uFlowerTime.value = this.time;
    for (let i = this.blooms.length - 1; i >= 0; i--) {
      if (this.time >= this.blooms[i].at) {
        this.onBloom(this.blooms[i].pos);
        this.blooms.splice(i, 1);
      }
    }
  }
}
