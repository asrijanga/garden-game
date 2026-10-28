import { peekSeason, type Season } from '../world/season';

const LABEL: Record<Season, string> = { spring: '🌸 Spring', summer: '☀️ Summer', autumn: '🍂 Autumn', winter: '❄️ Winter' };

/**
 * A hidden little card (long-press the camera button) to peek at the garden in another season,
 * for fun and for pictures. The garden reloads in that season; "Today" goes back to the real one.
 */
export function showSeasonPeek(current: Season, peeking: boolean) {
  document.querySelector('.season-peek')?.remove();
  const card = document.createElement('div');
  card.className = 'season-peek';
  card.setAttribute('role', 'dialog');
  card.innerHTML = `<div class="peek-title">Peek at another season</div>`;
  const row = document.createElement('div');
  row.className = 'peek-row';
  const add = (label: string, active: boolean, go: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'peek-option' + (active ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      go();
    });
    row.append(b);
  };
  for (const s of ['spring', 'summer', 'autumn', 'winter'] as Season[]) add(LABEL[s], s === current && peeking, () => peekSeason(s));
  add('Today', !peeking, () => peekSeason(null));
  card.append(row);
  card.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.body.append(card);
  // Tap anywhere else to put it away.
  setTimeout(() => {
    const away = (e: Event) => {
      if (card.contains(e.target as Node)) return;
      card.remove();
      document.removeEventListener('pointerdown', away, true);
    };
    document.addEventListener('pointerdown', away, true);
  }, 0);
}
