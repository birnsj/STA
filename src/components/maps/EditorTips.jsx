import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const TIPPED = '[title], [data-tip]'
const SHOW_DELAY_MS = 350
const GAP = 4
const MARGIN = 4

// Native title= tips restyled as the editor's chrome (not the game's TitleTips / info boxes).
// Strips title while hovered so the browser tip does not also appear.
export default function EditorTips({ rootRef }) {
  const [active, setActive] = useState(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    let hovered = null
    let timer = null

    const hide = () => {
      clearTimeout(timer)
      setActive(null)
    }
    const release = () => {
      if (hovered?.fromTitle && hovered.element.isConnected && !hovered.element.hasAttribute('title')) {
        hovered.element.setAttribute('title', hovered.text)
      }
      hovered = null
    }
    const readTip = (element) => {
      if (element.hasAttribute('title')) {
        const text = element.getAttribute('title')
        element.removeAttribute('title')
        return { text, fromTitle: true }
      }
      if (element.hasAttribute('data-tip')) return { text: element.getAttribute('data-tip'), fromTitle: false }
      return { text: '', fromTitle: false }
    }
    const tippedAt = (target) => {
      if (!(target instanceof Element)) return null
      const element = target.closest(TIPPED)
      if (hovered && hovered.element.contains(target) && !(element && hovered.element.contains(element))) return hovered.element
      return element
    }
    const showNow = () => {
      if (!hovered?.text) return setActive(null)
      setActive({ text: hovered.text, anchor: hovered.element, root })
    }
    const schedule = () => {
      clearTimeout(timer)
      setActive(null)
      timer = setTimeout(showNow, SHOW_DELAY_MS)
    }
    const hover = (element) => {
      hovered = { element, ...readTip(element) }
    }
    const track = (event) => {
      const element = tippedAt(event.target)
      if (element !== hovered?.element) {
        hide()
        release()
        if (!element || !root.contains(element)) return
        hover(element)
        schedule()
      }
    }
    const leave = (event) => {
      if (hovered && !(event.relatedTarget instanceof Node && hovered.element.contains(event.relatedTarget))) {
        hide()
        release()
      }
    }

    root.addEventListener('pointerover', track)
    root.addEventListener('pointermove', track)
    root.addEventListener('pointerout', leave)
    root.addEventListener('pointerdown', hide)
    root.addEventListener('wheel', hide, { passive: true })
    return () => {
      hide()
      release()
      root.removeEventListener('pointerover', track)
      root.removeEventListener('pointermove', track)
      root.removeEventListener('pointerout', leave)
      root.removeEventListener('pointerdown', hide)
      root.removeEventListener('wheel', hide)
    }
  }, [rootRef])

  if (!active) return null
  // The root travels with the tip (captured in the effect) so render never reads the ref.
  return <EditorTipBubble text={active.text} anchor={active.anchor} root={active.root} />
}

function EditorTipBubble({ text, anchor, root }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!root || !ref.current) return
    const rootRect = root.getBoundingClientRect()
    const anchorRect = anchor.getBoundingClientRect()
    const { offsetWidth: width, offsetHeight: height } = ref.current
    const scaleX = rootRect.width / root.offsetWidth
    const scaleY = rootRect.height / root.offsetHeight
    const left = Math.min(
      Math.max((anchorRect.left + anchorRect.width / 2 - rootRect.left) / scaleX - width / 2, MARGIN),
      root.offsetWidth - width - MARGIN,
    )
    const below = (anchorRect.bottom - rootRect.top) / scaleY + GAP
    const above = (anchorRect.top - rootRect.top) / scaleY - GAP - height
    const top = below + height <= root.offsetHeight - MARGIN ? below : Math.max(above, MARGIN)
    setPos({ left, top })
  }, [text, anchor, root])

  if (!root) return null
  return createPortal(
    <div ref={ref} className="ed-tip-bubble" role="tooltip" style={pos ?? { visibility: 'hidden' }}>
      {text}
    </div>,
    root,
  )
}
