import names from '../data/adaptation/names.json'

export const NAME_GROUPS = [
  { id: 'male', label: 'Random Male Name' },
  { id: 'female', label: 'Random Female Name' },
  { id: 'any', label: 'Random Name' },
]

const pick = (list, random) => list[Math.floor(random() * list.length)]

const firstNamesFor = (groupId) => (groupId === 'any' ? [...names.male, ...names.female] : names[groupId] ?? [])

// Prototype: a first name from the chosen group plus any surname. Rerolls so pressing again always changes the name.
// random can be a seeded generator so reducer code stays repeatable.
export function randomName(groupId, currentName = '', random = Math.random) {
  const firstNames = firstNamesFor(groupId)
  if (!firstNames.length) return currentName
  let name
  do {
    name = `${pick(firstNames, random)} ${pick(names.surnames, random)}`
  } while (name === currentName.trim())
  return name
}

// Prototype: Auto/Autofill names follow the gender's name list; other genders draw from both lists.
export const nameGroupForGender = (genderId) => (genderId === 'male' || genderId === 'female' ? genderId : 'any')
