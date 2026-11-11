// Auto-Paint: floor footprint → wall assembly. Independent of Generate Map / generators/*.
export {
  AUTO_PAINT_ENVIRONMENTS,
  AUTO_PAINT_WALL_MODES,
  autoPaintRulesetEpochOf,
  defaultAutoPaintRulesetId,
  getAutoPaintRuleset,
  listAutoPaintRulesets,
  putAutoPaintRulesetLocal,
  removeAutoPaintRulesetLocal,
  replaceAutoPaintRulesetsLocal,
  resolveAutoPaintRuleset,
  validateAutoPaintRuleset,
} from './rulesets.js'
export { assembleWallsFromFloors, tipKeyOf } from './wallsTemplate.js'
export { collectFloorKeys, exteriorUnderlayKeys, floorIdsForRuleset } from './topology.js'

import { getAutoPaintRuleset } from './rulesets.js'
import { assembleWallsFromFloors, tipKeyOf } from './wallsTemplate.js'
import { paintFloor, removeTemplatePiece } from '../mapEdits.js'

/** Paint one floor cell then rebuild walls for the default region (one logical Auto-Paint step). */
export function autoPaintFloorCell(map, position, rulesetId, { regionId = 'region-1', random = Math.random } = {}) {
  const ruleset = getAutoPaintRuleset(rulesetId)
  if (!ruleset) return { map, error: 'No Auto-Paint ruleset.' }
  const painted = paintFloor(map, position, ruleset.floors.defaultTile, {})
  if (painted.error) return painted
  const next = assembleWallsFromFloors(painted.map !== map ? painted.map : map, ruleset, { regionId, random })
  return { map: next }
}

/** Rebuild walls from current floors without painting. */
export function rebuildAutoPaintWalls(map, rulesetId, options = {}) {
  const ruleset = getAutoPaintRuleset(rulesetId ?? map.autoPaint?.rulesetId)
  if (!ruleset) return { map, error: 'No Auto-Paint ruleset.' }
  return { map: assembleWallsFromFloors(map, ruleset, options) }
}

function withRegionPatch(map, pieceId, patchRegion) {
  if (!map.autoPaint?.regions?.length) return map
  const regions = map.autoPaint.regions.map((region) => {
    const touches =
      (region.generatedPieceIds ?? []).includes(pieceId) ||
      (region.manualPieceIds ?? []).includes(pieceId) ||
      (map.templatePiecePlacements ?? []).some((entry) => entry.id === pieceId && entry.autoPaint)
    if (!touches) return region
    return patchRegion(region)
  })
  return { ...map, autoPaint: { ...map.autoPaint, regions } }
}

/** Mark a template piece as manually edited so Rebuild leaves it (and its tip) alone. */
export function promoteTemplatePieceManual(map, pieceId) {
  const entry = (map.templatePiecePlacements ?? []).find((piece) => piece.id === pieceId)
  const list = (map.templatePiecePlacements ?? []).map((piece) =>
    piece.id === pieceId ? { ...piece, autoPaint: false } : piece,
  )
  let next = { ...map, templatePiecePlacements: list }
  if (!next.autoPaint?.regions?.length) return next
  next = withRegionPatch(next, pieceId, (region) => {
    const generated = (region.generatedPieceIds ?? []).filter((id) => id !== pieceId)
    const manual = new Set(region.manualPieceIds ?? [])
    manual.add(pieceId)
    return { ...region, generatedPieceIds: generated, manualPieceIds: [...manual] }
  })
  // Tip stays occupied by the kept piece; blockedTips in assemble covers it.
  void entry
  return next
}

/**
 * Remove a template piece and, if it was Auto-Paint-owned, suppress that tip so Rebuild
 * does not recreate a piece there.
 */
export function removeAutoPaintTemplatePiece(map, pieceId) {
  const entry = (map.templatePiecePlacements ?? []).find((piece) => piece.id === pieceId)
  if (!entry) return map
  const tip = tipKeyOf(entry.position)
  const owned =
    entry.autoPaint === true ||
    (map.autoPaint?.regions ?? []).some(
      (region) => (region.generatedPieceIds ?? []).includes(pieceId) || (region.manualPieceIds ?? []).includes(pieceId),
    )
  let next = removeTemplatePiece(map, pieceId)
  if (!owned || !next.autoPaint?.regions?.length) return next
  const regions = next.autoPaint.regions.map((region) => {
    const suppressed = new Set(region.suppressedTipKeys ?? [])
    suppressed.add(tip)
    return {
      ...region,
      generatedPieceIds: (region.generatedPieceIds ?? []).filter((id) => id !== pieceId),
      manualPieceIds: (region.manualPieceIds ?? []).filter((id) => id !== pieceId),
      suppressedTipKeys: [...suppressed],
    }
  })
  return { ...next, autoPaint: { ...next.autoPaint, regions } }
}

/** Mark an underlay cell as manual so Rebuild does not restore/replace it. */
export function promoteUnderlayManual(map, position) {
  if (!map.autoPaint?.regions?.length) return map
  const key = `${position.x},${position.y}`
  const regions = map.autoPaint.regions.map((region) => {
    const generated = (region.generatedUnderlayKeys ?? []).filter((entry) => entry !== key)
    const manual = new Set(region.manualUnderlayKeys ?? [])
    if ((region.generatedUnderlayKeys ?? []).includes(key)) manual.add(key)
    return { ...region, generatedUnderlayKeys: generated, manualUnderlayKeys: [...manual] }
  })
  return { ...map, autoPaint: { ...map.autoPaint, regions } }
}
