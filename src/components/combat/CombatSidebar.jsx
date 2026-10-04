import actionData from '../../data/adaptation/combat/actions.json'
import { getMovementTiles } from '../../combat/movementSystem.js'
import { describeRange } from '../../combat/weaponSystem.js'
import { TASK_DICE } from '../../rules/taskResolver.js'
import { ACTION_ICONS } from './actionIcons.js'
import ActionPoints from './ActionPoints.jsx'
import CombatPortrait from './CombatPortrait.jsx'
import HitPips from './HitPips.jsx'

const ACTIONS = Object.fromEntries(actionData.actions.map((action) => [action.id, action]))

const ICONS = ACTION_ICONS

const STATUS_LABEL = { active: '', incapacitated: 'Incapacitated', injured: 'Injured / Defeated' }

export function SelectedCharacterPanel({ combatant }) {
  if (!combatant) return null
  const { character } = combatant
  const { attributes, disciplines } = character
  return (
    <section className="combat-panel selected-panel">
      <CombatPortrait character={character} className="selected-portrait" />
      <div className="selected-info">
        <h2 className="selected-name">{character.name}</h2>
        <p className="selected-stats">
          Control {attributes.control} &middot; Security {disciplines.security}
          <br />
          Daring {attributes.daring} &middot; Fitness {attributes.fitness}
          <br />
          Move {getMovementTiles(character)} &middot; {combatant.inCover ? 'In Cover' : 'No Cover'}
        </p>
      </div>
    </section>
  )
}

