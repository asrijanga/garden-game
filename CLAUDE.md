# Garden Game

A cozy, painterly, procedural garden builder for iPhone browsers (inspired by Tiny Glade).

## Start here every session
1. Read `BACKLOG.md`, starting with the **📍 Status** section. It says which story is current, what's done, and the user's latest feedback.
2. Work on **one story at a time**. When it's built and deployed, mark it 👀 *Awaiting feedback* and stop so the user can review it on their iPhone.
3. When the user gives feedback, record it in the **Feedback log**, apply it, and mark the story ✅ only once they're happy.
4. Before ending a session, update the Status section (current story, statuses, preview URL, notes), then commit and push.

## Deploying
- Work and commit on `master`, then deploy with `git push origin master && git push origin master:main`.
- Only pushes to `main` deploy: the `github-pages` environment rejects `master`. Check the run under Actions, and confirm https://asrijanga.github.io/garden-game/ serves the new `assets/index-*.js`.

## Ground rules
- iPhone Safari, portrait-first, smooth 60fps. Beauty matters, but never at the cost of stutter.
- Follow the stack and the "Definition of Done" in `BACKLOG.md`. If you change a technical decision, update the decisions table there.
- New ideas from feedback become new stories in the backlog (or go in the Parking lot). Don't silently widen the current story.
