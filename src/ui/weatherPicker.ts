import type { WeatherKind } from '../world/weather';

const KEY = 'weather';
const CHOICES: [WeatherKind, string, string][] = [
  ['clear', '☀️', 'Clear'],
  ['sunbeams', '⛅', 'Sunbeams'],
  ['rain', '🌧️', 'Rain'],
  ['mist', '🌫️', 'Mist'],
];

/**
 * A row of weather chips under the sun dial: clear, sunbeams through broken cloud, soft rain, or
 * rolling mist. The garden blends into the new weather, and remembers it.
 */
export function mountWeatherPicker(onChange: (w: WeatherKind) => void, allowed: (w: WeatherKind) => boolean, fromLink: string | null = null): WeatherKind {
  let current: WeatherKind = 'clear';
  try {
    // A shared garden opens in the weather it was shared in (without changing the player's own).
    const saved = (fromLink ?? localStorage.getItem(KEY)) as WeatherKind | null;
    if (saved && CHOICES.some((c) => c[0] === saved) && allowed(saved)) current = saved;
  } catch {
    // no storage: clear skies
  }
  const panel = document.querySelector('.time-dial');
  const row = document.createElement('div');
  row.className = 'weather-row';
  const buttons = new Map<WeatherKind, HTMLButtonElement>();
  for (const [kind, icon, label] of CHOICES) {
    if (!allowed(kind)) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'weather-chip';
    b.innerHTML = `<span class="weather-icon">${icon}</span><span>${label}</span>`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      current = kind;
      show();
      onChange(kind);
      try {
        localStorage.setItem(KEY, kind);
      } catch {
        // nothing to do
      }
    });
    buttons.set(kind, b);
    row.append(b);
  }
  const show = () => {
    for (const [k, b] of buttons) b.classList.toggle('on', k === current);
  };
  panel?.append(row);
  show();
  onChange(current);
  return current;
}
