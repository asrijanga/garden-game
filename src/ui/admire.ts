const ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12c2.6-4.3 6-6.5 9.5-6.5s6.9 2.2 9.5 6.5c-2.6 4.3-6 6.5-9.5 6.5S5.1 16.3 2.5 12z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M19 3.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" fill="currentColor"/></svg>`;

/**
 * Admire mode: a button beside the sun dial that hides every button and menu and lets the
 * camera drift slowly round the garden. Any touch brings everything back (and does nothing else).
 */
export function mountAdmire(onStart: () => void, onStop: () => void): { readonly on: boolean } {
  const state = { on: false };
  const button = document.createElement('button');
  button.className = 'sound-toggle admire-toggle';
  button.type = 'button';
  button.setAttribute('aria-label', 'Admire the garden');
  button.innerHTML = ICON;
  button.addEventListener('pointerdown', (e) => e.stopPropagation());
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.on) return;
    state.on = true;
    document.body.classList.add('admiring');
    onStart();
  });
  // The touch that ends it is swallowed before anything else sees it.
  const stop = (e: Event) => {
    if (!state.on) return;
    e.stopPropagation();
    e.preventDefault();
    state.on = false;
    document.body.classList.remove('admiring');
    onStop();
  };
  window.addEventListener('pointerdown', stop, { capture: true });
  document.body.append(button);
  return state;
}
