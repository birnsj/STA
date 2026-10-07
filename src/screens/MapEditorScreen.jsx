import { useEffect, useState } from 'react'
import { ENEMY_SPAWNS_NEEDED as TYPE1_SPAWNS } from '../combat/encounters.js'
import { ENEMY_SPAWNS_NEEDED as TYPE2_SPAWNS } from '../combat2/combat2State.js'
import EditorBoard from '../components/maps/EditorBoard.jsx'
import EditorPalette from '../components/maps/EditorPalette.jsx'
import EditorToolbar from '../components/maps/EditorToolbar.jsx'
import EpisodeCardPicker from '../components/maps/EpisodeCardPicker.jsx'
import ConfirmDialog from '../components/maps/ConfirmDialog.jsx'
import LoadMapDialog from '../components/maps/LoadMapDialog.jsx'
import '../components/maps/mapEditor.css'
import { areaAt, eraseMarkers, paintTile, setAreaLabel, toggleMarker } from '../maps/mapEdits.js'
import { canSaveMaps, listMaps, loadMap, saveMap } from '../maps/mapFiles.js'
import { randomEpisodeName } from '../rules/locationNames.js'
import { createBlankMap, DEFAULT_BIOME, DEFAULT_MAP_TYPE, getTile, mapFileId, resizeMap, validateMap } from '../maps/mapFormat.js'
import { biomeFor, DEFAULT_SIZE, generateNamedMap, generatorFor, randomMapName, sizeFor, sizeIdOf } from '../maps/mapGenerators.js'
import { canDrawEpisodeArt, generateEpisodeArt, removeEpisodeArt } from '../maps/episodeArt.js'
import { isDrawnCard } from '../maps/episodeCards.js'
import { randomWeather, settleWeather, weatherFor } from '../maps/mapWeather.js'
import WeatherFx from '../effects/WeatherFx.jsx'

// Dev map editor (opened from the Main Menu's Dev Edit). Edits combat-independent map files in the project's maps/ folder,
// which both combat types play.

// A new map keeps the current location and biome and starts at the location's Medium size.
const blankMap = (mapType, biome = DEFAULT_BIOME) => ({ ...createBlankMap(sizeFor(mapType, DEFAULT_SIZE)), mapType, biome })

