// Attacks and the help they get: the attacker's prepared task, the defender's opposed roll, the preview the Task panel
// shows before FIRE, Aim rerolls, Assist / Direct dice and the hit chance. Rolling and resolving happen in the reducer
// (combatState.js); everything here is a pure function of the state.
import { prepareAssist, prepareTask } from '../rules/taskPreparation.js'
import { resolveStaTask, rollDice, staSuccessOdds, staTaskChance, TASK_DICE } from '../rules/taskResolver.js'
import { getCombatantList, getOpponents, getTurnGroup, getTurnOf, isActive, isTurnFinished, knowsAbout, secondMajorLines } from './combatSelectors.js'
import { getRangeBand, hasLineOfFire, tileDistance } from './rangeSystem.js'
import { ADAPTATION_MOMENTUM_SPENDS, COMBAT_TASKS } from './turnActions.js'
import { getAttackTaskSpec, getRangeModifier, getWeapon } from './weaponSystem.js'

// Book (STA 2e Core p.288): Aim (minor action) lets the next Attack this turn reroll a single d20; with an Accurate
// weapon (p.241: the Accurate quality) up to two d20s. A focus does nothing extra for Aim: its only effect is the critical
// range every attack already uses.
export const isAccurate = (weapon) => Boolean(weapon?.qualities?.some((quality) => quality.toLowerCase() === 'accurate'))
export const aimRerollsFor = (weapon) => (isAccurate(weapon) ? 2 : 1)

export const AIM_TEXT = 'may reroll one die on the next attack this turn (two with an Accurate weapon)'

// Whether Aim can still reroll this die of the pending attack (rerolls left, and Aim hasn't rerolled this die yet).
export const canAimReroll = (pending, dieIndex) =>
  pending.aimRerolls > 0 && !pending.rerolls.some((reroll) => reroll.source === 'aim' && reroll.index === dieIndex)

// A player's rolled attack waits for the player only when it would miss and a reroll could still save it; otherwise
// it resolves on its own (prototype: no Resolve click for a roll with nothing left to decide).
export function rollAwaitsPlayer(state) {
  const { pending } = state
  if (!pending || state.combatants[pending.attackerId].side !== 'player') return false
  const evaluation = evaluateAttack(pending)
  const canReroll = (ADAPTATION_MOMENTUM_SPENDS && state.resources.momentum > 0) || evaluation.dice.some((die, index) => !die.successes && canAimReroll(pending, index))
  return canReroll && !evaluation.success
}

// The scene's traits, the performer's side and condition (Fatigue, Stress complications), for every combat task
// (taskPreparation.js).
export const taskContext = (state, combatant, extra = {}) => ({ traits: state.sceneTraits ?? [], side: combatant.side, condition: combatant.condition, ...extra })
const traitsKey = (state, combatant) =>
  [
    ...(state.sceneTraits ?? []).map((trait) => `${trait.name}:${trait.potency ?? 1}`),
    combatant.condition.fatigued ? `fatigued:${combatant.condition.fatiguedAttribute ?? ''}` : '',
    ...(combatant.condition.complications ?? []).map((complication) => complication.name),
  ].join('|')

// The shared STA 2E task for attacking with this weapon (Attribute + Department, applicable focus, structured character
// effects, scene traits), before range, Guard and the target's opposition. Cached per character object (characters never
// change mid-fight) and per side and scene traits.
const preparedAttacks = new WeakMap()
function prepareAttack(state, combatant, weapon) {
  const { character } = combatant
  if (!preparedAttacks.has(character)) preparedAttacks.set(character, new Map())
  const cache = preparedAttacks.get(character)
  const key = `${weapon.id}#${combatant.side}#${traitsKey(state, combatant)}`
  if (!cache.has(key)) {
    const spec = getAttackTaskSpec(weapon)
    const task = { attribute: spec.attribute, department: spec.department, difficulty: spec.baseDifficulty, focuses: weapon.focuses, tags: spec.tags, traitRules: spec.traitRules }
    cache.set(key, prepareTask(character, task, taskContext(state, combatant)))
  }
  return cache.get(key)
}

