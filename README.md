# ST-Adventures

A single-player Star Trek RPG prototype built on the *Star Trek Adventures* 2nd edition rules, with the STA 2e Core
Rulebook as the rules authority (lifepath included). It exists to prove the game design, the rules adaptation, the interaction flow and the data model before
production work in Unreal. React + Vite + plain JavaScript; no backend, no database, no state-management framework.

## Running it

```
npm install
npm run dev        # Vite dev server at http://localhost:5173/
npm test           # node --test, ~1370 tests (tests/**/*.test.js)
npm run lint       # oxlint
npm run build      # production bundle in dist/
npm run app        # build, then open it in Electron
npm run dist:win   # portable Windows .exe (electron-builder)
```

The dev server also saves files for you: characters to `characters/`, maps to `maps/`, conversations to
`conversations/` and tile edits to the tile catalogue (endpoints in `vite.config.js`, stores in `tools/`).
`characters/`, `maps/` and `conversations/` are tracked by git, so
commit them to share the same content between machines. Each map has at most one generated episode thumbnail,
`public/art/episodes/<map name>.png`, which `tools/mapStore.cjs` writes, renames and deletes along with the map; the
catalogue card art in the same folder (`episodeCards.json`) is never touched. The unpackaged Electron app
(`npm run app`) saves characters to the same `characters/` folder; the portable `.exe` saves them in a `characters/`
folder next to the `.exe`, and built copies can't save maps.

The soundtrack is not in the repository. Drop the MP3s into `public/music/` (gitignored) and the menu plays them; without
them the app runs silently.

## The four parts

| Part | Where | What it does |
| --- | --- | --- |
| Character creator | `src/CharacterCreator.jsx`, `src/screens/*Screen.jsx`, `src/rules/` | Eight screens following the STA 2e Core Rulebook lifepath (Species → Environment → Upbringing → Career Path → Career (Experience, assignment, rank) → Career History → Finishing Touches → Review). Exports a character as JSON (schema `0.12.0`). |
| Combat (Type 1) | `src/combat/`, `src/components/combat/` | Turn-based grid combat: STA 2e task roll, Momentum/Threat, Injuries, Guard / First Aid / Direct / Assist, social surrender, Scan trait, object shots, hazards, Auto Combat AI (both sides), seeded reducer so fights replay. |
| Exploration | `src/exploration/`, `src/conversation/`, `src/world/` | Away team (up to 8, one team) on a map: formations, sneak, awareness, challenge objects, conversations, objectives, Captain's Log, intro/outro, transporter; shared destructibles/hazards/explosions; hands off to combat and back (`combatLink.js` / `WorldEncounter.js`). |
| Map editor | `src/maps/`, `src/components/maps/`, `src/components/conversation/` | Paints isometric maps (`docs/tiles.md`); places NPCs, objectives, destructibles and hazards; edits conversations, challenge objects, objectives and story wording; Play-tests from the editor. |

`src/App.jsx` is the shell: the main menu, Settings, and lazy-loaded views for each part. Ship builder is a placeholder only.

The exploration, combat and map editor boards are drawn only with PixiJS (WebGL): the map, figures and effects. A
transparent SVG layer on top takes pointer input, sets the camera and holds UI such as the action ring and tooltips.
If WebGL won't start, the board says so and asks for hardware acceleration
(`src/components/maps/pixi/WebglUnavailable.jsx`). Frame-rate measurements and the tools that take them are in
`docs/performance.md`.

## Book vs. Prototype

The STA 2e Core Rulebook is the rules authority (designer decision, Oct 2026); the *Captain's Log* Solo RPG is cited only
where the prototype still uses something from it. The rules come from two places and the code keeps them apart:

- `src/data/source/` is **what the books say**: every file carries a `source: { book, page }` citation to the PDFs in
  `reference/` and `reference/core-pdf/`.
- `src/data/adaptation/` is **what the prototype decided**: videogame changes, content lists, screen order, UI text.
- `src/rules/` applies both. It is plain JavaScript with no React in it, so the tests can run it headless.

Comments and tests say which is which ("Book p.129" vs "Prototype" / "Designer decision"). Every prototype rule that
departs from the books is listed in `docs/prototype-rules.md`. Open questions for the designer, and decisions already
made, are in `docs/design-tracker.md`.

## The character model

The creator holds one canonical draft (`src/character/characterModel.js`) that every screen edits through the reducer
(`src/character/characterReducer.js`). Export (`src/export/serializeCharacter.js`, schema `0.12.0`) writes the draft plus
the derived `final` scores, values, focuses, talents and service details. Everyone in the game, player or NPC, is then
read back through `src/character/runtimeCharacter.js` into the same runtime shape, so combat and exploration never care
where a character came from.

## Layout

```
src/
  data/source        book data, with page citations
  data/adaptation    prototype decisions and content
  rules              pure rule functions (creator, tasks, condition, resources)
  character          the creator's state, reducer and the runtime character
  screens            one component per screen
  components         shared UI (combat, exploration, maps, dice, …)
  styles.css         imports src/styles/*.css in cascade order
  combat             turn-based fight reducer, actions, AI
  exploration        party, awareness, mission, combat hand-off
  world              destructibles, hazards, challenge-object classes
  conversation       dialogue runtime and format
  maps               map format, generators, area centres
  actors             player / NPC / enemy controllers
  export             character JSON serialize + download
  settings, audio    display and sound
  items              behaviour classes for the Technical Manual tools and weapons (id registry)
  effects            weather and screen effects (presentation only)
  dev                performance probe and profiler
tests/               node --test suites; tests/support/ has helpers, tests/fixtures/ holds frozen copies of authored files
tools/               dev-server stores and the JSON loader for tests
scripts/             tile, sprite, hazard, dice, cursor and episode-card art generators
electron/            desktop wrapper
docs/                design-tracker, prototype-rules, world-objects, combat-architecture, …
reference/           the rulebook PDFs (not committed)
```

## Docs map

| Doc | Role |
| --- | --- |
| `docs/prototype-rules.md` | Every Book vs Prototype rule difference |
| `docs/design-tracker.md` | Open designer questions and decision history |
| `docs/world-objects.md` | Challenge / destructible / hazard code layout |
| `docs/combat-architecture.md` | Combat actions, encounters, reducer |
| `docs/character-controllers.md` | Player / NPC / enemy controllers |
| `docs/tiles.md` | Tile catalogue fields and symbols |
| `docs/performance.md` | Frame-rate measurements and probe tools |
