import { createContext } from 'react'

// A Pixi board calls this once its map is first drawn and its figures have asked for their sprite sheets (null
// outside a MapFadeIn).
export const MapReadyContext = createContext(null)

// Whether the map can be seen: false while a MapFadeIn's black cover is down or still lifting, true once it is gone
// (and always outside a MapFadeIn).
export const MapRevealedContext = createContext(true)
