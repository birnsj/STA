// Everything that decides a task before the dice: the character's Attribute + Department, the applicable focus, the
// final Difficulty and where each change comes from, equipment, and structured character effects (talents, role
// benefit, species ability) or traits that apply. Pure; the result is shown to the player as "the character math" and
// then resolved by taskResolver.js.
//
// Book (STA 2e Core p.255-256): the Difficulty assumes the character has the appropriate tools; lacking them can make
// the task harder or impossible. Which tools count, and what lacking them does, is authored per task (episode content),
// never a universal item bonus.
// Prototype: talent and role effects apply only when the authored task lists them (their conditions are prose in the
// talent data), and only for effect types the resolver supports; species ability effects apply when their own task
// tags match the task's tags. Anything else recognised is shown but not applied.
import { getAttributeName } from '../character/runtimeCharacter.js'
import { getEquippedItems } from './equipment.js'
import { buildStaTask } from './taskResolver.js'

const lower = (text) => text.toLowerCase()

// The first of the character's focuses named by the task (exact names, ignoring case; no text interpretation).
export function findTaskFocus(character, focusNames = []) {
  const wanted = focusNames.map(lower)
  return character.focuses.find((focus) => wanted.includes(lower(focus))) ?? null
}

// Dedicated Focus: a talent whose own data says "critical success at or under twice the department" for its chosen focus.
const widensCriticalRange = (talent, focus) =>
  Boolean(focus) && lower(talent.choice?.name ?? '') === lower(focus) && talent.effects.some((effect) => effect.type === 'special' && effect.action === 'doubleCriticalRange')

const matchesItem = (item, { tags = [], itemIds = [] }) => itemIds.includes(item.id) || item.tags.some((tag) => tags.includes(tag))

// One structured effect from a talent or role benefit the task lists: what it does here, or why it isn't applied.
function readCharacterEffect(effect) {
  const plain = !effect.cost && !effect.target && !effect.useFor && !effect.check
  if (effect.type === 'difficulty' && typeof effect.change === 'number' && plain) return { difficulty: effect.change, minimum: effect.minimum ?? 0 }
  if (effect.type === 'complication' && typeof effect.ignore === 'number' && plain) return { ignoreComplications: effect.ignore }
  if (effect.type === 'complication' && typeof effect.range === 'number' && plain) return { complicationRange: effect.range }
  if (effect.type === 'bonusMomentum' && typeof effect.amount === 'number' && plain) return { bonusMomentum: effect.amount }
  return null
}

function describeApplied(applied) {
  if (applied.difficulty) return `Difficulty ${applied.difficulty > 0 ? '+' : ''}${applied.difficulty}`
  if (applied.ignoreComplications) return `Ignores ${applied.ignoreComplications} complication${applied.ignoreComplications === 1 ? '' : 's'}`
  if (applied.complicationRange) return `Complication range +${applied.complicationRange}`
  if (applied.bonusMomentum) return `+${applied.bonusMomentum} bonus Momentum on success`
  return ''
}

