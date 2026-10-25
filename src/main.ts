import * as THREE from 'three';
import './style.css';
import { Ground, CLEARING_RADIUS } from './world/ground';
import { createForest } from './world/trees';
import { CameraRig } from './core/cameraRig';
import { Cottage } from './world/cottage';
import { createWildflowers } from './world/wildflowers';
import { createMotes } from './world/motes';
import { FlyingBirds } from './world/flyingBirds';
import { currentSeason, PALETTES } from './world/season';
import { WindField, bindWind } from './render/wind';
import { PostFX } from './render/post';
import { Ambience } from './audio/ambience';
import { mountSoundControls } from './ui/soundButton';
import { Toolbar } from './ui/toolbar';
import { GroundPicker } from './core/groundPicker';
import { TouchMarker } from './world/touchMarker';
import { ToolController } from './game/tools';

const WORLD_SEED = 20261025;

// --- Keep iOS Safari from zooming, scrolling or selecting -------------------------------
for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// --- Renderer ---------------------------------------------------------------------------
const canvas = document.getElementById('world') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
// Neutral keeps the hand-picked palette's hues intact (ACES pushes everything orange-grey).
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

// Cap resolution: phones have 3x screens, but 1.75x plus post-processing looks just as soft
// and keeps us at 60fps.
const maxPixelRatio = 1.75;
const pixelRatio = () => Math.min(window.devicePixelRatio || 1, maxPixelRatio);

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

const ground = new Ground(WORLD_SEED, palette);
scene.add(ground.mesh);

// The cottage sits at the back of the clearing, tucked against the trees, facing the player.
const cottagePos = new THREE.Vector3(1.0, 0, -CLEARING_RADIUS + 3.6);
cottagePos.y = ground.heightAt(cottagePos.x, cottagePos.z) - 0.05;
const cottage = new Cottage(cottagePos, -0.18, palette, WORLD_SEED + 30);
scene.add(cottage.group);
scene.add(cottage.smokePoints);

scene.add(createForest(ground, palette, season, WORLD_SEED + 40, (x, z) => cottage.contains(x, z, 1.2)));

scene.add(createWildflowers(ground, palette.wildflowers, 1600, WORLD_SEED + 11, (x, z) => cottage.contains(x, z, 0.4)));

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
if (debug) Object.assign(window, { ambience, wind, flyingBirds });

// --- Tools: what your finger does -----------------------------------------------------------
const marker = new TouchMarker();
scene.add(marker.mesh);
const TOOL_PITCH = { move: 1, path: 0.9, flowers: 1.2, pond: 0.8, erase: 1.05 };
let tools: ToolController | null = null;
const toolbar = new Toolbar((tool) => {
  ambience.tap(TOOL_PITCH[tool]);
  tools?.setTool(tool);
});
tools = new ToolController(canvas, toolbar, rig, new GroundPicker(camera, canvas, (x, z) => ground.heightAt(x, z)), marker);

// --- Post-processing ----------------------------------------------------------------------
const post = new PostFX(renderer, scene, camera);

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
}
window.addEventListener('resize', resize);
resize();
started = true;

// --- Loop -----------------------------------------------------------------------------------
const timer = new THREE.Timer();
let elapsed = 0;

function frame(time: number) {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 1 / 20);
  elapsed += dt;

  wind.update(dt);
  cottage.update(dt, wind);
  flyingBirds.update(dt);
  marker.update(dt, rig.distance);
  (motes.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
  rig.update(dt);
  ambience.update(dt, wind.envelope, wind.sample(rig.target.x, rig.target.z));
  post.render(dt);
}

rig.update(0);
renderer.setAnimationLoop(frame);
requestAnimationFrame(() => canvas.classList.add('ready'));
