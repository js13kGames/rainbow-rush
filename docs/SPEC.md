# Rainbow Rush specification

## Pitch

A flying unicorn survives a storm by freezing time long enough to sketch a rainbow route, then racing along that route to destroy shape-matched nightmares.

## Core loop

1. In **normal** state, the unicorn follows the mouse. On touch devices, dragging from the unicorn moves it directly, while dragging empty space launches a route from the unicorn. A short tap sets a movement target.
   Its horizontal facing follows actual movement, allowing it to face either left or right.
2. Hold the mouse to enter **charge**. The unicorn stays still while the pointer records a route.
3. Route recording is capped at 2,040 logical pixels, three times the original limit. Right-click cancels the current route and immediately returns to **normal**.
4. Release enters **draw** only when the route is recognized as slash, loop, or zigzag. An unrecognized route is cancelled exactly like right-click; there is no wild rush.
   Cancelling an unrecognized or short route also anchors the control pointer to the unicorn, so it remains at the charge origin instead of following the discarded route endpoint.
   Short routes and explicit cancellation stay silent.
5. During **draw**, the unicorn follows the whole route in at most one second while it disappears behind them.
6. Left-click during **draw** cancels the current rush and immediately starts **charge** from the unicorn's current position. A fresh full-canvas drawing coordinate starts at the unicorn and accumulates relative mouse movement, so no automatic connector or reduced drawing range is introduced by a distant cursor.
   Right-click during **draw** cancels the route and applies a 0.3-second capped deceleration. Mouse steering responds immediately while the fading rush momentum continues to influence movement.
7. Finish the route to enter a 0.5-second **buffer** state. For the first 0.3 seconds, mouse steering is blended with linearly fading rush momentum; steering authority increases as momentum reaches zero. Normal mouse following then continues through the remaining buffer time while the recognized weakness and matching attack power remain active.
8. Left-click during **buffer** ends it immediately and starts **charge** from the unicorn's current position.
9. During buffer, contact destroys matching enemies and matching projectiles; mismatched contact remains fatal. Buffer then returns to **normal**.
10. The unicorn keeps its base color in every state. Colored rings and aura communicate the recognized weakness during charge, rush, and buffer.
11. Any enemy body or projectile hit ends the run unless protected by a matching rush or buffer attack.
12. Every enemy kill requires physical contact with the unicorn during draw or buffer. Enclosing an enemy with a loop without touching it has no effect.

## Enemy grammar

- Enemy states are **normal**, **charge**, and **attack**. A pulsing body and filling ring clearly telegraph charge completion.
- **None** enemies follow their fixed path and never charge or attack.
- **Bullet** enemies charge, then fire. Clouds fire one straight shot, eyes fire a three-shot spread, and wings fire two curving shots.
- After an attack, each enemy's oscillating path is re-anchored at its current Y position with zero initial vertical velocity, preventing a visible jump.
- **Dash** enemies charge while locking the player's position, then rapidly rush along that direction.
- Colored weakness sigils require the matching slash, loop, or zigzag rush. A white all-rush sigil accepts every rush type.
- Projectile color is inherited from the firing enemy's weakness, with `B`, `O`, or `Z` marks providing a non-color cue. A matching rush erases it; a mismatched collision is fatal.
- Player, enemy, and projectile contacts use continuous relative-motion checks across each frame, including curved multi-segment rush movement.

Silhouettes identify enemy families. Colors, small route sigils, attack-kind marks, and charge animation communicate weaknesses and timing without text during play.

## Progression and finish

The game is an endless horizontal scroller. Survival score, kills, and a short combo multiplier drive the score. Spawn rate, enemy mix, and projectile pressure increase over time. A collision opens a dedicated result screen with the exact death reason, run score, updated best score, and click-to-restart.

## Presentation

