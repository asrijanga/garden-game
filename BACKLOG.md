# Garden Game — Product Backlog

A cozy, painterly, procedural garden builder for iPhone browsers, inspired by Tiny Glade.

This backlog breaks the vision into **small, demoable stories**. Each one ends with something you can open on your phone and react to. After each story: build → deploy → you review on device → feedback gets folded into the next story (or a polish story) before moving on.

---

## How we work

**Loop per story**
1. I build the story on a branch and deploy it to a preview URL.
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

## Technical decisions (proposed defaults, easy to change)

| Area | Decision | Why |
|---|---|---|
| Rendering | **Three.js** (WebGL2) | Mature, fast on iOS Safari, has instancing and post-processing. |
| Language/build | **TypeScript + Vite** | Fast dev loop and small static output. |
| Hosting | **GitHub Pages via GitHub Actions** | Static, free, no server, so you get a link to open on your phone. |
| World model | Grid/heightfield ground plus a list of placed "features" (paths, beds, trees…), each with a **seed** | Procedural uniqueness is reproducible: the same seed gives the same tree. This makes save and share small and exact. |
| Vegetation | GPU-instanced grass, flowers, and stones, with wind done in the vertex shader | The only way to get thousands of swaying blades at 60fps on a phone. |
| Look | Custom toon/painterly lighting, height fog, tilt-shift depth of field, bloom, color-grading LUT | Gives the storybook diorama feel. |
| Audio | Web Audio API, with procedural and lightweight sampled sounds | Needs one user tap to unlock on iOS, which happens naturally on the first touch. |
| Persistence | `localStorage`/IndexedDB with a **versioned, compact save format** | Designed so that the share link (later) is the same data, compressed into the URL. |

> **Note on hosting:** GitHub Pages on a *private* repo needs a paid GitHub plan. If the repo is private and you're on a free plan, we can make it public or use another static host. We'll sort this out in Story 1.

---

## Milestone 1 — MVP: "I touched it and something lovely happened"

Goal: a real, beautiful, playable toy on your phone as fast as possible. Paths, trees, and flowers in a gorgeous diorama, with camera controls and autosave.

### Story 1.1 — A tiny world on my phone (M)
**As a** player, **I want** to open a link on my iPhone and see a small, beautiful garden island in warm golden light, **so that** I immediately feel the mood of the game.

Acceptance criteria
- Vite + TS + Three.js project scaffolded; GitHub Actions deploys to Pages on push.
- Fullscreen canvas with safe-area insets respected (notch and home indicator). No zoom, scroll, rubber-banding, long-press callouts, or text selection.
- A soft, rounded diorama ground (a grassy island with gently rolling terrain and earthy, cut-away edges, Tiny Glade style).
- Golden-hour lighting: warm key light, cool sky fill, soft shadows, gentle height fog, a painterly sky gradient.
- A first pass at a few thousand instanced grass blades that sway in the wind.
- Tilt-shift depth of field and light bloom (simple versions).
- Device pixel ratio capped so it stays smooth.

Demo script: open the link on the phone, then add it to the home screen and open it again. Does it feel cozy? Is the color direction right?

---

### Story 1.2 — Hold the world in my hand (S)
**As a** player, **I want** to pan, pinch-zoom, and twist to rotate the garden with smooth inertia, **so that** it feels like a tiny diorama I'm turning in my hands.

Acceptance criteria
- One-finger drag on empty ground **pans** the camera (until a tool is selected; see 1.3).
- Two-finger pinch zooms and two-finger twist rotates, both with inertia and soft limits (no flipping under the world or flying off).
- Tilt-shift focus follows the center of the view.
- Camera motion is eased, never jerky.

Demo script: spin the garden, zoom in close, flick it and let it glide.

---

### Story 1.3 — Thumb-reach toolbar (S)
**As a** player, **I want** a beautiful, chunky toolbar at the bottom of the screen, **so that** I can switch what my finger does with one hand.

Acceptance criteria
- Bottom toolbar inside thumb reach, with large rounded "tactile" buttons, soft shadows, and a press/bounce animation.
- Tools (some are placeholders until their story ships): **Move** (camera), **Path**, **Flowers**, **Tree**, **Erase**.
- When a build tool is active, one finger builds and two fingers still move the camera.
- Icons are custom and illustrated-feeling, not system emoji.

