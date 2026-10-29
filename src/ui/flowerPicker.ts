import { BED_ICONS } from './bedPicker';
import { MIX_ID, WATER_MIX_ID, type FlowerSpecies } from '../world/flowerSpecies';

/** A small illustrated flower icon for a species chip (inline SVG, 40×40). */
export function icon(sp: FlowerSpecies | null, water = false): string {
  if (!sp && water) {
    // Water mix: a lily and a lotus over a ripple.
    return `<svg viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="20" cy="31" rx="15" ry="4" fill="#9cc8e8"/>
      <ellipse cx="11" cy="30" rx="6" ry="2.2" fill="#5f9a42"/><path d="M26 30V14" stroke="#5f8f3e" stroke-width="2"/>
      ${bloom(12, 26, '#fbf8f2', 8, 4, '#f2c230', 4)}${bloom(26, 13, '#f2a6c0', 7, 6, '#e8d060', 6)}</svg>`;
  }
  if (!sp) {
    // Seasonal mix: a little posy of three blooms.
    return `<svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M20 36V22M20 30l-7-8M20 30l7-9" stroke="#5f8f3e" stroke-width="2" stroke-linecap="round"/>
      ${bloom(12, 18, '#c78bc9', 6)}${bloom(28, 16, '#f0b73d', 6)}${bloom(20, 12, '#f08fb4', 7)}
    </svg>`;
  }
  const c = sp.colors[0].split('|')[0];
  const stem = `<path d="M20 38V20" stroke="#5f8f3e" stroke-width="2" stroke-linecap="round"/><path d="M20 31c-4 0-7-2-8-5 4 0 7 1.5 8 5z" fill="#6fa848"/>`;
  const f = sp.form;
  if (f.kind === 'cup') {
    return `<svg viewBox="0 0 40 40" aria-hidden="true">${stem}
      <path d="M20 22c-6 0-8-5-7-12 2 1.5 4 3 7 6 3-3 5-4.5 7-6 1 7-1 12-7 12z" fill="${c}" stroke="rgba(0,0,0,.25)" stroke-width="1"/></svg>`;
  }
  if (f.kind === 'spike') {
    const dots = Array.from({ length: 6 }, (_, i) => `<ellipse cx="${20 + (i % 2 ? 3 : -3)}" cy="${7 + i * 3.2}" rx="${f.bell ? 3.4 : 2.4}" ry="${f.bell ? 2.6 : 2}" fill="${c}"/>`).join('');
    return `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 38V8" stroke="#5f8f3e" stroke-width="2" stroke-linecap="round"/>${dots}</svg>`;
  }
  const svg = (inner: string) => `<svg viewBox="0 0 40 40" aria-hidden="true">${stem}${inner}</svg>`;
  if (f.kind === 'aquatic') {
    // Water flowers: a bloom over a little blue ripple.
    const water = `<ellipse cx="20" cy="33" rx="14" ry="3.5" fill="#9cc8e8"/><ellipse cx="13" cy="32" rx="6" ry="2.2" fill="#5f9a42"/>`;
    const stalk = f.type === 'lily' || f.type === 'hyacinth' ? '' : `<path d="M20 32V16" stroke="#5f8f3e" stroke-width="2" stroke-linecap="round"/>`;
    const cy = f.type === 'lily' ? 27 : f.type === 'hyacinth' ? 22 : 13;
    const flower =
      f.type === 'pickerel' || f.type === 'hyacinth'
        ? Array.from({ length: 6 }, (_, i) => `<ellipse cx="${20 + (i % 2 ? 2.6 : -2.6)}" cy="${cy - 6 + i * 2.6}" rx="2.6" ry="2" fill="${c}"/>`).join('')
        : f.type === 'lotus'
          ? `${bloom(20, cy, c, 8, 7, '#e8d060', 6)}<rect x="17" y="${cy - 2}" width="6" height="3" rx="1" fill="#c8c050"/>`
          : bloom(20, cy, c, f.type === 'arrowhead' ? 3 : f.type === 'flag' ? 6 : f.type === 'marigold' ? 5 : 9, 6, f.type === 'flag' ? '#f2c230' : '#f2c230', 6);
    return `<svg viewBox="0 0 40 40" aria-hidden="true">${water}${stalk}${flower}</svg>`;
  }
  if (f.kind === 'rose') {
    // A rose: a spiral of petals in a cup (a simple five-petalled one for the wild rose).
    const edge = sp.colors[0].split('|');
    const base = edge[0];
    const tip = edge[1] ?? base;
    if (f.type === 'wild') return svg(`${bloom(20, 15, base, 5, 8, '#f2c230', 6)}<circle cx="20" cy="15" r="2.6" fill="#f2c230"/>`);
    const leaf = `<path d="M20 31c-5 0-8-3-8-6 4 0 7 2 8 6zM20 27c4 0 7-2 7-5-3 0-6 1-7 5z" fill="#3f6f32"/>`;
    return `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 38V20" stroke="#4a6a32" stroke-width="2" stroke-linecap="round"/>${leaf}
      <circle cx="20" cy="14" r="9" fill="${tip}" stroke="rgba(0,0,0,.2)" stroke-width=".7"/>
      <path d="M13 15c1-5 5-7 8-6M27 14c-1 4-4 7-8 6M15 18c2 2 6 3 9 0" stroke="rgba(0,0,0,.28)" stroke-width="1.1" fill="none" stroke-linecap="round"/>
      <circle cx="20" cy="13" r="4.2" fill="${base}" stroke="rgba(0,0,0,.22)" stroke-width=".7"/>
      <path d="M18 12c1-1.5 3-1.5 4 0" stroke="rgba(0,0,0,.3)" stroke-width="1" fill="none"/></svg>`;
  }
  if (f.kind === 'cluster' && f.shape === 'globe') {
    // Allium: a ball of stars on a tall bare stem.
    const dots = Array.from({ length: 18 }, (_, i) => {
      const a = i * 2.4;
      const r = Math.sqrt(i / 18) * 8;
      return `<circle cx="${(20 + Math.cos(a) * r).toFixed(1)}" cy="${(12 + Math.sin(a) * r).toFixed(1)}" r="1.9" fill="${c}"/>`;
    }).join('');
    return `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 38V18" stroke="#5f8f3e" stroke-width="2" stroke-linecap="round"/>${dots}</svg>`;
  }
  if (f.kind === 'cluster') {
    // Sedum: a flat dome of tiny florets (hydrangea and friends: a rounder mophead).
    const dots = Array.from({ length: 14 }, (_, i) => {
      const a = i * 2.4;
      const r = Math.sqrt(i / 14) * 9;
      return `<circle cx="${(20 + Math.cos(a) * r).toFixed(1)}" cy="${(15 + Math.sin(a) * r * (f.shape === 'dome' ? 0.85 : 0.55)).toFixed(1)}" r="2" fill="${c}"/>`;
    }).join('');
    return svg(dots);
  }
  if (f.kind === 'arch') {
    // Arching stems hung with hearts or bells.
    const [base, tip] = sp.colors[0].split('|');
    const hang = [0.45, 0.6, 0.72, 0.84, 0.95].map((t) => {
      const x = 8 + t * 24;
      const y = 26 - Math.sin(t * Math.PI * 0.85) * 18 + 3;
      return f.shape === 'heart'
        ? `<path d="M${x} ${y}l-3 3c-2 2 0 5 3 3 3 2 5-1 3-3z" fill="${base}"/><circle cx="${x}" cy="${y + 6.5}" r="1.1" fill="${tip ?? '#fff'}"/>`
        : `<path d="M${x - 2.6} ${y + 6}c0-4 1-6 2.6-6s2.6 2 2.6 6z" fill="${tip ?? base}"/><path d="M${x - 3} ${y + 3}l3-3 3 3z" fill="${base}"/>`;
    }).join('');
    return `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 37C8 20 18 8 33 14" stroke="#5f8f3e" stroke-width="2" fill="none" stroke-linecap="round"/>${hang}</svg>`;
  }
  if (f.kind === 'cloud') {
    // A haze of tiny florets on fine branching stems.
    const dots = Array.from({ length: 30 }, (_, i) => `<circle cx="${(20 + Math.cos(i * 2.4) * Math.sqrt(i / 30) * 13).toFixed(1)}" cy="${(14 + Math.sin(i * 2.4) * Math.sqrt(i / 30) * 8).toFixed(1)}" r="1.3" fill="${c}"/>`).join('');
    return `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 38V22M20 26l-9-9M20 24l8-9M20 30l-5-12M20 28l11-6" stroke="#6f9a48" stroke-width="1.2" fill="none" stroke-linecap="round"/>${dots}</svg>`;
  }
  if (f.kind === 'pincushion') {
    // Scabious: a pincushion with a frilly skirt; globe thistle: a spiky steel-blue ball.
    if (f.spiky) {
      const spikes = Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        return `<path d="M${(20 + Math.cos(a) * 5).toFixed(1)} ${(14 + Math.sin(a) * 5).toFixed(1)}L${(20 + Math.cos(a) * 9).toFixed(1)} ${(14 + Math.sin(a) * 9).toFixed(1)}" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`;
      }).join('');
      return svg(`${spikes}<circle cx="20" cy="14" r="5.5" fill="${c}"/>`);
    }
    return svg(`${bloom(20, 15, c, 14, 5, c, 6)}<circle cx="20" cy="15" r="4.6" fill="${c}" stroke="rgba(0,0,0,.25)" stroke-width=".6"/>${[0, 1, 2, 3, 4, 5].map((i) => `<circle cx="${(20 + Math.cos(i) * 2.5).toFixed(1)}" cy="${(15 + Math.sin(i) * 2.5).toFixed(1)}" r=".9" fill="#fff"/>`).join('')}`);
  }
  if (f.kind === 'torch') {
    // Red hot poker: a torch shading from gold at the bottom to scarlet at the top.
    const [lo, hi] = sp.colors[0].split('|');
    return `<svg viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="tg-${sp.id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${lo}"/><stop offset="1" stop-color="${hi ?? lo}"/></linearGradient></defs>
      <path d="M20 38V20" stroke="#5f8f3e" stroke-width="2" stroke-linecap="round"/><path d="M14 38c2-8 3-12 5-16M26 38c-2-8-3-12-5-16" stroke="#6fa848" stroke-width="1.6" fill="none"/>
      <ellipse cx="20" cy="12" rx="4.2" ry="10" fill="url(#tg-${sp.id})"/></svg>`;
  }
  if (f.kind === 'foliage') {
    // Foliage: grass blades, a fern frond, broad hosta leaves, a silvery rosette, a box ball.
    const fill = c;
    const art =
      f.leaf === 'grass'
        ? Array.from({ length: 9 }, (_, i) => `<path d="M20 37C${20 + (i - 4) * 1.5} 25 ${20 + (i - 4) * 3.5} 16 ${20 + (i - 4) * 4} ${8 + Math.abs(i - 4) * 2}" stroke="${fill}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`).join('')
        : f.leaf === 'fern'
          ? [-1, 1].map((sd) => `<path d="M20 36C${20 + sd * 4} 26 ${20 + sd * 10} 16 ${20 + sd * 15} 12" stroke="${fill}" stroke-width="1.4" fill="none"/>${Array.from({ length: 6 }, (_, i) => `<path d="M${20 + sd * (3 + i * 2)} ${33 - i * 3.5}l${sd * 3} -3" stroke="${fill}" stroke-width="2" stroke-linecap="round"/>`).join('')}`).join('') + `<path d="M20 37V10" stroke="${fill}" stroke-width="1.6"/>`
          : f.leaf === 'hosta'
            ? [-50, -20, 10, 40].map((r) => `<path d="M20 34c-8-4-9-13-2-18 7 5 6 14 2 18z" fill="${fill}" stroke="rgba(0,0,0,.2)" stroke-width=".7" transform="rotate(${r} 20 34)"/>`).join('')
            : f.leaf === 'silver'
              ? Array.from({ length: 8 }, (_, i) => `<ellipse cx="20" cy="26" rx="3.2" ry="8" fill="${fill}" stroke="rgba(0,0,0,.15)" stroke-width=".6" transform="rotate(${i * 45} 20 30)"/>`).join('')
              : `<circle cx="20" cy="22" r="11" fill="${fill}"/><circle cx="16" cy="18" r="4" fill="rgba(255,255,255,.12)"/>`;
    return `<svg viewBox="0 0 40 40" aria-hidden="true">${art}</svg>`;
  }
  if (f.domed) {
    // Pom-pom: rings of petals building up to a crown.
    return svg(`${bloom(20, 15, c, 12, 5, c)}${bloom(20, 14, c, 9, 4, c, 3.6)}<circle cx="20" cy="13.5" r="3.4" fill="${c}" stroke="rgba(0,0,0,.2)" stroke-width=".6"/>`);
  }
  if (f.cone) {
    // Black-eyed Susan: drooping golden petals round a dark cone.
    const petals = Array.from({ length: 11 }, (_, i) => `<ellipse cx="20" cy="20" rx="1.8" ry="6" fill="${c}" transform="rotate(${-80 + i * 16} 20 14)"/>`).join('');
    return svg(`${petals}<ellipse cx="20" cy="13" rx="4" ry="3.6" fill="${f.center}"/>`);
  }
  if (f.tilt) {
    // Pansy: a face of five broad petals with a dark heart.
    return svg(`${bloom(20, 15, c, 5, 9, '#2d1f3d', 6)}<circle cx="20" cy="15" r="1.4" fill="#f6d24a"/>`);
  }
  const n = Math.min(14, Math.round(f.petals[0]));
  if (f.corona) {
    // Daffodil: six petals round a trumpet.
    return svg(`${bloom(20, 15, c, 6, 6, f.corona.color)}<circle cx="20" cy="15" r="4.2" fill="${f.corona.color}" stroke="rgba(0,0,0,.2)" stroke-width=".6"/><circle cx="20" cy="15" r="2.2" fill="#c97a1c"/>`);
  }
  return svg(bloom(20, 15, c, n, f.width > 0.025 ? 6 : 4, f.stamens ?? f.center));
}

