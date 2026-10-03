// Combat Type 2 enemy intentions: planned at the start of the player's turn and shown, then re-planned against the
// current map when the enemy acts, so anything the player changed (moving away, cover, a push, a discharge) counts.
// Kept deliberately simple (implementer default): each enemy makes at most one attack per turn; melee enemies close in,
// ranged enemies look for line of sight, preferring a firing tile where the player has no cover.
import { getBlockedKeys, getPlayer, isActiveUnit, previewMelee, previewRanged, TUNING } from './actions2.js'
import { distance, isSolid, lineOfSight, neighbours, pathFrom, reachableTiles, tileKey } from './map2.js'

const attackPreview = (state, enemy, targetId, from) =>
  enemy.role === 'ranged' ? previewRanged(state, enemy.id, targetId, { from, maxRange: enemy.weaponRange }) : previewMelee(state, enemy.id, targetId, { from })

function bestAttackTile(state, enemy, targetId, search) {
  let best = null
  for (const entry of search.values()) {
    const preview = attackPreview(state, enemy, targetId, entry.position)
    if (!preview.available) continue
    const score = [enemy.role === 'ranged' && preview.cover ? 1 : 0, entry.steps]
    if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && score[1] < best.score[1])) best = { entry, preview, score }
  }
  return best
}

// Returns { kind: 'melee' | 'shoot' | 'advance' | 'hold', targetId, path, attackFrom, preview }.
export function planEnemy(state, enemyId) {
  const enemy = state.units[enemyId]
  const player = getPlayer(state)
  if (!isActiveUnit(enemy) || !isActiveUnit(player)) return { kind: 'hold', targetId: null, path: [enemy.position], attackFrom: null }
  const blocked = getBlockedKeys(state, enemyId)
  const kind = enemy.role === 'ranged' ? 'shoot' : 'melee'

  const nearby = reachableTiles(state.map, enemy.position, TUNING.moveTiles, blocked)
  const attack = bestAttackTile(state, enemy, player.id, nearby)
  if (attack) return { kind, targetId: player.id, path: pathFrom(nearby, attack.entry.position), attackFrom: attack.entry.position, preview: attack.preview }

  // No attack this turn: spend both Action Points moving toward a tile it could attack from.
  const everywhere = reachableTiles(state.map, enemy.position, state.map.width * state.map.height, blocked)
  const goal = bestAttackTile(state, enemy, player.id, everywhere)
  if (!goal) return { kind: 'hold', targetId: player.id, path: [enemy.position], attackFrom: null }
  const fullPath = pathFrom(everywhere, goal.entry.position)
  return { kind: 'advance', targetId: player.id, path: fullPath.slice(0, TUNING.moveTiles * TUNING.actionPoints + 1), attackFrom: null }
}

export function describeIntent(intent, state) {
  const target = intent.targetId ? state.units[intent.targetId].character.name : ''
  const moves = intent.path.length > 1
  if (intent.kind === 'melee') return `${moves ? 'Move \u2192 ' : ''}Melee ${target}`
  if (intent.kind === 'shoot') return `${moves ? 'Move \u2192 ' : ''}Disruptor ${target}`
  if (intent.kind === 'advance') return `Advance toward ${target}`
  return 'Hold position'
}

// Every tile this enemy could attack this turn (presentation: the threat overlay while hovering an enemy).
export function getThreatTiles(state, enemyId) {
  const enemy = state.units[enemyId]
  if (!isActiveUnit(enemy)) return []
  const reach = [...reachableTiles(state.map, enemy.position, TUNING.moveTiles, getBlockedKeys(state, enemyId)).values()].map((entry) => entry.position)
  const threatened = new Map()
  if (enemy.role === 'ranged') {
    for (let y = 0; y < state.map.height; y++) {
      for (let x = 0; x < state.map.width; x++) {
        const tile = { x, y }
        if (isSolid(state.map, tile)) continue
        if (reach.some((from) => distance(from, tile) <= enemy.weaponRange && lineOfSight(state.map, from, tile).clear)) threatened.set(tileKey(tile), tile)
      }
    }
  } else {
    reach.forEach((from) => neighbours(from).forEach((tile) => !isSolid(state.map, tile) && threatened.set(tileKey(tile), tile)))
  }
  return [...threatened.values()]
}

export function planAllEnemies(state) {
  return Object.fromEntries(state.order.filter((id) => state.units[id].side === 'enemy').map((id) => [id, planEnemy(state, id)]))
}
