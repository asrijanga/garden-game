import './style.css';
import { DEFAULT_STYLE, decodeStyle, encodeStyle, type CottageStyle } from './world/cottageStyle';
import { CottagePanel } from './ui/cottagePanel';
import { mountWeatherPicker } from './ui/weatherPicker';
import { clearAddress, linkFor, packGarden, sharedInAddress, unpackGarden } from './game/share';
import { mountVisitBanner } from './ui/visitBanner';
import { mountAdmire } from './ui/admire';
import { mountBedView } from './ui/bedView';
import { mountTimeDial } from './ui/timeDial';
import { MIX_ID, SPECIES, WATER_MIX_ID, type FlowerSpecies } from './world/flowerSpecies';
import { FlowerBook } from './ui/flowerBook';
import { FlowerPicker, icon } from './ui/flowerPicker';
import { ChipPicker, BUILD_CHIPS, DECOR_CHIPS, TidyPicker } from './ui/stylePicker';
import { currentSeason, peekedSeason, PALETTES } from './world/season';
import { showSeasonPeek } from './ui/seasonPeek';
import { mountFpsLabel } from './render/quality';
import { Ambience } from './audio/ambience';
import { mountSoundControls } from './ui/soundButton';
import { Toolbar, type Tool } from './ui/toolbar';
import { GardenStore, type Action } from './game/garden';
import { keepStorage, makeBackup, readBackup } from './game/backup';
import { confirmCard } from './ui/confirm';
import { mountShotButton } from './ui/shotButton';
import { mountUndoButtons } from './ui/undoButtons';
import { mountBunch } from './ui/bunch';
import { bouquetName, loadBunch, saveBunch, MAX_STEMS, type CutStem } from './game/bunch';
import { mountBouquetView } from './ui/bouquetView';
import type { PlantAmount } from './game/flowerBrush';
import type { WeatherKind } from './world/weather';
import { Link, proxied, type Port } from './engine/link';
import type { SurfaceEvent, World, WorldInit } from './engine/world';

/*
 * The page: buttons, menus, sound and saving. The garden itself (the 3D world, everything in it,
 * the building tools and the camera) runs in a worker and draws into the canvas from there, so
 * this thread only ever handles touches, buttons and sound. Where a worker can't draw (iOS before
 * 17), the same world runs here instead, through the same messages.
 */

// --- Keep iOS Safari from zooming, scrolling or selecting -------------------------------
for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener(
  'touchmove',
  (e) => {
    // The flower picker (and the rose colours above it) scroll sideways and the books' pages
    // scroll up and down; everything else stays perfectly still.
    if (!(e.target instanceof Element && e.target.closest('.flower-picker, .colour-bar, .book-body'))) e.preventDefault();
  },
  { passive: false },
);

const season = currentSeason();
const palette = PALETTES[season];
document.documentElement.dataset.season = season;
const params = new URLSearchParams(location.search);
const debug = params.has('debug');

// --- The world, and the line to it ----------------------------------------------------------
/**
 * The page's end of the line to the world. Until the world says it's ready, calls wait here;
 * if the worker can't draw, the line is moved over to a world on this page.
 */
class WorldPort implements Port {
  private target: Port | null = null;
  private waiting: [unknown, Transferable[] | undefined][] = [];
  private readonly listeners: ((e: MessageEvent) => void)[] = [];
  ready = false;

  postMessage(message: unknown, transfer?: Transferable[]) {
    if (this.target && this.ready) this.target.postMessage(message, transfer);
    else this.waiting.push([message, transfer]);
  }

  addEventListener(_type: 'message', f: (e: MessageEvent) => void) {
    this.listeners.push(f);
  }

  connect(port: Port) {
    this.target = port;
    this.ready = false;
    port.addEventListener('message', (e) => {
      for (const f of this.listeners) f(e);
    });
    (port as Partial<MessagePort>).start?.call(port);
  }

  /** The world is up: send what was waiting. */
  open() {
    this.ready = true;
    for (const [m, t] of this.waiting) this.target!.postMessage(m, t);
    this.waiting = [];
  }
}
const port = new WorldPort();
const handlers: Record<string, (...a: never[]) => unknown> = {};
const link = new Link(port, handlers);
/** The world, as far as the page is concerned: every call goes down the line. */
const world = link.proxy<World>('w');

