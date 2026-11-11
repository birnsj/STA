# Auto-Paint

**New map-construction generator** for painting floor footprints and assembling wall **tiles**. Independent of Generate Map and the Generator Editor — those stay frozen so existing game maps keep working.

## Current behaviour

1. **Tools → Auto-Paint Ruleset Editor** — palette is the Dev Edit **Template Pieces** catalogue only (`templatePieces.json` via `templatePieceGroups` / `editorTemplatePaletteItems`). No parallel tile dump. Layer tabs. Default ruleset **Template 32**: drops resolve to wall tiles (`wall32` / `wall32Corner`) for grid placement. **Show all** adds Starship wall tiles for larger walls. Save → `autoPaintRulesets.json` (`/__autopaint`).
2. **Generate Map** (Ruleset Editor toolbar) — replaces the open map with an Auto-Paint layout and shows it **inside the Ruleset Editor** (does not jump back to main Dev Edit). Top bar **Rules** / **Map** switches the right pane; the left palette stays. Grid toggle, size, and options match main Dev Edit (shared settings). **Back to Map** exits to Dev Edit. For **Template 32**: deck room grid (`makeDeckGenerator`) with `templateWall` underlay + doorways, floor under every wall cell, then **128 / 64 / 32 packing** (`placeWallRuns.js`): long = 128, short = 64, corner post = 32 stub. Custom sizes snap to Template Deck presets. Does not call frozen `placeTemplateWalls`. Bulkhead-style rulesets still assemble true wall tiles.
3. **Edit → Toggle Auto-Paint** — paint floors with the Auto-Paint brush.
4. Paint floors on a Null / blank map. Walls rebuild: Template 32 → tip pieces + underlay; bulkhead rulesets → wall tiles on exterior Null.
5. **Edit → Rebuild Auto-Paint Walls** — regenerates auto walls from current floors.

Larger / true tile walls: assign full-cell tiles (`bulkhead`, `plainBulkhead`, …) into the Straight / Corner roles (tile assembly path).

Manual edits of Auto-Paint wall cells can be promoted so Rebuild leaves them alone. Erasing an Auto-Paint wall suppresses that cell so Rebuild does not recreate it.

## Collision

Same as other wall tiles (`halfBulkhead` / `bulkhead`): full-cell solid for pathing and sight. Accurate half-cell collision is out of scope.

## Floor under walls

Template 32 / Template Deck: underlay wall cells store the ruleset default floor in `floorUnder` (same as locked Generate Map) so gaps don’t show Null. Erase/rebuild restores that remembered cell. True tile-wall rulesets still remember the previous cell as-is.

## Map JSON

Optional `autoPaint` block (`rulesetId`, regions with `floorKeys`, `generatedWallKeys`, `manualWallKeys`, `suppressedWallKeys`). Legacy underlay/tip keys still parse into the wall-key fields.

## Ruleset ids

Save/load validates tile ids against the catalogue. Unknown ids are reported; they are not silently replaced.

## Not yet

Smarter doorway frames, props / furnishings, richer Auto-Paint-native layouts beyond the shared deck grid.

## Frozen (do not edit for Auto-Paint)

Generate Map locations, Generator Editor, Template Deck generator (`src/maps/generators/*`), `templateDeckStyle`.
