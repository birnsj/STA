import { formatPosition, updateCombatant } from '../combatLog.js'
import { canMove, canSprint, getPathTo } from '../combatMovement.js'
import { facingToward } from '../combatSelectors.js'
import { canTakeCover } from '../coverSystem.js'
import { actionsLeftText, spendTurnAction } from '../turnActions.js'
import { CombatAction } from './CombatAction.js'

// Move (minor) and Sprint (major), Book p.288. Ending next to a cover object puts the mover in cover.
export class MoveAction extends CombatAction {
  unavailableReason(state, actor) {
    const allowed = this.type === 'move' ? canMove(state, actor) : canSprint(state, actor)
    return allowed ? null : `Can't ${this.type} now.`
  }

  apply(state, actor, params) {
    const kind = this.type
    const path = getPathTo(state, actor, params.destination, kind)
    if (!path || path.length < 2) return state
    const destination = path[path.length - 1]
    const steps = path.length - 1
    const decided = this.decide(state, actor, params, { path })
    const inCover = canTakeCover(state.map, destination)
    const moved = updateCombatant(decided.state, actor.id, { position: destination, inCover, facing: facingToward(path[path.length - 2], destination) })
    const used = spendTurnAction(moved, actor.id, kind)
    const turn = { ...used.turn, ...(kind === 'move' ? { moved: true } : { sprinted: true }) }
    const next = { ...used, turn, lastMove: { key: state.log.length, combatantId: actor.id, path } }
    return this.record(next, actor, { inCover }, [
      ...decided.lines,
      `${kind === 'move' ? 'Move' : 'Sprint'} ${steps} ${steps === 1 ? 'tile' : 'tiles'} (${actionsLeftText(turn)})`,
      `Path: ${path.map(formatPosition).join(' > ')}`,
      ...(inCover ? [`${actor.character.name} is in cover (next to a cover object).`] : actor.inCover ? [`${actor.character.name} leaves cover.`] : []),
    ])
  }

  // The combatant standing on destination, in cover if the tile gives it (cover follows from the tile). Not limited to
  // the acting combatant or to tiles in reach: the AI also places enemies where they could be next turn.
  hypothetical(state, combatant, { destination }) {
    return { ...state, combatants: { ...state.combatants, [combatant.id]: { ...combatant, position: destination, inCover: canTakeCover(state.map, destination) } } }
  }
}
