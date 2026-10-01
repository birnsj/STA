import background from '../assets/main-menu-background.jpg'
import { AUDIO_CATEGORIES } from '../settings/audioSettings.js'
import { SCALE_MODE_OPTIONS } from '../settings/displaySettings.js'

export default function SettingsScreen({ displaySettings, onChangeDisplay, audioSettings, onChangeAudio, onBack }) {
  return (
    <div className="ship-builder-placeholder" style={{ backgroundImage: `url(${background})` }}>
      <div className="ship-builder-panel settings-panel">
        <h1 className="ship-builder-title">Settings</h1>
        <section className="settings-section" aria-labelledby="settings-display">
          <h2 id="settings-display" className="settings-heading">
            Display
          </h2>
          <div className="settings-options" role="radiogroup" aria-labelledby="settings-display">
            {SCALE_MODE_OPTIONS.map((option) => {
              const selected = displaySettings.scaleMode === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`settings-option${selected ? ' is-selected' : ''}`}
                  onClick={() => onChangeDisplay({ ...displaySettings, scaleMode: option.id })}
                >
                  <span className="settings-option-label">{option.label}</span>
                  <span className="settings-option-description">{option.description}</span>
                </button>
              )
            })}
          </div>
        </section>
        <section className="settings-section" aria-labelledby="settings-audio">
          <h2 id="settings-audio" className="settings-heading">
            Audio
          </h2>
          {AUDIO_CATEGORIES.map((category) => (
            <label key={category.id} className="settings-slider">
              <span className="settings-slider-label">{category.label}</span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={audioSettings[category.id]}
                onChange={(event) => onChangeAudio({ ...audioSettings, [category.id]: Number(event.target.value) })}
                style={{ '--fill': `${audioSettings[category.id]}%` }}
              />
              <span className="settings-slider-value">{audioSettings[category.id]}%</span>
            </label>
          ))}
        </section>
        <button type="button" className="nav-button" onClick={onBack}>
          Close
        </button>
      </div>
    </div>
  )
}
