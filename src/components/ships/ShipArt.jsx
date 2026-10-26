import { useEffect, useState } from 'react'

// Screens keep requesting the finished PNG path. A missing file falls back to the
// matching placeholder SVG, so a real PNG can replace it without a code change.
function placeholderSrc(src) {
  if (!src?.startsWith('/art/ships/') || !src.endsWith('.png')) return null
  return src.replace('/art/ships/', '/art/ships/placeholders/').replace(/\.png$/, '.svg')
}

export default function ShipArt({ src, alt = '', className = '' }) {
  const [usePlaceholder, setUsePlaceholder] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    setUsePlaceholder(false)
    setHidden(false)
  }, [src])

  const shown = usePlaceholder ? placeholderSrc(src) : src
  return (
    <span className={`ship-art ${className}`}>
      {shown && !hidden && (
        <img
          src={shown}
          alt={alt}
          draggable={false}
          onError={() => {
            if (!usePlaceholder && placeholderSrc(src)) setUsePlaceholder(true)
            else setHidden(true)
          }}
        />
      )}
    </span>
  )
}
