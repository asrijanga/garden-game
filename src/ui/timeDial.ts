const SUN = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const MOON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
const KEY = 'time-of-day';
const MOMENTS: [number, string][] = [
  [0, 'Dawn'],
  [0.3, 'Morning'],
  [0.55, 'Golden afternoon'],
  [0.78, 'Dusk'],
  [1, 'Night'],
];

/**
 * A sun button beside the camera. Tap it for a sun dial: one slider from dawn mist through the
 * golden afternoon to dusk and moonlit night, with a name for the moment. Easy to sweep with a
 * thumb; the garden follows live, and remembers the time you left it at.
 */
export function mountTimeDial(onChange: (p: number) => void, initial = 0.55): number {
  let p = initial;
  try {
    const saved = Number(localStorage.getItem(KEY));
    if (localStorage.getItem(KEY) !== null && isFinite(saved)) p = Math.min(1, Math.max(0, saved));
  } catch {
    // no storage: start in the golden afternoon
  }
  const button = document.createElement('button');
  button.className = 'sound-toggle time-toggle';
  button.type = 'button';
  button.setAttribute('aria-label', 'Time of day');
  const panel = document.createElement('div');
  panel.className = 'time-dial';
  panel.innerHTML = `<div class="time-name"></div><input class="time-slider" type="range" min="0" max="1000" aria-label="Time of day" /><div class="time-ends"><span>Dawn</span><span>Night</span></div>`;
  const slider = panel.querySelector('input') as HTMLInputElement;
  const name = panel.querySelector('.time-name') as HTMLDivElement;
  const show = () => {
    button.innerHTML = p > 0.85 ? MOON : SUN;
    slider.value = String(Math.round(p * 1000));
    let best = MOMENTS[0];
    for (const m of MOMENTS) if (Math.abs(m[0] - p) < Math.abs(best[0] - p)) best = m;
    name.textContent = best[1];
  };
  button.addEventListener('pointerdown', (e) => e.stopPropagation());
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('show');
  });
  panel.addEventListener('pointerdown', (e) => e.stopPropagation());
  const save = () => {
    try {
      localStorage.setItem(KEY, String(p));
    } catch {
      // nothing to do
    }
  };
  const set = (v: number) => {
    p = Math.min(1, Math.max(0, v));
    show();
    onChange(p);
  };
  slider.addEventListener('input', () => set(Number(slider.value) / 1000));
  slider.addEventListener('change', save);
  // The dial follows the finger itself: tap anywhere on it to jump there, or slide along it.
  // (iOS Safari won't drag a native slider here: the page blocks touch scrolling, and a tap on
  // the track doesn't move the thumb.)
  const THUMB = 30;
  let dragging: number | null = null;
  const seek = (e: PointerEvent) => {
    const r = slider.getBoundingClientRect();
    set((e.clientX - r.left - THUMB / 2) / Math.max(1, r.width - THUMB));
  };
  slider.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = e.pointerId;
    try {
      slider.setPointerCapture(e.pointerId);
    } catch {
      // synthetic pointers can't be captured; moves still arrive while over the dial
    }
    seek(e);
  });
  slider.addEventListener('pointermove', (e) => {
    if (dragging === e.pointerId) seek(e);
  });
  const release = (e: PointerEvent) => {
    if (dragging !== e.pointerId) return;
    dragging = null;
    save();
  };
  slider.addEventListener('pointerup', release);
  slider.addEventListener('pointercancel', release);
  // Tap elsewhere to put the dial away.
  document.addEventListener('pointerdown', (e) => {
    if (!panel.contains(e.target as Node) && e.target !== button) panel.classList.remove('show');
  });
  document.body.append(button, panel);
  show();
  onChange(p);
  return p;
}
