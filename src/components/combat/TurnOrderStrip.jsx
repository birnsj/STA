import { useLayoutEffect, useRef } from 'react'
import { getActiveCombatant, getCombatantList, getTurnGroupRange, isActive, isTurnFinished } from '../../combat/combatState.js'
import CombatPortrait from './CombatPortrait.jsx'
import ConditionIcons from './ConditionIcons.jsx'

// The centred column stops before the party card and the corner buttons. The gap on each side holds another portrait.
function widenToClearance(strip) {
  const parent = strip.parentElement
  const root = strip.closest('.combat-screen')
  const card = root?.querySelector('.party-card')
  const button = root?.querySelector('.explore-minimap-toolbar button')
  if (!parent || !card || !button) return
  const scale = parent.getBoundingClientRect().width / parent.offsetWidth || 1
  const parentBox = parent.getBoundingClientRect()
  const gap = 2
  const extraLeft = Math.max(0, (parentBox.left - card.getBoundingClientRect().right) / scale - gap)
  const extraRight = Math.max(0, (button.getBoundingClientRect().left - parentBox.right) / scale - gap)
  strip.style.marginLeft = extraLeft ? `${-extraLeft}px` : ''
  strip.style.marginRight = extraRight ? `${-extraRight}px` : ''
  strip.style.width = extraLeft || extraRight ? `calc(100% + ${extraLeft + extraRight}px)` : ''
}

// Keep the longest run of whole portraits that fits, centred on the queue. Hiding the rest lets the row centre without slicing a portrait at either end.
function fitWholePortraits(strip) {
  const items = [...strip.children]
  if (!items.length) return
  for (const item of items) item.classList.remove('is-cut')
  widenToClearance(strip)
  const scale = strip.getBoundingClientRect().width / strip.offsetWidth || 1
  const available = strip.clientWidth
  const widths = items.map((item) => item.getBoundingClientRect().width / scale)
  const prefix = [0]
  for (const width of widths) prefix.push(prefix[prefix.length - 1] + width)
  const total = prefix[prefix.length - 1]
  if (total <= available + 0.5) return

  let best = null
  for (let start = 0; start < items.length; start += 1) {
    for (let end = start; end < items.length; end += 1) {
      const span = prefix[end + 1] - prefix[start]
      if (span > available + 0.5) break
      const count = end - start + 1
      const distance = Math.abs((prefix[start] + prefix[end + 1]) / 2 - total / 2)
      const better = !best
        || count > best.count
        || (count === best.count && distance < best.distance - 0.5)
        || (count === best.count && Math.abs(distance - best.distance) <= 0.5 && span > best.span)
      if (better) best = { start, end, count, distance, span }
    }
  }
  if (!best) return
  items.forEach((item, index) => {
    if (index < best.start || index > best.end) item.classList.add('is-cut')
  })
}

// The fixed initiative queue, starting from the current turn group, so the portraits advance as turns are taken.
// Inside a party group the player picks the order: the acting member is enlarged and finished members are dimmed.
// hiddenIds: combatants the party can't perceive now (left out of the queue).
export default function TurnOrderStrip({ state, hiddenIds = null }) {
  const list = getCombatantList(state)
  const { start, ids: groupIds } = getTurnGroupRange(state)
  const activeId = getActiveCombatant(state).id
  const queue = [...list.slice(start), ...list.slice(0, start)].filter((combatant) => isActive(combatant) && !hiddenIds?.includes(combatant.id))
  const stripRef = useRef(null)

  useLayoutEffect(() => {
    const strip = stripRef.current
    if (strip) fitWholePortraits(strip)
  })

  useLayoutEffect(() => {
    const strip = stripRef.current
    if (!strip) return undefined
    let width = strip.clientWidth
    const observer = new ResizeObserver(() => {
      if (strip.clientWidth === width) return
      width = strip.clientWidth
      fitWholePortraits(strip)
    })
    observer.observe(strip)
    return () => observer.disconnect()
  }, [])

  return (
    <ol ref={stripRef} className="turn-strip" aria-label="Turn order">
      {queue.map((combatant, index) => {
        const inGroup = groupIds.length > 1 && groupIds.includes(combatant.id)
        const finished = inGroup && combatant.id !== activeId && isTurnFinished(state, combatant.id)
        return (
          <li
            key={combatant.id}
            className={`turn-strip-item ${combatant.side === 'player' ? 'is-player' : 'is-enemy'}${combatant.id === activeId ? ' is-current' : ''}${inGroup ? ' is-group' : ''}${finished ? ' is-done' : ''}`}
            title={`${combatant.character.name} (Daring ${combatant.character.attributes.daring}, Control ${combatant.character.attributes.control})${finished ? ' - done' : ''}`}
          >
            {index > 0 && <span className="turn-strip-arrow" aria-hidden="true" />}
            <span className="turn-strip-unit">
              <CombatPortrait character={combatant.character} className="turn-strip-portrait" />
              <ConditionIcons condition={combatant.condition} compact />
            </span>
          </li>
        )
      })}
    </ol>
  )
}
