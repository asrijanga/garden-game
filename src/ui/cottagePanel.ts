import { CHIMNEYS, DOORS, ROOFS, SHUTTERS, WALLS, type CottageStyle } from '../world/cottage';

type Cycle = 'roof' | 'walls' | 'shutters' | 'door' | 'chimney';
type Toggle = 'porch' | 'bay' | 'boxes' | 'roses' | 'shed' | 'chimes';

const swatch = (c: string, shape = 'roof') =>
  shape === 'roof'
    ? `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 22L20 8l15 14z" fill="${c}" stroke="rgba(0,0,0,.25)" stroke-width="1.2" stroke-linejoin="round"/><rect x="10" y="21" width="20" height="13" rx="1.5" fill="#f1e3c8" stroke="rgba(0,0,0,.2)"/></svg>`
    : shape === 'walls'
      ? `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 18L20 7l14 11z" fill="#a65a41"/><rect x="9" y="17" width="22" height="17" rx="1.5" fill="${c}" stroke="rgba(0,0,0,.25)"/><rect x="15" y="22" width="6" height="12" fill="#7c4f33"/></svg>`
      : shape === 'shutters'
        ? `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="14" y="10" width="12" height="18" fill="#ffd38a" stroke="#efe6d6" stroke-width="2"/><rect x="6" y="10" width="7" height="18" rx="1" fill="${c}" stroke="rgba(0,0,0,.25)"/><rect x="27" y="10" width="7" height="18" rx="1" fill="${c}" stroke="rgba(0,0,0,.25)"/></svg>`
        : shape === 'door'
          ? `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="12" y="6" width="16" height="28" rx="7" fill="${c}" stroke="rgba(0,0,0,.25)" stroke-width="1.2"/><circle cx="24" cy="21" r="1.6" fill="#d8b46a"/></svg>`
          : `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M4 34l14-12 18 12z" fill="#a65a41"/><rect x="22" y="12" width="8" height="18" fill="${c}" stroke="rgba(0,0,0,.25)"/><path d="M25 10c-3-3 2-5-1-8" stroke="#ddd" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;

const ICON: Record<Toggle, string> = {
  porch: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 17L20 8l13 9z" fill="#a65a41"/><path d="M10 17v17M30 17v17" stroke="#efe6d6" stroke-width="2.6"/><rect x="16" y="20" width="8" height="14" rx="3" fill="#7c4f33"/></svg>`,
  bay: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 14h28l-3-5H9z" fill="#5f6872"/><path d="M8 14h24v15H8z" fill="#ffd38a" stroke="#efe6d6" stroke-width="2"/><path d="M14 14v15M26 14v15" stroke="#efe6d6" stroke-width="2"/><rect x="6" y="29" width="28" height="5" fill="#f1e3c8"/></svg>`,
  boxes: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="9" y="8" width="22" height="14" fill="#ffd38a" stroke="#efe6d6" stroke-width="2"/><rect x="7" y="25" width="26" height="7" rx="1.5" fill="#7a5236"/><circle cx="12" cy="24" r="3" fill="#e46f86"/><circle cx="19" cy="23" r="3" fill="#f0b73d"/><circle cx="26" cy="24" r="3" fill="#c78bc9"/><circle cx="31" cy="23.5" r="2.4" fill="#5f8a3e"/></svg>`,
  roses: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M12 36c4-8-3-14 3-22s9-6 11-10" stroke="#4f7f33" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="14" cy="27" r="3.4" fill="#e46f86"/><circle cx="19" cy="16" r="3.4" fill="#c9405c"/><circle cx="26" cy="8" r="3" fill="#f2a0b2"/><circle cx="11" cy="20" r="2.4" fill="#6fa848"/></svg>`,
  chimes: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 9h28" stroke="#a65a41" stroke-width="4" stroke-linecap="round"/><path d="M20 11v3" stroke="#2f2b28" stroke-width="1.6"/><rect x="14" y="14" width="12" height="2.2" rx="1" fill="#8a6a4a"/>${[16, 19, 22, 25].map((x, i) => `<rect x="${x - 0.9}" y="17" width="1.8" height="${13 - i * 2.2}" rx=".9" fill="#c9c3b6" stroke="#8f897c" stroke-width=".6"/>`).join('')}</svg>`,
  shed: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 14l30-6v5L5 19z" fill="#5f6872"/><rect x="7" y="17" width="26" height="17" fill="#8a6a4a"/><rect x="16" y="22" width="8" height="12" fill="#6e5338"/><path d="M11 17v17M29 15v19" stroke="#6e5338" stroke-width="1"/></svg>`,
};

