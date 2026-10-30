import { Big } from '../game/points';
import type { Collection } from '../game/collection';

/**
 * Your points (top left, looking round the garden): tap them to open the book of every kind of
 * bouquet you've sold, each with a picture of the first one, newest first.
 */
export function mountCollection(collection: Collection, speciesName: (id: string) => string): { refresh(gained?: Big): void } {
  const hud = document.createElement('button');
  hud.type = 'button';
  hud.className = 'points-hud';
  hud.setAttribute('aria-label', 'Your bouquets');
  hud.innerHTML = `<span class="points-flower" aria-hidden="true">✿</span><span class="points-value"></span>`;
  const value = hud.querySelector<HTMLSpanElement>('.points-value')!;

  const book = document.createElement('div');
  book.className = 'flower-book collection-book';
  book.setAttribute('role', 'dialog');
  book.setAttribute('aria-label', 'Your bouquets');
  book.innerHTML = `<div class="book-page"><div class="book-head"><h2>Your bouquets</h2><span class="book-count"></span><button type="button" class="book-close" aria-label="Close">×</button></div><div class="book-body"></div></div>`;
  const count = book.querySelector<HTMLSpanElement>('.book-count')!;
  const body = book.querySelector<HTMLDivElement>('.book-body')!;
  const show = (on: boolean) => book.classList.toggle('show', on);
  book.querySelector('.book-close')!.addEventListener('click', () => show(false));
  book.addEventListener('click', (e) => {
    if (e.target === book) show(false);
  });
  for (const el of [hud, book]) el.addEventListener('pointerdown', (e) => e.stopPropagation());

  const render = () => {
    const kinds = collection.kept.length;
    count.textContent = `${kinds} ${kinds === 1 ? 'kind' : 'kinds'}`;
    const mult = collection.multiplier;
    body.innerHTML = `<p class="collection-sum"><b>✿ ${collection.points.format()}</b> points · every price ×${mult.format() === '1' ? mult.m.toFixed(2) : mult.format()}<br><span>Each new kind you sell raises every price for good.</span></p>`;
    if (!kinds) {
      body.insertAdjacentHTML('beforeend', `<p class="collection-empty">Tap a flower bed to go close, tap flowers to cut them, then tie them into a bouquet to sell. Each new kind joins this book.</p>`);
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'book-grid collection-grid';
    for (const k of [...collection.kept].reverse()) {
      const card = document.createElement('div');
      card.className = 'book-card collection-card';
      const art = k.thumb
        ? `<img src="${k.thumb}" alt="">`
        : `<span class="collection-dabs">${k.flowers.map((f) => `<i style="background:${f.color}"></i>`).join('')}</span>`;
      const kindsIn = [...new Set(k.flowers.map((f) => speciesName(f.species)))];
      card.innerHTML = `<span class="collection-art">${art}</span><span class="book-name"></span><span class="collection-note"></span>`;
      card.querySelector('.book-name')!.textContent = k.name;
      card.querySelector('.collection-note')!.textContent = `${kindsIn.slice(0, 3).join(', ')}${kindsIn.length > 3 ? '…' : ''} · sold ${k.sold}× · best ${Big.parse(k.best).format()}`;
      grid.append(card);
    }
    body.append(grid);
  };
  hud.addEventListener('click', (e) => {
    e.stopPropagation();
    render();
    show(true);
  });
  document.body.append(hud, book);

  return {
    /** The points have changed (by `gained`, shown floating up from the pill). */
    refresh(gained) {
      value.textContent = collection.points.format();
      hud.classList.toggle('has-points', collection.points.m > 0);
      if (!gained) return;
      hud.classList.remove('gained');
      void hud.offsetWidth;
      hud.classList.add('gained');
      const chip = document.createElement('span');
      chip.className = 'points-gain';
      chip.textContent = `+${gained.format()}`;
      hud.append(chip);
      setTimeout(() => chip.remove(), 1600);
    },
  };
}
