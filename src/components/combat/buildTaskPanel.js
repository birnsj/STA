import actionData from '../../data/adaptation/combat/actions.json'
import {
  ACTION_TYPE_NAMES,
  canAfford,
  COMBAT_TASKS,
  getTurnOf,
  isActive,
  isTurnFinished,
  previewFirstAid,
  previewGuard,
  previewScan,
  previewScanObject,
  previewSocial,
  SOCIAL_KINDS,
  socialChance,
} from '../../combat/combatState.js'
import { typeName } from './battleHelpers.js'

// Task readout + what the ring's Roll arc commits for the action being set up on the player's turn. Pure: it reads the
// combat view and calls back into the screen's handlers. Picker values still drive who is guarded / treated / directed
// (chosen on the party band); the panel no longer renders Confirm or pick buttons.
// Returns { combatTask, taskConfirm, taskConfirmLabel }, each null when the mode has no task panel.
export default function buildTaskPanel({
  state,
  dispatch,
  active,
  isPlayerTurn,
  mode,
  target,
  attackMode,
  attackBlock,
  taskPick,
  setTaskPick,
  setMode,
  setRingInfo,
  setDicePurchase,
  guardTargets,
  firstAidOptions,
  directAllies,
  directReason,
  authority,
  isCommander,
  objectList,
  objects,
  purchase,
  purchaseCheck,
  fireAttack,
}) {
  const describeAssist = (assist) =>
    assist && { name: state.combatants[assist.helperId].character.name, label: assist.via === 'direct' ? 'Direct: Control + Command' : 'Assist', task: assist.task }
  const fromPreview = (task, focusOptions = []) => ({ label: task.label, cost: typeName(task.kind), prepared: task.prepared, assist: describeAssist(task.assist), available: task.available, reason: task.reason, focusOptions })
  let combatTask = null
  let taskConfirm = null
  let taskConfirmLabel = null
  if (isPlayerTurn && mode === 'guard') {
    const guardId = taskPick ?? active.id
    const task = previewGuard(state, active.id, guardId)
    combatTask = {
      intro: actionData.actions.find((entry) => entry.id === 'guard').description,
      picker: { label: 'Who to guard', options: guardTargets.map((unit) => ({ id: unit.id, label: unit.id === active.id ? 'Yourself' : unit.character.name })), value: guardId, onPick: setTaskPick },
      task: fromPreview(task, COMBAT_TASKS.guard.focuses),
    }
    taskConfirm = { enabled: task.available && purchaseCheck.valid, run: () => dispatch({ type: 'guard', targetId: guardId, purchase }) }
  }
  if (isPlayerTurn && mode === 'firstAid') {
    const pick = taskPick ?? (firstAidOptions[0] ? `${firstAidOptions[0].target.id}:${firstAidOptions[0].mode}` : null)
    // "targetId:mode", where a treat mode is itself "treat:<injury id>".
    const split = pick ? pick.indexOf(':') : -1
    const [aidTargetId, aidMode] = pick ? [pick.slice(0, split), pick.slice(split + 1)] : [null, null]
    const task = pick ? previewFirstAid(state, active.id, aidTargetId, aidMode) : null
    combatTask = {
      intro: actionData.actions.find((entry) => entry.id === 'firstAid').description,
      picker: {
        label: 'Who to treat',
        options: firstAidOptions.map((option) => ({
          id: `${option.target.id}:${option.mode}`,
          label: `${option.label} (Difficulty ${option.difficulty})`,
          title: option.injury ? `Treat Injury = Difficulty ${option.difficulty} (its severity). Treated: no penalty, still an Injury.` : 'Revive = Difficulty 2. No longer Defeated; the Injury stays.',
        })),
        value: pick,
        onPick: setTaskPick,
      },
      task: task ? fromPreview(task, COMBAT_TASKS.firstAidRevive.focuses) : { reason: 'Nobody within Reach needs First Aid.' },
    }
    taskConfirm = { enabled: Boolean(task?.available) && purchaseCheck.valid, run: () => dispatch({ type: 'firstAid', targetId: aidTargetId, mode: aidMode, purchase }) }
  }
  if (isPlayerTurn && mode === 'scan' && target) {
    const task = previewScan(state, active.id, target.id)
    combatTask = {
      intro: actionData.actions.find((entry) => entry.id === 'scan').description,
      task: fromPreview(task, COMBAT_TASKS.scan.focuses),
    }
    taskConfirm = {
      enabled: task.available && purchaseCheck.valid,
      run: () => {
        dispatch({ type: 'scan', targetId: target.id, purchase })
        setMode('attack')
        setRingInfo(true)
      },
    }
    taskConfirmLabel = 'Scan'
  }
  if (isPlayerTurn && mode === 'scanObject' && taskPick) {
    const task = previewScanObject(state, active.id, taskPick)
    const name = state.environment?.destructibles?.[taskPick]?.name ?? 'object'
    combatTask = {
      intro: `Scan the ${name} (Reason + Science). Success: the hazards it may release and how to counteract them are known for the rest of the mission.`,
      task: fromPreview(task, COMBAT_TASKS.scan.focuses),
    }
    taskConfirm = {
      enabled: task.available && purchaseCheck.valid,
      run: () => {
        dispatch({ type: 'scan', objectId: taskPick, purchase })
        setMode('attack')
        setRingInfo(true)
      },
    }
    taskConfirmLabel = 'Scan'
  }
  if (isPlayerTurn && SOCIAL_KINDS.includes(mode) && target) {
    const task = previewSocial(state, active.id, target.id, mode)
    const { resist } = task
    const name = target.character.name
    const lowered = task.penalty ? ` less ${task.penalty} (${task.prepared.difficultyLines.map((line) => line.label).join(', ')})` : ''
    const resistExtra = resist.extra ? `, then +${resist.extra} (${resist.prepared.difficultyLines.map((line) => line.label).join(', ')})` : ''
    combatTask = {
      intro: actionData.actions.find((entry) => entry.id === mode).description,
      // The asker's own Difficulty changes lower the Difficulty it sets (Book p.256), so the panel shows them in the note.
      task: fromPreview({ ...task, prepared: { ...task.prepared, difficulty: 0, difficultyLines: [] } }, COMBAT_TASKS[mode].focuses),
      note: `Opposed: your successes${lowered} set the Difficulty${resistExtra}. ${name} resists with ${resist.task.attribute.name} + ${resist.task.department.name} (TN ${resist.task.targetNumber}). Chance it gives way: ${Math.round(socialChance(task, purchaseCheck.dice) * 100)}%.`,
    }
    taskConfirm = {
      enabled: task.available && purchaseCheck.valid,
      run: () => {
        dispatch({ type: mode, targetId: target.id, purchase })
        setDicePurchase({ bonusDice: 0, momentum: 0 })
        setMode('attack')
      },
    }
    taskConfirmLabel = actionData.actions.find((entry) => entry.id === mode).name
  }
  if (isPlayerTurn && mode === 'direct' && isCommander) {
    const allyId = taskPick ?? directAllies[0]?.id ?? null
    combatTask = {
      intro: `Authority: ${authority.reason}. Spend 1 Momentum (pool ${state.resources.momentum}): the ally takes one Major action at once, and ${active.character.name} assists it with Control + Command.`,
      picker: { label: 'Ally to direct', options: directAllies.map((ally) => ({ id: ally.id, label: ally.character.name })), value: allyId, onPick: setTaskPick },
      task: directReason ? { reason: directReason } : null,
    }
    taskConfirm = { enabled: !directReason && Boolean(allyId), run: () => dispatch({ type: 'direct', allyId }) }
  }
  if (isPlayerTurn && mode === 'interact') {
    const entries = objectList.flatMap(({ definition, actions }) => actions.map((entry) => ({ definition, ...entry })))
    const firstOpen = entries.find((entry) => entry.available && entry.affordable) ?? entries[0]
    const pick = taskPick ?? (firstOpen ? `${firstOpen.definition.id}:${firstOpen.action.id}` : null)
    const chosen = entries.find((entry) => `${entry.definition.id}:${entry.action.id}` === pick) ?? null
    const objectPreview = chosen ? objects.preview(chosen.definition.id, chosen.action.id) : null
    const prepared = objectPreview?.prepared ?? null
    const block = !chosen
      ? 'Nothing in reach.'
      : !chosen.available
        ? chosen.reason
        : !chosen.affordable
          ? `No ${ACTION_TYPE_NAMES[chosen.cost]} action left.`
          : prepared && !prepared.possible
            ? prepared.blockers.join('; ')
            : null
    combatTask = {
      intro: chosen?.action.description ?? null,
      picker: {
        label: 'Object action',
        options: entries.map((entry) => ({
          id: `${entry.definition.id}:${entry.action.id}`,
          label: `${entry.definition.name}: ${entry.action.label} (${ACTION_TYPE_NAMES[entry.cost]}${entry.action.kind === 'createTrait' ? ', Create Trait' : ''})`,
          title: entry.available ? entry.action.description : entry.reason,
        })),
        value: pick,
        onPick: setTaskPick,
      },
      task: prepared
        ? { label: chosen.action.label, cost: ACTION_TYPE_NAMES[chosen.cost], prepared, assist: describeAssist(objectPreview.assist), available: !block, reason: block, focusOptions: chosen.action.task?.focuses ?? [] }
        : { reason: block },
      routine: Boolean(chosen) && !prepared,
      note: chosen && !prepared && block ? block : null,
      // Guidance only: who in the party (with the action's cost still left this round) has the best odds at this task.
      recommendation: prepared
        ? objects.recommend(
            chosen.definition.id,
            chosen.action.id,
            Object.values(state.combatants)
              .filter((c) => c.side === 'player' && isActive(c) && !isTurnFinished(state, c.id) && getTurnOf(state, c.id)[chosen.cost] > 0)
              .map((c) => c.id),
          )
        : null,
      nameOf: (id) => state.combatants[id]?.character.name ?? id,
    }
    taskConfirm = {
      enabled: Boolean(chosen) && !block && (!prepared || purchaseCheck.valid),
      run: () => dispatch({ type: 'interact', objectId: chosen.definition.id, actionId: chosen.action.id, purchase: prepared ? purchase : undefined }),
    }
    taskConfirmLabel = prepared ? 'Attempt' : 'Use'
  }
  if (isPlayerTurn && attackMode) {
    taskConfirm = { enabled: Boolean(target) && !attackBlock && canAfford(state, active, 'attack'), run: () => fireAttack(target.id, attackMode) }
    taskConfirmLabel = 'Fire'
  }
  return { combatTask, taskConfirm, taskConfirmLabel }
}
