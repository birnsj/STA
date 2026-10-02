// Completed steps (other than the current one) can be clicked to jump to them.
// The first unfinished step is also reachable, since every step before it is done: e.g. Review once
// steps 1-7 are checked, or an older save that predates a newly required choice such as Gender.
export default function StepNav({ steps, currentStepId, completedStepIds, onSelectStep }) {
  const activeIndex = steps.findIndex((step) => step.id === currentStepId)
  const firstIncompleteIndex = steps.findIndex((step) => !completedStepIds.includes(step.id))
  return (
    <nav className="step-nav" aria-label="Creation progress">
      {steps.map((step, index) => {
        const isActive = index === activeIndex
        const isComplete = completedStepIds.includes(step.id)
        const isNextUnfinished = index === firstIncompleteIndex
        const isSelectable = !isActive && (isComplete || isNextUnfinished)
        const className = `step-nav-item${isActive ? ' is-active' : ''}${isSelectable && isComplete ? ' is-complete' : ''}`
        const content = (
          <>
            <span className="step-nav-number">{step.number}</span>
            <span className="step-nav-text">
              <span className="step-nav-title">{step.title}</span>
              <span className="step-nav-subtitle">{step.subtitle}</span>
            </span>
            {isSelectable && isComplete && <span className="step-nav-check" aria-label="Completed">✓</span>}
          </>
        )
        return isSelectable ? (
          <button key={step.id} type="button" className={`${className} is-selectable`} onClick={() => onSelectStep(step.id)}>
            {content}
          </button>
        ) : (
          <div key={step.id} className={className} aria-current={isActive ? 'step' : undefined}>
            {content}
          </div>
        )
      })}
    </nav>
  )
}
