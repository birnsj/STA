// What the editor's Properties panel can show: an Assets catalogue tool, or something selected on the board.
// Lives outside the components so they can share it without breaking fast refresh.

// Help text for the marker tools (shown in Selection when one is the active tool).
export const MARKER_HELP = {
  playerStarts: 'Click a floor tile to place or remove a player start.',
  enemySpawns: 'Click a floor tile to place or remove an enemy spawn.',
  npcs: 'Click a floor tile to place an NPC, or click an NPC to edit it in Selection.',
  area: 'Click a floor tile to set or clear a room label.',
  erase: 'Click a tile to erase markers on it.',
}

// The active tool as { kind, id }, or null when it is not an Assets selection.
export function parseTool(tool) {
  if (!tool) return null
  if (tool.startsWith('tile:')) return { kind: 'tile', id: tool.slice('tile:'.length) }
  if (tool.startsWith('destructible:')) return { kind: 'destructible', id: tool.slice('destructible:'.length) }
  if (tool.startsWith('inventory:')) return { kind: 'item', id: tool.slice('inventory:'.length) }
  if (tool.startsWith('hazard:')) return { kind: 'hazard', id: tool.slice('hazard:'.length) }
  if (tool === 'hazardErase') return { kind: 'hazardErase' }
  if (MARKER_HELP[tool]) return { kind: 'marker', id: tool }
  return null
}

export const hasAssetSelection = (tool) => Boolean(parseTool(tool))

export function hasBoardSelection(selection) {
  return Boolean(
    selection?.npc ||
      selection?.object ||
      selection?.marker ||
      selection?.destructible ||
      selection?.hazard ||
      selection?.groundItem,
  )
}
