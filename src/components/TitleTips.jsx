import { useEffect, useRef, useState } from 'react'
import InfoTipBubble from './InfoTipBubble.jsx'
import { titleTipContent } from './titleTipContent.js'

const TIPPED = '[title], [data-tip]'
const REMOVED_CHECK_MS = 250
// Longer than the creator's info boxes (useInfoTip.js) so passing over the game's buttons doesn't flash boxes
// (designer request, 2026-10-15).
const SHOW_DELAY_MS = 1500

// Every plain tooltip in a stage drawn as the creator's info box (designer decision, 2026-10-14): any element with a
// title attribute, or a data-tip attribute (SVG, whose <title> children can't be taken over). Hover only, after
// SHOW_DELAY_MS; a click hides it, since in the game a click does something. While hovered an element's title is
// taken off (so the browser's own box never shows) and put back on leaving, so React's view of it stays true.
// data-tip-at="pointer": a big element whose tip depends on where the pointer is (the battlefield) gets its box at
// the pointer rather than under the element. enabled: false (the Tooltips setting off) shows no box, but titles are
// still taken off while hovered so the browser's own box doesn't appear instead.
export default function TitleTips({ stageRef, enabled = true }) {
  const [active, setActive] = useState(null)
  const enabledRef = useRef(enabled)
  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return undefined
    let hovered = null
    let timer = null
    let pointer = null

    const hide = () => {
      clearTimeout(timer)
      setActive(null)
    }
    // A toggle's title changes when it's clicked; React then puts a title back on the hovered element while the
    // pointer rests on it, and the browser would show its own box. Watch for that and take it straight off again.
    const watcher = new MutationObserver(() => refresh())
    const release = () => {
      watcher.disconnect()
      if (hovered?.fromTitle && hovered.element.isConnected && !hovered.element.hasAttribute('title')) hovered.element.setAttribute('title', hovered.text)
      hovered = null
    }
    // The element's current tip text, taking a (new) title off it.
    const readTip = (element, previous) => {
      if (element.hasAttribute('title')) {
        const text = element.getAttribute('title')
        element.removeAttribute('title')
        return { text, fromTitle: true }
      }
      if (element.hasAttribute('data-tip')) return { text: element.getAttribute('data-tip'), fromTitle: false }
      return previous
    }
    const showNow = () => {
      const content = enabledRef.current ? titleTipContent(hovered?.text) : null
      if (!content) return setActive(null)
      const at = hovered.element.getAttribute('data-tip-at') === 'pointer' && pointer ? { ...pointer } : null
      setActive({ content, anchor: hovered.element, point: at })
    }
    const schedule = () => {
      clearTimeout(timer)
      setActive(null)
      timer = setTimeout(showNow, SHOW_DELAY_MS)
    }

    // The hovered element has lost its title, so it no longer matches TIPPED; find the nearest tipped element
    // inside it, else it.
    const tippedAt = (target) => {
      if (!(target instanceof Element)) return null
      const element = target.closest(TIPPED)
      if (hovered && hovered.element.contains(target) && !(element && hovered.element.contains(element))) return hovered.element
      return element
    }

    const hover = (element) => {
      hovered = { element, ...readTip(element, { text: '', fromTitle: false }) }
      watcher.observe(element, { attributes: true, attributeFilter: ['title', 'data-tip'] })
    }
    // The hovered element's tip may have changed (a new title or data-tip): restart the delay with the new text.
    const refresh = () => {
      if (!hovered) return
      const next = readTip(hovered.element, hovered)
      if (next.text !== hovered.text) {
        hovered = { ...hovered, ...next }
        schedule()
      }
    }

    const track = (event) => {
      pointer = { x: event.clientX, y: event.clientY }
      const element = tippedAt(event.target)
      if (element !== hovered?.element) {
        hide()
        release()
        if (!element || !stage.contains(element)) return
        hover(element)
        schedule()
        return
      }
      refresh()
    }
    const leave = (event) => {
      if (hovered && !(event.relatedTarget instanceof Node && hovered.element.contains(event.relatedTarget))) {
        hide()
        release()
      }
    }
    // A click does the element's thing; its tip stays away unless the click changed it (a toggle), then it shows the
    // new text after the delay.
    const press = hide
    const focus = (event) => {
      const element = event.target instanceof Element ? event.target.closest(TIPPED) : null
      if (!element || !event.target.matches(':focus-visible')) return
      hide()
      release()
      hover(element)
      showNow()
    }
    const blur = (event) => {
      if (hovered?.element.contains(event.target)) {
        hide()
        release()
      }
    }

    stage.addEventListener('pointerover', track)
    stage.addEventListener('pointermove', track)
    stage.addEventListener('pointerout', leave)
    stage.addEventListener('pointerdown', press)
    stage.addEventListener('wheel', hide, { passive: true })
    stage.addEventListener('focusin', focus)
    stage.addEventListener('focusout', blur)
    const removedCheck = setInterval(() => {
      if (hovered && !hovered.element.isConnected) {
        hide()
        release()
      }
    }, REMOVED_CHECK_MS)
    return () => {
      hide()
      release()
      clearInterval(removedCheck)
      stage.removeEventListener('pointerover', track)
      stage.removeEventListener('pointermove', track)
      stage.removeEventListener('pointerout', leave)
      stage.removeEventListener('pointerdown', press)
      stage.removeEventListener('wheel', hide)
      stage.removeEventListener('focusin', focus)
      stage.removeEventListener('focusout', blur)
    }
  }, [stageRef])

  return active && enabled ? <InfoTipBubble content={active.content} anchor={active.anchor} point={active.point} /> : null
}
