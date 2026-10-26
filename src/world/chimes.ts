import * as THREE from 'three';
import { createRng, lerp } from '../core/random';

/** Pentatonic notes (Hz), longest tube lowest, so any combination sounds sweet. */
const NOTES = [523.25, 587.33, 659.25, 783.99, 880.0];

interface Pendulum {
  /** Swing angles about local x and z, and their speeds. */
  ax: number;
  az: number;
  vx: number;
  vz: number;
  len: number;
}

/**
 * A set of wind chimes: five tubes round a wooden top, and a clapper with a sail below that
 * catches the wind. Each is a little pendulum; when the clapper meets a tube, the tube rings
 * (pitched by its length) and the two bounce apart. Lives in its parent's local space.
 */
export class ChimeSet {
  readonly group = new THREE.Group();
  private readonly tubes: { mesh: THREE.Mesh; pivot: THREE.Group; p: Pendulum; at: THREE.Vector2; note: number; last: number }[] = [];
  private readonly clapper: { pivot: THREE.Group; p: Pendulum };
  private readonly local = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly world = new THREE.Vector3();
  private time = 0;

  constructor(
    seed: number,
    private readonly onRing: (freq: number, volume: number, at: THREE.Vector3) => void,
  ) {
    const rng = createRng(seed);
    const wood = new THREE.MeshLambertMaterial({ color: '#8a6a4a' });
    const metal = new THREE.MeshLambertMaterial({ color: '#c9c3b6', emissive: '#4a463e', emissiveIntensity: 0.25 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.025, 14), wood);
    top.castShadow = true;
    this.group.add(top);
    const lengths = [0.48, 0.43, 0.38, 0.33, 0.28].map((l) => l * lerp(0.95, 1.05, rng()));
    lengths.forEach((len, i) => {
      const a = (i / lengths.length) * Math.PI * 2 + 0.3;
      const at = new THREE.Vector2(Math.cos(a) * 0.09, Math.sin(a) * 0.09);
      const pivot = new THREE.Group();
      pivot.position.set(at.x, -0.03, at.y);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 8), metal);
      mesh.position.y = -0.04 - len / 2; // a short string, then the tube
      mesh.castShadow = true;
      pivot.add(mesh);
      this.group.add(pivot);
      this.tubes.push({ mesh, pivot, p: { ax: 0, az: 0, vx: 0, vz: 0, len: 0.04 + len / 2 }, at, note: NOTES[i], last: -1 });
    });
    // The clapper (a small wooden disc at the tubes' middle height) and its sail, lower down.
    const cp = new THREE.Group();
    cp.position.y = -0.03;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 12), wood);
    disc.position.y = -0.24;
    const sail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.008), wood);
    sail.position.y = -0.55;
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.5, 4), new THREE.MeshLambertMaterial({ color: '#d9d2c4' }));
    string.position.y = -0.25;
    cp.add(disc, sail, string);
    disc.castShadow = sail.castShadow = true;
    this.group.add(cp);
    this.clapper = { pivot: cp, p: { ax: 0, az: 0, vx: 0, vz: 0, len: 0.24 } };
  }

  /** Swing in the wind (world direction `dir`, local gust `strength`), ringing on contact. */
  update(dt: number, dir: THREE.Vector2, strength: number) {
    this.time += dt;
    const h = Math.min(dt, 1 / 30);
    this.group.getWorldQuaternion(this.q).invert();
    this.local.set(dir.x, 0, dir.y).applyQuaternion(this.q);
    // Gusts arrive unevenly: a wandering push, stronger on the clapper's sail.
    const gust = strength * strength;
    const wob = (k: number) => Math.sin(this.time * (1.3 + k * 0.37) + k * 2.1) * 0.5 + Math.sin(this.time * (2.9 + k * 0.23) + k) * 0.3;
    const swing = (p: Pendulum, force: number, k: number) => {
      const g = 9.8 / p.len;
      const fx = this.local.z * force * (0.7 + wob(k)) ; // wind along z tips about x
      const fz = -this.local.x * force * (0.7 + wob(k + 3));
      p.vx += (-g * p.ax - p.vx * 1.6 + fx) * h;
      p.vz += (-g * p.az - p.vz * 1.6 + fz) * h;
      p.ax += p.vx * h;
      p.az += p.vz * h;
    };
    this.tubes.forEach((t, i) => swing(t.p, gust * 3.0, i));
    swing(this.clapper.p, gust * 9.0, 9);
    // Contact: compare where the clapper and each tube are at the clapper's height.
    const cy = 0.24;
    const cx = Math.sin(this.clapper.p.az) * cy * -1;
    const cz = Math.sin(this.clapper.p.ax) * cy;
    for (const t of this.tubes) {
      const tx = t.at.x - Math.sin(t.p.az) * cy;
      const tz = t.at.y + Math.sin(t.p.ax) * cy;
      const dx = tx - cx;
      const dz = tz - cz;
      const d = Math.hypot(dx, dz);
      if (d > 0.058) continue;
      // Relative speed toward each other decides how hard it rings.
      const rv = Math.abs((this.clapper.p.vz - t.p.vz) * dx - (this.clapper.p.vx - t.p.vx) * dz) / Math.max(d, 1e-3);
      if (this.time - t.last > 0.18 && rv > 0.05) {
        t.last = this.time;
        this.onRing(t.note * lerp(0.995, 1.005, Math.random()), Math.min(1, rv * 0.6), this.group.getWorldPosition(this.world));
      }
      // Bounce apart.
      const push = (0.058 - d) / 0.058;
      const nx = dx / Math.max(d, 1e-3);
      const nz = dz / Math.max(d, 1e-3);
      this.clapper.p.vz += nx * push * 3;
      this.clapper.p.vx -= nz * push * 3;
      t.p.vz -= nx * push * 1.5;
      t.p.vx += nz * push * 1.5;
    }
    // (Angles are kept so +ax swings toward +z and +az toward -x; three's rotations are the reverse.)
    for (const t of this.tubes) t.pivot.rotation.set(-t.p.ax, 0, -t.p.az);
    this.clapper.pivot.rotation.set(-this.clapper.p.ax, 0, -this.clapper.p.az);
  }
}
