import { useEffect, useState } from 'react'
import Header from '../components/Header.jsx'
import QuitConfirm from '../components/QuitConfirm.jsx'
import StepNav from '../components/StepNav.jsx'
import StarshipSummary from '../components/ships/StarshipSummary.jsx'
import { loadLocation, saveLocation } from '../character/persistence.js'
import creationSteps from '../data/ships/creationSteps.json'
import FinishingTouchesScreen from '../screens/ships/FinishingTouchesScreen.jsx'
import ReviewScreen from '../screens/ships/ReviewScreen.jsx'
import MissionProfileScreen from '../screens/ships/MissionProfileScreen.jsx'
import RefitsScreen from '../screens/ships/RefitsScreen.jsx'
import ServiceRecordScreen from '../screens/ships/ServiceRecordScreen.jsx'
import SpaceframeScreen from '../screens/ships/SpaceframeScreen.jsx'
import TimeframeScreen from '../screens/ships/TimeframeScreen.jsx'
import {
  addRefit,
  applyNotableExample,
  autofillShip,
  createEmptyShip,
  getMissionProfileById,
  getServiceRecordById,
  getSpaceframeById,
  confirmShip,
  getTimeframeById,
  isFinishingTouchesComplete,
  isMissionProfileComplete,
  isRefitsFinished,
  isServiceRecordFinished,
  missionSystemLabel,
  pickFinishing,
  pickMissionProfile,
  pickRefitsAndTalents,
  pickServiceRecord,
  pickSpaceframeId,
  pickTimeframeId,
  refitSummary,
  removeRefit,
  setAppearanceDetailChoice,
  setFinishingChoice,
  setRegistry,
  setClassDesignation,
  setShipName,
  setShipTalentChoice,
  shipDisplayName,
  shipDisplayRegistry,
  selectMissionProfile,
  selectMissionProfileSystem,
  selectMissionProfileTalent,
  clearServiceRecord,
  selectServiceRecord,
  selectSpaceframe,
  selectTimeframe,
  serviceRecordLabel,
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

export default function ShipCreator({ launch = null, onExit, onStartGame, onShipsSaved }) {
  const [ship, setShip] = useState(() => initialShip(launch))
  // Which step is on screen. UI state, saved with the location so a reload returns here.
  const [stepId, setStepId] = useState(() => initialStepId(launch))
  const [savedShipId, setSavedShipId] = useState(() => {
    if (launch?.mode === 'new') return null
    if (launch?.mode === 'saved') return launch.id
    return loadLocation().savedShipId ?? null
  })
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [quitOpen, setQuitOpen] = useState(false)
  const step = steps.find((entry) => entry.id === stepId) ?? steps[0]
  const era = getTimeframeById(ship.timeframeId)
  const frame = getSpaceframeById(ship.spaceframeId)
  const profile = getMissionProfileById(ship.missionProfileId)
  const record = getServiceRecordById(ship.serviceRecordId)
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
  const completedStepIds = [
    ship.timeframeId ? 'timeframe' : null,
    ship.spaceframeId ? 'spaceframe' : null,
    missionReady ? 'missionProfile' : null,
    serviceReady ? 'serviceRecord' : null,
    refitsReady ? 'refits' : null,
    finishingReady ? 'finishingTouches' : null,
    ship.confirmedAt ? 'review' : null,
  ].filter(Boolean)

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

  const systemLabel = missionSystemLabel(profile?.system === 'choice' ? ship.missionProfileSystemId : profile?.system)
  const recordLabel = serviceRecordLabel(ship)
  const refitLine = refitSummary(ship)
  const finishingName = shipDisplayName(ship)
  const summary = onReview || onFinishing
    ? { title: finishingName || 'Finishing Touches', lines: [shipDisplayRegistry(ship) || 'No registry'] }
    : onRefits
    ? { title: 'Refits', lines: [refitLine || 'None'] }
    : onService
    ? record && { title: recordLabel, lines: [record.ruleName] }
    : onMission
      ? profile && { title: profile.name, lines: [systemLabel ? `${systemLabel} +1` : 'Choose one system to increase by 1.'] }
      : onSpaceframe
        ? frame && { title: frame.name, lines: [`Launch year ${frame.launchYear}`] }
        : era && { title: era.name, lines: [era.years] }

  return (
    <div className="frame">
      <Header subtitle="Starship Creation" subtitleHelpId="starshipCreation" />
      <div className="frame-body" inert={summaryOpen || quitOpen}>
        <StepNav
          steps={steps}
          currentStepId={step.id}
          completedStepIds={completedStepIds}
          previewLastStep={false}
          onSelectStep={(id) => {
            if (id === 'timeframe' || id === 'spaceframe' || (id === 'missionProfile' && ship.spaceframeId) || (id === 'serviceRecord' && missionReady) || (id === 'refits' && serviceReady) || (id === 'finishingTouches' && refitsReady) || (id === 'review' && finishingReady)) setStepId(id)
          }}
        />
        {onReview ? (
          <ReviewScreen
            step={step}
            ship={ship}
            onBack={() => setStepId('finishingTouches')}
            onQuit={requestQuit}
            onClear={resetShip}
            onAutofill={fillShip}
            onShowSummary={() => setSummaryOpen(true)}
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
            onShowSummary={() => setSummaryOpen(true)}
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
            onShowSummary={() => setSummaryOpen(true)}
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
            onShowSummary={() => record && setSummaryOpen(true)}
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
            onShowSummary={() => profile && setSummaryOpen(true)}
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
            onShowSummary={() => frame && setSummaryOpen(true)}
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
            onShowSummary={() => era && setSummaryOpen(true)}
            nextDisabled={!ship.timeframeId}
            onNext={() => setStepId('spaceframe')}
          />
        )}
        <StarshipSummary ship={ship} />
      </div>
      {summaryOpen && summary && (
        <div className="step-summary-overlay" role="presentation" onClick={() => setSummaryOpen(false)}>
          <div className="ship-summary-popup panel" role="dialog" aria-labelledby="ship-summary-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="ship-summary-title">{summary.title}</h2>
            {summary.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
            <button type="button" className="nav-button nav-next" onClick={() => setSummaryOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
      {quitOpen && (
        <QuitConfirm
          message="Your unfinished ship will be lost."
          onQuit={onExit}
          onCancel={() => setQuitOpen(false)}
        />
      )}
    </div>
  )
}
