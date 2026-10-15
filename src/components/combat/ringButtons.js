import actionData from '../../data/adaptation/combat/actions.json'
import {
  ACTION_TYPE_NAMES,
  AIM_TEXT,
  aimRerollsFor,
  canAfford,
  canAim,
  canAssist,
  COMBAT_TASKS,
  EXTRA_ACTIONS,
  getHitChance,
  getMovementBlock,
  isScanned,
  previewAmbush,
  previewAttack,
  previewFirstAid,
  previewGuard,
  previewScan,
  previewSocial,
  scanReport,
  visibleCondition,
} from '../../combat/combatState.js'
import { combatActionFor } from '../../combat/actions/registry.js'
import { previewObjectAttack } from '../../combat/combatEnvironment.js'
import { getSprintTiles } from '../../combat/movementSystem.js'
import { getInjuryMode } from '../../combat/weaponSystem.js'
import { prepareAssist } from '../../rules/taskPreparation.js'
import { attackModeDetails, attackModeName, enemyButtonDefs, taskDetails, typeName } from './battleHelpers.js'

// The buttons and info card drawn in a ring around a unit on the map: the acting character's own actions, an enemy's
// attack / scan / persuade buttons, an ally's Assist and Switch, the Ambush button, and a challenge object's approaches. They only describe what a button
// shows and what pressing it asks the screen to do (the callbacks), so a new action's button is added here.
// Everything passed in is the screen's state at this render; the returned builders are called while it renders the ring.
export default function createRingButtons({
  state,
  dispatch,
  active,
  weapon,
  mode,
  ringInfo,
  attackMode,
  attackBlock,
  targetAttack,
  ringAttackRoll,
  preview,
  purchase,
  purchaseCheck,
  availability,
  unavailableReasons,
  extraMinorReason,
  secondMajorReason,
  directReason,
  isCommander,
  firstAidOptions,
  objectList,
  canSwitchTo,
  closeRing,
  openTask,
  selectAction,
  selectPartyMember,
  fireAttack,
  setAttackChoice,
  setDestination,
  setMode,
  setRingInfo,
  setTaskPick,
  taskPick,
}) {
  const ambushRingButtons = (enemy) => {
    const ambush = previewAmbush(state, enemy.id)
    const percent = `${Math.round(ambush.chance * 100)}%`
    return [
      {
        id: 'ambush',
        label: `Ambush (free) ${percent}`,
        icon: 'ambush',
        enabled: ambush.available,
        title: ambush.available
          ? `${ambush.ambusher.character.name} ambushes ${enemy.character.name}: TN ${ambush.task.targetNumber}, Difficulty 1, ${percent} chance. Success: an automatic hit (an Injury). Failure: the Klingons act first.`
          : ambush.reason,
        onClick: () => {
          dispatch({ type: 'ambush', targetId: enemy.id })
          closeRing()
          setMode(null)
        },
      },
    ]
  }

  const aimEffect = aimRerollsFor(weapon) > 1 ? `may reroll up to two dice on the next attack this turn (${weapon.name} is Accurate)` : AIM_TEXT
  const aimTitle = state.turn.aimReroll ? `Aimed: you ${aimEffect}.` : `Aim (${typeName('aim')} action): you ${aimEffect}.`

  // Scan shows what is in plain view at once; on an enemy not yet scanned it also sets up the Scan task (Confirm rolls it).
  // Once scanned, it only shows and hides the card, which then holds everything the scan found.
  const scanButton = (enemy) => {
    const scanned = isScanned(state, enemy.id)
    const setUp = mode === 'scan' && ringInfo
    const scanTask = !scanned && previewScan(state, active.id, enemy.id)
    return {
      enabled: true,
      active: ringInfo,
      ...(scanTask ? { details: taskDetails(scanTask.task) } : {}),
      title: scanned
        ? 'Show what the scan found: Protection, weapons and tactics.'
        : `Scan (${typeName('scan')} action): Reason + Science, Difficulty ${scanTask.task.difficulty}. Success shows its Protection, weapons and tactics for the rest of the fight.`,
      onClick: () => {
        if (scanned || setUp) {
          setRingInfo(!ringInfo)
          if (setUp) setMode('attack')
          return
        }
        setMode('scan')
        setTaskPick(enemy.id)
        setRingInfo(true)
      },
    }
  }

  // Persuade / Intimidate set up the task on this enemy (Confirm rolls it); pressing the lit button again cancels.
  const socialButton = (enemy, kind) => {
    const task = previewSocial(state, active.id, enemy.id, kind)
    const setUp = mode === kind
    return {
      enabled: task.available || setUp,
      active: setUp,
      details: [`${task.task.attribute.name} + ${task.task.department.name}`, `TN ${task.task.targetNumber}`],
      title: task.available ? `${actionData.actions.find((entry) => entry.id === kind).description} (${typeName(kind)} action)` : task.reason,
      onClick: () => {
        setMode(setUp ? 'attack' : kind)
        setTaskPick(enemy.id)
        setRingInfo(false)
      },
    }
  }

  const enemyRingButtons = (enemy) => {
    const behaviour = {
      persuade: socialButton(enemy, 'persuade'),
      intimidate: socialButton(enemy, 'intimidate'),
      aim: {
        enabled: canAim(state, active),
        active: state.turn.aimReroll,
        title: aimTitle,
        onClick: () => dispatch({ type: 'aim' }),
      },
      useItem: { enabled: false, active: false, title: 'Use Item: not built yet.', onClick: undefined },
      scan: scanButton(enemy),
    }
    const shot = enemy.id === targetAttack?.target.id ? targetAttack : previewAttack(state, active.id, enemy.id, weapon.id)
    return enemyButtonDefs(weapon, { task: shot.task, opposed: Boolean(shot.opposition) }).map((button) => ({
      ...button,
      ...(behaviour[button.id] ?? {
        enabled: !attackBlock && canAfford(state, active, 'attack'),
        active: attackMode === button.id,
        title: attackBlock ?? `Fire ${attackModeName(weapon, button.id)} (${typeName('attack')} action)${purchase.bonusDice ? `, rolling ${purchaseCheck.dice}d20` : ''}.`,
        onClick: () => fireAttack(enemy.id, button.id),
      }),
    }))
  }

  const enemyRingInfo = (enemy) => {
    const rows = [
      ['Condition', visibleCondition(state, enemy)],
      ['Cover', enemy.inCover ? 'In cover' : 'No cover'],
    ]
    const report = isScanned(state, enemy.id) ? scanReport(state, active, enemy) : null
    if (report) rows.push(...report.rows)
    else rows.push(['Scan', 'Not scanned'])
    if (preview?.injuries) preview.injuries.forEach((injury) => rows.push([`On a hit (${getInjuryMode(injury.type).name})`, `Severity ${injury.severity}${injury.protection ? ` (Protection ${injury.protection})` : ''}`]))
    if (preview?.task) {
      rows.push(['Range', `${preview.band.name}, ${preview.distance} tiles`], ['Your roll', `TN ${preview.task.targetNumber}, Difficulty ${preview.task.difficulty}`])
      if (state.turn.aimReroll) rows.push(['Aimed', aimRerollsFor(preview.weapon) > 1 ? 'reroll up to two dice (Accurate)' : 'reroll one die'])
      if (purchase.bonusDice) rows.push(['Dice', `${purchaseCheck.dice}d20 (${purchase.bonusDice} bought)`])
      rows.push(['Chance to hit', preview.available ? `${Math.round(getHitChance(state, active.id, preview, { bonusDice: purchase.bonusDice }) * 100)}%` : 'No shot'])
      if (preview.available && preview.opposition) rows.push([preview.opposition.when === 'targetInCover' ? 'In cover' : 'Defends', 'their opposed roll is counted in the chance'])
    }
    return { title: enemy.character.name, rows, tips: report?.tips ?? [] }
  }

  const allyRingButtons = (ally) => {
    const name = ally.character.name
    const assistBlock = !canAssist(state, active, ally)
      ? state.assists[ally.id]
        ? `${name} is already being assisted this round.`
        : `${name} has no turn left this round.`
      : canAfford(state, active, 'assist')
        ? null
        : 'No Major action left.'
    const buttons = [
      {
        id: 'assist',
        label: 'Assist',
        icon: 'assist',
        enabled: !assistBlock,
        title: assistBlock ?? `Assist (Major action): ${name}'s next task this round adds your 1d20.`,
        onClick: () => {
          dispatch({ type: 'assist', allyId: ally.id })
          closeRing()
          setMode(null)
        },
      },
    ]
    if (canSwitchTo(ally.id)) {
      buttons.push({
        id: 'switch',
        label: 'Switch',
        icon: 'switch',
        enabled: true,
        title: `Hand the turn to ${name}; ${active.character.name} keeps any actions left for later this turn.`,
        onClick: () => {
          closeRing()
          setMode(null)
          selectPartyMember(ally.id)
        },
      })
    }
    return buttons
  }

  const selfRingButtons = () => {
    const behaviour = {
      move: {
        enabled: availability.move,
        active: mode === 'move',
        title: availability.move ? 'Move (Minor action): click a highlighted tile to walk there.' : (getMovementBlock(state, active, 'move') ?? 'No tile to move to.'),
        onClick: () => {
          setMode('move')
          setDestination(null)
          closeRing()
        },
      },
      sprint: {
        enabled: availability.sprint,
        active: mode === 'sprint',
        title: availability.sprint
          ? `Sprint (Major action): run up to ${getSprintTiles(active.character)} tiles; no Move this turn after it. Click a highlighted tile.`
          : (getMovementBlock(state, active, 'sprint') ?? 'No tile to sprint to.'),
        onClick: () => {
          setMode('sprint')
          setDestination(null)
          closeRing()
        },
      },
      aim: {
        enabled: canAim(state, active),
        active: state.turn.aimReroll,
        title: aimTitle,
        onClick: () => dispatch({ type: 'aim' }),
      },
      assist: {
        enabled: availability.assist,
        title: unavailableReasons.assist ?? (availability.assist ? 'Assist (Major action): pick a party member; their next task this round adds your 1d20.' : 'No Major action left.'),
        onClick: () => selectAction('assist'),
      },
      guard: {
        enabled: canAfford(state, active, 'guard'),
        active: mode === 'guard',
        title: canAfford(state, active, 'guard') ? 'Guard (Major action): Insight + Security; attacks against you, or an ally within Reach, get +1 Difficulty.' : 'No Major action left.',
        onClick: () => openTask('guard'),
      },
      firstAid: {
        enabled: canAfford(state, active, 'firstAid'),
        active: mode === 'firstAid',
        title: canAfford(state, active, 'firstAid') ? 'First Aid (Major action): Daring + Medicine on an ally within Reach.' : 'No Major action left.',
        onClick: () => openTask('firstAid'),
      },
      direct: {
        enabled: !directReason,
        active: mode === 'direct',
        title: directReason ?? 'Direct (Major action, 1 Momentum): an ally takes one Major action now; you assist with Control + Command.',
        onClick: () => openTask('direct'),
      },
      interact: {
        enabled: objectList.some(({ actions }) => actions.some((entry) => entry.available && entry.affordable)),
        active: mode === 'interact',
        title: `Use an object in reach: ${objectList.map(({ definition }) => definition.name).join(', ')}.`,
        onClick: () => openTask('interact'),
      },
      extraMinor: {
        enabled: !extraMinorReason,
        title: extraMinorReason ?? `Extra Minor (${EXTRA_ACTIONS.extraMinorCost} Momentum, pool ${state.resources.momentum}): one more minor action this turn (once per turn; not a minor action already taken).`,
        onClick: () => dispatch({ type: 'buyExtraMinor' }),
      },
      secondMajor: {
        enabled: !secondMajorReason,
        title:
          secondMajorReason ??
          `Second Major (${EXTRA_ACTIONS.secondMajorCost} Momentum, pool ${state.resources.momentum}): one more major action this turn; its task is +${EXTRA_ACTIONS.secondMajorDifficulty} Difficulty.`,
        onClick: () => dispatch({ type: 'buySecondMajor' }),
      },
      endTurn: {
        enabled: availability.endTurn,
        title: state.directed ? 'Pass on the directed action (the Momentum stays spent).' : 'End Turn (free): end this character\'s turn with any actions left unused.',
        onClick: () => {
          closeRing()
          dispatch({ type: 'endTurn' })
        },
      },
    }
    // Contextual actions appear only when there is something to do: someone within Reach to treat, the authority to
    // Direct, an object in reach, an extra action that can be bought now.
    const notNow = { firstAid: !firstAidOptions.length, direct: !isCommander, interact: !objectList.length, extraMinor: Boolean(extraMinorReason), secondMajor: Boolean(secondMajorReason) }
    // Attack: one button per firing mode the weapon's data allows (Stun, Deadly or both). Picking one only chooses the
    // mode; the attack is fired at the target from the task panel (or the enemy's own buttons).
    const attackButtons = () => {
      const affordable = canAfford(state, active, 'attack')
      return weapon.injuryModes.map((modeId) => ({
        id: `attack-${modeId}`,
        label: getInjuryMode(modeId).name,
        details: attackModeDetails(weapon, modeId, ringAttackRoll),
        icon: modeId === 'stun' ? 'stun' : 'deadly',
        tone: modeId,
        enabled: affordable,
        active: attackMode === modeId,
        title: affordable ? `Attack with ${attackModeName(weapon, modeId)} (${typeName('attack')} action): then pick the target and Fire.` : 'No Major action left.',
        onClick: () => {
          const leaving = attackMode === modeId
          setAttackChoice(leaving ? null : modeId)
          setMode(leaving ? null : 'attack')
          setDestination(null)
          closeRing()
        },
      }))
    }
    // The roll a task button would make, under its label; the task panel explains it in full.
    const preparedDetails = (prepared) => taskDetails({ ...prepared.task, difficulty: prepared.difficulty })
    const details = {
      guard: () => preparedDetails(previewGuard(state, active.id, active.id).prepared),
      firstAid: () => preparedDetails(previewFirstAid(state, active.id, firstAidOptions[0].target.id, firstAidOptions[0].mode).prepared),
      direct: () => taskDetails(prepareAssist(active.character, COMBAT_TASKS.directAssist, active.condition).task, { showDifficulty: false }),
    }
    return actionData.selfRing.filter((id) => !notNow[id]).flatMap((id) => {
      if (id === 'attack') return attackButtons()
      const action = actionData.actions.find((entry) => entry.id === id)
      return {
        id,
        label: action.name,
        icon: id,
        ...(details[id] ? { details: details[id]() } : {}),
        ...(behaviour[id] ?? { enabled: false, title: `${action.name}: not in this prototype yet.` }),
      }
    })
  }
  // A challenge object in reach: one button per approach it offers now; picking one opens it in the Task panel.
  const objectRingButtons = (objectId) => {
    const entry = objectList.find(({ definition }) => definition.id === objectId)
    return (entry?.actions ?? []).map(({ action, available, reason, cost, affordable }) => ({
      id: action.id,
      label: action.label,
      icon: 'interact',
      enabled: available && affordable,
      active: mode === 'interact' && taskPick === `${objectId}:${action.id}`,
      title: !available ? reason : !affordable ? `No ${ACTION_TYPE_NAMES[cost]} action left.` : `${action.label} (${ACTION_TYPE_NAMES[cost]} action): ${action.description}`,
      onClick: () => openTask('interact', `${objectId}:${action.id}`),
    }))
  }
  // A destructible object's ring (combat/actions/AttackObjectAction.js): Fire with the weapon in hand, the attack's cost.
  const destructibleRingButtons = (objectId) => {
    const record = state.environment.destructibles[objectId]
    const blocked = combatActionFor('attackObject').unavailableReason(state, active, { objectId, weaponId: weapon.id })
    const shot = previewObjectAttack(state, active.id, objectId, weapon.id)
    const blast = record.explosion ? ` It explodes at 0 Structure (radius ${record.explosion.radius}), catching everyone near it.` : ''
    const title = blocked ? `Fire: ${blocked}` : `Fire at the ${record.name} (${weapon.name}, Difficulty ${shot.task.difficulty}): ${shot.damage} Structure on a hit.${blast}`
    return [
      {
        id: 'fire',
        label: 'Fire',
        icon: 'attack',
        enabled: !blocked,
        title,
        onClick: () => {
          dispatch({ type: 'attackObject', objectId, weaponId: weapon.id, purchase })
          closeRing()
        },
      },
    ]
  }
  const destructibleRingInfo = (objectId) => {
    const record = state.environment.destructibles[objectId]
    return {
      title: record.name,
      rows: [
        ['Structure', `${record.structure} / ${record.maxStructure}`],
        ['Resistance', String(record.resistance)],
      ],
      tips: [],
    }
  }
  return { ambushRingButtons, enemyRingButtons, enemyRingInfo, allyRingButtons, selfRingButtons, objectRingButtons, destructibleRingButtons, destructibleRingInfo }
}
