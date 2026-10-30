import { Big, bouquetValue, NEW_KIND_BOOST, signature } from './points';
import type { CutStem } from './bunch';

/** A kind of bouquet you've made and sold: the first one's picture, and how it has done since. */
export interface Kept {
  sig: string;
  name: string;
  /** Its flowers, for the book (species and colour, each kind once). */
  flowers: { species: string; color: string }[];
  stems: number;
  sold: number;
  /** Its best price (a Big, as text). */
  best: string;
  first: number;
  /** A small picture of the first one (a JPEG data URL). */
  thumb?: string;
}

/** Each sale (of any bouquet) adds a little renown for good, so prices keep climbing. */
const RENOWN = 1.02;
/** Selling the same kind again: still worth something, but less each time. */
const REPEAT = 0.75;
const POINTS_KEY = 'garden-points';
const BOOK_KEY = 'garden-bouquets';
/** Pictures kept, at most (the rest of the book still lists them, with colour dabs). */
const MAX_THUMBS = 240;

/**
 * Your bouquets: the points they've earned (without limit), and every kind you've sold. Each new
 * kind raises every later price for good (×1.15), and every sale a little more (×1.02).
 */
export class Collection {
  points = new Big(0, 0);
  sales = 0;
  kept: Kept[] = [];

  static load(): Collection {
    const c = new Collection();
    try {
      const p = JSON.parse(localStorage.getItem(POINTS_KEY) ?? 'null') as { points: string; sales: number } | null;
      if (p) {
        c.points = Big.parse(p.points);
        c.sales = Number(p.sales) || 0;
      }
      const k = JSON.parse(localStorage.getItem(BOOK_KEY) ?? '[]') as Kept[];
      if (Array.isArray(k)) c.kept = k.filter((e) => e && typeof e.sig === 'string');
    } catch {
      // A fresh start.
    }
    return c;
  }

  save() {
    try {
      localStorage.setItem(POINTS_KEY, JSON.stringify({ points: this.points.toString(), sales: this.sales }));
      localStorage.setItem(BOOK_KEY, JSON.stringify(this.kept));
    } catch {
      // Out of room: drop the oldest pictures and try once more.
      for (const k of this.kept.slice(0, 40)) delete k.thumb;
      try {
        localStorage.setItem(BOOK_KEY, JSON.stringify(this.kept));
      } catch {
        // Private mode: kept for this visit.
      }
    }
  }

  /** What every price is multiplied by now. */
  get multiplier(): Big {
    return Big.pow10(this.kept.length * Math.log10(NEW_KIND_BOOST) + this.sales * Math.log10(RENOWN));
  }

  /** What these stems would sell for, and whether they're a kind you haven't sold before. */
  price(stems: CutStem[]): { value: Big; isNew: boolean; sig: string; repeat: number } {
    const sig = signature(stems);
    const had = this.kept.find((k) => k.sig === sig);
    const repeat = had ? had.sold : 0;
    const value = this.multiplier.times(bouquetValue(stems) * Math.max(0.25, REPEAT ** repeat));
    return { value, isNew: !had, sig, repeat };
  }

  /** Sold: the points are yours, and the book remembers it. */
  sell(stems: CutStem[], name: string, thumb?: string): { value: Big; isNew: boolean } {
    const { value, isNew, sig } = this.price(stems);
    this.points = this.points.plus(value);
    this.sales++;
    let entry = this.kept.find((k) => k.sig === sig);
    if (!entry) {
      const flowers = [...new Map(stems.map((s) => [`${s.species}${s.color}`, { species: s.species, color: s.color }])).values()].slice(0, 12);
      entry = { sig, name, flowers, stems: stems.length, sold: 0, best: '0e0', first: Date.now() };
      if (thumb && this.kept.filter((k) => k.thumb).length < MAX_THUMBS) entry.thumb = thumb;
      this.kept.push(entry);
    }
    entry.sold++;
    if (value.gte(Big.parse(entry.best))) entry.best = value.toString();
    this.save();
    return { value, isNew };
  }

  /** For a backup file. */
  toJSON(): { points: string; sales: number; kept: Kept[] } {
    return { points: this.points.toString(), sales: this.sales, kept: this.kept };
  }

  /** From a backup file. */
  restore(b: { points?: string; sales?: number; kept?: Kept[] }) {
    this.points = Big.parse(b.points ?? null);
    this.sales = Number(b.sales) || 0;
    this.kept = Array.isArray(b.kept) ? b.kept : [];
    this.save();
  }
}
