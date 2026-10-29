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
 * The hand-drawn looks (prototype art styles), all in one final pass. Lines are found from depth
 * (silhouettes) and tone (inner detail) and drawn the way a hand draws them: pressure that comes
 * and goes (with the odd gap), thickness that swells and thins, a second stroke that wanders off
 * and overshoots, and everything redrawn ~8 times a second like hand-drawn animation. Colour is a
 * pale wash on toothy cream paper. The variants differ in how they shade:
 *   0 Pencil   - soft graphite smudged into the paper grain; no hatch lines.
 *   1 Hatched  - short strokes laid in little patches, each at its own angle and spacing,
 *                fading at their edges; a second, slightly turned layer in the darkest places
 *                (never a 90° cross). Far away it gives way to soft smudging.
 *   2 Coloured - the colour itself laid down in coloured-pencil strokes; lighter outlines,
 *                tinted with the colour beneath them.
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
vec2 sHash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
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
/** How strongly a line belongs here: a jump in depth (an outline) or in tone (detail). */
float edge(vec2 uv, float r) {
  vec2 o = uTexel * r;
  vec2 a = vec2(o.x, o.y), b = vec2(o.x, -o.y);
  float dc = lin(uv);
  float dd = (abs(lin(uv + a) - lin(uv - a)) + abs(lin(uv + b) - lin(uv - b))) / dc;
  float outline = smoothstep(0.012, 0.05, dd);
  float tl = abs(tone(texture2D(tScene, uv + a).rgb) - tone(texture2D(tScene, uv - a).rgb))
           + abs(tone(texture2D(tScene, uv + b).rgb) - tone(texture2D(tScene, uv - b).rgb));
  float detail = smoothstep(0.06, 0.18, tl);
  float near = smoothstep(120.0, 40.0, dc);
  return max(outline, detail * 0.6) * mix(0.35, 1.0, near);
}
/** Pressure along a stroke: mostly firm, easing off here and there, now and then lifting. */
float pressure(vec2 p, float seed) {
  float n = sNoise(p * 0.045 + seed) * 0.65 + sNoise(p * 0.13 - seed * 1.3) * 0.35;
  return smoothstep(0.22, 0.62, n) * mix(0.75, 1.0, sNoise(p * 0.3 + seed * 2.1));
}
/**
 * Hand hatching: short strokes in a patch around one jittered cell, at the patch's own angle and
 * spacing, each stroke with its own length and pressure; the patch fades out towards its edge.
 */
