import { Container } from 'pixi.js'
import { SheetStore } from '../../maps/pixi/figures.js'
import { reconcile, reducedMotion, startPixiStage } from '../../maps/pixi/pixiStage.js'
import { LastKnownView } from '../../exploration/pixi/boardItems.js'
import { MovePathView, ObjectMarkView, SnapMarksView, TilesView } from './battleItems.js'
import { UnitView } from './unitView.js'

// The Pixi combat board's scene (pixiStage.js), drawn once per animation frame from the latest board description
// (PixiBattlefield): on the floor, in Battlefield's order, the highlighted tiles, the planned path, the snap marks,
// the last-known markers and the challenge objects' markers; the combatants and bystanders sorted by depth among the
// blocks. Presentation only.

// Starts the scene in host. read() returns the latest board description: { layout, faded, units, tiles, hoverKey,
// path, snapMarks, lastKnown, objects, revealed, svg }; the parts that haven't changed are the same objects as before. onReady(): the map is drawn and the figures have asked for their
// sprite sheets (MapFadeIn waits for those). Resolves to { destroy }, or null if destroyed (isCancelled) before it
// started; rejects if WebGL can't start.
export async function startBattleScene(host, read, onReady, isCancelled) {
  const stage = await startPixiStage(host, isCancelled)
  if (!stage) return null
  const { groundLayer, depthLayer } = stage.layers
  const tilesView = new TilesView()
  const pathView = new MovePathView()
  const snapView = new SnapMarksView()
  const lastKnownLayer = new Container()
  const objectLayer = new Container()
  groundLayer.addChild(tilesView.graphics, pathView.graphics, snapView.graphics, lastKnownLayer, objectLayer)
  const sheets = new SheetStore()
  const units = new Map()
  const lastKnown = new Map()
  const objects = new Map()
  const options = { playing: !reducedMotion() }
  let readyFor = null

  stage.onFrame(() => {
    const board = read()
    if (!board) return
    const now = performance.now()
    const view = stage.frame(board.svg)
    const map = stage.syncMap(board.layout, options, now)
    map.update(board.faded, now, view)
    tilesView.update(board.tiles, board.hoverKey)
    pathView.update(board.path, now, options.playing)
    snapView.update(board.snapMarks)
    reconcile(lastKnown, board.lastKnown, lastKnownLayer, () => new LastKnownView(), (marker, item) => marker.update(item))
    reconcile(objects, board.objects, objectLayer, () => new ObjectMarkView(), (marker, item) => marker.update(item))
    reconcile(units, board.units, depthLayer, () => new UnitView(sheets), (unit, item) => unit.update(item, now, board.revealed))
    if (map.ready && readyFor !== map) {
      readyFor = map
      onReady()
    }
  })

  return {
    destroy() {
      for (const views of [units, lastKnown, objects]) for (const view of views.values()) view.destroy()
      for (const item of [tilesView, pathView, snapView]) item.destroy()
      sheets.destroy()
      stage.destroy()
    },
  }
}
