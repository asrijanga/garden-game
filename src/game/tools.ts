import * as THREE from 'three';
import type { CameraRig } from '../core/cameraRig';
import type { GroundPicker } from '../core/groundPicker';
import type { Toolbar, Tool } from '../ui/toolbar';
import type { TouchMarker } from '../world/touchMarker';
import type { FlowerBrush } from './flowerBrush';
import type { PondBrush } from './pondBrush';
import type { EraseBrush } from './eraseBrush';
import type { PropBrush } from './propBrush';
import type { PropKind } from '../world/props';
import type { FenceBuilder } from './fenceBuilder';
import type { FenceStyle } from '../world/fences';

/** What the Build tool lays: a fence or hedge style, or rocks. */
export type BuildStyle = FenceStyle | 'rocks' | 'bridge';
import { roundCm, type Action } from './garden';

const MARKER_COLORS: Record<Tool, string> = {
  move: '#fff2cf',
  path: '#f3e2c0',
  fence: '#f6ead2',
  flowers: '#ffd1e0',
  pond: '#cdeefa',
  decor: '#fff0d2',
  erase: '#ffe2c4',
};

type BuildTool = Exclude<Tool, 'move'>;

export interface Brush {
  begin(p: THREE.Vector3): void;
  extend(p: THREE.Vector3): void;
  end(): void;
}

/**
 * Routes touches: with a build tool, one finger works the garden while two fingers always
 * move the camera. Every stroke is also recorded (points rounded to the centimetre, exactly as
 * the brushes saw them) so the garden can be saved and rebuilt stroke for stroke.
 */
/** How far (screen pixels) a path trails behind the finger, to steady it. */
const ROPE_PX = 14;

export class ToolController {
  private readonly pointers = new Set<number>();
  private stroke: { tool: BuildTool; points: number[]; species: string; style: BuildStyle; item: PropKind } | null = null;
  /** The Build tool's current choice (set from its chips). */
  buildStyle: BuildStyle = 'picket';
  private building: Brush | null = null;
  private readonly p = new THREE.Vector3();
  private readonly brushes: Record<BuildTool, Brush>;
  private pending = false;
  private pendingX = 0;
  private pendingY = 0;
  private raf = 0;
  /** Where a finger touches the ground (down, and as a stroke moves), whatever the tool. */
  onTouch: (p: THREE.Vector3, tool: Tool, down: boolean) => void = () => {};

  constructor(
    el: HTMLElement,
    private readonly toolbar: Toolbar,
    private readonly rig: CameraRig,
    private readonly picker: GroundPicker,
    private readonly marker: TouchMarker,
    paths: Brush,
    fences: FenceBuilder,
    rocks: Brush,
    bridge: Brush,
    private readonly decor: PropBrush,
    private readonly flowers: FlowerBrush,
    ponds: PondBrush,
    private readonly eraser: EraseBrush,
    private readonly heightAt: (x: number, z: number) => number,
    private readonly onAction: (action: Action) => void,
    private readonly onToolChange: (tool: Tool) => void = () => {},
  ) {
    // The Build tool hands each stroke to the fence builder or the rock brush, by style.
    const build: Brush = {
      begin: (p) => {
        const s = this.buildStyle;
        if (s !== 'rocks' && s !== 'bridge') fences.style = s;
        this.building = s === 'rocks' ? rocks : s === 'bridge' ? bridge : fences;
        this.building.begin(p);
      },
      extend: (p) => this.building?.extend(p),
      end: () => {
        this.building?.end();
        this.building = null;
      },
    };
    this.brushes = { path: paths, fence: build, flowers, pond: ponds, decor, erase: eraser };
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    this.setTool(toolbar.tool);
  }

  setTool(tool: Tool) {
    this.rig.oneFingerPans = tool === 'move';
    this.marker.setColor(MARKER_COLORS[tool]);
    this.refreshMarker(tool);
    this.endStroke();
    this.onToolChange(tool);
  }

  /** The ring under the finger: the eraser's reach, a clump's or one flower's spot, or a fingertip. */
  refreshMarker(tool: Tool = this.toolbar.tool) {
    this.marker.brush = tool === 'erase' ? this.eraser.radius : tool === 'flowers' ? this.flowers.footprint : null;
  }

  /** Rebuild one saved stroke, exactly as it was first drawn. */
  replay(action: Action) {
    if (action.kind === 'cottage') return; // not a stroke: main applies it to the cottage
    const tool: BuildTool = action.kind === 'rocks' || action.kind === 'bridge' ? 'fence' : action.kind === 'prop' ? 'decor' : action.kind;
    const brush = this.brushes[tool];
    const selected = this.flowers.selection;
    const style = this.buildStyle;
    if (action.kind === 'flowers') this.flowers.selection = action.species;
    if (action.kind === 'fence') this.buildStyle = action.style as FenceStyle;
    if (action.kind === 'rocks') this.buildStyle = 'rocks';
    if (action.kind === 'bridge') this.buildStyle = 'bridge';
    const item = this.decor.kind;
    if (action.kind === 'prop') this.decor.kind = action.item as PropKind;
    if (action.kind === 'erase') this.eraser.radius = action.radius;
    const pts = action.points;
    for (let i = 0; i < pts.length; i += 2) {
      const p = this.p.set(pts[i], this.heightAt(pts[i], pts[i + 1]), pts[i + 1]);
      if (i === 0) brush.begin(p);
      else brush.extend(p);
    }
    brush.end();
    this.flowers.selection = selected;
    this.buildStyle = style;
    this.decor.kind = item;
  }