// turn: the acting character's turn, its AP shown as a countdown in the header (null when it isn't the player's turn).
// movement: { left, total } tiles one Move can cover, shown on the Move row.
// autoEndMs: the turn is about to end by itself (0 AP); End Turn shows a bar running down over this many ms (null = not ending).
// End Turn is a small button under the list: the turn ends by itself at 0 AP, so it is only for ending early.
// unavailableReasons: { [actionId]: text } shown as the tooltip of an action that is greyed out for a reason the player can fix.
export function ActionsPanel({ availability, unavailableReasons = {}, mode, weapon, canCycleWeapon, autoEndMs, turn, movement, onSelect, onCycleWeapon }) {
  const endTurn = ACTIONS.endTurn
  return (
    <section className="combat-panel actions-panel">
      <h2 className="combat-panel-title actions-panel-title">
        Actions
        {turn && <ActionPoints turn={turn} className="is-compact" />}
      </h2>
      <ul className="actions-list">
        {weapon && (
          <li className="actions-row actions-weapon-row">
            <span className="actions-weapon-label">Weapon</span>
            <button type="button" className="actions-weapon" disabled={!canCycleWeapon} onClick={onCycleWeapon} title="Change weapon">
              {weapon.name}
              {canCycleWeapon && <span aria-hidden="true"> &rsaquo;</span>}
            </button>
          </li>
        )}
        {actionData.panel.filter((id) => id !== 'endTurn').map((id) => {
          const action = ACTIONS[id]
          const enabled = action.implemented && availability[id]
          const cost = `${action.apCost} AP`
          return (
            <li key={id} className="actions-row">
              <button
                type="button"
                className={`actions-button${mode === id ? ' is-selected' : ''}`}
                disabled={!enabled}
                title={!action.implemented ? 'Not in this prototype yet' : (unavailableReasons[id] ?? `${action.name} (${cost})${action.description ? `: ${action.description}` : ''}`)}
                onClick={() => onSelect(id)}
              >
                <svg className="actions-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d={ICONS[id]} />
                </svg>
                <span className="actions-name">{action.name}</span>
                {id === 'move' && movement && (
                  <span className={`actions-move-left${movement.left ? '' : ' is-empty'}`}>
                    {movement.left}/{movement.total}
                  </span>
                )}
                <span className="actions-slot">{cost}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        className="actions-end-turn"
        disabled={!availability.endTurn}
        title="End this turn now, giving up any AP left. The turn ends by itself at 0 AP."
        onClick={() => onSelect('endTurn')}
      >
        <svg className="actions-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d={ICONS.endTurn} />
        </svg>
        {endTurn.name}
        {autoEndMs && availability.endTurn && (
          <span key={autoEndMs} className="actions-auto-end" style={{ animationDuration: `${autoEndMs}ms` }} aria-hidden="true" />
        )}
      </button>
    </section>
  )
}

export function TargetPanel({ target }) {
  return (
    <section className="combat-panel target-panel">
      <h2 className="combat-panel-title">Target</h2>
      {target ? (
        <div className="target-body">
          <CombatPortrait character={target.character} className="target-portrait" />
          <div className="target-info">
            <span className="target-name">{target.character.name}</span>
            <span className="target-row">
              Hits <HitPips hits={target.hits} />
            </span>
            <span className={`target-row target-cover${target.inCover ? ' is-covered' : ''}`}>Cover: {target.inCover ? 'In Cover' : 'No Cover'}</span>
            {target.status !== 'active' && <span className="target-row target-status">{STATUS_LABEL[target.status]}</span>}
          </div>
        </div>
      ) : (
        <p className="combat-panel-empty">No target</p>
      )}
    </section>
  )
}

// The attack on the selected enemy; it is fired from the Stun / Deadly buttons next to the enemy on the map.
function AttackTask({ preview, helper }) {
  const { task, weapon } = preview
  const dice = TASK_DICE + (helper ? 1 : 0)
  return (
    <>
      <p className="task-line">
        {task.attribute.name} {task.attribute.value} + {task.discipline.name} {task.discipline.value}
      </p>
      <p className="task-line">Target Number {task.targetNumber}</p>
      <p className="task-line">Focus: {task.focus ? `${task.focus} (Aim rerolls both dice)` : 'none'}</p>
      <p className="task-line">
        Difficulty {task.difficulty}
        {preview.rangeModifier > 0 && <span className="task-note"> (range +{preview.rangeModifier})</span>}
        {preview.threatModifier > 0 && <span className="task-note"> (Threat +1)</span>}
      </p>
      <p className="task-line task-sub">
        {preview.band.name}, {preview.distance} tiles &middot; {describeRange(weapon)}
      </p>
      {preview.targetInCover && <p className="task-line task-sub">Target in cover: rolls Control + Security; Difficulty becomes the higher.</p>}
      {helper && <p className="task-line task-assist">Assisted by {helper.character.name}: +1d20</p>}
      {!preview.available && <p className="task-warning">{preview.reason}</p>}
      {preview.available && task.difficulty > dice && (
        <p className="task-warning">
          Needs {task.difficulty} successes from {dice} dice: cannot succeed.
        </p>
      )}
    </>
  )
}

const CONFIRM_LABEL = { move: 'Move', sprint: 'Sprint', assist: 'Assist' }

// The opening Ambush roll on the chosen Klingon; it is rolled from the Ambush button next to the Klingon on the map.
function AmbushTask({ ambush }) {
  if (!ambush?.target) return <p className="combat-panel-empty">Choose a Klingon to ambush</p>
  const { task } = ambush
  return (
    <>
      <p className="task-line">Ambush by {ambush.ambusher.character.name}</p>
      <p className="task-line">
        {task.attribute.name} {task.attribute.value} + {task.discipline.name} {task.discipline.value}
      </p>
      <p className="task-line">Target Number {task.targetNumber}</p>
      <p className="task-line">Focus: {task.focus ? `${task.focus} (free reroll)` : 'none'}</p>
      <p className="task-line">Difficulty {task.difficulty}</p>
      <p className="task-line task-sub">{ACTIONS.ambush.description}</p>
      {ambush.available ? <p className="task-line task-sub">Chance: {Math.round(ambush.chance * 100)}%</p> : <p className="task-warning">{ambush.reason}</p>}
    </>
  )
}

// The allies who can be assisted, as a pick list (one is pre-picked when there is only one).
function AssistTask({ allies, allyId, onAlly }) {
  return (
    <>
      <p className="task-line task-sub">{ACTIONS.assist.description}</p>
      <div className="assist-allies" role="group" aria-label="Ally to assist">
        {allies.map((ally) => (
          <button key={ally.id} type="button" className={`assist-ally${ally.id === allyId ? ' is-selected' : ''}`} onClick={() => onAlly(ally.id)}>
            {ally.character.name}
          </button>
        ))}
      </div>
    </>
  )
}

// confirm: { enabled, onConfirm }; movement: { left, total, sprintLeft, sprintTotal } tiles this turn; routeInCover: the chosen route ends next to cover
// assist: { allies, allyId, onAlly } for the Assist pick list, and helper: who is assisting the acting character's next attack.
// ambush: the opening Ambush preview on the chosen Klingon (mode 'ambush').
export function TaskPanel({ mode, isPlayerTurn, autoTurn, preview, movePath, routeInCover, movement, assist, ambush, confirm }) {
  let body
  if (!isPlayerTurn) body = <p className="combat-panel-empty">{autoTurn ? 'Auto Combat' : 'Enemy turn'}</p>
  else if (mode === 'ambush') body = <AmbushTask ambush={ambush} />
  else if (mode === 'attack' && preview?.task) body = <AttackTask preview={preview} helper={assist.helper} />
  else if (mode === 'assist') body = <AssistTask allies={assist.allies} allyId={assist.allyId} onAlly={assist.onAlly} />
  else if (mode === 'attack') body = <p className="combat-panel-empty">Select a target</p>
  else if (mode === 'move')
    body = (
      <>
        <p className="task-line">
          Movement {movement.left} / {movement.total} tiles left
        </p>
        <p className="task-line task-sub">
          {movePath ? `Route: ${movePath.length - 1} tiles${routeInCover ? ' - ends in cover' : ''}` : 'Choose a highlighted tile'}
        </p>
        <p className="task-line task-sub">{ACTIONS.move.description}</p>
      </>
    )
  else if (mode === 'sprint')
    body = (
      <>
        <p className="task-line">
          Sprint {movement.sprintLeft} / {movement.sprintTotal} tiles left
        </p>
        <p className="task-line task-sub">
          {movePath ? `Route: ${movePath.length - 1} tiles${routeInCover ? ' - ends in cover' : ''}` : 'Choose a highlighted tile'}
        </p>
        <p className="task-line task-sub">{ACTIONS.sprint.description}</p>
      </>
    )
  else body = <p className="combat-panel-empty">Choose an action, or click a unit on the map</p>

  const label = CONFIRM_LABEL[mode] ?? 'Confirm'
  return (
    <section className="combat-panel task-panel">
      <h2 className="combat-panel-title">Task</h2>
      <div className="task-body">{body}</div>
      <button type="button" className="task-confirm" disabled={!isPlayerTurn || !confirm.enabled} onClick={confirm.onConfirm}>
        {label}
      </button>
    </section>
  )
}