const CYCLES: { id: Cycle; label: string; options: { name: string; c: string }[] }[] = [
  { id: 'roof', label: 'Roof', options: ROOFS.map((r) => ({ name: r.name, c: r.a })) },
  { id: 'walls', label: 'Walls', options: WALLS },
  { id: 'shutters', label: 'Shutters', options: SHUTTERS },
  { id: 'door', label: 'Door', options: DOORS },
  { id: 'chimney', label: 'Chimney', options: CHIMNEYS.map((name, i) => ({ name, c: ['#a29a8d', '#9a5440', '#efe8dc'][i] })) },
];
const TOGGLES: { id: Toggle; label: string }[] = [
  { id: 'porch', label: 'Porch' },
  { id: 'bay', label: 'Bay window' },
  { id: 'boxes', label: 'Flower boxes' },
  { id: 'roses', label: 'Roses' },
  { id: 'shed', label: 'Shed' },
  { id: 'chimes', label: 'Wind chimes' },
];

/**
 * The cottage drawer: opens when you tap the cottage. Each look chip cycles to the next
 * option; each upgrade chip adds or removes that extra.
 */
export class CottagePanel {
  private readonly el: HTMLDivElement;
  private readonly cycleChips = new Map<Cycle, HTMLButtonElement>();
  private readonly toggleChips = new Map<Toggle, HTMLButtonElement>();
  open = false;

  constructor(
    private readonly current: () => CottageStyle,
    private readonly onChange: (style: CottageStyle, label: string) => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'flower-picker cottage-panel';
    const row = document.createElement('div');
    row.className = 'flower-picker-row';
    this.el.append(row);
    const chip = (label: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'flower-chip';
      b.setAttribute('aria-label', label);
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      row.append(b);
      return b;
    };
    for (const c of CYCLES) {
      const b = chip(c.label);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const st = { ...this.current() };
        st[c.id] = (st[c.id] + 1) % c.options.length;
        this.onChange(st, `${c.label}: ${c.options[st[c.id]].name}`);
        this.refresh();
      });
      this.cycleChips.set(c.id, b);
    }
    for (const t of TOGGLES) {
      const b = chip(t.label);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const st = { ...this.current() };
        st[t.id] = !st[t.id];
        this.onChange(st, `${t.label}: ${st[t.id] ? 'added' : 'removed'}`);
        this.refresh();
      });
      this.toggleChips.set(t.id, b);
    }
    document.body.append(this.el);
    this.refresh();
  }

  refresh() {
    const st = this.current();
    for (const c of CYCLES) {
      const opt = c.options[st[c.id]];
      this.cycleChips.get(c.id)!.innerHTML = `<span class="chip-face">${swatch(opt.c, c.id)}</span><span class="chip-name">${c.label}</span>`;
    }
    for (const t of TOGGLES) {
      const b = this.toggleChips.get(t.id)!;
      b.innerHTML = `<span class="chip-face">${ICON[t.id]}</span><span class="chip-name">${t.label}</span>`;
      b.classList.toggle('active', st[t.id]);
    }
  }

  setVisible(v: boolean) {
    this.open = v;
    if (v) this.refresh();
    this.el.classList.toggle('show', v);
  }
}
