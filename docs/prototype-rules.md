# Prototype rules versus the core rules

Every place where the prototype changes, adds to, or leaves out a rule from the books, in one list.

- **Book** is what the source says. "Core" means the STA 2e Core Rulebook; "CL" means the Captain's Log Solo RPG. Page numbers are the ones cited in the code and data notes.
- **Prototype** is what the game does.
- **Where** is the file (and function or JSON key) that owns the rule, so it can be changed in one place.
- "Book: no rule" means the book is silent and the rule is ours.

Design reasoning and dates for the larger decisions are in `design-tracker.md`. Purely presentational choices (art, layout, help text) and AI tuning are left out unless they change what a player may do.

## Switches

| Switch | Setting | Book rule it changes | Where |
| --- | --- | --- | --- |
| `PROTOTYPE_SAVE_BONUS_MOMENTUM` | on | Bonus Momentum cannot be saved (Core p.260) | `src/rules/missionResources.js` |
| `adaptationMomentumSpends` | off | Adds two spends that are not in the book | `src/data/adaptation/combat/actions.json` |
| `communication.audibleRangeTiles` | 8 | Book says "can hear you", no distance | `src/data/adaptation/combat/actions.json` |
| `standardIssueWeapon` | `phaserType2` | Book: no rule | `src/data/adaptation/combat/encounters.json` |
| `autoCombat.playerInjuryMode` | `stun` | Book: no rule | `src/data/adaptation/combat/encounters.json` |

---

## 1. Character creation

### Flow and lifepath

- **Species list.** Book: Core and CL offer many species. Prototype: Human, Vulcan, Andorian, Tellarite, Trill and Caitian, plus Mixed Heritage and New Species. Where: `src/data/adaptation/prototypeSpecies.json`.
- **Eight stages.** Book: the CL lifepath has seven steps. Prototype: adds Review as stage 08. Where: `src/data/adaptation/creationSteps.json`.
- **No d20 rolls.** Book: Environment, Early Outlook, Education and Career Events can be rolled on a d20. Prototype: the player always chooses; rolling is not offered. Where: the `notes` in `environment.json`, `earlyOutlook.json`, `education.json`, `careerHistory.json`.
- **Gender.** Book: CL has no gender step; p.132 asks only for pronouns. Prototype: Species screen requires a gender, used for portraits and pronoun autofill only. Where: `src/data/adaptation/genders.json`, `src/rules/species.js`.
- **Klingon Caste.** Book: Caste is for Klingons or those raised in a Klingon household. Prototype: allowed for Klingon species/parent or "Another Species' World" raised among Klingons; no creator species is Klingon, so it is effectively unavailable. Where: `earlyOutlook.json` (`casteEligibility`).
- **Civilian discipline swap.** Book: civilian options may reduce one other discipline by 1. Prototype: the reduced discipline must not be one raised this step and must be at 2 or more. Where: `education.json` (`disciplineSwap`), `src/rules/education.js` (`canSwapFrom`).
- **Career screen merges steps.** Book: Career Length is Step Five; Assignment and Rank are in Step Seven. Prototype: Screen 05 takes Career Length, Assignment, Rank, Department and Role together. Where: `src/data/adaptation/career.json`.
- **Assignments.** Book: the listed senior staff posts, and "other roles are possible". Prototype: only the listed posts. Where: `career.json`.
- **Department from assignment.** Book: choose a department (p.92). Prototype: the assignment sets it; the player chooses only when the book gives none (Communications Officer). Where: `src/rules/career.js` (`isDepartmentChoice`).
- **Career Events must differ.** Book: two events; distinct events not required. Prototype: `allowDuplicateEvents: false`. Where: `careerHistory.json`.
- **Finishing Touches.** Book: Step Seven (pp.129–132), pronouns required. Prototype: Name and Portrait are also required; Background Notes optional and never used by rules; the mockup's Service Motto and Personal Goals are dropped from the design. Where: `src/data/adaptation/finishingTouches.json`.

