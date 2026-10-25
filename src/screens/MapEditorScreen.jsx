import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { getPlaytestParty, hasAuthoredCharacter } from '../character/authoredCharacters.js'
import { normalizeCharacterRecord } from '../character/runtimeCharacter.js'
import { ENEMY_SPAWNS_NEEDED } from '../combat/encounters.js'
import { MAX_AWAY_TEAM } from '../exploration/awayTeam.js'
import EditorBoard from '../components/maps/EditorBoard.jsx'
import EditorGridOptions from '../components/maps/EditorGridOptions.jsx'
import EditorLayersWindow from '../components/maps/EditorLayersWindow.jsx'
import EditorLevelsWindow from '../components/maps/EditorLevelsWindow.jsx'
import EditorOverviewWindow from '../components/maps/EditorOverviewWindow.jsx'
import EditorMenuBar from '../components/maps/EditorMenuBar.jsx'
import EditorPalette from '../components/maps/EditorPalette.jsx'
import EditorPropertiesPanel from '../components/maps/EditorPropertiesPanel.jsx'
import { hasAssetSelection, hasBoardSelection } from '../components/maps/editorSelection.js'
import EditorToolbar from '../components/maps/EditorToolbar.jsx'
import EditorTips from '../components/maps/EditorTips.jsx'
import useDialogs from '../components/maps/useDialogs.jsx'
import LoadMapDialog from '../components/maps/LoadMapDialog.jsx'
import '../components/maps/mapEditor.css'
import { listConversations } from '../conversation/conversationFiles.js'
import useEditorLayers from '../components/maps/useEditorLayers.js'
import useEditorTools from '../components/maps/useEditorTools.js'
import useMapDocument from '../components/maps/useMapDocument.js'
import { resizeMap, updateNpc } from '../maps/mapEdits.js'
import { canSaveMaps } from '../maps/mapFiles.js'
import { mapPlayErrors, validateMap } from '../maps/mapFormat.js'
import { challengeMapWarnings } from '../world/objectAuthoring.js'
import { canDrawEpisodeArt } from '../maps/episodeArt.js'
import { randomMapName } from '../maps/mapGenerators.js'
import { weatherFor } from '../maps/mapWeather.js'
import WeatherFx from '../effects/WeatherFx.jsx'
import { npcPortraitOptions } from '../character/npcAppearance.js'
import { randomEpisodeName } from '../rules/locationNames.js'

// Dev map editor (Main Menu → Dev Edit). Shell: menu + slim toolbar, Assets | Viewport | Properties, floating windows.

const ExplorationPlaytest = lazy(() => import('./ExplorationScreen.jsx').then((module) => ({ default: module.ExplorationPlaytest })))
const ConversationEditorScreen = lazy(() => import('./ConversationEditorScreen.jsx'))
const ObjectiveEditorScreen = lazy(() => import('./ObjectiveEditorScreen.jsx'))
const ObjectEditorScreen = lazy(() => import('./ObjectEditorScreen.jsx'))
const StoryEditorScreen = lazy(() => import('./StoryEditorScreen.jsx'))
const CharacterLibraryScreen = lazy(() => import('./CharacterLibraryScreen.jsx'))
const GeneratorEditorScreen = lazy(() => import('./GeneratorEditorScreen.jsx'))

function playAwayTeam(savedCharacters) {
  const saved = savedCharacters.map((entry) => normalizeCharacterRecord(entry.record, { id: entry.id }).character).filter(Boolean)
  const taken = new Set(saved.map((character) => character.id))
  const authored = getPlaytestParty(MAX_AWAY_TEAM).filter((character) => character && !taken.has(character.id))
  return [...saved, ...authored].slice(0, MAX_AWAY_TEAM)
}

