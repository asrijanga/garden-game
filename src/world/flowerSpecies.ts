import type { Season } from './season';
import type { HeroHints } from './heroParts';

/**
 * The flower collection. Flowers only: no vegetables or utility plants. Each species is a
 * recipe for a procedural flower with its own silhouette; every planted flower varies within it.
 */
export interface RadialForm {
  kind: 'radial';
  petals: [number, number];
  length: number;
  width: number;
  /** Radians from vertical when fully open (> π/2 droops, like a black-eyed Susan). */
  open: number;
  layers: number;
  center: string;
  centerSize: number;
  /** Layers rise into a dome, open angles closing toward the middle (pom-poms, dahlias). */
  domed?: boolean;
  /** The whole bloom tilts to face sideways (pansies). */
  tilt?: number;
  /** Darker "face" toward the heart of each petal, 0..1 (pansy blotch). */
  blotch?: number;
  /** Notched petal tips (cosmos). */
  notch?: boolean;
  /** Pointed petal tips (dahlias). */
  pointed?: boolean;
  /** Raised cone centre, as a height in metres (black-eyed Susan). */
  cone?: number;
  /** Ring of stamens around the centre (anemone). */
  stamens?: string;
  /** A trumpet in the middle, as long as this fraction of a petal (daffodil). */
  corona?: { color: string; length: number };
}

export type FlowerForm =
  | RadialForm
  | { kind: 'cup'; petals: number; length: number; width: number; open: number }
  | { kind: 'spike'; florets: number; spikeLength: number; floretSize: number; bell: boolean }
  | {
      kind: 'aquatic';
      type: 'lotus' | 'lily' | 'hyacinth' | 'flag' | 'marigold' | 'pickerel' | 'arrowhead';
      /** Bloom size (metres, before storybook scaling). */
      size: number;
    }
  | {
      kind: 'rose';
      /** Hybrid tea, floribunda, English/cabbage, climber, shrub/wild, miniature/patio. */
      type: 'tea' | 'floribunda' | 'cabbage' | 'climber' | 'wild' | 'mini';
      /** Bloom radius (metres, before storybook scaling). */
      size: number;
    }
  /** Arching stems hung with flowers: hearts (bleeding heart) or bells (Solomon's seal, fuchsia). */
  | { kind: 'arch'; florets: number; floretSize: number; shape: 'heart' | 'bell' }
  /** An airy cloud of tiny florets on fine branching stems (baby's breath, lady's mantle). */
  | { kind: 'cloud'; florets: number; spread: number; floretSize: number }
  /** A pincushion head with a frill (scabious), or a spiky steel ball (globe thistle). */
  | { kind: 'pincushion'; size: number; spiky: boolean }
  /** A dense torch of drooping tubes, shading from the base colour up to the edge colour (red hot poker). */
  | { kind: 'torch'; length: number; radius: number }
  /** A foliage plant (grass, fern, hosta, heuchera, lamb's ear, box), tinted by its colour. */
  | { kind: 'foliage'; leaf: 'grass' | 'fern' | 'hosta' | 'silver' | 'box' }
  | {
      kind: 'cluster';
      florets: number;
      radius: number;
      floretSize: number;
      /** Flat-topped (sedum, yarrow), a domed mophead (hydrangea, geranium), or a ball on a bare stem (allium). */
      shape?: 'flat' | 'dome' | 'globe';
    };

export interface FlowerSpecies {
  id: string;
  name: string;
  /** Seasons when it is in full bloom (the player's own seasons; the game flips them south). */
  seasons: Season[];
  height: [number, number];
  colors: string[];
  form: FlowerForm;
  /** Minimum spacing between plants, metres. */
  spacing: number;
  /** Water plants: deep-water floaters, shallow-water marginals, or the damp bank. */
  zone?: 'deep' | 'shallow' | 'bank';
  /** What it looks like close up, beyond its garden shape (botany: discs, florets, leaves…). */
  hero?: HeroHints;
}

/**
 * Rose colours, from classic red to white, with blends and bicolours written "base|edge"
 * (the petal shades from one at the heart to the other at its edge).
 */
const ROSE_COLOURS = [
  '#c8102e', // classic red
  '#a8102a', // crimson
  '#6e0f22', // burgundy
  '#f6c6cc', // blush
  '#e8407a', // hot pink
  '#f2735a', // coral
  '#f6b48a', // peach
  '#f2a05a', // apricot
  '#f6d23a', // sunshine yellow
  '#f6ecd0', // cream
  '#fbf8f2', // white
  '#c8b0dc', // lavender
  '#b48aa8', // mauve
  '#f6d23a|#e8407a', // yellow blushing pink at the edges
  '#fbf8f2|#c8102e', // white edged in red
  '#f6b48a|#f6ecd0', // peach fading to cream
];