### Scores, values and focuses

- **Totals and caps.** Book: attributes total 56, max 12, one at 12; disciplines total 16, max 5, one at 5 (p.92, p.129). Prototype: same numbers. Where: `src/data/source/startingPoints.json`, `src/rules/characterValidation.js`.
- **When caps are checked.** Book: at Step Seven. Prototype: same; no screen before Finishing Touches checks them. Where: `careerHistory.json` (`notes`), `src/rules/finishingTouches.js`.
- **Novice caps.** Book: Untapped Potential (Core p.127): no attribute above 11 or department above 4, in place of the one-at-max rule. Prototype: same, applied at Finishing Touches. Where: `src/rules/finishingTouches.js` (`getScoreLimits`), `talents.json` (`untappedPotential.limits`).
- **Unique values and focuses.** Book: a complete character has 4 values and 6 focuses (p.129). Prototype: a value or focus already held from another step cannot be picked again. Where: `src/rules/characterSheet.js` (`getValuesHeldElsewhere`, `getFocusesHeldElsewhere`).
- **Custom values and focuses.** Book: players may write their own (p.90; focus matrix pp.85–88). Prototype: allowed on every step that grants them. Where: `allowCustomValue` in the step data; `src/rules/focuses.js`.
- **Autofill values.** Book: the Values Matrix (p.90). Prototype: Auto and Autofill use our own sample lines, not book text. Where: `src/data/adaptation/stageValues.json`.
- **"Replace the oldest" picks.** Book: no rule. Prototype: when a step's picks are full, a new pick replaces the oldest (species attributes, education focuses and minors, final increases). Where: `species.js`, `education.js`, `finishingTouches.js`.

### Talents, species abilities and roles

- **Four talents.** Book: Core p.131, one each from Upbringing, Education, Experience and Finishing. Prototype: slots on Early Outlook, Education, Career and Finishing Touches. Where: `src/rules/talents.js` (`TALENT_STEPS`).
- **Talent pool.** Book: General, department, species, Augment/Cybernetic and Esoteric talents (pp.148–165). Prototype: General, the six departments and the creator species' talents only; Augment/Cybernetic, Esoteric, other species' talents and Constant Presence are left out. Where: `src/data/source/talents.json` (`omitted`).
- **Species talents.** Book: own species or gamemaster's permission. Prototype: own species only; mixed heritage counts as both parents. Where: `talents.json` (`notes`).
- **Main character.** Book: some talents require a main character. Prototype: the player character always counts as one. Where: `src/rules/talents.js` (`isRequirementMet`).
- **Personal Effects.** Book: may be taken several times (Core p.150). Prototype: once, until there is an item choice. Where: `talents.json`.
- **Psychoanalyst.** Book: needs a psychology-related focus. Prototype: any focus whose name contains "psych". Where: `talents.json`.
- **Mixed Heritage ability.** Book: a mixed-heritage character has the ability of the primary species (Core p.99). Prototype: the player marks one parent as primary on the Species screen (required); that species' ability applies. Where: `src/rules/species.js` (`setPrimaryParent`, `getSpeciesAbility`), `species.primarySpeciesId`.
- **New Species ability.** Book: no ability for an invented species. Prototype: none; shown as "None". Where: `src/data/source/speciesAbilities.json` (`withoutAbility`).
- **Role from assignment.** Book: roles are chosen (Core pp.133–138). Prototype: the assignment fixes the role; Other Roles (p.138) are left out; no role has requirements. Where: `career.json` (`roleByAssignment`), `src/data/source/roles.json`.

### Rank

