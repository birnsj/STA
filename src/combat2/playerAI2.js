// Combat Type 2 Auto Combat: a simple AI that plays the player character, one action at a time, through the same
// rules and previews a person uses. Implementer default (not a designed behaviour), greedy priorities per Action Point:
// 1. Push an adjacent enemy onto the live EPS grating.  2. Overload the conduit while an enemy stands on the grating.
// 3. Attack when the best available attack succeeds at least half the time.  4. Otherwise move to the best nearby tile
// (an attack from there, cover from shooters, out of melee reach).  5. Otherwise attack anyway, or end the turn.
import { getEnemies, getMoveOptions, getPhaser, getPlayer, isActiveUnit, isHazardTile, previewMelee, previewPush, previewRanged, previewInteract, TUNING } from './actions2.js'
import { findCover } from './cover2.js'
import { getThreatTiles } from './intents2.js'
import { distance, tileKey } from './map2.js'

const ATTACK_THRESHOLD = 0.5

function bestAttackFrom(state, from, enemies) {
  const player = getPlayer(state)
  const hasPhaser = Boolean(getPhaser(player.character))
  let best = null
  for (const enemy of enemies) {
    const options = [{ actionId: 'melee', preview: previewMelee(state, player.id, enemy.id, { from }) }]
    if (hasPhaser) options.push({ actionId: 'phaser', preview: previewRanged(state, player.id, enemy.id, { from }) })
    for (const { actionId, preview } of options) {
      if (!preview.available) continue
      // Prefer the likelier hit; between equals, finish off the more wounded enemy.
      const score = preview.chance + enemy.hits * 0.01
      if (!best || score > best.score) best = { actionId, targetId: enemy.id, chance: preview.chance, score }
    }
  }
  return best
}

function tileScore(state, tile, enemies, meleeThreat) {
  const attack = bestAttackFrom(state, tile, enemies)
  const shooters = enemies.filter((enemy) => enemy.role === 'ranged')
  const covered = shooters.filter((enemy) => findCover(state.map, tile, enemy.position)).length
  return (attack ? attack.chance * 10 : 0) + covered * 3 - (meleeThreat.has(tileKey(tile)) ? 4 : 0)
}

// Returns the next reducer action for the player character.
export function choosePlayerAction(state) {
  const player = getPlayer(state)
  const enemies = getEnemies(state).filter(isActiveUnit)
  if (state.ap <= 0 || !enemies.length) return { type: 'endTurn' }

  const hazardPush = enemies.find((enemy) => {
    const push = previewPush(state, player.id, enemy.id)
    return push.available && push.intoHazard
  })
  if (hazardPush) return { type: 'act', actionId: 'push', targetId: hazardPush.id }

  if (previewInteract(state, player.id).available && enemies.some((enemy) => isHazardTile(state, enemy.position))) return { type: 'act', actionId: 'interact' }

  const attackNow = bestAttackFrom(state, player.position, enemies)
  if (attackNow && attackNow.chance >= ATTACK_THRESHOLD) return { type: 'act', actionId: attackNow.actionId, targetId: attackNow.targetId }

  const meleeThreat = new Set(
    enemies
      .filter((enemy) => enemy.role !== 'ranged')
      .flatMap((enemy) => getThreatTiles(state, enemy.id))
      .map(tileKey),
  )
  const here = tileScore(state, player.position, enemies, meleeThreat)
  let bestMove = null
  for (const entry of getMoveOptions(state, player.id).values()) {
    if (entry.steps === 0) continue
    const score = tileScore(state, entry.position, enemies, meleeThreat) - entry.steps * 0.05
    if (!bestMove || score > bestMove.score) bestMove = { position: entry.position, score }
  }
  if (bestMove && bestMove.score > here) return { type: 'move', destination: bestMove.position }

  if (attackNow) return { type: 'act', actionId: attackNow.actionId, targetId: attackNow.targetId }

  // Nothing useful nearby: with a full turn left, close the distance toward the nearest enemy; else end the turn.
  if (state.ap === TUNING.actionPoints) {
    const gap = (position) => Math.min(...enemies.map((enemy) => distance(position, enemy.position)))
    const closer = [...getMoveOptions(state, player.id).values()].filter((entry) => entry.steps > 0).sort((a, b) => gap(a.position) - gap(b.position))[0]
    if (closer && gap(closer.position) < gap(player.position)) return { type: 'move', destination: closer.position }
  }
  return { type: 'endTurn' }
}