let canvas = document.getElementById('world') as HTMLCanvasElement;

// --- Sound: the wind you can hear ------------------------------------------------------------
const ambience = new Ambience(season);
mountSoundControls(ambience);
// The world's sound cues (and its per-frame wind, buzz and mood) play here.
Object.assign(handlers, proxied('sound', ambience));

// --- Tools: what your finger does -----------------------------------------------------------
const TOOL_PITCH = { move: 1, path: 0.9, fence: 0.95, flowers: 1.2, pond: 0.8, decor: 1.1, erase: 1.05 };
const toolbar = new Toolbar((tool) => {
  ambience.tap(TOOL_PITCH[tool]);
  world.setTool(tool);
  if (tool === 'erase') toolbar.showLabel('Tidy up · hold for a new garden', 2600);
});
// Holding "Tidy up" offers a fresh start (after asking).
toolbar.onHold = (tool) => {
  if (tool !== 'erase') return;
  ambience.tap(0.7);
  void confirmCard('Start a new garden?', 'Everything you’ve made here will be cleared away. This can’t be undone.', 'Keep my garden', 'Start fresh').then((go) => {
    if (!go) return;
    store.clear();
    // Visiting someone's garden: "start fresh" goes back to your own.
    if (store.visiting) clearAddress();
    location.reload();
  });
};

// Your garden, remembered stroke by stroke.
const store = new GardenStore();
let saved = store.load();
// Opened from a share link? Then it's someone else's garden to visit (yours stays safe).
const shared = sharedInAddress();
// A garden link opened while the game is already showing (only the #fragment changes, so the
// page wouldn't load again by itself): load it properly.
addEventListener('hashchange', () => {
  if (sharedInAddress()) {
    store.save();
    location.reload();
  }
});
addEventListener('pagehide', () => store.save());
// Coming back to the app: iOS may have thrown away the ground-paint canvas (paths' gravel, bed
// soil) while we were in the background; put the paint back.
const restorePaint = () => {
  if (document.visibilityState === 'visible') world.restorePaint();
};
document.addEventListener('visibilitychange', restorePaint);
window.addEventListener('pageshow', restorePaint);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) store.save();
});

const redoStack: Action[] = [];
const added = (action: Action) => {
  store.add(action);
  redoStack.length = 0;
  refreshHistoryButtons();
};
handlers.action = ((action: Action) => added(action)) as (...a: never[]) => unknown;
handlers.label = ((text: string, ms?: number) => toolbar.showLabel(text, ms)) as (...a: never[]) => unknown;

const decorPicker = new ChipPicker(DECOR_CHIPS, (kind, label) => {
  world.setPropKind(kind);
  ambience.tap(1.15);
  toolbar.showLabel(label, 1400);
  tuckAway('decor');
});
const stylePicker = new ChipPicker(BUILD_CHIPS, (style, label) => {
  world.setBuildStyle(style);
  ambience.tap(1.1);
  toolbar.showLabel(label, 1600);
  tuckAway('fence');
});
/**
 * Once something's chosen, the chip row tucks away so the whole garden is free to draw on;
 * tapping the tool's button again brings it back (a reminder the first few times).
 */