- **No Rank.** Book: civilians hold no rank (p.120), may get honorary rank. Prototype: a "No Rank" option (civilian automatic, diplomatic optional); honorary rank not offered. Where: `career.json` (`noRank`, `rankTypeByEducation`).
- **Enlisted titles.** Book: classes and alternative titles. Prototype: first title only. Where: `src/data/source/ranks.json` (`enlistedNote`).
- **Assignment minimum ranks.** Book: CO Commander or higher; XO and chiefs Lieutenant (junior grade) or higher; enlisted never CO or XO (p.132). Prototype: the minimums apply to officer ranks only; enlisted characters follow the book. Where: `src/rules/career.js` (`isRankAllowed`).
- **No Rank in command.** Book: silent. Prototype: No Rank is never CO or XO, like enlisted; a Diplomat in those posts must take an officer rank. Where: `career.json` (`noRankExcludedAssignments`), `career.js` (`getAssignmentBlock`, `isRankAllowed`).
- **Novice posts.** Book: Step Five "may limit" ranks. Prototype: a Novice cannot be CO, XO, Chief Engineer, Chief of Security or Chief Medical Officer. Where: `career.json` (`noviceExcludedAssignments`).
- **Career-length rank limits.** Book: Untapped Potential (p.127) and Veteran (p.128). Prototype: Novice at most Lieutenant (junior grade) or Petty Officer; Veteran at least Lieutenant Commander or Chief Petty Officer. Where: `career.json` (`noviceMaxRank`, `veteranMinRank`).
- **Posting.** Book: choose a posting (p.92). Prototype: deferred until ship creation. Where: `src/rules/characterValidation.js`.

### Equipment and export

- **Starting loadout.** Book: CL does not use equipment; p.137 lists uniform, communicator, tricorder and a sidearm, without stats. Prototype: issued automatically by department, with prototype stats. Where: `src/data/adaptation/startingEquipment.json`, `src/data/adaptation/items.json`.
- **Faction.** Book: no rule. Prototype: creator characters are always Federation. Where: `src/data/adaptation/factions.json`.

---

## 2. Shared task rules (every mode)

- **Focus matching.** Book: a focus applies when it fits the task. Prototype: a focus applies only when its name exactly matches the task's authored list. Where: `src/rules/taskPreparation.js` (`findTaskFocus`).
- **Talents only when listed.** Book: a talent applies whenever its condition is met. Prototype: a talent or role applies only when the task lists it, and only Difficulty, complication and bonus Momentum effects are automated; others show "Not automated yet". Combat talents are the exception (section 3). Where: `taskPreparation.js` (`readCharacterEffect`).
- **Species abilities on tasks.** Book: some change tasks. Prototype: shown but not applied (for example the free first bonus d20). Where: `taskPreparation.js`.
- **Tools.** Book: Difficulty assumes the right tools; lacking them can raise or block it (pp.255–256). Prototype: each task lists the gear it needs and what happens without it; no general item bonus. Where: `taskPreparation.js`, challenge and task data.
- **Trait potency.** Book: a potent trait counts as that many traits (p.252). Prototype: a trait's Difficulty change is multiplied by potency. Where: `taskPreparation.js`.
- **Create Trait.** Book: Difficulty 2 major action; any fitting trait (p.288). Prototype: only authored traits can be created, removed or changed. Where: `src/exploration/challengeObjects.js` (`applyEffect`), `challenges.json`.
- **Determination and Values.** Book: Values and Determination in play. Prototype: not implemented. Where: `src/rules/taskResolver.js`.

## 3. Momentum and Threat

