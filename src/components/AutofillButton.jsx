import { useCharacter } from '../character/CharacterContext.jsx'

// Temporary: speeds up testing by replacing the character with a complete random one on every press.
export default function AutofillButton() {
  const { dispatch } = useCharacter()
  return (
    <button type="button" className="dev-button" onClick={() => dispatch({ type: 'autofill', seed: Math.random() })}>
      Autofill
    </button>
  )
}
