import { createContext, useContext } from 'react'
import { DEFAULT_DISPLAY_SETTINGS } from './displaySettings.js'

// The current display settings (App.jsx), for screens nested too deep to pass them down (combat inside exploration).
export const DisplaySettingsContext = createContext(DEFAULT_DISPLAY_SETTINGS)
export const useDisplaySettings = () => useContext(DisplaySettingsContext)