float patchHatch(vec2 p, float size, float angle, float spacing, float boil, vec2 shift) {
  vec2 q = p / size + shift;
  vec2 cell = floor(q);
  vec2 h = sHash2(cell + boil * 0.37);
  vec2 local = q - cell - 0.5 - (h - 0.5) * 0.4;
  float a = angle + (h.x - 0.5) * 0.9;
  vec2 dir = vec2(cos(a), sin(a));
  vec2 nrm = vec2(-dir.y, dir.x);
  float sp = spacing * mix(0.8, 1.3, h.y) / size;
  float across = dot(local, nrm) / sp;
  float id = floor(across);
  float r = sHash(vec2(id, h.x * 91.0));
  // Each stroke starts and stops at its own place, a little off the patch's line.
  float along = dot(local, dir) + (r - 0.5) * 0.25;
  float len = mix(0.28, 0.5, sHash(vec2(id * 1.7, h.y * 53.0)));
  float body = smoothstep(len, len - 0.08, abs(along));
  float d = abs(fract(across) - 0.5) * 2.0;
  float stroke = smoothstep(0.62, 0.86, d) * body * mix(0.55, 1.0, r);
  float fade = smoothstep(0.62, 0.28, length(local));
  return stroke * fade;
}
float hatchLayer(vec2 p, float size, float angle, float spacing, float boil) {
  return max(patchHatch(p, size, angle, spacing, boil, vec2(0.0)), patchHatch(p, size, angle + 0.35, spacing, boil + 11.0, vec2(0.5)));
}
void main() {
  vec2 px = vUv / uTexel;
  vec2 hp = px / uLine; // in screen points, so marks are the same size on every phone
  float boil = floor(uTime * 8.0);
  float dc = lin(vUv);

  // Two strokes, each wandering off the true line its own way, with its own pressure and width.
  vec2 jitter = (sHash2(floor(hp / 3.0) + boil) - 0.5) * 0.6;
  vec2 w1 = (vec2(sNoise(hp * 0.01 + boil * 3.1), sNoise(hp * 0.01 + 17.0 + boil * 1.7)) - 0.5) * 3.0 + jitter;
  vec2 w2 = (vec2(sNoise(hp * 0.018 + 5.0 - boil * 2.3), sNoise(hp * 0.018 + 9.0 + boil * 1.1)) - 0.5) * 4.5;
  float r1 = uLine * mix(0.6, 1.5, sNoise(hp * 0.02 + 3.0 + boil * 0.7));
  float r2 = uLine * mix(0.5, 1.1, sNoise(hp * 0.025 - 4.0 + boil * 0.9));
  float line = max(edge(vUv + w1 * uLine * uTexel, r1) * pressure(hp, boil * 1.9),
                   edge(vUv + w2 * uLine * uTexel, r2) * pressure(hp, 40.0 + boil * 2.7) * 0.6);

  // The colour, graded as usual, then laid down as a pale wash.
  vec3 col = toSRGB(clamp(neutral(texture2D(tScene, vUv).rgb), 0.0, 1.0));
  col = uLift * 0.35 + col * (uGain - uLift * 0.35);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSaturation * 0.6);
  float lv = mix(l, floor(l * 4.0 + 0.5) / 4.0, 0.25);
  vec3 wash = clamp(col * (lv / max(l, 1e-3)) * 1.3 + 0.08, 0.0, 1.0);
  float tooth = sNoise(hp * 0.9) * 0.6 + sNoise(hp * 0.21) * 0.4;
  vec3 paper = vec3(0.965, 0.94, 0.87) * (0.95 + 0.05 * tooth);
  float grip = 0.55 + 0.45 * smoothstep(0.2, 0.7, tooth);
  // Up close there's room for hatching; far away it melts into soft shading.
  float close = smoothstep(75.0, 32.0, dc);
  // Only real shadow gets shaded: sunlit grass stays clean paper and wash.
  float shade = 1.0 - smoothstep(0.2, 0.46, lv);
  float deep = 1.0 - smoothstep(0.06, 0.22, lv);
  // Soft graphite rubbed into the grain (streaky, at a slant, as a pencil's side leaves it).
  vec2 sp = vec2(hp.x * 0.8 + hp.y * 0.6, -hp.x * 0.6 + hp.y * 0.8);
  float smudge = (0.55 + 0.45 * sNoise(sp * vec2(0.06, 0.6))) * mix(0.7, 1.0, tooth);
  vec3 c;
  float graphite;

#if VARIANT == 0
  c = paper * mix(vec3(1.0), wash, 0.62);
  c *= 1.0 - shade * smudge * 0.32 - deep * 0.12;
  graphite = line * 0.9 * grip;
#elif VARIANT == 1
  c = paper * mix(vec3(1.0), wash, 0.6);
  float h = hatchLayer(hp, 26.0, 0.85, 4.2, boil) * shade + hatchLayer(hp + 13.0, 22.0, 1.25, 3.6, boil + 5.0) * deep;
  // Far off: the same shade, smudged in rather than hatched.
  c *= 1.0 - shade * smudge * 0.28 * (1.0 - close);
  graphite = clamp(line * 0.9 + h * 0.55 * close, 0.0, 1.0) * grip;
#else
  // Coloured pencil: the colour goes on in strokes, denser where it's darker.
  float strokes = max(hatchLayer(hp, 22.0, 0.95, 2.6, boil), hatchLayer(hp + 7.0, 18.0, 0.55, 2.4, boil + 3.0) * 0.8);
  float cover = mix(0.5, 1.0, clamp(strokes * (0.6 + shade * 0.8) + shade * 0.25, 0.0, 1.0));
  cover = mix(0.82, cover, 0.35 + 0.65 * close);
  c = paper * mix(vec3(1.0), wash * mix(1.0, 0.82, shade), 0.72 * cover);
  graphite = line * 0.7 * grip;
