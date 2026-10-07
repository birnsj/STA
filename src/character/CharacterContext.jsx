import { useEffect, useReducer } from 'react'
import { CharacterContext } from './characterContext.js'
import { creatorReducer, createRestoredState } from './characterReducer.js'
import { loadCharacter, saveCharacter } from './persistence.js'

// A restored character that fails to load (e.g. data the rules can't read) falls back to a fresh one.
function restoreState() {
  try {
    return createRestoredState(loadCharacter())
  } catch {
    return createRestoredState(null)
  }
}

export function CharacterProvider({ children }) {
  const [state, dispatch] = useReducer(creatorReducer, undefined, restoreState)

  // Only the character is saved; the per-card choice memory is creator UI state.
  useEffect(() => saveCharacter(state.character), [state.character])

  return (
    <CharacterContext.Provider value={{ character: state.character, dispatch }}>
      {children}
    </CharacterContext.Provider>
  )
}
