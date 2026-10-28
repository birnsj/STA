import { useEffect, useState } from 'react'
import '../../styles/ships/finishingTouches.css'
import HelpTip from '../../components/HelpTip.jsx'
import { useInfoTip } from '../../components/useInfoTip.js'
import ShipAppearancePreview from '../../components/ships/ShipAppearancePreview.jsx'
import ShipArt from '../../components/ships/ShipArt.jsx'
import ShipScreenFooter from '../../components/ships/ShipScreenFooter.jsx'
import { finishingOptionTip } from '../../ships/shipInfoTips.js'
import { appearanceOptionArt, classArt, finishingArt } from '../../ships/shipArtPaths.js'
import {
  appearanceOptionAvailability,
  finishingPackageAvailability,
  getAppearanceOption,
  getAppearanceSlot,
  getFinishingOptions,
  getNotableExample,
  getSpaceframeById,
  isFinishingTouchesComplete,
  isRefitsFinished,
  normalizeAppearanceDetail,
  registryRequired,
  shipDisplayName,
  shipDisplayRegistry,
} from '../../ships/shipModel.js'

const INTRO = 'Name and registry are required for a Federation ship (name always; registry when required). Appearance choices are cosmetic or contextual only and do not change Systems or Departments.'

const TABS = [
  { id: 'identity', label: 'Identity', purpose: 'Enter the ship name, registry, and optional class designation.' },
  { id: 'exterior', label: 'Exterior Appearance', purpose: 'Bridge layout, hull markings, striping, nacelles, and identification livery.' },
  { id: 'insignia', label: 'Insignia & Decals', purpose: 'Emblem, secondary markings, mission ID, and honor insignia.' },
  { id: 'surface', label: 'Surface Finish', purpose: 'Hull finish, panel contrast, weathering, and hull colors.' },
  { id: 'summary', label: 'Summary', purpose: 'Review identity and appearance before continuing to Review.' },
]

const GAMEPLAY_LABEL = {
  cosmetic: 'Cosmetic',
  contextual: 'Contextual',
  earned: 'Earned',
}

/** One setting = one legacy field or one appearanceDetail slot. Each ID maps once. */
const EXTERIOR_SETTINGS = [
  { id: 'bridge', label: 'Bridge Layout', kind: 'legacy', field: 'bridgeLayoutId' },
  { id: 'hull', label: 'Hull Markings', kind: 'legacy', field: 'hullMarkingsId' },
  { id: 'striping', label: 'Striping', kind: 'legacy', field: 'stripingStyleId' },
  { id: 'nacelleCaps', label: 'Nacelle Caps', kind: 'legacy', field: 'nacelleCapsId' },
  { id: 'registryPlace', label: 'Registry Placement', kind: 'detail', categoryId: 'identification', slotId: 'registryStyleId' },
  { id: 'hullId', label: 'Hull Identification', kind: 'detail', categoryId: 'identification', slotId: 'hullIdMarkingsId' },
  { id: 'pennant', label: 'Pennants', kind: 'detail', categoryId: 'identification', slotId: 'pennantId' },
  { id: 'engHull', label: 'Engineering Hull', kind: 'detail', categoryId: 'livery', slotId: 'engineeringHullId' },
  { id: 'nacMarks', label: 'Nacelle Markings', kind: 'detail', categoryId: 'livery', slotId: 'nacelleMarkingsId' },
  { id: 'stripePattern', label: 'Striping Pattern', kind: 'detail', categoryId: 'livery', slotId: 'stripingPatternId' },
]

const INSIGNIA_SETTINGS = [
  { id: 'emblem', label: 'Emblem Style', kind: 'legacy', field: 'emblemStyleId' },
  { id: 'secondary', label: 'Secondary Markings', kind: 'legacy', field: 'secondaryMarkingsId' },
  { id: 'mission', label: 'Mission Identification', kind: 'detail', categoryId: 'identification', slotId: 'missionIdMarkingsId' },
  { id: 'honor', label: 'Honor Insignia', kind: 'detail', categoryId: 'identification', slotId: 'honorInsigniaId', dense: true },
]

