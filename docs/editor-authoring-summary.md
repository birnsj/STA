# Dev Edit — Authoring Tools Overview

Source: `docs/editor-authoring-audit.md` (2026-10-18 matrix; UI/shell updates through **2026-11-11**)
Scope: What Dev Edit (Map Editor + sub-editors) can author, save, reload, and playtest vs what still needs JSON/content-file edits.

**Current state (2026-11-11, `572dd04`):** Auto-Paint is the new map-construction path (rulesets + floor→wall assembly + in-tool Generate Map). Frozen Generate Map / Generator Editor / `generators/*` stay for existing maps. Full-screen Tools editors use a top **File** menu (Save/Load for that editor’s data; objectives/objects use map Save/Load). Template Pieces live under Assets → Tiles; multi-brush paint for tiles and templates. Details: `docs/auto-paint.md`, `docs/tiles.md`.

--------------------------------------------------------------------------------
UI SHELL (2026-10-21 layout; menus refreshed 2026-11)
--------------------------------------------------------------------------------

Layout matches the Mission Editor mockup chrome (ed-shell).

  Menu bar — File / Edit / View / Tools / Test / Help
    File: New, Load, Save, Save As, Delete Map, Back to Menu
    Edit: Undo, Redo; Toggle Place Tiles, Toggle Move;
          Toggle Auto-Paint, Rebuild Auto-Paint Walls
    View: See-through blocks, Tile animations, Lighting, Placement surfaces,
          Weather FX, Grid, Grid options…, View scale…,
          Overview / Layers / Levels windows
    Tools: Objective / Object / Conversation / Character Library /
           Generator Editor / Auto-Paint Ruleset Editor / Story Wording
    Test: Play, Toggle Enemies Active
    Help: Keyboard Shortcuts…, About STA Builder

  Slim toolbar — Animate, Grid (+ size select + options), Overview, Layers, Levels
                 (file ops and Tools editors live in the menu; Generate Map /
                  Name / Episode / Card also on Properties → Map)

  Left — Assets (EditorPalette)
    Tabs: Tiles | Environment | Items | Markers | NPCs
    Tiles includes Template Piece groups (`templatePieces.json`) above tile
    tilesets; DEV can author tilesets / import PNG / CRUD Template Pieces
    Search; selecting a thumbnail drives the paint tool and Selection props
    Multi-brush: checkboxes on tile / Template Piece thumbs cycle while painting
    (Unreal foliage-style); selected brush stays in the set

  Center — Viewport
    Map title, board (Pixi), tile coord HUD, notices
    Weather FX overlay when View → Weather FX is on

  Right — Properties (EditorPropertiesPanel)
    Tabs: Map | Properties
    Map → MapProperties: size, location/biome/weather, ambient light + colour,
          generate, episode name/card, briefing/outros/stardate, open editors
    Properties → asset thumbnail (AssetProperties) or board entity (inspectors)
      Tile: preview, Cover / Fade, sprite info, Emission overlays
            (Emissive strength + Colour for floor spill when the tile glows /
             has emissions / overlay lights)
      Ambient / ambient colour also editable from Properties when a lit wall
            or glowing tile is selected (same map fields as Map tab)
      Hazard: intensity when painting hazards
      Board pick: NPC / Object / Marker / Destructible / Hazard / Ground item /
            Template Piece inspectors

  Floating windows — Overview (ghost / animate / lighting / placement surfaces),
                     Layers (active / visibility / lock), Levels (elevation deferred)

  Full-screen sub-editors — Conversation, Object, Objective, Story,
                            Character Library, Generator Editor,
                            Auto-Paint Ruleset Editor
                            (shared ed-shell; each has top File menu for that
                            editor’s data via `editorSubMenus.js`)
    Auto-Paint Ruleset: File Save/Load ruleset + Generate Map; toolbar
      Rules / Map view toggles (left palette stays); Grid uses main editor
      show/size/options settings

Lighting presentation (also View → Lighting): contact shadows,
darkness veil from map `ambient` / `ambientColour`,
soft veil holes scaled by `animations[].emissive`, floor spill tinted by
`emitColour` (Selection Colour; floor layer under walls). Details: `docs/tiles.md`.

--------------------------------------------------------------------------------
VERDICT
--------------------------------------------------------------------------------

