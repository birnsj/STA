# Auto-Paint

Prototype construction system for painting floor footprints and assembling walls. **Independent of Generate Map and the Generator Editor** — those stay unchanged.

## Phase 1 (current)

1. **Tools → Auto-Paint Ruleset Editor** — pick floor tile and Template Piece wall roles; Save writes `src/data/adaptation/maps/autoPaintRulesets.json` (dev server `/__autopaint`).
2. **Edit → Toggle Auto-Paint** — enables Place Tiles with the Auto-Paint brush.
3. Paint floors on a Null / blank map. Walls rebuild as solid `templateWall` underlay + 32px Template Pieces.
4. **Edit → Rebuild Auto-Paint Walls** — regenerates auto walls from current floors.

Manual moves/rotates of Auto-Paint pieces clear their `autoPaint` flag so Rebuild leaves them alone. Deleting an Auto-Paint piece suppresses its tip so Rebuild does not recreate it.

## Collision (known limitation)

Same model as Template Deck: pathing/sight use full-cell solid `templateWall` underlay on **exterior Null** cells beside the floor. Overlay art is ~32px thick. Accurate half-cell collision would need runtime pathing changes outside Auto-Paint scope; legacy maps are unchanged.

## Floor under walls

When Auto-Paint places underlay on a Null cell, `floorUnder` stores the previous cell id (`null`). Erase/rebuild restores Null — it does not invent floor tiles under walls.

## Map JSON

Optional `autoPaint` block (regions, ruleset id, generated vs manual keys, `suppressedTipKeys`). Template placements may include `"autoPaint": true`.

## Ruleset ids

Save/load validates tile and Template Piece ids against the catalogues. Unknown ids are reported; they are not silently replaced.

## Not yet

Doors/openings, interior partitions, props, full layout generation, tile-mode walls.
