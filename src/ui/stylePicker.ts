import type { BuildStyle } from '../game/tools';

const STYLES: { id: BuildStyle; label: string; icon: string }[] = [
  {
    id: 'picket',
    label: 'Picket fence',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M5 19h30M5 28h30" stroke="#d8ccb4" stroke-width="2.6" stroke-linecap="round"/>
      ${[9, 16, 23, 30].map((x) => `<path d="M${x - 2.4} 35V11l2.4-3.2 2.4 3.2v24z" fill="#fbf7ee" stroke="#9c8667" stroke-width="1.3" stroke-linejoin="round"/>`).join('')}
    </svg>`,
  },
  {
    id: 'rustic',
    label: 'Rustic rails',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M5 17.5c10 1 20-1 30 .5M5 27c10-.5 20 1 30-.5" stroke="#8f806c" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M8 35V11M32 35V10" stroke="#7d6e5c" stroke-width="4.4" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'hedge',
    label: 'Hedge',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true">
      <rect x="4" y="13" width="32" height="21" rx="8" fill="#4f8636" stroke="#335f24" stroke-width="1.4"/>
      <path d="M9 18c2-1 4-1 6 0M18 22c2-1 4-1 6 0M26 17c2-1 4-1 5 0M11 27c2-1 4-1 6 0" stroke="#78ad55" stroke-width="1.6" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'rocks',
    label: 'Rocks',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M6 33c0-8 4-15 11-16 6-1 10 3 12 8 1 3 1 6 0 8z" fill="#a9a196" stroke="#6f685f" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M11 22c3-3 8-4 12-2" stroke="#7fa64a" stroke-width="3" stroke-linecap="round" opacity=".85"/>
      <path d="M27 33c0-4 2-7 5-7s4 3 4 7z" fill="#bdb5a9" stroke="#6f685f" stroke-width="1.3" stroke-linejoin="round"/>
    </svg>`,
  },
];

/** Style chips for the fence tool, floating above the toolbar (same look as the flower picker). */
export class StylePicker {
  private readonly el: HTMLDivElement;
  private readonly chips = new Map<BuildStyle, HTMLButtonElement>();

  constructor(private readonly onPick: (style: BuildStyle, label: string) => void) {
    this.el = document.createElement('div');
    this.el.className = 'flower-picker';
    const row = document.createElement('div');
    row.className = 'flower-picker-row';
    this.el.append(row);
    for (const s of STYLES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'flower-chip';
      b.setAttribute('aria-label', s.label);
      b.innerHTML = `<span class="chip-face">${s.icon}</span><span class="chip-name">${s.label}</span>`;
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.select(s.id);
        this.onPick(s.id, s.label);
      });
      this.chips.set(s.id, b);
      row.append(b);
    }
    document.body.append(this.el);
    this.select('picket');
  }

  select(id: BuildStyle) {
    for (const [cid, b] of this.chips) b.classList.toggle('active', cid === id);
  }

  setVisible(v: boolean) {
    this.el.classList.toggle('show', v);
  }
}
