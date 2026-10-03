const AUTO_SPEEDS = [0.5, 1, 2, 4]

// auto: 'off' | 'running' | 'paused'. Speed only shortens presentation delays; every rule still runs.
export default function AutoCombatControls({ auto, speed, onStart, onPause, onResume, onStop, onSpeed }) {
  if (auto === 'off') {
    return (
      <div className="combat-panel auto-controls">
        <button type="button" className="combat-button is-small is-auto" onClick={onStart}>
          Auto Combat
        </button>
      </div>
    )
  }
  return (
    <div className="combat-panel auto-controls is-on">
      <span className="auto-status">{auto === 'running' ? 'Auto Combat' : 'Paused'}</span>
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
