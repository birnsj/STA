import { createContext } from 'react'

// MapCanvas calls this once its tiles are first fully painted (null outside a MapFadeIn).
export const MapReadyContext = createContext(null)

// Whether the map can be seen: false while a MapFadeIn's black cover is still down, true once it starts to lift (and
// always outside a MapFadeIn, such as the map editor's Play).
export const MapRevealedContext = createContext(true)
