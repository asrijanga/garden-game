import * as THREE from 'three';
import './style.css';
import { Ground, CLEARING_RADIUS } from './world/ground';
import { createForest } from './world/trees';
import { CameraRig } from './core/cameraRig';
import { Cottage, DEFAULT_STYLE, decodeStyle, encodeStyle } from './world/cottage';
import { CottagePanel } from './ui/cottagePanel';
import { Wildflowers } from './world/wildflowers';
import { createRng } from './core/random';
import { Meadow } from './world/meadow';
import { createForestFloor } from './world/forestFloor';
import { PerchingBirds, type Perch } from './world/perchingBirds';
import { Butterflies } from './world/butterflies';
import { Dragonflies } from './world/dragonflies';
import { Vines } from './world/vines';
import { Bunnies } from './world/bunnies';
import { Ducks } from './world/ducks';
import { Hummingbirds } from './world/hummingbirds';
import { FallingPetals } from './world/petals';
import { SeasonFx } from './world/seasonFx';
import { NightMagic } from './world/nightMagic';
import { TimeOfDay } from './world/timeOfDay';
import { mountTimeDial } from './ui/timeDial';
import { GroundPaint } from './world/groundPaint';
import { Stones } from './world/stones';
import { EdgePlants } from './world/edgePlants';
import { Dust } from './world/dust';
import { PathBuilder } from './game/pathBuilder';
import { FlowerBrush } from './game/flowerBrush';
import { Flowers } from './world/flowers';
import { SPECIES } from './world/flowerSpecies';
import { FlowerBook } from './ui/flowerBook';
import { FlowerPicker } from './ui/flowerPicker';
import { Bees } from './world/bees';
import { Ponds, createPondTexture } from './world/pond';
import { PondPlants } from './world/pondPlants';
import { Fish } from './world/fish';
import { Splash } from './world/splash';
import { PondBrush } from './game/pondBrush';
import { EraseBrush } from './game/eraseBrush';
import { FenceBuilder } from './game/fenceBuilder';
import { Fences } from './world/fences';
import { ChipPicker, BUILD_CHIPS, DECOR_CHIPS } from './ui/stylePicker';
import { Props } from './world/props';
import { PropBrush } from './game/propBrush';
import { Boulders } from './world/boulders';
import { RockBrush } from './game/rockBrush';
import { BridgeBuilder } from './game/bridgeBuilder';
import { createMotes } from './world/motes';
import { FlyingBirds } from './world/flyingBirds';
import { currentSeason, peekedSeason, PALETTES } from './world/season';
import { showSeasonPeek } from './ui/seasonPeek';
import { WindField, bindWind } from './render/wind';
import { PostFX } from './render/post';
import { Quality, TIERS, mountFpsMeter } from './render/quality';
import { Ambience } from './audio/ambience';
import { mountSoundControls } from './ui/soundButton';
import { Toolbar } from './ui/toolbar';
import { GroundPicker } from './core/groundPicker';
import { TouchMarker } from './world/touchMarker';
import { ToolController } from './game/tools';
import { GardenStore, type Action } from './game/garden';
import { regrow } from './core/regrow';
import { confirmCard } from './ui/confirm';
import { mountShotButton } from './ui/shotButton';
import { mountUndoButtons } from './ui/undoButtons';

const WORLD_SEED = 20261025;

// --- Keep iOS Safari from zooming, scrolling or selecting -------------------------------
for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener(
  'touchmove',
  (e) => {
    // The flower picker scrolls sideways; everything else stays perfectly still.
    if (!(e.target instanceof Element && e.target.closest('.flower-picker'))) e.preventDefault();
  },
  { passive: false },
);

// --- Renderer ---------------------------------------------------------------------------
const canvas = document.getElementById('world') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
// Neutral keeps the hand-picked palette's hues intact (ACES pushes everything orange-grey).
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// The sun, trees and cottage stand still, so the shadow map is only redrawn when something
// that casts a shadow moves (stones settling, reeds growing): a whole forest pass saved per frame.
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;

// Render resolution comes from the adaptive quality tier (phones have 3x screens; ~1.5x plus
// post-processing looks just as soft). Never above the screen's own.
let tierPixelRatio = 1.75;
const pixelRatio = () => Math.min(window.devicePixelRatio || 1, tierPixelRatio);

// --- World ------------------------------------------------------------------------------
const season = currentSeason();
const palette = PALETTES[season];
document.documentElement.dataset.season = season;

const scene = new THREE.Scene();
const haze = new THREE.Color(palette.fog);
scene.background = haze;

const wind = new WindField(WORLD_SEED + 20);
bindWind(wind);

