# Dev Edit — Authoring Tools Overview

Source: `docs/editor-authoring-audit.md` (2026-10-18, updates through 2026-10-22; elevated placement 2026-10-22)
Scope: What Dev Edit (Map Editor + sub-editors) can author, save, reload, and playtest vs what still needs JSON/content-file edits.

--------------------------------------------------------------------------------
UI SHELL (2026-10-21)
--------------------------------------------------------------------------------

Layout matches the Mission Editor mockup (chrome only; map schema and sub-editors unchanged).

  Menu bar — File / Edit / View / Mission / Test
    File: New, Load, Save, Save As, Delete, Back
    Edit: Place Tiles, Move
    View: See-through blocks, Tile animations, Lighting, Weather FX, Grid,
          Grid options…, Overview / Layers / Levels windows
    Mission: Generate Map / Name / Episode / Card; Objective / Object /
             Conversation / Character Library / Generator Editor / Story
    Test: Play, Toggle Enemies Active

  Slim toolbar — Animate, Grid (+ options), Overview, Layers, Levels
                 (file ops and mission editors live in the menu only)

  Left — Assets (EditorPalette)
    Tabs: Tiles | Environment | Items | Markers | NPCs
    Search; selecting a thumbnail drives the paint tool and Selection props

  Center — Viewport
    Map title, board (Pixi), tile coord HUD, notices
    Weather FX overlay when View → Weather FX is on

  Right — Properties (EditorPropertiesPanel)
    Tabs: Map | Selection
    Map → MapProperties: size, location/biome/weather, ambient light + colour,
          generate, episode name/card, briefing/outros/stardate, open editors
    Selection → asset thumbnail (AssetProperties) or board entity (inspectors)
      Tile: preview, Cover / Fade, sprite info, Emission overlays
            (Emissive strength + Colour for floor spill when the tile glows /
             has emissions / overlay lights)
      Ambient / ambient colour also editable from Selection when a lit wall
            or glowing tile is selected (same map fields as Map tab)
      Hazard: intensity when painting hazards
      Board pick: NPC / Object / Marker / Destructible / Hazard / Ground item
            inspectors (unchanged)

  Floating windows — Overview (ghost / animate / lighting toggles),
                     Layers (active / visibility / lock), Levels (elevation deferred)

  Full-screen sub-editors — Conversation, Object, Objective, Story,
                            Character Library, Generator Editor
                            (shared ed-shell look; layouts unchanged)

Lighting presentation (also View → Lighting): contact shadows,
darkness veil from map `ambient` / `ambientColour`,
soft veil holes scaled by `animations[].emissive`, floor spill tinted by
`emitColour` (Selection Colour; floor layer under walls). Details: `docs/tiles.md`.

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

Writes (maps, conversations, story wording, tile flags, tileEffects emissive /
emitColour / glows) require the Vite DEV server. Production / Electron builds
are read-only for those files.

Story wording is global (missionLog.json), not per episode.

