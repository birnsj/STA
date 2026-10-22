# World objects

Implementation note: how the code is organised. No rules change here; the rules are in `prototype-rules.md`, and the test content's objects are in `src/data/adaptation/exploration/challenges.json` (a map may also store its own `objects` definitions).

**Doc status (2026-10-16):** covers challenge objects, destructibles, hazards, room Environmental Controls (`neutralizeHazardsInRoom`), and the environment record including scars.

## The split

- **Definitions are authored data.** The Object Editor writes full definitions onto `map.objects` (adopt-on-first-edit from `challenges.json` when the map has none). Maps with `objects: null` still load `challenges.json` for their name; `objectPlacements` moves a library object (`challengeDefinitionsFor`, `src/exploration/challengeObjects.js`).
- **Runtime is plain data.** `scenario.objects[id] = { state, locks, combatLocks, difficultyMods, originalTiles }`, next to the mission flags, scene traits, the object log and `taskCount` in the exploration state. Saves and maps are unchanged.
- **Behaviour is in a class.** `src/world/` holds the object classes. An instance holds nothing but its definition. Each method takes the exploration state and returns a value or a new state, the same way the character controllers do (`character-controllers.md`).

## Classes

- **`WorldObject`** is the base class: id, position, the tiles it covers (its own plus `covers`, e.g. a two-tile doorway), its runtime record, distance, and the view the board and lists draw.
- **`ChallengeObject`** extends it:
  - `createRuntime(map)` and `currentTiles(scenario)`, the tile each state shows;
  - `availableActions(state)`: requirements, real-time locks and combat-round locks;
  - `inReach(point)` and `membersInRange(party)`;
  - `combatCost(action)`: the action type in combat;
  - `preview(state, request)`: the task math before the roll;
  - `recommend(state, actionId, memberIds)`: who is best at it;
  - `attempt(state, request)`: the roll and the authored outcomes. It returns the very same state when the attempt isn't allowed, which combat relies on;
  - `setState(state, stateId)`: the only write from outside the object's outcomes (a conversation's Action node). It retiles the map.
- **`objectEffects.js`** is a table from effect type to `(state, object, action, effect, ctx) -> state`. Outcomes run in their authored order.

Object types (door, relay, panel, console, casualty) are data, not subclasses. No code checks `type`.

- **`DestructibleObject`** extends `WorldObject` (`src/world/DestructibleObject.js`): `damageFrom(severity)`, `hit(...)`, `stateTile()` and `view()`. Status (2026-10-20): only `tests/destructibles.test.js` uses this class; the game itself applies damage through the functions in `src/world/environment.js` (`damageObject` and friends). Its record lives in `state.environment.destructibles`, not in `scenario.objects`; `destructibleFor(environment, id)` returns the instance. The eight types are data in `destructibles.json`. The force field's linked tiles and the support's debris are data hooks (`linkedTiles`, `debris`), not subclasses. The map editor's Environment palette places them; `DestructibleInspector` overrides explosion kind/radius/severity/injury/leftover hazard per placement (`explosionOverrides` in `mapFormat.js`). Kind affects the board sound (`playExplosionSound`) for now, not the flipbook art.
- **`EnvironmentalHazard`** extends `WorldObject` (`src/world/EnvironmentalHazard.js`): a hazard region's `view()`, `effectAt(tile)` and `challengeDefinition()`. Its position is the region's anchor, the tile nearest its centre, which is where its ring opens and its combat marker sits. Hazards are never challenge objects in the scenario.
- **`HazardChallenge`** extends `ChallengeObject`: a hazard's Neutralize task. It inherits the whole roll, recommendation and effects pipeline, so nothing was pulled out into a separate function; it only fixes its runtime record (no states, no locks), changes no map tiles, and counts as in reach from any of the hazard's tiles. `challengeFor(state, id)` resolves an id `hazard:{regionId}` to one, built on demand, one per region record. Its success runs the `neutralizeHazard` effect.
- **Room Environmental Controls** are challenge objects of type `console`: one `epsControl` floor tile per room. Their success outcome uses `neutralizeHazardsInRoom`, which finds the walkable room around the console (`roomAroundProp` in `areaCentres.js`) and removes every hazard region that touches those tiles (`neutralizeHazardsOnTiles`).

## The environment record

`state.environment = { seed, round, sequence, destructibles, hazards, scars, explosions }` is plain data, created from the map's `destructibles` and `hazards` (`createEnvironment`) and handed to a fight and back (`exploration/WorldEncounter.js`). `scars` are permanent floor changes (e.g. scorched tiles from fire). `withEnvironment(state, environment)` (`src/world/environmentState.js`) is the one place a new record is stored; it retiles the party map and any open fight's map together (`applyEnvironmentTiles`). The exploration hazard clock is `state.hazardClock` on the exploration state, not on the record, so it stops by itself while a fight runs.

Object shots that succeed set `pendingObjectHit` on the exploration or combat state; Structure damage and explosions apply only after `applyPendingObjectHit` (beam first — see `prototype-rules.md` section 7).

## Which object

`objectFor(scenario, id)` in `src/world/objects.js` returns the instance. It keeps one per definition outside React state, so an object the map places elsewhere gets a new one. `applyScenarioTiles` and `withMap` live there too. A world map is only rebuilt when a tile actually changes, because movement caches are keyed by the map.

