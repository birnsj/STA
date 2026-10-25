import { useEffect, useMemo, useRef, useState } from 'react'
import { isDrawnCard } from '../../maps/episodeCards.js'
import { canDrawEpisodeArt, drawEpisodeArt } from '../../maps/episodeArt.js'
import { resizeMap } from '../../maps/mapEdits.js'
import { canSaveMaps, deleteMap, listMaps, loadMap, saveMap } from '../../maps/mapFiles.js'
import { createNullMap, DEFAULT_BIOME, DEFAULT_MAP_TYPE, mapFileId } from '../../maps/mapFormat.js'
import { biomeFor, DEFAULT_SIZE, generateNamedMap, generatorFor, sizeFor, sizeIdOf, withGeneratedHazards } from '../../maps/mapGenerators.js'
import {
  beginMapHistoryStroke,
  createMapHistory,
  editMapHistory,
  endMapHistoryStroke,
  redoMapHistory,
  replaceMapHistory,
  undoMapHistory,
} from '../../maps/mapHistory.js'
import {
  beginMapDocumentOperation,
  createMapDocumentGuard,
  isMapDocumentOperationCurrent,
  noteMapDocumentChange,
} from '../../maps/mapDocumentGuard.js'
import { randomWeather, settleWeather } from '../../maps/mapWeather.js'

