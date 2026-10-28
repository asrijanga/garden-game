const ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.6 5.8 9.8 4h4.4l1.2 1.8H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.8a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12.3" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;

function dataUrlToBlob(url: string): Blob {
  const [head, body] = url.split(',');
  const type = /data:([^;]+)/.exec(head)?.[1] ?? 'image/jpeg';
  const bytes = atob(body);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes.charCodeAt(i);
  return new Blob([out], { type });
}

/**
 * A camera button beside the sound toggle. It captures the garden (just the world, no buttons)
 * at high resolution and opens the share sheet, so it can be saved to Photos or sent on;
 * where sharing files isn't supported, the picture downloads instead. The file name carries a
 * little debug info (quality tier and frame rate).
 */
export function mountShotButton(capture: () => { url: string; info: string }, onShutter: () => void, onLongPress: () => void = () => {}) {
  const button = document.createElement('button');
  button.className = 'sound-toggle shot-toggle';
  button.type = 'button';
  button.setAttribute('aria-label', 'Take a picture of your garden');
  button.innerHTML = ICON;
  document.body.append(button);

  // A long press (a hidden extra) does something else instead of taking a picture.
  let held = 0;
  let longPressed = false;
  button.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    longPressed = false;
    held = window.setTimeout(() => {
      longPressed = true;
      onLongPress();
    }, 650);
  });
  const release = () => clearTimeout(held);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('pointerleave', release);
  button.addEventListener('contextmenu', (e) => e.preventDefault());
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    if (longPressed) return;
    onShutter();
    // Capture and share synchronously, inside the tap: iOS only shows the share sheet then.
    const { url, info } = capture();
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const name = `garden-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${info}.jpg`;
    const file = new File([dataUrlToBlob(url)], name, { type: 'image/jpeg' });

    const flash = document.createElement('div');
    flash.className = 'shot-flash';
    document.body.append(flash);
    setTimeout(() => flash.remove(), 700);

    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      nav.share({ files: [file] }).catch(() => {
        /* the player closed the share sheet */
      });
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    document.body.append(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  });
}
