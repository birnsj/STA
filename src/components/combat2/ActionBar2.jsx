import { ACTION_IDS, ACTION_SPECS, buildActionTask, getActionAvailability, TUNING } from '../../combat2/actions2.js'
import { getAttributeName, getDisciplineName } from '../../character/runtimeCharacter.js'

function subtitle(actionId, character) {
  if (actionId === 'move') return `Up to ${TUNING.moveTiles} tiles`
  const spec = ACTION_SPECS[actionId]
  const task = buildActionTask(character, actionId)
  return `${getAttributeName(spec.attribute)} + ${getDisciplineName(spec.discipline)} = TN ${task.targetNumber}`
}

const DETAIL = { move: 'Reposition', phaser: `Range ${TUNING.phaserRange}, needs sight`, melee: 'Adjacent target', push: 'Adjacent, 1 tile', interact: 'EPS conduit' }

export default function ActionBar2({ state, character, actionId, onSelect, onEndTurn }) {
  const playerTurn = state.phase === 'player' && !state.outcome
  return (
    <div className="c2-actions" role="toolbar" aria-label="Actions">
      {ACTION_IDS.map((id) => {
        const availability = getActionAvailability(state, id)
        return (
          <button
            key={id}
            type="button"
            className={`c2-action${actionId === id ? ' is-selected' : ''}${availability.available ? '' : ' is-unavailable'}`}
            disabled={!playerTurn || state.ap <= 0}
            title={availability.available ? `${ACTION_SPECS[id].name}: 1 AP` : availability.reason}
            aria-pressed={actionId === id}
            onClick={() => onSelect(actionId === id ? null : id)}
          >
            <span className="c2-action-name">{ACTION_SPECS[id].name}</span>
            <span className="c2-action-sub">{subtitle(id, character)}</span>
            <span className="c2-action-detail">{availability.available ? DETAIL[id] : availability.reason}</span>
            <span className="c2-action-cost">1 AP</span>
          </button>
        )
      })}
      <button type="button" className="c2-action is-end" disabled={!playerTurn} onClick={onEndTurn}>
        <span className="c2-action-name">End Turn</span>
        <span className="c2-action-sub">Enemies act</span>
        <span className="c2-action-detail">{state.ap > 0 ? `${state.ap} AP unused` : 'No AP left'}</span>
        <span className="c2-action-cost">0 AP</span>
      </button>
    </div>
  )
}
