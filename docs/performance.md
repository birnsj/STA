# Performance

Measured Oct 2026 on one Windows PC, a ~170 Hz monitor (so "fps" tops out near 177), Chrome, 1280x720 at DPR 1, the
Deck 10 Brig map, the 4-member party. Tools: `tools/perfRun.mjs`, `tools/perfScenarios.mjs`, `tools/perfSummary.mjs`,
`tools/perfProfile.mjs`; the browser-side probe is `src/dev/perfProbe.js`.

**Caveat:** the probe's hooks in the game code (timers, counters, Profiler wrappers, `?off=` flags) were lost in an
accidental `git checkout` on 2026-10-13 and have not been re-added. The runner now injects the probe's frame and heap
sampler itself, so fps, frame times and main-thread busy work again (dev server or a plain `vite build` preview), but
the per-stretch timers in the summary line read 0 until the hooks are restored. The tables below "The finding" were
captured before the checkout.

## PixiJS boards (Oct 2026)

The exploration, combat and map editor boards are drawn with PixiJS (WebGL) by default; `?board=svg` in the URL brings
back the SVG boards, and each falls back to its SVG board if WebGL won't start. Same look: side-by-side screenshots
match (exploration: the Deck 10 Brig and two generated maps; combat: the first turn, a hovered move, Auto Combat; the
editor: default, see-through and lighting off, a paint stroke).

### Exploration (pilot)

Measured with `node tools/perfRun.mjs <scenario> --runs 2 [--board svg] [--base http://127.0.0.1:4173/]`, mean of 2:

| Scenario | Build | fps Pixi / SVG | p95 frame Pixi / SVG | main thread busy Pixi / SVG |
| --- | --- | --- | --- | --- |
| Exploration idle | dev | 177 / 176 | 5.7 / 5.7 ms | 44% / 70% |
| Exploration walking | dev | 178 / 124 | 5.7 / 16.6 ms | 60% / 90% |
| Exploration idle | production | 177 / 177 | 5.7 / 5.7 ms | 26% / 32% |
| Exploration walking | production | 179 (cap) / 150 | 5.7 / 11.2 ms | 46% / 71% |

Busy % is the main thread only; Pixi moves the drawing to the GPU, which these numbers don't include. The remaining
main-thread time is mostly the React screen (HUD, panels) re-rendering with the world clock, not the board.
`explore-object` still finds objects through the SVG board's `g.object-highlight`, so it runs with `--board svg` only.

### Combat and the map editor

Same measurement, mean of 2:

| Scenario | Build | fps Pixi / SVG | p95 frame Pixi / SVG | main thread busy Pixi / SVG |
| --- | --- | --- | --- | --- |
| Combat idle | dev | 180 / 180 | 5.7 / 5.7 ms | 28% / 22% |
| Combat, Auto Combat | dev | 178 / 158 | 5.7 / 11.1 ms | 42% / 63% |
| Combat idle | production | 180 / 180 | 5.7 / 5.7 ms | 23% / 21% |
| Combat, Auto Combat | production | 179 / 165 | 5.7 / 11.1 ms | 41% / 61% |
| Editor idle | dev | 179 / 179 | 5.7 / 5.7 ms | 53% / 47% |
| Editor, pointer sweeping | dev | 174 / 176 | 5.7 / 5.7 ms | 65% / 60% |
| Editor idle | production | 179 / 179 | 5.7 / 5.7 ms | 53% / 48% |
| Editor, pointer sweeping | production | 178 / 178 | 5.7 / 5.7 ms | 56% / 50% |

Pixi wins where the board moves (Auto Combat: no frame over 6 ms instead of 11 ms). Where it is still, the SVG board
costs almost nothing, and Pixi's own per-frame render adds about 5% of the main thread; fps is the same. About 30% of
the editor's main thread is style recalculation on both boards, which is not the board.

## The finding

`base.css` ran an infinite animation of an inherited custom property (`--scrollbar-pulse`, the pulsing scrollbar
colour) on `:root`. Every frame it restyled every element on the page. On the exploration and combat screens
(~1000 elements, mostly the board's SVG) that took about a third of the main thread. It is also the cause of the
earlier "frame rate drops when a hazard/glow is on screen" report: the main thread was already saturated.

Fix (kept): pin the property on `.combat-screen` (also the exploration screen) and `.me-board`, and run the animation
on the few gameplay panels that scroll. Panel scrollbars still pulse; the boards have no scrollbars.

Production build (probe-enabled), median of 3 runs, 10 s samples:

| Scenario | fps before | fps after | main thread busy before | after |
| --- | --- | --- | --- | --- |
| Exploration idle | 173 | 176 (cap) | 77% | 39% |
| Exploration walking | 111 | 156 | 98% | 81% |
| Next to a glowing object | 165 | 175 | 92% | 51% |
| Combat, Auto Combat | 130 | 165 | 95% | 57% |

At 60 Hz the busiest case (walking) uses roughly 30% of the main thread after the fix.
On `vite dev` the numbers are about 40% worse, because React's dev build is slower (not a gameplay concern).

## What else was measured (production build, switched off one at a time)

Busy % of the main thread, walking (baseline 81%) / idle (baseline ~39%, noisy):

| Switched off | Walking | Idle | Verdict |
| --- | --- | --- | --- |
| World tick (no per-frame React re-render) | 22% | 23% | Upper bound only: it is the game running |
| Sprite sheet re-timing (`getAnimations()` per render) | 70% | 35% | Real but small: it forces ~3 style recalcs per frame. Candidate, not done |
| Animated-tile redraw | 69% | ~same | Candidate, not done; changing it needs a visual-equivalence test |
| Weather (map weather is Clear) | 73% | 35% | Not done; changing weather draw rate needs designer approval |
| NPCs (4 on this map) | 75% | noisy | Within noise |
| Challenge-object outline filters | 49% vs 51% | | Within noise: no change warranted |

Sim cost per frame (party, NPCs, perception) is under 0.2 ms in all cases: the simulation is not the problem.
Not changed: A* or any simulation code, the editor, Combat Type 2.

## Budgets for hazards and destructibles (design constraints, not invented numbers)

Headroom after the fix at 60 Hz: about 70% of the main thread when walking. Stay inside it:

- Static destructibles are canvas tiles changed through `applyScenarioTiles` / `withMap` and `changedArea`.
- Hazards are one canvas layer or `tileEffects.json` animations. Never per-tile SVG filters; never hazard regions as
  challenge objects.
- Keep an active-hazard list and simulate it at a low fixed rate or on rounds; explosions are time-bounded; batch chain
  explosions into one map update per tick.
- Never animate an inherited CSS property on `:root` or a screen root. Re-measure with the runner after adding a layer.