let tuckHints = 0;
function tuckAway(tool: Tool) {
  window.setTimeout(() => {
    if (toolbar.tool !== tool) return;
    picker.setVisible(false);
    stylePicker.setVisible(false);
    decorPicker.setVisible(false);
    tidyPicker.setVisible(false);
    document.body.classList.remove('picking');
    if (tuckHints++ < 3) window.setTimeout(() => toolbar.showLabel('Tap the tool again to choose another', 2000), 1400);
  }, 350);
}
// In season first, then the rest.
const inSeason = (sp: FlowerSpecies) => sp.seasons.includes(season);
const ordered = [...SPECIES.filter(inSeason), ...SPECIES.filter((s) => !inSeason(s))];
const picker = new FlowerPicker(ordered, inSeason, (id, label, settled) => {
  world.setFlower(id);
  ambience.tap(1.3);
  toolbar.showLabel(label, 1800);
  if (settled) tuckAway('flowers');
});
// How much each touch plants: a drift (a bed), a clump, or exactly one flower.
const AMOUNTS: PlantAmount[] = ['drift', 'clump', 'one'];
const AMOUNT_HINT: Record<PlantAmount, string> = {
  drift: 'Drift · draw a flower bed',
  clump: 'Clump · lift your finger where it goes',
  one: 'One flower · lift your finger where it goes',
};
let amount: PlantAmount = 'drift';
picker.onAmount = () => {
  amount = AMOUNTS[(AMOUNTS.indexOf(amount) + 1) % AMOUNTS.length];
  picker.setAmount(amount);
  world.setAmount(amount);
  ambience.tap(1.2);
  toolbar.showLabel(AMOUNT_HINT[amount], 2200);
};
// The flower book: every species to browse, blooming-now first.
const flowerBook = new FlowerBook('Flower book', SPECIES.filter((s) => s.form.kind !== 'foliage'), season, (id) => picker.pick(id), [
  { id: MIX_ID, name: 'Seasonal mix', art: icon(null), note: 'what’s blooming' },
  { id: WATER_MIX_ID, name: 'Water mix', art: icon(null, true), note: 'for ponds' },
]);
const foliageBook = new FlowerBook('Foliage book', SPECIES.filter((s) => s.form.kind === 'foliage'), season, (id) => picker.pick(id));
picker.onFoliage = () => {
  ambience.tap(1.1);
  foliageBook.setVisible(true);
};
picker.onBook = () => {
  ambience.tap(1.1);
  flowerBook.setVisible(true);
};

