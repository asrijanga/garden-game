// The cottage's looks as data (no 3D here: the page's cottage drawer uses it too).

/** How the cottage looks: an option index for each part, plus the upgrades it has. */
export interface CottageStyle {
  roof: number;
  walls: number;
  shutters: number;
  door: number;
  chimney: number;
  porch: boolean;
  bay: boolean;
  boxes: boolean;
  roses: boolean;
  wisteria: boolean;
  shed: boolean;
  chimes: boolean;
}

export const ROOFS = [
  { name: 'Terracotta', a: '#a65a41', b: '#8f4935' },
  { name: 'Slate', a: '#5f6872', b: '#4e565f' },
  { name: 'Thatch', a: '#b8955a', b: '#a6844c', thatch: true },
  { name: 'Mossy', a: '#71895a', b: '#5f774a' },
  { name: 'Blue-grey', a: '#687b8d', b: '#58697a' },
];
export const WALLS = [
  { name: 'Cream', c: '#f1e3c8' },
  { name: 'White', c: '#f7f3eb' },
  { name: 'Butter', c: '#f0dc9f' },
  { name: 'Blush', c: '#efd0c5' },
  { name: 'Sage', c: '#d3dcc3' },
  { name: 'Stone', c: '#bdb4a6', stone: true },
];
export const SHUTTERS = [
  { name: 'Teal', c: '#6e9896' },
  { name: 'Sage', c: '#8aa37a' },
  { name: 'Navy', c: '#4a5f80' },
  { name: 'Barn red', c: '#a64b3e' },
  { name: 'Butter', c: '#e0c26c' },
  { name: 'Lavender', c: '#9c90ba' },
];
export const DOORS = [
  { name: 'Oak', c: '#7c4f33' },
  { name: 'Red', c: '#a3403a' },
  { name: 'Green', c: '#4f7552' },
  { name: 'Blue', c: '#4a6f95' },
  { name: 'Yellow', c: '#d6b04a' },
];
export const CHIMNEYS = ['Stone', 'Brick', 'White with pot'];

export const DEFAULT_STYLE: CottageStyle = { roof: 0, walls: 0, shutters: 0, door: 0, chimney: 0, porch: false, bay: false, boxes: true, roses: false, wisteria: false, shed: false, chimes: false };

/** Compact text form for saving: five digits, then the upgrades' letters. */
export function encodeStyle(s: CottageStyle): string {
  const ups = (s.porch ? 'p' : '') + (s.bay ? 'b' : '') + (s.boxes ? 'f' : '') + (s.roses ? 'r' : '') + (s.wisteria ? 'v' : '') + (s.shed ? 's' : '') + (s.chimes ? 'w' : '');
  return `${s.roof}${s.walls}${s.shutters}${s.door}${s.chimney}:${ups}`;
}

export function decodeStyle(text: string): CottageStyle {
  const [d, ups = ''] = text.split(':');
  const n = (i: number, max: number) => Math.min(max - 1, Math.max(0, Number(d[i]) || 0));
  return {
    roof: n(0, ROOFS.length),
    walls: n(1, WALLS.length),
    shutters: n(2, SHUTTERS.length),
    door: n(3, DOORS.length),
    chimney: n(4, CHIMNEYS.length),
    porch: ups.includes('p'),
    bay: ups.includes('b'),
    boxes: ups.includes('f'),
    roses: ups.includes('r'),
    wisteria: ups.includes('v'),
    shed: ups.includes('s'),
    chimes: ups.includes('w'),
  };
}
