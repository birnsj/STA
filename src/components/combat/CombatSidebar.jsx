import actionData from '../../data/adaptation/combat/actions.json'
import { getMovementTiles } from '../../combat/movementSystem.js'
import { describeRange, getInjuryMode } from '../../combat/weaponSystem.js'
import { ACTION_TYPE_NAMES, AMBUSH_FOCUSES, isAccurate } from '../../combat/combatState.js'
import { TASK_DICE } from '../../rules/taskResolver.js'
import BonusDicePicker from '../BonusDicePicker.jsx'
import { RecommendationLine, TaskBlockers, TaskDevDetails, TaskDice, TaskDifficulty, TaskFocus, TaskFormula, TaskModifiers } from '../task/TaskMath.jsx'
import { criticalText, formulaText, successesText } from '../task/taskText.js'
import { ACTION_ICONS } from './actionIcons.js'
import CombatPortrait from './CombatPortrait.jsx'
import ConditionTrack from './ConditionTrack.jsx'

const ACTIONS = Object.fromEntries(actionData.actions.map((action) => [action.id, action]))

const ICONS = ACTION_ICONS

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
          {combatant.guard && <> &middot; Guarded</>}
        </p>
        <ConditionTrack character={character} condition={combatant.condition} showCategory />
      </div>
    </section>
  )
}

// Actions and movement left are shown above the figures and on the party cards, not repeated here.
// autoEndMs: the turn is about to end by itself (no action left); End Turn shows a bar running down over this many ms (null = not ending).
// End Turn is a small button under the list: the turn ends by itself with no action left, so it is only for ending early.
// unavailableReasons: { [actionId]: text } shown as the tooltip of an action that is greyed out for a reason the player can fix.
export function ActionsPanel({ availability, unavailableReasons = {}, mode, weapon, canCycleWeapon, autoEndMs, onSelect, onCycleWeapon }) {
  const endTurn = ACTIONS.endTurn
  return (
    <section className="combat-panel actions-panel">
      <h2 className="combat-panel-title actions-panel-title">Actions</h2>
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
          const cost = ACTION_TYPE_NAMES[action.type]
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
        title="End this turn now, giving up any action left. The turn ends by itself once the Major and Minor actions are used."
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
              <ConditionTrack character={target.character} condition={target.condition} showCategory />
            </span>
            <span className={`target-row target-cover${target.inCover ? ' is-covered' : ''}`}>Cover: {target.inCover ? 'In Cover' : 'No Cover'}</span>
            {target.guard && <span className="target-row target-cover is-covered">Guarded: attacks +1 Difficulty</span>}
          </div>
        </div>
      ) : (
        <p className="combat-panel-empty">No target</p>
      )}
    </section>
  )
}

// The defender's side of an opposed attack (Book p.256, p.289; the cover rule is a VIDEOGAME ADAPTATION, see
// combatState attackDifficulty): their own Attribute + Department, and how their successes set the Difficulty.
function OppositionBlock({ opposition, target, difficulty }) {
  const cover = opposition.when === 'targetInCover'
  return (
    <div className="tm-block tm-opposed">
      <p className="tm-focus-title">{cover ? 'Opposed: target in cover rolls' : 'Opposed: target defends'}</p>
      <p className="tm-opposed-who">
        {target.character.name}: {formulaText(opposition.task)}
      </p>
      <p className="tm-help">
        {cover
          ? `Their successes become your Difficulty if higher than ${difficulty}.`
          : 'Their successes set your Difficulty (plus your other changes).'}
        {opposition.task.focus ? ` Focus ${opposition.task.focus}: critical ${criticalText(opposition.task)}.` : ''}
      </p>
    </div>
  )
}

