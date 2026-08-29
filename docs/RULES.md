# js13kGames 2026 rules ledger

- Rules URL: https://js13kgames.com/2026/rules
- Resources URL: https://js13kgames.com/resources
- Fetched: 2026-08-20
- Year and category: 2026 Desktop
- Theme: Unicorns and Rainbows
- Archive: standard `.zip`, at most 13,312 bytes
- Layout: `index.html` at archive root; game runs immediately after extraction
- External resources: prohibited; all runtime code, data, and assets stay inside the ZIP
- Source: readable, unmangled buildable source in a GitHub repository plus compressed playable ZIP
- Compatibility: latest Chrome and Firefox; no console errors
- Persistence: unique localStorage namespace; never call `localStorage.clear()`
- Submission: 2026-08-13 13:00 CEST through 2026-09-13 13:00 CEST
- Unfinished and ordinary bug-fix cutoff: 2026-09-14
- Voting and critical-fix period: 2026-09-14 through 2026-10-04

This entry uses no special Online or WebXR category exception.

## Project invariants

- Each tutorial route must classify as the rush type it depicts. The multi-rush route must classify as boomerang, loop, and zigzag together.
- First-run practice targets must use the production enemy renderer and production weakness matching; never add a tutorial-only hit rule that accepts an incorrect shape.
- Gesture-classifier thresholds or algorithms are locked unless a task explicitly changes controls. Any approved classifier change must update tutorial route fixtures, UI, specification, and regression tests together.
