import * as THREE from 'three';
import { touch } from '../render/touch';
import { regrow } from '../core/regrow';

const CAPACITY = 4000;

/**
 * The soil of raised beds: flat discs at the top of the frame, one per dab of the bed, drawn with
 * the lawn's own shader so they show the bed's topping exactly as the ground does (overlapping
 * discs at the same height shade identically, so they read as one surface). They rise up
 * into place a moment after the bed is dug.
 */
export class RaisedSoil {
  readonly mesh: THREE.InstancedMesh;
  private readonly items: { x: number; y: number; z: number; r: number; t: number; delay: number }[] = [];
  private readonly rising: number[] = [];
  private readonly m = new THREE.Matrix4();

  constructor(material: THREE.Material) {
    const g = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
    g.deleteAttribute('uv');
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    g.setAttribute('aMeadow', new THREE.BufferAttribute(new Float32Array(n), 1));
    this.mesh = new THREE.InstancedMesh(g, material, CAPACITY);
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
  }

  add(x: number, y: number, z: number, r: number, delay: number) {
    if (this.mesh.count >= CAPACITY) return;
    const i = this.mesh.count++;
    this.mesh.visible = true;
    this.items[i] = { x, y, z, r, t: 0, delay: delay + regrow.offset };
    this.write(i, 0);
    this.rising.push(i);
  }

  private write(i: number, k: number) {
    const it = this.items[i];
    // Rises from below the rim as the frame fills.
    this.m.makeScale(it.r, 1, it.r).setPosition(it.x, it.y - (1 - k) * 0.2, it.z);
    if (k <= 0) this.m.makeScale(0, 0, 0);
    this.mesh.setMatrixAt(i, this.m);
    touch(this.mesh.instanceMatrix, i);
  }

  erase(x: number, z: number, r: number) {
    for (let i = 0; i < this.mesh.count; i++) {
      const it = this.items[i];
      if (it.r > 0 && (it.x - x) ** 2 + (it.z - z) ** 2 < r * r) {
        it.r = 0;
        this.m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.m);
        touch(this.mesh.instanceMatrix, i);
      }
    }
  }

  reset() {
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.items.length = 0;
    this.rising.length = 0;
  }

  update(dt: number) {
    for (let k = this.rising.length - 1; k >= 0; k--) {
      const i = this.rising[k];
      const it = this.items[i];
      if (!it || it.r === 0) {
        this.rising.splice(k, 1);
        continue;
      }
      if (it.delay > 0) {
        it.delay -= dt;
        continue;
      }
      it.t = Math.min(1, it.t + dt / 0.5);
      this.write(i, 1 - (1 - it.t) ** 2);
      if (it.t >= 1) this.rising.splice(k, 1);
    }
  }
}
