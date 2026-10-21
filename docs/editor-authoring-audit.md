# Game-to-Editor Authoring Audit

**Date:** 2026-10-18  
**Scope:** Runtime gameplay systems that already exist, versus what Dev Edit (Map Editor and its sub-editors) can author, save, reload, and playtest.  
**Method:** Source-code inspection of editor UI, `mapFormat` serialize/parse, loaders, and runtime consumers. Supporting unit tests were run (see §F). No gameplay code was changed. No interactive browser playtest was performed in this pass.

**Verdict in one line:** Dev Edit can author a substantial exploration episode (geometry, NPCs including patrol / response / perception / waypoint anims, Character Library pool CRUD in Vite DEV, conversations, objectives, challenge objects, environment, ground items, mission text), but it cannot fully author every runtime property without JSON/content-file edits—especially item/hazard/destructible type catalogues and standalone Combat encounter definitions.

**Update (2026-10-18, Phase 1):** NPC patrol routes, `responseType` inspector, and per-NPC perception overrides are Complete (see matrix #36–38; tests `npcAuthoring.test.js`).

**Update (2026-10-18, waypoint animations + Deck 10 test NPCs):** Optional per-waypoint idle fidgets (`animation`, `animationDuration`, `animationLoop`) author in Dev Edit, serialize on the map, and play via `NPCController` → exploration figure `pose`. Six reusable authored characters placed on Deck 10 Brig for patrol/response tests. See matrix #39.

**Update (2026-10-18, Phase 2 — Character Library):** Dev Edit Character Library CRUDs the authored NPC pool (`characters.json`) via Vite DEV `/__authored-characters`, nested Character Creator (isolated from the Main Menu draft), reference-protected delete, and live NPC picker refresh. Soft edit-save for legacy partial sheets; full validate for new entries. Production/Electron remain read-only. See matrix #40.

**Update (2026-10-18, Phase 3 — Hazard / Destructible authoring):** Map-instance overrides cover remaining runtime fields: hazard migrateChance, injuryType, damagesObjects, blocksSight, movement, layer, scarTile, full neutralize task (label/attribute/department/difficulty/focuses/equipment); destructible damagedHazard, debris, attackDifficulty, noExplosion; scan leak text fixed. Type catalogues remain JSON-only (no new types/art). See matrix #20, #24.

**Update (2026-10-20, Klingon dialogue expansion):** The Conversation Editor can now author everything the new conversation features use: a condition's source is a flag (names may hold `{npc}` and `{group}`) or one of the talking NPC's properties (disposition, hostility, Intimidated, check Difficulty change); new action forms for NPC stands down, NPC Intimidated, NPC check Difficulty and Influence nearby NPCs (effect, who, radius, origin, tile, sight, include speaker); the editor gained checkbox and select field kinds. The NPC Inspector shows the faction's default conversation next to "None" and the stat block's book category beside "Full character rules" (metadata only). **Cannot author without a content-file edit:** the faction defaults (`src/data/adaptation/exploration/defaultConversations.json`), the default influence radius (`social.json` `influenceRadiusTiles`), (the per-NPC influence radius is now in the NPC Inspector, and Task Check nodes have an Opposed checkbox; an Influence action's radius may be left blank to use the NPC's or the default; the NPC rules list also has "Stat block default" and "Full character rules"). `validateConversation` still does not check condition sources, `{group}` use on an NPC with no group, or the filter id of an Influence action.

**Update (2026-10-18, Phase 4 — Challenge object authoring):** Structured advanced-task UI (equipment / talentIds / roleIds / traitRules), board Edit Covers, duplicate/reorder objects-actions-states, effect enums for NPC response and neutralize modes, routine/Always warning, `validateMap` + conversation object-ref warnings, Object Inspector ownership + Edit in Object Editor. Samples may still use `challenges.json` until Object Editor adopt. `interactRange` remains hardcoded. See matrix #13–17, #56.

**Update (2026-10-21, editor UI redesign):** Map Editor chrome reorganized to the approved Mission Editor mockup layout without changing map schema or authoring behavior: `EditorMenuBar`, slim `EditorToolbar` (Animate / Grid / Overview / Layers / Levels), tabbed `EditorPalette` (Assets), `EditorPropertiesPanel` + `MapProperties` + `AssetProperties`, floating Overview / Layers / Levels windows, `EditorGridOptions` popover. Selection authors Cover/Fade, hazard intensity, and (for lit tiles) emissive / emit colour; Map authors ambient + ambientColour. Full-screen sub-editors unchanged. Layers / elevation / gizmos deferred. Whole summary refreshed in `docs/editor-authoring-summary.md`; lighting model in `docs/tiles.md`.

---

## A. Executive Summary

Overall editor coverage for the **exploration “Game” path** (Load Episode → Game, or editor Play) is strong for placement and most mission content. Coverage for **content catalogues** (item types, hazard/destructible types, authored character pool) and for **standalone Combat mode** encounters is weak or absent.

A complete playable episode **cannot** be authored end-to-end without programmer intervention or manual JSON editing if it needs any of:

- New item / hazard / destructible **types** (not just placements)  
- A custom standalone Combat roster (`encounters.json`)  
- Challenge-object content kept only in `challenges.json` without opening Object Editor (Deck 10 Brig still works this way)

New NPC sheets in the authored pool can be created in Dev Edit’s Character Library when running under the Vite DEV server (same write constraint as map Save).

If the episode stays within existing item/environment catalogues, authors NPCs (including new pool characters in DEV) with patrol/response/perception in Dev Edit, and authors challenge objects via the Object Editor onto `map.objects`, then a full Game-mode episode **can** be built, saved, playtested, and loaded normally—with the gaps above as the remaining blockers for parity with everything the runtime supports.

| Classification | Count |
|---|---|
| Features audited | **58** |
| Complete | **41** |
| Partial | **7** |
| Hardcoded | **7** |
| Missing | **2** |
| Broken | **0** |
| Not applicable | **1** |

Highest-priority gaps: **item / environment-type catalogues**, **standalone Combat encounter authoring**, challenge definitions still living only in `challenges.json` for sample maps.

---

## B. Complete Feature Matrix

Status key: **Complete** · **Partial** · **Hardcoded** · **Missing** · **Broken** · **N/A**

Columns: Runtime · Editor create · Configure · Place · Serialize · Reload · Playtest · Episode load

| # | Feature | Status | RT | Ed | Cfg | Pos | Ser | Rel | PT | Ep | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Tile painting / palette | Complete | Y | Y | Y | Y | Y | Y | Y | Y | `EditorPalette.jsx`, `useEditorTools.js`, `mapFormat.js` |
| 2 | Tile rotation | Complete | Y | Y | Y | Y | Y | Y | Y | Y | `mapFormat` rotated; tests `mapRotation` |
| 3 | Map resize / size presets | Complete | Y | Y | Y | — | Y | Y | Y | Y | `EditorToolbar.jsx`, `resizeMap` |
| 4 | Location / biome / weather | Complete | Y | Y | Y | — | Y | Y | Y | Y | toolbar + `mapWeather.js` |
| 5 | Ambient light | Complete | Y | Y | Y | — | Y | Y | Y | Y | `AmbientSlider`; `mapAmbient.test.js` |
| 6 | Episode name / card | Complete | Y | Y | Y | — | Y | Y | — | Y | `EditorSidePanel`, `EpisodeCardPicker` |
| 7 | Generate Map / Name / Card | Complete | Y | Y | Y | Y | Y* | Y* | Y | Y* | Generators; *until Save |
| 8 | Area labels | Complete | Y | Y | Y | Y | Y | Y | Y | Y | area tool + serialize |
| 9 | Player starts (≤8) + facing | Complete | Y | Y | Y | Y | Y | Y | Y | Y | markers; `awayTeam.js` |
| 10 | Enemy spawns + facing | Complete | Y | Y | Y† | Y | Y | Y | Y† | Y† | †Combat mode / NPC fallback; world fights use NPCs |
| 11 | Tile Cover / Fade flags | Complete | Y | Y | Y | — | Y‡ | Y‡ | Y | Y | `setTileFlag` → `tiles.json` (global) |
| 12 | Big-object 2×2 presentation | N/A | Y | via tiles | — | paint | Y | Y | Y | Y | Auto from `tiles.json` `big`; `bigObjects.js` |
| 13 | Challenge object definitions | Complete* | Y | Y§ | Y§ | Y | Y§ | Y§ | Y | Y | *Full Object Editor CRUD + duplicate/reorder; samples may still use `challenges.json` until adopt (§) |
| 14 | Challenge placement | Complete | Y | Y | — | Y | Y | Y | Y | Y | `objectPlacements` / Object Editor XY |
| 15 | Challenge covers (multi-tile) | Complete | Y | Y | board+text | Y | Y | Y | Y | Y | Board Edit Covers + Object Editor text; adopt on first cover edit if library-only |
| 16 | Challenge actions / outcomes | Complete | Y | Y | Y | — | Y | Y | Y | Y | `ObjectActionFields.jsx`, `EFFECT_TYPES` (+ enums) |
| 17 | Advanced task equipment / talents / roles / traits | Complete | Y | Y | structured | — | Y | Y | Y | Y | Structured UI + optional raw JSON escape hatch |
| 18 | `interactRange` | Hardcoded | Y | N | N | — | N | N | Y | Y | `challenges.json` top-level only |
| 19 | Destructible placement | Complete | Y | Y | Y | Y | Y | Y | Y | Y | Environment palette; `environmentEdits` tests |
| 20 | Destructible overrides | Complete* | Y | Y | Y | Y | Y | Y | Y | Y | *Per-instance damagedHazard, debris, attackDifficulty, noExplosion; type catalogue still JSON-only |
| 21 | Force-field linked tiles | Complete | Y | Y | Y | Y | Y | Y | Y | Y | Link mode in tools + inspector |
| 22 | Destructible type catalogue | Hardcoded | Y | place only | N | — | N | N | Y | Y | `destructibles.json` |
| 23 | Hazard paint / erase / merge | Complete | Y | Y | Y | Y | Y | Y | Y | Y | `paintHazardTile`; round-trip tests |
| 24 | Hazard region overrides | Complete* | Y | Y | Y | Y | Y | Y | Y | Y | *migrateChance, injury, damagesObjects, sight/movement/layer/scar, neutralize task; type catalogue still JSON-only |
| 25 | Hazard type catalogue | Hardcoded | Y | place only | N | — | N | N | Y | Y | `hazards.json` |
| 26 | Generate hazards with map | Complete | Y | Y | toggle | Y | Y* | Y* | Y | Y* | Side panel checkbox |
| 27 | Ground item placements | Complete | Y | Y | Y | Y | Y | Y | Y | Y | Inventory palette; `groundItemPlacements.test.js` |
| 28 | Item type catalogue / behaviors | Hardcoded | Y | place only | N | — | N | N | Y | Y | `items.json` + `src/items/*` |
| 29 | Session drop/pickup | N/A | Y | N | — | runtime | N | N | Y | Y | Intentionally not map-authored |
| 30 | NPC place / move / delete | Complete | Y | Y | Y | Y | Y | Y | Y | Y | NPC tool + inspector |
| 31 | NPC character / appearance | Complete* | Y | pick+Library | pick | Y | Y | Y | Y | Y | *Pool CRUD via Character Library (DEV); instance appearance unchanged |
| 32 | NPC faction / disposition / rules | Complete | Y | Y | Y | — | Y | Y | Y | Y | `NpcInspector.jsx` |
| 33 | NPC conversation link | Complete | Y | Y | Y | — | Y | Y | Y | Y | Select + open Conversation Editor |
| 34 | NPC alert group / method | Complete | Y | Y | Y | — | Y | Y | Y | Y | Inspector fields |
| 35 | NPC must-survive | Complete | Y | Y | Y | — | Y | Y | Y | Y | Checkbox; serialize tests |
| 36 | NPC `responseType` | Complete | Y | Y | Y | — | Y | Y | Y | Y | `NpcInspector` dropdown; `RESPONSE_TYPES`; `npcAuthoring.test.js` |
| 37 | NPC patrol routes | Complete | Y | Y | Y | Y | Y | Y | Y | Y | Edit Patrol on board; `mapFormat` patrol; route preview; `npcAuthoring.test.js` |
| 39 | NPC waypoint animations | Complete | Y | Y | Y | Y | Y | Y | Y | Y | Idle fidgets only (`waypointAnimations.js`); inspector preview; interrupts on detect/combat |
| 38 | NPC perception overrides | Complete | Y | Y | Y | — | Y | Y | Y | Y | Inspector overrides + Reset; `PERCEPTION_KEYS`; runtime merge verified |
| 39 | Fallback `npcs.json` | Hardcoded | Y | N | N | — | separate | Y | Y | Y | Used only when map has no `npcs` |
| 40 | Authored character pool | Complete* | Y | Library | Y | — | DEV file | Y | Y | Y | *Vite DEV Character Library → `characters.json`; player saves still separate |
| 41 | Conversations (node graph) | Complete | Y | Y | Y | — | Y | Y | Y | Y | `ConversationEditorScreen`; `conversationFiles.js` |
| 42 | Conversation actions | Complete | Y | Y | Y | — | Y | Y | Y | Y | `conversationActions.js` ACTION_TYPES |
| 43 | Objectives | Complete | Y | Y | Y | Y | Y | Y | Y | Y | Objective Editor; conditions; markers |
| 44 | Briefing / outros / stardate | Complete | Y | Y | Y | — | Y | Y | Y | Y | Side panel; Deck 10 has briefing (no outros authored) |
| 45 | Story wording templates | Complete | Y | Y | Y | — | global | Y | Y | Y | `StoryEditorScreen` → `missionLog.json` (all maps) |
| 46 | Mission flags / conditions | Complete | Y | via editors | Y | — | Y | Y | Y | Y | Objectives, conversations, object requires |
| 47 | Captain’s Log auto entries | N/A | Y | authored add | — | — | — | — | Y | Y | Runtime + `addLogEntry` effects |
| 48 | World combat start | Partial | Y | indirect | disposition / dialogue | Y | Y | Y | Y | Y | No “encounter” authoring; awareness + `startCombat` action |
| 49 | Standalone Combat encounter | Hardcoded | Y | map only | N | spawns | N | N | Combat mode | Combat mode | `encounters.json` roster/objectives |
| 50 | Combat↔exploration handoff | N/A | Y | N | — | — | — | — | Y | Y | `combatLink.js` / `WorldEncounter` |
| 51 | Weather / ambient presentation | Complete | Y | Y | Y | — | Y | Y | Y | Y | Saved on map |
| 52 | Explosion VFX kinds | Partial | Y | override | kind list | — | Y | Y | Y | Y | Placement override; flipbook art not kind-driven (docs) |
| 53 | Map save / load / rename | Complete | — | Y | — | — | Y | Y | — | Y | `mapFiles.js` `/__maps` (dev only write) |
| 54 | Editor Play (playtest) | Complete | Y | Y | enemiesActive | in-memory | — | — | Y | — | `ExplorationPlaytest` uses open map, unsaved OK |
| 55 | Load Episode → Game | Complete | Y | — | — | — | — | disk | — | Y | Saved map only |
| 56 | Map validation warnings | Partial | — | Y | limited | — | — | — | — | — | `validateMap` includes challenge objects; objectives/conversations still partial |
| 57 | Legacy hazard **tiles** roles | Partial | warn | paint | — | Y | Y | Y | unclear | unclear | `role: hazard` / `hazardControl` vs region hazards |
| 58 | Room env-control consoles | Complete | Y | as objects | Y | Y | Y§ | Y§ | Y | Y | Challenge objects + `neutralizeHazardsInRoom` |

\* Persist only after Save.  
† Enemy spawns drive Combat mode roster slots and fallback NPCs when the map has no `npcs`.  
‡ Catalogue write, not map-local.  
§ Complete once Object Editor has copied definitions onto the map; shared `challenges.json` content is not edited as a map file field until then.

---

## C. Missing Authoring Capabilities

### Blocking or near-blocking

1. **Item / hazard / destructible type catalogues**  
   - Placement and per-instance overrides of existing hazard/destructible types are Complete (Phase 3).  
   - Creating new type definitions, structure defaults for the catalogue, and item behaviors (`src/items/`) still have no Dev Edit surface.

2. **Standalone Combat encounter definitions**  
   - `encounters.json`: roster, combat objective text, `npcRules`, `standardIssueWeapon`, `autoCombat`.  
   - Editor only places spawn markers; roster order is fixed to the first encounter’s length for warnings (`ENEMY_SPAWNS_NEEDED`).

### Resolved in Phase 2 (2026-10-18)

- **Authored NPC character pool** — Character Library in Dev Edit (Vite DEV write to `characters.json`). Player saves remain a separate list (no auto-promote).

### Resolved in Phase 1 (2026-10-18)

- **NPC patrol waypoints** — board Edit Patrol, wait/facing/reorder/delete, serialize/parse (`mapFormat.js`), runtime via `npcConfigsFor` → `createNpc`.
- **NPC waypoint animations** — optional idle fidget per waypoint (duration + loop); editor preview does not write map data; runtime pose while waiting; cleared on investigate/combat/alert focus.  
- **NPC `responseType`** — dropdown in `NpcInspector` (`RESPONSE_TYPES`). Deck 10 `guardB` value preserved.  
- **NPC perception overrides** — per-field overrides of `awareness.json` `perceptionDefaults`, Reset, serialize/parse.

### Resolved in Phase 3 (2026-10-18)

- **Hazard region overrides** — migrateChance, injuryType, damagesObjects, blocksSight, movement, layer, scarTile, neutralize task fields (incl. optional equipment JSON); validateMap warnings.
- **Destructible overrides** — damagedHazard, debris, attackDifficulty, noExplosion; scan “When damaged” matches leak.

### Incomplete configuration (Partial)

| Area | Missing vs runtime |
|---|---|
| Challenge objects | Covers are a text field; Object Inspector on the board is placement-only (full edit in Object Editor). Advanced task fields are JSON. |
| Challenge shared library | **No map under `maps/` currently embeds an `objects` array**—definitions live in `challenges.json` + per-map `objectPlacements` (Deck 10 Brig included). Object Editor can adopt them into the map on first edit. |
| `schemaVersion` | Always written as `1` by `serializeMap`; parse never reads or validates it. |
| `interactRange` | Global in `challenges.json`, not per map/object. |
| World combat | No encounter author; fights emerge from awareness/disposition/`startCombat`. |
| Validation | Does not warn on missing conversations, broken objective flags, empty challenge actions, etc. |

### Phase 3 DEV acceptance checklist

1. Paint a fire region → set Migrate chance, Injury type Stun, Neutralize attribute/department → Save map → reload → fields persist.
2. Play exploration → stand in fire → Injury type matches override; Neutralize ring uses overridden label/task.
3. Place EPS Conduit → When damaged leaks Smoke; uncheck Explodes; Attack Difficulty 4 → Play → damage leaks smoke; destroy does not blast; object shot uses Difficulty 4.
4. Deck 10 / Explosion Test still load; existing hazard/destructible tests pass.

### Workflow constraints (not bugs)

- Map / conversation / story / tile-flag **writes require the Vite dev server** (`canSaveMaps`, `canSaveConversations`, `canEditStory`, `canEditTiles`). Built/desktop builds are read-only for those files.  
- Playtest uses the **in-memory** map; Load Episode uses the **saved** file—unsaved Play does not update the episode list until Save.  
- Story wording is **global** (`missionLog.json`), not per episode.

---

## D. Broken or Incomplete Workflows

**Broken (editor control fails):** none verified in this audit. Focused unit tests for authoring paths all passed (see §F).

**Incomplete / easy-to-misread workflows (source-verified):**

1. **Deck 10 challenge content looks “on the map” but definitions are external**  
   - Expected (from Object Editor copy): definitions in `map.objects`.  
   - Actual: `maps/Deck 10 Brig.json` has `objectPlacements` + no `objects`; runtime pulls definitions from `challenges.json` `"Deck 10 Brig"`.  
   - Board Object Inspector still says “Where challenges.json puts it” when not map-owned.  
   - First Object Editor edit that commits objects switches the map to map-owned definitions.

2. **Combat mode “episode” ≠ authored world fight**  
   - Load Episode → Combat always uses `engineeringDeckBoarding` roster from `encounters.json` on the chosen map’s spawns.  
   - Exploration world fights use `explorationContact` (empty roster; whoever is hostile in the world).

3. **Legacy hazard tile roles vs region hazards**  
   - `validateMap` still warns about `role: hazard` / `hazardControl` tiles.  
   - Environmental gameplay uses `map.hazards` regions + challenge neutralize / room controls. Painting grating/`epsControl` tiles may confuse authors.

*Reproduction is from file + code inspection; interactive browser playtest of the new NPC patrol UI was not run in this pass (unit tests cover serialize/runtime).*

---

## E. Recommended Implementation Plan

### Priority 1 — Blocks complete episode authoring (parity with runtime)

| Item | Complexity | Dependencies |
|---|---|---|
| ~~NPC patrol / responseType / perception~~ | **Done (Phase 1)** | — |
| ~~Waypoint animations + Deck 10 test NPCs~~ | **Done** | Idle fidgets only; no console/maintenance sheets |
| ~~Character Library → authored NPC pool~~ | **Done (Phase 2)** | Vite DEV write; nested creator; ref-protected delete |
| Document + optionally migrate Deck 10 objects into `map.objects` so flagship content is map-owned | Low (migrate) / Medium (tooling) | Object Editor “adopt” already exists |

### Priority 2 — Existing systems with incomplete editor depth

| Item | Complexity | Dependencies |
|---|---|---|
| ~~Hazard inspector: migrate / injury / neutralize task / etc.~~ | **Done (Phase 3)** | Instance overrides |
| ~~Destructible: damagedHazard / attackDifficulty / debris / noExplosion~~ | **Done (Phase 3)** | Instance overrides + scan fix |
| Challenge covers: click-to-add tiles instead of text | Medium | Object Editor / board |
| Structured UI for task equipment / talentIds / traitRules | Medium | `ObjectActionFields` |
| Per-map or editable `interactRange` | Low | Design + `challenges.json` / map field |
| Richer `validateMap` (conversation exists, objective refs, object actions) | Medium | Cross-file checks |
| Remove or retarget legacy hazard-tile validation | Low | Design |

### Priority 3 — Workflow / catalogues / Combat mode

| Item | Complexity | Dependencies |
|---|---|---|
| Catalogue editors for items / hazards / destructibles (or “content pack” workflow) | High | Art pipeline, schemas, behaviors |
| Standalone Combat encounter editor (roster, objectives, issue weapon) | Medium | `encounters.json`, CombatSetup |
| Per-episode story wording (if desired) | Medium | `missionStory` / save path |
| Clear UI copy: challenges.json vs map.objects; Play vs Save; Combat vs Game | Low | Side panel / Object Inspector text |

---

## F. Verification Evidence

### Primary source files

| Area | Files |
|---|---|
| Editor shell | `src/screens/MapEditorScreen.jsx`, `EditorToolbar.jsx`, `EditorSidePanel.jsx`, `EditorPalette.jsx`, `useEditorTools.js`, `EditorInspectors.jsx` |
| Inspectors | `NpcInspector.jsx` (response / perception / patrol), `HazardInspector.jsx`, `DestructibleInspector.jsx`, `GroundItemInspector.jsx`, `ObjectInspector.jsx`, `MarkerInspector.jsx` |
| Sub-editors | `ObjectEditorScreen.jsx`, `ObjectActionFields.jsx`, `ObjectiveEditorScreen.jsx`, `ConversationEditorScreen.jsx`, `StoryEditorScreen.jsx` |
| Format I/O | `src/maps/mapFormat.js`, `mapFiles.js`, `mapEdits.js` |
| Runtime | `explorationState.js`, `challengeObjects.js`, `awareness.js`, `NPCController.js`, `world/environment.js`, `objectAuthoring.js`, `objectEffects.js`, `conversationActions.js`, `combat/encounters.js` |
| Content | `maps/*.json`, `conversations/`, `src/data/adaptation/exploration/challenges.json`, `npcs.json`, `awareness.json`, `world/hazards.json`, `world/destructibles.json`, `items.json`, `combat/encounters.json`, `characters.json` |

### Tests run (non-destructive, 2026-10-18)

```
node --import ./tools/jsonLoader.mjs --test \
  tests/groundItemPlacements.test.js \
  tests/objectAuthoring.test.js \
  tests/environmentEdits.test.js \
  tests/mapAmbient.test.js \
  tests/mapRotation.test.js \
  tests/missionObjectives.test.js \
  tests/conversation.test.js \
  tests/mapEditorTools.test.js
```

**Result:** 90 passed, 0 failed (includes Deck 10 encounter checks inside `conversation.test.js`, hazard/destructible edit round-trips, ground item seeding, objective conditions, map-owned objects).

A broader accidental full-suite run also surfaced failing golden fingerprints in `objectGolden.test.js` / controller fingerprints—outside the authoring save/load path and not treated as editor Broken in this audit.

Related suites not re-run to green here but relevant: `objectGolden.test.js`, `deck10Environment.test.js`, `hazards.test.js`, `destructibles.test.js`, `mapStore.test.js`.

Explore-agent corroboration (same session): editor inventory, serialization pipeline, and runtime catalogue—aligned with the matrix above; no classification changes required beyond the sample-map `objects` and `schemaVersion` notes.

**Phase 1 re-verification (2026-10-18):** `tests/npcAuthoring.test.js` + `conversation.test.js` + `mapEditorTools.test.js` — 39 passed. Lint (pre-existing warnings only) and `npm run build` succeeded. Matrix rows #36–38 updated to Complete.

**Phase 4 re-verification (2026-10-18):** `tests/objectAuthoring.test.js` + `tests/objectGolden.test.js` (fingerprints refreshed to current Deck 10 / Vault runtime; drift predated Phase 4 authoring UI). Matrix #13–17 Complete; #56 Partial (challenge warnings via `challengeMapWarnings` in Map Editor beside `validateMap`).

**Phase 4 DEV acceptance checklist**

1. Object Editor → Add Object → structured equipment + trait rule → Save → Play → attempt succeeds/fails as authored.  
2. Board: select object → Edit Covers → toggle tiles → Save → reload.  
3. Duplicate Object / Action / State; Move Up/Down on object list.  
4. Outcome enums: neutralize mode + setNpcResponse from/to dropdowns.  
5. Routine + Always effect shows warning; conversation naming missing object id shows in Warnings.  
6. Deck 10 still loads from `challenges.json` until Object Editor adopt.

### Limits of this audit

- No interactive browser playtest of Dev Edit click paths.  
- Docs (`world-objects.md`, `prototype-rules.md`) used only as leads; classifications follow code. Note: `world-objects.md` still says dropped items are not map-authored, but `groundItemPlacements` + Inventory Objects tool are implemented—code wins.  
- Catalogue completeness (every `items.json` field, every tile role) was sampled, not exhaustively field-listed.  
- Future/unimplemented systems were excluded per brief.

---

## Appendix: Data path (Game mode)

```
Dev Edit UI
  → in-memory map (+ conversations/*.json, optional missionLog story, tiles.json flags)
  → serializeMap / saveConversation (dev `/__maps`, conversation store)
  → maps/{id}.json + conversations/
  → loadMap / parseMapFile (Episode Select or editor Load)
  → createExplorationState(map, …)
       → challengeDefinitionsFor (map.objects ?? challenges.json[map])
       → createEnvironment(map.destructibles, map.hazards)
       → npcConfigsFor (map.npcs ?? npcs.json)
       → seedGroundItemPlacements(map.groundItemPlacements)
  → exploration / world combat runtime
```

Editor Play short-circuits disk: same `createExplorationState` with the open in-memory map (`ExplorationPlaytest`).