- **Starting pools.** Book: Threat starts at 2 per player character (p.263). Prototype: Momentum and Threat both start at 0. Where: `src/rules/missionResources.js` (`createMissionResources`).
- **Bonus Momentum (PROTOTYPE RULE).** Book: bonus Momentum cannot be saved; spend it at once or lose it (p.260). Prototype: saved to the pool like any other Momentum, because nothing can spend it at the moment of the roll yet; the log says so each time. Where: `PROTOTYPE_SAVE_BONUS_MOMENTUM` and `savableMomentum` in `missionResources.js`.
- **No immediate spends.** Book: spend Momentum before saving the rest. Prototype: all savable Momentum goes straight to the pool. Where: `combatState.js`, `combatTasks.js`, `challengeObjects.js`.
- **Adaptation spends (off).** Book: no such spends. Prototype: when switched on, 1 Momentum rerolls one die and 1 Momentum removes 1 Threat. Where: `adaptationMomentumSpends` in `actions.json`.
- **Enemies spend Threat.** Book: NPCs pay with Threat for the spends the party pays with Momentum (p.264, p.324). Prototype: enemies buy bonus d20s, the Extra Minor and the Second Major with Threat; when they do is AI tuning. They spend it on nothing else yet. Where: `combatSelectors.js` (`extraMinorBlock`, `secondMajorBlock`), `combatAI.js`.
- **Not implemented.** Losing 1 Momentum at scene end (p.260); buying off a complication with 2 Threat (p.263). Where: `missionResources.js` header.

## 4. Condition: Stress, Injuries and Defeat

- **Everyone uses main-character rules.** Book: Minor, Notable and Major NPCs use simpler rules and have no Stress (pp.276–277, p.291). Prototype: everyone has Stress, Avoid Injury and Fatigue unless an encounter sets `npcRules`. Where: `src/rules/personalCondition.js` (`npcCategoryOf`), `src/data/adaptation/characters.json`.
- **Minor NPCs (when set).** Book: any successful attack Defeats them (p.291). Prototype: Stun leaves them unconscious, Deadly kills. Where: `personalCondition.js` (`defeatOutright`).
- **Stress overflow.** Book: take what you can and suffer a complication (p.276). Prototype: a placeholder trait "Overstrained" with no effect yet. Where: `personalCondition.js` (`STRESS_COMPLICATION`).
- **Protection.** Book: one protective item at a time (p.244). Prototype: the best equipped item plus talents and species; conditional and ally-targeted Protection (Get Down!) not applied yet. Where: `personalCondition.js` (`getProtection`).
- **Hooks not used yet.** Recovering Stress (p.277); buying extra Severity with Momentum (p.291); death at scene end while Dying (p.292) is detected and listed but never applied. Where: `personalCondition.js`.

## 5. Combat Type 1 (personal combat)

### Turns

- **Actions per turn.** Book: one major and one minor (Core p.288). Prototype: same. Where: `actions.json` (`actionsPerTurn`).
- **Turn order.** Book (Core p.277): the gamemaster picks one player character to go first (the highest Daring if unclear). An NPC goes first if there is an obvious reason, such as an ambush, or for 1 Threat. After that the sides alternate, one character each. A player can spend 2 Momentum to Keep the Initiative and pass to another player character, but the turn after that goes to the other side. Nobody takes two turns in a round. Prototype (designer decision): the whole party acts before the enemy every round, with no Momentum cost; within each side the order is fixed for the fight, highest Daring, then Control, then random. Keep the Initiative is not used. The enemy goes first only after a failed Ambush. Where: `src/combat/initiativeSystem.js`, `combatSetup.js`.
- **Party turn groups.** Book: no rule. Prototype: adjacent party slots act as one group; the player can switch members at any time. Where: `combatSelectors.js` (`getTurnGroupRange`).
- **Extra actions.** Book: Extra Minor 1 Momentum (p.260); second major 2 Momentum and +1 Difficulty; at most two majors a round (p.288). Prototype: same; enemies pay in Threat. Where: `actions.json` (`extraActions`), `turnActions.js`.
- **Facing.** Book: no rule. Prototype: cosmetic only.

### Movement, range and cover

