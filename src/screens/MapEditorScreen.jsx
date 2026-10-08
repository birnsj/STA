import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { normalizeCharacterRecord } from '../character/runtimeCharacter.js'
import { ENEMY_SPAWNS_NEEDED as TYPE1_SPAWNS } from '../combat/encounters.js'
import EditorBoard from '../components/maps/EditorBoard.jsx'
import EditorMinimap from '../components/maps/EditorMinimap.jsx'
import EditorPalette from '../components/maps/EditorPalette.jsx'
import EditorToolbar from '../components/maps/EditorToolbar.jsx'
import EpisodeCardPicker from '../components/maps/EpisodeCardPicker.jsx'
import ConfirmDialog from '../components/maps/ConfirmDialog.jsx'
import TextDialog from '../components/maps/TextDialog.jsx'
import LoadMapDialog from '../components/maps/LoadMapDialog.jsx'
import '../components/maps/mapEditor.css'
import { areaAt, eraseMarkers, paintBrush, setAreaLabel, toggleMarker } from '../maps/mapEdits.js'
import { canSaveMaps, listMaps, loadMap, saveMap } from '../maps/mapFiles.js'
import { randomEpisodeName } from '../rules/locationNames.js'
import { createBlankMap, DEFAULT_BIOME, DEFAULT_MAP_TYPE, getTile, isRotated, mapFileId, resizeMap, validateMap } from '../maps/mapFormat.js'
import { biomeFor, DEFAULT_SIZE, generateNamedMap, generatorFor, randomMapName, sizeFor, sizeIdOf } from '../maps/mapGenerators.js'
import { canDrawEpisodeArt, drawEpisodeArt, isPendingArt, savePendingEpisodeArt } from '../maps/episodeArt.js'
import { randomWeather, settleWeather, weatherFor } from '../maps/mapWeather.js'
import WeatherFx from '../effects/WeatherFx.jsx'

// Dev map editor (opened from the Main Menu's Dev Edit). Edits combat-independent map files in the project's maps/ folder,
// which both combat types play.

const ExplorationPlaytest = lazy(() => import('./ExplorationScreen.jsx').then((module) => ({ default: module.ExplorationPlaytest })))
const PLAY_TEAM_SIZE = 4

// Play's away team: up to PLAY_TEAM_SIZE saved characters picked at random (no more than the map has player starts),
// as RuntimeCharacters. Characters whose saved JSON doesn't load are skipped.
function randomTeam(savedCharacters, starts) {
  const roster = savedCharacters.map((entry) => normalizeCharacterRecord(entry.record, { id: entry.id }).character).filter(Boolean)
  for (let i = roster.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[roster[i], roster[j]] = [roster[j], roster[i]]
  }
  return roster.slice(0, Math.min(PLAY_TEAM_SIZE, starts))
}

// A Generate Map size slider, in percent of the generators' own sizes.
// min: below it the size minimums (shared.js MIN_ROOM / MIN_BUILDING) make the slider do nothing.
function ScaleSlider({ label, title, min, value, onChange }) {
  return (
    <label className="me-scale" title={title}>
      <span className="me-scale-label">{label}</span>
      <input type="range" min={min} max="200" step="10" value={value} aria-label={label} onChange={(event) => onChange(Number(event.target.value))} />
      <span className="me-ambient-value">{value}%</span>
    </label>
  )
}

// A new map keeps the current location and biome and starts at the location's Medium size.
const blankMap = (mapType, biome = DEFAULT_BIOME) => ({ ...createBlankMap(sizeFor(mapType, DEFAULT_SIZE)), mapType, biome })

