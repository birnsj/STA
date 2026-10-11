// objectives: [{ id, text, complete (optional: this one is done), pending (optional: not started yet, shown greyed) }];
// complete: every objective is done. showAll (optional; undefined hides the toggle): whether the not-started
// objectives are listed, flipped by onShowAll.
export default function ObjectivesPanel({ objectives, complete, showAll, onShowAll }) {
  return (
    <section className="combat-panel objectives-panel">
      <div className="objectives-header">
        <h2 className="combat-panel-title">Objectives</h2>
        {showAll !== undefined && (
          <button type="button" className="objectives-show-all" aria-pressed={showAll} onClick={onShowAll}>
            {showAll ? 'Hide upcoming' : 'Show all'}
          </button>
        )}
      </div>
      <ul className="objectives-list">
        {objectives.map((objective) => (
          <li key={objective.id} className={`objectives-item${complete || objective.complete ? ' is-complete' : objective.pending ? ' is-pending' : ''}`}>
            <span className="objectives-box" aria-hidden="true" />
            {objective.text}
          </li>
        ))}
      </ul>
    </section>
  )
}
