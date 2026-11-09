import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { createContactShadow } from './contactShadow.js'
import { makeIsoCamera, syncIsoCamera } from './isoProjection.js'
import { ProceduralBody, PROCEDURAL_HEIGHT } from './ProceduralBody.js'
import { resolveSpike3dAppearance } from './appearance.js'
import { createSkeletonOverlay } from './skeletonOverlay.js'
import { HumanoidRagdoll } from './HumanoidRagdoll.js'
import { PhysicsWorld } from './PhysicsWorld.js'
import {
  DEFAULT_RAGDOLL_SETTINGS,
  cloneRagdollSettings,
  impulseFromRagdollSettings,
} from './ragdollSettings.js'

const HEIGHT = PROCEDURAL_HEIGHT
const PIVOT_Y = HEIGHT * 0.5
// Radians per pixel of left-drag (horizontal → yaw, vertical → pitch).
const YAW_PER_PX = 0.01
const PITCH_PER_PX = 0.008
const PITCH_MIN = -Math.PI / 2 + 0.08
const PITCH_MAX = Math.PI / 2 - 0.08
// Wheel zoom: larger = closer. ViewBox shrinks around its centre.
const ZOOM_MIN = 0.45
const ZOOM_MAX = 3.5
const BASE_VIEW = { x: -90, y: -140, width: 180, height: 200 }
// Same yaw bias SpikeActors use on the board under the locked iso camera.
const ISO_YAW = Math.PI / 4

/**
 * Standalone Spike3d preview for the Animation Viewer (not a board SpikeActor).
 * Parent owns transport: clip, playing, progress (0–1). Reports progress while playing.
 * Left-drag rotates about mid-body (unless lockedIso); middle-drag pans; wheel zooms.
 */
