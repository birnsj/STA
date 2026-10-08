# Design Tracker

Open design decisions for the designer. Each entry separates what the book says from what the prototype currently does.

## Open

### Rank should matter in the game (opened 2026-10-02)

**Decision needed:** how rank affects the videogame (designer has confirmed it should matter; integration not yet decided).

**Book (Captain's Log):**
- p.132: rank is chosen after assignment. Restrictions only: Commanding Officer at least Commander; Executive Officer, Chief Engineer, Chief of Security, Chief Medical Officer at least Lieutenant (junior grade); "The choice made in Step Five: Career may limit which ranks you may choose from."
- p.132 (Enlisted Personnel sidebar): enlisted characters never get Commanding Officer or Executive Officer.
- p.120: civilians hold no rank (may be granted an honorary rank).
- p.221: rank matters in play only as chain of command and roleplay (who is first officer, who leads away missions, when to "pull rank").
- No mechanical effect: rank does not change attributes, disciplines, focuses, values, or any roll.

**Prototype (current):**
- Rank is chosen on Screen 05 (Career). Education sets the rank type: officer, enlisted (Rank and File), optional (Diplomatic: officer ranks or No Rank), or none (Civilian).
- Assignment sets the minimum officer rank. Novice career length caps rank at Lieutenant (junior grade) / Petty Officer and Veteran requires at least Lieutenant Commander / Chief Petty Officer (Captain's Log gives no limits; both come from the Core Rulebook's Untapped Potential and Veteran talents, see "Career-length talent limits" below).
- Rank has no effect on any number, equipment, or later screen. It is shown on the summary and Review.
- Exported JSON records it as `character.career.rank` = `{ id, name, type }` (`type` is `officer`, `enlisted`, or `none`). Rank order is the list order in `src/data/source/ranks.json` (lowest first).

**Possible integration points (for the designer to choose; none implemented):**
- Dialogue and NPC reactions (how crew and others address and respond to the character).
- Authority: which orders the character can give, which crew they command, whether they can lead away missions.
- Mission or content access gated by rank.
- Starting equipment or ship access by rank.
- Promotion as progression during play.

**Related questions:**
- Should the Novice rank cap stay once rank has gameplay effects?

## Decided

### Sprint goes twice as far as Move (decided 2026-10-07)

**Decision:** Sprint goes twice the Move distance, like the book.

**Book (STA 2e Core Rulebook):** p.288: Move (minor action) goes up to one zone, anywhere within Medium range. p.289: Sprint (major action) goes two zones, anywhere within Long range. The two can't be taken in the same turn.

**Prototype:** Move is floor(Fitness ÷ 2) + 1 tiles (5 at Fitness 9); Sprint is twice that (10 at Fitness 9), with no roll. It used to be half of Move, left over from the 2 AP rule when Sprint cost 1 AP. `getSprintTiles` in `combat/movementSystem.js`.

### No Rank characters are kept, but never command (decided 2026-10-07)

**Decision:** keep No Rank (civilian and unranked diplomat), but bar it from Commanding Officer and Executive Officer, like enlisted characters. Honorary rank is not offered.

**Book (Captain's Log):**
- p.120 (Civilian Career Training): "Civilian characters hold no Starfleet rank or other military rank, though they may be granted an honorary rank." Purpose: "Building a Captain's Log story around a civilian character offers a chance to shine a light on life outside of Starfleet." Examples: Sarek, Dal R'El. Types: Freight and Transport, Law Enforcement, Physician, Politician or Bureaucrat, Scientific or Technical Expert, Trader or Merchant.
- p.119 (Diplomatic Training): diplomats "are often found accompanying Starfleet vessels" and "do not necessarily hold an active Starfleet rank or other military rank (though many well-known diplomats are retired Starfleet military)."
- p.132: rank is chosen "unless you are creating a civilian character or a character in a non-militaristic organization."
- The book is a solo tabletop game that supports any story, Starfleet or not; it does not say whether a civilian can hold a Starfleet assignment.

- p.132 (Enlisted Personnel sidebar): enlisted characters never get Commanding Officer or Executive Officer. The book says nothing about unranked characters in command.

**Prototype:**
- Civilian education: No Rank is the only option (set automatically). Diplomatic education: No Rank or Ensign through Captain.
- "No Rank" is a prototype label (`src/data/adaptation/career.json`); the book has no name for it.
- Honorary rank (p.120) is not offered.
- A Civilian cannot take Commanding Officer or Executive Officer ("Not for No Rank"). A Diplomat can, but must then choose an officer rank. Data: `noRankExcludedAssignments` in `career.json`; rules: `getAssignmentBlock` and `isRankAllowed` in `rules/career.js`.

### Species Ability for Mixed Heritage and New Species (decided 2026-10-07)

**Decision:** a Mixed Heritage player picks which parent is the primary species and gets that species' ability. A New Species has no Species Ability.

**Book (STA 2e Core Rulebook):**
- p.99: each species gives a Species Ability; a mixed-heritage character has the ability of their primary species.
- The book gives no ability for a species the player invents.

**Prototype:**
- Each parent on the Species screen has a "Make primary" button. The Species screen is not complete until one is chosen. Changing that parent clears the choice. Stored as `species.primarySpeciesId`.
- New Species shows Species Ability "None".
- Rules: `getSpeciesAbility`, `setPrimaryParent` in `rules/species.js`; player-facing text in `withoutAbility` in `data/source/speciesAbilities.json`.

### Enemies spend Threat (decided 2026-10-07)

**Decision:** enemies buy bonus d20s, the Extra Minor Action and the Second Major Action with Threat, the way the party uses Momentum.

**Book (STA 2e Core Rulebook):** p.264, p.324: NPCs have no Momentum pool; Threat mirrors it, and they pay for the same spends with Threat. Costs: bonus d20s 1, 2, 3 (p.259); Extra Minor 1 (p.260); Second Major 2, with the task +1 Difficulty (p.288).

**Prototype:**
- Rules: `extraMinorBlock` and `secondMajorBlock` in `combat/combatSelectors.js` charge the party Momentum and enemies Threat.
- Enemy AI (tuning, not rules, in `combat/combatAI.js`): it buys bonus d20s while its chance to hit is under 75% and each die adds at least 5%. It buys an Extra Minor to Aim after moving into cover, and a Second Major after attacking when the second shot hits at least 40%. While a Notable or Major NPC is fighting, it keeps 4 Threat for that NPC's Avoid Injury.
- The party's Auto Combat still buys nothing. Enemies still don't spend Threat on anything else (complications, reinforcements, Avoid Injury for main-rules NPCs).

### Direct's earshot stays at 8 tiles (decided 2026-10-07)

**Book (STA 2e Core Rulebook):** p.288: Direct an ally "who can hear you"; no distance.

**Prototype:** within 8 tiles (no line of sight needed), or any distance when both carry communicators and the scene doesn't jam them. `communication.audibleRangeTiles` in `data/adaptation/combat/actions.json`.

### Service Motto and Personal Goals are dropped (decided 2026-10-07)

**Book:** no rule for either. **Prototype:** the two fields from the Finishing Touches mockup are not part of the design; the Service Motto would repeat the Values.

### Combat talents automated in personal combat (decided 2026-10-07)

**Decision:** automate three groups of talents in Combat Type 1: the attacker's own, Defensive Training, and the Assist talents. Each is applied by talent id in `combat/combatTalents.js`, since the talents' conditions are prose in `talents.json`.

**Book (STA 2e Core Rulebook):**
- p.161 Applied Force: a Melee Attack may use Fitness instead of Daring; +1 Severity to Unarmed Attacks.
- p.162 Mean Right Hook: the Unarmed Strike gains Intense. p.162 Martial Artist: the Unarmed Strike may inflict Deadly Injuries as well as Stun.
- p.162 Steady Hands: +1 Severity on a Ranged Attack after Aim. p.161 Ambush Tactics: +2 Severity against an enemy unaware of you, or suffering a weakness trait or complication.
- p.161 Defensive Training: Attacks of the chosen type (Melee or Ranged) against you are +1 Difficulty.
- p.157 Call Out Targets: an Attack you Assist generates 2 bonus Momentum if it succeeds. p.162 Pack Tactics: a task you Assist in combat gains 1 bonus Momentum on success. p.163 Student of War: an Attack or Guard you Assist may reroll one d20.
- p.260: bonus Momentum cannot be saved to the group pool.

**Prototype:**
- Applied Force uses whichever of Fitness and Daring is higher; an attribute shut down by Fatigue never counts as higher.
- Ambush Tactics counts a target as unaware when its combat knowledge has not found the attacker (fights started in exploration) and on the opening Ambush hit. The weakness-trait half is not modelled yet.
- The Assist talents apply to the Assist action, not to a commander's Direct. Student of War's reroll applies to attacks only, because Guard has no reroll step.
- Mean Right Hook's Intense only lowers the Momentum cost of buying extra Severity, and nothing buys extra Severity yet, so it has no effect in play for now.
- PROTOTYPE RULE (decided 2026-10-07), not the book: bonus Momentum is saved to the group pool like any other Momentum, because nothing can spend it at the moment of the roll yet. Switch: `PROTOTYPE_SAVE_BONUS_MOMENTUM` in `rules/missionResources.js`; set it to `false` to restore p.260 once immediate spends exist. The combat log marks every save of bonus Momentum as a prototype rule.
- Not automated: talents that need systems the prototype lacks (Quick to Action, Zero-G Combat, Saboteur, Follow My Lead, starship talents), Momentum-spend talents (Close Protection, Fire at Will), species talents (Nerve Pinch, The Ushaan) and First Response.

### Career-length talent limits are enforced (decided 2026-10-07)

**Decision:** enforce the score and rank limits printed on the two fixed career-length talents, the book's way: at the end of the lifepath, not screen by screen.

**Book (STA 2e Core Rulebook):**
- p.127 Untapped Potential (every Novice): "You may not have or increase any attribute to above 11, or any department to above 4 while you have this talent"; rank no higher than lieutenant (junior grade) or petty officer.
- p.128 Veteran (every Veteran): "you hold a rank of at least lieutenant commander, or an enlisted rate of at least chief petty officer."
- p.131 Step Seven: the normal limits are 12 / 5 with only one score at the maximum; "if the character has the Untapped Potential talent ... they may not have any attributes above 11 instead" and "any departments above 4 instead". Points over the limit are reduced and moved to other scores, as for everyone else.

**Prototype:**
- Finishing Touches reads the cap from the career-length talent (`rules/finishingTouches.js` `getScoreLimits`). For a Novice the cap is a flat 11 / 4: several scores may sit at the cap and nobody is asked which one "keeps" the maximum, because the book says the lower cap applies *instead of* the one-at-max rule. Everyone else keeps 12 / 5 with one at the maximum.
- The lifepath screens (Education, Career History) are not capped; a Novice's scores may pass 11 / 4 along the way and are brought down at Finishing Touches, exactly as the book does it. The alternative (capping each screen, moving career length before Education, or disabling career events whose fixed bonus would break the cap) was considered and rejected as a departure from the book that needs three further design decisions.
- Rank: `isAboveNoviceCap` and `isBelowVeteranFloor` in `rules/career.js`, from `career.json`. Diplomats' No Rank is unaffected by the Veteran floor.
- Previously saved characters that break these limits are reported as invalid when loaded (unfinalized scores or a cleared rank) and must be fixed on their screen; combat still reads their saved final values.

### Generate Map makes no small, hard-to-navigate rooms (decided 2026-10-07)

**Decision:** generated rooms must be easy to move around in.

**Book:** no rule; map layout is wholly prototype.

**Prototype** (`src/maps/generators/shared.js`):
- Every generated room has at least 4 x 4 tiles of floor (`MIN_ROOM`), so buildings are at least 6 x 6 outside (`MIN_BUILDING`). This covers deck rooms, station side rooms, detention cells, temple chapels, huts, houses, barns and city buildings.
- Furniture (`placeProp`: crates, consoles, benches, bunks, tables, the EPS control) is not placed where it would leave a walkable tile with solid tiles on two opposite sides (a one-tile squeeze or dead-end pocket), or split a room's floor so part of it is only reachable from outside.
- To fit the bigger buildings, map presets grew: Small Colony 18 x 14 to 20 x 17; Landing Field to 28 x 22 / 34 x 24 / 42 x 30 / 52 x 36 / 96 x 70 (its pad covers about half the map, so the hut needs a big map; a Small field still has no hut about 1 time in 10).
- Not covered, on purpose: the derelict's wreckage (debris and collapsed bulkheads are meant to clutter), the cantina's staff aisle behind the bar, the temple's pillar aisles, and station promenades, which are halls that may be 2 tiles wide on small maps.

### Combat Type 2 stays as a frozen experiment (decided 2026-10-07)

**Decision:** keep Combat Type 2 (`src/combat2`, `src/components/combat2`, `src/data/adaptation/combat2`, the "Combat Type 2" entry in Load Episode) exactly as it is. It is not deleted and not merged into Combat Type 1.

**What it is:** a separate tactical-positioning prototype (1 character, 2 action points per turn, enemy intents shown in advance, Push, an EPS hazard) with its own pure, seeded reducer. It shares the character model, dice and map files with the rest of the game but none of Combat Type 1's state code, and exploration only links into Combat Type 1.

**Book:** the book has no action-point or telegraphed-intent system; Combat Type 2 is wholly a prototype design. Combat Type 1 is the one that follows the book's task, Momentum, Injury and Stress rules.

**Working rule for programmers:** do not touch Combat Type 2 (designer instruction, Oct 2026). Shared changes (tile catalogue, map format, character model) must keep it working but may leave its presentation behind: e.g. it draws plain tiles rather than joined railings, tall walls or 2x2 objects.

**Revisit when:** the designer decides whether any of its ideas (telegraphed enemy intents, action points, Push) belong in Combat Type 1, or whether the mode is removed. Either outcome gets its own entry here.
