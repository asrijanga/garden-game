import * as THREE from 'three';

/** Finds the point on the (gently rolling) ground under a screen position. */
export class GroundPicker {
  private readonly ray = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();

  constructor(
    private readonly camera: THREE.Camera,
    /** The drawing surface (its size; touches arrive relative to its corner). */
    private readonly el: { getBoundingClientRect(): { left: number; top: number; width: number; height: number } },
    private readonly heightAt: (x: number, z: number) => number,
  ) {}

  pick(clientX: number, clientY: number, out = new THREE.Vector3()): THREE.Vector3 | null {
    const r = this.el.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const { origin, direction } = this.ray.ray;
    if (direction.y > -1e-3) return null;
    // Intersect the ray with the height field by refining against a flat plane a few times.
    let h = 0;
    for (let i = 0; i < 6; i++) {
      const t = (h - origin.y) / direction.y;
      out.copy(origin).addScaledVector(direction, t);
      h = this.heightAt(out.x, out.z);
    }
    out.y = h;
    return out;
  }
}