export default function MapEditorScreen({ onBack }) {
  // The map being edited, and fileId: which file it was opened from or saved as (null = never saved).
  const [map, setMap] = useState(() => blankMap(DEFAULT_MAP_TYPE))
  const [fileId, setFileId] = useState(null)
  // UI state only.
  const [dirty, setDirty] = useState(false)
  const [maps, setMaps] = useState([])
  const [tool, setTool] = useState('tile:bulkhead')
  const [ghostBlocks, setGhostBlocks] = useState(false)
  const [showWeather, setShowWeather] = useState(true)
  const [hover, setHover] = useState(null)
  const [status, setStatus] = useState(null)
  const [showLoad, setShowLoad] = useState(false)
  const [drawingCard, setDrawingCard] = useState(false)
  // The open confirm popup: { title, message, confirmLabel, resolve }.
  const [question, setQuestion] = useState(null)
  // The map as last opened or saved (null when the open map exists nowhere else), so switching only the location, biome or size
  // before Generate Map doesn't count as work to lose.
  const [cleanMap, setCleanMap] = useState(map)
  // The file Generate wrote last (cleared by any save, load or new map), so only its own output is rebuilt in place.
  const [generatedId, setGeneratedId] = useState(null)
  // Remounts the board (re-centring the camera) whenever a different map is loaded.
  const [boardKey, setBoardKey] = useState(0)

  useEffect(() => {
    listMaps()
      .then(setMaps)
      .catch((error) => setStatus(`Could not list maps: ${error.message}`))
  }, [])

  const edit = (next) => {
    if (next === map) return
    setMap(next)
    setDirty(true)
  }
  // Shows the in-editor confirm popup; resolves true when the user confirms.
  const askConfirm = (question) => new Promise((resolve) => setQuestion({ ...question, resolve }))
  const answer = (confirmed) => {
    question.resolve(confirmed)
    setQuestion(null)
  }
  const confirmDiscard = async (message = 'This map has unsaved changes. Discard them?', confirmLabel = 'Discard') =>
    !dirty || askConfirm({ title: 'Unsaved Changes', message, confirmLabel })
  const replaceMap = (next, nextFileId, message, { unsaved = false } = {}) => {
    setMap(next)
    setGeneratedId(null)
    setCleanMap(unsaved ? null : next)
    setFileId(nextFileId)
    setDirty(unsaved)
    setStatus(message)
    setBoardKey((key) => key + 1)
  }

  const onPaint = (position, { first }) => {
    if (tool.startsWith('tile:')) {
      edit(paintTile(map, position, tool.slice('tile:'.length)))
      return
    }
    // Marker tools act on the pressed tile only, not on every tile dragged over.
    if (!first) return
    if (tool === 'erase') edit(eraseMarkers(map, position))
    else if (tool === 'area') {
      const name = window.prompt('Area label (leave empty to remove):', areaAt(map, position)?.name ?? '')
      if (name !== null) edit(setAreaLabel(map, position, name))
    } else edit(toggleMarker(map, tool, position))
  }

  const onNew = async () => (await confirmDiscard()) && replaceMap(blankMap(map.mapType, map.biome), null, 'New map.')

  // Only the location, biome, weather or size changed since the map was opened or saved: nothing worth asking about.
  const withoutSetup = (other) => JSON.stringify({ ...other, mapType: null, biome: null, weather: null })
  const onlySetupChanged = Boolean(cleanMap) && withoutSetup(map) === withoutSetup(resizeMap(cleanMap, map.width, map.height))
  // A map Generate just made and nobody has touched: changing its location, biome or size rebuilds it straight away,
  // replacing its file. The same changes on a hand-made or loaded map only re-tag / resize it.
  const rebuildable = Boolean(generatedId) && generatedId === fileId && onlySetupChanged
  const changeSetup = (changed) => {
    const next = settleWeather(changed)
    if (rebuildable) return onGenerate(next, { replace: true })
    edit(next)
    if (next.mapType !== map.mapType) setStatus(`Location set to ${generatorFor(next.mapType).label}. Generate Map builds a new one of this type.`)
    else if (next.biome !== map.biome) setStatus(`Biome set to ${biomeFor(next.biome).label}. Generate Map builds a new map in it.`)
  }
  const onBiome = (biome) => changeSetup({ ...map, biome })
  const onSize = (sizeId) => {
    if (sizeId === 'custom') return
    const { width, height } = sizeFor(map.mapType, sizeId)
    changeSetup(resizeMap(map, width, height))
  }
  // A map on a size preset moves to the same preset for its new type, so a Large deck becomes a Large colony.
  const onMapType = (mapType) => {
    const sizeId = sizeIdOf(map)
    const retyped = { ...map, mapType }
    if (sizeId === 'custom') return changeSetup(retyped)
    const { width, height } = sizeFor(mapType, sizeId)
    changeSetup(resizeMap(retyped, width, height))
  }

  // Builds a complete map of source's type and size and saves it, so it is ready in Load Episode: as a new file, or with
  // replace, in place of the untouched map Generate made last. The re-list keeps the generated name clear of files added
  // outside the editor.
  const onGenerate = async (source = map, { replace = false } = {}) => {
    const proceed =
      onlySetupChanged ||
      (await confirmDiscard('The open map has unsaved changes. Generating saves a new map as a new file, and those changes will be lost.', 'Generate'))
    if (!proceed) return
    const replacing = replace && rebuildable ? fileId : null
    let taken = maps
    if (canSaveMaps) {
      try {
        taken = await listMaps()
      } catch (error) {
        setStatus(`Could not list maps: ${error.message}`)
        return
      }
    }
    let generated = generateNamedMap(source, taken.map((entry) => entry.id))
    generated = { ...generated, weather: randomWeather(generated) }
    if (!canSaveMaps) {
      replaceMap(generated, null, `Generated ${generated.name}. Saving only works from the dev server.`, { unsaved: true })
      return
    }
    // A freshly drawn picture; if drawing fails the map keeps the catalogue card Generate picked.
    try {
      generated = { ...generated, card: await generateEpisodeArt(generated, generated.id) }
    } catch {
      // keep the catalogue card
    }
    if (replacing && isDrawnCard(map.card) && replacing.toLowerCase() !== generated.id.toLowerCase()) removeEpisodeArt(replacing).catch(() => {})
    try {
      setMaps(await saveMap(generated, replacing))
      replaceMap(
        generated,
        generated.id,
        replacing ? `Rebuilt as maps/${generated.id}.json (replaces ${replacing}.json).` : `Generated and saved maps/${generated.id}.json.`,
      )
      setGeneratedId(generated.id)
    } catch (error) {
      replaceMap(generated, null, `Generated ${generated.name} but could not save: ${error.message}`, { unsaved: true })
    }
  }
  // Re-lists on open so files added or removed outside the editor show up.
  const onShowLoad = () => {
    setShowLoad(true)
    listMaps()
      .then(setMaps)
      .catch((error) => setStatus(`Could not list maps: ${error.message}`))
  }
  const onLoad = async (id) => {
    setShowLoad(false)
    if (!(await confirmDiscard())) return
    loadMap(id)
      .then((loaded) => replaceMap(loaded, id, `Loaded ${loaded.name}.`))
      .catch((error) => setStatus(`Could not load ${id}: ${error.message}`))
  }
  // The file is named after the map. previousId: the file to rename (the one this map was opened from), or null to
  // write a new file and leave any other alone.
  const saveAs = async (name, previousId) => {
    const id = mapFileId(name)
    if (!id) {
      setStatus('Give the map a name first.')
      return
    }
    const sameFile = previousId && previousId.toLowerCase() === id.toLowerCase()
    const taken = maps.some((entry) => entry.id.toLowerCase() === id.toLowerCase())
    if (!sameFile && taken) {
      const overwrite = await askConfirm({ title: 'Map Exists', message: `A map named ${id} already exists. Overwrite it?`, confirmLabel: 'Overwrite' })
      if (!overwrite) return
    }
    const named = { ...map, name: name.trim(), id }
    saveMap(named, previousId)
      .then((list) => {
        setMaps(list)
        setMap(named)
        setCleanMap(named)
        setGeneratedId(null)
        setFileId(id)
        setDirty(false)
        setStatus(`Saved maps/${id}.json.`)
      })
      .catch((error) => setStatus(`Could not save: ${error.message}`))
  }
  const askName = (question) => {
    const name = window.prompt(question, map.name)
    return name === null ? null : name
  }
  // A never-saved map asks for its name first; after that Save keeps the file in step with the name field.
  const onSave = () => {
    if (fileId) return saveAs(map.name, fileId)
    const name = askName('Name this map (it is saved as maps/<name>.json):')
    if (name !== null) saveAs(name, null)
  }
  const onSaveAs = () => {
    const name = askName('Save a copy of this map as:')
    if (name !== null) saveAs(name, null)
  }
  // Draws a new picture named after the map, replacing the one Generate Card drew for it before.
  const onGenerateCard = async () => {
    const id = mapFileId(map.name)
    if (!id) {
      setStatus('Give the map a name first: its picture is saved under that name.')
      return
    }
    setDrawingCard(true)
    try {
      const card = await generateEpisodeArt(map, id)
      edit({ ...map, card })
      setStatus(`Drew a new card as public/art/episodes/${id}.png. Save the map to keep it on this episode.`)
    } catch (error) {
      setStatus(`Could not draw a card: ${error.message}`)
    } finally {
      setDrawingCard(false)
    }
  }

  const warnings = [
    ...new Set([
      ...validateMap(map, { enemySpawns: TYPE1_SPAWNS, label: 'Combat Type 1' }),
      ...validateMap(map, { enemySpawns: TYPE2_SPAWNS, label: 'Combat Type 2' }),
    ]),
  ]
  const hoverTile = hover && hover.x < map.width && hover.y < map.height ? hover : null

  return (
    <div className="me-screen">
      <EditorToolbar
        map={map}
        canSave={canSaveMaps}
        dirty={dirty}
        onRename={(name) => edit({ ...map, name })}
        onMapType={onMapType}
        onBiome={onBiome}
        onWeather={(weather) => edit({ ...map, weather })}
        showWeather={showWeather}
        onShowWeather={setShowWeather}
        onSize={onSize}
        onResize={(width, height) => edit(resizeMap(map, width, height))}
        onNew={onNew}
        onLoad={onShowLoad}
        onSave={onSave}
        onSaveAs={onSaveAs}
        onBack={async () => (await confirmDiscard()) && onBack()}
      />
      <div className="me-body">
        <EditorPalette tool={tool} onTool={setTool} ghostBlocks={ghostBlocks} onGhostBlocks={setGhostBlocks} onStatus={setStatus} />
        <div className="me-board-area">
          <EditorBoard key={boardKey} map={map} ghostBlocks={ghostBlocks} onPaint={onPaint} onHover={setHover} />
          {showWeather && <WeatherFx fx={weatherFor(map.weather).fx} />}
        </div>
        <div className="me-side">
          <p className="me-heading">Episode Name</p>
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
          <p className="me-text">The map name is the mission location.</p>
          <p className="me-heading">Episode Card</p>
          <EpisodeCardPicker
            cardId={map.card}
            weatherFx={showWeather ? weatherFor(map.weather).fx : null}
            canGenerate={canDrawEpisodeArt}
            busy={drawingCard}
            onCard={(card) => edit({ ...map, card })}
            onGenerate={onGenerateCard}
          />
          <p className="me-text">Shown in Load Episode. Generate Card draws a new picture for the location, biome and weather, saved under the map name.</p>
          <p className="me-heading">Generate</p>
          <button type="button" className="me-button me-generate" onClick={() => edit({ ...map, name: randomMapName(map) })}>
            Generate Name
          </button>
          <button
            type="button"
            className="me-button me-generate"
            title="Builds a new map of this type at the current size with a random name, episode name and episode card, and saves it as a new file"
            onClick={() => onGenerate()}
          >
            Generate Map
          </button>
          <p className="me-text">Uses the location, biome and size next to the name. Generate Map saves the new map as a new file.</p>
          <p className="me-heading">File</p>
          <p className="me-text">{fileId ? `maps/${fileId}.json` : 'Not saved yet'}</p>
          {fileId && mapFileId(map.name) && mapFileId(map.name) !== fileId && (
            <p className="me-text">Renamed to maps/{mapFileId(map.name)}.json on Save.</p>
          )}
          <p className="me-heading">Tile</p>
          <p className="me-text">{hoverTile ? `${hoverTile.x}, ${hoverTile.y}: ${getTile(map.tiles[hoverTile.y][hoverTile.x]).label}` : '-'}</p>
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
          <p className="me-heading">Controls</p>
          <p className="me-text">
            Left click or drag: paint. Marker tools: click to place, click again to remove. Right drag or WASD: pan. Wheel: zoom.
          </p>
          {!canSaveMaps && <p className="me-text is-warning">Saving only works from the dev server.</p>}
          {status && <p className="me-status">{status}</p>}
        </div>
      </div>
      {showLoad && <LoadMapDialog maps={maps} currentId={fileId} onLoad={onLoad} onCancel={() => setShowLoad(false)} />}
      {question && (
        <ConfirmDialog
          title={question.title}
          message={question.message}
          confirmLabel={question.confirmLabel}
          onConfirm={() => answer(true)}
          onCancel={() => answer(false)}
        />
      )}
    </div>
  )
}
