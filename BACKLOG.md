# Garden Game — Product Backlog

A cozy, painterly, procedural **flower garden** for iPhone browsers, inspired by Tiny Glade.

This backlog breaks the vision into **small, demoable stories**. Each one ends with something you can open on your phone and react to. After each story: build → deploy → you review on device → feedback gets folded into the next story (or a polish story) before moving on.

---

## 📍 Status — where we are

> Keep this section up to date at the end of every working session. It is the hand-off point for the next session.

**Current story:** 1.2 — Hear the wind (built, awaiting review). Next: 1.4 toolbar.
**Preview URL:** https://asrijanga.github.io/garden-game/ (add `?season=spring|summer|autumn|winter` to preview other seasons)

| Story | Status | Notes / feedback |
|---|---|---|
| 1.1 A cozy clearing in the forest | ✅ Done | v3: procedural branching trees with leaf-cluster crowns, firs with jagged tiers, birches; tilt-shift blur removed. Wind and mood approved. |
| 1.2 Hear the wind | 👀 Awaiting feedback | Procedural Web Audio: air bed, gust whoosh, canopy rush, leaf flurries, all driven by the wind field at the view centre. A whisper (calm about −40 dBFS) plus rare distant synthesised birdsong, seasonal pace. Limiter, 4 s fade-in. Sound toggle top-right (remembered) and a one-time hint. |
| 1.3 Hold the world in my hand | ✅ Done | Pulled forward (player asked to zoom). Pinch zoom, drag pan, twist rotate, inertia; camera lowers as you zoom in. |
| 1.4 Thumb-reach toolbar | ⬜ Not started | |
| 1.5 Draw a winding path | ⬜ Not started | |
| 1.6 Plant flowers that bloom fast | ⬜ Not started | |
| 1.7 A cozy garden pond | ⬜ Not started | |
| 1.8 Gently erase | ⬜ Not started | |
| 1.9 Autosave + seed sprouting | ⬜ Not started | |
| 2.x – 6.x | ⬜ Not started | See milestones below |

Status legend: ⬜ Not started · 🔨 In progress · 👀 Awaiting feedback · ✅ Done

### Feedback log
_Feedback from each review, newest first, and what we changed because of it._

- **Grass review 2 (real iPhone screenshot):**
  - *Feedback:* No blades, but the grass looks honestly horrible (on device, thin blades aliased into scratchy hatching and the meadow looked blotchy).
  - *Changes:* Painterly lawn. Ground carries the lawn colour (no dark soil showing). Blade colour is within ±6% of the ground, with only slightly lighter, warmer tips. Tufts of 3 broader, soft blades (no shimmering lines). Broad, gentle colour drifts only. Fresher seasonal meadow greens. Softer wind sheen.
  - *Lesson:* Judge grass at real phone resolution. Low blade-to-ground contrast matters more than blade count.
- **1.2 review 2 (sound):**
  - *Feedback:* Even calmer: "so calm I should hear the birds chirping once in a while". Right now it makes me tense; it should be absolutely relaxing.
  - *Changes:* Wind reduced to a whisper (calm about −40 dBFS, gust about −38 dBFS, about 2–3 dB swell; leaf hiss effectively removed; slower 3 s smoothing). Added rare, distant, synthesised **birdsong** (two-note whistle, warble, trill, chirps) with a per-bird voice, random position, a soft forest reverb and occasional answering birds. Paced by the real audio clock: every 7–17 s in spring, 11–27 s in autumn, rarer in winter.
- **Grass review:**
  - *Feedback:* Grass should be much finer, denser and smaller; it looks like thorns.
  - *Changes:* Single wide blades replaced by tufts of 5 fine blades (about 2.5× the blade count). Height 0.28–0.6 → 0.2–0.38 m. Blades about 6 cm wide with soft rounded tips. Less tilt, gentler root-to-tip contrast and colour variation. Soil under the lawn slightly darker so blades read as texture.
- **1.2 review (sound):**
  - *Feedback:* The wind is too intense; it must be much, much calmer, very subtle and relaxing.
  - *Changes:* Master volume 0.75 → 0.3. Gust swell about 8 dB → about 4 dB. All layers low-passed lower (less hiss). Leaf rustle cut to a whisper. Parameter changes smoothed over about 2 s, so it ebbs and flows. Calm is now about −35 dBFS and a full gust about −30 dBFS (was −27 and −19).
