const AUTO_SPEEDS = [1, 2, 4]

// Combat Type 2 Auto Combat controls. auto: 'off' | 'running' | 'paused'. Speed only shortens presentation delays.
export default function AutoControls2({ auto, speed, disabled, onStart, onPause, onResume, onStop, onSpeed }) {
  if (auto === 'off') {
    return (
      <button type="button" className="c2-button is-small" disabled={disabled} onClick={onStart}>
        Auto Combat
      </button>
    )
  }
  return (
    <div className="c2-auto">
      <span className="c2-auto-status">{auto === 'running' ? 'Auto Combat' : 'Paused'}</span>
      {auto === 'running' ? (
        <button type="button" className="c2-button is-small" onClick={onPause}>
          Pause
        </button>
      ) : (
        <button type="button" className="c2-button is-small" onClick={onResume}>
          Resume
        </button>
      )}
      <button type="button" className="c2-button is-small" onClick={onStop}>
        Stop
      </button>
      {AUTO_SPEEDS.map((value) => (
        <button key={value} type="button" className={`c2-auto-speed${speed === value ? ' is-selected' : ''}`} aria-pressed={speed === value} onClick={() => onSpeed(value)}>
          {value}x
        </button>
      ))}
    </div>
  )
}
