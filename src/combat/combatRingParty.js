// The party band on combat action rings (designer request 2026-10-17): same pattern as exploration's ringParty.js —
// who can perform the hovered / armed action, who is best by stats, and who is picked. Pure: no React.
import { recommendPerformers } from '../rules/taskRecommendation.js'
import { previewObjectAttack } from './combatEnvironment.js'
import { previewAmbush, previewAttack, previewFirstAid, previewGuard, previewScan, previewScanObject, previewSocial } from './combatState.js'
import { getCombatantList, getTurnGroup, isActive, isTurnFinished } from './combatSelectors.js'
import { getCombatantWeapon } from './weaponSystem.js'

// Odds helper: attack / object previews expose task fields flat; task previews nest under .prepared.
function asPrepared(preview) {
  if (!preview) return { possible: false, task: { targetNumber: 0 }, difficulty: 0 }
  if (preview.prepared) return preview.prepared
  if (preview.task) {
    return {
      possible: Boolean(preview.available),
      task: preview.task,
      difficulty: preview.task.difficulty,
      focus: preview.task.focus ?? null,
    }
  }
  return { possible: false, task: { targetNumber: 0 }, difficulty: 0 }
}

// Party combatants still able to act (or at least standing): the band's candidates for handing the turn.
export function combatBandMembers(state) {
  return getCombatantList(state).filter((combatant) => combatant.side === 'player' && isActive(combatant))
}

const canStillAct = (state, id) => !isTurnFinished(state, id)

