// What the combat HUD needs to draw one frame, worked out from the combat state plus the player's current selections.
// Pure: it reads the state and returns plain data, so it can be tested without React and the screen is left holding only
// its own UI state, the event handlers and the layout.
import { samePosition, tileKey } from './battleMap.js'
import {
  canAct,
  canAfford,
  canMove,
  canSprint,
  directBlock,
  extraMinorBlock,
  getAmbusher,
  getAmbushTargets,
  getAssistableAllies,
  getAssistFor,
  getAttackTask,
  getAuthority,
  getDirectableAllies,
  getFirstAidOptions,
  getGuardTargets,
  getPathTo,
  getReachable,
  hasTargetInRange,
  previewAmbush,
  previewAttack,
  previewInjuries,
  secondMajorBlock,
} from './combatState.js'
import { canTakeCover } from './coverSystem.js'
import { checkDicePurchase } from '../rules/missionResources.js'

const NOT_YOUR_TURN = 'Not your turn.'

export function buildCombatView({
  state,
  active,
  isPlayerTurn,
  mode,
  target,
  weapon,
  destination,
  hoverTile,
  dicePurchase,
  ringId,
  ambushOpen,
  assistAllyId,
  objectList = [],
}) {
  // Move and Sprint share the tile picking; moveKind is whichever of them is selected.
  const moveKind = mode === 'move' || mode === 'sprint' ? mode : null
  const reachable = moveKind && isPlayerTurn ? getReachable(state, active, moveKind) : null
  const pathTarget = destination ?? hoverTile
  const movePath =
    reachable && pathTarget && reachable.has(tileKey(pathTarget)) && !samePosition(pathTarget, active.position)
      ? getPathTo(state, active, pathTarget, moveKind)
      : null
  const routeInCover = Boolean(movePath && canTakeCover(state.map, movePath[movePath.length - 1]))

  const preview =
    mode === 'attack' && target
      ? { ...previewAttack(state, active.id, target.id, weapon.id), injuries: previewInjuries(state, active.id, target.id, weapon.id) }
      : null
  // The attack the ring buttons label: against the current target when there is one (range, Guard and cover count),
  // else the attacker's own task before any target.
  const targetAttack = isPlayerTurn && target ? (preview ?? previewAttack(state, active.id, target.id, weapon.id)) : null
  const ownAttack = isPlayerTurn && !targetAttack ? getAttackTask(state, active.id, weapon.id) : null
  const ringAttackRoll = targetAttack
    ? { task: targetAttack.task, opposed: Boolean(targetAttack.opposition) }
    : ownAttack && { task: { ...ownAttack.task, difficulty: ownAttack.difficulty }, opposed: false }

  // The pool can shrink after the choice (another spend), so the Momentum part never exceeds what it holds now.
  const purchase = { bonusDice: dicePurchase.bonusDice, momentum: Math.min(dicePurchase.momentum, state.resources.momentum) }
  const purchaseCheck = checkDicePurchase(state.resources, purchase)

  const ambushPreview = mode === 'ambush' ? previewAmbush(state, ringId) : null
  const ambusher = ambushOpen ? getAmbusher(state) : null
  const ambushTargets = ambushOpen ? getAmbushTargets(state) : []

  const overlay = {
    reachableKeys: reachable ? new Set([...reachable.keys()].filter((key) => key !== tileKey(active.position))) : null,
    pathKeys: movePath ? new Set(movePath.slice(1).map(tileKey)) : null,
    path: movePath,
    shot: preview ? { from: active.position, to: target.position, available: preview.available } : null,
  }

  const targetInRange = hasTargetInRange(state, active.id, weapon.id)
  const assistAllies = isPlayerTurn ? getAssistableAllies(state, active) : []
  const assistAlly = assistAllies.find((ally) => ally.id === assistAllyId) ?? null
  // Who assists the acting character's next attack: an Assist set up for them, or the commander on a Direct.
  const attackAssist = getAssistFor(state, active.id, { weapon })
  const assistHelper = attackAssist ? { ...state.combatants[attackAssist.helperId], via: attackAssist.via } : null
  // Why the previewed attack can't be fired now (null = it can): from the enemy's ring buttons or the task panel.
  const maxAttackSuccesses = purchaseCheck.dice * 2 + (assistHelper ? 2 : 0)
  const attackBlock = !preview?.available
    ? (preview?.reason ?? 'Not a valid target.')
    : !purchaseCheck.valid
      ? purchaseCheck.reason
      : preview.task.difficulty > maxAttackSuccesses
        ? `Needs ${preview.task.difficulty} successes; at most ${maxAttackSuccesses} are possible from ${purchaseCheck.dice}d20: cannot succeed.`
        : null

  // Guard, First Aid, Direct and challenge objects: only what this character could do now is offered.
  const guardTargets = isPlayerTurn ? getGuardTargets(state, active) : []
  const firstAidOptions = isPlayerTurn ? getFirstAidOptions(state, active) : []
  const authority = getAuthority(state, active.side)
  const isCommander = isPlayerTurn && !state.directed && authority?.id === active.id
  const directAllies = isCommander ? getDirectableAllies(state, active) : []
  const directReason = isCommander ? directBlock(state, active) : null
  const extraMinorReason = isPlayerTurn ? extraMinorBlock(state, active) : NOT_YOUR_TURN
  const secondMajorReason = isPlayerTurn ? secondMajorBlock(state, active) : NOT_YOUR_TURN

  const availability = {
    move: canMove(state, active),
    sprint: canSprint(state, active),
    assist: canAfford(state, active, 'assist') && assistAllies.length > 0,
    endTurn: canAct(state, active),
  }
  const unavailableReasons = {
    ...(canAfford(state, active, 'assist') && !assistAllies.length
      ? { assist: 'No party member left to assist: they have all acted or are already assisted this round.' }
      : {}),
  }

  return {
    moveKind,
    reachable,
    movePath,
    routeInCover,
    preview,
    targetAttack,
    ringAttackRoll,
    purchase,
    purchaseCheck,
    ambushPreview,
    ambusher,
    ambushTargets,
    overlay,
    targetInRange,
    assistAllies,
    assistAlly,
    assistHelper,
    attackBlock,
    objectList: isPlayerTurn ? objectList : [],
    guardTargets,
    firstAidOptions,
    authority,
    isCommander,
    directAllies,
    directReason,
    extraMinorReason,
    secondMajorReason,
    availability,
    unavailableReasons,
  }
}
