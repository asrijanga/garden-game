import type { BuildStyle } from '../game/tools';
import type { PropKind } from '../world/props';

export const BUILD_CHIPS: { id: BuildStyle; label: string; icon: string }[] = [
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
    id: 'wall',
    label: 'Stone wall',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true">
      ${[[4, 27, 9], [14, 27, 10], [25, 27, 11], [7, 20.5, 10], [18, 20.5, 9], [28, 20.5, 8], [5, 14, 8], [14, 14, 11], [26, 14, 9]].map(([x, y, w]) => `<rect x="${x}" y="${y}" width="${w}" height="6" rx="2.4" fill="#b3aca1" stroke="#6f685f" stroke-width="1.2"/>`).join('')}
      <path d="M8 33.5h6M28 33.5h6" stroke="#7fb04f" stroke-width="2" stroke-linecap="round"/>
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

export const DECOR_CHIPS: { id: PropKind; label: string; icon: string }[] = [
  {
    id: 'bench',
    label: 'Bench',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M7 15h26M7 20h26" stroke="#a27a52" stroke-width="3.6" stroke-linecap="round"/>
      <path d="M5 26h30" stroke="#b08a60" stroke-width="4" stroke-linecap="round"/>
      <path d="M9 13v21M31 13v21M9 26l-2 8M31 26l2 8" stroke="#7a5a3c" stroke-width="2.4" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'lantern',
    label: 'Lantern',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="11" r="8" fill="#ffd38a" opacity=".45"/>
      <path d="M20 17v19M15 36h10" stroke="#3a332e" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M14.5 7h11l-5.5-4z" fill="#3a332e"/>
      <rect x="16" y="7" width="8" height="9" rx="1" fill="#ffc46e" stroke="#3a332e" stroke-width="1.6"/>
    </svg>`,
  },
  {
    id: 'birdhouse',
    label: 'Birdhouse',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M20 26v11" stroke="#8a6a4a" stroke-width="3" stroke-linecap="round"/>
      <path d="M12 14l8-7 8 7v12H12z" fill="#9cc3d5" stroke="#5e7f8e" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M9 15l11-10 11 10" fill="none" stroke="#b5523b" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="20" cy="18" r="2.6" fill="#2a2018"/>
    </svg>`,
  },
];

/** A row of illustrated choice chips floating above the toolbar (the flower picker's look). */
export class ChipPicker<T extends string> {
  private readonly el: HTMLDivElement;
  private readonly chips = new Map<T, HTMLButtonElement>();

  constructor(items: { id: T; label: string; icon: string }[], private readonly onPick: (id: T, label: string) => void) {
    this.el = document.createElement('div');
    this.el.className = 'flower-picker';
    const row = document.createElement('div');
    row.className = 'flower-picker-row';
    this.el.append(row);
    for (const s of items) {
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
    this.select(items[0].id);
  }

  select(id: T) {
    for (const [cid, b] of this.chips) b.classList.toggle('active', cid === id);
  }

  setVisible(v: boolean) {
    this.el.classList.toggle('show', v);
  }
}
