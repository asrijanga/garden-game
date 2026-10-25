import * as THREE from 'three';
import './style.css';
import { Ground, CLEARING_RADIUS } from './world/ground';
import { createForest } from './world/forest';
import { Cottage } from './world/cottage';
import { createGrass, createWildflowers } from './world/grass';
import { createMotes } from './world/motes';
import { currentSeason, PALETTES } from './world/season';
import { WindField, bindWind } from './render/wind';
import { PostFX } from './render/post';

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
const cottagePos = new THREE.Vector3(1.0, 0, -CLEARING_RADIUS + 5.2);
cottagePos.y = ground.heightAt(cottagePos.x, cottagePos.z) - 0.05;
const cottage = new Cottage(cottagePos, -0.18, palette, WORLD_SEED + 30);
scene.add(cottage.group);
scene.add(cottage.smokePoints);

scene.add(createForest(ground, palette, WORLD_SEED + 40, (x, z) => cottage.contains(x, z, 1.2)));

const isSmallGpu = Math.min(screen.width, screen.height) * (window.devicePixelRatio || 1) < 900;
const blocked = (x: number, z: number) => cottage.contains(x, z, -0.3);
scene.add(createGrass(ground, isSmallGpu ? 28000 : 42000, WORLD_SEED + 10, blocked));
scene.add(createWildflowers(ground, palette.wildflowers, 900, WORLD_SEED + 11, (x, z) => cottage.contains(x, z, 0.4)));

const motes = createMotes(140, WORLD_SEED + 12);
scene.add(motes);

// --- Camera: looking down into the clearing like a diorama ------------------------------
const camera = new THREE.PerspectiveCamera(30, 1, 1, 400);
const target = new THREE.Vector3(0, 0.6, -1.2);
const pitch = THREE.MathUtils.degToRad(57);
let distance = 40;
const baseAzimuth = THREE.MathUtils.degToRad(8);

function fitDistance(aspect: number): number {
  const fitHalfWidth = CLEARING_RADIUS * 0.98;
  const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  return Math.max(fitHalfWidth / Math.tan(hHalf), (fitHalfWidth * 0.9) / Math.tan(vHalf));
}

function placeCamera(time: number) {
  // A slow, breathing sway so the scene feels alive (real camera controls arrive in Story 1.2).
  const azimuth = baseAzimuth + Math.sin(time * 0.045) * 0.12;
  camera.position.set(
    target.x + Math.sin(azimuth) * Math.cos(pitch) * distance,
    target.y + Math.sin(pitch) * distance,
    target.z + Math.cos(azimuth) * Math.cos(pitch) * distance,
  );
  camera.lookAt(target);
}

// --- Post-processing ----------------------------------------------------------------------
const post = new PostFX(renderer, scene, camera);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  distance = fitDistance(camera.aspect);
  camera.updateProjectionMatrix();
  scene.fog = new THREE.Fog(haze, distance * 0.95, distance * 2.3);
  post.setSize(w, h, pixelRatio());
  post.setFocus(0.48);
  (motes.material as THREE.ShaderMaterial).uniforms.uPixelRatio.value = pixelRatio();
  cottage.setPixelRatio(pixelRatio());
}
window.addEventListener('resize', resize);
resize();

// --- Loop -----------------------------------------------------------------------------------
const timer = new THREE.Timer();
let elapsed = 0;

function frame(time: number) {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 1 / 20);
  elapsed += dt;

  wind.update(dt);
  cottage.update(dt, wind);
  (motes.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;
  placeCamera(elapsed);
  post.render(dt);
}

placeCamera(0);
renderer.setAnimationLoop(frame);
requestAnimationFrame(() => canvas.classList.add('ready'));
