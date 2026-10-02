import names from '../data/adaptation/names.json'

export const NAME_GROUPS = [
  { id: 'male', label: 'Random Male Name' },
  { id: 'female', label: 'Random Female Name' },
  { id: 'any', label: 'Random Name' },
]

const pick = (list) => list[Math.floor(Math.random() * list.length)]

const firstNamesFor = (groupId) => (groupId === 'any' ? [...names.male, ...names.female] : names[groupId] ?? [])

// Prototype: a first name from the chosen group plus any surname. Rerolls so pressing again always changes the name.
export function randomName(groupId, currentName = '') {
  const firstNames = firstNamesFor(groupId)
  if (!firstNames.length) return currentName
  let name
  do {
    name = `${pick(firstNames)} ${pick(names.surnames)}`
  } while (name === currentName.trim())
  return name
}