const blankMap = (mapType, biome = DEFAULT_BIOME) => {
  const size = sizeFor(mapType, DEFAULT_SIZE)
  const base = createNullMap(size)
  return { ...base, mapType, biome }
}
// The map editor's document: the map being edited and the file it came from, with New, Load, Save, Save As, Delete,
// Generate Map and the location / biome / size changes that go with them. Nothing here knows about tools or selection:
// every time a different map is put in front of the user (new, load, generate, delete) boardKey changes, and whoever
// holds selection state resets it then.
// askConfirm / askText: the editor's popups (useDialogs). setStatus: the editor's status line.
export default function useMapDocument({ askConfirm, askText, setStatus }) {
  // The map being edited, and fileId: which file it was opened from or saved as (null = never saved).
  const [history, setHistory] = useState(() => createMapHistory(blankMap(DEFAULT_MAP_TYPE)))
  const map = history.present
  const guardRef = useRef(createMapDocumentGuard())
  const [fileId, setFileId] = useState(null)
  const [dirty, setDirty] = useState(false)
  // The files in maps/ ([{ id, name, ... }]).
  const [maps, setMaps] = useState([])
  const [showLoad, setShowLoad] = useState(false)
  const [drawingCard, setDrawingCard] = useState(false)
  // Generate Map's Room size and Building size sliders, in percent of each generator's own sizes. Not saved with the map.
  const [roomScale, setRoomScale] = useState(100)
  const [buildingScale, setBuildingScale] = useState(100)
  // When checked, Generate Map also scatters hazard regions on the new layout (editor option; not saved with the map).
  const [generateHazards, setGenerateHazards] = useState(false)
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
  }, [setStatus])
  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(null), 3000)
    return () => clearTimeout(timer)
  }, [notice])

  const edit = (next) => {
    if (next === map) return
    noteMapDocumentChange(guardRef.current)
    setHistory((current) => editMapHistory(current, next))
    setDirty(true)
  }
  const beginStroke = () => setHistory(beginMapHistoryStroke)
  const endStroke = () => setHistory(endMapHistoryStroke)
  const canUndo = history.undoStack.length > 0
  const canRedo = history.redoStack.length > 0
  const undo = () => {
    if (!canUndo) return
    noteMapDocumentChange(guardRef.current)
    setHistory(undoMapHistory)
    setDirty(true)
  }
  const redo = () => {
    if (!canRedo) return
    noteMapDocumentChange(guardRef.current)
    setHistory(redoMapHistory)
    setDirty(true)
  }
  const confirmDiscard = async (message = 'This map has unsaved changes. Discard them?', confirmLabel = 'Discard') =>
    !dirty || askConfirm({ title: 'Unsaved Changes', message, confirmLabel })
  const replaceMap = (next, nextFileId, message, { unsaved = false } = {}) => {
    noteMapDocumentChange(guardRef.current)
    setHistory(createMapHistory(next))
    setGenerated(false)
    setCleanMap(unsaved ? null : next)
    setFileId(nextFileId)
    setDirty(unsaved)
    setStatus(message)
    setBoardKey((key) => key + 1)
  }

  const onNew = async () => {
    const operation = beginMapDocumentOperation(guardRef.current)
    const source = map
    if (!(await confirmDiscard()) || !isMapDocumentOperationCurrent(guardRef.current, operation)) return
    replaceMap(blankMap(source.mapType, source.biome), null, 'New map.')
  }

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
    const operation = beginMapDocumentOperation(guardRef.current)
    const proceed =
      onlySetupChanged || (await confirmDiscard('The open map has unsaved changes. Generating replaces it, and those changes will be lost.', 'Generate'))
    if (!proceed || !isMapDocumentOperationCurrent(guardRef.current, operation)) return
    let taken = maps
    if (canSaveMaps) {
      try {
        taken = await listMaps()
      } catch (error) {
        setStatus(`Could not list maps: ${error.message}`)
        return
      }
      if (!isMapDocumentOperationCurrent(guardRef.current, operation)) return
    }
    let next = generateNamedMap(source, taken.map((entry) => entry.id), Math.random, { rooms: roomScale / 100, buildings: buildingScale / 100 })
    if (generateHazards) next = withGeneratedHazards(next, Math.random)
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
    const operation = beginMapDocumentOperation(guardRef.current)
    setShowLoad(false)
    if (!(await confirmDiscard()) || !isMapDocumentOperationCurrent(guardRef.current, operation)) return
    loadMap(id)
      .then((loaded) => {
        if (isMapDocumentOperationCurrent(guardRef.current, operation)) replaceMap(loaded, id, `Loaded ${loaded.name}.`)
      })
      .catch((error) => setStatus(`Could not load ${id}: ${error.message}`))
  }
  // The file is named after the map. previousId: the file to rename (the one this map was opened from), or null to
  // write a new file and leave any other alone.
  const saveAs = async (name, previousId, operation, snapshot) => {
    const id = mapFileId(name)
    if (!id) {
      setStatus('Give the map a name first.')
      return
    }
    const sameFile = previousId && previousId.toLowerCase() === id.toLowerCase()
    const taken = maps.some((entry) => entry.id.toLowerCase() === id.toLowerCase())
    if (!sameFile && taken) {
      const overwrite = await askConfirm({ title: 'Map Exists', message: `A map named ${id} already exists. Overwrite it?`, confirmLabel: 'Overwrite' })
      if (!overwrite || !isMapDocumentOperationCurrent(guardRef.current, operation)) return
    }
    try {
      // A card drawn since the last save is written now as the map's thumbnail; the saved card points at it.
      const saved = await saveMap({ ...snapshot, name: name.trim(), id }, previousId)
      const named = { ...snapshot, name: name.trim(), id, card: saved.card }
      const current = isMapDocumentOperationCurrent(guardRef.current, operation)
      setMaps(saved.maps)
      if (!current) {
        // The requested snapshot reached disk, but a later edit or document operation owns the screen now.
        if (operation.operation === guardRef.current.operation) {
          setCleanMap(named)
          setFileId(id)
          setDirty(true)
          setStatus(`Saved maps/${id}.json; newer edits are still unsaved.`)
          setNotice({ id: Date.now(), text: `Saved maps/${id}.json; newer edits remain` })
        }
        return
      }
      setHistory((current) => replaceMapHistory(current, named))
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
  // A never-saved map asks for its name first; after that Save keeps the file in step with the name field.
  const onSave = async () => {
    const operation = beginMapDocumentOperation(guardRef.current)
    const snapshot = map
    if (fileId) return saveAs(snapshot.name, fileId, operation, snapshot)
    const name = await askText({ title: 'Save Map', message: 'Name this map (it is saved as maps/<name>.json):', initialValue: snapshot.name, saveLabel: 'Save', maxLength: 80 })
    if (name !== null && isMapDocumentOperationCurrent(guardRef.current, operation)) saveAs(name, null, operation, snapshot)
  }
  const onSaveAs = async () => {
    const operation = beginMapDocumentOperation(guardRef.current)
    const snapshot = map
    const name = await askText({ title: 'Save Map As', message: 'Save a copy of this map as:', initialValue: snapshot.name, saveLabel: 'Save', maxLength: 80 })
    if (name !== null && isMapDocumentOperationCurrent(guardRef.current, operation)) saveAs(name, null, operation, snapshot)
  }
  // Deletes the file the open map was loaded from or saved as (and its generated thumbnail), then opens a new map.
  const onDelete = async () => {
    const operation = beginMapDocumentOperation(guardRef.current)
    const snapshot = map
    const deletingFileId = fileId
    const thumbnail = isDrawnCard(snapshot.card) ? ' and its generated thumbnail' : ''
    const confirmed = await askConfirm({
      title: 'Delete Map',
      message: `Delete ${snapshot.name || deletingFileId} (maps/${deletingFileId}.json)${thumbnail}? Unsaved changes are lost too. This cannot be undone.`,
      confirmLabel: 'Delete',
    })
    if (!confirmed || !isMapDocumentOperationCurrent(guardRef.current, operation)) return
    try {
      const remaining = await deleteMap(deletingFileId)
      if (!isMapDocumentOperationCurrent(guardRef.current, operation)) return
      setMaps(remaining)
      replaceMap(blankMap(snapshot.mapType, snapshot.biome), null, `Deleted maps/${deletingFileId}.json.`)
    } catch (error) {
      setStatus(`Could not delete: ${error.message}`)
    }
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

  return {
    map,
    edit,
    beginStroke,
    endStroke,
    undo,
    redo,
    canUndo,
    canRedo,
    fileId,
    dirty,
    maps,
    boardKey,
    notice,
    drawingCard,
    showLoad,
    setShowLoad,
    roomScale,
    setRoomScale,
    buildingScale,
    setBuildingScale,
    generateHazards,
    setGenerateHazards,
    confirmDiscard,
    onNew,
    onMapType,
    onBiome,
    onSize,
    onGenerate,
    onShowLoad,
    onLoad,
    onSave,
    onSaveAs,
    onDelete,
    onGenerateCard,
  }
}