// The attacker's own side of an attack with this weapon before any target (range, Guard, opposition) is known: the
// prepared task the action ring labels with Attribute + Department and Target Number.
export function getAttackTask(state, attackerId, weaponId) {
  const attacker = state.combatants[attackerId]
  const weapon = getWeapon(weaponId)
  return attacker && weapon ? prepareAttack(state, attacker, weapon) : null
}

// The defender's side of an opposed attack: the same shared task preparation as any other task, on the defender's own
// character (their Attribute + Department, structured effects, scene traits) with the focus from the authored defence
// list (opposition.focuses in weapons.json; VIDEOGAME ADAPTATION, Oct 2026).
const preparedDefences = new WeakMap()
function prepareDefence(state, combatant, weaponType, rule) {
  const { character } = combatant
  if (!preparedDefences.has(character)) preparedDefences.set(character, new Map())
  const cache = preparedDefences.get(character)
  const key = `${weaponType}#${combatant.side}#${traitsKey(state, combatant)}`
  if (!cache.has(key)) {
    const task = { attribute: rule.attribute, department: rule.department, difficulty: 0, focuses: rule.focuses ?? [], tags: rule.tags ?? [], traitRules: rule.traitRules }
    cache.set(key, prepareTask(character, task, taskContext(state, combatant)))
  }
  return cache.get(key)
}

// Whether the target resists with an opposed roll (Book p.289: a ranged attack on a target in Cover; a melee attack on a
// target aware of it), and the defender's own task: { when, difficulty ('higher' | 'successes'), task }.
function getOpposition(state, attacker, target, spec, weapon) {
  const rule = spec.opposition
  if (!rule || !isActive(target)) return null
  const applies = rule.when === 'targetInCover' ? target.inCover : rule.when === 'targetAware' && knowsAbout(state, target, attacker)
  if (!applies) return null
  return { when: rule.when, difficulty: rule.difficulty, task: prepareDefence(state, target, weapon.type, rule).task }
}

// The attack's final Difficulty once the defender's successes are known (no opposition: the preview's Difficulty).
// 'higher' - VIDEOGAME ADAPTATION (designer cover rule, kept Oct 2026): the higher of the normal Difficulty and the
// defender's successes, so taking Cover never makes a target easier to hit because its roll was poor. Book (p.256,
// p.289): the defender's successes alone. 'successes' (Book p.256): the defender's successes, adjusted by the attacker's
// other Difficulty changes (range, effects). A Guard on the target (Book p.288: +1) and a bought second major action's
// +1 apply after either.
export function attackDifficulty(preview, defenderSuccesses = 0) {
  const { opposition, task } = preview
  if (!opposition) return task.difficulty
  const guard = (preview.guardModifier ?? 0) + (preview.extraLines ?? []).reduce((total, line) => total + line.change, 0)
  const own = task.difficulty - guard
  if (opposition.difficulty === 'higher') return Math.max(own, defenderSuccesses) + guard
  return Math.max(0, defenderSuccesses + own - preview.baseDifficulty) + guard
}

