import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { getPlaytestParty } from '../character/authoredCharacters.js'
import { normalizeCharacterRecord } from '../character/runtimeCharacter.js'
import { ENEMY_SPAWNS_NEEDED } from '../combat/encounters.js'
import { MAX_AWAY_TEAM } from '../exploration/awayTeam.js'
import EditorBoard from '../components/maps/EditorBoard.jsx'
import EditorMinimap from '../components/maps/EditorMinimap.jsx'
import EditorPalette from '../components/maps/EditorPalette.jsx'
import EditorToolbar from '../components/maps/EditorToolbar.jsx'
import EditorInspectors from '../components/maps/EditorInspectors.jsx'
import EditorSidePanel from '../components/maps/EditorSidePanel.jsx'
import useDialogs from '../components/maps/useDialogs.jsx'
import LoadMapDialog from '../components/maps/LoadMapDialog.jsx'
import '../components/maps/mapEditor.css'
import { listConversations } from '../conversation/conversationFiles.js'
import useEditorTools from '../components/maps/useEditorTools.js'
import useMapDocument from '../components/maps/useMapDocument.js'
import { canSaveMaps } from '../maps/mapFiles.js'
import { resizeMap, validateMap } from '../maps/mapFormat.js'
import { canDrawEpisodeArt } from '../maps/episodeArt.js'
import { weatherFor } from '../maps/mapWeather.js'
import WeatherFx from '../effects/WeatherFx.jsx'

// Dev map editor (opened from the Main Menu's Dev Edit). Edits combat-independent map files in the project's maps/ folder,
// which both combat types play.

const ExplorationPlaytest = lazy(() => import('./ExplorationScreen.jsx').then((module) => ({ default: module.ExplorationPlaytest })))
const ConversationEditorScreen = lazy(() => import('./ConversationEditorScreen.jsx'))
const ObjectiveEditorScreen = lazy(() => import('./ObjectiveEditorScreen.jsx'))
const ObjectEditorScreen = lazy(() => import('./ObjectEditorScreen.jsx'))
const StoryEditorScreen = lazy(() => import('./StoryEditorScreen.jsx'))