export const SPECIES: FlowerSpecies[] = [
  {
    id: 'aster',
    name: 'Aster',
    seasons: ['autumn'],
    height: [0.34, 0.5],
    colors: ['#9b7fd6', '#b49be6', '#c78bc9', '#8a6fd0', '#d6a5df'],
    form: { kind: 'radial', petals: [20, 28], length: 0.05, width: 0.008, open: 1.35, layers: 2, center: '#f2c94c', centerSize: 0.016 },
    spacing: 0.16,
  },
  {
    id: 'chrysanthemum',
    name: 'Chrysanthemum',
    seasons: ['autumn'],
    height: [0.28, 0.4],
    colors: ['#e0892f', '#c9632c', '#f0b73d', '#a83d3a', '#e6a05a', '#f2d36b'],
    form: { kind: 'radial', petals: [14, 18], length: 0.034, width: 0.012, open: 1.5, layers: 6, center: '#c9932c', centerSize: 0.01, domed: true },
    spacing: 0.17,
  },
  {
    id: 'dahlia',
    name: 'Dahlia',
    seasons: ['summer', 'autumn'],
    height: [0.45, 0.65],
    colors: ['#c2185b', '#e65c4f', '#f2a541', '#7b1e3a', '#f5b7c5', '#fff1e0'],
    form: { kind: 'radial', petals: [12, 16], length: 0.055, width: 0.024, open: 1.5, layers: 5, center: '#d69a2c', centerSize: 0.012, domed: true, pointed: true },
    spacing: 0.24,
  },
  {
    id: 'cosmos',
    name: 'Cosmos',
    seasons: ['summer', 'autumn'],
    height: [0.5, 0.75],
    colors: ['#f08fb4', '#e05a93', '#ffffff', '#f6c2d6', '#c94a7a'],
    form: { kind: 'radial', petals: [8, 8], length: 0.06, width: 0.032, open: 1.45, layers: 1, center: '#f2c94c', centerSize: 0.014, notch: true },
    spacing: 0.2,
  },
  {
    id: 'rudbeckia',
    name: 'Black-eyed Susan',
    seasons: ['summer', 'autumn'],
    height: [0.4, 0.58],
    colors: ['#f2b51c', '#f5c542', '#e89a1a'],
    form: { kind: 'radial', petals: [12, 15], length: 0.055, width: 0.016, open: 1.95, layers: 1, center: '#3b2416', centerSize: 0.02, cone: 0.026 },
    spacing: 0.19,
  },
  {
    id: 'anemone',
    name: 'Anemone',
    seasons: ['autumn'],
    height: [0.45, 0.65],
    colors: ['#ffffff', '#f6d3e4', '#e8a6c8', '#fbeef3'],
    form: { kind: 'radial', petals: [5, 6], length: 0.048, width: 0.042, open: 0.9, layers: 1, center: '#9ab84a', centerSize: 0.012, stamens: '#f2c230' },
    spacing: 0.2,
  },
  {
    id: 'sedum',
    name: 'Sedum',
    seasons: ['autumn'],
    height: [0.24, 0.34],
    colors: ['#c75b6b', '#b8443f', '#e08a9a', '#a2463f'],
    form: { kind: 'cluster', florets: 60, radius: 0.075, floretSize: 0.012 },
    spacing: 0.22,
  },
  {
    id: 'salvia',
    name: 'Salvia',
    seasons: ['summer', 'autumn'],
    height: [0.38, 0.52],
    colors: ['#5b5bc4', '#7a62c9', '#4a4aa8', '#8f6fd6'],
    form: { kind: 'spike', florets: 16, spikeLength: 0.13, floretSize: 0.014, bell: false },
    spacing: 0.15,
  },
  {
    id: 'pansy',
    name: 'Pansy',
    seasons: ['autumn', 'winter', 'spring'],
    height: [0.16, 0.24],
    colors: ['#6b4aa8', '#f2c94c', '#ffffff', '#9a5bc4', '#e78a3c', '#3f3a8c'],
    form: { kind: 'radial', petals: [5, 5], length: 0.044, width: 0.046, open: 1.2, layers: 1, center: '#f6d24a', centerSize: 0.007, tilt: 0.95, blotch: 0.7 },
    spacing: 0.15,
  },
  {
    id: 'tulip',
    name: 'Tulip',
    seasons: ['spring'],
    height: [0.34, 0.46],
    colors: ['#e2403f', '#f39bb0', '#f6d04d', '#ffffff', '#8b4aa6', '#f07f3c'],
    form: { kind: 'cup', petals: 6, length: 0.07, width: 0.045, open: 0.42 },
    spacing: 0.17,
  },
  {
    id: 'daisy',
    name: 'Daisy',
    seasons: ['spring', 'summer'],
    height: [0.22, 0.34],
    colors: ['#ffffff', '#fdf6ea', '#fff4f6'],
    form: { kind: 'radial', petals: [16, 22], length: 0.045, width: 0.011, open: 1.45, layers: 1, center: '#f2c230', centerSize: 0.016 },
    spacing: 0.14,
  },
  {
    id: 'poppy',
    name: 'Poppy',
    seasons: ['summer'],
    height: [0.4, 0.6],
    colors: ['#e2352f', '#f06a2e', '#ffffff', '#f3a0a8'],
    form: { kind: 'radial', petals: [4, 4], length: 0.06, width: 0.06, open: 0.95, layers: 1, center: '#2b2228', centerSize: 0.016, blotch: 0.35 },
    spacing: 0.2,
  },
  {
    id: 'lavender',
    name: 'Lavender',
    seasons: ['summer'],
    height: [0.38, 0.55],
    colors: ['#8c74c9', '#9b86d6', '#7a63b8'],
    form: { kind: 'spike', florets: 22, spikeLength: 0.14, floretSize: 0.011, bell: false },
    spacing: 0.15,
  },
  {
    id: 'foxglove',
    name: 'Foxglove',
    seasons: ['summer'],
    height: [0.6, 0.85],
    colors: ['#d77fb6', '#b86bc0', '#f3c9e0', '#ffffff'],
    form: { kind: 'spike', florets: 12, spikeLength: 0.26, floretSize: 0.026, bell: true },
    spacing: 0.22,
  },
  // --- Spring ---
  {
    id: 'daffodil',
    name: 'Daffodil',
    seasons: ['spring'],
    height: [0.3, 0.42],
    colors: ['#f6d64a', '#fbe98a', '#ffffff', '#f8e070'],
    form: { kind: 'radial', petals: [6, 6], length: 0.042, width: 0.026, open: 1.35, layers: 1, center: '#e8a02a', centerSize: 0.01, pointed: true, tilt: 0.7, corona: { color: '#f2a630', length: 0.55 } },
    spacing: 0.16,
  },
  {
    id: 'crocus',
    name: 'Crocus',
    seasons: ['winter', 'spring'],
    height: [0.1, 0.15],
    colors: ['#9b7fd6', '#c9b4ee', '#ffffff', '#f2c94c', '#7d5cc4'],
    form: { kind: 'cup', petals: 6, length: 0.045, width: 0.022, open: 0.5 },
    spacing: 0.1,
  },
  {
    id: 'hyacinth',
    name: 'Hyacinth',
    seasons: ['spring'],
    height: [0.22, 0.3],
    colors: ['#6a72d6', '#f2a6c8', '#ffffff', '#b48ae0', '#f6c6d6'],
    form: { kind: 'spike', florets: 26, spikeLength: 0.09, floretSize: 0.016, bell: true },
    spacing: 0.14,
  },
  {
    id: 'bluebell',
    name: 'Bluebell',
    seasons: ['spring'],
    height: [0.22, 0.32],
    colors: ['#6a7ae0', '#7f8ff0', '#9aa6ea'],
    form: { kind: 'spike', florets: 8, spikeLength: 0.1, floretSize: 0.014, bell: true },
    spacing: 0.1,
  },
  {
    id: 'snowdrop',
    name: 'Snowdrop',
    seasons: ['winter', 'spring'],
    height: [0.1, 0.15],
    colors: ['#ffffff', '#f6f8f4'],
    form: { kind: 'spike', florets: 2, spikeLength: 0.015, floretSize: 0.02, bell: true },
    spacing: 0.08,
  },
  {
    id: 'primrose',
    name: 'Primrose',
    seasons: ['winter', 'spring'],
    height: [0.1, 0.15],
    colors: ['#f8ea8a', '#f6d64a', '#f2a6c8', '#c97ad6', '#ffffff'],
    form: { kind: 'radial', petals: [5, 5], length: 0.026, width: 0.026, open: 1.35, layers: 1, center: '#f2b51c', centerSize: 0.008, notch: true },
    spacing: 0.1,
  },
  {
    id: 'forgetmenot',
    name: 'Forget-me-not',
    seasons: ['spring'],
    height: [0.16, 0.24],
    colors: ['#7fb2f0', '#9ac2f4', '#f2b8d0'],
    form: { kind: 'cluster', florets: 34, radius: 0.06, floretSize: 0.009, shape: 'dome' },
    spacing: 0.12,
  },
  {
    id: 'lilyofthevalley',
    name: 'Lily of the valley',
    seasons: ['spring'],
    height: [0.14, 0.2],
    colors: ['#ffffff', '#fbf8ee'],
    form: { kind: 'spike', florets: 7, spikeLength: 0.07, floretSize: 0.012, bell: true },
    spacing: 0.1,
  },
  {
    id: 'iris',
    name: 'Iris',
    seasons: ['spring', 'summer'],
    height: [0.5, 0.7],
    colors: ['#5b4ab8', '#7a62c9', '#f2d04a', '#ffffff', '#8f3a8a', '#4a6ad0'],
    form: { kind: 'radial', petals: [6, 6], length: 0.055, width: 0.03, open: 1.25, layers: 2, center: '#f2c230', centerSize: 0.008, blotch: 0.45 },
    spacing: 0.2,
  },
  {
    id: 'peony',
    name: 'Peony',
    seasons: ['spring', 'summer'],
    height: [0.45, 0.6],
    colors: ['#f2a6c0', '#e46f9a', '#fbe0e8', '#ffffff', '#c2185b'],
    form: { kind: 'radial', petals: [10, 13], length: 0.05, width: 0.038, open: 1.3, layers: 6, center: '#f2c94c', centerSize: 0.014, domed: true },
    spacing: 0.28,
  },
  {
    id: 'muscari',
    name: 'Grape hyacinth',
    seasons: ['spring'],
    height: [0.12, 0.18],
    colors: ['#4a4ab8', '#5a5ac9', '#7a7ad6'],
    form: { kind: 'spike', florets: 18, spikeLength: 0.045, floretSize: 0.009, bell: false },
    spacing: 0.08,
  },
  {
    id: 'ranunculus',
    name: 'Ranunculus',
    seasons: ['spring'],
    height: [0.28, 0.38],
    colors: ['#f28a7a', '#f6d04d', '#f2a6c0', '#ffffff', '#e2403f', '#f0a050'],
    form: { kind: 'radial', petals: [12, 15], length: 0.03, width: 0.026, open: 1.35, layers: 7, center: '#7aa04a', centerSize: 0.008, domed: true },
    spacing: 0.15,
  },
  {
    id: 'hellebore',
    name: 'Hellebore',
    seasons: ['winter', 'spring'],
    height: [0.24, 0.34],
    colors: ['#f4ecf0', '#d8a0b8', '#8a3a5a', '#e8e6c8', '#5a2a40'],
    form: { kind: 'radial', petals: [5, 5], length: 0.04, width: 0.036, open: 1.1, layers: 1, center: '#d8d080', centerSize: 0.012, tilt: 1.2, stamens: '#f2d04a' },
    spacing: 0.2,
  },
  {
    id: 'sweetpea',
    name: 'Sweet pea',
    seasons: ['spring', 'summer'],
    height: [0.4, 0.6],
    colors: ['#f2a6c8', '#c97ad6', '#ffffff', '#e46f86', '#9a8ae0', '#fbd0d8'],
    form: { kind: 'radial', petals: [4, 5], length: 0.035, width: 0.04, open: 1.0, layers: 1, center: '#f6e0ea', centerSize: 0.006, tilt: 1.0 },
    spacing: 0.15,
  },
  // --- Summer ---
  {
    id: 'sunflower',
    name: 'Sunflower',
    seasons: ['summer'],
    height: [0.8, 1.05],
    colors: ['#f6c21c', '#f2a31c', '#f6d64a', '#c2502a'],
    form: { kind: 'radial', petals: [18, 22], length: 0.05, width: 0.02, open: 1.55, layers: 2, center: '#4a2a14', centerSize: 0.04, pointed: true, tilt: 0.55 },
    spacing: 0.3,
  },
  {
    id: 'zinnia',
    name: 'Zinnia',
    seasons: ['summer', 'autumn'],
    height: [0.38, 0.52],
    colors: ['#e2403f', '#f06a8a', '#f2a541', '#f6d04d', '#c2185b', '#f5b7c5'],
    form: { kind: 'radial', petals: [12, 15], length: 0.04, width: 0.02, open: 1.5, layers: 4, center: '#d6a02c', centerSize: 0.012, domed: true },
    spacing: 0.18,
  },
  {
    id: 'marigold',
    name: 'Marigold',
    seasons: ['summer', 'autumn'],
    height: [0.22, 0.32],
    colors: ['#f2a31c', '#f6c21c', '#e06a1a', '#c84a1a'],
    form: { kind: 'radial', petals: [12, 16], length: 0.028, width: 0.018, open: 1.5, layers: 5, center: '#c9632c', centerSize: 0.008, domed: true, notch: true },
    spacing: 0.15,
  },
  {
    id: 'petunia',
    name: 'Petunia',
    seasons: ['summer'],
    height: [0.18, 0.26],
    colors: ['#c2185b', '#9a5bc4', '#ffffff', '#f2a6c8', '#6a4aa8', '#e2403f'],
    form: { kind: 'radial', petals: [5, 5], length: 0.035, width: 0.04, open: 1.05, layers: 1, center: '#f6e8a0', centerSize: 0.007, blotch: 0.3 },
    spacing: 0.15,
  },
  {
    id: 'snapdragon',
    name: 'Snapdragon',
    seasons: ['summer', 'autumn'],
    height: [0.42, 0.6],
    colors: ['#f2a6c8', '#e2403f', '#f6d04d', '#ffffff', '#f28a5a', '#c2185b'],
    form: { kind: 'spike', florets: 14, spikeLength: 0.15, floretSize: 0.02, bell: true },
    spacing: 0.16,
  },
  {
    id: 'delphinium',
    name: 'Delphinium',
    seasons: ['summer'],
    height: [0.8, 1.05],
    colors: ['#4a6ad0', '#6a8ae8', '#8a7ad6', '#ffffff', '#3a4ab0'],
    form: { kind: 'spike', florets: 22, spikeLength: 0.3, floretSize: 0.022, bell: false },
    spacing: 0.22,
  },
  {
    id: 'hollyhock',
    name: 'Hollyhock',
    seasons: ['summer'],
    height: [0.95, 1.2],
    colors: ['#f2a6c8', '#c2185b', '#ffffff', '#f6e08a', '#7b1e3a'],
    form: { kind: 'spike', florets: 12, spikeLength: 0.4, floretSize: 0.034, bell: true },
    spacing: 0.26,
  },
  {
    id: 'lupin',
    name: 'Lupin',
    seasons: ['spring', 'summer'],
    height: [0.6, 0.8],
    colors: ['#7a62c9', '#f2a6c8', '#f6d04d', '#ffffff', '#c2185b', '#4a6ad0'],
    form: { kind: 'spike', florets: 28, spikeLength: 0.22, floretSize: 0.017, bell: false },
    spacing: 0.22,
  },
  {
    id: 'echinacea',
    name: 'Coneflower',
    seasons: ['summer', 'autumn'],
    height: [0.55, 0.75],
    colors: ['#d66a9a', '#e08ab0', '#ffffff', '#f2a541'],
    form: { kind: 'radial', petals: [12, 15], length: 0.055, width: 0.016, open: 2.0, layers: 1, center: '#b8641c', centerSize: 0.02, cone: 0.03 },
    spacing: 0.2,
  },
  {
    id: 'shasta',
    name: 'Shasta daisy',
    seasons: ['summer'],
    height: [0.45, 0.62],
    colors: ['#ffffff', '#fdfaf0'],
    form: { kind: 'radial', petals: [20, 26], length: 0.06, width: 0.013, open: 1.5, layers: 1, center: '#f2c230', centerSize: 0.02 },
    spacing: 0.2,
  },
  {
    id: 'cornflower',
    name: 'Cornflower',
    seasons: ['summer'],
    height: [0.4, 0.6],
    colors: ['#4a6ad0', '#5f7fe0', '#f2a6c8', '#ffffff', '#3a2a5a'],
    form: { kind: 'radial', petals: [9, 11], length: 0.032, width: 0.016, open: 1.3, layers: 2, center: '#2a2a5a', centerSize: 0.01, notch: true },
    spacing: 0.14,
  },
  {
    id: 'geranium',
    name: 'Geranium',
    seasons: ['summer'],
    height: [0.25, 0.36],
    colors: ['#e2352f', '#f06a8a', '#ffffff', '#c2185b', '#f28a7a'],
    form: { kind: 'cluster', florets: 40, radius: 0.05, floretSize: 0.013, shape: 'dome' },
    spacing: 0.2,
  },
  {
    id: 'hydrangea',
    name: 'Hydrangea',
    seasons: ['summer', 'autumn'],
    height: [0.5, 0.7],
    colors: ['#8aa6f0', '#b48ae0', '#f2a6c8', '#ffffff', '#6a8ad8'],
    form: { kind: 'cluster', florets: 90, radius: 0.085, floretSize: 0.015, shape: 'dome' },
    spacing: 0.32,
  },
  {
    id: 'allium',
    name: 'Allium',
    seasons: ['spring', 'summer'],
    height: [0.65, 0.9],
    colors: ['#9a6ad6', '#b48ae0', '#ffffff', '#7a4ab8'],
    form: { kind: 'cluster', florets: 80, radius: 0.055, floretSize: 0.011, shape: 'globe' },
    spacing: 0.2,
  },
  {
    id: 'yarrow',
    name: 'Yarrow',
    seasons: ['summer', 'autumn'],
    height: [0.45, 0.62],
    colors: ['#f6e08a', '#f2a6c0', '#ffffff', '#e2403f', '#f2a541'],
    form: { kind: 'cluster', florets: 55, radius: 0.07, floretSize: 0.009, shape: 'flat' },
    spacing: 0.2,
  },
  {
    id: 'phlox',
    name: 'Phlox',
    seasons: ['summer'],
    height: [0.5, 0.7],
    colors: ['#f2a6c8', '#c97ad6', '#ffffff', '#e46f86', '#9a8ae0'],
    form: { kind: 'cluster', florets: 46, radius: 0.065, floretSize: 0.016, shape: 'dome' },
    spacing: 0.2,
  },
  {
    id: 'verbena',
    name: 'Verbena',
    seasons: ['summer', 'autumn'],
    height: [0.6, 0.9],
    colors: ['#8a5ac9', '#a07ad6', '#c97ad6'],
    form: { kind: 'cluster', florets: 26, radius: 0.04, floretSize: 0.009, shape: 'flat' },
    spacing: 0.16,
  },
  {
    id: 'lily',
    name: 'Lily',
    seasons: ['summer'],
    height: [0.7, 0.95],
    colors: ['#ffffff', '#f6a6c0', '#f28a3a', '#f6d04d', '#e2403f'],
    form: { kind: 'radial', petals: [6, 6], length: 0.07, width: 0.026, open: 1.6, layers: 1, center: '#7a9a3a', centerSize: 0.008, pointed: true, tilt: 0.45, stamens: '#a8502a' },
    spacing: 0.22,
  },
  {
    id: 'daylily',
    name: 'Daylily',
    seasons: ['summer'],
    height: [0.55, 0.75],
    colors: ['#f28a3a', '#f6c21c', '#c2402a', '#f2a6a0', '#e8a030'],
    form: { kind: 'radial', petals: [6, 6], length: 0.06, width: 0.03, open: 1.4, layers: 1, center: '#f6d04d', centerSize: 0.01, tilt: 0.5, blotch: 0.3 },
    spacing: 0.22,
  },
  {
    id: 'gladiolus',
    name: 'Gladiolus',
    seasons: ['summer'],
    height: [0.8, 1.05],
    colors: ['#f28a7a', '#e2403f', '#ffffff', '#f6d04d', '#c97ad6', '#f2a6c8'],
    form: { kind: 'spike', florets: 10, spikeLength: 0.3, floretSize: 0.032, bell: true },
    spacing: 0.18,
  },
  {
    id: 'calendula',
    name: 'Calendula',
    seasons: ['spring', 'summer', 'autumn'],
    height: [0.3, 0.42],
    colors: ['#f2a31c', '#f6c21c', '#f6d64a'],
    form: { kind: 'radial', petals: [16, 20], length: 0.035, width: 0.012, open: 1.5, layers: 2, center: '#a8501c', centerSize: 0.012 },
    spacing: 0.16,
  },
  {
    id: 'nasturtium',
    name: 'Nasturtium',
    seasons: ['summer', 'autumn'],
    height: [0.18, 0.26],
    colors: ['#f2731c', '#e2352f', '#f6c21c', '#f2a541'],
    form: { kind: 'radial', petals: [5, 5], length: 0.034, width: 0.036, open: 1.2, layers: 1, center: '#f6d04d', centerSize: 0.006, tilt: 0.8, blotch: 0.35 },
    spacing: 0.18,
  },
  {
    id: 'sweetwilliam',
    name: 'Sweet William',
    seasons: ['spring', 'summer'],
    height: [0.32, 0.45],
    colors: ['#c2185b', '#e46f86', '#ffffff', '#7b1e3a', '#f2a6c8'],
    form: { kind: 'cluster', florets: 30, radius: 0.05, floretSize: 0.016, shape: 'flat' },
    spacing: 0.16,
  },
  {
    id: 'gaillardia',
    name: 'Blanket flower',
    seasons: ['summer', 'autumn'],
    height: [0.35, 0.5],
    colors: ['#e2552f', '#f2a31c', '#c2402a'],
    form: { kind: 'radial', petals: [12, 14], length: 0.042, width: 0.022, open: 1.5, layers: 1, center: '#7a2a1a', centerSize: 0.014, notch: true, blotch: 0.55 },
    spacing: 0.18,
  },
  // --- Autumn and winter ---
  {
    id: 'helenium',
    name: 'Sneezeweed',
    seasons: ['autumn'],
    height: [0.55, 0.75],
    colors: ['#e06a1a', '#f2a31c', '#c2402a', '#e8a030'],
    form: { kind: 'radial', petals: [12, 14], length: 0.035, width: 0.018, open: 1.95, layers: 1, center: '#5a3a1c', centerSize: 0.016, cone: 0.022, notch: true },
    spacing: 0.18,
  },
  {
    id: 'goldenrod',
    name: 'Goldenrod',
    seasons: ['summer', 'autumn'],
    height: [0.6, 0.85],
    colors: ['#f2c21c', '#f6d64a', '#e8b01c'],
    form: { kind: 'spike', florets: 34, spikeLength: 0.2, floretSize: 0.009, bell: false },
    spacing: 0.2,
  },
  {
    id: 'cyclamen',
    name: 'Cyclamen',
    seasons: ['autumn', 'winter'],
    height: [0.12, 0.18],
    colors: ['#e46f9a', '#ffffff', '#c2185b', '#f2a6c8'],
    form: { kind: 'cup', petals: 5, length: 0.04, width: 0.018, open: -0.35 },
    spacing: 0.12,
  },
  {
    id: 'heather',
    name: 'Heather',
    seasons: ['autumn', 'winter'],
    height: [0.18, 0.28],
    colors: ['#c97ad6', '#e08ab0', '#ffffff', '#a05ab8'],
    form: { kind: 'spike', florets: 30, spikeLength: 0.1, floretSize: 0.007, bell: true },
    spacing: 0.14,
  },
  {
    id: 'aconite',
    name: 'Winter aconite',
    seasons: ['winter'],
    height: [0.08, 0.12],
    colors: ['#f6d64a', '#f2c21c'],
    form: { kind: 'cup', petals: 6, length: 0.024, width: 0.02, open: 0.8 },
    spacing: 0.08,
  },
  // --- Roses (late spring to autumn) ---
  {
    id: 'rose-tea',
    name: 'Hybrid tea rose',
    seasons: ['spring', 'summer', 'autumn'],
    height: [0.6, 0.8],
    colors: ROSE_COLOURS,
    form: { kind: 'rose', type: 'tea', size: 0.03 },
    spacing: 0.26,
  },
  {
    id: 'rose-floribunda',
    name: 'Floribunda rose',
    seasons: ['spring', 'summer', 'autumn'],
    height: [0.45, 0.6],
    colors: ROSE_COLOURS,
    form: { kind: 'rose', type: 'floribunda', size: 0.021 },
    spacing: 0.26,
  },
  {
    id: 'rose-cabbage',
    name: 'English rose',
    seasons: ['spring', 'summer', 'autumn'],
    height: [0.55, 0.72],
    colors: ['#f2a6c0', '#f6c6cc', '#e8407a', '#f6ecd0', '#fbf8f2', '#f6b48a', '#f2a05a', '#c8102e', '#6e0f22', '#b48aa8', '#f6ecd0|#f2a6c0', '#f6b48a|#f6ecd0'],
    form: { kind: 'rose', type: 'cabbage', size: 0.034 },
    spacing: 0.3,
  },
  {
    id: 'rose-climber',
    name: 'Climbing rose',
    seasons: ['spring', 'summer', 'autumn'],
    height: [0.9, 1.2],
    colors: ROSE_COLOURS,
    form: { kind: 'rose', type: 'climber', size: 0.024 },
    spacing: 0.34,
  },
  {
    id: 'rose-wild',
    name: 'Wild rose',
    seasons: ['spring', 'summer'],
    height: [0.5, 0.7],
    colors: ['#f6c6cc', '#f2a6c0', '#fbf8f2', '#e8407a', '#fbf8f2|#f2a6c0'],
    form: { kind: 'rose', type: 'wild', size: 0.024 },
    spacing: 0.3,
  },
  {
    id: 'rose-mini',
    name: 'Patio rose',
    seasons: ['spring', 'summer', 'autumn'],
    height: [0.24, 0.34],
    colors: ROSE_COLOURS,
    form: { kind: 'rose', type: 'mini', size: 0.016 },
    spacing: 0.17,
  },
  // --- Water flowers (planted by painting across a pond) ---
  {
    id: 'lotus',
    name: 'Lotus',
    seasons: ['summer'],
    height: [0.5, 0.7],
    colors: ['#f2a6c0', '#fbf8f2', '#fbf8f2|#e8608a', '#f6c6cc'],
    form: { kind: 'aquatic', type: 'lotus', size: 0.05 },
    spacing: 0.45,
    zone: 'deep',
  },
  {
    id: 'waterlily',
    name: 'Water lily',
    seasons: ['summer'],
    height: [0.02, 0.03],
    colors: ['#fbf8f2', '#f2a6c0', '#e8406a', '#f6d23a', '#f6b48a', '#fbf8f2|#f2a6c0'],
    form: { kind: 'aquatic', type: 'lily', size: 0.036 },
    spacing: 0.4,
    zone: 'deep',
  },
  {
    id: 'waterhyacinth',
    name: 'Water hyacinth',
    seasons: ['summer', 'autumn'],
    height: [0.14, 0.2],
    colors: ['#c8b4ec', '#b8a2e6', '#d6c8f2'],
    form: { kind: 'aquatic', type: 'hyacinth', size: 0.014 },
    spacing: 0.3,
    zone: 'deep',
  },
  {
    id: 'waterflag',
    name: 'Water iris',
    seasons: ['spring', 'summer'],
    height: [0.55, 0.75],
    colors: ['#f2d23a', '#6a5ac8', '#4a6ad0', '#8a6ad6'],
    form: { kind: 'aquatic', type: 'flag', size: 0.05 },
    spacing: 0.24,
    zone: 'shallow',
  },
  {
    id: 'marshmarigold',
    name: 'Marsh marigold',
    seasons: ['spring'],
    height: [0.16, 0.26],
    colors: ['#f6c21c', '#f6d23a'],
    form: { kind: 'aquatic', type: 'marigold', size: 0.024 },
    spacing: 0.22,
    zone: 'shallow',
  },
  {
    id: 'pickerelweed',
    name: 'Pickerelweed',
    seasons: ['summer', 'autumn'],
    height: [0.4, 0.55],
    colors: ['#7a7ae0', '#8a8ae8', '#9a8ad6'],
    form: { kind: 'aquatic', type: 'pickerel', size: 0.016 },
    spacing: 0.24,
    zone: 'shallow',
  },
  {
    id: 'arrowhead',
    name: 'Arrowhead',
    seasons: ['summer'],
    height: [0.35, 0.5],
    colors: ['#fbf8f2', '#f6f2ea'],
    form: { kind: 'aquatic', type: 'arrowhead', size: 0.018 },
    spacing: 0.24,
    zone: 'shallow',
  },
  {
    id: 'waterforgetmenot',
    name: 'Water forget-me-not',
    seasons: ['spring', 'summer'],
    height: [0.12, 0.2],
    colors: ['#8ab8f2', '#a6c8f4', '#7aa8ea'],
    form: { kind: 'cluster', florets: 30, radius: 0.06, floretSize: 0.008, shape: 'dome' },
    spacing: 0.14,
    zone: 'bank',
  },
  // --- New silhouettes (2.14) ---
  {
    id: 'bleeding-heart',
    name: 'Bleeding heart',
    seasons: ['spring'],
    height: [0.45, 0.65],
    colors: ['#e8608a|#fbe9ef', '#f2f0ea|#f9d9e4'],
    form: { kind: 'arch', florets: 7, floretSize: 0.016, shape: 'heart' },
    spacing: 0.4,
  },
  {
    id: 'solomons-seal',
    name: "Solomon's seal",
    seasons: ['spring', 'summer'],
    height: [0.55, 0.8],
    colors: ['#f4f6e8|#cfe0a8'],
    form: { kind: 'arch', florets: 8, floretSize: 0.012, shape: 'bell' },
    spacing: 0.4,
  },
  {
    id: 'fuchsia',
    name: 'Fuchsia',
    seasons: ['summer', 'autumn'],
    height: [0.45, 0.65],
    colors: ['#d81b60|#6a2c91', '#e91e63|#f8f0f8', '#c2185b|#c2185b'],
    form: { kind: 'arch', florets: 6, floretSize: 0.017, shape: 'bell' },
    spacing: 0.4,
  },
  {
    id: 'babys-breath',
    name: "Baby's breath",
    seasons: ['summer'],
    height: [0.5, 0.7],
    colors: ['#fbfaf5', '#f6dfe8'],
    form: { kind: 'cloud', florets: 70, spread: 0.2, floretSize: 0.006 },
    spacing: 0.42,
  },
  {
    id: 'ladys-mantle',
    name: "Lady's mantle",
    seasons: ['summer'],
    height: [0.3, 0.42],
    colors: ['#d6e05a', '#c8d84e'],
    form: { kind: 'cloud', florets: 50, spread: 0.16, floretSize: 0.007 },
    spacing: 0.36,
  },
  {
    id: 'scabious',
    name: 'Scabious',
    seasons: ['summer', 'autumn'],
    height: [0.5, 0.7],
    colors: ['#a7a4e0', '#d7a6d9', '#5a2a5e', '#f3f0fa'],
    form: { kind: 'pincushion', size: 0.026, spiky: false },
    spacing: 0.32,
  },
  {
    id: 'globe-thistle',
    name: 'Globe thistle',
    seasons: ['summer'],
    height: [0.8, 1.1],
    colors: ['#6f8fd0', '#8aa2dc'],
    form: { kind: 'pincushion', size: 0.032, spiky: true },
    spacing: 0.45,
  },
  {
    id: 'red-hot-poker',
    name: 'Red hot poker',
    seasons: ['summer', 'autumn'],
    height: [0.8, 1.1],
    colors: ['#f4d03f|#e8452a', '#f6e27a|#f39c12'],
    form: { kind: 'torch', length: 0.13, radius: 0.026 },
    spacing: 0.42,
  },
  // Foliage to pick and plant like flowers.
  {
    id: 'grass',
    name: 'Ornamental grass',
    seasons: ['spring', 'summer', 'autumn', 'winter'],
    height: [0.5, 0.7],
    colors: ['#8a9a52', '#6f8f74', '#a07a4a'],
    form: { kind: 'foliage', leaf: 'grass' },
    spacing: 0.5,
  },
  {
    id: 'fern',
    name: 'Fern',
    seasons: ['spring', 'summer', 'autumn'],
    height: [0.35, 0.45],
    colors: ['#5f9a3e', '#6aa548'],
    form: { kind: 'foliage', leaf: 'fern' },
    spacing: 0.45,
  },
  {
    id: 'hosta',
    name: 'Hosta',
    seasons: ['spring', 'summer', 'autumn'],
    height: [0.25, 0.32],
    colors: ['#5a8a5a', '#4f7f6e', '#8fb45e'],
    form: { kind: 'foliage', leaf: 'hosta' },
    spacing: 0.5,
  },
  {
    id: 'heuchera',
    name: 'Heuchera',
    seasons: ['spring', 'summer', 'autumn', 'winter'],
    height: [0.2, 0.28],
    colors: ['#6a2a4a', '#b5652e', '#8a3a5a', '#c9a23a'],
    form: { kind: 'foliage', leaf: 'hosta' },
    spacing: 0.4,
  },
  {
    id: 'lambs-ear',
    name: "Lamb's ear",
    seasons: ['spring', 'summer', 'autumn', 'winter'],
    height: [0.1, 0.15],
    colors: ['#b9c2b3', '#c4cabe'],
    form: { kind: 'foliage', leaf: 'silver' },
    spacing: 0.35,
  },
  {
    id: 'box-ball',
    name: 'Box ball',
    seasons: ['spring', 'summer', 'autumn', 'winter'],
    height: [0.3, 0.38],
    colors: ['#3f6a32', '#4a7638'],
    form: { kind: 'foliage', leaf: 'box' },
    spacing: 0.45,
  },
];

