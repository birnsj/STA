import { useEffect, useState } from 'react'
import { ADAPTATION_MOMENTUM_SPENDS, canAimReroll, canAssistReroll } from '../../combat/combatState.js'
import { injuryTypeName, minorDefeatText } from '../../rules/personalCondition.js'
import { getWeapon } from '../../combat/weaponSystem.js'
import { evaluateStaDie } from '../../rules/taskResolver.js'
import { criticalText, dieVerdict, formulaText, successesText } from '../task/taskText.js'

// Presentation only: a freshly rolled die flicks through random numbers before stopping on the value the rules already
// rolled (seeded, in combatState). Divided by the Auto Combat speed so it stops before the result is shown.
const ROLL_MS = 550
const FACE_MS = 35

// Mounted again (new key) for every new roll or reroll, so each one rolls once. task: the STA 2E task the die is rolled
// against (its target number, critical range and complication range).
function Die({ value, task, speed = 1 }) {
  const [face, setFace] = useState(((value * 7) % 20) + 1)
  const [rolling, setRolling] = useState(true)
  useEffect(() => {
    const tick = setInterval(() => setFace(Math.floor(Math.random() * 20) + 1), FACE_MS)
    const land = setTimeout(() => {
      clearInterval(tick)
      setRolling(false)
    }, ROLL_MS / speed)
    return () => {
      clearInterval(tick)
      clearTimeout(land)
    }
  }, [speed])
  if (rolling) return <span className="roll-die is-rolling">{face}</span>
  const die = evaluateStaDie(task, value)
  const look = die.critical ? ' is-critical' : die.successes ? ' is-success' : ' is-fail'
  return <span className={`roll-die${look}${die.complication ? ' is-twenty' : ''}`}>{value}</span>
}

// Under each die: what it scored (Success / Critical / Failure / Complication, and how many successes).
function DieScore({ value, task }) {
  const verdict = dieVerdict(evaluateStaDie(task, value))
  return <span className={`roll-die-score is-${verdict.kind}`}>{verdict.short}</span>
}

