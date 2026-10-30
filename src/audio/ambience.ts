import { createRng, lerp } from '../core/random';
import type { Season } from '../world/season';
import { Birds } from './birds';
import { NatureSounds, type Mood } from './nature';

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
  /** Hush one-shot sounds (while the garden is rebuilt silently after an undo). */
  quiet = false;
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
  private nature: NatureSounds | null = null;
  /** Time of day, weather and ponds, for the creatures that sing (or don't) to suit them. */
  private mood: Mood = { time: 0.55, night: 0, rain: 0, wet: 0, ponds: false };

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
    // iPhone/iPad: play like media, so Silent Mode doesn't mute the garden (Safari 16.4+).
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) {
      try {
        session.type = 'playback';
      } catch {
        /* older WebKit: ignore */
      }
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

    // Rain: a soft, wide hiss of drops on leaves and grass, plus a lower patter on the ground.
    const rain = ctx.createGain();
    rain.gain.value = 0;
    for (const [buf, pan, lo, hi] of [[white, -0.5, 700, 4200], [white2, 0.5, 300, 1400]] as const) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = lo;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = hi;
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      loop(ctx, buf, 0.93).connect(hp).connect(lp).connect(p).connect(rain);
    }
    rain.connect(master);
    this.rain = rain;
    this.setRain(this.rainLevel);

    this.layers = { air, gust, gustFilter, trees, treesPan, leaves, leavesPan };
    this.birds = new Birds(ctx, master, this.season);
    this.nature = new NatureSounds(ctx, master, this.season);
    this.nature.mood = this.mood;
    this.applyMute(4); // slow, gentle fade-in
  }

  private rain: GainNode | null = null;
  private rainLevel = 0;

  /** Tell the garden's creatures what it's like out (time of day, rain, wetness, ponds). */
  setMood(m: Mood) {
    Object.assign(this.mood, m);
  }

  /** How hard it's raining (0–1); the hiss follows gently. */
  setRain(level: number) {
    this.rainLevel = level;
    if (this.rain && this.ctx) this.rain.gain.setTargetAtTime(level * 0.11, this.ctx.currentTime, 1.2);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.ensureRunning(); // unmuting after the page was hidden must wake the audio too
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
    if (!ctx || !this.master || this.muted || this.quiet || ctx.state !== 'running') return;
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

  private buzzOsc: OscillatorNode | null = null;
  private buzzGain: GainNode | null = null;

  /**
   * A faint, soft bee buzz, only audible when zoomed in close to a bee. `level` 0..1 is set
   * every frame from the nearest bee; changes are smoothed so it fades in and out gently.
   */
  buzz(level: number, pitch: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    if (!this.buzzOsc) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 200;
      // A quick wobble in loudness gives the wingbeat texture.
      const trem = ctx.createOscillator();
      trem.frequency.value = 23;
      const tremDepth = ctx.createGain();
      tremDepth.gain.value = 0.35;
      const amp = ctx.createGain();
      amp.gain.value = 0.65;
      trem.connect(tremDepth).connect(amp.gain);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      lp.Q.value = 0.7;
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(amp).connect(lp).connect(g).connect(this.master);
      osc.start();
      trem.start();
      this.buzzOsc = osc;
      this.buzzGain = g;
    }
    const now = ctx.currentTime;
    this.buzzGain!.gain.setTargetAtTime(level * 0.05, now, 0.35);
    this.buzzOsc.frequency.setTargetAtTime(190 * pitch + Math.sin(now * 3.1) * 6, now, 0.2);
  }

  private lastBloom = 0;

  /** A tiny, soft pentatonic "pling" as a flower opens. Rate-limited so a bed shimmers, not chatters. */
  bloom() {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || this.quiet || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (t - this.lastBloom < 0.16) return;
    this.lastBloom = t;
    const notes = [784, 880, 1047, 1175, 1319, 1568];
    const f = notes[Math.floor(Math.random() * notes.length)];
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.07, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    for (const [mult, g] of [[1, 1], [2.01, 0.18]] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f * mult;
      const og = ctx.createGain();
      og.gain.value = g;
      osc.connect(og).connect(env);
      osc.start(t);
      osc.stop(t + 0.75);
    }
    env.connect(lp).connect(this.master);
  }

  private lastStone = 0;

  /** A soft, earthy "tok" as a stone settles into the soil. */
  stone(size = 0.3) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || this.quiet || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (t - this.lastStone < (size < 0.1 ? 0.11 : 0.06)) return;
    // Pebbles tick softly; bigger stones get the fuller "tok".
    const loud = Math.min(1, Math.max(0.22, size / 0.22));
    this.lastStone = t;
    const pitch = (0.85 + Math.random() * 0.3) * (0.32 / Math.max(0.12, size)) ** 0.4;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(230 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(120 * pitch, t + 0.08);
    const click = ctx.createOscillator();
    click.type = 'triangle';
    click.frequency.value = 1150 * pitch;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.42 * loud, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    const clickEnv = ctx.createGain();
    clickEnv.gain.setValueAtTime(0.05 * loud, t);
    clickEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    osc.connect(env).connect(lp).connect(this.master);
    click.connect(clickEnv).connect(lp);
    osc.start(t);
    click.start(t);
    osc.stop(t + 0.18);
    click.stop(t + 0.05);
  }

  private noiseBuf: AudioBuffer | null = null;

  private noise(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuf) {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    return this.noiseBuf;
  }

  /** One small water "bloop": a rising bubble note, `at` seconds from now. */
  private bubble(ctx: AudioContext, at: number, pitch: number, vol: number) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240 * pitch, at);
    osc.frequency.exponentialRampToValueAtTime(560 * pitch, at + 0.07);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(vol, at + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
    osc.connect(env).connect(this.master!);
    osc.start(at);
    osc.stop(at + 0.15);
  }

  /** One wind-chime tube: a soft metallic ring (slightly inharmonic partials) that hangs in the air. */
  chime(freq: number, volume: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || this.quiet || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0.11 * volume;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6000;
    out.connect(lp).connect(this.master);
    // Tube modes ring at about 1, 2.76, 5.4 and 8.9 times the fundamental, the high ones dying first.
    for (const [mult, gain, decay] of [[1, 1, 3.2], [2.76, 0.5, 1.8], [5.4, 0.22, 0.9], [8.93, 0.08, 0.5]] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * mult;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(gain, t + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      osc.connect(env).connect(out);
      osc.start(t);
      osc.stop(t + decay + 0.05);
    }
  }

  /** A bird sitting in the garden chirps (`volume` 0–1 by distance, `pan` −1…1). */
  chirp(volume: number, pan: number) {
    const ctx = this.ctx;
    if (!ctx || !this.birds || this.muted || this.quiet || ctx.state !== 'running' || volume < 0.03) return;
    this.birds.near(pan, 0.6 + volume * 2.2);
  }

  /**
   * A duck's soft "quack" (a nasal, buzzy note with a falling pitch, through a vowel-ish filter),
   * or a duckling's tiny peep (a thin rising whistle). `volume` 0–1 by distance, `pan` −1…1.
   */
  quack(volume: number, pan: number, chick = false) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || this.quiet || ctx.state !== 'running' || volume < 0.03) return;
    const t = ctx.currentTime + 0.01;
    const out = ctx.createGain();
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    out.connect(p).connect(this.master);
    if (chick) {
      out.gain.value = 0.05 * volume;
      for (let i = 0; i < 2; i++) {
        const s = t + i * lerp(0.11, 0.16, Math.random());
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        const f = lerp(3000, 3600, Math.random());
        osc.frequency.setValueAtTime(f * 0.8, s);
        osc.frequency.exponentialRampToValueAtTime(f, s + 0.06);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, s);
        env.gain.linearRampToValueAtTime(1, s + 0.01);
        env.gain.exponentialRampToValueAtTime(0.001, s + 0.08);
        osc.connect(env).connect(out);
        osc.start(s);
        osc.stop(s + 0.1);
      }
      setTimeout(() => out.disconnect(), 800);
      return;
    }
    out.gain.value = 0.07 * volume;
    const n = Math.random() < 0.6 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const s = t + i * 0.24;
      const f = lerp(340, 420, Math.random());
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, s);
      osc.frequency.exponentialRampToValueAtTime(f * 0.78, s + 0.18);
      // Two formant-ish bands give the nasal "aa" of a quack.
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.value = 1100;
      f1.Q.value = 4;
      const f2 = ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.value = 2300;
      f2.Q.value = 5;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, s);
      env.gain.linearRampToValueAtTime(1, s + 0.02);
      env.gain.setValueAtTime(1, s + 0.1);
      env.gain.exponentialRampToValueAtTime(0.001, s + 0.2);
      osc.connect(f1).connect(env);
      osc.connect(f2).connect(env);
      env.connect(out);
      osc.start(s);
      osc.stop(s + 0.22);
    }
    setTimeout(() => out.disconnect(), 1200);
  }

  /** A hummingbird's tiny "tsip": a very short, very high falling chirp. */
  chip(volume: number, pan: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || this.quiet || ctx.state !== 'running' || volume < 0.03) return;
    const t = ctx.currentTime + 0.01;
    const out = ctx.createGain();
    out.gain.value = 0.045 * volume;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    out.connect(p).connect(this.master);
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const s = t + i * 0.09;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(lerp(6800, 7600, Math.random()), s);
      osc.frequency.exponentialRampToValueAtTime(5200, s + 0.035);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, s);
      env.gain.linearRampToValueAtTime(1, s + 0.004);
      env.gain.exponentialRampToValueAtTime(0.001, s + 0.045);
      osc.connect(env).connect(out);
      osc.start(s);
      osc.stop(s + 0.05);
    }
    setTimeout(() => out.disconnect(), 600);
  }

  private lastWood = 0;

  /** A wooden "tock" as a fence post is knocked in (or a softer tap for boards). */
  wood(size = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || this.quiet || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (t - this.lastWood < (size < 0.5 ? 0.07 : 0.05)) return;
    this.lastWood = t;
    const pitch = (0.9 + Math.random() * 0.2) * (size < 0.5 ? 1.6 : 1);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(330 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(190 * pitch, t + 0.06);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.22 * size, t + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700 * pitch;
    bp.Q.value = 1.4;
    osc.connect(bp).connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  /** The audio context, if a one-shot sound may play now (sound on, not muted or hushed). */
  private live(): AudioContext | null {
    const ctx = this.ctx;
    return ctx && this.master && !this.muted && !this.quiet && ctx.state === 'running' ? ctx : null;
  }

  /** A burst of soft noise through a filter (the body of most earthy sounds). */
  private hiss(ctx: AudioContext, t: number, type: BiquadFilterType, f0: number, f1: number, q: number, vol: number, attack: number, dur: number, pan = 0) {
    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vol, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(f).connect(env).connect(p).connect(this.master!);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  /** A short pitched blip (sine gliding f0 → f1). */
  private blip(ctx: AudioContext, t: number, f0: number, f1: number, vol: number, dur: number, type: OscillatorType = 'sine') {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vol, t + Math.min(0.006, dur * 0.2));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private lastCrunch = 0;

  /** Gravel crunching underfoot as a path is laid: a few tiny grains clicking in a soft scrunch. */
  crunch() {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (t - this.lastCrunch < 0.12) return;
    this.lastCrunch = t;
    const pan = (Math.random() - 0.5) * 0.3;
    this.hiss(ctx, t, 'bandpass', 2400 + Math.random() * 900, 1500, 1.1, 0.08, 0.012, 0.16, pan);
    const grains = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < grains; i++) {
      const s = t + Math.random() * 0.12;
      this.hiss(ctx, s, 'bandpass', 3500 + Math.random() * 2500, 3000, 4, 0.06 + Math.random() * 0.04, 0.001, 0.025, pan + (Math.random() - 0.5) * 0.3);
    }
  }

  private lastDig = 0;

  /** A spade going into soft earth: a dull thud and a scoop of soil. */
  dig() {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (t - this.lastDig < 0.22) return;
    this.lastDig = t;
    const k = 0.85 + Math.random() * 0.3;
    this.blip(ctx, t, 120 * k, 70 * k, 0.16, 0.12);
    this.hiss(ctx, t + 0.02, 'lowpass', 900 * k, 300, 0.7, 0.09, 0.03, 0.28, (Math.random() - 0.5) * 0.3);
  }

  private lastPat = 0;

  /** A plant firmed into the soil: a soft, muffled pat and a whisper of leaves. */
  pat() {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (t - this.lastPat < 0.16) return;
    this.lastPat = t;
    const k = 0.85 + Math.random() * 0.3;
    this.hiss(ctx, t, 'lowpass', 520 * k, 260, 0.8, 0.09, 0.004, 0.09);
    this.blip(ctx, t, 160 * k, 110 * k, 0.05, 0.07);
    if (Math.random() < 0.6) this.hiss(ctx, t + 0.05, 'bandpass', 3200 + Math.random() * 1500, 2600, 0.8, 0.012, 0.04, 0.2, (Math.random() - 0.5) * 0.4);
  }

  private lastPlop = 0;

  /** Something dropped into water: a rounded "bloop" rising in pitch, and a little spray. */
  plop(size = 0.5) {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (t - this.lastPlop < 0.1) return;
    this.lastPlop = t;
    const k = (0.85 + Math.random() * 0.3) / (0.6 + size * 0.8);
    this.blip(ctx, t, 380 * k, 980 * k, 0.09 * (0.6 + size), 0.09);
    this.hiss(ctx, t + 0.01, 'bandpass', 2400, 1600, 0.8, 0.025 * (0.5 + size), 0.01, 0.18);
  }

  /** Secateurs through a stem: a crisp double click (the blades), a green crunch, a tiny ring. */
  snip() {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    const k = 0.9 + Math.random() * 0.2;
    const pan = (Math.random() - 0.5) * 0.3;
    this.hiss(ctx, t, 'highpass', 5200 * k, 4000, 1.2, 0.07, 0.001, 0.02, pan);
    this.hiss(ctx, t + 0.012, 'bandpass', 1900 * k, 1200, 1.6, 0.06, 0.002, 0.05, pan);
    this.hiss(ctx, t + 0.055, 'highpass', 4400 * k, 3600, 1.2, 0.05, 0.001, 0.018, pan);
    this.blip(ctx, t + 0.004, 3100 * k, 2900 * k, 0.012, 0.12, 'triangle');
  }

  /** Picking something up to place it: a soft, happy pop. */
  pop() {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    const k = 0.92 + Math.random() * 0.16;
    this.blip(ctx, t, 520 * k, 900 * k, 0.1, 0.09);
    this.blip(ctx, t + 0.05, 780 * k, 1150 * k, 0.04, 0.08);
  }

  private lastRustle = 0;

  /** Leaves rustling as a hedge grows. */
  /** A soft leafy rustle (`volume` 0 … 1: a bunny in the flowers is quieter than a hedge). */
  rustle(volume = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || this.quiet || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (t - this.lastRustle < 0.18) return;
    this.lastRustle = t;
    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 2600 + Math.random() * 1200;
    hp.Q.value = 0.7;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.035 * volume, t + 0.06);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    src.connect(hp).connect(env).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 0.38);
  }

  private lastErase = 0;

  /** A soft, earthy "shff" as things sink back into the ground. */
  erase(amount = 0.5) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || this.quiet || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (t - this.lastErase < 0.14) return;
    this.lastErase = t;
    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(900 + Math.random() * 300, t);
    bp.frequency.exponentialRampToValueAtTime(380, t + 0.25);
    bp.Q.value = 0.9;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.06 + amount * 0.07, t + 0.03);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    src.connect(bp).connect(env).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 0.32);
  }

  private lastSplash = 0;

  /** A fish breaking the surface: a soft plop with a little spray. */
  splash(size = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || this.quiet || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (t - this.lastSplash < 0.1) return;
    this.lastSplash = t;
    this.bubble(ctx, t, (0.85 + Math.random() * 0.3) / Math.sqrt(size), 0.16 * Math.min(1, size));
    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800 + Math.random() * 600;
    bp.Q.value = 0.8;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.05 * size, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    src.connect(bp).connect(env).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 0.3);
  }

  /** Water welling up into a new pond: a soft, low trickle with the odd bubble, over a few seconds. */
  fill(seconds = 3.5) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || this.quiet || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.6;
    const src = ctx.createBufferSource();
    src.buffer = this.noise(ctx);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(380, t);
    lp.frequency.linearRampToValueAtTime(700, t + seconds);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.09, t + 0.8);
    env.gain.setValueAtTime(0.09, t + seconds * 0.6);
    env.gain.linearRampToValueAtTime(0, t + seconds);
    src.connect(lp).connect(env).connect(this.master);
    src.start(t);
    src.stop(t + seconds + 0.1);
    for (let i = 0; i < 7; i++) this.bubble(ctx, t + 0.3 + Math.random() * seconds * 0.8, 0.8 + Math.random() * 0.8, 0.05);
  }

  suspend() {
    void this.ctx?.suspend();
  }

  resume() {
    if (this.ctx && !this.muted) void this.ctx.resume();
  }

  /**
   * iOS can pause audio at any time (app switch, lock screen, calls) and only lets us restart it
   * from a touch, so every touch checks and wakes it if needed.
   */
  ensureRunning() {
    if (this.ctx && !this.muted && this.ctx.state !== 'running') void this.ctx.resume();
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
    if (this.birds && this.nature) this.birds.activity = this.nature.birdActivity();
    this.birds?.update();
    this.nature?.update();
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
