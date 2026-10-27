import { MIX_ID, type FlowerSpecies } from '../world/flowerSpecies';

/** A small illustrated flower icon for a species chip (inline SVG, 40×40). */
export function icon(sp: FlowerSpecies | null): string {
  if (!sp) {
    // Seasonal mix: a little posy of three blooms.
    return `<svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M20 36V22M20 30l-7-8M20 30l7-9" stroke="#5f8f3e" stroke-width="2" stroke-linecap="round"/>
      ${bloom(12, 18, '#c78bc9', 6)}${bloom(28, 16, '#f0b73d', 6)}${bloom(20, 12, '#f08fb4', 7)}
    </svg>`;
  }
  const c = sp.colors[0];
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
export class FlowerPicker {
  private readonly el: HTMLDivElement;
  private readonly chips = new Map<string, HTMLButtonElement>();
  private readonly blooming = new Set<string>();
  private readonly kept = new Set<string>();
  /** Opens the flower book (set by whoever owns it). */
  onBook: () => void = () => {};

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
    row.append(book);
    const entries: [string, string, FlowerSpecies | null, boolean][] = [
      [MIX_ID, 'Seasonal mix', null, true],
      ...species.map((s) => [s.id, s.name, s, inSeason(s)] as [string, string, FlowerSpecies, boolean]),
    ];
    for (const [id, label, sp, blooming] of entries) {
      if (blooming) this.blooming.add(id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'flower-chip' + (blooming ? ' blooming' : ' resting');
      b.setAttribute('aria-label', label);
      b.innerHTML = `<span class="chip-face">${icon(sp)}</span><span class="chip-name">${label}</span>`;
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.pick(id);
      });
      this.chips.set(id, b);
      row.append(b);
    }
    document.body.append(this.el);
    this.select(MIX_ID);
  }

  /** Choose a species (from a chip or the book), as if its chip were tapped. */
  pick(id: string) {
    const sp = this.species.find((s) => s.id === id);
    const label = sp?.name ?? 'Seasonal mix';
    this.select(id);
    this.chips.get(id)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    this.onPick(id, this.blooming.has(id) ? `${label}: blooming now` : `${label}: buds until its season`);
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
  }
}
