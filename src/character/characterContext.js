// The creator's character context object, in its own module so the provider (CharacterContext.jsx) and the hook
// (useCharacter.js) can share it without either file exporting both a component and a function (React Fast Refresh
// only reloads files that export components alone).
import { createContext } from 'react'

export const CharacterContext = createContext(null)
