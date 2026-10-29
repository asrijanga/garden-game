import * as THREE from 'three';
import { clamp, lerp, smoothstep } from './random';

/**
 * Diorama camera you hold in your hand: one finger pans, two fingers pinch to zoom and twist
 * to rotate, everything glides to a stop with inertia. Zooming in lowers the camera a little
 * for a cosier, more eye-level view of the flowers.
 */
export class CameraRig {
  readonly target = new THREE.Vector3(0, 0.6, -1.2);
  azimuth = THREE.MathUtils.degToRad(8);
  distance = 40;
  minDistance = 9;
  maxDistance = 45;
  /** How far the view centre may wander from the middle of the clearing. */
  panLimit = 15;

  private readonly pointers = new Map<number, { x: number; y: number }>();
  private velPan = new THREE.Vector2();
  private velZoom = 0;
  private velRot = 0;
  private lastSpan = 0;
  private lastAngle = 0;
  private lastMid = new THREE.Vector2();
  /** Set by the toolbar later: when false, one finger is free for building. */
  oneFingerPans = true;

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly el: HTMLElement) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
  }

  /** Fits the zoom range to the screen: fully zoomed out shows the whole clearing. */
  fit(fullViewDistance: number) {
    this.maxDistance = fullViewDistance;
    this.distance = clamp(this.distance, this.minDistance, this.maxDistance);
  }

  private onDown = (e: PointerEvent) => {
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.velPan.set(0, 0);
    this.velZoom = 0;
    this.velRot = 0;
    this.resetGesture();
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    this.resetGesture();
  };

  private resetGesture() {
    const pts = [...this.pointers.values()];
    if (pts.length >= 2) {
      const [a, b] = pts;
      this.lastSpan = Math.hypot(b.x - a.x, b.y - a.y);
      this.lastAngle = Math.atan2(b.y - a.y, b.x - a.x);
      this.lastMid.set((a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (pts.length === 1) {
      this.lastMid.set(pts[0].x, pts[0].y);
    }
  }

  private onMove = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...this.pointers.values()];

    if (pts.length >= 2) {
      const [a, b] = pts;
      const span = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const mid = new THREE.Vector2((a.x + b.x) / 2, (a.y + b.y) / 2);

      const zoom = Math.log(this.lastSpan / span);
      let rot = angle - this.lastAngle;
      if (rot > Math.PI) rot -= Math.PI * 2;
      if (rot < -Math.PI) rot += Math.PI * 2;

      this.zoomBy(zoom);
      this.azimuth -= rot;
      this.panByScreen(mid.x - this.lastMid.x, mid.y - this.lastMid.y);

      this.velZoom = zoom * 60;
      this.velRot = -rot * 60;
      this.lastSpan = span;
      this.lastAngle = angle;
      this.lastMid.copy(mid);
    } else if (pts.length === 1 && this.oneFingerPans) {
      const dx = pts[0].x - this.lastMid.x;
      const dy = pts[0].y - this.lastMid.y;
      this.panByScreen(dx, dy);
      this.velPan.set(dx * 60, dy * 60);
      this.lastMid.set(pts[0].x, pts[0].y);
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoomBy(e.deltaY * 0.0015);
  };

  private zoomBy(logAmount: number) {
    this.distance = clamp(this.distance * Math.exp(logAmount), this.minDistance, this.maxDistance);
  }

  /** Roughly how many metres of ground one screen pixel covers at this zoom. */
  get metresPerPixel(): number {
    return (2 * this.distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / Math.max(1, this.el.clientHeight);
  }

  /** Drag the ground under the finger: screen pixels → metres on the ground plane. */
  private panByScreen(dx: number, dy: number) {
    const metresPerPixel = (2 * this.distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / this.el.clientHeight;
    const right = new THREE.Vector3(Math.cos(this.azimuth), 0, -Math.sin(this.azimuth));
    const forward = new THREE.Vector3(-Math.sin(this.azimuth), 0, -Math.cos(this.azimuth));
    const pitchFactor = 1 / Math.max(0.5, Math.sin(this.pitch()));
    this.target.addScaledVector(right, -dx * metresPerPixel);
    this.target.addScaledVector(forward, dy * metresPerPixel * pitchFactor);
  }

  private pitch(): number {
    const t = smoothstep(this.minDistance, this.maxDistance, this.distance);
    return THREE.MathUtils.degToRad(lerp(34, 64, t));
  }

  update(dt: number) {
    if (this.pointers.size === 0) {
      // Inertia: keep gliding after the fingers lift, easing to rest.
      const decay = Math.exp(-dt * 5);
      if (this.velPan.lengthSq() > 0.01) this.panByScreen(this.velPan.x * dt, this.velPan.y * dt);
      if (Math.abs(this.velZoom) > 1e-4) this.zoomBy(this.velZoom * dt);
      if (Math.abs(this.velRot) > 1e-4) this.azimuth += this.velRot * dt;
      this.velPan.multiplyScalar(decay);
      this.velZoom *= decay;
      this.velRot *= decay;
    }

    // Soft pan limit: allowed radius grows as you zoom in, gently pulled back when exceeded.
    const limit = this.panLimit * lerp(1, 0.25, smoothstep(this.minDistance, this.maxDistance, this.distance));
    const off = new THREE.Vector2(this.target.x, this.target.z + 1.2);
    if (off.length() > limit) {
      off.multiplyScalar(lerp(1, limit / off.length(), 1 - Math.exp(-dt * 8)));
      this.target.x = off.x;
      this.target.z = off.y - 1.2;
    }

    const pitch = this.pitch();
    this.camera.position.set(
      this.target.x + Math.sin(this.azimuth) * Math.cos(pitch) * this.distance,
      this.target.y + Math.sin(pitch) * this.distance,
      this.target.z + Math.cos(this.azimuth) * Math.cos(pitch) * this.distance,
    );
    this.camera.lookAt(this.target);
  }
}
