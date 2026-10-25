import type { Ambience } from '../audio/ambience';

const STORAGE_KEY = 'garden.muted';

const ICON_ON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4z" fill="currentColor"/><path d="M15.2 9.2c1.6 1.5 1.6 4.1 0 5.6M17.6 6.8c2.9 2.8 2.9 7.6 0 10.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const ICON_OFF = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.2L12 5.6v12.8l-4.8-3.9H4z" fill="currentColor"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

function readMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  } catch {
    /* private mode: preference just won't persist */
  }
}

/**
 * Sound toggle (top-right, out of the way of the thumb zone) plus a soft one-time hint.
 * The first touch anywhere starts the ambience (iOS requires a gesture), and later touches
 * wake it if iOS paused it.
 */
export function mountSoundControls(ambience: Ambience) {
  let muted = readMuted();

  const button = document.createElement('button');
  button.className = 'sound-toggle';
  button.type = 'button';
  const render = () => {
    button.innerHTML = muted ? ICON_OFF : ICON_ON;
    button.setAttribute('aria-label', muted ? 'Turn sound on' : 'Turn sound off');
    button.classList.toggle('is-muted', muted);
  };
  render();

  const hint = document.createElement('div');
  hint.className = 'sound-hint';
  hint.textContent = 'Touch the garden to hear the wind';
  if (!muted) document.body.append(hint);
  document.body.append(button);
  requestAnimationFrame(() => hint.classList.add('show'));

  let hintGone = false;
  const onGesture = () => {
    if (!ambience.started) {
      ambience.start();
      ambience.setMuted(muted);
    } else {
      // iOS may have paused audio since (app switch, lock screen): every touch wakes it again.
      ambience.ensureRunning();
    }
    if (!hintGone) {
      hintGone = true;
      hint.classList.remove('show');
      setTimeout(() => hint.remove(), 800);
    }
  };
  // iPhone/iPad allow audio to start only from these gestures; listen on every one, not just the first.
  for (const type of ['touchend', 'pointerup', 'click', 'keydown']) {
    window.addEventListener(type, onGesture, { capture: true });
  }

  button.addEventListener('pointerdown', (e) => e.stopPropagation());
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    muted = !muted;
    writeMuted(muted);
    render();
    if (!ambience.started) ambience.start();
    ambience.setMuted(muted);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ambience.suspend();
    else ambience.resume();
  });
}
