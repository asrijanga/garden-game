import * as THREE from 'three';
import type { Props, Prop, PropKind } from '../world/props';

/** How close to a path's centre line each prop may stand (beside the gravel, not on it). */
const PATH_CLEAR: Record<PropKind, number> = { bench: 1.05, lantern: 0.8, birdhouse: 0.9 };

/**
 * Places garden props. Touch to pick one up where your finger is; slide to move it (it turns to
 * face the nearest path or pond as you go); let go to set it down. Nothing nearby to face? It
 * faces you.
 */
export class PropBrush {
  kind: PropKind = 'bench';
  private carrying: Prop | null = null;
  private at = new THREE.Vector2();

  constructor(
    private readonly props: Props,
    private readonly heightAt: (x: number, z: number) => number,
    private readonly nearestPath: (x: number, z: number, reach: number) => THREE.Vector2 | null,
    private readonly distanceToPaths: (x: number, z: number) => number,
    private readonly waterDepth: (x: number, z: number) => number,
    /** Places a prop can't stand: ponds, the cottage, the woods. */
    private readonly blocked: (x: number, z: number) => boolean,
    private readonly onRefuse: () => void,
  ) {}

  begin(p: THREE.Vector3) {
    this.carrying = this.props.pick(this.kind);
    this.move(p);
  }

  extend(p: THREE.Vector3) {
    if (this.carrying) this.move(p);
  }

  end() {
    const prop = this.carrying;
    if (!prop) return;
    this.carrying = null;
    const { x, y: z } = this.at;
    if (this.blocked(x, z) || this.distanceToPaths(x, z) < PATH_CLEAR[prop.kind] || this.props.near(x, z, 0.6)) {
      this.props.discard(prop);
      this.onRefuse();
      return;
    }
    this.props.drop(prop);
  }

  private move(p: THREE.Vector3) {
    this.at.set(p.x, p.z);
    this.props.move(this.carrying!, p.x, this.heightAt(p.x, p.z), p.z, this.facing(p.x, p.z));
  }

  /** Which way to face: the nearer of a path or a pond within a few metres, else toward you. */
  private facing(x: number, z: number): number {
    let target: THREE.Vector2 | null = null;
    let best = 6;
    const path = this.nearestPath(x, z, best);
    if (path) {
      best = path.distanceTo(this.at);
      target = path;
    }
    // Look for water in widening rings.
    for (let r = 1; r < best; r += 0.5) {
      let found: THREE.Vector2 | null = null;
      for (let k = 0; k < 16 && !found; k++) {
        const a = (k / 16) * Math.PI * 2;
        const wx = x + Math.cos(a) * r;
        const wz = z + Math.sin(a) * r;
        if (this.waterDepth(wx, wz) > 0.05) found = new THREE.Vector2(wx, wz);
      }
      if (found) {
        target = found;
        break;
      }
    }
    // (A prop's front is its local +z: yaw turns +z toward the target.)
    return target ? Math.atan2(target.x - x, target.y - z) : 0;
  }
}
