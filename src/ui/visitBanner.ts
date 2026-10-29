/**
 * Shown while visiting a garden someone shared: a small note under the top buttons, with
 * "Keep it" (make it your own, after asking) and "Back to mine".
 */
export function mountVisitBanner(onKeep: () => Promise<boolean>, onLeave: () => void) {
  const root = document.createElement('div');
  root.className = 'visit-banner';
  root.innerHTML = `<span class="visit-text">🌿 Visiting a shared garden</span><button type="button" class="visit-keep">Keep it</button><button type="button" class="visit-leave">Back to mine</button>`;
  for (const type of ['pointerdown', 'pointermove', 'pointerup']) root.addEventListener(type, (e) => e.stopPropagation());
  root.querySelector('.visit-keep')!.addEventListener('click', (e) => {
    e.stopPropagation();
    void onKeep().then((kept) => {
      if (!kept) return;
      root.classList.remove('show');
      setTimeout(() => root.remove(), 300);
    });
  });
  root.querySelector('.visit-leave')!.addEventListener('click', (e) => {
    e.stopPropagation();
    onLeave();
  });
  document.body.append(root);
  requestAnimationFrame(() => root.classList.add('show'));
}