// --- Wild growth: the meadow (its growth remembered between visits) and mowing it ----------
const MEADOW_KEY = 'garden-meadow';
const MOWN_KEY = 'garden-keep-mown';
const stored = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // no storage: it just starts afresh
  }
};
const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // nothing to do
  }
};
let keepMown = stored(MOWN_KEY) === '1';
handlers.meadow = ((grown: number) => remember(MEADOW_KEY, String(grown))) as (...a: never[]) => unknown;
const tidyPicker = new TidyPicker(
  () => {
    world.mow();
    ambience.erase(1);
    toolbar.showLabel(keepMown ? 'Mown, and kept that way' : 'Mown · it will grow back slowly', 2200);
    tuckAway('erase');
  },
  (on) => {
    keepMown = on;
    remember(MOWN_KEY, on ? '1' : '0');
    world.setKeepMown(on, 1 + Math.random() * 8);
    ambience.tap(on ? 1.2 : 0.9);
    toolbar.showLabel(on ? 'Kept mown: no wild growth' : 'Letting it grow wild again', 2200);
    tuckAway('erase');
  },
  keepMown,
  () => {
    ambience.tap(1.15);
    tuckAway('erase');
    saveBackup();
  },
  () => {
    ambience.tap(1.1);
    pickBackup.click();
  },
);
// --- Keeping the garden safe -------------------------------------------------------------------
// Ask the browser not to clear the save when space runs low (iOS otherwise may, after a while).
keepStorage();
/** A small file with the whole garden: to the share sheet (Save to Files) or a download. */
function saveBackup() {
  const file = makeBackup(store.actions, Number(stored(MEADOW_KEY)) || 0, keepMown);
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    nav.share({ files: [file] }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.append(a);
  a.click();
  toolbar.showLabel('Garden backed up', 2000);
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}
const pickBackup = document.createElement('input');
pickBackup.type = 'file';
pickBackup.accept = '.json,application/json';
pickBackup.style.display = 'none';
document.body.append(pickBackup);
pickBackup.addEventListener('change', async () => {
  const file = pickBackup.files?.[0];
  pickBackup.value = '';
  if (!file) return;
  let backup: Awaited<ReturnType<typeof readBackup>>;
  try {
    backup = await readBackup(file);
  } catch {
    toolbar.showLabel('That file isn’t a garden backup', 2600);
    return;
  }
  const go = await confirmCard('Restore this backup?', `It will replace the garden you have now (${backup.actions.length} things made). This can’t be undone.`, 'Not now', 'Restore');
  if (!go) return;
  store.replace(backup.actions);
  if (backup.meadow !== undefined) remember(MEADOW_KEY, String(backup.meadow));
  if (backup.keepMown !== undefined) remember(MOWN_KEY, backup.keepMown ? '1' : '0');
  clearAddress();
  location.reload();
});

// The world says which tool is in hand: show its chips.
handlers.toolChanged = ((tool: Tool) => {
  cottagePanel.setVisible(false);
  picker.setVisible(tool === 'flowers');
  stylePicker.setVisible(tool === 'fence');
  decorPicker.setVisible(tool === 'decor');
  tidyPicker.setVisible(tool === 'erase');
  document.body.classList.toggle('picking', tool === 'flowers' || tool === 'fence' || tool === 'decor' || tool === 'erase');
}) as (...a: never[]) => unknown;

// --- The cottage: tap it to give it a new look --------------------------------------------
/** The cottage's look: the last change saved, else as it was built. */
const cottageStyle = (): CottageStyle => {
  for (let i = store.actions.length - 1; i >= 0; i--) {
    const a = store.actions[i];
    if (a.kind === 'cottage') return decodeStyle(a.style);
  }
  return { ...DEFAULT_STYLE };
};
const cottagePanel = new CottagePanel(cottageStyle, (style, label) => {
  world.setCottageStyle(style);
  added({ kind: 'cottage', style: encodeStyle(style), points: [] });
  toolbar.showLabel(label, 1400);
});
// A tap on the garden: on the cottage opens its drawer; anywhere else closes it.
handlers.cottageTap = ((hit: boolean) => {
  if (hit && !cottagePanel.open) {
    picker.setVisible(false);
    stylePicker.setVisible(false);
    decorPicker.setVisible(false);
    tidyPicker.setVisible(false);
    cottagePanel.setVisible(true);
    document.body.classList.add('picking');
    ambience.tap(1.4);
    toolbar.showLabel('Your cottage: tap a chip to change it', 2200);
  } else if (!hit && cottagePanel.open) {
    cottagePanel.setVisible(false);
    world.setTool(toolbar.tool);
  }
}) as (...a: never[]) => unknown;

// --- Undo / redo ---------------------------------------------------------------------------
// The garden is its stroke list: undo drops the last stroke and the world rebuilds from the rest.
const refreshHistory = mountUndoButtons(
  () => {
    const last = store.actions.pop();
    if (!last) return;
    redoStack.push(last);
    store.save();
    world.undo([...store.actions], last);
    ambience.erase(0.6);
    toolbar.showLabel('Undone', 900);
    refreshHistoryButtons();
  },
  () => {
    const next = redoStack.pop();
    if (!next) return;
    // Redo plays it out again, just as it was first made.
    store.add(next);
    world.redo(next);
    ambience.tap(1.25);
    toolbar.showLabel('Redone', 900);
    refreshHistoryButtons();
  },
);
function refreshHistoryButtons() {
  refreshHistory(store.actions.length > 0, redoStack.length > 0);
}

// --- Time, weather, admiring ----------------------------------------------------------------
let dayTime = 0.55;
dayTime = mountTimeDial(
  (p) => {
    dayTime = p;
    world.setTime(p);
  },
  shared?.time ?? 0.55,
  shared?.time != null,
);
// Close to a bed: tapping one (looking round the garden) takes you there; back returns.
const bedView = mountBedView(() => {
  ambience.tap(0.95);
  world.leaveBed();
  bedView.show(false);
});
handlers.bed = ((count: number) => {
  ambience.tap(1.15);
  picker.setVisible(false);
  cottagePanel.setVisible(false);
  bedView.show(true);
  toolbar.showLabel(count > 1 ? 'Tap a flower to cut it · drag to walk round · pinch to lean in' : 'Tap it to cut it · drag to walk round · pinch to lean in', 3000);
}) as (...a: never[]) => unknown;
// Cutting: close to a bed, a tap on a plant cuts it into the bunch in your hand.
let bunch: CutStem[] = loadBunch();
const emptyHand = () => {
  bunch = [];
  saveBunch(bunch);
  bunchTray.set(bunch);
  world.handFull(false);
};
// Tied: the bunch becomes a bouquet, shown on its own until it's untied or given away.
const speciesName = (id: string) => SPECIES.find((s) => s.id === id)?.name ?? 'Leaf';
const bouquetView = mountBouquetView(
  {
    untie() {
      ambience.rustle(0.5);
      world.untie();
      bouquetView.hide();
    },
    done() {
      ambience.bloom();
      world.untie();
      bouquetView.hide();
      emptyHand();
      toolbar.showLabel('Given away, with love', 2200);
    },
  },
  'Give away',
);
handlers.bouquetReady = (() => bouquetView.ready()) as (...a: never[]) => unknown;
const bunchTray = mountBunch(
  () => {
    if (bunch.length < 3) return;
    ambience.rustle(0.8);
    const kinds = new Set(bunch.map((s) => s.species)).size;
    bouquetView.show(bouquetName(bunch, speciesName), `${bunch.length} stems · ${kinds === 1 ? 'one kind' : `${kinds} kinds`} · tied by hand`);
    world.tie(bunch);
  },
  () => {
    ambience.rustle(0.6);
    emptyHand();
  },
);
bunchTray.set(bunch);
world.handFull(bunch.length >= MAX_STEMS);
let cutHints = 0;
handlers.cut = ((stem: CutStem) => {
  bunch.push(stem);
  saveBunch(bunch);
  bunchTray.set(bunch, true);
  world.handFull(bunch.length >= MAX_STEMS);
  if (bunch.length === 1 && cutHints++ < 2) toolbar.showLabel('Cut · it will grow back · tap more to gather a bunch', 2400);
  else if (bunch.length >= MAX_STEMS) toolbar.showLabel('An armful: that’s all you can hold', 2200);
}) as (...a: never[]) => unknown;
// Admire mode: no buttons, just a slow drift round the garden.
mountAdmire(
  () => {
    world.admire(true);
    ambience.tap(1.05);
  },
  () => world.admire(false),
);
let weatherNow: WeatherKind = 'clear';
let firstWeather = true;
mountWeatherPicker(
  (w) => {
    weatherNow = w === 'rain' && palette.snowy ? 'clear' : w;
    world.setWeather(w, firstWeather);
    firstWeather = false;
  },
  (w) => !(w === 'rain' && palette.snowy),
  shared?.weather ?? null,
);
if (params.has('fps')) handlers.fps = mountFpsLabel() as (...a: never[]) => unknown;

// A picture of the garden to keep or share (drawn sharper than usual, no buttons).
mountShotButton(
  () => link.ask<{ blob: Blob; info: string }>('w.shot'),
  () => ambience.tap(1.6),
  // Hidden extra: hold the camera button to peek at the garden in another season.
  () => {
    ambience.tap(1.2);
    showSeasonPeek(season, peekedSeason() !== null);
  },
  () => shareLink(),
  () => toolbar.showLabel('Picture saved · garden link copied', 2600),
);

// --- Sharing: the garden as a link -----------------------------------------------------------
// Kept ready in the background (packing is async, but the share sheet must open inside the tap).
let shareData: string | null = null;
let sharedAt = -1;
const refreshShare = () => {
  if (store.changes === sharedAt) return;
  const at = store.changes;
  if (!store.actions.length) {
    shareData = null;
    sharedAt = at;
    return;
  }
  void packGarden(store.actions)
    .then((d) => {
      shareData = d;
      sharedAt = at;
    })
    .catch(() => {});
};
setInterval(refreshShare, 1500);
const shareLink = () => (shareData ? linkFor(shareData, dayTime, weatherNow) : null);
if (debug) Object.assign(window, { store, toolbar, link, world, shareLink, refreshShare });
/** Make a visited garden your own (after asking: it replaces yours). */
const keepVisit = async () => {
  ambience.tap(1.1);
  const go = await confirmCard('Keep this garden?', 'It will replace your own garden. This can’t be undone.', 'Not now', 'Keep it');
  if (!go) return false;
  store.visiting = false;
  store.save();
  clearAddress();
  toolbar.showLabel('It’s your garden now', 2200);
  return true;
};
const leaveVisit = () => {
  ambience.tap(0.9);
  clearAddress();
  location.reload();
};

// --- Touches on the garden go to the world ---------------------------------------------------
let rect = canvas.getBoundingClientRect();
function listen(el: HTMLCanvasElement) {
  const send = (type: string) => (e: PointerEvent | WheelEvent) => {
    if (type === 'pointerdown') {
      // Keep the finger even if it slides over a button.
      try {
        el.setPointerCapture((e as PointerEvent).pointerId);
      } catch {
        // (not a real pointer)
      }
    }
    if (type === 'wheel') e.preventDefault();
    const p = e as PointerEvent;
    const ev: SurfaceEvent = {
      clientX: e.clientX - rect.left,
      clientY: e.clientY - rect.top,
      pointerId: p.pointerId ?? 1,
      isPrimary: p.isPrimary ?? true,
      pointerType: p.pointerType ?? 'mouse',
      button: e.button,
      buttons: e.buttons,
      deltaY: (e as WheelEvent).deltaY ?? 0,
      timeStamp: e.timeStamp,
    };
    world.pointer(type, ev);
  };
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) el.addEventListener(type, send(type) as EventListener);
  el.addEventListener('wheel', send('wheel') as EventListener, { passive: false });
}
listen(canvas);
const resize = () => {
  rect = canvas.getBoundingClientRect();
  world.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
};
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);

