// Generate Card: draws a new random picture for an episode (cardArt.js) with the map's weather painted on, and saves it
// through the dev server as public/art/episodes/{map id}.png, replacing that map's previous picture. Built copies can't
// write files.
import { paintWeatherStill } from '../effects/weatherStill.js'
import { CARD_HEIGHT, CARD_WIDTH, drawEpisodeCard } from './cardArt.js'
import { biomeFor, generatorFor } from './mapGenerators.js'
import { cardSkiesFor, weatherFor } from './mapWeather.js'

export const canDrawEpisodeArt = import.meta.env.DEV
// The width (px) the weather is painted at before shrinking onto the card.
const STILL_WEATHER_WIDTH = 400

function toPngBase64(data, weatherFx) {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT
  const ctx = canvas.getContext('2d')
  ctx.putImageData(new ImageData(new Uint8ClampedArray(data), CARD_WIDTH, CARD_HEIGHT), 0, 0)
  if (weatherFx) {
    // A still needs bolder particles than the moving overlay to read at card size.
    const scale = CARD_WIDTH / STILL_WEATHER_WIDTH
    ctx.save()
    ctx.scale(scale, scale)
    paintWeatherStill(ctx, weatherFx, STILL_WEATHER_WIDTH, CARD_HEIGHT / scale)
    ctx.restore()
  }
  return canvas.toDataURL('image/png').slice('data:image/png;base64,'.length)
}

// id: the map's file id, which names the picture. Returns the card value to store on the map: the picture's path, with
// a version so the browser shows the new picture instead of a cached old one.
export async function generateEpisodeArt(map, id, random = Math.random) {
  const data = drawEpisodeCard(generatorFor(map.mapType).id, biomeFor(map.biome).card, random, map.name, cardSkiesFor(map.weather))
  await callEndpoint('PUT', { id, png: toPngBase64(data, weatherFor(map.weather).fx) })
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
