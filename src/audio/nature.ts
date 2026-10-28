import { createRng, lerp } from '../core/random';
import type { Season } from '../world/season';
import { forestImpulse } from './birds';

/** What the garden is like right now, as far as its creatures are concerned. */
export interface Mood {
  /** Time of day on the sun dial (0 dawn … 0.55 afternoon … 1 night). */
  time: number;
  /** 0 by day … 1 at night. */
  night: number;
  /** 0 … 1: how hard it's raining. */
  rain: number;
  /** 0 … 1: how wet everything still is. */
  wet: number;
  /** Is there a pond (for the frogs)? */
  ponds: boolean;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface Voice {
  nextAt: number;
}

/**
 * The garden's seasonal and night-time voices, all synthesised and all kept far off and soft:
 * crickets and frogs after dark, a distant owl, a cuckoo in spring, a wood pigeon in summer, crows
 * in autumn, a woodpecker drumming in winter and spring, and drips off the leaves when it's wet.
 * Each voice keeps its own clock and only speaks when the mood suits it.
 */
export class NatureSounds {
  mood: Mood = { time: 0.55, night: 0, rain: 0, wet: 0, ponds: false };
  private readonly rng = createRng(5151);
  private readonly bus: GainNode;
  private readonly far: GainNode;
  private readonly crickets: (Voice & { pan: number; rate: number; pitch: number; run: number })[] = [];
  private readonly frogs: Voice = { nextAt: 0 };
  private readonly owl: Voice = { nextAt: 0 };
  private readonly caller: Voice = { nextAt: 0 };
  private readonly drips: Voice = { nextAt: 0 };

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    private readonly season: Season,
  ) {
    this.bus = ctx.createGain();
    this.bus.connect(destination);
    // Far-off voices go through the forest: duller, with a soft echo.
    const reverb = ctx.createConvolver();
    reverb.buffer = forestImpulse(ctx, 2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    const dull = ctx.createBiquadFilter();
    dull.type = 'lowpass';
    dull.frequency.value = 2600;
    this.far = ctx.createGain();
    this.far.connect(dull).connect(this.bus);
    this.far.connect(reverb).connect(wet).connect(this.bus);
    const now = ctx.currentTime;
    const n = season === 'summer' ? 4 : season === 'autumn' ? 2 : season === 'spring' ? 1 : 0;
    for (let i = 0; i < n; i++) {
      this.crickets.push({ nextAt: now + 1 + this.rng() * 3, pan: lerp(-0.8, 0.8, (i + this.rng() * 0.6) / Math.max(1, n)), rate: lerp(0.55, 0.85, this.rng()), pitch: lerp(4200, 5200, this.rng()), run: 0 });
    }
    this.frogs.nextAt = now + 3;
    this.owl.nextAt = now + lerp(8, 20, this.rng());
    this.caller.nextAt = now + lerp(15, 35, this.rng());
  }

  /** How lively the songbirds should be at this moment (dawn chorus, hushed by rain, asleep at night). */
  birdActivity(): number {
    const { time, rain } = this.mood;
    const day = 1 - smooth(0.8, 0.92, time);
    const dawn = 1 + 2 * (1 - smooth(0.08, 0.3, time));
    const dusk = 1 - 0.4 * smooth(0.62, 0.8, time);
    return day * dawn * dusk * (1 - rain * 0.85);
  }

  update() {
    const now = this.ctx.currentTime;
    const { time, night, rain, wet, ponds } = this.mood;
    const dark = smooth(0.68, 0.95, time);
    const day = 1 - smooth(0.75, 0.9, time);

    // Crickets: each one keeps its own steady rhythm, with the odd pause; quiet in the rain.
    const cricketLevel = dark * (1 - rain * 0.9);
    for (const c of this.crickets) {
      if (now < c.nextAt) continue;
      if (cricketLevel < 0.05) {
        c.nextAt = now + 2;
        continue;
      }
      if (c.run <= 0) {
        // Start a new run of chirps after a little rest.
        c.run = 6 + Math.floor(this.rng() * 18);
        c.nextAt = now + lerp(0.5, 4, this.rng());
        continue;
      }
      c.run--;
      this.cricket(now + 0.02, c.pitch, c.pan, cricketLevel);
      c.nextAt = now + c.rate * lerp(0.95, 1.05, this.rng());
    }

    // Frogs by the pond on spring and summer nights (rain only cheers them up).
    if (now >= this.frogs.nextAt) {
      this.frogs.nextAt = now + lerp(3, 10, this.rng());
      if (ponds && dark > 0.4 && (this.season === 'spring' || this.season === 'summer')) {
        const pan = lerp(-0.6, 0.6, this.rng());
        const n = 1 + Math.floor(this.rng() * 3);
        for (let i = 0; i < n; i++) this.frog(now + i * lerp(0.35, 0.6, this.rng()), pan, dark * lerp(0.6, 1, this.rng()));
        // Sometimes another answers from the other bank.
        if (this.rng() < 0.4) this.frog(now + lerp(1.2, 2.2, this.rng()), -pan, dark * 0.6);
      }
    }

    // An owl, far off in the woods, now and then through the night.
    if (now >= this.owl.nextAt) {
      this.owl.nextAt = now + lerp(25, 60, this.rng());
      if (night > 0.5 && rain < 0.5) this.hoot(now + 0.05, lerp(-0.9, 0.9, this.rng()));
    }

    // The season's own caller, by day.
    if (now >= this.caller.nextAt) {
      this.caller.nextAt = now + lerp(35, 80, this.rng());
      if (day > 0.6 && rain < 0.4) {
        const pan = lerp(-0.9, 0.9, this.rng());
        const t = now + 0.05;
        if (this.season === 'spring') this.rng() < 0.6 ? this.cuckoo(t, pan) : this.woodpecker(t, pan);
        else if (this.season === 'summer') this.pigeon(t, pan);
        else if (this.season === 'autumn') this.crow(t, pan);
        else this.woodpecker(t, pan);
      }
    }

    // Drips off leaves and eaves: a patter in the rain, slowing as things dry.
    if (now >= this.drips.nextAt) {
      const rate = rain * 5 + wet * 1.2;
      this.drips.nextAt = now + (rate > 0.05 ? (-Math.log(1 - this.rng() * 0.95) / rate) : 1);
      if (rate > 0.05) this.drip(now + 0.02, lerp(-0.9, 0.9, this.rng()), lerp(0.4, 1, this.rng()));
    }
  }

  private gain(t: number, dest: AudioNode, end: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.connect(dest);
    setTimeout(() => g.disconnect(), (end - this.ctx.currentTime + 3) * 1000);
    return g;
  }

  private panned(pan: number, dest: AudioNode): StereoPannerNode {
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(dest);
    return p;
  }

  /** A cricket chirp: three or four very quick pulses of a high, pure tone. */
  private cricket(t: number, pitch: number, pan: number, level: number) {
    const ctx = this.ctx;
    const pulses = 3 + (this.rng() < 0.4 ? 1 : 0);
    const end = t + pulses * 0.032 + 0.05;
    const env = this.gain(t, this.panned(pan, this.bus), end);
    const osc = ctx.createOscillator();
    osc.frequency.value = pitch;
    const peak = 0.012 * level;
    for (let i = 0; i < pulses; i++) {
      const s = t + i * 0.032;
      env.gain.setValueAtTime(0, s);
      env.gain.linearRampToValueAtTime(peak, s + 0.006);
      env.gain.linearRampToValueAtTime(0, s + 0.024);
    }
    osc.connect(env);
    osc.start(t);
    osc.stop(end);
  }

  /** A frog: a low, buzzy "rrribbit" (a reedy tone, pulsing fast, through a throaty filter). */
  private frog(t: number, pan: number, level: number) {
    const ctx = this.ctx;
    const dur = lerp(0.18, 0.28, this.rng());
    const env = this.gain(t, this.panned(pan, this.far), t + dur + 0.1);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const f = lerp(150, 210, this.rng());
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.linearRampToValueAtTime(f * 1.15, t + dur);
    const throat = ctx.createBiquadFilter();
    throat.type = 'bandpass';
    throat.frequency.value = lerp(550, 800, this.rng());
    throat.Q.value = 3;
    // The rattle: the voice switches on and off ~35 times a second.
    const rattle = ctx.createGain();
    rattle.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = lerp(30, 42, this.rng());
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(rattle.gain);
    env.gain.linearRampToValueAtTime(0.05 * level, t + 0.02);
    env.gain.setTargetAtTime(0, t + dur * 0.7, dur * 0.15);
    osc.connect(throat).connect(rattle).connect(env);
    for (const o of [osc, lfo]) {
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  /** A soft whistled or hooted note through the far-off forest. */
  private hum(t: number, f0: number, f1: number, dur: number, vol: number, pan: number, dest: AudioNode = this.far, type: OscillatorType = 'sine') {
    const ctx = this.ctx;
    const env = this.gain(t, this.panned(pan, dest), t + dur + 0.2);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env.gain.linearRampToValueAtTime(vol, t + Math.min(0.06, dur * 0.3));
    env.gain.setTargetAtTime(0, t + dur * 0.65, dur * 0.15);
    osc.connect(env);
    osc.start(t);
    osc.stop(t + dur + 0.2);
  }

  /** A tawny owl: "hooo … hoo-hoo-hoooo", low and breathy. */
  private hoot(t: number, pan: number) {
    const f = lerp(380, 440, this.rng());
    this.hum(t, f, f * 0.94, 0.7, 0.05, pan);
    let s = t + 1.6;
    for (const [d, k] of [[0.18, 0.97], [0.18, 0.97], [0.9, 0.9]] as const) {
      this.hum(s, f * 0.98, f * k, d, 0.04, pan);
      s += d + 0.12;
    }
  }

  /** A cuckoo calling across the valley, two or three times. */
  private cuckoo(t: number, pan: number) {
    const n = 2 + Math.floor(this.rng() * 3);
    const f = lerp(640, 720, this.rng());
    for (let i = 0; i < n; i++) {
      const s = t + i * 0.95;
      this.hum(s, f, f * 0.98, 0.2, 0.05, pan);
      this.hum(s + 0.3, f * 0.8, f * 0.78, 0.32, 0.05, pan);
    }
  }

  /** A wood pigeon's lazy "coo-COO-coo, coo-coo". */
  private pigeon(t: number, pan: number) {
    const f = lerp(380, 430, this.rng());
    let s = t;
    for (const [d, k, v] of [[0.3, 1, 0.03], [0.45, 1.08, 0.045], [0.3, 1, 0.03], [0.25, 0.97, 0.03], [0.3, 0.95, 0.03]] as const) {
      this.hum(s, f * k * 0.96, f * k, d, v, pan);
      s += d + 0.15;
    }
  }

  /** Crows in the far trees: two or three hoarse caws. */
  private crow(t: number, pan: number) {
    const ctx = this.ctx;
    const n = 2 + Math.floor(this.rng() * 2);
    for (let i = 0; i < n; i++) {
      const s = t + i * lerp(0.45, 0.6, this.rng());
      const dur = 0.28;
      const env = this.gain(s, this.panned(pan, this.far), s + dur + 0.1);
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(lerp(520, 600, this.rng()), s);
      osc.frequency.exponentialRampToValueAtTime(420, s + dur);
      const nasal = ctx.createBiquadFilter();
      nasal.type = 'bandpass';
      nasal.frequency.value = 1300;
      nasal.Q.value = 2.5;
      env.gain.linearRampToValueAtTime(0.03, s + 0.03);
      env.gain.setTargetAtTime(0, s + dur * 0.6, 0.05);
      osc.connect(nasal).connect(env);
      osc.start(s);
      osc.stop(s + dur + 0.1);
    }
  }

  /** A woodpecker drumming on a far trunk: a fast roll of knocks that slows and softens. */
  private woodpecker(t: number, pan: number) {
    const ctx = this.ctx;
    const n = 14 + Math.floor(this.rng() * 8);
    const out = this.panned(pan, this.far);
    let s = t;
    for (let i = 0; i < n; i++) {
      const env = this.gain(s, out, s + 0.05);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(lerp(900, 1100, this.rng()), s);
      osc.frequency.exponentialRampToValueAtTime(500, s + 0.025);
      env.gain.linearRampToValueAtTime(0.04 * (1 - i / n * 0.6), s + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0001, s + 0.03);
      osc.connect(env);
      osc.start(s);
      osc.stop(s + 0.04);
      s += 0.045 + i * 0.0012;
    }
  }

  /** One drip: a tiny bright "plip" falling in pitch. */
  private drip(t: number, pan: number, size: number) {
    const f = lerp(1400, 2600, this.rng()) / (0.6 + size * 0.5);
    this.hum(t, f * 1.4, f, 0.045, 0.012 * size, pan, this.bus);
  }
}