export default function MapEditorScreen({ savedCharacters = [], onBack }) {
  const shellRef = useRef(null)
  const [status, setStatus] = useState(null)
  const { askConfirm, askText, dialogs, open: dialogShowing } = useDialogs()
  const doc = useMapDocument({ askConfirm, askText, setStatus })
  const { map, edit } = doc
  const editorLayers = useEditorLayers()
  const [ghostBlocks, setGhostBlocks] = useState(false)
  const [animateTiles, setAnimateTiles] = useState(true)
  const [showLighting, setShowLighting] = useState(true)
  const [showSurfaces, setShowSurfaces] = useState(false)
  const [showWeather, setShowWeather] = useState(true)
  const [showGrid, setShowGrid] = useState(false)
  const [gridSize, setGridSize] = useState(64)
  const [showBounds, setShowBounds] = useState(true)
  const [showCentre, setShowCentre] = useState(false)
  const [showGridOptions, setShowGridOptions] = useState(false)
  const [overviewOpen, setOverviewOpen] = useState(false)
  const [layersOpen, setLayersOpen] = useState(false)
  const [levelsOpen, setLevelsOpen] = useState(false)
  const [floatBusyIds, setFloatBusyIds] = useState(() => new Set())

  const floatBusy = (id) => (busy) =>
    setFloatBusyIds((current) => {
      const next = new Set(current)
      if (busy) next.add(id)
      else next.delete(id)
      return next
    })
  const boardBlocked = floatBusyIds.size > 0
  const [playTeam, setPlayTeam] = useState(null)
  const [enemiesActive, setEnemiesActive] = useState(true)
  const [hover, setHover] = useState(null)
  const [conversations, setConversations] = useState([])
  const [conversationEditor, setConversationEditor] = useState(null)
  const [objectiveEditor, setObjectiveEditor] = useState(null)
  const [objectEditor, setObjectEditor] = useState(null)
  const [storyEditor, setStoryEditor] = useState(false)
  const [characterLibrary, setCharacterLibrary] = useState(false)
  const [generatorEditor, setGeneratorEditor] = useState(false)

  // Hover clears the moment a floating window takes the pointer. Compared while rendering, so no stale frame shows.
  const [wasBlocked, setWasBlocked] = useState(boardBlocked)
  if (wasBlocked !== boardBlocked) {
    setWasBlocked(boardBlocked)
    if (boardBlocked) setHover(null)
  }

  const refreshConversations = () =>
    listConversations()
      .then(setConversations)
      .catch((error) => setStatus(`Could not list conversations: ${error.message}`))
  useEffect(() => {
    refreshConversations()
  }, [])

  const dialogOpen =
    dialogShowing ||
    doc.showLoad ||
    Boolean(playTeam) ||
    Boolean(conversationEditor) ||
    Boolean(objectiveEditor) ||
    Boolean(objectEditor) ||
    storyEditor ||
    characterLibrary

  // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redo. Skipped while a dialog or sub-editor is open.
  useEffect(() => {
    if (dialogOpen || boardBlocked) return undefined
    const onKey = (event) => {
      if (event.target.closest?.('input, textarea, select')) return
      const mod = event.ctrlKey || event.metaKey
      if (!mod) return
      if (event.key === 'z' || event.key === 'Z') {
        event.preventDefault()
        if (event.shiftKey) {
          if (doc.canRedo) doc.redo()
        } else if (doc.canUndo) doc.undo()
        return
      }
      if (event.key === 'y' || event.key === 'Y') {
        event.preventDefault()
        if (doc.canRedo) doc.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialogOpen, boardBlocked, doc])

  const tools = useEditorTools({
    map,
    edit,
    setStatus,
    askText,
    boardKey: doc.boardKey,
    suspended: dialogOpen || boardBlocked,
    layers: editorLayers.layers,
    beginStroke: doc.beginStroke,
    endStroke: doc.endStroke,
    onObjectivePlaced: (index) => setObjectiveEditor({ index }),
    itemGridSize: gridSize,
  })
  const { tool, placing, rotated, selection } = tools

  // Properties opens on Selection whenever something is selected or an Assets tool is active, and on Map otherwise; the
  // Map tab can still be picked by hand until the selection or tool changes. Worked out while rendering.
  const selectionNow = [selection.npc, selection.object, selection.marker, selection.destructible, selection.hazard, selection.groundItem, tool]
  const wantsMapTab = !(hasBoardSelection(selection) || hasAssetSelection(tool))
  const [showMapTab, setShowMapTab] = useState(wantsMapTab)
  const [selectionSeen, setSelectionSeen] = useState(selectionNow)
  // Bumped when Generate Card runs so Properties → Map → Episode Card opens on the preview.
  const [revealEpisodeCard, setRevealEpisodeCard] = useState(0)
  if (selectionNow.some((value, index) => !Object.is(value, selectionSeen[index]))) {
    setSelectionSeen(selectionNow)
    setShowMapTab(wantsMapTab)
  }

  const onGenerateCard = () => {
    setShowMapTab(true)
    setRevealEpisodeCard((tick) => tick + 1)
    doc.onGenerateCard()
  }

  const warnings = useMemo(
    () => [...validateMap(map, { enemySpawns: ENEMY_SPAWNS_NEEDED, label: 'Combat', hasAuthoredCharacter }), ...challengeMapWarnings(map)],
    [map],
  )
  const playErrors = useMemo(() => mapPlayErrors(map, { hasAuthoredCharacter }), [map])
  const hoverTile = hover && hover.x < map.width && hover.y < map.height ? hover : null

  const onPlay = () => {
    if (playErrors.length) return setStatus(`Cannot play: ${playErrors[0]}`)
    const team = playAwayTeam(savedCharacters)
    if (!team.length) return setStatus('Play needs the authored redshirt party or a saved character.')
    setPlayTeam(team)
  }

  const onMenuAction = async (id) => {
    switch (id) {
      case 'new':
        return doc.onNew()
      case 'load':
        return doc.onShowLoad()
      case 'save':
        return doc.onSave()
      case 'saveAs':
        return doc.onSaveAs()
      case 'delete':
        return doc.onDelete()
      case 'back':
        return (await doc.confirmDiscard()) && onBack()
      case 'undo':
        return doc.canUndo && doc.undo()
      case 'redo':
        return doc.canRedo && doc.redo()
      case 'placeTiles':
        return tools.onPlacingToggle(!placing)
      case 'move':
        return tools.onMovingToggle(!tools.moving)
      case 'ghost':
        return setGhostBlocks((value) => !value)
      case 'animate':
        return setAnimateTiles((value) => !value)
      case 'lighting':
        return setShowLighting((value) => !value)
      case 'surfaces':
        return setShowSurfaces((value) => !value)
      case 'weatherFx':
        return setShowWeather((value) => !value)
      case 'grid':
        return setShowGrid((value) => !value)
      case 'gridOptions':
        return setShowGridOptions(true)
      case 'overview':
        return setOverviewOpen((value) => !value)
      case 'layers':
        return setLayersOpen((value) => !value)
      case 'levels':
        return setLevelsOpen((value) => !value)
      case 'generateMap':
        return doc.onGenerate()
      case 'generateName':
        return edit({ ...map, name: randomMapName(map) })
      case 'generateEpisode':
        return edit({ ...map, episodeName: randomEpisodeName(map.episodeName, Math.random, map.name) })
      case 'generateCard':
        return onGenerateCard()
      case 'objectives':
        return setObjectiveEditor({ index: 0 })
      case 'objects':
        return setObjectEditor({ id: tools.selectedObjectId ?? null })
      case 'conversations':
        return setConversationEditor({ id: null })
      case 'characters':
        return setCharacterLibrary(true)
      case 'generators':
        return setGeneratorEditor(true)
      case 'story':
        return setStoryEditor(true)
      case 'play':
        return onPlay()
      case 'enemies':
        return setEnemiesActive((value) => !value)
      default:
        return undefined
    }
  }

  if (conversationEditor) {
    return (
      <Suspense fallback={null}>
        <ConversationEditorScreen
          initialId={conversationEditor.id}
          map={map}
          onBack={() => {
            setConversationEditor(null)
            refreshConversations()
          }}
        />
      </Suspense>
    )
  }

  if (objectiveEditor) {
    return (
      <Suspense fallback={null}>
        <ObjectiveEditorScreen
          objectives={map.objectives ?? []}
          onChange={(objectives) => edit({ ...map, objectives })}
          mapName={map.name}
          width={map.width}
          height={map.height}
          initialIndex={objectiveEditor.index}
          objects={tools.objectDefinitions}
          onPick={(index) => {
            setObjectiveEditor(null)
            tools.placeObjectiveFromEditor(index)
            setStatus(`Click a tile to mark ${map.objectives[index].title || map.objectives[index].id} (Escape cancels).`)
          }}
          onBack={() => setObjectiveEditor(null)}
        />
      </Suspense>
    )
  }

  if (objectEditor) {
    return (
      <Suspense fallback={null}>
        <ObjectEditorScreen map={map} onChange={edit} initialId={objectEditor.id} onBack={() => setObjectEditor(null)} />
      </Suspense>
    )
  }

  if (storyEditor) {
    return (
      <Suspense fallback={null}>
        <StoryEditorScreen onBack={() => setStoryEditor(false)} />
      </Suspense>
    )
  }

  if (characterLibrary) {
    return (
      <Suspense fallback={null}>
        <CharacterLibraryScreen
          map={map}
          selectedNpcId={tools.selectedNpcId}
          onBack={() => setCharacterLibrary(false)}
          onUseForPlacement={(characterId) => {
            tools.setPendingCharacterId(characterId)
            tools.setTool('npcs')
            setStatus(`Next Place NPC uses ${characterId}.`)
          }}
          onUpdateNpcCharacter={(npcId, characterId) => {
            const npc = (map.npcs || []).find((entry) => entry.id === npcId)
            const options = npcPortraitOptions(characterId)
            edit(
              updateNpc(map, npcId, {
                characterId,
                gender: options.some((portrait) => portrait.gender === npc?.gender) ? npc.gender : null,
                portraitId: options.some((portrait) => portrait.id === npc?.portraitId) ? npc.portraitId : null,
              }),
            )
          }}
        />
      </Suspense>
    )
  }

  if (generatorEditor) {
    return (
      <Suspense fallback={null}>
        <GeneratorEditorScreen
          map={map}
          mapType={map.mapType}
          onBack={() => setGeneratorEditor(false)}
          onPreview={async () => {
            setGeneratorEditor(false)
            await doc.onGenerate()
          }}
        />
      </Suspense>
    )
  }

  if (playTeam) {
    return (
      <Suspense fallback={null}>
        <ExplorationPlaytest map={map} characters={playTeam} savedCharacters={savedCharacters} enemiesActive={enemiesActive} onExit={() => setPlayTeam(null)} />
      </Suspense>
    )
  }

  const mapProps = {
    fileId: doc.fileId,
    hoverTile,
    placing,
    rotated,
    warnings,
    status,
    showWeather,
    cardTools: { canGenerate: canDrawEpisodeArt, busy: doc.drawingCard, onGenerate: onGenerateCard },
    revealEpisodeCard,
    placingObjective: tools.placingObjective,
    canSave: canSaveMaps,
    onGenerateMap: () => doc.onGenerate(),
    generateHazards: doc.generateHazards,
    onGenerateHazards: doc.setGenerateHazards,
    onOpenObjective: (index) => setObjectiveEditor({ index }),
    onMapType: doc.onMapType,
    onBiome: doc.onBiome,
    onWeather: (weather) => edit({ ...map, weather }),
    onShowWeather: setShowWeather,
    onAmbient: (ambient) => edit({ ...map, ambient }),
    onAmbientColour: (ambientColour) => edit({ ...map, ambientColour }),
    onSize: doc.onSize,
    roomScale: doc.roomScale,
    onRoomScale: doc.setRoomScale,
    buildingScale: doc.buildingScale,
    onBuildingScale: doc.setBuildingScale,
  }

  const inspectors = {
    npcMoving: tools.movingNpc,
    onToggleNpcMove: tools.toggleNpcMove,
    onNpcCleared: tools.clearNpc,
    onEditConversation: (id) => setConversationEditor({ id }),
    objectPlacing: tools.placingObject,
    onToggleObjectPlace: tools.toggleObjectPlace,
    objectEditingCovers: tools.editingObjectCovers,
    onToggleObjectCovers: tools.toggleObjectCovers,
    onOpenObjectEditor: (id) => setObjectEditor({ id: id ?? null }),
    onMarkerCleared: tools.clearMarker,
    destructibleMoving: tools.movingDestructible,
    onToggleDestructibleMove: tools.toggleDestructibleMove,
    destructibleLinking: tools.linkingDestructible,
    onToggleDestructibleLink: tools.toggleDestructibleLink,
    onDuplicateDestructible: tools.duplicateDestructible,
    onDestructibleCleared: tools.clearDestructible,
    groundItemMoving: tools.movingGroundItem,
    onToggleGroundItemMove: tools.toggleGroundItemMove,
    onDuplicateGroundItem: tools.duplicateGroundItem,
    onGroundItemCleared: tools.clearGroundItem,
    onHazardCleared: tools.clearHazard,
    editingPatrol: tools.editingPatrol,
    movingWaypoint: tools.movingWaypoint,
    selectedWaypointIndex: tools.selectedWaypointIndex,
    onTogglePatrolEdit: tools.togglePatrolEdit,
    onToggleMoveWaypoint: tools.toggleMoveWaypoint,
    onSelectWaypoint: tools.selectWaypoint,
    onWaypointCleared: tools.clearWaypoint,
  }

  return (
    <div ref={shellRef} className="me-screen ed-shell">
      <EditorTips rootRef={shellRef} />
      <EditorMenuBar
        onAction={onMenuAction}
        checks={{
          placeTiles: placing,
          move: tools.moving,
          ghost: ghostBlocks,
          animate: animateTiles,
          lighting: showLighting,
          surfaces: showSurfaces,
          weatherFx: showWeather,
          grid: showGrid,
          layers: layersOpen,
          levels: levelsOpen,
          overview: overviewOpen,
          enemies: enemiesActive,
        }}
      />
      <EditorToolbar
        map={map}
        dirty={doc.dirty}
        onRename={(name) => edit({ ...map, name })}
        onResize={(width, height) => edit(resizeMap(map, width, height))}
        enemiesActive={enemiesActive}
        onEnemiesActive={setEnemiesActive}
        onPlay={onPlay}
        placing={placing}
        onPlacing={tools.onPlacingToggle}
        moving={tools.moving}
        onMoving={tools.onMovingToggle}
        showGrid={showGrid}
        onShowGrid={setShowGrid}
        gridSize={gridSize}
        onGridSize={setGridSize}
        onGridOptions={() => setShowGridOptions(true)}
        animateTiles={animateTiles}
        onAnimateTiles={setAnimateTiles}
        onGenerateMap={doc.onGenerate}
        onGenerateName={() => edit({ ...map, name: randomMapName(map) })}
        onGenerateEpisode={() => edit({ ...map, episodeName: randomEpisodeName(map.episodeName, Math.random, map.name) })}
        onGenerateCard={onGenerateCard}
        onGeneratorEditor={() => setGeneratorEditor(true)}
        overviewOpen={overviewOpen}
        onOverview={() => setOverviewOpen((value) => !value)}
        layersOpen={layersOpen}
        onLayers={() => setLayersOpen((value) => !value)}
        levelsOpen={levelsOpen}
        onLevels={() => setLevelsOpen((value) => !value)}
      />
      <div className="ed-workspace">
        <EditorPalette
          tool={tool}
          onTool={tools.selectTool}
          onOpenCharacterLibrary={() => setCharacterLibrary(true)}
          animateTiles={animateTiles}
          activeLayer={editorLayers.layers.active}
        />
        <div className={`ed-viewport me-board-area${boardBlocked ? ' is-float-busy' : ''}`}>
          <div className="ed-viewport-title">{map.name || 'Untitled map'}</div>
          <EditorBoard
            key={doc.boardKey}
            map={map}
            ghostBlocks={ghostBlocks}
            lighting={showLighting}
            animate={animateTiles}
            showGrid={showGrid}
            gridSize={gridSize}
            showBounds={showBounds}
            showCentre={showCentre}
            showSurfaces={showSurfaces}
            layerVisibility={editorLayers.layers.visible}
            brush={placing && tool?.startsWith('tile:') ? tool.slice('tile:'.length) : null}
            rotated={rotated}
            erasing={tool === 'erase'}
            selectedNpcId={tools.selectedNpcId}
            selectedWaypointIndex={tools.selectedWaypointIndex}
            selectedMarker={tools.selectedMarker}
            selectedObjectId={tools.selectedObjectId}
            selectedDestructibleId={tools.selectedDestructibleId}
            selectedHazardId={tools.selectedHazardId}
            selectedGroundItemId={tools.selectedGroundItemId}
            inventoryTool={tool?.startsWith('inventory:') ? tool.slice('inventory:'.length) : null}
            moveFrom={tools.moveFrom}
            onPaint={boardBlocked ? undefined : tools.onPaint}
            onPaintEnd={boardBlocked ? undefined : tools.onPaintEnd}
            onHover={boardBlocked ? undefined : setHover}
            onRightClick={boardBlocked ? undefined : tools.onRightClick}
          />
          {showWeather && <WeatherFx fx={weatherFor(map.weather).fx} follow=".me-board" />}
          <EditorGridOptions
            show={showGridOptions}
            onClose={() => setShowGridOptions(false)}
            showGrid={showGrid}
            onShowGrid={setShowGrid}
            gridSize={gridSize}
            onGridSize={setGridSize}
            showBounds={showBounds}
            onShowBounds={setShowBounds}
            showCentre={showCentre}
            onShowCentre={setShowCentre}
          />
          {hoverTile && !boardBlocked && (
            <div className="ed-coord-hud" aria-live="polite">
              Tile ({hoverTile.x}, {hoverTile.y})
            </div>
          )}
          {doc.notice && (
            <div key={doc.notice.id} className={`me-notice${doc.notice.failed ? ' is-failed' : ''}`} role="status">
              {doc.notice.text}
            </div>
          )}
        </div>
        <EditorPropertiesPanel
          map={map}
          edit={edit}
          tool={tool}
          conversations={conversations}
          selection={selection}
          showMapTab={showMapTab}
          onShowMapTab={setShowMapTab}
          mapProps={mapProps}
          inspectors={inspectors}
          onStatus={setStatus}
          hazardIntensity={tools.hazardIntensity}
          onHazardIntensity={tools.setHazardIntensity}
          animateTiles={animateTiles}
          layers={editorLayers.layers}
        />
      </div>
      <EditorOverviewWindow
        open={overviewOpen}
        onClose={() => setOverviewOpen(false)}
        onBusyChange={floatBusy('overview')}
        map={map}
        ghostBlocks={ghostBlocks}
        onGhostBlocks={setGhostBlocks}
        animateTiles={animateTiles}
        onAnimateTiles={setAnimateTiles}
        showLighting={showLighting}
        onShowLighting={setShowLighting}
        showSurfaces={showSurfaces}
        onShowSurfaces={setShowSurfaces}
      />
      <EditorLayersWindow
        open={layersOpen}
        onClose={() => setLayersOpen(false)}
        onBusyChange={floatBusy('layers')}
        layers={editorLayers.layers}
        setActive={editorLayers.setActive}
        toggleVisible={(id) => {
          if (editorLayers.layers.visible[id] !== false) tools.clearLayerSelection(id)
          editorLayers.toggleVisible(id)
        }}
        toggleLocked={(id) => {
          if (!editorLayers.layers.locked[id]) tools.clearLayerSelection(id)
          editorLayers.toggleLocked(id)
        }}
      />
      <EditorLevelsWindow open={levelsOpen} onClose={() => setLevelsOpen(false)} onBusyChange={floatBusy('levels')} />
      {doc.showLoad && <LoadMapDialog maps={doc.maps} currentId={doc.fileId} onLoad={doc.onLoad} onCancel={() => doc.setShowLoad(false)} />}
      {dialogs}
    </div>
  )
}
