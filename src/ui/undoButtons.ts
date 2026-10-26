const ARROW = `<path d="M9 14 4 9l5-5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 9h10a5.5 5.5 0 0 1 0 11h-3.5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>`;
const UNDO = `<svg viewBox="0 0 24 24" aria-hidden="true">${ARROW}</svg>`;
const REDO = `<svg viewBox="0 0 24 24" aria-hidden="true"><g transform="matrix(-1 0 0 1 24 0)">${ARROW}</g></svg>`;

/** Undo and redo, top-left, out of the thumb zone. Each dims when there's nothing to do. */
export function mountUndoButtons(onUndo: () => void, onRedo: () => void) {
  const make = (cls: string, icon: string, label: string, act: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `sound-toggle history-toggle ${cls}`;
    b.setAttribute('aria-label', label);
    b.innerHTML = icon;
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!b.classList.contains('is-off')) act();
    });
    document.body.append(b);
    return b;
  };
  const undo = make('undo-toggle', UNDO, 'Undo', onUndo);
  const redo = make('redo-toggle', REDO, 'Redo', onRedo);
  return (canUndo: boolean, canRedo: boolean) => {
    undo.classList.toggle('is-off', !canUndo);
    redo.classList.toggle('is-off', !canRedo);
  };
}