- **Busy-ness review (during 1.2):**
  - *Feedback:* Way fewer trees and way more space in the middle; it looks very busy, and fewer trees is easier on the phone.
  - *Changes:*
    - Clearing radius 16 → 21 m (about 1.7× the garden area).
    - Tree spacing 3.1 → 4.1 m (about a third fewer trees overall, and fewer detailed ones).
    - Neighbouring trees share hues (noise-clustered palette), so the forest reads as calm colour patches.
    - Softer, lower-contrast leaf texture.
    - Mossy autumn forest floor instead of brown.
    - More top-down default view (64°), so less far forest is on screen.
- **1.1 v3 + 1.3 review:** "Looks good, next." 1.1 and 1.3 marked done.
- **1.1 v3 review (space):**
  - *Feedback:* Is the patch usable space? Wants a smaller house or a larger garden.
  - *Changes:* Clearing radius 13 → 16 m (about 1.6× more garden). Cottage scaled down about 25% and tucked further back against the treeline. Grass and wildflowers scaled to the new area.
- **1.1 v2 review, round 2:**
  - *Feedback:* Wind effect is great. Overall mood is spot on. Wants to zoom. The edge blur is "really horrible": no blur at all. Trees lack detail, and they are the majority of the screen.
  - *Changes:*
    - Tilt-shift removed entirely (Definition of Done: no blur effects).
    - Trees rebuilt: recursive branching wood (trunk → limbs → twigs, bent segments), crowns made of dense leaf-cluster cards with spherical normals and interior shading, and per-leaf shimmer in the wind. Firs with layered, drooping, jagged tiers plus needle tufts. White birches. Winter shows bare branches. Near and far detail levels.
    - Story 1.3 camera pulled forward.
- **1.1 v2 review (forest clearing):**
  - *Feedback:* Chimney smoke is a nice touch. The home should be simple but upgradable, with variations; the garden and its objects are the focus. "No island, just land." Wants a calm, soothing wind sound plus trees whooshing as the background, with wind-chime sounds only when chimes are placed. Relaxation and calm are the goal. Trees lack detail (message was cut off; waiting on the rest).
  - *Changes:*
    - Deploy fixed: it now publishes from `main` (see CLAUDE.md).
    - New **Story 1.2 "Hear the wind"** (ambient wind and tree sound driven by the wind field), moved up into the MVP.
    - New **Story 2.7 "My cottage, my way"** (variations and upgrades).
    - Tree detail pass queued for 1.1 v3.
- **1.1 v1 review (floating island):**
  - *Feedback:* Prefers Tiny Glade's framing: a dense forest all around with a garden patch in the middle and a cozy home. No floating island and no empty orange background; use the space. Wants subtle, natural wind that makes the grass wavy, and a real airflow model so future flags flutter, settle and gust again, and wind chimes play with the wind. Wants a procedurally built cozy pond with rocks and jumping fish. Wants wildflowers in empty, unbuilt grass. The collection is **only flowers** (no vegetables or other plants), and a huge one. Seasons follow the **real current season** (autumn has autumn colors). The world moves fast: plants grow and flowers bloom quickly.
  - *Changes:*
    - 1.1 rebuilt as a forest clearing with a cottage.
    - New shared **wind field** (moving gust patches plus a calm/gust "breathing" cycle) that both the GPU and game code read, ready for flags and chimes.
    - **Real-season palettes** (hemisphere aware), with seasonal wildflowers.
    - Backlog reshaped: the tree tool is replaced by flowers, the pond moves into the MVP (1.7), flags and wind chimes get their own story (3.1), and the flower collection and real seasons get their own milestone (4).

---

## Product principles (from feedback)
- **Relaxing above all.** No goals, no fail state. Every touch is rewarded with something lovely.
- **No empty space.** The garden sits in a clearing inside a dense forest, and the screen is always full of life.
- **Flowers are the collection.** No vegetables, crops or utility plants: a huge, ever-growing set of flowers.
- **The real season.** The garden reflects the player's actual season (hemisphere aware). Each flower blooms in its own seasons, and autumn looks like autumn.
- **A fast world.** Things sprout, grow and bloom in seconds to minutes, not days.
- **One air.** Grass, flowers, trees, smoke, flags and wind chimes all respond to the same moving gusts.

