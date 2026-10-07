import { lazy, Suspense, useEffect, useState } from 'react'
import { music } from './audio/music.js'
import { installUiSounds, setEffectsVolume } from './audio/uiSounds.js'
import { CharacterProvider } from './character/CharacterContext.jsx'
import { useCharacter } from './character/useCharacter.js'
import { loadLocation, loadSettings, saveLocation, saveSettings } from './character/persistence.js'
import {
  deleteAllSavedCharacters,
  deleteSavedCharacter,
  duplicateSavedCharacter,
  getSavedCharacterData,
  getSavedCharacters,
} from './character/savedCharacters.js'
import creationSteps from './data/adaptation/creationSteps.json'
import combatEncounters from './data/adaptation/combat/encounters.json'
import combat2Encounter from './data/adaptation/combat2/encounter.json'
import ScaledStage from './components/ScaledStage.jsx'
import { normalizeAudioSettings } from './settings/audioSettings.js'
import { normalizeDisplaySettings } from './settings/displaySettings.js'
import MainMenuScreen from './screens/MainMenuScreen.jsx'
import SettingsScreen from './screens/SettingsScreen.jsx'
import ShipBuilderPlaceholder from './screens/ShipBuilderPlaceholder.jsx'

// Everything beyond the menu loads on demand, so opening the app downloads the menu alone and each part (the creator,
// the episode prototypes, the dev map editor) arrives the first time it is opened.
const CharacterCreator = lazy(() => import('./CharacterCreator.jsx'))
const EpisodeSelectScreen = lazy(() => import('./screens/EpisodeSelectScreen.jsx'))
const CombatScreen = lazy(() => import('./screens/CombatScreen.jsx'))
const Combat2Screen = lazy(() => import('./screens/Combat2Screen.jsx'))
const ExplorationScreen = lazy(() => import('./screens/ExplorationScreen.jsx'))
const MapEditorScreen = lazy(() => import('./screens/MapEditorScreen.jsx'))

const { steps } = creationSteps
// The map each prototype opens when Load Episode hasn't picked one. Read from the data files directly so the menu
// doesn't pull in the combat modules that also export them (combat/encounters.js, combat2/combat2State.js).
const COMBAT1_DEFAULT_MAP = combatEncounters.encounters[0].defaultMapId
const COMBAT2_DEFAULT_MAP = combat2Encounter.encounter.defaultMapId

const VIEWS = ['menu', 'shipBuilder', 'settings', 'creator', 'episodeSelect', 'combat', 'combat2', 'exploration', 'mapEditor']

// The menu keeps its 1024x576 reference-image coordinates (same 16:9 shape), as does combat (the tactical mockup's size);
// character creation uses the design resolution.
const MENU_STAGE = { width: 1024, height: 576 }

