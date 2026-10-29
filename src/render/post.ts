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
  c = toSRGB(clamp(neutral(c), 0.0, 1.0));
  // Lift shadows toward a warm brown so darks never go dead black.
  c = uLift * 0.35 + c * (uGain - uLift * 0.35);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSaturation);
  vec2 v = (vUv - 0.5) * vec2(uAspect, 1.0);
  float vig = smoothstep(0.95, 0.25, length(v) * 1.1);
  c *= mix(1.0 - uVignette, 1.0, vig);
  gl_FragColor = vec4(c, 1.0);
}`;

/**
 * The pencil-sketch look (a prototype art style): graphite outlines found from depth (silhouettes)
 * and colour (inner detail), drawn twice with a hand's wobble and redrawn ~8 times a second like
 * hand-drawn animation; hatching in the shadows, cross-hatching in the darkest; and a light wash of
 * colour on cream paper with a visible tooth.
 */
const sketchFrag = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform vec3 uLift, uGain;
uniform float uSaturation, uAspect, uNear, uFar, uTime, uLine;
uniform vec2 uTexel;
varying vec2 vUv;
${finalFrag.slice(finalFrag.indexOf('vec3 neutral'), finalFrag.indexOf('void main'))}
float sHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), f.x), mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float lin(vec2 uv) {
  float d = texture2D(tDepth, uv).r;
  return uNear * uFar / (uFar - d * (uFar - uNear));
}
float tone(vec3 c) {
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return l / (l + 0.6);
}
/** How strongly a pencil line belongs here: a jump in depth (an outline) or in tone (detail). */
float edge(vec2 uv, float r) {
  vec2 o = uTexel * r;
  vec2 a = vec2(o.x, o.y), b = vec2(o.x, -o.y);
  float dc = lin(uv);
  float dd = (abs(lin(uv + a) - lin(uv - a)) + abs(lin(uv + b) - lin(uv - b))) / dc;
  float outline = smoothstep(0.012, 0.05, dd);
  float tl = abs(tone(texture2D(tScene, uv + a).rgb) - tone(texture2D(tScene, uv - a).rgb))
           + abs(tone(texture2D(tScene, uv + b).rgb) - tone(texture2D(tScene, uv - b).rgb));
  float detail = smoothstep(0.06, 0.18, tl);
  // Far things are drawn lightly, the way an artist lets the background go.
  float near = smoothstep(120.0, 40.0, dc);
  return max(outline, detail * 0.6) * mix(0.35, 1.0, near);
}
/** One set of hatching lines across the screen at an angle, slightly wavering. */
float hatch(vec2 px, vec2 dir, float spacing, float boil) {
  float s = dot(px, dir) / spacing + sNoise(px * 0.03 + boil * 1.7) * 0.7;
  float d = abs(fract(s) - 0.5) * 2.0;
  return smoothstep(0.72, 0.92, d) * (0.55 + 0.45 * sNoise(px * vec2(0.05, 0.3) + boil));
}
void main() {
  vec2 px = vUv / uTexel;
  float boil = floor(uTime * 8.0);
  // Two strokes, each wandering a little off the true line, in a different way each "frame".
  vec2 w1 = (vec2(sNoise(px * 0.012 + boil * 3.1), sNoise(px * 0.012 + 17.0 + boil * 1.7)) - 0.5) * 2.4 * uLine;
  vec2 w2 = (vec2(sNoise(px * 0.02 + 5.0 - boil * 2.3), sNoise(px * 0.02 + 9.0 + boil * 1.1)) - 0.5) * 3.0 * uLine;
  float line = max(edge(vUv + w1 * uTexel, uLine), edge(vUv + w2 * uTexel, uLine * 0.75) * 0.7);

  // The colour, graded as usual, then laid down as a light wash.
  vec3 col = toSRGB(clamp(neutral(texture2D(tScene, vUv).rgb), 0.0, 1.0));
  col = uLift * 0.35 + col * (uGain - uLift * 0.35);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSaturation * 0.6);
  // Values gather into a few soft steps, as a hand would shade them.
  float lv = mix(l, floor(l * 4.0 + 0.5) / 4.0, 0.3);
  vec3 wash = col * (lv / max(l, 1e-3));
  float tooth = sNoise(px * 0.9 / uLine) * 0.6 + sNoise(px * 0.21 / uLine) * 0.4;
  vec3 paper = vec3(0.965, 0.94, 0.87) * (0.95 + 0.05 * tooth);
  // A pale wash: plenty of paper shows through, deepest where the colour is darkest.
  vec3 c = paper * mix(vec3(1.0), clamp(wash * 1.3 + 0.08, 0.0, 1.0), 0.62);

  // Shading: hatching in the shadows, cross-hatching where it's darkest.
  vec2 hp = px / uLine;
  // Light pencil shading over the mid-tones, hatching in the shadows, cross-hatching darkest.
  float shade0 = 1.0 - smoothstep(0.5, 0.8, lv);
  float shade1 = 1.0 - smoothstep(0.32, 0.55, lv);
  float shade2 = 1.0 - smoothstep(0.12, 0.3, lv);
  float h = hatch(hp, vec2(0.94, 0.34), 3.2, boil + 3.0) * shade0 * 0.35
          + hatch(hp, vec2(0.707, 0.707), 4.5, boil) * shade1
          + hatch(hp, vec2(-0.6, 0.8), 4.0, boil + 7.0) * shade2;

  // Graphite catches on the paper's tooth, so lines and hatching break up a little.
  float grip = 0.55 + 0.45 * smoothstep(0.2, 0.7, tooth);
  float graphite = clamp(line * 0.9 + h * 0.45, 0.0, 1.0) * grip;
  c = mix(c, vec3(0.22, 0.2, 0.19) * (0.6 + 0.4 * lv), graphite);

  // The page darkens a touch towards its edges.
  vec2 v = (vUv - 0.5) * vec2(uAspect, 1.0);
  c *= mix(0.88, 1.0, smoothstep(0.95, 0.3, length(v) * 1.1));
  gl_FragColor = vec4(c, 1.0);
}`;

