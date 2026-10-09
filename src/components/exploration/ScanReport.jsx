// The latest Scan's report (partyScan.js lastScan), shown until closed or faded: location and environment from every
// scan, life signs and enemies only from a successful one.
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`

function lightText(light) {
  if (light >= 100) return 'Full'
  if (light <= 0) return 'Dark'
  return `${light}%`
}

export default function ScanReport({ scan, scannerName, faded = false, onClose }) {
  const { location } = scan
  const rows = [
    ['Location', `${location.mapName} (${location.locationType})`],
    ...(location.area ? [['Area', location.area]] : []),
    ...(location.biome ? [['Terrain', location.biome]] : []),
    ['Weather', location.weather ?? 'Indoors'],
    ['Light', lightText(location.light)],
    ['Conditions', location.traits.length ? location.traits.join(', ') : 'None detected'],
  ]
  const others = scan.found - scan.enemies
  const enemies = scan.enemies === 1 ? '1 enemy detected' : scan.enemies ? `${scan.enemies} enemies detected` : 'No enemies detected'
  const signs = scan.found ? `${enemies}${others ? `, ${plural(others, 'other life sign')}` : ''}` : 'No life signs'
  return (
    <section className={`explore-scan-report${scan.success ? ' is-success' : ''}${faded ? ' is-faded-out' : ''}`} role="status" aria-label="Scan report">
      <header className="explore-scan-report-header">
        <h2>{scannerName}&rsquo;s Scan</h2>
        <button type="button" className="explore-scan-report-close" onClick={onClose} aria-label="Close scan report">
          &times;
        </button>
      </header>
      <dl className="explore-scan-report-rows">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className={`explore-scan-report-signs${scan.enemies ? ' has-enemies' : ''}`}>
        {scan.success
          ? `${signs} within ${scan.radius} tiles.`
          : `Life-sign sweep failed (${scan.successes} of ${scan.difficulty} successes): no readings.`}
      </p>
      {scan.enemyContacts?.length > 0 && (
        <ul className="explore-scan-report-contacts">
          {scan.enemyContacts.map((contact, index) => (
            <li key={index}>
              <span>Enemy</span>
              <span>
                {contact.direction}, {plural(contact.distance, 'tile')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
