import { useLayoutEffect, useRef, useState } from 'react'
import Portrait from './Portrait.jsx'

// True when every card fits at its normal width (--card-width / --card-gap in styles.css).
function allCardsFit(carousel, count) {
  const style = getComputedStyle(carousel)
  const cardWidth = parseFloat(style.getPropertyValue('--card-width'))
  const gap = parseFloat(style.getPropertyValue('--card-gap'))
  const trackPadding = 4
  return count * cardWidth + (count - 1) * gap + trackPadding <= carousel.clientWidth
}

// Scrolls with arrows when the cards overflow; otherwise drops the arrows and stretches the cards evenly.
export default function CardCarousel({ items, selectedId, onSelect, label, variant = '' }) {
  const carouselRef = useRef(null)
  const trackRef = useRef(null)
  const [fits, setFits] = useState(false)
  useLayoutEffect(() => {
    const carousel = carouselRef.current
    const measure = () => setFits(allCardsFit(carousel, items.length))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(carousel)
    return () => observer.disconnect()
  }, [items.length])

  const scroll = (direction) => trackRef.current?.scrollBy({ left: direction * 300, behavior: 'smooth' })

  return (
    <div className={`carousel ${variant}${fits ? ' is-stretched' : ''}`} ref={carouselRef}>
      {!fits && (
        <button type="button" className="carousel-arrow" onClick={() => scroll(-1)} aria-label={`Scroll ${label} left`}>‹</button>
      )}
      <div className="carousel-track" ref={trackRef} role="listbox" aria-label={label}>
        {items.map((item) => {
          const isSelected = item.id === selectedId
          return (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              disabled={item.disabled}
              className={`option-card${isSelected ? ' is-selected' : ''}`}
              onClick={() => onSelect(item.id)}
            >
              {item.tag && <span className="option-card-tag">{item.tag}</span>}
              <Portrait label={item.name} image={item.image} className="portrait-card" />
              <span className="option-card-name">{item.name}</span>
            </button>
          )
        })}
      </div>
      {!fits && (
        <button type="button" className="carousel-arrow" onClick={() => scroll(1)} aria-label={`Scroll ${label} right`}>›</button>
      )}
    </div>
  )
}