Data path (Game mode):

  Dev Edit UI
    → in-memory map (+ conversations/*.json, optional missionLog story,
      tiles.json flags, tileEffects.json live edits)
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
  - Assets palette paint, rotation (R)
  - Cover / Fade in Properties → Selection (writes tiles.json globally)
  - Emissive / emit Colour in Selection for glowing / overlay tiles
    (writes tileEffects.json via /__effects in DEV)

Map shell (Properties → Map)
  - Resize / size presets
  - Location, biome, weather
  - Ambient light (0–100) and ambient colour (darkness veil tint)
  - Generate Map / Name / Card; generate-hazards toggle
      Starship Deck / Space Station / Derelict use full bulkheads
      (thin halfBulkhead generation paused; half walls remain palette
      hand-place tiles — see docs/tiles.md)
      Deck tile styles: Mission → Generator Editor

Episode (Properties → Map)
  - Name, episode card
  - Briefing, outro, outro (abandoned / failed), stardate

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
  - Hazard brush intensity in Selection
  - Generate hazards with map (Map tab toggle)

Ground items / elevated surfaces
  - Inventory Objects palette → groundItemPlacements (pack snap: 4 large or 16 small per tile)
  - Place or Move onto a tile with `surface` (crate, table, barCounter,
    epsControl, cellBunk) writes optional `on: { tile: [x, y] }`; onto an
    item with `surface` (e.g. equipmentCase) writes `on: { placement: id }`
  - GroundItemInspector shows derived Elevation Z and support label
    (Z is never authored)
  - Painting a prop onto an existing surface cell appends `stackOver`
    (crate-on-crate); erase pops the top layer first
  - `surface` / item `surface` catalogues stay in tiles.json / items.json
  - Session drop/pickup is runtime-only (not map-authored)

Challenge objects (board)
  - Teal C markers; Move on Map / Reset Position
  - Drag with Move tool
  - Edit Covers on board
  - Object Inspector is placement-focused; full edit in Object Editor

View presentation
  - See-through blocks, tile animations, lighting (shadows + darkness),
    weather FX, grid / grid size


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


7) GENERATOR EDITOR (Vite DEV)
------------------------------
  - Mission → Generator Editor
  - Edits deck Generate Map styles for Starship Deck, Research Lab,
    Alien Vessel via sprite pickers (floor / wall / corner / door / crate /
    machinery / hazard)
  - Corner: optional wall sprite placed at every L/T junction after generate
  - Variations for the style’s Wall tile: share + multi-select panel/tile
    fitting sprites (geometric corners stay plain, then Corner applies)
  - Save → deckGenerators.json + generatedWallVariants.json
  - Preview on open map when Location matches (same as Generate Map)
  - Derelict inherits Starship Deck paint; station / Klingon / New Location
    still code-only

--------------------------------------------------------------------------------
FEATURE MATRIX (compact)
--------------------------------------------------------------------------------

Complete
  1  Tile painting / palette
  2  Tile rotation
  3  Map resize / size presets
  4  Location / biome / weather
  5  Ambient light (+ ambient colour; Selection emissive / emit colour)
  6  Episode name / card
  7  Generate Map / Name / Card
  7b Deck generator styles (Generator Editor; three deck Locations)
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
  27 Ground item placements (incl. elevated `on` + inspector Z)
  27b Furniture stackOver (paint prop onto surface cell)
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
  - New Generate Map Location types / station-cave-surface generator params
    (deck styles only in Generator Editor)
  - Elevation / gizmos (Levels window still a placeholder)
  - Map editor layers (2026-10-21): Ground / Walls / Furniture / Characters / Markers — UI visibility & lock; Null cells; floorUnder; undo/redo

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

5) Light → Colour on Map / Selection Ambient ≠ Emission Colour
   - Ambient colour tints the darkness veil (map.ambientColour)
   - Emission Colour tints soft floor/wall spill (animations[].emitColour)
   - Scroll to Emission overlays for Emissive + Colour on lit tiles

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
  - New tile art / flipbook frames      → art + makeTileFrames / tileEffects.json

--------------------------------------------------------------------------------
PRIMARY SOURCE FILES
--------------------------------------------------------------------------------

Editor shell
  MapEditorScreen.jsx, EditorMenuBar.jsx, EditorToolbar.jsx,
  EditorPalette.jsx, EditorPropertiesPanel.jsx, MapProperties.jsx,
  AssetProperties.jsx, EditorFloatWindow.jsx, EditorOverviewWindow.jsx,
  EditorLayersWindow.jsx, EditorLevelsWindow.jsx, EditorGridOptions.jsx,
  useEditorTools.js, EditorInspectors.jsx, EditorBoard.jsx

Inspectors
  NpcInspector.jsx, HazardInspector.jsx, DestructibleInspector.jsx,
  GroundItemInspector.jsx, ObjectInspector.jsx, MarkerInspector.jsx

Sub-editors
  ObjectEditorScreen.jsx, ObjectActionFields.jsx, ObjectiveEditorScreen.jsx,
  ConversationEditorScreen.jsx, StoryEditorScreen.jsx

Format I/O
  mapFormat.js, mapFiles.js, mapEdits.js, effectsFiles.js, effectsStore.cjs

Lighting / tiles
  tileArt.js, mapShadows.js, tileSpriteInfo.js, tileEffects.json,
  canvasTiles.js, pixi/mapLayers.js

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
  docs/tiles.md                    — tiles, animations, ambient / emissive lighting
  docs/world-objects.md            — world objects / environment
