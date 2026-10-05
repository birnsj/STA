import { getActiveCombatant, getCombatantList, getTurnGroupRange, isActive, isTurnFinished } from '../../combat/combatState.js'
import CombatPortrait from './CombatPortrait.jsx'

// The fixed initiative queue, starting from the current turn group, so the portraits advance as turns are taken.
// Inside a party group the player picks the order: the acting member is enlarged and finished members are dimmed.
// hiddenIds: combatants the party can't perceive now (left out of the queue).
export default function TurnOrderStrip({ state, hiddenIds = null }) {
  const list = getCombatantList(state)
  const { start, ids: groupIds } = getTurnGroupRange(state)
  const activeId = getActiveCombatant(state).id
  const queue = [...list.slice(start), ...list.slice(0, start)].filter((combatant) => isActive(combatant) && !hiddenIds?.includes(combatant.id))
  return (
    <ol className="turn-strip" aria-label="Turn order">
      {queue.map((combatant, index) => {
        const inGroup = groupIds.length > 1 && groupIds.includes(combatant.id)
        const finished = inGroup && combatant.id !== activeId && isTurnFinished(state, combatant.id)
        return (
          <li
            key={combatant.id}
            className={`turn-strip-item ${combatant.side === 'player' ? 'is-player' : 'is-enemy'}${combatant.id === activeId ? ' is-current' : ''}${inGroup ? ' is-group' : ''}${finished ? ' is-done' : ''}`}
            title={`${combatant.character.name} (Daring ${combatant.character.attributes.daring}, Control ${combatant.character.attributes.control})${finished ? ' - done' : ''}`}
          >
            {index > 0 && <span className="turn-strip-arrow" aria-hidden="true" />}
            <CombatPortrait character={combatant.character} className="turn-strip-portrait" />
          </li>
        )
      })}
    </ol>
  )
}
