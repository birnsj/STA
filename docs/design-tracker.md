# Design Tracker

Open design decisions for the designer. Each entry separates what the book says from what the prototype currently does.

## Open

### Rank should matter in the game (opened 2026-10-02)

**Decision needed:** how rank affects the videogame (designer has confirmed it should matter; integration not yet decided).

**Book (STA 2e Core Rulebook):**
- p.140: ranks Cadet to Fleet Admiral and Crewman to Master Chief Petty Officer. The only post restriction: a commanding officer is at least a Commander "under normal circumstances". "The choice made in Step Five: Experience may limit which ranks the character may choose from."
- p.123 (Commission Without the Academy) and p.140: diplomats and civilians hold no rank normally, but may be granted one.
- p.141: rank decides the sidearm (Lieutenant Commander and above carry a Type-2).
- No other mechanical effect: rank does not change attributes, departments, focuses, values, or any roll.

**Prototype (current):**
- Rank is chosen on Screen 05 (Experience). The Career Path sets the rank type: officer (Starfleet Officer, Intelligence), enlisted (Starfleet Enlisted), or No Rank by default with officer ranks allowed (Diplomatic Corps, Civilian).
- Only the Commanding Officer has a minimum rank (Commander). Novice caps rank at Lieutenant (junior grade) / Petty Officer and Veteran requires at least Lieutenant Commander / Chief Petty Officer (Core pp.127–128, p.140).
- Rank decides the sidearm and the authority order in play; it is shown on the summary and Review.
- Exported JSON records it as `character.career.rank` = `{ id, name, type }` (`type` is `officer`, `enlisted`, or `none`). Rank order is the list order in `src/data/source/ranks.json` (lowest first).

**Possible integration points (for the designer to choose; none implemented):**
- Dialogue and NPC reactions (how crew and others address and respond to the character).
- Authority: which orders the character can give, which crew they command, whether they can lead away missions.
- Mission or content access gated by rank.
- Starting equipment or ship access by rank.
- Promotion as progression during play.

**Related questions:**
- Should the Novice rank cap stay once rank has gameplay effects?

### Combat Scan weakens the enemy (implemented 2026-10-10)

**Decided:** a successful combat Scan gives the enemy the trait Weak Point Located (like Create Trait, Core p.289): its opponents' attacks on it are -1 Difficulty for the rest of the fight. See prototype-rules "Combat Scan".

**Implementer picks, for review:** Potency stays 1, because an enemy can be scanned once. The trait applies before an opposed roll (cover), like a scene trait. It never takes Difficulty below 0. Any combatant on the other side benefits, not only the scanner.

**Decided (2026-10-10):** a successful exploration scan of an NPC carries into combat: it starts the fight scanned, with the trait.

**Questions:** should extra successes (or a second scan) raise it to Potency 2? Should enemies be able to scan the party?

### Party AI uses support actions in Auto Combat (implemented 2026-10-10, tuning for review)

**Decided:** every party AI in the Auto Combat dropdown can Scan, Persuade, Intimidate, give First Aid, Guard and Direct. Enemies are unchanged.

**Implementer picks (AI tuning, not rules; `src/combat/supportAI.js`):**
- Each option is scored in the same units as an attack. A hit is worth 1. Defeating an enemy or making it surrender is worth 2, and reviving an ally 1.5.
- The best support option replaces the character's turn only when it beats that character's own best attack, counting the Aim it would take first.
- **Scan:** the party's extra chance to hit that enemy, counted at 75% because the payoff comes later. A skilled scanner (around 80% to succeed) scans; an average one (35%) doesn't.
- **Persuade or Intimidate:** worth a lot only on an enemy with no Stress left, where a win makes it surrender. Against a fresh enemy a win is worth 0.4, so the AI shoots instead.
- **Guard:** counts the drop in each enemy's chance to hit, weighted by whether that enemy is likely to shoot the guarded character, and taken at half value.
- **Direct:** the ally's assisted shot, less 0.3 for the Momentum spent.
- **First Aid:** revives an ally within Reach, or walks next to a downed ally first. A dying ally's Deadly Injury is treated first.
- **Random AI:** adds every legal support action to its random picks.
- **Headless check:** 40 fights each, three against three. With a scientist and a medic in the party, the win rate with support matches the old AI (Classic 40/40, Turn Planner 38/40). With three average characters, support no longer lowers it either.

