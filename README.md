# ST-Adventures

A single-player Star Trek RPG prototype built on the *Star Trek Adventures* 2nd edition rules, with the STA 2e Core
Rulebook as the rules authority (lifepath included). It exists to prove the game design, the rules adaptation, the interaction flow and the data model before
production work in Unreal. React + Vite + plain JavaScript; no backend, no database, no state-management framework.

## Running it

```
npm install
npm run dev        # Vite dev server at http://localhost:5173/
npm test           # node --test, 228 tests (tests/*.test.js)
npm run lint       # oxlint
npm run build      # production bundle in dist/
npm run app        # build, then open it in Electron
npm run dist:win   # portable Windows .exe (electron-builder)
```

The dev server also saves files for you: characters to `characters/`, maps to `maps/` and tile edits to the tile
catalogue (endpoints in `vite.config.js`, stores in `tools/`). `characters/` and `maps/` are both tracked by git, so
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
| Character creator | `src/CharacterCreator.jsx`, `src/screens/*Screen.jsx`, `src/rules/` | Eight screens following the STA 2e Core Rulebook lifepath (Species → Environment → Upbringing → Career Path → Career (Experience, assignment, rank) → Career History → Finishing Touches → Review). Exports a character as JSON. |
| Combat (Type 1) | `src/combat/`, `src/components/combat/` | Turn-based grid combat on the game's maps: the STA 2E task roll, Momentum and Threat, Injuries, Guard / First Aid / Direct / Assist, an AI for both sides, and a seeded reducer so any fight replays exactly. |
| Exploration | `src/exploration/` | Moving the party around a map in formation, NPC awareness and what the party knows, challenge objects worked with the same task roll; hands off to combat and back (`combatLink.js`). |
| Map editor | `src/maps/`, `src/components/maps/` | Paints the isometric maps the other parts play on, from the tile catalogue (`docs/tiles.md`). |
`src/App.jsx` is the shell: the main menu, Settings, and lazy-loaded views for each part.

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
(`src/character/characterReducer.js`). Export (`src/export/serializeCharacter.js`, schema `0.10.0`) writes the draft plus
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
  components         shared UI
  styles.css         imports src/styles/*.css in cascade order
  combat, exploration, maps     the other parts
tests/               node --test suites; tests/support/ has fixtures
tools/               dev-server stores and the JSON loader for tests
scripts/             tile, episode-card, mock portrait-layer and portrait-backdrop art generators (Node, write PNGs into public/art)
electron/            desktop wrapper
docs/                design-tracker.md, prototype-rules.md, tiles.md
reference/           the rulebook PDFs (not committed)
```