function Views() {
  const { dispatch } = useCharacter()
  // UI state only: which top-level view is showing. Saved (never exported) so a refresh returns to it.
  const [view, setView] = useState(() => (VIEWS.includes(loadLocation().view) ? loadLocation().view : 'menu'))
  const [displaySettings, setDisplaySettings] = useState(() => normalizeDisplaySettings(loadSettings()?.display))
  const [audioSettings, setAudioSettings] = useState(() => normalizeAudioSettings(loadSettings()?.audio))
  const [savedCharacters, setSavedCharacters] = useState(getSavedCharacters)
  // UI state: Load Episode's prototype ('combat' | 'combat2' | 'exploration') and the episode (map file id) picked there.
  const [episode, setEpisode] = useState(() => ({ mode: 'combat', mapId: null, ...loadLocation().episode }))
  const openMenu = () => setView('menu')
  const handleConfirmed = (characters) => {
    setSavedCharacters(characters)
    openMenu()
  }

  useEffect(() => saveLocation({ ...loadLocation(), view, episode }), [view, episode])
  useEffect(() => saveSettings({ ...loadSettings(), display: displaySettings }), [displaySettings])
  useEffect(() => saveSettings({ ...loadSettings(), audio: audioSettings }), [audioSettings])

  // The music plays across every view except the episode prototypes and the dev map editor, where it fades out and
  // fades back in on leaving. The volume is set before starting so it fades in at the saved level.
  const musicWanted = !['combat', 'combat2', 'exploration', 'mapEditor'].includes(view)
  useEffect(() => music.setVolume(audioSettings.music / 100), [audioSettings.music])
  useEffect(() => {
    if (!musicWanted) return undefined
    music.start()
    return music.stop
  }, [musicWanted])

  useEffect(() => setEffectsVolume(audioSettings.effects / 100), [audioSettings.effects])
  useEffect(() => installUiSounds(), [])

  // Create Character always starts a fresh character; saved characters are kept.
  const openView = (nextView) => {
    if (nextView === 'creator') {
      dispatch({ type: 'resetCharacter' })
      saveLocation({ ...loadLocation(), stepId: steps[0].id, savedCharacterId: null })
    }
    setView(nextView)
  }

  // An imported character becomes the creator's character and opens on Review (Back to Edit reaches every screen).
  // savedCharacterId makes confirming it again update that saved entry rather than add a copy.
  const savedCharacterActions = {
    onLoad: (entry) => {
      const data = getSavedCharacterData(entry)
      if (!data) return
      dispatch({ type: 'loadCharacter', character: data })
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

  // While a view's code is still arriving the stage stays black, as it is between views anyway.
  return (
    <Suspense fallback={null}>
      {view === 'menu' && (
        <ScaledStage {...MENU_STAGE} settings={displaySettings}>
          <MainMenuScreen {...MENU_STAGE} savedCharacters={savedCharacters} onOpen={openView} savedCharacterActions={savedCharacterActions} />
        </ScaledStage>
      )}
      {view === 'shipBuilder' && (
        <ScaledStage {...MENU_STAGE} settings={displaySettings}>
          <ShipBuilderPlaceholder onBack={openMenu} />
        </ScaledStage>
      )}
      {view === 'settings' && (
        <ScaledStage {...MENU_STAGE} settings={displaySettings}>
          <SettingsScreen
            displaySettings={displaySettings}
            onChangeDisplay={setDisplaySettings}
            audioSettings={audioSettings}
            onChangeAudio={setAudioSettings}
            onBack={openMenu}
          />
        </ScaledStage>
      )}
      {view === 'episodeSelect' && (
        <ScaledStage {...MENU_STAGE} settings={displaySettings}>
          <EpisodeSelectScreen
            mode={episode.mode}
            onModeChange={(mode) => setEpisode({ ...episode, mode })}
            onOpen={(mapId) => {
              setEpisode({ ...episode, mapId })
              setView(episode.mode)
            }}
            onBack={openMenu}
          />
        </ScaledStage>
      )}
      {view === 'combat' && (
        <ScaledStage {...MENU_STAGE} settings={displaySettings}>
          <CombatScreen savedCharacters={savedCharacters} mapId={episode.mapId ?? COMBAT1_DEFAULT_MAP} onExit={openMenu} />
        </ScaledStage>
      )}
      {view === 'combat2' && (
        <ScaledStage {...MENU_STAGE} settings={displaySettings}>
          <Combat2Screen
            savedCharacters={savedCharacters}
            mapId={episode.mapId ?? COMBAT2_DEFAULT_MAP}
            onBack={() => setView('episodeSelect')}
            onExit={openMenu}
          />
        </ScaledStage>
      )}
      {view === 'exploration' && (
        <ScaledStage {...MENU_STAGE} settings={displaySettings}>
          <ExplorationScreen savedCharacters={savedCharacters} mapId={episode.mapId ?? COMBAT1_DEFAULT_MAP} onBack={() => setView('episodeSelect')} onExit={openMenu} />
        </ScaledStage>
      )}
      {view === 'mapEditor' && (
        <ScaledStage {...MENU_STAGE} settings={displaySettings}>
          <MapEditorScreen savedCharacters={savedCharacters} onBack={openMenu} />
        </ScaledStage>
      )}
      {view === 'creator' && (
        <ScaledStage settings={displaySettings}>
          <CharacterCreator onExit={openMenu} onConfirmed={handleConfirmed} showGuide={displaySettings.guideHighlight} />
        </ScaledStage>
      )}
    </Suspense>
  )
}

export default function App() {
  return (
    <CharacterProvider>
      <Views />
    </CharacterProvider>
  )
}
