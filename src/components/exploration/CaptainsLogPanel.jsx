import { stardateAt } from '../../exploration/missionLog.js'

// The Captain's Log: the map's briefing, its objectives (active and completed) and the mission log entries, newest first.
// objectives: [{ id, title, description, status: 'active' | 'complete' }], already filtered to the ones the party knows.
export default function CaptainsLogPanel({ map, time, objectives, entries, onClose }) {
  const paragraphs = (map.briefing ?? '')
    .split(/\n\s*\n/)
    .map((text) => text.trim())
    .filter(Boolean)
  const newestFirst = [...entries].reverse()

  return (
    <aside className="combat-panel captains-log" aria-label="Captain's Log">
      <header className="sheet-header">
        <div className="sheet-identity">
          <h3 className="sheet-name">Captain&apos;s Log</h3>
          <p className="sheet-subtitle">{map.episodeName || map.name}</p>
          <p className="sheet-origin">Stardate {stardateAt(map, time)}</p>
        </div>
        <button type="button" className="sheet-close" aria-label="Close Captain's Log" title="Close (L)" onClick={onClose}>
          &times;
        </button>
      </header>

      <div className="sheet-body">
        <section className="sheet-section">
          <h4 className="sheet-heading">Briefing</h4>
          {paragraphs.length ? (
            paragraphs.map((text, index) => (
              <p key={index} className="log-briefing">
                {text}
              </p>
            ))
          ) : (
            <p className="sheet-empty">No briefing.</p>
          )}
        </section>

        <section className="sheet-section">
          <h4 className="sheet-heading">Objectives</h4>
          {objectives.length ? (
            <ul className="log-objectives">
              {objectives.map((objective) => (
                <li key={objective.id} className={`log-objective is-${objective.status}`}>
                  <span className="log-objective-title">
                    <span className="log-objective-mark" aria-hidden="true">
                      {objective.status === 'complete' ? '✓' : '◇'}
                    </span>
                    {objective.title || objective.id}
                  </span>
                  {objective.description && <span className="log-objective-text">{objective.description}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="sheet-empty">No objectives yet.</p>
          )}
        </section>

        <section className="sheet-section">
          <h4 className="sheet-heading">Log</h4>
          {newestFirst.length ? (
            <ul className="log-entries">
              {newestFirst.map((entry) => (
                <li key={entry.id} className={`log-entry is-${entry.kind}`}>
                  <span className="log-entry-date">Stardate {stardateAt(map, entry.time)}</span>
                  <span className="log-entry-text">{entry.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sheet-empty">Nothing logged yet.</p>
          )}
        </section>
      </div>
    </aside>
  )
}
