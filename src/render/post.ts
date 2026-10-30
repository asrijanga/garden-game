import * as THREE from 'three';

/**
 * A lean post pipeline for phones. The scene is rendered once (with MSAA) into a half-float
 * target, a soft bloom is built at quarter resolution or below (bright pass, then a short
 * dual-filter blur chain), and one final full-screen pass adds the bloom, tone maps, converts to
 * sRGB and applies the storybook grade. Only two passes touch every pixel.
 */

const fullscreenVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/** Bright pass + 4-tap downsample: keeps only what's brighter than the threshold. */
const brightFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uThreshold;
varying vec2 vUv;
vec3 bright(vec2 uv) {
  vec3 c = texture2D(tSrc, uv).rgb;
  float l = max(c.r, max(c.g, c.b));
  return c * smoothstep(uThreshold, uThreshold + 0.25, l);
}
void main() {
  vec2 o = uTexel * 1.0;
  vec3 c = bright(vUv + vec2(-o.x, -o.y)) + bright(vUv + vec2(o.x, -o.y)) + bright(vUv + vec2(-o.x, o.y)) + bright(vUv + vec2(o.x, o.y));
  gl_FragColor = vec4(c * 0.25, 1.0);
}`;

/** Dual-filter (Kawase) downsample. */
const downFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 o = uTexel;
  vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
  c += texture2D(tSrc, vUv - o).rgb;
  c += texture2D(tSrc, vUv + o).rgb;
  c += texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb;
  c += texture2D(tSrc, vUv - vec2(o.x, -o.y)).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}`;