// --- Starting the world ------------------------------------------------------------------------
const init = (): WorldInit => ({
  width: window.innerWidth,
  height: window.innerHeight,
  ratio: window.devicePixelRatio || 1,
  season,
  debug,
  fixedTier: params.get('q') !== null ? Number(params.get('q')) : null,
  fps: params.has('fps'),
  keepMown,
  meadowGrown: Number(stored(MEADOW_KEY)) || 0,
  time: dayTime,
});
/** Where the worker can't draw: the world runs on this page instead (same messages). */
async function runHere() {
  // The old canvas belongs to the worker now: draw on a fresh one.
  if (canvas.dataset.offscreen) {
    const fresh = canvas.cloneNode() as HTMLCanvasElement;
    delete fresh.dataset.offscreen;
    canvas.replaceWith(fresh);
    canvas = fresh;
    listen(canvas);
  }
  const { createWorld } = await import('./engine/world');
  const channel = new MessageChannel();
  port.connect(channel.port1);
  const calls: Record<string, (...a: never[]) => unknown> = {};
  const here = createWorld(canvas, new Link(channel.port2, calls), init());
  Object.assign(calls, proxied('w', here));
  port.open();
  if (debug) Object.assign(window, { inWorker: false });
}
let ticking = false;
handlers.ready = ((ownFrames: boolean) => {
  port.open();
  if (debug) Object.assign(window, { inWorker: true });
  // A worker without its own frame clock draws when this page does.
  if (!ownFrames && !ticking) {
    ticking = true;
    const tick = (time: number) => {
      requestAnimationFrame(tick);
      world.tick(time);
    };
    requestAnimationFrame(tick);
  }
}) as (...a: never[]) => unknown;
handlers.failed = ((why: string) => {
  console.warn('Drawing on the page instead of in a worker:', why);
  void runHere();
}) as (...a: never[]) => unknown;

