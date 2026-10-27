import { useEffect, useState } from 'react'
import '../../styles/ships/serviceRecord.css'
import ShipArt from '../../components/ships/ShipArt.jsx'
import ShipScreenFooter from '../../components/ships/ShipScreenFooter.jsx'
import {
  getServiceHonorById,
  getServiceHonors,
  getServiceNarrativeEventById,
  getServiceNarrativeEvents,
  getServiceRecordById,
  getServiceRecords,
  getServiceReputationById,
  getServiceReputations,
  getShipGameplayTraits,
  getSpaceframeById,
  isMissionProfileComplete,
  MAX_SERVICE_HONORS,
  MAX_SERVICE_NOTABLE_EVENTS,
  pickSurvivorNamesake,
  serviceRecordTitle,
} from '../../ships/shipModel.js'
import { serviceSpecialRuleStatus } from '../../ships/serviceEffects.js'

const INTRO = 'A service record is optional. It adds one trait, named for the record, and one special rule.'
const NARRATIVE_STATUS = 'Prototype narrative Trait · −1 / +1 on tagged tasks · not STA 2E Service Record mechanics'

const TABS = [
  ['history', 'Service History'],
  ['events', 'Notable Events'],
  ['reputation', 'Reputation'],
  ['traits', 'Traits'],
  ['honors', 'Honors & Citations'],
]

function OptionCard({ name, line, artSrc, selected, onClick, role = 'option', capped = false }) {
  return (
    <button
      type="button"
      role={role}
      aria-selected={selected}
      aria-disabled={capped || undefined}
      className={`service-card${selected ? ' is-selected' : ''}${capped ? ' is-capped' : ''}`}
      onClick={onClick}
    >
      <ShipArt src={artSrc} alt="" className="service-card-art" />
      <span className="service-card-text">
        <span className="service-card-name">{name}</span>
        {line && <span className="service-card-line">{line}</span>}
      </span>
    </button>
  )
}

function ServiceDetail({
  artSrc,
  title,
  description,
  context,
  effects,
  sourceLabel,
  extra,
  emptyBody,
}) {
  const hasContent = Boolean(description || context || effects || extra)
  return (
    <div className="service-detail panel">
      <ShipArt src={artSrc} alt="" className="service-preview-art" />
      <div className="service-detail-text">
        <h2 className="service-detail-name">{title}</h2>
        {hasContent ? (
          <>
            {description && <p>{description}</p>}
            {context && <p>{context}</p>}
            {effects}
            {extra}
            {sourceLabel && <p className="service-detail-status">{sourceLabel}</p>}
          </>
        ) : (
          <p className="service-empty">{emptyBody}</p>
        )}
      </div>
    </div>
  )
}

function narrativeContext(item) {
  if (!item) return null
  const parts = [item.background, item.significance].filter(Boolean)
  return parts.length ? parts.join(' ') : null
}

function EffectsList({ items }) {
  if (!items?.length) return null
  return (
    <ul className="service-detail-effects">
      {items.map((item) => (
        <li key={item.key}>{item.node}</li>
      ))}
    </ul>
  )
}

function artForTrait(entry, ship) {
  if (entry.source === 'class') {
    const frame = getSpaceframeById(ship.spaceframeId)
    return frame ? `/art/ships/classes/${frame.id}.png` : null
  }
  if (entry.source === 'serviceRecord') return `/art/ships/service/${entry.sourceId}.png`
  if (entry.source === 'event') return `/art/ships/service/events/${entry.sourceId}.png`
  if (entry.source === 'reputation') return `/art/ships/service/reputation/${entry.sourceId}.png`
  if (entry.source === 'honor') return `/art/ships/service/honors/${entry.sourceId}.png`
  return null
}

function sourceLabel(entry, ship) {
  if (entry.source === 'class') {
    const frame = getSpaceframeById(ship.spaceframeId)
    return frame ? `${frame.name} spaceframe (official)` : 'Spaceframe (official)'
  }
  if (entry.source === 'serviceRecord') {
    const record = getServiceRecordById(entry.sourceId)
    return record
      ? `Service record · Star Trek Adventures 2E Core Rulebook, p. ${record.page}`
      : 'Service record (official)'
  }
  if (entry.source === 'event') return 'Notable event (prototype narrative Trait)'
  if (entry.source === 'reputation') return 'Reputation (prototype narrative Trait)'
  if (entry.source === 'honor') return 'Honor (prototype narrative Trait)'
  return 'Ship Trait'
}

