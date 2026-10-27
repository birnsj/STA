import '../../styles/ships/review.css'
import ShipArt from '../../components/ships/ShipArt.jsx'
import ShipScreenFooter from '../../components/ships/ShipScreenFooter.jsx'
import { bridgeArt, classArt } from '../../ships/shipArtPaths.js'
import {
  departmentScore,
  getFinishingOptions,
  getMissionProfileById,
  getServiceRecordById,
  getSpaceframeById,
  getSpecialRule,
  getStarshipTalentById,
  getTimeframeById,
  grantedTalentIds,
  isShipComplete,
  refitBudget,
  refitSummary,
  reviewScoreLabel,
  serviceRecordLabel,
  shipCrewSupport,
  shipDisplayName,
  shipDisplayRegistry,
  shipIssues,
  shipResistance,
  shipShields,
  shipTraitNames,
  systemScore,
} from '../../ships/shipModel.js'
import { serviceSpecialRuleStatus } from '../../ships/serviceEffects.js'

const SYSTEMS = [
  ['comms', 'Communications'],
  ['engines', 'Engines'],
  ['structure', 'Structure'],
  ['computers', 'Computers'],
  ['sensors', 'Sensors'],
  ['weapons', 'Weapons'],
]

const DEPARTMENTS = [
  ['command', 'Command'],
  ['conn', 'Conn'],
  ['engineering', 'Engineering'],
  ['security', 'Security'],
  ['science', 'Science'],
  ['medicine', 'Medicine'],
]

const COSMETICS = [
  ['bridgeLayoutId', 'Bridge layout'],
  ['hullMarkingsId', 'Hull markings'],
  ['stripingStyleId', 'Striping style'],
  ['nacelleCapsId', 'Nacelle caps'],
  ['emblemStyleId', 'Emblem style'],
  ['secondaryMarkingsId', 'Secondary markings'],
]

function choiceLabel(field, id) {
  if (!id) return 'Not selected'
  return getFinishingOptions(field).find((entry) => entry.id === id)?.name ?? 'Unknown'
}

function refitLine(ship, frame) {
  if (!frame) return 'Pending'
  if ((ship.refits?.length ?? 0) !== refitBudget(ship)) return 'Pending'
  return refitSummary(ship) ?? 'None'
}

function talentEntries(ship) {
  const ids = [...grantedTalentIds(ship), ...(ship.extraTalentIds ?? [])]
  const seen = new Set()
  const entries = []
  for (const id of ids) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    const talent = getStarshipTalentById(id)
    entries.push({
      id,
      name: talent?.name ?? id,
      page: talent?.page ?? null,
      effect: talent?.effect ?? null,
    })
  }
  return entries
}

function specialStatusLine(status) {
  if (!status?.id) return null
  if (status.available === true) return `${status.name}: available.`
  if (status.available === 'partial') return `${status.name}: partial — ${status.reason}`
  return `${status.name}: stub — ${status.reason}`
}

