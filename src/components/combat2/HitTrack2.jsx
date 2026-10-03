// Captain's Log hit track (p.204): boxes instead of HP; the last box means injured / defeated.
export default function HitTrack2({ hits, max, label = 'Hits' }) {
  return (
    <span className="c2-hit-track" aria-label={`${label} ${hits} of ${max}`}>
      {label && <span className="c2-hit-track-label">{label}</span>}
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`c2-hit-box${i < hits ? ' is-marked' : ''}`} />
      ))}
    </span>
  )
}