---

## How we work

**Loop per story**
1. I build the story and deploy it to the preview URL.
2. You open it on your iPhone and try the "Demo script" for that story.
3. You give feedback. Small tweaks happen immediately; bigger ideas become new stories.
4. Story is marked done and we move to the next one.

**Definition of Done (every story)**
- Works in iOS Safari, portrait, on a modern iPhone, at a smooth frame rate.
- No page zoom, scroll, bounce, or text selection from touches.
- Looks intentional: soft palette, no placeholder-grey boxes left in view.
- Deployed to the preview URL with a short note of what changed and what to try.
- Doesn't break any earlier story.

**Sizes:** S = small, M = medium, L = large. These are rough and only meant for comparing stories.

---

## Technical decisions

| Area | Decision | Why |
|---|---|---|
| Rendering | **Three.js** (WebGL2) | Mature, fast on iOS Safari, has instancing and post-processing. |
| Language/build | **TypeScript + Vite** | Fast dev loop and small static output. |
| Hosting | **GitHub Pages via GitHub Actions** (pushing `main` deploys; work happens on `master` and is mirrored with `git push origin master:main`) | Static, free, no server. |
| World layout | Meadow **clearing** (radius ~21 m) inside a dense instanced forest, with the cottage at the back edge | Matches the Tiny Glade framing: the garden is the clearing. |
| World model | Placed "features" (paths, flowers, pond…), each with a **seed** | Procedural uniqueness is reproducible: the same seed gives the same flower. Save and share stay small and exact. |
| Wind | `WindField`: a tileable gust-noise texture scrolling with the wind, times a slow global calm/gust envelope. Sampled identically on GPU (`gardenWind()`) and CPU (`WindField.sample()`) | One airflow drives everything: grass waves now, and flags and chimes later. |
| Seasons | `currentSeason()` from the device date and time zone (southern hemisphere flips). `?season=` overrides | "The season should reflect what the current season is." |
| Vegetation | GPU-instanced grass and wildflowers. Trees are procedural archetypes (branching wood + alpha-tested leaf-cluster cards from canvas textures), instanced with per-tree size, lean, yaw and color, with near/far detail levels. Wind in the vertex shader | Tens of thousands of swaying blades at 60fps on a phone. |
| Look | Soft Lambert lighting, neutral tone mapping, bloom, warm grade. **No blur effects** (player feedback) | Storybook diorama feel, crisp everywhere. |
| Audio | Web Audio API, procedural (filtered noise for wind and leaves; synthesized chimes later) | Nothing to download. Unlocks on the first touch. Driven by `WindField`. |
| Persistence | `localStorage`/IndexedDB with a **versioned, compact save format** | The share link (later) is the same data, compressed. |

---

## Milestone 1 — MVP: "A cozy garden I can touch"

### Story 1.1 — A cozy clearing in the forest (M) — *rebuilt after feedback*
**As a** player, **I want** to open the game and see my little home in a sunny meadow, wrapped in a dense forest in this season's colors, **so that** I immediately feel cozy and want to start gardening.

Acceptance criteria
- Meadow clearing in the middle, a **dense procedural forest** all around (broadleaf trees in seasonal colors, evergreens, a bushy fringe). No empty background anywhere.
- A **cozy cottage** at the back of the clearing: stone plinth, plaster and timber walls, shingled roof, shutters, flower boxes, glowing windows, a lantern, and **chimney smoke** drifting with the wind.
- **Subtle, natural wind:** gusts roll across the meadow as visible waves, then settle into calm spells. Trees rustle gently.
- **Wildflowers** dot the untended grass, in this season's colors.
- Forest, meadow, wildflowers and light all follow the **real current season**.
- Fullscreen, safe-area aware, no zoom, scroll or selection.

Demo script: open it on the phone. Watch a gust sweep the grass and the smoke lean. Try `?season=spring` and compare.

---

### Story 1.2 — Hear the wind (S) — *moved up: calm is the goal*
**As a** player, **I want** a calm, soothing bed of wind and rustling trees behind everything, **so that** the garden relaxes me the moment I open it.

