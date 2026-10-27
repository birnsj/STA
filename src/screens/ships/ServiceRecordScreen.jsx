import { useEffect, useState } from 'react'
import '../../styles/ships/serviceRecord.css'
import { useWholeCardCarousel } from '../../components/wholeCardCarousel.js'
import ShipArt from '../../components/ships/ShipArt.jsx'
import ShipScreenFooter from '../../components/ships/ShipScreenFooter.jsx'
import {
  serviceEventArt,
  serviceHistoryArt,
  serviceHonorArt,
  serviceReputationArt,
  shipSummaryArt,
  traitArt,
} from '../../ships/shipArtPaths.js'
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
  ['history', 'Service History', 'Official optional service record from the Core Rulebook.'],
  ['events', 'Notable Events', 'Narrative prototype. Not STA 2E Service Record mechanics.'],
  ['reputation', 'Reputation', 'Narrative prototype. Not STA 2E Service Record mechanics.'],
  ['traits', 'Traits', 'Read-only review of traits granted so far.'],
  ['honors', 'Honors & Citations', 'Narrative prototype. Not STA 2E Service Record mechanics.'],
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
      <span className="service-card-name" title={name}>{name}</span>
      {line ? <span className="service-card-line">{line}</span> : null}
    </button>
  )
}

function ServiceCarousel({ count, label, children }) {
  const { carouselRef, trackRef, fits, scroll } = useWholeCardCarousel(count, 196, 8)
  return (
    <div className="carousel service-carousel" ref={carouselRef}>
      {!fits && (
        <button type="button" className="carousel-arrow" onClick={() => scroll(-1)} aria-label={`Scroll ${label} left`}>‹</button>
      )}
      <div className="carousel-track service-list" ref={trackRef} role="listbox" aria-label={label}>
        {children}
      </div>
      {!fits && (
        <button type="button" className="carousel-arrow" onClick={() => scroll(1)} aria-label={`Scroll ${label} right`}>›</button>
      )}
    </div>
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
  return traitArt(entry, ship.spaceframeId)
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

function specialStatusLine(status) {
  if (!status?.id) return null
  if (status.available === true) return `${status.name}: available.`
  if (status.available === 'partial') return `${status.name}: partial — ${status.reason}`
  return `${status.name}: stub — ${status.reason}`
}

export default function ServiceRecordScreen({
  step,
  ship,
  onSelect,
  onClearRecord,
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
  nextDisabled = false,
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
  const activeTab = TABS.find((entry) => entry[0] === tab) ?? TABS[0]
  const noneSelected = !ship.serviceRecordId

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
        <ServiceCarousel count={records.length + 1} label="Service record">
          <OptionCard
            name="None"
            line="No service record"
            artSrc={shipSummaryArt()}
            selected={noneSelected}
            onClick={() => onClearRecord?.()}
          />
          {records.map((record) => (
            <OptionCard
              key={record.id}
              name={record.name}
              line={record.ruleName}
              artSrc={serviceHistoryArt(record.id)}
              selected={record.id === ship.serviceRecordId}
              onClick={() => onSelect(record.id)}
            />
          ))}
        </ServiceCarousel>
      )
    }
    if (tab === 'events') {
      const eventIds = ship.serviceNotableEventIds ?? []
      const atEventCap = eventIds.length >= MAX_SERVICE_NOTABLE_EVENTS
      return (
        <ServiceCarousel count={events.length} label="Notable events">
          {events.map((event) => {
            const chosen = eventIds.includes(event.id)
            const blocked = atEventCap && !chosen
            return (
              <OptionCard
                key={event.id}
                name={event.name}
                line={chosen ? 'Selected' : blocked ? `Limit ${MAX_SERVICE_NOTABLE_EVENTS}` : 'Narrative'}
                artSrc={serviceEventArt(event.id)}
                selected={Boolean(chosen)}
                capped={blocked}
                onClick={() => {
                  setFocusEventId(event.id)
                  if (!blocked) onToggleEvent(event.id)
                }}
              />
            )
          })}
        </ServiceCarousel>
      )
    }
    if (tab === 'reputation') {
      return (
        <ServiceCarousel count={reputations.length} label="Reputation">
          {reputations.map((entry) => (
            <OptionCard
              key={entry.id}
              name={entry.name}
              line="Narrative"
              artSrc={serviceReputationArt(entry.id)}
              selected={ship.serviceReputationId === entry.id}
              onClick={() => onSelectReputation(entry.id)}
            />
          ))}
        </ServiceCarousel>
      )
    }
    if (tab === 'traits') {
      return (
        <ServiceCarousel count={Math.max(traitCards.length, 1)} label="Ship traits">
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
        </ServiceCarousel>
      )
    }
    const honorIds = ship.serviceHonorIds ?? []
    const atHonorCap = honorIds.length >= MAX_SERVICE_HONORS
    return (
      <ServiceCarousel count={honors.length} label="Honors and citations">
        {honors.map((honor) => {
          const chosen = honorIds.includes(honor.id)
          const blocked = atHonorCap && !chosen
          return (
            <OptionCard
              key={honor.id}
              name={honor.name}
              line={chosen ? 'Selected' : blocked ? `Limit ${MAX_SERVICE_HONORS}` : 'Narrative'}
              artSrc={serviceHonorArt(honor.id)}
              selected={Boolean(chosen)}
              capped={blocked}
              onClick={() => {
                setFocusHonorId(honor.id)
                if (!blocked) onToggleHonor(honor.id)
              }}
            />
          )
        })}
      </ServiceCarousel>
    )
  })()

  let detail = null
  if (tab === 'history') {
    const statusLine = selected ? specialStatusLine(specialStatus) : null
    detail = (
      <ServiceDetail
        artSrc={selected ? serviceHistoryArt(selected.id) : null}
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
              statusLine ? {
                key: 'status',
                node: (
                  <>
                    <strong>Special rule status.</strong>
                    {' '}
                    {statusLine}
                  </>
                ),
              } : null,
            ].filter(Boolean)}
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
        emptyBody="Unset. A service record is optional. Choose None to continue without one."
      />
    )
  } else if (tab === 'events') {
    detail = (
      <ServiceDetail
        artSrc={focusEvent ? serviceEventArt(focusEvent.id) : null}
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
        artSrc={focusReputation ? serviceReputationArt(focusReputation.id) : null}
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
                    {' · Review only'}
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
        artSrc={focusHonor ? serviceHonorArt(focusHonor.id) : null}
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
      <p className="service-tab-purpose">{activeTab[2]}</p>

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
        nextDisabled={nextDisabled}
        onNext={onNext}
      />
    </section>
  )
}
