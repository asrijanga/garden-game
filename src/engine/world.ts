import * as THREE from 'three';
import { Cottage, DEFAULT_STYLE, decodeStyle, type CottageStyle } from '../world/cottage';
import { SPECIES } from '../world/flowerSpecies';
import { PALETTES, type Season } from '../world/season';
import { Quality, TIERS, fpsCounter } from '../render/quality';
import type { Ambience } from '../audio/ambience';
import type { Tool } from '../ui/toolbar';
import type { Action } from '../game/garden';
import { FlowerBrush, type PlantAmount } from '../game/flowerBrush';
import type { BuildStyle } from '../game/tools';
import type { PropKind } from '../world/props';
import type { WeatherKind } from '../world/weather';
import { Link } from './link';
import { nextFrame } from './env';
import type { PackedShape } from './shapes.worker';
import { Ground, CLEARING_RADIUS } from '../world/ground';
import { createForest } from '../world/trees';
import { CameraRig } from '../core/cameraRig';
import { Wildflowers } from '../world/wildflowers';
import { createRng } from '../core/random';
import { Meadow } from '../world/meadow';
import { createForestFloor } from '../world/forestFloor';
import { PerchingBirds, type Perch } from '../world/perchingBirds';
import { Butterflies } from '../world/butterflies';
import { Dragonflies } from '../world/dragonflies';
import { Vines } from '../world/vines';
import { Bunnies } from '../world/bunnies';
import { Ducks } from '../world/ducks';
import { Hummingbirds } from '../world/hummingbirds';
import { FallingPetals } from '../world/petals';
import { SeasonFx } from '../world/seasonFx';
import { NightMagic } from '../world/nightMagic';
import { Weather } from '../world/weather';
import { cullers, GardenBounds, View } from '../render/cull';
import { TimeOfDay } from '../world/timeOfDay';
import { GroundPaint } from '../world/groundPaint';
import { Stones } from '../world/stones';
import { EdgePlants } from '../world/edgePlants';
import { Dust } from '../world/dust';
import { PathBuilder } from '../game/pathBuilder';
import { Flowers } from '../world/flowers';
import { Bees } from '../world/bees';
import { Ponds, createPondTexture } from '../world/pond';
import { PondPlants } from '../world/pondPlants';
import { Fish } from '../world/fish';
import { Splash } from '../world/splash';
import { PondBrush } from '../game/pondBrush';
import { EraseBrush } from '../game/eraseBrush';
import { FenceBuilder } from '../game/fenceBuilder';
import { Fences } from '../world/fences';
import { Props } from '../world/props';
import { PropBrush } from '../game/propBrush';
import { Boulders } from '../world/boulders';
import { RockBrush } from '../game/rockBrush';
import { BridgeBuilder } from '../game/bridgeBuilder';
import { createMotes } from '../world/motes';
import { FlyingBirds } from '../world/flyingBirds';
import { WindField, bindWind } from '../render/wind';
import { PostFX } from '../render/post';
import { GroundPicker } from '../core/groundPicker';
import { TouchMarker } from '../world/touchMarker';
import { ToolController } from '../game/tools';
import { regrow } from '../core/regrow';

const WORLD_SEED = 20261025;

/** What the world needs to start: the screen, the season and settings from the page. */
export interface WorldInit {
  width: number;
  height: number;
  /** The screen's own pixel ratio. */
  ratio: number;
  season: Season;
  debug: boolean;
  /** `?q=`: a fixed quality tier (null: adapt). */
  fixedTier: number | null;
  /** `?fps`: report the frame rate. */
  fps: boolean;
  keepMown: boolean;
  meadowGrown: number;
  /** The time of day to open at (0 … 1). */
  time: number;
}

/** A touch (or mouse) on the garden, as the page saw it (relative to the canvas's corner). */
export interface SurfaceEvent {
  clientX: number;
  clientY: number;
  pointerId: number;
  isPrimary: boolean;
  pointerType: string;
  button: number;
  buttons: number;
  deltaY: number;
  /** When it happened (ms, the page's clock): messages may arrive a little later. */
  timeStamp: number;
}

type Listener = (e: SurfaceEvent & { type: string; preventDefault(): void; stopPropagation(): void }) => void;

/**
 * Stands in for the canvas as far as the camera and the tools are concerned: the page sends
 * every touch on the garden here, and it hands them on just as the canvas would have.
 */
