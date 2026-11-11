// Pick Template Piece assembly (Template 32 tip art) vs wall-tile assembly (bulkhead family).
import { assembleWallsFromFloors as assembleTemplateWallsFromFloors } from './wallsTemplate.js'
import { assembleWallsFromFloors as assembleTileWallsFromFloors } from './wallsTiles.js'
import { rulesetUsesTemplatePieces } from './templatePalette.js'

export function assembleWallsFromFloors(map, ruleset, options = {}) {
  if (rulesetUsesTemplatePieces(ruleset)) {
    return assembleTemplateWallsFromFloors(map, ruleset, options)
  }
  return assembleTileWallsFromFloors(map, ruleset, options)
}
