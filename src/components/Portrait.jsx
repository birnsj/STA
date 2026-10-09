import { useEffect, useState } from 'react'
import { useUniformImage } from './useUniformImage.js'

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
// A null src (a shirt still being recoloured) keeps the previous picture up.
function PortraitImage({ src }) {
  // The last source that finished loading (or failed); shown until the new one is ready.
  const [settled, setSettled] = useState({ src: null, failed: false })

  useEffect(() => {
    if (!src) return undefined
    let cancelled = false
    probe(src).decode().then(
      () => !cancelled && setSettled({ src, failed: false }),
      () => !cancelled && setSettled({ src, failed: true }),
    )
    return () => {
      cancelled = true
    }
  }, [src])

  const readyNow = Boolean(src) && settled.src !== src && isCached(probe(src))
  const shownSrc = readyNow ? src : settled.failed ? null : settled.src
  if (!shownSrc) return null
  return <img className="portrait-image" src={shownSrc} alt="" draggable={false} />
}

// Labeled placeholder until prototype art assets are supplied. `image` is an optional path into public/.
// uniform: a character portrait's shirt colour (rules/uniform.js); backdrop: the image drawn behind a layered portrait
// (rules/appearance.js getCharacterBackdrop). Omit both for any other picture.
export default function Portrait({ label, className = '', unknown = false, image = null, uniform = null, backdrop = null }) {
  const shownImage = useUniformImage(image, uniform, backdrop)
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
      {image && <PortraitImage src={shownImage} />}
    </div>
  )
}