Dev Edit can author a substantial exploration episode (geometry including
Auto-Paint / Template walls, NPCs including patrol / response / perception /
waypoint anims, Character Library pool CRUD in Vite DEV, conversations,
objectives, challenge objects, environment, ground items, mission text), but it
cannot fully author every runtime property without JSON edits—especially item /
hazard / destructible type catalogues and standalone Combat encounter
definitions.

Baseline audit (2026-10-18): 58 features — 41 Complete / 7 Partial / 7 Hardcoded /
2 Missing / 0 Broken / 1 N/A. Since then (not re-counted in the audit matrix):
Auto-Paint Ruleset Editor + Generate Map, Template Piece catalogue paint /
authoring, multi-brush, Bulkhead 32 wall tiles, sub-editor File menus, map
layers / Null / floorUnder (already noted 2026-10-21).

Highest-priority gaps: item / environment-type catalogues, standalone Combat
encounter authoring, challenge definitions still living only in challenges.json
for sample maps; Auto-Paint still shares the deck room grid (no native layout
yet — see `docs/auto-paint.md`).

--------------------------------------------------------------------------------
HOW DEV EDIT WORKS
--------------------------------------------------------------------------------

Dev Edit = Map Editor shell + full-screen sub-editors.

Play paths:
  - Editor Play → playtests the open in-memory map (unsaved OK)
  - Load Episode → Game → plays the saved map file only

Writes (maps, conversations, story wording, tile flags, tileEffects emissive /
emitColour / glows, Auto-Paint rulesets, Template Pieces, deck generator styles)
require the Vite DEV server. Production / Electron builds are read-only for those
files.

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
  - Cover / Fade in Properties → Properties (writes tiles.json globally)
  - Emissive / emit Colour in Properties for glowing / overlay tiles
    (writes tileEffects.json via /__effects in DEV)

Map shell (Properties → Map)
  - Resize / size presets
  - Location, biome, weather
  - Ambient light (0–100) and ambient colour (darkness veil tint)
  - Generate Map / Name / Card; generate-hazards toggle
      Frozen path: Starship Deck / Space Station / Derelict / Template Deck
      etc. via `generators/*` (do not edit for Auto-Paint work)
      Starship Deck / Space Station / Derelict use full bulkheads
      (thin halfBulkhead generation paused; half walls remain palette
      hand-place tiles — see docs/tiles.md)
      Template Deck: tip-anchored Template Piece walls (locked placer)
      Deck tile styles: Tools → Generator Editor
  - New construction path: Tools → Auto-Paint Ruleset Editor → Generate Map
      (see §8 Auto-Paint)

Episode (Properties → Map)
  - Name, episode card
  - Briefing, outro, outro (abandoned / failed), stardate

Template Pieces (Assets → Tiles)
  - Tip-anchored pieces from `templatePieces.json` (32px tip grid preferred)
  - Paint / Move / multi-brush; rotation; DEV catalogue CRUD
  - Used by Template Deck Generate Map and Auto-Paint Template 32 packing

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
  - Hazard brush intensity in Properties
  - Generate hazards with map (Map tab toggle)

Ground items / elevated surfaces
  - Inventory Objects palette → groundItemPlacements (pack snap: 4 large or 16 small per tile)
  - Place or Move onto a tile with `surface` (crate, table, barCounter,
    epsControl, cellBunk) writes optional `on: { tile: [x, y] }`; onto an
    item with `surface` (e.g. equipmentCase) writes `on: { placement: id }`
  - GroundItemInspector shows derived Elevation Z and support label
  - Clicking an item selects it by the pixels it draws (maps/propPick.js), in
    Explore and the editor: the frontmost sprite with alpha above 16/255 under
    the pointer wins, and clicks through transparent padding reach what is
    behind. Same sprite list and draw order as the board. A hit on a drawn
    item selects that item even when Ground is the active layer; a locked or
    hidden Furniture layer still cannot be selected.
    (Z is never authored)
  - Painting a prop onto an existing surface cell appends `stackOver`
    (crate-on-crate); erase pops the top layer first
  - Moving a supporting item carries its complete descendant support subtree
    atomically; moving a tile carries the whole cell (`floorUnder`, rotation,
    every `stackOver` layer) plus item subtrees supported by that cell
  - Invalid, duplicate, cyclic, incompatible, or dangling support records are
    rejected during map validation/load instead of being silently normalized
  - `surface` / item `surface` catalogues stay in tiles.json / items.json
  - Session drop/pickup is runtime-only (not map-authored)