/** Dual-filter (Kawase) upsample, added onto the finer level. */
const upFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform sampler2D tBase;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 o = uTexel;
  vec3 c = texture2D(tSrc, vUv + vec2(-o.x * 2.0, 0.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(0.0, o.y * 2.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(o.x, o.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(o.x * 2.0, 0.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb * 2.0;
  c += texture2D(tSrc, vUv + vec2(0.0, -o.y * 2.0)).rgb;
  c += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
  gl_FragColor = vec4(c / 12.0 + texture2D(tBase, vUv).rgb, 1.0);
}`;

/** Bloom + Khronos PBR Neutral tone mapping + sRGB + warm grade and vignette, in one pass. */
const finalFrag = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uBloom;
uniform vec3 uLift, uGain;
uniform float uSaturation, uVignette, uAspect;
uniform vec2 uTexel;
uniform float uSharpen;
varying vec2 vUv;
#ifdef STORYBOOK
uniform sampler2D tDepth;
uniform float uNear, uFar;
float viewZ(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  return uNear * uFar / (uFar - d * (uFar - uNear));
}
float grain(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float paperNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(grain(i), grain(i + vec2(1, 0)), f.x), mix(grain(i + vec2(0, 1)), grain(i + vec2(1, 1)), f.x), f.y);
}
#endif
vec3 neutral(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, pow(c, vec3(0.41666)) * 1.055 - 0.055, step(0.0031308, c));
}
void main() {
  // Gentle contrast-aware sharpening: the screen shows this image upscaled (phone screens are
  // 3x), so lift fine detail back, clamped to the neighbourhood so edges never ring or halo.
  vec3 c = texture2D(tScene, vUv).rgb;
  vec3 n = texture2D(tScene, vUv + vec2(0.0, uTexel.y)).rgb;
  vec3 s = texture2D(tScene, vUv - vec2(0.0, uTexel.y)).rgb;
  vec3 e = texture2D(tScene, vUv + vec2(uTexel.x, 0.0)).rgb;
  vec3 w = texture2D(tScene, vUv - vec2(uTexel.x, 0.0)).rgb;
  vec3 lo = min(c, min(min(n, s), min(e, w)));
  vec3 hi = max(c, max(max(n, s), max(e, w)));
  c = clamp(c + (c - (n + s + e + w) * 0.25) * uSharpen, lo, hi);
  c += texture2D(tBloom, vUv).rgb * uBloom;
#ifdef STORYBOOK
  {
    // Ink: where something stands in front of something further away, a fine line on the near
    // thing's edge, in a deeper shade of its own colour (as a painter outlines in sepia or
    // dark green, never black). From the depth alone, so it's as steady as the shapes are;
    // fading out into the distance, and kept off flat ground however low the view.
    float zc = viewZ(vUv);
    float zn = viewZ(vUv + vec2(0.0, uTexel.y));
    float zs = viewZ(vUv - vec2(0.0, uTexel.y));
    float ze = viewZ(vUv + vec2(uTexel.x, 0.0));
    float zw = viewZ(vUv - vec2(uTexel.x, 0.0));
    // A plane, even seen at a slant, has no curvature: only real steps in depth draw.
    float bend = max(abs(zn + zs - 2.0 * zc), abs(ze + zw - 2.0 * zc)) / zc;
    float behind = (max(max(zn, zs), max(ze, zw)) - zc) / zc;
    // (Up close the threshold drops, so petals lying over petals get their own outline.)
    float fine = mix(0.4, 1.0, smoothstep(0.8, 2.2, zc));
    float ink = smoothstep(0.018 * fine, 0.05 * fine, bend) * smoothstep(0.012 * fine, 0.04 * fine, behind);
    ink *= 1.0 - smoothstep(18.0, 60.0, zc);
    vec3 inkColour = c * vec3(0.3, 0.25, 0.22) + vec3(0.012, 0.008, 0.004);
    c = mix(c, inkColour, ink * 0.92);
  }
#endif
  c = toSRGB(clamp(neutral(c), 0.0, 1.0));
  // Lift shadows toward a warm brown so darks never go dead black.
  c = uLift * 0.35 + c * (uGain - uLift * 0.35);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSaturation);
#ifdef STORYBOOK
  {
    // Watercolour: high-key and airy (the darkest shade is a soft lavender, not black), cool in
    // the shade and warm in the light, a little richer in the mid-tones; on paper with a faint,
    // still grain (fixed to the page, like a painting's, so it never crawls).
    float t = dot(c, vec3(0.299, 0.587, 0.114));
    // Greens lean warm and fresh (yellow-green in the sun), shade leans blue-teal.
    float green = smoothstep(0.0, 0.12, c.g - max(c.r, c.b));
    c = mix(c, c * vec3(1.08, 1.03, 0.84), green * t * 0.9);
    // (Not on strong colours: a crimson rose's shaded heart deepens to crimson, not lavender-grey.)
    float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
    c = mix(c, c * vec3(0.86, 0.98, 1.14), (1.0 - smoothstep(0.08, 0.45, t)) * 0.7 * (1.0 - smoothstep(0.12, 0.4, chroma)));
    // Richer colour, airy values: lifted towards the paper, never to black. Colours already
    // vivid aren't pushed further (a red rose would clip to one flat red), and the brightest
    // values ease in under a soft shoulder rather than hitting the ceiling.
    float vivid = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
    c = mix(vec3(t), c, 1.0 + 0.15 * (1.0 - smoothstep(0.3, 0.7, vivid)));
    c = max(c, 0.0);
    c = mix(c, 0.8 + (c - 0.8) / (1.0 + (c - 0.8) * 3.0), step(0.8, c));
    c = 1.0 - (1.0 - clamp(c, 0.0, 1.0)) * 0.9;
    c = max(c, vec3(0.13, 0.12, 0.2) * (1.0 - t) + c * 0.0);
    vec2 px = gl_FragCoord.xy;
    float paper = paperNoise(px * 0.5) * 0.5 + paperNoise(px * 0.13) * 0.35 + paperNoise(px * 0.031) * 0.15;
    c *= 0.975 + paper * 0.05;
  }
#endif
  vec2 v = (vUv - 0.5) * vec2(uAspect, 1.0);
  float vig = smoothstep(0.95, 0.25, length(v) * 1.1);
  c *= mix(1.0 - uVignette, 1.0, vig);
  gl_FragColor = vec4(c, 1.0);
}`;

const LEVELS = 3; // bloom chain: 1/4, 1/8, 1/16 of full resolution

function target(w: number, h: number, samples = 0, depth = false) {
  const rt = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: THREE.HalfFloatType,
    samples,
    depthBuffer: samples > 0 || depth,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
  // (Set afterwards: given in the options, this version of three.js trips over it.)
  if (depth) rt.depthTexture = new THREE.DepthTexture(Math.max(1, w), Math.max(1, h));
  return rt;
}

function pass(frag: string, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({ vertexShader: fullscreenVert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
}

export class PostFX {
  private sceneRT: THREE.WebGLRenderTarget;
  private readonly bloomRTs: THREE.WebGLRenderTarget[] = [];
  private readonly upRTs: THREE.WebGLRenderTarget[] = [];
  private readonly quad: THREE.Mesh;
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly bright = pass(brightFrag, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0.92 } });
  private readonly down = pass(downFrag, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
  private readonly up = pass(upFrag, { tSrc: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() } });
  private readonly final = pass(finalFrag, {
    tScene: { value: null },
    tBloom: { value: null },
    uBloom: { value: 0.55 },
    uLift: { value: new THREE.Color('#2a1a10') },
    uGain: { value: new THREE.Color('#fff4e6') },
    uSaturation: { value: 1.08 },
    uVignette: { value: 0.22 },
    uAspect: { value: 1 },
    uTexel: { value: new THREE.Vector2(1, 1) },
    uSharpen: { value: 0.6 },
  });
  private samples = 4;
  bloomEnabled = true;
  private black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    /** The storybook look: ink lines (from the depth), paper and a watercolour grade. */
    private readonly storybook = false,
  ) {
    this.sceneRT = target(1, 1, this.samples, storybook);
    if (storybook) {
      this.final.defines.STORYBOOK = '';
      Object.assign(this.final.uniforms, { tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 100 } });
    }
    for (let i = 0; i < LEVELS; i++) {
      this.bloomRTs.push(target(1, 1));
      this.upRTs.push(target(1, 1));
    }
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.final);
    this.quad.frustumCulled = false;
    this.black.needsUpdate = true;
  }

  /** Draw this scene, through this camera, from now on (the garden, or a bouquet). */
  view(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene;
    this.camera = camera;
  }

  /** MSAA sample count for the scene (0 turns antialiasing off). */
  setSamples(samples: number) {
    if (samples === this.samples) return;
    this.samples = samples;
    const { width, height } = this.sceneRT;
    this.sceneRT.dispose();
    this.sceneRT = target(width, height, samples, this.storybook);
  }

  /** The colour grade (lift/gain/saturation) and bloom strength, e.g. for the time of day. */
  setGrade(lift: THREE.Color, gain: THREE.Color, saturation: number, bloom: number) {
    const u = this.final.uniforms;
    (u.uLift.value as THREE.Color).copy(lift);
    (u.uGain.value as THREE.Color).copy(gain);
    u.uSaturation.value = saturation;
    u.uBloom.value = bloom;
  }

  /** `screenRatio`: the screen's own pixel ratio (how much the picture will be stretched). */
  setSize(width: number, height: number, pixelRatio: number, screenRatio: number) {
    const w = Math.round(width * pixelRatio);
    const h = Math.round(height * pixelRatio);
    this.sceneRT.setSize(w, h);
    for (let i = 0; i < LEVELS; i++) {
      const k = 4 << i;
      this.bloomRTs[i].setSize(Math.ceil(w / k), Math.ceil(h / k));
      this.upRTs[i].setSize(Math.ceil(w / k), Math.ceil(h / k));
    }
    this.final.uniforms.uAspect.value = width / height;
    this.final.uniforms.uTexel.value.set(1 / w, 1 / h);
    // Sharpen more the more the screen will stretch the picture.
    const stretch = Math.max(1, (screenRatio || 1) / pixelRatio);
    this.final.uniforms.uSharpen.value = Math.min(1.0, 0.45 + (stretch - 1) * 0.6);
  }

  private blit(mat: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(to);
    this.renderer.render(this.quad, this.cam);
  }

  render(_delta: number) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.render(this.scene, this.camera);

    let bloomTex: THREE.Texture = this.black;
    // (No bloom in the storybook look: watercolour doesn't glow, and pale petals in warm light
    // would halo.)
    if (this.bloomEnabled && !this.storybook) {
      this.bright.uniforms.tSrc.value = this.sceneRT.texture;
      this.bright.uniforms.uTexel.value.set(1 / this.sceneRT.width, 1 / this.sceneRT.height);
      this.blit(this.bright, this.bloomRTs[0]);
      for (let i = 1; i < LEVELS; i++) {
        const src = this.bloomRTs[i - 1];
        this.down.uniforms.tSrc.value = src.texture;
        this.down.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        this.blit(this.down, this.bloomRTs[i]);
      }
      // Back up the chain, each level blurred and added onto the next finer one.
      let src = this.bloomRTs[LEVELS - 1];
      for (let i = LEVELS - 2; i >= 0; i--) {
        this.up.uniforms.tSrc.value = src.texture;
        this.up.uniforms.tBase.value = this.bloomRTs[i].texture;
        this.up.uniforms.uTexel.value.set(0.5 / src.width, 0.5 / src.height);
        this.blit(this.up, this.upRTs[i]);
        src = this.upRTs[i];
      }
      bloomTex = src.texture;
    }

    this.final.uniforms.tScene.value = this.sceneRT.texture;
    if (this.storybook) {
      const cam = this.camera as THREE.PerspectiveCamera;
      this.final.uniforms.tDepth.value = this.sceneRT.depthTexture;
      this.final.uniforms.uNear.value = cam.near;
      this.final.uniforms.uFar.value = cam.far;
    }
    this.final.uniforms.tBloom.value = bloomTex;
    this.blit(this.final, null);
  }
}