- Soft, layered wind ambience: a low airy bed plus treetop "whooshes" that **swell with each gust and fade in the calm**, driven by the same `WindField` envelope the grass uses, so what you hear matches what you see.
- Leaves rustle gently, panned slightly left and right. No music. Rare, distant birdsong (added after feedback).
- Generated with Web Audio (filtered noise), so nothing to download. Starts softly on the first touch (iOS needs a tap to unlock audio). A small mute toggle.
- Volume never spikes. It should feel like sitting by an open window.

Demo script: open the garden, put the phone down, and listen through a few gust cycles.

---

### Story 1.3 — Hold the world in my hand (S)
**As a** player, **I want** to pan, pinch-zoom, and twist to rotate around my clearing with smooth inertia, **so that** it feels like a tiny diorama I'm turning in my hands.

- One finger drag pans (until a tool is selected; see 1.4). Two-finger pinch zooms and twist rotates, both with inertia and soft limits that keep the clearing in view.
- Zooming in close lowers the camera angle a little, for a cozier view of the flowers. Tilt-shift focus follows the view center.

Demo script: zoom right into the flower boxes on the cottage, spin around, flick and let it glide.

---

### Story 1.4 — Thumb-reach toolbar (S)
**As a** player, **I want** a beautiful, chunky toolbar at the bottom of the screen, **so that** I can switch what my finger does with one hand.

- Large rounded "tactile" buttons with a press/bounce animation, inside thumb reach.
- Tools (placeholders until their story ships): **Move**, **Path**, **Flowers**, **Pond**, **Erase**.
- When a build tool is active, one finger builds and two fingers still move the camera.
- Custom illustrated icons, not emoji.

---

### Story 1.5 — Draw a winding path (M)
**As a** player, **I want** to drag my finger to draw a path and watch stepping stones settle into place one by one, **so that** building feels magical.

- The stroke is smoothed into a gentle curve that follows the ground. Procedurally unique stones drop in **one after another** with a soft squash-and-bounce and a dust puff.
- The ground under the path becomes worn earth. Grass tufts, clover and tiny flowers creep in along the edges. Wildflowers step aside.
- Crossing paths merge nicely. A path that reaches the cottage door connects to the doorstep.

---

### Story 1.6 — Plant flowers that bloom fast (M)
**As a** player, **I want** to paint flowers and watch them bloom outward in a wave within seconds, **so that** the garden fills with color right away.

- Painting creates a soft-edged bed. Flowers appear in a **wave** from the stroke: sprout → bud → petals unfurl, all within a few seconds.
- A **starter set of about 8 flower species** (for example tulip, daisy, lavender, poppy, cosmos, aster, chrysanthemum, foxglove). Each is procedurally varied: petal count, size, height and color within its palette.
- Each species has **bloom seasons**. In-season flowers bloom fully. Out-of-season flowers show foliage and buds (for example, asters and chrysanthemums shine in autumn).
- A simple species picker above the toolbar.
- Flowers sway in the shared wind.

Demo script: paint a bed of autumn flowers by the cottage and watch it bloom.

---

### Story 1.7 — A cozy garden pond (L)
**As a** player, **I want** to draw a pond and watch water fill it, ringed with rocks, with fish that jump, **so that** I have a calm place to watch.

- Draw or tap a shape. The ground dips into an organic basin, then water fills it with a gentle rise.
- **Procedural rocks** settle around the shoreline (varied sizes, mossy tops). Pebbles show in the shallows.
- Stylized water: sky and tree reflections, depth tint, soft shoreline foam, wind-driven ripples that follow the same gusts.
- **Fish** glide beneath the surface and occasionally **jump** with a splash and expanding ripples.
- Lily pads and reeds appear over the following seconds.

Demo script: draw a pond next to the path and wait for the first fish to jump.

---

### Story 1.8 — Gently erase (S)
- Erase brush with a soft cursor. Things inside shrink and sink back into the earth with a little puff. The grass grows back and wildflowers return to the empty grass.

---

### Story 1.9 — My garden is still here + a seed sprouting (S)
- Versioned, compact save format (features + seeds). Autosaves after every change, and the garden rebuilds exactly on reload with a staggered "regrow" animation.
- Loading screen: a small seed sprouting while assets and shaders warm up, then a soft fade into the world.
- A "New garden" option behind a long-press, with confirmation.

**🎉 MVP complete: a cozy, playable flower garden.**

---

## Milestone 2 — More to build

### Story 2.1 — Hedges and wooden fences that build themselves (L)
- Draw a line: the fence builds post by post (weathered wood) or a hedge grows along it. Corners are detected automatically, and **gates** appear where a path crosses.