**Questions:** should the planner styles (Aggressive, Cautious and so on) weigh support differently? They currently share one rule.

### NPC and conversation authoring, phase 1 (implemented 2026-10-09, choices awaiting designer review)

**Book:** social interaction is roleplay with tasks where the outcome is uncertain (Core p.279); there is no rule for dialogue trees, flags or objectives.

**Prototype (designer decisions, Oct 2026):** NPCs are placed and edited in Dev Edit and saved in the map file (a map with its own NPCs no longer uses `npcs.json`). Conversations are node graphs edited in Dev Edit and saved under `conversations/`. Objective status is stored as mission flags and shown in an Objectives panel. The validation encounter uses an authored Federation engineer from the Core Rulebook Starfleet Officer (p.352), with a hand-authored junction and bulkheads in `challenges.json`.

**Implementer picks, open for review:**
- The talk range is the challenge-object reach (2 tiles). Interact and Talk are buttons only; the E key shortcut was removed (designer request, 2026-10-10).
- Left-clicking a visible NPC opens a ring. The designer chose Scan, Attack, Info and greyed placeholders, on top of the implementer's Talk and Go To. Talk from out of reach walks the party over first.
- NPC ring details:
  - Scan uses the area Scan's task, Difficulty and cooldown. The scanner is the first selected character who can scan.
  - The Info card shows the highest awareness state toward any party member.
  - Attack asks for confirmation only for friendly and neutral NPCs.
  - Attack never offers the opening Ambush, even on an unaware NPC. Should attacking someone unaware allow it?
  - The placeholders are Persuade, Intimidate, Use Item and First Aid.
- A conversation check can be answered by any able party member within reach. There is no assist and the NPC never rolls back.
- The Task Check node's complication actions run once if any complication is left after the roll.
- A conversation can't start or continue during combat. A `startCombat` action fights the speaking NPC.
- Flags last for the episode only, because there is no save game.
- The `engineerTrust` flag is set but nothing reads it yet.
- A successful diagnosis unlocks an easier junction action (Control + Engineering, Difficulty 1, instead of Reason + Engineering, Difficulty 3).
- The east bulkheads can also be forced with a Control + Security override (Difficulty 2) once power is back, without Lt. Okafor's clearance.
- Sealing the east section keeps the two Klingon spawns out of reach until the bulkheads open.

- Captain's Log (designer request, 2026-10-09; see `prototype-rules.md`):
  - The stardate starts at the map's stardate (default 4523.3) and goes up 0.1 per minute of exploration time.
  - Automatic entries: objectives becoming active or complete, and conversation check results. Fights, scans and challenge rolls are not logged unless the author adds an entry.
  - The Deck 10 Brig briefing is an implementer draft for the designer to rewrite.
- Objective markers on the minimap (designer request, 2026-10-09): the Deck 10 Brig's "Restore power" marker is placed on the EPS junction (23, 23), an implementer pick. Markers show regardless of whether the party has seen that spot.
- More Deck 10 Brig objectives (designer request, 2026-10-10). The titles, descriptions, triggers and markers are implementer drafts:
  - "Get Lt. Okafor's clearance": active once you have met her (`engineerMet`), complete once she grants access (`sectionAccessGranted`). No map marker, because it would cover her on the editor board.
  - "Get into the east section": active once the power is back (`stationPowerRestored`), complete once either east bulkhead opens, by clearance or by override (the doors now set `eastSectionOpen`). Marked at the south bulkhead (24, 20).
  - "Deal with the Klingon guards": active once a bulkhead opens, complete once guards A, B and C are each down or surrendered (`defeated.guardA/B/C`, set when a fight ends).

