import { useEffect, useReducer, useState } from 'react'
import { samePosition, tileKey } from '../combat/battleMap.js'
import {
  canAct,
  canTakeCoverNow,
  canUseMajor,
  canUseMinor,
  getActiveCombatant,
  getEncounter,
  getOpponents,
  getPathTo,
  getReachable,
  getTurnGroup,
  getTurnGroupRange,
  getTurnOf,
  isActive,
  isTurnFinished,
  previewAttack,
  DEFAULT_ENCOUNTER_ID,
} from '../combat/combatState.js'
import { autoCombatReducer } from '../combat/autoCombat.js'
import { getMovementTiles } from '../combat/movementSystem.js'
import { tileDistance } from '../combat/rangeSystem.js'
import { getWeapon } from '../combat/weaponSystem.js'
import Battlefield from '../components/combat/Battlefield.jsx'
import CombatResultModal from '../components/combat/CombatResultModal.jsx'
import CombatSetup from '../components/combat/CombatSetup.jsx'
import { ActionsPanel, SelectedCharacterPanel, TargetPanel, TaskPanel } from '../components/combat/CombatSidebar.jsx'
import DebugPanel from '../components/combat/DebugPanel.jsx'
import HowToPlay from '../components/combat/HowToPlay.jsx'
import { getCombatHint } from '../combat/combatHints.js'
import ObjectivesPanel from '../components/combat/ObjectivesPanel.jsx'
import PartyBar from '../components/combat/PartyBar.jsx'
import ResourceIndicators from '../components/combat/ResourceIndicators.jsx'
import RollPanel from '../components/combat/RollPanel.jsx'
import TurnOrderStrip from '../components/combat/TurnOrderStrip.jsx'
import AutoCombatControls from '../components/combat/AutoCombatControls.jsx'
import { MAX_SEED } from '../rules/seededRandom.js'

// Presentation delays only (divided by the Auto Combat speed). The combat itself never waits on them.
const AI_STEP_MS = 700
const AI_ROLL_MS = 1100
const MOVE_TILE_MS = 140
const AUTO_END_TURN_MS = 1200
// A fight's seed is drawn when it starts (never during render) unless the player typed one in.
const newSeed = () => Math.floor(Math.random() * MAX_SEED)

// The delay before the next AI step: long enough to read a roll, or to watch a move finish.
function aiDelay(state) {
  if (state.pending) return AI_ROLL_MS
  const justMoved = state.lastMove && state.lastMove.key === state.log.length - 1
  return justMoved ? Math.max(AI_STEP_MS, (state.lastMove.path.length - 1) * MOVE_TILE_MS + 300) : AI_STEP_MS
}

// The camera centres on whoever is acting, and on the middle of the line of fire when a shot is fired.
function cameraFocus(state, turnKey, active) {
  // Stays on the shot through rerolls and the result (one attack per turn, so the key is stable until the next action).
  const action = state.lastAction
  const roll = state.pending ?? (state.result?.closed ? null : state.result)
  if (roll && ['attack', 'reroll', 'resolve', 'momentumHit'].includes(action?.type)) {
    const from = state.combatants[roll.attackerId].position
    const to = state.combatants[roll.targetId].position
    return { key: `${turnKey}:shot`, position: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 } }
  }
  return { key: `${turnKey}:${state.lastMove?.key ?? ''}`, position: active.position }
}

// Turn status of each active party member this round, for the party bar and the map:
// during the party's group turn each member is acting / ready / done with their used actions; once the group has
// finished (enemy turns later in the round) every member who acted is shown as done.
function getPartyTurnInfo(state, active) {
  if (state.outcome) return {}
  const { start, ids } = getTurnGroupRange(state)
  // Ending a turn forfeits any unused action, so a finished member shows no points left.
  const spent = { minorUsed: true, majorUsed: true }
  if (active.side === 'player') {
    return Object.fromEntries(
      ids.map((id) => {
        const finished = isTurnFinished(state, id)
        return [id, { state: finished ? 'done' : id === active.id ? 'acting' : 'ready', turn: finished ? spent : getTurnOf(state, id) }]
      }),
    )
  }
  return Object.fromEntries(
    state.order
      .slice(0, start)
      .filter((id) => state.combatants[id].side === 'player' && isActive(state.combatants[id]))
      .map((id) => [id, { state: 'done', turn: spent }]),
  )
}

function nearestOpponentId(state, combatant) {
  const opponents = getOpponents(state, combatant).sort((a, b) => tileDistance(combatant.position, a.position) - tileDistance(combatant.position, b.position))
  return opponents[0]?.id ?? null
}

