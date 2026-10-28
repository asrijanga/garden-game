import { createRng, lerp } from '../core/random';
import type { Season } from '../world/season';

type Phrase = 'whistle' | 'warble' | 'trill' | 'chirps';
const PHRASES: Phrase[] = ['whistle', 'warble', 'trill', 'chirps'];

/**
 * Distant birdsong, synthesised: whistled notes that glide in pitch with a natural warble,
 * placed somewhere in the trees around the clearing with a soft forest echo. Rare and quiet,
 * so it's a pleasant surprise rather than a soundtrack.
 */
export class Birds {
  private readonly rng = createRng(2027);
  private readonly bus: GainNode;
  private nextAt: number; // audio-clock time of the next song
  private readonly pace: number;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    season: Season,
  ) {
    // Gentle forest reverb: a short, soft, decaying tail.
    const reverb = ctx.createConvolver();
    reverb.buffer = forestImpulse(ctx, 1.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.bus = ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(destination);
    this.bus.connect(reverb).connect(wet).connect(destination);
    this.nextAt = ctx.currentTime + 5; // first song a few seconds after sound starts
    this.pace = season === 'spring' ? 0.7 : season === 'summer' ? 0.85 : season === 'autumn' ? 1.1 : 2.4;
  }

  /** How lively the birds are (a dawn chorus ≈ 3, midday 1, silent at night or in heavy rain). */
  activity = 1;

  /** Uses the real audio clock, so birds keep their pace whatever the frame rate. */
  update() {
    if (this.ctx.currentTime < this.nextAt) return;
    if (this.activity < 0.05) {
      // Asleep (or sheltering): look again in a little while.
      this.nextAt = this.ctx.currentTime + 4;
      return;
    }
    const kind = PHRASES[Math.floor(this.rng() * PHRASES.length)];
    const pan = lerp(-0.85, 0.85, this.rng());
    const at = this.ctx.currentTime + 0.05;
    this.sing(kind, at, pan, lerp(0.75, 1.0, this.rng()));
    // Sometimes a second bird answers from across the clearing.
    // At dawn they answer each other more.
    if (this.rng() < Math.min(0.8, 0.35 * this.activity)) this.sing(kind, at + lerp(1.4, 3.0, this.rng()), -pan * lerp(0.6, 1, this.rng()), lerp(0.55, 0.8, this.rng()));
    this.nextAt = this.ctx.currentTime + (lerp(10, 25, this.rng()) * this.pace) / Math.max(0.3, this.activity);
  }

  /** A garden bird close by: a quick chirp or a little warble, panned to where it sits. */
  near(pan: number, loud: number) {
    this.sing(this.rng() < 0.65 ? 'chirps' : 'warble', this.ctx.currentTime + 0.02, pan, loud);
  }

  private sing(kind: Phrase, t: number, pan: number, loud: number) {
    const ctx = this.ctx;
    // Each bird sits at its own distance: farther = quieter and a little duller.
    const out = ctx.createGain();
    out.gain.value = 0.045 * loud;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = lerp(5200, 7500, loud);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    out.connect(tone).connect(p).connect(this.bus);

    const pitch = lerp(0.9, 1.12, this.rng()); // every bird has its own voice
    let end = t;
    const note = (start: number, f0: number, f1: number, dur: number, vib = 0) => {
      end = Math.max(end, this.note(out, start, f0 * pitch, f1 * pitch, dur, vib));
    };

    switch (kind) {
      case 'whistle': {
        // A clear, sweet two-note "fee-bee".
        note(t, 3950, 3880, 0.34, 18);
        note(t + 0.44, 3380, 3260, 0.4, 18);
        break;
      }
      case 'warble': {
        let s = t;
        const n = 5 + Math.floor(this.rng() * 4);
        for (let i = 0; i < n; i++) {
          const f = lerp(2300, 3500, this.rng());
          const d = lerp(0.07, 0.14, this.rng());
          note(s, f, f + lerp(-500, 600, this.rng()), d, 25);
          s += d + lerp(0.03, 0.08, this.rng());
        }
        break;
      }
      case 'trill': {
        const n = 9 + Math.floor(this.rng() * 6);
        const f = lerp(3900, 4600, this.rng());
        for (let i = 0; i < n; i++) note(t + i * 0.062, f * (1 - i * 0.008), f * (1 - i * 0.008) * 0.86, 0.038);
        break;
      }
      case 'chirps': {
        note(t, 2600, 3700, 0.07);
        note(t + 0.16, 2700, 3900, 0.07);
        if (this.rng() < 0.5) note(t + 0.34, 2650, 3800, 0.07);
        break;
      }
    }
    // Tidy up this bird's nodes once its song (and echo) has finished.
    setTimeout(() => out.disconnect(), (end - ctx.currentTime + 3) * 1000);
  }

  /** One whistled syllable: a pure tone gliding f0 → f1, soft attack and release. */
  private note(out: AudioNode, t: number, f0: number, f1: number, dur: number, vibrato = 0): number {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    if (vibrato > 0) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = lerp(22, 32, this.rng());
      const depth = ctx.createGain();
      depth.gain.value = vibrato;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    // A faint overtone gives the whistle a natural, slightly reedy body.
    const over = ctx.createOscillator();
    over.type = 'sine';
    over.frequency.setValueAtTime(f0 * 2, t);
    over.frequency.exponentialRampToValueAtTime(f1 * 2, t + dur);
    const overGain = ctx.createGain();
    overGain.gain.value = 0.08;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + Math.min(0.025, dur * 0.3));
    env.gain.setTargetAtTime(0, t + dur * 0.6, dur * 0.18);

    osc.connect(env);
    over.connect(overGain).connect(env);
    env.connect(out);
    osc.start(t);
    over.start(t);
    osc.stop(t + dur + 0.1);
    over.stop(t + dur + 0.1);
    return t + dur + 0.1;
  }
}

export function forestImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const rng = createRng(99);
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      lp += ((rng() * 2 - 1) - lp) * 0.35; // soften the tail: foliage absorbs the highs
      data[i] = lp * Math.pow(1 - t, 3) * 0.5;
    }
  }
  return buffer;
}
