// Inspector-only preview of a patrol waypoint idle fidget. Does not write map data.
import { useEffect, useRef, useState } from 'react'
import { getAuthoredCharacter } from '../../character/authoredCharacters.js'
import {
  directionFor,
  getSpriteAnimation,
  getSpriteSet,
  getSpriteSetById,
  spriteMaskFile,
  spriteSheetFile,
} from '../../rules/appearance.js'
import { frameColumn, startTiming } from './spriteTiming.js'
import { loadSheet } from './useRecolouredSheet.js'

export default function WaypointAnimPreview({ characterId, animation, facingDegrees = 90, playKey = 0 }) {
  const canvasRef = useRef(null)
  const [failed, setFailed] = useState(false)
  const sheetAnim = animation ? getSpriteAnimation(animation) : null
  const canPreview = Boolean(sheetAnim && characterId)

  useEffect(() => {
    if (!canPreview) return undefined
    const character = getAuthoredCharacter(characterId)
    const set = getSpriteSet(character?.portrait?.id) ?? getSpriteSetById(character?.portrait?.spriteSet)
    if (!set) {
      queueMicrotask(() => setFailed(true))
      return undefined
    }
    const file = spriteSheetFile(set, sheetAnim.sheetId)
    const mask = spriteMaskFile(set, sheetAnim.sheetId)
    const colour = character?.portrait?.uniform ?? null
    let cancelled = false
    let frameId = 0
    let started = null

    queueMicrotask(() => setFailed(false))
    loadSheet(file, mask, set.uniformDivision, colour).then((image) => {
      if (cancelled || !image) {
        if (!cancelled) setFailed(true)
        return
      }
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      const { width, height } = sheetAnim.sheet.frame
      const res = sheetAnim.sheet.resolution ?? 1
      canvas.width = width
      canvas.height = height
      const facing = directionFor({
        x: Math.cos((facingDegrees * Math.PI) / 180),
        y: Math.sin((facingDegrees * Math.PI) / 180),
      })
      const row = Math.max(0, facing.row)
      const mirror = Boolean(facing.mirror)
      const timing = { seed: characterId, playKey: `preview-${playKey}`, settled: false, reverse: false, speed: 1 }

      const draw = (now) => {
        if (cancelled) return
        if (!started) started = startTiming(sheetAnim, timing, now)
        const col = frameColumn(sheetAnim, started, timing, now)
        ctx.clearRect(0, 0, width, height)
        ctx.save()
        if (mirror) {
          ctx.translate(width, 0)
          ctx.scale(-1, 1)
        }
        ctx.drawImage(image, col * width * res, row * height * res, width * res, height * res, 0, 0, width, height)
        ctx.restore()
        frameId = requestAnimationFrame(draw)
      }
      frameId = requestAnimationFrame(draw)
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(frameId)
    }
  }, [characterId, animation, facingDegrees, playKey, sheetAnim, canPreview])

  if (!animation) return null
  if (!canPreview || failed) {
    return <p className="me-text">Preview unavailable (no sprite or sheet failed to load).</p>
  }
  return (
    <div className="me-waypoint-preview" aria-label={`Preview ${animation}`}>
      <canvas ref={canvasRef} width={40} height={64} />
    </div>
  )
}
