import { useUniformImage } from '../useUniformImage.js'

// Small portrait for combat panels; falls back to the character's initial when there is no art.
export default function CombatPortrait({ character, className = '', style }) {
  const image = character.portrait.image
  const shown = useUniformImage(image, character.portrait.imageUniform, character.portrait.backdrop)
  return (
    <span className={`combat-portrait ${className}`} style={style}>
      {image ? shown && <img src={shown} alt="" draggable={false} /> : <span className="combat-portrait-initial">{character.name.charAt(0)}</span>}
    </span>
  )
}