Demo script: switch tools quickly; confirm that two-finger camera control always works.

---

### Story 1.4 — Draw a winding path (M)
**As a** player, **I want** to drag my finger to draw a path and watch stepping stones settle into place one by one, **so that** building feels magical.

Acceptance criteria
- Path stroke is smoothed into a gentle curve that follows the terrain.
- Stones are procedurally unique (shape, size, rotation, tint), placed along the curve with natural jitter.
- Each stone drops in **one after another**, with a soft squash-and-bounce and a small dust puff.
- The ground under the path becomes worn earth. Grass tufts, clover, and tiny flowers creep in along the edges over about 1–2 s.
- Crossing paths merge nicely; stones never pile up on top of each other.

Demo script: draw a long S-curve, then cross it with a second path.

---

### Story 1.5 — Plant a tree (M)
**As a** player, **I want** to tap to plant a tree that grows up from a sapling, **so that** every tree feels like my own.

Acceptance criteria
- Tap with the Tree tool to place a tree. It grows from the ground with an overshoot-and-settle animation.
- Procedural trees: trunk/branch structure plus clustered painterly foliage blobs. **No two are alike** (height, lean, canopy shape, hue variation from a curated palette).
- At least 2 tree types (e.g., round deciduous and a slender birch).
- Trees cast soft shadows. Foliage sways gently.
- Grass fades back slightly at the trunk base.

Demo script: plant a small grove and check the variety.

---

### Story 1.6 — Paint a blooming flower bed (M)
**As a** player, **I want** to paint a stroke of flowers and watch them bloom outward in a wave, **so that** the garden fills with color.

Acceptance criteria
- Painting with the Flowers tool creates a soft-edged bed area (rich soil plus a border).
- Flowers appear in a **wave** spreading out from the stroke: sprout → bud → petals unfurl.
- Procedural flower variety (petal count, size, height, color) drawn from **curated palettes** (e.g., "cottage pinks", "lavender & white", "sunny yellows").
- Instanced, sways with the wind, warm rim light on petals.

Demo script: paint a bed beside your path and wait for the wave.

---

### Story 1.7 — Gently erase (S)
**As a** player, **I want** to drag over things to remove them, and see them shrink back into the earth, **so that** mistakes feel harmless and still lovely.

Acceptance criteria
- Erase brush shows a soft circular cursor under the finger.
- Stones, flowers, and trees inside the brush shrink and sink away, with a small puff of soil or leaves.
- Partially erased paths and beds update cleanly. Edge grass grows back.

Demo script: erase half of a path and a corner of a flower bed.

---

### Story 1.8 — My garden is still here + a seed sprouting (S)
**As a** player, **I want** my garden to be saved automatically and to greet me with a charming loading moment, **so that** I can come back and relax.

Acceptance criteria
- Versioned, compact save format (features + seeds, not meshes). Autosaves after every change.
- On reload, the garden rebuilds **exactly**, with a quick staggered "regrow" animation.
- Loading screen: a small seed sprouting into a leaf while assets and shaders warm up, then a soft fade into the world.
- A small "New garden" option (behind a long-press or a tiny menu, with confirmation).

Demo script: build something, close Safari, reopen it from the home screen.

**🎉 MVP complete: a playable, beautiful garden toy.**

---

## Milestone 2 — More to build

### Story 2.1 — Hedges and wooden fences that build themselves (L)
**As a** player, **I want** to draw a line and watch a fence build itself post by post (or a hedge grow along it), **so that** I can shape spaces.

- Fence: posts land one by one, then rails slide in. Weathered, slightly irregular wood.
- Corners are detected automatically (sharp turns get corner posts). **Gates** appear automatically where a path crosses.
- Hedge variant: a leafy volume that grows up along the line, with soft, rounded tops.
- Toolbar gets a "Fence/Hedge" tool with a small style toggle.

### Story 2.2 — A little pond (L)
**As a** player, **I want** to tap or paint a pond, **so that** my garden has water.

- Terrain dips into an organic pond shape with a pebbled shoreline.
- Stylized water: soft reflections of the sky and trees, depth tint, gentle shoreline foam, idle ripples.
- Paths that run into a pond get stepping stones across it.

