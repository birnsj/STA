import { useEffect, useState } from 'react'
import { getIdleFidgets, getSpriteAnimation } from '../../rules/appearance.js'

// Page-wide, so a fidget's playKey never repeats (CharacterSprite times a one-shot by seed, name and playKey).
let playCount = 0

// Sheet URLs known to have loaded, or failed (true / false).
const sheetLoads = new Map()

// Whether the idle sheet has really loaded: a figure switched to a sheet that is missing or still loading would vanish.
function useSheetLoaded(url) {
  const [, setLoaded] = useState(null)
  useEffect(() => {
    if (!url || sheetLoads.has(url) || typeof Image === 'undefined') return undefined
    let live = true
    const image = new Image()
    image.onload = () => {
      sheetLoads.set(url, true)
      if (live) setLoaded(url)
    }
    image.onerror = () => sheetLoads.set(url, false)
    image.src = url
    return () => {
      live = false
    }
  }, [url])
  return Boolean(url) && sheetLoads.get(url) === true
}

// While enabled (a figure standing still) and its idle sheet (sheetUrl) has loaded, now and then one of
// characterSprites.json's idleFidgets picked at random, never the same twice running: { name, playKey } while it
// plays, else null.
export default function useIdleFidget(enabled, sheetUrl) {
  const ready = useSheetLoaded(enabled ? sheetUrl : null)
  const active = enabled && ready
  const [fidget, setFidget] = useState(null)
  useEffect(() => {
    if (!active) return undefined
    const { animations, gapSeconds: [minGap, maxGap] } = getIdleFidgets()
    let timer = null
    let last = null
    const wait = () => {
      timer = setTimeout(play, (minGap + Math.random() * (maxGap - minGap)) * 1000)
    }
    const play = () => {
      const choices = animations.filter((name) => name !== last)
      last = choices[Math.floor(Math.random() * choices.length)]
      playCount += 1
      setFidget({ name: last, playKey: playCount })
      timer = setTimeout(() => {
        setFidget(null)
        wait()
      }, getSpriteAnimation(last).seconds * 1000)
    }
    wait()
    return () => {
      clearTimeout(timer)
      setFidget(null)
    }
  }, [active])
  return active ? fidget : null
}
