// Talents that change personal combat (Book: STA 2e Core Rulebook p.157-163). Their conditions are prose in
// talents.json, so each one is applied here by talent id, at the point of the attack it changes:
// - the weapon as the character wields it (Unarmed Strike: Applied Force, Mean Right Hook, Martial Artist),
// - the attack's attribute (Applied Force), the Injury's severity (Steady Hands, Ambush Tactics),
// - attacks against the character (Defensive Training), and what an Assist adds (Call Out Targets, Pack Tactics,
//   Student of War).
// Prototype decisions (designer, Oct 2026): Applied Force uses whichever of Fitness and Daring is higher (a shut-down
// attribute never counts as higher); the Assist talents apply to the Assist action, not to a commander's Direct; Student
// of War's reroll applies to attacks (Guard rolls without a reroll step).

export const UNARMED_STRIKE_ID = 'unarmedStrike'

export const hasTalent = (character, talentId) => character.talents.some((talent) => talent.id === talentId)
const talentName = (character, talentId) => character.talents.find((talent) => talent.id === talentId)?.name ?? talentId

// ---------- the weapon as the character wields it ----------

// Book p.161 Applied Force: +1 Severity to Unarmed Attacks. p.162 Mean Right Hook: the Unarmed Strike gains Intense.
// p.162 Martial Artist: the Unarmed Strike may inflict Deadly Injuries as well as Stun.
// Returns the weapon itself when no talent changes it, else a copy with talentNotes ([{ name, note }]); one copy per
// character and weapon, so callers can compare and cache by reference.
const wielded = new WeakMap()
export function wieldWeapon(character, weapon) {
  if (!weapon || weapon.id !== UNARMED_STRIKE_ID) return weapon
  if (!wielded.has(character)) wielded.set(character, new Map())
  const cache = wielded.get(character)
  if (cache.has(weapon.id)) return cache.get(weapon.id)
  const talentNotes = []
  let result = weapon
  if (hasTalent(character, 'appliedForce')) {
    result = { ...result, severity: result.severity + 1 }
    talentNotes.push({ name: talentName(character, 'appliedForce'), note: '+1 Severity' })
  }
  if (hasTalent(character, 'meanRightHook') && !result.qualities.some((quality) => quality.toLowerCase() === 'intense')) {
    result = { ...result, qualities: [...result.qualities, 'Intense'] }
    talentNotes.push({ name: talentName(character, 'meanRightHook'), note: 'Intense' })
  }
  if (hasTalent(character, 'martialArtist') && !result.injuryModes.includes('deadly')) {
    result = { ...result, injuryModes: [...result.injuryModes, 'deadly'] }
    talentNotes.push({ name: talentName(character, 'martialArtist'), note: 'may be Deadly' })
  }
  if (talentNotes.length) result = { ...result, talentNotes }
  cache.set(weapon.id, result)
  return result
}

// ---------- the attacker's task ----------

// Book p.161 Applied Force: a Melee Attack may use Fitness instead of Daring. { attribute, effect } where effect is the
// line for the Task panel (null when the talent doesn't change the attack).
export function attackAttribute(character, weapon, attributeId, condition) {
  const none = { attribute: attributeId, effect: null }
  if (weapon.type !== 'melee' || attributeId !== 'daring' || !hasTalent(character, 'appliedForce')) return none
  const shutDown = condition?.fatigued ? condition.fatiguedAttribute : null
  const value = (id) => (id === shutDown ? -Infinity : character.attributes[id])
  if (value('fitness') <= value('daring')) return none
  return { attribute: 'fitness', effect: { source: 'Talent', name: talentName(character, 'appliedForce'), applied: true, note: 'Fitness instead of Daring' } }
}

// ---------- severity ----------

// Book p.162 Steady Hands: +1 Severity on a Ranged Attack after the Aim minor action. p.161 Ambush Tactics: +2 Severity
// on an Attack against an enemy unaware of you (the "weakness or vulnerability" trait half is not modelled yet).
// situation: { aimed, targetUnaware }. Returns [{ label, change }].
export function talentSeverityLines(character, weapon, { aimed = false, targetUnaware = false } = {}) {
  const lines = []
  if (aimed && weapon.type === 'ranged' && hasTalent(character, 'steadyHands')) lines.push({ label: talentName(character, 'steadyHands'), change: 1 })
  if (targetUnaware && hasTalent(character, 'ambushTactics')) lines.push({ label: talentName(character, 'ambushTactics'), change: 2 })
  return lines
}

// ---------- attacks against the character ----------

// Book p.161 Defensive Training: Attacks of the chosen type (Melee or Ranged, picked in the creator) against the
// character are +1 Difficulty. Returns [{ label, change }] for the attack's Difficulty lines.
export function defenceLines(target, weapon) {
  const talent = target.character.talents.find((entry) => entry.id === 'defensiveTraining')
  if (!talent || talent.choice?.id !== weapon.type) return []
  return [{ label: `${target.character.name}: ${talent.name}`, change: 1 }]
}

// ---------- assisting ----------

// What the helper's talents add to the task they Assist (Book p.157 Call Out Targets: an assisted Attack that succeeds
// generates 2 bonus Momentum; p.162 Pack Tactics: any task assisted in combat, 1 bonus Momentum on success; p.163
// Student of War: the assisted Attack may reroll one d20). kind: 'attack' | 'task'.
// Returns { bonusMomentum, rerolls, notes: [text] }.
export function assistTalents(helper, kind) {
  const { character } = helper
  const notes = []
  let bonusMomentum = 0
  let rerolls = 0
  if (kind === 'attack' && hasTalent(character, 'callOutTargets')) {
    bonusMomentum += 2
    notes.push(`${talentName(character, 'callOutTargets')}: +2 bonus Momentum on success`)
  }
  if (hasTalent(character, 'packTactics')) {
    bonusMomentum += 1
    notes.push(`${talentName(character, 'packTactics')}: +1 bonus Momentum on success`)
  }
  if (kind === 'attack' && hasTalent(character, 'studentOfWar')) {
    rerolls += 1
    notes.push(`${talentName(character, 'studentOfWar')}: may reroll one d20`)
  }
  return { bonusMomentum, rerolls, notes }
}
