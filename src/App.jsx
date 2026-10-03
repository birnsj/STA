import { useEffect, useState } from 'react'
import { music } from './audio/music.js'
import { installUiSounds, setEffectsVolume } from './audio/uiSounds.js'
import { CharacterProvider, useCharacter } from './character/CharacterContext.jsx'
import { loadLocation, loadSettings, saveLocation, saveSettings } from './character/persistence.js'
import {
  deleteAllSavedCharacters,
  deleteSavedCharacter,
  duplicateSavedCharacter,
  getSavedCharacterData,
  getSavedCharacters,
  saveConfirmedCharacter,
} from './character/savedCharacters.js'
import creationSteps from './data/adaptation/creationSteps.json'
import CharacterStepSummaryModal from './components/CharacterStepSummaryModal.jsx'
import CharacterSummary from './components/CharacterSummary.jsx'
import Header from './components/Header.jsx'
import QuitConfirm from './components/QuitConfirm.jsx'
import ScaledStage from './components/ScaledStage.jsx'
import StepNav from './components/StepNav.jsx'
import { useStepSummaryPopup } from './components/useStepSummaryPopup.js'
import { isCharacterValid } from './rules/characterValidation.js'
import { getCompletedStepIds, hasUnsavedProgress, isStepComplete } from './rules/creationProgress.js'
import { hasAutoChoice } from './character/autoChoice.js'
import { buildStepSummary } from './rules/stepSummary.js'
import { normalizeAudioSettings } from './settings/audioSettings.js'
import { normalizeDisplaySettings } from './settings/displaySettings.js'
import CareerHistoryScreen from './screens/CareerHistoryScreen.jsx'
import CareerScreen from './screens/CareerScreen.jsx'
import EarlyOutlookScreen from './screens/EarlyOutlookScreen.jsx'
import EducationScreen from './screens/EducationScreen.jsx'
import EnvironmentScreen from './screens/EnvironmentScreen.jsx'
import FinishingTouchesScreen from './screens/FinishingTouchesScreen.jsx'
import MainMenuScreen from './screens/MainMenuScreen.jsx'
import PlaceholderScreen from './screens/PlaceholderScreen.jsx'
import ReviewScreen from './screens/ReviewScreen.jsx'
import SettingsScreen from './screens/SettingsScreen.jsx'
import ShipBuilderPlaceholder from './screens/ShipBuilderPlaceholder.jsx'
import SpeciesScreen from './screens/SpeciesScreen.jsx'

const { steps } = creationSteps
const SCREENS = {
  species: SpeciesScreen,
  environment: EnvironmentScreen,
  earlyOutlook: EarlyOutlookScreen,
  education: EducationScreen,
  career: CareerScreen,
  careerHistory: CareerHistoryScreen,
  finishingTouches: FinishingTouchesScreen,
  review: ReviewScreen,
}
const VIEWS = ['menu', 'shipBuilder', 'settings', 'creator']

const isKnownStep = (stepId) => steps.some((step) => step.id === stepId)