Challenge objects (board)
  - Teal C markers; Move on Map / Reset Position
  - Drag with Move tool
  - Edit Covers on board
  - Object Inspector is placement-focused; full edit in Object Editor

View presentation
  - See-through blocks, tile animations, lighting (shadows + darkness),
    placement surfaces (tile tops and item tops an object can rest on),
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


7) GENERATOR EDITOR (Vite DEV) — frozen for Auto-Paint work
------------------------------
  - Tools → Generator Editor
  - File: Save / Load styles; Preview Generate Map
  - Edits deck Generate Map styles for Starship Deck, Research Lab,
    Alien Vessel via sprite pickers (floor / wall / corner / door / crate /
    machinery / hazard); Template Deck style → templateDeckStyle.json
  - Corner: optional wall sprite placed at every L/T junction after generate
  - Variations for the style’s Wall tile: share + multi-select panel/tile
    fitting sprites (geometric corners stay plain, then Corner applies)
  - Save → deckGenerators.json + generatedWallVariants.json
  - Preview on open map when Location matches (same as Generate Map)
  - Derelict inherits Starship Deck paint; station / Klingon / New Location
    still code-only
  - Do not change `generators/*` / Template Deck placer to “fix” Auto-Paint;
    use Auto-Paint packing instead


8) AUTO-PAINT RULESET EDITOR (Vite DEV) — current generator path
---------------------------------------
  - Tools → Auto-Paint Ruleset Editor
  - File: Load from Disk / Save Ruleset / Revert / Generate Map / Back
  - Toolbar: Rules | Map view toggles; Save / Revert / Generate Map /
    Show all; Grid + size + options (shared with main Dev Edit)
  - Left rail always visible: ruleset pick, label, environment, Template
    Pieces palette (same catalogue as Assets → Tiles); Show all adds
    Starship wall tiles for larger walls
  - Rules view: floor / wall / corner / hull / doorway role slots
    (drops resolve Template Pieces → wall/floor tiles)
  - Map view: open map board inside this tool (does not jump to main Dev Edit)
  - Generate Map: applies draft in memory, runs Auto-Paint layout into the
    open document, switches to Map view
      Template 32: deck room grid + `templateWall` underlay + doorways +
      floorUnder + **128 / 64 / 32** tip packing (`placeWallRuns.js`)
      Corners = 32×32 posts (also 32-long stubs); does not call frozen
      `placeTemplateWalls`
  - Edit → Toggle Auto-Paint: paint floors; walls rebuild from footprint
  - Edit → Rebuild Auto-Paint Walls: regenerate auto walls from floors
  - Save ruleset → autoPaintRulesets.json (`/__autopaint`)
  - Map JSON optional `autoPaint` block (regions, generated/manual/suppressed
    wall keys). Full behaviour: `docs/auto-paint.md`

Sub-editor File menus (all Tools full-screens)
  - Shared `subEditorFileMenus` / `mapEmbeddedEditorMenus`
  - Conversation / Story / Generator / Auto-Paint / Character: own data Save/Load
  - Objective / Object: Load Map / Save Map / Save Map As (map-embedded)

--------------------------------------------------------------------------------
FEATURE MATRIX (compact)
--------------------------------------------------------------------------------

Complete
  1  Tile painting / palette (incl. DEV tileset authoring / PNG import)
  1b Template Piece paint / multi-brush / DEV catalogue CRUD
  1c Multi-brush Place Tiles (checked thumbs cycle while painting)
  2  Tile rotation
  3  Map resize / size presets
  4  Location / biome / weather
  5  Ambient light (+ ambient colour; Selection emissive / emit colour)
  6  Episode name / card
  7  Generate Map / Name / Card (frozen locations; Template Deck included)
  7b Deck generator styles (Generator Editor; three deck Locations + Template Deck style)
  7c Auto-Paint Ruleset Editor + Generate Map (128/64/32 packing; Rules/Map views)
  7d Auto-Paint floor brush / rebuild / promote / suppress wall cells
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
  - New frozen Generate Map Location types / station-cave-surface generator params
    (deck styles only in Generator Editor; Auto-Paint still uses shared deck grid)
  - Auto-Paint-native room layouts, smarter door frames, props/furnishings
  - Elevation / gizmos (Levels window still a placeholder)