// Everything the Task panel shows before FIRE, and exactly what the attack will use. fromPosition lets the AI test other tiles.
export function previewAttack(state, attackerId, targetId, weaponId, fromPosition) {
  const attacker = state.combatants[attackerId]
  const target = state.combatants[targetId]
  const weapon = getWeapon(weaponId)
  if (!attacker || !target || !weapon) return { available: false, reason: 'Choose a target.' }
  const position = fromPosition ?? attacker.position
  const distance = tileDistance(position, target.position)
  const band = getRangeBand(distance)
  const range = getRangeModifier(weapon, band)
  const spec = getAttackTaskSpec(weapon)
  const prepared = prepareAttack(state, attacker, weapon)
  // Book p.288: a Guard on the target raises the Difficulty of attacks against it by 1.
  const guardModifier = target.guard ? 1 : 0
  const extraLines = secondMajorLines(state, attackerId)
  const extraModifier = extraLines.reduce((total, line) => total + line.change, 0)
  const task = { ...prepared.task, difficulty: prepared.difficulty + range.modifier + guardModifier + extraModifier }
  const opposition = getOpposition(state, attacker, target, spec, weapon)
  const base = {
    weapon,
    target,
    distance,
    band,
    baseDifficulty: spec.baseDifficulty,
    rangeModifier: range.modifier,
    guardModifier,
    extraLines,
    traitLines: prepared.difficultyLines.filter((line) => line.label.startsWith('Trait')),
    // Every change that makes up task.difficulty, for the Task panel (the prepared lines, then range, Guard, extra action).
    difficultyLines: [
      ...prepared.difficultyLines,
      ...(range.modifier ? [{ label: `Range: ${band.name}`, change: range.modifier }] : []),
      ...(guardModifier ? [{ label: 'Target guarded', change: guardModifier }] : []),
      ...extraLines,
    ],
    blockers: prepared.blockers,
    equipment: prepared.equipment,
    task,
    effects: prepared.effects,
    opposition,
    targetInCover: target.inCover,
  }
  if (!isActive(target) || target.side === attacker.side) return { ...base, available: false, reason: 'Not a valid target.' }
  if (!range.available) return { ...base, available: false, reason: `Out of range (${band.name}).` }
  if (!hasLineOfFire(state.map, position, target.position)) return { ...base, available: false, reason: 'No line of fire.' }
  return { ...base, available: true, reason: null }
}

// Assist (Book p.288, p.255): a major action. Designer decision (Oct 2026), kept: the combatant sets up the assist on
// an ally who still has a turn this round, and the ally's next task this round (an attack, Guard, First Aid or an
// object's task) adds the helper's 1d20, rolled against the helper's own Target Number. Any ally on the map; one assist
// per task. The resolver counts the assist die only if the leader scores at least 1 success.
export function canAssist(state, helper, ally) {
  if (!ally || ally.id === helper.id || ally.side !== helper.side || !isActive(ally) || state.assists[ally.id] || state.directed) return false
  return getTurnGroup(state).includes(ally.id) && !isTurnFinished(state, ally.id)
}

export const getAssistableAllies = (state, helper) => getCombatantList(state).filter((ally) => canAssist(state, helper, ally))

// The attack's STA 2E task result (taskResolver.js), counting the assist die (Book: an assistant's successes count only
// if the leader scores at least 1; an assistant's 20 is a complication too).
export function evaluateAttack(pending) {
  const { assist } = pending
  return resolveStaTask({ leader: { task: pending.task, dice: pending.dice }, assist: assist && { task: assist.task, die: assist.die }, difficulty: pending.task.difficulty })
}

// Who assists this combatant's next task, and with what: { helperId, task, focus, via ('assist' | 'direct'), label } or
// null. source says what the task is: { weapon } (an attack), { spec } (a predefined task: Guard, First Aid) or
// { approach } (an object's authored assist approach; null = that task can't be assisted).
// - A directed ally (Direct, Book p.288) is assisted by the commander with Control + Command. Book p.254 lets one
//   assistant help for free and charges for more, so while directed the commander is the only assistant (an Assist
//   set up on that ally waits for their own turn).
// - Otherwise the ally who set up an Assist, with the task's own Attribute + Department and focuses (attacks and
//   predefined tasks) or the authored approach (objects).
export function getAssistFor(state, actorId, source) {
  const { directed } = state
  if (directed?.allyId === actorId) {
    const commander = state.combatants[directed.commanderId]
    if (!commander || !isActive(commander)) return null
    const { task, focus } = prepareAssist(commander.character, COMBAT_TASKS.directAssist, commander.condition)
    return { helperId: commander.id, task, focus, via: 'direct', label: 'Direct: Control + Command' }
  }
  const helper = state.assists[actorId] && state.combatants[state.assists[actorId]]
  if (!helper || !isActive(helper)) return null
  if (source.weapon) {
    const { task, focus } = prepareAttack(state, helper, source.weapon)
    return { helperId: helper.id, task, focus, via: 'assist', label: 'Assist' }
  }
  if (source.spec) {
    const { task, focus } = prepareTask(helper.character, source.spec, taskContext(state, helper))
    return { helperId: helper.id, task, focus, via: 'assist', label: 'Assist' }
  }
  if (!source.approach) return null
  const { task, focus } = prepareAssist(helper.character, source.approach, helper.condition)
  return { helperId: helper.id, task, focus, via: 'assist', label: `Assist (${source.approach.label})` }
}