function bloom(cx: number, cy: number, color: string, n: number, w = 4, center = '#f2c94c', len = 5): string {
  const petals = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 360;
    return `<ellipse cx="${cx}" cy="${cy - len}" rx="${w / 2}" ry="${len}" fill="${color}" stroke="rgba(0,0,0,.18)" stroke-width=".6" transform="rotate(${a} ${cx} ${cy})"/>`;
  }).join('');
  return `${petals}<circle cx="${cx}" cy="${cy}" r="2.6" fill="${center}"/>`;
}

const BOOK_ICON = `<svg viewBox="0 0 40 40" aria-hidden="true">
  <path d="M6 10c5-2 10-2 14 1v21c-4-3-9-3-14-1z" fill="#8fb36a" stroke="#5f7f43" stroke-width="1.2"/>
  <path d="M34 10c-5-2-10-2-14 1v21c4-3 9-3 14-1z" fill="#a8c884" stroke="#5f7f43" stroke-width="1.2"/>
  <circle cx="13" cy="18" r="2.6" fill="#f08fb4"/><circle cx="27" cy="17" r="2.4" fill="#f2c94c"/><circle cx="26" cy="24" r="2" fill="#9b7fd6"/>
</svg>`;

/**
 * Species chips that float above the toolbar while the flower tool is active: the flower
 * book first (every species, to browse), then the seasonal mix and the flowers blooming now,
 * each wearing a little green leaf badge. A species picked from the book gets a chip too.
 */