const SURFACE_SETTINGS = [
  { id: 'finish', label: 'Hull Finish', kind: 'detail', categoryId: 'surfaceFinish', slotId: 'finishId' },
  { id: 'panels', label: 'Panel Contrast', kind: 'detail', categoryId: 'surfaceFinish', slotId: 'panelContrastId' },
  { id: 'weather', label: 'Weathering', kind: 'detail', categoryId: 'surfaceFinish', slotId: 'weatheringId' },
  { id: 'color', label: 'Hull Colors', kind: 'detail', categoryId: 'livery', slotId: 'hullColorId' },
]

const SUMMARY_LEGACY = [
  ...EXTERIOR_SETTINGS.filter((entry) => entry.kind === 'legacy'),
  ...INSIGNIA_SETTINGS.filter((entry) => entry.kind === 'legacy'),
]

const SUMMARY_DETAIL = [
  ...EXTERIOR_SETTINGS.filter((entry) => entry.kind === 'detail'),
  ...INSIGNIA_SETTINGS.filter((entry) => entry.kind === 'detail'),
  ...SURFACE_SETTINGS,
]

function optionEntry(field, id) {
  if (!id) return null
  return getFinishingOptions(field).find((entry) => entry.id === id) ?? null
}

function optionLabel(field, id) {
  return optionEntry(field, id)?.name ?? id ?? '—'
}

function detailLabel(categoryId, slotId, optionId) {
  if (!optionId) return 'None'
  return getAppearanceOption(categoryId, slotId, optionId)?.name ?? optionId
}

function settingOptions(setting) {
  if (setting.kind === 'legacy') return getFinishingOptions(setting.field)
  return getAppearanceSlot(setting.categoryId, setting.slotId)?.options ?? []
}

function selectedOptionId(ship, appearanceDetail, setting) {
  if (setting.kind === 'legacy') return ship[setting.field] || null
  return appearanceDetail[setting.categoryId]?.[setting.slotId] || null
}

function optionArt(setting, option) {
  if (setting.kind === 'legacy') return finishingArt(setting.field, option.id)
  return appearanceOptionArt(option)
}

function optionAvailability(ship, setting, option) {
  if (setting.kind === 'legacy') return finishingPackageAvailability(ship, setting.field, option)
  return appearanceOptionAvailability(ship, option)
}

function GameplayBadges({ option }) {
  if (!option?.gameplay) return null
  const label = GAMEPLAY_LABEL[option.gameplay] ?? option.gameplay
  return (
    <span className={`finish-gameplay-badge is-${option.gameplay}`}>{label}</span>
  )
}

function SettingSelector({ settings, activeId, onSelect }) {
  return (
    <div className="finish-setting-list" role="listbox" aria-label="Appearance settings">
      {settings.map((setting) => (
        <button
          key={setting.id}
          type="button"
          role="option"
          aria-selected={setting.id === activeId}
          className={`finish-setting-chip${setting.id === activeId ? ' is-selected' : ''}`}
          onClick={() => onSelect(setting.id)}
        >
          {setting.label}
        </button>
      ))}
    </div>
  )
}

