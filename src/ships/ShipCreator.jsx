import { useEffect, useState } from 'react'
import Header from '../components/Header.jsx'
import QuitConfirm from '../components/QuitConfirm.jsx'
import StepNav from '../components/StepNav.jsx'
import { useStepSummaryPopup } from '../components/useStepSummaryPopup.js'
import ShipStepSummaryModal from '../components/ships/ShipStepSummaryModal.jsx'
import StarshipSummary from '../components/ships/StarshipSummary.jsx'
import GuideHighlight from '../effects/GuideHighlight.jsx'
import { loadLocation, saveLocation } from '../character/persistence.js'
import creationSteps from '../data/ships/creationSteps.json'
import FinishingTouchesScreen from '../screens/ships/FinishingTouchesScreen.jsx'
import ReviewScreen from '../screens/ships/ReviewScreen.jsx'
import MissionProfileScreen from '../screens/ships/MissionProfileScreen.jsx'
import RefitsScreen from '../screens/ships/RefitsScreen.jsx'
import ServiceRecordScreen from '../screens/ships/ServiceRecordScreen.jsx'
import SpaceframeScreen from '../screens/ships/SpaceframeScreen.jsx'
import TimeframeScreen from '../screens/ships/TimeframeScreen.jsx'
import { getCompletedShipStepIds, isShipStepComplete } from './creationProgress.js'
import { buildShipStepSummary, getShipStepSignature, hasShipStepSummary } from './shipStepSummary.js'
import {
  addRefit,
  applyNotableExample,
  autofillShip,
  createEmptyShip,
  confirmShip,
  isFinishingTouchesComplete,
  isMissionProfileComplete,
  isRefitsFinished,
  isServiceRecordFinished,
  pickFinishing,
  pickMissionProfile,
  pickRefitsAndTalents,
  pickServiceRecord,
  pickSpaceframeId,
  pickTimeframeId,
  removeRefit,
  setAppearanceDetailChoice,
  setFinishingChoice,
  setRegistry,
  setClassDesignation,
  setShipName,
  setShipTalentChoice,
  selectMissionProfile,
  selectMissionProfileSystem,
  selectMissionProfileTalent,
  clearServiceRecord,
  selectServiceRecord,
  selectSpaceframe,
  selectTimeframe,
  selectServiceReputation,
  setCampaignYear,
  setServiceRecordDetail,
  toggleServiceHonor,
  toggleServiceNotableEvent,
  toggleShipTalent,
} from './shipModel.js'
import { loadShip, saveShip, shipFromRecord } from './persistence.js'
import { saveConfirmedShip } from './savedShips.js'

const { steps } = creationSteps
const STEP_IDS = steps.map((entry) => entry.id)

const SHIP_SUMMARY_ADAPTERS = {
  hasSummary: hasShipStepSummary,
  isComplete: isShipStepComplete,
  getSignature: getShipStepSignature,
}

function initialShip(launch) {
  if (launch?.mode === 'new') return createEmptyShip()
  if (launch?.mode === 'saved') return shipFromRecord(launch.record)
  return loadShip()
}

function initialStepId(launch) {
  if (launch?.mode === 'new') return 'timeframe'
  if (launch?.mode === 'saved') return 'review'
  const saved = loadLocation().shipStepId
  return steps.some((entry) => entry.id === saved) ? saved : 'timeframe'
}

