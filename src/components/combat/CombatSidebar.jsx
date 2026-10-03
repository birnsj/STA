import actionData from '../../data/adaptation/combat/actions.json'
import { getMovementTiles } from '../../combat/movementSystem.js'
import { describeRange, getInjuryMode, getWeapon } from '../../combat/weaponSystem.js'
import { TASK_DICE } from '../../rules/taskResolver.js'
import ActionPoints from './ActionPoints.jsx'
import CombatPortrait from './CombatPortrait.jsx'
import HitPips from './HitPips.jsx'

const ACTIONS = Object.fromEntries(actionData.actions.map((action) => [action.id, action]))

const ICONS = {
  attack: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 8a4 4 0 1 0 0.01 0',
  aim: 'M4 12h6M14 12h6M12 4v6M12 14v6',
  move: 'M5 7l5 5-5 5M12 7l5 5-5 5',
  takeCover: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z',
  assist: 'M8 9a2 2 0 1 0 0.01 0M16 9a2 2 0 1 0 0.01 0M4 19c0-3 2-5 4-5s4 2 4 5M12 19c0-3 2-5 4-5s4 2 4 5',
  useItem: 'M4 8h16v11H4zM9 8V5h6v3',
  endTurn: 'M19 12H7M11 7l-5 5 5 5',
}

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

// highlightEndTurn: the acting character has used both actions, so End Turn is the only thing left.
// turn: the acting character's used actions, shown as a countdown in the header (null when it isn't the player's turn).
export function ActionsPanel({ availability, mode, weapon, canCycleWeapon, highlightEndTurn, turn, onSelect, onCycleWeapon }) {
  return (
    <section className="combat-panel actions-panel">
      <h2 className="combat-panel-title actions-panel-title">
        Actions
        {turn && <ActionPoints turn={turn} className="is-compact" />}
      </h2>
      <ul className="actions-list">
        {actionData.panel.map((id) => {
          const action = ACTIONS[id]
          const enabled = action.implemented && availability[id]
          return (
            <li key={id} className="actions-row">
              <button
                type="button"
                className={`actions-button${mode === id ? ' is-selected' : ''}${id === 'endTurn' && highlightEndTurn && enabled ? ' is-highlight' : ''}`}
                disabled={!enabled}
                title={action.implemented ? `${action.name} (${action.slot})${action.description ? `: ${action.description}` : ''}` : 'Not in this prototype yet'}
                onClick={() => onSelect(id)}
              >
                <svg className="actions-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d={ICONS[id]} />
                </svg>
                <span className="actions-name">{action.name}</span>
                {action.slot !== 'free' && <span className="actions-slot">{action.slot === 'minor' ? 'Minor' : 'Major'}</span>}
              </button>
              {id === 'attack' && weapon && (
                <button type="button" className="actions-weapon" disabled={!canCycleWeapon} onClick={onCycleWeapon} title="Change weapon">
                  {weapon.name}
                  {canCycleWeapon && <span aria-hidden="true"> &rsaquo;</span>}
                </button>
              )}
            </li>
          )
        })}
      </ul>
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
            <span className={`target-row target-cover${target.inCover ? ' is-covered' : ''}`}>Cover: {target.inCover ? 'Cover' : 'No Cover'}</span>
            {target.status !== 'active' && <span className="target-row target-status">{STATUS_LABEL[target.status]}</span>}
          </div>
        </div>
      ) : (
        <p className="combat-panel-empty">No target</p>
      )}
    </section>
  )
}

function AttackTask({ preview, injuryMode, onInjuryMode }) {
  const { task, weapon } = preview
  return (
    <>
      <p className="task-line">
        {task.attribute.name} {task.attribute.value} + {task.discipline.name} {task.discipline.value}
      </p>
      <p className="task-line">Target Number {task.targetNumber}</p>
      <p className="task-line">Focus: {task.focus ?? 'none'}</p>
      <p className="task-line">
        Difficulty {task.difficulty}
        {preview.rangeModifier > 0 && <span className="task-note"> (range +{preview.rangeModifier})</span>}
        {preview.threatModifier > 0 && <span className="task-note"> (Threat +1)</span>}
      </p>
      <p className="task-line task-sub">
        {preview.band.name}, {preview.distance} tiles &middot; {describeRange(weapon)}
      </p>
      {preview.targetInCover && <p className="task-line task-sub">Target in cover: rolls Control + Security; Difficulty becomes the higher.</p>}
      <div className="injury-toggle" role="group" aria-label="Injury mode">
        {weapon.injuryModes.map((modeId) => (
          <button key={modeId} type="button" className={`injury-button is-${modeId}${injuryMode === modeId ? ' is-selected' : ''}`} onClick={() => onInjuryMode(modeId)}>
            {getInjuryMode(modeId).name}
          </button>
        ))}
      </div>
      {!preview.available && <p className="task-warning">{preview.reason}</p>}
      {preview.available && task.difficulty > TASK_DICE && (
        <p className="task-warning">
          Needs {task.difficulty} successes from {TASK_DICE} dice: cannot succeed.
        </p>
      )}
    </>
  )
}

const CONFIRM_LABEL = { attack: 'Fire', move: 'Move', aim: 'Aim', takeCover: 'Take Cover' }

// confirm: { enabled, onConfirm }
export function TaskPanel({ mode, isPlayerTurn, autoTurn, preview, movePath, movement, injuryMode, onInjuryMode, confirm }) {
  let body
  if (!isPlayerTurn) body = <p className="combat-panel-empty">{autoTurn ? 'Auto Combat' : 'Enemy turn'}</p>
  else if (mode === 'attack' && preview?.task) body = <AttackTask preview={preview} injuryMode={injuryMode} onInjuryMode={onInjuryMode} />
  else if (mode === 'attack') body = <p className="combat-panel-empty">Select a target</p>
  else if (mode === 'move')
    body = (
      <>
        <p className="task-line">Movement {movement} tiles</p>
        <p className="task-line task-sub">{movePath ? `Route: ${movePath.length - 1} tiles` : 'Choose a highlighted tile'}</p>
      </>
    )
  else if (mode === 'aim') body = <p className="task-line task-sub">{ACTIONS.aim.description}</p>
  else if (mode === 'takeCover') body = <p className="task-line task-sub">{ACTIONS.takeCover.description}</p>
  else body = <p className="combat-panel-empty">Choose an action</p>

  const label = (mode === 'attack' && getWeapon(preview?.weapon?.id)?.type === 'melee' ? 'Strike' : CONFIRM_LABEL[mode]) ?? 'Confirm'
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
