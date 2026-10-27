import { useEffect, useState } from 'react'
import '../../styles/ships/finishingTouches.css'
import HelpTip from '../../components/HelpTip.jsx'
import { useInfoTip } from '../../components/useInfoTip.js'
import ShipAppearancePreview from '../../components/ships/ShipAppearancePreview.jsx'
import ShipArt from '../../components/ships/ShipArt.jsx'
import ShipScreenFooter from '../../components/ships/ShipScreenFooter.jsx'
import { finishingOptionTip } from '../../ships/shipInfoTips.js'
import { appearanceOptionArt, bridgeArt, classArt, finishingArt } from '../../ships/shipArtPaths.js'
import {
  appearanceOptionAvailability,
  finishingPackageAvailability,
  getAppearanceCategories,
  getBridgeLayouts,
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

const INTRO = 'Name and registry are required for a Federation ship (name always; registry when required). Bridge layout, markings, and emblem are optional cosmetics and do not change statistics.'

const TABS = [
  { id: 'name', label: 'Name & Registry', purpose: 'Enter the ship name and registry. Class comes from the selected spaceframe.' },
  { id: 'bridge', label: 'Bridge Layout', purpose: 'Cosmetic bridge layout only. No stations or statistics change.' },
  { id: 'appearance', label: 'Appearance & Markings', purpose: 'Legacy cosmetics plus Identification, Livery, and Surface Finish. No Systems or Departments change.' },
  { id: 'emblem', label: 'Emblem & Decals', purpose: 'Cosmetic emblem and secondary markings. No statistical change.' },
  { id: 'final', label: 'Final Options', purpose: 'Review finishing choices. No further customization on this screen.' },
]

const GAMEPLAY_LABEL = {
  cosmetic: 'Cosmetic',
  earned: 'Earned',
}

const APPEARANCE = [
  ['hullMarkingsId', 'Hull Markings'],
  ['stripingStyleId', 'Striping Style'],
  ['nacelleCapsId', 'Nacelle Caps'],
]

const EMBLEMS = [
  ['emblemStyleId', 'Emblem Style'],
  ['secondaryMarkingsId', 'Secondary Markings'],
]

function optionEntry(field, id) {
  if (!id) return null
  return getFinishingOptions(field).find((entry) => entry.id === id) ?? null
}

function optionLabel(field, id) {
  return optionEntry(field, id)?.name ?? id ?? '—'
}

function ChoiceSelect({ field, label, ship, onChoice }) {
  const options = getFinishingOptions(field)
  return (
    <label className="finish-field">
      <span>{label}</span>
      <select
        value={ship[field] ?? ''}
        onChange={(event) => onChoice(field, event.target.value)}
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>{option.name}</option>
        ))}
      </select>
    </label>
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
  nextDisabled = false,
  onNext,
}) {
  const [tab, setTab] = useState('name')
  const [nameDraft, setNameDraft] = useState(ship.shipName ?? '')
  const [registryDraft, setRegistryDraft] = useState(ship.registry ?? '')
  const [designationDraft, setDesignationDraft] = useState(ship.classDesignation ?? '')
  const [appearanceFocus, setAppearanceFocus] = useState(null)
  const [appearanceCategoryId, setAppearanceCategoryId] = useState('legacy')
  const tip = useInfoTip()
  const frame = getSpaceframeById(ship.spaceframeId)
  const appearanceCategories = getAppearanceCategories()
  const appearanceDetail = normalizeAppearanceDetail(ship.appearanceDetail)
  const displayName = shipDisplayName(ship)
  const displayRegistry = shipDisplayRegistry(ship)
  const needsRegistry = registryRequired(ship)
  const nameMissing = !ship.shipName?.trim()
  const registryMissing = needsRegistry && !ship.registry?.trim()
  const activeTab = TABS.find((entry) => entry.id === tab) ?? TABS[0]
  const bridges = getBridgeLayouts()
  const selectedBridge = bridges.find((entry) => entry.id === ship.bridgeLayoutId) ?? null
  const classPreview = frame ? classArt(frame.id) : null
  const emblemSrc = ship.emblemStyleId
    ? finishingArt('emblemStyleId', ship.emblemStyleId)
    : ''
  const selectedEmblem = optionEntry('emblemStyleId', ship.emblemStyleId)
  const selectedSecondary = optionEntry('secondaryMarkingsId', ship.secondaryMarkingsId)

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

  const selectBridge = (id) => {
    onChoice('bridgeLayoutId', ship.bridgeLayoutId === id ? '' : id)
  }

  const selectAppearance = (field, option) => {
    const selected = ship[field] === option.id
    setAppearanceFocus(selected ? null : { kind: 'legacy', field, id: option.id })
    onChoice(field, selected ? '' : option.id)
  }

  const selectDetailOption = (categoryId, slotId, option) => {
    const selected = appearanceDetail[categoryId]?.[slotId] === option.id
    setAppearanceFocus(selected ? null : { kind: 'detail', categoryId, slotId, id: option.id, option })
    onAppearanceDetail?.(categoryId, slotId, selected ? '' : option.id)
  }

  const focusedDetail = appearanceFocus?.kind === 'detail' ? appearanceFocus : null
  const focusedLegacy = appearanceFocus?.kind === 'legacy'
    ? optionEntry(appearanceFocus.field, appearanceFocus.id)
    : null
  const focusedLegacyLabel = appearanceFocus?.kind === 'legacy'
    ? APPEARANCE.find(([field]) => field === appearanceFocus.field)?.[1]
    : null
  const focusedDetailAvailability = focusedDetail?.option
    ? appearanceOptionAvailability(ship, focusedDetail.option)
    : null

  const handleRandom = () => {
    if (!getNotableExample(ship)) return
    onRandom()
  }

  let body = null

  if (tab === 'name') {
    body = (
      <div className="finish-body finish-name">
        <form className="finish-form panel" onSubmit={(event) => event.preventDefault()}>
          <h2 className="finish-section-title">Name & Registry</h2>
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
  } else if (tab === 'bridge') {
    body = (
      <div className="finish-body finish-bridge">
        <p className="finish-note">Cosmetic only. No stations or statistics change.</p>
        <div className="finish-bridge-grid" role="listbox" aria-label="Bridge layout">
          {bridges.map((layout) => {
            const selected = ship.bridgeLayoutId === layout.id
            return (
              <button
                key={layout.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={`finish-bridge-card help-tip${selected ? ' is-selected' : ''}`}
                onClick={() => selectBridge(layout.id)}
                {...tip.bind(finishingOptionTip(layout))}
              >
                <ShipArt src={bridgeArt(layout.id)} alt="" className="finish-bridge-card-art" />
                <span className="finish-bridge-card-name">{layout.name}</span>
                <span className="finish-bridge-card-caption">{layout.caption}</span>
              </button>
            )
          })}
          {tip.element}
        </div>
        <div className="finish-bridge-detail panel">
          <ShipArt
            src={selectedBridge ? bridgeArt(selectedBridge.id) : classPreview ?? ''}
            alt=""
            className="finish-hero-art"
          />
          <div className="finish-detail-text">
            <h2 className="finish-detail-name">{selectedBridge?.name ?? 'No bridge layout selected'}</h2>
            {selectedBridge?.description
              ? <p className="finish-detail-description">{selectedBridge.description}</p>
              : <p className="finish-note">Select a bridge layout to read its description.</p>}
            <p className="finish-note">Cosmetic only — no statistical change.</p>
          </div>
        </div>
      </div>
    )
  } else if (tab === 'appearance') {
    const activeCategory = appearanceCategories.find((entry) => entry.id === appearanceCategoryId) ?? null
    body = (
      <div className="finish-body finish-appearance">
        <p className="finish-note">
          Legacy cosmetics stay available. Nested Identification, Livery, and Surface Finish are presentation only;
          a few options are earned from Screen 04. None change Systems or Departments. Weathering is visual only.
        </p>
        <div className="finish-appearance-subtabs" role="tablist" aria-label="Appearance categories">
          <button
            type="button"
            role="tab"
            aria-selected={appearanceCategoryId === 'legacy'}
            className={`finish-appearance-subtab${appearanceCategoryId === 'legacy' ? ' is-selected' : ''}`}
            onClick={() => setAppearanceCategoryId('legacy')}
          >
            Legacy
          </button>
          {appearanceCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              role="tab"
              aria-selected={appearanceCategoryId === category.id}
              className={`finish-appearance-subtab${appearanceCategoryId === category.id ? ' is-selected' : ''}`}
              onClick={() => setAppearanceCategoryId(category.id)}
            >
              {category.name}
            </button>
          ))}
        </div>
        <div className="finish-appearance-layout">
          <div className="finish-appearance-choices panel">
            {appearanceCategoryId === 'legacy' ? (
              APPEARANCE.map(([field, label]) => {
                const options = getFinishingOptions(field)
                return (
                  <div key={field} className="finish-appearance-group">
                    <h3 className="finish-appearance-label">{label}</h3>
                    <div className="finish-appearance-options" role="listbox" aria-label={label}>
                      {options.map((option) => {
                        const selected = ship[field] === option.id
                        const availability = finishingPackageAvailability(ship, field, option)
                        return (
                          <button
                            key={option.id}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            className={`finish-appearance-card help-tip${selected ? ' is-selected' : ''}`}
                            onClick={() => selectAppearance(field, option)}
                            {...tip.bind(finishingOptionTip(option, availability))}
                          >
                            <ShipArt src={finishingArt(field, option.id)} alt="" className="finish-appearance-card-art" />
                            <span className="finish-appearance-card-name">{option.name}</span>
                            <span className="finish-gameplay-badge is-cosmetic">Cosmetic</span>
                            {option.caption && (
                              <span className="finish-appearance-card-caption">{option.caption}</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })
            ) : (
              (activeCategory?.slots ?? []).map((slot) => (
                <div key={slot.id} className="finish-appearance-group">
                  <h3 className="finish-appearance-label">{slot.label}</h3>
                  <div className="finish-appearance-options" role="listbox" aria-label={slot.label}>
                    {(slot.options ?? []).map((option) => {
                      const selected = appearanceDetail[activeCategory.id]?.[slot.id] === option.id
                      const availability = appearanceOptionAvailability(ship, option)
                      const locked = !availability.available
                      return (
                        <button
                          key={option.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          aria-disabled={locked}
                          className={`finish-appearance-card help-tip${selected ? ' is-selected' : ''}${locked ? ' is-locked' : ''}`}
                          onClick={() => {
                            if (locked && !selected) {
                              setAppearanceFocus({
                                kind: 'detail',
                                categoryId: activeCategory.id,
                                slotId: slot.id,
                                id: option.id,
                                option,
                              })
                              return
                            }
                            selectDetailOption(activeCategory.id, slot.id, option)
                          }}
                          {...tip.bind(finishingOptionTip(option, availability))}
                        >
                          <ShipArt src={appearanceOptionArt(option)} alt="" className="finish-appearance-card-art" />
                          <span className="finish-appearance-card-name">{option.name}</span>
                          {option.gameplay === 'earned' ? (
                            <span className="finish-gameplay-badge is-earned">{GAMEPLAY_LABEL.earned}</span>
                          ) : null}
                          {option.caption && (
                            <span className="finish-appearance-card-caption">{option.caption}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
            {tip.element}
          </div>
          <div className="finish-hero panel">
            <ShipAppearancePreview ship={ship} className="finish-hero-art" />
            <ul className="finish-checklist finish-appearance-summary">
              {APPEARANCE.map(([field, label]) => (
                <li key={field}>
                  <span>{label}</span>
                  <strong>{ship[field] ? optionLabel(field, ship[field]) : 'None'}</strong>
                </li>
              ))}
            </ul>
            <div className="finish-detail-text finish-appearance-focus">
              {focusedLegacy ? (
                <>
                  <h2 className="finish-detail-name">
                    {focusedLegacyLabel}: {focusedLegacy.name}
                  </h2>
                  <p className="finish-detail-description">{focusedLegacy.description}</p>
                  <p className="finish-note">Cosmetic — no Systems or Departments change.</p>
                </>
              ) : focusedDetail?.option ? (
                <>
                  <h2 className="finish-detail-name">{focusedDetail.option.name}</h2>
                  <p className="finish-detail-description">{focusedDetail.option.description}</p>
                  <p className="finish-note">
                    {focusedDetail.option.linksTraitSource
                      ? 'Visual of an existing Screen 04 Trait; does not grant a second Trait.'
                      : focusedDetail.option.gameplay === 'earned'
                        ? 'Earned — requires Screen 04. No Systems or Departments change.'
                        : 'No Systems or Departments change.'}
                  </p>
                  {focusedDetailAvailability && !focusedDetailAvailability.available && (
                    <p className="finish-note finish-warn">{focusedDetailAvailability.reason}</p>
                  )}
                </>
              ) : (
                <p className="finish-note">Select a marking or style to read its description.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  } else if (tab === 'emblem') {
    const emblemOptions = getFinishingOptions('emblemStyleId')
    const emblemAvailability = selectedEmblem
      ? finishingPackageAvailability(ship, 'emblemStyleId', selectedEmblem)
      : null
    body = (
      <div className="finish-body finish-emblem">
        <h2 className="finish-section-title">Emblem & Decals</h2>
        <p className="finish-note">
          Emblems are presentation only unless earned. Mission Citation requires a Screen 04 honor.
          No Systems or Departments change.
        </p>
        <div className="finish-emblem-row">
          <div className="finish-emblem-fields panel">
            <h3 className="finish-appearance-label">Emblem Style</h3>
            <div className="finish-emblem-options" role="listbox" aria-label="Emblem Style">
              {emblemOptions.map((option) => {
                const selected = ship.emblemStyleId === option.id
                const availability = finishingPackageAvailability(ship, 'emblemStyleId', option)
                const locked = !availability.available
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    aria-disabled={locked}
                    className={`finish-emblem-option help-tip${selected ? ' is-selected' : ''}${locked ? ' is-locked' : ''}`}
                    onClick={() => {
                      if (locked && !selected) return
                      onChoice('emblemStyleId', selected ? '' : option.id)
                    }}
                    {...tip.bind(finishingOptionTip(option, availability))}
                  >
                    <ShipArt src={finishingArt('emblemStyleId', option.id)} alt="" className="finish-emblem-option-art" />
                    <span className="finish-emblem-option-name">{option.name}</span>
                    {option.gameplay === 'earned' ? (
                      <span className="finish-gameplay-badge is-earned">{GAMEPLAY_LABEL.earned}</span>
                    ) : null}
                  </button>
                )
              })}
              {tip.element}
            </div>
            <ChoiceSelect field="secondaryMarkingsId" label="Secondary Markings" ship={ship} onChoice={onChoice} />
          </div>
          <div className="finish-emblem-preview panel">
            <ShipArt src={emblemSrc} alt="" className="finish-emblem-art" />
            <div className="finish-detail-text finish-emblem-detail">
              {selectedEmblem ? (
                <>
                  <h2 className="finish-detail-name">{selectedEmblem.name}</h2>
                  <p className="finish-detail-description">{selectedEmblem.description}</p>
                  {emblemAvailability && !emblemAvailability.available && (
                    <p className="finish-note finish-warn">{emblemAvailability.reason}</p>
                  )}
                </>
              ) : (
                <p className="finish-note">Select an emblem style to read its description.</p>
              )}
              {selectedSecondary ? (
                <>
                  <h3 className="finish-emblem-secondary-label">Secondary Markings: {selectedSecondary.name}</h3>
                  <p className="finish-detail-description">{selectedSecondary.description}</p>
                </>
              ) : (
                <p className="finish-note">Secondary markings unset — optional cosmetic only.</p>
              )}
              <p className="finish-note">No Systems or Departments change.</p>
            </div>
          </div>
        </div>
      </div>
    )
  } else {
    body = (
      <div className="finish-body finish-final">
        <div className="finish-final-panel panel">
          <h2 className="finish-section-title">Final Options</h2>
          <p className="finish-note">
            Review finishing choices before continuing. Ship name is always required; registry is required when the class
            traits demand one. Bridge, legacy appearance, emblem, and Appearance Detail are optional and never change
            Systems or Departments. Legacy appearance can also be set on Screen 05. This tab does not add further
            customization.
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
            <li>
              <span>Bridge layout</span>
              <strong>{selectedBridge?.name ?? 'None (optional)'}</strong>
            </li>
            {APPEARANCE.map(([field, label]) => (
              <li key={field}>
                <span>{label}</span>
                <strong>{ship[field] ? optionLabel(field, ship[field]) : 'None (optional)'}</strong>
              </li>
            ))}
            {EMBLEMS.map(([field, label]) => (
              <li key={field}>
                <span>{label}</span>
                <strong>{ship[field] ? optionLabel(field, ship[field]) : 'None (optional)'}</strong>
              </li>
            ))}
          </ul>
        </div>
        <div className="finish-hero panel">
          <ShipArt src={classPreview ?? ''} alt="" className="finish-hero-art" />
        </div>
      </div>
    )
  }

  return (
    <section className="screen finish-screen">
      <div className="screen-title finish-title">
        <div className="finish-heading">
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
        canShowSummary={Boolean(frame)}
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
