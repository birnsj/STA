import { createContext } from 'react'

// MapCanvas calls this once its tiles are first fully painted (null outside a MapFadeIn).
export const MapReadyContext = createContext(null)
