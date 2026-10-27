import { useLayoutEffect, useRef, useState } from 'react'

const ARROW = 30
const FRAME_GAP = 8

// Size the scrolling window to an exact number of cards so the edge never cuts one in half.
function pageWidth(available, count, preferred, gap) {
  let visible = Math.floor((available + gap) / (preferred + gap))
  visible = Math.max(1, Math.min(count, visible))
  let width = visible * preferred + (visible - 1) * gap
  if (width > available && visible > 1) {
    visible -= 1
    width = visible * preferred + (visible - 1) * gap
  }
  return width
}

export function useWholeCardCarousel(count, preferred, gap) {
  const carouselRef = useRef(null)
  const trackRef = useRef(null)
  const [fits, setFits] = useState(false)

  useLayoutEffect(() => {
    const carousel = carouselRef.current
    const track = trackRef.current
    if (!carousel || !track) return
    const measure = () => {
      const content = count * preferred + Math.max(0, count - 1) * gap
      const nextFits = count === 0 || content <= carousel.clientWidth
      setFits(nextFits)
      if (nextFits) {
        track.style.width = ''
        track.style.flex = ''
        return
      }
      const available = carousel.clientWidth - ARROW * 2 - FRAME_GAP * 2
      const width = `${pageWidth(available, count, preferred, gap)}px`
      const changed = track.style.width !== width
      track.style.flex = '0 0 auto'
      track.style.width = width
      if (changed) track.scrollLeft = Math.round(track.scrollLeft / (preferred + gap)) * (preferred + gap)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(carousel)
    return () => observer.disconnect()
  }, [count, preferred, gap])

  const scroll = (direction) => {
    trackRef.current?.scrollBy({ left: direction * (preferred + gap), behavior: 'smooth' })
  }

  return { carouselRef, trackRef, fits, scroll }
}