// spec (authored task): { attribute, department, difficulty, focuses: [names], tags: [task tags], complicationRange,
//   equipment: { label, tags, itemIds, without: 'impossible' | { difficulty }, bonus: [{ label, tags, itemIds, difficulty }] },
//   talentIds, roleIds, traitRules: [{ trait, difficulty, side? } | { trait, impossible: true }] }
// context: { traits: [scene trait names or { name, potency }], side: the performer's side ('player' | 'enemy') for
//   side-limited trait rules, difficultyMod: authored change from the object's state (e.g. a complication),
//   extraLines: [{ label, change }] situational Difficulty changes from the caller (e.g. combat's bought second Major),
//   condition: the performer's personal condition (rules/personalCondition.js) for Fatigue and Stress complications }
export function prepareTask(character, spec, context = {}) {
  const focus = findTaskFocus(character, spec.focuses)
  const blockers = []
  const difficultyLines = [{ label: 'Base Difficulty (authored)', change: spec.difficulty }]
  const equipment = []
  const effects = []
  let complicationRange = spec.complicationRange ?? 1
  let ignoreComplications = 0
  let bonusMomentum = 0
  let minimum = 0

  // Equipment: the performer's own carried items.
  const items = getEquippedItems(character)
  if (spec.equipment) {
    const tools = items.filter((item) => matchesItem(item, spec.equipment))
    if (tools.length) equipment.push({ name: tools[0].name, note: `Counts as ${spec.equipment.label}` })
    else if (spec.equipment.without === 'impossible') blockers.push(`Needs ${spec.equipment.label}`)
    else if (spec.equipment.without?.difficulty) difficultyLines.push({ label: `No ${spec.equipment.label}`, change: spec.equipment.without.difficulty })
    ;(spec.equipment.bonus ?? []).forEach((bonus) => {
      const item = items.find((candidate) => matchesItem(candidate, bonus))
      if (item) {
        const listedItem = equipment.find((entry) => entry.name === item.name)
        if (listedItem) listedItem.note = `${listedItem.note}; ${bonus.label}`
        else equipment.push({ name: item.name, note: bonus.label })
        if (bonus.difficulty) difficultyLines.push({ label: item.name, change: bonus.difficulty })
      }
    })
  }

  // Talents and role benefit the author says fit this task.
  const listed = [
    ...character.talents.filter((talent) => spec.talentIds?.includes(talent.id)).map((talent) => ({ source: 'Talent', name: talent.name, effects: talent.effects })),
    ...(character.role && spec.roleIds?.includes(character.role.id) ? [{ source: 'Role benefit', name: character.role.benefit.name ?? character.role.name, effects: character.role.benefit.effects }] : []),
  ]
  listed.forEach(({ source, name, effects: list }) => {
    list.forEach((effect) => {
      const applied = readCharacterEffect(effect)
      if (!applied) {
        effects.push({ source, name, applied: false, note: `Not automated yet (${effect.type})` })
        return
      }
      if (applied.difficulty) {
        difficultyLines.push({ label: `${name} (${source.toLowerCase()})`, change: applied.difficulty })
        minimum = Math.max(minimum, applied.minimum)
      }
      ignoreComplications += applied.ignoreComplications ?? 0
      complicationRange += applied.complicationRange ?? 0
      bonusMomentum += applied.bonusMomentum ?? 0
      effects.push({ source, name, applied: true, note: describeApplied(applied) })
    })
  })

  const dedicated = character.talents.find((talent) => widensCriticalRange(talent, focus))
  if (dedicated) effects.push({ source: 'Talent', name: dedicated.name, applied: true, note: `Critical success at or under ${character.disciplines[spec.department] * 2} (twice the Department)` })

  // Species ability: only effects whose own task tags match this task.
  const ability = character.speciesAbility
  ability?.effects
    .filter((effect) => effect.tasks?.some((tag) => spec.tags?.includes(tag)))
    .forEach((effect) => {
      const note = effect.type === 'freeDie' ? 'First bonus d20 bought is free (not automated yet)' : `Not automated yet (${effect.type})`
      effects.push({ source: 'Species ability', name: ability.name, applied: false, note })
    })

  // Traits: explicit authored rules against the scene's traits and the character's own. A rule with a side applies only
  // to that side's tasks. Potency (Book p.252: a potent trait counts as that many identical traits) multiplies the change.
  const potencyOf = new Map()
  const complications = (context.condition?.complications ?? []).map((complication) => complication.name)
  ;[...(context.traits ?? []), ...character.traits.map((trait) => trait.name), ...complications].forEach((trait) => {
    const { name, potency = 1 } = typeof trait === 'string' ? { name: trait } : trait
    potencyOf.set(lower(name), Math.max(potencyOf.get(lower(name)) ?? 0, potency))
  })
  ;(spec.traitRules ?? [])
    .filter((rule) => potencyOf.has(lower(rule.trait)) && (!rule.side || rule.side === context.side))
    .forEach((rule) => {
      const potency = potencyOf.get(lower(rule.trait))
      if (rule.impossible) blockers.push(`Impossible: ${rule.trait}`)
      if (rule.difficulty) difficultyLines.push({ label: `Trait: ${rule.trait}${potency > 1 ? ` (Potency ${potency})` : ''}`, change: rule.difficulty * potency })
    })

  if (context.difficultyMod) difficultyLines.push({ label: context.difficultyModLabel ?? 'Situation', change: context.difficultyMod })
  ;(context.extraLines ?? []).filter((line) => line.change).forEach((line) => difficultyLines.push(line))
  const fatigue = fatigueOf(context.condition, spec.attribute)
  if (fatigue.difficulty) difficultyLines.push({ label: 'Fatigued', change: fatigue.difficulty })
  if (fatigue.note) effects.push({ source: 'Condition', name: 'Fatigued', applied: true, note: fatigue.note })

  const rawDifficulty = difficultyLines.reduce((total, line) => total + line.change, 0)
  const difficulty = Math.max(rawDifficulty, minimum, 0)
  const task = buildStaTask(character, {
    attribute: spec.attribute,
    department: spec.department,
    focus,
    criticalRange: dedicated ? character.disciplines[spec.department] * 2 : null,
    complicationRange,
  })
  if (fatigue.autoFail) task.autoFail = true
  return { possible: blockers.length === 0, blockers, task, focus, difficulty, difficultyLines, equipment, effects, ignoreComplications, bonusMomentum }
}

// The assistant's side: their own target number and focus for the approach they help with (Book: assistants need not
// use the leader's attribute, department or focus).
export function prepareAssist(character, approach, condition = null) {
  const focus = findTaskFocus(character, approach.focuses)
  const dedicated = character.talents.find((talent) => widensCriticalRange(talent, focus))
  const task = buildStaTask(character, {
    attribute: approach.attribute,
    department: approach.department,
    focus,
    criticalRange: dedicated ? character.disciplines[approach.department] * 2 : null,
  })
  if (fatigueOf(condition, approach.attribute).autoFail) task.autoFail = true
  return { task, focus }
}

// Book p.277: while Fatigued, +1 Difficulty on all task rolls, and any task using the shut-down attribute automatically
// fails. Read from the performer's condition ({ fatigued, fatiguedAttribute }).
function fatigueOf(condition, attributeId) {
  if (!condition?.fatigued) return { difficulty: 0, autoFail: false, note: null }
  const autoFail = Boolean(condition.fatiguedAttribute) && condition.fatiguedAttribute === attributeId
  return { difficulty: 1, autoFail, note: autoFail ? `${getAttributeName(attributeId)} shut down: automatically fails` : null }
}
