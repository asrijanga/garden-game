import { MIX_ID, type FlowerSpecies } from '../world/flowerSpecies';

/** A small illustrated flower icon for a species chip (inline SVG, 40×40). */
function icon(sp: FlowerSpecies | null): string {
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
  const n = Math.min(14, Math.round(f.petals[0]));
  return `<svg viewBox="0 0 40 40" aria-hidden="true">${stem}${bloom(20, 15, c, n, f.width > 0.025 ? 6 : 4, f.center)}</svg>`;
}

function bloom(cx: number, cy: number, color: string, n: number, w = 4, center = '#f2c94c'): string {
  const petals = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 360;
    return `<ellipse cx="${cx}" cy="${cy - 5}" rx="${w / 2}" ry="5" fill="${color}" stroke="rgba(0,0,0,.18)" stroke-width=".6" transform="rotate(${a} ${cx} ${cy})"/>`;
  }).join('');
  return `${petals}<circle cx="${cx}" cy="${cy}" r="2.6" fill="${center}"/>`;
}

/**
 * Species chips that float above the toolbar while the flower tool is active. Blooming-now
 * species come first and wear a little green leaf badge.
 */
export class FlowerPicker {
  private readonly el: HTMLDivElement;
  private readonly chips = new Map<string, HTMLButtonElement>();

  constructor(
    species: FlowerSpecies[],
    inSeason: (sp: FlowerSpecies) => boolean,
    private readonly onPick: (id: string, label: string) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'flower-picker';
    const entries: [string, string, FlowerSpecies | null, boolean][] = [
      [MIX_ID, 'Seasonal mix', null, true],
      ...species.map((s) => [s.id, s.name, s, inSeason(s)] as [string, string, FlowerSpecies, boolean]),
    ];
    for (const [id, label, sp, blooming] of entries) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'flower-chip' + (blooming ? ' blooming' : '');
      b.setAttribute('aria-label', label);
      b.innerHTML = `<span class="chip-face">${icon(sp)}</span><span class="chip-name">${label}</span>`;
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.select(id);
        this.onPick(id, blooming ? `${label}: blooming now` : `${label}: buds until its season`);
      });
      this.chips.set(id, b);
      this.el.append(b);
    }
    document.body.append(this.el);
    this.select(MIX_ID);
  }

  select(id: string) {
    for (const [cid, b] of this.chips) b.classList.toggle('active', cid === id);
  }

  setVisible(v: boolean) {
    this.el.classList.toggle('show', v);
  }
}
