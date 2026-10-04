// Random baseline for the Auto Combat test dropdown: any legal action, picked at random, as a floor to measure the other
// AIs against. The pick comes from the combat's seed and log length (not Math.random), so a seeded fight still replays
// exactly. Pending rolls are still answered, since the fight cannot continue otherwise.
import { canAfford, canAim, canMove, canSprint, getAssistableAllies, getOpponents, getReachable } from './combatState.js'
import { bestShot, injuryModesFor, pendingStep } from './combatAI.js'
import { deriveSeed, seededRandomInt } from '../rules/seededRandom.js'

// Keeps these picks apart from the combat's own roll sequence.
const SEED_SALT = 0x5bd1e995

export function randomStep(state, self) {
  if (state.pending) return pendingStep(state, self)
  const random = seededRandomInt(deriveSeed(state.seed ^ SEED_SALT, state.log.length * 4 + state.turn.ap))
  const pick = (list) => list[Math.floor(random() * list.length)]

  const shots = getOpponents(state, self)
    .map((target) => ({ target, shot: bestShot(state, self, target) }))
    .filter((option) => option.shot)
  const options = [{ type: 'endTurn', decision: 'End turn' }]
  if (canAfford(state, self, 'attack') && shots.length) {
    const { target, shot } = pick(shots)
    options.push({ type: 'attack', targetId: target.id, weaponId: shot.weapon.id, injuryMode: injuryModesFor(state, self, shot.weapon)[0], decision: `Attack ${target.character.name}` })
  }
  if (canAim(state, self) && shots.length) {
    const { target, shot } = pick(shots)
    options.push({ type: 'aim', targetId: target.id, weaponId: shot.weapon.id, decision: 'Aim' })
  }
  if (canMove(state, self)) {
    const tiles = [...getReachable(state, self).values()].filter((entry) => entry.steps > 0)
    if (tiles.length) options.push({ type: 'move', destination: pick(tiles).position, decision: 'Move' })
  }
  if (canSprint(state, self)) {
    const tiles = [...getReachable(state, self, 'sprint').values()].filter((entry) => entry.steps > 0)
    if (tiles.length) options.push({ type: 'sprint', destination: pick(tiles).position, decision: 'Sprint' })
  }
  if (canAfford(state, self, 'assist')) {
    const allies = getAssistableAllies(state, self)
    if (allies.length) {
      const ally = pick(allies)
      options.push({ type: 'assist', allyId: ally.id, decision: `Assist ${ally.character.name}` })
    }
  }
  return { ...pick(options), reason: `Random pick from ${options.length} legal actions.` }
}
