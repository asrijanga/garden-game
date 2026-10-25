import { createRng } from '../core/random';
import type { Season } from '../world/season';
import { Birds } from './birds';

/**
 * A very calm bed of air and distant trees, with the occasional bird, synthesised with Web
 * Audio (nothing to load). The goal is absolute relaxation: it should sit at the edge of
 * hearing, like a quiet afternoon by an open window.
 *
 * Layers, all driven by the same wind that moves the grass:
 *  - air:    deep, soft brown noise, the constant hush of open air
 *  - gust:   the faintest low breath as a gust passes
 *  - trees:  a distant canopy murmur answering the gust a moment later
 *  - leaves: a near-silent high rustle (kept almost off: hiss reads as tension)
 *  - birds:  rare, distant birdsong
 *
 * Every change is smoothed over seconds, so nothing ever jumps out.
 */
/** Overall loudness. Kept low on purpose: this is background calm, not an effect. */
const MASTER_VOLUME = 0.3;

export class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private layers: {
    air: GainNode;
    gust: GainNode;
    gustFilter: BiquadFilterNode;
    trees: GainNode;
    treesPan: StereoPannerNode;
    leaves: GainNode;
    leavesPan: StereoPannerNode;
  } | null = null;
  private muted = false;
  private readonly rng = createRng(77);
  private flurry = 0;
  private flurryTarget = 0;
  private leafPan = 0;
  private treeLevel = 0;
  private time = 0;
  private birds: Birds | null = null;

  constructor(private readonly season: Season) {}
  /** Debug/testing: pin the wind input (set via ?debug in the console). */
  override: { envelope: number; local: number } | null = null;

  get started(): boolean {
    return this.ctx !== null;
  }

  /** Must be called from a user gesture (iOS only allows audio to start from a touch). */
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;

    // Old iOS needs a sound played inside the gesture to fully unlock.
    const blip = ctx.createBufferSource();
    blip.buffer = ctx.createBuffer(1, 1, 22050);
    blip.connect(ctx.destination);
    blip.start();

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -24;
    limiter.knee.value = 12;
    limiter.ratio.value = 4;
    limiter.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(limiter);
    this.master = master;

    const brown = noiseBuffer(ctx, 7.3, 'brown', 1);
    const brown2 = noiseBuffer(ctx, 6.1, 'brown', 2);
    const white = noiseBuffer(ctx, 5.7, 'white', 3);
    const white2 = noiseBuffer(ctx, 4.9, 'white', 4);

    // Air: two decorrelated loops, panned apart for a wide, enveloping hush.
    const air = ctx.createGain();
    air.gain.value = 0;
    for (const [buf, pan] of [[brown, -0.6], [brown2, 0.6]] as const) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 240;
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      loop(ctx, buf).connect(lp).connect(p).connect(air);
    }
    air.connect(master);

    // Gust: band-passed brown noise whose pitch rises a little as it swells.
    const gustFilter = ctx.createBiquadFilter();
    gustFilter.type = 'bandpass';
    gustFilter.frequency.value = 320;
    gustFilter.Q.value = 0.5;
    const gust = ctx.createGain();
    gust.gain.value = 0;
    loop(ctx, brown2, 1.3).connect(gustFilter).connect(gust).connect(master);

    // Trees: mid-band rush of a canopy, slightly off to one side.
    const treesBp = ctx.createBiquadFilter();
    treesBp.type = 'bandpass';
    treesBp.frequency.value = 950;
    treesBp.Q.value = 0.5;
    const treesLp = ctx.createBiquadFilter();
    treesLp.type = 'lowpass';
    treesLp.frequency.value = 1700;
    const trees = ctx.createGain();
    trees.gain.value = 0;
    const treesPan = ctx.createStereoPanner();
    loop(ctx, white).connect(treesBp).connect(treesLp).connect(trees).connect(treesPan).connect(master);

    // Leaves: soft, airy high rustle (kept well below harsh frequencies).
    const leavesHp = ctx.createBiquadFilter();
    leavesHp.type = 'highpass';
    leavesHp.frequency.value = 2200;
    const leavesLp = ctx.createBiquadFilter();
    leavesLp.type = 'lowpass';
    leavesLp.frequency.value = 4600;
    const leaves = ctx.createGain();
    leaves.gain.value = 0;
    const leavesPan = ctx.createStereoPanner();
    loop(ctx, white2).connect(leavesHp).connect(leavesLp).connect(leaves).connect(leavesPan).connect(master);

    this.layers = { air, gust, gustFilter, trees, treesPan, leaves, leavesPan };
    this.birds = new Birds(ctx, master, this.season);
    this.applyMute(4); // slow, gentle fade-in
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.applyMute(0.6);
  }

  private applyMute(seconds: number) {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(this.muted ? 0 : MASTER_VOLUME, now + seconds);
  }

  /** A soft wooden "tock" for UI presses: quiet, warm, never clicky. */
  tap(pitch = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(260 * pitch, t + 0.09);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.32, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    osc.connect(env).connect(lp).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  suspend() {
    void this.ctx?.suspend();
  }

  resume() {
    if (this.ctx && !this.muted) void this.ctx.resume();
  }

  /**
   * @param envelope global calm↔gust level (0..1)
   * @param local    wind strength right where the camera is looking (0..~1.3)
   */
  update(dt: number, envelope: number, local: number) {
    if (!this.ctx || !this.layers || this.ctx.state !== 'running') return;
    if (this.override) ({ envelope, local } = this.override);
    this.time += dt;
    const now = this.ctx.currentTime;
    const L = this.layers;
    const gust = Math.max(0, local - 0.25);

    // The canopy responds a moment after the gust reaches it, and lingers.
    this.treeLevel += (gust - this.treeLevel) * Math.min(1, dt * 0.9);

    // Leaves rustle in irregular flurries that grow with the wind.
    if (this.rng() < dt * (0.6 + gust * 2)) this.flurryTarget = this.rng() * (0.35 + gust);
    this.flurryTarget *= Math.exp(-dt * 1.4);
    this.flurry += (this.flurryTarget - this.flurry) * Math.min(1, dt * 6);
    this.leafPan = Math.sin(this.time * 0.11) * 0.5 + Math.sin(this.time * 0.37 + 2) * 0.2;

    // Deliberately understated: a hush that breathes, never weather.
    L.air.gain.setTargetAtTime(0.075 + envelope * 0.02, now, 3.0);
    L.gust.gain.setTargetAtTime(gust * gust * 0.05, now, 2.5);
    L.gustFilter.frequency.setTargetAtTime(260 + gust * 80, now, 3.0);
    L.trees.gain.setTargetAtTime(0.002 + this.treeLevel * 0.006, now, 3.0);
    L.treesPan.pan.setTargetAtTime(Math.sin(this.time * 0.07) * 0.3, now, 2.0);
    L.leaves.gain.setTargetAtTime((0.0002 + this.flurry * 0.0008) * (0.4 + envelope), now, 0.8);
    L.leavesPan.pan.setTargetAtTime(this.leafPan, now, 1.0);
    this.birds?.update();
  }
}

function noiseBuffer(ctx: AudioContext, seconds: number, kind: 'white' | 'brown', seed: number): AudioBuffer {
  const rng = createRng(seed * 7919);
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const w = rng() * 2 - 1;
    if (kind === 'white') {
      data[i] = w * 0.5;
    } else {
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
  }
  // Crossfade the ends so the loop point is inaudible.
  const fade = Math.floor(ctx.sampleRate * 0.25);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    data[i] = data[i] * t + data[length - fade + i] * (1 - t);
  }
  return buffer;
}

function loop(ctx: AudioContext, buffer: AudioBuffer, rate = 1): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.loopEnd = buffer.duration - 0.25; // skip the tail that was folded into the start
  src.playbackRate.value = rate;
  src.start(0, Math.random() * buffer.duration * 0.5);
  return src;
}
