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
  const svg = (inner: string) => `<svg viewBox="0 0 40 40" aria-hidden="true">${stem}${inner}</svg>`;
  if (f.kind === 'cluster') {
    // Sedum: a flat dome of tiny florets.
    const dots = Array.from({ length: 14 }, (_, i) => {
      const a = i * 2.4;
      const r = Math.sqrt(i / 14) * 9;
      return `<circle cx="${(20 + Math.cos(a) * r).toFixed(1)}" cy="${(15 + Math.sin(a) * r * 0.55).toFixed(1)}" r="2" fill="${c}"/>`;
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
  return svg(bloom(20, 15, c, n, f.width > 0.025 ? 6 : 4, f.stamens ?? f.center));
}

function bloom(cx: number, cy: number, color: string, n: number, w = 4, center = '#f2c94c', len = 5): string {
  const petals = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 360;
    return `<ellipse cx="${cx}" cy="${cy - len}" rx="${w / 2}" ry="${len}" fill="${color}" stroke="rgba(0,0,0,.18)" stroke-width=".6" transform="rotate(${a} ${cx} ${cy})"/>`;
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
    // The row centres itself when it fits (iPad), and scrolls sideways when it doesn't (iPhone).
    const row = document.createElement('div');
    row.className = 'flower-picker-row';
    this.el.append(row);
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
      row.append(b);
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
