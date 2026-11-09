import { useEffect, useRef } from 'react'
import { Spike3dScene } from './Spike3dScene.js'

/** Live SVG viewBox — WASD/drag write this on the element every frame, bypassing React camera state. */
function readSvgViewBox(svg) {
  const view = svg?.viewBox?.baseVal
  if (!view?.width) return null
  return { x: view.x, y: view.y, width: view.width, height: view.height }
}

/** Stable key so React state that replaces `map` with an equivalent object does not remount WebGL. */
function mapSceneKey(map) {
  if (!map) return ''
  return `${map.name ?? ''}|${map.width}x${map.height}|${map.tiles?.length ?? 0}`
}

/**
 * Transparent Three.js canvas over the Pixi board host. pointer-events: none — SVG keeps input.
 * posesRef: mutable { current: pose[] }.
 * svgRef: board SVG — camera must follow its live viewBox (same as Pixi), not React state.
 * frameRef: Pixi boardScene/battleScene calls this after stage.frame(svg) so 3D and rings share one camera sample.
 * fadedRef: Set of tile keys / template ids currently wall-faded — matching occluders turn off.
 */
export default function Spike3dOverlay({ map, posesRef, svgRef, hostRef, frameRef, fadedRef }) {
  const canvasRef = useRef(null)
  const mapRef = useRef(map)
  mapRef.current = map
  const sceneKey = mapSceneKey(map)

  useEffect(() => {
    const canvas = canvasRef.current
    const initialMap = mapRef.current
    if (!canvas || !initialMap) return undefined

    const scene = new Spike3dScene(canvas, initialMap)
    let alive = true
    scene.init().catch((err) => {
      console.error('[spike3d] scene init failed', err)
    })

    const syncSize = () => {
      const host = hostRef?.current ?? canvas.parentElement
      if (!host) return
      const { clientWidth: w, clientHeight: h } = host
      scene.setSize(w, h)
      canvas.style.width = '100%'
      canvas.style.height = '100%'
    }
    syncSize()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncSize) : null
    const host = hostRef?.current ?? canvas.parentElement
    if (ro && host) ro.observe(host)
    window.addEventListener('resize', syncSize)

    // Z: toggle wall/floor collider debug boxes while spike3d is on.
    const onKey = (event) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.code !== 'KeyZ') return
      const tag = event.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      event.preventDefault()
      scene.toggleCollidersVisible()
    }
    window.addEventListener('keydown', onKey, true)

    canvas.dataset.spikeReady = '0'

    if (frameRef) {
      frameRef.current = () => {
        if (!alive) return
        scene.frame(posesRef?.current ?? [], readSvgViewBox(svgRef?.current), fadedRef?.current ?? null)
        // Handoff cover (ExplorationScreen) waits for this before lifting the freeze.
        if (scene._paintedOnce && canvas.dataset.spikeReady !== '1') {
          canvas.dataset.spikeReady = '1'
        }
      }
    }

    return () => {
      alive = false
      canvas.dataset.spikeReady = '0'
      if (frameRef) frameRef.current = null
      window.removeEventListener('resize', syncSize)
      window.removeEventListener('keydown', onKey, true)
      ro?.disconnect()
      scene.dispose()
    }
    // sceneKey: remount only when the map's identity meaningfully changes (not every React state clone).
  }, [sceneKey, posesRef, svgRef, hostRef, frameRef, fadedRef])

  return <canvas ref={canvasRef} className="spike3d-overlay-canvas" aria-hidden="true" />
}
