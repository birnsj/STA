import { useState } from 'react'

// Covers the placeholder once loaded; a missing or broken file leaves the placeholder showing.
function PortraitImage({ src }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return <img className="portrait-image" src={src} alt="" onError={() => setFailed(true)} />
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
      {image && <PortraitImage key={image} src={image} />}
    </div>
  )
}