function classTraitEffect(ship) {
  const frame = getSpaceframeById(ship.spaceframeId)
  if (frame?.overview) return `Official class trait. ${frame.overview}`
  return 'Unknown. No longer description is stored for this class trait in project data.'
}

function buildTraitCards(ship) {
  return getShipGameplayTraits(ship).map((entry) => ({
    id: `${entry.source}:${entry.sourceId}:${entry.name}`,
    name: entry.name,
    line: entry.line,
    artSrc: artForTrait(entry, ship),
    description: entry.description,
    source: sourceLabel(entry, ship),
    effect: entry.effect ?? (entry.source === 'class' ? classTraitEffect(ship) : null),
    pending: entry.pending,
    specialRule: entry.specialRule,
  }))
}

export default function ServiceRecordScreen({
  step,
  ship,
  onSelect,
  onDetail,
  onToggleEvent,
  onSelectReputation,
  onToggleHonor,
  onBack,
  onQuit,
  onClear,
  onAuto,
  onAutofill,
  onShowSummary,
  onNext,
}) {
  const records = getServiceRecords()
  const events = getServiceNarrativeEvents()
  const reputations = getServiceReputations()
  const honors = getServiceHonors()
  const selected = getServiceRecordById(ship.serviceRecordId)
  const title = serviceRecordTitle(ship)
  const traitLabel = selected
    ? (title ?? (selected.namesake ? 'Name the battle or war.' : selected.name))
    : null
  const [tab, setTab] = useState('history')
  const [draft, setDraft] = useState(ship.serviceRecordDetail ?? '')
  const [focusEventId, setFocusEventId] = useState(null)
  const [focusHonorId, setFocusHonorId] = useState(null)
  const [focusTraitId, setFocusTraitId] = useState(null)

  const traitCards = buildTraitCards(ship)
  const specialStatus = serviceSpecialRuleStatus(ship)
  const focusEvent = getServiceNarrativeEventById(focusEventId)
    ?? getServiceNarrativeEventById(ship.serviceNotableEventIds?.[0])
  const focusReputation = getServiceReputationById(ship.serviceReputationId)
  const focusHonor = getServiceHonorById(focusHonorId)
    ?? getServiceHonorById(ship.serviceHonorIds?.[0])
  const focusTrait = traitCards.find((card) => card.id === focusTraitId) ?? traitCards[0] ?? null

  useEffect(() => {
    setDraft(ship.serviceRecordDetail ?? '')
  }, [ship.serviceRecordId])

  useEffect(() => {
    setFocusTraitId(null)
  }, [
    ship.spaceframeId,
    ship.serviceRecordId,
    ship.serviceRecordDetail,
    ship.serviceNotableEventIds,
    ship.serviceReputationId,
    ship.serviceHonorIds,
  ])

  const leftList = (() => {
    if (tab === 'history') {
      return (
        <div className="service-list" role="listbox" aria-label="Service record">
          {records.map((record) => (
            <OptionCard
              key={record.id}
              name={record.name}
              line={record.ruleName}
              artSrc={`/art/ships/service/${record.id}.png`}
              selected={record.id === ship.serviceRecordId}
              onClick={() => onSelect(record.id)}
            />
          ))}
        </div>
      )
    }
    if (tab === 'events') {
      const eventIds = ship.serviceNotableEventIds ?? []
      const atEventCap = eventIds.length >= MAX_SERVICE_NOTABLE_EVENTS
      return (
        <div className="service-list" role="listbox" aria-label="Notable events">
          {events.map((event) => {
            const chosen = eventIds.includes(event.id)
            const blocked = atEventCap && !chosen
            return (
              <OptionCard
                key={event.id}
                name={event.name}
                line={chosen ? 'Selected' : blocked ? `Limit ${MAX_SERVICE_NOTABLE_EVENTS}` : 'Narrative'}
                artSrc={`/art/ships/service/events/${event.id}.png`}
                selected={Boolean(chosen)}
                capped={blocked}
                onClick={() => {
                  setFocusEventId(event.id)
                  if (!blocked) onToggleEvent(event.id)
                }}
              />
            )
          })}
        </div>
      )
    }
    if (tab === 'reputation') {
      return (
        <div className="service-list" role="listbox" aria-label="Reputation">
          {reputations.map((entry) => (
            <OptionCard
              key={entry.id}
              name={entry.name}
              line="Narrative"
              artSrc={`/art/ships/service/reputation/${entry.id}.png`}
              selected={ship.serviceReputationId === entry.id}
              onClick={() => onSelectReputation(entry.id)}
            />
          ))}
        </div>
      )
    }
    if (tab === 'traits') {
      return (
        <div className="service-list" role="listbox" aria-label="Ship traits">
          {traitCards.length === 0 ? (
            <p className="service-empty">No traits yet.</p>
          ) : (
            traitCards.map((card) => (
              <OptionCard
                key={card.id}
                name={card.name}
                line={card.line}
                artSrc={card.artSrc}
                selected={focusTrait?.id === card.id}
                onClick={() => setFocusTraitId(card.id)}
              />
            ))
          )}
        </div>
      )
    }
    const honorIds = ship.serviceHonorIds ?? []
    const atHonorCap = honorIds.length >= MAX_SERVICE_HONORS
    return (
      <div className="service-list" role="listbox" aria-label="Honors and citations">
        {honors.map((honor) => {
          const chosen = honorIds.includes(honor.id)
          const blocked = atHonorCap && !chosen
          return (
            <OptionCard
              key={honor.id}
              name={honor.name}
              line={chosen ? 'Selected' : blocked ? `Limit ${MAX_SERVICE_HONORS}` : 'Narrative'}
              artSrc={`/art/ships/service/honors/${honor.id}.png`}
              selected={Boolean(chosen)}
              capped={blocked}
              onClick={() => {
                setFocusHonorId(honor.id)
                if (!blocked) onToggleHonor(honor.id)
              }}
            />
          )
        })}
      </div>
    )
  })()

  let detail = null
  if (tab === 'history') {
    detail = (
      <ServiceDetail
        artSrc={selected ? `/art/ships/service/${selected.id}.png` : null}
        title={selected ? selected.name : 'No service record selected'}
        description={selected?.overview}
        context={selected
          ? 'Official Star Trek Adventures 2E Service Record. Optional; grants a trait named for the record and one special rule.'
          : null}
        effects={selected ? (
          <EffectsList
            items={[
              {
                key: 'trait',
                node: (
                  <>
                    <strong>Trait.</strong>
                    {' '}
                    {traitLabel}
                  </>
                ),
              },
              {
                key: 'rule',
                node: (
                  <>
                    <strong>{selected.ruleName}.</strong>
                    {' '}
                    {selected.rule}
                  </>
                ),
              },
            ]}
          />
        ) : null}
        sourceLabel={selected ? `Star Trek Adventures 2E Core Rulebook, p. ${selected.page}` : null}
        extra={selected?.namesake ? (
          <label className="service-name">
            Battle or war
            <span className="service-name-row">
              <input
                type="text"
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value)
                  onDetail(event.target.value)
                }}
                onBlur={() => setDraft(ship.serviceRecordDetail ?? '')}
              />
              <button
                type="button"
                title="Pick a sample battle or war."
                onClick={() => {
                  const next = pickSurvivorNamesake(ship)
                  const name = next.serviceRecordDetail ?? ''
                  setDraft(name)
                  onDetail(name)
                }}
              >
                Random
              </button>
            </span>
          </label>
        ) : null}
        emptyBody="Unset. A service record is optional."
      />
    )
  } else if (tab === 'events') {
    detail = (
      <ServiceDetail
        artSrc={focusEvent ? `/art/ships/service/events/${focusEvent.id}.png` : null}
        title={focusEvent ? focusEvent.name : 'No notable event focused'}
        description={focusEvent?.description ?? focusEvent?.summary}
        context={narrativeContext(focusEvent)}
        effects={focusEvent?.implications ? <p>{focusEvent.implications}</p> : null}
        sourceLabel={focusEvent ? NARRATIVE_STATUS : null}
        emptyBody={`Unset. Select up to ${MAX_SERVICE_NOTABLE_EVENTS} narrative events. None are required.`}
      />
    )
  } else if (tab === 'reputation') {
    detail = (
      <ServiceDetail
        artSrc={focusReputation ? `/art/ships/service/reputation/${focusReputation.id}.png` : null}
        title={focusReputation ? focusReputation.name : 'No reputation selected'}
        description={focusReputation?.description ?? focusReputation?.summary}
        context={narrativeContext(focusReputation)}
        effects={focusReputation?.implications ? <p>{focusReputation.implications}</p> : null}
        sourceLabel={focusReputation ? NARRATIVE_STATUS : null}
        emptyBody="Unset. STA 2E does not define a numerical ship reputation score (Core Rulebook, p. 216). Choose one narrative standing, or none."
      />
    )
  } else if (tab === 'traits') {
    const pending = selected?.namesake && !serviceRecordTitle(ship)
    const status = !focusTrait
      ? (pending ? 'Pending' : 'Unset')
      : (focusTrait.pending ? 'Pending' : 'Active')
    detail = (
      <ServiceDetail
        artSrc={focusTrait?.artSrc ?? null}
        title={focusTrait ? focusTrait.name : 'No trait focused'}
        description={focusTrait
          ? (focusTrait.description
            ?? 'Unknown. No longer description is stored for this class trait in project data.')
          : null}
        context={focusTrait ? `Source: ${focusTrait.source}` : null}
        effects={focusTrait ? (
          <EffectsList
            items={[
              {
                key: 'effect',
                node: (
                  <>
                    <strong>Effect.</strong>
                    {' '}
                    {focusTrait.effect ?? 'Unknown. Class traits are listed by name only in spaceframe data.'}
                  </>
                ),
              },
              {
                key: 'status',
                node: (
                  <>
                    <strong>Status.</strong>
                    {' '}
                    {status}
                  </>
                ),
              },
              focusTrait.specialRule ? {
                key: 'rule',
                node: (
                  <>
                    <strong>{focusTrait.specialRule.name}.</strong>
                    {' '}
                    {focusTrait.specialRule.text}
                    {' '}
                    <span>
                      (Special rule — not a trait.
                      {specialStatus.available === 'partial'
                        ? ` ${specialStatus.reason}`
                        : specialStatus.available
                          ? ''
                          : ` ${specialStatus.reason}`}
                      )
                    </span>
                  </>
                ),
              } : null,
            ].filter(Boolean)}
          />
        ) : null}
        sourceLabel={focusTrait?.source ?? null}
        emptyBody={pending
          ? 'Pending. Name the battle or war on Service History to gain the Survivor trait.'
          : 'Unset. Select a trait card to review it, or complete earlier steps that grant traits.'}
      />
    )
  } else {
    detail = (
      <ServiceDetail
        artSrc={focusHonor ? `/art/ships/service/honors/${focusHonor.id}.png` : null}
        title={focusHonor ? focusHonor.name : 'No honor focused'}
        description={focusHonor?.description ?? focusHonor?.summary}
        context={narrativeContext(focusHonor)}
        effects={focusHonor?.implications ? <p>{focusHonor.implications}</p> : null}
        sourceLabel={focusHonor ? NARRATIVE_STATUS : null}
        emptyBody={`Unset. Select up to ${MAX_SERVICE_HONORS} narrative honors. None are required.`}
      />
    )
  }

  return (
    <section className="screen service-screen">
      <div className="screen-title">
        <span className="screen-number">{step.number}</span>
        <div>
          <h1 className="screen-heading">{step.title}</h1>
          <p className="screen-intro">
            {INTRO}
            <span className="source-ref">Star Trek Adventures 2E Core Rulebook, p. 216</span>
          </p>
        </div>
      </div>

      <div className="service-tabs" role="tablist" aria-label="Service record categories">
        {TABS.map(([id, label]) => {
          const active = id === tab
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`service-tab${active ? ' is-selected' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div className="service-body">
        {leftList}
        <div className="service-main" role="tabpanel">
          {detail}
        </div>
      </div>

      <ShipScreenFooter
        ship={ship}
        onBack={onBack}
        onQuit={onQuit}
        onClear={onClear}
        onAuto={onAuto}
        onAutofill={onAutofill}
        onShowSummary={onShowSummary}
        canShowSummary={Boolean(selected)}
        autoDisabled={!isMissionProfileComplete(ship)}
        autoTitle="Choose a service record at random."
        nextLabel="Next: Refits →"
        onNext={onNext}
      />
    </section>
  )
}
