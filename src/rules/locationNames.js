import episodes from '../data/adaptation/maps/episodeNames.json'
import data from '../data/adaptation/maps/locationNames.json'

// Never returns the current name, so pressing Generate again always changes it.
function pickOther(names, currentName, random) {
  const choices = names.filter((name) => name !== currentName.trim())
  if (!choices.length) return currentName
  return choices[Math.floor(random() * choices.length)]
}

// Prototype: a name from the chosen category.
export function randomLocationName(categoryId, currentName = '', random = Math.random) {
  return pickOther(data.categories.find((category) => category.id === categoryId)?.names ?? [], currentName, random)
}

// Prototype: a name from the chosen category that isTaken(name) rejects for none; numbered once every name is taken.
export function randomUnusedLocationName(categoryId, isTaken, random = Math.random) {
  const names = data.categories.find((category) => category.id === categoryId)?.names ?? ['Untitled Map']
  const free = names.filter((name) => !isTaken(name))
  if (free.length) return free[Math.floor(random() * free.length)]
  const base = names[Math.floor(random() * names.length)]
  let number = 2
  while (isTaken(`${base} ${number}`)) number++
  return `${base} ${number}`
}

// Prototype: an episode title.
export const randomEpisodeName = (currentName = '', random = Math.random) => pickOther(episodes.names, currentName, random)