- Challenge objects placed by the map (designer request, 2026-10-10). Their states and actions stay in `challenges.json`, but the map file's `objectPlacements` says where each one stands on that map; a doorway's second tile moves with it. In Dev Edit, clicking an object (teal C marker) shows it, with Move on Map and Reset Position, and dragging its tile with the toolbar's Move carries the object along. An objective can be marked on an object (`objectId`, "Marked on" in the Objective Editor), and its marker follows the object. The Deck 10 Brig's "Restore power" is marked on the EPS junction and "Get into the east section" on the south bulkhead. Not yet possible: adding or removing challenge objects, or editing their actions, in the editor.

**Questions:** should a surrendered NPC count as defeated for objectives? Should conversations ever run in combat (for example a surrender parley)? Should a fight's outcome be logged automatically? Should flags and objectives be saved once save games exist? What should `engineerTrust` (or disposition changes) affect?

### Klingon locations in Generate Map (implemented 2026-10-09, choices awaiting designer review)

**Request:** add Klingon locations to the map editor's Location list.

**Book:** no rule; map layout is wholly prototype.

**Prototype** (`src/maps/generators/klingon.js`): a new "Klingon" heading in the Location list with two entries, both implementer proposals:
- **Klingon Ship:** the Starship Deck room grid built from the Klingon tile set.
- **Klingon Station:** the Space Station layout (a Great Hall with rooms off it) from the same tiles.
- Each map has a warp core on a ring of lit grates in one roomy room and a command chair in another (small maps can lack room for the chair). Consoles and cargo line the walls. The station's hall has struts down both sides and a strip of grates.
- About 25% of bulkheads become display or conduit walls. The closed door is never generated.
- There is no EPS hazard patch, because the set has no hazard tile.
- Sizes copy Starship Deck and Space Station. The Generate Card picture is the existing interior painter in its dark red hull.
- Map names (`locationNames.json` klingonShip, klingonStation) and area labels (`areaNames.json`) are invented placeholders.

**Questions:** are these the right two locations (for example, should a Bird-of-Prey, a battle cruiser or a planetside fortress be separate)? Should the warp core and chair always appear? Should generated maps use the closed door anywhere?

## Decided

### Core Rulebook is the rules authority (decided 2026-10-08)

**Decision:** the character creator and combat follow the STA 2e Core Rulebook rather than the Captain's Log Solo RPG. An audit of the data against Core found the talents, species abilities, scores and role benefits already matched; the lifepath, ranks and equipment followed Captain's Log.

**Designer choices:** Core's lifepath (Environment without Conditions; Upbringing without Aspiration or Caste; Core's eight Career Paths with their traits; Experience; Core's Career Events; Finishing Touches reducing over-limit scores before the +1s, with age and an optional pastime). Core's terms on screen only (Departments, Upbringing, Career Path, Experience); internal keys unchanged. Mixed Heritage and New Species per Core. Assignments kept, plus Chief Tactical Officer, Navigator and Ship's Doctor. Core's rank list and limits (CO at least Commander; Novice post bans dropped); diplomats and civilians No Rank by default but may take an officer rank; Intelligence takes officer ranks. Core's sidearm rule. Career Path traits use Core's names, not editable; no Sciences extra trait, no optional Career Event traits, exactly two events. Core's example values and focuses. Combat adds Core's Reach penalty and Counterattack.

**Implementation picks awaiting review:** listed in `prototype-rules.md` against each rule (new assignments' departments, the two-name trait pick, Administrator, the sidearm's "Starfleet" test, the Counterattack weapon and AI rule, the Reach penalty on Guard and the Ambush).

### Sprint goes twice as far as Move (decided 2026-10-07)

