import { useCharacter } from '../character/CharacterContext.jsx'

// Temporary: speeds up testing by completing every unfinished choice on the built screens.
export default function AutofillButton() {
  const { dispatch } = useCharacter()
  return (
    <button type="button" className="dev-button" onClick={() => dispatch({ type: 'autofill' })}>
      Autofill (dev)
    </button>
  )
}