// Warm, low afternoon sun from the front left, so the cottage glows and shadows fall behind.
const sunDir = new THREE.Vector3(-0.62, 0.62, 0.48).normalize();
const hemi = new THREE.HemisphereLight(palette.sky, '#6b5a3a', 1.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(palette.sun, 3.0);
sun.position.copy(sunDir).multiplyScalar(60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = sc.bottom = -24;
sc.right = sc.top = 24;
sc.near = 5;
sc.far = 140;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 4;
scene.add(sun);

const paint = new GroundPaint();
paint.attach(renderer);
const pondTexture = createPondTexture();
const ground = new Ground(WORLD_SEED, palette, paint.texture, pondTexture);
scene.add(ground.mesh);

// The cottage sits at the back of the clearing, tucked against the trees, facing the player.
const cottagePos = new THREE.Vector3(1.0, 0, -CLEARING_RADIUS + 3.6);
cottagePos.y = ground.heightAt(cottagePos.x, cottagePos.z) - 0.05;
const cottage = new Cottage(cottagePos, -0.18, palette, WORLD_SEED + 30);
scene.add(cottage.group);
scene.add(cottage.smokePoints);

scene.add(createForest(ground, palette, season, WORLD_SEED + 40, (x, z) => cottage.contains(x, z, 1.2)));
scene.add(createForestFloor(ground, season, WORLD_SEED + 45, (x, z) => cottage.contains(x, z, 1.5)));

const wildflowers = new Wildflowers(ground, palette.wildflowers, 1600, WORLD_SEED + 11, (x, z) => cottage.contains(x, z, 0.4));
scene.add(wildflowers.mesh);

const debug = new URLSearchParams(location.search).has('debug');
const flyingBirds = new FlyingBirds((x, z) => ground.heightAt(x, z), 60, debug ? 2 : 15);
scene.add(flyingBirds.mesh);

const motes = createMotes(140, WORLD_SEED + 12);
scene.add(motes);

// --- Camera: a diorama you hold in your hand ----------------------------------------------
const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 400);
const rig = new CameraRig(camera, canvas);

/** Distance at which the whole clearing fits the screen (the zoomed-out view). */
function fitDistance(aspect: number): number {
  const fitHalfWidth = CLEARING_RADIUS * 0.94;
  const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  return Math.max(fitHalfWidth / Math.tan(hHalf), (fitHalfWidth * 0.9) / Math.tan(vHalf));
}

// --- Sound: the wind you can hear ------------------------------------------------------------
const ambience = new Ambience(season);
mountSoundControls(ambience);

// --- Tools: what your finger does -----------------------------------------------------------
const marker = new TouchMarker();
scene.add(marker.mesh);
const TOOL_PITCH = { move: 1, path: 0.9, fence: 0.95, flowers: 1.2, pond: 0.8, decor: 1.1, erase: 1.05 };
let tools: ToolController | null = null;
let cottagePanelRef: CottagePanel | null = null; // made later; tool changes close it
const dust = new Dust();
scene.add(dust.points);
// Ponds come first: paths and beds steer round them.
const ponds = new Ponds(ground, pondTexture, palette, () => ambience.fill());
scene.add(ponds.group);
const pondPlants = new PondPlants();
scene.add(pondPlants.group);
const splash = new Splash();
scene.add(splash.points);
const fish = new Fish(ponds, splash, (size) => ambience.splash(size));
scene.add(fish.group);
const stones = new Stones((p, r, kind) => {
  if (kind === 'step') dust.puff(p, 4, r * 1.2);
  ambience.stone(kind === 'step' ? 0.3 : kind === 'rock' ? 0.14 : kind === 'shore' ? Math.min(0.3, r * 0.9) : 0.18);
});
scene.add(stones.group);
const edgePlants = new EdgePlants(palette.wildflowers);
scene.add(edgePlants.group);
const paths = new PathBuilder(
  ground,
  paint,
  stones,
  edgePlants,
  wildflowers,
  (x, z) => cottage.contains(x, z, 0.1) || ground.forestness(x, z) > 0.45 || ponds.contains(x, z, 1.0),
);

const flowers = new Flowers(SPECIES, () => ambience.bloom());
// Bees arrive from (and leave into) the woods round the clearing.
const bees = new Bees(
  () => flowers.openBlooms(),
  (angle) => {
    const r = ground.clearingRadius(angle) + 2;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    return new THREE.Vector3(x, ground.heightAt(x, z) + 1.5, z);
  },
);
scene.add(bees.group);
scene.add(flowers.group);
const flowerBrush = new FlowerBrush(
  ground,
  paint,
  flowers,
  wildflowers,
  season,
  (x, z) => cottage.contains(x, z, 0.3) || ground.forestness(x, z) > 0.4 || ponds.contains(x, z, 0.9),
  (x, z) => paths.distanceToPaths(x, z),
  stones,
  {
    // Deep middle, shallows, or the damp bank just outside the water.
    zone: (x, z) => {
      const d = ponds.waterDepth(x, z);
      if (d > 0.28) return 'deep';
      if (d > 0.03) return 'shallow';
      return d === 0 && ponds.contains(x, z, 0.7) && !ponds.contains(x, z, 0.05) ? 'bank' : null;
    },
    level: (x, z) => ponds.levelAt(x, z),
  },
);
// Fences and hedges: posts knocked in with a wooden "tock", hedges rustling up.
const fences = new Fences((shape, at) => {
  if (shape === 'picketPost' || shape === 'logPost') {
    dust.puff(at, 3, 0.25);
    ambience.wood(1);
  } else if (shape === 'hedge') ambience.rustle();
  else if (shape === 'wallStone') ambience.stone(0.16);
  else ambience.wood(0.35);
}, palette.snowy ? 0.75 : 0);
scene.add(fences.group);
// Climbers: roses, clematis and honeysuckle on fences, ivy over walls, roses and wisteria on the cottage.
const vines = new Vines(season);
scene.add(vines.group);
let cottageVines = '';
const growCottageVines = () => {
  // Only when they'd grow differently (a door colour change leaves the roses be).
  const paths = cottage.vinePaths();
  const key = paths.map((v) => v.kind + v.points.map((p) => p.toArray().map((n) => n.toFixed(2)).join()).join()).join('|');
  if (key === cottageVines && !(regrow.instant || regrow.offset > 0)) return;
  cottageVines = key;
  vines.removeOwner(-1, regrow.instant || regrow.offset > 0);
  for (const v of paths) vines.climb(v.points, { kind: v.kind, owner: -1, seed: v.seed, face: v.face, delay: 1.5, speed: v.kind === 'wisteria' ? 0.25 : 0.2 });
};
cottage.onBuilt = growCottageVines;
growCottageVines();
const fenceBuilder = new FenceBuilder(
  fences,
  wildflowers,
  (x, z) => ground.heightAt(x, z),
  (x, z) => paths.distanceToPaths(x, z),
  (x, z) => cottage.contains(x, z, 0.3) || ground.forestness(x, z) > 0.45 || ponds.contains(x, z, 0.3) || flowerBrush.distanceToBeds(x, z) < -0.1,
  vines,
);
// Rocks and boulders: a thud (deeper for bigger stones) and a puff of dust as each settles.
const boulders = new Boulders((at, size) => {
  dust.puff(at, Math.round(3 + size * 4), 0.3 + size * 0.4);
  ambience.stone(Math.min(0.6, 0.25 + size * 0.35));
});
scene.add(boulders.group);
const rockBrush = new RockBrush(
  boulders,
  wildflowers,
  (x, z) => ground.heightAt(x, z),
  (x, z) => cottage.contains(x, z, 0.5) || ground.forestness(x, z) > 0.45 || paths.distanceToPaths(x, z) < 0.8 || ponds.contains(x, z, -0.4),
);
// Arched footbridges across ponds.
const bridgeBuilder = new BridgeBuilder(
  fences,
  wildflowers,
  (x, z) => ground.heightAt(x, z),
  (x, z) => ponds.waterDepth(x, z),
  (why) => toolbar.showLabel(why, 2200),
);
// A path drawn across a fence opens a gate in it.
let pathTrail: THREE.Vector2[] = [];
const pathBrush = {
  begin(p: THREE.Vector3) {
    pathTrail = [new THREE.Vector2(p.x, p.z)];
    paths.begin(p);
  },
  extend(p: THREE.Vector3) {
    pathTrail.push(new THREE.Vector2(p.x, p.z));
    paths.extend(p);
  },
  end() {
    paths.end();
    fenceBuilder.repath(pathTrail);
    pathTrail = [];
  },
};
const pondBrush = new PondBrush(
  ponds,
  pondPlants,
  fish,
  stones,
  wildflowers,
  dust,
  season,
  (x, z) =>
    cottage.contains(x, z, 0.4) || ground.forestness(x, z) > 0.3 || paths.distanceToPaths(x, z) < 0.8 || flowerBrush.distanceToBeds(x, z) < 0.3,
);

const toolbar = new Toolbar((tool) => {
  ambience.tap(TOOL_PITCH[tool]);
  tools?.setTool(tool);
  if (tool === 'erase') toolbar.showLabel('Tidy up · hold for a new garden', 2600);
});
// Holding "Tidy up" offers a fresh start (after asking).
toolbar.onHold = (tool) => {
  if (tool !== 'erase') return;
  ambience.tap(0.7);
  void confirmCard('Start a new garden?', 'Everything you’ve made here will be cleared away. This can’t be undone.', 'Keep my garden', 'Start fresh').then((go) => {
    if (!go) return;
    store.clear();
    location.reload();
  });
};

// Your garden, remembered stroke by stroke.
const store = new GardenStore();
const saved = store.load();
addEventListener('pagehide', () => store.save());
// Coming back to the app: iOS may have thrown away the ground-paint canvas (paths' gravel, bed
// soil) or the WebGL context while we were in the background; put the paint back.
const restorePaint = () => {
  if (document.visibilityState === 'visible') paint.restore();
};
document.addEventListener('visibilitychange', restorePaint);
window.addEventListener('pageshow', restorePaint);
renderer.domElement.addEventListener('webglcontextrestored', () => {
  paint.restore(true);
  renderer.shadowMap.needsUpdate = true;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) store.save();
});
// Garden props: set down with a soft wooden thud.
const props = new Props((_kind, at, piece) => {
  if (piece) {
    ambience.wood(0.45); // a gazebo piece knocked into place
    return;
  }
  dust.puff(at, 4, 0.4);
  ambience.wood(0.8);
});
scene.add(props.group);
// Wind chimes ring softer the further the view is from them.
const ringChime = (freq: number, volume: number, at: THREE.Vector3) => {
  const d = at.distanceTo(camera.position);
  ambience.chime(freq, volume * Math.min(1, Math.max(0.12, 1.4 - d / 30)));
};
props.wind = wind;
props.onChime = ringChime;
cottage.onChime = ringChime;
const propBrush = new PropBrush(
  props,
  (x, z) => ground.heightAt(x, z),
  (x, z, reach) => paths.nearestPoint(x, z, reach),
  (x, z) => paths.distanceToPaths(x, z),
  (x, z) => ponds.waterDepth(x, z),
  (x, z) => cottage.contains(x, z, 0.4) || ground.forestness(x, z) > 0.4 || ponds.contains(x, z, 0.2),
  () => toolbar.showLabel('Not quite there: try open lawn', 1600),
);
const decorPicker = new ChipPicker(DECOR_CHIPS, (kind, label) => {
  propBrush.kind = kind;
  ambience.tap(1.15);
  toolbar.showLabel(label, 1400);
});
const stylePicker = new ChipPicker(BUILD_CHIPS, (style, label) => {
  if (tools) tools.buildStyle = style;
  ambience.tap(1.1);
  toolbar.showLabel(label, 1600);
});
const picker = new FlowerPicker(flowerBrush.ordered(), (sp) => flowerBrush.inSeason(sp), (id, label) => {
  flowerBrush.selected = id;
  ambience.tap(1.3);
  toolbar.showLabel(label, 1800);
});
// The flower book: every species to browse, blooming-now first.
const flowerBook = new FlowerBook(SPECIES, season, (id) => picker.pick(id));
picker.onBook = () => {
  ambience.tap(1.1);
  flowerBook.setVisible(true);
};
const eraser = new EraseBrush(
  {
    stones,
    flowers,
    edgePlants,
    pondPlants,
    ponds,
    paint,
    wildflowers,
    dust,
    paths,
    beds: flowerBrush,
    fences: { erase: (x, z, r) => [...fenceBuilder.erase(x, z, r), ...boulders.erase(x, z, r), ...props.erase(x, z, r)] },
    heightAt: (x, z) => ground.heightAt(x, z),
    occupied: (x, z) => cottage.contains(x, z, 0.4) || paths.distanceToPaths(x, z) < 0.8 || flowerBrush.distanceToBeds(x, z) < 0.15 || ponds.contains(x, z, 0.4),
  },
  (amount) => ambience.erase(amount),
);
// The untended meadow slowly fills with wildflowers while you play (remembered between visits);
// anything you build keeps them back, and they creep in again when it's cleared.
const meadow = new Meadow(ground, season, WORLD_SEED + 13, (x, z) =>
  cottage.contains(x, z, 0.5) || paths.distanceToPaths(x, z) < 0.85 || flowerBrush.distanceToBeds(x, z) < 0.25 || ponds.contains(x, z, 0.5) ||
  boulders.occupied(x, z, 0.3) || props.near(x, z, 0.5) || fences.postNear(x, z, 0.2) !== null);
