import { ENEMY_AIS, PARTY_AIS } from '../../combat/autoCombat.js'

const AUTO_SPEEDS = [1, 2, 4]

// Test option: which AI plays a side, so different AIs can be compared on the same fight (same seed).
function AIPicker({ label, options, value, onChange }) {
  return (
    <label className="auto-ai">
      <span className="auto-ai-label">{label}</span>
      {/* The box is narrower than the longest AI name, so the full name is on the tooltip. */}
      <select className="auto-ai-select" title={options.find((ai) => ai.id === value)?.name} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((ai) => (
          <option key={ai.id} value={ai.id}>
            {ai.name}
          </option>
        ))}
      </select>
    </label>
  )
}

// The party AI only plays during Auto Combat; the enemy AI plays every enemy turn.
function AIPickers({ partyAI, onPartyAI, enemyAI, onEnemyAI }) {
  return (
    <>
      <AIPicker label="Party AI" options={PARTY_AIS} value={partyAI} onChange={onPartyAI} />
      <AIPicker label="Enemy AI" options={ENEMY_AIS} value={enemyAI} onChange={onEnemyAI} />
    </>
  )
}

// auto: 'off' | 'running' | 'paused'. Speed only shortens presentation delays; every rule still runs.
export default function AutoCombatControls({ auto, speed, partyAI, onPartyAI, enemyAI, onEnemyAI, onStart, onPause, onResume, onStop, onSpeed }) {
  const pickers = <AIPickers partyAI={partyAI} onPartyAI={onPartyAI} enemyAI={enemyAI} onEnemyAI={onEnemyAI} />
  if (auto === 'off') {
    return (
      <div className="combat-panel auto-controls">
        {pickers}
        <button type="button" className="combat-button is-small is-auto" onClick={onStart}>
          Auto Combat
        </button>
      </div>
    )
  }
  return (
    <div className="combat-panel auto-controls is-on">
      <span className="auto-status">{auto === 'running' ? 'Auto Combat' : 'Paused'}</span>
      {pickers}
      <div className="auto-row">
        {auto === 'running' ? (
          <button type="button" className="combat-button is-small" onClick={onPause}>
            Pause
          </button>
        ) : (
          <button type="button" className="combat-button is-small" onClick={onResume}>
            Resume
          </button>
        )}
        <button type="button" className="combat-button is-small" onClick={onStop}>
          Stop
        </button>
      </div>
      <div className="auto-row" role="group" aria-label="Speed">
        {AUTO_SPEEDS.map((value) => (
          <button key={value} type="button" className={`auto-speed${speed === value ? ' is-selected' : ''}`} aria-pressed={speed === value} onClick={() => onSpeed(value)}>
            {value}x
          </button>
        ))}
      </div>
    </div>
  )
}
