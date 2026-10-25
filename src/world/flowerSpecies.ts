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
}

export type FlowerForm =
  | RadialForm
  | { kind: 'cup'; petals: number; length: number; width: number; open: number }
  | { kind: 'spike'; florets: number; spikeLength: number; floretSize: number; bell: boolean }
  | { kind: 'cluster'; florets: number; radius: number; floretSize: number };

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
];

/** "Seasonal mix": the species in bloom now, mixed together. */
export const MIX_ID = 'mix';
