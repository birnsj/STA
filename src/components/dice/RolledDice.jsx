import { useEffect } from 'react'
import { playRollResultSound } from '../../audio/uiSounds.js'
import { dieVerdict } from '../task/taskText.js'
import D20, { ROLL_MS } from './D20.jsx'

// Each die after the first starts its tumble a little later, so they land one by one.
const DIE_STAGGER_MS = 120

const firstName = (member) => member.character.name.split(' ')[0]

function Die({ die, index, size, label = null, short = false }) {
  const verdict = dieVerdict(die)
  return (
    <div className={`challenge-die is-${verdict.kind}`}>
      <D20 value={die.value} verdict={verdict.kind} size={size} delay={index * DIE_STAGGER_MS} />
      <span className="challenge-die-tag">{short ? verdict.short : verdict.text}</span>
      {label && <span className="challenge-die-owner">{label}</span>}
    </div>
  )
}

// Each die rolled and what it scored, the assistant's last. dieSize: px. shortTags: "Success: 1" in place of
// "Success · 1 success", and the assistant's name without the TN, for a narrow row. The success or failure sound plays as the last die lands.
export default function RolledDice({ result, performer, assistant, dieSize = 42, shortTags = false }) {
  const dieCount = result.dice.length + (result.assist ? 1 : 0)
  const { success } = result
  useEffect(() => {
    const timer = setTimeout(() => playRollResultSound(success), (dieCount - 1) * DIE_STAGGER_MS + ROLL_MS)
    return () => clearTimeout(timer)
  }, [success, dieCount])
  return (
    <div className="challenge-dice">
      {result.dice.map((die, index) => (
        <Die key={`d${index}`} die={die} index={index} size={dieSize} label={firstName(performer)} short={shortTags} />
      ))}
      {result.assist && (
        <Die
          die={result.assist}
          index={result.dice.length}
          size={dieSize}
          label={shortTags ? firstName(assistant) : `${firstName(assistant)} (TN ${result.assist.targetNumber})`}
          short={shortTags}
        />
      )}
    </div>
  )
}
