import { useContext } from 'react'
import { CharacterContext } from './characterContext.js'

// The shared character state and its dispatch, for any screen or component inside CharacterProvider.
export function useCharacter() {
  const context = useContext(CharacterContext)
  if (!context) {
    throw new Error('useCharacter must be used inside a CharacterProvider')
  }
  return context
}
