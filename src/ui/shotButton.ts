const ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.6 5.8 9.8 4h4.4l1.2 1.8H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.8a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12.3" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;

/**
 * A camera button beside the sound toggle. It captures the garden (just the world, no buttons)
 * at high resolution and opens the share sheet with a link to the garden itself, so the picture
 * can be saved to Photos, or sent on and the garden visited;
 * where sharing files isn't supported, the picture downloads instead. (If the share sheet won't
 * open once the picture is ready, because the tap was too long ago, a card offers it again.) The file name carries a
 * little debug info (quality tier and frame rate).
 */
export function mountShotButton(
  /** Draws the picture (in the world's thread, so it arrives a moment later). */
  capture: () => Promise<{ blob: Blob; info: string }>,
  onShutter: () => void,
  onLongPress: () => void = () => {},
  /** A link to the garden itself, sent along with the picture (null if there's nothing yet). */
  link: () => string | null = () => null,
  /** Where there's no share sheet: the picture downloaded and the link went to the clipboard. */
  onCopied: () => void = () => {},
) {
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
    const flash = document.createElement('div');
    flash.className = 'shot-flash';
    document.body.append(flash);
    setTimeout(() => flash.remove(), 700);
    void capture().then(({ blob, info }) => {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const name = `garden-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${info}.jpg`;
      deliver(new File([blob], name, { type: 'image/jpeg' }));
    });
  });

  const deliver = (file: File) => {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    const gardenUrl = link();
    const text = gardenUrl ? `Come and see my garden 🌷 ${gardenUrl}` : undefined;
    const data: ShareData = text ? { files: [file], text } : { files: [file] };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      nav.share(data).catch((err: DOMException) => {
        // Too long after the tap for the share sheet: offer it on a card, one more tap away.
        if (err?.name === 'NotAllowedError') offer(() => nav.share(data).catch(() => {}));
        // (Otherwise the player closed the share sheet.)
      });
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    document.body.append(a);
    a.click();
    if (gardenUrl) void navigator.clipboard?.writeText(gardenUrl).then(onCopied, () => {});
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  };

  const offer = (share: () => void) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'shot-offer';
    card.textContent = 'Share picture';
    card.addEventListener('pointerdown', (e) => e.stopPropagation());
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      card.remove();
      share();
    });
    document.body.append(card);
    setTimeout(() => card.remove(), 8000);
  };
}