- Fixed 960×540 logical canvas scaled inside the viewport and mobile safe areas
- Portrait viewports show a rotate-device message; landscape phones and tablets use the playable canvas.
- Unified Pointer Events support mouse, pen, and single-finger control. Dragging the unicorn moves it, dragging empty space records a route relative to the unicorn, release launches the rush, and a short tap moves without attacking.
- A large rendered pause target supports mobile play. Page hiding pauses the run automatically.
- Procedural vector art and particles; no external assets
- Procedural Web Audio sound effects; no downloaded audio
- `M` toggles all generated sound at the audio layer and reports the new state during play.
- Enemy kills and projectile clears emit color-matched score popups at the contact point; chained kills include the active combo multiplier.
- Enemy kills hold the impact frame for 65ms; projectile clears use a lighter 25ms hit-stop. Simulation delta does not catch up afterward.
- Death keeps the battlefield visible for 480ms while flash, shake, particles, and the exact failure label resolve; restart input stays locked until the result screen.
- Combo HUD punches in for 220ms after each chained kill and holds its peak through hit-stop.
- English UI kept short for byte efficiency
- The title uses one static action preview, two numbered control steps, and a compact weakness legend. Interactive teaching belongs to the safe first-run onboarding, avoiding simultaneous looping demonstrations and a false mode-select affordance.
- Game over replaces the title content with a focused result layout so death reason and run score cannot be mistaken for the title state.
- Strictly beating the stored score upgrades the result header to `NEW BEST!`; tying it does not.
- The first run contains a safe two-step onboarding: hold/draw/release through a white practice target, then clear visible boomerang, loop, and zigzag targets with their matching routes. Enemy spawning, score, and lethal contact remain disabled until all four practice targets are cleared. Retries skip onboarding.
- Practice routes that miss or mismatch stay silent.
- Completing the matching target starts the real run with a 1.2-second `RIDE READY!` transition aligned to the first enemy spawn.
- The in-game HUD contains score and combo only. The route remains rainbow-colored and the character keeps its base palette; colored rings, aura, and labels communicate recognized weaknesses. A shrinking ring around the character exposes the remaining 0.5-second buffer attack window.
- Pointer Lock hides and confines the cursor during desktop play; touch play skips Pointer Lock. Game-over exits the lock and restores the cursor. Browsers always allow Escape to unlock for safety.
- Escape leaving Pointer Lock or pressing `P` freezes the full run in a dedicated pause state. `P` or the resume button continues from the same position without using the resume click as steering input.
- Namespaced high score: `rainbowRush2026.highScore`

## Tool choice and budget

Readable TypeScript compiles through esbuild and Terser into one inlined `index.html`. Native Canvas is used instead of a micro-engine: this game needs a single scene, pointer sampling, small vector lists, and simple circle/segment geometry, so an engine would duplicate those systems and add compressed overhead. Build dependencies are development-only and do not enter the archive.

Target: at most 12,288 bytes for the finished ZIP, keeping 1,024 bytes beneath the 13,312-byte rules limit where practical.

## Cut order

1. Decorative background layers
2. Extra particle varieties
3. Secondary enemy firing patterns
4. Combo presentation

Never cut the three player states, three route weaknesses, immediate-death rule, restart flow, or route readability.

## Acceptance checks

- Normal, charge, draw, buffer, and return-to-normal transitions work
- Every route completes its rush in at most one second; buffer lasts 0.5 seconds
- Right-click cancels charge even while the left mouse button remains held
- Left-click during a rush cancels it and immediately starts charging the next route
- Left-click during buffer immediately starts charging the next route
- Charge and rush rings and aura match the selected weakness while the character keeps its base color
- Straight, loop, and zigzag attacks defeat matching enemies; white sigils accept all three
- All enemy kills require actual character contact; loop enclosure alone never kills
- Fast crossing player/enemy/projectile paths are resolved continuously instead of by final position only
- None, bullet, and dash enemies follow their specified state and attack behavior
- Matching-color rushes erase bullets; mismatched bullet contact is fatal
- Enemy body and projectile contact end the game
- Difficulty and score advance; game-over restarts cleanly
- Game over names the exact failure and shows run score separately from best score
- Pause freezes simulation and resumes without resetting score, enemies, projectiles, route, or tutorial progress
- Landscape touch play can move, draw, release, pause, resume, skip onboarding, and restart without mouse or keyboard input
- Only the large start/retry button accepts title and game-over clicks; tutorial panels and background cannot start a run
- Non-playing screens use a default cursor and switch to a pointer only over the shared CTA hitbox.
- First-run onboarding blocks live threats until a basic rush and matching boomerang, loop, and zigzag rushes succeed
- Actual extracted submission works offline in latest Chrome and Firefox
- Console stays error-free
- ZIP integrity, root layout, and exact byte gate pass
