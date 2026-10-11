# Combat architecture

Implementation note: how the combat code is organised. No rules change here; the rules are in `prototype-rules.md`. It follows the same pattern as the character controllers (`character-controllers.md`) and the world objects.

## The split

- **State is plain data.** The combat state (`createCombat`, `src/combat/combatSetup.js`) is one plain, seeded object: combatants, turn order, the turn's action economy, pools, prompts and the log. The reducer replaces it; nothing changes it in place. Every roll comes from `state.seed` plus `state.rolls` (`takeRandom`), so the same characters, encounter, seed and actions replay the same fight, headless or on screen.
- **Actions are plain objects.** The screen, the AI and Auto Combat all dispatch the same `{ type, ... }` objects as before (`{ type: 'attack', targetId, weaponId, injuryMode }`, `{ type: 'endTurn' }` and so on).
- **Behaviour is in classes.** Each action type has one `CombatAction` class that knows when it can be taken and what it does. Each fight has a `CombatEncounter`. An instance holds only a type, an id or a definition, is cached outside React, and every method takes the state as it is now and returns a value or a new state.

## Actions

`src/combat/actions/CombatAction.js` is the base class:

- `type` and `cost` (the action id whose major / minor / free type it spends, from `actions.json`);
- `unavailableReason(state, actor, params)`: why the action can't be taken now, or null. The default checks only the action economy; subclasses add their own rules. The screen greys out some buttons from it, and `availableActions` lists it;
- `apply(state, actor, params)`: the rule itself, through the rule modules;
- `reduce(state, actor, params)`: refuses (returns the very same state) while `unavailableReason` gives a reason, otherwise `apply`. A few actions (Attack, the prompts, Persuade and Intimidate, the Ambush) keep their own checks inside `reduce` / `apply`, exactly as the old reducer did;
- `hypothetical(state, actor, params)`: the state as if the action's lasting effect were in place, with no roll, no log and nothing spent; null if it has none. The AI scores options with it: where a Move leaves you and whether that's in cover, an Aim reroll, an Assist, a Second Major, a Scan, a Guard, a Direct;
- the helpers `decide` (the AI's decision line) and `record` (marks the action used and logs it).

The subclasses, one file per family:

- `TurnControlActions.js`: `EndTurnAction` (also `nextMember`, whom End Turn hands over to) and `SelectCombatantAction`;
- `MoveAction.js`: Move and Sprint;
- `AimAction.js`, `AssistAction.js`, `CancelThreatAction.js`;
- `ExtraActionPurchase.js`: Extra Minor and Second Major;
- `TaskAction.js`: the shared preview, roll, outcome and log of a combat task; `GuardAction`, `FirstAidAction`, `ScanAction`;
- `SocialAction.js`: Persuade and Intimidate; `DirectAction.js`; `AmbushAction.js`;
- `FleeAction.js`: a retreating enemy (no Stress left) leaving the battle;
- `AttackAction.js`: Attack, Reroll and Resolve Attack;
- `DecisionActions.js`: the prompts (Avoid Injury, the Fatigue attribute, Counterattack);
- `InteractAction.js`: a challenge object's task or routine action in combat. It is not in the registry, because only fights started in the world have objects; `canInteract` and `applyInteraction` in `combatState.js` use it.

`src/combat/actions/registry.js` holds one instance per type: `combatActionFor(type)` and `allCombatActions()`.

## The reducer

`combatReducer` in `src/combat/combatState.js`:

- holds back every action but the answer while a prompt waits (an incoming Injury, a new Fatigue, a Counterattack);
- hands the action to `combatActionFor(action.type).reduce`; an unknown type changes nothing;
- then settles a finished Direct, checks retreats, and ends the ambush chance on any attack.

`combatState.js` also re-exports the public surface of the rule modules, so callers import combat state and previews from one place.

## Encounters

- **`CombatEncounter`** (`src/combat/CombatEncounter.js`) wraps one encounter definition (`encounters.json`): `start(options)` builds the opening state, `reduce` steps it (`autoCombatReducer`), and `activeCombatant`, `turnGroup`, `outcome`, `isOver` and `availableActions(state, actor)` (every registered action with its reason) read it. `encounterFor(id)` returns the cached instance; `registerEncounter` adds a subclass.
- **`WorldEncounter`** (`src/exploration/WorldEncounter.js`) extends it for a fight started in exploration, on the same map: `start(state, request)` makes the hand-off from the exploration state, `step` adds the hunt for unseen opponents (`search`) and challenge objects (`interact`) to the normal step, and `end` hands the survivors back to exploration. `combatLink.js` keeps its old functions as thin wrappers over it.

## Stays outside the classes

- **Rules:** the task, Momentum and Threat, Injuries and condition, range, cover, movement, initiative (`src/rules/`, and the combat rule modules listed at the top of `combatState.js`).
- **Turn order:** `combatTurnOrder.js` stays a module of functions; there is no turn-manager class.
- **Weapons:** weapons stay plain data with `weaponSystem.js` helpers. A Weapon class was considered and left out: nothing about a weapon changes during a fight and no weapon has its own behaviour yet, so a class would only wrap the same lookups.
- **Combat AI:** the brains (`combatAI`, `turnPlanner`, `supportAI`, `randomAI`) stay strategies the controllers call; they now ask actions for `unavailableReason` and `hypothetical` instead of repeating those rules.
- **Effects:** conditions, Guard, Aim and Scan stay fields on the plain state; there is no effect framework.

## Safety net

`tests/combatGolden.test.js` fingerprints scripted fights on a blank arena: every action type is taken at least once, refused actions are probed every turn and must leave the state untouched, and grouped turns cover Assist and switching members. `tests/actorGolden.test.js` and `tests/objectGolden.test.js` cover Auto Combat, the exploration-to-combat round trip and objects in combat. A refactor that changes behaviour changes a fingerprint. Print new values with `GOLDEN_PRINT=1` only when a behaviour change is intended.
