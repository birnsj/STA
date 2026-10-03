import { useState } from 'react'
import { MAX_SIZE, MIN_SIZE } from '../../maps/mapFormat.js'
import { BIOMES, MAP_GENERATORS, MAP_SIZES, sizeFor, sizeIdOf, usesBiome } from '../../maps/mapGenerators.js'

// Size presets for the map's type; Custom shows when the dimensions match none of them (set with the fields beside it).
function SizePicker({ map, onSize }) {
  const sizeId = sizeIdOf(map)
  return (
    <select className="me-select" value={sizeId} aria-label="Map size" title="Map size" onChange={(event) => onSize(event.target.value)}>
      {MAP_SIZES.map((size) => {
        const { width, height } = sizeFor(map.mapType, size.id)
        return (
          <option key={size.id} value={size.id}>
            {size.label} ({width}x{height})
          </option>
        )
      })}
      {sizeId === 'custom' && (
        <option value="custom" disabled>
          Custom
        </option>
      )}
    </select>
  )
}

// The map editor's top bar. Width / height are drafts until Resize is pressed, so typing doesn't reshape the map per keystroke.
function SizeFields({ width, height, onResize }) {
  const [draft, setDraft] = useState({ width, height, from: `${width}x${height}` })
  // A newly opened or resized map resets the drafts.
  if (draft.from !== `${width}x${height}`) setDraft({ width, height, from: `${width}x${height}` })
  const field = (key) => (
    <input
      type="number"
      className="me-number"
      min={MIN_SIZE}
      max={MAX_SIZE}
      value={draft[key]}
      onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
    />
  )
  const changed = Number(draft.width) !== width || Number(draft.height) !== height
  return (
    <span className="me-size">
      W {field('width')} H {field('height')}
      <button type="button" className="me-button" disabled={!changed} onClick={() => onResize(Number(draft.width), Number(draft.height))}>
        Resize
      </button>
    </span>
  )
}

// The map's location and biome (both saved with it) decide what kind of name Generate Name gives and what Generate Map
// builds. Ships and stations have no biome, so the biome list is disabled for them.
function MapTypeControls({ map, onMapType, onBiome, onSize }) {
  const biomeless = !usesBiome(map)
  return (
    <span className="me-size">
      <select className="me-select" value={map.mapType} aria-label="Location" title="Location" onChange={(event) => onMapType(event.target.value)}>
        {MAP_GENERATORS.map((generator) => (
          <option key={generator.id} value={generator.id}>
            {generator.label}
          </option>
        ))}
      </select>
      <select
        className="me-select"
        value={map.biome}
        aria-label="Biome"
        title={biomeless ? 'Ships and stations have no biome' : 'Biome'}
        disabled={biomeless}
        onChange={(event) => onBiome(event.target.value)}
      >
        {BIOMES.map((biome) => (
          <option key={biome.id} value={biome.id}>
            {biome.label}
          </option>
        ))}
      </select>
      <SizePicker map={map} onSize={onSize} />
    </span>
  )
}

export default function EditorToolbar({ map, canSave, dirty, onRename, onMapType, onBiome, onSize, onResize, onNew, onLoad, onSave, onSaveAs, onBack }) {
  const saveNote = canSave ? undefined : 'Saving map files only works from the dev server (npm run dev).'
  return (
    <div className="me-toolbar">
      <button type="button" className="me-button" onClick={onBack}>
        Back
      </button>
      <input className="me-name" value={map.name} aria-label="Map name" title="The map's name is also its file name" onChange={(event) => onRename(event.target.value)} />
      <MapTypeControls map={map} onMapType={onMapType} onBiome={onBiome} onSize={onSize} />
      <SizeFields width={map.width} height={map.height} onResize={onResize} />
      <button type="button" className="me-button" onClick={onNew}>
        New
      </button>
      <button type="button" className="me-button" onClick={onLoad}>
        Load
      </button>
      <button type="button" className="me-button is-primary" disabled={!canSave} title={saveNote} onClick={onSave}>
        Save{dirty ? ' *' : ''}
      </button>
      <button type="button" className="me-button" disabled={!canSave} title={saveNote} onClick={onSaveAs}>
        Save As
      </button>
    </div>
  )
}
