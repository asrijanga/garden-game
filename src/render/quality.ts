export interface QualityTier {
  /** Render resolution, as a multiple of CSS pixels (capped by the screen's own). */
  pixelRatio: number;
  /** MSAA samples for the scene. */
  samples: number;
  bloom: boolean;
}

/** Best first. Phones start at 1.5×; only the first four are chosen automatically. */
export const TIERS: QualityTier[] = [
  { pixelRatio: 1.75, samples: 4, bloom: true },
  { pixelRatio: 1.5, samples: 4, bloom: true },
  { pixelRatio: 1.3, samples: 4, bloom: true },
  { pixelRatio: 1.2, samples: 4, bloom: true },
  // Debugging only (`?q=4`, `?q=5`): below this the picture looks soft and pixelated.
  { pixelRatio: 1.0, samples: 2, bloom: false },
  { pixelRatio: 0.85, samples: 0, bloom: false },
];

/** The lowest tier the game picks on its own: it never trades away a crisp picture. */
const AUTO_FLOOR = 3;
const WINDOW = 60; // frames per measurement (~1 s)

/**
 * Keeps the frame rate smooth by watching real frame times. Only *sustained* slowness (the
 * median frame over two seconds in a row) steps the resolution down: brief hitches while
 * loading or building never count. It never goes below a crisp floor, and every so often,
 * when frames are steady, it tries one step back up; if that proves too slow it steps down
 * again and waits longer before the next try.
 */
export class Quality {
  tier: number;
  private readonly start: number;
  private samples: number[] = [];
  private slow = 0;
  private skip = 2;
  private steadyFor = 0;
  private probeAfter = 12; // seconds of steady frames before trying a step up
  /** Windows left in which a slowdown counts against the last step up. */
  private probing = 0;

  constructor(
    start: number,
    private readonly apply: (tier: QualityTier, index: number) => void,
    private readonly locked = false,
  ) {
    this.start = this.tier = Math.min(TIERS.length - 1, Math.max(0, start));
    apply(TIERS[this.tier], this.tier);
  }

  /** Feed the real (unclamped) time since the last frame, in seconds. */
  frame(dt: number) {
    if (this.locked) return;
    const ms = dt * 1000;
    if (ms > 120) return; // a hiccup (tab switch, app resume), not the steady state
    this.samples.push(ms);
    if (this.samples.length < WINDOW) return;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const seconds = this.samples.reduce((a, b) => a + b, 0) / 1000;
    this.samples = [];
    if (this.skip > 0) {
      this.skip--; // let things settle after a change (and at startup, while shaders compile)
      return;
    }
    const median = sorted[sorted.length >> 1];
    if (median > 19) {
      this.steadyFor = 0;
      // Two slow seconds in a row: genuinely too much for this device at this resolution.
      if (++this.slow >= 2 && this.tier < AUTO_FLOOR) {
        if (this.probing > 0) this.probeAfter = Math.min(120, this.probeAfter * 2); // the step up didn't hold
        this.probing = 0;
        this.set(this.tier + 1);
      }
      return;
    }
    this.slow = 0;
    if (this.probing > 0) this.probing--;
    // Steady at 60fps: after a while, see whether a sharper picture holds too.
    this.steadyFor += seconds;
    if (this.tier > this.start && this.steadyFor > this.probeAfter) {
      this.set(this.tier - 1);
      this.probing = 6;
    }
  }

  private set(tier: number) {
    this.tier = tier;
    this.slow = 0;
    this.steadyFor = 0;
    this.skip = 1;
    this.apply(TIERS[tier], tier);
  }
}

/** A tiny frame-rate readout (add `?fps` to the URL). */
export function mountFpsMeter(quality: Quality): (dt: number) => void {
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;left:10px;top:calc(env(safe-area-inset-top) + 10px);z-index:50;font:600 12px/1.3 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.45);padding:4px 7px;border-radius:8px;pointer-events:none';
  document.body.appendChild(el);
  let frames = 0;
  let time = 0;
  let worst = 0;
  return (dt: number) => {
    frames++;
    time += dt;
    worst = Math.max(worst, dt);
    if (time < 0.5) return;
    const t = TIERS[quality.tier];
    el.textContent = `${Math.round(frames / time)} fps · worst ${Math.round(worst * 1000)} ms · q${quality.tier} ${t.pixelRatio}x`;
    frames = 0;
    time = 0;
    worst = 0;
  };
}
