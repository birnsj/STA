# Prototype rules versus the core rules

Every place where the prototype changes, adds to, or leaves out a rule from the books, in one list.

- **Book** is what the source says. "Core" means the STA 2e Core Rulebook, the rules authority (designer decision, Oct 2026); "CL" means the Captain's Log Solo RPG, cited only where the prototype still uses something from it. Page numbers are printed page numbers.
- **Prototype** is what the game does.
- **Where** is the file (and function or JSON key) that owns the rule, so it can be changed in one place.
- "Book: no rule" means the book is silent and the rule is ours.

Design reasoning and dates for the larger decisions are in `design-tracker.md`. Purely presentational choices (art, layout, help text) and AI tuning are left out unless they change what a player may do.

## Switches

| Switch | Setting | Book rule it changes | Where |
| --- | --- | --- | --- |
| `PROTOTYPE_SAVE_BONUS_MOMENTUM` | on | Bonus Momentum cannot be saved (Core p.260) | `src/rules/missionResources.js` |
| `adaptationMomentumSpends` | off | Adds two spends that are not in the book | `src/data/adaptation/combat/actions.json` |
| `communication.audibleRangeTiles` | 8 | Book gives Close (converse) / Medium (shout), Core p.286; the tile count is ours | `src/data/adaptation/combat/actions.json` |
| `standardIssueWeapon` | `phaserType2` | Book: no rule | `src/data/adaptation/combat/encounters.json` |
| `autoCombat.playerInjuryMode` | `stun` | Book: no rule | `src/data/adaptation/combat/encounters.json` |

---

## 1. Character creation

### Flow and lifepath