  /** Where the finger is, on the ground, rounded to the centimetre (as saved). */
  private pick(e: PointerEvent): THREE.Vector3 | null {
    return this.pickAt(e.clientX, e.clientY);
  }

  private pickAt(clientX: number, clientY: number): THREE.Vector3 | null {
    const hit = this.picker.pick(clientX, clientY, this.p);
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
    const hit = this.pick(e);
    if (!hit) return;
    this.onTouch(hit, tool, true);
    if (tool === 'move') return;
    if (tool === 'erase') {
      // A bigger brush when you're zoomed out, a finer one up close.
      this.eraser.radius = roundCm(Math.min(2.2, Math.max(0.7, this.rig.distance * 0.028)));
      this.marker.brush = this.eraser.radius;
    }
    this.stroke = { tool, points: [hit.x, hit.z], species: this.flowers.selection, style: this.buildStyle, item: this.decor.kind };
    this.marker.down(hit);
    this.brushes[tool].begin(hit);
  };

  private onMove = (e: PointerEvent) => {
    if (!this.stroke || this.pointers.size > 1) return;
    // A mouse or fast touch can report moves far more often than the screen redraws: keep only
    // the latest, and handle it once per frame (the brushes fill in between points themselves).
    this.pendingX = e.clientX;
    this.pendingY = e.clientY;
    this.pending = true;
    if (!this.raf) this.raf = requestAnimationFrame(this.flushMove);
  };

  private flushMove = () => {
    this.raf = 0;
    if (!this.pending || !this.stroke || this.pointers.size > 1) return;
    this.pending = false;
    const hit = this.pickAt(this.pendingX, this.pendingY);
    if (!hit) return;
    this.marker.move(hit);
    const pts = this.stroke.points;
    if (this.stroke.tool === 'path' && !this.steady(hit, pts, ROPE_PX)) return;
    // Only real moves: keeps saves small, and replays see exactly the same points.
    if (hit.x === pts[pts.length - 2] && hit.z === pts[pts.length - 1]) return;
    pts.push(hit.x, hit.z);
    this.brushes[this.stroke.tool].extend(hit);
    this.onTouch(hit, this.stroke.tool, false);
  };

  /**
   * A path's "lazy rope": the path follows a point trailing a short rope behind the finger, so
   * finger wobble and jitter never reach it (the rope is a fixed size on screen, so it's just as
   * steady zoomed out). Moves `hit` to that point; false while the finger is still within the rope.
   * The steadied points are what's saved, so a rebuild follows exactly the same line.
   */
  private steady(hit: THREE.Vector3, pts: number[], ropePx: number): boolean {
    const lx = pts[pts.length - 2];
    const lz = pts[pts.length - 1];
    const rope = ropePx * this.rig.metresPerPixel;
    const d = Math.hypot(hit.x - lx, hit.z - lz);
    if (d <= rope) return false;
    const k = (d - rope) / d;
    hit.x = roundCm(lx + (hit.x - lx) * k);
    hit.z = roundCm(lz + (hit.z - lz) * k);
    hit.y = this.heightAt(hit.x, hit.z);
    return true;
  }

  private onUp = (e: PointerEvent) => {
    // Don't lose the last little bit of the stroke.
    if (this.pending && this.pointers.size === 1) this.flushMove();
    // A path ends exactly where the finger lifts (if it went anywhere at all).
    if (this.stroke?.tool === 'path' && this.pointers.size === 1) {
      const hit = this.pickAt(e.clientX, e.clientY);
      const pts = this.stroke.points;
      if (hit && pts.length > 2 && Math.hypot(hit.x - pts[pts.length - 2], hit.z - pts[pts.length - 1]) > 0.05) {
        pts.push(hit.x, hit.z);
        this.brushes.path.extend(hit);
      }
    }
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
    else if (s.tool === 'fence' && s.style === 'rocks') this.onAction({ kind: 'rocks', points });
    else if (s.tool === 'fence' && s.style === 'bridge') this.onAction({ kind: 'bridge', points });
    else if (s.tool === 'decor') this.onAction({ kind: 'prop', item: s.item, points });
    else if (s.tool === 'fence') this.onAction({ kind: 'fence', style: s.style, points });
    else if (s.tool === 'erase') this.onAction({ kind: 'erase', radius: this.eraser.radius, points });
    else this.onAction({ kind: s.tool, points });
  }
}
