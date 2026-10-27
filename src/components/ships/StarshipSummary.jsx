import {
  departmentScore,
  getMissionProfileById,
  getSpaceframeById,
  getTimeframeById,
  refitSummary,
  serviceRecordLabel,
  shipCrewSupport,
  shipDisplayName,
  shipDisplayRegistry,
  shipResistance,
  shipShields,
  shipTalentNames,
  shipTraitNames,
} from '../../ships/shipModel.js'
import { classArt, eraArt, shipSummaryArt } from '../../ships/shipArtPaths.js'
import ShipArt from './ShipArt.jsx'

const EMPTY = '—'

const DEPARTMENTS = [
  ['command', 'Command'],
  ['conn', 'Conn'],
  ['engineering', 'Engineering'],
  ['security', 'Security'],
  ['science', 'Science'],
  ['medicine', 'Medicine'],
]

function Row({ label, value }) {
  return (
    <div className="summary-row">
      <dt>{label}</dt>
      <dd title={value || undefined}>{value || EMPTY}</dd>
    </div>
  )
}

const joined = (items) => (items?.length ? items.join(', ') : null)

export default function StarshipSummary({ ship }) {
  const era = getTimeframeById(ship.timeframeId)
  const frame = getSpaceframeById(ship.spaceframeId)
  const profile = getMissionProfileById(ship.missionProfileId)
  const resistance = shipResistance(ship)
  const shields = shipShields(ship)
  const crew = shipCrewSupport(ship)
  return (
    <aside className="summary panel ship-summary">
      <h2 className="summary-heading">Starship Summary</h2>
      <ShipArt src={frame ? classArt(frame.id) : era ? eraArt(era.id) : shipSummaryArt()} alt="" className="ship-summary-art" />
      <dl className="summary-group">
        <Row label="Name" value={shipDisplayName(ship)} />
        <Row label="Registry" value={shipDisplayRegistry(ship)} />
        <Row label="Class" value={frame?.name} />
        <Row label="Timeframe" value={era ? `${era.name} (${era.years})` : null} />
        <Row label="Mission Profile" value={profile?.name} />
        <Row label="Service Record" value={serviceRecordLabel(ship)} />
        <Row label="Refits" value={refitSummary(ship)} />
        <Row label="Resistance" value={resistance == null ? null : String(resistance)} />
        <Row label="Shields" value={shields == null ? null : String(shields)} />
        <Row label="Crew Support" value={crew == null ? null : String(crew)} />
      </dl>
      <dl className="summary-group">
        <div className="summary-row is-heading">
          <dt>Departments</dt>
          <dd />
        </div>
        {DEPARTMENTS.map(([key, name]) => {
          const score = departmentScore(ship, key)
          return <Row key={name} label={name} value={score == null ? null : String(score)} />
        })}
      </dl>
      <dl className="summary-group">
        <Row label="Traits" value={joined(shipTraitNames(ship))} />
        <Row label="Talents" value={joined(shipTalentNames(ship))} />
      </dl>
    </aside>
  )
}
