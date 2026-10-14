import { useEffect, useState } from 'react'
import { playDiceRollSound } from '../../audio/uiSounds.js'
import sprite from '../../data/adaptation/diceSprite.json'

// Presentation only: the die tumbles through the sheet once, then lands with the value the rules already rolled.
// Divided by the Auto Combat speed so it lands before the result is shown.
export const ROLL_MS = 550

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// One d20 (src/data/adaptation/diceSprite.json). verdict: dieVerdict's kind (success, critical, failure,
// complication), the colour of the outline that glows once it lands. size: px. delay: ms before it starts tumbling (hidden until then).
// Mount it again (a new key) for each new roll, so each one rolls once.
export default function D20({ value, verdict, size = 32, speed = 1, delay = 0 }) {
  const [landed, setLanded] = useState(reducedMotion)
  // The rattle starts with the first die of a roll (uiSounds plays one per roll), also when motion is reduced. Timed
  // when the die mounts, so a speed change afterwards doesn't rattle again.
  const [rattle] = useState(() => ({ delay, seconds: ROLL_MS / speed / 1000 }))
  useEffect(() => {
    const timer = setTimeout(() => playDiceRollSound(rattle.seconds), rattle.delay)
    return () => clearTimeout(timer)
  }, [rattle])
  useEffect(() => {
    if (landed) return undefined
    const timer = setTimeout(() => setLanded(true), delay + ROLL_MS / speed)
    return () => clearTimeout(timer)
  }, [landed, delay, speed])

  const style = {
    '--d20-image': `url(${sprite.image})`,
    '--d20-size': `${size}px`,
    '--d20-columns': sprite.landedFrame + 1,
    '--d20-frames': sprite.tumbleFrames,
    '--d20-landed': sprite.landedFrame,
    '--d20-tumble': `${ROLL_MS / speed}ms`,
    '--d20-delay': `${delay}ms`,
  }
  if (!landed) return <span className="d20 is-rolling" style={style} role="img" aria-label="Rolling" />
  const [x, y] = sprite.faceCentre
  return (
    <span className={`d20 is-landed is-${verdict}`} style={style} role="img" aria-label={`Rolled ${value}`}>
      <span className="d20-value" style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>
        {value}
      </span>
    </span>
  )
}