Shipped since baseline audit (document in summary; matrix ids not yet re-audited)
  - Map layers Ground / Walls / Furniture / Characters / Markers; Null; floorUnder; undo/redo
  - Template Pieces under Assets → Tiles; Bulkhead 32 wall tiles for Auto-Paint
  - Auto-Paint subsystem (rulesets, assemble, generate, placeWallRuns)
  - Sub-editor top File menus

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

6) Auto-Paint Generate Map ≠ frozen Generate Map
   - Tools → Auto-Paint Ruleset Editor → Generate Map uses Auto-Paint packing
   - Properties → Map → Generate Map / Generator Editor still use frozen
     `generators/*` (including Template Deck’s locked placer)
   - Do not edit frozen generators to fix Auto-Paint wall visuals

7) Rules vs Map in Auto-Paint Ruleset Editor
   - Rules / Map toolbar buttons switch the right pane only
   - Left Template Pieces palette stays; Grid settings are shared with Dev Edit
   - Back to Map exits to the main board (generated map already on the document)

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
  - (DEV UI exists) Auto-Paint rulesets → autoPaintRulesets.json via Ruleset Editor
  - (DEV UI exists) Template Pieces     → templatePieces.json via Assets palette

--------------------------------------------------------------------------------
PRIMARY SOURCE FILES
--------------------------------------------------------------------------------

Editor shell
  MapEditorScreen.jsx, EditorMenuBar.jsx, EditorToolbar.jsx,
  EditorPalette.jsx, EditorPropertiesPanel.jsx, MapProperties.jsx,
  AssetProperties.jsx, EditorFloatWindow.jsx, EditorOverviewWindow.jsx,
  EditorLayersWindow.jsx, EditorLevelsWindow.jsx, EditorGridOptions.jsx,
  EditorSubScreen.jsx, editorSubMenus.js, useEditorTools.js,
  useMapDocument.js, EditorInspectors.jsx, EditorBoard.jsx

Inspectors
  NpcInspector.jsx, HazardInspector.jsx, DestructibleInspector.jsx,
  GroundItemInspector.jsx, ObjectInspector.jsx, MarkerInspector.jsx

Sub-editors
  ObjectEditorScreen.jsx, ObjectActionFields.jsx, ObjectiveEditorScreen.jsx,
  ConversationEditorScreen.jsx, StoryEditorScreen.jsx,
  GeneratorEditorScreen.jsx, AutoPaintRulesetEditorScreen.jsx,
  CharacterLibraryScreen.jsx

Auto-Paint
  src/maps/autoPaint/ (index, rulesets, generate, assemble, placeWallRuns,
  wallsTemplate, wallsTiles, templatePalette, templateWallCoverage),
  autoPaintFiles.js, autoPaintRulesets.json

Format I/O
  mapFormat.js, mapFiles.js, mapEdits.js, templatePieces.js,
  effectsFiles.js, effectsStore.cjs

Lighting / tiles
  tileArt.js, mapShadows.js, tileSpriteInfo.js, tileEffects.json,
  canvasTiles.js, pixi/mapLayers.js

Runtime
  explorationState.js, challengeObjects.js, awareness.js, NPCController.js,
  world/environment.js, objectAuthoring.js, objectEffects.js,
  conversationActions.js, combat/encounters.js

Content
  maps/*.json, conversations/, challenges.json, npcs.json, awareness.json,
  hazards.json, destructibles.json, items.json, encounters.json, characters.json,
  autoPaintRulesets.json, templatePieces.json, tiles.json

--------------------------------------------------------------------------------
RELATED DOCS
--------------------------------------------------------------------------------

  docs/editor-authoring-audit.md   — full status matrix and phase history
  docs/auto-paint.md               — Auto-Paint behaviour, packing, frozen boundary
  docs/design-tracker.md           — design decisions (scattered editor notes)
  docs/prototype-rules.md          — Book vs Prototype rules (incl. authoring)
  docs/tiles.md                    — tiles, Template Deck, Bulkhead 32, lighting
  docs/world-objects.md            — world objects / environment
  docs/project-status.md           — high-level aspect board