function Battle({ state, dispatch, showHelpOnStart, onHelpSeen, onRestart, onChangeCharacter, onExit }) {
  const active = getActiveCombatant(state)
  // Auto Combat (UI state): 'off' | 'running' | 'paused'. While on, the AI also plays the party.
  const [auto, setAuto] = useState('off')
  const [speed, setSpeed] = useState(1)
  const aiControlled = active.controller === 'ai' || auto !== 'off'
  const isPlayerTurn = !aiControlled && !state.outcome
  // UI state only: the chosen action, target, weapon, injury mode, move destination, hovered tile, panels and camera follow.
  // chosenMode null = the default (Move while the minor action is unused); 'none' = the player deselected everything.
  const [chosenMode, setMode] = useState(null)
  const defaultMode = isPlayerTurn && canUseMinor(state, active) ? 'move' : null
  const mode = chosenMode === 'none' ? null : (chosenMode ?? defaultMode)
  const [targetId, setTargetId] = useState(null)
  const [weaponIds, setWeaponIds] = useState({})
  const [injuryModes, setInjuryModes] = useState({})
  const [destination, setDestination] = useState(null)
  const [hoverTile, setHoverTile] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [debugOpen, setDebugOpen] = useState(false)
  const [followCamera, setFollowCamera] = useState(true)
  const [helpOpen, setHelpOpen] = useState(showHelpOnStart)
  const closeHelp = () => {
    setHelpOpen(false)
    onHelpSeen()
  }

  const weapon = getWeapon(weaponIds[active.id] ?? active.weaponIds[0])
  const injuryMode = weapon.injuryModes.includes(injuryModes[weapon.id]) ? injuryModes[weapon.id] : weapon.injuryModes[0]
  const target = targetId && isActive(state.combatants[targetId]) ? state.combatants[targetId] : null

  // Each turn starts on the default action (Move) with the nearest enemy targeted.
  const turnKey = `${state.round}:${state.turnIndex}`
  const [shownTurn, setShownTurn] = useState(turnKey)
  if (shownTurn !== turnKey) {
    setShownTurn(turnKey)
    setMode(null)
    setDestination(null)
    if (active.controller === 'player') setTargetId(nearestOpponentId(state, active))
  }
  if (isPlayerTurn && !target && targetId !== nearestOpponentId(state, active)) setTargetId(nearestOpponentId(state, active))

  // AI turns (enemies, plus the party during Auto Combat): one step at a time, paced so it can be followed.
  // Paused while How to Play is open or Auto Combat is paused. The step itself is pure (autoCombat.stepAI).
  useEffect(() => {
    if (state.outcome || !aiControlled || helpOpen || auto === 'paused') return undefined
    const timer = setTimeout(() => dispatch({ type: 'aiStep' }), aiDelay(state) / speed)
    return () => clearTimeout(timer)
  }, [state, aiControlled, dispatch, helpOpen, auto, speed])

  const reachable = mode === 'move' && isPlayerTurn ? getReachable(state, active) : null
  const pathTarget = destination ?? hoverTile
  const movePath = reachable && pathTarget && reachable.has(tileKey(pathTarget)) && !samePosition(pathTarget, active.position) ? getPathTo(state, active, pathTarget) : null
  const preview = mode === 'attack' && target ? previewAttack(state, active.id, target.id, weapon.id) : null

  const overlay = {
    reachableKeys: reachable ? new Set([...reachable.keys()].filter((key) => key !== tileKey(active.position))) : null,
    pathKeys: movePath ? new Set(movePath.slice(1).map(tileKey)) : null,
    path: movePath,
    shot: preview ? { from: active.position, to: target.position, available: preview.available } : null,
  }

  const availability = {
    move: canUseMinor(state, active),
    aim: canUseMinor(state, active),
    takeCover: canTakeCoverNow(state, active),
    attack: canUseMajor(state, active),
    endTurn: canAct(state, active),
  }

  const selectAction = (id) => {
    if (id === 'endTurn') {
      dispatch({ type: 'endTurn' })
      return
    }
    setMode(mode === id ? 'none' : id)
    setDestination(null)
  }

  const confirmations = {
    attack: { enabled: Boolean(preview?.available) && availability.attack, run: () => dispatch({ type: 'attack', targetId: target.id, weaponId: weapon.id, injuryMode }) },
    move: { enabled: Boolean(movePath) && availability.move, run: () => dispatch({ type: 'move', destination: movePath[movePath.length - 1] }) },
    aim: { enabled: availability.aim, run: () => dispatch({ type: 'aim' }) },
    takeCover: { enabled: availability.takeCover, run: () => dispatch({ type: 'takeCover' }) },
  }
  const confirmation = confirmations[mode]
  const confirm = {
    enabled: Boolean(confirmation?.enabled),
    onConfirm: () => {
      confirmation.run()
      setMode(null)
      setDestination(null)
    },
  }

  // With Move selected (the default), clicking a reachable tile moves there at once.
  // Prototype: a finger has no hover preview, so on touch the first tap shows the path and a second tap on the same
  // tile moves; a mouse click moves at once.
  const handleTileClick = (tile, { touch = false } = {}) => {
    if (mode !== 'move' || !availability.move || !reachable?.has(tileKey(tile)) || samePosition(tile, active.position)) return
    if (touch && !(destination && samePosition(destination, tile))) {
      setDestination(tile)
      return
    }
    dispatch({ type: 'move', destination: tile })
    setMode(null)
    setDestination(null)
  }

  // During the party's turn, picking a party member who can still act hands them the turn.
  const groupIds = isPlayerTurn ? getTurnGroup(state) : []
  const canSwitchTo = (id) => id !== active.id && !state.pending && groupIds.includes(id) && !isTurnFinished(state, id)
  const turnInfo = getPartyTurnInfo(state, active)

  // Once both actions are spent the turn passes on by itself (to the next Ready member, else onward), after a pause
  // so the result can be read. If the attack that used up the turn earned a Momentum +1 Hit offer, it waits for the
  // player to spend it or press End Turn.
  const { result } = state
  const momentumHitOnOffer = Boolean(
    result && state.lastAction?.type === 'resolve' && !result.closed && result.passed && !result.extraHit && state.momentum > 0 && isActive(state.combatants[result.targetId]) && state.combatants[result.attackerId].side === 'player',
  )
  const turnUsedUp = isPlayerTurn && state.turn.minorUsed && state.turn.majorUsed && !state.pending && !momentumHitOnOffer
  useEffect(() => {
    if (!turnUsedUp || helpOpen) return undefined
    const timer = setTimeout(() => dispatch({ type: 'endTurn' }), AUTO_END_TURN_MS)
    return () => clearTimeout(timer)
  }, [turnUsedUp, helpOpen, dispatch])

  const selectPartyMember = (id) => {
    if (canSwitchTo(id)) {
      dispatch({ type: 'selectCombatant', combatantId: id })
      setSelectedId(null)
      return
    }
    setSelectedId(id)
  }

  const handleUnitClick = (id) => {
    const unit = state.combatants[id]
    if (unit.side === active.side) {
      selectPartyMember(id)
      return
    }
    setSelectedId(id)
    if (isPlayerTurn) setTargetId(id)
  }

  const cycleWeapon = () => {
    const index = active.weaponIds.indexOf(weapon.id)
    setWeaponIds({ ...weaponIds, [active.id]: active.weaponIds[(index + 1) % active.weaponIds.length] })
  }

  // Party bar in the order the party was picked (combatants are stored players first, in pick order).
  const party = Object.values(state.combatants).filter((combatant) => combatant.side === 'player')
  const shownCharacter = (selectedId && state.combatants[selectedId]) || active
  const encounter = getEncounter(state.encounterId)
  const rollBelongsToPlayer = Boolean((state.pending ?? state.result) && state.combatants[(state.pending ?? state.result).attackerId].controller === 'player')
  const hint = getCombatHint(state, { mode, preview, movePath, auto, othersReady: Object.values(turnInfo).some((info) => info.state === 'ready') })

  const startAuto = () => {
    setMode(null)
    setDestination(null)
    setAuto('running')
  }

  return (
    <div className="combat-screen">
      <Battlefield
        state={state}
        activeId={active.id}
        targetId={isPlayerTurn ? target?.id : (state.pending ?? state.result)?.targetId}
        selectedId={selectedId}
        turnInfo={active.side === 'player' ? turnInfo : {}}
        overlay={overlay}
        msPerTile={MOVE_TILE_MS / (auto === 'off' ? 1 : speed)}
        speed={auto === 'off' ? 1 : speed}
        focus={cameraFocus(state, turnKey, active)}
        followCamera={followCamera}
        onTileClick={handleTileClick}
        onTileHover={setHoverTile}
        onUnitClick={handleUnitClick}
      />
      <div className="combat-top-left">
        <ObjectivesPanel objectives={encounter.objectives} complete={state.outcome === 'victory'} />
        <ResourceIndicators
          momentum={state.momentum}
          threat={state.threat}
          canCancelThreat={isPlayerTurn && !state.pending && state.momentum > 0 && state.threat > 0}
          onCancelThreat={() => dispatch({ type: 'cancelThreat' })}
        />
      </div>
      <TurnOrderStrip state={state} />
      {hint && (
        <p className={`combat-hint${isPlayerTurn ? ' is-player-turn' : ''}`} aria-live="polite">
          {hint}
        </p>
      )}
      <div className="combat-top-right">
        <button
          type="button"
          className="combat-button is-small"
          aria-pressed={followCamera}
          title={followCamera ? 'The view moves to whoever is acting. Click to stop.' : 'The view stays where you put it. Click to follow whoever is acting.'}
          onClick={() => setFollowCamera(!followCamera)}
        >
          Camera: {followCamera ? 'Follow' : 'Free'}
        </button>
        <button type="button" className="combat-button is-small" onClick={() => setHelpOpen(true)}>
          How to Play
        </button>
        <button type="button" className="combat-button is-small" onClick={() => setDebugOpen(!debugOpen)}>
          Debug
        </button>
        <button type="button" className="combat-button is-small" onClick={onExit}>
          Exit
        </button>
      </div>
      <div className="combat-sidebar">
        <SelectedCharacterPanel combatant={shownCharacter} />
        <ActionsPanel
          availability={isPlayerTurn ? availability : {}}
          mode={mode}
          weapon={weapon}
          canCycleWeapon={isPlayerTurn && active.weaponIds.length > 1}
          highlightEndTurn={isPlayerTurn && state.turn.minorUsed && state.turn.majorUsed}
          turn={isPlayerTurn ? state.turn : null}
          onSelect={selectAction}
          onCycleWeapon={cycleWeapon}
        />
        <TargetPanel target={isPlayerTurn ? target : state.combatants[(state.pending ?? state.result)?.targetId] ?? null} />
        <TaskPanel
          mode={mode}
          isPlayerTurn={isPlayerTurn}
          autoTurn={auto !== 'off' && active.controller === 'player'}
          preview={preview}
          movePath={movePath}
          movement={getMovementTiles(active.character)}
          injuryMode={injuryMode}
          onInjuryMode={(modeId) => setInjuryModes({ ...injuryModes, [weapon.id]: modeId })}
          confirm={confirm}
        />
      </div>
      <PartyBar party={party} activeId={active.id} selectedId={selectedId} turnInfo={turnInfo} onSelect={selectPartyMember} />
      {!state.outcome && (
        <AutoCombatControls
          auto={auto}
          speed={speed}
          onStart={startAuto}
          onPause={() => setAuto('paused')}
          onResume={() => setAuto('running')}
          onStop={() => setAuto('off')}
          onSpeed={setSpeed}
        />
      )}
      <RollPanel
        state={state}
        playerControls={rollBelongsToPlayer && isPlayerTurn}
        onReroll={(dieIndex, source) => dispatch({ type: 'reroll', dieIndex, source })}
        onResolve={() => dispatch({ type: 'resolveAttack' })}
        onSpendMomentumHit={() => dispatch({ type: 'spendMomentumHit' })}
      />
      {debugOpen && <DebugPanel state={state} auto={auto} onClose={() => setDebugOpen(false)} />}
      {helpOpen && <HowToPlay onClose={closeHelp} />}
      {state.outcome && <CombatResultModal outcome={state.outcome} onRestart={onRestart} onChangeCharacter={onChangeCharacter} onExit={onExit} />}
    </div>
  )
}

