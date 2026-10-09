import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// Presentation only: which part of the battlefield is on screen. WASD / arrow keys, right-click drag or one-finger drag pan, the mouse wheel zooms; when focus.key changes
// (a new turn, or a unit finished a move) the camera glides to centre focus.point. Never touches combat state.
const PAN_SPEED = 700
const GLIDE = 0.14
const KEYS = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] }

function clampAxis(value, min, max, view) {
  if (max - min <= view) return (min + max - view) / 2
  return Math.min(Math.max(value, min), max - view)
}

const clamp = (camera, bounds, view) => ({
  x: clampAxis(camera.x, bounds.minX, bounds.maxX, view.width),
  y: clampAxis(camera.y, bounds.minY, bounds.maxY, view.height),
})

const centredOn = (point, view) => ({ x: point.x - view.width / 2, y: point.y - view.height / 2 })

const TOUCH_SLOP = 10
const MIN_ZOOM = 0.6
const MAX_ZOOM = 2
const ZOOM_STEP = 1.15

function swallowNextClick() {
  const swallow = (event) => {
    event.stopPropagation()
    event.preventDefault()
  }
  window.addEventListener('click', swallow, { capture: true, once: true })
  // If the browser sends no click after the drag, don't eat the next real tap.
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 400)
}

const isTyping = (target) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

