import { useEffect, useState } from 'react'

const MIN_GAP_MS = 5000
const MAX_GAP_MS = 14000

// Sweeps a highlight across the logo painted into the menu background at random intervals.
// Changing the key remounts the band, which restarts its one-shot CSS animation.
export default function LogoSheen({ image }) {
  const [sweep, setSweep] = useState(0)

  useEffect(() => {
    const delay = MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS)
    const timer = setTimeout(() => setSweep((count) => count + 1), delay)
    return () => clearTimeout(timer)
  }, [sweep])

  return (
    <div className="logo-sheen" aria-hidden="true">
      {sweep > 0 && <span key={sweep} className="logo-sheen-band" style={{ backgroundImage: `url(${image})` }} />}
    </div>
  )
}
