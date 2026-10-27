import { useEffect, useState } from 'react'
import { shipEmptyArt } from '../../ships/shipArtPaths.js'

const EMPTY = shipEmptyArt()

// Screens request finished PNG paths. Missing files fall back to a PNG empty tile (never SVG).
export default function ShipArt({ src, alt = '', className = '' }) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  const shown = failed ? EMPTY : (src || EMPTY)
  return (
    <span className={`ship-art ${className}`}>
      <img
        src={shown}
        alt={alt}
        draggable={false}
        onError={() => {
          if (!failed) setFailed(true)
        }}
      />
    </span>
  )
}