export default function MapEditorScreen({ savedCharacters = [], onBack }) {
  // The map being edited, and fileId: which file it was opened from or saved as (null = never saved).
  const [map, setMap] = useState(() => blankMap(DEFAULT_MAP_TYPE))
  const [fileId, setFileId] = useState(null)
  // UI state only.
  const [dirty, setDirty] = useState(false)
  const [maps, setMaps] = useState([])
  const [tool, setTool] = useState('tile:bulkhead')
  // Place Tiles: the board only paints the chosen tile while this is on; off, the pointer is just a cursor.
  const [placing, setPlacing] = useState(false)
  // The tile brush paints rotated tiles (right click on the board toggles it).
  const [rotated, setRotated] = useState(false)
  const [ghostBlocks, setGhostBlocks] = useState(false)
  // The board's animated tiles and the palette's tile previews play (off: each holds its first frame).
  const [animateTiles, setAnimateTiles] = useState(true)
  // Shadows, light pools and darkness are view only here; the map's ambient light is still saved.
  const [showLighting, setShowLighting] = useState(true)
  const [showWeather, setShowWeather] = useState(true)
  // Generate Map's Room size and Building size sliders, in percent of each generator's own sizes. Not saved with the map.
  const [roomScale, setRoomScale] = useState(100)
  const [buildingScale, setBuildingScale] = useState(100)
  // Play: the away team exploring the open map (null = editing), and whether its enemies notice them.
  const [playTeam, setPlayTeam] = useState(null)
  const [enemiesActive, setEnemiesActive] = useState(true)
  const [hover, setHover] = useState(null)
  const [status, setStatus] = useState(null)
  const [showLoad, setShowLoad] = useState(false)
  const [drawingCard, setDrawingCard] = useState(false)
  // The open confirm popup: { title, message, confirmLabel, resolve }.
  const [question, setQuestion] = useState(null)
  // UI state: the open text box (area label or map name) and the promise waiting on it.
  const [textQuestion, setTextQuestion] = useState(null)
  // The map as last opened, saved or generated (null when the open map exists nowhere else), so switching only the
  // location, biome or size before Generate Map doesn't count as work to lose.
  const [cleanMap, setCleanMap] = useState(map)
  // The open map came from Generate Map (cleared by any save, load or new map), so changing its setup rebuilds it.
  const [generated, setGenerated] = useState(false)
  // The save confirmation shown over the board for a moment: { id, text }.
  const [notice, setNotice] = useState(null)
  // Remounts the board (re-centring the camera) whenever a different map is loaded.
  const [boardKey, setBoardKey] = useState(0)

  useEffect(() => {
    listMaps()
      .then(setMaps)
      .catch((error) => setStatus(`Could not list maps: ${error.message}`))
  }, [])
  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(null), 3000)
    return () => clearTimeout(timer)
  }, [notice])
  // Escape puts the brush down (no tool selected, Place Tiles off), unless a dialog is open (its own Escape cancels it)
  // or a text box has focus.
  const dialogOpen = Boolean(question) || showLoad || Boolean(playTeam) || Boolean(textQuestion)
  useEffect(() => {
    if (dialogOpen) return undefined
    const onKey = (event) => {
      if (event.key !== 'Escape' || event.target.closest?.('input, textarea, select')) return
      setTool(null)
      setPlacing(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialogOpen])

  const edit = (next) => {
    if (next === map) return
    setMap(next)
    setDirty(true)
  }
  // Shows the in-editor confirm popup; resolves true when the user confirms.
  const askConfirm = (question) => new Promise((resolve) => setQuestion({ ...question, resolve }))
  // Shows the in-editor text box; resolves with the text, or null when cancelled.
  const askText = (question) => new Promise((resolve) => setTextQuestion({ ...question, resolve }))
  const answerText = (value) => {
    textQuestion.resolve(value)
    setTextQuestion(null)
  }
  const answer = (confirmed) => {
    question.resolve(confirmed)
    setQuestion(null)
  }
  const confirmDiscard = async (message = 'This map has unsaved changes. Discard them?', confirmLabel = 'Discard') =>
    !dirty || askConfirm({ title: 'Unsaved Changes', message, confirmLabel })
  const replaceMap = (next, nextFileId, message, { unsaved = false } = {}) => {
    setMap(next)
    setGenerated(false)
    setCleanMap(unsaved ? null : next)
    setFileId(nextFileId)
    setDirty(unsaved)
    setStatus(message)
    setBoardKey((key) => key + 1)
  }

  const onPaint = (position, { first }) => {
    if (!tool) return
    if (tool.startsWith('tile:')) {
      if (placing) edit(paintBrush(map, position, tool.slice('tile:'.length), rotated))
      return
    }
    // Marker tools act on the pressed tile only, not on every tile dragged over.
    if (!first) return
    if (tool === 'erase') edit(eraseMarkers(map, position))
    else if (tool === 'area') {
      const current = areaAt(map, position)?.name ?? ''
      askText({
        title: current ? 'Edit Area Label' : 'New Area Label',
        initialValue: current,
        placeholder: 'e.g. Tool Shed',
        removeLabel: current ? 'Remove' : null,
      }).then((name) => name !== null && edit(setAreaLabel(map, position, name)))
    } else edit(toggleMarker(map, tool, position))
  }

  const onNew = async () => (await confirmDiscard()) && replaceMap(blankMap(map.mapType, map.biome), null, 'New map.')

  // Only the location, biome, weather or size changed since the map was opened or saved: nothing worth asking about.
  // Memoised (as are the warnings) because comparing a large map is slow and the screen re-renders on every hovered tile.
  const onlySetupChanged = useMemo(() => {
    const withoutSetup = (other) => JSON.stringify({ ...other, mapType: null, biome: null, weather: null })
    return Boolean(cleanMap) && withoutSetup(map) === withoutSetup(resizeMap(cleanMap, map.width, map.height))
  }, [map, cleanMap])
  // A map Generate just made and nobody has touched: changing its location, biome or size rebuilds it straight away.
  // The same changes on a hand-made or loaded map only re-tag / resize it.
  const rebuildable = generated && onlySetupChanged
  const changeSetup = (changed) => {
    const next = settleWeather(changed)
    if (rebuildable) return onGenerate(next)
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

  // Builds a complete map of source's type and size with a fresh name and card. Nothing is written until Save (designer
  // decision, Oct 2026). The re-list keeps the generated name clear of files added outside the editor.
  const onGenerate = async (source = map) => {
    const proceed =
      onlySetupChanged || (await confirmDiscard('The open map has unsaved changes. Generating replaces it, and those changes will be lost.', 'Generate'))
    if (!proceed) return
    let taken = maps
    if (canSaveMaps) {
      try {
        taken = await listMaps()
      } catch (error) {
        setStatus(`Could not list maps: ${error.message}`)
        return
      }
    }
    let next = generateNamedMap(source, taken.map((entry) => entry.id), Math.random, { rooms: roomScale / 100, buildings: buildingScale / 100 })
    next = { ...next, weather: randomWeather(next) }
    // A freshly drawn picture, kept with the map until Save; if drawing fails the map keeps the catalogue card Generate picked.
    if (canDrawEpisodeArt) {
      try {
        next = { ...next, card: drawEpisodeArt(next) }
      } catch {
        // keep the catalogue card
      }
    }
    replaceMap(next, null, `Generated ${next.name}. Not saved yet: press Save to keep it.`, { unsaved: true })
    setCleanMap(next)
    setGenerated(true)
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
    try {
      // A card drawn since the last save is written now, named after the map.
      const card = isPendingArt(map.card) ? await savePendingEpisodeArt(map.card, id) : map.card
      const named = { ...map, name: name.trim(), id, card }
      setMaps(await saveMap(named, previousId))
      setMap(named)
      setCleanMap(named)
      setGenerated(false)
      setFileId(id)
      setDirty(false)
      setStatus(`Saved maps/${id}.json.`)
      setNotice({ id: Date.now(), text: `Saved maps/${id}.json` })
    } catch (error) {
      setStatus(`Could not save: ${error.message}`)
      setNotice({ id: Date.now(), text: `Could not save: ${error.message}`, failed: true })
    }
  }
  const askName = (title, message) => askText({ title, message, initialValue: map.name, saveLabel: 'Save', maxLength: 80 })
  // A never-saved map asks for its name first; after that Save keeps the file in step with the name field.
  const onSave = async () => {
    if (fileId) return saveAs(map.name, fileId)
    const name = await askName('Save Map', 'Name this map (it is saved as maps/<name>.json):')
    if (name !== null) saveAs(name, null)
  }
  const onSaveAs = async () => {
    const name = await askName('Save Map As', 'Save a copy of this map as:')
    if (name !== null) saveAs(name, null)
  }
  // Draws a new picture for the map; Save writes it under the map's name, replacing the one drawn for it before.
  const onGenerateCard = () => {
    setDrawingCard(true)
    try {
      edit({ ...map, card: drawEpisodeArt(map) })
      setStatus('Drew a new card. Save the map to keep it.')
    } catch (error) {
      setStatus(`Could not draw a card: ${error.message}`)
    } finally {
      setDrawingCard(false)
    }
  }

  const warnings = useMemo(() => validateMap(map, { enemySpawns: TYPE1_SPAWNS, label: 'Combat Type 1' }), [map])
  const hoverTile = hover && hover.x < map.width && hover.y < map.height ? hover : null

  const onPlay = () => {
    const starts = map.markers.playerStarts.length
    if (!starts) return setStatus('Play needs at least one player start on the map.')
    const team = randomTeam(savedCharacters, starts)
    if (!team.length) return setStatus('Play needs a saved character. Create one first.')
    setPlayTeam(team)
  }

  // The editor stays mounted underneath, so Exit comes back to the same map, unsaved edits and all.
  if (playTeam) {
    return (
      <Suspense fallback={null}>
        <ExplorationPlaytest map={map} characters={playTeam} enemiesActive={enemiesActive} onExit={() => setPlayTeam(null)} />
      </Suspense>
    )
  }

  return (
    <div className={`me-screen${animateTiles ? '' : ' is-still'}`}>
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
        onAmbient={(ambient) => edit({ ...map, ambient })}
        onSize={onSize}
        onResize={(width, height) => edit(resizeMap(map, width, height))}
        onNew={onNew}
        onLoad={onShowLoad}
        onSave={onSave}
        onSaveAs={onSaveAs}
        enemiesActive={enemiesActive}
        onEnemiesActive={setEnemiesActive}
        onPlay={onPlay}
        onBack={async () => (await confirmDiscard()) && onBack()}
        placing={placing}
        onPlacing={setPlacing}
      >
        <ScaleSlider label="Room size" title="How big Generate Map makes rooms (starship decks, stations, derelicts, labs, alien vessels, cantinas, detention blocks, temples)." min="70" value={roomScale} onChange={setRoomScale} />
        <ScaleSlider
          label="Building size"
          title="How big Generate Map makes buildings and city blocks (colonies, outposts, cities, farms, mining sites, landing fields)."
          min="100"
          value={buildingScale}
          onChange={setBuildingScale}
        />
      </EditorToolbar>
      <div className="me-body">
        <EditorPalette
          tool={tool}
          onTool={setTool}
          ghostBlocks={ghostBlocks}
          onGhostBlocks={setGhostBlocks}
          animateTiles={animateTiles}
          onAnimateTiles={setAnimateTiles}
          showLighting={showLighting}
          onShowLighting={setShowLighting}
          onStatus={setStatus}
        />
        <div className="me-board-area">
          <EditorBoard
            key={boardKey}
            map={map}
            ghostBlocks={ghostBlocks}
            lighting={showLighting}
            animate={animateTiles}
            brush={placing && tool?.startsWith('tile:') ? tool.slice('tile:'.length) : null}
            rotated={rotated}
            erasing={tool === 'erase'}
            onPaint={onPaint}
            onHover={setHover}
            onRotate={() => placing && tool?.startsWith('tile:') && setRotated((value) => !value)}
          />
          {showWeather && <WeatherFx fx={weatherFor(map.weather).fx} follow=".me-board" />}
          <EditorMinimap map={map} />
          {notice && (
            <div key={notice.id} className={`me-notice${notice.failed ? ' is-failed' : ''}`} role="status">
              {notice.text}
            </div>
          )}
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
          <p className="me-text">Shown in Load Episode. Generate Card draws a new picture for the location, biome and weather; Save keeps it under the map name.</p>
          <p className="me-heading">Generate</p>
          <button type="button" className="me-button me-generate" onClick={() => edit({ ...map, name: randomMapName(map) })}>
            Generate Name
          </button>
          <button
            type="button"
            className="me-button me-generate"
            title="Builds a new map of this type at the current size with a random name, episode name and episode card. Nothing is saved until you press Save."
            onClick={() => onGenerate()}
          >
            Generate Map
          </button>
          <p className="me-text">
            Uses the location, biome and size next to the name, and the Room size and Building size in the top bar (rooms never go below 4 tiles
            across). Nothing is saved until you press Save.
          </p>
          <p className="me-heading">File</p>
          <p className="me-text">{fileId ? `maps/${fileId}.json` : 'Not saved yet'}</p>
          {fileId && mapFileId(map.name) && mapFileId(map.name) !== fileId && (
            <p className="me-text">Renamed to maps/{mapFileId(map.name)}.json on Save.</p>
          )}
          <p className="me-heading">Tile</p>
          <p className="me-text">
            {hoverTile ? `${hoverTile.x}, ${hoverTile.y}: ${getTile(map.tiles[hoverTile.y][hoverTile.x]).label}${isRotated(map, hoverTile) ? ' (rotated)' : ''}` : '-'}
          </p>
          <p className="me-text">Brush: {placing ? (rotated ? 'rotated' : 'not rotated') : 'off (Place Tiles)'}</p>
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
            Place Tiles on, left click or drag: paint the chosen tile (a long wall lays both of its tiles). Right click: rotate the
            tile brush (long walls run the other way, other tiles are mirrored). Marker tools: click to place, click again to
            remove. Escape: put the tool down.
            Right drag or WASD: pan. Wheel: zoom.
          </p>
          {!canSaveMaps && <p className="me-text is-warning">Saving only works from the dev server.</p>}
          {status && <p className="me-status">{status}</p>}
        </div>
      </div>
      {showLoad && <LoadMapDialog maps={maps} currentId={fileId} onLoad={onLoad} onCancel={() => setShowLoad(false)} />}
      {textQuestion && (
        <TextDialog
          title={textQuestion.title}
          message={textQuestion.message}
          initialValue={textQuestion.initialValue}
          placeholder={textQuestion.placeholder}
          saveLabel={textQuestion.saveLabel}
          removeLabel={textQuestion.removeLabel}
          maxLength={textQuestion.maxLength}
          onSave={answerText}
          onCancel={() => answerText(null)}
        />
      )}
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
