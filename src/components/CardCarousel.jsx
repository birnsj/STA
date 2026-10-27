import Portrait from './Portrait.jsx'
import { useWholeCardCarousel } from './wholeCardCarousel.js'

// Scrolls with arrows when the cards overflow; otherwise drops the arrows and stretches the cards evenly.
export default function CardCarousel({ items, selectedId, onSelect, label, variant = '' }) {
  const { carouselRef, trackRef, fits, scroll } = useWholeCardCarousel(items.length, 124, 10)

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
              className={`option-card${isSelected ? ' is-selected' : ''}${item.missing ? ' is-missing' : ''}`}
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
