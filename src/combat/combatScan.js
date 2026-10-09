// Scanning an enemy in combat (PROTOTYPE, designer decision Oct 2026): before a scan the party sees only what is in plain
// view; a successful Scan (combatTasks.js previewScan, actions.json tasks.scan) adds its Stress, Protection, weapons and
// tactical tips for the rest of the fight (state.scanned). The tips are worked out from the rules, never authored per enemy.
import { conditionSummary, getAvoidOption, getMaxStress, getProtection, npcCategoryName, npcCategoryOf } from '../rules/personalCondition.js'
import { getBandIndex, getRangeBand, tileDistance } from './rangeSystem.js'
import { describeRange, getCombatantWeapon, getInjuryMode } from './weaponSystem.js'

export const isScanned = (state, enemyId) => Boolean(state.scanned?.[enemyId])

// The enemy's condition as the party sees it: Stress and Fatigue only once scanned.
export const visibleCondition = (state, enemy) => conditionSummary(enemy.character, enemy.condition, { stress: isScanned(state, enemy.id) })

// What a scan shows: { rows: [[label, value]], tips: [text] }. viewer: the party member looking (for range).
export function scanReport(state, viewer, enemy) {
  const { character, condition } = enemy
  const weapons = enemy.weaponIds.map((id) => getCombatantWeapon(enemy, id))
  const protectionAgainst = (injuryType) => getProtection(character, { injuryType, inCover: enemy.inCover }).value
  const protection = { stun: protectionAgainst('stun'), deadly: protectionAgainst('deadly') }
  const stress =
    npcCategoryOf(character) === 'main'
      ? `${condition.stress}/${getMaxStress(character).value}${condition.fatigued ? ' (Fatigued)' : ''}`
      : `None (${npcCategoryName(character)})`
  const rows = [
    ['Stress', stress],
    ['Protection', protection.stun === protection.deadly ? `${protection.deadly}` : `Stun ${protection.stun}, Deadly ${protection.deadly}`],
    ...weapons.map((weapon) => [
      weapon.name,
      `Severity ${weapon.severity}, ${weapon.injuryModes.map((modeId) => getInjuryMode(modeId).name).join('/')}, ${describeRange(weapon)}`,
    ]),
  ]
  return { rows, tips: scanTips(state, viewer, enemy, weapons, protection) }
}

function scanTips(state, viewer, enemy, weapons, protection) {
  const tips = []
  const { character, condition } = enemy
  const threat = state.resources.threat
  // Avoid Injury (Book p.291-292) for the smallest Injury: whether the next hit Defeats it.
  const avoid = getAvoidOption(character, condition, { severity: 1 }, { threat, avoidedThisScene: state.avoidedThisScene ?? [] })
  if (npcCategoryOf(character) === 'minor') tips.push('Minor NPC: any hit Defeats it.')
  else if (avoid.kind === 'threat') {
    tips.push(
      avoid.possible
        ? `Avoids an Injury by spending Threat equal to its Severity (pool ${threat}).`
        : `Can't avoid an Injury now (${avoid.reason.replace(/\.$/, '')}): the next hit Defeats it.`,
    )
  } else if (!avoid.possible) tips.push('Fatigued: it can\'t avoid an Injury; the next hit Defeats it.')
  else {
    const left = Math.max(0, getMaxStress(character).value - condition.stress)
    tips.push(`Avoids an Injury by taking Stress equal to its Severity (${left} left before it is Fatigued).`)
  }
  if (protection.stun !== protection.deadly) tips.push(`Its Protection is lower against ${protection.stun < protection.deadly ? 'Stun' : 'Deadly'}.`)
  else if (protection.deadly > 0) tips.push(`Protection ${protection.deadly} lowers the Severity of each Injury you inflict (to at least 1).`)
  if (enemy.inCover) tips.push('In cover: your attacks against it are opposed. Aim or buy d20s.')
  const longest = Math.max(...weapons.map((weapon) => getBandIndex(weapon.maximumRange)))
  const distance = tileDistance(viewer.position, enemy.position)
  if (getBandIndex(getRangeBand(distance).id) > longest) tips.push('Its weapons can\'t reach you where you stand.')
  else if (longest === getBandIndex('reach')) tips.push('Melee only: stay out of Reach.')
  return tips
}
