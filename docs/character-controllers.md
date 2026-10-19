# Character controllers

Implementation note: how the code is organised. No rules change here; the rules are in `prototype-rules.md`.

**Doc status (2026-10-16):** still accurate for the player / NPC / enemy split. Blast stagger hand-off uses `blastReact` on the combatant / party member (`toCombatant` / `fromCombatant` in `CharacterController.js`).

## The split

- **State is plain data.** Party members (`createPartyState`, `src/exploration/partyControl.js`), world NPCs (`createNpc`, `src/exploration/awareness.js`) and combatants (`createCombatant`, `src/combat/combatSetup.js`) are plain objects in the exploration and combat state. The reducers replace them; nothing changes them in place. Each one carries the same read-only runtime character (`src/character/runtimeCharacter.js`).
- **Behaviour is in a controller.** `src/actors/` holds one class per kind of character. A controller holds nothing but the actor's id. Each method takes the actor as it is now and returns a value, a new actor or a combat action. That keeps seeded replays, Auto Combat and the headless tests deterministic.

## Classes

- **`CharacterController`** is the base class:
  - `isUp` and `facing`;
  - `animationState`, which the exploration board and battlefield figures read;
  - `toCombatant` / `fromCombatant`, the hand-off into a fight and back (including an in-progress `blastReact` fall / getUp so the stagger can finish on the combat board);
  - the defaults: no combat AI, no prompts answered by the player, no search.
- **`PlayerController`** is for the away team:
  - exploration movement: orders, formation following, steering and giving way;
  - in combat, `isPlayerControlled` is true;
  - Auto Combat's party AI with the opening ambush;
  - the hunt for unseen enemies in a fight started in the world.
- **`NPCController`** is for any world NPC:
  - each frame: `perceive` (sight, memory, footsteps), then `react` (alarm, group alert, response, overall state), then `behave` (watch, investigate, patrol or keep its post, then walk);
  - while waiting on a patrol waypoint, optional authored idle fidget (`waypointAnim` → `animationState.pose`); cleared when a higher-priority behaviour takes over;
  - `canTalk`.
- **`EnemyController`** extends `NPCController`:
  - the enemy combat AI;
  - the enemy search for the party in a fight started in the world.

## Which controller

`controllerFor(actor)` in `src/actors/controllers.js` returns the controller. It keeps one instance per kind and actor outside React state.

- Party members and party-side combatants store `controllerId: 'player'`.
- Enemy-side combatants store `'enemy'`.
- A world NPC stores none; its controller follows its attitude:
  - `'enemy'` while it would fight the away team (`isHostile`: a disposition that joins combat, or `responseType: 'combat'`);
  - otherwise `'npc'`.

So turning hostile (being attacked, leaving a fight still up) or standing down switches controller with no extra bookkeeping.

## Stays outside the controllers

- **Rules:** tasks, Momentum and Threat, condition and Injuries, combat resolution.
- **Pathfinding and formation slots:** `navigation.js`, `formations.js`.
- **Awareness:** the perception maths, awareness memory, noises and alert groups (`awareness.js`).
- **Combat AI:** the brains (`combatAI`, `turnPlanner`, `supportAI`, `randomAI`), which the controllers call as strategies.

## Safety net

`tests/actorGolden.test.js` fingerprints seeded exploration runs, Auto Combat fights and an exploration-to-combat round trip. A refactor that changes behaviour changes a fingerprint. Print new values with `GOLDEN_PRINT=1` only when a behaviour change is intended.
