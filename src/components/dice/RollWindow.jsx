import { useEffect, useId, useRef, useState } from 'react'
import { BONUS_DIE_COSTS, checkDicePurchase, defaultMomentumPayment, MAX_BONUS_DICE, MAX_MOMENTUM } from '../../rules/missionResources.js'
import D20Icon from '../D20Icon.jsx'
import { dicePaymentText, needText, successesText, taskTipText, THREAT_EXPLAINED } from '../task/taskText.js'
import { D20Blank } from './D20.jsx'
import RolledDice from './RolledDice.jsx'

const DIE_SIZE = 42
const stop = (event) => event.stopPropagation()
const firstName = (member) => member.character.name.split(' ')[0]

// Custom Assist picker: the OS <select> popup sat over Roll and broke out of the stage chrome.
function AssistPicker({ options, value, onChange }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const listId = useId()
  const selected = options.find((entry) => entry.id === value) ?? null
  const label = selected ? `${selected.member.character.name} (TN ${selected.assist.task.targetNumber})` : 'Nobody'

  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (id) => {
    onChange(id)
    setOpen(false)
  }

  return (
    <div className={`roll-window-assist${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="roll-window-assist-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((was) => !was)}
      >
        <span className="roll-window-assist-value">{label}</span>
        <span className="roll-window-assist-caret" aria-hidden="true" />
      </button>
      {open && (
        <ul id={listId} className="roll-window-assist-list" role="listbox" aria-label="Assist">
          <li role="option" aria-selected={!value}>
            <button type="button" className={!value ? 'is-selected' : undefined} onClick={() => pick(null)}>
              Nobody
            </button>
          </li>
          {options.map((entry) => (
            <li key={entry.id} role="option" aria-selected={value === entry.id}>
              <button type="button" className={value === entry.id ? 'is-selected' : undefined} onClick={() => pick(entry.id)}>
                {entry.member.character.name} (TN {entry.assist.task.targetNumber})
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// The one roll window (designer request, 2026-10-15: BG3-style, centred over the game, the size of the conversation's
// old dice box): what is rolled, the dice, the choices before the roll, then the outcome. The full task math and the
// result's breakdown are hover tips, to keep it that size.
function RollWindow({ title, tip = null, children }) {
  return (
    <div className="roll-window-backdrop" onPointerDown={stop} onWheel={stop}>
      <div className="roll-window" role="dialog" aria-modal="true" aria-label={title}>
        <p className="roll-window-title" title={tip ?? undefined}>
          {title}
          {tip && <span className="roll-window-info">i</span>}
        </p>
        {children}
      </div>
    </div>
  )
}

// The dice about to be rolled: count for the leader, then the assist die.
function PendingDice({ count, owner, assistOwner = null }) {
  const owners = [...Array.from({ length: count }, () => owner), ...(assistOwner ? [assistOwner] : [])]
  return (
    <div className="challenge-dice roll-window-dice">
      {owners.map((name, index) => (
        <div key={index} className="challenge-die">
          <D20Blank size={DIE_SIZE} />
          <span className="challenge-die-owner">{name}</span>
        </div>
      ))}
    </div>
  )
}

// A label, then − value +.
function Stepper({ label, value, min, max, onChange, children = null }) {
  return (
    <div className="roll-window-row">
      <span className="roll-window-label">{label}</span>
      <button type="button" className="combat-button is-small" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Fewer: ${label}`}>
        &minus;
      </button>
      <b className="roll-window-count">{value}</b>
      <button type="button" className="combat-button is-small" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`More: ${label}`}>
        +
      </button>
      {children}
    </div>
  )
}

