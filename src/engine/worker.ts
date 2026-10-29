/// <reference lib="webworker" />
import { Link, proxied, type Port } from './link';
import { createWorld, type WorldInit } from './world';

/**
 * The world's own thread. The page hands over its canvas (as an OffscreenCanvas) and the
 * settings; from then on the garden is simulated and drawn here, and the page's thread is left
 * free for touches, buttons and sound.
 */
const handlers: Record<string, (...a: never[]) => unknown> = {};
const link = new Link(self as unknown as Port, handlers);

self.addEventListener('message', (e: MessageEvent) => {
  const msg = e.data as { init?: WorldInit; canvas?: OffscreenCanvas };
  if (!msg || !msg.init || !msg.canvas) return;
  try {
    const world = createWorld(msg.canvas, link, msg.init);
    Object.assign(handlers, proxied('w', world));
    link.call('ready', world.ownFrames);
  } catch (err) {
    // No WebGL in workers here (older iOS): the page runs the world itself instead.
    link.call('failed', String(err));
  }
});
