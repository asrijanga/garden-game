
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

// Time zones south of the equator (rough, but covers most players there).
const SOUTHERN_TZ = /^(Australia|Antarctica|Pacific\/(Auckland|Chatham|Fiji|Tongatapu|Apia|Noumea)|America\/(Sao_Paulo|Argentina|Santiago|Montevideo|Asuncion|La_Paz|Lima)|Africa\/(Johannesburg|Maputo|Harare|Windhoek|Gaborone|Maseru|Mbabane|Lusaka|Blantyre)|Indian\/(Mauritius|Reunion|Antananarivo))/;

const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
const PEEK_KEY = 'peek-season';

/** Peek at another season (just for this visit), or back to today's with null. Reloads. */
export function peekSeason(season: Season | null) {
  try {
    if (season) sessionStorage.setItem(PEEK_KEY, season);
    else sessionStorage.removeItem(PEEK_KEY);
  } catch {
    // no storage: nothing to remember
  }
  location.reload();
}

/** The season being peeked at (if any). */
export function peekedSeason(): Season | null {
  try {
    const s = sessionStorage.getItem(PEEK_KEY);
    return SEASONS.includes(s as Season) ? (s as Season) : null;
  } catch {
    return null;
  }
}

/** The season before / after this one. */
export const seasonShift = (s: Season, by: number): Season => SEASONS[(SEASONS.indexOf(s) + by + 4) % 4];

/**
 * The garden mirrors the player's real-world season. A peek (from the hidden season picker) or
 * `?season=` (for debugging) overrides it.
 */
export function currentSeason(date = new Date()): Season {
  const peek = peekedSeason();
  if (peek) return peek;
  const override = new URLSearchParams(location.search).get('season');
  if (override === 'spring' || override === 'summer' || override === 'autumn' || override === 'winter') {
    return override;
  }
  let month = date.getMonth(); // 0 = Jan
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  if (SOUTHERN_TZ.test(tz)) month = (month + 6) % 12;
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

export interface SeasonPalette {
  /** Broadleaf canopy colours, picked per tree. */
  canopy: string[];
  /** Evergreen needles. */
  pine: string[];
  /** Meadow grass: deep, mid, sunlit. */
  meadow: [string, string, string];
  /** Shaded forest floor. */
  forestFloor: string;
  /** Wildflowers that pop up in untended grass. */
  wildflowers: string[];
  /** Sun and sky-fill tints. */
  sun: string;
  sky: string;
  fog: string;
  /** Snow lies on roofs and frost on hedges. */
  snowy?: boolean;
}

export const PALETTES: Record<Season, SeasonPalette> = {
  spring: {
    canopy: ['#8dbb5a', '#a3c86a', '#7aad4e', '#f2b8cb', '#f6d3df', '#9cc463'],
    pine: ['#4a7347', '#557f4f'],
    meadow: ['#6ea446', '#82b24f', '#a6c45e'],
    forestFloor: '#4f6e36',
    wildflowers: ['#fff6e8', '#f6b3c8', '#c9b8f0', '#ffe27a', '#ffffff'],
    sun: '#ffe6bf',
    sky: '#cfe2f2',
    fog: '#c9dccf',
  },
  summer: {
    canopy: ['#5e9440', '#6fa34a', '#4f8236', '#7fae4f', '#588c3a'],
    pine: ['#3e6640', '#4a7347'],
    meadow: ['#5f9a3e', '#73a845', '#97b853'],
    forestFloor: '#3f5f2c',
    wildflowers: ['#ffffff', '#ffe27a', '#f28fa7', '#8fb2f0', '#ff9b5e'],
    sun: '#fff0d0',
    sky: '#c4dcf0',
    fog: '#bcd3c4',
  },
  autumn: {
    canopy: ['#c98236', '#b25a3a', '#d8a948', '#a8703f', '#cf9440', '#9c4a33', '#8f9748', '#71883f', '#c9a04a'],
    pine: ['#3f5f3c', '#4a6b44'],
    meadow: ['#729c40', '#86a947', '#a9b553'],
    forestFloor: '#5f6a36',
    wildflowers: ['#a98ad8', '#f2c94c', '#ffffff', '#e0a1c9', '#f0e6d2'],
    sun: '#ffcf96',
    sky: '#d6dbe6',
    fog: '#e3c9a6',
  },
  winter: {
    canopy: ['#e6ebf0', '#d8dfe6', '#cbd3da', '#eef1f4', '#b9b2a8'],
    pine: ['#4e6b5a', '#5d7a68'],
    meadow: ['#9fae96', '#c4cdbf', '#e6ebe6'],
    forestFloor: '#cdd5d6',
    wildflowers: ['#ffffff', '#e8eef6'],
    sun: '#ffe9d6',
    sky: '#cfdbe8',
    fog: '#d9e1ea',
    snowy: true,
  },
};