// The attack on the selected enemy; it is fired from the Stun / Deadly buttons next to the enemy on the map, or with
// Fire once a mode was picked from the acting character's ring.
// attackMode: the firing mode picked from the acting character's ring (null when firing from the enemy's buttons).
function AttackTask({ preview, helper, dicePurchase, attackMode }) {
  const { task, weapon } = preview
  const bonusDice = dicePurchase.value.bonusDice
  const dice = TASK_DICE + bonusDice
  const maxSuccesses = dice * 2 + (helper ? 2 : 0)
  const mode = attackMode ? getInjuryMode(attackMode) : null
  const injuries = mode ? preview.injuries?.filter((injury) => injury.type === attackMode) : preview.injuries
  return (
    <>
      {mode && (
        <p className={`task-attack-mode is-${attackMode}`}>
          <span className="task-attack-mode-name">
            {weapon.name} &mdash; {mode.name}
          </span>
          <span className="task-attack-mode-detail">
            Severity {weapon.severity}
            {mode.generatesThreat && ' · Threat +1'}
          </span>
        </p>
      )}
      <TaskBlockers task={task} />
      <TaskFormula task={task} />
      <TaskDifficulty
        difficulty={task.difficulty}
        lines={preview.difficultyLines}
        note={preview.opposition ? (preview.opposition.when === 'targetInCover' ? `At least ${successesText(task.difficulty)}; the defender's roll can raise it.` : "Set by the defender's roll.") : null}
      />
      {preview.opposition && <OppositionBlock opposition={preview.opposition} target={preview.target} difficulty={task.difficulty} />}
      <TaskFocus task={task} focusOptions={weapon.focuses ?? []} />
      <TaskModifiers equipment={preview.equipment} effects={preview.effects} />
      <TaskDice task={task} assist={helper ? `${helper.via === 'direct' ? 'Commander assists' : 'Assisted by'} ${helper.character.name}: +1d20 (counts only if you score a success)` : null} />
      <p className="task-line task-sub">Aim: rerolls {isAccurate(weapon) ? `up to two dice (${weapon.name} is Accurate)` : 'one die'}</p>
      {injuries?.map((injury) => (
        <p key={injury.type} className="task-line task-sub">
          On a hit ({injury.type === 'deadly' ? 'Deadly' : 'Stun'}): Severity {injury.severity}
          {injury.protection > 0 && ` (${weapon.name} ${injury.baseSeverity} - Protection ${injury.protection}, minimum 1)`}
        </p>
      ))}
      <p className="task-line task-sub">
        {preview.band.name}, {preview.distance} tiles &middot; {describeRange(weapon)}
      </p>
      {preview.available && <BonusDicePicker resources={dicePurchase.resources} value={dicePurchase.value} onChange={dicePurchase.onChange} />}
      {!preview.available && <p className="task-warning">{preview.reason}</p>}
      {preview.available && task.difficulty > maxSuccesses && (
        <p className="task-warning">
          Needs {task.difficulty} successes; at most {maxSuccesses} are possible from {dice}d20: cannot succeed.
        </p>
      )}
      {preview.available && task.difficulty <= maxSuccesses && task.difficulty > dice + (helper ? 1 : 0) && (
        <p className="task-warning">Needs {task.difficulty} successes: only critical successes can reach it.</p>
      )}
    </>
  )
}

const CONFIRM_LABEL = { move: 'Move', sprint: 'Sprint', assist: 'Assist', guard: 'Guard', firstAid: 'First Aid', direct: 'Direct', interact: 'Attempt' }

