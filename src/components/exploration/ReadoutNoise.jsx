import { useEffect, useState } from 'react'

// The minimap readout's idle pulse (designer request: very subtle, at a random rate): how long one pulse takes and
// the pause before the next.
const PULSE_SECONDS = [1.6, 4]
const PULSE_GAP_MS = [400, 3500]

const between = ([low, high]) => low + Math.random() * (high - low)

let nextId = 0

// Overlay on the exploration minimap: a faint cyan wash that swells and fades at random intervals. sweep: a party Scan
// while it plays ({ key, seconds }): a bright band, led by a solid line, rolls down the screen once over the scan's
// duration (designer request: the band only with a scan). Display only; the map underneath never moves.
export default function ReadoutNoise({ sweep = null }) {
  const [pulse, setPulse] = useState(null)

  useEffect(() => {
    if (pulse) return undefined
    const timer = setTimeout(() => setPulse({ id: nextId++, seconds: between(PULSE_SECONDS) }), between(PULSE_GAP_MS))
    return () => clearTimeout(timer)
  }, [pulse])

  return (
    <div className="readout-noise" aria-hidden="true">
      {pulse && <div key={pulse.id} className="readout-noise-pulse" style={{ animationDuration: `${pulse.seconds}s` }} onAnimationEnd={() => setPulse(null)} />}
      {sweep && <div key={sweep.key} className="readout-noise-band" style={{ animationDuration: `${sweep.seconds}s` }} />}
    </div>
  )
}
