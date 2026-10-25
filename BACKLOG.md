# Garden Game — Product Backlog

A cozy, painterly, procedural **flower garden** for iPhone browsers, inspired by Tiny Glade.

This backlog breaks the vision into **small, demoable stories**. Each one ends with something you can open on your phone and react to. After each story: build → deploy → you review on device → feedback gets folded into the next story (or a polish story) before moving on.

---

## 📍 Status — where we are

> Keep this section up to date at the end of every working session. It is the hand-off point for the next session.

**Current story:** 1.6 — Plant flowers that bloom fast (built, awaiting review). Next: 1.7 pond.
**Preview URL:** https://asrijanga.github.io/garden-game/ (add `?season=spring|summer|autumn|winter` to preview other seasons)

| Story | Status | Notes / feedback |
|---|---|---|
| 1.1 A cozy clearing in the forest | ✅ Done | v3: procedural branching trees with leaf-cluster crowns, firs with jagged tiers, birches; tilt-shift blur removed. Wind and mood approved. |
| 1.2 Hear the wind | ✅ Done | Procedural Web Audio: air bed, gust whoosh, canopy rush, leaf flurries, all driven by the wind field at the view centre. A whisper (calm about −40 dBFS) plus rare distant synthesised birdsong, seasonal pace. Limiter, 4 s fade-in. Sound toggle top-right (remembered) and a one-time hint. |
| 1.3 Hold the world in my hand | ✅ Done | Pulled forward (player asked to zoom). Pinch zoom, drag pan, twist rotate, inertia; camera lowers as you zoom in. |
| 1.4 Thumb-reach toolbar | ✅ Done | Frosted tray with 5 illustrated tactile buttons (Look around, Path, Flowers, Pond, Tidy up), squash/bounce and lift/glow, floating label, soft wooden tap sound. Build tools: one finger touches the lawn (glowing ring, ripple on release), two fingers move the camera. Unbuilt tools say "coming soon". |
| 1.5 Draw a winding path | ✅ Done | Back to basics: rounded-square stones down the middle, pale gravel on both sides, simple cut-stone edging. Starts exactly where you touch, with light smoothing. Settle animation + soft sound; clover along the outside. |
| 1.6 Plant flowers that bloom fast | 👀 Awaiting feedback | Paint beds of soil; flowers sprout, bud and unfurl in a wave (GPU-animated, ~3 s) with a soft pentatonic chime. 14 species with distinct silhouettes (pom-poms, dahlias, pansy faces, cone-centred black-eyed Susans, sedum domes, anemones, spikes, daisies…) × 5 shape variants, per-plant colour/size/yaw. Real seasons: in-season species bloom, others stay in bud. Picker chips above the toolbar (seasonal mix first, green badge = blooming now). Beds avoid paths; wildflowers step aside. |
| 1.7 A cozy garden pond | ⬜ Not started | |
| 1.8 Gently erase | ⬜ Not started | |
| 1.9 Autosave + seed sprouting | ⬜ Not started | |
| 2.x – 6.x | ⬜ Not started | See milestones below |

Status legend: ⬜ Not started · 🔨 In progress · 👀 Awaiting feedback · ✅ Done

### Feedback log
_Feedback from each review, newest first, and what we changed because of it._

