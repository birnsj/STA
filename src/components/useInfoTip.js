import { createElement, useEffect, useRef, useState } from 'react'
import InfoTipBubble from './InfoTipBubble.jsx'

const SHOW_DELAY_MS = 350

// One info box per list: spread `bind(content)` onto each item and render `element` once.
export function useInfoTip() {
  const [active, setActive] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const hide = () => {
    clearTimeout(timerRef.current)
    setActive(null)
  }

  const bind = (content) => {
    if (!content) return {}
    // Pointer (not mouse) events, because browsers don't send mouse events to disabled buttons.
    return {
      onPointerEnter: (event) => {
        const anchor = event.currentTarget
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setActive({ content, anchor }), SHOW_DELAY_MS)
      },
      onPointerLeave: hide,
      onFocus: (event) => event.currentTarget.matches(':focus-visible') && setActive({ content, anchor: event.currentTarget }),
      onBlur: hide,
    }
  }

  const element = active ? createElement(InfoTipBubble, { content: active.content, anchor: active.anchor }) : null
  return { bind, element }
}
