// Generate Card: draws a new random picture for an episode (cardArt.js) and saves it through the dev server as
// public/art/episodes/{map id}.png, replacing that map's previous picture. Built copies can't write files.
import { CARD_HEIGHT, CARD_WIDTH, drawEpisodeCard } from './cardArt.js'
import { biomeFor, generatorFor } from './mapGenerators.js'

export const canDrawEpisodeArt = import.meta.env.DEV

function toPngBase64(data) {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), CARD_WIDTH, CARD_HEIGHT), 0, 0)
  return canvas.toDataURL('image/png').slice('data:image/png;base64,'.length)
}

// id: the map's file id, which names the picture. Returns the card value to store on the map: the picture's path, with
// a version so the browser shows the new picture instead of a cached old one.
export async function generateEpisodeArt(map, id, random = Math.random) {
  const data = drawEpisodeCard(generatorFor(map.mapType).id, biomeFor(map.biome).card, random, map.name)
  await callEndpoint('PUT', { id, png: toPngBase64(data) })
  return `/art/episodes/${encodeURIComponent(id)}.png?v=${Date.now()}`
}

// Removes the picture Generate Card drew for map id (when Generate Map rebuilds that map under a new name).
export const removeEpisodeArt = (id) => callEndpoint('DELETE', { id })

async function callEndpoint(method, body) {
  const response = await fetch('/__episodeArt', {
    method,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await response.json()
  if (!response.ok || result?.error) throw new Error(result?.error ?? `${response.status} ${response.statusText}`)
  return result
}