scene.add(meadow.group);
const MEADOW_KEY = 'garden-meadow';
try {
  meadow.setGrown(Number(localStorage.getItem(MEADOW_KEY)));
} catch {
  // no storage: the meadow just starts afresh
}
setInterval(() => {
  try {
    localStorage.setItem(MEADOW_KEY, String(Math.floor(meadow.grown)));
  } catch {
    // nothing to do
  }
}, 10000);
// --- Creatures ----------------------------------------------------------------------------
// They come in from (and go back to) the woods round the clearing.
const fromTheWoods = (angle: number) => {
  const r = ground.clearingRadius(angle) + 2;
  const x = Math.cos(angle) * r;
  const z = Math.sin(angle) * r;
  return new THREE.Vector3(x, ground.heightAt(x, z) + 1.5, z);
};
// Where birds can sit, refreshed now and then (a few spots on open lawn, too).
let perchList: Perch[] = [];
let perchAge = Infinity;
const perchRng = createRng(WORLD_SEED + 60);
const perchesNow = () => {
  if (perchAge < 1.5) return perchList;
  perchAge = 0;
  perchList = [];
  fences.perches(perchList);
  props.perches(perchList);
  cottage.perches(perchList);
  for (let i = 0; i < 3; i++) {
    const a = perchRng() * Math.PI * 2;
    const r = Math.sqrt(perchRng()) * 14;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (ponds.contains(x, z, 0.5) || cottage.contains(x, z, 0.5) || boulders.occupied(x, z, 0.3)) continue;
    perchList.push({ pos: new THREE.Vector3(x, ground.heightAt(x, z), z), yaw: 0, alive: () => !ponds.contains(x, z, 0.2), ground: true });
  }
  return perchList;
};
const perchingBirds = new PerchingBirds(perchesNow, fromTheWoods, (at) => {
  const d = at.distanceTo(camera.position);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  ambience.chirp(Math.min(1, Math.max(0, 1.3 - d / 25)), THREE.MathUtils.clamp(at.clone().sub(camera.position).dot(right) / Math.max(d, 1), -0.8, 0.8));
});
scene.add(perchingBirds.group);
// Open bed flowers with their species, refreshed a few times a second (visitors pick favourites).
let headsCache: { pos: THREE.Vector3; species: string; color: THREE.Color }[] = [];
let headsAt = -Infinity;
const openHeads = () => {
  const now = performance.now();
  if (now - headsAt > 400) {
    headsCache = flowers.openHeads();
    headsAt = now;
  }
  return headsCache;
};
const butterflies = new Butterflies(season, {
  beds: openHeads,
  meadow: (rng) => meadow.randomBloom(rng),
  meadowCount: () => meadow.grown,
  stone: (rng) => stones.randomTop('step', rng),
  mud: (rng) => {
    const bodies = [...ponds.bodies.values()].filter((b) => b.filled && b.fillT >= 1);
    if (!bodies.length) return null;
    const body = bodies[Math.floor(rng() * bodies.length)];
    const rim = ponds.rim(body);
    if (!rim.length) return null;
    const v2 = ponds.cellPosition(rim[Math.floor(rng() * rim.length)], new THREE.Vector2());
    return new THREE.Vector3(v2.x, body.level + 0.015, v2.y);
  },
  edge: fromTheWoods,
  wind: () => new THREE.Vector2(wind.direction.x, wind.direction.y).multiplyScalar(0.3 + wind.sample(0, 0) * 0.5),
});
scene.add(butterflies.group);
const dragonflies = new Dragonflies(season, {
  bodies: () => [...ponds.bodies.values()].filter((b) => b.filled && b.fillT >= 1).map((b) => b.id),
  pointOn: (id, rng) => {
    const body = ponds.bodies.get(id);
    if (!body || !body.filled || !body.cells.length) return null;
    const v2 = new THREE.Vector2();
    for (let k = 0; k < 8; k++) {
      ponds.cellPosition(body.cells[Math.floor(rng() * body.cells.length)], v2);
      if (ponds.waterDepth(v2.x, v2.y) > 0.15) return new THREE.Vector3(v2.x, body.level, v2.y);
    }
    return null;
  },
  ripple: (x, z, k) => ponds.addRipple(x, z, k),
});
scene.add(dragonflies.group);

