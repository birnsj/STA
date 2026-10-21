# Dev Edit — Authoring Tools Overview

Source: `docs/editor-authoring-audit.md` (2026-10-18, updates through 2026-10-20)
Scope: What Dev Edit (Map Editor + sub-editors) can author, save, reload, and playtest vs what still needs JSON/content-file edits.

--------------------------------------------------------------------------------
VERDICT
--------------------------------------------------------------------------------

Dev Edit can author a substantial exploration episode (geometry, NPCs including
patrol / response / perception / waypoint anims, Character Library pool CRUD in
Vite DEV, conversations, objectives, challenge objects, environment, ground
items, mission text), but it cannot fully author every runtime property without
JSON edits—especially item / hazard / destructible type catalogues and
standalone Combat encounter definitions.

Audited features: 58
  Complete: 41
  Partial: 7
  Hardcoded: 7
  Missing: 2
  Broken: 0
  N/A: 1

Highest-priority gaps: item / environment-type catalogues, standalone Combat
encounter authoring, challenge definitions still living only in challenges.json
for sample maps.

--------------------------------------------------------------------------------
HOW DEV EDIT WORKS
--------------------------------------------------------------------------------

Dev Edit = Map Editor shell + full-screen sub-editors.

Play paths:
  - Editor Play → playtests the open in-memory map (unsaved OK)
  - Load Episode → Game → plays the saved map file only

Writes (maps, conversations, story wording, tile flags) require the Vite DEV
server. Production / Electron builds are read-only for those files.

Story wording is global (missionLog.json), not per episode.

