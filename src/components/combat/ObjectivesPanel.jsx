export default function ObjectivesPanel({ objectives, complete }) {
  return (
    <section className="combat-panel objectives-panel">
      <h2 className="combat-panel-title">Objectives</h2>
      <ul className="objectives-list">
        {objectives.map((objective) => (
          <li key={objective.id} className={`objectives-item${complete ? ' is-complete' : ''}`}>
            <span className="objectives-box" aria-hidden="true" />
            {objective.text}
          </li>
        ))}
      </ul>
    </section>
  )
}
