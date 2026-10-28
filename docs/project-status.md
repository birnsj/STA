# Project status

Snapshot of the playable vertical slice on `main` as of **2026-10-28** (`f9350dd`, synced with `origin/main`).

This is the high-level “where every aspect stands” board. Book-vs-Prototype rule diffs live in `prototype-rules.md`. Open designer questions and decision history live in `design-tracker.md`. Architecture notes: `combat-architecture.md`, `character-controllers.md`, `world-objects.md`, `tiles.md`, `editor-authoring-summary.md`, `performance.md`.

Status key: **SHIPPED** playable and intended for use · **PARTIAL** usable with known gaps · **DEFERRED** intentionally not built · **PLACEHOLDER** menu/UI stub or unused shell.

---

## Code review (2026-10-28)

### Health

| Check | Result |
| --- | --- |
| Working tree | Clean; `main` = `origin/main` |
| Tests | Green after 2026-10-28 fix to `shipServiceRecord.test.js` (campaign-year gating) |
| Lint (`oxlint`) | Pass with warnings (mostly unused imports in ship creator screens / `shipModel.js`, and React `setState`-in-effect on ship appearance screens) |
| Character export schema | `0.12.0` |
| Ship model version | `SHIP_VERSION = 1` (localStorage draft + saved list; no interchange schema id yet) |

### Findings (priority)

1. **P1 — Ship service-record test (fixed 2026-10-28).** `selectTimeframe(…, 'tmp')` keeps campaign year **2279** when moving from TOS. Excelsior launches **2285**, so the test now sets year 2285 before selecting Excelsior.
2. **P2 — Dead placeholder.** `src/screens/ShipBuilderPlaceholder.jsx` is unused; `App.jsx` loads `ShipCreator`. Safe to delete when convenient.
3. **P2 — Docs drift (addressed by this file + README).** README still described the ship builder as a placeholder; design-tracker / prototype-rules header dates were stuck on 2026-10-16 while starship and inventory work shipped later.
4. **P3 — Lint debt in ship creator.** Unused helpers in `shipModel.js` / tests, and several `useEffect` → `setState` patterns on appearance / service-record screens. Non-blocking; clean when touching those files.
5. **P3 — Main menu stubs.** Continue and Exit remain disabled. Import Ship enables when any saved ship exists (overrides the static `enabled: false` in `MENU_ITEMS`).
6. **P3 — Stale comments (cleared 2026-10-28 follow-up).** `music.js` no longer claims the soundtrack is gitignored; design-tracker Starship review no longer says Resistance/Shields/Crew Support are uncalculated.

### Architecture verdict

The slice is structurally sound for a prototype: rules stay in plain JS (`src/rules/`, `src/combat/`, `src/ships/shipModel.js`), React owns UI state, Pixi draws boards only. Character and ship creators share footer / guide / step-summary patterns. Biggest product gaps are **ship combat**, **Determination / Values in play**, **mission persistence** (inventory / ground items / mid-mission continue), and **rank gameplay effects** — all already flagged in the design tracker, not silent inventions.

---

## Aspect board

### 1. Character creation — SHIPPED

Eight Core lifepath screens (Species → … → Review), Auto / Autofill / Clear, save list, JSON export schema `0.12.0`, import back into the creator. Species list and talent pool are prototype-trimmed (see `prototype-rules.md` §1). Posting still deferred to ship creation.

Where: `src/CharacterCreator.jsx`, `src/screens/*Screen.jsx`, `src/character/`, `src/export/serializeCharacter.js`, `src/data/source|adaptation/`.

### 2. Starship creation — SHIPPED (play rules PARTIAL)

Seven screens (Timeframe → Spaceframe → Mission Profile → Service Record → Refits → Finishing Touches → Review). Footer matches character creator; confirmed ships save separately from the draft; Export JSON / Import Ship from the menu. Derived Resistance, Shields, Crew Support show on summary. **Ship combat and most RAW service-record special rules are deferred.** Trait / talent descriptions on Review still “Unknown”; class designation “N/A”.

Where: `src/ships/`, `src/screens/ships/`, `src/data/ships/`, `docs/prototype-rules.md` §8.

### 3. Personal combat — SHIPPED (PARTIAL vs full Core)

Turn-based isometric combat: task rolls, Momentum / Threat, Injuries, Guard / First Aid / Direct / Assist / Scan, social surrender, object shots, hazards, Auto Combat AI both sides, seeded reducer. Recent: hand-to-hand emphasis (Minor Klingons, Punch / Kick / Prone, attack reactions / knockback, Auto Combat rush to Reach). Not in: Keep the Initiative, Determination, full Obtain Information economy, scene-end Momentum loss, buying off complications with Threat.

