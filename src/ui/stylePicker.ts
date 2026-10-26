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
    id: 'bridge',
    label: 'Bridge',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M2 31c6-2 10-2 14 0s10 2 22 0" stroke="#8cc3cf" stroke-width="3" stroke-linecap="round"/>
      <path d="M4 27c8-12 24-12 32 0" fill="none" stroke="#9a6a45" stroke-width="4" stroke-linecap="round"/>
      <path d="M4 20c8-12 24-12 32 0" fill="none" stroke="#8c5e3c" stroke-width="2" stroke-linecap="round"/>
      <path d="M8 22v-5M14 17.5v-6M20 16v-7M26 17.5v-6M32 22v-5" stroke="#7f5638" stroke-width="2" stroke-linecap="round"/>
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
    id: 'gazebo',
    label: 'Gazebo',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M5 17L20 5l15 12z" fill="#7f9a7a" stroke="#56704f" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M8 17v16M15 17v16M25 17v16M32 17v16" stroke="#f2eee6" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M8 17v16M15 17v16M25 17v16M32 17v16" stroke="#9c9488" stroke-width=".7" stroke-linecap="round"/>
      <path d="M8 26h7M25 26h7" stroke="#e6e0d4" stroke-width="2"/>
      <path d="M4 34h32" stroke="#a8825a" stroke-width="3" stroke-linecap="round"/>
      <circle cx="20" cy="4" r="1.6" fill="#f2eee6"/>
    </svg>`,
  },
  {
    id: 'flag',
    label: 'Flag',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M9 36V5" stroke="#efe9de" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M9 36V5" stroke="#a8a094" stroke-width=".8"/>
      <circle cx="9" cy="4" r="2" fill="#d9b45a"/>
      <path d="M10 7c6 1 10-1 16 1s7 3 10 4c-4 1-8 1-12 3s-9 2-14 2z" fill="#e9a6a0" stroke="#b87570" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M10 12c6 0 10-1 15 0" stroke="#f6e8d6" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'chimes',
    label: 'Wind chimes',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M8 37V8a6 6 0 0 1 12 0v2" stroke="#2f2b28" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <rect x="15" y="11" width="11" height="2.4" rx="1" fill="#8a6a4a"/>
      ${[16.5, 19.5, 22.5, 25].map((x, i) => `<rect x="${x - 0.9}" y="14" width="1.8" height="${14 - i * 2.4}" rx=".9" fill="#c9c3b6" stroke="#8f897c" stroke-width=".6"/>`).join('')}
      <path d="M20.5 14v14" stroke="#d9d2c4" stroke-width=".6"/><rect x="18.5" y="28" width="4" height="6" rx="1" fill="#8a6a4a"/>
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
