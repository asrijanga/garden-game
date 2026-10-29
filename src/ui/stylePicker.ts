import type { BuildStyle } from '../game/tools';
import type { PropKind } from '../world/props';

/** A few flowers peeking over an edging, in the edging chips. */
const EDGE_FLOWERS = `<path d="M10 22v-8M20 21v-10M30 22v-7" stroke="#5f8f3e" stroke-width="1.6"/><circle cx="10" cy="13" r="3" fill="#f08fb4"/><circle cx="20" cy="10" r="3.2" fill="#f2c94c"/><circle cx="30" cy="14" r="3" fill="#9b7fd6"/>`;

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
  // Low edgings for beds and paths (each drawn with a few flowers behind it).
  {
    id: 'boxEdge',
    label: 'Box edging',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true">${EDGE_FLOWERS}
      <rect x="4" y="22" width="32" height="11" rx="5.5" fill="#4f8636" stroke="#335f24" stroke-width="1.3"/>
      <path d="M9 26c2-1 3-1 5 0M20 25c2-1 3-1 5 0M28 27c1.5-1 3-1 4 0" stroke="#78ad55" stroke-width="1.4" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: 'stoneEdge',
    label: 'Stone edging',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true">${EDGE_FLOWERS}
      ${[[4, 9], [13.5, 8], [22, 9.5], [32, 6]].map(([x, w]) => `<rect x="${x}" y="${25 + (x % 3)}" width="${w}" height="7" rx="3.2" fill="#b3aca1" stroke="#6f685f" stroke-width="1.2"/>`).join('')}
    </svg>`,
  },
  {
    id: 'brickEdge',
    label: 'Brick edging',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true">${EDGE_FLOWERS}
      ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="${5 + i * 4.4}" y="21" width="3.4" height="11" rx=".6" transform="rotate(-22 ${6.7 + i * 4.4} 32)" fill="${['#c9654b', '#b8573f', '#d27a5c'][i % 3]}" stroke="#7a3a28" stroke-width=".6"/>`).join('')}
    </svg>`,
  },
  {
    id: 'willowEdge',
    label: 'Willow edging',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true">${EDGE_FLOWERS}
      ${[7, 16, 25, 34].map((x) => `<path d="M${x} 33v-12" stroke="#8a7258" stroke-width="2.4" stroke-linecap="round"/>`).join('')}
      ${[24, 27.5, 31].map((y, i) => `<path d="M4 ${y}c4 ${i % 2 ? 1.6 : -1.6} 9 ${i % 2 ? 1.6 : -1.6} 12 0s8 ${i % 2 ? -1.6 : 1.6} 12 0 6 ${i % 2 ? 1.6 : -1.6} 8 0" stroke="#c9b49a" stroke-width="2" fill="none" stroke-linecap="round"/>`).join('')}
    </svg>`,
  },
  {
    id: 'picketEdge',
    label: 'Mini picket',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true">${EDGE_FLOWERS}
      <path d="M4 28h32" stroke="#d8ccb4" stroke-width="2" stroke-linecap="round"/>
      ${[6, 10.5, 15, 19.5, 24, 28.5, 33].map((x) => `<path d="M${x - 1.6} 34V24l1.6-2 1.6 2v10z" fill="#fbf7ee" stroke="#9c8667" stroke-width="1" stroke-linejoin="round"/>`).join('')}
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

const BACKUP_ICON = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M11 13.5a3 3 0 0 1 3-3h8.5l5.5 5.5v13a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3z" fill="#f6efe0" stroke="#8a6a4a" stroke-width="1.6" stroke-linejoin="round"/><path d="M22.5 10.5V16h5.5" fill="none" stroke="#8a6a4a" stroke-width="1.6" stroke-linejoin="round"/><path d="M20 19c-2.6 0-4 2-3.6 4.4 1.8 0 3-.8 3.6-2.2.6 1.4 1.8 2.2 3.6 2.2.4-2.4-1-4.4-3.6-4.4z" fill="#7aa54a"/><path d="M20 21v6" stroke="#5e8a3a" stroke-width="1.4" stroke-linecap="round"/></svg>`;
const RESTORE_ICON = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M11 13.5a3 3 0 0 1 3-3h8.5l5.5 5.5v13a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3z" fill="#f6efe0" stroke="#8a6a4a" stroke-width="1.6" stroke-linejoin="round"/><path d="M22.5 10.5V16h5.5" fill="none" stroke="#8a6a4a" stroke-width="1.6" stroke-linejoin="round"/><path d="M15.5 23.5a4.6 4.6 0 1 0 1.4-3.4" fill="none" stroke="#5e8a3a" stroke-width="1.7" stroke-linecap="round"/><path d="M15.2 17.6v3h3" fill="none" stroke="#5e8a3a" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const MOW_ICON = `<svg viewBox="0 0 40 40" aria-hidden="true">
  <rect x="4" y="9" width="32" height="24" rx="5" fill="#6fa848"/>
  ${[0, 1, 2, 3].map((i) => `<rect x="${4 + i * 8}" y="9" width="8" height="24" fill="${i % 2 ? '#86bd5c' : '#6fa848'}"/>`).join('')}
  <path d="M9 13l1-3 1 3M29 30l1-3 1 3" stroke="#3f7a26" stroke-width="1.2" fill="none"/>
  ${[[30, 13, '#f08fb4'], [10, 28, '#f2c94c']].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="2" fill="${c}" opacity=".45"/>`).join('')}
</svg>`;
const KEEP_ICON = `<svg viewBox="0 0 40 40" aria-hidden="true">
  <rect x="4" y="9" width="32" height="24" rx="5" fill="#6fa848"/>
  ${[0, 1, 2, 3].map((i) => `<rect x="${4 + i * 8}" y="9" width="8" height="24" fill="${i % 2 ? '#86bd5c' : '#6fa848'}"/>`).join('')}
  <circle cx="29" cy="14" r="7" fill="#fffaf0" stroke="#c9a96a" stroke-width="1.2"/>
  <path d="M25.6 14.2l2.4 2.4 4.4-5" stroke="#5f8f3e" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/**
 * The Tidy up tool's extras: mow the wild growth (the meadow and the lawn's wildflowers) away in
 * one go, and a "keep it mown" switch so it doesn't creep back in.
 */
export class TidyPicker {
  private readonly el: HTMLDivElement;
  private readonly keep: HTMLButtonElement;

  constructor(onMow: () => void, onKeep: (on: boolean) => void, keepMown: boolean, onBackup?: () => void, onRestore?: () => void) {
    this.el = document.createElement('div');
    this.el.className = 'flower-picker';
    const row = document.createElement('div');
    row.className = 'flower-picker-row';
    this.el.append(row);
    const chip = (label: string, icon: string, act: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'flower-chip';
      b.setAttribute('aria-label', label);
      b.innerHTML = `<span class="chip-face">${icon}</span><span class="chip-name">${label}</span>`;
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        act();
      });
      row.append(b);
      return b;
    };
    chip('Mow', MOW_ICON, onMow);
    this.keep = chip('Keep mown', KEEP_ICON, () => {
      const on = !this.keep.classList.contains('active');
      this.keep.classList.toggle('active', on);
      onKeep(on);
    });
    this.keep.classList.toggle('active', keepMown);
    // Keeping the garden safe: a small file to save, and restoring from one.
    if (onBackup) chip('Back up', BACKUP_ICON, onBackup);
    if (onRestore) chip('Restore', RESTORE_ICON, onRestore);
    document.body.append(this.el);
  }

  setVisible(v: boolean) {
    this.el.classList.toggle('show', v);
  }
}
