import { useMemo } from 'react'

// AmbientDarkness's blocks (IsoTiles.jsx), kept the same object while the faded set's contents are, since the views
// rebuild that set every render and the darkness's mask would otherwise be redrawn with it. Keys are 'x,y'.
export default function useDarkBlocks(faded, panels, bigGroups) {
  const fadedKey = [...faded].sort().join(' ')
  const stableFaded = useMemo(() => new Set(fadedKey ? fadedKey.split(' ') : []), [fadedKey])
  return useMemo(() => ({ faded: stableFaded, panels, bigGroups }), [stableFaded, panels, bigGroups])
}
