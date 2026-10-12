import { useEffect, useRef } from 'react'

const isTyping = (event) => event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)
const isPlainPress = (event) => !event.repeat && !event.ctrlKey && !event.metaKey

// Exploration's keyboard: number keys 1-n pick party members (Shift adds / removes), like clicking their portraits;
// Escape closes panels and leaves a conversation; C toggles sneak for the selected characters; I opens or closes the
// character sheet; L the Captain's Log. Ignored while typing in a field.
// keys: { memberIds, onPick(id, additive), onEscape, onSneak, onSheet, onLog }; the latest handlers are always used.
export default function useExplorationKeys(keys) {
  const latest = useRef(keys)
  useEffect(() => {
    latest.current = keys
  })
  useEffect(() => {
    const onKey = (event) => {
      if (isTyping(event)) return
      const { memberIds, onPick, onEscape, onSneak, onSheet, onLog } = latest.current
      const index = Number(event.code.replace('Digit', '')) - 1
      if (event.code.startsWith('Digit') && index >= 0 && index < memberIds.length) onPick(memberIds[index], event.shiftKey)
      if (event.code === 'Escape') onEscape()
      if (event.code === 'KeyC' && isPlainPress(event)) onSneak()
      if (event.code === 'KeyI' && isPlainPress(event)) onSheet()
      if (event.code === 'KeyL' && isPlainPress(event)) onLog()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
