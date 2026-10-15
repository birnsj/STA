import { EffectView } from '../../maps/pixi/effects.js'
import { FigureView, SheetStore } from '../../maps/pixi/figures.js'
import { reconcile, reducedMotion, startPixiStage } from '../../maps/pixi/pixiStage.js'
import { HighlightView, LastKnownView, MarkerView, PulseView } from './boardItems.js'

// The Pixi exploration board's scene (pixiStage.js), drawn once per animation frame from the latest board description
// (PixiExplorationBoard): the ground items (last-known markers, click rings) on the floor, the figures and the
// challenge objects' outlines and markers sorted by depth among the blocks, the effects on top. Presentation only.

// Starts the scene in host. read() returns the latest board description: { layout, faded, figures, highlights,
// markers, lastKnown, pulses, effects, revealed, svg }. onReady(): the map is drawn and the figures have asked for
// their sprite sheets (MapFadeIn waits for those). Resolves to { destroy }, or null if destroyed (isCancelled) before
// it started; rejects if WebGL can't start.
export async function startBoardScene(host, read, onReady, isCancelled) {
  const stage = await startPixiStage(host, isCancelled)
  if (!stage) return null
  const { groundLayer, depthLayer, fxLayer } = stage.layers
  const sheets = new SheetStore()
  const figures = new Map()
  const highlights = new Map()
  const markers = new Map()
  const lastKnown = new Map()
  const pulses = new Map()
  const effects = new Map()
  const options = { playing: !reducedMotion() }
  let readyFor = null

  stage.onFrame(() => {
    const board = read()
    if (!board) return
    const now = performance.now()
    const view = stage.frame(board.svg)
    const map = stage.syncMap(board.layout, options, now)
    map.update(board.faded, now, view)
    reconcile(figures, board.figures, depthLayer, () => new FigureView(sheets), (figure, item) => figure.update(item, now, board.revealed))
    reconcile(highlights, map.ready ? board.highlights : [], depthLayer, () => new HighlightView(), (highlight, item) => highlight.update(board.layout, item, now))
    reconcile(markers, board.markers, depthLayer, () => new MarkerView(), (marker, item) => marker.update(item, now))
    reconcile(lastKnown, board.lastKnown, groundLayer, () => new LastKnownView(), (marker, item) => marker.update(item))
    reconcile(pulses, board.pulses, groundLayer, () => new PulseView(), (pulse, item) => pulse.update(item, now))
    reconcile(effects, board.effects, fxLayer, () => new EffectView(), (effect, item) => effect.update(item, now))
    if (map.ready && readyFor !== map) {
      readyFor = map
      onReady()
    }
  })

  return {
    destroy() {
      for (const views of [figures, highlights, markers, lastKnown, pulses, effects]) for (const view of views.values()) view.destroy()
      sheets.destroy()
      stage.destroy()
    },
  }
}