- **Movement.** Book (Core pp.286–289): zones have no fixed size. Move (minor action) goes up to one zone, anywhere within Medium range, and is not allowed while an enemy is within Reach. Sprint (major action) goes two zones, anywhere within Long range, so twice as far as Move; it has no roll unless there is difficult terrain. Move and Sprint can't both be taken in one turn. Prototype: tiles, and the distance depends on Fitness, which the book doesn't use: Move is floor(Fitness ÷ 2) + 1 tiles; Sprint is twice that, with no roll, keeping the book's two-to-one ratio. The Reach and once-per-turn rules follow the book. Where: `src/combat/movementSystem.js`, `combatMovement.js`.
- **Range bands.** Book: CL personal conflict has no range bands; Core uses zones (Close = same zone, Medium = 1 away, Long = 2, Extreme = 3+; p.286). Prototype: Reach 1, Close 2–4, Medium 5–8, Long 9–12, Extreme 13+ tiles; +1 Difficulty per band beyond the weapon's best range. Where: `weapons.json` (`rangeBands`).
- **Line of fire.** Book (Core p.290): a ranged attack can target anyone you can see; darkness or smoke traits make seeing harder or impossible (p.286). Prototype: follows the book, with a wall that blocks sight on the straight line between tiles blocking the shot. Visibility traits are not modelled. Where: `src/combat/rangeSystem.js` (`hasLineOfFire`).
- **Cover.** Book: cover is terrain within Reach, no action needed (Quickstart p.22); it makes a ranged attack opposed (p.289). Prototype: in cover when beside a cover object (corners don't count); in cover or not, no partial cover. Where: `src/combat/coverSystem.js`.
- **Cover Difficulty.** Book: the defender's successes set the Difficulty (pp.256, 289). Prototype: the higher of the normal Difficulty and the defender's successes. Where: `weapons.json` (`opposition.difficulty: "higher"`), `combatAttacks.js` (`attackDifficulty`).
- **Hazard tiles.** Prototype: ordinary floor in this mode. Where: `encounters.json`.

### Attacks and actions

- **Attack tasks.** Book: Ranged Control + Security Difficulty 2; Melee Daring + Security Difficulty 1, opposed if the target is aware (p.289). Prototype: same. Where: `weapons.json` (`attackTasks`).
- **Focuses.** Book: an applicable focus. Prototype: designer-authored lists per weapon and per task (Guard, First Aid, Direct, defence). Where: `weapons.json`, `actions.json`.
- **Deadly Threat.** Book: a player choosing Deadly adds 1 Threat (p.289). Prototype: same for the party; enemies pay nothing. Where: `combatState.js` (`resolveAttack`).
- **Assist.** Book: Assist is a major action (pp.255, 288). Prototype: set up on an ally with a turn still to come this round; it applies to that ally's next task; one per task; cleared at round end. Where: `combatAttacks.js` (`canAssist`, `getAssistFor`), `actions.json`.
- **Direct.** Book: the character in authority directs an ally who can hear them (p.288). Prototype: authority is the nominated leader, else the unique highest rank, else the first picked; "hear" means within 8 tiles (no line of sight needed; the book says you can talk at Close range and shout to someone at Medium range, p.286, and Medium ends at 8 tiles) or both carrying communicators; once per ally per round. Where: `src/rules/authority.js`, `src/rules/communication.js`, `combatTasks.js`.
- **Guard.** Book: Difficulty 0, may be resolved without a roll (p.254). Prototype: always rolled, so its successes become Momentum. Where: `actions.json` (`tasks.guard`).
- **Ambush.** Book: Control for stealth (CL p.74); an ambusher may score an automatic hit (p.205). Prototype: the best Control + Security in the party rolls at Difficulty 1. Success is an automatic Injury on a target in range; failure means the enemy acts first for the rest of the fight. A Camouflage or Ambush Tactics focus rerolls one failed die. Where: `src/combat/combatAmbush.js`, `actions.json` (`ambush`).
- **Roll pause.** Book: no rule. Prototype: a player's attack stops for a choice only if it would miss and a reroll is still available. Where: `combatAttacks.js` (`rollAwaitsPlayer`).

### Weapons

- **Weapon table.** Book: Core p.242 and p.354. Prototype: Combat Type 1 uses the Core weapons, not CL conflict (pp.203–206). Phaser stats and all ranges are marked as adaptation. Where: `weapons.json`.
- **Charge and Hidden.** Book: Charge needs Prepare; Hidden uses concealment. Prototype: recorded, no effect. Where: `weapons.json`.
- **Standard-issue weapon.** Book: no rule. Prototype: a party member with only Unarmed Strike is given a Type-2 Phaser for the fight, without changing their file. Where: `encounters.json`, `weaponSystem.js` (`withStandardIssue`).
- **Weapon stats live in combat data.** Prototype: `weapons.json` owns Severity and range; the item list only shows them. Where: `src/rules/equipment.js` (`getItemStatLines`).

### Talents in combat

Book pages: Core pp.157–163. Applied by talent id in `src/combat/combatTalents.js`; see `design-tracker.md`.

- **Applied Force.** Book: melee may use Fitness instead of Daring. Prototype: uses whichever is higher.
- **Ambush Tactics.** Book: +2 Severity against an unaware target or one with a weakness trait or complication. Prototype: unaware only; the weakness half is not modelled.
- **Assist talents** (Call Out Targets, Pack Tactics, Student of War). Prototype: they apply to Assist, not Direct; Student of War's reroll is for attacks only, not Guard.
- **Mean Right Hook.** Prototype: applied, but has no effect until extra Severity can be bought.
- **Not automated.** Quick to Action, Zero-G Combat, Saboteur, Follow My Lead, starship talents, Close Protection, Fire at Will, Nerve Pinch, The Ushaan, First Response.

## 6. Exploration

The real-time exploration layer has no book counterpart; its rules are ours.

- **No action budget.** Book: outside encounters there are no rounds (p.250); group challenges and time pressure (pp.268–269). Prototype: real time; any member in range may try any action any number of times; group challenges are unused. Where: `challenges.json`.
- **Challenge objects.** Prototype: authored objects with states, approaches and outcomes, resolved with the shared task rules; usable within 2 tiles; routine actions need no roll. Where: `src/exploration/challengeObjects.js`.
- **Locks.** Prototype: a failed approach can lock for a number of seconds of world time; in combat, until the next round. Locks set during a fight are cleared when it ends. Where: `challengeObjects.js`, `combatLink.js` (`endCombat`).
- **Object actions in combat.** Book: a routine interaction is a minor action, a task is a major (p.288). Prototype: same unless the object says otherwise. Where: `challengeObjects.js` (`combatCostOf`).
- **Awareness and perception.** Book: no rule. Prototype: NPCs build suspicion from sight and sound, then alert and join fights by disposition; the party shares one view. Hearing ignores walls for now. Where: `src/exploration/awareness.js`, `partyKnowledge.js`, `awareness.json`, `partyPerception.json`.
- **Party movement.** Book: no rule. Prototype: everyone walks at the same speed; formations. Where: `partyControl.js`, `formations.js`.
- **Defeated members.** Book: no rule. Prototype: they stay where they fell, cannot be selected or ordered, and are left out of cohesion and regrouping. Where: `src/exploration/partyControl.js` (`canAct`, `withAbleSelection`).
- **Party action buttons.** Prototype: they only recommend a performer; nothing is rolled yet. Where: `partyActions.js`, `partyActions.json`.
- **Into and out of combat.** Prototype: exploration starts Combat Type 1 on the same map, keeping positions, conditions and pools; who joins depends on awareness. At the end, positions and conditions carry back; the Dying are listed, not killed. Where: `src/exploration/combatLink.js`.

## 7. Combat Type 2 (frozen)

A separate experimental mode, kept as it is and not linked to exploration. It does not follow the rules above: 2 action points a turn, telegraphed enemy intents, CL-style dice (focus is display-only), 3 Hits defeats, ranged Difficulty 1 exposed or 2 in cover, plus Push and an EPS hazard. Where: `src/combat2/`, `src/data/adaptation/combat2/`.