// context: what the ring is about and which button is being considered.
// {
//   kind: 'enemy' | 'destructible' | 'object' | 'assist' | 'guard' | 'firstAid' | 'direct' | 'self',
//   buttonId, enemyId, objectId, destructibleId, weaponId, actorId,
//   guardTargets, firstAidOptions, directAllies, assistAllies, objects,
// }
export function combatRingPartyView(state, context) {
  const { kind, buttonId } = context
  let members = combatBandMembers(state)
  const blocked = Object.fromEntries(members.map((member) => [member.id, null]))
  let recommendation = null

  if (kind === 'assist') {
    members = (context.assistAllies ?? []).slice()
    return finish(members, Object.fromEntries(members.map((m) => [m.id, null])), null)
  }

  if (kind === 'guard') {
    members = context.guardTargets ?? []
    return finish(members, Object.fromEntries(members.map((m) => [m.id, null])), null)
  }

  if (kind === 'firstAid') {
    // One slice per First Aid option (revive / treat); id is "targetId:mode".
    const actorId = context.actorId
    const options = context.firstAidOptions ?? []
    const fake = options.map((option) => ({
      id: `${option.target.id}:${option.mode}`,
      character: option.target.character,
      option,
    }))
    const blockedOptions = {}
    const prepared = []
    for (const entry of fake) {
      const preview = previewFirstAid(state, actorId, entry.option.target.id, entry.option.mode)
      blockedOptions[entry.id] = preview.available ? null : preview.reason
      if (preview.available) prepared.push({ id: entry.id, prepared: preview.prepared })
    }
    const rec = recommendPerformers(prepared)
    return {
      hasTask: Boolean(rec),
      allTied: Boolean(rec?.allTied),
      bestIds: rec?.bestIds ?? [],
      members: fake.map((entry) => {
        const row = rec?.entries[entry.id]
        return {
          id: entry.id,
          character: entry.character,
          available: !blockedOptions[entry.id],
          reason: blockedOptions[entry.id],
          targetNumber: row?.targetNumber ?? null,
          difficulty: row?.difficulty ?? null,
          chance: row?.chance ?? null,
          possible: row ? row.possible : null,
          best: Boolean(rec?.bestIds.includes(entry.id)),
          labelExtra: entry.option.label,
        }
      }),
    }
  }

  if (kind === 'direct') {
    members = context.directAllies ?? []
    return finish(members, Object.fromEntries(members.map((m) => [m.id, null])), null)
  }

  // Default: party members; mark those who have finished their turn as unavailable for switching.
  for (const member of members) {
    if (!canStillAct(state, member.id)) blocked[member.id] = 'No actions left this round.'
  }

  if (kind === 'enemy' && context.enemyId && buttonId) {
    const enemyId = context.enemyId
    if (buttonId === 'scan') {
      for (const member of members) {
        if (blocked[member.id]) continue
        const preview = previewScan(state, member.id, enemyId)
        blocked[member.id] = preview.available ? null : preview.reason
      }
      recommendation = recommendPerformers(
        members.filter((m) => !blocked[m.id]).map((m) => ({ id: m.id, prepared: asPrepared(previewScan(state, m.id, enemyId)) })),
      )
    } else if (buttonId === 'persuade' || buttonId === 'intimidate') {
      for (const member of members) {
        if (blocked[member.id]) continue
        const preview = previewSocial(state, member.id, enemyId, buttonId)
        blocked[member.id] = preview.available ? null : preview.reason
      }
      recommendation = recommendPerformers(
        members.filter((m) => !blocked[m.id]).map((m) => ({ id: m.id, prepared: asPrepared(previewSocial(state, m.id, enemyId, buttonId)) })),
      )
    } else if (buttonId === 'ambush') {
      const ambush = previewAmbush(state, enemyId)
      for (const member of members) {
        if (blocked[member.id]) continue
        blocked[member.id] = ambush.ambusher?.id === member.id && ambush.available ? null : ambush.reason ?? 'Not the ambusher.'
      }
      if (ambush.available && ambush.ambusher) {
        recommendation = recommendPerformers([
          {
            id: ambush.ambusher.id,
            prepared: { possible: true, task: ambush.task, difficulty: ambush.task.difficulty, focus: ambush.task.focus },
          },
        ])
      }
    } else if (buttonId === 'stun' || buttonId === 'deadly' || buttonId?.startsWith('attack')) {
      const modeId = buttonId === 'stun' || buttonId === 'deadly' ? buttonId : buttonId.replace(/^attack-/, '')
      for (const member of members) {
        if (blocked[member.id]) continue
        const weapon = getCombatantWeapon(member, member.weaponIds[0])
        if (!weapon?.injuryModes.includes(modeId)) {
          blocked[member.id] = `${weapon?.name ?? 'Weapon'} cannot fire ${modeId}.`
          continue
        }
        const preview = previewAttack(state, member.id, enemyId, weapon.id)
        blocked[member.id] = preview.available ? null : preview.reason ?? 'No shot.'
      }
      recommendation = recommendPerformers(
        members
          .filter((m) => !blocked[m.id])
          .map((m) => {
            const weapon = getCombatantWeapon(m, m.weaponIds[0])
            return { id: m.id, prepared: asPrepared(previewAttack(state, m.id, enemyId, weapon.id)) }
          }),
      )
    }
  }

  if (kind === 'destructible' && context.destructibleId && buttonId) {
    const objectId = context.destructibleId
    if (buttonId === 'fire') {
      for (const member of members) {
        if (blocked[member.id]) continue
        const weapon = getCombatantWeapon(member, context.weaponId ?? member.weaponIds[0])
        const preview = previewObjectAttack(state, member.id, objectId, weapon.id)
        blocked[member.id] = preview.available ? null : preview.reason
      }
      recommendation = recommendPerformers(
        members
          .filter((m) => !blocked[m.id])
          .map((m) => {
            const weapon = getCombatantWeapon(m, context.weaponId ?? m.weaponIds[0])
            return { id: m.id, prepared: asPrepared(previewObjectAttack(state, m.id, objectId, weapon.id)) }
          }),
      )
    } else if (buttonId === 'scan') {
      for (const member of members) {
        if (blocked[member.id]) continue
        const preview = previewScanObject(state, member.id, objectId)
        blocked[member.id] = preview.available ? null : preview.reason
      }
      recommendation = recommendPerformers(
        members.filter((m) => !blocked[m.id]).map((m) => ({ id: m.id, prepared: asPrepared(previewScanObject(state, m.id, objectId)) })),
      )
    }
  }

  if (kind === 'object' && context.objectId && buttonId && context.objects?.recommend) {
    const ids = members.filter((m) => !blocked[m.id]).map((m) => m.id)
    recommendation = context.objects.recommend(context.objectId, buttonId, ids)
  }

  if (kind === 'self' && (buttonId === 'guard' || !buttonId)) {
    for (const member of members) {
      if (blocked[member.id]) continue
      if (buttonId === 'guard') {
        const preview = previewGuard(state, member.id, member.id)
        blocked[member.id] = preview.available ? null : preview.reason
      }
    }
    if (buttonId === 'guard') {
      recommendation = recommendPerformers(
        members.filter((m) => !blocked[m.id]).map((m) => ({ id: m.id, prepared: asPrepared(previewGuard(state, m.id, m.id)) })),
      )
    }
  }

  return finish(members, blocked, recommendation)
}

