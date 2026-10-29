import * as THREE from 'three';
import { createRng, lerp } from '../core/random';
import { EDGE_STYLES, type Fences, type FenceStyle, type Part } from '../world/fences';
import type { Wildflowers } from '../world/wildflowers';
import type { Vines } from '../world/vines';

const SAMPLE = 0.1; // metres between smoothed stroke samples
/** Longest run between two posts (hedges are built in shorter sections). */
const SPAN: Record<FenceStyle, number> = { picket: 2.0, rustic: 2.4, hedge: 1.4, wall: 2.0, boxEdge: 1.2, stoneEdge: 1.2, brickEdge: 1.2, willowEdge: 1.0, picketEdge: 1.2 };
/** How far the line may bow away from a straight run before a corner post goes in. */
const CORNER = 0.16;
const PATH_CLEAR = 0.78; // keep this far from a path's centre line
/** Edgings may run close beside a path (its stones are ~0.3 m from the centre line). */
const pathClear = (style: FenceStyle) => (EDGE_STYLES.has(style) ? 0.45 : PATH_CLEAR);
const BRICK_TINTS = ['#e0866a', '#d27560', '#e8977a', '#c96a55', '#dc8b68', '#c27058'];
const WILLOW_TINTS = ['#c9b49a', '#bba68b', '#d4c2a8', '#b09a80'];
const PICKET_TINTS = ['#ffffff', '#fbf8f2', '#f4f0e8', '#ece6da'];
const LOG_TINTS = ['#ffffff', '#f2eee8', '#e6dfd5', '#d9d2c8'];
// Weathered grey stone: some warmer, some cooler, the odd darker or rust-stained one.
const STONE_TINTS = ['#ffffff', '#f4efe4', '#e6e6e2', '#dcd6cb', '#f0e6d6', '#d2d4d4', '#c9bfb0', '#e9dccb'];

/** How a stretch of wall finishes: running on (a corner), crumbling away, or a neat opening. */
type End = 'join' | 'crumble' | 'opening';

interface Segment {
  id: number;
  style: FenceStyle;
  a: THREE.Vector2;
  b: THREE.Vector2;
  /** Which stretches were open lawn when it was built, so a later path can be noticed. */
  signature: string;
  /** Tidied away in part: never rebuilt. */
  locked?: boolean;
  /** The stroke started / finished here (a wall crumbles away at such ends). */
  first?: boolean;
  last?: boolean;
}

/**
 * Builds fences and hedges along a drawn line, as you draw. The line is smoothed into straight
 * runs between posts; wherever it bends, a corner post goes in exactly at the bend. Where the
 * line crosses a path the fence leaves an opening with a gate, left a little ajar (a hedge
 * leaves a neat gap between two taller, rounded ends); ponds, beds and the cottage are skipped.
 */
export class FenceBuilder {
  style: FenceStyle = 'picket';
  private rng = createRng(6060);
  private readonly segments: Segment[] = [];
  private nextId = 1;
  private samples: THREE.Vector2[] = [];
  private lastPost: THREE.Vector2 | null = null;
  private delay = 0;
  private firstSegment = false;

  constructor(
    private readonly fences: Fences,
    private readonly wildflowers: Wildflowers,
    private readonly heightAt: (x: number, z: number) => number,
    private readonly distanceToPaths: (x: number, z: number) => number,
    /** Places a fence can't stand: ponds, flower beds, the cottage, the woods. */
    private readonly blocked: (x: number, z: number) => boolean,
    private readonly vines: Vines | null = null,
  ) {}

  /**
   * Its own dice for each stretch (from where it stands), so whether and how a climber takes
   * to it never disturbs the fence's own variation, and a rebuilt garden grows the same vines.
   */
  private vineRng(seg: Segment, a: THREE.Vector2, b: THREE.Vector2) {
    const h = Math.round(a.x * 97 + a.y * 131 + b.x * 173 + b.y * 211) + seg.id * 7919;
    return createRng(h);
  }

  /** Points from the foot of a post up to `top`, winding round it. */
  private upPost(at: THREE.Vector2, top: number): THREE.Vector3[] {
    const g = this.heightAt(at.x, at.y);
    return [0.02, 0.3, 0.6, 1].map((k) => new THREE.Vector3(at.x, g + k * top, at.y));
  }

