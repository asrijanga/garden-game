import type { ArtStyle } from '../render/post';

const KEY = 'art-style';
const CHOICES: [ArtStyle, string, string][] = [
  ['painted', '🖌️', 'Painted'],
  ['sketch', '✏️', 'Sketch'],
];

/**
 * The garden's art style, under the weather chips: the usual painted look or the pencil-sketch
 * prototype. Remembered between visits.
 */
export function mountArtStylePicker(onChange: (s: ArtStyle) => void): ArtStyle {
  let current: ArtStyle = 'painted';
  try {
    const saved = localStorage.getItem(KEY) as ArtStyle | null;
    if (saved && CHOICES.some((c) => c[0] === saved)) current = saved;
  } catch {
    // no storage: painted
  }
  const row = document.createElement('div');
  row.className = 'weather-row style-row';
  const buttons = new Map<ArtStyle, HTMLButtonElement>();
  for (const [style, icon, label] of CHOICES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'weather-chip style-chip';
    b.innerHTML = `<span class="weather-icon">${icon}</span><span>${label}</span>`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      current = style;
      show();
      onChange(style);
      try {
        localStorage.setItem(KEY, style);
      } catch {
        // nothing to do
      }
    });
    buttons.set(style, b);
    row.append(b);
  }
  const show = () => {
    for (const [s, b] of buttons) b.classList.toggle('on', s === current);
  };
  document.querySelector('.time-dial')?.append(row);
  show();
  onChange(current);
  return current;
}
