import { useEffect, useState } from 'react'
import '../../styles/ships/finishingTouches.css'
import ShipArt from '../../components/ships/ShipArt.jsx'
import ShipScreenFooter from '../../components/ships/ShipScreenFooter.jsx'
import { bridgeArt, classArt, finishingArt } from '../../ships/shipArtPaths.js'
import {
  getBridgeLayouts,
  getFinishingOptions,
  getSpaceframeById,
  isRefitsFinished,
  registryRequired,
  shipDisplayName,
  shipDisplayRegistry,
} from '../../ships/shipModel.js'

const INTRO = 'Name and registry are required for a Federation ship (name always; registry when required). Bridge layout, markings, and emblem are optional cosmetics and do not change statistics.'

const TABS = [
  { id: 'name', label: 'Name & Registry' },
  { id: 'bridge', label: 'Bridge Layout' },
  { id: 'appearance', label: 'Appearance & Markings' },
  { id: 'emblem', label: 'Emblem & Decals' },
]

const APPEARANCE = [
  ['hullMarkingsId', 'Hull markings', 'hullMarkings'],
  ['stripingStyleId', 'Striping style', 'stripingStyles'],
  ['nacelleCapsId', 'Nacelle caps', 'nacelleCaps'],
]

const EMBLEMS = [
  ['emblemStyleId', 'Emblem style', 'emblemStyles'],
  ['secondaryMarkingsId', 'Secondary markings', 'secondaryMarkings'],
]

function ChoiceSelect({ field, label, ship, onChoice }) {
  const options = getFinishingOptions(field)
  return (
    <label className="finish-field">
      <span>{label}</span>
      <select value={ship[field] ?? ''} onChange={(event) => onChoice(field, event.target.value)}>
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
  onChoice,
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
  const frame = getSpaceframeById(ship.spaceframeId)
  const displayName = shipDisplayName(ship)
  const displayRegistry = shipDisplayRegistry(ship)

  useEffect(() => {
    setNameDraft(ship.shipName ?? '')
  }, [ship.shipName])

  useEffect(() => {
    setRegistryDraft(ship.registry ?? '')
  }, [ship.registry])

  return (
    <section className="screen finish-screen">
      <div className="screen-title">
        <span className="screen-number">{step.number}</span>
        <div>
          <h1 className="screen-heading">{step.title}</h1>
          <p className="screen-intro">
            {INTRO}
            <span className="source-ref">Star Trek Adventures 2E Core Rulebook, p. 194</span>
          </p>
        </div>
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
              onName(nameDraft)
              onRegistry(registryDraft)
              setTab(entry.id)
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="finish-panel finish-name" hidden={tab !== 'name'}>
          <form className="finish-form" onSubmit={(event) => event.preventDefault()}>
            <h2>Name & registry</h2>
            <label className="finish-field">
              <span>Ship name</span>
              <input
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={(event) => onName(event.currentTarget.value)}
              />
            </label>
            <label className="finish-field">
              <span>Registry{registryRequired(ship) ? '' : ' (not required)'}</span>
              <span className="finish-registry">
                <input
                  value={registryDraft}
                  onChange={(event) => setRegistryDraft(event.target.value)}
                  onBlur={(event) => onRegistry(event.currentTarget.value)}
                />
                <button
                  type="button"
                  title="Use a notable example name and registry from this class."
                  onClick={onRandom}
                >
                  Random
                </button>
              </span>
            </label>
            <p className="finish-note">Random fills a notable example from this class when one is listed.</p>
            <p className="finish-readout">{displayName || '—'}</p>
            <p className="finish-readout">{displayRegistry || '—'}</p>
          </form>
          <ShipArt key={frame?.id ?? 'class'} src={frame ? classArt(frame.id) : ''} alt="" className="finish-class-art" />
        </div>

      <div className="finish-panel finish-bridge" hidden={tab !== 'bridge'}>
          <p className="finish-note">A bridge layout is a cosmetic choice. It does not add stations or change the ship’s statistics.</p>
          <div className="finish-cards" role="listbox" aria-label="Bridge layout">
            {getBridgeLayouts().map((layout) => {
              const selected = ship.bridgeLayoutId === layout.id
              return (
                <button
                  key={layout.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={selected ? 'finish-card is-selected' : 'finish-card'}
                  onClick={() => onChoice('bridgeLayoutId', layout.id)}
                >
                  <ShipArt src={bridgeArt(layout.id)} alt="" className="finish-card-art" />
                  <span className="finish-card-name">{layout.name}</span>
                  <span className="finish-card-caption">{layout.caption}</span>
                </button>
              )
            })}
          </div>
        </div>

      <div className="finish-panel finish-choices" hidden={tab !== 'appearance'}>
          <h2>Appearance & markings</h2>
          {APPEARANCE.map(([field, label]) => (
            <ChoiceSelect key={field} field={field} label={label} ship={ship} onChoice={onChoice} />
          ))}
          <div className="finish-appearance-preview">
            {APPEARANCE.map(([field]) => (
              ship[field] ? (
                <ShipArt
                  key={field}
                  src={finishingArt(field, ship[field])}
                  alt=""
                  className="finish-option-art"
                />
              ) : null
            ))}
          </div>
        </div>

      <div className="finish-panel finish-emblem" hidden={tab !== 'emblem'}>
          <div className="finish-choices">
            <h2>Emblem & decals</h2>
            {EMBLEMS.map(([field, label]) => (
              <ChoiceSelect key={field} field={field} label={label} ship={ship} onChoice={onChoice} />
            ))}
          </div>
          <ShipArt
            key={ship.emblemStyleId ?? 'emblem'}
            src={ship.emblemStyleId ? finishingArt('emblemStyleId', ship.emblemStyleId) : ''}
            alt=""
            className="finish-emblem-art"
          />
        </div>

      <ShipScreenFooter
        ship={ship}
        onBack={onBack}
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
        onNext={onNext}
      />
    </section>
  )
}
