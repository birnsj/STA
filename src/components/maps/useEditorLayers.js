import { useCallback, useState } from 'react'
import { defaultLayerState, LAYER_IDS, LAYER_LABELS } from '../../maps/layers.js'

// Editor-only layer UI state: active layer, visibility and locks. Never exported with the map.
export default function useEditorLayers() {
  const [layers, setLayers] = useState(defaultLayerState)

  const setActive = useCallback((id) => {
    if (!LAYER_IDS.includes(id)) return
    setLayers((current) => ({ ...current, active: id }))
  }, [])

  const setVisible = useCallback((id, visible) => {
    if (!LAYER_IDS.includes(id)) return
    setLayers((current) => ({ ...current, visible: { ...current.visible, [id]: Boolean(visible) } }))
  }, [])

  const setLocked = useCallback((id, locked) => {
    if (!LAYER_IDS.includes(id)) return
    setLayers((current) => ({ ...current, locked: { ...current.locked, [id]: Boolean(locked) } }))
  }, [])

  const toggleVisible = useCallback((id) => {
    setLayers((current) => ({ ...current, visible: { ...current.visible, [id]: !current.visible[id] } }))
  }, [])

  const toggleLocked = useCallback((id) => {
    setLayers((current) => ({ ...current, locked: { ...current.locked, [id]: !current.locked[id] } }))
  }, [])

  return {
    layers,
    layerIds: LAYER_IDS,
    layerLabels: LAYER_LABELS,
    setActive,
    setVisible,
    setLocked,
    toggleVisible,
    toggleLocked,
  }
}
