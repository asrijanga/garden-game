import type { Season } from './season';

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
}

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
];

/** "Seasonal mix": the species in bloom now, mixed together. */
export const MIX_ID = 'mix';