// A pick list (who to guard or treat, which ally to direct, which object approach).
function Picker({ label, options, value, onPick }) {
  return (
    <div className="assist-allies" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`assist-ally${option.id === value ? ' is-selected' : ''}`}
          disabled={option.disabled}
          title={option.title}
          onClick={() => onPick(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// The character math of any combat task before the roll (Guard, First Aid, a challenge object's task): Attribute +
// Department, Target Number, focus, the Difficulty and where it comes from, the dice and who assists.
// task: { label, cost, prepared (taskPreparation.js), assist: { name, label, task } | null, available, reason,
//   focusOptions: the focuses the task accepts }.
function CombatTaskMath({ task, dicePurchase }) {
  const { prepared } = task
  const { task: roll } = prepared
  return (
    <>
      <p className="task-line">
        {task.label} <span className="task-note">({task.cost} action)</span>
      </p>
      <TaskBlockers blockers={prepared.blockers} task={roll} />
      <TaskFormula task={roll} />
      <TaskDifficulty difficulty={prepared.difficulty} lines={prepared.difficultyLines} />
      <TaskFocus task={roll} focusOptions={task.focusOptions ?? []} />
      <TaskModifiers equipment={prepared.equipment} effects={prepared.effects} />
      <TaskDice
        task={roll}
        assist={task.assist ? `${task.assist.name} adds 1d20 (${task.assist.label}, TN ${task.assist.task.targetNumber}); it counts only if you score a success.` : null}
      />
      {task.available && <BonusDicePicker resources={dicePurchase.resources} value={dicePurchase.value} onChange={dicePurchase.onChange} />}
      {!task.available && task.reason && <p className="task-warning">{task.reason}</p>}
    </>
  )
}

// combatTask (modes guard / firstAid / direct / interact): { picker: { label, options, value, onPick }, intro, task,
// note, routine: the chosen object action needs no roll }.
function CombatTask({ combatTask, dicePurchase }) {
  const { picker, intro, task, note, routine } = combatTask
  return (
    <>
      {intro && <p className="task-line task-sub">{intro}</p>}
      {picker && picker.options.length > 0 && <Picker {...picker} />}
      {recommendationNote(combatTask)}
      {routine && (
        <div className="tm-block">
          <p className="tm-no-roll">No roll required</p>
          <p className="tm-help">Routine action: it simply happens.</p>
        </div>
      )}
      {task?.prepared && <CombatTaskMath task={task} dicePurchase={dicePurchase} />}
      {task && !task.prepared && task.reason && <p className="task-warning">{task.reason}</p>}
      {note && <p className="task-line task-sub">{note}</p>}
    </>
  )
}

// Who in the party is best at the object task being considered (their cards carry the highlight).
function recommendationNote(combatTask) {
  const { recommendation, nameOf, task } = combatTask
  if (!recommendation || !task?.prepared) return null
  return <RecommendationLine recommendation={recommendation} nameOf={nameOf} task={task.prepared.task} />
}

// The opening Ambush roll on the chosen Klingon; it is rolled from the Ambush button next to the Klingon on the map.
function AmbushTask({ ambush }) {
  if (!ambush?.target) return <p className="combat-panel-empty">Choose a Klingon to ambush</p>
  const { task } = ambush
  return (
    <>
      <p className="task-line">Ambush by {ambush.ambusher.character.name}</p>
      <TaskBlockers task={task} />
      <TaskFormula task={task} />
      <TaskDifficulty difficulty={task.difficulty} />
      <TaskFocus task={task} focusOptions={AMBUSH_FOCUSES} />
      {task.focus && <p className="task-line task-sub">Focus also gives one free reroll of a failed die.</p>}
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

// An AI-controlled turn in Auto Combat: what it decided and why, and the task it rolls, in the same task math as a
// player's turn. aiTurn: { actorName, decision, reason, targetName, weaponName, task (prepared task with its
// difficulty) | null }.
function AiTurnTask({ aiTurn }) {
  const { actorName, decision, reason, targetName, weaponName, task } = aiTurn
  return (
    <>
      <p className="task-line">
        {actorName}
        {decision ? `: ${decision}` : ' is deciding'}
      </p>
      {(targetName || weaponName) && <p className="task-line task-sub">{[weaponName, targetName && `at ${targetName}`].filter(Boolean).join(' ')}</p>}
      {reason && <p className="task-line task-sub">{reason}</p>}
      {task && (
        <>
          <TaskBlockers task={task} />
          <TaskFormula task={task} />
          {task.difficulty != null && <TaskDifficulty difficulty={task.difficulty} />}
          <TaskFocus task={task} />
          <TaskDice task={task} />
        </>
      )}
    </>
  )
}

// confirm: { enabled, onConfirm }; routeInCover: the chosen route ends next to cover
// assist: { allies, allyId, onAlly } for the Assist pick list, and helper: who is assisting the acting character's next attack.
// ambush: the opening Ambush preview on the chosen Klingon (mode 'ambush').
// dicePurchase: { resources, value, onChange } for buying bonus d20s on the attack or task (BonusDicePicker).
// combatTask: the Guard / First Aid / Direct / object task being set up (see CombatTask).
// attackMode: the firing mode chosen for the next attack from the acting character's ring (see AttackTask).
// dev: { actorName } to show the raw task details (Debug open), or null.
// rolling: a roll is on the dice panel, which shows its math; the panel doesn't repeat it.
// aiTurn: the acting AI's decision and task during Auto Combat (see AiTurnTask), or null.
export function TaskPanel({ mode, isPlayerTurn, autoTurn, preview, movePath, routeInCover, assist, ambush, confirm, dicePurchase, combatTask = null, confirmLabel = null, attackMode = null, dev = null, rolling = false, aiTurn = null }) {
  let body
  let devTask = null
  if (!isPlayerTurn && aiTurn) body = <AiTurnTask aiTurn={aiTurn} />
  else if (!isPlayerTurn) body = <p className="combat-panel-empty">{autoTurn ? 'Auto Combat' : 'Enemy turn'}</p>
  else if (rolling) body = <p className="combat-panel-empty">Rolling: see the dice panel</p>
  else if (mode === 'ambush') body = <AmbushTask ambush={ambush} />
  else if (combatTask) {
    body = <CombatTask combatTask={combatTask} dicePurchase={dicePurchase} />
    const prepared = combatTask.task?.prepared
    if (prepared) devTask = { prepared, task: { ...prepared.task, difficulty: prepared.difficulty }, action: combatTask.task.label }
  } else if (mode === 'attack' && preview?.task) {
    body = <AttackTask preview={preview} helper={assist.helper} dicePurchase={dicePurchase} attackMode={attackMode} />
    devTask = {
      prepared: { possible: preview.blockers.length === 0, blockers: preview.blockers, difficultyLines: preview.difficultyLines, equipment: preview.equipment, effects: preview.effects, ignoreComplications: 0, bonusMomentum: 0 },
      task: preview.task,
      action: `${preview.weapon.name}${attackMode ? ` (${getInjuryMode(attackMode).name})` : ''} at ${preview.target.character.name}${preview.opposition ? '; opposed: Difficulty set after the defender rolls' : ''}`,
    }
  }
  else if (mode === 'assist') body = <AssistTask allies={assist.allies} allyId={assist.allyId} onAlly={assist.onAlly} />
  else if (mode === 'attack') body = <p className="combat-panel-empty">Select a target</p>
  else if (mode === 'move')
    body = (
      <>
        <p className="task-line">
          {movePath ? `Route: ${movePath.length - 1} tiles${routeInCover ? ' - ends in cover' : ''}` : 'Choose a highlighted tile'}
        </p>
        <p className="task-line task-sub">{ACTIONS.move.description}</p>
      </>
    )
  else if (mode === 'sprint')
    body = (
      <>
        <p className="task-line">
          {movePath ? `Route: ${movePath.length - 1} tiles${routeInCover ? ' - ends in cover' : ''}` : 'Choose a highlighted tile'}
        </p>
        <p className="task-line task-sub">{ACTIONS.sprint.description}</p>
      </>
    )
  else body = <p className="combat-panel-empty">Choose an action, or click a unit on the map</p>

  const label = confirmLabel ?? CONFIRM_LABEL[mode] ?? 'Confirm'
  return (
    <section className="combat-panel task-panel">
      <h2 className="combat-panel-title">Task</h2>
      <div className="task-body">
        {body}
        {dev && devTask && (
          <TaskDevDetails
            prepared={devTask.prepared}
            task={devTask.task}
            bonusDice={dicePurchase.value.bonusDice}
            rows={[
              ['Character', dev.actorName],
              ['Action', devTask.action],
              ['Momentum cost (dice)', dev.purchase?.momentum ?? 0],
              ['Threat cost (dice)', dev.purchase?.threatAdded ?? 0],
            ]}
          />
        )}
      </div>
      <button type="button" className="task-confirm" disabled={!isPlayerTurn || !confirm.enabled} onClick={confirm.onConfirm}>
        {label}
      </button>
    </section>
  )
}