const useWorker = !params.has('main') && typeof Worker !== 'undefined' && 'transferControlToOffscreen' in canvas;
if (useWorker) {
  const worker = new Worker(new URL('./engine/worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('error', () => {
    if (!port.ready) void runHere();
  });
  port.connect(worker);
  const offscreen = canvas.transferControlToOffscreen();
  canvas.dataset.offscreen = '1';
  worker.postMessage({ init: init(), canvas: offscreen }, [offscreen]);
} else void runHere();

// --- A home-screen app: cached on the first visit, so it opens (and plays) offline -----------
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// --- Loading: a seed sprouts while shaders compile and the saved garden is rebuilt ------------
// The garden's own clock stands still meanwhile, so it regrows in front of you once the loader
// fades: stroke after stroke, a little apart.
const loadStart = performance.now();
async function rebuild() {
  if (shared) {
    try {
      store.visit(await unpackGarden(shared.data));
      saved = store.actions;
      mountVisitBanner(keepVisit, leaveVisit);
    } catch {
      clearAddress();
      setTimeout(() => toolbar.showLabel('That garden link didn’t work: here’s yours', 3000), 2600);
    }
  }
  await link.ask('w.load', saved);
  // Let the seed finish sprouting before the garden appears.
  const shown = performance.now() - loadStart;
  await new Promise((r) => setTimeout(r, Math.max(0, 2300 - shown)));
  world.start();
  refreshHistoryButtons();
  canvas.classList.add('ready');
  const loader = document.getElementById('loader');
  loader?.classList.add('done');
  setTimeout(() => loader?.remove(), 1000);
}
void rebuild();
