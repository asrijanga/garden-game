/**
 * A tied bouquet, shown on its own: its name and what's in it along the bottom, and what to do
 * with it. (The world draws the bouquet itself, turning slowly; drag to turn it.)
 */
export interface BouquetView {
  show(name: string, detail: string): void;
  /** Every stem in and tied: the buttons wake up. */
  ready(): void;
  hide(): void;
}

export function mountBouquetView(actions: { untie(): void; done(): void }, doneLabel: string): BouquetView {
  const card = document.createElement('div');
  card.className = 'bouquet-card';
  card.innerHTML = `<div class="bouquet-name"></div><div class="bouquet-detail"></div><div class="bouquet-actions"><button type="button" class="bouquet-untie">Untie</button><button type="button" class="bouquet-done"></button></div>`;
  const name = card.querySelector<HTMLDivElement>('.bouquet-name')!;
  const detail = card.querySelector<HTMLDivElement>('.bouquet-detail')!;
  const untie = card.querySelector<HTMLButtonElement>('.bouquet-untie')!;
  const done = card.querySelector<HTMLButtonElement>('.bouquet-done')!;
  done.textContent = doneLabel;
  card.addEventListener('pointerdown', (e) => e.stopPropagation());
  untie.addEventListener('click', (e) => {
    e.stopPropagation();
    actions.untie();
  });
  done.addEventListener('click', (e) => {
    e.stopPropagation();
    actions.done();
  });
  document.body.append(card);
  return {
    show(n, d) {
      name.textContent = n;
      detail.textContent = d;
      untie.disabled = done.disabled = true;
      document.body.classList.add('in-bouquet');
    },
    ready() {
      untie.disabled = done.disabled = false;
    },
    hide() {
      document.body.classList.remove('in-bouquet');
    },
  };
}
