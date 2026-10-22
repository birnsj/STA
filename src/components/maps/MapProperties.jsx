import missionLogData from '../../data/adaptation/exploration/missionLog.json'
import { MAX_AWAY_TEAM } from '../../exploration/awayTeam.js'
import { authoredDefinitionsFor } from '../../exploration/challengeObjects.js'
import { DEFAULT_AMBIENT_COLOUR, FULL_LIGHT, getTile, isRotated, mapFileId } from '../../maps/mapFormat.js'
import { BIOME_WORLDS, BIOMES, LOCATION_GROUPS, MAP_GENERATORS, MAP_SIZES, randomMapName, sizeFor, sizeIdOf, usesBiome } from '../../maps/mapGenerators.js'
import { isIndoors, weatherFor, weatherOptions } from '../../maps/mapWeather.js'
import { randomEpisodeName } from '../../rules/locationNames.js'
import EditorControlsHelp from './EditorControlsHelp.jsx'
import EpisodeCardPicker from './EpisodeCardPicker.jsx'

// Map-level properties for the right Properties panel when nothing is selected (or Map tab is forced).
// Extracted from EditorSidePanel; behavior unchanged.

function ScaleSlider({ label, title, min, value, onChange }) {
  return (
    <label className="me-scale" title={title}>
      <span className="me-scale-label">{label}</span>
      <input type="range" min={min} max="200" step="10" value={value} aria-label={label} onChange={(event) => onChange(Number(event.target.value))} />
      <span className="me-ambient-value">{value}%</span>
    </label>
  )
}