// Bunny families, now and then, out of the woods.
const bunnies = new Bunnies({
  heightAt: (x, z) => ground.heightAt(x, z),
  walkable: (x, z) =>
    ground.forestness(x, z) < 0.75 && !ponds.contains(x, z, 0.3) && !cottage.contains(x, z, 0.9) && !boulders.occupied(x, z, 0.2) &&
    flowerBrush.distanceToBeds(x, z) > -0.35 && !props.near(x, z, 0.5) && !fences.solidNear(x, z, 0.12),
  edge: (angle) => {
    const r = ground.clearingRadius(angle) + 1.8;
    return new THREE.Vector2(Math.cos(angle) * r, Math.sin(angle) * r);
  },
  wander: (rng) => {
    // Half the time, somewhere along the edge of a flower bed (for a nibble); else open lawn.
    const blooms = flowers.openBlooms();
    for (let k = 0; k < 8; k++) {
      let x: number;
      let z: number;
      if (blooms.length && rng() < 0.5) {
        const b = blooms[Math.floor(rng() * blooms.length)];
        const a = rng() * Math.PI * 2;
        x = b.x + Math.cos(a) * 0.9;
        z = b.z + Math.sin(a) * 0.9;
        const d = flowerBrush.distanceToBeds(x, z);
        if (d < -0.3 || d > 0.4) continue;
      } else {
        const a = rng() * Math.PI * 2;
        const r = Math.sqrt(rng()) * 15;
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
      }
      if (ground.forestness(x, z) < 0.3 && !ponds.contains(x, z, 0.5) && !cottage.contains(x, z, 1.2) && !boulders.occupied(x, z, 0.3)) return new THREE.Vector2(x, z);
    }
    return null;
  },
  inWoods: (x, z) => ground.forestness(x, z) > 0.55,
});
scene.add(bunnies.group);

