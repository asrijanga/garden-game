import type { Stem } from './points';

/**
 * One stem you've cut in a bed: enough to grow it again exactly (its species, the shape it was
 * grown from and its own seed) for the bouquet, and what it's worth.
 */
export interface CutStem extends Stem {
  /** Which of the species' shapes it was (its garden mesh). */
  variant: number;
  /** Its own seed: the same stem every time it's rebuilt. */
  seed: number;
}

/** At most this many in your hand (a generous armful). */
export const MAX_STEMS = 24;

const KEY = 'garden-bunch';

/** The stems in your hand, kept between visits (you can wander off mid-bunch). */
export function loadBunch(): CutStem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as CutStem[];
    return Array.isArray(raw) ? raw.filter((s) => s && typeof s.species === 'string').slice(0, MAX_STEMS) : [];
  } catch {
    return [];
  }
}

export function saveBunch(stems: CutStem[]) {
  try {
    if (stems.length) localStorage.setItem(KEY, JSON.stringify(stems));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: the bunch lasts as long as the visit.
  }
}
