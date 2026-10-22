import { useEffect, useRef, useState } from 'react'
import { canEditEffects, setOverlayEmissive, setOverlayEmitColour } from '../../maps/effectsFiles.js'
import { DEFAULT_AMBIENT_COLOUR, FULL_LIGHT, getTile, imageSize } from '../../maps/mapFormat.js'
import {
  OVERLAY_EMISSIVE_MAX,
  OVERLAY_EMISSIVE_MIN,
  overlayEmissive,
  overlayEmitColour,
  setOverlayEmissiveLocal,
  setOverlayEmitColourLocal,
} from '../../maps/tileArt.js'
import { tileSpriteInfo } from '../../maps/tileSpriteInfo.js'
import { canEditTiles, setTileFlag } from '../../maps/tileFiles.js'
import { getCategoryName, getItemById, getItemStatLines } from '../../rules/equipment.js'
import { DESTRUCTIBLE_TYPES, destructibleTileId, HAZARD_TYPES } from '../../world/environment.js'
import { HAZARD_FRAMES, hazardStrip } from './environmentArt.js'
import { MARKER_HELP, parseTool } from './editorSelection.js'
import TileThumbnail from './TileThumbnail.jsx'

// Properties for the Assets catalogue selection (active tool): large preview, sprite details, editable tile flags.
// Board entity inspectors stay in EditorInspectors when something on the map is selected.

const FLAG_BOXES = [
  { flag: 'cover', label: 'Cover', title: 'Standing next to this tile gives cover', on: 'now gives cover', off: 'no longer gives cover' },
  { flag: 'fade', label: 'Fade', title: 'Turns see-through when a party member is behind it (exploration and combat)', on: 'now fades', off: 'no longer fades' },
]

const INTENSITIES = [
  { value: 1, label: 'Thin' },
  { value: 2, label: 'Thick' },
  { value: 3, label: 'Dense' },
]

function FlagBox({ tile, box, onStatus }) {
  const [value, setValue] = useState(Boolean(tile[box.flag]))
  const [saving, setSaving] = useState(false)
  const change = (next) => {
    setSaving(true)
    setTileFlag(tile.id, box.flag, next)
      .then(() => {
        setValue(next)
        onStatus?.(`${tile.label} ${next ? box.on : box.off} (saved to tiles.json).`)
      })
      .catch((error) => onStatus?.(`Could not change ${box.label.toLowerCase()} for ${tile.label}: ${error.message}`))
      .finally(() => setSaving(false))
  }
  return (
    <label className="me-cover ed-prop-flag" title={canEditTiles ? box.title : `${box.label} can only be changed in the dev build`}>
      <input type="checkbox" checked={value} disabled={!canEditTiles || saving} onChange={(event) => change(event.target.checked)} />
      {box.label}
    </label>
  )
}

function PropRows({ rows }) {
  const shown = rows.filter((row) => row[1] != null && row[1] !== '')
  if (!shown.length) return null
  return (
    <dl className="ed-prop-table">
      {shown.map(([label, value, title]) => (
        <div key={label} className="ed-prop-row">
          <dt>{label}</dt>
          <dd title={title || undefined}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function useDebouncedSave(save) {
  const saveTimer = useRef(null)
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    },
    [],
  )
  return (run) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      save(run)
    }, 250)
  }
}