// bounds: world rectangle { minX, maxX, minY, maxY }; view: { width, height }; focus: { key, point }.
// follow false: the camera stays where the player left it (it still starts centred on focus).
// onRightClick: a right-button press released without dragging (a drag pans instead).
// rightPans: the right button drags the camera too (false where it has another use). The middle button always does.
// The mouse wheel zooms; zoom divides the visible world size, so 2 shows half as much at twice the size. Following, it
// zooms around the followed point so that stays put on screen; free, it zooms toward the pointer.
export default function useCamera(bounds, view, focus, follow = true, onRightClick = null, rightPans = true) {
  const [camera, setCamera] = useState(() => clamp(centredOn(focus.point, view), bounds, view))
  const [zoom, setZoom] = useState(1)
  const cameraRef = useRef(camera)
  const zoomRef = useRef(zoom)
  // The world point the camera is gliding to centre on (not a corner), so a zoom mid-glide doesn't restart it.
  const targetRef = useRef(null)
  const heldRef = useRef(new Set())
  const svgRef = useRef(null)
  const followRef = useRef({ follow, point: focus.point })
  // True while a glide, key-pan or drag is in flight (see writeViewBox).
  const movingRef = useRef(false)
  const { minX, maxX, minY, maxY } = bounds
  const width = view.width / zoom
  const height = view.height / zoom
  const { x: focusX, y: focusY } = focus.point

  // A camera move changes nothing on the board except which part of it is on screen, but it happens on every animation
  // frame of a glide or drag. Writing the viewBox straight onto the element keeps those frames out of React, which would
  // otherwise rebuild the board's hundreds of tiles each time; the state is committed once the move settles.
  const writeViewBox = (point) => {
    svgRef.current?.setAttribute('viewBox', `${point.x} ${point.y} ${width} ${height}`)
  }

  // React renders the viewBox from state, which lags behind during a move: put the live camera back after every render.
  useLayoutEffect(() => {
    if (movingRef.current) writeViewBox(cameraRef.current)
  })

  useEffect(() => {
    const element = svgRef.current
    if (!element) return undefined
    // Native listener: React's wheel handler is passive and can't stop the page from scrolling.
    const wheel = (event) => {
      event.preventDefault()
      const oldZoom = zoomRef.current
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * (event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)))
      if (newZoom === oldZoom) return
      const oldSize = { width: view.width / oldZoom, height: view.height / oldZoom }
      const newSize = { width: view.width / newZoom, height: view.height / newZoom }
      const current = cameraRef.current
      const following = followRef.current.follow
      let anchor
      if (following) {
        anchor = followRef.current.point
      } else {
        const rect = element.getBoundingClientRect()
        anchor = { x: current.x + ((event.clientX - rect.left) / rect.width) * oldSize.width, y: current.y + ((event.clientY - rect.top) / rect.height) * oldSize.height }
      }
      const fx = (anchor.x - current.x) / oldSize.width
      const fy = (anchor.y - current.y) / oldSize.height
      const next = clamp({ x: anchor.x - fx * newSize.width, y: anchor.y - fy * newSize.height }, { minX, maxX, minY, maxY }, newSize)
      if (!following) targetRef.current = null
      zoomRef.current = newZoom
      cameraRef.current = next
      setZoom(newZoom)
      setCamera(next)
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [minX, maxX, minY, maxY, view.width, view.height])

  useEffect(() => {
    followRef.current = { follow, point: { x: focusX, y: focusY } }
    targetRef.current = follow ? { x: focusX, y: focusY } : null
  }, [focus.key, focusX, focusY, follow])

  useEffect(() => {
    const down = (event) => {
      const key = event.key.toLowerCase()
      if (!KEYS[key] || isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return
      event.preventDefault()
      heldRef.current.add(key)
    }
    const up = (event) => heldRef.current.delete(event.key.toLowerCase())
    const clear = () => heldRef.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

  useEffect(() => {
    const limits = { minX, maxX, minY, maxY }
    const size = { width, height }
    let frame
    let last = performance.now()
    const tick = (now) => {
      const seconds = Math.min(50, now - last) / 1000
      last = now
      let dx = 0
      let dy = 0
      for (const key of heldRef.current) {
        dx += KEYS[key][0]
        dy += KEYS[key][1]
      }
      const current = cameraRef.current
      let next = null
      if (dx || dy) {
        targetRef.current = null
        next = clamp({ x: current.x + Math.sign(dx) * PAN_SPEED * seconds, y: current.y + Math.sign(dy) * PAN_SPEED * seconds }, limits, size)
      } else if (targetRef.current) {
        const target = clamp(centredOn(targetRef.current, size), limits, size)
        const close = Math.abs(target.x - current.x) < 0.5 && Math.abs(target.y - current.y) < 0.5
        next = close ? target : { x: current.x + (target.x - current.x) * GLIDE, y: current.y + (target.y - current.y) * GLIDE }
        if (close) targetRef.current = null
      }
      if (next && (next.x !== current.x || next.y !== current.y)) {
        cameraRef.current = next
        movingRef.current = true
        svgRef.current?.setAttribute('viewBox', `${next.x} ${next.y} ${size.width} ${size.height}`)
      } else if (movingRef.current) {
        // Settled: one render to put the element's viewBox and React's idea of the camera back in step.
        movingRef.current = false
        setCamera(cameraRef.current)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [minX, maxX, minY, maxY, width, height])

  // Right-button drag (mouse) or one-finger drag (touch): the world follows the pointer. Screen pixels are converted to
  // world pixels using the element's on-screen size, because the whole stage is scaled to fit the window.
  // A touch only pans once it has moved past TOUCH_SLOP, so a tap still selects a tile or unit; after a pan, the click
  // the browser sends on release is swallowed so the drag doesn't also move the character.
  const startDrag = (event) => {
    const isTouch = event.pointerType === 'touch'
    // A middle-button press would start the browser's autoscroll; the wheel zooms instead.
    if (!isTouch && event.button === 1) event.preventDefault()
    if (isTouch ? !event.isPrimary : !(event.button === 1 || (rightPans && event.button === 2))) return
    if (!isTouch) event.preventDefault()
    const scale = event.currentTarget.getBoundingClientRect().width / width
    const start = { x: event.clientX, y: event.clientY, camera: cameraRef.current }
    let panning = !isTouch
    let dragged = false
    if (panning) targetRef.current = null
    const move = (moveEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return
      if (Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y) >= TOUCH_SLOP) dragged = true
      if (!panning) {
        if (Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y) < TOUCH_SLOP) return
        panning = true
        targetRef.current = null
      }
      const next = clamp(
        { x: start.camera.x - (moveEvent.clientX - start.x) / scale, y: start.camera.y - (moveEvent.clientY - start.y) / scale },
        { minX, maxX, minY, maxY },
        { width, height },
      )
      cameraRef.current = next
      movingRef.current = true
      writeViewBox(next)
    }
    const end = (endEvent) => {
      if (endEvent.pointerId !== event.pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      if (movingRef.current) {
        movingRef.current = false
        setCamera(cameraRef.current)
      }
      if (isTouch && panning) swallowNextClick()
      if (!isTouch && !dragged && event.button === 2) onRightClick?.()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  const dragHandlers = { ref: svgRef, onPointerDown: startDrag, onContextMenu: (event) => event.preventDefault() }
  return { camera: { ...camera, width, height }, dragHandlers }
}
