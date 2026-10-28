# Garden Game — Product Backlog

A cozy, painterly, procedural **flower garden** for iPhone browsers, inspired by Tiny Glade.

This backlog breaks the vision into **small, demoable stories**. Each one ends with something you can open on your phone and react to. After each story: build → deploy → you review on device → feedback gets folded into the next story (or a polish story) before moving on.

---

## 📍 Status — where we are

> Keep this section up to date at the end of every working session. It is the hand-off point for the next session.

**Current story:** 4.5 — Weather (built, awaiting review). Next: 5.x sound (or the requested 2.8/2.9 bed stories).
**Preview URL:** https://asrijanga.github.io/garden-game/ (add `?season=spring|summer|autumn|winter` to preview other seasons)

| Story | Status | Notes / feedback |
|---|---|---|
| 1.1 A cozy clearing in the forest | ✅ Done | v3: procedural branching trees with leaf-cluster crowns, firs with jagged tiers, birches; tilt-shift blur removed. Wind and mood approved. |
| 1.2 Hear the wind | ✅ Done | Procedural Web Audio: air bed, gust whoosh, canopy rush, leaf flurries, all driven by the wind field at the view centre. A whisper (calm about −40 dBFS) plus rare distant synthesised birdsong, seasonal pace. Limiter, 4 s fade-in. Sound toggle top-right (remembered) and a one-time hint. |
| 1.3 Hold the world in my hand | ✅ Done | Pulled forward (player asked to zoom). Pinch zoom, drag pan, twist rotate, inertia; camera lowers as you zoom in. |
| 1.4 Thumb-reach toolbar | ✅ Done | Frosted tray with 5 illustrated tactile buttons (Look around, Path, Flowers, Pond, Tidy up), squash/bounce and lift/glow, floating label, soft wooden tap sound. Build tools: one finger touches the lawn (glowing ring, ripple on release), two fingers move the camera. Unbuilt tools say "coming soon". |
| 1.5 Draw a winding path | ✅ Done | Back to basics: rounded-square stones down the middle, pale gravel on both sides, simple cut-stone edging. Starts exactly where you touch, with light smoothing. Settle animation + soft sound; clover along the outside. |
| 1.6 Plant flowers that bloom fast | ✅ Done | Paint beds of soil; flowers sprout, bud and unfurl in a wave (GPU-animated, ~3 s) with a soft pentatonic chime. 14 species with distinct silhouettes (pom-poms, dahlias, pansy faces, cone-centred black-eyed Susans, sedum domes, anemones, spikes, daisies…) × 5 shape variants, per-plant colour/size/yaw. Real seasons: in-season species bloom, others stay in bud. Picker chips above the toolbar (seasonal mix first, green badge = blooming now). Beds avoid paths; wildflowers step aside. |
| 1.7 A cozy garden pond | ✅ Done | Pond tool: drag to dig a pond along your finger, tap for a round pool, or draw a loop to fill the shape. The ground sinks into a soft basin, then water wells up (with a gentle trickle). On slopes the bed is levelled so water reaches the far bank. Stylized water: clear shallows to teal deep, sky and treeline reflection, gust-driven wavelets, sun glints, soft foam at the shore. Mossy rocks gather in groups at the waterline, with reeds and bulrushes in the gaps. Lily pads (flowering in spring/summer) and koi/goldfish arrive over the next seconds. Fish glide, pause, kiss the surface, and leap with a splash, rings and a plop. Ponds join with soft curves and avoid paths, beds and the cottage. |
| 1.8 Gently erase | ✅ Done | Tidy-up tool: a soft brush ring shows exactly what it covers (bigger when zoomed out, finer up close). Under it, stones shrug and sink into the soil with little puffs, flowers, foliage, clover, reeds and lily pads wilt away, and ponds fill back in as the bed rises and fish slip away. Worn earth, gravel and mulch fade softly over a moment, with a soft edge, and wildflowers grow back one by one. Beds that are cut get a stone border round their new end, a pond that loses a bank settles to its new level, and erased ground is free to build on again. A soft earthy "shff" sound. |
| 1.9 Autosave + seed sprouting | ✅ Done | Every stroke (tool, settings, centimetre-rounded points) is saved to local storage soon after you lift your finger, and on leaving. On load the strokes are replayed in order; all variation is seeded, so the garden rebuilds exactly (verified: every stone and plant matrix identical after reload; a path + bed + pond + erase saves in under 1 KB). The garden's clock is paused while it rebuilds, then it regrows in a gentle wave, stroke after stroke. Loading screen: a seed wiggles, a stem rises and two leaves unfurl while shaders compile, then a soft fade into the world. Hold "Tidy up" for a "Start a new garden?" card (Keep my garden / Start fresh). |
| ⚡ Perf pass (pulled from 6.4) | ✅ Done | Lean post pipeline (scene + quarter-res bloom + one final pass, replacing several full-screen passes on 4× MSAA targets). Shadows redrawn only when something casting moves. Adaptive quality tiers (1.75×→1.2×, always with 4× MSAA) that react only to sustained slowness and recover when frames are steady. Shaders compiled at load. Bed borders ~5× faster to lay, pond digging rarely hitches (pre-built basin chunks, strip refreshes, throttled flood fill), numeric spatial hashes, a CPU-backed paint canvas. `?fps` readout; `?q=0..5` pins a tier. |
| 2.1 Hedges and wooden fences | ✅ Done | New "Fences & hedges" tool (6th button) with style chips: white picket fence, rustic post-and-rail, clipped boxwood hedge. Builds as you draw: the line is smoothed into straight runs, and a corner post goes in exactly where it bends. Posts are knocked in with a wooden "tock", then rails and pickets pop on one by one; hedges grow up in a wave with a rustle. Hand-made: posts lean a hair, rails sag, pickets vary and the odd one is missing, log rails are crooked. Where a path crosses, a gate is hung, left ajar (hedges leave a gap). Paths drawn later through a fence open a gate too. Skips ponds, beds and the cottage; joins existing posts; erasable; saved and replayed exactly. |
| 2.2 Rocks and boulders | ✅ Done | The fence button is now **Build**, with chips for picket fence, rustic rails, hedge and **Rocks** (stone walls will join in 2.3). Tap: a boulder lands exactly under your finger, with 2–4 smaller stones nestled round its foot. Drag: a natural rocky line of mixed sizes, nudged off the line. 10 procedural shapes (lumpy, with split faces and faint strata), each turned, tilted, stretched and tinted differently. They drop and settle with a weighty thud (deeper for bigger stones) and a puff of dust. Moss creeps over their tops in soft cushions over ~2½ minutes; rocks rebuilt from a save come back mossy. Rocks don't overlap, avoid paths, ponds and the cottage, cast shadows, are erasable, and are saved and replayed exactly. |
| 2.3 Stone walls that crumble | ✅ Done | "Stone wall" chip in the Build tool. Draw a line: a dry-stone wall builds stone by stone, course by course, with automatic corners. Four courses of irregular, wedge-ish stones in weathered greys (warmer and cooler, the odd rust-stained one), joints staggered over the course below, leaning in as it rises, the odd stone missing, capped with a row of upright coping stones leaning this way and that. Where the wall starts or stops it steps down and crumbles over ~1 m, with fallen stones in the grass. At a path it finishes in a neat opening between two tall upright stones. Skips ponds, beds and the cottage; erasable; saved and replayed exactly. |
| 2.4 Garden props | ✅ Done | New **Decor** button (a 7th, with a more compact toolbar on small phones) opens a props drawer: Bench, Lantern, Birdhouse. Touch to pick one up under your finger; slide to move it (it hovers and bobs); let go and it drops with a squash and a wooden thud. Auto-orient: benches and birdhouses turn to face the nearer of a path or pond within 6 m, else face you. Benches: slatted, with arms (weathered timber or painted sage). Lanterns: iron lamp posts with warm glowing panes. Birdhouses on posts in soft painted colours with contrasting roofs, a round door and a perch. Each varies in tilt, size and height. Not on paths, ponds or the cottage (a gentle "try open lawn" if so); erasable; saved and replayed exactly. |
| 2.5 Gazebo and arched bridge | ✅ Done | **Gazebo** (Decor drawer): touch to place, and its entrance turns to the nearest path or pond. It lands as an octagonal deck with a front step, then assembles itself piece by piece with soft knocks: eight white posts, railings (open at the front), a ring of beams, eight shingled roof panels (sage, terracotta or slate, two-tone rows, a gentle bell curve), and a finial. Needs ~4 m of clear lawn. **Bridge** (Build → Bridge): draw from one bank across a pond to the other; let go and it builds itself: stone footings on both banks, two beams springing across, planks laid one by one along a gentle arch (rise grows with the span; shades vary, the odd gap), then posts and handrails following the curve. 2–12 m, and only where there's water to cross (a gentle hint otherwise). Both erasable; saved and replayed exactly. |
| 2.6 Undo | ✅ Done | Undo and redo buttons, top left (dimmed when there's nothing to undo or redo). Undo drops the last stroke, puts the garden back to untouched, and quietly replays the rest, settled at once with no build-up and no sounds, then a little puff where the undone thing was. Verified exact: after an undo, every stone, plant, fence and wildflower matrix equals the earlier state. Redo plays the stroke out again with its build animation. Any new stroke clears redo. Undo works across reloads (the saved stroke list is the history). ~0.1 s for a small garden; it grows with the number of strokes. |
| 2.7 My cottage, my way | ✅ Done | Tap the cottage to open its drawer (tap elsewhere to close). Look chips cycle: roof (terracotta, slate, thatch with a rounded ridge, mossy, blue-grey), walls (cream, white, butter, blush, sage, stone with mortar courses and no half-timbering), shutters (6), door (5; the shed door matches), chimney (stone, brick with courses, white with a terracotta pot; the smoke moves with it). Upgrade chips toggle: gabled porch on white posts, bay window with its own roof, window flower boxes, climbing roses over the door and corners, lean-to timber shed. Each change rebuilds the cottage with a soft bounce, puffs and a chime. Wildflowers step aside from a new shed or porch, and the cottage's footprint grows with them (nothing is built into them). Saved in the stroke history: reloads exactly and undo/redo step through looks. |
| 3.1 Flags and wind chimes | ✅ Done | Decor drawer gains **Flag** and **Wind chimes**; the cottage drawer gains a **Wind chimes** upgrade (hung from an iron bracket under the front eave). Flags: a white pole with a gold ball, flying a cloth pennant in soft two- and three-band colourways. Verlet cloth (13×7 particles, structural and shear links) pushed by the WindField at the pole: it streams and ripples in a gust, droops in the calm and lifts again, in the pole's own frame so it moves when carried or dropped. Chimes: five tubes round a wooden top and a clapper with a sail, each a damped pendulum swung by the local gusts (the sail catches most). When the clapper meets a tube, the tube rings (four inharmonic partials, pentatonic notes by length) and they bounce apart; quieter the further away you are; still and silent in a calm. Saved, undoable, erasable. (Drifting leaves and petals are left for later.) |
| 3.2 Wildflowers reclaim empty grass | ✅ Done | The untended lawn slowly fills with seasonal wildflower drifts (~1,500 clumps, each drift one kind and colour: e.g. summer poppies, white daisies, cornflowers, cow parsley), spreading in slow waves over ~20 minutes of play. How far it has grown is remembered between visits (separately from the garden save, so it never affects undo or replay). Anything built (paths, beds, ponds, rocks, decor, fence posts, the cottage) keeps them back and they fade out quickly where you build; erase something and they grow back in. Ferns (arching fronds, tinted by season, swaying) and huddles of mushrooms grow just inside the forest edge; none in winter. Moss on stones was already covered by boulders (2.2) and pond-side rocks; path stones stay clean. ~0.04 ms per frame. |
| 3.3 Creatures | ✅ Done | **Garden birds** (robin, blue tit, sparrow, goldfinch, blackbird) fly in from the woods on an arc, flare and land on fence posts, log rails, hedge tops, the cottage ridge, birdhouse roofs, lanterns and the gazebo's peak, or on the lawn where they hop and peck. Perched, they look round, hop round, ruffle their wings and chirp now and then (synthesised, louder and panned by where they sit). They move on after a while, and fly off at once if their perch is erased. More to sit on brings more birds (up to 6). **Butterflies** (cabbage white, brimstone, orange tip, common blue, red admiral, peacock, by season) flutter in a wandering, bobbing line between open blooms in beds and the wild meadow, and bask with wings slowly opening and closing; more flowers, more butterflies (up to 7). **Dragonflies** (four colours) patrol full ponds: hover, dart in a blink, and now and then dip to touch the water and leave a ring; none in winter. Bees were already in (1.6b). ~0.03 ms per frame. |
| 3.4 Vines and climbing roses | ✅ Done | Climbers take to some stretches of what you build (each stretch decides for itself, so it's never every one): **climbing roses** on picket fences (up a post, then scrambling over the pickets in a wave), **clematis** (purple, white, pink stars) or **honeysuckle** (cream and gold trumpets) winding round the top log of rustic rails, and **ivy** along the top of stone walls with strands trailing down both faces. They creep along at a few cm a second, starting a few seconds after the fence goes up; leaves unfurl behind the tip and flowers open some seconds later, with the odd side shoot. The cottage's **Roses** upgrade now grows real climbing roses (round the door and up the corner) instead of the old blobs, and a new **Wisteria** upgrade sends a gnarled trunk up a corner and an arm along under the eave with hanging lilac racemes. Flowering follows the season (none in winter; ivy stays). Erasing a fence or wall takes its vines with it; a path through a fence regrows them; a rebuilt garden comes back fully grown. All grown in the shader (no per-frame cost); deterministic, so saves and undo are exact. Wisteria is saved as upgrade letter `v`. |
| 3.5 Bunnies in the garden | ✅ Done | Now and then (first after ~½–1 min, then every few minutes, at most two at once) a family hops out of the woods: a grown-up (sometimes two) and 2–4 rounder, big-headed babies, in sandy, grey-brown, warm brown or cream (a rare white), with cotton tails. Hops have a crouch, a squash-and-stretch spring, a nose-up/nose-down arc and a settle, ears flying back and tail bobbing. Babies make quicker, shorter, clumsier hops, keep their own spot behind the parent and hurry to catch up; now and then one does a twisting binky. Between hops: sit up and look about, nibble, wash a face, lie down in the sun; noses twitch and ears flick. They wander the lawn and bed edges, keep off ponds, rocks, walls, hedges, posts, decor and the cottage, and go home after a couple of minutes. Drawing or planting beside them sends them a few calm hops away; a tap with the hand tool makes one sit up and turn to look at you. Silent for now. ~0.015 ms per frame. |
| 3.6 Ducks and ducklings | ✅ Done | Any filled pond of ~6 m² or more gets a family now and then (one per pond): a speckled hen (sometimes with a green-headed drake; now and then a white farmyard duck with pale chicks) glides in low over the trees and lands with a splash, while 3–6 fluffy yellow-and-brown ducklings waddle in a line from the woods and plop in. Ducklings paddle after her in a wobbly line, hurrying when they fall behind; every paddler draws a soft V of wake on the water (new wake term in the water shader). Grown-ups dabble tail-up, preen, flap and shake (droplets), drift on the breeze and doze by the reeds; ducklings bob under and pop up, dart after flies, and huddle in when mother dozes. Now and then the family waddles up the bank to sit in the grass, then back in with a plop. After a few minutes the ducklings walk home and the grown-ups fly off. They keep clear of lily pads; digging or building beside them sends them calmly to the far side; tapping a duck gives a soft synthesised quack and the ducklings peep back; the odd quiet quack when zoomed in near. ~0.04 ms per frame. |
| 3.7 Hummingbirds and butterflies | ✅ Done | **Butterflies** rebuilt: 12 kinds by season (monarch, swallowtail with tails, blue morpho with a view-dependent shimmer and brown eyespot undersides, painted lady, cabbage white, brimstone, orange tip, peacock, red admiral, common blue, small copper, and the rare glasswing with see-through panes), each with its own wing outline and painted upper side and duller underside (a canvas atlas). One instanced wing mesh + one body mesh for all of them; the wingbeat runs in the shader. Fluttery, bobbing flight with glides on open wings, drifting on the gusts, the odd spiralling pair; they sip at blooms (favouring lavender, salvia, sedum, cosmos, asters, and each kind its own favourites), bask flat on stepping stones and puddle at pond edges; more flowers, more butterflies (up to 10). **Hummingbirds** (ruby-throated, violet-green, rufous, emerald) with glossy gorgets that catch the light and blurred wings: dart in, stop dead before a flower (salvia and foxglove first), hover and sip, back off, dart on; the odd chase between two, or a rest on a perch; up to 3 (1 in autumn, none in winter), only with enough open flowers. Faint high wing-hum when close and a tiny "tsip". A nearby stroke sends both off for a while; tapping a butterfly brings it down onto a flower nearby, tapping a hummingbird makes it hover and look at you. ~0.03 ms per frame. |
| ⚡ Perf pass 2 (requested) | ✅ Done | Profiled a large test garden (CPU per system, GPU upload bytes per frame, per-pointer-event cost). Fixed: (1) stones re-uploaded ~1.6 MB of instance matrices every frame while any settled → per-instance update ranges (also fences, boulders, edge plants, vines, meadow); (2) the ground-paint canvas re-uploaded its full 1 MB image every frame while drawing paths/beds/erasing → a CPU pixel copy with the changed patch sent in one texSubImage2D; (3) the meadow rewrote all 1,500 sites each frame → only growing/fading ones; (4) the shadow map (whole scene, forest included) re-rendered every frame while anything settled → at most ~8×/s plus a final pass; (5) every pointer move was processed immediately (mice fire faster than the screen) with a layout read each time → one move per frame, cached canvas rect; (6) fence and bed proximity checks scanned every part/dab → 1 m spatial grids (bunnies, meadow, brushes). Result on the test garden: idle GPU buffer uploads ~1.9 MB → ~0.39 MB per frame, pointer handling ~0.1 ms; reload/undo verified exact. |
| 4.1 A huge flower collection | ✅ Done | 57 species (was 14), every season covered: spring (daffodil with its trumpet, crocus, hyacinth, bluebell, snowdrop, primrose, forget-me-not, lily of the valley, iris, peony, grape hyacinth, ranunculus, hellebore, sweet pea), summer (sunflower, zinnia, marigold, petunia, snapdragon, delphinium, hollyhock, lupin, coneflower, shasta daisy, cornflower, geranium, hydrangea, allium, yarrow, phlox, verbena, lily, daylily, gladiolus, calendula, nasturtium, sweet William, blanket flower), autumn/winter (sneezeweed, goldenrod, cyclamen, heather, winter aconite) alongside the originals. New shape options: a corona trumpet on radial blooms; clusters can be flat, domed mopheads or a ball of stars on a bare stem. **Flower book**: a first chip opens a paper page of every species, "Blooming now" first, then by the season each next flowers, with art, name, season dots and colour swatches; tapping one picks it. The chip row now holds the book, the seasonal mix and what's blooming now (a species picked from the book keeps its chip). Flower meshes are built the first time a species is planted (57 × 5 pre-built variants would hold ~36 MB of empty buffers). Seasonal-mix beds now draw from the larger in-season list. |
| 4.1b A rose garden | ✅ Done | Six rose habits as new species (a new `rose` form): hybrid tea (one high-centred bloom on a tall cane), floribunda (clusters), English rose (big, round, ~40 petals), climber (long arching canes, blooms along them), wild rose (open five petals, golden stamens), patio rose (compact, covered in small blooms). Blooms are petals on a golden-angle spiral, tight and cupped at the heart, opening and curling back outside; every bush mixes tight buds, half-open and open roses. Thorny canes, glossy five-leaflet leaves. 16 colours from classic red to white, lavender and mauve, plus bicolours written `base|edge` (yellow blushing pink, white edged red, peach to cream): petals now carry an edge factor and plants an edge colour, so any flower can shade heart → edge. Picking a rose shows colour swatches (with "mixed"); the choice is saved in the stroke (`species:colour`). Roses join the seasonal mix (wild roses spring–summer only). Petals now and then drop from open roses and tumble down on the breeze, lie a while, and fade. (Bare winter canes with hips not done: out of season they show as buds like other flowers.) Fixed along the way: the flower shader had hit WebGL's 16 vertex-input limit, so per-vertex and per-instance values are now packed. |
| 4.1c Water flowers | ✅ Done | Painting with the Flowers tool across a pond plants water flowers instead of a bed (no soil, no border), each kind in its home zone by water depth: deep floaters (lotus with floating and raised round leaves, a tall stem and a cupped bloom round a golden seed pod; water lilies in white, pink, red, yellow, peach and a bicolour among notched pads; water hyacinth rosettes with pale lavender spikes), shallow marginals (water iris with sword leaves and a flag flower, marsh marigold's golden cups, pickerelweed's violet spikes, arrowhead's white three-petalled whorls over arrow leaves), and the damp bank (water forget-me-not). Planted in soft drifts, growing and blooming through the usual GPU growth with the bloom chime; bees and the other visitors find the open blooms. A "Water mix" chip plus a chip and book card for each; picking one says "paint across a pond", and a water flower never plants a bed on dry land. Each blooms in its real season (buds otherwise). Not done: bronze autumn leaves, nodding seed pods, pads bobbing on ripples, drifting petals on the water. Old flower strokes that crossed a pond now plant water flowers there. |
| 4.2 Real seasons, beautifully | ✅ Done | The air of each season: cherry-blossom petals drifting in spring, the odd floating seed in summer, amber/red/gold leaves tumbling down in autumn (more in a gust) and gathering on the lawn, and soft snow in winter (GPU-only: each flake's path computed in the vertex shader, following the view). Winter: snow lies on the cottage roof courses, hedges are frosted, windows glow warmer. Flowers follow their own year: in bloom in their season, in bud when their season is next, dry brown seed heads just after it, otherwise resting as a tight green knot (random draws unchanged, so saved gardens grow back exactly). Hidden peek: hold the camera button for a card of Spring / Summer / Autumn / Winter / Today; the garden reloads in that season for this visit (stored in session storage; `?season=` stays for debugging). |
| 4.3 Time of day | ✅ Done | A sun button (beside the camera) opens a sun dial: one thumb-friendly slider from dawn → morning → golden afternoon → dusk → night, naming the moment. Five keyframes built on the season's palette, blended smoothly: sun direction (it swings round, shadows follow), colour and strength; sky/ground light; haze colour and how close it comes (dawn mist close in; dusk and night haze kept out among the trees so the garden stays readable); the colour grade and bloom; the pond's reflected sky and sun glints. Golden afternoon is exactly the usual look and the default; the dial remembers where it was left. Night is moonlit blue with glowing windows (fireflies, stars and lamp glow are 4.4). |
| 4.4 Night magic | ✅ Done | Everything follows the sun dial. Garden lanterns and the cottage's windows and door lamp burn brighter as it gets dark, each with a soft halo and a warm pool of light on the grass (lanterns you place light up too). Fireflies (not in winter) wake from dusk, wander lazily and blink slowly, drifting over to settle round blooming flowers and meadow clumps. Stars come out (bright ones first) and twinkle, and show in the pond's reflection, broken by ripples and hidden by the reflected treeline. All on the GPU, so no cost by day. |
| 4.5 Weather | 👀 Awaiting feedback | Weather chips under the sun dial: **Clear**, **Sunbeams**, **Rain**, **Mist** (remembered; Rain is hidden in winter, where it snows). Changes blend in over ~6 s and shade the day's light at any time of day. *Rain:* grey, soft light; slanting streaks that follow the wind, little splashes, a rash of rings on the ponds; soil, beds and paths soak dark, puddles form in the dips of paths (mirroring the sky, ringed by drops), stones and boulders go dark with a wet sheen, and it all dries slowly (~2 min) after the rain stops; a soft rain hiss in the ambience. *Mist:* pale, close haze plus three sheets of low mist rolling in banks across the lawn with the wind (thinning where the forest floor rises). *Sunbeams:* broken cloud whose shadows drift over the lawn (brighter in the gaps), with soft shafts of sun slanting down. All GPU-driven. |
| 5.x – 6.x (+ follow-ups 3.8, 3.9, 4.1d, 4.1e, 6.6–6.8; requested 2.8 bed styles, 2.9 bed toppings) | ⬜ Not started | See milestones below |

Status legend: ⬜ Not started · 🔨 In progress · 👀 Awaiting feedback · ✅ Done

### Feedback log
_Feedback from each review, newest first, and what we changed because of it._

- **4.4 → 4.5:** *Feedback:* "Next story" (night magic accepted). *Changes:* Story 4.5 built.
- **4.3 → 4.4:** *Feedback:* "Next story" (time of day accepted). *Changes:* Story 4.4 built.
- **4.2 → 4.3:** *Feedback:* "Nice! Next story" (seasons accepted). *Changes:* Story 4.3 built.
- **4.1c → 4.2:** *Feedback:* "Next story" (water flowers accepted). *Changes:* Story 4.2 built.
- **New stories requested:** *Feedback:* "Add stories for a variety of garden beds, including raised beds, so the player decides the combination; also offer different materials like mulch and gravel." *Changes:* added Story 2.8 (bed styles, including raised beds) and Story 2.9 (bed toppings: mulches, gravels, living cover). Both are player choices saved per stroke, with old saves unchanged.
- **4.1b → 4.1c:** *Feedback:* "Next story" (roses accepted). *Changes:* Story 4.1c built.
- **4.1 → 4.1b:** *Feedback:* "Next story" (perf pass and flower collection accepted). *Changes:* Story 4.1b built.
- **Performance request:** *Feedback:* "Drawing with the mouse sometimes lags; identify all performance issues and solve them one by one. Would a client/server architecture (hosted on a NAS) help?" *Answer:* no: the lag is per-frame work on the device (CPU and GPU), and a server only changes how fast the files download. *Changes:* Perf pass 2 (see the status table).
- **3.7 → 4.1:** *Feedback:* "Next story" (ducks and hummingbirds/butterflies accepted). *Changes:* Story 4.1 built.
- **Path feedback:** *Feedback:* "Pathway still has a problem, it's too wide and if I long press it becomes bigger and ugly." *Changes:* paths narrowed (edging ~0.92 m apart instead of ~1.24 m; gravel radius 0.8 → 0.6), with beds, fence gates, decor, edge plants and wildflowers keeping correspondingly closer; the junction flare made gentler and shorter (it also applied where a path starts on or beside another one, which is the likeliest cause of the big blob on a long press). A plain long press on open lawn didn't grow the path in testing; to revisit if it still happens.
- **Bug report, again (with a screenshot):** *Feedback:* "The missing gravel is still a bug" (on desktop, so not iOS). *Cause found:* erasing fades ground paint away over ~1 s; when the garden is rebuilt (on load, or an undo) strokes replay far faster than that, so a still-running fade from an earlier erase ate the gravel of paths replayed after it. Stones and edging were unaffected. *Changes:* any unfinished erase fade now completes the moment new paint goes down, so paint always lands in stroke order. Verified: a path drawn across an erased patch keeps all its gravel after a reload and after an undo (old build lost ~40%).
- **Bug report (after 3.7):** *Feedback:* "When session resumes, pathways lose the gravel or base, and the path joins are not smooth still." *Changes:* the ground-paint canvas (path gravel, bed soil) now keeps a log of every dab and repaints itself if iOS discards it while the app is backgrounded (checked on returning to the app, after a lost WebGL context, and every 2 s via a marker pixel). Path junctions flare much wider and over a longer run (gravel up to ~1.9×, edging up to ~2.1×, eased in over 2.4 m), and the old path's edging is cleared across the whole mouth, so joins open in a soft curved fillet on both sides.
- **3.7 → next:** *Feedback:* "Next story" (said while 3.7 was still being finished; 3.7 shipped and left awaiting review). *Changes:* Milestone 4 next.
- **3.6 → 3.7:** *Feedback:* "Next story" (said while 3.6 was still being finished; 3.6 shipped and left awaiting review). *Changes:* Story 3.7 started.
- **3.5 → 3.6:** *Feedback:* "Next story" (bunnies accepted). *Changes:* Story 3.6 built.
- **3.4 → 3.5:** *Feedback:* "Next story" (vines accepted). *Changes:* Story 3.5 built.
- **3.3 → 3.4:** *Feedback:* "Next story" (creatures accepted). *Changes:* Story 3.4 built.
- **3.2 → 3.3:** *Feedback:* "Next story" (meadow accepted). *Changes:* Story 3.3 built.
- **3.1 → 3.2:** *Feedback:* "Next story" (flags and chimes accepted). *Changes:* Story 3.2 built.
- **2.7 → 3.1:** *Feedback:* "Next story" (cottage accepted). *Changes:* Story 3.1 built.
- **2.6 → 2.7:** *Feedback:* "Next story" (undo accepted). *Changes:* Story 2.7 built.
- **2.5 → 2.6:** *Feedback:* "Next story" (gazebo and bridge accepted). *Changes:* Story 2.6 built.
- **2.4 → 2.5:** *Asked:* "Is there an iOS game similar to this?" (Townscaper is the closest; Tiny Glade itself is PC and Steam Deck only; also Terra Nil, Viridi), then "Next story". *Changes:* Story 2.5 built.
- **2.3 → 2.4:** *Feedback:* "Next story" (stone walls accepted). *Changes:* Story 2.4 built.
- **2.2 → 2.3:** *Feedback:* "How do I place stones?" (answered: Build tool → Rocks chip; offered a clearer Build icon or a separate button), then "Next story". *Changes:* Story 2.3 built.
- **2.1 → 2.2:** *Feedback:* "Next story" (fences accepted). *Changes:* Story 2.2 built.
- **1.9 → 2.1:** *Feedback:* "Okay let's do next story." *Changes:* Story 2.1 built.
- **Sharpness:** *Feedback (with a screenshot):* "A little better, but not quite sharp and detailed." *Cause:* iPhone screens are 3× and the game rendered at 1.5×, so Safari stretched every frame 2× and softened fine detail (petals, mulch, gravel, leaf edges). *Changes:* The game now starts at 1.75× and climbs to 2× whenever frames stay steady (it still steps down only for sustained slowness; floor 1.2×, always 4× MSAA). The final pass adds contrast-aware sharpening scaled to how much the screen will stretch the image (~0.9 at 1.75×), clamped to each pixel's neighbourhood so edges never ring. Screenshots render at the screen's full 3×.
- **Quality fix:** *Feedback:* "The whole app has horrible quality and looks pixelated." *Cause:* the adaptive quality from the performance pass counted brief hitches (loading, laying borders, digging) as slowness. It could only ever step down (on a 60Hz screen it never sees headroom) and went as low as 0.85× with no antialiasing, so over a session it ratcheted down to a blurry, jagged picture. *Changes:* It now only reacts to sustained slowness (median frame over two seconds in a row). It never goes below a crisp floor of 1.2× with 4× MSAA (lower tiers are debug-only via `?q=`). It steps back up after steady periods, waiting longer each time a step up doesn't hold (12 s → 2 min).
- **1.6 review 8:** *Feedback:* "I don't like the random colours for soil, let's revert to mulch." *Changes:* Per-species dressings removed (no second paint layer, no gravel). Every bed is warm cedar bark mulch again, keeping the sparser planting and the screenshot button. *Lesson:* one consistent ground for all beds reads calmer than matching it to each flower.
- **1.6 review 7:** *Feedback:* "It could be different for each flower type… find colours that are pleasing and complementary to the flowers and pop them, without making the bed so dense it looks unorganised. I won't be loading with query params: find the best combo in the game itself; keep query params for debugging. Add a button to take a screenshot for sharing and debugging." *Changes:*
  - Each species has its own bed dressing, picked to sit opposite its flowers on the colour wheel: cool **slate gravel** under hot reds, oranges and golds (poppy, rudbeckia, chrysanthemum); warm **pale pea gravel** under purples and blues (lavender, salvia, aster, pansy, sedum); dark **cocoa bark** under pinks, whites and pastels (daisy, anemone, cosmos, foxglove, dahlia); warm **cedar bark** for the seasonal mix and tulips.
  - A second paint layer records each bed's dressing (the newest bed wins where they overlap; the boundary is roughened by noise, and fillets take the nearest bed's dressing). The shader blends bark and gravel patterns by weight, only computing what's there.
  - `?mulch=` removed: everything is chosen in-game. Query parameters (`?debug`, `?fps`, `?q=`, `?season=`) are for debugging only.
  - 📷 button beside the sound toggle: renders the world (no UI) at up to 2.5× resolution and opens the iOS share sheet (Save Image, Messages…), or downloads where sharing files isn't supported. A soft flash and click. The file name carries the date, quality tier and frame rate for debugging.
- **1.6 review 6 (after 1.9):** *Feedback:* "It looks too dense now. Can we make it sparse, but find a nice colour for the soil underneath, like a complementing mulch colour or gravel?" *Changes:* Beds planted as a cottage-garden scatter rather than a carpet: flowers keep 1.05× their natural spacing (was 0.62×), 16 attempts per dab (was 40), and only a couple of leafy clumps per dab, kept 0.55 m apart. The mulch is now warm cedar bark: red-brown shreds, lighter chips and dark crumbs, a colour that sits opposite the greens so leaves and blooms glow against it. A pale pea-gravel alternative can be previewed with `?mulch=gravel`. Saved gardens replay with the new spacing. The lawn shader now skips mulch work outside beds.
- **1.8 + perf → 1.9:** *Feedback:* "Next story" (erase and the performance pass accepted). *Changes:* Story 1.9 built.
- **Performance (after 1.8):** *Feedback:* "It's very janky, can you first work on achieving 60fps." *Measured:* ~360 draw calls and 520k triangles a frame. The forest (300k triangles, alpha-tested leaf cards) was also redrawn into the 2048² shadow map every frame. Post-processing ran four full-screen passes on 4× MSAA half-float targets at 1.75× resolution. Lifting your finger from a bed stalled ~170 ms while its border was laid; pond digging took up to ~25 ms per frame. *Changes:*
  - Custom post pipeline: the scene is drawn once into an MSAA target; bloom is built at ¼ resolution and below (dual-filter blur); one final pass does bloom, Neutral tone mapping, sRGB, grade and vignette. Same look, far less bandwidth.
  - Shadow map redrawn only while stones settle or sink, or reeds grow (trees, cottage and sun are static; birds no longer cast). Draw calls are now ~210 a frame.
  - Adaptive quality: watches real frame times (75th percentile) and steps resolution down from 1.5× (then fewer MSAA samples, then no bloom) until 60fps holds; steps back up only with clear headroom and never to a tier that failed. Gives up if a step down doesn't help (Low Power Mode caps at 30fps).
  - Every shader is compiled at load (including pond water and basin), so the first pond or bed doesn't hitch.
  - Bed borders: distances are rasterised into the grid and the field is sampled once per cell (172 ms → ~30 ms on desktop). Path lookups use numeric keys (30× faster).
  - Ponds: basin chunks are pre-built hidden in idle frames, neighbours get only their shared edge strip refreshed, the flood fill runs 4×/s while digging and only over the pond area, and lawn colours are sampled coarsely. Per-frame pond animation went 2.2 → 0.7 ms.
  - Ground paint canvas is CPU-backed (`willReadFrequently`), avoiding a GPU read-back stall on every upload while drawing.
- **1.7 → 1.8:** *Feedback:* "Okay build next story" (pond accepted). Also asked for two new stories: 3.6 ducks and ducklings, 4.1c lotus and water flowers. *Changes:* Story 1.8 built.
- **1.6 → 1.7:** *Feedback:* "Okay build next story" (flowers, beds and bees accepted). *Changes:* Story 1.7 built.
- **1.6 review 5:** *Feedback:* Handle two beds meeting with natural curves. *Changes:* Bed outlines come from a distance field: each stroke's own outline is exact, and separate beds join with a round fillet (radius 0.8 m) where they meet or nearly touch. Around a new stroke, a grid march fills the fillet curves with mulch (plus a little foliage), lifts border stones now inside, and lays new stones along the blended outline (oriented by the field gradient, in stroke order). Tested: crossing beds (plus shape), a bend from one bed's end, and two parallel beds with a small gap (merged into one wide bed with a single border).
- **1.6 review 4:** *Request:* natural stone edging for flower beds. *Changes:* 7 lumpy, rounded field-stone shapes in warm greys and beige, laid round the outside of each bed when the stroke ends, settling one after another. Hand-laid variation in size, spacing, in/out nudge, twist and set height. The border follows the union of all beds: extending or joining beds lifts stones now inside and keeps one border round the outside. It skips paths and blocked spots. Plants now stay inside the edge (plant radius 0.8 → 0.62 m).
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
| GPU updates | **Per-item update ranges** (`render/touch.ts`) for instanced buffers; ground paint uploads only its changed patch | Re-sending whole buffers when one item changes was the biggest per-frame cost. Any new instanced system should mark changes with `touch()`, never a bare `needsUpdate`. |
| Hosting | **Static files** (GitHub Pages) | Everything runs on the device; a server (or NAS) would only change download speed, not smoothness. |
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
| Ponds | `Ponds`: a 256² signed "inside distance" field over the clearing (strokes merge with a smooth union) gives depth, levelling and banks. The coarse lawn mesh steps down out of sight near ponds and fine chunked basin meshes (same lawn shader, polygon offset) sink into shape. Flat water per connected body, with level = lowest bank − 7 cm. A pond texture (R depth, G shore halo, B height above the waterline) colours banks, pebbles and silt | Smooth organic shapes at any size, live digging, and no holes or seams, without re-meshing the whole lawn. |
| Performance | Custom `PostFX` (scene MSAA → ¼-res dual-filter bloom → one final pass). Shadows on demand (`shadowMap.autoUpdate = false`). `Quality` tiers adapt resolution/MSAA/bloom to frame time. `compileAsync` at load. `?fps`, `?q=` | iPhone Safari at 60fps without giving up the look; fill rate is the scarce resource. |
| Persistence | `localStorage` key `garden-save`: a **versioned stroke log** `{v:1, a:[[kind, …settings, points]]}` with points as centimetre deltas. Input is rounded to the centimetre before the brushes see it, and every random choice is seeded, so replaying the log rebuilds the garden exactly. `regrow.offset` staggers growth while replaying | Tiny saves, exact rebuilds, and the share link (6.1) can be the same string, compressed. |

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

### Story 2.8 — Bed styles, including raised beds (M) — *requested by the player*
**As a** player, **I want** to choose how each flower bed is built, including raised beds, **so that** my garden has variety and I decide the combinations myself.

- **A "Bed" choice in the Flowers tool**, next to the species chips: a small button opens a row of bed styles. The choice is remembered until changed, and saved with each stroke.
- **Bed styles**, each following the stroke's own curvy shape:
  - **In-ground with a stone border:** today's bed, and the default.
  - **No edge:** soil feathering softly into the lawn, like a meadow drift.
  - **Raised timber bed:** weathered boards 25–40 cm high, with corner posts where the outline turns.
  - **Raised stone bed:** a low dry-stone wall, borrowing the 2.3 wall stones.
  - **Brick edge:** bricks set on end at an angle (the "sawtooth" edge), or laid flat.
  - **Woven willow (wattle) edge:** low hurdles woven between stakes.
- **Raised beds:**
  - the soil and the plants sit up at the bed's height;
  - the walls curve with the outline, and corners soften instead of turning sharp;
  - where a raised bed meets a path, it finishes neatly.
- **Mixing styles:** where beds of different styles touch, each keeps its own edge. Where beds of the same style meet, they join smoothly, as they do today.
- **Hand-made feel:** boards vary in tone and width, the odd one sits a touch proud; bricks and stones are slightly irregular, with a missing or nudged one now and then.
- **Saves:** old saves load as in-ground beds with a stone border (no change to existing gardens). Erasing and undo work as for beds today.
- **Performance:** edges are instanced like fences and stones, with no new per-frame cost.

### Story 2.9 — Bed toppings: mulches and gravels (M) — *requested by the player*
**As a** player, **I want** to choose what covers the soil in each bed, **so that** the beds look different and set off the flowers the way I like.

- **A "Topping" choice**, alongside the bed style, remembered and saved with each stroke. The player decides: no automatic colour matching, which was tried and set aside in 1.6.
- **Mulches:**
  - cedar bark (today's, the default);
  - dark compost;
  - golden straw;
  - pine needles;
  - cocoa shell.
- **Gravels and stones:**
  - warm pea gravel;
  - white chippings;
  - grey slate chips;
  - river pebbles.
- **Living cover:** creeping moss or low clover between the plants.
- **Each topping has its own painted texture** in the lawn shader, with a soft hand-raked edge (and for gravels, a scatter of larger pebbles). It works on both in-ground and raised beds.
- **Combinations are free:** any topping with any bed style. The flower book or the bed chips can show a tiny preview of the current combination.
- **Saves:** old saves keep cedar bark. Erasing a bed lets its topping fade away like today's mulch.
- **Performance:** one extra paint channel or a small topping index texture, so the lawn stays a single cheap shader pass.

Demo script for 2.8 and 2.9: plant a raised timber bed of roses with white chippings, an in-ground bed of lavender with pea gravel, and a wattle-edged cottage bed with straw, side by side.

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
- Butterflies and bees drift between blooms (butterflies in depth in Story 3.7). Birds land on fences and the cottage roof. Dragonflies skim the pond.
- *(Birds flying across the sky were already pulled forward as 1.2b; bees as 1.6b.)*

### Story 3.4 — Vines and climbing roses (M)
- Vines creep along fences, walls and the cottage, and roses bloom on them.

### Story 3.5 — Bunnies in the garden (M) — *requested by the player*
**As a** player, **I want** soft little bunnies and their babies hopping around my garden, **so that** it feels alive, sweet and peaceful to watch.

- **A bunny family:** grown-up rabbits and tiny, fluffier baby bunnies, procedurally varied in size and in soft coat colours (sandy brown, grey-brown, cream, and a rare white), with round cotton tails.
- **Natural hopping:** an anticipation crouch, a bounce with squash and stretch, landing, and a pause. Babies make smaller, quicker, slightly clumsy hops and stay close to a parent, bouncing after it. Ears and tail bob with each hop.
- **Calm behaviours between hops:** sit up and look around, nibble the grass, twitch noses and ears, wash a face, lie down in a sunny spot, and the odd playful "binky" (a happy twisting jump) from a baby.
- **Living in the world:** they emerge from and return to the forest edge. They wander the meadow, nibble the edges of flower beds (without damaging them), keep to paths and lawn rather than climbing on stones, and stay a respectful distance from the cottage door.
- **Gentle with the player:** if your finger draws or plants right next to a bunny, it lollops away a few hops (never a frantic flee) and settles again. Tapping a bunny makes it sit up and look at you.
- **Rare and relaxing:** a family appears now and then rather than constantly; at most one or two families at a time. Calm, unhurried movement, in keeping with the soothing feel.
- **Soft sound:** almost silent, perhaps the faintest rustle as they hop through flowers when zoomed in close.
- **Performance:** a handful of instanced or simple meshes with procedural animation, cheap on iPhone.

Demo script: zoom in near the forest edge and wait for a bunny family; watch the babies bounce after their parent, then plant flowers nearby and watch them hop aside.

### Story 3.6 — Ducks and ducklings on the pond (M) — *requested by the player*
**As a** player, **I want** a mother duck and her fluffy ducklings paddling around my pond, **so that** the water feels alive and I smile every time I look at it.

- **A duck family:** grown-up ducks (mallard drakes with glossy green heads, brown speckled hens, and the odd white farmyard duck) and tiny, round, fluffy yellow-and-brown ducklings. Sizes, markings and tones vary a little, so no two look alike.
- **Paddling in a line:** the ducklings follow their mother in a wobbly little line, falling behind and hurrying to catch up. A soft V-shaped wake and small ripples spread behind each one, drawn on the existing pond water (and following the same gusts).
- **Calm duck behaviours:**
  - dabbling tail-up to feed;
  - preening;
  - a flap-and-shake that sends up a few droplets;
  - drifting with the breeze;
  - tucking their heads in to doze by the reeds.
- **Ducklings being ducklings:** quick little paddles, the odd bob under the water and pop back up, chasing a fly, huddling under the mother.
- **On the bank:** now and then the family waddles out to sit on the grass by the shore, then waddles back and plops into the water with a small splash.
- **Living in the world:** a family appears when a pond is big enough (at least about 6 m²). It arrives by flying in low over the trees (the ducklings walk in from the woods' edge) and leaves the same way. At most one family per pond. Ducks keep clear of lily pads and steer round rocks, and fish carry on underneath.
- **Gentle with the player:** digging or building right next to them makes them paddle calmly away. Tapping a duck gives a soft quack, and the ducklings answer with tiny peeps.
- **Soft sound:** occasional distant, gentle quacks and peeps, only when zoomed in near the pond, and never chattering.
- **Performance:** a few simple procedural meshes with GPU-friendly animation, cheap on iPhone.

Demo script: dig a large pond, wait for the duck family to fly in, then watch the ducklings follow their mother round the lily pads.

### Story 3.7 — Hummingbirds and butterflies (M) — *requested by the player*
**As a** player, **I want** jewel-bright hummingbirds and many kinds of butterflies visiting my flowers, **so that** the garden feels alive, colourful and magical to watch.

- **Many butterfly varieties**, each with its own wing shape, pattern and size, procedurally varied so no two look alike:
  - **Monarch:** orange with black veins and white-spotted edges.
  - **Swallowtail:** pale yellow with black stripes and tail points.
  - **Blue morpho:** shimmering iridescent blue tops, brown undersides that flash as it flaps.
  - **Painted lady:** orange-brown with black and white tips.
  - **Cabbage white and brimstone:** soft white and lemon yellow.
  - **Peacock:** red-brown with "eye" spots.
  - **Red admiral:** black with red bands.
  - **Small blues and coppers:** tiny lilac-blue and bright copper.
  - **Glasswing:** rare, see-through wings with brown edges.
- **Butterfly flight:** fluttery, bobbing, a little erratic. They glide on open wings between flaps, drift with the wind (riding the same gusts as everything else), and sometimes spiral around each other in pairs.
- **Butterfly behaviours:**
  - landing on open blooms, wings slowly opening and closing while they sip;
  - basking with wings spread flat on warm path stones;
  - puddling at a pond's muddy edge;
  - favouring certain flowers (lavender, salvia, sedum, cosmos, asters).
- **Hummingbirds:** tiny, jewel-toned birds (ruby-throated, green-and-violet, rufous orange) with iridescent throats that catch the light, and wings drawn as a soft blur.
- **Hummingbird flight:** darting flights with sudden stops, hovering perfectly still in front of a bloom, sipping with a long beak, then backing away and zipping off. The odd playful chase between two, and a rare pause perched on a twig or the cottage eaves.
- **Hummingbird preferences:** tube-shaped and bright flowers (salvia, foxglove, and roses or other tubular flowers when they arrive).
- **Visitors follow the garden:** butterflies and hummingbirds only come when there are open, in-season blooms, and more flowers bring more visitors (capped so it stays calm, never swarming). They arrive from and leave into the woods, and get along politely with the bees. Seasonal: plenty in spring and summer, a few in early autumn, none in winter.
- **Gentle with the player:** a nearby stroke sends them drifting off and back again. Tapping a butterfly lets it land on a nearby flower (or briefly on the touch ring), and tapping a hummingbird makes it hover and look at you.
- **Soft sound:** butterflies are silent. Hummingbirds give a faint, high wing-hum and a tiny chip call, only when zoomed in close.
- **Performance:** instanced bodies with wing flapping animated on the GPU, with a firm cap on how many are about, so the iPhone stays at a smooth 60fps.

Demo script: plant a bed of lavender and salvia, wait for butterflies to settle on the blooms and a hummingbird to hover and sip, then zoom in close to watch a morpho flash blue.

---

## Milestone 4 — A world of flowers, through the real seasons

### Story 3.8 — Little living-world details (S) — *follow-up*
Small things left over from Milestone 3:
- **Moss on path and edging stones:** it gathers slowly, as it already does on boulders (from 3.2).
- **A faint rustle** when a bunny hops through flowers, only when zoomed in close (from 3.5).
- **Wind-borne petals and seeds** riding the gusts in spring and summer (the optional part of 3.1); autumn's falling leaves belong to 4.2.

### Story 3.9 — Close-up polish pass (S) — *follow-up*
These were only checked from the default camera, never zoomed right in. Review each up close and tune whatever reads poorly:
- butterflies' wing patterns and the morpho shimmer;
- hummingbirds' throats and hovering;
- the bunnies' sit-up, wash, lie-down and binky poses;
- ducks dabbling and preening;
- a single rose bloom;
- lotus stems and raised leaves from a low angle.

### Story 4.1 — A huge flower collection (L)
- Grow the collection to **50+ species**, with a data-driven species definition (shape generator, palettes, height, bloom seasons). No vegetables or utility plants.
- A beautiful **flower book** to browse and pick species, sorted by "blooming now".

### Story 4.1b — A rose garden: roses of every colour (L) — *requested by the player*
**As a** player, **I want** many kinds of roses in every colour, **so that** I can grow a romantic rose garden among my flower beds.

- **A new rose shape:** a real rose built procedurally, with a spiral of overlapping, cupped petals that wrap tightly at the heart and open and curl back toward the outside, on thorny stems with glossy, toothed leaves in groups of five. No two blooms alike.
- **Several types of rose,** each with its own silhouette:
  - **Hybrid tea:** a single elegant, high-centred bloom on a tall stem.
  - **Floribunda:** clusters of several medium blooms per stem.
  - **English / cabbage rose:** a big, round, many-petalled, cupped "old rose".
  - **Climbing rose:** blooms scattered along long canes (ready for fences and the cottage wall in Story 3.4).
  - **Shrub / wild rose:** simple, open 5-petal blooms with golden stamens, in loose sprays.
  - **Miniature / patio rose:** a compact bush covered in small blooms.
- **Roses of all colours:** classic red, crimson, deep burgundy, blush and hot pink, coral, peach, apricot, sunshine yellow, cream, pure white, lavender and mauve, plus bicolour and blended roses (yellow fading to pink at the edges, white edged in red), with tones varying from bloom to bloom.
- **Growth and bloom:** sprout → tight spiral bud → bloom unfurling petal by petal, through the existing GPU growth system. Bushes carry a mix of buds, half-open and fully open blooms.
- **Seasons:** roses flower from late spring through autumn (with a few late blooms and rose hips in autumn). In winter they rest as bare canes with a few red hips.
- **In the catalog:** a "Roses" group in the flower picker, with a chip for each type and a colour choice (or a "mixed colours" option), and roses blend into the seasonal mix when in bloom.
- **Living details:** petals occasionally drop and drift on the breeze; bees love them.

Demo script: plant a bed of mixed-colour roses beside a path, zoom in on a single bloom, then try each rose type.

### Story 4.1c — Water flowers: lotus and friends (M) — *requested by the player*
**As a** player, **I want** to plant lotus and other water flowers in my ponds, **so that** the water blooms as beautifully as my beds.

- **Plant in water:** with the Flowers tool, painting over a pond plants water flowers instead of a bed (there is no mulch on water). Water flowers get their own group of chips in the flower picker, and a "water mix". They only grow where the water is deep enough for each kind, and they start exactly under your finger like every other tool.
- **Lotus:** big, round, blue-green leaves, some floating and some held up on stalks above the water, with water drops that roll on them. Tall stems carry large cupped blooms that unfurl petal by petal (pink, white, blush with pink tips), with a golden seed-pod heart. Later, seed pods that nod in the breeze.
- **Other water flowers**, each with its own silhouette:
  - **Water lilies** in more colours (white, pink, red, yellow, peach), on top of the lily pads from 1.7.
  - **Water iris:** tall sword leaves with purple, blue or yellow flag flowers at the edge.
  - **Marsh marigold:** golden cups in the shallows.
  - **Pickerelweed:** spikes of soft violet-blue.
  - **Water forget-me-not:** tiny sky-blue clouds along the bank.
  - **Floating water hyacinth:** pale lavender flowers on glossy rosettes.
  - **Arrowhead:** white three-petalled flowers above arrow-shaped leaves.
- **Where they grow:** each kind has a home zone: deep-water floaters (lotus, lilies, hyacinth), shallow-water marginals (iris, marigold, pickerelweed, arrowhead) and the damp bank (forget-me-not). Painting across a pond fills each zone naturally, in soft drifts, with no perfect rings.
- **Growth and bloom:** pads unfurl on the surface, stalks rise, buds swell and open through the existing GPU growth system, with a soft chime. Floating leaves bob gently on the wind-driven ripples.
- **Seasons:** each flower blooms in its real season (lotus and lilies in summer, marsh marigold in spring, iris early summer). In autumn the leaves turn bronze and seed pods remain. In winter only a few dark pads stay on the water.
- **Living details:** dragonflies and bees visit the open blooms, fish glide beneath the leaves, and the occasional petal drifts across the water.
- **Performance:** instanced like the bed flowers, cheap on iPhone.

Demo script: dig a pond, choose the water mix, and paint across it. Watch lotus pads unfurl in the deep middle, irises rise at the edges, and blooms open in a wave.

### Story 4.1d — Roses through the year (S) — *follow-up*
- **Winter:** roses rest as bare thorny canes with a few red hips, instead of showing as buds.
- **Autumn:** hips appear among the last blooms.
- **Climbers:** climbing roses on fences and the cottage (from 3.4) use the new rose bloom shape, so all roses match.

### Story 4.1e — Living water flowers (M) — *follow-up*
- **Floating pads:** they bob gently on the wind-driven ripples.
- **Autumn:** leaves turn bronze and lotus seed pods nod in the breeze.
- **Winter:** only a few dark pads stay on the water.
- **Drifting petals:** now and then a petal drifts across the water.
- **Creatures:** dragonflies land on iris and lotus; ducks steer round lotus leaves; fish glide under the pads.

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

### Story 6.6 — Keep my garden safe (S) — *follow-up*
- **Ask the browser to keep the save:** request persistent storage (`navigator.storage.persist()`) so iOS doesn't clear the garden.
- **Backup:** a quiet "Back up my garden" option that saves a small file, and restores it from that file.

### Story 6.7 — Fast undo for big gardens (M) — *follow-up*
- Undo currently replays every stroke from scratch, which gets slower as a garden grows.
- **Checkpoints:** keep quiet snapshots every so often, so undo only replays the last few strokes.
- **Still exact:** undo must keep rebuilding the garden identically.

### Story 6.8 — Performance pass 3 (M) — *follow-up*
- **Measure on a real iPhone:** use the `?fps` meter in a large garden, since the headless profiler can't time the GPU.
- **Remove first-time hitches:** build flower and creature shapes ahead of time instead of the first time each is planted or appears.
- **Cheaper forest shadows:** bake the forest's shadows once, as they never change.
- **Profile what's left:** look at the remaining drawing cost (bloom, edge smoothing).

---

## Parking lot (ideas to revisit)
- **Weather and wildlife:** butterflies, bees and hummingbirds could shelter in the rain (and ducks love it); a gentle "auto" weather that changes on its own over a session.
- **Watch for:** a long press while drawing a path "becoming bigger and ugly". Not reproduced in testing; the junction flare was made gentler. Revisit with a screenshot if it happens again.
- **Crazy-paving flagstones** (Voronoi stones bent along the path) and **auto-connecting paths to the cottage door** were built in 1.5 and removed for simplicity. Revisit later, keeping the path starting exactly under the finger.
- **More path styles that blend procedurally** (stepping stones, cobbles, gravel, mossy stones were prototyped in 1.5 and parked; future: styles that transition smoothly into each other).
- Haptics (iOS Safari has limited vibration support).
- Photo mode with filters and a frame.
- Expandable clearing (push the forest back as the garden grows).
- Decorative tree placement (removed from the MVP: the collection is flowers).
