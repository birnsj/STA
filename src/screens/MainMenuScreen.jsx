import { useState } from 'react'
import background from '../assets/main-menu-background.jpg'
import CoverArt from '../components/CoverArt.jsx'
import { playtestImportEntries } from '../character/authoredCharacters.js'
import ImportCharacterCarousel from '../components/ImportCharacterCarousel.jsx'
import ImportShipDialog from '../components/ships/ImportShipDialog.jsx'
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
  { id: 'importShip', label: 'Import Ship', accent: 'blue', popup: 'importShip', enabled: false },
  // For now Load Episode picks which combat prototype to test (designer decision).
  { id: 'loadEpisode', label: 'Load Episode', accent: 'red', action: 'episodeSelect', enabled: 'afterCharacter' },
  { id: 'settings', label: 'Settings', accent: 'yellow', action: 'settings', enabled: true },
  { id: 'exit', label: 'Exit', accent: 'red', action: null, enabled: false },
]

// The logo and the painted menu list (1024x576 image coordinates); cropping to fill the window never cuts into these.
const MENU_SAFE_AREA = { left: 40, top: 25, right: 510, bottom: 565 }

const isEnabled = (item, hasSavedCharacter) => (item.enabled === 'afterCharacter' ? hasSavedCharacter : item.enabled)

export default function MainMenuScreen({ width, height, savedCharacters, savedShips = [], onOpen, savedCharacterActions, savedShipActions }) {
  const hasSavedCharacter = savedCharacters.length > 0
  const savedIds = new Set(savedCharacters.map((entry) => entry.id))
  const importCharacters = [...savedCharacters, ...playtestImportEntries().filter((entry) => !savedIds.has(entry.id))]
  // UI state: which dialog is over the menu ('newCharacter', 'import', or none).
  const [popup, setPopup] = useState(null)
  const closePopup = () => setPopup(null)

  // Once a character is saved, starting another first tells the player their saved characters are kept.
  const select = (item) => {
    if (item.popup) setPopup(item.popup)
    else if (item.action === 'creator' && hasSavedCharacter) setPopup('newCharacter')
    else if (item.action === 'shipBuilder' && savedShips.length > 0) setPopup('newShip')
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
            const enabled = item.id === 'importCharacter'
              ? importCharacters.length > 0
              : item.id === 'importShip'
                ? savedShips.length > 0
                : isEnabled(item, hasSavedCharacter)
            const checked = (item.checkedAfterCharacter && hasSavedCharacter) || (item.id === 'buildShip' && savedShips.length > 0)
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
      {popup === 'newShip' && (
        <div className="menu-notice-backdrop">
          <div className="ship-builder-panel menu-notice" role="alertdialog" aria-modal="true" aria-labelledby="new-ship-notice-title">
            <h2 id="new-ship-notice-title" className="menu-notice-title">New Ship</h2>
            <p className="menu-notice-text">
              You already have {savedShips.length} saved ship{savedShips.length === 1 ? '' : 's'}. Starting a new ship will not replace {savedShips.length === 1 ? 'it' : 'them'};
              every confirmed ship stays saved.
            </p>
            <div className="menu-notice-actions">
              <button type="button" className="nav-button nav-back" onClick={closePopup}>
                Cancel
              </button>
              <button type="button" className="nav-button nav-next" onClick={() => onOpen('shipBuilder')} autoFocus>
                Build New Ship →
              </button>
            </div>
          </div>
        </div>
      )}
      {popup === 'import' && <ImportCharacterCarousel characters={importCharacters} {...savedCharacterActions} onCancel={closePopup} />}
      {popup === 'importShip' && (
        <ImportShipDialog ships={savedShips} {...savedShipActions} onCancel={closePopup} />
      )}
    </div>
  )
}