export default function ShipCreator({ launch = null, onExit, onStartGame, onShipsSaved, showGuide = true, showCreationSummary = true }) {
  const [ship, setShip] = useState(() => initialShip(launch))
  // Which step is on screen. UI state, saved with the location so a reload returns here.
  const [stepId, setStepId] = useState(() => initialStepId(launch))
  const [savedShipId, setSavedShipId] = useState(() => {
    if (launch?.mode === 'new') return null
    if (launch?.mode === 'saved') return launch.id
    return loadLocation().savedShipId ?? null
  })
  const [quitOpen, setQuitOpen] = useState(false)
  const step = steps.find((entry) => entry.id === stepId) ?? steps[0]
  const summaryPopup = useStepSummaryPopup(step.id, ship, SHIP_SUMMARY_ADAPTERS, showCreationSummary)
  const onSpaceframe = step.id === 'spaceframe'
  const onMission = step.id === 'missionProfile'
  const onService = step.id === 'serviceRecord'
  const onRefits = step.id === 'refits'
  const onFinishing = step.id === 'finishingTouches'
  const onReview = step.id === 'review'
  const missionReady = isMissionProfileComplete(ship)
  const serviceReady = isServiceRecordFinished(ship)
  const refitsReady = isRefitsFinished(ship)
  const finishingReady = isFinishingTouchesComplete(ship)
  const completedStepIds = getCompletedShipStepIds(ship, STEP_IDS)

  useEffect(() => {
    saveShip(ship)
  }, [ship])

  useEffect(() => {
    saveLocation({ ...loadLocation(), shipStepId: stepId, savedShipId })
  }, [stepId, savedShipId])

  const resetShip = () => {
    setShip(createEmptyShip())
    setStepId('timeframe')
  }
  const fillShip = () => setShip(autofillShip())
  const requestQuit = () => {
    if (ship.confirmedAt || JSON.stringify(ship) === JSON.stringify(createEmptyShip())) onExit()
    else setQuitOpen(true)
  }
  const completeShip = () => {
    const confirmed = confirmShip(ship)
    if (!confirmed.confirmedAt) return
    const saved = saveConfirmedShip(confirmed, savedShipId)
    setSavedShipId(saved.id)
    onShipsSaved?.(saved.ships)
    setShip(confirmed)
  }

  const chooseEra = (timeframeId) => setShip((current) => selectTimeframe(current, timeframeId))
  const chooseFrame = (spaceframeId) => setShip((current) => selectSpaceframe(current, spaceframeId))
  const chooseProfile = (missionProfileId) => setShip((current) => selectMissionProfile(current, missionProfileId))

  const footerSummary = {
    canShowSummary: summaryPopup.canShow,
    onShowSummary: summaryPopup.show,
  }

  return (
    <div className="frame">
      <Header subtitle="Starship Creation" subtitleHelpId="starshipCreation" />
      <div className={`frame-body${onReview ? ' frame-body-review' : ''}`} inert={summaryPopup.open || quitOpen}>
        {!onReview && (
          <StepNav
            steps={steps}
            currentStepId={step.id}
            completedStepIds={completedStepIds}
            onSelectStep={(id) => {
              if (id === 'timeframe' || id === 'spaceframe' || (id === 'missionProfile' && ship.spaceframeId) || (id === 'serviceRecord' && missionReady) || (id === 'refits' && serviceReady) || (id === 'finishingTouches' && refitsReady) || (id === 'review' && finishingReady)) setStepId(id)
            }}
          />
        )}
        {onReview ? (
          <ReviewScreen
            step={step}
            ship={ship}
            onBack={() => setStepId('finishingTouches')}
            onQuit={requestQuit}
            onClear={resetShip}
            onAutofill={fillShip}
            onShowSummary={summaryPopup.show}
            canShowSummary={summaryPopup.canShow}
            onComplete={completeShip}
            onStartGame={onStartGame}
            onGoToStep={setStepId}
          />
        ) : onFinishing ? (
          <FinishingTouchesScreen
            step={step}
            ship={ship}
            onName={(text) => setShip((current) => setShipName(current, text))}
            onRegistry={(text) => setShip((current) => setRegistry(current, text))}
            onClassDesignation={(text) => setShip((current) => setClassDesignation(current, text))}
            onChoice={(field, id) => setShip((current) => setFinishingChoice(current, field, id))}
            onAppearanceDetail={(categoryId, slotId, optionId) => (
              setShip((current) => setAppearanceDetailChoice(current, categoryId, slotId, optionId))
            )}
            onRandom={() => setShip((current) => applyNotableExample(current, Math.random))}
            onBack={() => setStepId('refits')}
            onQuit={requestQuit}
            onClear={resetShip}
            onAuto={() => setShip((current) => pickFinishing(current))}
            onAutofill={fillShip}
            {...footerSummary}
            nextDisabled={!finishingReady}
            onNext={() => setStepId('review')}
          />
        ) : onRefits ? (
          <RefitsScreen
            step={step}
            ship={ship}
            onIncrease={(system) => setShip((current) => addRefit(current, system))}
            onDecrease={(system) => setShip((current) => removeRefit(current, system))}
            onToggleTalent={(talentId) => setShip((current) => toggleShipTalent(current, talentId))}
            onTalentChoice={(talentId, choice) => setShip((current) => setShipTalentChoice(current, talentId, choice))}
            onBack={() => setStepId('serviceRecord')}
            onQuit={requestQuit}
            onClear={resetShip}
            onAuto={() => setShip((current) => pickRefitsAndTalents(current))}
            onAutofill={fillShip}
            {...footerSummary}
            nextDisabled={!refitsReady}
            onNext={() => setStepId('finishingTouches')}
          />
        ) : onService ? (
          <ServiceRecordScreen
            step={step}
            ship={ship}
            onSelect={(serviceRecordId) => setShip((current) => selectServiceRecord(current, serviceRecordId))}
            onClearRecord={() => setShip((current) => clearServiceRecord(current))}
            onDetail={(text) => setShip((current) => setServiceRecordDetail(current, text))}
            onToggleEvent={(eventId) => setShip((current) => toggleServiceNotableEvent(current, eventId))}
            onSelectReputation={(reputationId) => setShip((current) => selectServiceReputation(current, reputationId))}
            onToggleHonor={(honorId) => setShip((current) => toggleServiceHonor(current, honorId))}
            onBack={() => setStepId('missionProfile')}
            onQuit={requestQuit}
            onClear={resetShip}
            onAuto={() => setShip((current) => pickServiceRecord(current))}
            onAutofill={fillShip}
            {...footerSummary}
            nextDisabled={!serviceReady}
            onNext={() => setStepId('refits')}
          />
        ) : onMission ? (
          <MissionProfileScreen
            step={step}
            ship={ship}
            onSelect={chooseProfile}
            onSelectTalent={(talentId) => setShip((current) => selectMissionProfileTalent(current, talentId))}
            onSelectSystem={(systemId) => setShip((current) => selectMissionProfileSystem(current, systemId))}
            onBack={() => setStepId('spaceframe')}
            onQuit={requestQuit}
            onClear={resetShip}
            onAuto={() => setShip((current) => pickMissionProfile(current))}
            onAutofill={fillShip}
            {...footerSummary}
            nextDisabled={!missionReady}
            onNext={() => setStepId('serviceRecord')}
          />
        ) : onSpaceframe ? (
          <SpaceframeScreen
            step={step}
            ship={ship}
            onSelect={chooseFrame}
            onBack={() => setStepId('timeframe')}
            onQuit={requestQuit}
            onClear={resetShip}
            onAuto={() => chooseFrame(pickSpaceframeId(ship.timeframeId, Math.random, ship.campaignYear))}
            onAutofill={fillShip}
            {...footerSummary}
            nextDisabled={!ship.spaceframeId}
            onNext={() => setStepId('missionProfile')}
          />
        ) : (
          <TimeframeScreen
            step={step}
            ship={ship}
            onSelect={chooseEra}
            onYear={(year) => setShip((current) => setCampaignYear(current, year))}
            onBack={requestQuit}
            onQuit={requestQuit}
            onClear={resetShip}
            onAuto={() => chooseEra(pickTimeframeId())}
            onAutofill={fillShip}
            {...footerSummary}
            nextDisabled={!ship.timeframeId || !Number.isFinite(ship.campaignYear)}
            onNext={() => setStepId('spaceframe')}
          />
        )}
        {!onReview && <StarshipSummary ship={ship} />}
      </div>
      {summaryPopup.open && (
        <ShipStepSummaryModal summary={buildShipStepSummary(step.id, ship)} onClose={summaryPopup.close} />
      )}
      {quitOpen && (
        <QuitConfirm
          message="Your unfinished ship will be lost."
          onQuit={onExit}
          onCancel={() => setQuitOpen(false)}
        />
      )}
      {showGuide && <GuideHighlight enterFromFull={onReview} />}
    </div>
  )
}
