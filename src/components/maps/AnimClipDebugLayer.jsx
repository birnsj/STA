import { useEffect, useRef } from 'react'
import { clipLabelForFigure } from '../../dev/animClipDebug.js'
import { NPC_TAG_Y, SPIKE3D_TAG_Y } from '../exploration/boardGeometry.js'

// Above LEAD / name tags so the clip readout stays readable on Spike3d and sprite boards.
const TAG_Y = SPIKE3D_TAG_Y - 14
const TAG_Y_SPRITE = NPC_TAG_Y - 14

/**
 * SVG overlay: current animation clip name over each figure.
 * figuresRef: { current: figure[] } with { id, centre, down?, hideSprite? }.
 * Owns its own rAF so combat boards still update while idle.
 */
export default function AnimClipDebugLayer({ figuresRef, spike3d = false }) {
  const rootRef = useRef(null)

  useEffect(() => {
    const nodes = new Map()
    let raf = 0
    const sync = () => {
      const root = rootRef.current
      const figures = figuresRef?.current ?? []
      if (root) {
        const kept = new Set()
        for (const figure of figures) {
          if (!figure?.id || !figure.centre) continue
          kept.add(figure.id)
          let el = nodes.get(figure.id)
          if (!el) {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'text')
            el.dataset.animId = figure.id
            el.setAttribute('text-anchor', 'middle')
            el.setAttribute('dominant-baseline', 'alphabetic')
            el.setAttribute('fill', '#ffe08a')
            el.setAttribute('stroke', '#03060e')
            el.setAttribute('stroke-width', '3')
            el.setAttribute('paint-order', 'stroke')
            el.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
            el.style.fontSize = '10px'
            el.style.fontWeight = '700'
            el.style.pointerEvents = 'none'
            el.style.letterSpacing = '0.02em'
            root.appendChild(el)
            nodes.set(figure.id, el)
          }
          const y = figure.centre.y + (figure.down ? -28 : spike3d || figure.hideSprite ? TAG_Y : TAG_Y_SPRITE)
          el.setAttribute('x', String(figure.centre.x))
          el.setAttribute('y', String(y))
          const label = clipLabelForFigure(figure)
          if (el.textContent !== label) el.textContent = label
        }
        for (const [id, el] of nodes) {
          if (kept.has(id)) continue
          el.remove()
          nodes.delete(id)
        }
      }
      raf = requestAnimationFrame(sync)
    }
    raf = requestAnimationFrame(sync)
    return () => cancelAnimationFrame(raf)
  }, [figuresRef, spike3d])

  return <g ref={rootRef} className="anim-clip-debug" pointerEvents="none" />
}
