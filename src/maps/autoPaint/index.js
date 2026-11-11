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
export { assembleWallsFromFloors } from './assemble.js'
export {
  finishAutoPaintWalls,
  noteAutoPaintWallCleared,
  promoteWallCellManual,
  removeAutoPaintWallCell,
} from './wallsTiles.js'
export { pieceKitFromRuleset, rulesetUsesTemplatePieces } from './templatePalette.js'
export { collectFloorKeys, exteriorUnderlayKeys, floorIdsForRuleset } from './topology.js'

import { getAutoPaintRuleset } from './rulesets.js'
import { assembleWallsFromFloors } from './assemble.js'
import { paintFloor } from '../mapEdits.js'

/** Paint one floor cell then rebuild walls for the default region (one logical Auto-Paint step). */
export function autoPaintFloorCell(map, position, rulesetId, { regionId = 'region-1' } = {}) {
  const ruleset = getAutoPaintRuleset(rulesetId)
  if (!ruleset) return { map, error: 'No Auto-Paint ruleset.' }
  const painted = paintFloor(map, position, ruleset.floors.defaultTile, {})
  if (painted.error) return painted
  const next = assembleWallsFromFloors(painted.map !== map ? painted.map : map, ruleset, { regionId })
  return { map: next }
}

/** Rebuild walls from current floors without painting. */
export function rebuildAutoPaintWalls(map, rulesetId, options = {}) {
  const ruleset = getAutoPaintRuleset(rulesetId ?? map.autoPaint?.rulesetId)
  if (!ruleset) return { map, error: 'No Auto-Paint ruleset.' }
  return { map: assembleWallsFromFloors(map, ruleset, options) }
}

export { generateAutoPaintMap } from './generate.js'
export {
  packTipCells,
  packUnderlayRun,
  placePackedWallPieces,
  WALL_LEN_LONG,
  WALL_LEN_SHORT,
  WALL_LEN_STUB,
  WALL_TIP_PX,
} from './placeWallRuns.js'
export { ensureTemplateWallCoverage, snapAutoPaintGenerateSize } from './templateWallCoverage.js'

/** @deprecated Template-piece path retired — wall cells use promoteWallCellManual. */
export function promoteTemplatePieceManual(map, _pieceId) {
  return map
}

/** @deprecated Template-piece path retired — wall cells use removeAutoPaintWallCell. */
export function removeAutoPaintTemplatePiece(map, _pieceId) {
  return map
}

export function tipKeyOf(position) {
  return `${position.x},${position.y}`
}

