// Personal condition: the authoritative Stress / Injury / Defeated state of a character (STA 2E personal conflict).
// One plain object per character, kept with the character in the world (party member or NPC: entity.condition) and
// carried by the same character through a fight (combat state hands it back unchanged in shape). Pure functions; no UI,
// no AI choices (the Avoid Injury decision belongs to the player or to combat/injuryPolicy.js).
//
// Book (STA 2e Core):
// - p.277: a character withstands Stress up to their Fitness; species, talents and other factors may change this maximum.
//   p.278: at maximum Stress a character is Fatigued and cannot suffer more Stress; NPCs have no Stress; Notable
//   and Major NPCs spend Threat instead.
// - pp.290-292: a successful Attack inflicts an Injury (Stun or Deadly) with a severity; 2 Momentum adds 1 severity
//   (Repeatable, at most +2; p.242 Intense: 1 Momentum per point). Protection reduces the severity, to a minimum of 1.
//   Suffering an Injury makes the character Defeated: they fall prone and cannot act.
//   A Minor NPC suffers no Injuries: any successful attack Defeats it, and it cannot Avoid Injury.
// - p.292: Avoid Injury: suffer Stress equal to the severity to ignore the Injury (and the Defeat it would cause).
//   A Stun Injury only lasts while Defeated: once no longer Defeated, it is removed at the end of the character's next
//   turn. Defeated with one or more Deadly Injuries = Dying (dies at the end of the scene without medical attention).
//   First Aid: Daring + Medicine, Difficulty 2 ends Defeated (the Injury stays); or Difficulty = severity treats one
//   Injury (no penalty from it any more, but still an Injury).
//
// condition: { stress, injuries: [Injury], defeated, dying, fatigued, fatiguedAttribute, complications: [Complication] }
//   plus, for a Defeated Minor NPC, unconscious (Stun hit) or dead (Deadly hit).
// Complication: { id, name, source } a lasting problem on the character (Book p.258), counted as one of their traits.
// Injury: { id, type: 'stun' | 'deadly', severity, baseSeverity, addedSeverity, protection, treated, recovering, source }
//   source: { weaponId, weaponName, attackerId, attackerName }; recovering: a Stun Injury on a character no longer
//   Defeated, removed at the end of their next turn.
import { getAttributeName, getDisciplineName } from '../character/runtimeCharacter.js'
import { getEquippedItems } from './equipment.js'

// VIDEOGAME ADAPTATION (Unified Character Architecture, Oct 2026): every character, whoever controls them, uses the main
// character rules (Stress, Avoid Injury, Fatigue). The book's streamlined NPC rules (Book p.291: 'minor' | 'notable' |
// 'major') apply only when an actor or encounter explicitly authors them for that instance: character.npcRules, set at
// runtime (authoredCharacters.js), never stored in a character record. Being AI-controlled, hostile or a Klingon never
// sets it, and a record's sourceClassification (the book stat block it came from) is metadata only.
export const npcCategoryOf = (character) => character.npcRules ?? 'main'
const CATEGORY_NAMES = { main: 'Main character', minor: 'Minor NPC', notable: 'Notable NPC', major: 'Major NPC' }
export const npcCategoryName = (character) => CATEGORY_NAMES[npcCategoryOf(character)]
const hasStress = (character) => npcCategoryOf(character) === 'main'

export const createCondition = () => ({ stress: 0, injuries: [], defeated: false, dying: false, fatigued: false, fatiguedAttribute: null, complications: [] })

const isDeadly = (injury) => injury.type === 'deadly'
const withDying = (condition) => ({ ...condition, dying: condition.defeated && condition.injuries.some(isDeadly) })

// A condition from anywhere (null for someone never hurt). Older saved conditions ({ status, hits, injury }) map to
// Defeated / their one Injury; Hits are dropped (no longer a rule).
export function normalizeCondition(condition) {
  if (!condition) return createCondition()
  const legacyInjury = condition.injury
    ? [{ id: 'legacy', type: condition.injury.injuryMode, severity: condition.injury.severity ?? 1, baseSeverity: condition.injury.severity ?? 1, addedSeverity: 0, protection: 0, treated: Boolean(condition.injury.treated), recovering: false, source: { weaponId: condition.injury.weaponId } }]
    : []
  return withDying({
    stress: condition.stress ?? 0,
    injuries: condition.injuries ?? legacyInjury,
    defeated: condition.defeated ?? (condition.status ? condition.status !== 'active' : false),
    dying: false,
    fatigued: Boolean(condition.fatigued),
    fatiguedAttribute: condition.fatiguedAttribute ?? null,
    complications: condition.complications ?? [],
    ...(condition.defeatedBy ? { defeatedBy: condition.defeatedBy } : {}),
    ...(condition.unconscious ? { unconscious: true } : {}),
    ...(condition.dead ? { dead: true } : {}),
  })
}