**Decision:** Sprint goes twice the Move distance, like the book.

**Book (STA 2e Core Rulebook):** p.288: Move (minor action) goes up to one zone, anywhere within Medium range. p.289: Sprint (major action) goes two zones, anywhere within Long range. The two can't be taken in the same turn.

**Prototype:** Move is floor(Fitness ÷ 2) + 1 tiles (5 at Fitness 9); Sprint is twice that (10 at Fitness 9), with no roll. It used to be half of Move, left over from the 2 AP rule when Sprint cost 1 AP. `getSprintTiles` in `combat/movementSystem.js`.

### No Rank characters are kept, but never command (decided 2026-10-07, updated 2026-10-08)

**Decision:** keep No Rank for diplomats and civilians, but bar it from Commanding Officer and Executive Officer.

**Updated 2026-10-08** by "Core Rulebook is the rules authority": this entry first followed Captain's Log, where a civilian could only be No Rank (CL p.120, honorary rank not offered) and enlisted characters were barred from CO and XO (CL p.132). Under Core, civilians may take an officer rank, and enlisted characters are barred only from CO.

**Book (STA 2e Core Rulebook):**
- p.123 (Commission Without the Academy) and p.140: diplomats and civilians hold no rank under normal circumstances, but may be granted one; civilians do not need to select a rank.
- p.140: a commanding officer is at least a Commander "under normal circumstances". No other assignment has a minimum.
- The book says nothing about unranked characters in command.

**Prototype:**
- Diplomatic Corps and Civilian start at No Rank and may take any officer rank (Cadet through Fleet Admiral). Data: `rankTypeByEducation` (`optional`) in `career.json`.
- "No Rank" is a prototype label (`src/data/adaptation/career.json`); the book has no name for it.
- Designer rule: a No Rank character cannot be Commanding Officer or Executive Officer ("Not for No Rank"). A diplomat or civilian in either post must take an officer rank. Data: `noRankExcludedAssignments` in `career.json`; rules: `getAssignmentBlock` and `isRankAllowed` in `rules/career.js`.
- Enlisted characters can't be Commanding Officer, because no enlisted rank meets the Commander minimum. They may be Executive Officer (designer decision, 2026-10-08).

### Species Ability for Mixed Heritage and New Species (decided 2026-10-07, updated 2026-10-08)

**Decision:** a Mixed Heritage player picks which parent is the primary species and gets that species' ability. A New Species player writes their own Species Ability.

**Updated 2026-10-08** by "Core Rulebook is the rules authority": this entry first gave a New Species no Species Ability ("None"). Core p.114 has the player create one.

**Book (STA 2e Core Rulebook):**
- p.99: each species gives a Species Ability; a mixed-heritage character has the ability of their primary species.
- p.114: a new species gets +1 to three attributes, and the player creates a Species Ability comparable to a talent.

**Prototype:**
- Each parent on the Species screen has a "Make primary" button. The Species screen is not complete until one is chosen. Changing that parent clears the choice. Stored as `species.primarySpeciesId`.
- New Species: the player writes the ability's name and description; the Species screen is not complete until both are filled in. The ability has no mechanical effect. Stored on `species.speciesAbility` with id `custom` (export schema 0.10.0).
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

### Combat Type 2 removed (decided 2026-10-08)

**Decision:** Combat Type 2 (the separate tactical-positioning experiment: 1 character, 2 action points a turn, telegraphed enemy intents, Push, an EPS hazard) is dropped from the game. Its code, data and the Load Episode entry are deleted; Combat Type 1 is the only combat. Replaces the 2026-10-07 decision to keep it frozen.

### Stages 05 and 06 keep their titles (decided 2026-10-08)

**Book (STA 2e Core Rulebook):** p.98: Step Five is Experience, Step Six is Career Events.

**Prototype:** stage 05 stays "Career" (Experience, Assignment, Rank) and stage 06 stays "Career History". `src/data/adaptation/creationSteps.json`.