export default function MapProperties({
  map,
  edit,
  fileId,
  hoverTile,
  placing,
  rotated,
  warnings,
  status,
  showWeather,
  cardTools,
  placingObjective,
  canSave,
  onGenerateMap,
  generateHazards = false,
  onGenerateHazards,
  onOpenObjective,
  onMapType,
  onBiome,
  onWeather,
  onShowWeather,
  onAmbient,
  onAmbientColour,
  onSize,
  roomScale,
  onRoomScale,
  buildingScale,
  onBuildingScale,
}) {
  const objectives = map.objectives ?? []
  const objectCount = authoredDefinitionsFor(map).length
  const biomeless = !usesBiome(map)
  const weatherList = weatherOptions(map)
  const sizeId = sizeIdOf(map)

  return (
    <div className="ed-map-props">
      <p className="me-heading">Map</p>
      <label className="me-field">
        Location
        <select className="me-select me-wide" value={map.mapType} aria-label="Location" onChange={(event) => onMapType(event.target.value)}>
          {LOCATION_GROUPS.map((group) => (
            <optgroup key={group.id} label={group.label}>
              {MAP_GENERATORS.filter((generator) => generator.group === group.id).map((generator) => (
                <option key={generator.id} value={generator.id}>
                  {generator.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="me-field">
        Biome
        <select
          className="me-select me-wide"
          value={map.biome}
          disabled={biomeless}
          title={biomeless ? 'Ships, stations and indoor locations have no biome' : 'Biome'}
          onChange={(event) => onBiome(event.target.value)}
        >
          {BIOME_WORLDS.map((world) => (
            <optgroup key={world.id} label={world.label}>
              {BIOMES.filter((biome) => biome.world === world.id).map((biome) => (
                <option key={biome.id} value={biome.id}>
                  {biome.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="me-field">
        Weather
        <select
          className="me-select me-wide"
          value={map.weather}
          disabled={weatherList.length === 1}
          title={weatherList.length === 1 ? 'No weather here' : isIndoors(map) ? 'Atmosphere (indoor weather)' : 'Weather'}
          onChange={(event) => onWeather(event.target.value)}
        >
          {weatherList.map((weather) => (
            <option key={weather.id} value={weather.id}>
              {weather.label}
            </option>
          ))}
        </select>
      </label>
      <label className="me-check" title="Show the weather effect over the map">
        <input type="checkbox" checked={showWeather} onChange={(event) => onShowWeather(event.target.checked)} /> Weather FX
      </label>
      <label className="me-field">
        Size preset
        <select className="me-select me-wide" value={sizeId} aria-label="Map size" onChange={(event) => onSize(event.target.value)}>
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
      </label>
      <label className="me-ambient" title="Ambient light: how dark the map is. Glowing tiles stay lit in the dark.">
        Light
        <input type="range" min="0" max={FULL_LIGHT} step="5" value={map.ambient ?? FULL_LIGHT} aria-label="Ambient light" onChange={(event) => onAmbient(Number(event.target.value))} />
        <span className="me-ambient-value">{map.ambient ?? FULL_LIGHT}%</span>
      </label>
      <label className="me-ambient ed-emissive" title="Ambient light colour: the tint of the room when light is low.">
        Colour
        <input
          className="ed-colour"
          type="color"
          value={(() => {
            const value = map.ambientColour || DEFAULT_AMBIENT_COLOUR
            return value.length === 4 ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}` : value
          })()}
          aria-label="Ambient light colour"
          onChange={(event) => onAmbientColour?.(event.target.value)}
        />
      </label>

      <p className="me-heading">Generate</p>
      <ScaleSlider label="Room size" title="How big Generate Map makes rooms." min="70" value={roomScale} onChange={onRoomScale} />
      <ScaleSlider label="Building size" title="How big Generate Map makes buildings and city blocks." min="100" value={buildingScale} onChange={onBuildingScale} />
      <button type="button" className="me-button me-generate" onClick={() => edit({ ...map, name: randomMapName(map) })}>
        Generate Name
      </button>
      <button type="button" className="me-button me-generate" title="Builds a new map. Nothing is saved until you press Save." onClick={onGenerateMap}>
        Generate Map
      </button>
      <label className="me-check">
        <input type="checkbox" checked={generateHazards} onChange={(event) => onGenerateHazards?.(event.target.checked)} />
        Generate hazards
      </label>

      <p className="me-heading">Episode</p>
      <input
        className="me-name me-episode"
        value={map.episodeName}
        placeholder="Shown in Load Episode"
        aria-label="Episode name"
        onChange={(event) => edit({ ...map, episodeName: event.target.value })}
      />
      <button type="button" className="me-button me-generate" onClick={() => edit({ ...map, episodeName: randomEpisodeName(map.episodeName, Math.random, map.name) })}>
        Generate Episode Name
      </button>
      <p className="me-heading">Episode Card</p>
      <EpisodeCardPicker
        cardId={map.card}
        weatherFx={showWeather ? weatherFor(map.weather).fx : null}
        canGenerate={cardTools.canGenerate}
        busy={cardTools.busy}
        onCard={(card) => edit({ ...map, card })}
        onGenerate={cardTools.onGenerate}
      />

      <p className="me-heading">Captain&apos;s Log</p>
      <label className="me-field">
        Starting stardate
        <input
          className="me-name me-wide"
          type="number"
          step="0.1"
          value={map.stardate ?? ''}
          placeholder={`Default ${missionLogData.defaultStardate}`}
          onChange={(event) => edit({ ...map, stardate: event.target.value === '' ? null : Number(event.target.value) })}
        />
      </label>
      <label className="me-field">
        Briefing (intro)
        <textarea className="me-name me-wide" rows={5} value={map.briefing ?? ''} onChange={(event) => edit({ ...map, briefing: event.target.value })} />
      </label>
      <label className="me-field">
        Outro
        <textarea className="me-name me-wide" rows={4} value={map.outro ?? ''} onChange={(event) => edit({ ...map, outro: event.target.value })} />
      </label>
      <label className="me-field">
        Outro (abandoned)
        <textarea className="me-name me-wide" rows={3} value={map.outroAbandoned ?? ''} onChange={(event) => edit({ ...map, outroAbandoned: event.target.value })} />
      </label>
      <label className="me-field">
        Outro (failed)
        <textarea className="me-name me-wide" rows={3} value={map.outroFailed ?? ''} onChange={(event) => edit({ ...map, outroFailed: event.target.value })} />
      </label>
      <p className="me-text is-muted">Story wording: Mission → Story Wording.</p>

      <p className="me-heading">Objectives</p>
      {objectives.length ? (
        <ul className="me-objective-list">
          {objectives.map((objective, index) => (
            <li key={index}>
              <button type="button" className="me-link" onClick={() => onOpenObjective(index)}>
                O{index + 1} · {objective.title || objective.id}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="me-text">None yet — Mission → Objective Editor.</p>
      )}
      {placingObjective !== null && <p className="me-text">Click a tile to mark the objective (Escape cancels).</p>}
      <p className="me-text">
        Objects: {objectCount ? `${objectCount}` : 'none'}
        {map.objects ? ' (map-owned).' : objectCount ? ' (challenges.json until edited).' : '.'} Editors are under Mission.
      </p>

      <p className="me-heading">Status</p>
      <p className="me-text">{fileId ? `maps/${fileId}.json` : 'Not saved yet'}</p>
      {fileId && mapFileId(map.name) && mapFileId(map.name) !== fileId && <p className="me-text">Renamed to maps/{mapFileId(map.name)}.json on Save.</p>}
      <p className="me-text">
        Tile:{' '}
        {hoverTile
          ? (() => {
              const tileId = map.tiles[hoverTile.y]?.[hoverTile.x]
              const label = tileId != null ? getTile(tileId)?.label ?? String(tileId) : 'out of bounds'
              return `${hoverTile.x}, ${hoverTile.y}: ${label}${isRotated(map, hoverTile) ? ' (rotated)' : ''}`
            })()
          : '—'}
      </p>
      <p className="me-text">Brush: {placing ? (rotated ? 'rotated' : 'not rotated') : 'off'}</p>
      <p className="me-text">
        Player starts: {map.markers.playerStarts.length} / {MAX_AWAY_TEAM}
      </p>
      <p className="me-heading">Warnings</p>
      {warnings.length ? (
        <ul className="me-warnings">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : (
        <p className="me-text">None</p>
      )}
      <EditorControlsHelp />
      {!canSave && <p className="me-text is-warning">Saving only works from the dev server.</p>}
      {status && <p className="me-status">{status}</p>}
    </div>
  )
}