// Before the roll. performer: the party member rolling; prepared: their prepareTask result; difficulty: shown in the
// title. assistOptions: [{ id, member, assist (the prepared assist), assistIndex }] for who may assist (empty: no
// Assist row). resources: the mission's { momentum, threat }. onRoll({ assistantId, assistIndex, purchase }).
// onCancel: omit when the roll can't be backed out of (a conversation's check).
// opposedBy: set for a request the other side resists (a conversation's opposed check): its name, and what it rolls.
export function PreRollWindow({ title, performer, prepared, assistOptions = [], resources, onRoll, onCancel = null, opposedBy = null }) {
  const [assistantId, setAssistantId] = useState(null)
  const [bonusDice, setBonusDice] = useState(0)
  const option = assistOptions.find((entry) => entry.id === assistantId) ?? null
  // Momentum first, the rest as Threat (designer decision, 2026-10-15: no splitting the payment by hand).
  const purchase = { bonusDice, momentum: defaultMomentumPayment(resources, bonusDice) }
  const check = checkDicePurchase(resources, purchase)
  const nextText = check.bonusDice < MAX_BONUS_DICE ? `next costs ${BONUS_DIE_COSTS[check.bonusDice]}` : 'max'
  const bonusTip = `Bought d20s cost ${BONUS_DIE_COSTS.join(', then ')}, paid from the group's Momentum (${resources.momentum}/${MAX_MOMENTUM}). Whatever Momentum can't cover gives the enemy that much Threat (now ${resources.threat}).\n\n${THREAT_EXPLAINED}`
  const canRoll = prepared.possible && check.valid
  return (
    <RollWindow title={opposedBy ? `${title} · opposed by ${opposedBy.name}` : `${title} · Difficulty ${prepared.difficulty}`} tip={taskTipText(prepared, option?.assist, option && option.member.character.name)}>
      <PendingDice count={check.dice} owner={firstName(performer)} assistOwner={option && firstName(option.member)} />
      {prepared.possible ? (
        <p className="roll-window-need">{opposedBy ? `Each success sets the Difficulty of ${opposedBy.name}'s ${opposedBy.roll} roll to resist.` : needText(prepared.task, prepared.difficulty)}</p>
      ) : (
        <p className="roll-window-warning">{prepared.blockers[0] ?? "Can't be attempted."}</p>
      )}
      {assistOptions.length > 0 && (
        <div className="roll-window-row">
          <span className="roll-window-label">Assist</span>
          <AssistPicker options={assistOptions} value={assistantId} onChange={setAssistantId} />
        </div>
      )}
      <div title={bonusTip}>
        <Stepper label="Bonus d20" value={check.bonusDice} min={0} max={MAX_BONUS_DICE} onChange={setBonusDice}>
          <span className="roll-window-note">{nextText}</span>
        </Stepper>
        <p className={`roll-window-cost${check.threatAdded ? ' is-threat' : ''}`}>{dicePaymentText(check)}</p>
      </div>
      {!check.valid && <p className="roll-window-warning">{check.reason}</p>}
      <div className="roll-window-actions">
        {onCancel && (
          <button type="button" className="combat-button is-small" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          type="button"
          className="combat-button is-small is-primary is-advance roll-window-roll"
          disabled={!canRoll}
          onClick={() => onRoll({ assistantId: option?.id ?? null, assistIndex: option?.assistIndex ?? 0, purchase })}
        >
          <D20Icon />
          Roll {check.dice + (option ? 1 : 0)}d20
        </button>
      </div>
    </RollWindow>
  )
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

// The result's breakdown, for the hover tip on its summary.
function resultTipText(lastTask, assistantName) {
  const { result } = lastTask
  const lines = [`${successesText(result.successes)} against Difficulty ${result.difficulty}: ${result.success ? 'Success' : 'Failure'}`]
  if (result.assist) {
    const who = `${assistantName} (TN ${result.assist.targetNumber})`
    lines.push(result.assist.counted ? `${who}: successes counted.` : `${who}: die didn't count; the leader scored no successes.`)
  }
  if (result.success) lines.push(`Momentum generated: ${result.momentumGenerated}; saved to the group pool: ${lastTask.momentumSaved}${lastTask.momentumLost ? `, ${lastTask.momentumLost} lost` : ''}`)
  if (lastTask.bonusDice > 0) lines.push(`Bought ${plural(lastTask.bonusDice, 'bonus d20')}: ${lastTask.momentumSpentOnDice} Momentum spent, ${lastTask.threatAddedForDice} Threat added`)
  if (result.complicationsRolled > 0) lines.push(`Complications: ${result.complications}${result.complicationsIgnored ? ` (${result.complicationsIgnored} ignored)` : ''}`)
  return lines.join('\n')
}

// After the roll: the dice landing, Success or Failure, a one-line summary (its breakdown as a hover tip), any authored
// messages, and Continue. lastTask: a conversation's lastCheck or an object's lastTask (the same fields).
export function ResultWindow({ title, lastTask, performer, assistant = null, onContinue }) {
  const { result, prepared, opposed } = lastTask
  const tally = opposed ? successesText(result.successes) : `${successesText(result.successes)}${result.difficulty > 0 ? ` (${result.difficulty} needed)` : ''}`
  const summary = [
    tally,
    result.success && result.momentumGenerated ? `+${result.momentumGenerated} Momentum` : null,
    result.complications ? plural(result.complications, 'complication') : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <RollWindow title={opposed ? `${title} · opposed by ${opposed.npcName}` : `${title} · Difficulty ${result.difficulty}`} tip={taskTipText(prepared)}>
      <div className="roll-window-dice">
        <RolledDice result={result} performer={performer} assistant={assistant} dieSize={DIE_SIZE} shortTags={result.dice.length + (result.assist ? 1 : 0) > 2} />
      </div>
      {opposed && (
        <p className="roll-window-message">
          {opposed.set > 0
            ? `${opposed.npcName} resists at Difficulty ${opposed.difficulty} and scores ${successesText(opposed.resistSuccesses)}.`
            : `No successes set a Difficulty: ${opposed.npcName} has nothing to resist.`}
        </p>
      )}
      <p className={`roll-window-outcome ${result.success ? 'is-success' : 'is-failure'}`}>{result.success ? 'Success' : 'Failure'}</p>
      <p className="roll-window-summary" title={resultTipText(lastTask, assistant ? firstName(assistant) : '')}>
        {summary}
        {lastTask.threatAddedForDice > 0 && (
          <span className="is-threat" title={THREAT_EXPLAINED}>
            {' '}
            · +{lastTask.threatAddedForDice} Threat for the enemy
          </span>
        )}
      </p>
      {lastTask.messages.map((text) => (
        <p key={text} className="roll-window-message" title={text}>
          {text}
        </p>
      ))}
      <div className="roll-window-actions">
        <button type="button" className="combat-button is-small is-primary roll-window-roll" autoFocus onClick={onContinue}>
          Continue
        </button>
      </div>
    </RollWindow>
  )
}
