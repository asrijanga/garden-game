const BACK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/**
 * Close to a flower bed: the garden's buttons step aside, and a back button (top left) returns
 * to the whole garden. `show(true)` when the view goes close, `show(false)` when it's back.
 */
export function mountBedView(onBack: () => void): { show(on: boolean): void } {
  const button = document.createElement('button');
  button.className = 'sound-toggle bed-back';
  button.type = 'button';
  button.setAttribute('aria-label', 'Back to the garden');
  button.innerHTML = `${BACK}<span>Garden</span>`;
  button.addEventListener('pointerdown', (e) => e.stopPropagation());
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    onBack();
  });
  document.body.append(button);
  return {
    show(on: boolean) {
      document.body.classList.toggle('in-bed', on);
    },
  };
}
