import { useEffect, useReducer, useRef, useState } from 'react'
import { getPlayer, previewPlayerAction, TUNING } from '../combat2/actions2.js'
import { combat2Reducer, createCombat2 } from '../combat2/combat2State.js'
import { tileKey } from '../combat2/map2.js'
import ActionBar2 from '../components/combat2/ActionBar2.jsx'
import ActionDetail2 from '../components/combat2/ActionDetail2.jsx'
import Board2 from '../components/combat2/Board2.jsx'
import CharacterCard2 from '../components/combat2/CharacterCard2.jsx'
import EnemyPanel2 from '../components/combat2/EnemyPanel2.jsx'
import { buildOverlay, getFocusTargetId } from '../components/combat2/overlay2.js'
import Result2 from '../components/combat2/Result2.jsx'
import Setup2 from '../components/combat2/Setup2.jsx'
import { stepDuration } from '../components/combat2/timing2.js'
import '../components/combat2/combat2.css'

const ENEMY_PAUSE_MS = 450
const RESULT_DELAY_MS = 1400
const newSeed = () => Math.floor(Math.random() * 2 ** 32)

function Fight({ player, seed, onRestart, onExit }) {
  const [state, dispatch] = useReducer(combat2Reducer, { player, seed }, createCombat2)
  // UI state only: the chosen action, the clicked target, and what the pointer is over.
  const [actionId, setActionId] = useState(null)
  const [targetId, setTargetId] = useState(null)
  const [hoverTile, setHoverTile] = useState(null)
  const [hoverUnitId, setHoverUnitId] = useState(null)
  const [threatId, setThreatId] = useState(null)
  const [resultVisible, setResultVisible] = useState(false)
  const stepMark = useRef(0)

  // Enemies act one at a time, each after the previous one's walk and attack have played.
  const { phase, enemyQueue, events, outcome } = state
  useEffect(() => {
    if (phase !== 'enemy' || !enemyQueue.length) return undefined
    const fresh = events.filter((event) => event.id > stepMark.current)
    const timer = setTimeout(() => {
      stepMark.current = events.at(-1)?.id ?? 0
      dispatch({ type: 'enemyStep' })
    }, ENEMY_PAUSE_MS + stepDuration(fresh))
    return () => clearTimeout(timer)
  }, [phase, enemyQueue, events])

  useEffect(() => {
    if (!outcome) return undefined
    const timer = setTimeout(() => setResultVisible(true), RESULT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [outcome])

  const ui = { actionId, targetId, hoverTile, hoverUnitId, threatId }
  const overlay = buildOverlay(state, ui)
  const focusTargetId = getFocusTargetId(state, ui)
  const playerUnit = getPlayer(state)

  const clearAction = () => {
    setActionId(null)
    setTargetId(null)
  }
  const endTurn = () => {
    stepMark.current = events.at(-1)?.id ?? 0
    clearAction()
    dispatch({ type: 'endTurn' })
  }
  const onTileClick = (position) => {
    if (actionId === 'move' && overlay.tileSets.reach?.has(tileKey(position))) {
      dispatch({ type: 'move', destination: position })
      clearAction()
    }
  }
  const onUnitClick = (unitId) => {
    const unit = state.units[unitId]
    if (unit.side !== 'enemy') return
    if (['phaser', 'melee', 'push'].includes(actionId) && previewPlayerAction(state, actionId, unitId).available) {
      dispatch({ type: 'act', actionId, targetId: unitId })
      clearAction()
      return
    }
    setTargetId(unitId)
  }

  return (
    <div className="c2-screen">
      <Board2
        state={state}
        overlay={overlay}
        onTileClick={onTileClick}
        onTileHover={setHoverTile}
        onUnitClick={onUnitClick}
        onUnitHover={setHoverUnitId}
        onRightClick={clearAction}
      />
      <div className="c2-panel c2-objectives">
        <p className="c2-panel-title">{state.encounterName}</p>
        <ul>
          {state.objectives.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
        <p className={`c2-turn-banner is-${state.phase}`}>
          Round {state.round} &middot; {state.phase === 'enemy' ? 'Enemy Turn' : state.phase === 'over' ? 'Combat Over' : `Your Turn (${state.ap} / ${TUNING.actionPoints} AP)`}
        </p>
        {state.hazard.active && <p className="c2-hazard-note">EPS grating discharging until your next turn</p>}
        <button type="button" className="c2-button is-small" onClick={onExit}>
          Return to Menu
        </button>
      </div>
      <div className="c2-right">
        <EnemyPanel2 state={state} onHover={setThreatId} />
        <ActionDetail2 state={state} actionId={actionId} targetId={focusTargetId} hoverTile={hoverTile} onActivate={() => {
          dispatch({ type: 'act', actionId: 'interact' })
          clearAction()
        }} />
      </div>
      <div className="c2-bottom">
        <CharacterCard2 unit={playerUnit} state={state} actionId={actionId} />
        <ActionBar2 state={state} character={playerUnit.character} actionId={actionId} onSelect={(id) => {
          setActionId(id)
          setTargetId(null)
        }} onEndTurn={endTurn} />
      </div>
      {outcome && resultVisible && <Result2 outcome={outcome} round={state.round} onRestart={onRestart} onExit={onExit} />}
    </div>
  )
}

// Combat Type 2: separate experimental prototype (its own map, rules, state and UI). Shares only the character model,
// task resolver, camera and sounds with the rest of the app.
export default function Combat2Screen({ savedCharacters, onBack, onExit }) {
  // UI state: the chosen character and the current fight's seed (a new seed restarts the fight).
  const [player, setPlayer] = useState(null)
  const [seed, setSeed] = useState(newSeed)
  if (!player) {
    return (
      <div className="c2-screen">
        <Setup2 savedCharacters={savedCharacters} initialCharacter={null} onStart={setPlayer} onBack={onBack} />
      </div>
    )
  }
  return <Fight key={seed} player={player} seed={seed} onRestart={() => setSeed(newSeed())} onExit={onExit} />
}
