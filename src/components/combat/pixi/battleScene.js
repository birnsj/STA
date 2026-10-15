import { Container } from 'pixi.js'
import { perfEnd, perfStart } from '../../../dev/perfProbe.js'
import { EffectView } from '../../maps/pixi/effects.js'
import { ExplosionView } from '../../maps/pixi/explosionView.js'
import { HazardLayer } from '../../maps/pixi/hazardLayer.js'
import { SheetStore } from '../../maps/pixi/figures.js'
import { reconcile, reducedMotion, startPixiStage } from '../../maps/pixi/pixiStage.js'
import { LastKnownView } from '../../exploration/pixi/boardItems.js'
import { MovePathView, ObjectMarkView, SnapMarksView, TilesView } from './battleItems.js'
import { UnitView } from './unitView.js'

// The Pixi combat board's scene (pixiStage.js), drawn once per animation frame from the latest board description
// (PixiBattlefield): on the floor, the highlighted tiles, the planned path, the snap marks,
// the last-known markers and the challenge objects' markers; the combatants and bystanders sorted by depth among the
// blocks; the effects on top. Presentation only.

// Starts the scene in host. read() returns the latest board description: { layout, faded, units, tiles, hoverKey,
// path, snapMarks, lastKnown, objects, effects, explosions, environment (hazards), revealed, svg }; the parts that haven't changed are the same objects as before. onReady(): the map is drawn and the figures have asked for their
// sprite sheets (MapFadeIn waits for those). Resolves to { destroy }, or null if destroyed (isCancelled) before it
// started; rejects if WebGL can't start.
export async function startBattleScene(host, read, onReady, isCancelled) {
  const stage = await startPixiStage(host, isCancelled)
  if (!stage) return null
  const { groundLayer, depthLayer, fxLayer } = stage.layers
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
  const effects = new Map()
  const explosions = new Map()
  const hazards = new HazardLayer(stage.layers)
  const options = { playing: !reducedMotion() }
  let readyFor = null

  stage.onFrame(() => {
    const board = read()
    if (!board) return
    const now = performance.now()
    const view = stage.frame(board.svg)
    const map = stage.syncMap(board.layout, options, now)
    map.update(board.faded, now, view)
    hazards.update(board.environment, now, view, options.playing)
    tilesView.update(board.tiles, board.hoverKey)
    pathView.update(board.path, now, options.playing)
    snapView.update(board.snapMarks)
    reconcile(lastKnown, board.lastKnown, lastKnownLayer, () => new LastKnownView(), (marker, item) => marker.update(item))
    reconcile(objects, board.objects, objectLayer, () => new ObjectMarkView(), (marker, item) => marker.update(item))
    reconcile(units, board.units, depthLayer, () => new UnitView(sheets), (unit, item) => unit.update(item, now, board.revealed))
    reconcile(effects, board.effects, fxLayer, () => new EffectView(), (effect, item) => effect.update(item, now))
    const blastStarted = perfStart()
    reconcile(explosions, board.explosions, fxLayer, () => new ExplosionView(), (explosion, item) => explosion.update(item, now, options.playing))
    perfEnd('fx.explosion', blastStarted)
    if (map.ready && readyFor !== map) {
      readyFor = map
      onReady()
    }
  })

  return {
    destroy() {
      for (const views of [units, lastKnown, objects, effects, explosions]) for (const view of views.values()) view.destroy()
      for (const item of [tilesView, pathView, snapView, hazards]) item.destroy()
      sheets.destroy()
      stage.destroy()
    },
  }
}
