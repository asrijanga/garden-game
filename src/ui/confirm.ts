/** A soft confirmation card. Resolves true if the player chooses the action. */
export function confirmCard(title: string, text: string, keep: string, go: string): Promise<boolean> {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'confirm';
    root.innerHTML = `
      <div class="confirm-card" role="alertdialog" aria-modal="true">
        <h2></h2>
        <p></p>
        <div class="confirm-actions">
          <button type="button" class="confirm-keep"></button>
          <button type="button" class="confirm-go"></button>
        </div>
      </div>`;
    root.querySelector('h2')!.textContent = title;
    root.querySelector('p')!.textContent = text;
    root.querySelector('.confirm-keep')!.textContent = keep;
    root.querySelector('.confirm-go')!.textContent = go;
    const close = (answer: boolean) => {
      root.classList.remove('show');
      setTimeout(() => root.remove(), 260);
      resolve(answer);
    };
    // Touches here never reach the garden underneath.
    for (const type of ['pointerdown', 'pointermove', 'pointerup']) root.addEventListener(type, (e) => e.stopPropagation());
    root.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target === root) close(false);
    });
    root.querySelector('.confirm-keep')!.addEventListener('click', () => close(false));
    root.querySelector('.confirm-go')!.addEventListener('click', () => close(true));
    document.body.append(root);
    requestAnimationFrame(() => root.classList.add('show'));
  });
}
