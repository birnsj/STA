// Presentation timing shared by combat rules and the React/Pixi view. Keeping this leaf free of combat state prevents
// rule actions from importing the UI's broad battle helper module.
export const SHOT_FIRE_MS = 220
const PULSE_TRAVEL_MS = 280
const ENEMY_PULSE = '#ff2e1f'

export function weaponShotLook(attackerSide, weapon, { injuryMode = null, missed = false } = {}) {
  const enemyRanged = attackerSide === 'enemy' && weapon.type === 'ranged'
  const mode = injuryMode ?? weapon.injuryModes[0]
  const colour = enemyRanged ? ENEMY_PULSE : (weapon.beamColors?.[mode] ?? weapon.beamColor ?? null)
  const pulse = Boolean(colour) && (enemyRanged || weapon.shotStyle === 'pulse')
  return {
    weapon,
    injuryMode: mode,
    colour,
    pulse,
    missed,
    sound: enemyRanged ? 'disruptor' : (weapon.attackSound ?? null),
    impactMs: SHOT_FIRE_MS + (pulse ? PULSE_TRAVEL_MS : 0),
  }
}

// Beams hold on screen before the object impact; pulses apply when they arrive.
export const objectShotImpactMs = (weapon, side = 'player') => {
  const look = weaponShotLook(side, weapon)
  return look.pulse ? look.impactMs : SHOT_FIRE_MS + 450
}
