// Small portrait for combat panels; falls back to the character's initial when there is no art.
export default function CombatPortrait({ character, className = '' }) {
  const image = character.portrait.image
  return (
    <span className={`combat-portrait ${className}`}>
      {image ? <img src={image} alt="" draggable={false} /> : <span className="combat-portrait-initial">{character.name.charAt(0)}</span>}
    </span>
  )
}
