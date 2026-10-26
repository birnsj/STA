import { departmentScore, getMissionProfileById, getSpaceframeById, getTimeframeById, refitSummary, serviceRecordLabel, shipDisplayName, shipDisplayRegistry, shipTraitNames } from '../../ships/shipModel.js'
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

function talentNames(frame, profile, talentId) {
  const names = []
  for (const talent of frame?.talents ?? []) {
    if (talent?.name && !names.includes(talent.name)) names.push(talent.name)
  }
  const chosen = profile?.talents.find((talent) => talent.id === talentId)
  if (chosen && !names.includes(chosen.name)) names.push(chosen.name)
  return names
}

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
  const talents = talentNames(frame, profile, ship.missionProfileTalentId)
  return (
    <aside className="summary panel ship-summary">
      <h2 className="summary-heading">Starship Summary</h2>
      <ShipArt src={frame ? `/art/ships/classes/${frame.id}.png` : '/art/ships/summary.png'} alt="" className="ship-summary-art" />
      <dl className="summary-group">
        <Row label="Name" value={shipDisplayName(ship)} />
        <Row label="Registry" value={shipDisplayRegistry(ship)} />
        <Row label="Class" value={frame?.name} />
        <Row label="Timeframe" value={era?.name} />
        <Row label="Mission Profile" value={profile?.name} />
        <Row label="Service Record" value={serviceRecordLabel(ship)} />
        <Row label="Refits" value={refitSummary(ship)} />
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
        <Row label="Talents" value={joined(talents)} />
      </dl>
    </aside>
  )
}