// Play's away team: saved characters first (the imported party), then redshirt ensigns, up to MAX_AWAY_TEAM.
// Placement fills free tiles beside player starts when the map has fewer.
function playAwayTeam(savedCharacters) {
  const saved = savedCharacters.map((entry) => normalizeCharacterRecord(entry.record, { id: entry.id }).character).filter(Boolean)
  const taken = new Set(saved.map((character) => character.id))
  const authored = getPlaytestParty(MAX_AWAY_TEAM).filter((character) => character && !taken.has(character.id))
  return [...saved, ...authored].slice(0, MAX_AWAY_TEAM)
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

export default function MapEditorScreen({ savedCharacters = [], onBack }) {
  const [status, setStatus] = useState(null)
  const { askConfirm, askText, dialogs, open: dialogShowing } = useDialogs()
  const doc = useMapDocument({ askConfirm, askText, setStatus })
  const { map, edit } = doc
  // UI state only.
  const [ghostBlocks, setGhostBlocks] = useState(false)
  // The board's animated tiles and the palette's tile previews play (off: each holds its first frame).
  const [animateTiles, setAnimateTiles] = useState(true)
  // Shadows, light pools and darkness are view only here; the map's ambient light is still saved.
  const [showLighting, setShowLighting] = useState(true)
  const [showWeather, setShowWeather] = useState(true)
  // Play: the away team exploring the open map (null = editing), and whether its enemies notice them.
  const [playTeam, setPlayTeam] = useState(null)
  const [enemiesActive, setEnemiesActive] = useState(true)
  const [hover, setHover] = useState(null)
  // The conversation files NPCs can open ([{ id, name }]), and the conversation editor while open ({ id } | null).
  const [conversations, setConversations] = useState([])
  const [conversationEditor, setConversationEditor] = useState(null)
  // The objective editor while open ({ index }: the objective selected) | null.
  const [objectiveEditor, setObjectiveEditor] = useState(null)
  // The challenge object editor ({ id }: the object selected) and the Story Wording editor while open.
  const [objectEditor, setObjectEditor] = useState(null)
  const [storyEditor, setStoryEditor] = useState(false)

  const refreshConversations = () =>
    listConversations()
      .then(setConversations)
      .catch((error) => setStatus(`Could not list conversations: ${error.message}`))
  useEffect(() => {
    refreshConversations()
  }, [])

  const dialogOpen = dialogShowing || doc.showLoad || Boolean(playTeam) || Boolean(conversationEditor) || Boolean(objectiveEditor) || Boolean(objectEditor) || storyEditor
  const tools = useEditorTools({
    map,
    edit,
    setStatus,
    askText,
    boardKey: doc.boardKey,
    suspended: dialogOpen,
    onObjectivePlaced: (index) => setObjectiveEditor({ index }),
  })
  const { tool, placing, rotated, selection } = tools

  const warnings = useMemo(() => validateMap(map, { enemySpawns: ENEMY_SPAWNS_NEEDED, label: 'Combat' }), [map])
  const hoverTile = hover && hover.x < map.width && hover.y < map.height ? hover : null

  const onPlay = () => {
    if (!map.markers.playerStarts.length) return setStatus('Play needs at least one player start on the map.')
    const team = playAwayTeam(savedCharacters)
    if (!team.length) return setStatus('Play needs the authored redshirt party or a saved character.')
    setPlayTeam(team)
  }

  // Like Play, the conversation editor replaces the map editor's screen while the map and its unsaved edits wait.
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
        <ObjectEditorScreen
          map={map}
          onChange={edit}
          initialId={objectEditor.id}
          onBack={() => setObjectEditor(null)}
        />
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

  // The editor stays mounted underneath, so Exit comes back to the same map, unsaved edits and all.
  if (playTeam) {
    return (
      <Suspense fallback={null}>
        <ExplorationPlaytest map={map} characters={playTeam} savedCharacters={savedCharacters} enemiesActive={enemiesActive} onExit={() => setPlayTeam(null)} />
      </Suspense>
    )
  }

  return (
    <div className="me-screen">
      <EditorToolbar
        map={map}
        canSave={canSaveMaps}
        dirty={doc.dirty}
        onRename={(name) => edit({ ...map, name })}
        onMapType={doc.onMapType}
        onBiome={doc.onBiome}
        onWeather={(weather) => edit({ ...map, weather })}
        showWeather={showWeather}
        onShowWeather={setShowWeather}
        onAmbient={(ambient) => edit({ ...map, ambient })}
        onSize={doc.onSize}
        onResize={(width, height) => edit(resizeMap(map, width, height))}
        onNew={doc.onNew}
        onLoad={doc.onShowLoad}
        onSave={doc.onSave}
        onSaveAs={doc.onSaveAs}
        canDelete={canSaveMaps && Boolean(doc.fileId)}
        onDelete={doc.onDelete}
        enemiesActive={enemiesActive}
        onEnemiesActive={setEnemiesActive}
        onPlay={onPlay}
        onBack={async () => (await doc.confirmDiscard()) && onBack()}
        placing={placing}
        onPlacing={tools.onPlacingToggle}
        moving={tools.moving}
        onMoving={tools.onMovingToggle}
      >
        <ScaleSlider label="Room size" title="How big Generate Map makes rooms (starship decks, stations, derelicts, labs, alien vessels, cantinas, detention blocks, temples)." min="70" value={doc.roomScale} onChange={doc.setRoomScale} />
        <ScaleSlider
          label="Building size"
          title="How big Generate Map makes buildings and city blocks (colonies, outposts, cities, farms, mining sites, landing fields)."
          min="100"
          value={doc.buildingScale}
          onChange={doc.setBuildingScale}
        />
      </EditorToolbar>
      <div className="me-body">
        <EditorPalette
          tool={tool}
          onTool={tools.setTool}
          ghostBlocks={ghostBlocks}
          onGhostBlocks={setGhostBlocks}
          animateTiles={animateTiles}
          onAnimateTiles={setAnimateTiles}
          showLighting={showLighting}
          onShowLighting={setShowLighting}
          onStatus={setStatus}
          hazardIntensity={tools.hazardIntensity}
          onHazardIntensity={tools.setHazardIntensity}
        />
        <div className="me-board-area">
          <EditorBoard
            key={doc.boardKey}
            map={map}
            ghostBlocks={ghostBlocks}
            lighting={showLighting}
            animate={animateTiles}
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
            onPaint={tools.onPaint}
            onPaintEnd={tools.onPaintEnd}
            onHover={setHover}
            onRightClick={tools.onRightClick}
          />
          {showWeather && <WeatherFx fx={weatherFor(map.weather).fx} follow=".me-board" />}
          <EditorMinimap map={map} />
          {doc.notice && (
            <div key={doc.notice.id} className={`me-notice${doc.notice.failed ? ' is-failed' : ''}`} role="status">
              {doc.notice.text}
            </div>
          )}
        </div>
        <EditorSidePanel
          map={map}
          edit={edit}
          fileId={doc.fileId}
          hoverTile={hoverTile}
          placing={placing}
          rotated={rotated}
          warnings={warnings}
          status={status}
          showWeather={showWeather}
          cardTools={{ canGenerate: canDrawEpisodeArt, busy: doc.drawingCard, onGenerate: doc.onGenerateCard }}
          placingObjective={tools.placingObjective}
          canSave={canSaveMaps}
          onGenerateMap={() => doc.onGenerate()}
          generateHazards={doc.generateHazards}
          onGenerateHazards={doc.setGenerateHazards}
          onOpenObjective={(index) => setObjectiveEditor({ index })}
          onOpenConversations={() => setConversationEditor({ id: null })}
          onOpenObjects={() => setObjectEditor({ id: tools.selectedObjectId ?? null })}
          onOpenStory={() => setStoryEditor(true)}
        >
          <EditorInspectors
            map={map}
            edit={edit}
            tool={tool}
            conversations={conversations}
            selection={selection}
            npcMoving={tools.movingNpc}
            onToggleNpcMove={tools.toggleNpcMove}
            onNpcCleared={tools.clearNpc}
            onEditConversation={(id) => setConversationEditor({ id })}
            objectPlacing={tools.placingObject}
            onToggleObjectPlace={tools.toggleObjectPlace}
            onMarkerCleared={tools.clearMarker}
            destructibleMoving={tools.movingDestructible}
            onToggleDestructibleMove={tools.toggleDestructibleMove}
            destructibleLinking={tools.linkingDestructible}
            onToggleDestructibleLink={tools.toggleDestructibleLink}
            onDuplicateDestructible={tools.duplicateDestructible}
            onDestructibleCleared={tools.clearDestructible}
            groundItemMoving={tools.movingGroundItem}
            onToggleGroundItemMove={tools.toggleGroundItemMove}
            onDuplicateGroundItem={tools.duplicateGroundItem}
            onGroundItemCleared={tools.clearGroundItem}
            onHazardCleared={tools.clearHazard}
            editingPatrol={tools.editingPatrol}
            movingWaypoint={tools.movingWaypoint}
            selectedWaypointIndex={tools.selectedWaypointIndex}
            onTogglePatrolEdit={tools.togglePatrolEdit}
            onToggleMoveWaypoint={tools.toggleMoveWaypoint}
            onSelectWaypoint={tools.selectWaypoint}
            onWaypointCleared={tools.clearWaypoint}
          />
        </EditorSidePanel>
      </div>
      {doc.showLoad && <LoadMapDialog maps={doc.maps} currentId={doc.fileId} onLoad={doc.onLoad} onCancel={() => doc.setShowLoad(false)} />}
      {dialogs}
    </div>
  )
}