export const isDefeated = (condition) => Boolean(condition?.defeated)
export const isDying = (condition) => Boolean(condition?.defeated && condition.injuries.some(isDeadly))

// ---------- Stress ----------

// Maximum Stress and where it comes from: { value, lines: [{ label, change }] }. 0 for NPCs (no Stress).
// Structured effects only: the species ability's { type: 'stress', maxStressAttribute } (Vulcan Mental Discipline: Control
// instead of Fitness) and talents' { type: 'maxStress', amount | amountFrom: { department | attribute } } (Tough, Resolute).
// The attribute maximum Stress is based on: Fitness (Book p.277), unless a structured effect
// { type: 'stress', maxStressAttribute } on the species ability or a talent names another. { attributeId, sourceName }.
export function getStressBaseAttribute(character) {
  const sources = [
    ...(character.speciesAbility ? [character.speciesAbility] : []),
    ...character.talents,
  ]
  for (const source of sources) {
    const override = (source.effects ?? []).find((effect) => effect.type === 'stress' && effect.maxStressAttribute)
    if (override) return { attributeId: override.maxStressAttribute, sourceName: source.name }
  }
  return { attributeId: 'fitness', sourceName: null }
}

export function getMaxStress(character) {
  if (!hasStress(character)) return { value: 0, lines: [{ label: `${npcCategoryName(character)}: no Stress`, change: 0 }] }
  const { attributeId, sourceName } = getStressBaseAttribute(character)
  const lines = [{ label: `${getAttributeName(attributeId)}${sourceName ? ` (${sourceName})` : ''}`, change: character.attributes[attributeId] ?? 0 }]
  character.talents.forEach((talent) => {
    talent.effects
      .filter((effect) => effect.type === 'maxStress')
      .forEach((effect) => {
        const from = effect.amountFrom
        const amount = typeof effect.amount === 'number' ? effect.amount : from?.department ? character.disciplines[from.department] : from?.attribute ? character.attributes[from.attribute] : 0
        const source = from?.department ? ` (${getDisciplineName(from.department)})` : from?.attribute ? ` (${getAttributeName(from.attribute)})` : ''
        if (amount) lines.push({ label: `${talent.name}${source}`, change: amount })
      })
  })
  return { value: lines.reduce((total, line) => total + line.change, 0), lines }
}

export const remainingStress = (character, condition) => Math.max(0, getMaxStress(character).value - condition.stress)
// Book p.278: at maximum Stress the character is Fatigued: they cannot suffer more Stress, every task is +1 Difficulty,
// and one attribute they choose is shut down (its tasks automatically fail; rules/taskPreparation.js). condition.fatigued
// is set when Stress reaches the maximum; fatiguedAttribute stays null until the choice is made.
export const isFatigued = (condition) => Boolean(condition?.fatigued)
export const needsFatigueAttribute = (condition) => isFatigued(condition) && !condition.fatiguedAttribute
export const FATIGUE_ATTRIBUTES = ['control', 'daring', 'fitness', 'insight', 'presence', 'reason']
export const chooseFatiguedAttribute = (condition, attributeId) =>
  isFatigued(condition) && FATIGUE_ATTRIBUTES.includes(attributeId) ? { ...condition, fatiguedAttribute: attributeId } : condition

// Book p.277: if the character can't endure the whole amount without going over the maximum, they suffer what they can
// (filling the track) and suffer a complication. Returns { condition, taken, overflow, complication, becameFatigued }.
// Prototype: the complication is a placeholder named trait on the character (STRESS_COMPLICATION); no authored rule
// gives it an effect yet.
export const STRESS_COMPLICATION = 'Overstrained'
export function sufferStress(character, condition, amount, { id, source } = {}) {
  const max = getMaxStress(character).value
  const taken = Math.max(0, Math.min(amount, max - condition.stress))
  const overflow = amount - taken
  const stress = condition.stress + taken
  const complication = overflow > 0 ? { id: id ?? `stress-${condition.complications?.length ?? 0}`, name: STRESS_COMPLICATION, source: source ?? null } : null
  const becameFatigued = !condition.fatigued && stress >= max
  return {
    condition: {
      ...condition,
      stress,
      fatigued: condition.fatigued || stress >= max,
      complications: complication ? [...(condition.complications ?? []), complication] : condition.complications ?? [],
    },
    taken,
    overflow,
    complication,
    becameFatigued,
  }
}