  /** Maybe a climber on this run of fence: roses on pickets; clematis or honeysuckle on rails. */
  private fenceVine(seg: Segment, a: THREE.Vector2, b: THREE.Vector2, top: number, delay: number) {
    if (!this.vines) return;
    const rng = this.vineRng(seg, a, b);
    if (rng() > (seg.style === 'picket' ? 0.4 : 0.45)) return;
    const len = a.distanceTo(b);
    // It starts from one post or the other and reaches part or all of the way along.
    const flip = rng() < 0.5;
    const from = flip ? b : a;
    const to = flip ? a : b;
    const dir = to.clone().sub(from).divideScalar(Math.max(len, 1e-6));
    const reach = len * lerp(0.45, 1.0, rng());
    const side = seg.style === 'picket' ? (flip ? -1 : 1) * 0.06 : 0;
    const pts = this.upPost(from, top);
    const n = Math.max(2, Math.ceil(reach / 0.2));
    for (let i = 1; i <= n; i++) {
      const t = (i / n) * reach;
      const x = from.x + dir.x * t + dir.y * side;
      const z = from.y + dir.y * t - dir.x * side;
      // Roses scramble over the top of the pickets in a wave; climbers on logs follow the rail.
      const wave = seg.style === 'picket' ? Math.sin(t * 2.3 + rng()) * 0.1 - 0.02 : (rng() - 0.5) * 0.02;
      pts.push(new THREE.Vector3(x, this.heightAt(x, z) + top + wave, z));
    }
    const kind = seg.style === 'picket' ? 'rose' : rng() < 0.55 ? 'clematis' : 'honeysuckle';
    this.vines.climb(pts, { kind, owner: seg.id, seed: Math.floor(rng() * 1e6), delay: delay + lerp(6, 14, rng()), wrap: seg.style === 'picket' ? 0.035 : 0.05 });
  }

  /** Maybe ivy over a stone wall: along its top, with strands trailing down both faces. */
  private wallVine(seg: Segment, a: THREE.Vector2, b: THREE.Vector2, top: (t: number) => number, delay: number) {
    if (!this.vines) return;
    const rng = this.vineRng(seg, a, b);
    if (rng() > 0.5) return;
    const len = a.distanceTo(b);
    if (len < 0.8) return;
    const dir = b.clone().sub(a).divideScalar(len);
    const perp = new THREE.Vector2(-dir.y, dir.x);
    const t0 = lerp(0.1, Math.max(0.1, len * 0.5), rng());
    const t1 = Math.min(len - 0.1, t0 + lerp(0.6, 2.2, rng()));
    if (t1 - t0 < 0.4) return;
    const seed = Math.floor(rng() * 1e6);
    const d = delay + lerp(8, 16, rng());
    const ground = (t: number, side: number) => {
      const x = a.x + dir.x * t + perp.x * side;
      const z = a.y + dir.y * t + perp.y * side;
      return new THREE.Vector3(x, this.heightAt(x, z), z);
    };
    // Along the top…
    const along: THREE.Vector3[] = [];
    for (let t = t0; t <= t1; t += 0.15) {
      const p = ground(t, (rng() - 0.5) * 0.1);
      p.y += top(t) + 0.04;
      along.push(p);
    }
    const up = new THREE.Vector3(0, 1, 0);
    this.vines.climb(along, { kind: 'ivy', owner: seg.id, seed, delay: d, face: up, speed: 0.05 });
    // …and trailing down the faces, each strand starting where the top growth has reached.
    for (let t = t0 + 0.1; t < t1; t += lerp(0.18, 0.35, rng())) {
      const side = rng() < 0.5 ? -1 : 1;
      const h = top(t);
      const depth = h * lerp(0.3, 0.95, rng());
      const face = new THREE.Vector3(perp.x * side, 0, perp.y * side);
      const strand: THREE.Vector3[] = [];
      for (let k = 0; k <= 4; k++) {
        // Down the face, which leans in as it rises (wider at the foot than under the coping).
        const y = h - depth * (k / 4);
        const p = ground(t + (rng() - 0.5) * 0.06, side * (0.27 - 0.07 * Math.min(1, y / h)));
        p.y += y + 0.02;
        strand.push(p);
      }
      this.vines.climb(strand, { kind: 'ivy', owner: seg.id, seed: seed + Math.floor(t * 100), delay: d + (t - t0) / 0.05 + 2, face, speed: 0.04 });
    }
  }

  /** Back to an untouched garden (before an undo replays what remains). */
  reset() {
    this.rng = createRng(6060);
    this.segments.length = 0;
    this.nextId = 1;
    this.samples = [];
    this.lastPost = null;
    this.delay = 0;
    this.firstSegment = false;
  }

  begin(p: THREE.Vector3) {
    const at = new THREE.Vector2(p.x, p.z);
    this.samples = [at];
    this.lastPost = at.clone();
    this.delay = 0;
    this.firstSegment = true;
  }

  extend(p: THREE.Vector3) {
    if (!this.lastPost) return;
    const last = this.samples[this.samples.length - 1];
    const to = new THREE.Vector2(p.x, p.z);
    let d = to.distanceTo(last);
    // Resample evenly, easing toward the finger, so a wobbly hand still makes clean runs.
    while (d >= SAMPLE) {
      const prev = this.samples[this.samples.length - 1];
      const next = prev.clone().addScaledVector(to.clone().sub(prev).normalize(), SAMPLE);
      this.samples.push(next);
      this.consider();
      d = to.distanceTo(next);
    }
  }

