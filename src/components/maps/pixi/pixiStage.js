import { Application, Container, UPDATE_PRIORITY } from 'pixi.js'
import { MapLayers } from './mapLayers.js'
import { PERF, perfEnd, perfStart } from '../../../dev/perfProbe.js'

// What every Pixi board shares (exploration, combat, the map editor): one WebGL canvas behind the board's SVG overlay,
// its camera copied from the overlay's viewBox each frame, and the map's layers. Bottom up: the floor, the ground items, the blocks sorted by depth among the figures, the darkness, then the effects (lit, so
// above the darkness). Presentation only.

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Keeps one view per id in a container: views made with make(), updated with update(view, item), destroyed when gone.
export function reconcile(views, items, container, make, update) {
  const seen = new Set()
  for (const item of items) {
    seen.add(item.id)
    let view = views.get(item.id)
    if (!view) {
      view = make()
      views.set(item.id, view)
      container.addChild(view.container ?? view.sprite ?? view.graphics)
    }
    update(view, item)
  }
  for (const [id, view] of views) {
    if (seen.has(id)) continue
    view.destroy()
    views.delete(id)
  }
}

// Starts a stage in host (a positioned element the size of the overlay SVG). Resolves to the stage, or null if
// destroyed (isCancelled) before it started; rejects if WebGL can't start. The board adds its per-frame drawing with
// stage.onFrame(fn) and calls stage.frame(svg) and stage.syncMap(...) from it.
export async function startPixiStage(host, isCancelled) {
  const app = new Application()
  await app.init({ backgroundAlpha: 0, antialias: true, autoDensity: true, resolution: window.devicePixelRatio || 1, resizeTo: host, preference: 'webgl' })
  if (isCancelled()) {
    app.destroy(true, { children: true })
    return null
  }
  app.canvas.classList.add('pixi-board-canvas')
  host.appendChild(app.canvas)

  const world = new Container()
  const floorLayer = new Container()
  const groundLayer = new Container()
  const depthLayer = new Container()
  depthLayer.sortableChildren = true
  const darkLayer = new Container()
  const fxLayer = new Container()
  world.addChild(floorLayer, groundLayer, depthLayer, darkLayer, fxLayer)
  app.stage.addChild(world)

  let map = null
  let mapOptions = ''
  const frames = []

  // xMidYMid meet, as the SVG maps its viewBox onto its box. Returns the world area on screen (with a margin).
  const syncCamera = (svg) => {
    const view = svg?.viewBox?.baseVal
    const width = host.clientWidth
    const height = host.clientHeight
    if (!view?.width || !width) return null
    const scale = Math.min(width / view.width, height / view.height)
    world.scale.set(scale)
    world.position.set((width - view.width * scale) / 2 - view.x * scale, (height - view.height * scale) / 2 - view.y * scale)
    const margin = 64
    return { x: -world.position.x / scale - margin, y: -world.position.y / scale - margin, width: width / scale + 2 * margin, height: height / scale + 2 * margin }
  }

  // The app scales its whole stage to fit the window (a CSS transform), so the canvas is drawn at that scale times the
  // screen's density to stay as sharp as the SVG.
  const syncResolution = () => {
    const width = host.clientWidth
    if (!width) return
    const resolution = (window.devicePixelRatio || 1) * (host.getBoundingClientRect().width / width)
    if (Math.abs(resolution - app.renderer.resolution) > 0.01) app.renderer.resize(width, host.clientHeight, resolution)
  }

  return {
    app,
    layers: { world, floorLayer, groundLayer, depthLayer, darkLayer, fxLayer },
    get map() {
      return map
    },
    // Resolution and camera for this frame; returns the world area on screen, or null before the SVG has a viewBox.
    frame(svg) {
      syncResolution()
      return syncCamera(svg)
    },
    // The map's layers for layout: rebuilt when size / ghost / lighting change; playing toggles in place so tile
    // animations are not torn down (an async build() race used to leave the board stuck on frame 0).
    syncMap(layout, options, now) {
      const key = [layout.map.width, layout.map.height, options.ghost, options.lighting].join('|')
      if (!map || key !== mapOptions) {
        map?.destroy()
        map = new MapLayers({ floorLayer, depthLayer, darkLayer }, layout, options)
        mapOptions = key
        map.build()
      } else {
        const playing = Boolean(options.playing)
        if (map.playing !== playing) {
          map.playing = playing
          for (const item of map.animated) item.shown = null
        }
        if (map.target !== layout) map.setLayout(layout, now)
      }
      return map
    },
    onFrame(fn) {
      // Pixi's ticker stops for good when a callback throws (the board would stay blank), so a bad frame is logged
      // once and the next frame still runs.
      let reported = false
      const guarded = (ticker) => {
        try {
          fn(ticker)
        } catch (error) {
          if (!reported) console.error('Pixi board frame failed.', error)
          reported = true
        }
      }
      const timed = PERF
        ? (ticker) => {
            const started = perfStart()
            guarded(ticker)
            perfEnd('pixi.frame', started)
          }
        : guarded
      frames.push(timed)
      app.ticker.add(timed, null, UPDATE_PRIORITY.HIGH)
    },
    destroy() {
      for (const fn of frames) app.ticker.remove(fn)
      map?.destroy()
      app.destroy(true, { children: true })
    },
  }
}
