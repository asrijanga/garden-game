import type { FlowerSpecies } from '../world/flowerSpecies';
import type { Season } from '../world/season';
import { icon } from './flowerPicker';

const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
const SEASON_NAME: Record<Season, string> = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };
/** The season after this one, and the one after that… (for "coming soon" ordering). */
const after = (s: Season, k: number) => SEASONS[(SEASONS.indexOf(s) + k) % 4];

/**
 * A plant book (flowers, or foliage): every species on a soft paper page, "Blooming now" first, then the rest
 * grouped by the season they'll next flower in. Each entry shows the flower, its name, its
 * seasons and its colours; tapping one picks it for planting and closes the book.
 */
export class FlowerBook {
  private readonly el: HTMLDivElement;

  constructor(title: string, species: FlowerSpecies[], season: Season, onPick: (id: string) => void, mixes: { id: string; name: string; art: string; note: string }[] = []) {
    this.el = document.createElement('div');
    this.el.className = 'flower-book';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', title);
    const page = document.createElement('div');
    page.className = 'book-page';
    const head = document.createElement('div');
    head.className = 'book-head';
    head.innerHTML = `<h2>${title}</h2><span class="book-count">${species.length} plants</span>`;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'book-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    close.addEventListener('click', () => this.setVisible(false));
    head.append(close);
    const body = document.createElement('div');
    body.className = 'book-body';
    page.append(head, body);
    this.el.append(page);

    // Mixes first (a handful of what's blooming, or what grows in water).
    if (mixes.length) {
      const h = document.createElement('h3');
      h.textContent = 'Mixes';
      const grid = document.createElement('div');
      grid.className = 'book-grid';
      for (const m of mixes) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'book-card now';
        card.innerHTML = `<span class="book-art">${m.art}</span><span class="book-name">${m.name}</span><span class="book-colours">${m.note}</span>`;
        card.addEventListener('click', () => {
          onPick(m.id);
          this.setVisible(false);
        });
        grid.append(card);
      }
      body.append(h, grid);
    }
    // Blooming now; then each later season in turn (a flower appears under the first one it blooms in).
    const now = species.every((s) => s.form.kind === 'foliage') ? 'Growing now' : 'Blooming now';
    const groups: [string, FlowerSpecies[]][] = [[`${now} · ${SEASON_NAME[season]}`, species.filter((s) => s.seasons.includes(season))]];
    const shown = new Set(groups[0][1]);
    for (let k = 1; k < 4; k++) {
      const s = after(season, k);
      const list = species.filter((sp) => !shown.has(sp) && sp.seasons.includes(s));
      list.forEach((sp) => shown.add(sp));
      if (list.length) groups.push([`Blooms in ${SEASON_NAME[s].toLowerCase()}`, list]);
    }
    for (const [title, list] of groups) {
      const h = document.createElement('h3');
      h.textContent = title;
      const grid = document.createElement('div');
      grid.className = 'book-grid';
      for (const sp of [...list].sort((a, b) => a.name.localeCompare(b.name))) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'book-card' + (sp.seasons.includes(season) ? ' now' : '');
        const pills = SEASONS.map((s) => `<i class="pill ${s}${sp.seasons.includes(s) ? ' on' : ''}" title="${SEASON_NAME[s]}"></i>`).join('');
        const swatches = sp.colors.slice(0, 6).map((c) => `<i class="swatch" style="background:${c}"></i>`).join('');
        card.innerHTML = `<span class="book-art">${icon(sp)}</span><span class="book-name">${sp.name}</span><span class="book-seasons">${pills}</span><span class="book-colours">${swatches}</span>`;
        card.addEventListener('click', () => {
          onPick(sp.id);
          this.setVisible(false);
        });
        grid.append(card);
      }
      body.append(h, grid);
    }
    // Tap outside the page to close.
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.setVisible(false);
    });
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.append(this.el);
  }

  setVisible(v: boolean) {
    this.el.classList.toggle('show', v);
  }
}