class Surface {
  width = 1;
  height = 1;
  private readonly listeners = new Map<string, Set<Listener>>();

  get clientWidth() {
    return this.width;
  }

  get clientHeight() {
    return this.height;
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, x: 0, y: 0, width: this.width, height: this.height, right: this.width, bottom: this.height };
  }

  addEventListener(type: string, f: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(f);
  }

  removeEventListener(type: string, f: Listener) {
    this.listeners.get(type)?.delete(f);
  }

  // (The page holds on to the finger itself.)
  setPointerCapture() {}

  releasePointerCapture() {}

  dispatch(type: string, e: SurfaceEvent) {
    const ev = { ...e, type, preventDefault() {}, stopPropagation() {} };
    for (const f of this.listeners.get(type) ?? []) f(ev);
  }
}

export type World = ReturnType<typeof createWorld>;

/**
 * The garden itself: the 3D world, everything living in it, the building tools and the camera,
 * drawn into `canvas`. It runs in a worker where it can (so the page stays free for touches and
 * buttons), else on the page; either way it talks to the page only through `link`.
 */
export function createWorld(canvas: HTMLCanvasElement | OffscreenCanvas, link: Link, init: WorldInit) {
  const surface = new Surface();
  // --- Renderer ---------------------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas: canvas as HTMLCanvasElement, antialias: false, powerPreference: 'high-performance' });
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
  let screen = { width: init.width, height: init.height, ratio: init.ratio };
  const pixelRatio = () => Math.min(screen.ratio || 1, tierPixelRatio);

  // --- World ------------------------------------------------------------------------------
  const season = init.season;
  const palette = PALETTES[season];

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

  const debug = init.debug;
  const flyingBirds = new FlyingBirds((x, z) => ground.heightAt(x, z), 60, debug ? 2 : 15);
  scene.add(flyingBirds.mesh);

  const motes = createMotes(140, WORLD_SEED + 12);
  scene.add(motes);

  // --- Camera: a diorama you hold in your hand ----------------------------------------------
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 400);
  const rig = new CameraRig(camera, surface as unknown as HTMLElement);

  /** Distance at which the whole clearing fits the screen (the zoomed-out view). */
  function fitDistance(aspect: number): number {
    const fitHalfWidth = CLEARING_RADIUS * 0.94;
    const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    return Math.max(fitHalfWidth / Math.tan(hHalf), (fitHalfWidth * 0.9) / Math.tan(vHalf));
  }

  // --- Sound: the wind you can hear ------------------------------------------------------------
  // (Played on the page: here every cue is passed along.)
  const ambience = link.proxy<Ambience>('sound');

  // --- Tools: what your finger does -----------------------------------------------------------
  const marker = new TouchMarker();
  scene.add(marker.mesh);
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
    // A rock set down in the water plops in; everything else settles into the soil.
    if (kind !== 'step' && ponds.waterDepth(p.x, p.z) > 0.08) ambience.plop(Math.min(1, r * 2.5));
    else ambience.stone(kind === 'step' ? 0.3 : Math.min(0.3, r * 0.9));
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
    flowers,
    wildflowers,
    season,
    (x, z) => cottage.contains(x, z, 0.3) || ground.forestness(x, z) > 0.4 || ponds.contains(x, z, 0.9),
    (x, z) => paths.distanceToPaths(x, z),
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

  // The page's toolbar: which tool is in hand, and its floating label.
  const toolbar = {
    tool: 'move' as Tool,
    showLabel: (text: string, ms?: number) => link.call('label', text, ms),
  };
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    paint.restore(true);
    renderer.shadowMap.needsUpdate = true;
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
  flowerBrush.onPlace = (_x, _z, water) => (water ? ambience.plop(0.3) : ambience.pat());
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
  meadow.setGrown(init.meadowGrown);
  // Wild growth (the meadow and the lawn's wildflowers) can be mown away, and kept mown.
  const setKeepMown = (on: boolean) => {
    meadow.keepMown = on;
    wildflowers.keepMown = on;
  };
  let mownWild = false;
  const mow = () => {
    mownWild = true;
    meadow.mow();
    wildflowers.clearIf(() => true);
  };
  setKeepMown(init.keepMown);
  if (init.keepMown) mow();
  // The meadow's growth is remembered between visits (by the page).
  setInterval(() => link.call('meadow', Math.floor(meadow.grown)), 10000);
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
  // Rain, rolling mist, or sunbeams through broken cloud; it shades the day's light too.
  const weather = new Weather(!!palette.snowy);
  scene.add(weather.group);
  let dayTime = 0.55;
  const weatherWind = new THREE.Vector2();
  const lastSun = new THREE.Vector3(Infinity, 0, 0);
  let sunMoved = false;
  const applyTime = (p: number) => {
    dayTime = p;
    const l = timeOfDay.light(p);
    weather.shade(l);
    sun.color.copy(l.sun);
    sun.intensity = l.sunIntensity;
    sun.position.copy(l.sunDir).multiplyScalar(60);
    // The shadow map only holds depth: it needs redrawing when the sun moves, not when the light
    // merely changes colour (weather sweeping in, dusk tints).
    if (sun.position.distanceToSquared(lastSun) > 1e-4) {
      lastSun.copy(sun.position);
      sunMoved = true;
    }
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
  };
  if (debug) Object.assign(globalThis, { ambience, wind, flyingBirds, paths, toolbar, flowerBrush, flowers, bees, rig, stones, ponds, pondBrush, fish, pondPlants, splash, eraser, wildflowers, meadow, perchingBirds, butterflies, dragonflies, vines, cottage, bunnies, ducks, hummingbirds, paint, petals, seasonFx, night, weather, renderer, scene, camera, THREE, cullers, fences, fenceBuilder, boulders, props, edgePlants });
  tools = new ToolController(
    surface as unknown as HTMLElement,
    toolbar,
    rig,
    new GroundPicker(camera, surface, (x, z) => ground.heightAt(x, z)),
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
      actions.push(action);
      link.call('action', action);
    },
    (tool) => link.call('toolChanged', tool),
  );
  const controller = tools;
  // Bunnies notice fingers: a tap with the hand makes one sit up and look; building beside them shoos them a few hops.
  // Build sounds that follow your finger: gravel scrunching under a new path, a spade digging a
  // pond, plants patted into soil (or plopped into water), a pop as a decoration is picked up.
  const strokeSound = { x: 0, z: 0, travel: 0 };
  const STROKE_STEP: Partial<Record<Tool, number>> = { path: 0.32, pond: 0.5, flowers: 0.42 };
  controller.onTouch = (p, tool, down) => {
    const step = tool === 'flowers' && flowerBrush.amount !== 'drift' ? undefined : STROKE_STEP[tool];
    if (down) {
      strokeSound.travel = step ?? 0;
      if (tool === 'decor') ambience.pop();
    } else strokeSound.travel += Math.hypot(p.x - strokeSound.x, p.z - strokeSound.z);
    strokeSound.x = p.x;
    strokeSound.z = p.z;
    if (step && strokeSound.travel >= step) {
      strokeSound.travel = 0;
      if (tool === 'path') ambience.crunch();
      else if (tool === 'pond') ambience.dig();
      else if (ponds.waterDepth(p.x, p.z) > 0.05) ambience.plop(0.3);
      else ambience.pat();
    }
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

  // --- The cottage: tap it to give it a new look (the page opens its drawer) -------------------
  {
    // A tap (not a drag): on the cottage or not?
    const ray = new THREE.Raycaster();
    let down: { x: number; y: number; t: number } | null = null;
    surface.addEventListener('pointerdown', (e) => {
      down = e.isPrimary ? { x: e.clientX, y: e.clientY, t: e.timeStamp } : null;
    });
    surface.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10 || e.timeStamp - down.t > 450) return;
      ray.setFromCamera(new THREE.Vector2((e.clientX / screen.width) * 2 - 1, -(e.clientY / screen.height) * 2 + 1), camera);
      link.call('cottageTap', ray.intersectObject(cottage.group, true).length > 0);
    });
  }
  const setCottageStyle = (style: CottageStyle) => {
    cottage.setStyle(style);
    // Anything growing where the cottage now reaches (a shed, a porch) steps aside.
    wildflowers.clearIf((x, z) => cottage.contains(x, z, 0.2));
    const c = cottage.position;
    for (let i = 0; i < 6; i++) dust.puff(new THREE.Vector3(c.x + (Math.random() - 0.5) * 5, c.y + 0.2, c.z + (Math.random() - 0.5) * 4), 2, 0.4);
    ambience.bloom();
    renderer.shadowMap.needsUpdate = true;
  };

  // --- Undo / redo ---------------------------------------------------------------------------
  // The garden is its stroke list (kept by the page), so undoing is: put the garden back to
  // untouched, and quietly replay what remains, settled at once (no build-up, no sounds).
  function rebuildInstantly(actions: Action[]) {
    regrow.instant = true;
    ambience.quiet = true;
    for (const s of [paint, stones, edgePlants, paths, flowers, flowerBrush, ponds, pondPlants, fish, pondBrush, wildflowers, fences, fenceBuilder, boulders, rockBrush, bridgeBuilder, props, vines]) s.reset();
    cottage.setStyle(DEFAULT_STYLE, false);
    for (const a of actions) replayAction(a);
    // Mown this visit (or kept mown): the wildflowers stay mown through an undo.
    if (mownWild) wildflowers.clearIf(() => true);
    flowers.update(10);
    // Step everything on until it has all settled (at most 12 s of garden time).
    const settling = () =>
      stones.busy || fences.busy || boulders.busy || props.busy || edgePlants.busy || pondPlants.busy || ponds.busy || wildflowers.busy || paint.busy;
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
      if (!settling()) break;
    }
    regrow.instant = false;
    ambience.quiet = false;
    renderer.shadowMap.needsUpdate = true;
  }
  let actions: Action[] = [];
  if (debug) Object.assign(globalThis, { rebuildInstantly: () => rebuildInstantly(actions), cottageStyle: () => cottage.style });
  /** Undone: rebuild without the last stroke, with a puff where it was. */
  const undo = (remaining: Action[], last: Action) => {
    actions = remaining;
    rebuildInstantly(actions);
    const pts = last.points;
    for (let i = 0; i < pts.length; i += Math.max(2, Math.floor(pts.length / 12) * 2)) {
      dust.puff(new THREE.Vector3(pts[i], ground.heightAt(pts[i], pts[i + 1]), pts[i + 1]), 3, 0.5);
    }
  };
  /** Redone: it plays out again, just as it was first made. */
  const redo = (next: Action) => {
    actions.push(next);
    replayAction(next);
  };

  // --- Post-processing ----------------------------------------------------------------------
  const post = new PostFX(renderer, scene, camera);
  if (debug) Object.assign(globalThis, { post });

  let started = false;
  let fogNear = 30;
  let fogFar = 70;
  let mist = 1;
  function resize() {
    const { width: w, height: h } = screen;
    surface.width = w;
    surface.height = h;
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
    post.setSize(w, h, pixelRatio(), screen.ratio);
    (motes.material as THREE.ShaderMaterial).uniforms.uPixelRatio.value = pixelRatio();
    cottage.setPixelRatio(pixelRatio());
    night.setPixelRatio(pixelRatio());
    weather.setPixelRatio(pixelRatio());
    dust.setPixelRatio(pixelRatio(), h);
    splash.setPixelRatio(pixelRatio(), h);
  }
  resize();
  applyTime(init.time);
  started = true;
  // Admire mode: no buttons, just a slow drift round the garden.
  let admiring = false;
  let admireTime = 0;

  // --- Adaptive quality: hold 60fps ------------------------------------------------------------
  const quality = new Quality(
    init.fixedTier ?? 1, // 1.75×, climbing to 2× when the device keeps up
    (tier) => {
      tierPixelRatio = tier.pixelRatio;
      post.setSamples(tier.samples);
      post.bloomEnabled = tier.bloom;
      resize();
    },
    init.fixedTier !== null,
  );
  const fpsMeter = init.fps ? fpsCounter(quality, (text) => link.call('fps', text)) : null;
  if (debug) Object.assign(globalThis, { quality, TIERS });

  /** A picture of the garden to keep or share: rendered sharper than usual, once. */
  let recentFps = 60;
  const shot = async (): Promise<{ blob: Blob; info: string }> => {
    const keep = tierPixelRatio;
    tierPixelRatio = Math.min(screen.ratio || 1, 3);
    resize();
    post.render(0);
    // Read it back before the picture is resized again.
    const c = canvas as HTMLCanvasElement | OffscreenCanvas;
    const pending =
      'convertToBlob' in c
        ? c.convertToBlob({ type: 'image/jpeg', quality: 0.92 })
        : new Promise<Blob>((resolve) => (c as HTMLCanvasElement).toBlob((b) => resolve(b!), 'image/jpeg', 0.92));
    const blob = await pending;
    tierPixelRatio = keep;
    resize();
    return { blob, info: `q${quality.tier}-${Math.round(recentFps)}fps` };
  };

  // Compile every shader up front (in parallel where supported), so the first pond or bed
  // doesn't hitch while its material compiles.
  const warmed = renderer.compileAsync(scene, camera).catch(() => {});

  // --- Plant shapes, built ahead of time in a worker of their own -------------------------------
  // (So the first bed of a kind doesn't hitch while its shapes are made. Without the worker, they
  // are simply made when first planted, as before.)
  const prepareShapes = () => {
    try {
      const shapes = new Worker(new URL('./shapes.worker.ts', import.meta.url), { type: 'module' });
      const unpack = (p: PackedShape) => {
        const g = new THREE.BufferGeometry();
        for (const [name, a] of Object.entries(p.attributes)) g.setAttribute(name, new THREE.BufferAttribute(a.array, a.itemSize));
        g.userData = p.userData;
        return g;
      };
      shapes.addEventListener('message', (e: MessageEvent<{ key: string; near: PackedShape; far: PackedShape }>) => {
        flowers.adopt(e.data.key, unpack(e.data.near), unpack(e.data.far));
      });
      shapes.postMessage(Flowers.wanted(season));
    } catch {
      // No workers from here: shapes are made when first planted.
    }
  };

  // --- Loading: the saved garden is rebuilt while shaders compile -------------------------------
  // The garden's own clock stands still meanwhile, so it regrows in front of you once the loader
  // fades: stroke after stroke, a little apart.
  let loading = true;
  async function load(saved: Action[]) {
    actions = saved;
    await Promise.race([warmed, new Promise((r) => setTimeout(r, 4000))]);
    const gap = Math.min(0.18, 3 / Math.max(1, saved.length));
    let next = 0;
    await new Promise<void>((done) => {
      const step = () => {
        const t0 = performance.now();
        // A slice of strokes per frame, so the page's sprout keeps moving.
        while (next < saved.length && performance.now() - t0 < 12) {
          regrow.offset = 0.3 + next * gap;
          replayAction(saved[next++]);
        }
        if (next < saved.length) setTimeout(step, 0);
        else done();
      };
      step();
    });
    regrow.offset = 0;
    prepareShapes();
  }
  // --- Loop -----------------------------------------------------------------------------------
  const timer = new THREE.Timer();
  const view = new View();
  const gardenBounds = new GardenBounds([flowers.group, stones.group, edgePlants.group, fences.group, vines.group, boulders.group, props.group, pondPlants.group]);
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
      if (weather.update(dt, camera, rig.target, weatherWind.set(wind.direction.x, wind.direction.y).multiplyScalar(0.3 + wind.sample(rig.target.x, rig.target.z) * 0.7))) applyTime(dayTime);
      ambience.setRain(weather.raining);
      ambience.setMood({ time: dayTime, night: Math.min(1, Math.max(0, (dayTime - 0.78) / 0.22)), rain: weather.raining, wet: weather.wetness, ponds: ponds.bodies.size > 0 });
      // Creatures keep the hours (and the weather) real ones would.
      {
        const sm = THREE.MathUtils.smoothstep;
        const rain = weather.raining;
        const dark = sm(dayTime, 0.8, 0.92);
        const dawn = 1 - sm(dayTime, 0.05, 0.3);
        // Insects need warmth and light: out from mid-morning to early evening, never in rain.
        const insects = sm(dayTime, 0.06, 0.25) * (1 - sm(dayTime, 0.7, 0.84)) * (1 - rain);
        bees.activity = butterflies.activity = hummingbirds.activity = dragonflies.activity = insects;
        // Birds: busiest at dawn, quieter in rain, roosting at night.
        perchingBirds.activity = flyingBirds.activity = (1 - dark) * (1 + 0.6 * dawn) * (1 - 0.8 * rain);
        // Bunnies: out most at dawn and dusk, a few by day, hardly at night, never in rain.
        const twilight = Math.max(dawn, sm(dayTime, 0.6, 0.74) * (1 - sm(dayTime, 0.86, 0.95)));
        bunnies.activity = (0.55 + 0.45 * twilight) * (1 - 0.8 * dark) * (1 - rain);
        // Ducks doze at night and perk up in the rain.
        ducks.activity = (1 - 0.8 * dark) * (1 + 0.4 * rain);
      }
      perchingBirds.update(dt);
      butterflies.update(dt);
      dragonflies.update(dt);
      dust.update(dt);
    }
    paint.update(dt);
    (motes.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
    if (admiring) {
      // Admire: a slow turn round the garden, drifting across the clearing and easing between a
      // wide view and a closer, lower one. It eases in from wherever the view was.
      admireTime += dt;
      const ease = Math.min(1, admireTime / 2);
      const k = Math.min(1, dt * 0.25) * ease;
      rig.azimuth += dt * 0.06 * ease;
      const breathe = 0.5 + 0.5 * Math.sin(admireTime * 0.07 - Math.PI / 2);
      rig.distance += (THREE.MathUtils.lerp(rig.maxDistance * 0.5, rig.maxDistance * 0.88, breathe) - rig.distance) * k;
      rig.target.x += (Math.sin(admireTime * 0.045) * 3 - rig.target.x) * k;
      rig.target.z += (-1.2 + Math.sin(admireTime * 0.033) * 2.5 - rig.target.z) * k;
    }
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
    if (((settling || sunMoved) && shadowAge > 0.12) || (wasSettling && !settling)) {
      renderer.shadowMap.needsUpdate = true;
      sunMoved = false;
      shadowAge = 0;
    }
    wasSettling = settling;
    // Only what's in view is drawn (trees, ferns, the meadow), except that a shadow redraw needs
    // every tree: those just off screen still cast shadows onto it.
    view.update(camera, rig.distance);
    gardenBounds.update();
    flowers.updateDetail(camera.position);
    const shadows = renderer.shadowMap.needsUpdate;
    for (const c of cullers) {
      if (shadows && c.casts) c.showAll();
      else c.update(view);
    }
    post.render(dt);
  }

  rig.update(0);
  // Frames come from this thread's own clock where it has one (a worker may not): otherwise the
  // page sends a tick each time it draws.
  const ownFrames = typeof requestAnimationFrame === 'function';
  if (ownFrames) {
    const loop = (time: number) => {
      nextFrame(loop);
      frame(time);
    };
    nextFrame(loop);
  }

  // --- What the page can ask of the world ------------------------------------------------------
  return {
    ownFrames,
    tick: (time: number) => {
      if (!ownFrames) frame(time);
    },
    pointer: (type: string, e: SurfaceEvent) => surface.dispatch(type, e),
    resize: (width: number, height: number, ratio: number) => {
      screen = { width, height, ratio };
      resize();
    },
    setTool: (tool: Tool) => {
      toolbar.tool = tool;
      controller.setTool(tool);
    },
    setBuildStyle: (style: BuildStyle) => (controller.buildStyle = style),
    setPropKind: (kind: PropKind) => (propBrush.kind = kind),
    setFlower: (id: string) => (flowerBrush.selected = id),
    setAmount: (amount: PlantAmount) => {
      flowerBrush.amount = amount;
      controller.refreshMarker();
    },
    mow,
    setKeepMown: (on: boolean, creep: number) => {
      setKeepMown(on);
      if (on) mow();
      else {
        // Let it go wild again: the wildflowers creep back over the open lawn, a few at a time.
        mownWild = false;
        wildflowers.restoreIf((x, z) => !(cottage.contains(x, z, 0.4) || paths.distanceToPaths(x, z) < 0.8 || flowerBrush.distanceToBeds(x, z) < 0.15 || ponds.contains(x, z, 0.4)), creep);
      }
    },
    setCottageStyle,
    undo,
    redo,
    setTime: applyTime,
    setWeather: (w: WeatherKind, instant: boolean) => {
      weather.set(w, instant);
      applyTime(dayTime);
    },
    admire: (on: boolean) => {
      admiring = on;
      // A sharper tier is tried only when not admiring (the switch itself shows as a hitch).
      quality.holdSteady = on;
      admireTime = 0;
    },
    restorePaint: () => paint.restore(),
    shot,
    load,
    /** The page has shown its loading sprout long enough: the garden's clock starts. */
    start: () => (loading = false),
  };
}
