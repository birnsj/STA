// The stage's current size in design pixels (ScaledStage.jsx provides it; in fill mode it can be larger than the
// authored size). Kept apart from the component so React Fast Refresh can reload ScaledStage on its own.
import { createContext, useContext } from 'react'
import { DESIGN_RESOLUTION } from '../settings/displaySettings.js'

export const StageSizeContext = createContext(DESIGN_RESOLUTION)

export const useStageSize = () => useContext(StageSizeContext)