### Enlisted characters may be Executive Officer (decided 2026-10-08)

**Book (STA 2e Core Rulebook):** p.140: the only assignment minimum is Commander for a commanding officer.

**Prototype:** enlisted characters may be Executive Officer. They can't be Commanding Officer because no enlisted rank meets the Commander minimum. `src/data/source/assignments.json` (`minimumRank`).

### Shirt colour follows the department, TOS style (decided 2026-10-08)

**Book:**
- STA 2e Technical Manual p.40 (Uniforms): pre-Federation piping was gold for command and administration, blue for sciences and medical, red for operations and security. From 2230 to the mid-2250s Command stayed gold, with silver for Sciences, copper for Operations and white for Medical. By the late 2250s the original scheme returned as the colour of the tunic.
- STA 2e Core Rulebook pp.120-121 (Academy tracks): Command track majors in Command or Conn, Operations track in Engineering or Security, Sciences track covers Science and Medicine.

**Prototype:** every Starfleet portrait wears its department's TOS colour: gold for Command and Conn, red for Engineering and Security, blue for Science and Medicine. A character with no department wears blue. Characters of other factions (the Klingon enemies) keep their art. Shown everywhere a character's portrait appears (creator, Review, Import Character, combat, exploration). Presentation only; nothing is added to the character JSON, since the colour comes from the department. Colours and grouping in `src/data/adaptation/uniforms.json`, lookup in `src/rules/uniform.js`. The mock portraits are flat colour, so `src/components/useUniformImage.js` swaps their three shirt colours in the browser; real portrait art will need the shirt on its own layer.

### Layered portraits (decided 2026-10-08)

**Book:** no rule; portrait art is wholly prototype.