const AMOUNT_ICONS: Record<'drift' | 'clump' | 'one', [string, string]> = {
  // A soft sweep of little blooms along a curve.
  drift: [`<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 27c7-9 17 2 26-8" fill="none" stroke="#b9a37f" stroke-width="2.4" stroke-linecap="round" opacity=".55"/>${[[8, 26, '#e88aa8'], [14, 22, '#f2c14e'], [20, 24, '#c58ad8'], [26, 22, '#e88aa8'], [32, 18, '#f2c14e']].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="${c}"/>`).join('')}</svg>`, 'Drift'],
  // Three or four blooms close together.
  clump: [`<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="21" r="12" fill="#7a5a3c" opacity=".18"/>${[[15, 18], [24, 16], [18, 26], [26, 24]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.6" fill="#e88aa8"/><circle cx="${x}" cy="${y}" r="1.6" fill="#f6d36a"/>`).join('')}</svg>`, 'Clump'],
  // A single flower on its stem.
  one: [`<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 33V19" stroke="#5f8a3e" stroke-width="2.2" stroke-linecap="round"/><path d="M20 27c-4-1-6-4-6-6 3 0 5 2 6 6z" fill="#6aa548"/>${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="20" cy="11" rx="3.2" ry="5" fill="#e88aa8" transform="rotate(${a} 20 16)"/>`).join('')}<circle cx="20" cy="16" r="2.8" fill="#f6d36a"/></svg>`, 'One'],
};

export class FlowerPicker {
  private readonly el: HTMLDivElement;
  private readonly chips = new Map<string, HTMLButtonElement>();
  private readonly blooming = new Set<string>();
  private readonly kept = new Set<string>();
  private readonly colours: HTMLDivElement;
  private readonly coloursBar: HTMLDivElement;
  /** The colour chosen for each species with a colour choice (-1: mixed). */
  private readonly colour = new Map<string, number>();
  /** Opens the flower book (set by whoever owns it). */
  onBook: () => void = () => {};
  /** The amount chip was tapped: move on to the next amount (drift → clump → one). */
  onAmount: () => void = () => {};
  /** The bed chip was tapped: open or close the bed panel (edges and toppings). */
  onBed: () => void = () => {};
  private readonly amountChip: HTMLButtonElement;
  private readonly bedChip: HTMLButtonElement;

  constructor(
    private readonly species: FlowerSpecies[],
    inSeason: (sp: FlowerSpecies) => boolean,
    private readonly onPick: (id: string, label: string) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'flower-picker';
    // The row centres itself when it fits (iPad), and scrolls sideways when it doesn't (iPhone).
    const row = document.createElement('div');
    row.className = 'flower-picker-row';
    this.el.append(row);
    const book = document.createElement('button');
    book.type = 'button';
    book.className = 'flower-chip book-chip';
    book.setAttribute('aria-label', 'Flower book');
    book.innerHTML = `<span class="chip-face">${BOOK_ICON}</span><span class="chip-name">Flower book</span>`;
    book.addEventListener('pointerdown', (e) => e.stopPropagation());
    book.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onBook();
    });
    // How much each touch plants, first in the row: a drift, a clump, or one flower.
    this.amountChip = document.createElement('button');
    this.amountChip.type = 'button';
    this.amountChip.className = 'flower-chip amount-chip';
    this.amountChip.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.amountChip.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onAmount();
    });
    this.setAmount('drift');
    this.bedChip = document.createElement('button');
    this.bedChip.type = 'button';
    this.bedChip.className = 'flower-chip bed-chip amount-chip';
    this.bedChip.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.bedChip.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onBed();
    });
    this.setBed(BED_ICONS.stone[0]);
    row.append(this.amountChip, this.bedChip, book);
    const entries: [string, string, FlowerSpecies | null, boolean][] = [
      [MIX_ID, 'Seasonal mix', null, true],
      [WATER_MIX_ID, 'Water mix', null, true],
      ...species.map((s) => [s.id, s.name, s, inSeason(s)] as [string, string, FlowerSpecies, boolean]),
    ];
    for (const [id, label, sp, blooming] of entries) {
      if (blooming) this.blooming.add(id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'flower-chip' + (blooming ? ' blooming' : ' resting');
      b.setAttribute('aria-label', label);
      b.innerHTML = `<span class="chip-face">${icon(sp, id === WATER_MIX_ID)}</span><span class="chip-name">${label}</span>`;
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.pick(id);
      });
      this.chips.set(id, b);
      row.append(b);
    }
    // A row of colour swatches above the chips, for flowers that offer a colour choice (roses).
    // (Its own strip, floating just above the chips: inside the scrolling row it would be clipped.)
    this.coloursBar = document.createElement('div');
    this.coloursBar.className = 'colour-bar';
    this.colours = document.createElement('div');
    this.colours.className = 'colour-row';
    this.coloursBar.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.coloursBar.append(this.colours);
    document.body.append(this.coloursBar);
    document.body.append(this.el);
    this.select(MIX_ID);
  }

  /** Show the colour swatches for a species with a colour choice (or hide them). */
  private showColours(sp: FlowerSpecies | undefined) {
    this.colours.replaceChildren();
    const choosy = sp && sp.form.kind === 'rose';
    this.colours.classList.toggle('show', !!choosy);
    document.body.classList.toggle('choosing-colour', !!choosy);
    if (!sp || !choosy) return;
    const current = this.colour.get(sp.id) ?? -1;
    const add = (i: number, label: string, html: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'colour-swatch' + (i === current ? ' active' : '') + (i < 0 ? ' mixed' : '');
      b.setAttribute('aria-label', label);
      b.innerHTML = html;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.colour.set(sp.id, i);
        for (const el of this.colours.children) el.classList.toggle('active', el === b);
        const id = i < 0 ? sp.id : `${sp.id}:${i}`;
        this.onPick(id, i < 0 ? `${sp.name}: mixed colours` : `${sp.name}: ${label.toLowerCase()}`);
      });
      this.colours.append(b);
    };
    add(-1, 'Mixed colours', `<span style="background:conic-gradient(${sp.colors.slice(0, 6).map((c) => c.split('|')[0]).join(',')})"></span>`);
    sp.colors.forEach((c, i) => {
      const [a, b] = c.split('|');
      add(i, b ? 'Two-tone' : 'This colour', `<span style="background:${b ? `radial-gradient(circle, ${a} 35%, ${b} 100%)` : a}"></span>`);
    });
  }

  /** Choose a species (from a chip or the book), as if its chip were tapped. */
  /** Show the current bed style's drawing on the Bed chip. */
  setBed(svg: string) {
    this.bedChip.setAttribute('aria-label', 'Bed edge and topping');
    this.bedChip.innerHTML = `<span class="chip-face">${svg}</span><span class="chip-name">Bed</span>`;
  }

  /** Show which amount is chosen on its chip. */
  setAmount(amount: 'drift' | 'clump' | 'one') {
    const [svg, label] = AMOUNT_ICONS[amount];
    this.amountChip.setAttribute('aria-label', `Planting: ${label}`);
    this.amountChip.innerHTML = `<span class="chip-face">${svg}</span><span class="chip-name">${label}</span>`;
  }

  pick(id: string) {
    const sp = this.species.find((s) => s.id === id);
    const label = sp?.name ?? (id === WATER_MIX_ID ? 'Water mix' : 'Seasonal mix');
    this.select(id);
    this.chips.get(id)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    this.showColours(sp);
    // Keep the colour chosen for this species last time.
    const colour = sp ? (this.colour.get(sp.id) ?? -1) : -1;
    const where = id === WATER_MIX_ID || sp?.zone ? ' · paint across a pond' : '';
    this.onPick(colour >= 0 ? `${id}:${colour}` : id, id === WATER_MIX_ID ? `Water mix${where}` : (this.blooming.has(id) ? `${label}: blooming now` : `${label}: buds until its season`) + where);
  }

  select(id: string) {
    // Out-of-season species get a chip only once chosen from the book (and keep it after).
    if (!this.blooming.has(id)) this.kept.add(id);
    for (const [cid, b] of this.chips) {
      b.classList.toggle('active', cid === id);
      b.classList.toggle('resting', !this.blooming.has(cid) && !this.kept.has(cid));
    }
  }

  setVisible(v: boolean) {
    this.el.classList.toggle('show', v);
    this.coloursBar.classList.toggle('show', v);
    if (!v) document.body.classList.remove('choosing-colour');
    else if (this.colours.classList.contains('show')) document.body.classList.add('choosing-colour');
  }
}