function CharacterCreator({ onExit, onConfirmed }) {
  const { character, dispatch } = useCharacter()
  const [currentStepId, setCurrentStepId] = useState(() => {
    const { stepId } = loadLocation()
    return isKnownStep(stepId) ? stepId : steps[0].id
  })

  useEffect(() => saveLocation({ ...loadLocation(), stepId: currentStepId }), [currentStepId])

  const index = steps.findIndex((step) => step.id === currentStepId)
  const step = steps[index]
  const previousStep = steps[index - 1]
  const nextStep = steps[index + 1]
  const Screen = SCREENS[step.id] ?? PlaceholderScreen
  const summaryPopup = useStepSummaryPopup(step.id, character)
  // UI state: whether the Quit confirmation is showing.
  const [quitConfirmOpen, setQuitConfirmOpen] = useState(false)
  const requestQuit = () => (hasUnsavedProgress(character) ? setQuitConfirmOpen(true) : onExit())
  const quitConfirm = quitConfirmOpen && <QuitConfirm onQuit={onExit} onCancel={() => setQuitConfirmOpen(false)} />

  const navigation = {
    // Back on the first screen leaves character creation for the Main Menu.
    canGoBack: true,
    canGoNext: Boolean(nextStep),
    nextLabel: nextStep ? `Next: ${nextStep.title}` : 'Next',
    onBack: () => (previousStep ? setCurrentStepId(previousStep.id) : requestQuit()),
    // The first screen's Back already returns to the Main Menu, so it has no Quit.
    onQuit: previousStep ? requestQuit : undefined,
    onNext: () => nextStep && setCurrentStepId(nextStep.id),
    onGoToStep: (stepId) => isKnownStep(stepId) && setCurrentStepId(stepId),
    // Dev: every later screen depends on earlier choices, so a cleared character restarts at the first screen.
    onClear: () => {
      dispatch({ type: 'resetCharacter' })
      setCurrentStepId(steps[0].id)
    },
    // Each screen's options depend on the earlier screens, so Auto waits until those are complete.
    canAuto: hasAutoChoice(step.id) && steps.slice(0, index).every((earlier) => isStepComplete(earlier.id, character)),
    showAuto: hasAutoChoice(step.id),
    onAuto: () => dispatch({ type: 'autoChooseStep', stepId: step.id, seed: Math.random() }),
    canShowSummary: summaryPopup.canShow,
    onShowSummary: summaryPopup.show,
    // Saves the confirmed character (again, if it already was), then returns to the Main Menu. savedCharacterId (UI state) remembers which saved
    // entry this draft is, so going back to edit and confirming again updates it rather than adding a copy.
    onConfirm: () => {
      if (!isCharacterValid(character)) return
      // An already-confirmed character (e.g. just imported) keeps its original confirmation time.
      const confirmedAt = character.confirmedAt ?? new Date().toISOString()
      dispatch({ type: 'confirmCharacter', confirmedAt })
      const saved = saveConfirmedCharacter({ ...character, confirmedAt }, loadLocation().savedCharacterId)
      saveLocation({ ...loadLocation(), savedCharacterId: saved.id })
      onConfirmed(saved.characters)
    },
  }

  // Review is the finished character sheet: full width, without the step list or the running summary.
  if (step.id === 'review') {
    return (
      <div className="frame">
        <Header subtitle="Character Complete" subtitleHelpId="reviewScreen" />
        <div className="frame-body frame-body-review" inert={quitConfirmOpen}>
          <Screen step={step} navigation={navigation} />
        </div>
        {quitConfirm}
      </div>
    )
  }

  return (
    <div className="frame">
      <Header />
      <div className="frame-body" inert={summaryPopup.open || quitConfirmOpen}>
        <StepNav
          steps={steps}
          currentStepId={currentStepId}
          completedStepIds={getCompletedStepIds(steps, character)}
          onSelectStep={navigation.onGoToStep}
        />
        <Screen step={step} navigation={navigation} />
        <CharacterSummary character={character} />
      </div>
      {summaryPopup.open && <CharacterStepSummaryModal summary={buildStepSummary(step.id, character)} onClose={summaryPopup.close} />}
      {quitConfirm}
    </div>
  )
}

// The menu keeps its 1024x576 reference-image coordinates (same 16:9 shape); character creation uses the design resolution.
const MENU_STAGE = { width: 1024, height: 576 }

function Views() {
  const { dispatch } = useCharacter()
  // UI state only: which top-level view is showing. Saved (never exported) so a refresh returns to it.
  const [view, setView] = useState(() => (VIEWS.includes(loadLocation().view) ? loadLocation().view : 'menu'))
  const [displaySettings, setDisplaySettings] = useState(() => normalizeDisplaySettings(loadSettings()?.display))
  const [audioSettings, setAudioSettings] = useState(() => normalizeAudioSettings(loadSettings()?.audio))
  const [savedCharacters, setSavedCharacters] = useState(getSavedCharacters)
  const openMenu = () => setView('menu')
  const handleConfirmed = (characters) => {
    setSavedCharacters(characters)
    openMenu()
  }

  useEffect(() => saveLocation({ ...loadLocation(), view }), [view])
  useEffect(() => saveSettings({ ...loadSettings(), display: displaySettings }), [displaySettings])
  useEffect(() => saveSettings({ ...loadSettings(), audio: audioSettings }), [audioSettings])

  // The music plays across every view; the volume is set before starting so it fades in at the saved level.
  useEffect(() => music.setVolume(audioSettings.music / 100), [audioSettings.music])
  useEffect(() => {
    music.start()
    return music.stop
  }, [])

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

  return (
    <>
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
      {view === 'creator' && (
        <ScaledStage settings={displaySettings}>
          <CharacterCreator onExit={openMenu} onConfirmed={handleConfirmed} />
        </ScaledStage>
      )}
    </>
  )
}

export default function App() {
  return (
    <CharacterProvider>
      <Views />
    </CharacterProvider>
  )
}