**Prototype:** a portrait may be composited from layers instead of one flat picture. Head and shoulders (designer spec, 2026-10-08): the character's chosen backdrop, `characterImage` (the character on a transparent PNG) and an optional `uniformImage` overlay tinted with the department colour, drawn in that order. Full body: `fullBodyLayers` (background, a greyscale uniform tinted the same way, face, and an insignia, which for now is on full-body portraits only). Designer choices: Canvas compositing (one finished picture for every screen, the map figures included), a full set of layers per portrait, and mocks for a few portraits first (Human Male 1, Human Female 2, Vulcan Male 1; `scripts/makePortraitLayers.mjs` into `public/art/portraits/layers/<portrait id>/`). Human head portraits batch 01 (designer art, 2026-10-08): ten transparent 256 x 320 pixel-art PNGs replace the Human mock heads under the same ids; each is its own `characterImage`, so the backdrop shows behind it. Their department gold is baked into the art; Uniform recolour (2026-10-08, all ten Human portraits): each has its own uniform mask (`public/art/portraits/masks/<portrait id>-uniform.png`, generated by `scripts/makeUniformMask.mjs` with a per-portrait collar line and checked by eye at zoom) so the compositor recolours just the shirt to the department colour, keeping its shading; Command gold shows the original pixels. Collars, insignia, skin, hair and transparency are untouched. The temporary dev colour override used for testing has been removed. Vulcan head portraits (designer art, 2026-10-08): ten transparent 256 x 320 PNGs under the existing Vulcan ids, set up exactly like the Humans (own `characterImage`, own uniform mask, gold art recoloured by department). Vulcan Male 1's mock head layers are no longer used; its mock full-body layers are kept, since full-body art is out of scope. Vulcan Female 1's long neck falls in shirt tones, so her mask keeps only the shirt-sized region. Andorian head portraits (designer art, 2026-10-08): ten transparent 256 x 320 PNGs under the existing Andorian ids, set up the same way; they had no mock head layers to retire. Blue skin, antennae, pale hair and the collar sit outside the shirt-tone range, so no manual cleanup was needed. Tellarite, Trill and Caitian head portraits (designer art, 2026-10-09): thirty transparent 256 x 320 PNGs under the existing ids, set up the same way (designer decision: all thirty get the backdrop and the department recolour). Their masks needed two script additions: a shoulder cut off from the shirt by a seam is kept when it is at least 40 pixels, touches the background and lies in the outer quarter (so neck fur in shirt tones is not), and one portrait (Tellarite Male 2, whose beard dips into shirt tones) has a separate collar line for its left shoulder. Four Caitian files were delivered under the wrong gender and were swapped (Male 4 and 5 with Female 1 and 2). Portrait set on Finishing Touches (designer decision, 2026-10-09): a character sees only its own species' portraits for its gender; Mixed Heritage sees both parents' (none until both are chosen); New Species, having no art of its own, still sees every species'. Backdrops (designer decision, 2026-10-08): the player picks one on Finishing Touches (Portrait Details, a ‹ Backdrop › row under the preset counter); it is saved as `identity.backdrop: { id, name }` (export schema 0.11.0) and is independent of the portrait. Backdrop follows the department (designer decision, 2026-10-09, export schema 0.12.0): until the player picks another, the backdrop is the department's (Command: briefing room, Conn: starship bridge, Engineering: engineering, Security: transporter room, Science: planet surface, Medicine: sickbay; starship corridor before a department is chosen), saved as `identity.backdrop: null`. Picking the department's own backdrop returns to following it; an id no longer in the list also follows it. Saves made before this that stored a backdrop keep it as an explicit choice. Starship Bridge is designer art (256 x 320, scaled up without smoothing). The list is `src/data/adaptation/portraitBackdrops.json`: Starship Bridge plus seven placeholders (starship corridor, briefing room, transporter room, sickbay, engineering, planet surface, alien interior; `scripts/makePortraitBackdrops.mjs`, which never redraws the bridge). The backdrop shows only behind layered head-and-shoulders portraits (the creator screens and combat panel portraits); single-image portraits are opaque, and map figures and full-body pictures don't use it. Portraits without these fields keep their single `image`, which is also the fallback if a layer fails to load. Portrait selection is unchanged (`identity.portrait: { id, name }`).

### Map character sprites (decided 2026-10-08)

**Book:** no rule; map figures are wholly prototype.

**Prototype:** on the combat and exploration maps a character is an animated full-body isometric figure instead of the portrait on a stand (designer choice of approach, 2026-10-08; placeholder art agreed until real sprites exist). One sheet per species and gender (Human, Vulcan, Andorian, Tellarite, Trill and Caitian, male and female, plus a Klingon warrior for the enemies), picked from the character's portrait; nothing is added to the character JSON. Each sheet has five drawn directions (south, south-east, east, north-east, north; the west-facing three are mirrored, so their light comes from the other side) with a 4-frame idle breath, an 8-frame walk and an 8-frame run (exploration only; see Walk or run in exploration), played by CSS while the figure moves and desynchronised per character. Starfleet sheets have a uniform mask and take the department colour like the portraits; the Klingon keeps its armour. Reduced motion stops the animation. A character with no matching sheet keeps the portrait token (and the flat fallen body when down). Data `src/data/adaptation/characterSprites.json`, lookup `getSpriteSet` / `directionFor` in `src/rules/appearance.js`, drawing `src/components/maps/CharacterSprite.jsx`. The placeholder sheets are rendered by `scripts/makeCharacterSprites.mjs` into `public/art/sprites/characters/` (it never redraws an existing sheet without `--force`), 160 x 256 pixels per frame shown at 40 x 64 on the map.

### Combat sprite animations: attack, cover and falls (implemented 2026-10-09, choices awaiting designer review)

**Book:** STA 2e Core p.292: a Defeated character falls prone and can't act; a Defeated character with a Deadly Injury is Dying. p.291: a hit simply Defeats a Minor NPC (Prototype, designer decision Oct 2026: Stun leaves it Unconscious, Deadly kills it). First Aid ends Defeated. Nothing about how any of it looks.

