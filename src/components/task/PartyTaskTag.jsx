// On a party card while a task is being considered: this member's Target Number for it, and Best Choice when the
// recommendation (rules/taskRecommendation.js) names them. Equal best members each say so; nothing is shown otherwise.
export default function PartyTaskTag({ recommendation, memberId }) {
  const entry = recommendation?.entries[memberId]
  if (!entry) return null
  const best = recommendation.bestIds.includes(memberId)
  const tied = best && recommendation.bestIds.length > 1
  const detail = !entry.possible
    ? "Can't attempt"
    : entry.autoFail
      ? `TN ${entry.targetNumber} · auto-fails`
      : `TN ${entry.targetNumber} · D${entry.difficulty}${entry.focus ? ' · Focus' : ''}`
  const title = `${recommendation.label ?? 'This task'}: ${detail}${entry.focus ? ` (${entry.focus})` : ''}${best ? (tied ? '. Equal best choice.' : '. Best choice.') : ''}`
  return (
    <span className={`party-task-tag${best ? ' is-best' : ''}`} title={title}>
      {best && <span className="party-task-best">&#9733; {tied ? 'Equal best' : 'Best choice'}</span>}
      <span className="party-task-tn">{detail}</span>
    </span>
  )
}