- **1.6 review 3:** *Feedback:* Flowers reflect a lot of light; add black-brown mulch to beds instead of brown ground. *Changes:* Petal glow 0.24 → 0.07 (foliage 0.25 → 0.1). Petal tip brightness capped (1.12 → 0.98), so nothing trips the bloom pass. Petals read matte. Beds are now black-brown bark mulch: rotated, stretched shreds, scattered lighter bark chips, fine crumbs, and a tucked-in edge.
- **Bees (requested during 1.6, pulled from 3.3):** honeybees, round fuzzy bumblebees (white tail) and small dark mason bees. They only visit open, in-season blooms; bob and wander between nearby flowers; hover a few seconds; sometimes fly off into the woods while new ones arrive. About 1 bee per 25 open blooms, up to 8. Storybook scale (5.5×). A faint, soft buzz only when the camera is close to a bee.
- **iPad review:** *Feedback:* Sound isn't working on iPad; there are some bugs with sound; the flower menu is aligned left on bigger screens. *Changes:*
  - Audio session set to "playback" (Safari 16.4+) so Silent Mode doesn't mute the garden. Trade-off: like a video, it may pause other apps' music.
  - Every touch, click or key (not just the first) now wakes audio that iOS paused (app switch, lock screen, calls).
  - Unmuting after the page was hidden now resumes the audio context (was a real bug).
  - Flower chips are centred when they fit; on screens ≥ 700 px they wrap into centred rows; phones keep the sideways scroll.
  - Verified in a browser: audio resumes after a simulated iOS pause, and the picker is centred at iPad size.
