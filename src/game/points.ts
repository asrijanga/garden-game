/**
 * Points that can grow without limit: a number kept as mantissa × 10^exponent, so it never runs
 * out of room (an ordinary number tops out near 1.8e308), written the way idle games write them:
 * 950, 12.4K, 3.10M, 7.25B, 1.00T, then aa, ab, ac … az, ba … for ever.
 */
export class Big {
  constructor(
    readonly m: number,
    readonly e: number,
  ) {}

  static of(n: number): Big {
    if (n <= 0 || !Number.isFinite(n)) return new Big(0, 0);
    const e = Math.floor(Math.log10(n));
    return new Big(n / 10 ** e, e);
  }

  static parse(s: string | null): Big {
    if (!s) return new Big(0, 0);
    const [m, e] = s.split('e').map(Number);
    return Number.isFinite(m) && Number.isFinite(e) ? new Big(m, e).norm() : new Big(0, 0);
  }

  toString(): string {
    return `${this.m}e${this.e}`;
  }

  private norm(): Big {
    if (this.m <= 0) return new Big(0, 0);
    const k = Math.floor(Math.log10(this.m));
    return k === 0 ? this : new Big(this.m / 10 ** k, this.e + k);
  }

  plus(b: Big): Big {
    if (this.m === 0) return b;
    if (b.m === 0) return this;
    const [hi, lo] = this.e >= b.e ? [this as Big, b] : [b, this as Big];
    const gap = hi.e - lo.e;
    if (gap > 20) return hi;
    return new Big(hi.m + lo.m / 10 ** gap, hi.e).norm();
  }

  times(k: number): Big {
    return k <= 0 ? new Big(0, 0) : new Big(this.m * k, this.e).norm();
  }

  timesBig(b: Big): Big {
    return new Big(this.m * b.m, this.e + b.e).norm();
  }

  /** At least as big as `b`? */
  gte(b: Big): boolean {
    if (this.m === 0) return b.m === 0;
    if (b.m === 0) return true;
    return this.e !== b.e ? this.e > b.e : this.m >= b.m;
  }

  /** "950", "12.4K", "3.10M", "7.25B", "1.00T", then "aa", "ab" … */
  format(): string {
    if (this.m === 0) return '0';
    if (this.e < 3) return String(Math.floor(this.m * 10 ** this.e));
    const group = Math.floor(this.e / 3);
    const shown = this.m * 10 ** (this.e - group * 3);
    const digits = shown >= 100 ? 0 : shown >= 10 ? 1 : 2;
    return `${(Math.floor(shown * 10 ** digits) / 10 ** digits).toFixed(digits)}${suffix(group)}`;
  }
}

/** K, M, B, T, then two letters: aa, ab … zz, then three … */
function suffix(group: number): string {
  const named = ['', 'K', 'M', 'B', 'T'];
  if (group < named.length) return named[group];
  let n = group - named.length;
  let len = 2;
  let span = 26 ** len;
  while (n >= span) {
    n -= span;
    len++;
    span = 26 ** len;
  }
  let out = '';
  for (let i = 0; i < len; i++) {
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

/** One cut stem in a bouquet: what it is, its colour, and whether it's in its season. */
export interface Stem {
  species: string;
  /** Its petal colour (hex). */
  color: string;
  edge?: string;
  /** Flowering in its own season (out-of-season stems are rarer, and worth more). */
  inSeason: boolean;
  /** Rose, water flower, foliage… (sets its base worth). */
  kind: string;
}

/** A bouquet's signature: its flowers and colour families, so the same mix counts as one kind. */
export function signature(stems: Stem[]): string {
  const parts = stems.map((s) => `${s.species}/${hueFamily(s.color)}`);
  return [...new Set(parts)].sort().join('+');
}

function hsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

/** Which colour family: 12 hue slices, plus white and green. */
function hueFamily(hex: string): string {
  const [h, s, l] = hsl(hex);
  if (l > 0.88 || s < 0.15) return 'white';
  return `h${Math.round(h * 12) % 12}`;
}

/**
 * How well the colours sit together (0.8 … 1.6): one family or neighbouring hues (analogous),
 * or opposite hues set off by each other (complementary) score well; a muddle of many scores less.
 * White and green go with anything.
 */
export function harmony(stems: Stem[]): number {
  const hues = stems.map((s) => hsl(s.color)).filter(([, sat, l]) => sat >= 0.15 && l <= 0.88).map(([h]) => h);
  if (hues.length < 2) return 1.2;
  const dist = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));
  let spread = 0;
  for (const a of hues) for (const b of hues) spread = Math.max(spread, dist(a, b));
  const families = new Set(hues.map((h) => Math.round(h * 12) % 12)).size;
  if (spread < 0.1) return 1.5; // tonal
  if (spread < 0.2) return 1.6; // analogous
  if (spread > 0.42 && families <= 3) return 1.45; // complementary
  return Math.max(0.8, 1.3 - (families - 3) * 0.12);
}

/** What makes a stem worth more or less on its own. */
function stemWorth(s: Stem): number {
  const base = s.kind === 'rose' ? 30 : s.kind === 'aquatic' ? 40 : s.kind === 'foliage' ? 6 : 15;
  return base * (s.inSeason ? 1 : 2.5) * (s.edge && s.edge !== s.color ? 1.3 : 1);
}

/**
 * A bouquet's price before the collection's multiplier: its stems' worth, more for variety and
 * good colour, and for being generous (but not without end: 30 stems isn't 30× one).
 */
export function bouquetValue(stems: Stem[]): number {
  if (!stems.length) return 0;
  const worth = stems.reduce((sum, s) => sum + stemWorth(s), 0);
  const kinds = new Set(stems.map((s) => s.species)).size;
  const variety = 1 + 0.3 * (kinds - 1);
  const generous = Math.pow(stems.length, 0.15);
  return Math.round(worth * variety * harmony(stems) * generous);
}

/** Each new kind of bouquet you make raises every later price for good, by this much. */
export const NEW_KIND_BOOST = 1.15;
