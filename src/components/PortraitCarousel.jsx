import Portrait from './Portrait.jsx'

// One image at a time with previous/next arrows. Shows the fallback (or "?") until an item is chosen.
// Items need { id, name, image }.
export default function PortraitCarousel({
  portraits,
  selectedId,
  onSelect,
  fallbackLabel,
  fallbackImage = null,
  emptyUnknown = false,
  itemLabel = 'portrait',
  showHint = true,
  className = '',
}) {
  const index = portraits.findIndex((portrait) => portrait.id === selectedId)
  const selected = index >= 0 ? portraits[index] : null
  const step = (direction) => {
    const start = index >= 0 ? index : direction > 0 ? -1 : 0
    onSelect(portraits[(start + direction + portraits.length) % portraits.length].id)
  }
  const hasChoices = portraits.length > 0

  return (
    <div className="portrait-carousel-wrap">
      <div className={`portrait-carousel ${className}`}>
        <Portrait
          label={selected?.name ?? fallbackLabel}
          image={selected?.image ?? fallbackImage}
          unknown={!selected && emptyUnknown}
          className="portrait-carousel-image"
        />
        {hasChoices && (
          <>
            <button type="button" className="portrait-carousel-arrow is-prev" onClick={() => step(-1)} aria-label={`Previous ${itemLabel}`}>‹</button>
            <button type="button" className="portrait-carousel-arrow is-next" onClick={() => step(1)} aria-label={`Next ${itemLabel}`}>›</button>
            <span className="portrait-carousel-counter">{index >= 0 ? index + 1 : '–'} / {portraits.length}</span>
          </>
        )}
      </div>
      {hasChoices && showHint && (
        <p className="portrait-carousel-hint">
          {selected ? `Use ‹ › to switch ${itemLabel}s.` : `Use ‹ › to choose a ${itemLabel}.`}
        </p>
      )}
    </div>
  )
}
