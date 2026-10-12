import { createContext } from 'react'

// MapCanvas calls this once its tiles are first fully painted (null outside a MapFadeIn).
export const MapReadyContext = createContext(null)

// Whether the map can be seen: false while a MapFadeIn's black cover is down or still lifting, true once it is gone
// (and always outside a MapFadeIn).
export const MapRevealedContext = createContext(true)
