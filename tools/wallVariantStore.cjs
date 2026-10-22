const fs = require('fs')
const { writeFileAtomic } = require('./atomicWrite.cjs')

// Dev Generator Editor: writes one wall's Generate Map variant set into generatedWallVariants.json (/__wall-variants).

function cleanList(list) {
  if (!Array.isArray(list)) return []
  const out = []
  for (const id of list) {
    if (typeof id !== 'string' || !id.trim()) continue
    const trimmed = id.trim()
    if (out.includes(trimmed)) continue
    out.push(trimmed)
  }
  return out
}

function putWallVariantSet(file, change) {
  if (change == null || typeof change !== 'object') throw new Error('body required')
  const wallId = change.wallId ?? change.id
  if (typeof wallId !== 'string' || !wallId.trim()) throw new Error('wallId is required')

  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!data.walls || typeof data.walls !== 'object') data.walls = {}

  const panelVariants = cleanList(change.panelVariants)
  const tileVariants = cleanList(change.tileVariants)
  let share = Number(change.share)
  if (!Number.isFinite(share)) share = data.walls[wallId]?.share ?? 0.4
  share = Math.min(1, Math.max(0, Math.round(share * 100) / 100))

  if (!panelVariants.length && !tileVariants.length) {
    delete data.walls[wallId]
    writeFileAtomic(file, `${JSON.stringify(data, null, 2)}\n`)
    return { wallId, share: 0, panelVariants: [], tileVariants: [], cleared: true }
  }

  data.walls[wallId] = { share, panelVariants, tileVariants }
  writeFileAtomic(file, `${JSON.stringify(data, null, 2)}\n`)
  return { wallId, share, panelVariants, tileVariants }
}

module.exports = { putWallVariantSet }