export default function CombatScreen({ savedCharacters, onExit }) {
  // UI state: the chosen party (RuntimeCharacters) and the running combat. Never saved or exported.
  const [party, setParty] = useState([])
  // fixedSeed: the seed typed on the setup screen (null = a new random seed every fight). runId remounts Battle per fight.
  const [fixedSeed, setFixedSeed] = useState(null)
  const [runId, setRunId] = useState(0)
  const [state, dispatch] = useReducer(autoCombatReducer, null)
  const [phase, setPhase] = useState('setup')
  // How to Play opens by itself only for the first fight after opening Load Episode.
  const [helpSeen, setHelpSeen] = useState(false)

  const start = (members, seed) => {
    setParty(members)
    setFixedSeed(seed)
    setRunId(runId + 1)
    dispatch({ type: 'restart', options: { encounterId: DEFAULT_ENCOUNTER_ID, players: members, seed: seed ?? newSeed() } })
    setPhase('battle')
  }

  if (phase === 'setup' || !state) {
    return <CombatSetup savedCharacters={savedCharacters} initialParty={party} initialSeed={fixedSeed} onStart={start} onExit={onExit} />
  }
  return (
    <Battle
      key={runId}
      state={state}
      dispatch={dispatch}
      showHelpOnStart={!helpSeen}
      onHelpSeen={() => setHelpSeen(true)}
      onRestart={() => start(party, fixedSeed)}
      onChangeCharacter={() => setPhase('setup')}
      onExit={onExit}
    />
  )
}
