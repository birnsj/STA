import { createContext, useContext, useLayoutEffect, useState } from 'react'
import { DEFAULT_DISPLAY_SETTINGS, DESIGN_RESOLUTION, getStageLayout } from '../settings/displaySettings.js'

const StageSizeContext = createContext(DESIGN_RESOLUTION)

const getViewport = () => ({ width: window.innerWidth, height: window.innerHeight })

// The stage's current size in design pixels; in fill mode it can be larger than the authored size.
export const useStageSize = () => useContext(StageSizeContext)

// Each view is authored at a fixed size (character creation: the design resolution); scaled per the display settings.
export default function ScaledStage({ width = DESIGN_RESOLUTION.width, height = DESIGN_RESOLUTION.height, settings = DEFAULT_DISPLAY_SETTINGS, children }) {
  const [layout, setLayout] = useState(() => getStageLayout(settings, { width, height }, getViewport()))

  useLayoutEffect(() => {
    const handleResize = () => setLayout(getStageLayout(settings, { width, height }, getViewport()))
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [width, height, settings])

  const { scale } = layout
  return (
    <div className="stage-viewport">
      <div className="stage-slot" style={{ width: layout.width * scale, height: layout.height * scale }}>
        <div className="stage" style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}>
          <StageSizeContext.Provider value={{ width: layout.width, height: layout.height }}>{children}</StageSizeContext.Provider>
        </div>
      </div>
    </div>
  )
}
