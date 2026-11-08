import { Container } from 'pixi.js'
import { perfEnd, perfStart } from '../../../dev/perfProbe.js'
import { EffectView } from '../../maps/pixi/effects.js'
import { ExplosionView } from '../../maps/pixi/explosionView.js'
import { HazardLayer } from '../../maps/pixi/hazardLayer.js'
import { SheetStore } from '../../maps/pixi/figures.js'
import { reconcile, reducedMotion, startPixiStage } from '../../maps/pixi/pixiStage.js'
import { HighlightView, LastKnownView } from '../../exploration/pixi/boardItems.js'
import { MovePathView, ObjectMarkView, SnapMarksView, TilesView } from './battleItems.js'
import { UnitView } from './unitView.js'
import { unproject } from '../../../maps/iso.js'
import { resolveSpike3dAppearance } from '../../../spike3d/appearance.js'

// The Pixi combat board's scene (pixiStage.js), drawn once per animation frame from the latest board description
// (PixiBattlefield): on the floor, the highlighted tiles, the planned path, the snap marks,
// the last-known markers and the challenge objects' markers; the combatants and bystanders sorted by depth among the
// blocks; destructible hover outlines; the effects on top. Presentation only.

// Starts the scene in host. read() returns the latest board description: { layout, faded, units, tiles, hoverKey,
// path, snapMarks, lastKnown, objects, highlights, effects, explosions, environment (hazards), revealed, svg,
// spikePosesRef? }; the parts that haven't changed are the same objects as before. onReady(): the map is drawn and the figures have asked for their
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
  const highlights = new Map()
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
    reconcile(highlights, map.ready ? board.highlights ?? [] : [], depthLayer, () => new HighlightView(), (highlight, item) => highlight.update(board.layout, item, now))
    reconcile(units, board.units, depthLayer, () => new UnitView(sheets), (unit, item) => unit.update(item, now, board.revealed))
    // Feed spike3d from unit tracks (shownPose) so combat clips drive the Three overlay.
    // Keep beamed-in units in the pose list (with beam flag) so actors are not disposed/recreated —
    // dropping them made party figures blink out for the whole waiting/beaming window.
    if (board.spikePosesRef) {
      const poses = []
      for (const view of units.values()) {
        const shown = view.shown
        if (!shown?.centre) continue
        const position = unproject(shown.centre)
        const combatant = shown.combatant
        const portrait = combatant?.character?.portrait
        poses.push({
          id: shown.id,
          position,
          facing: shown.facing,
          animation: shown.pose?.animation ?? null,
          gait: shown.isWalking ? 'run' : 'idle',
          down: Boolean(shown.down || shown.pose?.animation?.startsWith?.('fall')),
          beam: shown.beam ?? null,
          blastReact: combatant?.blastReact ?? null,
          onStaggerDone: shown.onStaggerDone ?? null,
          colour: shown.colour ?? shown.bodyColour,
          enemy: combatant?.side === 'enemy' || combatant?.hostile === true,
          appearance: resolveSpike3dAppearance({
            portraitId: portrait?.id ?? shown.spriteSet,
            uniform: shown.colour,
            enemy: combatant?.side === 'enemy',
          }),
        })
      }
      board.spikePosesRef.current = poses
    }
    reconcile(effects, board.effects, fxLayer, () => new EffectView(), (effect, item) => effect.update(item, now))
    const blastStarted = perfStart()
    reconcile(explosions, board.explosions, fxLayer, () => new ExplosionView(), (explosion, item) => explosion.update(item, now, options.playing))
    perfEnd('fx.explosion', blastStarted)
    if (map.ready && readyFor !== map) {
      readyFor = map
      onReady()
    }
    // Same viewBox sample as stage.frame — keeps spike3d feet on the Pixi rings while the camera moves.
    board.spikeFrameRef?.current?.()
  })

  return {
    destroy() {
      for (const views of [units, lastKnown, objects, highlights, effects, explosions]) for (const view of views.values()) view.destroy()
      for (const item of [tilesView, pathView, snapView, hazards]) item.destroy()
      sheets.destroy()
      stage.destroy()
    },
  }
}
