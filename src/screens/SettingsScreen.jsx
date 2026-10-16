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
          <div className="settings-toggles">
            <label className="settings-toggle">
              <span className="settings-toggle-text">
                <span className="settings-slider-label">Guide Highlight</span>
                <span className="settings-option-description">In character creation, a box moves to the next section to fill in.</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={displaySettings.guideHighlight}
                onChange={(event) => onChangeDisplay({ ...displaySettings, guideHighlight: event.target.checked })}
              />
            </label>
            <label className="settings-toggle">
              <span className="settings-toggle-text">
                <span className="settings-slider-label">Help Hints</span>
                <span className="settings-option-description">In combat and exploration, a box above the party cards says what to do next.</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={displaySettings.helpHints}
                onChange={(event) => onChangeDisplay({ ...displaySettings, helpHints: event.target.checked })}
              />
            </label>
            <label className="settings-toggle">
              <span className="settings-toggle-text">
                <span className="settings-slider-label">Fade Walls One at a Time</span>
                <span className="settings-option-description">On the maps, only the wall blocks hiding a character fade, instead of the room's whole front walls.</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={displaySettings.wallFade === 'single'}
                onChange={(event) => onChangeDisplay({ ...displaySettings, wallFade: event.target.checked ? 'single' : 'room' })}
              />
            </label>
            {/* The toggles fill two columns row by row, so this one sits under Help Hints. */}
            <label className="settings-toggle">
              <span className="settings-toggle-text">
                <span className="settings-slider-label">Pulse Objective Tag</span>
                <span className="settings-option-description">On the map, the tag over the object your current objective is on pulses.</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={displaySettings.objectivePulse}
                onChange={(event) => onChangeDisplay({ ...displaySettings, objectivePulse: event.target.checked })}
              />
            </label>
            <label className="settings-toggle">
              <span className="settings-toggle-text">
                <span className="settings-slider-label">Captain&rsquo;s Log Intro</span>
                <span className="settings-option-description">Before a mission, the Captain&rsquo;s Log opening plays. Off goes straight to the map.</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={displaySettings.missionIntro}
                onChange={(event) => onChangeDisplay({ ...displaySettings, missionIntro: event.target.checked })}
              />
            </label>
            <label className="settings-toggle">
              <span className="settings-toggle-text">
                <span className="settings-slider-label">Captain&rsquo;s Log Outro</span>
                <span className="settings-option-description">Once the away team beams out, the Captain&rsquo;s Log mission report plays. Off leaves the mission at once.</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={displaySettings.missionOutro}
                onChange={(event) => onChangeDisplay({ ...displaySettings, missionOutro: event.target.checked })}
              />
            </label>
            <label className="settings-toggle">
              <span className="settings-toggle-text">
                <span className="settings-slider-label">Tooltips</span>
                <span className="settings-option-description">Resting the pointer on a button, icon or value shows a box explaining it.</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={displaySettings.tooltips}
                onChange={(event) => onChangeDisplay({ ...displaySettings, tooltips: event.target.checked })}
              />
            </label>
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
