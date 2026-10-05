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

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Whole words only, so a ship called Hope isn't found in "Hopeful Landing".
const mentions = (text, name) => new RegExp(`(^|\\W)${escapeRegExp(name)}(\\W|$)`).test(text)

// Titles built from the map name: about any world or ship it mentions, otherwise about the place itself. Long names like
// "Wreck of the U.S.S. Calloway" read badly inside a pattern, so a named world or ship always wins.
function mapTitles(mapName) {
  const place = mapName.trim()
  if (!place) return []
  const fill = (patterns, key, value) => patterns.map((pattern) => pattern.replace(`{${key}}`, value))
  const named = [
    ...episodes.worlds.filter((world) => mentions(place, world)).flatMap((world) => fill(episodes.mapTitles.world, 'world', world)),
    ...episodes.ships.filter((ship) => mentions(place, ship)).flatMap((ship) => fill(episodes.mapTitles.ship, 'ship', ship)),
  ]
  return named.length ? named : fill(episodes.mapTitles.place, 'place', place.replace(/^The /, 'the '))
}

// Prototype: an episode title. Sometimes (episodeNames.json mapChance) it is built from mapName instead of taken from
// the list.
export function randomEpisodeName(currentName = '', random = Math.random, mapName = '') {
  const fromMap = mapTitles(mapName)
  if (fromMap.length && random() < episodes.mapChance) {
    const title = pickOther(fromMap, currentName, random)
    if (title !== currentName) return title
  }
  return pickOther(episodes.names, currentName, random)
}
