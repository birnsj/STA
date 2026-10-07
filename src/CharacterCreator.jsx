// The character creator shell: the step list, the current screen and the running summary, around the shared
// character state. Loaded on demand by App.jsx so the main menu doesn't carry every creation screen and rule module.
import { useEffect, useState } from 'react'
import { useCharacter } from './character/useCharacter.js'
import { loadLocation, saveLocation } from './character/persistence.js'
import { saveConfirmedCharacter } from './character/savedCharacters.js'
import { hasAutoChoice } from './character/autoChoice.js'
import creationSteps from './data/adaptation/creationSteps.json'
import CharacterStepSummaryModal from './components/CharacterStepSummaryModal.jsx'
import CharacterSummary from './components/CharacterSummary.jsx'
import Header from './components/Header.jsx'
import QuitConfirm from './components/QuitConfirm.jsx'
import StepNav from './components/StepNav.jsx'
import { useStepSummaryPopup } from './components/useStepSummaryPopup.js'
import GuideHighlight from './effects/GuideHighlight.jsx'
import { GUIDE_ARRIVAL_MS } from './effects/guideTiming.js'
import { isCharacterValid } from './rules/characterValidation.js'
import { getCompletedStepIds, hasUnsavedProgress, isStepComplete } from './rules/creationProgress.js'
import { buildStepSummary } from './rules/stepSummary.js'
import CareerHistoryScreen from './screens/CareerHistoryScreen.jsx'
import CareerScreen from './screens/CareerScreen.jsx'
import EarlyOutlookScreen from './screens/EarlyOutlookScreen.jsx'
import EducationScreen from './screens/EducationScreen.jsx'
import EnvironmentScreen from './screens/EnvironmentScreen.jsx'
import FinishingTouchesScreen from './screens/FinishingTouchesScreen.jsx'
import PlaceholderScreen from './screens/PlaceholderScreen.jsx'
import ReviewScreen from './screens/ReviewScreen.jsx'
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

const isKnownStep = (stepId) => steps.some((step) => step.id === stepId)

export default function CharacterCreator({ onExit, onConfirmed, showGuide }) {
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
  const summaryPopup = useStepSummaryPopup(step.id, character, showGuide ? GUIDE_ARRIVAL_MS : 0)
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
        {showGuide && <GuideHighlight enterFromFull />}
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
      {showGuide && <GuideHighlight />}
    </div>
  )
}