function finish(members, blocked, recommendation) {
  return {
    hasTask: Boolean(recommendation),
    allTied: Boolean(recommendation?.allTied),
    bestIds: recommendation?.bestIds ?? [],
    members: members.map((member) => {
      const entry = recommendation?.entries?.[member.id]
      return {
        id: member.id,
        character: member.character,
        available: !blocked[member.id],
        reason: blocked[member.id],
        targetNumber: entry?.targetNumber ?? null,
        difficulty: entry?.difficulty ?? null,
        chance: entry?.chance ?? null,
        possible: entry ? entry.possible : null,
        best: Boolean(recommendation?.bestIds?.includes(member.id)),
      }
    }),
  }
}

// Formats the view for UnitActionRing's party prop. helperId: who is set to Assist the performer's next task.
export function combatRingPartyBand(view, { pickedId, onPick, helperId = null, buttonLabel = null }) {
  const caption = !buttonLabel
    ? 'Hover an action: who is best at it'
    : !view.hasTask
      ? `${buttonLabel}: pick who acts`
      : view.allTied
        ? `${buttonLabel}: all equally suited`
        : `Best at ${buttonLabel}`
  const helperName = helperId ? view.members.find((m) => m.id === helperId)?.character.name : null
  const slices = view.members.map((entry) => {
    const odds = !view.hasTask
      ? entry.reason
      : entry.reason ?? (entry.possible ? `TN ${entry.targetNumber}, Difficulty ${entry.difficulty}, ${Math.round(entry.chance * 100)}% chance` : "Can't succeed.")
    const label = !view.hasTask
      ? entry.labelExtra ?? null
      : !entry.available
        ? '-'
        : entry.possible
          ? `${entry.best ? '\u2605 ' : ''}TN ${entry.targetNumber}`
          : "Can't"
    const assistNote = entry.id === helperId ? 'Assisting this round.' : pickedId === entry.id && helperId ? `Assisted by ${helperName}.` : null
    return {
      id: entry.id,
      character: entry.character,
      label,
      best: entry.best,
      picked: entry.id === pickedId,
      available: entry.available,
      title: [`${entry.character.name}${odds ? `: ${odds}` : ''}`, assistNote, entry.id === pickedId ? 'Picked. Click to unpick.' : 'Click to pick them.'].filter(Boolean).join('\n'),
    }
  })
  return { caption: helperId && helperName ? `${caption} · ${helperName} assisting` : caption, slices, onPick }
}

// Whether this party member can be handed the turn from the active combatant.
export function canHandTurn(state, active, memberId) {
  if (!active || memberId === active.id) return false
  if (!canStillAct(state, memberId)) return false
  const member = state.combatants[memberId]
  if (!member || member.side !== 'player' || !isActive(member)) return false
  return getTurnGroup(state).includes(memberId)
}
