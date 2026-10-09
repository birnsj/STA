// Generate Card: draws a new random picture for an episode (cardArt.js) with the map's weather painted on. It is saved
// with the map (saveMap in mapFiles.js writes it as public/art/episodes/{map id}.png, replacing that map's previous
// picture), not when drawn. Built copies can't write files.
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

// Draws a new picture for the map without saving it. Returns it as a PNG data URL, which the editor keeps as the map's
// card until the map is saved (episodeCards.js isPendingArt).
export function drawEpisodeArt(map, random = Math.random) {
  const data = drawEpisodeCard(generatorFor(map.mapType).id, biomeFor(map.biome).card, random, map.name, cardSkiesFor(map.weather))
  return `data:image/png;base64,${toPngBase64(data, weatherFor(map.weather).fx)}`
}
