import * as THREE from 'three';
import type { SeasonPalette } from './season';

/** One moment of the day: where the light comes from, its colours, and the mood of the picture. */
interface Key {
  at: number;
  /** Sun (or moon) height and turn, in degrees (turn 0 = the afternoon sun from the front left). */
  elevation: number;
  turn: number;
  sun: THREE.Color;
  sunIntensity: number;
  sky: THREE.Color;
  ground: THREE.Color;
  skyIntensity: number;
  haze: THREE.Color;
  /** How close the haze comes in (dawn mist < 1; > 1 keeps it out among the trees at dusk and night). */
  mist: number;
  lift: THREE.Color;
  gain: THREE.Color;
  saturation: number;
  bloom: number;
  /** Overall brightness of reflections in the water. */
  glow: number;
}

export interface Lighting {
  sunDir: THREE.Vector3;
  sun: THREE.Color;
  sunIntensity: number;
  sky: THREE.Color;
  ground: THREE.Color;
  skyIntensity: number;
  haze: THREE.Color;
  mist: number;
  lift: THREE.Color;
  gain: THREE.Color;
  saturation: number;
  bloom: number;
  glow: number;
  /** 0 by day … 1 at night (for lamps, windows, fireflies). */
  night: number;
}

const C = (hex: string) => new THREE.Color(hex);
const mix = (a: string, b: string, k: number) => C(a).lerp(C(b), k);

/**
 * The day's light, from dawn mist through the golden afternoon (the garden's usual look) and dusk
 * into moonlit night, built on the season's own palette. `light(p)` blends the nearest keys
 * (p: 0 dawn … 1 night).
 */
export class TimeOfDay {
  private readonly keys: Key[];

  constructor(palette: SeasonPalette) {
    const k = (at: number, elevation: number, turn: number, sun: THREE.Color, sunIntensity: number, sky: THREE.Color, ground: THREE.Color, skyIntensity: number, haze: THREE.Color, mist: number, lift: string, gain: string, saturation: number, bloom: number, glow: number): Key => ({ at, elevation, turn, sun, sunIntensity, sky, ground, skyIntensity, haze, mist, lift: C(lift), gain: C(gain), saturation, bloom, glow });
    this.keys = [
      // Dawn: a low pink sun from the far side, lilac sky, mist lying close.
      k(0.0, 9, -95, C('#ffcaa8'), 2.2, mix(palette.sky, '#f0d2e2', 0.5), C('#6a5a4c'), 1.25, mix(palette.fog, '#f6dce2', 0.45), 0.82, '#2a1c22', '#fff2f2', 1.0, 0.6, 0.9),
      // Morning: clear, fresh light.
      k(0.3, 30, -55, mix(palette.sun, '#ffffff', 0.5), 2.7, C(palette.sky), C('#6b5a3a'), 1.3, C(palette.fog), 1.0, '#221a14', '#fff8f0', 1.05, 0.5, 1),
      // Golden afternoon: the garden's usual look.
      k(0.55, 38.3, 0, C(palette.sun), 3.0, C(palette.sky), C('#6b5a3a'), 1.35, C(palette.fog), 1.0, '#2a1a10', '#fff4e6', 1.08, 0.55, 1),
      // Dusk: a deep orange sun going down, a warm glowing haze.
      k(0.78, 9, 45, C('#ffa868'), 2.4, mix('#f6b88a', palette.sky, 0.4), C('#5a4a40'), 1.15, mix(palette.fog, '#f6c8a0', 0.6), 1.45, '#2a1610', '#fff0dc', 1.1, 0.7, 0.85),
      // Night: cool moonlight, a deep blue sky; the cottage windows glow.
      k(1.0, 50, 120, C('#a8c0ff'), 1.0, C('#3a4c88'), C('#232634'), 0.8, C('#2a3866'), 1.7, '#121a30', '#dce6ff', 0.85, 0.9, 0.5),
    ];
  }

  light(p: number): Lighting {
    p = Math.min(1, Math.max(0, p));
    let i = 0;
    while (i < this.keys.length - 2 && p > this.keys[i + 1].at) i++;
    const a = this.keys[i];
    const b = this.keys[i + 1];
    const t0 = (p - a.at) / (b.at - a.at);
    const t = t0 * t0 * (3 - 2 * t0);
    const n = (x: number, y: number) => x + (y - x) * t;
    const c = (x: THREE.Color, y: THREE.Color) => x.clone().lerp(y, t);
    // The sun swings round from the morning side to the evening side (the afternoon sun is the
    // garden's usual light from the front left).
    const base = Math.atan2(0.48, -0.62);
    const turn = THREE.MathUtils.degToRad(n(a.turn, b.turn));
    const el = THREE.MathUtils.degToRad(n(a.elevation, b.elevation));
    const az = base + turn;
    const sunDir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
    return {
      sunDir,
      sun: c(a.sun, b.sun),
      sunIntensity: n(a.sunIntensity, b.sunIntensity),
      sky: c(a.sky, b.sky),
      ground: c(a.ground, b.ground),
      skyIntensity: n(a.skyIntensity, b.skyIntensity),
      haze: c(a.haze, b.haze),
      mist: n(a.mist, b.mist),
      lift: c(a.lift, b.lift),
      gain: c(a.gain, b.gain),
      saturation: n(a.saturation, b.saturation),
      bloom: n(a.bloom, b.bloom),
      glow: n(a.glow, b.glow),
      night: Math.min(1, Math.max(0, (p - 0.78) / 0.22)),
    };
  }
}
