import * as THREE from 'three';
import type { CameraRig } from '../core/cameraRig';
import type { GroundPicker } from '../core/groundPicker';
import type { Toolbar, Tool } from '../ui/toolbar';
import type { TouchMarker } from '../world/touchMarker';
import type { PathBuilder } from './pathBuilder';
import type { FlowerBrush } from './flowerBrush';
import type { PondBrush } from './pondBrush';
import type { EraseBrush } from './eraseBrush';
import { roundCm, type Action } from './garden';

const MARKER_COLORS: Record<Tool, string> = {
  move: '#fff2cf',
  path: '#f3e2c0',
  flowers: '#ffd1e0',
  pond: '#cdeefa',
  erase: '#ffe2c4',
};

type BuildTool = Exclude<Tool, 'move'>;

interface Brush {
  begin(p: THREE.Vector3): void;
  extend(p: THREE.Vector3): void;
  end(): void;
}

/**
 * Routes touches: with a build tool, one finger works the garden while two fingers always
 * move the camera. Every stroke is also recorded (points rounded to the centimetre, exactly as
 * the brushes saw them) so the garden can be saved and rebuilt stroke for stroke.
 */
export class ToolController {
  private readonly pointers = new Set<number>();
  private stroke: { tool: BuildTool; points: number[]; species: string } | null = null;
  private readonly p = new THREE.Vector3();
  private readonly brushes: Record<BuildTool, Brush>;

  constructor(
    el: HTMLElement,
    private readonly toolbar: Toolbar,
    private readonly rig: CameraRig,
    private readonly picker: GroundPicker,
    private readonly marker: TouchMarker,
    paths: PathBuilder,
    private readonly flowers: FlowerBrush,
    ponds: PondBrush,
    private readonly eraser: EraseBrush,
    private readonly heightAt: (x: number, z: number) => number,
    private readonly onAction: (action: Action) => void,
    private readonly onToolChange: (tool: Tool) => void = () => {},
  ) {
    this.brushes = { path: paths, flowers, pond: ponds, erase: eraser };
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    this.setTool(toolbar.tool);
  }

  setTool(tool: Tool) {
    this.rig.oneFingerPans = tool === 'move';
    this.marker.setColor(MARKER_COLORS[tool]);
    this.marker.brush = tool === 'erase' ? this.eraser.radius : null;
    this.endStroke();
    this.onToolChange(tool);
  }

  /** Rebuild one saved stroke, exactly as it was first drawn. */
  replay(action: Action) {
    const tool: BuildTool = action.kind;
    const brush = this.brushes[tool];
    const selected = this.flowers.selected;
    if (action.kind === 'flowers') this.flowers.selected = action.species;
    if (action.kind === 'erase') this.eraser.radius = action.radius;
    const pts = action.points;
    for (let i = 0; i < pts.length; i += 2) {
      const p = this.p.set(pts[i], this.heightAt(pts[i], pts[i + 1]), pts[i + 1]);
      if (i === 0) brush.begin(p);
      else brush.extend(p);
    }
    brush.end();
    this.flowers.selected = selected;
  }

  /** Where the finger is, on the ground, rounded to the centimetre (as saved). */
  private pick(e: PointerEvent): THREE.Vector3 | null {
    const hit = this.picker.pick(e.clientX, e.clientY, this.p);
    if (!hit) return null;
    hit.x = roundCm(hit.x);
    hit.z = roundCm(hit.z);
    hit.y = this.heightAt(hit.x, hit.z);
    return hit;
  }

  private onDown = (e: PointerEvent) => {
    this.pointers.add(e.pointerId);
    if (this.pointers.size > 1) {
      // A second finger means "move the camera": let go of whatever we were drawing.
      this.endStroke();
      return;
    }
    const tool = this.toolbar.tool;
    if (tool === 'move') return;
    const hit = this.pick(e);
    if (!hit) return;
    if (tool === 'erase') {
      // A bigger brush when you're zoomed out, a finer one up close.
      this.eraser.radius = roundCm(Math.min(2.2, Math.max(0.7, this.rig.distance * 0.028)));
      this.marker.brush = this.eraser.radius;
    }
    this.stroke = { tool, points: [hit.x, hit.z], species: this.flowers.selected };
    this.marker.down(hit);
    this.brushes[tool].begin(hit);
  };

  private onMove = (e: PointerEvent) => {
    if (!this.stroke || this.pointers.size > 1) return;
    const hit = this.pick(e);
    if (!hit) return;
    this.marker.move(hit);
    const pts = this.stroke.points;
    // Only real moves: keeps saves small, and replays see exactly the same points.
    if (hit.x === pts[pts.length - 2] && hit.z === pts[pts.length - 1]) return;
    pts.push(hit.x, hit.z);
    this.brushes[this.stroke.tool].extend(hit);
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    this.endStroke();
  };

  private endStroke() {
    const s = this.stroke;
    if (!s) return;
    this.stroke = null;
    this.marker.up();
    this.brushes[s.tool].end();
    const points = s.points;
    if (s.tool === 'flowers') this.onAction({ kind: 'flowers', species: s.species, points });
    else if (s.tool === 'erase') this.onAction({ kind: 'erase', radius: this.eraser.radius, points });
    else this.onAction({ kind: s.tool, points });
  }
}