- **Species list.** Book: Core and CL offer many species. Prototype: Human, Vulcan, Andorian, Tellarite, Trill and Caitian, plus Mixed Heritage and New Species. Where: `src/data/adaptation/prototypeSpecies.json`.
- **Lifepath follows Core.** Book: Core's seven steps are Species, Environment, Upbringing, Career Path, Experience, Career Events and Finishing Touches (Core p.98). Prototype: the same steps and on-screen names (designer decision, Oct 2026), plus Review as stage 08. The internal step ids and data keys keep their older names (`earlyOutlook`, `education`, `career`, `disciplines`). Where: `src/data/adaptation/creationSteps.json`.
- **No d20 rolls.** Book: Environment, Upbringing, Career Path and Career Events may be rolled; Experience should always be chosen, and a random character defaults to Veteran (Core p.127). Prototype: the player always chooses; Auto and Autofill pick Veteran. Where: the `notes` in `environment.json`, `earlyOutlook.json`, `education.json`, `careerHistory.json`; `src/character/autoChoice.js`.
- **Environment.** Book (Core pp.115–116): six environments, each one value, +1 to one attribute and +1 to one department. Prototype: the same six. The value's examples are the character's species' sample values (for Another Species' World, the species they were raised among first), plus Core's Sample Values. Where: `src/data/source/environments.json`, `src/rules/environment.js`, `src/data/source/speciesValues.json`.
- **Upbringing.** Book (Core pp.117–119): six upbringings, accepted or rebelled against; 3 attribute points over two attributes, +1 to one department, one focus and one talent. Prototype: the same. Captain's Log's Aspiration and Caste are gone. Where: `src/data/source/earlyOutlooks.json`, `src/rules/earlyOutlook.js`.
- **Career Path.** Book (Core pp.120–126): eight paths, each a trait, a value, 3 free attribute points, +2 to one department and +1 to two others, three focuses and a talent. Officer tracks, Enlisted, Intelligence and Diplomatic Corps allow no department above 4 at this step; the Sciences track may add a profession trait; some traits may be adjusted ("Diplomat or Ambassador", "such as Administrator"). Prototype: the same eight paths (the Officer tracks under one tab, the four civilian paths under another). Traits use Core's names and can't be edited; where Core names two ("Diplomat or Ambassador", "Scientist or Engineer") the player picks one; Official's trait is Administrator; the Sciences track's extra trait is left out. Where: `src/data/source/education.json`, `src/rules/education.js`.
- **Civilian department swap.** Book: civilian paths may reduce one other department by 1 and add it to one not already increased (Core pp.125–126). Prototype: the reduced department must not be one raised this step and must be at 2 or more. Where: `education.json` (`disciplineSwap`), `src/rules/education.js` (`canSwapFrom`).
- **Experience screen merges steps.** Book: Experience is Step Five; Role and Rank come after the lifepath (Core pp.135–140). Prototype: Screen 05 takes Experience, Assignment, Rank, Department and Role together. Where: `src/data/adaptation/career.json`.
- **Assignments.** Book: Core has Roles, not assignments (pp.135–139). Prototype: the player picks an assignment (Captain's Log's senior staff posts plus Chief Tactical Officer, Navigator and Ship's Doctor), which fixes the role; Expert, Intelligence Agent and the other Other Roles aren't reachable. Where: `src/data/source/assignments.json`, `career.json` (`roleByAssignment`).
- **Department from assignment.** Book: Core gives roles no department. Prototype: the assignment sets it (Captain's Log's mapping; Chief Tactical Officer Security, Navigator Conn, Ship's Doctor Medicine are implementation picks); the player chooses only for Communications Officer. Where: `src/rules/career.js` (`isDepartmentChoice`).
- **Career Events.** Book (Core pp.128–131): two events, each +1 attribute, +1 department and one focus; more events may be taken and mixed; many offer an optional trait. Prototype: exactly two, and they must differ (`allowDuplicateEvents: false`); no optional traits. Where: `src/data/source/careerEvents.json`, `careerHistory.json`.
- **Finishing Touches.** Book (Core pp.132–134): a value, name and age, pronouns, an optional pastime. Prototype: Name, Pronouns and Portrait required; Age and Pastime optional free text with no rule effect; Background Notes optional and never used by rules. Where: `src/data/adaptation/finishingTouches.json`, `src/rules/finishingTouches.js`.
- **Gender.** Book: no gender step; Core asks for pronouns (p.134). Prototype: Species screen requires a gender, used for portraits and pronoun autofill only. Where: `src/data/adaptation/genders.json`, `src/rules/species.js`.

### Scores, values and focuses

- **Totals and caps.** Book: attributes total 56, max 12, one at 12; departments total 16, max 5, one at 5 (Core p.99, p.132). Prototype: same numbers. Where: `src/data/source/startingPoints.json`, `src/rules/characterValidation.js`.
- **Finishing Touches order.** Book (Core p.132): first bring any score over the limits down, moving each removed point to another score within the limits; then +1 to two attributes and two departments, "again, the normal limits apply". Prototype: that order; a +1 that would break a limit is refused. When two or more scores are over the maximum, the player chooses which keeps it. Where: `src/rules/finishingTouches.js` (`getLimitAnalysis`, `getIncreaseRows`).
- **When caps are checked.** Book: at Step Seven. Prototype: same; no screen before Finishing Touches checks them. Where: `careerHistory.json` (`notes`), `src/rules/finishingTouches.js`.
- **Novice caps.** Book: Untapped Potential (Core p.127, p.132): no attribute above 11 or department above 4, in place of the one-at-max rule. Prototype: same, applied at Finishing Touches. Where: `src/rules/finishingTouches.js` (`getScoreLimits`), `talents.json` (`untappedPotential.limits`).
- **Unique values and focuses.** Book: a complete character has 4 values and 6 focuses, plus any granted by species or talents (Core p.132). Prototype: exactly 6 focuses; a value or focus already held from another step cannot be picked again. Where: `src/rules/characterSheet.js` (`getValuesHeldElsewhere`, `getFocusesHeldElsewhere`).
- **Value and focus suggestions.** Book: Core's Sample Values (p.96), Sample Focuses (pp.94–95, "by no means exhaustive"), and per-option examples. Prototype: these are the offered lists; custom values and focuses are allowed on every step. Old saved Captain's Log list entries keep their text as custom entries. Where: `src/data/source/valuesMatrix.json`, `focusMatrix.json`, `src/rules/values.js`, `src/rules/focuses.js`.
- **Autofill values.** Book: per-option example values. Prototype: Auto and Autofill pick from Core's examples where the option has them. Where: `src/data/adaptation/stageValues.json`, `src/rules/values.js`.
- **"Replace the oldest" picks.** Book: no rule. Prototype: when a step's picks are full, a new pick replaces the oldest (species attributes, Career Path focuses and minors, final increases). Where: `species.js`, `education.js`, `finishingTouches.js`.

### Talents, species abilities and roles

- **Four talents.** Book: Core p.132, one each from Upbringing, Career Path, Experience and Finishing Touches. Prototype: the same four slots. Where: `src/rules/talents.js` (`TALENT_STEPS`).
- **Talent pool.** Book: General, department, species, Augment/Cybernetic and Esoteric talents (pp.148–165). Prototype: General, the six departments and the creator species' talents only; Augment/Cybernetic, Esoteric, other species' talents and Constant Presence are left out. Where: `src/data/source/talents.json` (`omitted`).
- **Species talents.** Book: own species or gamemaster's permission. Prototype: own species only; mixed heritage counts as both parents. Where: `talents.json` (`notes`).
- **Main character.** Book: some talents require a main character. Prototype: the player character always counts as one. Where: `src/rules/talents.js` (`isRequirementMet`).
- **Personal Effects.** Book: may be taken several times (Core p.150). Prototype: once, until there is an item choice. Where: `talents.json`.
- **Psychoanalyst.** Book: needs a psychology-related focus. Prototype: any focus whose name contains "psych". Where: `talents.json`.
- **Mixed Heritage.** Book (Core p.99): the character uses the primary species' attribute bonuses and Species Ability, and gains both parents' species traits. Prototype: the player marks one parent as primary on the Species screen (required); no bonuses apply until then, and a Human primary chooses any three. Each parent gives its own trait. Where: `src/rules/species.js` (`setPrimaryParent`, `getSpeciesAbility`, `deriveTraits`), `species.primarySpeciesId`.
- **New Species.** Book (Core p.114): +1 to three attributes, and the player creates a Species Ability comparable to a talent. Prototype: three attributes; the player writes the ability's name and description (both required). It has no mechanical effect. Where: `src/rules/species.js`, `src/data/source/speciesAbilities.json`.
- **Role from assignment.** Book: roles are chosen (Core pp.135–139). Prototype: the assignment fixes the role; Other Roles (pp.138–139) are left out; no role has requirements. Where: `career.json` (`roleByAssignment`), `src/data/source/roles.json`.

### Rank

- **Rank type.** Book: Starfleet characters hold a rank; diplomats and civilians normally don't, but may be granted one (Core p.123 sidebar, p.140). Prototype: Starfleet (Officer) and Starfleet (Intelligence) take officer ranks, Starfleet (Enlisted) enlisted ranks; Diplomatic Corps and Civilian start at No Rank and may take an officer rank. Where: `career.json` (`noRank`, `rankTypeByEducation`), `src/rules/career.js` (`getRankType`, `getDefaultRank`).
- **Ranks offered.** Book (Core p.140): Cadet to Fleet Admiral; Crewman to Master Chief Petty Officer, with classes and duty titles. Prototype: every rank can be chosen, by name only (no classes or duty titles); Auto picks only Ensign–Captain or the enlisted ladder. Cadet sits below Ensign, so it outranks enlisted crew in authority order. Where: `src/data/source/ranks.json`, `career.json`.
- **Assignment minimum rank.** Book (Core p.140): a commanding officer is at least a Commander "under normal circumstances". Prototype: that is the only minimum, and it can't be waived; so enlisted characters and Novices can't be CO. Where: `src/data/source/assignments.json` (`minimumRank`), `src/rules/career.js` (`isRankAllowed`).
- **No Rank in command.** Book: silent. Prototype (designer rule): No Rank is never CO or XO; a diplomat or civilian in those posts must take an officer rank. Where: `career.json` (`noRankExcludedAssignments`), `career.js` (`getAssignmentBlock`, `isRankAllowed`).
- **Experience rank limits.** Book: Untapped Potential (Core p.127) and Veteran (Core p.128); also stated on Core p.140. Prototype: Novice at most Lieutenant (junior grade) or Petty Officer; Veteran at least Lieutenant Commander or Chief Petty Officer. Where: `career.json` (`noviceMaxRank`, `veteranMinRank`).
- **Posting.** Book: no step. Prototype: deferred until ship creation. Where: `src/rules/characterValidation.js`.

### Equipment and export

- **Starting loadout.** Book (Core p.141): uniforms (duty and dress), communicator, tricorder (medical tricorder for the medical division), tools by duty, adaptive equipment where needed, and a sidearm. Prototype: issued automatically, with prototype stats: one uniform, a communicator, a tricorder by department (science and engineering tricorders are ours), a medkit or engineer's toolkit by department; no dress uniform or adaptive equipment. Where: `src/data/adaptation/startingEquipment.json`, `src/data/adaptation/items.json`, `src/rules/equipment.js`.
- **Sidearm.** Book (Core p.141): every Starfleet character gets a Type-1 phaser; security personnel and Lieutenant Commanders and above get a Type-2 instead; civilians get none. Prototype: as the book. "Starfleet" means a Starfleet Career Path or holding any rank (so a diplomat or civilian who takes a rank is armed); "security personnel" means the Security department. Where: `startingEquipment.json` (`sidearm`), `equipment.js` (`getSidearm`).
- **Faction.** Book: no rule. Prototype: creator characters are always Federation. Where: `src/data/adaptation/factions.json`.

---

## 2. Shared task rules (every mode)

- **Focus matching.** Book: a focus applies when it fits the task. Prototype: a focus applies only when its name exactly matches the task's authored list. Where: `src/rules/taskPreparation.js` (`findTaskFocus`).
- **Talents only when listed.** Book: a talent applies whenever its condition is met. Prototype: a talent or role applies only when the task lists it, and only Difficulty, complication and bonus Momentum effects are automated; others show "Not automated yet". Combat talents are the exception (section 3). Where: `taskPreparation.js` (`readCharacterEffect`).
- **Species abilities on tasks.** Book: some change tasks. Prototype: shown but not applied (for example the free first bonus d20). Where: `taskPreparation.js`.
- **Tools.** Book: Difficulty assumes the right tools; lacking them can raise or block it (p.256). Prototype: each task lists the gear it needs and what happens without it; no general item bonus. Where: `taskPreparation.js`, challenge and task data.
- **Trait potency.** Book: a potent trait counts as that many traits (p.252). Prototype: a trait's Difficulty change is multiplied by potency. Where: `taskPreparation.js`.
- **Create Trait.** Book: Difficulty 2 major action; any fitting trait (p.289; Difficulty 2 typical, p.252). Prototype: only authored traits can be created, removed or changed. Where: `src/exploration/challengeObjects.js` (`applyEffect`), `challenges.json`.
- **Determination and Values.** Book: Values and Determination in play. Prototype: not implemented. Where: `src/rules/taskResolver.js`.

## 3. Momentum and Threat

- **Starting pools.** Book: Threat starts at 2 per player character (p.264). Prototype: Momentum and Threat both start at 0. Where: `src/rules/missionResources.js` (`createMissionResources`).
- **Bonus Momentum (PROTOTYPE RULE).** Book: bonus Momentum cannot be saved; spend it at once or lose it (p.260). Prototype: saved to the pool like any other Momentum, because nothing can spend it at the moment of the roll yet; the log says so each time. Where: `PROTOTYPE_SAVE_BONUS_MOMENTUM` and `savableMomentum` in `missionResources.js`.
- **No immediate spends.** Book: spend Momentum before saving the rest. Prototype: all savable Momentum goes straight to the pool. Where: `combatState.js`, `combatTasks.js`, `challengeObjects.js`.
- **Adaptation spends (off).** Book: no such spends. Prototype: when switched on, 1 Momentum rerolls one die and 1 Momentum removes 1 Threat. Where: `adaptationMomentumSpends` in `actions.json`.
- **Enemies spend Threat.** Book: NPCs pay with Threat for the spends the party pays with Momentum (p.265, p.324). Prototype: enemies buy bonus d20s, the Extra Minor and the Second Major with Threat; when they do is AI tuning. They spend it on nothing else yet. Where: `combatSelectors.js` (`extraMinorBlock`, `secondMajorBlock`), `combatAI.js`.
- **Not implemented.** Losing 1 Momentum at scene end (p.261); buying off a complication with 2 Threat (p.258). Where: `missionResources.js` header.

## 4. Condition: Stress, Injuries and Defeat

- **Everyone uses main-character rules.** Book: Minor, Notable and Major NPCs use simpler rules and have no Stress (p.278, p.291). Prototype: everyone has Stress, Avoid Injury and Fatigue unless an encounter sets `npcRules`. Where: `src/rules/personalCondition.js` (`npcCategoryOf`), `src/data/adaptation/characters.json`.
- **Minor NPCs (when set).** Book: any successful attack Defeats them (p.291). Prototype: Stun leaves them unconscious, Deadly kills. Where: `personalCondition.js` (`defeatOutright`).
- **Stress overflow.** Book: take what you can and suffer a complication (p.277). Prototype: a placeholder trait "Overstrained" with no effect yet. Where: `personalCondition.js` (`STRESS_COMPLICATION`).
- **Protection.** Book: one protective item at a time (p.244). Prototype: the best equipped item plus talents and species; conditional and ally-targeted Protection (Get Down!) not applied yet. Where: `personalCondition.js` (`getProtection`).
- **Hooks not used yet.** Recovering Stress (p.278); buying extra Severity with Momentum (p.292); death at scene end while Dying (p.292) is detected and listed but never applied. Where: `personalCondition.js`.

## 5. Combat Type 1 (personal combat)

### Turns

- **Actions per turn.** Book: one major and one minor (Core p.288). Prototype: same. Where: `actions.json` (`actionsPerTurn`).
- **Turn order.** Book (Core p.277): the gamemaster picks one player character to go first (the highest Daring if unclear). An NPC goes first if there is an obvious reason, such as an ambush, or for 1 Threat. After that the sides alternate, one character each. A player can spend 2 Momentum to Keep the Initiative and pass to another player character, but the turn after that goes to the other side. Nobody takes two turns in a round. Prototype (designer decision): the whole party acts before the enemy every round, with no Momentum cost; within each side the order is fixed for the fight, highest Daring, then Control, then random. Keep the Initiative is not used. The enemy goes first only after a failed Ambush. Where: `src/combat/initiativeSystem.js`, `combatSetup.js`.
- **Party turn groups.** Book: no rule. Prototype: adjacent party slots act as one group; the player can switch members at any time. Where: `combatSelectors.js` (`getTurnGroupRange`).
- **Extra actions.** Book: Extra Minor 1 Momentum (p.260); second major 2 Momentum and +1 Difficulty; at most two majors a round (p.289). Prototype: same; enemies pay in Threat. Where: `actions.json` (`extraActions`), `turnActions.js`.
- **Facing.** Book: no rule. Prototype: cosmetic only.

### Movement, range and cover

- **Movement.** Book (Core pp.286–289): zones have no fixed size. Move (minor action) goes up to one zone, anywhere within Medium range, and is not allowed while an enemy is within Reach. Sprint (major action) goes two zones, anywhere within Long range, so twice as far as Move; it has no roll unless there is difficult terrain. Move and Sprint can't both be taken in one turn. Prototype: tiles, and the distance depends on Fitness, which the book doesn't use: Move is floor(Fitness ÷ 2) + 1 tiles; Sprint is twice that, with no roll, keeping the book's two-to-one ratio. The Reach and once-per-turn rules follow the book. Where: `src/combat/movementSystem.js`, `combatMovement.js`.
- **Range bands.** Book: CL personal conflict has no range bands; Core uses zones (Close = same zone, Medium = 1 away, Long = 2, Extreme = 3+; p.286). Prototype: Reach 1, Close 2–4, Medium 5–8, Long 9–12, Extreme 13+ tiles; +1 Difficulty per band beyond the weapon's best range. Where: `weapons.json` (`rangeBands`).
- **Line of fire.** Book (Core p.290): a ranged attack can target anyone you can see; darkness or smoke traits make seeing harder or impossible (p.286). Prototype: follows the book, with a wall that blocks sight on the straight line between tiles blocking the shot. Visibility traits are not modelled. Where: `src/combat/rangeSystem.js` (`hasLineOfFire`).
- **Cover.** Book: cover is terrain within Reach, no action needed (Quickstart p.22); a whole zone may provide cover, or features within it that you must be within Reach of (Core p.287); it makes a ranged attack opposed (pp.287, 290). Prototype: in cover when beside a cover object (corners don't count); in cover or not, no partial cover. Where: `src/combat/coverSystem.js`.
- **Cover Difficulty.** Book: the defender's successes set the Difficulty (pp.256, 290). Prototype: the higher of the normal Difficulty and the defender's successes. Where: `weapons.json` (`opposition.difficulty: "higher"`), `combatAttacks.js` (`attackDifficulty`).
- **Hazard tiles.** Prototype: ordinary floor in this mode. Where: `encounters.json`.
- **Within Reach of an enemy.** Book (Core p.286): +1 Difficulty to any task that isn't a melee attack. Prototype: +1 (`actions.json` `reachPenalty`) to every task in Combat Type 1 while an active opponent the character knows about is within 1 tile: ranged attacks, Guard (so Difficulty 1), First Aid, the Ambush and challenge-object tasks. Melee attacks, routine actions and a defender's opposed roll don't take it. On an opposed attack it applies after the defender's roll (Core p.258). Where: `src/combat/combatSelectors.js` (`reachLines`).

### Attacks and actions

- **Attack tasks.** Book: Ranged Control + Security Difficulty 2; Melee Daring + Security Difficulty 1, opposed if the target is aware (p.290). Prototype: same. Where: `weapons.json` (`attackTasks`).
- **Focuses.** Book: an applicable focus. Prototype: designer-authored lists per weapon and per task (Guard, First Aid, Direct, defence). Where: `weapons.json`, `actions.json`.
- **Deadly Threat.** Book: a player choosing Deadly adds 1 Threat (p.290). Prototype: same for the party; enemies pay nothing. Where: `combatState.js` (`resolveAttack`).
- **Assist.** Book: Assist is a major action (pp.255, 289). Prototype: set up on an ally with a turn still to come this round; it applies to that ally's next task; one per task; cleared at round end. Where: `combatAttacks.js` (`canAssist`, `getAssistFor`), `actions.json`.
- **Direct.** Book: the character in authority directs an ally who can hear them (p.289). Prototype: authority is the nominated leader, else the unique highest rank, else the first picked; "hear" means within 8 tiles (no line of sight needed; the book says you can talk at Close range and shout to someone at Medium range, p.286, and Medium ends at 8 tiles) or both carrying communicators; once per ally per round. Where: `src/rules/authority.js`, `src/rules/communication.js`, `combatTasks.js`.
- **Guard.** Book: Difficulty 0, may be resolved without a roll (p.254). Prototype: always rolled, so its successes become Momentum. Where: `actions.json` (`tasks.guard`).
- **Ambush.** Book: Control for stealth (CL p.74); an ambusher may score an automatic hit (CL p.205). Prototype: the best Control + Security in the party rolls at Difficulty 1. Success is an automatic Injury on a target in range; failure means the enemy acts first for the rest of the fight. A Camouflage or Ambush Tactics focus rerolls one failed die. Where: `src/combat/combatAmbush.js`, `actions.json` (`ambush`).
- **Defender wins an opposed attack.** Book (Core p.256): the defender gains 1 Momentum per success the attacker fell short. Prototype: a party defender's Momentum goes to the group pool; an enemy's becomes Threat. Where: `src/combat/combatCounterattack.js`.
- **Counterattack.** Book (Core p.290): a defender who wins an opposed attack may move out of Reach (if in melee) or spend 2 Momentum to Counterattack, inflicting an Injury in return, Stun or Deadly (p.292). Prototype: costs 2 from the pool (enemies pay Threat, p.265; the party can't pay with Threat); no roll and no action; uses the defender's highest-Severity weapon that can reach the attacker (none, no Counterattack); the attacker may Avoid Injury as usual; a party Deadly Counterattack adds 1 Threat. The player chooses for party members; enemies always counterattack when they can pay, Deadly when the weapon allows; Auto Combat uses Stun. Moving out of Reach instead is not implemented. Where: `combatCounterattack.js`, `src/components/combat/CounterattackChoice.jsx`, `src/combat/injuryPolicy.js` (`chooseCounterattack`).
- **Roll pause.** Book: no rule. Prototype: a player's attack stops for a choice only if it would miss and a reroll is still available. Where: `combatAttacks.js` (`rollAwaitsPlayer`).

### Weapons

- **Weapon table.** Book: Core p.243 and p.355. Prototype: Combat Type 1 uses the Core weapons, not CL conflict (pp.203–206). Weapon stats, phasers included, are the Core table's; ranges in tiles are adaptation. Where: `weapons.json`.
- **Charge and Hidden.** Book: Charge needs Prepare; Hidden uses concealment. Prototype: recorded, no effect. Where: `weapons.json`.
- **Standard-issue weapon.** Book: no rule. Prototype: a party member with only Unarmed Strike is given a Type-2 Phaser for the fight, without changing their file. Where: `encounters.json`, `weaponSystem.js` (`withStandardIssue`).
- **Weapon stats live in combat data.** Prototype: `weapons.json` owns Severity and range; the item list only shows them. Where: `src/rules/equipment.js` (`getItemStatLines`).

### Talents in combat

Book pages: Core pp.157–163. Applied by talent id in `src/combat/combatTalents.js`; see `design-tracker.md`.

- **Applied Force.** Book: melee may use Fitness instead of Daring, and +1 Severity to Unarmed Attacks (Core p.161). Prototype: uses whichever is higher.
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