### Story 2.3 — Stone walls that crumble charmingly (M)
- Drawn like a fence. Stacked, irregular stones. The ends taper and crumble, with a few loose stones on the ground.

### Story 2.4 — Garden props: bench, lantern (M)
- Tap to place. Props auto-orient sensibly (benches face paths or ponds). Procedural variation in wear and color.
- A "props drawer" opens from the toolbar.

### Story 2.5 — Gazebo and arched bridge (L)
- Gazebo: a procedural little structure that assembles itself piece by piece.
- Bridge: drag across a pond (or a path over water) and an arched bridge builds itself span by span.

### Story 2.6 — Undo (S)
- An undo button (and maybe a two-finger tap) that reverses the last action with a reverse animation.

---

## Milestone 3 — A living world

### Story 3.1 — Wind you can see (M)
- Global gust system: rolling waves of wind sweep across the meadow, and grass, flowers, and trees respond together.
- Occasional petals and leaves carried on the breeze.

### Story 3.2 — The garden reacts to itself (L)
- **Water** grows reeds, cattails, and lily pads.
- **Shade** under trees grows ferns and mushrooms.
- **Stones** (path, walls) slowly gather moss.
- Changes appear gradually over time (seconds to minutes), so returning to the game feels rewarding.

### Story 3.3 — Creatures (L)
- Butterflies and bees drift between blooms (they're attracted to flower beds).
- Birds land on fences, hop, and fly off when you build nearby.
- Dragonflies skim the ponds and touch down with a ripple. Fish jump occasionally.

### Story 3.4 — Vines and climbing roses (M)
- Over time, vines creep along fences, walls, and the gazebo, and roses bloom on them.

---

## Milestone 4 — Time, seasons, and weather

### Story 4.1 — Time of day (L)
- A thumb-friendly sun dial or slider: dawn mist → golden afternoon → deep-blue dusk → night.
- Lighting, sky, fog, shadows, and color grading are all keyed to the time.

### Story 4.2 — Night magic (M)
- Lanterns glow with bloom, fireflies rise from the grass, stars fade in, and the moon rises.

### Story 4.3 — Seasons (L)
- One tap cycles the season, with a beautiful transition.
- Spring: cherry blossoms and drifting petals. Summer: lush. Autumn: amber leaves falling and piling up. Winter: quiet snowfall, frosted hedges, glowing gazebo windows.

### Story 4.4 — Weather (L)
- Soft rain with pond ripples and wet, shiny stones. Rolling fog banks. Clouds with sunbeams breaking through.
- Weather is chosen manually and also drifts gently on its own.

---

## Milestone 5 — Sound

### Story 5.1 — Ambient soundscape (M)
- Layered birdsong, wind, rain, and night crickets that cross-fade with the time of day and weather.
- Audio unlocks on the first touch. A mute toggle is available.

### Story 5.2 — Satisfying build sounds (M)
- Soft pops, rustles, stone clacks, and wood knocks, with randomized pitch so they never sound repetitive.
- Sounds are spatialized by screen position.

---

## Milestone 6 — Share, polish, ship

### Story 6.1 — Share my garden as a link (M)
- The share button compresses the save into a URL (iOS share sheet via `navigator.share`).
- Opening the link rebuilds the garden exactly, with a "regrow" intro. It never overwrites the recipient's own garden without asking.

### Story 6.2 — Admire mode (S)
- One tap hides the UI and starts a slow cinematic orbit with a gentle depth-of-field pull, made for screenshots.

### Story 6.3 — Home-screen app (S)
- PWA manifest, icon, splash screen, and status-bar styling. Works offline after the first load.

### Story 6.4 — Stays smooth everywhere (M)
- Automatic quality tiers (resolution scale, shadow quality, grass density, post-FX) driven by measured frame time, scaling smoothly instead of stuttering.

### Story 6.5 — The "wow" first 10 seconds (M)
- First launch with an empty save: the camera drifts in over a pre-seeded starter garden, wind sweeps through, and a butterfly passes by. Then a soft hint invites you to draw.
- An overall polish pass across all the moments that feel flat.

---

## Parking lot (ideas to revisit)
- Haptics (iOS Safari has limited vibration support; we'll investigate what's possible).
- More plant palettes and tree species.
- Photo mode with filters and a frame.
- Larger or expandable garden plots.