  end() {
    if (!this.lastPost) return;
    const last = this.samples[this.samples.length - 1];
    if (last.distanceTo(this.lastPost) > 0.3) this.segment(this.lastPost, last, true);
    else if (this.samples.length <= 1) {
      // A single tap: a short length of fence, along the view's sideways direction.
      this.segment(this.lastPost, this.lastPost.clone().add(new THREE.Vector2(SPAN[this.style] * 0.75, 0)), true);
    }
    this.lastPost = null;
    this.samples = [];
  }

  /** Should the run since the last post end here: a long enough run, or a bend? */
  private consider() {
    const a = this.lastPost!;
    const s = this.samples;
    const b = s[s.length - 1];
    const chord = b.clone().sub(a);
    const len = chord.length();
    if (len < 0.25) return;
    chord.divideScalar(len);
    // How far the samples since the last post bow away from the straight line to here.
    let worst = 0;
    let at = -1;
    for (let i = s.length - 2; i >= 0; i--) {
      const q = s[i];
      if (q.distanceToSquared(a) < 1e-6) break;
      const dev = Math.abs((q.x - a.x) * chord.y - (q.y - a.y) * chord.x);
      if (dev > worst) {
        worst = dev;
        at = i;
      }
    }
    // Never set a post down in a path: wait until the line is clear of it, so a crossing always
    // falls between two posts and gets a gate.
    const inPath = (q: THREE.Vector2) => this.distanceToPaths(q.x, q.y) < pathClear(this.style) + 0.15;
    if (worst > CORNER && at >= 0 && !inPath(s[at])) {
      // A bend: the corner post goes exactly where the line turned.
      const corner = s[at].clone();
      this.segment(a, corner);
      this.lastPost = corner;
      this.samples = s.slice(at);
      return;
    }
    if (len >= SPAN[this.style] && (!inPath(b) || len > SPAN[this.style] * 3)) {
      this.segment(a, b.clone());
      this.lastPost = b.clone();
      this.samples = [b.clone()];
    }
  }

  private segment(a: THREE.Vector2, b: THREE.Vector2, last = false) {
    const seg: Segment = { id: this.nextId++, style: this.style, a: a.clone(), b: b.clone(), signature: '', first: this.firstSegment, last };
    this.firstSegment = false;
    this.segments.push(seg);
    this.build(seg, this.delay);
    this.delay = Math.max(0, this.delay - 0.15) + 0.05;
  }

