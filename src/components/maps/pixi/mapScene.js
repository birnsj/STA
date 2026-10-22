import { Container } from 'pixi.js'
import { GroundLootView } from '../../exploration/pixi/boardItems.js'
import { AreaLabelView, EditorGridView, EditorMarkerView, EditorOutlineView, TilePreviewView } from './editorMarkers.js'
import { HazardLayer } from './hazardLayer.js'
import { reconcile, startPixiStage } from './pixiStage.js'

// A Pixi scene of the map alone (the map editor's board, EditorBoard): the map with nothing fading, its hazards, and
// the editor's room labels, markers, authored ground inventory props and tile previews over it. Presentation only.
const NONE = new Set()

// Starts the scene in host. read() returns the latest { layout, ghost, lighting, animate, environment, labels, markers,
// groundLoot, outlines, preview, grid, svg } (the svg whose viewBox is the camera). Resolves to { destroy }, or null if
// destroyed (isCancelled) before it started; rejects if WebGL can't start.
export async function startMapScene(host, read, isCancelled) {
  const stage = await startPixiStage(host, isCancelled)
  if (!stage) return null
  const labels = new Map()
  const markers = new Map()
  const groundLoot = new Map()
  const outlines = new Map()
  // Guide grid sits on the floor (above floor tiles, under ground props / walls / darkness). Markers always over
  // labels; ground inventory props sit with markers so they depth-sort among themselves (GroundLootView zIndex).
  const gridLayer = new Container()
  const floorIndex = stage.layers.world.getChildIndex(stage.layers.floorLayer)
  stage.layers.world.addChildAt(gridLayer, floorIndex + 1)
  const outlineLayer = new Container()
  const labelLayer = new Container()
  const lootLayer = new Container()
  lootLayer.sortableChildren = true
  const markerLayer = new Container()
  const previewLayer = new Container()
  stage.layers.fxLayer.addChild(outlineLayer, labelLayer, lootLayer, markerLayer, previewLayer)
  const grid = new EditorGridView(gridLayer)
  const preview = new TilePreviewView(previewLayer)
  const hazards = new HazardLayer(stage.layers)
  stage.onFrame(() => {
    const board = read()
    if (!board) return
    const now = performance.now()
    const view = stage.frame(board.svg)
    // Editor Animate toggle is authoritative (OS prefers-reduced-motion must not freeze tile preview).
    const playing = Boolean(board.animate)
    const map = stage.syncMap(board.layout, { playing, ghost: board.ghost, lighting: board.lighting }, now)
    map.update(NONE, now, view)
    hazards.update(board.environment, now, view, playing)
    grid.update(board.grid, view)
    reconcile(outlines, board.outlines ?? [], outlineLayer, () => new EditorOutlineView(), (outline, item) => outline.update(item))
    reconcile(labels, board.labels, labelLayer, () => new AreaLabelView(), (label, item) => label.update(item, now, playing))
    reconcile(groundLoot, board.groundLoot ?? [], lootLayer, () => new GroundLootView(), (loot, item) => loot.update(item))
    reconcile(markers, board.markers, markerLayer, () => new EditorMarkerView(), (marker, item) => marker.update(item, now, playing))
    preview.update(board.preview)
  })
  return {
    destroy: () => {
      grid.destroy()
      preview.destroy()
      hazards.destroy()
      for (const views of [outlines, labels, markers, groundLoot]) for (const view of views.values()) view.destroy()
      stage.destroy()
    },
  }
}