function EmissiveControls({ tileId, value, onValue, colour, fallbackColour, onColour, onStatus }) {
  const scheduleStrength = useDebouncedSave((run) => {
    setOverlayEmissive(tileId, run)
      .then((saved) => {
        onValue(saved)
        onStatus?.(canEditEffects ? `${tileId} emissive ${saved} (saved to tileEffects.json).` : `${tileId} emissive ${saved}.`)
      })
      .catch((error) => onStatus?.(`Could not save emissive: ${error.message}`))
  })
  const scheduleColour = useDebouncedSave((run) => {
    setOverlayEmitColour(tileId, run)
      .then((saved) => {
        onColour(saved)
        onStatus?.(
          canEditEffects
            ? saved
              ? `${tileId} emit colour ${saved} (saved to tileEffects.json).`
              : `${tileId} emit colour cleared (saved to tileEffects.json).`
            : saved
              ? `${tileId} emit colour ${saved}.`
              : `${tileId} emit colour cleared.`,
        )
      })
      .catch((error) => onStatus?.(`Could not save emit colour: ${error.message}`))
  })
  const shown = colour || fallbackColour || '#ffffff'
  const [hex, setHex] = useState(shown)
  // The hex box follows the saved colour (or another tile), worked out while rendering so it never lags a frame.
  const syncKey = `${tileId}|${shown}`
  const [syncedKey, setSyncedKey] = useState(syncKey)
  if (syncedKey !== syncKey) {
    setSyncedKey(syncKey)
    setHex(shown)
  }

  const applyColour = (next) => {
    try {
      setOverlayEmitColourLocal(tileId, next)
      onColour(next)
      setHex(next || fallbackColour || '#ffffff')
      scheduleColour(next)
    } catch (error) {
      onStatus?.(`Could not set emit colour: ${error.message}`)
    }
  }

  return (
    <>
      <label
        className="ed-emissive"
        title={
          canEditEffects
            ? 'Floor light strength (0 = none, 1 = default, 2 = bright). Also brightens wall overlay glows.'
            : 'Floor light strength (dev build saves to tileEffects.json)'
        }
      >
        <span className="ed-emissive-label">Emissive</span>
        <input
          type="range"
          min={OVERLAY_EMISSIVE_MIN}
          max={OVERLAY_EMISSIVE_MAX}
          step="0.1"
          value={value}
          aria-label="Emissive strength"
          onChange={(event) => {
            const next = Number(event.target.value)
            onValue(next)
            setOverlayEmissiveLocal(tileId, next)
            scheduleStrength(next)
          }}
        />
        <span className="ed-emissive-value">{value.toFixed(1)}</span>
      </label>
      <label className="ed-emissive" title="Colour of the light spill on the floor. Clear to use the tile's default glow colour.">
        <span className="ed-emissive-label">Colour</span>
        <input
          className="ed-colour"
          type="color"
          value={toColourInput(hex)}
          aria-label="Ground emit colour"
          onChange={(event) => applyColour(event.target.value)}
        />
        <input
          className="ed-colour-hex me-name"
          value={colour ? hex : ''}
          placeholder={fallbackColour || 'natural'}
          aria-label="Ground emit colour hex"
          onChange={(event) => {
            const next = event.target.value.trim()
            setHex(next || fallbackColour || '#ffffff')
            if (next === '') applyColour(null)
            else if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(next)) applyColour(next)
          }}
        />
      </label>
      {colour && (
        <button type="button" className="me-button" onClick={() => applyColour(null)}>
          Clear colour
        </button>
      )}
    </>
  )
}