**Prototype (designer request: attack, cover and several death animations in combat, for party, enemies and NPCs):** every sprite set gains a combat sheet (shoot: the arm comes up with a hand weapon and kicks on the shot; melee: wind-up and lunge; cover: down on one knee, weapon ready, breathing) and a fall sheet (four falls). In Combat Type 1 a character shoots on its Attack, Counterattack or successful Ambush with a ranged weapon and strikes with a melee one (`weapons.json` type), crouches while in cover, and falls when Defeated, then lies there; First Aid that ends Defeated plays its fall backwards (getting up). Enemies and bystander NPCs use the same figures and rules. Downed characters in exploration lie in the same pose without replaying the fall. Implementer picks, presentation only, open for review: a Stun Injury (or an Unconscious Minor NPC) crumples to the knees and onto its side; a Deadly Injury (Dying, or a Dead Minor NPC) falls back, falls forward or spins down, chosen from the character's id so the same character always falls the same way; there is no separate "dead" look; there is no hit flinch. Downed figures keep the existing dimming. Combat already lets a character stand on a Defeated combatant's tile, so bodies can lie on top of each other. Data `characterSprites.json` (`sheets`, `deadlyFalls`, `stunFall`), choice `defeatAnimation` in `src/rules/appearance.js`, combat state to animation in `src/components/combat/useUnitAnimation.js`.

### Walk or run in exploration (decided 2026-10-09)

**Book:** no rule; the books have no real-time movement.

**Prototype (designer decisions, 2026-10-09):** in exploration a move order runs when its point is more than 4 tiles (straight line) from the lead character, and walks otherwise. While the button is held the point is the cursor, so the lead runs toward a far cursor and slows to a walk as it gets within 4 tiles; a single click uses the clicked point the same way. Run speed is 5.5 tiles per second (walk 3.2). Followers of a running leader run too (catching up at 6.6 instead of 4.4); a follower merely hurrying behind a walking leader is not running. A running character is noticed by NPCs faster: 2.5x the base rate instead of the 1.5x for a moving character. Running shows the run cycle on the map figure. Combat is unchanged (its tile Move and Sprint rules). Tuning in `src/data/adaptation/exploration/partyControl.json` (`runDistance`, `runSpeed`, `runCatchUpSpeed`) and `awareness.json` (`runningMultiplier`); logic in `src/exploration/partyControl.js` (`order.run`, `member.running`) and `awareness.js` (`perceive`).

### Help Hints setting (decided 2026-10-09)

**Book:** no rule.

**Prototype (designer request, 2026-10-09):** Settings > Display has a Help Hints switch (on by default, saved with the other settings). Off hides the hint box at the top of combat and exploration. It covers only that box (designer choice): the How to Play window and the Guide Highlight keep their own behaviour. Implementer picks: in combat the Ambush button, which sits in the same box, still shows on its own; in exploration the box still appears while the debug noise tool waits for a click. Setting `helpHints` in `src/settings/displaySettings.js`, read through `src/settings/DisplaySettingsContext.js`.

### Box selection in exploration (decided 2026-10-09)

**Book:** no rule.

**Prototype (designer decisions, 2026-10-09):** on the exploration map, holding the right button and dragging draws a rectangle; on release the party members whose figure it touches become the selection (Ctrl or Cmd adds them instead). The lead stays if still selected, else the first selected in team order. A box with no one able to act inside changes nothing; Defeated characters are never selected. Combat is unchanged. Implementer picks, open for review: because the right button now draws the box, the camera drags with the middle button on the exploration map (designer request 2026-10-09: middle-drag pans every map, and combat and the map editor also keep right-drag panning; WASD and arrows still pan); a press must move 6 screen pixels before it draws a box. Logic `selectBox` in `src/exploration/partyControl.js`; drawing in `src/components/exploration/ExplorationBoard.jsx`.

