import { createContext, useContext } from 'react'
import { DEFAULT_DISPLAY_SETTINGS } from './displaySettings.js'

// The current display settings (App.jsx), for screens nested too deep to pass them down (combat inside exploration).
export const DisplaySettingsContext = createContext(DEFAULT_DISPLAY_SETTINGS)
export const useDisplaySettings = () => useContext(DisplaySettingsContext)

// A partial update of the saved display settings. Screens that only read the settings stay on the value context.
const UpdateDisplaySettingsContext = createContext(() => {})
export const UpdateDisplaySettingsProvider = UpdateDisplaySettingsContext.Provider
export const useUpdateDisplaySettings = () => useContext(UpdateDisplaySettingsContext)

// Opens the Settings panel over the current mission (App.jsx). A no-op where that panel is not mounted.
const OpenSettingsContext = createContext({ open: false, openSettings: () => {} })
export const OpenSettingsProvider = OpenSettingsContext.Provider
export const useOpenSettings = () => useContext(OpenSettingsContext)
