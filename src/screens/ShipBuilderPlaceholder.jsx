import background from '../assets/main-menu-background.jpg'

export default function ShipBuilderPlaceholder({ onBack }) {
  return (
    <div className="ship-builder-placeholder" style={{ backgroundImage: `url(${background})` }}>
      <div className="ship-builder-panel">
        <h1 className="ship-builder-title">Ship Builder</h1>
        <p className="ship-builder-subtitle">Coming Soon</p>
        <button type="button" className="nav-button" onClick={onBack}>
          ← Back
        </button>
      </div>
    </div>
  )
}
