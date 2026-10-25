export interface QualityTier {
  /** Render resolution, as a multiple of CSS pixels (capped by the screen's own). */
  pixelRatio: number;
  /** MSAA samples for the scene. */
  samples: number;
  bloom: boolean;
}

/** Best first. Phones start one step down and settle wherever 60fps holds. */
export const TIERS: QualityTier[] = [
  { pixelRatio: 1.75, samples: 4, bloom: true },
  { pixelRatio: 1.5, samples: 4, bloom: true },
  { pixelRatio: 1.3, samples: 4, bloom: true },
  { pixelRatio: 1.15, samples: 2, bloom: true },
  { pixelRatio: 1.0, samples: 2, bloom: false },
  { pixelRatio: 0.85, samples: 0, bloom: false },
];

const WINDOW = 45; // frames per measurement

/**
 * Keeps the frame rate smooth by watching real frame times and stepping the render resolution
 * (and then antialiasing and bloom) down when frames run long, or back up when there's
 * plenty of headroom. A tier that once proved too slow is never tried again, so it never
 * see-saws.
 */
export class Quality {
  tier: number;
  private ceiling = 0;
  private samples: number[] = [];
  private calm = 0;
  private skip = 2;
  private lastDrop = Infinity;
  private futile = 0;

  constructor(
    start: number,
    private readonly apply: (tier: QualityTier, index: number) => void,
    private readonly locked = false,
  ) {
    this.tier = Math.min(TIERS.length - 1, Math.max(0, start));
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
    this.samples = [];
    if (this.skip > 0) {
      this.skip--; // let things settle after a change (and at startup, while shaders compile)
      return;
    }
    // A high percentile, so regular stutters count, not just the average.
    const typical = sorted[Math.floor(sorted.length * 0.75)];
    if (typical > 18.5 && this.tier < TIERS.length - 1 && this.futile < 2) {
      // If the last step down didn't help, the frame rate is capped (Low Power Mode caps it
      // at 30fps), not the GPU: after two such steps, stop sacrificing sharpness for nothing.
      this.futile = typical > this.lastDrop * 0.92 ? this.futile + 1 : 0;
      this.lastDrop = typical;
      this.ceiling = this.tier + 1;
      this.set(this.tier + 1);
    } else if (typical < 13.5 && this.tier > this.ceiling) {
      if (++this.calm >= 4) this.set(this.tier - 1);
    } else {
      this.calm = 0;
    }
  }

  private set(tier: number) {
    this.tier = tier;
    this.calm = 0;
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
