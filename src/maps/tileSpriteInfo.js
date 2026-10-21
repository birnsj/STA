// Read-only summary of a catalogue tile's art for the editor Properties → Selection panel.
import effects from '../data/adaptation/maps/tileEffects.json'
import { imageSize, PALETTE_GROUPS } from './mapFormat.js'
import { bigFlipbook, overlayEmissive, panelFlipbook, tileActiveGlow, tileFlipbook, tileGlow } from './tileArt.js'

const fileName = (href) => {
  if (!href) return null
  const parts = String(href).split('/')
  return parts[parts.length - 1] || href
}

function paletteGroupOf(tileId) {
  for (const group of PALETTE_GROUPS) {
    if (group.tiles?.includes(tileId)) return group
  }
  return null
}

function traitList(tile) {
  const traits = []
  if (tile.solid) traits.push('Solid')
  if (tile.blocksSight) traits.push('Blocks sight')
  if (tile.cover) traits.push('Cover')
  if (tile.fade) traits.push('Fade')
  if (tile.wall) traits.push('Wall')
  if (tile.panels) traits.push(tile.windows === false ? 'Panels (no windows)' : 'Panels')
  if (tile.big) traits.push('2×2')
  if (tile.role) traits.push(`Role: ${tile.role}`)
  if (tile.windowView) traits.push(`Window: ${tile.windowView}`)
  return traits
}

function imageRows(tile) {
  const rows = []
  const push = (label, href) => {
    if (href) rows.push({ label, href, name: fileName(href) })
  }
  push('Image', tile.image)
  push('Alt', tile.altImage)
  push('Big', tile.bigImage)
  if (tile.panelImages) {
    push('Panel X', tile.panelImages.x)
    push('Panel Y', tile.panelImages.y)
  }
  if (tile.runImages) {
    push('Run X', tile.runImages.x)
    push('Run Y', tile.runImages.y)
  }
  return rows
}

function emissionHrefsOf(entry) {
  const hrefs = []
  if (entry.emission) hrefs.push({ kind: 'emission', href: entry.emission })
  if (entry.bigEmission) hrefs.push({ kind: 'bigEmission', href: entry.bigEmission })
  if (entry.panelEmission?.x) hrefs.push({ kind: 'panelEmission.x', href: entry.panelEmission.x })
  if (entry.panelEmission?.y) hrefs.push({ kind: 'panelEmission.y', href: entry.panelEmission.y })
  return hrefs
}

function animationInfo(tile) {
  const raw = effects.animations?.[tile.id]
  if (!raw) return null
  const book = tile.panels ? panelFlipbook(tile, 'x') || tileFlipbook(tile) : tileFlipbook(tile) || bigFlipbook(tile)
  const sprites = (raw.images ?? []).map((entry, index) => {
    const emissions = emissionHrefsOf(entry)
    return {
      index,
      image: fileName(entry.image),
      imageHref: entry.image ?? null,
      emission: emissions[0] ? fileName(emissions[0].href) : null,
      emissionHref: emissions[0]?.href ?? null,
      emissions: emissions.map((item) => ({ ...item, name: fileName(item.href) })),
      bigImage: fileName(entry.bigImage),
      panelX: fileName(entry.panel?.x),
      panelY: fileName(entry.panel?.y),
    }
  })
  const steps = raw.frames?.length ?? 0
  const frameTime = raw.frameTime ?? book?.frameTime ?? null
  const loop = book?.loop ?? (frameTime != null && steps ? frameTime * steps : null)
  // Prefer the panel axis the palette thumbnail uses (x); fall back to single emission / y.
  const emissions = sprites.flatMap((sprite) => {
    const preferred =
      sprite.emissions.find((item) => item.kind === 'panelEmission.x' || item.kind === 'emission') ||
      sprite.emissions.find((item) => item.kind === 'panelEmission.y') ||
      sprite.emissions[0]
    return preferred ? [{ ...preferred, frame: sprite.index }] : []
  })
  return {
    overlay: Boolean(raw.overlay),
    activeOnly: Boolean(raw.active),
    frameTime,
    steps,
    loop,
    sequence: raw.frames ?? [],
    uniqueSprites: sprites.length,
    sprites,
    emissions,
    emissive: overlayEmissive(tile.id),
  }
}

// Catalogue tile → fields useful in the editor Selection panel (presentation / authoring, not game rules).
export function tileSpriteInfo(tile) {
  if (!tile) return null
  const size = imageSize(tile)
  const group = paletteGroupOf(tile.id)
  const glow = tileGlow(tile.id)
  const activeGlow = tileActiveGlow(tile.id)
  const wallGlowColour = effects.wallGlows?.[tile.id] ?? null
  return {
    id: tile.id,
    label: tile.label,
    symbol: tile.symbol ?? null,
    group: group ? { id: group.id, label: group.label, section: group.section ?? null } : null,
    size: { width: size.width, height: size.height },
    height: tile.height ?? null,
    traits: traitList(tile),
    images: imageRows(tile),
    glow,
    wallGlow: wallGlowColour,
    activeGlow,
    animation: animationInfo(tile),
  }
}