Where: `src/combat/`, `src/components/combat/`, `docs/combat-architecture.md`, `docs/prototype-rules.md` §5.

### 4. Exploration — SHIPPED (PARTIAL persistence)

Away team (up to 8), formations, sneak, awareness, challenge objects, objectives, Captain’s Log intro/outro, transporter, inventory + elevated ground items, combat hand-off (`combatLink.js` / `WorldEncounter.js`). Defeat in a world fight fails the mission. Inventory / ground state is **session-only** (no mid-mission Continue yet). Confront response still attacks as a placeholder. Quickbar for bag tools not built (bag-only tools give no task bonus until then).

Where: `src/exploration/`, `src/components/exploration/`, `src/world/`, `docs/prototype-rules.md` §6.

### 5. Conversations / social — SHIPPED (content PARTIAL)

Conversation editor + runtime, Task Checks (including opposed), Talk on the NPC ring, Persuade / Intimidate as conversation options in the Klingon path, influence-nearby effects. Klingon / Deck 10 side conversations are implementer drafts awaiting designer line review. Default conversations by faction only (species defaults open).

Where: `src/conversation/`, `conversations/`, `docs/design-tracker.md` (Klingon expansion).

### 6. Map editor (Dev Edit) — SHIPPED (authoring PARTIAL)

Paint maps, layers / Null / floorUnder, NPCs, objectives, destructibles, hazards, ground items, conversations, story, Generator Editor, music cues per map, playtest. Multi-deck Levels UI is still a placeholder. Item / hazard / destructible **catalogues** and standalone Combat encounter authoring still need JSON edits (`editor-authoring-summary.md`: ~41 complete / 7 partial / 7 hardcoded / 2 missing as of last audit).

Where: `src/components/maps/`, `src/maps/`, `docs/tiles.md`, `docs/editor-authoring-summary.md`.

### 7. Music / audio — SHIPPED

Tracked `music/` MP3s; menu, creation, exploration, combat, Captain’s Log intro/outro; per-episode overrides in the map editor. UI SFX for inventory pick/drop and other chrome. Missing files → silent.

Where: `src/audio/`, `music/`, README soundtrack section.

### 8. Electron / desktop — SHIPPED (PARTIAL vs web parity)

`npm run app` / `dist:win` portable exe. Unpackaged app can save characters to `characters/`; portable build saves characters beside the exe and **cannot save maps**.

Where: `electron/`, `package.json` build block.

### 9. Shared task / resources — PARTIAL

`prepareTask` / Roll window shared across modes. Focus and talent application are list-driven. Determination and Values in play not implemented. Bonus Momentum saved to the pool (prototype switch). Momentum payment for bought dice: pool first, then Threat (no player split).

Where: `src/rules/task*.js`, `missionResources.js`, `docs/prototype-rules.md` §§2–3.

### 10. Docs — PARTIAL (refreshed this snapshot)

`prototype-rules.md` and `design-tracker.md` remain the authority files but their header “Doc status” dates lagged recent starship / inventory / music work until this update. This file is the concise board; do not duplicate long rule text here.

---

## Main menu gates

| Item | State |
| --- | --- |
| Continue | Disabled (no mission save/load) |
| Create Character | Enabled |
| Import Character | After any importable / saved character |
| Build Ship | After a saved character |
| Import Ship | When any saved ship exists |
| Load Episode | After a saved character (combat or exploration prototype) |
| Settings | Enabled |
| Exit | Disabled |
| Dev Edit | Always (corner button) |

---

## Top open designer topics

Pulled from `design-tracker.md` Open (not exhaustive):

1. How **rank** should affect play (dialogue, authority, content gates, progression).
2. **Mission save/load** including inventory and ground items; whether Continue unlocks.
3. **Quickbar** contents vs bag-only tool bonuses.
4. **Prone** presentation mismatch (rules vs standing figure after knockdown).
5. Map-editor **layer defaults** and multi-deck Levels.
6. Klingon / Deck 10 **dialogue line** review and default-conversation-by-species.
7. Destructible / hazard **numbers** (all placeholders pending tune).
8. Ship **combat** and remaining RAW service-record special rules.

---

## Suggested next engineering passes (no design claims)

1. Delete unused `ShipBuilderPlaceholder.jsx`.
2. Trim unused ship-model helpers / lint warnings when next in those files.
3. Keep this board’s date and commit SHA current when a major area lands.
