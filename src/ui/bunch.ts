import type { CutStem } from '../game/bunch';

/**
 * The stems in your hand, close to a bed: a little glass tray along the bottom, a dab of colour
 * for each one (newest last, with a hop as it lands), and what to do with them. Hidden when
 * the hand is empty or you're back in the garden.
 */
export function mountBunch(onTie: (() => void) | null, onDrop: () => void): { set(stems: CutStem[], landed?: boolean): void } {
  const tray = document.createElement('div');
  tray.className = 'bunch';
  tray.innerHTML = `<div class="bunch-stems"></div><span class="bunch-count"></span><button type="button" class="bunch-drop" aria-label="Put them down">✕</button><button type="button" class="bunch-tie">Tie a bouquet</button>`;
  const stemsEl = tray.querySelector<HTMLDivElement>('.bunch-stems')!;
  const count = tray.querySelector<HTMLSpanElement>('.bunch-count')!;
  const tie = tray.querySelector<HTMLButtonElement>('.bunch-tie')!;
  const drop = tray.querySelector<HTMLButtonElement>('.bunch-drop')!;
  for (const el of [tray, tie, drop]) el.addEventListener('pointerdown', (e) => e.stopPropagation());
  tie.addEventListener('click', (e) => {
    e.stopPropagation();
    onTie?.();
  });
  drop.addEventListener('click', (e) => {
    e.stopPropagation();
    onDrop();
  });
  if (!onTie) tie.hidden = true;
  document.body.append(tray);
  return {
    set(stems, landed = false) {
      tray.classList.toggle('has-stems', stems.length > 0);
      // A dab per stem: its petal colour (two-tone ones show their edge as a rim), a touch
      // irregular in size and tilt so the row looks gathered, not printed.
      stemsEl.innerHTML = '';
      stems.slice(-14).forEach((s, i, shown) => {
        const dab = document.createElement('i');
        const h = (s.seed % 997) / 997;
        dab.style.background = s.color;
        if (s.edge && s.edge !== s.color) dab.style.boxShadow = `inset 0 0 0 2px ${s.edge}`;
        dab.style.transform = `rotate(${Math.round((h - 0.5) * 40)}deg) scale(${(0.88 + h * 0.22).toFixed(2)})`;
        if (landed && i === shown.length - 1) dab.className = 'landed';
        stemsEl.append(dab);
      });
      count.textContent = stems.length > 14 ? `${stems.length}` : '';
      tie.disabled = stems.length < 3;
      tie.textContent = stems.length < 3 ? `${3 - stems.length} more to tie` : 'Tie a bouquet';
    },
  };
}