// A duck family on any pond big enough for one.
const soundAt = (at: THREE.Vector3, reach: number) => {
  const d = at.distanceTo(camera.position);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  return { volume: Math.min(1, Math.max(0, 1.3 - d / reach)), pan: THREE.MathUtils.clamp(at.clone().sub(camera.position).dot(right) / Math.max(d, 1), -0.8, 0.8) };
};
const ducks = new Ducks({
  ponds: () => [...ponds.bodies.values()].filter((b) => b.filled && b.fillT >= 1).map((b) => ({ id: b.id, cells: b.cells.length })),
  waterPoint: (id, rng) => {
    const body = ponds.bodies.get(id);
    if (!body || !body.filled) return null;
    const v2 = new THREE.Vector2();
    for (let k = 0; k < 12; k++) {
      ponds.cellPosition(body.cells[Math.floor(rng() * body.cells.length)], v2);
      if (ponds.waterDepth(v2.x, v2.y) > 0.22 && !pondPlants.padNear(v2.x, v2.y, 0.35)) return v2.clone();
    }
    return null;
  },
  swimmable: (x, z) => ponds.waterDepth(x, z) > 0.12 && !pondPlants.padNear(x, z, 0.22),
  pondAt: (x, z) => ponds.bodyAt(x, z)?.id ?? null,
  level: (x, z) => ponds.levelAt(x, z),
  heightAt: (x, z) => ground.heightAt(x, z),
  bank: (x, z) => {
    // The nearest dry, clear grass, a little up from the water's edge.
    for (let r = 0.3; r < 5; r += 0.2) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2 + r;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (ponds.contains(px, pz, 0.25) || boulders.occupied(px, pz, 0.3) || cottage.contains(px, pz, 0.5) || fences.solidNear(px, pz, 0.2) || ground.forestness(px, pz) > 0.4) continue;
        return new THREE.Vector2(px, pz);
      }
    }
    return null;
  },
  woods: (x, z) => {
    const a = Math.atan2(z, x);
    const r = ground.clearingRadius(a) + 2;
    return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
  },
  reedsNear: (x, z, r) => pondPlants.reedNear(x, z, r),
  wake: (slot, x, z, yaw, k) => ponds.setWake(slot, x, z, yaw, k),
  splash: (x, y, z, n, p) => splash.burst(x, y, z, n, p),
  quack: (at, chick) => {
    const s = soundAt(at, 16);
    ambience.quack(s.volume, s.pan, chick);
  },
  wind: () => new THREE.Vector2(wind.direction.x, wind.direction.y).multiplyScalar(0.6 + wind.sample(0, 0) * 0.6),
  camera: () => camera.position,
});
scene.add(ducks.group);

