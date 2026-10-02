import { useEffect, useState } from 'react'

const isCached = (image) => image.complete && image.naturalWidth > 0

function probe(src) {
  const image = new Image()
  image.src = src
  return image
}

// Covers the placeholder once loaded; a missing or broken file leaves the placeholder showing.
// A new source is loaded and decoded off-screen first, and the previous picture stays up until then, so switching
// never shows the placeholder in between (some browsers blank an <img> while its new source loads).
// Already-cached pictures are shown straight away, before the first paint.
function PortraitImage({ src }) {
  // The last source that finished loading (or failed); shown until the new one is ready.
  const [settled, setSettled] = useState({ src: null, failed: false })

  useEffect(() => {
    let cancelled = false
    probe(src).decode().then(
      () => !cancelled && setSettled({ src, failed: false }),
      () => !cancelled && setSettled({ src, failed: true }),
    )
    return () => {
      cancelled = true
    }
  }, [src])

  const readyNow = settled.src !== src && isCached(probe(src))
  const shownSrc = readyNow ? src : settled.failed ? null : settled.src
  if (!shownSrc) return null
  return <img className="portrait-image" src={shownSrc} alt="" draggable={false} />
}

// Labeled placeholder until prototype art assets are supplied. `image` is an optional path into public/.
export default function Portrait({ label, className = '', unknown = false, image = null }) {
  if (unknown) {
    return (
      <div className={`portrait portrait-unknown ${className}`} role="img" aria-label="Unknown portrait">
        <span className="portrait-unknown-mark">?</span>
      </div>
    )
  }

  return (
    <div className={`portrait ${className}`} role="img" aria-label={label ? `${label} portrait placeholder` : 'Portrait placeholder'}>
      <span className="portrait-label">{label ?? 'None selected'}</span>
      <span className="portrait-caption">Portrait placeholder</span>
      {image && <PortraitImage src={image} />}
    </div>
  )
}
