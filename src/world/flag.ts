import * as THREE from 'three';

const NU = 13; // particles along the flag (from the pole out)
const NV = 7; // particles down its hoist

/**
 * A cloth pennant on a pole, simulated with Verlet particles and distance constraints. The
 * wind (the garden's own gusts) pushes it out; in the calm it droops and hangs, then lifts
 * again as the next gust rolls through. Lives in its parent's local space, so it moves with
 * the pole (carried, dropped, bounced).
 */
export class Flag {
  readonly mesh: THREE.Mesh;
  private readonly pos: Float32Array;
  private readonly prev: Float32Array;
  private readonly pinned: Uint8Array;
  private readonly links: [number, number, number][] = [];
  private readonly anchor: Float32Array;
  private readonly local = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private time = Math.random() * 10;

  /**
   * @param top local position of the top of the hoist (at the pole)
   * @param length how far the flag flies out
   * @param height hoist height at the pole (it tapers to a point: a pennant)
   */
  constructor(top: THREE.Vector3, length: number, height: number, colors: THREE.Color[]) {
    const n = NU * NV;
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.pinned = new Uint8Array(n);
    this.anchor = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    const col = new Float32Array(n * 3);
    const idx: number[] = [];
    for (let v = 0; v < NV; v++) {
      for (let u = 0; u < NU; u++) {
        const i = v * NU + u;
        const fu = u / (NU - 1);
        const fv = v / (NV - 1);
        // A pennant: full height at the pole, tapering to a narrow tip; hanging at first.
        const h = height * (1 - 0.82 * fu);
        const y = top.y - (height - h) / 2 - fv * h;
        this.pos.set([top.x + fu * length * 0.3, y - fu * length * 0.6, top.z], i * 3);
        this.prev.set(this.pos.subarray(i * 3, i * 3 + 3), i * 3);
        this.anchor.set([top.x, top.y - fv * height, top.z], i * 3);
        if (u === 0) this.pinned[i] = 1;
        // Soft bands of colour down the hoist.
        const c = colors[Math.min(colors.length - 1, Math.floor(fv * colors.length * 0.999))];
        col.set([c.r, c.g, c.b], i * 3);
        if (u < NU - 1 && v < NV - 1) idx.push(i, i + NU, i + 1, i + 1, i + NU, i + NU + 1);
      }
    }
    // Structural and shear links, with rest lengths from the flat, spread-out shape.
    const rest = (a: number, b: number) => {
      const ua = a % NU, va = Math.floor(a / NU), ub = b % NU, vb = Math.floor(b / NU);
      const pa = new THREE.Vector2((ua / (NU - 1)) * length, top.y - (height - height * (1 - 0.82 * (ua / (NU - 1)))) / 2 - (va / (NV - 1)) * height * (1 - 0.82 * (ua / (NU - 1))));
      const pb = new THREE.Vector2((ub / (NU - 1)) * length, top.y - (height - height * (1 - 0.82 * (ub / (NU - 1)))) / 2 - (vb / (NV - 1)) * height * (1 - 0.82 * (ub / (NU - 1))));
      return pa.distanceTo(pb);
    };
    for (let v = 0; v < NV; v++) {
      for (let u = 0; u < NU; u++) {
        const i = v * NU + u;
        if (u < NU - 1) this.links.push([i, i + 1, rest(i, i + 1)]);
        if (v < NV - 1) this.links.push([i, i + NU, rest(i, i + NU)]);
        if (u < NU - 1 && v < NV - 1) {
          this.links.push([i, i + NU + 1, rest(i, i + NU + 1)]);
          this.links.push([i + 1, i + NU, rest(i + 1, i + NU)]);
        }
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
  }

  /** Step the cloth. `dir` is the world wind direction, `strength` the local gust (~0–1.2). */
  update(dt: number, dir: THREE.Vector2, strength: number) {
    this.time += dt;
    // Wind into the flag's own (local) frame.
    this.mesh.parent?.getWorldQuaternion(this.q).invert();
    this.local.set(dir.x, 0, dir.y).applyQuaternion(this.q);
    const steps = 2;
    const h = Math.min(dt, 1 / 30) / steps;
    const push = 4 + strength * 16; // calm: a breath; a gust: streaming out
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < NU * NV; i++) {
        const k = i * 3;
        if (this.pinned[i]) {
          this.pos[k] = this.anchor[k];
          this.pos[k + 1] = this.anchor[k + 1];
          this.pos[k + 2] = this.anchor[k + 2];
          continue;
        }
        const u = (i % NU) / (NU - 1);
        // Flutter: a ripple travelling out along the cloth, livelier in a gust.
        const flutter = Math.sin(this.time * (7 + strength * 6) - u * 7 + Math.floor(i / NU) * 0.4) * (0.6 + strength * 3) * u;
        const ax = this.local.x * push + -this.local.z * flutter;
        const ay = -3.6 + Math.sin(this.time * 3.1 + u * 4) * 0.4;
        const az = this.local.z * push + this.local.x * flutter;
        const x = this.pos[k], y = this.pos[k + 1], z = this.pos[k + 2];
        const damp = 0.975;
        this.pos[k] = x + (x - this.prev[k]) * damp + ax * h * h;
        this.pos[k + 1] = y + (y - this.prev[k + 1]) * damp + ay * h * h;
        this.pos[k + 2] = z + (z - this.prev[k + 2]) * damp + az * h * h;
        this.prev[k] = x;
        this.prev[k + 1] = y;
        this.prev[k + 2] = z;
      }
      for (let it = 0; it < 3; it++) {
        for (const [a, b, r] of this.links) {
          const ka = a * 3, kb = b * 3;
          const dx = this.pos[kb] - this.pos[ka];
          const dy = this.pos[kb + 1] - this.pos[ka + 1];
          const dz = this.pos[kb + 2] - this.pos[ka + 2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          const diff = (d - r) / d;
          const wa = this.pinned[a] ? 0 : this.pinned[b] ? 1 : 0.5;
          const wb = this.pinned[b] ? 0 : this.pinned[a] ? 1 : 0.5;
          this.pos[ka] += dx * diff * wa;
          this.pos[ka + 1] += dy * diff * wa;
          this.pos[ka + 2] += dz * diff * wa;
          this.pos[kb] -= dx * diff * wb;
          this.pos[kb + 1] -= dy * diff * wb;
          this.pos[kb + 2] -= dz * diff * wb;
        }
      }
    }
    const geo = this.mesh.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  }
}