function ChoiceGrid({
  setting,
  options,
  selectedId,
  focusId,
  ship,
  onFocus,
  onSelect,
  tip,
}) {
  // Honor uses a dense 2×3; every other setting presents a full 2×2 (four slots).
  const dense = Boolean(setting.dense) || options.length > 4
  const cells = dense ? 6 : 4
  const shown = dense ? options.slice(0, 6) : options.slice(0, 4)
  const slots = Array.from({ length: cells }, (_, index) => shown[index] ?? null)

  return (
    <div
      className={`finish-choice-grid${dense ? ' is-dense' : ''}`}
      role="listbox"
      aria-label={setting.label}
    >
      {slots.map((option, index) => {
        if (!option) {
          return <div key={`empty-${index}`} className="finish-choice-slot is-empty" aria-hidden="true" />
        }
        const selected = selectedId === option.id
        const focused = focusId === option.id
        const availability = optionAvailability(ship, setting, option)
        const locked = !availability.available
        return (
          <button
            key={option.id}
            type="button"
            role="option"
            aria-selected={selected}
            aria-disabled={locked || undefined}
            className={`finish-choice-card help-tip${selected ? ' is-selected' : ''}${focused && !selected ? ' is-focused' : ''}${locked ? ' is-locked' : ''}`}
            onClick={() => {
              onFocus(option.id)
              if (locked && !selected) return
              onSelect(option, selected)
            }}
            {...tip.bind(finishingOptionTip(option, availability))}
          >
            <ShipArt src={optionArt(setting, option)} alt="" className="finish-choice-art" />
            <span className="finish-choice-meta">
              <span className="finish-choice-name">{option.name}</span>
              {option.gameplay === 'earned' ? (
                <span className="finish-gameplay-badge is-earned">{GAMEPLAY_LABEL.earned}</span>
              ) : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function AppearanceWorkspace({
  settings,
  settingId,
  onSettingId,
  ship,
  appearanceDetail,
  onChoice,
  onAppearanceDetail,
  tip,
  classPreview,
}) {
  const setting = settings.find((entry) => entry.id === settingId) ?? settings[0]
  const options = settingOptions(setting)
  const selectedId = selectedOptionId(ship, appearanceDetail, setting)
  const [focusId, setFocusId] = useState(selectedId)

  useEffect(() => {
    setFocusId(selectedId)
  }, [setting.id, selectedId])

  const focusedId = focusId || selectedId || options[0]?.id || null
  const focusedOption = options.find((entry) => entry.id === focusedId) ?? null
  const focusedAvailability = focusedOption
    ? optionAvailability(ship, setting, focusedOption)
    : null
  const isLegacy = setting.kind === 'legacy'
  const previewSrc = focusedOption
    ? optionArt(setting, focusedOption)
    : classPreview ?? ''

  const handleSelect = (option, wasSelected) => {
    if (setting.kind === 'legacy') {
      onChoice(setting.field, wasSelected ? '' : option.id)
      return
    }
    onAppearanceDetail?.(setting.categoryId, setting.slotId, wasSelected ? '' : option.id)
  }

  return (
    <div className="finish-body finish-appearance-workspace">
      <SettingSelector
        settings={settings}
        activeId={setting.id}
        onSelect={onSettingId}
      />
      <div className="finish-workspace-main">
        <div className="finish-workspace-choices panel">
          <h2 className="finish-section-title">{setting.label}</h2>
          <ChoiceGrid
            setting={setting}
            options={options}
            selectedId={selectedId}
            focusId={focusedId}
            ship={ship}
            onFocus={setFocusId}
            onSelect={handleSelect}
            tip={tip}
          />
          {tip.element}
        </div>
        <div className="finish-workspace-preview panel">
          {isLegacy ? (
            <>
              <ShipArt src={previewSrc} alt="" className="finish-hero-art" />
              <p className="finish-note finish-preview-honesty">
                Package preview only — legacy packages are not painted onto the class hull here.
              </p>
            </>
          ) : (
            <ShipAppearancePreview ship={ship} className="finish-hero-art" />
          )}
          <div className="finish-detail-text">
            {focusedOption ? (
              <>
                <div className="finish-detail-head">
                  <h2 className="finish-detail-name">{focusedOption.name}</h2>
                  <GameplayBadges option={focusedOption} />
                </div>
                {focusedOption.caption ? <p className="finish-detail-caption">{focusedOption.caption}</p> : null}
                <p className="finish-detail-description">{focusedOption.description}</p>
                <p className="finish-note">No Systems or Departments change.</p>
                {focusedOption.linksTraitSource ? (
                  <p className="finish-note">Visual of an existing Screen 04 Trait; does not grant a second Trait.</p>
                ) : null}
                {focusedAvailability && !focusedAvailability.available ? (
                  <p className="finish-note finish-warn">{focusedAvailability.reason}</p>
                ) : null}
              </>
            ) : (
              <p className="finish-note">Select an option to read its description.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function FinishingTouchesScreen({
  step,
  ship,
  onName,
  onRegistry,
  onClassDesignation,
  onChoice,
  onAppearanceDetail,
  onRandom,
  onBack,
  onQuit,
  onClear,
  onAuto,
  onAutofill,
  onShowSummary,
  canShowSummary = false,
  nextDisabled = false,
  onNext,
}) {
  const [tab, setTab] = useState('identity')
  const [nameDraft, setNameDraft] = useState(ship.shipName ?? '')
  const [registryDraft, setRegistryDraft] = useState(ship.registry ?? '')
  const [designationDraft, setDesignationDraft] = useState(ship.classDesignation ?? '')
  const [exteriorSettingId, setExteriorSettingId] = useState(EXTERIOR_SETTINGS[0].id)
  const [insigniaSettingId, setInsigniaSettingId] = useState(INSIGNIA_SETTINGS[0].id)
  const [surfaceSettingId, setSurfaceSettingId] = useState(SURFACE_SETTINGS[0].id)
  const tip = useInfoTip()
  const frame = getSpaceframeById(ship.spaceframeId)
  const appearanceDetail = normalizeAppearanceDetail(ship.appearanceDetail)
  const displayName = shipDisplayName(ship)
  const displayRegistry = shipDisplayRegistry(ship)
  const needsRegistry = registryRequired(ship)
  const nameMissing = !ship.shipName?.trim()
  const registryMissing = needsRegistry && !ship.registry?.trim()
  const activeTab = TABS.find((entry) => entry.id === tab) ?? TABS[0]
  const classPreview = frame ? classArt(frame.id) : null

  useEffect(() => {
    setNameDraft(ship.shipName ?? '')
  }, [ship.shipName])

  useEffect(() => {
    setRegistryDraft(ship.registry ?? '')
  }, [ship.registry])

  useEffect(() => {
    setDesignationDraft(ship.classDesignation ?? '')
  }, [ship.classDesignation])

  const commitDrafts = () => {
    onName(nameDraft)
    onRegistry(registryDraft)
    onClassDesignation?.(designationDraft)
  }

  const handleRandom = () => {
    if (!getNotableExample(ship)) return
    onRandom()
  }

  let body = null

  if (tab === 'identity') {
    body = (
      <div className="finish-body finish-name">
        <form className="finish-form panel" onSubmit={(event) => event.preventDefault()}>
          <h2 className="finish-section-title">Identity</h2>
          <label className={`finish-field${nameMissing ? ' is-missing' : ''}`}>
            <span>Ship Name</span>
            <span className="finish-registry">
              <input
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={(event) => onName(event.currentTarget.value)}
                placeholder="e.g. Endeavour"
              />
              <button
                type="button"
                className="finish-random"
                title="Fill notable example name, registry, and class designation for this class."
                onClick={handleRandom}
              >
                Random
              </button>
            </span>
          </label>
          <p className="finish-note">
            Random fills ship name, registry, and class designation from a notable example of this class.
          </p>
          <label className={`finish-field${registryMissing ? ' is-missing' : ''}`}>
            <span>{needsRegistry ? 'Registry' : 'Registry (not required)'}</span>
            <input
              value={registryDraft}
              onChange={(event) => setRegistryDraft(event.target.value)}
              onBlur={(event) => onRegistry(event.currentTarget.value)}
              placeholder="e.g. 1701"
            />
          </label>
          <label className="finish-field">
            <span>Class Designation (optional)</span>
            <input
              value={designationDraft}
              onChange={(event) => setDesignationDraft(event.target.value)}
              onBlur={(event) => onClassDesignation?.(event.currentTarget.value)}
              placeholder={frame ? `${frame.name} class` : 'e.g. Constitution class'}
            />
          </label>
          {(displayName || displayRegistry) && (
            <div className="finish-display">
              <p className="finish-readout">{displayName || '—'}</p>
              <p className="finish-readout">{displayRegistry || '—'}</p>
            </div>
          )}
          {!isFinishingTouchesComplete(ship) && (
            <p className="finish-note finish-warn">
              {nameMissing ? 'Enter the ship name to continue.' : 'Enter the registry to continue.'}
            </p>
          )}
        </form>
        <div className="finish-hero panel">
          <ShipArt key={frame?.id ?? 'class'} src={classPreview ?? ''} alt="" className="finish-hero-art" />
        </div>
      </div>
    )
  } else if (tab === 'exterior') {
    body = (
      <AppearanceWorkspace
        settings={EXTERIOR_SETTINGS}
        settingId={exteriorSettingId}
        onSettingId={setExteriorSettingId}
        ship={ship}
        appearanceDetail={appearanceDetail}
        onChoice={onChoice}
        onAppearanceDetail={onAppearanceDetail}
        tip={tip}
        classPreview={classPreview}
      />
    )
  } else if (tab === 'insignia') {
    body = (
      <AppearanceWorkspace
        settings={INSIGNIA_SETTINGS}
        settingId={insigniaSettingId}
        onSettingId={setInsigniaSettingId}
        ship={ship}
        appearanceDetail={appearanceDetail}
        onChoice={onChoice}
        onAppearanceDetail={onAppearanceDetail}
        tip={tip}
        classPreview={classPreview}
      />
    )
  } else if (tab === 'surface') {
    body = (
      <AppearanceWorkspace
        settings={SURFACE_SETTINGS}
        settingId={surfaceSettingId}
        onSettingId={setSurfaceSettingId}
        ship={ship}
        appearanceDetail={appearanceDetail}
        onChoice={onChoice}
        onAppearanceDetail={onAppearanceDetail}
        tip={tip}
        classPreview={classPreview}
      />
    )
  } else {
    body = (
      <div className="finish-body finish-final">
        <div className="finish-final-panel panel">
          <h2 className="finish-section-title">Summary</h2>
          <p className="finish-note">
            Identity and appearance only. Systems, talents, and service history are reviewed on the next screen.
          </p>
          <ul className="finish-checklist">
            <li>
              <span>Ship name</span>
              <strong className={nameMissing ? 'is-missing' : ''}>{displayName || 'Missing'}</strong>
            </li>
            <li>
              <span>Registry</span>
              <strong className={registryMissing ? 'is-missing' : ''}>
                {displayRegistry || (needsRegistry ? 'Missing' : 'Not required')}
              </strong>
            </li>
            <li>
              <span>Class designation</span>
              <strong>{ship.classDesignation || 'None (optional)'}</strong>
            </li>
            {SUMMARY_LEGACY.map((setting) => (
              <li key={setting.id}>
                <span>{setting.label}</span>
                <strong>
                  {ship[setting.field] ? optionLabel(setting.field, ship[setting.field]) : 'None (optional)'}
                </strong>
              </li>
            ))}
            {SUMMARY_DETAIL.map((setting) => {
              const optionId = appearanceDetail[setting.categoryId]?.[setting.slotId]
              return (
                <li key={setting.id}>
                  <span>{setting.label}</span>
                  <strong>
                    {optionId
                      ? detailLabel(setting.categoryId, setting.slotId, optionId)
                      : 'None (optional)'}
                  </strong>
                </li>
              )
            })}
          </ul>
        </div>
        <div className="finish-hero panel">
          <ShipAppearancePreview ship={ship} className="finish-hero-art" />
        </div>
      </div>
    )
  }

  return (
    <section className="screen finish-screen">
      <div className="screen-title finish-title">
        <div className="screen-title-heading">
          <span className="screen-number">{step.number}</span>
          <h1 className={`screen-heading${nameMissing || registryMissing ? ' is-missing' : ''}`}>
            <HelpTip helpId="shipFinishingTouchesScreen">{step.title}</HelpTip>
          </h1>
        </div>
        <p className="screen-intro">
          {INTRO}
          <span className="source-ref">Star Trek Adventures 2E Core Rulebook, p. 194</span>
        </p>
      </div>

      <div className="finish-tabs" role="tablist" aria-label="Finishing touches">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={tab === entry.id ? 'finish-tab is-selected' : 'finish-tab'}
            onClick={() => {
              commitDrafts()
              setTab(entry.id)
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <p className="finish-tab-purpose">{activeTab.purpose}</p>

      {body}

      <ShipScreenFooter
        ship={ship}
        onBack={() => {
          commitDrafts()
          onBack()
        }}
        onQuit={onQuit}
        onClear={onClear}
        onAuto={onAuto}
        onAutofill={onAutofill}
        onShowSummary={onShowSummary}
        canShowSummary={canShowSummary}
        autoDisabled={!isRefitsFinished(ship)}
        autoTitle="Use the class's first named example, and the listed cosmetic choices."
        nextLabel="Next: Review →"
        nextDisabled={nextDisabled}
        onNext={() => {
          commitDrafts()
          onNext()
        }}
      />
    </section>
  )
}
