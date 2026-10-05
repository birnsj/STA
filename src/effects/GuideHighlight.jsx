import { useEffect, useRef } from 'react'
import './effects.css'
import { GUIDE_FADE_MS as FADE_MS, GUIDE_HOLD_MS as HOLD_MS, GUIDE_TRAVEL_MS as TRAVEL_MS } from './guideTiming.js'

// Shows the player the order to work in: a bracketed box flies from the last thing they finished to the next section
// that needs input (or the Next button once the screen is done), fits itself to it, then fades out.
// It reads the `is-missing` markers the screens already render, so it holds no knowledge of the rules itself.

// Sections a player fills in, in priority order. Tabs and category cards only lead when no section on show is missing.
const SECTION_SELECTOR =
  '.carousel.is-missing, .panel.is-missing, .species-gender.is-missing, .env-select.is-missing, .chip-group.is-missing'
const SECONDARY_SELECTOR = '.option-card.is-missing, .env-tab.is-missing'
const NEXT_SELECTOR = '.nav-next:not(:disabled)'
// The step Summary popup's Close button; the box waits there until the popup closes, then returns to Next.
const POPUP_CLOSE_SELECTOR = '.step-summary-close'

const PADDING = 4

const isVisible = (element) => element.getClientRects().length > 0 && !element.closest('[inert]')
const firstVisible = (root, selector) => [...root.querySelectorAll(selector)].find(isVisible) ?? null

function findTarget(root) {
  let section = firstVisible(root, SECTION_SELECTOR)
  // A missing panel can hold a more precise missing control (e.g. a talent's choice dropdown); point at that.
  for (let inner = section && firstVisible(section, SECTION_SELECTOR); inner; inner = firstVisible(inner, SECTION_SELECTOR)) {
    section = inner
  }
  return section ?? firstVisible(root, SECONDARY_SELECTOR) ?? firstVisible(root, NEXT_SELECTOR)
}

// Rects in the layer's own unscaled pixels, so the box lines up inside the scaled stage.
function measure(element, layer, padding = PADDING) {
  const origin = layer.getBoundingClientRect()
  const scale = origin.width / layer.offsetWidth || 1
  const rect = element.getBoundingClientRect()
  return {
    left: (rect.left - origin.left) / scale - padding,
    top: (rect.top - origin.top) / scale - padding,
    width: rect.width / scale + padding * 2,
    height: rect.height / scale + padding * 2,
  }
}

const toFrame = ({ left, top, width, height }) => ({ left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` })

// enterFromFull: the first box starts at the size of the whole screen and shrinks onto its target (Review).
export default function GuideHighlight({ enterFromFull = false }) {
  const layerRef = useRef(null)
  const boxRef = useRef(null)

  useEffect(() => {
    const layer = layerRef.current
    const box = boxRef.current
    const root = layer.parentElement
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let target = null
    let lastRect = null
    let animations = []
    let frame = 0

    // persist: stay on the target instead of fading (the popup's Close button).
    const play = (next, persist = false) => {
      const visible = Number(getComputedStyle(box).opacity) > 0.05
      // A screen change removes the old target from the page, so fall back to where it last was.
      const fullScreen = enterFromFull && !lastRect ? measure(layer, layer, 0) : null
      const from = visible ? measure(box, layer, 0) : target?.isConnected ? measure(target, layer) : (lastRect ?? fullScreen)
      const to = measure(next, layer)
      lastRect = to
      animations.forEach((animation) => animation.cancel())
      const travel = from && !reduceMotion ? TRAVEL_MS : 0
      animations = [
        box.animate(
          [
            { ...toFrame(from ?? to), opacity: from ? 1 : 0, transform: from ? 'none' : 'scale(1.08)' },
            { ...toFrame(to), opacity: 1, transform: 'none' },
          ],
          { duration: travel || 200, easing: 'cubic-bezier(0.65, 0, 0.25, 1)', fill: 'forwards' },
        ),
      ]
      if (!persist) {
        animations.push(
          box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, delay: (travel || 200) + HOLD_MS, easing: 'ease-in', fill: 'forwards' }),
        )
      }
      // Restart the CSS lock-on flash so it fires as the box arrives.
      box.style.setProperty('--guide-lock-delay', `${travel}ms`)
      box.classList.remove('is-locking')
      void box.offsetWidth
      box.classList.add('is-locking')
      target = next
    }

    // A popup makes the screen inert. The Summary popup's Close button becomes the target; any other popup
    // (e.g. Quit) hides the box. Either way the box points the way again once the popup closes.
    const update = () => {
      frame = 0
      if (root.querySelector(':scope > [inert]')) {
        const close = root.querySelector(POPUP_CLOSE_SELECTOR)
        if (!close) {
          animations.forEach((animation) => animation.cancel())
          animations = []
          target = null
          return
        }
        // Measure only once the popup has finished scaling in.
        if (close.closest('[role="dialog"]')?.getAnimations().some((animation) => animation.playState === 'running')) {
          setTimeout(schedule, 60)
          return
        }
        if (close !== target) play(close, true)
        return
      }
      const next = findTarget(root)
      if (next && next !== target) play(next)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    const observer = new MutationObserver(schedule)
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'disabled', 'inert'] })
    schedule()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      animations.forEach((animation) => animation.cancel())
    }
  }, [enterFromFull])

  return (
    <div className="guide-layer" ref={layerRef} aria-hidden="true">
      <div className="guide-box" ref={boxRef}>
        <span className="guide-corner is-tl" />
        <span className="guide-corner is-tr" />
        <span className="guide-corner is-bl" />
        <span className="guide-corner is-br" />
        <span className="guide-scan" />
      </div>
    </div>
  )
}