// Hummingbirds, when there are flowers worth the trip.
const hummingbirds = new Hummingbirds(season, {
  beds: openHeads,
  edge: fromTheWoods,
  perches: perchesNow,
  camera: () => camera.position,
  chip: (at) => {
    const s = soundAt(at, 10);
    ambience.chip(s.volume, s.pan);
  },
});
scene.add(hummingbirds.group);

// Rose petals now and then drifting down on the breeze.
const petals = new FallingPetals(openHeads, (x, z) => ground.heightAt(x, z), () => new THREE.Vector2(wind.direction.x, wind.direction.y).multiplyScalar(0.2 + wind.sample(0, 0) * 0.5));
scene.add(petals.mesh);

// The air of the season: blossom petals, floating seeds, falling leaves, or snow.
const seasonFx = new SeasonFx(
  season,
  (x, z) => Math.max(ground.heightAt(x, z), ponds.levelAt(x, z) ?? -Infinity),
  () => new THREE.Vector2(wind.direction.x, wind.direction.y).multiplyScalar(0.25 + wind.sample(rig.target.x, rig.target.z) * 0.6),
  () => rig.target,
);
scene.add(seasonFx.group);

// After dark: pools of lamplight, fireflies over the flowers (not in winter), and stars.
const night = new NightMagic(
  (out) => {
    props.nightLights(out);
    cottage.nightLights(out);
  },
  (x, z) => ground.heightAt(x, z),
  (rng) => {
    const heads = openHeads();
    if (heads.length && rng() < 0.6) return heads[Math.floor(rng() * heads.length)].pos;
    return meadow.randomBloom(rng);
  },
  season !== 'winter',
);
scene.add(night.group);

// --- Time of day ---------------------------------------------------------------------------
// The light, haze, water and colour grade follow the sun dial (golden afternoon by default).
const timeOfDay = new TimeOfDay(palette);
const applyTime = (p: number) => {
  const l = timeOfDay.light(p);
  sun.color.copy(l.sun);
  sun.intensity = l.sunIntensity;
  sun.position.copy(l.sunDir).multiplyScalar(60);
  hemi.color.copy(l.sky);
  hemi.groundColor.copy(l.ground);
  hemi.intensity = l.skyIntensity;
  haze.copy(l.haze);
  mist = l.mist;
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.color.copy(haze);
    scene.fog.near = fogNear * mist;
    scene.fog.far = fogFar * (0.6 + 0.4 * mist);
  }
  post.setGrade(l.lift, l.gain, l.saturation, l.bloom);
  ponds.setLight(l.sunDir, l.sky, l.haze, l.glow, l.night);
  const dark = THREE.MathUtils.smoothstep(p, 0.68, 0.95);
  night.setNight(l.night, dark);
  props.setNight(l.night);
  cottage.setNight(l.night);
  renderer.shadowMap.needsUpdate = true;
};
if (debug) Object.assign(window, { ambience, wind, flyingBirds, paths, toolbar, flowerBrush, flowers, bees, rig, stones, ponds, pondBrush, fish, pondPlants, splash, eraser, wildflowers, meadow, perchingBirds, butterflies, dragonflies, vines, cottage, bunnies, ducks, hummingbirds, paint, petals, seasonFx, night, renderer, scene, fences, fenceBuilder, boulders, props, edgePlants });
tools = new ToolController(
  canvas,
  toolbar,
  rig,
  new GroundPicker(camera, canvas, (x, z) => ground.heightAt(x, z)),
  marker,
  pathBrush,
  fenceBuilder,
  rockBrush,
  bridgeBuilder,
  propBrush,
  flowerBrush,
  pondBrush,
  eraser,
  (x, z) => ground.heightAt(x, z),
  (action) => {
    store.add(action);
    redoStack.length = 0;
    refreshHistoryButtons();
  },
  (tool) => {
    cottagePanelRef?.setVisible(false);
    picker.setVisible(tool === 'flowers');
    stylePicker.setVisible(tool === 'fence');
    decorPicker.setVisible(tool === 'decor');
    document.body.classList.toggle('picking', tool === 'flowers' || tool === 'fence' || tool === 'decor');
  },
);
const controller = tools;
// Bunnies notice fingers: a tap with the hand makes one sit up and look; building beside them shoos them a few hops.
controller.onTouch = (p, tool, down) => {
  if (tool === 'move') {
    if (down && !ducks.tap(p.x, p.z) && !hummingbirds.tap(p) && !butterflies.tap(p)) bunnies.tap(p.x, p.z, camera.position);
  } else {
    bunnies.disturb(p.x, p.z);
    ducks.disturb(p.x, p.z);
    butterflies.disturb(p.x, p.z);
    hummingbirds.disturb(p.x, p.z);
  }
};

/** Rebuild one saved action: a stroke, or a change to the cottage's look. */
function replayAction(a: Action) {
  if (a.kind === 'cottage') cottage.setStyle(decodeStyle(a.style), !regrow.instant && regrow.offset === 0);
  else controller.replay(a);
}