#endif

#if VARIANT == 2
  vec3 lead = mix(vec3(0.22, 0.2, 0.19), wash * 0.45, 0.6);
#else
  vec3 lead = vec3(0.22, 0.2, 0.19) * (0.6 + 0.4 * lv);
#endif
  c = mix(c, lead, graphite);

  // The page darkens a touch towards its edges.
  vec2 v = (vUv - 0.5) * vec2(uAspect, 1.0);
  c *= mix(0.88, 1.0, smoothstep(0.95, 0.3, length(v) * 1.1));
  gl_FragColor = vec4(c, 1.0);
}`;

export type ArtStyle = 'painted' | 'pencil' | 'hatched' | 'coloured';
const VARIANT: Record<Exclude<ArtStyle, 'painted'>, number> = { pencil: 0, hatched: 1, coloured: 2 };

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
  private readonly sketchUniforms = {
    tScene: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uLift: { value: new THREE.Color('#2a1a10') },
    uGain: { value: new THREE.Color('#fff4e6') },
    uSaturation: { value: 1.08 },
    uAspect: { value: 1 },
    uNear: { value: 0.5 },
    uFar: { value: 400 },
    uTime: { value: 0 },
    uLine: { value: 1.5 },
    uTexel: { value: new THREE.Vector2(1, 1) },
  };
  /** One compiled pass per hand-drawn variant, made the first time it's chosen. */
  private readonly sketches = new Map<ArtStyle, THREE.ShaderMaterial>();
  private samples = 4;
  private style: ArtStyle = 'painted';

  private get drawn(): boolean {
    return this.style !== 'painted';
  }
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
    this.sceneRT = target(width, height, samples, this.drawn);
  }

  /** The art style: the usual painted look, or the pencil-sketch prototype (which needs depth). */
  setStyle(style: ArtStyle) {
    if (style === this.style) return;
    const needsDepth = style !== 'painted';
    const hadDepth = this.drawn;
    this.style = style;
    if (needsDepth && !this.sketches.has(style)) {
      const m = pass(sketchFrag, this.sketchUniforms);
      m.defines = { VARIANT: VARIANT[style as Exclude<ArtStyle, 'painted'>] };
      this.sketches.set(style, m);
    }
    if (needsDepth === hadDepth) return;
    const { width, height } = this.sceneRT;
    this.sceneRT.dispose();
    this.sceneRT = target(width, height, this.samples, needsDepth);
  }

  /** The colour grade (lift/gain/saturation) and bloom strength, e.g. for the time of day. */
  setGrade(lift: THREE.Color, gain: THREE.Color, saturation: number, bloom: number) {
    const u = this.final.uniforms;
    (u.uLift.value as THREE.Color).copy(lift);
    (u.uGain.value as THREE.Color).copy(gain);
    u.uSaturation.value = saturation;
    u.uBloom.value = bloom;
    const k = this.sketchUniforms;
    k.uLift.value.copy(lift);
    k.uGain.value.copy(gain);
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
    this.sketchUniforms.uAspect.value = width / height;
    this.sketchUniforms.uTexel.value.set(1 / w, 1 / h);
    this.sketchUniforms.uLine.value = Math.max(1, pixelRatio * 0.8);
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

    const sketch = this.sketches.get(this.style);
    if (sketch) {
      // Pencil on paper: no bloom, just the one pass that draws it all.
      const u = this.sketchUniforms;
      u.tScene.value = this.sceneRT.texture;
      u.tDepth.value = this.sceneRT.depthTexture;
      const cam = this.camera as THREE.PerspectiveCamera;
      u.uNear.value = cam.near;
      u.uFar.value = cam.far;
      u.uTime.value = performance.now() / 1000;
      this.blit(sketch, null);
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
