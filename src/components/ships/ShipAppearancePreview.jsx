import { useEffect, useState } from 'react'
import { appearanceArt, classArt, shipEmptyArt } from '../../ships/shipArtPaths.js'
import { appearanceLayerPaths } from '../../ships/appearanceRules.js'

const EMPTY = shipEmptyArt()

/**
 * Honest stacked preview: base class PNG plus appearance layer PNGs that load.
 * Missing layer files are omitted — never claimed as displayed.
 */
export default function ShipAppearancePreview({ ship, className = '' }) {
  const spaceframeId = ship?.spaceframeId ?? null
  const baseSrc = spaceframeId ? classArt(spaceframeId) : EMPTY
  const layers = appearanceLayerPaths(ship)
  const [failedBase, setFailedBase] = useState(false)
  const [failedLayers, setFailedLayers] = useState(() => new Set())

  useEffect(() => {
    setFailedBase(false)
    setFailedLayers(new Set())
  }, [spaceframeId, layers.map((entry) => entry.file).join('|')])

  const shownBase = failedBase ? EMPTY : baseSrc
  const visibleLayers = layers.filter((entry) => !failedLayers.has(entry.file))
  const omitted = layers.length - visibleLayers.length

  return (
    <div className={`ship-appearance-preview ${className}`.trim()}>
      <div className="ship-appearance-stack" aria-hidden={false}>
        <img
          className="ship-appearance-base"
          src={shownBase}
          alt=""
          draggable={false}
          onError={() => {
            if (!failedBase) setFailedBase(true)
          }}
        />
        {visibleLayers.map((entry) => (
          <img
            key={entry.file}
            className="ship-appearance-layer"
            src={appearanceArt(entry.file)}
            alt=""
            draggable={false}
            onError={() => {
              setFailedLayers((current) => {
                if (current.has(entry.file)) return current
                const next = new Set(current)
                next.add(entry.file)
                return next
              })
            }}
          />
        ))}
      </div>
      {omitted > 0 && (
        <p className="finish-note ship-appearance-preview-note">
          {omitted === 1
            ? 'One selected layer has no preview art yet.'
            : `${omitted} selected layers have no preview art yet.`}
        </p>
      )}
      {!visibleLayers.length && layers.length === 0 && (
        <p className="finish-note ship-appearance-preview-note">
          Class preview only — catalog layers stack when selected and art is available. Legacy packages are not painted onto the hull here.
        </p>
      )}
    </div>
  )
}
