import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { createContactShadow } from './contactShadow.js'
import { makeIsoCamera, syncIsoCamera, syncIsoCameraFill } from './isoProjection.js'
import { ProceduralBody, PROCEDURAL_HEIGHT } from './ProceduralBody.js'
import { resolveSpike3dAppearance } from './appearance.js'
import { createSkeletonOverlay } from './skeletonOverlay.js'
import { HumanoidRagdoll } from './HumanoidRagdoll.js'
import { PhysicsWorld } from './PhysicsWorld.js'
import {
  DEFAULT_ATTACHMENT_SETTINGS,
  cloneAttachmentSettings,
} from './attachmentSettings.js'
import {
  DEFAULT_RAGDOLL_SETTINGS,
  cloneRagdollSettings,
  impulseFromRagdollSettings,
} from './ragdollSettings.js'
import {
  DEFAULT_VIEWER_LIGHT_SETTINGS,
  cloneViewerLightSettings,
  lightPositionFromSettings,
} from './viewerLightSettings.js'

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
// Locked-iso reference deck: one cell per board tile, 64×64 tiles centred on the figure.
const ISO_FLOOR_TILES = 64
const ISO_FLOOR_LIGHT = '#4a5566'
const ISO_FLOOR_DARK = '#2c3340'

/** Flat checkered plane in XZ (y ≈ 0). World units = board tiles. */
function createIsoCheckerFloor(tiles = ISO_FLOOR_TILES) {
  const n = Math.max(2, Math.floor(tiles))
  const canvas = document.createElement('canvas')
  canvas.width = n
  canvas.height = n
  const ctx = canvas.getContext('2d')
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? ISO_FLOOR_LIGHT : ISO_FLOOR_DARK
      ctx.fillRect(x, y, 1, 1)
    }
  }
  const map = new THREE.CanvasTexture(canvas)
  map.magFilter = THREE.NearestFilter
  map.minFilter = THREE.NearestFilter
  map.colorSpace = THREE.SRGBColorSpace
  map.needsUpdate = true
  const geo = new THREE.PlaneGeometry(n, n)
  const mat = new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    opacity: 0.92,
    depthWrite: true,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'av_iso_floor'
  mesh.rotation.x = -Math.PI / 2
  // Sit just under the contact shadow so feet read on the deck.
  mesh.position.y = -0.02
  mesh.visible = false
  mesh.userData.dispose = () => {
    geo.dispose()
    mat.dispose()
    map.dispose()
  }
  return mesh
}

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
  attachmentSettings = null,
  lightSettings = null,
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
  const attachmentSettingsRef = useRef(cloneAttachmentSettings(attachmentSettings ?? DEFAULT_ATTACHMENT_SETTINGS))
  const lightSettingsRef = useRef(cloneViewerLightSettings(lightSettings ?? DEFAULT_VIEWER_LIGHT_SETTINGS))
  onProgressRef.current = onProgress
  onRagdollActiveRef.current = onRagdollActive
  ragdollSettingsRef.current = cloneRagdollSettings(ragdollSettings ?? DEFAULT_RAGDOLL_SETTINGS)
  attachmentSettingsRef.current = cloneAttachmentSettings(attachmentSettings ?? DEFAULT_ATTACHMENT_SETTINGS)
  lightSettingsRef.current = cloneViewerLightSettings(lightSettings ?? DEFAULT_VIEWER_LIGHT_SETTINGS)

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

    const hemi = new THREE.HemisphereLight(0xc8d4e4, 0x2a3038, DEFAULT_VIEWER_LIGHT_SETTINGS.hemiIntensity)
    scene.add(hemi)
    // Soft directional fill / rim stay fixed; the key lamp is the slider-driven point light.
    const fill = new THREE.DirectionalLight(0xa8b8c8, 0.22)
    fill.position.set(-5, 7, -3)
    scene.add(fill)
    const rim = new THREE.DirectionalLight(0xb0c4d8, 0.16)
    rim.position.set(-2, 5, 8)
    scene.add(rim)

    const keyLight = new THREE.PointLight(0xfff2e0, DEFAULT_VIEWER_LIGHT_SETTINGS.intensity, 0, 1.1)
    keyLight.name = 'av_key_light'
    scene.add(keyLight)
    const markerGeo = new THREE.SphereGeometry(0.18, 16, 12)
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xffe08a })
    const lightMarker = new THREE.Mesh(markerGeo, markerMat)
    lightMarker.name = 'av_key_light_marker'
    scene.add(lightMarker)

    const applyLightSettings = (next) => {
      const settings = cloneViewerLightSettings(next ?? DEFAULT_VIEWER_LIGHT_SETTINGS)
      lightSettingsRef.current = settings
      const pos = lightPositionFromSettings(settings)
      // Pivot sits at mid-body; place the lamp in that same space.
      keyLight.position.set(pos.x, PIVOT_Y + pos.y, pos.z)
      keyLight.intensity = Math.max(0, Number(settings.intensity) || 0)
      hemi.intensity = Math.max(0, Number(settings.hemiIntensity) || 0)
      lightMarker.position.copy(keyLight.position)
      lightMarker.visible = Boolean(settings.showMarker)
    }
    applyLightSettings(lightSettingsRef.current)

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

    // Deck under the figure: yaw follows the pivot so drag reads as camera orbit, not a turntable.
    const isoFloorRoot = new THREE.Group()
    isoFloorRoot.name = 'av_iso_floor_yaw'
    const isoFloor = createIsoCheckerFloor(ISO_FLOOR_TILES)
    isoFloorRoot.add(isoFloor)
    scene.add(isoFloorRoot)

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

    // Iso viewBox framed on a standing figure (board px). Aspect tracks the host so fill mode has no bars.
    const viewBox = { ...BASE_VIEW }
    let zoom = 1
    let panX = 0
    let panY = 0

    const applyView = () => {
      const hostW = Math.max(1, host.clientWidth)
      const hostH = Math.max(1, host.clientHeight)
      const aspect = hostW / hostH
      // Keep BASE_VIEW's vertical framing; widen/narrow to the canvas so syncIsoCameraFill covers edge to edge.
      const h = BASE_VIEW.height / zoom
      const w = h * aspect
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
      applyView()
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
          // Opaque deck behind the checker so resize/pan never flashes the host gradient.
          renderer.setClearColor(new THREE.Color(ISO_FLOOR_DARK), 1)
        } else {
          renderer.setClearColor(0x000000, 0)
        }
        isoFloor.visible = lockedIsoView
        host.classList.toggle('is-iso-locked', lockedIsoView)
        applyView()
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
      setAttachmentSettings(next) {
        const settings = cloneAttachmentSettings(next ?? DEFAULT_ATTACHMENT_SETTINGS)
        attachmentSettingsRef.current = settings
        body.setAttachmentSettings(settings)
      },
      setLightSettings(next) {
        applyLightSettings(next)
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
    api.setAttachmentSettings(attachmentSettings)
    api.setLightSettings(lightSettings)

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
      // Floor yaws with the figure pivot → checkerboard orbits with the “camera”.
      isoFloorRoot.rotation.y = pivot.rotation.y
      if (lockedIsoView) syncIsoCameraFill(camera, viewBox, renderer)
      else syncIsoCamera(camera, viewBox, renderer)
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
      isoFloor.userData.dispose?.()
      scene.remove(isoFloorRoot)
      markerGeo.dispose()
      markerMat.dispose()
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

  useEffect(() => {
    apiRef.current?.setAttachmentSettings(attachmentSettings)
  }, [attachmentSettings])

  useEffect(() => {
    apiRef.current?.setLightSettings(lightSettings)
  }, [lightSettings])

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
