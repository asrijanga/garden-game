/**
 * The few things the world needs from wherever it runs: on the page, or in a worker (which has
 * no document, and in older browsers no requestAnimationFrame).
 */

/** Run `cb` before the next frame is drawn. */
export const nextFrame: (cb: (time: number) => void) => number =
  typeof requestAnimationFrame === 'function' ? (cb) => requestAnimationFrame(cb) : (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number;

/** A canvas to draw a texture on (an offscreen one where there's no document). */
export function makeCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  }
  // Same drawing API; three.js takes either for a texture.
  return new OffscreenCanvas(width, height) as unknown as HTMLCanvasElement;
}