// Recovering Stress (Book p.278: Momentum, rest, an ally's help). Once below the maximum the character is no longer
// Fatigued and the shut-down attribute is released. Prototype: nothing in play recovers Stress yet; this is the hook.
export function recoverStress(character, condition, amount) {
  const stress = Math.max(0, condition.stress - amount)
  const stillFatigued = condition.fatigued && stress >= getMaxStress(character).value
  return { ...condition, stress, fatigued: stillFatigued, fatiguedAttribute: stillFatigued ? condition.fatiguedAttribute : null }
}

// ---------- Protection and severity ----------

// Protection against an Injury of this type: { value, lines }. Sources (authored data only): worn equipment
// (stats.protection; Book p.244: one form of protective gear at a time, so the best counts), and structured talent /
// species effects { type: 'protection', amount, against?, when? } (Klingon Brak'lul: +1, stacking with armour).
// Prototype: a 'when' other than "in Cover" and a 'target' of allies (Get Down!) are not applied to others yet.
export function getProtection(character, { injuryType, inCover = false } = {}) {
  const lines = []
  const gear = Math.max(0, ...getEquippedItems(character).map((item) => item.stats?.protection ?? 0))
  if (gear) lines.push({ label: 'Protective gear', change: gear })
  const applies = (effect) => (!effect.against || effect.against.includes(injuryType)) && (!effect.when || (effect.when === 'in Cover' && inCover))
  const sources = [
    ...character.talents.map((talent) => ({ name: talent.name, effects: talent.effects })),
    ...(character.speciesAbility ? [{ name: character.speciesAbility.name, effects: character.speciesAbility.effects }] : []),
  ]
  sources.forEach(({ name, effects }) => {
    effects.filter((effect) => effect.type === 'protection' && typeof effect.amount === 'number' && applies(effect)).forEach((effect) => lines.push({ label: name, change: effect.amount }))
  })
  return { value: lines.reduce((total, line) => total + line.change, 0), lines }
}

// Book p.292: 2 Momentum per +1 severity, at most +2 (p.242 Intense: 1 Momentum per point).
export const MAX_ADDED_SEVERITY = 2
export const addedSeverityCost = (weapon) => (weapon.qualities?.some((quality) => quality.toLowerCase() === 'intense') ? 1 : 2)

// The Injury a successful attack would inflict: weapon severity + the attacker's talents ([{ label, change }]) + Momentum
// added, less Protection (minimum 1).
export function buildInjury({ id, type, weapon, attacker, addedSeverity = 0, protection, talentSeverity = [] }) {
  const added = Math.min(MAX_ADDED_SEVERITY, Math.max(0, addedSeverity))
  const baseSeverity = weapon.severity
  const fromTalents = talentSeverity.reduce((total, line) => total + line.change, 0)
  return {
    id,
    type,
    baseSeverity,
    talentSeverity,
    addedSeverity: added,
    protection: protection.value,
    severity: Math.max(1, baseSeverity + fromTalents + added - protection.value),
    treated: false,
    recovering: false,
    source: { weaponId: weapon.id, weaponName: weapon.name, attackerId: attacker?.id ?? null, attackerName: attacker?.character.name ?? null },
  }
}

// ---------- Avoid Injury ----------

// Whether this character could Avoid this Injury, and what it costs: { possible, kind: 'stress' | 'threat' | null, cost,
// reason }; a Stress avoid also gives { taken, overflow } (overflow > 0: the track fills and a complication follows,
// Book p.277). scene: { threat (the Threat pool), avoidedThisScene (character ids of Notable NPCs that already avoided once) }.
export function getAvoidOption(character, condition, injury, { threat = 0, avoidedThisScene = [] } = {}) {
  const category = npcCategoryOf(character)
  const cost = injury.severity
  if (category === 'minor') return { possible: false, kind: null, cost, reason: 'Minor NPC: cannot Avoid; any successful attack Defeats it (Book p.291).' }
  if (category === 'notable' || category === 'major') {
    if (category === 'notable' && avoidedThisScene.includes(character.id)) return { possible: false, kind: 'threat', cost, reason: 'A Notable NPC avoids an Injury once per scene.' }
    if (threat < cost) return { possible: false, kind: 'threat', cost, reason: `Needs ${cost} Threat (pool ${threat}).` }
    return { possible: true, kind: 'threat', cost, reason: null }
  }
  if (isFatigued(condition)) return { possible: false, kind: 'stress', cost, reason: 'Fatigued: cannot suffer more Stress (Book p.278).' }
  const room = Math.max(0, getMaxStress(character).value - condition.stress)
  return { possible: true, kind: 'stress', cost, taken: Math.min(cost, room), overflow: Math.max(0, cost - room), reason: null }
}

