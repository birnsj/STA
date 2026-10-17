const AUTO_SPEEDS = [1, 2, 4]

// Play triangle — same stroke style as the other minimap corner icons.
const AUTO_ICON = 'M8 5v14l11-7z'

// Auto Combat and speed as minimap-corner toggles (same size as Settings / Camera).
// auto: 'off' | 'running' | 'paused'. Speed only shortens presentation delays; every rule still runs.
// Click Auto to start or stop; click Speed to step 1x → 2x → 4x.
export default function AutoCombatControls({ auto, speed, onStart, onStop, onSpeed }) {
  const on = auto !== 'off'
  const nextSpeed = AUTO_SPEEDS[(AUTO_SPEEDS.indexOf(speed) + 1) % AUTO_SPEEDS.length]
  return (
    <>
      <button
        type="button"
        className="explore-minimap-toggle"
        aria-pressed={on}
        aria-label="Auto Combat"
        title={on ? (auto === 'paused' ? 'Auto Combat paused. Click to stop.' : 'Auto Combat is on. Click to stop.') : 'Auto Combat: the AI plays your party.'}
        onClick={() => (on ? onStop() : onStart())}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={AUTO_ICON} />
        </svg>
      </button>
      <button
        type="button"
        className="explore-minimap-toggle auto-speed-toggle"
        aria-label={`Speed ${speed}x`}
        title={`Speed ${speed}x: click for ${nextSpeed}x (only while Auto Combat is on)`}
        onClick={() => onSpeed(nextSpeed)}
      >
        {speed}x
      </button>
    </>
  )
}