function Row({ label, value }) {
  return (
    <div className="review-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export default function ReviewScreen({ step, ship, onBack, onQuit, onClear, onAutofill, onShowSummary, onComplete, onStartGame, onGoToStep }) {
  const frame = getSpaceframeById(ship.spaceframeId)
  const era = getTimeframeById(ship.timeframeId)
  const profile = getMissionProfileById(ship.missionProfileId)
  const record = getServiceRecordById(ship.serviceRecordId)
  const displayName = shipDisplayName(ship)
  const displayRegistry = shipDisplayRegistry(ship)
  const heading = [displayName, displayRegistry].filter(Boolean).join(' · ') || 'Not entered'
  const talents = talentEntries(ship)
  const rules = (frame?.specialRuleIds ?? []).map((id) => getSpecialRule(id)).filter(Boolean)
  const issues = shipIssues(ship)
  const specialStatus = serviceSpecialRuleStatus(ship)
  const specialLine = record ? specialStatusLine(specialStatus) : null

  return (
    <section className="screen review-screen" aria-labelledby="review-title">
      <div className="screen-title">
        <span className="screen-number">{step.number}</span>
        <div>
          <h1 id="review-title" className="screen-heading">{step.title}</h1>
          <p className="screen-intro">
            The finished ship is the class, mission profile, service record, refits, and talents (equal to Scale) already chosen on earlier screens, including Resistance, Shields, and Crew Support.
            <span className="source-ref">Star Trek Adventures 2E Core Rulebook, p. 194</span>
          </p>
        </div>
      </div>

      <div className="review-body">
        <article className="panel review-overview">
          <ShipArt key={frame?.id ?? 'class'} src={frame ? classArt(frame.id) : ''} alt="" className="review-art" />
          <div className="review-identity">
            <h2>Starship overview</h2>
            <p className="review-name">{heading}</p>
            <Row label="Class" value={frame?.name ?? 'Pending'} />
            <Row label="Era" value={era ? `${era.name} (${era.years})` : 'Pending'} />
            <Row label="Mission profile" value={profile?.name ?? 'Pending'} />
            <Row label="Service record" value={record ? serviceRecordLabel(ship) : 'Not selected'} />
            <Row label="Refits" value={refitLine(ship, frame)} />
            <Row label="Resistance" value={frame ? String(shipResistance(ship) ?? '—') : 'Pending'} />
            <Row label="Shields" value={frame ? String(shipShields(ship) ?? '—') : 'Pending'} />
            <Row label="Crew Support" value={frame ? String(shipCrewSupport(ship) ?? '—') : 'Pending'} />
            <Row label="Class designation" value="N/A" />
          </div>
        </article>

        <article className="panel review-departments">
          <h2>Departments</h2>
          {DEPARTMENTS.map(([id, label]) => (
            <Row key={id} label={label} value={reviewScoreLabel(departmentScore(ship, id))} />
          ))}
        </article>

        <article className="panel review-systems">
          <h2>Systems</h2>
          {SYSTEMS.map(([id, label]) => (
            <Row key={id} label={label} value={reviewScoreLabel(systemScore(ship, id))} />
          ))}
        </article>

        <article className="panel review-finishing">
          <h2>Finishing choices</h2>
          <div className="review-finishing-body">
            {ship.bridgeLayoutId && (
              <ShipArt src={bridgeArt(ship.bridgeLayoutId)} alt="" className="review-bridge" />
            )}
            <div>
              {COSMETICS.map(([field, label]) => (
                <Row key={field} label={label} value={choiceLabel(field, ship[field])} />
              ))}
            </div>
          </div>
        </article>

        <article className="panel review-traits">
          <h2>Traits and talents</h2>
          <p>{frame ? shipTraitNames(ship).join(', ') || 'None' : 'Pending'}</p>
          <ul>
            {talents.map((talent) => (
              <li key={talent.id}>
                {talent.name}
                {talent.page ? ` (p. ${talent.page})` : ''}
                :
                {' '}
                {talent.effect || 'Unknown'}
              </li>
            ))}
          </ul>
        </article>

        <article className="panel review-rules">
          <h2>Special rules</h2>
          {!frame ? <p>Pending</p> : rules.length === 0 ? <p>None</p> : (
            <ul>
              {rules.map((rule) => (
                <li key={rule.id}>{rule.name}{rule.page ? ` (p. ${rule.page})` : ''}: {rule.text || 'Unknown'}</li>
              ))}
            </ul>
          )}
          <p>{record ? `${record.ruleName}: ${record.rule}` : 'Service record rule: Not selected'}</p>
          {specialLine && <p className="review-note">Service special rule status: {specialLine}</p>}
          <p>Weapons: {frame ? (frame.weapons?.join(', ') || 'None') : 'Pending'}</p>
        </article>
      </div>

      {issues.length > 0 && (
        <ul className="review-issues">
          {issues.map((issue) => (
            <li key={`${issue.stepId}-${issue.message}`}>
              <button type="button" onClick={() => onGoToStep(issue.stepId)}>{issue.message}</button>
            </li>
          ))}
        </ul>
      )}

      <ShipScreenFooter
        ship={ship}
        onBack={onBack}
        onQuit={onQuit}
        onClear={onClear}
        onAutofill={onAutofill}
        onShowSummary={onShowSummary}
        canShowSummary
        showAuto={false}
        nextLabel={ship.confirmedAt ? 'Start Game →' : 'Complete →'}
        nextDisabled={!ship.confirmedAt && !isShipComplete(ship)}
        onNext={ship.confirmedAt ? onStartGame : onComplete}
      />
    </section>
  )
}
