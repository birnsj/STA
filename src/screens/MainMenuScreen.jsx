import { useState } from 'react'
import background from '../assets/main-menu-background.jpg'
import CoverArt from '../components/CoverArt.jsx'
import ImportCharacterCarousel from '../components/ImportCharacterCarousel.jsx'
import NewCharacterNotice from '../components/NewCharacterNotice.jsx'
import LogoSheen from '../components/LogoSheen.jsx'
import MenuAmbience from '../components/MenuAmbience.jsx'
import Starfield from '../components/Starfield.jsx'

// Accent colours keep each original item's colour from the reference; Import Character, Build Ship and Import Ship are new.
// action: the view to open; popup: a dialog to show over the menu instead. Only enabled items can be selected; the rest are greyed out until built.
// enabled 'afterCharacter' and checkedAfterCharacter wait until at least one confirmed character is saved.
const MENU_ITEMS = [
  { id: 'continue', label: 'Continue', accent: 'blue', action: null, enabled: false },
  { id: 'createCharacter', label: 'Create Character', accent: 'yellow', primary: true, action: 'creator', enabled: true, checkedAfterCharacter: true },
  { id: 'importCharacter', label: 'Import Character', accent: 'cyan', popup: 'import', enabled: 'afterCharacter' },
  { id: 'buildShip', label: 'Build Ship', accent: 'blue', action: 'shipBuilder', enabled: 'afterCharacter' },
  { id: 'importShip', label: 'Import Ship', accent: 'blue', action: null, enabled: false },
  // For now Load Episode picks which combat prototype to test (designer decision).
  { id: 'loadEpisode', label: 'Load Episode', accent: 'red', action: 'episodeSelect', enabled: 'afterCharacter' },
  { id: 'settings', label: 'Settings', accent: 'yellow', action: 'settings', enabled: true },
  { id: 'exit', label: 'Exit', accent: 'red', action: null, enabled: false },
]

// The logo and the painted menu list (1024x576 image coordinates); cropping to fill the window never cuts into these.
const MENU_SAFE_AREA = { left: 40, top: 25, right: 510, bottom: 565 }

const isEnabled = (item, hasSavedCharacter) => (item.enabled === 'afterCharacter' ? hasSavedCharacter : item.enabled)

export default function MainMenuScreen({ width, height, savedCharacters, onOpen, savedCharacterActions }) {
  const hasSavedCharacter = savedCharacters.length > 0
  // UI state: which dialog is over the menu ('newCharacter', 'import', or none).
  const [popup, setPopup] = useState(null)
  const closePopup = () => setPopup(null)

  // Once a character is saved, starting another first tells the player their saved characters are kept.
  const select = (item) => {
    if (item.popup) setPopup(item.popup)
    else if (item.action === 'creator' && hasSavedCharacter) setPopup('newCharacter')
    else onOpen(item.action)
  }

  return (
    <div className="main-menu">
      <CoverArt width={width} height={height} image={background} safeArea={MENU_SAFE_AREA}>
        <Starfield width={width} height={height} />
        <MenuAmbience />
        <LogoSheen image={background} />
        <nav className="main-menu-list" aria-label="Main menu" inert={Boolean(popup)}>
          {MENU_ITEMS.map((item) => {
            const enabled = isEnabled(item, hasSavedCharacter)
            const checked = item.checkedAfterCharacter && hasSavedCharacter
            return (
            <div key={item.id} className={`main-menu-row${enabled ? '' : ' is-disabled'}`}>
              <span className={`main-menu-accent accent-${item.accent}`} aria-hidden="true" />
              <button
                type="button"
                className={`main-menu-button${item.primary ? ' is-primary' : ''}`}
                disabled={!enabled}
                onClick={() => select(item)}
              >
                <span>{item.label}</span>
                {checked && <span className="main-menu-check" aria-label="(complete)">✓</span>}
                <svg className="main-menu-chevron" viewBox="0 0 10 16" aria-hidden="true">
                  <polyline points="2,2 8,8 2,14" />
                </svg>
              </button>
            </div>
            )
          })}
        </nav>
      </CoverArt>
      {/* Dev tools sit in the corner, outside the painted menu list (which has no room for a ninth row). */}
      <button type="button" className="main-menu-dev" inert={Boolean(popup)} onClick={() => onOpen('mapEditor')}>
        Dev Edit
      </button>
      {popup === 'newCharacter' && (
        <NewCharacterNotice savedCount={savedCharacters.length} onContinue={() => onOpen('creator')} onCancel={closePopup} />
      )}
      {popup === 'import' && <ImportCharacterCarousel characters={savedCharacters} {...savedCharacterActions} onCancel={closePopup} />}
    </div>
  )
}
