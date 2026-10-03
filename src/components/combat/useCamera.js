import { useEffect, useRef, useState } from 'react'

// Presentation only: which part of the battlefield is on screen. WASD / arrow keys, right-click drag or one-finger drag pan; when focus.key changes
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
export default function useCamera(bounds, view, focus, follow = true) {
  const [camera, setCamera] = useState(() => clamp(centredOn(focus.point, view), bounds, view))
  const cameraRef = useRef(camera)
  const targetRef = useRef(null)
  const heldRef = useRef(new Set())
  const { minX, maxX, minY, maxY } = bounds
  const { width, height } = view
  const { x: focusX, y: focusY } = focus.point

  useEffect(() => {
    targetRef.current = follow ? { x: focusX - width / 2, y: focusY - height / 2 } : null
  }, [focus.key, focusX, focusY, width, height, follow])

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
        const target = clamp(targetRef.current, limits, size)
        const close = Math.abs(target.x - current.x) < 0.5 && Math.abs(target.y - current.y) < 0.5
        next = close ? target : { x: current.x + (target.x - current.x) * GLIDE, y: current.y + (target.y - current.y) * GLIDE }
        if (close) targetRef.current = null
      }
      if (next && (next.x !== current.x || next.y !== current.y)) {
        cameraRef.current = next
        setCamera(next)
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
    if (isTouch ? !event.isPrimary : event.button !== 2) return
    if (!isTouch) event.preventDefault()
    const scale = event.currentTarget.getBoundingClientRect().width / width
    const start = { x: event.clientX, y: event.clientY, camera: cameraRef.current }
    let panning = !isTouch
    if (panning) targetRef.current = null
    const move = (moveEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return
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
      setCamera(next)
    }
    const end = (endEvent) => {
      if (endEvent.pointerId !== event.pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      if (isTouch && panning) swallowNextClick()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  const dragHandlers = { onPointerDown: startDrag, onContextMenu: (event) => event.preventDefault() }
  return { camera, dragHandlers }
}