  /** Open stretches (and path crossings) along a segment, as [from, to, kind] in metres. */
  private stretches(seg: Segment): { from: number; to: number; kind: 'fence' | 'path' | 'blocked' }[] {
    const len = seg.a.distanceTo(seg.b);
    const dir = seg.b.clone().sub(seg.a).divideScalar(Math.max(len, 1e-6));
    const out: { from: number; to: number; kind: 'fence' | 'path' | 'blocked' }[] = [];
    const n = Math.max(1, Math.ceil(len / 0.05));
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * len;
      const x = seg.a.x + dir.x * t;
      const z = seg.a.y + dir.y * t;
      const kind = this.distanceToPaths(x, z) < pathClear(seg.style) ? 'path' : this.blocked(x, z) ? 'blocked' : 'fence';
      const last = out[out.length - 1];
      if (last && last.kind === kind) last.to = t;
      else out.push({ from: t, to: t, kind });
    }
    return out;
  }

  /** Lay one segment's posts, rails, pickets or hedge, with gates where paths cross. */
  private build(seg: Segment, delay: number) {
    const parts = this.stretches(seg);
    seg.signature = parts.map((p) => `${p.kind}${p.from.toFixed(1)}`).join('|');
    const len = seg.a.distanceTo(seg.b);
    const dir = seg.b.clone().sub(seg.a).divideScalar(Math.max(len, 1e-6));
    const at = (t: number) => new THREE.Vector2(seg.a.x + dir.x * t, seg.a.y + dir.y * t);
    const endOf = (i: number, edge: boolean | undefined): End => {
      if (i < 0 || i >= parts.length) return edge ? 'crumble' : 'join';
      return parts[i].kind === 'path' ? 'opening' : 'crumble';
    };
    parts.forEach((p, i) => {
      if (p.kind === 'fence' && p.to - p.from > 0.12) {
        this.run(seg, at(p.from), at(p.to), delay, endOf(i - 1, seg.first), endOf(i + 1, seg.last));
        delay += 0.08;
      }
      // A path through the fence: a gate (or, in a hedge, a gap with rounded ends), but only
      // where there's fence on both sides.
      if (p.kind === 'path' && i > 0 && i < parts.length - 1 && parts[i - 1].kind === 'fence' && parts[i + 1].kind === 'fence') {
        this.gate(seg, at(p.from), at(p.to), delay);
      }
    });
  }

  /** A post at (x, z), unless one is already there (corners and joins share posts). */
  private post(seg: Segment, x: number, z: number, delay: number, tall = 1): Part | null {
    const style = seg.style;
    const mini = style === 'picketEdge' || style === 'willowEdge';
    if (!mini && style !== 'picket' && style !== 'rustic') return null;
    const existing = this.fences.postNear(x, z, mini ? 0.12 : 0.3);
    if (existing) return existing;
    const shape = style === 'picket' || style === 'picketEdge' ? 'picketPost' : 'logPost';
    const yaw = Math.atan2(-(seg.b.y - seg.a.y), seg.b.x - seg.a.x) + (this.rng() - 0.5) * 0.15;
    // Hand-set: each post leans a hair and stands a touch higher or lower than its neighbour.
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((this.rng() - 0.5) * 0.05, yaw, (this.rng() - 0.5) * 0.05, 'YXZ'));
    const tint = new THREE.Color(shape === 'picketPost' ? PICKET_TINTS[Math.floor(this.rng() * 4)] : style === 'willowEdge' ? WILLOW_TINTS[Math.floor(this.rng() * 4)] : LOG_TINTS[Math.floor(this.rng() * 4)]);
    const y = this.heightAt(x, z) - lerp(0.05, 0.1, this.rng()) * (mini ? 0.5 : 1);
    this.wildflowers.clearNear(x, z, 0.3);
    // An edging's posts are little: a mini picket post, or a short willow stake.
    const scale = style === 'picketEdge' ? new THREE.Vector3(0.62, 0.42 * tall, 0.62) : style === 'willowEdge' ? new THREE.Vector3(0.42, 0.3 * tall, 0.42) : new THREE.Vector3(1, tall, 1);
    scale.y *= lerp(0.96, 1.04, this.rng());
    return this.fences.add(shape, new THREE.Vector3(x, y, z), q, scale, tint, 'drop', delay, seg.id);
  }

  /** A rail (or log) from one point to another, given heights above the ground at each end. */
  private rail(seg: Segment, a: THREE.Vector2, ha: number, b: THREE.Vector2, hb: number, delay: number, sag = 0) {
    const pa = new THREE.Vector3(a.x, this.heightAt(a.x, a.y) + ha, a.y);
    const pb = new THREE.Vector3(b.x, this.heightAt(b.x, b.y) + hb, b.y);
    const mid = pa.clone().add(pb).multiplyScalar(0.5);
    mid.y -= sag;
    const d = pb.clone().sub(pa);
    const len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize());
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (this.rng() - 0.5) * 0.3));
    const shape = seg.style === 'picket' ? 'rail' : 'log';
    const tint = new THREE.Color(seg.style === 'picket' ? PICKET_TINTS[Math.floor(this.rng() * 4)] : LOG_TINTS[Math.floor(this.rng() * 4)]);
    this.fences.add(shape, mid, q, new THREE.Vector3(len + (shape === 'log' ? 0.12 : 0.04), 1, 1), tint, 'pop', delay, seg.id, len / 2);
  }

  /** A run of fence or hedge between two points. */
  private run(seg: Segment, a: THREE.Vector2, b: THREE.Vector2, delay: number, startEnd: End = 'join', endEnd: End = 'join') {
    const len = a.distanceTo(b);
    const dir = b.clone().sub(a).divideScalar(Math.max(len, 1e-6));
    const yaw = Math.atan2(-dir.y, dir.x);
    for (let t = 0; t <= len; t += 0.3) this.wildflowers.clearNear(a.x + dir.x * t, a.y + dir.y * t, 0.35);
    if (seg.style === 'wall') {
      this.wall(seg, a, b, delay, startEnd, endEnd);
      return;
    }
    if (EDGE_STYLES.has(seg.style)) {
      this.edging(seg, a, b, delay);
      return;
    }
    if (seg.style === 'hedge') {
      // Overlapping clipped sections, each a little different, growing up in a wave.
      const n = Math.max(1, Math.round(len / 0.42));
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * len;
        const side = (this.rng() - 0.5) * 0.06;
        const x = a.x + dir.x * t - dir.y * side;
        const z = a.y + dir.y * t + dir.x * side;
        const end = i === 0 || i === n;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw + (this.rng() - 0.5) * 0.12, 0));
        const scale = new THREE.Vector3(lerp(0.62, 0.72, this.rng()), lerp(0.88, 1.0, this.rng()) * (end ? 0.97 : 1), lerp(0.62, 0.72, this.rng()));
        const tint = new THREE.Color(1, 1, 1).multiplyScalar(lerp(0.9, 1.08, this.rng()));
        this.fences.add('hedge', new THREE.Vector3(x, this.heightAt(x, z) - 0.04, z), q, scale, tint, 'grow', delay + t * 0.12, seg.id);
      }
      return;
    }
    const pa = this.post(seg, a.x, a.y, delay);
    const pb = this.post(seg, b.x, b.y, delay + 0.12);
    if (!pa && !pb) return;
    const railDelay = delay + 0.3;
    const sag = len * 0.006;
    if (seg.style === 'picket') {
      const h1 = lerp(0.24, 0.28, this.rng());
      const h2 = lerp(0.68, 0.72, this.rng());
      this.rail(seg, a, h1, b, h1 + (this.rng() - 0.5) * 0.02, railDelay, sag);
      this.rail(seg, a, h2, b, h2 + (this.rng() - 0.5) * 0.02, railDelay + 0.06, sag);
      // Pickets, nailed on one by one: not quite evenly, not quite plumb, the odd one missing.
      const gap = 0.13;
      const n = Math.floor((len - 0.14) / gap);
      const start = (len - n * gap) / 2;
      for (let i = 0; i <= n; i++) {
        if (this.rng() < 0.03) continue;
        const t = start + i * gap + (this.rng() - 0.5) * 0.012;
        const x = a.x + dir.x * t + dir.y * 0.035;
        const z = a.y + dir.y * t - dir.x * 0.035;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, (this.rng() - 0.5) * 0.05));
        const h = lerp(0.84, 0.9, this.rng());
        const tint = new THREE.Color(PICKET_TINTS[Math.floor(this.rng() * 4)]);
        this.fences.add('picket', new THREE.Vector3(x, this.heightAt(x, z) + 0.06, z), q, new THREE.Vector3(1, h, 1), tint, 'pop', railDelay + 0.15 + i * 0.03, seg.id);
      }
      this.fenceVine(seg, a, b, h2 + 0.08, railDelay);
    } else {
      // Post and rail: two (now and then three) split logs, a little crooked.
      const rails = this.rng() < 0.25 ? [0.3, 0.62, 0.92] : [0.45, 0.88];
      rails.forEach((h, k) => this.rail(seg, a, h + (this.rng() - 0.5) * 0.06, b, h + (this.rng() - 0.5) * 0.06, railDelay + k * 0.07, sag * 2));
      this.fenceVine(seg, a, b, rails[rails.length - 1] + 0.03, railDelay);
    }
  }

  /**
   * A dry-stone wall: irregular stones laid in courses, joints staggered over the course below,
   * the wall leaning in as it rises, capped with a row of upright stones. Where it ends it
   * steps down and crumbles, with a few fallen stones in the grass; at a path it finishes in a
   * neat opening between two tall upright stones.
   */
  private wall(seg: Segment, a: THREE.Vector2, b: THREE.Vector2, delay: number, startEnd: End, endEnd: End) {
    const len = a.distanceTo(b);
    const dir = b.clone().sub(a).divideScalar(Math.max(len, 1e-6));
    const perp = new THREE.Vector2(-dir.y, dir.x);
    const yaw = Math.atan2(-dir.y, dir.x);
    const H = lerp(0.72, 0.8, this.rng());
    const courses = 4;
    const ch = H / courses;
    // How high the wall still stands at t: crumbling ends fall away over ~1 m, unevenly.
    const crumbleLen = 1.0;
    const standing = (t: number) => {
      let h = H;
      if (startEnd === 'crumble') h = Math.min(h, H * Math.max(0, Math.min(1, (t + 0.15) / crumbleLen)) ** 0.8);
      if (endEnd === 'crumble') h = Math.min(h, H * Math.max(0, Math.min(1, (len - t + 0.15) / crumbleLen)) ** 0.8);
      return h;
    };
    const tint = () => new THREE.Color(STONE_TINTS[Math.floor(this.rng() * STONE_TINTS.length)]).multiplyScalar(lerp(0.9, 1.06, this.rng()));
    const stone = (t: number, y: number, size: THREE.Vector3, tilt: number, d: number, side = 0) => {
      const x = a.x + dir.x * t + perp.x * side;
      const z = a.y + dir.y * t + perp.y * side;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((this.rng() - 0.5) * tilt, yaw + (this.rng() - 0.5) * tilt, (this.rng() - 0.5) * tilt, 'YXZ'));
      this.fences.add('wallStone', new THREE.Vector3(x, this.heightAt(x, z) + y, z), q, size, tint(), 'drop', d, seg.id);
    };
    for (let c = 0; c < courses; c++) {
      const width = 0.5 - c * 0.035; // the wall leans in as it rises (its "batter")
      // Break the joints: each course starts offset from the one below.
      let t = c % 2 ? -lerp(0.08, 0.2, this.rng()) : 0;
      while (t < len) {
        const sl = c === 0 ? lerp(0.3, 0.5, this.rng()) : lerp(0.22, 0.42, this.rng());
        const mid = Math.min(len - 0.05, Math.max(0.05, t + sl / 2));
        t += sl;
        const top = (c + 1) * ch;
        const stand = standing(mid);
        // Crumbled away above the standing height (with a ragged, uneven edge).
        if (top > stand + ch * (this.rng() - 0.3)) continue;
        // Now and then a stone is simply missing from the face.
        if (c > 0 && c < courses - 1 && this.rng() < 0.04) continue;
        const h = ch * lerp(0.85, 1.12, this.rng());
        stone(mid, c * ch + h / 2 - 0.03, new THREE.Vector3(sl * lerp(0.93, 1.0, this.rng()), h, width * lerp(0.88, 1.04, this.rng())), 0.12, delay + c * 0.3 + (mid / len) * 0.4, (this.rng() - 0.5) * 0.04);
      }
    }
    // Coping: a row of upright stones along the top, leaning a little this way and that.
    for (let t = 0.07; t < len - 0.05; t += lerp(0.11, 0.15, this.rng())) {
      if (standing(t) < H - 0.02 || this.rng() < 0.03) continue;
      const h = lerp(0.18, 0.25, this.rng());
      stone(t, H + h / 2 - 0.04, new THREE.Vector3(lerp(0.09, 0.13, this.rng()), h, lerp(0.3, 0.38, this.rng())), 0.18, delay + courses * 0.3 + (t / len) * 0.4);
    }
    this.wallVine(seg, a, b, (t) => (standing(t) < H - 0.02 ? standing(t) * 0.8 : H + 0.12), delay + courses * 0.3);
    // Ends: fallen stones lie in the grass beside a crumbled end; an opening gets tall stoops.
    for (const [end, t, out] of [[startEnd, 0, -1], [endEnd, len, 1]] as const) {
      if (end === 'crumble') {
        const n = 2 + Math.floor(this.rng() * 3);
        for (let i = 0; i < n; i++) {
          const along = t + out * lerp(-0.1, 0.6, this.rng());
          const side = (this.rng() < 0.5 ? -1 : 1) * lerp(0.35, 0.7, this.rng());
          const s = lerp(0.18, 0.32, this.rng());
          stone(along, s * 0.25, new THREE.Vector3(s * 1.3, s * 0.6, s), 1.0, delay + 0.8 + i * 0.1, side);
        }
      } else if (end === 'opening') {
        const h = H + lerp(0.15, 0.25, this.rng());
        stone(t - out * 0.18, h / 2 - 0.05, new THREE.Vector3(0.34, h, 0.52), 0.05, delay + 0.5);
      }
    }
  }

  /**
   * A run of low edging for a bed or a path: a clipped box hedge, a row of natural stones,
   * bricks set on end and leaning like a row of dominoes, willow withies woven between short
   * stakes, or a mini white picket. Each piece a little different, the odd one nudged or missing.
   */
  private edging(seg: Segment, a: THREE.Vector2, b: THREE.Vector2, delay: number) {
    const len = a.distanceTo(b);
    const dir = b.clone().sub(a).divideScalar(Math.max(len, 1e-6));
    const yaw = Math.atan2(-dir.y, dir.x);
    const at = (t: number, side = 0) => {
      const x = a.x + dir.x * t - dir.y * side;
      const z = a.y + dir.y * t + dir.x * side;
      return new THREE.Vector3(x, this.heightAt(x, z), z);
    };
    const quat = (wobble: number, tilt = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler((this.rng() - 0.5) * wobble, yaw + (this.rng() - 0.5) * wobble, tilt + (this.rng() - 0.5) * wobble, 'YXZ'));
    switch (seg.style) {
      case 'boxEdge': {
        // A low clipped box hedge: little overlapping sections, growing up in a wave.
        const n = Math.max(1, Math.round(len / 0.2));
        for (let i = 0; i <= n; i++) {
          const t = (i / n) * len;
          const p = at(t, (this.rng() - 0.5) * 0.03);
          p.y -= 0.02;
          const w = lerp(0.3, 0.36, this.rng());
          this.fences.add('hedge', p, quat(0.1), new THREE.Vector3(w, lerp(0.26, 0.32, this.rng()), w), new THREE.Color(1, 1, 1).multiplyScalar(lerp(0.92, 1.08, this.rng())), 'grow', delay + t * 0.1, seg.id);
        }
        break;
      }
      case 'stoneEdge': {
        // Natural stones laid end to end, rounded and a little uneven, with small gaps.
        let t = lerp(0, 0.08, this.rng());
        while (t < len) {
          const l = lerp(0.16, 0.26, this.rng());
          const mid = Math.min(len, t + l / 2);
          t += l + lerp(0.01, 0.04, this.rng());
          if (this.rng() < 0.03) continue;
          const h = lerp(0.09, 0.14, this.rng());
          const p = at(mid, (this.rng() - 0.5) * 0.04);
          p.y += h * 0.3;
          const tint = new THREE.Color(STONE_TINTS[Math.floor(this.rng() * STONE_TINTS.length)]).multiplyScalar(lerp(0.92, 1.05, this.rng()));
          this.fences.add('wallStone', p, quat(0.25), new THREE.Vector3(l, h, lerp(0.13, 0.18, this.rng())), tint, 'drop', delay + (mid / len) * 0.6, seg.id);
        }
        break;
      }
      case 'brickEdge': {
        // Bricks on end, set at a slant all the same way, like a row of dominoes.
        for (let t = 0.04; t < len; t += 0.075) {
          if (this.rng() < 0.03) continue;
          const p = at(t, (this.rng() - 0.5) * 0.015);
          p.y += 0.04;
          const tint = new THREE.Color(BRICK_TINTS[Math.floor(this.rng() * BRICK_TINTS.length)]).multiplyScalar(lerp(0.9, 1.05, this.rng()));
          this.fences.add('wallStone', p, quat(0.06, -0.5), new THREE.Vector3(0.065, 0.2, 0.1), tint, 'drop', delay + (t / len) * 0.7, seg.id);
        }
        break;
      }
      case 'willowEdge': {
        // Short stakes at each end and every 30 cm, with three withies woven along between.
        this.post(seg, a.x, a.y, delay);
        this.post(seg, b.x, b.y, delay + 0.1);
        const stakes = Math.max(1, Math.round(len / 0.3));
        for (let i = 1; i < stakes; i++) {
          const p = at((i / stakes) * len);
          const q = quat(0.08);
          this.fences.add('logPost', new THREE.Vector3(p.x, p.y - 0.03, p.z), q, new THREE.Vector3(0.32, 0.26, 0.32), new THREE.Color(WILLOW_TINTS[Math.floor(this.rng() * 4)]), 'drop', delay + 0.1 + i * 0.03, seg.id);
        }
        for (let k = 0; k < 3; k++) {
          const h = 0.07 + k * 0.065;
          const side = (k % 2 ? 1 : -1) * 0.012;
          const pa = at(0, side);
          const pb = at(len, side);
          pa.y += h + (this.rng() - 0.5) * 0.015;
          pb.y += h + (this.rng() - 0.5) * 0.015;
          const mid = pa.clone().add(pb).multiplyScalar(0.5);
          mid.y -= len * 0.01;
          const d = pb.clone().sub(pa);
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.clone().normalize());
          this.fences.add('log', mid, q, new THREE.Vector3(d.length() + 0.06, 0.34, 0.34), new THREE.Color(WILLOW_TINTS[Math.floor(this.rng() * 4)]), 'pop', delay + 0.35 + k * 0.08, seg.id, d.length() / 2);
        }
        break;
      }
      case 'picketEdge': {
        // A little white picket edging: knee-low, with one rail and pickets close together.
        this.post(seg, a.x, a.y, delay);
        this.post(seg, b.x, b.y, delay + 0.1);
        const pa = new THREE.Vector3(a.x, this.heightAt(a.x, a.y) + 0.17, a.y);
        const pb = new THREE.Vector3(b.x, this.heightAt(b.x, b.y) + 0.17, b.y);
        const d = pb.clone().sub(pa);
        const rq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.clone().normalize());
        this.fences.add('rail', pa.clone().add(pb).multiplyScalar(0.5), rq, new THREE.Vector3(d.length() + 0.02, 0.6, 0.7), new THREE.Color(PICKET_TINTS[Math.floor(this.rng() * 4)]), 'pop', delay + 0.25, seg.id, d.length() / 2);
        const gap = 0.075;
        const n = Math.floor((len - 0.08) / gap);
        const start = (len - n * gap) / 2;
        for (let i = 0; i <= n; i++) {
          if (this.rng() < 0.02) continue;
          const t = start + i * gap + (this.rng() - 0.5) * 0.008;
          const p = at(t, -0.022);
          p.y += 0.03;
          this.fences.add('picket', p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, (this.rng() - 0.5) * 0.06)), new THREE.Vector3(0.6, lerp(0.34, 0.38, this.rng()), 0.6), new THREE.Color(PICKET_TINTS[Math.floor(this.rng() * 4)]), 'pop', delay + 0.35 + i * 0.02, seg.id);
        }
        break;
      }
    }
  }

  /** A gate across an opening from a to b, hung on a and left a little ajar. */
  private gate(seg: Segment, a: THREE.Vector2, b: THREE.Vector2, delay: number) {
    if (seg.style === 'wall' || EDGE_STYLES.has(seg.style)) return; // walls and edgings just leave an opening
    const width = a.distanceTo(b);
    const dir = b.clone().sub(a).divideScalar(Math.max(width, 1e-6));
    if (seg.style === 'hedge') {
      // A hedge opening: two taller, rounded ends to walk between.
      for (const [p, s] of [[a, -1], [b, 1]] as const) {
        const x = p.x + dir.x * s * 0.15;
        const z = p.y + dir.y * s * 0.15;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.rng() * 6.28, 0));
        this.fences.add('hedge', new THREE.Vector3(x, this.heightAt(x, z) - 0.04, z), q, new THREE.Vector3(0.7, 1.22, 0.7), new THREE.Color(1, 1, 1), 'grow', delay + 0.2, seg.id);
      }
      return;
    }
    const pa = this.post(seg, a.x, a.y, delay, 1.12);
    this.post(seg, b.x, b.y, delay + 0.1, 1.12);
    if (!pa) return;
    // The gate swings open a little, inward, around its hinge post at a.
    const ajar = lerp(0.25, 0.45, this.rng());
    const cos = Math.cos(ajar);
    const sin = Math.sin(ajar);
    const gd = new THREE.Vector2(dir.x * cos - dir.y * sin, dir.x * sin + dir.y * cos);
    const leaf = width - 0.14;
    const g0 = a.clone().addScaledVector(gd, 0.07);
    const g1 = g0.clone().addScaledVector(gd, leaf);
    const gseg: Segment = { ...seg, a: g0, b: g1 };
    const d = delay + 0.45;
    // Hold the gate's heights level with the hinge post, as a hung gate does.
    const base = this.heightAt(a.x, a.y);
    const rail = (h0: number, h1: number, k: number) => this.rail(gseg, g0, h0 + base - this.heightAt(g0.x, g0.y), g1, h1 + base - this.heightAt(g1.x, g1.y), d + k * 0.06);
    // Upright stiles at both ends of the gate, so it reads as a gate, not loose rails.
    const gateYaw = Math.atan2(-gd.y, gd.x);
    const stile = (p: THREE.Vector2, h: number) => {
      const shape = seg.style === 'picket' ? 'picketPost' : 'logPost';
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, gateYaw, 0));
      const scale = seg.style === 'picket' ? new THREE.Vector3(0.7, h, 0.55) : new THREE.Vector3(0.6, h, 0.6);
      this.fences.add(shape, new THREE.Vector3(p.x, base + 0.14, p.y), q, scale, new THREE.Color('#ffffff'), 'pop', d - 0.05, seg.id);
    };
    stile(g0.clone().addScaledVector(gd, 0.03), seg.style === 'picket' ? 0.72 : 0.78);
    stile(g1.clone().addScaledVector(gd, -0.03), seg.style === 'picket' ? 0.72 : 0.78);
    if (seg.style === 'picket') {
      rail(0.22, 0.22, 0);
      rail(0.7, 0.7, 1);
      rail(0.24, 0.68, 2); // the brace
      const n = Math.floor(leaf / 0.12);
      const yaw = Math.atan2(-gd.y, gd.x);
      for (let i = 0; i <= n; i++) {
        const t = 0.04 + (i / n) * (leaf - 0.08);
        const x = g0.x + gd.x * t + gd.y * 0.035;
        const z = g0.y + gd.y * t - gd.x * 0.035;
        // Gate pickets rise to a gentle arch.
        const arch = Math.sin((t / leaf) * Math.PI) * 0.08;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
        this.fences.add('picket', new THREE.Vector3(x, base + 0.1, z), q, new THREE.Vector3(1, 0.8 + arch, 1), new THREE.Color('#ffffff'), 'pop', d + 0.2 + i * 0.03, seg.id);
      }
    } else {
      rail(0.3, 0.3, 0);
      rail(0.65, 0.65, 1);
      rail(0.95, 0.95, 2);
      rail(0.32, 0.92, 3); // the brace
    }
  }

  /** A path was drawn: open gates where it now crosses a fence. */
  repath(near: THREE.Vector2[]) {
    if (!near.length) return;
    // A post now standing in the path joins its two (nearly straight) runs into one, so the
    // crossing gets a gate with fence either side.
    for (let i = 0; i + 1 < this.segments.length; i++) {
      const s1 = this.segments[i];
      const s2 = this.segments[i + 1];
      if (s1.locked || s2.locked || s1.style !== s2.style || s1.b.distanceTo(s2.a) > 1e-3) continue;
      if (this.distanceToPaths(s1.b.x, s1.b.y) >= pathClear(s1.style)) continue;
      const d1 = s1.b.clone().sub(s1.a).normalize();
      const d2 = s2.b.clone().sub(s2.a).normalize();
      if (d1.dot(d2) < 0.9) continue;
      for (const p of [...this.fences.ownedBy(s1.id), ...this.fences.ownedBy(s2.id)]) this.fences.remove(p);
      const merged: Segment = { id: this.nextId++, style: s1.style, a: s1.a.clone(), b: s2.b.clone(), signature: '', first: s1.first, last: s2.last };
      this.segments.splice(i, 2, merged);
      this.build(merged, 0.2);
    }
    for (const seg of this.segments) {
      if (seg.locked) continue;
      const touched = near.some((p) => distToSegment(p, seg.a, seg.b) < pathClear(seg.style) + 1.5);
      if (!touched) continue;
      const sig = this.stretches(seg)
        .map((p) => `${p.kind}${p.from.toFixed(1)}`)
        .join('|');
      if (sig === seg.signature) continue;
      for (const p of this.fences.ownedBy(seg.id)) this.fences.remove(p);
      this.vines?.removeOwner(seg.id);
      this.build(seg, 0.2);
    }
  }

  /** Tidy up: fence within `r` of (x, z) goes; what's left of those stretches stays as it is. */
  erase(x: number, z: number, r: number) {
    const { owners, at } = this.fences.erase(x, z, r);
    this.vines?.erase(x, z, r + 0.1);
    for (const seg of this.segments) if (owners.has(seg.id)) seg.locked = true;
    return at;
  }
}

function distToSegment(p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2): number {
  const ab = b.clone().sub(a);
  const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-9)));
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}