// The character takes the Stress instead of the Injury (a Threat-paid avoid leaves the condition as it is).
// Returns sufferStress's { condition, taken, overflow, complication, becameFatigued }.
export function avoidInjury(character, condition, injury, kind = 'stress') {
  if (kind !== 'stress') return { condition, taken: 0, overflow: 0, complication: null, becameFatigued: false }
  return sufferStress(character, condition, injury.severity, { id: `${injury.id}-complication`, source: injury.source })
}

// The character suffers the Injury and is Defeated.
export const sufferInjury = (condition, injury) => withDying({ ...condition, injuries: [...condition.injuries, injury], defeated: true })

// Book p.291: a Minor NPC suffers no Injury; the hit simply Defeats it. Prototype (designer decision, Oct 2026): a Stun
// hit leaves it unconscious, a Deadly hit kills it. defeatedBy keeps what did it.
export const defeatOutright = (condition, injury) => ({
  ...condition,
  defeated: true,
  defeatedBy: { type: injury.type, source: injury.source },
  ...(injury.type === 'deadly' ? { dead: true } : { unconscious: true }),
})
export const isDead = (condition) => Boolean(condition?.dead)
// "Unconscious" / "Dead" for a Defeated Minor NPC, else null.
export const minorDefeatText = (condition) => (condition?.dead ? 'Dead' : condition?.unconscious ? 'Unconscious' : null)

// The condition change a hit that isn't avoided causes: an Injury for most, an outright Defeat for a Minor NPC.
export const takeHit = (character, condition, injury) => (npcCategoryOf(character) === 'minor' ? defeatOutright(condition, injury) : sufferInjury(condition, injury))

// ---------- recovery ----------

// First Aid revive: no longer Defeated. Stun Injuries start wearing off (gone at the end of the next turn); Deadly stay.
export const reviveCondition = ({ defeatedBy: _defeatedBy, unconscious: _unconscious, ...condition }) =>
  withDying({ ...condition, defeated: false, injuries: condition.injuries.map((injury) => (injury.type === 'stun' ? { ...injury, recovering: true } : injury)) })

// First Aid treat: one Injury treated (still an Injury).
export const treatInjury = (condition, injuryId) => ({ ...condition, injuries: condition.injuries.map((injury) => (injury.id === injuryId ? { ...injury, treated: true } : injury)) })

// End of this character's turn: Stun Injuries wearing off are removed. Returns { condition, removed: [Injury] }.
export function endOfTurnCondition(condition) {
  const removed = condition.injuries.filter((injury) => injury.type === 'stun' && injury.recovering && !condition.defeated)
  if (!removed.length) return { condition, removed }
  return { condition: withDying({ ...condition, injuries: condition.injuries.filter((injury) => !removed.includes(injury)) }), removed }
}

// Hook (Book p.292), not applied yet: a Dying character whose Deadly Injuries have had no medical attention dies at the
// end of the scene. Prototype: a treated Deadly Injury counts as medical attention; nobody is killed automatically.
export const wouldDieAtSceneEnd = (condition) => isDying(condition) && condition.injuries.some((injury) => isDeadly(injury) && !injury.treated)

// ---------- text ----------

export const injuryTypeName = (type) => (type === 'deadly' ? 'Deadly' : 'Stun')
export const injuryText = (injury) =>
  `${injuryTypeName(injury.type)} Injury, Severity ${injury.severity}${injury.treated ? ', treated' : ''}${injury.recovering ? ', wearing off' : ''}`

// "Fatigued (Control shut down)" / "Fatigued (attribute not chosen)".
export const fatigueText = (condition) =>
  `Fatigued (${condition.fatiguedAttribute ? `${getAttributeName(condition.fatiguedAttribute)} shut down` : 'attribute not chosen'})`

// "Stress 4/9", plus Fatigued, complications, Defeated / Dying, for logs and panels.
// stress: false leaves out Stress and Fatigue (an enemy the party hasn't scanned).
export function conditionSummary(character, condition, { stress = true } = {}) {
  const parts = []
  if (stress && hasStress(character)) parts.push(`Stress ${condition.stress}/${getMaxStress(character).value}`)
  if (stress && condition.fatigued) parts.push(fatigueText(condition))
  if (condition.complications?.length) parts.push(condition.complications.map((complication) => `Complication: ${complication.name}`).join('; '))
  if (condition.injuries.length) parts.push(condition.injuries.map(injuryText).join('; '))
  if (condition.defeated) parts.push(isDying(condition) ? 'Defeated, Dying' : minorDefeatText(condition) ? `Defeated (${minorDefeatText(condition)})` : 'Defeated')
  return parts.join(' - ') || 'Unhurt'
}
