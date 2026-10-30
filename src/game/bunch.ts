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

/** Colour words for a bouquet's name, by hue (twelve slices round the wheel), plus white. */
const COLOUR_WORDS: Record<string, string[]> = {
  white: ['Snow', 'Ivory', 'Moonlight', 'Linen'],
  h0: ['Ruby', 'Poppy', 'Scarlet'],
  h1: ['Ember', 'Marmalade', 'Apricot'],
  h2: ['Honey', 'Amber', 'Saffron'],
  h3: ['Buttercup', 'Lemon', 'Sunshine'],
  h4: ['Meadow', 'Lime', 'Spring'],
  h5: ['Fern', 'Sage', 'Moss'],
  h6: ['Mint', 'Glade', 'Willow'],
  h7: ['Sea', 'Lagoon', 'Teal'],
  h8: ['Sky', 'Forget-me-not', 'Cornflower'],
  h9: ['Bluebell', 'Twilight', 'Indigo'],
  h10: ['Violet', 'Lavender', 'Heather'],
  h11: ['Blush', 'Rose', 'Peony'],
};

function family(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 0.08 || l > 0.9) return 'white';
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return `h${Math.round(h * 12) % 12}`;
}

/**
 * A name to suggest for a bouquet, from what's in it: its main colour (or two), and a word for
 * its size, or its flower if it's mostly one kind ("Blush & Honey Posy", "Snow Dahlia Bunch").
 */
export function bouquetName(stems: CutStem[], speciesName: (id: string) => string): string {
  const seed = stems.reduce((a, s) => (a * 31 + s.seed) % 100003, 7);
  const pick = <T>(list: T[], k = 0) => list[(seed + k * 7) % list.length];
  const counts = new Map<string, number>();
  for (const s of stems) if (s.kind !== 'foliage') counts.set(family(s.color), (counts.get(family(s.color)) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
  const colours = ranked.length ? ranked : ['h5'];
  const first = pick(COLOUR_WORDS[colours[0]]);
  const colour = colours.length > 1 && counts.get(colours[1])! >= stems.length * 0.25 ? `${first} & ${pick(COLOUR_WORDS[colours[1]], 1)}` : first;
  const size = stems.length <= 5 ? 'Posy' : stems.length <= 12 ? pick(['Bunch', 'Nosegay', 'Bouquet'], 2) : pick(['Armful', 'Bouquet', 'Gathering'], 3);
  const kinds = new Map<string, number>();
  for (const s of stems) kinds.set(s.species, (kinds.get(s.species) ?? 0) + 1);
  const [main, many] = [...kinds.entries()].sort((a, b) => b[1] - a[1])[0];
  const flower = many >= stems.length * 0.6 && !main.startsWith('leaf:') ? `${speciesName(main)} ` : '';
  return `${colour} ${flower}${size}`;
}