### Story 2.2 — Rocks and boulders (S)
- Tap to place procedurally unique rocks and boulder clusters that settle with a thud. Moss grows on them over time.

### Story 2.3 — Stone walls that crumble charmingly (M)
- Stacked irregular stones, with ends that taper and crumble.

### Story 2.4 — Garden props: bench, lantern, birdhouse (M)
- Tap to place. Props auto-orient sensibly (benches face paths or the pond). A "props drawer" opens from the toolbar.

### Story 2.5 — Gazebo and arched bridge (L)
- A gazebo that assembles itself. An arched bridge that builds itself across a pond.

### Story 2.6 — Undo (S)

### Story 2.7 — My cottage, my way (M)
- The home stays simple (the garden is the focus), but you can **tap it to cycle variations**: roof color and material, wall color, shutters, door, and chimney.
- Small **upgrades** you can add: a porch, a bay window, window flower boxes, climbing roses, a little extension or lean-to shed.
- Each variation is seeded, so it saves and shares exactly.

---

## Milestone 3 — A living world

### Story 3.1 — Air you can feel: flags and wind chimes (M)
- Place a **flag/pennant**: cloth simulation driven by `WindField.sample()`. It streams out in a gust, droops and settles in the calm, then lifts again.
- Place **wind chimes** (on the cottage eaves or a post): the tubes swing with the local wind and **ring** when they touch, with sound from Web Audio, pitched by tube length.
- Optional: wind visualized by drifting leaves and petals that ride the gusts.

### Story 3.2 — Wildflowers reclaim empty grass (M)
- Untended meadow slowly fills with seasonal wildflowers. Built areas push them back, and erased areas invite them in again.
- Shade under the forest edge grows ferns and mushrooms, and stones gather moss.

### Story 3.3 — Creatures (L)
- Butterflies and bees drift between blooms. Birds land on fences and the cottage roof. Dragonflies skim the pond.

### Story 3.4 — Vines and climbing roses (M)
- Vines creep along fences, walls and the cottage, and roses bloom on them.

---

## Milestone 4 — A world of flowers, through the real seasons

### Story 4.1 — A huge flower collection (L)
- Grow the collection to **50+ species**, with a data-driven species definition (shape generator, palettes, height, bloom seasons). No vegetables or utility plants.
- A beautiful **flower book** to browse and pick species, sorted by "blooming now".

### Story 4.2 — Real seasons, beautifully (L)
- Seasons already follow the real date (from 1.1). Add the full feel: **spring** cherry blossoms and drifting petals, **summer** lush and buzzing, **autumn** amber leaves falling and gathering, **winter** quiet snowfall, frosted hedges and snow on the roof, with glowing windows.
- Flowers change with the season: some bloom, some fade to seed heads, some rest.
- A hidden "peek at another season" toggle, for fun and screenshots.

### Story 4.3 — Time of day (L)
- A thumb-friendly sun dial: dawn mist → golden afternoon → dusk → night.

### Story 4.4 — Night magic (M)
- The cottage windows and lanterns glow, fireflies rise, and stars come out.

### Story 4.5 — Weather (L)
- Soft rain with pond ripples and wet, shiny stones. Rolling fog. Sunbeams through clouds.

---

## Milestone 5 — Sound

### Story 5.1 — Richer ambience (M)
- Builds on 1.2's wind bed: gentle seasonal layers (soft birdsong in spring, crickets at night, rain), always subtle and never busy.

### Story 5.2 — Satisfying build sounds (M)
- Soft pops, rustles, stone clacks, water plops, and fish splashes.

---

## Milestone 6 — Share, polish, ship

### Story 6.1 — Share my garden as a link (M)
### Story 6.2 — Admire mode: a slow cinematic orbit with no UI (S)
### Story 6.3 — Home-screen app: PWA manifest, icon, offline support (S)
### Story 6.4 — Stays smooth everywhere: automatic quality tiers (M)
### Story 6.5 — The "wow" first 10 seconds (M)

---

## Parking lot (ideas to revisit)
- Haptics (iOS Safari has limited vibration support).
- Photo mode with filters and a frame.
- Expandable clearing (push the forest back as the garden grows).
- Decorative tree placement (removed from the MVP: the collection is flowers).
