import { useRef, useState } from 'react'
import { ENEMY_AIS, PARTY_AIS } from '../combat/autoCombat.js'
import { AUDIO_CATEGORIES } from '../settings/audioSettings.js'
import { SCALE_MODE_OPTIONS } from '../settings/displaySettings.js'

// The stage is CSS-scaled. Chrome maps a range drag in unscaled coordinates, so the thumb does not follow the pointer.
// The pointer's position on the control's real box is the value.
function valueFromPointer(input, clientX) {
  const rect = input.getBoundingClientRect()
  if (!rect.width) return Number(input.value)
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  return Math.round(ratio * 100)
}

export default function SettingsScreen({ displaySettings, onChangeDisplay, audioSettings, onChangeAudio, onSave, onBack }) {
  const [saved, setSaved] = useState(false)
  // Any change to a setting clears the "Saved" mark. Compared during render (React's pattern for state that follows a
  // prop) so there is no extra render pass after the change.
  const [shown, setShown] = useState({ displaySettings, audioSettings })
  if (shown.displaySettings !== displaySettings || shown.audioSettings !== audioSettings) {
    setShown({ displaySettings, audioSettings })
    setSaved(false)
  }
  return (
    <div className="settings-screen">
      <div className="settings-panel">
      <header className="settings-header">
        <h1>Settings</h1>
      </header>
      <div className="settings-body">
        <section className="settings-column" aria-labelledby="settings-display">
          <h2 id="settings-display" className="ui-heading">Display</h2>
          <div className="settings-options" role="radiogroup" aria-labelledby="settings-display">
            {SCALE_MODE_OPTIONS.map((option) => {
              const selected = displaySettings.scaleMode === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`settings-option ui-row${selected ? ' is-selected' : ''}`}
                  onClick={() => onChangeDisplay({ ...displaySettings, scaleMode: option.id })}
                >
                  <span className="settings-option-label">{option.label}</span>
                  <span className="settings-option-description">{option.description}</span>
                </button>
              )
            })}
          </div>
          <h2 id="settings-audio" className="ui-heading">Audio</h2>
          <div className="settings-audio">
            {AUDIO_CATEGORIES.map((category) => (
              <SettingsSlider
                key={category.id}
                label={category.label}
                value={audioSettings[category.id]}
                onChange={(next) => onChangeAudio({ ...audioSettings, [category.id]: next })}
              />
            ))}
            <SettingsSlider
              label="Sensitivity"
              title="WASD after glide: how far the camera keeps sliding after you release the keys. 100% is full coast; 0% stops at once."
              value={displaySettings.wasdCoast}
              onChange={(wasdCoast) => onChangeDisplay({ ...displaySettings, wasdCoast })}
            />
          </div>
          <h2 id="settings-combat" className="ui-heading">Combat</h2>
          <div className="settings-ai" role="group" aria-labelledby="settings-combat">
            <AISelect
              label="Party AI"
              title="How your party plays during Auto Combat."
              options={PARTY_AIS}
              value={displaySettings.partyAI}
              onChange={(partyAI) => onChangeDisplay({ ...displaySettings, partyAI })}
            />
            <AISelect
              label="Enemy AI"
              title="How enemies play every fight, not only Auto Combat."
              options={ENEMY_AIS}
              value={displaySettings.enemyAI}
              onChange={(enemyAI) => onChangeDisplay({ ...displaySettings, enemyAI })}
            />
          </div>
          <div className="settings-switches" aria-label="Display switches">
            <Toggle label="Guide Highlight" description="In character creation, a box moves to the next section to fill in." checked={displaySettings.guideHighlight} onChange={(checked) => onChangeDisplay({ ...displaySettings, guideHighlight: checked })} />
            <Toggle label="Help Hints" description="A box above the party cards says what to do next, and How to Play opens on the first fight." checked={displaySettings.helpHints} onChange={(checked) => onChangeDisplay({ ...displaySettings, helpHints: checked })} />
            <Toggle label="Fade Walls One at a Time" description="Only the wall blocks hiding a character fade, instead of the room's whole front walls." checked={displaySettings.wallFade === 'single'} onChange={(checked) => onChangeDisplay({ ...displaySettings, wallFade: checked ? 'single' : 'room' })} />
            <Toggle label="Pulse Objective Tag" description="The tag over the object your current objective is on pulses." checked={displaySettings.objectivePulse} onChange={(checked) => onChangeDisplay({ ...displaySettings, objectivePulse: checked })} />
            <Toggle label="Captain's Log Intro" description="Before a mission, the Captain's Log opening plays. Off goes straight to the map." checked={displaySettings.missionIntro} onChange={(checked) => onChangeDisplay({ ...displaySettings, missionIntro: checked })} />
            <Toggle label="Captain's Log Outro" description="Once the away team beams out, the mission report plays. Off leaves the mission at once." checked={displaySettings.missionOutro} onChange={(checked) => onChangeDisplay({ ...displaySettings, missionOutro: checked })} />
            <Toggle label="Tooltips" description="Resting the pointer on a button, icon or value shows a box explaining it." checked={displaySettings.tooltips} onChange={(checked) => onChangeDisplay({ ...displaySettings, tooltips: checked })} />
            <Toggle label="Camera Follow" description="Combat and exploration start with the view following the acting character." checked={displaySettings.cameraFollow} onChange={(checked) => onChangeDisplay({ ...displaySettings, cameraFollow: checked })} />
            <Toggle label="Item Placement Box" description="Shows the green or red footprint while positioning an inventory object on the map." checked={displaySettings.itemPlacementPreview} onChange={(checked) => onChangeDisplay({ ...displaySettings, itemPlacementPreview: checked })} />
          </div>
        </section>
      </div>
      <div className="settings-actions">
        <button type="button" className="nav-button" onClick={onBack}>
          Close
        </button>
        <button type="button" className={`nav-button nav-next${saved ? '' : ' is-advance'}`} onClick={() => { onSave(); setSaved(true) }}>
          {saved ? 'Saved' : 'Save Settings'}
        </button>
      </div>
      </div>
    </div>
  )
}