- **Wind review (during 1.6):** *Feedback:* The wind on the flowers is too wavy and harsh: make it very subtle, with each flower moving a little later, like a wave passing through the meadow. The wind can change direction through the day, and get a little more intense (not too much) or slow. *Changes:* Flower sway cut to about a third (height scale 0.5 → 0.17). Flutter slowed (3.1/5.3 → 1.6/2.5 rad/s) and softened (0.12 → 0.05). A travelling wave (~7 m wavelength, ~2.2 m/s) rolls through in the wind direction, so each plant leans after its upwind neighbour. Direction now swings slowly (about 117° over an hour), with the gust field's drift integrated so it never jumps. A slow "mood" scales strength between calmer and slightly breezier spells (envelope still capped). Tree leaf shimmer slowed too.
- **1.6 review 2:** *Feedback:* The flowers all look the same, just different colours. *Cause:* every autumn species was the same flat daisy ring. *Changes:* Distinct silhouettes per species: domed pom-poms (chrysanthemum), layered pointed balls (dahlia, new), tilted two-tone faces with a dark blotch (pansy), notched wide petals on tall stems (cosmos), drooping petals round a dark cone (black-eyed Susan, new), flat domes of tiny florets (sedum, new), cupped petals with a stamen ring (anemone, new), blue spikes (salvia, new), fine-petalled asters. 14 species, 5 geometry variants each, varying layers, openness and tilt. The autumn mix now holds 9 different shapes. Picker icons match each silhouette.
- **1.6 review:** *Feedback:* A lot of brown soil and very few flowers; each flower could be more detailed and beautiful; it looks dry and unnatural. *Changes:* Dense leafy foliage clumps (seasonal greens) planted first in every bed, so beds read lush and green. About 1.5× more flowers, packed closer. Petals rebuilt: 7-row rounded outline, soft centre crease, a per-petal curl and twist, colour deepening toward the heart. Green sepals under blooms. Petals (and a little of the foliage) glow softly, like sunlight through thin petals, so colours stay vivid in shade. Smaller, richer, darker bed soil. Out-of-season species show plump, half-open coloured buds.
- **1.5 review 8 (during 1.6):** *Feedback:* Remove the width changing depending on how long you hold; it creates thick, ugly paths. *Cause:* additive paint dabs built up wherever the path re-covered ground. *Changes:* paint dabs are opaque and max-blended, so width is fixed however you draw; gravel radius retuned to end under the edging. Test also showed wiggling in place made loops, so the walker now needs the finger to lead by 55 cm, ignores targets behind it, and finishes where the finger lifts. User moved on to 1.6, so 1.5 is marked done.
- **1.5 review 7:** *Feedback:* (1) Multiple paths in the same place don't merge neatly; they lie on top of each other, and merge points need to join neatly and procedurally. (2) The edging looks too robotic: make it very subtle, with randomness and a hand-done effect. (3) Increase the spacing. (4) At merge points create curves: curves are natural. Note in CLAUDE.md that we emulate human, hand-done work. *Changes:* Path centre lines kept in a spatial hash. Inside another path, a new path lays no stones or edging of its own and lifts the old path's edging out of its gravel, so they join as one gravel area edged only outside. **Curved junctions:** within about 2.4 m of another path, gravel and edging flare out gradually (subtle: starts about 1.6 m out, widens about 40%), so the edging rounds the corner gently; this works when branching off too. Edging is now low and slim (about 10 cm), with varied block lengths (26–46 cm), random nudges, twists and set height, varied tones and the odd missing block. Centre stone spacing 0.58 → 0.8 m. CLAUDE.md gains the "emulate human, hand-done work" and "keep tools predictable" ground rules.
- **1.5 review 6:** *Feedback:* The centre stones are too sharp; curve the edges and make them realistic, not all exactly the same cut. *Changes:* 8 hand-dressed stone shapes: superellipse rounded-square outlines with a different roundness per corner, gently wobbling sides, and soft 3-segment bevelled edges. Each placed stone also gets a random twist, a 90° flip, and slightly different proportions and height.
- **1.5 review 5:** *Feedback:* "Something is wrong, the path is not being drawn from the point I chose. I'm making this too difficult; remove all these changes and go back to basics: a simple pathway with a squarish or rounded-square stone in the centre, gravel on the sides, and simple edging." *Cause:* starting within 3.5 m of the cottage snapped the path to the doorstep, and crazy-paving rows were laid about 1.2 m behind the finger. *Changes:* Removed crazy paving, door snapping, turn limits and walker-waiting. New simple path: the first stone lands exactly at the touch point; rounded-square stones (3 variants) every 0.58 m down the centre; speckled pale gravel on both sides; rounded cut-stone edging on both sides (kept the "never bridge across the path" fix); clover outside. *Lesson:* keep build tools predictable: the result must start under the finger.
- **1.5 review 4:** *Feedback:* Flagstones are all square or rectangular; they should be randomly cut in different shapes but align together into a path. Bug: edging stones sometimes appear in the middle. *Changes:* **Crazy paving**: flagstones are Voronoi cells laid out in path coordinates (s along, t across) from deterministic seeds and bent along the centre line, so every stone is a unique polygon and neighbours share edges even around bends. Each stone is bevelled geometry appended into a few big buffers (one draw call each), with the drop and settle animated in the vertex shader. *Bug fix:* when a sharp turn swapped the walker's sides, the edging bridged across the path; it now detects the jump and restarts, never places edging inside the paved band, and own-path edging is no longer cleared by its own slabs. Turning radius capped at about 1.05 m (no folded paving on hairpins), and the walker waits rather than circling when the finger is inside its turning circle.
- **1.5 review 3:** *Feedback:* Random styles are confusing. Use one pathway type, flagstones, with moss growing in between at random places to look neat, and a border of neatly cut stones. Additional styles that blend procedurally come later. *Changes:* Single flagstone style: rows of 2–3 hand-cut bevelled slabs (6 irregular polygon shapes, some moss-tinted) fitted across the path; moss patches in the joints (shader); rounded cut-stone edging on both sides, spaced per side so it follows curves; neat end caps; crossing paths lift the other path's edging so the paving joins. Grass meets the edging (low edge raggedness). Random styles removed (parked).
- **1.5 review 2:** *Feedback:* Stones in the pathway are too big; wants more variety of stones and pathways, random. *Changes:* Each new path randomly picks a style: **stepping stones** (smaller flat stones), **cobbles** (packed small pebbles), **flagstones** (slate slabs in pairs), **gravel trail** (sandy soil + tiny pebbles), **mossy stones** (angular, green-grey). Three stone families (flat, pebble, angular/faceted), 5 shapes each. Spatial-hash overlap checks. Sandy soil via the paint G channel. Pebble sounds softer and rate-limited.
- **1.5 review:** *Feedback:* Path edges look too clean; make the outline rough so it looks realistic. *Changes:* Lighter, gradually accumulating paint dabs give a gentle edge ramp. The lawn shader displaces the boundary with four octaves of procedural noise (outline wobble down to fine nibbles), adds a darker trodden-soil lip at the turf line, and paints extra scuffs along both edges.
- **1.4 review 2:** "That looks awesome." 1.4 done.
- **1.4 review:** "Buttons work, looks great!" *Feedback:* The tap feedback on the grass is too big; it suggests the workable area is a small section. *Changes:* Touch ring shrunk about 60% (radius 0.017× camera distance), thinner ring with a tiny bright centre glint, smaller ripple on release.
- **Lawn + birds review:** "Perfect, next story." Lawn and 1.2b done.
- **Grass review 4:** *Feedback:* Remove the blade texture entirely; make it so fine it's just noise. *Changes:* Grass blade geometry removed. The lawn is now a painted ground shader: mip-mapped two-scale fine grain (melts to smooth colour at distance, never shimmers) plus a soft gust sheen driven by the shared wind field. Wildflowers sit low on the lawn. Big GPU saving (about 190k blades gone).
- **Grass review 3:** *Feedback:* Even thinner or smaller: individual blades should not be visible from the default height. *Changes:* Blade width 10 → 4.4 cm, height 0.22–0.4 → 0.12–0.24 m, 4 blades per tighter tuft. Reads as a smooth velvet lawn when zoomed out, with soft blades only up close.
- **1.2 review 3:** "This is beautiful sound." 1.2 done. *Request:* random birds flying in and out of frame, very rare: small beautiful birds or a flock. → Built as 1.2b (`FlyingBirds`): a songbird, a pair, or a 5–9 bird loose V-flock on a curved path at 14–28 m, flap/glide cycles, banking, soft shadows, storybook scale (2.1×), every 30–75 s (first after about 15 s).
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
- **Hand-made, not machine-made.** Organic curves, gentle irregularity, no two pieces alike, and soft curved junctions (see CLAUDE.md ground rules).
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
| Wind | `WindField`: a tileable gust-noise texture drifting with the wind (integrated offset), times a slow calm/gust envelope and a slower mood, plus a travelling wave; the direction swings slowly over minutes. Sampled identically on GPU (`gardenWind()`) and CPU (`WindField.sample()`) | One airflow drives everything: grass waves now, and flags and chimes later. |
| Seasons | `currentSeason()` from the device date and time zone (southern hemisphere flips). `?season=` overrides | "The season should reflect what the current season is." |
| Vegetation | Lawn is a painted ground shader (fine grain + wind sheen), no blade geometry. GPU-instanced wildflowers. Trees are procedural archetypes (branching wood + alpha-tested leaf-cluster cards from canvas textures), instanced with per-tree size, lean, yaw and color, with near/far detail levels. Wind in the vertex shader | Tens of thousands of swaying blades at 60fps on a phone. |
| Look | Soft Lambert lighting, neutral tone mapping, bloom, warm grade. **No blur effects** (player feedback) | Storybook diorama feel, crisp everywhere. |
| Audio | Web Audio API, procedural (filtered noise for wind and leaves; synthesized chimes later) | Nothing to download. Unlocks on the first touch. Driven by `WindField`. |
| Ground paint | `GroundPaint`: a 512² canvas texture over the clearing (R = worn path earth; G = sandiness relative to R; B reserved for flower beds) read by the lawn shader | Cheap live painting with organic edges, and one texture for every ground change. |
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
- *(Birds flying across the sky were already pulled forward as 1.2b.)*

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
- **Crazy-paving flagstones** (Voronoi stones bent along the path) and **auto-connecting paths to the cottage door** were built in 1.5 and removed for simplicity. Revisit later, keeping the path starting exactly under the finger.
- **More path styles that blend procedurally** (stepping stones, cobbles, gravel, mossy stones were prototyped in 1.5 and parked; future: styles that transition smoothly into each other).
- Haptics (iOS Safari has limited vibration support).
- Photo mode with filters and a frame.
- Expandable clearing (push the forest back as the garden grows).
- Decorative tree placement (removed from the MVP: the collection is flowers).