// Takes the assist off the table once it has been rolled (a Direct's assist isn't a set-up Assist).
export const withoutUsedAssist = (state, actorId, assist) => {
  if (assist?.via !== 'assist') return state
  const { [actorId]: used, ...assists } = state.assists
  return used ? { ...state, assists } : state
}

export const assistTaskFor = (state, actorId, weapon) => getAssistFor(state, actorId, { weapon })

// Chance an available attack hits: the attacker's dice (2 plus bonusDice bought) with the shared STA 2E odds (critical
// successes included), the Aim rerolls (one failed die, two with an Accurate weapon), the assist die, and the
// defender's opposed roll when there is one. Presentation and AI aid only; the attack itself always rolls.
export function getHitChance(state, attackerId, preview, { bonusDice = 0 } = {}) {
  if (!preview?.available) return 0
  const turn = getTurnOf(state, attackerId)
  const rerolls = turn.aimReroll ? aimRerollsFor(preview.weapon) : 0
  const assistTask = assistTaskFor(state, attackerId, preview.weapon)?.task ?? null
  const chanceAt = (difficulty) => staTaskChance({ task: preview.task, difficulty, dice: TASK_DICE + bonusDice, rerolls, assistTask })
  if (!preview.opposition) return chanceAt(preview.task.difficulty)
  return staSuccessOdds(preview.opposition.task).reduce((total, chance, successes) => total + chance * chanceAt(attackDifficulty(preview, successes)), 0)
}

// Whether any opponent could be attacked right now with this weapon (in range and in line of fire).
export function hasTargetInRange(state, attackerId, weaponId) {
  const attacker = state.combatants[attackerId]
  return getOpponents(state, attacker).some((opponent) => previewAttack(state, attackerId, opponent.id, weaponId).available)
}

// The defender's opposed roll (Book p.256: the reactive side rolls first; its successes set the Difficulty).
export function rollOpposition(opposition, random) {
  const roll = resolveStaTask({ leader: { task: opposition.task, dice: rollDice(random) }, difficulty: 0 })
  return { ...opposition, dice: roll.dice, successes: roll.successes, complications: roll.complications }
}

// The log's account of how a pending attack's Difficulty was reached.
export function difficultyBreakdown(pending) {
  const { opposition } = pending
  const successes = opposition && `${opposition.successes} ${opposition.successes === 1 ? 'success' : 'successes'}`
  const parts = opposition?.difficulty === 'successes' ? [`opposed: target's ${successes}`] : [`base ${pending.baseDifficulty}`]
  if (pending.rangeModifier) parts.push(`${pending.band.name} range +${pending.rangeModifier}`)
  ;(pending.traitLines ?? []).forEach((line) => parts.push(`${line.label} ${line.change >= 0 ? '+' : ''}${line.change}`))
  if (opposition?.difficulty === 'higher') parts.push(`target cover ${successes} (the higher counts)`)
  if (pending.guardModifier) parts.push(`target guarded +${pending.guardModifier}`)
  ;(pending.extraLines ?? []).forEach((line) => parts.push(`${line.label} +${line.change}`))
  return parts.join(', ')
}
