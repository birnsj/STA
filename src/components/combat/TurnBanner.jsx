// A short banner when control changes hands. It fades out by itself (CSS) and never takes clicks; remount it with a
// new key to show it again.
export default function TurnBanner({ title, subtitle, side }) {
  return (
    <div className={`combat-turn-banner is-${side}`} aria-live="polite">
      {subtitle && <span className="combat-turn-banner-subtitle">{subtitle}</span>}
      <span className="combat-turn-banner-title">{title}</span>
    </div>
  )
}
