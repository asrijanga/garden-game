import * as THREE from 'three';
import './style.css';
import { Ground, CLEARING_RADIUS } from './world/ground';
import { createForest } from './world/trees';
import { CameraRig } from './core/cameraRig';
import { Cottage } from './world/cottage';
import { Wildflowers } from './world/wildflowers';
import { GroundPaint } from './world/groundPaint';
import { Stones } from './world/stones';
import { EdgePlants } from './world/edgePlants';
import { Dust } from './world/dust';
import { PathBuilder } from './game/pathBuilder';
import { FlowerBrush } from './game/flowerBrush';
import { Flowers } from './world/flowers';
import { SPECIES } from './world/flowerSpecies';
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
import { StylePicker } from './ui/stylePicker';
import { Boulders } from './world/boulders';
import { RockBrush } from './game/rockBrush';
import { createMotes } from './world/motes';
import { FlyingBirds } from './world/flyingBirds';
import { currentSeason, PALETTES } from './world/season';
import { WindField, bindWind } from './render/wind';
import { PostFX } from './render/post';
import { Quality, TIERS, mountFpsMeter } from './render/quality';
import { Ambience } from './audio/ambience';
import { mountSoundControls } from './ui/soundButton';
import { Toolbar } from './ui/toolbar';
import { GroundPicker } from './core/groundPicker';
import { TouchMarker } from './world/touchMarker';
import { ToolController } from './game/tools';
import { GardenStore } from './game/garden';
import { regrow } from './core/regrow';
import { confirmCard } from './ui/confirm';
import { mountShotButton } from './ui/shotButton';

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
scene.add(new THREE.HemisphereLight(palette.sky, '#6b5a3a', 1.35));
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
const TOOL_PITCH = { move: 1, path: 0.9, fence: 0.95, flowers: 1.2, pond: 0.8, erase: 1.05 };
let tools: ToolController | null = null;
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
);
// Fences and hedges: posts knocked in with a wooden "tock", hedges rustling up.
const fences = new Fences((shape, at) => {
  if (shape === 'picketPost' || shape === 'logPost') {
    dust.puff(at, 3, 0.25);
    ambience.wood(1);
  } else if (shape === 'hedge') ambience.rustle();
  else if (shape === 'wallStone') ambience.stone(0.16);
  else ambience.wood(0.35);
});
scene.add(fences.group);
const fenceBuilder = new FenceBuilder(
  fences,
  wildflowers,
  (x, z) => ground.heightAt(x, z),
  (x, z) => paths.distanceToPaths(x, z),
  (x, z) => cottage.contains(x, z, 0.3) || ground.forestness(x, z) > 0.45 || ponds.contains(x, z, 0.3) || flowerBrush.distanceToBeds(x, z) < -0.1,
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
  (x, z) => cottage.contains(x, z, 0.5) || ground.forestness(x, z) > 0.45 || paths.distanceToPaths(x, z) < 1.0 || ponds.contains(x, z, -0.4),
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
    cottage.contains(x, z, 0.4) || ground.forestness(x, z) > 0.3 || paths.distanceToPaths(x, z) < 1.0 || flowerBrush.distanceToBeds(x, z) < 0.3,
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
document.addEventListener('visibilitychange', () => {
  if (document.hidden) store.save();
});
const stylePicker = new StylePicker((style, label) => {
  if (tools) tools.buildStyle = style;
  ambience.tap(1.1);
  toolbar.showLabel(label, 1600);
});
const picker = new FlowerPicker(flowerBrush.ordered(), (sp) => flowerBrush.inSeason(sp), (id, label) => {
  flowerBrush.selected = id;
  ambience.tap(1.3);
  toolbar.showLabel(label, 1800);
});
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
    fences: { erase: (x, z, r) => [...fenceBuilder.erase(x, z, r), ...boulders.erase(x, z, r)] },
    heightAt: (x, z) => ground.heightAt(x, z),
    occupied: (x, z) => cottage.contains(x, z, 0.4) || paths.distanceToPaths(x, z) < 1.0 || flowerBrush.distanceToBeds(x, z) < 0.15 || ponds.contains(x, z, 0.4),
  },
  (amount) => ambience.erase(amount),
);
if (debug) Object.assign(window, { ambience, wind, flyingBirds, paths, toolbar, flowerBrush, flowers, bees, rig, stones, ponds, pondBrush, fish, pondPlants, splash, eraser, wildflowers, renderer, scene, fences, fenceBuilder, boulders });
tools = new ToolController(
  canvas,
  toolbar,
  rig,
  new GroundPicker(camera, canvas, (x, z) => ground.heightAt(x, z)),
  marker,
  pathBrush,
  fenceBuilder,
  rockBrush,
  flowerBrush,
  pondBrush,
  eraser,
  (x, z) => ground.heightAt(x, z),
  (action) => store.add(action),
  (tool) => {
    picker.setVisible(tool === 'flowers');
    stylePicker.setVisible(tool === 'fence');
    document.body.classList.toggle('picking', tool === 'flowers' || tool === 'fence');
  },
);
const controller = tools;

// --- Post-processing ----------------------------------------------------------------------
const post = new PostFX(renderer, scene, camera);
if (debug) Object.assign(window, { post });

let started = false;
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
  scene.fog = new THREE.Fog(haze, full * 0.95, full * 2.3);
  post.setSize(w, h, pixelRatio());
  (motes.material as THREE.ShaderMaterial).uniforms.uPixelRatio.value = pixelRatio();
  cottage.setPixelRatio(pixelRatio());
  dust.setPixelRatio(pixelRatio(), h);
  splash.setPixelRatio(pixelRatio(), h);
}
window.addEventListener('resize', resize);
resize();
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
        controller.replay(saved[next++]);
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
  canvas.classList.add('ready');
  const loader = document.getElementById('loader');
  loader?.classList.add('done');
  setTimeout(() => loader?.remove(), 1000);
}
void rebuild();

// --- Loop -----------------------------------------------------------------------------------
const timer = new THREE.Timer();
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
    edgePlants.update(dt);
    flowers.update(dt);
    bees.update(dt);
    ponds.update(dt);
    fish.update(dt);
    pondPlants.update(dt);
    splash.update(dt);
    wildflowers.update(dt);
    dust.update(dt);
  }
  paint.update(dt);
  (motes.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
  rig.update(dt);
  ambience.update(dt, wind.envelope, wind.sample(rig.target.x, rig.target.z));
  const buzz = bees.buzzNear(camera.position);
  ambience.buzz(buzz.level, buzz.pitch);
  if (stones.busy || pondPlants.busy || fences.busy || boulders.busy) renderer.shadowMap.needsUpdate = true;
  post.render(dt);
}

rig.update(0);
renderer.setAnimationLoop(frame);
