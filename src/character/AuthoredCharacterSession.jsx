import { useReducer } from 'react'
import { CharacterContext } from './characterContext.js'
import { createInitialState, createRestoredState, creatorReducer } from './characterReducer.js'

/**
 * Nested CharacterProvider for Dev Edit Character Library authoring.
 * Does not touch the App menu draft (no persistence.js load/save).
 */
export function AuthoredCharacterProvider({ initialCharacter = null, children }) {
  const [state, dispatch] = useReducer(creatorReducer, undefined, () => {
    if (!initialCharacter) return createInitialState()
    try {
      return createRestoredState(initialCharacter)
    } catch {
      return createInitialState()
    }
  })

  return (
    <CharacterContext.Provider value={{ character: state.character, dispatch }}>
      {children}
    </CharacterContext.Provider>
  )
}
