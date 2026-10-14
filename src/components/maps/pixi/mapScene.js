import { reducedMotion, startPixiStage } from './pixiStage.js'

// A Pixi scene of the map alone (the map editor's board, EditorBoard): what MapCanvas draws there, with nothing among
// the blocks and nothing fading. Presentation only.
const NONE = new Set()

// Starts the scene in host. read() returns the latest { layout, ghost, lighting, animate, svg } (the svg whose viewBox
// is the camera). Resolves to { destroy }, or null if destroyed (isCancelled) before it started; rejects if WebGL
// can't start.
export async function startMapScene(host, read, isCancelled) {
  const stage = await startPixiStage(host, isCancelled)
  if (!stage) return null
  const still = reducedMotion()
  stage.onFrame(() => {
    const board = read()
    if (!board) return
    const now = performance.now()
    const view = stage.frame(board.svg)
    const map = stage.syncMap(board.layout, { playing: board.animate && !still, ghost: board.ghost, lighting: board.lighting }, now)
    map.update(NONE, now, view)
  })
  return { destroy: () => stage.destroy() }
}
