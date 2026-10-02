import HelpTip from './HelpTip.jsx'

export default function Header({ subtitle = 'Character Creation', subtitleHelpId, onQuit }) {
  return (
    <header className="header">
      <div className="header-brand">
        <svg className="header-emblem" viewBox="0 0 40 56" aria-hidden="true">
          <path d="M20 0 L40 56 L20 42 L0 56 Z" />
        </svg>
        <div>
          <div className="header-title">Starfleet Command</div>
          <div className="header-subtitle"><HelpTip helpId={subtitleHelpId}>{subtitle}</HelpTip></div>
        </div>
      </div>
      <div className="header-bars" aria-hidden="true">
        <span className="bar bar-red bar-wide" />
        <span className="bar bar-yellow" />
        <span className="bar bar-red bar-thin" />
      </div>
      {onQuit && (
        <button type="button" className="header-quit" onClick={onQuit} title="Return to the Main Menu.">
          Quit
        </button>
      )}
      <div className="header-affiliation">
        <div className="header-affiliation-title">United Federation of Planets</div>
        <div className="header-affiliation-motto">Exploration ◆ Diplomacy ◆ Science</div>
      </div>
    </header>
  )
}