export default function AnimationPreview({
  clip = 'idle',
  playing = true,
  progress = 0,
  appearance = null,
  lockedIso = false,
  loopOnce = false,
  showSkeleton = false,
  ragdollSettings = null,
  onProgress = null,
  onRagdollActive = null,
  controllerRef = null,
  className = 'av-preview-canvas',
}) {
  const hostRef = useRef(null)
  const canvasRef = useRef(null)
  const apiRef = useRef(null)
  const onProgressRef = useRef(onProgress)
  const onRagdollActiveRef = useRef(onRagdollActive)
  const ragdollSettingsRef = useRef(cloneRagdollSettings(ragdollSettings ?? DEFAULT_RAGDOLL_SETTINGS))
  onProgressRef.current = onProgress
  onRagdollActiveRef.current = onRagdollActive
  ragdollSettingsRef.current = cloneRagdollSettings(ragdollSettings ?? DEFAULT_RAGDOLL_SETTINGS)

  useEffect(() => {
    const canvas = canvasRef.current
    const host = hostRef.current
    if (!canvas || !host) return undefined

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    })
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.sortObjects = true

    const scene = new THREE.Scene()
    const camera = makeIsoCamera()

    const hemi = new THREE.HemisphereLight(0xc8d4e4, 0x2a3038, 0.95)
    scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xfff2e0, 0.55)
    sun.position.set(6, 12, 5)
    scene.add(sun)
    scene.add(sun.target)
    const fill = new THREE.DirectionalLight(0xa8b8c8, 0.35)
    fill.position.set(-5, 7, -3)
    scene.add(fill)
    const rim = new THREE.DirectionalLight(0xb0c4d8, 0.22)
    rim.position.set(-2, 5, 8)
    scene.add(rim)

    // Pivot at mid-body: figure offset so feet sit at world y=0 when upright.
    const pivot = new THREE.Group()
    pivot.name = 'av_pivot'
    pivot.position.y = PIVOT_Y
    pivot.rotation.order = 'YXZ'
    pivot.rotation.y = ISO_YAW
    pivot.rotation.x = 0
    scene.add(pivot)
    let lockedIsoView = Boolean(lockedIso)

    const figure = new THREE.Group()
    figure.name = 'av_figure'
    figure.position.y = -PIVOT_Y
    pivot.add(figure)

    const resolved = resolveSpike3dAppearance(appearance ?? {})
    const body = new ProceduralBody({ height: HEIGHT, uniform: resolved.uniform, appearance: resolved })
    body.setViewerHoldOnce(true)
    body.setViewerLoopOnce(loopOnce)
    figure.add(body.root)

    const shadow = createContactShadow({ width: HEIGHT * 0.55, depth: HEIGHT * 0.32 })
    figure.add(shadow)

    const skeleton = createSkeletonOverlay(body.model, { jointRadius: HEIGHT * 0.018 })
    scene.add(skeleton.root)
    skeleton.setVisible(showSkeleton)

    let alive = true
    let last = performance.now()
    let raf = 0
    let currentClip = 'idle'
    let lastSeek = -1
    let appearanceKey = ''
    let drag = null
    let physics = null
    let physicsPromise = null
    let ragdoll = null
    let ragdollActive = false
    let wantPlaying = playing

    const reportRagdoll = (on) => {
      ragdollActive = Boolean(on)
      onRagdollActiveRef.current?.(ragdollActive)
    }

    const clearRagdoll = () => {
      ragdoll?.disposeBodies()
      // Physics wrote local position/quaternion on joints; rotations alone won't stand them up.
      body.model?.restoreBindLocals?.()
      body.root.visible = true
      if (shadow) shadow.visible = true
      body.play(currentClip, { force: true })
      body.setPaused(!wantPlaying)
      lastSeek = -1
      reportRagdoll(false)
    }

    const ensurePhysics = () => {
      if (physics) return Promise.resolve(physics)
      if (physicsPromise) return physicsPromise
      physicsPromise = PhysicsWorld.create({ x: 0, y: ragdollSettingsRef.current.gravity, z: 0 })
        .then((world) => {
          if (!alive) {
            world.dispose()
            return null
          }
          // Deck under the feet (top at y=0) plus soft walls so flops stay in frame.
          world.addStaticBox({ x: 0, y: -0.25, z: 0 }, { x: 10, y: 0.25, z: 10 }, 'floor')
          world.addStaticBox({ x: 0, y: 1.6, z: -5 }, { x: 10, y: 2, z: 0.25 }, 'wall')
          world.addStaticBox({ x: 0, y: 1.6, z: 5 }, { x: 10, y: 2, z: 0.25 }, 'wall')
          world.addStaticBox({ x: -5, y: 1.6, z: 0 }, { x: 0.25, y: 2, z: 10 }, 'wall')
          world.addStaticBox({ x: 5, y: 1.6, z: 0 }, { x: 0.25, y: 2, z: 10 }, 'wall')
          world.setGravity(ragdollSettingsRef.current.gravity)
          physics = world
          return world
        })
        .catch((err) => {
          console.error('[AnimationPreview] Rapier init failed', err)
          physicsPromise = null
          return null
        })
      return physicsPromise
    }

    // Iso viewBox framed on a standing figure (board px via syncIsoCamera).
    const viewBox = { ...BASE_VIEW }
    let zoom = 1
    let panX = 0
    let panY = 0

    const applyView = () => {
      const w = BASE_VIEW.width / zoom
      const h = BASE_VIEW.height / zoom
      const cx = BASE_VIEW.x + BASE_VIEW.width / 2 + panX
      const cy = BASE_VIEW.y + BASE_VIEW.height / 2 + panY
      viewBox.x = cx - w / 2
      viewBox.y = cy - h / 2
      viewBox.width = w
      viewBox.height = h
    }
    applyView()

    const syncSize = () => {
      const w = Math.max(1, Math.floor(host.clientWidth))
      const h = Math.max(1, Math.floor(host.clientHeight))
      renderer.setSize(w, h, false)
      canvas.style.width = '100%'
      canvas.style.height = '100%'
    }
    syncSize()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncSize) : null
    if (ro) ro.observe(host)
    window.addEventListener('resize', syncSize)

    const onPointerDown = (event) => {
      // 0 = left rotate, 1 = middle pan.
      if (event.button === 1) {
        event.preventDefault()
        drag = {
          mode: 'pan',
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          panX,
          panY,
        }
        host.classList.add('is-panning')
        host.setPointerCapture?.(event.pointerId)
        return
      }
      if (event.button !== 0) return
      event.preventDefault()
      drag = {
        // Locked iso: yaw only (keep board pitch). Free: yaw + pitch.
        mode: lockedIsoView ? 'yaw' : 'orbit',
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        yaw: pivot.rotation.y,
        pitch: pivot.rotation.x,
      }
      host.classList.add('is-dragging')
      host.setPointerCapture?.(event.pointerId)
    }
    const onPointerMove = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      const dx = event.clientX - drag.x
      const dy = event.clientY - drag.y
      if (drag.mode === 'pan') {
        const rect = host.getBoundingClientRect()
        const sx = rect.width > 0 ? viewBox.width / rect.width : 1
        const sy = rect.height > 0 ? viewBox.height / rect.height : 1
        // Grab the scene: drag right moves the figure with the pointer.
        panX = drag.panX - dx * sx
        panY = drag.panY - dy * sy
        applyView()
        return
      }
      pivot.rotation.y = drag.yaw + dx * YAW_PER_PX
      if (drag.mode === 'yaw') {
        pivot.rotation.x = 0
        return
      }
      // Drag up → tip away from camera.
      pivot.rotation.x = Math.min(PITCH_MAX, Math.max(PITCH_MIN, drag.pitch + dy * PITCH_PER_PX))
    }
    const endDrag = (event) => {
      if (!drag || (event && event.pointerId !== drag.pointerId)) return
      host.classList.remove('is-dragging', 'is-panning')
      try {
        host.releasePointerCapture?.(drag.pointerId)
      } catch {
        /* already released */
      }
      drag = null
    }
    const onWheel = (event) => {
      event.preventDefault()
      const delta = event.deltaY
      // Trackpads send small deltas; mouse wheels larger. Exponential zoom feels even.
      const factor = Math.exp(-delta * 0.0015)
      zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * factor))
      applyView()
    }
    // Block browser autoscroll / middle-click paste on the preview.
    const onAuxClick = (event) => {
      if (event.button === 1) event.preventDefault()
    }
    host.addEventListener('pointerdown', onPointerDown)
    host.addEventListener('pointermove', onPointerMove)
    host.addEventListener('pointerup', endDrag)
    host.addEventListener('pointercancel', endDrag)
    host.addEventListener('lostpointercapture', endDrag)
    host.addEventListener('wheel', onWheel, { passive: false })
    host.addEventListener('auxclick', onAuxClick)

    const api = {
      setClip(name) {
        const next = name || 'idle'
        if (ragdollActive) clearRagdoll()
        if (next === currentClip) return
        currentClip = next
        body.play(next, { force: true })
        lastSeek = -1
      },
      setPlaying(on) {
        wantPlaying = Boolean(on)
        if (ragdollActive) return
        body.setPaused(!wantPlaying)
      },
      seek(u) {
        if (ragdollActive) return
        const t = Math.min(1, Math.max(0, Number(u) || 0))
        if (Math.abs(t - lastSeek) < 1e-4) return
        lastSeek = t
        body.seek(t)
      },
      setAppearance(next) {
        // Viewer may pass a fully resolved appearance (incl. hair override); otherwise resolve from ids.
        const resolvedNext =
          next?.species && next?.gender && next?.hairStyle
            ? next
            : resolveSpike3dAppearance(next ?? {})
        const key = `${resolvedNext.species}|${resolvedNext.gender}|${resolvedNext.hairStyle}|${resolvedNext.hairColour}|${resolvedNext.klingonArmour}|${resolvedNext.outfit}|${resolvedNext.uniform ?? ''}`
        if (key === appearanceKey) return
        appearanceKey = key
        body.setAppearance(resolvedNext)
      },
      progress() {
        return body.progress
      },
      setLockedIso(on) {
        lockedIsoView = Boolean(on)
        if (lockedIsoView) {
          // Keep current yaw; only flatten pitch back to board iso.
          pivot.rotation.x = 0
          if (drag?.mode === 'orbit') drag.mode = 'yaw'
        }
        host.classList.toggle('is-iso-locked', lockedIsoView)
      },
      setLoopOnce(on) {
        body.setViewerLoopOnce(on)
      },
      setShowSkeleton(on) {
        skeleton.setVisible(on)
      },
      setRagdollSettings(next) {
        const settings = cloneRagdollSettings(next ?? DEFAULT_RAGDOLL_SETTINGS)
        ragdollSettingsRef.current = settings
        physics?.setGravity(settings.gravity)
        ragdoll?.setTuning(settings)
      },
      async triggerRagdoll() {
        if (ragdollActive && ragdoll && !ragdoll.settled) return
        if (ragdollActive) clearRagdoll()
        const world = await ensurePhysics()
        if (!alive || !world) return
        const settings = ragdollSettingsRef.current
        world.setGravity(settings.gravity)
        body.root.updateWorldMatrix(true, true)
        body.setPaused(true)
        if (shadow) shadow.visible = false
        if (!ragdoll) {
          ragdoll = new HumanoidRagdoll(world, scene, {
            height: HEIGHT,
            materials: body.materials,
          })
        }
        ragdoll.setTuning(settings)
        body.root.userData.humanoidModel = body.model
        ragdoll.activate(body.root, impulseFromRagdollSettings(settings), null)
        reportRagdoll(true)
      },
      resetRagdoll() {
        if (!ragdollActive) return
        clearRagdoll()
      },
      get ragdollActive() {
        return ragdollActive
      },
    }
    apiRef.current = api
    if (controllerRef) controllerRef.current = api
    api.setClip(clip)
    api.setPlaying(playing)
    api.seek(progress)
    api.setAppearance(appearance)
    api.setLockedIso(lockedIso)
    api.setLoopOnce(loopOnce)
    api.setShowSkeleton(showSkeleton)
    api.setRagdollSettings(ragdollSettings)

    const tick = (now) => {
      if (!alive) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (ragdollActive && physics) {
        physics.step(dt)
      } else {
        body.update(dt, null)
        if (shadow) {
          const y = body.bodyY
          shadow.position.y = 0.02 + y * 0.15
          const squash = Math.max(0.7, 1 - y * 1.2)
          shadow.scale.set(squash, squash, 1)
        }
        if (!body.paused && onProgressRef.current) onProgressRef.current(body.progress)
      }
      skeleton.update()
      syncIsoCamera(camera, viewBox, renderer)
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', syncSize)
      host.removeEventListener('pointerdown', onPointerDown)
      host.removeEventListener('pointermove', onPointerMove)
      host.removeEventListener('pointerup', endDrag)
      host.removeEventListener('pointercancel', endDrag)
      host.removeEventListener('lostpointercapture', endDrag)
      host.removeEventListener('wheel', onWheel)
      host.removeEventListener('auxclick', onAuxClick)
      host.classList.remove('is-dragging', 'is-panning', 'is-iso-locked')
      ro?.disconnect()
      apiRef.current = null
      if (controllerRef) controllerRef.current = null
      ragdoll?.dispose()
      ragdoll = null
      physics?.dispose()
      physics = null
      skeleton.dispose()
      body.dispose()
      shadow.geometry?.dispose?.()
      shadow.material?.dispose?.()
      renderer.dispose()
      onRagdollActiveRef.current?.(false)
    }
    // Mount once; props sync through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    apiRef.current?.setClip(clip)
  }, [clip])

  useEffect(() => {
    apiRef.current?.setPlaying(playing)
  }, [playing])

  // Only scrub while paused — while playing, update() owns the playhead (avoid seek fighting dt).
  useEffect(() => {
    if (playing) return
    apiRef.current?.seek(progress)
  }, [progress, playing])

  useEffect(() => {
    apiRef.current?.setAppearance(appearance)
  }, [appearance])

  useEffect(() => {
    apiRef.current?.setLockedIso(lockedIso)
  }, [lockedIso])

  useEffect(() => {
    apiRef.current?.setLoopOnce(loopOnce)
  }, [loopOnce])

  useEffect(() => {
    apiRef.current?.setShowSkeleton(showSkeleton)
  }, [showSkeleton])

  useEffect(() => {
    apiRef.current?.setRagdollSettings(ragdollSettings)
  }, [ragdollSettings])

  return (
    <div
      ref={hostRef}
      className="av-preview-host"
      title={
        lockedIso
          ? 'Locked iso · left-drag turn · middle-drag pan · scroll zoom'
          : 'Left-drag rotate · middle-drag pan · scroll zoom'
      }
    >
      <canvas ref={canvasRef} className={className} aria-hidden="true" />
    </div>
  )
}
