// Optional animations played while an NPC waits at a patrol waypoint (idle fidgets from characterSprites.json).
// Editor listing helpers; runtime tick lives in waypointAnimRuntime.js (keeps NPCController free of character-library imports).
import { getAuthoredCharacter } from '../character/authoredCharacters.js'
import { getIdleFidgets, getSpriteAnimation, getSpriteSet, getSpriteSetById } from '../rules/appearance.js'
export { isWaypointAnimation, tickWaypointAnim } from './waypointAnimRuntime.js'

const LABELS = {
  idleLookAround: 'Look around',
  idleShiftWeight: 'Shift weight',
  idleTurn: 'Turn in place',
  idleCheckPhaser: 'Check phaser',
  idleScratchHead: 'Scratch head',
}

// Every idle fidget the sprite sheets define (the only waypoint animations the runtime supports today).
export function listWaypointAnimations() {
  return getIdleFidgets().animations.map((id) => ({
    id,
    label: LABELS[id] ?? id,
    seconds: getSpriteAnimation(id)?.seconds ?? 0,
  }))
}

// Animations available for a map NPC's character (empty when it has no map sprite set).
export function waypointAnimationsForCharacter(characterId) {
  if (!characterId) return []
  const character = getAuthoredCharacter(characterId)
  if (!character) return []
  const set = getSpriteSet(character.portrait?.id) ?? getSpriteSetById(character.portrait?.spriteSet)
  if (!set) return []
  return listWaypointAnimations().filter((entry) => Boolean(getSpriteAnimation(entry.id)))
}