function toColourInput(hex) {
  const value = hex || DEFAULT_AMBIENT_COLOUR
  return value.length === 4 ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}` : value
}

function AmbientLightControl({ ambient, ambientColour, onAmbient, onAmbientColour }) {
  const ambientValue = ambient ?? FULL_LIGHT
  const colour = ambientColour || DEFAULT_AMBIENT_COLOUR
  const [hex, setHex] = useState(colour)
  const [syncedColour, setSyncedColour] = useState(colour)
  if (syncedColour !== colour) {
    setSyncedColour(colour)
    setHex(colour)
  }

  return (
    <div className="ed-light-pool">
      <p className="ed-dock-title">Light</p>
      <label className="ed-emissive" title="Ambient light: how bright the room is. Glowing tiles stay lit in the dark.">
        <span className="ed-emissive-label">Ambient</span>
        <input
          type="range"
          min="0"
          max={FULL_LIGHT}
          step="5"
          value={ambientValue}
          aria-label="Ambient light"
          onChange={(event) => onAmbient?.(Number(event.target.value))}
        />
        <span className="ed-emissive-value">{ambientValue}%</span>
      </label>
      <label className="ed-emissive" title="Ambient light colour: the tint of the room when light is low.">
        <span className="ed-emissive-label">Colour</span>
        <input
          className="ed-colour"
          type="color"
          value={toColourInput(hex)}
          aria-label="Ambient light colour"
          onChange={(event) => {
            setHex(event.target.value)
            onAmbientColour?.(event.target.value)
          }}
        />
        <input
          className="ed-colour-hex me-name"
          value={hex}
          aria-label="Ambient light colour hex"
          onChange={(event) => {
            const next = event.target.value.trim()
            setHex(next)
            if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(next)) onAmbientColour?.(next)
          }}
        />
      </label>
    </div>
  )
}

function SpriteDetails({ tile, onStatus, ambient, ambientColour, onAmbient, onAmbientColour }) {
  const info = tileSpriteInfo(tile)
  const [emissive, setEmissive] = useState(() => overlayEmissive(tile.id))
  const [emitColour, setEmitColour] = useState(() => overlayEmitColour(tile.id))
  if (!info) return null
  const anim = info.animation
  const glowFallback =
    info.glow ||
    (typeof info.wallGlow === 'string' ? info.wallGlow : info.wallGlow?.colour) ||
    info.activeGlow
  return (
    <div className="ed-sprite-details" style={{ '--ed-emit-strength': String(emissive) }}>
      <p className="ed-dock-title">Sprite</p>
      <PropRows
        rows={[
          ['Id', info.id],
          ['Symbol', info.symbol],
          ['Group', info.group ? `${info.group.label}${info.group.section ? ` · ${info.group.section}` : ''}` : null],
          ['Design size', `${info.size.width}×${info.size.height} px`],
          ['World height', info.height != null ? String(info.height) : null],
          ['Traits', info.traits.length ? info.traits.join(', ') : 'None'],
        ]}
      />
      {(info.glow || info.wallGlow || info.activeGlow || anim?.overlay || tile.wall) && (
        <AmbientLightControl
          ambient={ambient}
          ambientColour={ambientColour}
          onAmbient={onAmbient}
          onAmbientColour={onAmbientColour}
        />
      )}
      <p className="ed-dock-title">Images</p>
      <PropRows rows={info.images.map((entry) => [entry.label, entry.name, entry.href])} />
      {anim ? (
        <>
          <p className="ed-dock-title">Animation</p>
          <PropRows
            rows={[
              ['Mode', anim.overlay ? 'Overlay lights' : anim.activeOnly ? 'Active only' : 'Whole sprite'],
              ['Frame time', anim.frameTime != null ? `${anim.frameTime}s` : null],
              ['Steps', String(anim.steps)],
              ['Loop', anim.loop != null ? `${anim.loop.toFixed(2)}s` : null],
              ['Sprites', String(anim.uniqueSprites)],
              ['Sequence', anim.sequence.length ? anim.sequence.join(' ') : null],
            ]}
          />
          <p className="ed-dock-title">Emission overlays</p>
          {(anim.overlay || info.glow || info.wallGlow || anim.emissions.length > 0) && (
            <EmissiveControls
              tileId={tile.id}
              value={emissive}
              onValue={setEmissive}
              colour={emitColour}
              fallbackColour={glowFallback}
              onColour={setEmitColour}
              onStatus={onStatus}
            />
          )}
          {anim.emissions.length > 0 ? (
            <>
              <p className="me-text is-muted">
                {anim.overlay
                  ? 'Lit overlay frames drawn over the wall. Emissive / Colour control floor spill.'
                  : 'Lit parts kept bright in darkness. Emissive / Colour control floor spill.'}
              </p>
              <div className="ed-emit-grid" role="list">
                {anim.emissions.map((item) => {
                  const base =
                    item.kind === 'panelEmission.x'
                      ? tile.panelImages?.x || tile.image
                      : item.kind === 'panelEmission.y'
                        ? tile.panelImages?.y || tile.image
                        : item.kind === 'bigEmission'
                          ? tile.bigImage || tile.image
                          : tile.image
                  return (
                    <figure
                      key={`${item.frame}:${item.href}`}
                      className="ed-emit-cell"
                      role="listitem"
                      title={`${item.kind} · frame ${item.frame}\n${item.href}`}
                    >
                      <div className="ed-emit-thumb">
                        {base && <img className="ed-emit-base" src={base} alt="" />}
                        <img className="ed-emit-layer" src={item.href} alt="" />
                      </div>
                      <figcaption>
                        <span className="ed-sprite-frame-index">{item.frame}</span>
                        <span className="ed-emit-name">{item.name}</span>
                      </figcaption>
                    </figure>
                  )
                })}
              </div>
            </>
          ) : (
            <p className="me-text is-muted">No emission layers on this flipbook.</p>
          )}
        </>
      ) : (
        <>
          <p className="ed-dock-title">Animation</p>
          <p className="me-text is-muted">No flipbook (static sprite).</p>
        </>
      )}
    </div>
  )
}

export default function AssetProperties({
  tool,
  onStatus,
  hazardIntensity = 2,
  onHazardIntensity,
  animateTiles = true,
  ambient,
  ambientColour,
  onAmbient,
  onAmbientColour,
}) {
  const asset = parseTool(tool)
  if (!asset) return <p className="me-text">Select a thumbnail in Assets to edit it here.</p>

  if (asset.kind === 'tile') {
    const tile = getTile(asset.id)
    return (
      <div className="ed-asset-props">
        <p className="ed-dock-title">Tile</p>
        <div className="ed-asset-preview">
          <TileThumbnail tile={tile} className="ed-asset-preview-art" animate={animateTiles} />
          {tile.big && <span className="me-thumb-badge">2×2</span>}
        </div>
        <p className="ed-asset-name">{tile.label}</p>
        <div className="ed-prop-flags" role="group" aria-label="Tile flags">
          {FLAG_BOXES.map((box) => (
            <FlagBox key={`${tile.id}:${box.flag}`} tile={tile} box={box} onStatus={onStatus} />
          ))}
        </div>
        {!canEditTiles && <p className="me-text is-muted">Cover and Fade can only be changed in the dev build.</p>}
        <SpriteDetails
          key={tile.id}
          tile={tile}
          onStatus={onStatus}
          ambient={ambient}
          ambientColour={ambientColour}
          onAmbient={onAmbient}
          onAmbientColour={onAmbientColour}
        />
      </div>
    )
  }

  if (asset.kind === 'destructible') {
    const info = DESTRUCTIBLE_TYPES[asset.id]
    const tile = getTile(destructibleTileId(asset.id))
    const size = imageSize(tile)
    return (
      <div className="ed-asset-props">
        <p className="ed-dock-title">Destructible</p>
        <div className="ed-asset-preview">
          <TileThumbnail tile={tile} className="ed-asset-preview-art" animate={animateTiles} />
        </div>
        <p className="ed-asset-name">{info?.name ?? asset.id}</p>
        <p className="me-text">{info?.description ?? 'Click the board to place.'}</p>
        <PropRows
          rows={[
            ['Type', asset.id],
            ['Tile', tile.id],
            ['Structure', info?.structure != null ? String(info.structure) : null],
            ['Resistance', info?.resistance != null ? String(info.resistance) : null],
            ['Explosion', info?.explosion ? info.explosion.kind ?? 'yes' : 'None'],
            ['Sprite', `${size.width}×${size.height} · ${tile.image?.split('/').pop() ?? '—'}`, tile.image],
          ]}
        />
        <SpriteDetails
          key={tile.id}
          tile={tile}
          onStatus={onStatus}
          ambient={ambient}
          ambientColour={ambientColour}
          onAmbient={onAmbient}
          onAmbientColour={onAmbientColour}
        />
      </div>
    )
  }

  if (asset.kind === 'item') {
    const item = getItemById(asset.id)
    const stats = item ? getItemStatLines(item) : []
    return (
      <div className="ed-asset-props">
        <p className="ed-dock-title">Item</p>
        <div className="ed-asset-preview">
          {item?.icon ? <img className="ed-asset-preview-art" src={item.icon} alt="" /> : <span className="me-swatch is-area" aria-hidden="true" />}
        </div>
        <p className="ed-asset-name">{item?.name ?? asset.id}</p>
        <PropRows
          rows={[
            ['Id', item?.id ?? asset.id],
            ['Category', item ? getCategoryName(item.category) : null],
            ['Slot', item?.equipSlot ?? 'Bag / ground'],
            ['Icon', item?.icon?.split('/').pop() ?? null, item?.icon],
            ['World', item?.worldImage?.split('/').pop() ?? null, item?.worldImage],
            ['Scale', item?.worldScale != null ? String(item.worldScale) : null],
          ]}
        />
        {stats.length > 0 && (
          <>
            <p className="ed-dock-title">Stats</p>
            <PropRows rows={stats.map((line) => [line.label, String(line.value ?? '')])} />
          </>
        )}
        <p className="me-text">Click the board to place this item on the ground.</p>
      </div>
    )
  }

  if (asset.kind === 'hazard') {
    const info = HAZARD_TYPES[asset.id]
    return (
      <div className="ed-asset-props">
        <p className="ed-dock-title">Hazard</p>
        <div className="ed-asset-preview">
          <span
            className="me-swatch is-hazard ed-asset-preview-swatch"
            style={{ backgroundColor: info?.colour, backgroundImage: `url(${hazardStrip(asset.id)})`, backgroundSize: `${HAZARD_FRAMES * 100}% 100%` }}
            aria-hidden="true"
          />
        </div>
        <p className="ed-asset-name">{info?.name ?? asset.id}</p>
        <PropRows
          rows={[
            ['Type', asset.id],
            ['Injury', info?.injuryType ?? null],
            ['Severity', info?.severity != null ? String(info.severity) : null],
            ['Blocks sight', info?.blocksSight ? 'From Thick up' : 'No'],
            ['Colour', info?.colour ?? null],
            ['Frames', String(HAZARD_FRAMES)],
            ['Scar tile', info?.scarTile ?? null],
          ]}
        />
        <div className="me-intensity" role="group" aria-label="Hazard intensity">
          {INTENSITIES.map((entry) => (
            <button
              key={entry.value}
              type="button"
              className={`me-button${hazardIntensity === entry.value ? ' is-selected' : ''}`}
              aria-pressed={hazardIntensity === entry.value}
              onClick={() => onHazardIntensity?.(entry.value)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <p className="me-text">Smoke and Toxic Gas block sight from Thick up; Thin gives cover.</p>
      </div>
    )
  }

  if (asset.kind === 'hazardErase') {
    return (
      <div className="ed-asset-props">
        <p className="ed-dock-title">Hazard</p>
        <p className="ed-asset-name">Erase Hazard</p>
        <p className="me-text">Click hazard tiles on the board to erase them.</p>
      </div>
    )
  }

  return (
    <div className="ed-asset-props">
      <p className="ed-dock-title">Marker</p>
      <p className="ed-asset-name">
        {asset.id === 'playerStarts'
          ? 'Player Start'
          : asset.id === 'enemySpawns'
            ? 'Enemy Spawn'
            : asset.id === 'npcs'
              ? 'NPC'
              : asset.id === 'area'
                ? 'Area Label'
                : 'Erase Marker'}
      </p>
      <p className="me-text">{MARKER_HELP[asset.id]}</p>
    </div>
  )
}