Data path (Game mode):

  Dev Edit UI
    → in-memory map (+ conversations/*.json, optional missionLog story,
      tiles.json flags)
    → serializeMap / saveConversation (dev /__maps, conversation store)
    → maps/{id}.json + conversations/
    → loadMap / parseMapFile (Episode Select or editor Load)
    → createExplorationState(map, …)
         → challengeDefinitionsFor (map.objects ?? challenges.json[map])
         → createEnvironment(map.destructibles, map.hazards)
         → npcConfigsFor (map.npcs ?? npcs.json)
         → seedGroundItemPlacements(map.groundItemPlacements)
    → exploration / world combat runtime

Editor Play short-circuits disk: same createExplorationState with the open
in-memory map (ExplorationPlaytest).

--------------------------------------------------------------------------------
TOOLS
--------------------------------------------------------------------------------

1) MAP EDITOR (main board)
--------------------------
Tiles
  - Palette paint, rotation (R)
  - Cover / Fade flags (writes tiles.json globally)

Map shell
  - Resize / size presets
  - Location, biome, weather
  - Ambient light

Episode
  - Name, episode card
  - Generate Map / Name / Card

Markers
  - Area labels
  - Player starts (≤8) + facing
  - Enemy spawns + facing

NPCs
  - Place / move / delete
  - Character pick from pool
  - Faction, disposition, rules
  - Conversation link
  - Alert group / method
  - Must-survive
  - responseType
  - Patrol routes (board Edit Patrol)
  - Waypoint idle animations (duration + loop)
  - Perception overrides (+ Reset)
  - Gender / portrait (Klingon)
  - Influence radius
  - NPC rules: "Stat block default" / "Full character rules"
  - Hostile NPCs drawn red; others purple

Environment
  - Destructibles: place + instance overrides
      (damagedHazard, debris, attackDifficulty, noExplosion)
  - Force-field linked tiles
  - Hazards: paint / erase / merge + region overrides
      (migrateChance, injuryType, damagesObjects, blocksSight, movement,
       layer, scarTile, neutralize task)
  - Generate hazards with map (side-panel toggle)

Ground items
  - Inventory Objects palette → groundItemPlacements
  - Session drop/pickup is runtime-only (not map-authored)

Challenge objects (board)
  - Teal C markers; Move on Map / Reset Position
  - Drag with Move tool
  - Edit Covers on board
  - Object Inspector is placement-focused; full edit in Object Editor

Mission text (side panel)
  - Briefing, outro, outro (failed), stardate


2) CHARACTER LIBRARY (Vite DEV)
-------------------------------
  - CRUD authored NPC pool (characters.json) via /__authored-characters
  - Nested Character Creator (isolated from Main Menu draft)
  - Reference-protected delete
  - Live NPC picker refresh
  - Soft edit-save for legacy partial sheets; full validate for new entries
  - Production / Electron: read-only
  - Player saves remain a separate list (no auto-promote)


3) CONVERSATION EDITOR
----------------------
  - Node graph: Dialogue, Player Choice, Task Check, Condition, Action, End
  - Save under conversations/
  - Link from NPC Inspector; open Conversation Editor from there

Conditions
  - Source: mission flag (names may hold {npc} / {group})
  - Or talking NPC properties: disposition, hostility, Intimidated,
    check Difficulty change

Actions (among others)
  - NPC stands down
  - NPC Intimidated
  - NPC check Difficulty
  - Influence nearby NPCs (effect, who, radius, origin, tile, sight,
    include speaker)
  - Radius blank → NPC's radius or social.json default

Task Check
  - Opposed checkbox (Persuade / Intimidate style opposed rolls)

Dialogue depth (soft guideline, warnings only)
  - Minor = one line
  - Notable / Supporting = branched choices
  - Major / Full character rules = full graph
  - Warnings in Conversation Editor and NPC Inspector

NPC Inspector extras
  - Faction default conversation shown next to "None"
  - Stat-block book category beside "Full character rules" (metadata)

Still content-file only
  - Faction defaults: defaultConversations.json
  - Default influence radius: social.json influenceRadiusTiles

validateConversation still does not check condition sources, {group} on an
NPC with no group, or Influence filter ids.


4) OBJECT EDITOR (full-screen)
------------------------------
Challenge object CRUD on the map:
  - Name, type, position, extra tiles, starting state
  - States (label, description, tile)
  - Actions (label, icon, description, routine, Create Trait, combat cost,
    offer conditions, locked hint, task Attribute / Department / Difficulty /
    complication / focuses / tags / assists)
  - Outcomes: always / success / failure / complication
  - Effect types including Captain's Log, neutralize modes, setNpcResponse
  - Structured advanced-task UI: equipment / talentIds / roleIds / traitRules
    (optional raw JSON escape hatch)
  - Duplicate / reorder objects, actions, states
  - Id rename updates objective markers and effect refs
  - Warnings never block saving

Ownership
  - Map may embed objects[] OR use objectPlacements + challenges.json
  - First Object Editor edit that commits objects adopts map-owned definitions
  - Deck 10 Brig sample still uses challenges.json + placements until adopt

Hardcoded
  - interactRange (challenges.json top-level only)


5) OBJECTIVE EDITOR
-------------------
  - Objectives with conditions and markers
  - startsActive ("Starts active")
  - Marked on object (objectId) — marker follows the object
  - Mission flags / conditions shared with conversations and object requires


6) STORY WORDING EDITOR
-----------------------
  - Full-screen templates shared by every map
  - Save → missionLog.json
  - Sample mission preview as you type
  - Global, not per-episode

--------------------------------------------------------------------------------
FEATURE MATRIX (compact)
--------------------------------------------------------------------------------

Complete
  1  Tile painting / palette
  2  Tile rotation
  3  Map resize / size presets
  4  Location / biome / weather
  5  Ambient light
  6  Episode name / card
  7  Generate Map / Name / Card
  8  Area labels
  9  Player starts (≤8) + facing
  10 Enemy spawns + facing
  11 Tile Cover / Fade flags
  13 Challenge object definitions (Object Editor; samples may still use
     challenges.json until adopt)
  14 Challenge placement
  15 Challenge covers (board + text)
  16 Challenge actions / outcomes
  17 Advanced task equipment / talents / roles / traits
  19 Destructible placement
  20 Destructible overrides (catalogue still JSON-only)
  21 Force-field linked tiles
  23 Hazard paint / erase / merge
  24 Hazard region overrides (catalogue still JSON-only)
  26 Generate hazards with map
  27 Ground item placements
  30 NPC place / move / delete
  31 NPC character / appearance (pool CRUD via Character Library in DEV)
  32 NPC faction / disposition / rules
  33 NPC conversation link
  34 NPC alert group / method
  35 NPC must-survive
  36 NPC responseType
  37 NPC patrol routes
  38 NPC perception overrides
  39 NPC waypoint animations
  40 Authored character pool (Vite DEV Character Library)
  41 Conversations (node graph)
  42 Conversation actions
  43 Objectives
  44 Briefing / outros / stardate
  45 Story wording templates
  46 Mission flags / conditions
  51 Weather / ambient presentation
  53 Map save / load / rename
  54 Editor Play (playtest)
  55 Load Episode → Game
  58 Room env-control consoles (challenge objects)

Partial
  48 World combat start (indirect via disposition / dialogue; no encounter author)
  52 Explosion VFX kinds (placement override; flipbook art not kind-driven)
  56 Map validation warnings (challenge objects yes; objectives/conversations
     still partial)
  57 Legacy hazard tile roles vs region hazards

Hardcoded (place / use types; no catalogue editor)
  18 interactRange
  22 Destructible type catalogue (destructibles.json)
  25 Hazard type catalogue (hazards.json)
  28 Item type catalogue / behaviors (items.json + src/items/*)
  39 Fallback npcs.json (only when map has no npcs)
  49 Standalone Combat encounter (encounters.json)

N/A
  12 Big-object 2×2 (auto from tiles.json)
  29 Session drop/pickup (runtime only)
  47 Captain's Log auto entries (runtime + addLogEntry effects)
  50 Combat↔exploration handoff (runtime)

Missing / blocking
  - New item / hazard / destructible TYPE definitions (not just placements)
  - Custom standalone Combat roster (encounters.json)

--------------------------------------------------------------------------------
EASY-TO-MISREAD WORKFLOWS
--------------------------------------------------------------------------------

1) Deck 10 challenge content looks “on the map” but definitions are external
   - maps/Deck 10 Brig.json has objectPlacements + no objects
   - Runtime pulls definitions from challenges.json "Deck 10 Brig"
   - First Object Editor edit that commits objects switches to map-owned

2) Combat mode “episode” ≠ authored world fight
   - Load Episode → Combat uses engineeringDeckBoarding roster from
     encounters.json on the map’s spawns
   - Exploration world fights use whoever is hostile in the world

3) Legacy hazard tile roles vs region hazards
   - validateMap may warn about role: hazard / hazardControl tiles
   - Gameplay uses map.hazards regions + challenge neutralize / room controls

4) Play vs Save
   - Unsaved Play does not update the episode list until Save

--------------------------------------------------------------------------------
WHAT STILL NEEDS A CONTENT-FILE EDIT
--------------------------------------------------------------------------------

  - New item types / behaviors          → items.json + src/items/*
  - New hazard types                    → hazards.json
  - New destructible types              → destructibles.json
  - Standalone Combat encounters        → encounters.json
  - Faction default conversations       → defaultConversations.json
  - Default influence radius            → social.json (influenceRadiusTiles)
  - Shared challenge library (until adopt) → challenges.json
  - Fallback NPCs when map has none     → npcs.json

--------------------------------------------------------------------------------
PRIMARY SOURCE FILES
--------------------------------------------------------------------------------

Editor shell
  MapEditorScreen.jsx, EditorToolbar.jsx, EditorSidePanel.jsx,
  EditorPalette.jsx, useEditorTools.js, EditorInspectors.jsx

Inspectors
  NpcInspector.jsx, HazardInspector.jsx, DestructibleInspector.jsx,
  GroundItemInspector.jsx, ObjectInspector.jsx, MarkerInspector.jsx

Sub-editors
  ObjectEditorScreen.jsx, ObjectActionFields.jsx, ObjectiveEditorScreen.jsx,
  ConversationEditorScreen.jsx, StoryEditorScreen.jsx

Format I/O
  mapFormat.js, mapFiles.js, mapEdits.js

Runtime
  explorationState.js, challengeObjects.js, awareness.js, NPCController.js,
  world/environment.js, objectAuthoring.js, objectEffects.js,
  conversationActions.js, combat/encounters.js

Content
  maps/*.json, conversations/, challenges.json, npcs.json, awareness.json,
  hazards.json, destructibles.json, items.json, encounters.json, characters.json

--------------------------------------------------------------------------------
RELATED DOCS
--------------------------------------------------------------------------------

  docs/editor-authoring-audit.md   — full status matrix and phase history
  docs/design-tracker.md           — design decisions (scattered editor notes)
  docs/prototype-rules.md          — Book vs Prototype rules (incl. authoring)
  docs/tiles.md                    — tile catalogue / half bulkheads / panels
  docs/world-objects.md            — world objects / environment