function SettingsSlider({ label, value, onChange, title }) {
  // Set while a pointer drag is in progress, including the native change event that follows pointerup.
  const pointerX = useRef(null)
  const apply = (input, clientX) => {
    const next = valueFromPointer(input, clientX)
    if (next !== value) onChange(next)
  }
  return (
    <label className="settings-slider ui-row" title={title}>
      <span className="settings-slider-label">{label}</span>
      <input
        type="range"
        min="0"
        max="100"
        step="1"
        value={value}
        aria-label={label}
        style={{ '--fill': `${value}%` }}
        onPointerDown={(event) => {
          pointerX.current = event.clientX
          try {
            event.currentTarget.setPointerCapture(event.pointerId)
          } catch {
            // A pointer the browser has already released cannot be captured; the down position still counts.
          }
          apply(event.currentTarget, event.clientX)
        }}
        onPointerMove={(event) => {
          if (pointerX.current === null || event.buttons === 0) return
          pointerX.current = event.clientX
          apply(event.currentTarget, event.clientX)
        }}
        onPointerUp={() => {
          queueMicrotask(() => {
            pointerX.current = null
          })
        }}
        onPointerCancel={() => {
          pointerX.current = null
        }}
        onKeyDown={() => {
          pointerX.current = null
        }}
        onChange={(event) => {
          const input = event.target
          const next = pointerX.current === null ? Number(input.value) : valueFromPointer(input, pointerX.current)
          if (next !== value) onChange(next)
        }}
      />
      <span className="settings-slider-value">{value}%</span>
    </label>
  )
}

function Toggle({ label, description, checked, onChange }) {
  return (
    <label className="settings-toggle ui-row">
      <span className="settings-toggle-text">
        <span className="settings-slider-label">{label}</span>
        <span className="settings-option-description">{description}</span>
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  )
}

function AISelect({ label, title, options, value, onChange }) {
  return (
    <label className="settings-ai-picker ui-row" title={title}>
      <span className="settings-slider-label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
        {options.map((ai) => (
          <option key={ai.id} value={ai.id}>
            {ai.name}
          </option>
        ))}
      </select>
    </label>
  )
}
