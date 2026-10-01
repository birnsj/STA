import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const GAP = 8
const MARGIN = 8

// Rendered into the scaled stage (not the anchor's parent) so scrolling lists can't clip it.
// Stage coordinates are unscaled, so screen measurements are divided by the stage's scale.
export default function InfoTipBubble({ content, anchor }) {
  const bubbleRef = useRef(null)
  const [position, setPosition] = useState(null)
  const stage = anchor.closest('.stage')

  useLayoutEffect(() => {
    if (!stage) return
    const stageRect = stage.getBoundingClientRect()
    const scale = stageRect.width / stage.offsetWidth
    const anchorRect = anchor.getBoundingClientRect()
    const { offsetWidth: width, offsetHeight: height } = bubbleRef.current
    const left = Math.min(Math.max((anchorRect.left - stageRect.left) / scale, MARGIN), stage.offsetWidth - width - MARGIN)
    const below = (anchorRect.bottom - stageRect.top) / scale + GAP
    const above = (anchorRect.top - stageRect.top) / scale - GAP - height
    const top = below + height <= stage.offsetHeight - MARGIN ? below : Math.max(above, MARGIN)
    setPosition({ left, top })
  }, [anchor, stage, content])

  if (!stage) return null
  return createPortal(
    <div ref={bubbleRef} className="info-tip" role="tooltip" style={position ?? { visibility: 'hidden' }}>
      <span className="help-tip-title">{content.title}</span>
      {content.text && <span className="help-tip-text info-tip-text">{content.text}</span>}
      {content.sections?.map((section) => (
        <span key={section.label} className="info-tip-section">
          <span className="help-tip-label">{section.label}</span>
          <span className="help-tip-text">{section.text}</span>
        </span>
      ))}
      {content.note && <span className="info-tip-note">{content.note}</span>}
      {content.source && <span className="help-tip-source">{content.source}</span>}
    </div>,
    stage,
  )
}
