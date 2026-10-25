import * as THREE from 'three';
import type { CameraRig } from '../core/cameraRig';
import type { GroundPicker } from '../core/groundPicker';
import type { Toolbar, Tool } from '../ui/toolbar';
import type { TouchMarker } from '../world/touchMarker';
import type { PathBuilder } from './pathBuilder';

const MARKER_COLORS: Record<Tool, string> = {
  move: '#fff2cf',
  path: '#f3e2c0',
  flowers: '#ffd1e0',
  pond: '#cdeefa',
  erase: '#ffe2c4',
};

const COMING_SOON: Partial<Record<Tool, string>> = {
  flowers: 'Flowers are on their way',
  pond: 'The pond is coming soon',
  erase: 'Tidying up comes later',
};

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
    this.cancelStroke();
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
  };

  private onMove = (e: PointerEvent) => {
    if (!this.stroking || this.pointers.size > 1) return;
    const hit = this.picker.pick(e.clientX, e.clientY, this.p);
    if (!hit) return;
    this.marker.move(hit);
    if (this.tool === 'path') this.paths.extend(hit);
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (!this.stroking) return;
    this.stroking = false;
    this.marker.up();
    if (this.tool === 'path') this.paths.end();
    const soon = COMING_SOON[this.tool];
    if (soon) this.toolbar.showLabel(soon, 2200);
  };

  private cancelStroke() {
    if (!this.stroking) return;
    this.stroking = false;
    this.marker.up();
    this.paths.end();
  }
}
