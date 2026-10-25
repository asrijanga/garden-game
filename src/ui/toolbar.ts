import { ICONS } from './icons';

export type Tool = 'move' | 'path' | 'flowers' | 'pond' | 'erase';

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'move', label: 'Look around' },
  { id: 'path', label: 'Path' },
  { id: 'flowers', label: 'Flowers' },
  { id: 'pond', label: 'Pond' },
  { id: 'erase', label: 'Tidy up' },
];

/**
 * Thumb-reach toolbar: big, tactile buttons in a frosted tray at the bottom of the screen.
 * The active tool lifts and glows, with its name floating just above the tray.
 */
export class Toolbar {
  tool: Tool = 'move';
  private readonly buttons = new Map<Tool, HTMLButtonElement>();
  private readonly label: HTMLDivElement;
  private labelTimer = 0;

  constructor(private readonly onChange: (tool: Tool) => void) {
    const tray = document.createElement('nav');
    tray.className = 'toolbar';
    tray.setAttribute('aria-label', 'Garden tools');

    this.label = document.createElement('div');
    this.label.className = 'tool-label';

    for (const t of TOOLS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tool';
      b.dataset.tool = t.id;
      b.setAttribute('aria-label', t.label);
      b.innerHTML = `<span class="tool-face">${ICONS[t.id]}</span>`;
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        b.classList.remove('bounce');
        void b.offsetWidth; // restart the squash animation
        b.classList.add('bounce');
      });
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.select(t.id);
      });
      this.buttons.set(t.id, b);
      tray.append(b);
    }
    document.body.append(this.label, tray);
    this.select('move', false);
  }

  select(tool: Tool, notify = true) {
    this.tool = tool;
    for (const [id, b] of this.buttons) {
      b.classList.toggle('active', id === tool);
      b.setAttribute('aria-pressed', String(id === tool));
    }
    const def = TOOLS.find((t) => t.id === tool)!;
    this.showLabel(def.label);
    if (notify) this.onChange(tool);
  }

  showLabel(text: string, ms = 1600) {
    this.label.textContent = text;
    this.label.classList.add('show');
    clearTimeout(this.labelTimer);
    this.labelTimer = window.setTimeout(() => this.label.classList.remove('show'), ms);
  }
}
