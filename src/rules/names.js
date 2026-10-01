import names from '../data/adaptation/names.json'

export const NAME_GROUPS = [
  { id: 'male', label: 'Random Male Name' },
  { id: 'female', label: 'Random Female Name' },
]

const pick = (list) => list[Math.floor(Math.random() * list.length)]

// Prototype: a first name from the chosen group plus any surname. Rerolls so pressing again always changes the name.
export function randomName(groupId, currentName = '') {
  const firstNames = names[groupId] ?? []
  if (!firstNames.length) return currentName
  let name
  do {
    name = `${pick(firstNames)} ${pick(names.surnames)}`
  } while (name === currentName.trim())
  return name
}
