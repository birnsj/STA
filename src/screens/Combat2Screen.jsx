import { useEffect, useReducer, useRef, useState } from 'react'
import { getPlayer, previewPlayerAction, TUNING } from '../combat2/actions2.js'
import { combat2Reducer, createCombat2 } from '../combat2/combat2State.js'
import { tileKey } from '../combat2/map2.js'
import { choosePlayerAction } from '../combat2/playerAI2.js'
import ActionBar2 from '../components/combat2/ActionBar2.jsx'
import ActionDetail2 from '../components/combat2/ActionDetail2.jsx'
import AutoControls2 from '../components/combat2/AutoControls2.jsx'
import Board2 from '../components/combat2/Board2.jsx'
import CharacterCard2 from '../components/combat2/CharacterCard2.jsx'
import EnemyPanel2 from '../components/combat2/EnemyPanel2.jsx'
import { buildOverlay, getFocusTargetId } from '../components/combat2/overlay2.js'
import Result2 from '../components/combat2/Result2.jsx'
import Setup2 from '../components/combat2/Setup2.jsx'
import { stepDuration } from '../components/combat2/timing2.js'
import '../components/combat2/combat2.css'
import WeatherFx from '../effects/WeatherFx.jsx'
import { weatherFor } from '../maps/mapWeather.js'

// Presentation delays only (divided by the Auto Combat speed); the combat itself never waits on them.
const ENEMY_PAUSE_MS = 450
const AUTO_THINK_MS = 650
const RESULT_DELAY_MS = 1400
const newSeed = () => Math.floor(Math.random() * 2 ** 32)

function Fight({ player, map, seed, auto, speed, autoControls, onRestart, onExit }) {
  const [state, dispatch] = useReducer(combat2Reducer, { player, seed, map }, createCombat2)
  // UI state only: the chosen action, the clicked target, and what the pointer is over.
  const [actionId, setActionId] = useState(null)
  const [targetId, setTargetId] = useState(null)
  const [hoverTile, setHoverTile] = useState(null)
  const [hoverUnitId, setHoverUnitId] = useState(null)
  const [threatId, setThreatId] = useState(null)
  const [resultVisible, setResultVisible] = useState(false)
  const stepMark = useRef(0)
  const pace = auto === 'off' ? 1 : speed
  const manual = auto === 'off'

  // Enemies act one at a time, each after the previous one's walk and attack have played.
  const { phase, enemyQueue, events, outcome } = state
  useEffect(() => {
    if (phase !== 'enemy' || !enemyQueue.length || auto === 'paused') return undefined
    const fresh = events.filter((event) => event.id > stepMark.current)
    const timer = setTimeout(() => {
      stepMark.current = events.at(-1)?.id ?? 0
      dispatch({ type: 'enemyStep' })
    }, (ENEMY_PAUSE_MS + stepDuration(fresh)) / pace)
    return () => clearTimeout(timer)
  }, [phase, enemyQueue, events, auto, pace])

  // Auto Combat: the AI plays the character one action at a time, after the previous action has played.
  useEffect(() => {
    if (auto !== 'running' || state.phase !== 'player' || state.outcome) return undefined
    const fresh = state.events.filter((event) => event.id > stepMark.current)
    const timer = setTimeout(() => {
      stepMark.current = state.events.at(-1)?.id ?? 0
      dispatch(choosePlayerAction(state))
    }, (AUTO_THINK_MS + stepDuration(fresh)) / speed)
    return () => clearTimeout(timer)
  }, [auto, speed, state])

  useEffect(() => {
    if (!outcome) return undefined
    const timer = setTimeout(() => setResultVisible(true), RESULT_DELAY_MS / pace)
    return () => clearTimeout(timer)
  }, [outcome, pace])

  const ui = { actionId: manual ? actionId : null, targetId, hoverTile, hoverUnitId, threatId }
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
    if (manual && actionId === 'move' && overlay.tileSets.reach?.has(tileKey(position))) {
      dispatch({ type: 'move', destination: position })
      clearAction()
    }
  }
  const onUnitClick = (unitId) => {
    const unit = state.units[unitId]
    if (unit.side !== 'enemy') return
    if (manual && ['phaser', 'melee', 'push'].includes(actionId) && previewPlayerAction(state, actionId, unitId).available) {
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
        speed={pace}
        onTileClick={onTileClick}
        onTileHover={setHoverTile}
        onUnitClick={onUnitClick}
        onUnitHover={setHoverUnitId}
        onRightClick={clearAction}
      />
      <WeatherFx fx={weatherFor(state.weather).fx} />
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
        <div className="c2-objectives-actions">
          <button type="button" className="c2-button is-small" onClick={onExit}>
            Return to Menu
          </button>
          <AutoControls2 auto={auto} speed={speed} disabled={Boolean(outcome)} {...autoControls} onStart={() => {
            clearAction()
            autoControls.onStart()
          }} />
        </div>
      </div>
      <div className="c2-right">
        <EnemyPanel2 state={state} onHover={setThreatId} />
        <ActionDetail2 state={state} actionId={manual ? actionId : null} targetId={focusTargetId} hoverTile={hoverTile} onActivate={() => {
          dispatch({ type: 'act', actionId: 'interact' })
          clearAction()
        }} />
      </div>
      <div className="c2-bottom">
        <CharacterCard2 unit={playerUnit} state={state} actionId={manual ? actionId : null} />
        <ActionBar2 state={state} character={playerUnit.character} actionId={manual ? actionId : null} locked={!manual} onSelect={(id) => {
          setActionId(id)
          setTargetId(null)
        }} onEndTurn={endTurn} />
      </div>
      {outcome && resultVisible && <Result2 outcome={outcome} round={state.round} onRestart={onRestart} onExit={onExit} />}
    </div>
  )
}

// Combat Type 2: separate experimental prototype (its own rules, state and UI) played on any map file. Shares only the
// character model, map tiles, task resolver, camera and sounds with the rest of the app.
// mapId: the episode's map, chosen in Load Episode.
export default function Combat2Screen({ savedCharacters, mapId, onBack, onExit }) {
  // UI state: the chosen character and map, the current fight's seed (a new seed restarts the fight), and Auto Combat
  // ('off' | 'running' | 'paused', plus its speed), kept here so a restarted fight carries on in Auto Combat.
  const [setup, setSetup] = useState(null)
  const [seed, setSeed] = useState(newSeed)
  const [auto, setAuto] = useState('off')
  const [speed, setSpeed] = useState(1)
  if (!setup) {
    return (
      <div className="c2-screen">
        <Setup2 savedCharacters={savedCharacters} initialCharacter={null} mapId={mapId} onStart={(player, map) => setSetup({ player, map })} onBack={onBack} />
      </div>
    )
  }
  const autoControls = {
    onStart: () => setAuto('running'),
    onPause: () => setAuto('paused'),
    onResume: () => setAuto('running'),
    onStop: () => setAuto('off'),
    onSpeed: setSpeed,
  }
  return <Fight key={seed} player={setup.player} map={setup.map} seed={seed} auto={auto} speed={speed} autoControls={autoControls} onRestart={() => setSeed(newSeed())} onExit={onExit} />
}
