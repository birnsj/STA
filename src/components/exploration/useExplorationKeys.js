import { useEffect, useRef } from 'react'

const isTyping = (event) => event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)
const isPlainPress = (event) => !event.repeat && !event.ctrlKey && !event.metaKey

// Exploration's keyboard: number keys 1-n pick party members (Shift adds / removes), like clicking their portraits;
// Escape closes panels and leaves a conversation; C opens or closes the character sheet; I the inventory; B also the
// inventory; L the Captain's Log. Sneak is on the party ring only (C used to toggle it). Ignored while typing in a field.
// keys: { memberIds, onPick(id, additive), onEscape, onSheet, onInventory, onLog }; the latest handlers are always used.
export default function useExplorationKeys(keys) {
  const latest = useRef(keys)
  useEffect(() => {
    latest.current = keys
  })
  useEffect(() => {
    const onKey = (event) => {
      if (isTyping(event)) return
      const { memberIds, onPick, onEscape, onSheet, onInventory, onLog } = latest.current
      const index = Number(event.code.replace('Digit', '')) - 1
      if (event.code.startsWith('Digit') && index >= 0 && index < memberIds.length) onPick(memberIds[index], event.shiftKey)
      if (event.code === 'Escape') onEscape()
      if (event.code === 'KeyC' && isPlainPress(event)) onSheet()
      if (event.code === 'KeyI' && isPlainPress(event)) onInventory?.()
      if (event.code === 'KeyB' && isPlainPress(event)) onInventory?.()
      if (event.code === 'KeyL' && isPlainPress(event)) onLog()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
