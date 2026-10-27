# Garden Game

A cozy, painterly, procedural garden builder for iPhone browsers (inspired by Tiny Glade).

## Start here every session
1. Read `BACKLOG.md`, starting with the **📍 Status** section. It says which story is current, what's done, and the user's latest feedback.
2. Work on **one story at a time**. When it's built and deployed, mark it 👀 *Awaiting feedback* and stop so the user can review it on their iPhone.
3. When the user gives feedback, record it in the **Feedback log**, apply it, and mark the story ✅ only once they're happy.
4. Before ending a session, update the Status section (current story, statuses, preview URL, notes), then commit and push.

## Commits
- Commit as the repo owner: `git config user.name "Anirudh"` and `git config user.email "7342625+asrijanga@users.noreply.github.com"` (set it at the start of each session; the cloud container starts fresh). Keep the Claude co-author trailer.

## Deploying
- Work and commit on `master`, then deploy with `git push origin master && git push origin master:main`.
- Only pushes to `main` deploy: the `github-pages` environment rejects `master`. Check the run under Actions, and confirm https://asrijanga.github.io/garden-game/ serves the new `assets/index-*.js`.

## Ground rules
- **Emulate human, hand-done work.** Everything built in the garden should look made by hand, not by a machine:
  - organic curves instead of hard angles (junctions flare into soft curves);
  - slight irregularity in size, angle, height, spacing and tone;
  - no two pieces exactly alike, and no perfectly repeating patterns;
  - the odd small imperfection (a nudged stone, a missing block).
  
  Keep it subtle: "hand-made" is not "messy". When in doubt, add gentle variation and curves.
- **Keep tools predictable.** What you build appears under your finger, starting exactly where you touch. Procedural flourishes must never fight the player's intent.
- iPhone Safari, portrait-first, smooth 60fps. Beauty matters, but never at the cost of stutter.
- Follow the stack and the "Definition of Done" in `BACKLOG.md`. If you change a technical decision, update the decisions table there.
- New ideas from feedback become new stories in the backlog (or go in the Parking lot). Don't silently widen the current story.
