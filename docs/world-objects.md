# World objects

Implementation note: how the code is organised. No rules change here; the rules are in `prototype-rules.md`, and the test content's objects are in `src/data/adaptation/exploration/challenges.json`.

## The split

- **Definitions are authored data.** `challenges.json` lists each map's challenge objects: states (label, description, optional replacement tile), actions (routine or a task, assists, requirements) and outcomes. The map's `objectPlacements` moves an object (`challengeDefinitionsFor`, `src/exploration/challengeObjects.js`).
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

## Safety net

`tests/objectGolden.test.js` fingerprints every authored action on the Deck 10 Brig and on a test map named Vault of the Ancients (successes, failures, complications, assists, bought dice, locks, routine actions and refusals), object tasks in combat, and a conversation changing an object's state. It also checks that a refused attempt returns the same state. Print new values with `GOLDEN_PRINT=1` only when a behaviour change is intended.
