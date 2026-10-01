// Unmet sections are flagged by their pulsing heading (see styles.css), so only the met state renders here.
export default function RequirementTag({ met }) {
  if (!met) return null
  return (
    <span className="requirement-tag is-met" aria-label="Complete">
      ✓
    </span>
  )
}