### Sneaking in exploration (decided 2026-10-09, numbers awaiting tuning)

**Book:** Captain's Log p.74: Control is the attribute for remaining stealthy. The STA 2e Core Rulebook (p.88) describes Control as precision and "deliberate, measured actions". No book has real-time stealth or movement speed rules.

**Prototype (designer decisions, 2026-10-09):** the C key or the Sneak button (under the formations) toggles sneak for the selected characters: on for all of them unless every one already sneaks. Sneak skill is Control + Security, as for the combat Ambush; each character uses their own. A sneaking character crouches (new sneak idle and sneak walk animations), never runs (a long move order still sneaks), and moves at a speed from their skill. NPC awareness of a sneaking character builds more slowly, scaled by the same skill; there is no roll. Implementer picks, all first-pass tuning in `src/data/adaptation/exploration/sneak.json`, open for review: speed 1.7 tiles per second at skill 11, plus 0.12 per point, between 1.1 and 2.6 (walk is 3.2); a follower who falls behind catches up at 1.4 times their sneak speed. Detection replaces the moving (1.5x) or running (2.5x) multiplier with 0.8x while moving or 0.6x standing still, multiplied by 1 - 0.06 per point above 11, between 0.4 and 1.4. Inside an NPC's close range (2 tiles) a sneaker is still identified at once. A sneaking figure is drawn slightly faded, so portrait-token characters show it too. Sneak stays on after a fight. Focuses (Camouflage) have no effect. Logic in `src/exploration/sneak.js`, `partyControl.js` (`toggleSneak`, `member.sneaking`) and `awareness.js` (`perceive`); sprite sheet `sneak` in `characterSprites.json`, drawn by `scripts/makeCharacterSprites.mjs --sheet=sneak`.

### Wall fade grouping: room cutaway (decided 2026-10-09, numbers awaiting tuning)

**Book:** no rule (presentation only).

**Prototype (designer decisions, 2026-10-09):** walls that hide a figure fade in logical groups instead of block by block, and a wall that has faded stays faded until the figure is clearly clear of it (a stickiness margin), so walls don't flicker at the edge. The map's floor is split into spaces bounded by walls and doorways. A character in a room fades that room's camera-facing walls (east and south sides, the corner between them and the corner posts at their ends), each side as one whole wall, doorways included, while a character is less than 4 tiles from that side measured straight out from it (solid again at 4 tiles; for the characters' own room nothing else, not even a wall covering a character, fades those walls) (the x distance for the east side, the y distance for the south side), wherever they are along it (designer decisions, 2026-10-09; implementer pick: the corner where the sides meet belongs to both, each far corner post to its own side, so a back wall never fades with them), so the room is seen into where the party stands while the walls beyond it stay solid. A character standing in a doorway keeps the room they came from. In corridors and open areas, a wall that hides a figure fades its whole straight section. Wall fade now shares one 200 ms fade timing between the map and the figure overlays (fixes a flicker), and figures are measured at the current sprite scale (1.265). Implementer picks, tuning in `src/data/adaptation/maps/wallFade.json`, open for review: a space touching the map edge or over 300 tiles is open ground, not a room; a space with under 15% of its tiles away from walls is a corridor; sections are cut every 6 tiles; the stickiness margin is 12 px. A faded section reappears once every character cutting walls away is more than 2 tiles from all of it (designer decision, 2026-10-09; implementer pick: diagonal steps count as one tile). A section with a wall actually covering a character fades however far away it is. Only the selected characters cut walls away in exploration, and in combat only whoever's turn it is (an enemy the party can see, on its turn) (designer decisions, 2026-10-09). Logic in `src/maps/wallFade.js` (`analyseWalls`, `wallFadeStep`) and `src/components/maps/useWallFade.js`; fade timing in `src/components/maps/fadeLevels.js`.