The functions in `challengeObjects.js` (`attemptChallenge`, `getAvailableActions`, `getChallengeViews` and the rest) are thin wrappers over the objects, for the screens and reducers that already call them.

## Callers

- **Exploration:** the `'challenge'` action in `explorationState.js`; `ChallengePanel` (preview, recommendation, attempt).
- **Combat:** `combatLink.js` lists the objects in reach of whoever acts, previews and attempts the task with combat's assist and Difficulty lines, and recommends a party member. The fighters' cells and condition are copied onto the party first (`withFightersInWorld`).
- **Conversations:** `setChallengeState` calls `setState`.

## Stays outside the objects

- **Rules:** task preparation, the roll and the resolver (`taskPreparation.js`, `taskResolver.js`, `partyTaskRoll.js`), Momentum and Threat (`missionResources.js`), the recommendation algorithm (`taskRecommendation.js`).
- **The world:** awareness and noise, Party Knowledge, mission flags and the Captain's Log. Effects call into these.
- **Combat's action economy:** `canInteract` and `applyInteraction`.
- **Characters:** objects ask the character controllers whether a member is up and hand the character to `prepareTask`. No character math moves into objects.

## Ground inventory items

Dropped inventory items are **not** authored map objects. They live in `state.groundItems` / `state.itemInstances` for the mission session only (`rules/inventory.js`, `world/GroundItem.js`). They never write to `maps/*.json` or challenge definitions, and they do not affect collision or pathfinding. The pack cell under the pointer is the one that fills: large items (32×32) fit 4, small items (16×16) fit 16, on the floor and on a surface, and the picture is that same square. The bottom corner of the iso graphic locks to that cell. Items stack on each other by that footprint. The raised top of an item does not take the empty cell behind it; that cell still fills. Items may also rest on **support surfaces** (opt-in `surface` on tiles such as `crate`, `table`, `barCounter`, `epsControl`, `cellBunk`, or on an item def such as `equipmentCase`): runtime entries carry optional `support` (`{ kind: 'tile', tile }` or `{ kind: 'item', instanceId }`); world Z is derived from the support (`rules/placement.js`) and is never stored as authority. The same inventory drag lifecycle (`useItemDrag` → `canPlaceAt` / `dropItem`) places on floor or surface. Authored maps may set `groundItemPlacements[].on` and sparse `stackOver` (crate-on-crate); both are omitted on legacy maps. The board draws each drop as a scaled isometric prop (`item.worldImage` + `item.worldScale` under `public/art/sprites/environment/items/`, generated by `scripts/makeDroppedItemSprites.mjs`; inventory UI still uses `icon`) lifted by Z, plus a name marker that appears only while the pointer is over the prop (same hover-only tags as challenge objects). Holding **Left Alt** outlines every challenge object, destructible, and ground item at once (and shows their name tags); release clears the highlight. While a challenge object's or ground item's ring is open, that prop's name tag stays hidden so it does not sit under the menu. Ground-item rings include Scan (tricorder reading of the catalogue entry) alongside Pick Up and Go To. Left-click walks toward an approach point (nearest walkable neighbour when the item sits on a solid tile) and picks the prop up only when within grab range (~0.75 tiles, closer than the 2-tile interact ring); left-drag (past a small move threshold) picks it up as the cursor (same drag as inventory); right-click opens the Pick Up / Go To ring. Catalogue item *types* that need capability metadata (Technical Manual tools and weapons, including the 2026-10-18 batch-2 expansion) use behavior classes under `src/items/` (`itemBehaviorFor`); `GroundItem` remains the ground-placement facade only. The map editor authors `groundItemPlacements` (parse/serialize in `mapFormat.js`; Inventory Objects palette); Playtest seeds session copies via `seedGroundItemPlacements` (playtest map: `maps/Inventory Object Test.json`). When environment tiles change, `resolveGroundSupports` rebinds elevated drops to the next surface or the floor.

## Safety net

`tests/objectGolden.test.js` fingerprints every authored action on the Deck 10 Brig and on a test map named Vault of the Ancients (successes, failures, complications, assists, bought dice, locks, routine actions and refusals), object tasks in combat, and a conversation changing an object's state. It also checks that a refused attempt returns the same state. Print new values with `GOLDEN_PRINT=1` only when a behaviour change is intended.

`tests/destructibles.test.js`, `explosions.test.js`, `hazards.test.js`, `hazardAfflictions.test.js`, `hazardAvoidance.test.js`, `hazardPanic.test.js`, `characterHazardOverlay.test.js`, `generatedHazards.test.js` and `deck10Environment.test.js` cover the environment: damage and states, blasts and chains, hazard rounds across the hand-off to combat and back, Neutralize and room Environmental Controls, afflictions, AI avoidance, overlays, and the Deck 10 destructible placements (fifteen objects; in view, cutting nothing off).

Merging the destructibles work (2026-10-14) silently dropped five keys from `useEditorTools`' return value (`selectedNpcId`, `selectedObjectId`, `selectedMarker`, `movingNpc`, `toggleNpcMove`), which broke the editor's NPC Move button; they are restored. Check that every `tools.*` the editor screens read is still returned after a merge there.
