import type { Season } from './season';

/**
 * The flower collection. Flowers only: no vegetables or utility plants. Each species is a
 * recipe for a procedural flower; every planted flower varies within it.
 */
export type FlowerForm =
  | { kind: 'radial'; petals: [number, number]; length: number; width: number; open: number; layers: number; center: string; centerSize: number }
  | { kind: 'cup'; petals: number; length: number; width: number; open: number }
  | { kind: 'spike'; florets: number; spikeLength: number; floretSize: number; bell: boolean };

export interface FlowerSpecies {
  id: string;
  name: string;
  /** Seasons when it is in full bloom (northern-hemisphere names; the game flips them south). */
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
    form: { kind: 'radial', petals: [18, 24], length: 0.055, width: 0.011, open: 1.35, layers: 1, center: '#f2c94c', centerSize: 0.018 },
    spacing: 0.16,
  },
  {
    id: 'chrysanthemum',
    name: 'Chrysanthemum',
    seasons: ['autumn'],
    height: [0.3, 0.45],
    colors: ['#e0892f', '#c9632c', '#f0b73d', '#a83d3a', '#e6a05a', '#f2d36b'],
    form: { kind: 'radial', petals: [14, 18], length: 0.045, width: 0.014, open: 1.2, layers: 3, center: '#c9932c', centerSize: 0.012 },
    spacing: 0.18,
  },
  {
    id: 'cosmos',
    name: 'Cosmos',
    seasons: ['summer', 'autumn'],
    height: [0.45, 0.68],
    colors: ['#f08fb4', '#e05a93', '#ffffff', '#f6c2d6', '#c94a7a'],
    form: { kind: 'radial', petals: [8, 8], length: 0.06, width: 0.03, open: 1.3, layers: 1, center: '#f2c94c', centerSize: 0.016 },
    spacing: 0.2,
  },
  {
    id: 'pansy',
    name: 'Pansy',
    seasons: ['autumn', 'winter', 'spring'],
    height: [0.16, 0.24],
    colors: ['#6b4aa8', '#f2c94c', '#ffffff', '#9a5bc4', '#e78a3c', '#3f3a8c'],
    form: { kind: 'radial', petals: [5, 5], length: 0.042, width: 0.04, open: 1.1, layers: 1, center: '#f6d24a', centerSize: 0.008 },
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
    form: { kind: 'radial', petals: [4, 4], length: 0.06, width: 0.06, open: 0.95, layers: 1, center: '#2b2228', centerSize: 0.016 },
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