// --- The cottage: tap it to give it a new look --------------------------------------------
const cottagePanel = new CottagePanel(
  () => cottage.style,
  (style, label) => {
    cottage.setStyle(style);
    // Anything growing where the cottage now reaches (a shed, a porch) steps aside.
    wildflowers.clearIf((x, z) => cottage.contains(x, z, 0.2));
    store.add({ kind: 'cottage', style: encodeStyle(style), points: [] });
    redoStack.length = 0;
    refreshHistoryButtons();
    const c = cottage.position;
    for (let i = 0; i < 6; i++) dust.puff(new THREE.Vector3(c.x + (Math.random() - 0.5) * 5, c.y + 0.2, c.z + (Math.random() - 0.5) * 4), 2, 0.4);
    ambience.bloom();
    toolbar.showLabel(label, 1400);
    renderer.shadowMap.needsUpdate = true;
  },
);
cottagePanelRef = cottagePanel;
{
  // A tap (not a drag) on the cottage opens its drawer; a tap anywhere else closes it.
  const ray = new THREE.Raycaster();
  let down: { x: number; y: number; t: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    down = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10 || performance.now() - down.t > 450) return;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObject(cottage.group, true).length > 0;
    if (hit && !cottagePanel.open) {
      picker.setVisible(false);
      stylePicker.setVisible(false);
      decorPicker.setVisible(false);
      cottagePanel.setVisible(true);
      document.body.classList.add('picking');
      ambience.tap(1.4);
      toolbar.showLabel('Your cottage: tap a chip to change it', 2200);
    } else if (!hit && cottagePanel.open) {
      cottagePanel.setVisible(false);
      tools?.setTool(toolbar.tool);
    }
  });
}

// --- Undo / redo ---------------------------------------------------------------------------
// The garden is its stroke list, so undoing is: drop the last stroke, put the garden back to
// untouched, and quietly replay the rest, settled at once (no build-up, no sounds).
const redoStack: Action[] = [];
function rebuildInstantly() {
  regrow.instant = true;
  ambience.quiet = true;
  for (const s of [paint, stones, edgePlants, paths, flowers, flowerBrush, ponds, pondPlants, fish, pondBrush, wildflowers, fences, fenceBuilder, boulders, rockBrush, bridgeBuilder, props, vines]) s.reset();
  cottage.setStyle(DEFAULT_STYLE, false);
  for (const a of store.actions) replayAction(a);
  flowers.update(10);
  for (let i = 0; i < 120; i++) {
    const d = 0.1;
    stones.update(d);
    fences.update(d);
    boulders.update(d);
    props.update(d);
    edgePlants.update(d);
    pondPlants.update(d);
    ponds.update(d);
    fish.update(d);
    wildflowers.update(d);
    meadow.update(d);
    paint.update(d);
    dust.update(d);
    splash.update(d);
  }
  regrow.instant = false;
  ambience.quiet = false;
  renderer.shadowMap.needsUpdate = true;
}
if (debug) Object.assign(window, { rebuildInstantly, cottageStyle: () => cottage.style, cottageDebug: () => { const p = cottage.position.clone(); p.y += 2; p.project(camera); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }; } });
const refreshHistory = mountUndoButtons(
  () => {
    const last = store.actions.pop();
    if (!last) return;
    redoStack.push(last);
    store.save();
    rebuildInstantly();
    // A puff where it was, and a soft brush of sound.
    const pts = last.points;
    for (let i = 0; i < pts.length; i += Math.max(2, Math.floor(pts.length / 12) * 2)) {
      dust.puff(new THREE.Vector3(pts[i], ground.heightAt(pts[i], pts[i + 1]), pts[i + 1]), 3, 0.5);
    }
    ambience.erase(0.6);
    toolbar.showLabel('Undone', 900);
    refreshHistoryButtons();
  },
  () => {
    const next = redoStack.pop();
    if (!next) return;
    // Redo plays it out again, just as it was first made.
    store.add(next);
    replayAction(next);
    ambience.tap(1.25);
    toolbar.showLabel('Redone', 900);
    refreshHistoryButtons();
  },
);
function refreshHistoryButtons() {
  refreshHistory(store.actions.length > 0, redoStack.length > 0);
}

// --- Post-processing ----------------------------------------------------------------------
const post = new PostFX(renderer, scene, camera);
if (debug) Object.assign(window, { post });

let started = false;
let fogNear = 30;
let fogFar = 70;
let mist = 1;
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const full = fitDistance(camera.aspect);
  rig.fit(full);
  if (!started) rig.distance = full;
  camera.updateProjectionMatrix();
  fogNear = full * 0.95;
  fogFar = full * 2.3;
  scene.fog = new THREE.Fog(haze, fogNear * mist, fogFar * (0.6 + 0.4 * mist));
  post.setSize(w, h, pixelRatio());
  (motes.material as THREE.ShaderMaterial).uniforms.uPixelRatio.value = pixelRatio();
  cottage.setPixelRatio(pixelRatio());
  night.setPixelRatio(pixelRatio());
  dust.setPixelRatio(pixelRatio(), h);
  splash.setPixelRatio(pixelRatio(), h);
}
window.addEventListener('resize', resize);
resize();
// (Once the post-processing and fog exist: the dial applies the saved time straight away.)
mountTimeDial(applyTime);
started = true;

