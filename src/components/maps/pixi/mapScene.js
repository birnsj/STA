import { Container } from 'pixi.js'
import { AreaLabelView, EditorMarkerView, TilePreviewView } from './editorMarkers.js'
import { reconcile, reducedMotion, startPixiStage } from './pixiStage.js'

// A Pixi scene of the map alone (the map editor's board, EditorBoard): the map with nothing among the blocks and
// nothing fading, and the editor's room labels, markers and tile previews over it. Presentation only.
const NONE = new Set()

// Starts the scene in host. read() returns the latest { layout, ghost, lighting, animate, labels, markers, preview, svg } (the
// svg whose viewBox is the camera). Resolves to { destroy }, or null if destroyed (isCancelled) before it started;
// rejects if WebGL can't start.
export async function startMapScene(host, read, isCancelled) {
  const stage = await startPixiStage(host, isCancelled)
  if (!stage) return null
  const still = reducedMotion()
  const labels = new Map()
  const markers = new Map()
  // Markers always over labels, whichever was added last.
  const labelLayer = new Container()
  const markerLayer = new Container()
  const previewLayer = new Container()
  stage.layers.fxLayer.addChild(labelLayer, markerLayer, previewLayer)
  const preview = new TilePreviewView(previewLayer)
  stage.onFrame(() => {
    const board = read()
    if (!board) return
    const now = performance.now()
    const view = stage.frame(board.svg)
    const playing = board.animate && !still
    const map = stage.syncMap(board.layout, { playing, ghost: board.ghost, lighting: board.lighting }, now)
    map.update(NONE, now, view)
    reconcile(labels, board.labels, labelLayer, () => new AreaLabelView(), (label, item) => label.update(item, now, playing))
    reconcile(markers, board.markers, markerLayer, () => new EditorMarkerView(), (marker, item) => marker.update(item, now, playing))
    preview.update(board.preview)
  })
  return {
    destroy: () => {
      preview.destroy()
      for (const views of [labels, markers]) for (const view of views.values()) view.destroy()
      stage.destroy()
    },
  }
}
