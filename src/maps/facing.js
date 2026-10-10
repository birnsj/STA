// Facings set in the map editor: degrees, 0 = +x, 90 = +y (clockwise on screen), in eight 45° steps.
export const FACING_STEP = 45

// The eight facings as the editor's Facing lists name them.
export const FACINGS = [
  { degrees: 0, label: '+x (east on the grid)' },
  { degrees: 45, label: '+x +y' },
  { degrees: 90, label: '+y' },
  { degrees: 135, label: '-x +y' },
  { degrees: 180, label: '-x' },
  { degrees: 225, label: '-x -y' },
  { degrees: 270, label: '-y' },
  { degrees: 315, label: '+x -y' },
]

export const snapFacing = (degrees) => (((Math.round(degrees / FACING_STEP) * FACING_STEP) % 360) + 360) % 360
// The editor's right click: the next of the eight facings clockwise.
export const nextFacing = (degrees) => snapFacing(snapFacing(degrees) + FACING_STEP)
// The grid direction Combat Type 1 stores (combatSelectors.js facing), e.g. 45 -> { x: 1, y: 1 }.
export function gridFacing(degrees) {
  const radians = (snapFacing(degrees) * Math.PI) / 180
  return { x: Math.round(Math.cos(radians)), y: Math.round(Math.sin(radians)) }
}

// A player start or enemy spawn with no facing of its own looks toward the middle of the map (as the away team and the
// fallback test NPCs always did).
export const facingTowardCentre = (map, { x, y }) => (Math.atan2((map.height - 1) / 2 - y, (map.width - 1) / 2 - x) * 180) / Math.PI
export const spawnFacing = (map, spawn) => spawn.facing ?? facingTowardCentre(map, spawn)