export type ArtStyle = 'painted' | 'sketch';

const LEVELS = 3; // bloom chain: 1/4, 1/8, 1/16 of full resolution

function target(w: number, h: number, samples = 0, depth = false) {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: THREE.HalfFloatType,
    samples,
    depthBuffer: samples > 0 || depth,
    ...(depth ? { depthTexture: new THREE.DepthTexture(Math.max(1, w), Math.max(1, h)) } : {}),
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
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
  private readonly sketch = pass(sketchFrag, {
    tScene: { value: null },
    tDepth: { value: null },
    uLift: { value: new THREE.Color('#2a1a10') },
    uGain: { value: new THREE.Color('#fff4e6') },
    uSaturation: { value: 1.08 },
    uAspect: { value: 1 },
    uNear: { value: 0.5 },
    uFar: { value: 400 },
    uTime: { value: 0 },
    uLine: { value: 1.5 },
    uTexel: { value: new THREE.Vector2(1, 1) },
  });
  private samples = 4;
  private style: ArtStyle = 'painted';
  bloomEnabled = true;
  private black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {
    this.sceneRT = target(1, 1, this.samples);
    for (let i = 0; i < LEVELS; i++) {
      this.bloomRTs.push(target(1, 1));
      this.upRTs.push(target(1, 1));
    }
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.final);
    this.quad.frustumCulled = false;
    this.black.needsUpdate = true;
  }

  /** MSAA sample count for the scene (0 turns antialiasing off). */
  setSamples(samples: number) {
    if (samples === this.samples) return;
    this.samples = samples;
    const { width, height } = this.sceneRT;
    this.sceneRT.dispose();
    this.sceneRT = target(width, height, samples, this.style === 'sketch');
  }

  /** The art style: the usual painted look, or the pencil-sketch prototype (which needs depth). */
  setStyle(style: ArtStyle) {
    if (style === this.style) return;
    this.style = style;
    const { width, height } = this.sceneRT;
    this.sceneRT.dispose();
    this.sceneRT = target(width, height, this.samples, style === 'sketch');
  }

  /** The colour grade (lift/gain/saturation) and bloom strength, e.g. for the time of day. */
  setGrade(lift: THREE.Color, gain: THREE.Color, saturation: number, bloom: number) {
    const u = this.final.uniforms;
    (u.uLift.value as THREE.Color).copy(lift);
    (u.uGain.value as THREE.Color).copy(gain);
    u.uSaturation.value = saturation;
    u.uBloom.value = bloom;
    const k = this.sketch.uniforms;
    (k.uLift.value as THREE.Color).copy(lift);
    (k.uGain.value as THREE.Color).copy(gain);
    k.uSaturation.value = saturation;
  }

  setSize(width: number, height: number, pixelRatio: number) {
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
    this.sketch.uniforms.uAspect.value = width / height;
    this.sketch.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.sketch.uniforms.uLine.value = Math.max(1, pixelRatio * 0.8);
    // Sharpen more the more the screen will stretch the picture.
    const stretch = Math.max(1, (window.devicePixelRatio || 1) / pixelRatio);
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

    if (this.style === 'sketch') {
      // Pencil on paper: no bloom, just the one pass that draws it all.
      const u = this.sketch.uniforms;
      u.tScene.value = this.sceneRT.texture;
      u.tDepth.value = this.sceneRT.depthTexture;
      const cam = this.camera as THREE.PerspectiveCamera;
      u.uNear.value = cam.near;
      u.uFar.value = cam.far;
      u.uTime.value = performance.now() / 1000;
      this.blit(this.sketch, null);
      return;
    }

    let bloomTex: THREE.Texture = this.black;
    if (this.bloomEnabled) {
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
    this.final.uniforms.tBloom.value = bloomTex;
    this.blit(this.final, null);
  }
}
