/**
 * The saved garden: not every stone and petal, just what the player did, in order. Each stroke
 * is its tool, its settings and the (centimetre-rounded) points the finger passed through. All
 * the hand-made variation comes from seeded randomness, so replaying the strokes in the same
 * order rebuilds the very same garden, and a save stays tiny.
 *
 * Format (version 1), as JSON:
 *   { v: 1, a: [ [kind, ...settings, points] ] }
 *   kind: 'p' path (style, unless gravel) · 'n' fence (style) · 'r' rocks · 'c' cottage look (style code, no points) · 'b' bridge · 'd' decor (prop) · 'f' flowers (species id) · 'o' pond · 'e' erase (radius in cm)
 *   points: "x,z,dx,dz,dx,dz…" in centimetres, each after the first relative to the one before.
 */

export const SAVE_VERSION = 1;
const KEY = 'garden-save';

export type Action =
  | { kind: 'path'; style?: string; points: number[] }
  | { kind: 'fence'; style: string; points: number[] }
  | { kind: 'rocks'; points: number[] }
  | { kind: 'cottage'; style: string; points: number[] }
  | { kind: 'bridge'; points: number[] }
  | { kind: 'prop'; item: string; points: number[] }
  | { kind: 'flowers'; species: string; points: number[] }
  | { kind: 'pond'; points: number[] }
  | { kind: 'erase'; radius: number; points: number[] };

/** Points are flat [x0, z0, x1, z1, …] in metres, already rounded to the centimetre. */
export function roundCm(v: number): number {
  return Math.round(v * 100) / 100;
}

function encodePoints(points: number[]): string {
  const out: number[] = [];
  let px = 0;
  let pz = 0;
  for (let i = 0; i < points.length; i += 2) {
    const x = Math.round(points[i] * 100);
    const z = Math.round(points[i + 1] * 100);
    out.push(x - px, z - pz);
    px = x;
    pz = z;
  }
  return out.join(',');
}

function decodePoints(s: string): number[] {
  const out: number[] = [];
  let x = 0;
  let z = 0;
  const parts = s.split(',').map(Number);
  for (let i = 0; i + 1 < parts.length; i += 2) {
    x += parts[i];
    z += parts[i + 1];
    out.push(x / 100, z / 100);
  }
  return out;
}

export function encode(actions: Action[]): string {
  const a = actions.map((act) => {
    const pts = encodePoints(act.points);
    switch (act.kind) {
      case 'path':
        // The style rides along only when it isn't the original gravel (old saves have none).
        return act.style && act.style !== 'gravel' ? ['p', act.style, pts] : ['p', pts];
      case 'fence':
        return ['n', act.style, pts];
      case 'rocks':
        return ['r', pts];
      case 'cottage':
        return ['c', act.style, ''];
      case 'bridge':
        return ['b', pts];
      case 'prop':
        return ['d', act.item, pts];
      case 'flowers':
        return ['f', act.species, pts];
      case 'pond':
        return ['o', pts];
      case 'erase':
        return ['e', Math.round(act.radius * 100), pts];
    }
  });
  return JSON.stringify({ v: SAVE_VERSION, a });
}

export function decode(json: string): Action[] {
  const data = JSON.parse(json) as { v: number; a: (string | number)[][] };
  if (data.v !== SAVE_VERSION || !Array.isArray(data.a)) return [];
  const out: Action[] = [];
  for (const row of data.a) {
    if (row[0] === 'c') {
      out.push({ kind: 'cottage', style: String(row[1]), points: [] });
      continue;
    }
    const pts = decodePoints(String(row[row.length - 1]));
    if (pts.length < 2) continue;
    if (row[0] === 'p') out.push(row.length > 2 ? { kind: 'path', style: String(row[1]), points: pts } : { kind: 'path', points: pts });
    else if (row[0] === 'n') out.push({ kind: 'fence', style: String(row[1]), points: pts });
    else if (row[0] === 'r') out.push({ kind: 'rocks', points: pts });
    else if (row[0] === 'b') out.push({ kind: 'bridge', points: pts });
    else if (row[0] === 'd') out.push({ kind: 'prop', item: String(row[1]), points: pts });
    else if (row[0] === 'f') out.push({ kind: 'flowers', species: String(row[1]), points: pts });
    else if (row[0] === 'o') out.push({ kind: 'pond', points: pts });
    else if (row[0] === 'e') out.push({ kind: 'erase', radius: Number(row[1]) / 100, points: pts });
  }
  return out;
}

/** Remembers every stroke and writes the garden to local storage soon after each change. */
export class GardenStore {
  readonly actions: Action[] = [];
  private timer = 0;
  /** Showing someone else's garden (from a link): nothing is written over the player's own. */
  visiting = false;
  /** Goes up whenever the garden changes (so a share link knows when to be remade). */
  changes = 0;

  /** Show a shared garden instead of the saved one (until it's kept, nothing is saved). */
  visit(actions: Action[]) {
    clearTimeout(this.timer);
    this.visiting = true;
    this.actions.length = 0;
    this.actions.push(...actions);
  }

  load(): Action[] {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.actions.push(...decode(raw));
    } catch {
      // Private mode or a damaged save: start with a fresh garden rather than fail.
    }
    return this.actions;
  }

  add(action: Action) {
    this.actions.push(action);
    this.changes++;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.save(), 400);
  }

  save() {
    clearTimeout(this.timer);
    this.changes++;
    if (this.visiting) return;
    try {
      localStorage.setItem(KEY, encode(this.actions));
    } catch {
      // Storage full or unavailable: the garden still works, it just won't be remembered.
    }
  }

  clear() {
    clearTimeout(this.timer);
    this.actions.length = 0;
    if (this.visiting) return; // someone else's garden: the player's own stays saved
    try {
      localStorage.removeItem(KEY);
    } catch {
      // nothing to do
    }
  }
}
