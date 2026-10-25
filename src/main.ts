import * as THREE from 'three';
import './style.css';
import { Terrain, ISLAND_RADIUS, createCliffStones } from './world/terrain';
import { createGrass, createWildflowers } from './world/grass';
import { createBackdrop } from './world/sky';
import { createMotes } from './world/motes';
import { windUniforms } from './render/wind';
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

// --- Scene ------------------------------------------------------------------------------
const scene = new THREE.Scene();
const haze = new THREE.Color('#f0d2b4');
scene.fog = new THREE.Fog(haze, 60, 160);

const backdrop = createBackdrop();
scene.add(backdrop);
const backdropUniforms = (backdrop.material as THREE.ShaderMaterial).uniforms;

// Low, warm sun from the upper left so the cliff face catches the light.
const sunDir = new THREE.Vector3(-0.8, 0.5, 0.3).normalize();

const hemi = new THREE.HemisphereLight('#cfe0f0', '#8a6a48', 1.5);
scene.add(hemi);

const sun = new THREE.DirectionalLight('#ffcf9a', 3.0);
sun.position.copy(sunDir).multiplyScalar(40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -14;
sun.shadow.camera.right = 14;
sun.shadow.camera.top = 14;
sun.shadow.camera.bottom = -14;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 90;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 4;
scene.add(sun);

const terrain = new Terrain(WORLD_SEED);
scene.add(terrain.mesh);
scene.add(createCliffStones(terrain, 140, WORLD_SEED + 13));

const isSmallGpu = Math.min(screen.width, screen.height) * (window.devicePixelRatio || 1) < 900;
scene.add(createGrass(terrain, isSmallGpu ? 22000 : 34000, WORLD_SEED + 10));
scene.add(createWildflowers(terrain, 700, WORLD_SEED + 11));

const motes = createMotes(160, WORLD_SEED + 12);
scene.add(motes);

// --- Camera: a diorama view that fits the island on any screen --------------------------
const camera = new THREE.PerspectiveCamera(26, 1, 1, 1000);
const target = new THREE.Vector3(0, -0.8, 0);
const pitch = THREE.MathUtils.degToRad(40);
let distance = 60;
let azimuth = THREE.MathUtils.degToRad(20);

function fitDistance(aspect: number): number {
  const fitRadius = ISLAND_RADIUS * 1.08;
  const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  return Math.max(fitRadius / Math.tan(hHalf), (fitRadius * 0.85) / Math.tan(vHalf));
}

function placeCamera() {
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
  scene.fog = new THREE.Fog(haze, distance * 0.9, distance * 2.2);
  post.setSize(w, h, pixelRatio());
  post.setFocus(0.5);
  backdropUniforms.uAspect.value = camera.aspect;
  (motes.material as THREE.ShaderMaterial).uniforms.uPixelRatio.value = pixelRatio();
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

  windUniforms.uTime.value = elapsed;
  backdropUniforms.uTime.value = elapsed;
  (motes.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed;

  // A slow, breathing drift so the diorama feels alive (camera controls arrive in Story 1.2).
  azimuth += dt * 0.025;
  placeCamera();

  post.render(dt);
}

placeCamera();
renderer.setAnimationLoop(frame);
requestAnimationFrame(() => canvas.classList.add('ready'));