// --- Adaptive quality: hold 60fps ------------------------------------------------------------
const params = new URLSearchParams(location.search);
const fixedTier = params.get('q');
const quality = new Quality(
  fixedTier !== null ? +fixedTier : 1, // 1.75×, climbing to 2× when the device keeps up
  (tier) => {
    tierPixelRatio = tier.pixelRatio;
    post.setSamples(tier.samples);
    post.bloomEnabled = tier.bloom;
    resize();
  },
  fixedTier !== null,
);
const fpsMeter = params.has('fps') ? mountFpsMeter(quality) : null;

// A picture of the garden to keep or share: rendered sharper than usual (no buttons), once.
let recentFps = 60;
mountShotButton(
  () => {
    const keep = tierPixelRatio;
    tierPixelRatio = Math.min(window.devicePixelRatio || 1, 3);
    resize();
    post.render(0);
    const url = canvas.toDataURL('image/jpeg', 0.92);
    tierPixelRatio = keep;
    resize();
    return { url, info: `q${quality.tier}-${Math.round(recentFps)}fps` };
  },
  () => ambience.tap(1.6),
  // Hidden extra: hold the camera button to peek at the garden in another season.
  () => {
    ambience.tap(1.2);
    showSeasonPeek(season, peekedSeason() !== null);
  },
);
if (debug) Object.assign(window, { quality, TIERS, store });

// Compile every shader up front (in parallel where supported), so the first pond or bed
// doesn't hitch while its material compiles.
const warmed = renderer.compileAsync(scene, camera).catch(() => {});

// --- Loading: a seed sprouts while shaders compile and the saved garden is rebuilt ------------
// The garden's own clock stands still meanwhile, so it regrows in front of you once the loader
// fades: stroke after stroke, a little apart.
let loading = true;
const loadStart = performance.now();
async function rebuild() {
  await Promise.race([warmed, new Promise((r) => setTimeout(r, 4000))]);
  const gap = Math.min(0.18, 3 / Math.max(1, saved.length));
  let next = 0;
  await new Promise<void>((done) => {
    const step = () => {
      const t0 = performance.now();
      // A slice of strokes per frame, so the sprout keeps moving.
      while (next < saved.length && performance.now() - t0 < 12) {
        regrow.offset = 0.3 + next * gap;
        replayAction(saved[next++]);
      }
      if (next < saved.length) requestAnimationFrame(step);
      else done();
    };
    step();
  });
  regrow.offset = 0;
  // Let the seed finish sprouting before the garden appears.
  const shown = performance.now() - loadStart;
  await new Promise((r) => setTimeout(r, Math.max(0, 2300 - shown)));
  loading = false;
  refreshHistoryButtons();
  canvas.classList.add('ready');
  const loader = document.getElementById('loader');
  loader?.classList.add('done');
  setTimeout(() => loader?.remove(), 1000);
}
void rebuild();

// --- Loop -----------------------------------------------------------------------------------
const timer = new THREE.Timer();
let shadowAge = 0;
let wasSettling = false;
let elapsed = 0;

function frame(time: number) {
  timer.update(time);
  const raw = timer.getDelta();
  const dt = Math.min(raw, 1 / 20);
  if (!loading) quality.frame(raw);
  fpsMeter?.(raw);
  if (raw > 0 && raw < 0.5) recentFps += (1 / raw - recentFps) * 0.02;
  elapsed += dt;

  wind.update(dt);
  cottage.update(dt, wind);
  flyingBirds.update(dt);
  marker.update(dt, rig.distance);
  if (!loading) {
    stones.update(dt);
    fences.update(dt);
    boulders.update(dt);
    props.update(dt);
    edgePlants.update(dt);
    flowers.update(dt);
    bees.update(dt);
    ponds.update(dt);
    fish.update(dt);
    pondPlants.update(dt);
    splash.update(dt);
    wildflowers.update(dt);
    meadow.update(dt);
    perchAge += dt;
    vines.update(dt);
    bunnies.update(dt);
    ducks.update(dt);
    hummingbirds.update(dt);
    petals.update(dt);
    seasonFx.update(dt);
    night.update(dt);
    perchingBirds.update(dt);
    butterflies.update(dt);
    dragonflies.update(dt);
    dust.update(dt);
  }
  paint.update(dt);
  (motes.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
  rig.update(dt);
  ambience.update(dt, wind.envelope, wind.sample(rig.target.x, rig.target.z));
  const buzz = bees.buzzNear(camera.position);
  const hum = hummingbirds.humNear(camera.position);
  // One soft buzz voice: the bees', or a hummingbird's higher, airier hum when one is closer.
  if (hum > buzz.level) ambience.buzz(hum * 0.7, 2.3);
  else ambience.buzz(buzz.level, buzz.pitch);
  // Shadows are drawn from the whole scene (the forest too), so while things settle they're
  // redrawn a few times a second rather than every frame, then once more when all is still.
  const settling = stones.busy || pondPlants.busy || fences.busy || boulders.busy || props.busy;
  shadowAge += dt;
  if ((settling && shadowAge > 0.12) || (wasSettling && !settling)) {
    renderer.shadowMap.needsUpdate = true;
    shadowAge = 0;
  }
  wasSettling = settling;
  post.render(dt);
}

rig.update(0);
renderer.setAnimationLoop(frame);
