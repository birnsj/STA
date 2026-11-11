# Auto-Paint

**New map-construction generator** for painting floor footprints and assembling walls. Independent of Generate Map and the Generator Editor — those stay frozen so existing game maps keep working.

Editor overview / menu placement: `docs/editor-authoring-summary.md` (§8 Auto-Paint; Tools File menus).

## Current behaviour

1. **Tools → Auto-Paint Ruleset Editor** — palette is the Dev Edit **Template Pieces** catalogue (`templatePieces.json`). Default ruleset **Template 32** stores **Template Piece ids** in wall roles (straight / long / corner / door frame; optional hull). Hover shows piece **footprint** (corner 32×32). **Show all** adds Starship wall tiles for larger true cell walls. Save → `autoPaintRulesets.json` (`/__autopaint`).
2. **Generate Map** — builds into the open map and shows it in **Map** view (left palette stays; **Rules** / **Map** toggles). Grid settings are shared with main Dev Edit. Template 32: deck room grid + `templateWall` underlay + doorways + floorUnder + **128 / 64 / 32** packing (`placeWallRuns.js`) using the ruleset kit. Does not call frozen `placeTemplateWalls`.
3. **Edit → Toggle Auto-Paint** — paint floors; walls rebuild from the footprint.
4. **Edit → Rebuild Auto-Paint Walls** — regenerate auto walls from current floors.

Bulkhead-style rulesets: assign full-cell tiles (`bulkhead`, …) into Straight / Corner — tile assembly path (`wallsTiles.js`).

Manual Auto-Paint wall cells can be promoted so Rebuild leaves them alone. Erasing suppresses that cell.

## Packing

| Role | Tip length |
| --- | --- |
| Straight long | 128 |
| Straight | 64 |
| Corner / stub | 32×32 |

Hull / doorFrame **null** → no Template Deck fill-in (rim uses straight/corner; doorways stay underlay-only). Packing tracks **underlay-cell coverage** and tip-grid edge continuity: corner posts sit on the SE tip; −X/−Y arms leave a half-cell gap that a south-edge tip `(x+0.5,y+1)` / east-edge tip `(x+1,y+0.5)` fill closes. Never reuse `tipAlongX/Y` at junctions (collides with the corner tip).

## Collision

`templateWall` underlay is **not** full-cell solid for movement. Bodies collide with Template Piece **footprints** (32-thick edge strips) via `circleHitsTemplateWalls` / exploration `isClear`. Sight still uses full-cell `blocksSight` on the underlay. Combat steps also reject paths that cross a piece strip (`isClearLine`).

## Floor under walls

Underlay wall cells store the ruleset default floor in `floorUnder`. Empty `templateWall` cells paint that floor on the board (walls stay Template Piece overlays). Combat’s `toBattleMap` keeps `floorUnder` + placements so the battlefield matches exploration.

## Map JSON

Optional `autoPaint` block (`rulesetId`, regions with floor / underlay / piece / suppressed keys).

## Not yet

Smarter doorway logic, props / furnishings, Auto-Paint-native layouts beyond the shared deck grid.

## Frozen (do not edit for Auto-Paint)

Generate Map locations, Generator Editor, Template Deck generator (`src/maps/generators/*`), `templateDeckStyle`.
