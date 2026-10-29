import type { BedStyle } from '../game/flowerBrush';
import { TOPPINGS, type Topping } from '../world/groundPaint';

/** A little drawing of each way to edge a bed. */
export const BED_ICONS: Record<BedStyle, [string, string]> = {
  stone: [`<svg viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="20" cy="22" rx="14" ry="9" fill="#6e3a22"/>${[[7, 20], [11, 14], [18, 12], [25, 12], [32, 15], [34, 22], [30, 28], [22, 31], [14, 30], [8, 26]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="3" ry="2.3" fill="#bdb3a3" stroke="#7f786f" stroke-width=".8"/>`).join('')}</svg>`, 'Stone edge'],
  none: [`<svg viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="20" cy="22" rx="15" ry="10" fill="#6e3a22" opacity=".85"/><ellipse cx="20" cy="22" rx="17" ry="12" fill="none" stroke="#6e3a22" stroke-width="2" stroke-dasharray="2 3" opacity=".5"/></svg>`, 'No edge'],
  brick: [`<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="5" y="15" width="30" height="16" rx="3" fill="#6e3a22"/>${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="${5 + i * 4.3}" y="9" width="3.6" height="8" rx=".6" transform="rotate(-24 ${7 + i * 4.3} 17)" fill="${['#b5583d', '#a94f37', '#c0654a'][i % 3]}"/>`).join('')}</svg>`, 'Brick edge'],
  wattle: [`<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="5" y="20" width="30" height="12" rx="3" fill="#6e3a22"/>${[8, 16, 24, 32].map((x) => `<path d="M${x} 9v15" stroke="#6f5a46" stroke-width="2.2" stroke-linecap="round"/>`).join('')}${[12, 16, 20].map((y, i) => `<path d="M5 ${y}c4 ${i % 2 ? 2 : -2} 8 ${i % 2 ? -2 : 2} 12 0s8 ${i % 2 ? -2 : 2} 12 0 6 ${i % 2 ? 2 : -2} 6 0" stroke="#958067" stroke-width="2" fill="none" stroke-linecap="round"/>`).join('')}</svg>`, 'Willow edge'],
  timber: [`<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 16l14-5 14 5-14 5z" fill="#6e3a22"/><path d="M6 16v10l14 5V21zM34 16v10l-14 5V21z" fill="#a6865f" stroke="#6f5238" stroke-width="1"/><path d="M6 21l14 5 14-5" stroke="#836548" stroke-width="1" fill="none"/><circle cx="16" cy="13" r="2.4" fill="#e88aa8"/><circle cx="23" cy="14" r="2.4" fill="#f2c14e"/></svg>`, 'Raised timber'],
  raised: [`<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 17l14-5 14 5-14 5z" fill="#6e3a22"/>${[[7, 21], [13, 24], [19, 26], [25, 24], [31, 21], [10, 27], [16, 29], [22, 29], [28, 27]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="3.2" ry="2.4" fill="#bdb3a3" stroke="#7f786f" stroke-width=".8"/>`).join('')}<circle cx="17" cy="15" r="2.4" fill="#c58ad8"/><circle cx="24" cy="15" r="2.4" fill="#e88aa8"/></svg>`, 'Raised stone'],
};

const TOPPING_LOOK: Record<Topping, [string, string, string]> = {
  cedar: ['#6e3a22', '#a8603a', 'Cedar bark'],
  compost: ['#2a1d14', '#4a3524', 'Compost'],
  straw: ['#b8964a', '#e0c77a', 'Straw'],
  pine: ['#6a3a1c', '#a66a34', 'Pine needles'],
  cocoa: ['#3e2214', '#6b3e26', 'Cocoa shell'],
  pea: ['#b89c70', '#e0c89c', 'Pea gravel'],
  chippings: ['#cfcbc3', '#f2f0ea', 'White chippings'],
  slate: ['#3e444c', '#626a74', 'Slate'],
  pebbles: ['#8a8276', '#b4ab9c', 'River pebbles'],
  moss: ['#3f5a1e', '#6f8f34', 'Moss'],
  clover: ['#3f7a26', '#6aa548', 'Clover'],
};

/**
 * The bed panel: how new beds are edged (or raised), and what covers their soil. It floats above
 * the flower chips when the Bed chip is tapped; choices last until changed.
 */
export class BedPicker {
  private readonly el: HTMLDivElement;
  private readonly edges = new Map<BedStyle, HTMLButtonElement>();
  private readonly tops: HTMLButtonElement[] = [];

  constructor(private readonly onStyle: (s: BedStyle, label: string) => void, private readonly onTopping: (i: number, label: string) => void) {
    this.el = document.createElement('div');
    this.el.className = 'bed-panel';
    const edgeRow = document.createElement('div');
    edgeRow.className = 'bed-row';
    for (const [style, [svg, label]] of Object.entries(BED_ICONS) as [BedStyle, [string, string]][]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bed-edge';
      b.setAttribute('aria-label', label);
      b.innerHTML = `${svg}<span>${label}</span>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.select(style, null);
        this.onStyle(style, label);
      });
      this.edges.set(style, b);
      edgeRow.append(b);
    }
    const topRow = document.createElement('div');
    topRow.className = 'bed-row bed-tops';
    TOPPINGS.forEach((t, i) => {
      const [a, c, label] = TOPPING_LOOK[t];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bed-top';
      b.setAttribute('aria-label', label);
      b.style.background = `radial-gradient(circle at 30% 30%, ${c} 0 18%, transparent 19%), radial-gradient(circle at 70% 60%, ${c} 0 14%, transparent 15%), radial-gradient(circle at 40% 75%, ${c} 0 12%, transparent 13%), ${a}`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.select(null, i);
        this.onTopping(i, label);
      });
      this.tops.push(b);
      topRow.append(b);
    });
    const title = (text: string) => {
      const h = document.createElement('div');
      h.className = 'bed-title';
      h.textContent = text;
      return h;
    };
    this.el.append(title('Edge'), edgeRow, title('Topping'), topRow);
    for (const type of ['pointerdown', 'pointermove', 'pointerup']) this.el.addEventListener(type, (e) => e.stopPropagation());
    document.body.append(this.el);
    this.select('stone', 0);
  }

  select(style: BedStyle | null, topping: number | null) {
    if (style) for (const [s, b] of this.edges) b.classList.toggle('active', s === style);
    if (topping !== null) this.tops.forEach((b, i) => b.classList.toggle('active', i === topping));
  }

  get open(): boolean {
    return this.el.classList.contains('show');
  }

  setVisible(v: boolean) {
    this.el.classList.toggle('show', v);
    document.body.classList.toggle('choosing-bed', v);
  }
}
