import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { setMusicVolume, setViewCue } from './audio/music.js'
import { installUiSounds, setEffectsVolume } from './audio/uiSounds.js'
import { CharacterProvider } from './character/CharacterContext.jsx'
import { tryCreateRestoredState } from './character/characterReducer.js'
import { useCharacter } from './character/useCharacter.js'
import { loadLocation, loadSettings, saveLocation, saveSettings } from './character/persistence.js'
import { deleteSavedShip, loadSavedShips } from './ships/savedShips.js'
import {
  deleteAllSavedCharacters,
  deleteSavedCharacter,
  duplicateSavedCharacter,
  getSavedCharacterData,
  getSavedCharacters,
} from './character/savedCharacters.js'
import creationSteps from './data/adaptation/creationSteps.json'
import ScaledStage from './components/ScaledStage.jsx'
import { normalizeAudioSettings } from './settings/audioSettings.js'
import { normalizeDisplaySettings } from './settings/displaySettings.js'
import { DisplaySettingsContext, OpenSettingsProvider, UpdateDisplaySettingsProvider } from './settings/DisplaySettingsContext.js'
import MainMenuScreen from './screens/MainMenuScreen.jsx'
import SettingsScreen from './screens/SettingsScreen.jsx'

// Everything beyond the menu loads on demand, so opening the app downloads the menu alone and each part (the creator,
// the episode prototypes, the dev map editor) arrives the first time it is opened.
const ShipCreator = lazy(() => import('./ships/ShipCreator.jsx'))
const CharacterCreator = lazy(() => import('./CharacterCreator.jsx'))
const EpisodeSelectScreen = lazy(() => import('./screens/EpisodeSelectScreen.jsx'))
const CombatScreen = lazy(() => import('./screens/CombatScreen.jsx'))
const ExplorationScreen = lazy(() => import('./screens/ExplorationScreen.jsx'))
const MapEditorScreen = lazy(() => import('./screens/MapEditorScreen.jsx'))

const { steps } = creationSteps

const VIEWS = ['menu', 'shipBuilder', 'settings', 'creator', 'episodeSelect', 'combat', 'exploration', 'mapEditor']
// The prototypes Load Episode can open (a saved choice of one since removed falls back to the first).
const EPISODE_MODES = ['combat', 'exploration']

// A refresh returns to the saved view, except an episode with no map picked, which has nothing to open.
function initialView({ view, episode }) {
  if (!VIEWS.includes(view)) return 'menu'
  return EPISODE_MODES.includes(view) && !episode?.mapId ? 'episodeSelect' : view
}

// The music cue each view plays (see src/audio/music.js). Load Episode and Settings keep the main-menu cue, so that
// track plays straight through. A fight inside the exploration view plays the combat cue over it (Battle in
// CombatScreen.jsx) and the exploration cue returns when the fight is over.
const VIEW_CUES = { menu: 'menu', episodeSelect: 'menu', settings: 'menu', creator: 'creation', exploration: 'exploration', combat: 'combat' }

// The menu keeps its 1024x576 reference-image coordinates (same 16:9 shape), as does combat (the tactical mockup's size);
// character creation uses the design resolution.
const MENU_STAGE = { width: 1024, height: 576 }