// The attack being rolled (with any rerolls still open to the player) or the last attack's result.
// awaitingChoice: the roll would miss and a reroll is open, so it waits for a reroll or No Reroll instead of resolving itself.
export default function RollPanel({ state, speed = 1, playerControls, awaitingChoice, onReroll, onResolve }) {
  const roll = state.pending ?? state.result
  if (!roll) return null
  const ambush = roll.kind === 'ambush'
  // Guard, First Aid and challenge object tasks: no weapon, maybe no target.
  const taskRoll = roll.kind === 'task'
  // A routine object action has no roll to show.
  if (taskRoll && !roll.task) return null
  // One id per roll (attacks and other tasks are counted separately), plus rerolls per die.
  const rollId = ambush ? 'ambush' : taskRoll ? `task${roll.key}` : state.stats.attacks
  const dieKey = (index) => `${rollId}-${index}-${roll.rerolls.filter((reroll) => reroll.index === index).length}`
  const attacker = state.combatants[roll.attackerId]
  const target = roll.targetId ? state.combatants[roll.targetId] : null
  const values = state.pending ? state.pending.dice : roll.dice.map((die) => die.value)
  const { task, opposition } = roll
  const pending = Boolean(state.pending)
  const aimRerollOpen = (index) =>
    pending && playerControls && awaitingChoice && !evaluateStaDie(task, values[index]).successes && canAimReroll(state.pending, index)
  const canMomentumReroll = ADAPTATION_MOMENTUM_SPENDS && pending && playerControls && awaitingChoice && state.resources.momentum > 0
  const assistRerollOpen = (index) => pending && playerControls && awaitingChoice && !evaluateStaDie(task, values[index]).successes && canAssistReroll(state.pending)
  const { injury } = roll
  // A Minor NPC stores no Injury: the hit leaves it unconscious (Stun) or dead (Deadly).
  const minorOutcome = injury?.decided === 'suffered' && target && minorDefeatText(target.condition)
  const injuryOutcome = injury && (minorOutcome ? `${minorOutcome} (Minor NPC: no Injury)` : { pending: 'Avoid Injury?', avoided: 'Injury avoided', suffered: 'Defeated' }[injury.decided])
  const resultText = ambush ? (roll.passed ? 'Ambushed: automatic hit' : 'Spotted: Klingons act first') : taskRoll ? (roll.passed ? 'Success' : 'Failure') : roll.passed ? 'Hit' : 'Miss'

  return (
    <section className={`roll-panel${pending ? ' is-pending' : roll.passed ? ' is-hit' : ' is-miss'}`} aria-live="polite">
      <p className="roll-heading">
        {ambush && 'Ambush: '}
        {taskRoll ? (
          <>
            {attacker.character.name} &rsaquo; {roll.label}
          </>
        ) : (
          <>
            {attacker.character.name} &rsaquo; {target.character.name}
          </>
        )}
        {!ambush && !taskRoll && <span className="roll-weapon"> {getWeapon(roll.weaponId).name}</span>}
      </p>
      <p className="roll-task">
        <b>{formulaText(task)}</b> &middot; Critical {criticalText(task)}
        {task.focus ? ` (Focus: ${task.focus})` : ' (no Focus)'} &middot; Difficulty {task.difficulty}
        {task.difficulty > 0 ? ` (need ${successesText(task.difficulty)})` : ''}
        {task.autoFail && ` · ${task.attribute.name} shut down by Fatigue: automatic failure`}
        {roll.rerolls
          .filter((reroll) => reroll.source === 'focus')
          .map((reroll) => (
            <span key={reroll.index}>
              {' '}
              &middot; {task.focus} reroll {reroll.from} &rarr; {reroll.to}
            </span>
          ))}
      </p>
      {opposition && (
        <p className="roll-task roll-defender">
          {opposition.when === 'targetInCover' ? 'Defender in cover' : 'Defender'} {target.character.name}: {formulaText(opposition.task)} &middot; rolled{' '}
          {opposition.dice.map((die) => die.value).join(', ')} = {successesText(opposition.successes)} &middot; your Difficulty {task.difficulty}
        </p>
      )}
      <div className="roll-dice">
        {values.map((value, index) => (
          <div key={index} className="roll-die-slot">
            <Die key={dieKey(index)} value={value} task={task} speed={speed} />
            {!pending && <DieScore value={value} task={task} />}
            {aimRerollOpen(index) && (
              <button type="button" className="roll-reroll" onClick={() => onReroll(index, 'aim')}>
                Aim reroll
              </button>
            )}
            {assistRerollOpen(index) && (
              <button type="button" className="roll-reroll" onClick={() => onReroll(index, 'assist')}>
                Student of War reroll
              </button>
            )}
            {canMomentumReroll && (
              <button type="button" className="roll-reroll is-momentum" onClick={() => onReroll(index, 'momentum')}>
                Momentum reroll
              </button>
            )}
          </div>
        ))}
        {roll.assist && (
          <div className="roll-die-slot roll-assist" title={`${state.combatants[roll.assist.helperId].character.name}'s assist die (TN ${roll.assist.task.targetNumber})`}>
            <Die key={`${rollId}-assist`} value={roll.assist.die} task={roll.assist.task} speed={speed} />
            <span className="roll-assist-label">{roll.assist.via === 'direct' ? 'Direct' : 'Assist'}</span>
          </div>
        )}
        <div className="roll-outcome">
          {pending ? (
            playerControls && awaitingChoice ? (
              <button type="button" className="roll-resolve" onClick={onResolve}>
                No Reroll
              </button>
            ) : (
              <span className="roll-result-text">Rolling...</span>
            )
          ) : (
            <>
              <span className="roll-result-text">{resultText}</span>
              <span className="roll-result-sub">
                {successesText(roll.successes)} of {task.difficulty} needed
                {roll.passed && ` · ${Math.max(0, roll.successes - task.difficulty)} excess`}
                {roll.momentumGenerated > 0 && ` · +${roll.momentumGenerated} Momentum`}
                {roll.momentumSaved > 0 && ` (${roll.momentumSaved} saved)`}
                {roll.momentumUnsaved > 0 && ` (${roll.momentumUnsaved} over the pool max)`}
                {roll.complications > 0 && ` · ${roll.complications} ${roll.complications === 1 ? 'complication' : 'complications'}`}
                {roll.threatAdded > 0 && ` · +${roll.threatAdded} Threat`}
              </span>
              {injury && (
                <span className={`roll-result-sub roll-injury is-${injury.type}`}>
                  {injuryTypeName(injury.type)} {minorOutcome ? 'hit' : 'Injury'}, Severity {injury.severity}
                  {injury.protection > 0 && ` (Protection ${injury.protection})`}
                  {injuryOutcome && ` · ${injuryOutcome}`}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
