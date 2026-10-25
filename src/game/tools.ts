import * as THREE from 'three';
import type { CameraRig } from '../core/cameraRig';
import type { GroundPicker } from '../core/groundPicker';
import type { Toolbar, Tool } from '../ui/toolbar';
import type { TouchMarker } from '../world/touchMarker';
import type { PathBuilder } from './pathBuilder';
import type { FlowerBrush } from './flowerBrush';
import type { PondBrush } from './pondBrush';
import type { EraseBrush } from './eraseBrush';

const MARKER_COLORS: Record<Tool, string> = {
  move: '#fff2cf',
  path: '#f3e2c0',
  flowers: '#ffd1e0',
  pond: '#cdeefa',
  erase: '#ffe2c4',
};

const COMING_SOON: Partial<Record<Tool, string>> = {};

/**
 * Routes touches: with a build tool, one finger works the garden while two fingers always
 * move the camera. Each tool's real behaviour plugs in here as its story ships.
 */
export class ToolController {
  private readonly pointers = new Set<number>();
  private stroking = false;
  private readonly p = new THREE.Vector3();

  constructor(
    el: HTMLElement,
    private readonly toolbar: Toolbar,
    private readonly rig: CameraRig,
    private readonly picker: GroundPicker,
    private readonly marker: TouchMarker,
    private readonly paths: PathBuilder,
    private readonly flowers: FlowerBrush,
    private readonly ponds: PondBrush,
    private readonly eraser: EraseBrush,
    private readonly onToolChange: (tool: Tool) => void = () => {},
  ) {
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
    this.cancelStroke();
    this.onToolChange(tool);
  }

  private get tool(): Tool {
    return this.toolbar.tool;
  }

  private onDown = (e: PointerEvent) => {
    this.pointers.add(e.pointerId);
    if (this.pointers.size > 1) {
      // A second finger means "move the camera": let go of whatever we were drawing.
      this.cancelStroke();
      return;
    }
    if (this.tool === 'move') return;
    const hit = this.picker.pick(e.clientX, e.clientY, this.p);
    if (!hit) return;
    this.stroking = true;
    this.marker.down(hit);
    if (this.tool === 'path') this.paths.begin(hit);
    if (this.tool === 'flowers') this.flowers.begin(hit);
    if (this.tool === 'pond') this.ponds.begin(hit);
    if (this.tool === 'erase') {
      // A bigger brush when you're zoomed out, a finer one up close.
      this.eraser.radius = Math.min(2.2, Math.max(0.7, this.rig.distance * 0.028));
      this.marker.brush = this.eraser.radius;
      this.eraser.begin(hit);
    }
  };

  private onMove = (e: PointerEvent) => {
    if (!this.stroking || this.pointers.size > 1) return;
    const hit = this.picker.pick(e.clientX, e.clientY, this.p);
    if (!hit) return;
    this.marker.move(hit);
    if (this.tool === 'path') this.paths.extend(hit);
    if (this.tool === 'flowers') this.flowers.extend(hit);
    if (this.tool === 'pond') this.ponds.extend(hit);
    if (this.tool === 'erase') this.eraser.extend(hit);
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (!this.stroking) return;
    this.stroking = false;
    this.marker.up();
    if (this.tool === 'path') this.paths.end();
    if (this.tool === 'flowers') this.flowers.end();
    if (this.tool === 'pond') this.ponds.end();
    if (this.tool === 'erase') this.eraser.end();
    const soon = COMING_SOON[this.tool];
    if (soon) this.toolbar.showLabel(soon, 2200);
  };

  private cancelStroke() {
    if (!this.stroking) return;
    this.stroking = false;
    this.marker.up();
    this.paths.end();
    this.flowers.end();
    this.ponds.end();
    this.eraser.end();
  }
}