function Views() {
  const { dispatch } = useCharacter()
  // UI state only: which top-level view is showing. Saved (never exported) so a refresh returns to it.
  const [view, setView] = useState(() => initialView(loadLocation()))
  const [displaySettings, setDisplaySettings] = useState(() => normalizeDisplaySettings(loadSettings()?.display))
  const [audioSettings, setAudioSettings] = useState(() => normalizeAudioSettings(loadSettings()?.audio))
  const [savedCharacters, setSavedCharacters] = useState(getSavedCharacters)
  const [savedShips, setSavedShips] = useState(loadSavedShips)
  // How Build Ship or Import Ship opened the creator. Null on a refresh, which keeps the in-progress draft.
  const [shipLaunch, setShipLaunch] = useState(null)
  // UI state: Load Episode's prototype ('combat' | 'exploration') and the episode (map file id) picked there.
  const [episode, setEpisode] = useState(() => {
    const saved = { mode: 'combat', mapId: null, ...loadLocation().episode }
    return EPISODE_MODES.includes(saved.mode) ? saved : { ...saved, mode: EPISODE_MODES[0] }
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openMenu = () => setView('menu')
  const handleConfirmed = (characters) => {
    setSavedCharacters(characters)
    openMenu()
  }

  useEffect(() => saveLocation({ ...loadLocation(), view, episode }), [view, episode])
  // The settings overlay closes whenever the view changes. Compared during render rather than in an effect, so the
  // overlay never shows for a frame over the new view.
  const [viewWithSettings, setViewWithSettings] = useState(view)
  if (viewWithSettings !== view) {
    setViewWithSettings(view)
    setSettingsOpen(false)
  }
  const updateDisplaySettings = useCallback((patch) => {
    setDisplaySettings((current) => ({ ...current, ...patch }))
  }, [])
  useEffect(() => saveSettings({ ...loadSettings(), display: displaySettings }), [displaySettings])
  useEffect(() => saveSettings({ ...loadSettings(), audio: audioSettings }), [audioSettings])

  // Each view's cue fades in on entering and out on leaving; views with no cue yet stay quiet. The volume is set
  // before starting so the fade-in is at the saved level.
  useEffect(() => setMusicVolume(audioSettings.music / 100), [audioSettings.music])
  useEffect(() => setViewCue(VIEW_CUES[view] ?? null), [view])

  useEffect(() => setEffectsVolume(audioSettings.effects / 100), [audioSettings.effects])
  useEffect(() => installUiSounds(), [])

  // Create Character always starts a fresh character; saved characters are kept.
  const openView = (nextView) => {
    if (nextView === 'creator') {
      dispatch({ type: 'resetCharacter' })
      saveLocation({ ...loadLocation(), stepId: steps[0].id, savedCharacterId: null })
    }
    if (nextView === 'shipBuilder') setShipLaunch({ mode: 'new', token: Date.now() })
    setView(nextView)
  }

  const savedShipActions = {
    onLoad: (entry) => {
      setShipLaunch({ mode: 'saved', id: entry.id, record: entry.record, token: Date.now() })
      setView('shipBuilder')
    },
    onDelete: (id) => {
      setSavedShips(deleteSavedShip(id))
      if (loadLocation().savedShipId === id) saveLocation({ ...loadLocation(), savedShipId: null })
    },
  }

  // An imported character becomes the creator's character and opens on Review (Back to Edit reaches every screen).
  // savedCharacterId makes confirming it again update that saved entry rather than add a copy.
  const savedCharacterActions = {
    onLoad: (entry) => {
      const data = getSavedCharacterData(entry)
      if (!data) return
      const { restoredState } = tryCreateRestoredState(data, { preserveEquipment: entry.record?.sourceType === 'authored' })
      if (!restoredState) return
      dispatch({ type: 'loadCharacter', restoredState })
      saveLocation({ ...loadLocation(), stepId: 'review', savedCharacterId: entry.id })
      setView('creator')
    },
    onDelete: (entry) => {
      setSavedCharacters(deleteSavedCharacter(entry.id))
      if (loadLocation().savedCharacterId === entry.id) saveLocation({ ...loadLocation(), savedCharacterId: null })
    },
    onDuplicate: (entry) => setSavedCharacters(duplicateSavedCharacter(entry.id)),
    onDeleteAll: () => {
      setSavedCharacters(deleteAllSavedCharacters())
      saveLocation({ ...loadLocation(), savedCharacterId: null })
    },
  }

  const settingsLayer = settingsOpen ? (
    <div className="settings-overlay">
      <SettingsScreen
        displaySettings={displaySettings}
        onChangeDisplay={setDisplaySettings}
        audioSettings={audioSettings}
        onChangeAudio={setAudioSettings}
        onSave={() => saveSettings({ ...loadSettings(), display: displaySettings, audio: audioSettings })}
        onBack={() => setSettingsOpen(false)}
      />
    </div>
  ) : null

  // While a view's code is still arriving the stage stays black, as it is between views anyway.
  return (
    <DisplaySettingsContext.Provider value={displaySettings}>
    <UpdateDisplaySettingsProvider value={updateDisplaySettings}>
    <OpenSettingsProvider value={{ open: settingsOpen, openSettings: () => setSettingsOpen(true) }}>
    <Suspense fallback={null}>
      {view === 'menu' && (
        <ScaledStage {...MENU_STAGE} settings={displaySettings}>
          <MainMenuScreen {...MENU_STAGE} savedCharacters={savedCharacters} savedShips={savedShips} onOpen={openView} savedCharacterActions={savedCharacterActions} savedShipActions={savedShipActions} />
        </ScaledStage>
      )}
      {view === 'shipBuilder' && (
        <ScaledStage settings={displaySettings}>
          <ShipCreator
            key={shipLaunch?.token ?? 'current'}
            launch={shipLaunch}
            onExit={openMenu}
            onStartGame={() => setView('episodeSelect')}
            onShipsSaved={setSavedShips}
            showGuide={displaySettings.guideHighlight}
          />
        </ScaledStage>
      )}
      {view === 'settings' && (
        <ScaledStage {...MENU_STAGE} settings={displaySettings}>
          <SettingsScreen
            displaySettings={displaySettings}
            onChangeDisplay={setDisplaySettings}
            audioSettings={audioSettings}
            onChangeAudio={setAudioSettings}
            onSave={() => saveSettings({ ...loadSettings(), display: displaySettings, audio: audioSettings })}
            onBack={openMenu}
          />
        </ScaledStage>
      )}
      {view === 'episodeSelect' && (
        <ScaledStage {...MENU_STAGE} settings={displaySettings}>
          <EpisodeSelectScreen
            mode={episode.mode}
            mapId={episode.mapId}
            onModeChange={(mode) => setEpisode({ ...episode, mode })}
            onBegin={(mapId) => {
              setEpisode({ ...episode, mapId })
              setView(episode.mode)
            }}
            onBack={openMenu}
          />
        </ScaledStage>
      )}
      {view === 'combat' && (
        <ScaledStage {...MENU_STAGE} settings={displaySettings}>
          <CombatScreen savedCharacters={savedCharacters} mapId={episode.mapId} onExit={openMenu} />
          {settingsLayer}
        </ScaledStage>
      )}
      {view === 'exploration' && (
        <ScaledStage {...MENU_STAGE} settings={displaySettings}>
          <ExplorationScreen savedCharacters={savedCharacters} mapId={episode.mapId} onBack={() => setView('episodeSelect')} onExit={openMenu} />
          {settingsLayer}
        </ScaledStage>
      )}
      {view === 'mapEditor' && (
        <ScaledStage {...MENU_STAGE} settings={displaySettings} titleTips={false}>
          <MapEditorScreen savedCharacters={savedCharacters} onBack={openMenu} />
          {settingsLayer}
        </ScaledStage>
      )}
      {view === 'creator' && (
        <ScaledStage settings={displaySettings}>
          <CharacterCreator onExit={openMenu} onConfirmed={handleConfirmed} showGuide={displaySettings.guideHighlight} />
        </ScaledStage>
      )}
    </Suspense>
    </OpenSettingsProvider>
    </UpdateDisplaySettingsProvider>
    </DisplaySettingsContext.Provider>
  )
}

export default function App() {
  return (
    <CharacterProvider>
      <Views />
    </CharacterProvider>
  )
}
