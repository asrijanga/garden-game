import * as THREE from 'three';
import { createRng, lerp } from '../core/random';
import { touch } from '../render/touch';

const MAX = 48;

interface Petal {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  rot: THREE.Euler;
  t: number;
  /** Lying on the ground: seconds left before it fades. */
  rest: number;
  landed: boolean;
  size: number;
}

/**
 * Now and then a petal lets go of an open rose and drifts down on the breeze, tumbling, to lie
 * on the soil or the grass a while before it fades. A handful at most, so it stays a quiet detail.
 */
export class FallingPetals {
  readonly mesh: THREE.InstancedMesh;
  private readonly petals: (Petal | null)[] = new Array(MAX).fill(null);
  private readonly rng = createRng(2121);
  private next = 3;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();

  constructor(
    private readonly roses: () => { pos: THREE.Vector3; species: string; color: THREE.Color }[],
    private readonly heightAt: (x: number, z: number) => number,
    private readonly wind: () => THREE.Vector2,
  ) {
    // A small cupped petal: a curved, rounded quad.
    const g = new THREE.CircleGeometry(0.5, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, (p.getX(i) ** 2 + p.getY(i) ** 2) * 0.35);
    g.scale(0.045, 0.055, 0.045);
    g.computeVertexNormals();
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), MAX);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    for (let i = 0; i < MAX; i++) {
      this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
      this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
    }
  }

  update(dt: number) {
    this.next -= dt;
    if (this.next <= 0) {
      this.next = lerp(1.5, 5, this.rng());
      const roses = this.roses().filter((h) => h.species.startsWith('rose'));
      const slot = this.petals.indexOf(null);
      if (roses.length && slot >= 0) {
        const r = roses[Math.floor(this.rng() * roses.length)];
        this.petals[slot] = {
          pos: r.pos.clone().add(new THREE.Vector3((this.rng() - 0.5) * 0.08, 0, (this.rng() - 0.5) * 0.08)),
          vel: new THREE.Vector3(0, 0, 0),
          spin: new THREE.Vector3(lerp(-3, 3, this.rng()), lerp(-2, 2, this.rng()), lerp(-3, 3, this.rng())),
          rot: new THREE.Euler(this.rng() * 6, this.rng() * 6, this.rng() * 6),
          t: 0,
          rest: lerp(8, 15, this.rng()),
          landed: false,
          size: lerp(0.8, 1.2, this.rng()),
        };
        this.mesh.setColorAt(slot, r.color.clone().multiplyScalar(lerp(0.9, 1.05, this.rng())));
        if (this.mesh.instanceColor) touch(this.mesh.instanceColor, slot);
      }
    }
    const w = this.wind();
    for (let i = 0; i < MAX; i++) {
      const p = this.petals[i];
      if (!p) continue;
      p.t += dt;
      let k = p.size;
      if (!p.landed) {
        // Falling slowly, drifting with the breeze, swaying side to side, tumbling over.
        const sway = Math.sin(p.t * 3.1 + i) * 0.25;
        p.vel.set(w.x * 0.6 + sway, -0.28 + Math.sin(p.t * 5 + i) * 0.08, w.y * 0.6 + Math.cos(p.t * 2.7 + i) * 0.2);
        p.pos.addScaledVector(p.vel, dt);
        p.rot.x += p.spin.x * dt;
        p.rot.y += p.spin.y * dt;
        p.rot.z += p.spin.z * dt;
        const ground = this.heightAt(p.pos.x, p.pos.z) + 0.01;
        if (p.pos.y <= ground) {
          p.pos.y = ground;
          p.landed = true;
          p.rot.set(-Math.PI / 2 + (this.rng() - 0.5) * 0.4, this.rng() * 6, 0);
        }
      } else {
        p.rest -= dt;
        if (p.rest < 2) k *= Math.max(0, p.rest / 2);
        if (p.rest <= 0) {
          this.petals[i] = null;
          this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
          touch(this.mesh.instanceMatrix, i);
          continue;
        }
        if (p.rest >= 2) continue; // lying still: nothing to update
      }
      this.q.setFromEuler(p.rot);
      this.mesh.setMatrixAt(i, this.m.compose(p.pos, this.q, this.s.setScalar(k)));
      touch(this.mesh.instanceMatrix, i);
    }
  }
}
