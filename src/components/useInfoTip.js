import { createElement, useEffect, useRef, useState } from 'react'
import InfoTipBubble from './InfoTipBubble.jsx'

// Hover-only: long enough that sweeping or clicking through a list doesn't flash boxes.
export const SHOW_DELAY_MS = 1400

// One info box per list: spread `bind(content)` onto each item and render `element` once.
export function useInfoTip() {
  const [active, setActive] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const hide = () => {
    clearTimeout(timerRef.current)
    setActive(null)
  }

  const show = (content, anchor) => {
    clearTimeout(timerRef.current)
    setActive({ content, anchor })
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
      // Click selects the control — cancel any pending tip and do not show on press.
      onPointerDown: hide,
      onFocus: (event) => event.currentTarget.matches(':focus-visible') && show(content, event.currentTarget),
      onBlur: hide,
    }
  }

  const element = active ? createElement(InfoTipBubble, { content: active.content, anchor: active.anchor }) : null
  return { bind, element }
}