/** "Seasonal mix": the species in bloom now, mixed together. */
export const MIX_ID = 'mix';
/** "Water mix": water flowers suited to each spot of a pond. */
export const WATER_MIX_ID = 'water-mix';

/**
 * How each flower looks close up (its botany, beyond its garden shape): the middle of daisy-like
 * flowers, the form of each floret, leaf shapes and arrangement, how ruffled and veined the
 * petals are, stamens, speckles, hairiness.
 */
const HERO: Record<string, HeroHints> = {
  aster: { disc: 'florets', discColors: ['#f2c94c', '#c9902c'], ruffle: 0.05, veins: 3, leaf: 'lance', leaves: 7 },
  chrysanthemum: { ruffle: 0.15, veins: 4, leaf: 'toothed', leaves: 5, green: '#4a7a3a' },
  dahlia: { ruffle: 0.1, veins: 6, leaf: 'pinnate', leaves: 3, opposite: true, green: '#3f6f34' },
  cosmos: { disc: 'florets', discColors: ['#f6c93c', '#d89a20'], ruffle: 0.12, veins: 9, leaf: 'feathery', leaves: 5 },
  rudbeckia: { disc: 'cone', discColors: ['#4a2a14', '#24140a'], ruffle: 0.08, veins: 7, leaf: 'lance', leaves: 4, hairy: true, green: '#4a7a32' },
  anemone: { disc: 'boss', stamens: { color: '#f2c230', count: 60, length: 0.32 }, ruffle: 0.2, veins: 10, leaf: 'toothed', leaves: 2, basal: true },
  sedum: { floret: 'star', floretPetals: 5, leaf: 'oval', leaves: 8, opposite: true, green: '#6a9a74' },
  salvia: { floret: 'lipped', leaf: 'oval', leaves: 4, opposite: true, green: '#4a7a42', hairy: true },
  pansy: { disc: 'eye', ruffle: 0.07, veins: 14, leaf: 'oval', leaves: 2, basal: true },
  tulip: { ruffle: 0.06, veins: 5, leaf: 'strap', leaves: 0, basal: true, green: '#6a8a6a' },
  daisy: { disc: 'florets', discColors: ['#f2c230', '#c88a1c'], ruffle: 0.04, veins: 2, leaf: 'oval', leaves: 0, basal: true },
  poppy: { disc: 'eye', stamens: { color: '#2b2228', count: 70, length: 0.24 }, ruffle: 0.9, veins: 16, leaf: 'pinnate', leaves: 3, hairy: true, green: '#5a7a4a' },
  lavender: { floret: 'tube', leaf: 'needle', leaves: 12, opposite: true, green: '#7f9a86' },
  foxglove: { floret: 'bell', speckles: '#5a1a3a', leaf: 'oval', leaves: 4, basal: true, hairy: true },
  daffodil: { ruffle: 0.1, veins: 6, leaf: 'strap', leaves: 0, basal: true, green: '#5f8a5f' },
  crocus: { ruffle: 0.04, veins: 7, leaf: 'strap', leaves: 0, basal: true, stamens: { color: '#f2a020', count: 3, length: 0.55 } },
  hyacinth: { floret: 'funnel', floretPetals: 6, leaf: 'strap', leaves: 0, basal: true },
  bluebell: { floret: 'bell', leaf: 'strap', leaves: 0, basal: true },
  snowdrop: { floret: 'bell', leaf: 'strap', leaves: 0, basal: true, green: '#6a8a7a' },
  primrose: { disc: 'eye', ruffle: 0.15, veins: 8, leaf: 'oval', leaves: 0, basal: true },
  forgetmenot: { floret: 'star', floretPetals: 5, leaf: 'lance', leaves: 5, hairy: true },
  lilyofthevalley: { floret: 'bell', leaf: 'oval', leaves: 0, basal: true, green: '#3f7a3a' },
  iris: { iris: true, ruffle: 0.3, veins: 12, leaf: 'strap', leaves: 0, basal: true, green: '#5f7f6a' },
  peony: { ruffle: 0.45, veins: 10, leaf: 'pinnate', leaves: 4, green: '#3f6f34' },
  muscari: { floret: 'bell', leaf: 'strap', leaves: 0, basal: true },
  ranunculus: { ruffle: 0.08, veins: 4, leaf: 'toothed', leaves: 3 },
  hellebore: { disc: 'boss', stamens: { color: '#f2d04a', count: 50, length: 0.3 }, ruffle: 0.1, veins: 10, leaf: 'palmate', leaves: 1, basal: true, green: '#355f34' },
  sweetpea: { ruffle: 0.6, veins: 10, leaf: 'oval', leaves: 4, opposite: true },
  sunflower: { disc: 'florets', discColors: ['#6a3a14', '#2a1608'], ruffle: 0.15, veins: 9, leaf: 'heart', leaves: 6, hairy: true },
  zinnia: { ruffle: 0.08, veins: 5, leaf: 'oval', leaves: 4, opposite: true },
  marigold: { ruffle: 0.5, veins: 6, leaf: 'pinnate', leaves: 4, green: '#3f6a34' },
  petunia: { disc: 'eye', ruffle: 0.35, veins: 14, leaf: 'oval', leaves: 5, hairy: true },
  snapdragon: { floret: 'snap', leaf: 'lance', leaves: 6 },
  delphinium: { floret: 'spurred', floretPetals: 5, leaf: 'palmate', leaves: 4 },
  hollyhock: { floret: 'saucer', floretPetals: 5, leaf: 'round', leaves: 5, hairy: true },
  lupin: { floret: 'pea', leaf: 'palmate', leaves: 4, basal: true },
  echinacea: { disc: 'spiky', discColors: ['#e07a1c', '#8a3a14'], ruffle: 0.05, veins: 7, leaf: 'lance', leaves: 4, hairy: true },
  shasta: { disc: 'florets', discColors: ['#f2c230', '#c88a1c'], ruffle: 0.06, veins: 4, leaf: 'toothed', leaves: 4 },
  cornflower: { disc: 'florets', discColors: ['#3a3a7a', '#24245a'], ruffle: 0.7, veins: 6, leaf: 'needle', leaves: 6, green: '#6f8f7f' },
  geranium: { floret: 'star', floretPetals: 5, leaf: 'round', leaves: 4 },
  hydrangea: { floret: 'cross', leaf: 'toothed', leaves: 4, opposite: true },
  allium: { floret: 'star', floretPetals: 6, leaf: 'strap', leaves: 0, basal: true, green: '#5f8a6a' },
  yarrow: { floret: 'star', floretPetals: 5, leaf: 'feathery', leaves: 6 },
  phlox: { floret: 'star', floretPetals: 5, leaf: 'lance', leaves: 5, opposite: true },
  verbena: { floret: 'star', floretPetals: 5, leaf: 'toothed', leaves: 3, opposite: true },
  lily: { ruffle: 0.25, veins: 6, leaf: 'lance', leaves: 10 },
  daylily: { ruffle: 0.3, veins: 8, stamens: { color: '#d8a020', count: 6, length: 0.6 }, leaf: 'strap', leaves: 0, basal: true },
  gladiolus: { floret: 'funnel', floretPetals: 6, leaf: 'strap', leaves: 0, basal: true, green: '#5a7f5a' },
  calendula: { disc: 'florets', discColors: ['#a8501c', '#6a3014'], ruffle: 0.06, veins: 5, leaf: 'oval', leaves: 4, hairy: true },
  nasturtium: { disc: 'eye', ruffle: 0.3, veins: 8, leaf: 'round', leaves: 4, green: '#5a8a4a' },
  sweetwilliam: { floret: 'star', floretPetals: 5, leaf: 'lance', leaves: 4, opposite: true },
  gaillardia: { disc: 'florets', discColors: ['#7a2a1a', '#4a1a10'], ruffle: 0.1, veins: 6, leaf: 'lance', leaves: 4, hairy: true },
  helenium: { disc: 'cone', discColors: ['#5a3a1c', '#3a2410'], ruffle: 0.06, veins: 6, leaf: 'lance', leaves: 5 },
  goldenrod: { floret: 'star', floretPetals: 5, leaf: 'lance', leaves: 8 },
  cyclamen: { ruffle: 0.1, veins: 5, leaf: 'heart', leaves: 0, basal: true, green: '#4a6a4a' },
  heather: { floret: 'bell', leaf: 'needle', leaves: 12, green: '#4a6a3a' },
  aconite: { ruffle: 0.06, veins: 5, stamens: { color: '#f2c030', count: 20, length: 0.35 }, leaf: 'palmate', leaves: 1 },
  'rose-tea': { ruffle: 0.22, veins: 6 },
  'rose-floribunda': { ruffle: 0.22, veins: 6 },
  'rose-cabbage': { ruffle: 0.28, veins: 6 },
  'rose-climber': { ruffle: 0.2, veins: 6 },
  'rose-wild': { ruffle: 0.15, veins: 8 },
  'rose-mini': { ruffle: 0.2, veins: 5 },
  'bleeding-heart': { leaf: 'pinnate' },
  'solomons-seal': { floret: 'bell' },
  fuchsia: { floret: 'funnel' },
  'babys-breath': { floret: 'star', floretPetals: 5 },
  'ladys-mantle': { floret: 'cross' },
  scabious: { ruffle: 0.5, veins: 8 },
};
for (const sp of SPECIES) sp.hero = HERO[sp.id];
