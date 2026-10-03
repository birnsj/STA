// Builds the Combat Type 2 overlay description (which tiles and units to highlight) from the combat state and UI state.
// Presentation logic only; the rules come from combat2/actions2.js and cover2.js.
import { getMoveOptions, getPlayer, isActiveUnit, previewPlayerAction, TUNING } from '../../combat2/actions2.js'
import { findCover } from '../../combat2/cover2.js'
import { getThreatTiles } from '../../combat2/intents2.js'
import { distance, isSolid, lineOfSight, neighbours, pathFrom, tileKey } from '../../combat2/map2.js'

const TARGETED_ACTIONS = ['phaser', 'melee', 'push']

function tilesWithin(map, centre, maxDistance) {
  const found = []
  for (let y = Math.max(0, centre.y - maxDistance); y <= Math.min(map.height - 1, centre.y + maxDistance); y++) {
    for (let x = Math.max(0, centre.x - maxDistance); x <= Math.min(map.width - 1, centre.x + maxDistance); x++) {
      if (!isSolid(map, { x, y }) && distance(centre, { x, y }) <= maxDistance) found.push({ x, y })
    }
  }
  return found
}

const keySet = (positions) => new Set(positions.map(tileKey))

// The enemy the action is aimed at: the one under the pointer, else the one clicked last.
export function getFocusTargetId(state, ui) {
  const hovered = ui.hoverUnitId && state.units[ui.hoverUnitId]
  if (hovered && hovered.side === 'enemy' && isActiveUnit(hovered)) return hovered.id
  const chosen = ui.targetId && state.units[ui.targetId]
  return chosen && isActiveUnit(chosen) ? chosen.id : null
}

export function buildOverlay(state, ui) {
  const player = getPlayer(state)
  const playerTurn = state.phase === 'player' && !state.outcome
  const overlay = { tileSets: {}, unitMarks: { [player.id]: { selected: true } }, maxHits: TUNING.maxHits, showIntents: playerTurn, hoverKey: ui.hoverTile ? tileKey(ui.hoverTile) : null }
  const targetId = getFocusTargetId(state, ui)

  // The player shows a shield while a planned enemy shot would face cover.
  const shotsInCover = Object.values(state.intents).filter((intent) => intent.kind === 'shoot' && intent.attackFrom && findCover(state.map, player.position, intent.attackFrom))
  if (playerTurn && shotsInCover.length) overlay.unitMarks[player.id].cover = true

  // Threat zones show while browsing (no action chosen) or from the intent panel, so they never hide an action's overlay.
  const hoveringEnemy = !ui.actionId && ui.hoverUnitId && state.units[ui.hoverUnitId]?.side === 'enemy'
  const threatId = ui.threatId ?? (hoveringEnemy ? ui.hoverUnitId : null)
  if (playerTurn && threatId) overlay.tileSets.threat = keySet(getThreatTiles(state, threatId))

  if (!playerTurn || !ui.actionId) return overlay

  if (ui.actionId === 'move') {
    const options = getMoveOptions(state, player.id)
    const reach = [...options.values()].filter((entry) => entry.steps > 0).map((entry) => entry.position)
    overlay.tileSets.reach = keySet(reach)
    overlay.tileSets.noreach = keySet(tilesWithin(state.map, player.position, TUNING.moveTiles).filter((tile) => !options.has(tileKey(tile))))
    if (ui.hoverTile && overlay.tileSets.reach.has(tileKey(ui.hoverTile))) overlay.movePath = pathFrom(options, ui.hoverTile)
  }

  if (ui.actionId === 'phaser') {
    const inRange = tilesWithin(state.map, player.position, TUNING.phaserRange)
    overlay.tileSets.range = keySet(inRange.filter((tile) => lineOfSight(state.map, player.position, tile).clear))
    overlay.tileSets.nosight = keySet(inRange.filter((tile) => !lineOfSight(state.map, player.position, tile).clear))
  }

  if (ui.actionId === 'melee' || ui.actionId === 'push') overlay.tileSets.adjacent = keySet(neighbours(player.position).filter((tile) => !isSolid(state.map, tile)))

  if (ui.actionId === 'interact') {
    overlay.tileSets.interact = keySet(neighbours(state.epsControl).filter((tile) => !isSolid(state.map, tile)))
    overlay.tileSets.hazardpreview = keySet(state.hazard.tiles)
  }

  if (TARGETED_ACTIONS.includes(ui.actionId)) {
    Object.values(state.units)
      .filter((unit) => unit.side === 'enemy' && isActiveUnit(unit))
      .forEach((enemy) => {
        const preview = previewPlayerAction(state, ui.actionId, enemy.id)
        overlay.unitMarks[enemy.id] = { target: preview.available ? 'valid' : 'invalid', cover: ui.actionId === 'phaser' && Boolean(preview.cover) }
      })
    if (targetId) {
      const target = state.units[targetId]
      const preview = previewPlayerAction(state, ui.actionId, targetId)
      if (ui.actionId === 'phaser') overlay.sightLine = { from: player.position, to: target.position, ...lineOfSight(state.map, player.position, target.position) }
      if (ui.actionId === 'push' && preview.destination) overlay.pushArrow = { from: target.position, to: preview.destination, valid: preview.available }
    }
  }
  return overlay
}
